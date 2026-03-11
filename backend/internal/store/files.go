package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type UserFile struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Name      string    `json:"name"`
	Content   string    `json:"content"`
	FileType  string    `json:"file_type"`
	CreatedAt string    `json:"created_at"`
	UpdatedAt string    `json:"updated_at"`
}

func (db *DB) CreateUserFile(ctx context.Context, userID uuid.UUID, name, content, fileType string) (uuid.UUID, error) {
	id := uuid.New()
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO user_files (id, user_id, name, content, file_type) VALUES ($1,$2,$3,$4,$5)`,
		id, userID, name, content, fileType)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (db *DB) ListUserFiles(ctx context.Context, userID uuid.UUID) ([]UserFile, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, name, content, file_type, created_at::text, updated_at::text
		 FROM user_files WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []UserFile
	for rows.Next() {
		var f UserFile
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Content, &f.FileType, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, f)
	}
	return list, nil
}

func (db *DB) GetUserFile(ctx context.Context, fileID, userID uuid.UUID) (*UserFile, error) {
	var f UserFile
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, content, file_type, created_at::text, updated_at::text
		 FROM user_files WHERE id = $1 AND user_id = $2`, fileID, userID).
		Scan(&f.ID, &f.UserID, &f.Name, &f.Content, &f.FileType, &f.CreatedAt, &f.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &f, err
}

func (db *DB) DeleteUserFile(ctx context.Context, fileID, userID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx,
		`DELETE FROM user_files WHERE id = $1 AND user_id = $2`, fileID, userID)
	return err
}
