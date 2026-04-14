# Resend pentru emailuri Supabase Auth

Toate emailurile trimise de **Supabase Auth** (confirmare cont, magic link, reset parolă) pot folosi Resend ca provider. Nu se pune nimic în codul Flipo5 — doar setări în **Supabase Dashboard** și contul tău Resend.

---

## Unde se configurează

**În Supabase**, nu în backendul Go. Supabase (GoTrue) trimite singur emailurile; tu îi spui să le trimită prin SMTP-ul Resend.

- **Nu** pui Resend în backend (API-ul Flipo5).
- **Nu** pui Resend în frontend.
- **Da**: în **Supabase Dashboard** → Authentication → SMTP Settings.

---

## Pași

### 1. În Resend

1. Conectează-te la [resend.com](https://resend.com).
2. **Verifică domeniul** de la care vrei să trimiți (ex. `noreply@flipo5.com`): [Resend → Domains](https://resend.com/domains).
3. **Creează un API Key**: [Resend → API Keys](https://resend.com/api-keys). Copiază cheia (o vei folosi ca parolă SMTP).

### 2. În Supabase Dashboard

1. Deschide proiectul → **Authentication** (meniul din stânga).
2. Mergi la **SMTP Settings** (sau **Email** / **Providers** în unele versiuni).
3. Activează **Custom SMTP** / **Enable Custom SMTP**.
4. Completează:

   | Câmp | Valoare |
   |------|--------|
   | **Sender email** | Adresa verificată la Resend (ex. `noreply@flipo5.com`) |
   | **Sender name** | ex. `Flipo5` sau `Flipo5 Support` |
   | **Host** | `smtp.resend.com` |
   | **Port** | `465` |
   | **Username** | `resend` (literal) |
   | **Password** | API Key-ul tău Resend (cel copiat la pasul 1) |

5. Salvează (Save).

După salvare, Supabase va trimite toate emailurile de auth (confirmare înregistrare, magic link, reset parolă) prin Resend.

---

## Email în spam – ce să faci

Ca mesajele să intre în inbox (nu în spam):

1. **Verifică domeniul în Resend**  
   [Resend → Domains](https://resend.com/domains): adaugă domeniul de la care trimiți (ex. `flipo5.com`). Resend îți dă recorduri DNS de adăugat.

2. **Adaugă recordurile DNS** la provider-ul unde ai domeniul (Cloudflare, etc.):
   - **SPF** – exact cum îl arată Resend (ex. `v=spf1 include:resend.com ~all` sau ce indică ei).
   - **DKIM** – cele 2–3 recorduri DKIM pe care le afișează Resend pentru domeniu.
   După ce le salvezi, în Resend apasă „Verify” la domeniu. Starea trebuie să fie **Verified**.

3. **Opcional, DMARC** (reduce șansa de spam):  
   Creezi un record DNS tip TXT pentru `_dmarc.flipo5.com` cu valoare de genul:  
   `v=DMARC1; p=none; rua=mailto:dmarc@flipo5.com`  
   (la început `p=none` doar pentru raportare; poți trece mai târziu la `p=quarantine` sau `p=reject`).

4. **Folosește un From verificat**  
   În Supabase SMTP, **Sender email** trebuie să fie o adresă pe domeniul verificat (ex. `noreply@flipo5.com`), nu @gmail.com sau alt domeniu neverificat.

5. **Evită conținut „de spam”**  
   Subiect și text clar, fără toate majuscule, fără prea multe exclamation!!! Șabloanele din repo sunt făcute să pară ok pentru filtre.

Dacă domeniul e verificat în Resend și SPF/DKIM sunt corecte, livrarea (inbox vs spam) se îmbunătățește semnificativ.

---

## Link din email să ducă la flipo5.com (nu la localhost)

Dacă dai click pe linkul din email și te duce la `localhost:3000`:

1. **În Supabase Dashboard** → Authentication → **URL Configuration**:
   - **Site URL**: pune `https://flipo5.com` (sau `https://www.flipo5.com` dacă folosești www).
   - **Redirect URLs**: adaugă `https://flipo5.com/**` și dacă folosești www și `https://www.flipo5.com/**`. Salvează.

2. **În Vercel** (sau unde rulează frontend-ul): adaugă variabila de mediu:
   - `NEXT_PUBLIC_APP_URL` = `https://flipo5.com`
   Apoi refă deploy. Frontend-ul va trimite la Supabase acest URL pentru linkurile din email, deci linkul din email va duce la flipo5.com, unde utilizatorul va fi logat.

3. **Verifică linkul din email**  
   După sign up, deschide emailul și verifică linkul (poți doar hover fără să dai click). În URL trebuie să apară un parametru de tip `redirect_to=https://flipo5.com/...` (sau domeniul tău). Dacă lipsește, înseamnă că la trimitere nu s-a trimis `emailRedirectTo` corect — deci fie frontend-ul nu e deployat cu `NEXT_PUBLIC_APP_URL`, fie Supabase folosește doar Site URL (verifică și acolo).

---

## Click pe confirmare durează mult / nu mă duce pe site

- **Redirect rapid:** Am optimizat `/auth/callback`: după ce Supabase validează tokenul, utilizatorul e trimis imediat pe `/dashboard` (fără a aștepta sync-ul cu backend-ul). Dacă ai deploy recent la frontend, ar trebui să fie mult mai rapid.
- **Nu mă duce pe site:** Asigură-te că în Supabase la **URL Configuration** ai **Redirect URLs** care include exact domeniul tău (ex. `https://flipo5.com/**`). Dacă linkul din email nu conține `redirect_to` către flipo5.com, refă pașii de la secțiunea „Link din email să ducă la flipo5.com” și trimite din nou un email de confirmare (cont nou sau „Resend confirmation” din Supabase).
- **Link „consumat” înainte de click:** Unele clienți de email (ex. Microsoft, unele corporate) prefetch linkurile; tokenul se folosește o dată și la click utilizatorul vede eroare sau pagină goală. Soluție: folosește un client care nu prefetch (ex. Gmail pe telefon) sau resetează parola / reînregistrare și folosește linkul într-un browser direct.

---

## Design email (tema Flipo5)

În repo există șabloane HTML gata făcute, aliniate cu designul site-ului (fundal negru, accent amber, text alb):

- `backend/deploy/email-templates/confirm-signup.html` — confirmare cont (sign up)
- `backend/deploy/email-templates/reset-password.html` — reset parolă

### Cum le folosești în Supabase

1. Deschide **Supabase Dashboard** → **Authentication** → **Email Templates**.
2. **Confirm signup**
   - Click pe șablonul **Confirm signup**.
   - **Subject**: de ex. `Confirm your Flipo5 account` (sau lasă ce e acolo).
   - **Body**: deschide `confirm-signup.html`, copiază **tot** conținutul (inclusiv `<!DOCTYPE>` și `<html>`) și lipește în câmpul de mesaj. **Nu** șterge variabilele `{{ .ConfirmationURL }}` și `{{ .Email }}`.
   - Salvează.
3. **Reset password**
   - Click pe șablonul **Reset password**.
   - **Subject**: de ex. `Reset your Flipo5 password`.
   - **Body**: copiază tot din `reset-password.html` și lipește. Păstrează `{{ .ConfirmationURL }}` și `{{ .Email }}`.
   - Salvează.

După ce ai configurat SMTP cu Resend (pașii de mai sus), aceste șabloane vor fi trimise prin Resend cu designul Flipo5.

---

## Verificare

- Înregistrează un cont nou sau folosește „Forgot password” pe `/start`.
- Verifică în [Resend → Emails](https://resend.com/emails) că mesajul apare și că a fost livrat.

---

## Dacă vrei și alte emailuri (din backend)

Pentru emailuri **custom** (ex. notificări „job-ul tău e gata”) trimise din **backend-ul Go**, poți adăuga ulterior:

- variabilă de mediu `RESEND_API_KEY` în backend;
- un pachet mic care apelează [Resend API](https://resend.com/docs/api-reference/emails/send-email) (HTTP POST).

Pentru **auth** (confirmare, magic link, reset parolă) nu e nevoie — rezolvi totul cu SMTP în Supabase, ca mai sus.
