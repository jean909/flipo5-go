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
	// Invalidate thread cache if job belongs to a thread
	if job.ThreadID != nil {
		keys := []string{
			"thread:" + job.UserID.String() + ":" + job.ThreadID.String(),
			"threads:" + job.UserID.String() + ":archived:false",
			"threads:" + job.UserID.String() + ":archived:true",
		}
		_ = h.Cache.Delete(ctx, keys...)
	}
	// Invalidate content cache if job produces media content
	if job.Type == "image" || job.Type == "video" || job.Type == "upscale" || job.Type == "audio" {
		_ = h.Cache.DeleteByPrefix(ctx, "content:"+job.UserID.String()+":")
	}
	// Recent prompts chips on dashboard
	_ = h.Cache.DeleteByPrefix(ctx, "prompts:recent:"+job.UserID.String()+":")
}

// Context strategy (research-based): user questions = topic anchor; full assistant replies = token-heavy.
// We send: (1) list of user questions = what was discussed; (2) last 2 full exchanges = immediate follow-up.
const maxUserQuestions = 12      // older: only user prompts (topics)
const maxRecentFullExchanges = 2 // last N: full user+assistant for "explică mai simplu" etc
const maxUserQuestionLen = 120   // truncate very long user prompts in topics list
const maxRecentOutputLen = 800   // truncate assistant in recent exchanges (enough for follow-up)

// buildChatContext: older exchanges = user questions only; last 2 = full. Saves tokens, keeps context.
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
		if j.ID == currentJobID || j.Type != "chat" || j.Status != "completed" {
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
	// Older: user questions only (what was discussed)
	if len(older) > 0 {
		var questions []string
		start := 0
		if len(older) > maxUserQuestions {
			start = len(older) - maxUserQuestions
		}
		for _, j := range older[start:] {
			var input map[string]interface{}
			if len(j.Input) > 0 {
				_ = json.Unmarshal(j.Input, &input)
			}
			if q, _ := input["prompt"].(string); q != "" {
				q = strings.TrimSpace(q)
				if len(q) > maxUserQuestionLen {
					q = q[:maxUserQuestionLen] + "..."
				}
				questions = append(questions, "- "+q)
			}
		}
		if len(questions) > 0 {
			parts = append(parts, "Earlier in this conversation, the user asked about:\n"+strings.Join(questions, "\n"))
		}
	}
	// Recent: full exchanges (follow-up like "explică mai simplu" needs prior answer)
	for i := range recent {
		j := &recent[i]
		var input map[string]interface{}
		if len(j.Input) > 0 {
			_ = json.Unmarshal(j.Input, &input)
		}
		userMsg, _ := input["prompt"].(string)
		if userMsg == "" {
			continue
		}
		var output map[string]interface{}
		assistantMsg := ""
		if len(j.Output) > 0 {
			_ = json.Unmarshal(j.Output, &output)
			assistantMsg, _ = output["output"].(string)
		}
		if len(assistantMsg) > maxRecentOutputLen {
			assistantMsg = strings.TrimSpace(assistantMsg[:maxRecentOutputLen]) + "..."
		}
		parts = append(parts, "User: "+userMsg+"\n\nAssistant: "+assistantMsg)
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n\n")
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
