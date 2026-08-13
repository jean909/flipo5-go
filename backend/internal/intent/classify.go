// Package intent classifies a user message into a skill: chat, image, or video.
// Fast path: heuristic. Ambiguous: tiny LLM (Gemini Flash) with short timeout.
package intent

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"
	"time"

	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/textmodel"

	repgo "github.com/replicate/replicate-go"
)

type Skill string

const (
	SkillChat  Skill = "chat"
	SkillImage Skill = "image"
	SkillVideo Skill = "video"
)

type Hints struct {
	HasImageAttachment bool
	HasVideoAttachment bool
}

type Result struct {
	Skill      Skill  `json:"skill"`
	Confidence float64 `json:"confidence"`
	Source     string  `json:"source"` // heuristic | llm | default
}

type Classifier struct {
	Repl  *replicate.Client
	Model string // fast text model, e.g. google/gemini-2.5-flash
}

var (
	videoPrefixes = []string{
		"create a video", "generate a video", "create video", "generate video", "make a video", "make video",
		"creat a video", "generat a video", "develop a video",
		"erstelle ein video", "generiere ein video", "erstelle video", "generiere video", "video erstellen",
		"mach ein video", "mach video", "erschaffe ein video",
		"create video of", "generate video of", "make video of",
		"mach daraus ein video", "wandle das in ein video um", "erstelle daraus ein video",
	}
	imagePrefixes = []string{
		"create a photo", "generate a photo", "create a picture", "generate a picture",
		"create an image", "generate an image", "create photo", "generate photo",
		"create picture", "generate picture", "create image", "generate image",
		"creat a photo", "generat a photo", "creat image", "generat image",
		"draw a ", "draw an ", "make a photo", "make a picture", "make an image",
		"mach ein foto", "mach ein bild", "erstelle ein foto", "generiere ein foto",
		"erstelle ein bild", "generiere ein bild", "foto erstellen", "bild erstellen",
		"bild generieren", "erstelle mir ein bild", "mach mir ein bild",
		"mach daraus ein bild", "wandle das in ein bild um", "erstelle daraus ein bild",
	}

	analyzeRe  = mustBoundary(`analyze|analyse|describe|explain|identify|compare|what do you see|what is in|analysiere|beschreibe|erklaere|erklare|identifiziere|vergleiche|was siehst|was ist in`)
	generateRe = mustBoundary(`create|generate|make|draw|render|design|erstelle|generiere|mach|zeichne|kreiere|visualisiere`)
	imageRe    = mustBoundary(`image|picture|photo|drawing|blueprint|sketch|illustration|scenery|bild|foto|zeichnung|skizze|aufnahme|szene|mockup|thumbnail|banner|poster|cover|portrait|headshot`)
	videoRe    = mustBoundary(`video|clip|animation|movie|reel|cinematic|film|sequenz|footage|trailer|timelapse|kamerafahrt|produktvideo`)
)

func mustBoundary(alt string) *regexp.Regexp {
	return regexp.MustCompile(`(?i)\b(?:` + alt + `)\b`)
}

