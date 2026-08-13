package queue

import (
	"strings"
	"testing"
)

func TestSplitSkillHeader(t *testing.T) {
	sk, body := SplitSkillHeader("[[skill:image]]\nSigur, generez acum.")
	if sk != "image" || body != "Sigur, generez acum." {
		t.Fatalf("got skill=%s body=%q", sk, body)
	}
	sk, body = SplitSkillHeader("[[skill:chat]]\nSalut!")
	if sk != "chat" || body != "Salut!" {
		t.Fatalf("got skill=%s body=%q", sk, body)
	}
	sk, body = SplitSkillHeader("Just a normal reply")
	if sk != "chat" || body != "Just a normal reply" {
		t.Fatalf("got skill=%s body=%q", sk, body)
	}
}

func TestSkillStreamFilter(t *testing.T) {
	f := newSkillStreamFilter()
	if v := f.Push("[[skill:"); v != "" {
		t.Fatalf("early leak %q", v)
	}
	if v := f.Push("image]]\nHello"); !strings.Contains(v, "Hello") {
		t.Fatalf("expected Hello, got %q", v)
	}
	if f.Skill() != "image" {
		t.Fatalf("skill=%s", f.Skill())
	}
	if f.Visible() != "Hello" {
		t.Fatalf("visible=%q", f.Visible())
	}
}
