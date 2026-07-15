package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
)

func (s *Server) createSEO(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxSEOBodyBytes)
	defer r.Body.Close()
	var req struct {
		SourceText string `json:"source_text"`
		SourceURL  string `json:"source_url"`
		Title      string `json:"title"`
		Language   string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	sourceText := strings.TrimSpace(req.SourceText)
	sourceURL := strings.TrimSpace(req.SourceURL)
	if sourceText == "" && sourceURL == "" {
		http.Error(w, `{"error":"source_text or source_url required"}`, http.StatusBadRequest)
		return
	}
	if len(sourceText) > maxSEOSourceTextLen {
		http.Error(w, `{"error":"source_text too long"}`, http.StatusBadRequest)
		return
	}
	if sourceURL != "" {
		if len(sourceURL) > maxSEOSourceURLLen {
			http.Error(w, `{"error":"source_url too long"}`, http.StatusBadRequest)
			return
		}
		if _, err := url.ParseRequestURI(sourceURL); err != nil {
			http.Error(w, `{"error":"invalid source_url"}`, http.StatusBadRequest)
			return
		}
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	title := strings.TrimSpace(req.Title)
	if len(title) > 500 {
		title = title[:500]
	}
	if title == "" {
		if sourceURL != "" {
			title = "SEO – " + sourceURL
		} else {
			words := strings.Fields(sourceText)
			if len(words) > 5 {
				words = words[:5]
			}
			title = "SEO – " + strings.Join(words, " ")
		}
	}
	lang := strings.TrimSpace(req.Language)
	if len(lang) > 50 {
		lang = lang[:50]
	}
	input := map[string]interface{}{
		"source_text": req.SourceText,
		"source_url":  sourceURL,
		"title":       title,
		"language":    lang,
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "seo", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "seo", nil)
	task, _ := queue.NewSEOTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) createOutline(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Topic     string `json:"topic"`
		Audience  string `json:"audience"`
		Language  string `json:"language"`
		WordCount string `json:"word_count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Topic) == "" {
		http.Error(w, `{"error":"topic required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	input := map[string]interface{}{
		"topic":      strings.TrimSpace(req.Topic),
		"audience":   req.Audience,
		"language":   req.Language,
		"word_count": req.WordCount,
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "outline", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "outline", nil)
	task, _ := queue.NewOutlineTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}
