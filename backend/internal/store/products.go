package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Product struct {
	ID          uuid.UUID `json:"id"`
	UserID      uuid.UUID `json:"user_id"`
	Name        string    `json:"name"`
	Category    string    `json:"category,omitempty"`
	Description string    `json:"description,omitempty"`
	Brand       string    `json:"brand,omitempty"`
	CreatedAt   string    `json:"created_at"`
	UpdatedAt   string    `json:"updated_at"`
}

type ProductPhoto struct {
	ID        uuid.UUID `json:"id"`
	ProductID uuid.UUID `json:"product_id"`
	ImageURL  string    `json:"image_url"`
	Score     *float64  `json:"score,omitempty"`
	SortOrder int       `json:"sort_order"`
	CreatedAt string    `json:"created_at"`
}

func (db *DB) CreateProduct(ctx context.Context, userID uuid.UUID, name, category, description, brand string) (uuid.UUID, error) {
	id := uuid.New()
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO products (id, user_id, name, category, description, brand) VALUES ($1,$2,$3,$4,$5,$6)`,
		id, userID, name, category, description, brand)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (db *DB) GetProduct(ctx context.Context, productID, userID uuid.UUID) (*Product, error) {
	var p Product
	err := db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, COALESCE(category,''), COALESCE(description,''), COALESCE(brand,''), created_at::text, updated_at::text FROM products WHERE id = $1 AND user_id = $2`,
		productID, userID).
		Scan(&p.ID, &p.UserID, &p.Name, &p.Category, &p.Description, &p.Brand, &p.CreatedAt, &p.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (db *DB) ListProducts(ctx context.Context, userID uuid.UUID) ([]Product, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, user_id, name, COALESCE(category,''), COALESCE(description,''), COALESCE(brand,''), created_at::text, updated_at::text FROM products WHERE user_id = $1 ORDER BY updated_at DESC`,
		userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Category, &p.Description, &p.Brand, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (db *DB) AddProductPhoto(ctx context.Context, productID uuid.UUID, imageURL string, sortOrder int) (uuid.UUID, error) {
	id := uuid.New()
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO product_photos (id, product_id, image_url, sort_order) VALUES ($1,$2,$3,$4)`,
		id, productID, imageURL, sortOrder)
	if err != nil {
		return uuid.Nil, err
	}
	_, _ = db.Pool.Exec(ctx, `UPDATE products SET updated_at = NOW() WHERE id = $1`, productID)
	return id, nil
}

func (db *DB) ListProductPhotos(ctx context.Context, productID uuid.UUID) ([]ProductPhoto, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, product_id, image_url, score, sort_order, created_at::text FROM product_photos WHERE product_id = $1 ORDER BY sort_order ASC, created_at ASC`,
		productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []ProductPhoto
	for rows.Next() {
		var ph ProductPhoto
		if err := rows.Scan(&ph.ID, &ph.ProductID, &ph.ImageURL, &ph.Score, &ph.SortOrder, &ph.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, ph)
	}
	return list, rows.Err()
}

// UpdateProductPhotoScores sets score for each photo by order (scores[i] -> i-th photo by sort_order).
func (db *DB) UpdateProductPhotoScores(ctx context.Context, productID uuid.UUID, scores []float64) error {
	photos, err := db.ListProductPhotos(ctx, productID)
	if err != nil || len(photos) == 0 {
		return err
	}
	for i, ph := range photos {
		if i < len(scores) {
			_, err = db.Pool.Exec(ctx, `UPDATE product_photos SET score = $2 WHERE id = $1`, ph.ID, scores[i])
			if err != nil {
				return err
			}
		}
	}
	_, _ = db.Pool.Exec(ctx, `UPDATE products SET updated_at = NOW() WHERE id = $1`, productID)
	return nil
}

func (db *DB) DeleteProductPhoto(ctx context.Context, photoID uuid.UUID, userID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx,
		`DELETE FROM product_photos WHERE id = $1 AND product_id IN (SELECT id FROM products WHERE user_id = $2)`,
		photoID, userID)
	return err
}

func (db *DB) DeleteProduct(ctx context.Context, productID, userID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx, `DELETE FROM products WHERE id = $1 AND user_id = $2`, productID, userID)
	return err
}

func (db *DB) UpdateProduct(ctx context.Context, productID, userID uuid.UUID, name, category, description, brand string) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE products
		 SET name = $3,
		     category = $4,
		     description = $5,
		     brand = $6,
		     updated_at = NOW()
		 WHERE id = $1 AND user_id = $2`,
		productID, userID, name, category, description, brand)
	return err
}
