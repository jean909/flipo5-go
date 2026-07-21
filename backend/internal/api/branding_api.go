package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/textmodel"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

// createBranding builds a Pomelli-style "Business DNA" from a description + photos,
// then enqueues logo/image jobs for a ready-to-use branding pack.
func (s *Server) createBranding(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var req struct {
		Description string   `json:"description"`
		BrandName   string   `json:"brand_name,omitempty"`
		ImageURLs   []string `json:"image_urls,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	desc := strings.TrimSpace(req.Description)
	if desc == "" {
		http.Error(w, `{"error":"description required"}`, http.StatusBadRequest)
		return
	}
	if len([]rune(desc)) > 4000 {
		desc = string([]rune(desc)[:4000])
	}
	brandName := strings.TrimSpace(req.BrandName)
	if len([]rune(brandName)) > 80 {
		brandName = string([]rune(brandName)[:80])
	}

	ctx := r.Context()
	resolve := func(u string) string {
		u = strings.TrimSpace(u)
		if u != "" && strings.HasPrefix(u, "uploads/") && s.Store != nil {
			return s.Store.URL(u)
		}
		return u
	}
	var refs []string
	for _, u := range req.ImageURLs {
		if ru := resolve(u); ru != "" {
			refs = append(refs, ru)
		}
		if len(refs) >= 6 {
			break
		}
	}

	dna := s.buildBusinessDNA(ctx, brandName, desc, refs)
	if dna == nil {
		dna = fallbackBusinessDNA(brandName, desc)
	}

	type jobRef struct {
		JobID       string `json:"job_id"`
		Type        string `json:"type"`
		Label       string `json:"label"`
		AspectRatio string `json:"aspect_ratio,omitempty"`
		Prompt      string `json:"prompt,omitempty"`
		Caption     string `json:"caption,omitempty"`
		Hashtags    string `json:"hashtags,omitempty"`
	}
	var created []jobRef

	enqueue := func(jobType string, input map[string]interface{}, a brandingAsset, label string, newTask func(uuid.UUID) (*asynq.Task, error)) {
		jid, err := s.DB.CreateJob(ctx, userID, jobType, input, nil)
		if err != nil {
			return
		}
		task, err := newTask(jid)
		if err != nil || task == nil {
			_ = s.DB.UpdateJobStatus(ctx, jid, "failed", nil, "enqueue failed", 0, "")
			return
		}
		if _, err := s.Asynq.Enqueue(task); err != nil {
			_ = s.DB.UpdateJobStatus(ctx, jid, "failed", nil, "enqueue failed", 0, "")
			return
		}
		s.recordUserProfile(userID, jobType, nil)
		ar, _ := input["aspect_ratio"].(string)
		created = append(created, jobRef{
			JobID: jid.String(), Type: jobType, Label: label, AspectRatio: ar,
			Prompt: a.Prompt, Caption: strings.TrimSpace(a.Caption), Hashtags: strings.TrimSpace(a.Hashtags),
		})
	}

	assets := dna.Assets
	if len(assets) == 0 {
		assets = defaultBrandingAssets(dna)
	}
	if len(assets) > 9 {
		assets = assets[:9]
	}

	for _, a := range assets {
		label := strings.TrimSpace(a.Label)
		prompt := strings.TrimSpace(a.Prompt)
		if prompt == "" {
			continue
		}
		if label == "" {
			label = "Brand asset"
		}
		ar := strings.TrimSpace(a.AspectRatio)
		if ar == "" {
			ar = "1:1"
		}
		kind := strings.ToLower(strings.TrimSpace(a.Type))
		if kind == "logo" {
			input := map[string]interface{}{
				"prompt":        prompt,
				"logo_text":     dna.BrandName,
				"logo_type":     "wordmark + icon",
				"style":         dna.Tone,
				"primary_color": dna.Colors.Primary,
				"aspect_ratio":  ar,
				"output_format": "png",
			}
			if dna.Colors.Secondary != "" {
				input["secondary_color"] = dna.Colors.Secondary
			}
			enqueue("logo", input, a, label, queue.NewLogoTask)
			continue
		}
		input := map[string]interface{}{
			"prompt":       prompt,
			"aspect_ratio": ar,
			"size":         "2K",
			"max_images":   1,
			"branding":     true,
		}
		if len(refs) > 0 {
			input["image_input"] = refs
		}
		enqueue("image", input, a, label, queue.NewImageTask)
	}

	brief := formatBrandBrief(dna)
	fileName := "Brand Book"
	if dna.BrandName != "" {
		fileName = dna.BrandName + " — Brand Book"
	}
	_, _ = s.DB.CreateUserFile(ctx, userID, fileName, brief, "text")

	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"dna":  dna,
		"jobs": created,
	})
}

type brandingColors struct {
	Primary   string `json:"primary"`
	Secondary string `json:"secondary"`
	Accent    string `json:"accent"`
}

type brandingAsset struct {
	Label       string `json:"label"`
	Type        string `json:"type"`
	Prompt      string `json:"prompt"`
	AspectRatio string `json:"aspect_ratio"`
	Caption     string `json:"caption,omitempty"`
	Hashtags    string `json:"hashtags,omitempty"`
}

type brandingCampaign struct {
	Title   string `json:"title"`
	Concept string `json:"concept"`
	CTA     string `json:"cta,omitempty"`
}

type businessDNA struct {
	BrandName       string             `json:"brand_name"`
	Tagline         string             `json:"tagline"`
	TaglineVariants []string           `json:"tagline_variants,omitempty"`
	Tone            string             `json:"tone"`
	Voice           string             `json:"voice"`
	Audience        string             `json:"audience"`
	Colors          brandingColors     `json:"colors"`
	Fonts           string             `json:"fonts"`
	Campaigns       []brandingCampaign `json:"campaigns,omitempty"`
	Assets          []brandingAsset    `json:"assets"`
}

func (s *Server) buildBusinessDNA(ctx context.Context, brandName, desc string, imageURLs []string) *businessDNA {
	if s.Repl == nil || strings.TrimSpace(s.ModelText) == "" {
		return nil
	}
	system := `You are a world-class brand strategist (like Google Pomelli). Return ONLY valid JSON (no markdown) with this exact shape:
{"brand_name":"","tagline":"","tagline_variants":["",""],"tone":"","voice":"","audience":"","colors":{"primary":"#hex","secondary":"#hex","accent":"#hex"},"fonts":"","campaigns":[{"title":"","concept":"","cta":""}],"assets":[{"label":"","type":"logo|image","prompt":"detailed image generation prompt","aspect_ratio":"1:1|4:5|16:9|9:16|3:4","caption":"ready-to-post social caption in the brand voice","hashtags":"#tag1 #tag2 ..."}]}
Rules:
- tagline_variants: 3 alternative taglines (different angles: emotional, functional, bold).
- campaigns: 3 concrete marketing campaign ideas (title, 1-2 sentence concept, call to action).
- assets: exactly 8: 1 logo (type logo, 1:1), 1 Instagram post (1:1), 1 story/reel cover (9:16), 1 Facebook/LinkedIn cover (16:9), 1 product/hero shot (4:5), 1 square ad (1:1), 1 poster/flyer (3:4), 1 business card design (16:9).
- Every image asset gets a caption (ready to post, brand voice, with a hook) and 5-8 hashtags. Logo caption can be a launch announcement.
- Prompts must be specific, on-brand, ready for an image model; include the brand colors, style and mood in each prompt.
- Match the language of captions to the language of the business description.`

	user := "Business description:\n" + desc
	if brandName != "" {
		user = "Brand name (preferred): " + brandName + "\n\n" + user
	}
	if len(imageURLs) > 0 {
		user += fmt.Sprintf("\n\n%d reference photo(s) are attached — extract visual style from them.", len(imageURLs))
	}

	runCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	input := textmodel.BuildInput(s.ModelText, system, user, imageURLs, 8192)
	out, err := s.Repl.Run(runCtx, s.ModelText, input)
	if err != nil {
		return nil
	}
	raw := brandingExtractText(out)
	raw = strings.TrimSpace(raw)
	if i := strings.Index(raw, "{"); i >= 0 {
		raw = raw[i:]
	}
	if j := strings.LastIndex(raw, "}"); j >= 0 {
		raw = raw[:j+1]
	}
	var dna businessDNA
	if err := json.Unmarshal([]byte(raw), &dna); err != nil {
		return nil
	}
	if strings.TrimSpace(dna.BrandName) == "" {
		dna.BrandName = brandName
	}
	if dna.BrandName == "" {
		dna.BrandName = "My Brand"
	}
	normalizeDNAColors(&dna)
	return &dna
}

func brandingExtractText(out repgo.PredictionOutput) string {
	if out == nil {
		return ""
	}
	if s, ok := out.(string); ok {
		return s
	}
	if arr, ok := out.([]interface{}); ok {
		var parts []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "")
	}
	b, _ := json.Marshal(out)
	var m map[string]interface{}
	if json.Unmarshal(b, &m) == nil {
		if s, ok := m["output"].(string); ok {
			return s
		}
		if arr, ok := m["output"].([]interface{}); ok {
			var parts []string
			for _, v := range arr {
				if s, ok := v.(string); ok {
					parts = append(parts, s)
				}
			}
			return strings.Join(parts, "")
		}
	}
	return string(b)
}

func normalizeDNAColors(dna *businessDNA) {
	if dna.Colors.Primary == "" {
		dna.Colors.Primary = "#1a1a1a"
	}
	if dna.Colors.Secondary == "" {
		dna.Colors.Secondary = "#f5f5f5"
	}
	if dna.Colors.Accent == "" {
		dna.Colors.Accent = "#c45c26"
	}
}

func fallbackBusinessDNA(brandName, desc string) *businessDNA {
	name := brandName
	if name == "" {
		words := strings.Fields(desc)
		if len(words) > 0 {
			name = words[0]
			if len(words) > 1 {
				name = words[0] + " " + words[1]
			}
		}
		if name == "" {
			name = "My Brand"
		}
	}
	dna := &businessDNA{
		BrandName: name,
		Tagline:   "Built for people who care about quality",
		Tone:      "modern, warm, confident",
		Voice:     "Clear, friendly, professional. Short sentences.",
		Audience:  "Customers discovering the brand online",
		Colors:    brandingColors{Primary: "#1a1a1a", Secondary: "#f4f1ea", Accent: "#c45c26"},
		Fonts:     "Clean sans for UI, distinctive display for headlines",
	}
	dna.Assets = defaultBrandingAssets(dna)
	return dna
}

func defaultBrandingAssets(dna *businessDNA) []brandingAsset {
	name := dna.BrandName
	tone := dna.Tone
	c := dna.Colors
	return []brandingAsset{
		{Label: "Logo", Type: "logo", AspectRatio: "1:1", Prompt: fmt.Sprintf("Minimal professional logo for %s, %s, colors %s and %s, clean vector look, white or transparent background", name, tone, c.Primary, c.Accent)},
		{Label: "Instagram post", Type: "image", AspectRatio: "1:1", Prompt: fmt.Sprintf("On-brand Instagram square post for %s, %s aesthetic, palette %s %s %s, lifestyle product photography, space for short headline", name, tone, c.Primary, c.Secondary, c.Accent)},
		{Label: "Story / Reel cover", Type: "image", AspectRatio: "9:16", Prompt: fmt.Sprintf("Vertical story cover for %s, %s, bold but elegant, brand colors %s and %s, mobile-first composition", name, tone, c.Primary, c.Accent)},
		{Label: "Cover / banner", Type: "image", AspectRatio: "16:9", Prompt: fmt.Sprintf("Wide brand banner for %s website or LinkedIn, %s, colors %s %s, premium photography, subtle product presence", name, tone, c.Primary, c.Secondary)},
		{Label: "Hero / product", Type: "image", AspectRatio: "4:5", Prompt: fmt.Sprintf("Hero product or brand lifestyle image for %s, %s, studio or natural light, palette %s %s, e-commerce ready", name, tone, c.Primary, c.Accent)},
		{Label: "Ad square", Type: "image", AspectRatio: "1:1", Prompt: fmt.Sprintf("Scroll-stopping square ad creative for %s, %s, clear focal product, brand colors %s %s, modern marketing layout", name, tone, c.Primary, c.Accent)},
		{Label: "Poster / flyer", Type: "image", AspectRatio: "3:4", Prompt: fmt.Sprintf("Print-ready poster or flyer design for %s, %s, bold typography space, brand colors %s %s %s, striking composition", name, tone, c.Primary, c.Secondary, c.Accent)},
		{Label: "Business card", Type: "image", AspectRatio: "16:9", Prompt: fmt.Sprintf("Elegant business card design mockup for %s, %s, brand colors %s and %s, clean layout with logo placement, premium paper look", name, tone, c.Primary, c.Accent)},
	}
}

func formatBrandBrief(dna *businessDNA) string {
	var b strings.Builder
	b.WriteString("# " + dna.BrandName + " — Brand Book\n\n")
	if dna.Tagline != "" {
		b.WriteString("**Tagline:** " + dna.Tagline + "\n\n")
	}
	if len(dna.TaglineVariants) > 0 {
		b.WriteString("**Tagline alternatives:**\n")
		for _, v := range dna.TaglineVariants {
			if strings.TrimSpace(v) != "" {
				b.WriteString("- " + v + "\n")
			}
		}
		b.WriteString("\n")
	}
	b.WriteString("**Tone:** " + dna.Tone + "\n\n")
	b.WriteString("**Voice:** " + dna.Voice + "\n\n")
	b.WriteString("**Audience:** " + dna.Audience + "\n\n")
	b.WriteString("**Colors:**\n")
	b.WriteString("- Primary: " + dna.Colors.Primary + "\n")
	b.WriteString("- Secondary: " + dna.Colors.Secondary + "\n")
	b.WriteString("- Accent: " + dna.Colors.Accent + "\n\n")
	if dna.Fonts != "" {
		b.WriteString("**Typography:** " + dna.Fonts + "\n\n")
	}
	if len(dna.Campaigns) > 0 {
		b.WriteString("## Campaign ideas\n\n")
		for i, c := range dna.Campaigns {
			if strings.TrimSpace(c.Title) == "" {
				continue
			}
			b.WriteString(fmt.Sprintf("%d. **%s** — %s", i+1, c.Title, c.Concept))
			if strings.TrimSpace(c.CTA) != "" {
				b.WriteString(" CTA: " + c.CTA)
			}
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}
	captions := false
	for _, a := range dna.Assets {
		if strings.TrimSpace(a.Caption) != "" {
			captions = true
			break
		}
	}
	if captions {
		b.WriteString("## Ready-to-post captions\n\n")
		for _, a := range dna.Assets {
			if strings.TrimSpace(a.Caption) == "" {
				continue
			}
			b.WriteString("### " + a.Label + "\n")
			b.WriteString(a.Caption + "\n")
			if strings.TrimSpace(a.Hashtags) != "" {
				b.WriteString(a.Hashtags + "\n")
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("Generated with Flipo5 1 Click Branding.\n")
	return b.String()
}
