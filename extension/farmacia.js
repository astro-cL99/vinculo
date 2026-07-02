/* Vínculo — Reglas de prescripción de la Farmacia CESFAM.
 *
 * Carga extension/data/farmacia.json (Resumen Inducción Farmacia + Consenso PROA)
 * y expone:
 *
 *   window.__AR_FARMACIA = {
 *     ready: Promise<void>,
 *     RULES,                           // catálogo crudo
 *     scanRecipe(text|domNode) -> Reminder[]   // detecta fármacos en el plan/receta
 *     getAntibioticGuide(query) -> AntibioticEntry[]
 *     allRules() -> Reminder[]         // explorador completo
 *   }
 */
(function () {
  if (window.__AR_FARMACIA) return;

  let RULES = null;

  const ready = (async () => {
    try {
      const r = await fetch(chrome.runtime.getURL("data/farmacia.json"));
      RULES = await r.json();
    } catch (e) {
      console.warn("[AR][farmacia] no pude cargar farmacia.json", e);
      RULES = { despacho: [], psicotropicos: [], restricciones: [], antibioticos: [] };
    }
  })();

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Convierte una regla en Reminder uniforme
  function toReminder(rule, group) {
    return {
      id: rule.id,
      group,
      title: rule.title,
      severity: rule.severity || "info",
      advice: rule.advice,
      templates: rule.templates || [],
      match: rule.match || [],
    };
  }

  function allRules() {
    if (!RULES) return [];
    return [
      ...(RULES.despacho || []).map((r) => toReminder(r, "Despacho")),
      ...(RULES.psicotropicos || []).map((r) => toReminder(r, "Psicotrópicos")),
      ...(RULES.restricciones || []).map((r) => toReminder(r, "Restricciones")),
    ];
  }

  // Escanea texto buscando match de fármacos y devuelve recordatorios atingentes.
  function scanRecipe(input) {
    if (!RULES) return [];
    let text = "";
    if (typeof input === "string") text = input;
    else if (input && input.innerText) text = input.innerText;
    else if (input && input.textContent) text = input.textContent;
    const ntxt = " " + norm(text) + " ";
    const groups = [
      ["Despacho", RULES.despacho],
      ["Psicotrópicos", RULES.psicotropicos],
      ["Restricciones", RULES.restricciones],
    ];
    const out = [];
    const seen = new Set();
    for (const [g, list] of groups) {
      for (const rule of list || []) {
        if (!rule.match?.length) continue;
        const hit = rule.match.find((m) => ntxt.includes(" " + norm(m)) || ntxt.includes(norm(m)));
        if (hit && !seen.has(rule.id)) {
          seen.add(rule.id);
          out.push({ ...toReminder(rule, g), matched: hit });
        }
      }
    }
    // Embarazo: si hay módulo cargado, agregar recordatorios por categoría
    const E = window.__AR_EMBARAZO;
    if (E && E.ALL && E.ALL.length) {
      const pregSeen = new Set();
      for (const f of E.ALL) {
        if (!f.name) continue;
        const key = norm(f.name);
        if (key.length < 4 || pregSeen.has(key)) continue;
        if (ntxt.includes(" " + key) || ntxt.includes(key)) {
          pregSeen.add(key);
          const cat = f.category;
          if (!["C", "D", "X"].includes(cat)) continue;
          const sev = (cat === "D" || cat === "X") ? "alta" : "media";
          const meta = E.CATEGORIAS?.[cat] || {};
          out.push({
            id: `emb-${key}`,
            group: "Embarazo",
            title: `${f.name} — Embarazo categoría ${cat}`,
            severity: sev,
            advice: `${meta.label || ""}${f.note ? `. ${f.note}` : ""}${f.thirdTrimester ? ` (3° trim.: ${f.thirdTrimester}).` : ""}`.trim(),
            templates: [`⚠ Embarazo cat. ${cat}: ${f.name}${f.note ? ` — ${f.note}` : ""}`],
            match: [f.name],
            matched: f.name,
          });
        }
      }
    }
    // Severidad descendente
    const order = { alta: 0, media: 1, info: 2 };
    out.sort((a, b) => (order[a.severity] - order[b.severity]));
    return out;
  }

  // Busca consensos antibióticos por término (diagnóstico/CIE10/sinónimo)
  function getAntibioticGuide(query) {
    if (!RULES) return [];
    const q = norm(query || "");
    const list = RULES.antibioticos || [];
    if (!q) return list;
    return list.filter((a) => {
      if (norm(a.diagnosis).includes(q)) return true;
      if ((a.icd || []).some((c) => norm(c).includes(q))) return true;
      return false;
    });
  }

  window.__AR_FARMACIA = {
    ready,
    get RULES() { return RULES; },
    scanRecipe,
    getAntibioticGuide,
    allRules,
  };
})();
