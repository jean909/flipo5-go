package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// UserProfileStats is the JSON shape stored in user_profiles.stats.
type UserProfileStats struct {
	JobCounts         map[string]int    `json:"job_counts,omitempty"`
	LastUsedByType    map[string]string  `json:"last_used,omitempty"`
	TranslateTargets  []string           `json:"translate_targets,omitempty"`
	ProductCategories []string           `json:"product_categories,omitempty"`
}

// UserProfile row.
type UserProfile struct {
	UserID    uuid.UUID        `json:"user_id"`
	Stats     UserProfileStats `json:"stats"`
	UpdatedAt string           `json:"updated_at"`
}

func (db *DB) GetUserProfile(ctx context.Context, userID uuid.UUID) (*UserProfile, error) {
	var stats []byte
	var updatedAt string
	err := db.Pool.QueryRow(ctx,
		`SELECT stats, updated_at::text FROM user_profiles WHERE user_id = $1`,
		userID).Scan(&stats, &updatedAt)
	if err == pgx.ErrNoRows {
		return &UserProfile{UserID: userID, Stats: UserProfileStats{}, UpdatedAt: ""}, nil
	}
	if err != nil {
		return nil, err
	}
	var s UserProfileStats
	if len(stats) > 0 {
		_ = json.Unmarshal(stats, &s)
	}
	if s.JobCounts == nil {
		s.JobCounts = make(map[string]int)
	}
	if s.LastUsedByType == nil {
		s.LastUsedByType = make(map[string]string)
	}
	return &UserProfile{UserID: userID, Stats: s, UpdatedAt: updatedAt}, nil
}

// UpsertUserProfileStats records one job/action for learning: increments job type count,
// sets last_used for that type, and optionally merges extra (target_lang → translate_targets, category → product_categories).
func (db *DB) UpsertUserProfileStats(ctx context.Context, userID uuid.UUID, jobType string, extra map[string]interface{}) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, `INSERT INTO user_profiles (user_id, stats, updated_at) VALUES ($1,'{}',NOW()) ON CONFLICT (user_id) DO NOTHING`, userID)

	var stats []byte
	err = tx.QueryRow(ctx, `SELECT stats FROM user_profiles WHERE user_id = $1 FOR UPDATE`, userID).Scan(&stats)
	if err != nil {
		return err
	}

	var s UserProfileStats
	if len(stats) > 0 {
		_ = json.Unmarshal(stats, &s)
	}
	if s.JobCounts == nil {
		s.JobCounts = make(map[string]int)
	}
	if s.LastUsedByType == nil {
		s.LastUsedByType = make(map[string]string)
	}

	s.JobCounts[jobType]++
	s.LastUsedByType[jobType] = time.Now().UTC().Format(time.RFC3339)

	if v, ok := extra["target_lang"]; ok {
		if lang, _ := v.(string); lang != "" {
			s.TranslateTargets = appendUnique(s.TranslateTargets, lang)
		}
	}
	if v, ok := extra["category"]; ok {
		if cat, _ := v.(string); cat != "" {
			s.ProductCategories = appendUnique(s.ProductCategories, cat)
		}
	}

	out, _ := json.Marshal(s)
	_, err = tx.Exec(ctx, `UPDATE user_profiles SET stats = $2, updated_at = NOW() WHERE user_id = $1`, userID, out)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func appendUnique(slice []string, s string) []string {
	for _, v := range slice {
		if v == s {
			return slice
		}
	}
	return append(slice, s)
}
