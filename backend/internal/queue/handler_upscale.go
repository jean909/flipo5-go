package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

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
		"image":             imageURL,
		"enhance_model":     enhanceModel,
		"output_format":     outputFormat,
		"upscale_factor":    upscaleFactor,
		"face_enhancement":  faceEnhancement,
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
