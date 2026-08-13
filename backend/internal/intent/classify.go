// Package intent classifies a user message into a Flipo5 skill via a fast LLM.
// Media skills are cached in Redis for instant repeat routing. Chat is never cached.
package intent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"strings"
	"time"
	"unicode"

	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/textmodel"

	repgo "github.com/replicate/replicate-go"
)

type Skill string

const (
	SkillChat      Skill = "chat"
	SkillImage     Skill = "image"
	SkillVideo     Skill = "video"
	SkillImageEdit Skill = "image_edit"
	SkillRemoveBg  Skill = "remove_bg"
)

type Hints struct {
	HasImageAttachment bool
	HasVideoAttachment bool
	HasPriorImage      bool
}

type Result struct {
	Skill      Skill   `json:"skill"`
	Confidence float64 `json:"confidence"`
	Source     string  `json:"source"` // cache | llm | default
}

type CacheStore interface {
	Get(ctx context.Context, key string) ([]byte, error)
	SetTTL(ctx context.Context, key string, val []byte, ttl time.Duration) error
}

type Classifier struct {
	Repl      *replicate.Client
	Model     string   // primary fast model
	Fallbacks []string // optional extra models if primary fails / empty skill
	Cache     CacheStore
}

const cacheTTL = 7 * 24 * time.Hour

func cacheKey(prompt string, hints Hints) string {
	n := normalizePrompt(prompt)
	flags := "0"
	if hints.HasImageAttachment {
		flags += "i"
	}
	if hints.HasVideoAttachment {
		flags += "v"
	}
	if hints.HasPriorImage {
		flags += "p"
	}
	sum := sha256.Sum256([]byte(n + "|" + flags))
	return "intent:v3:" + hex.EncodeToString(sum[:16])
}

func normalizePrompt(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	b.Grow(len(s))
	prevSpace := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			if !prevSpace {
				b.WriteByte(' ')
				prevSpace = true
			}
			continue
		}
		prevSpace = false
		b.WriteRune(r)
	}
	return b.String()
}

// Classify uses Redis cache (media only) then fast LLM(s).
func (c *Classifier) Classify(ctx context.Context, prompt string, hints Hints) Result {
	if strings.TrimSpace(prompt) == "" {
		return Result{Skill: SkillChat, Confidence: 1, Source: "default"}
	}
	key := cacheKey(prompt, hints)
	if c != nil && c.Cache != nil {
		if b, err := c.Cache.Get(ctx, key); err == nil && len(b) > 0 {
			var cached Result
			if json.Unmarshal(b, &cached) == nil && cached.Skill != "" && cached.Skill != SkillChat {
				cached.Source = "cache"
				cached.Confidence = 1
				return cached
			}
		}
	}
	if c == nil || c.Repl == nil {
		return Result{Skill: SkillChat, Confidence: 0.2, Source: "default"}
	}

	models := make([]string, 0, 2+len(c.Fallbacks))
	if m := strings.TrimSpace(c.Model); m != "" {
		models = append(models, m)
	}
	for _, fb := range c.Fallbacks {
		fb = strings.TrimSpace(fb)
		if fb == "" {
			continue
		}
		dup := false
		for _, m := range models {
			if m == fb {
				dup = true
				break
			}
		}
		if !dup {
			models = append(models, fb)
		}
	}
	if len(models) == 0 {
		return Result{Skill: SkillChat, Confidence: 0.2, Source: "default"}
	}

	var last Result
	for _, model := range models {
		r, ok := c.classifyLLM(ctx, model, prompt, hints)
		if !ok {
			continue
		}
		last = r
		// Prefer a media skill; if model says chat, try next model once.
		if r.Skill != SkillChat {
			c.storeMediaCache(ctx, key, r)
			return r
		}
	}
	if last.Skill != "" {
		// Do not cache chat — avoids sticky wrong negatives.
		return last
	}
	return Result{Skill: SkillChat, Confidence: 0.2, Source: "default"}
}

func (c *Classifier) storeMediaCache(ctx context.Context, key string, r Result) {
	if c.Cache == nil || r.Skill == SkillChat {
		return
	}
	payload, err := json.Marshal(Result{Skill: r.Skill, Confidence: r.Confidence, Source: "llm"})
	if err != nil {
		return
	}
	_ = c.Cache.SetTTL(ctx, key, payload, cacheTTL)
}

