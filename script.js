detectarReferidoURL();

let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}
let activeAudio = null;
let activeCard = null;

let todosLosBeats = [];

// 1. FUNCIÓN PARA CARGAR EL CATÁLOGO DESDE SUPABASE DB
async function cargarCatalogo() {
    try {
        const { data: beats, error } = await supabase
            .from('beats')
            .select('*')
            .order('orden', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (error || !beats || beats.length === 0) {
            console.warn("No se encontraron beats en la DB.");
            return;
        }

        todosLosBeats = beats;
        renderCatalogo(beats);
        initSearch();
    } catch (error) {
        console.error("Error cargando el catálogo:", error);
    }
}

function renderCatalogo(beats) {
    const contenedorDestacados = document.querySelector('.grid-2x2');
    const contenedorCatalogo = document.getElementById('catalogo-container');

    if (contenedorDestacados) contenedorDestacados.innerHTML = '';
    if (contenedorCatalogo) contenedorCatalogo.innerHTML = '';

    beats.forEach(beat => {
        const card = document.createElement('article');
        card.className = 'beat-card';
        card.setAttribute('data-color', beat.color || '#ffffff');
        card.setAttribute('data-audio', beat.audio_url);
        card.setAttribute('data-name', beat.titulo);
        card.setAttribute('data-genero-search', (beat.genero || '').toLowerCase());
        card.setAttribute('data-genero', beat.genero || '');
        card.setAttribute('data-escala', beat.escala || '');
        card.setAttribute('data-bpm', beat.bpm || '');
        card.setAttribute('data-vendido', beat.vendido ? 'true' : 'false');
        card.setAttribute('data-precio', beat.precio || '0');
        card.setAttribute('data-img', beat.image_url || '');

        const metaPartes = [
            beat.genero,
            beat.escala,
            beat.bpm ? beat.bpm + ' BPM' : ''
        ].filter(Boolean).join(' / ') || '—';

        const precioNum = beat.precio ? parseFloat(beat.precio).toFixed(2).replace(/\.00$/, '') : '';
        const precioHtml = beat.vendido
            ? '<span class="beat-price vendido">Vendido</span>'
            : '<div class="beat-price">Licencia a partir de<strong> ' + precioNum + '$</strong></div>';
        const btnHtml = beat.vendido
            ? '<button class="btn-license sold" disabled>NO DISPONIBLE</button>'
            : '<button class="btn-license">ADQUIRIR LICENCIA</button>';

        card.innerHTML = `
                <div class="image-container">
                    <img src="${beat.image_url || 'assets/images/asset.webp'}" alt="${beat.titulo}" class="beat-cover">
                    <div class="play-overlay">
                        <div class="icon-wrapper">
                            <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            <svg class="icon-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        </div>
                    </div>
                </div>
                <div class="beat-info">
                    <h3>${beat.titulo}</h3>
                    <div class="beat-meta"><span>${metaPartes}</span></div>
                    ${precioHtml}
                    <canvas class="waveform-canvas"></canvas>
                    ${btnHtml}
                </div>`;

        if (beat.featured && contenedorDestacados) {
            contenedorDestacados.appendChild(card);
        } else if (!beat.featured && contenedorCatalogo) {
            contenedorCatalogo.appendChild(card);
        }

        inicializarCard(card);
    });
}

function initSearch() {
    const input = document.getElementById('search-beats');
    if (!input) return;
    input.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        if (!q) {
            renderCatalogo(todosLosBeats);
            return;
        }
        const filtrados = todosLosBeats.filter(b =>
            (b.titulo && b.titulo.toLowerCase().includes(q)) ||
            (b.genero && b.genero.toLowerCase().includes(q)) ||
            (b.escala && b.escala.toLowerCase().includes(q)) ||
            (b.bpm && b.bpm.toString().includes(q))
        );
        renderCatalogo(filtrados);
    });
}
// 2. FUNCIÓN PARA ACTIVAR CADA TARJETA CREADA
function inicializarCard(card) {
    const audioUrl = card.getAttribute('data-audio');
    const color = card.getAttribute('data-color');
    const canvas = card.querySelector('.waveform-canvas');
    const imgContainer = card.querySelector('.image-container');

    const audio = new Audio(audioUrl);
    drawWaveform(audioUrl, canvas, color);

    if (imgContainer) {
        imgContainer.addEventListener('click', () => {
            handlePlayback(audio, card, color);
        });
    }

    audio.addEventListener('timeupdate', () => {
        updateWaveformProgress(canvas, audio, color);
    });

    // Timeline: clic en la onda para saltar tiempo
    canvas.addEventListener('click', (e) => {
        if (activeCard === card && activeAudio) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / canvas.width;
            activeAudio.currentTime = percentage * activeAudio.duration;
        }
    });
}

