package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	list, err := s.DB.ListProducts(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []store.Product{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"products": list})
}

func (s *Server) createProduct(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Category    string `json:"category"`
		Description string `json:"description"`
		Brand       string `json:"brand"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	id, err := s.DB.CreateProduct(r.Context(), userID, name, strings.TrimSpace(req.Category), strings.TrimSpace(req.Description), strings.TrimSpace(req.Brand))
	if err != nil {
		log.Printf("[createProduct] CreateProduct failed: %v", err)
		msg := "create failed"
		if strings.Contains(err.Error(), "does not exist") || strings.Contains(err.Error(), "column") {
			msg = "create failed: database schema outdated (run migrations)"
		}
		http.Error(w, fmt.Sprintf(`{"error":%q}`, msg), http.StatusInternalServerError)
		return
	}
	cat := strings.TrimSpace(req.Category)
	if cat != "" {
		s.recordUserProfile(userID, "product", map[string]interface{}{"category": cat})
	} else {
		s.recordUserProfile(userID, "product", nil)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id.String()})
}

func (s *Server) updateProduct(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	productID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Name        string `json:"name"`
		Category    string `json:"category"`
		Description string `json:"description"`
		Brand       string `json:"brand"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if err := s.DB.UpdateProduct(
		r.Context(),
		productID,
		userID,
		name,
		strings.TrimSpace(req.Category),
		strings.TrimSpace(req.Description),
		strings.TrimSpace(req.Brand),
	); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createProductDescriptionImprove(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Description string `json:"description"`
		ProductURL  string `json:"product_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	description := strings.TrimSpace(req.Description)
	if description == "" {
		http.Error(w, `{"error":"description required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	input := map[string]interface{}{"description": description}
	if u := strings.TrimSpace(req.ProductURL); u != "" {
		input["product_url"] = u
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "product_description", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job failed"}`, http.StatusInternalServerError)
		return
	}
	task, _ := queue.NewProductDescriptionTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) createProductSceneImprove(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ScenePrompt string `json:"scene_prompt"`
		ProductID   string `json:"product_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	scenePrompt := strings.TrimSpace(req.ScenePrompt)
	if scenePrompt == "" {
		http.Error(w, `{"error":"scene_prompt required"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	input := map[string]interface{}{"scene_prompt": scenePrompt}
	if id := strings.TrimSpace(req.ProductID); id != "" {
		input["product_id"] = id
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "product_scene_improve", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job failed"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "product_scene_improve", nil)
	task, _ := queue.NewProductSceneImproveTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) getProduct(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	productID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	product, err := s.DB.GetProduct(ctx, productID, userID)
	if err != nil || product == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	var photos []store.ProductPhoto
	var generatedJobs []store.Job
	var suggestedScenes []string
	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		p, _ := s.DB.ListProductPhotos(ctx, productID)
		if p != nil {
			photos = p
		}
	}()
	go func() {
		defer wg.Done()
		j, _ := s.DB.ListJobsByProductID(ctx, productID, userID)
		if j != nil {
			generatedJobs = j
		}
	}()
	go func() {
		defer wg.Done()
		sc, _ := s.DB.GetLatestProductScoreScenes(ctx, productID, userID)
		if sc != nil {
			suggestedScenes = sc
		}
	}()
	wg.Wait()
	if photos == nil {
		photos = []store.ProductPhoto{}
	}
	if generatedJobs == nil {
		generatedJobs = []store.Job{}
	}
	if suggestedScenes == nil {
		suggestedScenes = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"product":          product,
		"photos":           photos,
		"generated_jobs":   generatedJobs,
		"suggested_scenes": suggestedScenes,
	})
}

func (s *Server) addProductPhotos(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	productID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	product, err := s.DB.GetProduct(r.Context(), productID, userID)
	if err != nil || product == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	var req struct {
		ImageURLs []string `json:"image_urls"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	photos, _ := s.DB.ListProductPhotos(ctx, productID)
	sortOrder := len(photos)
	for _, u := range req.ImageURLs {
		if u := strings.TrimSpace(u); u != "" {
			_, err = s.DB.AddProductPhoto(ctx, productID, u, sortOrder)
			if err != nil {
				break
			}
			sortOrder++
		}
	}
	if err != nil {
		http.Error(w, `{"error":"add photo failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createProductScore(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	productID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	product, err := s.DB.GetProduct(r.Context(), productID, userID)
	if err != nil || product == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	ctx := r.Context()
	input := map[string]interface{}{"product_id": productID.String()}
	jobID, err := s.DB.CreateJob(ctx, userID, "product_score", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "product_score", nil)
	task, _ := queue.NewProductScoreTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) deleteProductPhoto(w http.ResponseWriter, r *http.Request) {
	photoIDStr := chi.URLParam(r, "photoId")
	photoID, err := uuid.Parse(photoIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid photo id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if err := s.DB.DeleteProductPhoto(r.Context(), photoID, userID); err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deleteProduct(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	productID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if err := s.DB.DeleteProduct(r.Context(), productID, userID); err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
