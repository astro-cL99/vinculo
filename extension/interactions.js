/* Vínculo — Motor de interacciones medicamentosas.
 *
 * Carga data/interactions.json y expone:
 *   window.__AR_INTERACTIONS = {
 *     ready: Promise<void>,
 *     scan(text) -> Alert[]
 *     scanCurrentChart() -> Alert[]   // lee textareas/plan de la ficha activa
 *   }
 *
 * Cada Alert: { id, title, severity, advice, drugsFound:[{bucket, drug}], refs }
 *
 * El motor usa "buckets" (grupos) en vez de matchear nombre exacto del fármaco
 * en cada regla — así una regla "AINE + IECA" se dispara con cualquier
 * combinación de los miembros del bucket.
 *
 * Match por substring normalizado (sin tildes), tolerante a presentaciones
 * tipo "Enalapril 10 mg c/12h".
 */
(function () {
  if (window.__AR_INTERACTIONS) return;

  const log = window.__AR_LOG?.module("interact") || { debug() {}, info() {}, warn() {} };

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  let DATA = null;

  const ready = (async () => {
    try {
      const r = await fetch(chrome.runtime.getURL("data/interactions.json"));
      DATA = await r.json();
      log.info("reglas cargadas:", DATA.rules?.length, "buckets:", Object.keys(DATA.drugBuckets || {}).length);
    } catch (e) {
      log.warn("no pude cargar interactions.json", e);
      DATA = { rules: [], drugBuckets: {} };
    }
  })();

  function detectDrugs(text) {
    // Devuelve mapa bucket -> array de fármacos detectados
    const out = {};
    if (!DATA) return out;
    const ntxt = " " + norm(text) + " ";
    for (const [bucket, drugs] of Object.entries(DATA.drugBuckets || {})) {
      for (const drug of drugs) {
        if (ntxt.includes(" " + norm(drug))) {
          if (!out[bucket]) out[bucket] = [];
          if (!out[bucket].includes(drug)) out[bucket].push(drug);
        }
      }
    }
    return out;
  }

  function evalRule(rule, detected) {
    // requires: lista de buckets que deben estar todos presentes
    if (rule.requires && rule.requires.length) {
      const drugsFound = [];
      for (const b of rule.requires) {
        if (!detected[b] || !detected[b].length) return null;
        drugsFound.push({ bucket: b, drug: detected[b][0] });
      }
      return drugsFound;
    }
    // requires_count: { any_of:[bucket1, bucket2, ...], min: N }
    if (rule.requires_count) {
      const present = (rule.requires_count.any_of || []).filter((b) => detected[b]?.length);
      // Para QT-largo: n>=2 fármacos prolongadores aunque sean del mismo bucket
      const total = present.reduce((acc, b) => acc + detected[b].length, 0);
      if (total >= (rule.requires_count.min || 2)) {
        const drugsFound = [];
        for (const b of present) for (const d of detected[b]) drugsFound.push({ bucket: b, drug: d });
        return drugsFound;
      }
      return null;
    }
    return null;
  }

  function scan(text) {
    if (!DATA) return [];
    const detected = detectDrugs(text);
    const alerts = [];
    for (const rule of DATA.rules || []) {
      const drugsFound = evalRule(rule, detected);
      if (drugsFound) {
        alerts.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity || "info",
          advice: rule.advice,
          refs: rule.refs,
          drugsFound,
        });
      }
    }
    const order = { alta: 0, media: 1, info: 2 };
    alerts.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
    log.debug("scan: detectados", Object.keys(detected), "alertas", alerts.length);
    return alerts;
  }

  function scanCurrentChart() {
    const blocks = [];
    document.querySelectorAll("textarea, [class*='plan'], [class*='receta'], [class*='prescrip'], [class*='indicac'], [class*='medicamento']").forEach((n) => {
      const t = n.value || n.innerText || "";
      if (t && t.length < 8000) blocks.push(t);
    });
    if (!blocks.length) blocks.push((document.body?.innerText || "").slice(0, 12000));
    return scan(blocks.join("\n\n"));
  }

  window.__AR_INTERACTIONS = {
    ready,
    scan,
    scanCurrentChart,
    get DATA() { return DATA; },
  };
})();
