package queue

import (
	"regexp"
	"strconv"
	"strings"
)

var videoDurationRe = regexp.MustCompile(`(?i)(?:^|[^\d])(\d{1,2})\s*(?:seconds?|secs?|secunde|secund[aă]|sekunden|sek|s)\b`)

// ParseVideoDurationSeconds extracts 1–15s from natural language, else fallback.
func ParseVideoDurationSeconds(prompt string, fallback int) int {
	if fallback < 1 || fallback > 15 {
		fallback = 5
	}
	s := strings.TrimSpace(prompt)
	if s == "" {
		return fallback
	}
	if m := videoDurationRe.FindStringSubmatch(s); len(m) >= 2 {
		n, err := strconv.Atoi(m[1])
		if err == nil && n >= 1 && n <= 15 {
			return n
		}
	}
	return fallback
}

// durationFromJobInput reads duration from job JSON (float64/int/string), clamped to 1–15. 0 = missing.
func durationFromJobInput(m map[string]interface{}) int {
	if m == nil {
		return 0
	}
	switch v := m["duration"].(type) {
	case float64:
		n := int(v)
		if n >= 1 && n <= 15 {
			return n
		}
	case int:
		if v >= 1 && v <= 15 {
			return v
		}
	case int64:
		if v >= 1 && v <= 15 {
			return int(v)
		}
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err == nil && n >= 1 && n <= 15 {
			return n
		}
	}
	return 0
}

// imageURLFromVideoJobInput returns the source image for image-to-video (Grok / Veo).
func imageURLFromVideoJobInput(m map[string]interface{}) string {
	if m == nil {
		return ""
	}
	if s, _ := m["image"].(string); strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	if arr, ok := m["image_input"].([]interface{}); ok {
		for _, v := range arr {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	if arr, ok := m["image_input"].([]string); ok {
		for _, s := range arr {
			if strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}