// 3. LOGICA DE REPRODUCCIÓN (Tu función original)
function handlePlayback(audio, card, color) {
    if (activeAudio && activeAudio !== audio) {
        activeAudio.pause();
        activeCard.classList.remove('active');
        activeCard.style.borderColor = "rgba(255,255,255,0.05)";
    }

    if (audio.paused) {
        audio.play();
        card.classList.add('active');
        card.style.borderColor = color;
        activeAudio = audio;
        activeCard = card;

        // --- Activa el reproductor global ---
        const beatData = {
            name: card.getAttribute('data-name'),
            image: card.querySelector('img').src,
            key: card.getAttribute('data-escala') || '—',
            bpm: card.getAttribute('data-bpm') || '—',
            genero: card.getAttribute('data-genero') || '—'
        };
        updateGlobalPlayer(beatData, color);
        trackTime();
        // --------------------------------------------------

        updateGlobalTheme(color);
    } else {
        audio.pause();
        card.classList.remove('active');
        card.style.borderColor = "rgba(255,255,255,0.05)";

        // --- AÑADE ESTA LÍNEA AQUÍ ---
        // Esto cambia el icono de la barra de abajo a "Play" cuando pausas desde la foto
        document.getElementById('player-play-btn').innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }
}

// 4. DIBUJO DE ONDA (Tu función original)
async function drawWaveform(audioUrl, canvas, color) {
    try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioData = await getAudioCtx().decodeAudioData(arrayBuffer);
        const ctx = canvas.getContext('2d');

        // Asegurar que el canvas tenga dimensiones reales
        if (canvas.width === 300 && canvas.height === 150 && canvas.offsetWidth > 0) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight || 40;
        }

        const data = audioData.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;

        // Guardar datos para redibujado posterior (seek)
        canvas._waveformData = { data, step, amp };

        ctx.fillStyle = "#333333";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
    } catch (e) { console.error("Error onda:", e); }
}

// 5. PROGRESO DE ONDA (soporta backward seek)
function updateWaveformProgress(canvas, audio, color) {
    const ctx = canvas.getContext('2d');
    const progress = audio.currentTime / audio.duration;
    const wd = canvas._waveformData;
    if (!wd) return;

    const { data, step, amp } = wd;
    const w = canvas.width;

    // Redibujar toda la onda: fondo gris + progreso coloreado
    ctx.clearRect(0, 0, w, canvas.height);
    for (let i = 0; i < w; i++) {
        let min = 1.0, max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        ctx.fillStyle = i / w < progress ? color : "#333333";
        ctx.fillRect(i, (1 + min) * amp, 2, Math.max(1, (max - min) * amp));
    }
}

// 6. TEMA DINÁMICO
function updateGlobalTheme(color) {
    // 1. Actualiza la variable para que el botón sepa de qué color rellenarse
    document.documentElement.style.setProperty('--accent-color', color);

    // 2. Mantiene el resplandor de fondo de la página
    document.body.style.backgroundImage = `radial-gradient(circle at top, ${color}22 0%, #050505 100%)`;

    // 3. Solo pintamos los links de la navegación (CATÁLOGO, SERVICIOS, LEGAL)
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.style.color = color;
        link.style.borderBottom = `2px solid ${color}`;
    });
}

// REEMPLAZA TODA LA SECCIÓN 7 POR ESTA
const loader = document.getElementById('loader');
const tagAudio = document.getElementById('tag-audio');

