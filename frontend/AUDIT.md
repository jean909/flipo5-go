# Frontend audit – design, viteză, a11y

## Ce e deja bine (verificat)

- **Design centralizat**: `globals.css` (variabile `--theme-*`) + `tailwind.config.ts` (culori `theme.*`) – fără culori hardcodate în componente.
- **Fonturi**: Syne (display), DM Sans (body), `display: swap` – CLS redus.
- **Scrollbar**: clasa `scrollbar-subtle` folosită consecvent pe zone scrollabile (dashboard, jobs, studio, admin, Select).
- **i18n**: chei centralizate în `src/lib/i18n.ts`, folosite cu `t(locale, key)`.

## Modificări aplicate

### 1. Viewport și metadata (viteză / UX)
- **`app/layout.tsx`**: export `viewport` (Next) – `width: device-width`, `initialScale: 1`, `themeColor: #000000` – viewport corect și theme color pentru mobile.

### 2. Accesibilitate (a11y)
- **`ConfirmDialog`**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pe titlu, focus pe butonul de confirmare la deschidere.
- **`ImageViewModal`**: `role="dialog"`, `aria-modal="true"`, `aria-label` din i18n (`image.viewer`), focus pe butonul Close la deschidere.

### 3. Consistență UI
- **Admin layout**: `scrollbar-subtle` pe `<main>` (ca restul app).
- **Admin dashboard**: text loading unificat: „Loading…”.

### 4. Imagini (viteză)
- **JobCard, dashboard, ImageViewModal**: `decoding="async"` pe `<img>` unde lipsea; `loading="lazy"` pe thumbnails (liste, galerii) pentru a nu bloca primul render.

## Recomandări opționale (nu aplicate)

- **next/image**: pentru imaginile statice (ex. favicon, assets din `/public`) poți folosi `next/image`; pentru URL-uri dinamice (proxy/media) `<img loading="lazy" decoding="async">` rămâne ok.
- **Dynamic import**: componente grele (ex. `VideoPlayer`, `ReactMarkdown`) pot fi încărcate cu `next/dynamic` pe rute unde nu sunt imediat vizibile.
- **Bundle**: `next build` + analiza de bundle (ex. `@next/bundle-analyzer`) dacă vrei să optimizezi mai departe.
