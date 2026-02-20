# Rulează o singură dată dacă push-ul e încă mare (arhiva a fost comisă în trecut).
# Elimină toate .zip din întregul istoric Git.
# Usage: din root-ul repo (Flipo5 GO): .\deploy\hetzner\git-remove-zip-from-history.ps1

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

Write-Host "Elimin *.zip din istoric (git filter-branch)..." -ForegroundColor Yellow
git filter-branch -f --index-filter "git rm -q --cached --ignore-unmatch *.zip" --prune-empty -- --all
if ($LASTEXITCODE -eq 0) {
    Write-Host "Gata. Acum: git push --force-with-lease (rescrie istoric pe remote)." -ForegroundColor Green
} else {
    Write-Host "Alternativă: pip install git-filter-repo, apoi:" -ForegroundColor Yellow
    Write-Host '  git filter-repo --path-glob "*.zip" --invert-paths --force' -ForegroundColor Cyan
}
