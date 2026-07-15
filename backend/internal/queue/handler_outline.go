package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
)

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
	pred, err := h.Repl.CreatePredictionWithStreamFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), input)
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
