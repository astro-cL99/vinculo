/* Vínculo — Versión combinada del ruleset clínico (Fase 3)
 *
 * Calcula un identificador estable de la versión de las reglas activas
 * (GES checks + evidencia.json + lab críticos), independiente de la versión
 * de la extensión. Permite trazar qué set de reglas evaluó una decisión
 * clínica — requisito para auditoría regulatoria.
 *
 * API: window.__AR_RULESET_VERSION.compute() → Promise<{
 *   composite: "rs_<8hex>",
 *   parts: { extension, gesChecks, evidencia, labCritical },
 *   computedAt: ISOString
 * }>
 */
(function () {
  if (window.__AR_RULESET_VERSION) return;

  function extVersion() {
    try { return chrome.runtime.getManifest().version; } catch (_) { return "?"; }
  }

  async function compute() {
    const parts = {
      extension: extVersion(),
      gesChecks: null,
      evidencia: null,
      labCritical: null,
    };

    try {
      if (window.__AR_GES_CHECKS && Array.isArray(window.__AR_GES_CHECKS.CHECKS)) {
        parts.gesChecks = {
          count: window.__AR_GES_CHECKS.CHECKS.length,
          ids: window.__AR_GES_CHECKS.CHECKS.map(function (c) { return c.id; }).sort(),
        };
      }
    } catch (_) {}

    try {
      if (window.__AR_EVIDENCIA && window.__AR_EVIDENCIA.ready) {
        await window.__AR_EVIDENCIA.ready;
        const m = window.__AR_EVIDENCIA.meta && window.__AR_EVIDENCIA.meta();
        if (m) {
          parts.evidencia = {
            version: m.version,
            ultimaActualizacion: m.ultimaActualizacion,
            fuentes: (m.fuentesPrincipales || m.fuentes || []).length || null,
          };
        }
      }
    } catch (_) {}

    try {
      if (window.__AR_LAB_CRITICAL && window.__AR_LAB_CRITICAL.getThresholds) {
        const t = window.__AR_LAB_CRITICAL.getThresholds();
        parts.labCritical = { count: Object.keys(t || {}).length };
      }
    } catch (_) {}

    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(parts)));
    const arr = new Uint8Array(buf);
    let hex = "";
    for (let i = 0; i < 8; i++) hex += arr[i].toString(16).padStart(2, "0");

    return {
      composite: "rs_" + hex,
      parts: parts,
      computedAt: new Date().toISOString(),
    };
  }

  window.__AR_RULESET_VERSION = { compute: compute };
})();
