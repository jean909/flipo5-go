package replicate

import (
	"context"
	"log"
	"strings"

	repgo "github.com/replicate/replicate-go"
)

// ModelsToTry returns primary plus non-empty unique fallbacks.
func ModelsToTry(primary string, fallbacks ...string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, 1+len(fallbacks))
	add := func(m string) {
		m = strings.TrimSpace(m)
		if m == "" {
			return
		}
		if _, ok := seen[m]; ok {
			return
		}
		seen[m] = struct{}{}
		out = append(out, m)
	}
	add(primary)
	for _, fb := range fallbacks {
		add(fb)
	}
	return out
}

// isModelUnavailable reports errors where trying another model may succeed.
func isModelUnavailable(err error) bool {
	if err == nil {
		return false
	}
	if isTransientPredictionError(err) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "422") ||
		strings.Contains(msg, "404") ||
		strings.Contains(msg, "not found") ||
		strings.Contains(msg, "e006") ||
		strings.Contains(msg, "invalid input") ||
		strings.Contains(msg, "model not found") ||
		strings.Contains(msg, "rate limit") ||
		strings.Contains(msg, "503") ||
		strings.Contains(msg, "502")
}

// RunWithFallback tries primary then optional fallback models.
func (c *Client) RunWithFallback(ctx context.Context, primary string, fallbacks []string, input repgo.PredictionInput) (repgo.PredictionOutput, error) {
	if c == nil {
		return nil, nil
	}
	models := ModelsToTry(primary, fallbacks...)
	var lastErr error
	for i, model := range models {
		out, err := c.Run(ctx, model, input)
		if err == nil {
			return out, nil
		}
		lastErr = err
		if i < len(models)-1 && isModelUnavailable(err) {
			log.Printf("replicate Run %s failed: %v — trying fallback", model, err)
			continue
		}
		return nil, err
	}
	return nil, lastErr
}

// CreatePredictionWithStreamFallback tries primary then fallback models for streaming text.
func (c *Client) CreatePredictionWithStreamFallback(ctx context.Context, primary string, fallbacks []string, input repgo.PredictionInput) (*repgo.Prediction, error) {
	if c == nil {
		return nil, nil
	}
	models := ModelsToTry(primary, fallbacks...)
	var lastErr error
	for i, model := range models {
		pred, err := c.CreatePredictionWithStream(ctx, model, input)
		if err == nil {
			return pred, nil
		}
		lastErr = err
		if i < len(models)-1 && isModelUnavailable(err) {
			log.Printf("replicate stream %s failed: %v — trying fallback", model, err)
			continue
		}
		return nil, err
	}
	return nil, lastErr
}
