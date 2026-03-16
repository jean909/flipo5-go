# Deploy backend pe Hetzner (Docker)

Scripturile sunt în `backend/deploy/` ca să poți avea mai multe aplicații, fiecare cu backendul ei.

---

## Pas cu pas: prima dată pe server (inclusiv .env)

### Pas 1 – Conectare la server

Din terminal (PowerShell, CMD sau WSL), conectează-te la serverul Hetzner:

```bash
ssh root@IP_SERVER
```

Înlocuiește `IP_SERVER` cu IP-ul real al serverului (ex. `95.217.123.45`). La prima conectare ți se poate cere să accepți fingerprint-ul (scrii `yes`).

---

### Pas 2 – Directorul proiectului și clone (doar prima dată)

Dacă nu ai încă proiectul pe server:

```bash
mkdir -p ~/backend/flipo5
cd ~/backend/flipo5
git clone https://github.com/YOUR_REPO/Flipo5-GO.git .
```

*(Înlocuiește `YOUR_REPO` cu repo-ul tău real; punctul de la final înseamnă „clonează aici în folderul curent”.)*

Dacă proiectul există deja (ai făcut deploy înainte), doar intră în folder:

```bash
cd ~/backend/flipo5
```

---

### Pas 3 – Fișierul .env pe server

**3.1 Crearea fișierului .env**

În `~/backend/flipo5` (același folder unde e `docker-compose.yml`), copiază exemplul și deschide-l pentru editare:

```bash
cd ~/backend/flipo5
cp .env.example .env
nano .env
```

*(Dacă nu ai `nano`, poți folosi `vim .env` sau `vi .env`.)*

**3.2 Ce completezi în .env**

Completează (și decomentează unde e cazul) valorile reale. Minim pentru a rula:

