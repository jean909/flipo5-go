package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"flipo5/backend/internal/textmodel"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

func (h *Handlers) ProductScoreHandler(ctx context.Context, t *asynq.Task) error {
	var p ProductScorePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	productIDStr, _ := jobInput["product_id"].(string)
	if productIDStr == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "product_id required", 0, "")
		return nil
	}
	productID, err := uuid.Parse(productIDStr)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "invalid product_id", 0, "")
		return nil
	}
	product, err := h.DB.GetProduct(ctx, productID, job.UserID)
	if err != nil || product == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "product not found", 0, "")
		return nil
	}
	photos, err := h.DB.ListProductPhotos(ctx, productID)
	if err != nil || len(photos) == 0 {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "no photos to score", 0, "")
		return nil
	}
	var imageURLs []string
	for _, ph := range photos {
		u := ph.ImageURL
		if strings.HasPrefix(u, "uploads/") && h.Store != nil {
			u = h.Store.URL(u)
		}
		imageURLs = append(imageURLs, u)
	}
	if h.Repl == nil || h.Cfg.ModelText == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "AI not configured", 0, "")
		return nil
	}
	prompt := fmt.Sprintf("You have %d product photos. For each image rate 1-10: how clear and suitable is this product photo for generating new marketing images (visibility of product, lighting, framing). Reply with ONLY a JSON array of numbers, one per image in the same order, e.g. [7, 6, 8]. No other text.", len(imageURLs))
	system := "You are a product photo quality rater. Output only a JSON array of numbers 1-10."

	var scores []float64
	if textmodel.IsClaude(h.Cfg.ModelText) {
		for i, url := range imageURLs {
			onePrompt := fmt.Sprintf("Rate product photo %d of %d (1-10): how clear and suitable is this product photo for generating marketing images? Reply with ONLY one integer.", i+1, len(imageURLs))
			out, err := h.Repl.RunWithFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), textmodel.BuildInput(h.Cfg.ModelText, system, onePrompt, []string{url}, 128))
			if err != nil {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
				return nil
			}
			normalized := normalizeChatOutput(out)
			outText := ""
			if m, ok := normalized.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			outText = strings.TrimSpace(outText)
			parsed := parseScoreArray(outText)
			if len(parsed) != 1 {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Could not parse score for image "+fmt.Sprint(i+1), 0, "")
				return nil
			}
			scores = append(scores, parsed[0])
		}
		if len(scores) != len(photos) {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Could not parse scores (expected "+fmt.Sprint(len(photos))+" numbers)", 0, "")
			return nil
		}
		if err := h.DB.UpdateProductPhotoScores(ctx, productID, scores); err != nil {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Failed to save scores", 0, "")
			return nil
		}
		output := map[string]interface{}{"scores": scores}
		productContext := "Product: " + product.Name
		if product.Category != "" {
			productContext += ", category: " + product.Category
		}
		if product.Description != "" {
			productContext += ". Description: " + product.Description
		}
		scenePrompt := "For this product suggest exactly 10 specific scene descriptions for product photography. Each scene should be one short line, suitable for generating marketing images. " + productContext + ". Return ONLY a JSON array of exactly 10 strings, e.g. [\"scene 1\", \"scene 2\", ...]. No other text, no markdown."
		sceneInput := textmodel.BuildInput(h.Cfg.ModelText,
			"You are a product photography director. Output only a JSON array of 10 scene description strings.",
			scenePrompt, nil, 800)
		if out, err := h.Repl.RunWithFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), sceneInput); err == nil {
			normalized := normalizeChatOutput(out)
			outText := ""
			if m, ok := normalized.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			if scenes := parseScenesArray(strings.TrimSpace(outText)); len(scenes) > 0 {
				if len(scenes) > 10 {
					scenes = scenes[:10]
				}
				output["scenes"] = scenes
			}
		}
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", output, "", 0, "")
		if h.Stream != nil {
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"product_score"}`, p.JobID.String()))
		}
		return nil
	}

	input := textmodel.BuildInput(h.Cfg.ModelText, system, prompt, imageURLs, 200)
	pred, err := h.Repl.CreatePredictionWithStreamFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	for i := 0; i < 30; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Scoring failed", 0, pred.ID)
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			outText = strings.TrimSpace(outText)
			// Parse JSON array: [7, 6, 8] (may be wrapped in markdown code block)
			scores := parseScoreArray(outText)
			if len(scores) == 0 || len(scores) != len(photos) {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Could not parse scores (expected "+fmt.Sprint(len(photos))+" numbers)", 0, pred.ID)
				return nil
			}
			if err := h.DB.UpdateProductPhotoScores(ctx, productID, scores); err != nil {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Failed to save scores", 0, pred.ID)
				return nil
			}
			output := map[string]interface{}{"scores": scores}
			// Generate and save 10 scene suggestions in same job (no extra API call later)
			productContext := "Product: " + product.Name
			if product.Category != "" {
				productContext += ", category: " + product.Category
			}
			if product.Description != "" {
				productContext += ". Description: " + product.Description
			}
			scenePrompt := "For this product suggest exactly 10 specific scene descriptions for product photography. Each scene should be one short line, suitable for generating marketing images. " + productContext + ". Return ONLY a JSON array of exactly 10 strings, e.g. [\"scene 1\", \"scene 2\", ...]. No other text, no markdown."
			sceneInput := map[string]interface{}{
				"prompt":        scenePrompt,
				"max_tokens":    800,
				"system_prompt": "You are a product photography director. Output only a JSON array of 10 scene description strings.",
			}
			if pred2, err := h.Repl.CreatePredictionWithStreamFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), sceneInput); err == nil {
				for i := 0; i < 25; i++ {
					state, err := h.Repl.GetPrediction(ctx, pred2.ID)
					if err != nil {
						time.Sleep(2 * time.Second)
						continue
					}
					if state.Status == "succeeded" {
						out := normalizeChatOutput(state.Output)
						outText := ""
						if m, ok := out.(map[string]interface{}); ok {
							outText, _ = m["output"].(string)
						}
						scenes := parseScenesArray(strings.TrimSpace(outText))
						if len(scenes) > 0 {
							if len(scenes) > 10 {
								scenes = scenes[:10]
							}
							output["scenes"] = scenes
						}
						break
					}
					if state.Status == "failed" || state.Status == "canceled" {
						break
					}
					time.Sleep(2 * time.Second)
				}
			}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", output, "", 0, pred.ID)
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"product_score"}`, p.JobID.String()))
			}
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "timeout", 0, pred.ID)
	return nil
}

