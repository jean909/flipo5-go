package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type TranslationProject struct {
	ID         uuid.UUID `json:"id"`
	UserID     uuid.UUID `json:"user_id"`
	Name       string    `json:"name"`
	SourceLang string    `json:"source_lang"`
	TargetLang string    `json:"target_lang"`
	CreatedAt  string    `json:"created_at"`
	UpdatedAt  string    `json:"updated_at"`
}

type TranslationItem struct {
	ID           uuid.UUID  `json:"id"`
	ProjectID    uuid.UUID  `json:"project_id"`
	SourceType   string    `json:"source_type"`
	SourceValue  string    `json:"source_value"`
	Status       string    `json:"status"`
	ResultText   *string   `json:"result_text,omitempty"`
	ErrorMessage *string   `json:"error_message,omitempty"`
	JobID        *uuid.UUID `json:"job_id,omitempty"`
	SortOrder    int       `json:"sort_order"`
	CreatedAt    string    `json:"created_at"`
	UpdatedAt    string    `json:"updated_at"`
}

func (db *DB) CreateTranslationProject(ctx context.Context, userID uuid.UUID, name, sourceLang, targetLang string) (uuid.UUID, error) {
	id := uuid.New()
	if sourceLang == "" {
		sourceLang = "auto"
	}
	if targetLang == "" {
		targetLang = "English"
	}
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO translation_projects (id, user_id, name, source_lang, target_lang) VALUES ($1,$2,$3,$4,$5)`,
		id, userID, name, sourceLang, targetLang)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (db *DB) ListTranslationProjects(ctx context.Context, userID uuid.UUID) ([]TranslationProject, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, name, source_lang, target_lang, created_at::text, updated_at::text
		 FROM translation_projects WHERE user_id = $1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []TranslationProject
	for rows.Next() {
		var p TranslationProject
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.SourceLang, &p.TargetLang, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, nil
}

func (db *DB) GetTranslationProject(ctx context.Context, projectID, userID uuid.UUID) (*TranslationProject, error) {
	var p TranslationProject
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, source_lang, target_lang, created_at::text, updated_at::text
		 FROM translation_projects WHERE id = $1 AND user_id = $2`, projectID, userID).
		Scan(&p.ID, &p.UserID, &p.Name, &p.SourceLang, &p.TargetLang, &p.CreatedAt, &p.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (db *DB) ListTranslationItems(ctx context.Context, projectID uuid.UUID) ([]TranslationItem, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, project_id, source_type, source_value, status, result_text, error_message, job_id, sort_order, created_at::text, updated_at::text
		 FROM translation_items WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []TranslationItem
	for rows.Next() {
		var it TranslationItem
		if err := rows.Scan(&it.ID, &it.ProjectID, &it.SourceType, &it.SourceValue, &it.Status, &it.ResultText, &it.ErrorMessage, &it.JobID, &it.SortOrder, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, it)
	}
	return list, nil
}

func (db *DB) AddTranslationItem(ctx context.Context, projectID uuid.UUID, sourceType, sourceValue string, sortOrder int) (uuid.UUID, error) {
	id := uuid.New()
	if sourceType != "url" && sourceType != "text" {
		sourceType = "text"
	}
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO translation_items (id, project_id, source_type, source_value, sort_order) VALUES ($1,$2,$3,$4,$5)`,
		id, projectID, sourceType, sourceValue, sortOrder)
	if err != nil {
		return uuid.Nil, err
	}
	_, _ = db.Pool.Exec(ctx, `UPDATE translation_projects SET updated_at = NOW() WHERE id = $1`, projectID)
	return id, nil
}

func (db *DB) GetTranslationItem(ctx context.Context, itemID uuid.UUID) (*TranslationItem, error) {
	var it TranslationItem
	err := db.Pool.QueryRow(ctx,
		`SELECT id, project_id, source_type, source_value, status, result_text, error_message, job_id, sort_order, created_at::text, updated_at::text
		 FROM translation_items WHERE id = $1`, itemID).
		Scan(&it.ID, &it.ProjectID, &it.SourceType, &it.SourceValue, &it.Status, &it.ResultText, &it.ErrorMessage, &it.JobID, &it.SortOrder, &it.CreatedAt, &it.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &it, nil
}

func (db *DB) UpdateTranslationItemAfterJob(ctx context.Context, itemID uuid.UUID, jobID uuid.UUID, status string, resultText, errorMsg *string) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE translation_items SET status = $2, result_text = $3, error_message = $4, job_id = $5, updated_at = NOW()
		 WHERE id = $1`, itemID, status, resultText, errorMsg, jobID)
	if err != nil {
		return err
	}
	var projectID uuid.UUID
	_ = db.Pool.QueryRow(ctx, `SELECT project_id FROM translation_items WHERE id = $1`, itemID).Scan(&projectID)
	if projectID != uuid.Nil {
		_, _ = db.Pool.Exec(ctx, `UPDATE translation_projects SET updated_at = NOW() WHERE id = $1`, projectID)
	}
	return nil
}

func (db *DB) SetTranslationItemRunning(ctx context.Context, itemID, jobID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE translation_items SET status = 'running', job_id = $2, updated_at = NOW() WHERE id = $1`, itemID, jobID)
	return err
}

func (db *DB) DeleteTranslationItem(ctx context.Context, itemID uuid.UUID, userID uuid.UUID) error {
	res, err := db.Pool.Exec(ctx,
		`DELETE FROM translation_items WHERE id = $1 AND project_id IN (SELECT id FROM translation_projects WHERE user_id = $2)`, itemID, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) DeleteTranslationProject(ctx context.Context, projectID, userID uuid.UUID) error {
	res, err := db.Pool.Exec(ctx,
		`DELETE FROM translation_projects WHERE id = $1 AND user_id = $2`, projectID, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
