/* Vínculo — Extractor y normalizador de diagnóstico principal.
 *
 * Lee múltiples zonas visibles de Rayen (campos con label "Diagnóstico",
 * "Problema de salud", "Motivo de consulta", listas de problemas activos,
 * tags/badges con códigos CIE-10) y devuelve candidatos rankeados.
 *
 * Cada candidato:
 *   { texto, abrev, cie10, conf: 0..1, fuente: string, ambiguo?: boolean }
 *
 * API:
 *   window.__AR_DX_EXTRACT = {
 *     extract() -> { principal: candidato|null, candidatos: [...], ambiguos: [...] }
 *     normalize(textoLibre) -> { texto, abrev, cie10, conf }
 *     listAbbrev() -> [{abrev, label, cie10}]
 *   }
 */
(function () {
  if (window.__AR_DX_EXTRACT) return;

  const log = window.__AR_LOG?.module ? window.__AR_LOG.module("dx-extract") : { debug() {}, info() {}, warn() {} };

  const norm = (s) => String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const CIE10_RE = /\b([A-TV-Z]\d{2}(?:\.\d{1,2})?)\b/;

  // ============================================================
  // Diccionario de abreviaciones / dx frecuentes en APS
  // ============================================================
  // Cada entrada: matchers (regex que aplican sobre texto normalizado),
  // canon (texto canónico clínico), abrev (forma abreviada APS), cie10.
  // Orden importa: la primera coincidencia gana (poner más específicos arriba).
  const DICT = [
    // --- Cardiovasculares ---
    { abrev: "HTA", canon: "Hipertensión arterial esencial", cie10: "I10",
      matchers: [/\bhta\b/, /hipertensi[oó]n arterial(?! secundaria)/, /\bhipertenso\b/] },
    { abrev: "HTA-2°", canon: "Hipertensión arterial secundaria", cie10: "I15.9",
      matchers: [/hipertensi[oó]n.*secundaria/] },
    { abrev: "ICC", canon: "Insuficiencia cardíaca congestiva", cie10: "I50.9",
      matchers: [/\bicc\b/, /insuficiencia cardiaca/, /falla cardiaca/] },
    { abrev: "FA", canon: "Fibrilación auricular", cie10: "I48.9",
      matchers: [/\bfa\b(?!.*familiar)/, /fibrilaci[oó]n auricular/] },
    { abrev: "Cardiopatía isquémica", canon: "Cardiopatía isquémica crónica", cie10: "I25.9",
      matchers: [/cardiopatia isquemica/, /\bcic\b/, /enfermedad coronaria/] },
    { abrev: "ACV", canon: "Accidente cerebrovascular", cie10: "I64",
      matchers: [/\bacv\b/, /accidente cerebrovascular/, /ictus/] },

    // --- Metabólicos ---
    { abrev: "DM2", canon: "Diabetes mellitus tipo 2", cie10: "E11.9",
      matchers: [/\bdm\s*2\b/, /\bdm2\b/, /diabetes mellitus tipo 2/, /diabetes tipo 2/, /\bdm\s*ii\b/] },
    { abrev: "DM1", canon: "Diabetes mellitus tipo 1", cie10: "E10.9",
      matchers: [/\bdm\s*1\b/, /\bdm1\b/, /diabetes mellitus tipo 1/, /diabetes tipo 1/, /\bdm\s*i\b/] },
    { abrev: "DM-G", canon: "Diabetes gestacional", cie10: "O24.4",
      matchers: [/diabetes gestacional/, /\bdmg\b/] },
    { abrev: "DM", canon: "Diabetes mellitus no especificada", cie10: "E14.9",
      matchers: [/\bdiabetes\b(?!\s*(insipida|gestacional))/] },
    { abrev: "DLP", canon: "Dislipidemia", cie10: "E78.5",
      matchers: [/\bdlp\b/, /dislipidemia/, /dislipemia/, /hipercolesterolemia/] },
    { abrev: "Obesidad", canon: "Obesidad", cie10: "E66.9",
      matchers: [/\bobesidad\b/, /\bobeso\b/, /\bobesa\b/] },
    { abrev: "SM", canon: "Síndrome metabólico", cie10: "E88.81",
      matchers: [/sindrome metabolico/, /\bsm\b(?=.*metab)/] },
    { abrev: "Hipotiroidismo", canon: "Hipotiroidismo", cie10: "E03.9",
      matchers: [/hipotiroidismo/, /\bhipoT4\b/i] },
    { abrev: "Hipertiroidismo", canon: "Hipertiroidismo", cie10: "E05.9",
      matchers: [/hipertiroidismo/] },

    // --- Renal ---
    { abrev: "ERC", canon: "Enfermedad renal crónica", cie10: "N18.9",
      matchers: [/\berc\b/, /enfermedad renal cronica/, /insuficiencia renal cronica/, /\birc\b/] },
    { abrev: "ITU", canon: "Infección del tracto urinario", cie10: "N39.0",
      matchers: [/\bitu\b/, /infecci[oó]n urinaria/, /infecci[oó]n del tracto urinario/, /cistitis/] },
    { abrev: "PNA", canon: "Pielonefritis aguda", cie10: "N10",
      matchers: [/\bpna\b/, /pielonefritis/] },

    // --- Respiratorios ---
    { abrev: "EPOC", canon: "Enfermedad pulmonar obstructiva crónica", cie10: "J44.9",
      matchers: [/\bepoc\b/, /enfermedad pulmonar obstructiva/] },
    { abrev: "Asma", canon: "Asma bronquial", cie10: "J45.9",
      matchers: [/\basma\b/] },
    { abrev: "NAC", canon: "Neumonía adquirida en la comunidad", cie10: "J18.9",
      matchers: [/\bnac\b/, /neumonia adquirida en la comunidad/, /\bneumonia\b/] },
    { abrev: "IRA", canon: "Infección respiratoria aguda", cie10: "J06.9",
      matchers: [/\bira\b(?!.*intercrisis)/, /infecci[oó]n respiratoria aguda/, /resfrio comun/, /resfriado/] },
    { abrev: "SBOR", canon: "Síndrome bronquial obstructivo recurrente", cie10: "J45.9",
      matchers: [/\bsbor\b/, /sindrome bronquial obstructivo/] },
    { abrev: "Faringitis", canon: "Faringitis aguda", cie10: "J02.9",
      matchers: [/faringitis/, /faringoamigdalitis/, /amigdalitis/] },
    { abrev: "OMA", canon: "Otitis media aguda", cie10: "H66.9",
      matchers: [/\boma\b/, /otitis media aguda/, /\botitis\b/] },

    // --- Salud mental ---
    { abrev: "TDM", canon: "Trastorno depresivo mayor", cie10: "F33.9",
      matchers: [/\btdm\b/, /depresi[oó]n mayor/, /trastorno depresivo/, /episodio depresivo/] },
    { abrev: "Depresión", canon: "Depresión", cie10: "F32.9",
      matchers: [/\bdepresi[oó]n\b/] },
    { abrev: "TAG", canon: "Trastorno de ansiedad generalizada", cie10: "F41.1",
      matchers: [/\btag\b/, /ansiedad generalizada/] },
    { abrev: "Ansiedad", canon: "Trastorno de ansiedad", cie10: "F41.9",
      matchers: [/\bansiedad\b/, /trastorno ansioso/] },
    { abrev: "TDAH", canon: "Trastorno por déficit de atención e hiperactividad", cie10: "F90.9",
      matchers: [/\btdah\b/, /deficit atencional/, /deficit de atencion/] },

    // --- Reumatológicos / dolor ---
    { abrev: "Artrosis", canon: "Artrosis", cie10: "M19.9",
      matchers: [/\bartrosis\b/, /\boa\b/, /osteoartritis/, /gonartrosis/, /coxartrosis/] },
    { abrev: "AR", canon: "Artritis reumatoide", cie10: "M06.9",
      matchers: [/\bar\b(?=.*reum)/, /artritis reumatoide/] },
    { abrev: "Lumbago", canon: "Lumbago no especificado", cie10: "M54.5",
      matchers: [/lumbago/, /lumbalgia/, /\bdolor lumbar\b/] },

    // --- GES / Otros frecuentes ---
    { abrev: "RGE", canon: "Reflujo gastroesofágico", cie10: "K21.9",
      matchers: [/\brge\b/, /reflujo gastroesofagico/, /\berge\b/] },
    { abrev: "Gastritis", canon: "Gastritis", cie10: "K29.7",
      matchers: [/gastritis/] },
    { abrev: "Constipación", canon: "Constipación", cie10: "K59.0",
      matchers: [/constipaci[oó]n/, /estre[ñn]imiento/] },

    // --- Embarazo / mujer ---
    { abrev: "Embarazo", canon: "Embarazo en curso", cie10: "Z34.9",
      matchers: [/\bembarazo\b/, /gestaci[oó]n/, /gestante/, /\bg\d+p\d+\b/] },
    { abrev: "Climaterio", canon: "Estado menopáusico y climatérico", cie10: "N95.1",
      matchers: [/climaterio/, /menopausia/] },

    // --- Pediatría ---
    { abrev: "DNT", canon: "Desnutrición", cie10: "E46",
      matchers: [/\bdnt\b/, /desnutrici[oó]n/, /\bbajo peso\b/] },
    { abrev: "Sobrepeso", canon: "Sobrepeso", cie10: "E66.3",
      matchers: [/\bsobrepeso\b/] },

    // --- Control de salud ---
    { abrev: "EMPA", canon: "Examen de medicina preventiva del adulto", cie10: "Z00.0",
      matchers: [/\bempa\b/, /examen de medicina preventiva/] },
    { abrev: "EMPAM", canon: "Examen de medicina preventiva del adulto mayor", cie10: "Z00.0",
      matchers: [/\bempam\b/] },
    { abrev: "Control sano", canon: "Control de salud niño sano", cie10: "Z00.1",
      matchers: [/control(?:\s+de)? sano/, /control nino sano/, /\bcsi\b/] },
    { abrev: "Control crónico", canon: "Control de enfermedad crónica", cie10: "Z71.9",
      matchers: [/control cronico/, /control cardiovascular/, /\bpscv\b/, /programa cardiovascular/] },
  ];

  // ============================================================
  // Lectura del DOM
  // ============================================================
  const LABEL_HINTS = [
    "diagnóstico", "diagnostico", "dx",
    "problema de salud", "problemas de salud",
    "motivo de consulta", "motivo consulta",
    "hipotesis diagnostica", "hipótesis diagnóstica",
    "impresion diagnostica", "impresión diagnóstica",
  ];

  function readDomCandidates() {
    const out = []; // {raw, fuente, weight}
    const seen = new Set();
    const push = (raw, fuente, weight) => {
      const t = String(raw || "").replace(/\s+/g, " ").trim();
      if (!t || t.length < 3 || t.length > 240) return;
      const key = norm(t) + "|" + fuente;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ raw: t, fuente, weight });
    };

    // 1) Inputs/selects/td/span con label que coincide
    const fields = document.querySelectorAll("input, select, textarea, td, span, .form-control, li, .badge, .tag, .chip");
    for (const el of fields) {
      // Saltar invisibles
      if (el.offsetParent === null && el.tagName !== "INPUT") continue;
      let label = "";
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) label = lab.textContent || "";
      }
      if (!label) {
        const parent = el.closest("label, .form-group, .row, tr, li, .field, .ar-field");
        if (parent) label = (parent.querySelector("label, .label, .field-label, th")?.textContent || parent.textContent || "").slice(0, 120);
      }
      if (!label) continue;
      const ln = norm(label);
      const hit = LABEL_HINTS.find((h) => ln.includes(norm(h)));
      if (!hit) continue;
      const v = (el.value || el.textContent || "").trim();
      if (!v) continue;
      // weight según especificidad del label
      const weight = /diagn[oó]stico/.test(ln) ? 1.0
                   : /problema de salud/.test(ln) ? 0.9
                   : /motivo/.test(ln) ? 0.7
                   : 0.6;
      push(v, `campo "${hit}"`, weight);
    }

    // 2) Listas de problemas activos (clases típicas de Rayen)
    const lists = document.querySelectorAll(
      "[class*='problema'], [class*='diagnostic'], [class*='dx-list'], [class*='hipotesis'], ul.problemas li, .problemas-activos li"
    );
    for (const el of lists) {
      const t = (el.textContent || "").trim();
      if (t) push(t, "lista de problemas", 0.85);
    }

    // 3) Cualquier elemento que contenga un código CIE-10 visible
    const all = document.querySelectorAll("span, td, li, div, p, .badge, .tag");
    for (const el of all) {
      const t = (el.textContent || "").trim();
      if (!t || t.length > 200) continue;
      const m = t.match(CIE10_RE);
      if (!m) continue;
      // Asegurar que el contexto huele a diagnóstico
      const around = norm((el.closest("tr, li, .row, .form-group")?.textContent || t));
      if (!LABEL_HINTS.some((h) => around.includes(norm(h))) && !/\bcie\b/.test(around)) continue;
      push(t, `código CIE-10 (${m[1]})`, 0.95);
    }

    return out;
  }

  // ============================================================
  // Normalización a abreviación / CIE-10
  // ============================================================
  function normalize(textoLibre) {
    const t = String(textoLibre || "");
    if (!t) return { texto: "", abrev: "", cie10: "", conf: 0 };
    const n = norm(t);
    // Si trae CIE-10 explícito, intentar emparejar dict por código
    const cieMatch = t.match(CIE10_RE);
    const cie = cieMatch ? cieMatch[1].toUpperCase() : "";
    if (cie) {
      const byCode = DICT.find((d) => d.cie10.toUpperCase() === cie);
      if (byCode) return { texto: byCode.canon, abrev: byCode.abrev, cie10: byCode.cie10, conf: 0.99 };
    }
    // Recorrer diccionario por matchers
    for (const d of DICT) {
      for (const re of d.matchers) {
        if (re.test(n)) {
          return { texto: d.canon, abrev: d.abrev, cie10: d.cie10, conf: cie ? 0.9 : 0.85 };
        }
      }
    }
    // Sin match: devolver texto limpio
    const clean = t.replace(/\s+/g, " ").trim().slice(0, 200);
    return { texto: clean, abrev: "", cie10: cie || "", conf: cie ? 0.7 : 0.5 };
  }

  // ============================================================
  // API principal
  // ============================================================
  function extract() {
    const raws = readDomCandidates();
    const candidatos = [];
    const seenKey = new Set();
    for (const r of raws) {
      const n = normalize(r.raw);
      const key = (n.cie10 || n.texto.toLowerCase()) + "|" + r.fuente;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      candidatos.push({
        texto: n.texto,
        abrev: n.abrev,
        cie10: n.cie10,
        conf: Math.min(0.99, n.conf * r.weight),
        fuente: r.fuente,
        raw: r.raw,
      });
    }
    // Ordenar por confianza desc
    candidatos.sort((a, b) => b.conf - a.conf);

    // Detectar ambigüedad: top-2 con confianza similar y dx distintos
    let ambiguos = [];
    if (candidatos.length >= 2) {
      const [a, b] = candidatos;
      const sameDx = (a.cie10 && a.cie10 === b.cie10) || norm(a.texto) === norm(b.texto);
      if (!sameDx && (a.conf - b.conf) < 0.15 && b.conf >= 0.55) {
        ambiguos = candidatos.filter((c) => (a.conf - c.conf) < 0.2).slice(0, 4);
      }
    }
    const principal = candidatos[0] || null;
    const result = { principal, candidatos, ambiguos };
    log.debug("extract()", result);
    return result;
  }

  function listAbbrev() {
    return DICT.map((d) => ({ abrev: d.abrev, label: d.canon, cie10: d.cie10 }));
  }

  window.__AR_DX_EXTRACT = { extract, normalize, listAbbrev };
})();
