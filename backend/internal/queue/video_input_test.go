package queue

import "testing"

func TestParseVideoDurationSeconds(t *testing.T) {
	cases := []struct {
		prompt   string
		fallback int
		want     int
	}{
		{"make a 10 second video", 5, 10},
		{"video de 8 secunde", 5, 8},
		{"clip 15s please", 5, 15},
		{"3 Sekunden", 5, 3},
		{"no duration here", 5, 5},
		{"duration 99s ignored", 5, 5},
		{"", 7, 7},
	}
	for _, c := range cases {
		got := ParseVideoDurationSeconds(c.prompt, c.fallback)
		if got != c.want {
			t.Fatalf("prompt=%q got=%d want=%d", c.prompt, got, c.want)
		}
	}
}

func TestImageURLFromVideoJobInput(t *testing.T) {
	if got := imageURLFromVideoJobInput(map[string]interface{}{"image": "https://x/a.png"}); got != "https://x/a.png" {
		t.Fatalf("got %q", got)
	}
	if got := imageURLFromVideoJobInput(map[string]interface{}{
		"image_input": []interface{}{"https://x/b.webp"},
	}); got != "https://x/b.webp" {
		t.Fatalf("got %q", got)
	}
}