| Variabilă | Exemplu / ce pui |
|-----------|-------------------|
| `PORT` | `8080` (rămâne așa) |
| `JWT_SECRET` | un string lung, aleatoriu (min. 32 caractere), doar pentru producție |
| `DATABASE_URL` | connection string-ul PostgreSQL (ex. de la Supabase) |
| `REDIS_URL` | În Docker compose e setat automat la `redis://redis:6379`; poți lăsa sau pune același lucru în .env |
| `REPLICATE_API_TOKEN` | token-ul de la replicate.com |
| `SUPABASE_URL` | `https://xxx.supabase.co` (proiectul tău Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | cheia Service Role din Supabase (Settings → API) |

**Pentru site live pe flipo5.com**, adaugă (sau decomentează) și:

```bash
CORS_ORIGINS=https://flipo5.com,https://www.flipo5.com
```

Dacă același fișier .env îl folosești și **local** la dezvoltare (frontend pe localhost:3000), poți pune ambele: `CORS_ORIGINS=https://flipo5.com,https://www.flipo5.com,http://localhost:3000,http://127.0.0.1:3000`. Pe server doar cu flipo5.com e suficient; local, dacă nu setezi `CORS_ORIGINS`, backend-ul permite implicit localhost (vezi și secțiunea Production mai jos).

**3.3 Salvarea în nano**

- `Ctrl+O` → Enter (salvează)
- `Ctrl+X` (ieși)

În **vim**: apasă `Esc`, scrie `:wq`, Enter.

---

### Pas 4 – Pornirea containerelor

Tot din `~/backend/flipo5`:

```bash
docker compose up -d
```

Așteaptă câteva secunde. Verifică că rulează:

```bash
docker compose ps
```

Ar trebui să vezi containerele `flipo5-api` și `flipo5-redis` cu status „Up”.

---

### Pas 5 – Verificare că API-ul răspunde

Pe server:

```bash
curl -s http://localhost:8080/health
```

Răspuns așteptat: ceva de forma `{"ok":true}` sau similar. În logs:

```bash
docker compose logs api --tail 30
```

Caută „migrate: ok” și „api listening on :8080”. Dacă apar erori (ex. `DATABASE_URL` greșit), corectezi în `.env` și repeti:

```bash
docker compose up -d
docker compose logs api --tail 30
```

---

### Pas 6 – După ce API-ul merge pe localhost:8080

- Pentru **HTTPS** și domeniu **api.flipo5.com**: configurezi reverse proxy (Caddy/Nginx) și DNS – vezi secțiunea **Production pe flipo5.com** mai jos.
- Pentru **deploy ulterior** (cod nou): folosești scriptul de deploy sau `git pull` + `docker compose build api` + `docker compose up -d` – vezi **Deploy ulterior**.

---

## Production pe flipo5.com (site live)

Ca **backend-ul** să răspundă la **flipo5.com** și frontend-ul să poată apela API-ul:

### 1. Backend (pe server): CORS și .env

Dacă ai urmat **Pas cu pas** de mai sus, fișierul **`.env`** există deja. Deschide-l din nou și adaugă (sau decomentează) linia:

```bash
nano ~/backend/flipo5/.env
```

Adaugă sau actualizează:

```bash
# Origini permise pentru request-uri de la browser (domeniul unde e frontend-ul)
CORS_ORIGINS=https://flipo5.com,https://www.flipo5.com
```

Salvează (`Ctrl+O`, Enter, `Ctrl+X` în nano), apoi repornește API-ul ca să ia noile variabile:

```bash
cd ~/backend/flipo5
docker compose up -d
```

Fără `CORS_ORIGINS` setat pentru producție, browser-ul va bloca request-urile de la flipo5.com către API (CORS error).

**Rulare locală (dezvoltare):** Pe server pui doar domeniile de producție (ca mai sus). Când rulezi backend-ul **local** (pe PC), folosești un `.env` separat; dacă **nu** setezi `CORS_ORIGINS` în acel .env local, backend-ul folosește implicit `http://localhost:3000,http://127.0.0.1:3000`, deci frontend-ul de pe localhost:3000 merge fără nicio schimbare. Dacă vrei **același** conținut .env atât pe server cât și local (ex. îl copiezi), poți seta o singură linie care acoperă ambele: `CORS_ORIGINS=https://flipo5.com,https://www.flipo5.com,http://localhost:3000,http://127.0.0.1:3000` – atunci merge și producția și dezvoltarea locală.

### 2. Frontend (Vercel / Netlify / etc.): variabile de mediu

La build și runtime, frontend-ul trebuie să știe URL-ul API-ului și (opțional) URL-ul site-ului:

| Variabilă | Exemplu | Descriere |
|-----------|---------|-----------|
| `NEXT_PUBLIC_API_URL` | `https://api.flipo5.com` | URL-ul backend-ului (obligatoriu pentru apeluri API) |
| `NEXT_PUBLIC_SITE_URL` | `https://flipo5.com` | URL-ul site-ului (SEO, OG; default în cod e deja flipo5.com) |

Dacă API-ul e pe subdomeniu (recomandat), ex.: **api.flipo5.com** → setezi `NEXT_PUBLIC_API_URL=https://api.flipo5.com`.

### 3. Reverse proxy pe server (HTTPS pentru API)

Docker expune doar portul **8080**. Pentru **HTTPS** și domeniu (ex. **api.flipo5.com**), folosești un reverse proxy pe server (Caddy sau Nginx).

**Exemplu Caddy** (HTTPS automat cu Let's Encrypt). Pe server, creezi `/etc/caddy/Caddyfile` (sau unde rulează Caddy):

```
api.flipo5.com {
    reverse_proxy localhost:8080
}
```

Apoi: `systemctl reload caddy` (sau restart). Caddy obține singur certificatul SSL pentru `api.flipo5.com`.

**Exemplu Nginx** (trebuie configurat SSL manual sau cu certbot):

```nginx
server {
    listen 443 ssl;
    server_name api.flipo5.com;
    ssl_certificate     /etc/letsencrypt/live/api.flipo5.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.flipo5.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### 4. DNS

Pentru **api.flipo5.com**: înregistrare **A** (sau **CNAME**) către IP-ul serverului Hetzner. După ce DNS-ul e propagat și Caddy/Nginx rulează, `https://api.flipo5.com/health` ar trebui să răspundă.

### Rezumat

| Unde | Ce setez |
|------|----------|
| **Server (.env)** | `CORS_ORIGINS=https://flipo5.com,https://www.flipo5.com` |
| **Frontend (Vercel etc.)** | `NEXT_PUBLIC_API_URL=https://api.flipo5.com` |
| **Server (Caddy/Nginx)** | Reverse proxy `api.flipo5.com` → `localhost:8080` + HTTPS |
| **DNS** | A/CNAME pentru `api.flipo5.com` → IP server |

---

## Path pe server

Implicit: **`~/backend/flipo5`**. Folderul e creat cu `mkdir -p` dacă nu există (pentru mai multe backend-uri: `~/backend/flipo5`, `~/backend/alt-app`, etc.).

Setează alt path cu env:
- PowerShell: `$env:DEPLOY_PATH = "~/backend/flipo5"`
- Bash: `export DEPLOY_PATH=~/backend/flipo5`

## Prima dată pe server (rezumat)

Pentru pași detaliați (conectare SSH, creare .env cu `nano`, ce variabile completezi, verificare), vezi secțiunea **Pas cu pas** de la începutul documentului. Rezumat:

```bash
ssh root@IP_SERVER
cd ~/backend/flipo5   # sau: mkdir -p ~/backend/flipo5 && git clone ... && cd ~/backend/flipo5
cp .env.example .env && nano .env   # completezi DATABASE_URL, REDIS_URL, REPLICATE_API_TOKEN, SUPABASE_*, CORS_ORIGINS
docker compose up -d
curl -s http://localhost:8080/health
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

**Dacă SSH dă „Permission denied” (scriptul nu se poate conecta):** Codul este deja push-uit. Fă deploy manual:

1. Conectează-te la server (CMD: `ssh root@IP_SERVER` sau consola Hetzner).
2. Pe server rulează:
   ```bash
   cd ~/backend/flipo5
   git pull
   docker compose build api
   docker compose up -d
   ```
3. Verificare: `docker compose logs api --tail 30` (caută „migrate: ok”).

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
