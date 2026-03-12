package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
	"flipo5/backend/internal/cache"
	"flipo5/backend/internal/config"
	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/stream"
	"flipo5/backend/internal/storage"
	"flipo5/backend/internal/store"
)

// ErrMsgServerUnavailable is shown to users when job times out (5 min)
const ErrMsgServerUnavailable = "Server unavailable. Please try again."

func jobErrorMsg(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return ErrMsgServerUnavailable
	}
	return err.Error()
}

// invalidateJobCaches clears thread and content cache when job status changes
func (h *Handlers) invalidateJobCaches(ctx context.Context, job *store.Job) {
	if h.Cache == nil || job == nil {
		return
	}
	// Invalidate thread cache if job belongs to a thread
	if job.ThreadID != nil {
		keys := []string{
			"thread:" + job.UserID.String() + ":" + job.ThreadID.String(),
			"threads:" + job.UserID.String() + ":archived:false",
			"threads:" + job.UserID.String() + ":archived:true",
		}
		_ = h.Cache.Delete(ctx, keys...)
	}
	// Invalidate content cache if job produces media content
	if job.Type == "image" || job.Type == "video" || job.Type == "upscale" {
		_ = h.Cache.DeleteByPrefix(ctx, "content:"+job.UserID.String()+":")
	}
}

// Context strategy (research-based): user questions = topic anchor; full assistant replies = token-heavy.
// We send: (1) list of user questions = what was discussed; (2) last 2 full exchanges = immediate follow-up.
const maxUserQuestions = 12       // older: only user prompts (topics)
const maxRecentFullExchanges = 2 // last N: full user+assistant for "explică mai simplu" etc
const maxUserQuestionLen = 120   // truncate very long user prompts in topics list
const maxRecentOutputLen = 800   // truncate assistant in recent exchanges (enough for follow-up)