// Heuristic returns a confident skill when prefixes/scores are clear. ok=false → need LLM or default chat.
func Heuristic(prompt string, hints Hints) (Result, bool) {
	lower := strings.ToLower(strings.TrimSpace(prompt))
	if lower == "" {
		return Result{Skill: SkillChat, Confidence: 1, Source: "heuristic"}, true
	}
	for _, p := range videoPrefixes {
		if strings.HasPrefix(lower, p) {
			return Result{Skill: SkillVideo, Confidence: 0.95, Source: "heuristic"}, true
		}
	}
	for _, p := range imagePrefixes {
		if strings.HasPrefix(lower, p) {
			return Result{Skill: SkillImage, Confidence: 0.95, Source: "heuristic"}, true
		}
	}

	chatScore, imageScore, videoScore := 0, 0, 0
	if analyzeRe.MatchString(lower) || strings.Contains(lower, "?") {
		chatScore += 4
	}
	if generateRe.MatchString(lower) {
		imageScore += 2
		videoScore += 2
	}
	if imageRe.MatchString(lower) {
		imageScore += 3
	}
	if videoRe.MatchString(lower) {
		videoScore += 3
	}
	if hints.HasImageAttachment {
		imageScore++
		if analyzeRe.MatchString(lower) {
			chatScore += 2
		}
	}
	if hints.HasVideoAttachment {
		videoScore += 2
	}

	top := imageScore
	if videoScore > top {
		top = videoScore
	}
	gap := imageScore - videoScore
	if gap < 0 {
		gap = -gap
	}
	if top < 4 || gap < 2 || chatScore >= top {
		return Result{}, false
	}
	if imageScore > videoScore {
		return Result{Skill: SkillImage, Confidence: 0.8, Source: "heuristic"}, true
	}
	return Result{Skill: SkillVideo, Confidence: 0.8, Source: "heuristic"}, true
}

// Classify picks chat | image | video. Prefers instant heuristic; otherwise a fast LLM; else chat.
func (c *Classifier) Classify(ctx context.Context, prompt string, hints Hints) Result {
	if r, ok := Heuristic(prompt, hints); ok {
		return r
	}
	if c == nil || c.Repl == nil || strings.TrimSpace(c.Model) == "" {
		return Result{Skill: SkillChat, Confidence: 0.5, Source: "default"}
	}
	if r, ok := c.classifyLLM(ctx, prompt, hints); ok {
		return r
	}
	return Result{Skill: SkillChat, Confidence: 0.4, Source: "default"}
}

func (c *Classifier) classifyLLM(ctx context.Context, prompt string, hints Hints) (Result, bool) {
	runCtx, cancel := context.WithTimeout(ctx, 2500*time.Millisecond)
	defer cancel()

	system := `You are a fast intent router for Flipo5. Classify the user message into exactly one skill.
Reply with ONLY one JSON object: {"skill":"chat"|"image"|"video"}
Rules:
- chat = questions, advice, conversation, analysis, describing an attached image, anything that is not clearly a generation request
- image = user wants a new picture/photo/illustration generated
- video = user wants a short video/clip generated
- When unsure, choose chat
- Never explain.`

	user := "Message:\n" + strings.TrimSpace(prompt)
	if hints.HasImageAttachment {
		user += "\n[has_image_attachment=true]"
	}
	if hints.HasVideoAttachment {
		user += "\n[has_video_attachment=true]"
	}

	var input repgo.PredictionInput
	if textmodel.IsClaude(c.Model) {
		input = textmodel.BuildInput(c.Model, system, user, nil, 1024)
		input["max_tokens"] = 32
	} else {
		input = repgo.PredictionInput{
			"prompt":            system + "\n\n" + user,
			"max_output_tokens": 32,
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
		return Result{}, false
	}
	return Result{Skill: skill, Confidence: 0.7, Source: "llm"}, true
}

func parseSkill(text string) Skill {
	lower := strings.ToLower(text)
	// Prefer JSON
	if i := strings.Index(lower, "{"); i >= 0 {
		if j := strings.LastIndex(lower, "}"); j > i {
			var obj struct {
				Skill string `json:"skill"`
			}
			if err := json.Unmarshal([]byte(text[i:j+1]), &obj); err == nil {
				switch strings.ToLower(strings.TrimSpace(obj.Skill)) {
				case "image":
					return SkillImage
				case "video":
					return SkillVideo
				case "chat":
					return SkillChat
				}
			}
		}
	}
	switch {
	case strings.Contains(lower, `"image"`) || strings.HasPrefix(lower, "image") || lower == "image":
		return SkillImage
	case strings.Contains(lower, `"video"`) || strings.HasPrefix(lower, "video") || lower == "video":
		return SkillVideo
	case strings.Contains(lower, `"chat"`) || strings.HasPrefix(lower, "chat") || lower == "chat":
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
