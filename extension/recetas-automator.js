/* Vínculo — Automatizador de "Receta" (renovación de medicamentos crónicos).
 *
 * Replica el flujo capturado de 25 pasos:
 *  Anamnesis:
 *    - Abrir colapsable "Anamnesis" (1ª li del list-group)
 *    - motivoConsulta = "Receta"
 *    - historiaEnfermedad = "Renovación de medicamentos crónicos"
 *    - Click "Agregar" del header (guarda anamnesis)
 *  Diagnóstico:
 *    - Abrir colapsable "Diagnóstico" (2ª li del list-group)
 *    - Click + (agregar diagnóstico)
 *    - #diagnosis ← "rece" → seleccionar opción "Consulta para repetición de receta" (Z76.0)
 *    - #estado-diagnostico ← "2" (Repetición)
 *    - "Agregar" del header → confirmar modal → flecha atrás x2
 *  Actividad:
 *    - Abrir colapsable "Actividad" (3ª li del list-group)
 *    - #activity ← "abre" → seleccionar 2ª opción ("Consulta abreviada")
 *    - "Agregar" del header → flecha atrás
 *
 * Expone window.__AR_RECETA.run().
 */
(function () {
  if (window.__AR_RECETA) return;

  const H = () => window.__AR_HOST || {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  async function waitFor(predicate, { timeout = 5000, interval = 80 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = predicate();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  function allDocs() {
    const docs = [document];
    try {
      document.querySelectorAll("iframe").forEach((f) => {
        try { const d = f.contentDocument; if (d) docs.push(d); } catch (_) {}
      });
    } catch (_) {}
    return docs;
  }
  function qAll(selector) {
    const out = [];
    for (const d of allDocs()) {
      try { out.push(...d.querySelectorAll(selector)); } catch (_) {}
    }
    return out;
  }
  function isVisible(el) {
    if (!el) return false;
    const rects = el.getClientRects?.();
    if (!rects || rects.length === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false;
    const win = el.ownerDocument?.defaultView || window;
    const cs = win.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity || "1") >= 0.1;
  }

  function setNativeValue(el, value) {
    const win = el.ownerDocument?.defaultView || window;
    const proto = el.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype
                : el.tagName === "SELECT"   ? win.HTMLSelectElement.prototype
                : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    try { el._valueTracker?.setValue?.(String(value) === "" ? "__ar_prev__" : ""); } catch (_) {}
  }

  function clickElement(el) {
    if (!el) return false;
    try {
      el.scrollIntoView?.({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(Math.max(r.width / 2, 4), Math.max(r.width - 4, 4));
      const y = r.top + Math.min(Math.max(r.height / 2, 4), Math.max(r.height - 4, 4));
      ["pointerdown", "mousedown", "mouseup", "click"].forEach((type) => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView || window, clientX: x, clientY: y }));
      });
      return true;
    } catch (_) {
      try { el.click(); return true; } catch (_) { return false; }
    }
  }

  function focusAndType(el, value) {
    el.focus();
    clickElement(el);
    setNativeValue(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    for (const ch of String(value || "")) {
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: ch }));
      setNativeValue(el, (el.value || "") + ch);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: ch }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: ch }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Setea valor + dispara eventos (para inputs/selects sin escribir tecla a tecla).
  function setValueAndFire(el, value) {
    setNativeValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ============ Helpers de UI Rayen ============

  // Abre el colapsable de un section (Anamnesis / Diagnóstico / Actividad).
  // Estrategia: buscar dentro de ul.list-group el <li> cuya cabecera contenga
  // el texto de la sección. Si no está expandido (no tiene .show), click en
  // su botón "+" o en el header para abrirlo.
  function findSectionLi(sectionName) {
    const target = norm(sectionName);
    const lis = qAll("ul.list-group > li.px-2.pb-1, ul.list-group > li").filter(isVisible);
    for (const li of lis) {
      const headerTxt = norm(li.querySelector(".collapse-text, .container, .section-header, h3, h4, strong")?.innerText
                          || li.firstElementChild?.innerText
                          || li.innerText?.split("\n")[0] || "");
      if (headerTxt.startsWith(target) || headerTxt.includes(target)) return li;
    }
    // Fallback: el primer hijo que parezca cabecera con ese texto.
    return lis.find((li) => norm(li.innerText || "").includes(target)) || null;
  }

  async function openSection(sectionName, expectSelector = null) {
    const li = findSectionLi(sectionName);
    if (!li) throw new Error(`No encontré la sección "${sectionName}".`);

    // Si el campo esperado ya está presente, no abrimos nada.
    if (expectSelector && findInput(expectSelector)) return li;

    // 1) Asegurar que el colapsable interno está expandido.
    let collapse = li.querySelector(".collapse.show, .collapse-text.collapse.show");
    if (!collapse) {
      // Click en el header/chevron para expandir el collapse-text.
      const chevron = li.querySelector("[data-toggle='collapse'], .collapse-text > button, .container.mb-0 > button:not(.btn-info)")
                   || li.querySelector("button:not(.btn-info)")
                   || li.firstElementChild;
      if (chevron) clickElement(chevron);
      collapse = await waitFor(() => li.querySelector(".collapse.show, .collapse-text.collapse.show"), { timeout: 1500 })
              || li;
    }

    // 2) Click en el btn-info "Agregar!" interno para mostrar el formulario.
    const addBtn = (collapse || li).querySelector("button.btn.btn-info, button.btn-info");
    if (addBtn && isVisible(addBtn)) {
      clickElement(addBtn);
      // Esperamos a que aparezca el campo esperado (o cualquier form de attention).
      if (expectSelector) {
        await waitFor(() => findInput(expectSelector), { timeout: 4000 });
      } else {
        await waitFor(() => qAll(".attention-form, .attention-forms-card-body, form").some(isVisible), { timeout: 2000 });
      }
    }
    return li;
  }

  function findInput(idOrSelector) {
    // Busca por #id primero, luego como selector libre.
    if (idOrSelector.startsWith("#")) {
      for (const d of allDocs()) {
        const el = d.querySelector(idOrSelector);
        if (el && isVisible(el) && !el.disabled) return el;
      }
      // visible-fallback con cualquier element con ese id en otros docs
      for (const d of allDocs()) {
        const el = d.querySelector(idOrSelector);
        if (el) return el;
      }
      return null;
    }
    return qAll(idOrSelector).find((el) => isVisible(el) && !el.disabled) || null;
  }

  // Botón "Agregar" del header (guarda y cierra panel).
  function findHeaderSaveButton() {
    return qAll("button.add-header-button.btn, button.add-header-button")
      .find((b) => isVisible(b) && !b.disabled && norm(b.innerText || b.textContent || "") === "agregar")
      || null;
  }

  // Botón flecha atrás (i.fa-arrow-left dentro de attention-form-header).
  function findBackButton() {
    return qAll(".attention-form-header button.btn, .attention-form-header button.pl-0.btn, button.pl-0.btn")
      .filter((b) => isVisible(b) && b.querySelector?.("i.fa-arrow-left, i.fal.fa-arrow-left"))[0]
      || null;
  }

  // Botón "+" (agregar diagnóstico/actividad dentro del card).
  function findPlusButton(sectionLi) {
    const root = sectionLi || document;
    const cands = root.querySelectorAll(".attention-forms-card-body .text-right i.fal.fa-plus, .text-right i.fal.fa-plus, .text-right .fa-plus, i.fal.fa-plus");
    for (const i of cands) {
      const btn = i.closest("button, a, [role='button'], div");
      if (btn && isVisible(btn)) return btn;
    }
    return null;
  }

  // Espera y selecciona una opción del autocomplete (ul.options > li).
  // matchText: substring (case/diacritics-insensitive) o índice (1-based) si number.
  async function pickAutocompleteOption(matchText, { timeout = 3500 } = {}) {
    const li = await waitFor(() => {
      const lis = qAll("ul.options > li, .autocomplete-container ul.options li").filter(isVisible);
      if (typeof matchText === "number") return lis[matchText - 1] || null;
      const m = norm(matchText);
      // 1) Exacto
      const exact = lis.find((el) => norm(el.innerText || el.textContent) === m);
      if (exact) return exact;
      // 2) Substring
      const sub = lis.find((el) => norm(el.innerText || el.textContent).includes(m));
      if (sub) return sub;
      // 3) Si solo hay una opción, úsala.
      if (lis.length === 1) return lis[0];
      return null;
    }, { timeout });
    if (!li) throw new Error(`No apareció opción para "${matchText}" en el autocomplete.`);
    clickElement(li);
    await sleep(150);
    return li;
  }

  // Modal de confirmación (botón float-right.text-white "Confirmar/Aceptar/Sí").
  async function confirmModalIfPresent() {
    const btn = await waitFor(() => {
      const cands = qAll(".modal.fade .modal-footer button.float-right.text-white, .modal.show .modal-footer button.float-right.text-white, .modal-footer button.float-right.text-white, .modal-dialog .modal-footer button.btn-primary");
      return cands.find((b) => isVisible(b) && !b.disabled) || null;
    }, { timeout: 1500 });
    if (btn) {
      clickElement(btn);
      await sleep(250);
      return true;
    }
    return false;
  }

  // ============ FLUJO PRINCIPAL ============

  async function run(onProgress) {
    const log = (msg, kind = "running") => {
      try { onProgress?.(msg, kind); } catch (_) {}
      try { console.info(`[AR:Receta] ${msg}`); } catch (_) {}
    };

    // ---------- 1) ANAMNESIS ----------
    log("(1/3) Anamnesis: abriendo sección…");
    await openSection("Anamnesis", "#motivoConsulta");
    await sleep(150);

    // motivoConsulta
    const motivo = await waitFor(() => findInput("#motivoConsulta"), { timeout: 2500 });
    if (!motivo) throw new Error("No encontré #motivoConsulta.");
    clickElement(motivo);
    focusAndType(motivo, "Receta");
    await sleep(120);

    // historiaEnfermedad
    const historia = await waitFor(() => findInput("#historiaEnfermedad"), { timeout: 2000 });
    if (!historia) throw new Error("No encontré #historiaEnfermedad.");
    clickElement(historia);
    focusAndType(historia, "Renovación de medicamentos crónicos");
    await sleep(120);

    // Guardar anamnesis (Agregar header).
    let saveBtn = findHeaderSaveButton();
    if (saveBtn) {
      log("Anamnesis: guardando…");
      clickElement(saveBtn);
      await sleep(400);
    }

    // ---------- 2) DIAGNÓSTICO ----------
    log("(2/3) Diagnóstico: abriendo sección…");
    const dxLi = await openSection("Diagn", "#diagnosis");
    await sleep(200);

    // Click en "+" para agregar diagnóstico
    const plus = await waitFor(() => findPlusButton(dxLi) || findPlusButton(), { timeout: 1500 });
    if (plus) {
      clickElement(plus);
      await sleep(250);
    }

    // #diagnosis ← "rece"
    const dx = await waitFor(() => findInput("#diagnosis"), { timeout: 2500 });
    if (!dx) throw new Error("No encontré #diagnosis.");
    clickElement(dx);
    focusAndType(dx, "rece");
    await sleep(150);

    // Elegir opción que contenga "repeticion de receta" (Z76.0).
    log("Diagnóstico: seleccionando 'Consulta para repetición de receta'…");
    await pickAutocompleteOption("repeticion de receta");
    await sleep(200);

    // #estado-diagnostico ← "2" (Repetición)
    const estado = await waitFor(() => findInput("#estado-diagnostico"), { timeout: 2000 });
    if (estado) {
      clickElement(estado);
      if (estado.tagName === "SELECT") {
        // Buscar opción cuyo value sea "2" o cuyo texto contenga "repeticion"/"repetición".
        const opts = Array.from(estado.options || []);
        const opt = opts.find((o) => o.value === "2") || opts.find((o) => norm(o.text).includes("repet"));
        if (opt) setValueAndFire(estado, opt.value);
        else setValueAndFire(estado, "2");
      } else {
        focusAndType(estado, "2");
      }
      await sleep(150);
    }

    // Guardar diagnóstico (Agregar header)
    saveBtn = findHeaderSaveButton();
    if (saveBtn) {
      log("Diagnóstico: guardando…");
      clickElement(saveBtn);
      await sleep(300);
    }
    // Confirmar modal si aparece
    await confirmModalIfPresent();
    await sleep(200);

    // Salir de subcards: flecha atrás (puede aparecer hasta 2 veces).
    for (let i = 0; i < 2; i++) {
      const back = findBackButton();
      if (!back) break;
      clickElement(back);
      await sleep(200);
    }

    // ---------- 3) ACTIVIDAD ----------
    log("(3/3) Actividad: abriendo sección…");
    const actLi = await openSection("Actividad", "#activity");
    await sleep(200);

    // #activity ← "abre"
    const act = await waitFor(() => findInput("#activity"), { timeout: 2500 });
    if (!act) throw new Error("No encontré #activity.");
    clickElement(act);
    focusAndType(act, "abre");
    await sleep(150);

    // Elegir "consulta abreviada" (en el flujo grabado fue la 2ª opción).
    log("Actividad: seleccionando 'Consulta abreviada'…");
    try {
      await pickAutocompleteOption("consulta abreviada");
    } catch (_) {
      // Fallback: 2ª opción.
      await pickAutocompleteOption(2);
    }
    await sleep(200);

    // Guardar actividad
    saveBtn = findHeaderSaveButton();
    if (saveBtn) {
      log("Actividad: guardando…");
      clickElement(saveBtn);
      await sleep(300);
    }

    // Salir
    const back = findBackButton();
    if (back) { clickElement(back); await sleep(150); }

    log("✓ Receta completa.", "ok");
    return { ok: true };
  }

  window.__AR_RECETA = { run };
})();
