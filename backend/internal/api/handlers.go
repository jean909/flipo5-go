package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	repgo "github.com/replicate/replicate-go"
	"flipo5/backend/internal/cache"
	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/storage"
	"flipo5/backend/internal/store"
	"flipo5/backend/internal/stream"
)

type Server struct {
	DB                   *store.DB
	Asynq                *asynq.Client
	Store                *storage.Store
	Stream               *stream.Subscriber
	Cache                *cache.Redis
	Repl                 *replicate.Client
	ModelRemoveBg        string
	redisURL             string
	supabaseJWTSecret    string
	jwks                 *keyfunc.JWKS
	supabaseURL          string
	supabaseServiceRole  string
}

// NewServer builds the API server.
func NewServer(db *store.DB, asynq *asynq.Client, store *storage.Store, streamSub *stream.Subscriber, cache *cache.Redis, repl *replicate.Client, modelRemoveBg string, redisURL, supabaseJWTSecret string, jwks *keyfunc.JWKS, supabaseURL, supabaseServiceRole string) *Server {
	return &Server{
		DB: db, Asynq: asynq, Store: store, Stream: streamSub, Cache: cache,
		Repl: repl, ModelRemoveBg: modelRemoveBg,
		redisURL: redisURL, supabaseJWTSecret: supabaseJWTSecret, jwks: jwks,
		supabaseURL: supabaseURL, supabaseServiceRole: supabaseServiceRole,
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/health", s.health)
	r.Get("/health/ready", s.healthReady)

	// Public, rate-limited by IP (no auth = no UserID)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimitByIP(30))
		r.Get("/api/check-email", s.checkEmail)
	})

	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.SupabaseAuth(s.supabaseJWTSecret, s.jwks, s.DB))
		r.Use(middleware.RateLimit(300)) // SSE + listJobs + N×getJob (2 jobs × polling) — avoid 429
		r.Get("/me", s.me)
		r.Patch("/me", s.patchMe)
		r.Post("/chat", s.createChat)
		r.Post("/image", s.createImage)
		r.Post("/video", s.createVideo)
		r.Post("/upload", s.upload)
		r.Get("/threads", s.listThreads)
		r.Get("/threads/{id}", s.getThread)
		r.Patch("/threads/{id}", s.patchThread)
		r.Get("/jobs", s.listJobs)
		r.Get("/content", s.listContent)
		r.Get("/jobs/{id}", s.getJob)
		r.Patch("/jobs/{id}/feedback", s.setJobFeedback)
		r.Get("/jobs/stream", s.streamAllJobs)
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
			r.Post("/{id}/items", s.addProjectItem)
			r.Patch("/{id}", s.updateProject)
			r.Delete("/{id}", s.deleteProject)
		})
		r.Get("/jobs/{id}/stream", s.jobStreamSSE)
		r.Get("/download", s.downloadMedia)
		r.Get("/media", s.serveMedia)
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

func (s *Server) invalidateThreadCache(ctx context.Context, threadID, userID uuid.UUID) {
	if s.Cache == nil {
		return
	}
	keys := []string{
		"thread:" + userID.String() + ":" + threadID.String(),
		"threads:" + userID.String() + ":archived:false",
		"threads:" + userID.String() + ":archived:true",
	}
	_ = s.Cache.Delete(ctx, keys...)
}

