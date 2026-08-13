// Package intent classifies a user message into a Flipo5 skill via a fast LLM.
// Results are cached in Redis so repeated prompts route instantly.
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
)

type Hints struct {
	HasImageAttachment bool
	HasVideoAttachment bool
	HasPriorImage      bool // thread already has a generated/uploaded image
}

type Result struct {
	Skill      Skill   `json:"skill"`
	Confidence float64 `json:"confidence"`
	Source     string  `json:"source"` // cache | llm | default
}

// CacheStore is the subset of Redis we need (implemented by cache.Redis).
type CacheStore interface {
	Get(ctx context.Context, key string) ([]byte, error)
	SetTTL(ctx context.Context, key string, val []byte, ttl time.Duration) error
}

type Classifier struct {
	Repl  *replicate.Client
	Model string // fast text model, e.g. google/gemini-2.5-flash
	Cache CacheStore
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
	return "intent:v2:" + hex.EncodeToString(sum[:16])
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

// Classify uses Redis cache first, then a fast LLM. No keyword/regex routing.
func (c *Classifier) Classify(ctx context.Context, prompt string, hints Hints) Result {
	if strings.TrimSpace(prompt) == "" {
		return Result{Skill: SkillChat, Confidence: 1, Source: "default"}
	}
	key := cacheKey(prompt, hints)
	if c != nil && c.Cache != nil {
		if b, err := c.Cache.Get(ctx, key); err == nil && len(b) > 0 {
			var cached Result
			if json.Unmarshal(b, &cached) == nil && cached.Skill != "" {
				cached.Source = "cache"
				cached.Confidence = 1
				return cached
			}
		}
	}
	if c == nil || c.Repl == nil || strings.TrimSpace(c.Model) == "" {
		return Result{Skill: SkillChat, Confidence: 0.3, Source: "default"}
	}
	r, ok := c.classifyLLM(ctx, prompt, hints)
	if !ok {
		return Result{Skill: SkillChat, Confidence: 0.3, Source: "default"}
	}
	if c.Cache != nil {
		if payload, err := json.Marshal(Result{Skill: r.Skill, Confidence: r.Confidence, Source: "llm"}); err == nil {
			_ = c.Cache.SetTTL(ctx, key, payload, cacheTTL)
		}
	}
	return r
}

func (c *Classifier) classifyLLM(ctx context.Context, prompt string, hints Hints) (Result, bool) {
	runCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	system := `You are Flipo5's skill router. Read the user message and pick exactly one skill.
Return ONLY valid JSON: {"skill":"chat"|"image"|"video"|"image_edit"}

Definitions:
- chat — questions, conversation, advice, analysis, describing an image, anything that is NOT a generation/edit request
- image — user wants a NEW picture generated from text (draw / create / make a photo / poza / bild / etc. in any language)
- video — user wants a NEW short video/clip generated
- image_edit — user wants to edit, change, restyle, or transform an EXISTING photo (uploaded now, or a previous one in the thread)

Rules:
- Casual requests in Romanian, German, English, or any language still map to image/video when they ask to create media (e.g. "fă-mi o poză", "mach ein Bild", "make me a picture").
- Greetings alone → chat. Greeting + create image → image.
- If they ask to edit/change something in a photo → image_edit.
- If unsure between image and image_edit: use image_edit when an image is attached or a prior image exists; otherwise image.
- When unsure overall → chat.
- Never explain. JSON only.`

	user := "Message:\n" + strings.TrimSpace(prompt)
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
	if textmodel.IsClaude(c.Model) {
		input = textmodel.BuildInput(c.Model, system, user, nil, 1024)
		input["max_tokens"] = 48
	} else {
		input = repgo.PredictionInput{
			"prompt":            system + "\n\n" + user,
			"max_output_tokens": 48,
		}
	}

	out, err := c.Repl.Run(runCtx, c.Model, input)
	if err != nil {
		log.Printf("intent classify llm: %v", err)
		return Result{}, false
	}
	text := strings.TrimSpace(outputText(out))
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	skill := parseSkill(text)
	if skill == "" {
		log.Printf("intent classify parse failed: %q", truncate(text, 120))
		return Result{}, false
	}
	return Result{Skill: skill, Confidence: 0.85, Source: "llm"}, true
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
				case "chat":
					return SkillChat
				}
			}
		}
	}
	switch {
	case strings.Contains(lower, "image_edit") || strings.Contains(lower, "image-edit"):
		return SkillImageEdit
	case strings.Contains(lower, `"image"`) || strings.HasPrefix(strings.TrimSpace(lower), "image"):
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