// buildChatContext: older exchanges = user questions only; last 2 = full. Saves tokens, keeps context.
func buildChatContext(db *store.DB, ctx context.Context, threadID *uuid.UUID, userID, currentJobID uuid.UUID) string {
	if threadID == nil {
		return ""
	}
	jobs, err := db.ListJobsByThread(ctx, *threadID, userID)
	if err != nil || len(jobs) == 0 {
		return ""
	}
	var completed []store.Job
	for _, j := range jobs {
		if j.ID == currentJobID || j.Type != "chat" || j.Status != "completed" {
			continue
		}
		completed = append(completed, j)
	}
	if len(completed) == 0 {
		return ""
	}
	split := len(completed) - maxRecentFullExchanges
	if split < 0 {
		split = 0
	}
	older := completed[:split]
	recent := completed[split:]

	var parts []string
	// Older: user questions only (what was discussed)
	if len(older) > 0 {
		var questions []string
		start := 0
		if len(older) > maxUserQuestions {
			start = len(older) - maxUserQuestions
		}
		for _, j := range older[start:] {
			var input map[string]interface{}
			if len(j.Input) > 0 {
				_ = json.Unmarshal(j.Input, &input)
			}
			if q, _ := input["prompt"].(string); q != "" {
				q = strings.TrimSpace(q)
				if len(q) > maxUserQuestionLen {
					q = q[:maxUserQuestionLen] + "..."
				}
				questions = append(questions, "- "+q)
			}
		}
		if len(questions) > 0 {
			parts = append(parts, "Earlier in this conversation, the user asked about:\n"+strings.Join(questions, "\n"))
		}
	}
	// Recent: full exchanges (follow-up like "explică mai simplu" needs prior answer)
	for i := range recent {
		j := &recent[i]
		var input map[string]interface{}
		if len(j.Input) > 0 {
			_ = json.Unmarshal(j.Input, &input)
		}
		userMsg, _ := input["prompt"].(string)
		if userMsg == "" {
			continue
		}
		var output map[string]interface{}
		assistantMsg := ""
		if len(j.Output) > 0 {
			_ = json.Unmarshal(j.Output, &output)
			assistantMsg, _ = output["output"].(string)
		}
		if len(assistantMsg) > maxRecentOutputLen {
			assistantMsg = strings.TrimSpace(assistantMsg[:maxRecentOutputLen]) + "..."
		}
		parts = append(parts, "User: "+userMsg+"\n\nAssistant: "+assistantMsg)
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n\n")
}

type Handlers struct {
	DB     *store.DB
	Cfg    *config.Config
	Repl   *replicate.Client
	Store  *storage.Store
	Asynq  *asynq.Client
	Stream *stream.Publisher // Redis pub/sub for real-time SSE
	Cache  *cache.Redis     // for cache invalidation when jobs complete
}

func (h *Handlers) ChatHandler(ctx context.Context, t *asynq.Task) error {
	var p ChatPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	model := h.Cfg.ModelText
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_TEXT not set", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	u, _ := h.DB.UserByID(ctx, job.UserID)
	userName := ""
	if u != nil && strings.TrimSpace(u.FullName) != "" {
		userName = strings.TrimSpace(u.FullName)
		if idx := strings.Index(userName, " "); idx > 0 {
			userName = userName[:idx]
		}
	}
	// Build Gemini-style input: prompt, images (URIs), optionally videos/audio later
	// Flipo5: thorough answers, no identity repetition. Do NOT instruct markdown - we render it.
	system := `You are Flipo5, an AI assistant trained by Moise I. Jean.

Rules:
- Never introduce yourself unless the user explicitly asks who you are. Stay strictly on the conversation topic.
- Do not repeat your identity in every response.

Response style:
- Provide thorough, detailed answers - prioritize depth over brevity.
- Explain concepts fully, give examples when helpful. Avoid one-sentence or superficial answers.
- When the topic warrants it: structure with clear sections, bullet points, or numbered lists.`
	if userName != "" {
		system += "\n\nThe user's name is " + userName + ". Use it naturally when appropriate (e.g. when greeting or closing)."
	}
	// Apply user AI configuration
	if u != nil && u.AIConfiguration != nil {
		if style, _ := u.AIConfiguration["style"].(string); style != "" {
			switch style {
			case "friendly":
				system += "\n\nTone: Be warm, supportive, and approachable. Use encouraging language."
			case "direct":
				system += "\n\nTone: Be straight-to-the-point and concise. Avoid unnecessary pleasantries."
			case "logical":
				system += "\n\nTone: Be analytical and structured. Present arguments clearly, use evidence when relevant."
			case "brief":
				system += "\n\nTone: Keep answers concise. Prioritize clarity and brevity."
			case "detailed":
				system += "\n\nTone: Provide in-depth, comprehensive answers. Include context and nuance."
			}
		}
		if lang, _ := u.AIConfiguration["primary_language"].(string); lang != "" && lang != "browser" {
			langMap := map[string]string{"en": "English", "de": "German", "ro": "Romanian", "fr": "French", "es": "Spanish", "it": "Italian"}
			if l, ok := langMap[lang]; ok {
				system += "\n\nPrimary response language: " + l + ". Respond in " + l + " unless the user asks in another language."
			}
		}
		if details, _ := u.AIConfiguration["user_details"].(string); strings.TrimSpace(details) != "" {
			system += "\n\nContext about the user (use naturally in your responses): " + strings.TrimSpace(details)
		}
	}

	// Conversation context: previous exchanges in this thread (so AI remembers follow-ups)
	contextBlock := buildChatContext(h.DB, ctx, job.ThreadID, job.UserID, p.JobID)
	prompt := system + "\n\n"
	if contextBlock != "" {
		prompt += contextBlock + "\n\n"
	}
	prompt += "User: " + p.Prompt
	input := repgo.PredictionInput{
		"prompt":            prompt,
		"max_output_tokens": 16384,
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	if urls, ok := jobInput["attachment_urls"].([]interface{}); ok && len(urls) > 0 {
		types, _ := jobInput["attachment_content_types"].([]interface{})
		images := make([]string, 0, len(urls))
		hasNonImage := false
		for i, u := range urls {
			urlStr, ok := u.(string)
			if !ok || urlStr == "" {
				continue
			}
			// Only send image URLs to Replicate (vision models). PDFs/docs cause E006 "invalid input".
			if i < len(types) {
				if t, ok := types[i].(string); ok && !strings.HasPrefix(t, "image/") {
					hasNonImage = true
					continue
				}
			}
			images = append(images, urlStr)
		}
		if len(images) > 0 {
			input["images"] = images
		}
		if hasNonImage {
			// So the model can tell the user we can't read PDFs/docs yet
			input["prompt"] = prompt + "\n\n[The user attached document file(s) (e.g. PDF) which cannot be analyzed. Suggest they paste the relevant text or upload an image/screenshot of the page.]"
		}
	}
	// Prefer streaming: create prediction with stream, then consume stream and update job output per chunk
	pred, err := h.Repl.CreatePredictionWithStream(ctx, model, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		if h.Stream != nil {
			errMsg := jobErrorMsg(err)
			_ = h.Stream.Publish(ctx, p.JobID, fmt.Sprintf(`{"status":"failed","error":"%s"}`, errMsg), true)
		}
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, pred.ID)
	streamURL := ""
	if pred.URLs != nil {
		streamURL = pred.URLs["stream"]
	}
	if streamURL != "" {
		var acc strings.Builder
		h.Repl.StreamOutput(ctx, streamURL, func(text string) {
			acc.WriteString(text)
			out := acc.String()
			_ = h.DB.UpdateJobOutput(ctx, p.JobID, map[string]interface{}{"output": out})
			if h.Stream != nil {
				_ = h.Stream.Publish(ctx, p.JobID, out, false)
			}
		}, func() {})
		// Use GetPrediction final output - Replicate returns complete output; stream can lose chunks
		finalOutput := acc.String()
		var lastPred *repgo.Prediction
		for i := 0; i < 5; i++ {
			select {
			case <-ctx.Done():
				_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
				return nil
			default:
			}
			predState, err := h.Repl.GetPrediction(ctx, pred.ID)
			if err != nil {
				if i < 4 {
					time.Sleep(500 * time.Millisecond)
				}
				continue
			}
			lastPred = predState
			if predState.Status == "failed" || predState.Status == "canceled" {
				_ = h.Repl.CancelPrediction(ctx, pred.ID)
				errMsg := ""
				if predState.Error != nil {
					if s, ok := predState.Error.(string); ok {
						errMsg = s
					} else {
						errMsg = fmt.Sprintf("%v", predState.Error)
					}
				}
				if errMsg == "" {
					errMsg = "Prediction failed"
				}
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, errMsg, 0, pred.ID)
				return nil
			}
			if predState.Status != "succeeded" {
				if i < 4 {
					time.Sleep(500 * time.Millisecond)
				}
				continue
			}
			if out := normalizeChatOutput(predState.Output); out != nil {
				if m, ok := out.(map[string]interface{}); ok {
					if s, _ := m["output"].(string); s != "" {
						finalOutput = s // API = source of truth, stream can truncate
					}
				}
			}
			break
		}
		if lastPred != nil && (lastPred.Status == "failed" || lastPred.Status == "canceled") {
			return nil // already updated above
		}
		final := map[string]interface{}{"output": finalOutput}
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", final, "", 0, pred.ID)
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, finalOutput, true)
			// Also publish to user-specific channel for streamAllJobs (chat jobs)
			if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"chat"}`, p.JobID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
			}
		}
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			h.invalidateJobCaches(ctx, job)
		}
	} else {
		// Fallback: model doesn't support stream; poll until done
		jobID := p.JobID
		for {
			select {
			case <-ctx.Done():
				_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
				_ = h.DB.UpdateJobStatus(ctx, jobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
				return nil
			default:
			}
			predState, err := h.Repl.GetPrediction(ctx, pred.ID)
			if err != nil {
				_ = h.DB.UpdateJobStatus(ctx, jobID, "failed", nil, jobErrorMsg(err), 0, pred.ID)
				return err
			}
			switch predState.Status {
			case "succeeded":
				normalized := normalizeChatOutput(predState.Output)
				_ = h.DB.UpdateJobStatus(ctx, jobID, "completed", normalized, "", 0, pred.ID)
				goto done
			case "failed", "canceled":
				_ = h.Repl.CancelPrediction(ctx, pred.ID)
				errMsg := ""
				if predState.Error != nil {
					if s, ok := predState.Error.(string); ok {
						errMsg = s
					}
				}
				_ = h.DB.UpdateJobStatus(ctx, jobID, "failed", nil, errMsg, 0, pred.ID)
				return nil
			}
			time.Sleep(2 * time.Second)
		}
	done:
	}
	if job.ThreadID != nil && h.Asynq != nil {
		if task, err := NewSummarizeThreadTask(*job.ThreadID); err == nil {
			_, _ = h.Asynq.Enqueue(task, asynq.Queue("default"), asynq.ProcessIn(10*time.Minute), asynq.Unique(10*time.Minute))
		}
	}
	return nil
}

func normalizeChatOutput(out repgo.PredictionOutput) repgo.PredictionOutput {
	normalized := map[string]interface{}{"output": ""}
	if out == nil {
		return normalized
	}
	// replicate-go returns prediction.Output directly: can be []interface{} (Gemini stream) or string
	if arr, ok := out.([]interface{}); ok {
		var parts []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				parts = append(parts, s)
			}
		}
		normalized["output"] = strings.Join(parts, "")
		return normalized
	}
	if s, ok := out.(string); ok {
		normalized["output"] = s
		return normalized
	}
	// Fallback: full prediction object with "output" key
	outBytes, _ := json.Marshal(out)
	var raw map[string]interface{}
	if err := json.Unmarshal(outBytes, &raw); err != nil {
		return normalized
	}
	if arr, ok := raw["output"].([]interface{}); ok {
		var parts []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				parts = append(parts, s)
			}
		}
		normalized["output"] = strings.Join(parts, "")
		return normalized
	}
	if s, ok := raw["output"].(string); ok {
		normalized["output"] = s
		return normalized
	}
	return normalized
}

func (h *Handlers) ImageHandler(ctx context.Context, t *asynq.Task) error {
	var p ImagePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, `{"status":"running"}`, false)
			// Also publish to user-specific channel for streamAllJobs
			if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"running","type":"%s"}`, p.JobID.String(), job.Type)
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
			}
		}
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	if jobInput == nil {
		jobInput = make(map[string]interface{})
	}
	prompt, _ := jobInput["prompt"].(string)
	if prompt == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "prompt required", 0, "")
		return nil
	}
	size, _ := jobInput["size"].(string)
	if size == "" {
		size = "2K"
	}
	aspectRatio, _ := jobInput["aspect_ratio"].(string)
	if aspectRatio == "" {
		aspectRatio = "match_input_image"
	}

	// Edit using Brush: FLUX Fill Pro (image + mask + prompt)
	if inpaint, _ := jobInput["inpaint"].(bool); inpaint {
		imageURL, _ := jobInput["image"].(string)
		maskURL, _ := jobInput["mask"].(string)
		if imageURL != "" && maskURL != "" {
			model := h.Cfg.ModelFluxFill
			if model == "" {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_FLUX_FILL not set", 0, "")
				return nil
			}
			steps := 50
			if v, ok := jobInput["steps"].(float64); ok && v >= 15 && v <= 50 {
				steps = int(v)
			}
			guidance := 3.0
			if v, ok := jobInput["guidance"].(float64); ok && v >= 1.5 && v <= 100 {
				guidance = v
			}
			input := repgo.PredictionInput{
				"image":          imageURL,
				"mask":           maskURL,
				"prompt":         prompt,
				"steps":          steps,
				"guidance":       guidance,
				"output_format":  "jpg",
				"safety_tolerance": 2,
				"prompt_upsampling": false,
			}
			out, err := h.Repl.Run(ctx, model, input)
			if err != nil {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
				return err
			}
			outNormalized := normalizeNanoBananaOutput(out) // single URL
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", outNormalized, "", 0, "")
			if h.Stream != nil {
				_ = h.Stream.Publish(ctx, p.JobID, `{"status":"completed"}`, true)
				if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
					userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
					_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"image"}`, p.JobID.String()))
				}
			}
			if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
				h.invalidateJobCaches(ctx, job)
			}
			go mirrorMediaToR2(h, p.JobID, outNormalized, "image")
			return nil
		}
	}

	if size == "HD" {
		model := h.Cfg.ModelImageHD
		if model == "" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_IMAGE_HD not set", 0, "")
			return nil
		}
		input := repgo.PredictionInput{
			"prompt":        prompt,
			"aspect_ratio":  aspectRatio,
			"output_format": "jpg",
		}
		if urls, ok := jobInput["image_input"].([]interface{}); ok && len(urls) > 0 {
			var imgUrls []string
			for _, u := range urls {
				if s, ok := u.(string); ok && s != "" {
					imgUrls = append(imgUrls, s)
				}
			}
			if len(imgUrls) > 0 {
				input["image_input"] = imgUrls
			}
		}
		out, err := h.Repl.Run(ctx, model, input)
		if err != nil {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
			return err
		}
		// nano-banana returns single URL string; normalize to {"output": "url"} for r2mirror
		outNormalized := normalizeNanoBananaOutput(out)
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", outNormalized, "", 0, "")
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, `{"status":"completed"}`, true)
			// Also publish to user-specific channel for streamAllJobs
			if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"image"}`, p.JobID.String())
				log.Printf("[ImageHandler] Publishing job update: %s -> %s", userJobsChannel, updateMsg)
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
			}
		}
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			h.invalidateJobCaches(ctx, job)
		}
		go mirrorMediaToR2(h, p.JobID, outNormalized, "image")
		return nil
	}

	model := h.Cfg.ModelImage
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_IMAGE not set", 0, "")
		return nil
	}
	input := make(repgo.PredictionInput)
	for k, v := range jobInput {
		input[k] = v
	}
	if input["size"] == nil || input["size"] == "" {
		input["size"] = "2K"
	}
	if input["aspect_ratio"] == nil || input["aspect_ratio"] == "" {
		input["aspect_ratio"] = "match_input_image"
	}
	if input["max_images"] == nil {
		input["max_images"] = 4
	}
	if input["sequential_image_generation"] == nil || input["sequential_image_generation"] == "" {
		input["sequential_image_generation"] = "disabled"
	}
	out, err := h.Repl.Run(ctx, model, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		if h.Stream != nil {
			errMsg := jobErrorMsg(err)
			_ = h.Stream.Publish(ctx, p.JobID, fmt.Sprintf(`{"status":"failed","error":"%s"}`, errMsg), true)
		}
		return err
	}
	// Seedream returns array directly; r2mirror expects {"output": [...]}
	if arr, ok := out.([]interface{}); ok {
		out = map[string]interface{}{"output": arr}
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", out, "", 0, "")
	if h.Stream != nil {
		_ = h.Stream.Publish(ctx, p.JobID, `{"status":"completed"}`, true)
		// Also publish to user-specific channel for streamAllJobs
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"image"}`, p.JobID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
		}
	}
	if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
		h.invalidateJobCaches(ctx, job)
	}
	go mirrorMediaToR2(h, p.JobID, out, "image")
	return nil
}

// normalizeNanoBananaOutput: nano-banana returns single URL string; wrap as {"output": "url"} for r2mirror.
func normalizeNanoBananaOutput(out repgo.PredictionOutput) repgo.PredictionOutput {
	if s, ok := out.(string); ok && s != "" {
		return map[string]interface{}{"output": s}
	}
	if m, ok := out.(map[string]interface{}); ok && m["output"] != nil {
		return out
	}
	return out
}

func (h *Handlers) LogoHandler(ctx context.Context, t *asynq.Task) error {
	var p LogoPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Stream != nil {
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"running","type":"logo"}`, p.JobID.String()))
		}
	}
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	model := h.Cfg.ModelImageHD
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Logo model not configured", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	prompt, _ := jobInput["prompt"].(string)
	if prompt == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "prompt required", 0, "")
		return nil
	}
	aspectRatio, _ := jobInput["aspect_ratio"].(string)
	if aspectRatio == "" {
		aspectRatio = "1:1"
	}
	outputFormat, _ := jobInput["output_format"].(string)
	if outputFormat != "jpg" && outputFormat != "jpeg" && outputFormat != "png" {
		outputFormat = "png"
	}
	logoType, _ := jobInput["logo_type"].(string)
	style, _ := jobInput["style"].(string)
	primaryColor, _ := jobInput["primary_color"].(string)
	secondaryColor, _ := jobInput["secondary_color"].(string)
	logoText, _ := jobInput["logo_text"].(string)
	logoText = strings.TrimSpace(logoText)

	// Build logo brief: we add context that it's a logo; never expose model name to user.
	logoBrief := "Professional logo design, high quality. "
	if logoText != "" {
		logoBrief += "Text to include in logo: " + logoText + ". "
	} else {
		logoBrief += "No text in the logo (symbol/icon only). "
	}
	if logoType != "" {
		logoBrief += "Logo type: " + logoType + ". "
	}
	if style != "" {
		logoBrief += "Style: " + style + ". "
	}
	if primaryColor != "" || secondaryColor != "" {
		logoBrief += "Colors: "
		if primaryColor != "" {
			logoBrief += "primary " + primaryColor
		}
		if secondaryColor != "" {
			if primaryColor != "" {
				logoBrief += ", "
			}
			logoBrief += "secondary " + secondaryColor
		}
		logoBrief += ". "
	}
	logoBrief += "Design: " + prompt

	replInput := repgo.PredictionInput{
		"prompt":        logoBrief,
		"aspect_ratio":  aspectRatio,
		"output_format": outputFormat,
	}

	// Generate 3 variants (same prompt, 3 calls)
	var urls []string
	for i := 0; i < 3; i++ {
		out, err := h.Repl.Run(ctx, model, replInput)
		if err != nil {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
			return nil
		}
		normalized := normalizeNanoBananaOutput(out)
		if m, ok := normalized.(map[string]interface{}); ok && m["output"] != nil {
			if s, ok := m["output"].(string); ok && s != "" {
				urls = append(urls, s)
			}
		}
	}
	if len(urls) == 0 {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "No logo output", 0, "")
		return nil
	}
	outNormalized := map[string]interface{}{"output": urls}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", outNormalized, "", 0, "")
	if h.Stream != nil {
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"logo"}`, p.JobID.String()))
		}
	}
	if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
		h.invalidateJobCaches(ctx, job)
	}
	go mirrorMediaToR2(h, p.JobID, outNormalized, "image")
	return nil
}

func (h *Handlers) VideoHandler(ctx context.Context, t *asynq.Task) error {
	var p VideoPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, `{"status":"running"}`, false)
			// Also publish to user-specific channel for streamAllJobs
			if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"running","type":"%s"}`, p.JobID.String(), job.Type)
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
			}
		}
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, `{"status":"failed","error":"Replicate not configured"}`, true)
		}
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	videoModel, _ := jobInput["video_model"].(string)
	if videoModel != "2" {
		videoModel = "1"
	}
	var model string
	var input repgo.PredictionInput
	if videoModel == "2" {
		model = h.Cfg.ModelVideo2
		if model == "" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_VIDEO_2 not set", 0, "")
			return nil
		}
		dur := 5 // Kling only supports 5 or 10 seconds
		if v, ok := jobInput["duration"].(float64); ok && (v == 5 || v == 10) {
			dur = int(v)
		}
		ar := "16:9"
		if v, _ := jobInput["aspect_ratio"].(string); v != "" {
			ar = v
		}
		input = repgo.PredictionInput{
			"prompt":       jobInput["prompt"],
			"duration":     dur,
			"aspect_ratio": ar,
		}
		if s, _ := jobInput["start_image"].(string); s != "" {
			input["start_image"] = s
		}
		if s, _ := jobInput["end_image"].(string); s != "" {
			input["end_image"] = s
		}
	} else {
		model = h.Cfg.ModelVideo
		if model == "" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_VIDEO not set", 0, "")
			return nil
		}
		input = make(repgo.PredictionInput)
		for k, v := range jobInput {
			input[k] = v
		}
		if input["duration"] == nil {
			input["duration"] = 5
		}
		if input["aspect_ratio"] == nil || input["aspect_ratio"] == "" {
			input["aspect_ratio"] = "16:9"
		}
		if input["resolution"] == nil || input["resolution"] == "" {
			input["resolution"] = "720p"
		}
	}
	out, err := h.Repl.Run(ctx, model, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		if h.Stream != nil {
			errMsg := jobErrorMsg(err)
			_ = h.Stream.Publish(ctx, p.JobID, fmt.Sprintf(`{"status":"failed","error":"%s"}`, errMsg), true)
		}
		return err
	}
	outNormalized := out
	if s, ok := out.(string); ok && s != "" {
		outNormalized = map[string]interface{}{"output": s}
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", outNormalized, "", 0, "")
	if h.Stream != nil {
		_ = h.Stream.Publish(ctx, p.JobID, `{"status":"completed"}`, true)
		// Also publish to user-specific channel for streamAllJobs
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"video"}`, p.JobID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
		}
	}
	if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
		h.invalidateJobCaches(ctx, job)
	}
	go mirrorMediaToR2(h, p.JobID, outNormalized, "video")
	return nil
}

func (h *Handlers) UpscaleHandler(ctx context.Context, t *asynq.Task) error {
	var p UpscalePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Stream != nil {
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			_ = h.Stream.Publish(ctx, p.JobID, `{"status":"running"}`, false)
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"running","type":"upscale"}`, p.JobID.String()))
		}
	}
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	model := h.Cfg.ModelUpscale
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_UPSCALE not set", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	imageURL, _ := jobInput["image_url"].(string)
	if imageURL == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "missing image_url", 0, "")
		return nil
	}
	scale := 2
	if v, ok := jobInput["scale"].(float64); ok && (v == 2 || v == 4) {
		scale = int(v)
	}
	upscaleFactor := "2x"
	if scale == 4 {
		upscaleFactor = "4x"
	}
	enhanceModel := "Standard V2"
	if v, ok := jobInput["enhance_model"].(string); ok && v != "" {
		enhanceModel = v
	}
	outputFormat := "jpg"
	if v, ok := jobInput["output_format"].(string); ok && (v == "jpg" || v == "png") {
		outputFormat = v
	}
	faceEnhancement := false
	if v, ok := jobInput["face_enhancement"].(bool); ok {
		faceEnhancement = v
	}
	subjectDetection := "None"
	if v, ok := jobInput["subject_detection"].(string); ok && v != "" {
		subjectDetection = v
	}
	faceCreativity := 0.0
	if v, ok := jobInput["face_enhancement_creativity"].(float64); ok && v >= 0 && v <= 1 {
		faceCreativity = v
	}
	faceStrength := 0.8
	if v, ok := jobInput["face_enhancement_strength"].(float64); ok && v >= 0 && v <= 1 {
		faceStrength = v
	}
	input := repgo.PredictionInput{
		"image":            imageURL,
		"enhance_model":    enhanceModel,
		"output_format":    outputFormat,
		"upscale_factor":   upscaleFactor,
		"face_enhancement": faceEnhancement,
		"subject_detection": subjectDetection,
	}
	if faceEnhancement {
		input["face_enhancement_creativity"] = faceCreativity
		input["face_enhancement_strength"] = faceStrength
	}
	out, err := h.Repl.Run(ctx, model, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, fmt.Sprintf(`{"status":"failed","error":"%s"}`, jobErrorMsg(err)), true)
		}
		return err
	}
	outNormalized := normalizeNanoBananaOutput(out)
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", outNormalized, "", 0, "")
	if h.Stream != nil {
		_ = h.Stream.Publish(ctx, p.JobID, `{"status":"completed"}`, true)
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"upscale"}`, p.JobID.String()))
		}
	}
	if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
		h.invalidateJobCaches(ctx, job)
	}
	go mirrorMediaToR2(h, p.JobID, outNormalized, "image")
	return nil
}

func (h *Handlers) CancelStaleJobsHandler(ctx context.Context, t *asynq.Task) error {
	jobs, err := h.DB.ListStalePendingJobs(ctx, JobTimeoutMinutes)
	if err != nil || len(jobs) == 0 {
		return err
	}
	for _, j := range jobs {
		if j.ReplicateID != nil && *j.ReplicateID != "" && h.Repl != nil {
			_ = h.Repl.CancelPrediction(ctx, *j.ReplicateID)
		}
		_ = h.DB.UpdateJobStatus(ctx, j.ID, "failed", nil, "Job cancelled (timeout)", 0, "")
	}
	return nil
}

func (h *Handlers) SummarizeThreadHandler(ctx context.Context, t *asynq.Task) error {
	var p SummarizeThreadPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	thread, err := h.DB.GetThreadByID(ctx, p.ThreadID)
	if err != nil || thread == nil {
		return nil
	}
	// ListJobsByThread requires userID - get from thread
	jobs, err := h.DB.ListJobsByThread(ctx, p.ThreadID, thread.UserID)
	if err != nil || len(jobs) == 0 {
		return nil
	}
	// Build short context from last 1–2 chat exchanges (prompt + output)
	var parts []string
	n := len(jobs)
	if n > 4 {
		n = 4
	}
	for i := len(jobs) - n; i < len(jobs); i++ {
		j := jobs[i]
		if j.Type != "chat" {
			continue
		}
		var input map[string]interface{}
		if len(j.Input) > 0 {
			_ = json.Unmarshal(j.Input, &input)
		}
		if p, _ := input["prompt"].(string); p != "" {
			if len(p) > 200 {
				p = p[:200] + "..."
			}
			parts = append(parts, "User: "+p)
		}
		if len(j.Output) > 0 {
			var out map[string]interface{}
			_ = json.Unmarshal(j.Output, &out)
			if s, _ := out["output"].(string); s != "" {
				if len(s) > 300 {
					s = s[:300] + "..."
				}
				parts = append(parts, "Assistant: "+s)
			}
		}
	}
	if len(parts) == 0 {
		return nil
	}
	prompt := "Summarize this conversation in at most 6-8 words, title case, no quotes. Use the topic/subject (e.g. 'Physics formula', 'Image idea'), not generic words like User, AI, Greeting, Hello:\n\n" + strings.Join(parts, "\n\n")
	if h.Repl == nil || h.Cfg.ModelText == "" {
		return nil
	}
	out, err := h.Repl.Run(ctx, h.Cfg.ModelText, repgo.PredictionInput{"prompt": prompt, "max_output_tokens": 50})
	if err != nil {
		return err
	}
	normalized := normalizeChatOutput(out)
	var title string
	if m, ok := normalized.(map[string]interface{}); ok {
		if v, ok := m["output"].(string); ok && len(strings.TrimSpace(v)) > 0 {
			title = strings.TrimSpace(v)
			if len(title) > 80 {
				title = title[:80]
			}
		}
	}
	if title != "" {
		_ = h.DB.UpdateThreadTitle(ctx, p.ThreadID, title)
	}
	return nil
}

// fetchPageText fetches a URL and returns stripped plain text (max ~6000 chars).
func fetchPageText(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Flipo5SEO/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d from %s", resp.StatusCode, rawURL)
	}
	// Read at most 1 MB
	body := make([]byte, 0, 1024*1024)
	buf := make([]byte, 4096)
	read := 0
	for read < 1024*1024 {
		n, readErr := resp.Body.Read(buf)
		body = append(body, buf[:n]...)
		read += n
		if readErr != nil {
			break
		}
	}
	html := string(body)
	// Remove <script> and <style> blocks
	for _, tag := range []string{"script", "style", "noscript", "nav", "footer", "header"} {
		for {
			open := strings.Index(strings.ToLower(html), "<"+tag)
			if open < 0 {
				break
			}
			close := strings.Index(strings.ToLower(html[open:]), "</"+tag+">")
			if close < 0 {
				break
			}
			html = html[:open] + " " + html[open+close+len("</"+tag+">"):]
		}
	}
	// Strip remaining HTML tags
	inTag := false
	var sb strings.Builder
	for _, ch := range html {
		if ch == '<' {
			inTag = true
			sb.WriteRune(' ')
			continue
		}
		if ch == '>' {
			inTag = false
			continue
		}
		if !inTag {
			sb.WriteRune(ch)
		}
	}
	text := sb.String()
	// Decode common entities
	replacer := strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`,
		"&apos;", "'", "&#39;", "'", "&nbsp;", " ", "&hellip;", "...",
	)
	text = replacer.Replace(text)
	// Normalize whitespace
	var clean strings.Builder
	prevSpace := false
	for _, ch := range text {
		isSpace := ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
		if isSpace {
			if !prevSpace {
				clean.WriteRune('\n')
			}
			prevSpace = true
		} else {
			clean.WriteRune(ch)
			prevSpace = false
		}
	}
	result := strings.TrimSpace(clean.String())
	// Limit to ~6000 chars for AI prompt
	if len(result) > 6000 {
		result = result[:6000] + "…"
	}
	return result, nil
}