func (s *Server) invalidateContentCache(ctx context.Context, userID uuid.UUID) {
	if s.Cache == nil {
		return
	}
	_ = s.Cache.DeleteByPrefix(ctx, "content:"+userID.String()+":")
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

func (s *Server) healthReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := s.DB.Ping(ctx); err != nil {
		log.Printf("health/ready: db ping: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "database unavailable"})
		return
	}

	if s.redisURL != "" {
		u := s.redisURL
		if !strings.HasPrefix(u, "redis://") && !strings.HasPrefix(u, "rediss://") {
			u = "redis://" + u
		}
		opt, err := redis.ParseURL(u)
		if err != nil {
			log.Printf("health/ready: redis parse: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"error": "redis config invalid"})
			return
		}
		rdb := redis.NewClient(opt)
		defer rdb.Close()
		if err := rdb.Ping(ctx).Err(); err != nil {
			log.Printf("health/ready: redis ping: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"error": "redis unavailable"})
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	user, err := s.DB.UserByID(r.Context(), userID)
	if err != nil || user == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (s *Server) checkEmail(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, `{"error":"email required"}`, http.StatusBadRequest)
		return
	}
	if s.supabaseURL == "" || s.supabaseServiceRole == "" {
		reason := "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend .env"
		if s.supabaseURL == "" {
			reason = "missing SUPABASE_URL in backend .env"
		} else if s.supabaseServiceRole == "" {
			reason = "missing SUPABASE_SERVICE_ROLE_KEY in backend .env (Project Settings → API → service_role)"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "not configured", "reason": reason})
		return
	}
	// Supabase GoTrue: GET /auth/v1/admin/users
	reqURL := s.supabaseURL + "/auth/v1/admin/users?per_page=50&page=1"
	req, err := http.NewRequestWithContext(r.Context(), "GET", reqURL, nil)
	if err != nil {
		http.Error(w, `{"error":"request"}`, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.supabaseServiceRole)
	req.Header.Set("apikey", s.supabaseServiceRole)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, `{"error":"upstream"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	var out struct {
		Users []struct {
			Email string `json:"email"`
		} `json:"users"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		http.Error(w, `{"error":"decode"}`, http.StatusBadGateway)
		return
	}
	emailLower := strings.ToLower(email)
	exists := false
	for _, u := range out.Users {
		if strings.ToLower(u.Email) == emailLower {
			exists = true
			break
		}
	}
	// If we got 50 and didn't find, paginate once to reduce false negatives
	if !exists && len(out.Users) == 50 {
		req2, _ := http.NewRequestWithContext(r.Context(), "GET", s.supabaseURL+"/auth/v1/admin/users?per_page=50&page=2", nil)
		req2.Header.Set("Authorization", "Bearer "+s.supabaseServiceRole)
		req2.Header.Set("apikey", s.supabaseServiceRole)
		if resp2, err := http.DefaultClient.Do(req2); err == nil {
			var out2 struct {
				Users []struct {
					Email string `json:"email"`
				} `json:"users"`
			}
			_ = json.NewDecoder(resp2.Body).Decode(&out2)
			resp2.Body.Close()
			for _, u := range out2.Users {
				if strings.ToLower(u.Email) == emailLower {
					exists = true
					break
				}
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"exists": exists})
}

var validStyles = map[string]bool{"friendly": true, "direct": true, "logical": true, "brief": true, "detailed": true}
var validLangs = map[string]bool{"browser": true, "en": true, "de": true, "ro": true, "fr": true, "es": true, "it": true}

func (s *Server) patchMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var body struct {
		FullName             *string                `json:"full_name"`
		WhereHeard           *string                `json:"where_heard"`
		UseCase              *string                `json:"use_case"`
		Plan                 *string                `json:"plan"`
		DataRetentionAccepted *bool                 `json:"data_retention_accepted"`
		AIConfiguration      map[string]interface{} `json:"ai_configuration"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	var planVal *string
	if body.Plan != nil {
		p := strings.TrimSpace(*body.Plan)
		if p != "" && p != "free" && p != "premium" && p != "creator" {
			http.Error(w, `{"error":"invalid plan"}`, http.StatusBadRequest)
			return
		}
		if p != "" {
			planVal = &p
		}
	}
	if err := s.DB.UpdateUserProfile(r.Context(), userID, body.FullName, body.WhereHeard, body.UseCase, planVal); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	if body.DataRetentionAccepted != nil || body.AIConfiguration != nil {
		var aiConfig map[string]interface{}
		if body.AIConfiguration != nil {
			aiConfig = make(map[string]interface{})
			if u, _ := s.DB.UserByID(r.Context(), userID); u != nil && u.AIConfiguration != nil {
				for k, v := range u.AIConfiguration {
					aiConfig[k] = v
				}
			}
			if s, ok := body.AIConfiguration["style"].(string); ok && validStyles[s] {
				aiConfig["style"] = s
			}
			if l, ok := body.AIConfiguration["primary_language"].(string); ok && validLangs[l] {
				aiConfig["primary_language"] = l
			}
			if _, has := body.AIConfiguration["user_details"]; has {
				d, _ := body.AIConfiguration["user_details"].(string)
				d = strings.TrimSpace(d)
				if len(d) > 80 {
					d = d[:80]
				}
				aiConfig["user_details"] = d
			}
			if len(aiConfig) == 0 {
				aiConfig = nil
			}
		}
		err := s.DB.UpdateUserSettings(r.Context(), userID, body.DataRetentionAccepted, aiConfig)
		if err != nil {
			if err == store.ErrAIConfigCooldown {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{"error": "ai_config_cooldown", "message": "AI configuration can only be changed once per 24 hours"})
				return
			}
			http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
			return
		}
	}
	user, _ := s.DB.UserByID(r.Context(), userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (s *Server) createChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt         string   `json:"prompt"`
		AttachmentURLs []string `json:"attachment_urls,omitempty"`
		ThreadID       string   `json:"thread_id,omitempty"`
		Incognito      bool     `json:"incognito,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
		http.Error(w, `{"error":"prompt required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	var threadID *uuid.UUID
	if !req.Incognito && req.ThreadID != "" {
		if id, err := uuid.Parse(req.ThreadID); err == nil {
			t, _ := s.DB.GetThreadForUser(ctx, id, userID)
			if t != nil {
				threadID = &id
			}
		}
	}
	if !req.Incognito && threadID == nil {
		id, err := s.DB.CreateThread(ctx, userID, false)
		if err != nil {
			log.Printf("create thread failed: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "create thread"})
			return
		}
		threadID = &id
	}
	if req.Incognito && threadID == nil {
		id, err := s.DB.CreateThread(ctx, userID, true)
		if err != nil {
			log.Printf("create ephemeral thread failed: %v", err)
			http.Error(w, `{"error":"create thread"}`, http.StatusInternalServerError)
			return
		}
		threadID = &id
	}
	input := map[string]interface{}{"prompt": req.Prompt}
	if len(req.AttachmentURLs) > 0 {
		input["attachment_urls"] = req.AttachmentURLs
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "chat", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	task, _ := queue.NewChatTask(jobID, req.Prompt)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	if threadID != nil {
		s.invalidateThreadCache(ctx, *threadID, userID)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	out := map[string]string{"job_id": jobID.String()}
	if threadID != nil {
		out["thread_id"] = threadID.String()
	}
	json.NewEncoder(w).Encode(out)
}

func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		http.Error(w, `{"error":"upload not configured"}`, http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	const maxSize = 50 << 20 // 50 MB per file (video up to 8.7s)
	if err := r.ParseMultipartForm(maxSize * 5); err != nil {
		http.Error(w, `{"error":"multipart too large"}`, http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		http.Error(w, `{"error":"no files"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	var urls []string
	for _, fh := range files {
		if fh.Size > maxSize {
			log.Printf("upload skip %s: size %d > max %d", fh.Filename, fh.Size, maxSize)
			continue
		}
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if ext == "" {
			ext = ".bin"
		}
		key := fmt.Sprintf("uploads/%s/%s%s", userID.String(), uuid.New().String(), ext)
		file, err := fh.Open()
		if err != nil {
			log.Printf("upload open %s: %v", fh.Filename, err)
			continue
		}
		contentType := fh.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		_, err = s.Store.Put(ctx, key, file, contentType)
		file.Close()
		if err != nil {
			log.Printf("upload store %s: %v", fh.Filename, err)
			continue
		}
		urls = append(urls, s.Store.URL(key))
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"urls": urls})
}

// ensureThread returns threadID for job. If threadID param is valid, uses it; otherwise creates new (normal or ephemeral).
func (s *Server) ensureThread(ctx context.Context, w http.ResponseWriter, userID uuid.UUID, threadIDParam string, incognito bool) *uuid.UUID {
	if threadIDParam != "" {
		if id, err := uuid.Parse(threadIDParam); err == nil {
			if t, _ := s.DB.GetThreadForUser(ctx, id, userID); t != nil {
				return &id
			}
		}
	}
	ephemeral := incognito
	id, err := s.DB.CreateThread(ctx, userID, ephemeral)
	if err != nil {
		log.Printf("create thread failed: %v", err)
		http.Error(w, `{"error":"create thread"}`, http.StatusInternalServerError)
		return nil
	}
	return &id
}

func (s *Server) createImage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt         string   `json:"prompt"`
		ThreadID       string   `json:"thread_id,omitempty"`
		Incognito      bool     `json:"incognito,omitempty"`
		Size           string   `json:"size,omitempty"`
		AspectRatio    string   `json:"aspect_ratio,omitempty"`
		ImageInput     []string `json:"image_input,omitempty"`
		MaxImages      int      `json:"max_images,omitempty"`
		SequentialMode string   `json:"sequential_image_generation,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
		http.Error(w, `{"error":"prompt required"}`, http.StatusBadRequest)
		return
	}
	if req.Size != "2K" && req.Size != "4K" && req.Size != "HD" {
		req.Size = "2K"
	}
	if req.AspectRatio == "" {
		req.AspectRatio = "match_input_image"
	}
	if req.MaxImages < 1 || req.MaxImages > 15 {
		req.MaxImages = 4
	}
	if req.SequentialMode == "" {
		req.SequentialMode = "auto"
	}
	if len(req.ImageInput) > 14 {
		req.ImageInput = req.ImageInput[:14]
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	threadID := s.ensureThread(ctx, w, userID, req.ThreadID, req.Incognito)
	if threadID == nil {
		return
	}
	input := map[string]interface{}{
		"prompt":                      req.Prompt,
		"size":                        req.Size,
		"aspect_ratio":                req.AspectRatio,
		"max_images":                  req.MaxImages,
		"sequential_image_generation": req.SequentialMode,
	}
	if len(req.ImageInput) > 0 {
		input["image_input"] = req.ImageInput
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "image", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	task, _ := queue.NewImageTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateThreadCache(ctx, *threadID, userID)
	s.invalidateContentCache(ctx, userID)
	out := map[string]string{"job_id": jobID.String()}
	if threadID != nil {
		out["thread_id"] = threadID.String()
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(out)
}

func (s *Server) createVideo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt      string   `json:"prompt"`
		ThreadID    string   `json:"thread_id,omitempty"`
		Incognito   bool     `json:"incognito,omitempty"`
		Image       string   `json:"image,omitempty"`
		Video       string   `json:"video,omitempty"`
		Duration    int      `json:"duration,omitempty"`
		AspectRatio string   `json:"aspect_ratio,omitempty"`
		Resolution  string   `json:"resolution,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
		http.Error(w, `{"error":"prompt required"}`, http.StatusBadRequest)
		return
	}
	if req.Duration < 1 || req.Duration > 15 {
		req.Duration = 5
	}
	if req.Resolution != "720p" && req.Resolution != "480p" {
		req.Resolution = "720p"
	}
	if req.AspectRatio == "" {
		req.AspectRatio = "16:9"
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	threadID := s.ensureThread(ctx, w, userID, req.ThreadID, req.Incognito)
	if threadID == nil {
		return
	}
	input := map[string]interface{}{
		"prompt":       req.Prompt,
		"duration":     req.Duration,
		"aspect_ratio": req.AspectRatio,
		"resolution":   req.Resolution,
	}
	if req.Image != "" {
		input["image"] = req.Image
	}
	if req.Video != "" {
		input["video"] = req.Video
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "video", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	task, _ := queue.NewVideoTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateThreadCache(ctx, *threadID, userID)
	s.invalidateContentCache(ctx, userID)
	out := map[string]string{"job_id": jobID.String()}
	if threadID != nil {
		out["thread_id"] = threadID.String()
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(out)
}

func (s *Server) listThreads(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	archived := r.URL.Query().Get("archived") == "true"
	ctx := r.Context()
	cacheKey := "threads:" + userID.String() + ":archived:" + strconv.FormatBool(archived)
	if s.Cache != nil {
		if b, _ := s.Cache.Get(ctx, cacheKey); len(b) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
	}
	threads, err := s.DB.ListThreads(ctx, userID, 50, archived)
	if err != nil {
		http.Error(w, `{"error":"list threads"}`, http.StatusInternalServerError)
		return
	}
	out := map[string]interface{}{"threads": threads}
	if s.Cache != nil {
		if b, err := json.Marshal(out); err == nil {
			_ = s.Cache.Set(ctx, cacheKey, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) patchThread(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	var body struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	thread, _ := s.DB.GetThreadForUser(r.Context(), id, userID)
	if thread == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	switch body.Action {
	case "archive":
		active, _ := s.DB.ThreadHasActiveJobs(r.Context(), id)
		if active {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "has_active_jobs", "message": "Cannot archive while content is being generated."})
			return
		}
		if err := s.DB.ArchiveThread(r.Context(), id, userID); err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"archive failed"}`, http.StatusInternalServerError)
			return
		}
		s.invalidateThreadCache(r.Context(), id, userID)
	case "unarchive":
		if err := s.DB.UnarchiveThread(r.Context(), id, userID); err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"unarchive failed"}`, http.StatusInternalServerError)
			return
		}
	case "delete":
		active, _ := s.DB.ThreadHasActiveJobs(r.Context(), id)
		if active {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "has_active_jobs", "message": "Cannot delete while content is being generated."})
			return
		}
		if err := s.DB.DeleteThread(r.Context(), id, userID); err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
			return
		}
		s.invalidateThreadCache(r.Context(), id, userID)
	default:
		http.Error(w, `{"error":"invalid action"}`, http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) getThread(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	cacheKey := "thread:" + userID.String() + ":" + id.String()
	if s.Cache != nil {
		if b, _ := s.Cache.Get(ctx, cacheKey); len(b) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
	}
	thread, err := s.DB.GetThreadForUser(ctx, id, userID)
	if err != nil || thread == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	jobs, err := s.DB.ListJobsByThread(ctx, id, userID)
	if err != nil {
		http.Error(w, `{"error":"list jobs"}`, http.StatusInternalServerError)
		return
	}
	out := map[string]interface{}{"thread": thread, "jobs": jobs}
	if s.Cache != nil {
		if b, err := json.Marshal(out); err == nil {
			_ = s.Cache.Set(ctx, cacheKey, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) listJobs(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	jobs, err := s.DB.ListJobs(r.Context(), userID, 50)
	if err != nil {
		http.Error(w, `{"error":"list jobs"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"jobs": jobs})
}

func (s *Server) listContent(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 50 {
			limit = v
		}
	}
	typeFilter := strings.TrimSpace(r.URL.Query().Get("type"))
	if typeFilter != "" && typeFilter != "image" && typeFilter != "video" {
		typeFilter = ""
	}
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	offset := (page - 1) * limit
	ctx := r.Context()
	cacheKey := "content:" + userID.String() + ":" + strconv.Itoa(offset) + ":" + strconv.Itoa(limit) + ":" + typeFilter + ":" + search
	if s.Cache != nil {
		if b, _ := s.Cache.Get(ctx, cacheKey); len(b) > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
	}
	jobs, total, err := s.DB.ListContentJobs(ctx, userID, offset, limit, typeFilter, search)
	if err != nil {
		http.Error(w, `{"error":"list content"}`, http.StatusInternalServerError)
		return
	}
	out := map[string]interface{}{"jobs": jobs, "total": total, "page": page, "limit": limit}
	if s.Cache != nil {
		if b, err := json.Marshal(out); err == nil {
			_ = s.Cache.Set(ctx, cacheKey, b)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) getJob(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	job, err := s.DB.GetJobForUser(r.Context(), id, userID)
	if err != nil || job == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func (s *Server) setJobFeedback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		Rating *string `json:"rating"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	rating := ""
	if body.Rating != nil && (*body.Rating == "like" || *body.Rating == "dislike") {
		rating = *body.Rating
	}
	if err := s.DB.UpdateJobRating(r.Context(), id, userID, rating); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.DB.GetAdminStats(r.Context())
	if err != nil {
		http.Error(w, `{"error":"stats failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *Server) adminListUsers(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	list, total, err := s.DB.ListUsers(r.Context(), limit, offset, search)
	if err != nil {
		http.Error(w, `{"error":"list users failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"users": list, "total": total})
}

func (s *Server) adminGetUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	u, err := s.DB.UserByID(r.Context(), id)
	if err != nil || u == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	// Job and thread counts for this user
	var jobCount, threadCount int
	_ = s.DB.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM jobs WHERE user_id = $1`, id).Scan(&jobCount)
	_ = s.DB.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM threads WHERE user_id = $1`, id).Scan(&threadCount)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user":        u,
		"job_count":   jobCount,
		"thread_count": threadCount,
	})
}

func (s *Server) adminListJobs(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	jobType := strings.TrimSpace(r.URL.Query().Get("type"))
	userIDStr := strings.TrimSpace(r.URL.Query().Get("user_id"))
	var userID *uuid.UUID
	if userIDStr != "" {
		if id, err := uuid.Parse(userIDStr); err == nil {
			userID = &id
		}
	}
	list, total, err := s.DB.ListJobsAdmin(r.Context(), limit, offset, userID, status, jobType)
	if err != nil {
		http.Error(w, `{"error":"list jobs failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"jobs": list, "total": total})
}

func (s *Server) downloadMedia(w http.ResponseWriter, r *http.Request) {
	urlStr := strings.TrimSpace(r.URL.Query().Get("url"))
	if urlStr == "" {
		http.Error(w, `{"error":"url required"}`, http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(urlStr, "https://") {
		http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
		return
	}
	// Allow only known CDN domains (Replicate, Cloudflare R2, custom storage)
	if !strings.Contains(urlStr, "replicate.delivery") &&
		!strings.Contains(urlStr, "r2.dev") &&
		!strings.Contains(urlStr, "r2.cloudflarestorage.com") &&
		!strings.Contains(urlStr, "storage.flipo5.com") &&
		!strings.Contains(urlStr, "flipo5.com") {
		http.Error(w, `{"error":"url not allowed"}`, http.StatusBadRequest)
		return
	}
	resp, err := http.Get(urlStr)
	if err != nil {
		http.Error(w, `{"error":"fetch failed"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Error(w, `{"error":"fetch failed"}`, http.StatusBadGateway)
		return
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "image/jpeg"
	}
	ext := ".jpg"
	if strings.Contains(ct, "png") {
		ext = ".png"
	} else if strings.Contains(ct, "webp") {
		ext = ".webp"
	} else if strings.Contains(ct, "gif") {
		ext = ".gif"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", "attachment; filename=\"flipo5-"+fmt.Sprint(time.Now().Unix())+ext+"\"")
	io.Copy(w, resp.Body)
}

// serveMedia streams a file from storage by key. Used when public URL is not available (e.g. relative key).
func (s *Server) serveMedia(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if s.Store == nil {
		http.Error(w, `{"error":"storage not configured"}`, http.StatusServiceUnavailable)
		return
	}
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key == "" || !strings.HasPrefix(key, "uploads/") {
		http.Error(w, `{"error":"invalid key"}`, http.StatusBadRequest)
		return
	}
	// Ensure key is under user's uploads
	if !strings.HasPrefix(key, "uploads/"+userID.String()+"/") {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	body, contentType, err := s.Store.Get(r.Context(), key)
	if err != nil {
		log.Printf("serveMedia Get %s: %v", key, err)
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	defer body.Close()
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.Copy(w, body)
}

func (s *Server) streamAllJobs(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if s.Stream == nil {
		http.Error(w, `{"error":"streaming not configured"}`, http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	ctx := r.Context()
	flusher := w.(http.Flusher)
	
	log.Printf("[streamAllJobs] User %s connected to job stream", userID)
	fmt.Fprintf(w, "data: {\"type\":\"connected\",\"user\":\"%s\"}\n\n", userID)
	flusher.Flush()
	
	// Subscribe to user-specific job updates channel
	userJobsChannel := fmt.Sprintf("user:%s:jobs", userID.String())
	pubsub := s.Stream.SubscribeRaw(ctx, userJobsChannel)
	if pubsub == nil {
		http.Error(w, `{"error":"subscription failed"}`, http.StatusInternalServerError)
		return
	}
	defer pubsub.Close()
	
	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			// Forward job update to client
			fmt.Fprintf(w, "data: %s\n\n", msg.Payload)
			flusher.Flush()
		}
	}
}

func (s *Server) jobStreamSSE(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	jobID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	job, err := s.DB.GetJobForUser(r.Context(), jobID, userID)
	if err != nil || job == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	sendSSE := func(output string, status string) {
		payload := map[string]string{"output": output, "status": status}
		b, _ := json.Marshal(payload)
		w.Write([]byte("data: " + string(b) + "\n\n"))
		flusher.Flush()
	}
	outputText := func(j *store.Job) string {
		if len(j.Output) == 0 {
			return ""
		}
		var m map[string]interface{}
		if json.Unmarshal(j.Output, &m) != nil {
			return ""
		}
		if o, _ := m["output"].(string); o != "" {
			return o
		}
		return ""
	}
	sendSSE(outputText(job), job.Status)
	if job.Status == "completed" || job.Status == "failed" {
		return
	}
	ctx := r.Context()
	// Redis Pub/Sub: real-time stream when available
	if s.Stream != nil {
		type streamMsg struct {
			output string
			done   bool
		}
		ch := make(chan streamMsg, 64)
		go func() {
			_ = s.Stream.Subscribe(ctx, jobID, func(output string, done bool) {
				select {
				case ch <- streamMsg{output, done}:
				default:
				}
			})
			close(ch)
		}()
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					job, _ = s.DB.GetJobForUser(r.Context(), jobID, userID)
					if job != nil {
						sendSSE(outputText(job), job.Status)
					}
					return
				}
				status := "running"
				if msg.done {
					status = "completed"
				}
				sendSSE(msg.output, status)
				if msg.done {
					return
				}
			case <-ticker.C:
				next, err := s.DB.GetJobForUser(r.Context(), jobID, userID)
				if err != nil || next == nil {
					return
				}
				sendSSE(outputText(next), next.Status)
				if next.Status == "completed" || next.Status == "failed" {
					return
				}
			}
		}
	}
	// Fallback: poll DB only
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			next, err := s.DB.GetJobForUser(r.Context(), jobID, userID)
			if err != nil || next == nil {
				return
			}
			sendSSE(outputText(next), next.Status)
			if next.Status == "completed" || next.Status == "failed" {
				return
			}
		}
	}
}

// --- Edit Studio (projects) ---

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	list, err := s.DB.ListProjects(r.Context(), userID, limit)
	if err != nil {
		http.Error(w, `{"error":"list projects"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": list})
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		body.Name = "Untitled"
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Untitled"
	}
	id, err := s.DB.CreateProject(r.Context(), userID, name)
	if err != nil {
		log.Printf("[createProject] user=%s name=%q err=%v", userID, name, err)
		if errors.Is(err, store.ErrProjectNameExists) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "name exists"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	log.Printf("[createProject] ok id=%s user=%s", id, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id.String(), "name": name})
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	p, err := s.DB.GetProject(r.Context(), projectID, userID)
	if err != nil || p == nil {
		if owner, ok := s.DB.GetProjectOwner(r.Context(), projectID); ok {
			log.Printf("[getProject] notFound project=%s requestUser=%s projectOwner=%s (user_id mismatch)", projectID, userID, owner)
		} else {
			log.Printf("[getProject] notFound project=%s user=%s err=%v", projectID, userID, err)
		}
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	items, errItems := s.DB.ListProjectItems(r.Context(), projectID, userID)
	if errItems != nil {
		log.Printf("[getProject] ListProjectItems failed project=%s err=%v", projectID, errItems)
		items = nil
	} else {
		log.Printf("[getProject] ok project=%s items=%d", projectID, len(items))
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]interface{}{"project": p, "items": items})
}

func (s *Server) updateProject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.UpdateProject(r.Context(), projectID, userID, strings.TrimSpace(body.Name)); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrProjectNameExists) {
			http.Error(w, `{"error":"name exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := s.DB.DeleteProject(r.Context(), projectID, userID); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) addProjectItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		Type      string    `json:"type"` // image, video
		SourceURL string    `json:"source_url"`
		JobID     *uuid.UUID `json:"job_id,omitempty"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if body.Type != "image" && body.Type != "video" {
		body.Type = "image"
	}
	// Allow full URLs (http/https) or relative storage keys (e.g. uploads/user-id/uuid.jpg from My Content)
	sourceURL := strings.TrimSpace(body.SourceURL)
	if sourceURL == "" || strings.Contains(sourceURL, "..") || strings.ContainsAny(sourceURL, "\n\r") {
		http.Error(w, `{"error":"invalid source_url"}`, http.StatusBadRequest)
		return
	}
	itemID, err := s.DB.AddProjectItem(r.Context(), projectID, userID, body.Type, sourceURL, body.JobID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add item failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": itemID.String()})
}

func (s *Server) uploadProjectItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	log.Printf("[studio upload] request project=%s", idStr)
	projectID, err := uuid.Parse(idStr)
	if err != nil {
		log.Printf("[studio upload] invalid project id: %v", err)
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		log.Printf("[studio upload] unauthorized")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if s.Store == nil {
		log.Printf("[studio upload] store not configured")
		http.Error(w, `{"error":"upload not configured"}`, http.StatusServiceUnavailable)
		return
	}
	const maxSize = 50 << 20 // 50 MB
	if err := r.ParseMultipartForm(maxSize * 2); err != nil {
		log.Printf("[studio upload] parse multipart: %v", err)
		http.Error(w, `{"error":"multipart too large"}`, http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		files = r.MultipartForm.File["files"]
	}
	if len(files) == 0 {
		log.Printf("[studio upload] no file in form")
		http.Error(w, `{"error":"no file"}`, http.StatusBadRequest)
		return
	}
	log.Printf("[studio upload] files=%d project=%s user=%s", len(files), projectID, userID)
	ctx := r.Context()
	var itemType string
	var itemID uuid.UUID
	for _, fh := range files {
		if fh.Size > maxSize {
			log.Printf("[studio upload] skip %s: size %d > max %d", fh.Filename, fh.Size, maxSize)
			continue
		}
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if ext == "" {
			ext = ".bin"
		}
		contentType := fh.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "video/") {
			itemType = "video"
		} else {
			itemType = "image"
		}
		key := fmt.Sprintf("uploads/%s/%s%s", userID.String(), uuid.New().String(), ext)
		log.Printf("[studio upload] processing %s type=%s key=%s size=%d", fh.Filename, itemType, key, fh.Size)
		file, err := fh.Open()
		if err != nil {
			log.Printf("[studio upload] open file %s: %v", fh.Filename, err)
			continue
		}
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		_, err = s.Store.Put(ctx, key, file, contentType)
		file.Close()
		if err != nil {
			log.Printf("[studio upload] Store.Put %s: %v", fh.Filename, err)
			continue
		}
		url := s.Store.URL(key)
		log.Printf("[studio upload] Put ok url=%s", url)
		itemID, err = s.DB.AddProjectItem(ctx, projectID, userID, itemType, url, nil)
		if err != nil {
			log.Printf("[studio upload] AddProjectItem: %v", err)
			http.Error(w, `{"error":"add item failed"}`, http.StatusInternalServerError)
			return
		}
		log.Printf("[studio upload] success item=%s url=%s", itemID, url)
		// Return full item for optimistic UI (avoids getProject cache/race issues)
		item := map[string]interface{}{
			"id":          itemID.String(),
			"project_id":  projectID.String(),
			"type":        itemType,
			"source_url":  url,
			"latest_url":  url,
			"sort_order":  0,
			"created_at":  time.Now().Format(time.RFC3339),
			"version_num": 0,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"id": itemID.String(), "item": item})
		return
	}
	if itemID == uuid.Nil {
		log.Printf("[studio upload] no item created (all files skipped or failed)")
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": itemID.String()})
}

func (s *Server) removeProjectItem(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := s.DB.RemoveProjectItem(r.Context(), itemID, userID); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"remove failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) listProjectVersions(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	list, err := s.DB.ListProjectVersions(r.Context(), itemID, userID)
	if err != nil {
		http.Error(w, `{"error":"list versions"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"versions": list})
}

func (s *Server) removeProjectVersion(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	versionNumStr := chi.URLParam(r, "versionNum")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid item id", http.StatusBadRequest)
		return
	}
	versionNum, err := strconv.Atoi(versionNumStr)
	if err != nil || versionNum < 1 {
		http.Error(w, "invalid version number", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	err = s.DB.RemoveProjectVersion(r.Context(), itemID, versionNum, userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"version not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"failed to remove version"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) addProjectVersion(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var body struct {
		URL      string          `json:"url"`
		Metadata json.RawMessage `json:"metadata,omitempty"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(body.URL, "https://") {
		http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.AddProjectVersion(r.Context(), itemID, userID, body.URL, body.Metadata); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add version failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

func (s *Server) uploadProjectVersion(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if s.Store == nil {
		http.Error(w, `{"error":"upload not configured"}`, http.StatusServiceUnavailable)
		return
	}
	const maxSize = 50 << 20
	if err := r.ParseMultipartForm(maxSize * 2); err != nil {
		http.Error(w, `{"error":"multipart too large"}`, http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		files = r.MultipartForm.File["files"]
	}
	if len(files) == 0 {
		http.Error(w, `{"error":"no file"}`, http.StatusBadRequest)
		return
	}
	fh := files[0]
	if fh.Size > maxSize {
		http.Error(w, `{"error":"file too large"}`, http.StatusBadRequest)
		return
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if ext == "" {
		ext = ".bin"
	}
	key := fmt.Sprintf("uploads/%s/%s%s", userID.String(), uuid.New().String(), ext)
	file, err := fh.Open()
	if err != nil {
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	contentType := fh.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err = s.Store.Put(r.Context(), key, file, contentType)
	file.Close()
	if err != nil {
		log.Printf("upload project version %s: %v", fh.Filename, err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	url := s.Store.URL(key)
	if err := s.DB.AddProjectVersion(r.Context(), itemID, userID, url, nil); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add version failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
}

// removeProjectItemBackground runs bria/remove-background on the item image, uploads result to R2, adds a new version.
func (s *Server) removeProjectItemBackground(w http.ResponseWriter, r *http.Request) {
	projectIDStr := chi.URLParam(r, "id")
	itemIDStr := chi.URLParam(r, "itemId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid project id"}`, http.StatusBadRequest)
		return
	}
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid item id"}`, http.StatusBadRequest)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	p, err := s.DB.GetProject(r.Context(), projectID, userID)
	if err != nil || p == nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}
	items, err := s.DB.ListProjectItems(r.Context(), projectID, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to load items"}`, http.StatusInternalServerError)
		return
	}
	var item *store.ProjectItem
	for i := range items {
		if items[i].ID == itemID {
			item = &items[i]
			break
		}
	}
	if item == nil {
		http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
		return
	}
	if item.Type != "image" {
		http.Error(w, `{"error":"only images supported for remove background"}`, http.StatusBadRequest)
		return
	}
	imageURL := item.LatestURL
	if imageURL == "" {
		imageURL = item.SourceURL
	}
	if imageURL == "" {
		http.Error(w, `{"error":"item has no image url"}`, http.StatusBadRequest)
		return
	}
	if s.Repl == nil || s.ModelRemoveBg == "" {
		http.Error(w, `{"error":"remove background not configured"}`, http.StatusServiceUnavailable)
		return
	}
	// Use background context so Replicate + download + save complete even if client disconnects (avoids "context canceled").
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	input := repgo.PredictionInput{
		"image_url":      imageURL,
		"preserve_alpha": true,
	}
	out, err := s.Repl.Run(ctx, s.ModelRemoveBg, input)
	if err != nil {
		log.Printf("[remove-bg] replicate run failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": "background removal failed: " + err.Error()})
		return
	}
	var resultURL string
	switch v := out.(type) {
	case string:
		resultURL = v
	case map[string]interface{}:
		if u, _ := v["output"].(string); u != "" {
			resultURL = u
		} else if u, _ := v["url"].(string); u != "" {
			resultURL = u
		}
	}
	if resultURL == "" {
		log.Printf("[remove-bg] unexpected replicate output type: %T", out)
		http.Error(w, `{"error":"invalid model output"}`, http.StatusInternalServerError)
		return
	}
	// Download result and upload to our R2
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resultURL, nil)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch result"}`, http.StatusInternalServerError)
		return
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"failed to download result"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Error(w, `{"error":"failed to download result"}`, http.StatusBadGateway)
		return
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read result"}`, http.StatusInternalServerError)
		return
	}
	if s.Store == nil {
		http.Error(w, `{"error":"storage not configured"}`, http.StatusServiceUnavailable)
		return
	}
	key := fmt.Sprintf("uploads/%s/%s.png", userID.String(), uuid.New().String())
	_, err = s.Store.Put(ctx, key, bytes.NewReader(body), "image/png")
	if err != nil {
		log.Printf("[remove-bg] store put: %v", err)
		http.Error(w, `{"error":"failed to save result"}`, http.StatusInternalServerError)
		return
	}
	url := s.Store.URL(key)
	meta := json.RawMessage(`{"action":"remove_bg"}`)
	if err := s.DB.AddProjectVersion(ctx, itemID, userID, url, meta); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"failed to add version"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"url": url, "ok": true})
}
