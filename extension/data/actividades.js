/* Vínculo — Plantillas de actividades PSCV (MINSAL).
 *
 * Cada actividad se inserta en Rayen mediante el ciclo:
 *   click "Agregar!" → escribir en textarea#activity → click <li> de la lista →
 *   click "Agregar" (add-header-button).
 *
 * El campo `query` es el fragmento que se escribe en el autocomplete (3-5 letras
 * suficientemente discriminantes). El campo `match` es el texto que debe aparecer
 * en el <li> a seleccionar (case-insensitive, sin tildes).
 */
(function () {
  const T = {
    // ============== INGRESOS PSCV ==============
    "ingreso_g1": {
      id: "ingreso_g1",
      name: "Ingreso PSCV — Riesgo Leve (G1)",
      group: "Ingresos PSCV",
      hint: "ingreso pscv riesgo leve bajo g1",
      activities: [
        { query: "tabaquismo", match: "consejerias individuales tabaquismo" },
        { query: "actividad fisica", match: "consejerias individuales actividad fisica" },
        { query: "alimentacion", match: "consejerias individuales alimentacion saludable" },
        { query: "ingreso integral - riesgo leve", match: "ingreso integral riesgo leve g1" },
        { query: "plan de cuidado elaborado - riesgo leve", match: "plan de cuidado elaborado riesgo leve g1" },
      ],
    },
    "ingreso_g2": {
      id: "ingreso_g2",
      name: "Ingreso PSCV — Riesgo Moderado (G2)",
      group: "Ingresos PSCV",
      hint: "ingreso pscv riesgo moderado g2",
      activities: [
        { query: "tabaquismo", match: "consejerias individuales tabaquismo" },
        { query: "actividad fisica", match: "consejerias individuales actividad fisica" },
        { query: "alimentacion", match: "consejerias individuales alimentacion saludable" },
        { query: "ingreso integral - riesgo moderado", match: "ingreso integral riesgo moderado g2" },
        { query: "plan de cuidado elaborado - riesgo moderado", match: "plan de cuidado elaborado riesgo moderado g2" },
      ],
    },
    "ingreso_g3": {
      id: "ingreso_g3",
      name: "Ingreso PSCV — Riesgo Alto (G3)",
      group: "Ingresos PSCV",
      hint: "ingreso pscv riesgo alto g3",
      activities: [
        { query: "tabaquismo", match: "consejerias individuales tabaquismo" },
        { query: "actividad fisica", match: "consejerias individuales actividad fisica" },
        { query: "alimentacion", match: "consejerias individuales alimentacion saludable" },
        { query: "ingreso integral - riesgo alto", match: "ingreso integral riesgo alto g3" },
        { query: "plan de cuidado elaborado - riesgo alto", match: "plan de cuidado elaborado riesgo alto g3" },
      ],
    },

    // ============== CONTROLES PSCV ==============
    "control_g1": {
      id: "control_g1",
      name: "Control PSCV — Riesgo Leve (G1)",
      group: "Controles PSCV",
      hint: "control pscv riesgo leve bajo g1",
      activities: [
        { query: "tabaquismo", match: "consejerias individuales tabaquismo" },
        { query: "actividad fisica", match: "consejerias individuales actividad fisica" },
        { query: "alimentacion", match: "consejerias individuales alimentacion saludable" },
        { query: "control integral - riesgo leve", match: "control integral riesgo leve g1" },
        { query: "plan de cuidado actualizado - riesgo leve", match: "plan de cuidado actualizado riesgo leve g1" },
      ],
    },
    "control_g2": {
      id: "control_g2",
      name: "Control PSCV — Riesgo Moderado (G2)",
      group: "Controles PSCV",
      hint: "control pscv riesgo moderado g2",
      activities: [
        { query: "tabaquismo", match: "consejerias individuales tabaquismo" },
        { query: "actividad fisica", match: "consejerias individuales actividad fisica" },
        { query: "alimentacion", match: "consejerias individuales alimentacion saludable" },
        { query: "control integral - riesgo moderado", match: "control integral riesgo moderado g2" },
        { query: "plan de cuidado actualizado - riesgo moderado", match: "plan de cuidado actualizado riesgo moderado g2" },
      ],
    },
    "control_g3": {
      id: "control_g3",
      name: "Control PSCV — Riesgo Alto (G3)",
      group: "Controles PSCV",
      hint: "control pscv riesgo alto g3",
      activities: [
        { query: "tabaquismo", match: "consejerias individuales tabaquismo" },
        { query: "actividad fisica", match: "consejerias individuales actividad fisica" },
        { query: "alimentacion", match: "consejerias individuales alimentacion saludable" },
        { query: "control integral - riesgo alto", match: "control integral riesgo alto g3" },
        { query: "plan de cuidado actualizado - riesgo alto", match: "plan de cuidado actualizado riesgo alto g3" },
      ],
    },
  };

  // Normaliza: minúsculas, sin tildes, espacios colapsados.
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Parsea un texto libre (típicamente el motivo de consulta) y devuelve
  // { kind: 'ingreso'|'control'|null, grade: 'g1'|'g2'|'g3'|null, templateId, source }.
  // Reconoce variaciones: mayúsculas, "G 1", "g-2", "grupo 3", "riesgo alto/moderado/bajo",
  // "rcv alto", "ingreso pscv", "control cardiovascular", etc.
  function parseMotivo(rawText) {
    const t = norm(rawText);
    if (!t) return { kind: null, grade: null, templateId: null, source: "empty" };

    // Tipo: ingreso vs control. "ingreso" gana si ambos aparecen.
    const hasIngreso = /\bingres[oa]\b|\bingr\b/.test(t);
    const hasControl = /\bcontrol(?:es)?\b|\bctrl\b/.test(t);
    const kind = hasIngreso ? "ingreso" : (hasControl ? "control" : null);

    // Grado: G1/G2/G3 con tolerancia (g1, g 1, g-1, grupo 1) y nombre de riesgo.
    let grade = null;
    if (/\bg\s*[-_.]?\s*3\b|\bgrupo\s*3\b|riesgo\s*alto|rcv\s*alto/.test(t)) grade = "g3";
    else if (/\bg\s*[-_.]?\s*2\b|\bgrupo\s*2\b|riesgo\s*moderad[oa]|rcv\s*moderad[oa]/.test(t)) grade = "g2";
    else if (/\bg\s*[-_.]?\s*1\b|\bgrupo\s*1\b|riesgo\s*(?:bajo|leve)|rcv\s*(?:bajo|leve)/.test(t)) grade = "g1";

    const templateId = (kind && grade) ? `${kind}_${grade}` : null;
    return { kind, grade, templateId, source: "motivo" };
  }

  function readMotivoConsulta() {
    const ta = document.querySelector("textarea#motivoConsulta")
            || document.querySelector("#motivoConsulta")
            || document.querySelector('textarea[id*="motivo" i]');
    if (!ta) return "";
    return ta.value || ta.textContent || "";
  }

  // Sugerencia automática: PRIORIZA el motivo de consulta; si no hay match,
  // cae al banner/contexto general como fallback.
  function suggestFromContext() {
    const motivo = readMotivoConsulta();
    const fromMotivo = parseMotivo(motivo);
    if (fromMotivo.templateId) return fromMotivo.templateId;

    // Si el motivo ya define el tipo (ingreso/control) pero no el grado,
    // intentamos inferir el grado desde el resto de la página.
    const bodyTxt = norm((document.body.innerText || "").slice(0, 5000));
    let grade = null;
    if (/\bg\s*3\b|riesgo\s*alto/.test(bodyTxt)) grade = "g3";
    else if (/\bg\s*2\b|riesgo\s*moderad/.test(bodyTxt)) grade = "g2";
    else if (/\bg\s*1\b|riesgo\s*(?:bajo|leve)/.test(bodyTxt)) grade = "g1";

    if (fromMotivo.kind && grade) return `${fromMotivo.kind}_${grade}`;
    if (!fromMotivo.kind && grade) {
      // Fallback total al texto general.
      const hasIngreso = /\bingreso\b/.test(bodyTxt);
      const hasControl = /\bcontrol\b/.test(bodyTxt) && !hasIngreso;
      const kind = hasIngreso ? "ingreso" : (hasControl ? "control" : null);
      if (kind) return `${kind}_${grade}`;
    }
    return null;
  }

  // Observa el textarea#motivoConsulta y dispara un evento custom cada vez
  // que cambia la sugerencia, para que la UI (FAB / modal) la refleje en vivo.
  let _lastSuggestion = null;
  function watchMotivo() {
    const fire = () => {
      const sug = suggestFromContext();
      if (sug !== _lastSuggestion) {
        _lastSuggestion = sug;
        window.dispatchEvent(new CustomEvent("ar:activities-suggestion", { detail: { templateId: sug } }));
      }
    };
    // Polling ligero + listeners directos cuando el textarea aparece.
    let attached = null;
    setInterval(() => {
      const ta = document.querySelector("textarea#motivoConsulta");
      if (ta && attached !== ta) {
        attached = ta;
        ta.addEventListener("input", fire);
        ta.addEventListener("change", fire);
        ta.addEventListener("blur", fire);
      }
      fire();
    }, 1200);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchMotivo);
  } else {
    watchMotivo();
  }

  // Cache local de plantillas custom (carga async desde __AR_ACT_STORE).
  // list() siempre devuelve sync; refreshCustomCache() lo actualiza.
  let _customCache = [];
  async function refreshCustomCache() {
    try {
      if (window.__AR_ACT_STORE) {
        _customCache = await window.__AR_ACT_STORE.listCustom();
      }
    } catch (_) { _customCache = []; }
    return _customCache;
  }
  // Carga inicial (no bloqueante)
  setTimeout(refreshCustomCache, 200);

  function listAll() {
    const builtin = Object.values(T);
    return builtin.concat(_customCache.map((c) => ({ ...c, _custom: true })));
  }
  function getOne(id) {
    if (T[id]) return T[id];
    return _customCache.find((c) => c.id === id) || null;
  }

  window.__AR_ACTIVITIES = {
    list: listAll,
    get: getOne,
    suggest: suggestFromContext,
    parseMotivo,
    readMotivoConsulta,
    refreshCustom: refreshCustomCache,
  };
})();
