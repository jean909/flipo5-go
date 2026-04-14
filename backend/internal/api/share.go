package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const shareMaxExpDays = 30
const shareDefaultExpDays = 7
const shareTextMaxRunes = 12000

// Reused client: connection pooling for public share proxy (CDN fetches).
var publicShareFetchClient = &http.Client{
	Timeout: 60 * time.Second,
	Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          128,
		MaxIdleConnsPerHost:   32,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   12 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   8 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	},
}

type sharePayload struct {
	S string `json:"s"` // share id
	J string `json:"j"` // job id
	E int64  `json:"e"` // unix expiry
}

func signShareToken(secret string, shareID, jobID uuid.UUID, expUnix int64) (string, error) {
	if strings.TrimSpace(secret) == "" {
		return "", fmt.Errorf("empty secret")
	}
	body, err := json.Marshal(sharePayload{S: shareID.String(), J: jobID.String(), E: expUnix})
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding.EncodeToString(body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(enc))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return enc + "." + sig, nil
}

func parseShareToken(secret, token string) (shareID uuid.UUID, jobID uuid.UUID, exp int64, ok bool) {
	token = strings.TrimSpace(token)
	if secret == "" || token == "" {
		return uuid.Nil, uuid.Nil, 0, false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return uuid.Nil, uuid.Nil, 0, false
	}
	enc, sigB64 := parts[0], parts[1]
	sig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return uuid.Nil, uuid.Nil, 0, false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(enc))
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return uuid.Nil, uuid.Nil, 0, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		return uuid.Nil, uuid.Nil, 0, false
	}
	var p sharePayload
	if json.Unmarshal(raw, &p) != nil || p.S == "" || p.J == "" || p.E <= 0 {
		return uuid.Nil, uuid.Nil, 0, false
	}
	sid, err := uuid.Parse(p.S)
	if err != nil {
		return uuid.Nil, uuid.Nil, 0, false
	}
	jid, err := uuid.Parse(p.J)
	if err != nil {
		return uuid.Nil, uuid.Nil, 0, false
	}
	return sid, jid, p.E, true
}

func allowedDownloadHost(u *url.URL) bool {
	h := strings.ToLower(u.Host)
	return strings.Contains(h, "replicate.delivery") ||
		strings.Contains(h, "r2.dev") ||
		strings.Contains(h, "r2.cloudflarestorage.com") ||
		strings.Contains(h, "storage.flipo5.com") ||
		strings.Contains(h, "flipo5.com")
}

func extractOutputRefs(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	var root interface{}
	if json.Unmarshal(raw, &root) != nil {
		return nil
	}
	parsed := root
	if s, ok := root.(string); ok {
		var inner interface{}
		if json.Unmarshal([]byte(s), &inner) == nil {
			parsed = inner
		}
	}
	var out []string
	switch v := parsed.(type) {
	case []interface{}:
		out = appendRefsFromSlice(v, out)
	case map[string]interface{}:
		out = appendRefsFromMap(v, out)
	default:
		return nil
	}
	return dedupeKeepOrder(out)
}

func appendRefsFromSlice(arr []interface{}, out []string) []string {
	for _, el := range arr {
		switch x := el.(type) {
		case string:
			if ref := normalizeRef(x); ref != "" {
				out = append(out, ref)
			}
		case map[string]interface{}:
			if u, ok := x["url"].(string); ok {
				if ref := normalizeRef(u); ref != "" {
					out = append(out, ref)
				}
			}
		}
	}
	return out
}

func appendRefsFromMap(o map[string]interface{}, out []string) []string {
	for _, key := range []string{"output", "url", "urls"} {
		val, ok := o[key]
		if !ok {
			continue
		}
		switch x := val.(type) {
		case string:
			if ref := normalizeRef(x); ref != "" {
				out = append(out, ref)
			}
		case []interface{}:
			out = appendRefsFromSlice(x, out)
		}
	}
	return out
}

func normalizeRef(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "http://") {
		return s
	}
	if strings.HasPrefix(s, "uploads/") && !strings.Contains(s, "..") {
		return s
	}
	return ""
}

