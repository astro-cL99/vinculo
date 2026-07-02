/* Vínculo — Voice recorder
 * MediaRecorder wrapper. NO almacena audio: el blob se crea sólo al detener,
 * se envía y se descarta inmediatamente (URL.revokeObjectURL + null).
 *
 * API: window.__AR_VOICE_RECORDER = { create(onLevel) → { start, stop, abort } }
 */
(function () {
  if (window.__AR_VOICE_RECORDER) return;

  function pickMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const m of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
    }
    return "";
  }

  async function create(onLevel) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000,
      },
    });

    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

    // Análisis de nivel (solo para UI, no se guarda)
    let audioCtx = null, analyser = null, src = null, rafId = null;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src = audioCtx.createMediaStreamSource(stream);
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        try { onLevel?.(Math.min(1, rms * 2.5)); } catch (_) {}
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } catch (_) {}

    const cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      try { src?.disconnect(); } catch (_) {}
      try { analyser?.disconnect(); } catch (_) {}
      try { audioCtx?.close(); } catch (_) {}
      stream.getTracks().forEach((t) => t.stop());
    };

    const start = () => {
      if (rec.state !== "recording") rec.start(1000); // chunk cada 1s para liberar memoria
    };

    const stop = () =>
      new Promise((resolve, reject) => {
        if (rec.state === "inactive") { cleanup(); resolve(null); return; }
        rec.onstop = () => {
          cleanup();
          if (!chunks.length) { resolve(null); return; }
          const blob = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });
          // Vaciar referencias internas: importante para no retener audio en memoria
          chunks.length = 0;
          resolve(blob);
        };
        rec.onerror = (e) => { cleanup(); reject(e?.error || new Error("MediaRecorder error")); };
        rec.stop();
      });

    const abort = () => { try { rec.state !== "inactive" && rec.stop(); } catch (_) {} chunks.length = 0; cleanup(); };

    return { start, stop, abort, mimeType: rec.mimeType || mimeType };
  }

  window.__AR_VOICE_RECORDER = { create };
})();
