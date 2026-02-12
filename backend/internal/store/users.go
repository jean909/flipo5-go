package store

import (
	"context"
	"encoding/json"
	"errors"

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
	AIConfigUpdatedAt     string                `json:"ai_config_updated_at,omitempty"`
	CreatedAt            string                `json:"created_at"`
	UpdatedAt            string                `json:"updated_at,omitempty"`
}

func (db *DB) UserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	var u User
	var aiConfig []byte
	var aiUpdatedAt *string
	err := db.Pool.QueryRow(ctx, `SELECT id, email, COALESCE(full_name,''), COALESCE(where_heard,''), COALESCE(use_case,''), COALESCE(plan,''), 
		data_retention_accepted, COALESCE(ai_configuration, '{}'), ai_config_updated_at::text,
		created_at::text, COALESCE(updated_at::text, created_at::text) FROM users WHERE id = $1`, id).
		Scan(&u.ID, &u.Email, &u.FullName, &u.WhereHeard, &u.UseCase, &u.Plan, &u.DataRetentionAccepted, &aiConfig, &aiUpdatedAt, &u.CreatedAt, &u.UpdatedAt)
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
		created_at::text, COALESCE(updated_at::text, created_at::text) FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.FullName, &u.WhereHeard, &u.UseCase, &u.Plan, &u.DataRetentionAccepted, &aiConfig, &aiUpdatedAt, &u.CreatedAt, &u.UpdatedAt)
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
