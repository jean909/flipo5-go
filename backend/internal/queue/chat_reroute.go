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

// maybeRerouteChatToSkill re-classifies a chat job; if the user wanted media,
// enqueues the real image/video job and completes the chat turn with a short ack.
// Returns true when the chat handler should stop (media was started).
func (h *Handlers) maybeRerouteChatToSkill(ctx context.Context, chatJobID uuid.UUID, prompt string, jobInput map[string]interface{}, threadID *uuid.UUID, userID uuid.UUID) bool {
	if h.Repl == nil || h.Asynq == nil || strings.TrimSpace(prompt) == "" {
		return false
	}
	if needs, _ := jobInput["needs_image"].(bool); needs {
		return false
	}

	hints := intent.Hints{}
	if urls, ok := jobInput["attachment_urls"].([]interface{}); ok {
		for _, u := range urls {
			if s, ok := u.(string); ok && looksLikeImageURLQueue(s) {
				hints.HasImageAttachment = true
			}
		}
	}
	if cts, ok := jobInput["attachment_content_types"].([]interface{}); ok {
		for _, c := range cts {
			if s, ok := c.(string); ok && strings.HasPrefix(strings.ToLower(s), "image/") {
				hints.HasImageAttachment = true
			}
			if s, ok := c.(string); ok && strings.HasPrefix(strings.ToLower(s), "video/") {
				hints.HasVideoAttachment = true
			}
		}
	}
	if threadID != nil {
		if u := h.lastImageURLInThread(ctx, *threadID, userID); u != "" {
			hints.HasPriorImage = true
		}
	}

	model := strings.TrimSpace(h.Cfg.ModelTextFallback)
	fallbacks := []string{}
	if primary := strings.TrimSpace(h.Cfg.ModelText); primary != "" {
		if model == "" {
			model = primary
		} else {
			fallbacks = append(fallbacks, primary)
		}
	}
	clf := &intent.Classifier{Repl: h.Repl, Model: model, Fallbacks: fallbacks, Cache: h.Cache}
	res := clf.Classify(ctx, prompt, hints)
	log.Printf("chat reroute check job=%s skill=%s source=%s", chatJobID, res.Skill, res.Source)

	switch res.Skill {
	case intent.SkillImage, intent.SkillImageEdit:
		return h.spawnImageFromChat(ctx, chatJobID, prompt, jobInput, threadID, userID, res.Skill == intent.SkillImageEdit)
	case intent.SkillVideo:
		return h.spawnVideoFromChat(ctx, chatJobID, prompt, jobInput, threadID, userID)
	default:
		return false
	}
}

func (h *Handlers) spawnImageFromChat(ctx context.Context, chatJobID uuid.UUID, prompt string, jobInput map[string]interface{}, threadID *uuid.UUID, userID uuid.UUID, isEdit bool) bool {
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
		"routed_from":        "chat_reroute",
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
		msg := "Atașează o poză de editat (sau generează una mai întâi), apoi spune-mi ce să schimb."
		_ = h.DB.UpdateJobStatus(ctx, chatJobID, "completed", map[string]interface{}{"output": msg}, "", 0, "")
		h.publishJobDone(ctx, chatJobID, userID, "chat")
		return true
	}
	if len(refs) > 0 {
		input["image_input"] = refs
	}
	imageJobID, err := h.DB.CreateJob(ctx, userID, "image", input, threadID)
	if err != nil {
		log.Printf("chat reroute create image job: %v", err)
		return false
	}
	task, _ := NewImageTask(imageJobID)
	if _, err := h.Asynq.Enqueue(task); err != nil {
		log.Printf("chat reroute enqueue image: %v", err)
		_ = h.DB.UpdateJobStatus(ctx, imageJobID, "failed", nil, "enqueue failed", 0, "")
		return false
	}
	ack := mediaAckMessage(prompt, "image")
	_ = h.DB.UpdateJobStatus(ctx, chatJobID, "completed", map[string]interface{}{"output": ack, "spawned_job_id": imageJobID.String()}, "", 0, "")
	h.publishJobDone(ctx, chatJobID, userID, "chat")
	h.publishJobRunning(ctx, imageJobID, userID, "image")
	log.Printf("chat reroute spawned image job=%s from chat=%s", imageJobID, chatJobID)
	return true
}

func (h *Handlers) spawnVideoFromChat(ctx context.Context, chatJobID uuid.UUID, prompt string, jobInput map[string]interface{}, threadID *uuid.UUID, userID uuid.UUID) bool {
	input := map[string]interface{}{
		"prompt":       prompt,
		"duration":     5,
		"aspect_ratio": "16:9",
		"resolution":   "720p",
		"video_model":  "1",
		"routed_from":  "chat_reroute",
	}
	refs := attachmentImageURLs(jobInput, h)
	if len(refs) > 0 {
		input["image"] = refs[0]
	}
	videoJobID, err := h.DB.CreateJob(ctx, userID, "video", input, threadID)
	if err != nil {
		log.Printf("chat reroute create video job: %v", err)
		return false
	}
	task, _ := NewVideoTask(videoJobID)
	if _, err := h.Asynq.Enqueue(task); err != nil {
		log.Printf("chat reroute enqueue video: %v", err)
		_ = h.DB.UpdateJobStatus(ctx, videoJobID, "failed", nil, "enqueue failed", 0, "")
		return false
	}
	ack := mediaAckMessage(prompt, "video")
	_ = h.DB.UpdateJobStatus(ctx, chatJobID, "completed", map[string]interface{}{"output": ack, "spawned_job_id": videoJobID.String()}, "", 0, "")
	h.publishJobDone(ctx, chatJobID, userID, "chat")
	h.publishJobRunning(ctx, videoJobID, userID, "video")
	log.Printf("chat reroute spawned video job=%s from chat=%s", videoJobID, chatJobID)
	return true
}

func (h *Handlers) publishJobDone(ctx context.Context, jobID, userID uuid.UUID, jobType string) {
	if h.Stream == nil {
		return
	}
	_ = h.Stream.Publish(ctx, jobID, `{"status":"completed"}`, true)
	_ = h.Stream.PublishRaw(ctx, fmt.Sprintf("user:%s:jobs", userID.String()),
		fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"%s"}`, jobID.String(), jobType))
}

func (h *Handlers) publishJobRunning(ctx context.Context, jobID, userID uuid.UUID, jobType string) {
	if h.Stream == nil {
		return
	}
	_ = h.Stream.Publish(ctx, jobID, `{"status":"running"}`, false)
	_ = h.Stream.PublishRaw(ctx, fmt.Sprintf("user:%s:jobs", userID.String()),
		fmt.Sprintf(`{"jobId":"%s","status":"running","type":"%s"}`, jobID.String(), jobType))
}

func mediaAckMessage(prompt, kind string) string {
	p := strings.ToLower(prompt)
	ro := strings.Contains(p, "ă") || strings.Contains(p, "â") || strings.Contains(p, "î") || strings.Contains(p, "ș") || strings.Contains(p, "ț") ||
		strings.Contains(p, "poza") || strings.Contains(p, "genereaza") || strings.Contains(p, "generează") || strings.Contains(p, "vreau") || strings.Contains(p, "faci")
	if kind == "video" {
		if ro {
			return "Sigur — pornesc generarea video-ului acum."
		}
		return "On it — starting the video now."
	}
	if ro {
		return "Sigur — pornesc generarea imaginii acum."
	}
	return "On it — starting the image now."
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
