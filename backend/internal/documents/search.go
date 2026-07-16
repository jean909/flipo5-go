package documents

import (
	"strings"
	"unicode"
)

type SearchHit struct {
	FileName string  `json:"file_name"`
	Snippet  string  `json:"snippet"`
	Score    float64 `json:"score"`
}

// SearchText ranks document chunks by simple term overlap (lightweight RAG).
func SearchText(query string, docs []struct{ Name, Text string }) []SearchHit {
	terms := tokenize(query)
	if len(terms) == 0 {
		return nil
	}
	var hits []SearchHit
	for _, d := range docs {
		text := strings.TrimSpace(d.Text)
		if text == "" {
			continue
		}
		chunks := chunkText(text, 1200)
		for _, chunk := range chunks {
			score := scoreOverlap(terms, chunk)
			if score <= 0 {
				continue
			}
			hits = append(hits, SearchHit{
				FileName: d.Name,
				Snippet:  excerpt(chunk, 400),
				Score:    score,
			})
		}
	}
	// sort desc by score
	for i := 0; i < len(hits); i++ {
		for j := i + 1; j < len(hits); j++ {
			if hits[j].Score > hits[i].Score {
				hits[i], hits[j] = hits[j], hits[i]
			}
		}
	}
	if len(hits) > 8 {
		hits = hits[:8]
	}
	return hits
}

func tokenize(s string) []string {
	s = strings.ToLower(s)
	var terms []string
	var b strings.Builder
	flush := func() {
		if b.Len() >= 2 {
			terms = append(terms, b.String())
		}
		b.Reset()
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return terms
}

func scoreOverlap(terms []string, text string) float64 {
	lower := strings.ToLower(text)
	var score float64
	for _, t := range terms {
		if strings.Contains(lower, t) {
			score += 1
		}
	}
	return score
}

func chunkText(text string, size int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if len(text) <= size {
		return []string{text}
	}
	var out []string
	for len(text) > 0 {
		if len(text) <= size {
			out = append(out, strings.TrimSpace(text))
			break
		}
		cut := text[:size]
		if idx := strings.LastIndex(cut, "\n\n"); idx > size/2 {
			cut = cut[:idx]
		}
		out = append(out, strings.TrimSpace(cut))
		text = strings.TrimSpace(text[len(cut):])
	}
	return out
}

func excerpt(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
