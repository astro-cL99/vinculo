/* Vínculo — Consultor IA (chat lateral con streaming SSE)
 * Llama a la edge function `consultor-ia` (Lovable AI Gateway / Gemini).
 * NUNCA envía PII: usa __AR_PII.buildPatientContext().
 * API: window.__AR_CONSULTOR.open()
 */
(function () {
  if (window.__AR_CONSULTOR) return;

  // Estos valores son inyectados por content.js al cargar
  const CFG = window.__AR_CFG || {};
  const SUPABASE_URL = CFG.SUPABASE_URL || "https://ehknxdrmeuojbgpbzchh.supabase.co";
  const SUPABASE_ANON = CFG.SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa254ZHJtZXVvamJncGJ6Y2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjg0MzQsImV4cCI6MjA5MzEwNDQzNH0.EdT9wFY10WlyFFapcpIpbkTz7yBPcj8nueMQeDgUxwA";
  const ENDPOINT = `${SUPABASE_URL}/functions/v1/consultor-ia`;

  const STORAGE_KEY = "ar_consultor_history_v1";
  const MODE_KEY = "ar_consultor_mode_v1";

  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function md(s) {
    // Markdown muy básico: bold, italic, code, listas, líneas
    let out = esc(s);
    out = out.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`);
    out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    out = out.replace(/\*(.+?)\*/g, "<i>$1</i>");
    out = out.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
    out = out.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
    out = out.replace(/\n/g, "<br>");
    return out;
  }

  function loadHistory() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
  function saveHistory(h) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-30))); } catch {} }
  function loadMode() { try { return localStorage.getItem(MODE_KEY) || "professional"; } catch { return "professional"; } }
  function saveMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch {} }

  let panel = null;
  let abortCtl = null;

  // Chips de preguntas rápidas según rol activo.
  // `pro` = modo profesional (con contexto del paciente). `pat` = modo paciente (lenguaje simple).
  const CHIPS_BY_ROLE = {
    medico: {
      pro: [
        ["Resumen caso", "Resume el caso de este paciente y sugiere conducta APS según guías MINSAL."],
        ["Controles GES", "¿Qué controles GES corresponden según diagnósticos y edad del paciente?"],
        ["Interpretar lab", "Interpreta los exámenes de laboratorio actuales y prioriza hallazgos críticos."],
        ["Ajuste fármacos", "Sugiere ajustes farmacológicos considerando función renal, hepática e interacciones."],
        ["Diagnóstico diferencial", "Plantea diagnósticos diferenciales relevantes para este paciente."],
        ["Derivación", "¿Corresponde derivación a especialidad? Justifica con criterios MINSAL."],
      ],
      pat: [
        ["¿Qué es DM2?", "¿Qué es la diabetes tipo 2 y cómo se controla?"],
        ["¿Qué es HTA?", "¿Qué es la hipertensión arterial y cuáles son los cuidados básicos?"],
      ],
    },
    enfermeria: {
      pro: [
        ["EMPA/EMPAM", "¿Qué evaluaciones del EMPA/EMPAM corresponden y cómo registro hallazgos?"],
        ["Curaciones", "Recomienda manejo y frecuencia de curación según tipo de herida."],
        ["PSCV control", "Plan de control PSCV según riesgo cardiovascular y compensación."],
        ["Educación paciente", "Sugiere puntos clave de educación al paciente y su familia."],
        ["Derivación médico", "¿Justifica derivación a médico hoy? Lista criterios."],
      ],
      pat: [
        ["Cuidados en casa", "Explica cuidados básicos en casa para este problema de salud."],
        ["Toma de medicamentos", "¿Cómo debo tomar correctamente mis medicamentos?"],
      ],
    },
    kine: {
      pro: [
        ["Plan kinésico", "Sugiere un plan kinésico inicial (objetivos, frecuencia, técnicas)."],
        ["Tinetti / Berg", "¿Qué escala de equilibrio aplico y cómo interpreto el puntaje?"],
        ["Sala IRA/ERA", "Indicaciones de manejo en sala IRA/ERA según edad y cuadro."],
        ["RBC domiciliaria", "Plan de Rehabilitación Basada en la Comunidad para este paciente."],
        ["Educación postura", "Educación postural y ejercicios para entregar al paciente."],
      ],
      pat: [
        ["Ejercicios casa", "Explica ejercicios simples que puedo hacer en casa."],
        ["¿Qué es kinesiología?", "¿Qué hace un kinesiólogo y cuándo debo consultar?"],
      ],
    },
    nutri: {
      pro: [
        ["Evaluación nutricional", "Evalúa estado nutricional según IMC, lab y diagnósticos."],
        ["Plan alimentario", "Plan alimentario sugerido según patología y edad."],
        ["Educación alimentaria", "Mensajes clave de educación alimentaria para entregar."],
        ["Lab y nutrición", "Interpreta lab desde la mirada nutricional (perfil lipídico, glicemia, etc.)."],
      ],
      pat: [
        ["Comer sano", "Consejos simples para comer más sano en el día a día."],
        ["Bajar de peso", "¿Cómo puedo bajar de peso de forma saludable?"],
      ],
    },
    odonto: {
      pro: [
        ["GES odontológicas", "¿Qué GES odontológicas aplican según edad/diagnóstico?"],
        ["Plan tratamiento", "Sugiere plan de tratamiento odontológico priorizado."],
        ["Receta odontológica", "Sugiere receta tipo (analgésico/antibiótico) según cuadro."],
        ["Educación higiene", "Mensajes de educación en higiene oral para el paciente."],
      ],
      pat: [
        ["Cuidado dientes", "¿Cómo cuido mis dientes y encías en casa?"],
        ["Dolor de muela", "Tengo dolor de muela, ¿qué puedo hacer mientras consulto?"],
      ],
    },
    tens: {
      pro: [
        ["Signos vitales", "Guía de toma e interpretación de signos vitales en APS."],
        ["Vacunatorio", "¿Qué vacunas corresponden según edad y PNI vigente?"],
        ["Curación simple", "Pasos de curación simple y materiales recomendados."],
        ["Derivación", "¿Cuándo derivo a enfermera o médico? Criterios."],
      ],
      pat: [
        ["¿Qué es PNI?", "¿Qué es el Programa Nacional de Inmunizaciones y por qué vacunarse?"],
      ],
    },
    psico: {
      pro: [
        ["PHQ-9 / GAD-7", "¿Cómo aplico e interpreto PHQ-9 y GAD-7?"],
        ["GES Depresión", "Plan de manejo según GES Depresión y severidad."],
        ["AUDIT", "¿Cómo aplico AUDIT y cuál es la conducta según puntaje?"],
        ["SOAP psico", "Estructura SOAP para registrar sesión psicológica."],
        ["Derivación COSAM", "¿Justifica derivación a COSAM? Criterios."],
      ],
      pat: [
        ["Manejo ansiedad", "Estrategias simples para manejar la ansiedad en el día a día."],
        ["Cuándo pedir ayuda", "¿Cuándo debo pedir ayuda en salud mental?"],
      ],
    },
  };

  function getCurrentRole() {
    try { return window.__AR_ROLE_ROUTER?.getRole?.() || localStorage.getItem("ar_role_v1") || "medico"; }
    catch { return "medico"; }
  }

  function getChipsFor(role, mode) {
    const conf = CHIPS_BY_ROLE[role] || CHIPS_BY_ROLE.medico;
    const list = mode === "patient" ? (conf.pat || []) : (conf.pro || []);
    return list.length ? list : (CHIPS_BY_ROLE.medico[mode === "patient" ? "pat" : "pro"]);
  }

  function renderChips() {
    const wrap = panel?.querySelector("#ar-cs-chips");
    if (!wrap) return;
    const mode = panel.querySelector('input[name="ar-cs-mode"]:checked')?.value || loadMode();
    const role = getCurrentRole();
    const chips = getChipsFor(role, mode);
    wrap.innerHTML = chips.map(([label, q]) =>
      `<button class="ar-cs-chip" data-q="${esc(q)}">${esc(label)}</button>`
    ).join("");
    wrap.querySelectorAll(".ar-cs-chip").forEach(b => {
      b.onclick = () => { const ta = panel.querySelector("#ar-cs-input"); ta.value = b.dataset.q; ta.focus(); };
    });
  }

  let roleListener = null;
  let patientListener = null;
  function close() {
    if (roleListener) { try { window.removeEventListener("ar:role-changed", roleListener); } catch {} roleListener = null; }
    if (patientListener) { try { window.removeEventListener("ar:patient-changed", patientListener); } catch {} patientListener = null; }
    panel?.remove();
    panel = null;
    abortCtl?.abort();
    abortCtl = null;
  }

  function open() {
    if (panel) { close(); return; }
    panel = document.createElement("div");
    panel.id = "ar-consultor";
    panel.style.cssText = "position:fixed;top:0;right:0;width:min(440px,95vw);height:100vh;background:#fff;border-left:1px solid #e2e8f0;box-shadow:-12px 0 36px rgba(0,0,0,.18);z-index:2147483646;display:flex;flex-direction:column;font-family:system-ui,sans-serif;color:#0f172a";
    const mode = loadMode();
    panel.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700;font-size:14px">🤖 Consultor IA</div>
          <div style="font-size:11px;color:#64748b">Powered by Lovable AI · Gemini</div>
        </div>
        <button id="ar-cs-x" style="border:0;background:#e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer">✕</button>
      </div>
      <div style="padding:8px 14px;border-bottom:1px solid #e2e8f0;display:flex;gap:6px;align-items:center;font-size:12px">
        <label><input type="radio" name="ar-cs-mode" value="professional" ${mode === "professional" ? "checked" : ""}> 🩺 Profesional <small style="color:#64748b">(con contexto del paciente)</small></label>
        <label style="margin-left:auto"><input type="radio" name="ar-cs-mode" value="patient" ${mode === "patient" ? "checked" : ""}> 👥 Paciente</label>
      </div>
      <div role="alert" style="padding:6px 14px;background:#fef9c3;border-bottom:1px solid #fde047;color:#713f12;font-size:11px;line-height:1.35">
        ⚠️ <b>La IA no diagnostica.</b> Sugerencia de apoyo — la decisión clínica final es del profesional tratante.
      </div>
      <div id="ar-cs-msgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#fafafa"></div>
      <div style="border-top:1px solid #e2e8f0;padding:10px 12px;background:#fff">
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:flex-start">
          <div id="ar-cs-chips" style="display:flex;gap:6px;flex-wrap:wrap;flex:1"></div>
          <button id="ar-cs-clear" style="border:0;background:#fee2e2;color:#991b1b;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;flex-shrink:0">Limpiar</button>
        </div>
        <div style="display:flex;gap:6px">
          <textarea id="ar-cs-input" rows="2" placeholder="Pregunta… (Enter envía, Shift+Enter salto de línea)" style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font-family:inherit;font-size:13px;resize:vertical"></textarea>
          <button id="ar-cs-send" style="background:#0ea5e9;color:#fff;border:0;border-radius:6px;padding:0 14px;cursor:pointer;font-weight:700">▶</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const styleId = "ar-cs-css";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        #ar-consultor .ar-cs-chip{font-size:11px;background:#e0f2fe;color:#075985;border:0;border-radius:12px;padding:3px 9px;cursor:pointer}
        #ar-consultor .ar-cs-chip:hover{background:#bae6fd}
        #ar-consultor .ar-cs-msg{padding:8px 10px;border-radius:8px;font-size:13px;line-height:1.4;max-width:92%}
        #ar-consultor .ar-cs-msg.user{background:#dbeafe;color:#1e3a8a;align-self:flex-end}
        #ar-consultor .ar-cs-msg.assistant{background:#fff;color:#0f172a;border:1px solid #e2e8f0;align-self:flex-start}
        #ar-consultor .ar-cs-msg.assistant pre{background:#0f172a;color:#e2e8f0;padding:8px;border-radius:4px;overflow:auto;font-size:11px}
        #ar-consultor .ar-cs-msg.assistant code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px}
        #ar-consultor .ar-cs-msg.error{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
        #ar-consultor .ar-cs-typing{display:inline-block;width:6px;height:6px;background:#0ea5e9;border-radius:50%;animation:ar-cs-blink 1s infinite}
        @keyframes ar-cs-blink{50%{opacity:.3}}
      `;
      document.head.appendChild(st);
    }

    panel.querySelector("#ar-cs-x").onclick = close;
    panel.querySelector("#ar-cs-clear").onclick = () => { saveHistory([]); renderHistory(); };
    panel.querySelectorAll('input[name="ar-cs-mode"]').forEach(r => {
      r.onchange = (e) => { saveMode(e.target.value); renderChips(); };
    });
    renderChips();
    roleListener = () => renderChips();
    patientListener = () => renderChips();
    window.addEventListener("ar:role-changed", roleListener);
    window.addEventListener("ar:patient-changed", patientListener);
    const ta = panel.querySelector("#ar-cs-input");
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    panel.querySelector("#ar-cs-send").onclick = send;

    renderHistory();
  }

  function renderHistory() {
    const box = panel?.querySelector("#ar-cs-msgs");
    if (!box) return;
    const h = loadHistory();
    if (!h.length) {
      box.innerHTML = `<div style="color:#64748b;text-align:center;padding:20px;font-size:12px">Pregunta lo que quieras sobre clínica APS, GES, o explica una enfermedad en lenguaje simple.<br><br>El modo <b>Profesional</b> incluye contexto sanitizado del paciente actual (sin RUT, nombre, ni teléfono).</div>`;
      return;
    }
    box.innerHTML = h.map(m => `<div class="ar-cs-msg ${m.role}">${m.role === "assistant" ? md(m.content) : esc(m.content)}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  }

  async function send() {
    const ta = panel.querySelector("#ar-cs-input");
    const text = ta.value.trim();
    if (!text) return;
    ta.value = "";
    const mode = panel.querySelector('input[name="ar-cs-mode"]:checked').value;
    const history = loadHistory();
    history.push({ role: "user", content: text });
    saveHistory(history);
    renderHistory();

    const box = panel.querySelector("#ar-cs-msgs");
    const aBox = document.createElement("div");
    aBox.className = "ar-cs-msg assistant";
    aBox.innerHTML = '<span class="ar-cs-typing"></span>';
    box.appendChild(aBox);
    box.scrollTop = box.scrollHeight;

    let assistantText = "";
    abortCtl = new AbortController();
    if (window.__AR_CONSENT && !window.__AR_CONSENT.allows("consultorIA")) {
      aBox.className = "ar-cs-msg error";
      aBox.textContent = "Activa el consentimiento profesional en el popup (pestaña Privacidad) para usar el Consultor IA.";
      return;
    }
    try {
      const sanitizedContext = mode === "professional" && window.__AR_PII
        ? window.__AR_PII.buildPatientContext() : null;
      const role = (function () { try { return localStorage.getItem("ar_role_v1") || "medico"; } catch { return "medico"; } })();

      // Auditoría inmutable: registrar consulta IA (pregunta sanitizada, sin respuesta hasta cierre).
      try {
        if (window.__AR_AUDIT) {
          const sanitizedQ = window.__AR_PII ? window.__AR_PII.scrub(text) : text;
          const phash = (function () {
            try {
              const rut = window.__AR_PATIENT?.extract?.()?.rut;
              return window.__AR_PATIENT_HASH ? window.__AR_PATIENT_HASH.hashRut(rut) : null;
            } catch { return null; }
          })();
          window.__AR_AUDIT.log({
            event_type: "ai_consult",
            source: "consultor",
            rule_id: `consultor:${mode}:${role}`,
            patient_hash: phash,
            evidence: {
              mode, role,
              question: sanitizedQ.slice(0, 800),
              hasPatientContext: !!sanitizedContext,
            },
          });
        }
      } catch (_) {}

      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({
          messages: history.map(m => ({
            role: m.role,
            // Sanitiza contenido del USUARIO (asistente nunca lleva PII).
            content: m.role === "user" && window.__AR_PII ? window.__AR_PII.scrub(m.content) : m.content,
          })),
          mode, sanitizedContext, role,
        }),
        signal: abortCtl.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Error desconocido" }));
        aBox.className = "ar-cs-msg error";
        aBox.textContent = err.error || `Error ${resp.status}`;
        window.__AR_LOG?.error("E_AI_FETCH", `gateway ${resp.status}`, null, { mode, role, status: resp.status });
        return;
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: rdDone } = await reader.read();
        if (rdDone) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              assistantText += c;
              aBox.innerHTML = md(assistantText);
              box.scrollTop = box.scrollHeight;
            }
          } catch {
            buf = line + "\n" + buf; break;
          }
        }
      }
      if (assistantText) {
        history.push({ role: "assistant", content: assistantText });
        saveHistory(history);
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      aBox.className = "ar-cs-msg error";
      aBox.textContent = "Error de red: " + (e?.message || e);
      window.__AR_LOG?.error("E_AI_FETCH", "fetch failed", e, { mode });
    } finally {
      abortCtl = null;
    }
  }

  window.__AR_CONSULTOR = { open, close };
})();
