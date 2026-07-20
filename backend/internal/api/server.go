package api

import (
	"context"
	"net/http"

	"flipo5/backend/internal/cache"
	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/storage"
	"flipo5/backend/internal/store"
	"flipo5/backend/internal/stream"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

type Server struct {
	DB                  *store.DB
	Asynq               *asynq.Client
	Store               *storage.Store
	Stream              *stream.Subscriber
	Cache               *cache.Redis
	Repl                *replicate.Client
	ModelRemoveBg       string
	ModelText           string
	redisURL            string
	supabaseJWTSecret   string
	jwks                *keyfunc.JWKS
	supabaseURL         string
	supabaseServiceRole string
}

// NewServer builds the API server.
func NewServer(db *store.DB, asynq *asynq.Client, store *storage.Store, streamSub *stream.Subscriber, cache *cache.Redis, repl *replicate.Client, modelRemoveBg, modelText string, redisURL, supabaseJWTSecret string, jwks *keyfunc.JWKS, supabaseURL, supabaseServiceRole string) *Server {
	return &Server{
		DB: db, Asynq: asynq, Store: store, Stream: streamSub, Cache: cache,
		Repl: repl, ModelRemoveBg: modelRemoveBg, ModelText: modelText,
		redisURL: redisURL, supabaseJWTSecret: supabaseJWTSecret, jwks: jwks,
		supabaseURL: supabaseURL, supabaseServiceRole: supabaseServiceRole,
	}
}

// recordUserProfile updates the user learning profile in the background (job type counts, last used, languages/categories).
func (s *Server) recordUserProfile(userID uuid.UUID, jobType string, extra map[string]interface{}) {
	go func() {
		_ = s.DB.UpsertUserProfileStats(context.Background(), userID, jobType, extra)
	}()
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.Compress(5)) // gzip JSON/text responses for speed
	r.Get("/health", s.health)
	r.Get("/health/ready", s.healthReady)

	// Public, rate-limited by IP (no auth = no UserID)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimitByIP(120)) // Permissive for launch; lower later (e.g. 30)
		r.Get("/api/check-email", s.checkEmail)
	})
	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.SupabaseAuth(s.supabaseJWTSecret, s.jwks, s.DB))
		r.Use(middleware.RateLimit(2000))                                         // Permissive for launch; lower later (e.g. 300)
		r.Use(middleware.RateLimitJobCreation(120, "/api/seo", "/api/translate")) // Permissive for launch; lower later (e.g. 20)
		r.Get("/me", s.me)
		r.Patch("/me", s.patchMe)
		r.Post("/chat", s.createChat)
		r.Post("/image", s.createImage)
		r.Post("/image-inpaint", s.createImageInpaint)
		r.Post("/video", s.createVideo)
		r.Post("/upscale", s.createUpscale)
		r.Post("/prompt-variants", s.generatePromptVariants)
		r.Post("/upload", s.upload)
		r.Get("/threads", s.listThreads)
		r.Get("/threads/{id}", s.getThread)
		r.Patch("/threads/{id}", s.patchThread)
		r.Get("/jobs", s.listJobs)
		r.Get("/prompts/recent", s.listRecentPrompts)
		r.Get("/content", s.listContent)
		r.Post("/content/from-url", s.addContentFromURL)
		r.Get("/jobs/{id}", s.getJob)
		r.Patch("/jobs/{id}/feedback", s.setJobFeedback)
		r.Post("/jobs/{id}/cancel", s.cancelJob)
		r.Post("/jobs/{id}/retry", s.retryJob)
		r.Post("/jobs/{id}/edit", s.editResubmit)
		r.Get("/jobs/stream", s.streamAllJobs)
		r.Post("/seo", s.createSEO)
		r.Post("/outline", s.createOutline)
		r.Post("/translate", s.createTranslate)
		r.Post("/logo", s.createLogo)
		r.Post("/audio", s.createAudio)
		r.Route("/products", func(r chi.Router) {
			r.Get("/", s.listProducts)
			r.Post("/", s.createProduct)
			r.Patch("/{id}", s.updateProduct)
			r.Post("/improve-description", s.createProductDescriptionImprove)
			r.Post("/improve-scene", s.createProductSceneImprove)
			r.Get("/{id}", s.getProduct)
			r.Post("/{id}/photos", s.addProductPhotos)
			r.Post("/{id}/score", s.createProductScore)
			r.Delete("/{id}/photos/{photoId}", s.deleteProductPhoto)
			r.Delete("/{id}", s.deleteProduct)
		})
		r.Route("/translation-projects", func(r chi.Router) {
			r.Get("/", s.listTranslationProjects)
			r.Post("/", s.createTranslationProject)
			r.Get("/{id}", s.getTranslationProject)
			r.Post("/{id}/items", s.addTranslationItem)
			r.Delete("/items/{itemId}", s.deleteTranslationItem)
		})
		r.Get("/files", s.listFiles)
		r.Get("/files/{id}", s.getFile)
		r.Patch("/files/{id}", s.renameFile)
		r.Delete("/files/{id}", s.deleteFile)
		r.Route("/projects", func(r chi.Router) {
			r.Get("/", s.listProjects)
			r.Post("/", s.createProject)
			// More specific routes before /{id} so GET /projects/items/... is not matched as id="items"
			r.Delete("/items/{itemId}", s.removeProjectItem)
			r.Get("/items/{itemId}/versions", s.listProjectVersions)
			r.Delete("/items/{itemId}/versions/{versionNum}", s.removeProjectVersion)
			r.Post("/items/{itemId}/versions", s.addProjectVersion)
			r.Post("/items/{itemId}/versions/upload", s.uploadProjectVersion)
			r.Get("/{id}", s.getProject)
			r.Post("/{id}/items/upload", s.uploadProjectItem)
			r.Post("/{id}/items/{itemId}/remove-bg", s.removeProjectItemBackground)
			r.Post("/{id}/bulk-remove-bg", s.bulkRemoveProjectBackgrounds)
			r.Post("/{id}/items", s.addProjectItem)
			r.Patch("/{id}", s.updateProject)
			r.Delete("/{id}", s.deleteProject)
		})
		r.Route("/chat-projects", func(r chi.Router) {
			r.Get("/", s.listChatProjects)
			r.Post("/", s.createChatProject)
			r.Get("/{id}", s.getChatProject)
			r.Patch("/{id}", s.updateChatProject)
			r.Delete("/{id}", s.deleteChatProject)
			r.Get("/{id}/files", s.listChatProjectFiles)
			r.Post("/{id}/files", s.addChatProjectFile)
			r.Post("/{id}/search", s.searchChatProjectDocs)
			r.Delete("/files/{fileId}", s.deleteChatProjectFile)
		})
		r.Post("/templates/run", s.runTemplate)
		r.Get("/jobs/{id}/stream", s.jobStreamSSE)
		r.Get("/download", s.downloadMedia)
		r.Get("/media", s.serveMedia)
		r.Post("/vectorize", s.vectorizeImage)
		// Admin CRM (requires is_admin = true)
		r.Route("/admin", func(r chi.Router) {
			r.Use(middleware.RequireAdmin(s.DB))
			r.Get("/stats", s.adminStats)
			r.Get("/users", s.adminListUsers)
			r.Get("/users/{id}", s.adminGetUser)
			r.Get("/jobs", s.adminListJobs)
		})
	})
	return r
}
