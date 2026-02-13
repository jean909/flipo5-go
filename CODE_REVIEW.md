# Code Review – Flipo5 GO

## 🔴 Critical (Security / Data)

### 1. **Secrets în `.env` (frontend)**
- `frontend/.env` conține `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` – acestea sunt în `.gitignore`, dar dacă repo-ul e partajat, verifică că nu sunt în git.
- `.env` nu trebuie comis în git – confirmă că `.gitignore` include `.env`.

### 2. **Token în URL (getMediaDisplayUrl)**
- `frontend/src/lib/api.ts` – token-ul este în query string: `/api/media?key=...&token=...`
- Token-urile în URL pot ajunge în server logs, cache, referrer. Preferabil: Bearer în header, sau signed URL temporar.

### 3. **Supabase init fără fallback**
- `frontend/src/lib/supabase.ts` – `process.env.NEXT_PUBLIC_SUPABASE_URL!` și `NEXT_PUBLIC_SUPABASE_ANON_KEY!` – `!` poate cauza crash la build dacă env lipsesc.
- Înlocuie cu fallback sau validare la runtime.

### 4. **JWT secret default**
- `backend/internal/config/config.go` – `JWT_SECRET` default `"change-me"` – periculos în producție.

---

## 🟠 Medium (Bugs / Logic)

### 5. **signInWithMagicLink – `window` fără check**
- `frontend/src/lib/api.ts:136` – `window.location.origin` – poate eșua la SSR (Next.js).
- `signUpWithPassword` folosește `typeof window !== 'undefined'`; `signInWithMagicLink` nu.

### 6. **checkEmail – paginare limitată**
- `backend/internal/api/handlers.go` – `checkEmail` verifică doar paginile 1 și 2 (max 100 de utilizatori). Dacă există mai mulți, pot exista false negatives.

### 7. **downloadMedia – whitelist de domenii**
- URL-urile din `storage.flipo5.com` sunt permise, dar `downloadMedia` nu verifică dacă URL-ul e de la storage-ul curent (poate fi SSRF dacă cineva trimite un URL extern care conține „flipo5.com”).

### 8. **fetchContent – cleanup incomplet**
- `frontend/src/app/dashboard/content/page.tsx` – `fetchContent` returnează cleanup, dar `cancelled` e setat în closure. Dacă componenta se unmountează rapid, promise-ul poate rămâne activ.

### 9. **JobsInProgressButton – fetchJobs la fiecare schimbare de locale**
- `useEffect(() => { fetchJobs(true); }, [fetchJobs])` – `fetchJobs` depinde de `locale` și `removeOptimisticJob`, deci se re-execută la schimbarea limbii.

---

## 🟡 Low (Code quality / maintainability)

### 10. **Loguri în producție**
- `backend/internal/api/handlers.go` – `log.Printf` pentru `[studio upload]`, `[getProject]` – utile în dev, dar pot fi prea verbose în producție. Consideră log level (debug vs info).

### 11. **Error handling silențios**
- Multe `.catch(() => {})` sau `.catch(() => setX([]))` – erorile sunt ignorate. Pentru debugging, poate fi util să loghezi sau să folosești un error boundary.

### 12. **Duplicate env keys**
- `frontend/.env` – `NEXT_PUBLIC_API_URL` apare de două ori (localhost și 138.201.123.238). Ultima valoare câștigă; poate fi confuz.

### 13. **Type assertion**
- `frontend/src/lib/api.ts` – `(e as { error?: string })` – repetat în multe locuri. Ar fi util un tip centralizat pentru erori API.

### 14. **useEffect dependencies**
- `frontend/src/app/dashboard/studio/[id]/page.tsx` – `fetchProject` în `useEffect` de visibility – `fetchProject` nu e în `useCallback`, deci se recreează la fiecare render.

---

## 🟢 Positiv

- **Backend**: `cancelled` în async flows pentru evitarea race conditions.
- **Frontend**: `cache: 'no-store'` și cache-busting pentru `getProject` și `listProjects`.
- **Auth**: Supabase JWT + JWKS pentru verificare token.
- **Storage**: `serveMedia` verifică că userul accesează doar `uploads/{user_id}/...`.
- **CORS**: configurat.
- **Rate limiting**: pe API și check-email.

---

## Rezumat

| Severitate | Count |
|------------|-------|
| 🔴 Critical | 4 |
| 🟠 Medium   | 5 |
| 🟡 Low     | 5 |

**Prioritate recomandată**: 1) Supabase init + fallback, 2) Token în URL (media), 3) JWT default, 4) signInWithMagicLink `window`.
