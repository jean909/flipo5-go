package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Brand struct {
	ID        uuid.UUID       `json:"id"`
	UserID    uuid.UUID       `json:"user_id"`
	Name      string          `json:"name"`
	DNA       json.RawMessage `json:"dna"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

func (db *DB) CreateBrand(ctx context.Context, userID uuid.UUID, name string, dna interface{}) (uuid.UUID, error) {
	b, err := json.Marshal(dna)
	if err != nil {
		return uuid.Nil, err
	}
	id := uuid.New()
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO brands (id, user_id, name, dna) VALUES ($1,$2,$3,$4)`,
		id, userID, name, b)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (db *DB) UpdateBrandDNA(ctx context.Context, brandID, userID uuid.UUID, name string, dna interface{}) error {
	b, err := json.Marshal(dna)
	if err != nil {
		return err
	}
	_, err = db.Pool.Exec(ctx,
		`UPDATE brands SET name = $3, dna = $4, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
		brandID, userID, name, b)
	return err
}

func (db *DB) ListBrands(ctx context.Context, userID uuid.UUID) ([]Brand, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, name, dna, created_at::text, updated_at::text
		 FROM brands WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Brand
	for rows.Next() {
		var b Brand
		if err := rows.Scan(&b.ID, &b.UserID, &b.Name, &b.DNA, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, b)
	}
	return list, rows.Err()
}

func (db *DB) GetBrand(ctx context.Context, brandID, userID uuid.UUID) (*Brand, error) {
	var b Brand
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, dna, created_at::text, updated_at::text
		 FROM brands WHERE id = $1 AND user_id = $2`, brandID, userID).
		Scan(&b.ID, &b.UserID, &b.Name, &b.DNA, &b.CreatedAt, &b.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (db *DB) DeleteBrand(ctx context.Context, brandID, userID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx,
		`DELETE FROM brands WHERE id = $1 AND user_id = $2`, brandID, userID)
	return err
}
