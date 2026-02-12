package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"flipo5/backend/internal/auth"
)

func JWT(secret string) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := r.Header.Get("Authorization")
			if raw == "" {
				http.Error(w, `{"error":"missing authorization"}`, http.StatusUnauthorized)
				return
			}
			const prefix = "Bearer "
			if !strings.HasPrefix(raw, prefix) {
				http.Error(w, `{"error":"invalid authorization"}`, http.StatusUnauthorized)
				return
			}
			token := strings.TrimPrefix(raw, prefix)
			claims, err := auth.ParseToken(token, secret)
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
			ctx := withUserID(r.Context(), claims.UserID)
			ctx = withEmail(ctx, claims.Email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type contextKey string

const userIDKey contextKey = "user_id"
const emailKey contextKey = "email"

func withUserID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

func UserID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(userIDKey).(uuid.UUID)
	return id, ok
}

func withEmail(ctx context.Context, email string) context.Context {
	return context.WithValue(ctx, emailKey, email)
}

func Email(ctx context.Context) string {
	e, _ := ctx.Value(emailKey).(string)
	return e
}
