package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

func (s *Server) listJobs(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	jobs, err := s.DB.ListJobs(r.Context(), userID, 50)
	if err != nil {
		http.Error(w, `{"error":"list jobs"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs})
}

func (s *Server) listContent(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 50 {
			limit = v
		}
	}
	typeFilter := strings.TrimSpace(r.URL.Query().Get("type"))
	if typeFilter != "" && typeFilter != "image" && typeFilter != "video" && typeFilter != "logo" && typeFilter != "audio" {
		typeFilter = ""
	}
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	offset := (page - 1) * limit
	ctx := r.Context()
	cacheKey := "content:" + userID.String() + ":" + strconv.Itoa(offset) + ":" + strconv.Itoa(limit) + ":" + typeFilter + ":" + search
	if s.Cache != nil {
		if b, _ := s.Cache.Get(ctx, cacheKey); len(b) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
	}
	jobs, total, err := s.DB.ListContentJobs(ctx, userID, offset, limit, typeFilter, search)
	if err != nil {
		http.Error(w, `{"error":"list content"}`, http.StatusInternalServerError)
		return
	}
	out := map[string]interface{}{"jobs": jobs, "total": total, "page": page, "limit": limit}
	if s.Cache != nil {
		if b, err := json.Marshal(out); err == nil {
			_ = s.Cache.Set(ctx, cacheKey, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) addContentFromURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}
	var body struct {
		URL  string `json:"url"`
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "url required"})
		return
	}
	if body.Type != "image" && body.Type != "video" {
		body.Type = "image"
	}
	jobID, err := s.DB.CreateCompletedJobFromURL(r.Context(), userID, body.URL, body.Type)
	if err != nil {
		log.Printf("addContentFromURL: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to add to collection"})
		return
	}
	s.invalidateContentCache(r.Context(), userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) getJob(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	job, err := s.DB.GetJobForUser(r.Context(), id, userID)
	if err != nil || job == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func (s *Server) setJobFeedback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		Rating *string `json:"rating"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	rating := ""
	if body.Rating != nil && (*body.Rating == "like" || *body.Rating == "dislike") {
		rating = *body.Rating
	}
	if err := s.DB.UpdateJobRating(r.Context(), id, userID, rating); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) cancelJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	job, err := s.DB.GetJobForUser(r.Context(), id, userID)
	if err != nil || job == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if job.Status != "pending" && job.Status != "running" {
		http.Error(w, `{"error":"job cannot be cancelled"}`, http.StatusBadRequest)
		return
	}
	if job.ReplicateID != nil && *job.ReplicateID != "" && s.Repl != nil {
		_ = s.Repl.CancelPrediction(r.Context(), *job.ReplicateID)
	}
	if err := s.DB.SetJobCancelled(r.Context(), id, userID, "Cancelled by user"); err != nil {
		http.Error(w, `{"error":"cancel failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) retryJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	job, err := s.DB.GetJobForUser(r.Context(), id, userID)
	if err != nil || job == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if job.Status != "failed" {
		http.Error(w, `{"error":"only failed jobs can be retried"}`, http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var input map[string]interface{}
	if len(job.Input) > 0 {
		if err := json.Unmarshal(job.Input, &input); err != nil {
			http.Error(w, `{"error":"invalid job input"}`, http.StatusBadRequest)
			return
		}
	}
	if input == nil {
		input = make(map[string]interface{})
	}
	newJobID, err := s.DB.CreateJob(ctx, userID, job.Type, input, job.ThreadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, job.Type, nil)
	var task *asynq.Task
	switch job.Type {
	case "chat":
		prompt, _ := input["prompt"].(string)
		task, _ = queue.NewChatTask(newJobID, prompt)
	case "image":
		task, _ = queue.NewImageTask(newJobID)
	case "video":
		task, _ = queue.NewVideoTask(newJobID)
	case "upscale":
		task, _ = queue.NewUpscaleTask(newJobID)
	default:
		http.Error(w, `{"error":"unsupported job type"}`, http.StatusBadRequest)
		return
	}
	if task == nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateContentCache(ctx, userID)
	if job.ThreadID != nil {
		s.invalidateThreadCache(ctx, *job.ThreadID, userID)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": newJobID.String()})
}

const (
	maxSEOBodyBytes           = 1 << 20 // 1MB
	maxSEOSourceTextLen       = 400_000 // ~400KB text
	maxSEOSourceURLLen        = 2048
	maxTranslateBodyBytes     = 2 << 20 // 2MB (allow images list)
	maxTranslateSourceTextLen = 100_000 // ~100KB per job
	maxTranslateSourceURLLen  = 2048
	maxTranslateImages        = 10
)
