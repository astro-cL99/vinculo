/* Vínculo — Detector de campo Anamnesis e inyección del chip 🎙
 *
 * Recorre <textarea> visibles y busca labels que hagan match con
 * "anamnesis", "motivo de consulta", "historia de la enfermedad" o
 * "evolución" (en input contextual). Inyecta un chip flotante junto al
 * textarea. Al click → abre window.__AR_VOICE_UI.openFor(textarea).
 *
 * Re-escanea on DOM mutation con debounce.
 */
(function () {
  if (window.__AR_VOICE_ANAMNESIS) return;
  window.__AR_VOICE_ANAMNESIS = true;

  const MATCH = /(anamnes|motivo\s+de\s+consulta|historia\s+(de\s+la\s+)?enfermedad|evoluci[oó]n\s+cl[ií]nica|relato|consulta\s+actual)/i;
  const SEEN = new WeakSet();

  function labelFor(el) {
    if (!el) return "";
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return (l.textContent || "").trim();
    }
    const lab = el.closest("label");
    if (lab) return (lab.textContent || "").trim();
    const par = el.closest(".form-group, .field, .row, fieldset, .col-sm-12, .col-md-12, .col-md-9");
    if (par) {
      const l2 = par.querySelector("label, .label, legend, .field-label");
      if (l2) return (l2.textContent || "").trim();
    }
    return el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("name") || "";
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 60 && r.height > 20;
  }

  function makeChip(target) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ar-voice-chip";
    chip.innerHTML = "🎙 <span>Dictar</span>";
    chip.title = "Anamnesis por voz — Vínculo";
    chip.style.cssText = [
      "display:inline-flex","align-items:center","gap:4px",
      "background:linear-gradient(135deg,#7c3aed,#0ea5e9)","color:#fff","border:none",
      "padding:4px 10px","border-radius:999px","cursor:pointer",
      "font:600 11px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
      "box-shadow:0 2px 6px rgba(124,58,237,.35)","letter-spacing:.02em",
      "margin:4px 0 4px 6px","vertical-align:middle","z-index:5",
    ].join(";");
    chip.addEventListener("mouseenter", () => { chip.style.filter = "brightness(1.1)"; });
    chip.addEventListener("mouseleave", () => { chip.style.filter = ""; });
    chip.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!window.__AR_VOICE_UI?.openFor) return;
      window.__AR_VOICE_UI.openFor(target);
    });
    return chip;
  }

  function attach(target) {
    if (SEEN.has(target)) return;
    const label = labelFor(target);
    if (!MATCH.test(label)) return;
    SEEN.add(target);
    const chip = makeChip(target);
    chip.dataset.arFor = target.id || "";
    // Inyectar después del label si existe, sino antes del textarea
    const par = target.closest(".form-group, .field, .row, fieldset");
    const lab = (target.id && document.querySelector(`label[for="${CSS.escape(target.id)}"]`))
      || par?.querySelector("label, .label, legend");
    if (lab && lab.parentElement) lab.appendChild(chip);
    else target.parentElement?.insertBefore(chip, target);
  }

  function scan() {
    document.querySelectorAll("textarea").forEach((t) => {
      if (isVisible(t)) attach(t);
    });
  }

  // Debounced re-scan en mutaciones
  let debounceId = null;
  const obs = new MutationObserver(() => {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(scan, 250);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Primer scan
  setTimeout(scan, 800);
  document.addEventListener("DOMContentLoaded", scan, { once: true });
})();
