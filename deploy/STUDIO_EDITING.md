# Edit Studio - Roadmap

## Audit fixes (proiectele nu se deschideau)

1. **Frontend `/dashboard/studio/[id]`**: La primul render `useParams().id` poate fi `undefined` (Next App Router). Efectul apela `getProject(id)` doar când `id` exista, dar nu seta niciodată `setLoading(false)` când `!id` → loading rămânea true la infinit. **Fix**: când `!id` apelăm `setLoading(false)` și afișăm "Project not found" + link înapoi; tratăm și `r.project ?? null` pentru răspunsuri inconsistente.
2. **Backend Chi rute**: `GET /api/projects/{id}` era înregistrat înainte de `GET /api/projects/items/{itemId}/versions`, deci request-uri către list versions erau potrivite ca `id="items"` și dădeau 400. **Fix**: rutele mai specifice (`/items/...`) sunt înregistrate înainte de `/{id}`.
3. **Add from Content modal**: Thumbnail-urile foloseau URL-ul raw (ex. `uploads/...`); pentru media din R2 trebuie proxy cu token. **Fix**: folosim `getMediaDisplayUrl(url, mediaToken)` pentru img/video în grid + `decoding="async"` pe img.

4. **Id din useParams**: În unele versiuni Next, `params.id` poate fi `string | string[]`. **Fix**: hook `useProjectId()` care normalizează la string (dacă e array, ia `[0]`).

5. **Media fără token**: URL-uri relative (ex. `uploads/...`) au nevoie de `/api/media?key=...&token=...`. Dacă token nu e încă încărcat, `getMediaDisplayUrl(url, null)` returna key-ul raw → img cu `src="uploads/..."` (request relativ, 404). **Fix**: helper `getSafeDisplayUrl(url, token)` – returnează `null` când URL e relativ și token lipsește; canvas și thumbnails afișează media doar când avem URL valid; placeholder „…” când lipsește; Download folosește `displayUrl` (cu proxy) și butonul e disabled când `!displayUrl`.

6. **fetchProject**: Setare `projectName` la `''` în catch; folosire `proj ?? null` pentru consistență.

7. **Upload response**: Verificare defensivă `res?.item?.id` înainte de adăugare în listă; mesaj de eroare dacă răspuns invalid.

8. **Loading la schimbare id**: Când `id` devine disponibil (ex. după hydration) sau se schimbă (navigare la alt proiect), `setLoading(true)` la începutul efectului ca să se vadă loading până la rezolvarea `getProject`.

### Verificare suplimentară
9. **handleDeleteProject**: Dialogul se închide imediat (`setPendingDeleteProject(false)`), apoi se face delete; la eroare se afișează `setError('Failed to delete project')`.
10. **handleRemoveItem / handleSaveName**: La eroare se afișează mesaj în bara de error (nu fail silent).
11. **handleAddItem**: Verificare `res?.id` înainte de adăugare; dacă lipsește, `setError('Add failed')`.
12. **Create project (listă)**: Dacă `createProject` nu returnează `id`, nu se face redirect la `/studio/undefined`; se afișează "Could not create project".
13. **Modal Add from Content**: State `contentLoading`; când e deschis se afișează "Loading…" până la încărcare, apoi "No images or videos in My Content yet." (i18n `studio.noContent`) dacă lista e goală.

### Toate fluxurile verificate (session, erori, backend)

14. **Backend addProjectItem – source_url**: Backend-ul accepta doar `source_url` cu `http://` sau `https://`. Din "Add from Content" se trimit chei relative (ex. `uploads/user-id/uuid.jpg`). **Fix**: Backend acceptă orice `source_url` netrimis gol, fără `..` sau newline; se salvează ca atare în DB; frontend folosește `getMediaDisplayUrl` la afișare.

