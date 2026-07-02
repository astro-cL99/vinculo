/* Vínculo — Riesgo en embarazo (clasificación FDA A/B/C/D/X).
 *
 * Fuente: 8° Guía Clínica "Medicamentos en el Embarazo".
 * Servicio de Salud Araucanía Sur — Loreto Rivera González, Q.F.
 *
 * window.__AR_EMBARAZO = {
 *   ready: Promise<void>,
 *   ALL,                         // catálogo crudo
 *   CATEGORIAS,                  // metadata color + label por categoría
 *   lookup(name) -> Entry | null,
 *   severity(category) -> "alta"|"media"|"info",
 *   formatWarning(entry, drugName) -> string,
 * }
 */
(function () {
  if (window.__AR_EMBARAZO) return;

  let DATA = { farmacos: [], categorias: {}, notas: {} };
  let byNorm = new Map();

  const ready = (async () => {
    try {
      const url = chrome.runtime.getURL("data/embarazo.json");
      const r = await fetch(url);
      DATA = await r.json();
    } catch (e) {
      console.warn("[AR][embarazo] no pude cargar embarazo.json", e);
      return;
    }
    for (const f of DATA.farmacos || []) {
      byNorm.set(norm(f.name), f);
    }
  })();

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function lookup(name) {
    const n = norm(name);
    if (!n) return null;
    // 1) match exacto
    if (byNorm.has(n)) return enrich(byNorm.get(n));
    // 2) match por inclusión de la primera palabra del fármaco
    const first = n.split(" ")[0];
    if (first && first.length >= 4) {
      for (const [k, v] of byNorm) {
        if (k.startsWith(first)) return enrich(v);
      }
    }
    // 3) match si el nombre buscado contiene cualquier fármaco
    for (const [k, v] of byNorm) {
      if (k.length >= 5 && n.includes(k)) return enrich(v);
    }
    return null;
  }

  function enrich(f) {
    const cat = f.category;
    const meta = DATA.categorias?.[cat] || {};
    return {
      ...f,
      label: meta.label || `Categoría ${cat}`,
      color: meta.color || "#94a3b8",
      severity: severity(cat),
    };
  }

  function severity(cat) {
    if (cat === "X" || cat === "D") return "alta";
    if (cat === "C") return "media";
    return "info";
  }

  function formatWarning(entry, drugName) {
    if (!entry) return "";
    const name = drugName || entry.name;
    const parts = [`${name} — Embarazo categoría ${entry.category}`];
    if (entry.thirdTrimester) parts.push(`(3° trim.: ${entry.thirdTrimester})`);
    if (entry.altCategory) parts.push(`(alt.: ${entry.altCategory})`);
    let text = parts.join(" ");
    if (entry.note) text += `. ${entry.note}`;
    return text;
  }

  window.__AR_EMBARAZO = {
    ready,
    get ALL() { return DATA.farmacos || []; },
    get CATEGORIAS() { return DATA.categorias || {}; },
    get SOURCE() { return DATA.source || ""; },
    lookup,
    severity,
    formatWarning,
  };
})();
