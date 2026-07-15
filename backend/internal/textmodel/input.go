// Package textmodel builds Replicate inputs for text/chat models (Claude Fable vs legacy Gemini).
package textmodel

import (
	"fmt"
	"strings"

	repgo "github.com/replicate/replicate-go"
)

const DefaultMaxTokens = 8192

// IsClaude reports whether the Replicate model ID is an Anthropic Claude text model.
func IsClaude(model string) bool {
	m := strings.ToLower(strings.TrimSpace(model))
	return strings.Contains(m, "claude") || strings.HasPrefix(m, "anthropic/")
}

// BuildInput builds Replicate prediction input for the configured text model.
// For Claude: system_prompt, prompt, max_tokens, optional single image, max_image_resolution.
// For legacy Gemini: merges system into prompt, uses images[] and max_output_tokens.
func BuildInput(model, systemPrompt, userPrompt string, imageURLs []string, maxTokens int) repgo.PredictionInput {
	if maxTokens < 1024 {
		maxTokens = 1024
	}
	if maxTokens > 128000 {
		maxTokens = 128000
	}

	if IsClaude(model) {
		prompt := userPrompt
		if len(imageURLs) > 1 {
			prompt += fmt.Sprintf("\n\n[Note: %d reference images were attached; the model receives the most recent one.]", len(imageURLs))
		}
		input := repgo.PredictionInput{
			"prompt":                 prompt,
			"system_prompt":          systemPrompt,
			"max_tokens":             maxTokens,
			"max_image_resolution":   0.5,
		}
		if len(imageURLs) > 0 {
			input["image"] = imageURLs[len(imageURLs)-1]
		}
		return input
	}

	merged := userPrompt
	if strings.TrimSpace(systemPrompt) != "" {
		merged = strings.TrimSpace(systemPrompt) + "\n\n" + userPrompt
	}
	input := repgo.PredictionInput{
		"prompt":            merged,
		"max_output_tokens": maxTokens,
	}
	if len(imageURLs) > 0 {
		input["images"] = imageURLs
	}
	return input
}
