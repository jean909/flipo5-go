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

## Ce face scriptul (tot ce trebuie – rulezi doar scriptul)

1. **Local:** Git add (backend/, deploy/, docker-compose.yml, frontend/, .env.example dacă există), commit, push.
2. **Pe server:** `mkdir -p` path → dacă nu e clone git, `git clone`; altfel `git pull` → `docker compose build api` → `docker compose up -d`.

Nu e nevoie să dai manual comenzi pe server pentru deploy ulterior – scriptul face tot. La final îți afișează comenzile de verificare (ps, logs); în logs poți verifica dacă migrările au mers ok (`migrate: ok` sau `migrate FAILED`).

**Migrări DB:** La fiecare pornire a containerului, API-ul rulează automat `schema.sql` + `migrations/*.sql`. Tabele noi (ex. `translation_projects`) apar după ce rulezi scriptul și containerul pornește.

## Port 8080 deja folosit

Dacă vezi `Bind for 0.0.0.0:8080 failed: port is already allocated`:

**1. Vezi ce folosește 8080:**
```bash
# Variantă 1 (recomandat)
ss -tlnp | grep 8080

# Variantă 2
lsof -i :8080
```

**2. Dacă e un container Docker:**
```bash
docker ps
docker stop <container_id_sau_nume>
# sau oprește toate containerele din proiect:
cd ~/backend/flipo5 && docker compose down
```

**3. Dacă e un proces (ex. vechiul API ruleat direct):**
```bash
# Din output la ss/lsof ai PID-ul (ultima coloană)
kill <PID>
# sau forțat: kill -9 <PID>
```

Apoi rulezi din nou: `docker compose up -d`.

## Închidere și ștergere my-backend (sau alt proiect vechi)

Ca să păstrezi doar Flipo5 și să închizi + ștergi datele de la proiectul vechi (ex. my-backend):

```bash
# 1. Oprește containerele vechi (numele din docker ps)
docker stop my-backend-api-1 my-backend-redis-1

# 2. Șterge containerele
docker rm my-backend-api-1 my-backend-redis-1

# 3. Șterge volumele (date Redis etc.) – opțional, dacă vrei totul șters
docker volume ls | grep my-backend
docker volume rm <nume_volume_my-backend>

# 4. Șterge imaginile vechi (opțional, eliberează spațiu)
docker image rm my-backend-api
```

Apoi pornești doar Flipo5:
```bash
cd ~/backend/flipo5
docker compose up -d
```
