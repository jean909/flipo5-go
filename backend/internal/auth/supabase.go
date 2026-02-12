package auth

import (
	"errors"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var ErrInvalidToken = errors.New("invalid token")

// Supabase JWT claims (access token: sub = user id, email)
type supabaseClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	jwt.RegisteredClaims
}

// VerifySupabaseToken verifies with legacy HS256 secret (used only when JWKS not available).
func VerifySupabaseToken(tokenString, secret string) (userID uuid.UUID, email string, err error) {
	if secret == "" {
		return uuid.Nil, "", errors.New("supabase JWT secret not set")
	}
	t, err := jwt.ParseWithClaims(tokenString, &supabaseClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		return uuid.Nil, "", ErrInvalidToken
	}
	return extractClaims(t)
}

// VerifySupabaseTokenJWKS verifies with JWKS (Supabase new signing keys).
func VerifySupabaseTokenJWKS(tokenString string, jwks *keyfunc.JWKS) (userID uuid.UUID, email string, err error) {
	if jwks == nil {
		return uuid.Nil, "", errors.New("jwks not set")
	}
	t, err := jwt.ParseWithClaims(tokenString, &supabaseClaims{}, jwks.Keyfunc)
	if err != nil {
		return uuid.Nil, "", ErrInvalidToken
	}
	return extractClaims(t)
}

func extractClaims(t *jwt.Token) (userID uuid.UUID, email string, err error) {
	c, ok := t.Claims.(*supabaseClaims)
	if !ok || !t.Valid || c.Sub == "" {
		return uuid.Nil, "", ErrInvalidToken
	}
	id, err := uuid.Parse(c.Sub)
	if err != nil {
		return uuid.Nil, "", ErrInvalidToken
	}
	return id, c.Email, nil
}
