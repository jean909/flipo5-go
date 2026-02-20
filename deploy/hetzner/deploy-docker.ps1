# Deploy Flipo5 backend (Docker) to Hetzner
# Face: git add, commit, push + deploy pe server
# Usage: .\deploy-docker.ps1 -Server "root@YOUR_IP" [-Message "commit msg"]
# Or: $env:DEPLOY_SERVER="root@YOUR_IP"; .\deploy-docker.ps1

param(
    [string]$Server = $env:DEPLOY_SERVER,
    [string]$Message = "Deploy: sync"
)

if (-not $Server) {
    Write-Host "Usage: .\deploy-docker.ps1 -Server `"root@YOUR_IP`" [-Message `"commit msg`"]"
    exit 1
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

Write-Host "=== Git add & commit (backend + deploy, fără zip/archives) ==="
git reset HEAD -- "*.zip" 2>$null; $null
git add backend/
git add deploy/
git add .gitignore
git add frontend/
$staged = git diff --staged --name-only
if ($staged) {
    git commit -m $Message
} else {
    Write-Host "Nothing to commit."
}

Write-Host "=== Pushing to git ==="
git push

Write-Host "=== Deploying to $Server ==="
ssh $Server "cd ~/my-backend && git pull && docker compose build api && docker compose up -d"
Write-Host "Done. Check: ssh $Server 'docker compose ps'"
Write-Host "Logs: ssh $Server 'docker compose logs api --tail 20'"
