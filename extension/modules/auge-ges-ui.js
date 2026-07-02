/* Vínculo — UI flotante de búsqueda AUGE/GES
 * Botón flotante (esquina inferior izq.) que abre buscador del catálogo MINSAL.
 * Self-contained: no toca clinical-ui.js. Aparece sólo si __AR_AUGE cargó.
 */
(function () {
  if (window.__AR_AUGE_UI) return;
  window.__AR_AUGE_UI = true;

  // FAB eliminado: ahora se accede desde 📚 Recursos clínicos → pestaña GES.
  function inject() {
    const old = document.getElementById("ar-auge-fab");
    if (old) old.remove();
  }
  window.__AR_AUGE_OPEN = function(){ openModal(); };

  function openModal() {
    if (document.getElementById("ar-auge-modal")) return;
    const overlay = document.createElement("div");
    overlay.id = "ar-auge-modal";
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", background: "rgba(15,23,42,0.55)",
      zIndex: "2147483601", display: "flex", alignItems: "center", justifyContent: "center",
    });
    const meta = window.__AR_AUGE.meta();
    overlay.innerHTML = `
      <div style="background:#f8fafc;border-radius:12px;width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;background:#fff;border-radius:12px 12px 0 0">
          <div style="flex:1">
            <div style="font-weight:700;font-size:15px;color:#0f172a">🩺 Guías Clínicas AUGE/GES</div>
            <div style="font-size:11px;color:#64748b">MINSAL DIPRECE · ${meta?.total || 0} problemas de salud · v${meta?.version || ""}</div>
          </div>
          <button id="ar-auge-close" style="background:none;border:0;font-size:22px;cursor:pointer;color:#64748b">×</button>
        </div>
        <div style="padding:10px 16px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center">
          <input id="ar-auge-q" placeholder="Buscar (ej: hipertension, cancer mama, depresion, asma…)" style="flex:1;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px" />
          <button id="ar-auge-ctx" title="Sugerir desde texto visible en la ficha" style="background:#0ea5a4;color:#fff;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">🧠 Desde ficha</button>
        </div>
        <div id="ar-auge-results" style="flex:1;overflow-y:auto;padding:12px 16px"></div>
        <div style="padding:8px 16px;border-top:1px solid #e2e8f0;background:#fff;border-radius:0 0 12px 12px;font-size:10px;color:#94a3b8">
          Fuente: <a href="https://diprece.minsal.cl/le-informamos/auge/acceso-guias-clinicas/guias-clinicas-auge/" target="_blank" rel="noopener" style="color:#0ea5e9">diprece.minsal.cl</a> · Para apoyo clínico, no reemplaza juicio profesional.
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const $q = overlay.querySelector("#ar-auge-q");
    const $r = overlay.querySelector("#ar-auge-results");
    const $close = overlay.querySelector("#ar-auge-close");
    const $ctx = overlay.querySelector("#ar-auge-ctx");

    function render(list, header) {
      if (!list.length) { $r.innerHTML = `<div style="color:#64748b;text-align:center;padding:20px">Sin resultados.</div>`; return; }
      const head = header ? `<div style="font-size:11px;color:#475569;margin-bottom:8px">${header}</div>` : "";
      $r.innerHTML = head + list.map((p) => window.__AR_AUGE.renderCard(p)).join("");
    }

    function refreshAll() { render(window.__AR_AUGE.all().slice(0, 30), `Mostrando 30 de ${window.__AR_AUGE.meta()?.total || 0}. Escribe para buscar.`); }

    $q.addEventListener("input", () => {
      const q = $q.value.trim();
      if (!q) return refreshAll();
      render(window.__AR_AUGE.search(q, 50));
    });
    $ctx.addEventListener("click", () => {
      const txt = (document.body?.innerText || "").slice(0, 12000);
      const list = window.__AR_AUGE.suggestFromText(txt);
      render(list, `🧠 Sugerencias por texto detectado en la ficha (${list.length})`);
    });
    $close.addEventListener("click", () => overlay.remove());
    // Cerrar SOLO con la "X"

    refreshAll();
    setTimeout(() => $q.focus(), 50);
  }

  // Esperar a que __AR_AUGE termine de cargar el JSON
  const start = async () => {
    try { await window.__AR_AUGE?.ready; } catch {}
    inject();
  };
  if (document.readyState === "complete" || document.readyState === "interactive") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
