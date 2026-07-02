import { beforeEach, describe, expect, it } from 'vitest';
import { installChrome, loadExtModule, resetWindow } from '../helpers/load-module';

beforeEach(async () => {
  resetWindow();
  installChrome();
  document.body.innerHTML = '';
  await loadExtModule('extension/dx-extract.js');
});

const DX = () => (window as any).__AR_DX_EXTRACT;

describe('dx-extract.normalize', () => {
  it('matches HTA', () => {
    const r = DX().normalize('HTA');
    expect(r.abrev).toBe('HTA');
    expect(r.cie10).toBe('I10');
    expect(r.conf).toBeGreaterThan(0.5);
  });

  it('matches Diabetes Mellitus tipo 2', () => {
    const r = DX().normalize('Diabetes Mellitus tipo 2');
    expect(r.abrev).toBe('DM2');
    expect(r.cie10).toBe('E11.9');
  });

  it('matches by explicit CIE-10 code', () => {
    const r = DX().normalize('Paciente con J45.9 controlada');
    expect(r.abrev).toBe('Asma');
    expect(r.conf).toBeCloseTo(0.99);
  });

  it('returns clean text + cie10 when no dict match', () => {
    const r = DX().normalize('Z99.8 algo raro');
    expect(r.cie10).toBe('Z99.8');
    expect(r.abrev).toBe('');
  });

  it('returns empty for empty input', () => {
    const r = DX().normalize('');
    expect(r.cie10).toBe('');
    expect(r.conf).toBe(0);
  });

  it('matches multiple dx categories', () => {
    expect(DX().normalize('EPOC severo').abrev).toBe('EPOC');
    expect(DX().normalize('asma bronquial').abrev).toBe('Asma');
    expect(DX().normalize('depresión mayor').abrev).toBe('TDM');
    expect(DX().normalize('lumbago crónico').abrev).toBe('Lumbago');
    expect(DX().normalize('embarazo en curso').abrev).toBe('Embarazo');
  });

  it('handles accent variants', () => {
    expect(DX().normalize('hipertensión arterial').abrev).toBe('HTA');
    expect(DX().normalize('hipertension arterial').abrev).toBe('HTA');
  });
});

describe('dx-extract.listAbbrev', () => {
  it('returns all entries with required fields', () => {
    const list = DX().listAbbrev();
    expect(list.length).toBeGreaterThan(20);
    for (const e of list) {
      expect(e.abrev).toBeTypeOf('string');
      expect(e.cie10).toMatch(/^[A-Z]\d/);
    }
  });
});

describe('dx-extract.extract (DOM)', () => {
  it('returns empty when DOM has no dx', () => {
    const r = DX().extract();
    expect(r.principal).toBeNull();
    expect(r.candidatos).toEqual([]);
  });

  it('extracts from labeled input', () => {
    document.body.innerHTML = `
      <div class="form-group">
        <label for="dx1">Diagnóstico</label>
        <input id="dx1" value="Hipertensión arterial">
      </div>
    `;
    // jsdom: offsetParent is null for inputs but our code allows INPUT
    const r = DX().extract();
    expect(r.principal?.abrev).toBe('HTA');
  });

  it('extracts from CIE-10 badge with dx label nearby', () => {
    document.body.innerHTML = `
      <table><tbody><tr><th>Diagnóstico</th><td><span class="badge">I10 hipertensión</span></td></tr></tbody></table>
    `;
    const r = DX().extract();
    expect(r.candidatos.length).toBeGreaterThan(0);
  });

  it('detects ambiguity between top candidates', () => {
    document.body.innerHTML = `
      <div class="form-group"><label for="d1">Diagnóstico</label><input id="d1" value="HTA"></div>
      <div class="form-group"><label for="d2">Problema de salud</label><input id="d2" value="DM2"></div>
    `;
    const r = DX().extract();
    expect(r.candidatos.length).toBeGreaterThanOrEqual(2);
  });
});
