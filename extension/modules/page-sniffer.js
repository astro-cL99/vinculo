(function () {
  if (window.__AR_PAGE_SNIFFER_INSTALLED) return;
  window.__AR_PAGE_SNIFFER_INSTALLED = true;

  const MAX_BODY = 260000;
  const PAGE_BUFFER = window.__AR_PAGE_NET_BUFFER || [];
  window.__AR_PAGE_NET_BUFFER = PAGE_BUFFER;
  const PAGE_MAX = 180;
  const post = (payload) => {
    try {
      window.postMessage({ source: "AR_PAGE_SNIFFER", ...payload }, "*");
    } catch (_) {}
  };

  const shouldRead = (url, contentType) => {
    const u = String(url || "");
    const ct = String(contentType || "").toLowerCase();
    return /rayenaps|clinico|historia|atencion|anamnes|registro|ficha|consulta/i.test(u) ||
      /json|text|html|xml/i.test(ct);
  };

  const pushBody = (kind, url, status, contentType, body) => {
    if (!body || !shouldRead(url, contentType)) return;
    const item = {
      type: "network",
      kind,
      t: Date.now(),
      url: String(url || ""),
      status,
      contentType: String(contentType || ""),
      body: String(body).slice(0, MAX_BODY),
    };
    PAGE_BUFFER.push(item);
    while (PAGE_BUFFER.length > PAGE_MAX) PAGE_BUFFER.shift();
    post(item);
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const response = await originalFetch.apply(this, args);
      try {
        const clone = response.clone();
        const contentType = clone.headers?.get?.("content-type") || "";
        if (shouldRead(url, contentType)) {
          clone.text().then((body) => pushBody("fetch", url, response.status, contentType, body)).catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  }

  const clipStringify = (value) => {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
      if (typeof val === "string") return val.length > 6000 ? val.slice(0, 6000) : val;
      if (val && typeof val === "object") {
        if (seen.has(val)) return undefined;
        seen.add(val);
      }
      return val;
    }).slice(0, MAX_BODY);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "AR_CONTENT" || event.data?.type !== "scanGlobals") return;
    const names = Object.keys(window).filter((key) => /historia|anamnes|atencion|consulta|paciente|ficha|evolu|record|clinical|redux|query|store/i.test(key));
    const hits = [];
    for (const name of names.slice(0, 80)) {
      try {
        const value = window[name];
        if (!value || typeof value === "function") continue;
        const body = typeof value === "string" ? value : clipStringify(value);
        if (/anamnes|historia|atencion|evolu|motivo|consulta|diagnost/i.test(body)) {
          hits.push({ name, body: body.slice(0, 50000) });
        }
      } catch (_) {}
      if (hits.length >= 20) break;
    }
    try {
      const roots = [document.querySelector(".wrapper-body"), document.querySelector(".react-checkbox-tree"), document.querySelector(".tab-content"), document.body].filter(Boolean);
      const nodes = [];
      roots.forEach((root) => nodes.push(root, ...Array.from(root.querySelectorAll("*"))));
      const seenNodes = new Set();
      for (const el of nodes.slice(0, 1800)) {
        if (seenNodes.has(el)) continue;
        seenNodes.add(el);
        const keys = Object.keys(el).filter((key) => /^__react(Fiber|Props)\$/.test(key));
        for (const key of keys) {
          const raw = el[key];
          const body = clipStringify({ props: raw?.memoizedProps || raw, state: raw?.memoizedState });
          if (/anamnes|historia|atencion|atenci[oó]n|evoluc|motivo|consulta|diagnost/i.test(body)) {
            hits.push({ name: `react:${el.tagName.toLowerCase()}`, body: body.slice(0, 50000) });
            if (hits.length >= 45) break;
          }
        }
        if (hits.length >= 45) break;
      }
    } catch (_) {}
    post({ type: "globals", t: Date.now(), hits });
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "AR_CONTENT" || event.data?.type !== "dumpNetwork") return;
    post({ type: "networkDump", t: Date.now(), items: PAGE_BUFFER.slice(-PAGE_MAX) });
  });

  const XHR = window.XMLHttpRequest;
  if (XHR?.prototype) {
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__ar_url = url;
      return originalOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      this.addEventListener("load", () => {
        try {
          const contentType = this.getResponseHeader?.("content-type") || "";
          if (typeof this.responseText === "string") {
            pushBody("xhr", this.__ar_url || "", this.status, contentType, this.responseText);
          }
        } catch (_) {}
      });
      return originalSend.apply(this, arguments);
    };
  }

  post({ type: "ready", t: Date.now() });
})();