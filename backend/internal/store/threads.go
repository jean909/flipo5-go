package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Thread struct {
	ID         uuid.UUID  `json:"id"`
	UserID     uuid.UUID  `json:"user_id"`
	Title      string     `json:"title"`
	ArchivedAt *time.Time `json:"archived_at,omitempty"`
	CreatedAt  string     `json:"created_at"`
	UpdatedAt  string     `json:"updated_at"`
}

func (db *DB) CreateThread(ctx context.Context, userID uuid.UUID, ephemeral bool) (uuid.UUID, error) {
	id := uuid.New()
	title := time.Now().Format("2 Jan 2006")
	_, err := db.Pool.Exec(ctx, `INSERT INTO threads (id, user_id, title, ephemeral) VALUES ($1,$2,$3,$4)`, id, userID, title, ephemeral)
	return id, err
}

func (db *DB) UpdateThreadTitle(ctx context.Context, threadID uuid.UUID, title string) error {
	_, err := db.Pool.Exec(ctx, `UPDATE threads SET title = $2, updated_at = NOW() WHERE id = $1`, threadID, title)
	return err
}

func (db *DB) GetThreadByID(ctx context.Context, threadID uuid.UUID) (*Thread, error) {
	var t Thread
	var archivedAt *time.Time
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, COALESCE(title, ''), archived_at, created_at::text, updated_at::text FROM threads WHERE id = $1`,
		threadID).
		Scan(&t.ID, &t.UserID, &t.Title, &archivedAt, &t.CreatedAt, &t.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.ArchivedAt = archivedAt
	return &t, nil
}

func (db *DB) GetThreadForUser(ctx context.Context, threadID, userID uuid.UUID) (*Thread, error) {
	t, err := db.GetThreadByID(ctx, threadID)
	if err != nil || t == nil || t.UserID != userID {
		return nil, err
	}
	return t, nil
}

func (db *DB) ListThreads(ctx context.Context, userID uuid.UUID, limit int, archived bool) ([]Thread, error) {
	if limit <= 0 {
		limit = 50
	}
	archivedCond := "archived_at IS NULL"
	if archived {
		archivedCond = "archived_at IS NOT NULL"
	}
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, COALESCE(title, ''), archived_at, created_at::text, updated_at::text FROM threads WHERE user_id = $1 AND (ephemeral IS NOT TRUE) AND `+archivedCond+` ORDER BY updated_at DESC LIMIT $2`,
		userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Thread
	for rows.Next() {
		var t Thread
		var archivedAt *time.Time
		if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &archivedAt, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.ArchivedAt = archivedAt
		list = append(list, t)
	}
	return list, rows.Err()
}

func (db *DB) ArchiveThread(ctx context.Context, threadID, userID uuid.UUID) error {
	result, err := db.Pool.Exec(ctx, `UPDATE threads SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2`, threadID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) UnarchiveThread(ctx context.Context, threadID, userID uuid.UUID) error {
	result, err := db.Pool.Exec(ctx, `UPDATE threads SET archived_at = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2`, threadID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) DeleteChatJobsByThread(ctx context.Context, threadID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx, `DELETE FROM jobs WHERE thread_id = $1 AND type = 'chat'`, threadID)
	return err
}

func (db *DB) DeleteThread(ctx context.Context, threadID, userID uuid.UUID) error {
	// For ephemeral threads: delete chat jobs first (keep image/video for My Content)
	_ = db.DeleteChatJobsByThread(ctx, threadID)
	result, err := db.Pool.Exec(ctx, `DELETE FROM threads WHERE id = $1 AND user_id = $2`, threadID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) TouchThread(ctx context.Context, threadID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx, `UPDATE threads SET updated_at = NOW() WHERE id = $1`, threadID)
	return err
}
