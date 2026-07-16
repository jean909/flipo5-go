package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

// runTemplate enqueues a batch of jobs from a reusable template.
func (s *Server) runTemplate(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var req struct {
		Template string                 `json:"template"`
		Input    map[string]interface{} `json:"input"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	template := strings.TrimSpace(strings.ToLower(req.Template))
	if req.Input == nil {
		req.Input = map[string]interface{}{}
	}

	type jobRef struct {
		JobID string `json:"job_id"`
		Type  string `json:"type"`
		Label string `json:"label"`
	}
	var created []jobRef

	enqueue := func(jobType string, input map[string]interface{}, label string, newTask func(uuid.UUID) (*asynq.Task, error)) {
		jid, err := s.DB.CreateJob(ctx, userID, jobType, input, nil)
		if err != nil {
			return
		}
		task, err := newTask(jid)
		if err != nil || task == nil {
			return
		}
		if _, err := s.Asynq.Enqueue(task); err != nil {
			return
		}
		s.recordUserProfile(userID, jobType, nil)
		created = append(created, jobRef{JobID: jid.String(), Type: jobType, Label: label})
	}

	switch template {
	case "amazon_listing", "amazon-listing":
		productName, _ := req.Input["product_name"].(string)
		productName = strings.TrimSpace(productName)
		if productName == "" {
			http.Error(w, `{"error":"product_name required"}`, http.StatusBadRequest)
			return
		}
		desc, _ := req.Input["description"].(string)
		seoPrompt := "Write an SEO-optimized Amazon product listing for: " + productName
		if strings.TrimSpace(desc) != "" {
			seoPrompt += ". Product details: " + desc
		}
		seoInput := map[string]interface{}{
			"topic": productName, "keywords": productName, "language": "en",
			"prompt": seoPrompt, "format": "html",
		}
		enqueue("seo", seoInput, "Amazon SEO listing", queue.NewSEOTask)
		for i := 1; i <= 4; i++ {
			n := i
			prompt := fmt.Sprintf("Professional Amazon product photo, white background, %s, studio lighting, e-commerce, variant %d", productName, n)
			imgInput := map[string]interface{}{"prompt": prompt, "aspect_ratio": "1:1", "template": "amazon_listing"}
			label := fmt.Sprintf("Product image %d", n)
			enqueue("image", imgInput, label, queue.NewImageTask)
		}
	case "social_week", "social-week":
		brand, _ := req.Input["brand"].(string)
		brand = strings.TrimSpace(brand)
		if brand == "" {
			http.Error(w, `{"error":"brand required"}`, http.StatusBadRequest)
			return
		}
		theme, _ := req.Input["theme"].(string)
		if theme == "" {
			theme = "engagement"
		}
		outlineInput := map[string]interface{}{
			"topic":    fmt.Sprintf("7-day social media content plan for %s (%s)", brand, theme),
			"format":   "markdown",
			"language": "en",
		}
		enqueue("outline", outlineInput, "7-day content plan", queue.NewOutlineTask)
		for day := 1; day <= 7; day++ {
			d := day
			prompt := fmt.Sprintf("Social media post visual for %s, day %d, %s, modern, scroll-stopping", brand, d, theme)
			imgInput := map[string]interface{}{"prompt": prompt, "aspect_ratio": "1:1", "template": "social_week", "day": d}
			enqueue("image", imgInput, fmt.Sprintf("Day %d image", d), queue.NewImageTask)
		}
	default:
		http.Error(w, `{"error":"unknown template"}`, http.StatusBadRequest)
		return
	}

	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{"template": template, "jobs": created})
}
