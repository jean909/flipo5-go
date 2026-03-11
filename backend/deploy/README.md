# Deploy backend pe Hetzner (Docker)

Scripturile sunt în `backend/deploy/` ca să poți avea mai multe aplicații, fiecare cu backendul ei.

## Path pe server

Implicit: **`~/backend/flipo5`**. Folderul e creat cu `mkdir -p` dacă nu există (pentru mai multe backend-uri: `~/backend/flipo5`, `~/backend/alt-app`, etc.).

Setează alt path cu env:
- PowerShell: `$env:DEPLOY_PATH = "~/backend/flipo5"`
- Bash: `export DEPLOY_PATH=~/backend/flipo5`

## Prima dată pe server

Pe server, după ce ai creat path-ul (sau scriptul l-a creat), clonează repo-ul o dată:

```bash
mkdir -p ~/backend/flipo5
git clone https://github.com/YOUR_REPO/Flipo5-GO.git ~/backend/flipo5
cd ~/backend/flipo5
# pune .env cu DATABASE_URL, REDIS_URL, REPLICATE_API_TOKEN, etc.
docker compose up -d
```

## Deploy ulterior (de pe Windows)

Din **repo root**:

```powershell
$env:DEPLOY_SERVER = "root@IP_SERVER"
.\backend\deploy\deploy-hetzner.ps1
```

Sau cu parametri:

```powershell
.\backend\deploy\deploy-hetzner.ps1 -Server "root@IP_SERVER" -Message "Deploy: fix"
```

## Deploy ulterior (Bash / WSL)

Din **repo root**:

```bash
export DEPLOY_SERVER=root@IP_SERVER
./backend/deploy/deploy-hetzner.sh
```

## Ce face scriptul

1. Git add/commit (backend, deploy, docker-compose, frontend), push.
2. Pe server: `mkdir -p $DEPLOY_PATH` → `cd $DEPLOY_PATH` → `git pull` → `docker compose build api` → `docker compose up -d`.
