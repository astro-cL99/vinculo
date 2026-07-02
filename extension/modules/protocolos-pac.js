/* Vínculo — Protocolos PAC (Pedro Aguirre Cerda)
 * Vías clínicas oficiales:
 *   - HEARTS (Hipertensión Arterial)  — MINSAL/OPS
 *   - Diabetes Mellitus 2 (DM2)       — MINSAL HEARTS-D
 *   - Enfermedad Renal Crónica (ERC)  — DESAM PAC, código ERC1 (abr 2026 - abr 2031)
 *
 * Expone window.__AR_PAC con:
 *   .list()          → metadatos de los 3 protocolos
 *   .get(id)         → protocolo completo (etapas + alertas)
 *   .renderInto(el)  → pinta UI completa (selector + flujograma + pop-ups)
 *   .checkAlerts()   → barre lab + vitales + dx y dispara pop-ups bloqueantes
 *
 * Los pop-ups son MODALES con backdrop opaco. Sólo se cierran con
 * "✓ Entendido" tras al menos 1.2 s de visualización (anti-click accidental).
 */
(function () {
  if (window.__AR_PAC) return;

  const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const H = () => window.__AR_HOST || {};

  // ═══════════════════════════════════════════════════════════
  //  DATOS DE PROTOCOLOS
  // ═══════════════════════════════════════════════════════════

  const PROTOCOLS = {
    hta: {
      id: "hta",
      title: "HEARTS — Hipertensión Arterial",
      subtitle: "Vía clínica MINSAL · OPS · personal de salud",
      icon: "❤️",
      color: "#b91c1c",
      bg: "#fef2f2",
      goals: [
        { context: "Sólo HTA", systolic: "<140", diastolic: "<90" },
        { context: "HTA + DM o HTA + ERC", systolic: "<130", diastolic: "<80" },
        { context: "HTA + ECV conocida", systolic: "<130", diastolic: "<80" },
      ],
      diagnostico: [
        "PA sistólica ≥140 mmHg, o PA diastólica ≥90 mmHg.",
        "PA sistólica ≥130 mmHg en personas con DM y/o albuminuria ≥30 mg/g, y/o RCV alto (≥10%), y/o ECV establecida.",
      ],
      escalonamiento: [
        {
          step: 1, plazo: "Inicio",
          tx: "Losartán 50 mg/día + Amlodipino 5 mg/día",
          siguiente: "Repetir medición en 1 mes",
        },
        {
          step: 2, plazo: "1 mes",
          tx: "Losartán 100 mg/día* + Amlodipino 10 mg/día",
          siguiente: "Repetir medición en 1 mes",
        },
        {
          step: 3, plazo: "2 meses",
          tx: "Losartán 100 mg/día* + Amlodipino 10 mg/día + Hidroclorotiazida 25 mg/día",
          siguiente: "Repetir medición en 1 mes",
        },
        {
          step: 4, plazo: "3 meses",
          tx: "Losartán 100 mg/día* + Amlodipino 10 mg/día + Hidroclorotiazida 50 mg/día",
          siguiente: "Si fuera de meta → DERIVAR al próximo nivel de atención",
        },
      ],
      adherencia: [
        "Evitar consumo de alcohol",
        "IMC entre 18.5 y 24.9",
        "Evitar alimentos altos en sodio",
        "≥150 minutos de actividad física a la semana",
        "Mantener alimentación saludable",
        "Dejar de fumar y evitar humo del tabaco",
      ],
      seguimiento: [
        { cohorte: "RCV bajo y moderado, compensado", control: "Cada 6 meses", suministro: "3 meses" },
        { cohorte: "RCV alto", control: "Cada 3 meses", suministro: "3 meses" },
      ],
      vacunacion: ["Influenza: toda persona con HTA", "COVID: toda persona con HTA", "Neumococo: ≥65 años"],
      noAplica: [
        "Mujer en edad fértil o embarazada",
        "Personas ≥80 años",
        "Indicaciones perentorias (IAM, IC)",
        "ERC etapa 4 y 5",
        "Insuficiencia hepática grave",
        "Alergias a componentes",
      ],
      // Pop-ups disparables automáticamente
      alertas: [
        {
          id: "hta-meta-no-alcanzada",
          when: (ctx) => ctx.pas && ctx.pad && (
            (ctx.dm || ctx.erc || ctx.ecv) ? (ctx.pas >= 130 || ctx.pad >= 80) : (ctx.pas >= 140 || ctx.pad >= 90)
          ),
          severity: "warn",
          title: "🎯 Paciente FUERA de meta de PA",
          body: (ctx) => `
            PA actual registrada: <b>${ctx.pas}/${ctx.pad} mmHg</b>.
            ${ctx.dm || ctx.erc || ctx.ecv
              ? `Meta para HTA + ${ctx.dm ? "DM" : ctx.erc ? "ERC" : "ECV"}: <b>&lt;130/80 mmHg</b>.`
              : `Meta para HTA aislada: <b>&lt;140/90 mmHg</b>.`}
            <br><br><b>Sugerencia:</b> Avanzar al siguiente escalón del protocolo HEARTS y citar control en 1 mes.
          `,
        },
        {
          id: "hta-derivar",
          when: (ctx) => ctx.escalon === 4 && ctx.pas && (ctx.pas >= 140 || ctx.pad >= 90),
          severity: "danger",
          title: "🚑 Derivación al próximo nivel",
          body: () => `
            El paciente lleva el escalón 4 de HEARTS (Losartán 100 + Amlodipino 10 + HCTZ 50)
            y persiste fuera de meta. <br><br>
            <b>Acción:</b> Derivar a especialista cardiovascular / nefrología.
          `,
        },
      ],
    },

    dm2: {
      id: "dm2",
      title: "DM2 — Diabetes Mellitus tipo 2",
      subtitle: "HEARTS-D · MINSAL · APS",
      icon: "🩸",
      color: "#7c2d12",
      bg: "#fff7ed",
      tamizaje: [
        "Anual: >40 años, o 18-40 con ≥1 factor de riesgo (sobrepeso/obesidad, antec. familiar DM2, DG, hijo macrosómico, ECV o FRCV, intolerancia a glucosa, SOP, baja de peso no intencionada).",
        "Cada 3 años: 20-40 años sin factores de riesgo.",
      ],
      diagnostico: [
        "Glicemia de ayuno ≥126 mg/dL (repetir + HbA1c).",
        "HbA1c ≥6.5% (si lab certificado NGSP).",
        "PTGO ≥200 mg/dL a las 2 h.",
        "Síntomas (poliuria, polidipsia, polifagia, baja de peso) + glicemia al azar ≥200 mg/dL.",
      ],
      tratamiento: {
        baseEstiloVida: [
          "Educación y herramientas de automanejo",
          "Alimentación saludable, peso adecuado",
          "≥30 min de actividad física diaria",
          "Autocuidado del pie y calzado adecuado",
          "Cuidado bucal",
          "Eliminar alcohol y tabaco",
        ],
        algoritmo: [
          {
            grupo: "A · DM2 asintomática SIN comorbilidad cardio-renal y HbA1c <10%",
            esquema: [
              { step: 1, tx: "Metformina (MET) + Atorvastatina 20-40 mg" },
              { step: 2, tx: "MET + IDPP4 (Vildagliptina 50 mg c/12 h, ½ dosis si VFG <50)" },
              { step: 3, tx: "Iniciar Insulina Basal (máx 0.5 UI/kg/día)" },
              { step: 4, tx: "DERIVAR a Unidad de Diabetes Hospitalaria" },
            ],
          },
          {
            grupo: "B · DM2 asintomática CON comorbilidad cardio-renal",
            esquema: [
              { step: 1, condicion: "Antec. IAM o IC estadio C", tx: "MET + iSGLT2 + AAS 100 + ATV 40-80 + ARA II" },
              { step: 1, condicion: "ERC VFG 45-59", tx: "MET + iSGLT2 + ATV 40-80 + ARA II" },
              { step: 1, condicion: "ERC VFG 30-44", tx: "MET ½ dosis + iSGLT2 + ATV 40-80 + ARA II" },
              { step: 1, condicion: "ERC VFG 20-29", tx: "iSGLT2 + IDPP4 + ATV 40-80 + ARA II" },
              { step: 1, condicion: "ERC VFG <20", tx: "IDPP4 (no iSGLT2 ni MET)" },
              { step: 2, tx: "Si no logra meta de HbA1c → Iniciar Insulina Basal" },
              { step: 3, tx: "DERIVAR a Unidad de Diabetes Hospitalaria" },
            ],
          },
          {
            grupo: "C · DM2 sintomática CON baja de peso y/o HbA1c ≥10%",
            esquema: [
              { step: 1, tx: "Insulina Basal + Metformina + ATV 40 mg" },
              { step: 2, tx: "Si compensa → continuar según columna A o B según comorbilidad" },
            ],
          },
        ],
        notas: [
          "ARA II = Losartán 50-100 mg, según diagnóstico de HTA.",
          "Atorvastatina: dosis según RCV (alto/muy alto).",
          "NO solicitar Insulinemia ni HOMA en APS.",
        ],
      },
      seguimiento: [
        "3 controles anuales (cada 4 meses): nutricionista, enfermería, médico.",
        "Semestral: HbA1c, glicemia ayunas, hematocrito y hemoglobina, perfil lipídico, creatinina, RAC.",
        "Anual: Transaminasas y ECG.",
        "Tamizaje retinopatía: sin RD cada 2 años; con RD cada 6 meses.",
      ],
      vacunacion: ["Influenza", "Neumococo (≥65)", "COVID-19 según MINSAL"],
      derivacionUrgencia: [
        "Sospecha de cetoacidosis o sd. hiperosmolar",
        "Hipoglicemia severa (Nivel 3)",
        "Pie diabético complicado o isquemia aguda",
        "Deshidratación severa o vómitos incoercibles",
        "Potasio ≥6 mEq/L",
        "Sospecha de ACV o IAM",
      ],
      derivacionEspecialista: [
        "Necesidad de insulinoterapia basal-bolo",
        "Hipoglicemias a repetición",
        "Enfermedad renal o hepática avanzada",
        "Sospecha de DM tipo 1 u otros tipos específicos, o <30 años",
        "Adherente que no alcanza meta individualizada",
      ],
      noAplica: ["<18 años", "Embarazadas", "DM gestacional", "DM1", "Enfermedad hepática avanzada"],
      alertas: [
        {
          id: "dm2-hba1c-meta",
          when: (ctx) => ctx.hba1c != null && ctx.hba1c > 7,
          severity: "warn",
          title: "🎯 HbA1c sobre meta",
          body: (ctx) => `
            HbA1c registrada: <b>${ctx.hba1c}%</b>. Meta general: <b>&lt;7%</b>
            (individualizar en adultos mayores frágiles a 7.5-8%).<br><br>
            <b>Sugerencia:</b> Reforzar adherencia, intensificar estilo de vida y avanzar al siguiente
            escalón farmacológico según el algoritmo HEARTS-D.
          `,
        },
        {
          id: "dm2-hba1c-insulina",
          when: (ctx) => ctx.hba1c != null && ctx.hba1c >= 10,
          severity: "danger",
          title: "💉 Iniciar Insulina Basal",
          body: (ctx) => `
            HbA1c <b>${ctx.hba1c}%</b> ≥ 10% configura DM2 sintomática severa
            (columna C del algoritmo).<br><br>
            <b>Acción:</b> Iniciar <b>Insulina Basal + Metformina + ATV 40 mg</b>. Recordar dosis máxima
            de basal: <b>0.5 UI/kg/día</b>. Educar al paciente y citar control estricto en 7-14 días.
          `,
        },
        {
          id: "dm2-derivar-renal",
          when: (ctx) => ctx.vfg != null && ctx.vfg < 30 && ctx.dm,
          severity: "danger",
          title: "🚑 DM2 + ERC avanzada",
          body: (ctx) => `
            VFGe <b>${ctx.vfg} mL/min/1.73m²</b>. Suspender Metformina si VFG &lt;30. Con VFG &lt;20
            la única opción APS es <b>IDPP4</b>.<br><br>
            <b>Acción:</b> Ajustar farmacoterapia, derivar a Nefrología y mantener seguimiento conjunto.
          `,
        },
        {
          id: "dm2-k-critico",
          when: (ctx) => ctx.k != null && ctx.k >= 6,
          severity: "danger",
          title: "⚡ Potasio crítico — Urgencia",
          body: (ctx) => `
            K⁺ = <b>${ctx.k} mEq/L</b>. Configura criterio de derivación INMEDIATA a Unidad de
            Emergencia Hospitalaria (DM2 y ERC).
          `,
        },
      ],
    },

    erc: {
      id: "erc",
      title: "ERC — Enfermedad Renal Crónica",
      subtitle: "DESAM PAC · Código ERC1 · vigencia abr 2026 - abr 2031",
      icon: "🫘",
      color: "#0369a1",
      bg: "#f0f9ff",
      definicion: [
        "VFGe < 60 mL/min/1.73m² y/o RAC > 30 mg/g, persistente por ≥3 meses.",
        "Confirmar persistencia repitiendo VFGe y RAC en 3 meses antes de etiquetar como ERC.",
      ],
      tamizaje: [
        "Toda persona con factores de riesgo: HTA, DM, ECV, antecedentes familiares de ERC, edad >60 años, obesidad, uso crónico de nefrotóxicos.",
        "Frecuencia mínima: VFGe + RAC anual; si alterado, repetir 2 veces en 3-6 meses para confirmar.",
      ],
      categorias: {
        vfg: [
          { cat: "G1", rango: "≥90", interpret: "Normal o alta" },
          { cat: "G2", rango: "60-89", interpret: "Levemente disminuida" },
          { cat: "G3a", rango: "45-59", interpret: "Moderadamente disminuida" },
          { cat: "G3b", rango: "30-44", interpret: "Moderada-severamente disminuida" },
          { cat: "G4", rango: "15-29", interpret: "Severamente disminuida" },
          { cat: "G5", rango: "<15", interpret: "Falla renal" },
        ],
        rac: [
          { cat: "A1", rango: "<30 mg/g", interpret: "Normal a leve" },
          { cat: "A2", rango: "30-300 mg/g", interpret: "Moderadamente elevada" },
          { cat: "A3", rango: ">300 mg/g", interpret: "Severamente elevada" },
        ],
      },
      tratamiento: [
        "Control estricto de presión arterial (ver protocolo HEARTS).",
        "IECA o ARA II si albuminuria (RAC ≥30 mg/g) o HTA.",
        "iSGLT2 si DM2 + ERC (hasta VFGe ≥20 según KDIGO 2024).",
        "Estatinas según RCV.",
        "Suspender nefrotóxicos (AINEs, contrastes evitables).",
        "Educación: alcohol, alimentación, sodio, peso, actividad física, tabaco.",
      ],
      seguimiento: [
        "G1-G2: control anual en APS.",
        "G3a: control semestral en APS.",
        "G3b-G5: seguimiento conjunto APS-nefrólogo.",
        "Vacunación: influenza anual, hepatitis B y VNP-23 en ERC 4-5 o diálisis.",
      ],
      derivacionEspecialista: [
        "VFGe <30 mL/min sostenida.",
        "Caída rápida de VFGe (>5 mL/min/año).",
        "RAC >300 mg/g persistente pese a tratamiento óptimo.",
        "Hematuria glomerular persistente.",
        "Sospecha de causa secundaria.",
        "K⁺ persistente >5.5 pese a manejo.",
      ],
      derivacionUrgencia: [
        "Edema pulmonar agudo (EPA)",
        "Potasio ≥6 mEq/L",
        "BUN ≥100 mg/dL",
        "Acidosis metabólica grave",
        "Uremia sintomática",
      ],
      alertas: [
        {
          id: "erc-vfg-confirmar",
          when: (ctx) => ctx.vfg != null && ctx.vfg < 60 && ctx.vfg >= 30,
          severity: "warn",
          title: "⚠ VFGe disminuida — confirmar ERC",
          body: (ctx) => `
            VFGe <b>${ctx.vfg} mL/min/1.73m²</b> (categoría G${ctx.vfg >= 45 ? "3a" : "3b"}).<br><br>
            <b>Acción:</b> Confirmar persistencia repitiendo creatinina y RAC en <b>3 meses</b>.
            Si persiste, etiquetar como ERC e iniciar manejo según vía clínica DESAM PAC.
          `,
        },
        {
          id: "erc-derivar-nefro",
          when: (ctx) => ctx.vfg != null && ctx.vfg < 30,
          severity: "danger",
          title: "🚑 Derivar a Nefrología",
          body: (ctx) => `
            VFGe <b>${ctx.vfg} mL/min/1.73m²</b> &lt; 30 (G4 o G5). Criterio de derivación a
            especialista para seguimiento conjunto.<br><br>
            Suspender o ajustar nefrotóxicos. Vacunación: influenza, hepatitis B y VNP-23.
          `,
        },
        {
          id: "erc-rac-iso-iadinhibir",
          when: (ctx) => ctx.rac != null && ctx.rac >= 30,
          severity: "warn",
          title: "🧪 Albuminuria — iniciar IECA/ARA II",
          body: (ctx) => `
            RAC <b>${ctx.rac} mg/g</b> ≥ 30 (categoría A${ctx.rac > 300 ? "3" : "2"}).<br><br>
            <b>Acción:</b> Iniciar IECA o ARA II. Si DM2 asociada, agregar iSGLT2 si VFGe ≥20
            (KDIGO 2024). Controlar K⁺ y creatinina al mes.
          `,
        },
        {
          id: "erc-urgencia",
          when: (ctx) => (ctx.k != null && ctx.k >= 6) || (ctx.bun != null && ctx.bun >= 100),
          severity: "danger",
          title: "⚡ Urgencia nefrológica",
          body: (ctx) => `
            ${ctx.k >= 6 ? `K⁺ = <b>${ctx.k} mEq/L</b> (≥6).` : ""}
            ${ctx.bun >= 100 ? `<br>BUN = <b>${ctx.bun} mg/dL</b> (≥100).` : ""}
            <br><br><b>Acción:</b> Derivar INMEDIATAMENTE a Unidad de Emergencia Hospitalaria.
          `,
        },
      ],
    },
  };

  // ═══════════════════════════════════════════════════════════
  //  EXTRACCIÓN DE CONTEXTO DEL PACIENTE (lab + vitales + dx)
  // ═══════════════════════════════════════════════════════════

  function extractCtx() {
    const ctx = {};
    let lab = null;
    try { lab = H().getLabSession?.() || window.__AR_LAB_SESSION?.get?.() || null; } catch {}
    let vitals = {};
    try { vitals = window.__AR_VITALS?.read?.() || {}; } catch {}

    // Lab: analytes es un OBJETO {key: {value, unit, date, ...}}
    if (lab && lab.analytes && typeof lab.analytes === "object") {
      const entries = Object.entries(lab.analytes);
      const find = (re) => {
        for (const [key, a] of entries) {
          const name = (a && (a.rawName || a.name)) || "";
          if (re.test(key || "") || re.test(name)) {
            const raw = a && a.value != null ? a.value : a;
            const v = parseFloat(String(raw).replace(",", "."));
            if (!isNaN(v)) return v;
          }
        }
        return null;
      };
      const hba1c = find(/hba1c|hemoglobina[_ ]?glic/i);
      const vfg = find(/\bvfg\b|filtrado|egfr|gfr/i);
      const rac = find(/\brac\b|albumin.*creat|microalbumin/i);
      const k = find(/^k$|potasio/i);
      const bun = find(/\bbun\b|nitr[oó]geno|urea/i);
      const crea = find(/creatinin/i);
      const gli = find(/glicemia|glucosa/i);
      if (hba1c != null) ctx.hba1c = hba1c;
      if (vfg != null) ctx.vfg = vfg;
      if (rac != null) ctx.rac = rac;
      if (k != null) ctx.k = k;
      if (bun != null) ctx.bun = bun;
      if (crea != null) ctx.crea = crea;
      if (gli != null) ctx.glicemia = gli;
    }

    // Vitales: PA / antropometría
    if (vitals.pas) ctx.pas = parseFloat(vitals.pas) || vitals.pas;
    if (vitals.pad) ctx.pad = parseFloat(vitals.pad) || vitals.pad;
    if (vitals.peso) ctx.peso = vitals.peso;
    if (vitals.talla) ctx.talla = vitals.talla;
    if (vitals.edad) ctx.edad = vitals.edad;

    // Diagnósticos: usar __AR_DX_EXTRACT (abreviaciones), __AR_PATIENT y texto de la ficha
    const dxSet = new Set();
    try {
      const dxe = window.__AR_DX_EXTRACT?.extract?.();
      (dxe?.candidatos || []).forEach((c) => {
        if (c.abrev) dxSet.add(String(c.abrev).toUpperCase());
        if (c.label) dxSet.add(String(c.label).toLowerCase());
      });
    } catch {}
    try {
      const pp = window.__AR_PATIENT?.extract?.() || {};
      if (pp.sexo) ctx.sex = String(pp.sexo).toUpperCase().startsWith("F") ? "F" : "M";
      if (pp.edad != null) {
        const a = typeof pp.edad === "number" ? pp.edad : parseInt(String(pp.edad), 10);
        if (!isNaN(a)) ctx.edad = ctx.edad || a;
      }
      if (Array.isArray(pp.diagnosticos)) pp.diagnosticos.forEach((d) => dxSet.add(String(d).toLowerCase()));
    } catch {}
    // Fallback: escanear texto visible de la ficha
    let bodyText = "";
    try { bodyText = (document.body?.innerText || "").toLowerCase(); } catch {}
    const dxText = ([...dxSet].join(" ") + " " + bodyText).toLowerCase();
    if (dxSet.has("DM2") || dxSet.has("DM") || /\bdiabetes\b|\bdm\s?2\b|\bdm\s?ii\b/.test(dxText)) ctx.dm = true;
    if (dxSet.has("HTA") || /hipertensi[oó]n arterial|\bhta\b/.test(dxText)) ctx.hta = true;
    if (dxSet.has("ERC") || /enfermedad renal cr[oó]nica|\berc\b|nefropat[ií]a/.test(dxText)) ctx.erc = true;
    if (/\biam\b|infarto.*miocard|insuf.*card[ií]aca|\bicc\b|cardiopat[ií]a isqu[eé]m/.test(dxText)) ctx.ecv = true;

    return ctx;
  }

  // ═══════════════════════════════════════════════════════════
  //  POP-UP BLOQUEANTE
  // ═══════════════════════════════════════════════════════════

  // localStorage por sesión: no repetir el mismo pop-up ya cerrado
  const SESSION_KEY = "ar-pac-acked";
  function ack(id) {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const set = raw ? new Set(JSON.parse(raw)) : new Set();
      set.add(id);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]));
    } catch {}
  }
  function isAcked(id) {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      return new Set(JSON.parse(raw)).has(id);
    } catch { return false; }
  }
  function resetAcks() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  function showPopup(alerta, ctx, onClose) {
    if (document.getElementById("ar-pac-popup")) return;
    const SEV_COLORS = {
      info: { bar: "#0369a1", bg: "#f0f9ff", border: "#7dd3fc" },
      warn: { bar: "#b45309", bg: "#fffbeb", border: "#fbbf24" },
      danger: { bar: "#b91c1c", bg: "#fef2f2", border: "#fca5a5" },
    };
    const c = SEV_COLORS[alerta.severity] || SEV_COLORS.info;
    const ov = document.createElement("div");
    ov.id = "ar-pac-popup";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif";
    const body = typeof alerta.body === "function" ? alerta.body(ctx) : alerta.body;
    ov.innerHTML = `
      <div style="background:#fff;border-radius:12px;max-width:560px;width:92vw;box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden;border-top:6px solid ${c.bar}">
        <div style="padding:18px 22px;background:${c.bg};border-bottom:1px solid ${c.border}">
          <h2 style="margin:0;font-size:18px;color:${c.bar};line-height:1.25">${escapeHtml(alerta.title)}</h2>
        </div>
        <div style="padding:18px 22px;font-size:14px;line-height:1.55;color:#0f172a">${body}</div>
        <div style="padding:12px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;align-items:center">
          <span data-counter style="font-size:11px;color:#64748b;margin-right:auto">Lectura obligatoria · espere 2s</span>
          <button data-confirm disabled style="background:${c.bar};color:#fff;border:0;padding:9px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:not-allowed;opacity:.5">✓ Entendido</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const btn = ov.querySelector("[data-confirm]");
    const counter = ov.querySelector("[data-counter]");
    let secs = 2;
    counter.textContent = `Lectura obligatoria · espere ${secs}s`;
    const tick = setInterval(() => {
      secs -= 1;
      if (secs <= 0) {
        clearInterval(tick);
        counter.textContent = "Confirme para continuar";
        btn.disabled = false;
        btn.style.cursor = "pointer";
        btn.style.opacity = "1";
      } else {
        counter.textContent = `Lectura obligatoria · espere ${secs}s`;
      }
    }, 1000);
    btn.onclick = () => {
      clearInterval(tick);
      ack(alerta.id);
      ov.remove();
      onClose && onClose();
    };
  }

  // Cola: procesa pop-ups de a uno
  function showQueue(alertas, ctx) {
    const pend = alertas.filter((a) => !isAcked(a.id));
    if (!pend.length) return;
    const next = (i) => {
      if (i >= pend.length) return;
      showPopup(pend[i], ctx, () => next(i + 1));
    };
    next(0);
  }

  function checkAlerts() {
    const ctx = extractCtx();
    const all = [];
    Object.values(PROTOCOLS).forEach((p) => {
      (p.alertas || []).forEach((a) => {
        try { if (a.when(ctx)) all.push(a); } catch {}
      });
    });
    showQueue(all, ctx);
  }

  // ═══════════════════════════════════════════════════════════
  //  UI: SELECTOR + FLUJOGRAMA
  // ═══════════════════════════════════════════════════════════

  function badge(text, color) {
    return `<span style="display:inline-block;padding:2px 8px;background:${color};color:#fff;border-radius:10px;font-size:10px;font-weight:600;margin-right:6px">${escapeHtml(text)}</span>`;
  }

  function renderHTA(p) {
    return `
      <div style="background:${p.bg};border-radius:10px;padding:14px 16px;border-left:5px solid ${p.color}">
        <h3 style="margin:0 0 4px;color:${p.color};font-size:18px">${p.icon} ${escapeHtml(p.title)}</h3>
        <p style="margin:0 0 10px;font-size:11px;color:#475569">${escapeHtml(p.subtitle)}</p>

        <h4 style="margin:12px 0 6px;color:#0f172a;font-size:13px">🎯 Metas según riesgo</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border:1px solid #e2e8f0">
          <thead><tr style="background:#fee2e2"><th style="padding:6px;text-align:left">Riesgo</th><th style="padding:6px;text-align:center">PAS</th><th style="padding:6px;text-align:center">PAD</th></tr></thead>
          <tbody>
            ${p.goals.map((g) => `<tr><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHtml(g.context)}</td><td style="padding:6px;border-top:1px solid #e2e8f0;text-align:center"><b>${g.systolic}</b></td><td style="padding:6px;border-top:1px solid #e2e8f0;text-align:center"><b>${g.diastolic}</b></td></tr>`).join("")}
          </tbody>
        </table>

        <h4 style="margin:14px 0 6px;color:#0f172a;font-size:13px">⛓ Escalonamiento farmacológico</h4>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${p.escalonamiento.map((e) => `
            <div style="background:#fff;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start">
              <div style="background:${p.color};color:#fff;font-weight:700;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${e.step}</div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:#0f172a">${escapeHtml(e.tx)}</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px">${escapeHtml(e.plazo)} → ${escapeHtml(e.siguiente)}</div>
              </div>
            </div>`).join("")}
        </div>

        <h4 style="margin:14px 0 6px;color:#0f172a;font-size:13px">🌱 Adherencia y estilo de vida</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#0f172a;line-height:1.6">
          ${p.adherencia.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}
        </ul>

        <h4 style="margin:14px 0 6px;color:#0f172a;font-size:13px">📅 Seguimiento</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border:1px solid #e2e8f0">
          <thead><tr style="background:#fee2e2"><th style="padding:6px;text-align:left">Cohorte</th><th style="padding:6px;text-align:left">Control</th><th style="padding:6px;text-align:left">Suministro</th></tr></thead>
          <tbody>${p.seguimiento.map((s) => `<tr><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHtml(s.cohorte)}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHtml(s.control)}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHtml(s.suministro)}</td></tr>`).join("")}</tbody>
        </table>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px">
            <h5 style="margin:0 0 6px;font-size:12px;color:#0369a1">💉 Vacunación</h5>
            <ul style="margin:0;padding-left:16px;font-size:11px;line-height:1.5">${p.vacunacion.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>
          </div>
          <div style="background:#fff;border:1px solid #fca5a5;border-radius:8px;padding:10px">
            <h5 style="margin:0 0 6px;font-size:12px;color:#b91c1c">⛔ NO aplica a</h5>
            <ul style="margin:0;padding-left:16px;font-size:11px;line-height:1.5">${p.noAplica.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>
          </div>
        </div>
      </div>`;
  }

  function renderDM2(p) {
    return `
      <div style="background:${p.bg};border-radius:10px;padding:14px 16px;border-left:5px solid ${p.color}">
        <h3 style="margin:0 0 4px;color:${p.color};font-size:18px">${p.icon} ${escapeHtml(p.title)}</h3>
        <p style="margin:0 0 10px;font-size:11px;color:#475569">${escapeHtml(p.subtitle)}</p>

        <h4 style="margin:12px 0 6px;font-size:13px">🔍 Tamizaje (A)</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.55">${p.tamizaje.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>

        <h4 style="margin:14px 0 6px;font-size:13px">🩺 Diagnóstico</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.55">${p.diagnostico.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>

        <h4 style="margin:14px 0 6px;font-size:13px">💊 Tratamiento (C) — algoritmo</h4>
        <div style="background:#fff;border:1px solid #fed7aa;border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:11px;color:#7c2d12;font-weight:600;margin-bottom:6px">🌱 Base — Estilo de vida saludable (todos los pacientes)</div>
          <ul style="margin:0;padding-left:18px;font-size:11px;line-height:1.5">${p.tratamiento.baseEstiloVida.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
        </div>
        ${p.tratamiento.algoritmo.map((g) => `
          <div style="background:#fff;border:1px solid #fed7aa;border-radius:8px;padding:10px;margin-bottom:8px">
            <div style="font-size:12px;font-weight:700;color:${p.color};margin-bottom:8px">${escapeHtml(g.grupo)}</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${g.esquema.map((s) => `
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <div style="background:${p.color};color:#fff;font-weight:700;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0">${s.step}</div>
                  <div style="flex:1;font-size:12px">
                    ${s.condicion ? `<div style="font-size:10px;color:#7c2d12;font-weight:600">${escapeHtml(s.condicion)}</div>` : ""}
                    <div>${escapeHtml(s.tx)}</div>
                  </div>
                </div>`).join("")}
            </div>
          </div>`).join("")}
        <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:8px;font-size:11px;color:#78350f">
          <b>Notas:</b><ul style="margin:4px 0 0;padding-left:18px">${p.tratamiento.notas.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
        </div>

        <h4 style="margin:14px 0 6px;font-size:13px">📅 Seguimiento (D)</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.55">${p.seguimiento.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <div style="background:#fff;border:1px solid #fca5a5;border-radius:8px;padding:10px">
            <h5 style="margin:0 0 6px;font-size:12px;color:#b91c1c">🚑 Derivación URGENCIA</h5>
            <ul style="margin:0;padding-left:16px;font-size:11px;line-height:1.5">${p.derivacionUrgencia.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>
          </div>
          <div style="background:#fff;border:1px solid #fbbf24;border-radius:8px;padding:10px">
            <h5 style="margin:0 0 6px;font-size:12px;color:#b45309">📞 Derivación Especialista</h5>
            <ul style="margin:0;padding-left:16px;font-size:11px;line-height:1.5">${p.derivacionEspecialista.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>
          </div>
        </div>
        <div style="margin-top:10px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:11px;color:#475569">
          <b>💉 Vacunación:</b> ${p.vacunacion.map((v) => escapeHtml(v)).join(" · ")}<br>
          <b>⛔ NO aplica:</b> ${p.noAplica.map((v) => escapeHtml(v)).join(" · ")}
        </div>
      </div>`;
  }

  function renderERC(p) {
    return `
      <div style="background:${p.bg};border-radius:10px;padding:14px 16px;border-left:5px solid ${p.color}">
        <h3 style="margin:0 0 4px;color:${p.color};font-size:18px">${p.icon} ${escapeHtml(p.title)}</h3>
        <p style="margin:0 0 10px;font-size:11px;color:#475569">${escapeHtml(p.subtitle)}</p>

        <h4 style="margin:12px 0 6px;font-size:13px">📐 Definición</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.55">${p.definicion.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>

        <h4 style="margin:14px 0 6px;font-size:13px">🔍 Tamizaje</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.55">${p.tamizaje.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>

        <h4 style="margin:14px 0 6px;font-size:13px">📊 Categorías KDIGO</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:11px;font-weight:600;color:#0369a1;margin-bottom:4px">VFGe (mL/min/1.73m²)</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #e2e8f0">
              ${p.categorias.vfg.map((c) => `<tr><td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-weight:600;width:36px">${c.cat}</td><td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;width:60px">${c.rango}</td><td style="padding:4px 6px;border-bottom:1px solid #e2e8f0">${escapeHtml(c.interpret)}</td></tr>`).join("")}
            </table>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#0369a1;margin-bottom:4px">RAC (Albuminuria)</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #e2e8f0">
              ${p.categorias.rac.map((c) => `<tr><td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-weight:600;width:36px">${c.cat}</td><td style="padding:4px 6px;border-bottom:1px solid #e2e8f0">${escapeHtml(c.rango)}</td><td style="padding:4px 6px;border-bottom:1px solid #e2e8f0">${escapeHtml(c.interpret)}</td></tr>`).join("")}
            </table>
          </div>
        </div>

        <h4 style="margin:14px 0 6px;font-size:13px">💊 Tratamiento</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.55">${p.tratamiento.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>

        <h4 style="margin:14px 0 6px;font-size:13px">📅 Seguimiento</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.55">${p.seguimiento.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <div style="background:#fff;border:1px solid #fca5a5;border-radius:8px;padding:10px">
            <h5 style="margin:0 0 6px;font-size:12px;color:#b91c1c">🚑 Derivación URGENCIA</h5>
            <ul style="margin:0;padding-left:16px;font-size:11px;line-height:1.5">${p.derivacionUrgencia.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>
          </div>
          <div style="background:#fff;border:1px solid #fbbf24;border-radius:8px;padding:10px">
            <h5 style="margin:0 0 6px;font-size:12px;color:#b45309">📞 Derivación Especialista</h5>
            <ul style="margin:0;padding-left:16px;font-size:11px;line-height:1.5">${p.derivacionEspecialista.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>
          </div>
        </div>
      </div>`;
  }

  function renderProtocol(p) {
    if (p.id === "hta") return renderHTA(p);
    if (p.id === "dm2") return renderDM2(p);
    if (p.id === "erc") return renderERC(p);
    return "";
  }

  function renderInto(host) {
    if (!host) return;
    let ctx = {};
    try { ctx = extractCtx(); } catch (e) { console.warn("[AR-PAC] extractCtx error:", e); }
    const ctxChips = [];
    const dxChips = [];
    if (ctx.dm) dxChips.push("DM2");
    if (ctx.hta) dxChips.push("HTA");
    if (ctx.erc) dxChips.push("ERC");
    if (ctx.ecv) dxChips.push("ECV");
    if (ctx.pas && ctx.pad) ctxChips.push(`PA ${ctx.pas}/${ctx.pad}`);
    if (ctx.hba1c != null) ctxChips.push(`HbA1c ${ctx.hba1c}%`);
    if (ctx.vfg != null) ctxChips.push(`VFGe ${ctx.vfg}`);
    if (ctx.rac != null) ctxChips.push(`RAC ${ctx.rac}`);
    if (ctx.k != null) ctxChips.push(`K⁺ ${ctx.k}`);
    if (ctx.bun != null) ctxChips.push(`BUN ${ctx.bun}`);
    if (ctx.glicemia != null) ctxChips.push(`Glic ${ctx.glicemia}`);

    try {
      host.innerHTML = `
      <div style="font-family:system-ui,sans-serif">
        <div style="background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <strong style="font-size:13px">❤️ Vías Clínicas PAC</strong>
          <span style="font-size:11px;opacity:.85">HEARTS · DM2 · ERC — Pedro Aguirre Cerda</span>
          <button data-pac-check style="margin-left:auto;background:#dc2626;color:#fff;border:0;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">⚡ Revisar alertas del paciente</button>
          <button data-pac-reset title="Reabrir pop-ups ya cerrados en esta sesión" style="background:#475569;color:#fff;border:0;padding:6px 10px;border-radius:5px;font-size:11px;cursor:pointer">↻ Reset</button>
        </div>
        ${dxChips.length ? `<div style="background:#fef3c7;border:1px solid #fbbf24;color:#78350f;padding:6px 10px;border-radius:6px;font-size:11px;margin-bottom:6px"><b>Diagnósticos detectados:</b> ${dxChips.map((d) => `<span style="background:#fff;padding:1px 6px;border-radius:8px;margin-right:4px;font-weight:600">${escapeHtml(d)}</span>`).join("")}</div>` : ""}
        ${ctxChips.length ? `<div style="background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:6px 10px;border-radius:6px;font-size:11px;margin-bottom:10px"><b>Contexto del paciente detectado:</b> ${ctxChips.map((c) => `<span style="background:#fff;padding:1px 6px;border-radius:8px;margin-right:4px">${escapeHtml(c)}</span>`).join("")}</div>` : `<div style="background:#fef9c3;border:1px solid #fde68a;color:#78350f;padding:6px 10px;border-radius:6px;font-size:11px;margin-bottom:10px">Sin lab/vitales extraídos. Pulsa <b>🧪 Lab</b> y <b>📊 Vitales</b> primero para activar las alertas automáticas.</div>`}

        <div style="display:flex;gap:6px;margin-bottom:10px">
          <button data-pac-tab="hta" class="ar-pac-tab active" style="flex:1;padding:8px;border:1px solid #fca5a5;background:#fee2e2;color:#b91c1c;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">🫀 HEARTS · HTA</button>
          <button data-pac-tab="dm2" class="ar-pac-tab" style="flex:1;padding:8px;border:1px solid #fed7aa;background:#fff;color:#7c2d12;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">🩸 DM2</button>
          <button data-pac-tab="erc" class="ar-pac-tab" style="flex:1;padding:8px;border:1px solid #7dd3fc;background:#fff;color:#0369a1;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">🫘 ERC</button>
        </div>

        <div data-pac-content></div>
      </div>`;

    const cont = host.querySelector("[data-pac-content]");
    const tabs = host.querySelectorAll("[data-pac-tab]");
    function selectTab(id) {
      tabs.forEach((b) => {
        const sel = b.dataset.pacTab === id;
        b.classList.toggle("active", sel);
        const colors = { hta: ["#fee2e2", "#b91c1c", "#fca5a5"], dm2: ["#ffedd5", "#7c2d12", "#fed7aa"], erc: ["#dbeafe", "#0369a1", "#7dd3fc"] };
        const c = colors[b.dataset.pacTab];
        b.style.background = sel ? c[0] : "#fff";
        b.style.color = c[1];
        b.style.borderColor = c[2];
      });
      cont.innerHTML = renderProtocol(PROTOCOLS[id]);
    }
    tabs.forEach((b) => { b.onclick = () => selectTab(b.dataset.pacTab); });
    selectTab("hta");

    host.querySelector("[data-pac-check]").onclick = () => {
      const all = [];
      const ctx2 = extractCtx();
      Object.values(PROTOCOLS).forEach((p) => {
        (p.alertas || []).forEach((a) => { try { if (a.when(ctx2)) all.push(a); } catch {} });
      });
      if (!all.length) {
        H().toast?.("✓ Sin alertas críticas para los datos actuales");
        return;
      }
      // forzar mostrar incluso si ya estaban acked
      resetAcks();
      showQueue(all, ctx2);
    };
    host.querySelector("[data-pac-reset]").onclick = () => {
      resetAcks();
      H().toast?.("Pop-ups reseteados — vuelve a pulsar Revisar alertas");
    };
    } catch (err) {
      console.warn("[AR-PAC] renderInto error:", err);
      host.innerHTML = `<div style="padding:14px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#7f1d1d;font-family:system-ui,sans-serif;font-size:13px"><b>⚠ Error al renderizar Vías PAC</b><br><span style="font-size:11px;font-family:monospace">${escapeHtml(String(err && err.message || err))}</span><br><br>Intenta recargar la ficha o pulsa primero <b>🧪 Lab</b>.</div>`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  EXPONER API
  // ═══════════════════════════════════════════════════════════

  window.__AR_PAC = {
    list: () => Object.values(PROTOCOLS).map((p) => ({ id: p.id, title: p.title, icon: p.icon, color: p.color })),
    get: (id) => PROTOCOLS[id],
    renderInto,
    checkAlerts,
    resetAcks,
  };

  // Auto-chequeo cuando se actualiza la sesión de lab (silencioso si no hay alertas)
  document.addEventListener("ar:lab-session-updated", () => {
    setTimeout(checkAlerts, 400);
  });
  // También al cambiar de paciente (ficha distinta)
  window.addEventListener("ar:patient-changed", () => {
    resetAcks();
    setTimeout(checkAlerts, 600);
  });
})();
