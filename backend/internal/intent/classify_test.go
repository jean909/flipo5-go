package intent

import "testing"

func TestHeuristicPrefixes(t *testing.T) {
	cases := []struct {
		prompt string
		want   Skill
	}{
		{"create an image of a cat", SkillImage},
		{"Generate a video of waves", SkillVideo},
		{"erstelle ein bild von einem auto", SkillImage},
		{"mach ein video vom sonnenuntergang", SkillVideo},
	}
	for _, tc := range cases {
		r, ok := Heuristic(tc.prompt, Hints{})
		if !ok || r.Skill != tc.want {
			t.Fatalf("%q => got %+v ok=%v want %s", tc.prompt, r, ok, tc.want)
		}
	}
}

func TestHeuristicChatQuestions(t *testing.T) {
	r, ok := Heuristic("What is the capital of France?", Hints{})
	if ok {
		t.Fatalf("expected not confident, got %+v", r)
	}
	r, ok = Heuristic("describe this image", Hints{HasImageAttachment: true})
	if ok {
		t.Fatalf("analyze+image should not force generation, got %+v", r)
	}
}
