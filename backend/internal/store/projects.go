package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrProjectNameExists = errors.New("project name exists")

type Project struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Name      string    `json:"name"`
	CreatedAt string    `json:"created_at"`
	UpdatedAt string    `json:"updated_at"`
	ItemCount int       `json:"item_count,omitempty"` // only in list
}

type ProjectItem struct {
	ID         uuid.UUID  `json:"id"`
	ProjectID  uuid.UUID  `json:"project_id"`
	Type       string     `json:"type"` // image, video
	SourceURL  string     `json:"source_url"`
	JobID      *uuid.UUID `json:"job_id,omitempty"`
	SortOrder  int        `json:"sort_order"`
	CreatedAt  string     `json:"created_at"`
	LatestURL  string     `json:"latest_url,omitempty"` // from latest version
	VersionNum int        `json:"version_num,omitempty"`
}

type ProjectVersion struct {
	ID         uuid.UUID       `json:"id"`
	ItemID     uuid.UUID       `json:"item_id"`
	VersionNum int             `json:"version_num"`
	URL        string          `json:"url"`
	Metadata   json.RawMessage `json:"metadata,omitempty"`
	CreatedAt  string          `json:"created_at"`
}

func (db *DB) ProjectNameExists(ctx context.Context, userID uuid.UUID, name string, excludeID uuid.UUID) (bool, error) {
	var n int
	err := db.Pool.QueryRow(ctx,
		`SELECT 1 FROM projects WHERE user_id = $1 AND name = $2 AND id != $3 LIMIT 1`,
		userID, name, excludeID).Scan(&n)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (db *DB) CreateProject(ctx context.Context, userID uuid.UUID, name string) (uuid.UUID, error) {
	if name == "" {
		name = "Untitled"
	}
	exists, err := db.ProjectNameExists(ctx, userID, name, uuid.Nil)
	if err != nil {
		return uuid.Nil, err
	}
	if exists {
		return uuid.Nil, ErrProjectNameExists
	}
	id := uuid.New()
	_, err = db.Pool.Exec(ctx, `INSERT INTO projects (id, user_id, name) VALUES ($1,$2,$3)`, id, userID, name)
	return id, err
}

func (db *DB) GetProject(ctx context.Context, projectID, userID uuid.UUID) (*Project, error) {
	var p Project
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, COALESCE(name,'Untitled'), created_at::text, updated_at::text FROM projects WHERE id = $1 AND user_id = $2`,
		projectID, userID).
		Scan(&p.ID, &p.UserID, &p.Name, &p.CreatedAt, &p.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &p, err
}

// GetProjectOwner returns the user_id of the project if it exists (for debugging 404s).
func (db *DB) GetProjectOwner(ctx context.Context, projectID uuid.UUID) (uuid.UUID, bool) {
	var owner uuid.UUID
	err := db.Pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&owner)
	return owner, err == nil
}

func (db *DB) ListProjects(ctx context.Context, userID uuid.UUID, limit int) ([]Project, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := db.Pool.Query(ctx,
		`SELECT p.id, p.user_id, COALESCE(p.name,'Untitled'), p.created_at::text, p.updated_at::text,
		        (SELECT COUNT(*) FROM projects_items WHERE project_id = p.id)::int
		 FROM projects p WHERE p.user_id = $1 ORDER BY p.updated_at DESC LIMIT $2`,
		userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.CreatedAt, &p.UpdatedAt, &p.ItemCount); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (db *DB) UpdateProject(ctx context.Context, projectID, userID uuid.UUID, name string) error {
	exists, err := db.ProjectNameExists(ctx, userID, name, projectID)
	if err != nil {
		return err
	}
	if exists {
		return ErrProjectNameExists
	}
	result, err := db.Pool.Exec(ctx, `UPDATE projects SET name = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2`, projectID, userID, name)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) DeleteProject(ctx context.Context, projectID, userID uuid.UUID) error {
	result, err := db.Pool.Exec(ctx, `DELETE FROM projects WHERE id = $1 AND user_id = $2`, projectID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) TouchProject(ctx context.Context, projectID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx, `UPDATE projects SET updated_at = NOW() WHERE id = $1`, projectID)
	return err
}

func (db *DB) AddProjectItem(ctx context.Context, projectID, userID uuid.UUID, itemType, sourceURL string, jobID *uuid.UUID) (uuid.UUID, error) {
	p, err := db.GetProject(ctx, projectID, userID)
	if err != nil || p == nil {
		return uuid.Nil, pgx.ErrNoRows
	}
	var maxOrder int
	_ = db.Pool.QueryRow(ctx, `SELECT COALESCE(MAX(sort_order),0) FROM projects_items WHERE project_id = $1`, projectID).Scan(&maxOrder)
	id := uuid.New()
	_, err = db.Pool.Exec(ctx, `INSERT INTO projects_items (id, project_id, type, source_url, job_id, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
		id, projectID, itemType, sourceURL, jobID, maxOrder+1)
	if err != nil {
		return uuid.Nil, err
	}
	_ = db.TouchProject(ctx, projectID)
	return id, nil
}

func (db *DB) ListProjectItems(ctx context.Context, projectID, userID uuid.UUID) ([]ProjectItem, error) {
	p, err := db.GetProject(ctx, projectID, userID)
	if err != nil || p == nil {
		return nil, err
	}
	_ = p
	rows, err := db.Pool.Query(ctx, `
		SELECT pi.id, pi.project_id, pi.type, pi.source_url, pi.job_id, pi.sort_order, pi.created_at,
		       COALESCE((SELECT pv.url FROM projects_versions pv WHERE pv.item_id = pi.id ORDER BY pv.version_num DESC LIMIT 1), pi.source_url),
		       COALESCE((SELECT pv.version_num FROM projects_versions pv WHERE pv.item_id = pi.id ORDER BY pv.version_num DESC LIMIT 1), 0)
		FROM projects_items pi
		WHERE pi.project_id = $1
		ORDER BY pi.sort_order, pi.created_at`,
		projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []ProjectItem
	for rows.Next() {
		var it ProjectItem
		if err := rows.Scan(&it.ID, &it.ProjectID, &it.Type, &it.SourceURL, &it.JobID, &it.SortOrder, &it.CreatedAt, &it.LatestURL, &it.VersionNum); err != nil {
			return nil, err
		}
		if it.LatestURL == "" {
			it.LatestURL = it.SourceURL
		}
		list = append(list, it)
	}
	return list, rows.Err()
}

func (db *DB) RemoveProjectItem(ctx context.Context, itemID, userID uuid.UUID) error {
	result, err := db.Pool.Exec(ctx, `
		DELETE FROM projects_items WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)`,
		itemID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) AddProjectVersion(ctx context.Context, itemID, userID uuid.UUID, url string, metadata json.RawMessage) error {
	var projectID uuid.UUID
	err := db.Pool.QueryRow(ctx, `SELECT project_id FROM projects_items WHERE id = $1`, itemID).Scan(&projectID)
	if err == pgx.ErrNoRows {
		return pgx.ErrNoRows
	}
	if err != nil {
		return err
	}
	p, err := db.GetProject(ctx, projectID, userID)
	if err != nil || p == nil {
		return pgx.ErrNoRows
	}
	_ = p
	var nextNum int
	_ = db.Pool.QueryRow(ctx, `SELECT COALESCE(MAX(version_num),0)+1 FROM projects_versions WHERE item_id = $1`, itemID).Scan(&nextNum)
	if metadata == nil {
		metadata = []byte("{}")
	}
	_, err = db.Pool.Exec(ctx, `INSERT INTO projects_versions (item_id, version_num, url, metadata) VALUES ($1,$2,$3,$4)`,
		itemID, nextNum, url, metadata)
	if err != nil {
		return err
	}
	_ = db.TouchProject(ctx, projectID)
	return nil
}

func (db *DB) ListProjectVersions(ctx context.Context, itemID, userID uuid.UUID) ([]ProjectVersion, error) {
	var projectID uuid.UUID
	err := db.Pool.QueryRow(ctx, `SELECT project_id FROM projects_items WHERE id = $1`, itemID).Scan(&projectID)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p, _ := db.GetProject(ctx, projectID, userID)
	if p == nil {
		return nil, nil
	}
	_ = p
	rows, err := db.Pool.Query(ctx,
		`SELECT id, item_id, version_num, url, COALESCE(metadata::text,'{}'), created_at::text FROM projects_versions WHERE item_id = $1 ORDER BY version_num DESC LIMIT 20`,
		itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []ProjectVersion
	for rows.Next() {
		var v ProjectVersion
		var meta []byte
		if err := rows.Scan(&v.ID, &v.ItemID, &v.VersionNum, &v.URL, &meta, &v.CreatedAt); err != nil {
			return nil, err
		}
		v.Metadata = meta
		list = append(list, v)
	}
	return list, rows.Err()
}
