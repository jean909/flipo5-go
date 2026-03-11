package store

import (
	"context"
	"embed"
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
	// Increase pool for workers (8) + concurrent API polling (multiple users × multiple jobs)
	if config.MaxConns < 20 {
		config.MaxConns = 20
	}
	if config.MinConns < 2 {
		config.MinConns = 2
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
	// Run migrations (e.g. 001_add_upscale_job_type.sql for existing DBs)
	entries, _ := migrationsFS.ReadDir("migrations")
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		b, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		for _, s := range strings.Split(string(b), ";") {
			stmt := strings.TrimSpace(s)
			// Skip empty or comment-only blocks; strip leading comment lines
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
			if _, err := db.Pool.Exec(ctx, stmt); err != nil {
				return err
			}
		}
	}
	return nil
}