func (h *Handlers) SEOHandler(ctx context.Context, t *asynq.Task) error {
	var p SEOPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	model := h.Cfg.ModelText
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_TEXT not set", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	sourceText, _ := jobInput["source_text"].(string)
	sourceURL, _ := jobInput["source_url"].(string)
	lang, _ := jobInput["language"].(string)
	if lang == "" {
		lang = "English"
	}
	outputFmt, _ := jobInput["output_format"].(string)
	if outputFmt == "" {
		outputFmt = "both"
	}

	userContent := ""
	fetchedURL := ""
	if sourceURL != "" {
		// Actually fetch the page content
		fetchCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		fetched, fetchErr := fetchPageText(fetchCtx, sourceURL)
		cancel()
		if fetchErr != nil {
			log.Printf("[SEOHandler] URL fetch failed for %s: %v", sourceURL, fetchErr)
			// Fallback: tell AI the URL and ask it to work from that
			userContent = "URL: " + sourceURL + "\n(page could not be fetched — use the URL to infer topic and create SEO content)\n\n"
		} else {
			fetchedURL = sourceURL
			userContent = "Source URL: " + sourceURL + "\n\nPage content extracted:\n" + fetched + "\n\n"
		}
	}
	if sourceText != "" {
		userContent += "Additional content to optimize:\n" + sourceText
	}
	if userContent == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "no source text or URL provided", 0, "")
		return nil
	}
	_ = fetchedURL // used for logging only

	// Build output instructions based on user preference
	articleInstruction := `- "article": string, 1000-1400 words, markdown, with intro + 3-4 H2 sections + FAQ + conclusion`
	htmlInstruction := `- "html": string, clean semantic HTML5 (h1,h2,h3,p,ul,li,strong), no inline styles, full article`
	var outputKeys string
	switch outputFmt {
	case "markdown":
		outputKeys = articleInstruction + "\n- \"html\": null"
	case "html":
		outputKeys = `- "article": null` + "\n" + htmlInstruction
	default: // "both"
		outputKeys = articleInstruction + "\n" + htmlInstruction
	}
	systemPrompt := `You are a senior SEO specialist and content strategist. Your task is to analyze the provided page content and produce a comprehensive SEO optimization package.

Respond ONLY with a valid JSON object (no markdown fences, no comments) with EXACTLY these keys:
- "meta_title": string, 50-60 chars, compelling, primary keyword near start
- "meta_description": string, 150-160 chars, includes a CTA verb
- "keywords": array of 10-14 strings (mix of short-tail and long-tail)
- "slug": string, URL-safe, max 5-6 words, hyphens only
- "focus_keyword": string, single most important keyword
` + outputKeys + `
- "readability_tips": array of 3-5 short strings with concrete improvement suggestions
- "internal_links": array of 3-5 objects with {anchor: string, topic: string}

Language: ` + lang + `
Output format requested: ` + outputFmt + `
Tone: Authoritative, trustworthy, conversion-focused.`

	maxTokens := 6000
	if outputFmt != "both" {
		maxTokens = 4096
	}
	input := map[string]interface{}{
		"system_prompt": systemPrompt,
		"prompt":        "Analyze and produce full SEO package for:\n\n" + userContent,
		"max_tokens":    maxTokens,
	}

	pred, err := h.Repl.CreatePredictionWithStream(ctx, model, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, pred.ID)

	// Poll until done (SEO doesn't use streaming)
	for i := 0; i < 60; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			errMsg := "Prediction failed"
			if state.Error != nil {
				if s, ok := state.Error.(string); ok {
					errMsg = s
				}
			}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, errMsg, 0, pred.ID)
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			final := map[string]interface{}{"output": outText}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", final, "", 0, pred.ID)
			// Save as user file automatically
			if outText != "" {
				title, _ := jobInput["title"].(string)
				if title == "" {
					title = "SEO Article"
				}
				_, _ = h.DB.CreateUserFile(ctx, job.UserID, title, outText, "seo")
			}
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"seo"}`, p.JobID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
			}
			if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
				h.invalidateJobCaches(ctx, job)
			}
			return nil
		}
		time.Sleep(3 * time.Second)
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "timeout", 0, pred.ID)
	return nil
}

func (h *Handlers) OutlineHandler(ctx context.Context, t *asynq.Task) error {
	var p OutlinePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Repl == nil || h.Cfg.ModelText == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "AI not configured", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	topic, _ := jobInput["topic"].(string)
	audience, _ := jobInput["audience"].(string)
	lang, _ := jobInput["language"].(string)
	wordCount, _ := jobInput["word_count"].(string)
	if lang == "" {
		lang = "English"
	}
	if wordCount == "" {
		wordCount = "1500"
	}
	if topic == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "topic required", 0, "")
		return nil
	}
	audienceLine := ""
	if audience != "" {
		audienceLine = "\nTarget audience: " + audience
	}
	systemPrompt := `You are an expert content strategist and blog writer. Create a detailed blog post outline.

