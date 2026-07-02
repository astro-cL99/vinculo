// Forwards keyboard shortcut to the active tab content script.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-quick-picker") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "AR_OPEN_QUICK_PICKER" });
  } catch (e) {
    // Content script may not be loaded (not on Rayen). Ignore.
  }
});

// Allow popup to seed templates into storage.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AR_GET_TEMPLATES") {
    chrome.storage.local.get({ templates: [] }).then((d) => sendResponse(d.templates));
    return true;
  }
  if (msg?.type === "AR_SET_TEMPLATES") {
    chrome.storage.local.set({ templates: msg.templates || [] }).then(() => sendResponse(true));
    return true;
  }
  if (msg?.type === "AR_PAC_SEARCH") {
    const q = String(msg.q || "").trim();
    const url = `https://neghme.lovable.app/api/public/pac-search?q=${encodeURIComponent(q)}`;
    // Timeout por intento + reintentos con backoff para evitar quedar "Buscando…"
    const PER_TRY_MS = 6000;
    const MAX_TRIES = 3;
    const tryOnce = (attempt) => new Promise((resolve) => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), PER_TRY_MS);
      fetch(url, { method: "GET", signal: ctrl.signal })
        .then((r) => r.json().then((j) => ({ ok: true, j })).catch((e) => ({ ok: false, e })))
        .then((res) => {
          clearTimeout(to);
          if (res.ok) return resolve({ ok: true, data: res.j });
          resolve({ ok: false, error: "Respuesta inválida" });
        })
        .catch((e) => {
          clearTimeout(to);
          const msg = e?.name === "AbortError" ? `Timeout (${PER_TRY_MS}ms) intento ${attempt}` : String(e);
          resolve({ ok: false, error: msg, retriable: true });
        });
    });
    (async () => {
      let last = { ok: false, error: "Sin respuesta" };
      for (let i = 1; i <= MAX_TRIES; i++) {
        last = await tryOnce(i);
        if (last.ok) return sendResponse(last);
        if (!last.retriable) break;
        await new Promise((r) => setTimeout(r, 400 * i)); // backoff 400/800ms
      }
      sendResponse(last);
    })();
    return true;
  }
});
