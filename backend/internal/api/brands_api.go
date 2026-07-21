package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/textmodel"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// listBrands returns the user's saved brands (Business DNA profiles).
func (s *Server) listBrands(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	brands, err := s.DB.ListBrands(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"list brands"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"brands": brands})
}

func (s *Server) getBrand(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	brandID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil || userID == uuid.Nil {
		http.Error(w, `{"error":"invalid"}`, http.StatusBadRequest)
		return
	}
	b, err := s.DB.GetBrand(r.Context(), brandID, userID)
	if err != nil || b == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

// updateBrand lets the user edit the saved DNA (colors, tone, taglines...).
func (s *Server) updateBrand(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	brandID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil || userID == uuid.Nil {
		http.Error(w, `{"error":"invalid"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		DNA businessDNA `json:"dna"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.DNA.BrandName) == "" {
		http.Error(w, `{"error":"brand_name required"}`, http.StatusBadRequest)
		return
	}
	normalizeDNAColors(&req.DNA)
	if err := s.DB.UpdateBrandDNA(r.Context(), brandID, userID, req.DNA.BrandName, req.DNA); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "1"})
}

func (s *Server) deleteBrand(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	brandID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil || userID == uuid.Nil {
		http.Error(w, `{"error":"invalid"}`, http.StatusBadRequest)
		return
	}
	if err := s.DB.DeleteBrand(r.Context(), brandID, userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "1"})
}

type campaignAssetPlan struct {
	Title  string          `json:"title"`
	Assets []brandingAsset `json:"assets"`
}

