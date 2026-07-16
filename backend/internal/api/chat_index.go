package api

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"flipo5/backend/internal/documents"
	"flipo5/backend/internal/textmodel"
	repgo "github.com/replicate/replicate-go"
	"github.com/google/uuid"
)

func (s *Server) resolvePublicURL(key string) string {
	if key == "" {
		return key
	}
	if strings.HasPrefix(key, "https://") {
		return key
	}
	if strings.HasPrefix(key, "uploads/") && s.Store != nil {
		return s.Store.URL(key)
	}
	return key
}

func (s *Server) extractDocumentText(ctx context.Context, userID uuid.UUID, fileURL, contentType, fileName string) (string, error) {
	fileURL = s.resolvePublicURL(fileURL)
	if strings.HasPrefix(contentType, "image/") {
		return s.describeImageURL(ctx, fileURL)
	}
	data, err := documents.FetchBytes(ctx, fileURL)
	if err != nil {
		return "", err
	}
	ocr := s.pageOCRFunc(userID)
	if strings.HasSuffix(strings.ToLower(fileName), ".pdf") || contentType == "application/pdf" {
		return documents.ExtractPDFWithPageOCR(ctx, data, contentType, fileName, ocr)
	}
	return documents.ExtractFromBytes(data, contentType, fileName)
}

func (s *Server) pageOCRFunc(userID uuid.UUID) documents.PageOCRFunc {
	if s.Repl == nil || s.Store == nil {
		return nil
	}
	model := strings.TrimSpace(s.ModelText)
	if model == "" {
		return nil
	}
	return func(ctx context.Context, png []byte, pageNum int) (string, error) {
		key := fmt.Sprintf("uploads/%s/ocr/%d-%d.png", userID.String(), time.Now().UnixNano(), pageNum)
		if _, err := s.Store.Put(ctx, key, bytes.NewReader(png), "image/png"); err != nil {
			return "", err
		}
		url := s.Store.URL(key)
		input := textmodel.BuildInput(model, "Extract all visible text from this document page image. Return plain text only, preserve structure where possible.", "OCR this page.", []string{url}, 4096)
		out, err := s.Repl.RunWithFallback(ctx, model, nil, input)
		if err != nil {
			return "", err
		}
		return predictionText(out), nil
	}
}

func predictionText(out repgo.PredictionOutput) string {
	switch v := out.(type) {
	case string:
		return strings.TrimSpace(v)
	case []interface{}:
		if len(v) > 0 {
			if s, ok := v[len(v)-1].(string); ok {
				return strings.TrimSpace(s)
			}
		}
	case map[string]interface{}:
		if s, ok := v["output"].(string); ok {
			return strings.TrimSpace(s)
		}
	}
	return strings.TrimSpace(fmt.Sprint(out))
}

func (s *Server) describeImageURL(ctx context.Context, imageURL string) (string, error) {
	if s.Repl == nil || imageURL == "" {
		return "", fmt.Errorf("vision not configured")
	}
	model := strings.TrimSpace(s.ModelText)
	input := textmodel.BuildInput(model, "Describe this image in detail for a project knowledge base. Include any visible text.", "Describe the image.", []string{imageURL}, 1024)
	out, err := s.Repl.RunWithFallback(ctx, model, nil, input)
	if err != nil {
		return "", err
	}
	return predictionText(out), nil
}

func (s *Server) summarizeDocumentText(ctx context.Context, text string) string {
	text = strings.TrimSpace(text)
	if text == "" || s.Repl == nil {
		return ""
	}
	if len(text) > 12000 {
		text = text[:12000] + "…"
	}
	model := strings.TrimSpace(s.ModelText)
	input := textmodel.BuildInput(model, "Summarize the document in 2-4 sentences for a project index. Be factual.", "Document:\n\n"+text, nil, 512)
	out, err := s.Repl.RunWithFallback(ctx, model, nil, input)
	if err != nil {
		log.Printf("[index] summarize: %v", err)
		return ""
	}
	return predictionText(out)
}

func (s *Server) indexChatProjectFileAsync(userID, fileID uuid.UUID, fileURL, contentType, fileName string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		text, err := s.extractDocumentText(ctx, userID, fileURL, contentType, fileName)
		if err != nil {
			log.Printf("[index] extract %s: %v", fileName, err)
			return
		}
		summary := s.summarizeDocumentText(ctx, text)
		if err := s.DB.UpdateChatProjectFileIndex(ctx, fileID, userID, text, summary); err != nil {
			log.Printf("[index] save %s: %v", fileName, err)
		}
	}()
}
