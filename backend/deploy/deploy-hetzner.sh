#!/bin/bash
# Deploy Flipo5 backend (Docker) to Hetzner
# Rulează din repo root. Pe server: folder creat dacă nu există; clone la prima rulare, altfel pull; build + up.
# Migrările DB rulează automat la pornirea containerului (schema.sql + migrations/*.sql).
# Usage: ./backend/deploy/deploy-hetzner.sh [user@SERVER_IP] ["commit message"]
# Or: DEPLOY_SERVER=root@IP DEPLOY_PATH=~/backend/flipo5 ./backend/deploy/deploy-hetzner.sh

set -e

# Repo root = parent of backend
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$BACKEND_DIR")"
cd "$REPO_ROOT"

# Server
if [[ "$1" == root@* ]] || [[ "$1" == *@* ]]; then
  SERVER="$1"
  COMMIT_MSG="${2:-Deploy: sync}"
else
  SERVER="${DEPLOY_SERVER:-$1}"
  COMMIT_MSG="${2:-$1}"
  [ -z "$COMMIT_MSG" ] && COMMIT_MSG="Deploy: sync"
fi

if [ -z "$SERVER" ]; then
  echo "Usage: DEPLOY_SERVER=root@IP ./backend/deploy/deploy-hetzner.sh [\"commit msg\"]"
  echo "   Or: ./backend/deploy/deploy-hetzner.sh root@IP [\"commit msg\"]"
  echo "  DEPLOY_PATH = path pe server (default: ~/backend/flipo5); folderul e creat daca nu exista."
  exit 1
fi

echo "=== Git add & commit (backend, deploy, docker-compose, frontend) ==="
git reset HEAD -- '*.zip' 2>/dev/null || true
for f in $(git ls-files '*.zip' 2>/dev/null); do git rm --cached "$f" 2>/dev/null || true; done
git add backend/
git add deploy/
git add .gitignore
git add docker-compose.yml
git add frontend/
[ -f .env.example ] && git add .env.example
if git diff --staged --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$COMMIT_MSG"
fi

echo "=== Pushing to git ==="
git push

REMOTE_PATH="${DEPLOY_PATH:-~/backend/flipo5}"
REPO_URL="$(git remote get-url origin 2>/dev/null || true)"
echo "=== Deploying to $SERVER (path: $REMOTE_PATH) ==="
if [ -n "$REPO_URL" ]; then
  ssh "$SERVER" "mkdir -p $REMOTE_PATH && cd $REMOTE_PATH && if [ ! -d .git ]; then git clone $REPO_URL . ; else git pull; fi && docker compose build api && docker compose up -d"
else
  ssh "$SERVER" "mkdir -p $REMOTE_PATH && cd $REMOTE_PATH && git pull && docker compose build api && docker compose up -d"
fi
echo ""
echo "Done. Verificare:"
echo "  ssh $SERVER 'cd $REMOTE_PATH && docker compose ps'"
echo "  ssh $SERVER 'cd $REMOTE_PATH && docker compose logs api --tail 30'"
echo "  (în logs caută 'migrate: ok' sau 'migrate FAILED' pentru migrări DB)"