// createBrandCampaign generates a themed campaign (e.g. "summer sale") using a saved brand's DNA.
func (s *Server) createBrandCampaign(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	brandID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil || userID == uuid.Nil {
		http.Error(w, `{"error":"invalid"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	theme := strings.TrimSpace(req.Prompt)
	if theme == "" {
		http.Error(w, `{"error":"prompt required"}`, http.StatusBadRequest)
		return
	}
	if len([]rune(theme)) > 500 {
		theme = string([]rune(theme)[:500])
	}
	brand, err := s.DB.GetBrand(r.Context(), brandID, userID)
	if err != nil || brand == nil {
		http.Error(w, `{"error":"brand not found"}`, http.StatusNotFound)
		return
	}
	var dna businessDNA
	if err := json.Unmarshal(brand.DNA, &dna); err != nil {
		http.Error(w, `{"error":"corrupt dna"}`, http.StatusInternalServerError)
		return
	}
	normalizeDNAColors(&dna)

	ctx := r.Context()
	plan := s.buildCampaignPlan(ctx, &dna, theme)
	if plan == nil {
		plan = fallbackCampaignPlan(&dna, theme)
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

	assets := plan.Assets
	if len(assets) > 6 {
		assets = assets[:6]
	}
	for _, a := range assets {
		prompt := strings.TrimSpace(a.Prompt)
		if prompt == "" {
			continue
		}
		label := strings.TrimSpace(a.Label)
		if label == "" {
			label = "Campaign asset"
		}
		ar := strings.TrimSpace(a.AspectRatio)
		if ar == "" {
			ar = "1:1"
		}
		input := map[string]interface{}{
			"prompt":       prompt,
			"aspect_ratio": ar,
			"size":         "2K",
			"max_images":   1,
			"branding":     true,
		}
		jid, err := s.DB.CreateJob(ctx, userID, "image", input, nil)
		if err != nil {
			continue
		}
		task, err := queue.NewImageTask(jid)
		if err != nil || task == nil {
			_ = s.DB.UpdateJobStatus(ctx, jid, "failed", nil, "enqueue failed", 0, "")
			continue
		}
		if _, err := s.Asynq.Enqueue(task); err != nil {
			_ = s.DB.UpdateJobStatus(ctx, jid, "failed", nil, "enqueue failed", 0, "")
			continue
		}
		s.recordUserProfile(userID, "image", nil)
		created = append(created, jobRef{
			JobID: jid.String(), Type: "image", Label: label, AspectRatio: ar,
			Prompt: prompt, Caption: strings.TrimSpace(a.Caption), Hashtags: strings.TrimSpace(a.Hashtags),
		})
	}

	s.invalidateContentCache(ctx, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"title": plan.Title,
		"jobs":  created,
	})
}

type calendarItem struct {
	Day         int    `json:"day"`
	Platform    string `json:"platform"`
	Format      string `json:"format"`
	Idea        string `json:"idea"`
	Caption     string `json:"caption"`
	Hashtags    string `json:"hashtags,omitempty"`
	ImagePrompt string `json:"image_prompt,omitempty"`
}

type contentCalendar struct {
	Title string         `json:"title"`
	Items []calendarItem `json:"items"`
}

// createBrandCalendar generates a 30-day content calendar from a saved brand's DNA.
func (s *Server) createBrandCalendar(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	brandID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil || userID == uuid.Nil {
		http.Error(w, `{"error":"invalid"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Focus string `json:"focus,omitempty"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	focus := strings.TrimSpace(req.Focus)
	if len([]rune(focus)) > 300 {
		focus = string([]rune(focus)[:300])
	}
	brand, err := s.DB.GetBrand(r.Context(), brandID, userID)
	if err != nil || brand == nil {
		http.Error(w, `{"error":"brand not found"}`, http.StatusNotFound)
		return
	}
	var dna businessDNA
	if err := json.Unmarshal(brand.DNA, &dna); err != nil {
		http.Error(w, `{"error":"corrupt dna"}`, http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	cal := s.buildContentCalendar(ctx, &dna, focus)
	if cal == nil {
		http.Error(w, `{"error":"calendar generation failed, try again"}`, http.StatusBadGateway)
		return
	}

	// Save a readable copy in My Files.
	var b strings.Builder
	b.WriteString("# " + dna.BrandName + " — " + cal.Title + "\n\n")
	for _, it := range cal.Items {
		b.WriteString(fmt.Sprintf("## Day %d — %s (%s)\n", it.Day, it.Platform, it.Format))
		b.WriteString(it.Idea + "\n\n")
		if it.Caption != "" {
			b.WriteString(it.Caption + "\n")
		}
		if it.Hashtags != "" {
			b.WriteString(it.Hashtags + "\n")
		}
		b.WriteString("\n")
	}
	b.WriteString("Generated with Flipo5 1 Click Branding.\n")
	_, _ = s.DB.CreateUserFile(ctx, userID, dna.BrandName+" — Content Calendar", b.String(), "text")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cal)
}

func (s *Server) buildContentCalendar(ctx context.Context, dna *businessDNA, focus string) *contentCalendar {
	if s.Repl == nil || strings.TrimSpace(s.ModelText) == "" {
		return nil
	}
	dnaJSON, _ := json.Marshal(dna)
	system := `You are a social media strategist. Return ONLY valid JSON (no markdown):
{"title":"calendar name","items":[{"day":1,"platform":"Instagram|Facebook|LinkedIn|TikTok","format":"post|story|reel|carousel","idea":"short content idea","caption":"ready-to-post caption in brand voice","hashtags":"#...","image_prompt":"on-brand image generation prompt for this post"}]}
Create a 30-day content calendar (30 items, day 1-30). Mix platforms and formats sensibly (3-5 posts/week feel, but fill all 30 days).
Vary content pillars: product highlights, behind the scenes, tips/education, social proof, promos, engagement questions.
Use the brand's exact colors, tone, and voice from the Business DNA. Captions in the brand's language with hooks and CTAs.`
	user := "Business DNA:\n" + string(dnaJSON)
	if focus != "" {
		user += "\n\nMonthly focus: " + focus
	}
	runCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	input := textmodel.BuildInput(s.ModelText, system, user, nil, 16384)
	out, err := s.Repl.Run(runCtx, s.ModelText, input)
	if err != nil {
		return nil
	}
	raw := strings.TrimSpace(brandingExtractText(out))
	if i := strings.Index(raw, "{"); i >= 0 {
		raw = raw[i:]
	}
	if j := strings.LastIndex(raw, "}"); j >= 0 {
		raw = raw[:j+1]
	}
	var cal contentCalendar
	if err := json.Unmarshal([]byte(raw), &cal); err != nil || len(cal.Items) == 0 {
		return nil
	}
	if cal.Title == "" {
		cal.Title = "30-day content calendar"
	}
	if len(cal.Items) > 31 {
		cal.Items = cal.Items[:31]
	}
	return &cal
}

func (s *Server) buildCampaignPlan(ctx context.Context, dna *businessDNA, theme string) *campaignAssetPlan {
	if s.Repl == nil || strings.TrimSpace(s.ModelText) == "" {
		return nil
	}
	dnaJSON, _ := json.Marshal(dna)
	system := `You are a marketing campaign designer. Return ONLY valid JSON (no markdown):
{"title":"campaign name","assets":[{"label":"","type":"image","prompt":"detailed on-brand image generation prompt","aspect_ratio":"1:1|4:5|16:9|9:16","caption":"ready-to-post caption","hashtags":"#..."}]}
Create 4-5 assets for the campaign: Instagram post (1:1), story (9:16), ad banner (16:9), plus 1-2 extra fitting the theme.
Use the brand's exact colors, tone, and voice from the provided Business DNA in every prompt. Captions in the campaign's language, brand voice, with a hook and CTA.`
	user := "Business DNA:\n" + string(dnaJSON) + "\n\nCampaign brief: " + theme
	runCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	input := textmodel.BuildInput(s.ModelText, system, user, nil, 4096)
	out, err := s.Repl.Run(runCtx, s.ModelText, input)
	if err != nil {
		return nil
	}
	raw := strings.TrimSpace(brandingExtractText(out))
	if i := strings.Index(raw, "{"); i >= 0 {
		raw = raw[i:]
	}
	if j := strings.LastIndex(raw, "}"); j >= 0 {
		raw = raw[:j+1]
	}
	var plan campaignAssetPlan
	if err := json.Unmarshal([]byte(raw), &plan); err != nil || len(plan.Assets) == 0 {
		return nil
	}
	return &plan
}

func fallbackCampaignPlan(dna *businessDNA, theme string) *campaignAssetPlan {
	c := dna.Colors
	base := fmt.Sprintf("for %s, campaign: %s, brand colors %s %s %s, %s style", dna.BrandName, theme, c.Primary, c.Secondary, c.Accent, dna.Tone)
	return &campaignAssetPlan{
		Title: theme,
		Assets: []brandingAsset{
			{Label: "Instagram post", Type: "image", AspectRatio: "1:1", Prompt: "Instagram square campaign visual " + base},
			{Label: "Story", Type: "image", AspectRatio: "9:16", Prompt: "Vertical story campaign visual " + base},
			{Label: "Ad banner", Type: "image", AspectRatio: "16:9", Prompt: "Wide ad banner " + base},
			{Label: "Promo visual", Type: "image", AspectRatio: "4:5", Prompt: "Eye-catching promo visual " + base},
		},
	}
}

var htmlTagRe = regexp.MustCompile(`<[^>]+>`)
var htmlScriptRe = regexp.MustCompile(`(?is)<(script|style|noscript|svg)[^>]*>.*?</(script|style|noscript|svg)>`)
var wsRe = regexp.MustCompile(`\s+`)

// fetchWebsiteText downloads a public website and extracts readable text for DNA building.
func fetchWebsiteText(ctx context.Context, rawURL string) string {
	u := strings.TrimSpace(rawURL)
	if u == "" {
		return ""
	}
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		u = "https://" + u
	}
	client := &http.Client{
		Timeout: 12 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				host, _, err := net.SplitHostPort(addr)
				if err != nil {
					return nil, err
				}
				ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil {
					return nil, err
				}
				for _, ip := range ips {
					if ip.IP.IsLoopback() || ip.IP.IsPrivate() || ip.IP.IsLinkLocalUnicast() || ip.IP.IsUnspecified() {
						return nil, fmt.Errorf("blocked address")
					}
				}
				var d net.Dialer
				return d.DialContext(ctx, network, addr)
			},
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Flipo5Bot/1.0; branding)")
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return ""
	}
	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.Contains(ct, "text/html") && !strings.Contains(ct, "text/plain") {
		return ""
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	html := string(body)

	var title, metaDesc string
	if m := regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`).FindStringSubmatch(html); len(m) > 1 {
		title = strings.TrimSpace(m[1])
	}
	if m := regexp.MustCompile(`(?is)<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)`).FindStringSubmatch(html); len(m) > 1 {
		metaDesc = strings.TrimSpace(m[1])
	}
	text := htmlScriptRe.ReplaceAllString(html, " ")
	text = htmlTagRe.ReplaceAllString(text, " ")
	text = wsRe.ReplaceAllString(text, " ")
	text = strings.TrimSpace(text)
	if len([]rune(text)) > 6000 {
		text = string([]rune(text)[:6000])
	}
	var b strings.Builder
	if title != "" {
		b.WriteString("Website title: " + title + "\n")
	}
	if metaDesc != "" {
		b.WriteString("Meta description: " + metaDesc + "\n")
	}
	b.WriteString("Website content:\n" + text)
	return b.String()
}
