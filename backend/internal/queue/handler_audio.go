package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

func (h *Handlers) AudioHandler(ctx context.Context, t *asynq.Task) error {
	var p AudioPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Stream != nil {
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"running","type":"audio"}`, p.JobID.String()))
		}
	}
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	model := h.Cfg.ModelAudio
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Audio model not configured", 0, "")
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
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "prompt required", 0, "")
		return nil
	}
	instrumental, _ := jobInput["instrumental"].(bool)
	if v, ok := jobInput["force_instrumental"].(bool); ok {
		instrumental = v
	}
	audioMode, _ := jobInput["audio_mode"].(string)
	audioMode = strings.ToLower(strings.TrimSpace(audioMode))
	if audioMode != "vocal" {
		audioMode = "music"
	}
	if audioMode == "vocal" {
		instrumental = false
	}
	numVariants := 1
	if v, ok := jobInput["num_variants"].(float64); ok {
		n := int(v)
		if n >= 1 && n <= 4 {
			numVariants = n
		}
	}
	outputFormat, _ := jobInput["output_format"].(string)
	switch outputFormat {
	case "mp3_standard", "mp3_high_quality", "wav_16khz", "wav_22khz", "wav_24khz", "wav_cd_quality":
	default:
		outputFormat = "mp3_standard"
	}
	musicLengthMs := 10000
	if v, ok := jobInput["music_length_ms"].(float64); ok {
		n := int(v)
		if n >= 5000 && n <= 300000 {
			musicLengthMs = n
		}
	}

	replInput := repgo.PredictionInput{
		"prompt":             prompt,
		"force_instrumental": instrumental,
		"music_length_ms":    musicLengthMs,
		"output_format":      outputFormat,
	}
	audioAction, _ := jobInput["audio_action"].(string)
	audioAction = strings.ToLower(strings.TrimSpace(audioAction))
	sourceAudio, _ := jobInput["source_audio"].(string)
	sourceAudio = resolveMediaURL(h, strings.TrimSpace(sourceAudio))
	if sourceAudio != "" {
		replInput["source_audio"] = sourceAudio
	}
	switch audioAction {
	case "extend":
		prompt = "Continue and extend this track seamlessly, same style and tempo: " + prompt
		replInput["prompt"] = prompt
	case "remix":
		prompt = "Remix this track with a fresh arrangement while keeping the core melody: " + prompt
		replInput["prompt"] = prompt
	case "stems":
		prompt = "Generate separated stems (drums, bass, melody, vocals if any) for: " + prompt
		replInput["prompt"] = prompt
		replInput["output_stems"] = true
	}

	var urls []string
	for i := 0; i < numVariants; i++ {
		out, err := h.Repl.Run(ctx, model, replInput)
		if err != nil {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
			return nil
		}
		switch v := out.(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				urls = append(urls, strings.TrimSpace(v))
			}
		case []interface{}:
			for _, item := range v {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					urls = append(urls, strings.TrimSpace(s))
				}
			}
		case map[string]interface{}:
			if ov, ok := v["output"]; ok {
				if s, ok := ov.(string); ok && strings.TrimSpace(s) != "" {
					urls = append(urls, strings.TrimSpace(s))
				}
				if arr, ok := ov.([]interface{}); ok {
					for _, item := range arr {
						if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
							urls = append(urls, strings.TrimSpace(s))
						}
					}
				}
			}
		}
	}
	if len(urls) == 0 {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "No audio output", 0, "")
		return nil
	}
	outNormalized := map[string]interface{}{"output": urls}

	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", outNormalized, "", 0, "")
	if h.Stream != nil {
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"audio"}`, p.JobID.String()))
		}
	}
	if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
		h.invalidateJobCaches(ctx, job)
	}
	go mirrorMediaToR2(h, p.JobID, outNormalized, "audio")
	return nil
}