func (c *Classifier) classifyLLM(ctx context.Context, model, prompt string, hints Hints) (Result, bool) {
	runCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	system := `You are Flipo5 skill router. Pick ONE skill for the user message.
Return ONLY JSON: {"skill":"chat"} OR {"skill":"image"} OR {"skill":"video"} OR {"skill":"image_edit"} OR {"skill":"remove_bg"}

skill meanings:
- image = user wants a NEW picture created (any language: "make a photo", "generează o poză", "fă-mi o poză", "erstelle ein Bild", "draw a cat", etc.)
- video = user wants a NEW short video/clip
- remove_bg = remove/cut out background of an existing photo ("remove background", "scoate fundalul", "fără fundal", "transparent background")
- image_edit = change/edit an existing photo in other ways (not pure background removal)
- chat = normal conversation/questions/advice ONLY when they are NOT asking to create media

IMPORTANT:
- If the message asks to create/generate/make a picture/photo/image/poza/bild → skill MUST be "image" (not chat).
- If the message asks specifically to remove background → skill MUST be "remove_bg".
- Greeting + image request → still "image".
- Never refuse. Never explain. JSON only.`

	user := "User message:\n" + strings.TrimSpace(prompt)
	if hints.HasImageAttachment {
		user += "\n[has_image_attachment=true]"
	}
	if hints.HasVideoAttachment {
		user += "\n[has_video_attachment=true]"
	}
	if hints.HasPriorImage {
		user += "\n[has_prior_image_in_thread=true]"
	}

	var input repgo.PredictionInput
	if textmodel.IsClaude(model) {
		input = textmodel.BuildInput(model, system, user, nil, 1024)
		input["max_tokens"] = 64
	} else {
		input = repgo.PredictionInput{
			"prompt":            system + "\n\n" + user + "\n\nJSON:",
			"max_output_tokens": 64,
			"temperature":       0.1,
		}
	}

	out, err := c.Repl.Run(runCtx, model, input)
	if err != nil {
		log.Printf("intent classify llm model=%s err=%v", model, err)
		return Result{}, false
	}
	text := strings.TrimSpace(outputText(out))
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	skill := parseSkill(text)
	if skill == "" {
		log.Printf("intent classify parse fail model=%s text=%q", model, truncate(text, 160))
		return Result{}, false
	}
	log.Printf("intent classify model=%s skill=%s raw=%q", model, skill, truncate(text, 80))
	return Result{Skill: skill, Confidence: 0.9, Source: "llm"}, true
}

func parseSkill(text string) Skill {
	lower := strings.ToLower(text)
	if i := strings.Index(lower, "{"); i >= 0 {
		if j := strings.LastIndex(lower, "}"); j > i {
			var obj struct {
				Skill string `json:"skill"`
			}
			if err := json.Unmarshal([]byte(text[i:j+1]), &obj); err == nil {
				switch strings.ToLower(strings.TrimSpace(obj.Skill)) {
				case "image", "image_creation", "image-creation":
					return SkillImage
				case "video", "video_creation", "video-creation":
					return SkillVideo
				case "image_edit", "image-edit", "edit", "image_editing":
					return SkillImageEdit
				case "remove_bg", "remove-bg", "removebg", "remove_background", "background_remove":
					return SkillRemoveBg
				case "chat":
					return SkillChat
				}
			}
		}
	}
	switch {
	case strings.Contains(lower, "remove_bg") || strings.Contains(lower, "remove-bg") || strings.Contains(lower, "remove_background"):
		return SkillRemoveBg
	case strings.Contains(lower, "image_edit") || strings.Contains(lower, "image-edit"):
		return SkillImageEdit
	case strings.Contains(lower, `"image"`) || strings.Contains(lower, "skill\": \"image") || strings.HasPrefix(strings.TrimSpace(lower), "image"):
		return SkillImage
	case strings.Contains(lower, `"video"`) || strings.HasPrefix(strings.TrimSpace(lower), "video"):
		return SkillVideo
	case strings.Contains(lower, `"chat"`) || strings.HasPrefix(strings.TrimSpace(lower), "chat"):
		return SkillChat
	}
	return ""
}

func outputText(out interface{}) string {
	switch v := out.(type) {
	case string:
		return v
	case []interface{}:
		var b strings.Builder
		for _, item := range v {
			if s, ok := item.(string); ok {
				b.WriteString(s)
			}
		}
		return b.String()
	case map[string]interface{}:
		if t, ok := v["text"].(string); ok {
			return t
		}
		if t, ok := v["output"].(string); ok {
			return t
		}
	}
	if b, err := json.Marshal(out); err == nil {
		return string(b)
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
