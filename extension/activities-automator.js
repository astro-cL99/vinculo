/* Vínculo — Automatizador de Actividades.
 *
 * Replica el flujo manual capturado:
 *   1) click button.btn.btn-info ("Agregar!")  → abre panel "Agregar actividad"
 *   2) click + escribir en textarea#activity (autocomplete)
 *   3) click en <li> dentro de ul.options cuyo texto contenga la actividad
 *   4) click button.add-header-button ("Agregar")  → guarda y cierra panel
 *   5) repetir por cada actividad de la plantilla
 *
 * Expone window.__AR_ACT_UI.open() y se conecta al FAB desde content.js.
 */
(function () {
  if (window.__AR_ACT_UI) return;

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

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function findAddOpenButton() {
    // Botón "Agregar!" que abre el panel lateral derecho de actividades.
    const buttons = Array.from(document.querySelectorAll("button.btn.btn-info"));
    return buttons.find((b) => /agregar/i.test((b.innerText || "").trim())) || null;
  }

  function findActivityTextarea() {
    return document.querySelector("textarea#activity.form-control")
        || document.querySelector("textarea#activity");
  }

  function findOptionLi(matchText) {
    const m = norm(matchText);
    const lis = Array.from(document.querySelectorAll("ul.options > li, .autocomplete-container ul.options li"));
    // Match exacto primero, luego "incluye"
    let exact = lis.find((li) => norm(li.innerText || li.textContent) === m);
    if (exact) return exact;
    return lis.find((li) => norm(li.innerText || li.textContent).includes(m)) || null;
  }

  function findAnyOptionLi() {
    return document.querySelector("ul.options > li, .autocomplete-container ul.options li");
  }

  function findSaveButton() {
    // Botón "Agregar" en el header del panel lateral (add-header-button).
    return document.querySelector("button.add-header-button.btn.btn-outline-light")
        || document.querySelector("button.add-header-button");
  }

  function panelIsOpen() {
    return !!document.querySelector("textarea#activity");
  }

  async function addOneActivity(activity, idx, total, onProgress) {
    onProgress?.(`(${idx + 1}/${total}) ${activity.match}`, "running");

    // 1) Abrir panel si no está abierto
    if (!panelIsOpen()) {
      const openBtn = findAddOpenButton();
      if (!openBtn) throw new Error("No encontré el botón 'Agregar!' para abrir el panel.");
      openBtn.click();
    }

    // 2) Esperar textarea
    const ta = await waitFor(findActivityTextarea, { timeout: 4000 });
    if (!ta) throw new Error("No apareció el campo de actividad.");
    ta.focus();
    ta.click();
    await sleep(100);

    // 3) Escribir query (dispara autocomplete)
    setNativeValue(ta, activity.query);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    // Algunos autocompletes escuchan keyup
    ta.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: activity.query.slice(-1) }));

    // 4) Esperar opciones y elegir match
    const li = await waitFor(() => {
      const found = findOptionLi(activity.match);
      if (found) return found;
      // Si hay opciones pero ninguna matchea, devolver null para seguir esperando
      return null;
    }, { timeout: 3500 });

    if (!li) {
      // Fallback: si hay UNA sola opción, tomarla; si no, abortar esta actividad.
      const lis = document.querySelectorAll("ul.options > li");
      if (lis.length === 1) {
        lis[0].click();
      } else {
        throw new Error(`No encontré opción para "${activity.match}" (query="${activity.query}")`);
      }
    } else {
      li.click();
    }

    await sleep(150);

    // 5) Click en "Agregar" (add-header-button)
    const saveBtn = await waitFor(findSaveButton, { timeout: 3000 });
    if (!saveBtn) throw new Error("No encontré el botón 'Agregar' del header.");
    saveBtn.click();

    // 6) Esperar a que el panel se cierre o se reinicie (textarea desaparece o se vacía)
    await waitFor(() => {
      const t = findActivityTextarea();
      return !t || t.value === "";
    }, { timeout: 3500 });

    await sleep(250);
    onProgress?.(`✓ ${activity.match}`, "ok");
  }

  async function applyTemplate(template, onProgress) {
    if (!template || !template.activities?.length) {
      H().toast?.("Plantilla vacía.");
      return { ok: 0, fail: 0, errors: [] };
    }
    let ok = 0, fail = 0;
    const errors = [];
    for (let i = 0; i < template.activities.length; i++) {
      const act = template.activities[i];
      try {
        await addOneActivity(act, i, template.activities.length, onProgress);
        ok++;
      } catch (err) {
        fail++;
        errors.push({ activity: act, error: err.message });
        onProgress?.(`✗ ${act.match}: ${err.message}`, "fail");
        // Intentar cerrar el panel para reintentar siguiente actividad
        await sleep(300);
      }
    }
    H().toast?.(`Actividades: ${ok} ok${fail ? `, ${fail} fallidas` : ""}.`);
    return { ok, fail, errors };
  }

  // ---------------- UI ----------------
  let modal = null;
  function close() { if (modal) { modal.remove(); modal = null; } }

  function open() {
    if (modal) { close(); return; }
    const list = window.__AR_ACTIVITIES?.list?.() || [];
    const suggestId = window.__AR_ACTIVITIES?.suggest?.();

    modal = document.createElement("div");
    modal.id = "ar-act";
    modal.innerHTML = `
      <div class="ar-act-card">
        <header>
          <strong>📝 Actividades PSCV</strong>
          <button class="ar-act-close" type="button" title="Cerrar">✕</button>
        </header>
        <div class="ar-act-body">
          <div class="ar-act-help">
            Selecciona una plantilla y pulsa <b>Aplicar</b>. Se ejecutará el ciclo
            <i>Agregar → buscar → seleccionar → Guardar</i> por cada actividad.
            <br><small>⚠ No muevas el mouse ni cambies de pestaña durante la ejecución.</small>
          </div>
          ${suggestId ? `<div class="ar-act-suggest">💡 Sugerencia automática: <b>${escapeHtml(window.__AR_ACTIVITIES.get(suggestId)?.name || suggestId)}</b></div>` : ""}
          <label class="ar-act-label">Plantilla:
            <select id="ar-act-select" class="ar-act-select">
              ${groupedOptions(list, suggestId)}
            </select>
          </label>
          <div id="ar-act-preview" class="ar-act-preview"></div>
          <div class="ar-act-actions">
            <button id="ar-act-apply" class="ar-btn ar-btn-primary" type="button">▶ Aplicar plantilla</button>
            <button id="ar-act-cancel" class="ar-btn" type="button">Cerrar</button>
          </div>
          <div id="ar-act-log" class="ar-act-log"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector(".ar-act-close").onclick = close;
    modal.querySelector("#ar-act-cancel").onclick = close;
    // Cerrar SOLO con la "X"

    const sel = modal.querySelector("#ar-act-select");
    const preview = modal.querySelector("#ar-act-preview");
    const renderPreview = () => {
      const tpl = window.__AR_ACTIVITIES.get(sel.value);
      if (!tpl) { preview.innerHTML = ""; return; }
      preview.innerHTML = `<div class="ar-act-preview-h">${tpl.activities.length} actividades:</div><ol>${tpl.activities.map((a) => `<li>${escapeHtml(a.match)}</li>`).join("")}</ol>`;
    };
    sel.onchange = renderPreview;
    renderPreview();

    modal.querySelector("#ar-act-apply").onclick = async () => {
      const tpl = window.__AR_ACTIVITIES.get(sel.value);
      if (!tpl) return;
      const log = modal.querySelector("#ar-act-log");
      log.innerHTML = "";
      const onProgress = (msg, kind) => {
        const div = document.createElement("div");
        div.className = `ar-act-log-row ar-act-${kind}`;
        div.textContent = msg;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
      };
      const btn = modal.querySelector("#ar-act-apply");
      btn.disabled = true;
      btn.textContent = "Ejecutando...";
      try {
        await applyTemplate(tpl, onProgress);
      } catch (err) {
        onProgress("Error global: " + err.message, "fail");
      } finally {
        btn.disabled = false;
        btn.textContent = "▶ Aplicar plantilla";
      }
    };
  }

  function groupedOptions(list, suggestId) {
    const groups = {};
    for (const t of list) {
      groups[t.group] = groups[t.group] || [];
      groups[t.group].push(t);
    }
    return Object.entries(groups).map(([g, items]) => `
      <optgroup label="${escapeHtml(g)}">
        ${items.map((t) => `<option value="${t.id}" ${t.id === suggestId ? "selected" : ""}>${escapeHtml(t.name)}${t.id === suggestId ? "  ⭐" : ""}</option>`).join("")}
      </optgroup>
    `).join("");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.__AR_ACT_UI = { open, close, applyTemplate };
})();
