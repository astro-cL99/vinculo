/* Vínculo — Reglas formales de PII (verificables)
 * Cada regla = { id, categoria, pattern, replacement, severidad, evidencia, ejemplos[] }
 * Fuente normativa:
 *  - Ley 19.628 (Protección de datos personales, Chile)
 *  - Ley 21.719 (Nueva Ley de Protección de Datos, vigente 2026)
 *  - Norma Técnica 213 MINSAL (Ficha Clínica Electrónica)
 *  - GDPR Art. 4(1) y Art. 9 (datos sensibles de salud) — referencia
 *  - HIPAA Safe Harbor §164.514(b)(2) — referencia (18 identificadores)
 */
(function () {
  if (window.__AR_PII_RULES) return;

  const RULES = [
    {
      id: "PII-RUT-001",
      categoria: "identificador_nacional",
      pattern: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g,
      replacement: "[RUT]",
      severidad: "critica",
      evidencia: "Ley 19.628 Art.2(f); HIPAA §164.514(b)(2)(i)(A)",
      ejemplos: ["12.345.678-9", "12345678-K", "1.234.567-8"],
    },
    {
      id: "PII-EMAIL-001",
      categoria: "contacto_electronico",
      pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
      replacement: "[EMAIL]",
      severidad: "alta",
      evidencia: "Ley 19.628 Art.2(f); HIPAA §164.514(b)(2)(i)(F)",
      ejemplos: ["paciente@gmail.com", "j.perez+test@uchile.cl"],
    },
    {
      id: "PII-PHONE-001",
      categoria: "contacto_telefonico",
      pattern: /\b(?:\+?56\s?)?(?:9\s?\d{4}\s?\d{4}|[2-8]\s?\d{3}\s?\d{4})\b/g,
      replacement: "[TEL]",
      severidad: "alta",
      evidencia: "Ley 19.628 Art.2(f); HIPAA §164.514(b)(2)(i)(D)",
      ejemplos: ["+56 9 1234 5678", "912345678", "22345678"],
    },
    {
      id: "PII-ADDR-001",
      categoria: "domicilio",
      pattern: /\b(?:calle|av\.?|avenida|pasaje|psje\.?|villa|población|pobl\.?|block|depto\.?|n°|nº)\s+[A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .'-]{3,60}/gi,
      replacement: "[DIRECCIÓN]",
      severidad: "alta",
      evidencia: "Ley 19.628 Art.2(f); HIPAA §164.514(b)(2)(i)(B)",
      ejemplos: ["Calle Las Rosas 1234", "Av. Providencia 1500 depto 302"],
    },
    {
      id: "PII-NAME-001",
      categoria: "nombre_propio",
      // Heurística: 2-4 palabras capitalizadas seguidas (no en inicio de oración)
      pattern: /(?<=[a-záéíóú,]\s)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s){1,3}[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/g,
      replacement: "[NOMBRE]",
      severidad: "media",
      evidencia: "Ley 19.628 Art.2(f); HIPAA §164.514(b)(2)(i)(A)",
      ejemplos: ["paciente Juan Pérez González consulta"],
      experimental: true,
    },
    {
      id: "PII-DOB-001",
      categoria: "fecha_nacimiento",
      pattern: /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/g,
      replacement: "[FECHA_NAC]",
      severidad: "media",
      evidencia: "HIPAA §164.514(b)(2)(i)(C)",
      ejemplos: ["12/03/1985", "1-1-2000", "31/12/1945"],
    },
  ];

  // Claves de objeto que NUNCA deben salir, aún si parecen anonimizadas
  const FORBIDDEN_KEYS = new Set([
    "rut", "run", "nombre", "name", "apellido", "lastname",
    "telefono", "phone", "celular", "movil",
    "direccion", "address", "domicilio",
    "email", "correo", "mail",
    "fechanacimiento", "birthdate", "fecha_nac", "dob",
  ]);

  /** Aplica todas las reglas y devuelve { texto, hits: [{rule, count}] } */
  function audit(text) {
    if (text == null) return { texto: text, hits: [] };
    let s = String(text);
    const hits = [];
    for (const r of RULES) {
      // Reset regex state cada vez (g flag)
      r.pattern.lastIndex = 0;
      const matches = s.match(r.pattern);
      if (matches?.length) hits.push({ rule: r.id, count: matches.length, severidad: r.severidad });
      s = s.replace(r.pattern, r.replacement);
    }
    return { texto: s, hits };
  }

  window.__AR_PII_RULES = { RULES, FORBIDDEN_KEYS, audit };
})();
