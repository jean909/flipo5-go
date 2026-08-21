package queue

import (
	"strings"

	repgo "github.com/replicate/replicate-go"
)

// SnapVeoDuration maps a requested length to Veo 3.1's allowed values: 4, 6, or 8.
// Zero/negative → default 8s.
func SnapVeoDuration(n int) int {
	if n <= 0 {
		return 8
	}
	if n <= 4 {
		return 4
	}
	if n <= 6 {
		return 6
	}
	return 8
}

func stringSliceFromJobInput(m map[string]interface{}, key string) []string {
	if m == nil {
		return nil
	}
	var out []string
	switch v := m[key].(type) {
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	case []string:
		for _, s := range v {
			if strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	}
	return out
}

// buildVeoPredictionInput maps job input → google/veo-3.1 Replicate schema.
func buildVeoPredictionInput(jobInput map[string]interface{}) repgo.PredictionInput {
	dur := 8
	if v := durationFromJobInput(jobInput); v > 0 {
		dur = SnapVeoDuration(v)
	}
	ar := "16:9"
	if v, _ := jobInput["aspect_ratio"].(string); v == "9:16" || v == "16:9" {
		ar = v
	}
	res := "1080p"
	if v, _ := jobInput["resolution"].(string); v == "720p" || v == "1080p" {
		res = v
	}
	genAudio := true
	if v, ok := jobInput["generate_audio"].(bool); ok {
		genAudio = v
	}

	refs := stringSliceFromJobInput(jobInput, "reference_images")
	if len(refs) > 3 {
		refs = refs[:3]
	}
	// R2V constraints from Veo: reference images require 16:9 + 8s; last_frame ignored.
	if len(refs) > 0 {
		ar = "16:9"
		dur = 8
	}

	input := repgo.PredictionInput{
		"prompt":         jobInput["prompt"],
		"duration":       dur,
		"aspect_ratio":   ar,
		"resolution":     res,
		"generate_audio": genAudio,
	}
	if len(refs) > 0 {
		input["reference_images"] = refs
	} else {
		if img := imageURLFromVideoJobInput(jobInput); img != "" {
			input["image"] = img
		}
		if lf, _ := jobInput["last_frame"].(string); strings.TrimSpace(lf) != "" {
			input["last_frame"] = strings.TrimSpace(lf)
		}
	}
	if np, _ := jobInput["negative_prompt"].(string); strings.TrimSpace(np) != "" {
		input["negative_prompt"] = strings.TrimSpace(np)
	}
	if seed := seedFromJobInput(jobInput); seed != nil {
		input["seed"] = *seed
	}
	return input
}

func seedFromJobInput(m map[string]interface{}) *int {
	if m == nil {
		return nil
	}
	switch v := m["seed"].(type) {
	case float64:
		n := int(v)
		return &n
	case int:
		return &v
	case int64:
		n := int(v)
		return &n
	default:
		return nil
	}
}
