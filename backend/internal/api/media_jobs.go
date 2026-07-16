package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"

	"github.com/google/uuid"
)

func (s *Server) createImage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt         string   `json:"prompt"`
		ThreadID       string   `json:"thread_id,omitempty"`
		Incognito      bool     `json:"incognito,omitempty"`
		Size           string   `json:"size,omitempty"`
		AspectRatio    string   `json:"aspect_ratio,omitempty"`
		ImageInput     []string `json:"image_input,omitempty"`
		ProductID      string   `json:"product_id,omitempty"`
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
		if req.Size == "4K" {
			req.AspectRatio = "match_input_image"
		} else {
			req.AspectRatio = "1:1"
		}
	}
	if req.Size == "4K" {
		if req.MaxImages < 1 || req.MaxImages > 15 {
			req.MaxImages = 4
		}
		if req.SequentialMode == "" {
			req.SequentialMode = "auto"
		}
	} else if req.MaxImages < 1 || req.MaxImages > 10 {
		req.MaxImages = 1
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
		"prompt":       req.Prompt,
		"size":         req.Size,
		"aspect_ratio": req.AspectRatio,
		"max_images":   req.MaxImages,
	}
	if req.Size == "4K" {
		input["sequential_image_generation"] = req.SequentialMode
	} else {
		input["quality"] = "high"
		input["output_format"] = "webp"
		input["number_of_images"] = req.MaxImages
		input["output_compression"] = 90
		input["background"] = "auto"
		input["moderation"] = "auto"
	}
	if len(req.ImageInput) > 0 {
		resolved := make([]string, 0, len(req.ImageInput))
		for _, u := range req.ImageInput {
			if u != "" && strings.HasPrefix(u, "uploads/") && s.Store != nil {
				resolved = append(resolved, s.Store.URL(u))
			} else {
				resolved = append(resolved, u)
			}
		}
		input["image_input"] = resolved
	}
	if strings.TrimSpace(req.ProductID) != "" {
		input["product_id"] = strings.TrimSpace(req.ProductID)
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "image", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "image", nil)
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

