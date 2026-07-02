/* Vínculo — Banner de consentimiento profesional (Fase 3 / Ley 21.719)
 *
 * Privacy-by-default: hasta que el profesional acepte, las funciones que tocan
 * datos del paciente (logs persistentes, harvester, hash de paciente, IA)
 * permanecen inactivas. El estado se guarda en chrome.storage.local.ar_consent.
 *
 * API: window.__AR_CONSENT = {
 *   init(), isAccepted(), allows(feature),
 *   accept(features?), decline(), reset(),
 *   onChange(fn), getState(), ready: Promise
 * }
 */
(function () {
  if (window.__AR_CONSENT) return;

  const KEY = "ar_consent";
  const VERSION = 1;
  const DEFAULT_FEATURES = {
    logger: true,
    harvester: true,
    patientHash: true,
    evidencia: true,
    consultorIA: true,
  };

  let state = null;
  const listeners = [];

  function load() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([KEY], function (res) {
          state = (res && res[KEY]) || null;
          resolve(state);
        });
      } catch (_) { resolve(null); }
    });
  }

  function persist(next) {
    state = next;
    try { chrome.storage.local.set({ [KEY]: next }); } catch (_) {}
    listeners.forEach(function (fn) { try { fn(state); } catch (_) {} });
  }

  function isAccepted() {
    return !!(state && state.accepted && state.version === VERSION);
  }

  function allows(feature) {
    if (!isAccepted()) return false;
    const f = state.features || DEFAULT_FEATURES;
    return f[feature] !== false;
  }

  function accept(features) {
    persist({
      version: VERSION,
      accepted: true,
      declined: false,
      acceptedAt: new Date().toISOString(),
      features: Object.assign({}, DEFAULT_FEATURES, features || {}),
    });
    removeBanner();
  }

  function decline() {
    persist({
      version: VERSION,
      accepted: false,
      declined: true,
      declinedAt: new Date().toISOString(),
      features: {},
    });
    removeBanner();
  }

  function reset() {
    state = null;
    try { chrome.storage.local.remove(KEY); } catch (_) {}
    listeners.forEach(function (fn) { try { fn(null); } catch (_) {} });
  }

  function onChange(fn) { listeners.push(fn); }
  function getState() { return state; }

  // ----- Banner UI -----
  let bannerEl = null;
  function removeBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  function renderBanner() {
    if (bannerEl) return;
    if (typeof document === "undefined" || !document.body) return;
    const el = document.createElement("div");
    el.id = "ar-consent-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Consentimiento profesional Vínculo");
    el.style.cssText = [
      "position:fixed", "left:16px", "bottom:16px", "z-index:2147483647",
      "max-width:480px", "background:#0f172a", "color:#f8fafc",
      "border-radius:12px", "padding:16px 18px",
      "font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      "box-shadow:0 12px 40px rgba(0,0,0,.35)", "border:1px solid #334155",
    ].join(";");
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="font-size:18px">🔒</span>' +
        '<b style="font-size:14px">Vínculo — Consentimiento profesional</b>' +
      '</div>' +
      '<div style="color:#cbd5e1;font-size:12px;margin-bottom:10px">' +
        'Esta extensión procesa <b>localmente</b> datos clínicos del paciente para asistirle ' +
        '(extracción de exámenes, alertas GES, plantillas). En cumplimiento con la ' +
        '<b>Ley 21.719</b> y la <b>Ley 19.628</b> sobre protección de datos personales, ' +
        'requerimos su consentimiento informado para activar:' +
        '<ul style="margin:6px 0 0 16px;padding:0;color:#94a3b8;font-size:11.5px">' +
          '<li>Hash anónimo del paciente con sal local (SHA-256, no reversible)</li>' +
          '<li>Logs de error anonimizados (sin RUT, nombres ni direcciones)</li>' +
          '<li>Asistencia clínica con respaldo MINSAL/GES</li>' +
        '</ul>' +
        'Ningún dato sale de su equipo salvo cuando usted explícitamente consulta al Consultor IA.' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="ar-consent-decline" style="background:transparent;color:#cbd5e1;border:1px solid #475569;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer">Rechazar</button>' +
        '<button id="ar-consent-accept" style="background:linear-gradient(135deg,#0ea5a4,#0284c7);color:white;border:0;border-radius:6px;padding:6px 14px;font:inherit;font-weight:600;cursor:pointer">Aceptar y continuar</button>' +
      '</div>';
    document.body.appendChild(el);
    bannerEl = el;
    el.querySelector("#ar-consent-accept").addEventListener("click", function () { accept(); });
    el.querySelector("#ar-consent-decline").addEventListener("click", function () { decline(); });
  }

  async function init() {
    await load();
    const needsBanner = !state ||
      (!state.accepted && !state.declined) ||
      (state.accepted && state.version !== VERSION);
    if (!needsBanner) return;
    if (typeof document === "undefined") return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
    } else {
      renderBanner();
    }
  }

  // Reaccionar a cambios desde el popup (revisar consentimiento)
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes[KEY]) return;
      state = changes[KEY].newValue || null;
      listeners.forEach(function (fn) { try { fn(state); } catch (_) {} });
      if (!state) {
        // Reset → mostrar banner de nuevo
        renderBanner();
      } else {
        removeBanner();
      }
    });
  } catch (_) {}

  const ready = load().then(init);

  window.__AR_CONSENT = {
    init: init,
    isAccepted: isAccepted,
    allows: allows,
    accept: accept,
    decline: decline,
    reset: reset,
    onChange: onChange,
    getState: getState,
    VERSION: VERSION,
    DEFAULT_FEATURES: DEFAULT_FEATURES,
    ready: ready,
  };
})();
