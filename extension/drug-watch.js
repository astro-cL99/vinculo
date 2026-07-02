/* Vínculo — Detector de fármacos en el DOM y motor de alertas renales.
 * Lee window.__AR_CLINICAL.renal y .sickday para emparejar.
 * API:
 *   window.__AR_DRUG.scanDom() -> [{name, raw, matches:[{drug, bucket, advice, sickDay?}]}]
 *   window.__AR_DRUG.checkText(txt) -> matches para un texto único
 *   window.__AR_DRUG.bucketLabel(bucket)
 */
(function () {
  if (window.__AR_DRUG) return;

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Construye índice de tokens-fármaco a partir del dataset
  let INDEX = null;
  function buildIndex() {
    if (INDEX) return INDEX;
    INDEX = [];
    const renal = (window.__AR_CLINICAL && window.__AR_CLINICAL.renal) || [];
    const sick = (window.__AR_CLINICAL && window.__AR_CLINICAL.sickday) || [];
    for (const d of renal) {
      // El name puede contener comerciales o múltiples principios: "Tiazidas (HCTZ, Clortalidona)"
      const tokens = extractTokens(d.name);
      INDEX.push({ kind: "renal", entry: d, tokens });
    }
    for (const s of sick) {
      const tokens = extractTokens(s.drug);
      INDEX.push({ kind: "sickday", entry: s, tokens });
    }
    return INDEX;
  }
  function extractTokens(name) {
    if (!name) return [];
    const tokens = new Set();
    // separar por / , ( )
    const parts = name.split(/[\/(),]+/).map((x) => x.trim()).filter(Boolean);
    for (const p of parts) {
      const n = norm(p);
      if (n.length >= 4) tokens.add(n);
      // primer palabra (principio activo) — útil para "Enalapril 10mg"
      const first = n.split(" ")[0];
      if (first && first.length >= 4) tokens.add(first);
    }
    return [...tokens];
  }

  function bucketLabel(b) {
    return b === "ccr100_50" ? "VFG ≥50" : b === "ccr50_10" ? "VFG 10-49" : b === "ccr10" ? "VFG <10" : "—";
  }

  function checkText(rawText) {
    const idx = buildIndex();
    const txt = " " + norm(rawText) + " ";
    const out = [];
    const seen = new Set();
    for (const item of idx) {
      for (const t of item.tokens) {
        if (txt.includes(" " + t)) {
          const key = item.kind + "::" + (item.entry.name || item.entry.drug) + "::" + t;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ kind: item.kind, entry: item.entry, token: t });
          break;
        }
      }
    }
    return out;
  }

  // Escanea el DOM: busca recetas/prescripciones. Heurística amplia:
  // - Filas/celdas que contengan "mg", "mcg", "comprimido", "cápsula", o keywords
  // - Inputs/textareas de prescripción
  // - También recorre iframes mismo-origen (Rayen suele renderizar en iframes).
  // Memoizamos resultados ~1.2s para que clicks consecutivos sean instantáneos.
  let _scanCache = { at: 0, root: null, result: null };
  const SCAN_TTL = 1200;
  const RX_DRUG = /\b(\d+\s*(mg|mcg|ml|ui|g)\b|comprim|capsul|cada\s+\d+\s*h|v[ií]a\s+oral|\bsl\b|\bim\b|\bsc\b|\bvo\b)/i;
  const SEL_TEXT = "td, li, .row, .item-card, [class*='medicamento'], [class*='receta'], [class*='prescrip'], [class*='farmac'], [class*='medicac']";
  const SEL_EDIT = "input[type='text'], input:not([type]), textarea, [contenteditable='true']";

  function scanDom(root) {
    const r = root || document;
    const now = Date.now();
    if (_scanCache.result && _scanCache.root === r && (now - _scanCache.at) < SCAN_TTL) {
      return _scanCache.result;
    }
    // Pre-build index once (rápido tras la 1ª vez gracias al cache interno)
    buildIndex();

    const candidates = new Map(); // norm-text -> nodo

    function collectFrom(rt) {
      try {
        const editables = rt.querySelectorAll(SEL_EDIT);
        for (let i = 0; i < editables.length; i++) {
          const el = editables[i];
          const v = (el.value || el.textContent || "").trim();
          if (v.length >= 4 && v.length < 2000) candidates.set(v, el);
        }
        // textContent en vez de innerText: evita reflow forzado y es ~10-100x más rápido
        const nodes = rt.querySelectorAll(SEL_TEXT);
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          const v = (el.textContent || "").trim();
          if (v.length >= 4 && v.length < 600 && RX_DRUG.test(v)) candidates.set(v, el);
        }
        const frames = rt.querySelectorAll("iframe");
        for (let i = 0; i < frames.length; i++) {
          try {
            const doc = frames[i].contentDocument || frames[i].contentWindow?.document;
            if (doc) collectFrom(doc);
          } catch (_) { /* cross-origin */ }
        }
      } catch (_) { /* nodo inaccesible */ }
    }

    collectFrom(r);

    const matches = [];
    for (const [text, node] of candidates) {
      const m = checkText(text);
      if (m.length) matches.push({ text, node, hits: m });
    }
    _scanCache = { at: now, root: r, result: matches };
    return matches;
  }

  // Para una lista de hits, calcular advertencia según VFG
  function adviceFor(hits, vfg) {
    const out = [];
    for (const h of hits) {
      if (h.kind === "renal") {
        const e = h.entry;
        let adv = "";
        if (vfg == null) adv = `Posología base: ${e.normalDose}. Verificar VFG (CG/CKD-EPI).`;
        else if (vfg >= 50) adv = `${bucketLabel("ccr100_50")}: ${e.ccr100_50}`;
        else if (vfg >= 10) adv = `${bucketLabel("ccr50_10")}: ${e.ccr50_10}`;
        else adv = `${bucketLabel("ccr10")}: ${e.ccr10}. HD: ${e.hd}`;
        out.push({ kind: "renal", drug: e.name, category: e.category, advice: adv, fullEntry: e });
      } else if (h.kind === "sickday") {
        const e = h.entry;
        out.push({ kind: "sickday", drug: e.drug, category: e.category, advice: e.sickDayRule, alert: e.keyAlert, fullEntry: e });
      }
    }
    return out;
  }

  function _reset() { INDEX = null; _scanCache = { at: 0, root: null, result: null }; }
  window.__AR_DRUG = { scanDom, checkText, bucketLabel, adviceFor, buildIndex, _reset };
})();
