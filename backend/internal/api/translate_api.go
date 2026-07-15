package api

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) createTranslate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxTranslateBodyBytes)
	defer r.Body.Close()
	var req struct {
		SourceURL    string   `json:"source_url"`
		SourceText   string   `json:"source_text"`
		SourceImages []string `json:"source_images"`
		SourceAudio  string   `json:"source_audio"`
		SourceLang   string   `json:"source_lang"`
		TargetLang   string   `json:"target_lang"`
		ProjectID    string   `json:"project_id"`
		ItemID       string   `json:"item_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	sourceURL := strings.TrimSpace(req.SourceURL)
	sourceText := strings.TrimSpace(req.SourceText)
	sourceAudio := strings.TrimSpace(req.SourceAudio)
	var sourceImages []string
	for _, u := range req.SourceImages {
		if u := strings.TrimSpace(u); u != "" {
			sourceImages = append(sourceImages, u)
		}
	}
	if len(sourceImages) > maxTranslateImages {
		sourceImages = sourceImages[:maxTranslateImages]
	}
	hasSource := sourceURL != "" || sourceText != "" || len(sourceImages) > 0 || sourceAudio != ""
	if !hasSource {
		http.Error(w, `{"error":"source_url, source_text, source_images or source_audio required"}`, http.StatusBadRequest)
		return
	}
	if len(sourceText) > maxTranslateSourceTextLen {
		http.Error(w, `{"error":"source_text too long"}`, http.StatusBadRequest)
		return
	}
	if sourceURL != "" {
		if len(sourceURL) > maxTranslateSourceURLLen {
			http.Error(w, `{"error":"source_url too long"}`, http.StatusBadRequest)
			return
		}
		if _, err := url.ParseRequestURI(sourceURL); err != nil {
			http.Error(w, `{"error":"invalid source_url"}`, http.StatusBadRequest)
			return
		}
	}
	if sourceAudio != "" {
		if len(sourceAudio) > maxTranslateSourceURLLen {
			http.Error(w, `{"error":"source_audio url too long"}`, http.StatusBadRequest)
			return
		}
		if _, err := url.ParseRequestURI(sourceAudio); err != nil {
			http.Error(w, `{"error":"invalid source_audio url"}`, http.StatusBadRequest)
			return
		}
	}
	targetLang := strings.TrimSpace(req.TargetLang)
	if targetLang == "" {
		targetLang = "English"
	}
	if len(targetLang) > 50 {
		targetLang = targetLang[:50]
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	input := map[string]interface{}{
		"source_url":  sourceURL,
		"source_text": sourceText,
		"source_lang": strings.TrimSpace(req.SourceLang),
		"target_lang": targetLang,
	}
	if len(sourceImages) > 0 {
		input["source_images"] = sourceImages
	}
	if sourceAudio != "" {
		input["source_audio"] = sourceAudio
	}
	if req.ProjectID != "" {
		input["project_id"] = req.ProjectID
	}
	if req.ItemID != "" {
		input["item_id"] = req.ItemID
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "translate", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	itemIDStr := strings.TrimSpace(req.ItemID)
	if itemIDStr != "" {
		if itemUUID, err := uuid.Parse(itemIDStr); err == nil {
			_ = s.DB.SetTranslationItemRunning(ctx, itemUUID, jobID)
		}
	}
	task, _ := queue.NewTranslateTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) listTranslationProjects(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	list, err := s.DB.ListTranslationProjects(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []store.TranslationProject{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": list})
}

func (s *Server) createTranslationProject(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string `json:"name"`
		SourceLang string `json:"source_lang"`
		TargetLang string `json:"target_lang"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	// Translation projects (translation_projects table) — separate from Edit Studio projects (projects table).
	targetLang := strings.TrimSpace(req.TargetLang)
	id, err := s.DB.CreateTranslationProject(r.Context(), userID, name, strings.TrimSpace(req.SourceLang), targetLang)
	if err != nil {
		log.Printf("[createTranslationProject] %v", err)
		msg := "create failed"
		if strings.Contains(err.Error(), "does not exist") || strings.Contains(err.Error(), "relation") {
			msg = "create failed: translation tables missing. Restart backend to run migrations."
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": msg})
		return
	}
	if targetLang != "" {
		s.recordUserProfile(userID, "translation_project", map[string]interface{}{"target_lang": targetLang})
	} else {
		s.recordUserProfile(userID, "translation_project", nil)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
}

func (s *Server) getTranslationProject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	var project *store.TranslationProject
	var items []store.TranslationItem
	var projectErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		p, e := s.DB.GetTranslationProject(ctx, projectID, userID)
		project, projectErr = p, e
	}()
	go func() {
		defer wg.Done()
		it, _ := s.DB.ListTranslationItems(ctx, projectID)
		items = it
	}()
	wg.Wait()
	if projectErr != nil || project == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if items == nil {
		items = []store.TranslationItem{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"project": project, "items": items})
}

func (s *Server) addTranslationItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	project, err := s.DB.GetTranslationProject(r.Context(), projectID, userID)
	if err != nil || project == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	var req struct {
		SourceType  string `json:"source_type"`
		SourceValue string `json:"source_value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	sourceType := strings.TrimSpace(req.SourceType)
	if sourceType != "url" && sourceType != "text" && sourceType != "image" && sourceType != "audio" {
		sourceType = "text"
	}
	sourceValue := strings.TrimSpace(req.SourceValue)
	if sourceValue == "" {
		http.Error(w, `{"error":"source_value required"}`, http.StatusBadRequest)
		return
	}
	items, _ := s.DB.ListTranslationItems(r.Context(), projectID)
	sortOrder := len(items)
	itemID, err := s.DB.AddTranslationItem(r.Context(), projectID, sourceType, sourceValue, sortOrder)
	if err != nil {
		http.Error(w, `{"error":"add failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": itemID.String()})
}

func (s *Server) deleteTranslationItem(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if err := s.DB.DeleteTranslationItem(r.Context(), itemID, userID); err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}
