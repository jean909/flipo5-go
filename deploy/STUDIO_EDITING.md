# Edit Studio - Roadmap

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
