package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

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
				"image":             imageURL,
				"mask":              maskURL,
				"prompt":            prompt,
				"steps":             steps,
				"guidance":          guidance,
				"output_format":     "jpg",
				"safety_tolerance":  2,
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
	if size == "4K" && h.Cfg.ModelImage4K != "" {
		model = h.Cfg.ModelImage4K
	}
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_IMAGE not set", 0, "")
		return nil
	}

	var input repgo.PredictionInput
	if isGPTImageModel(model) {
		input = buildGPTImage2Input(jobInput)
	} else {
		input = make(repgo.PredictionInput)
		for k, v := range jobInput {
			input[k] = v
		}
		if input["size"] == nil || input["size"] == "" {
			input["size"] = size
		}
		if input["aspect_ratio"] == nil || input["aspect_ratio"] == "" {
			input["aspect_ratio"] = "match_input_image"
		}
		if input["max_images"] == nil {
			input["max_images"] = 1
		}
		if input["sequential_image_generation"] == nil || input["sequential_image_generation"] == "" {
			input["sequential_image_generation"] = "disabled"
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
	out = normalizeImageJobOutput(out)
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
