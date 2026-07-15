package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

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
