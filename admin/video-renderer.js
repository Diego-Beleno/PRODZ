/* ── Video Renderer PRODZ ──────────────────────────────────────
   Motor client-side para generar videos promocionales de beats.
   Canvas 1080×1920 + AudioContext + AnalyserNode + MediaRecorder.
   ──────────────────────────────────────────────────────────────── */

const VIDEO_FORMATS = [
  { mime: 'video/mp4;codecs=h264', label: 'MP4 H.264', ext: 'mp4' },
  { mime: 'video/mp4',              label: 'MP4',        ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', label: 'WebM VP9',  ext: 'webm' },
  { mime: 'video/webm;codecs=vp8', label: 'WebM VP8',  ext: 'webm' },
  { mime: 'video/webm',            label: 'WebM',       ext: 'webm' },
];

function detectSupportedFormats() {
  return VIDEO_FORMATS.filter(function(f) {
    try {
      return MediaRecorder.isTypeSupported(f.mime);
    } catch (_) { return false; }
  });
}

function getBestFormat(preferredExt) {
  var supported = detectSupportedFormats();
  if (!supported.length) return null;
  if (preferredExt === 'mp4') {
    var mp4 = supported.find(function(f) { return f.ext === 'mp4'; });
    if (mp4) return mp4;
  }
  return supported[0];
}

/* ── VideoRenderer class ───────────────────────────────────── */
function VideoRenderer(opts) {
  this.beat = opts.beat;
  this.format = opts.format;
  this.canvas = opts.canvas;
  this.onProgress = opts.onProgress || function(){};
  this.onComplete = opts.onComplete || function(){};
  this.onError = opts.onError || function(){};
  this._aborted = false;
  this._recorder = null;
  this._audioCtx = null;
  this._source = null;
  this._rafId = null;
}

VideoRenderer.prototype.render = async function() {
  var self = this;
  try {
    var beat = self.beat;
    if (!beat.audio_url) throw new Error('El beat no tiene archivo de audio.');

    // 1. Cargar imagen de portada
    var coverImg = new Image();
    coverImg.crossOrigin = 'anonymous';
    await new Promise(function(resolve, reject) {
      coverImg.onload = resolve;
      coverImg.onerror = function() {
        // Si no hay imagen o falla, usar un canvas negro
        var c = document.createElement('canvas');
        c.width = 1080; c.height = 1080;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 1080, 1080);
        coverImg.src = c.toDataURL();
        resolve();
      };
      coverImg.src = beat.image_url || '';
      if (!beat.image_url) {
        var c = document.createElement('canvas');
        c.width = 1080; c.height = 1080;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 1080, 1080);
        coverImg.src = c.toDataURL();
      }
    });

    // 2. Configurar canvas de salida
    var canvas = self.canvas;
    canvas.width = 1080;
    canvas.height = 1920;
    var ctx = canvas.getContext('2d');

    // 3. Pre-renderizar fondo blur (una sola vez)
    var bgCanvas = document.createElement('canvas');
    bgCanvas.width = 1080;
    bgCanvas.height = 1920;
    var bgCtx = bgCanvas.getContext('2d');
    // Escalar la imagen para que cubra todo el canvas + bordes extra para blur
    bgCtx.filter = 'blur(40px) brightness(0.5)';
    bgCtx.drawImage(coverImg, -100, -100, bgCanvas.width + 200, bgCanvas.height + 200);
    bgCtx.filter = 'none';
    // Overlay oscuro
    bgCtx.fillStyle = 'rgba(0,0,0,0.25)';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    // 4. Cargar audio
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    self._audioCtx = audioCtx;
    var resp = await fetch(beat.audio_url);
    var arrayBuf = await resp.arrayBuffer();
    var audioBuffer = await audioCtx.decodeAudioData(arrayBuf);

    var source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    var analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    var bufferLength = analyser.frequencyBinCount;
    var dataArray = new Uint8Array(bufferLength);

    // 5. Configurar MediaRecorder
    var mimeType = self.format.mime;
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      // Fallback al primer formato soportado
      var fallback = getBestFormat();
      if (!fallback) throw new Error('Tu navegador no soporta grabación de video.');
      mimeType = fallback.mime;
      self.format = fallback;
    }

    var stream = canvas.captureStream(30);
    var recorder = new MediaRecorder(stream, { mimeType: mimeType });
    self._recorder = recorder;

    var chunks = [];
    recorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    var blobPromise = new Promise(function(resolve) {
      recorder.onstop = function() {
        resolve(new Blob(chunks, { type: self.format.mime.split(';')[0] }));
      };
    });

    var startTime = audioCtx.currentTime;
    var totalDuration = audioBuffer.duration * 1000; // ms
    recorder.start();
    source.start(0);

    // 6. Render loop
    function drawFrame() {
      if (self._aborted) {
        try { source.stop(); recorder.stop(); audioCtx.close(); } catch(e){}
        return;
      }

      var elapsed = (audioCtx.currentTime - startTime) * 1000;
      var progress = Math.min(elapsed / totalDuration, 1);

      // Fondo pre-renderizado
      ctx.drawImage(bgCanvas, 0, 0);

      // Espectro de frecuencias
      analyser.getByteFrequencyData(dataArray);
      var barCount = bufferLength;
      var barWidth = 1080 / barCount * 2.2;
      var spectrumHeight = 500;
      var spectrumY = 1920 - spectrumHeight - 100;

      var grad = ctx.createLinearGradient(0, 1920, 0, spectrumY);
      var accent = beat.color || '#00ff88';
      grad.addColorStop(0, accent);
      grad.addColorStop(1, 'rgba(255,255,255,0.1)');

      for (var i = 0; i < barCount; i++) {
        var barH = (dataArray[i] / 255) * spectrumHeight;
        var x = i * barWidth + 6;
        var alpha = 0.4 + (dataArray[i] / 255) * 0.6;
        ctx.fillStyle = 'rgba(255,255,255,' + alpha * 0.15 + ')';
        ctx.fillRect(x, 1920 - barH - 100, barWidth - 3, barH);
        ctx.fillStyle = accent;
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillRect(x, 1920 - barH - 100, barWidth - 3, Math.max(2, barH * 0.4));
        ctx.globalAlpha = 1;
      }

      // Pulso: promedio de frecuencias bajas (indices 0-5)
      var bassSum = 0;
      for (var b = 0; b < 6; b++) bassSum += dataArray[b] || 0;
      var bassIntensity = bassSum / (6 * 255);
      var pulse = 1 + bassIntensity * 0.06;

      // Sombra reactiva
      ctx.shadowColor = accent;
      ctx.shadowBlur = 20 + bassIntensity * 40;

      // Cover central con pulso
      var coverSize = 480 * pulse;
      var cx = (1080 - coverSize) / 2;
      var cy = (1920 - coverSize) / 2 - 180;
      ctx.drawImage(coverImg, cx, cy, coverSize, coverSize);
      ctx.shadowBlur = 0;

      // Borde/badge efecto
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.3 + bassIntensity * 0.3;
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 6, cy - 6, coverSize + 12, coverSize + 12);
      ctx.globalAlpha = 1;

      // Título
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 12;
      ctx.fillText(beat.titulo, 540, cy + coverSize + 140);
      ctx.shadowBlur = 0;

      // BPM + Género
      ctx.fillStyle = accent;
      ctx.font = '32px Inter, sans-serif';
      ctx.fillText((beat.bpm || '—') + ' BPM  ·  ' + (beat.genero || ''), 540, cy + coverSize + 210);

      // Barra de progreso
      var barY = 1920 - 70;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.roundRect(100, barY, 880, 6, 3);
      ctx.fill();

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(100, barY, 880 * progress, 6, 3);
      ctx.fill();

      // Tiempo transcurrido
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '20px Inter, sans-serif';
      ctx.textAlign = 'left';
      var elapsedSec = Math.floor(elapsed / 1000);
      var totalSec = Math.floor(totalDuration / 1000);
      ctx.fillText(formatTime(elapsedSec) + ' / ' + formatTime(totalSec), 100, barY - 18);

      // Logo PRODZ (marca de agua sutil)
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('PRODZ', 1060, barY - 18);

      self.onProgress({ progress: progress, elapsed: elapsed, total: totalDuration });

      if (progress < 1) {
        self._rafId = requestAnimationFrame(drawFrame);
      } else {
        // Terminar
        try {
          source.stop();
          recorder.stop();
        } catch(e) {}
      }
    }

    drawFrame();
    var videoBlob = await blobPromise;
    audioCtx.close();
    self._audioCtx = null;
    self._recorder = null;

    if (self._aborted) return;
    try { self.onComplete(videoBlob, self.format); } catch(cbErr) {
      console.error('[VideoRenderer] Error en onComplete:', cbErr);
      try { self.onError(cbErr); } catch(_){}
    }

  } catch (err) {
    // Asegurar limpieza
    try { if (self._audioCtx) self._audioCtx.close(); } catch(_){}
    try { if (self._recorder && self._recorder.state === 'recording') self._recorder.stop(); } catch(_){}
    self._audioCtx = null;
    self._recorder = null;
    console.error('[VideoRenderer] Error en render:', err);
    try { self.onError(err); } catch(cbErr) {
      console.error('[VideoRenderer] Error en callback onError:', cbErr);
      // Si falla el callback, mostrar con el handler global
      if (window.mostrarError) window.mostrarError(err);
    }
  }
};

VideoRenderer.prototype.abort = function() {
  this._aborted = true;
  if (this._rafId) cancelAnimationFrame(this._rafId);
  if (this._recorder && this._recorder.state === 'recording') {
    try { this._recorder.stop(); } catch(e){}
  }
  if (this._audioCtx) {
    try { this._audioCtx.close(); } catch(e){}
  }
};

/* ── Helpers ─────────────────────────────────────────────── */
function formatTime(sec) {
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

/* ── roundRect polyfill para navegadores que no lo soporten ─ */
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}