func (h *Handlers) ProductDescriptionHandler(ctx context.Context, t *asynq.Task) error {
	var p ProductDescriptionPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	description, _ := jobInput["description"].(string)
	description = strings.TrimSpace(description)
	if description == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "description required", 0, "")
		return nil
	}
	productURL, _ := jobInput["product_url"].(string)
	productURL = strings.TrimSpace(productURL)
	if h.Repl == nil || h.Cfg.ModelText == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "AI not configured", 0, "")
		return nil
	}
	prompt := "Improve the following product description for marketing. Make it clear, compelling and professional. Return only the improved description text, no preamble or explanation.\n\nCurrent description:\n" + description
	if productURL != "" {
		prompt = "Using the product URL for context if helpful, improve the following product description for marketing. Make it clear, compelling and professional. Return only the improved description text, no preamble or explanation.\n\nProduct URL: " + productURL + "\n\nCurrent description:\n" + description
	}
	input := map[string]interface{}{
		"prompt":        prompt,
		"max_tokens":    1000,
		"system_prompt": "You are a product copywriter. Output only the improved description, nothing else.",
	}
	pred, err := h.Repl.CreatePredictionWithStreamFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	for i := 0; i < 30; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Description improve failed", 0, pred.ID)
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			outText = strings.TrimSpace(outText)
			if outText == "" {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Empty result", 0, pred.ID)
				return nil
			}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", map[string]interface{}{"output": outText}, "", 0, pred.ID)
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"product_description"}`, p.JobID.String()))
			}
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "timeout", 0, pred.ID)
	return nil
}

func (h *Handlers) ProductSceneImproveHandler(ctx context.Context, t *asynq.Task) error {
	var p ProductSceneImprovePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}
	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	scenePrompt, _ := jobInput["scene_prompt"].(string)
	scenePrompt = strings.TrimSpace(scenePrompt)
	if scenePrompt == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "scene_prompt required", 0, "")
		return nil
	}
	productIDStr, _ := jobInput["product_id"].(string)
	productName := ""
	if productIDStr != "" {
		if productID, err := uuid.Parse(productIDStr); err == nil {
			if prod, err := h.DB.GetProduct(ctx, productID, job.UserID); err == nil && prod != nil {
				productName = prod.Name
				if prod.Category != "" {
					productName += " (category: " + prod.Category + ")"
				}
			}
		}
	}
	if h.Repl == nil || h.Cfg.ModelText == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "AI not configured", 0, "")
		return nil
	}
	prompt := "Improve this scene description for product photography. Make it more specific and compelling for marketing images. Return only the improved scene description, no preamble.\n\n"
	if productName != "" {
		prompt = "Improve this scene description for product photography. Product: " + productName + ".\n\nCurrent scene: " + scenePrompt + "\n\nReturn only the improved scene description, no preamble or explanation.\n\n"
	} else {
		prompt += "Current scene: " + scenePrompt + "\n\n"
	}
	input := map[string]interface{}{
		"prompt":        prompt,
		"max_tokens":    500,
		"system_prompt": "You are a product photography director. Output only the improved scene description.",
	}
	pred, err := h.Repl.CreatePredictionWithStreamFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		return nil
	}
	for i := 0; i < 30; i++ {
		select {
		case <-ctx.Done():
			_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
			return nil
		default:
		}
		state, err := h.Repl.GetPrediction(ctx, pred.ID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if state.Status == "failed" || state.Status == "canceled" {
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Scene improve failed", 0, pred.ID)
			return nil
		}
		if state.Status == "succeeded" {
			out := normalizeChatOutput(state.Output)
			outText := ""
			if m, ok := out.(map[string]interface{}); ok {
				outText, _ = m["output"].(string)
			}
			outText = strings.TrimSpace(outText)
			if outText == "" {
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Empty result", 0, pred.ID)
				return nil
			}
			_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", map[string]interface{}{"output": outText}, "", 0, pred.ID)
			if h.Stream != nil {
				userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
				_ = h.Stream.PublishRaw(ctx, userJobsChannel, fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"product_scene_improve"}`, p.JobID.String()))
			}
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "timeout", 0, pred.ID)
	return nil
}
