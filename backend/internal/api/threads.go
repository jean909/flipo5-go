package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) listThreads(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	archived := r.URL.Query().Get("archived") == "true"
	ctx := r.Context()
	cacheKey := "threads:" + userID.String() + ":archived:" + strconv.FormatBool(archived)
	if s.Cache != nil {
		if b, _ := s.Cache.Get(ctx, cacheKey); len(b) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
	}
	threads, err := s.DB.ListThreads(ctx, userID, 50, archived)
	if err != nil {
		http.Error(w, `{"error":"list threads"}`, http.StatusInternalServerError)
		return
	}
	out := map[string]interface{}{"threads": threads}
	if s.Cache != nil {
		if b, err := json.Marshal(out); err == nil {
			_ = s.Cache.Set(ctx, cacheKey, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) patchThread(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	var body struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	thread, _ := s.DB.GetThreadForUser(r.Context(), id, userID)
	if thread == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	switch body.Action {
	case "archive":
		active, _ := s.DB.ThreadHasActiveJobs(r.Context(), id)
		if active {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "has_active_jobs", "message": "Cannot archive while content is being generated."})
			return
		}
		if err := s.DB.ArchiveThread(r.Context(), id, userID); err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"archive failed"}`, http.StatusInternalServerError)
			return
		}
		s.invalidateThreadCache(r.Context(), id, userID)
	case "unarchive":
		if err := s.DB.UnarchiveThread(r.Context(), id, userID); err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"unarchive failed"}`, http.StatusInternalServerError)
			return
		}
	case "delete":
		active, _ := s.DB.ThreadHasActiveJobs(r.Context(), id)
		if active {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "has_active_jobs", "message": "Cannot delete while content is being generated."})
			return
		}
		if err := s.DB.DeleteThread(r.Context(), id, userID); err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
			return
		}
		s.invalidateThreadCache(r.Context(), id, userID)
	default:
		http.Error(w, `{"error":"invalid action"}`, http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) getThread(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	cacheKey := "thread:" + userID.String() + ":" + id.String()
	if s.Cache != nil {
		if b, _ := s.Cache.Get(ctx, cacheKey); len(b) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
	}
	var thread *store.Thread
	var jobs []store.Job
	var threadErr, jobsErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		t, e := s.DB.GetThreadForUser(ctx, id, userID)
		thread, threadErr = t, e
	}()
	go func() {
		defer wg.Done()
		j, e := s.DB.ListJobsByThread(ctx, id, userID)
		jobs, jobsErr = j, e
	}()
	wg.Wait()
	if threadErr != nil || thread == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if jobsErr != nil {
		http.Error(w, `{"error":"list jobs"}`, http.StatusInternalServerError)
		return
	}
	if jobs == nil {
		jobs = []store.Job{}
	}
	out := map[string]interface{}{"thread": thread, "jobs": jobs}
	if s.Cache != nil {
		if b, err := json.Marshal(out); err == nil {
			_ = s.Cache.Set(ctx, cacheKey, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}
