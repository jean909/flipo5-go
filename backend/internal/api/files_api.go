package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) renameFile(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if err := s.DB.RenameUserFile(r.Context(), id, userID, strings.TrimSpace(req.Name)); err != nil {
		http.Error(w, `{"error":"rename failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) listFiles(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	files, err := s.DB.ListUserFiles(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"list files"}`, http.StatusInternalServerError)
		return
	}
	if files == nil {
		files = []store.UserFile{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"files": files})
}

func (s *Server) getFile(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	f, err := s.DB.GetUserFile(r.Context(), id, userID)
	if err != nil || f == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	// Download as .txt
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+f.Name+`.txt"`)
		w.Write([]byte(f.Content))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(f)
}

func (s *Server) deleteFile(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if err := s.DB.DeleteUserFile(r.Context(), id, userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}
