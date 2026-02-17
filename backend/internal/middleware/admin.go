package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"flipo5/backend/internal/store"
)

const (
	adminAllowedID    = "ea3f2db4-355d-44c0-9791-61ff93fbbb13"
	adminAllowedEmail = "moiseioan1195@gmail.com"
)

// isAdmin returns true if the user is the designated admin (by id or email) or has users.is_admin = true.
func isAdmin(u *store.User) bool {
	if u == nil {
		return false
	}
	if u.IsAdmin {
		return true
	}
	if u.ID.String() == adminAllowedID || u.Email == adminAllowedEmail {
		return true
	}
	return false
}

// RequireAdmin ensures the request user is an admin. Use after SupabaseAuth.
func RequireAdmin(db *store.DB) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := UserID(r.Context())
			if !ok || userID == uuid.Nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			u, err := db.UserByID(r.Context(), userID)
			if err != nil || u == nil || !isAdmin(u) {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
