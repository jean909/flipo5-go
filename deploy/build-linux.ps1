# Build Flipo5 API for Linux (Hetzner deploy)
# Run from project root: .\deploy\build-linux.ps1

$env:GOOS = "linux"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "0"

Push-Location backend
go build -o flipo5-api ./cmd/api
Pop-Location

Write-Host "Built: backend/flipo5-api (Linux binary)"
Write-Host "Deploy: scp backend/flipo5-api root@YOUR_IP:/opt/flipo5/"
