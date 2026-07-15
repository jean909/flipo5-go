package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.DB.GetAdminStats(r.Context())
	if err != nil {
		http.Error(w, `{"error":"stats failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *Server) adminListUsers(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	list, total, err := s.DB.ListUsers(r.Context(), limit, offset, search)
	if err != nil {
		http.Error(w, `{"error":"list users failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"users": list, "total": total})
}

func (s *Server) adminGetUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	u, err := s.DB.UserByID(r.Context(), id)
	if err != nil || u == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	// Job and thread counts for this user
	var jobCount, threadCount int
	_ = s.DB.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM jobs WHERE user_id = $1`, id).Scan(&jobCount)
	_ = s.DB.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM threads WHERE user_id = $1`, id).Scan(&threadCount)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user":         u,
		"job_count":    jobCount,
		"thread_count": threadCount,
	})
}

func (s *Server) adminListJobs(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	jobType := strings.TrimSpace(r.URL.Query().Get("type"))
	userIDStr := strings.TrimSpace(r.URL.Query().Get("user_id"))
	var userID *uuid.UUID
	if userIDStr != "" {
		if id, err := uuid.Parse(userIDStr); err == nil {
			userID = &id
		}
	}
	list, total, err := s.DB.ListJobsAdmin(r.Context(), limit, offset, userID, status, jobType)
	if err != nil {
		http.Error(w, `{"error":"list jobs failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"jobs": list, "total": total})
}
