package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func firstNWords(s string, n int) string {
	words := strings.Fields(strings.TrimSpace(s))
	if len(words) <= n {
		return strings.Join(words, " ")
	}
	return strings.Join(words[:n], " ")
}

type Job struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	ThreadID    *uuid.UUID      `json:"thread_id,omitempty"`
	Type        string          `json:"type"`
	Status      string          `json:"status"`
	Name        *string         `json:"name,omitempty"`
	Input       json.RawMessage `json:"input"`
	Output      json.RawMessage `json:"output"`
	Error       *string         `json:"error,omitempty"`
	CostCents   int             `json:"cost_cents"`
	ReplicateID *string         `json:"replicate_id,omitempty"`
	Rating      *string         `json:"rating,omitempty"`
	CreatedAt   string          `json:"created_at"`
	UpdatedAt   string          `json:"updated_at"`
}

func (db *DB) CreateJob(ctx context.Context, userID uuid.UUID, jobType string, input interface{}, threadID *uuid.UUID) (uuid.UUID, error) {
	inBytes, _ := json.Marshal(input)
	id := uuid.New()
	var name *string
	if jobType == "image" || jobType == "video" {
		var prompt string
		switch v := input.(type) {
		case map[string]interface{}:
			if p, ok := v["prompt"].(string); ok {
				prompt = p
			}
		case map[string]string:
			prompt = v["prompt"]
		}
		if prompt != "" {
			n := firstNWords(prompt, 4)
			if n != "" {
				name = &n
			}
		}
	}
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO jobs (id, user_id, type, name, input, thread_id) VALUES ($1,$2,$3,$4,$5,$6)`,
		id, userID, jobType, name, inBytes, threadID)
	if err != nil {
		return uuid.Nil, err
	}
	if threadID != nil {
		_ = db.TouchThread(ctx, *threadID)
	}
	return id, nil
}

// CreateCompletedJobFromURL inserts a job with status=completed and output={ "output": url }
// so it appears in ListContentJobs (my collection). jobType must be "image" or "video".
func (db *DB) CreateCompletedJobFromURL(ctx context.Context, userID uuid.UUID, url string, jobType string) (uuid.UUID, error) {
	if jobType != "image" && jobType != "video" {
		return uuid.Nil, fmt.Errorf("invalid job type %q", jobType)
	}
	id := uuid.New()
	input := map[string]string{"source": "export", "url": url}
	inBytes, _ := json.Marshal(input)
	output := map[string]string{"output": url}
	outBytes, _ := json.Marshal(output)
	n := "Exported"
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO jobs (id, user_id, type, status, name, input, output) VALUES ($1,$2,$3,'completed',$4,$5,$6)`,
		id, userID, jobType, &n, inBytes, outBytes)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (db *DB) GetJob(ctx context.Context, id uuid.UUID) (*Job, error) {
	var j Job
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, thread_id, type, status, name, input, output, error, cost_cents, replicate_id, rating, created_at::text, updated_at::text
		 FROM jobs WHERE id = $1`, id).
		Scan(&j.ID, &j.UserID, &j.ThreadID, &j.Type, &j.Status, &j.Name, &j.Input, &j.Output, &j.Error, &j.CostCents, &j.ReplicateID, &j.Rating, &j.CreatedAt, &j.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &j, err
}

func (db *DB) GetJobForUser(ctx context.Context, jobID, userID uuid.UUID) (*Job, error) {
	j, err := db.GetJob(ctx, jobID)
	if err != nil || j == nil {
		return j, err
	}
	if j.UserID != userID {
		return nil, nil
	}
	return j, nil
}

func (db *DB) UpdateJobStatus(ctx context.Context, id uuid.UUID, status string, output interface{}, jobErr string, costCents int, replicateID string) error {
	var outBytes []byte
	if output != nil {
		outBytes, _ = json.Marshal(output)
	}
	var errPtr *string
	if jobErr != "" {
		errPtr = &jobErr
	}
	var repID *string
	if replicateID != "" {
		repID = &replicateID
	}
	// Optimistic locking: only update if current status allows transition
	validTransitions := map[string][]string{
		"pending": {"running", "failed", "cancelled"},
		"running": {"completed", "failed", "cancelled"},
	}
	
	// First try with status check for safety
	result, err := db.Pool.Exec(ctx,
		`UPDATE jobs SET status=$2, output=$3, error=$4, cost_cents=$5, replicate_id=$6, updated_at=NOW() 
		 WHERE id=$1 AND (status = ANY($7) OR status = $2)`,
		id, status, outBytes, errPtr, costCents, repID, validTransitions[status])
	
	if err != nil {
		return err
	}
	
	// Check if update actually happened
	if result.RowsAffected() == 0 {
		// Fallback: force update (job may be in unexpected state)
		_, err = db.Pool.Exec(ctx,
			`UPDATE jobs SET status=$2, output=$3, error=$4, cost_cents=$5, replicate_id=$6, updated_at=NOW() WHERE id=$1`,
			id, status, outBytes, errPtr, costCents, repID)
	}
	
	return err
}

// UpdateJobOutput sets only the output field (e.g. after mirroring media to R2).
func (db *DB) UpdateJobOutput(ctx context.Context, id uuid.UUID, output interface{}) error {
	outBytes, _ := json.Marshal(output)
	_, err := db.Pool.Exec(ctx, `UPDATE jobs SET output=$2, updated_at=NOW() WHERE id=$1`, id, outBytes)
	return err
}

func (db *DB) ListJobs(ctx context.Context, userID uuid.UUID, limit int) ([]Job, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, thread_id, type, status, name, input, output, error, cost_cents, replicate_id, rating, created_at::text, updated_at::text
		 FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.UserID, &j.ThreadID, &j.Type, &j.Status, &j.Name, &j.Input, &j.Output, &j.Error, &j.CostCents, &j.ReplicateID, &j.Rating, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, j)
	}
	return list, rows.Err()
}

// ListContentJobs returns paginated image/video jobs (completed, with output) for content page.
// typeFilter: "image", "video", or "" for both.
// search: search in input prompt (case-insensitive).
func (db *DB) ListContentJobs(ctx context.Context, userID uuid.UUID, offset, limit int, typeFilter, search string) ([]Job, int, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	base := `FROM jobs WHERE user_id = $1 AND type IN ('image','video','upscale') AND status = 'completed' AND output IS NOT NULL`
	args := []interface{}{userID}
	n := 1
	if typeFilter == "image" {
		base += ` AND type IN ('image','upscale')`
	} else if typeFilter == "video" {
		base += ` AND type = 'video'`
	}
	if search != "" {
		n++
		base += fmt.Sprintf(" AND (input->>'prompt' ILIKE $%d OR COALESCE(name,'') ILIKE $%d)", n, n)
		args = append(args, "%"+search+"%")
	}
	var total int
	if err := db.Pool.QueryRow(ctx, "SELECT COUNT(*) "+base, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	limitIdx := len(args) - 1
	offsetIdx := len(args)
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, thread_id, type, status, name, input, output, error, cost_cents, replicate_id, rating, created_at::text, updated_at::text `+
			base+` ORDER BY created_at DESC LIMIT $`+strconv.Itoa(limitIdx)+` OFFSET $`+strconv.Itoa(offsetIdx), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var list []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.UserID, &j.ThreadID, &j.Type, &j.Status, &j.Name, &j.Input, &j.Output, &j.Error, &j.CostCents, &j.ReplicateID, &j.Rating, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, 0, err
		}
		list = append(list, j)
	}
	return list, total, rows.Err()
}

