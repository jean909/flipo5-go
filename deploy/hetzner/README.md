# Flipo5 – Deploy pe Hetzner

Backend (Go API) pe Hetzner. Frontend poate rula local și se conectează la backend-ul de pe server.

## Deploy cu Docker (recomandat)

### Deploy rapid (după modificări)

**Windows (PowerShell)** – folosește prefixul `.\` (obligatoriu):

```powershell
cd "C:\Users\DeveloperPC\Downloads\Flipo5 GO"

# Cu parametri
.\deploy\hetzner\deploy-docker.ps1 -Server "root@YOUR_SERVER_IP" -Message "Deploy: sync"

# Sau cu env var
$env:DEPLOY_SERVER = "root@YOUR_SERVER_IP"
.\deploy\hetzner\deploy-docker.ps1
```

**Linux / Git Bash:**

```bash
# Setează IP-ul o dată
export DEPLOY_SERVER=root@YOUR_SERVER_IP

# La fiecare modificare: git add, commit, apoi:
./deploy/hetzner/deploy-docker.sh
```

Scriptul face: `git push` → pe server: `git pull` + `docker compose build api` + `up -d`.

### Workers – mai multă paralelizare

În `.env` pe server, adaugă pentru viteză mai bună (Hetzner AX41 suportă):

```env
ASYNQ_CONCURRENCY=12
```

Default e 8. Cu 12–16, mai multe joburi (chat/image/video) rulează în paralel = experiență mai fluidă. Nu depăși 20 (Replicate are rate limits).

## Arquitectură

```
[Windows local]                    [Hetzner]
  Frontend (localhost:3000)  --->  Docker (API + Redis)
  npm run dev                      Supabase DB
  Dezvoltare                       Producție
```

## 1. Pe server (Hetzner)

### Prima instalare

```bash
# SSH pe server
ssh root@YOUR_SERVER_IP

# Clonează repo și rulează setup
git clone https://github.com/YOUR_REPO/flipo5.git /tmp/flipo5
cd /tmp/flipo5
sudo bash deploy/hetzner/setup.sh
```

### Configurare .env

```bash
sudo nano /opt/flipo5/.env
```

Setări esențiale:

```env
PORT=8080
DATABASE_URL=postgres://flipo5:CHANGE_ME@localhost:5432/flipo5?sslmode=disable
REDIS_URL=redis://localhost:6379   # Local. Upstash ca backup: schimbă la URL Upstash dacă Redis local cade

REPLICATE_API_TOKEN=...
REPLICATE_MODEL_TEXT=meta/meta-llama-3-70b-instruct
REPLICATE_MODEL_IMAGE=bytedance/seedream-4.5
REPLICATE_MODEL_VIDEO=...

# Supabase (același proiect ca frontend-ul)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_JWT_SECRET=...   # din Project Settings → API → JWT Secret
SUPABASE_SERVICE_ROLE_KEY=...  # din Project Settings → API → service_role

JWT_SECRET=minim-32-caractere-pentru-producție
```

**CORS** – dacă frontend-ul rulează pe alt domeniu/port (ex. `http://localhost:3000` sau `https://app.example.com`), API-ul trebuie să permită originea. Setează în `.env`:

```env
# Origini permise, separate prin virgulă. Implicit: http://localhost:3000, http://127.0.0.1:3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://domeniul-tau.ro
```

Fără `CORS_ORIGINS`, backend-ul permite doar localhost. Pentru producție pune și URL-ul frontend-ului. După modificare: restart API (`systemctl restart flipo5-api` sau `docker compose restart api`).

### Copiază systemd service

```bash
sudo cp /tmp/flipo5/deploy/hetzner/flipo5-api.service /etc/systemd/system/
sudo systemctl daemon-reload
```

## 2. Build & deploy de pe Windows

```powershell
cd "c:\Users\DeveloperPC\Downloads\Flipo5 GO"

# Build pentru Linux
$env:GOOS="linux"; $env:GOARCH="amd64"; $env:CGO_ENABLED="0"
go build -o backend/flipo5-api.exe backend/cmd/api
# Note: pe Windows go build produce .exe - redenumit în flipo5-api pentru Linux

# Variantă corectă (produce flipo5-api pentru Linux):
cd backend
$env:GOOS="linux"; $env:GOARCH="amd64"; $env:CGO_ENABLED="0"
go build -o flipo5-api ./cmd/api

# Copiază pe server (folosește scp de la Git Bash sau WSL)
scp flipo5-api root@YOUR_SERVER_IP:/opt/flipo5/
ssh root@YOUR_SERVER_IP "sudo chown flipo5:flipo5 /opt/flipo5/flipo5-api && sudo systemctl restart flipo5-api"
```

Sau folosește scriptul `deploy.sh` din WSL / Git Bash:

```bash
SERVER=root@YOUR_SERVER_IP ./deploy/hetzner/deploy.sh
```

## 3. Frontend local → Backend remote

În `frontend/.env.local`:

```env
# Backend pe Hetzner (IP sau domeniu)
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:8080

# Sau cu domeniu/HTTPS:
# NEXT_PUBLIC_API_URL=https://api.flipo5.com
```

Pornește frontend-ul local:

```bash
cd frontend
npm run dev
```

App-ul de pe localhost:3000 va folosi API-ul de pe server.

## 4. CORS & firewall

- CORS permite `*` (toate origin-urile) – localhost merge fără probleme
- Deschide portul 8080 în firewall:

```bash
sudo ufw allow 8080/tcp
sudo ufw enable
```

## 5. HTTPS (opțional)

Pentru producție cu domeniu:

1. Instalează Caddy sau Nginx ca reverse proxy
2. Configurează SSL (Let's Encrypt)
3. Pune API-ul în spatele proxy-ului pe port 443

## Verificare

```bash
# Health
curl http://YOUR_SERVER_IP:8080/health
curl http://YOUR_SERVER_IP:8080/health/ready

# Logs
sudo journalctl -u flipo5-api -f
```

## Troubleshooting: "Project not found" după create

Dacă creezi un proiect și primești "Project not found" când intri în el:

1. **DATABASE_URL pe server** – Trebuie să fie același Supabase DB ca în development. Verifică:
   ```bash
   ssh root@YOUR_IP "cd ~/my-backend && grep DATABASE_URL .env"
   ```
   Folosește **direct connection** (port 5432), nu pooler (6543):
   `postgresql://postgres:PASSWORD@db.XXX.supabase.co:5432/postgres`

2. **Migrare** – La pornire, API-ul rulează schema. Verifică în logs:
   ```bash
   ssh root@YOUR_IP "cd ~/my-backend && docker compose logs api --tail 50"
   ```
   Caută `migrate: ok` (succes) sau `migrate FAILED` (eroare – tabelul `projects` poate lipsi).

3. **createProject vs getProject** – Dacă create reușește dar get returnează 404, backend-ul loghează:
   - `[createProject] ok id=... user=...` – create a mers
   - `[getProject] notFound project=... user=...` – get nu găsește (posibil DB diferit sau user_id mismatch)
