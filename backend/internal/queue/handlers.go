package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	if job.Type == "image" || job.Type == "video" {
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
		images := make([]string, 0, len(urls))
		for _, u := range urls {
			if s, ok := u.(string); ok && s != "" {
				images = append(images, s)
			}
		}
		if len(images) > 0 {
			input["images"] = images
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
	model := h.Cfg.ModelVideo
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_VIDEO not set", 0, "")
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
	input := make(repgo.PredictionInput)
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

func (h *Handlers) Register(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeChat, h.ChatHandler)
	mux.HandleFunc(TypeImage, h.ImageHandler)
	mux.HandleFunc(TypeVideo, h.VideoHandler)
	mux.HandleFunc(TypeSummarizeThread, h.SummarizeThreadHandler)
	mux.HandleFunc(TypeCancelStaleJobs, h.CancelStaleJobsHandler)
}
