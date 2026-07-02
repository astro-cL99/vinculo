/* Vínculo — content script v0.2.0
 * - Plantillas locales con captura/aplicación de formularios.
 * - Extractor automático de exámenes de laboratorio (clic programático en panel lateral).
 * - Reconocimiento de contexto: paciente, CESFAM, sección.
 * - Motor de placeholders {{lab.<analito>[.value|.unit|.fecha]}}.
 *
 * Cero red, cero datos clínicos fuera del PC. Lab en sessionStorage, plantillas en chrome.storage.local.
 */
(function () {
  if (window.__ar_loaded) return;
  window.__ar_loaded = true;

  const STORAGE_KEY = "templates";
  const FLOWS_KEY = "flows";
  const LAB_SESSION_KEY = window.__AR_LAB_SESSION?.KEY || "__ar_lab_v1";
  const REC_SESSION_KEY = "__ar_recording_v1";
  const FILL_GUARD_MS = 1200;
  let autofillRunId = 0;
  let autofillLockUntil = 0;
  // Estado del autollenado: idle | queued | running | done | error
  let autofillStatus = "idle";
  let autofillStatusInfo = { filled: 0, skipped: 0, total: 0, message: "" };
  function setFillStatus(state, info) {
    autofillStatus = state;
    if (info) autofillStatusInfo = { ...autofillStatusInfo, ...info };
    try { renderFillStatus(); } catch (_) {}
  }
  function renderFillStatus() {
    if (!labBadge) return;
    const btn = labBadge.querySelector("#ar-fill-lab");
    const chip = labBadge.querySelector("#ar-fill-status");
    if (!btn || !chip) return;
    const map = {
      idle:    { cls: "ar-fst-idle",    label: "Listo",       title: "Pulsa para rellenar el formulario actual" },
      queued:  { cls: "ar-fst-queued",  label: "En cola",     title: "Esperando para iniciar..." },
      running: { cls: "ar-fst-running", label: "Ejecutando…", title: "Rellenando campos del formulario" },
      done:    { cls: "ar-fst-done",    label: `✓ Completado (${autofillStatusInfo.filled || 0})`, title: autofillStatusInfo.message || "Proceso finalizado" },
      error:   { cls: "ar-fst-error",   label: `⚠ Errores (${autofillStatusInfo.skipped || 0})`, title: autofillStatusInfo.message || "Hubo errores en el llenado" },
    };
    const cur = map[autofillStatus] || map.idle;
    chip.className = "ar-fill-status " + cur.cls;
    chip.textContent = cur.label;
    chip.title = cur.title;
    btn.disabled = autofillStatus === "queued" || autofillStatus === "running";
  }
  // Modo debug — toggleable en runtime via window.__arDebug.toggle() o desde el badge 🐞
  // Persistido en localStorage para sobrevivir recargas.
  const DEBUG_KEY = "__ar_debug_v1";
  let DEBUG = (() => {
    try { return localStorage.getItem(DEBUG_KEY) === "1"; } catch (_) { return false; }
  })();
  const log = (...a) => { if (DEBUG) console.log("[AR]", ...a); };
  function setDebug(on) {
    DEBUG = !!on;
    try { localStorage.setItem(DEBUG_KEY, DEBUG ? "1" : "0"); } catch (_) {}
    console.log(`[AR] Modo debug ${DEBUG ? "ACTIVADO" : "desactivado"}`);
    try { updateLabBadge(); } catch (_) {}
    return DEBUG;
  }
  // API global para depurar desde la consola del navegador.
  window.__arDebug = {
    on: () => setDebug(true),
    off: () => setDebug(false),
    toggle: () => setDebug(!DEBUG),
    status: () => DEBUG,
    matchAnalyte: (txt) => {
      const n = normalizeName(txt);
      const m = matchAnalyteVerbose(txt);
      const cands = matchAnalyteCandidates(txt);
      console.log("[AR] match:", { input: txt, normalized: n, ...m, candidatos: cands });
      return { input: txt, normalized: n, ...m, candidatos: cands };
    },
    dumpDict: () => console.table(
      Object.entries(ANALYTE_DICT).map(([k, aliases]) => ({ key: k, aliases: aliases.join(" | ") })),
    ),
    dumpRanges: () => console.table(
      Object.entries(ANALYTE_RANGES).map(([k, r]) => ({ key: k, min: r.min, max: r.max, unit: r.unit })),
    ),
    inRange: (key, value) => {
      const r = isValueInRange(key, value);
      console.log(`[AR] ${key} = ${value} →`, r);
      return r;
    },
    lab: () => getLabSession(),
  };

  // Recordar el último campo editable enfocado por el usuario, para que los
  // botones del FAB (que roban el foco al hacer click) puedan seguir
  // pegando texto en el input/textarea correcto.
  let lastEditableEl = null;
  const isEditable = (el) => window.__AR_UTILS.isEditable(el);
  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target;
      // Excluir TODA UI propia de la extensión para no contaminar lastEditableEl
      // con inputs internos del modal clínico, panel de plantillas, FAB, etc.
      if (isEditable(el) && !el.closest("#ar-fab-wrap, #ar-panel, #ar-modal, #ar-clin")) {
        lastEditableEl = el;
      }
    },
    true,
  );

  // =====================================================================
  // Diccionario de analitos (espejo de src/lib/lab-analytes.ts)
  // =====================================================================
  const ANALYTE_DICT = {
    glicemia: ["glicemia", "glucosa", "glucemia", "glicemia ayuno", "glicemia en ayunas", "glucosa mg dl", "glicemia capilar", "hgt"],
    creatinina: ["creatinina", "creatinina serica", "creatinina sérica", "creat", "resultado creatinina", "creatinina en sangre"],
    vfg: ["vfg", "egfr", "filtrado glomerular", "tasa de filtracion glomerular", "velocidad de filtracion glomerular", "velocidaddefiltracionglomular", "velocidad filtracion glomerular"],
    urea: ["urea", "uremia"],
    bun: ["bun", "nitrogeno ureico", "nitrógeno ureico", "nitrogeno ureico en sangre"],
    acido_urico: ["acido urico", "ácido úrico", "acido urico mg dl"],
    hemoglobina: ["hemoglobina", "hb", "hgb", "hemoglobina hb", "hemoglobina g dl", "hemoglobina gr dl"],
    hematocrito: ["hematocrito", "hto", "hct", "hematocrito porcentaje"],
    leucocitos: ["leucocitos", "blancos", "wbc", "leucocitos x campo"],
    plaquetas: ["plaquetas", "plt"],
    vcm: ["vcm", "volumen corpuscular medio"],
    hba1c: ["hba1c", "hemoglobina glicosilada", "hemoglobina glicada", "hemoglobina glicosilada a1c", "a1c", "hemoglobina glicosilada hba1c", "porcentaje hemoglobina glicosilada"],
    colesterol_total: ["colesterol total"],
    ldl: ["ldl", "ldl colesterol", "colesterol ldl"],
    hdl: ["hdl", "hdl colesterol", "colesterol hdl", "hdl colesterol mg dl"],
    vldl: ["vldl", "vldl colesterol", "colesterol vldl"],
    trigliceridos: ["trigliceridos", "triglicéridos", "tg", "trigliceridos mg dl"],
    rel_col_ldl_hdl: [
      "relacion col ldl hdl",
      "relacion colldl hdl",
      "relacion colldlhdl",
      "relacioncolldl hdl",
      "relacioncolldlhdl",
      "relacion colesterol ldl hdl",
      "rel col ldl hdl",
      "rel ldl hdl",
      "ratio ldl hdl",
      "indice ldl hdl",
    ],
    tsh: ["tsh", "hormona tiroestimulante", "tiroestimulante", "hormona tiroestimulante tsh"],
    t4_libre: ["t4 libre", "t4l", "tiroxina libre", "t4 pruebas tiroideas libre", "t 4 libre"],
    got: ["got", "ast", "aspartato aminotransferasa"],
    gpt: ["gpt", "alt", "alanino aminotransferasa"],
    ggt: ["ggt", "gamma glutamil"],
    fosfatasas_alcalinas: ["fosfatasas alcalinas", "fal"],
    bilirrubina_total: ["bilirrubina total", "bili total"],
    sodio: ["sodio", "na", "natremia"],
    potasio: ["potasio", "k", "kalemia", "potasio k", "potasio meq l"],
    cloro: ["cloro", "cl", "cloro cl", "cloro meq l"],
    calcio: ["calcio", "ca", "calcemia"],
    magnesio: ["magnesio", "mg"],
    fosforo: ["fosforo", "fósforo", "p"],
    microalbuminuria: ["microalbuminuria", "albumina urinaria", "albúmina urinaria", "microalbuminuria mg l"],
    rac: ["rac", "relacion albumina creatinina", "relación albúmina creatinina", "ratio albumina creatinina"],
    vitamina_d: ["vitamina d", "25 oh vitamina d", "25-oh vitamina d"],
    vitamina_b12: ["vitamina b12", "b12", "cobalamina"],
    ferritina: ["ferritina"],
    fierro: ["hierro", "fierro", "fe", "hierro serico", "hierro sérico"],
    saturacion_transferrina: ["saturacion transferrina", "saturación transferrina", "sat transferrina", "indice saturacion transferrina", "% saturacion transferrina"],
    transferrina: ["transferrina"],
    tibc: ["tibc", "capacidad total de fijacion de hierro", "capacidad fijacion hierro"],
    tiempo_protrombina: ["tiempo de protrombina", "tp", "ptt"],
    inr: ["inr"],
    ttpa: ["ttpa", "tiempo de tromboplastina parcial activado", "kptt", "aptt"],
    // Hemograma — diferencial y otros índices
    neutrofilos: ["neutrofilos", "neutrófilos", "neut", "segmentados", "polimorfonucleares"],
    linfocitos: ["linfocitos", "lymph", "linf"],
    monocitos: ["monocitos", "mono"],
    eosinofilos: ["eosinofilos", "eosinófilos", "eos"],
    basofilos: ["basofilos", "basófilos", "baso"],
    rdw: ["rdw", "ancho de distribucion eritrocitaria", "amplitud distribucion eritrocitaria"],
    mch: ["mch", "hcm", "hemoglobina corpuscular media"],
    mchc: ["mchc", "chcm", "concentracion hemoglobina corpuscular media"],
    eritrocitos: ["eritrocitos", "globulos rojos", "glóbulos rojos", "rbc", "hematies", "hematíes"],
    // Inflamación / proteínas
    pcr: ["pcr", "proteina c reactiva", "proteína c reactiva", "pcr cuantitativa", "pcr ultrasensible"],
    vhs: ["vhs", "velocidad de eritrosedimentacion", "velocidad de sedimentacion", "eritrosedimentacion"],
    proteinas_totales: ["proteinas totales", "proteínas totales", "ptot"],
    albumina: ["albumina", "albúmina", "albumina serica", "albúmina sérica"],
    globulinas: ["globulinas"],
    // Hepático adicional
    bilirrubina_directa: ["bilirrubina directa", "bili directa", "bilirrubina conjugada"],
    bilirrubina_indirecta: ["bilirrubina indirecta", "bili indirecta", "bilirrubina no conjugada"],
    ldh: ["ldh", "lactato deshidrogenasa", "deshidrogenasa lactica"],
    amilasa: ["amilasa", "amilasa serica"],
    lipasa: ["lipasa"],
    // Cardiacos
    troponina: ["troponina", "troponina i", "troponina t", "trop i", "trop t"],
    ck: ["ck", "creatin kinasa", "creatinquinasa", "cpk"],
    ckmb: ["ckmb", "ck mb", "ck-mb", "creatin kinasa mb"],
    nt_probnp: ["nt probnp", "nt-probnp", "ntprobnp", "bnp"],
    // Tiroideos extra
    t3: ["t3 total", "triiodotironina", "t3"],
    t3_libre: ["t3 libre", "triiodotironina libre"],
    anti_tpo: ["anti tpo", "anti-tpo", "anticuerpos antiperoxidasa", "antitiroperoxidasa"],
    // Orina química
    cuerpos_cetonicos: ["cuerpos cetonicos", "cuerpos cetónicos", "cetonas", "ketonas"],
    proteina_orina: ["proteina", "proteína", "proteinuria", "proteinas en orina"],
    glucosa_orina: ["glucosa orina", "glucosuria"],
    sangre_orina: ["sangre", "hemoglobina orina", "hematuria"],
    nitritos: ["nitritos"],
    leucocitos_orina: ["leucocitos orina", "leucocituria"],
    densidad_orina: ["densidad", "densidad urinaria"],
    ph_orina: ["ph", "ph orina"],
    bacterias: ["bacterias"],
    piocitos: ["piocitos"],
    urobilinogeno: ["urobilinogeno", "urobilinógeno", "urobilinogeno mg dl"],
    bilirrubina_orina: ["bilirrubina orina", "bilirrubinuria"],
    // Embarazo / metabólicos
    bhcg: ["bhcg", "b hcg", "beta hcg", "subunidad beta hcg"],
    psa: ["psa", "antigeno prostatico especifico", "antígeno prostático específico"],
  };

  // =====================================================================
  // Rangos clínicos plausibles por analito (min, max INCLUSIVOS).
  // Sirven como GUARD-RAIL: si el valor numérico parseado del lab cae fuera
  // de este rango "biológicamente posible", asumimos que el match fue erróneo
  // (p. ej. la fila era una RAZÓN/INDICE, no el analito) y reintentamos con
  // el siguiente mejor candidato.
  //
  // Los rangos son AMPLIOS (no rangos de "normalidad", sino de "posible en
  // un humano vivo"), justamente para tolerar valores patológicos extremos
  // sin generar falsos rechazos.
  // =====================================================================
  const ANALYTE_RANGES = {
    glicemia:           { min: 20,    max: 1500,  unit: "mg/dL" },
    creatinina:         { min: 0.1,   max: 25,    unit: "mg/dL" },
    vfg:                { min: 1,     max: 200,   unit: "mL/min/1.73m²" },
    urea:               { min: 5,     max: 400,   unit: "mg/dL" },
    bun:                { min: 2,     max: 200,   unit: "mg/dL" },
    acido_urico:        { min: 0.5,   max: 25,    unit: "mg/dL" },
    hemoglobina:        { min: 3,     max: 25,    unit: "g/dL" },
    hematocrito:        { min: 10,    max: 70,    unit: "%" },
    leucocitos:         { min: 0.1,   max: 500000, unit: "/µL ó miles/µL" },
    plaquetas:          { min: 1,     max: 1500000, unit: "/µL ó miles/µL" },
    vcm:                { min: 50,    max: 130,   unit: "fL" },
    hba1c:              { min: 3,     max: 20,    unit: "%" },
    colesterol_total:   { min: 50,    max: 800,   unit: "mg/dL" },
    ldl:                { min: 10,    max: 600,   unit: "mg/dL" },
    hdl:                { min: 5,     max: 200,   unit: "mg/dL" },
    vldl:               { min: 1,     max: 200,   unit: "mg/dL" },
    trigliceridos:      { min: 20,    max: 5000,  unit: "mg/dL" },
    rel_col_ldl_hdl:    { min: 0.3,   max: 15,    unit: "ratio" },
    tsh:                { min: 0.001, max: 200,   unit: "µUI/mL" },
    t4_libre:           { min: 0.1,   max: 10,    unit: "ng/dL" },
    got:                { min: 1,     max: 5000,  unit: "U/L" },
    gpt:                { min: 1,     max: 5000,  unit: "U/L" },
    ggt:                { min: 1,     max: 3000,  unit: "U/L" },
    fosfatasas_alcalinas:{ min: 10,   max: 3000,  unit: "U/L" },
    bilirrubina_total:  { min: 0.05,  max: 50,    unit: "mg/dL" },
    sodio:              { min: 100,   max: 180,   unit: "mEq/L" },
    potasio:            { min: 1.5,   max: 9,     unit: "mEq/L" },
    cloro:              { min: 70,    max: 140,   unit: "mEq/L" },
    calcio:             { min: 4,     max: 18,    unit: "mg/dL" },
    magnesio:           { min: 0.5,   max: 6,     unit: "mg/dL" },
    fosforo:            { min: 0.5,   max: 15,    unit: "mg/dL" },
    microalbuminuria:   { min: 0,     max: 5000,  unit: "mg/L" },
    rac:                { min: 0,     max: 10000, unit: "mg/g" },
    vitamina_d:         { min: 1,     max: 200,   unit: "ng/mL" },
    vitamina_b12:       { min: 50,    max: 5000,  unit: "pg/mL" },
    ferritina:          { min: 1,     max: 10000, unit: "ng/mL" },
    fierro:             { min: 5,     max: 600,   unit: "µg/dL" },
    saturacion_transferrina: { min: 1, max: 100,  unit: "%" },
    transferrina:       { min: 50,    max: 600,   unit: "mg/dL" },
    tibc:               { min: 100,   max: 700,   unit: "µg/dL" },
    tiempo_protrombina: { min: 5,     max: 120,   unit: "seg" },
    inr:                { min: 0.5,   max: 12,    unit: "" },
    ttpa:               { min: 15,    max: 200,   unit: "seg" },
    neutrofilos:        { min: 0.1,   max: 100,   unit: "% ó miles/µL" },
    linfocitos:         { min: 0.1,   max: 100,   unit: "% ó miles/µL" },
    monocitos:          { min: 0.1,   max: 100,   unit: "% ó miles/µL" },
    eosinofilos:        { min: 0,     max: 100,   unit: "% ó miles/µL" },
    basofilos:          { min: 0,     max: 100,   unit: "% ó miles/µL" },
    rdw:                { min: 8,     max: 35,    unit: "%" },
    mch:                { min: 15,    max: 45,    unit: "pg" },
    mchc:               { min: 25,    max: 40,    unit: "g/dL" },
    eritrocitos:        { min: 1,     max: 8,     unit: "millones/µL" },
    pcr:                { min: 0,     max: 600,   unit: "mg/L" },
    vhs:                { min: 0,     max: 200,   unit: "mm/h" },
    proteinas_totales:  { min: 2,     max: 12,    unit: "g/dL" },
    albumina:           { min: 1,     max: 6,     unit: "g/dL" },
    globulinas:         { min: 1,     max: 8,     unit: "g/dL" },
    bilirrubina_directa:{ min: 0,     max: 30,    unit: "mg/dL" },
    bilirrubina_indirecta:{ min: 0,   max: 30,    unit: "mg/dL" },
    ldh:                { min: 50,    max: 5000,  unit: "U/L" },
    amilasa:            { min: 5,     max: 3000,  unit: "U/L" },
    lipasa:             { min: 5,     max: 5000,  unit: "U/L" },
    troponina:          { min: 0,     max: 100,   unit: "ng/mL" },
    ck:                 { min: 10,    max: 50000, unit: "U/L" },
    ckmb:               { min: 0,     max: 500,   unit: "ng/mL ó U/L" },
    nt_probnp:          { min: 0,     max: 50000, unit: "pg/mL" },
    t3:                 { min: 0.1,   max: 10,    unit: "ng/mL" },
    t3_libre:           { min: 0.5,   max: 30,    unit: "pg/mL" },
    anti_tpo:           { min: 0,     max: 5000,  unit: "UI/mL" },
    densidad_orina:     { min: 1.0,   max: 1.05,  unit: "" },
    ph_orina:           { min: 4,     max: 9,     unit: "" },
    bhcg:               { min: 0,     max: 500000, unit: "mUI/mL" },
    psa:                { min: 0,     max: 1000,  unit: "ng/mL" },
  };

  const parseNumeric = (value) => window.__AR_UTILS.parseNumeric(value);

  // Devuelve { ok, num, range } — si no hay rango definido para el analito,
  // SIEMPRE devuelve ok:true (no penalizamos analitos sin rango configurado).
  // Si el valor no es numérico (texto tipo "Negativo", "Abundante"), también
  // ok:true porque no podemos comparar.
  function isValueInRange(key, rawValue) {
    const range = ANALYTE_RANGES[key];
    if (!range) return { ok: true, num: null, range: null };
    const num = parseNumeric(rawValue);
    if (num == null) return { ok: true, num: null, range };
    const ok = num >= range.min && num <= range.max;
    return { ok, num, range };
  }

  function normalizeName(raw) {
    if (!raw) return "";
    let s = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\(.*?\)/g, " ");
    // Colapsar siglas separadas por puntos: "t.s.h." → "tsh", "h.d.l." → "hdl"
    s = s.replace(/\b([a-z])\.([a-z])\.(?:([a-z])\.?)?(?:([a-z])\.?)?/g, "$1$2$3$4");
    return s
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchAnalyte(rawName) {
    const n = normalizeName(rawName);
    if (!n) return null;
    // Reglas duras de desambiguación: si menciona "relacion/ratio/indice" + ldl + hdl
    // (o col/colesterol con ldl/hdl en cualquier orden), es la relación, NO ldl ni hdl.
    const hasLdl = /\bldl\b/.test(n);
    const hasHdl = /\bhdl\b/.test(n);
    const hasRatioWord = /\b(relacion|ratio|indice|rel)\b/.test(n) || /\bcol(esterol)?\b.*\bldl\b.*\bhdl\b/.test(n) || /\bcol(esterol)?\b.*\bhdl\b.*\bldl\b/.test(n);
    if (hasLdl && hasHdl && hasRatioWord) return "rel_col_ldl_hdl";

    let best = null;
    for (const [key, aliases] of Object.entries(ANALYTE_DICT)) {
      for (const alias of aliases) {
        if (n === alias) return key;
        const m = aliasMatches(n, alias);
        if (m.ok && (!best || alias.length > best.aliasLen)) {
          best = { key, aliasLen: alias.length };
        }
      }
    }
    return best?.key || null;
  }

  // Aliases que SÓLO pueden hacer match como palabra completa (no por includes
  // dentro de otras palabras), para evitar falsos positivos como "na" dentro de
  // "hormoNA tiroestimulante" → sodio. Aplica a alias muy cortos o ambiguos.
  const STRICT_WORD_ALIASES = new Set([
    "na","k","cl","ca","mg","fe","p","hb","tg","ck","tp","ldh",
    "got","gpt","ggt","fal","bun","tsh","ldl","hdl","vfg","rdw",
    "mch","mchc","vcm","wbc","rbc","hto","hct","plt","inr","psa",
    "ph","t3","t4","t4l","b12","tibc","bnp","ast","alt","cpk",
    "hgb","hgt","a1c","tp","ptt","kptt","aptt","ttpa","fal","vldl",
    "rac","eos","baso","mono","linf","neut","trop","trop i","trop t","ckmb","ck-mb",
  ]);

  function aliasMatches(n, alias) {
    if (n === alias) return { ok: true, kind: "exact" };
    const isStrict = STRICT_WORD_ALIASES.has(alias) || alias.length <= 3;
    if (isStrict) {
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`);
      return re.test(n) ? { ok: true, kind: "word" } : { ok: false };
    }
    return n.includes(alias) ? { ok: true, kind: "includes" } : { ok: false };
  }

  // Devuelve TODOS los candidatos plausibles (orden: mejor → peor) para que
  // el motor de auto-relleno pueda reintentar con el siguiente si el valor
  // del primer candidato cae fuera de rango clínico.
  // Cada item: { key, alias, rule, score }.
  function matchAnalyteCandidates(rawName) {
    const n = normalizeName(rawName);
    if (!n) return [];
    const out = [];
    const seen = new Set();
    const push = (key, alias, rule, score) => {
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ key, alias, rule, score });
    };

    // 1. Regla dura LDL+HDL+rel → relación (máxima prioridad)
    const hasLdl = /\bldl\b/.test(n);
    const hasHdl = /\bhdl\b/.test(n);
    const hasRatioWord =
      /\b(relacion|ratio|indice|rel)\b/.test(n) ||
      /\bcol(esterol)?\b.*\bldl\b.*\bhdl\b/.test(n) ||
      /\bcol(esterol)?\b.*\bhdl\b.*\bldl\b/.test(n);
    if (hasLdl && hasHdl && hasRatioWord) push("rel_col_ldl_hdl", "(regla LDL+HDL+rel)", "regla-ratio", 10000);

    // 2. Coincidencia exacta de alias
    for (const [key, aliases] of Object.entries(ANALYTE_DICT)) {
      for (const alias of aliases) {
        if (n === alias) push(key, alias, "exact", 1000 + alias.length);
      }
    }

    // 3. Coincidencia parcial — usa aliasMatches (word-boundary para alias cortos)
    const partial = [];
    for (const [key, aliases] of Object.entries(ANALYTE_DICT)) {
      if (seen.has(key)) continue;
      let bestAlias = null;
      let bestKind = null;
      for (const alias of aliases) {
        const m = aliasMatches(n, alias);
        if (!m.ok) continue;
        if (!bestAlias || alias.length > bestAlias.length) {
          bestAlias = alias;
          bestKind = m.kind;
        }
      }
      if (bestAlias) partial.push({ key, alias: bestAlias, score: bestAlias.length, kind: bestKind });
    }
    partial.sort((a, b) => b.score - a.score);
    for (const p of partial) push(p.key, p.alias, p.kind === "word" ? "word" : "includes", p.score);

    return out;
  }

  // Versión "verbose" para debug: devuelve también el alias coincidente y la regla aplicada.
  function matchAnalyteVerbose(rawName) {
    const n = normalizeName(rawName);
    if (!n) return { key: null, alias: null, rule: "vacío", normalized: n };
    const hasLdl = /\bldl\b/.test(n);
    const hasHdl = /\bhdl\b/.test(n);
    const hasRatioWord =
      /\b(relacion|ratio|indice|rel)\b/.test(n) ||
      /\bcol(esterol)?\b.*\bldl\b.*\bhdl\b/.test(n) ||
      /\bcol(esterol)?\b.*\bhdl\b.*\bldl\b/.test(n);
    if (hasLdl && hasHdl && hasRatioWord) {
      return { key: "rel_col_ldl_hdl", alias: "(regla LDL+HDL+rel)", rule: "regla-ratio", normalized: n };
    }
    let best = null;
    for (const [key, aliases] of Object.entries(ANALYTE_DICT)) {
      for (const alias of aliases) {
        if (n === alias) return { key, alias, rule: "exact", normalized: n };
        if (n.includes(alias) && (!best || alias.length > best.alias.length)) {
          best = { key, alias };
        }
      }
    }
    if (best) return { ...best, rule: "includes (más largo)", normalized: n };
    return { key: null, alias: null, rule: "sin coincidencia", normalized: n };
  }
  // =====================================================================
  // Storage helpers
  // =====================================================================
  async function getTemplates() {
    const data = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    return data[STORAGE_KEY] || [];
  }
  async function setTemplates(list) {
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  }
  async function getFlows() {
    const data = await chrome.storage.local.get({ [FLOWS_KEY]: [] });
    const raw = data[FLOWS_KEY] || [];
    // Migración silenciosa v0.8 → v0.9 (FlowTemplate con samples + template)
    if (window.__AR_LEARN && raw.length) {
      let migrated = false;
      const out = raw.map((f) => {
        if (!f.template || !Array.isArray(f.samples)) {
          migrated = true;
          return window.__AR_LEARN.migrate(f);
        }
        return f;
      });
      if (migrated) {
        try { await chrome.storage.local.set({ [FLOWS_KEY]: out }); } catch {}
      }
      return out;
    }
    return raw;
  }
  async function setFlows(list) {
    await chrome.storage.local.set({ [FLOWS_KEY]: list });
  }
  const getLabSession = () => window.__AR_LAB_SESSION.get();
  const setLabSession = (data) => {
    window.__AR_LAB_SESSION.set(data);
    try { document.dispatchEvent(new CustomEvent("ar:lab-session-updated", { detail: data })); } catch {}
  };
  function getRecState() {
    try { return JSON.parse(sessionStorage.getItem(REC_SESSION_KEY) || "null"); }
    catch { return null; }
  }
  function setRecState(s) {
    if (s) sessionStorage.setItem(REC_SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(REC_SESSION_KEY);
  }

  // =====================================================================
  // Selector + form capture
  // =====================================================================
  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
    const path = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && path.length < 6) {
      let part = node.tagName.toLowerCase();
      if (node.classList.length) {
        part += "." + Array.from(node.classList).slice(0, 2).map(CSS.escape).join(".");
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(part);
      node = node.parentElement;
    }
    return path.join(" > ");
  }

  function captureFields(root = document) {
    const inputs = root.querySelectorAll("input, select, textarea");
    const fields = [];
    inputs.forEach((el) => {
      if (el.disabled || el.type === "hidden" || el.type === "submit" || el.type === "button") return;
      const sel = cssPath(el);
      let value;
      if (el.type === "checkbox" || el.type === "radio") value = el.checked;
      else value = el.value;
      if (value === "" || value === false || value == null) return;
      const labelEl =
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
        el.closest("label");
      fields.push({
        selector: sel,
        type: el.type || el.tagName.toLowerCase(),
        label: labelEl ? labelEl.innerText.trim().slice(0, 80) : el.name || el.id || "",
        value,
      });
    });
    return fields;
  }

  // =====================================================================
  // Apply template (con resolución de placeholders)
  // =====================================================================
  const setNativeValue = (el, value) => window.__AR_UTILS.setNativeValue(el, value);

  /**
   * MOTOR DE PLANTILLAS INTELIGENTES
   *
   * Sintaxis soportada:
   *   {{lab.<analito>[.value|.unit|.fecha|.range]}}   ← placeholder simple (legacy)
   *   {{if <expr>}}...{{elseif <expr>}}...{{else}}...{{/if}}
   *   Operadores en <expr>: > >= < <= == != && || !
   *   Operandos: números (3.14), strings ("texto" ó 'texto'),
   *              referencias lab (lab.hba1c, lab.hba1c.value, lab.hba1c.unit, lab.hba1c.fecha),
   *              funciones: present(lab.x), missing(lab.x), num(lab.x)
   *   Booleanos implícitos: present(lab.x) cuando se usa "lab.x" en una condición sin operador.
   *
   * Ejemplos:
   *   {{if lab.hba1c.value > 7}}Mal control glicémico (HbA1c {{lab.hba1c.value}}%).{{else}}Buen control.{{/if}}
   *   {{if lab.ldl.value > 100 && lab.hdl.value < 40}}Dislipidemia mixta.{{/if}}
   *   {{if missing(lab.creatinina)}}Solicitar creatinina.{{else}}VFG: {{lab.vfg}}.{{/if}}
   *
   * Devuelve { text, missing[], errors[] }.
   */

  // --- Tokenizer/parser/evaluador de expresiones (NO usa eval, todo whitelist) ---
  function tokenizeExpr(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      // Strings con comillas
      if (c === '"' || c === "'") {
        const q = c; let j = i + 1; let s = "";
        while (j < src.length && src[j] !== q) { s += src[j++]; }
        toks.push({ t: "str", v: s }); i = j + 1; continue;
      }
      // Números
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
        toks.push({ t: "num", v: parseFloat(src.slice(i, j)) }); i = j; continue;
      }
      // Operadores compuestos
      const two = src.slice(i, i + 2);
      if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
        toks.push({ t: "op", v: two }); i += 2; continue;
      }
      if ("()<>!".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
      // Identificadores: lab.hba1c.value, present, missing, num, true, false, null
      if (/[a-zA-Z_]/.test(c)) {
        let j = i; while (j < src.length && /[a-zA-Z0-9_.]/.test(src[j])) j++;
        const word = src.slice(i, j);
        if (word === "true") toks.push({ t: "bool", v: true });
        else if (word === "false") toks.push({ t: "bool", v: false });
        else if (word === "null") toks.push({ t: "null" });
        else toks.push({ t: "id", v: word });
        i = j; continue;
      }
      throw new Error(`Token inesperado en expresión: "${c}"`);
    }
    return toks;
  }

  // Parser recursivo descendente para precedencias: || -> && -> comparación -> unario -> primario
  function parseExpr(toks) {
    let p = 0;
    const peek = () => toks[p];
    const eat = (v) => {
      const t = toks[p];
      if (!t) throw new Error("Fin de expresión inesperado");
      if (v && (t.v !== v)) throw new Error(`Esperaba "${v}", obtuve "${t.v}"`);
      p++; return t;
    };
    function parseOr() {
      let left = parseAnd();
      while (peek() && peek().v === "||") { eat(); const right = parseAnd(); left = { type: "or", left, right }; }
      return left;
    }
    function parseAnd() {
      let left = parseCmp();
      while (peek() && peek().v === "&&") { eat(); const right = parseCmp(); left = { type: "and", left, right }; }
      return left;
    }
    function parseCmp() {
      let left = parseUnary();
      const t = peek();
      if (t && ["==", "!=", ">", ">=", "<", "<="].includes(t.v)) {
        eat(); const right = parseUnary();
        return { type: "cmp", op: t.v, left, right };
      }
      return left;
    }
    function parseUnary() {
      const t = peek();
      if (t && t.v === "!") { eat(); return { type: "not", expr: parseUnary() }; }
      return parsePrimary();
    }
    function parsePrimary() {
      const t = peek();
      if (!t) throw new Error("Expresión vacía");
      if (t.v === "(") { eat(); const e = parseOr(); eat(")"); return e; }
      if (t.t === "num" || t.t === "str" || t.t === "bool") { eat(); return { type: "lit", value: t.v }; }
      if (t.t === "null") { eat(); return { type: "lit", value: null }; }
      if (t.t === "id") {
        eat();
        // ¿Llamada a función? present(lab.x), missing(lab.x), num(lab.x)
        if (peek() && peek().v === "(") {
          eat();
          const args = [];
          if (peek() && peek().v !== ")") {
            args.push(parseOr());
            while (peek() && peek().v === ",") { eat(); args.push(parseOr()); }
          }
          eat(")");
          return { type: "call", name: t.v, args };
        }
        return { type: "ref", path: t.v };
      }
      throw new Error(`Token inesperado: ${JSON.stringify(t)}`);
    }
    const ast = parseOr();
    if (p < toks.length) throw new Error(`Sobran tokens al final: ${JSON.stringify(toks.slice(p))}`);
    return ast;
  }

  // Resolución de "lab.<analito>[.attr]" sobre la sesión de lab.
  // Devuelve un valor primitivo: number si es numérico, string si no, o undefined si falta.
  function resolveLabRef(path, lab) {
    const parts = path.split(".");
    if (parts[0] !== "lab") return undefined;
    const key = (parts[1] || "").toLowerCase();
    const attr = (parts[2] || "value").toLowerCase();
    const item = lab && lab.analytes && lab.analytes[key];
    if (!item) return undefined;
    if (attr === "unit") return item.unit || "";
    if (attr === "fecha") return item.date || (lab && lab.date) || "";
    if (attr === "range") return item.range || "";
    // value: intentar número, fallback string
    const raw = item.value;
    if (raw == null) return undefined;
    const n = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(n) && /^-?[\d.,]+$/.test(String(raw).trim()) ? n : String(raw);
  }

  function evalAst(ast, lab, missing) {
    switch (ast.type) {
      case "lit": return ast.value;
      case "ref": {
        const v = resolveLabRef(ast.path, lab);
        if (v === undefined) {
          const k = ast.path.split(".")[1];
          if (k) missing.add(k);
          return undefined;
        }
        return v;
      }
      case "call": {
        const argVals = ast.args.map((a) => {
          if (a.type === "ref") {
            // Para present/missing no marcamos como faltante
            if (ast.name === "present" || ast.name === "missing") {
              return resolveLabRef(a.path, lab);
            }
          }
          return evalAst(a, lab, missing);
        });
        if (ast.name === "present") return argVals[0] !== undefined && argVals[0] !== "" && argVals[0] !== null;
        if (ast.name === "missing") return argVals[0] === undefined || argVals[0] === "" || argVals[0] === null;
        if (ast.name === "num") {
          const x = argVals[0]; if (x == null) return NaN;
          const n = parseFloat(String(x).replace(",", ".")); return Number.isFinite(n) ? n : NaN;
        }
        throw new Error(`Función desconocida: ${ast.name}`);
      }
      case "not": return !evalAst(ast.expr, lab, missing);
      case "and": return !!(evalAst(ast.left, lab, missing) && evalAst(ast.right, lab, missing));
      case "or":  return !!(evalAst(ast.left, lab, missing) || evalAst(ast.right, lab, missing));
      case "cmp": {
        const L = evalAst(ast.left, lab, missing);
        const R = evalAst(ast.right, lab, missing);
        // Si alguno es undefined, una comparación numérica falla limpiamente
        if (L === undefined || R === undefined) {
          if (ast.op === "==") return L === R;
          if (ast.op === "!=") return L !== R;
          return false;
        }
        switch (ast.op) {
          case "==": return L == R;          // eslint-disable-line eqeqeq
          case "!=": return L != R;          // eslint-disable-line eqeqeq
          case ">":  return Number(L) >  Number(R);
          case ">=": return Number(L) >= Number(R);
          case "<":  return Number(L) <  Number(R);
          case "<=": return Number(L) <= Number(R);
        }
        return false;
      }
    }
    return undefined;
  }

  function evalCondition(exprStr, lab, missing, errors) {
    try {
      const toks = tokenizeExpr(exprStr);
      const ast = parseExpr(toks);
      return !!evalAst(ast, lab, missing);
    } catch (err) {
      errors.push(`Expresión inválida: "${exprStr}" — ${err.message}`);
      return false;
    }
  }

  // Procesa los bloques {{if}}/{{elseif}}/{{else}}/{{/if}} (anidamiento simple).
  // Estrategia: encontrar el {{if}} más interno (sin otros if dentro entre él y su {{/if}}),
  // resolverlo, y repetir hasta que no queden bloques.
  function processConditionals(text, lab, missing, errors) {
    const TAG = /\{\{\s*(if|elseif|else|\/if)\b\s*([^}]*?)\s*\}\}/gi;
    let safety = 0;
    while (text.includes("{{if") || /\{\{\s*if\b/i.test(text)) {
      if (++safety > 200) { errors.push("Loop de condicionales abortado (>200 iter)"); break; }

      // Buscar todas las etiquetas y localizar un {{if}} cuyo cierre {{/if}} no contenga otro {{if}} entre medio.
      const tags = [];
      TAG.lastIndex = 0;
      let m;
      while ((m = TAG.exec(text)) !== null) {
        tags.push({ kind: m[1].toLowerCase(), expr: m[2] || "", start: m.index, end: m.index + m[0].length });
      }
      if (!tags.length) break;

      // Encontrar el último {{if}} antes de su {{/if}} → es el más interno
      let openIdx = -1, closeIdx = -1, depth = 0;
      for (let k = 0; k < tags.length; k++) {
        const t = tags[k];
        if (t.kind === "if") { openIdx = k; depth = 1; }
        else if (t.kind === "/if" && openIdx >= 0) { closeIdx = k; break; }
      }
      // Mejor: recorrer y para cada /if buscar su if más cercano hacia atrás sin if intermedio sin cerrar
      openIdx = -1; closeIdx = -1;
      const stack = [];
      for (let k = 0; k < tags.length; k++) {
        if (tags[k].kind === "if") stack.push(k);
        else if (tags[k].kind === "/if") {
          if (!stack.length) { errors.push("{{/if}} sin {{if}} previo"); break; }
          const lastOpen = stack.pop();
          // Si entre lastOpen y k no hay otro {{if}}, es el más interno
          let hasNested = false;
          for (let j = lastOpen + 1; j < k; j++) if (tags[j].kind === "if") { hasNested = true; break; }
          if (!hasNested) { openIdx = lastOpen; closeIdx = k; break; }
        }
      }
      if (openIdx < 0 || closeIdx < 0) {
        if (stack.length) errors.push(`{{if}} sin {{/if}} (${stack.length})`);
        break;
      }

      // Recolectar ramas: if(expr) → contenido → [elseif(expr) → contenido]* → [else → contenido]?
      const ifTag = tags[openIdx];
      const closeTag = tags[closeIdx];
      const branches = [{ expr: ifTag.expr, contentStart: ifTag.end, contentEnd: closeTag.start, isElse: false }];
      for (let k = openIdx + 1; k < closeIdx; k++) {
        const t = tags[k];
        if (t.kind === "elseif" || t.kind === "else") {
          branches[branches.length - 1].contentEnd = t.start;
          branches.push({ expr: t.kind === "elseif" ? t.expr : "", contentStart: t.end, contentEnd: closeTag.start, isElse: t.kind === "else" });
        }
      }

      // Evaluar ramas
      let chosen = "";
      for (const b of branches) {
        const cond = b.isElse ? true : evalCondition(b.expr, lab, missing, errors);
        if (cond) { chosen = text.slice(b.contentStart, b.contentEnd); break; }
      }

      text = text.slice(0, ifTag.start) + chosen + text.slice(closeTag.end);
    }
    return text;
  }

  /**
   * Reemplaza {{lab.<analito>[.value|.unit|.fecha|.range]}} por valores reales del lab.
   * Si no hay valor, deja [?<analito>?] para revisión manual.
   * Devuelve { text, missing[], errors[] }.
   */
  function resolvePlaceholders(text) {
    if (typeof text !== "string" || text.indexOf("{{") === -1) return { text, missing: [], errors: [] };
    const lab = getLabSession();
    const missing = new Set();
    const errors = [];

    // 1. Procesar condicionales primero
    let out = processConditionals(text, lab, missing, errors);

    // 2. Reemplazar placeholders simples
    out = out.replace(/\{\{\s*lab\.([a-z0-9_]+)(?:\.(value|unit|fecha|range))?\s*\}\}/gi, (m, key, attr) => {
      const item = lab && lab.analytes && lab.analytes[key.toLowerCase()];
      if (!item) { missing.add(key); return `[?${key}?]`; }
      if (!attr || attr === "value") return item.value + (item.unit ? " " + item.unit : "");
      if (attr === "unit") return item.unit || "";
      if (attr === "fecha") return item.date || (lab && lab.date) || "";
      if (attr === "range") return item.range || "";
      return m;
    });

    return { text: out, missing: [...missing], errors };
  }

  function applyTemplate(tpl) {
    let applied = 0, missed = 0, missingPh = new Set();
    for (const f of tpl.fields || []) {
      let el;
      try { el = document.querySelector(f.selector); } catch { el = null; }
      if (!el) { missed++; continue; }
      let value = f.value;
      if (typeof value === "string") {
        const { text, missing } = resolvePlaceholders(value);
        value = text;
        missing.forEach((m) => missingPh.add(m));
      }
      if (f.type === "checkbox" || f.type === "radio") {
        el.checked = !!value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (el.tagName === "SELECT") {
        setNativeValue(el, value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.focus();
        setNativeValue(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.blur();
      }
      applied++;
    }
    let msg = `Plantilla aplicada: ${applied} campo(s)`;
    if (missed) msg += ` · ${missed} selector(es) no encontrado(s)`;
    if (missingPh.size) msg += ` · falta lab: ${[...missingPh].join(", ")}`;
    toast(msg);
  }

  // =====================================================================
  // Lab extractor
  // =====================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findFlaskIcon() {
    return (
      document.querySelector("i.fal.fa-flask") ||
      document.querySelector("i[class*='fa-flask']") ||
      document.querySelector("[title*='exámen' i], [title*='examen' i]")
    );
  }

  async function waitFor(predicate, { timeout = 4000, interval = 50 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = predicate();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  // Muestra un chooser para que el usuario pueda elegir entre extraer del
  // panel lateral de Rayen o subir un PDF de laboratorio externo. Se usa
  // siempre que exista una ficha abierta, de forma que la opción de PDF
  // quede disponible aunque ya haya analitos vigentes (no excluyente).
  function showLabChooser({ hasExisting }) {
    document.querySelectorAll(".ar-lab-choose-back").forEach((n) => n.remove());
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "ar-labpdf-back ar-lab-choose-back";
      back.innerHTML = `
        <div class="ar-labpdf-card" role="dialog" aria-modal="true" aria-label="Origen del laboratorio" style="max-width:520px">
          <div class="ar-labpdf-head">
            <b>🧪 ¿Cómo quieres cargar el laboratorio?</b>
            <button class="ar-labpdf-x" type="button" title="Cerrar">✕</button>
          </div>
          <div class="ar-labpdf-body">
            <p class="ar-labpdf-help" style="margin-bottom:10px">
              Puedes extraer los exámenes desde el panel lateral de la ficha o subir un PDF de laboratorio externo.
              ${hasExisting ? "<br><b>Ya hay un laboratorio cargado en esta sesión</b> — subir un PDF lo reemplazará." : ""}
            </p>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button type="button" class="ar-lab-choose-panel" style="padding:10px 12px;text-align:left;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer">
                <b>📋 Extraer del panel de la ficha</b><br>
                <span style="color:#475569;font-size:12px">Lee los exámenes vigentes mostrados por Rayen.</span>
              </button>
              <button type="button" class="ar-lab-choose-pdf" style="padding:10px 12px;text-align:left;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer">
                <b>📄 Subir PDF de laboratorio</b><br>
                <span style="color:#475569;font-size:12px">Arrastra el informe o elige el archivo. Se procesa localmente.</span>
              </button>
              ${hasExisting ? `
                <button type="button" class="ar-lab-choose-summary" style="padding:10px 12px;text-align:left;border:1px solid #cbd5e1;border-radius:8px;background:#eef2ff;cursor:pointer">
                  <b>📋 Ver resumen actual</b><br>
                  <span style="color:#475569;font-size:12px">Mostrar el resumen del laboratorio ya cargado.</span>
                </button>` : ""}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(back);
      const close = (v) => { back.remove(); resolve(v); };
      back.querySelector(".ar-labpdf-x").addEventListener("click", () => close(null));
      back.addEventListener("click", (e) => { if (e.target === back) close(null); });
      back.querySelector(".ar-lab-choose-panel").addEventListener("click", () => close("panel"));
      back.querySelector(".ar-lab-choose-pdf").addEventListener("click", () => close("pdf"));
      const sum = back.querySelector(".ar-lab-choose-summary");
      if (sum) sum.addEventListener("click", () => close("summary"));
    });
  }

  async function extractLab() {
    const flask = findFlaskIcon();
    const existing = getLabSession();
    const hasExisting = !!(existing && existing.analytes && Object.keys(existing.analytes).length);

    if (!flask) {
      // Sin ficha abierta: comportamiento standalone (resumen o uploader PDF).
      if (hasExisting && window.__AR_LAB_PDF && window.__AR_LAB_PDF.showSummary) {
        toast("Sin ficha · mostrando resumen del laboratorio cargado.");
        try { window.__AR_LAB_PDF.showSummary(buildLabSummary(existing)); } catch (e) { console.error(e); }
        return;
      }
      if (window.__AR_LAB_PDF) {
        toast("Sin ficha abierta · abriendo carga de PDF de laboratorio…");
        window.__AR_LAB_PDF.open();
      } else {
        toast("No encontré el icono de exámenes. Abre una ficha o usa 📄 PDF Lab.");
      }
      return;
    }

    // Con ficha abierta: ofrecer chooser (no excluyente). El usuario puede
    // subir un PDF aunque ya haya analitos en el panel.
    const choice = await showLabChooser({ hasExisting });
    if (!choice) return;
    if (choice === "pdf") {
      if (window.__AR_LAB_PDF) window.__AR_LAB_PDF.open();
      else toast("Módulo PDF no disponible.");
      return;
    }
    if (choice === "summary") {
      if (window.__AR_LAB_PDF && window.__AR_LAB_PDF.showSummary) {
        try { window.__AR_LAB_PDF.showSummary(buildLabSummary(existing)); } catch (e) { console.error(e); }
      }
      return;
    }
    // choice === "panel"

    toast("🧪 Abriendo panel de exámenes...");
    flask.click();
    const panelBody = await waitFor(
      () => document.querySelector("div.rounded-0.side-modal-body, .side-modal-body, [class*='side-modal-body']"),
      { timeout: 5000, interval: 60 },
    );
    if (!panelBody) {
      // El icono existe pero el panel no abrió: ofrecemos PDF como fallback.
      if (window.__AR_LAB_PDF) {
        toast("Panel no disponible · abriendo carga de PDF de laboratorio…");
        window.__AR_LAB_PDF.open();
      } else {
        toast("El panel de exámenes no se abrió.");
      }
      return;
    }

    // Expandir cada item-card en paralelo (antes era secuencial con 280ms entre cada uno)
    const expanders = panelBody.querySelectorAll(
      "i.fal.fa-plus-circle, i[class*='fa-plus-circle'], .item-card [class*='plus-circle']",
    );
    log("Expanders encontrados:", expanders.length);
    expanders.forEach((e) => { try { e.click(); } catch (_) {} });
    // Esperar a que aparezcan exam-containers (poll rápido) en lugar de un sleep ciego
    await waitFor(
      () => panelBody.querySelectorAll("div.exam-container, [class*='exam-container']").length > 0,
      { timeout: 1500, interval: 50 },
    );
    await sleep(120);

    // Parsear resultados
    const containers = panelBody.querySelectorAll(
      "div.exam-container, [class*='exam-container']",
    );
    log("Exam containers:", containers.length);

    const analytes = {};
    let latestDate = "";
    let latestDateSortable = "";
    // Convierte fecha dd-mm-yyyy / dd/mm/yyyy / yyyy-mm-dd a yyyymmdd para comparar.
    function toSortableDate(s) {
      if (!s) return "";
      const str = String(s).trim();
      let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) return m[3] + m[2].padStart(2, "0") + m[1].padStart(2, "0");
      m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m) return m[1] + m[2].padStart(2, "0") + m[3].padStart(2, "0");
      return "";
    }
    // Cargar overrides locales del CESFAM (aprendizaje del parser)
    const overrides = window.__AR_LAB_PARSER ? await window.__AR_LAB_PARSER.getOverrides() : {};
    const groups = panelBody.querySelectorAll(".item-card, [class*='item-card']");
    groups.forEach((group) => {
      const dateEl = group.querySelector(".exam-date, [class*='exam-date']");
      const solicitadoDate = dateEl ? dateEl.textContent.trim() : "";
      // Preferimos "Fecha de toma" sobre "Solicitado" — refleja cuándo se tomó la muestra.
      const date = extractTomaDate(group) || solicitadoDate;
      const sortable = toSortableDate(date);
      if (date && (!latestDateSortable || (sortable && sortable > latestDateSortable))) {
        latestDate = date;
        latestDateSortable = sortable || latestDateSortable;
      }
      const exams = group.querySelectorAll("div.exam-container, [class*='exam-container']");
      exams.forEach((ex) => {
        const get = (sel) => {
          const el = ex.querySelector(sel);
          return el ? el.textContent.trim() : "";
        };
        const findEl = (sel) => ex.querySelector(sel);
        const name = get("div.exam.exam-test span, [class*='exam-test'] span, [class*='exam-test']");
        const value = get("div.exam.exam-value span, [class*='exam-value'] span, [class*='exam-value']");
        const unit = get("div.exam.exam-unit span, [class*='exam-unit'] span, [class*='exam-unit']");
        const range = get("div.exam.exam-range span, [class*='exam-range'] span, [class*='exam-range']");
        // Fecha por examen: preferimos la "Fecha de toma" del grupo sobre exam-date.
        const rowDate = date || get("[class*='exam-date']");
        if (!name || !value) return;
        // Detectar flag visual (rojo / clases anormal/alto/bajo)
        const valueEl = findEl("div.exam.exam-value span, [class*='exam-value'] span, [class*='exam-value']");
        const flag = window.__AR_LAB_PARSER ? window.__AR_LAB_PARSER.detectFlag(valueEl) : null;
        // Parser robusto: usa overrides + diccionario con peso por unidad
        let key = null, subtype = null, qualifier = null;
        if (window.__AR_LAB_PARSER) {
          const parsed = window.__AR_LAB_PARSER.parseRow(
            { name, value, unit, range, date: rowDate, flag },
            ANALYTE_DICT,
            overrides,
          );
          if (parsed) {
            key = parsed.key;
            subtype = parsed.subtype;
            qualifier = parsed.qualifier;
          }
        }
        if (!key) key = matchAnalyte(name);
        if (!key) return;
        // Para glicemia: guardamos TODOS los subtipos (ayunas, postcarga_2h,
        // hgt, capilar, random) además de la entrada principal, para que el
        // motor de relleno pueda escoger según el label del formulario.
        // Subtipos válidos quedan en analytes[`glicemia.<subtype>`].
        // En caso de duplicidad de subtipo en la misma fecha, conservamos el
        // valor MÁS ALTO (criterio clínico: pesimismo en glicemia basal).
        const numericValue = parseNumeric(value);
        if (key === "glicemia" && subtype) {
          const subKey = `glicemia.${subtype}`;
          const prev = analytes[subKey];
          let keep = !prev;
          if (!keep && prev) {
            const sameOrNewer = !prev.date || !rowDate || rowDate >= prev.date;
            if (sameOrNewer) {
              const prevNum = parseNumeric(prev.value);
              keep = prevNum == null || (numericValue != null && numericValue > prevNum);
            }
          }
          if (keep) {
            analytes[subKey] = { rawName: name, value, unit, range, date: rowDate, subtype, qualifier, flag };
          }
        }
        // Para la entrada PRINCIPAL del analito: conservar el más reciente,
        // y en caso de empate de fecha conservar el más alto (sólo glicemia).
        if (analytes[key] && analytes[key].date && rowDate && rowDate < analytes[key].date) return;
        if (analytes[key] && key === "glicemia" && analytes[key].date === rowDate) {
          const prevNum = parseNumeric(analytes[key].value);
          if (prevNum != null && numericValue != null && numericValue <= prevNum) return;
        }
        analytes[key] = { rawName: name, value, unit, range, date: rowDate, subtype, qualifier, flag };
      });
    });

    const count = Object.keys(analytes).length;
    setLabSession({ analytes, date: latestDate, capturedAt: new Date().toISOString() });
    updateLabBadge();
    toast(`🧪 ${count} analito(s) extraído(s)${latestDate ? " (" + latestDate + ")" : ""}`);
    if (DEBUG) console.table(analytes);
    // Cerrar el panel lateral para liberar el formulario
    const closeBtn = document.querySelector(".side-modal-body .fa-times, [class*='side-modal'] [class*='close'], [class*='side-modal-header'] i.fal.fa-times");
    if (closeBtn) { try { closeBtn.click(); } catch (_) {} }
    // Esperar un poco a que el form vuelva a estar visible.
    // El relleno ocurre sólo cuando el médico hace click en "Rellenar form.".
    await sleep(150);
  }

  // Mapa de presentación: nombre limpio + unidad canónica + grupo + orden.
  const LAB_DISPLAY = {
    // Hemograma
    hematocrito:        { name: "Hematocrito",                unit: "%",            group: "Hemograma" },
    hemoglobina:        { name: "Hemoglobina",                unit: "gr/dl",        group: "Hemograma" },
    leucocitos:         { name: "Leucocitos",                 unit: "/µL",          group: "Hemograma" },
    plaquetas:          { name: "Plaquetas",                  unit: "/µL",          group: "Hemograma" },
    eritrocitos:        { name: "Eritrocitos",                unit: "millones/µL",  group: "Hemograma" },
    vcm:                { name: "VCM",                        unit: "fL",           group: "Hemograma" },
    mch:                { name: "HCM",                        unit: "pg",           group: "Hemograma" },
    mchc:               { name: "CHCM",                       unit: "g/dL",         group: "Hemograma" },
    rdw:                { name: "RDW",                        unit: "%",            group: "Hemograma" },
    neutrofilos:        { name: "Neutrófilos",                unit: "%",            group: "Hemograma" },
    linfocitos:         { name: "Linfocitos",                 unit: "%",            group: "Hemograma" },
    monocitos:          { name: "Monocitos",                  unit: "%",            group: "Hemograma" },
    eosinofilos:        { name: "Eosinófilos",                unit: "%",            group: "Hemograma" },
    basofilos:          { name: "Basófilos",                  unit: "%",            group: "Hemograma" },
    vhs:                { name: "VHS",                        unit: "mm/h",         group: "Hemograma" },
    // Orina completa
    sangre_orina:       { name: "Sangre",                     unit: "",             group: "Orina Completa" },
    urobilinogeno:      { name: "Urobilinógeno",              unit: "mg/dL",        group: "Orina Completa" },
    cuerpos_cetonicos:  { name: "Cuerpos Cetónicos",          unit: "mg/dL",        group: "Orina Completa" },
    proteina_orina:     { name: "Proteína",                   unit: "mg/dL",        group: "Orina Completa" },
    nitritos:           { name: "Nitritos",                   unit: "",             group: "Orina Completa" },
    glucosa_orina:      { name: "Glucosa orina",              unit: "mg/dL",        group: "Orina Completa" },
    bilirrubina_orina:  { name: "Bilirrubina",                unit: "",             group: "Orina Completa" },
    ph_orina:           { name: "pH",                         unit: "",             group: "Orina Completa" },
    densidad_orina:     { name: "Densidad",                   unit: "",             group: "Orina Completa" },
    eritrocitos_orina:  { name: "Eritrocitos",                unit: "x campo",      group: "Orina Completa" },
    leucocitos_orina:   { name: "Leucocitos",                 unit: "x campo",      group: "Orina Completa" },
    piocitos:           { name: "Piocitos",                   unit: "x campo",      group: "Orina Completa" },
    bacterias:          { name: "Bacterias",                  unit: "",             group: "Orina Completa" },
    // Perfil bioquímico
    acido_urico:        { name: "Ácido Úrico",                unit: "mg/dL",        group: "Perfil Bioquímico" },
    creatinina:         { name: "Creatinina",                 unit: "mg/dL",        group: "Perfil Bioquímico" },
    vfg:                { name: "Velocidad de Filtración Glomerular", unit: "mL/min/1.73m2", group: "Perfil Bioquímico" },
    bun:                { name: "Nitrógeno Ureico",           unit: "mg/dL",        group: "Perfil Bioquímico" },
    urea:               { name: "Uremia",                     unit: "mg/dL",        group: "Perfil Bioquímico" },
    microalbuminuria:   { name: "Microalbuminuria",           unit: "mg/L",         group: "Perfil Bioquímico" },
    rac:                { name: "R.A.C",                      unit: "mg/g",         group: "Perfil Bioquímico" },
    hba1c:              { name: "Hemoglobina Glicosilada",    unit: "%",            group: "Perfil Bioquímico" },
    glicemia:           { name: "Glicemia",                   unit: "mg/dL",        group: "Perfil Bioquímico" },
    calcio:             { name: "Calcio",                     unit: "mg/dL",        group: "Perfil Bioquímico" },
    magnesio:           { name: "Magnesio",                   unit: "mg/dL",        group: "Perfil Bioquímico" },
    fosforo:            { name: "Fósforo",                    unit: "mg/dL",        group: "Perfil Bioquímico" },
    proteinas_totales:  { name: "Proteínas Totales",          unit: "g/dL",         group: "Perfil Bioquímico" },
    albumina:           { name: "Albúmina",                   unit: "g/dL",         group: "Perfil Bioquímico" },
    globulinas:         { name: "Globulinas",                 unit: "g/dL",         group: "Perfil Bioquímico" },
    // Electrolitos
    sodio:              { name: "Sodio (Na)",                 unit: "mEq/L",        group: "Electrolitos plasmáticos" },
    potasio:            { name: "Potasio (K)",                unit: "mEq/L",        group: "Electrolitos plasmáticos" },
    cloro:              { name: "Cloro (Cl)",                 unit: "mEq/L",        group: "Electrolitos plasmáticos" },
    // Lipídico
    colesterol_total:   { name: "Colesterol Total",           unit: "mg/dL",        group: "Perfil Lipídico" },
    hdl:                { name: "HDL Colesterol",             unit: "mg/dL",        group: "Perfil Lipídico" },
    ldl:                { name: "LDL Colesterol",             unit: "mg/dL",        group: "Perfil Lipídico" },
    vldl:               { name: "VLDL Colesterol",            unit: "mg/dL",        group: "Perfil Lipídico" },
    trigliceridos:      { name: "Triglicéridos",              unit: "mg/dL",        group: "Perfil Lipídico" },
    rel_col_ldl_hdl:    { name: "Relación LDL/HDL",           unit: "",             group: "Perfil Lipídico" },
    // Tiroideo
    tsh:                { name: "TSH",                        unit: "uUI/ml",       group: "Perfil Tiroideo" },
    t4_libre:           { name: "T4 libre",                   unit: "ng/dL",        group: "Perfil Tiroideo" },
    t3:                 { name: "T3 total",                   unit: "ng/mL",        group: "Perfil Tiroideo" },
    t3_libre:           { name: "T3 libre",                   unit: "pg/mL",        group: "Perfil Tiroideo" },
    anti_tpo:           { name: "Anti-TPO",                   unit: "UI/mL",        group: "Perfil Tiroideo" },
    // Hepático
    got:                { name: "GOT (AST)",                  unit: "U/L",          group: "Perfil Hepático" },
    gpt:                { name: "GPT (ALT)",                  unit: "U/L",          group: "Perfil Hepático" },
    ggt:                { name: "GGT",                        unit: "U/L",          group: "Perfil Hepático" },
    fosfatasas_alcalinas:{ name: "Fosfatasas Alcalinas",      unit: "U/L",          group: "Perfil Hepático" },
    bilirrubina_total:  { name: "Bilirrubina Total",          unit: "mg/dL",        group: "Perfil Hepático" },
    bilirrubina_directa:{ name: "Bilirrubina Directa",        unit: "mg/dL",        group: "Perfil Hepático" },
    bilirrubina_indirecta:{ name: "Bilirrubina Indirecta",    unit: "mg/dL",        group: "Perfil Hepático" },
    ldh:                { name: "LDH",                        unit: "U/L",          group: "Perfil Hepático" },
    amilasa:            { name: "Amilasa",                    unit: "U/L",          group: "Perfil Hepático" },
    lipasa:             { name: "Lipasa",                     unit: "U/L",          group: "Perfil Hepático" },
    // Coagulación
    tiempo_protrombina: { name: "Tiempo de Protrombina",      unit: "seg",          group: "Coagulación" },
    inr:                { name: "INR",                        unit: "",             group: "Coagulación" },
    ttpa:               { name: "TTPA",                       unit: "seg",          group: "Coagulación" },
    // Cardíacos
    troponina:          { name: "Troponina",                  unit: "ng/mL",        group: "Marcadores Cardíacos" },
    ck:                 { name: "CK",                         unit: "U/L",          group: "Marcadores Cardíacos" },
    ckmb:               { name: "CK-MB",                      unit: "ng/mL",        group: "Marcadores Cardíacos" },
    nt_probnp:          { name: "NT-proBNP",                  unit: "pg/mL",        group: "Marcadores Cardíacos" },
    // Inflamación / hierro / vitaminas
    pcr:                { name: "PCR",                        unit: "mg/L",         group: "Inflamación" },
    ferritina:          { name: "Ferritina",                  unit: "ng/mL",        group: "Estudio de Hierro" },
    fierro:             { name: "Hierro sérico",              unit: "µg/dL",        group: "Estudio de Hierro" },
    transferrina:       { name: "Transferrina",               unit: "mg/dL",        group: "Estudio de Hierro" },
    saturacion_transferrina:{ name: "Saturación Transferrina",unit: "%",            group: "Estudio de Hierro" },
    tibc:               { name: "TIBC",                       unit: "µg/dL",        group: "Estudio de Hierro" },
    vitamina_d:         { name: "Vitamina D",                 unit: "ng/mL",        group: "Vitaminas" },
    vitamina_b12:       { name: "Vitamina B12",               unit: "pg/mL",        group: "Vitaminas" },
    bhcg:               { name: "β-HCG",                      unit: "mUI/mL",       group: "Otros" },
    psa:                { name: "PSA",                        unit: "ng/mL",        group: "Otros" },
  };
  const LAB_GROUP_ORDER_DEFAULT = [
    "Hemograma", "Orina Completa", "Urocultivo", "Perfil Bioquímico",
    "Electrolitos plasmáticos", "Perfil Lipídico", "Perfil Tiroideo",
    "Perfil Hepático", "Coagulación", "Marcadores Cardíacos",
    "Inflamación", "Estudio de Hierro", "Vitaminas", "Otros",
  ];
  const LAB_PROFILES_KEY = "ar.lab.profiles.v1"; // { overrides: { key: groupName }, order: [groupName,...] }

  // =====================================================================
  // 🚨 Umbrales clínicos críticos → modules/lab-critical.js
  const LAB_CRITICAL = window.__AR_LAB_CRITICAL.RULES;
  const evaluateCritical = (key, rawValue) => window.__AR_LAB_CRITICAL.evaluate(key, rawValue);
  const collectCriticalAlerts = (lab) => window.__AR_LAB_CRITICAL.collect(lab, LAB_DISPLAY);

  function getProfilesConfig() {
    try {
      const raw = localStorage.getItem(LAB_PROFILES_KEY);
      if (!raw) return { overrides: {}, order: LAB_GROUP_ORDER_DEFAULT.slice() };
      const obj = JSON.parse(raw);
      return {
        overrides: obj.overrides && typeof obj.overrides === "object" ? obj.overrides : {},
        order: Array.isArray(obj.order) && obj.order.length ? obj.order : LAB_GROUP_ORDER_DEFAULT.slice(),
      };
    } catch (_) {
      return { overrides: {}, order: LAB_GROUP_ORDER_DEFAULT.slice() };
    }
  }
  function setProfilesConfig(cfg) {
    try { localStorage.setItem(LAB_PROFILES_KEY, JSON.stringify(cfg)); } catch (_) {}
  }
  function resolveGroup(key) {
    const { overrides } = getProfilesConfig();
    if (overrides[key]) return overrides[key];
    return LAB_DISPLAY[key]?.group || "Otros";
  }
  function getGroupOrder() { return getProfilesConfig().order; }

  function buildLabSummary(lab) {
    const groups = new Map();
    for (const [key, a] of Object.entries(lab.analytes || {})) {
      // Saltar subtipos auxiliares (e.g. glicemia.ayunas) — ya está la entrada principal.
      if (key.includes(".")) continue;
      const disp = LAB_DISPLAY[key];
      const name = disp?.name || (a.rawName || key);
      const unit = disp?.unit || a.unit || "";
      const group = resolveGroup(key);
      const value = String(a.value ?? "").trim();
      if (!value) continue;
      // Si el valor es texto cualitativo (Negativo, Normal, etc.) y la unidad es numérica (mg/dL),
      // omitir la unidad para no decir "Negativo (mg/dL)".
      const qualitative = /^[a-záéíóúñ]/i.test(value) && !/\d/.test(value);
      const unitOut = qualitative && /(mg\/dL|mg\/L|g\/dL|µg\/dL|ng\/mL|pg\/mL|U\/L|mEq\/L|UI\/mL|mUI\/mL|mL\/min)/i.test(unit) ? "" : unit;
      const crit = evaluateCritical(key, value);
      const flag = crit ? (crit.severity === "critical" ? " 🔴" : " ⚠️") : "";
      const reason = crit ? `  ← ${crit.reason}` : "";
      const line = `- ${name}: ${value}${unitOut ? ` (${unitOut})` : ""}${flag}${reason}`;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(line);
    }
    const sections = [];
    const seen = new Set();
    for (const g of getGroupOrder()) {
      if (groups.has(g)) {
        sections.push(`${g}\n${groups.get(g).join("\n")}`);
        seen.add(g);
      }
    }
    for (const [g, lines] of groups) {
      if (!seen.has(g)) sections.push(`${g}\n${lines.join("\n")}`);
    }
    const header = `Lab Solicitado${lab.date ? " " + lab.date : ""}:`;
    return `${header}\n\n${sections.join("\n\n")}`;
  }

  function pasteLabRaw() {
    const lab = getLabSession();
    if (!lab || !lab.analytes || !Object.keys(lab.analytes).length) {
      toast("No hay lab extraído. Pulsa 🧪 Extraer primero.");
      return;
    }
    const summary = buildLabSummary(lab);
    let active = document.activeElement;
    if (!isEditable(active) || (active && active.closest && active.closest("#ar-fab-wrap, #ar-panel, #ar-modal"))) {
      active = lastEditableEl;
    }
    if (!isEditable(active)) {
      // Modo standalone: no hay campo activo (p.ej. el usuario subió un PDF
      // sin tener una ficha abierta). Mostramos un modal con el resumen para
      // copiar al portapapeles sin requerir contexto Rayen.
      if (window.__AR_LAB_PDF && window.__AR_LAB_PDF.showSummary) {
        window.__AR_LAB_PDF.showSummary(summary);
        return;
      }
      toast("Click en un campo de texto primero.");
      return;
    }
    try { active.focus(); } catch (_) {}
    if (active.isContentEditable) {
      const sep = active.textContent ? "\n\n" : "";
      active.textContent = (active.textContent || "") + sep + summary;
      active.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const sep = active.value ? "\n\n" : "";
      setNativeValue(active, (active.value || "") + sep + summary);
      active.dispatchEvent(new Event("input", { bubbles: true }));
      active.dispatchEvent(new Event("change", { bubbles: true }));
    }
    lastEditableEl = active;
  }

  // =====================================================================
  // Reporte PDF imprimible del laboratorio extraído
  // =====================================================================

  // =====================================================================
  // 📈 Evolución — extrae TODA la serie histórica (no sólo el más reciente)
  // y abre una ventana con curvas comparativas de los analitos repetidos.
  // =====================================================================
  function parseLabDate(s) {
    if (!s) return null;
    const t = String(s).trim();
    let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const d = +m[1], mo = +m[2] - 1;
      let y = +m[3]; if (y < 100) y += 2000;
      return new Date(y, mo, d);
    }
    m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(t);
    return isNaN(d) ? null : d;
  }

  async function setMonthsSelector(targetMonths) {
    const sel = document.querySelector("select.months-select, select[class*='months-select']");
    if (!sel) return false;
    const opt = Array.from(sel.options).find((o) => +o.value === targetMonths);
    if (!opt) return false;
    if (+sel.value === targetMonths) return true;
    sel.value = String(targetMonths);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(700);
    return true;
  }

  async function extractLabHistory() {
    toast("📈 Cargando historia (36 meses)...");
    const flask = findFlaskIcon();
    if (!flask) { toast("No encontré el icono de exámenes."); return null; }
    flask.click();
    const panelBody = await waitFor(
      () => document.querySelector(".side-modal-body, [class*='side-modal-body']"),
      { timeout: 5000, interval: 60 },
    );
    if (!panelBody) { toast("El panel de exámenes no se abrió."); return null; }

    await setMonthsSelector(36);
    await waitFor(
      () => panelBody.querySelectorAll(".item-card, [class*='item-card']").length > 0,
      { timeout: 4000, interval: 80 },
    );
    const expanders = panelBody.querySelectorAll(
      "i.fal.fa-plus-circle, i[class*='fa-plus-circle'], .item-card [class*='plus-circle']",
    );
    expanders.forEach((e) => { try { e.click(); } catch (_) {} });
    await waitFor(
      () => panelBody.querySelectorAll("div.exam-container, [class*='exam-container']").length > 0,
      { timeout: 2500, interval: 60 },
    );
    await sleep(300);

    const series = {};
    const overrides = window.__AR_LAB_PARSER ? await window.__AR_LAB_PARSER.getOverrides() : {};
    const groups = panelBody.querySelectorAll(".item-card, [class*='item-card']");
    groups.forEach((group) => {
      const dateEl = group.querySelector(".exam-date, [class*='exam-date']");
      const solicitadoDate = dateEl ? dateEl.textContent.trim() : "";
      const groupDate = extractTomaDate(group) || solicitadoDate;
      const exams = group.querySelectorAll("div.exam-container, [class*='exam-container']");
      exams.forEach((ex) => {
        const get = (sel) => { const el = ex.querySelector(sel); return el ? el.textContent.trim() : ""; };
        const name = get("div.exam.exam-test span, [class*='exam-test'] span, [class*='exam-test']");
        const value = get("div.exam.exam-value span, [class*='exam-value'] span, [class*='exam-value']");
        const unit = get("div.exam.exam-unit span, [class*='exam-unit'] span, [class*='exam-unit']");
        const range = get("div.exam.exam-range span, [class*='exam-range'] span, [class*='exam-range']");
        const rowDate = groupDate || get("[class*='exam-date']");
        if (!name || !value) return;
        let key = null;
        if (window.__AR_LAB_PARSER) {
          const p = window.__AR_LAB_PARSER.parseRow({ name, value, unit, range, date: rowDate }, ANALYTE_DICT, overrides);
          if (p) key = p.key;
        }
        if (!key) key = matchAnalyte(name);
        if (!key) return;
        const baseKey = key.split(".")[0];
        const num = parseNumeric(value);
        if (num == null) return;
        const d = parseLabDate(rowDate);
        if (!d) return;
        if (!series[baseKey]) {
          const disp = LAB_DISPLAY[baseKey];
          series[baseKey] = {
            name: disp?.name || name,
            unit: disp?.unit || unit || "",
            group: resolveGroup(baseKey),
            points: [],
          };
        }
        series[baseKey].points.push({ date: d, dateStr: rowDate, value: num });
      });
    });

    const closeBtn = document.querySelector(".side-modal-body .fa-times, [class*='side-modal'] [class*='close']");
    if (closeBtn) { try { closeBtn.click(); } catch (_) {} }

    const filtered = {};
    for (const [k, s] of Object.entries(series)) {
      const byDate = new Map();
      for (const p of s.points) {
        const key = p.date.toISOString().slice(0, 10);
        const prev = byDate.get(key);
        if (!prev || p.value > prev.value) byDate.set(key, p);
      }
      const pts = Array.from(byDate.values()).sort((a, b) => a.date - b.date);
      if (pts.length >= 2) filtered[k] = { ...s, points: pts };
    }
    return filtered;
  }

  async function showLabEvolution() {
    const series = await extractLabHistory();
    if (!series) return;
    const keys = Object.keys(series);
    if (!keys.length) {
      toast("No hay exámenes repetidos en los últimos 36 meses.");
      return;
    }
    const ctx = readContext();
    const byGroup = new Map();
    for (const k of keys) {
      const g = series[k].group || "Otros";
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(k);
    }
    const order = getGroupOrder();
    const orderedGroups = order.filter((g) => byGroup.has(g))
      .concat([...byGroup.keys()].filter((g) => !order.includes(g)));

    const COLORS = ["#0ea5e9","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];

    // Inline SVG chart renderer (sin dependencias externas, funciona en about:blank)
    function renderSvgChart(seriesList, colors) {
      const W = 900, H = 360;
      const M = { top: 18, right: 22, bottom: 42, left: 56 };
      const iw = W - M.left - M.right;
      const ih = H - M.top - M.bottom;
      let allX = [], allY = [];
      seriesList.forEach((s) => s.points.forEach((p) => { allX.push(p.date.getTime()); allY.push(p.value); }));
      if (!allX.length) return "";
      const xMin = Math.min(...allX), xMax = Math.max(...allX);
      let yMin = Math.min(...allY), yMax = Math.max(...allY);
      if (yMin === yMax) { yMin -= 1; yMax += 1; }
      const yPad = (yMax - yMin) * 0.1;
      yMin -= yPad; yMax += yPad;
      const xScale = (v) => M.left + (xMax === xMin ? iw / 2 : ((v - xMin) / (xMax - xMin)) * iw);
      const yScale = (v) => M.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

      // Y grid (5 lines)
      const yTicks = 5;
      let grid = "";
      for (let i = 0; i <= yTicks; i++) {
        const v = yMin + (i / yTicks) * (yMax - yMin);
        const y = yScale(v);
        grid += `<line x1="${M.left}" y1="${y}" x2="${W - M.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
        grid += `<text x="${M.left - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#64748b">${v.toFixed(Math.abs(yMax - yMin) < 5 ? 2 : 1)}</text>`;
      }
      // X ticks (hasta 6)
      const xTicks = Math.min(6, allX.length);
      let xAxis = "";
      const uniqueX = Array.from(new Set(allX)).sort((a, b) => a - b);
      const step = Math.max(1, Math.ceil(uniqueX.length / xTicks));
      for (let i = 0; i < uniqueX.length; i += step) {
        const v = uniqueX[i];
        const x = xScale(v);
        const d = new Date(v);
        const lbl = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
        xAxis += `<line x1="${x}" y1="${M.top + ih}" x2="${x}" y2="${M.top + ih + 4}" stroke="#94a3b8"/>`;
        xAxis += `<text x="${x}" y="${M.top + ih + 16}" text-anchor="middle" font-size="10" fill="#64748b">${lbl}</text>`;
      }
      // Lines
      let lines = "", legend = "";
      seriesList.forEach((s, i) => {
        const c = colors[i % colors.length];
        const pts = s.points.slice().sort((a, b) => a.date - b.date);
        const path = pts.map((p, j) => `${j === 0 ? "M" : "L"}${xScale(p.date.getTime()).toFixed(1)},${yScale(p.value).toFixed(1)}`).join(" ");
        lines += `<path d="${path}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
        pts.forEach((p) => {
          lines += `<circle cx="${xScale(p.date.getTime()).toFixed(1)}" cy="${yScale(p.value).toFixed(1)}" r="3.2" fill="${c}" stroke="#fff" stroke-width="1"><title>${escapeHtml(s.name)}: ${p.value} (${escapeHtml(p.dateStr)})</title></circle>`;
        });
        legend += `<span class="ar-leg-item"><span class="ar-leg-dot" style="background:${c}"></span>${escapeHtml(s.name)}${s.unit ? ` <small>(${escapeHtml(s.unit)})</small>` : ""}</span>`;
      });

      return `
        <div class="ar-chart-wrap">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
            <rect x="${M.left}" y="${M.top}" width="${iw}" height="${ih}" fill="#fafafa" stroke="#e2e8f0"/>
            ${grid}
            ${xAxis}
            ${lines}
          </svg>
          <div class="ar-legend">${legend}</div>
        </div>`;
    }

    const sectionsHtml = orderedGroups.map((g) => {
      const ks = byGroup.get(g);
      const seriesList = ks.map((k) => series[k]);
      const chartHtml = renderSvgChart(seriesList, COLORS);
      const tableRows = ks.map((k) => {
        const s = series[k];
        const cells = s.points.map((p) => `<td>${escapeHtml(p.dateStr)}<br><b>${p.value}</b></td>`).join("");
        return `<tr><th>${escapeHtml(s.name)}${s.unit ? ` <small>(${escapeHtml(s.unit)})</small>` : ""}</th>${cells}</tr>`;
      }).join("");
      return `
        <section class="ar-grp">
          <h2>${escapeHtml(g)}</h2>
          ${chartHtml}
          <details open><summary>Ver tabla de valores</summary>
            <div class="ar-tbl-wrap"><table class="ar-tbl"><tbody>${tableRows}</tbody></table></div>
          </details>
        </section>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>Evolución de Laboratorio${ctx.patient ? " — " + ctx.patient : ""}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:20px;background:#f8fafc}
  header{border-bottom:2px solid #0ea5e9;padding-bottom:10px;margin-bottom:18px}
  h1{margin:0 0 4px;font-size:20px;color:#0c4a6e}
  .meta{font-size:12px;color:#475569;display:flex;flex-wrap:wrap;gap:14px}
  .ar-grp{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:18px;box-shadow:0 1px 3px rgba(15,23,42,.04)}
  .ar-grp h2{margin:0 0 10px;font-size:15px;color:#0c4a6e;border-left:4px solid #0ea5e9;padding-left:8px}
  .ar-chart-wrap{position:relative;width:100%;aspect-ratio:16/6;background:#fff;border-radius:8px;overflow:hidden}
  .ar-chart-wrap svg{width:100%;height:auto;display:block}
  .ar-legend{display:flex;flex-wrap:wrap;gap:10px 14px;margin-top:8px;font-size:11px;color:#334155}
  .ar-leg-item{display:inline-flex;align-items:center;gap:5px}
  .ar-leg-dot{display:inline-block;width:10px;height:10px;border-radius:50%}
  details{margin-top:10px;font-size:12px}
  summary{cursor:pointer;color:#0ea5e9;font-weight:600}
  .ar-tbl-wrap{overflow-x:auto;margin-top:8px}
  table.ar-tbl{border-collapse:collapse;width:100%;font-size:11px}
  table.ar-tbl th,table.ar-tbl td{border:1px solid #e2e8f0;padding:4px 6px;text-align:left;white-space:nowrap}
  table.ar-tbl th{background:#f1f5f9;position:sticky;left:0}
  .actions{margin:0 0 16px;display:flex;gap:8px}
  .actions button{padding:8px 14px;border:1px solid #0ea5e9;background:#0ea5e9;color:#fff;font-weight:600;border-radius:6px;cursor:pointer}
  .actions button.sec{background:#fff;color:#0ea5e9}
  @media print{body{background:#fff;margin:10mm}.actions{display:none}.ar-grp{break-inside:avoid;page-break-inside:avoid;box-shadow:none}details[open] .ar-tbl-wrap{overflow:visible}}
</style>
</head><body>
<header>
  <h1>📈 Evolución de Laboratorio</h1>
  <div class="meta">
    ${ctx.patient ? `<div><b>Paciente:</b> ${escapeHtml(ctx.patient)}</div>` : ""}
    <div><b>Ventana:</b> 36 meses</div>
    <div><b>Analitos comparados:</b> ${keys.length}</div>
    <div><b>Generado:</b> ${escapeHtml(new Date().toLocaleString("es-CL"))}</div>
  </div>
</header>
<div class="actions">
  <button onclick="window.print()">🖨 Imprimir / PDF</button>
  <button class="sec" onclick="window.close()">Cerrar</button>
</div>
${sectionsHtml}
</body></html>`;

    const w = window.open("", "_blank", "width=1100,height=900");
    if (!w) { toast("Bloqueador de ventanas activo. Permite popups."); return; }
    w.document.open(); w.document.write(html); w.document.close();
    toast(`📈 ${keys.length} analito(s) con evolución.`);
  }

  // =====================================================================
  // 🗂 Editor de perfiles — mapeo configurable analito → perfil
  // =====================================================================
  function openProfilesEditor() {
    // Quitar modal previo si existe
    document.getElementById("ar-profiles-modal")?.remove();
    const cfg = getProfilesConfig();
    const allKeys = Object.keys(LAB_DISPLAY).sort((a, b) => {
      const na = LAB_DISPLAY[a].name, nb = LAB_DISPLAY[b].name;
      return na.localeCompare(nb, "es");
    });
    const allGroups = Array.from(new Set([
      ...LAB_GROUP_ORDER_DEFAULT,
      ...cfg.order,
      ...Object.values(cfg.overrides),
      ...Object.values(LAB_DISPLAY).map((d) => d.group),
    ])).filter(Boolean);

    const overlay = document.createElement("div");
    overlay.id = "ar-profiles-modal";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,Roboto,sans-serif;";
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:min(820px,94vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px">
          <div style="font-size:16px;font-weight:700;color:#0c4a6e">🗂 Mapeo de exámenes a perfiles</div>
          <input id="arp-search" placeholder="Filtrar examen..." style="flex:1;margin-left:10px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"/>
          <button id="arp-close" style="background:none;border:0;font-size:20px;cursor:pointer;color:#64748b">✕</button>
        </div>
        <div style="padding:10px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:#475569">
          <b>Orden de perfiles:</b>
          <input id="arp-order" value="${escapeHtml(cfg.order.join(' | '))}" style="flex:1;min-width:300px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px" title="Separa los perfiles con |. Define el orden en que aparecerán en el resumen."/>
          <button id="arp-reset-order" style="padding:4px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;font-size:11px">Reset</button>
        </div>
        <div id="arp-list" style="overflow:auto;padding:6px 18px;flex:1"></div>
        <div style="padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;background:#f8fafc;border-radius:0 0 12px 12px">
          <button id="arp-reset-all" style="padding:8px 14px;border:1px solid #ef4444;background:#fff;color:#ef4444;border-radius:6px;cursor:pointer;font-weight:600">Restablecer todo</button>
          <button id="arp-cancel" style="padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">Cancelar</button>
          <button id="arp-save" style="padding:8px 16px;border:1px solid #0ea5e9;background:#0ea5e9;color:#fff;border-radius:6px;cursor:pointer;font-weight:700">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector("#arp-list");
    const datalistId = "arp-groups-dl";
    const dl = document.createElement("datalist");
    dl.id = datalistId;
    dl.innerHTML = allGroups.map((g) => `<option value="${escapeHtml(g)}"></option>`).join("");
    overlay.appendChild(dl);

    function renderList(filter = "") {
      const f = filter.trim().toLowerCase();
      listEl.innerHTML = allKeys
        .filter((k) => {
          if (!f) return true;
          const d = LAB_DISPLAY[k];
          return d.name.toLowerCase().includes(f) || k.toLowerCase().includes(f);
        })
        .map((k) => {
          const d = LAB_DISPLAY[k];
          const current = cfg.overrides[k] ?? d.group;
          const isOverride = cfg.overrides[k] != null;
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;color:#0f172a;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.name)}${d.unit ? ` <span style="color:#94a3b8;font-weight:400">(${escapeHtml(d.unit)})</span>` : ""}</div>
                <div style="font-size:11px;color:#94a3b8">${escapeHtml(k)} · default: ${escapeHtml(d.group)}</div>
              </div>
              <input list="${datalistId}" data-key="${escapeHtml(k)}" value="${escapeHtml(current)}" style="width:220px;padding:5px 8px;border:1px solid ${isOverride ? '#0ea5e9' : '#cbd5e1'};border-radius:6px;font-size:12px;background:${isOverride ? '#ecfeff' : '#fff'}"/>
            </div>`;
        }).join("");
    }
    renderList();
    overlay.querySelector("#arp-search").addEventListener("input", (e) => renderList(e.target.value));
    overlay.querySelector("#arp-close").onclick = () => overlay.remove();
    overlay.querySelector("#arp-cancel").onclick = () => overlay.remove();
    overlay.querySelector("#arp-reset-order").onclick = () => {
      overlay.querySelector("#arp-order").value = LAB_GROUP_ORDER_DEFAULT.join(" | ");
    };
    overlay.querySelector("#arp-reset-all").onclick = () => {
      if (!confirm("¿Restablecer TODOS los mapeos a los valores por defecto?")) return;
      localStorage.removeItem(LAB_PROFILES_KEY);
      overlay.remove();
      toast("Perfiles restablecidos.");
    };
    overlay.querySelector("#arp-save").onclick = () => {
      const inputs = listEl.querySelectorAll("input[data-key]");
      const overrides = {};
      inputs.forEach((inp) => {
        const k = inp.dataset.key;
        const val = inp.value.trim();
        const def = LAB_DISPLAY[k]?.group || "Otros";
        if (val && val !== def) overrides[k] = val;
      });
      const orderRaw = overlay.querySelector("#arp-order").value;
      const order = orderRaw.split("|").map((s) => s.trim()).filter(Boolean);
      setProfilesConfig({ overrides, order: order.length ? order : LAB_GROUP_ORDER_DEFAULT.slice() });
      overlay.remove();
      toast(`✅ Mapeo guardado (${Object.keys(overrides).length} personalización(es))`);
    };
    // Cerrar SOLO con la "X"
  }

  function printLabReport() {
    const lab = getLabSession();
    if (!lab || !lab.analytes || !Object.keys(lab.analytes).length) {
      toast("No hay lab extraído. Pulsa 🧪 Lab primero.");
      return;
    }
    const ctx = readContext();
    const rows = Object.entries(lab.analytes).map(([key, a]) => {
      const chk = isValueInRange(key, a.value);
      let flagLabel = "—";
      let flagClass = "ok";
      if (chk && chk.range && chk.num != null) {
        if (!chk.ok) {
          flagClass = "alt";
          flagLabel = chk.num < chk.range.min ? "↓ Bajo" : "↑ Alto";
        } else {
          flagLabel = "Normal";
        }
      } else if (a.flag) {
        flagLabel = a.flag;
        flagClass = a.flag === "alto" || a.flag === "bajo" || a.flag === "anormal" ? "alt" : "ok";
      }
      const refRange = chk && chk.range
        ? `${chk.range.min}–${chk.range.max} ${chk.range.unit || ""}`
        : (a.range || "");
      return `
        <tr class="ar-pdf-${flagClass}">
          <td>${escapeHtml(a.rawName || key)}${a.subtype ? ` <small>(${escapeHtml(a.subtype)})</small>` : ""}</td>
          <td class="num"><b>${escapeHtml(String(a.value ?? ""))}</b> ${escapeHtml(a.unit || "")}</td>
          <td class="ref">${escapeHtml(refRange)}</td>
          <td class="flag">${flagLabel}</td>
        </tr>`;
    }).join("");

    const today = new Date().toLocaleString("es-CL");
    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/>
<title>Reporte de Laboratorio${ctx.patient ? " — " + ctx.patient : ""}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}
  header{border-bottom:2px solid #0ea5e9;padding-bottom:10px;margin-bottom:16px}
  h1{margin:0 0 4px;font-size:18px;color:#0c4a6e}
  .meta{font-size:11px;color:#475569;display:flex;flex-wrap:wrap;gap:14px}
  .meta div b{color:#0f172a}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#334155}
  td.num{white-space:nowrap}
  td.ref{color:#475569;font-size:11px;white-space:nowrap}
  td.flag{font-weight:700;text-align:center;white-space:nowrap}
  tr.ar-pdf-alt td.flag{color:#b91c1c;background:#fef2f2}
  tr.ar-pdf-ok td.flag{color:#15803d}
  tfoot td{border:none;padding-top:14px;font-size:10px;color:#64748b}
  .signbox{margin-top:48px;display:flex;gap:60px}
  .signbox div{flex:1;border-top:1px solid #475569;padding-top:6px;font-size:11px;text-align:center;color:#475569}
  @media print{body{margin:12mm} button{display:none}}
  .actions{margin:14px 0;display:flex;gap:8px}
  .actions button{padding:8px 14px;border:1px solid #0ea5e9;background:#0ea5e9;color:#fff;font-weight:600;border-radius:6px;cursor:pointer}
  .actions button.sec{background:#fff;color:#0ea5e9}
</style>
</head><body>
<header>
  <h1>Reporte de Laboratorio</h1>
  <div class="meta">
    ${ctx.patient ? `<div><b>Paciente:</b> ${escapeHtml(ctx.patient)}</div>` : ""}
    ${lab.date ? `<div><b>Fecha exámenes:</b> ${escapeHtml(lab.date)}</div>` : ""}
    <div><b>Generado:</b> ${escapeHtml(today)}</div>
    ${ctx.cesfam ? `<div><b>Centro:</b> ${escapeHtml(ctx.cesfam)}</div>` : ""}
    <div><b>Total:</b> ${Object.keys(lab.analytes).length} analitos</div>
  </div>
</header>
<div class="actions">
  <button onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <button class="sec" onclick="window.close()">Cerrar</button>
</div>
<table>
  <thead><tr><th>Examen</th><th>Resultado</th><th>Rango referencia</th><th>Estado</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="signbox"><div>Profesional</div><div>Firma / Timbre</div></div>
<tfoot><tr><td>Reporte generado por Vínculo — uso clínico interno. Verifique siempre los valores con el informe oficial del laboratorio.</td></tr></tfoot>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { toast("Bloqueador de ventanas activo. Permite popups."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch(_) {} }, 350);
    toast("📄 Reporte PDF abierto. Usa el diálogo de impresión para guardar.");
  }

  // =====================================================================
  // Auto-relleno de campos del formulario con valores de laboratorio
  // =====================================================================

  // Etiquetas de campos de fecha asociadas a un analito (para llenarlas con la fecha)
  const DATE_LABEL_HINTS = ["fecha", "fecha de", "fecha de toma", "fecha de muestra"];

  // ---- Reglas de exclusión / ruteo de campos ----
  // Labels que NUNCA deben autollenarse (digitación manual obligatoria del médico).
  // Detectamos por palabra clave en el texto NORMALIZADO.
  const MANUAL_ONLY_LABEL_PATTERNS = [
    /\bobs\.?\b/,                              // "Obs." → todas las observaciones
    /\bobserv/,                                // "Observación..."
    /\borina\s+completa/,                      // "Obs. Orina Completa", "Orina Completa Alterada"
    /\bsedimento\s+urinario/,
    /glicemia\s+capilar/,                      // siempre manual
    /\bhgt\b/,                                 // hemoglucotest capilar
    /\bcapilar\b/,                             // cualquier otra capilar
  ];
  function isManualOnlyLabel(labelText) {
    const n = normalizeName(labelText);
    return MANUAL_ONLY_LABEL_PATTERNS.some((re) => re.test(n));
  }

  // Extrae la "Fecha de toma" de un grupo (item-card) del panel de exámenes.
  // Busca patrones tipo "Fecha de toma 11-03-2026" o "Fecha de toma: 11/03/2026".
  // Devuelve la fecha en formato dd-mm-yyyy (canónico Rayen) o "" si no la encuentra.
  function extractTomaDate(group) {
    if (!group) return "";
    try {
      const txt = group.innerText || group.textContent || "";
      const m = txt.match(/fecha\s+de\s+toma[\s:]*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (m) {
        const parts = m[1].split(/[\/\-]/);
        const dd = parts[0].padStart(2, "0");
        const mm = parts[1].padStart(2, "0");
        let yy = parts[2];
        if (yy.length === 2) yy = (parseInt(yy, 10) < 50 ? "20" : "19") + yy;
        return `${dd}-${mm}-${yy}`;
      }
    } catch (_) {}
    return "";
  }

  // Detecta si el label es un "campo de vigencia de batería de exámenes".
  // En esos casos, queremos llenar con (fecha de batería + 1 año).
  function isExpiryLabel(labelText) {
    const n = normalizeName(labelText);
    return /\bvigencia\b/.test(n) && /(bater|examen|exámen|exam)/.test(n);
  }
  // Detecta "Fecha de realización de batería de exámen" → fecha de toma del lab.
  function isLabBatchDateLabel(labelText) {
    const n = normalizeName(labelText);
    return /\b(fecha)\b.*\b(realizaci|toma|muestra)\b.*\b(bater|examen|exámen|exam)\b/.test(n)
        || (/\brealizaci/.test(n) && /(bater|examen|exam)/.test(n));
  }
  // Suma 1 año a una fecha en formatos comunes: dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd.
  // Devuelve la fecha en el MISMO formato que el input.
  function addYearToDateString(s) {
    if (!s) return "";
    const str = String(s).trim();
    let m;
    // dd-mm-yyyy o dd/mm/yyyy
    m = str.match(/^(\d{1,2})([\/\-])(\d{1,2})([\/\-])(\d{4})$/);
    if (m) {
      const dd = m[1], sep1 = m[2], mm = m[3], sep2 = m[4], yyyy = String(parseInt(m[5], 10) + 1);
      return `${dd}${sep1}${mm}${sep2}${yyyy}`;
    }
    // yyyy-mm-dd
    m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${parseInt(m[1], 10) + 1}-${m[2]}-${m[3]}`;
    return str;
  }

  // Determina, a partir del label del formulario, si se refiere a un subtipo
  // específico de glicemia y devuelve la clave correspondiente
  // ("glicemia.<subtype>") si tenemos ese dato; si no, devuelve null.
  function resolveGlicemiaSubKey(labelText, lab) {
    const n = normalizeName(labelText);
    if (!/glicem|glucos|ptgo|sobrecarga|tolerancia/.test(n)) return null;
    if (/post\s*carga|sobrecarga|tolerancia|ptgo|2\s*h\b|120\s*min/.test(n)) {
      return lab.analytes["glicemia.postcarga_2h"] ? "glicemia.postcarga_2h" : null;
    }
    if (/ayun|basal/.test(n)) {
      return lab.analytes["glicemia.ayunas"] ? "glicemia.ayunas" : null;
    }
    return null;
  }

  // Detecta si el label es un "campo fecha de <analito>"
  function detectDateAnalyte(labelText) {
    const n = normalizeName(labelText);
    if (!n) return null;
    if (!/(^|\s)fecha(\s|$)/.test(n)) return null;
    // intentar match con resto del texto sin la palabra "fecha"
    const rest = n.replace(/\bfecha( de| del)?( ultima| último| ultimo| última)?\b/g, "").trim();
    if (!rest) return null;
    return matchAnalyte(rest);
  }

  // Encuentra el input/select asociado a un <label> dado.
  // Estrategia: probar for=, dentro del label, y luego subir por ancestros
  // buscando un input/textarea/select que sea hermano (mismo row).
  function findInputForLabel(labelEl) {
    if (!labelEl) return null;
    // 1. label con for=
    const forId = labelEl.getAttribute("for");
    if (forId) {
      const byId = document.getElementById(forId);
      if (byId) return byId;
    }
    // 2. input dentro del propio label
    const inside = labelEl.querySelector("input, textarea, select");
    if (inside) return inside;

    const isTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "SELECT" || tag === "TEXTAREA") return true;
      if (tag !== "INPUT") return false;
      const t = (el.type || "text").toLowerCase();
      return ["text", "number", "search", "tel", "email", "url", "date", "datetime-local", ""].includes(t);
    };

    // 3. Subir por ancestros, en cada nivel buscar el primer input/select/textarea
    //    válido dentro del subárbol que NO esté dentro del propio label y que
    //    aparezca después del label (asumiendo layout label → input).
    let node = labelEl.parentElement;
    let levels = 0;
    while (node && levels < 8) {
      const candidates = node.querySelectorAll("input, textarea, select");
      for (const c of candidates) {
        if (labelEl.contains(c)) continue;
        if (!isTarget(c)) continue;
        // Verificar que esté visible
        const rect = c.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        return c;
      }
      node = node.parentElement;
      levels++;
    }
    return null;
  }

  function flashEl(el, color) {
    if (!el) return;
    const old = el.style.boxShadow;
    el.style.transition = "box-shadow 0.4s ease";
    el.style.boxShadow = `0 0 0 3px ${color}`;
    setTimeout(() => { el.style.boxShadow = old; }, 1200);
  }

  // Devuelve { ok: bool, written?: string, reason?: string } para depuración.
  function fillInputValue(el, value) {
    if (!el) return { ok: false, reason: "elemento nulo" };
    if (value == null || value === "") return { ok: false, reason: "valor vacío" };
    const tag = el.tagName;
    const type = (el.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") return { ok: false, reason: "checkbox/radio" };
    try { el.focus(); } catch (_) {}
    let written = String(value);
    if (tag === "SELECT") {
      const want = String(value).toLowerCase();
      let matched = false;
      for (const opt of el.options) {
        if (
          opt.value.toLowerCase() === want ||
          opt.textContent.trim().toLowerCase() === want
        ) {
          el.value = opt.value;
          written = opt.value;
          matched = true;
          break;
        }
      }
      if (!matched) return { ok: false, reason: `select sin opción para "${value}"` };
    } else {
      // Para inputs numéricos, extraer solo el primer número
      let v = String(value);
      if (type === "number") {
        const m = v.replace(",", ".").match(/-?\d+(\.\d+)?/);
        if (!m) return { ok: false, reason: `no hay número en "${value}"` };
        v = m[0];
      }
      written = v;
      setNativeValue(el, v);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.blur(); } catch (_) {}
    flashEl(el, "rgba(34,197,94,0.7)");
    return { ok: true, written };
  }

  function autofillLabIntoForm() {
    const now = Date.now();
    if (now < autofillLockUntil) {
      log("autofill bloqueado para evitar reentrada", { autofillLockUntil, now });
      return { filled: 0, skipped: 0, blocked: true };
    }
    autofillLockUntil = now + FILL_GUARD_MS;
    const runId = ++autofillRunId;
    const lab = getLabSession();
    if (!lab || !lab.analytes || !Object.keys(lab.analytes).length) {
      toast("No hay lab extraído. Pulsa 🧪 Lab primero.");
      setFillStatus("error", { filled: 0, skipped: 0, message: "No hay lab extraído" });
      return { filled: 0, skipped: 0 };
    }
    setFillStatus("queued", { filled: 0, skipped: 0, message: "Iniciando..." });
    return new Promise((resolve) => {
      setTimeout(() => {
        setFillStatus("running");
        const result = doAutofill(lab, runId);
        const state = result.filled === 0 ? "error" : "done";
        setFillStatus(state, {
          filled: result.filled,
          skipped: result.skipped,
          message: result.filled === 0
            ? "No coincidió ningún campo del formulario"
            : `${result.filled} campo(s) rellenado(s)${result.skipped ? `, ${result.skipped} salteado(s)` : ""}`,
        });
        resolve(result);
      }, 30);
    });
  }

  function doAutofill(lab, runId) {
    const labelNodes = document.querySelectorAll(
      "label, .form-label, .control-label, [class*='label']",
    );

    let filled = 0;
    let skipped = 0;
    const filledKeys = new Set();
    const seenInputs = new WeakSet();
    const debugRows = [];

    function pushRow(row) {
      // Sólo guardamos en debug si DEBUG está activo o si el resultado no es un "no match" trivial
      if (DEBUG || row.status !== "no match") debugRows.push(row);
    }

    labelNodes.forEach((lbl) => {
      const text = (lbl.textContent || "").replace(/\*/g, "").trim();
      if (!text || text.length > 120) return;
      if (lbl.closest("#ar-fab-wrap, #ar-panel, #ar-modal, .side-modal-body, [class*='side-modal-body']")) return;

      // ---- (A) Bloqueo: campos que SIEMPRE son digitación manual ----
      if (isManualOnlyLabel(text)) {
        pushRow({
          label: text, normalizado: normalizeName(text), alias: "—", regla: "manual-only",
          analito: "—", valor_lab: "", valor_pegado: "", input: "—", status: "bloqueado (manual)",
        });
        return;
      }

      // ---- (B0) Fecha de realización de batería de exámen → fecha de toma del lab ----
      if (isLabBatchDateLabel(text) && !isExpiryLabel(text)) {
        const input = findInputForLabel(lbl);
        if (input && !seenInputs.has(input)) {
          const dateValue = lab.date || "";
          if (dateValue) {
            const r = fillInputValue(input, dateValue);
            if (r.ok) {
              seenInputs.add(input);
              filled++;
              filledKeys.add("realización (fecha lab)");
              pushRow({
                label: text, normalizado: normalizeName(text), alias: "(realización)", regla: "isLabBatchDateLabel",
                analito: "fecha lab", valor_lab: dateValue, valor_pegado: r.written,
                input: describeInput(input), status: "OK",
              });
              return;
            }
          }
        }
      }

      // ---- (B) Fecha de vigencia de batería de exámenes → fecha lab + 1 año ----
      if (isExpiryLabel(text)) {
        const input = findInputForLabel(lbl);
        if (input && !seenInputs.has(input)) {
          const base = lab.date || "";
          const dateValue = base ? addYearToDateString(base) : "";
          if (dateValue) {
            const r = fillInputValue(input, dateValue);
            if (r.ok) {
              seenInputs.add(input);
              filled++;
              filledKeys.add("vigencia (+1 año)");
              pushRow({
                label: text, normalizado: normalizeName(text), alias: "(vigencia)", regla: "isExpiryLabel",
                analito: "vigencia", valor_lab: base, valor_pegado: r.written,
                input: describeInput(input), status: "OK (+1 año)",
              });
              return;
            }
          }
        }
      }

      // ¿Es un campo "Fecha de <analito>"?
      const dateKey = detectDateAnalyte(text);
      if (dateKey && lab.analytes[dateKey]) {
        const input = findInputForLabel(lbl);
        if (input && !seenInputs.has(input)) {
          const dateValue = lab.analytes[dateKey].date || lab.date || "";
          if (dateValue) {
            const r = fillInputValue(input, dateValue);
            if (r.ok) {
              seenInputs.add(input);
              filled++;
              filledKeys.add(`${dateKey} (fecha)`);
              pushRow({
                label: text, normalizado: normalizeName(text), alias: "(fecha)", regla: "detectDateAnalyte",
                analito: `${dateKey} (fecha)`, valor_lab: dateValue, valor_pegado: r.written,
                input: describeInput(input), status: "OK",
              });
              return;
            }
          }
        }
      }

      // ---- (C) Glicemia con subtipo explícito en el label (ayunas/PTGO/postcarga) ----
      const glicSubKey = resolveGlicemiaSubKey(text, lab);
      if (glicSubKey) {
        const input = findInputForLabel(lbl);
        if (input && !seenInputs.has(input)) {
          const valLab = lab.analytes[glicSubKey].value;
          const t = (input.type || "").toLowerCase();
          if (t !== "checkbox" && t !== "radio") {
            const r = fillInputValue(input, valLab);
            if (r.ok) {
              seenInputs.add(input);
              filled++;
              filledKeys.add(glicSubKey);
              pushRow({
                label: text, normalizado: normalizeName(text), alias: "(subtipo)", regla: "resolveGlicemiaSubKey",
                analito: glicSubKey, valor_lab: valLab, valor_pegado: r.written,
                input: describeInput(input), status: "OK",
              });
              return;
            }
          }
        }
      }

      // ¿Es un campo de un analito?
      // Iteramos sobre TODOS los candidatos y nos quedamos con el primero
      // cuyo valor lab caiga dentro del rango clínico plausible.
      const candidates = matchAnalyteCandidates(text);
      if (!candidates.length) {
        pushRow({ label: text, normalizado: normalizeName(text), alias: "—", regla: "sin coincidencia", analito: "—", valor_lab: "", valor_pegado: "", input: "—", status: "no match" });
        return;
      }

      let chosen = null;       // candidato finalmente usado
      const tried = [];        // candidatos descartados por rango (para debug)

      for (const c of candidates) {
        if (!lab.analytes[c.key]) {
          tried.push({ ...c, reason: "sin dato lab" });
          continue;
        }
        const valLab = lab.analytes[c.key].value;
        const chk = isValueInRange(c.key, valLab);
        if (!chk.ok) {
          tried.push({ ...c, reason: `fuera de rango (${chk.num} ∉ [${chk.range.min}, ${chk.range.max}] ${chk.range.unit})`, valor_lab: valLab });
          continue;
        }
        chosen = { ...c, valLab, rangeCheck: chk };
        break;
      }

      const baseRow = chosen
        ? { label: text, normalizado: normalizeName(text), alias: chosen.alias, regla: chosen.rule, analito: chosen.key }
        : { label: text, normalizado: normalizeName(text), alias: candidates[0].alias, regla: candidates[0].rule, analito: candidates[0].key };

      // Adjuntamos info de candidatos descartados al log
      if (tried.length) baseRow.descartados = tried.map(t => `${t.key}(${t.reason})`).join(" | ");

      if (!chosen) {
        const last = tried[tried.length - 1];
        pushRow({ ...baseRow, valor_lab: last?.valor_lab || "", valor_pegado: "", input: "—", status: tried.every(t => t.reason === "sin dato lab") ? "sin dato lab" : "todos los candidatos fuera de rango" });
        return;
      }

      const input = findInputForLabel(lbl);
      const valLab = chosen.valLab;
      if (!input) { pushRow({ ...baseRow, valor_lab: valLab, valor_pegado: "", input: "—", status: "input no encontrado" }); return; }
      if (seenInputs.has(input)) { pushRow({ ...baseRow, valor_lab: valLab, valor_pegado: "", input: describeInput(input), status: "input ya usado" }); return; }

      const t = (input.type || "").toLowerCase();
      if (t === "checkbox" || t === "radio") {
        skipped++;
        pushRow({ ...baseRow, valor_lab: valLab, valor_pegado: "", input: describeInput(input), status: "es radio/check" });
        return;
      }
      const r = fillInputValue(input, valLab);
      if (r.ok) {
        seenInputs.add(input);
        filled++;
        filledKeys.add(chosen.key);
        const okStatus = tried.length ? `OK (reintento, descartó ${tried.length})` : "OK";
        pushRow({ ...baseRow, valor_lab: valLab, valor_pegado: r.written, input: describeInput(input), status: okStatus });
      } else {
        skipped++;
        pushRow({ ...baseRow, valor_lab: valLab, valor_pegado: "", input: describeInput(input), status: r.reason || "fillInputValue=false" });
      }
    });

    // Logging: siempre imprime resumen; en DEBUG abre el grupo expandido y muestra MUCHO más detalle.
    const groupFn = DEBUG ? console.group : console.groupCollapsed;
    groupFn(`[AR] Auto-relleno lab — ${filled} rellenado(s), ${skipped} salteado(s)${DEBUG ? "  🐞 DEBUG ON" : ""}`);
    console.table(debugRows);
    console.log("Analitos disponibles:", Object.keys(lab.analytes));
    if (DEBUG) {
      console.log("Sesión lab completa:", lab);
      console.log("Tip: usa window.__arDebug.matchAnalyte('texto del label') para probar manualmente.");
    } else {
      console.log("💡 Activa modo debug con  window.__arDebug.on()  o el botón 🐞 del badge para ver detalle de cada label.");
    }
    console.groupEnd();

    if (filled === 0) {
      toast("No encontré campos del formulario que coincidan con el lab. Revisa la consola para ver el detalle.");
    } else {
      toast(`✅ ${filled} campo(s) rellenado(s): ${[...filledKeys].slice(0, 6).join(", ")}${filledKeys.size > 6 ? "..." : ""}`);
    }
    return { filled, skipped, debugRows, runId };
  }

  // Resumen breve de un input para los logs de debug
  function describeInput(el) {
    if (!el) return "—";
    const tag = el.tagName.toLowerCase();
    const type = el.type ? `[${el.type}]` : "";
    const id = el.id ? `#${el.id}` : "";
    const name = el.name ? `[name=${el.name}]` : "";
    return `${tag}${type}${id}${name}`;
  }

  // =====================================================================
  // Context recognition
  // =====================================================================
  function readContext() {
    const ctx = { patient: "", cesfam: "", section: "" };
    const navTitle = document.querySelector("span.nav-title, .nav-title");
    if (navTitle) ctx.patient = navTitle.textContent.trim().slice(0, 80);
    if (!ctx.patient) {
      const pc = document.querySelector(".patient-card .patient-data, .patient-card");
      if (pc) ctx.patient = pc.textContent.replace(/\s+/g, " ").trim().slice(0, 80);
    }
    const right = document.querySelector(".navbar-right .float-right, .navbar-right");
    if (right) ctx.cesfam = right.textContent.replace(/\s+/g, " ").trim().slice(0, 100);
    if (document.querySelector(".side-modal-body, [class*='side-modal-body']")) {
      ctx.section = "Panel de exámenes abierto";
    } else if (document.querySelector("form, [role='form']")) {
      ctx.section = "Formulario activo";
    } else {
      ctx.section = "Ficha clínica";
    }
    return ctx;
  }

  // =====================================================================
  // UI
  // =====================================================================
  function toast(msg) {
    const t = document.createElement("div");
    t.id = "ar-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }
  try { window.__AR_TOAST = toast; } catch {}

  // =====================================================================
  // 👁 Fondo de Ojo (DM2) — chequeo automático "Exploración vitreorretinal"
  // Replica el flujo: filtrar Historia Clínica por Actividades, ventana 24m,
  // buscar "Exploración vitreorretinal". Si existe → vigente, si no → derivar.
  // =====================================================================
  const FUNDUS_KEYWORD = "exploración vitreorretinal";
  const FUNDUS_KEYWORD_NORM = "exploracion vitreorretinal";

  function setSelectValue(sel, value) {
    if (!sel) return false;
    const opt = Array.from(sel.options).find((o) => String(o.value) === String(value));
    if (!opt) return false;
    sel.value = String(value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function normTxt(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  function findHistoryDateNearText(root, needleNorm) {
    // Busca el nodo que contenga el keyword y rastrea fecha cercana (formato dd-mm-yyyy o dd/mm/yyyy)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let best = null;
    let node;
    while ((node = walker.nextNode())) {
      const t = normTxt(node.nodeValue);
      if (!t.includes(needleNorm)) continue;
      // sube hasta una fila/card y busca fecha
      let p = node.parentElement;
      for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
        const all = p.innerText || p.textContent || "";
        const m = all.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) {
          let y = +m[3]; if (y < 100) y += 2000;
          const d = new Date(y, +m[2] - 1, +m[1]);
          if (!isNaN(d) && (!best || d > best)) best = d;
          break;
        }
      }
      if (!best) best = new Date(); // encontrado pero sin fecha
    }
    return best;
  }

  let fundusBadge = null;
  let fundusRunning = false;
  async function checkFundusEval() {
    if (fundusRunning) return;
    fundusRunning = true;
    try {
      // Gate: solo aplica a pacientes con DM2/DM1 (Fondo de Ojo es prestación GES de diabetes).
      let isDiabetic = false;
      try {
        const cond = detectChronicConditions();
        isDiabetic = cond.has("DM2") || cond.has("DM1") || cond.has("DM");
      } catch (_) {}
      if (!isDiabetic) {
        const txt = (document.body.innerText || "").toLowerCase();
        if (/\bdm\s*[12]\b|diabetes\s+mellitus|\bdm[12]\b|\be1[01]\b/.test(txt)) isDiabetic = true;
      }
      if (!isDiabetic) {
        renderFundusBadge({ state: "info", msg: "Sin DM en ficha — no aplica" });
        toast("ℹ Paciente sin diagnóstico de Diabetes — Fondo de Ojo no corresponde");
        return;
      }
      toast("👁 Buscando Fondo de Ojo (24m)...");
      const orderBy = document.querySelector("#orderby-record");
      const months = document.querySelector("#adverseReaction");
      if (!orderBy || !months) {
        toast("Abre la Historia Clínica del paciente primero.");
        renderFundusBadge({ state: "error", msg: "Abre la Historia Clínica" });
        return;
      }
      // 1) Filtrar por Actividades (value=1)
      setSelectValue(orderBy, "1");
      await sleep(400);
      // 2) Ventana 24 meses
      setSelectValue(months, "24");
      await sleep(900);

      // 3) Buscar en la lista renderizada
      const scope = document.querySelector(".records, .record-list, .scrollable, body") || document.body;
      const lastDate = findHistoryDateNearText(scope, FUNDUS_KEYWORD_NORM);

      if (lastDate) {
        const fmt = lastDate.toLocaleDateString("es-CL");
        renderFundusBadge({ state: "ok", msg: `Fondo de Ojo vigente (${fmt})` });
        toast(`✅ Fondo de Ojo vigente (${fmt})`);
      } else {
        renderFundusBadge({ state: "warn", msg: "Derivar a Fondo de Ojo" });
        toast("⚠ Sin Fondo de Ojo en 24m → Derivar");
      }
    } catch (e) {
      console.error("[AR:Fundus]", e);
      renderFundusBadge({ state: "error", msg: "Error: " + (e?.message || e) });
    } finally {
      fundusRunning = false;
    }
  }

  function renderFundusBadge({ state, msg }) {
    if (!fundusBadge) return;
    const colors = {
      ok:    { bg: "#dcfce7", fg: "#166534", icon: "✅" },
      warn:  { bg: "#fef3c7", fg: "#78350f", icon: "⚠" },
      info:  { bg: "#e0f2fe", fg: "#075985", icon: "ℹ" },
      error: { bg: "#fee2e2", fg: "#991b1b", icon: "✕" },
    };
    const c = colors[state] || colors.warn;
    fundusBadge.style.cssText = `display:block;background:${c.bg};color:${c.fg};padding:6px 10px;border-radius:6px;margin-bottom:6px;font-size:12px;font-weight:600;`;
    fundusBadge.innerHTML = `${c.icon} ${escapeHtml(msg)} <button id="ar-fundus-x" type="button" style="float:right;background:transparent;border:0;color:inherit;cursor:pointer;font-weight:700;">✕</button>`;
    fundusBadge.querySelector("#ar-fundus-x").onclick = () => { fundusBadge.style.display = "none"; fundusBadge.innerHTML = ""; };
  }

  // =====================================================================
  // 🩺 Estado del paciente crónico — DM2 / HTA / ERC en 1 vistazo.
  // =====================================================================
  const CHRONIC_RULES = {
    DM2: {
      label: "Diabetes Mellitus 2", icon: "🩸",
      items: [
        { key: "hba1c", label: "HbA1c", months: 6,
          target: (n) => n < 7 ? { ok: true, hint: "meta <7%" }
                       : n < 8 ? { ok: "warn", hint: "control sub-óptimo" }
                       : { ok: false, hint: ">8% mal control" } },
        { key: "glicemia", label: "Glicemia ayuno", months: 6,
          target: (n) => n < 130 ? { ok: true, hint: "meta <130" } : { ok: "warn", hint: "elevada" } },
        { key: "creatinina", label: "Creatinina", months: 12 },
        { key: "vfg", label: "VFG", months: 12,
          target: (n) => n >= 60 ? { ok: true, hint: "≥60" }
                       : n >= 30 ? { ok: "warn", hint: "ERC 3 — vigilar" }
                       : { ok: false, hint: "ERC 4-5 → nefro" } },
        { key: "rac", label: "RAC", months: 12,
          target: (n) => n < 30 ? { ok: true, hint: "normo" }
                       : n < 300 ? { ok: "warn", hint: "microalbuminuria" }
                       : { ok: false, hint: "macroalbuminuria" } },
        { key: "ldl", label: "LDL", months: 12,
          target: (n) => n < 70 ? { ok: true, hint: "meta DM2 <70" } : { ok: "warn", hint: "≥70" } },
        { key: "_fundus", label: "Fondo de Ojo", months: 24, special: "fundus" },
      ],
    },
    HTA: {
      label: "Hipertensión", icon: "🫀",
      items: [
        { key: "creatinina", label: "Creatinina", months: 12 },
        { key: "vfg", label: "VFG", months: 12,
          target: (n) => n >= 60 ? { ok: true, hint: "≥60" } : { ok: "warn", hint: "<60" } },
        { key: "potasio", label: "Potasio", months: 12,
          target: (n) => (n >= 3.5 && n <= 5.0) ? { ok: true, hint: "normal" } : { ok: false, hint: "fuera rango" } },
        { key: "sodio", label: "Sodio", months: 12 },
        { key: "rac", label: "RAC", months: 12,
          target: (n) => n < 30 ? { ok: true, hint: "normo" } : { ok: "warn", hint: "≥30" } },
        { key: "colesterol_total", label: "Col. Total", months: 12 },
        { key: "ldl", label: "LDL", months: 12,
          target: (n) => n < 100 ? { ok: true, hint: "meta <100" } : { ok: "warn", hint: "≥100" } },
        { key: "glicemia", label: "Glicemia", months: 12 },
      ],
    },
    ERC: {
      label: "Enfermedad Renal Crónica", icon: "🫘",
      items: [
        { key: "creatinina", label: "Creatinina", months: 6 },
        { key: "vfg", label: "VFG", months: 6,
          target: (n) => n >= 60 ? { ok: true, hint: "≥60" }
                       : n >= 30 ? { ok: "warn", hint: "ERC 3" }
                       : { ok: false, hint: "ERC 4-5" } },
        { key: "rac", label: "RAC", months: 6,
          target: (n) => n < 30 ? { ok: true, hint: "normo" }
                       : n < 300 ? { ok: "warn", hint: "micro" }
                       : { ok: false, hint: "macro" } },
        { key: "potasio", label: "Potasio", months: 6,
          target: (n) => (n >= 3.5 && n <= 5.0) ? { ok: true, hint: "normal" } : { ok: false, hint: "fuera rango" } },
        { key: "sodio", label: "Sodio", months: 6 },
        { key: "calcio", label: "Calcio", months: 12 },
        { key: "fosforo", label: "Fósforo", months: 12 },
        { key: "hemoglobina", label: "Hemoglobina", months: 6,
          target: (n) => n >= 12 ? { ok: true, hint: "≥12" } : { ok: "warn", hint: "anemia" } },
      ],
    },
  };

  function detectChronicConditions() {
    const found = new Set();
    try {
      const dx = window.__AR_DX_EXTRACT?.extract?.();
      if (dx && dx.candidatos) {
        for (const c of dx.candidatos) {
          if (!c.abrev) continue;
          if (c.abrev === "DM2" || c.abrev === "DM1" || c.abrev === "DM") found.add("DM2");
          if (c.abrev === "HTA" || c.abrev === "HTA-2°") found.add("HTA");
          if (c.abrev === "ERC") found.add("ERC");
        }
      }
    } catch (_) {}
    if (!found.size) {
      const txt = (document.body.innerText || "").toLowerCase();
      if (/\bdm\s*2\b|diabetes\s+mellitus\s+tipo\s+2|diabetes\s+tipo\s+2|\bdm2\b/.test(txt)) found.add("DM2");
      if (/\bhta\b|hipertensi[oó]n\s+arterial/.test(txt)) found.add("HTA");
      if (/\berc\b|enfermedad\s+renal\s+cr[oó]nica|insuficiencia\s+renal\s+cr[oó]nica/.test(txt)) found.add("ERC");
    }
    return Array.from(found);
  }

  function monthsBetween(a, b) {
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }
  function vigenciaState(dateStr, monthsValid) {
    if (!dateStr) return { state: "missing", label: "Sin registro" };
    const d = parseLabDate(dateStr);
    if (!d) return { state: "missing", label: "Sin fecha" };
    const months = monthsBetween(d, new Date());
    if (months < 0) return { state: "ok", label: "vigente" };
    if (months <= monthsValid) return { state: "ok", label: `${months}m / ${monthsValid}m` };
    if (months <= monthsValid * 1.25) return { state: "warn", label: `vencido (${months}m)` };
    return { state: "bad", label: `vencido (${months}m)` };
  }

  let chronicBadge = null;
  let chronicFundusCache = null;

  async function maybeProbeFundus() {
    const orderBy = document.querySelector("#orderby-record");
    const months = document.querySelector("#adverseReaction");
    if (!orderBy || !months) return null;
    try {
      setSelectValue(orderBy, "1");
      await sleep(300);
      setSelectValue(months, "24");
      await sleep(700);
      const scope = document.querySelector(".records, .record-list, .scrollable, body") || document.body;
      const d = findHistoryDateNearText(scope, FUNDUS_KEYWORD_NORM);
      return d ? d.toLocaleDateString("es-CL") : null;
    } catch (_) { return null; }
  }

  async function renderChronicPanel() {
    if (!chronicBadge) return;
    const conds = detectChronicConditions();
    if (!conds.length) {
      chronicBadge.style.display = "block";
      chronicBadge.innerHTML = `<div class="ar-chr-empty">🩺 Sin diagnósticos crónicos detectados (HTA / DM2 / ERC). <button id="ar-chr-x" type="button">✕</button></div>`;
      chronicBadge.querySelector("#ar-chr-x").onclick = () => { chronicBadge.style.display = "none"; chronicBadge.innerHTML = ""; };
      return;
    }
    const lab = getLabSession();
    const analytes = (lab && lab.analytes) || {};
    const labDate = lab?.date || null;

    const cards = conds.map((cond) => {
      const rule = CHRONIC_RULES[cond];
      if (!rule) return "";
      const rows = rule.items.map((it) => {
        let dateStr = null, value = null, unit = "";
        if (it.special === "fundus") {
          dateStr = chronicFundusCache?.dateStr || null;
        } else {
          const a = analytes[it.key];
          if (a) {
            value = a.value;
            unit = LAB_DISPLAY[it.key]?.unit || a.unit || "";
            dateStr = a.date || labDate;
          }
        }
        const v = vigenciaState(dateStr, it.months);
        let metaHtml = "";
        if (it.target && value != null) {
          const num = parseNumeric(value);
          if (num != null) {
            const t = it.target(num);
            const cls = t.ok === true ? "ok" : t.ok === false ? "bad" : "warn";
            metaHtml = `<span class="ar-chr-meta ar-chr-${cls}" title="${escapeHtml(t.hint)}">${escapeHtml(String(value))}${unit ? " " + escapeHtml(unit) : ""}</span>`;
          }
        } else if (value != null) {
          metaHtml = `<span class="ar-chr-meta">${escapeHtml(String(value))}${unit ? " " + escapeHtml(unit) : ""}</span>`;
        }
        const stateIcon = v.state === "ok" ? "✅" : v.state === "warn" ? "⚠️" : v.state === "bad" ? "🔴" : "⬜";
        return `<div class="ar-chr-row ar-chr-${v.state}"><span class="ar-chr-name">${stateIcon} ${escapeHtml(it.label)}</span>${metaHtml}<span class="ar-chr-vig">${escapeHtml(v.label)}</span></div>`;
      }).join("");
      return `<div class="ar-chr-card"><div class="ar-chr-h">${rule.icon} <b>${escapeHtml(rule.label)}</b></div>${rows}</div>`;
    }).join("");

    chronicBadge.style.display = "block";
    chronicBadge.innerHTML = `<div class="ar-chr-bar"><span>🩺 Estado del paciente crónico${labDate ? " · lab " + escapeHtml(labDate) : ""}</span><span><button id="ar-chr-refresh" type="button" title="Recalcular">↻</button> <button id="ar-chr-x" type="button" title="Cerrar">✕</button></span></div><div class="ar-chr-grid">${cards}</div><div class="ar-chr-foot">Vigencias según Programa Cardiovascular MINSAL. Pulsa 🧪 Lab antes para ver valores recientes.</div>`;
    chronicBadge.querySelector("#ar-chr-x").onclick = () => { chronicBadge.style.display = "none"; chronicBadge.innerHTML = ""; };
    chronicBadge.querySelector("#ar-chr-refresh").onclick = () => openChronicPanel(true);
  }

  async function openChronicPanel(force = false) {
    toast("🩺 Calculando estado del paciente crónico...");
    const conds = detectChronicConditions();
    if (conds.includes("DM2") && (force || !chronicFundusCache)) {
      const dateStr = await maybeProbeFundus();
      chronicFundusCache = { dateStr, ts: Date.now() };
    }
    await renderChronicPanel();
  }

  let fab, ctxBadge, labBadge, recBadge, suggestBadge, intBadge, gesBadge;

  // ---------- Motor GES universal (modules/ges-engine.js + data/ges-checks.js) ----------
  let gesRunning = false;
  async function openGesPanel() {
    if (!window.__AR_GES_ENGINE) { toast("Motor GES no disponible."); return; }
    if (gesRunning) return;
    gesRunning = true;
    try {
      toast("🏥 Evaluando controles GES aplicables…");
      const ctx = window.__AR_GES_ENGINE.detectContext();
      const applies = window.__AR_GES_ENGINE.applicable(ctx);
      if (!applies.length) {
        renderGesPanel({ ctx, results: [] });
        toast("Sin chequeos GES aplicables al perfil del paciente.");
        return;
      }
      const { results } = await window.__AR_GES_ENGINE.runAll({ ctx });
      renderGesPanel({ ctx, results });
      const vencidos = results.filter((r) => r.state === "bad" || r.state === "missing").length;
      const venciendo = results.filter((r) => r.state === "warn").length;
      if (vencidos) toast(`⚠ ${vencidos} control(es) GES vencido(s)/faltante(s)`);
      else if (venciendo) toast(`⚠ ${venciendo} control(es) por vencer`);
      else toast(`✅ ${results.length} control(es) GES vigente(s)`);
    } catch (e) {
      console.error("[AR:GES]", e);
      toast("Error en motor GES: " + (e?.message || e));
    } finally {
      gesRunning = false;
    }
  }

  function renderGesPanel({ ctx, results }) {
    if (!gesBadge) return;
    const sevRank = { bad: 0, missing: 1, warn: 2, na: 3, ok: 4 };
    const sorted = results.slice().sort((a, b) => (sevRank[a.state] ?? 9) - (sevRank[b.state] ?? 9));
    const ctxLine = `Dx: ${ctx.dx.length ? ctx.dx.join(", ") : "—"} · Edad: ${ctx.age ?? "—"} · Sexo: ${ctx.sex ?? "—"}`;
    const bindings = window.__AR_GES_FLOWS ? window.__AR_GES_FLOWS.getBindings() : {};
    const rows = sorted.map((r) => {
      const icon = r.state === "ok" ? "✅"
                 : r.state === "warn" ? "⚠️"
                 : r.state === "bad" ? "🔴"
                 : r.state === "missing" ? "⬜"
                 : "❓";
      const gesTag = r.ges ? `<span class="ar-ges-tag">GES</span>` : "";
      const cat = r.category ? `<span class="ar-ges-cat">${escapeHtml(r.category)}</span>` : "";
      const checkId = r.id || r.label;
      const boundId = bindings[checkId];
      const flowBtn = boundId
        ? `<button class="ar-ges-play" data-cid="${escapeHtml(checkId)}" title="Ejecutar flujo vinculado y volver a la ficha">▶ Flujo</button>`
        : `<button class="ar-ges-bind" data-cid="${escapeHtml(checkId)}" title="Vincular un flujo grabado a este chequeo">🔗 Vincular</button>`;
      const editBind = boundId ? `<button class="ar-ges-bind" data-cid="${escapeHtml(checkId)}" title="Cambiar / quitar vínculo">⚙</button>` : "";
      return `<div class="ar-ges-row ar-ges-${r.state}">
        <span class="ar-ges-icon">${icon}</span>
        <span class="ar-ges-label">${escapeHtml(r.label)} ${gesTag}${cat}</span>
        <span class="ar-ges-msg">${escapeHtml(r.msg)}</span>
        <span class="ar-ges-actions">${flowBtn}${editBind}</span>
      </div>`;
    }).join("");
    const empty = results.length ? "" : `<div class="ar-ges-empty">Sin chequeos aplicables. Ajusta diagnósticos / edad / sexo en la ficha.</div>`;
    gesBadge.style.display = "block";
    gesBadge.innerHTML = `
      <div class="ar-ges-bar">
        <span>🏥 Controles GES — ${escapeHtml(ctxLine)}</span>
        <span><button id="ar-ges-refresh" type="button" title="Recalcular">↻</button> <button id="ar-ges-x" type="button" title="Cerrar">✕</button></span>
      </div>
      ${empty}
      <div class="ar-ges-list">${rows}</div>
      <div class="ar-ges-foot">Vincula un flujo grabado (🎬) a cada chequeo para automatizar la navegación. Al terminar se vuelve a la ficha.</div>
    `;
    gesBadge.querySelector("#ar-ges-x").onclick = () => { gesBadge.style.display = "none"; gesBadge.innerHTML = ""; };
    gesBadge.querySelector("#ar-ges-refresh").onclick = () => openGesPanel();
    gesBadge.querySelectorAll(".ar-ges-play").forEach(btn => {
      btn.onclick = () => runGesBoundFlow(btn.dataset.cid);
    });
    gesBadge.querySelectorAll(".ar-ges-bind").forEach(btn => {
      btn.onclick = () => openGesBindModal(btn.dataset.cid);
    });
  }

  async function runGesBoundFlow(checkId) {
    const bindings = window.__AR_GES_FLOWS?.getBindings() || {};
    const flowId = bindings[checkId];
    if (!flowId) { toast("Sin flujo vinculado para este chequeo."); return; }
    const all = await getFlows();
    const flow = all.find(f => f.id === flowId);
    if (!flow) { toast("Flujo vinculado no existe (¿borrado?). Revíncula."); return; }
    window.__AR_GES_FLOWS.captureFichaUrl();
    toast(`▶ Ejecutando flujo GES "${flow.name}"…`);
    try {
      await playFlow(flow);
    } catch (e) {
      console.warn("[AR:GES-flow]", e);
      toast("Error en flujo: " + (e?.message || e));
    }
    await sleep(800);
    toast("↩ Volviendo a la ficha…");
    await window.__AR_GES_FLOWS.returnToFicha();
  }

  async function openGesBindModal(checkId) {
    const all = await getFlows();
    const bindings = window.__AR_GES_FLOWS?.getBindings() || {};
    const current = bindings[checkId];
    document.getElementById("ar-ges-bind-modal")?.remove();
    document.getElementById("ar-ges-bind-back")?.remove();
    const back = document.createElement("div");
    back.id = "ar-ges-bind-back";
    back.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483646";
    const m = document.createElement("div");
    m.id = "ar-ges-bind-modal";
    m.style.cssText = "position:fixed;top:8%;left:50%;transform:translateX(-50%);width:min(560px,94vw);max-height:84vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.35);z-index:2147483647;font-family:system-ui,sans-serif;color:#0f172a;padding:16px";
    const opts = all.length
      ? all.map(f => `<label style="display:block;padding:8px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;cursor:pointer;${current === f.id ? 'background:#dbeafe;border-color:#3b82f6' : ''}">
          <input type="radio" name="ar-ges-flow" value="${escapeHtml(f.id)}" ${current === f.id ? 'checked' : ''}>
          <b>${escapeHtml(f.name)}</b>
          <small style="color:#64748b">· ${(f.samples?.length || 1)} muestra(s) · ${(f.template?.steps?.length || f.steps?.length || 0)} pasos</small>
          ${f.description ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${escapeHtml(f.description)}</div>` : ""}
        </label>`).join("")
      : `<div style="color:#64748b;text-align:center;padding:18px">Aún no tienes flujos grabados. Pulsa <b>🎬 Grabar</b> en la barra para crear uno y vuelve aquí.</div>`;
    m.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">🔗 Vincular flujo a chequeo GES</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:10px">Chequeo: <code>${escapeHtml(checkId)}</code></div>
      <div>${opts}</div>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
        ${current ? '<button id="ar-ges-bind-clear" type="button" style="background:#fee2e2;color:#991b1b;border:0;border-radius:6px;padding:8px 14px;cursor:pointer">Quitar vínculo</button>' : ''}
        <span style="flex:1"></span>
        <button id="ar-ges-bind-cancel" type="button" style="background:#e2e8f0;border:0;border-radius:6px;padding:8px 14px;cursor:pointer">Cancelar</button>
        <button id="ar-ges-bind-save" type="button" style="background:#0ea5e9;color:#fff;border:0;border-radius:6px;padding:8px 16px;cursor:pointer;font-weight:700">💾 Guardar</button>
      </div>
    `;
    document.body.appendChild(back);
    document.body.appendChild(m);
    const closeM = () => { back.remove(); m.remove(); };
    back.onclick = closeM;
    m.querySelector("#ar-ges-bind-cancel").onclick = closeM;
    m.querySelector("#ar-ges-bind-clear")?.addEventListener("click", () => {
      window.__AR_GES_FLOWS.clearBinding(checkId);
      closeM();
      openGesPanel();
    });
    m.querySelector("#ar-ges-bind-save").onclick = () => {
      const sel = m.querySelector('input[name="ar-ges-flow"]:checked');
      if (!sel) { toast("Selecciona un flujo o pulsa Quitar vínculo"); return; }
      window.__AR_GES_FLOWS.setBinding(checkId, sel.value);
      closeM();
      openGesPanel();
    };
  }

  function buildFab() {
    fab = document.createElement("div");
    fab.id = "ar-fab-wrap";
    fab.innerHTML = `
      <div id="ar-context"></div>
      <div id="ar-suggest"></div>
      <div id="ar-int-badge"></div>
      <div id="ar-fundus-badge" style="display:none"></div>
      <div id="ar-chronic-badge" style="display:none"></div>
      <div id="ar-ges-badge" style="display:none"></div>
      <div id="ar-lab-status"></div>
      <div id="ar-rec-status"></div>
      <button id="ar-fab-toggle" type="button" title="Mostrar/ocultar botones del Asistente" aria-label="Mostrar/ocultar botones">⌄</button>
      <div id="ar-fab-row">
        <button id="ar-fab-clin" type="button" title="Recursos clínicos: Dx, VFG, fármacos, flujogramas">📚 Clínico</button>
        <button id="ar-fab-rec" type="button" title="Grabar flujo (capturar pasos)">🎬 Grabar</button>
        <button id="ar-fab-lab" type="button" title="Extraer exámenes de laboratorio">🧪 Lab</button>
        <button id="ar-fab-lab-pdf" type="button" title="Cargar examen de laboratorio desde un PDF (cuando no se puede extraer desde Rayen)">📄 PDF Lab</button>
        <button id="ar-fab-fundus" type="button" title="Verificar Fondo de Ojo (Exploración vitreorretinal en últimos 24m)">👁 Fondo Ojo</button>
        <button id="ar-fab-chronic" type="button" title="Estado del paciente crónico (HTA / DM2 / ERC) — usa Dx + último Lab">🩺 Crónico</button>
        
        <button id="ar-fab-act" type="button" title="Aplicar plantillas de actividades PSCV (G1/G2/G3)">📝 Actividades</button>
        <button id="ar-fab-receta" type="button" title="Auto-completar Receta (renovación de medicamentos crónicos)">💊 Recetas</button>
        <button id="ar-fab-consultor" type="button" title="Consultor IA (Lovable AI / Gemini) — pregunta clínica con contexto sanitizado">🤖 Consultor</button>
        <button id="ar-fab-deriv" type="button" title="Derivación interna: Salud Mental, Control Crónico — genera correo con datos del paciente">✉️ Derivación</button>
        <button id="ar-fab-resumen" type="button" title="Resumen visual de la Historia Clínica del paciente (alergias, antecedentes, dx, lab)">📋 Resumen HC</button>
        
        <button id="ar-fab" type="button" title="Plantillas y flujos">⚡ Plantillas</button>
      </div>
    `;
    document.body.appendChild(fab);
    // Colapsar/expandir botones flotantes (persiste en localStorage)
    const COLLAPSE_KEY = "ar_fab_collapsed_v1";
    const toggleBtn = fab.querySelector("#ar-fab-toggle");
    const applyCollapsed = (collapsed) => {
      fab.classList.toggle("ar-collapsed", !!collapsed);
      toggleBtn.textContent = collapsed ? "⌃" : "⌄";
      toggleBtn.title = collapsed ? "Mostrar botones del Asistente" : "Ocultar botones del Asistente";
    };
    let initial = false;
    try { initial = localStorage.getItem(COLLAPSE_KEY) === "1"; } catch {}
    applyCollapsed(initial);
    toggleBtn.addEventListener("click", () => {
      const next = !fab.classList.contains("ar-collapsed");
      applyCollapsed(next);
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
    });
    ctxBadge = fab.querySelector("#ar-context");
    labBadge = fab.querySelector("#ar-lab-status");
    recBadge = fab.querySelector("#ar-rec-status");
    suggestBadge = fab.querySelector("#ar-suggest");
    intBadge = fab.querySelector("#ar-int-badge");
    fundusBadge = fab.querySelector("#ar-fundus-badge");
    chronicBadge = fab.querySelector("#ar-chronic-badge");
    gesBadge = fab.querySelector("#ar-ges-badge");
    fab.querySelector("#ar-fab").addEventListener("click", togglePanel);
    fab.querySelector("#ar-fab-lab").addEventListener("click", extractLab);
    fab.querySelector("#ar-fab-lab-pdf").addEventListener("click", () => {
      if (window.__AR_LAB_PDF) window.__AR_LAB_PDF.open();
      else toast("Cargando módulo PDF Lab...");
    });
    fab.querySelector("#ar-fab-fundus").addEventListener("click", checkFundusEval);
    fab.querySelector("#ar-fab-chronic").addEventListener("click", () => openChronicPanel(false));
    
    fab.querySelector("#ar-fab-rec").addEventListener("click", toggleRecording);
    fab.querySelector("#ar-fab-clin").addEventListener("click", () => {
      if (window.__AR_CLINICAL_UI) window.__AR_CLINICAL_UI.open();
      else toast("Cargando módulo clínico...");
    });
    fab.querySelector("#ar-fab-act").addEventListener("click", () => {
      if (window.__AR_ACT_UI) window.__AR_ACT_UI.open();
      else toast("Cargando módulo de actividades...");
    });
    fab.querySelector("#ar-fab-receta").addEventListener("click", async () => {
      const btn = fab.querySelector("#ar-fab-receta");
      const hasPatient = !!findFlaskIcon() || !!(window.__AR_PATIENT?.extract?.()?.rut);

      // Si está disponible el chooser, preguntar entre auto y emit.
      let choice = "auto";
      if (window.__AR_RECETA_EMIT?.showRecetaChooser) {
        choice = await window.__AR_RECETA_EMIT.showRecetaChooser({ hasPatient });
        if (!choice) return;
      } else if (!hasPatient) {
        toast("Abre una ficha de paciente o espera a que cargue el módulo de receta.");
        return;
      }

      if (choice === "emit") {
        try { await window.__AR_RECETA_EMIT.openEmitForm(); }
        catch (e) { toast("Error al abrir formulario: " + (e?.message || e)); console.error("[AR:RecetaEmit]", e); }
        return;
      }

      // choice === "auto" → flujo automatizado existente
      if (!window.__AR_RECETA) { toast("Cargando módulo de Recetas..."); return; }
      const origTxt = btn.textContent;
      btn.disabled = true; btn.textContent = "💊 Ejecutando…";
      try {
        await window.__AR_RECETA.run((msg, kind) => {
          if (kind === "ok") toast("✓ Receta lista");
          else if (kind === "fail") toast("✗ " + msg);
        });
        toast("✓ Receta auto-generada");
      } catch (e) {
        toast("Error en Receta: " + (e?.message || e));
        console.error("[AR:Receta] ", e);
      } finally {
        btn.disabled = false; btn.textContent = origTxt;
      }
    });
    fab.querySelector("#ar-fab-consultor")?.addEventListener("click", () => {
      if (window.__AR_CONSULTOR) window.__AR_CONSULTOR.open();
      else toast("Cargando Consultor IA…");
    });
    fab.querySelector("#ar-fab-deriv")?.addEventListener("click", () => {
      if (window.__AR_DERIV) window.__AR_DERIV.open();
      else toast("Cargando módulo de Derivación…");
    });
    fab.querySelector("#ar-fab-resumen")?.addEventListener("click", () => {
      if (window.__AR_RESUMEN_HC) window.__AR_RESUMEN_HC.open();
      else toast("Cargando Resumen HC…");
    });
    try { window.__AR_ROLE_ROUTER?.applyToFab(); } catch {}
    updateContextBadge();
    updateLabBadge();
    updateRecBadge();
    updateSuggestBadge();
    updateInteractionsBadge();
  }

  function updateInteractionsBadge() {
    if (!intBadge || !window.__AR_INTERACTIONS) return;
    window.__AR_INTERACTIONS.ready.then(() => {
      try {
        const alerts = window.__AR_INTERACTIONS.scanCurrentChart();
        if (!alerts.length) {
          intBadge.style.display = "none";
          intBadge.innerHTML = "";
          return;
        }
        const high = alerts.filter((a) => a.severity === "alta").length;
        const sev = high > 0 ? "alta" : (alerts.find((a) => a.severity === "media") ? "media" : "info");
        intBadge.style.display = "block";
        intBadge.className = `ar-int-badge ar-sev-${sev}`;
        intBadge.innerHTML = `⚠ ${alerts.length} interacción${alerts.length > 1 ? "es" : ""}${high > 0 ? ` (${high} alta)` : ""}<button class="ar-int-badge-btn" type="button">Ver</button>`;
        const btn = intBadge.querySelector(".ar-int-badge-btn");
        if (btn) btn.onclick = () => window.__AR_CLINICAL_UI?.open?.("interact");
      } catch (e) { /* silent */ }
    });
  }

  function updateContextBadge() {
    if (!ctxBadge) return;
    const ctx = readContext();
    const items = [];
    if (ctx.patient) items.push(`👤 ${escapeHtml(ctx.patient)}`);
    if (ctx.cesfam) items.push(`🏥 ${escapeHtml(ctx.cesfam)}`);
    if (ctx.section) items.push(`📍 ${escapeHtml(ctx.section)}`);
    ctxBadge.innerHTML = items.length ? items.map((i) => `<div>${i}</div>`).join("") : "";
    ctxBadge.style.display = items.length ? "block" : "none";
  }

  function updateLabBadge() {
    if (!labBadge) return;
    const lab = getLabSession();
    if (lab && lab.analytes) {
      const n = Object.keys(lab.analytes).length;
      const dbgLabel = DEBUG ? "🐞 ON" : "🐞";
      const dbgTitle = DEBUG ? "Modo debug ACTIVO — clic para desactivar" : "Activar modo debug (logs detallados en consola)";
      const alerts = collectCriticalAlerts(lab);
      const critCount = alerts.filter(a => a.severity === "critical").length;
      const warnCount = alerts.length - critCount;
      const headerSummary = alerts.length
        ? ` <span class="ar-lab-crit-pill" title="${critCount} crítico(s) · ${warnCount} alerta(s)">${critCount > 0 ? "🔴 " + critCount : ""}${critCount > 0 && warnCount > 0 ? " · " : ""}${warnCount > 0 ? "⚠️ " + warnCount : ""}</span>`
        : "";
      const critPanel = alerts.length
        ? `<div class="ar-lab-crit-panel">${alerts.map(a => `<div class="ar-lab-crit-row ar-sev-${a.severity === "critical" ? "alta" : "media"}"><span class="ar-lab-crit-name">${escapeHtml(a.name)}</span><span class="ar-lab-crit-val">${escapeHtml(String(a.value))}${a.unit ? " " + escapeHtml(a.unit) : ""}</span><span class="ar-lab-crit-reason">${escapeHtml(a.reason)}</span></div>`).join("")}</div>`
        : "";
      labBadge.innerHTML = `🧪 ${n} extraído(s)${lab.date ? " · " + escapeHtml(lab.date) : ""}${headerSummary} <span class="ar-fill-wrap"><button id="ar-fill-lab" type="button" title="Rellenar campos del formulario actual">Rellenar form.</button><span id="ar-fill-status" class="ar-fill-status ar-fst-idle" title="Pulsa para rellenar el formulario actual">Listo</span></span> <button id="ar-paste-lab" type="button" title="Pegar resumen en el campo activo">Resumen</button> <button id="ar-pdf-lab" type="button" title="Generar reporte PDF imprimible con resumen de exámenes">📄 PDF</button> <button id="ar-evo-lab" type="button" title="Curvas evolutivas de los últimos 36 meses (sólo exámenes repetidos)">📈 Evolución</button> <button id="ar-profiles-lab" type="button" title="Configurar a qué perfil pertenece cada examen">🗂 Perfiles</button> <button id="ar-edit-lab" type="button" title="Corregir mapeos de exámenes (entrena el parser local)">✏ Editar</button> <button id="ar-debug-lab" type="button" title="${dbgTitle}" style="${DEBUG ? 'background:#fde68a;color:#78350f;font-weight:700;' : ''}">${dbgLabel}</button> <button id="ar-clear-lab" type="button" title="Limpiar">✕</button>${critPanel}`;
      labBadge.style.display = "block";
      const fillBtn = labBadge.querySelector("#ar-fill-lab");
      fillBtn.addEventListener("mousedown", (e) => e.preventDefault());
      fillBtn.onclick = autofillLabIntoForm;
      const pasteBtn = labBadge.querySelector("#ar-paste-lab");
      pasteBtn.addEventListener("mousedown", (e) => e.preventDefault());
      pasteBtn.onclick = pasteLabRaw;
      const pdfBtn = labBadge.querySelector("#ar-pdf-lab");
      pdfBtn.addEventListener("mousedown", (e) => e.preventDefault());
      pdfBtn.onclick = printLabReport;
      const evoBtn = labBadge.querySelector("#ar-evo-lab");
      evoBtn.addEventListener("mousedown", (e) => e.preventDefault());
      evoBtn.onclick = showLabEvolution;
      const profBtn = labBadge.querySelector("#ar-profiles-lab");
      profBtn.addEventListener("mousedown", (e) => e.preventDefault());
      profBtn.onclick = openProfilesEditor;
      const editBtn = labBadge.querySelector("#ar-edit-lab");
      editBtn.addEventListener("mousedown", (e) => e.preventDefault());
      editBtn.onclick = openLabEditor;
      const dbgBtn = labBadge.querySelector("#ar-debug-lab");
      dbgBtn.addEventListener("mousedown", (e) => e.preventDefault());
      dbgBtn.onclick = () => {
        const now = setDebug(!DEBUG);
        toast(now ? "🐞 Modo debug ACTIVO — abre la consola (F12)" : "Modo debug desactivado");
      };
      labBadge.querySelector("#ar-clear-lab").onclick = () => {
        // Limpieza completa: sessionStorage + backup en localStorage. De lo
        // contrario, el respaldo rehidrataría la sesión y el badge volvería
        // a aparecer con datos antiguos ("arrastre").
        if (window.__AR_LAB_SESSION && typeof window.__AR_LAB_SESSION.clear === "function") {
          window.__AR_LAB_SESSION.clear();
        } else {
          try { sessionStorage.removeItem(LAB_SESSION_KEY); } catch (_) {}
          try { localStorage.removeItem("__ar_lab_backup_v1"); } catch (_) {}
        }
        autofillStatus = "idle";
        autofillStatusInfo = { filled: 0, skipped: 0, total: 0, message: "" };
        updateLabBadge();
        toast("🧪 Lab limpiado.");
      };
      // Re-sincronizar el chip con el estado actual (sobrevive a re-renders del badge)
      try { renderFillStatus(); } catch (_) {}
    } else {
      labBadge.innerHTML = "";
      labBadge.style.display = "none";
    }
  }

  // Editor de mapeos: el médico corrige un nombre mal interpretado y el alias
  // queda guardado en chrome.storage.local como override del CESFAM.
  async function openLabEditor() {
    const lab = getLabSession();
    if (!lab?.analytes) { toast("No hay lab extraído."); return; }
    const overrides = window.__AR_LAB_PARSER ? await window.__AR_LAB_PARSER.getOverrides() : {};
    const back = document.createElement("div");
    back.className = "ar-modal-back";
    const opts = Object.keys(ANALYTE_DICT).sort()
      .map((k) => `<option value="${k}">${k}</option>`).join("");
    const rows = Object.entries(lab.analytes).map(([key, a]) => `
      <tr>
        <td style="font-size:11px;max-width:280px">${escapeHtml(a.rawName || "")}</td>
        <td style="font-size:11px"><b>${escapeHtml(key)}</b>${a.subtype ? ` · ${escapeHtml(a.subtype)}` : ""}</td>
        <td>${escapeHtml(a.value || "")} ${escapeHtml(a.unit || "")}</td>
        <td>
          <select data-raw="${escapeHtml(a.rawName || "")}" data-current="${escapeHtml(key)}">
            <option value="">— mantener —</option>
            ${opts}
          </select>
        </td>
      </tr>
    `).join("");
    back.innerHTML = `
      <div class="ar-modal" style="max-width:760px">
        <header><strong>✏ Editor de mapeos de laboratorio</strong>
          <span class="ar-modal-sub">Corrige cómo se interpretó cada examen. La corrección queda guardada localmente y aplica a próximas extracciones.</span>
        </header>
        <div class="ar-modal-body" style="max-height:60vh;overflow:auto">
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <thead><tr style="background:#f1f5f9;text-align:left"><th>Nombre crudo</th><th>Mapeado a</th><th>Valor</th><th>Cambiar a</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="font-size:11px;color:#64748b;margin-top:12px">${Object.keys(overrides).length} override(s) activos. Estos se aplican a TODA extracción futura en este equipo.</p>
        </div>
        <footer>
          <button class="ar-btn ar-btn-ghost" id="ar-le-cancel">Cancelar</button>
          <button class="ar-btn ar-btn-primary" id="ar-le-save">💾 Guardar correcciones</button>
        </footer>
      </div>
    `;
    document.body.appendChild(back);
    back.querySelector("#ar-le-cancel").onclick = () => back.remove();
    back.querySelector("#ar-le-save").onclick = async () => {
      let saved = 0;
      for (const sel of back.querySelectorAll("select")) {
        const newKey = sel.value;
        if (!newKey) continue;
        const raw = sel.getAttribute("data-raw");
        if (!raw) continue;
        if (window.__AR_LAB_PARSER) await window.__AR_LAB_PARSER.addOverride(raw, newKey);
        saved++;
      }
      back.remove();
      toast(saved ? `✏ ${saved} corrección(es) guardadas. Vuelve a extraer 🧪 para verlas aplicadas.` : "Sin cambios.");
    };
    back.addEventListener("click", (e) => { if (e.target === back) back.remove(); });
  }

  let panel;
  async function togglePanel() {
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement("div");
    panel.id = "ar-panel";
    panel.innerHTML = `
      <header>
        <strong>⚡ Vínculo</strong>
        <div class="ar-actions">
          <button class="ar-btn" id="ar-capture">Capturar form.</button>
          <button class="ar-btn" id="ar-close">✕</button>
        </div>
      </header>
      <ul id="ar-list"></ul>
      <footer>
        <button class="ar-btn" id="ar-import">Importar</button>
        <button class="ar-btn" id="ar-export">Exportar</button>
        <input type="file" id="ar-file" accept="application/json" />
      </footer>
    `;
    document.body.appendChild(panel);
    panel.querySelector("#ar-close").onclick = () => { panel.remove(); panel = null; };
    panel.querySelector("#ar-capture").onclick = startCapture;
    panel.querySelector("#ar-import").onclick = () => panel.querySelector("#ar-file").click();
    panel.querySelector("#ar-file").onchange = onImport;
    panel.querySelector("#ar-export").onclick = onExport;
    await renderList();
  }

  async function renderList() {
    if (!panel) return;
    const list = panel.querySelector("#ar-list");
    const tpls = await getTemplates();
    if (!tpls.length) {
      list.innerHTML = `<div class="ar-empty">Sin plantillas todavía.<br/>Llena un formulario y pulsa <b>Capturar formulario</b>, o importa un JSON.</div>`;
      return;
    }
    list.innerHTML = "";
    tpls.forEach((t, i) => {
      const li = document.createElement("li");
      const hasPh = (t.fields || []).some((f) => typeof f.value === "string" && f.value.includes("{{lab."));
      li.innerHTML = `
        <div>
          <div class="ar-name">${escapeHtml(t.name)} ${hasPh ? '<span class="ar-tag">lab</span>' : ""}</div>
          <div class="ar-desc">${escapeHtml(t.description || "")} · ${(t.fields || []).length} campos</div>
        </div>
        <button class="ar-del" title="Eliminar">🗑</button>
      `;
      li.querySelector(".ar-del").onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Eliminar plantilla "${t.name}"?`)) return;
        const all = await getTemplates();
        all.splice(i, 1);
        await setTemplates(all);
        renderList();
      };
      li.onclick = () => applyTemplate(t);
      list.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // =====================================================================
  // Capture flow
  // =====================================================================
  function startCapture() {
    if (panel) { panel.remove(); panel = null; }
    document.documentElement.classList.add("ar-capture-active");
    const banner = document.createElement("div");
    banner.className = "ar-capture-banner";
    banner.innerHTML = `Modo captura activo — llena los campos y luego presiona <button id="ar-do-capture">Guardar plantilla</button> <button id="ar-cancel-capture">Cancelar</button>`;
    document.body.appendChild(banner);
    banner.querySelector("#ar-cancel-capture").onclick = () => {
      banner.remove();
      document.documentElement.classList.remove("ar-capture-active");
    };
    banner.querySelector("#ar-do-capture").onclick = async () => {
      const fields = captureFields();
      if (!fields.length) { alert("No detecté campos con valores."); return; }
      const name = prompt(`Nombre de la plantilla (${fields.length} campos detectados):`, "Plantilla " + new Date().toLocaleString());
      if (!name) { banner.remove(); document.documentElement.classList.remove("ar-capture-active"); return; }
      const description = prompt("Descripción opcional:", "") || "";
      const tpls = await getTemplates();
      tpls.push({ id: crypto.randomUUID(), name, description, fields, createdAt: Date.now() });
      await setTemplates(tpls);
      banner.remove();
      document.documentElement.classList.remove("ar-capture-active");
      toast("Plantilla guardada: " + name);
    };
  }

  // =====================================================================
  // Import / export
  // =====================================================================
  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = Array.isArray(parsed) ? parsed : parsed.templates;
      if (!Array.isArray(incoming)) throw new Error("Formato inválido");
      const current = await getTemplates();
      const merged = [...current, ...incoming.map((t) => ({ id: t.id || crypto.randomUUID(), ...t }))];
      await setTemplates(merged);
      toast(`Importadas ${incoming.length} plantilla(s)`);
      renderList();
    } catch (err) {
      alert("No se pudo importar: " + err.message);
    } finally {
      e.target.value = "";
    }
  }
  async function onExport() {
    const tpls = await getTemplates();
    const blob = new Blob([JSON.stringify({ templates: tpls }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `asistente-rayen-plantillas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // =====================================================================
  // Quick picker
  // =====================================================================
  let picker;
  async function openQuickPicker() {
    if (picker) { picker.remove(); picker = null; return; }
    const tpls = await getTemplates();
    picker = document.createElement("div");
    picker.id = "ar-picker";
    picker.innerHTML = `<input type="text" placeholder="Buscar plantilla..." /><ul></ul>`;
    document.body.appendChild(picker);
    const input = picker.querySelector("input");
    const ul = picker.querySelector("ul");
    let active = 0;
    function render(filter) {
      const f = (filter || "").toLowerCase();
      const matched = tpls.filter((t) => t.name.toLowerCase().includes(f) || (t.description || "").toLowerCase().includes(f));
      ul.innerHTML = matched.length
        ? matched.map((t, i) => `<li data-idx="${i}" class="${i === active ? "active" : ""}"><b>${escapeHtml(t.name)}</b> <span style="color:#64748b">${escapeHtml(t.description || "")}</span></li>`).join("")
        : `<li style="color:#64748b">Sin resultados</li>`;
      ul.querySelectorAll("li[data-idx]").forEach((li) => {
        li.onclick = () => { applyTemplate(matched[+li.dataset.idx]); close(); };
      });
      return matched;
    }
    function close() { picker?.remove(); picker = null; }
    let current = render("");
    input.focus();
    input.addEventListener("input", () => { active = 0; current = render(input.value); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(); }
      else if (e.key === "ArrowDown") { active = Math.min(active + 1, current.length - 1); render(input.value); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); render(input.value); e.preventDefault(); }
      else if (e.key === "Enter" && current[active]) { applyTemplate(current[active]); close(); }
    });
  }


  // =====================================================================
  // Recording (modo grabación) + Replay (reproducción paso a paso)
  // =====================================================================
  let recBuffer = null;       // { steps: [], startedAt, formTitle, url, lastTs }
  let recPaused = false;
  const REC_LISTENERS = [];

  function readFormTitle() {
    // Heurística: heading del form activo, o título visible más grande cerca
    const sels = [
      "form h1", "form h2", "form h3",
      ".tab-content .active h1", ".tab-content .active h2", ".tab-content .active h3",
      ".panel-title", ".card-title", ".modal-title",
      "h1", "h2",
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.textContent.trim()) return el.textContent.trim().slice(0, 120);
    }
    return document.title.trim().slice(0, 120);
  }

  function makeStep(type, target, extras) {
    const ts = Date.now();
    const delay = recBuffer.lastTs ? Math.min(ts - recBuffer.lastTs, 5000) : 0;
    recBuffer.lastTs = ts;
    return Object.assign({ type, target, delay }, extras || {});
  }

  function isInsideAR(el) {
    return el && el.closest && el.closest("#ar-fab-wrap, #ar-panel, #ar-picker, #ar-toast, .ar-rec-banner");
  }

  function recHandlers() {
    return {
      click: (e) => {
        if (recPaused || isInsideAR(e.target)) return;
        const sel = cssPath(e.target);
        if (!sel) return;
        recBuffer.steps.push(makeStep("click", sel, {
          text: (e.target.textContent || e.target.value || "").trim().slice(0, 60),
          tag: e.target.tagName.toLowerCase(),
        }));
        flashElement(e.target);
        updateRecBadge();
      },
      change: (e) => {
        if (recPaused || isInsideAR(e.target)) return;
        const el = e.target;
        if (!(el.matches && el.matches("input,select,textarea"))) return;
        const sel = cssPath(el);
        if (!sel) return;
        let value;
        if (el.type === "checkbox" || el.type === "radio") value = el.checked;
        else value = el.value;
        // Evitar duplicados consecutivos del mismo selector (input + change)
        const last = recBuffer.steps[recBuffer.steps.length - 1];
        if (last && last.type === "fill" && last.target === sel) {
          last.value = value;
          return;
        }
        recBuffer.steps.push(makeStep("fill", sel, {
          value,
          inputType: el.type || el.tagName.toLowerCase(),
          label: labelFor(el),
        }));
        updateRecBadge();
      },
      keydown: (e) => {
        if (recPaused || isInsideAR(e.target)) return;
        if (["Enter", "Tab", "Escape"].includes(e.key)) {
          recBuffer.steps.push(makeStep("key", cssPath(e.target) || "body", { key: e.key }));
          updateRecBadge();
        }
      },
    };
  }

  function labelFor(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim().slice(0, 60);
    }
    const wrap = el.closest("label");
    if (wrap) return wrap.textContent.trim().slice(0, 60);
    return el.name || el.placeholder || el.id || el.tagName.toLowerCase();
  }

  function flashElement(el) {
    if (!el || !el.classList) return;
    el.classList.add("ar-rec-flash");
    setTimeout(() => el.classList.remove("ar-rec-flash"), 600);
  }

  function startRecording() {
    if (recBuffer) return;
    recBuffer = {
      steps: [],
      startedAt: Date.now(),
      lastTs: 0,
      url: location.href,
      formTitle: readFormTitle(),
      context: readContext(),
    };
    recPaused = false;
    setRecState({ active: true, startedAt: recBuffer.startedAt });
    const h = recHandlers();
    document.addEventListener("click", h.click, true);
    document.addEventListener("change", h.change, true);
    document.addEventListener("keydown", h.keydown, true);
    REC_LISTENERS.push(["click", h.click], ["change", h.change], ["keydown", h.keydown]);
    showRecBanner();
    toast("🎬 Grabación iniciada — interactúa normalmente con el formulario.");
    updateRecBadge();
  }

  async function stopRecordingAndSave() {
    if (!recBuffer) return;
    while (REC_LISTENERS.length) {
      const [ev, fn] = REC_LISTENERS.pop();
      document.removeEventListener(ev, fn, true);
    }
    hideRecBanner();
    const steps = recBuffer.steps;
    const buffered = recBuffer;
    recBuffer = null;
    setRecState(null);
    updateRecBadge();
    if (!steps.length) {
      toast("Grabación cancelada (sin pasos detectados).");
      return;
    }
    // Preguntar si añadir muestra a un flujo existente similar
    const all = await getFlows();
    const candidates = all.filter((f) =>
      (f.formTitle && buffered.formTitle && f.formTitle === buffered.formTitle) ||
      (f.url && samePath(f.url, buffered.url)),
    );
    let target = null;
    if (candidates.length) {
      const list = candidates.map((f, i) => `  ${i + 1}. ${f.name} (${f.samples?.length || 1} muestra/s)`).join("\n");
      const ans = prompt(
        `Detecté flujos parecidos. Escribe el NÚMERO para añadir esta grabación como muestra adicional, o deja vacío para crear un flujo nuevo:\n\n${list}`,
        "",
      );
      const n = parseInt(ans || "", 10);
      if (n >= 1 && n <= candidates.length) target = candidates[n - 1];
    }
    const labs = getLabSession()?.analytes || {};
    const newSample = { steps, capturedAt: Date.now(), url: buffered.url };
    if (target) {
      target.samples = target.samples || [];
      target.samples.push(newSample);
      if (window.__AR_LEARN) {
        target.template = window.__AR_LEARN.consolidate(target.samples, { labs });
      }
      await setFlows(all);
      toast(`✅ Muestra añadida a "${target.name}" (${target.samples.length} total · ${Math.round((target.template?.confidence || 0) * 100)}% confianza)`);
      if (panel) renderList();
      updateSuggestBadge();
      return;
    }
    const defaultName = buffered.formTitle || "Flujo " + new Date().toLocaleString();
    const name = prompt(`Nombre del flujo (${steps.length} pasos detectados):`, defaultName);
    if (!name) { toast("Grabación descartada."); return; }
    const description = prompt("Descripción opcional:", "") || "";
    const flow = {
      id: crypto.randomUUID(),
      name,
      description,
      url: buffered.url,
      formTitle: buffered.formTitle,
      steps, // legado para compatibilidad
      samples: [newSample],
      template: window.__AR_LEARN ? window.__AR_LEARN.consolidate([newSample], { labs }) : null,
      feedback: { plays: [] },
      createdAt: Date.now(),
    };
    all.push(flow);
    await setFlows(all);
    toast(`✅ Flujo guardado: ${name} (${steps.length} pasos · 1 muestra)`);
    if (panel) renderList();
    updateSuggestBadge();
  }

  function cancelRecording() {
    if (!recBuffer) return;
    while (REC_LISTENERS.length) {
      const [ev, fn] = REC_LISTENERS.pop();
      document.removeEventListener(ev, fn, true);
    }
    recBuffer = null;
    setRecState(null);
    hideRecBanner();
    updateRecBadge();
    toast("Grabación cancelada.");
  }

  function toggleRecording() {
    if (recBuffer) stopRecordingAndSave();
    else startRecording();
  }

  let recBanner;
  function showRecBanner() {
    if (recBanner) return;
    recBanner = document.createElement("div");
    recBanner.className = "ar-rec-banner";
    recBanner.innerHTML = `
      <span class="ar-rec-dot"></span>
      <span>Grabando flujo — <b id="ar-rec-count">0</b> paso(s)</span>
      <button id="ar-rec-pause">Pausar</button>
      <button id="ar-rec-save">Guardar</button>
      <button id="ar-rec-cancel">Cancelar</button>
    `;
    document.body.appendChild(recBanner);
    recBanner.querySelector("#ar-rec-pause").onclick = (e) => {
      recPaused = !recPaused;
      e.target.textContent = recPaused ? "Reanudar" : "Pausar";
    };
    recBanner.querySelector("#ar-rec-save").onclick = stopRecordingAndSave;
    recBanner.querySelector("#ar-rec-cancel").onclick = cancelRecording;
  }
  function hideRecBanner() { recBanner?.remove(); recBanner = null; }

  function updateRecBadge() {
    if (!recBadge) return;
    if (recBuffer) {
      recBadge.style.display = "block";
      recBadge.innerHTML = `<span class="ar-rec-dot"></span> ${recBuffer.steps.length} paso(s) capturados`;
      const c = recBanner?.querySelector("#ar-rec-count");
      if (c) c.textContent = String(recBuffer.steps.length);
    } else {
      recBadge.style.display = "none";
      recBadge.innerHTML = "";
    }
  }

  // -------- Reproducción paso a paso --------
  // Devuelve los pasos a reproducir: prefiere el template consolidado;
  // si no existe, cae al sample original (compatibilidad v0.8).
  function flowPlaySteps(flow) {
    if (flow?.template?.steps?.length) return flow.template.steps.map((s, gi) => ({ ...s, __gi: gi }));
    return (flow?.steps || []).map((s, gi) => ({ ...s, __gi: gi, selectors: [s.target], required: true, variability: "variable" }));
  }

  async function playFlow(flow) {
    const steps = flowPlaySteps(flow);
    if (!steps.length) { toast("Flujo vacío."); return; }
    const fillSteps = steps.filter((s) => s.type === "fill");
    const overrides = await askForOverrides(flow, fillSteps);
    if (overrides === null) { toast("Reproducción cancelada."); return; }

    toast(`▶️ Reproduciendo "${flow.name}" (${steps.length} pasos)`);
    let played = 0, failed = 0, fallbackUsed = 0;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await sleep(Math.max(40, Math.min(step.delay || 80, 350)));
      try {
        const r = await playStep(step, overrides);
        if (r === true || r?.ok) {
          played++;
          if (r?.fallback) fallbackUsed++;
        } else if (step.required === false) {
          // pasos opcionales no consolidados que no se encontraron: NO cuentan como fallo
          played++;
        } else {
          failed++;
        }
      } catch (err) {
        console.warn("[AR] step error", err, step);
        if (step.required === false) played++; else failed++;
      }
    }
    // Telemetría local
    if (window.__AR_LEARN) {
      window.__AR_LEARN.appendPlayResult(flow, { ok: played, failed, totalSteps: steps.length, fallbackUsed });
      try {
        const all = await getFlows();
        const idx = all.findIndex((f) => f.id === flow.id);
        if (idx >= 0) { all[idx] = flow; await setFlows(all); }
      } catch {}
    }
    toast(`✅ Reproducción terminada: ${played} ok · ${failed} fallaron${fallbackUsed ? " · " + fallbackUsed + " con fallback" : ""}`);
  }

  function askForOverrides(flow, fillSteps) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "ar-modal-back";
      const labs = getLabSession()?.analytes || {};
      // Sólo pedir confirmación de campos `variable` o `patient-specific`.
      // Los `static` se autocompletan sin molestar.
      const visible = fillSteps.filter((s) => s.variability !== "static");
      back.innerHTML = `
        <div class="ar-modal">
          <header><strong>▶️ ${escapeHtml(flow.name)}</strong>
            <span class="ar-modal-sub">${visible.length} campo(s) a confirmar · ${fillSteps.length - visible.length} estáticos · ${flow.template?.sampleCount || 1} muestra/s</span>
          </header>
          <div class="ar-modal-body"></div>
          <footer>
            <button class="ar-btn ar-btn-ghost" id="ar-ov-cancel">Cancelar</button>
            <button class="ar-btn ar-btn-primary" id="ar-ov-go">▶ Reproducir</button>
          </footer>
        </div>
      `;
      document.body.appendChild(back);
      const body = back.querySelector(".ar-modal-body");
      const overrides = {};
      visible.forEach((s, i) => {
        const id = "ar-ov-" + i;
        // Pre-rellenar desde labs si patient-specific
        let initial = s.value;
        if (s.variability === "patient-specific" && s.labKey && labs[s.labKey]) {
          initial = labs[s.labKey].value;
        }
        overrides[i] = initial;
        const row = document.createElement("div");
        row.className = "ar-ov-row";
        const isBool = typeof s.value === "boolean";
        const tag = s.variability === "patient-specific" ? `<span style="font-size:10px;color:#0ea5a4;font-weight:700">[lab.${escapeHtml(s.labKey)}]</span>` : "";
        row.innerHTML = `
          <label for="${id}">${escapeHtml(s.label || s.target)} ${tag}</label>
          ${isBool
            ? `<input id="${id}" type="checkbox" ${initial ? "checked" : ""} />`
            : `<textarea id="${id}" rows="1">${escapeHtml(String(initial ?? ""))}</textarea>`}
        `;
        body.appendChild(row);
        const inp = row.querySelector("#" + id);
        inp.addEventListener("input", () => { overrides[i] = isBool ? inp.checked : inp.value; });
        inp.addEventListener("change", () => { overrides[i] = isBool ? inp.checked : inp.value; });
      });
      back.querySelector("#ar-ov-cancel").onclick = () => { back.remove(); resolve(null); };
      back.querySelector("#ar-ov-go").onclick = () => {
        const map = new Map();
        let vIdx = 0;
        fillSteps.forEach((s) => {
          if (s.variability === "static") {
            map.set(s.__gi, s.value);
          } else {
            map.set(s.__gi, overrides[vIdx++]);
          }
        });
        back.remove();
        resolve(map);
      };
    });
  }

  // Resuelve el elemento de un paso usando cascada de selectores y anclas semánticas.
  function resolveStepElement(step) {
    const tries = [];
    if (step.selectors?.length) tries.push(...step.selectors);
    if (step.target) tries.push(step.target);
    for (const sel of tries) {
      const el = safeQuery(sel);
      if (el) return { el, fallback: false };
    }
    // Cascada semántica: por label visible coincidente
    const lbl = (step.semanticTarget?.label || step.label || "").trim().toLowerCase();
    if (lbl) {
      const labels = Array.from(document.querySelectorAll("label, .form-label, .control-label"));
      for (const l of labels) {
        if ((l.textContent || "").trim().toLowerCase().startsWith(lbl.slice(0, Math.min(40, lbl.length)))) {
          const forId = l.getAttribute("for");
          if (forId) {
            const found = document.getElementById(forId);
            if (found) return { el: found, fallback: true };
          }
          const inside = l.parentElement?.querySelector("input,select,textarea,button");
          if (inside) return { el: inside, fallback: true };
        }
      }
    }
    // Cascada por texto visible (clicks en botones)
    const text = (step.semanticTarget?.text || "").trim();
    if (text && step.type === "click") {
      const btns = Array.from(document.querySelectorAll("button, a, [role='button']"));
      for (const b of btns) {
        if ((b.textContent || "").trim().toLowerCase() === text.toLowerCase()) {
          return { el: b, fallback: true };
        }
      }
    }
    return null;
  }

  async function playStep(step, overridesMap) {
    let resolved = await waitFor(() => resolveStepElement(step), { timeout: 2500, interval: 40 });
    if (!resolved) return { ok: false };
    const { el, fallback } = resolved;
    el.scrollIntoView({ block: "center", behavior: "auto" });
    flashElement(el);
    if (step.type === "click") {
      el.click();
      return { ok: true, fallback };
    }
    if (step.type === "fill") {
      const stepIdx = step.__gi;
      const v = overridesMap && overridesMap.has(stepIdx) ? overridesMap.get(stepIdx) : step.value;
      if (step.inputType === "checkbox" || step.inputType === "radio") {
        el.checked = !!v;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (el.tagName === "SELECT") {
        setNativeValue(el, v);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.focus();
        setNativeValue(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.blur();
      }
      return { ok: true, fallback };
    }
    if (step.type === "key") {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: step.key, bubbles: true }));
      return { ok: true, fallback };
    }
    return { ok: false };
  }

  function safeQuery(sel) {
    try { return document.querySelector(sel); } catch { return null; }
  }

  // -------- Sugerencia automática del flujo según URL + título --------
  async function updateSuggestBadge() {
    if (!suggestBadge) return;
    const flows = await getFlows();
    if (!flows.length) { suggestBadge.style.display = "none"; suggestBadge.innerHTML = ""; return; }
    const currUrl = location.href;
    const currTitle = readFormTitle().toLowerCase();
    const matches = flows
      .map((f) => {
        let score = 0;
        if (f.url && samePath(f.url, currUrl)) score += 2;
        if (f.formTitle && currTitle.includes(f.formTitle.toLowerCase().slice(0, 30))) score += 2;
        if (f.name && currTitle.includes(f.name.toLowerCase().slice(0, 20))) score += 1;
        return { f, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!matches.length) { suggestBadge.style.display = "none"; suggestBadge.innerHTML = ""; return; }
    const best = matches[0].f;
    suggestBadge.style.display = "block";
    suggestBadge.innerHTML = `💡 Flujo sugerido: <b>${escapeHtml(best.name)}</b> <button id="ar-play-suggest">▶ Reproducir</button>`;
    suggestBadge.querySelector("#ar-play-suggest").onclick = () => {
      playFlow(best);
    };
  }

  function samePath(a, b) {
    try { return new URL(a).pathname === new URL(b).pathname; } catch { return false; }
  }

  // Hook into renderList: añadir flujos al panel
  const _origRenderList = renderList;
  renderList = async function () {
    if (!panel) return;
    await _origRenderList();
    // Añadir sección de flujos debajo de la lista de plantillas
    const list = panel.querySelector("#ar-list");
    const flows = await getFlows();
    if (!flows.length) return;
    const sep = document.createElement("div");
    sep.className = "ar-section-title";
    sep.textContent = "Flujos grabados";
    list.appendChild(sep);
    flows.forEach((flow, i) => {
      const li = document.createElement("li");
      li.className = "ar-flow-item";
      const samples = flow.samples?.length || 1;
      const conf = Math.round((flow.template?.confidence || 0) * 100);
      const stepsCount = flow.template?.steps?.length || flow.steps?.length || 0;
      const health = window.__AR_LEARN ? window.__AR_LEARN.healthScore(flow) : null;
      const healthTxt = health != null ? ` · 💚 ${health}%` : "";
      li.innerHTML = `
        <div>
          <div class="ar-name">🎬 ${escapeHtml(flow.name)}</div>
          <div class="ar-desc">${escapeHtml(flow.formTitle || "")} · ${stepsCount} pasos · ${samples} muestra${samples > 1 ? "s" : ""}${conf ? " · " + conf + "% conf" : ""}${healthTxt}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="ar-btn-mini ar-play" title="Reproducir">▶</button>
          <button class="ar-btn-mini ar-add-sample" title="Grabar otra muestra para entrenar este flujo">+ muestra</button>
          <button class="ar-btn-mini ar-flow-info" title="Ver pasos consolidados">⚙</button>
          <button class="ar-btn-mini ar-del-flow" title="Eliminar">🗑</button>
        </div>
      `;
      li.querySelector(".ar-play").onclick = (e) => {
        e.stopPropagation();
        playFlow(flow);
      };
      li.querySelector(".ar-add-sample").onclick = (e) => {
        e.stopPropagation();
        toast(`🎬 Iniciando grabación. Al terminar, elige "${flow.name}" para añadir la muestra.`);
        startRecording();
      };
      li.querySelector(".ar-flow-info").onclick = (e) => {
        e.stopPropagation();
        showFlowInsight(flow);
      };
      li.querySelector(".ar-del-flow").onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Eliminar flujo "${flow.name}"?`)) return;
        const all = await getFlows();
        const idx = all.findIndex((f) => f.id === flow.id);
        if (idx >= 0) all.splice(idx, 1);
        await setFlows(all);
        renderList();
        updateSuggestBadge();
      };
      list.appendChild(li);
    });
  };

  function showFlowInsight(flow) {
    const back = document.createElement("div");
    back.className = "ar-modal-back";
    const steps = flow.template?.steps || flow.steps || [];
    const rows = steps.map((s, i) => {
      const v = s.variability || "—";
      const reqTxt = s.required === false ? "<i>opcional</i>" : "<b>requerido</b>";
      const ex = (s.valueExamples || []).slice(0, 3).map(escapeHtml).join(" · ");
      return `<tr><td>${i + 1}</td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.label || s.target || "")}</td><td>${reqTxt}<br/><span style="font-size:10px;color:#64748b">${Math.round((s.frequency || 1) * 100)}%</span></td><td>${escapeHtml(v)}${s.labKey ? `<br/><span style="font-size:10px;color:#0ea5a4">lab.${escapeHtml(s.labKey)}</span>` : ""}</td><td style="font-size:10px;color:#64748b">${ex}</td></tr>`;
    }).join("");
    const conf = Math.round((flow.template?.confidence || 0) * 100);
    const health = window.__AR_LEARN ? window.__AR_LEARN.healthScore(flow) : null;
    back.innerHTML = `
      <div class="ar-modal" style="max-width:780px">
        <header><strong>⚙ ${escapeHtml(flow.name)}</strong>
          <span class="ar-modal-sub">${flow.samples?.length || 1} muestra/s · ${steps.length} pasos · ${conf}% confianza${health != null ? " · 💚 " + health + "%" : ""}</span>
        </header>
        <div class="ar-modal-body" style="max-height:60vh;overflow:auto">
          <table style="width:100%;font-size:12px;border-collapse:collapse" class="ar-flow-insight">
            <thead><tr style="background:#f1f5f9;text-align:left"><th>#</th><th>Tipo</th><th>Etiqueta / target</th><th>Requerido</th><th>Variabilidad</th><th>Ejemplos</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <footer><button class="ar-btn ar-btn-primary" id="ar-fi-close">Cerrar</button></footer>
      </div>
    `;
    document.body.appendChild(back);
    back.querySelector("#ar-fi-close").onclick = () => back.remove();
    back.addEventListener("click", (e) => { if (e.target === back) back.remove(); });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "AR_OPEN_QUICK_PICKER") openQuickPicker();
    if (msg?.type === "AR_DATA_STATUS") {
      try {
        const status = window.__AR_DATA?.status?.() || null;
        const bundle = window.__AR_DATA?.exportBundle?.() || null;
        sendResponse({ ...(status || {}), bundle });
      } catch (e) {
        sendResponse({ error: String(e?.message || e) });
      }
      return true;
    }
    if (msg?.type === "AR_RULESET_VERSION") {
      try {
        if (window.__AR_RULESET_VERSION?.compute) {
          window.__AR_RULESET_VERSION.compute().then((r) => sendResponse(r))
            .catch((e) => sendResponse({ error: String(e?.message || e) }));
          return true;
        }
        sendResponse(null);
      } catch (e) { sendResponse({ error: String(e?.message || e) }); }
      return true;
    }
  });

  // =====================================================================
  // === Recordatorios clínicos (banners no invasivos) ===================
  // =====================================================================
  // Reglas APS por defecto. Cada regla:
  //  - id: identificador único (para configurar)
  //  - label: texto mostrado al médico
  //  - category: para filtrar/colorear
  //  - severity: "info" | "warn" | "high"
  //  - applies(ctx): bool — ¿aplica a este paciente?
  //  - missing(ctx): bool — ¿está faltando lo que pide?
  //  - hint?: explicación corta cuando se expande
  const REMINDER_RULES_KEY = "reminder_settings_v1";
  const REMINDER_DISMISS_KEY = "__ar_dismissed_v1";
  const DEFAULT_REMINDER_RULES = [
    // === Crónicos: DM2 ===
    { id: "dm2_fondo_ojo", label: "Fondo de ojo (DM2)", category: "DM2", severity: "warn",
      windowMonths: 24, hint: "Norma MINSAL: control oftalmológico cada 2 años en DM2 (vigencia GES si fondo de ojo negativo)." },
    { id: "dm2_pie_diabetico", label: "Evaluación pie diabético (DM2)", category: "DM2", severity: "warn",
      windowMonths: 12, hint: "Examen anual de pie en pacientes diabéticos." },
    { id: "dm2_hba1c", label: "HbA1c (DM2)", category: "DM2", severity: "high",
      windowMonths: 6, hint: "HbA1c cada 3-6 meses según control." },
    { id: "dm2_microalbuminuria", label: "Microalbuminuria / RAC (DM2)", category: "DM2", severity: "warn",
      windowMonths: 12, hint: "Tamizaje anual de nefropatía diabética." },
    { id: "dm2_creatinina", label: "Creatinina + VFG (DM2)", category: "DM2", severity: "warn",
      windowMonths: 12 },
    // === Crónicos: HTA ===
    { id: "hta_pa_reciente", label: "PA registrada (HTA)", category: "HTA", severity: "warn",
      windowMonths: 6, hint: "Control de presión arterial al menos cada 6 meses." },
    { id: "hta_lipidos", label: "Perfil lipídico (HTA)", category: "HTA", severity: "info",
      windowMonths: 12 },
    { id: "hta_creatinina", label: "Creatinina anual (HTA)", category: "HTA", severity: "info",
      windowMonths: 12 },
    // === Vacunas ===
    { id: "vac_influenza", label: "Vacuna influenza (temporada)", category: "Vacunas", severity: "warn",
      windowMonths: 10, hint: "Campaña anual marzo-mayo en Chile." },
    { id: "vac_neumo_65", label: "Vacuna neumocócica 65+", category: "Vacunas", severity: "info",
      windowMonths: 60, minAge: 65 },
    // === EMP / EMPAM ===
    { id: "empa_adulto", label: "EMPA (15-64a)", category: "EMP", severity: "info",
      windowMonths: 36, minAge: 15, maxAge: 64 },
    { id: "empam", label: "EMPAM (65+)", category: "EMP", severity: "warn",
      windowMonths: 12, minAge: 65 },
  ];

  async function getReminderSettings() {
    try {
      const data = await chrome.storage.local.get({ [REMINDER_RULES_KEY]: null });
      const stored = data[REMINDER_RULES_KEY];
      if (!stored) return { enabled: true, rules: Object.fromEntries(DEFAULT_REMINDER_RULES.map((r) => [r.id, { enabled: true, windowMonths: r.windowMonths }])) };
      // merge con defaults para reglas nuevas
      const merged = { ...stored, rules: { ...stored.rules } };
      DEFAULT_REMINDER_RULES.forEach((r) => {
        if (!merged.rules[r.id]) merged.rules[r.id] = { enabled: true, windowMonths: r.windowMonths };
      });
      return merged;
    } catch {
      return { enabled: true, rules: {} };
    }
  }

  function getDismissedToday() {
    try {
      const raw = sessionStorage.getItem(REMINDER_DISMISS_KEY);
      if (!raw) return new Set();
      const data = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (data.day !== today) return new Set();
      return new Set(data.ids || []);
    } catch { return new Set(); }
  }
  function dismissReminder(id) {
    const set = getDismissedToday();
    set.add(id);
    sessionStorage.setItem(REMINDER_DISMISS_KEY, JSON.stringify({
      day: new Date().toISOString().slice(0, 10),
      ids: [...set],
    }));
  }

  // ----------- ¿Estamos dentro de la ficha clínica de un paciente? -----
  // Heurística defensiva: solo activamos recordatorios cuando hay señales
  // claras de que el médico está atendiendo a un paciente, NO en login,
  // dashboard, agenda, listado de pacientes, etc.
  function isInsidePatientChart() {
    try {
      // 1) Pista de URL: ficha clínica suele estar en /main, /atencion, /ficha, /clinico
      const path = (location.pathname || "").toLowerCase();
      const goodPath = /\/(main|atencion|ficha|clinico|consulta|paciente)/i.test(path);

      // 2) Pista DOM: tabs/headers típicos de ficha en Rayen (datos del paciente,
      //    diagnósticos, anamnesis, examen físico, indicaciones).
      const txt = (document.body?.innerText || "").toLowerCase();
      const sectionHits = [
        /anamnesis/.test(txt),
        /examen\s+f.sico/.test(txt),
        /diagn.sticos?/.test(txt),
        /motivo\s+de\s+consulta/.test(txt),
        /indicaci(o|ó)n(es)?/.test(txt),
        /antecedentes?/.test(txt),
      ].filter(Boolean).length;

      // 3) Pista identificadora: RUT chileno o "ficha clínica" visibles
      const hasRut = /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/.test(txt) || /\brut\b/.test(txt);
      const hasFichaWord = /ficha\s+cl.nica|datos\s+del\s+paciente/.test(txt);

      // 4) Marcador estructural: botón de exámenes (matraz) o panel lateral con paciente
      const hasFlask = !!findFlaskIcon();

      // Score: requiere combinación, evita falsos positivos en login.
      const score =
        (goodPath ? 1 : 0) +
        (sectionHits >= 2 ? 2 : sectionHits >= 1 ? 1 : 0) +
        (hasRut ? 1 : 0) +
        (hasFichaWord ? 1 : 0) +
        (hasFlask ? 1 : 0);

      return score >= 3;
    } catch {
      return false;
    }
  }

  // ----------- Lectura heurística de la ficha clínica ------------------
  function readPatientClinicalContext() {
    const allText = (document.body?.innerText || "").toLowerCase();
    // edad: busca "XX años"
    let age = null;
    const ageMatch = allText.match(/(\d{1,3})\s*a(ñ|n)os/);
    if (ageMatch) {
      const n = parseInt(ageMatch[1], 10);
      if (n > 0 && n < 120) age = n;
    }
    // sexo
    let sex = null;
    if (/sexo[:\s]+femenino|\bfemenino\b/.test(allText)) sex = "F";
    else if (/sexo[:\s]+masculino|\bmasculino\b/.test(allText)) sex = "M";
    // diagnósticos activos: busca menciones DM2/HTA en bloques de diagnósticos o problemas
    const hasDM2 = /\b(diabetes\s+mellitus(?:\s+tipo\s*2|\s+2)?|dm\s*tipo\s*2|dm2|e11|diabetico|diabetica)\b/.test(allText);
    const hasHTA = /\b(hipertensi[oó]n\s+arterial|hta|i10)\b/.test(allText);
    return { age, sex, hasDM2, hasHTA, allText };
  }

  // Busca la fecha más reciente asociada a una palabra clave en el texto plano de la ficha.
  // Devuelve un Date o null.
  function findLastDateForKeyword(text, keywords) {
    let best = null;
    for (const kw of keywords) {
      const re = new RegExp("(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4})[^\\n]{0,80}" + kw + "|" + kw + "[^\\n]{0,80}(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4})", "gi");
      let m;
      while ((m = re.exec(text)) !== null) {
        const ds = m[1] || m[2];
        const d = parseLocalDate(ds);
        if (d && (!best || d > best)) best = d;
      }
    }
    return best;
  }
  function parseLocalDate(s) {
    if (!s) return null;
    const parts = s.split(/[/\-]/);
    if (parts.length !== 3) return null;
    let [d, m, y] = parts.map((p) => parseInt(p, 10));
    if (y < 100) y += 2000;
    if (!d || !m || !y || m > 12 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function monthsBetween(d1, d2) {
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  }

  // Influenza: temporada activa marzo-octubre
  function influenzaSeasonActive() {
    const m = new Date().getMonth() + 1;
    return m >= 3 && m <= 10;
  }

  // Evalúa todas las reglas y retorna pendientes.
  async function computeReminders() {
    const settings = await getReminderSettings();
    if (!settings.enabled) return [];
    // GATE: solo dentro de ficha clínica de un paciente
    if (!isInsidePatientChart()) return [];
    const ctx = readPatientClinicalContext();
    if (!ctx.age && !ctx.hasDM2 && !ctx.hasHTA) return []; // ficha vacía/no es paciente
    const lab = getLabSession();
    const labDate = lab?.date ? parseLocalDate(lab.date) : null;
    const text = ctx.allText;
    const now = new Date();
    const out = [];

    function check(ruleId, condition, lastDate) {
      const cfg = settings.rules[ruleId];
      if (!cfg || !cfg.enabled) return;
      const def = DEFAULT_REMINDER_RULES.find((r) => r.id === ruleId);
      if (!def) return;
      if (!condition) return;
      const win = cfg.windowMonths || def.windowMonths;
      const overdue = !lastDate || monthsBetween(lastDate, now) >= win;
      if (overdue) {
        out.push({
          id: ruleId,
          label: def.label,
          category: def.category,
          severity: def.severity,
          hint: def.hint,
          lastDate,
          windowMonths: win,
        });
      }
    }

    // === DM2 ===
    if (ctx.hasDM2) {
      check("dm2_fondo_ojo", true, findLastDateForKeyword(text, ["fondo de ojo", "fo ", "oftalmolog"]));
      check("dm2_pie_diabetico", true, findLastDateForKeyword(text, ["pie diab", "evaluaci.n.{0,10}pie", "score de pie"]));
      check("dm2_hba1c", true, lab?.analytes?.hba1c ? labDate : findLastDateForKeyword(text, ["hba1c", "hemoglobina glic"]));
      check("dm2_microalbuminuria", true, lab?.analytes?.microalbuminuria || lab?.analytes?.rac ? labDate : findLastDateForKeyword(text, ["microalbumin", "rac ", "albumina creatin"]));
      check("dm2_creatinina", true, lab?.analytes?.creatinina ? labDate : findLastDateForKeyword(text, ["creatinina", "vfg", "egfr"]));
    }
    // === HTA ===
    if (ctx.hasHTA) {
      check("hta_pa_reciente", true, findLastDateForKeyword(text, ["presi.n arterial", "pa[: ]", "p\\.a\\."]));
      check("hta_lipidos", true, lab?.analytes?.colesterol_total || lab?.analytes?.ldl ? labDate : findLastDateForKeyword(text, ["perfil lip.dico", "colesterol", "ldl"]));
      check("hta_creatinina", true, lab?.analytes?.creatinina ? labDate : findLastDateForKeyword(text, ["creatinina", "vfg"]));
    }
    // === Vacunas ===
    if (influenzaSeasonActive()) {
      check("vac_influenza", true, findLastDateForKeyword(text, ["influenza", "antigripal"]));
    }
    if (ctx.age && ctx.age >= 65) {
      check("vac_neumo_65", true, findLastDateForKeyword(text, ["neumoc.cica", "neumo 23", "ppsv", "pcv"]));
    }
    // === EMP ===
    if (ctx.age && ctx.age >= 15 && ctx.age <= 64) {
      check("empa_adulto", true, findLastDateForKeyword(text, ["empa ", "examen medicina preventiva"]));
    }
    if (ctx.age && ctx.age >= 65) {
      check("empam", true, findLastDateForKeyword(text, ["empam", "examen.{0,30}adulto.{0,15}mayor"]));
    }

    // Filtrar dismissed
    const dismissed = getDismissedToday();
    return out.filter((r) => !dismissed.has(r.id));
  }

  // ---- UI: banner + badge contador --------------------------------------
  let remindersBadge = null;
  let remindersBanner = null;
  let remindersSidePanel = null;
  let lastReminders = [];

  async function refreshReminders() {
    try {
      // Si no estamos en ficha, ocultar todo y salir rápido (sin scan caro).
      if (!isInsidePatientChart()) {
        lastReminders = [];
        renderRemindersBadge();
        if (remindersBanner) { remindersBanner.remove(); remindersBanner = null; }
        if (remindersSidePanel) renderRemindersSidePanel();
        return;
      }
      lastReminders = await computeReminders();
    } catch (e) {
      log("error reminders", e);
      lastReminders = [];
    }
    renderRemindersBadge();
    renderRemindersBanner();
    if (remindersSidePanel) renderRemindersSidePanel();
  }

  function renderRemindersBadge() {
    if (!remindersBadge) return;
    const n = lastReminders.length;
    if (n === 0) {
      remindersBadge.style.display = "none";
      remindersBadge.innerHTML = "";
      return;
    }
    const top = lastReminders.slice(0, 1).map((r) => r.label).join(", ");
    remindersBadge.style.display = "block";
    remindersBadge.innerHTML = `🔔 <b>${n}</b> recordatorio${n > 1 ? "s" : ""} pendiente${n > 1 ? "s" : ""} <button id="ar-rem-open" type="button" title="Ver detalle">Ver</button>`;
    const btn = remindersBadge.querySelector("#ar-rem-open");
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.onclick = toggleRemindersSidePanel;
  }

  function renderRemindersBanner() {
    if (lastReminders.length === 0) {
      if (remindersBanner) { remindersBanner.remove(); remindersBanner = null; }
      return;
    }
    if (!remindersBanner) {
      remindersBanner = document.createElement("div");
      remindersBanner.className = "ar-rem-banner";
      document.body.appendChild(remindersBanner);
    }
    const top = lastReminders.slice(0, 3);
    const more = lastReminders.length - top.length;
    const sevColor = (s) => s === "high" ? "#dc2626" : s === "warn" ? "#d97706" : "#2563eb";
    remindersBanner.innerHTML = `
      <span class="ar-rem-icon">🔔</span>
      <div class="ar-rem-list">
        ${top.map((r) => `<span class="ar-rem-pill" style="border-color:${sevColor(r.severity)};color:${sevColor(r.severity)}" title="${escapeHtml(r.hint || "")}">${escapeHtml(r.category)}: ${escapeHtml(r.label)}</span>`).join("")}
        ${more > 0 ? `<span class="ar-rem-more">+${more} más</span>` : ""}
      </div>
      <button class="ar-rem-detail" type="button">Detalle</button>
      <button class="ar-rem-dismiss-all" type="button" title="Ocultar todos hoy">✕</button>
    `;
    remindersBanner.querySelector(".ar-rem-detail").onclick = toggleRemindersSidePanel;
    remindersBanner.querySelector(".ar-rem-dismiss-all").onclick = () => {
      lastReminders.forEach((r) => dismissReminder(r.id));
      lastReminders = [];
      renderRemindersBadge();
      renderRemindersBanner();
      if (remindersSidePanel) renderRemindersSidePanel();
    };
  }

  let remindersTab = "pending"; // "pending" | "config"
  function toggleRemindersSidePanel() {
    if (remindersSidePanel) {
      remindersSidePanel.remove();
      remindersSidePanel = null;
      return;
    }
    remindersSidePanel = document.createElement("div");
    remindersSidePanel.id = "ar-rem-panel";
    document.body.appendChild(remindersSidePanel);
    renderRemindersSidePanel();
  }

  async function renderRemindersSidePanel() {
    if (!remindersSidePanel) return;
    const sevBg = (s) => s === "high" ? "#fee2e2" : s === "warn" ? "#fef3c7" : "#dbeafe";
    const sevFg = (s) => s === "high" ? "#991b1b" : s === "warn" ? "#78350f" : "#1e40af";
    const fmtDate = (d) => d ? d.toLocaleDateString("es-CL") : "sin registro";
    const fmtAge = (d) => {
      if (!d) return "—";
      const m = monthsBetween(d, new Date());
      if (m < 1) return "este mes";
      if (m < 12) return `hace ${m} mes${m > 1 ? "es" : ""}`;
      const y = Math.floor(m / 12);
      return `hace ${y} año${y > 1 ? "s" : ""}`;
    };
    const tabsHtml = `
      <div class="ar-rem-tabs">
        <button class="ar-rem-tab ${remindersTab === "pending" ? "active" : ""}" data-tab="pending">Pendientes (${lastReminders.length})</button>
        <button class="ar-rem-tab ${remindersTab === "config" ? "active" : ""}" data-tab="config">⚙ Configurar</button>
      </div>
    `;

    if (remindersTab === "config") {
      const settings = await getReminderSettings();
      const grouped = {};
      DEFAULT_REMINDER_RULES.forEach((r) => { (grouped[r.category] ||= []).push(r); });
      remindersSidePanel.innerHTML = `
        <header>
          <strong>🔔 Recordatorios</strong>
          <button id="ar-rem-close">✕</button>
        </header>
        ${tabsHtml}
        <div class="ar-rem-body">
          <label class="ar-rem-master">
            <input type="checkbox" id="ar-rem-master-toggle" ${settings.enabled ? "checked" : ""} />
            <span>Activar recordatorios globalmente</span>
          </label>
          ${Object.entries(grouped).map(([cat, items]) => `
            <div class="ar-rem-group">
              <div class="ar-rem-cat">${escapeHtml(cat)}</div>
              ${items.map((r) => {
                const cfg = settings.rules[r.id] || { enabled: true, windowMonths: r.windowMonths };
                return `
                  <div class="ar-rem-cfg">
                    <label class="ar-rem-cfg-row">
                      <input type="checkbox" data-rid="${r.id}" class="ar-rem-cfg-en" ${cfg.enabled ? "checked" : ""} />
                      <span class="ar-rem-cfg-label">${escapeHtml(r.label)}</span>
                    </label>
                    <div class="ar-rem-cfg-win">
                      Avisar si pasaron <input type="number" min="1" max="120" data-rid="${r.id}" class="ar-rem-cfg-mo" value="${cfg.windowMonths}" /> meses
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `).join("")}
        </div>
        <footer>
          <button id="ar-rem-reset" class="ar-rem-foot-btn">Restaurar valores por defecto</button>
        </footer>
      `;
      remindersSidePanel.querySelector("#ar-rem-close").onclick = toggleRemindersSidePanel;
      remindersSidePanel.querySelectorAll(".ar-rem-tab").forEach((b) => {
        b.onclick = () => { remindersTab = b.dataset.tab; renderRemindersSidePanel(); };
      });
      remindersSidePanel.querySelector("#ar-rem-master-toggle").onchange = async (e) => {
        const s = await getReminderSettings();
        s.enabled = e.target.checked;
        await chrome.storage.local.set({ [REMINDER_RULES_KEY]: s });
        refreshReminders();
      };
      remindersSidePanel.querySelectorAll(".ar-rem-cfg-en").forEach((cb) => {
        cb.onchange = async () => {
          const s = await getReminderSettings();
          s.rules[cb.dataset.rid] = { ...(s.rules[cb.dataset.rid] || {}), enabled: cb.checked };
          await chrome.storage.local.set({ [REMINDER_RULES_KEY]: s });
          refreshReminders();
        };
      });
      remindersSidePanel.querySelectorAll(".ar-rem-cfg-mo").forEach((inp) => {
        inp.onchange = async () => {
          const v = Math.max(1, Math.min(120, parseInt(inp.value, 10) || 12));
          inp.value = v;
          const s = await getReminderSettings();
          s.rules[inp.dataset.rid] = { ...(s.rules[inp.dataset.rid] || {}), windowMonths: v };
          await chrome.storage.local.set({ [REMINDER_RULES_KEY]: s });
          refreshReminders();
        };
      });
      remindersSidePanel.querySelector("#ar-rem-reset").onclick = async () => {
        if (!confirm("¿Restaurar la configuración de recordatorios a los valores por defecto?")) return;
        await chrome.storage.local.remove(REMINDER_RULES_KEY);
        renderRemindersSidePanel();
        refreshReminders();
      };
      return;
    }

    // Tab "pending"
    if (lastReminders.length === 0) {
      remindersSidePanel.innerHTML = `
        <header><strong>🔔 Recordatorios</strong><button id="ar-rem-close">✕</button></header>
        ${tabsHtml}
        <div class="ar-rem-empty">✅ Sin pendientes para este paciente.</div>
      `;
      remindersSidePanel.querySelector("#ar-rem-close").onclick = toggleRemindersSidePanel;
      remindersSidePanel.querySelectorAll(".ar-rem-tab").forEach((b) => {
        b.onclick = () => { remindersTab = b.dataset.tab; renderRemindersSidePanel(); };
      });
      return;
    }
    const grouped = {};
    lastReminders.forEach((r) => {
      (grouped[r.category] ||= []).push(r);
    });
    remindersSidePanel.innerHTML = `
      <header>
        <strong>🔔 Recordatorios</strong>
        <button id="ar-rem-close">✕</button>
      </header>
      ${tabsHtml}
      <div class="ar-rem-body">
        ${Object.entries(grouped).map(([cat, items]) => `
          <div class="ar-rem-group">
            <div class="ar-rem-cat">${escapeHtml(cat)}</div>
            ${items.map((r) => `
              <div class="ar-rem-item" style="background:${sevBg(r.severity)};color:${sevFg(r.severity)}">
                <div class="ar-rem-item-head">
                  <strong>${escapeHtml(r.label)}</strong>
                  <button class="ar-rem-x" data-id="${r.id}" title="Ocultar hoy">✕</button>
                </div>
                <div class="ar-rem-meta">Último: ${fmtDate(r.lastDate)} (${fmtAge(r.lastDate)}) · Ventana: ${r.windowMonths}m</div>
                ${r.hint ? `<div class="ar-rem-hint">${escapeHtml(r.hint)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
      <footer>
        <span class="ar-rem-foot">Detección heurística desde la ficha. Revisa siempre antes de actuar.</span>
      </footer>
    `;
    remindersSidePanel.querySelector("#ar-rem-close").onclick = toggleRemindersSidePanel;
    remindersSidePanel.querySelectorAll(".ar-rem-tab").forEach((b) => {
      b.onclick = () => { remindersTab = b.dataset.tab; renderRemindersSidePanel(); };
    });
    remindersSidePanel.querySelectorAll(".ar-rem-x").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        dismissReminder(id);
        lastReminders = lastReminders.filter((r) => r.id !== id);
        renderRemindersBadge();
        renderRemindersBanner();
        renderRemindersSidePanel();
      };
    });
  }

  // Exponer en debug
  window.__arDebug.reminders = () => { console.table(lastReminders); return lastReminders; };
  window.__arDebug.refreshReminders = refreshReminders;

  // =====================================================================
  // Host bridge para módulos clínicos (clinical-ui.js)
  // =====================================================================
  window.__AR_HOST = window.__AR_HOST || {};
  window.__AR_HOST.getLabSession = getLabSession;
  window.__AR_HOST.setLabSession = setLabSession;
  window.__AR_HOST.updateLabBadge = updateLabBadge;
  window.__AR_HOST.autofillLabIntoForm = autofillLabIntoForm;
  window.__AR_HOST.getLabSession = getLabSession;
  window.__AR_HOST.isValueInRange = isValueInRange;
  window.__AR_HOST.ANALYTE_RANGES = ANALYTE_RANGES;
  window.__AR_HOST.buildLabSummary = buildLabSummary;
  window.__AR_HOST.printLabReport = printLabReport;
  window.__AR_HOST.getContext = readContext;
  window.__AR_HOST.toast = toast;
  // Registrar diccionario en el módulo compartido (__AR_DICT) para que otros
  // módulos puedan usar matchAnalyte sin duplicar el catálogo.
  if (window.__AR_DICT && window.__AR_DICT._setDict) {
    try { window.__AR_DICT._setDict(ANALYTE_DICT, ANALYTE_RANGES, matchAnalyte); } catch (_) {}
  }
  window.__AR_HOST.pasteIntoActive = function (text) {
    if (!text) return;
    let active = document.activeElement;
    // Si el foco está dentro de cualquier UI propia, usar el último campo de Rayen.
    if (!isEditable(active) || (active && active.closest && active.closest("#ar-fab-wrap, #ar-panel, #ar-modal, #ar-clin"))) {
      active = lastEditableEl;
    }
    // Validar que el elemento siga vivo en el DOM (Rayen es SPA y re-renderiza).
    if (!isEditable(active) || !active.isConnected) {
      toast("Click en un campo de texto de la ficha y reintenta.");
      return;
    }
    try { active.focus(); } catch (_) {}
    try {
      if (active.isContentEditable) {
        const sep = active.textContent ? "\n" : "";
        active.textContent = (active.textContent || "") + sep + text;
        active.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        const sep = active.value ? "\n" : "";
        setNativeValue(active, (active.value || "") + sep + text);
        active.dispatchEvent(new Event("input", { bubbles: true }));
        active.dispatchEvent(new Event("change", { bubbles: true }));
      }
      lastEditableEl = active;
      toast("📋 Pegado.");
    } catch (err) {
      console.error("[AR] pasteIntoActive error:", err);
      toast("No se pudo pegar. Reintenta haciendo click en el campo.");
    }
  };

  // =====================================================================
  // Boot + observer para refrescar contexto
  // =====================================================================
  function boot() {
    if (!document.body) { setTimeout(boot, 200); return; }
    buildFab();
    // Inyectar badge de recordatorios en el FAB (después de buildFab para que exista)
    if (fab && !fab.querySelector("#ar-reminders")) {
      const remDiv = document.createElement("div");
      remDiv.id = "ar-reminders";
      fab.insertBefore(remDiv, fab.querySelector("#ar-suggest"));
      remindersBadge = remDiv;
    }
    refreshReminders();
    // Refrescar contexto cuando cambie el DOM (debounce alto para no saturar CPU
    // y para evitar parpadeo del banner mientras el usuario navega).
    const obs = new MutationObserver(() => {
      clearTimeout(window.__ar_ctx_t);
      window.__ar_ctx_t = setTimeout(() => {
        updateContextBadge();
        updateSuggestBadge();
        refreshReminders();
        updateInteractionsBadge();
      }, 1500);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: false });
  }
  boot();
})();
