import { beforeEach, describe, expect, it } from 'vitest';
import { installChrome, loadAll, resetWindow } from '../helpers/load-module';

beforeEach(async () => {
  resetWindow();
  installChrome('1.0.5');
  await loadAll([
    'extension/modules/pii-rules.js',
    'extension/modules/pii.js',
    'extension/modules/logger.js',
  ]);
});

const LOG = () => (window as any).__AR_LOG;

function flush(): Promise<void> {
  // chrome.storage.local mock is synchronous via callback, but we await microtasks
  return new Promise((r) => setTimeout(r, 0));
}

describe('logger', () => {
  it('exposes CODES and api', () => {
    expect(LOG().CODES.AI_FETCH).toBe('E_AI_FETCH');
    expect(typeof LOG().error).toBe('function');
  });

  it('appends entries that show up in list()', async () => {
    LOG().info('E_AI_FETCH', 'hello');
    await flush();
    await new Promise<void>((res) => LOG().list((b: any[]) => {
      expect(b.length).toBe(1);
      expect(b[0].code).toBe('E_AI_FETCH');
      expect(b[0].msg).toBe('hello');
      res();
    }));
  });

  it('scrubs PII in messages', async () => {
    LOG().error('E_AI_FETCH', 'falló para RUT 12.345.678-9');
    await flush();
    await new Promise<void>((res) => LOG().list((b: any[]) => {
      expect(b[0].msg).toContain('[RUT]');
      expect(b[0].msg).not.toContain('12.345.678');
      res();
    }));
  });

  it('anonymizes stack traces (chrome-extension URL → ext://)', async () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at foo (chrome-extension://abcdefghij/modules/pii.js:10:5)';
    LOG().error('E_DOM_PARSE', 'parse failed', err);
    await flush();
    await new Promise<void>((res) => LOG().list((b: any[]) => {
      expect(b[0].stack).toContain('ext://');
      expect(b[0].stack).not.toContain('chrome-extension://');
      res();
    }));
  });

  it('scrubs RUTs that appear in stack', async () => {
    const err = new Error('val=12.345.678-9');
    err.stack = 'Error: val=12.345.678-9\n    at x (ext.js:1:1)';
    LOG().error('E_LAB_PARSE', 'x', err);
    await flush();
    await new Promise<void>((res) => LOG().list((b: any[]) => {
      expect(b[0].stack).not.toContain('12.345.678');
      res();
    }));
  });

  it('clear empties buffer', async () => {
    LOG().info('E_UNKNOWN', 'a');
    await flush();
    LOG().clear();
    await flush();
    await new Promise<void>((res) => LOG().list((b: any[]) => {
      expect(b).toEqual([]);
      res();
    }));
  });

  it('export returns JSON with meta + entries', async () => {
    LOG().warn('E_UNKNOWN', 'algo');
    await flush();
    await new Promise<void>((res) => LOG().export((blob: string) => {
      const obj = JSON.parse(blob);
      expect(obj.meta.extensionVersion).toBe('1.0.5');
      expect(obj.meta.totalEntries).toBe(1);
      expect(obj.entries[0].msg).toBe('algo');
      res();
    }));
  });

  it('stats aggregates by code and level', async () => {
    LOG().error('E_AI_FETCH', 'a');
    LOG().error('E_AI_FETCH', 'b');
    LOG().warn('E_DOM_PARSE', 'c');
    await flush();
    await new Promise<void>((res) => LOG().stats((s: any) => {
      expect(s.total).toBe(3);
      expect(s.byCode.E_AI_FETCH).toBe(2);
      expect(s.byLevel.error).toBe(2);
      expect(s.byLevel.warn).toBe(1);
      res();
    }));
  });

  it('buffer is bounded to MAX entries', async () => {
    for (let i = 0; i < 220; i++) LOG().info('E_UNKNOWN', `m${i}`);
    await flush();
    await new Promise<void>((res) => LOG().list((b: any[]) => {
      expect(b.length).toBeLessThanOrEqual(200);
      res();
    }));
  });

  it('captures global window error events', async () => {
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'kaboom', filename: 'chrome-extension://xx/modules/y.js', lineno: 1, colno: 1,
    }));
    await flush();
    await new Promise<void>((res) => LOG().list((b: any[]) => {
      const last = b[b.length - 1];
      expect(last.code).toBe('E_UNCAUGHT');
      res();
    }));
  });
});
