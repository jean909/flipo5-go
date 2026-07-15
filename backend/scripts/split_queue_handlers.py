#!/usr/bin/env python3
"""Split queue/handlers.go into domain files (same package queue)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "internal" / "queue"
SRC = ROOT / "handlers.go"
lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)

# (filename, start_line 1-based inclusive, end_line inclusive)
SECTIONS = [
    ("handlers_common.go", 1, 153),
    ("handler_chat.go", 155, 508),
    ("handler_image.go", 509, 719),
    ("handler_logo.go", 720, 836),
    ("handler_audio.go", 837, 964),
    ("handler_video.go", 965, 1075),
    ("handler_upscale.go", 1076, 1178),
    ("handler_maintenance.go", 1179, 1192),
    ("handler_summarize.go", 1193, 1356),
    ("handler_seo.go", 1357, 1517),
    ("handler_outline.go", 1518, 1630),
    ("handler_translate.go", 1631, 1815),
    ("handler_product.go", 1816, 2202),
    ("handlers_helpers.go", 2204, 2277),
    ("handlers_register.go", 2279, len(lines)),
]

IMPORTS = """package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"flipo5/backend/internal/cache"
	"flipo5/backend/internal/config"
	"flipo5/backend/internal/documents"
	"flipo5/backend/internal/replicate"
	"flipo5/backend/internal/storage"
	"flipo5/backend/internal/store"
	"flipo5/backend/internal/stream"
	"flipo5/backend/internal/textmodel"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

"""

for fname, start, end in SECTIONS:
    chunk = "".join(lines[start - 1 : end])
    body = chunk
    if fname != "handlers_common.go":
        # strip duplicate package/imports from chunk if any (shouldn't have)
        body = chunk
    out = IMPORTS + body if fname != "handlers_common.go" else chunk
    if fname == "handlers_common.go":
        out = chunk  # already has package + imports
    (ROOT / fname).write_text(out, encoding="utf-8")
    print(f"wrote {fname} ({end - start + 1} lines)")

SRC.unlink()
print("removed handlers.go")
