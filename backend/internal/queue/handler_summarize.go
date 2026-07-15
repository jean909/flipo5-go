package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"flipo5/backend/internal/textmodel"

	"github.com/hibiken/asynq"
)

func (h *Handlers) SummarizeThreadHandler(ctx context.Context, t *asynq.Task) error {
	var p SummarizeThreadPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	thread, err := h.DB.GetThreadByID(ctx, p.ThreadID)
	if err != nil || thread == nil {
		return nil
	}
	// ListJobsByThread requires userID - get from thread
	jobs, err := h.DB.ListJobsByThread(ctx, p.ThreadID, thread.UserID)
	if err != nil || len(jobs) == 0 {
		return nil
	}
	// Build short context from last 1–2 chat exchanges (prompt + output)
	var parts []string
	n := len(jobs)
	if n > 4 {
		n = 4
	}
	for i := len(jobs) - n; i < len(jobs); i++ {
		j := jobs[i]
		if j.Type != "chat" {
			continue
		}
		var input map[string]interface{}
		if len(j.Input) > 0 {
			_ = json.Unmarshal(j.Input, &input)
		}
		if p, _ := input["prompt"].(string); p != "" {
			if len(p) > 200 {
				p = p[:200] + "..."
			}
			parts = append(parts, "User: "+p)
		}
		if len(j.Output) > 0 {
			var out map[string]interface{}
			_ = json.Unmarshal(j.Output, &out)
			if s, _ := out["output"].(string); s != "" {
				if len(s) > 300 {
					s = s[:300] + "..."
				}
				parts = append(parts, "Assistant: "+s)
			}
		}
	}
	if len(parts) == 0 {
		return nil
	}
	prompt := "Summarize this conversation in at most 6-8 words, title case, no quotes. Use the topic/subject (e.g. 'Physics formula', 'Image idea'), not generic words like User, AI, Greeting, Hello:\n\n" + strings.Join(parts, "\n\n")
	if h.Repl == nil || h.Cfg.ModelText == "" {
		return nil
	}
	out, err := h.Repl.RunWithFallback(ctx, h.Cfg.ModelText, h.textFallbacks(), textmodel.BuildInput(h.Cfg.ModelText, "", prompt, nil, 256))
	if err != nil {
		return err
	}
	normalized := normalizeChatOutput(out)
	var title string
	if m, ok := normalized.(map[string]interface{}); ok {
		if v, ok := m["output"].(string); ok && len(strings.TrimSpace(v)) > 0 {
			title = strings.TrimSpace(v)
			if len(title) > 80 {
				title = title[:80]
			}
		}
	}
	if title != "" {
		_ = h.DB.UpdateThreadTitle(ctx, p.ThreadID, title)
	}
	return nil
}

// fetchPageText fetches a URL and returns stripped plain text (max ~6000 chars).
func fetchPageText(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Flipo5SEO/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d from %s", resp.StatusCode, rawURL)
	}
	// Read at most 1 MB
	body := make([]byte, 0, 1024*1024)
	buf := make([]byte, 4096)
	read := 0
	for read < 1024*1024 {
		n, readErr := resp.Body.Read(buf)
		body = append(body, buf[:n]...)
		read += n
		if readErr != nil {
			break
		}
	}
	html := string(body)
	// Remove <script> and <style> blocks
	for _, tag := range []string{"script", "style", "noscript", "nav", "footer", "header"} {
		for {
			open := strings.Index(strings.ToLower(html), "<"+tag)
			if open < 0 {
				break
			}
			close := strings.Index(strings.ToLower(html[open:]), "</"+tag+">")
			if close < 0 {
				break
			}
			html = html[:open] + " " + html[open+close+len("</"+tag+">"):]
		}
	}
	// Strip remaining HTML tags
	inTag := false
	var sb strings.Builder
	for _, ch := range html {
		if ch == '<' {
			inTag = true
			sb.WriteRune(' ')
			continue
		}
		if ch == '>' {
			inTag = false
			continue
		}
		if !inTag {
			sb.WriteRune(ch)
		}
	}
	text := sb.String()
	// Decode common entities
	replacer := strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`,
		"&apos;", "'", "&#39;", "'", "&nbsp;", " ", "&hellip;", "...",
	)
	text = replacer.Replace(text)
	// Normalize whitespace
	var clean strings.Builder
	prevSpace := false
	for _, ch := range text {
		isSpace := ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
		if isSpace {
			if !prevSpace {
				clean.WriteRune('\n')
			}
			prevSpace = true
		} else {
			clean.WriteRune(ch)
			prevSpace = false
		}
	}
	result := strings.TrimSpace(clean.String())
	// Limit to ~6000 chars for AI prompt
	if len(result) > 6000 {
		result = result[:6000] + "…"
	}
	return result, nil
}
