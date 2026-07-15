package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"flipo5/backend/internal/textmodel"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

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

	// Build model input: Claude Fable or legacy Gemini.
	var prompt string
	var input repgo.PredictionInput

	if len(sourceImages) > 0 {
		prompt = fmt.Sprintf("Translate the text visible in this image from %s to %s. Output ONLY the translation, no explanations. Preserve structure (paragraphs, line breaks).", sourceLang, targetLang)
		input = textmodel.BuildInput(h.Cfg.ModelText,
			"You are a professional translator. Output only the translated text, nothing else.",
			prompt, sourceImages, 8000)
	} else if sourceAudio != "" {
		if textmodel.IsClaude(h.Cfg.ModelText) {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Audio translation is not supported with the current text model", 0, "")
			return nil
		}
		prompt = fmt.Sprintf("Transcribe and translate this audio from %s to %s. Output ONLY the translation (or transcription if same language). No explanations.", sourceLang, targetLang)
		input = map[string]interface{}{
			"prompt":        prompt,
			"audio":         sourceAudio,
			"max_tokens":    8000,
			"system_prompt": "You are a professional translator. Output only the translated/transcribed text, nothing else.",
		}
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
		input = textmodel.BuildInput(h.Cfg.ModelText, systemPrompt, prompt, nil, 8000)
	}

	pred, err := h.Repl.CreatePredictionWithStreamFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), input)
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
