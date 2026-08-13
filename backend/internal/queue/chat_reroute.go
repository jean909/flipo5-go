package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"flipo5/backend/internal/intent"

	"github.com/google/uuid"
)

// applyDetectedSkill starts the media skill after the chat model labeled the turn.
// Call before completing the chat job so spawned_job_id can be stored in the same output.
func (h *Handlers) applyDetectedSkill(ctx context.Context, chatJobID uuid.UUID, prompt string, jobInput map[string]interface{}, threadID *uuid.UUID, userID uuid.UUID, skill intent.Skill) (spawnedID *uuid.UUID, mediaType string) {
	switch skill {
	case intent.SkillImage:
		return h.enqueueSiblingImage(ctx, chatJobID, prompt, jobInput, threadID, userID, false)
	case intent.SkillImageEdit:
		return h.enqueueSiblingImage(ctx, chatJobID, prompt, jobInput, threadID, userID, true)
	case intent.SkillVideo:
		return h.enqueueSiblingVideo(ctx, chatJobID, prompt, jobInput, threadID, userID)
	default:
		return nil, ""
	}
}

func (h *Handlers) enqueueSiblingImage(ctx context.Context, chatJobID uuid.UUID, prompt string, jobInput map[string]interface{}, threadID *uuid.UUID, userID uuid.UUID, isEdit bool) (*uuid.UUID, string) {
	if h.Asynq == nil {
		return nil, ""
	}
	input := map[string]interface{}{
		"prompt":             prompt,
		"size":               "2K",
		"aspect_ratio":       "1:1",
		"max_images":         1,
		"quality":            "high",
		"output_format":      "webp",
		"number_of_images":   1,
		"output_compression": 90,
		"background":         "auto",
		"moderation":         "auto",
		"routed_from":        "skill_header",
	}
	if isEdit {
		input["size"] = "HD"
		input["aspect_ratio"] = "match_input_image"
		input["routed_skill"] = "image_edit"
	}
	refs := attachmentImageURLs(jobInput, h)
	if len(refs) == 0 && isEdit && threadID != nil {
		if prev := h.lastImageURLInThread(ctx, *threadID, userID); prev != "" {
			refs = []string{prev}
		}
	}
	if isEdit && len(refs) == 0 {
		log.Printf("skill_header image_edit skipped — no source image chat=%s", chatJobID)
		return nil, ""
	}
	if len(refs) > 0 {
		input["image_input"] = refs
	}
	imageJobID, err := h.DB.CreateJob(ctx, userID, "image", input, threadID)
	if err != nil {
		log.Printf("skill_header create image: %v", err)
		return nil, ""
	}
	task, _ := NewImageTask(imageJobID)
	if _, err := h.Asynq.Enqueue(task); err != nil {
		log.Printf("skill_header enqueue image: %v", err)
		_ = h.DB.UpdateJobStatus(ctx, imageJobID, "failed", nil, "enqueue failed", 0, "")
		return nil, ""
	}
	h.publishJobRunning(ctx, imageJobID, userID, "image")
	log.Printf("skill_header spawned image job=%s from chat=%s edit=%v", imageJobID, chatJobID, isEdit)
	return &imageJobID, "image"
}

func (h *Handlers) enqueueSiblingVideo(ctx context.Context, chatJobID uuid.UUID, prompt string, jobInput map[string]interface{}, threadID *uuid.UUID, userID uuid.UUID) (*uuid.UUID, string) {
	if h.Asynq == nil {
		return nil, ""
	}
	input := map[string]interface{}{
		"prompt":       prompt,
		"duration":     5,
		"aspect_ratio": "16:9",
		"resolution":   "720p",
		"video_model":  "1",
		"routed_from":  "skill_header",
	}
	refs := attachmentImageURLs(jobInput, h)
	if len(refs) > 0 {
		input["image"] = refs[0]
	}
	videoJobID, err := h.DB.CreateJob(ctx, userID, "video", input, threadID)
	if err != nil {
		log.Printf("skill_header create video: %v", err)
		return nil, ""
	}
	task, _ := NewVideoTask(videoJobID)
	if _, err := h.Asynq.Enqueue(task); err != nil {
		log.Printf("skill_header enqueue video: %v", err)
		_ = h.DB.UpdateJobStatus(ctx, videoJobID, "failed", nil, "enqueue failed", 0, "")
		return nil, ""
	}
	h.publishJobRunning(ctx, videoJobID, userID, "video")
	log.Printf("skill_header spawned video job=%s from chat=%s", videoJobID, chatJobID)
	return &videoJobID, "video"
}

func (h *Handlers) publishJobRunning(ctx context.Context, jobID, userID uuid.UUID, jobType string) {
	if h.Stream == nil {
		return
	}
	_ = h.Stream.Publish(ctx, jobID, `{"status":"running"}`, false)
	_ = h.Stream.PublishRaw(ctx, fmt.Sprintf("user:%s:jobs", userID.String()),
		fmt.Sprintf(`{"jobId":"%s","status":"running","type":"%s"}`, jobID.String(), jobType))
}

func attachmentImageURLs(jobInput map[string]interface{}, h *Handlers) []string {
	var out []string
	urls, _ := jobInput["attachment_urls"].([]interface{})
	cts, _ := jobInput["attachment_content_types"].([]interface{})
	for i, u := range urls {
		s, ok := u.(string)
		if !ok || s == "" {
			continue
		}
		isImg := looksLikeImageURLQueue(s)
		if i < len(cts) {
			if ct, ok := cts[i].(string); ok && strings.HasPrefix(strings.ToLower(ct), "image/") {
				isImg = true
			}
		}
		if !isImg {
			continue
		}
		if strings.HasPrefix(s, "uploads/") && h.Store != nil {
			out = append(out, h.Store.URL(s))
		} else {
			out = append(out, s)
		}
	}
	return out
}

func (h *Handlers) lastImageURLInThread(ctx context.Context, threadID, userID uuid.UUID) string {
	jobs, err := h.DB.ListJobsByThread(ctx, threadID, userID)
	if err != nil {
		return ""
	}
	for i := len(jobs) - 1; i >= 0; i-- {
		j := jobs[i]
		if j.Status != "completed" {
			continue
		}
		if j.Type == "image" || j.Type == "logo" || j.Type == "upscale" {
			if u := firstURLFromOutput(j.Output); u != "" {
				return u
			}
		}
	}
	return ""
}

func firstURLFromOutput(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var m map[string]interface{}
	if json.Unmarshal(raw, &m) != nil {
		return ""
	}
	if s, ok := m["output"].(string); ok && strings.HasPrefix(s, "http") {
		return s
	}
	if arr, ok := m["output"].([]interface{}); ok {
		for _, v := range arr {
			if s, ok := v.(string); ok && strings.HasPrefix(s, "http") {
				return s
			}
		}
	}
	return ""
}

func looksLikeImageURLQueue(u string) bool {
	lu := strings.ToLower(u)
	return strings.Contains(lu, ".png") || strings.Contains(lu, ".jpg") || strings.Contains(lu, ".jpeg") ||
		strings.Contains(lu, ".webp") || strings.Contains(lu, ".gif") || strings.Contains(lu, "/image")
}