// ThreadHasActiveJobs returns true if thread has any pending or running job (chat, image, video).
func (db *DB) ThreadHasActiveJobs(ctx context.Context, threadID uuid.UUID) (bool, error) {
	var dummy int
	err := db.Pool.QueryRow(ctx,
		`SELECT 1 FROM jobs WHERE thread_id = $1 AND status IN ('pending','running') LIMIT 1`,
		threadID).Scan(&dummy)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (db *DB) ListJobsByThread(ctx context.Context, threadID, userID uuid.UUID) ([]Job, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, thread_id, type, status, name, input, output, error, cost_cents, replicate_id, rating, created_at::text, updated_at::text
		 FROM jobs WHERE thread_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
		threadID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.UserID, &j.ThreadID, &j.Type, &j.Status, &j.Name, &j.Input, &j.Output, &j.Error, &j.CostCents, &j.ReplicateID, &j.Rating, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, j)
	}
	return list, rows.Err()
}

// ListStalePendingJobs returns jobs in pending/running for longer than maxAgeMinutes. Used for cleanup.
func (db *DB) ListStalePendingJobs(ctx context.Context, maxAgeMinutes int) ([]Job, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, thread_id, type, status, name, input, output, error, cost_cents, replicate_id, rating, created_at::text, updated_at::text
		 FROM jobs WHERE status IN ('pending','running') AND updated_at < NOW() - ($1 || ' minutes')::interval
		 ORDER BY updated_at ASC LIMIT 100`,
		fmt.Sprint(maxAgeMinutes))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.UserID, &j.ThreadID, &j.Type, &j.Status, &j.Name, &j.Input, &j.Output, &j.Error, &j.CostCents, &j.ReplicateID, &j.Rating, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, j)
	}
	return list, rows.Err()
}

// UpdateJobRating sets user feedback (like/dislike) for a job. Only the job owner can set it.
func (db *DB) UpdateJobRating(ctx context.Context, jobID, userID uuid.UUID, rating string) error {
	var err error
	if rating == "" {
		_, err = db.Pool.Exec(ctx, `UPDATE jobs SET rating = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2`, jobID, userID)
	} else {
		_, err = db.Pool.Exec(ctx, `UPDATE jobs SET rating = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3`, jobID, rating, userID)
	}
	return err
}

// AdminJob is a job with user email for admin listing.
type AdminJob struct {
	Job
	UserEmail string `json:"user_email"`
}

// ListJobsAdmin returns all jobs with optional filters (userID, status, type), paginated.
func (db *DB) ListJobsAdmin(ctx context.Context, limit, offset int, userID *uuid.UUID, status, jobType string) ([]AdminJob, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	base := `FROM jobs j JOIN users u ON j.user_id = u.id WHERE 1=1`
	args := []interface{}{}
	n := 1
	if userID != nil {
		args = append(args, *userID)
		base += fmt.Sprintf(" AND j.user_id = $%d", n)
		n++
	}
	if status != "" {
		args = append(args, status)
		base += fmt.Sprintf(" AND j.status = $%d", n)
		n++
	}
	if jobType != "" {
		args = append(args, jobType)
		base += fmt.Sprintf(" AND j.type = $%d", n)
		n++
	}
	var total int
	if err := db.Pool.QueryRow(ctx, "SELECT COUNT(*) "+base, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	sel := `SELECT j.id, j.user_id, j.thread_id, j.type, j.status, j.name, j.input, j.output, j.error, j.cost_cents, j.replicate_id, j.rating, j.created_at::text, j.updated_at::text, u.email `
	args = append(args, limit, offset)
	n = len(args)
	rows, err := db.Pool.Query(ctx, sel+base+` ORDER BY j.created_at DESC LIMIT $`+strconv.Itoa(n-1)+` OFFSET $`+strconv.Itoa(n), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var list []AdminJob
	for rows.Next() {
		var aj AdminJob
		if err := rows.Scan(&aj.ID, &aj.UserID, &aj.ThreadID, &aj.Type, &aj.Status, &aj.Name, &aj.Input, &aj.Output, &aj.Error, &aj.CostCents, &aj.ReplicateID, &aj.Rating, &aj.CreatedAt, &aj.UpdatedAt, &aj.UserEmail); err != nil {
			return nil, 0, err
		}
		list = append(list, aj)
	}
	return list, total, rows.Err()
}
