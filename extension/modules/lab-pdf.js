/* Vínculo — Carga de exámenes desde PDF
 *
 * Permite al médico subir un PDF de laboratorio (por ejemplo BioDATA u otros
 * laboratorios externos) cuando no es posible extraerlos desde el panel
 * lateral de Rayen. Reutiliza el mismo parser (__AR_LAB_PARSER + diccionario
 * compartido) que la extracción nativa, por lo que las funciones del badge
 * "🧪 Lab" (Rellenar form., Resumen, PDF, Evolución, Críticos, etc.) operan
 * exactamente igual sobre los datos cargados desde PDF.
 *
 * Privacidad: el PDF se procesa COMPLETAMENTE en el navegador con pdf.js
 * (vendor/pdf.min.js). Nada sale del computador.
 */
(function () {
  if (window.__AR_LAB_PDF) return;

  const H = () => window.__AR_HOST || {};

  // ---------------- pdf.js worker bootstrap ----------------
  let pdfReady = null;
  function ensurePdfJs() {
    if (pdfReady) return pdfReady;
    pdfReady = new Promise((resolve, reject) => {
      const lib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
      if (!lib) {
        reject(new Error("pdf.js no está disponible"));
        return;
      }
      try {
        lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
          "vendor/pdf.worker.min.js",
        );
      } catch (_) {
        // Si falla la asignación del worker, intentamos en modo "fake worker"
        try { lib.GlobalWorkerOptions.workerSrc = ""; } catch {}
      }
      resolve(lib);
    });
    return pdfReady;
  }

  // ---------------- Extracción de texto por filas ----------------
  // pdf.js devuelve items con transform (matriz 6 floats). transform[5] = y.
  // Agrupamos por y (redondeado) para reconstruir filas de tabla.
  async function extractRows(file) {
    const pdfjsLib = await ensurePdfJs();
    const buf = await file.arrayBuffer();
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      // pdf.js trae cmaps/standard fonts; sin worker fetch local los
      // saltamos: no afecta texto latino básico.
      isEvalSupported: false,
      disableFontFace: true,
    });
    const pdf = await task.promise;
    const rows = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const byY = new Map();
      for (const it of tc.items) {
        if (!it || !it.str) continue;
        const y = Math.round(it.transform[5]);
        const x = it.transform[4];
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push({ x, str: it.str });
      }
      const ys = [...byY.keys()].sort((a, b) => b - a); // top → bottom
      for (const y of ys) {
        const items = byY.get(y).sort((a, b) => a.x - b.x);
        // Conservamos los tokens individuales: nos sirven para separar
        // columnas con un umbral de gap horizontal.
        rows.push({ page: p, y, items });
      }
    }
    return rows;
  }

  // ---------------- Parsing de una fila ----------------
  // Estrategia: convertimos los items en "celdas" separando cuando el gap
  // horizontal supera ~6pt. Luego buscamos:
  //   [name-cells...] [value-cell con número] [unit-cell?] [range-cell?]
  const NUM_RE = /^(?:[<>]=?|↑|↓|\*)?\s*-?\d+(?:[.,]\d+)?$/;
  const UNIT_RE = /(mg\/dL|mg\/dl|g\/dL|g\/dl|mEq\/L|mmol\/L|µ?g\/L|ug\/L|U\/L|UI\/L|%|fL|pg|mm\/hr|mL\/min|10\^?[36]\/uL|x\s*10|ng\/mL|µIU\/mL|mUI\/L|mIU\/L|seg|s\b|mg\/g|ratio)/i;

  function cellsFromItems(items) {
    if (!items.length) return [];
    const cells = [];
    let cur = { x: items[0].x, str: items[0].str };
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      const prev = items[i - 1];
      const gap = it.x - (prev.x + (prev.str.length * 3)); // estimación
      if (gap > 8) {
        cells.push(cur);
        cur = { x: it.x, str: it.str };
      } else {
        cur.str += (cur.str.endsWith(" ") || it.str.startsWith(" ") ? "" : " ") + it.str;
      }
    }
    cells.push(cur);
    return cells.map((c) => ({ x: c.x, str: c.str.trim() })).filter((c) => c.str);
  }

  function parseLabRow(row) {
    const cells = cellsFromItems(row.items);
    if (cells.length < 2) return null;
    // Buscar la primera celda que sea numérica (resultado)
    let valueIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      if (NUM_RE.test(cells[i].str.replace(/\s+/g, ""))) { valueIdx = i; break; }
    }
    if (valueIdx <= 0) return null;
    const name = cells.slice(0, valueIdx).map((c) => c.str).join(" ").trim();
    if (!name || name.length < 3) return null;
    let value = cells[valueIdx].str.replace(/[↑↓*]/g, "").trim();
    let unit = "";
    let range = "";
    if (cells[valueIdx + 1]) {
      const next = cells[valueIdx + 1].str;
      if (UNIT_RE.test(next) || /^[a-zA-Zµ%/0-9^.\s-]+$/.test(next) && next.length < 20) {
        unit = next.trim();
      }
    }
    if (cells[valueIdx + 2]) range = cells[valueIdx + 2].str.trim();
    return { name, value, unit, range };
  }

  // Extrae primera fecha tipo dd-mm-yyyy o dd/mm/yyyy del texto completo.
  function extractDate(rows) {
    const flat = rows.map((r) => r.items.map((i) => i.str).join(" ")).join("\n");
    const m = flat.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    return m ? `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3]}` : "";
  }

  // ---------------- Pipeline principal ----------------
  async function parsePdfToAnalytes(file) {
    const rows = await extractRows(file);
    if (!rows.length) throw new Error("No se pudo leer texto del PDF (¿escaneado?).");

    const dict = (window.__AR_DICT && window.__AR_DICT.ANALYTE_DICT) || {};
    if (!Object.keys(dict).length) {
      throw new Error("Diccionario de analitos no disponible. Recarga la página.");
    }
    const parser = window.__AR_LAB_PARSER;
    const overrides = parser ? await parser.getOverrides() : {};

    const date = extractDate(rows);
    // Recolectamos TODAS las ocurrencias por key/subkey, luego elegimos la mejor.
    const candidates = {}; // key -> [entry, ...]
    let scanned = 0;
    let pages = new Set();

    for (const row of rows) {
      pages.add(row.page);
      const r = parseLabRow(row);
      if (!r) continue;
      scanned++;
      const parsed = parser
        ? parser.parseRow({ ...r, date, flag: null }, dict, overrides)
        : null;
      if (!parsed || !parsed.key) continue;
      const key = parsed.key;
      const subtype = parsed.subtype;
      const qualifier = parsed.qualifier;
      const entry = {
        rawName: r.name,
        value: r.value,
        unit: r.unit,
        range: r.range,
        date,
        subtype,
        qualifier,
        flag: null,
        page: row.page,
      };
      const storeKey = (key === "glicemia" && subtype) ? `glicemia.${subtype}` : key;
      if (!candidates[storeKey]) candidates[storeKey] = [];
      candidates[storeKey].push(entry);
    }

    // Elegir la mejor ocurrencia: 1) en rango plausible, 2) la primera.
    const analytes = {};
    const validator = (window.__AR_HOST && window.__AR_HOST.isValueInRange) || null;
    for (const [k, list] of Object.entries(candidates)) {
      const baseKey = k.split(".")[0];
      let best = list[0];
      if (validator) {
        const inRange = list.find((e) => validator(baseKey, e.value).ok);
        if (inRange) best = inRange;
      }
      analytes[k] = best;
    }
    const matched = Object.keys(analytes).filter((k) => !k.includes(".")).length;
    return { analytes, date, scanned, matched, pages: pages.size };
  }

  // ---------------- UI: modal de carga ----------------
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Compara la unidad reportada con la esperada para el analito.
  // Devuelve "ok" | "warn" | "unknown".
  function checkUnit(expected, got) {
    if (!expected) return "unknown";
    if (!got) return "warn";
    const norm = (s) => String(s).toLowerCase().replace(/\s+/g, "").replace(/µ/g, "u");
    const e = norm(expected).split(/ó|\//).filter(Boolean);
    const g = norm(got);
    // Aceptar si alguna parte de la unidad esperada está contenida en la reportada.
    if (e.some((part) => g.includes(part.split(/[^a-z0-9%]/)[0]))) return "ok";
    return "warn";
  }

  function renderPreview(out, file, container, onConfirm) {
    const validator = (window.__AR_HOST && window.__AR_HOST.isValueInRange) || null;
    const ranges = (window.__AR_HOST && window.__AR_HOST.ANALYTE_RANGES) || {};
    const keys = Object.keys(out.analytes).sort();
    const rows = keys.map((k) => {
      const a = out.analytes[k];
      const baseKey = k.split(".")[0];
      const range = ranges[baseKey];
      const v = validator ? validator(baseKey, a.value) : { ok: true, num: null, range };
      const numOk = v.ok;
      const numIsNumeric = v.num != null;
      const unitState = checkUnit(range?.unit, a.unit);
      const suspicious = (!numOk && numIsNumeric) || unitState === "warn";
      const label = k.replace("glicemia.", "glicemia (") + (k.startsWith("glicemia.") ? ")" : "");
      const valueCell = numIsNumeric && !numOk
        ? `<b style="color:#b91c1c">${escapeHtml(a.value)}</b>`
        : escapeHtml(a.value);
      const unitCell = unitState === "warn"
        ? `<span style="color:#b91c1c" title="Unidad esperada: ${escapeHtml(range?.unit || "?")}">${escapeHtml(a.unit || "—")} ⚠</span>`
        : escapeHtml(a.unit || "—");
      const expected = range ? `${range.min}–${range.max} ${range.unit || ""}` : "—";
      const flag = suspicious
        ? `<span class="ar-labpdf-flag" title="${!numOk ? "Valor fuera de rango plausible" : "Unidad sospechosa"}">⚠</span>`
        : "";
      return `
        <tr class="${suspicious ? "ar-row-warn" : ""}">
          <td><input type="checkbox" class="ar-labpdf-row" data-key="${escapeHtml(k)}" ${suspicious ? "" : "checked"}/></td>
          <td>${escapeHtml(label)} ${flag}</td>
          <td class="ar-num">${valueCell}</td>
          <td>${unitCell}</td>
          <td class="ar-rng">${escapeHtml(expected)}</td>
          <td class="ar-pg">p.${a.page || "?"}</td>
        </tr>
      `;
    }).join("");
    const warnCount = container.querySelectorAll ? 0 : 0; // placeholder
    container.innerHTML = `
      <p class="ar-labpdf-help" style="margin-bottom:8px">
        <b>${keys.filter(k=>!k.includes(".")).length}</b> analito(s) detectado(s) en <b>${out.pages || 1}</b> página(s)
        ${out.date ? "· fecha " + escapeHtml(out.date) : ""}.
        Revisa los valores marcados en <span style="color:#b91c1c">rojo</span> (fuera de rango o unidad sospechosa) antes de rellenar.
      </p>
      <div class="ar-labpdf-tablewrap">
        <table class="ar-labpdf-table">
          <thead><tr>
            <th><input type="checkbox" class="ar-labpdf-all" checked title="Seleccionar/deseleccionar todo"/></th>
            <th>Analito</th><th>Valor</th><th>Unidad</th><th>Rango plausible</th><th>Pág.</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="ar-labpdf-actions" style="display:flex;justify-content:space-between;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button type="button" class="ar-labpdf-cancel">Cancelar</button>
        <span style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="ar-labpdf-summary" title="Ver/copiar resumen de texto (no requiere paciente abierto)">📋 Resumen</button>
          <button type="button" class="ar-labpdf-pdf" title="Generar reporte PDF imprimible (no requiere paciente abierto)">📄 PDF</button>
          <button type="button" class="ar-labpdf-save">Guardar sólo en 🧪 Lab</button>
          <button type="button" class="ar-labpdf-fill">⤵ Rellenar formulario</button>
        </span>
      </div>
    `;
    const all = container.querySelector(".ar-labpdf-all");
    all.addEventListener("change", () => {
      container.querySelectorAll(".ar-labpdf-row").forEach((c) => { c.checked = all.checked; });
    });
    const getSelected = () => {
      const sel = {};
      container.querySelectorAll(".ar-labpdf-row:checked").forEach((c) => {
        const k = c.getAttribute("data-key");
        if (out.analytes[k]) sel[k] = out.analytes[k];
      });
      return sel;
    };
    container.querySelector(".ar-labpdf-cancel").addEventListener("click", () => onConfirm(null));
    container.querySelector(".ar-labpdf-save").addEventListener("click", () => onConfirm({ analytes: getSelected(), fill: false, file, date: out.date }));
    container.querySelector(".ar-labpdf-fill").addEventListener("click", () => onConfirm({ analytes: getSelected(), fill: true, file, date: out.date }));
    container.querySelector(".ar-labpdf-summary").addEventListener("click", () => onConfirm({ analytes: getSelected(), action: "summary", file, date: out.date }));
    container.querySelector(".ar-labpdf-pdf").addEventListener("click", () => onConfirm({ analytes: getSelected(), action: "pdf", file, date: out.date }));
  }

  // Modal de resumen autónomo (no requiere paciente abierto ni campo de texto activo).
  function openSummaryModal(text) {
    document.querySelectorAll(".ar-labpdf-sum-back").forEach((n) => n.remove());
    const back = document.createElement("div");
    back.className = "ar-labpdf-back ar-labpdf-sum-back";
    back.innerHTML = `
      <div class="ar-labpdf-card ar-labpdf-wide" role="dialog" aria-modal="true" aria-label="Resumen de laboratorio">
        <div class="ar-labpdf-head">
          <b>📋 Resumen de laboratorio</b>
          <button class="ar-labpdf-x" type="button" title="Cerrar">✕</button>
        </div>
        <div class="ar-labpdf-body">
          <p class="ar-labpdf-help">Resumen listo para copiar. Puedes pegarlo en cualquier campo de la ficha o en otra aplicación.</p>
          <textarea class="ar-labpdf-sum-text" readonly style="width:100%;min-height:320px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#0f172a;white-space:pre"></textarea>
          <div class="ar-labpdf-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
            <button type="button" class="ar-labpdf-sum-copy">📋 Copiar al portapapeles</button>
            <button type="button" class="ar-labpdf-sum-close">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(back);
    const ta = back.querySelector(".ar-labpdf-sum-text");
    ta.value = text || "(sin contenido)";
    const close = () => back.remove();
    back.querySelector(".ar-labpdf-x").addEventListener("click", close);
    back.querySelector(".ar-labpdf-sum-close").addEventListener("click", close);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    back.querySelector(".ar-labpdf-sum-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        H().toast?.("📋 Resumen copiado al portapapeles.");
      } catch (_) {
        ta.select();
        try { document.execCommand("copy"); H().toast?.("📋 Copiado."); } catch {}
      }
    });
    setTimeout(() => { try { ta.focus(); ta.select(); } catch {} }, 50);
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function openUploader() {
    document.querySelectorAll(".ar-labpdf-back").forEach((n) => n.remove());

    const back = document.createElement("div");
    back.className = "ar-labpdf-back";
    back.innerHTML = `
      <div class="ar-labpdf-card ar-labpdf-wide" role="dialog" aria-modal="true" aria-label="Cargar examen desde PDF">
        <div class="ar-labpdf-head">
          <b>📄 Cargar examen de laboratorio (PDF)</b>
          <button class="ar-labpdf-x" type="button" title="Cerrar">✕</button>
        </div>
        <div class="ar-labpdf-body">
          <div class="ar-labpdf-stage1">
            <p class="ar-labpdf-help">
              Soporta PDFs de <b>una o varias páginas</b>. Se procesa <b>localmente</b> en tu computador
              (no se envía a internet). Tras la lectura podrás revisar los valores antes de rellenar el formulario.
            </p>
            <label class="ar-labpdf-drop" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed #94a3b8;border-radius:12px;padding:32px 16px;text-align:center;cursor:pointer;background:#f8fafc;transition:background .15s,border-color .15s,transform .1s;min-height:160px">
              <input type="file" accept="application/pdf,.pdf" class="ar-labpdf-input" style="display:none"/>
              <div class="ar-labpdf-drop-icon" style="font-size:40px;line-height:1">📄</div>
              <div class="ar-labpdf-drop-l"><b>Arrastra aquí el PDF</b> o haz clic para elegirlo</div>
              <div style="color:#64748b;font-size:12px">Sólo .pdf · procesado localmente · no se envía a internet</div>
            </label>

            <!-- Tarjeta de previsualización del archivo -->
            <div class="ar-labpdf-file" style="display:none;margin-top:12px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;background:#fff;align-items:center;gap:12px">
              <div style="font-size:28px;line-height:1">📕</div>
              <div style="flex:1;min-width:0">
                <div class="ar-labpdf-file-name" style="font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
                <div class="ar-labpdf-file-meta" style="color:#64748b;font-size:12px"></div>
              </div>
              <button type="button" class="ar-labpdf-file-clear" title="Quitar archivo" style="border:none;background:transparent;color:#64748b;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px">✕</button>
            </div>

            <!-- Barra de progreso indeterminada -->
            <div class="ar-labpdf-progress" style="display:none;margin-top:10px;height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden">
              <div class="ar-labpdf-progress-bar" style="height:100%;width:35%;background:linear-gradient(90deg,#0284c7,#38bdf8);border-radius:999px;animation:ar-labpdf-slide 1.1s ease-in-out infinite"></div>
            </div>

            <!-- Mensaje de estado -->
            <div class="ar-labpdf-status" aria-live="polite" role="status" style="margin-top:10px;min-height:22px;font-size:13px"></div>
          </div>
          <div class="ar-labpdf-stage2" style="display:none"></div>
        </div>
      </div>
    `;
    document.body.appendChild(back);

    // Inyectar keyframes una sola vez.
    if (!document.getElementById("ar-labpdf-anim")) {
      const st = document.createElement("style");
      st.id = "ar-labpdf-anim";
      st.textContent = `
        @keyframes ar-labpdf-slide {
          0% { margin-left: -35%; }
          100% { margin-left: 100%; }
        }
        .ar-labpdf-drop.is-drag { background:#e0f2fe !important; border-color:#0284c7 !important; transform:scale(1.01); }
        .ar-labpdf-drop:hover { background:#f1f5f9; border-color:#64748b; }
      `;
      document.head.appendChild(st);
    }

    const close = () => back.remove();
    back.querySelector(".ar-labpdf-x").addEventListener("click", close);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });

    const input = back.querySelector(".ar-labpdf-input");
    const drop = back.querySelector(".ar-labpdf-drop");
    const status = back.querySelector(".ar-labpdf-status");
    const stage1 = back.querySelector(".ar-labpdf-stage1");
    const stage2 = back.querySelector(".ar-labpdf-stage2");
    const fileCard = back.querySelector(".ar-labpdf-file");
    const fileName = back.querySelector(".ar-labpdf-file-name");
    const fileMeta = back.querySelector(".ar-labpdf-file-meta");
    const fileClear = back.querySelector(".ar-labpdf-file-clear");
    const progress = back.querySelector(".ar-labpdf-progress");

    function setStatus(kind, msg) {
      const palette = {
        idle:    { c: "#475569", bg: "transparent", icon: "" },
        info:    { c: "#0c4a6e", bg: "#e0f2fe",     icon: "ℹ️ " },
        loading: { c: "#0c4a6e", bg: "#e0f2fe",     icon: "⏳ " },
        success: { c: "#166534", bg: "#dcfce7",     icon: "✓ " },
        warn:    { c: "#92400e", bg: "#fef3c7",     icon: "⚠ " },
        error:   { c: "#b91c1c", bg: "#fee2e2",     icon: "⚠ " },
      };
      const p = palette[kind] || palette.idle;
      if (!msg) { status.innerHTML = ""; status.removeAttribute("style"); status.style.marginTop = "10px"; status.style.minHeight = "22px"; status.style.fontSize = "13px"; return; }
      status.style.color = p.c;
      status.style.background = p.bg;
      status.style.padding = p.bg === "transparent" ? "0" : "8px 10px";
      status.style.borderRadius = "8px";
      status.innerHTML = `${p.icon}${msg}`;
    }
    function showProgress(on) { progress.style.display = on ? "block" : "none"; }
    function showFileCard(file) {
      if (!file) {
        fileCard.style.display = "none";
        fileName.textContent = "";
        fileMeta.textContent = "";
        return;
      }
      fileCard.style.display = "flex";
      fileName.textContent = file.name;
      fileMeta.textContent = `PDF · ${fmtBytes(file.size)}`;
    }

    fileClear.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      showFileCard(null);
      showProgress(false);
      setStatus("idle", "");
    });

    async function handleFile(file) {
      if (!file) return;
      if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
        showFileCard(null);
        setStatus("error", "El archivo debe ser un PDF (.pdf).");
        return;
      }
      showFileCard(file);
      setStatus("loading", `Leyendo <b>${escapeHtml(file.name)}</b>…`);
      showProgress(true);
      try {
        const t0 = performance.now();
        const out = await parsePdfToAnalytes(file);
        const ms = Math.round(performance.now() - t0);
        const count = Object.keys(out.analytes).filter((k) => !k.includes(".")).length;
        showProgress(false);
        if (!count) {
          setStatus(
            "warn",
            `No se reconocieron analitos. Páginas: ${out.pages}, filas escaneadas: ${out.scanned}. ¿El PDF está escaneado como imagen?`,
          );
          return;
        }
        setStatus("success", `${count} analito(s) detectado(s) en ${out.pages} pág. · ${ms} ms`);
        stage1.style.display = "none";
        stage2.style.display = "";
        renderPreview(out, file, stage2, async (decision) => {
          if (!decision) { close(); return; }
          const selected = decision.analytes || {};
          const selCount = Object.keys(selected).filter((k)=>!k.includes(".")).length;
          if (!selCount) {
            H().toast?.("Selecciona al menos un analito.");
            return;
          }
          const labObj = {
            analytes: selected,
            date: decision.date,
            capturedAt: new Date().toISOString(),
            source: "pdf",
            sourceFile: file.name,
          };
          if (H().setLabSession) H().setLabSession(labObj);
          if (H().updateLabBadge) H().updateLabBadge();
          H().toast?.(`📄 PDF Lab: ${selCount} analito(s) cargado(s)${decision.date ? " · " + decision.date : ""}`);

          if (decision.action === "pdf") {
            if (H().printLabReport) { try { H().printLabReport(); } catch (e) { console.error(e); } }
            else H().toast?.("Función PDF no disponible.");
            close();
            return;
          }
          if (decision.action === "summary") {
            const text = H().buildLabSummary ? H().buildLabSummary(labObj) : "";
            openSummaryModal(text);
            close();
            return;
          }
          if (decision.fill && H().autofillLabIntoForm) {
            try { H().autofillLabIntoForm(); } catch (_) {}
          }
          close();
        });
      } catch (err) {
        console.error("[AR][lab-pdf]", err);
        showProgress(false);
        setStatus("error", `No se pudo procesar el PDF: ${escapeHtml((err && err.message) || String(err))}`);
      }
    }

    input.addEventListener("change", () => handleFile(input.files && input.files[0]));

    // Drag-and-drop sobre la zona y sobre el modal completo.
    const dragTargets = [drop, back];
    let depth = 0;
    const setDrag = (on) => { drop.classList.toggle("is-drag", on); };
    const hasFiles = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files"));
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDrag(true);
      if (!stage2.style.display || stage2.style.display === "none") {
        setStatus("info", "Suelta el PDF para cargarlo…");
      }
    };
    const onOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e) => {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        setDrag(false);
        if (status.textContent && status.textContent.includes("Suelta el PDF")) setStatus("idle", "");
      }
    };
    const onDrop = (e) => {
      e.preventDefault();
      depth = 0;
      setDrag(false);
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    };
    dragTargets.forEach((t) => {
      t.addEventListener("dragenter", onEnter);
      t.addEventListener("dragover", onOver);
      t.addEventListener("dragleave", onLeave);
      t.addEventListener("drop", onDrop);
    });
  }



  // ---------------- API pública ----------------
  window.__AR_LAB_PDF = {
    open: openUploader,
    parse: parsePdfToAnalytes,
    showSummary: openSummaryModal,
  };
})();
