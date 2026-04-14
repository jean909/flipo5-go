package auth

import (
  "testing"
  "time"

  "github.com/golang-jwt/jwt/v5"
  "github.com/google/uuid"
)

func signTestToken(t *testing.T, secret string, sub string, email string) string {
  t.Helper()
  claims := supabaseClaims{
    Sub:   sub,
    Email: email,
    RegisteredClaims: jwt.RegisteredClaims{
      ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
      IssuedAt:  jwt.NewNumericDate(time.Now()),
    },
  }
  token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
  signed, err := token.SignedString([]byte(secret))
  if err != nil {
    t.Fatalf("failed signing token: %v", err)
  }
  return signed
}

func TestVerifySupabaseToken_Valid(t *testing.T) {
  secret := "test-secret"
  uid := uuid.New()
  tok := signTestToken(t, secret, uid.String(), "user@example.com")

  gotID, gotEmail, err := VerifySupabaseToken(tok, secret)
  if err != nil {
    t.Fatalf("expected valid token, got error: %v", err)
  }
  if gotID != uid {
    t.Fatalf("unexpected user id: got %s want %s", gotID, uid)
  }
  if gotEmail != "user@example.com" {
    t.Fatalf("unexpected email: got %s", gotEmail)
  }
}

func TestVerifySupabaseToken_InvalidSecret(t *testing.T) {
  uid := uuid.New()
  tok := signTestToken(t, "correct", uid.String(), "user@example.com")

  _, _, err := VerifySupabaseToken(tok, "wrong")
  if err == nil {
    t.Fatalf("expected error for wrong secret")
  }
  if err != ErrInvalidToken {
    t.Fatalf("expected ErrInvalidToken, got %v", err)
  }
}

func TestVerifySupabaseToken_MissingSub(t *testing.T) {
  secret := "test-secret"
  tok := signTestToken(t, secret, "", "user@example.com")

  _, _, err := VerifySupabaseToken(tok, secret)
  if err == nil {
    t.Fatalf("expected invalid token for empty sub")
  }
  if err != ErrInvalidToken {
    t.Fatalf("expected ErrInvalidToken, got %v", err)
  }
}
