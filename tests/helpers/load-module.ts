import fs from 'node:fs';
import path from 'node:path';
import { makeChromeMock } from './chrome-mock';

const ROOT = path.resolve(__dirname, '../..');

/** Resets jsdom window globals used by extension modules. */
export function resetWindow() {
  const w = window as unknown as Record<string, unknown>;
  for (const k of Object.keys(w)) {
    if (k.startsWith('__AR_')) delete w[k];
  }
  // Reset localStorage between tests
  try { window.localStorage.clear(); } catch {}
}

/** Install a fresh chrome mock on globalThis + window. */
export function installChrome(version = '1.0.5') {
  const c = makeChromeMock(version);
  (globalThis as any).chrome = c;
  (window as any).chrome = c;
  return c;
}

/**
 * Load an extension JS file (IIFE that attaches to window) into the current jsdom.
 * Path is relative to repo root, e.g. 'extension/modules/pii.js'.
 */
import { pathToFileURL } from 'node:url';

export async function loadExtModule(relPath: string) {
  const abs = path.join(ROOT, relPath);
  const CSS = (window as any).CSS || { escape: (s: string) => String(s).replace(/[^\w-]/g, '\\$&') };
  (window as any).CSS = CSS;
  (globalThis as any).CSS = CSS;
  const g = globalThis as any;
  g.window = window;
  g.document = document;
  g.chrome = (window as any).chrome;
  g.navigator = navigator;
  g.location = location;
  g.localStorage = window.localStorage;
  // Bust cache so each test gets a fresh execution + window install.
  const url = pathToFileURL(abs).href + `?t=${Math.random()}`;
  await import(/* @vite-ignore */ url);
}

/** Load several modules in order. */
export async function loadAll(paths: string[]) {
  for (const p of paths) await loadExtModule(p);
}