var _introStarted = false;
if (loader) {
    loader.addEventListener('click', () => {
        if (!_introStarted) {
            // Primer click: iniciar intro
            _introStarted = true;
            tagAudio.play().then(() => {
                const tapHint = loader.querySelector('.click-to-start');
                if (tapHint) tapHint.style.opacity = '0';

                tagAudio.ontimeupdate = () => {
                    const time = tagAudio.currentTime;
                    if (time >= 0.0) loader.querySelector('.line-1').classList.add('active');
                    if (time >= 0.4) loader.querySelector('.line-2').classList.add('active');
                    if (time >= 0.9) loader.querySelector('.line-3').classList.add('active');
                    if (time >= 1.2) loader.querySelector('.line-4').classList.add('active');
                    if (time >= 2.0) loader.querySelector('.line-5').classList.add('active');
                };
                tagAudio.onended = () => cerrarIntro();
            });
        } else {
            // Segundo click durante reproducción: saltar intro
            cerrarIntro();
        }
    });
}


document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-license') && !e.target.classList.contains('sold')) {
        const card = e.target.closest('.beat-card');
        if (card) {
            const nombreBeat = card.getAttribute('data-name');
            const img = card.getAttribute('data-img') || '';
            window.location.href = 'checkout.html?item=' + encodeURIComponent(nombreBeat) + '&type=beat&img=' + encodeURIComponent(img);
        }
    }
    if (e.target.classList.contains('service-btn-custom')) {
        const mensajeServicio = e.target.getAttribute('data-msg');
        window.location.href = 'checkout.html?item=Servicio+Personalizado&type=service&msg=' + encodeURIComponent(mensajeServicio);
    }
});

// Player buy button (no parent .beat-card)
document.querySelector('.player-buy')?.addEventListener('click', () => {
    if (activeCard) {
        const nombreBeat = activeCard.getAttribute('data-name');
        const img = activeCard.getAttribute('data-img') || '';
        window.location.href = 'checkout.html?item=' + encodeURIComponent(nombreBeat) + '&type=beat&img=' + encodeURIComponent(img);
    }
});

// LANZAMIENTO INICIAL
cargarCatalogo();

function updateGlobalPlayer(beat, color) {
    const player = document.getElementById('global-player');
    const playBtn = document.getElementById('player-play-btn');

    // Llenar datos
    document.getElementById('player-img').src = beat.image;
    document.getElementById('player-name').innerText = beat.name;
    var playerMeta = [beat.genero, beat.key, beat.bpm + ' BPM'].filter(Boolean).join(' / ');
    document.getElementById('player-meta').innerText = playerMeta;

    // Mostrar player
    player.classList.add('visible');

    // Actualizar color de la barra
    document.getElementById('progress-bar-fill').style.backgroundColor = color;
}

// Lógica de tiempo (conectar con el audio activo)
let _trackTimeHandler = null;
let _prevTrackAudio = null;

function trackTime() {
    if (!activeAudio) return;

    // Remover listener anterior (evita acumulación)
    if (_prevTrackAudio && _trackTimeHandler) {
        _prevTrackAudio.removeEventListener('timeupdate', _trackTimeHandler);
    }

    const progressFill = document.getElementById('progress-bar-fill');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-duration');

    _trackTimeHandler = () => {
        const percent = (activeAudio.currentTime / activeAudio.duration) * 100;
        progressFill.style.width = percent + '%';
        currentTimeEl.innerText = formatTime(activeAudio.currentTime);
        if (!isNaN(activeAudio.duration)) {
            totalTimeEl.innerText = formatTime(activeAudio.duration);
        }
    };

    activeAudio.addEventListener('timeupdate', _trackTimeHandler);
    _prevTrackAudio = activeAudio;
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// CLIC EN BARRA DE PROGRESO PARA SALTAR
document.querySelector('.progress-bar-bg').addEventListener('click', function(e) {
    if (!activeAudio || !activeAudio.duration) return;
    var rect = this.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var percent = x / rect.width;
    activeAudio.currentTime = percent * activeAudio.duration;
});

// CONTROL DEL BOTÓN PLAY/PAUSE DE LA BARRA GLOBAL
document.getElementById('player-play-btn').addEventListener('click', function () {
    if (!activeAudio) return;

    if (activeAudio.paused) {
        activeAudio.play();
        if (activeCard) activeCard.classList.add('active');
        // Pone icono de PAUSA
        this.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    } else {
        activeAudio.pause();
        if (activeCard) activeCard.classList.remove('active');
        // Pone icono de PLAY
        this.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }
});

/* ============================================================
   SISTEMA DE RESERVAS + AUTENTICACIÓN
   ============================================================ */

const WHATSAPP_NUMBER = "584246603660";

// Estado global de reserva
let selectedDate = null;
let selectedHora = null;
let selectedHoraFin = null;
let calendarYear, calendarMonth;

// ── Auth Widget ──────────────────────────────────────────────
async function renderAuthWidget() {
    const widget = document.getElementById('auth-widget');
    if (!widget) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        const perfil = await getPerfilUsuario(session.user.id);
        const nombre = perfil ? perfil.nombre : 'Usuario';
        const esAdmin = perfil && perfil.role === 'admin';
        widget.innerHTML = `
            <a href="mi-cuenta.html" class="user-nav-name" style="text-decoration:none;color:#888;">${nombre}</a>
            ${esAdmin ? '<a href="admin/index.html" class="user-nav-btn" style="border-color:gold;color:gold;">ADMIN</a>' : ''}
            <button class="user-nav-btn" id="logout-btn-nav">SALIR</button>
        `;
        document.getElementById('logout-btn-nav').addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.reload();
        });
    } else {
        widget.innerHTML = `
            <a href="login.html" class="user-nav-btn">LOGIN</a>
            <a href="signup.html" class="user-nav-btn" style="background:white;color:black;">REGISTRAR</a>
        `;
    }
}

