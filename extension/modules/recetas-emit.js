/* Vínculo — Emisión de receta médica (PDF imprimible).
 *
 * Provee:
 *   - showRecetaChooser({ hasPatient }) -> Promise<"auto"|"emit"|null>
 *   - openEmitForm(prefill?) -> Promise<void>
 *   - buildRecetaHtml(data, medico) -> string
 */
(function () {
  if (window.__AR_RECETA_EMIT) return;

  const log = window.__AR_LOG?.module ? window.__AR_LOG.module("receta-emit") : { info() {}, warn() {} };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, "<br/>");
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaLarga = (d) => { d = d || new Date(); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
  const numLetras = (n) => {
    const u = ["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte"];
    const dec = { 30:"treinta", 40:"cuarenta", 50:"cincuenta", 60:"sesenta", 70:"setenta", 80:"ochenta", 90:"noventa" };
    n = Number(n) || 0;
    if (n <= 20) return u[n] || String(n);
    if (n < 100) { const d = Math.floor(n / 10) * 10, r = n % 10; return r === 0 ? dec[d] : `${dec[d]} y ${u[r]}`; }
    return String(n);
  };
  const calcEdad = (iso) => {
    if (!iso) return "";
    const nac = new Date(iso); if (isNaN(nac)) return "";
    const h = new Date(); let e = h.getFullYear() - nac.getFullYear();
    const m = h.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < nac.getDate())) e--;
    return `${e} años`;
  };
  const toast = (m) => { try { window.__AR_HOST?.toast?.(m); } catch {} };

  // ---------- catálogos ----------
  const UNIDADES_CONC = ["mg", "g", "mcg", "UI", "mg/mL", "mg/5mL", "mg/g", "%", "mEq", "mmol"];
  const FORMAS = [
    "comprimido", "comprimido recubierto", "cápsula", "cápsula blanda",
    "jarabe", "suspensión oral", "solución oral", "gotas orales",
    "ampolla", "vial", "inyectable",
    "crema", "ungüento", "gel", "loción",
    "óvulo", "supositorio",
    "inhalador", "aerosol", "nebulización",
    "parche transdérmico", "colirio", "gotas óticas", "spray nasal",
  ];
  const VIAS = ["oral", "sublingual", "tópica", "intramuscular", "subcutánea", "endovenosa", "rectal", "vaginal", "oftálmica", "ótica", "nasal", "inhalatoria", "transdérmica"];
  const DOSIS = ["½", "1", "1½", "2", "3", "4", "5", "10", "15", "20"];
  const FRECUENCIAS = [
    "cada 4 horas", "cada 6 horas", "cada 8 horas", "cada 12 horas", "cada 24 horas",
    "1 vez al día", "2 veces al día", "3 veces al día", "4 veces al día",
    "antes del desayuno", "después del desayuno",
    "antes del almuerzo", "después del almuerzo",
    "antes de la cena", "después de la cena", "al acostarse",
    "SOS (según necesidad)", "una sola vez",
    "semanal", "quincenal", "mensual",
  ];
  const DURACIONES = [
    "3 días", "5 días", "7 días", "10 días", "14 días", "21 días",
    "1 mes", "2 meses", "3 meses", "6 meses",
    "tratamiento crónico (continuo)", "hasta nueva indicación",
  ];

  // ---------- integración Farmacia Popular (PAC) ----------
  const PAC_API = "https://neghme.lovable.app/api/public/pac-search";
  const pacCache = new Map(); // key -> { at, data }
  const PAC_CACHE_TTL = 5 * 60 * 1000;
  async function pacSearch(q) {
    const key = (q || "").trim().toLowerCase();
    if (key.length < 2) return { rows: [], principios: [] };
    const hit = pacCache.get(key);
    if (hit && Date.now() - hit.at < PAC_CACHE_TTL) return hit.data;
    try {
      // Ruteamos por el service worker para evitar la CSP connect-src del sitio (Rayen).
      const j = await new Promise((resolve, reject) => {
        let done = false;
        // Hard guard: si el background no responde en 22s, abortamos para no quedar "Buscando…"
        const guard = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error("Timeout consultando Farmacia Popular"));
        }, 22000);
        try {
          chrome.runtime.sendMessage({ type: "AR_PAC_SEARCH", q: key }, (resp) => {
            if (done) return;
            done = true;
            clearTimeout(guard);
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!resp) return reject(new Error("Sin respuesta del background"));
            if (!resp.ok) return reject(new Error(resp.error || "Error PAC"));
            resolve(resp.data || {});
          });
        } catch (e) { clearTimeout(guard); reject(e); }
      });
      const data = { rows: j.rows || [], principios: j.principios || [], error: j.error };
      pacCache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      log.warn?.("pacSearch error", e);
      return { rows: [], principios: [], error: e?.message || String(e) };
    }
  }
  function pacFormaToReceta(forma) {
    // "CAPSULA" → "cápsula", "COMPRIMIDO RECUBIERTO" → "comprimido recubierto"
    const f = (forma || "").toLowerCase()
      .replace(/capsula/g, "cápsula")
      .replace(/inyeccion/g, "inyección")
      .replace(/solucion/g, "solución")
      .replace(/suspension/g, "suspensión")
      .replace(/locion/g, "loción")
      .replace(/unguento/g, "ungüento");
    return f;
  }


  // ---------- historial de recetas (por médico activo, hasta 200) ----------
  const HIST_KEY = "ar_receta_hist_v1";
  const HIST_MAX = 200;
  async function histLoadAll() {
    try {
      const d = await chrome.storage.local.get(HIST_KEY);
      return Array.isArray(d[HIST_KEY]) ? d[HIST_KEY] : [];
    } catch { return []; }
  }
  async function histSaveAll(arr) {
    try { await chrome.storage.local.set({ [HIST_KEY]: arr }); } catch {}
  }
  function activeMedicoId() {
    return window.__AR_CERTS?.getActiveMedico?.()?.id || "_default";
  }
  async function histList(medicoId) {
    const all = await histLoadAll();
    const mid = medicoId || activeMedicoId();
    return all.filter((e) => (e.medicoId || "_default") === mid)
              .sort((a, b) => b.ts - a.ts);
  }
  async function histAdd(entry) {
    const all = await histLoadAll();
    const mid = entry.medicoId || activeMedicoId();
    const e = {
      id: "rx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      medicoId: mid,
      medicoNombre: entry.medicoNombre || "",
      paciente: entry.paciente || "",
      rut: entry.rut || "",
      diagnostico: entry.diagnostico || "",
      payload: entry.payload || null,
      html: entry.html || "",
    };
    all.unshift(e);
    // recortar por médico
    const byMid = {};
    const kept = [];
    for (const x of all) {
      const k = x.medicoId || "_default";
      byMid[k] = (byMid[k] || 0) + 1;
      if (byMid[k] <= HIST_MAX) kept.push(x);
    }
    await histSaveAll(kept);
    return e;
  }
  async function histRemove(id) {
    const all = await histLoadAll();
    await histSaveAll(all.filter((e) => e.id !== id));
  }
  function histReprint(entry) {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { toast("⚠ Permite ventanas emergentes para reimprimir"); return; }
    w.document.open(); w.document.write(entry.html); w.document.close();
  }

  // ---------- modal historial ----------
  async function openHistoryModal() {
    injectEmitStyles();
    const items = await histList();
    document.querySelectorAll(".ar-rx-hist-back").forEach((n) => n.remove());
    const back = document.createElement("div");
    back.className = "ar-rx-back ar-rx-hist-back";
    const medNom = window.__AR_CERTS?.getActiveMedico?.()?.nombre || "—";
    const fmtFecha = (ts) => {
      const d = new Date(ts);
      return d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };
    const rows = items.length ? items.map((e) => {
      const meds = (e.payload?.meds || []).map((m) => m.nombre).filter(Boolean).slice(0, 3).join(", ");
      return `
        <div class="ar-rx-hist-item" data-id="${esc(e.id)}">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px;color:#0f172a">${esc(e.paciente || "(sin paciente)")} ${e.rut ? `<span style="color:#64748b;font-weight:400">· ${esc(e.rut)}</span>` : ""}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${esc(fmtFecha(e.ts))}${e.diagnostico ? " · " + esc(e.diagnostico) : ""}</div>
            ${meds ? `<div style="font-size:11px;color:#475569;margin-top:2px">💊 ${esc(meds)}${(e.payload?.meds?.length || 0) > 3 ? " …" : ""}</div>` : ""}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="ar-rx-btn ar-rx-btn-ghost ar-rx-hist-edit" ${e.payload ? "" : "disabled style='opacity:.4;cursor:not-allowed'"} title="Editar y volver a emitir">✏️ Editar</button>
            <button class="ar-rx-btn ar-rx-btn-ghost ar-rx-hist-print" title="Reimprimir">🖨</button>
            <button class="ar-rx-btn ar-rx-btn-ghost ar-rx-hist-del" title="Eliminar" style="color:#dc2626">✕</button>
          </div>
        </div>`;
    }).join("") : `<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">No hay recetas emitidas aún por este médico.</div>`;

    back.innerHTML = `
      <div class="ar-rx-card" role="dialog" aria-modal="true" aria-label="Historial de recetas" style="max-width:760px">
        <div class="ar-rx-head">
          <div>
            <h2>📜 Historial de recetas</h2>
            <div class="sub">Médico: ${esc(medNom)} · últimas ${HIST_MAX} por usuario</div>
          </div>
          <button class="ar-rx-x" type="button" title="Cerrar">✕</button>
        </div>
        <div class="ar-rx-body">
          <div class="ar-rx-section" style="padding:8px">
            <div id="ar-rx-hist-list" style="display:flex;flex-direction:column;gap:8px">${rows}</div>
          </div>
        </div>
        <div class="ar-rx-foot">
          <span class="hint">${items.length} receta(s) almacenada(s) localmente</span>
          <div style="display:flex;gap:8px">
            <button type="button" class="ar-rx-btn ar-rx-btn-ghost" id="ar-rx-hist-close">Cerrar</button>
          </div>
        </div>
      </div>`;
    // estilos extra para items
    if (!document.getElementById("ar-rx-hist-styles")) {
      const s = document.createElement("style");
      s.id = "ar-rx-hist-styles";
      s.textContent = `
        .ar-rx-hist-item { display:flex; align-items:center; gap:10px; padding:10px 12px; background:#fafbfd; border:1px solid #e2e8f0; border-radius:8px; }
        .ar-rx-hist-item:hover { background:#f1f5f9; }
        .ar-rx-hist-item .ar-rx-btn { padding:6px 10px; font-size:11px; }
      `;
      document.head.appendChild(s);
    }
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector(".ar-rx-x").addEventListener("click", close);
    back.querySelector("#ar-rx-hist-close").addEventListener("click", close);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });

    back.querySelectorAll(".ar-rx-hist-item").forEach((row) => {
      const id = row.getAttribute("data-id");
      const entry = items.find((x) => x.id === id);
      if (!entry) return;
      row.querySelector(".ar-rx-hist-print")?.addEventListener("click", () => histReprint(entry));
      row.querySelector(".ar-rx-hist-edit")?.addEventListener("click", () => {
        if (!entry.payload) return;
        close();
        openEmitForm(entry.payload);
      });
      row.querySelector(".ar-rx-hist-del")?.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta receta del historial?")) return;
        await histRemove(id);
        row.remove();
        if (!back.querySelector(".ar-rx-hist-item")) {
          back.querySelector("#ar-rx-hist-list").innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">No hay recetas emitidas aún por este médico.</div>`;
        }
      });
    });
  }

  async function editLastReceta() {
    const items = await histList();
    if (!items.length || !items[0].payload) { toast("⚠ No hay receta previa para editar"); return false; }
    openEmitForm(items[0].payload);
    return true;
  }

  // ---------- chooser ----------
  function showRecetaChooser({ hasPatient }) {
    document.querySelectorAll(".ar-receta-choose-back").forEach((n) => n.remove());
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "ar-labpdf-back ar-receta-choose-back";
      back.innerHTML = `
        <div class="ar-labpdf-card" role="dialog" aria-modal="true" aria-label="Receta médica" style="max-width:540px">
          <div class="ar-labpdf-head">
            <b>💊 ¿Qué quieres hacer con la receta?</b>
            <button class="ar-labpdf-x" type="button" title="Cerrar">✕</button>
          </div>
          <div class="ar-labpdf-body">
            <p class="ar-labpdf-help" style="margin-bottom:10px">
              Puedes ejecutar el flujo automatizado dentro de Rayen, emitir una receta imprimible (PDF) o consultar el historial de recetas previas.
              ${hasPatient ? "" : "<br><b>Sin ficha abierta:</b> el flujo automatizado no estará disponible, pero puedes emitir o revisar el historial."}
            </p>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button type="button" class="ar-receta-choose-auto" ${hasPatient ? "" : "disabled style='opacity:.45;cursor:not-allowed'"} style="padding:10px 12px;text-align:left;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer">
                <b>⚙️ Auto-completar receta en Rayen</b><br>
                <span style="color:#475569;font-size:12px">Renueva medicamentos crónicos rellenando los campos de la ficha.</span>
              </button>
              <button type="button" class="ar-receta-choose-emit" style="padding:10px 12px;text-align:left;border:1px solid #1d4ed8;border-radius:8px;background:#eff6ff;cursor:pointer">
                <b>🖨 Emitir receta nueva (PDF)</b><br>
                <span style="color:#475569;font-size:12px">Formulario con medicamentos, dosis y posología. Vista previa imprimible.</span>
              </button>
              <button type="button" class="ar-receta-choose-edit-last" style="padding:10px 12px;text-align:left;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer">
                <b>✏️ Editar última receta</b><br>
                <span style="color:#475569;font-size:12px">Reabre el formulario con los datos de la última emisión para actualizar la prescripción.</span>
              </button>
              <button type="button" class="ar-receta-choose-hist" style="padding:10px 12px;text-align:left;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer">
                <b>📜 Historial de recetas</b><br>
                <span style="color:#475569;font-size:12px">Hasta ${HIST_MAX} recetas por médico · reimprimir o editar cualquiera.</span>
              </button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(back);
      const close = (v) => { back.remove(); resolve(v); };
      back.querySelector(".ar-labpdf-x").addEventListener("click", () => close(null));
      back.addEventListener("click", (e) => { if (e.target === back) close(null); });
      back.querySelector(".ar-receta-choose-auto").addEventListener("click", () => { if (!hasPatient) return; close("auto"); });
      back.querySelector(".ar-receta-choose-emit").addEventListener("click", () => close("emit"));
      back.querySelector(".ar-receta-choose-edit-last").addEventListener("click", async () => {
        close(null);
        const ok = await editLastReceta();
        if (!ok) toast("No hay receta previa registrada para este médico");
      });
      back.querySelector(".ar-receta-choose-hist").addEventListener("click", () => {
        close(null);
        openHistoryModal();
      });
    });
  }

  // ---------- estilos del formulario (inyectados una sola vez) ----------
  function injectEmitStyles() {
    if (document.getElementById("ar-rx-emit-styles")) return;
    const css = `
      .ar-rx-back { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px); z-index:2147483600; display:flex; align-items:center; justify-content:center; padding:20px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
      .ar-rx-card { width:100%; max-width:880px; max-height:92vh; background:#fff; border-radius:16px; box-shadow:0 24px 60px rgba(15,23,42,.35); display:flex; flex-direction:column; overflow:hidden; animation:ar-rx-in .18s ease-out; }
      @keyframes ar-rx-in { from { opacity:0; transform:translateY(8px) scale(.98);} to{ opacity:1; transform:none; } }
      .ar-rx-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; background:linear-gradient(135deg,#1d4ed8,#3b82f6); color:#fff; }
      .ar-rx-head h2 { margin:0; font-size:16px; font-weight:700; letter-spacing:.2px; display:flex; align-items:center; gap:8px; }
      .ar-rx-head .sub { font-size:11px; opacity:.85; margin-top:2px; }
      .ar-rx-x { background:rgba(255,255,255,.15); color:#fff; border:0; width:30px; height:30px; border-radius:50%; cursor:pointer; font-size:16px; line-height:1; display:flex; align-items:center; justify-content:center; transition:background .15s; }
      .ar-rx-x:hover { background:rgba(255,255,255,.3); }
      .ar-rx-body { padding:20px; overflow:auto; background:#f8fafc; }
      .ar-rx-section { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin-bottom:14px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
      .ar-rx-section h3 { margin:0 0 10px; font-size:12px; font-weight:700; color:#334155; text-transform:uppercase; letter-spacing:.6px; display:flex; align-items:center; gap:6px; }
      .ar-rx-section h3 .badge { background:#dbeafe; color:#1d4ed8; padding:2px 8px; border-radius:999px; font-size:10px; }
      .ar-rx-grid { display:grid; gap:10px; }
      .ar-rx-grid > * { min-width:0; }
      .ar-rx-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
      .ar-rx-field label { font-size:11px; font-weight:600; color:#475569; }
      .ar-rx-field input, .ar-rx-field select, .ar-rx-field textarea {
        padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; color:#0f172a; background:#fff;
        transition:border-color .15s, box-shadow .15s; outline:none; font-family:inherit;
        width:100%; max-width:100%; box-sizing:border-box; min-width:0;
      }
      .ar-rx-field input:focus, .ar-rx-field select:focus, .ar-rx-field textarea:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.15); }
      .ar-rx-field .ar-rx-combo { display:flex; gap:4px; min-width:0; }
      .ar-rx-field .ar-rx-combo select { flex:0 0 auto; min-width:72px; width:auto; }
      .ar-rx-field .ar-rx-combo input { flex:1 1 auto; min-width:0; }
      .ar-rx-med { border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:10px; background:#fafbfd; position:relative; }
      .ar-rx-med-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .ar-rx-med-head .tag { background:#1d4ed8; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; }
      .ar-rx-del { background:transparent; color:#dc2626; border:1px solid #fecaca; border-radius:6px; padding:3px 10px; cursor:pointer; font-size:11px; font-weight:600; transition:background .15s; }
      .ar-rx-del:hover { background:#fee2e2; }
      .ar-rx-add { width:100%; padding:10px; background:#fff; border:1.5px dashed #93c5fd; color:#1d4ed8; border-radius:8px; cursor:pointer; font-weight:600; font-size:12px; transition:background .15s, border-color .15s; }
      .ar-rx-add:hover { background:#eff6ff; border-color:#3b82f6; }
      .ar-rx-foot { padding:14px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#fff; gap:10px; }
      .ar-rx-foot .hint { font-size:11px; color:#64748b; }
      .ar-rx-btn { padding:9px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:0; transition:transform .1s, box-shadow .15s; }
      .ar-rx-btn:active { transform:translateY(1px); }
      .ar-rx-btn-ghost { background:#fff; border:1px solid #cbd5e1; color:#334155; }
      .ar-rx-btn-ghost:hover { background:#f1f5f9; }
      .ar-rx-btn-primary { background:linear-gradient(135deg,#059669,#10b981); color:#fff; box-shadow:0 2px 8px rgba(16,185,129,.3); }
      .ar-rx-btn-primary:hover { box-shadow:0 4px 14px rgba(16,185,129,.4); }
      .ar-rx-warn { padding:8px 10px; background:#fef3c7; border-left:3px solid #d97706; color:#92400e; font-size:12px; border-radius:6px; }
      .ar-rx-cols-2 { grid-template-columns:1fr 1fr; }
      .ar-rx-cols-3 { grid-template-columns:2fr 1fr 1fr; }
      .ar-rx-cols-4 { grid-template-columns:repeat(4,1fr); }
      @media (max-width:640px) { .ar-rx-cols-2,.ar-rx-cols-3,.ar-rx-cols-4 { grid-template-columns:1fr; } }
      /* --- PAC autocomplete + panel --- */
      .ar-rx-ac-wrap { position:relative; }
      .ar-rx-ac { position:absolute; top:100%; left:0; right:0; z-index:50; background:#fff; border:1px solid #cbd5e1; border-top:0; border-radius:0 0 8px 8px; max-height:240px; overflow:auto; box-shadow:0 8px 20px rgba(15,23,42,.12); }
      .ar-rx-ac-item { padding:8px 10px; cursor:pointer; font-size:13px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .ar-rx-ac-item:last-child { border-bottom:0; }
      .ar-rx-ac-item:hover, .ar-rx-ac-item.active { background:#eff6ff; }
      .ar-rx-ac-item .pac-badge { background:#dbeafe; color:#1d4ed8; font-size:10px; font-weight:700; padding:2px 6px; border-radius:999px; }
      .ar-rx-ac-item .pac-formas { font-size:11px; color:#64748b; }
      .ar-rx-ac-empty, .ar-rx-ac-loading { padding:10px; color:#64748b; font-size:12px; text-align:center; }
      .ar-rx-pac-panel { margin-top:10px; border:1px solid #bfdbfe; background:#f0f9ff; border-radius:8px; padding:10px; }
      .ar-rx-pac-panel-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font-size:11px; font-weight:700; color:#1e3a8a; text-transform:uppercase; letter-spacing:.5px; }
      .ar-rx-pac-table { width:100%; border-collapse:collapse; font-size:12px; }
      .ar-rx-pac-table th, .ar-rx-pac-table td { padding:6px 8px; text-align:left; border-bottom:1px solid #dbeafe; }
      .ar-rx-pac-table th { background:#dbeafe; color:#1e3a8a; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
      .ar-rx-pac-table td.num { text-align:right; font-variant-numeric:tabular-nums; }
      .badge-stock { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; }
      .badge-stock.ok { background:#dcfce7; color:#166534; }
      .badge-stock.ko { background:#fee2e2; color:#991b1b; }
      .ar-rx-pac-empty { font-size:12px; color:#64748b; text-align:center; padding:8px; }
      .ar-rx-pac-error { font-size:12px; color:#991b1b; background:#fee2e2; padding:6px 8px; border-radius:6px; }
      .ar-rx-forma-warn { font-size:11px; color:#92400e; margin-top:4px; }
    `;

    const s = document.createElement("style");
    s.id = "ar-rx-emit-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  const optsHtml = (arr, sel) => `<option value="">—</option>` + arr.map((o) => `<option value="${esc(o)}" ${o === sel ? "selected" : ""}>${esc(o)}</option>`).join("");

  function rowHtml(idx, m) {
    m = m || {};
    // separar valor numérico de unidad si viene combinado
    let concVal = m.concentracion || "";
    let concUnit = m.concentracionUnidad || "";
    if (concVal && !concUnit) {
      const match = concVal.match(/^([\d.,/\s]+)\s*(.+)$/);
      if (match) { concVal = match[1].trim(); concUnit = match[2].trim(); }
    }
    return `
    <div class="ar-rx-med" data-idx="${idx}">
      <div class="ar-rx-med-head">
        <span class="tag">Medicamento ${idx + 1}</span>
        <button type="button" class="ar-rx-del">✕ Quitar</button>
      </div>
      <div class="ar-rx-grid ar-rx-cols-3">
        <div class="ar-rx-field">
          <label>Principio activo</label>
          <div class="ar-rx-ac-wrap">
            <input class="ar-rx-nombre" placeholder="Ej. Paracetamol" value="${esc(m.nombre || "")}" autocomplete="off">
            <div class="ar-rx-ac" style="display:none"></div>
          </div>
        </div>
        <div class="ar-rx-field">
          <label>Concentración</label>
          <div class="ar-rx-combo">
            <input class="ar-rx-conc-val" placeholder="500" value="${esc(concVal)}" inputmode="decimal">
            <select class="ar-rx-conc-unit">${optsHtml(UNIDADES_CONC, concUnit)}</select>
          </div>
        </div>
        <div class="ar-rx-field">
          <label>Forma farmacéutica</label>
          <select class="ar-rx-forma">${optsHtml(FORMAS, m.forma || "")}</select>
          <div class="ar-rx-forma-warn" style="display:none"></div>
        </div>
      </div>
      <div class="ar-rx-pac-slot"></div>

      <div class="ar-rx-grid ar-rx-cols-4" style="margin-top:10px">
        <div class="ar-rx-field">
          <label>Dosis</label>
          <div class="ar-rx-combo">
            <select class="ar-rx-dosis-sel">${optsHtml(DOSIS, "")}</select>
            <input class="ar-rx-dosis" placeholder="Cantidad" value="${esc(m.dosis || "")}">
          </div>
        </div>
        <div class="ar-rx-field">
          <label>Vía de administración</label>
          <select class="ar-rx-via">${optsHtml(VIAS, m.via || "oral")}</select>
        </div>
        <div class="ar-rx-field">
          <label>Frecuencia</label>
          <select class="ar-rx-frecuencia">${optsHtml(FRECUENCIAS, m.frecuencia || "")}</select>
        </div>
        <div class="ar-rx-field">
          <label>Duración del tratamiento</label>
          <select class="ar-rx-duracion">${optsHtml(DURACIONES, m.duracion || "")}</select>
        </div>
      </div>
      <div class="ar-rx-grid ar-rx-cols-2" style="margin-top:10px">
        <div class="ar-rx-field">
          <label>Cantidad a dispensar</label>
          <input class="ar-rx-cantidad" type="number" min="1" placeholder="Ej. 30" value="${esc(m.cantidad || "")}">
        </div>
        <div class="ar-rx-field">
          <label>Indicaciones especiales</label>
          <input class="ar-rx-indicaciones" placeholder="Tomar con alimentos…" value="${esc(m.indicaciones || "")}">
        </div>
      </div>
    </div>`;
  }

  function readRow(el) {
    const get = (sel) => el.querySelector(sel)?.value.trim() || "";
    const concVal = get(".ar-rx-conc-val");
    const concUnit = get(".ar-rx-conc-unit");
    return {
      nombre: get(".ar-rx-nombre"),
      concentracion: [concVal, concUnit].filter(Boolean).join(" "),
      concentracionUnidad: concUnit,
      forma: get(".ar-rx-forma"),
      dosis: get(".ar-rx-dosis"),
      via: get(".ar-rx-via") || "oral",
      frecuencia: get(".ar-rx-frecuencia"),
      duracion: get(".ar-rx-duracion"),
      cantidad: get(".ar-rx-cantidad") || "1",
      indicaciones: get(".ar-rx-indicaciones"),
    };
  }

  function wireRow(el) {
    // El select de dosis copia su valor al input al cambiar.
    const sel = el.querySelector(".ar-rx-dosis-sel");
    const inp = el.querySelector(".ar-rx-dosis");
    sel?.addEventListener("change", () => { if (sel.value) inp.value = sel.value; });

    // --- Autocomplete + integración PAC ---
    const nombreInp = el.querySelector(".ar-rx-nombre");
    const acBox = el.querySelector(".ar-rx-ac");
    const formaSel = el.querySelector(".ar-rx-forma");
    const formaWarn = el.querySelector(".ar-rx-forma-warn");
    const pacSlot = el.querySelector(".ar-rx-pac-slot");
    const concVal = el.querySelector(".ar-rx-conc-val");
    const concUnit = el.querySelector(".ar-rx-conc-unit");

    // Guardar opciones originales de forma farmacéutica
    const allFormaOptions = Array.from(formaSel.options).map((o) => ({ v: o.value, t: o.textContent }));
    let pacFormasPermitidas = null; // null = sin restricción

    function resetForma() {
      pacFormasPermitidas = null;
      const cur = formaSel.value;
      formaSel.innerHTML = allFormaOptions.map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("");
      formaSel.value = cur;
      formaWarn.style.display = "none";
    }
    function restringirFormas(formas) {
      pacFormasPermitidas = formas.map((f) => pacFormaToReceta(f));
      const permitidas = new Set(pacFormasPermitidas);
      const cur = formaSel.value;
      formaSel.innerHTML = `<option value="">—</option>` + allFormaOptions
        .filter((o) => !o.v || permitidas.has(o.v))
        .map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("");
      if (permitidas.has(cur)) formaSel.value = cur;
      else if (pacFormasPermitidas.length === 1) formaSel.value = pacFormasPermitidas[0];
      formaWarn.style.display = "none";
    }
    formaSel.addEventListener("change", () => {
      if (pacFormasPermitidas && formaSel.value && !pacFormasPermitidas.includes(formaSel.value)) {
        formaWarn.textContent = "⚠ Forma no disponible en Farmacia Popular";
        formaWarn.style.display = "";
      } else {
        formaWarn.style.display = "none";
      }
    });

    function renderPanel(rows, principio) {
      if (!rows || !rows.length) {
        pacSlot.innerHTML = `<div class="ar-rx-pac-panel"><div class="ar-rx-pac-panel-head"><span>🏥 Disponibilidad en Farmacia Popular</span></div><div class="ar-rx-pac-empty">No se encontraron presentaciones de <b>${esc(principio)}</b> en PAC.</div></div>`;
        return;
      }
      const filtered = rows.filter((r) => r.principio === principio);
      const list = filtered.length ? filtered : rows;
      const disp = list.filter((r) => r.stock === "disponible").length;
      const tbody = list.map((r) => `
        <tr>
          <td>${esc(r.medicamento)}</td>
          <td>${esc(r.principio)}</td>
          <td>${esc(r.forma)}</td>
          <td><span class="badge-stock ${r.stock === "disponible" ? "ok" : "ko"}">${r.stock === "disponible" ? "Disponible" : "Agotado"}</span></td>
          <td class="num">${r.precio > 0 ? esc(r.precioTxt) : "—"}</td>
        </tr>`).join("");
      pacSlot.innerHTML = `
        <div class="ar-rx-pac-panel">
          <div class="ar-rx-pac-panel-head">
            <span>🏥 Disponibilidad en Farmacia Popular (PAC)</span>
            <span style="font-weight:500;color:#475569;text-transform:none;letter-spacing:0">${disp}/${list.length} con stock</span>
          </div>
          <table class="ar-rx-pac-table">
            <thead><tr><th>Medicamento</th><th>Principio</th><th>Forma</th><th>Stock</th><th class="num">Precio</th></tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>`;
    }
    function renderError(msg) {
      pacSlot.innerHTML = `<div class="ar-rx-pac-panel"><div class="ar-rx-pac-error">⚠ ${esc(msg || "No se pudo consultar Farmacia Popular")}</div></div>`;
    }
    function clearPanel() { pacSlot.innerHTML = ""; }

    let acIdx = -1;
    let acItems = [];
    let lastQuery = "";
    let acAbort = 0;

    function hideAc() { acBox.style.display = "none"; acIdx = -1; }
    function showAc(html) { acBox.innerHTML = html; acBox.style.display = ""; }

    async function runSearch(q) {
      const myToken = ++acAbort;
      showAc(`<div class="ar-rx-ac-loading">Buscando en Farmacia Popular…</div>`);
      const { rows, principios, error } = await pacSearch(q);
      if (myToken !== acAbort) return; // newer query came in
      if (error) {
        showAc(`<div class="ar-rx-ac-empty">⚠ ${esc(error)}</div>`);
        return;
      }
      acItems = principios.slice(0, 12);
      if (!acItems.length) {
        showAc(`<div class="ar-rx-ac-empty">Sin coincidencias en PAC para "<b>${esc(q)}</b>"</div>`);
        // Guardar rows globalmente por si selecciona "ver de todos modos"
        nombreInp._pacRows = rows;
        return;
      }
      nombreInp._pacRows = rows;
      const html = acItems.map((p, i) => `
        <div class="ar-rx-ac-item" data-i="${i}">
          <div>
            <span class="pac-badge">PAC</span>
            <b style="margin-left:6px">${esc(p.principio)}</b>
            <div class="pac-formas">${esc(p.formas.join(" · "))}</div>
          </div>
          <span style="color:#64748b;font-size:11px">${p.count}</span>
        </div>`).join("");
      showAc(html);
      acBox.querySelectorAll(".ar-rx-ac-item").forEach((node) => {
        node.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const i = Number(node.getAttribute("data-i"));
          pickPrincipio(acItems[i]);
        });
      });
    }

    function pickPrincipio(p) {
      // Set principio (sin la concentración) en el input
      const base = p.principio.replace(/\s+\d.*/i, "").trim();
      nombreInp.value = base.charAt(0) + base.slice(1).toLowerCase();
      // Extraer concentración y unidad del nombre del principio
      const concMatch = p.principio.match(/(\d[\d.,]*)\s*(mg|mcg|g|ui|mg\/ml|%)/i);
      if (concMatch) {
        if (!concVal.value) concVal.value = concMatch[1];
        if (!concUnit.value) {
          const unit = concMatch[2].toLowerCase();
          for (const opt of concUnit.options) {
            if (opt.value.toLowerCase() === unit) { concUnit.value = opt.value; break; }
          }
        }
      }
      restringirFormas(p.formas);
      renderPanel(nombreInp._pacRows || [], p.principio);
      hideAc();
    }

    let debounceT = 0;
    nombreInp.addEventListener("input", () => {
      const q = nombreInp.value.trim();
      if (q === lastQuery) return;
      lastQuery = q;
      clearTimeout(debounceT);
      if (q.length < 2) { hideAc(); resetForma(); clearPanel(); return; }
      debounceT = setTimeout(() => runSearch(q), 350);
    });
    nombreInp.addEventListener("focus", () => {
      if (nombreInp.value.trim().length >= 2 && acItems.length) acBox.style.display = "";
    });
    nombreInp.addEventListener("blur", () => { setTimeout(hideAc, 150); });
    nombreInp.addEventListener("keydown", (ev) => {
      if (acBox.style.display === "none") return;
      const nodes = acBox.querySelectorAll(".ar-rx-ac-item");
      if (!nodes.length) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); acIdx = Math.min(acIdx + 1, nodes.length - 1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); acIdx = Math.max(acIdx - 1, 0); }
      else if (ev.key === "Enter" && acIdx >= 0) { ev.preventDefault(); pickPrincipio(acItems[acIdx]); return; }
      else if (ev.key === "Escape") { hideAc(); return; }
      else return;
      nodes.forEach((n, i) => n.classList.toggle("active", i === acIdx));
    });

    // Si la fila viene precargada con nombre, dispara una búsqueda silenciosa
    // para poblar el panel sin abrir el dropdown.
    if (nombreInp.value.trim().length >= 3) {
      (async () => {
        const { rows, principios } = await pacSearch(nombreInp.value.trim());
        nombreInp._pacRows = rows;
        // Match exacto por principioBase
        const want = nombreInp.value.trim().toLowerCase().split(/\s+/)[0];
        const p = principios.find((x) => x.principioBase.startsWith(want));
        if (p) { restringirFormas(p.formas); renderPanel(rows, p.principio); }
      })();
    }
  }


  async function openEmitForm(prefill) {
    injectEmitStyles();
    const P = window.__AR_PATIENT?.extract?.() || {};
    const certs = window.__AR_CERTS;
    if (certs?.ready) await certs.ready;
    const medicos = certs?.getMedicos?.() || [];
    const activeMed = certs?.getActiveMedico?.() || medicos[0] || null;

    const data = {
      paciente: {
        nombre: prefill?.paciente?.nombre || P.nombreCompleto || "",
        rut: prefill?.paciente?.rut || P.rut || "",
        fechaNac: prefill?.paciente?.fechaNac || P.fechaNac || "",
        sexo: prefill?.paciente?.sexo || P.sexo || "",
        direccion: prefill?.paciente?.direccion || "",
      },
      diagnostico: prefill?.diagnostico || P.diagnostico || "",
      meds: prefill?.meds || [{}],
      medicoId: activeMed?.id || "",
    };

    document.querySelectorAll(".ar-rx-back").forEach((n) => n.remove());
    const back = document.createElement("div");
    back.className = "ar-rx-back";
    back.innerHTML = `
      <div class="ar-rx-card" role="dialog" aria-modal="true" aria-label="Emitir receta">
        <div class="ar-rx-head">
          <div>
            <h2>🖨 Emitir receta médica</h2>
            <div class="sub">Receta simple · Ley 19.799 · vista previa imprimible (PDF)</div>
          </div>
          <button class="ar-rx-x" type="button" title="Cerrar">✕</button>
        </div>
        <div class="ar-rx-body">



          <section class="ar-rx-section">
            <h3>👤 Paciente</h3>
            <div class="ar-rx-grid ar-rx-cols-3">
              <div class="ar-rx-field"><label>Nombre completo</label>
                <input id="ar-rx-pac-nombre" placeholder="Nombre y apellidos" value="${esc(data.paciente.nombre)}"></div>
              <div class="ar-rx-field"><label>RUT</label>
                <input id="ar-rx-pac-rut" placeholder="12.345.678-9" value="${esc(data.paciente.rut)}"></div>
              <div class="ar-rx-field"><label>Fecha de nacimiento</label>
                <input id="ar-rx-pac-fnac" type="date" value="${esc(data.paciente.fechaNac)}"></div>
            </div>
            <div class="ar-rx-grid ar-rx-cols-3" style="margin-top:10px">
              <div class="ar-rx-field"><label>Sexo</label>
                <select id="ar-rx-pac-sexo">
                  <option value="">—</option>
                  <option value="F" ${data.paciente.sexo === "F" ? "selected" : ""}>Femenino</option>
                  <option value="M" ${data.paciente.sexo === "M" ? "selected" : ""}>Masculino</option>
                </select></div>
              <div class="ar-rx-field" style="grid-column:span 2"><label>Dirección (opcional)</label>
                <input id="ar-rx-pac-dir" placeholder="Calle, número, comuna" value="${esc(data.paciente.direccion)}"></div>
            </div>
          </section>

          <section class="ar-rx-section">
            <h3>🩺 Diagnóstico</h3>
            <div class="ar-rx-field">
              <input id="ar-rx-dx" placeholder="Diagnóstico principal (ej. HTA esencial)" value="${esc(data.diagnostico)}">
            </div>
          </section>

          <section class="ar-rx-section">
            <h3>💊 Medicamentos <span class="badge" id="ar-rx-count">0</span></h3>
            <div id="ar-rx-list"></div>
            <button type="button" class="ar-rx-add" id="ar-rx-add">+ Agregar medicamento</button>
          </section>

          <section class="ar-rx-section">
            <h3>👨‍⚕️ Médico prescriptor</h3>
            ${medicos.length ? `
              <div class="ar-rx-field">
                <select id="ar-rx-medico">
                  ${medicos.map((m) => `<option value="${esc(m.id)}" ${m.id === data.medicoId ? "selected" : ""}>${esc(m.nombre)}${m.titulo ? " · " + esc(m.titulo) : ""}</option>`).join("")}
                </select>
              </div>` : `<div class="ar-rx-warn">⚠ No hay médicos configurados. Abre "Documentos / Certificados" para agregar uno.</div>`}
          </section>
        </div>
        <div class="ar-rx-foot">
          <span class="hint">Los campos se imprimen tal como se ingresen.</span>
          <div style="display:flex;gap:8px">
            <button type="button" class="ar-rx-btn ar-rx-btn-ghost" id="ar-rx-cancel">Cancelar</button>
            <button type="button" class="ar-rx-btn ar-rx-btn-primary" id="ar-rx-print">🖨 Vista previa e imprimir</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(back);

    const list = back.querySelector("#ar-rx-list");
    const countBadge = back.querySelector("#ar-rx-count");
    let meds = data.meds.slice();
    const render = () => {
      list.innerHTML = meds.map((m, i) => rowHtml(i, m)).join("");
      list.querySelectorAll(".ar-rx-med").forEach((el, i) => {
        wireRow(el);
        el.querySelector(".ar-rx-del").addEventListener("click", () => {
          meds = readMeds(); meds.splice(i, 1); if (!meds.length) meds = [{}]; render();
        });
      });
      countBadge.textContent = meds.length;
    };
    const readMeds = () => Array.from(list.querySelectorAll(".ar-rx-med")).map(readRow);
    render();

    back.querySelector("#ar-rx-add").addEventListener("click", () => { meds = readMeds(); meds.push({}); render(); });
    const close = () => back.remove();
    back.querySelector(".ar-rx-x").addEventListener("click", close);
    back.querySelector("#ar-rx-cancel").addEventListener("click", close);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });

    back.querySelector("#ar-rx-print").addEventListener("click", () => {
      const medicoId = back.querySelector("#ar-rx-medico")?.value;
      const medico = medicos.find((m) => m.id === medicoId) || activeMed || {};
      const payload = {
        paciente: {
          nombre: back.querySelector("#ar-rx-pac-nombre").value.trim(),
          rut: back.querySelector("#ar-rx-pac-rut").value.trim(),
          fechaNac: back.querySelector("#ar-rx-pac-fnac").value,
          sexo: back.querySelector("#ar-rx-pac-sexo").value,
          direccion: back.querySelector("#ar-rx-pac-dir").value.trim(),
        },
        diagnostico: back.querySelector("#ar-rx-dx").value.trim(),
        meds: readMeds().filter((m) => m.nombre),
      };
      if (!payload.paciente.nombre || !payload.paciente.rut) { toast("⚠ Falta nombre o RUT del paciente"); return; }
      if (!payload.meds.length) { toast("⚠ Agrega al menos un medicamento"); return; }
      if (!medico.nombre) { toast("⚠ Configura un médico prescriptor"); return; }
      const html = buildRecetaHtml(payload, medico);
      printHtml(html, { paciente: payload.paciente.nombre, rut: payload.paciente.rut, diagnostico: payload.diagnostico, payload, medico });
      close();
    });
  }

  // ---------- print ----------
  function buildRecetaHtml(d, medico) {
    medico = medico || {};
    const fecha = fechaLarga(new Date());
    const folio = "R-" + Date.now().toString(36).toUpperCase();
    const edad = calcEdad(d.paciente.fechaNac);
    const medsHtml = d.meds.map((m, i) => {
      const titulo = [m.nombre, m.concentracion, m.forma].filter(Boolean).join(" ");
      const cant = Number(m.cantidad) || 1;
      return `
        <div class="rx-med">
          <div class="rx-med-title">${i + 1}. ${esc(titulo)}</div>
          <div class="rx-med-body">
            <div class="rx-grid">
              <div><div class="rx-lbl">Dosis</div><div class="rx-val">${esc(m.dosis || "—")}</div></div>
              <div><div class="rx-lbl">Vía</div><div class="rx-val">${esc(m.via || "oral")}</div></div>
              <div><div class="rx-lbl">Frecuencia</div><div class="rx-val">${esc(m.frecuencia || "—")}</div></div>
              <div><div class="rx-lbl">Duración</div><div class="rx-val">${esc(m.duracion || "—")}</div></div>
              <div><div class="rx-lbl">Cantidad</div><div class="rx-val">${cant} (${numLetras(cant)})</div></div>
            </div>
            ${m.indicaciones ? `<div class="rx-ind"><b>Indicaciones:</b> ${nl2br(m.indicaciones)}</div>` : ""}
          </div>
        </div>`;
    }).join("");

    const css = `
      @page { size: letter portrait; margin: 2cm; }
      *,*::before,*::after { box-sizing: border-box; }
      html,body { margin:0; padding:0; }
      html { background:#e2e8f0; }
      body { font-family:"Helvetica Neue",Arial,sans-serif; color:#111; font-size:11pt; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .sheet { width:17.59cm; min-height:23.94cm; margin:24px auto; padding:1.6cm; background:#fff; box-shadow:0 6px 24px rgba(15,23,42,.18); }
      .rx-header { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding-bottom:10px; border-bottom:1.5px solid #0f172a; }
      .rx-pres h1 { margin:0 0 4px; font-size:14pt; }
      .rx-pres .row { margin:1px 0; font-size:9.5pt; color:#333; }
      .rx-folio { text-align:right; min-width:160px; }
      .rx-folio .folio { font-family:"Courier New",monospace; font-size:11pt; font-weight:700; }
      .rx-folio .fecha { font-size:9pt; color:#475569; margin-top:4px; }
      .rx-pac { display:grid; grid-template-columns:2fr 1fr 1fr; gap:10px; padding:10px 0; border-bottom:1px solid #cbd5e1; }
      .rx-pac-full { grid-column:1/-1; }
      .rx-lbl { font-size:8pt; color:#64748b; }
      .rx-val { font-size:10pt; font-weight:600; color:#0f172a; }
      .rx-rp { margin-top:12px; font-size:12pt; font-weight:700; }
      .rx-med { margin-top:8px; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; page-break-inside:avoid; }
      .rx-med-title { background:#f1f5f9; padding:6px 10px; font-weight:700; font-size:10.5pt; border-bottom:1px solid #cbd5e1; }
      .rx-med-body { padding:8px 10px; }
      .rx-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
      .rx-ind { margin-top:6px; font-size:10pt; }
      .rx-dx { margin-top:12px; padding:8px 10px; background:#fef3c7; border-left:3px solid #d97706; font-size:10pt; }
      .rx-firma { margin-top:60px; text-align:center; page-break-inside:avoid; }
      .rx-firma .ln { display:inline-block; border-top:1px solid #000; min-width:300px; padding-top:6px; }
      .rx-firma p { margin:2px 0; }
      .rx-foot { margin-top:14px; padding-top:6px; border-top:1px solid #cbd5e1; font-size:7.5pt; color:#64748b; }
      .toolbar { position:fixed; top:12px; right:12px; background:#0f172a; color:#fff; padding:8px 12px; border-radius:8px; font:600 12px system-ui; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,.25); }
      .toolbar button { font:600 12px system-ui; padding:4px 10px; margin-left:6px; border-radius:5px; border:0; cursor:pointer; background:#059669; color:#fff; }
      .toolbar button.alt { background:#475569; }
      @media print { html,body { background:#fff!important; } .no-print{display:none!important;} .sheet { width:auto; min-height:0; margin:0; padding:0; box-shadow:none; } }
    `;

    const inner = `
      <div class="rx-header">
        <div class="rx-pres">
          <h1>${esc(medico.nombre || "")}</h1>
          <p class="row">${esc((medico.titulo || "MÉDICO CIRUJANO"))}</p>
          <p class="row">RUT: <b>${esc(medico.rut || "")}</b>${medico.registro ? " · Reg. SIS: " + esc(medico.registro) : ""}</p>
          <p class="row">${esc(medico.institucion || "")}</p>
        </div>
        <div class="rx-folio">
          <div class="folio">${esc(folio)}</div>
          <div class="fecha">${esc(fecha)}</div>
          <div style="font-size:8pt;color:#64748b;margin-top:6px">Receta médica simple<br>Ley 19.799 (firma simple)</div>
        </div>
      </div>

      <section class="rx-pac">
        <div><div class="rx-lbl">Paciente</div><div class="rx-val">${esc(d.paciente.nombre)}</div></div>
        <div><div class="rx-lbl">RUT</div><div class="rx-val">${esc(d.paciente.rut)}</div></div>
        <div><div class="rx-lbl">Edad</div><div class="rx-val">${esc(edad || "—")}</div></div>
        ${d.paciente.direccion ? `<div class="rx-pac-full"><div class="rx-lbl">Dirección</div><div class="rx-val">${esc(d.paciente.direccion)}</div></div>` : ""}
      </section>

      ${d.diagnostico ? `<div class="rx-dx"><b>Diagnóstico:</b> ${esc(d.diagnostico)}</div>` : ""}

      <div class="rx-rp">RP / Prescripción</div>
      ${medsHtml}

      <div class="rx-firma">
        <div class="ln"></div>
        <p><b>${esc((medico.nombre || "").toUpperCase())}</b></p>
        <p style="font-size:9pt">${esc((medico.titulo || "MÉDICO CIRUJANO"))}</p>
        <p style="font-size:9pt">RUT: ${esc(medico.rut || "")}${medico.registro ? " · Reg. SIS: " + esc(medico.registro) : ""}</p>
      </div>

      <div class="rx-foot">Documento emitido por Vínculo · Receta médica simple conforme Ley 19.799 y normativa MINSAL. En caso de dudas, consulte a su Químico(a) Farmacéutico(a) o prescriptor.</div>
    `;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receta ${esc(folio)}</title><style>${css}</style></head><body>
      <div class="toolbar no-print"><span>Vista previa · Receta</span>
        <button onclick="window.print()">🖨 Imprimir</button>
        <button class="alt" onclick="window.close()">✕ Cerrar</button>
      </div>
      <div class="sheet">${inner}</div></body></html>`;
  }

  function printHtml(html, meta) {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { toast("⚠ Permite ventanas emergentes para imprimir"); return; }
    w.document.open(); w.document.write(html); w.document.close();
    const medico = meta?.medico || window.__AR_CERTS?.getActiveMedico?.() || {};
    try {
      window.__AR_HIST?.add?.({
        kind: "receta", subtype: "emit", label: "Receta médica",
        paciente: meta?.paciente || "", rut: meta?.rut || "",
        medico: medico.nombre || "",
        html,
      });
    } catch {}
    // historial dedicado de recetas (por médico, hasta HIST_MAX)
    try {
      histAdd({
        medicoId: medico.id || activeMedicoId(),
        medicoNombre: medico.nombre || "",
        paciente: meta?.paciente || "",
        rut: meta?.rut || "",
        diagnostico: meta?.diagnostico || "",
        payload: meta?.payload || null,
        html,
      });
    } catch (e) { log.warn("histAdd error", e); }
  }

  window.__AR_RECETA_EMIT = {
    showRecetaChooser,
    openEmitForm,
    openHistoryModal,
    editLastReceta,
    histList,
    histRemove,
    buildRecetaHtml,
    print: printHtml,
  };
  log.info("recetas-emit listo");
})();
