/* Vínculo — Extracción unificada de datos del paciente desde el DOM Rayen.
 *
 * Lee múltiples señales (nav-title, patient-card, formularios visibles, texto de la
 * ficha) y devuelve un objeto canónico con: nombre, apellidos, nombreCompleto, RUT,
 * sexo (con confianza), fechaNac, edad y diagnóstico principal detectado.
 *
 * También calcula `missing[]` (campos que NO se pudieron resolver con confianza alta)
 * y `suggestions[]` (candidatos de baja confianza que el usuario debe confirmar).
 *
 * API:
 *   window.__AR_PATIENT = {
 *     extract() -> { nombre, apellidos, nombreCompleto, rut, sexo, sexoConf,
 *                    fechaNac, edad, diagnostico, missing, suggestions, source }
 *     guessSexo(nombre) -> { sexo: "M"|"F"|null, conf: 0..1, motivo: string }
 *     genderize(text, sexo) -> string   // corrige género en texto plano
 *   }
 */
(function () {
  if (window.__AR_PATIENT) return;

  const log = window.__AR_LOG?.module ? window.__AR_LOG.module("patient") : { debug() {}, info() {}, warn() {} };

  // ============================================================
  // Utilidades
  // ============================================================
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const RUT_RE = /\b(\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK])\b/;

  // ============================================================
  // Heurística de género por nombre
  // ============================================================
  // Listas curadas de nombres comunes en Chile cuyo sufijo confunde la regla
  // estándar (terminados en -a → F, en -o/-e → M). Mantén minúsculas sin tilde.
  const FEMALE_NAMES = new Set([
    "maria", "carmen", "luz", "rocio", "pilar", "soledad", "consuelo",
    "monserrat", "monserrath", "raquel", "ester", "esther", "isabel", "beatriz",
    "ines", "ruth", "rebeca", "judith", "ivonne", "yasmin", "yazmin",
    "carmen gloria", "marisol", "anabel", "anabella", "noemi",
    // -e tradicionalmente F en es-CL
    "guadalupe", "soledad", "luce",
    // Cortos comunes
    "ana", "eva", "sara", "lucia", "luisa", "rosa", "olga", "elsa",
    // Compuestos María X frecuentes
    "maria jose", "maria paz", "maria luisa", "maria fernanda", "maria angelica",
    "maria teresa", "maria isabel", "maria eugenia", "maria elena", "maria ines",
    "maria soledad", "maria victoria",
  ]);
  const MALE_NAMES = new Set([
    // Terminan en -a pero son masculinos
    "andrea", // ambiguo; tratado como excepción dependiente del país (en CL: F mayoritario)
    "elias", "tobias", "matias", "nicolas", "lucas", "jonas",
    "jose maria", "luca", "noah",
    // Otros frecuentes
    "luis", "jose", "juan", "pedro", "carlos", "miguel", "manuel", "rafael",
    "felipe", "javier", "francisco", "fernando", "ricardo", "gabriel", "diego",
    "alejandro", "alvaro", "esteban", "ignacio", "rodrigo", "sebastian", "tomas",
    "cristian", "claudio", "victor", "mario", "pablo", "samuel", "benjamin",
    "joaquin", "vicente", "agustin", "maximiliano", "matias", "nicolas",
  ]);
  // Casos chileno-comunes en que la regla por sufijo falla:
  // - "Andrea" en Chile mayoritariamente femenino → forzamos F
  FEMALE_NAMES.add("andrea");
  // - "José María" mantiene M
  MALE_NAMES.delete("jose maria"); MALE_NAMES.add("jose maria");

  function guessSexo(nombreCompleto) {
    if (!nombreCompleto) return { sexo: null, conf: 0, motivo: "sin nombre" };
    const partes = norm(nombreCompleto).split(/\s+/).filter(Boolean);
    if (!partes.length) return { sexo: null, conf: 0, motivo: "sin nombre" };

    // Probar primer y segundo nombres (algunos son "Juan María" / "María José")
    // Probar también pares "maria jose"
    const first = partes[0];
    const firstTwo = partes.slice(0, 2).join(" ");

    if (FEMALE_NAMES.has(firstTwo)) return { sexo: "F", conf: .98, motivo: `coincide "${firstTwo}" en lista F` };
    if (MALE_NAMES.has(firstTwo)) return { sexo: "M", conf: .98, motivo: `coincide "${firstTwo}" en lista M` };
    if (FEMALE_NAMES.has(first)) return { sexo: "F", conf: .95, motivo: `coincide "${first}" en lista F` };
    if (MALE_NAMES.has(first)) return { sexo: "M", conf: .95, motivo: `coincide "${first}" en lista M` };

    // Heurística por sufijo del primer nombre
    if (/[aá]$/.test(first)) return { sexo: "F", conf: .72, motivo: `sufijo "-a" en "${first}"` };
    if (/[oó]$/.test(first)) return { sexo: "M", conf: .75, motivo: `sufijo "-o" en "${first}"` };
    if (/(?:el|er|or|us|in|on|an|al|il)$/.test(first)) return { sexo: "M", conf: .65, motivo: `terminación consonántica típica M` };
    if (/(?:is|iz|en|ud|ad)$/.test(first)) return { sexo: "F", conf: .55, motivo: `terminación típica F` };

    return { sexo: null, conf: 0, motivo: `sin coincidencia para "${first}"` };
  }

  // ============================================================
  // Genderizer — corrige texto según sexo
  // ============================================================
  // Mapas direccionales (M → F y F → M). Aplicamos sólo en la dirección
  // que el sexo requiere. Usamos word-boundaries para no romper sub-palabras.
  const M_TO_F = [
    [/\bel paciente\b/g, "la paciente"],
    [/\bEl paciente\b/g, "La paciente"],
    [/\bel usuario\b/g, "la usuaria"],
    [/\bEl usuario\b/g, "La usuaria"],
    [/\bdel paciente\b/g, "de la paciente"],
    [/\bdel usuario\b/g, "de la usuaria"],
    [/\bal paciente\b/g, "a la paciente"],
    [/\bal usuario\b/g, "a la usuaria"],
    [/\bel señor\b/g, "la señora"],
    [/\bEl señor\b/g, "La señora"],
    [/\batendido\b/g, "atendida"],
    [/\bAtendido\b/g, "Atendida"],
    [/\bevaluado\b/g, "evaluada"],
    [/\bcontrolado\b/g, "controlada"],
    [/\bderivado\b/g, "derivada"],
    [/\bdiagnosticado\b/g, "diagnosticada"],
    [/\btratado\b/g, "tratada"],
    [/\bingresado\b/g, "ingresada"],
    [/\bcitado\b/g, "citada"],
    [/\bsano\b/g, "sana"],
    [/\benfermo\b/g, "enferma"],
    [/\bconsultante\b/g, "consultante"],         // neutro
    [/\bsolicitante\b/g, "solicitante"],          // neutro
    [/\b(don)\b/g, "doña"],
    [/\b(Don)\b/g, "Doña"],
  ];
  const F_TO_M = [
    [/\bla paciente\b/g, "el paciente"],
    [/\bLa paciente\b/g, "El paciente"],
    [/\bla usuaria\b/g, "el usuario"],
    [/\bLa usuaria\b/g, "El usuario"],
    [/\bde la paciente\b/g, "del paciente"],
    [/\bde la usuaria\b/g, "del usuario"],
    [/\ba la paciente\b/g, "al paciente"],
    [/\ba la usuaria\b/g, "al usuario"],
    [/\bla señora\b/g, "el señor"],
    [/\bLa señora\b/g, "El señor"],
    [/\batendida\b/g, "atendido"],
    [/\bAtendida\b/g, "Atendido"],
    [/\bevaluada\b/g, "evaluado"],
    [/\bcontrolada\b/g, "controlado"],
    [/\bderivada\b/g, "derivado"],
    [/\bdiagnosticada\b/g, "diagnosticado"],
    [/\btratada\b/g, "tratado"],
    [/\bingresada\b/g, "ingresado"],
    [/\bcitada\b/g, "citado"],
    [/\bsana\b/g, "sano"],
    [/\benferma\b/g, "enfermo"],
    [/\b(doña)\b/g, "don"],
    [/\b(Doña)\b/g, "Don"],
  ];

  function genderize(text, sexo) {
    if (!text || !sexo) return text || "";
    const rules = sexo === "F" ? M_TO_F : F_TO_M;
    let out = text;
    rules.forEach(([re, sub]) => { out = out.replace(re, sub); });
    return out;
  }

  // ============================================================
  // Lectura del DOM
  // ============================================================
  function stripPatientPrefix(t) {
    return String(t || "")
      // "Historia clínica de", "Ficha de", "Paciente:", etc.
      .replace(/^\s*(?:historia\s+cl[íi]nica\s+de|ficha\s+cl[íi]nica\s+de|ficha\s+de|paciente)\s*:?\s*/i, "")
      // Sobrenombre entre paréntesis al inicio: "(Elisa) Elisa Aguilar..."
      .replace(/^\s*\([^)]+\)\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function readPatientCardText() {
    const sels = [
      "span.nav-title", ".nav-title",
      ".patient-card .patient-data", ".patient-card",
      "[class*='patient-info']", "[class*='ficha-paciente']",
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) {
        const t = stripPatientPrefix(el.textContent.replace(/\s+/g, " ").trim());
        if (t.length > 5) return t;
      }
    }
    return "";
  }

  function findByLabels(labels) {
    // Busca un input/select cuyo label asociado coincida estrictamente con
    // alguno de los textos pedidos. Estricto = el label (no el contenedor)
    // empieza por o equivale al texto buscado, ignorando ":" finales.
    const wanted = labels.map(norm);
    const matches = (labelText) => {
      const ln = norm(labelText).replace(/[:*]+$/g, "").trim();
      if (!ln) return false;
      return wanted.some((w) => ln === w || ln.startsWith(w + " ") || ln === w + ":" );
    };
    const inputs = document.querySelectorAll("input, select, textarea");
    for (const el of inputs) {
      let labelText = "";
      // 1) <label for="id">
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) labelText = lab.textContent || "";
      }
      // 2) <label> ancestro directo
      if (!labelText) {
        const parentLabel = el.closest("label");
        if (parentLabel) {
          // texto del label SIN el valor del input
          labelText = Array.from(parentLabel.childNodes)
            .filter((n) => n.nodeType === 3 || (n.nodeType === 1 && n !== el && !n.contains(el)))
            .map((n) => n.textContent || "")
            .join(" ");
        }
      }
      // 3) aria-label / placeholder
      if (!labelText) labelText = el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
      if (!matches(labelText)) continue;
      const v = (el.value || el.textContent || "").trim();
      if (v && v.length < 200) return v;
    }
    // 4) Pares td-th / dt-dd
    const pairs = document.querySelectorAll("th, dt, .form-label, .label, .label-data");
    for (const lab of pairs) {
      if (!matches(lab.textContent || "")) continue;
      let sib = lab.nextElementSibling;
      // Caso Rayen: <div class="label-data">…</div><div class="patient-data">…</div>
      if (sib && sib.classList && sib.classList.contains("patient-data")) {
        const v = (sib.textContent || "").trim();
        if (v && v.length < 200) return v;
      }
      if (!sib && lab.parentElement) {
        // si es <th> con celdas hermanas en otra fila, busca <td> en la misma fila
        sib = lab.parentElement.querySelector("td, dd, .value, .patient-data");
      }
      const v = (sib?.textContent || "").trim();
      if (v && v.length < 200) return v;
    }
    return "";
  }

  function extractRut(rawText) {
    // 1) Buscar en label-input
    const fromLabel = findByLabels(["rut", "r.u.t", "run"]);
    const m1 = (fromLabel || "").match(RUT_RE);
    if (m1) return m1[1];
    // 2) Buscar en texto bruto del header de paciente
    const m2 = String(rawText || "").match(RUT_RE);
    if (m2) return m2[1];
    // 3) Fallback: barrido del header/breadcrumbs visibles
    const zones = document.querySelectorAll("header, .nav-title, .patient-card, [class*='paciente'], [class*='patient']");
    for (const z of zones) {
      const m3 = (z.textContent || "").match(RUT_RE);
      if (m3) return m3[1];
    }
    return "";
  }

  function isPlaceholder(s) {
    return /para\s+completar|debe\s+agregar|sin\s+datos|—|^-+$/i.test(String(s || ""));
  }
  function extractNombre(rawText, rut) {
    // 1) Label "nombre"
    const fromNombre = findByLabels(["nombre paciente", "nombre del paciente", "nombre completo", "nombres"]);
    if (fromNombre && fromNombre.length > 2 && !RUT_RE.test(fromNombre) && !isPlaceholder(fromNombre)) {
      return cleanNombre(stripPatientPrefix(fromNombre));
    }
    // 2) Quitar RUT del rawText y limpiar
    let t = stripPatientPrefix(String(rawText || ""));
    if (rut) t = t.replace(rut, "");
    t = t.replace(/\b(?:rut|run|r\.u\.t\.?)\s*:?/i, "")
         .replace(/\s+/g, " ")
         .trim();
    // Tomar primeros tokens hasta un separador no-letra/numero
    const m = t.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ' \-]{4,80})/);
    return cleanNombre(m ? m[1] : t.slice(0, 80));
  }

  function cleanNombre(s) {
    return String(s || "")
      .replace(/[,;|]/g, " ")
      .replace(/\b(paciente|sr\.?|sra\.?|don|doña)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitNombre(full) {
    // Convención chilena: "Nombre1 [Nombre2] Apellido1 Apellido2"
    const tokens = full.split(/\s+/).filter(Boolean);
    if (tokens.length <= 2) return { nombres: tokens.slice(0, 1).join(" "), apellidos: tokens.slice(1).join(" ") };
    if (tokens.length === 3) return { nombres: tokens[0], apellidos: tokens.slice(1).join(" ") };
    // 4+ tokens: 2 nombres + 2 apellidos
    return { nombres: tokens.slice(0, 2).join(" "), apellidos: tokens.slice(2).join(" ") };
  }

  function extractSexoFromDom() {
    const fromLabel = norm(findByLabels(["sexo", "género", "genero"]));
    if (!fromLabel) return null;
    if (/femen|^f\b|mujer/.test(fromLabel)) return { sexo: "F", conf: .99, motivo: "campo Sexo en ficha" };
    if (/mascul|^m\b|hombre|var(?:ó|o)n/.test(fromLabel)) return { sexo: "M", conf: .99, motivo: "campo Sexo en ficha" };
    return null;
  }

  function extractFechaNac() {
    const v = findByLabels(["fecha de nacimiento", "f. nac", "f.nac", "nacimiento"]);
    if (!v || isPlaceholder(v)) return "";
    // debe contener al menos una fecha (dígitos con / o -)
    const m = String(v).match(/\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/);
    return m ? m[0] : (/\d/.test(v) ? v.replace(/\s+/g, " ").trim().slice(0, 30) : "");
  }

  function extractEdad() {
    const v = findByLabels(["edad cronológica", "edad cronologica", "edad"]);
    if (!v || isPlaceholder(v)) return "";
    // Soporta "58 años 9 meses 16 días" → tomar solo años
    const mFull = String(v).match(/(\d{1,3})\s*a(?:ños?)?/i);
    if (mFull) {
      const n = parseInt(mFull[1], 10);
      if (Number.isFinite(n) && n <= 130) return `${n} años`;
    }
    const m = String(v).match(/(\d{1,3})\s*(a(?:ños?)?|m(?:eses?)?|d(?:[ií]as?)?)?/i);
    if (!m) return "";
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n > 130) return "";
    return `${n} ${m[2] ? m[2].toLowerCase().startsWith("m") ? "meses" : (m[2].toLowerCase().startsWith("d") ? "días" : "años") : "años"}`;
  }

  function extractDiagnostico() {
    // Preferir el extractor enriquecido si está disponible: devuelve el texto
    // canónico (con abreviación) del candidato principal.
    const DX = window.__AR_DX_EXTRACT;
    if (DX?.extract) {
      const r = DX.extract();
      if (r?.principal) {
        const p = r.principal;
        const display = p.abrev && p.abrev.toLowerCase() !== p.texto.toLowerCase()
          ? `${p.texto} (${p.abrev})`
          : p.texto;
        return display;
      }
    }
    // Fallback: lectura directa de label.
    const v1 = findByLabels(["diagnóstico", "diagnostico", "motivo de consulta", "problema de salud"]);
    if (v1 && v1.length > 2 && v1.length < 240) return v1.replace(/\s+/g, " ").trim();
    return "";
  }

  function extractDiagnosticoFull() {
    const DX = window.__AR_DX_EXTRACT;
    if (DX?.extract) return DX.extract();
    return { principal: null, candidatos: [], ambiguos: [] };
  }

  // ============================================================
  // API principal
  // ============================================================
  function extract() {
    const ctxText = readPatientCardText();
    const rutRaw = extractRut(ctxText);
    // Validación módulo 11 + formateo canónico (12.345.678-9)
    const RUT = window.__AR_RUT;
    const rutInfo = RUT?.validate ? RUT.validate(rutRaw) : { ok: !!rutRaw, formatted: rutRaw, motivo: "" };
    const rut = rutInfo.formatted || rutRaw || "";
    let nombreCompleto = extractNombre(ctxText, rutRaw);
    // Saneamiento defensivo: nunca devolver placeholders ni el prefijo de header.
    nombreCompleto = stripPatientPrefix(nombreCompleto || "");
    if (isPlaceholder(nombreCompleto) || /historia\s+cl[íi]nica/i.test(nombreCompleto)) nombreCompleto = "";
    const { nombres, apellidos } = splitNombre(nombreCompleto);

    const sexoDom = extractSexoFromDom();
    const sexoGuess = guessSexo(nombreCompleto);
    const sexoFinal = sexoDom || sexoGuess;

    let fechaNacRaw = extractFechaNac();
    if (isPlaceholder(fechaNacRaw)) fechaNacRaw = "";
    let edadRaw = extractEdad();
    if (isPlaceholder(edadRaw) || !/\d/.test(edadRaw || "")) edadRaw = "";
    const diagnostico = extractDiagnostico();
    const dxFull = extractDiagnosticoFull();

    const missing = [];
    const suggestions = [];

    if (!nombreCompleto) missing.push("nombre");
    if (!rut) missing.push("rut");
    else if (!rutInfo.ok) suggestions.push({ field: "rut", value: rut, motivo: rutInfo.motivo || "DV inválido", conf: 0.3 });
    if (!sexoFinal?.sexo) missing.push("sexo");
    else if (sexoFinal.conf < .9) suggestions.push({ field: "sexo", value: sexoFinal.sexo, motivo: sexoFinal.motivo, conf: sexoFinal.conf });
    if (!diagnostico) missing.push("diagnostico");

    // Empujar candidatos alternativos cuando hay ambigüedad en el dx
    if (dxFull.ambiguos?.length > 1) {
      for (const c of dxFull.ambiguos.slice(1)) {
        const display = c.abrev && c.abrev.toLowerCase() !== c.texto.toLowerCase()
          ? `${c.texto} (${c.abrev})`
          : c.texto;
        suggestions.push({ field: "diagnostico", value: display, motivo: `desde ${c.fuente}`, conf: c.conf, cie10: c.cie10 });
      }
    }

    const out = {
      nombre: nombres,
      apellidos,
      nombreCompleto,
      rut,
      rutValido: !!rutInfo.ok,
      rutMotivo: rutInfo.motivo || "",
      sexo: sexoFinal?.sexo || null,
      sexoConf: sexoFinal?.conf || 0,
      sexoMotivo: sexoFinal?.motivo || "",
      fechaNac: fechaNacRaw,
      edad: edadRaw,
      diagnostico,
      diagnosticoConf: dxFull.principal?.conf || (diagnostico ? 0.5 : 0),
      diagnosticoFuente: dxFull.principal?.fuente || "",
      diagnosticoCie10: dxFull.principal?.cie10 || "",
      diagnosticoAbrev: dxFull.principal?.abrev || "",
      diagnosticoCandidatos: dxFull.candidatos || [],
      diagnosticoAmbiguo: (dxFull.ambiguos?.length || 0) > 1,
      missing,
      suggestions,
      source: ctxText ? "patient-card" : "none",
    };
    log.debug("extract()", out);
    return out;
  }

  window.__AR_PATIENT = { extract, guessSexo, genderize };
})();