func dedupeKeepOrder(in []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func extractShareText(jobType string, raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	if jobType != "chat" && jobType != "translate" && jobType != "seo" && jobType != "outline" {
		return ""
	}
	var m map[string]interface{}
	if json.Unmarshal(raw, &m) != nil {
		return ""
	}
	var s string
	if v, ok := m["output"].(string); ok {
		s = v
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	runes := []rune(s)
	if len(runes) > shareTextMaxRunes {
		s = string(runes[:shareTextMaxRunes])
	}
	return s
}

func extractPromptFromInput(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var m map[string]interface{}
	if json.Unmarshal(raw, &m) != nil {
		return ""
	}
	for _, k := range []string{"prompt", "text", "message"} {
		if v, ok := m[k].(string); ok {
			v = strings.TrimSpace(v)
			if v != "" {
				runes := []rune(v)
				if len(runes) > 500 {
					return string(runes[:500]) + "…"
				}
				return v
			}
		}
	}
	return ""
}

func keyReferencedInJob(j *store.Job, key string) bool {
	if j == nil || key == "" {
		return false
	}
	return bytes.Contains(j.Input, []byte(key)) || bytes.Contains(j.Output, []byte(key))
}

type createShareRequest struct {
	JobID         string `json:"job_id"`
	ExpiresInDays int    `json:"expires_in_days"`
}

func (s *Server) validateShareToken(ctx context.Context, token string) (*store.JobShare, uuid.UUID, int64, bool) {
	if strings.TrimSpace(s.shareSigningSecret) == "" {
		return nil, uuid.Nil, 0, false
	}
	shareID, jobID, exp, ok := parseShareToken(s.shareSigningSecret, token)
	if !ok || time.Now().Unix() > exp {
		return nil, uuid.Nil, 0, false
	}
	shareRow, err := s.DB.GetJobShare(ctx, shareID)
	if err != nil || shareRow == nil {
		return nil, uuid.Nil, 0, false
	}
	if shareRow.JobID != jobID || shareRow.RevokedAt != nil {
		return nil, uuid.Nil, 0, false
	}
	if time.Now().After(shareRow.ExpiresAt) {
		return nil, uuid.Nil, 0, false
	}
	return shareRow, jobID, exp, true
}

// POST /api/shares — authenticated; returns signed token and absolute share path for the app.
func (s *Server) createJobShare(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if strings.TrimSpace(s.shareSigningSecret) == "" {
		http.Error(w, `{"error":"share not configured"}`, http.StatusServiceUnavailable)
		return
	}
	var body createShareRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.JobID) == "" {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	jobID, err := uuid.Parse(strings.TrimSpace(body.JobID))
	if err != nil {
		http.Error(w, `{"error":"invalid job_id"}`, http.StatusBadRequest)
		return
	}
	days := body.ExpiresInDays
	if days <= 0 {
		days = shareDefaultExpDays
	}
	if days > shareMaxExpDays {
		days = shareMaxExpDays
	}
	j, err := s.DB.GetJobForUser(r.Context(), jobID, userID)
	if err != nil {
		log.Printf("createJobShare GetJobForUser: %v", err)
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
		return
	}
	if j == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if j.Status != "completed" {
		http.Error(w, `{"error":"job not completed"}`, http.StatusBadRequest)
		return
	}
	shareID := uuid.New()
	expAt := time.Now().UTC().Add(time.Duration(days) * 24 * time.Hour)
	exp := expAt.Unix()
	if err := s.DB.CreateJobShare(r.Context(), shareID, userID, j.ID, expAt); err != nil {
		log.Printf("createJobShare insert: %v", err)
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
		return
	}
	token, err := signShareToken(s.shareSigningSecret, shareID, j.ID, exp)
	if err != nil {
		http.Error(w, `{"error":"sign failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         shareID.String(),
		"token":      token,
		"expires_at": time.Unix(exp, 0).UTC().Format(time.RFC3339),
		"path":       "/share/" + url.PathEscape(token),
	})
}

// DELETE /api/shares/{id} — authenticated; revoke one share link.
func (s *Server) revokeJobShare(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	shareID, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	updated, err := s.DB.RevokeJobShareForUser(r.Context(), shareID, userID)
	if err != nil {
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
		return
	}
	if !updated {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// GET /api/public/share/{token} — no auth; rate-limited at route level.
func (s *Server) publicShare(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(s.shareSigningSecret) == "" {
		http.Error(w, `{"error":"share not configured"}`, http.StatusServiceUnavailable)
		return
	}
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	token, _ = url.PathUnescape(token)
	_, jobID, exp, ok := s.validateShareToken(r.Context(), token)
	if !ok {
		http.Error(w, `{"error":"invalid or expired link"}`, http.StatusNotFound)
		return
	}
	j, err := s.DB.GetJob(r.Context(), jobID)
	if err != nil || j == nil {
		if err != nil {
			log.Printf("publicShare GetJob: %v", err)
		}
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if j.Status != "completed" {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	refs := extractOutputRefs(j.Output)
	text := extractShareText(j.Type, j.Output)
	prompt := extractPromptFromInput(j.Input)
	var name string
	if j.Name != nil {
		name = strings.TrimSpace(*j.Name)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"type":       j.Type,
		"status":     j.Status,
		"name":       name,
		"prompt":     prompt,
		"text":       text,
		"media_refs": refs,
		"expires_at": time.Unix(exp, 0).UTC().Format(time.RFC3339),
	})
}

// GET /api/public/share/{token}/media?key=uploads/...
func (s *Server) publicShareMedia(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if strings.TrimSpace(s.shareSigningSecret) == "" {
		http.Error(w, `{"error":"share not configured"}`, http.StatusServiceUnavailable)
		return
	}
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	token, _ = url.PathUnescape(token)
	_, jobID, _, ok := s.validateShareToken(r.Context(), token)
	if !ok {
		http.Error(w, `{"error":"invalid or expired link"}`, http.StatusNotFound)
		return
	}
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key == "" || !strings.HasPrefix(key, "uploads/") || strings.Contains(key, "..") {
		http.Error(w, `{"error":"invalid key"}`, http.StatusBadRequest)
		return
	}
	j, err := s.DB.GetJob(r.Context(), jobID)
	if err != nil || j == nil || j.Status != "completed" {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if !strings.HasPrefix(key, "uploads/"+j.UserID.String()+"/") {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	if !keyReferencedInJob(j, key) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	if s.Store == nil {
		http.Error(w, `{"error":"storage not configured"}`, http.StatusServiceUnavailable)
		return
	}
	body, contentType, err := s.Store.Get(r.Context(), key)
	if err != nil {
		log.Printf("publicShareMedia Get %s: %v", key, err)
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	defer body.Close()
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = io.Copy(w, body)
}

// GET /api/public/share/{token}/proxy?url=https%3A%2F%2F...
func (s *Server) publicShareProxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if strings.TrimSpace(s.shareSigningSecret) == "" {
		http.Error(w, `{"error":"share not configured"}`, http.StatusServiceUnavailable)
		return
	}
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	token, _ = url.PathUnescape(token)
	_, jobID, _, ok := s.validateShareToken(r.Context(), token)
	if !ok {
		http.Error(w, `{"error":"invalid or expired link"}`, http.StatusNotFound)
		return
	}
	urlStr := strings.TrimSpace(r.URL.Query().Get("url"))
	if urlStr == "" {
		http.Error(w, `{"error":"url required"}`, http.StatusBadRequest)
		return
	}
	u, err := url.Parse(urlStr)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
		return
	}
	if !allowedDownloadHost(u) {
		http.Error(w, `{"error":"url not allowed"}`, http.StatusBadRequest)
		return
	}
	j, err := s.DB.GetJob(r.Context(), jobID)
	if err != nil || j == nil || j.Status != "completed" {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if !bytes.Contains(j.Output, []byte(urlStr)) && !bytes.Contains(j.Input, []byte(urlStr)) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlStr, nil)
	if err != nil {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	resp, err := publicShareFetchClient.Do(req)
	if err != nil {
		http.Error(w, `{"error":"fetch failed"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Error(w, `{"error":"fetch failed"}`, http.StatusBadGateway)
		return
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	disposition := strings.TrimSpace(resp.Header.Get("Content-Disposition"))
	w.Header().Set("Content-Type", ct)
	if disposition != "" {
		w.Header().Set("Content-Disposition", disposition)
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = io.Copy(w, resp.Body)
}
