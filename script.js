const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let activeAudio = null;
let activeCard = null;

const beatCards = document.querySelectorAll('.beat-card');

beatCards.forEach(card => {
    const audioUrl = card.getAttribute('data-audio');
    const color = card.getAttribute('data-color');
    const canvas = card.querySelector('.waveform-canvas');
    const imgContainer = card.querySelector('.image-container'); // Detectar click en la imagen
    
    const audio = new Audio(audioUrl);
    drawWaveform(audioUrl, canvas, color);

    // Evento al tocar el contenedor de la imagen
    if(imgContainer) {
        imgContainer.addEventListener('click', () => {
            handlePlayback(audio, card, color);
        });
    }

    audio.addEventListener('timeupdate', () => {
        updateWaveformProgress(canvas, audio, color);
    });
});

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

// --- Funciones de soporte (Waveform y Tema) ---
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
        canvas.dataset.originalData = JSON.stringify(Array.from(data.slice(0, 1000))); // Simplificado para caché
    } catch (e) { console.error("Error dibujando onda:", e); }
}

function updateWaveformProgress(canvas, audio, color) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const progress = audio.currentTime / audio.duration;

    // 1. Guardamos la onda gris que ya dibujamos al principio
    // En lugar de borrar y redescargar, usamos el modo 'source-atop'
    // para pintar el progreso solo donde hay pixeles de la onda.
    
    ctx.save(); // Guardamos el estado limpio
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    
    // Dibujamos el rectángulo de progreso
    ctx.fillRect(0, 0, width * progress, height);
    ctx.restore(); // Restauramos el estado
}
function updateGlobalTheme(color) {
    document.documentElement.style.setProperty('--accent-color', color);
    document.body.style.backgroundImage = `radial-gradient(circle at top, ${color}22 0%, #050505 100%)`;
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.style.color = color;
        link.style.borderBottom = `2px solid ${color}`;
    });
}

// Quitar Loader
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
/**
 * INTERACCIÓN EN EL CANVAS (TIMELINE)
 */
document.querySelectorAll('.waveform-canvas').forEach((canvas) => {
    canvas.addEventListener('click', (e) => {
        const card = canvas.closest('.beat-card');
        
        // Solo permitimos saltar si este es el audio activo
        if (activeCard === card && activeAudio) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / canvas.width;
            activeAudio.currentTime = percentage * activeAudio.duration;
        }
    });
});

// ESCUCHADOR DE CLICKS PARA WHATSAPP (Pegar al final del JS)
document.addEventListener('click', (e) => {
    // Reemplaza con tu número real
    const numeroTelefono = "584246603660"; 

    // Botón de Licencia en la tarjeta
    if (e.target.classList.contains('btn-license')) {
        const card = e.target.closest('.beat-card');
        const nombreBeat = card.getAttribute('data-name');
        const texto = encodeURIComponent(`Hola! Estoy interesado/a en adquirir una licencia para usar el beat: ${nombreBeat}`);
        window.open(`https://wa.me/${numeroTelefono}?text=${texto}`, '_blank');
    }

    // Botones de servicios personalizados
    if (e.target.classList.contains('service-btn-custom')) {
        const mensajeServicio = e.target.getAttribute('data-msg');
        const texto = encodeURIComponent(mensajeServicio);
        window.open(`https://wa.me/${numeroTelefono}?text=${texto}`, '_blank');
    }
});