// ── Abrir modal si viene de signup con sesión activa ─────────
async function checkPendingBooking() {
    const pending = sessionStorage.getItem('pending_booking');
    if (!pending) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { fecha, hora, hora_fin } = JSON.parse(pending);
    selectedDate = fecha;
    selectedHora = hora;
    selectedHoraFin = hora_fin;
    // Scroll al calendario y abrir modal
    setTimeout(async () => await abrirModalConfirmacion(), 800);
}

// ── Calendario ───────────────────────────────────────────────
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function initCalendar() {
    const now = new Date();
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
    renderCalendarConBloqueos();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-days-grid');
    const label = document.getElementById('calendar-month-year');
    if (!grid || !label) return;
    label.textContent = `${MESES[calendarMonth]} ${calendarYear}`;
    grid.innerHTML = '';

    // Encabezados de días
    DIAS_SEMANA.forEach(d => {
        const el = document.createElement('div');
        el.className = 'calendar-day-name';
        el.textContent = d;
        grid.appendChild(el);
    });

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dayEl = document.createElement('div');
        const thisDate = new Date(calendarYear, calendarMonth, d);
        const isoDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dayEl.textContent = d;

        if (thisDate < today) {
            dayEl.className = 'calendar-day past';
        } else {
            dayEl.className = 'calendar-day available' + (thisDate.getTime() === today.getTime() ? ' today' : '');
            dayEl.dataset.fecha = isoDate;
            dayEl.addEventListener('click', () => onDayClick(dayEl, isoDate));
        }
        grid.appendChild(dayEl);
    }
}

async function onDayClick(dayEl, fecha) {
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    dayEl.classList.add('selected');
    selectedDate = fecha;
    selectedHora = null;
    selectedHoraFin = null;

    const slotsContainer = document.getElementById('slots-container');
    const slotsGrid = document.getElementById('slots-grid');
    const dateStr = document.getElementById('selected-date-str');
    const scheduleBtn = document.getElementById('schedule-session-btn');

    if (scheduleBtn) scheduleBtn.disabled = true;
    slotsGrid.innerHTML = '<div style="color:#555;font-size:0.8rem;letter-spacing:1px;padding:10px 0;">Cargando disponibilidad...</div>';
    slotsContainer.style.display = 'block';

    const [yyyy, mm, dd] = fecha.split('-');
    if (dateStr) dateStr.textContent = `${dd}/${mm}/${yyyy}`;

    const horas = await obtenerHorasDisponibles(fecha);
    slotsGrid.innerHTML = '';

    if (horas.length === 0) {
        slotsGrid.innerHTML = '<div style="color:#555;font-size:0.8rem;letter-spacing:1px;grid-column:1/-1;">Sin horarios disponibles para este día.</div>';
        return;
    }

    horas.forEach(({ hora, hora_fin }) => {
        const chip = document.createElement('div');
        chip.className = 'slot-chip';
        chip.textContent = hora + ' – ' + hora_fin;
        chip.dataset.horaFin = hora_fin;
        chip.addEventListener('click', () => {
            document.querySelectorAll('.slot-chip.selected').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedHora = hora;
            selectedHoraFin = hora_fin;
            if (scheduleBtn) scheduleBtn.disabled = false;
        });
        slotsGrid.appendChild(chip);
    });
}

