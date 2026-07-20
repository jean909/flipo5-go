package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"flipo5/backend/internal/middleware"

	"github.com/google/uuid"
)

func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		http.Error(w, `{"error":"upload not configured"}`, http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	const maxSize = 50 << 20 // 50 MB per file (video up to 8.7s)
	if err := r.ParseMultipartForm(maxSize * 5); err != nil {
		http.Error(w, `{"error":"multipart too large"}`, http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		http.Error(w, `{"error":"no files"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	var urls []string
	for _, fh := range files {
		if fh.Size > maxSize {
			log.Printf("upload skip %s: size %d > max %d", fh.Filename, fh.Size, maxSize)
			continue
		}
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if ext == "" {
			ext = ".bin"
		}
		key := fmt.Sprintf("uploads/%s/%s%s", userID.String(), uuid.New().String(), ext)
		file, err := fh.Open()
		if err != nil {
			log.Printf("upload open %s: %v", fh.Filename, err)
			continue
		}
		contentType := fh.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		_, err = s.Store.Put(ctx, key, file, contentType)
		file.Close()
		if err != nil {
			log.Printf("upload store %s: %v", fh.Filename, err)
			continue
		}
	urls = append(urls, s.Store.URL(key))
	}
	if len(urls) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "upload failed (file too large or invalid)"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"urls": urls})
}

// ensureThread returns threadID for job. If threadID param is valid, uses it; otherwise creates new (normal or ephemeral).
func (s *Server) ensureThread(ctx context.Context, w http.ResponseWriter, userID uuid.UUID, threadIDParam string, incognito bool) (threadID *uuid.UUID, created bool) {
	if threadIDParam != "" {
		if id, err := uuid.Parse(threadIDParam); err == nil {
			if t, _ := s.DB.GetThreadForUser(ctx, id, userID); t != nil {
				return &id, false
			}
		}
	}
	ephemeral := incognito
	id, err := s.DB.CreateThread(ctx, userID, ephemeral)
	if err != nil {
		log.Printf("create thread failed: %v", err)
		http.Error(w, `{"error":"create thread"}`, http.StatusInternalServerError)
		return nil, false
	}
	return &id, true
}
