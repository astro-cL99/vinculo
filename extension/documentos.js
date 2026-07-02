/* Vínculo — Generador de documentos clínicos imprimibles.
 * Carga catálogo desde data/documentos.json y construye HTML imprimible
 * para cada plantilla (perfiles, Conners, espirometría, informativos).
 *
 * API: window.__AR_DOCS = {
 *   ready: Promise,
 *   list(): Documento[],
 *   get(id): Documento | null,
 *   render(id, values): string  // HTML completo
 *   print(id, values): void     // abre ventana e imprime
 * }
 */
(function () {
  if (window.__AR_DOCS) return;

  const log = (window.__AR_LOG && window.__AR_LOG("docs")) || { info: () => {}, warn: () => {} };

  const STATE = { docs: [], byId: new Map() };
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function nl2br(s) { return escapeHtml(s).replace(/\n/g, "<br/>"); }

  async function loadCatalog() {
    try {
      const url = chrome.runtime.getURL("data/documentos.json");
      const res = await fetch(url);
      const data = await res.json();
      STATE.docs = data.documentos || [];
      STATE.byId = new Map(STATE.docs.map((d) => [d.id, d]));
      log.info(`${STATE.docs.length} plantillas cargadas`);
    } catch (e) {
      log.warn("Error cargando documentos.json", e);
    }
    resolveReady();
  }

  function list() { return STATE.docs.slice(); }
  function get(id) { return STATE.byId.get(id) || null; }

  // ---------- HTML helpers ----------
  // Tamaño carta US: 8.5in x 11in (215.9mm x 279.4mm). Margen 1.8cm × 2cm.
  // Área útil ≈ 17.59cm × 24.34cm.
  function shellCss() {
    return `
      /* ---------- Page setup (impresión) ---------- */
      @page { size: letter portrait; margin: 1.8cm 2cm; }

      /* ---------- Reset ---------- */
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }

      /* ---------- Vista previa: simular hoja carta ---------- */
      html { background: #e2e8f0; }
      body {
        font-family: "Helvetica Neue", Arial, Helvetica, sans-serif;
        font-size: 12px; color: #111; line-height: 1.45;
        -webkit-font-smoothing: antialiased;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        width: 17.59cm;            /* 21.59cm carta - 2*2cm margen */
        min-height: 24.34cm;       /* 27.94cm carta - 2*1.8cm margen */
        padding: 0;                /* el margen lo aporta @page al imprimir */
        margin: 28px auto;
        background: #fff;
        box-shadow: 0 6px 24px rgba(15,23,42,.18);
        padding: 1.8cm 2cm;        /* simula márgenes en pantalla */
      }

      /* ---------- Tipografía base ---------- */
      h1 { font-size: 17px; text-align: center; margin: 0 0 4px; font-weight: 700; letter-spacing: .2px; }
      h2 { font-size: 13px; margin: 14px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; font-weight: 700; }
      h3 { font-size: 12px; margin: 10px 0 4px; font-weight: 700; }
      h1, h2, h3 { break-after: avoid-page; page-break-after: avoid; }
      p { margin: 6px 0; orphans: 3; widows: 3; }

      /* ---------- Componentes ---------- */
      .sub { text-align: center; color: #555; font-size: 11px; margin-bottom: 14px; }
      .meta { width: 100%; border-collapse: collapse; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
      .meta td { padding: 4px 6px; border: 1px solid #aaa; font-size: 11px; }
      .meta .lbl { background: #f1f5f9; font-weight: bold; width: 130px; }

      table.grid { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      table.grid th, table.grid td { border: 1px solid #888; padding: 5px 6px; font-size: 11px; text-align: center; }
      table.grid th { background: #e2e8f0; }
      table.grid thead { display: table-header-group; }   /* repite header en cada página */
      table.grid tr { break-inside: avoid; page-break-inside: avoid; }

      .note { font-size: 10px; color: #444; margin-top: 6px; }
      .firma { margin-top: 60px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
      .firma .ln { display: inline-block; border-top: 1px solid #000; min-width: 280px; padding-top: 4px; }
      .checklist { padding-left: 18px; }
      .checklist li { margin: 3px 0; break-inside: avoid; page-break-inside: avoid; }
      ul, ol { break-inside: avoid; page-break-inside: avoid; }

      /* ---------- Toolbar (sólo pantalla) ---------- */
      .toolbar { position: fixed; top: 12px; right: 12px; background: #0f172a; color: white; padding: 8px 12px; border-radius: 8px; font-family: system-ui; font-size: 12px; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
      .toolbar button { font: 600 12px system-ui; padding: 4px 10px; margin-left: 6px; border-radius: 5px; border: 0; cursor: pointer; background: #0ea5a4; color: white; }
      .toolbar button.alt { background: #475569; }

      /* ---------- IMPRESIÓN ---------- */
      @media print {
        html, body { background: #fff !important; }
        .no-print { display: none !important; }
        .sheet {
          width: auto; min-height: 0; margin: 0; padding: 0;
          box-shadow: none; background: transparent;
        }
        /* En pantalla mantenemos misma escala que en impresión: 12px base */
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
  function patientMeta(v, extra = []) {
    const rows = [
      ["Paciente", v.nombre || ""],
      ["RUT", v.rut || ""],
      ["Edad", v.edad || ""],
      ...extra,
      ["Fecha emisión", new Date().toLocaleDateString("es-CL")],
    ];
    return `<table class="meta"><tbody>${rows.map(([l, v]) => `<tr><td class="lbl">${escapeHtml(l)}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</tbody></table>`;
  }

  // ---------- Templates ----------
  const TEMPLATES = {
    "perfil-pa": (v) => {
      const filas = Array.from({ length: 5 }).map(
        () => `<tr><td style="height:34px"></td><td></td><td></td></tr>`
      ).join("");
      return pageShell("Perfil de presión arterial", `
        <h1>PERFIL DE PRESIÓN ARTERIAL POR 5 DÍAS</h1>
        <table class="meta" style="margin-top:10px"><tbody>
          <tr>
            <td class="lbl">Nombre</td><td>${escapeHtml(v.nombre || "")}</td>
            <td class="lbl" style="width:70px">RUT</td><td>${escapeHtml(v.rut || "")}</td>
          </tr>
        </tbody></table>

        <h2>Toma adecuada de presión arterial</h2>
        <div style="display:flex;gap:14px;align-items:flex-start">
          <ol style="margin:6px 0 6px 18px;padding:0;flex:1">
          <li>5 a 10 minutos de reposo.</li>
          <li>Sentado con espalda recta y descansando en respaldo de silla.</li>
          <li>Sin cruzar las piernas.</li>
          <li>Brazo izquierdo apoyado en superficie plana a la altura del corazón.</li>
          <li>Colocar manguito 2 dedos sobre el pliegue del codo.</li>
          <li>No hablar durante la toma.</li>
          <li>Reposo de 30 minutos antes de la toma en caso de haber realizado ejercicio, fumado, tomado café o alcohol.</li>
          </ol>
          <figure style="margin:0;flex:0 0 130px;text-align:center">
            <img src="data:image/jpeg;base64,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" alt="Tensiómetro digital" style="width:130px;height:auto;border:1px solid #ddd;border-radius:6px;padding:4px;background:#fff"/>
            <figcaption style="font-size:9.5px;color:#555;margin-top:3px">Ejemplo de tensiómetro digital de muñeca/brazo. Lectura: SYS / DIA – PULSO.</figcaption>
          </figure>
        </div>
        <p class="note"><i>Toma de presión arterial mínimo 1 hora después de tomar medicamentos.</i><br/>
        <i>Descartar la primera toma de presión. Anotar la segunda toma.</i></p>

        <table class="grid" style="margin-top:10px">
          <thead>
            <tr><th style="width:30%">FECHA</th><th>MAÑANA</th><th>TARDE</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style="color:#666">Ejemplo: 05/07/2025</td>
              <td style="color:#666">118 / 78 - 70</td>
              <td></td>
            </tr>
            ${filas}
          </tbody>
        </table>

        <h3 style="margin-top:14px">Tratamiento actual</h3>
        <div style="border:1px solid #888;min-height:70px;padding:6px 8px;white-space:pre-wrap">${escapeHtml(v.tratamiento || "")}</div>

        ${v.indicaciones ? `<h3>Indicaciones adicionales</h3><p>${nl2br(v.indicaciones)}</p>` : ""}

        <div class="firma"><div class="ln">Firma y timbre profesional</div></div>
      `);
    },

    "perfil-glicemia": (v) => {
      const dias = ["Día 1", "Día 2", "Día 3", "Día 4", "Día 5", "Día 6", "Día 7"];
      const horarios = [
        "Ayuno",
        "2h post-desayuno",
        "Pre-almuerzo",
        "2h post-almuerzo",
        "Pre-cena",
        "2h post-cena",
        "Nocturno (03:00 h, opcional)",
      ];
      const cells = () => Array.from({ length: 7 }).map(() => `<td style="height:24px"></td>`).join("");
      const rows = horarios.map((h) => `<tr><td style="text-align:left;font-weight:bold">${escapeHtml(h)}</td>${cells()}</tr>`).join("");
      return pageShell("Perfil glicemia capilar", `
        <h1>Perfil de Glicemia Capilar — 7 días</h1>
        <p class="sub">Automonitoreo glicémico domiciliario (mg/dL)</p>
        ${patientMeta(v, [["Tratamiento actual", v.tratamiento || ""], ["Metas", v.metas || ""]])}
        <h2>Tabla de registro</h2>
        <table class="grid">
          <thead><tr><th style="width:200px">Horario</th>${dias.map((d) => `<th>${escapeHtml(d)}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <h3>Importante</h3>
        <ul>
          <li>Lave las manos con agua tibia y seque antes de la punción.</li>
          <li>Use una gota completa de sangre. Anote el valor inmediatamente.</li>
          <li>Marque con (*) si presentó síntomas: <i>sudoración, temblor, mareo, hambre súbita</i>.</li>
          <li>Si glicemia &lt;70 mg/dL: regla del 15 (15 g de hidratos rápidos, esperar 15 min y revisar).</li>
        </ul>
        <div class="firma"><div class="ln">Firma y timbre profesional</div></div>
      `);
    },

    "conners-padres": (v) => connersTemplate(v, "padres"),
    "conners-profesor": (v) => connersTemplate(v, "profesor"),

    "solicitud-espirometria": (v) => pageShell("Solicitud de espirometría", `
      <h1>Solicitud de Espirometría</h1>
      <p class="sub">Estudio funcional respiratorio</p>
      ${patientMeta(v, [["Peso (kg)", v.peso || ""], ["Talla (cm)", v.talla || ""]])}
      <h2>Diagnóstico / motivo clínico</h2>
      <p>${nl2br(v.diagnostico || "")}</p>
      <h2>Tratamiento broncodilatador actual</h2>
      <p>${nl2br(v.tratamiento || "—")}</p>
      <h2>Tipo de estudio solicitado</h2>
      <p><b>${escapeHtml(v.tipo || "Basal + post-broncodilatador")}</b></p>
      <h3>Indicaciones al paciente</h3>
      <ul>
        <li>No fumar 1 hora antes.</li>
        <li>Suspender broncodilatador de acción corta (salbutamol) 6 h antes; LABA 12 h antes; LAMA 24 h antes.</li>
        <li>Evitar comidas copiosas 2 h antes.</li>
        <li>Concurrir con ropa cómoda, sin prendas ajustadas.</li>
      </ul>
      <div class="firma"><div class="ln">Firma y timbre del médico solicitante</div></div>
    `),

    "info-hta": (v) => infoSheet({
      title: "Hipertensión Arterial — recomendaciones",
      color: "#1d4ed8",
      paciente: v.nombre,
      bullets: [
        "Reduzca la sal: máximo 5 g al día (≈ 1 cucharadita). Evite embutidos, sopas en sobre, snacks.",
        "Camine 30 minutos al día, al menos 5 veces por semana.",
        "Evite el alcohol y el cigarro.",
        "Tome los medicamentos a la misma hora todos los días, aunque se sienta bien.",
        "Mídase la presión 1-2 veces por semana en su casa y anote los valores.",
        "Acuda a sus controles en el CESFAM cada 3 meses (o lo indicado por su equipo).",
      ],
      alerta: [
        "Presión &gt; 180/110 mmHg.",
        "Dolor de cabeza intenso, visión borrosa o vómitos.",
        "Dolor en el pecho, falta de aire o dificultad para hablar.",
        "Pérdida de fuerza o sensibilidad en un lado del cuerpo.",
      ],
    }),

    "info-dm2": (v) => infoSheet({
      title: "Diabetes Mellitus tipo 2 — autocuidado",
      color: "#15803d",
      paciente: v.nombre,
      bullets: [
        "Realice 5 comidas al día en horarios regulares; evite ayunos prolongados.",
        "Prefiera verduras, legumbres, granos integrales y proteínas magras.",
        "Evite bebidas azucaradas, jugos y postres con azúcar.",
        "Camine al menos 30 min/día, 5 días a la semana.",
        "Revise sus pies todos los días: heridas, ampollas, callos. Use calzado cómodo y cerrado.",
        "Tome los medicamentos a la misma hora. No los suspenda sin indicación médica.",
        "Asista a controles cada 3 meses con HbA1c y a sus controles oftalmológicos anuales.",
      ],
      alerta: [
        "Sudoración, temblor, mareo o hambre súbita (posible hipoglicemia → coma 15 g de azúcar).",
        "Glicemias &gt; 300 mg/dL repetidas, mucha sed y orina excesiva.",
        "Heridas en pies que no cierran o cambios de color/temperatura.",
        "Náuseas, vómitos o dolor abdominal intenso (acudir a urgencia).",
      ],
    }),

    "info-sickday": (v) => infoSheet({
      title: "Días de enfermedad — qué hacer con sus medicamentos",
      color: "#b91c1c",
      paciente: v.nombre,
      bullets: [
        "Si tiene <b>fiebre, vómitos, diarrea</b> o no puede tomar líquidos durante &gt;24 h: <b>SUSPENDA</b> temporalmente los siguientes medicamentos hasta recuperarse y reciba indicación médica.",
        "<b>Suspender:</b> Metformina · Empagliflozina/Dapagliflozina (iSGLT2) · IECA (enalapril) · ARA II (losartán) · Espironolactona · Diuréticos (furosemida, hidroclorotiazida) · AINEs (ibuprofeno, diclofenaco, naproxeno).",
        "<b>NO suspender:</b> Insulina (puede requerir ajuste, no eliminar) · Levotiroxina · Antiagregantes (aspirina/clopidogrel) salvo indicación expresa.",
        "Mantenga buena hidratación con agua y suero oral.",
        "Reanude sus medicamentos 24-48 h después de recuperarse y de tolerar la vía oral.",
      ],
      alerta: [
        "No puede retener líquidos por &gt;24 h.",
        "Diuresis muy disminuida o ausente.",
        "Confusión, somnolencia o desorientación.",
        "Glicemias &gt; 300 mg/dL persistentes.",
        "Dolor abdominal intenso o respiración profunda y rápida (posible cetoacidosis).",
      ],
    }),

    "interconsulta-libre": (v) => pageShell("Interconsulta", `
      <h1>Solicitud de Interconsulta</h1>
      <p class="sub">Atención primaria → Especialidad</p>
      ${patientMeta(v, [["Especialidad solicitada", v.especialidad || ""]])}
      <h2>Diagnóstico</h2>
      <p>${nl2br(v.diagnostico || "")}</p>
      <h2>Antecedentes mórbidos relevantes</h2>
      <p>${nl2br(v.antecedentes || "—")}</p>
      <h2>Exámenes / estudios realizados</h2>
      <p>${nl2br(v.examenes || "—")}</p>
      <h2>Motivo de derivación</h2>
      <p>${nl2br(v.motivo || "")}</p>
      <div class="firma"><div class="ln">Firma y timbre del médico solicitante</div></div>
    `),

    "cuadro-medicamentos": (v) => {
      const diagnosticos = String(v.diagnosticos || "")
        .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const lineas = String(v.medicamentos || "")
        .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      // Heurística: distinguir formato nuevo (8: Nombre|Dosis|Cantidad|Frecuencia|M|T|N|SOS)
      // del antiguo (7: Nombre|Dosis|Frecuencia|M|T|N|SOS). El nuevo tiene "Cantidad" en
      // posición 2 (típicamente "1", "1/2", "2", número o fracción).
      const looksLikeCantidad = (s) => /^(\d+(?:[.,]\d+)?|\d+\/\d+)$/.test(String(s || "").trim());
      const meds = lineas.map(l => {
        const parts = l.split("|").map(p => p.trim());
        // Formato nuevo (≥8 campos)
        if (parts.length >= 8) {
          return { nombre: parts[0], dosis: parts[1], cantidad: parts[2], frecuencia: parts[3], manana: parts[4], tarde: parts[5], noche: parts[6], sos: parts[7] };
        }
        // Formato 7: si parts[2] parece cantidad ("1", "1/2"...) → es nuevo sin SOS;
        // si no, es legacy con frecuencia en pos 2.
        if (parts.length >= 7) {
          if (looksLikeCantidad(parts[2])) {
            return { nombre: parts[0], dosis: parts[1], cantidad: parts[2], frecuencia: parts[3], manana: parts[4], tarde: parts[5], noche: parts[6], sos: "" };
          }
          return { nombre: parts[0], dosis: parts[1], cantidad: "1", frecuencia: parts[2], manana: parts[3], tarde: parts[4], noche: parts[5], sos: parts[6] };
        }
        if (parts.length >= 6) {
          return { nombre: parts[0], dosis: parts[1], cantidad: "1", frecuencia: parts[2], manana: parts[3], tarde: parts[4], noche: parts[5], sos: "" };
        }
        return { nombre: parts[0] || "", dosis: parts[1] || "", cantidad: "1", frecuencia: "", manana: parts[2] || "", tarde: parts[3] || "", noche: parts[4] || "", sos: "" };
      })
      // Filtrar filas completamente vacías (sin nombre ni dosis): así no se muestran
      // checkmarks de "noche/sos" en filas fantasma cuando el usuario marcó una casilla
      // antes de escribir el medicamento.
      .filter(m => String(m.nombre || "").trim() || String(m.dosis || "").trim());

      const extras = Math.max(0, 8 - meds.length);
      for (let i = 0; i < extras; i++) meds.push({ nombre:"", dosis:"", cantidad:"", frecuencia:"", manana:"", tarde:"", noche:"", sos:"" });

      const cellMark = (val, color) => {
        const s = String(val || "").trim();
        if (!s || s === "0") return "";
        if (s === "1" || /^x$/i.test(s) || s === "✓") {
          return `<div style="font-size:18px;font-weight:700;color:${color || "#0f172a"};line-height:1">✓</div>`;
        }
        return `<div style="font-size:13px;font-weight:700;color:${color || "#0f172a"}">${escapeHtml(s)}</div>`;
      };

      const showSos = meds.some((m) => {
        const s = String(m.sos || "").trim();
        return s && s !== "0";
      });

      const filas = meds.map((m) => `
        <tr>
          <td style="text-align:left;font-weight:600">${escapeHtml(m.nombre) || "&nbsp;"}</td>
          <td style="text-align:left">${escapeHtml(m.dosis)}</td>
          <td style="text-align:center;font-weight:600">${escapeHtml(m.cantidad)}</td>
          <td style="text-align:left;font-size:10px">${escapeHtml(m.frecuencia)}</td>
          <td style="background:#fef9c3">${cellMark(m.manana)}</td>
          <td style="background:#fed7aa">${cellMark(m.tarde)}</td>
          <td style="background:#dbeafe">${cellMark(m.noche)}</td>
          ${showSos ? `<td style="background:#fecaca">${cellMark(m.sos, "#b91c1c")}</td>` : ""}
        </tr>
      `).join("");

      const dxList = diagnosticos.length
        ? `<ul class="checklist" style="margin:4px 0 0 18px">${diagnosticos.map(d => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
        : `<p class="note">—</p>`;

      return pageShell("Cuadro de medicamentos", `
        <h1>CUADRO DE MEDICAMENTOS</h1>
        <p class="sub">Apoyo educativo para el paciente y su familia</p>
        ${patientMeta(v)}

        <h2>Diagnósticos médicos</h2>
        ${dxList}

        <h2>Horario de medicamentos</h2>
        <table class="grid">
          <thead>
            <tr>
              <th rowspan="2" style="text-align:left;width:22%">Medicamento</th>
              <th rowspan="2" style="text-align:left;width:11%">Dosis</th>
              <th rowspan="2" style="text-align:center;width:8%" title="Cantidad por toma">Cantidad</th>
              <th rowspan="2" style="text-align:left;width:15%">Frecuencia</th>
              <th style="background:#fde68a">Mañana</th>
              <th style="background:#fdba74">Tarde</th>
              <th style="background:#bfdbfe">Noche</th>
              ${showSos ? `<th style="background:#fca5a5;color:#7f1d1d">SOS</th>` : ""}
            </tr>
            <tr>
              <th style="background:#fef3c7;font-size:18px">☀️</th>
              <th style="background:#ffedd5;font-size:18px">🌤️</th>
              <th style="background:#dbeafe;font-size:18px">🌙</th>
              ${showSos ? `<th style="background:#fee2e2;font-size:16px;color:#b91c1c">🆘</th>` : ""}
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>

        ${showSos ? `<p class="note"><b>Cómo leer este cuadro:</b> un <b>✓</b> indica que ese medicamento se toma en esa jornada. La columna <b style="color:#b91c1c">SOS</b> marca medicamentos de uso <b>solo si lo necesita</b> (dolor, fiebre u otro síntoma indicado por su médico).</p>` : `<p class="note"><b>Cómo leer este cuadro:</b> un <b>✓</b> indica que ese medicamento se toma en esa jornada.</p>`}

        <h2>Indicaciones adicionales</h2>
        <p><b>Todos los medicamentos deben ser administrados posterior a la ingesta de alimentos</b>, a menos que su médico tratante le indique lo contrario (como ocurre en el caso particular del <b>Omeprazol</b> y <b>Levotiroxina</b>).</p>
        ${v.indicaciones ? `<p>${nl2br(v.indicaciones)}</p>` : ""}

        <h2>Recordatorios importantes</h2>
        <ul class="checklist">
          <li>No suspenda ni cambie las dosis sin indicación médica.</li>
          <li>Lleve este cuadro a todos sus controles y a la farmacia.</li>
          <li>Si presenta vómitos, diarrea o fiebre alta por más de 24 h, consulte antes de seguir tomando los medicamentos (regla del día de enfermedad).</li>
          <li>Mantenga los medicamentos fuera del alcance de niños y en lugar fresco y seco.</li>
        </ul>

        <div class="firma"><div class="ln">Profesional que entrega · Fecha</div></div>
      `);
    },

    "calendario-cefalea": (v) => {
      // 31 días en grilla
      const dias = Array.from({ length: 31 }, (_, i) => i + 1);
      const filas = dias.map((d) => `
        <tr style="height:22px">
          <td style="font-weight:700;background:#f1f5f9">${d}</td>
          <td></td>
          <td style="color:#cbd5e1;font-size:10px">__ /10</td>
          <td></td>
          <td></td>
          <td style="font-size:13px;color:#cbd5e1">☐</td>
          <td style="font-size:13px;color:#cbd5e1">☐</td>
          <td style="font-size:13px;color:#cbd5e1">☐</td>
          <td></td>
        </tr>
      `).join("");

      return pageShell("Calendario de cefalea", `
        <h1>CALENDARIO DE CEFALEA</h1>
        <p class="sub">Registro mensual — ${escapeHtml(v.mes || "")}</p>
        ${patientMeta(v, [
          ["Mes / Año", v.mes || ""],
          ["Tratamiento preventivo", v.tratamiento || "—"],
          ["Medicamento SOS", v.sos || "—"],
        ])}

        <h2 style="margin:8px 0 4px">Cómo completar</h2>
        <p style="font-size:10px;margin:2px 0 6px;line-height:1.35">
          <b>Día sin cefalea:</b> dejar en blanco · <b>Hora inicio:</b> hora aproximada del dolor ·
          <b>Intensidad:</b> escriba un número del 0 al 10 · <b>Duración:</b> en horas ·
          <b>SOS:</b> medicamento y nº de comprimidos · <b>N/V</b> náuseas/vómitos, <b>Foto</b> luz, <b>Sono</b> ruido (marque ✓) ·
          <b>Gatillante:</b> ayuno, menstruación, estrés, alcohol, mal dormir, etc.
        </p>

        <table class="grid" style="font-size:10px;table-layout:fixed;width:100%">
          <colgroup>
            <col style="width:5%">
            <col style="width:8%">
            <col style="width:9%">
            <col style="width:9%">
            <col style="width:24%">
            <col style="width:6%">
            <col style="width:6%">
            <col style="width:6%">
            <col style="width:27%">
          </colgroup>
          <thead>
            <tr style="background:#ede9fe">
              <th rowspan="2">Día</th>
              <th rowspan="2">Hora<br/>inicio</th>
              <th rowspan="2">Intensidad<br/>(0-10)</th>
              <th rowspan="2">Duración<br/>(horas)</th>
              <th rowspan="2">Medicamento SOS<br/>(nombre y dosis)</th>
              <th colspan="3" style="background:#ddd6fe">Síntomas (✓)</th>
              <th rowspan="2">Posible gatillante</th>
            </tr>
            <tr style="background:#ddd6fe">
              <th>N/V</th>
              <th>Foto</th>
              <th>Sono</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>

        <div style="break-inside:avoid;page-break-inside:avoid">
          <h2>Resumen del mes (lo completa el equipo de salud)</h2>
          <table class="meta" style="margin-top:6px">
            <tbody>
              <tr><td class="lbl">Días con cefalea</td><td></td><td class="lbl">Días con SOS</td><td></td></tr>
              <tr><td class="lbl">Intensidad promedio</td><td></td><td class="lbl">¿Cefalea crónica? (≥15 días/mes)</td><td>SÍ ☐ &nbsp;&nbsp; NO ☐</td></tr>
            </tbody>
          </table>

          <p class="note"><b>Consulte si:</b> cefalea brusca de máxima intensidad ("la peor de su vida"), fiebre + rigidez de cuello, déficit neurológico (debilidad, alteración del habla o visión), cefalea que despierta de noche o empeora con esfuerzo / tos.</p>

          <div class="firma"><div class="ln">Profesional tratante · Fecha de control</div></div>
        </div>
      `);
    },
  };

  function infoSheet({ title, color, paciente, bullets, alerta }) {
    return pageShell(title, `
      <h1 style="color:${color}">${escapeHtml(title)}</h1>
      <p class="sub">Hoja informativa para el paciente${paciente ? ` — entregada a ${escapeHtml(paciente)}` : ""}</p>
      <h2>Recomendaciones</h2>
      <ul class="checklist">${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
      <h2 style="color:#b91c1c">⚠ Acuda a urgencia si presenta</h2>
      <ul class="checklist">${alerta.map((b) => `<li>${b}</li>`).join("")}</ul>
      <div class="firma" style="margin-top:80px"><div class="ln">Profesional que entrega · Fecha</div></div>
    `);
  }

  function connersTemplate(v, modo) {
    const itemsPadres = [
      "Es impulsivo, irritable.",
      "Es llorón/a.",
      "Es más movido/a de lo normal.",
      "No puede estarse quieto/a.",
      "Es destructor/a (ropa, juguetes, otros objetos).",
      "No termina las cosas que empieza.",
      "Se distrae fácilmente, tiene escasa atención.",
      "Cambia bruscamente sus estados de ánimo.",
      "Sus esfuerzos se frustran fácilmente.",
      "Suele molestar frecuentemente a otros niños.",
    ];
    const itemsProfesor = [
      "Tiene excesiva inquietud motora.",
      "Tiene explosiones impredecibles de mal genio.",
      "Se distrae fácilmente, escasa atención.",
      "Molesta frecuentemente a otros niños.",
      "Tiene aire ausente, ensimismado/a.",
      "Las exigencias deben ser satisfechas inmediatamente, se frustra fácilmente.",
      "Llora a menudo y fácilmente.",
      "Su estado de ánimo cambia bruscamente.",
      "Accesos de cólera, conducta explosiva e impredecible.",
      "Niega los hechos verdaderos.",
    ];
    const items = modo === "profesor" ? itemsProfesor : itemsPadres;
    const titulo = modo === "profesor"
      ? "Test de Conners abreviado — Profesor/a"
      : "Test de Conners abreviado — Padres / Madres";
    const meta = modo === "profesor"
      ? [["Curso", v.curso || ""], ["Establecimiento", v.establecimiento || ""], ["Profesor/a", v.informante || ""], ["Fecha", v.fecha || ""]]
      : [["Informante", v.informante || ""], ["Fecha", v.fecha || ""]];
    return pageShell(titulo, `
      <h1>${escapeHtml(titulo)}</h1>
      <p class="sub">Tamizaje TDAH (4-12 años) — 10 ítems</p>
      ${patientMeta(v, meta)}
      <h2>Instrucciones</h2>
      <p>Marque con una <b>X</b> en la columna que mejor describa la conducta del niño/a en las últimas semanas.</p>
      <table class="grid">
        <thead><tr><th style="width:50%;text-align:left">Ítem</th><th>Nada<br/>(0)</th><th>Poco<br/>(1)</th><th>Bastante<br/>(2)</th><th>Mucho<br/>(3)</th></tr></thead>
        <tbody>
          ${items.map((it, i) => `<tr><td style="text-align:left">${i + 1}. ${escapeHtml(it)}</td><td></td><td></td><td></td><td></td></tr>`).join("")}
          <tr><th style="text-align:right">TOTAL</th><th colspan="4"></th></tr>
        </tbody>
      </table>
      <h3>Interpretación</h3>
      <p><b>Punto de corte:</b> ${modo === "profesor" ? "≥17 puntos" : "≥18 puntos"} sugiere riesgo de TDAH y amerita evaluación clínica complementaria.</p>
      <p class="note">Conners CTRS-R (versión abreviada). Combinar con observación clínica y entrevista familiar/escolar antes de concluir diagnóstico.</p>
      <div class="firma"><div class="ln">Firma del informante</div></div>
    `);
  }

  // MMSE y MoCA: ahora se muestran como visor PDF (ver clinical-ui.js, kind:"pdf").


  function render(id, values) {
    const tpl = TEMPLATES[id];
    if (!tpl) return `<p>Plantilla "${escapeHtml(id)}" no encontrada.</p>`;
    return tpl(values || {});
  }

  // ---------- Historial por documento (por médico activo, hasta 200) ----------
  const DOC_HIST_KEY = "ar_doc_hist_v1";
  const DOC_HIST_MAX = 200;
  const activeMedicoId = () => window.__AR_CERTS?.getActiveMedico?.()?.id || "_default";
  const activeMedicoNombre = () => window.__AR_CERTS?.getActiveMedico?.()?.nombre || "";

  function _docHistLoadAll() {
    return new Promise((res) => {
      try { chrome.storage.local.get({ [DOC_HIST_KEY]: [] }, (r) => res(r[DOC_HIST_KEY] || [])); }
      catch { res([]); }
    });
  }
  function _docHistSaveAll(arr) {
    return new Promise((res) => {
      try { chrome.storage.local.set({ [DOC_HIST_KEY]: arr }, () => res()); }
      catch { res(); }
    });
  }
  async function docHistList(subtype, medicoId) {
    const all = await _docHistLoadAll();
    const mid = medicoId || activeMedicoId();
    return all
      .filter((e) => e.subtype === subtype && (e.medicoId || "_default") === mid)
      .sort((a, b) => b.ts - a.ts);
  }
  async function docHistAdd(entry) {
    const all = await _docHistLoadAll();
    const mid = entry.medicoId || activeMedicoId();
    const e = {
      id: "dh_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      subtype: entry.subtype || "",
      medicoId: mid,
      medicoNombre: entry.medicoNombre || activeMedicoNombre(),
      paciente: entry.paciente || "",
      rut: entry.rut || "",
      payload: entry.payload || null,
      html: entry.html || "",
    };
    all.unshift(e);
    // Recortar por (subtype + medicoId)
    const counts = {};
    const kept = [];
    for (const x of all) {
      const k = (x.subtype || "_") + "|" + (x.medicoId || "_default");
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] <= DOC_HIST_MAX) kept.push(x);
    }
    await _docHistSaveAll(kept);
    return e;
  }
  async function docHistRemove(entryId) {
    const all = await _docHistLoadAll();
    await _docHistSaveAll(all.filter((e) => e.id !== entryId));
  }
  function docHistReprint(entry) {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { window.__AR_HOST?.toast?.("⚠ Permite ventanas emergentes para reimprimir"); return; }
    w.document.open(); w.document.write(entry.html); w.document.close();
  }

  function print(id, values) {
    const html = render(id, values);
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      window.__AR_HOST?.toast?.("⚠ Permite ventanas emergentes para imprimir");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();

    // Registrar en historial general (legacy)
    try {
      const v = values || {};
      const doc = get(id);
      window.__AR_HIST?.add({
        kind: "doc",
        subtype: id,
        label: doc?.title || id,
        paciente: v.nombre || "",
        rut: v.rut || "",
        html,
      });
    } catch (e) { /* historial es best-effort */ }

    // Historial dedicado por documento (con payload editable)
    try {
      const v = values || {};
      docHistAdd({
        subtype: id,
        paciente: v.nombre || "",
        rut: v.rut || "",
        payload: v,
        html,
      });
    } catch (e) { /* best-effort */ }
  }

  loadCatalog();
  window.__AR_DOCS = {
    ready, list, get, render, print,
    histList: docHistList,
    histAdd: docHistAdd,
    histRemove: docHistRemove,
    histReprint: docHistReprint,
    histMax: DOC_HIST_MAX,
  };
})();