Respond ONLY with a valid JSON object (no markdown fences) with EXACTLY these keys:
- "title": string — compelling H1 blog title (includes primary keyword)
- "hook": string — 2-3 sentence opening hook for the intro
- "estimated_words": number — estimated total word count
- "target_keywords": array of 6-10 strings
- "sections": array of section objects, each with:
  - "heading": string (H2)
  - "summary": string (1-2 sentences about what this section covers)
  - "talking_points": array of 3-5 strings (key points to cover)
  - "subsections": array (optional) of { "heading": string (H3), "points": string[] }
- "conclusion_cta": string — conclusion + call to action suggestion
- "meta_title": string — 50-60 chars
- "meta_description": string — 150-160 chars
- "slug": string — URL slug

Language: ` + lang + audienceLine + `
Target word count: ~` + wordCount + ` words
Tone: Authoritative yet engaging.`

	input := map[string]interface{}{
		"system_prompt": systemPrompt,
		"prompt":        "Create a detailed blog outline for: " + topic,
		"max_tokens":    3000,
	}
	pred, err := h.Repl.CreatePredictionWithStream(ctx, h.Cfg.ModelText, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, pred.ID)
	for i := 0; i < 40; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Prediction failed", 0, pred.ID)
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			final := map[string]interface{}{"output": outText}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", final, "", 0, pred.ID)
			if outText != "" {
				name := "Outline – " + topic
				if len(name) > 80 {
					name = name[:80]
				}
				_, _ = h.DB.CreateUserFile(ctx, job.UserID, name, outText, "text")
			}
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"outline"}`, p.JobID.String()))
			}
			return nil
		}
		time.Sleep(3 * time.Second)
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "timeout", 0, pred.ID)
	return nil
}

