/* Vínculo — Popup script
 * Gestor de datos clínicos locales (renal, sickday, flujogramas).
 * No accede a Rayen, solo a chrome.storage.local.
 */
(function () {
  const STORE_KEY = "clinical_overrides";
  const $ = (s) => document.querySelector(s);
  const toast = (msg, kind) => {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    setTimeout(() => { t.className = "toast"; }, 2400);
  };

  // Tabs
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("on"));
      document.querySelectorAll(".panel").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      $("#tab-" + b.dataset.tab).classList.add("on");
    };
  });

  // Selector de rol — sincroniza con chrome.storage.sync para que content.js lo aplique
  const roleSel = $("#role-select");
  const patBox = $("#patient-role-box");
  const patSel = $("#patient-role-select");
  const patName = $("#pat-name");
  const patEff = $("#pat-effective");
  let currentRut = null;

  const ROLE_LABELS = {
    medico: "👨‍⚕️ Médico", enfermeria: "💉 Enfermería", kine: "🦵 Kinesiología",
    nutri: "🥗 Nutrición", odonto: "🦷 Odontología", tens: "🩹 TENS", psico: "🧠 Psicología",
  };

  async function askRoleInfo() {
    try {
      const tabs = await chrome.tabs.query({ url: "https://clinico.rayenaps.cl/*" });
      for (const t of tabs) {
        try {
          const r = await chrome.tabs.sendMessage(t.id, { type: "AR_ROLE_INFO" });
          if (r) return { tabId: t.id, ...r };
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  async function refreshRoleUi() {
    chrome.storage.sync.get({ ar_role: "medico" }, (res) => {
      if (roleSel) roleSel.value = res.ar_role || "medico";
    });
    const info = await askRoleInfo();
    if (info && info.rut) {
      currentRut = info.rut;
      patBox.style.display = "block";
      patName.textContent = info.patientName || info.rut;
      patSel.value = info.patientRole || "";
      patEff.textContent = ROLE_LABELS[info.effectiveRole] || info.effectiveRole;
      patSel.dataset.tabId = String(info.tabId);
    } else {
      currentRut = null;
      patBox.style.display = "none";
    }
  }

  if (roleSel) {
    roleSel.onchange = async () => {
      chrome.storage.sync.set({ ar_role: roleSel.value });
      toast("✓ Rol actualizado: " + roleSel.options[roleSel.selectedIndex].text, "ok");
      // Vuelve a leer info para refrescar "rol efectivo"
      setTimeout(refreshRoleUi, 200);
    };
  }
  if (patSel) {
    patSel.onchange = async () => {
      if (!currentRut) return;
      const tabId = Number(patSel.dataset.tabId);
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "AR_SET_PATIENT_ROLE", rut: currentRut, role: patSel.value || null,
        });
        toast(patSel.value ? "✓ Rol asignado al paciente" : "✓ Override eliminado", "ok");
      } catch (e) { toast("Error: " + e.message, "err"); }
      setTimeout(refreshRoleUi, 200);
    };
  }

  refreshRoleUi();

  // Carga datos embebidos del manifest + overrides para mostrar conteos
  async function refresh() {
    const [{ [STORE_KEY]: ov }, manifest] = await Promise.all([
      chrome.storage.local.get({ [STORE_KEY]: null }),
      Promise.resolve(chrome.runtime.getManifest()),
    ]);
    $("#ver").textContent = "v" + manifest.version;

    // Para conocer los conteos "fábrica" sin cargar todo el bundle de 70KB en
    // el popup, le pedimos a un content script si está activo. Si no hay tab
    // de Rayen abierto, mostramos solo los counts de overrides.
    const factoryFromTab = await askActiveTab();
    const factory = factoryFromTab?.factoryCounts || { renal: "—", sickday: "—", flows: "—" };
    const cur = factoryFromTab?.counts || {
      renal: ov?.renal?.length ?? "—",
      sickday: ov?.sickday?.length ?? "—",
      flows: ov?.flows?.length ?? "—",
    };

    setStat("s-renal", cur.renal, ov?.renal, factory.renal);
    setStat("s-sick", cur.sickday, ov?.sickday, factory.sickday);
    setStat("s-flows", cur.flows, ov?.flows, factory.flows);

    $("#dver").textContent = ov?.version || (factoryFromTab?.version || "fábrica");
    $("#dupd").textContent = ov?.updatedAt
      ? new Date(ov.updatedAt).toLocaleString("es-CL")
      : "nunca (usando datos de fábrica)";
  }

  function setStat(id, val, ovArr, factory) {
    const el = $("#" + id);
    el.querySelector("b").textContent = val ?? "—";
    el.classList.toggle("custom", Array.isArray(ovArr) && ovArr.length > 0);
    const sub = el.querySelector("span");
    const base = sub.textContent.split(" · ")[0];
    if (Array.isArray(ovArr) && ovArr.length > 0) {
      sub.textContent = base + " · personalizado";
    } else if (typeof factory === "number") {
      sub.textContent = base;
    }
  }

  async function askActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ url: "https://clinico.rayenaps.cl/*" });
      for (const t of tabs) {
        try {
          const r = await chrome.tabs.sendMessage(t.id, { type: "AR_DATA_STATUS" });
          if (r) return r;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  // Importar
  $("#btn-import").onclick = () => $("#file-import").click();
  $("#file-import").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const json = JSON.parse(txt);
      const result = await importBundle(json);
      toast(`✓ Importado: ${result.touched} sección(es)`, "ok");
      refresh();
    } catch (err) {
      toast("Error: " + (err.message || err), "err");
    } finally {
      e.target.value = "";
    }
  };

  async function importBundle(json) {
    const SECTIONS = ["renal", "sickday", "flows"];
    if (!json || typeof json !== "object") throw new Error("JSON inválido");
    const { [STORE_KEY]: current = {} } = await chrome.storage.local.get({ [STORE_KEY]: {} });
    const next = { ...current };
    let touched = 0;
    for (const k of SECTIONS) {
      if (Array.isArray(json[k])) {
        next[k] = json[k];
        touched++;
      }
    }
    if (!touched) throw new Error("No hay secciones reconocibles (renal/sickday/flows).");
    next.updatedAt = new Date().toISOString();
    if (json.version) next.version = json.version;
    if (json.label) next.label = json.label;
    await chrome.storage.local.set({ [STORE_KEY]: next });
    return { touched };
  }

  // Exportar = pedimos al content-script el snapshot actual; si no hay tab,
  // exportamos solo los overrides guardados.
  $("#btn-export").onclick = async () => {
    let bundle = await askActiveTab().then((s) => s?.bundle);
    if (!bundle) {
      const { [STORE_KEY]: ov } = await chrome.storage.local.get({ [STORE_KEY]: {} });
      bundle = {
        version: ov?.version || "overrides-only",
        exportedAt: new Date().toISOString(),
        renal: ov?.renal || [],
        sickday: ov?.sickday || [],
        flows: ov?.flows || [],
        note: "Exportado sin tab activo de Rayen — solo contiene overrides guardados.",
      };
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `asistente-rayen-datos-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("✓ Bundle exportado", "ok");
  };

  // Reset por sección
  document.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.onclick = async () => {
      const sec = btn.dataset.reset;
      if (!confirm(`¿Restaurar ${sec} a los datos de fábrica? Se perderán los cambios locales.`)) return;
      const { [STORE_KEY]: cur } = await chrome.storage.local.get({ [STORE_KEY]: {} });
      if (cur && sec in cur) {
        delete cur[sec];
        cur.updatedAt = new Date().toISOString();
        await chrome.storage.local.set({ [STORE_KEY]: cur });
      }
      toast("✓ " + sec + " restaurado", "ok");
      refresh();
    };
  });

  $("#btn-reset-all").onclick = async () => {
    if (!confirm("¿Restaurar TODOS los datos clínicos a fábrica? Plantillas y flujos grabados se mantienen.")) return;
    await chrome.storage.local.remove(STORE_KEY);
    toast("✓ Datos clínicos restaurados", "ok");
    refresh();
  };

  // === Diagnóstico (logs anonimizados) ===
  const LOG_KEY = "__AR_LOG_BUFFER__";

  async function refreshDiag() {
    const { [LOG_KEY]: buf = [] } = await chrome.storage.local.get({ [LOG_KEY]: [] });
    const byCode = {}; const byLevel = {};
    for (const e of buf) {
      byCode[e.code] = (byCode[e.code] || 0) + 1;
      byLevel[e.level] = (byLevel[e.level] || 0) + 1;
    }
    $("#d-total").textContent = buf.length;
    $("#d-err").textContent = byLevel.error || 0;
    $("#d-warn").textContent = byLevel.warn || 0;
    $("#d-oldest").textContent = buf[0] ? new Date(buf[0].ts).toLocaleString("es-CL") : "—";
    $("#d-newest").textContent = buf.at(-1) ? new Date(buf.at(-1).ts).toLocaleString("es-CL") : "—";
    const codes = Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 8);
    $("#d-codes").innerHTML = codes.length
      ? codes.map(([c, n]) => `<div>${c.padEnd(18, " ")} ${n}</div>`).join("")
      : "<i>Sin entradas</i>";
  }

  $("#btn-export-log").onclick = async () => {
    const { [LOG_KEY]: buf = [] } = await chrome.storage.local.get({ [LOG_KEY]: [] });
    const manifest = chrome.runtime.getManifest();
    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        extensionVersion: manifest.version,
        totalEntries: buf.length,
        note: "Trazas anonimizadas. Sin RUT, nombre, ni datos del paciente.",
      },
      entries: buf,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `asistente-rayen-diagnostico-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("✓ Log exportado", "ok");
  };

  $("#btn-clear-log").onclick = async () => {
    if (!confirm("¿Borrar todas las entradas de diagnóstico?")) return;
    await chrome.storage.local.set({ [LOG_KEY]: [] });
    toast("✓ Log limpiado", "ok");
    refreshDiag();
  };

  // === Privacidad (Fase 3) ===
  const CONSENT_KEY = "ar_consent";
  const SALT_KEY = "ar_patient_salt";
  const FEATURE_LABELS = {
    logger: "Logs anonimizados",
    harvester: "Harvester de actividades",
    patientHash: "Hash anónimo del paciente",
    evidencia: "Evidencia MINSAL/GES",
    consultorIA: "Consultor IA",
  };

  async function refreshPriv() {
    const { [CONSENT_KEY]: cons, [SALT_KEY]: salt } = await chrome.storage.local.get([CONSENT_KEY, SALT_KEY]);
    const status = $("#cons-status");
    const date = $("#cons-date");
    if (cons?.accepted) {
      status.textContent = "✓ Aceptado (v" + cons.version + ")";
      status.style.color = "var(--ok)";
      date.textContent = "Aceptado: " + new Date(cons.acceptedAt).toLocaleString("es-CL");
    } else if (cons?.declined) {
      status.textContent = "✗ Rechazado";
      status.style.color = "var(--err)";
      date.textContent = "Rechazado: " + new Date(cons.declinedAt).toLocaleString("es-CL");
    } else {
      status.textContent = "⏳ Pendiente";
      status.style.color = "var(--warn)";
      date.textContent = "El banner aparecerá la próxima vez que abras Rayen.";
    }

    const feats = (cons && cons.features) || {};
    const cont = $("#cons-features");
    cont.innerHTML = "";
    Object.keys(FEATURE_LABELS).forEach((k) => {
      const checked = feats[k] !== false && !!cons?.accepted;
      const row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
      row.innerHTML = '<input type="checkbox" ' + (checked ? "checked" : "") +
        (cons?.accepted ? "" : " disabled") +
        ' data-feat="' + k + '"/>' + FEATURE_LABELS[k];
      cont.appendChild(row);
    });
    cont.querySelectorAll("input[data-feat]").forEach((cb) => {
      cb.onchange = async () => {
        const { [CONSENT_KEY]: c } = await chrome.storage.local.get([CONSENT_KEY]);
        if (!c?.accepted) return;
        c.features = c.features || {};
        c.features[cb.dataset.feat] = cb.checked;
        await chrome.storage.local.set({ [CONSENT_KEY]: c });
        toast("✓ Permisos actualizados", "ok");
      };
    });

    $("#ph-algo").textContent = "SHA-256 (v1)";
    $("#ph-salt").textContent = salt ? salt.slice(0, 8) + "… (" + salt.length + " hex)" : "se generará en primer uso";

    // Ruleset version vía content script
    const rs = await askRuleset();
    if (rs) {
      $("#rs-composite").textContent = rs.composite;
      const p = rs.parts || {};
      $("#rs-parts").innerHTML =
        "ext: " + (p.extension || "?") + " · " +
        "ges: " + (p.gesChecks?.count ?? "—") + " · " +
        "evidencia: " + (p.evidencia?.version || "—") + " · " +
        "lab: " + (p.labCritical?.count ?? "—");
    } else {
      $("#rs-composite").textContent = "abre clinico.rayenaps.cl para calcular";
      $("#rs-parts").textContent = "";
    }
  }

  async function askRuleset() {
    try {
      const tabs = await chrome.tabs.query({ url: "https://clinico.rayenaps.cl/*" });
      for (const t of tabs) {
        try {
          const r = await chrome.tabs.sendMessage(t.id, { type: "AR_RULESET_VERSION" });
          if (r) return r;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  $("#btn-cons-review").onclick = async () => {
    if (!confirm("Esto reabre el banner de consentimiento la próxima vez que cargues Rayen. ¿Continuar?")) return;
    await chrome.storage.local.remove(CONSENT_KEY);
    toast("✓ Consentimiento reseteado", "ok");
    refreshPriv();
  };

  $("#btn-rotate-salt").onclick = async () => {
    if (!confirm("Rotar la sal invalidará TODOS los hashes anónimos previos. ¿Continuar?")) return;
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    let hex = "";
    for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
    await chrome.storage.local.set({ [SALT_KEY]: hex });
    toast("✓ Sal rotada", "ok");
    refreshPriv();
  };

  refresh();
  refreshDiag();
  refreshPriv();
})();
