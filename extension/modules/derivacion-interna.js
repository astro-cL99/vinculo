/* Vínculo — Derivación Interna
 * Genera correos de derivación interna (intra-CESFAM) con datos del paciente
 * autocompletados desde la ficha. Local-first: solo abre el cliente de correo
 * del usuario (mailto: o Gmail compose). No envía datos a ningún servidor.
 *
 * API:
 *   window.__AR_DERIV = { open(), openTab(name) }
 *
 * Storage (chrome.storage.local):
 *   ar_deriv_config = {
 *     sender: "medico@cesfam.cl",
 *     senderName: "Dr. Apellido",
 *     recipients: [ { id, email, label, tags: ["salud-mental"|"cronico"|...] } ],
 *     flows: { ... overrides opcionales }
 *   }
 */
(function () {
  if (window.__AR_DERIV) return;

  const STORE = "ar_deriv_config";
  const H = () => window.__AR_HOST || {};
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => "r_" + Math.random().toString(36).slice(2, 9);

  // ============ Catálogo de flujos predefinidos ============
  const FLOWS = {
    "salud-mental": {
      id: "salud-mental",
      title: "Programa de Salud Mental",
      icon: "🧠",
      tag: "salud-mental",
      options: [
        {
          id: "tamizaje-psico",
          label: "Tamizaje por Psicología",
          subject: (p) => `[Derivación SM · Tamizaje Psicología] ${p.nombreCompleto || p.rut || ""}`,
          template: (p, ctx) => [
            "Estimado equipo de Salud Mental,",
            "",
            "Solicito tamizaje por Psicología para el siguiente paciente:",
            "",
            "• Nombre: " + (p.nombreCompleto || "—"),
            "• RUT: " + (p.rut || "—"),
            "• Edad / Sexo: " + (p.edad ? p.edad + " años" : "—") + " · " + (p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : "—"),
            "• Diagnóstico vigente: " + (p.diagnostico || "—"),
            "",
            "Motivo de derivación / hallazgos relevantes:",
            ctx.motivo || "[Completar: PHQ-9, GAD-7, ideación suicida, consumo problemático, violencia, duelo, etc.]",
            "",
            "Agradezco gestión.",
          ].join("\n"),
        },
        {
          id: "ingreso-medico-sm",
          label: "Ingreso Médico Salud Mental",
          subject: (p) => `[Derivación SM · Ingreso Médico] ${p.nombreCompleto || p.rut || ""}`,
          template: (p, ctx) => [
            "Estimado equipo de Salud Mental,",
            "",
            "Solicito Ingreso Médico al Programa de Salud Mental para:",
            "",
            "• Nombre: " + (p.nombreCompleto || "—"),
            "• RUT: " + (p.rut || "—"),
            "• Edad / Sexo: " + (p.edad ? p.edad + " años" : "—") + " · " + (p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : "—"),
            "• Diagnóstico vigente: " + (p.diagnostico || "—"),
            "",
            "Justificación clínica:",
            ctx.motivo || "[Completar: trastorno depresivo, ansioso, bipolar, psicótico, consumo problemático con criterio GES, etc.]",
            "",
            "Tratamiento farmacológico actual: " + (ctx.farmacos || "—"),
            "",
            "Agradezco priorización.",
          ].join("\n"),
        },
      ],
    },
    "cronico": {
      id: "cronico",
      title: "Control Crónico (PSCV)",
      icon: "🩺",
      tag: "cronico",
      options: [
        {
          id: "descompensado",
          label: "Paciente descompensado",
          subject: (p) => `[Derivación PSCV · Descompensado] ${p.nombreCompleto || p.rut || ""}`,
          template: (p, ctx) => [
            "Estimado equipo PSCV,",
            "",
            "Derivo paciente crónico DESCOMPENSADO para reagendar y reforzar control:",
            "",
            "• Nombre: " + (p.nombreCompleto || "—"),
            "• RUT: " + (p.rut || "—"),
            "• Edad / Sexo: " + (p.edad ? p.edad + " años" : "—") + " · " + (p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : "—"),
            "• Diagnóstico crónico: " + (p.diagnostico || "—"),
            "",
            "Parámetros actuales:",
            ctx.parametros || "[PA, HbA1c, LDL, VFGe, RAC — pegar valores del último Lab]",
            "",
            "Meta no alcanzada / motivo de descompensación:",
            ctx.motivo || "[Completar]",
            "",
            "Solicito: reagendar control médico precoz + refuerzo educativo enfermería + reevaluación tratamiento.",
          ].join("\n"),
        },
        {
          id: "sin-controles-12m",
          label: "Sin controles > 12 meses",
          subject: (p) => `[Derivación PSCV · Rescate >12m] ${p.nombreCompleto || p.rut || ""}`,
          template: (p, ctx) => [
            "Estimado equipo PSCV / Rescate Cardiovascular,",
            "",
            "Solicito gestionar RESCATE de paciente crónico sin controles en los últimos 12 meses:",
            "",
            "• Nombre: " + (p.nombreCompleto || "—"),
            "• RUT: " + (p.rut || "—"),
            "• Edad / Sexo: " + (p.edad ? p.edad + " años" : "—") + " · " + (p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : "—"),
            "• Diagnóstico crónico: " + (p.diagnostico || "—"),
            "• Último control conocido: " + (ctx.ultimoControl || "—"),
            "",
            "Acción solicitada:",
            "1) Contacto telefónico por TENS / Asistente Social.",
            "2) Visita domiciliaria si no responde.",
            "3) Reagendar control médico + enfermería + farmacia.",
            "",
            ctx.motivo ? "Notas adicionales:\n" + ctx.motivo : "",
          ].join("\n"),
        },
      ],
    },
  };

  // ============ Storage helpers ============
  function loadConfig() {
    return new Promise((res) => {
      const def = { sender: "", senderName: "", recipients: [], customFlows: [] };
      try {
        chrome.storage.local.get({ [STORE]: null }, (r) => {
          const c = r[STORE] || def;
          if (!Array.isArray(c.customFlows)) c.customFlows = [];
          if (!Array.isArray(c.recipients)) c.recipients = [];
          res(c);
        });
      } catch { res(def); }
    });
  }
  function saveConfig(cfg) {
    return new Promise((res) => {
      try { chrome.storage.local.set({ [STORE]: cfg }, () => res(true)); }
      catch { res(false); }
    });
  }

  // ============ Patient context ============
  function getPatient() {
    let p = {};
    try { p = window.__AR_PATIENT?.extract?.() || {}; } catch {}
    return {
      nombreCompleto: p.nombreCompleto || p.nombre || "",
      rut: p.rut || "",
      edad: p.edad || "",
      sexo: p.sexo || "",
      diagnostico: p.diagnostico || "",
    };
  }
  function getLabSummary() {
    try {
      const lab = H().getLabSession?.();
      if (!lab || !lab.analytes) return "";
      const keys = ["pas", "pad", "hba1c", "ldl", "vfg", "vfge", "rac", "creatinina", "k", "potasio"];
      const lines = [];
      for (const [k, a] of Object.entries(lab.analytes)) {
        const kk = String(k).toLowerCase();
        if (keys.some((x) => kk.includes(x))) {
          lines.push("  - " + (a.rawName || a.name || k) + ": " + (a.value ?? "") + " " + (a.unit || ""));
        }
      }
      return lines.length ? lines.join("\n") : "";
    } catch { return ""; }
  }

  // ============ Modal UI ============
  let modal = null;
  function close() { if (modal) { modal.remove(); modal = null; } }

  async function open(initialTab) {
    if (modal) { close(); return; }
    const cfg = await loadConfig();
    modal = document.createElement("div");
    modal.id = "ar-deriv";
    Object.assign(modal.style, {
      position: "fixed", inset: "0", zIndex: "2147483646",
      background: "rgba(15,23,42,.55)", display: "flex",
      alignItems: "center", justifyContent: "center",
    });
    modal.innerHTML = `
      <div style="background:#fff;width:min(820px,95vw);max-height:90vh;overflow:auto;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:system-ui,-apple-system,sans-serif">
        <header style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e8f0">
          <strong style="font-size:16px;color:#0f172a">✉️ Derivación interna</strong>
          <button id="ar-deriv-close" type="button" style="background:none;border:0;font-size:20px;cursor:pointer;color:#64748b">✕</button>
        </header>
        <nav style="display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
          <button data-tab="nueva" class="ar-dv-tab" type="button">📝 Nueva derivación</button>
          <button data-tab="config" class="ar-dv-tab" type="button">⚙ Configuración</button>
        </nav>
        <div id="ar-deriv-body" style="padding:16px 18px"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll(".ar-dv-tab").forEach((b) => {
      Object.assign(b.style, {
        padding: "8px 14px", border: "0", borderRadius: "6px",
        background: "transparent", cursor: "pointer", fontWeight: "600",
        color: "#475569",
      });
      b.onclick = () => renderTab(b.dataset.tab, cfg);
    });
    modal.querySelector("#ar-deriv-close").onclick = close;
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    renderTab(initialTab || "nueva", cfg);
  }

  function renderTab(name, cfg) {
    modal.querySelectorAll(".ar-dv-tab").forEach((b) => {
      const on = b.dataset.tab === name;
      b.style.background = on ? "#0ea5e9" : "transparent";
      b.style.color = on ? "#fff" : "#475569";
    });
    const body = modal.querySelector("#ar-deriv-body");
    if (name === "config") renderConfig(body, cfg);
    else renderNueva(body, cfg);
  }

  // ---------- Render placeholders en plantillas custom ----------
  function renderPlaceholders(tpl, p, ctx, cfg) {
    const map = {
      nombre: p.nombreCompleto || "—",
      rut: p.rut || "—",
      edad: p.edad ? p.edad + " años" : "—",
      sexo: p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : "—",
      diagnostico: p.diagnostico || "—",
      motivo: ctx.motivo || "",
      lab: ctx.parametros || "",
      emisor: cfg.senderName || "",
      emisorMail: cfg.sender || "",
      fecha: new Date().toLocaleDateString("es-CL"),
    };
    return String(tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => map[k] != null ? map[k] : "");
  }

  // Combina flujos predefinidos + custom del usuario
  function getAllFlows(cfg) {
    const all = { ...FLOWS };
    (cfg.customFlows || []).forEach((cf) => {
      all[cf.id] = {
        id: cf.id,
        title: cf.title,
        icon: cf.icon || "✉️",
        tag: cf.tag || cf.id,
        custom: true,
        options: [{
          id: "default",
          label: cf.title,
          subject: (p) => renderPlaceholders(cf.subject || `[Derivación] {{nombre}}`, p, {}, cfg),
          template: (p, ctx) => renderPlaceholders(cf.body || "", p, ctx, cfg),
        }],
      };
    });
    return all;
  }

  // ---------- Tab: Nueva ----------
  function renderNueva(body, cfg) {
    const p = getPatient();
    const labSum = getLabSummary();
    const hasPatient = !!(p.rut || p.nombreCompleto);
    const ALL = getAllFlows(cfg);
    const flowKeys = Object.keys(ALL);

    body.innerHTML = `
      <div style="background:${hasPatient ? "#ecfdf5" : "#fef3c7"};border:1px solid ${hasPatient ? "#a7f3d0" : "#fde68a"};border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px">
        ${hasPatient
          ? `<b>Paciente detectado:</b> ${esc(p.nombreCompleto || "—")} ${p.rut ? "· " + esc(p.rut) : ""} ${p.edad ? "· " + esc(p.edad) + " a." : ""} ${p.diagnostico ? "<br><b>Dx:</b> " + esc(p.diagnostico) : ""}`
          : `⚠ Sin paciente activo. Abre una ficha primero para autocompletar los datos.`}
      </div>

      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">1. Flujo de derivación</label>
      <select id="dv-flow" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:12px">
        ${flowKeys.map((k) => `<option value="${k}">${ALL[k].icon} ${esc(ALL[k].title)}${ALL[k].custom ? " (personalizada)" : ""}</option>`).join("")}
      </select>

      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">2. Tipo de solicitud</label>
      <select id="dv-opt" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:12px"></select>

      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">3. Destinatario(s)</label>
      <div id="dv-rec-list" style="margin-bottom:6px"></div>
      ${cfg.recipients.length === 0 ? `<div style="font-size:12px;color:#b45309;background:#fef3c7;padding:6px 10px;border-radius:6px;margin-bottom:12px">Aún no hay destinatarios guardados. Ve a <b>⚙ Configuración</b> para añadirlos.</div>` : ""}
      <input id="dv-extra-mail" type="email" placeholder="O escribe un correo adicional (opcional)" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:12px;font-size:13px"/>

      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">4. Motivo / notas clínicas</label>
      <textarea id="dv-motivo" rows="4" placeholder="Resumen breve del motivo, hallazgos o justificación clínica" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:8px;font-family:inherit;font-size:13px"></textarea>

      ${labSum ? `<details style="margin-bottom:12px"><summary style="cursor:pointer;font-size:12px;color:#0369a1">📊 Incluir valores de laboratorio detectados</summary><pre style="background:#f1f5f9;padding:8px;border-radius:6px;font-size:11px;white-space:pre-wrap;margin:6px 0 0">${esc(labSum)}</pre><label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px"><input type="checkbox" id="dv-inc-lab" checked/> Incluir en el correo</label></details>` : ""}

      <div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #e2e8f0;padding-top:12px">
        <button id="dv-preview" type="button" style="padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">👁 Previsualizar</button>
        <button id="dv-gmail" type="button" style="padding:8px 14px;border:1px solid #0d9488;background:#0d9488;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">📧 Abrir en Gmail</button>
      </div>
      <div id="dv-preview-out" style="margin-top:12px"></div>
    `;

    const $ = (s) => body.querySelector(s);
    const flowSel = $("#dv-flow");
    const optSel = $("#dv-opt");
    const recList = $("#dv-rec-list");

    function syncOpts() {
      const f = ALL[flowSel.value];
      optSel.innerHTML = f.options.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join("");
      const tag = f.tag;
      const matching = cfg.recipients.filter((r) => !r.tags?.length || r.tags.includes(tag));
      const all = cfg.recipients;
      const show = matching.length ? matching : all;
      recList.innerHTML = show.length
        ? show.map((r) => `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:4px;font-size:13px"><input type="checkbox" class="dv-rec-cb" value="${esc(r.email)}" ${matching.includes(r) ? "checked" : ""}/> <b>${esc(r.label || "(sin etiqueta)")}</b> <span style="color:#64748b">${esc(r.email)}</span></label>`).join("")
        : "";
    }
    flowSel.onchange = syncOpts;
    syncOpts();

    function compose() {
      const f = ALL[flowSel.value];
      const opt = f.options.find((o) => o.id === optSel.value) || f.options[0];
      const motivo = $("#dv-motivo").value.trim();
      const labCb = $("#dv-inc-lab");
      const incLab = labCb ? labCb.checked : false;
      const ctx = {
        motivo,
        farmacos: "",
        parametros: incLab ? labSum : "",
        ultimoControl: "",
      };
      let bodyTxt = opt.template(p, ctx);
      if (incLab && !bodyTxt.includes(labSum) && labSum) {
        bodyTxt += "\n\nLab reciente:\n" + labSum;
      }
      if (!f.custom && (cfg.senderName || cfg.sender)) {
        bodyTxt += "\n\n—\n" + (cfg.senderName || "") + (cfg.sender ? "\n" + cfg.sender : "");
      }
      const checked = Array.from(modal.querySelectorAll(".dv-rec-cb")).filter((c) => c.checked).map((c) => c.value);
      const extra = $("#dv-extra-mail").value.trim();
      const toList = [...checked, ...(extra ? [extra] : [])].filter(Boolean);
      return { to: toList, subject: opt.subject(p), body: bodyTxt, ctx };
    }

    $("#dv-preview").onclick = () => {
      const c = compose();
      $("#dv-preview-out").innerHTML = `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px">
          <div><b>Para:</b> ${esc(c.to.join(", ") || "(ninguno)")}</div>
          <div><b>Asunto:</b> ${esc(c.subject)}</div>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:8px 0"/>
          <pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(c.body)}</pre>
        </div>`;
    };

    function doSend(c) {
      const enc = encodeURIComponent;
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(c.to.join(","))}&su=${enc(c.subject)}&body=${enc(c.body)}`;
      window.open(url, "_blank", "noopener");
      H().toast?.("✓ Derivación abierta en Gmail");
    }

    function confirmAndSend() {
      const c = compose();
      if (!c.to.length) { H().toast?.("Selecciona al menos un destinatario"); return; }
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "2147483647",
        background: "rgba(15,23,42,.65)", display: "flex",
        alignItems: "center", justifyContent: "center",
      });
      overlay.innerHTML = `
        <div style="background:#fff;width:min(720px,95vw);max-height:88vh;display:flex;flex-direction:column;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:system-ui,-apple-system,sans-serif;overflow:hidden">
          <header style="padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
            <strong style="font-size:15px;color:#0f172a">Confirmar derivación</strong>
            <div style="font-size:12px;color:#64748b;margin-top:2px">Revisa que los datos de la ficha se hayan rellenado correctamente antes de abrir Gmail.</div>
          </header>
          <div style="padding:14px 16px;overflow:auto;font-size:13px;flex:1 1 auto;min-height:0">
            <div style="margin-bottom:6px"><b>Para:</b> ${esc(c.to.join(", "))}</div>
            <div style="margin-bottom:6px"><b>Asunto:</b> ${esc(c.subject)}</div>
            <hr style="border:0;border-top:1px solid #e2e8f0;margin:8px 0"/>
            <pre style="white-space:pre-wrap;font-family:inherit;margin:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;overflow:auto">${esc(c.body)}</pre>
          </div>
          <footer style="display:flex;gap:8px;justify-content:flex-end;padding:10px 16px;border-top:1px solid #e2e8f0;background:#f8fafc;flex:0 0 auto">
            <button id="dv-cf-cancel" type="button" style="padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">Cancelar y editar</button>
            <button id="dv-cf-ok" type="button" style="padding:8px 14px;border:0;background:#0d9488;color:#fff;border-radius:6px;cursor:pointer;font-weight:700">📧 Abrir en Gmail</button>
          </footer>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      overlay.querySelector("#dv-cf-cancel").onclick = close;
      overlay.querySelector("#dv-cf-ok").onclick = () => { close(); doSend(c); };
    }
    $("#dv-gmail").onclick = () => confirmAndSend();
  }

  // ---------- Tab: Config ----------
  function renderConfig(body, cfg) {
    const flowTags = [
      ...Object.values(FLOWS).map((f) => ({ tag: f.tag, title: f.title })),
      ...(cfg.customFlows || []).map((f) => ({ tag: f.tag || f.id, title: f.title })),
    ];
    body.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a">Datos del emisor</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px">
        <label style="font-size:12px;color:#475569">Nombre visible
          <input id="cfg-sname" type="text" value="${esc(cfg.senderName || "")}" placeholder="Dr/a. Nombre Apellido" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-top:2px"/>
        </label>
        <label style="font-size:12px;color:#475569">Correo del emisor
          <input id="cfg-smail" type="email" value="${esc(cfg.sender || "")}" placeholder="medico@cesfam.cl" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-top:2px"/>
        </label>
      </div>

      <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a">Destinatarios frecuentes</h3>
      <div id="cfg-rec-list" style="margin-bottom:12px"></div>

      <fieldset style="border:1px dashed #cbd5e1;border-radius:8px;padding:10px;margin-bottom:12px">
        <legend style="font-size:12px;padding:0 6px;color:#475569">Añadir destinatario</legend>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input id="cfg-new-label" type="text" placeholder="Etiqueta (ej: Psicóloga Marisol)" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px"/>
          <input id="cfg-new-mail" type="email" placeholder="correo@cesfam.cl" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px"/>
        </div>
        <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:12px">
          <span style="color:#475569">Etiquetas de flujo:</span>
          ${flowTags.map((t) => `<label style="display:inline-flex;align-items:center;gap:4px"><input type="checkbox" class="cfg-new-tag" value="${esc(t.tag)}"/> ${esc(t.title)}</label>`).join("")}
        </div>
        <button id="cfg-new-add" type="button" style="margin-top:8px;padding:6px 12px;border:1px solid #0ea5e9;background:#0ea5e9;color:#fff;border-radius:6px;cursor:pointer">+ Añadir</button>
      </fieldset>

      <h3 style="margin:14px 0 6px;font-size:14px;color:#0f172a">Plantillas personalizadas</h3>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px">
        Placeholders disponibles en asunto y cuerpo:
        <code>{{nombre}}</code> <code>{{rut}}</code> <code>{{edad}}</code> <code>{{sexo}}</code>
        <code>{{diagnostico}}</code> <code>{{motivo}}</code> <code>{{lab}}</code>
        <code>{{emisor}}</code> <code>{{emisorMail}}</code> <code>{{fecha}}</code>
      </div>
      <div id="cfg-cflow-list" style="margin-bottom:10px"></div>

      <fieldset style="border:1px dashed #cbd5e1;border-radius:8px;padding:10px;margin-bottom:12px">
        <legend style="font-size:12px;padding:0 6px;color:#475569">Nueva plantilla personalizada</legend>
        <div style="display:grid;grid-template-columns:60px 1fr 1fr;gap:8px;margin-bottom:6px">
          <input id="cfg-cf-icon" type="text" placeholder="✉️" maxlength="2" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px;text-align:center"/>
          <input id="cfg-cf-title" type="text" placeholder="Título del flujo (ej: Derivación Asistente Social)" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px"/>
          <input id="cfg-cf-tag" type="text" placeholder="Etiqueta corta (ej: social)" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px"/>
        </div>
        <input id="cfg-cf-subject" type="text" placeholder="Asunto del correo (ej: [Derivación social] {{nombre}})" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:6px;font-size:13px"/>
        <textarea id="cfg-cf-body" rows="6" placeholder="Cuerpo libre del correo. Usa {{nombre}}, {{rut}}, {{motivo}}, etc." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-family:inherit;font-size:13px"></textarea>
        <button id="cfg-cf-add" type="button" style="margin-top:8px;padding:6px 12px;border:1px solid #0d9488;background:#0d9488;color:#fff;border-radius:6px;cursor:pointer">+ Añadir plantilla</button>
      </fieldset>

      <div style="display:flex;justify-content:flex-end;border-top:1px solid #e2e8f0;padding-top:12px">
        <button id="cfg-save" type="button" style="padding:8px 16px;border:1px solid #0d9488;background:#0d9488;color:#fff;border-radius:6px;cursor:pointer;font-weight:700">💾 Guardar</button>
      </div>
    `;


    const $ = (s) => body.querySelector(s);
    const recList = $("#cfg-rec-list");

    function drawRecs() {
      if (!cfg.recipients.length) {
        recList.innerHTML = `<div style="color:#64748b;font-size:13px;font-style:italic">Sin destinatarios guardados.</div>`;
        return;
      }
      recList.innerHTML = cfg.recipients.map((r) => `
        <div style="display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:4px">
          <input class="cfg-r-label" data-id="${r.id}" type="text" value="${esc(r.label || "")}" style="flex:0 0 28%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px"/>
          <input class="cfg-r-mail" data-id="${r.id}" type="email" value="${esc(r.email || "")}" style="flex:1;padding:6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px"/>
          <span style="font-size:11px;color:#64748b">${flowTags.map((t) => `<label style="margin-right:6px"><input type="checkbox" class="cfg-r-tag" data-id="${r.id}" value="${esc(t.tag)}" ${r.tags?.includes(t.tag) ? "checked" : ""}/>${esc(t.title.split(" ")[0])}</label>`).join("")}</span>
          <button class="cfg-r-del" data-id="${r.id}" type="button" style="background:#fee2e2;color:#991b1b;border:0;border-radius:4px;padding:4px 8px;cursor:pointer">🗑</button>
        </div>`).join("");
      recList.querySelectorAll(".cfg-r-del").forEach((b) => {
        b.onclick = async () => {
          cfg.recipients = cfg.recipients.filter((r) => r.id !== b.dataset.id);
          drawRecs();
          await saveConfig(cfg);
          H().toast?.("✓ Destinatario eliminado");
        };
      });
      // Auto-guardado al editar etiqueta/correo/tags inline
      recList.querySelectorAll(".cfg-r-label, .cfg-r-mail").forEach((i) => {
        i.onchange = async () => {
          const r = cfg.recipients.find((x) => x.id === i.dataset.id);
          if (!r) return;
          if (i.classList.contains("cfg-r-label")) r.label = i.value.trim();
          else r.email = i.value.trim();
          await saveConfig(cfg);
          H().toast?.("✓ Guardado");
        };
      });
      recList.querySelectorAll(".cfg-r-tag").forEach((c) => {
        c.onchange = async () => {
          const r = cfg.recipients.find((x) => x.id === c.dataset.id);
          if (!r) return;
          r.tags = r.tags || [];
          if (c.checked) r.tags = Array.from(new Set([...r.tags, c.value]));
          else r.tags = r.tags.filter((t) => t !== c.value);
          await saveConfig(cfg);
          H().toast?.("✓ Etiquetas actualizadas");
        };
      });
    }
    drawRecs();

    $("#cfg-new-add").onclick = async () => {
      const label = $("#cfg-new-label").value.trim();
      const email = $("#cfg-new-mail").value.trim();
      if (!email || !/.+@.+\..+/.test(email)) { H().toast?.("Correo inválido"); return; }
      const tags = Array.from(body.querySelectorAll(".cfg-new-tag")).filter((c) => c.checked).map((c) => c.value);
      cfg.recipients.push({ id: uid(), label: label || email, email, tags });
      $("#cfg-new-label").value = ""; $("#cfg-new-mail").value = "";
      body.querySelectorAll(".cfg-new-tag").forEach((c) => (c.checked = false));
      drawRecs();
      await saveConfig(cfg);
      H().toast?.("✓ Destinatario guardado");
    };

    // ---------- Plantillas personalizadas ----------
    const cflowList = $("#cfg-cflow-list");
    function drawCFlows() {
      if (!cfg.customFlows.length) {
        cflowList.innerHTML = `<div style="color:#64748b;font-size:13px;font-style:italic">Sin plantillas personalizadas aún.</div>`;
        return;
      }
      cflowList.innerHTML = cfg.customFlows.map((f) => `
        <details style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:6px;background:#f8fafc">
          <summary style="cursor:pointer;font-size:13px;font-weight:600;color:#0f172a">${esc(f.icon || "✉️")} ${esc(f.title)} <span style="font-size:11px;color:#64748b;font-weight:400">· tag: ${esc(f.tag || f.id)}</span></summary>
          <div style="margin-top:8px;display:grid;gap:6px">
            <div style="display:grid;grid-template-columns:60px 1fr 1fr;gap:6px">
              <input class="cf-edit-icon" data-id="${f.id}" type="text" value="${esc(f.icon || "")}" maxlength="2" style="padding:6px;border:1px solid #cbd5e1;border-radius:4px;text-align:center;font-size:12px"/>
              <input class="cf-edit-title" data-id="${f.id}" type="text" value="${esc(f.title)}" style="padding:6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px"/>
              <input class="cf-edit-tag" data-id="${f.id}" type="text" value="${esc(f.tag || f.id)}" style="padding:6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px"/>
            </div>
            <input class="cf-edit-subject" data-id="${f.id}" type="text" value="${esc(f.subject || "")}" placeholder="Asunto" style="padding:6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px"/>
            <textarea class="cf-edit-body" data-id="${f.id}" rows="5" placeholder="Cuerpo" style="padding:6px;border:1px solid #cbd5e1;border-radius:4px;font-family:inherit;font-size:12px">${esc(f.body || "")}</textarea>
            <div style="display:flex;justify-content:flex-end">
              <button class="cf-edit-del" data-id="${f.id}" type="button" style="background:#fee2e2;color:#991b1b;border:0;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px">🗑 Eliminar plantilla</button>
            </div>
          </div>
        </details>`).join("");
      cflowList.querySelectorAll(".cf-edit-del").forEach((b) => {
        b.onclick = async () => {
          cfg.customFlows = cfg.customFlows.filter((f) => f.id !== b.dataset.id);
          drawCFlows();
          await saveConfig(cfg);
          H().toast?.("✓ Plantilla eliminada");
        };
      });
      cflowList.querySelectorAll(".cf-edit-icon, .cf-edit-title, .cf-edit-tag, .cf-edit-subject, .cf-edit-body").forEach((el) => {
        el.onchange = async () => {
          const f = cfg.customFlows.find((x) => x.id === el.dataset.id);
          if (!f) return;
          if (el.classList.contains("cf-edit-icon")) f.icon = el.value.trim() || "✉️";
          else if (el.classList.contains("cf-edit-title")) f.title = el.value.trim();
          else if (el.classList.contains("cf-edit-tag")) f.tag = el.value.trim().toLowerCase().replace(/\s+/g, "-") || f.id;
          else if (el.classList.contains("cf-edit-subject")) f.subject = el.value;
          else if (el.classList.contains("cf-edit-body")) f.body = el.value;
          await saveConfig(cfg);
          H().toast?.("✓ Plantilla guardada");
        };
      });
    }
    drawCFlows();

    $("#cfg-cf-add").onclick = async () => {
      const title = $("#cfg-cf-title").value.trim();
      const subject = $("#cfg-cf-subject").value.trim();
      const bodyTxt = $("#cfg-cf-body").value;
      if (!title) { H().toast?.("Falta el título"); return; }
      if (!subject || !bodyTxt.trim()) { H().toast?.("Falta asunto o cuerpo"); return; }
      const id = "cf_" + uid();
      const tag = ($("#cfg-cf-tag").value.trim() || title).toLowerCase().replace(/\s+/g, "-");
      cfg.customFlows.push({
        id,
        icon: $("#cfg-cf-icon").value.trim() || "✉️",
        title,
        tag,
        subject,
        body: bodyTxt,
      });
      $("#cfg-cf-icon").value = "";
      $("#cfg-cf-title").value = "";
      $("#cfg-cf-tag").value = "";
      $("#cfg-cf-subject").value = "";
      $("#cfg-cf-body").value = "";
      drawCFlows();
      await saveConfig(cfg);
      H().toast?.("✓ Plantilla añadida");
    };


    // Auto-guardado de datos del emisor al perder foco
    ["#cfg-sname", "#cfg-smail"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.onchange = async () => {
        cfg.senderName = $("#cfg-sname").value.trim();
        cfg.sender = $("#cfg-smail").value.trim();
        await saveConfig(cfg);
        H().toast?.("✓ Emisor guardado");
      };
    });

    $("#cfg-save").onclick = async () => {
      cfg.senderName = $("#cfg-sname").value.trim();
      cfg.sender = $("#cfg-smail").value.trim();
      // capturar ediciones inline
      body.querySelectorAll(".cfg-r-label").forEach((i) => {
        const r = cfg.recipients.find((x) => x.id === i.dataset.id); if (r) r.label = i.value.trim();
      });
      body.querySelectorAll(".cfg-r-mail").forEach((i) => {
        const r = cfg.recipients.find((x) => x.id === i.dataset.id); if (r) r.email = i.value.trim();
      });
      // tags
      cfg.recipients.forEach((r) => { r.tags = []; });
      body.querySelectorAll(".cfg-r-tag").forEach((c) => {
        if (!c.checked) return;
        const r = cfg.recipients.find((x) => x.id === c.dataset.id);
        if (r) r.tags = Array.from(new Set([...(r.tags || []), c.value]));
      });
      await saveConfig(cfg);
      H().toast?.("✓ Configuración guardada");
    };
  }

  window.__AR_DERIV = { open, openTab: (n) => open(n) };
})();
