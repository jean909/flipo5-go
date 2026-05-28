package queue

import (
	"strings"

	repgo "github.com/replicate/replicate-go"
)

// mapAspectRatioForGPTImage maps UI ratios to openai/gpt-image-2 allowed values: 1:1, 3:2, 2:3.
func mapAspectRatioForGPTImage(ar string) string {
	switch strings.TrimSpace(ar) {
	case "1:1", "3:2", "2:3":
		return ar
	case "16:9", "4:3":
		return "3:2"
	case "9:16", "3:4":
		return "2:3"
	default:
		return "1:1"
	}
}

func isGPTImageModel(model string) bool {
	return strings.Contains(strings.ToLower(model), "gpt-image")
}

// buildGPTImage2Input builds Replicate input for openai/gpt-image-2 from stored job input.
func buildGPTImage2Input(jobInput map[string]interface{}) repgo.PredictionInput {
	prompt, _ := jobInput["prompt"].(string)
	aspectRatio, _ := jobInput["aspect_ratio"].(string)

	quality := "high"
	if q, ok := jobInput["quality"].(string); ok {
		switch q {
		case "low", "medium", "high", "auto":
			quality = q
		}
	}

	outputFormat := "webp"
	if f, ok := jobInput["output_format"].(string); ok {
		switch f {
		case "png", "jpeg", "webp":
			outputFormat = f
		}
	}

	numImages := 1
	if v, ok := jobInput["number_of_images"].(float64); ok {
		numImages = int(v)
	} else if v, ok := jobInput["max_images"].(float64); ok {
		numImages = int(v)
	}
	if numImages < 1 {
		numImages = 1
	}
	if numImages > 10 {
		numImages = 10
	}

	compression := 90
	if v, ok := jobInput["output_compression"].(float64); ok {
		compression = int(v)
		if compression < 0 {
			compression = 0
		}
		if compression > 100 {
			compression = 100
		}
	}

	background := "auto"
	if b, ok := jobInput["background"].(string); ok {
		switch b {
		case "auto", "transparent", "opaque":
			background = b
		}
	}

	moderation := "auto"
	if m, ok := jobInput["moderation"].(string); ok {
		switch m {
		case "auto", "low":
			moderation = m
		}
	}

	input := repgo.PredictionInput{
		"prompt":               prompt,
		"aspect_ratio":         mapAspectRatioForGPTImage(aspectRatio),
		"quality":              quality,
		"output_format":        outputFormat,
		"number_of_images":     numImages,
		"output_compression":   compression,
		"background":           background,
		"moderation":           moderation,
	}

	var inputImages []string
	if urls, ok := jobInput["input_images"].([]interface{}); ok {
		for _, u := range urls {
			if s, ok := u.(string); ok && s != "" {
				inputImages = append(inputImages, s)
			}
		}
	}
	if len(inputImages) == 0 {
		if urls, ok := jobInput["image_input"].([]interface{}); ok {
			for _, u := range urls {
				if s, ok := u.(string); ok && s != "" {
					inputImages = append(inputImages, s)
				}
			}
		}
	}
	if len(inputImages) > 0 {
		input["input_images"] = inputImages
	}

	return input
}

// normalizeImageJobOutput wraps Replicate output as {"output": ...} for R2 mirror.
func normalizeImageJobOutput(out repgo.PredictionOutput) repgo.PredictionOutput {
	if arr, ok := out.([]interface{}); ok {
		return map[string]interface{}{"output": arr}
	}
	return normalizeNanoBananaOutput(out)
}