func (s *Server) createLogo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt         string `json:"prompt"`
		LogoText       string `json:"logo_text,omitempty"`
		LogoType       string `json:"logo_type,omitempty"`
		Style          string `json:"style,omitempty"`
		PrimaryColor   string `json:"primary_color,omitempty"`
		SecondaryColor string `json:"secondary_color,omitempty"`
		AspectRatio    string `json:"aspect_ratio,omitempty"`
		OutputFormat   string `json:"output_format,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		http.Error(w, `{"error":"prompt required"}`, http.StatusBadRequest)
		return
	}
	if req.AspectRatio == "" {
		req.AspectRatio = "1:1"
	}
	if req.OutputFormat != "jpg" && req.OutputFormat != "jpeg" && req.OutputFormat != "png" {
		req.OutputFormat = "png"
	}
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	ctx := r.Context()
	input := map[string]interface{}{
		"prompt":          strings.TrimSpace(req.Prompt),
		"logo_text":       strings.TrimSpace(req.LogoText),
		"logo_type":       strings.TrimSpace(req.LogoType),
		"style":           strings.TrimSpace(req.Style),
		"primary_color":   strings.TrimSpace(req.PrimaryColor),
		"secondary_color": strings.TrimSpace(req.SecondaryColor),
		"aspect_ratio":    req.AspectRatio,
		"output_format":   req.OutputFormat,
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "logo", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "logo", nil)
	task, _ := queue.NewLogoTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) createAudio(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt            string `json:"prompt"`
		Instrumental      bool   `json:"instrumental"`
		ForceInstrumental *bool  `json:"force_instrumental,omitempty"`
		AudioMode         string `json:"audio_mode,omitempty"` // "music" | "vocal"
		NumVariants       int    `json:"num_variants,omitempty"`
		OutputFormat      string `json:"output_format,omitempty"`
		MusicLengthMs     int    `json:"music_length_ms,omitempty"`
		SourceAudio       string `json:"source_audio,omitempty"`
		AudioAction       string `json:"audio_action,omitempty"` // generate | extend | remix | stems
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		http.Error(w, `{"error":"prompt required"}`, http.StatusBadRequest)
		return
	}
	req.AudioMode = strings.ToLower(strings.TrimSpace(req.AudioMode))
	if req.AudioMode == "" {
		req.AudioMode = "music"
	}
	if req.AudioMode != "music" && req.AudioMode != "vocal" {
		http.Error(w, `{"error":"audio_mode must be music or vocal"}`, http.StatusBadRequest)
		return
	}
	if req.AudioMode == "vocal" {
		req.Instrumental = false
	}
	if req.ForceInstrumental != nil {
		req.Instrumental = *req.ForceInstrumental
	}
	if req.AudioMode == "vocal" {
		req.Instrumental = false
	}
	if req.NumVariants < 1 || req.NumVariants > 4 {
		req.NumVariants = 1
	}
	switch req.OutputFormat {
	case "", "mp3_standard", "mp3_high_quality", "wav_16khz", "wav_22khz", "wav_24khz", "wav_cd_quality":
		if strings.TrimSpace(req.OutputFormat) == "" {
			req.OutputFormat = "mp3_standard"
		}
	default:
		http.Error(w, `{"error":"invalid output_format"}`, http.StatusBadRequest)
		return
	}
	if req.MusicLengthMs == 0 {
		req.MusicLengthMs = 10000
	}
	if req.MusicLengthMs < 5000 || req.MusicLengthMs > 300000 {
		http.Error(w, `{"error":"music_length_ms must be between 5000 and 300000"}`, http.StatusBadRequest)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	ctx := r.Context()
	input := map[string]interface{}{
		"prompt":             strings.TrimSpace(req.Prompt),
		"instrumental":       req.Instrumental,
		"force_instrumental": req.Instrumental,
		"audio_mode":         req.AudioMode,
		"num_variants":       req.NumVariants,
		"output_format":      req.OutputFormat,
		"music_length_ms":    req.MusicLengthMs,
	}
	if strings.TrimSpace(req.SourceAudio) != "" {
		input["source_audio"] = strings.TrimSpace(req.SourceAudio)
	}
	if a := strings.TrimSpace(req.AudioAction); a != "" {
		input["audio_action"] = strings.ToLower(a)
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "audio", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "audio", nil)
	task, _ := queue.NewAudioTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) createImageInpaint(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt   string  `json:"prompt"`
		ImageURL string  `json:"image_url"`
		MaskURL  string  `json:"mask_url"`
		Steps    int     `json:"steps,omitempty"`
		Guidance float64 `json:"guidance,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if req.Prompt == "" || req.ImageURL == "" || req.MaskURL == "" {
		http.Error(w, `{"error":"prompt, image_url and mask_url required"}`, http.StatusBadRequest)
		return
	}
	// image_url and mask_url: must be https, or uploads/ key (backend resolves to public URL)
	imageURL := req.ImageURL
	if !strings.HasPrefix(imageURL, "https://") {
		if strings.HasPrefix(imageURL, "uploads/") && s.Store != nil {
			imageURL = s.Store.URL(imageURL)
		} else {
			http.Error(w, `{"error":"image_url must be https or uploads/ key"}`, http.StatusBadRequest)
			return
		}
	}
	maskURL := req.MaskURL
	if !strings.HasPrefix(maskURL, "https://") {
		if strings.HasPrefix(maskURL, "uploads/") && s.Store != nil {
			maskURL = s.Store.URL(maskURL)
		} else {
			http.Error(w, `{"error":"mask_url must be https or uploads/ key"}`, http.StatusBadRequest)
			return
		}
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	input := map[string]interface{}{
		"prompt":  req.Prompt,
		"image":   imageURL,
		"mask":    maskURL,
		"inpaint": true,
	}
	if req.Steps >= 15 && req.Steps <= 50 {
		input["steps"] = req.Steps
	}
	if req.Guidance >= 1.5 && req.Guidance <= 100 {
		input["guidance"] = req.Guidance
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "image", input, nil)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "image", nil)
	task, _ := queue.NewImageTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}

