package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type User struct {
	ID                   uuid.UUID              `json:"id"`
	Email                string                 `json:"email"`
	FullName             string                 `json:"full_name,omitempty"`
	WhereHeard           string                 `json:"where_heard,omitempty"`
	UseCase              string                 `json:"use_case,omitempty"`
	Plan                 string                 `json:"plan,omitempty"`
	DataRetentionAccepted *bool                 `json:"data_retention_accepted,omitempty"`
	AIConfiguration      map[string]interface{} `json:"ai_configuration"`
	AIConfigUpdatedAt    string                `json:"ai_config_updated_at,omitempty"`
	IsAdmin              bool                  `json:"is_admin,omitempty"`
	CreatedAt            string                `json:"created_at"`
	UpdatedAt            string                `json:"updated_at,omitempty"`
}

func (db *DB) UserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	var u User
	var aiConfig []byte
	var aiUpdatedAt *string
	err := db.Pool.QueryRow(ctx, `SELECT id, email, COALESCE(full_name,''), COALESCE(where_heard,''), COALESCE(use_case,''), COALESCE(plan,''), 
		data_retention_accepted, COALESCE(ai_configuration, '{}'), ai_config_updated_at::text,
		COALESCE(is_admin, false), created_at::text, COALESCE(updated_at::text, created_at::text) FROM users WHERE id = $1`, id).
		Scan(&u.ID, &u.Email, &u.FullName, &u.WhereHeard, &u.UseCase, &u.Plan, &u.DataRetentionAccepted, &aiConfig, &aiUpdatedAt, &u.IsAdmin, &u.CreatedAt, &u.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if len(aiConfig) > 0 {
		_ = json.Unmarshal(aiConfig, &u.AIConfiguration)
	}
	if u.AIConfiguration == nil {
		u.AIConfiguration = map[string]interface{}{}
	}
	if aiUpdatedAt != nil {
		u.AIConfigUpdatedAt = *aiUpdatedAt
	}
	return &u, err
}

func (db *DB) UserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	var aiConfig []byte
	var aiUpdatedAt *string
	err := db.Pool.QueryRow(ctx, `SELECT id, email, COALESCE(full_name,''), COALESCE(where_heard,''), COALESCE(use_case,''), COALESCE(plan,''),
		data_retention_accepted, COALESCE(ai_configuration, '{}'), ai_config_updated_at::text,
		COALESCE(is_admin, false), created_at::text, COALESCE(updated_at::text, created_at::text) FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.FullName, &u.WhereHeard, &u.UseCase, &u.Plan, &u.DataRetentionAccepted, &aiConfig, &aiUpdatedAt, &u.IsAdmin, &u.CreatedAt, &u.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if len(aiConfig) > 0 {
		_ = json.Unmarshal(aiConfig, &u.AIConfiguration)
	}
	if u.AIConfiguration == nil {
		u.AIConfiguration = map[string]interface{}{}
	}
	if aiUpdatedAt != nil {
		u.AIConfigUpdatedAt = *aiUpdatedAt
	}
	return &u, err
}

func (db *DB) CreateUser(ctx context.Context, email string) (*User, error) {
	id := uuid.New()
	_, err := db.Pool.Exec(ctx, `INSERT INTO users (id, email) VALUES ($1,$2)`, id, email)
	if err != nil {
		return nil, err
	}
	return db.UserByID(ctx, id)
}

func (db *DB) EnsureUser(ctx context.Context, email string) (*User, error) {
	u, err := db.UserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if u != nil {
		return u, nil
	}
	return db.CreateUser(ctx, email)
}

// UpsertUser inserts or updates user by id (from Supabase Auth). Used to sync auth.users → users.
func (db *DB) UpsertUser(ctx context.Context, id uuid.UUID, email string) error {
	if email == "" {
		email = id.String() + "@supabase.local" // placeholder when JWT has no email
	}
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = COALESCE(NULLIF(EXCLUDED.email,''), users.email), updated_at = NOW()`,
		id, email)
	return err
}

// UpdateUserProfile updates optional profile fields. Nil pointer = do not update.
func (db *DB) UpdateUserProfile(ctx context.Context, id uuid.UUID, fullName, whereHeard, useCase, plan *string) error {
	if fullName != nil {
		_, err := db.Pool.Exec(ctx, `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`, *fullName, id)
		if err != nil {
			return err
		}
	}
	if whereHeard != nil {
		_, err := db.Pool.Exec(ctx, `UPDATE users SET where_heard = $1, updated_at = NOW() WHERE id = $2`, *whereHeard, id)
		if err != nil {
			return err
		}
	}
	if useCase != nil {
		_, err := db.Pool.Exec(ctx, `UPDATE users SET use_case = $1, updated_at = NOW() WHERE id = $2`, *useCase, id)
		if err != nil {
			return err
		}
	}
	if plan != nil {
		_, err := db.Pool.Exec(ctx, `UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2`, *plan, id)
		if err != nil {
			return err
		}
	}
	return nil
}

