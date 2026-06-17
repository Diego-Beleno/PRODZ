# PRODZ — Beat Catalog & Session Booking

Plataforma web estática para catálogo de beats musicales y reserva de sesiones de grabación, construida con HTML/CSS/JS vanilla + Supabase (backend serverless).

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5, CSS3, JavaScript (vanilla) |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Autenticación | Supabase Auth (email/password) |
| Almacenamiento | Supabase Storage (`beats-bucket`) |
| Notificaciones | WhatsApp API (`wa.me`) |
| Hosting | GitHub Pages (desde `main`) |

## Estructura de Archivos

```
PRODZ/
├── index.html                # Landing: catálogo + reproductor + calendario reservas + legal
├── login.html                # Inicio de sesión
├── signup.html               # Registro (nombre, apellido, teléfono, email, password)
├── admin/index.html          # Panel admin (869 líneas, JS inline): Reservas, Horarios, Bloqueos, Beats
├── script.js                 # Lógica principal (677 líneas): catálogo, reproductor, reservas, auth widget
├── supabase-config.js        # Cliente Supabase global + helpers (getUsuarioActual, getPerfilUsuario)
├── style.css                 # Todos los estilos (1440 líneas)
├── schema.sql                # Esquema SQL completo (tablas, triggers, RLS, funciones, asignar_admin)
├── setup.sql                 # Asignación manual de admin (one-time: SELECT asignar_admin('email'))
├── drop_policies.sql         # Helper para dropear políticas RLS viejas (ej. "Permitir%")
├── temp_sql.sql              # GRANT EXECUTE ON FUNCTION is_admin TO anon, authenticated
├── AGENTS.md                 # Contexto para asistentes AI
├── README.md                 # Este archivo
├── uptades.txt               # Notas personales del usuario (git cheat-sheet)
├── ver-ip.ps1                # Script PowerShell para obtener IP local
├── assets/
│   ├── audio/                # 10 archivos (loader tag + beats)
│   └── images/               # 10 archivos (logo, portadas WebP, asset por defecto)
```

## Setup Inicial (Supabase)