async function obtenerHorasDisponibles(fechaSeleccionada) {
    const date = new Date(fechaSeleccionada + 'T12:00:00');
    const diaSemana = date.getDay();

    try {
        const [slotsRes, bloqueosRes, ocupadasRes] = await Promise.all([
            supabase.from('weekly_slots').select('*').eq('dia_semana', diaSemana).eq('activo', true),
            supabase.from('blocked_dates').select('*').eq('fecha', fechaSeleccionada),
            supabase.from('bookings').select('hora_inicio').eq('fecha', fechaSeleccionada).in('estado', ['aprobada','reprogramada'])
        ]);

        const slots = slotsRes.data || [];
        if (slots.length === 0) return [];

        const bloqueos = bloqueosRes.data || [];
        if (bloqueos.some(b => b.todo_el_dia)) return [];

        const horasOcupadas = new Set((ocupadasRes.data || []).map(b => b.hora_inicio.substring(0, 5)));

        const disponibles = [];
        for (const slot of slots) {
            const inicioParts = slot.hora_inicio.split(':');
            const finParts = slot.hora_fin.split(':');
            let h = parseInt(inicioParts[0]);
            let m = parseInt(inicioParts[1]);
            const finTotal = parseInt(finParts[0]) * 60 + parseInt(finParts[1]);
            const duracion = slot.duracion_minutos;

            while (h * 60 + m + duracion <= finTotal) {
                const horaStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const minEnd = m + duracion;
                const hFin = h + Math.floor(minEnd / 60);
                const mFin = minEnd % 60;
                const horaFinStr = `${String(hFin).padStart(2, '0')}:${String(mFin).padStart(2, '0')}`;

                if (!horasOcupadas.has(horaStr)) {
                    const estaBloqueada = bloqueos.some(b => {
                        if (!b.hora_inicio || !b.hora_fin) return false;
                        return horaStr >= b.hora_inicio.substring(0, 5) && horaStr < b.hora_fin.substring(0, 5);
                    });
                    if (!estaBloqueada) {
                        disponibles.push({ hora: horaStr, hora_fin: horaFinStr });
                    }
                }

                h = hFin;
                m = mFin;
            }
        }
        return disponibles;
    } catch (e) {
        console.error("Error obteniendo disponibilidad:", e);
        return [];
    }
}

// ── Navegación del Calendario ────────────────────────────────
document.getElementById('prev-month-btn')?.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendarConBloqueos();
    resetCalendarState();
});

document.getElementById('next-month-btn')?.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendarConBloqueos();
    resetCalendarState();
});

function resetCalendarState() {
    const sc = document.getElementById('slots-container');
    if (sc) sc.style.display = 'none';
    selectedDate = selectedHora = selectedHoraFin = null;
    const btn = document.getElementById('schedule-session-btn');
    if (btn) btn.disabled = true;
}

async function fetchAndMarkBlockedDates() {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const startStr = firstDay.toISOString().split('T')[0];
    const endStr = lastDay.toISOString().split('T')[0];

    const { data: bloqueos } = await supabase
        .from('blocked_dates')
        .select('fecha')
        .gte('fecha', startStr)
        .lte('fecha', endStr)
        .eq('todo_el_dia', true);

    if (!bloqueos) return;
    const fechasBloqueadas = new Set(bloqueos.map(b => b.fecha));

    document.querySelectorAll('.calendar-day.available').forEach(el => {
        if (fechasBloqueadas.has(el.dataset.fecha)) {
            el.className = 'calendar-day blocked';
        }
    });
}

async function renderCalendarConBloqueos() {
    renderCalendar();
    await fetchAndMarkBlockedDates();
}