func (h *Handlers) TranslateHandler(ctx context.Context, t *asynq.Task) error {
	var p TranslatePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Repl == nil || h.Cfg.ModelText == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "AI not configured", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	sourceURL, _ := jobInput["source_url"].(string)
	sourceText, _ := jobInput["source_text"].(string)
	sourceLang, _ := jobInput["source_lang"].(string)
	targetLang, _ := jobInput["target_lang"].(string)
	if targetLang == "" {
		targetLang = "English"
	}
	if sourceLang == "" {
		sourceLang = "auto"
	}

	var sourceImages []string
	if si, ok := jobInput["source_images"].([]interface{}); ok {
		for _, v := range si {
			if s, _ := v.(string); s != "" {
				sourceImages = append(sourceImages, s)
			}
		}
	}
	sourceAudio, _ := jobInput["source_audio"].(string)
	sourceAudio = strings.TrimSpace(sourceAudio)

	// Resolve storage keys (uploads/...) to public URLs so Replicate/Cloudflare can fetch them (same as chat images).
	resolveMediaURL := func(u string) string {
		if u == "" {
			return u
		}
		if strings.HasPrefix(u, "uploads/") && h.Store != nil {
			return h.Store.URL(u)
		}
		return u
	}
	for i := range sourceImages {
		sourceImages[i] = resolveMediaURL(sourceImages[i])
	}
	sourceAudio = resolveMediaURL(sourceAudio)
	// Replicate needs fetchable https URLs; if still a key, public URL is not configured.
	for _, u := range sourceImages {
		if u != "" && !strings.HasPrefix(u, "https://") {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Image URL not public: set S3_PUBLIC_URL or CLOUDFLARE_R2_PUBLIC_URL for uploads", 0, "")
			return nil
		}
	}
	if sourceAudio != "" && !strings.HasPrefix(sourceAudio, "https://") {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Audio URL not public: set S3_PUBLIC_URL or CLOUDFLARE_R2_PUBLIC_URL for uploads", 0, "")
		return nil
	}

	textToTranslate := strings.TrimSpace(sourceText)
	if sourceURL != "" && len(sourceImages) == 0 && sourceAudio == "" {
		fetchCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		fetched, fetchErr := fetchPageText(fetchCtx, sourceURL)
		cancel()
		if fetchErr != nil {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Failed to fetch URL: "+fetchErr.Error(), 0, "")
			return nil
		}
		textToTranslate = fetched
	}

	// Build model input: prompt required; optionally images, audio (Gemini-style).
	var prompt string
	var input map[string]interface{}

	if len(sourceImages) > 0 {
		prompt = fmt.Sprintf("Translate the text visible in these images from %s to %s. Output ONLY the translation, no explanations. Preserve structure (paragraphs, line breaks).", sourceLang, targetLang)
		input = map[string]interface{}{
			"prompt":     prompt,
			"images":     sourceImages,
			"max_tokens": 8000,
		}
		input["system_prompt"] = "You are a professional translator. Output only the translated text, nothing else."
		input["system_instruction"] = input["system_prompt"]
	} else if sourceAudio != "" {
		prompt = fmt.Sprintf("Transcribe and translate this audio from %s to %s. Output ONLY the translation (or transcription if same language). No explanations.", sourceLang, targetLang)
		input = map[string]interface{}{
			"prompt":     prompt,
			"audio":      sourceAudio,
			"max_tokens": 8000,
		}
		input["system_prompt"] = "You are a professional translator. Output only the translated/transcribed text, nothing else."
		input["system_instruction"] = input["system_prompt"]
	} else {
		if textToTranslate == "" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "No text to translate (provide source_url, source_text, source_images or source_audio)", 0, "")
			return nil
		}
		if len(textToTranslate) > 50000 {
			textToTranslate = textToTranslate[:50000] + "\n[... truncated]"
		}
		systemPrompt := "You are a professional translator. Translate the user's text accurately. Preserve paragraphs, line breaks, and structure. Output ONLY the translation, no explanations or notes. If the source language is 'auto', detect it. Do not add any preamble."
		prompt = fmt.Sprintf("Translate from %s to %s:\n\n%s", sourceLang, targetLang, textToTranslate)
		input = map[string]interface{}{
			"system_prompt": systemPrompt,
			"prompt":        prompt,
			"max_tokens":    8000,
		}
	}

	pred, err := h.Repl.CreatePredictionWithStream(ctx, h.Cfg.ModelText, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, pred.ID)
	for i := 0; i < 50; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			errMsg := "Prediction failed"
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, errMsg, 0, pred.ID)
			itemIDStr, _ := jobInput["item_id"].(string)
			if itemIDStr != "" {
				if itemID, err := uuid.Parse(itemIDStr); err == nil {
					_ = h.DB.UpdateTranslationItemAfterJob(ctx, itemID, p.JobID, "failed", nil, &errMsg)
				}
			}
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			outText = strings.TrimSpace(outText)
			final := map[string]interface{}{"output": outText}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", final, "", 0, pred.ID)
			itemIDStr, _ := jobInput["item_id"].(string)
			if itemIDStr != "" {
				if itemID, err := uuid.Parse(itemIDStr); err == nil {
					_ = h.DB.UpdateTranslationItemAfterJob(ctx, itemID, p.JobID, "completed", &outText, nil)
				}
			}
			if outText != "" && itemIDStr == "" {
				name := "Translation – " + targetLang
				if len(name) > 80 {
					name = name[:80]
				}
				_, _ = h.DB.CreateUserFile(ctx, job.UserID, name, outText, "text")
			}
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"translate"}`, p.JobID.String()))
			}
			return nil
		}
		time.Sleep(3 * time.Second)
	}
	errMsg := "timeout"
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, errMsg, 0, pred.ID)
	itemIDStr, _ := jobInput["item_id"].(string)
	if itemIDStr != "" {
		if itemID, err := uuid.Parse(itemIDStr); err == nil {
			_ = h.DB.UpdateTranslationItemAfterJob(ctx, itemID, p.JobID, "failed", nil, &errMsg)
		}
	}
	return nil
}

func (h *Handlers) ProductAnalyzeHandler(ctx context.Context, t *asynq.Task) error {
	var p queue.ProductAnalyzePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	var imageURLs []string
	if urls, ok := jobInput["image_urls"].([]interface{}); ok {
		for _, v := range urls {
			if s, ok := v.(string); ok && s != "" {
				u := s
				if strings.HasPrefix(u, "uploads/") && h.Store != nil {
					u = h.Store.URL(u)
				}
				imageURLs = append(imageURLs, u)
			}
		}
	}
	if len(imageURLs) == 0 {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "At least one product image required", 0, "")
		return nil
	}
	if h.Repl == nil || h.Cfg.ModelText == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "AI not configured", 0, "")
		return nil
	}
	prompt := "Analyze these product photos. Are they sufficient for generating new product images (e.g. different backgrounds or scenes)? Reply in 1–2 sentences: either 'OK' or suggest what to add (e.g. more angles, better lighting, neutral background). Output only the analysis, no preamble."
	input := map[string]interface{}{
		"prompt":        prompt,
		"images":        imageURLs,
		"max_tokens":    500,
		"system_prompt": "You are a product photography assistant. Be brief and practical.",
	}
	pred, err := h.Repl.CreatePredictionWithStream(ctx, h.Cfg.ModelText, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	for i := 0; i < 30; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Analysis failed", 0, pred.ID)
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			outText = strings.TrimSpace(outText)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", map[string]interface{}{"output": outText}, "", 0, pred.ID)
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"product_analyze"}`, p.JobID.String()))
			}
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "timeout", 0, pred.ID)
	return nil
}

