# Șabloane email Supabase (design Flipo5)

Design aliniat cu site-ul: fundal negru (`#000`), card `#171717`, text alb/gri, buton accent amber (`#f59e0b`).

## Fișiere

| Fișier | Șablon Supabase | Variabile folosite |
|--------|------------------|---------------------|
| `confirm-signup.html` | **Confirm signup** | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `reset-password.html` | **Reset password** | `{{ .ConfirmationURL }}`, `{{ .Email }}` |

## Unde se pun

Supabase Dashboard → **Authentication** → **Email Templates** → alege șablonul → lipește HTML-ul în **Body**. Subject poți seta direct în Supabase (ex. „Confirm your Flipo5 account”).

**Important:** Nu modifica variabilele `{{ .ConfirmationURL }}` și `{{ .Email }}` — Supabase le înlocuiește automat.