// ── Botón Agendar (interceptor auth) ────────────────────────
document.getElementById('schedule-session-btn')?.addEventListener('click', async () => {
    if (!selectedDate || !selectedHora) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        sessionStorage.setItem('pending_booking', JSON.stringify({ fecha: selectedDate, hora: selectedHora, hora_fin: selectedHoraFin }));
        window.location.href = 'signup.html';
        return;
    }
    abrirModalConfirmacion();
});

// ── Modal ────────────────────────────────────────────────────
async function abrirModalConfirmacion() {
    const modal = document.getElementById('booking-modal');
    const summary = document.getElementById('modal-booking-summary');
    if (!modal || !summary) return;
    if (!selectedDate) return;
    const [yyyy, mm, dd] = selectedDate.split('-');

    // Obtener datos del perfil si está logueado
    var nombreArtista = 'Artista';
    var telefono = '';
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        const perfil = await getPerfilUsuario(session.user.id);
        if (perfil) {
            nombreArtista = perfil.nombre + ' ' + (perfil.apellido || '');
            telefono = perfil.telefono || '';
        }
    }

    window._bookingNombre = nombreArtista;
    window._bookingTelefono = telefono;

    summary.innerHTML = '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;">Fecha</span><span style="font-weight:800;font-size:0.9rem;">' + dd + '/' + mm + '/' + yyyy + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;">Horario</span><span style="font-weight:800;font-size:0.9rem;">' + selectedHora + ' – ' + selectedHoraFin + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;">Nombre</span><span style="font-weight:800;font-size:0.9rem;">' + nombreArtista + '</span></div>' +
        '</div>';
    modal.classList.add('active');
}

document.getElementById('close-booking-modal')?.addEventListener('click', () => {
    document.getElementById('booking-modal')?.classList.remove('active');
});

document.getElementById('booking-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'booking-modal') e.target.classList.remove('active');
});

// ── Submit: INSERT → WhatsApp ────────────────────────────────
document.getElementById('booking-confirm-btn')?.addEventListener('click', async () => {
    const submitBtn = document.getElementById('booking-confirm-btn');
    submitBtn.textContent = 'Procesando...';
    submitBtn.disabled = true;

    const artista = window._bookingNombre || 'Artista';
    const telefono = window._bookingTelefono || '';

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'signup.html'; return; }

    const { error } = await supabase.from('bookings').insert([{
        client_id: session.user.id,
        nombre_artista: artista,
        telefono: telefono,
        fecha: selectedDate,
        hora_inicio: selectedHora,
        hora_fin: selectedHoraFin,
        estado: 'pendiente'
    }]);

    if (error) {
        console.error('Error guardando reserva:', error);
        submitBtn.textContent = 'Error — Intenta nuevamente';
        submitBtn.disabled = false;
        return;
    }

    sessionStorage.removeItem('pending_booking');

    const [yyyy, mm, dd] = selectedDate.split('-');
    const msg = encodeURIComponent(
        'Hola, acabo de agendar una cita de grabacion. Nombre: ' + artista + ', Fecha: ' + dd + '/' + mm + '/' + yyyy + ', Horario: ' + selectedHora + ' – ' + selectedHoraFin + '. Quedo atento a la confirmacion.'
    );
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');

    document.getElementById('booking-modal')?.classList.remove('active');
    submitBtn.textContent = 'Confirmar y Enviar a WhatsApp';
    submitBtn.disabled = false;
    resetCalendarState();
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    document.getElementById('slots-container').style.display = 'none';
});

/* ══ CAMPAIGN MODAL + BANNER ════════════════════════════ */
const BANNER_DISMISS_KEY = 've_banner_dismissed';
var _campaignModalDismissed = false;

async function prefetchCampaignConfig() {
    try {
        const { data } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'solidarity_campaign')
            .single();
        if (data && data.value) {
            const cfg = window.SOLIDARITY_CONFIG || {};
            Object.assign(cfg, data.value);
            window.SOLIDARITY_CONFIG = cfg;
        }
    } catch (e) {
        console.error('Error precargando campaña:', e);
    }
}

