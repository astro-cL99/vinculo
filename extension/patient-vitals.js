/* Vínculo — Auto-detección de signos vitales y datos antropométricos
 * desde la ficha activa de Rayen.
 *
 * Lee del DOM (sin pedir nada al servidor) campos visibles tipo:
 *   - "Peso (kg): 12,5"
 *   - "Talla (cm): 95"
 *   - "Edad: 24 meses" / "2 años 3 meses" / "Fecha de nacimiento: 12/04/2022"
 *
 * Expone:
 *   window.__AR_VITALS = {
 *     read() -> { weightKg?, heightCm?, ageMonths?, ageYears?, bmi?, source }
 *   }
 *
 * Estrategia:
 *   1. Buscar pares label→input dentro de form/.patient-card/.antropometr*
 *   2. Si no hay, escanear texto plano con regex tolerantes a coma decimal y
 *      formato chileno.
 *   3. Si encuentra fecha de nacimiento, calcular edad en meses.
 */
(function () {
  if (window.__AR_VITALS) return;

  const log = window.__AR_LOG?.module("vitals") || { debug() {}, info() {}, warn() {} };

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const num = (s) => {
    if (s == null) return null;
    const m = String(s).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };

  // Heurística: dado un texto cercano a un input, ¿qué etiqueta es?
  function classifyLabel(text) {
    const t = norm(text);
    if (/peso/.test(t) && !/peso ideal/.test(t)) return "weight";
    if (/^talla|^estatura/.test(t)) return "height";
    if (/edad/.test(t)) return "age";
    if (/fecha.*nac|f\.\s*nac|nacimiento/.test(t)) return "dob";
    return null;
  }

  function readFromInputs() {
    const found = {};
    const inputs = document.querySelectorAll("input, [data-value]");
    inputs.forEach((el) => {
      // Buscar label asociado
      let label = "";
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) label = lab.textContent || "";
      }
      if (!label) {
        const parentLab = el.closest("label");
        if (parentLab) label = parentLab.textContent || "";
      }
      if (!label) {
        const prev = el.previousElementSibling;
        if (prev && /label|span|small/i.test(prev.tagName)) label = prev.textContent || "";
      }
      const kind = classifyLabel(label);
      if (!kind) return;
      const v = el.value || el.getAttribute("data-value") || "";
      const n = num(v);
      if (n == null) return;
      if (kind === "weight" && n >= 1 && n <= 200 && found.weightKg == null) found.weightKg = n;
      if (kind === "height" && n >= 30 && n <= 250 && found.heightCm == null) found.heightCm = n;
      if (kind === "age" && n >= 0 && n <= 120 && found.ageYears == null) {
        // si la unidad es meses (label "edad meses") guardamos como meses
        if (/mes/.test(norm(label))) found.ageMonths = n;
        else found.ageYears = n;
      }
      if (kind === "dob" && /\d/.test(v)) {
        const d = parseDate(v);
        if (d) found.dob = d;
      }
    });
    return found;
  }

  function parseDate(s) {
    // dd/mm/yyyy o dd-mm-yyyy o yyyy-mm-dd
    const t = String(s).trim();
    let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let [_, d, mo, y] = m;
      if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
      const dt = new Date(+y, +mo - 1, +d);
      return isNaN(dt.getTime()) ? null : dt;
    }
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const dt = new Date(+m[1], +m[2] - 1, +m[3]);
      return isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  }

  function readFromText() {
    const found = {};
    const text = (document.body?.innerText || "").slice(0, 30000);
    // Peso: "Peso 12,5 kg" / "Peso (kg) 12.5"
    let m = text.match(/peso[^\n]{0,30}?(\d+[.,]?\d*)\s*kg/i);
    if (m) {
      const n = num(m[1]);
      if (n && n >= 1 && n <= 200) found.weightKg = n;
    }
    // Talla
    m = text.match(/(?:talla|estatura)[^\n]{0,30}?(\d+[.,]?\d*)\s*(?:cm|m)\b/i);
    if (m) {
      let n = num(m[1]);
      if (n && /\bm\b/.test(m[0]) && !/cm/.test(m[0])) n = n * 100;
      if (n && n >= 30 && n <= 250) found.heightCm = n;
    }
    // Edad: "2 años 3 meses" / "24 meses" / "Edad: 5 años"
    m = text.match(/edad[^\n]{0,15}?(\d{1,3})\s*a(?:n|ñ)os?\s*(?:y\s*)?(?:(\d{1,2})\s*mes)?/i);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = m[2] ? parseInt(m[2], 10) : 0;
      if (y >= 0 && y < 120) {
        found.ageYears = y;
        found.ageMonths = y * 12 + mo;
      }
    } else {
      m = text.match(/(\d{1,3})\s*meses\b/i);
      if (m) {
        const mo = parseInt(m[1], 10);
        if (mo > 0 && mo <= 240) {
          found.ageMonths = mo;
          found.ageYears = +(mo / 12).toFixed(1);
        }
      }
    }
    // Fecha de nacimiento
    m = text.match(/(?:fecha\s+de\s+nacimiento|f\.\s*nac\.?|nacimiento)[^\n]{0,30}?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (m) {
      const d = parseDate(m[1]);
      if (d) found.dob = d;
    }
    return found;
  }

  function ageFromDob(dob) {
    if (!dob) return null;
    const now = new Date();
    let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
    if (now.getDate() < dob.getDate()) months--;
    return months >= 0 ? months : null;
  }

  function read() {
    const a = readFromInputs();
    const b = readFromText();
    const merged = { ...b, ...a }; // inputs ganan sobre regex
    if (merged.dob) {
      const m = ageFromDob(merged.dob);
      if (m != null) {
        if (merged.ageMonths == null) merged.ageMonths = m;
        if (merged.ageYears == null) merged.ageYears = +(m / 12).toFixed(1);
      }
    }
    if (merged.weightKg && merged.heightCm) {
      const hm = merged.heightCm / 100;
      merged.bmi = +(merged.weightKg / (hm * hm)).toFixed(1);
    }
    merged.source = Object.keys(a).length ? "inputs" : (Object.keys(b).length ? "text" : "none");
    log.debug("read()", merged);
    return merged;
  }

  window.__AR_VITALS = { read };
})();
