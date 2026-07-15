package textmodel

import (
	"testing"
)

func TestIsClaude(t *testing.T) {
	cases := map[string]bool{
		"anthropic/claude-fable-5": true,
		"anthropic/claude-3.5-sonnet": true,
		"google/gemini-2.5-flash":    false,
		"":                           false,
	}
	for model, want := range cases {
		if got := IsClaude(model); got != want {
			t.Fatalf("IsClaude(%q) = %v, want %v", model, got, want)
		}
	}
}

func TestBuildInputClaude(t *testing.T) {
	input := BuildInput("anthropic/claude-fable-5", "sys", "user msg", []string{"https://x/a.png", "https://x/b.png"}, 4096)
	if input["system_prompt"] != "sys" {
		t.Fatalf("system_prompt = %v", input["system_prompt"])
	}
	if input["prompt"] != "user msg\n\n[Note: 2 reference images were attached; the model receives the most recent one.]" {
		t.Fatalf("prompt = %q", input["prompt"])
	}
	if input["image"] != "https://x/b.png" {
		t.Fatalf("image = %v", input["image"])
	}
	if input["max_tokens"] != 4096 {
		t.Fatalf("max_tokens = %v", input["max_tokens"])
	}
	if _, ok := input["images"]; ok {
		t.Fatal("claude input must not use images[]")
	}
}

func TestBuildInputGemini(t *testing.T) {
	input := BuildInput("google/gemini-2.5-flash", "sys", "user", []string{"https://x/a.png"}, 2048)
	if input["prompt"] != "sys\n\nuser" {
		t.Fatalf("prompt = %q", input["prompt"])
	}
	imgs, ok := input["images"].([]string)
	if !ok || len(imgs) != 1 || imgs[0] != "https://x/a.png" {
		t.Fatalf("images = %v", input["images"])
	}
	if _, ok := input["system_prompt"]; ok {
		t.Fatal("gemini input must not use system_prompt")
	}
}

func TestBuildInputClampsTokens(t *testing.T) {
	low := BuildInput("anthropic/claude-fable-5", "", "x", nil, 64)
	if low["max_tokens"] != 1024 {
		t.Fatalf("min clamp: %v", low["max_tokens"])
	}
	high := BuildInput("google/gemini-2.5-flash", "", "x", nil, 999999)
	if high["max_output_tokens"] != 128000 {
		t.Fatalf("max clamp: %v", high["max_output_tokens"])
	}
}
