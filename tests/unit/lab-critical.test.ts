import { beforeEach, describe, expect, it } from 'vitest';
import { installChrome, loadAll, resetWindow } from '../helpers/load-module';

beforeEach(async () => {
  resetWindow();
  installChrome();
  await loadAll(['extension/modules/utils.js', 'extension/modules/lab-critical.js']);
});

const LC = () => (window as any).__AR_LAB_CRITICAL;

describe('lab-critical.evaluate', () => {
  it('returns null for unknown analyte', () => {
    expect(LC().evaluate('foobar', 1)).toBeNull();
  });

  it('returns null for non-numeric / null values', () => {
    expect(LC().evaluate('potasio', null)).toBeNull();
    expect(LC().evaluate('potasio', 'abc')).toBeNull();
  });

  it('detects hypokalemia (low potassium)', () => {
    const r = LC().evaluate('potasio', 2.5, { log: false });
    expect(r.severity).toBe('critical');
    expect(r.side).toBe('low');
    expect(r.reason).toMatch(/Hipokalemia/);
  });

  it('detects hyperkalemia (high potassium)', () => {
    const r = LC().evaluate('potasio', 6.2, { log: false });
    expect(r.severity).toBe('critical');
    expect(r.side).toBe('high');
  });

  it('returns null when value is in normal range', () => {
    expect(LC().evaluate('potasio', 4.0, { log: false })).toBeNull();
    expect(LC().evaluate('sodio', 140, { log: false })).toBeNull();
  });

  it('parses values with comma decimals', () => {
    const r = LC().evaluate('glicemia', '45,5', { log: false });
    expect(r?.severity).toBe('critical');
    expect(r?.side).toBe('low');
  });

  it('high-only rules ignore low values', () => {
    expect(LC().evaluate('inr', 1.0, { log: false })).toBeNull();
    expect(LC().evaluate('inr', 5.0, { log: false })?.side).toBe('high');
  });

  it('low-only rules ignore high values', () => {
    expect(LC().evaluate('vfg', 90, { log: false })).toBeNull();
    expect(LC().evaluate('vfg', 20, { log: false })?.side).toBe('low');
  });

  it('all critical rules trigger at extreme values', () => {
    const cases: Array<[string, number, 'low' | 'high']> = [
      ['sodio', 120, 'low'],
      ['sodio', 160, 'high'],
      ['glicemia', 30, 'low'],
      ['glicemia', 400, 'high'],
      ['hemoglobina', 5, 'low'],
      ['plaquetas', 10000, 'low'],
      ['troponina', 1.0, 'high'],
      ['trigliceridos', 800, 'high'],
    ];
    for (const [k, v, side] of cases) {
      const r = LC().evaluate(k, v, { log: false });
      expect(r, `${k}=${v}`).not.toBeNull();
      expect(r.side).toBe(side);
    }
  });
});

describe('lab-critical.collect', () => {
  it('returns empty array on missing/empty lab', () => {
    expect(LC().collect(null, {})).toEqual([]);
    expect(LC().collect({ analytes: {} }, {})).toEqual([]);
  });

  it('aggregates alerts from multiple analytes and orders critical first', () => {
    const lab = {
      date: '01/01/2025',
      analytes: {
        potasio: { value: 6.5, unit: 'mEq/L' },
        hba1c: { value: 11, unit: '%' },
        sodio: { value: 140, unit: 'mEq/L' },
      },
    };
    const out = LC().collect(lab, {});
    expect(out.length).toBe(2);
    expect(out[0].severity).toBe('critical');
  });

  it('skips dotted sub-keys', () => {
    const out = LC().collect({ analytes: { 'potasio.raw': { value: 6.5 } } }, {});
    expect(out).toEqual([]);
  });
});

describe('lab-critical overrides', () => {
  it('saves and applies overrides via getEffective', () => {
    LC().saveOverrides({ potasio: { lo: 3.5, hi: 5.0 } });
    const eff = LC().getEffective('potasio');
    expect(eff.lo).toBe(3.5);
    expect(eff.hi).toBe(5.0);
    // Now 5.2 should trigger high (was normal at default 5.5)
    const r = LC().evaluate('potasio', 5.2, { log: false });
    expect(r?.overridden).toBe(true);
  });

  it('resetOverrides clears them', () => {
    LC().saveOverrides({ potasio: { lo: 9, hi: 9 } });
    LC().resetOverrides();
    expect(LC().getEffective('potasio').lo).toBe(3.0);
  });

  it('loadOverrides returns {} when storage corrupt', () => {
    window.localStorage.setItem(LC().STORAGE_KEY, '{not json');
    expect(LC().loadOverrides()).toEqual({});
  });
});

describe('lab-critical patientHash + log', () => {
  it('patientHash is deterministic and prefixed', () => {
    const a = LC().patientHash('12.345.678-9');
    const b = LC().patientHash('123456789');
    expect(a).toBe(b);
    expect(a).toMatch(/^p_[0-9a-f]{8}$/);
    expect(LC().patientHash(null)).toBeNull();
  });

  it('appends to log when ctx.log !== false', () => {
    LC().clearLog();
    LC().evaluate('potasio', 6.5, { name: 'K+', unit: 'mEq/L' });
    const log = LC().getLog();
    expect(log.length).toBe(1);
    expect(log[0].key).toBe('potasio');
    expect(log[0].severity).toBe('critical');
  });

  it('clearLog removes entries', () => {
    LC().evaluate('potasio', 6.5);
    LC().clearLog();
    expect(LC().getLog()).toEqual([]);
  });

  it('clearLogForPatient removes only that patient', () => {
    (window as any).__AR_PATIENT = { extract: () => ({ rut: '12345678-9' }) };
    LC().clearLog();
    LC().evaluate('potasio', 6.5, { name: 'K+' });
    const h = LC().currentPatientHash();
    expect(LC().getLog().length).toBe(1);
    LC().clearLogForPatient(h);
    expect(LC().getLog().length).toBe(0);
  });
});
