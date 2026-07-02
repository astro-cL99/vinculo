/* Vínculo — lab session storage
 *
 * Persiste el último laboratorio extraído. Usa sessionStorage como almacén
 * primario (rápido, scoped a la pestaña) y replica en localStorage como
 * respaldo persistente con TTL configurable (24h por defecto). De esta forma:
 *   - Si recargas la pestaña → sessionStorage sigue ahí → recuperación inmediata.
 *   - Si cierras la pestaña y reabres dentro del TTL → restauramos desde
 *     localStorage automáticamente en el primer get().
 *   - Si pasó el TTL → se descarta y devolvemos null.
 *
 * API: window.__AR_LAB_SESSION = { get, set, clear, KEY, BACKUP_KEY, TTL_MS }
 */
(function () {
  if (window.__AR_LAB_SESSION) return;
  const KEY = "__ar_lab_v1";
  const BACKUP_KEY = "__ar_lab_backup_v1";
  const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); }
    catch { return null; }
  }
  function readBackup() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      const savedAt = obj.__savedAt || 0;
      if (TTL_MS > 0 && (Date.now() - savedAt) > TTL_MS) {
        try { localStorage.removeItem(BACKUP_KEY); } catch (_) {}
        return null;
      }
      const { __savedAt, ...data } = obj;
      return data;
    } catch { return null; }
  }

  function get() {
    const live = readSession();
    if (live) return live;
    // Restaurar desde backup si la pestaña perdió la session (p.ej. al reabrir).
    const backup = readBackup();
    if (backup) {
      try { sessionStorage.setItem(KEY, JSON.stringify(backup)); } catch (_) {}
      return backup;
    }
    return null;
  }

  function set(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
    try {
      localStorage.setItem(
        BACKUP_KEY,
        JSON.stringify({ ...data, __savedAt: Date.now() }),
      );
    } catch (_) {}
  }

  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (_) {}
    try { localStorage.removeItem(BACKUP_KEY); } catch (_) {}
  }

  window.__AR_LAB_SESSION = { get, set, clear, KEY, BACKUP_KEY, TTL_MS };
})();
