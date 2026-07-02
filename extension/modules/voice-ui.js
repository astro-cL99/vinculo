/* Vínculo — Voice UI (modal completo)
 * Flujo: consentimiento → grabación con nivel → spinner → preview editable → insertar.
 *
 * API: window.__AR_VOICE_UI = { openFor(targetTextarea) }
 */
(function () {
  if (window.__AR_VOICE_UI) return;

  // URL del backend Lovable: usamos el subdominio -dev (stable preview) para que
  // los fixes del servidor lleguen sin requerir publicar manualmente.
  const API_BASE = "https://neghme.lovable.app";
  const toast = (m) => window.__AR_HOST?.toast?.(m);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
    );

  function setReactValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function logConsent() {
    try {
      const list = await new Promise((r) =>
        chrome.storage.local.get(["__ar_consent_log"], (v) => r(v.__ar_consent_log || [])),
      );
      const entry = {
        ts: new Date().toISOString(),
        url: location.pathname,
        patientHash: window.__AR_PATIENT_HASH?.current?.() || null,
      };
      const next = [entry, ...list].slice(0, 200);
      await new Promise((r) => chrome.storage.local.set({ __ar_consent_log: next }, r));
    } catch (_) {}
  }

  function openFor(targetEl) {
    if (!targetEl) return;
    document.getElementById("ar-voice-modal")?.remove();

    const wrap = document.createElement("div");
    wrap.id = "ar-voice-modal";
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);" +
      "display:flex;align-items:center;justify-content:center;padding:24px;" +
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    wrap.innerHTML = `
      <div role="dialog" aria-label="Anamnesis por voz" style="background:#f8fafc;width:min(720px,100%);max-height:92vh;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden">
        <header style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.85">Vínculo · Voz</div>
            <h3 style="margin:2px 0 0;font-size:18px;font-weight:600">🎙 Anamnesis por voz</h3>
          </div>
          <button id="ar-vc-close" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px">✕</button>
        </header>
        <div id="ar-vc-body" style="flex:1 1 auto;overflow:auto;padding:16px 20px;background:#f1f5f9"></div>
        <footer style="padding:8px 18px;background:#fff;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:right">
          🔒 Audio no almacenado · Transcripción procesada y descartada · Ley 21.719
        </footer>
      </div>`;
    document.body.appendChild(wrap);

    const body = wrap.querySelector("#ar-vc-body");
    const close = () => { try { state.recorder?.abort(); } catch (_) {} wrap.remove(); };
    wrap.querySelector("#ar-vc-close").addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
    });

    const state = { phase: "consent", recorder: null, started: 0, struct: null, transcript: "" };

    function render() {
      if (state.phase === "consent") return renderConsent();
      if (state.phase === "recording") return renderRecording();
      if (state.phase === "processing") return renderProcessing();
      if (state.phase === "preview") return renderPreview();
      if (state.phase === "error") return renderError();
    }

    function renderConsent() {
      body.innerHTML = `
        <div style="background:#fff;border-radius:10px;padding:16px;border:1px solid #e2e8f0">
          <div style="font-size:14px;color:#0f172a;line-height:1.55">
            Esta funcionalidad escucha la conversación y la transcribe para sugerir una anamnesis estructurada.
            <strong>El audio no se almacena en ningún servidor</strong>; se procesa y descarta de inmediato.
          </div>
          <label style="display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;cursor:pointer">
            <input type="checkbox" id="ar-vc-consent" style="margin-top:3px;flex:0 0 auto"/>
            <span style="font-size:13px;color:#166534;line-height:1.5">
              Confirmo que <strong>he obtenido consentimiento verbal del paciente</strong> para transcribir esta conversación,
              cumpliendo la Ley 21.719 de Protección de Datos Personales.
            </span>
          </label>
          <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
            <button id="ar-vc-cancel" style="background:#fff;border:1px solid #cbd5e1;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px">Cancelar</button>
            <button id="ar-vc-start" disabled style="background:#7c3aed;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:not-allowed;font-size:13px;font-weight:600;opacity:.5">Iniciar grabación</button>
          </div>
        </div>`;
      const cb = body.querySelector("#ar-vc-consent");
      const btn = body.querySelector("#ar-vc-start");
      cb.addEventListener("change", () => {
        btn.disabled = !cb.checked;
        btn.style.cursor = cb.checked ? "pointer" : "not-allowed";
        btn.style.opacity = cb.checked ? "1" : ".5";
      });
      body.querySelector("#ar-vc-cancel").addEventListener("click", close);
      btn.addEventListener("click", startRecording);
    }

    async function startRecording() {
      try {
        state.recorder = await window.__AR_VOICE_RECORDER.create((lvl) => {
          const bar = body.querySelector("#ar-vc-level");
          if (bar) bar.style.width = `${Math.round(lvl * 100)}%`;
        });
        await logConsent();
        state.recorder.start();
        state.started = Date.now();
        state.phase = "recording";
        render();
        tickTimer();
      } catch (e) {
        state.error = e?.name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Habilítalo en el candado 🔒 de la barra de direcciones."
          : (e?.message || "No se pudo iniciar el micrófono");
        state.phase = "error";
        render();
      }
    }

    function tickTimer() {
      if (state.phase !== "recording") return;
      const el = body.querySelector("#ar-vc-timer");
      if (el) {
        const s = Math.floor((Date.now() - state.started) / 1000);
        el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      }
      setTimeout(tickTimer, 500);
    }

    function renderRecording() {
      body.innerHTML = `
        <div style="background:#fff;border-radius:10px;padding:20px;border:1px solid #e2e8f0;text-align:center">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;color:#dc2626;font-weight:600;font-size:14px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#dc2626;animation:ar-pulse 1.2s ease-in-out infinite"></span>
            GRABANDO
          </div>
          <div id="ar-vc-timer" style="font-size:34px;font-weight:700;color:#0f172a;margin:10px 0 14px;font-variant-numeric:tabular-nums">00:00</div>
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:0 auto 16px;max-width:360px">
            <div id="ar-vc-level" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#0ea5e9);transition:width 80ms linear"></div>
          </div>
          <p style="font-size:12px;color:#64748b;margin:0 0 16px">El audio se procesa localmente hasta que pulses Detener.</p>
          <button id="ar-vc-stop" style="background:#dc2626;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">⏹ Detener y transcribir</button>
        </div>
        <style>@keyframes ar-pulse{0%,100%{opacity:1}50%{opacity:.3}}</style>`;
      body.querySelector("#ar-vc-stop").addEventListener("click", stopRecording);
    }

    async function stopRecording() {
      state.phase = "processing";
      render();
      try {
        const blob = await state.recorder.stop();
        state.recorder = null;
        if (!blob || blob.size < 500) {
          state.error = "Audio demasiado corto o vacío.";
          state.phase = "error";
          render();
          return;
        }

        // 1) Transcribir
        const fd = new FormData();
        fd.append("audio", blob, "anamnesis.webm");
        const r1 = await fetch(`${API_BASE}/api/public/voice-transcribe`, { method: "POST", body: fd });
        if (!r1.ok) throw new Error(`Transcripción: ${(await r1.json().catch(() => ({}))).error || r1.status}`);
        const t = await r1.json();
        state.transcript = String(t.text || "").trim();
        if (state.transcript.length < 10) throw new Error("La transcripción quedó vacía.");

        // 2) Estructurar
        const r2 = await fetch(`${API_BASE}/api/public/voice-structure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: state.transcript }),
        });
        if (!r2.ok) throw new Error(`Estructuración: ${(await r2.json().catch(() => ({}))).error || r2.status}`);
        state.struct = await r2.json();
        state.phase = "preview";
        render();
      } catch (e) {
        state.error = e?.message || "Error al procesar el audio";
        state.phase = "error";
        render();
      }
    }

    function renderProcessing() {
      body.innerHTML = `
        <div style="background:#fff;border-radius:10px;padding:30px;border:1px solid #e2e8f0;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">⏳</div>
          <div style="font-size:14px;color:#0f172a;font-weight:600">Transcribiendo y estructurando…</div>
          <div style="font-size:12px;color:#64748b;margin-top:6px">Esto suele tomar entre 5 y 15 segundos.</div>
        </div>`;
    }

    function tab(activeKey) {
      const tabs = [
        { k: "estruct", lbl: "📋 Estructurado" },
        { k: "plano", lbl: "📝 Texto plano" },
        { k: "raw", lbl: "🎤 Transcripción cruda" },
      ];
      return tabs.map((t) =>
        `<button data-tab="${t.k}" style="background:${t.k === activeKey ? "#7c3aed" : "transparent"};color:${t.k === activeKey ? "#fff" : "#475569"};border:1px solid ${t.k === activeKey ? "#7c3aed" : "#cbd5e1"};padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">${t.lbl}</button>`,
      ).join("");
    }

    function fld(label, key, value, rows = 2) {
      return `
        <label style="display:block;margin-bottom:10px">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:4px">${esc(label)}</div>
          <textarea data-k="${key}" rows="${rows}" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;resize:vertical;background:#fff">${esc(value || "")}</textarea>
        </label>`;
    }

    function buildText(s) {
      const parts = [];
      if (s.motivo) parts.push(`Motivo de consulta: ${s.motivo}`);
      if (s.historia) parts.push(`Historia de la enfermedad actual: ${s.historia}`);
      if (s.antecedentes) parts.push(`Antecedentes: ${s.antecedentes}`);
      if (s.examen) parts.push(`Examen físico: ${s.examen}`);
      if (s.plan) parts.push(`Plan: ${s.plan}`);
      return parts.join("\n\n");
    }

    function renderPreview(activeTab = "estruct") {
      const s = state.struct || {};
      body.innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">${tab(activeTab)}</div>
        <div id="ar-vc-pane" style="background:#fff;border-radius:10px;padding:14px;border:1px solid #e2e8f0;max-height:50vh;overflow:auto"></div>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:space-between;align-items:center;flex-wrap:wrap">
          <span style="font-size:11px;color:#64748b">Revisa y edita antes de insertar.</span>
          <div style="display:flex;gap:6px">
            <button id="ar-vc-redo" style="background:#fff;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:13px">↺ Repetir</button>
            <button id="ar-vc-copy" style="background:#fff;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:13px">📋 Copiar</button>
            <button id="ar-vc-insert" style="background:#10b981;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">⬇ Insertar en ficha</button>
          </div>
        </div>`;
      const pane = body.querySelector("#ar-vc-pane");
      const paintPane = () => {
        if (activeTab === "estruct") {
          pane.innerHTML =
            fld("Motivo de consulta", "motivo", s.motivo, 2) +
            fld("Historia de la enfermedad actual", "historia", s.historia, 4) +
            fld("Antecedentes", "antecedentes", s.antecedentes, 3) +
            fld("Examen físico", "examen", s.examen, 2) +
            fld("Plan", "plan", s.plan, 3);
          pane.querySelectorAll("textarea[data-k]").forEach((t) => {
            t.addEventListener("input", () => { s[t.dataset.k] = t.value; });
          });
        } else if (activeTab === "plano") {
          pane.innerHTML = `<textarea data-k="textoPlano" rows="14" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:10px;font-size:13px;font-family:inherit;resize:vertical">${esc(s.textoPlano || buildText(s))}</textarea>`;
          pane.querySelector("textarea").addEventListener("input", (e) => { s.textoPlano = e.target.value; });
        } else {
          pane.innerHTML = `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;color:#334155;margin:0">${esc(state.transcript)}</pre>`;
        }
      };
      paintPane();
      body.querySelectorAll("[data-tab]").forEach((b) =>
        b.addEventListener("click", () => renderPreview(b.dataset.tab)),
      );

      body.querySelector("#ar-vc-redo").addEventListener("click", () => {
        state.struct = null; state.transcript = ""; state.phase = "consent"; render();
      });
      body.querySelector("#ar-vc-copy").addEventListener("click", () => {
        const txt = activeTab === "estruct" ? buildText(s) : (activeTab === "plano" ? (s.textoPlano || buildText(s)) : state.transcript);
        navigator.clipboard?.writeText(txt).then(() => toast?.("✓ Copiado"), () => toast?.("✗ No se pudo copiar"));
      });
      body.querySelector("#ar-vc-insert").addEventListener("click", () => {
        const txt = activeTab === "plano" ? (s.textoPlano || buildText(s)) :
                    activeTab === "raw" ? state.transcript : buildText(s);
        const current = (targetEl.value || "").trim();
        const next = current ? `${current}\n\n${txt}` : txt;
        setReactValue(targetEl, next);
        toast?.("✓ Anamnesis insertada");
        close();
      });
    }

    function renderError() {
      body.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:16px">
          <div style="font-weight:600;margin-bottom:6px">⚠ No se pudo completar</div>
          <div style="font-size:13px">${esc(state.error || "Error desconocido")}</div>
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
            <button id="ar-vc-back" style="background:#fff;border:1px solid #fecaca;color:#991b1b;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px">Reintentar</button>
            <button id="ar-vc-close2" style="background:#dc2626;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px">Cerrar</button>
          </div>
        </div>`;
      body.querySelector("#ar-vc-back").addEventListener("click", () => { state.phase = "consent"; render(); });
      body.querySelector("#ar-vc-close2").addEventListener("click", close);
    }

    render();
  }

  window.__AR_VOICE_UI = { openFor };
})();
