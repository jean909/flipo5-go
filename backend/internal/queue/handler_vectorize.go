package queue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/hibiken/asynq"
)

func (h *Handlers) VectorizeHandler(ctx context.Context, t *asynq.Task) error {
	var p VectorizePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		return nil
	}
	if h.Stream != nil {
		ch := fmt.Sprintf("user:%s:jobs", job.UserID.String())
		_ = h.Stream.PublishRaw(ctx, ch, fmt.Sprintf(`{"jobId":"%s","status":"running","type":"vectorize"}`, p.JobID.String()))
	}
	var input map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &input)
	}
	src, _ := input["url"].(string)
	mode, _ := input["mode"].(string)
	src = strings.TrimSpace(src)
	if src == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "url required", 0, "")
		return nil
	}
	if h.Store == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "storage not configured", 0, "")
		return nil
	}
	src = resolveMediaURL(h, src)
	var imgBody io.ReadCloser
	if strings.HasPrefix(src, "uploads/") {
		body, _, err := h.Store.Get(ctx, src)
		if err != nil {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "source not found", 0, "")
			return nil
		}
		imgBody = body
	} else {
		resp, err := http.Get(src)
		if err != nil || resp.StatusCode != http.StatusOK {
			if resp != nil {
				resp.Body.Close()
			}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "fetch failed", 0, "")
			return nil
		}
		imgBody = resp.Body
	}
	defer imgBody.Close()

	base := os.Getenv("VECTORIZER_URL")
	if base == "" {
		base = "http://vectorizer:8081"
	}
	target := base + "/convert"
	if strings.TrimSpace(mode) != "" {
		target += "?mode=" + url.QueryEscape(mode)
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, target, imgBody)
	req.Header.Set("Content-Type", "application/octet-stream")
	vecResp, err := http.DefaultClient.Do(req)
	if err != nil || vecResp.StatusCode != http.StatusOK {
		if vecResp != nil {
			vecResp.Body.Close()
		}
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "vectorizer unavailable", 0, "")
		return nil
	}
	svgData, err := io.ReadAll(io.LimitReader(vecResp.Body, 10<<20))
	vecResp.Body.Close()
	if err != nil || len(svgData) == 0 {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "empty svg", 0, "")
		return nil
	}
	outKey := fmt.Sprintf("uploads/%s/vectorize/%s.svg", job.UserID.String(), p.JobID.String())
	if _, err := h.Store.Put(ctx, outKey, bytes.NewReader(svgData), "image/svg+xml"); err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "upload failed", 0, "")
		return nil
	}
	outURL := h.Store.URL(outKey)
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", map[string]interface{}{"output": outURL, "svg_url": outURL}, "", 0, "")
	h.invalidateJobCaches(ctx, job)
	if h.Stream != nil {
		ch := fmt.Sprintf("user:%s:jobs", job.UserID.String())
		_ = h.Stream.PublishRaw(ctx, ch, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"vectorize"}`, p.JobID.String()))
	}
	return nil
}