1. Crea un proyecto en [Supabase](https://supabase.com)
2. Ve a **SQL Editor** → ejecuta TODO `schema.sql`
3. Ve a **Storage** → crea bucket público `beats-bucket`
4. Ve a **Authentication → Settings** → desactiva "Confirm email" (opcional)
5. Abre `signup.html`, regístrate con tu correo
6. Ejecuta en SQL Editor: `SELECT public.asignar_admin('tu@correo.com');`
7. Inicia sesión en `login.html` → ve a `admin/index.html`

> Si `asignar_admin()` falla, ejecuta `temp_sql.sql` y luego `setup.sql`.

## Supabase Tables

### `profiles`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK → auth.users | ID del usuario |
| nombre | TEXT | Nombre |
| apellido | TEXT | Apellido |
| telefono | TEXT | WhatsApp |
| role | TEXT | `'client'` o `'admin'` |
| created_at | TIMESTAMPTZ | Fecha creación |

- Trigger `handle_new_user()` crea el perfil automáticamente al registrarse.
- RLS: cada usuario ve/edita su propio perfil; admin ve todo.
- Usuarios NO pueden cambiarse su propio `role`.

### `weekly_slots`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| dia_semana | SMALLINT (0-6) | 0=Dom, 1=Lun ... 6=Sáb |
| hora_inicio | TIME | Inicio del bloque |
| hora_fin | TIME | Fin del bloque |
| duracion_minutos | INT | Duración de cada sesión (ej. 60) |
| activo | BOOLEAN | Si está habilitado |

### `blocked_dates`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| fecha | DATE | Fecha bloqueada |
| todo_el_dia | BOOLEAN | Bloqueo completo |
| hora_inicio | TIME | Inicio parcial |
| hora_fin | TIME | Fin parcial |
| motivo | TEXT | Razón del bloqueo |

### `bookings`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK (gen_random_uuid) | |
| client_id | UUID FK → profiles | Quién reserva |
| nombre_artista | TEXT | Nombre artístico |
| telefono | TEXT | Contacto |
| fecha | DATE | Día de la sesión |
| hora_inicio | TIME | Inicio |
| hora_fin | TIME | Fin |
| estado | TEXT | `'pendiente'`, `'aprobada'`, `'cancelada'`, `'reprogramada'` |
| UNIQUE(fecha, hora_inicio) | | Evita doble reserva |

### `beats`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| titulo | TEXT | Nombre del beat |
| bpm | INT | Tempo |
| escala | TEXT | Tonalidad (ej. Am) |
| precio | NUMERIC(10,2) | Precio USD |
| audio_url | TEXT | URL en Storage |
| image_url | TEXT | URL de portada (WebP) |
| color | TEXT | Color acento (hex) |
| featured | BOOLEAN | Destacado (grid 2x2) |
| vendido | BOOLEAN | Vendido (exclusiva) |
| created_at | TIMESTAMPTZ | |

## Flujo de Reserva

1. Usuario selecciona fecha en el calendario de `index.html#reservas`
2. `obtenerHorasDisponibles()`:
   - Obtiene `weekly_slots` del día de la semana
   - Resta `blocked_dates` (full day bloquea todo, parcial filtra slots)
   - Resta `bookings` con estado ≠ cancelada
   - Genera slots dinámicos: desde hora_inicio hasta hora_fin, con duracion_minutos de intervalo
3. Usuario elige hora → presiona "Agendar Sesión"
4. Si no hay sesión → guarda datos en `sessionStorage.pending_booking` → redirige a signup
5. Después de auth → abre modal de confirmación
6. Usuario ingresa nombre y teléfono → submit
7. Se inserta row en `bookings`
8. Se abre WhatsApp con mensaje de texto plano
9. Se limpia el pending_booking y el estado del calendario

## Flujo de Catálogo

1. `cargarCatalogo()` en `script.js`:
   - Fetch a `supabase.from('beats').select('*').order('created_at', false)`
   - Renderiza tarjetas: featured en `.grid-2x2`, resto en scroll horizontal
2. Click en imagen:
   - Reproduce audio, actualiza reproductor global (barra inferior)
   - Dibuja waveform con Web Audio API
   - Tema dinámico (color, background gradient, nav links)
3. Click en "ADQUIRIR LICENCIA":
   - Abre WhatsApp con nombre del beat pre-cargado

## Auth Widget

En `index.html`, el `<div id="auth-widget">` en la navbar se llena con:
- Usuario logueado: nombre + link a admin (si es admin) + botón SALIR
- No logueado: ENTRAR + REGISTRAR

## Admin Panel (`admin/index.html`)

- Sin sesión → formulario de login inline
- Sesión pero no admin → "Acceso denegado" + botón Cerrar Sesión
- Admin → panel con 4 tabs:

### Reservas
- Estadísticas: pendientes, aprobadas, total
- Tabla con todas las reservas
- Acciones: Aprobar, Reprogramar, Cancelar
- Reprogramación vía modal con fecha/hora

### Horarios (weekly_slots)
- CRUD de slots semanales
- Día, hora inicio, hora fin, duración, activo
- Cada slot genera automáticamente intervalos de duración fija

### Bloqueos (blocked_dates)
- Fechas específicas bloqueadas (todo el día o parcial)
- Motivo opcional

### Catálogo Beats
- Subida drag-and-drop de audio + imagen
- Imagen se convierte a WebP (client-side con Canvas API)
- Subida a Storage bucket `beats-bucket`
- Color acento, BPM, escala, precio, destacado
- Lista de beats con opción eliminar

## RLS Policies

- `profiles`: SELECT propio o admin; UPDATE propio (sin cambiar role)
- `weekly_slots`, `blocked_dates`, `beats`: SELECT público; ALL admin
- `bookings`: SELECT propio o admin; INSERT propio; UPDATE admin

## Funciones SQL

- `is_admin()`: retorna true si el perfil del usuario actual es admin
- `asignar_admin(target_email)`: SECURITY DEFINER, asigna role=admin; solo ejecutable desde SQL Editor (REVOKE EXECUTE de anon/authenticated)

## Variables de Entorno

Las credenciales de Supabase están hardcodeadas en `supabase-config.js`:
```js
SUPABASE_URL = "https://cecosbigfwgvoezmbapv.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIs..."
```

> ⚠ Solo es una key anon (pública por diseño). No contiene secretos. Pero igual no commits real credentials a repos públicos.

## Reproductor Global

- Barra inferior fija (`.global-player`)
- Aparece al reproducir un beat desde las cards
- Muestra portada, nombre, key/BPM
- Botón play/pause con icono SVG
- Barra de progreso
- Botón "ADQUIRIR" abre WhatsApp
- Waveform en cada card se colorea según progreso

## Notas

- Idioma: Español (`es`)
- Número WhatsApp: `+58 424 660 3660` (Venezuela)
- El loader animado (tag audio + letras) solo aparece en la primera visita (click/tap)
- El botón "ADQUIRIR" en pricing y player NO compra realmente — abre WhatsApp
- `uptades.txt` es personal del usuario, no parte de la app
- `ver-ip.ps1` es un script auxiliar del usuario, no parte de la app
- `drop_policies.sql` y `temp_sql.sql` son helpers para mantenimiento de Supabase
- `style.css` tiene 1440 líneas (no 1161 como decían versiones anteriores)
- No hay build step: se sirve directamente como archivos estáticos
- No hay tests ni linter configurados
- El admin logout en `admin/index.html` redirige al index pero NO cierra sesión (bug conocido)

## Comandos Útiles

```bash
# Deploy a GitHub Pages
git add .
git commit -m "mensaje"
git push origin main

# Servir localmente (cualquier static server)
npx serve .
# o
python -m http.server
```
