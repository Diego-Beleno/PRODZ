const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let activeAudio = null;
let activeCard = null;

// 1. FUNCIÓN PARA CARGAR EL CATÁLOGO DESDE EL JSON
// 1. FUNCIÓN PARA CARGAR EL CATÁLOGO DESDE EL JSON
async function cargarCatalogo() {
    try {
        const respuesta = await fetch('beats.json');
        const beats = await respuesta.json();
        
        // Seleccionamos los dos lugares del HTML
        const contenedorDestacados = document.querySelector('.grid-2x2'); // Sección de arriba
        const contenedorCatalogo = document.getElementById('catalogo-container'); // Sección de abajo

        // Limpiamos los beats que escribiste a mano en el HTML para que no se dupliquen
        if (contenedorDestacados) contenedorDestacados.innerHTML = '';
        if (contenedorCatalogo) contenedorCatalogo.innerHTML = '';

        beats.forEach(beat => {
            const card = document.createElement('article');
            card.className = 'beat-card';
            card.setAttribute('data-color', beat.color);
            card.setAttribute('data-audio', beat.audio);
            card.setAttribute('data-name', beat.name);

            card.innerHTML = `
                <div class="image-container">
                    <img src="${beat.image}" alt="${beat.name}" class="beat-cover">
                    <div class="play-overlay">
                        <div class="icon-wrapper">
                            <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            <svg class="icon-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        </div>
                    </div>
                </div>
                <div class="beat-info">
                    <h3>${beat.name}</h3>
                    <div class="beat-meta"><span>${beat.key}</span> | <span>${beat.bpm} BPM</span></div>
                    <canvas class="waveform-canvas"></canvas>
                    <button class="btn-license">ADQUIRIR LICENCIA</button>
                </div>`;

            // CLASIFICACIÓN: Si es featured va arriba, si no, va abajo
            if (beat.featured && contenedorDestacados) {
                contenedorDestacados.appendChild(card);
            } else if (!beat.featured && contenedorCatalogo) {
                contenedorCatalogo.appendChild(card);
            }

            inicializarCard(card);
        });
    } catch (error) {
        console.error("Error cargando el catálogo:", error);
    }
} // Cierre de la función
// 2. FUNCIÓN PARA ACTIVAR CADA TARJETA CREADA
function inicializarCard(card) {
    const audioUrl = card.getAttribute('data-audio');
    const color = card.getAttribute('data-color');
    const canvas = card.querySelector('.waveform-canvas');
    const imgContainer = card.querySelector('.image-container');
    
    const audio = new Audio(audioUrl);
    drawWaveform(audioUrl, canvas, color);

    if(imgContainer) {
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
        updateGlobalTheme(color);
    } else {
        audio.pause();
        card.classList.remove('active');
        card.style.borderColor = "rgba(255,255,255,0.05)";
    }
}

// 4. DIBUJO DE ONDA (Tu función original)
async function drawWaveform(audioUrl, canvas, color) {
    try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioData = await audioCtx.decodeAudioData(arrayBuffer);
        const ctx = canvas.getContext('2d');
        const data = audioData.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;

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

// 5. PROGRESO DE ONDA
function updateWaveformProgress(canvas, audio, color) {
    const ctx = canvas.getContext('2d');
    const progress = audio.currentTime / audio.duration;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
    ctx.restore();
}

// 6. TEMA DINÁMICO
function updateGlobalTheme(color) {
    document.documentElement.style.setProperty('--accent-color', color);
    document.body.style.backgroundImage = `radial-gradient(circle at top, ${color}22 0%, #050505 100%)`;
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.style.color = color;
        link.style.borderBottom = `2px solid ${color}`;
    });
}

// 7. LOADER Y WHATSAPP
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            document.body.classList.remove('is-loading');
        }, 500);
    }, 500);
});

document.addEventListener('click', (e) => {
    const numeroTelefono = "584246603660"; 
    if (e.target.classList.contains('btn-license')) {
        const card = e.target.closest('.beat-card');
        const nombreBeat = card.getAttribute('data-name');
        const texto = encodeURIComponent(`Hola! Estoy interesado/a en adquirir una licencia para el beat: ${nombreBeat}`);
        window.open(`https://wa.me/${numeroTelefono}?text=${texto}`, '_blank');
    }
    if (e.target.classList.contains('service-btn-custom')) {
        const mensajeServicio = e.target.getAttribute('data-msg');
        window.open(`https://wa.me/${numeroTelefono}?text=${encodeURIComponent(mensajeServicio)}`, '_blank');
    }
});

// LANZAMIENTO INICIAL
cargarCatalogo();