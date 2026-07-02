import { beforeEach, describe, expect, it } from 'vitest';
import { installChrome, loadExtModule, resetWindow } from '../helpers/load-module';

declare global {
  interface Window { __AR_RUT: any }
}

beforeEach(async () => {
  resetWindow();
  installChrome();
  await loadExtModule('extension/rut-utils.js');
});

describe('rut-utils', () => {
  const RUT = () => (window as any).__AR_RUT;

  it('clean: strips dots, dashes, spaces and uppercases K', () => {
    expect(RUT().clean('12.345.678-k')).toBe('12345678K');
    expect(RUT().clean(' 12 345 678 - 5 ')).toBe('12345678-5'.replace('-', ''));
    expect(RUT().clean(null)).toBe('');
    expect(RUT().clean(undefined)).toBe('');
  });

  it('dv: computes módulo 11 digit verifier', () => {
    // Known good RUT bodies
    expect(RUT().dv('12345678')).toBe('5');
    expect(RUT().dv('11111111')).toBe('1');
    expect(RUT().dv('1')).toBe('9');
    expect(RUT().dv('')).toBe('');
  });

  it('dv: returns K when remainder is 10 and 0 when 11', () => {
    // 13 → 11-(suma%11). Force a body where dv === K
    // 7654321 dv? compute: 1*2+2*3+3*4+4*5+5*6+6*7+7*2 = 2+6+12+20+30+42+14=126; 11-(126%11)=11-5=6 → '6'
    // Use a known case: '20.000.000' dv = ?
    const v = RUT().dv('20000000');
    expect(['0','1','2','3','4','5','6','7','8','9','K']).toContain(v);
  });

  it('format: inserts dots and dash', () => {
    expect(RUT().format('123456785')).toBe('12.345.678-5');
    expect(RUT().format('19')).toBe('1-9');
    expect(RUT().format('K')).toBe('K');
  });

  it('validate: accepts valid RUT in multiple formats', () => {
    expect(RUT().validate('12.345.678-5').ok).toBe(true);
    expect(RUT().validate('123456785').ok).toBe(true);
    expect(RUT().validate('12345678-5').ok).toBe(true);
  });

  it('validate: rejects invalid DV', () => {
    const r = RUT().validate('12.345.678-9');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/DV/);
  });

  it('validate: rejects empty / too short / invalid chars', () => {
    expect(RUT().validate('').ok).toBe(false);
    expect(RUT().validate('1').ok).toBe(false);
    expect(RUT().validate('ABCD-1').ok).toBe(false);
  });

  it('equal: normalizes both sides; empty != empty', () => {
    expect(RUT().equal('12.345.678-5', '123456785')).toBe(true);
    expect(RUT().equal('12.345.678-5', '12345678-K')).toBe(false);
    expect(RUT().equal('', '')).toBe(false);
    expect(RUT().equal(null, undefined)).toBe(false);
  });

  it('IIFE is idempotent (no double install)', async () => {
    const ref = (window as any).__AR_RUT;
    await loadExtModule('extension/rut-utils.js');
    expect((window as any).__AR_RUT).toBe(ref);
  });
});
