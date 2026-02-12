#!/bin/bash
# Flipo5 Hetzner bare metal setup (Ubuntu 22.04/24.04)
# Run as root: sudo bash setup.sh

set -e

echo "=== Flipo5 Hetzner setup ==="

apt update && apt upgrade -y
apt install -y curl git build-essential

# PostgreSQL
apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER flipo5 WITH PASSWORD 'CHANGE_ME';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE flipo5 OWNER flipo5;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE flipo5 TO flipo5;"

# Redis
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Go (optional - for building on server)
if ! command -v go &>/dev/null; then
  GO_VER="1.22.2"
  curl -sL "https://go.dev/dl/go${GO_VER}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/go.sh
  export PATH=$PATH:/usr/local/go/bin
fi

# App user & dir
useradd -r -s /bin/false flipo5 2>/dev/null || true
mkdir -p /opt/flipo5
chown flipo5:flipo5 /opt/flipo5

echo ""
echo "=== Done. Next steps ==="
echo "1. Edit /opt/flipo5/.env (DATABASE_URL, REDIS_URL, REPLICATE_API_TOKEN, SUPABASE_*)"
echo "2. Copy flipo5-api binary to /opt/flipo5/"
echo "3. systemctl enable flipo5-api && systemctl start flipo5-api"
