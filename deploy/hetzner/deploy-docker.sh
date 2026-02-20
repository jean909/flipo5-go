#!/bin/bash
# Deploy Flipo5 backend (Docker) to Hetzner
# Face: git add, commit, push + deploy pe server
# Usage: ./deploy-docker.sh [user@SERVER_IP] ["commit message"]
# Or: DEPLOY_SERVER=root@1.2.3.4 ./deploy-docker.sh ["commit message"]

set -e
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Server: primul arg dacă nu e mesaj, sau DEPLOY_SERVER
if [[ "$1" == root@* ]] || [[ "$1" == *@* ]]; then
  SERVER="$1"
  COMMIT_MSG="${2:-Deploy: sync}"
else
  SERVER="${DEPLOY_SERVER:-$1}"
  COMMIT_MSG="${2:-$1}"
  [ -z "$COMMIT_MSG" ] && COMMIT_MSG="Deploy: sync"
fi

if [ -z "$SERVER" ]; then
  echo "Usage: DEPLOY_SERVER=root@IP ./deploy-docker.sh [\"commit msg\"]"
  echo "   Or: ./deploy-docker.sh root@IP [\"commit msg\"]"
  exit 1
fi

echo "=== Git add & commit (backend + deploy, fără zip/archives) ==="
# Scoate din staging orice zip
git reset HEAD -- '*.zip' 2>/dev/null || true
# Elimină din tracking orice .zip încă în repo (ex: a fost comis în trecut, apoi șters de pe disc)
for f in $(git ls-files '*.zip' 2>/dev/null); do git rm --cached "$f" 2>/dev/null || true; done
git add backend/
git add deploy/
git add .gitignore
# optional: include frontend
git add frontend/
if git diff --staged --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$COMMIT_MSG"
fi

echo "=== Pushing to git ==="
git push

echo "=== Deploying to $SERVER ==="
ssh "$SERVER" "cd ~/my-backend && git pull && docker compose build api && docker compose up -d"
echo "Done. Check: ssh $SERVER 'docker compose ps'"
echo "Logs: ssh $SERVER 'docker compose logs api --tail 20'"