function cerrarIntro() {
    tagAudio.pause();
    tagAudio.currentTime = 0;

    const cfg = window.SOLIDARITY_CONFIG || {};
    if (cfg.isActive) {
        if (cfg.showBanner !== false) {
            const bannerDismissed = localStorage.getItem(BANNER_DISMISS_KEY);
            if (!bannerDismissed) {
                mostrarBanner(cfg);
            }
        }
        if (cfg.showModal !== false && !_campaignModalDismissed) {
            mostrarModal(cfg);
        }
    }

    loader.style.opacity = '0';
    const transitionHandler = (e) => {
        if (e.propertyName === 'opacity') {
            loader.style.display = 'none';
            loader.removeEventListener('transitionend', transitionHandler);
        }
    };
    loader.addEventListener('transitionend', transitionHandler);
}

function mostrarModal(cfg) {
    const modal = document.getElementById('campaign-modal');
    if (!modal) return;

    const flag = document.getElementById('campaign-flag-icon');
    const title = document.getElementById('campaign-title');
    const msg = document.getElementById('campaign-message');
    const btnPrimary = document.getElementById('campaign-btn-primary');

    document.getElementById('campaign-content').style.display = '';

    if (flag) flag.textContent = cfg.flagEmoji || '🇻🇪';
    if (title) title.textContent = cfg.title || 'Unidos por Venezuela';
    if (msg) msg.innerHTML = (cfg.message || '').replace(/\n/g, '<br>');

    if (btnPrimary) {
        btnPrimary.href = cfg.primaryDonationUrl || cfg.primaryUrl || '#';
        btnPrimary.textContent = cfg.primaryLabel || 'Donar Ahora';
    }

    modal.classList.add('active');
}

function mostrarBanner(cfg) {
    const banner = document.getElementById('campaign-banner');
    const textEl = document.getElementById('campaign-banner-text');
    if (!banner || !textEl) return;

    var resumen = (cfg.message || '').substring(0, 180);
    if (cfg.message && cfg.message.length > 180) resumen += '…';
    var cta = cfg.primaryLabel || 'Donar Ahora';
    const primaryUrl = cfg.primaryDonationUrl || cfg.primaryUrl || '#';
    textEl.textContent = (cfg.flagEmoji || '🇻🇪') + '  ' + (cfg.title || '').toUpperCase() + '  ·  ' + resumen + '  →  ' + cta + '  ·  ' + primaryUrl + '  ·  ';

    const isMobile = window.innerWidth <= 768;
    document.documentElement.style.setProperty('--banner-height', isMobile ? '34px' : '40px');

    if (cfg.bannerSpeed) {
        textEl.style.animationDuration = cfg.bannerSpeed + 's';
        document.documentElement.style.setProperty('--banner-speed', cfg.bannerSpeed + 's');
    }
    if (cfg.bannerAccent) {
        document.documentElement.style.setProperty('--banner-accent-color', cfg.bannerAccent);
    }

    banner.style.display = 'flex';
    banner._primaryUrl = primaryUrl;
    banner._analyticsEventName = cfg.analyticsEventName || 'click_donation_venezuela';
}

document.getElementById('close-campaign-modal')?.addEventListener('click', () => {
    _campaignModalDismissed = true;
    document.getElementById('campaign-modal')?.classList.remove('active');
});

document.getElementById('campaign-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'campaign-modal') {
        _campaignModalDismissed = true;
        e.target.classList.remove('active');
    }
});

document.getElementById('campaign-dismiss-btn')?.addEventListener('click', () => {
    _campaignModalDismissed = true;
    document.getElementById('campaign-modal')?.classList.remove('active');
});

document.getElementById('campaign-banner-close')?.addEventListener('click', () => {
    localStorage.setItem(BANNER_DISMISS_KEY, '1');
    document.getElementById('campaign-banner').style.display = 'none';
    document.documentElement.style.setProperty('--banner-height', '0px');
});

document.getElementById('campaign-banner-track')?.addEventListener('click', (e) => {
    if (e.target.id === 'campaign-banner-close') return;
    var banner = document.getElementById('campaign-banner');
    if (banner && banner._primaryUrl && banner._primaryUrl !== '#') {
        window.open(banner._primaryUrl, '_blank', 'noopener,noreferrer');
    }
});

// ── Inicialización ───────────────────────────────────────────
prefetchCampaignConfig();
renderAuthWidget();
checkPendingBooking();
initCalendar();