package queue

import (
	"strings"

	"flipo5/backend/internal/intent"
)

// SplitSkillHeader reads the backend-only first line from a chat model reply.
// Expected formats (case-insensitive):
//
//	[[skill:chat]]
//	[[skill:image]]
//	[[skill:video]]
//	[[skill:image_edit]]
//
// Returns the skill and the user-visible body (first line removed).
func SplitSkillHeader(raw string) (intent.Skill, string) {
	s := strings.TrimLeft(raw, "\r\n \t")
	if s == "" {
		return intent.SkillChat, ""
	}
	line, rest, found := strings.Cut(s, "\n")
	if !found {
		// Whole reply is one line — try parse; if it's only a skill tag, body empty.
		if sk, ok := parseSkillTag(line); ok {
			return sk, ""
		}
		return intent.SkillChat, strings.TrimSpace(raw)
	}
	if sk, ok := parseSkillTag(line); ok {
		return sk, strings.TrimLeft(rest, "\r\n")
	}
	// No valid tag — show everything (including the first line).
	return intent.SkillChat, strings.TrimSpace(raw)
}

func parseSkillTag(line string) (intent.Skill, bool) {
	t := strings.ToLower(strings.TrimSpace(line))
	t = strings.TrimPrefix(t, "`")
	t = strings.TrimSuffix(t, "`")
	t = strings.TrimSpace(t)
	// [[skill:image]] or [skill:image] or SKILL:image
	t = strings.TrimPrefix(t, "[[")
	t = strings.TrimSuffix(t, "]]")
	t = strings.TrimPrefix(t, "[")
	t = strings.TrimSuffix(t, "]")
	t = strings.TrimSpace(t)
	t = strings.TrimPrefix(t, "skill:")
	t = strings.TrimPrefix(t, "skill =")
	t = strings.TrimPrefix(t, "skill=")
	t = strings.TrimSpace(t)
	switch t {
	case "chat":
		return intent.SkillChat, true
	case "image", "image_creation", "image-creation":
		return intent.SkillImage, true
	case "video", "video_creation", "video-creation":
		return intent.SkillVideo, true
	case "image_edit", "image-edit", "edit", "image_editing":
		return intent.SkillImageEdit, true
	default:
		return "", false
	}
}

// skillStreamFilter buffers early tokens until the skill header line is known,
// so the frontend never sees [[skill:…]].
type skillStreamFilter struct {
	headerDone bool
	buf        strings.Builder
	skill      intent.Skill
	visible    strings.Builder
}

func newSkillStreamFilter() *skillStreamFilter {
	return &skillStreamFilter{skill: intent.SkillChat}
}

func (f *skillStreamFilter) Push(chunk string) (visibleChunk string) {
	if f.headerDone {
		f.visible.WriteString(chunk)
		return chunk
	}
	f.buf.WriteString(chunk)
	buf := f.buf.String()
	if idx := strings.IndexByte(buf, '\n'); idx >= 0 {
		line := buf[:idx]
		rest := buf[idx+1:]
		if sk, ok := parseSkillTag(line); ok {
			f.skill = sk
		} else {
			// First line wasn't a tag — include it in visible output.
			f.skill = intent.SkillChat
			rest = buf
		}
		f.headerDone = true
		f.buf.Reset()
		f.visible.WriteString(rest)
		return rest
	}
	// Safety: if model forgot the newline, don't block the UI forever.
	trimmed := strings.TrimSpace(buf)
	if len(buf) > 96 && !strings.HasPrefix(trimmed, "[[skill:") && !strings.HasPrefix(trimmed, "[skill:") && !strings.HasPrefix(strings.ToLower(trimmed), "skill:") {
		f.headerDone = true
		f.skill = intent.SkillChat
		f.buf.Reset()
		f.visible.WriteString(buf)
		return buf
	}
	return ""
}

func (f *skillStreamFilter) Visible() string {
	if !f.headerDone && f.buf.Len() > 0 {
		// Stream ended without newline — parse whatever we have.
		sk, body := SplitSkillHeader(f.buf.String())
		f.skill = sk
		f.headerDone = true
		f.buf.Reset()
		f.visible.WriteString(body)
	}
	return f.visible.String()
}

func (f *skillStreamFilter) Skill() intent.Skill {
	if !f.headerDone {
		_ = f.Visible()
	}
	if f.skill == "" {
		return intent.SkillChat
	}
	return f.skill
}
