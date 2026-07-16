package documents

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const maxOCRPages = 3

// PageOCRFunc processes one rendered PDF page (PNG bytes) and returns extracted text.
type PageOCRFunc func(ctx context.Context, png []byte, pageNum int) (string, error)

// ExtractPDFWithPageOCR tries normal extract, then pdftoppm + per-page OCR.
func ExtractPDFWithPageOCR(ctx context.Context, data []byte, contentType, filename string, ocr PageOCRFunc) (string, error) {
	text, err := ExtractFromBytes(data, contentType, filename)
	if err == nil && strings.TrimSpace(text) != "" {
		return text, nil
	}
	if ocr == nil {
		if err != nil {
			return "", err
		}
		return "", fmt.Errorf("pdf contains no extractable text")
	}
	ocrText, ocrErr := ocrPDFPages(ctx, data, ocr)
	if ocrErr == nil && strings.TrimSpace(ocrText) != "" {
		return truncateRunes(strings.TrimSpace(ocrText)), nil
	}
	if err != nil {
		return "", err
	}
	if ocrErr != nil {
		return "", ocrErr
	}
	return "", fmt.Errorf("pdf ocr produced no text")
}

func ocrPDFPages(ctx context.Context, pdfData []byte, ocr PageOCRFunc) (string, error) {
	if _, err := exec.LookPath("pdftoppm"); err != nil {
		return "", fmt.Errorf("pdftoppm not installed")
	}
	dir, err := os.MkdirTemp("", "flipo5-pdf-ocr-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	pdfPath := filepath.Join(dir, "input.pdf")
	if err := os.WriteFile(pdfPath, pdfData, 0600); err != nil {
		return "", err
	}
	outPrefix := filepath.Join(dir, "page")
	cmd := exec.CommandContext(ctx, "pdftoppm", "-png", "-f", "1", "-l", fmt.Sprintf("%d", maxOCRPages), pdfPath, outPrefix)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("pdftoppm: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	matches, _ := filepath.Glob(outPrefix + "-*.png")
	if len(matches) == 0 {
		matches, _ = filepath.Glob(outPrefix + "*.png")
	}
	var parts []string
	for i, path := range matches {
		png, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		t, err := ocr(ctx, png, i+1)
		if err == nil && strings.TrimSpace(t) != "" {
			parts = append(parts, strings.TrimSpace(t))
		}
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("no ocr text from pdf pages")
	}
	return strings.Join(parts, "\n\n"), nil
}

// FetchBytes downloads a URL (max MaxFetchBytes).
func FetchBytes(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch %s: HTTP %d", url, resp.StatusCode)
	}
	limited := io.LimitReader(resp.Body, MaxFetchBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if len(data) > MaxFetchBytes {
		return nil, fmt.Errorf("file too large")
	}
	return data, nil
}
