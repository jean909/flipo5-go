# Flipo5 — ChatGPT-style app + Image & Video (MVP)

Stack: **Next.js** (Vercel) + **Go** (Chi, pgx, Asynq, Replicate), **PostgreSQL**, **Redis**. Black & white UI, EN/DE.

---

## Quick start

### 1. Backend (Go)

```bash
cd backend
cp .env.example .env
# Edit .env: DATABASE_URL, REDIS_URL, REPLICATE_API_TOKEN, JWT_SECRET
# Optional: REPLICATE_MODEL_TEXT, REPLICATE_MODEL_IMAGE, REPLICATE_MODEL_VIDEO
go mod tidy
go run ./cmd/api
```

- Needs: **PostgreSQL** and **Redis** running.
- Schema runs automatically on startup (see `internal/store/schema.sql`).
- API: `http://localhost:8080` (health: `GET /health`).

### 2. Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8080 (or your backend URL)
npm install
npm run dev
```

- App: `http://localhost:3000`.
- Login with any email (no password in MVP); then use Chat / Image / Video.

---

## What’s in the MVP

| Area | Done |
|------|------|
| **Backend** | Chi router, JWT auth, pgx (users + jobs), Asynq + Redis, Replicate client, rate limit |
| **Jobs** | Create chat / image / video → job enqueued → worker runs Replicate → DB updated |
| **Frontend** | Login, dashboard (chat / image / video), jobs list, job detail, EN/DE |
| **UI** | Black & white, simple layout |
| **Storage** | S3/R2 client present; optional (Replicate URLs used directly in MVP) |

---

## Env (backend)

| Key | Required | Description |
|-----|----------|-------------|
| `PORT` | No | Default `8080` |
| `JWT_SECRET` | Yes (prod) | Min 32 chars |
| `JWT_EXPIRE_MINS` | No | Default 60 |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | `host:port` or `redis://...` |
| `REPLICATE_API_TOKEN` | Yes (for AI) | From replicate.com |
| `REPLICATE_MODEL_TEXT` | When using chat | e.g. `meta/meta-llama-3-70b-instruct` |
| `REPLICATE_MODEL_IMAGE` | When using image | e.g. `black-forest-labs/flux-schnell` |
| `REPLICATE_MODEL_VIDEO` | When using video | e.g. Runway / Luma model ID |

Put these in `.env`; you can add Replicate model IDs later.

---

## Deploy

- **Frontend**: Vercel — connect repo, root or `frontend`, set `NEXT_PUBLIC_API_URL` to your Go API.
- **Backend**: Fly.io or Hetzner — build `backend`, run `./api` (or `go run ./cmd/api`), set env (including `DATABASE_URL`, `REDIS_URL`, `REPLICATE_API_TOKEN`).

### Backend pe Hetzner bare metal

- Vezi `deploy/hetzner/README.md` pentru ghid complet.
- Build Linux: `.\deploy\build-linux.ps1` (Windows) sau `GOOS=linux go build -o flipo5-api ./cmd/api` din `backend/`.
- Frontend local + backend remote: setează `NEXT_PUBLIC_API_URL=http://SERVER_IP:8080` în `frontend/.env.local`.

---

## Project layout

```
backend/
  cmd/api/main.go          # Entry: HTTP server + Asynq worker
  internal/
    api/handlers.go        # REST: login, chat, image, video, jobs
    auth/jwt.go
    config/config.go
    middleware/            # JWT, rate limit
    queue/                 # Asynq task types + Replicate workers
    replicate/client.go    # Replicate API wrapper
    store/                 # pgx: users, jobs, migrate
    storage/s3.go          # S3/R2 (optional)
frontend/
  src/app/
    login/, dashboard/, dashboard/jobs/
  src/lib/
    api.ts, i18n.ts
```

---

## Next steps (after MVP)

- Add Replicate model IDs to env and test each type.
- Optional: stream LLM output (Replicate streaming or poll + SSE).
- Optional: upload generated media to S3/R2 and serve via CDN.
- Optional: OpenTelemetry + Prometheus/Grafana.
