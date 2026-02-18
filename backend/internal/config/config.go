package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port          string
	JWTSecret     string
	JWTExpireMins int

	PGURL string
	Redis string

	AsynqConcurrency int // worker concurrency (default 8)

	ReplicateToken    string
	SupabaseJWTSecret   string // legacy; used only if SupabaseURL not set
	SupabaseURL         string // e.g. https://xxx.supabase.co — for JWKS verification (new signing keys)
	SupabaseServiceRole string // for admin API (check-email)

	// S3/R2 compatible (Cloudflare R2, MinIO, AWS S3)
	S3Endpoint   string
	S3Region     string
	S3Bucket     string
	S3AccessKey  string
	S3SecretKey  string
	S3UseSSL     bool
	S3PublicURL  string // e.g. https://storage.flipo5.com for public read URLs

	// Model identifiers from env (e.g. meta/meta-llama-3-70b-instruct)
	ModelText      string
	ModelImage     string
	ModelImageHD   string // google/nano-banana for HD / Edit
	ModelFluxFill  string // black-forest-labs/flux-fill-pro for Edit using Brush (inpainting)
	ModelVideo     string
	ModelVideo2    string // kwaivgi/kling-v2.5-turbo-pro (start_image, end_image)
	ModelRemoveBg  string // bria/remove-background for studio remove background

	// CORS: comma-separated origins, e.g. "http://localhost:3000,https://app.example.com". Empty = allow "*"
	CORSOrigins string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		JWTSecret:      getEnv("JWT_SECRET", "change-me"),
		JWTExpireMins:  getEnvInt("JWT_EXPIRE_MINS", 60),
		PGURL:            getEnv("DATABASE_URL", "postgres://localhost/flipo5?sslmode=disable"),
		Redis:             getEnv("REDIS_URL", "redis://localhost:6379"),
		AsynqConcurrency:  getEnvInt("ASYNQ_CONCURRENCY", 8),
		ReplicateToken:   getEnv("REPLICATE_API_TOKEN", ""),
		SupabaseJWTSecret:   getEnv("SUPABASE_JWT_SECRET", ""),
		SupabaseURL:         strings.TrimSuffix(strings.TrimSpace(trimQuotes(getEnv("SUPABASE_URL", ""))), "/"),
		SupabaseServiceRole: strings.TrimSpace(trimQuotes(getEnv("SUPABASE_SERVICE_ROLE_KEY", ""))),
		S3Endpoint:     s3Endpoint(),
		S3Region:       getEnv("S3_REGION", getEnv("CLOUDFLARE_R2_REGION", "auto")),
		S3Bucket:       getEnv("S3_BUCKET", getEnv("CLOUDFLARE_R2_BUCKET_NAME", "flipo5")),
		S3AccessKey:    getEnv("S3_ACCESS_KEY", getEnv("CLOUDFLARE_R2_ACCESS_KEY_ID", "")),
		S3SecretKey:    getEnv("S3_SECRET_KEY", getEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")),
		S3UseSSL:       getEnvBool("S3_USE_SSL", true),
		S3PublicURL:    strings.TrimSuffix(getEnv("S3_PUBLIC_URL", getEnv("CLOUDFLARE_R2_PUBLIC_URL", "")), "/"),
		ModelText:      getEnv("REPLICATE_MODEL_TEXT", ""),
		ModelImage:     getEnv("REPLICATE_MODEL_IMAGE", "bytedance/seedream-4.5"),
		ModelImageHD:   getEnv("REPLICATE_MODEL_IMAGE_HD", "google/nano-banana"),
		ModelFluxFill:   getEnv("REPLICATE_MODEL_FLUX_FILL", "black-forest-labs/flux-fill-pro"),
		ModelVideo:     getEnv("REPLICATE_MODEL_VIDEO", "xai/grok-imagine-video"),
		ModelVideo2:    getEnv("REPLICATE_MODEL_VIDEO_2", "kwaivgi/kling-v2.5-turbo-pro"),
		ModelRemoveBg:  getEnv("REPLICATE_MODEL_REMOVE_BG", "bria/remove-background"),
		CORSOrigins:    strings.TrimSpace(getEnv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")),
	}
}

func getEnv(k, defaultV string) string {
	if v := os.Getenv(k); v != "" {
		return strings.TrimSpace(v)
	}
	return defaultV
}

// s3Endpoint returns S3_ENDPOINT or CLOUDFLARE_R2_ENDPOINT, with scheme stripped for AWS SDK.
func s3Endpoint() string {
	raw := getEnv("S3_ENDPOINT", getEnv("CLOUDFLARE_R2_ENDPOINT", ""))
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	return raw
}

func trimQuotes(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && (s[0] == '"' && s[len(s)-1] == '"' || s[0] == '\'' && s[len(s)-1] == '\'') {
		return s[1 : len(s)-1]
	}
	return s
}

func getEnvInt(k string, defaultV int) int {
	if v := os.Getenv(k); v != "" {
		n, _ := strconv.Atoi(v)
		return n
	}
	return defaultV
}

func getEnvBool(k string, defaultV bool) bool {
	if v := os.Getenv(k); v != "" {
		return v == "1" || v == "true" || v == "yes"
	}
	return defaultV
}
