/* Vínculo — Lab Parser robusto
 * Parser por filas con contexto de unidad para reducir falsos positivos.
 *
 * Expone:
 *   window.__AR_LAB_PARSER.normalizeNumber(str) -> { value:number|null, qualifier:"lt"|"gt"|null, raw }
 *   window.__AR_LAB_PARSER.parseRow({ name, value, unit, range, date }, dict)
 *     -> { key, subtype?, value, unit, qualifier, fecha, flag } | null
 *   window.__AR_LAB_PARSER.detectFlag(el) -> "alto" | "bajo" | "anormal" | null
 *   window.__AR_LAB_PARSER.glicemiaSubtype(rawName) -> "ayunas"|"postcarga_2h"|"random"|"hgt"|"capilar"|null
 *   window.__AR_LAB_PARSER.getOverrides() / addOverride(rawName, key)
 */
(function () {
  if (window.__AR_LAB_PARSER) return;

  const OVERRIDE_KEY = "analyte_overrides";

  // ----------------- Normalización numérica chilena ------------------
  function normalizeNumber(input) {
    const out = { value: null, qualifier: null, raw: input };
    if (input == null) return out;
    let s = String(input).trim();
    if (!s) return out;
    // Detectar < ó > antes del número
    const ltGt = s.match(/^\s*(<|>|≤|≥|<=|>=)\s*/);
    if (ltGt) {
      const t = ltGt[1];
      out.qualifier = (t === "<" || t === "<=" || t === "≤") ? "lt" : "gt";
      s = s.slice(ltGt[0].length);
    }
    // Quitar separador de miles (punto antes de 3 dígitos seguido por coma o fin)
    // Ej: "1.234,5" -> "1234,5"; "1.234"  -> ambiguo, sólo si tiene > 3 dígitos.
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      s = s.replace(/\./g, "");
    }
    // Coma decimal -> punto
    s = s.replace(",", ".");
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return out;
    out.value = parseFloat(m[0]);
    return out;
  }

  // ----------------- Detección de flag visual ------------------
  function detectFlag(el) {
    if (!el) return null;
    const styleColor = (el.getAttribute("style") || "").toLowerCase();
    if (/color\s*:\s*red|color\s*:\s*#?(b|c|d|e|f)\d{0,5}\b/.test(styleColor) && /red|#f|#e|#d/.test(styleColor)) {
      return "anormal";
    }
    const cls = (el.className || "").toString().toLowerCase();
    if (/anormal|abnormal|out-?of-?range/.test(cls)) return "anormal";
    if (/\balto\b|high\b/.test(cls)) return "alto";
    if (/\bbajo\b|low\b/.test(cls)) return "bajo";
    // ¿Tiene un hijo con esas marcas?
    const inner = el.querySelector("[class*='anormal'],[class*='abnormal'],[style*='color:red'],[style*='color: red']");
    if (inner) return "anormal";
    return null;
  }

  // ----------------- Subtipos de glicemia ------------------
  function glicemiaSubtype(rawName) {
    const n = (rawName || "").toLowerCase();
    if (/hgt|capilar/.test(n)) return n.includes("hgt") ? "hgt" : "capilar";
    // Postcarga / 120 minutos / PTGO ANTES que ayunas (para no confundir
    // "Glicemia 120 minutos" con ayunas si la línea menciona "ayunas" en el panel).
    if (/post\s*carga|post\s*75|2\s*h\b|2h\b|120\s*min|ptgo|tolerancia|sobrecarga/.test(n)) return "postcarga_2h";
    if (/ayun|basal|fast/.test(n)) return "ayunas";
    if (/random|al\s+azar|aleatori/.test(n)) return "random";
    return null;
  }

  // ----------------- Plausibilidad de unidad por analito ------------------
  // Para aliases ≤2 letras, exigimos que la unidad encaje.
  const UNIT_HINTS = {
    sodio: /meq|mmol/i,
    potasio: /meq|mmol/i,
    cloro: /meq|mmol/i,
    calcio: /mg|mmol/i,
    magnesio: /mg|mmol|meq/i,
    fosforo: /mg|mmol/i,
    fierro: /µg|ug|mcg|µ?mol/i,
  };
  const SHORT_ALIASES = new Set(["na", "k", "cl", "p", "mg", "fe", "ca", "hb"]);

  // ----------------- Match con override + diccionario ------------------
  // dict: { keyCanonica: [aliases] }
  function normalizeName(raw) {
    if (!raw) return "";
    let s = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\(.*?\)/g, " ");
    s = s.replace(/\b([a-z])\.([a-z])\.(?:([a-z])\.?)?(?:([a-z])\.?)?/g, "$1$2$3$4");
    return s
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Devuelve {key, alias, ruleScore} ordenados de mejor a peor.
  function candidates(rawName, dict, unit) {
    const n = normalizeName(rawName);
    if (!n) return [];
    const out = [];
    for (const [key, aliases] of Object.entries(dict || {})) {
      for (const alias of aliases) {
        if (!alias) continue;
        const a = String(alias).toLowerCase();
        const isShort = a.length <= 2 || SHORT_ALIASES.has(a);
        const exact = n === a;
        const wordRe = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        const wordHit = wordRe.test(n);
        if (!exact && !wordHit && !n.includes(a)) continue;
        if (isShort) {
          // Sólo aceptar si la unidad coincide con lo plausible para el analito.
          const hint = UNIT_HINTS[key];
          if (hint && unit && !hint.test(unit)) continue;
          if (hint && !unit) continue; // sin unidad y alias corto -> no
          if (!wordHit && !exact) continue; // alias corto debe ser palabra completa
        }
        const score =
          (exact ? 100 : 0) +
          a.length * 2 +
          (wordHit ? 5 : 0);
        out.push({ key, alias: a, score });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // ----------------- API principal ------------------
  function parseRow(row, dict, overrides) {
    if (!row || !row.name) return null;
    const ovKey = (overrides || {})[normalizeName(row.name)];
    let key = ovKey || null;
    if (!key) {
      const cands = candidates(row.name, dict, row.unit);
      key = cands[0]?.key || null;
    }
    if (!key) return null;
    const numv = normalizeNumber(row.value);
    const subtype = key === "glicemia" ? glicemiaSubtype(row.name) : null;
    return {
      key,
      subtype,
      rawName: row.name,
      value: numv.value != null ? String(numv.value) : row.value,
      unit: row.unit || "",
      qualifier: numv.qualifier,
      fecha: row.date || "",
      range: row.range || "",
      flag: row.flag || null,
    };
  }

  // ----------------- Storage de overrides locales ------------------
  async function getOverrides() {
    try {
      const data = await chrome.storage.local.get({ [OVERRIDE_KEY]: {} });
      return data[OVERRIDE_KEY] || {};
    } catch { return {}; }
  }
  async function addOverride(rawName, key) {
    const ov = await getOverrides();
    ov[normalizeName(rawName)] = key;
    try { await chrome.storage.local.set({ [OVERRIDE_KEY]: ov }); } catch {}
    return ov;
  }
  async function removeOverride(rawName) {
    const ov = await getOverrides();
    delete ov[normalizeName(rawName)];
    try { await chrome.storage.local.set({ [OVERRIDE_KEY]: ov }); } catch {}
    return ov;
  }

  window.__AR_LAB_PARSER = {
    normalizeNumber,
    detectFlag,
    glicemiaSubtype,
    parseRow,
    candidates,
    normalizeName,
    getOverrides,
    addOverride,
    removeOverride,
  };
})();
