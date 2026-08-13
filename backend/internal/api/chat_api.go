package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"flipo5/backend/internal/intent"
	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/textmodel"

	"github.com/google/uuid"
)

func (s *Server) createChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt                 string   `json:"prompt"`
		AttachmentURLs         []string `json:"attachment_urls,omitempty"`
		AttachmentContentTypes []string `json:"attachment_content_types,omitempty"` // e.g. "image/jpeg", "application/pdf"
		ThreadID               string   `json:"thread_id,omitempty"`
		Incognito              bool     `json:"incognito,omitempty"`
		ChatProjectID          string   `json:"chat_project_id,omitempty"`
		ForceSkill             string   `json:"force_skill,omitempty"` // "chat"|"image"|"video" — skip router
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
		http.Error(w, `{"error":"prompt required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	// Resolve chat project (if any) — only valid for non-incognito threads.
	var chatProjectID *uuid.UUID
	if !req.Incognito && strings.TrimSpace(req.ChatProjectID) != "" {
		if pid, err := uuid.Parse(req.ChatProjectID); err == nil {
			if p, _ := s.DB.GetChatProject(ctx, pid, userID); p != nil {
				chatProjectID = &pid
			}
		}
	}
	var threadID *uuid.UUID
	if !req.Incognito && req.ThreadID != "" {
		if id, err := uuid.Parse(req.ThreadID); err == nil {
			t, _ := s.DB.GetThreadForUser(ctx, id, userID)
			if t != nil {
				threadID = &id
			}
		}
	}
	if !req.Incognito && threadID == nil {
		id, err := s.DB.CreateThread(ctx, userID, false)
		if err != nil {
			log.Printf("create thread failed: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "create thread"})
			return
		}
		threadID = &id
		if title := titleFromPrompt(req.Prompt); title != "" {
			_ = s.DB.UpdateThreadTitle(ctx, id, title)
		}
		if chatProjectID != nil {
			_ = s.DB.AssignThreadToChatProject(ctx, id, userID, *chatProjectID)
		}
	}
	if req.Incognito && threadID == nil {
		id, err := s.DB.CreateThread(ctx, userID, true)
		if err != nil {
			log.Printf("create ephemeral thread failed: %v", err)
			http.Error(w, `{"error":"create thread"}`, http.StatusInternalServerError)
			return
		}
		threadID = &id
		if title := titleFromPrompt(req.Prompt); title != "" {
			_ = s.DB.UpdateThreadTitle(ctx, id, title)
		}
	}

	// Skill routing: chat by default; fast classifier may dispatch image/video.
	// Incognito stays pure chat (no media skills).
	skill := intent.SkillChat
	routeSource := "default"
	force := strings.ToLower(strings.TrimSpace(req.ForceSkill))
	switch force {
	case "chat", "image", "video":
		skill = intent.Skill(force)
		routeSource = "force"
	default:
		if !req.Incognito {
			hints := intent.Hints{}
			for _, ct := range req.AttachmentContentTypes {
				ct = strings.ToLower(ct)
				if strings.HasPrefix(ct, "image/") {
					hints.HasImageAttachment = true
				}
				if strings.HasPrefix(ct, "video/") {
					hints.HasVideoAttachment = true
				}
			}
			for _, u := range req.AttachmentURLs {
				lu := strings.ToLower(u)
				if strings.Contains(lu, ".png") || strings.Contains(lu, ".jpg") || strings.Contains(lu, ".jpeg") || strings.Contains(lu, ".webp") || strings.Contains(lu, ".gif") {
					hints.HasImageAttachment = true
				}
			}
			model := strings.TrimSpace(s.ModelTextFallback)
			if model == "" {
				model = strings.TrimSpace(s.ModelText)
			}
			clf := &intent.Classifier{Repl: s.Repl, Model: model}
			res := clf.Classify(ctx, req.Prompt, hints)
			skill = res.Skill
			routeSource = res.Source
			log.Printf("intent route skill=%s source=%s conf=%.2f", skill, res.Source, res.Confidence)
		}
	}

	switch skill {
	case intent.SkillImage:
		s.enqueueRoutedImage(w, r, userID, threadID, req.Prompt, req.AttachmentURLs, req.AttachmentContentTypes, routeSource)
		return
	case intent.SkillVideo:
		s.enqueueRoutedVideo(w, r, userID, threadID, req.Prompt, req.AttachmentURLs, req.AttachmentContentTypes, routeSource)
		return
	}

	input := map[string]interface{}{"prompt": req.Prompt}
	if len(req.AttachmentURLs) > 0 {
		input["attachment_urls"] = req.AttachmentURLs
		if len(req.AttachmentContentTypes) > 0 {
			input["attachment_content_types"] = req.AttachmentContentTypes
		}
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "chat", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "chat", nil)
	task, _ := queue.NewChatTask(jobID, req.Prompt)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		_ = s.DB.UpdateJobStatus(ctx, jobID, "failed", nil, "enqueue failed", 0, "")
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	if threadID != nil {
		s.invalidateThreadCache(ctx, *threadID, userID)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	out := map[string]string{"job_id": jobID.String(), "routed": "chat", "route_source": routeSource}
	if threadID != nil {
		out["thread_id"] = threadID.String()
	}
	json.NewEncoder(w).Encode(out)
}

func (s *Server) enqueueRoutedImage(w http.ResponseWriter, r *http.Request, userID uuid.UUID, threadID *uuid.UUID, prompt string, attachmentURLs, contentTypes []string, routeSource string) {
	ctx := r.Context()
	input := map[string]interface{}{
		"prompt":       prompt,
		"size":         "2K",
		"aspect_ratio": "1:1",
		"max_images":   1,
		"quality":      "high",
		"output_format": "webp",
		"number_of_images": 1,
		"output_compression": 90,
		"background":   "auto",
		"moderation":   "auto",
		"routed_from":  "chat",
	}
	imageInput := imageURLsFromAttachments(attachmentURLs, contentTypes, s)
	if len(imageInput) > 0 {
		input["image_input"] = imageInput
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "image", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "image", map[string]interface{}{"routed_from": "chat"})
	task, _ := queue.NewImageTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		_ = s.DB.UpdateJobStatus(ctx, jobID, "failed", nil, "enqueue failed", 0, "")
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	if threadID != nil {
		s.invalidateThreadCache(ctx, *threadID, userID)
	}
	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	out := map[string]string{"job_id": jobID.String(), "routed": "image", "route_source": routeSource}
	if threadID != nil {
		out["thread_id"] = threadID.String()
	}
	json.NewEncoder(w).Encode(out)
}

func (s *Server) enqueueRoutedVideo(w http.ResponseWriter, r *http.Request, userID uuid.UUID, threadID *uuid.UUID, prompt string, attachmentURLs, contentTypes []string, routeSource string) {
	ctx := r.Context()
	input := map[string]interface{}{
		"prompt":       prompt,
		"duration":     5,
		"aspect_ratio": "16:9",
		"resolution":   "720p",
		"video_model":  "1",
		"routed_from":  "chat",
	}
	imgs := imageURLsFromAttachments(attachmentURLs, contentTypes, s)
	if len(imgs) > 0 {
		input["image"] = imgs[0]
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "video", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "video", map[string]interface{}{"routed_from": "chat"})
	task, _ := queue.NewVideoTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		_ = s.DB.UpdateJobStatus(ctx, jobID, "failed", nil, "enqueue failed", 0, "")
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	if threadID != nil {
		s.invalidateThreadCache(ctx, *threadID, userID)
	}
	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	out := map[string]string{"job_id": jobID.String(), "routed": "video", "route_source": routeSource}
	if threadID != nil {
		out["thread_id"] = threadID.String()
	}
	json.NewEncoder(w).Encode(out)
}

func imageURLsFromAttachments(urls, contentTypes []string, s *Server) []string {
	out := make([]string, 0, len(urls))
	for i, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		isImage := false
		if i < len(contentTypes) && strings.HasPrefix(strings.ToLower(contentTypes[i]), "image/") {
			isImage = true
		}
		lu := strings.ToLower(u)
		if strings.Contains(lu, ".png") || strings.Contains(lu, ".jpg") || strings.Contains(lu, ".jpeg") || strings.Contains(lu, ".webp") || strings.Contains(lu, ".gif") {
			isImage = true
		}
		if !isImage && i < len(contentTypes) {
			continue
		}
		if !isImage && len(contentTypes) == 0 {
			// no types: treat all as potential refs only if URL looks like image
			continue
		}
		if !isImage {
			continue
		}
		if strings.HasPrefix(u, "uploads/") && s.Store != nil {
			out = append(out, s.Store.URL(u))
		} else {
			out = append(out, u)
		}
	}
	if len(out) > 14 {
		out = out[:14]
	}
	return out
}

func (s *Server) generatePromptVariants(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Type        string `json:"type"` // "image" or "video"
		Description string `json:"description"`
		Angle       string `json:"angle,omitempty"`
		Movement    string `json:"movement,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Description == "" {
		http.Error(w, `{"error":"description required"}`, http.StatusBadRequest)
		return
	}
	if req.Type != "image" && req.Type != "video" {
		req.Type = "image"
	}
	if s.Repl == nil || s.ModelText == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "prompt generation not configured", "prompts": []string{}})
		return
	}
	ctx := r.Context()
	mediaType := "image"
	if req.Type == "video" {
		mediaType = "video"
	}
	desc := strings.TrimSpace(req.Description)
	angle := strings.TrimSpace(req.Angle)
	movement := strings.TrimSpace(req.Movement)
	var userPart string
	userPart = "- Main idea / description: " + desc + "\n"
	if angle != "" {
		userPart += "- Camera angle or framing: " + angle + "\n"
	}
	if movement != "" {
		userPart += "- Camera movement: " + movement + "\n"
	}
	prompt := fmt.Sprintf(`You are a professional prompt engineer. The user wants to create a %s. They provided:
%s
Generate exactly 5 different, creative prompt variants that could be used as the generation prompt for this %s. Each variant should be one or two sentences, in English, descriptive and ready to use. Make them distinct (different wording, emphasis, or detail). Return ONLY a JSON array of exactly 5 strings, no other text, no markdown, no code block. Example: ["First prompt here.", "Second prompt here.", ...]`,
		mediaType, userPart, mediaType)
	input := textmodel.BuildInput(s.ModelText, "", prompt, nil, textmodel.DefaultMaxTokens)
	out, err := s.Repl.Run(ctx, s.ModelText, input)
	if err != nil {
		log.Printf("prompt-variants run: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error(), "prompts": []string{}})
		return
	}
	text := extractOutputText(out)
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```") {
		text = strings.TrimPrefix(text, "```json")
		text = strings.TrimPrefix(text, "```")
		text = strings.TrimSuffix(text, "```")
		text = strings.TrimSpace(text)
	}
	var prompts []string
	if text != "" {
		jsonStr := text
		if start := strings.Index(text, "["); start >= 0 {
			if end := strings.LastIndex(text, "]"); end > start {
				jsonStr = text[start : end+1]
			}
		}
		if err := json.Unmarshal([]byte(jsonStr), &prompts); err == nil && len(prompts) > 0 {
			if len(prompts) > 5 {
				prompts = prompts[:5]
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"prompts": prompts})
			return
		}
		if extracted := extractQuotedStrings(text); len(extracted) > 0 {
			for len(extracted) < 5 {
				extracted = append(extracted, desc)
			}
			if len(extracted) > 5 {
				extracted = extracted[:5]
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"prompts": extracted})
			return
		}
		log.Printf("prompt-variants parse failed (text len=%d, first 200: %q)", len(text), truncate(text, 200))
	}
	// fallback: echo description
	prompts = buildFallbackPrompts(desc, angle, movement, mediaType)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"prompts": prompts})
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// extractQuotedStrings pulls out complete "..." strings from partial JSON (e.g. truncated array).
func extractQuotedStrings(s string) []string {
	var out []string
	for i := 0; i < len(s); i++ {
		if s[i] != '"' {
			continue
		}
		j := i + 1
		for j < len(s) {
			if s[j] == '\\' && j+1 < len(s) {
				j += 2
				continue
			}
			if s[j] == '"' {
				seg := s[i+1 : j]
				seg = strings.ReplaceAll(seg, `\"`, `"`)
				seg = strings.ReplaceAll(seg, `\n`, "\n")
				if len(seg) > 0 {
					out = append(out, seg)
				}
				i = j
				break
			}
			j++
		}
	}
	return out
}

