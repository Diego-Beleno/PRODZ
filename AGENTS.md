# PRODZ — Beat Catalog & Session Booking

Vanilla static site (HTML/CSS/JS). No build step, no package.json, no tests, no lint, no typecheck. Served directly from files.

## Stack
- **Supabase** (client-side): auth, DB (`bookings`, `blocked_dates`, `weekly_slots`, `beats`, `profiles`), Storage (`beats-bucket`)
- **WhatsApp API** (`wa.me`): all inquiries, license purchases, booking confirmations
- Phone: `+58 424 660 3660` (Venezuela)

## Structure
```
PRODZ/
├── index.html                # Landing + catalog + player + booking calendar + legal
├── login.html                # Supabase email/password login
├── signup.html               # Supabase signup (nombre, apellido, telefono, email, password)
├── admin/index.html          # Admin panel (869 lines, inline JS: 4 tabs)
├── script.js                 # All client logic (677 lines)
├── supabase-config.js        # Supabase client init + shared helpers (33 lines)
├── schema.sql                # Full SQL schema (207 lines: tables, triggers, RLS, functions)
├── style.css                 # All styles (1440 lines)
├── setup.sql                 # One-time admin assignment (SELECT asignar_admin('email'))
├── drop_policies.sql         # Helper to drop old RLS policies named "Permitir%"
├── temp_sql.sql              # GRANT EXECUTE ON is_admin TO anon, authenticated
├── ver-ip.ps1                # User's PowerShell utility to get local IP
├── uptades.txt               # User's personal git cheat-sheet
└── assets/{audio(10),images(10)}/
```

## Key dev commands
- Deploy: `git add . ; git commit -m "message" ; git push origin main`
- No dev server needed — open `index.html` in a browser or serve with any static server
- Before first deploy: run `schema.sql` in Supabase SQL Editor & create `beats-bucket` Storage bucket (public)

## Supabase tables
- `profiles`: id (UUID PK → auth.users), nombre, apellido, telefono, role ('admin'|'client'), created_at
- `weekly_slots`: id, dia_semana (0-6), hora_inicio, hora_fin, duracion_minutos, activo, created_at
- `blocked_dates`: id, fecha, todo_el_dia, hora_inicio, hora_fin, motivo, created_at
- `bookings`: id (UUID PK), client_id (FK → profiles), nombre_artista, telefono, fecha, hora_inicio, hora_fin, estado ('pendiente'|'aprobada'|'cancelada'|'reprogramada'), unique(fecha, hora_inicio), created_at
- `beats`: id, titulo, bpm, escala, genero, precio, audio_url, image_url, color, featured, vendido, created_at

## Catalog
- `cargarCatalogo()` in `script.js` fetches from Supabase `beats` table
- Featured beats → 2x2 grid, rest → horizontal scroll
- Audio files hosted in `beats-bucket` (Supabase Storage)
- Admin uploads beats via `admin/index.html` with drag-and-drop file input (image auto-converted to WebP client-side)
- Also renders custom-beats-services buttons (beat from 0, reconstruct, edit audio/podcast)

## Booking flow
1. User selects date → `obtenerHorasDisponibles()` queries `weekly_slots`, subtracts `blocked_dates` & occupied `bookings` (estado IN aprobada/reprogramada)
2. Dynamic slots generated from weekly config (hora_inicio → hora_fin, with duracion_minutos intervals)
3. User clicks "Agendar Sesión"
4. If unauthenticated → redirects to signup.html with `sessionStorage.pending_booking`
5. After auth → opens confirmation modal → inserts `bookings` row → opens WhatsApp with plain-text message
6. `checkPendingBooking()` runs on page load if redirected from signup

## Auth quirks
- Signup auto-redirects if email confirmation is disabled in Supabase
- `handle_new_user()` trigger auto-creates profile row on signup
- Admin guard in `<head>` of `admin/index.html` — hard redirect if role !== 'admin'
- `login.html` and `signup.html` both check for existing session on load
- Admin logout button redirects to index.html but does NOT call `supabase.auth.signOut()` (known bug)

## Audio player
- Global bottom bar (`#global-player`) appears on card click
- Waveform canvas drawn from audio file (fetched via `fetch()` + `AudioContext`)
- Single active audio at a time; theme color updates per beat
- Click on waveform to seek; progress bar updates in real time
- Play/pause button in global player syncs with card active state

## Admin panel (admin/index.html)
- Inline JS (no separate admin.js file)
- 4 tabs: Bookings (stats + CRUD), Weekly Slots, Blocked Dates, Beats (upload with drag-and-drop)
- Reprogramming modal for bookings
- Beat upload: image → WebP conversion client-side, upload audio + image to `beats-bucket`

## Notes
- Site language: Spanish (`es`)
- All links (pricing select, logo) scroll to `#catalogo-container` — not actual purchase flow
- License purchase buttons open WhatsApp with beat name pre-filled
- Section `#servicios` (pricing table) is hidden by default (`display:none`)
- `uptades.txt` / `ver-ip.ps1` are user's personal files; not part of the app
- `drop_policies.sql` / `temp_sql.sql` are Supabase maintenance helpers
- Supabase URL/key exposed in `supabase-config.js` — only anon key, but don't commit real credentials to public repos
