/* Vínculo — Logger anonimizado
 * Captura errores y eventos clave SIN PII para diagnóstico en producción.
 *
 * API: window.__AR_LOG = { error, warn, info, debug, list, clear, export, stats }
 *
 * Características:
 *  - Buffer circular en chrome.storage.local (máx 200 entradas)
 *  - Stack traces anonimizadas: rutas de extensión normalizadas, líneas conservadas
 *  - Mensajes pasan por __AR_PII.scrub antes de almacenar
 *  - Cada entry: {ts, level, code, msg, stack, ctx, ext_version}
 *  - Sin envío automático a red — exportable manualmente desde el popup
 */
(function () {
  if (window.__AR_LOG) return;

  const KEY = "__AR_LOG_BUFFER__";
  const MAX = 200;
  const VERSION = (typeof chrome !== "undefined" && chrome.runtime?.getManifest?.().version) || "?";

  // Códigos de error estructurados (taxonomía estable para agregación)
  const CODES = {
    UNCAUGHT: "E_UNCAUGHT",
    PROMISE: "E_PROMISE",
    AI_FETCH: "E_AI_FETCH",
    AI_PARSE: "E_AI_PARSE",
    DOM_PARSE: "E_DOM_PARSE",
    LAB_PARSE: "E_LAB_PARSE",
    DX_EXTRACT: "E_DX_EXTRACT",
    STORAGE: "E_STORAGE",
    PII_LEAK: "E_PII_LEAK",
    UNKNOWN: "E_UNKNOWN",
  };

  /** Anonimiza stack: rutas de extensión, URLs, y aplica scrub PII */
  function anonStack(stack) {
    if (!stack) return "";
    let s = String(stack)
      .replace(/chrome-extension:\/\/[a-z0-9]+\//gi, "ext://")
      .replace(/https?:\/\/[^\s)]+/g, (u) => {
        try { return new URL(u).hostname + new URL(u).pathname.replace(/\/[^/]*$/, "/*"); }
        catch { return "[URL]"; }
      });
    // Capa final: PII scrub (RUT/email/teléfono que pudieran venir en mensajes de Error)
    if (window.__AR_PII?.scrub) s = window.__AR_PII.scrub(s);
    return s.split("\n").slice(0, 8).join("\n");
  }

  /** Sanitiza mensaje y contexto via __AR_PII */
  function sanitize(value) {
    const pii = window.__AR_PII;
    if (!pii) return value;
    if (typeof value === "string") return pii.scrub(value);
    if (value && typeof value === "object") return pii.scrubObject(value);
    return value;
  }

  function readBuffer(cb) {
    try {
      chrome.storage.local.get([KEY], (r) => cb(r?.[KEY] || []));
    } catch { cb([]); }
  }
  function writeBuffer(buf) {
    try { chrome.storage.local.set({ [KEY]: buf.slice(-MAX) }); } catch {}
  }

  // Buffer en memoria para diagnóstico inmediato cuando el consentimiento aún
  // no se ha aceptado (no se persiste a chrome.storage).
  const memBuf = [];
  const MEM_MAX = 20;

  function append(level, code, msg, err, ctx) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      code: code || CODES.UNKNOWN,
      msg: typeof msg === "string" ? sanitize(msg).slice(0, 500) : "",
      stack: err?.stack ? anonStack(err.stack) : "",
      ctx: ctx ? sanitize(ctx) : null,
      ext_version: VERSION,
      url_host: location?.hostname || "",
      ua: navigator.userAgent.replace(/\d+\.\d+\.\d+(\.\d+)?/g, "X.X.X").slice(0, 120),
    };
    const consentOk = !window.__AR_CONSENT || window.__AR_CONSENT.allows("logger");
    if (consentOk) {
      readBuffer((buf) => {
        buf.push(entry);
        writeBuffer(buf);
      });
    } else {
      memBuf.push(entry);
      if (memBuf.length > MEM_MAX) memBuf.shift();
    }
    // También a consola (útil en dev) — sin PII porque ya está sanitizado
    const prefix = `[AR:${level.toUpperCase()}:${entry.code}]`;
    if (level === "error") console.error(prefix, entry.msg, err || "");
    else if (level === "warn") console.warn(prefix, entry.msg);
    else console.log(prefix, entry.msg);
    return entry;
  }

  const api = {
    CODES,
    error: (code, msg, err, ctx) => append("error", code, msg, err, ctx),
    warn:  (code, msg, ctx) => append("warn", code, msg, null, ctx),
    info:  (code, msg, ctx) => append("info", code, msg, null, ctx),
    debug: (code, msg, ctx) => append("debug", code, msg, null, ctx),
    list:  (cb) => readBuffer(cb),
    clear: () => writeBuffer([]),
    export: (cb) => readBuffer((buf) => {
      const blob = JSON.stringify({
        meta: {
          exportedAt: new Date().toISOString(),
          extensionVersion: VERSION,
          totalEntries: buf.length,
          rulesetVersion: window.__AR_PII_RULES?.RULES?.length || 0,
        },
        entries: buf,
      }, null, 2);
      cb(blob);
    }),
    stats: (cb) => readBuffer((buf) => {
      const byCode = {};
      const byLevel = {};
      for (const e of buf) {
        byCode[e.code] = (byCode[e.code] || 0) + 1;
        byLevel[e.level] = (byLevel[e.level] || 0) + 1;
      }
      cb({ total: buf.length, byCode, byLevel, oldest: buf[0]?.ts, newest: buf.at(-1)?.ts });
    }),
  };

  // Hooks globales — capturan errores no manejados
  if (typeof window !== "undefined") {
    window.addEventListener("error", (ev) => {
      api.error(CODES.UNCAUGHT, ev.message || "uncaught", ev.error, {
        filename: anonStack(ev.filename), lineno: ev.lineno, colno: ev.colno,
      });
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const reason = ev.reason;
      api.error(CODES.PROMISE, reason?.message || String(reason).slice(0, 200), reason instanceof Error ? reason : null);
    });
  }

  window.__AR_LOG = api;
})();
