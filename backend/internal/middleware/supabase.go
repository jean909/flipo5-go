package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/google/uuid"
	"flipo5/backend/internal/auth"
	"flipo5/backend/internal/store"
)

// SupabaseAuth verifies Supabase JWT (JWKS or legacy secret), syncs user to DB, sets user ID in context.
func SupabaseAuth(secret string, jwks *keyfunc.JWKS, db *store.DB) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := r.Header.Get("Authorization")
			if raw == "" && r.Method == http.MethodGet && r.URL.Query().Get("token") != "" {
				raw = "Bearer " + r.URL.Query().Get("token")
			}
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
			var userID uuid.UUID
			var email string
			var err error
			if jwks != nil {
				userID, email, err = auth.VerifySupabaseTokenJWKS(token, jwks)
			} else {
				userID, email, err = auth.VerifySupabaseToken(token, secret)
			}
			if err != nil {
				log.Printf("supabase auth: token verify failed: %v (use SUPABASE_URL for JWKS or SUPABASE_JWT_SECRET)", err)
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
			if err := db.UpsertUser(r.Context(), userID, email); err != nil {
				log.Printf("supabase auth: UpsertUser failed: %v", err)
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			ctx := withUserID(r.Context(), userID)
			ctx = withEmail(ctx, email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
