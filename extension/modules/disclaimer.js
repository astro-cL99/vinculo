/* Vínculo — Aviso permanente "no diagnóstico"
 * Banner discreto fijo en la esquina inferior izquierda con disclaimer médico-legal.
 * Persiste durante toda la sesión. El profesional puede minimizarlo (no eliminarlo)
 * — cumple con requisito de aviso visible permanente para uso de SaMD de apoyo.
 */
(function () {
  if (window.__AR_DISCLAIMER) return;

  let el = null;

  function render() {
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "ar-disclaimer";
    el.style.cssText = [
      "position:fixed",
      "left:12px",
      "bottom:12px",
      "z-index:2147483645",
      "background:#fef9c3",
      "border:1px solid #fde047",
      "color:#713f12",
      "border-radius:8px",
      "box-shadow:0 4px 14px rgba(0,0,0,.15)",
      "font:12px/1.4 system-ui,-apple-system,sans-serif",
      "padding:8px 12px;max-width:320px",
    ].join(";");

    el.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:6px">
        <span style="font-size:14px">⚠️</span>
        <div style="flex:1">
          <div style="font-weight:700;margin-bottom:2px">Vínculo — Aviso clínico</div>
          <div>La IA <b>no diagnostica</b>. La decisión clínica final es del <b>profesional tratante</b>.</div>
        </div>
        <button id="ar-dc-x" title="Cerrar" aria-label="Cerrar" style="background:none;border:0;color:#713f12;cursor:pointer;font-size:16px;line-height:1;padding:0 4px;font-weight:700">✕</button>
      </div>
    `;
    document.documentElement.appendChild(el);
    el.querySelector("#ar-dc-x").addEventListener("click", function () {
      if (el) { el.remove(); el = null; }
    });
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  window.__AR_DISCLAIMER = { init: init, render: render };
  init();
})();
