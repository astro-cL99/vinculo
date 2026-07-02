/* Vínculo — Módulo de feedback estructurado (Fase 5)
 *
 * Botón flotante 💬 + modal con formulario. Envía a la API REST de Lovable Cloud
 * vía PostgREST con la anon key (RLS valida tipo, severidad, longitudes).
 * Antes de enviar:
 *  - sanitiza con __AR_PII.scrub
 *  - adjunta ext_version + ruleset_composite + role + user-agent abreviado
 *  - requiere consent.allows("consultorIA") (mismo permiso de red)
 */
(function () {
  if (window.__AR_FEEDBACK) return;

  const SB_URL = "https://ehknxdrmeuojbgpbzchh.supabase.co";
  const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa254ZHJtZXVvamJncGJ6Y2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjg0MzQsImV4cCI6MjA5MzEwNDQzNH0.EdT9wFY10WlyFFapcpIpbkTz7yBPcj8nueMQeDgUxwA";

  const TYPES = [
    ["bug", "🐛 Bug"],
    ["idea", "💡 Idea"],
    ["usability", "🎯 Usabilidad"],
    ["clinical", "⚕️ Clínico"],
    ["performance", "⚡ Rendimiento"],
    ["other", "📝 Otro"],
  ];
  const SEV = [["low", "Baja"], ["med", "Media"], ["high", "Alta"], ["critical", "Crítica"]];

  function getRole() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.get({ ar_role: "medico" }, function (r) { resolve(r.ar_role || "medico"); });
      } catch (_) { resolve("medico"); }
    });
  }

  async function getRulesetComposite() {
    try {
      if (window.__AR_RULESET_VERSION?.compute) {
        const r = await window.__AR_RULESET_VERSION.compute();
        return r.composite;
      }
    } catch (_) {}
    return null;
  }

  function extVersion() {
    try { return chrome.runtime.getManifest().version; } catch (_) { return null; }
  }

  function sanitize(s) {
    if (!s) return s;
    if (window.__AR_PII?.scrub) return window.__AR_PII.scrub(String(s));
    return String(s);
  }

  async function submit(payload) {
    if (window.__AR_CONSENT && !window.__AR_CONSENT.allows("consultorIA")) {
      throw new Error("Activa el consentimiento profesional en el popup para enviar feedback.");
    }
    const body = {
      type: payload.type,
      severity: payload.severity,
      title: sanitize(payload.title).slice(0, 200),
      description: sanitize(payload.description).slice(0, 4000),
      ext_version: extVersion(),
      ruleset_composite: await getRulesetComposite(),
      role: await getRole(),
      source: "extension",
      user_agent: navigator.userAgent.replace(/\d+\.\d+\.\d+(\.\d+)?/g, "X.X.X").slice(0, 200),
    };
    const resp = await fetch(SB_URL + "/rest/v1/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_ANON,
        Authorization: "Bearer " + SB_ANON,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(function () { return ""; });
      throw new Error("Error " + resp.status + ": " + txt.slice(0, 200));
    }
  }

  // ---------- UI ----------
  let modalEl = null;
  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
  }

  function openModal() {
    if (modalEl) return;
    if (window.__AR_CONSENT && !window.__AR_CONSENT.isAccepted()) {
      alert("Acepta el consentimiento profesional antes de enviar feedback.");
      return;
    }
    const wrap = document.createElement("div");
    wrap.id = "ar-fb-modal";
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;font:13px/1.5 system-ui,-apple-system,sans-serif";
    wrap.innerHTML =
      '<div style="background:white;color:#0f172a;border-radius:12px;width:min(92vw,460px);padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.3)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
          '<b style="font-size:15px">💬 Enviar feedback al equipo</b>' +
          '<button id="ar-fb-x" style="background:none;border:0;font-size:18px;cursor:pointer;color:#64748b">×</button>' +
        '</div>' +
        '<div style="display:grid;gap:8px">' +
          '<div style="display:flex;gap:8px">' +
            '<select id="ar-fb-type" style="flex:1;padding:6px;border:1px solid #e2e8f0;border-radius:6px;font:inherit">' +
              TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join("") +
            '</select>' +
            '<select id="ar-fb-sev" style="flex:1;padding:6px;border:1px solid #e2e8f0;border-radius:6px;font:inherit">' +
              SEV.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === "med" ? " selected" : "") + '>' + s[1] + '</option>'; }).join("") +
            '</select>' +
          '</div>' +
          '<input id="ar-fb-title" placeholder="Título breve (5–200 caracteres)" maxlength="200" style="padding:7px;border:1px solid #e2e8f0;border-radius:6px;font:inherit"/>' +
          '<textarea id="ar-fb-desc" placeholder="Describe lo que pasa, qué esperabas, pasos para reproducir…" rows="5" maxlength="4000" style="padding:7px;border:1px solid #e2e8f0;border-radius:6px;font:inherit;resize:vertical"></textarea>' +
          '<div style="font-size:11px;color:#64748b">No incluyas RUT ni nombres del paciente. El sistema sanitiza automáticamente, pero ayuda no escribirlos.</div>' +
          '<div id="ar-fb-msg" style="font-size:12px;min-height:16px"></div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px">' +
            '<button id="ar-fb-cancel" style="background:transparent;color:#64748b;border:1px solid #e2e8f0;padding:7px 14px;border-radius:6px;cursor:pointer;font:inherit">Cancelar</button>' +
            '<button id="ar-fb-send" style="background:linear-gradient(135deg,#0ea5a4,#0284c7);color:white;border:0;padding:7px 16px;border-radius:6px;cursor:pointer;font:inherit;font-weight:600">Enviar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    modalEl = wrap;
    wrap.querySelector("#ar-fb-x").onclick = closeModal;
    wrap.querySelector("#ar-fb-cancel").onclick = closeModal;
    wrap.addEventListener("click", function (e) { if (e.target === wrap) closeModal(); });
    wrap.querySelector("#ar-fb-send").onclick = async function () {
      const type = wrap.querySelector("#ar-fb-type").value;
      const severity = wrap.querySelector("#ar-fb-sev").value;
      const title = wrap.querySelector("#ar-fb-title").value.trim();
      const description = wrap.querySelector("#ar-fb-desc").value.trim();
      const msg = wrap.querySelector("#ar-fb-msg");
      if (title.length < 3) { msg.textContent = "Título muy corto"; msg.style.color = "#dc2626"; return; }
      if (description.length < 5) { msg.textContent = "Descripción muy corta"; msg.style.color = "#dc2626"; return; }
      msg.textContent = "Enviando…"; msg.style.color = "#64748b";
      try {
        await submit({ type, severity, title, description });
        msg.textContent = "✓ Enviado, gracias";
        msg.style.color = "#16a34a";
        setTimeout(closeModal, 900);
      } catch (e) {
        msg.textContent = "Error: " + (e?.message || e);
        msg.style.color = "#dc2626";
      }
    };
  }

  function mountButton() {
    if (document.getElementById("ar-fb-fab")) return;
    if (!document.body) return;
    const btn = document.createElement("button");
    btn.id = "ar-fb-fab";
    btn.title = "Enviar feedback al equipo Vínculo";
    btn.textContent = "💬";
    btn.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:2147483640",
      "width:44px", "height:44px", "border-radius:50%", "border:0",
      "background:linear-gradient(135deg,#0ea5a4,#0284c7)", "color:white",
      "font-size:20px", "cursor:pointer", "box-shadow:0 6px 18px rgba(2,132,199,.35)",
    ].join(";");
    btn.onclick = openModal;
    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton, { once: true });
  } else {
    mountButton();
  }

  window.__AR_FEEDBACK = { open: openModal, submit: submit };
})();
