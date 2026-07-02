/* Vínculo — Cargador de evidencia clínica
 * Carga evidencia.json (mapeo regla → fuente MINSAL/GES) y expone API
 * para enriquecer las alertas y los chequeos GES con su respaldo normativo.
 */
(function () {
  if (window.__AR_EVIDENCIA) return;

  let DATA = null;
  let LOAD_ERR = null;

  const ready = (async () => {
    try {
      const url = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL("data/evidencia.json")
        : "data/evidencia.json";
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      DATA = await res.json();
    } catch (e) {
      LOAD_ERR = e;
      try { window.__AR_LOG && window.__AR_LOG.warn && window.__AR_LOG.warn("E_STORAGE", "evidencia.json no disponible: " + (e && e.message || e)); } catch (_) {}
    }
  })();

  function fuenteIndex() {
    if (!DATA) return new Map();
    if (DATA.__fuenteIndex) return DATA.__fuenteIndex;
    const map = new Map();
    for (const f of (DATA.fuentesPrincipales || [])) map.set(f.id, f);
    Object.defineProperty(DATA, "__fuenteIndex", { value: map, enumerable: false });
    return map;
  }

  function getLab(key) { return DATA && DATA.labCriticos ? (DATA.labCriticos[key] || null) : null; }
  function getGes(id) { return DATA && DATA.gesChecks ? (DATA.gesChecks[id] || null) : null; }
  function getFuente(id) { return fuenteIndex().get(id) || null; }
  function resolveFuentes(ids) {
    if (!Array.isArray(ids)) return [];
    return ids.map(getFuente).filter(Boolean);
  }
  function meta() {
    if (!DATA) return null;
    return {
      version: DATA.version,
      ultimaActualizacion: DATA.ultimaActualizacion,
      niveles: DATA.niveles,
      fuentesPrincipales: DATA.fuentesPrincipales,
      responsable: DATA.responsable,
    };
  }
  function renderBlock(item) {
    if (!item) return "";
    const fuentes = resolveFuentes(item.evidencia || []);
    const links = fuentes.map(function (f) {
      return '<a href="' + f.url + '" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:underline">' + f.id + '</a>';
    }).join(" · ");
    const nivel = item.nivel ? '<b>Nivel ' + item.nivel + '</b> · ' : '';
    return '<div style="font-size:11px;color:#475569;margin-top:4px;line-height:1.4">' +
      nivel + (item.rationale || '') +
      (links ? '<div style="margin-top:2px">📚 ' + links + '</div>' : '') +
      '</div>';
  }

  window.__AR_EVIDENCIA = {
    ready: ready,
    getLab: getLab,
    getGes: getGes,
    getFuente: getFuente,
    resolveFuentes: resolveFuentes,
    meta: meta,
    renderBlock: renderBlock,
    isLoaded: function () { return DATA != null; },
    loadError: function () { return LOAD_ERR; },
  };
})();
