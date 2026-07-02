/* Vínculo — Capa de overrides locales (modo CESFAM offline)
 *
 * Permite que cada CESFAM mantenga sus propios datos clínicos (tabla renal,
 * sick-day rules, flujogramas) actualizados sin reinstalar la extensión.
 *
 * Estrategia:
 *  - clinical-data.js define window.__AR_CLINICAL = { renal, sickday, flows, version }
 *    como datos "fábrica" embebidos en el ZIP.
 *  - Este módulo lee chrome.storage.local["clinical_overrides"] y, para cada
 *    sección presente, REEMPLAZA por completo el array correspondiente.
 *    (Reemplazo total = el CESFAM mantiene la lista que le sirve y elimina
 *    fármacos no usados sin tener que parchar registro a registro.)
 *  - Los consumidores (drug-watch, dx-suggest, clinical-ui, vfg) siguen
 *    leyendo window.__AR_CLINICAL.* sin cambios.
 *  - Expone window.__AR_DATA con get/set/reset/export/import síncrono y
 *    helpers para que popup y panel hagan UI de gestión.
 */
(function () {
  if (window.__AR_DATA) return;

  const STORE_KEY = "clinical_overrides";
  const SECTIONS = ["renal", "sickday", "flows"];

  const factory = {
    renal: (window.__AR_CLINICAL && window.__AR_CLINICAL.renal) || [],
    sickday: (window.__AR_CLINICAL && window.__AR_CLINICAL.sickday) || [],
    flows: (window.__AR_CLINICAL && window.__AR_CLINICAL.flows) || [],
    version: (window.__AR_CLINICAL && window.__AR_CLINICAL.version) || "embedded",
  };

  function safeArr(x) { return Array.isArray(x) ? x : null; }

  function applyOverrides(overrides) {
    if (!window.__AR_CLINICAL) window.__AR_CLINICAL = {};
    for (const k of SECTIONS) {
      const ov = overrides && safeArr(overrides[k]);
      window.__AR_CLINICAL[k] = ov && ov.length ? ov : factory[k];
    }
    window.__AR_CLINICAL.version = (overrides && overrides.version) || factory.version;
    window.__AR_CLINICAL.__overrides = overrides ? Object.fromEntries(
      SECTIONS.filter((k) => safeArr(overrides[k]) && overrides[k].length)
        .map((k) => [k, { count: overrides[k].length, updatedAt: overrides.updatedAt || null }]),
    ) : {};
    // Invalida índices internos de drug-watch (rebuild en el próximo uso)
    try { if (window.__AR_DRUG && window.__AR_DRUG._reset) window.__AR_DRUG._reset(); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent("ar-clinical-updated")); } catch (_) {}
  }

  async function loadFromStorage() {
    try {
      const data = await chrome.storage.local.get({ [STORE_KEY]: null });
      applyOverrides(data[STORE_KEY]);
      return data[STORE_KEY];
    } catch (e) {
      console.warn("[AR] data-overrides: no se pudo leer storage", e);
      applyOverrides(null);
      return null;
    }
  }

  async function getRaw() {
    const data = await chrome.storage.local.get({ [STORE_KEY]: null });
    return data[STORE_KEY] || {};
  }

  async function setSection(section, items, meta) {
    if (!SECTIONS.includes(section)) throw new Error("Sección inválida: " + section);
    if (!Array.isArray(items)) throw new Error("Se esperaba un array para " + section);
    const current = await getRaw();
    const next = { ...current, [section]: items, updatedAt: new Date().toISOString() };
    if (meta && meta.version) next.version = meta.version;
    if (meta && meta.label) next.label = meta.label;
    await chrome.storage.local.set({ [STORE_KEY]: next });
    applyOverrides(next);
    return next;
  }

  async function resetSection(section) {
    const current = await getRaw();
    if (!current || !(section in current)) return current;
    delete current[section];
    current.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ [STORE_KEY]: current });
    applyOverrides(current);
    return current;
  }

  async function resetAll() {
    await chrome.storage.local.remove(STORE_KEY);
    applyOverrides(null);
  }

  /**
   * Importa un bundle JSON. Acepta dos formatos:
   *  A) { renal: [...], sickday: [...], flows: [...], version, label }
   *  B) Un único array — el caller debe indicar `section` para saber dónde
   *     guardarlo (renal | sickday | flows).
   */
  async function importBundle(json, hint) {
    let bundle = json;
    if (Array.isArray(json)) {
      if (!hint) throw new Error("Para importar un array suelto, indica la sección destino.");
      bundle = { [hint]: json };
    }
    if (!bundle || typeof bundle !== "object") throw new Error("JSON inválido.");
    const current = await getRaw();
    const next = { ...current };
    let touched = 0;
    for (const k of SECTIONS) {
      if (Array.isArray(bundle[k])) {
        next[k] = bundle[k];
        touched++;
      }
    }
    if (!touched) throw new Error("El JSON no contiene secciones reconocibles (renal/sickday/flows).");
    next.updatedAt = new Date().toISOString();
    if (bundle.version) next.version = bundle.version;
    if (bundle.label) next.label = bundle.label;
    await chrome.storage.local.set({ [STORE_KEY]: next });
    applyOverrides(next);
    return { saved: next, touched };
  }

  function exportBundle() {
    return {
      version: (window.__AR_CLINICAL && window.__AR_CLINICAL.version) || factory.version,
      exportedAt: new Date().toISOString(),
      renal: (window.__AR_CLINICAL && window.__AR_CLINICAL.renal) || [],
      sickday: (window.__AR_CLINICAL && window.__AR_CLINICAL.sickday) || [],
      flows: (window.__AR_CLINICAL && window.__AR_CLINICAL.flows) || [],
    };
  }

  function status() {
    const c = window.__AR_CLINICAL || {};
    return {
      version: c.version || factory.version,
      counts: {
        renal: (c.renal || []).length,
        sickday: (c.sickday || []).length,
        flows: (c.flows || []).length,
      },
      factoryCounts: {
        renal: factory.renal.length,
        sickday: factory.sickday.length,
        flows: factory.flows.length,
      },
      overrides: c.__overrides || {},
    };
  }

  // Reaccionar a cambios desde otras pestañas/popup
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORE_KEY]) {
        applyOverrides(changes[STORE_KEY].newValue || null);
      }
    });
  } catch (_) {}

  window.__AR_DATA = {
    SECTIONS,
    loadFromStorage,
    getRaw,
    setSection,
    resetSection,
    resetAll,
    importBundle,
    exportBundle,
    status,
    factory,
  };

  // Carga inicial síncrona-best-effort: dispara la lectura inmediatamente.
  loadFromStorage();
})();
