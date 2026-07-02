/* Vínculo — Audit log inmutable de decisiones clínicas (Fase 6.4)
 *
 * Registra cada vez que la extensión muestra una sugerencia clínica al
 * profesional, junto con timestamp, ruleset_hash y la evidencia mostrada.
 * Append-only en Supabase (clinical_audit). Sin PII: usa patient_hash.
 *
 * Gobernanza:
 *  - Requiere consentimiento explícito (window.__AR_CONSENT.allows("logger")).
 *  - Cola en chrome.storage.local con flush periódico y reintentos.
 *  - Recorta evidence a 12 KB para respetar el CHECK del servidor.
 *
 * API:
 *  window.__AR_AUDIT.log({ event_type, source, rule_id?, evidence?, patient_hash? })
 *  window.__AR_AUDIT.flush()
 *  window.__AR_AUDIT.getQueueSize()
 */
(function () {
  if (window.__AR_AUDIT) return;

  const CFG = window.__AR_CFG || {};
  const SUPABASE_URL = CFG.SUPABASE_URL || "https://ehknxdrmeuojbgpbzchh.supabase.co";
  const SUPABASE_ANON = CFG.SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoa254ZHJtZXVvamJncGJ6Y2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjg0MzQsImV4cCI6MjA5MzEwNDQzNH0.EdT9wFY10WlyFFapcpIpbkTz7yBPcj8nueMQeDgUxwA";
  const ENDPOINT = `${SUPABASE_URL}/rest/v1/clinical_audit`;

  const QUEUE_KEY = "ar_audit_queue_v1";
  const SESSION_KEY = "ar_audit_session_v1";
  const MAX_QUEUE = 500;
  const MAX_EVIDENCE_BYTES = 12 * 1024;
  const VALID_EVENTS = new Set([
    "suggestion_shown","suggestion_accepted","suggestion_dismissed",
    "ai_consult","lab_critical_shown","ges_alert_shown",
  ]);
  const VALID_SOURCES = new Set([
    "ges","lab","consultor","interactions","peds","dx-suggest","arsenal","farmacia","other",
  ]);

  function sessionId() {
    try {
      let s = sessionStorage.getItem(SESSION_KEY);
      if (!s) {
        s = "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        sessionStorage.setItem(SESSION_KEY, s);
      }
      return s;
    } catch { return null; }
  }

  function extVersion() {
    try { return chrome.runtime.getManifest().version; } catch { return null; }
  }

  function rulesetComposite() {
    try { return window.__AR_RULESET ? window.__AR_RULESET.composite() : null; } catch { return null; }
  }

  function scrubEvidence(ev) {
    // Si existe el scrub global, úsalo; si no, devolver tal cual (caller debe ya haber sanitizado).
    try {
      if (window.__AR_PII && typeof window.__AR_PII.scrubObject === "function") {
        return window.__AR_PII.scrubObject(ev);
      }
    } catch (_) {}
    return ev;
  }

  function trimEvidence(ev) {
    let json;
    try { json = JSON.stringify(ev || {}); } catch { json = "{}"; }
    if (json.length <= MAX_EVIDENCE_BYTES) return ev;
    // Truncar conservando estructura: reemplazar con resumen.
    return { _truncated: true, _orig_size: json.length, preview: json.slice(0, MAX_EVIDENCE_BYTES - 200) };
  }

  function readQueue() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([QUEUE_KEY], (r) => resolve((r && r[QUEUE_KEY]) || []));
      } catch { resolve([]); }
    });
  }
  function writeQueue(q) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [QUEUE_KEY]: q.slice(-MAX_QUEUE) }, () => resolve()); }
      catch { resolve(); }
    });
  }

  let flushing = false;

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      const q = await readQueue();
      if (!q.length) return;
      const batch = q.slice(0, 50);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON,
          "Authorization": `Bearer ${SUPABASE_ANON}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        await writeQueue(q.slice(batch.length));
      } else {
        // No purgar la cola; reintentar más tarde.
        // eslint-disable-next-line no-console
        console.warn("[AR audit] flush failed", res.status);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[AR audit] flush error", e && e.message);
    } finally {
      flushing = false;
    }
  }

  async function log(entry) {
    if (!entry || !VALID_EVENTS.has(entry.event_type) || !VALID_SOURCES.has(entry.source)) return;
    // Gate por consentimiento.
    try {
      if (window.__AR_CONSENT && window.__AR_CONSENT.allows && !window.__AR_CONSENT.allows("logger")) return;
    } catch (_) {}

    const row = {
      event_type: entry.event_type,
      source: entry.source,
      rule_id: entry.rule_id ? String(entry.rule_id).slice(0, 200) : null,
      patient_hash: entry.patient_hash || null,
      ruleset_composite: entry.ruleset_composite || rulesetComposite(),
      ext_version: extVersion(),
      session_id: entry.session_id || sessionId(),
      evidence: trimEvidence(scrubEvidence(entry.evidence || {})),
      user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : null),
    };

    const q = await readQueue();
    q.push(row);
    await writeQueue(q);
  }

  async function getQueueSize() {
    const q = await readQueue();
    return q.length;
  }

  // Flush periódico + al cargar + al cerrar.
  setInterval(flush, 30 * 1000);
  setTimeout(flush, 4000);
  window.addEventListener("beforeunload", () => { try { flush(); } catch (_) {} });

  window.__AR_AUDIT = { log, flush, getQueueSize };
})();
