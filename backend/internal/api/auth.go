package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/store"
)

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	user, err := s.DB.UserByID(r.Context(), userID)
	if err != nil || user == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	profile, _ := s.DB.GetUserProfile(r.Context(), userID)
	out := map[string]interface{}{
		"id": user.ID, "email": user.Email, "full_name": user.FullName, "where_heard": user.WhereHeard,
		"use_case": user.UseCase, "plan": user.Plan, "data_retention_accepted": user.DataRetentionAccepted,
		"ai_configuration": user.AIConfiguration, "ai_config_updated_at": user.AIConfigUpdatedAt,
		"is_admin": user.IsAdmin, "created_at": user.CreatedAt, "updated_at": user.UpdatedAt,
		"profile": profile,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) checkEmail(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, `{"error":"email required"}`, http.StatusBadRequest)
		return
	}
	if s.supabaseURL == "" || s.supabaseServiceRole == "" {
		reason := "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend .env"
		if s.supabaseURL == "" {
			reason = "missing SUPABASE_URL in backend .env"
		} else if s.supabaseServiceRole == "" {
			reason = "missing SUPABASE_SERVICE_ROLE_KEY in backend .env (Project Settings → API → service_role)"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "not configured", "reason": reason})
		return
	}
	// Supabase GoTrue: GET /auth/v1/admin/users
	reqURL := s.supabaseURL + "/auth/v1/admin/users?per_page=50&page=1"
	req, err := http.NewRequestWithContext(r.Context(), "GET", reqURL, nil)
	if err != nil {
		http.Error(w, `{"error":"request"}`, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+s.supabaseServiceRole)
	req.Header.Set("apikey", s.supabaseServiceRole)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, `{"error":"upstream"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	var out struct {
		Users []struct {
			Email string `json:"email"`
		} `json:"users"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		http.Error(w, `{"error":"decode"}`, http.StatusBadGateway)
		return
	}
	emailLower := strings.ToLower(email)
	exists := false
	for _, u := range out.Users {
		if strings.ToLower(u.Email) == emailLower {
			exists = true
			break
		}
	}
	// If we got 50 and didn't find, paginate once to reduce false negatives
	if !exists && len(out.Users) == 50 {
		req2, _ := http.NewRequestWithContext(r.Context(), "GET", s.supabaseURL+"/auth/v1/admin/users?per_page=50&page=2", nil)
		req2.Header.Set("Authorization", "Bearer "+s.supabaseServiceRole)
		req2.Header.Set("apikey", s.supabaseServiceRole)
		if resp2, err := http.DefaultClient.Do(req2); err == nil {
			var out2 struct {
				Users []struct {
					Email string `json:"email"`
				} `json:"users"`
			}
			_ = json.NewDecoder(resp2.Body).Decode(&out2)
			resp2.Body.Close()
			for _, u := range out2.Users {
				if strings.ToLower(u.Email) == emailLower {
					exists = true
					break
				}
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"exists": exists})
}

var validStyles = map[string]bool{"balanced": true, "friendly": true, "direct": true, "logical": true, "brief": true, "detailed": true}
var validLangs = map[string]bool{"browser": true, "en": true, "de": true, "ro": true, "fr": true, "es": true, "it": true}

func (s *Server) patchMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var body struct {
		FullName              *string                `json:"full_name"`
		WhereHeard            *string                `json:"where_heard"`
		UseCase               *string                `json:"use_case"`
		Plan                  *string                `json:"plan"`
		DataRetentionAccepted *bool                  `json:"data_retention_accepted"`
		AIConfiguration       map[string]interface{} `json:"ai_configuration"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	var planVal *string
	if body.Plan != nil {
		p := strings.TrimSpace(*body.Plan)
		if p != "" && p != "free" && p != "premium" && p != "creator" {
			http.Error(w, `{"error":"invalid plan"}`, http.StatusBadRequest)
			return
		}
		if p != "" {
			planVal = &p
		}
	}
	if err := s.DB.UpdateUserProfile(r.Context(), userID, body.FullName, body.WhereHeard, body.UseCase, planVal); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	if body.DataRetentionAccepted != nil || body.AIConfiguration != nil {
		var aiConfig map[string]interface{}
		if body.AIConfiguration != nil {
			aiConfig = make(map[string]interface{})
			if u, _ := s.DB.UserByID(r.Context(), userID); u != nil && u.AIConfiguration != nil {
				for k, v := range u.AIConfiguration {
					aiConfig[k] = v
				}
			}
			if s, ok := body.AIConfiguration["style"].(string); ok && validStyles[s] {
				aiConfig["style"] = s
			}
			if l, ok := body.AIConfiguration["primary_language"].(string); ok && validLangs[l] {
				aiConfig["primary_language"] = l
			}
			if _, has := body.AIConfiguration["user_details"]; has {
				d, _ := body.AIConfiguration["user_details"].(string)
				d = strings.TrimSpace(d)
				if len(d) > 80 {
					d = d[:80]
				}
				aiConfig["user_details"] = d
			}
			if len(aiConfig) == 0 {
				aiConfig = nil
			}
		}
		err := s.DB.UpdateUserSettings(r.Context(), userID, body.DataRetentionAccepted, aiConfig)
		if err != nil {
			if err == store.ErrAIConfigCooldown {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{"error": "ai_config_cooldown", "message": "AI configuration can only be changed once per 24 hours"})
				return
			}
			http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
			return
		}
	}
	user, _ := s.DB.UserByID(r.Context(), userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
