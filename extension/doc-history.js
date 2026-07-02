/* Vínculo — Historial local de documentos/certificados generados.
 *
 * Persiste en chrome.storage.local cada vez que se genera un documento
 * imprimible o un certificado. Permite reimprimir en un clic.
 *
 * API: window.__AR_HIST = {
 *   ready: Promise,
 *   list(): Entry[],         // ordenado del más reciente al más antiguo
 *   add(entry): Promise<Entry>,
 *   remove(id): Promise<void>,
 *   clear(): Promise<void>,
 *   reprint(id): boolean,    // abre ventana e imprime
 *   subscribe(fn): () => void,
 * }
 *
 * Entry = {
 *   id: string,
 *   ts: number,              // epoch ms
 *   kind: "doc" | "cert" | "compin",
 *   subtype: string,         // ej: "perfil-pa", "atencion", "compin"
 *   label: string,           // título legible
 *   paciente: string,        // nombre completo (vacío si no aplica)
 *   rut: string,             // RUT (vacío si no aplica)
 *   medico: string,          // nombre del médico firmante (cert/compin)
 *   html: string,            // HTML completo de la vista previa
 * }
 */
(function () {
  if (window.__AR_HIST) return;

  const log = (window.__AR_LOG && window.__AR_LOG("hist")) || { info: () => {}, warn: () => {} };
  const STORAGE_KEY = "ar_doc_history_v1";
  const MAX_ENTRIES = 200;

  const STATE = { entries: [] };
  const subs = new Set();
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  function notify() {
    subs.forEach((fn) => { try { fn(STATE.entries.slice()); } catch (e) { log.warn("subscriber err", e); } });
  }

  async function load() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      STATE.entries = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
      log.info(`${STATE.entries.length} entradas en historial`);
    } catch (e) {
      log.warn("Error leyendo historial", e);
      STATE.entries = [];
    }
    resolveReady();
  }

  async function persist() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: STATE.entries });
    } catch (e) {
      log.warn("Error persistiendo historial", e);
    }
  }

  function genId() {
    return "h_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function list() { return STATE.entries.slice(); }

  async function add(entry) {
    const e = {
      id: genId(),
      ts: Date.now(),
      kind: entry.kind || "doc",
      subtype: entry.subtype || "",
      label: entry.label || "Documento",
      paciente: (entry.paciente || "").trim(),
      rut: (entry.rut || "").trim(),
      medico: (entry.medico || "").trim(),
      html: entry.html || "",
    };
    STATE.entries.unshift(e);
    if (STATE.entries.length > MAX_ENTRIES) STATE.entries.length = MAX_ENTRIES;
    await persist();
    notify();
    return e;
  }

  async function remove(id) {
    STATE.entries = STATE.entries.filter((e) => e.id !== id);
    await persist();
    notify();
  }

  async function clear() {
    STATE.entries = [];
    await persist();
    notify();
  }

  function reprint(id) {
    const e = STATE.entries.find((x) => x.id === id);
    if (!e) return false;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      window.__AR_HOST?.toast?.("⚠ Permite ventanas emergentes para reimprimir");
      return false;
    }
    w.document.open();
    w.document.write(e.html);
    w.document.close();
    return true;
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  load();

  window.__AR_HIST = { ready, list, add, remove, clear, reprint, subscribe };
})();
