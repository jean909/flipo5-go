package store

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaFS embed.FS

//go:embed migrations/*.sql
var migrationsFS embed.FS

type DB struct {
	Pool *pgxpool.Pool
}

func NewDB(ctx context.Context, connString string) (*DB, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, err
	}
	// Pool sized for workers + concurrent API (polling, parallel handlers)
	if config.MaxConns < 24 {
		config.MaxConns = 24
	}
	if config.MinConns < 4 {
		config.MinConns = 4
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return &DB{Pool: pool}, nil
}

func (db *DB) Close() { db.Pool.Close() }

func (db *DB) Ping(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

func (db *DB) Migrate(ctx context.Context) error {
	if _, err := db.Pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name TEXT PRIMARY KEY,
		applied_at TIMESTAMPTZ DEFAULT NOW()
	)`); err != nil {
		return fmt.Errorf("schema_migrations: %w", err)
	}

	b, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		return err
	}
	for _, s := range strings.Split(string(b), ";") {
		stmt := strings.TrimSpace(s)
		if stmt == "" {
			continue
		}
		if _, err := db.Pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}

	entries, _ := migrationsFS.ReadDir("migrations")
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var applied bool
		if err := db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)`, name).Scan(&applied); err != nil {
			return fmt.Errorf("migration check %s: %w", name, err)
		}
		if applied {
			continue
		}

		b, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := db.Pool.Begin(ctx)
		if err != nil {
			return err
		}
		for _, s := range strings.Split(string(b), ";") {
			stmt := strings.TrimSpace(s)
			for strings.HasPrefix(stmt, "--") || strings.TrimSpace(stmt) == "" {
				if idx := strings.Index(stmt, "\n"); idx >= 0 {
					stmt = strings.TrimSpace(stmt[idx+1:])
				} else {
					stmt = ""
					break
				}
			}
			if stmt == "" {
				continue
			}
			if _, err := tx.Exec(ctx, stmt); err != nil {
				_ = tx.Rollback(ctx)
				return fmt.Errorf("migration %s: %w", name, err)
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations(name) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migration record %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("migration commit %s: %w", name, err)
		}
	}
	return nil
}
