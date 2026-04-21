package store

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ChatProject is a Grok-style container for related conversations,
// custom system instructions, and reference files used as context.
type ChatProject struct {
	ID           uuid.UUID `json:"id"`
	UserID       uuid.UUID `json:"user_id"`
	Name         string    `json:"name"`
	Instructions string    `json:"instructions"`
	CreatedAt    string    `json:"created_at"`
	UpdatedAt    string    `json:"updated_at"`
	ThreadCount  int       `json:"thread_count"`
	FileCount    int       `json:"file_count"`
}

type ChatProjectFile struct {
	ID          uuid.UUID `json:"id"`
	ProjectID   uuid.UUID `json:"project_id"`
	FileURL     string    `json:"file_url"`
	FileName    string    `json:"file_name"`
	ContentType string    `json:"content_type"`
	SizeBytes   *int64    `json:"size_bytes,omitempty"`
	CreatedAt   string    `json:"created_at"`
}

func sanitizeProjectName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		s = "Untitled project"
	}
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

func sanitizeProjectInstructions(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 4000 {
		s = s[:4000]
	}
	return s
}

func (db *DB) CreateChatProject(ctx context.Context, userID uuid.UUID, name, instructions string) (uuid.UUID, error) {
	id := uuid.New()
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO chat_projects (id, user_id, name, instructions) VALUES ($1, $2, $3, $4)`,
		id, userID, sanitizeProjectName(name), sanitizeProjectInstructions(instructions))
	return id, err
}

func (db *DB) UpdateChatProject(ctx context.Context, projectID, userID uuid.UUID, name, instructions *string) error {
	if name == nil && instructions == nil {
		return nil
	}
	set := make([]string, 0, 3)
	args := []interface{}{projectID, userID}
	idx := 3
	if name != nil {
		set = append(set, "name = $"+itoa(idx))
		args = append(args, sanitizeProjectName(*name))
		idx++
	}
	if instructions != nil {
		set = append(set, "instructions = $"+itoa(idx))
		args = append(args, sanitizeProjectInstructions(*instructions))
		idx++
	}
	set = append(set, "updated_at = NOW()")
	q := "UPDATE chat_projects SET " + strings.Join(set, ", ") + " WHERE id = $1 AND user_id = $2"
	res, err := db.Pool.Exec(ctx, q, args...)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) DeleteChatProject(ctx context.Context, projectID, userID uuid.UUID) error {
	res, err := db.Pool.Exec(ctx, `DELETE FROM chat_projects WHERE id = $1 AND user_id = $2`, projectID, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) GetChatProject(ctx context.Context, projectID, userID uuid.UUID) (*ChatProject, error) {
	var p ChatProject
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, COALESCE(instructions, ''), created_at::text, updated_at::text
		 FROM chat_projects WHERE id = $1 AND user_id = $2`,
		projectID, userID,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Instructions, &p.CreatedAt, &p.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM threads WHERE chat_project_id = $1`, projectID).Scan(&p.ThreadCount)
	_ = db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM chat_project_files WHERE project_id = $1`, projectID).Scan(&p.FileCount)
	return &p, nil
}

func (db *DB) ListChatProjects(ctx context.Context, userID uuid.UUID) ([]ChatProject, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT p.id, p.user_id, p.name, COALESCE(p.instructions, ''), p.created_at::text, p.updated_at::text,
			(SELECT COUNT(*) FROM threads WHERE chat_project_id = p.id) AS thread_count,
			(SELECT COUNT(*) FROM chat_project_files WHERE project_id = p.id) AS file_count
		 FROM chat_projects p
		 WHERE p.user_id = $1
		 ORDER BY p.updated_at DESC
		 LIMIT 200`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []ChatProject
	for rows.Next() {
		var p ChatProject
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Instructions, &p.CreatedAt, &p.UpdatedAt, &p.ThreadCount, &p.FileCount); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (db *DB) ListChatProjectThreads(ctx context.Context, projectID, userID uuid.UUID) ([]Thread, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT t.id, t.user_id, COALESCE(t.title, ''), t.archived_at, t.created_at::text, t.updated_at::text
		 FROM threads t
		 WHERE t.chat_project_id = $1 AND t.user_id = $2 AND t.archived_at IS NULL
		 ORDER BY t.updated_at DESC
		 LIMIT 100`, projectID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Thread
	for rows.Next() {
		var t Thread
		if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &t.ArchivedAt, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

func (db *DB) AssignThreadToChatProject(ctx context.Context, threadID, userID, projectID uuid.UUID) error {
	res, err := db.Pool.Exec(ctx, `UPDATE threads SET chat_project_id = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2`, threadID, userID, projectID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) GetThreadProjectID(ctx context.Context, threadID uuid.UUID) (*uuid.UUID, error) {
	var pid *uuid.UUID
	err := db.Pool.QueryRow(ctx, `SELECT chat_project_id FROM threads WHERE id = $1`, threadID).Scan(&pid)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return pid, nil
}

func (db *DB) AddChatProjectFile(ctx context.Context, projectID, userID uuid.UUID, fileURL, fileName, contentType string, sizeBytes *int64) (*ChatProjectFile, error) {
	// Make sure the project belongs to the user.
	var ownerID uuid.UUID
	err := db.Pool.QueryRow(ctx, `SELECT user_id FROM chat_projects WHERE id = $1`, projectID).Scan(&ownerID)
	if err == pgx.ErrNoRows {
		return nil, pgx.ErrNoRows
	}
	if err != nil {
		return nil, err
	}
	if ownerID != userID {
		return nil, pgx.ErrNoRows
	}
	id := uuid.New()
	if len(fileName) > 255 {
		fileName = fileName[:255]
	}
	if len(contentType) > 120 {
		contentType = contentType[:120]
	}
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO chat_project_files (id, project_id, file_url, file_name, content_type, size_bytes)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		id, projectID, fileURL, fileName, contentType, sizeBytes)
	if err != nil {
		return nil, err
	}
	_, _ = db.Pool.Exec(ctx, `UPDATE chat_projects SET updated_at = NOW() WHERE id = $1`, projectID)
	return &ChatProjectFile{
		ID:          id,
		ProjectID:   projectID,
		FileURL:     fileURL,
		FileName:    fileName,
		ContentType: contentType,
		SizeBytes:   sizeBytes,
	}, nil
}

func (db *DB) ListChatProjectFiles(ctx context.Context, projectID, userID uuid.UUID) ([]ChatProjectFile, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT f.id, f.project_id, f.file_url, COALESCE(f.file_name, ''), COALESCE(f.content_type, ''), f.size_bytes, f.created_at::text
		 FROM chat_project_files f
		 JOIN chat_projects p ON p.id = f.project_id
		 WHERE f.project_id = $1 AND p.user_id = $2
		 ORDER BY f.created_at DESC`, projectID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []ChatProjectFile
	for rows.Next() {
		var f ChatProjectFile
		if err := rows.Scan(&f.ID, &f.ProjectID, &f.FileURL, &f.FileName, &f.ContentType, &f.SizeBytes, &f.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, f)
	}
	return list, rows.Err()
}

func (db *DB) DeleteChatProjectFile(ctx context.Context, fileID, userID uuid.UUID) error {
	res, err := db.Pool.Exec(ctx,
		`DELETE FROM chat_project_files WHERE id = $1 AND project_id IN (SELECT id FROM chat_projects WHERE user_id = $2)`,
		fileID, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func itoa(i int) string {
	// minimal local helper to avoid importing strconv just for one call
	return strings_itoa(i)
}

func strings_itoa(i int) string {
	// fmt.Sprintf would also work; keep allocation small
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
