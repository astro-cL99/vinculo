/* Vínculo — Resumen visual de Historia Clínica.
 *
 * Muestra un pop-up con un cuadro visual del paciente:
 *   - Identificación (nombre, RUT, edad, sexo)
 *   - Antropometría / signos vitales
 *   - Diagnósticos / problemas activos
 *   - Reacciones adversas / alergias (escaneadas del árbol Rayen)
 *   - Antecedentes mórbidos, quirúrgicos, familiares, hábitos
 *   - Medicación crónica
 *   - Último laboratorio + alertas críticas
 *
 * API: window.__AR_RESUMEN_HC = { open() }
 */
(function () {
  if (window.__AR_RESUMEN_HC) return;

  const log = window.__AR_LOG?.module ? window.__AR_LOG.module("resumen-hc") : { info() {}, warn() {} };
  const DBG = () => !!window.__AR_DEBUG;
  const dlog = (...a) => { if (DBG()) console.log("[AR:resumen]", ...a); };
  const toast = (m) => window.__AR_HOST?.toast?.(m) || dlog(m);

  // ---------- helpers DOM ----------
  const txt = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  /**
   * Escanea árboles react-checkbox-tree (usados por Rayen para
   * "Reacciones adversas", "Antecedentes mórbidos", etc.) y devuelve
   * los nodos marcados/seleccionados por sección.
   */
  function scanCheckboxTrees() {
    const sections = {};
    // Encuentra contenedores con header conocido y un .react-checkbox-tree dentro
    const trees = document.querySelectorAll(".react-checkbox-tree");
    trees.forEach((tree) => {
      // Subir hasta encontrar un encabezado / título
      let title = "";
      let p = tree.parentElement;
      for (let i = 0; i < 6 && p && !title; i++) {
        const h = p.querySelector("h1,h2,h3,h4,h5,legend,.title,.section-title,[class*='title']");
        if (h && txt(h)) title = txt(h);
        p = p.parentElement;
      }
      if (!title) title = "Sección";
      const selected = [];
      // Items seleccionados: clase contiene 'background-tree-item-selected' o checkbox checked
      tree.querySelectorAll("span.rct-text").forEach((node) => {
        const isSel = /background-tree-item-selected/.test(node.className) ||
                      node.querySelector('input[type="checkbox"]:checked');
        if (!isSel) return;
        const label = txt(node.querySelector(".tree-mainText, .rct-title")) || txt(node);
        if (label && label.length < 200) selected.push(label);
      });
      if (selected.length) {
        sections[title] = Array.from(new Set(selected));
      }
    });
    return sections;
  }

  /** Busca campos con labels específicos (alergias, hábitos, etc.) */
  function readLabeledFields(hints) {
    const out = {};
    const fields = document.querySelectorAll("input, textarea, select, td, .form-control");
    for (const el of fields) {
      if (el.offsetParent === null && el.tagName !== "INPUT") continue;
      let label = "";
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) label = txt(l);
      }
      if (!label) {
        const par = el.closest("label, .form-group, .row, tr, .field");
        if (par) label = txt(par.querySelector("label, .label, .field-label, th") || par).slice(0, 120);
      }
      if (!label) continue;
      const ln = norm(label);
      for (const [key, words] of Object.entries(hints)) {
        if (words.some((w) => ln.includes(norm(w)))) {
          const v = (el.value || txt(el)).trim();
          if (v && v.length > 1 && !out[key]) out[key] = v;
          break;
        }
      }
    }
    return out;
  }

  // ---------- recolectar todo ----------
  function gather() {
    const p = (window.__AR_PATIENT?.extract?.() || {});
    const v = (window.__AR_VITALS?.read?.() || {});
    const dx = (window.__AR_DX_EXTRACT?.extract?.() || { candidatos: [] });
    const lab = window.__AR_LAB_SESSION?.get?.() || null;
    const alerts = lab ? (window.__AR_LAB_CRITICAL?.collect?.(lab, {}) || []) : [];
    const trees = scanCheckboxTrees();
    const labeled = readLabeledFields({
      alergias: ["alergia", "reaccion adversa", "reacción adversa"],
      habitos: ["habito", "hábito", "tabaco", "alcohol", "drogas"],
      medicacion: ["medicacion", "medicación", "farmacos", "fármacos", "tratamiento actual"],
      antMorbidos: ["antecedente morbid", "antecedentes morbid", "morbido"],
      antQx: ["quirurg", "quirúrg"],
      antFam: ["familiar"],
      motivo: ["motivo de consulta", "motivo consulta"],
    });

    // Buscar secciones del árbol por keyword para clasificarlas
    const classify = (title) => {
      const t = norm(title);
      if (/(reacci|alerg)/.test(t)) return "alergias";
      if (/(morbid|antecedente m)/.test(t)) return "antMorbidos";
      if (/(quirurg|quirúrg)/.test(t)) return "antQx";
      if (/familiar/.test(t)) return "antFam";
      if (/(habito|hábito|tabaco|alcohol)/.test(t)) return "habitos";
      if (/(medicaci|farmac|fármac)/.test(t)) return "medicacion";
      return "otros";
    };
    const grouped = { alergias: [], antMorbidos: [], antQx: [], antFam: [], habitos: [], medicacion: [], otros: {} };
    Object.entries(trees).forEach(([title, items]) => {
      const k = classify(title);
      if (k === "otros") grouped.otros[title] = items;
      else grouped[k].push(...items);
    });
    // Fallback: si no se detectó nada en árboles pero hay campos con texto
    for (const k of ["alergias", "habitos", "medicacion", "antMorbidos", "antQx", "antFam"]) {
      if (!grouped[k].length && labeled[k]) {
        grouped[k] = labeled[k].split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
      }
    }
    grouped.alergias = Array.from(new Set(grouped.alergias));
    grouped.antMorbidos = Array.from(new Set(grouped.antMorbidos));
    grouped.antQx = Array.from(new Set(grouped.antQx));
    grouped.antFam = Array.from(new Set(grouped.antFam));
    grouped.habitos = Array.from(new Set(grouped.habitos));
    grouped.medicacion = Array.from(new Set(grouped.medicacion));

    return { p, v, dx, lab, alerts, grouped, motivo: labeled.motivo || "" };
  }

  // ---------- render ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function chip(text, kind = "") {
    const palette = {
      danger: "background:#fee2e2;color:#991b1b;border:1px solid #fecaca",
      warn:   "background:#fef3c7;color:#92400e;border:1px solid #fde68a",
      ok:     "background:#dcfce7;color:#166534;border:1px solid #bbf7d0",
      info:   "background:#e0f2fe;color:#075985;border:1px solid #bae6fd",
      neutral:"background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0",
    };
    return `<span style="display:inline-block;padding:3px 9px;margin:2px 4px 2px 0;border-radius:999px;font-size:12px;line-height:1.3;${palette[kind] || palette.neutral}">${esc(text)}</span>`;
  }

  function section(title, body, accent = "#0d9488") {
    return `<section style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${accent};border-radius:8px;padding:10px 12px;margin:0">
      <h4 style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0f172a;letter-spacing:.02em;text-transform:uppercase">${esc(title)}</h4>
      <div style="font-size:13px;color:#1e293b;line-height:1.5">${body || '<span style="color:#94a3b8">—</span>'}</div>
    </section>`;
  }

  function buildHTML(d) {
    const { p, v, dx, lab, alerts, grouped, motivo } = d;
    const ident = [
      p.nombreCompleto && `<strong>${esc(p.nombreCompleto)}</strong>`,
      p.rut && esc(p.rut),
      p.edad != null && `${esc(p.edad)} años`,
      p.sexo && (p.sexo === "F" ? "Femenino" : "Masculino"),
    ].filter(Boolean).join(" · ") || '<span style="color:#94a3b8">Sin datos del paciente</span>';

    const antro = [
      v.weightKg != null && `Peso: ${v.weightKg} kg`,
      v.heightCm != null && `Talla: ${v.heightCm} cm`,
      v.bmi != null && `IMC: ${Number(v.bmi).toFixed(1)}`,
    ].filter(Boolean).map((t) => chip(t, "info")).join("") || "—";

    const dxBody = (dx.candidatos || []).slice(0, 8)
      .map((c) => chip((c.abrev || c.texto) + (c.cie10 ? ` (${c.cie10})` : ""), "info"))
      .join("") || "—";

    const alergias = grouped.alergias.length
      ? grouped.alergias.map((a) => chip(a, "danger")).join("")
      : chip("Sin alergias registradas", "ok");

    const mkList = (arr, kind = "neutral") => arr.length
      ? arr.map((x) => chip(x, kind)).join("")
      : "—";

    let labBody = "—";
    if (lab && lab.analytes) {
      const top = Object.entries(lab.analytes).filter(([k]) => !k.includes(".")).slice(0, 12);
      labBody = `<div style="font-size:12px;color:#64748b;margin-bottom:4px">${esc(lab.date || "Fecha desconocida")}</div>` +
        top.map(([k, a]) => chip(`${k}: ${a.value}${a.unit ? " " + a.unit : ""}`, "neutral")).join("");
    }
    const alertsBody = alerts.length
      ? alerts.slice(0, 8).map((a) => chip(`${a.key}: ${a.value} (${a.reason || a.severity})`,
          a.severity === "critical" ? "danger" : "warn")).join("")
      : "";

    const otrosKeys = Object.keys(grouped.otros || {});
    const otrosBody = otrosKeys.length
      ? otrosKeys.map((t) => `<div style="margin-top:6px"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${esc(t)}</div>${grouped.otros[t].map((x) => chip(x)).join("")}</div>`).join("")
      : "";

    return `
      <div style="display:grid;grid-template-columns:1fr;gap:10px">
        ${section("👤 Identificación", `<div>${ident}</div>${motivo ? `<div style="margin-top:6px;font-size:12px;color:#475569"><em>Motivo:</em> ${esc(motivo)}</div>` : ""}`, "#0ea5e9")}
        ${section("📏 Antropometría / Vitales", antro, "#0ea5e9")}
        ${section("🩺 Diagnósticos / Problemas activos", dxBody, "#0d9488")}
        ${section("⚠️ Reacciones adversas / Alergias", alergias, "#dc2626")}
        ${section("📋 Antecedentes mórbidos", mkList(grouped.antMorbidos), "#7c3aed")}
        ${section("🔪 Antecedentes quirúrgicos", mkList(grouped.antQx), "#7c3aed")}
        ${section("👪 Antecedentes familiares", mkList(grouped.antFam), "#7c3aed")}
        ${section("🚬 Hábitos", mkList(grouped.habitos, "warn"), "#f59e0b")}
        ${section("💊 Medicación crónica", mkList(grouped.medicacion, "info"), "#10b981")}
        ${section("🧪 Último laboratorio", labBody + (alertsBody ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #e2e8f0"><div style="font-size:11px;color:#991b1b;font-weight:600;margin-bottom:4px">Alertas</div>${alertsBody}</div>` : ""), "#06b6d4")}
        ${otrosBody ? section("📎 Otros", otrosBody, "#64748b") : ""}
      </div>
    `;
  }

  function open() {
    // Cerrar instancia previa
    document.getElementById("ar-resumen-modal")?.remove();
    const data = gather();
    window.__AR_RESUMEN_HC_LAST_GATHER = data;
    const wrap = document.createElement("div");
    wrap.id = "ar-resumen-modal";
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483640;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    wrap.innerHTML = `
      <div role="dialog" aria-label="Resumen de Historia Clínica" style="background:#f8fafc;width:min(880px,100%);max-height:90vh;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden">
        <header style="flex:0 0 auto;background:linear-gradient(135deg,#0d9488,#0ea5e9);color:#fff;padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.85">Vínculo</div>
            <h3 style="margin:2px 0 0;font-size:18px;font-weight:600">📋 Resumen Historia Clínica</h3>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button id="ar-resumen-evol" type="button" title="Generar evolución clínica desde los datos/API ya cargados, sin abrir atención por atención" style="background:#f97316;color:#fff;border:1px solid rgba(255,255,255,.45);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">⚡ Evolución HC</button>
            <button id="ar-resumen-print" type="button" title="Imprimir / PDF" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px">🖨 Imprimir</button>
            <button id="ar-resumen-copy" type="button" title="Copiar como texto" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px">📋 Copiar</button>
            <button id="ar-resumen-close" type="button" aria-label="Cerrar" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px">✕</button>
          </div>
        </header>
        <div id="ar-resumen-body" style="flex:1 1 auto;min-height:0;overflow:auto;padding:14px 18px;background:#f1f5f9">
          ${buildHTML(data)}
        </div>
        <footer style="flex:0 0 auto;background:#fff;padding:8px 18px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:right">
          Generado localmente desde la ficha · ${new Date().toLocaleString("es-CL")}
        </footer>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.querySelector("#ar-resumen-close").addEventListener("click", close);
    wrap.querySelector("#ar-resumen-print").addEventListener("click", () => {
      const w = window.open("", "_blank", "width=900,height=1100");
      if (!w) { toast("⚠ Permite ventanas emergentes"); return; }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Resumen HC</title>
        <style>body{font-family:system-ui,sans-serif;padding:24px;background:#fff;color:#0f172a}</style>
        </head><body><h2>Resumen Historia Clínica</h2>${buildHTML(data)}</body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    });
    wrap.querySelector("#ar-resumen-copy").addEventListener("click", () => {
      const lines = [];
      lines.push("RESUMEN HISTORIA CLÍNICA");
      lines.push("Paciente: " + [data.p.nombreCompleto, data.p.rut, data.p.edad && data.p.edad + "a", data.p.sexo].filter(Boolean).join(" · "));
      if (data.motivo) lines.push("Motivo: " + data.motivo);
      const v = data.v;
      const a = [v.weightKg && `Peso ${v.weightKg}kg`, v.heightCm && `Talla ${v.heightCm}cm`, v.bmi && `IMC ${Number(v.bmi).toFixed(1)}`].filter(Boolean);
      if (a.length) lines.push("Antropometría: " + a.join(", "));
      const dxs = (data.dx.candidatos || []).slice(0, 8).map((c) => c.abrev || c.texto).filter(Boolean);
      if (dxs.length) lines.push("Dx: " + dxs.join(", "));
      const g = data.grouped;
      if (g.alergias.length) lines.push("Alergias: " + g.alergias.join(", "));
      if (g.antMorbidos.length) lines.push("Antec. mórbidos: " + g.antMorbidos.join(", "));
      if (g.antQx.length) lines.push("Antec. quirúrgicos: " + g.antQx.join(", "));
      if (g.antFam.length) lines.push("Antec. familiares: " + g.antFam.join(", "));
      if (g.habitos.length) lines.push("Hábitos: " + g.habitos.join(", "));
      if (g.medicacion.length) lines.push("Medicación: " + g.medicacion.join(", "));
      navigator.clipboard?.writeText(lines.join("\n")).then(
        () => toast("✓ Resumen copiado"),
        () => toast("✗ No se pudo copiar"),
      );
    });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });
    wrap.querySelector("#ar-resumen-evol").addEventListener("click", async () => {
      const btn = wrap.querySelector("#ar-resumen-evol");
      btn.disabled = true; const orig = btn.textContent; btn.textContent = "⏳ Leyendo datos…";
      try {
        const evol = await scanEvolucion((msg) => { btn.textContent = "⏳ " + msg; });
        renderEvolucion(wrap.querySelector("#ar-resumen-body"), evol);
        toast(`✓ ${evol.length} atenciones con contenido clínico`);
      } catch (e) {
        console.error("[AR:resumen] evol error", e);
        toast("✗ Error: " + (e?.message || e));
      } finally { btn.disabled = false; btn.textContent = orig; }
    });
    log.info("Resumen HC abierto", data);
  }

  // ---------- evolución: scrape anamnesis de todas las atenciones ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, { timeout = 5000, interval = 80 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = fn(); if (v) return v;
      await sleep(interval);
    }
    return null;
  }
  function setReactValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // -------- Interceptor de red (XHR + fetch) para capturar respuestas API --------
  // Se instala una sola vez y mantiene un buffer circular de últimas respuestas.
  const NET_BUFFER = [];
  const NET_MAX = 180;
  function installNetSniffer() {
    if (window.__AR_NET_SNIFF) return;
    window.__AR_NET_SNIFF = NET_BUFFER;
    if (!window.__AR_NET_SNIFF_LISTENER) {
      window.__AR_NET_SNIFF_LISTENER = true;
      window.addEventListener("message", (event) => {
        if (event.source !== window || event.data?.source !== "AR_PAGE_SNIFFER") return;
        if (event.data.type === "network") {
          NET_BUFFER.push({
            t: event.data.t || Date.now(),
            url: event.data.url || "",
            body: event.data.body || "",
            status: event.data.status,
            contentType: event.data.contentType || "",
            from: "page",
          });
          while (NET_BUFFER.length > NET_MAX) NET_BUFFER.shift();
        }
        if (event.data.type === "globals") {
          const debug = (window.__AR_DEBUG_HC = window.__AR_DEBUG_HC || {});
          debug.globals = event.data.hits || [];
        }
        if (event.data.type === "networkDump") {
          (event.data.items || []).forEach((item) => {
            if (!item?.body) return;
            const key = `${item.t}|${item.url}|${String(item.body).slice(0, 80)}`;
            if (NET_BUFFER.some((r) => r.__key === key)) return;
            NET_BUFFER.push({
              __key: key,
              t: item.t || Date.now(),
              url: item.url || "",
              body: item.body || "",
              status: item.status,
              contentType: item.contentType || "",
              from: "page-dump",
            });
          });
          while (NET_BUFFER.length > NET_MAX) NET_BUFFER.shift();
        }
      });
    }
    try {
      if (!document.getElementById("ar-page-sniffer-script")) {
        const s = document.createElement("script");
        s.id = "ar-page-sniffer-script";
        s.src = chrome.runtime.getURL("modules/page-sniffer.js");
        s.onload = () => s.remove();
        (document.documentElement || document.head || document.body).appendChild(s);
      }
    } catch (e) {
      if (DBG()) console.warn("[AR:resumen] no se pudo inyectar sniffer de página", e);
    }
    dlog("net sniffer instalado en contexto página");
  }

  function requestGlobalScan() {
    try { window.postMessage({ source: "AR_CONTENT", type: "scanGlobals" }, "*"); } catch (_) {}
  }

  function requestNetworkDump() {
    try { window.postMessage({ source: "AR_CONTENT", type: "dumpNetwork" }, "*"); } catch (_) {}
  }

  function pushUniqueEntry(list, entry) {
    const text = cleanClinicalText(entry?.anamnesis || "");
    if (!text || text.length < 12) return;
    const fecha = cleanClinicalText(entry.fecha || "Atención clínica").slice(0, 120);
    const key = `${fecha}|${text.slice(0, 180)}`.toLowerCase();
    if (list.some((x) => x.__key === key)) return;
    list.push({ fecha, anamnesis: text.slice(0, 5000), source: entry.source || "datos", __key: key });
  }

  function cleanClinicalText(s) {
    return String(s || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeStringify(value, limit = 90000) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(value, (key, val) => {
        if (typeof val === "string") return val.length > 8000 ? val.slice(0, 8000) : val;
        if (val && typeof val === "object") {
          if (seen.has(val)) return undefined;
          seen.add(val);
        }
        return val;
      }).slice(0, limit);
    } catch (_) { return ""; }
  }

  function dateFromText(s) {
    const m = String(s || "").match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})(?:\s+\d{1,2}:\d{2})?/);
    return m ? m[0] : "";
  }

  // ---------- Extractor de ATENCIONES reales ----------
  // Busca en cualquier JSON arrays cuyos elementos tengan estructura de atención clínica
  // (Actividades / Anamnesis / Diagnosticos / Prescripciones / EspecialidadesDerivadas / OrdenAtencionPruebaDiagnostica)
  // y arma una entrada estructurada por atención. Descarta NSP / "No Informado" / "Muestra de sangre".

  const ATENCION_KEYS = ["Actividades", "Anamnesis", "Diagnosticos", "Prescripciones",
    "EspecialidadesDerivadas", "OrdenAtencionPruebaDiagnostica", "ProcedimientosRealizados"];

  function isAtencionLike(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    for (const k of ATENCION_KEYS) {
      if (Array.isArray(obj[k]) && obj[k].length) return true;
    }
    return false;
  }

  function fmtFecha(s) {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})(\d{2})(\d{2})(?:\s*(\d{2})(\d{2}))?/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
    const m2 = String(s).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (m2) return `${m2[1].padStart(2,"0")}-${m2[2].padStart(2,"0")}-${m2[3]}`;
    return String(s).slice(0, 30);
  }

  function fechaSortKey(at) {
    const s = at._rawFecha || at.fecha || "";
    const m = String(s).match(/(\d{4})(\d{2})(\d{2})(?:\s*(\d{2})(\d{2}))?/);
    if (m) return `${m[1]}${m[2]}${m[3]}${m[4] || "00"}${m[5] || "00"}`;
    const m2 = String(s).match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (m2) {
      const yyyy = m2[3].length === 2 ? "20" + m2[3] : m2[3];
      return `${yyyy}${m2[2].padStart(2,"0")}${m2[1].padStart(2,"0")}0000`;
    }
    return "00000000";
  }

  function pickFechaFromObj(obj) {
    for (const k of Object.keys(obj)) {
      if (/^(FechaHoraInicio|FechaHoraAtencion|FechaHora|FechaInicio|Fecha)$/i.test(k) && typeof obj[k] === "string") return obj[k];
    }
    return "";
  }

  function mapDescriptions(arr, keys = ["Descripcion", "DescripcionClasificacion", "DescripcionDiagnostico"]) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
      if (!item) continue;
      if (typeof item === "string") { if (item.trim()) out.push(item.trim()); continue; }
      const parts = [];
      for (const k of keys) {
        if (typeof item[k] === "string" && item[k].trim()) parts.push(item[k].trim());
      }
      if (parts.length) out.push(Array.from(new Set(parts)).join(" — "));
    }
    return Array.from(new Set(out));
  }

  function buildAtencionEntry(obj) {
    const fechaRaw = pickFechaFromObj(obj);
    const actividades = mapDescriptions(obj.Actividades);
    const anamnesisArr = Array.isArray(obj.Anamnesis) ? obj.Anamnesis : [];
    const motivo = anamnesisArr.map((a) => (a?.MotivoConsulta || "").trim()).filter(Boolean).join(" | ");
    const historial = anamnesisArr.map((a) =>
      (a?.HistorialEnfermedad || a?.Historial || a?.HistorialDeLaEnfermedad || "").trim()
    ).filter(Boolean).join("\n");
    const diagnosticos = mapDescriptions(obj.Diagnosticos);
    const prescripciones = mapDescriptions(obj.Prescripciones);
    const derivaciones = mapDescriptions(obj.EspecialidadesDerivadas);
    const examenes = mapDescriptions(obj.OrdenAtencionPruebaDiagnostica);

    // FILTROS según pedido del usuario
    const actText = actividades.join(" ").toLowerCase();
    const dxText = diagnosticos.join(" ").toLowerCase();
    const esNSP = /no\s*inform|no\s*infomado|\bnsp\b/.test(actText) || /no\s*inform/.test(dxText);
    if (esNSP) return null;
    // "Muestra de sangre" sin anamnesis = solo toma de muestra → descartar
    if (/muestra de sangre/.test(dxText) && !motivo && !historial && !prescripciones.length && !examenes.length && !derivaciones.length) return null;
    // Sin anamnesis ni prescripción ni examen ni derivación → no aporta evolución
    if (!motivo && !historial && !prescripciones.length && !examenes.length && !derivaciones.length) return null;

    return {
      _rawFecha: fechaRaw,
      fecha: fmtFecha(fechaRaw) || "Atención clínica",
      actividades, motivo, historial, diagnosticos, prescripciones, derivaciones, examenes,
      source: "api",
    };
  }

  function findAtencionesInJson(json) {
    const out = [];
    const seen = new WeakSet();
    const walk = (v) => {
      if (!v || typeof v !== "object") return;
      if (seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) {
        const cands = v.filter(isAtencionLike);
        cands.forEach((obj) => { const e = buildAtencionEntry(obj); if (e) out.push(e); });
        v.forEach(walk);
        return;
      }
      if (isAtencionLike(v)) { const e = buildAtencionEntry(v); if (e) out.push(e); }
      for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(json);
    return out;
  }

  function extractClinicalEntriesFromBody(body, source = "api", url = "") {
    if (!body || String(body).length < 8) return [];
    let json = null;
    try { json = typeof body === "string" ? JSON.parse(body) : body; } catch (_) { return []; }
    if (!json) return [];
    const ats = findAtencionesInJson(json);
    ats.forEach((a) => { a.source = source; });
    return ats;
  }

  function dedupeAtenciones(list) {
    const seen = new Map();
    const score = (x) => (x.motivo?2:0) + (x.historial?2:0) + x.diagnosticos.length + x.prescripciones.length + x.examenes.length + x.derivaciones.length;
    for (const a of list) {
      const key = `${a._rawFecha || ""}|${(a.motivo || "").slice(0,80)}|${(a.diagnosticos[0]||"").slice(0,80)}`;
      const prev = seen.get(key);
      if (!prev || score(a) > score(prev)) seen.set(key, a);
    }
    return Array.from(seen.values()).sort((a,b) => fechaSortKey(b).localeCompare(fechaSortKey(a)));
  }

  function collectInstantEvolucion() {
    const all = [];
    NET_BUFFER.forEach((r) => extractClinicalEntriesFromBody(r.body, r.from || "api", r.url).forEach((e) => all.push(e)));
    const globals = window.__AR_DEBUG_HC?.globals || [];
    globals.forEach((g) => extractClinicalEntriesFromBody(g.body, `estado:${g.name}`, g.name).forEach((e) => all.push(e)));
    collectReactBodies().forEach((b) => extractClinicalEntriesFromBody(b.body, b.source, b.source).forEach((e) => all.push(e)));
    return dedupeAtenciones(all);
  }

  function collectReactBodies() {
    const bodies = [];
    const roots = [document.querySelector(".wrapper-body"), document.querySelector(".react-checkbox-tree"), document.querySelector(".tab-content"), document.body].filter(Boolean);
    const nodes = [];
    roots.forEach((root) => nodes.push(root, ...Array.from(root.querySelectorAll("*"))));
    const seen = new Set();
    for (const el of nodes.slice(0, 1400)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const keys = Object.keys(el).filter((k) => /^__react(Fiber|Props)\$/.test(k));
      for (const key of keys) {
        try {
          const raw = el[key];
          const body = safeStringify({ props: raw?.memoizedProps || raw, state: raw?.memoizedState }, 70000);
          if (/(anamnes|historia|atencion|atenci[oó]n|evoluc|motivo|consulta|diagnost)/i.test(body)) {
            bodies.push({ source: `react:${el.tagName.toLowerCase()}`, body });
            if (bodies.length >= 30) return bodies;
          }
        } catch (_) {}
      }
    }
    return bodies;
  }

  // Extrae texto plausible de una respuesta JSON o HTML
  function pluckAnamnesisFromResponse(body) {
    if (!body || body.length < 5) return "";
    // JSON?
    try {
      const j = JSON.parse(body);
      const found = [];
      const walk = (v, key = "") => {
        if (v == null) return;
        if (typeof v === "string") {
          const k = key.toLowerCase();
          if (/anamnes|motivo|observ|descripc|relato|evoluc|examen|indicac/.test(k) && v.trim().length > 10) {
            found.push({ key, val: v.trim() });
          }
          return;
        }
        if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return; }
        if (typeof v === "object") {
          for (const [k, vv] of Object.entries(v)) walk(vv, k);
        }
      };
      walk(j);
      if (found.length) {
        return found.map((f) => `[${f.key}] ${f.val}`).join("\n").slice(0, 5000);
      }
    } catch {}
    // HTML strip
    if (/<[a-z][^>]*>/i.test(body)) {
      const tmp = document.createElement("div");
      tmp.innerHTML = body;
      return tmp.textContent.replace(/\s+/g, " ").trim().slice(0, 5000);
    }
    return body.slice(0, 5000);
  }

  // Captura cambios DOM tras click: snapshot text del área principal pre/post
  function captureMainText() {
    const candidates = document.querySelectorAll(
      ".tab-content, [role='tabpanel'], .record-detail, .tree-content, " +
      ".wrapper-body .col-sm-9, .wrapper-body .col-md-9, .wrapper-body section"
    );
    let best = "";
    candidates.forEach((el) => {
      const t = (el.innerText || "").trim();
      if (t.length > best.length) best = t;
    });
    return best.slice(0, 8000);
  }

  async function scanEvolucion(onProgress = () => {}) {
    installNetSniffer();
    const debug = (window.__AR_DEBUG_HC = window.__AR_DEBUG_HC || { steps: [], net: NET_BUFFER, atenciones: [] });
    debug.steps.length = 0; debug.atenciones.length = 0;
    const logStep = (s, extra) => { debug.steps.push({ t: Date.now(), s, extra }); if (DBG()) console.log("[AR:resumen]", s, extra || ""); };

    onProgress("lectura instantánea");
    requestNetworkDump();
    requestGlobalScan();
    await sleep(160);
    let instant = collectInstantEvolucion();
    logStep("lectura instantánea", { total: instant.length, net: NET_BUFFER.length, globals: debug.globals?.length || 0 });
    if (instant.length) {
      debug.atenciones = instant.map((e) => ({ titulo: e.fecha, dx: e.diagnosticos.length, rx: e.prescripciones.length, source: e.source }));
      return instant;
    }

    // Si no hay caché/API capturada, solo prepara la vista y reintenta datos cargados.
    // NO abre cada atención una por una: eso era lo que demoraba varios minutos.
    onProgress("abriendo Historia clínica");
    logStep("buscar tab Historia clínica");
    const navItems = document.querySelectorAll(".record-vertical-tabs li.verticalnav-tab, .verticalnav-tab");
    let hcTab = null;
    navItems.forEach((li) => { if (/historia\s*cl[ií]nica/i.test(txt(li)) && !hcTab) hcTab = li; });
    if (hcTab && !hcTab.classList.contains("verticalnav-tab-active")) {
      (hcTab.querySelector("a,button,div") || hcTab).click();
      await sleep(300);
    }
    logStep("tab activa", { found: !!hcTab });

    // 2) Select meses -> Todos
    onProgress("seleccionando Todos");
    const select = await waitFor(() => document.querySelector("#adverseReaction"), { timeout: 6000 });
    if (select) {
      setReactValue(select, "192");
      // esperar a que el árbol se repueble
      await sleep(400);
      await waitFor(() => document.querySelectorAll(".react-checkbox-tree li.rct-node-parent").length > 0, { timeout: 6000 });
    }
    logStep("select Todos", { ok: !!select });

    requestNetworkDump();
    requestGlobalScan();
    await sleep(220);
    instant = collectInstantEvolucion();
    logStep("lectura tras cargar Todos", { total: instant.length, net: NET_BUFFER.length, globals: debug.globals?.length || 0 });
    if (instant.length) {
      debug.atenciones = instant.map((e) => ({ titulo: e.fecha, dx: e.diagnosticos.length, rx: e.prescripciones.length, source: e.source }));
      return instant;
    }

    // Fallback: no se pudo extraer ninguna atención estructurada del JSON capturado
    logStep("sin atenciones estructuradas en API/estado");
    return [];
  }

  // ---------- Diccionario de abreviaciones + correcciones tipográficas ----------
  const ABBREV_MAP = [
    [/\bAMP\b/g, "Antecedentes mórbidos personales"],
    [/\bAPP\b/g, "Antecedentes patológicos personales"],
    [/\bAQX?\b/g, "Antecedentes quirúrgicos"],
    [/\bAGO\b/g, "Antecedentes ginecoobstétricos"],
    [/\bRAM\b/g, "Reacciones adversas a medicamentos"],
    [/\bSOA\b/g, "Sin otros antecedentes"],
    [/\bSOP\b/g, "Síndrome ovario poliquístico"],
    [/\bMC\b/g, "Motivo de consulta"],
    [/\bEA\b/g, "Enfermedad actual"],
    [/\bHEA\b/g, "Historia de enfermedad actual"],
    [/\bTTO\b/gi, "Tratamiento"],
    [/\bTx\b/g, "Tratamiento"],
    [/\bDx\b/g, "Diagnóstico"],
    [/\bDdx\b/g, "Diagnóstico diferencial"],
    [/\bAM\b/g, "Antecedentes mórbidos"],
    [/\bAF\b/g, "Antecedentes familiares"],
    [/\bAG\b/g, "Antecedentes ginecoobstétricos"],
    [/\bAH\b/g, "Antecedentes de hábitos"],
    [/\bHTA\b/g, "Hipertensión arterial (HTA)"],
    [/\bDM2\b/g, "Diabetes mellitus tipo 2 (DM2)"],
    [/\bDM1\b/g, "Diabetes mellitus tipo 1 (DM1)"],
    [/\bDLP\b/g, "Dislipidemia"],
    [/\bERC\b/g, "Enfermedad renal crónica"],
    [/\bICC\b/g, "Insuficiencia cardíaca"],
    [/\bACV\b/g, "Accidente cerebrovascular"],
    [/\bIAM\b/g, "Infarto agudo miocardio"],
    [/\bITU\b/g, "Infección urinaria"],
    [/\bIRA\b/g, "Infección respiratoria aguda"],
    [/\bSx\b/g, "Síndrome"],
    [/\bcx\b/gi, "Cirugía"],
  ];
  const TYPO_MAP = [
    [/\bantesedente/gi, "antecedente"],
    [/\bantecente/gi, "antecedente"],
    [/\bantecednete/gi, "antecedente"],
    [/\bmorbido/gi, "mórbido"],
    [/\bmorvido/gi, "mórbido"],
    [/\bquirurjic/gi, "quirúrgic"],
    [/\bqurirurgic/gi, "quirúrgic"],
    [/\bdiavetes\b/gi, "diabetes"],
    [/\bypertension/gi, "hipertensión"],
    [/\bhipertencion/gi, "hipertensión"],
    [/\bobesidad morbida/gi, "obesidad mórbida"],
    [/\balerjia/gi, "alergia"],
    [/\bpaciencte\b/gi, "paciente"],
  ];
  function expandClinical(text) {
    if (!text) return "";
    let out = String(text);
    for (const [re, rep] of TYPO_MAP) out = out.replace(re, rep);
    for (const [re, rep] of ABBREV_MAP) out = out.replace(re, rep);
    return out.replace(/\s{2,}/g, " ").trim();
  }

  // ---------- Unificación de antecedentes (cross-atenciones) ----------
  function normPhrase(s) {
    return norm(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function dedupePhrases(arr) {
    const seen = new Map();
    for (const raw of arr) {
      const clean = expandClinical(String(raw).trim());
      if (!clean || clean.length < 3 || clean.length > 220) continue;
      const k = normPhrase(clean);
      if (!k) continue;
      const prev = seen.get(k);
      if (!prev || clean.length > prev.length) seen.set(k, clean);
    }
    return Array.from(seen.values());
  }
  function splitItems(text) {
    if (!text) return [];
    return String(text)
      .split(/(?:\r?\n|;|\u2022|·|\s\|\s|,(?=\s*[A-ZÁÉÍÓÚ]))/)
      .map((s) => s.trim()).filter((s) => s && s.length > 2);
  }
  function classifyPhrase(s) {
    const t = norm(s);
    if (/\b(alerg|ram|reaccion adversa|intoleranc)/.test(t)) return "alergias";
    if (/\b(quirurg|operad|operacion|postop|apendicect|colecist|histerect|cesare)/.test(t)) return "antQx";
    if (/\b(padre|madre|hermano|hermana|abuelo|abuela|familiar|antecedente familiar|genetic)/.test(t)) return "antFam";
    if (/\b(fuma|tabaco|tabaquismo|alcohol|drogas|sedentari|actividad fisica|dieta|habito)/.test(t)) return "habitos";
    if (/\b(mg\b|mcg\b|comprimid|tableta|capsul|cada \d|c\/\d|qd|bid|tid|qid|insulin)/.test(t)) return "medicacion";
    return "antMorbidos";
  }
  function unifyAntecedentes(evol, base) {
    const buckets = { alergias: [], antMorbidos: [], antQx: [], antFam: [], habitos: [], medicacion: [] };
    for (const k of Object.keys(buckets)) (base?.[k] || []).forEach((x) => buckets[k].push(x));
    for (const e of evol) {
      splitItems(e.historial).forEach((s) => buckets[classifyPhrase(s)].push(s));
      splitItems(e.motivo).forEach((s) => buckets[classifyPhrase(s)].push(s));
      (e.diagnosticos || []).forEach((s) => buckets.antMorbidos.push(s));
      (e.prescripciones || []).forEach((s) => buckets.medicacion.push(s));
    }
    for (const k of Object.keys(buckets)) buckets[k] = dedupePhrases(buckets[k]).slice(0, 40);
    return buckets;
  }

  // ---------- Tratamiento actual + últimas modificaciones ----------
  function rxKey(s) {
    const t = norm(s).replace(/[^a-z0-9 ]+/g, " ");
    const m = t.match(/[a-z]{4,}/);
    return m ? m[0] : t.slice(0, 12);
  }
  function summarizeTreatment(evol) {
    const current = new Map();
    const changes = [];
    let prevKeys = null;
    for (let i = evol.length - 1; i >= 0; i--) {
      const e = evol[i];
      const rxs = (e.prescripciones || []).map((x) => expandClinical(x));
      if (!rxs.length) continue;
      const keys = new Set(rxs.map(rxKey));
      rxs.forEach((r) => current.set(rxKey(r), { text: r, fecha: e.fecha }));
      if (prevKeys) {
        const added = [...keys].filter((k) => !prevKeys.has(k));
        const removed = [...prevKeys].filter((k) => !keys.has(k));
        if (added.length || removed.length) {
          changes.push({
            fecha: e.fecha,
            agregado: added.map((k) => rxs.find((r) => rxKey(r) === k)).filter(Boolean),
            retirado: [...removed],
          });
        }
      }
      prevKeys = keys;
    }
    return { current: Array.from(current.values()), changes: changes.reverse().slice(0, 6) };
  }

  function renderEvolucion(container, evol) {
    container.querySelectorAll("[data-ar-evol]").forEach((n) => n.remove());

    if (!evol.length) {
      container.insertAdjacentHTML("afterbegin",
        `<div data-ar-evol style="background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:10px;border-radius:8px;margin-bottom:10px">
          No se detectaron atenciones con contenido clínico en los datos cargados.
          Asegúrate de estar en <strong>Historia clínica</strong>, selecciona <strong>Todos</strong> los meses y vuelve a pulsar ⚡ Evolución HC.
        </div>`);
      return;
    }

    const tagsHTML = (arr, kind) => arr.map((x) => chip(expandClinical(x), kind)).join("");

    // ---- Vistazo unificado ----
    const base = window.__AR_RESUMEN_HC_LAST_GATHER?.grouped || {};
    const uni = unifyAntecedentes(evol, base);
    const tx = summarizeTreatment(evol);
    const last = evol[0];
    const dxRecientes = dedupePhrases((last?.diagnosticos || []).concat(evol[1]?.diagnosticos || [])).slice(0, 6);

    const uniRow = (label, items, kind, icon) => `
      <div style="margin-top:6px">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${icon} ${esc(label)} <span style="opacity:.6">(${items.length})</span></div>
        <div>${items.length ? items.map((x) => chip(x, kind)).join("") : '<span style="color:#94a3b8;font-size:12px">—</span>'}</div>
      </div>`;

    const changesHTML = tx.changes.length
      ? tx.changes.map((c) => `<div style="margin-top:4px;font-size:12px">
          <strong style="color:#4338ca">${esc(c.fecha)}</strong>
          ${c.agregado.length ? `<span style="color:#166534"> + ${c.agregado.map(esc).join(", ")}</span>` : ""}
          ${c.retirado.length ? `<span style="color:#991b1b"> − ${c.retirado.map(esc).join(", ")}</span>` : ""}
        </div>`).join("")
      : '<div style="color:#94a3b8;font-size:12px">Sin cambios detectados entre atenciones</div>';

    const vistazoHTML = `<section data-ar-evol style="background:linear-gradient(135deg,#ecfeff,#eff6ff);border:1px solid #bae6fd;border-left:4px solid #0ea5e9;border-radius:8px;padding:10px 12px;margin:0 0 10px">
      <h4 style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0c4a6e;letter-spacing:.02em;text-transform:uppercase">📊 Vistazo unificado del paciente</h4>
      <div style="font-size:11px;color:#475569;margin-bottom:8px">Consolidado desde ${evol.length} atenciones. Abreviaciones (AM, AQX, AF, RAM…) expandidas y duplicados eliminados.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          ${uniRow("Antecedentes mórbidos", uni.antMorbidos, "info", "📋")}
          ${uniRow("Antecedentes quirúrgicos", uni.antQx, "neutral", "🔪")}
          ${uniRow("Antecedentes familiares", uni.antFam, "neutral", "👪")}
        </div>
        <div>
          ${uniRow("Alergias / RAM", uni.alergias, "danger", "⚠️")}
          ${uniRow("Hábitos", uni.habitos, "warn", "🚬")}
          ${uniRow("Medicación crónica", tx.current.map((c) => c.text), "ok", "💊")}
        </div>
      </div>
      <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #bae6fd">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">🔄 Últimas modificaciones de tratamiento</div>
        ${changesHTML}
      </div>
      ${dxRecientes.length ? `<div style="margin-top:6px"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">🎯 Dx atención reciente (${esc(last.fecha)})</div>${dxRecientes.map((x) => chip(expandClinical(x), "info")).join("")}</div>` : ""}
    </section>`;

    const card = (e) => {
      const blocks = [];
      if (e.motivo) blocks.push(`<div style="margin-top:4px"><span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Motivo</span><div style="font-size:13px;color:#0f172a">${esc(expandClinical(e.motivo))}</div></div>`);
      if (e.historial) blocks.push(`<div style="margin-top:4px"><span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Historial</span><div style="font-size:12px;color:#1e293b;white-space:pre-wrap">${esc(expandClinical(e.historial))}</div></div>`);
      if (e.diagnosticos.length) blocks.push(`<div style="margin-top:6px"><span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Diagnósticos</span><div>${tagsHTML(e.diagnosticos, "info")}</div></div>`);
      if (e.prescripciones.length) blocks.push(`<div style="margin-top:6px"><span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">💊 Prescripciones</span><div>${tagsHTML(e.prescripciones, "ok")}</div></div>`);
      if (e.examenes.length) blocks.push(`<div style="margin-top:6px"><span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">🧪 Exámenes / Procedimientos</span><div>${tagsHTML(e.examenes, "neutral")}</div></div>`);
      if (e.derivaciones.length) blocks.push(`<div style="margin-top:6px"><span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">↗ Derivaciones</span><div>${tagsHTML(e.derivaciones, "warn")}</div></div>`);
      const actividadLine = e.actividades.length
        ? `<div style="font-size:11px;color:#64748b;margin-top:2px">${esc(e.actividades.join(" · "))}</div>`
        : "";
      return `<div style="border-left:3px solid #6366f1;padding:8px 12px;background:#fff;border-radius:0 6px 6px 0;box-shadow:0 1px 2px rgba(15,23,42,.04)">
        <div style="font-size:13px;font-weight:700;color:#4338ca">${esc(e.fecha)}</div>
        ${actividadLine}
        ${blocks.join("")}
      </div>`;
    };

    const evolHTML = `<section data-ar-evol style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid #6366f1;border-radius:8px;padding:10px 12px;margin:0 0 10px">
      <h4 style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0f172a;letter-spacing:.02em;text-transform:uppercase">🧭 Evolución clínica (${evol.length} atenciones útiles)</h4>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px">Se omitieron NSP, "No Informado" y tomas de muestra. Detalle crudo en <code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">window.__AR_DEBUG_HC</code>.</div>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:480px;overflow:auto">
        ${evol.map(card).join("")}
      </div>
    </section>`;
    // Vistazo unificado primero, luego evolución detallada
    container.insertAdjacentHTML("afterbegin", evolHTML);
    container.insertAdjacentHTML("afterbegin", vistazoHTML);
    container.scrollTop = 0;
  }

  // Instalar sniffer al cargar para no perder peticiones de la primera atención
  try { installNetSniffer(); } catch (e) { if (DBG()) console.warn("[AR:resumen] sniffer falló", e); }

  window.__AR_RESUMEN_HC = { open, scanEvolucion, _debug: () => window.__AR_DEBUG_HC, _net: () => NET_BUFFER };
})();

