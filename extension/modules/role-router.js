/* Role router — filtra los botones de la FAB según el rol activo.
 *
 * Resolución de rol (en orden):
 *   1) Override por paciente (mapa { rut → role } en chrome.storage.local)
 *   2) Rol global del usuario (chrome.storage.sync.ar_role / localStorage)
 *   3) "medico" por defecto
 *
 * API: window.__AR_ROLE_ROUTER = {
 *   getRole(), getGlobalRole(), getCurrentRut(),
 *   setGlobalRole(roleId), setPatientRole(rut, roleId | null),
 *   getPatientRole(rut), applyToFab(), refresh(),
 * }
 *
 * Evento: window dispatches `CustomEvent("ar:role-changed", { detail: { role } })`
 * cada vez que el rol efectivo cambia (cambio global, override paciente, o cambio de paciente).
 */
(function () {
  if (window.__AR_ROLE_ROUTER) return;

  const KEY = "ar_role_v1";
  const PMAP_KEY = "ar_role_by_patient_v1"; // { [rut]: role }
  const DEFAULT_ROLE = "medico";

  // Cache local del mapa por-paciente para resolución sincrónica.
  let patientMap = {};
  try { patientMap = JSON.parse(localStorage.getItem(PMAP_KEY) || "{}") || {}; } catch {}

  function persistPatientMap() {
    try { localStorage.setItem(PMAP_KEY, JSON.stringify(patientMap)); } catch {}
    try { chrome?.storage?.local?.set?.({ [PMAP_KEY]: patientMap }); } catch {}
  }

  function getCurrentRut() {
    try {
      const p = window.__AR_PATIENT?.extract?.() || {};
      const rut = p.rut || p.run || null;
      return rut ? String(rut).replace(/\./g, "").trim().toLowerCase() : null;
    } catch { return null; }
  }

  function getGlobalRole() {
    try { return localStorage.getItem(KEY) || DEFAULT_ROLE; } catch { return DEFAULT_ROLE; }
  }

  function getPatientRole(rut) {
    if (!rut) return null;
    return patientMap[rut] || null;
  }

  function getRole() {
    const rut = getCurrentRut();
    return (rut && patientMap[rut]) || getGlobalRole();
  }

  let lastEffective = null;
  function emitIfChanged() {
    const cur = getRole();
    if (cur !== lastEffective) {
      lastEffective = cur;
      try { window.dispatchEvent(new CustomEvent("ar:role-changed", { detail: { role: cur } })); } catch {}
    }
  }

  function setGlobalRole(roleId) {
    try { localStorage.setItem(KEY, roleId); } catch {}
    try { chrome?.storage?.sync?.set?.({ ar_role: roleId }); } catch {}
    refresh();
  }

  function setPatientRole(rut, roleId) {
    if (!rut) return;
    if (roleId) patientMap[rut] = roleId;
    else delete patientMap[rut];
    persistPatientMap();
    refresh();
  }

  function applyToFab() {
    const role = getRole();
    const roles = window.__AR_ROLES || [];
    const conf = roles.find(r => r.id === role) || roles.find(r => r.id === DEFAULT_ROLE);
    if (!conf) return;
    const allowed = new Set(conf.modules);
    const fab = document.querySelector("#ar-fab-row");
    if (!fab) return;
    fab.querySelectorAll("button[id^='ar-fab']").forEach(btn => {
      const id = btn.id.replace(/^ar-fab-?/, "") || "plantillas";
      btn.style.display = allowed.has(id) ? "" : "none";
    });
  }

  function refresh() {
    applyToFab();
    emitIfChanged();
  }

  // Sincroniza desde chrome.storage al cargar
  try {
    chrome?.storage?.sync?.get?.(["ar_role"], (res) => {
      if (res && res.ar_role) {
        try { localStorage.setItem(KEY, res.ar_role); } catch {}
        refresh();
      }
    });
    chrome?.storage?.local?.get?.([PMAP_KEY], (res) => {
      if (res && res[PMAP_KEY] && typeof res[PMAP_KEY] === "object") {
        patientMap = res[PMAP_KEY];
        try { localStorage.setItem(PMAP_KEY, JSON.stringify(patientMap)); } catch {}
        refresh();
      }
    });
  } catch {}

  // Reaplica si cambia desde el popup u otra pestaña
  try {
    chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === "sync" && changes.ar_role) {
        try { localStorage.setItem(KEY, changes.ar_role.newValue); } catch {}
        refresh();
      }
      if (area === "local" && changes[PMAP_KEY]) {
        patientMap = changes[PMAP_KEY].newValue || {};
        try { localStorage.setItem(PMAP_KEY, JSON.stringify(patientMap)); } catch {}
        refresh();
      }
    });
  } catch {}

  // Mensajes desde el popup pidiendo info de rol/paciente.
  try {
    chrome?.runtime?.onMessage?.addListener?.((msg, _s, send) => {
      if (msg?.type === "AR_ROLE_INFO") {
        const rut = getCurrentRut();
        send({
          rut,
          patientName: (() => { try { return window.__AR_PATIENT?.extract?.()?.nombre || null; } catch { return null; } })(),
          globalRole: getGlobalRole(),
          patientRole: rut ? (patientMap[rut] || null) : null,
          effectiveRole: getRole(),
        });
        return true;
      }
      if (msg?.type === "AR_SET_PATIENT_ROLE") {
        setPatientRole(msg.rut, msg.role || null);
        send({ ok: true });
        return true;
      }
    });
  } catch {}

  // Detecta cambio de paciente en SPA (cambia URL / DOM clave) y re-emite.
  try {
    let lastRut = getCurrentRut();
    setInterval(() => {
      const r = getCurrentRut();
      if (r !== lastRut) {
        const prev = lastRut;
        lastRut = r;
        try {
          window.dispatchEvent(new CustomEvent("ar:patient-changed", {
            detail: { rut: r, previousRut: prev },
          }));
        } catch {}
        refresh();
      }
    }, 1500);
  } catch {}

  lastEffective = getRole();
  window.__AR_ROLE_ROUTER = {
    getRole, getGlobalRole, getCurrentRut,
    setGlobalRole, setPatientRole, getPatientRole,
    applyToFab, refresh,
  };
})();
