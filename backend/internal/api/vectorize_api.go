package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"

	"github.com/google/uuid"
)

func (s *Server) vectorizeImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var req struct {
		URL   string `json:"url"`
		Mode  string `json:"mode,omitempty"`
		Async bool   `json:"async,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	src := strings.TrimSpace(req.URL)
	if src == "" {
		http.Error(w, `{"error":"url required"}`, http.StatusBadRequest)
		return
	}

	if req.Async {
		ctx := r.Context()
		input := map[string]interface{}{"url": src, "mode": strings.TrimSpace(req.Mode)}
		jobID, err := s.DB.CreateJob(ctx, userID, "vectorize", input, nil)
		if err != nil {
			http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
			return
		}
		s.recordUserProfile(userID, "vectorize", nil)
		task, _ := queue.NewVectorizeTask(jobID)
		if _, err := s.Asynq.Enqueue(task); err != nil {
			http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
			return
		}
		s.invalidateContentCache(ctx, userID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
		return
	}

	// Sync path below
	// Load image bytes either from our storage (uploads/<user>/...) or from a
	// trusted external CDN (the same allow-list used by downloadMedia).
	var imgBody io.ReadCloser
	if strings.HasPrefix(src, "uploads/") {
		if s.Store == nil {
			http.Error(w, `{"error":"storage not configured"}`, http.StatusServiceUnavailable)
			return
		}
		if !strings.HasPrefix(src, "uploads/"+userID.String()+"/") {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		body, _, err := s.Store.Get(r.Context(), src)
		if err != nil {
			http.Error(w, `{"error":"source not found"}`, http.StatusNotFound)
			return
		}
		imgBody = body
	} else {
		if !strings.HasPrefix(src, "https://") {
			http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
			return
		}
		if !strings.Contains(src, "replicate.delivery") &&
			!strings.Contains(src, "r2.dev") &&
			!strings.Contains(src, "r2.cloudflarestorage.com") &&
			!strings.Contains(src, "storage.flipo5.com") &&
			!strings.Contains(src, "flipo5.com") {
			http.Error(w, `{"error":"url not allowed"}`, http.StatusBadRequest)
			return
		}
		httpc := &http.Client{Timeout: 20 * time.Second}
		resp, err := httpc.Get(src)
		if err != nil || resp.StatusCode != http.StatusOK {
			if resp != nil {
				resp.Body.Close()
			}
			http.Error(w, `{"error":"fetch failed"}`, http.StatusBadGateway)
			return
		}
		imgBody = resp.Body
	}
	defer imgBody.Close()

	base := os.Getenv("VECTORIZER_URL")
	if base == "" {
		base = "http://vectorizer:8081"
	}
	target := base + "/convert"
	mode := strings.TrimSpace(req.Mode)
	if mode != "" {
		target += "?mode=" + url.QueryEscape(mode)
	}

	vecClient := &http.Client{Timeout: 60 * time.Second}
	vecReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, imgBody)
	if err != nil {
		http.Error(w, `{"error":"vectorize request"}`, http.StatusInternalServerError)
		return
	}
	vecReq.Header.Set("Content-Type", "application/octet-stream")
	vecResp, err := vecClient.Do(vecReq)
	if err != nil {
		log.Printf("[vectorize] call failed: %v", err)
		http.Error(w, `{"error":"vectorizer unavailable"}`, http.StatusBadGateway)
		return
	}
	defer vecResp.Body.Close()
	if vecResp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(vecResp.Body, 512))
		log.Printf("[vectorize] upstream %d: %s", vecResp.StatusCode, string(msg))
		http.Error(w, `{"error":"vectorize failed"}`, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Content-Disposition", `attachment; filename="flipo5-logo.svg"`)
	w.Header().Set("Cache-Control", "no-store")
	io.Copy(w, vecResp.Body)
}
