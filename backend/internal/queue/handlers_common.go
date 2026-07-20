package queue

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"flipo5/backend/internal/cache"
	"flipo5/backend/internal/config"
	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/storage"
	"flipo5/backend/internal/store"
	"flipo5/backend/internal/stream"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

// ErrMsgServerUnavailable is shown to users when job times out (5 min)
const ErrMsgServerUnavailable = "Server unavailable. Please try again."

func jobErrorMsg(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return ErrMsgServerUnavailable
	}
	return err.Error()
}

// invalidateJobCaches clears thread and content cache when job status changes
func (h *Handlers) invalidateJobCaches(ctx context.Context, job *store.Job) {
	if h.Cache == nil || job == nil {
		return
	}
	if job.ThreadID != nil {
		keys := []string{
			"thread:" + job.UserID.String() + ":" + job.ThreadID.String(),
			"threads:" + job.UserID.String() + ":archived:false",
			"threads:" + job.UserID.String() + ":archived:true",
		}
		_ = h.Cache.Delete(ctx, keys...)
	}
	if job.Type == "image" || job.Type == "video" || job.Type == "upscale" || job.Type == "audio" {
		_ = h.Cache.DeleteByPrefix(ctx, "content:"+job.UserID.String()+":")
	}
	_ = h.Cache.DeleteByPrefix(ctx, "prompts:recent:"+job.UserID.String()+":")
}

// Context strategy: topics from older turns; last N full exchanges including image/video.
const maxUserQuestions = 14
const maxRecentFullExchanges = 4
const maxUserQuestionLen = 140
const maxRecentOutputLen = 900

// buildChatContext builds prompt history so follow-ups like "make it warmer" / "what did I generate?" work.
func buildChatContext(db *store.DB, ctx context.Context, threadID *uuid.UUID, userID, currentJobID uuid.UUID) string {
	if threadID == nil {
		return ""
	}
	jobs, err := db.ListJobsByThread(ctx, *threadID, userID)
	if err != nil || len(jobs) == 0 {
		return ""
	}
	var completed []store.Job
	for _, j := range jobs {
		if j.ID == currentJobID || j.Status != "completed" {
			continue
		}
		if j.Type != "chat" && j.Type != "image" && j.Type != "video" {
			continue
		}
		completed = append(completed, j)
	}
	if len(completed) == 0 {
		return ""
	}
	split := len(completed) - maxRecentFullExchanges
	if split < 0 {
		split = 0
	}
	older := completed[:split]
	recent := completed[split:]

	var parts []string
	if len(older) > 0 {
		var questions []string
		start := 0
		if len(older) > maxUserQuestions {
			start = len(older) - maxUserQuestions
		}
		for _, j := range older[start:] {
			if q := jobPrompt(j); q != "" {
				if len(q) > maxUserQuestionLen {
					q = q[:maxUserQuestionLen] + "..."
				}
				prefix := ""
				switch j.Type {
				case "image":
					prefix = "[image] "
				case "video":
					prefix = "[video] "
				}
				questions = append(questions, "- "+prefix+q)
			}
		}
		if len(questions) > 0 {
			parts = append(parts, "Earlier in this conversation, the user asked about / generated:\n"+strings.Join(questions, "\n"))
		}
	}
	for i := range recent {
		j := &recent[i]
		userMsg := jobPrompt(*j)
		if userMsg == "" {
			continue
		}
		switch j.Type {
		case "image":
			parts = append(parts, "User asked to generate an image: "+userMsg+"\n\nAssistant: [Generated an image for that prompt.]")
		case "video":
			parts = append(parts, "User asked to generate a video: "+userMsg+"\n\nAssistant: [Generated a video for that prompt.]")
		default:
			assistantMsg := jobChatOutput(*j)
			if len(assistantMsg) > maxRecentOutputLen {
				assistantMsg = strings.TrimSpace(assistantMsg[:maxRecentOutputLen]) + "..."
			}
			parts = append(parts, "User: "+userMsg+"\n\nAssistant: "+assistantMsg)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n\n")
}

func jobPrompt(j store.Job) string {
	var input map[string]interface{}
	if len(j.Input) > 0 {
		_ = json.Unmarshal(j.Input, &input)
	}
	if input == nil {
		return ""
	}
	q, _ := input["prompt"].(string)
	return strings.TrimSpace(q)
}

func jobChatOutput(j store.Job) string {
	if len(j.Output) == 0 {
		return ""
	}
	var output map[string]interface{}
	if err := json.Unmarshal(j.Output, &output); err != nil {
		return ""
	}
	s, _ := output["output"].(string)
	return strings.TrimSpace(s)
}

type Handlers struct {
	DB     *store.DB
	Cfg    *config.Config
	Repl   *replicate.Client
	Store  *storage.Store
	Asynq  *asynq.Client
	Stream *stream.Publisher // Redis pub/sub for real-time SSE
	Cache  *cache.Redis      // for cache invalidation when jobs complete
}
