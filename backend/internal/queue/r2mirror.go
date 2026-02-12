package queue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	repgo "github.com/replicate/replicate-go"
	"flipo5/backend/internal/storage"
)

// mirrorMediaToR2 runs in background: downloads Replicate URLs, uploads to R2, updates job output with permanent URLs.
// Call after saving Replicate output so the user sees content immediately; this swaps to our URLs when done.
func mirrorMediaToR2(h *Handlers, jobID uuid.UUID, out repgo.PredictionOutput, jobType string) {
	if h.Store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Replicate output is typically { "output": "url" } or { "output": ["url1", "url2"] }
	outBytes, err := json.Marshal(out)
	if err != nil {
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal(outBytes, &m); err != nil {
		return
	}
	outputVal, ok := m["output"]
	if !ok {
		return
	}
	var urls []string
	switch v := outputVal.(type) {
	case string:
		if v != "" {
			urls = []string{v}
		}
	case []interface{}:
		for _, u := range v {
			if s, ok := u.(string); ok && s != "" {
				urls = append(urls, s)
			}
		}
	}
	if len(urls) == 0 {
		return
	}

	client := &http.Client{Timeout: 2 * time.Minute}
	jobIDStr := jobID.String()
	var newURLs []string
	for i, u := range urls {
		key, publicURL := downloadAndPut(ctx, h.Store, client, u, jobIDStr, i, jobType)
		if publicURL != "" {
			newURLs = append(newURLs, publicURL)
		} else if key != "" {
			newURLs = append(newURLs, h.Store.URL(key))
		}
	}
	if len(newURLs) == 0 {
		return
	}
	// Preserve same structure: single URL -> one string, multiple -> array
	if len(newURLs) == 1 {
		m["output"] = newURLs[0]
	} else {
		m["output"] = newURLs
	}
	_ = h.DB.UpdateJobOutput(ctx, jobID, m)
}

func downloadAndPut(ctx context.Context, s *storage.Store, client *http.Client, url, jobIDStr string, index int, jobType string) (key, publicURL string) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", ""
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", ""
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", ""
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	// First token (e.g. "image/png" or "video/mp4")
	if i := strings.Index(contentType, ";"); i > 0 {
		contentType = strings.TrimSpace(contentType[:i])
	}
	ext := extFromContentType(contentType, jobType, url)
	key = fmt.Sprintf("jobs/%s/%d%s", jobIDStr, index, ext)
	_, err = s.Put(ctx, key, bytes.NewReader(body), contentType)
	if err != nil {
		return "", ""
	}
	return key, s.URL(key)
}

func extFromContentType(contentType, jobType, fallbackURL string) string {
	switch {
	case strings.HasPrefix(contentType, "image/png"):
		return ".png"
	case strings.HasPrefix(contentType, "image/jpeg"), strings.HasPrefix(contentType, "image/jpg"):
		return ".jpg"
	case strings.HasPrefix(contentType, "image/webp"):
		return ".webp"
	case strings.HasPrefix(contentType, "image/gif"):
		return ".gif"
	case strings.HasPrefix(contentType, "video/mp4"):
		return ".mp4"
	case strings.HasPrefix(contentType, "video/webm"):
		return ".webm"
	}
	if jobType == "video" {
		return ".mp4"
	}
	return ".png"
}
