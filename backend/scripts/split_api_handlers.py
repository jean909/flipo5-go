#!/usr/bin/env python3
"""Split api/handlers.go into domain files (same package api)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "internal" / "api"
SRC = ROOT / "handlers.go"
lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)

SECTIONS = [
    ("server.go", 1, 174),
    ("cache_helpers.go", 176, 193),
    ("health.go", 195, 237),
    ("auth.go", 240, 408),
    ("chat_api.go", 410, 696),
    ("upload.go", 698, 768),
    ("media_jobs.go", 770, 1219),
    ("threads.go", 1221, 1372),
    ("jobs_api.go", 1374, 1640),
    ("seo_outline.go", 1642, 1751),
    ("products_api.go", 1753, 2072),
    ("translate_api.go", 2074, 2326),
    ("files_api.go", 2328, 2403),
    ("admin_api.go", 2405, 2471),
    ("media_serve.go", 2473, 2719),
    ("projects_api.go", 2721, 3343),
    ("vectorize_api.go", 3345, len(lines)),
]

IMPORTS = """package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"flipo5/backend/internal/cache"
	"flipo5/backend/internal/middleware"
	"flipo5/backend/internal/queue"
	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/storage"
	"flipo5/backend/internal/store"
	"flipo5/backend/internal/stream"
	"github.com/MicahParks/keyfunc/v2"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	repgo "github.com/replicate/replicate-go"
	"flipo5/backend/internal/textmodel"
)

"""

for fname, start, end in SECTIONS:
    chunk = "".join(lines[start - 1 : end])
    if fname == "server.go":
        out = chunk
    else:
        out = IMPORTS + chunk
    (ROOT / fname).write_text(out, encoding="utf-8")
    print(f"wrote {fname}")

SRC.unlink()
print("removed handlers.go")
