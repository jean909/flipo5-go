package intent

import "testing"

func TestNormalizePrompt(t *testing.T) {
	a := normalizePrompt("  Salut   AS VREA  ")
	b := normalizePrompt("salut as vrea")
	if a != b {
		t.Fatalf("%q != %q", a, b)
	}
}

func TestCacheKeyStable(t *testing.T) {
	h := Hints{HasImageAttachment: true}
	k1 := cacheKey("Make a cat photo", h)
	k2 := cacheKey("  make   a cat photo  ", h)
	if k1 != k2 {
		t.Fatalf("keys differ: %s vs %s", k1, k2)
	}
	k3 := cacheKey("Make a cat photo", Hints{})
	if k1 == k3 {
		t.Fatal("attachment flag should change key")
	}
}

func TestParseSkill(t *testing.T) {
	cases := map[string]Skill{
		`{"skill":"image"}`:      SkillImage,
		`{"skill":"video"}`:      SkillVideo,
		`{"skill":"chat"}`:       SkillChat,
		`{"skill":"image_edit"}`: SkillImageEdit,
		`image`:                  SkillImage,
	}
	for in, want := range cases {
		if got := parseSkill(in); got != want {
			t.Fatalf("%q => %s want %s", in, got, want)
		}
	}
}
