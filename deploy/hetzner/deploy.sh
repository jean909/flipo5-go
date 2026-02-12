#!/bin/bash
# Deploy Flipo5 API to Hetzner server
# Usage: ./deploy.sh user@SERVER_IP
# Or: SERVER=user@1.2.3.4 ./deploy.sh

SERVER="${SERVER:-$1}"
if [ -z "$SERVER" ]; then
  echo "Usage: SERVER=user@IP ./deploy.sh  OR  ./deploy.sh user@IP"
  exit 1
fi

set -e
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT/backend"

echo "=== Building for Linux ==="
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -buildvcs=false -o flipo5-api ./cmd/api

echo "=== Deploying to $SERVER ==="
scp flipo5-api "$SERVER:/tmp/"
scp "$REPO_ROOT/deploy/hetzner/flipo5-api.service" "$SERVER:/tmp/"
ssh "$SERVER" "sudo mv /tmp/flipo5-api /opt/flipo5/ && sudo chown flipo5:flipo5 /opt/flipo5/flipo5-api && sudo mv /tmp/flipo5-api.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart flipo5-api"
echo "Done. Check: ssh $SERVER 'sudo systemctl status flipo5-api'"
