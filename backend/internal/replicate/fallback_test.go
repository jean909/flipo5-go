package replicate

import (
	"errors"
	"testing"
)

func TestModelsToTryDedupes(t *testing.T) {
	got := ModelsToTry("anthropic/claude-fable-5", "google/gemini-2.5-flash", "anthropic/claude-fable-5", "")
	if len(got) != 2 {
		t.Fatalf("got %v", got)
	}
}

func TestIsModelUnavailable(t *testing.T) {
	if !isModelUnavailable(errors.New("422 validation failed")) {
		t.Fatal("422 should be retryable with fallback")
	}
	if isModelUnavailable(errors.New("permission denied")) {
		t.Fatal("permission denied should not trigger fallback loop")
	}
}
