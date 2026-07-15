package queue

import (
	"testing"
)

func TestFilenameFromURL(t *testing.T) {
	if got := filenameFromURL("https://cdn.example.com/uploads/report.pdf?token=abc"); got != "report.pdf" {
		t.Fatalf("got %q", got)
	}
	if got := filenameFromURL("uploads/foo.txt"); got != "foo.txt" {
		t.Fatalf("got %q", got)
	}
}

func TestIsLikelyImageURL(t *testing.T) {
	if !isLikelyImageURL("https://x/y/photo.JPEG") {
		t.Fatal("jpeg should match")
	}
	if isLikelyImageURL("https://x/y/report.pdf") {
		t.Fatal("pdf should not match as image")
	}
}

func TestParseJobAttachmentInput(t *testing.T) {
	jobInput := map[string]interface{}{
		"attachment_urls": []interface{}{
			"https://cdn/a.png",
			"https://cdn/doc.pdf",
		},
		"attachment_content_types": []interface{}{
			"image/png",
			"application/pdf",
		},
	}
	urls, types := parseJobAttachmentInput(jobInput)
	if len(urls) != 2 || urls[0] != "https://cdn/a.png" {
		t.Fatalf("urls = %#v", urls)
	}
	if len(types) != 2 || types[1] != "application/pdf" {
		t.Fatalf("types = %#v", types)
	}
}

func TestParseJobAttachmentInputEmpty(t *testing.T) {
	urls, types := parseJobAttachmentInput(nil)
	if len(urls) != 0 || len(types) != 0 {
		t.Fatalf("expected empty, got urls=%v types=%v", urls, types)
	}
}
