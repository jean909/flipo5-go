#!/bin/bash
# Deploy Flipo5 backend (Docker) to Hetzner
# Rulează din repo root. Pe server creează folderul dacă nu există (ex: ~/backend/flipo5).
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

echo "=== Git add & commit (backend + deploy, fara zip) ==="
git reset HEAD -- '*.zip' 2>/dev/null || true
for f in $(git ls-files '*.zip' 2>/dev/null); do git rm --cached "$f" 2>/dev/null || true; done
git add backend/
git add deploy/
git add .gitignore
git add docker-compose.yml
git add frontend/
if git diff --staged --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$COMMIT_MSG"
fi

echo "=== Pushing to git ==="
git push

# Pe server: creeaza folderul daca nu exista (ex: ~/backend/flipo5 pentru mai multe aplicatii)
REMOTE_PATH="${DEPLOY_PATH:-~/backend/flipo5}"
echo "=== Deploying to $SERVER (path: $REMOTE_PATH) ==="
# mkdir -p creaza tot path-ul; apoi cd si git pull + docker
ssh "$SERVER" "mkdir -p $REMOTE_PATH && cd $REMOTE_PATH && git pull && docker compose build api && docker compose up -d"
echo "Done. Check: ssh $SERVER 'cd $REMOTE_PATH && docker compose ps'"
echo "Logs: ssh $SERVER 'cd $REMOTE_PATH && docker compose logs api --tail 20'"
