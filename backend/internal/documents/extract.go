// Package documents extracts text from chat attachments (PDF, plain text).
package documents

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ledongthuc/pdf"
)

const (
	MaxFetchBytes  = 20 << 20 // 20 MB
	MaxExtractRunes = 48_000
)

// IsDocumentContentType reports non-image attachment types we can try to read.
func IsDocumentContentType(contentType string) bool {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if ct == "" {
		return false
	}
	if strings.HasPrefix(ct, "image/") || strings.HasPrefix(ct, "video/") || strings.HasPrefix(ct, "audio/") {
		return false
	}
	return ct == "application/pdf" ||
		ct == "text/plain" ||
		ct == "application/msword" ||
		strings.Contains(ct, "wordprocessingml") ||
		strings.HasSuffix(ct, "document")
}

// ExtractFromBytes returns plain text from raw file bytes.
func ExtractFromBytes(data []byte, contentType, filename string) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("empty file")
	}
	ct := strings.ToLower(strings.TrimSpace(contentType))
	name := strings.ToLower(filename)
	if ct == "" || ct == "application/octet-stream" {
		switch {
		case strings.HasSuffix(name, ".pdf") || bytes.HasPrefix(data, []byte("%PDF")):
			ct = "application/pdf"
		case strings.HasSuffix(name, ".txt"):
			ct = "text/plain"
		}
	}
	if ct == "application/pdf" || bytes.HasPrefix(data, []byte("%PDF")) {
		return extractPDFText(data)
	}
	if ct == "text/plain" || strings.HasPrefix(ct, "text/") {
		return truncateRunes(string(data)), nil
	}
	return "", fmt.Errorf("unsupported type %q", contentType)
}

func extractPDFText(data []byte) (string, error) {
	r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("pdf open: %w", err)
	}
	var b strings.Builder
	n := r.NumPage()
	for page := 1; page <= n; page++ {
		p := r.Page(page)
		if p.V.IsNull() {
			continue
		}
		text, err := p.GetPlainText(nil)
		if err != nil {
			continue
		}
		if strings.TrimSpace(text) != "" {
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			b.WriteString(strings.TrimSpace(text))
		}
		if b.Len() >= MaxExtractRunes {
			break
		}
	}
	out := truncateRunes(strings.TrimSpace(b.String()))
	if out == "" {
		return "", fmt.Errorf("pdf contains no extractable text (may be scanned images only)")
	}
	return out, nil
}

// FetchAndExtract downloads a public URL and extracts document text.
func FetchAndExtract(ctx context.Context, url, contentType, filename string) (string, error) {
	if url == "" {
		return "", fmt.Errorf("empty url")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("fetch %s: HTTP %d", url, resp.StatusCode)
	}
	ct := contentType
	if ct == "" {
		ct = resp.Header.Get("Content-Type")
	}
	if filename == "" {
		filename = url
	}
	limited := io.LimitReader(resp.Body, MaxFetchBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return "", err
	}
	if len(data) > MaxFetchBytes {
		return "", fmt.Errorf("file too large (max %d MB)", MaxFetchBytes/(1<<20))
	}
	return ExtractFromBytes(data, ct, filename)
}

func truncateRunes(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= MaxExtractRunes {
		return s
	}
	// Fast byte trim then safe rune boundary
	if len(s) > MaxExtractRunes*4 {
		s = s[:MaxExtractRunes*4]
	}
	runes := []rune(s)
	if len(runes) <= MaxExtractRunes {
		return s
	}
	return string(runes[:MaxExtractRunes]) + "\n[… document truncated …]"
}
