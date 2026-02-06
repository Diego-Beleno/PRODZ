/**
 * CONFIGURACIÓN GLOBAL DE AUDIO
 */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let activeAudio = null; // Guarda el audio que suena actualmente
let activeCard = null;  // Guarda la tarjeta del beat activo

// Seleccionamos todos los beats
const beatCards = document.querySelectorAll('.beat-card');

/**
 * FUNCIÓN PARA DIBUJAR EL WAVEFORM (ONDA)
 * Esta función procesa el audio y lo dibuja en el canvas
 */
async function drawWaveform(audioUrl, canvas, color) {
    try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioData = await audioCtx.decodeAudioData(arrayBuffer);
        
        const ctx = canvas.getContext('2d');
        const data = audioData.getChannelData(0); // Canal izquierdo
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;

        ctx.fillStyle = "#333333"; // Color base (gris oscuro)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            // Dibujamos la barrita vertical
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
    } catch (error) {
        console.error("Error cargando el waveform:", error);
    }
}

/**
 * GESTIÓN DE REPRODUCCIÓN E INICIALIZACIÓN
 */
beatCards.forEach(card => {
    const audioUrl = card.getAttribute('data-audio');
    const canvas = card.querySelector('.waveform-canvas');
    const color = card.getAttribute('data-color');
    const btnPlay = card.querySelector('.btn-play');
    
    // Crear el elemento de audio para cada beat
    const audio = new Audio(audioUrl);
    
    // Dibujar la onda al cargar la página
    drawWaveform(audioUrl, canvas, color);

    // Evento al hacer click en PLAY
    btnPlay.addEventListener('click', () => {
        handlePlayback(audio, card, color);
    });

    // Actualizar el canvas mientras suena (Progreso)
    // CORRECCIÓN AQUÍ: Se eliminó la palabra 'function' que sobraba
    audio.addEventListener('timeupdate', () => {
        updateCanvasProgress(audio, canvas, color);
    });
});

/**
 * LÓGICA DE PLAY/PAUSE Y WHATSAPP
 */
function handlePlayback(audio, card, color) {
    const btn = card.querySelector('.btn-play');
    const beatName = card.getAttribute('data-name') || "Beat";
    const btnLicense = card.querySelector('.btn-license');

    // Configurar el mensaje de WhatsApp (OnClick para actualizar dinámicamente)
    btnLicense.onclick = (e) => {
        e.preventDefault(); // Previene comportamiento default si es un link
        const msg = encodeURIComponent(`Hola, estoy interesado/a en adquirir una licencia para usar el ${beatName}`);
        window.open(`https://wa.me/584246603660?text=${msg}`, '_blank');
    };

    // Si hay otro audio sonando, pausarlo
    if (activeAudio && activeAudio !== audio) {
        activeAudio.pause();
        activeCard.classList.remove('active');
        activeCard.querySelector('.btn-play').innerText = "PLAY";
        activeCard.style.borderColor = "transparent"; // Reset del borde anterior
    }

    // Toggle Play/Pause del audio actual
    if (audio.paused) {
        audio.play();
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        btn.innerText = "PAUSE";
        activeAudio = audio;
        activeCard = card;
        updateGlobalTheme(color);
        
        // Centrar el beat en el scroll horizontal
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
        audio.pause();
        card.classList.remove('active'); // Opcional: quitar borde si pausa
        btn.innerText = "PLAY";
    }
}

/**
 * PINTAR EL PROGRESO EN EL CANVAS
 */
function updateCanvasProgress(audio, canvas, color) {
    const ctx = canvas.getContext('2d');
    const progress = (audio.currentTime / audio.duration) * canvas.width;
    const audioUrl = canvas.closest('.beat-card').getAttribute('data-audio');
    
    // Usamos composición para pintar sobre la onda existente
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, progress, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // Si el beat termina
    if (audio.ended) {
        const card = canvas.closest('.beat-card');
        card.querySelector('.btn-play').innerText = "PLAY";
        card.classList.remove('active');
        // Redibujar la onda limpia (gris)
        drawWaveform(audioUrl, canvas, color);
    }
}

/**
 * ACTUALIZAR EL TEMA GLOBAL (FONDO Y NAVBAR)
 */
function updateGlobalTheme(color) {
    const root = document.documentElement;
    
    // Transición suave de variables CSS
    root.style.transition = "all 0.8s ease"; 
    root.style.setProperty('--accent-color', color);
    
    // Aplicamos el tinte al fondo con una transición suave
    document.body.style.transition = "background 0.8s ease, background-image 0.8s ease";
    document.body.style.backgroundImage = `radial-gradient(circle at top, ${color}15 0%, #050505 100%)`;

    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.style.transition = "color 0.8s ease, border-color 0.8s ease";
        link.style.color = color;
        link.style.borderBottom = `2px solid ${color}`;
    });

    // Añadimos lógica para los títulos de servicios que acabamos de recuperar
    const serviceTitles = document.querySelectorAll('.service-category h3');
    serviceTitles.forEach(title => {
        title.style.transition = "color 0.8s ease";
        title.style.color = color;
    });
}

/**
 * GESTIÓN DEL LOADER
 */
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            document.body.classList.remove('is-loading');
        }, 500);
    }, 1000);
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