package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// RateLimitByIP limits N requests per minute per client IP. Use for public routes (no auth).
func RateLimitByIP(requestsPerMinute int) func(next http.Handler) http.Handler {
	type entry struct {
		count int
		start time.Time
	}
	var mu sync.Mutex
	m := make(map[string]entry)
	var lastCleanup time.Time

	cleanup := func() {
		now := time.Now()
		if now.Sub(lastCleanup) < 2*time.Minute {
			return
		}
		lastCleanup = now
		cutoff := now.Add(-2 * time.Minute)
		for k, e := range m {
			if e.start.Before(cutoff) {
				delete(m, k)
			}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
				ip = strings.TrimSpace(strings.Split(fwd, ",")[0])
			}
			key := "ip:" + ip
			mu.Lock()
			cleanup()
			e := m[key]
			now := time.Now()
			if now.Sub(e.start) > time.Minute {
				e = entry{count: 1, start: now}
			} else {
				e.count++
			}
			m[key] = e
			mu.Unlock()
			if e.count > requestsPerMinute {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"rate limit exceeded"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimit limits N requests per minute per user (by UserID from ctx).
// Runs periodic cleanup to avoid unbounded map growth.
func RateLimit(requestsPerMinute int) func(next http.Handler) http.Handler {
	type entry struct {
		count int
		start time.Time
	}
	var mu sync.Mutex
	m := make(map[string]entry)
	var lastCleanup time.Time

	cleanup := func() {
		now := time.Now()
		if now.Sub(lastCleanup) < 2*time.Minute {
			return
		}
		lastCleanup = now
		cutoff := now.Add(-2 * time.Minute)
		for k, e := range m {
			if e.start.Before(cutoff) {
				delete(m, k)
			}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := UserID(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			key := id.String()
			mu.Lock()
			cleanup()
			e := m[key]
			now := time.Now()
			if now.Sub(e.start) > time.Minute {
				e = entry{count: 1, start: now}
			} else {
				e.count++
			}
			m[key] = e
			mu.Unlock()
			if e.count > requestsPerMinute {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"rate limit exceeded"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