15. **Listă proiecte**: `listProjects` la 401 arunca "Failed to load projects". **Fix**: API aruncă `session_expired` la 401; la refresh, catch face redirect la `/start`; la eroare generică se afișează `listError` (banner cu ×). **Delete proiect (din listă)**: la eroare se afișează "Failed to delete project"; la 401 redirect. **Rename (din listă)**: la 401 redirect; la alte erori se afișează mesaj în `nameError`.

16. **API 401 consistență**: Toate apelurile studio aruncă `session_expired` la 401: `listProjects`, `updateProject`, `deleteProject`, `addProjectItem`, `removeProjectItem`, `uploadProjectItem`, `listContent`. Pe pagina de detaliu proiect, toate handler-ele (handleSaveName, handleAddItem, handleRemoveItem, handleUpload, handleDeleteProject) și efectul pentru listContent verifică `session_expired` și fac redirect la `/start`.

### Duplicat proiect + imagine uploadată dispare
17. **Duplicat la update (rename)**: După rename se făcea doar update local; lista putea rămâne în stare inconsistentă sau cu dubluri. **Fix**: După rename reușit se apelează `refresh()` – lista vine din server și se aplică `dedupeProjects`. **Double-create**: La create, dacă user dă dublu-click se puteau crea două proiecte. **Fix**: La începutul `handleCreate` se face `if (creating) return;`. Lista se refetch-ează și la `visibilitychange` când revii pe tab/pagină.
18. **Imagine uploadată dispărea după upload**: După upload am introdus `fetchProject()` imediat, dar refetch-ul poate returna date încă fără item-ul nou (cache/replica), iar setarea state-ului ștergea poza. **Fix**: Nu mai apelăm `fetchProject()` imediat după upload; rămânem pe răspunsul de la upload (item-ul e deja în state). La ieșire din proiect și re-intrare, `getProject(id)` reîncarcă lista de pe server, unde item-ul e deja salvat.

## Implemented (Phase 1)
- ✅ Sidebar: Edit Studio link
- ✅ Projects: CRUD (create, list, get, update, delete)
- ✅ Project items: add from My Content, remove
- ✅ **Upload from device**: poze/video oriunde (nu doar din content)
- ✅ **Versiuni**: DB + API; salvare eficientă (upload+version = 1 request)
- ✅ Project detail page with thumbnails, add from content, upload

## Flow versiuni
1. **Add item (din content)**: `POST /projects/{id}/items` cu `source_url` – fără upload, doar referință
2. **Add item (upload)**: `POST /projects/{id}/items/upload` multipart – upload R2 + add item în 1 request
3. **Add version (URL)**: `POST /projects/items/{id}/versions` cu `url` – când editorul exportă la URL (ex. imgproxy)
4. **Add version (upload)**: `POST /projects/items/{id}/versions/upload` multipart – upload R2 + add version în 1 request

## Resurse reutilizate
- Upload: același R2/Store ca chat attachments (uploads/{user_id}/{uuid}.ext)
- API upload: același pattern ca `/api/upload`, limita 50MB
- DB: projects, projects_items, projects_versions

**IMPORTANT**: Pentru upload în Edit Studio, backend-ul trebuie să aibă S3/R2 configurat (CLOUDFLARE_R2_* sau S3_* în .env). Dacă Store e nil, upload returnează 503 "upload not configured".

## Next steps

### Phase 2 - Image editing
- **Canvas editor**: Crop, resize, rotate using client-side Canvas or library (e.g. Cropper.js, Fabric.js)
- **Save as version**: On edit, upload result to R2 via backend, call `POST /projects/items/{id}/versions`
- **Version timeline**: UI to browse/restore previous versions

### Phase 3 - Video editing (FFmpeg)
- **Container**: Add FFmpeg to Docker or separate worker container
- **Operations**: Trim, concat, basic filters
- **Flow**: User selects trim range → backend creates job → FFmpeg worker processes → upload to R2 → new version
- **Queue**: Use existing Asynq for video edit jobs

### Phase 4 - Advanced
- **Upload**: Add images/videos from device (not just My Content)
- **Export**: Download project as ZIP
- **Collaboration**: Share project (future)
