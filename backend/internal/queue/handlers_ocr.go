package queue

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"flipo5/backend/internal/documents"
	"flipo5/backend/internal/textmodel"
	"github.com/google/uuid"
)

func (h *Handlers) pageOCR(ctx context.Context, userID uuid.UUID, png []byte, pageNum int) (string, error) {
	if h.Repl == nil || h.Store == nil {
		return "", fmt.Errorf("ocr not configured")
	}
	model := strings.TrimSpace(h.Cfg.ModelText)
	key := fmt.Sprintf("uploads/%s/ocr/%d-%d.png", userID.String(), time.Now().UnixNano(), pageNum)
	if _, err := h.Store.Put(ctx, key, bytes.NewReader(png), "image/png"); err != nil {
		return "", err
	}
	url := h.Store.URL(key)
	input := textmodel.BuildInput(model, "Extract all visible text from this document page. Return plain text only.", "OCR page.", []string{url}, 4096)
	out, err := h.Repl.RunWithFallback(ctx, model, h.textFallbacks(), input)
	if err != nil {
		return "", err
	}
	return predictionOutputText(out), nil
}

func (h *Handlers) fetchDocumentText(ctx context.Context, userID uuid.UUID, fileURL, contentType, name, cached string) (string, error) {
	if strings.TrimSpace(cached) != "" {
		return cached, nil
	}
	fileURL = resolveMediaURL(h, fileURL)
	data, err := documents.FetchBytes(ctx, fileURL)
	if err != nil {
		return "", err
	}
	ocr := func(c context.Context, png []byte, page int) (string, error) {
		return h.pageOCR(c, userID, png, page)
	}
	if strings.HasSuffix(strings.ToLower(name), ".pdf") || contentType == "application/pdf" {
		return documents.ExtractPDFWithPageOCR(ctx, data, contentType, name, ocr)
	}
	return documents.ExtractFromBytes(data, contentType, name)
}

func predictionOutputText(out interface{}) string {
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
