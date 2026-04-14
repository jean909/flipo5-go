package middleware

import (
  "context"
  "testing"

  "github.com/google/uuid"
)

func TestContextUserIDAndEmailHelpers(t *testing.T) {
  base := context.Background()
  uid := uuid.New()

  ctx := withUserID(base, uid)
  ctx = withEmail(ctx, "user@example.com")

  gotID, ok := UserID(ctx)
  if !ok {
    t.Fatalf("expected user id in context")
  }
  if gotID != uid {
    t.Fatalf("unexpected user id: got %s want %s", gotID, uid)
  }

  if gotEmail := Email(ctx); gotEmail != "user@example.com" {
    t.Fatalf("unexpected email: got %s", gotEmail)
  }
}

func TestContextHelpers_EmptyWhenMissing(t *testing.T) {
  ctx := context.Background()
  if _, ok := UserID(ctx); ok {
    t.Fatalf("expected no user id")
  }
  if got := Email(ctx); got != "" {
    t.Fatalf("expected empty email, got %q", got)
  }
}
