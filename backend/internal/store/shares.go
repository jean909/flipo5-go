package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type JobShare struct {
	ID        uuid.UUID  `json:"id"`
	UserID    uuid.UUID  `json:"user_id"`
	JobID     uuid.UUID  `json:"job_id"`
	ExpiresAt time.Time  `json:"expires_at"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
	CreatedAt string     `json:"created_at"`
}

func (db *DB) CreateJobShare(ctx context.Context, id, userID, jobID uuid.UUID, expiresAt time.Time) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO job_shares (id, user_id, job_id, expires_at) VALUES ($1,$2,$3,$4)`,
		id, userID, jobID, expiresAt.UTC())
	return err
}

func (db *DB) GetJobShare(ctx context.Context, id uuid.UUID) (*JobShare, error) {
	var s JobShare
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, job_id, expires_at, revoked_at, created_at::text
		 FROM job_shares WHERE id = $1`, id).
		Scan(&s.ID, &s.UserID, &s.JobID, &s.ExpiresAt, &s.RevokedAt, &s.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &s, err
}

func (db *DB) RevokeJobShareForUser(ctx context.Context, id, userID uuid.UUID) (bool, error) {
	tag, err := db.Pool.Exec(ctx,
		`UPDATE job_shares SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
		id, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
