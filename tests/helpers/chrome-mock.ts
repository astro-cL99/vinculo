// In-memory chrome.* mock for jsdom-based tests.
export function makeChromeMock(version = '1.0.5') {
  const store = new Map<string, unknown>();
  return {
    runtime: {
      getManifest: () => ({ version }),
    },
    storage: {
      local: {
        get(keys: string | string[], cb: (r: Record<string, unknown>) => void) {
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of arr) if (store.has(k)) out[k] = store.get(k);
          cb(out);
        },
        set(obj: Record<string, unknown>, cb?: () => void) {
          for (const [k, v] of Object.entries(obj)) store.set(k, v);
          cb?.();
        },
        remove(keys: string | string[], cb?: () => void) {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) store.delete(k);
          cb?.();
        },
        clear(cb?: () => void) {
          store.clear();
          cb?.();
        },
      },
    },
    _store: store,
  };
}