func (h *Handlers) ProductScoreHandler(ctx context.Context, t *asynq.Task) error {
	var p queue.ProductScorePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	productIDStr, _ := jobInput["product_id"].(string)
	if productIDStr == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "product_id required", 0, "")
		return nil
	}
	productID, err := uuid.Parse(productIDStr)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "invalid product_id", 0, "")
		return nil
	}
	product, err := h.DB.GetProduct(ctx, productID, job.UserID)
	if err != nil || product == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "product not found", 0, "")
		return nil
	}
	photos, err := h.DB.ListProductPhotos(ctx, productID)
	if err != nil || len(photos) == 0 {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "no photos to score", 0, "")
		return nil
	}
	var imageURLs []string
	for _, ph := range photos {
		u := ph.ImageURL
		if strings.HasPrefix(u, "uploads/") && h.Store != nil {
			u = h.Store.URL(u)
		}
		imageURLs = append(imageURLs, u)
	}
	if h.Repl == nil || h.Cfg.ModelText == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "AI not configured", 0, "")
		return nil
	}
	prompt := fmt.Sprintf("You have %d product photos. For each image rate 1-10: how clear and suitable is this product photo for generating new marketing images (visibility of product, lighting, framing). Reply with ONLY a JSON array of numbers, one per image in the same order, e.g. [7, 6, 8]. No other text.", len(imageURLs))
	input := map[string]interface{}{
		"prompt":        prompt,
		"images":        imageURLs,
		"max_tokens":    200,
		"system_prompt": "You are a product photo quality rater. Output only a JSON array of numbers 1-10.",
	}
	pred, err := h.Repl.CreatePredictionWithStream(ctx, h.Cfg.ModelText, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	for i := 0; i < 30; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Scoring failed", 0, pred.ID)
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			outText = strings.TrimSpace(outText)
			// Parse JSON array: [7, 6, 8] (may be wrapped in markdown code block)
			scores := parseScoreArray(outText)
			if len(scores) == 0 || len(scores) != len(photos) {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Could not parse scores (expected "+fmt.Sprint(len(photos))+" numbers)", 0, pred.ID)
				return nil
			}
			if err := h.DB.UpdateProductPhotoScores(ctx, productID, scores); err != nil {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Failed to save scores", 0, pred.ID)
				return nil
			}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", map[string]interface{}{"scores": scores}, "", 0, pred.ID)
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"product_score"}`, p.JobID.String()))
			}
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "timeout", 0, pred.ID)
	return nil
}

// parseScoreArray extracts a slice of float64 from AI output (e.g. "[7, 6, 8]" or "```json\n[7,6,8]\n```").
func parseScoreArray(s string) []float64 {
	s = strings.TrimSpace(s)
	// Remove markdown code block if present
	if idx := strings.Index(s, "["); idx >= 0 {
		s = s[idx:]
	}
	if idx := strings.LastIndex(s, "]"); idx >= 0 {
		s = s[:idx+1]
	}
	var arr []float64
	if err := json.Unmarshal([]byte(s), &arr); err != nil {
		return nil
	}
	for i := range arr {
		if arr[i] < 0 {
			arr[i] = 0
		}
		if arr[i] > 10 {
			arr[i] = 10
		}
	}
	return arr
}

func (h *Handlers) Register(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeChat, h.ChatHandler)
	mux.HandleFunc(TypeImage, h.ImageHandler)
	mux.HandleFunc(TypeVideo, h.VideoHandler)
	mux.HandleFunc(TypeUpscale, h.UpscaleHandler)
	mux.HandleFunc(TypeSEO, h.SEOHandler)
	mux.HandleFunc(TypeOutline, h.OutlineHandler)
	mux.HandleFunc(TypeTranslate, h.TranslateHandler)
	mux.HandleFunc(TypeLogo, h.LogoHandler)
	mux.HandleFunc(TypeProductAnalyze, h.ProductAnalyzeHandler)
	mux.HandleFunc(TypeProductScore, h.ProductScoreHandler)
	mux.HandleFunc(TypeSummarizeThread, h.SummarizeThreadHandler)
	mux.HandleFunc(TypeCancelStaleJobs, h.CancelStaleJobsHandler)
}
