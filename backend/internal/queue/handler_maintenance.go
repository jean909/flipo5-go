package queue

import (
	"context"

	"github.com/hibiken/asynq"
)

func (h *Handlers) CancelStaleJobsHandler(ctx context.Context, t *asynq.Task) error {
	jobs, err := h.DB.ListStalePendingJobs(ctx, JobTimeoutMinutes)
	if err != nil || len(jobs) == 0 {
		return err
	}
	for _, j := range jobs {
		if j.ReplicateID != nil && *j.ReplicateID != "" && h.Repl != nil {
			_ = h.Repl.CancelPrediction(ctx, *j.ReplicateID)
		}
		_ = h.DB.UpdateJobStatus(ctx, j.ID, "failed", nil, "Job cancelled (timeout)", 0, "")
	}
	return nil
}
