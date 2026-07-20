package api

import (
	"strings"
	"unicode/utf8"
)

// titleFromPrompt builds a short sidebar title from the first user prompt.
func titleFromPrompt(prompt string) string {
	s := strings.Join(strings.Fields(strings.TrimSpace(prompt)), " ")
	if s == "" || s == " " {
		return ""
	}
	const maxRunes = 56
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	cut := runes[:maxRunes]
	// Prefer breaking on a space near the end.
	if i := strings.LastIndex(string(cut), " "); i > 20 {
		return strings.TrimSpace(string(cut[:i])) + "…"
	}
	return string(cut) + "…"
}