// ListUsers returns users for admin (paginated, optional search by email/full_name).
func (db *DB) ListUsers(ctx context.Context, limit, offset int, search string) ([]User, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	base := `FROM users WHERE 1=1`
	args := []interface{}{}
	n := 0
	if search != "" {
		n++
		base += fmt.Sprintf(" AND (email ILIKE $%d OR full_name ILIKE $%d)", n, n)
		args = append(args, "%"+search+"%")
	}
	var total int
	if err := db.Pool.QueryRow(ctx, "SELECT COUNT(*) "+base, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	n = len(args)
	rows, err := db.Pool.Query(ctx, `SELECT id, email, COALESCE(full_name,''), COALESCE(where_heard,''), COALESCE(use_case,''), COALESCE(plan,''),
		data_retention_accepted, COALESCE(ai_configuration, '{}'), ai_config_updated_at::text, COALESCE(is_admin, false),
		created_at::text, COALESCE(updated_at::text, created_at::text) `+base+` ORDER BY created_at DESC LIMIT $`+strconv.Itoa(n-1)+` OFFSET $`+strconv.Itoa(n), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var list []User
	for rows.Next() {
		var u User
		var aiConfig []byte
		var aiUpdatedAt *string
		if err := rows.Scan(&u.ID, &u.Email, &u.FullName, &u.WhereHeard, &u.UseCase, &u.Plan, &u.DataRetentionAccepted, &aiConfig, &aiUpdatedAt, &u.IsAdmin, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, 0, err
		}
		if len(aiConfig) > 0 {
			_ = json.Unmarshal(aiConfig, &u.AIConfiguration)
		}
		if u.AIConfiguration == nil {
			u.AIConfiguration = map[string]interface{}{}
		}
		if aiUpdatedAt != nil {
			u.AIConfigUpdatedAt = *aiUpdatedAt
		}
		list = append(list, u)
	}
	return list, total, rows.Err()
}

// AdminStats holds dashboard counts for admin.
type AdminStats struct {
	TotalUsers      int            `json:"total_users"`
	TotalJobs       int            `json:"total_jobs"`
	JobsByStatus    map[string]int `json:"jobs_by_status"`
	JobsLast24h     int            `json:"jobs_last_24h"`
	JobsCompleted   int            `json:"jobs_completed"`
	JobsFailed      int            `json:"jobs_failed"`
	TotalThreads    int            `json:"total_threads"`
}

// GetAdminStats returns aggregate stats for admin dashboard.
func (db *DB) GetAdminStats(ctx context.Context) (*AdminStats, error) {
	var s AdminStats
	s.JobsByStatus = make(map[string]int)
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&s.TotalUsers); err != nil {
		return nil, err
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM jobs`).Scan(&s.TotalJobs); err != nil {
		return nil, err
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE created_at > NOW() - INTERVAL '24 hours'`).Scan(&s.JobsLast24h); err != nil {
		return nil, err
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE status = 'completed'`).Scan(&s.JobsCompleted); err != nil {
		return nil, err
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM jobs WHERE status = 'failed'`).Scan(&s.JobsFailed); err != nil {
		return nil, err
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM threads`).Scan(&s.TotalThreads); err != nil {
		return nil, err
	}
	rows, _ := db.Pool.Query(ctx, `SELECT status, COUNT(*) FROM jobs GROUP BY status`)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var status string
			var count int
			if rows.Scan(&status, &count) == nil {
				s.JobsByStatus[status] = count
			}
		}
	}
	return &s, nil
}

// ErrAIConfigCooldown is returned when ai_configuration was updated less than 24h ago.
var ErrAIConfigCooldown = errors.New("ai_config cooldown 24h")

// UpdateUserSettings updates data_retention_accepted and/or ai_configuration.
// ai_configuration can only be updated once per 24h.
func (db *DB) UpdateUserSettings(ctx context.Context, id uuid.UUID, dataRetention *bool, aiConfig map[string]interface{}) error {
	if dataRetention != nil {
		_, err := db.Pool.Exec(ctx, `UPDATE users SET data_retention_accepted = $1, updated_at = NOW() WHERE id = $2`, *dataRetention, id)
		if err != nil {
			return err
		}
	}
	if aiConfig != nil {
		b, _ := json.Marshal(aiConfig)
		res, err := db.Pool.Exec(ctx, `UPDATE users SET ai_configuration = $1, ai_config_updated_at = NOW(), updated_at = NOW()
			WHERE id = $2 AND (ai_config_updated_at IS NULL OR ai_config_updated_at < NOW() - INTERVAL '24 hours')`, b, id)
		if err != nil {
			return err
		}
		if res.RowsAffected() == 0 {
			return ErrAIConfigCooldown
		}
	}
	return nil
}
