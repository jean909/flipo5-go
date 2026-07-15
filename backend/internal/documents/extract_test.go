package documents

import (
	"strings"
	"testing"
)

func TestExtractFromBytesPDFInvalid(t *testing.T) {
	_, err := ExtractFromBytes([]byte("%PDF-1.4\nnot-a-real-pdf"), "application/pdf", "broken.pdf")
	if err == nil {
		t.Fatal("expected error for malformed pdf")
	}
}

func TestExtractFromBytesDetectsPDFByMagic(t *testing.T) {
	_, err := ExtractFromBytes([]byte("%PDF-1.4\nbroken"), "", "file.bin")
	if err == nil {
		t.Fatal("expected pdf parser error")
	}
	if !strings.Contains(err.Error(), "pdf") {
		t.Fatalf("expected pdf error, got %v", err)
	}
}

func TestExtractFromBytesPlainText(t *testing.T) {
	text, err := ExtractFromBytes([]byte("  line one\nline two  "), "text/plain", "notes.txt")
	if err != nil {
		t.Fatal(err)
	}
	if text != "line one\nline two" {
		t.Fatalf("got %q", text)
	}
}

func TestIsDocumentContentType(t *testing.T) {
	if !IsDocumentContentType("application/pdf") {
		t.Fatal("pdf should be document")
	}
	if IsDocumentContentType("image/png") {
		t.Fatal("png is not document")
	}
}

func TestTruncateRunes(t *testing.T) {
	long := strings.Repeat("a", MaxExtractRunes+10)
	out := truncateRunes(long)
	if !strings.HasSuffix(out, "[… document truncated …]") {
		t.Fatalf("missing truncation marker: len=%d", len(out))
	}
}
