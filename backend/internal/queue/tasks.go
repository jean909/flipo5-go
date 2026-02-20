package queue

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

const (
	TypeChat              = "chat"
	TypeImage             = "image"
	TypeVideo             = "video"
	TypeUpscale           = "upscale"
	TypeSummarizeThread   = "summarize_thread"
	TypeCancelStaleJobs   = "cancel_stale_jobs"
	JobTimeoutMinutes     = 5
	StaleJobCleanupMinutes = 5
)

var taskTimeout = asynq.Timeout(JobTimeoutMinutes * time.Minute)

type ChatPayload struct {
	JobID  uuid.UUID `json:"job_id"`
	Prompt string    `json:"prompt"`
}

type ImagePayload struct {
	JobID uuid.UUID `json:"job_id"`
}

type VideoPayload struct {
	JobID uuid.UUID `json:"job_id"`
}

type UpscalePayload struct {
	JobID uuid.UUID `json:"job_id"`
}

func NewChatTask(jobID uuid.UUID, prompt string) (*asynq.Task, error) {
	payload, err := json.Marshal(ChatPayload{JobID: jobID, Prompt: prompt})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeChat, payload, asynq.Queue("default"), asynq.MaxRetry(3), taskTimeout), nil
}

func NewImageTask(jobID uuid.UUID) (*asynq.Task, error) {
	payload, err := json.Marshal(ImagePayload{JobID: jobID})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeImage, payload, asynq.Queue("default"), asynq.MaxRetry(3), taskTimeout), nil
}

func NewVideoTask(jobID uuid.UUID) (*asynq.Task, error) {
	payload, err := json.Marshal(VideoPayload{JobID: jobID})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeVideo, payload, asynq.Queue("default"), asynq.MaxRetry(3), taskTimeout), nil
}

func NewUpscaleTask(jobID uuid.UUID) (*asynq.Task, error) {
	payload, err := json.Marshal(UpscalePayload{JobID: jobID})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeUpscale, payload, asynq.Queue("default"), asynq.MaxRetry(3), taskTimeout), nil
}

type SummarizeThreadPayload struct {
	ThreadID uuid.UUID `json:"thread_id"`
}

func NewSummarizeThreadTask(threadID uuid.UUID) (*asynq.Task, error) {
	payload, err := json.Marshal(SummarizeThreadPayload{ThreadID: threadID})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeSummarizeThread, payload, asynq.Queue("default"), asynq.MaxRetry(2), taskTimeout), nil
}

// NewCancelStaleJobsTask creates a task to cancel jobs stuck in pending/running > 5 min. No payload.
func NewCancelStaleJobsTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeCancelStaleJobs, nil, asynq.Queue("default"), asynq.MaxRetry(1), asynq.Timeout(2*time.Minute)), nil
}
