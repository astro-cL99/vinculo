/* Vínculo — utils compartidos
 * Helpers puros (sin closures de content.js). API: window.__AR_UTILS
 */
(function () {
  if (window.__AR_UTILS) return;

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "url", "email", "tel", "number", "password", ""].includes(t);
    }
    return false;
  }

  // Extrae el primer número de un string, tolerando coma decimal.
  function parseNumeric(value) {
    if (value == null) return null;
    const m = String(value).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  // Setter "nativo" para inputs/textarea controlados por React.
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.__AR_UTILS = { isEditable, parseNumeric, setNativeValue, sleep };
})();
