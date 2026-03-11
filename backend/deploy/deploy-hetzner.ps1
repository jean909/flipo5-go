# Deploy Flipo5 backend (Docker) to Hetzner
# Rulează din repo root sau din backend/. Pe server creează folderul dacă nu există (ex: ~/backend/flipo5).
# Usage: .\backend\deploy\deploy-hetzner.ps1 -Server "root@YOUR_IP" [-Message "commit msg"]
# Or: $env:DEPLOY_SERVER="root@YOUR_IP"; $env:DEPLOY_PATH="~/backend/flipo5"; .\backend\deploy\deploy-hetzner.ps1

param(
    [string]$Server = $env:DEPLOY_SERVER,
    [string]$Message = "Deploy: sync"
)

if (-not $Server) {
    Write-Host "Usage: .\backend\deploy\deploy-hetzner.ps1 -Server `"root@YOUR_IP`" [-Message `"commit msg`"]"
    Write-Host "  DEPLOY_PATH = path pe server (default: ~/backend/flipo5); folderul e creat daca nu exista."
    exit 1
}

# Repo root = parent of backend
$backendDir = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $backendDir
Set-Location $repoRoot

Write-Host "=== Git add & commit (backend + deploy, fara zip) ==="
git reset HEAD -- "*.zip" 2>$null; $null
git ls-files "*.zip" | ForEach-Object { git rm --cached $_ 2>$null }
git add backend/
git add deploy/
git add .gitignore
git add docker-compose.yml
git add frontend/
$staged = git diff --staged --name-only
if ($staged) {
    git commit -m $Message
} else {
    Write-Host "Nothing to commit."
}

Write-Host "=== Pushing to git ==="
git push

# Pe server: creeaza folderul daca nu exista (ex: ~/backend/flipo5 pentru mai multe aplicatii)
$RemotePath = if ($env:DEPLOY_PATH) { $env:DEPLOY_PATH } else { "~/backend/flipo5" }
Write-Host "=== Deploying to $Server (path: $RemotePath) ==="
# mkdir -p creaza tot path-ul; apoi cd si git pull + docker
$remoteCmd = "mkdir -p $RemotePath && cd $RemotePath && git pull && docker compose build api && docker compose up -d"
ssh $Server $remoteCmd
Write-Host "Done. Check: ssh $Server 'cd $RemotePath && docker compose ps'"
Write-Host "Logs: ssh $Server 'cd $RemotePath && docker compose logs api --tail 20'"
