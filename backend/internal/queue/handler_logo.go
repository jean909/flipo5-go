package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

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
