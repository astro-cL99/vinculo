/* Vínculo — Catálogo del arsenal CESFAM 2024.
 *
 * Carga extension/data/arsenal.json (180+ fármacos) y expone una API
 * para convertir entre dosis prescrita (mg / mcg / UI) y volumen real
 * según la presentación disponible en el CESFAM (jarabe, gotas,
 * suspensión, solución oral, supositorio, comprimido, cápsula, etc.).
 *
 * window.__AR_ARSENAL = {
 *   ready: Promise<void>,
 *   ALL: Drug[],
 *   search(q, opts?): Drug[],
 *   get(id): Drug | null,
 *   convert({ drugId | presentation, doseMg | doseMcg | doseUi })
 *     -> { ml?, drops?, units?, unit, label, formula }
 *   formulate(drug, presentation, dose) -> texto pegable
 * }
 *
 * NO reemplaza a peds-doser.js: este módulo solo hace conversiones
 * presentación ↔ concentración. La calculadora pediátrica usa esta
 * tabla cuando el fármaco no está hardcodeado.
 */
(function () {
  if (window.__AR_ARSENAL) return;

  const DROP_ML = 0.05; // 1 gota ≈ 0.05 mL (estándar pediátrico, 20 gtt/mL)

  let ALL = [];
  let byId = new Map();
  let byName = new Map();

  // Carga el JSON empaquetado en la extensión.
  const ready = (async () => {
    try {
      const url = chrome.runtime.getURL("data/arsenal.json");
      const r = await fetch(url);
      ALL = await r.json();
    } catch (e) {
      console.warn("[AR][arsenal] no pude cargar arsenal.json", e);
      ALL = [];
    }
    byId = new Map(ALL.map((d) => [d.id, d]));
    byName = new Map(ALL.map((d) => [norm(d.name), d]));
  })();

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function get(id) {
    return byId.get(id) || byName.get(norm(id)) || null;
  }

  // Búsqueda fuzzy por nombre / forma / grupo
  function search(q, { kinds = null, limit = 25 } = {}) {
    const nq = norm(q || "");
    if (!nq) return ALL.slice(0, limit);
    const scored = [];
    for (const d of ALL) {
      const nm = norm(d.name);
      let score = 0;
      if (nm === nq) score = 100;
      else if (nm.startsWith(nq)) score = 80;
      else if (nm.includes(nq)) score = 60;
      else if (nq.split(" ").every((w) => nm.includes(w))) score = 40;
      if (!score) continue;
      if (kinds && !d.presentations.some((p) => kinds.includes(p.kind))) continue;
      scored.push({ d, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) => x.d);
  }

  // -------- Conversión núcleo --------
  // Recibe una presentación y una dosis (mg | mcg | ui) y devuelve volumen / unidades.
  function convertPresentation(pres, dose) {
    if (!pres) return { error: "Selecciona una presentación." };
    const out = { presentation: pres.presentation, kind: pres.kind, formula: "" };

    // 1) líquidos (jarabe, gotas, suspensión, solución oral, inyectable)
    if (pres.mgPerMl != null) {
      const mg = dose.mg ?? (dose.mcg != null ? dose.mcg / 1000 : null);
      if (mg == null) return { error: "Indica la dosis en mg o mcg." };
      const ml = +(mg / pres.mgPerMl).toFixed(2);
      out.ml = ml;
      out.formula = `${mg} mg ÷ ${pres.mgPerMl} mg/mL = ${ml} mL`;
      // Para gotas: además convertir a gotas
      if (pres.kind === "gotas") {
        out.drops = Math.round(ml / DROP_ML);
        out.formula += ` ≈ ${out.drops} gotas (1 gota ≈ ${DROP_ML} mL)`;
      }
      out.label = `${ml} mL` + (out.drops ? ` (${out.drops} gotas)` : "") + ` de ${pres.presentation}`;
      return out;
    }

    if (pres.uiPerMl != null) {
      const ui = dose.ui;
      if (ui == null) return { error: "Indica la dosis en UI." };
      const ml = +(ui / pres.uiPerMl).toFixed(2);
      out.ml = ml;
      out.formula = `${ui} UI ÷ ${pres.uiPerMl} UI/mL = ${ml} mL`;
      out.label = `${ml} mL de ${pres.presentation}`;
      return out;
    }

    // 2) sólidos (comprimido, cápsula, supositorio)
    if (pres.mgPerUnit != null) {
      const mg = dose.mg ?? (dose.mcg != null ? dose.mcg / 1000 : null);
      if (mg == null) return { error: "Indica la dosis en mg." };
      const units = +(mg / pres.mgPerUnit).toFixed(2);
      out.units = units;
      out.unitName = pres.kind === "supositorio" ? "supositorio"
        : pres.kind === "capsula" ? "cápsula"
        : pres.kind === "comprimido" ? "comprimido"
        : "unidad";
      out.formula = `${mg} mg ÷ ${pres.mgPerUnit} mg = ${units} ${out.unitName}(s)`;
      out.label = `${units} ${out.unitName}${units === 1 ? "" : "s"} de ${pres.presentation}`;
      return out;
    }

    if (pres.mcgPerUnit != null) {
      const mcg = dose.mcg ?? (dose.mg != null ? dose.mg * 1000 : null);
      if (mcg == null) return { error: "Indica la dosis en mcg o mg." };
      const units = +(mcg / pres.mcgPerUnit).toFixed(2);
      out.units = units;
      out.unitName = "puff/inhalación";
      out.formula = `${mcg} mcg ÷ ${pres.mcgPerUnit} mcg = ${units}`;
      out.label = `${units} ${out.unitName}(s) de ${pres.presentation}`;
      return out;
    }

    return { error: "Esta presentación no tiene concentración numérica para convertir." };
  }

  // Conveniencia: { drugId, presentationIndex, doseMg, doseMcg, doseUi }
  function convert({ drugId, presentationIndex = 0, doseMg, doseMcg, doseUi, presentation }) {
    let pres = presentation;
    if (!pres && drugId) {
      const d = get(drugId);
      if (!d) return { error: "Fármaco no encontrado." };
      pres = d.presentations?.[presentationIndex] || d.presentations?.[0];
    }
    return convertPresentation(pres, { mg: doseMg, mcg: doseMcg, ui: doseUi });
  }

  // Riesgo en embarazo (cuando el módulo embarazo.js está cargado)
  function pregnancy(drugOrName) {
    const name = typeof drugOrName === "string" ? drugOrName : drugOrName?.name;
    if (!name || !window.__AR_EMBARAZO?.lookup) return null;
    return window.__AR_EMBARAZO.lookup(name);
  }

  // Texto pegable estilo receta
  function formulate(drug, presentation, dose, freqHours) {
    const r = convertPresentation(presentation, dose);
    if (r.error) return r.error;
    const freq = freqHours ? ` cada ${freqHours} h` : "";
    const doseStr = dose.mg != null ? `${dose.mg} mg`
      : dose.mcg != null ? `${dose.mcg} mcg`
      : dose.ui != null ? `${dose.ui} UI` : "";
    let line = `${drug.name} ${doseStr} (${r.label})${freq}.`;
    const preg = pregnancy(drug);
    if (preg && (preg.category === "D" || preg.category === "X")) {
      line = `⚠ Embarazo cat. ${preg.category}${preg.note ? ` — ${preg.note}` : ""}\n${line}`;
    }
    return line;
  }

  // Sugerencia inteligente: dado un fármaco, devuelve la presentación más
  // adecuada para una dosis dada (la que minimiza el volumen sin romper el ml mínimo).
  function bestPresentationFor(drug, dose) {
    if (!drug?.presentations?.length) return null;
    const candidates = drug.presentations
      .map((p) => ({ p, r: convertPresentation(p, dose) }))
      .filter((x) => !x.r.error);
    if (!candidates.length) return drug.presentations[0];
    // Para líquidos: preferir volumen entre 1-10 mL
    candidates.sort((a, b) => {
      const va = a.r.ml ?? 999;
      const vb = b.r.ml ?? 999;
      const sa = va < 0.5 ? 100 : va > 15 ? 50 : Math.abs(va - 5);
      const sb = vb < 0.5 ? 100 : vb > 15 ? 50 : Math.abs(vb - 5);
      return sa - sb;
    });
    return candidates[0].p;
  }

  window.__AR_ARSENAL = {
    ready,
    get ALL() { return ALL; },
    search,
    get,
    convert,
    convertPresentation,
    formulate,
    pregnancy,
    bestPresentationFor,
    DROP_ML,
  };
})();
