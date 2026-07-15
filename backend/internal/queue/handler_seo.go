package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
)

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

	pred, err := h.Repl.CreatePredictionWithStreamFallback(ctx, model, h.textFallbacks(), input)
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
