package queue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

func (h *Handlers) RemoveBgHandler(ctx context.Context, t *asynq.Task) error {
	var p RemoveBgPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Stream != nil {
		if job, _ := h.DB.GetJob(ctx, p.JobID); job != nil {
			_ = h.Stream.Publish(ctx, p.JobID, `{"status":"running"}`, false)
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"running","type":"remove_bg"}`, p.JobID.String()))
		}
	}
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	model := h.Cfg.ModelRemoveBg
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_REMOVE_BG not set", 0, "")
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
	input := repgo.PredictionInput{
		"image_url":      imageURL,
		"preserve_alpha": true,
	}
	out, err := h.Repl.Run(ctx, model, input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, fmt.Sprintf(`{"status":"failed","error":"%s"}`, jobErrorMsg(err)), true)
		}
		return err
	}
	resultURL := extractRemoveBgURL(out)
	if resultURL == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "invalid model output", 0, "")
		return nil
	}
	finalURL := resultURL
	if h.Store != nil {
		if mirrored, mErr := downloadAndStorePNG(ctx, h, job.UserID, resultURL); mErr == nil && mirrored != "" {
			finalURL = mirrored
		}
	}
	outNormalized := map[string]interface{}{"output": finalURL}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", outNormalized, "", 0, "")
	if h.Stream != nil {
		_ = h.Stream.Publish(ctx, p.JobID, `{"status":"completed"}`, true)
		userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
		_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"remove_bg"}`, p.JobID.String()))
	}
	h.invalidateJobCaches(ctx, job)
	return nil
}

func extractRemoveBgURL(out repgo.PredictionOutput) string {
	switch v := out.(type) {
	case string:
		return v
	case map[string]interface{}:
		if u, _ := v["output"].(string); u != "" {
			return u
		}
		if u, _ := v["url"].(string); u != "" {
			return u
		}
	}
	return ""
}

func downloadAndStorePNG(ctx context.Context, h *Handlers, userID uuid.UUID, resultURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resultURL, nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	key := fmt.Sprintf("uploads/%s/%s.png", userID.String(), uuid.New().String())
	if _, err := h.Store.Put(ctx, key, bytes.NewReader(body), "image/png"); err != nil {
		return "", err
	}
	return h.Store.URL(key), nil
}
