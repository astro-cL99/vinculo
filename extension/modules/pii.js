/* Vínculo — sanitizador PII
 * Elimina/redacta RUT, nombres, teléfonos, direcciones y correos antes de
 * enviar texto o contexto a servicios externos (Lovable AI / Gemini).
 *
 * API: window.__AR_PII = { scrub(text), scrubObject(obj), buildPatientContext() }
 */
(function () {
  if (window.__AR_PII) return;

  // Reglas formales (cargadas desde pii-rules.js si está disponible)
  function getRules() {
    return window.__AR_PII_RULES?.RULES || [];
  }

  function scrub(text) {
    if (text == null) return text;
    let s = String(text);
    const rules = getRules();
    if (rules.length) {
      for (const r of rules) {
        if (r.experimental) continue; // sólo en modo auditoría
        r.pattern.lastIndex = 0;
        s = s.replace(r.pattern, r.replacement);
      }
      return s;
    }
    // Fallback inline (si pii-rules.js no cargó)
    s = s.replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, "[RUT]");
    s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[EMAIL]");
    s = s.replace(/\b(?:\+?56\s?)?(?:9\s?\d{4}\s?\d{4}|[2-8]\s?\d{3}\s?\d{4})\b/g, "[TEL]");
    return s;
  }

  /** Auditoría: devuelve { texto, hits } sin alterar el original */
  function audit(text) {
    return window.__AR_PII_RULES?.audit?.(text) || { texto: scrub(text), hits: [] };
  }

  // Campos que nunca deben salir (incluso si parecen "anonimizados")
  const FORBIDDEN_KEYS = window.__AR_PII_RULES?.FORBIDDEN_KEYS || new Set([
    "rut", "run", "nombre", "name", "apellido", "lastname", "telefono", "phone",
    "celular", "movil", "direccion", "address", "domicilio",
    "email", "correo", "mail", "fechanacimiento", "birthdate", "fecha_nac", "dob",
  ]);

  function scrubObject(obj) {
    if (obj == null) return obj;
    if (Array.isArray(obj)) return obj.map(scrubObject);
    if (typeof obj === "object") {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue;
        out[k] = scrubObject(v);
      }
      return out;
    }
    if (typeof obj === "string") return scrub(obj);
    return obj;
  }

  /** Construye un contexto de paciente sanitizado para enviar a la IA. */
  function buildPatientContext() {
    const ctx = {};
    // Diagnósticos — la API real es __AR_DX_EXTRACT.extract() y devuelve { candidatos, ambiguos, principal }
    try {
      const dxRes = window.__AR_DX_EXTRACT?.extract?.();
      const cands = dxRes?.candidatos || [];
      if (cands.length) {
        ctx.diagnosticos = cands.slice(0, 20)
          .map(c => c.abrev || c.texto || c.canon || c.label || "")
          .filter(Boolean);
      }
    } catch {}
    // Datos demográficos — la API real es __AR_PATIENT.extract() con campos `edad` / `sexo`.
    try {
      const p = window.__AR_PATIENT?.extract?.() || {};
      if (p.edad != null) {
        const n = typeof p.edad === "number" ? p.edad : parseInt(String(p.edad).match(/\d+/)?.[0] || "", 10);
        if (Number.isFinite(n)) ctx.edad = n;
      }
      if (p.sexo) ctx.sexo = p.sexo;
    } catch {}
    // Laboratorio actual + alertas críticas
    try {
      const lab = window.__AR_LAB_SESSION?.get?.();
      if (lab && lab.analytes) {
        ctx.lab = { fecha: lab.date || null, valores: {} };
        for (const [k, a] of Object.entries(lab.analytes).slice(0, 25)) {
          if (k.includes(".")) continue;
          ctx.lab.valores[k] = { valor: a.value, unidad: a.unit || "" };
        }
        const alerts = window.__AR_LAB_CRITICAL?.collect?.(lab, {}) || [];
        if (alerts.length) ctx.lab.alertas = alerts.map(a => ({
          examen: a.key, valor: a.value, severidad: a.severity, motivo: a.reason,
        }));
      }
    } catch {}
    return scrubObject(ctx);
  }

  window.__AR_PII = { scrub, scrubObject, buildPatientContext, audit };
})();
