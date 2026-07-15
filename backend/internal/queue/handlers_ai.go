package queue

import "strings"

func (h *Handlers) textFallbacks() []string {
	fb := strings.TrimSpace(h.Cfg.ModelTextFallback)
	if fb == "" {
		return nil
	}
	return []string{fb}
}
