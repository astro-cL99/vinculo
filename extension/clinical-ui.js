/* Vínculo — Panel de recursos clínicos.
 * Construye el modal con tabs: Diagnósticos sugeridos, Pediatría (dosis x kg),
 * Fármacos en uso, Flujogramas y Recordatorios.
 *
 * Depende de window.__AR_CLINICAL, __AR_PEDS, __AR_DX, __AR_DRUG y de helpers
 * expuestos por content.js: __AR_HOST.{getLabSession, getContext, pasteIntoActive, toast}.
 */
(function () {
  if (window.__AR_CLINICAL_UI) return;

  const H = () => window.__AR_HOST || {};
  const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let modal = null;
  function close() { if (modal) { modal.remove(); modal = null; } }

  function open(initialTab) {
    if (modal) { close(); return; }
    modal = document.createElement("div");
    modal.id = "ar-clin";
    modal.innerHTML = `
      <div class="ar-clin-card">
        <header>
          <strong>📚 Recursos clínicos</strong>
          <button class="ar-clin-close" type="button" title="Cerrar">✕</button>
        </header>
        <nav class="ar-clin-tabs">
          <button data-tab="dx">🩺 Dx sugeridos</button>
          <button data-tab="peds">🍼 Pediatría (mg/kg)</button>
          <button data-tab="arsenal">💉 Arsenal CESFAM</button>
          <button data-tab="pharmacy">🧾 Farmacia</button>
          <button data-tab="interact">⚠ Interacciones</button>
          <button data-tab="drugs">💊 Fármacos en ficha</button>
          <button data-tab="embarazo">🤰 Embarazo (FDA)</button>
          <button data-tab="docs">📄 Documentos</button>
          <button data-tab="flows">🗺 Flujogramas</button>
          <button data-tab="pac">❤️ Vías PAC</button>
          <button data-tab="ges">🩺 GES/AUGE</button>
          <button data-tab="gpc">📚 GPC MINSAL</button>
          <button data-tab="calc">🧮 Calculadoras</button>
          <button data-tab="reminders">⏰ Recordatorios</button>
        </nav>
        <div class="ar-clin-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector(".ar-clin-close").onclick = close;
    // Cerrar SOLO con la "X" — no con click fuera del recuadro
    modal.querySelectorAll(".ar-clin-tabs button").forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.tab;
        if (t === "ges" && typeof window.__AR_AUGE_OPEN === "function") { close(); window.__AR_AUGE_OPEN(); return; }
        if (t === "gpc" && window.__AR_GPC?.openPanel) { close(); window.__AR_GPC.openPanel(); return; }
        switchTab(t);
      };
    });
    switchTab(initialTab || "dx");
  }

  function switchTab(name) {
    if (!modal) return;
    modal.querySelectorAll(".ar-clin-tabs button").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === name),
    );
    const body = modal.querySelector(".ar-clin-body");
    body.innerHTML = "";
    if (name === "dx") renderDx(body);
    else if (name === "peds") renderPeds(body);
    else if (name === "arsenal") renderArsenal(body);
    else if (name === "pharmacy") renderPharmacy(body);
    else if (name === "interact") renderInteractions(body);
    else if (name === "drugs") renderDrugs(body);
    else if (name === "embarazo") renderEmbarazo(body);
    else if (name === "docs") renderDocsRoot(body);
    else if (name === "flows") renderFlows(body);
    else if (name === "pac") { if (window.__AR_PAC?.renderInto) window.__AR_PAC.renderInto(body); else body.innerHTML = `<div class="ar-clin-empty">Módulo de Vías PAC no cargado.</div>`; }
    else if (name === "calc") renderCalculators(body);
    else if (name === "reminders") renderReminders(body);
  }

  // ---------- Embarazo (Guía FDA SSASUR) ----------
  function renderEmbarazo(body) {
    const E = window.__AR_EMBARAZO;
    if (!E) {
      body.innerHTML = `<div class="ar-clin-empty">Guía de embarazo no disponible.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="ar-emb-wrap">
        <div class="ar-clin-row" style="gap:8px;flex-wrap:wrap;align-items:center">
          <input type="search" id="ar-emb-q" class="ar-clin-search" placeholder="Buscar fármaco (paracetamol, ibuprofeno, ácido valproico...)" autocomplete="off"/>
          <span class="ar-arsenal-count" id="ar-emb-count">cargando…</span>
        </div>
        <div id="ar-emb-legend" class="ar-emb-legend"></div>
        <div id="ar-emb-list" class="ar-emb-list"></div>
        <p class="ar-clin-hint">📖 Fuente: 8° Guía Clínica "Medicamentos en el Embarazo" — Servicio de Salud Araucanía Sur (clasificación FDA A/B/C/D/X). Consultar siempre el contexto clínico antes de prescribir.</p>
      </div>`;
    const inp = body.querySelector("#ar-emb-q");
    const list = body.querySelector("#ar-emb-list");
    const count = body.querySelector("#ar-emb-count");
    const legend = body.querySelector("#ar-emb-legend");

    function renderLegend() {
      const cats = E.CATEGORIAS || {};
      legend.innerHTML = Object.entries(cats).map(([k, v]) =>
        `<span class="ar-emb-chip" style="background:${v.color}1a;color:${v.color};border-color:${v.color}55">
          <b>${escapeHtml(k)}</b> ${escapeHtml((v.label || "").replace(/^Categoría [A-Z]\s*—\s*/, ""))}
        </span>`).join("");
    }

    function draw() {
      const q = (inp.value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const all = E.ALL || [];
      const filt = !q ? all : all.filter((f) => {
        const n = (f.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return n.includes(q);
      });
      count.textContent = `${filt.length} de ${all.length}`;
      if (!filt.length) { list.innerHTML = `<div class="ar-clin-empty">Sin coincidencias.</div>`; return; }
      list.innerHTML = filt.slice(0, 300).map((f) => {
        const meta = E.CATEGORIAS?.[f.category] || {};
        const color = meta.color || "#94a3b8";
        const extra = [];
        if (f.thirdTrimester) extra.push(`3° trim.: <b>${escapeHtml(f.thirdTrimester)}</b>`);
        if (f.altCategory) extra.push(`Alt.: <b>${escapeHtml(f.altCategory)}</b>`);
        const note = f.note ? `<div class="ar-emb-note">${escapeHtml(f.note)}</div>` : "";
        const pasteText = `${f.name} — Embarazo categoría ${f.category}${f.thirdTrimester ? ` (3° trim. ${f.thirdTrimester})` : ""}${f.note ? `. ${f.note}` : ""}`;
        return `<div class="ar-emb-row" style="--emb-c:${color}">
          <div class="ar-emb-head">
            <span class="ar-emb-cat" style="background:${color};color:#fff">${escapeHtml(f.category)}</span>
            <b class="ar-emb-name">${escapeHtml(f.name)}</b>
            ${extra.length ? `<span class="ar-emb-extra">${extra.join(" · ")}</span>` : ""}
            <button class="ar-btn ar-emb-paste" data-txt="${escapeHtml(pasteText)}">📋 Pegar</button>
          </div>
          ${note}
        </div>`;
      }).join("");
      list.querySelectorAll(".ar-emb-paste").forEach((b) => {
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.onclick = () => H().pasteIntoActive?.(b.dataset.txt);
      });
    }
    inp.oninput = draw;
    E.ready.then(() => { renderLegend(); draw(); });
  }

  // ---------- Dx sugeridos ----------
  function renderDx(body) {
    const lab = H().getLabSession?.();
    const ctx = H().getContext?.() || {};
    if (!lab || !lab.analytes) {
      body.innerHTML = `<div class="ar-clin-empty">Sin exámenes extraídos. Pulsa <b>🧪 Lab</b> primero.</div>`;
      return;
    }
    const sex = guessSex(ctx, lab);
    const sexCtl = `<label class="ar-clin-sex">Sexo: 
      <select id="ar-dx-sex">
        <option value="">— auto —</option>
        <option value="M" ${sex === "M" ? "selected" : ""}>Hombre</option>
        <option value="F" ${sex === "F" ? "selected" : ""}>Mujer</option>
      </select></label>`;
    body.innerHTML = `<div class="ar-clin-row">${sexCtl}<button class="ar-btn" id="ar-dx-paste-all">📋 Pegar todos</button></div><div id="ar-dx-list"></div>`;
    const sel = body.querySelector("#ar-dx-sex");
    const list = body.querySelector("#ar-dx-list");
    const draw = () => {
      const sx = sel.value || sex;
      const dxs = window.__AR_DX.fromLabs(lab.analytes, { sex: sx });
      if (!dxs.length) { list.innerHTML = `<div class="ar-clin-empty">Sin diagnósticos sugeridos para los valores actuales.</div>`; return; }
      list.innerHTML = dxs.map((d) => `
        <div class="ar-dx-item ar-sev-${d.severity}">
          <div class="ar-dx-h">
            <span class="ar-dx-cie">${escapeHtml(d.cie10)}</span>
            <span class="ar-dx-label">${escapeHtml(d.label)}</span>
            <button class="ar-btn ar-dx-paste" data-txt="${escapeHtml(d.cie10 + " " + d.label)}">Pegar</button>
          </div>
          <div class="ar-dx-basis">${escapeHtml(d.basis)}</div>
        </div>`).join("");
      list.querySelectorAll(".ar-dx-paste").forEach((b) => {
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.onclick = () => H().pasteIntoActive?.(b.dataset.txt);
      });
    };
    sel.onchange = draw;
    body.querySelector("#ar-dx-paste-all").onclick = () => {
      const sx = sel.value || sex;
      const dxs = window.__AR_DX.fromLabs(lab.analytes, { sex: sx });
      const txt = dxs.map((d) => `${d.cie10} ${d.label}`).join("\n");
      H().pasteIntoActive?.(txt);
    };
    draw();
  }

  function guessSex(ctx, lab) {
    const txt = (ctx.patient || "") + " " + (ctx.section || "");
    if (/femenin|mujer/i.test(txt)) return "F";
    if (/masculin|hombre|varón|varon/i.test(txt)) return "M";
    return null;
  }

  // ---------- Pediatría: dosis por kg ----------
  function renderPeds(body) {
    const drugs = window.__AR_PEDS?.PEDS_DRUGS || [];
    if (!drugs.length) {
      body.innerHTML = `<div class="ar-clin-empty">Catálogo pediátrico no disponible.</div>`;
      return;
    }
    // Categorías para agrupar el selector
    const cats = [...new Set(drugs.map((d) => d.category))];
    const optsHtml = cats
      .map((cat) => `<optgroup label="${escapeHtml(cat)}">` +
        drugs.filter((d) => d.category === cat)
          .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("") +
        `</optgroup>`).join("");

    const vitals = window.__AR_VITALS?.read?.() || {};
    const autoW = vitals.weightKg ? String(vitals.weightKg) : "";
    const autoAge = vitals.ageMonths != null ? String(Math.round(vitals.ageMonths)) : "";
    const autoBadge = (autoW || autoAge)
      ? `<div class="ar-peds-auto">🧠 Auto-detectado de la ficha:${autoW ? ` <b>${escapeHtml(autoW)} kg</b>` : ""}${autoAge ? ` · <b>${escapeHtml(autoAge)} meses</b>` : ""}${vitals.bmi ? ` · IMC ${vitals.bmi}` : ""}<button type="button" id="ar-peds-refresh" class="ar-btn-mini" title="Releer ficha">🔄</button></div>`
      : `<div class="ar-peds-auto ar-peds-auto-empty">🧠 No detecté peso/edad en la ficha activa. Ingrésalos manualmente. <button type="button" id="ar-peds-refresh" class="ar-btn-mini">🔄 Reintentar</button></div>`;

    body.innerHTML = `
      ${autoBadge}
      <div class="ar-peds-search-wrap">
        <input id="ar-peds-search" class="ar-clin-search" type="search" autocomplete="off"
          placeholder="🔎 Buscar fármaco (paracetamol, amoxi, ibu...)"/>
        <div id="ar-peds-suggest" class="ar-peds-suggest" hidden></div>
      </div>
      <div class="ar-clin-form ar-peds-form">
        <label>Fármaco
          <select id="ar-peds-drug">${optsHtml}</select>
        </label>
        <label>Peso (kg)
          <input id="ar-peds-w" type="number" step="0.1" min="1" max="80" placeholder="ej: 12.5" value="${escapeHtml(autoW)}"/>
        </label>
        <label>Edad (meses) <span style="opacity:.6;font-weight:400">opcional</span>
          <input id="ar-peds-age" type="number" step="1" min="0" max="216" placeholder="ej: 24" value="${escapeHtml(autoAge)}"/>
        </label>
        <label>Presentación
          <select id="ar-peds-pres"></select>
        </label>
      </div>
      <div id="ar-peds-presentations" class="ar-peds-presentations"></div>
      <div id="ar-peds-result" class="ar-peds-result"></div>
      <p class="ar-clin-hint" style="margin-top:10px">
        ⚠ Cálculo orientativo basado en arsenal CESFAM y guías MINSAL/AAP.
        El médico siempre confirma dosis, contraindicaciones e interacciones.
      </p>`;

    const drugSel = body.querySelector("#ar-peds-drug");
    const wInp = body.querySelector("#ar-peds-w");
    const ageInp = body.querySelector("#ar-peds-age");
    const presSel = body.querySelector("#ar-peds-pres");
    const out = body.querySelector("#ar-peds-result");
    const searchInp = body.querySelector("#ar-peds-search");
    const sugBox = body.querySelector("#ar-peds-suggest");
    const presList = body.querySelector("#ar-peds-presentations");

    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    function renderPresentationsPanel() {
      const d = drugs.find((x) => x.id === drugSel.value);
      if (!d) { presList.innerHTML = ""; return; }
      const rows = (d.presentations || []).map((p, i) => {
        let conc = "";
        if (p.mgPerMl) conc = `<b>${p.mgPerMl} mg/mL</b>`;
        else if (p.mgPerUnit) conc = `<b>${p.mgPerUnit} mg</b> / ${escapeHtml(p.unit || "unidad")}`;
        else if (p.unitLabel) conc = `<b>${escapeHtml(p.unitLabel)}</b>`;
        else conc = `<i style="opacity:.6">presentación fija</i>`;
        return `<li><span class="ar-peds-pres-i">${i + 1}</span><span class="ar-peds-pres-l">${escapeHtml(p.label)}</span><span class="ar-peds-pres-c">${conc}</span></li>`;
      }).join("");
      presList.innerHTML = `
        <div class="ar-peds-pres-card">
          <div class="ar-peds-pres-head">
            <b>${escapeHtml(d.name)}</b>
            <span class="ar-peds-pres-cat">${escapeHtml(d.category)}</span>
          </div>
          <ul class="ar-peds-pres-list">${rows || `<li><i>Sin presentaciones registradas</i></li>`}</ul>
        </div>`;
    }

    function showSuggestions(q) {
      const nq = norm(q).trim();
      if (!nq) { sugBox.hidden = true; sugBox.innerHTML = ""; return; }
      const matches = drugs.filter((d) => norm(d.name).includes(nq) || norm(d.category).includes(nq)).slice(0, 8);
      if (!matches.length) {
        sugBox.innerHTML = `<div class="ar-peds-sug-empty">Sin coincidencias</div>`;
        sugBox.hidden = false;
        return;
      }
      sugBox.innerHTML = matches.map((d) => {
        const pres = (d.presentations || []).map((p) => p.label).join(" · ");
        return `<button type="button" class="ar-peds-sug" data-id="${escapeHtml(d.id)}">
          <span class="ar-peds-sug-n">${escapeHtml(d.name)}</span>
          <span class="ar-peds-sug-c">${escapeHtml(d.category)}</span>
          <span class="ar-peds-sug-p">${escapeHtml(pres)}</span>
        </button>`;
      }).join("");
      sugBox.hidden = false;
      sugBox.querySelectorAll(".ar-peds-sug").forEach((b) => {
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.onclick = () => {
          drugSel.value = b.dataset.id;
          searchInp.value = drugs.find((x) => x.id === b.dataset.id)?.name || "";
          sugBox.hidden = true;
          refreshPresentations();
          renderPresentationsPanel();
          calc();
        };
      });
    }


    function refreshPresentations() {
      const d = drugs.find((x) => x.id === drugSel.value);
      presSel.innerHTML = (d?.presentations || [])
        .map((p, i) => `<option value="${i}">${escapeHtml(p.label)}</option>`).join("");
    }
    function calc() {
      const drugId = drugSel.value;
      const weightKg = parseFloat(wInp.value);
      const ageMonths = ageInp.value ? parseInt(ageInp.value, 10) : null;
      if (!weightKg) { out.innerHTML = ""; return; }
      const r = window.__AR_PEDS.compute({ drugId, weightKg, ageMonths });
      if (r.error) { out.innerHTML = `<div class="ar-clin-empty">${escapeHtml(r.error)}</div>`; return; }
      const d = drugs.find((x) => x.id === drugId);
      const pres = d.presentations[parseInt(presSel.value, 10)] || d.presentations[0];

      let mainHtml = "";
      let pasteText = "";
      if (r.kind === "perKg") {
        const ml = pres?.mgPerMl ? +(r.dosePerTakeMg / pres.mgPerMl).toFixed(2) : null;
        const units = pres?.mgPerUnit ? +(r.dosePerTakeMg / pres.mgPerUnit).toFixed(2) : null;
        mainHtml = `
          <div class="ar-peds-big">${r.dosePerTakeMg} mg <span>por dosis</span></div>
          <div class="ar-peds-sub">cada ${r.freqHours} h · total ${r.dailyMg} mg/día (máx ${r.maxDailyMg} mg/día)</div>
          ${ml != null ? `<div class="ar-peds-vol">≈ <b>${ml} mL</b> de ${escapeHtml(pres.label)}</div>` : ""}
          ${units != null ? `<div class="ar-peds-vol">≈ <b>${units} ${escapeHtml(pres.unit)}(s)</b> de ${escapeHtml(pres.label)}</div>` : ""}
          <div class="ar-peds-meta">Base: ${r.doseMgPerKg} mg/kg · paciente ${weightKg} kg</div>`;
        pasteText = `${d.name} ${r.dosePerTakeMg} mg (${ml != null ? ml + " mL" : units + " " + pres.unit}) c/${r.freqHours}h${r.kind === "perKg" ? " — " + r.doseMgPerKg + " mg/kg/dosis" : ""}.`;
      } else if (r.kind === "fixed") {
        mainHtml = `
          <div class="ar-peds-big">${escapeHtml(r.regimen)}</div>
          ${r.dosePerTakeMg ? `<div class="ar-peds-sub">${r.dosePerTakeMg} mg cada ${r.freqHours} h</div>` : ""}
          ${r.ml ? `<div class="ar-peds-vol">≈ <b>${r.ml} mL</b> ${r.freqHours ? "c/" + r.freqHours + "h" : ""}${r.days ? " x " + r.days + " días" : ""}</div>` : ""}`;
        pasteText = `${d.name}: ${r.regimen}.`;
      } else if (r.kind === "formula") {
        mainHtml = `
          <div class="ar-peds-big">${r.ml} mL <span>en ${r.freqHours} h</span></div>
          <div class="ar-peds-sub">${escapeHtml(r.regimen)}</div>
          <div class="ar-peds-meta">${escapeHtml(r.extraNotes || "")}</div>`;
        pasteText = `${d.name}: ${r.ml} mL en ${r.freqHours} h (${r.regimen}). Paciente ${weightKg} kg.`;
      }

      const warns = (r.warnings || []).map((w) => `<div class="ar-peds-warn">${escapeHtml(w)}</div>`).join("");

      out.innerHTML = `
        <div class="ar-peds-card">
          ${mainHtml}
          ${warns}
          <div class="ar-peds-notes">📝 ${escapeHtml(r.notes || "")}</div>
          <div class="ar-clin-row" style="margin-top:8px">
            <button class="ar-btn ar-btn-primary" id="ar-peds-paste">📋 Pegar indicación</button>
          </div>
        </div>`;
      const btn = out.querySelector("#ar-peds-paste");
      if (btn) {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.onclick = () => H().pasteIntoActive?.(pasteText);
      }
    }

    refreshPresentations();
    renderPresentationsPanel();
    drugSel.onchange = () => { refreshPresentations(); renderPresentationsPanel(); calc(); };
    [wInp, ageInp, presSel].forEach((el) => { el.oninput = calc; el.onchange = calc; });
    searchInp.addEventListener("input", (e) => showSuggestions(e.target.value));
    searchInp.addEventListener("focus", (e) => { if (e.target.value) showSuggestions(e.target.value); });
    document.addEventListener("click", (e) => {
      if (!sugBox.contains(e.target) && e.target !== searchInp) sugBox.hidden = true;
    });
    const refreshBtn = body.querySelector("#ar-peds-refresh");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        const v = window.__AR_VITALS?.read?.() || {};
        if (v.weightKg) wInp.value = v.weightKg;
        if (v.ageMonths != null) ageInp.value = Math.round(v.ageMonths);
        H().toast?.(v.weightKg || v.ageMonths != null ? "🧠 Datos releídos de la ficha" : "No detecté peso/edad en la ficha");
        calc();
      };
    }
    if (parseFloat(wInp.value)) calc();
  }

  // ---------- Interacciones medicamentosas ----------
  function renderInteractions(body) {
    const I = window.__AR_INTERACTIONS;
    if (!I) {
      body.innerHTML = `<div class="ar-clin-empty">Motor de interacciones no disponible.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="ar-clin-row">
        <p class="ar-clin-hint">Cruza los fármacos detectados en la ficha con el catálogo de interacciones (Beers/STOPP/Lexicomp). Revisa textareas de plan, indicaciones y prescripción.</p>
        <button class="ar-btn ar-btn-primary" id="ar-int-rescan">🔄 Re-escanear ficha</button>
      </div>
      <div id="ar-int-list"></div>
      <details class="ar-clin-explore">
        <summary>📖 Ver todas las reglas (${(I.DATA?.rules || []).length})</summary>
        <div class="ar-int-all"></div>
      </details>`;

    const list = body.querySelector("#ar-int-list");
    const allBox = body.querySelector(".ar-int-all");

    function drawScan() {
      const alerts = I.scanCurrentChart();
      if (!alerts.length) {
        list.innerHTML = `<div class="ar-clin-empty">✅ No detecté interacciones críticas en la ficha actual.</div>`;
        return;
      }
      list.innerHTML = `<h4 class="ar-clin-h4">${alerts.length} alerta${alerts.length > 1 ? "s" : ""} detectada${alerts.length > 1 ? "s" : ""}</h4>` +
        alerts.map((a) => renderAlert(a, true)).join("");
      bindAlertActions(list);
    }

    function renderAlert(a, includePaste) {
      const drugs = (a.drugsFound || []).map((d) => `<span class="ar-int-drug">${escapeHtml(d.drug)} <em>(${escapeHtml(d.bucket)})</em></span>`).join("");
      const pasteText = `⚠ ALERTA INTERACCIÓN: ${a.title}\n${a.advice}${a.refs ? "\nFuente: " + a.refs : ""}`;
      return `<div class="ar-int-card ar-sev-${a.severity || "info"}">
        <div class="ar-int-h">
          <span class="ar-int-sev">${escapeHtml(String(a.severity || "info").toUpperCase())}</span>
          <b>${escapeHtml(a.title)}</b>
          ${includePaste ? `<button class="ar-btn ar-int-paste" data-txt="${escapeHtml(pasteText)}">📋 Pegar</button>` : ""}
        </div>
        ${drugs ? `<div class="ar-int-drugs">${drugs}</div>` : ""}
        <div class="ar-int-advice">${escapeHtml(a.advice)}</div>
        ${a.refs ? `<div class="ar-int-refs">📚 ${escapeHtml(a.refs)}</div>` : ""}
      </div>`;
    }

    function bindAlertActions(scope) {
      scope.querySelectorAll(".ar-int-paste").forEach((b) => {
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.onclick = () => H().pasteIntoActive?.(b.dataset.txt);
      });
    }

    body.querySelector("#ar-int-rescan").onclick = drawScan;
    I.ready.then(() => {
      drawScan();
      allBox.innerHTML = (I.DATA?.rules || []).map((r) => renderAlert({ ...r, drugsFound: [] }, false)).join("");
    });
  }

  // ---------- Arsenal CESFAM (presentaciones + conversor) ----------
  function renderArsenal(body) {
    const A = window.__AR_ARSENAL;
    if (!A) {
      body.innerHTML = `<div class="ar-clin-empty">Catálogo del arsenal no disponible.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="ar-arsenal">
        <div class="ar-clin-row">
          <input type="search" id="ar-ars-q" class="ar-clin-search" placeholder="Buscar fármaco (paracetamol, amoxicilina, salbutamol...)" autocomplete="off"/>
          <span class="ar-arsenal-count" id="ar-ars-count">cargando…</span>
        </div>
        <div class="ar-arsenal-grid">
          <ul class="ar-ars-list" id="ar-ars-list"></ul>
          <div class="ar-ars-detail" id="ar-ars-detail">
            <div class="ar-clin-empty">Selecciona un fármaco para ver presentaciones y convertir dosis.</div>
          </div>
        </div>
        <p class="ar-clin-hint">📦 Catálogo construido desde el Arsenal CESFAM 2024. Conversiones automáticas mg ↔ mL ↔ gotas ↔ unidades según presentación real.</p>
      </div>`;
    const inp = body.querySelector("#ar-ars-q");
    const list = body.querySelector("#ar-ars-list");
    const detail = body.querySelector("#ar-ars-detail");
    const count = body.querySelector("#ar-ars-count");

    let selectedId = null;

    function drawList() {
      const items = A.search(inp.value, { limit: 80 });
      count.textContent = `${items.length} de ${A.ALL.length}`;
      list.innerHTML = items.map((d) => {
        const kinds = [...new Set(d.presentations.map((p) => p.kind))].slice(0, 3);
        const tags = kinds.map((k) => `<span class="ar-ars-tag ar-tag-${k}">${escapeHtml(k)}</span>`).join("");
        const preg = window.__AR_EMBARAZO?.lookup?.(d.name);
        const pregBadge = preg ? `<span class="ar-ars-preg" title="Embarazo ${escapeHtml(preg.label)}" style="background:${preg.color};color:#fff">🤰 ${escapeHtml(preg.category)}</span>` : "";
        return `<li class="ar-ars-item ${selectedId === d.id ? "active" : ""}" data-id="${escapeHtml(d.id)}">
          <b>${escapeHtml(d.name)} ${pregBadge}</b>
          <div class="ar-ars-tags">${tags}</div>
        </li>`;
      }).join("");
      list.querySelectorAll(".ar-ars-item").forEach((li) => {
        li.onclick = () => { selectedId = li.dataset.id; drawList(); drawDetail(); };
      });
    }

    function drawDetail() {
      const d = A.get(selectedId);
      if (!d) { detail.innerHTML = `<div class="ar-clin-empty">Selecciona un fármaco.</div>`; return; }
      const presOpts = d.presentations.map((p, i) =>
        `<option value="${i}">${escapeHtml(p.forma)} — ${escapeHtml(p.presentation)}</option>`).join("");
      const preg = window.__AR_EMBARAZO?.lookup?.(d.name);
      const pregBox = preg
        ? `<div class="ar-emb-box" style="--emb-c:${preg.color}">
            <div class="ar-emb-head">
              <span class="ar-emb-cat" style="background:${preg.color};color:#fff">${escapeHtml(preg.category)}</span>
              <b>🤰 Embarazo — ${escapeHtml(preg.label)}</b>
              ${preg.thirdTrimester ? `<span class="ar-emb-extra">3° trim.: <b>${escapeHtml(preg.thirdTrimester)}</b></span>` : ""}
              ${preg.altCategory ? `<span class="ar-emb-extra">Alt.: <b>${escapeHtml(preg.altCategory)}</b></span>` : ""}
            </div>
            ${preg.note ? `<div class="ar-emb-note">${escapeHtml(preg.note)}</div>` : ""}
          </div>`
        : "";
      detail.innerHTML = `
        <h4 class="ar-clin-h4">${escapeHtml(d.name)}</h4>
        <div class="ar-ars-group">${escapeHtml(d.group || "")}</div>
        ${pregBox}
        <table class="ar-ars-presentations">
          <thead><tr><th>Forma</th><th>Concentración</th><th>Equivalencia</th></tr></thead>
          <tbody>
            ${d.presentations.map((p) => {
              const eq = p.mgPerMl ? `${p.mgPerMl} mg/mL`
                : p.mgPerUnit ? `${p.mgPerUnit} mg / ${p.kind === "supositorio" ? "supositorio" : p.kind === "capsula" ? "cápsula" : "comprimido"}`
                : p.uiPerMl ? `${p.uiPerMl} UI/mL`
                : p.percent ? `${p.percent}% (${p.percent * 10} mg/mL)`
                : "—";
              return `<tr><td>${escapeHtml(p.forma)}</td><td><b>${escapeHtml(p.presentation)}</b></td><td>${escapeHtml(eq)}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
        <div class="ar-ars-conv">
          <h5>🧮 Convertir dosis</h5>
          <div class="ar-clin-form ar-ars-form">
            <label>Presentación
              <select id="ar-ars-pres">${presOpts}</select>
            </label>
            <label>Dosis
              <input id="ar-ars-dose" type="number" step="0.1" min="0" placeholder="ej: 500"/>
            </label>
            <label>Unidad
              <select id="ar-ars-unit">
                <option value="mg">mg</option>
                <option value="mcg">mcg</option>
                <option value="ui">UI</option>
              </select>
            </label>
            <label>Frecuencia (h) <span style="opacity:.6;font-weight:400">opcional</span>
              <input id="ar-ars-freq" type="number" step="1" min="1" max="72" placeholder="ej: 8"/>
            </label>
          </div>
          <div id="ar-ars-result" class="ar-ars-result"></div>
        </div>`;

      const presSel = detail.querySelector("#ar-ars-pres");
      const doseInp = detail.querySelector("#ar-ars-dose");
      const unitSel = detail.querySelector("#ar-ars-unit");
      const freqInp = detail.querySelector("#ar-ars-freq");
      const out = detail.querySelector("#ar-ars-result");

      function calc() {
        const dose = parseFloat(doseInp.value);
        if (!dose || dose <= 0) { out.innerHTML = ""; return; }
        const u = unitSel.value;
        const presentation = d.presentations[parseInt(presSel.value, 10)];
        const r = A.convert({
          presentation,
          doseMg: u === "mg" ? dose : undefined,
          doseMcg: u === "mcg" ? dose : undefined,
          doseUi: u === "ui" ? dose : undefined,
        });
        if (r.error) { out.innerHTML = `<div class="ar-peds-warn">${escapeHtml(r.error)}</div>`; return; }
        const freq = parseInt(freqInp.value, 10) || null;
        const big = r.ml != null
          ? `${r.ml} mL${r.drops ? ` <span>(${r.drops} gotas)</span>` : ""}`
          : `${r.units} <span>${escapeHtml(r.unitName || "")}(s)</span>`;
        const pasteText = A.formulate(d, presentation, {
          mg: u === "mg" ? dose : undefined,
          mcg: u === "mcg" ? dose : undefined,
          ui: u === "ui" ? dose : undefined,
        }, freq);
        out.innerHTML = `
          <div class="ar-peds-card">
            <div class="ar-peds-big">${big}</div>
            <div class="ar-peds-sub">${escapeHtml(r.formula)}</div>
            ${freq ? `<div class="ar-peds-meta">Cada ${freq} h</div>` : ""}
            <div class="ar-clin-row" style="margin-top:8px">
              <button class="ar-btn ar-btn-primary" id="ar-ars-paste">📋 Pegar receta</button>
            </div>
          </div>`;
        const btn = out.querySelector("#ar-ars-paste");
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.onclick = () => H().pasteIntoActive?.(pasteText);
      }
      [presSel, doseInp, unitSel, freqInp].forEach((el) => { el.oninput = calc; el.onchange = calc; });
    }

    inp.oninput = drawList;
    A.ready.then(() => { drawList(); });
    drawList();
  }


  // ---------- Farmacia (reglas CESFAM + consenso PROA) ----------
  function renderPharmacy(body) {
    const F = window.__AR_FARMACIA;
    if (!F) {
      body.innerHTML = `<div class="ar-clin-empty">Reglas de farmacia no disponibles.</div>`;
      return;
    }
    body.innerHTML = `
      <nav class="ar-pharm-tabs">
        <button data-pt="auto" class="active">⚡ Auto-detectar en ficha</button>
        <button data-pt="atb">💊 Antibióticos PROA</button>
        <button data-pt="all">📋 Todas las reglas</button>
        <button data-pt="ram">📨 Notificar RAM</button>
      </nav>
      <div id="ar-pharm-body"></div>`;
    const tabs = body.querySelectorAll(".ar-pharm-tabs button");
    const cont = body.querySelector("#ar-pharm-body");
    tabs.forEach((b) => {
      b.onclick = () => {
        tabs.forEach((x) => x.classList.toggle("active", x === b));
        F.ready.then(() => drawSub(b.dataset.pt));
      };
    });
    F.ready.then(() => drawSub("auto"));

    function drawSub(pt) {
      cont.innerHTML = "";
      if (pt === "auto") drawAuto();
      else if (pt === "atb") drawAtb();
      else if (pt === "all") drawAll();
      else if (pt === "ram") drawRam();
    }

    function drawAuto() {
      const reminders = scanCurrentChart();
      cont.innerHTML = `
        <div class="ar-clin-row">
          <p class="ar-clin-hint">Recordatorios atingentes a los fármacos detectados en el plan/receta de la ficha activa.</p>
          <button class="ar-btn" id="ar-pharm-rescan">🔄 Reescanear</button>
        </div>
        ${reminders.length ? renderReminderList(reminders, true) : `<div class="ar-clin-empty">No detecté fármacos con reglas especiales en la ficha actual. Asegúrate de tener la pestaña de prescripción/recetas abierta y vuelve a escanear.</div>`}`;
      cont.querySelector("#ar-pharm-rescan").onclick = drawAuto;
      bindReminderActions(cont);
    }

    function drawAll() {
      const all = F.allRules();
      const groups = ["Despacho", "Psicotrópicos", "Restricciones"];
      cont.innerHTML = `
        <input type="search" id="ar-pharm-q" class="ar-clin-search" placeholder="Buscar regla (omeprazol, insulina, benzo...)"/>
        <div id="ar-pharm-list"></div>`;
      const inp = cont.querySelector("#ar-pharm-q");
      const list = cont.querySelector("#ar-pharm-list");
      function draw() {
        const q = (inp.value || "").toLowerCase();
        const filt = all.filter((r) => !q || r.title.toLowerCase().includes(q) || r.advice.toLowerCase().includes(q) || (r.match || []).some((m) => m.toLowerCase().includes(q)));
        list.innerHTML = groups.map((g) => {
          const items = filt.filter((r) => r.group === g);
          if (!items.length) return "";
          return `<h5 class="ar-pharm-h5">${escapeHtml(g)}</h5>${renderReminderList(items, false)}`;
        }).join("") || `<div class="ar-clin-empty">Sin coincidencias.</div>`;
        bindReminderActions(list);
      }
      inp.oninput = draw;
      draw();
    }

    function drawAtb() {
      const list = F.RULES.antibioticos || [];
      cont.innerHTML = `
        <input type="search" id="ar-atb-q" class="ar-clin-search" placeholder="Buscar diagnóstico (ITU, NAC, OMA, H. pylori...)"/>
        <div class="ar-atb-list" id="ar-atb-list"></div>`;
      const inp = cont.querySelector("#ar-atb-q");
      const out = cont.querySelector("#ar-atb-list");
      function draw() {
        const q = (inp.value || "").toLowerCase();
        const filt = list.filter((a) => !q || a.diagnosis.toLowerCase().includes(q) || (a.icd || []).some((c) => c.toLowerCase().includes(q)));
        out.innerHTML = filt.map((a) => renderAtbCard(a)).join("");
        out.querySelectorAll(".ar-atb-paste").forEach((b) => {
          b.addEventListener("mousedown", (e) => e.preventDefault());
          b.onclick = () => H().pasteIntoActive?.(b.dataset.txt);
        });
      }
      inp.oninput = draw;
      draw();
    }

    function drawRam() {
      const ram = F.RULES.ram || {};
      const fp = F.RULES.farmacia_popular || {};
      cont.innerHTML = `
        <div class="ar-pharm-info">
          <h4 class="ar-clin-h4">📨 Notificación de RAM</h4>
          <p>${escapeHtml(ram.advice || "")}</p>
          <p>📥 <a href="${escapeHtml(ram.form_url || "#")}" target="_blank" rel="noopener">Descargar formulario ISP (RAM v3)</a></p>
          <p>✉ <code>${escapeHtml(ram.email || "")}</code></p>
        </div>
        <div class="ar-pharm-info">
          <h4 class="ar-clin-h4">🏷 Farmacia Popular</h4>
          <p>🌐 <a href="${escapeHtml(fp.url || "#")}" target="_blank" rel="noopener">Consultar precios y disponibilidad PAC</a></p>
          <p>📱 WhatsApp: <code>${escapeHtml(fp.wsp || "")}</code></p>
        </div>`;
    }

    function scanCurrentChart() {
      const blocks = [];
      const active = document.activeElement;
      if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
        blocks.push(active.value || "");
      }
      document.querySelectorAll("textarea, [class*='plan'], [class*='receta'], [class*='prescrip'], [class*='indicac']").forEach((n) => {
        const t = n.value || n.innerText || "";
        if (t && t.length < 8000) blocks.push(t);
      });
      if (!blocks.length) blocks.push((document.body.innerText || "").slice(0, 8000));
      return F.scanRecipe(blocks.join("\n\n"));
    }

    function renderReminderList(reminders, showMatch) {
      return reminders.map((r) => {
        const tpl = (r.templates || []).map((t) => `<button class="ar-btn ar-pharm-paste" data-txt="${escapeHtml(t)}">📋 ${escapeHtml(t.slice(0, 60))}${t.length > 60 ? "…" : ""}</button>`).join("");
        return `<div class="ar-pharm-rem ar-sev-${r.severity}">
          <div class="ar-pharm-rem-h">
            <span class="ar-pharm-tag">${escapeHtml(r.group)}</span>
            <b>${escapeHtml(r.title)}</b>
            ${showMatch && r.matched ? `<span class="ar-pharm-match">↳ ${escapeHtml(r.matched)}</span>` : ""}
          </div>
          <div class="ar-pharm-advice">${escapeHtml(r.advice)}</div>
          ${tpl ? `<div class="ar-pharm-tpls">${tpl}</div>` : ""}
        </div>`;
      }).join("");
    }
    function bindReminderActions(scope) {
      scope.querySelectorAll(".ar-pharm-paste").forEach((b) => {
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.onclick = () => H().pasteIntoActive?.(b.dataset.txt);
      });
    }
    function renderAtbCard(a) {
      const sec = (label, items) => items?.length
        ? `<div class="ar-atb-sec"><b>${escapeHtml(label)}:</b><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : "";
      const fullText = `${a.diagnosis}${a.icd ? " (" + a.icd.join(", ") + ")" : ""}\n` +
        ["first_line", "fracaso_72h_o_atb_previo", "menor_65_sin_comorbilidad", "mayor_65_o_comorbilidad", "alergia_pnc_no_anafilactica", "alergia_pnc", "alergia_pnc_grupo2", "alternativas", "segunda_linea"]
          .filter((k) => a[k]?.length)
          .map((k) => `${k.replace(/_/g, " ")}:\n` + a[k].map((x) => "• " + x).join("\n")).join("\n");
      return `<div class="ar-atb-card">
        <div class="ar-clin-row">
          <h5 class="ar-pharm-h5">${escapeHtml(a.diagnosis)} <small>${escapeHtml((a.icd || []).join(", "))}</small></h5>
          <button class="ar-btn ar-atb-paste" data-txt="${escapeHtml(fullText)}">📋 Pegar resumen</button>
        </div>
        ${a.criteria ? `<div class="ar-atb-criteria">📌 ${escapeHtml(a.criteria)}</div>` : ""}
        ${sec("Primera línea", a.first_line)}
        ${sec("Fracaso 72h / ATB previo", a.fracaso_72h_o_atb_previo)}
        ${sec("<65 años sin comorbilidad", a.menor_65_sin_comorbilidad)}
        ${sec("≥65 años o comorbilidad", a.mayor_65_o_comorbilidad)}
        ${sec("Alergia PNC (no anafiláctica)", a.alergia_pnc_no_anafilactica)}
        ${sec("Alergia PNC", a.alergia_pnc)}
        ${sec("Alergia PNC (grupo 2)", a.alergia_pnc_grupo2)}
        ${sec("Alternativas según antibiograma", a.alternativas)}
        ${sec("Segunda línea", a.segunda_linea)}
        ${a.duration_note ? `<div class="ar-atb-note">⏱ ${escapeHtml(a.duration_note)}</div>` : ""}
      </div>`;
    }
  }

  // ---------- Fármacos en ficha ----------
  function renderDrugs(body) {
    const vfg = window.__AR_HOST?.lastVfg ?? autoVfgFromLab();
    body.innerHTML = `
      <div class="ar-clin-row">
        <label>VFG actual (mL/min): <input id="ar-drug-vfg" type="number" step="1" value="${vfg ?? ""}"/></label>
        <button class="ar-btn ar-btn-primary" id="ar-drug-scan">🔍 Escanear ficha</button>
      </div>
      <div id="ar-drug-results"></div>
      <details class="ar-clin-explore">
        <summary>📖 Ver tabla completa (${(window.__AR_CLINICAL?.renal || []).length} fármacos)</summary>
        <input type="search" id="ar-drug-search" placeholder="Buscar fármaco..." class="ar-clin-search"/>
        <div id="ar-drug-table"></div>
      </details>`;
    const drawScan = () => {
      const v = parseFloat(body.querySelector("#ar-drug-vfg").value) || null;
      const matches = window.__AR_DRUG.scanDom(document);
      const out = body.querySelector("#ar-drug-results");
      if (!matches.length) { out.innerHTML = `<div class="ar-clin-empty">No detecté fármacos en la ficha visible. Asegúrate de tener la pestaña de prescripción/recetas abierta.</div>`; return; }
      out.innerHTML = `<h4 class="ar-clin-h4">Fármacos detectados (${matches.length})</h4>` + matches.map((m) => {
        const advs = window.__AR_DRUG.adviceFor(m.hits, v);
        return `<div class="ar-drug-card">
          <div class="ar-drug-src">📄 ${escapeHtml(m.text.slice(0, 140))}${m.text.length > 140 ? "…" : ""}</div>
          ${advs.map((a) => `
            <div class="ar-drug-adv ar-sev-${a.kind === "renal" ? "media" : "alta"}">
              <b>${escapeHtml(a.drug)}</b> <span class="ar-tag">${escapeHtml(a.category || a.kind)}</span>
              <div>${escapeHtml(a.advice)}</div>
              ${a.alert ? `<div class="ar-drug-alert">⚠ ${escapeHtml(a.alert)}</div>` : ""}
            </div>`).join("")}
        </div>`;
      }).join("");
    };
    body.querySelector("#ar-drug-scan").onclick = drawScan;

    // tabla completa
    const tbl = body.querySelector("#ar-drug-table");
    const search = body.querySelector("#ar-drug-search");
    const renal = window.__AR_CLINICAL?.renal || [];
    const drawTable = () => {
      const q = (search.value || "").toLowerCase();
      const filt = renal.filter((d) => !q || d.name.toLowerCase().includes(q) || (d.category || "").toLowerCase().includes(q));
      tbl.innerHTML = `<table class="ar-clin-table"><thead><tr><th>Fármaco</th><th>Cat.</th><th>Dosis normal</th><th>VFG ≥50</th><th>VFG 10-49</th><th>VFG <10</th><th>HD</th></tr></thead><tbody>` +
        filt.slice(0, 200).map((d) => `<tr><td><b>${escapeHtml(d.name)}</b></td><td>${escapeHtml(d.category)}</td><td>${escapeHtml(d.normalDose)}</td><td>${escapeHtml(d.ccr100_50)}</td><td>${escapeHtml(d.ccr50_10)}</td><td>${escapeHtml(d.ccr10)}</td><td>${escapeHtml(d.hd)}</td></tr>`).join("") +
        `</tbody></table>`;
    };
    search.oninput = drawTable;
    drawTable();
    drawScan();
  }
  function autoVfgFromLab() {
    const lab = H().getLabSession?.();
    const v = lab?.analytes?.vfg?.value;
    if (!v) return null;
    const m = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  // ---------- Flujogramas ----------
  function renderFlows(body) {
    const flows = window.__AR_CLINICAL?.flows || [];
    body.innerHTML = `<input type="search" id="ar-flow-search" class="ar-clin-search" placeholder="Buscar flujograma (cardiología, GES, derivación...)"/>
      <div class="ar-flow-grid" id="ar-flow-grid"></div>
      <div id="ar-flow-detail"></div>`;
    const grid = body.querySelector("#ar-flow-grid");
    const detail = body.querySelector("#ar-flow-detail");
    const search = body.querySelector("#ar-flow-search");
    const draw = () => {
      const q = (search.value || "").toLowerCase();
      const filt = flows.filter((f) => !q || f.title.toLowerCase().includes(q) || (f.tags || []).some((t) => t.toLowerCase().includes(q)));
      grid.innerHTML = filt.map((f) => `<button class="ar-flow-tile" data-id="${escapeHtml(f.id)}" style="--c:${escapeHtml(f.color || "#0ea5a4")}"><b>${escapeHtml(f.title)}</b><div class="ar-flow-tags">${(f.tags || []).slice(0, 4).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div></button>`).join("");
      grid.querySelectorAll(".ar-flow-tile").forEach((b) => b.onclick = () => showFlow(b.dataset.id));
    };
    function showFlow(id) {
      const f = flows.find((x) => x.id === id);
      if (!f) return;
      const html = (f.sections || []).map((s) => {
        const items = (s.items || []).map((it) => {
          const t = typeof it === "string" ? it : it.text;
          const hi = typeof it === "object" && it.highlight ? ` <em class="ar-hi">${escapeHtml(it.highlight)}</em>` : "";
          return `<li>${escapeHtml(t)}${hi}</li>`;
        }).join("");
        return `<section class="ar-flow-sec"><h5>${escapeHtml(s.title || s.type)}</h5>${s.text ? `<p>${escapeHtml(s.text)}</p>` : ""}<ul>${items}</ul></section>`;
      }).join("");
      detail.innerHTML = `<div class="ar-flow-detail-card">
        <div class="ar-clin-row"><h4 class="ar-clin-h4">${escapeHtml(f.title)}</h4>
          <button class="ar-btn" id="ar-flow-paste">📋 Pegar resumen</button></div>
        ${html}</div>`;
      detail.querySelector("#ar-flow-paste").onclick = () => {
        const plain = (f.sections || []).map((s) => `${s.title || s.type}:\n` + (s.items || []).map((it) => "• " + (typeof it === "string" ? it : it.text)).join("\n")).join("\n\n");
        H().pasteIntoActive?.(`📋 ${f.title}\n${plain}`);
      };
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    search.oninput = draw;
    draw();
  }

  // ---------- Recordatorios (auto desde labs + edad) ----------
  // ---------- Calculadoras clínicas ----------
  const CALCULATORS = [
    { id: "barthel",  name: "Índice de Barthel",        desc: "Funcionalidad / AVD básicas (0–100)" },
    { id: "yesavage", name: "Yesavage (GDS-15)",        desc: "Depresión en adulto mayor (0–15)" },
    { id: "goldberg", name: "Goldberg ansiedad/depresión", desc: "Tamizaje EADG (9 + 9 ítems)" },
  ];

  function renderCalculators(body) {
    body.innerHTML = `
      <div class="ar-clin-row" style="gap:8px;flex-wrap:wrap">
        ${CALCULATORS.map(c => `<button class="ar-btn ar-calc-pick" data-id="${c.id}" title="${escapeHtml(c.desc)}">${escapeHtml(c.name)}</button>`).join("")}
      </div>
      <p class="ar-clin-hint" style="margin-top:6px">Selecciona una calculadora. Los puntajes se pueden pegar en la ficha activa.</p>
      <div id="ar-calc-host" style="margin-top:10px"></div>`;
    const host = body.querySelector("#ar-calc-host");
    body.querySelectorAll(".ar-calc-pick").forEach(b => {
      b.onclick = () => {
        body.querySelectorAll(".ar-calc-pick").forEach(x => x.classList.toggle("ar-btn-primary", x === b));
        const id = b.dataset.id;
        if (id === "barthel")  renderBarthel(host);
        if (id === "yesavage") renderYesavage(host);
        if (id === "goldberg") renderGoldberg(host);
      };
    });
    const first = body.querySelector(".ar-calc-pick");
    if (first) first.click();
  }

  // ---------- Yesavage GDS-15 ----------
  // Cada ítem: pregunta + respuesta que puntúa 1 ("yes" o "no")
  const GDS15_ITEMS = [
    { q: "¿Está básicamente satisfecho/a con su vida?", bad: "no" },
    { q: "¿Ha abandonado muchas de sus actividades e intereses?", bad: "yes" },
    { q: "¿Siente que su vida está vacía?", bad: "yes" },
    { q: "¿Se aburre a menudo?", bad: "yes" },
    { q: "¿Está de buen ánimo la mayor parte del tiempo?", bad: "no" },
    { q: "¿Tiene miedo de que algo malo le pase?", bad: "yes" },
    { q: "¿Se siente feliz la mayor parte del tiempo?", bad: "no" },
    { q: "¿Se siente a menudo desamparado/a?", bad: "yes" },
    { q: "¿Prefiere quedarse en casa antes que salir y hacer cosas nuevas?", bad: "yes" },
    { q: "¿Cree tener más problemas de memoria que la mayoría?", bad: "yes" },
    { q: "¿Cree que es maravilloso estar vivo/a?", bad: "no" },
    { q: "¿Se siente inútil tal y como está ahora?", bad: "yes" },
    { q: "¿Se siente lleno/a de energía?", bad: "no" },
    { q: "¿Cree que su situación es desesperada?", bad: "yes" },
    { q: "¿Cree que la mayoría de la gente está mejor que usted?", bad: "yes" },
  ];

  function classifyGDS(score) {
    if (score <= 4)  return { label: "Normal",                 color: "#166534", bg: "#dcfce7" };
    if (score <= 9)  return { label: "Depresión leve / probable", color: "#78350f", bg: "#fef3c7" };
    return { label: "Depresión establecida", color: "#991b1b", bg: "#fee2e2" };
  }

  function renderYesavage(host) {
    host.innerHTML = `
      <div class="ar-calc-card">
        <div class="ar-calc-h"><b>🧮 Escala de Depresión Geriátrica de Yesavage (GDS-15)</b><span class="ar-calc-meta">Tamizaje en ≥65 años · Sheikh & Yesavage, 1986</span></div>
        <div class="ar-calc-grid">
          ${GDS15_ITEMS.map((it,i) => `
            <div class="ar-calc-item">
              <div class="ar-calc-l">${i+1}. ${escapeHtml(it.q)}</div>
              <div class="ar-calc-opts">
                <label class="ar-calc-opt"><input type="radio" name="gds-${i}" value="yes"/><span class="ar-calc-txt">Sí</span></label>
                <label class="ar-calc-opt"><input type="radio" name="gds-${i}" value="no"/><span class="ar-calc-txt">No</span></label>
              </div>
            </div>`).join("")}
        </div>
        <div class="ar-calc-result" id="ar-gds-result">
          <div class="ar-calc-score">— / 15</div>
          <div class="ar-calc-class">Selecciona los ítems</div>
        </div>
        <div class="ar-clin-row" style="margin-top:8px;gap:6px">
          <button class="ar-btn" id="ar-gds-reset">↺ Limpiar</button>
          <button class="ar-btn ar-btn-primary" id="ar-gds-paste">📋 Pegar resultado</button>
        </div>
      </div>`;
    const resBox = host.querySelector("#ar-gds-result");
    function recompute() {
      let total = 0, answered = 0;
      const detail = [];
      GDS15_ITEMS.forEach((it,i) => {
        const sel = host.querySelector(`input[name="gds-${i}"]:checked`);
        if (sel) {
          answered++;
          const pts = sel.value === it.bad ? 1 : 0;
          total += pts;
          detail.push(`${i+1}. ${it.q} → ${sel.value === "yes" ? "Sí" : "No"} (${pts})`);
        }
      });
      const c = classifyGDS(total);
      resBox.style.background = c.bg; resBox.style.color = c.color;
      resBox.innerHTML = `
        <div class="ar-calc-score">${total} / 15</div>
        <div class="ar-calc-class">${escapeHtml(c.label)} · ${answered}/${GDS15_ITEMS.length} ítems</div>`;
      resBox.dataset.text = `Yesavage GDS-15: ${total}/15 — ${c.label}.\n${detail.join("\n")}`;
    }
    host.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener("change", recompute));
    host.querySelector("#ar-gds-reset").onclick = () => {
      host.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; });
      recompute();
    };
    const pasteBtn = host.querySelector("#ar-gds-paste");
    pasteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    pasteBtn.onclick = () => {
      const txt = resBox.dataset.text || "Yesavage GDS-15 sin completar.";
      H().pasteIntoActive?.(txt);
      H().toast?.("📋 Yesavage copiado a la ficha activa");
    };
    recompute();
  }

  // ---------- Goldberg (EADG) ansiedad y depresión ----------
  const GOLDBERG_ANX = [
    "¿Se ha sentido muy excitado, nervioso o en tensión?",
    "¿Ha estado muy preocupado por algo?",
    "¿Se ha sentido muy irritable?",
    "¿Ha tenido dificultad para relajarse?",
    "¿Ha dormido mal, ha tenido dificultades para dormir?",
    "¿Ha tenido dolores de cabeza o nuca?",
    "¿Ha tenido alguno de los siguientes síntomas: temblores, hormigueos, mareos, sudores, diarrea? (síntomas vegetativos)",
    "¿Ha estado preocupado por su salud?",
    "¿Ha tenido dificultad para conciliar el sueño?",
  ];
  const GOLDBERG_DEP = [
    "¿Se ha sentido con poca energía?",
    "¿Ha perdido interés por las cosas?",
    "¿Ha perdido la confianza en sí mismo?",
    "¿Se ha sentido desesperanzado, sin esperanzas?",
    "¿Ha tenido dificultades para concentrarse?",
    "¿Ha perdido peso (a causa de su falta de apetito)?",
    "¿Se ha estado despertando demasiado temprano?",
    "¿Se ha sentido enlentecido?",
    "¿Cree que ha tenido tendencia a encontrarse peor por las mañanas?",
  ];

  function renderGoldberg(host) {
    host.innerHTML = `
      <div class="ar-calc-card">
        <div class="ar-calc-h"><b>🧮 Escala de Goldberg (EADG)</b><span class="ar-calc-meta">Tamizaje ansiedad y depresión · Goldberg et al., 1988</span></div>
        <p class="ar-clin-hint" style="margin:4px 0 8px">Responda Sí/No referido a los <b>últimos 15 días</b>. En cada subescala, si las 4 primeras tienen ≥2 respuestas afirmativas, complete las 5 restantes.</p>

        <div class="ar-calc-h" style="margin-top:6px"><b>Subescala de Ansiedad</b></div>
        <div class="ar-calc-grid" id="ar-gb-anx">
          ${GOLDBERG_ANX.map((q,i) => `
            <div class="ar-calc-item">
              <div class="ar-calc-l">${i+1}. ${escapeHtml(q)}</div>
              <div class="ar-calc-opts">
                <label class="ar-calc-opt"><input type="radio" name="gb-anx-${i}" value="1"/><span class="ar-calc-txt">Sí</span></label>
                <label class="ar-calc-opt"><input type="radio" name="gb-anx-${i}" value="0"/><span class="ar-calc-txt">No</span></label>
              </div>
            </div>`).join("")}
        </div>

        <div class="ar-calc-h" style="margin-top:10px"><b>Subescala de Depresión</b></div>
        <div class="ar-calc-grid" id="ar-gb-dep">
          ${GOLDBERG_DEP.map((q,i) => `
            <div class="ar-calc-item">
              <div class="ar-calc-l">${i+1}. ${escapeHtml(q)}</div>
              <div class="ar-calc-opts">
                <label class="ar-calc-opt"><input type="radio" name="gb-dep-${i}" value="1"/><span class="ar-calc-txt">Sí</span></label>
                <label class="ar-calc-opt"><input type="radio" name="gb-dep-${i}" value="0"/><span class="ar-calc-txt">No</span></label>
              </div>
            </div>`).join("")}
        </div>

        <div class="ar-calc-result" id="ar-gb-result">
          <div class="ar-calc-score">Ansiedad — / 9 · Depresión — / 9</div>
          <div class="ar-calc-class">Responda los ítems</div>
        </div>
        <div class="ar-clin-row" style="margin-top:8px;gap:6px">
          <button class="ar-btn" id="ar-gb-reset">↺ Limpiar</button>
          <button class="ar-btn ar-btn-primary" id="ar-gb-paste">📋 Pegar resultado</button>
        </div>
      </div>`;

    const resBox = host.querySelector("#ar-gb-result");
    function sumSub(prefix, items) {
      let total = 0, answered = 0;
      items.forEach((_,i) => {
        const sel = host.querySelector(`input[name="${prefix}-${i}"]:checked`);
        if (sel) { answered++; total += parseInt(sel.value,10); }
      });
      return { total, answered };
    }
    function recompute() {
      const a = sumSub("gb-anx", GOLDBERG_ANX);
      const d = sumSub("gb-dep", GOLDBERG_DEP);
      const anxPos = a.total >= 4; // punto de corte ≥4
      const depPos = d.total >= 2; // punto de corte ≥2
      const labels = [];
      if (anxPos) labels.push("Probable ansiedad");
      if (depPos) labels.push("Probable depresión");
      if (!labels.length && (a.answered || d.answered)) labels.push("Bajo riesgo");
      const klass = labels.join(" · ") || "Responda los ítems";
      const isPos = anxPos || depPos;
      resBox.style.background = isPos ? "#fee2e2" : "#dcfce7";
      resBox.style.color      = isPos ? "#991b1b" : "#166534";
      resBox.innerHTML = `
        <div class="ar-calc-score">Ansiedad ${a.total}/9 · Depresión ${d.total}/9</div>
        <div class="ar-calc-class">${escapeHtml(klass)}</div>`;
      resBox.dataset.text =
        `Escala de Goldberg (EADG):\n` +
        `- Ansiedad: ${a.total}/9 (corte ≥4) → ${anxPos ? "POSITIVO" : "negativo"}\n` +
        `- Depresión: ${d.total}/9 (corte ≥2) → ${depPos ? "POSITIVO" : "negativo"}`;
    }
    host.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener("change", recompute));
    host.querySelector("#ar-gb-reset").onclick = () => {
      host.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; });
      recompute();
    };
    const pasteBtn = host.querySelector("#ar-gb-paste");
    pasteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    pasteBtn.onclick = () => {
      const txt = resBox.dataset.text || "Goldberg sin completar.";
      H().pasteIntoActive?.(txt);
      H().toast?.("📋 Goldberg copiado a la ficha activa");
    };
    recompute();
  }

  const BARTHEL_ITEMS = [
    { id: "comer",     label: "Comer",                       opts: [[10,"Independiente"],[5,"Necesita ayuda (cortar, untar)"],[0,"Dependiente"]] },
    { id: "baño",      label: "Bañarse",                     opts: [[5,"Independiente (ducha/baño)"],[0,"Dependiente"]] },
    { id: "vestir",    label: "Vestirse",                    opts: [[10,"Independiente"],[5,"Necesita ayuda"],[0,"Dependiente"]] },
    { id: "arreglo",   label: "Arreglarse (aseo personal)",  opts: [[5,"Independiente (lavarse cara, peinarse, afeitarse)"],[0,"Necesita ayuda"]] },
    { id: "deposicion",label: "Deposición",                  opts: [[10,"Continente"],[5,"Accidente ocasional"],[0,"Incontinente"]] },
    { id: "miccion",   label: "Micción",                     opts: [[10,"Continente"],[5,"Accidente ocasional / sonda manejada"],[0,"Incontinente"]] },
    { id: "wc",        label: "Uso del WC",                  opts: [[10,"Independiente"],[5,"Necesita ayuda"],[0,"Dependiente"]] },
    { id: "traslado",  label: "Traslado sillón/cama",        opts: [[15,"Independiente"],[10,"Mínima ayuda física o supervisión"],[5,"Gran ayuda (1–2 personas)"],[0,"Dependiente, no se mantiene sentado"]] },
    { id: "deambular", label: "Deambulación",                opts: [[15,"Independiente >50 m"],[10,"Necesita ayuda física/verbal >50 m"],[5,"Independiente en silla de ruedas >50 m"],[0,"Dependiente"]] },
    { id: "escaleras", label: "Subir y bajar escaleras",     opts: [[10,"Independiente"],[5,"Necesita ayuda física o supervisión"],[0,"Dependiente"]] },
  ];

  function classifyBarthel(score) {
    if (score === 100) return { label: "Independiente", color: "#166534", bg: "#dcfce7" };
    if (score >= 60)   return { label: "Dependencia leve", color: "#075985", bg: "#e0f2fe" };
    if (score >= 40)   return { label: "Dependencia moderada", color: "#78350f", bg: "#fef3c7" };
    if (score >= 20)   return { label: "Dependencia severa", color: "#9a3412", bg: "#ffedd5" };
    return { label: "Dependencia total", color: "#991b1b", bg: "#fee2e2" };
  }

  function renderBarthel(host) {
    host.innerHTML = `
      <div class="ar-calc-card">
        <div class="ar-calc-h"><b>🧮 Índice de Barthel</b><span class="ar-calc-meta">Actividades básicas de la vida diaria · Mahoney & Barthel, 1965</span></div>
        <div class="ar-calc-grid">
          ${BARTHEL_ITEMS.map(it => `
            <div class="ar-calc-item">
              <div class="ar-calc-l">${escapeHtml(it.label)}</div>
              <div class="ar-calc-opts">
                ${it.opts.map(([v,t]) => `
                  <label class="ar-calc-opt">
                    <input type="radio" name="bx-${it.id}" value="${v}"/>
                    <span class="ar-calc-pts">${v}</span>
                    <span class="ar-calc-txt">${escapeHtml(t)}</span>
                  </label>`).join("")}
              </div>
            </div>`).join("")}
        </div>
        <div class="ar-calc-result" id="ar-bx-result">
          <div class="ar-calc-score">— / 100</div>
          <div class="ar-calc-class">Selecciona los ítems</div>
        </div>
        <div class="ar-clin-row" style="margin-top:8px;gap:6px">
          <button class="ar-btn" id="ar-bx-reset">↺ Limpiar</button>
          <button class="ar-btn ar-btn-primary" id="ar-bx-paste">📋 Pegar resultado</button>
        </div>
      </div>`;

    const resBox = host.querySelector("#ar-bx-result");
    function recompute() {
      let total = 0; let answered = 0;
      const detail = [];
      for (const it of BARTHEL_ITEMS) {
        const sel = host.querySelector(`input[name="bx-${it.id}"]:checked`);
        if (sel) {
          answered++;
          const v = parseInt(sel.value, 10);
          total += v;
          const txt = it.opts.find(o => o[0] === v)?.[1] || "";
          detail.push(`${it.label}: ${v} (${txt})`);
        }
      }
      const c = classifyBarthel(total);
      resBox.style.background = c.bg; resBox.style.color = c.color;
      resBox.innerHTML = `
        <div class="ar-calc-score">${total} / 100</div>
        <div class="ar-calc-class">${escapeHtml(c.label)} · ${answered}/${BARTHEL_ITEMS.length} ítems</div>`;
      resBox.dataset.text = `Índice de Barthel: ${total}/100 — ${c.label}.\n${detail.join("\n")}`;
    }
    host.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener("change", recompute));
    host.querySelector("#ar-bx-reset").onclick = () => {
      host.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; });
      recompute();
    };
    const pasteBtn = host.querySelector("#ar-bx-paste");
    pasteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    pasteBtn.onclick = () => {
      const txt = resBox.dataset.text || "Índice de Barthel sin completar.";
      H().pasteIntoActive?.(txt);
      H().toast?.("📋 Barthel copiado a la ficha activa");
    };
    recompute();
  }

  function renderReminders(body) {
    const lab = H().getLabSession?.();
    const ctx = H().getContext?.() || {};
    const recs = computeReminders(lab, ctx);
    body.innerHTML = `<div class="ar-clin-row">
      <p class="ar-clin-hint">Recordatorios sugeridos según labs / contexto. Toca <b>Pegar</b> para añadir al campo activo.</p>
    </div>
    <div>${recs.length ? recs.map((r) => `
      <div class="ar-rem-item">
        <div><b>${escapeHtml(r.title)}</b><div class="ar-rem-why">${escapeHtml(r.why)}</div></div>
        <button class="ar-btn ar-rem-paste" data-txt="${escapeHtml(r.text)}">Pegar</button>
      </div>`).join("") : `<div class="ar-clin-empty">Sin recordatorios automáticos para el contexto actual.</div>`}</div>`;
    body.querySelectorAll(".ar-rem-paste").forEach((b) => {
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.onclick = () => H().pasteIntoActive?.(b.dataset.txt);
    });
  }
  function computeReminders(lab, ctx) {
    const out = [];
    const A = lab?.analytes || {};
    const a1c = num(A.hba1c);
    const gli = num(A.glicemia);
    const vfg = num(A.vfg);
    const ldl = num(A.ldl);
    const tg  = num(A.trigliceridos);
    const tsh = num(A.tsh);
    const hb  = num(A.hemoglobina);
    const rac = num(A.rac);
    const microalb = num(A.microalbuminuria);
    const k   = num(A.potasio);
    const na  = num(A.sodio);

    // Edad y sexo desde ctx
    const ctxStr = `${ctx.patient || ""} ${ctx.section || ""}`;
    const ageMatch = ctxStr.match(/\b(\d{2,3})\s*(a(ñ|n)?os?|a\.?)\b/i);
    const age = ageMatch ? parseInt(ageMatch[1], 10) : null;
    const isFemale = /\b(femenin|mujer|fem\.?|f\b)/i.test(ctxStr);
    const isMale   = /\b(masculin|hombre|masc\.?|m\b)/i.test(ctxStr);

    // ====== DIABETES ======
    const isDM = (a1c != null && a1c >= 6.5) || (gli != null && gli >= 126);
    if (isDM) {
      out.push({ title: "Fondo de ojo cada 2 años (DM2)", why: `HbA1c ${a1c ?? "?"}% / Gli ${gli ?? "?"} mg/dL`, text: "Solicitar evaluación oftalmológica con fondo de ojo (control cada 2 años en DM2 — tamizaje retinopatía diabética; vigencia GES 2 años si fondo de ojo negativo)." });
      if (rac == null && microalb == null) {
        out.push({ title: "RAC en orina (nefropatía DM)", why: "Tamizaje anual obligatorio en DM2", text: "Solicitar RAC (relación albúmina/creatinina) en orina aislada para tamizaje de nefropatía diabética." });
      } else if (rac != null && rac >= 30) {
        out.push({ title: "RAC alterado — manejo", why: `RAC ${rac} mg/g (${rac >= 300 ? "A3 severo" : "A2 moderado"})`, text: `RAC ${rac} mg/g sobre rango. Repetir en 3 meses; iniciar/optimizar IECA o ARA II y control estricto de PA (<130/80).` });
      }
      out.push({ title: "Examen de pies (pie diabético)", why: "Pesquisa anual en DM2", text: "Realizar examen de pie diabético: inspección, monofilamento 10g en 4 puntos, diapasón 128 Hz, pulsos pedios y tibiales posteriores. Educación en autocuidado." });
      if (ldl != null && ldl >= 70) {
        out.push({ title: "Meta LDL en DM2", why: `LDL ${ldl} mg/dL (meta <70)`, text: `LDL ${ldl} mg/dL fuera de meta. Evaluar inicio/intensificación de estatina (atorvastatina 20-40 mg/día). Meta LDL <70 mg/dL.` });
      }
      if (a1c != null && a1c >= 9) {
        out.push({ title: "DM2 mal controlada — intensificar", why: `HbA1c ${a1c}% (≥9)`, text: `HbA1c ${a1c}%: mal control. Reforzar adherencia, dieta y ejercicio. Considerar intensificar terapia (insulinización si corresponde).` });
      }
      out.push({ title: "Vacuna influenza (DM)", why: "Población objetivo MINSAL", text: "Verificar vacunación antiinfluenza vigente (DM = grupo prioritario)." });
      out.push({ title: "Vacuna neumocócica (DM)", why: "Inmunocomprometido por DM", text: "Verificar esquema antineumocócico (PCV13 + PPSV23) según MINSAL para DM." });
    }

    // ====== ENFERMEDAD RENAL CRÓNICA ======
    if (vfg != null) {
      if (vfg < 15) out.push({ title: "ERC G5 — terapia de reemplazo renal", why: `VFG ${vfg}`, text: "ERC etapa G5 (VFG <15). Derivar urgente a Nefrología para evaluación de terapia de reemplazo renal (diálisis/trasplante)." });
      else if (vfg < 30) out.push({ title: "Derivar Nefrología (ERC G4)", why: `VFG ${vfg}`, text: "ERC etapa G4. Derivar a Nefrología, preparar acceso vascular, vacunar contra hepatitis B y evaluar metabolismo óseo-mineral." });
      else if (vfg < 60) out.push({ title: "Control ERC G3", why: `VFG ${vfg}`, text: `ERC etapa G3 (VFG ${vfg}). Control función renal + RAC + ELP cada 6-12 meses. Ajustar fármacos según VFG y evitar nefrotóxicos.` });
      else if (vfg < 90 && (rac != null || isDM)) out.push({ title: "ERC G2 con marcadores de daño", why: `VFG ${vfg} + RAC/DM`, text: "Mantener control anual de función renal y RAC. Optimizar PA y glicemia." });
    }

    // ====== RIESGO CV ======
    if (ldl != null && ldl >= 190) out.push({ title: "Hipercolesterolemia severa", why: `LDL ${ldl}`, text: `LDL ${ldl} mg/dL (severa). Iniciar estatina de alta intensidad y descartar hipercolesterolemia familiar.` });
    else if (ldl != null && ldl >= 160 && !isDM) out.push({ title: "Evaluar inicio estatina", why: `LDL ${ldl}`, text: `LDL ${ldl} mg/dL. Calcular riesgo CV a 10 años y considerar inicio de estatina.` });
    if (tg != null && tg >= 500) out.push({ title: "Hipertrigliceridemia severa", why: `TG ${tg}`, text: `TG ${tg} mg/dL — riesgo de pancreatitis. Iniciar fibrato, dieta estricta y abstinencia de alcohol.` });

    // ====== TIROIDES ======
    if (tsh != null) {
      if (tsh > 10) out.push({ title: "Iniciar/ajustar levotiroxina", why: `TSH ${tsh}`, text: `TSH ${tsh} µUI/mL. Hipotiroidismo manifiesto: iniciar levotiroxina y recontrol en 6-8 semanas.` });
      else if (tsh > 4.5) out.push({ title: "Recontrol TSH + T4L", why: `TSH ${tsh} (subclínico)`, text: `TSH ${tsh} levemente elevada. Solicitar T4 libre y anti-TPO; recontrol en 8-12 semanas antes de iniciar tratamiento.` });
    }

    // ====== ANEMIA ======
    if (hb != null) {
      const thr = isFemale ? 12 : isMale ? 13 : 12;
      if (hb < thr) out.push({ title: "Estudio etiológico de anemia", why: `Hb ${hb} g/dL`, text: "Solicitar perfil de hierro (ferritina, % saturación transferrina), B12, folato, reticulocitos y VCM. Considerar test de sangre oculta en heces si >50 años." });
    }

    // ====== ELECTROLITOS ======
    if (k != null && (k >= 5.5 || k < 3.5)) {
      out.push({ title: "Revisar fármacos por alteración de K+", why: `K ${k} mEq/L`, text: `Potasio ${k} mEq/L fuera de rango. Revisar IECA/ARA II/espironolactona (si hiperK) o diuréticos de asa (si hipoK) y recontrol de ELP en 1-2 semanas.` });
    }
    if (na != null && na < 130) out.push({ title: "Hiponatremia — estudio", why: `Na ${na}`, text: `Na ${na} mEq/L. Evaluar volemia, osmolaridad plasmática y urinaria, revisar diuréticos/ISRS.` });

    // ====== SALUD DE LA MUJER ======
    const probFem = isFemale || (!isMale && !isFemale);
    if (age != null && age >= 25 && age <= 64 && probFem) {
      out.push({ title: "PAP vigente (25-64 años)", why: `Edad ${age}${isFemale ? " · femenino" : ""}`, text: "Verificar PAP vigente (programa MINSAL: cada 3 años entre 25-64 años con técnica adecuada)." });
    }
    if (age != null && age >= 50 && age <= 69 && probFem) {
      out.push({ title: "Mamografía bienal (50-69)", why: `Edad ${age}`, text: "Verificar mamografía vigente (programa MINSAL: cada 2 años entre 50-69 años)." });
    }

    // ====== SALUD DEL HOMBRE ======
    if (age != null && age >= 50 && (isMale || (!isFemale && !isMale))) {
      out.push({ title: "Tamizaje cáncer de próstata", why: `Edad ${age}${isMale ? " · masculino" : ""}`, text: "Considerar tamizaje con PSA + tacto rectal según preferencia informada del paciente (50-70 años; antes si antecedente familiar)." });
    }

    // ====== ADULTO MAYOR ======
    if (age != null && age >= 65) {
      out.push({ title: "EMPAM vigente", why: `Edad ${age}`, text: "Verificar EMPAM (Examen de Medicina Preventiva del Adulto Mayor) vigente — control anual." });
      out.push({ title: "Vacuna neumocócica (≥65)", why: `Edad ${age}`, text: "Verificar esquema antineumocócico según MINSAL (PCV13 + PPSV23) para ≥65 años." });
      out.push({ title: "Evaluación funcional / caídas", why: "Adulto mayor", text: "Aplicar EFAM y pesquisa de riesgo de caídas (Timed Up and Go, Estación Unipodal). Revisar polifarmacia." });
    }

    // ====== TAMIZAJE CCR ======
    if (age != null && age >= 50 && age <= 75) {
      out.push({ title: "Tamizaje cáncer colorrectal", why: `Edad ${age}`, text: "Solicitar test de sangre oculta en heces (FIT) anual o colonoscopía cada 10 años (50-75 años)." });
    }

    // ====== EMPA ADULTO ======
    if (age != null && age >= 15 && age < 65) {
      out.push({ title: "EMPA vigente", why: `Edad ${age}`, text: "Verificar Examen de Medicina Preventiva del Adulto (EMPA) vigente — PA, IMC, perímetro abdominal, glicemia, lípidos, autoreporte de OH/tabaco." });
    }

    // ====== VACUNAS UNIVERSALES ======
    out.push({ title: "Vacuna influenza vigente", why: "Campaña anual", text: "Verificar vacunación antiinfluenza del año en curso." });
    if (age != null && age >= 60) {
      out.push({ title: "Refuerzo dT / dTpa", why: `Edad ${age}`, text: "Verificar refuerzo dT cada 10 años. Considerar dTpa si contacto con lactantes." });
    }

    return out;
  }
  function num(a) { if (!a) return null; const v = typeof a === "object" ? a.value : a; const m = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }

  // ============================================================
  // ===========  DOCUMENTOS & CERTIFICADOS  ====================
  // ============================================================

  // ---------- Helpers de autollenado desde la ficha Rayen ----------
  function autoFromPatient() {
    // Preferir extractor unificado (__AR_PATIENT). Fallback al ctx legacy.
    const P = window.__AR_PATIENT;
    if (P?.extract) return P.extract();
    const ctx = H().getContext?.() || {};
    const nombreCompleto = ctx.patient?.replace(/\s*\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK].*$/, "").trim() || "";
    const rut = ctx.patient?.match(/\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]/)?.[0] || "";
    return {
      nombre: nombreCompleto.split(/\s+/).slice(0, 2).join(" "),
      apellidos: nombreCompleto.split(/\s+/).slice(2).join(" "),
      nombreCompleto, rut,
      sexo: null, sexoConf: 0, sexoMotivo: "extractor no disponible",
      fechaNac: "", edad: "", diagnostico: "",
      missing: ["sexo", "diagnostico"], suggestions: [], source: "ctx-legacy",
    };
  }

  // Pequeño badge inline al lado del label de un campo según se haya
  // autodetectado, sugerido (baja confianza) o falte completar.
  function badgeFor(auto, key) {
    const has = key === "nombre" ? !!auto.nombreCompleto
              : key === "diagnostico" ? !!auto.diagnostico
              : key === "sexo" ? !!auto.sexo
              : !!auto[key];
    if (!has) {
      if ((auto.missing || []).includes(key)) return ` <span class="ar-auto-badge ar-auto-miss" title="No se pudo detectar — completar manualmente">⚠ falta</span>`;
      return "";
    }
    if (key === "rut") {
      if (auto.rutValido === false) {
        return ` <span class="ar-auto-badge ar-auto-miss" title="${escapeHtml(auto.rutMotivo || "RUT inválido")}">⚠ DV inválido</span>`;
      }
      return ` <span class="ar-auto-badge ar-auto-ok" title="RUT válido (módulo 11)">✓ auto</span>`;
    }
    if (key === "sexo" && (auto.sexoConf || 0) < .9) {
      return ` <span class="ar-auto-badge ar-auto-low" title="Sugerido: ${escapeHtml(auto.sexoMotivo || "")}">🔍 sugerido</span>`;
    }
    if (key === "diagnostico") {
      const conf = auto.diagnosticoConf || 0;
      const cie = auto.diagnosticoCie10 ? ` · CIE-10 ${escapeHtml(auto.diagnosticoCie10)}` : "";
      const fuente = auto.diagnosticoFuente ? ` · ${escapeHtml(auto.diagnosticoFuente)}` : "";
      if (auto.diagnosticoAmbiguo) {
        return ` <span class="ar-auto-badge ar-auto-low" title="Hay candidatos alternativos${fuente}${cie}">🔀 ambiguo</span>`;
      }
      if (conf >= 0.85) {
        return ` <span class="ar-auto-badge ar-auto-ok" title="Detectado en ficha${fuente}${cie}">✓ auto${auto.diagnosticoCie10 ? ` · ${escapeHtml(auto.diagnosticoCie10)}` : ""}</span>`;
      }
      return ` <span class="ar-auto-badge ar-auto-low" title="Texto libre — confirma${fuente}">🔍 sugerido</span>`;
    }
    return ` <span class="ar-auto-badge ar-auto-ok" title="Detectado en ficha">✓ auto</span>`;
  }

  function autoBanner(auto) {
    const items = [];
    if (auto.nombreCompleto) items.push(`<span><b>👤</b> ${escapeHtml(auto.nombreCompleto)}</span>`);
    if (auto.rut) {
      const ok = auto.rutValido !== false;
      items.push(`<span><b>${ok ? "✓" : "⚠"} RUT</b> ${escapeHtml(auto.rut)}${ok ? "" : ` <i title="${escapeHtml(auto.rutMotivo || "")}">(DV inválido)</i>`}</span>`);
    }
    if (auto.sexo) items.push(`<span><b>${auto.sexoConf >= .9 ? "✓" : "🔍"} Sexo</b> ${auto.sexo === "F" ? "Femenino" : "Masculino"}${auto.sexoConf < .9 ? ` <i>(sugerido)</i>` : ""}</span>`);
    if (auto.edad) items.push(`<span><b>Edad</b> ${escapeHtml(auto.edad)}</span>`);
    if (auto.diagnostico) {
      const cie = auto.diagnosticoCie10 ? ` <code>${escapeHtml(auto.diagnosticoCie10)}</code>` : "";
      const ico = auto.diagnosticoAmbiguo ? "🔀" : (auto.diagnosticoConf >= 0.85 ? "✓" : "🔍");
      items.push(`<span><b>${ico} Dx</b> ${escapeHtml(auto.diagnostico)}${cie}</span>`);
    }
    const detected = items.length
      ? `<div class="ar-auto-detected">${items.join("")}</div>`
      : `<div class="ar-auto-empty">⚠ No se detectó información del paciente en la ficha activa.</div>`;
    const miss = (auto.missing || []).filter((m) => m !== "diagnostico" || items.length === 0);
    const missBlock = miss.length
      ? `<div class="ar-auto-missing">📝 Sin detectar: <b>${miss.map((m) => ({ nombre: "nombre", rut: "RUT", sexo: "sexo", diagnostico: "diagnóstico" })[m] || m).join(", ")}</b> — completa manualmente abajo.</div>`
      : "";
    // Sugerencias de dx alternativos (chips clickeables)
    const dxAlts = (auto.suggestions || []).filter((s) => s.field === "diagnostico");
    let altsBlock = "";
    if (dxAlts.length) {
      const chips = dxAlts.slice(0, 4).map((s) => {
        const cie = s.cie10 ? ` · ${escapeHtml(s.cie10)}` : "";
        return `<button type="button" class="ar-dx-alt" data-dx-alt="${escapeHtml(s.value)}" title="${escapeHtml(s.motivo || "")} · conf ${(s.conf*100).toFixed(0)}%">${escapeHtml(s.value)}${cie}</button>`;
      }).join("");
      altsBlock = `<div class="ar-auto-alts"><b>🔀 Otros dx posibles:</b> ${chips}<small>Click para usar.</small></div>`;
    }
    return `<div class="ar-auto-banner">${detected}${missBlock}${altsBlock}</div>`;
  }

  // Conecta los chips ".ar-dx-alt" del banner para rellenar el campo
  // de diagnóstico del formulario contenedor cuando el usuario elige
  // otro candidato sugerido. Se invoca después de pintar cada formulario.
  function wireDxAlts(scope) {
    if (!scope) return;
    scope.querySelectorAll(".ar-dx-alt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-dx-alt") || "";
        let target = scope.querySelector('[data-k="diagnostico"]');
        if (!target) {
          const slots = scope.querySelectorAll("[data-diag]");
          for (const s of slots) { if (!s.value) { target = s; break; } }
          if (!target && slots[0]) target = slots[0];
        }
        if (target) {
          target.value = v;
          target.dispatchEvent(new Event("input", { bubbles: true }));
          target.focus();
          H().toast?.(`Dx actualizado: ${v}`);
        }
      });
    });
  }

  // Conecta validación módulo 11 en vivo a TODOS los inputs RUT del scope
  // (data-k="rut" en certificados/documentos y data-prof="*-rut" en COMPIN).
  // - oninput: marca el input con clase de error y deshabilita botones de impresión
  //   si el RUT está presente pero su DV no calza.
  // - onblur: si el RUT es válido, lo formatea automáticamente (12.345.678-9).
  function wireRutValidation(scope) {
    if (!scope) return;
    const RUT = window.__AR_RUT;
    if (!RUT) return;
    const inputs = scope.querySelectorAll('input[data-k="rut"], input[data-prof$="-rut"]');
    if (!inputs.length) return;

    function refresh() {
      let anyInvalid = false;
      inputs.forEach((inp) => {
        const v = (inp.value || "").trim();
        if (!v) {
          inp.classList.remove("ar-rut-bad", "ar-rut-ok");
          inp.removeAttribute("title");
          return;
        }
        const r = RUT.validate(v);
        if (r.ok) {
          inp.classList.add("ar-rut-ok");
          inp.classList.remove("ar-rut-bad");
          inp.title = "RUT válido";
        } else {
          inp.classList.add("ar-rut-bad");
          inp.classList.remove("ar-rut-ok");
          inp.title = r.motivo || "RUT inválido";
          anyInvalid = true;
        }
      });
      // Bloquear botones de impresión si hay un RUT con DV inválido
      scope.querySelectorAll("#ar-cert-print, #ar-compin-print, .ar-doc-print").forEach((btn) => {
        btn.disabled = anyInvalid;
        btn.title = anyInvalid ? "Corrige el RUT antes de imprimir" : "";
      });
    }
    inputs.forEach((inp) => {
      inp.addEventListener("input", refresh);
      inp.addEventListener("blur", () => {
        const v = (inp.value || "").trim();
        if (!v) return;
        const r = RUT.validate(v);
        if (r.ok && r.formatted && r.formatted !== v) inp.value = r.formatted;
        refresh();
      });
    });
    refresh();
  }

  // ---------- Editor de medicamentos con casillas seleccionables ----------
  const MED_FREQS = [
    "Cada 4 h", "Cada 6 h", "Cada 8 h", "Cada 12 h", "Cada 24 h", "Otra"
  ];

  // Normaliza unidades sueltas a formato canónico
  function _normUnit(u) {
    const x = String(u || "").toLowerCase().replace(/\.+$/, "");
    if (/^(mg|mgr|mgs|miligramos?)$/.test(x)) return "mg";
    if (/^(mcg|µg|ug|microgramos?)$/.test(x)) return "mcg";
    if (/^(g|gr|grs|gramos?)$/.test(x)) return "g";
    if (/^(ml|cc|mililitros?)$/.test(x)) return "ml";
    if (/^(ui|u|unidades?)$/.test(x)) return "ui";
    if (x === "%") return "%";
    return x;
  }

  // Extrae todas las dosis del texto. Devuelve [{value, unit, raw, index}].
  // Soporta combinaciones tipo "500/125 mg", "1 g", "0,5 mg", "100 mcg".
  function _extractDoses(txt) {
    const re = /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?)\s*(mg\.?|mgr|mgs|mcg|µg|ug|microgramos?|miligramos?|g\b|gr\b|grs\b|gramos?|ml|cc|mililitros?|ui|u\b|unidades?|%)/gi;
    const out = []; let m;
    while ((m = re.exec(txt)) !== null) {
      const num = m[1].replace(/\s+/g, "");
      const unit = _normUnit(m[2]);
      out.push({ value: num.replace(",", "."), unit, raw: `${num.replace(",", ".")} ${unit}`, index: m.index });
    }
    return out;
  }

  // Parsea el texto crudo de una fila/celda donde se detectó un fármaco
  // y devuelve { nombre, dosis, frecuencia, m, t, n, sos }.
  function parseMedFromText(rawText, drugName) {
    const txt = String(rawText || "").replace(/\s+/g, " ").trim();
    const lower = txt.toLowerCase();

    // -------- DOSIS: elegir la más cercana al nombre del fármaco --------
    let dosis = "";
    const doses = _extractDoses(txt);
    if (doses.length) {
      let chosen = doses[0];
      const drugIdx = drugName ? lower.indexOf(String(drugName).toLowerCase()) : -1;
      if (drugIdx >= 0) {
        // dosis a la derecha del nombre primero; si no hay, la más cercana
        const right = doses.filter((d) => d.index >= drugIdx);
        const pool = right.length ? right : doses;
        chosen = pool.reduce((a, b) => Math.abs(b.index - drugIdx) < Math.abs(a.index - drugIdx) ? b : a);
      }
      dosis = chosen.raw;
    }

    // -------- FRECUENCIA --------
    let frecuencia = "";
    // c/8h, c8h, cada 8 h, cada 8 horas, q8h, q.8.h, /8h, x 8 horas
    const fh = lower.match(/(?:cada|c\/?|q\.?|x|\/)\s*(\d{1,2})\s*(?:h\b|hr|hrs|hor[ae]s?)/);
    if (fh) {
      const n = parseInt(fh[1], 10);
      if ([4, 6, 8, 12, 24].includes(n)) frecuencia = `Cada ${n} h`;
      else frecuencia = "Otra";
    } else if (/\bqd\b|\bqod\b|\bod\b|1\s*vez|una\s*vez|diari[oa]|al d[ií]a|\/\s*d[ií]a|x\s*d[ií]a|24\s*h/.test(lower)) {
      frecuencia = "Cada 24 h";
    } else if (/\bbid\b|\bb\.i\.d\b|2\s*veces|dos\s*veces|12\s*h/.test(lower)) {
      frecuencia = "Cada 12 h";
    } else if (/\btid\b|\bt\.i\.d\b|3\s*veces|tres\s*veces|8\s*h/.test(lower)) {
      frecuencia = "Cada 8 h";
    } else if (/\bqid\b|\bq\.i\.d\b|4\s*veces|cuatro\s*veces|6\s*h/.test(lower)) {
      frecuencia = "Cada 6 h";
    } else if (/\bqhs\b|al acostarse|antes de dormir/.test(lower)) {
      frecuencia = "Cada 24 h";
    }

    // -------- HORARIOS: patrón "1-0-1", "1/0/1", "1 0 1" (M-T-N) --------
    let mm = false, tt = false, nn = false;
    const sched = txt.match(/\b([0-2])\s*[-\/\s]\s*([0-2])\s*[-\/\s]\s*([0-2])\b/);
    if (sched) {
      mm = parseInt(sched[1], 10) > 0;
      tt = parseInt(sched[2], 10) > 0;
      nn = parseInt(sched[3], 10) > 0;
      if (!frecuencia) {
        const c = (mm ? 1 : 0) + (tt ? 1 : 0) + (nn ? 1 : 0);
        if (c === 1) frecuencia = "Cada 24 h";
        else if (c === 2) frecuencia = "Cada 12 h";
        else if (c === 3) frecuencia = "Cada 8 h";
      }
    } else {
      // Horarios explícitos en palabras
      mm = /\bma[ñn]ana\b|\bam\b|desayuno|antes del desayuno|en ayunas/.test(lower);
      tt = /\btarde\b|almuerzo|al mediod[ií]a/.test(lower);
      nn = /\bnoche\b|\bpm\b|cena|al acostarse|antes de dormir|nocturn[oa]/.test(lower);
      if (!mm && !tt && !nn) {
        if (frecuencia === "Cada 24 h") mm = true;
        else if (frecuencia === "Cada 12 h") { mm = true; nn = true; }
        else if (frecuencia === "Cada 8 h") { mm = true; tt = true; nn = true; }
        else if (frecuencia === "Cada 6 h") { mm = true; tt = true; nn = true; }
      }
    }

    const sos = /\bsos\b|\bs\.?o\.?s\.?\b|\bprn\b|\bp\.r\.n\.?\b|si\s+(?:necesita|requiere|precisa|dolor|fiebre|molestia)|seg[uú]n\s+(?:necesidad|requerimiento)|raz[oó]n\s+necesaria|a\s+demanda/.test(lower);

    let nombre = (drugName || "").trim();
    if (!nombre) {
      // Quita prefijos como "Rp/", "Indico:", etc., y corta antes de la primera dosis o separador
      nombre = txt.replace(/^(rp\/?|ind\.?|indico:?|tto:?|tx:?)\s*/i, "")
        .split(/[\d,;|]|cada\b|c\//i)[0].trim().slice(0, 60);
    }

    return { nombre, dosis, frecuencia, m: mm, t: tt, n: nn, sos };
  }

  // Normaliza nombre: minúsculas, sin acentos, sin puntuación, sin sales/sufijos comunes.
  function normalizeMedName(s) {
    let n = String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    n = n.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    // Quitar sales / formas farmacéuticas comunes que no aportan a la identidad
    n = n.replace(/\b(clorhidrato|hidrocloruro|sulfato|tartrato|maleato|succinato|fumarato|fosfato|sodico|sodica|potasico|potasica|calcico|micronizado|monohidrato|comprimido|capsula|tableta|jarabe|inyectable|oral|tabletas?|comprimidos?|capsulas?)\b/g, " ");
    n = n.replace(/\s+/g, " ").trim();
    return n;
  }
  function nameTokensSig(s) {
    const n = normalizeMedName(s);
    if (!n) return [];
    return n.split(" ").filter((t) => t.length >= 4);
  }
  // Normaliza dosis a "<num><unidad>" (mg, mcg, g, ml, ui). "" si no hay.
  function normalizeDose(s) {
    const m = String(s || "").toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(mcg|mg|g|ml|ui)\b/);
    if (!m) return "";
    let n = parseFloat(m[1].replace(",", "."));
    let u = m[2];
    // Convertir g→mg y mcg→mg para comparar (sólo para comparación interna)
    if (u === "g") { n = n * 1000; u = "mg"; }
    else if (u === "mcg") { n = n / 1000; u = "mg"; }
    return `${n}${u}`;
  }
  // ¿Mismo fármaco? Coincide por token significativo del nombre Y dosis compatible.
  function isSameMed(a, b) {
    const na = nameTokensSig(a.nombre);
    const nb = nameTokensSig(b.nombre);
    if (!na.length || !nb.length) return false;
    const nameMatch = na.some((t) => nb.includes(t)) ||
      na.some((t) => nb.some((u) => t.length >= 5 && (u.includes(t) || t.includes(u))));
    if (!nameMatch) return false;
    const da = normalizeDose(a.dosis);
    const db = normalizeDose(b.dosis);
    // Si alguna dosis falta, basta con el match de nombre
    return !da || !db || da === db;
  }

  // Detecta TODOS los medicamentos en el historial / ficha clínica visible,
  // independientemente del dataset renal. Parsea texto tipo:
  //   "(1) Hidroclorotiazida 50 mg Comprimidos : 1 Comprimido cada 24 horas por 360 meses..."
  //   "Atorvastatina Calcica 20 mg Comprimidos : 1 Comprimido cada 24 horas..."
  // Excluye nodos dentro del propio panel de la extensión (clases ar-*).
  function _isInsideArUI(node) {
    let n = node;
    while (n && n.nodeType === 1) {
      const cls = n.className && n.className.baseVal !== undefined ? n.className.baseVal : (n.className || "");
      if (typeof cls === "string" && /(^|\s)ar-/.test(cls)) return true;
      const id = n.id || "";
      if (typeof id === "string" && id.startsWith("ar-")) return true;
      n = n.parentNode;
    }
    return false;
  }
  // Patrón de línea de prescripción: nombre + dosis(+ unidad opcional)
  const _RX_LINE = /([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ/\-]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ/\-]+){0,3})\s+(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ml|ui)\b/i;
  // Limpia nombre: quita sales/formas farmacéuticas y prefijos numéricos
  function _cleanDrugName(raw) {
    let n = String(raw || "").trim();
    n = n.replace(/^\s*\(?\d+\)?\s*[\.\-:]?\s*/, ""); // "(1)" o "1." inicial
    n = n.replace(/\b(calcic[ao]|sodic[ao]|potasic[ao]|magnesic[ao]|clorhidrato|hidrocloruro|sulfato|tartrato|maleato|succinato|fumarato|fosfato|micronizado|monohidrato|dihidrato|trihidrato|comprimid[oa]s?|c[aá]psulas?|capsulas?|tableta?s?|jarabes?|inyectables?|oral|gotas?|crema|pomada|s[oó]lido|polvo|gragea?s?)\b/gi, " ");
    n = n.replace(/\s+/g, " ").trim();
    // Capitaliza primera letra
    if (n) n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    return n;
  }
  function _collectChartLines(root, acc) {
    try {
      // Prescripción suele estar en <li>, <p>, <td>, <div>
      const nodes = root.querySelectorAll("li, p, td, div, span");
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (_isInsideArUI(el)) continue;
        const tRaw = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (tRaw.length < 8) continue;
        if (!/(comprimid|c[aá]psul|cada\s+\d+\s*h|horas?|d[ií]as?|mg\b|mcg\b|gotas|jarabe)/i.test(tRaw)) continue;
        // Si el texto agrupa varias recetas con marcadores "(1) ... (2) ...",
        // partirlo para no perder ítems en bloques grandes.
        let pieces;
        if (/\(\d+\)\s*[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(tRaw)) {
          pieces = tRaw.split(/(?=\(\d+\)\s*[A-Za-zÁÉÍÓÚÑáéíóúñ])/g);
        } else if (tRaw.length > 400) {
          // Demasiado largo y sin marcadores: ignorar contenedor agregado
          if (el.children && el.children.length > 6) continue;
          pieces = [tRaw];
        } else {
          pieces = [tRaw];
        }
        for (const p of pieces) {
          const t = p.trim();
          if (t.length < 8 || t.length > 600) continue;
          if (!_RX_LINE.test(t)) continue;
          acc.add(t);
        }
      }
      const frames = root.querySelectorAll("iframe");
      for (let i = 0; i < frames.length; i++) {
        try {
          const doc = frames[i].contentDocument || frames[i].contentWindow?.document;
          if (doc) _collectChartLines(doc, acc);
        } catch (_) { /* cross-origin */ }
      }
    } catch (_) { /* ignore */ }
  }
  function detectMedsFromChart() {
    const lines = new Set();
    _collectChartLines(document, lines);
    const out = [];
    for (const text of lines) {
      const m = text.match(_RX_LINE);
      if (!m) continue;
      const rawName = m[1];
      const name = _cleanDrugName(rawName);
      if (!name || name.length < 3) continue;
      // Filtros anti-falsos: descarta si "name" es palabra genérica
      if (/^(receta|paciente|dosis|frecuencia|horas?|d[ií]as?|comprimid|c[aá]psul|cada|por)$/i.test(name)) continue;
      const row = parseMedFromText(text, name);
      row.nombre = name; // forzar el nombre limpio
      // Cantidad por toma
      const qtyM = text.match(/(\d+(?:[.,]\d+)?)\s*(comprimid[oa]s?|c[aá]psulas?|capsulas?|tabletas?|gotas?)\b/i);
      const qNum = qtyM ? parseFloat(qtyM[1].replace(",", ".")) : 1;
      let cantidad = "1";
      if (qNum === 0.25) cantidad = "1/4";
      else if (qNum === 0.5) cantidad = "1/2";
      else if (qNum === 0.75) cantidad = "3/4";
      else if (Number.isInteger(qNum)) cantidad = String(qNum);
      else cantidad = String(qNum);
      row.cantidad = cantidad;
      // Horas detectadas o 24 por defecto
      let hours = 24;
      const fhM = (row.frecuencia || "").match(/(\d{1,2})/);
      if (fhM) hours = parseInt(fhM[1], 10);
      row.frecuencia = `Cada ${hours} h`;
      if (!row.m && !row.t && !row.n) {
        if (hours >= 24) row.m = true;
        else if (hours >= 12) { row.m = true; row.n = true; }
        else { row.m = true; row.t = true; row.n = true; }
      }
      // Dedupe por nombre + dosis
      if (out.some((r) => isSameMed(r, row))) continue;
      out.push(row);
    }
    return out;
  }

  // Modal de vista previa para confirmar qué medicamentos detectados se rellenan.
  // detected: filas parseadas; existingRows: filas actuales de la tabla;
  // onConfirm(selectedRows[]) se llama al confirmar.
  function showAutofillPreview(detected, existingRows, onConfirm) {
    document.querySelectorAll(".ar-autofill-modal").forEach((n) => n.remove());
    const overlay = document.createElement("div");
    overlay.className = "ar-autofill-modal";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;pointer-events:auto";
    const isDup = (d) => (existingRows || []).some((r) => r.nombre && isSameMed(r, d));
    const items = detected.map((d, i) => { const dup = isDup(d); return { ...d, _dup: dup, _sel: !dup, _i: i }; });
    const fmtSched = (r) => [r.m && "☀️", r.t && "🌤", r.n && "🌙", r.sos && "🆘"].filter(Boolean).join(" ") || "—";
    // copia editable
    const work = items.map((r) => ({ ...r }));
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;max-width:820px;width:94vw;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
          <h3 style="margin:0;font-size:15px;color:#0f172a">📥 Vista previa — ${detected.length} fármaco${detected.length === 1 ? "" : "s"} detectado${detected.length === 1 ? "" : "s"}</h3>
          <button data-close style="background:transparent;border:0;font-size:20px;cursor:pointer;color:#64748b">×</button>
        </div>
        <div style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button data-toggle-all style="background:#fff;border:1px solid #cbd5e1;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">Marcar / desmarcar todo</button>
          <span>Edita los campos si lo necesitas. Desmarca los que no quieras agregar. Las filas en gris ya existen en la tabla.</span>
        </div>
        <div style="overflow:auto;flex:1">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="position:sticky;top:0;background:#f1f5f9;z-index:1">
              <tr>
                <th style="padding:6px 4px;border-bottom:1px solid #cbd5e1;width:30px"></th>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #cbd5e1">Medicamento</th>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #cbd5e1;width:100px">Dosis</th>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #cbd5e1;width:80px">Cantidad</th>
                <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #cbd5e1;width:120px">Frecuencia</th>
                <th style="padding:6px 4px;text-align:center;border-bottom:1px solid #cbd5e1;width:38px;background:#fef3c7">☀️</th>
                <th style="padding:6px 4px;text-align:center;border-bottom:1px solid #cbd5e1;width:38px;background:#ffedd5">🌤</th>
                <th style="padding:6px 4px;text-align:center;border-bottom:1px solid #cbd5e1;width:38px;background:#dbeafe">🌙</th>
                <th style="padding:6px 4px;text-align:center;border-bottom:1px solid #cbd5e1;width:38px;background:#fee2e2;color:#b91c1c">🆘</th>
              </tr>
            </thead>
            <tbody>
              ${work.map((r) => `
                <tr data-row="${r._i}" style="${r._dup ? "background:#f1f5f9" : ""}">
                  <td style="text-align:center;padding:4px;border-bottom:1px solid #f1f5f9"><input type="checkbox" data-sel="${r._i}" ${r._sel ? "checked" : ""} style="width:16px;height:16px;cursor:pointer"/></td>
                  <td style="padding:3px 4px;border-bottom:1px solid #f1f5f9">
                    <input type="text" data-edit="nombre" data-i="${r._i}" value="${escapeHtml(r.nombre)}" style="width:100%;border:1px solid #e2e8f0;border-radius:3px;padding:4px 6px;font-size:12px;background:#fff"/>
                    ${r._dup ? '<div style="font-size:10px;color:#b45309;margin-top:2px">(ya en tabla)</div>' : ""}
                  </td>
                  <td style="padding:3px 4px;border-bottom:1px solid #f1f5f9"><input type="text" data-edit="dosis" data-i="${r._i}" value="${escapeHtml(r.dosis || "")}" placeholder="50 mg" style="width:100%;border:1px solid #e2e8f0;border-radius:3px;padding:4px 6px;font-size:12px;background:#fff"/></td>
                  <td style="padding:3px 4px;border-bottom:1px solid #f1f5f9">
                    <select data-edit="cantidad" data-i="${r._i}" style="width:100%;border:1px solid #e2e8f0;border-radius:3px;padding:4px;font-size:12px;background:#fff">
                      ${["1/4","1/2","3/4","1","1.5","2","3","4","5","10"].map((q) => `<option ${q === (r.cantidad || "1") ? "selected" : ""}>${q}</option>`).join("")}
                      ${r.cantidad && !["1/4","1/2","3/4","1","1.5","2","3","4","5","10"].includes(r.cantidad) ? `<option selected>${escapeHtml(r.cantidad)}</option>` : ""}
                    </select>
                  </td>
                  <td style="padding:3px 4px;border-bottom:1px solid #f1f5f9">
                    <select data-edit="frecuencia" data-i="${r._i}" style="width:100%;border:1px solid #e2e8f0;border-radius:3px;padding:4px;font-size:12px;background:#fff">
                      <option value="">— elegir —</option>
                      ${MED_FREQS.map((f) => `<option ${f === r.frecuencia ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}
                      ${r.frecuencia && !MED_FREQS.includes(r.frecuencia) ? `<option selected>${escapeHtml(r.frecuencia)}</option>` : ""}
                    </select>
                  </td>
                  <td style="text-align:center;background:#fef9c3;border-bottom:1px solid #f1f5f9"><input type="checkbox" data-edit="m" data-i="${r._i}" ${r.m ? "checked" : ""} style="width:16px;height:16px;cursor:pointer"/></td>
                  <td style="text-align:center;background:#fed7aa;border-bottom:1px solid #f1f5f9"><input type="checkbox" data-edit="t" data-i="${r._i}" ${r.t ? "checked" : ""} style="width:16px;height:16px;cursor:pointer"/></td>
                  <td style="text-align:center;background:#dbeafe;border-bottom:1px solid #f1f5f9"><input type="checkbox" data-edit="n" data-i="${r._i}" ${r.n ? "checked" : ""} style="width:16px;height:16px;cursor:pointer"/></td>
                  <td style="text-align:center;background:#fecaca;border-bottom:1px solid #f1f5f9"><input type="checkbox" data-edit="sos" data-i="${r._i}" ${r.sos ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;accent-color:#b91c1c"/></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div style="padding:10px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;background:#f8fafc">
          <button data-cancel class="ar-btn" style="background:#fff;border:1px solid #cbd5e1;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:12px">Cancelar</button>
          <button data-confirm class="ar-btn" style="background:#0ea5a4;color:#fff;border:0;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">✓ Confirmar y rellenar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector("[data-close]").onclick = close;
    overlay.querySelector("[data-cancel]").onclick = close;
    // Cerrar SOLO con "✕" o "Cancelar"
    // Edición en vivo: sincroniza cada cambio en `work`
    overlay.addEventListener("input", (e) => {
      const t = e.target;
      const k = t.getAttribute && t.getAttribute("data-edit");
      if (!k) return;
      const i = +t.getAttribute("data-i");
      const row = work.find((r) => r._i === i);
      if (!row) return;
      if (k === "m" || k === "t" || k === "n" || k === "sos") row[k] = !!t.checked;
      else row[k] = t.value;
    });
    overlay.addEventListener("change", (e) => {
      const t = e.target;
      const k = t.getAttribute && t.getAttribute("data-edit");
      if (!k) return;
      const i = +t.getAttribute("data-i");
      const row = work.find((r) => r._i === i);
      if (!row) return;
      if (k === "m" || k === "t" || k === "n" || k === "sos") row[k] = !!t.checked;
      else row[k] = t.value;
    });
    overlay.querySelector("[data-toggle-all]").onclick = () => {
      const boxes = overlay.querySelectorAll('input[type="checkbox"][data-sel]');
      const allOn = Array.from(boxes).every((b) => b.checked);
      boxes.forEach((b) => { b.checked = !allOn; });
    };
    overlay.querySelector("[data-confirm]").onclick = () => {
      const selected = [];
      overlay.querySelectorAll('input[type="checkbox"][data-sel]').forEach((b) => {
        if (b.checked) {
          const i = +b.dataset.sel;
          const row = work.find((r) => r._i === i);
          if (row && row.nombre && row.nombre.trim()) {
            const { _dup, _sel, _i, ...clean } = row;
            selected.push(clean);
          }
        }
      });
      close();
      onConfirm(selected);
    };
  }

  function wireMedRows(scope) {
    if (!scope) return;
    scope.querySelectorAll(".ar-medrows").forEach((host) => {
      const key = host.dataset.medrowsFor;
      const ta = scope.querySelector(`textarea[data-k="${key}"]`);
      if (!ta) return;
      // Parse valor inicial. Soporta dos formatos:
      //   8 campos (nuevo): Nombre|Dosis|Cantidad|Frecuencia|M|T|N|SOS
      //   7 campos (antiguo): Nombre|Dosis|Frecuencia|M|T|N|SOS  (cantidad="1")
      const parseRows = (txt) => String(txt || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const p = l.split("|").map((s) => s.trim());
        const b = (x) => x === "1" || /^x$/i.test(x);
        if (p.length >= 8) return { nombre: p[0], dosis: p[1], cantidad: p[2] || "1", frecuencia: p[3], m: b(p[4]), t: b(p[5]), n: b(p[6]), sos: b(p[7]) };
        if (p.length >= 7) return { nombre: p[0], dosis: p[1], cantidad: "1", frecuencia: p[2], m: b(p[3]), t: b(p[4]), n: b(p[5]), sos: b(p[6]) };
        if (p.length >= 6) return { nombre: p[0], dosis: p[1], cantidad: "1", frecuencia: p[2], m: b(p[3]), t: b(p[4]), n: b(p[5]), sos: false };
        return { nombre: p[0] || "", dosis: p[1] || "", cantidad: "1", frecuencia: "", m: !!p[2], t: !!p[3], n: !!p[4], sos: false };
      });
      let rows = parseRows(ta.value);
      const blank = () => ({ nombre: "", dosis: "", cantidad: "1", frecuencia: "", m: false, t: false, n: false, sos: false });
      if (!rows.length) rows = [blank()];
      // Mostrar columna SOS sólo si hay alguna fila marcada como SOS (estado inicial)
      let showSos = rows.some((r) => r.sos);

      const sanitize = (s) => String(s == null ? "" : s).replace(/[|\r\n]+/g, " ").trim();
      const sync = () => {
        ta.value = rows.map((r) => `${sanitize(r.nombre)}|${sanitize(r.dosis)}|${sanitize(r.cantidad || "1")}|${sanitize(r.frecuencia)}|${r.m ? 1 : 0}|${r.t ? 1 : 0}|${r.n ? 1 : 0}|${r.sos ? 1 : 0}`).join("\n");
      };

      const draw = () => {
        host.innerHTML = `
          <div style="margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button type="button" class="ar-btn ar-btn-mini" data-autofill style="background:#0ea5a4;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">📥 Auto-rellenar desde ficha</button>
            <button type="button" class="ar-btn ar-btn-mini" data-rescan title="Vuelve a escanear la ficha (útil si abriste la receta después)" style="background:#fff;border:1px solid #0ea5a4;color:#0ea5a4;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">🔁 Re-escanear</button>
            <span data-scan-status style="font-size:10px;color:#64748b"></span>
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#b91c1c;cursor:pointer;user-select:none;margin-left:auto">
              <input type="checkbox" data-toggle-sos ${showSos ? "checked" : ""} style="width:14px;height:14px;cursor:pointer;accent-color:#b91c1c"/>
              <b>🆘 Incluir columna SOS</b> <span style="color:#64748b;font-weight:400">(uso si lo necesita)</span>
            </label>
          </div>
          <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="background:#f1f5f9">
              <th style="padding:4px 6px;text-align:left;border:1px solid #cbd5e1">Medicamento</th>
              <th style="padding:4px 6px;text-align:left;border:1px solid #cbd5e1;width:100px">Dosis</th>
              <th style="padding:4px 6px;text-align:left;border:1px solid #cbd5e1;width:80px" title="Cantidad por toma (1, 1/2, 2…)">Cantidad</th>
              <th style="padding:4px 6px;text-align:left;border:1px solid #cbd5e1;width:120px">Frecuencia</th>
              <th style="padding:4px 4px;border:1px solid #cbd5e1;width:48px;background:#fef3c7">☀️ Mañ</th>
              <th style="padding:4px 4px;border:1px solid #cbd5e1;width:48px;background:#ffedd5">🌤️ Tar</th>
              <th style="padding:4px 4px;border:1px solid #cbd5e1;width:48px;background:#dbeafe">🌙 Noc</th>
              ${showSos ? `<th style="padding:4px 4px;border:1px solid #cbd5e1;width:50px;background:#fee2e2;color:#b91c1c">🆘 SOS</th>` : ""}
              <th style="border:1px solid #cbd5e1;width:30px"></th>
            </tr></thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr>
                  <td style="border:1px solid #cbd5e1;padding:2px"><input type="text" data-r="${i}" data-c="nombre" value="${escapeHtml(r.nombre)}" placeholder="Losartán" style="width:100%;border:0;padding:4px;background:transparent"/></td>
                  <td style="border:1px solid #cbd5e1;padding:2px"><input type="text" data-r="${i}" data-c="dosis" value="${escapeHtml(r.dosis)}" placeholder="50 mg" style="width:100%;border:0;padding:4px;background:transparent"/></td>
                  <td style="border:1px solid #cbd5e1;padding:2px">
                    <select data-r="${i}" data-c="cantidad" style="width:100%;border:0;padding:4px;background:transparent">
                      ${["1/4","1/2","3/4","1","1.5","2","3","4","5","10"].map((q) => `<option ${q === (r.cantidad || "1") ? "selected" : ""}>${q}</option>`).join("")}
                      ${r.cantidad && !["1/4","1/2","3/4","1","1.5","2","3","4","5","10"].includes(r.cantidad) ? `<option selected>${escapeHtml(r.cantidad)}</option>` : ""}
                    </select>
                  </td>
                  <td style="border:1px solid #cbd5e1;padding:2px">
                    <select data-r="${i}" data-c="frecuencia" style="width:100%;border:0;padding:4px;background:transparent">
                      <option value="">— elegir —</option>
                      ${MED_FREQS.map((f) => `<option ${f === r.frecuencia ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}
                      ${r.frecuencia && !MED_FREQS.includes(r.frecuencia) ? `<option selected>${escapeHtml(r.frecuencia)}</option>` : ""}
                    </select>
                  </td>
                  <td style="border:1px solid #cbd5e1;text-align:center;background:#fef9c3"><input type="checkbox" data-r="${i}" data-c="m" ${r.m ? "checked" : ""} style="width:18px;height:18px;cursor:pointer"/></td>
                  <td style="border:1px solid #cbd5e1;text-align:center;background:#fed7aa"><input type="checkbox" data-r="${i}" data-c="t" ${r.t ? "checked" : ""} style="width:18px;height:18px;cursor:pointer"/></td>
                  <td style="border:1px solid #cbd5e1;text-align:center;background:#dbeafe"><input type="checkbox" data-r="${i}" data-c="n" ${r.n ? "checked" : ""} style="width:18px;height:18px;cursor:pointer"/></td>
                  ${showSos ? `<td style="border:1px solid #cbd5e1;text-align:center;background:#fecaca"><input type="checkbox" data-r="${i}" data-c="sos" ${r.sos ? "checked" : ""} style="width:18px;height:18px;cursor:pointer;accent-color:#b91c1c"/></td>` : ""}
                  <td style="border:1px solid #cbd5e1;text-align:center"><button type="button" data-del="${i}" title="Eliminar fila" style="background:transparent;border:0;color:#b91c1c;cursor:pointer;font-size:14px">🗑</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
          </div>
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center">
            <button type="button" class="ar-btn ar-btn-mini" data-add>➕ Agregar medicamento</button>
            <span class="ar-clin-hint" style="font-size:10px;color:#64748b">Marca Mañ/Tar/Noc para horarios fijos${showSos ? ` · marca <b style="color:#b91c1c">SOS</b> para uso solo si lo necesita` : ""}.</span>
          </div>`;

        const togSos = host.querySelector("[data-toggle-sos]");
        if (togSos) togSos.onchange = () => {
          showSos = togSos.checked;
          if (!showSos) rows.forEach((r) => { r.sos = false; });
          sync(); draw();
        };

        const status = host.querySelector("[data-scan-status]");
        const runScan = (silent) => {
          const detected = detectMedsFromChart();
          if (!detected.length) {
            if (status) status.innerHTML = `<span style="color:#b91c1c">⚠ No detecté fármacos. Abre la pestaña de receta/medicación en Rayen y pulsa <b>🔁 Re-escanear</b>.</span>`;
            if (!silent) {
              btnAuto.textContent = "❌ Sin fármacos detectados";
              setTimeout(() => { btnAuto.textContent = "📥 Auto-rellenar desde ficha"; }, 2200);
            }
            return;
          }
          if (status) status.innerHTML = `<span style="color:#0f766e">✓ ${detected.length} fármaco${detected.length === 1 ? "" : "s"} detectado${detected.length === 1 ? "" : "s"}</span>`;
          showAutofillPreview(detected, rows, (selected) => {
            if (!selected.length) return;
            const onlyBlank = rows.length === 1 && !rows[0].nombre && !rows[0].dosis;
            if (onlyBlank) rows = [];
            rows.push(...selected);
            if (!rows.length) rows = [blank()];
            if (selected.some((r) => r.sos)) showSos = true;
            sync(); draw();
          });
        };

        const btnAuto = host.querySelector("[data-autofill]");
        if (btnAuto) btnAuto.onclick = () => runScan(false);
        const btnRescan = host.querySelector("[data-rescan]");
        if (btnRescan) btnRescan.onclick = () => {
          // Invalida caché de escaneo para forzar relectura inmediata
          if (window.__AR_DRUG && window.__AR_DRUG._reset) window.__AR_DRUG._reset();
          runScan(false);
        };

        host.querySelectorAll("input[data-c], select[data-c]").forEach((el) => {
          const handler = () => {
            const i = +el.dataset.r;
            const c = el.dataset.c;
            if (el.type === "checkbox") rows[i][c] = el.checked;
            else rows[i][c] = el.value;
            sync();
          };
          el.addEventListener("input", handler);
          el.addEventListener("change", handler);
        });
        host.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
          rows.splice(+b.dataset.del, 1);
          if (!rows.length) rows.push(blank());
          sync(); draw();
        });
        host.querySelector("[data-add]").onclick = () => {
          rows.push(blank());
          sync(); draw();
        };
      };

      // Si la plantilla guardada cambia el textarea desde fuera, re-renderizar
      const obs = new MutationObserver(() => { rows = parseRows(ta.value); draw(); });
      obs.observe(ta, { attributes: true, attributeFilter: ["value"] });
      ta.addEventListener("input", () => { rows = parseRows(ta.value); draw(); });

      sync(); draw();
    });
  }

  // ---------- Documentos (root con tabs) ----------
  function renderDocsRoot(body) {
    body.innerHTML = `
      <nav class="ar-pharm-tabs">
        <button data-dt="print" class="active">🖨 Documentos imprimibles</button>
        <button data-dt="cert">📝 Certificados médicos</button>
        <button data-dt="compin">🧾 Informe COMPIN</button>
        <button data-dt="medicos">👤 Médicos firmantes</button>
        <button data-dt="hist">🕘 Historial</button>
      </nav>
      <div id="ar-docs-body"></div>`;
    const tabs = body.querySelectorAll(".ar-pharm-tabs button");
    const cont = body.querySelector("#ar-docs-body");
    tabs.forEach((b) => {
      b.onclick = () => {
        tabs.forEach((x) => x.classList.toggle("active", x === b));
        if (b.dataset.dt === "print") renderPrintables(cont);
        else if (b.dataset.dt === "cert") renderCertificates(cont);
        else if (b.dataset.dt === "compin") renderCompin(cont);
        else if (b.dataset.dt === "medicos") renderMedicos(cont);
        else if (b.dataset.dt === "hist") renderHistorial(cont);
      };
    });
    renderPrintables(cont);
  }

  // ---------- Documentos imprimibles ----------
  // Storage local de documentos subidos por el usuario (PDF/imagen).
  const USER_DOCS_KEY = "ar-user-docs";
  const USER_DOC_MAX_BYTES = 5 * 1024 * 1024; // 5 MB por archivo (chrome.storage.local ≈ 10 MB)
  function loadUserDocs() {
    return new Promise((res) => {
      try { chrome.storage.local.get({ [USER_DOCS_KEY]: [] }, (r) => res(r[USER_DOCS_KEY] || [])); }
      catch { res([]); }
    });
  }
  function saveUserDocs(arr) {
    return new Promise((res, rej) => {
      try {
        chrome.storage.local.set({ [USER_DOCS_KEY]: arr }, () => {
          if (chrome.runtime?.lastError) rej(chrome.runtime.lastError);
          else res();
        });
      } catch (e) { rej(e); }
    });
  }
  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }
  function userDocIcon(mime) {
    if (!mime) return "📄";
    if (mime.startsWith("image/")) return "🖼";
    if (mime.includes("pdf")) return "📕";
    return "📄";
  }

  function renderPrintables(cont) {
    const D = window.__AR_DOCS;
    if (!D) { cont.innerHTML = `<div class="ar-clin-empty">Catálogo de documentos no disponible.</div>`; return; }
    cont.innerHTML = `
      <div class="ar-clin-row">
        <input type="search" id="ar-doc-q" class="ar-clin-search" placeholder="Buscar (perfil, glicemia, conners, espirometría, informativo, mis archivos...)"/>
      </div>
      <div class="ar-doc-upload" style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:8px 10px;margin:6px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px">
        <b style="color:#475569">📁 Mis archivos:</b>
        <input type="file" id="ar-userdoc-file" accept="application/pdf,image/*" style="font-size:11px;flex:1;min-width:140px"/>
        <input type="text" id="ar-userdoc-name" placeholder="Nombre (opcional)" style="flex:1;min-width:140px;padding:3px 6px"/>
        <input type="text" id="ar-userdoc-cat" placeholder="Categoría" value="Mis archivos" list="ar-userdoc-cats" style="width:140px;padding:3px 6px"/>
        <datalist id="ar-userdoc-cats"></datalist>
        <button type="button" class="ar-btn ar-btn-mini ar-btn-primary" id="ar-userdoc-add">⬆ Subir</button>
        <span style="color:#64748b;font-size:10px;flex-basis:100%">Se guardan localmente en este navegador (máx ${(USER_DOC_MAX_BYTES/1024/1024)|0} MB c/u). PDF o imagen.</span>
      </div>
      <div class="ar-doc-grid" id="ar-doc-grid"></div>
      <div id="ar-doc-form"></div>
      <p class="ar-clin-hint">📋 Plantillas built-in + tus archivos subidos. Vista previa y cuadro de impresión del navegador.</p>`;
    const inp = cont.querySelector("#ar-doc-q");
    const grid = cont.querySelector("#ar-doc-grid");
    const form = cont.querySelector("#ar-doc-form");
    const fileInp = cont.querySelector("#ar-userdoc-file");
    const nameInp = cont.querySelector("#ar-userdoc-name");
    const catInp = cont.querySelector("#ar-userdoc-cat");
    const catList = cont.querySelector("#ar-userdoc-cats");
    const addBtn = cont.querySelector("#ar-userdoc-add");

    let userDocs = [];

    function refreshCatList() {
      const cats = Array.from(new Set(userDocs.map((u) => u.category).filter(Boolean)));
      catList.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
    }

    addBtn.onclick = async () => {
      const f = fileInp.files && fileInp.files[0];
      if (!f) { H().toast?.("Selecciona un archivo"); return; }
      if (f.size > USER_DOC_MAX_BYTES) { H().toast?.(`El archivo supera ${(USER_DOC_MAX_BYTES/1024/1024)|0} MB`); return; }
      const mime = f.type || "application/octet-stream";
      if (!/pdf|image\//i.test(mime)) { H().toast?.("Solo PDF o imágenes"); return; }
      try {
        const dataUrl = await fileToDataUrl(f);
        const title = (nameInp.value || "").trim() || f.name.replace(/\.[^.]+$/, "");
        const category = (catInp.value || "").trim() || "Mis archivos";
        const doc = {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title, category, mime, dataUrl,
          size: f.size,
          addedAt: Date.now(),
        };
        userDocs = userDocs.concat([doc]);
        await saveUserDocs(userDocs);
        nameInp.value = ""; fileInp.value = "";
        refreshCatList();
        drawGrid();
        H().toast?.(`Archivo "${title}" guardado`);
      } catch (e) {
        H().toast?.("No se pudo guardar (¿espacio insuficiente?)");
      }
    };

    function drawGrid() {
      const q = (inp.value || "").toLowerCase();
      const userItems = userDocs.map((u) => ({
        id: u.id,
        title: u.title,
        category: u.category || "Mis archivos",
        icon: userDocIcon(u.mime),
        color: "#0369a1",
        description: `Archivo local · ${(u.size/1024).toFixed(0)} KB`,
        kind: "user",
        _user: u,
      }));
      const all = userItems.concat(D.list());
      const items = all.filter((d) => !q || d.title.toLowerCase().includes(q) || (d.category || "").toLowerCase().includes(q));
      const groups = {};
      items.forEach((d) => { (groups[d.category || "Otros"] = groups[d.category || "Otros"] || []).push(d); });
      grid.innerHTML = Object.entries(groups).map(([cat, arr]) => `
        <div class="ar-doc-group">
          <h5 class="ar-pharm-h5">${escapeHtml(cat)}</h5>
          <div class="ar-doc-tiles">
            ${arr.map((d) => `<button class="ar-doc-tile" data-id="${escapeHtml(d.id)}" style="--c:${escapeHtml(d.color || "#0ea5a4")}">
              ${d.kind === "user" ? `<span class="ar-doc-userbadge" title="Archivo subido por ti" style="position:absolute;top:4px;right:6px;font-size:9px;background:#0369a1;color:#fff;padding:1px 5px;border-radius:8px">LOCAL</span>` : ""}
              <span class="ar-doc-icon">${escapeHtml(d.icon || "📄")}</span>
              <span class="ar-doc-title">${escapeHtml(d.title)}</span>
              <span class="ar-doc-desc">${escapeHtml(d.description || "")}</span>
            </button>`).join("")}
          </div>
        </div>`).join("") || `<div class="ar-clin-empty">Sin coincidencias.</div>`;
      grid.querySelectorAll(".ar-doc-tile").forEach((b) => {
        const tile = b;
        tile.style.position = "relative";
        tile.onclick = () => openDocForm(tile.dataset.id);
      });
    }

    function openDocForm(id) {
      // Documento subido por el usuario
      const u = userDocs.find((x) => x.id === id);
      if (u) { openUserDoc(u); return; }
      const d = D.get(id);
      if (!d) return;
      // Visor PDF embebido (documentos kind:"pdf")
      if (d.kind === "pdf" && d.pdfUrl) {
        const url = (typeof chrome !== "undefined" && chrome.runtime?.getURL)
          ? chrome.runtime.getURL(d.pdfUrl)
          : d.pdfUrl;
        form.innerHTML = `
          <div class="ar-doc-card">
            <div class="ar-clin-row">
              <h4 class="ar-clin-h4">${escapeHtml(d.icon || "📄")} ${escapeHtml(d.title)}</h4>
              <button class="ar-btn ar-doc-close" type="button">✕</button>
            </div>
            <p class="ar-clin-hint" style="margin:4px 0 8px">${escapeHtml(d.description || "")}</p>
            <iframe class="ar-pdf-frame" src="${escapeHtml(url)}#view=FitH" title="${escapeHtml(d.title)}"></iframe>
            <div class="ar-clin-row" style="margin-top:8px;gap:6px">
              <button class="ar-btn ar-btn-primary" id="ar-pdf-open">🔍 Abrir en pestaña nueva</button>
              <a class="ar-btn" id="ar-pdf-dl" href="${escapeHtml(url)}" download="${escapeHtml(d.id)}.pdf">⬇ Descargar</a>
            </div>
          </div>`;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        form.querySelector(".ar-doc-close").onclick = () => { form.innerHTML = ""; };
        form.querySelector("#ar-pdf-open").onclick = () => window.open(url, "_blank", "noopener");
        return;
      }
      const auto = autoFromPatient();
      const guess = (k) => {
        if (k === "nombre") return auto.nombreCompleto || "";
        if (k === "rut") return auto.rut || "";
        if (k === "edad") return auto.edad || "";
        if (k === "diagnostico") return auto.diagnostico || "";
        if (k === "fecha") return new Date().toISOString().slice(0, 10);
        return "";
      };
      const fields = (d.fields || []).map((f) => {
        let val = guess(f.key) || f.default || "";
        if (val === "__today__") val = new Date().toISOString().slice(0, 10);
        const badge = ["nombre", "rut", "edad", "diagnostico"].includes(f.key) ? badgeFor(auto, f.key === "edad" ? "edad" : f.key) : "";
        if (f.type === "textarea") return `<label class="ar-doc-fld"><span>${escapeHtml(f.label)}${f.required ? " *" : ""}${badge}</span><textarea data-k="${escapeHtml(f.key)}" rows="3">${escapeHtml(val)}</textarea></label>`;
        if (f.type === "select") return `<label class="ar-doc-fld"><span>${escapeHtml(f.label)}${f.required ? " *" : ""}${badge}</span><select data-k="${escapeHtml(f.key)}">${(f.options || []).map((o) => `<option ${o === val ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select></label>`;
        if (f.type === "date") return `<label class="ar-doc-fld"><span>${escapeHtml(f.label)}${f.required ? " *" : ""}${badge}</span><input type="date" data-k="${escapeHtml(f.key)}" value="${escapeHtml(val)}"/></label>`;
        if (f.type === "medrows") return `<div class="ar-doc-fld" style="grid-column:1/-1"><span>${escapeHtml(f.label)}${f.required ? " *" : ""}</span><div class="ar-medrows" data-medrows-for="${escapeHtml(f.key)}"></div><textarea data-k="${escapeHtml(f.key)}" style="display:none">${escapeHtml(val)}</textarea></div>`;
        return `<label class="ar-doc-fld"><span>${escapeHtml(f.label)}${f.required ? " *" : ""}${badge}</span><input type="text" data-k="${escapeHtml(f.key)}" value="${escapeHtml(val)}"/></label>`;
      }).join("");
      const TPL_KEY = `ar-doc-tpl-${id}`;
      form.innerHTML = `
        <div class="ar-doc-card">
          <div class="ar-clin-row">
            <h4 class="ar-clin-h4">${escapeHtml(d.icon || "📄")} ${escapeHtml(d.title)}</h4>
            <button class="ar-btn ar-doc-close" type="button">✕</button>
          </div>
          ${autoBanner(auto)}
          <div class="ar-doc-tpl-bar" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin:6px 0;font-size:11px">
            <b style="color:#475569">📁 Plantillas guardadas:</b>
            <select id="ar-doc-tpl-sel" style="flex:1;min-width:160px;max-width:280px;padding:3px 6px"><option value="">— ninguna —</option></select>
            <button type="button" class="ar-btn ar-btn-mini" id="ar-doc-tpl-load" title="Cargar plantilla seleccionada">📂 Cargar</button>
            <button type="button" class="ar-btn ar-btn-mini" id="ar-doc-tpl-save" title="Guardar valores actuales como nueva plantilla">💾 Guardar</button>
            <button type="button" class="ar-btn ar-btn-mini" id="ar-doc-tpl-update" title="Sobrescribir la plantilla seleccionada">♻ Actualizar</button>
            <button type="button" class="ar-btn ar-btn-mini" id="ar-doc-tpl-del" title="Eliminar plantilla seleccionada" style="color:#b91c1c">🗑</button>
          </div>
          <div class="ar-doc-form">${fields}</div>
          <div class="ar-clin-row" style="margin-top:10px;flex-wrap:wrap;gap:6px">
            <button class="ar-btn ar-btn-primary" id="ar-doc-print">🖨 Vista previa imprimible</button>
            ${id === "cuadro-medicamentos" ? `
              <button class="ar-btn" type="button" id="ar-doc-edit-last" title="Reabre el último cuadro emitido por este médico para actualizar la prescripción">✏️ Editar último</button>
              <button class="ar-btn" type="button" id="ar-doc-history" title="Historial de cuadros de medicamentos (por médico activo)">📜 Historial</button>
            ` : ""}
          </div>
        </div>`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      wireDxAlts(form);
      wireRutValidation(form);
      wireMedRows(form);
      form.querySelector(".ar-doc-close").onclick = () => { form.innerHTML = ""; };

      // ---- Plantillas guardadas (persistencia local por documento) ----
      const tplSel = form.querySelector("#ar-doc-tpl-sel");
      // Campos identificadores del paciente que NO se guardan en la plantilla
      const PATIENT_KEYS = new Set(["nombre", "rut", "edad", "fecha"]);
      const collectValues = () => {
        const v = {};
        form.querySelectorAll("[data-k]").forEach((el) => { v[el.dataset.k] = el.value; });
        return v;
      };
      const applyValues = (vals) => {
        form.querySelectorAll("[data-k]").forEach((el) => {
          const k = el.dataset.k;
          if (PATIENT_KEYS.has(k)) return; // conservar datos del paciente actual
          if (vals[k] != null) {
            el.value = vals[k];
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
      };
      const loadTpls = () => new Promise((res) => {
        try { chrome.storage.local.get({ [TPL_KEY]: [] }, (r) => res(r[TPL_KEY] || [])); }
        catch { res([]); }
      });
      const saveTpls = (arr) => new Promise((res) => {
        try { chrome.storage.local.set({ [TPL_KEY]: arr }, () => res()); }
        catch { res(); }
      });
      const refreshTplSel = async (selectName) => {
        const list = await loadTpls();
        tplSel.innerHTML = `<option value="">— ${list.length ? "selecciona plantilla" : "sin plantillas guardadas"} —</option>` +
          list.map((t) => `<option value="${escapeHtml(t.name)}" ${t.name === selectName ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
      };
      refreshTplSel();

      form.querySelector("#ar-doc-tpl-save").onclick = async () => {
        const name = (prompt("Nombre para esta plantilla:") || "").trim();
        if (!name) return;
        const list = await loadTpls();
        if (list.some((t) => t.name === name) && !confirm(`Ya existe "${name}". ¿Sobrescribir?`)) return;
        const values = collectValues();
        PATIENT_KEYS.forEach((k) => delete values[k]);
        const next = list.filter((t) => t.name !== name).concat([{ name, values, savedAt: Date.now() }]);
        await saveTpls(next);
        await refreshTplSel(name);
        H().toast?.(`Plantilla "${name}" guardada`);
      };
      form.querySelector("#ar-doc-tpl-load").onclick = async () => {
        const name = tplSel.value;
        if (!name) { H().toast?.("Selecciona una plantilla"); return; }
        const list = await loadTpls();
        const t = list.find((x) => x.name === name);
        if (!t) return;
        applyValues(t.values || {});
        H().toast?.(`Plantilla "${name}" cargada (datos del paciente conservados)`);
      };
      form.querySelector("#ar-doc-tpl-update").onclick = async () => {
        const name = tplSel.value;
        if (!name) { H().toast?.("Selecciona una plantilla para actualizar"); return; }
        if (!confirm(`Sobrescribir "${name}" con los valores actuales?`)) return;
        const list = await loadTpls();
        const values = collectValues();
        PATIENT_KEYS.forEach((k) => delete values[k]);
        const next = list.map((t) => t.name === name ? { name, values, savedAt: Date.now() } : t);
        await saveTpls(next);
        await refreshTplSel(name);
        H().toast?.(`Plantilla "${name}" actualizada`);
      };
      form.querySelector("#ar-doc-tpl-del").onclick = async () => {
        const name = tplSel.value;
        if (!name) { H().toast?.("Selecciona una plantilla a eliminar"); return; }
        if (!confirm(`Eliminar plantilla "${name}"? Esta acción no se puede deshacer.`)) return;
        const list = await loadTpls();
        await saveTpls(list.filter((t) => t.name !== name));
        await refreshTplSel();
        H().toast?.(`Plantilla "${name}" eliminada`);
      };

      form.querySelector("#ar-doc-print").onclick = () => {
        const values = collectValues();
        const missing = (d.fields || []).filter((f) => f.required && !String(values[f.key] || "").trim());
        if (missing.length) { H().toast?.(`Faltan campos: ${missing.map((m) => m.label).join(", ")}`); return; }
        const RUT = window.__AR_RUT;
        if (values.rut && RUT && !RUT.validate(values.rut).ok) { H().toast?.("RUT inválido — revisa el dígito verificador"); return; }
        if (values.rut && RUT) values.rut = RUT.format(values.rut);
        D.print(id, values);
      };

      // ---- Historial dedicado (solo para "cuadro-medicamentos") ----
      if (id === "cuadro-medicamentos") {
        const applyPayload = (vals) => {
          if (!vals) return;
          form.querySelectorAll("[data-k]").forEach((el) => {
            const k = el.dataset.k;
            if (vals[k] != null) {
              el.value = vals[k];
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          });
        };

        form.querySelector("#ar-doc-edit-last")?.addEventListener("click", async () => {
          try {
            const list = await D.histList(id);
            if (!list.length || !list[0].payload) { H().toast?.("Sin cuadros previos para este médico"); return; }
            applyPayload(list[0].payload);
            H().toast?.("Último cuadro cargado · ajusta y vuelve a imprimir");
            form.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch { H().toast?.("No se pudo cargar el historial"); }
        });

        form.querySelector("#ar-doc-history")?.addEventListener("click", async () => {
          const list = await D.histList(id);
          openCuadroHistoryModal(list, applyPayload);
        });
      }
    }

    function openCuadroHistoryModal(items, applyPayload) {
      document.querySelectorAll(".ar-cuadro-hist-back").forEach((n) => n.remove());
      const med = window.__AR_CERTS?.getActiveMedico?.()?.nombre || "—";
      const fmt = (ts) => {
        const dt = new Date(ts);
        return dt.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      };
      const itemsHtml = items.length ? items.map((e) => {
        const meds = String(e.payload?.medicamentos || "")
          .split(/\r?\n/).map((l) => (l.split("|")[0] || "").trim()).filter(Boolean);
        const top = meds.slice(0, 3).join(", ");
        const more = meds.length > 3 ? ` (+${meds.length - 3})` : "";
        return `
          <div class="ar-cuadro-hist-item" data-id="${escapeHtml(e.id)}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fafbfd;border:1px solid #e2e8f0;border-radius:8px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">${escapeHtml(e.paciente || "(sin paciente)")} ${e.rut ? `<span style="color:#64748b;font-weight:400">· ${escapeHtml(e.rut)}</span>` : ""}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px">${escapeHtml(fmt(e.ts))}</div>
              ${top ? `<div style="font-size:11px;color:#475569;margin-top:2px">💊 ${escapeHtml(top)}${escapeHtml(more)}</div>` : ""}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="ar-btn ar-cuadro-hist-edit" type="button" ${e.payload ? "" : "disabled style='opacity:.4;cursor:not-allowed'"}>✏️ Editar</button>
              <button class="ar-btn ar-cuadro-hist-print" type="button">🖨</button>
              <button class="ar-btn ar-cuadro-hist-del" type="button" style="color:#dc2626">✕</button>
            </div>
          </div>`;
      }).join("") : `<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">No hay cuadros emitidos aún por este médico.</div>`;

      const back = document.createElement("div");
      back.className = "ar-cuadro-hist-back";
      back.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
      back.innerHTML = `
        <div role="dialog" aria-modal="true" aria-label="Historial de cuadros de medicamentos"
             style="width:100%;max-width:760px;max-height:92vh;background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.35);display:flex;flex-direction:column;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:linear-gradient(135deg,#0d9488,#14b8a6);color:#fff">
            <div>
              <h2 style="margin:0;font-size:16px;font-weight:700">📜 Historial · Cuadros de medicamentos</h2>
              <div style="font-size:11px;opacity:.85;margin-top:2px">Médico: ${escapeHtml(med)} · últimos ${D.histMax || 200} por usuario</div>
            </div>
            <button type="button" class="ar-cuadro-hist-x" title="Cerrar"
              style="background:rgba(255,255,255,.15);color:#fff;border:0;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>
          </div>
          <div style="padding:16px 18px;overflow:auto;background:#f8fafc">
            <div id="ar-cuadro-hist-list" style="display:flex;flex-direction:column;gap:8px">${itemsHtml}</div>
          </div>
          <div style="padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#fff">
            <span style="font-size:11px;color:#64748b">${items.length} cuadro(s) almacenado(s) localmente</span>
            <button type="button" class="ar-btn ar-cuadro-hist-close">Cerrar</button>
          </div>
        </div>`;
      document.body.appendChild(back);
      const close = () => back.remove();
      back.querySelector(".ar-cuadro-hist-x").onclick = close;
      back.querySelector(".ar-cuadro-hist-close").onclick = close;
      back.addEventListener("click", (e) => { if (e.target === back) close(); });

      back.querySelectorAll(".ar-cuadro-hist-item").forEach((row) => {
        const eid = row.getAttribute("data-id");
        const entry = items.find((x) => x.id === eid);
        if (!entry) return;
        row.querySelector(".ar-cuadro-hist-print")?.addEventListener("click", () => D.histReprint(entry));
        row.querySelector(".ar-cuadro-hist-edit")?.addEventListener("click", () => {
          if (!entry.payload) return;
          close();
          applyPayload(entry.payload);
          H().toast?.("Cuadro cargado para edición · ajusta y vuelve a imprimir");
        });
        row.querySelector(".ar-cuadro-hist-del")?.addEventListener("click", async () => {
          if (!confirm("¿Eliminar este cuadro del historial?")) return;
          await D.histRemove(eid);
          row.remove();
          if (!back.querySelector(".ar-cuadro-hist-item")) {
            back.querySelector("#ar-cuadro-hist-list").innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:13px">No hay cuadros emitidos aún por este médico.</div>`;
          }
        });
      });
    }

    function openUserDoc(u) {
      const isImg = (u.mime || "").startsWith("image/");
      const safeFile = (u.title || "archivo").replace(/[^\w.\-]+/g, "_") + (isImg ? (u.mime.includes("png") ? ".png" : ".jpg") : ".pdf");
      const viewer = isImg
        ? `<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:8px;text-align:center;max-height:70vh;overflow:auto"><img src="${escapeHtml(u.dataUrl)}" alt="${escapeHtml(u.title)}" style="max-width:100%;height:auto"/></div>`
        : `<iframe class="ar-pdf-frame" src="${escapeHtml(u.dataUrl)}#view=FitH" title="${escapeHtml(u.title)}"></iframe>`;
      form.innerHTML = `
        <div class="ar-doc-card">
          <div class="ar-clin-row">
            <h4 class="ar-clin-h4">${userDocIcon(u.mime)} ${escapeHtml(u.title)}</h4>
            <button class="ar-btn ar-doc-close" type="button">✕</button>
          </div>
          <div class="ar-clin-row" style="gap:6px;flex-wrap:wrap;font-size:11px;color:#475569;margin:4px 0 8px">
            <span>📁 <b>Categoría:</b></span>
            <input type="text" id="ar-userdoc-cat-edit" value="${escapeHtml(u.category || "")}" style="padding:2px 6px;min-width:140px"/>
            <span>· <b>Nombre:</b></span>
            <input type="text" id="ar-userdoc-name-edit" value="${escapeHtml(u.title || "")}" style="padding:2px 6px;flex:1;min-width:160px"/>
            <button type="button" class="ar-btn ar-btn-mini" id="ar-userdoc-save">💾 Guardar cambios</button>
          </div>
          ${viewer}
          <div class="ar-clin-row" style="margin-top:8px;gap:6px">
            <button class="ar-btn ar-btn-primary" id="ar-userdoc-open">🔍 Abrir en pestaña nueva</button>
            <a class="ar-btn" id="ar-userdoc-dl" href="${escapeHtml(u.dataUrl)}" download="${escapeHtml(safeFile)}">⬇ Descargar</a>
            <button class="ar-btn" id="ar-userdoc-print" style="background:#0f766e;color:#fff">🖨 Imprimir</button>
            <button class="ar-btn" id="ar-userdoc-del" style="margin-left:auto;color:#b91c1c">🗑 Eliminar</button>
          </div>
        </div>`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.querySelector(".ar-doc-close").onclick = () => { form.innerHTML = ""; };
      form.querySelector("#ar-userdoc-open").onclick = () => window.open(u.dataUrl, "_blank", "noopener");
      form.querySelector("#ar-userdoc-print").onclick = () => {
        const w = window.open(u.dataUrl, "_blank");
        if (w) setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 600);
      };
      form.querySelector("#ar-userdoc-save").onclick = async () => {
        const newTitle = (form.querySelector("#ar-userdoc-name-edit").value || "").trim() || u.title;
        const newCat = (form.querySelector("#ar-userdoc-cat-edit").value || "").trim() || "Mis archivos";
        userDocs = userDocs.map((x) => x.id === u.id ? { ...x, title: newTitle, category: newCat } : x);
        await saveUserDocs(userDocs);
        u.title = newTitle; u.category = newCat;
        refreshCatList();
        drawGrid();
        H().toast?.("Cambios guardados");
      };
      form.querySelector("#ar-userdoc-del").onclick = async () => {
        if (!confirm(`Eliminar "${u.title}"? Esta acción no se puede deshacer.`)) return;
        userDocs = userDocs.filter((x) => x.id !== u.id);
        await saveUserDocs(userDocs);
        refreshCatList();
        form.innerHTML = "";
        drawGrid();
        H().toast?.("Archivo eliminado");
      };
    }

    inp.oninput = drawGrid;
    D.ready.then(drawGrid);
    loadUserDocs().then((arr) => { userDocs = arr; refreshCatList(); drawGrid(); });
    drawGrid();
  }

  // ---------- Certificados ----------
  // Espera hasta `timeoutMs` a que window.__AR_CERTS esté disponible (los
  // scripts de la extensión se cargan en orden pero pueden tardar unos ms en
  // ejecutarse en algunos frames). Si no aparece, muestra el aviso de error.
  function waitForCerts(cont, timeoutMs, cb) {
    if (window.__AR_CERTS) { cb(window.__AR_CERTS); return; }
    cont.innerHTML = `<div class="ar-clin-empty">Cargando módulo de certificados…</div>`;
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.__AR_CERTS) { clearInterval(iv); cb(window.__AR_CERTS); return; }
      if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        cont.innerHTML = `<div class="ar-clin-empty">Módulo de certificados no disponible. Recarga la página de Rayen e inténtalo de nuevo.</div>`;
      }
    }, 80);
  }

  function renderCertificates(cont) {
    if (!window.__AR_CERTS) { waitForCerts(cont, 4000, () => renderCertificates(cont)); return; }
    const C = window.__AR_CERTS;
    const TIPOS = [
      { id: "atencion", label: "Certificado de Atención", icon: "🩺", color: "#3b82f6" },
      { id: "controles", label: "Certificado de Controles", icon: "📅", color: "#8b5cf6" },
      { id: "salud", label: "Certificado de Salud", icon: "💚", color: "#10b981" },
      { id: "reposo", label: "Certificado de Reposo", icon: "🛏", color: "#f59e0b" },
    ];
    cont.innerHTML = `
      <div id="ar-cert-medico"></div>
      <div class="ar-doc-tiles">
        ${TIPOS.map((t) => `<button class="ar-doc-tile" data-tipo="${t.id}" style="--c:${t.color}">
          <span class="ar-doc-icon">${t.icon}</span>
          <span class="ar-doc-title">${escapeHtml(t.label)}</span>
        </button>`).join("")}
      </div>
      <div id="ar-cert-form"></div>`;
    const form = cont.querySelector("#ar-cert-form");
    const medicoBox = cont.querySelector("#ar-cert-medico");

    function drawMedicoBox() {
      const med = C.getActiveMedico();
      const list = C.getMedicos();
      if (!list.length) {
        medicoBox.innerHTML = `<div class="ar-cert-warn">⚠ No hay médicos guardados. Ve a la pestaña <b>👤 Médicos firmantes</b> para agregar al menos uno.</div>`;
        return;
      }
      medicoBox.innerHTML = `<div class="ar-cert-medico-row">
        <label>Firmar como:
          <select id="ar-cert-medsel">${list.map((m) => `<option value="${escapeHtml(m.id)}" ${med?.id === m.id ? "selected" : ""}>${escapeHtml(m.nombre)} — ${escapeHtml(m.rut || "")}</option>`).join("")}</select>
        </label>
        ${med ? `<span class="ar-cert-meta">${escapeHtml(med.titulo || "MÉDICO CIRUJANO")} · ${escapeHtml(med.institucion || "CESFAM")}</span>` : ""}
      </div>`;
      medicoBox.querySelector("#ar-cert-medsel").onchange = (e) => { C.setActiveMedico(e.target.value).then(drawMedicoBox); };
    }

    cont.querySelectorAll("[data-tipo]").forEach((b) => b.onclick = () => openCertForm(b.dataset.tipo));

    function openCertForm(tipo) {
      const med = C.getActiveMedico();
      if (!med) { H().toast?.("⚠ Configura un médico firmante primero"); return; }
      const auto = autoFromPatient();

      let extra = "";
      if (tipo === "atencion") extra = `<label class="ar-doc-fld"><span>Detalle adicional (opcional)</span><textarea data-k="detalle" rows="2"></textarea></label>`;
      if (tipo === "controles") extra = `<label class="ar-doc-fld"><span>Tipo de control</span><input type="text" data-k="tipoControl" placeholder="cardiovascular, salud mental, etc."/></label>
        <label class="ar-doc-fld"><span>Observaciones (opcional)</span><textarea data-k="observaciones" rows="2"></textarea></label>`;
      if (tipo === "salud") extra = `<label class="ar-doc-fld"><span>Propósito (opcional)</span><select data-k="proposito"><option value="">— general —</option><option>laborales</option><option>educacionales</option><option>deportivos</option><option>licencia de conducir</option></select></label>
        <label class="ar-doc-fld" style="grid-column:1/-1"><span>Texto del certificado (editable) <button type="button" class="ar-btn ar-btn-mini" id="ar-cert-salud-reset" style="margin-left:8px">🔄 Regenerar sugerido</button></span><textarea data-k="cuerpoCustom" rows="7" placeholder="Se autocompleta con los datos del paciente y el diagnóstico. Edítalo libremente para ajustarlo al caso."></textarea></label>`;
      if (tipo === "reposo") extra = `<label class="ar-doc-fld"><span>Días de reposo *</span><input type="number" min="1" max="60" data-k="diasReposo" value="3"/></label>
        <label class="ar-doc-fld"><span>Inicio del reposo</span><input type="date" data-k="fechaInicioReposo"/></label>
        <label class="ar-doc-fld"><span>Observaciones (opcional)</span><textarea data-k="observaciones" rows="2"></textarea></label>`;

      const TIPO = TIPOS.find((x) => x.id === tipo);
      const sexoOpts = `<option value="M" ${auto.sexo === "M" ? "selected" : ""}>Masculino</option><option value="F" ${auto.sexo === "F" ? "selected" : ""}>Femenino</option>`;

      form.innerHTML = `
        <div class="ar-doc-card">
          <div class="ar-clin-row">
            <h4 class="ar-clin-h4">${TIPO.icon} ${escapeHtml(TIPO.label)}</h4>
            <button class="ar-btn ar-doc-close" type="button">✕</button>
          </div>
          ${autoBanner(auto)}
          <div class="ar-doc-form">
            <label class="ar-doc-fld"><span>Sexo *${badgeFor(auto, "sexo")}</span><select data-k="sexo">${sexoOpts}</select></label>
            <label class="ar-doc-fld"><span>Nombre completo del paciente *${badgeFor(auto, "nombre")}</span><input type="text" data-k="nombre" value="${escapeHtml(auto.nombreCompleto)}" placeholder="Juan Pérez López"/></label>
            <label class="ar-doc-fld"><span>RUT *${badgeFor(auto, "rut")}</span><input type="text" data-k="rut" value="${escapeHtml(auto.rut)}" placeholder="12.345.678-9"/></label>
            <label class="ar-doc-fld"><span>Diagnóstico (opcional)${badgeFor(auto, "diagnostico")}</span><input type="text" data-k="diagnostico" value="${escapeHtml(auto.diagnostico)}"/></label>
            ${extra}
          </div>
          <div class="ar-clin-row" style="margin-top:10px">
            <button class="ar-btn ar-btn-primary" id="ar-cert-print">🖨 Generar vista previa</button>
          </div>
        </div>`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      wireDxAlts(form);
      wireRutValidation(form);
      form.querySelector(".ar-doc-close").onclick = () => { form.innerHTML = ""; };

      // Re-detección sexo en vivo cuando el usuario edita el nombre
      const nombreInp = form.querySelector('[data-k="nombre"]');
      const sexoSel = form.querySelector('[data-k="sexo"]');
      if (nombreInp && sexoSel) {
        nombreInp.addEventListener("input", () => {
          const g = window.__AR_PATIENT?.guessSexo(nombreInp.value);
          if (g?.sexo && g.conf >= .9) sexoSel.value = g.sexo;
        });
      }

      // Salud: autocompletar texto editable y permitir regenerarlo
      if (tipo === "salud" && C.buildBodyText) {
        const txtEl = form.querySelector('[data-k="cuerpoCustom"]');
        const regen = () => {
          const d = {};
          form.querySelectorAll("[data-k]").forEach((el) => { if (el.dataset.k !== "cuerpoCustom") d[el.dataset.k] = el.value; });
          txtEl.value = C.buildBodyText("salud", d);
        };
        regen();
        ["nombre", "rut", "diagnostico", "sexo", "proposito"].forEach((k) => {
          const el = form.querySelector(`[data-k="${k}"]`);
          if (el) el.addEventListener("input", () => {
            // Solo regenerar si el usuario no ha editado manualmente el cuerpo
            if (!txtEl.dataset.touched) regen();
          });
        });
        txtEl.addEventListener("input", () => { txtEl.dataset.touched = "1"; });
        const resetBtn = form.querySelector("#ar-cert-salud-reset");
        if (resetBtn) resetBtn.onclick = () => { delete txtEl.dataset.touched; regen(); };
      }
      form.querySelector("#ar-cert-print").onclick = () => {
        const data = {};
        form.querySelectorAll("[data-k]").forEach((el) => { data[el.dataset.k] = el.value; });
        if (!data.nombre?.trim() || !data.rut?.trim()) { H().toast?.("Completa nombre y RUT del paciente"); return; }
        const RUT = window.__AR_RUT;
        if (RUT && !RUT.validate(data.rut).ok) { H().toast?.("RUT inválido — revisa el dígito verificador"); return; }
        if (RUT) data.rut = RUT.format(data.rut);
        if (tipo === "reposo" && !data.diasReposo) { H().toast?.("Indica los días de reposo"); return; }
        const html = C.buildCertificateHtml(tipo, data, C.getActiveMedico());
        C.print(html, {
          kind: "cert",
          subtype: tipo,
          label: TIPO.label,
          paciente: data.nombre,
          rut: data.rut,
        });
      };
    }

    C.ready.then(drawMedicoBox);
    drawMedicoBox();
  }

  // ---------- COMPIN ----------
  function renderCompin(cont) {
    if (!window.__AR_CERTS) { waitForCerts(cont, 4000, () => renderCompin(cont)); return; }
    const C = window.__AR_CERTS;
    const auto = autoFromPatient();
    // Para nacimiento: si auto.fechaNac viene en dd/mm/yyyy, convertir a yyyy-mm-dd para <input type=date>
    let fechaNacIso = "";
    if (auto.fechaNac) {
      const m = auto.fechaNac.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) {
        let y = m[3]; if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
        fechaNacIso = `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(auto.fechaNac)) {
        fechaNacIso = auto.fechaNac.slice(0, 10);
      }
    }

    cont.innerHTML = `
      <div class="ar-doc-card">
        <h4 class="ar-clin-h4">🧾 Informe Biomédico Funcional (COMPIN)</h4>
        <p class="ar-clin-hint">Documento para Calificación de Discapacidad. Se imprime en 2 carillas con la firma del médico activo.</p>

        ${autoBanner(auto)}

        <h5 class="ar-pharm-h5">I. Datos del usuario</h5>
        <div class="ar-doc-form">
          <label class="ar-doc-fld"><span>Apellidos *${badgeFor({ apellidos: auto.apellidos, missing: auto.apellidos ? [] : ["apellidos"] }, "apellidos")}</span><input data-k="apellidos" type="text" value="${escapeHtml(auto.apellidos)}"/></label>
          <label class="ar-doc-fld"><span>Nombre *${badgeFor(auto, "nombre")}</span><input data-k="nombre" type="text" value="${escapeHtml(auto.nombre)}"/></label>
          <label class="ar-doc-fld"><span>RUT *${badgeFor(auto, "rut")}</span><input data-k="rut" type="text" value="${escapeHtml(auto.rut)}"/></label>
          <label class="ar-doc-fld"><span>Fecha nacimiento${fechaNacIso ? ' <span class="ar-auto-badge ar-auto-ok">✓ auto</span>' : ""}</span><input data-k="fechaNac" type="date" value="${escapeHtml(fechaNacIso)}"/></label>
        </div>

        <h5 class="ar-pharm-h5">II. Causa(s) de discapacidad</h5>
        <div class="ar-compin-causas">
          <label><input type="checkbox" data-causa="fisica"/> Física</label>
          <label><input type="checkbox" data-causa="visual"/> Sensorial Visual</label>
          <label><input type="checkbox" data-causa="auditiva"/> Sensorial Auditiva</label>
          <label><input type="checkbox" data-causa="psiquica"/> Mental / psíquica</label>
          <label><input type="checkbox" data-causa="intelectual"/> Mental / Intelectual</label>
        </div>

        <h5 class="ar-pharm-h5">Diagnósticos asociados a la causa de discapacidad (hasta 4)</h5>
        <div class="ar-doc-form ar-compin-grid2">
          ${[0, 1, 2, 3].map((i) => `<label class="ar-doc-fld"><span>Dx ${i + 1}</span><input data-diag="${i}" type="text"/></label>`).join("")}
        </div>

        <h5 class="ar-pharm-h5">Otros diagnósticos (hasta 4)</h5>
        <div class="ar-doc-form ar-compin-grid2">
          ${[0, 1, 2, 3].map((i) => `<label class="ar-doc-fld"><span>Otro ${i + 1}</span><input data-otro="${i}" type="text"/></label>`).join("")}
        </div>

        <div class="ar-doc-form">
          <label class="ar-doc-fld"><span>Breve historia de la condición de salud</span><textarea data-k="breveHistoria" rows="4"></textarea></label>
          <label class="ar-doc-fld"><span>Medicamentos indicados</span><textarea data-k="medicamentos" rows="3"></textarea></label>
          <label class="ar-doc-fld"><span>Descripción del estado funcional</span><textarea data-k="estadoFuncional" rows="3"></textarea></label>
          <label class="ar-doc-fld"><span>Atenciones / intervenciones recibidas</span><textarea data-k="atenciones" rows="3"></textarea></label>
        </div>

        <h5 class="ar-pharm-h5">Ayudas técnicas</h5>
        <div class="ar-doc-form ar-compin-grid2">
          <label class="ar-doc-fld"><span>¿Requiere ayuda técnica?</span><select data-k="requiereAyuda"><option value="">—</option><option value="si">Sí</option><option value="no">No</option></select></label>
          <label class="ar-doc-fld"><span>Cuál(es)</span><input data-k="requiereAyudaCuales" type="text"/></label>
          <label class="ar-doc-fld"><span>¿Usa ayuda técnica?</span><select data-k="usaAyuda"><option value="">—</option><option value="si">Sí</option><option value="no">No</option></select></label>
          <label class="ar-doc-fld"><span>Cuál(es)</span><input data-k="usaAyudaCuales" type="text"/></label>
        </div>

        <h5 class="ar-pharm-h5">III. Profesionales tratantes</h5>
        <div id="ar-compin-profs">
          ${[0, 1, 2].map((i) => `<div class="ar-compin-prof"><input data-prof="${i}-nombre" placeholder="Nombre y apellido"/><input data-prof="${i}-profesion" placeholder="Profesión"/><input data-prof="${i}-rut" placeholder="RUT"/><input data-prof="${i}-telefono" placeholder="Teléfono"/></div>`).join("")}
        </div>

        <h5 class="ar-pharm-h5">IV. Profesional informante (datos del médico activo)</h5>
        <div class="ar-doc-form ar-compin-grid2">
          <label class="ar-doc-fld"><span>Correo electrónico</span><input data-k="correoProf" type="email"/></label>
          <label class="ar-doc-fld"><span>Teléfono</span><input data-k="telefonoProf" type="text"/></label>
        </div>

        <div class="ar-clin-row" style="margin-top:14px">
          <button class="ar-btn ar-btn-primary" id="ar-compin-print">🖨 Generar vista previa</button>
        </div>
      </div>`;

    wireDxAlts(cont);
    wireRutValidation(cont);
    cont.querySelector("#ar-compin-print").onclick = () => {
      const d = {};
      cont.querySelectorAll("[data-k]").forEach((el) => { d[el.dataset.k] = el.value; });
      d.causas = {};
      cont.querySelectorAll("[data-causa]").forEach((el) => { d.causas[el.dataset.causa] = el.checked; });
      d.diagDiscapacidad = ["", "", "", ""];
      cont.querySelectorAll("[data-diag]").forEach((el) => { d.diagDiscapacidad[parseInt(el.dataset.diag, 10)] = el.value; });
      d.otrosDiag = ["", "", "", ""];
      cont.querySelectorAll("[data-otro]").forEach((el) => { d.otrosDiag[parseInt(el.dataset.otro, 10)] = el.value; });
      d.profesionales = [{}, {}, {}];
      cont.querySelectorAll("[data-prof]").forEach((el) => {
        const [i, k] = el.dataset.prof.split("-");
        d.profesionales[parseInt(i, 10)][k] = el.value;
      });
      if (!d.apellidos?.trim() || !d.nombre?.trim() || !d.rut?.trim()) { H().toast?.("Completa apellidos, nombre y RUT"); return; }
      const RUT = window.__AR_RUT;
      if (RUT && !RUT.validate(d.rut).ok) { H().toast?.("RUT del paciente inválido — revisa el dígito verificador"); return; }
      if (RUT) d.rut = RUT.format(d.rut);
      // Validar también RUTs de profesionales tratantes (si se ingresaron)
      for (const p of d.profesionales) {
        if (p.rut && RUT && !RUT.validate(p.rut).ok) { H().toast?.(`RUT de profesional "${p.nombre || ""}" inválido`); return; }
        if (p.rut && RUT) p.rut = RUT.format(p.rut);
      }
      const html = C.buildCompinHtml(d, C.getActiveMedico());
      C.print(html, {
        kind: "compin",
        subtype: "compin",
        label: "Informe Biomédico Funcional (COMPIN)",
        paciente: `${d.apellidos} ${d.nombre}`.trim(),
        rut: d.rut,
      });
    };
  }

  // ---------- Médicos firmantes ----------
  function renderMedicos(cont) {
    if (!window.__AR_CERTS) { waitForCerts(cont, 4000, () => renderMedicos(cont)); return; }
    const C = window.__AR_CERTS;

    function draw() {
      const list = C.getMedicos();
      const active = C.getActiveMedico();
      cont.innerHTML = `
        <p class="ar-clin-hint">Médicos firmantes guardados localmente. Sus datos se rellenarán automáticamente al generar certificados.</p>
        <div class="ar-medicos-list">
          ${list.length ? list.map((m) => `
            <div class="ar-medico-card ${active?.id === m.id ? "active" : ""}" data-id="${escapeHtml(m.id)}">
              <div class="ar-medico-info">
                <b>${escapeHtml(m.nombre)}</b> ${active?.id === m.id ? '<span class="ar-medico-badge">activo</span>' : ""}
                <div class="ar-medico-meta">RUT: ${escapeHtml(m.rut || "—")} · ${escapeHtml(m.titulo || "MÉDICO CIRUJANO")} · ${escapeHtml(m.institucion || "CESFAM")}</div>
                ${m.registro || m.email || m.telefono ? `<div class="ar-medico-meta">${m.registro ? "Reg.SIS: " + escapeHtml(m.registro) + " · " : ""}${m.email ? escapeHtml(m.email) + " · " : ""}${m.telefono ? escapeHtml(m.telefono) : ""}</div>` : ""}
              </div>
              <div class="ar-medico-actions">
                ${active?.id !== m.id ? `<button class="ar-btn ar-medico-act">Activar</button>` : ""}
                <button class="ar-btn ar-medico-edit">✏</button>
                <button class="ar-btn ar-medico-del">🗑</button>
              </div>
            </div>`).join("") : `<div class="ar-clin-empty">Aún no hay médicos guardados.</div>`}
        </div>
        <div class="ar-clin-row" style="margin-top:10px">
          <button class="ar-btn ar-btn-primary" id="ar-medico-new">➕ Agregar médico</button>
        </div>
        <div id="ar-medico-form"></div>`;

      cont.querySelectorAll(".ar-medico-card").forEach((card) => {
        const id = card.dataset.id;
        card.querySelector(".ar-medico-act")?.addEventListener("click", () => C.setActiveMedico(id).then(draw));
        card.querySelector(".ar-medico-edit")?.addEventListener("click", () => openMedicoForm(C.getMedicos().find((m) => m.id === id)));
        card.querySelector(".ar-medico-del")?.addEventListener("click", () => {
          if (confirm("¿Eliminar este médico?")) C.removeMedico(id).then(draw);
        });
      });
      cont.querySelector("#ar-medico-new").onclick = () => openMedicoForm(null);
    }

    function openMedicoForm(med) {
      const f = cont.querySelector("#ar-medico-form");
      const m = med || { nombre: "", rut: "", titulo: "MÉDICO CIRUJANO", institucion: "CESFAM", registro: "", email: "", telefono: "" };
      f.innerHTML = `
        <div class="ar-doc-card">
          <h4 class="ar-clin-h4">${med ? "Editar médico" : "Nuevo médico"}</h4>
          <div class="ar-doc-form ar-compin-grid2">
            <label class="ar-doc-fld"><span>Nombre completo *</span><input data-mk="nombre" value="${escapeHtml(m.nombre)}"/></label>
            <label class="ar-doc-fld"><span>RUT *</span><input data-mk="rut" value="${escapeHtml(m.rut)}" placeholder="12.345.678-9"/></label>
            <label class="ar-doc-fld"><span>Profesión / título</span><input data-mk="titulo" value="${escapeHtml(m.titulo)}"/></label>
            <label class="ar-doc-fld"><span>Institución</span><input data-mk="institucion" value="${escapeHtml(m.institucion)}"/></label>
            <label class="ar-doc-fld"><span>Registro SIS (opcional)</span><input data-mk="registro" value="${escapeHtml(m.registro || "")}"/></label>
            <label class="ar-doc-fld"><span>Correo (opcional)</span><input data-mk="email" type="email" value="${escapeHtml(m.email || "")}"/></label>
            <label class="ar-doc-fld"><span>Teléfono (opcional)</span><input data-mk="telefono" value="${escapeHtml(m.telefono || "")}"/></label>
          </div>
          <div class="ar-clin-row" style="margin-top:10px">
            <button class="ar-btn ar-btn-primary" id="ar-medico-save">💾 Guardar</button>
            <button class="ar-btn" id="ar-medico-cancel">Cancelar</button>
          </div>
        </div>`;
      f.scrollIntoView({ behavior: "smooth", block: "start" });
      f.querySelector("#ar-medico-cancel").onclick = () => { f.innerHTML = ""; };
      f.querySelector("#ar-medico-save").onclick = async () => {
        const data = {};
        f.querySelectorAll("[data-mk]").forEach((el) => { data[el.dataset.mk] = el.value.trim(); });
        if (!data.nombre || !data.rut) { H().toast?.("Nombre y RUT son obligatorios"); return; }
        if (med) await C.updateMedico(med.id, data);
        else await C.addMedico(data);
        H().toast?.(med ? "✅ Médico actualizado" : "✅ Médico agregado");
        draw();
      };
    }

    C.ready.then(draw);
    draw();
  }

  // ---------- Historial de documentos generados ----------
  function renderHistorial(cont) {
    const HIST = window.__AR_HIST;
    if (!HIST) { cont.innerHTML = `<div class="ar-clin-empty">Módulo de historial no disponible.</div>`; return; }

    const KIND_LABEL = {
      doc: { txt: "Documento", color: "#0ea5a4", icon: "📄" },
      cert: { txt: "Certificado", color: "#3b82f6", icon: "📝" },
      compin: { txt: "COMPIN", color: "#8b5cf6", icon: "🧾" },
    };

    function fmtDate(ts) {
      const d = new Date(ts);
      const today = new Date();
      const sameDay = d.toDateString() === today.toDateString();
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      const sameYesterday = d.toDateString() === yesterday.toDateString();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      if (sameDay) return `Hoy · ${hh}:${mm}`;
      if (sameYesterday) return `Ayer · ${hh}:${mm}`;
      return d.toLocaleDateString("es-CL") + ` · ${hh}:${mm}`;
    }

    function draw() {
      const all = HIST.list();
      const q = (cont.querySelector("#ar-hist-q")?.value || "").toLowerCase().trim();
      const filt = !q ? all : all.filter((e) =>
        (e.paciente + " " + e.rut + " " + e.label + " " + e.medico).toLowerCase().includes(q)
      );

      cont.innerHTML = `
        <div class="ar-clin-row" style="gap:8px;align-items:center">
          <input type="search" id="ar-hist-q" class="ar-clin-search" placeholder="Buscar por paciente, RUT, tipo o médico..." value="${escapeHtml(q)}"/>
          ${all.length ? `<button class="ar-btn ar-hist-clear" title="Borrar todo el historial">🗑 Vaciar</button>` : ""}
        </div>
        <p class="ar-clin-hint">📚 Últimos ${all.length} documentos generados (máx. 200, locales). Reimprime con un clic.</p>
        <div class="ar-hist-list">
          ${!filt.length ? `<div class="ar-clin-empty">${all.length ? "Sin coincidencias para tu búsqueda." : "Aún no has generado documentos. Aparecerán aquí automáticamente."}</div>` : filt.map((e) => {
            const k = KIND_LABEL[e.kind] || KIND_LABEL.doc;
            return `<div class="ar-hist-card" data-id="${escapeHtml(e.id)}">
              <div class="ar-hist-icon" style="background:${k.color}22;color:${k.color}">${k.icon}</div>
              <div class="ar-hist-info">
                <div class="ar-hist-title">${escapeHtml(e.label)} <span class="ar-hist-kind" style="background:${k.color}22;color:${k.color}">${k.txt}</span></div>
                <div class="ar-hist-meta">
                  ${e.paciente ? `<b>${escapeHtml(e.paciente)}</b>` : "<i>sin paciente</i>"}
                  ${e.rut ? ` · ${escapeHtml(e.rut)}` : ""}
                  ${e.medico ? ` · 👤 ${escapeHtml(e.medico)}` : ""}
                </div>
                <div class="ar-hist-date">${fmtDate(e.ts)}</div>
              </div>
              <div class="ar-hist-actions">
                <button class="ar-btn ar-btn-primary ar-hist-reprint" title="Reimprimir">🖨</button>
                <button class="ar-btn ar-hist-del" title="Eliminar de historial">🗑</button>
              </div>
            </div>`;
          }).join("")}
        </div>`;

      const inp = cont.querySelector("#ar-hist-q");
      if (inp) inp.oninput = draw;
      cont.querySelector(".ar-hist-clear")?.addEventListener("click", async () => {
        if (confirm("¿Borrar todo el historial de documentos?")) { await HIST.clear(); draw(); }
      });
      cont.querySelectorAll(".ar-hist-card").forEach((card) => {
        const id = card.dataset.id;
        card.querySelector(".ar-hist-reprint").onclick = () => HIST.reprint(id);
        card.querySelector(".ar-hist-del").onclick = async () => { await HIST.remove(id); draw(); };
      });
    }

    HIST.ready.then(draw);
    draw();
  }

  window.__AR_CLINICAL_UI = { open, close };
})();

