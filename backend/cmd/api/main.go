package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/hibiken/asynq"
	"github.com/joho/godotenv"
	"github.com/rs/cors"
	"flipo5/backend/internal/api"
	"flipo5/backend/internal/config"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/stream"
	"flipo5/backend/internal/storage"
	"flipo5/backend/internal/store"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	ctx := context.Background()

	db, err := store.NewDB(ctx, cfg.PGURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		log.Printf("migrate (non-fatal): %v", err)
	}

	var redisOpt asynq.RedisConnOpt
	if parsed, err := asynq.ParseRedisURI(cfg.Redis); err == nil {
		redisOpt = parsed
	} else {
		// Fallback: host:port only (no auth)
		redisAddr := cfg.Redis
		if strings.HasPrefix(redisAddr, "rediss://") {
			redisAddr = strings.TrimPrefix(redisAddr, "rediss://")
		} else if strings.HasPrefix(redisAddr, "redis://") {
			redisAddr = strings.TrimPrefix(redisAddr, "redis://")
		}
		redisOpt = asynq.RedisClientOpt{Addr: redisAddr}
	}
	asynqClient := asynq.NewClient(redisOpt)
	defer asynqClient.Close()

	var streamPub *stream.Publisher
	var streamSub *stream.Subscriber
	if streamPub, _ = stream.NewPublisher(cfg.Redis); streamPub != nil {
		defer streamPub.Close()
		log.Print("stream: Redis Pub/Sub enabled for SSE")
	}
	if streamSub, _ = stream.NewSubscriber(cfg.Redis); streamSub != nil {
		defer streamSub.Close()
	}

	repl, _ := replicate.New(cfg.ReplicateToken)
	if repl == nil {
		log.Print("replicate client not configured (set REPLICATE_API_TOKEN)")
	}

	s3Store, err := storage.NewS3(ctx, storage.S3Config{
		Endpoint:      cfg.S3Endpoint,
		Region:        cfg.S3Region,
		Bucket:        cfg.S3Bucket,
		Key:           cfg.S3AccessKey,
		Secret:        cfg.S3SecretKey,
		UseSSL:        cfg.S3UseSSL,
		PublicBaseURL: cfg.S3PublicURL,
	})
	if err != nil {
		log.Printf("s3/r2 storage: %v", err)
	} else if s3Store != nil {
		log.Print("s3/r2 storage configured (R2/S3)")
	}

	qHandlers := &queue.Handlers{DB: db, Cfg: cfg, Repl: repl, Store: s3Store, Asynq: asynqClient, Stream: streamPub}
	mux := asynq.NewServeMux()
	qHandlers.Register(mux)
	concurrency := cfg.AsynqConcurrency
	if concurrency < 1 {
		concurrency = 4
	}
	asynqSrv := asynq.NewServer(redisOpt, asynq.Config{Concurrency: concurrency})
	log.Printf("asynq worker: concurrency=%d", concurrency)
	go func() {
		if err := asynqSrv.Run(mux); err != nil {
			log.Printf("asynq: %v", err)
		}
	}()
	defer asynqSrv.Shutdown()

	var jwks *keyfunc.JWKS
	if cfg.SupabaseURL != "" {
		jwksURL := cfg.SupabaseURL + "/auth/v1/.well-known/jwks.json"
		var errJWKS error
		jwks, errJWKS = keyfunc.Get(jwksURL, keyfunc.Options{})
		if errJWKS != nil {
			log.Printf("supabase JWKS: %v (auth will use legacy secret if set)", errJWKS)
			jwks = nil
		}
	}
	srv := api.NewServer(db, asynqClient, s3Store, streamSub, cfg.Redis, cfg.SupabaseJWTSecret, jwks, cfg.SupabaseURL, cfg.SupabaseServiceRole)
	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: false,
	}).Handler(srv.Routes())

	httpSrv := &http.Server{Addr: ":" + cfg.Port, Handler: handler}
	go func() {
		log.Printf("api listening on :%s", cfg.Port)
		if err := httpSrv.ListenAndServe(); err != http.ErrServerClosed {
			log.Printf("http: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	_ = httpSrv.Shutdown(ctx)
}
