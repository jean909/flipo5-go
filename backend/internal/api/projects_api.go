package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	repgo "github.com/replicate/replicate-go"
)

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	list, err := s.DB.ListProjects(r.Context(), userID, limit)
	if err != nil {
		http.Error(w, `{"error":"list projects"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": list})
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		body.Name = "Untitled"
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Untitled"
	}
	id, err := s.DB.CreateProject(r.Context(), userID, name)
	if err != nil {
		log.Printf("[createProject] user=%s name=%q err=%v", userID, name, err)
		if errors.Is(err, store.ErrProjectNameExists) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "name exists"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	log.Printf("[createProject] ok id=%s user=%s", id, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id.String(), "name": name})
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	p, err := s.DB.GetProject(r.Context(), projectID, userID)
	if err != nil || p == nil {
		if owner, ok := s.DB.GetProjectOwner(r.Context(), projectID); ok {
			log.Printf("[getProject] notFound project=%s requestUser=%s projectOwner=%s (user_id mismatch)", projectID, userID, owner)
		} else {
			log.Printf("[getProject] notFound project=%s user=%s err=%v", projectID, userID, err)
		}
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	items, errItems := s.DB.ListProjectItems(r.Context(), projectID, userID)
	if errItems != nil {
		log.Printf("[getProject] ListProjectItems failed project=%s err=%v", projectID, errItems)
		items = nil
	} else {
		log.Printf("[getProject] ok project=%s items=%d", projectID, len(items))
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]interface{}{"project": p, "items": items})
}

func (s *Server) updateProject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.UpdateProject(r.Context(), projectID, userID, strings.TrimSpace(body.Name)); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrProjectNameExists) {
			http.Error(w, `{"error":"name exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := s.DB.DeleteProject(r.Context(), projectID, userID); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) addProjectItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		Type      string     `json:"type"` // image, video
		SourceURL string     `json:"source_url"`
		JobID     *uuid.UUID `json:"job_id,omitempty"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if body.Type != "image" && body.Type != "video" {
		body.Type = "image"
	}
	// Allow full URLs (http/https) or relative storage keys (e.g. uploads/user-id/uuid.jpg from My Content)
	sourceURL := strings.TrimSpace(body.SourceURL)
	if sourceURL == "" || strings.Contains(sourceURL, "..") || strings.ContainsAny(sourceURL, "\n\r") {
		http.Error(w, `{"error":"invalid source_url"}`, http.StatusBadRequest)
		return
	}
	itemID, err := s.DB.AddProjectItem(r.Context(), projectID, userID, body.Type, sourceURL, body.JobID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add item failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": itemID.String()})
}

func (s *Server) uploadProjectItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	log.Printf("[studio upload] request project=%s", idStr)
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		log.Printf("[studio upload] invalid project id: %v", err)
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		log.Printf("[studio upload] unauthorized")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if s.Store == nil {
		log.Printf("[studio upload] store not configured")
		http.Error(w, `{"error":"upload not configured"}`, http.StatusServiceUnavailable)
		return
	}
	const maxSize = 50 << 20 // 50 MB
	if err := r.ParseMultipartForm(maxSize * 2); err != nil {
		log.Printf("[studio upload] parse multipart: %v", err)
		http.Error(w, `{"error":"multipart too large"}`, http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		files = r.MultipartForm.File["files"]
	}
	if len(files) == 0 {
		log.Printf("[studio upload] no file in form")
		http.Error(w, `{"error":"no file"}`, http.StatusBadRequest)
		return
	}
	log.Printf("[studio upload] files=%d project=%s user=%s", len(files), projectID, userID)
	ctx := r.Context()
	var itemType string
	var itemID uuid.UUID
	for _, fh := range files {
		if fh.Size > maxSize {
			log.Printf("[studio upload] skip %s: size %d > max %d", fh.Filename, fh.Size, maxSize)
			continue
		}
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if ext == "" {
			ext = ".bin"
		}
		contentType := fh.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "video/") {
			itemType = "video"
		} else {
			itemType = "image"
		}
		key := fmt.Sprintf("uploads/%s/%s%s", userID.String(), uuid.New().String(), ext)
		log.Printf("[studio upload] processing %s type=%s key=%s size=%d", fh.Filename, itemType, key, fh.Size)
		file, err := fh.Open()
		if err != nil {
			log.Printf("[studio upload] open file %s: %v", fh.Filename, err)
			continue
		}
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		_, err = s.Store.Put(ctx, key, file, contentType)
		file.Close()
		if err != nil {
			log.Printf("[studio upload] Store.Put %s: %v", fh.Filename, err)
			continue
		}
		url := s.Store.URL(key)
		log.Printf("[studio upload] Put ok url=%s", url)
		itemID, err = s.DB.AddProjectItem(ctx, projectID, userID, itemType, url, nil)
		if err != nil {
			log.Printf("[studio upload] AddProjectItem: %v", err)
			http.Error(w, `{"error":"add item failed"}`, http.StatusInternalServerError)
			return
		}
		log.Printf("[studio upload] success item=%s url=%s", itemID, url)
		// Return full item for optimistic UI (avoids getProject cache/race issues)
		item := map[string]interface{}{
			"id":          itemID.String(),
			"project_id":  projectID.String(),
			"type":        itemType,
			"source_url":  url,
			"latest_url":  url,
			"sort_order":  0,
			"created_at":  time.Now().Format(time.RFC3339),
			"version_num": 0,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"id": itemID.String(), "item": item})
		return
	}
	if itemID == uuid.Nil {
		log.Printf("[studio upload] no item created (all files skipped or failed)")
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": itemID.String()})
}

func (s *Server) removeProjectItem(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := s.DB.RemoveProjectItem(r.Context(), itemID, userID); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"remove failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) listProjectVersions(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	list, err := s.DB.ListProjectVersions(r.Context(), itemID, userID)
	if err != nil {
		http.Error(w, `{"error":"list versions"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"versions": list})
}

func (s *Server) removeProjectVersion(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	versionNumStr := chi.URLParam(r, "versionNum")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid item id"})
		return
	}
	versionNum, err := strconv.Atoi(versionNumStr)
	if err != nil || versionNum < 1 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid version number"})
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}
	err = s.DB.RemoveProjectVersion(r.Context(), itemID, versionNum, userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "version not found"})
			return
		}
		log.Printf("removeProjectVersion item=%s version=%d: %v", itemID, versionNum, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to remove version"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) addProjectVersion(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		URL      string          `json:"url"`
		Metadata json.RawMessage `json:"metadata,omitempty"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(body.URL, "https://") {
		http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.AddProjectVersion(r.Context(), itemID, userID, body.URL, body.Metadata); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add version failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) uploadProjectVersion(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if s.Store == nil {
		http.Error(w, `{"error":"upload not configured"}`, http.StatusServiceUnavailable)
		return
	}
	const maxSize = 50 << 20
	if err := r.ParseMultipartForm(maxSize * 2); err != nil {
		http.Error(w, `{"error":"multipart too large"}`, http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		files = r.MultipartForm.File["files"]
	}
	if len(files) == 0 {
		http.Error(w, `{"error":"no file"}`, http.StatusBadRequest)
		return
	}
	fh := files[0]
	if fh.Size > maxSize {
		http.Error(w, `{"error":"file too large"}`, http.StatusBadRequest)
		return
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if ext == "" {
		ext = ".bin"
	}
	key := fmt.Sprintf("uploads/%s/%s%s", userID.String(), uuid.New().String(), ext)
	file, err := fh.Open()
	if err != nil {
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	contentType := fh.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err = s.Store.Put(r.Context(), key, file, contentType)
	file.Close()
	if err != nil {
		log.Printf("upload project version %s: %v", fh.Filename, err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	url := s.Store.URL(key)
	if err := s.DB.AddProjectVersion(r.Context(), itemID, userID, url, nil); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add version failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

// removeProjectItemBackground runs bria/remove-background on the item image, uploads result to R2, adds a new version.
func (s *Server) removeProjectItemBackground(w http.ResponseWriter, r *http.Request) {
	projectIDStr := chi.URLParam(r, "id")
	itemIDStr := chi.URLParam(r, "itemId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid project id"}`, http.StatusBadRequest)
		return
	}
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid item id"}`, http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	p, err := s.DB.GetProject(r.Context(), projectID, userID)
	if err != nil || p == nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}
	items, err := s.DB.ListProjectItems(r.Context(), projectID, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to load items"}`, http.StatusInternalServerError)
		return
	}
	var item *store.ProjectItem
	for i := range items {
		if items[i].ID == itemID {
			item = &items[i]
			break
		}
	}
	if item == nil {
		http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
		return
	}
	if item.Type != "image" {
		http.Error(w, `{"error":"only images supported for remove background"}`, http.StatusBadRequest)
		return
	}
	imageURL := item.LatestURL
	if imageURL == "" {
		imageURL = item.SourceURL
	}
	if imageURL == "" {
		http.Error(w, `{"error":"item has no image url"}`, http.StatusBadRequest)
		return
	}
	if s.Repl == nil || s.ModelRemoveBg == "" {
		http.Error(w, `{"error":"remove background not configured"}`, http.StatusServiceUnavailable)
		return
	}
	// Use background context so Replicate + download + save complete even if client disconnects (avoids "context canceled").
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	input := repgo.PredictionInput{
		"image_url":      imageURL,
		"preserve_alpha": true,
	}
	out, err := s.Repl.Run(ctx, s.ModelRemoveBg, input)
	if err != nil {
		log.Printf("[remove-bg] replicate run failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": "background removal failed: " + err.Error()})
		return
	}
	var resultURL string
	switch v := out.(type) {
	case string:
		resultURL = v
	case map[string]interface{}:
		if u, _ := v["output"].(string); u != "" {
			resultURL = u
		} else if u, _ := v["url"].(string); u != "" {
			resultURL = u
		}
	}
	if resultURL == "" {
		log.Printf("[remove-bg] unexpected replicate output type: %T", out)
		http.Error(w, `{"error":"invalid model output"}`, http.StatusInternalServerError)
		return
	}
	// Download result and upload to our R2
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resultURL, nil)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch result"}`, http.StatusInternalServerError)
		return
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"failed to download result"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Error(w, `{"error":"failed to download result"}`, http.StatusBadGateway)
		return
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read result"}`, http.StatusInternalServerError)
		return
	}
	if s.Store == nil {
		http.Error(w, `{"error":"storage not configured"}`, http.StatusServiceUnavailable)
		return
	}
	key := fmt.Sprintf("uploads/%s/%s.png", userID.String(), uuid.New().String())
	_, err = s.Store.Put(ctx, key, bytes.NewReader(body), "image/png")
	if err != nil {
		log.Printf("[remove-bg] store put: %v", err)
		http.Error(w, `{"error":"failed to save result"}`, http.StatusInternalServerError)
		return
	}
	url := s.Store.URL(key)
	meta := json.RawMessage(`{"action":"remove_bg"}`)
	if err := s.DB.AddProjectVersion(ctx, itemID, userID, url, meta); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"failed to add version"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"url": url, "ok": true})
}

// vectorizeImage forwards a raster image (PNG/JPG/WebP) to the internal
// vectorizer microservice and returns an SVG file. Authenticated endpoint.
//
