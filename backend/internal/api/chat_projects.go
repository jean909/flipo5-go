package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// listChatProjects returns all chat projects for the current user.
func (s *Server) listChatProjects(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	list, err := s.DB.ListChatProjects(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []store.ChatProject{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": list})
}

// createChatProject creates a new project (name + optional instructions).
func (s *Server) createChatProject(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		Name         string `json:"name"`
		Instructions string `json:"instructions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		return
	}
	id, err := s.DB.CreateChatProject(r.Context(), userID, body.Name, body.Instructions)
	if err != nil {
		http.Error(w, `{"error":"create failed"}`, http.StatusInternalServerError)
		return
	}
	p, _ := s.DB.GetChatProject(r.Context(), id, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"project": p})
}

// getChatProject returns a project + its files + its threads.
func (s *Server) getChatProject(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	p, err := s.DB.GetChatProject(r.Context(), id, userID)
	if err != nil {
		http.Error(w, `{"error":"lookup failed"}`, http.StatusInternalServerError)
		return
	}
	if p == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	files, _ := s.DB.ListChatProjectFiles(r.Context(), id, userID)
	threads, _ := s.DB.ListChatProjectThreads(r.Context(), id, userID)
	if files == nil {
		files = []store.ChatProjectFile{}
	}
	if threads == nil {
		threads = []store.Thread{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project": p,
		"files":   files,
		"threads": threads,
	})
}

// updateChatProject patches name and/or instructions.
func (s *Server) updateChatProject(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Name         *string `json:"name"`
		Instructions *string `json:"instructions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.UpdateChatProject(r.Context(), id, userID, body.Name, body.Instructions); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	p, _ := s.DB.GetChatProject(r.Context(), id, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"project": p})
}

// deleteChatProject removes a project (cascades files; threads keep their data, lose link).
func (s *Server) deleteChatProject(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.DeleteChatProject(r.Context(), id, userID); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// listChatProjectFiles returns all files for a project.
func (s *Server) listChatProjectFiles(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	files, err := s.DB.ListChatProjectFiles(r.Context(), id, userID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}
	if files == nil {
		files = []store.ChatProjectFile{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"files": files})
}

// addChatProjectFile attaches an already-uploaded file (URL) to a project.
// Frontend uploads via /api/upload first, then calls this with the resulting URL.
func (s *Server) addChatProjectFile(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		FileURL     string `json:"file_url"`
		FileName    string `json:"file_name"`
		ContentType string `json:"content_type"`
		SizeBytes   *int64 `json:"size_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	body.FileURL = strings.TrimSpace(body.FileURL)
	if body.FileURL == "" {
		http.Error(w, `{"error":"file_url required"}`, http.StatusBadRequest)
		return
	}
	f, err := s.DB.AddChatProjectFile(r.Context(), id, userID, body.FileURL, body.FileName, body.ContentType, body.SizeBytes)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add file failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"file": f})
}

// deleteChatProjectFile removes a file from a project (does not delete the storage object).
func (s *Server) deleteChatProjectFile(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	fileID, err := uuid.Parse(chi.URLParam(r, "fileId"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.DeleteChatProjectFile(r.Context(), fileID, userID); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
