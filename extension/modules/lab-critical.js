/* Vínculo — alertas clínicas críticas de laboratorio
 *
 * Umbrales que requieren acción/derivación inmediata o pronta.
 * No son rangos de normalidad — son cortes accionables.
 *
 * API: window.__AR_LAB_CRITICAL = { RULES, evaluate, collect }
 *   evaluate(key, rawValue) → { severity, reason, value } | null
 *   collect(lab, labDisplay)  → array ordenada (críticos primero)
 *
 * Depende de: window.__AR_UTILS.parseNumeric
 */
(function () {
  if (window.__AR_LAB_CRITICAL) return;

  const RULES = {
    potasio:       { lo: 3.0, hi: 5.5,    reasonLow: "Hipokalemia (riesgo arritmia)", reasonHigh: "Hiperkalemia (riesgo arritmia)", severity: "critical" },
    sodio:         { lo: 130, hi: 150,    reasonLow: "Hiponatremia",                   reasonHigh: "Hipernatremia",                  severity: "critical" },
    glicemia:      { lo: 60,  hi: 250,    reasonLow: "Hipoglicemia",                   reasonHigh: "Hiperglicemia marcada",          severity: "critical" },
    calcio:        { lo: 7.5, hi: 11.5,   reasonLow: "Hipocalcemia",                   reasonHigh: "Hipercalcemia",                  severity: "critical" },
    magnesio:      { lo: 1.2, hi: 3.0,    reasonLow: "Hipomagnesemia",                 reasonHigh: "Hipermagnesemia",                severity: "warn"     },
    hemoglobina:   { lo: 8,   hi: 18,     reasonLow: "Anemia severa",                  reasonHigh: "Poliglobulia",                   severity: "critical" },
    hematocrito:   { lo: 25,  hi: 55,     reasonLow: "Anemia severa",                  reasonHigh: "Hemoconcentración",              severity: "warn"     },
    leucocitos:    { lo: 2000,hi: 20000,  reasonLow: "Leucopenia",                     reasonHigh: "Leucocitosis",                   severity: "warn"     },
    plaquetas:     { lo: 50000,hi:1000000,reasonLow: "Trombocitopenia severa",         reasonHigh: "Trombocitosis",                  severity: "critical" },
    inr:           { lo: null,hi: 4.5,    reasonLow: null,                             reasonHigh: "INR supraterapéutico (sangrado)",severity: "critical" },
    creatinina:    { lo: null,hi: 2.0,    reasonLow: null,                             reasonHigh: "Falla renal — evaluar AKI/ERC",  severity: "warn"     },
    vfg:           { lo: 30,  hi: null,   reasonLow: "VFG <30 (ERC etapa 4-5)",        reasonHigh: null,                             severity: "critical" },
    hba1c:         { lo: null,hi: 9,      reasonLow: null,                             reasonHigh: "HbA1c >9% (mal control DM)",     severity: "warn"     },
    ldl:           { lo: null,hi: 190,    reasonLow: null,                             reasonHigh: "LDL muy alto (riesgo CV)",       severity: "warn"     },
    trigliceridos: { lo: null,hi: 500,    reasonLow: null,                             reasonHigh: "Hipertrigliceridemia severa (pancreatitis)", severity: "critical" },
    tsh:           { lo: 0.1, hi: 10,     reasonLow: "Hipertiroidismo (TSH suprimida)",reasonHigh: "Hipotiroidismo franco",          severity: "warn"     },
    pcr:           { lo: null,hi: 100,    reasonLow: null,                             reasonHigh: "PCR muy elevada (sepsis/inflamación)", severity: "warn" },
    troponina:     { lo: null,hi: 0.04,   reasonLow: null,                             reasonHigh: "Troponina elevada (descartar SCA)", severity: "critical" },
    bilirrubina_total: { lo: null,hi: 3,  reasonLow: null,                             reasonHigh: "Hiperbilirrubinemia (ictericia)",severity: "warn"     },
    got:           { lo: null,hi: 200,    reasonLow: null,                             reasonHigh: "Hepatitis aguda probable",       severity: "warn"     },
    gpt:           { lo: null,hi: 200,    reasonLow: null,                             reasonHigh: "Hepatitis aguda probable",       severity: "warn"     },
    rac:           { lo: null,hi: 300,    reasonLow: null,                             reasonHigh: "Macroalbuminuria (nefropatía)",  severity: "warn"     },
  };

  const STORAGE_KEY = "ar_lab_critical_overrides_v1";

  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function saveOverrides(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj || {})); return true; }
    catch { return false; }
  }
  function resetOverrides() {
    try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; }
  }
  function getEffective(key) {
    const base = RULES[key];
    if (!base) return null;
    const ov = loadOverrides()[key] || {};
    return {
      lo: ov.lo !== undefined ? ov.lo : base.lo,
      hi: ov.hi !== undefined ? ov.hi : base.hi,
      severity: ov.severity || base.severity,
      reasonLow: base.reasonLow,
      reasonHigh: base.reasonHigh,
    };
  }

  // ---------- Audit log (ring buffer) ----------
  const LOG_KEY = "ar_lab_critical_log_v1";
  const LOG_MAX = 500;
  const EXT_VERSION = (() => {
    try { return chrome?.runtime?.getManifest?.()?.version || "0.0.0"; } catch { return "0.0.0"; }
  })();

  // Hash corto y no reversible del RUT para correlación sin exponer PHI.
  // FNV-1a 32-bit — suficiente como identificador local de paciente.
  function patientHash(rut) {
    if (!rut) return null;
    const s = String(rut).replace(/\./g, "").replace(/-/g, "").toLowerCase();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return "p_" + h.toString(16).padStart(8, "0");
  }

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]") || []; }
    catch { return []; }
  }
  function saveLog(arr) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(-LOG_MAX))); } catch {}
  }
  function clearLog() {
    try { localStorage.removeItem(LOG_KEY); } catch {}
  }
  function clearLogForPatient(rutOrHash) {
    const h = rutOrHash && rutOrHash.startsWith?.("p_") ? rutOrHash : patientHash(rutOrHash);
    if (!h) return 0;
    const arr = loadLog().filter(e => e.patientHash !== h);
    saveLog(arr);
    return arr.length;
  }
  function getLog() { return loadLog(); }
  function appendLog(entry) {
    const arr = loadLog();
    arr.push(entry);
    saveLog(arr);
  }

  function currentPatientHash() {
    try {
      const rut = window.__AR_PATIENT?.extract?.()?.rut;
      return patientHash(rut);
    } catch { return null; }
  }

  // Normaliza valores reportados en miles/µL (×10³) a /µL absolutos.
  // Ej: leucocitos "8.08" → 8080/µL ; plaquetas "157" → 157000/µL.
  // Evita falsos positivos de leucopenia / trombocitopenia severa.
  function normalizeUnit(key, num, unitRaw) {
    if (num == null) return num;
    const u = String(unitRaw || "").toLowerCase();
    const isThousands = /(mil|miles|10\^?3|10\u00b3|x10\^?3|k\/?µ?l|k\/?ul)/i.test(u);
    if (key === "leucocitos") {
      if (isThousands || num < 100) return num * 1000;
    }
    if (key === "plaquetas") {
      if (isThousands || num < 2000) return num * 1000;
    }
    return num;
  }

  function evaluate(key, rawValue, ctx) {
    const rule = getEffective(key);
    if (!rule) return null;
    const parseNumeric = window.__AR_UTILS?.parseNumeric;
    if (!parseNumeric) return null;
    const parsed = parseNumeric(rawValue);
    if (parsed == null) return null;
    // Valor 0 = examen no tomado / sin registro (fisiológicamente imposible).
    // Evita falsos positivos como "Leucopenia" cuando el parámetro no se midió.
    if (parsed === 0) return null;
    const num = normalizeUnit(key, parsed, ctx?.unit);
    let hit = null;
    if (rule.lo != null && num < rule.lo) hit = { side: "low", threshold: rule.lo, severity: rule.severity, reason: rule.reasonLow, value: num };
    else if (rule.hi != null && num > rule.hi) hit = { side: "high", threshold: rule.hi, severity: rule.severity, reason: rule.reasonHigh, value: num };
    if (!hit) return null;

    const baseRule = RULES[key] || {};
    const overridden = (rule.lo !== baseRule.lo) || (rule.hi !== baseRule.hi) || (rule.severity !== baseRule.severity);

    if (ctx && ctx.log !== false) {
      const auditEntry = {
        v: 2,
        ts: new Date().toISOString(),
        extVersion: EXT_VERSION,
        patientHash: currentPatientHash(),
        key,
        name: ctx.name || key,
        unit: ctx.unit || "",
        rawValue: String(rawValue),
        value: num,
        side: hit.side,
        threshold: hit.threshold,
        severity: hit.severity,
        reason: hit.reason,
        overridden,
        source: ctx.source || "evaluate",
        labDate: ctx.labDate || null,
      };
      appendLog(auditEntry);
      // Auditoría inmutable remota (Fase 6.4)
      try {
        if (window.__AR_AUDIT) {
          window.__AR_AUDIT.log({
            event_type: "lab_critical_shown",
            source: "lab",
            rule_id: `lab:${key}:${hit.side}`,
            patient_hash: auditEntry.patientHash,
            evidence: {
              key, name: auditEntry.name, unit: auditEntry.unit,
              value: num, threshold: hit.threshold, side: hit.side,
              severity: hit.severity, reason: hit.reason, overridden,
              labDate: auditEntry.labDate, source: auditEntry.source,
            },
          });
        }
      } catch (_) {}
    }
    return { severity: hit.severity, reason: hit.reason, value: num, threshold: hit.threshold, side: hit.side, overridden };
  }

  function collect(lab, labDisplay) {
    const out = [];
    if (!lab || !lab.analytes) return out;
    const display = labDisplay || {};
    for (const [key, a] of Object.entries(lab.analytes)) {
      if (key.includes(".")) continue;
      const name = display[key]?.name || a.rawName || key;
      const unit = display[key]?.unit || a.unit || "";
      const ev = evaluate(key, a.value, { name, unit, source: "collect", labDate: lab.date || null });
      if (!ev) continue;
      out.push({ key, name, value: a.value, unit, ...ev });
    }
    out.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
    return out;
  }

  function getLogForCurrentPatient() {
    const h = currentPatientHash();
    if (!h) return [];
    return loadLog().filter(e => e.patientHash === h);
  }

  window.__AR_LAB_CRITICAL = {
    RULES, evaluate, collect, getEffective,
    loadOverrides, saveOverrides, resetOverrides, STORAGE_KEY,
    getLog, getLogForCurrentPatient, clearLog, clearLogForPatient,
    patientHash, currentPatientHash, LOG_KEY, LOG_MAX, EXT_VERSION,
  };
})();
