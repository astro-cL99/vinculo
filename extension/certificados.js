/* Vínculo — Generador de certificados médicos.
 *
 * Funciones:
 *   - CRUD de médicos (chrome.storage.local clave "ar-medicos")
 *   - 4 tipos de certificado: atención, controles, salud, reposo
 *   - Informe Biomédico Funcional (COMPIN)
 *   - Vista previa imprimible (window.open + window.print)
 *
 * API: window.__AR_CERTS = {
 *   ready: Promise,
 *   getMedicos(): Medico[],
 *   addMedico(m): Promise<void>,
 *   updateMedico(id, m): Promise<void>,
 *   removeMedico(id): Promise<void>,
 *   setActiveMedico(id): Promise<void>,
 *   getActiveMedico(): Medico | null,
 *   buildCertificateHtml(type, data, medico): string,
 *   buildCompinHtml(data, medico): string,
 *   print(html): void,
 * }
 */
(function () {
  if (window.__AR_CERTS) return;

  const log = (window.__AR_LOG && window.__AR_LOG("certs")) || { info: () => {}, warn: () => {} };

  const STORAGE_KEY = "ar-medicos";
  const STATE = { medicos: [], activeId: null };
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function nl2br(s) { return escapeHtml(s).replace(/\n/g, "<br/>"); }
  function fechaLarga(d) { d = d || new Date(); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
  function fechaCorta(s) { if (!s) return ""; const [y, m, d] = s.split("-"); if (!d) return s; return `${d}/${m}/${y.slice(2)}`; }

  // ---------- Storage ----------
  function loadFromStorage() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY, STORAGE_KEY + "-active"], (res) => {
          const list = res[STORAGE_KEY];
          if (Array.isArray(list)) STATE.medicos = list;
          STATE.activeId = res[STORAGE_KEY + "-active"] || (STATE.medicos[0]?.id ?? null);
          resolve();
        });
      } catch (e) {
        log.warn("storage no disponible", e);
        resolve();
      }
    });
  }
  function persistMedicos() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: STATE.medicos }, () => resolve());
      } catch (e) { log.warn("persist err", e); resolve(); }
    });
  }
  function persistActive() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY + "-active"]: STATE.activeId }, () => resolve());
      } catch (e) { resolve(); }
    });
  }

  function genId() {
    return "m_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function getMedicos() { return STATE.medicos.slice(); }
  function getActiveMedico() {
    return STATE.medicos.find((m) => m.id === STATE.activeId) || STATE.medicos[0] || null;
  }
  async function setActiveMedico(id) { STATE.activeId = id; await persistActive(); }
  async function addMedico(m) {
    const nuevo = { id: genId(), ...m };
    STATE.medicos.push(nuevo);
    if (!STATE.activeId) STATE.activeId = nuevo.id;
    await persistMedicos();
    await persistActive();
    return nuevo;
  }
  async function updateMedico(id, patch) {
    STATE.medicos = STATE.medicos.map((m) => (m.id === id ? { ...m, ...patch } : m));
    await persistMedicos();
  }
  async function removeMedico(id) {
    STATE.medicos = STATE.medicos.filter((m) => m.id !== id);
    if (STATE.activeId === id) STATE.activeId = STATE.medicos[0]?.id || null;
    await persistMedicos();
    await persistActive();
  }

  // ---------- HTML printable shell ----------
  // Tamaño carta US: 21.59cm × 27.94cm. Margen 2.5cm.
  // Área útil ≈ 16.59cm × 22.94cm.
  function shellCss() {
    return `
      /* ---------- Page setup ---------- */
      @page { size: letter portrait; margin: 2.5cm; }

      /* ---------- Reset ---------- */
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }

      /* ---------- Vista previa: simular hoja carta ---------- */
      html { background: #e2e8f0; }
      body {
        font-family: "Helvetica Neue", Arial, Helvetica, sans-serif;
        font-size: 13px; color: #000; line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        width: 16.59cm;            /* 21.59cm carta - 2*2.5cm margen */
        min-height: 22.94cm;       /* 27.94cm carta - 2*2.5cm margen */
        margin: 28px auto;
        padding: 2.5cm;            /* simula márgenes en pantalla */
        background: #fff;
        box-shadow: 0 6px 24px rgba(15,23,42,.18);
      }

      /* ---------- Encabezado y meta ---------- */
      .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; gap: 16px; }
      .header .logo { flex: 0 0 auto; display: flex; align-items: center; }
      .header .logo img { display: block; max-height: 90px; width: auto; }
      .header .logo.right img { max-height: 95px; }
      .fecha { text-align: right; margin: 0 0 24px; font-size: 13px; }
      .institucion-foot { display:none; }
      .titulo { text-align: center; font-weight: bold; font-size: 16px; text-decoration: underline; margin: 0 0 30px; letter-spacing: .5px; break-after: avoid-page; page-break-after: avoid; }

      /* ---------- Cuerpo del certificado ---------- */
      .body-text { text-align: justify; line-height: 1.85; margin-bottom: 18px; text-indent: 2em; orphans: 3; widows: 3; }
      .closing { text-align: justify; line-height: 1.8; margin-bottom: 60px; orphans: 3; widows: 3; }

      /* ---------- Firma (siempre junta) ---------- */
      .firma { text-align: center; margin-top: 90px; break-inside: avoid; page-break-inside: avoid; }
      .firma .ln { display: inline-block; border-top: 1px solid #000; min-width: 320px; padding-top: 6px; }
      .firma p { margin: 2px 0; font-weight: bold; font-size: 13px; }
      .firma p.sub { font-weight: normal; font-size: 12px; }

      /* ---------- Toolbar ---------- */
      .toolbar { position: fixed; top: 12px; right: 12px; background: #0f172a; color: white; padding: 8px 12px; border-radius: 8px; font-family: system-ui; font-size: 12px; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
      .toolbar button { font: 600 12px system-ui; padding: 4px 10px; margin-left: 6px; border-radius: 5px; border: 0; cursor: pointer; background: #0ea5a4; color: white; }
      .toolbar button.alt { background: #475569; }

      /* ---------- Headings y formularios COMPIN ---------- */
      h2 { font-size: 14px; margin: 16px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; break-after: avoid-page; page-break-after: avoid; }
      h3 { font-size: 12px; margin: 10px 0 4px; break-after: avoid-page; page-break-after: avoid; }
      table.form { width: 100%; border-collapse: collapse; margin-bottom: 6px; break-inside: avoid; page-break-inside: avoid; }
      table.form td, table.form th { border: 1px solid #888; padding: 4px 6px; font-size: 11px; font-weight: normal; vertical-align: top; }
      table.form th { background: #f1f5f9; font-weight: bold; text-align: left; }
      .nota { font-size: 10px; margin-top: 4px; color: #333; }

      /* ---------- Saltos de página explícitos ---------- */
      .page-break { break-before: page; page-break-before: always; }

      /* ---------- IMPRESIÓN ---------- */
      @media print {
        html, body { background: #fff !important; }
        .no-print { display: none !important; }
        .sheet {
          width: auto; min-height: 0; margin: 0; padding: 0;
          box-shadow: none; background: transparent;
        }
      }
    `;
  }
  function toolbar() {
    return `<div class="toolbar no-print">
      <span>Vista previa · Carta</span>
      <button onclick="window.print()">🖨 Imprimir</button>
      <button class="alt" onclick="window.close()">✕ Cerrar</button>
    </div>`;
  }
  function pageShell(title, inner) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${shellCss()}</style></head><body>${toolbar()}<div class="sheet">${inner}</div></body></html>`;
  }

  // ---------- Sex helpers ----------
  function art(s) { return s === "F" ? "la" : "el"; }
  function artMayus(s) { return s === "F" ? "La" : "El"; }
  function sustantivo(s) { return s === "F" ? "usuaria" : "usuario"; }
  function atendido(s) { return s === "F" ? "atendida" : "atendido"; }

  // ---------- Body text per type ----------
  function bodyText(type, d) {
    const sexo = d.sexo === "F" ? "F" : "M";
    const nombre = (d.nombre || "").trim();
    const rut = (d.rut || "").trim();
    const diag = (d.diagnostico || "").trim();
    const diagText = diag ? ` Diagnóstico: ${diag}.` : "";

    if (type === "atencion") {
      let t = `${artMayus(sexo)} médico que suscribe certifica que ${art(sexo)} ${sustantivo(sexo)} ${nombre} (RUT: ${rut}), fue ${atendido(sexo)} en este establecimiento.${diagText}`;
      if (d.detalle) t += ` ${d.detalle}`;
      return t;
    }
    if (type === "controles") {
      let t = `${artMayus(sexo)} médico que suscribe certifica que ${art(sexo)} ${sustantivo(sexo)} ${nombre} (RUT: ${rut}), se encuentra en control médico${d.tipoControl ? ` de tipo ${d.tipoControl}` : ""} en este establecimiento.${diagText}`;
      if (d.observaciones) t += ` ${d.observaciones}`;
      return t;
    }
    if (type === "salud") {
      let t = `${artMayus(sexo)} médico que suscribe certifica que ${art(sexo)} ${sustantivo(sexo)} ${nombre} (RUT: ${rut}), quien mantiene sus controles de salud en este centro.`;
      if (diag) t += `\n\nDiagnóstico:\n${diag}`;
      if (d.proposito) t += `\n\nEl presente certificado se emite para fines ${String(d.proposito).toLowerCase()}.`;
      if (d.observaciones) t += `\n\n${d.observaciones}`;
      return t;
    }
    if (type === "reposo") {
      let t = `${artMayus(sexo)} médico que suscribe certifica que ${art(sexo)} ${sustantivo(sexo)} ${nombre} (RUT: ${rut}), requiere reposo en domicilio`;
      if (d.diasReposo) {
        t += ` por ${d.diasReposo} días`;
        if (d.fechaInicioReposo) t += ` a partir del ${fechaCorta(d.fechaInicioReposo)}`;
      }
      t += `.${diagText}`;
      if (d.observaciones) t += ` ${d.observaciones}`;
      return t;
    }
    return "";
  }

  function buildCertificateHtml(type, data, medico) {
    medico = medico || getActiveMedico() || {};
    const inst = medico.institucion || "CESFAM";
    const today = fechaLarga(new Date());
    const sexo = data.sexo === "F" ? "F" : "M";
    const cierre = `Emito el presente documento a petición ${art(sexo) === "el" ? "del" : "de la"} ${sustantivo(sexo)} para ser usado en los trámites que estime conveniente.`;
    const TITULOS = {
      atencion: "CERTIFICADO DE ATENCIÓN",
      controles: "CERTIFICADO DE CONTROLES MÉDICOS",
      salud: "CERTIFICADO DE SALUD",
      reposo: "CERTIFICADO DE REPOSO MÉDICO",
    };

    // Genderizer global: red de seguridad para campos libres (detalle, observaciones).
    // bodyText() ya construye con género correcto, pero el usuario puede haber escrito
    // "el paciente" en observaciones cuando se trata de una mujer (o viceversa).
    const genderize = (window.__AR_PATIENT && window.__AR_PATIENT.genderize) || ((t) => t);
    const rawCuerpo = (data.cuerpoCustom && String(data.cuerpoCustom).trim()) ? data.cuerpoCustom : bodyText(type, data);
    const cuerpo = genderize(rawCuerpo, sexo);
    const cierreFinal = genderize(cierre, sexo);

    const logos = (window.__AR_LOGOS) || {};
    const inner = `
      <div class="header">
        <div class="logo left">${logos.pacMunicipalidad ? `<img src="${logos.pacMunicipalidad}" alt="Municipalidad Pedro Aguirre Cerda"/>` : ""}</div>
        <div class="logo right">${logos.cesfamPac ? `<img src="${logos.cesfamPac}" alt="CESFAM Dr. Amador Neghme R. — PAC"/>` : ""}</div>
      </div>
      <p class="fecha">${escapeHtml(today)}</p>
      <h1 class="titulo">${escapeHtml(TITULOS[type] || "CERTIFICADO MÉDICO")}</h1>
      <p class="body-text">${nl2br(cuerpo)}</p>
      <p class="closing">${escapeHtml(cierreFinal)}</p>
      <div class="firma">
        <div class="ln"></div>
        <p>${escapeHtml((medico.nombre || "").toUpperCase())}</p>
        <p class="sub">${escapeHtml((medico.titulo || "MÉDICO CIRUJANO").toUpperCase())}</p>
        <p class="sub">RUT: ${escapeHtml(medico.rut || "")}${medico.registro ? " · Reg. SIS: " + escapeHtml(medico.registro) : ""}</p>
        <p class="sub">${escapeHtml(inst)}</p>
      </div>`;
    return pageShell(TITULOS[type] || "Certificado Médico", inner);
  }

  // ---------- COMPIN — Informe Biomédico Funcional ----------
  function buildCompinHtml(d, medico) {
    medico = medico || getActiveMedico() || {};
    const today = new Date();
    const fechaInf = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
    const causas = d.causas || {};
    const ck = (v) => (v ? "●" : "○");
    const diagDisc = d.diagDiscapacidad || ["", "", "", ""];
    const otros = d.otrosDiag || ["", "", "", ""];
    const profs = (d.profesionales || []).slice(0, 3);
    while (profs.length < 3) profs.push({ nombre: "", profesion: "", rut: "", telefono: "" });

    const profRows = profs.map((p) =>
      `<tr><td>${escapeHtml(p.nombre || "&nbsp;")}</td><td>${escapeHtml(p.profesion || "&nbsp;")}</td><td>${escapeHtml(p.rut || "&nbsp;")}</td><td>${escapeHtml(p.telefono || "&nbsp;")}</td></tr>`
    ).join("");

    const inner = `
      <h1 class="titulo" style="text-decoration:none;font-size:15px;margin:0 0 4px">INFORME BIOMÉDICO FUNCIONAL</h1>
      <p style="text-align:center;font-style:italic;font-size:10px;margin:0 0 14px">*Documento elaborado para presentación ante COMPIN — Calificación de discapacidad*</p>

      <h3>I. Datos de identificación del usuario(a)</h3>
      <table class="form"><tr><th style="width:120px">Apellidos</th><td>${escapeHtml(d.apellidos || "")}</td></tr></table>
      <table class="form"><tr><th style="width:120px">Nombre</th><td>${escapeHtml(d.nombre || "")}</td></tr></table>
      <table class="form"><tr><th style="width:60px">RUT</th><td style="width:200px">${escapeHtml(d.rut || "")}</td><th style="width:90px">Fecha Nac.</th><td>${escapeHtml(d.fechaNac || "")}</td></tr></table>

      <h3>II. Antecedentes biomédicos y funcionales</h3>
      <table class="form">
        <tr>
          <th rowspan="2" style="width:140px">Causa Discapacidad</th>
          <td>${ck(causas.fisica)} Física</td>
          <td>${ck(causas.visual)} Sensorial Visual</td>
          <td>${ck(causas.auditiva)} Sensorial Auditiva</td>
        </tr>
        <tr>
          <td>${ck(causas.psiquica)} Mental / psíquica</td>
          <td colspan="2">${ck(causas.intelectual)} Mental / Intelectual</td>
        </tr>
      </table>
      <p class="nota">(Puede marcar una o más causas)</p>

      <table class="form">
        <tr><th colspan="2">Diagnósticos asociados a la causa de discapacidad</th></tr>
        <tr><td><ul>${diagDisc.slice(0, 2).map((x) => `<li>${escapeHtml(x || "………………………………………")}</li>`).join("")}</ul></td>
            <td><ul>${diagDisc.slice(2, 4).map((x) => `<li>${escapeHtml(x || "………………………………………")}</li>`).join("")}</ul></td></tr>
        <tr><th colspan="2">Otros diagnósticos</th></tr>
        <tr><td><ul>${otros.slice(0, 2).map((x) => `<li>${escapeHtml(x || "………………………………………")}</li>`).join("")}</ul></td>
            <td><ul>${otros.slice(2, 4).map((x) => `<li>${escapeHtml(x || "………………………………………")}</li>`).join("")}</ul></td></tr>
      </table>

      <table class="form">
        <tr><th>Breve historia de la condición de salud (data, evolución, tratamiento, rehabilitación)</th></tr>
        <tr><td style="min-height:60px;white-space:pre-wrap">${nl2br(d.breveHistoria || "\n\n\n")}</td></tr>
      </table>
      <table class="form">
        <tr><th>Medicamentos indicados al usuario(a)</th></tr>
        <tr><td style="min-height:40px;white-space:pre-wrap">${nl2br(d.medicamentos || "\n\n")}</td></tr>
      </table>
      <table class="form">
        <tr><th>Descripción del estado funcional del usuario(a)</th></tr>
        <tr><td style="min-height:40px;white-space:pre-wrap">${nl2br(d.estadoFuncional || "\n\n")}</td></tr>
      </table>

      <div class="page-break"></div>

      <table class="form">
        <tr><th>Atenciones o intervenciones recibidas en el sistema de salud y/o educativo</th></tr>
        <tr><td style="min-height:40px;white-space:pre-wrap">${nl2br(d.atenciones || "\n\n")}</td></tr>
      </table>

      <table class="form">
        <tr><th>Usuario(a) requiere ayuda técnica</th>
            <td style="width:100px">${d.requiereAyuda === "si" ? "●" : "○"} Sí</td>
            <td style="width:100px">${d.requiereAyuda === "no" ? "●" : "○"} No</td></tr>
        <tr><td colspan="3">Cuál o cuáles: ${escapeHtml(d.requiereAyudaCuales || "………………………………………………………")}</td></tr>
      </table>

      <table class="form">
        <tr><th>Usuario(a) usa ayuda técnica</th>
            <td style="width:100px">${d.usaAyuda === "si" ? "●" : "○"} Sí</td>
            <td style="width:100px">${d.usaAyuda === "no" ? "●" : "○"} No</td></tr>
        <tr><td colspan="3">Cuál o cuáles: ${escapeHtml(d.usaAyudaCuales || "………………………………………………………")}</td></tr>
      </table>

      <h3>III. Contacto profesionales tratantes en la red de salud</h3>
      <table class="form">
        <tr><th>Nombre y apellido</th><th>Profesión</th><th>RUT</th><th>Teléfono</th></tr>
        ${profRows}
      </table>

      <h3>IV. Datos de identificación del profesional informante</h3>
      <table class="form"><tr><th style="width:130px">Nombre completo</th><td>${escapeHtml(medico.nombre || "")}</td></tr></table>
      <table class="form"><tr><th style="width:80px">Profesión</th><td style="width:200px">${escapeHtml(medico.titulo || "MÉDICO CIRUJANO")}</td><th style="width:50px">RUT</th><td>${escapeHtml(medico.rut || "")}</td></tr></table>
      <table class="form"><tr><th style="width:130px">Institución</th><td>${escapeHtml(medico.institucion || "CESFAM")}</td></tr></table>
      <table class="form"><tr><th style="width:130px">Correo electrónico</th><td>${escapeHtml(medico.email || d.correoProf || "")}</td></tr></table>
      <table class="form"><tr><th style="width:80px">Teléfono</th><td style="width:200px">${escapeHtml(medico.telefono || d.telefonoProf || "")}</td><th style="width:100px">Fecha informe</th><td>${escapeHtml(fechaInf)}</td></tr></table>

      <div class="firma">
        <div class="ln"></div>
        <p>FIRMA Y TIMBRE</p>
        <p class="sub">${escapeHtml((medico.nombre || "").toUpperCase())}</p>
        <p class="sub">${escapeHtml((medico.titulo || "MÉDICO CIRUJANO").toUpperCase())}</p>
      </div>

      <p class="nota" style="border-top:1px solid #000;padding-top:6px;margin-top:20px;width:60%">
        Ayuda técnica: cualquier producto externo (dispositivo, equipo, instrumento o software) cuya principal finalidad es mantener o mejorar la independencia y el funcionamiento de las personas y, por tanto, promover su bienestar.
      </p>`;
    return pageShell("Informe Biomédico Funcional", inner);
  }

  function print(html, meta) {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      window.__AR_HOST?.toast?.("⚠ Permite ventanas emergentes para imprimir");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();

    // Registro en historial (best-effort)
    if (meta) {
      try {
        const med = getActiveMedico() || {};
        window.__AR_HIST?.add({
          kind: meta.kind || "cert",
          subtype: meta.subtype || "",
          label: meta.label || "Certificado",
          paciente: meta.paciente || "",
          rut: meta.rut || "",
          medico: med.nombre || "",
          html,
        });
      } catch (e) { /* historial es best-effort */ }
    }
  }

  loadFromStorage().then(() => { log.info(`${STATE.medicos.length} médicos cargados`); resolveReady(); });

  window.__AR_CERTS = {
    ready,
    getMedicos,
    addMedico,
    updateMedico,
    removeMedico,
    setActiveMedico,
    getActiveMedico,
    buildCertificateHtml,
    buildBodyText: bodyText,
    buildCompinHtml,
    print,
  };
})();
