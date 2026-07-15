package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) downloadMedia(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*") // so frontend can use response when loading image for canvas (clone/colorize/highlight)
	urlStr := strings.TrimSpace(r.URL.Query().Get("url"))
	if urlStr == "" {
		http.Error(w, `{"error":"url required"}`, http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(urlStr, "https://") {
		http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
		return
	}
	// Allow only known CDN domains (Replicate, Cloudflare R2, custom storage)
	if !strings.Contains(urlStr, "replicate.delivery") &&
		!strings.Contains(urlStr, "r2.dev") &&
		!strings.Contains(urlStr, "r2.cloudflarestorage.com") &&
		!strings.Contains(urlStr, "storage.flipo5.com") &&
		!strings.Contains(urlStr, "flipo5.com") {
		http.Error(w, `{"error":"url not allowed"}`, http.StatusBadRequest)
		return
	}
	resp, err := http.Get(urlStr)
	if err != nil {
		http.Error(w, `{"error":"fetch failed"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Error(w, `{"error":"fetch failed"}`, http.StatusBadGateway)
		return
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "image/jpeg"
	}
	ext := ".jpg"
	if strings.Contains(ct, "png") {
		ext = ".png"
	} else if strings.Contains(ct, "webp") {
		ext = ".webp"
	} else if strings.Contains(ct, "gif") {
		ext = ".gif"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", "attachment; filename=\"flipo5-"+fmt.Sprint(time.Now().Unix())+ext+"\"")
	io.Copy(w, resp.Body)
}

// serveMedia streams a file from storage by key. Used when public URL is not available (e.g. relative key).
func (s *Server) serveMedia(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*") // always set so browser doesn't hide real error (401/404) behind CORS)
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if s.Store == nil {
		http.Error(w, `{"error":"storage not configured"}`, http.StatusServiceUnavailable)
		return
	}
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key == "" || !strings.HasPrefix(key, "uploads/") {
		http.Error(w, `{"error":"invalid key"}`, http.StatusBadRequest)
		return
	}
	// Ensure key is under user's uploads
	if !strings.HasPrefix(key, "uploads/"+userID.String()+"/") {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	body, contentType, err := s.Store.Get(r.Context(), key)
	if err != nil {
		log.Printf("serveMedia Get %s: %v", key, err)
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	defer body.Close()
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.Copy(w, body)
}

func (s *Server) streamAllJobs(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if s.Stream == nil {
		http.Error(w, `{"error":"streaming not configured"}`, http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	ctx := r.Context()
	flusher := w.(http.Flusher)

	log.Printf("[streamAllJobs] User %s connected to job stream", userID)
	fmt.Fprintf(w, "data: {\"type\":\"connected\",\"user\":\"%s\"}\n\n", userID)
	flusher.Flush()

	// Subscribe to user-specific job updates channel
	userJobsChannel := fmt.Sprintf("user:%s:jobs", userID.String())
	pubsub := s.Stream.SubscribeRaw(ctx, userJobsChannel)
	if pubsub == nil {
		http.Error(w, `{"error":"subscription failed"}`, http.StatusInternalServerError)
		return
	}
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			// Forward job update to client
			fmt.Fprintf(w, "data: %s\n\n", msg.Payload)
			flusher.Flush()
		}
	}
}

func (s *Server) jobStreamSSE(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	jobID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	job, err := s.DB.GetJobForUser(r.Context(), jobID, userID)
	if err != nil || job == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	sendSSE := func(output string, status string) {
		payload := map[string]string{"output": output, "status": status}
		b, _ := json.Marshal(payload)
		w.Write([]byte("data: " + string(b) + "\n\n"))
		flusher.Flush()
	}
	outputText := func(j *store.Job) string {
		if len(j.Output) == 0 {
			return ""
		}
		var m map[string]interface{}
		if json.Unmarshal(j.Output, &m) != nil {
			return ""
		}
		if o, _ := m["output"].(string); o != "" {
			return o
		}
		return ""
	}
	sendSSE(outputText(job), job.Status)
	if job.Status == "completed" || job.Status == "failed" {
		return
	}
	ctx := r.Context()
	// Redis Pub/Sub: real-time stream when available
	if s.Stream != nil {
		type streamMsg struct {
			output string
			done   bool
		}
		ch := make(chan streamMsg, 64)
		go func() {
			_ = s.Stream.Subscribe(ctx, jobID, func(output string, done bool) {
				select {
				case ch <- streamMsg{output, done}:
				default:
				}
			})
			close(ch)
		}()
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					job, _ = s.DB.GetJobForUser(r.Context(), jobID, userID)
					if job != nil {
						sendSSE(outputText(job), job.Status)
					}
					return
				}
				status := "running"
				if msg.done {
					status = "completed"
				}
				sendSSE(msg.output, status)
				if msg.done {
					return
				}
			case <-ticker.C:
				next, err := s.DB.GetJobForUser(r.Context(), jobID, userID)
				if err != nil || next == nil {
					return
				}
				sendSSE(outputText(next), next.Status)
				if next.Status == "completed" || next.Status == "failed" {
					return
				}
			}
		}
	}
	// Fallback: poll DB only
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			next, err := s.DB.GetJobForUser(r.Context(), jobID, userID)
			if err != nil || next == nil {
				return
			}
			sendSSE(outputText(next), next.Status)
			if next.Status == "completed" || next.Status == "failed" {
				return
			}
		}
	}
}

// --- Edit Studio (projects) ---
