import { beforeEach, describe, expect, it } from 'vitest';
import { installChrome, loadAll, resetWindow } from '../helpers/load-module';

beforeEach(async () => {
  resetWindow();
  installChrome();
  await loadAll(['extension/modules/pii-rules.js', 'extension/modules/pii.js']);
});

const PII = () => (window as any).__AR_PII;
const RULES = () => (window as any).__AR_PII_RULES;

describe('pii-rules', () => {
  it('exposes rules with required fields', () => {
    const rules = RULES().RULES;
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const r of rules) {
      expect(r.id).toMatch(/^PII-/);
      expect(r.pattern).toBeInstanceOf(RegExp);
      expect(r.replacement).toBeTypeOf('string');
      expect(r.severidad).toMatch(/critica|alta|media|baja/);
      expect(r.evidencia).toBeTruthy();
      expect(Array.isArray(r.ejemplos)).toBe(true);
    }
  });

  it('audit returns hits with rule ids and counts', () => {
    const a = RULES().audit('RUT 12.345.678-9 mail x@y.cl tel +56 9 1234 5678');
    expect(a.hits.length).toBeGreaterThanOrEqual(3);
    const ids = a.hits.map((h: any) => h.rule);
    expect(ids).toContain('PII-RUT-001');
    expect(ids).toContain('PII-EMAIL-001');
    expect(ids).toContain('PII-PHONE-001');
  });

  it('every rule example is detected by its own pattern', () => {
    for (const r of RULES().RULES) {
      for (const ex of r.ejemplos) {
        r.pattern.lastIndex = 0;
        expect(r.pattern.test(ex), `${r.id} should match ${ex}`).toBe(true);
      }
    }
  });

  it('audit on null/undefined returns empty hits', () => {
    expect(RULES().audit(null).hits).toEqual([]);
  });
});

describe('pii.scrub', () => {
  it('redacts RUT in multiple formats', () => {
    expect(PII().scrub('paciente 12.345.678-9 ingresa')).toContain('[RUT]');
    expect(PII().scrub('rut 12345678-K')).toContain('[RUT]');
  });

  it('redacts emails', () => {
    expect(PII().scrub('contacto: juan.perez+test@uchile.cl')).toContain('[EMAIL]');
  });

  it('redacts Chilean phone numbers', () => {
    expect(PII().scrub('llamar al +56 9 1234 5678')).toContain('[TEL]');
    expect(PII().scrub('fono 22345678')).toContain('[TEL]');
  });

  it('redacts addresses', () => {
    const out = PII().scrub('vive en Av. Providencia 1500 depto 302');
    expect(out).toContain('[DIRECCIÓN]');
  });

  it('handles null/undefined/numeric gracefully', () => {
    expect(PII().scrub(null)).toBeNull();
    expect(PII().scrub(undefined)).toBeUndefined();
    expect(PII().scrub(42)).toBe('42');
  });

  it('is idempotent: scrub(scrub(x)) === scrub(x)', () => {
    const samples = [
      'RUT 12.345.678-9 y mail a@b.cl',
      'tel 912345678 dir Calle Las Rosas 1234',
      'sin pii aquí',
    ];
    for (const s of samples) {
      const once = PII().scrub(s);
      const twice = PII().scrub(once);
      expect(twice).toBe(once);
    }
  });

  it('fuzz: 100 random PII-laced strings never leak the original RUT body', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const body = String(10000000 + Math.floor(rng() * 89999999));
      const dv = String(Math.floor(rng() * 10));
      const rut = `${body.slice(0, 2)}.${body.slice(2, 5)}.${body.slice(5)}-${dv}`;
      const noise = randomNoise(rng);
      const text = `${noise} ${rut} ${noise}`;
      const out = PII().scrub(text);
      expect(out).not.toContain(rut);
    }
  });
});

describe('pii.scrubObject', () => {
  it('drops forbidden keys recursively', () => {
    const obj = {
      diagnostico: 'HTA',
      rut: '12.345.678-9',
      nested: { nombre: 'Juan', edad: 50, email: 'a@b.cl' },
      list: [{ telefono: '912345678', dx: 'DM2' }],
    };
    const out = PII().scrubObject(obj);
    expect(out.rut).toBeUndefined();
    expect(out.nested.nombre).toBeUndefined();
    expect(out.nested.email).toBeUndefined();
    expect(out.nested.edad).toBe(50);
    expect(out.list[0].telefono).toBeUndefined();
    expect(out.list[0].dx).toBe('DM2');
    expect(out.diagnostico).toBe('HTA');
  });

  it('scrubs PII inside string values too', () => {
    const out = PII().scrubObject({ notas: 'mail x@y.cl' });
    expect(out.notas).toContain('[EMAIL]');
  });

  it('passes through primitives', () => {
    expect(PII().scrubObject(null)).toBeNull();
    expect(PII().scrubObject(123)).toBe(123);
    expect(PII().scrubObject(true)).toBe(true);
  });
});

describe('pii.audit', () => {
  it('delegates to rules.audit when available', () => {
    const a = PII().audit('rut 12.345.678-9');
    expect(a.hits.length).toBeGreaterThan(0);
  });
});

describe('pii.buildPatientContext', () => {
  it('returns scrubbed object even with no extractors registered', () => {
    const ctx = PII().buildPatientContext();
    expect(ctx).toBeTypeOf('object');
  });

  it('integrates with mocked __AR_DX_EXTRACT and __AR_PATIENT', () => {
    (window as any).__AR_DX_EXTRACT = {
      extract: () => ({ candidatos: [{ abrev: 'HTA' }, { abrev: 'DM2' }] }),
    };
    (window as any).__AR_PATIENT = {
      extract: () => ({ edad: 65, sexo: 'F' }),
    };
    const ctx = PII().buildPatientContext();
    expect(ctx.diagnosticos).toEqual(['HTA', 'DM2']);
    expect(ctx.edad).toBe(65);
    expect(ctx.sexo).toBe('F');
  });
});

// --- helpers ---
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomNoise(rng: () => number) {
  const words = ['paciente', 'consulta', 'control', 'examen', 'evolución', 'lab', 'TA 120/80', 'HbA1c 7.2'];
  const n = 1 + Math.floor(rng() * 4);
  return Array.from({ length: n }, () => words[Math.floor(rng() * words.length)]).join(' ');
}
