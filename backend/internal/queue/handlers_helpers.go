package queue

import (
	"encoding/json"
	"strings"
)

// parseScenesArray extracts []string from AI output (JSON array of strings, may be wrapped in markdown).
func parseScenesArray(s string) []string {
	s = strings.TrimSpace(s)
	if idx := strings.Index(s, "["); idx >= 0 {
		s = s[idx:]
	}
	if idx := strings.LastIndex(s, "]"); idx >= 0 {
		s = s[:idx+1]
	}
	var arr []string
	if err := json.Unmarshal([]byte(s), &arr); err != nil {
		return nil
	}
	for i := range arr {
		arr[i] = strings.TrimSpace(arr[i])
	}
	return arr
}

// parseScoreArray extracts a slice of float64 from AI output (e.g. "[7, 6, 8]" or "```json\n[7,6,8]\n```").
func parseScoreArray(s string) []float64 {
	s = strings.TrimSpace(s)
	// Remove markdown code block if present
	if idx := strings.Index(s, "["); idx >= 0 {
		s = s[idx:]
	}
	if idx := strings.LastIndex(s, "]"); idx >= 0 {
		s = s[:idx+1]
	}
	var arr []float64
	if err := json.Unmarshal([]byte(s), &arr); err != nil {
		return nil
	}
	for i := range arr {
		if arr[i] < 0 {
			arr[i] = 0
		}
		if arr[i] > 10 {
			arr[i] = 10
		}
	}
	return arr
}

func resolveMediaURL(h *Handlers, u string) string {
	if u == "" {
		return u
	}
	if strings.HasPrefix(u, "uploads/") && h.Store != nil {
		return h.Store.URL(u)
	}
	return u
}

// resolveJobMediaURLs rewrites uploads/ keys in common image/video input fields to public URLs.
func resolveJobMediaURLs(h *Handlers, jobInput map[string]interface{}) {
	if jobInput == nil || h.Store == nil {
		return
	}
	for _, key := range []string{"image", "mask", "video", "start_image", "end_image", "last_frame"} {
		if s, ok := jobInput[key].(string); ok && s != "" {
			jobInput[key] = resolveMediaURL(h, s)
		}
	}
	for _, key := range []string{"image_input", "input_images", "reference_images"} {
		arr, ok := jobInput[key].([]interface{})
		if !ok || len(arr) == 0 {
			continue
		}
		out := make([]interface{}, 0, len(arr))
		for _, u := range arr {
			if s, ok := u.(string); ok && s != "" {
				out = append(out, resolveMediaURL(h, s))
			} else {
				out = append(out, u)
			}
		}
		jobInput[key] = out
	}
}

func filenameFromURL(u string) string {
	u = strings.TrimSpace(u)
	if u == "" {
		return "file"
	}
	if i := strings.Index(u, "?"); i >= 0 {
		u = u[:i]
	}
	if i := strings.LastIndex(u, "/"); i >= 0 {
		return u[i+1:]
	}
	return u
}

func isLikelyImageURL(u string) bool {
	lower := strings.ToLower(filenameFromURL(u))
	for _, ext := range []string{".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"} {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}
