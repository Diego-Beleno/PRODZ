# PRODZ — Beat Catalog & Session Booking

Vanilla static site (HTML/CSS/JS). No build step, no package.json, no tests, no lint, no typecheck. Served directly from files.

## Stack
- **Supabase** (client-side): auth, DB (`bookings`, `blocked_dates`, `weekly_slots`, `beats`, `profiles`), Storage (`beats-bucket`)
- **WhatsApp** (`wa.me`): all inquiries, license purchases, booking confirmations. Phone: `+58 424 660 3660`

## File layout
```
index.html                Landing (catalog + player + booking calendar + legal)
login.html                Supabase email/password login
signup.html               Signup (nombre, apellido, telefono, email, password)
admin/index.html          Admin panel (1034 lines, inline JS, 4 tabs)
script.js                 All client logic (743 lines)
supabase-config.js        Supabase client init + helpers (getUsuarioActual, getPerfilUsuario)
schema.sql                Full SQL schema (tables, triggers, RLS, functions)
setup.sql                 One-time: SELECT asignar_admin('email')
drop_policies.sql         Drops old RLS policies named "Permitir%"
temp_sql.sql              GRANT EXECUTE ON is_admin TO anon, authenticated
style.css                 All styles (1440 lines)
assets/{audio(10),images(10)}/
```

## Commands
- Deploy: `git add . ; git commit -m "msg" ; git push origin main`
- Serve locally: `npx serve .` or `python -m http.server`
- First deploy: run `schema.sql` in Supabase SQL Editor & create public `beats-bucket` Storage bucket

## Supabase tables
- `profiles`: id (UUID PK → auth.users), nombre, apellido, telefono, role ('admin'|'client')
- `weekly_slots`: dia_semana (0-6), hora_inicio, hora_fin, duracion_minutos, activo
- `blocked_dates`: fecha, todo_el_dia, hora_inicio, hora_fin, motivo
- `bookings`: id (UUID PK), client_id (FK → profiles), nombre_artista, telefono, fecha, hora_inicio, hora_fin, estado ('pendiente'|'aprobada'|'cancelada'|'reprogramada'), UNIQUE(fecha, hora_inicio)
- `beats`: id, titulo, bpm, escala, genero, precio, audio_url, image_url, color, featured, vendido, orden

## Catalog (`cargarCatalogo()`)
- Fetches beats ordered by `orden ASC, created_at DESC` (manual reorder column `orden` added Jun 2026)
- Featured beats → 2x2 grid, rest → horizontal scroll
- Client-side search (`initSearch`) matches titulo, genero, escala, bpm
- Audio files hosted in `beats-bucket` (Supabase Storage)
- Admin uploads via admin panel: drag-and-drop, image auto-converted to WebP client-side

## Booking flow
1. Select date → `obtenerHorasDisponibles()` queries `weekly_slots` for weekday, subtracts `blocked_dates` & occupied `bookings` (estado IN aprobada/reprogramada)
2. Dynamic slots generated from hora_inicio→hora_fin at duracion_minutos intervals
3. Click "Agendar Sesión" → if unauthenticated, saves to `sessionStorage.pending_booking` & redirects to signup.html
4. After auth → `checkPendingBooking()` on page load opens confirmation modal → inserts `bookings` row → opens WhatsApp plain-text message

## Auth quirks
- `handle_new_user()` trigger auto-creates profile row on signup
- Admin guard in `<head>` of `admin/index.html` — hard redirect if role !== 'admin'
- Admin logout button (admin/index.html:493) only does `window.location.href = '../index.html'` — does NOT call `supabase.auth.signOut()` (known bug)
- Index.html auth widget logout at script.js:414-417 DOES call `supabase.auth.signOut()` + reload
- If `asignar_admin()` fails, run `temp_sql.sql` then `setup.sql`

## Audio player
- Global bottom bar (`#global-player`) appears on card click
- Waveform canvas drawn via `fetch()` + `AudioContext`; click waveform to seek
- Single active audio at a time; theme color updates per beat
- Play/pause syncs between card and global player

## Admin panel (admin/index.html)
- 4 inline-JS tabs: Bookings (stats + CRUD), Weekly Slots, Blocked Dates, Beats (upload with drag-and-drop)
- Reprogramming modal for bookings
- Inline error handler overlay (shows stack trace with copy button)

## Notes
- Language: Spanish (`es`). Section `#servicios` hidden by default (`display:none`)
- License purchase buttons & pricing links open WhatsApp — no real purchase flow
- `.env` / `.env.local` in `.gitignore` — unused by the app (creds hardcoded in supabase-config.js), but keep secrets out of commits
- `uptades.txt`, `ver-ip.ps1` are user's personal files, not part of the app
