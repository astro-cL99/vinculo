/* Vínculo — Logger unificado.
 * Reemplaza progresivamente los console.log("[AR]", …) dispersos por
 * llamadas con namespacing por módulo y nivel.
 *
 *   const log = window.__AR_LOG.module("peds");
 *   log.info("dosis calculada", payload);
 *   log.debug("solo si DEBUG");
 *   log.warn("…"); log.error("…");
 *
 * Niveles: debug < info < warn < error.
 * El nivel global se persiste en localStorage (__ar_log_level) y por defecto
 * es "info". Activar debug con  window.__AR_LOG.setLevel("debug").
 *
 * Nota: NO sustituye al toggle DEBUG histórico de content.js (que controla el
 * badge 🐞 y el detalle del lab parser). Convive con él.
 */
(function () {
  if (window.__AR_LOG) return;

  const KEY = "__ar_log_level";
  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
  let current = LEVELS.info;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LEVELS[saved] != null) current = LEVELS[saved];
  } catch (_) {}

  function setLevel(name) {
    const lv = LEVELS[name];
    if (lv == null) {
      console.warn("[AR][log] nivel inválido:", name, "usa:", Object.keys(LEVELS).join("|"));
      return;
    }
    current = lv;
    try { localStorage.setItem(KEY, name); } catch (_) {}
    console.log("[AR][log] nivel =", name);
  }

  function emit(level, ns, args) {
    if (LEVELS[level] < current) return;
    const tag = `[AR${ns ? ":" + ns : ""}]`;
    const fn = level === "error" ? console.error
      : level === "warn" ? console.warn
        : console.log;
    fn(tag, ...args);
  }

  function module(ns) {
    return {
      debug: (...a) => emit("debug", ns, a),
      info: (...a) => emit("info", ns, a),
      warn: (...a) => emit("warn", ns, a),
      error: (...a) => emit("error", ns, a),
    };
  }

  // __AR_LOG es callable (alias de .module) y además expone setLevel/module.
  const fn = (ns) => module(ns);
  fn.setLevel = setLevel;
  fn.module = module;
  Object.defineProperty(fn, "level", {
    get() { return Object.entries(LEVELS).find(([, v]) => v === current)?.[0] || "info"; },
  });
  window.__AR_LOG = fn;
})();