func (s *Server) createVideo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt      string `json:"prompt"`
		ThreadID    string `json:"thread_id,omitempty"`
		Incognito   bool   `json:"incognito,omitempty"`
		Image       string `json:"image,omitempty"`
		Video       string `json:"video,omitempty"`
		Duration    int    `json:"duration,omitempty"`
		AspectRatio string `json:"aspect_ratio,omitempty"`
		Resolution  string `json:"resolution,omitempty"`
		VideoModel  string `json:"video_model,omitempty"` // "1" = default, "2" = Kling
		StartImage  string `json:"start_image,omitempty"`
		EndImage    string `json:"end_image,omitempty"`
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
	if req.VideoModel != "2" {
		req.VideoModel = "1"
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
		"video_model":  req.VideoModel,
	}
	if req.VideoModel == "2" {
		if req.StartImage != "" {
			input["start_image"] = req.StartImage
		}
		if req.EndImage != "" {
			input["end_image"] = req.EndImage
		}
	} else {
		if req.Image != "" {
			input["image"] = req.Image
		}
		if req.Video != "" {
			input["video"] = req.Video
		}
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "video", input, threadID)
	if err != nil {
		http.Error(w, `{"error":"create job"}`, http.StatusInternalServerError)
		return
	}
	s.recordUserProfile(userID, "video", nil)
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

func (s *Server) createUpscale(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ImageURL                  string   `json:"image_url"`
		Scale                     int      `json:"scale"`
		EnhanceModel              string   `json:"enhance_model"`
		OutputFormat              string   `json:"output_format"`
		FaceEnhancement           *bool    `json:"face_enhancement"`
		SubjectDetection          string   `json:"subject_detection"`
		FaceEnhancementCreativity *float64 `json:"face_enhancement_creativity"`
		FaceEnhancementStrength   *float64 `json:"face_enhancement_strength"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if req.ImageURL == "" {
		http.Error(w, `{"error":"image_url required"}`, http.StatusBadRequest)
		return
	}
	if req.Scale != 2 && req.Scale != 4 {
		req.Scale = 2
	}
	imageURL := req.ImageURL
	if !strings.HasPrefix(imageURL, "https://") {
		if strings.HasPrefix(imageURL, "uploads/") && s.Store != nil {
			imageURL = s.Store.URL(imageURL)
		} else {
			http.Error(w, `{"error":"image_url must be https or uploads/ key"}`, http.StatusBadRequest)
			return
		}
	}
	userID, _ := middleware.UserID(r.Context())
	ctx := r.Context()
	input := map[string]interface{}{
		"image_url": imageURL,
		"scale":     req.Scale,
	}
	if req.EnhanceModel != "" {
		input["enhance_model"] = req.EnhanceModel
	}
	if req.OutputFormat != "" {
		input["output_format"] = req.OutputFormat
	}
	if req.FaceEnhancement != nil {
		input["face_enhancement"] = *req.FaceEnhancement
	}
	if req.SubjectDetection != "" {
		input["subject_detection"] = req.SubjectDetection
	}
	if req.FaceEnhancementCreativity != nil {
		input["face_enhancement_creativity"] = *req.FaceEnhancementCreativity
	}
	if req.FaceEnhancementStrength != nil {
		input["face_enhancement_strength"] = *req.FaceEnhancementStrength
	}
	jobID, err := s.DB.CreateJob(ctx, userID, "upscale", input, nil)
	if err != nil {
		log.Printf("[createUpscale] CreateJob failed: %v", err)
		return
	}
	s.recordUserProfile(userID, "upscale", nil)
	task, _ := queue.NewUpscaleTask(jobID)
	if _, err := s.Asynq.Enqueue(task); err != nil {
		http.Error(w, `{"error":"enqueue"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID.String()})
}
