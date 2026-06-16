# PRODZ — Beat Catalog & Session Booking

Vanilla static site (HTML/CSS/JS). No build step, no package.json, no tests, no lint, no typecheck. Served directly from files.

## Stack
- **Supabase** (client-side): auth, DB (`bookings`, `blocked_dates`, `weekly_slots`, `beats`, `profiles`), Storage (`beats-bucket`)
- **WhatsApp API** (`wa.me`): all inquiries, license purchases, booking confirmations
- Phone: `+58 424 660 3660` (Venezuela)

## Structure
```
PRODZ/
├── index.html             # Landing + catalog + booking + player
├── login.html             # Supabase email/password login
├── signup.html            # Supabase signup (nombre, apellido, telefono)
├── admin/index.html       # Admin panel (role-gated: profiles.role === 'admin')
├── script.js              # All client logic (catalog load from DB, player, booking, auth)
├── supabase-config.js     # Supabase client init + shared helpers
├── schema.sql             # Full SQL schema for Supabase (run once in SQL Editor)
├── style.css              # All styles (1161 lines)
└── assets/{audio,images}/
```

## Key dev commands
- Deploy: `git add . ; git commit -m "message" ; git push origin main`
- No dev server needed — open `index.html` in a browser or serve with any static server
- Before first deploy: run `schema.sql` in Supabase SQL Editor & create `beats-bucket` Storage bucket (public)

## Supabase tables
- `profiles`: id, nombre, apellido, telefono, role (admin|client), created_at
- `weekly_slots`: id, dia_semana (0-6), hora_inicio, hora_fin, duracion_minutos, activo, created_at
- `blocked_dates`: id, fecha, todo_el_dia, hora_inicio, hora_fin, motivo, created_at
- `bookings`: id, client_id, nombre_artista, telefono, fecha, hora_inicio, hora_fin, estado (pendiente|aprobada|cancelada|reprogramada), unique(fecha, hora_inicio), created_at
- `beats`: id, titulo, bpm, escala, precio, audio_url, image_url, color, featured, vendido, created_at

## Catalog
- `cargarCatalogo()` in `script.js` fetches from Supabase `beats` table (replaced beats.json)
- Featured beats → 2x2 grid, rest → horizontal scroll
- Audio files hosted in `beats-bucket` (Supabase Storage)
- Admin uploads beats via `admin/index.html` with file input

## Booking flow
1. User selects date → `obtenerHorasDisponibles()` queries `weekly_slots`, subtracts `blocked_dates` & occupied `bookings`
2. Dynamic slots generated from weekly config (hora_inicio → hora_fin, with duracion_minutos intervals)
3. User clicks "Agendar Sesión"
4. If unauthenticated → redirects to signup.html with `sessionStorage.pending_booking`
5. After auth → opens confirmation modal → inserts `bookings` row → opens WhatsApp with plain-text message

## Auth quirks
- Signup auto-redirects if email confirmation is disabled in Supabase
- `handle_new_user()` trigger auto-creates profile row on signup
- Admin guard in `<head>` of `admin/index.html` — hard redirect if role !== 'admin'
- `login.html` and `signup.html` both check for existing session on load

## Audio player
- Global bottom bar (`#global-player`) appears on card click
- Waveform canvas drawn from audio file (fetched via `fetch()` + `AudioContext`)
- Single active audio at a time; theme color updates per beat

## Notes
- Site language: Spanish (`es`)
- All links (pricing select, logo) scroll to `#catalogo-container` — not actual purchase flow
- License purchase buttons open WhatsApp with beat name pre-filled
- `uptades.txt` is the user's personal git cheat-sheet; not part of the app
- Supabase URL/key exposed in `supabase-config.js` — only anon key, but don't commit real credentials to public repos