func extractOutputText(out interface{}) string {
	if out == nil {
		return ""
	}
	if arr, ok := out.([]interface{}); ok {
		var parts []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "")
	}
	if s, ok := out.(string); ok {
		return s
	}
	if m, ok := out.(map[string]interface{}); ok {
		if v := m["output"]; v != nil {
			if s, ok := v.(string); ok {
				return s
			}
			if arr, ok := v.([]interface{}); ok {
				var parts []string
				for _, v := range arr {
					if s, ok := v.(string); ok {
						parts = append(parts, s)
					}
				}
				return strings.Join(parts, "")
			}
		}
	}
	return ""
}

func buildFallbackPrompts(desc, angle, movement, mediaType string) []string {
	var list []string
	list = append(list, desc)
	if angle != "" {
		list = append(list, angle+" shot of "+desc)
		list = append(list, desc+", "+angle+" framing")
	}
	if movement != "" {
		list = append(list, desc+". "+movement+".")
		list = append(list, movement+". "+desc)
	}
	list = append(list, desc+". High quality "+mediaType+".")
	seen := make(map[string]bool)
	var out []string
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
			if len(out) >= 5 {
				break
			}
		}
	}
	if len(out) == 0 {
		out = []string{desc}
	}
	for len(out) < 5 {
		out = append(out, desc)
	}
	return out[:5]
}
