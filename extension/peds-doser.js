/* Vínculo — Calculadora pediátrica de dosis por kilo
 * Basada en el arsenal CESFAM 2024 (formulaciones pediátricas: jarabes,
 * suspensiones, gotas, supositorios) y dosis MINSAL/AAP/Manual Pediatría PUC.
 *
 * Expone window.__AR_PEDS con:
 *   PEDS_DRUGS: catálogo
 *   compute({drugId, weightKg, ageMonths?}) -> {doseMg, dosePerTake, mlPerTake, freq, maxDailyMg, warning?}
 *
 * IMPORTANTE: solo orientativo. El médico siempre confirma.
 */
(function () {
  if (window.__AR_PEDS) return;

  // Cada entrada:
  //  id, name, category
  //  presentations: [{ label, mgPerMl }]   (arsenal CESFAM)
  //  doseMgPerKg: dosis por kilo POR TOMA
  //  freqHours: cada cuántas horas
  //  maxDailyMgPerKg | maxDailyMg (lo que limite primero)
  //  minAgeMonths / maxAgeMonths: opcional
  //  notes: texto corto
  const PEDS_DRUGS = [
    // ============== Analgésicos / antipiréticos ==============
    {
      id: "paracetamol",
      name: "Paracetamol",
      category: "Analgésico / Antipirético",
      presentations: [
        { label: "Gotas 100 mg/mL", mgPerMl: 100 },
        { label: "Jarabe 120 mg/5 mL", mgPerMl: 24 },
        { label: "Supositorio 125 mg", mgPerUnit: 125, unit: "supositorio" },
      ],
      doseMgPerKg: 15,
      freqHours: 6,
      maxDailyMgPerKg: 60,
      maxDailyMg: 4000,
      minAgeMonths: 0,
      notes: "10-15 mg/kg/dosis c/4-6h. Máx 60 mg/kg/día (≤4 g/día).",
    },
    {
      id: "ibuprofeno",
      name: "Ibuprofeno",
      category: "AINE",
      presentations: [
        { label: "Suspensión 200 mg/5 mL", mgPerMl: 40 },
        { label: "Suspensión 100 mg/5 mL (2%)", mgPerMl: 20 },
      ],
      doseMgPerKg: 10,
      freqHours: 8,
      maxDailyMgPerKg: 40,
      maxDailyMg: 2400,
      minAgeMonths: 6,
      notes: "5-10 mg/kg/dosis c/6-8h. Evitar <6m, deshidratación o ERC.",
    },
    {
      id: "metamizol",
      name: "Metamizol (dipirona)",
      category: "Analgésico",
      presentations: [
        { label: "Solución oral 250 mg/5 mL", mgPerMl: 50 },
        { label: "Supositorio 250 mg", mgPerUnit: 250, unit: "supositorio" },
      ],
      doseMgPerKg: 15,
      freqHours: 6,
      maxDailyMgPerKg: 60,
      maxDailyMg: 2000,
      minAgeMonths: 3,
      notes: "10-20 mg/kg/dosis c/6-8h VO. Evitar < 3 meses.",
    },

    // ============== Antibióticos ==============
    {
      id: "amoxicilina",
      name: "Amoxicilina",
      category: "Antibiótico — Penicilina",
      presentations: [
        { label: "Suspensión 250 mg/5 mL", mgPerMl: 50 },
        { label: "Suspensión 500 mg/5 mL", mgPerMl: 100 },
      ],
      doseMgPerKg: 25,           // 50/día ÷ 2 tomas (estándar OMA / faringoamigdalitis)
      freqHours: 12,
      maxDailyMgPerKg: 90,
      maxDailyMg: 3000,
      notes: "OMA/faringitis: 50 mg/kg/día c/12h. OMA severa: 80-90 mg/kg/día c/12h. Máx 3 g/día.",
    },
    {
      id: "amoxi_clav",
      name: "Amoxicilina + Ác. clavulánico",
      category: "Antibiótico — Penicilina",
      presentations: [
        { label: "Jarabe 400/57 mg/5 mL", mgPerMl: 80 },  // mg de amoxi
        { label: "Suspensión 250/62.5 mg/5 mL", mgPerMl: 50 },
      ],
      doseMgPerKg: 22.5,         // ~45/día c/12h (componente amoxi)
      freqHours: 12,
      maxDailyMgPerKg: 90,
      maxDailyMg: 3000,
      notes: "Dosis expresada como amoxicilina. 45 mg/kg/día c/12h, alta dosis 80-90 mg/kg/día.",
    },
    {
      id: "azitromicina",
      name: "Azitromicina",
      category: "Antibiótico — Macrólido",
      presentations: [
        { label: "Suspensión 200 mg/5 mL", mgPerMl: 40 },
        { label: "Suspensión 400 mg/5 mL", mgPerMl: 80 },
      ],
      doseMgPerKg: 10,
      freqHours: 24,
      maxDailyMgPerKg: 12,
      maxDailyMg: 500,
      notes: "10 mg/kg/día día 1, luego 5 mg/kg/día x 4 días. Máx 500 mg/día.",
    },
    {
      id: "claritromicina",
      name: "Claritromicina",
      category: "Antibiótico — Macrólido",
      presentations: [{ label: "Suspensión 250 mg/5 mL", mgPerMl: 50 }],
      doseMgPerKg: 7.5,
      freqHours: 12,
      maxDailyMgPerKg: 15,
      maxDailyMg: 1000,
      notes: "15 mg/kg/día c/12h. Máx 500 mg c/12h.",
    },
    {
      id: "cefadroxilo",
      name: "Cefadroxilo",
      category: "Antibiótico — Cefalosporina",
      presentations: [{ label: "Suspensión 250 mg/5 mL", mgPerMl: 50 }],
      doseMgPerKg: 15,
      freqHours: 12,
      maxDailyMgPerKg: 30,
      maxDailyMg: 2000,
      notes: "30 mg/kg/día c/12h. Faringoamigdalitis estreptocócica.",
    },
    {
      id: "flucloxacilina",
      name: "Flucloxacilina",
      category: "Antibiótico — Penicilina",
      presentations: [{ label: "Suspensión 250 mg/5 mL", mgPerMl: 50 }],
      doseMgPerKg: 12.5,
      freqHours: 6,
      maxDailyMgPerKg: 100,
      maxDailyMg: 4000,
      notes: "50 mg/kg/día c/6h (infecciones cutáneas/SAMS). Tomar con estómago vacío.",
    },
    {
      id: "cotrimoxazol",
      name: "Cotrimoxazol (TMP/SMX)",
      category: "Antibiótico",
      presentations: [
        { label: "Susp. 200/40 mg/5 mL (TMP 8 mg/mL)", mgPerMl: 8 },  // base TMP
      ],
      doseMgPerKg: 4,            // TMP por dosis
      freqHours: 12,
      maxDailyMgPerKg: 8,
      maxDailyMg: 320,
      minAgeMonths: 2,
      notes: "Dosis expresada en TMP. 8 mg/kg/día c/12h. Evitar <2 meses.",
    },
    {
      id: "metronidazol_susp",
      name: "Metronidazol",
      category: "Antibiótico / Antiparasitario",
      presentations: [{ label: "Suspensión 125 mg/5 mL", mgPerMl: 25 }],
      doseMgPerKg: 7.5,
      freqHours: 8,
      maxDailyMgPerKg: 30,
      maxDailyMg: 1500,
      notes: "30 mg/kg/día c/8h (giardia/anaerobios).",
    },
    {
      id: "nistatina",
      name: "Nistatina",
      category: "Antifúngico tópico oral",
      presentations: [{ label: "Susp. oral 100.000 UI/mL", unitLabel: "UI" }],
      doseFixed: { ml: 1, freqHours: 6, label: "1 mL (100.000 UI) c/6h en cavidad oral" },
      notes: "Lactantes: 1 mL c/6h. Niños mayores: 4-6 mL c/6h. No tragar inmediatamente.",
    },

    // ============== Antiparasitarios ==============
    {
      id: "mebendazol",
      name: "Mebendazol",
      category: "Antiparasitario",
      presentations: [{ label: "Suspensión 100 mg/5 mL", mgPerMl: 20 }],
      doseFixed: {
        ml: 5, freqHours: 24, days: 3,
        label: "100 mg (5 mL) c/12h x 3 días o 100 mg dosis única (oxiuros) repetir a 14 días",
      },
      minAgeMonths: 12,
      notes: "Dosis fija ≥1 año: 100 mg. Oxiuros: dosis única, repetir a 2 semanas.",
    },

    // ============== Anti-histamínicos ==============
    {
      id: "cetirizina",
      name: "Cetirizina",
      category: "Antihistamínico H1",
      presentations: [{ label: "Suspensión 5 mg/5 mL", mgPerMl: 1 }],
      doseAgeBands: [
        { minMonths: 6, maxMonths: 24, mgPerTake: 2.5, freqHours: 24, label: "6-23m: 2.5 mg c/24h" },
        { minMonths: 24, maxMonths: 72, mgPerTake: 2.5, freqHours: 12, label: "2-5a: 2.5 mg c/12h (máx 5 mg/día)" },
        { minMonths: 72, maxMonths: 9999, mgPerTake: 5, freqHours: 12, label: "≥6a: 5-10 mg/día" },
      ],
      maxDailyMg: 10,
      notes: "Dosis por edad, no por kilo. Evitar <6 meses.",
    },

    // ============== Corticoides ==============
    {
      id: "prednisona",
      name: "Prednisona",
      category: "Corticoide",
      presentations: [{ label: "Suspensión 20 mg/5 mL", mgPerMl: 4 }],
      doseMgPerKg: 1,
      freqHours: 24,
      maxDailyMgPerKg: 2,
      maxDailyMg: 60,
      notes: "1-2 mg/kg/día (crisis asmática, laringitis aguda). Máx 60 mg/día.",
    },

    // ============== Anticonvulsivantes ==============
    {
      id: "ac_valproico",
      name: "Ácido valproico",
      category: "Anticonvulsivante",
      presentations: [
        { label: "Solución oral 250 mg/5 mL", mgPerMl: 50 },
        { label: "Gotas 10 mg/gota", mgPerUnit: 10, unit: "gota" },
      ],
      doseMgPerKg: 10,           // mantención: 20-30/día c/12h
      freqHours: 12,
      maxDailyMgPerKg: 60,
      maxDailyMg: 2000,
      notes: "Inicio 10-15 mg/kg/día c/12h, titular hasta 30-60 mg/kg/día. Control de niveles.",
    },
    {
      id: "levetiracetam",
      name: "Levetiracetam",
      category: "Anticonvulsivante",
      presentations: [{ label: "Suspensión 100 mg/mL", mgPerMl: 100 }],
      doseMgPerKg: 10,
      freqHours: 12,
      maxDailyMgPerKg: 60,
      maxDailyMg: 3000,
      notes: "Inicio 20 mg/kg/día c/12h, mantención 40-60 mg/kg/día.",
    },

    // ============== Sales y otros ==============
    {
      id: "srh",
      name: "Sales rehidratación oral (SRO)",
      category: "Hidratación",
      presentations: [{ label: "Sobre 60 u 90 mEq Na/L" }],
      doseFormula: ({ weightKg }) => ({
        label: "Plan B (deshidratación leve-moderada)",
        ml: Math.round(weightKg * 75),
        freqHours: 4,
        notes: `${Math.round(weightKg * 75)} mL en 4 h. Reevaluar cada 1 h.`,
      }),
      notes: "Plan A: 10 mL/kg por cada deposición. Plan B: 75 mL/kg en 4 h.",
    },
    {
      id: "fierro",
      name: "Fierro elemental (gotas)",
      category: "Suplemento",
      presentations: [
        { label: "Gotas 25 mg/mL", mgPerMl: 25 },
        { label: "Gotas 50 mg/mL", mgPerMl: 50 },
      ],
      doseMgPerKg: 3,
      freqHours: 24,
      maxDailyMgPerKg: 6,
      maxDailyMg: 60,
      notes: "Profilaxis: 1-2 mg/kg/día. Tratamiento ferropenia: 3-6 mg/kg/día.",
    },
    {
      id: "zinc",
      name: "Zinc sulfato (gotas)",
      category: "Suplemento",
      presentations: [{ label: "Gotas 5 mg/mL", mgPerMl: 5 }],
      doseFixed: {
        ml: 4, freqHours: 24, days: 14,
        label: "20 mg/día x 10-14 días (≥6m). 10 mg/día en <6m.",
      },
      notes: "Coadyuvante en diarrea aguda (OMS).",
    },
  ];

  function compute({ drugId, weightKg, ageMonths = null }) {
    const d = PEDS_DRUGS.find((x) => x.id === drugId);
    if (!d) return { error: "Fármaco no encontrado." };
    if (!weightKg || weightKg <= 0) return { error: "Ingresa el peso del paciente (kg)." };
    if (weightKg > 80) return { error: "Peso > 80 kg: usa dosis adulto." };

    // Restricción de edad
    const warns = [];
    if (d.minAgeMonths != null && ageMonths != null && ageMonths < d.minAgeMonths) {
      warns.push(`⚠ Indicado desde ${d.minAgeMonths} meses (paciente: ${ageMonths} m).`);
    }

    // 1) Dosis por bandas de edad
    if (d.doseAgeBands) {
      if (ageMonths == null) return { error: "Este fármaco requiere edad en meses." };
      const band = d.doseAgeBands.find((b) => ageMonths >= b.minMonths && ageMonths < b.maxMonths);
      if (!band) return { error: "Edad fuera del rango pediátrico para este fármaco." };
      return {
        kind: "fixed",
        regimen: band.label,
        dosePerTakeMg: band.mgPerTake,
        freqHours: band.freqHours,
        maxDailyMg: d.maxDailyMg,
        warnings: warns,
        notes: d.notes,
      };
    }

    // 2) Dosis fija (ej: nistatina, mebendazol)
    if (d.doseFixed) {
      return {
        kind: "fixed",
        regimen: d.doseFixed.label,
        ml: d.doseFixed.ml,
        freqHours: d.doseFixed.freqHours,
        days: d.doseFixed.days,
        warnings: warns,
        notes: d.notes,
      };
    }

    // 3) Fórmula a medida (SRO)
    if (d.doseFormula) {
      const out = d.doseFormula({ weightKg });
      return { kind: "formula", regimen: out.label, ml: out.ml, freqHours: out.freqHours, extraNotes: out.notes, warnings: warns, notes: d.notes };
    }

    // 4) Dosis por kilo (estándar)
    const dosePerTakeMg = +(weightKg * d.doseMgPerKg).toFixed(1);
    const dailyMg = +(dosePerTakeMg * (24 / d.freqHours)).toFixed(1);
    const maxByKg = d.maxDailyMgPerKg ? +(weightKg * d.maxDailyMgPerKg).toFixed(1) : Infinity;
    const maxAbs = d.maxDailyMg || Infinity;
    const maxDaily = Math.min(maxByKg, maxAbs);
    let cappedPerTake = dosePerTakeMg;
    if (dailyMg > maxDaily) {
      cappedPerTake = +(maxDaily / (24 / d.freqHours)).toFixed(1);
      warns.push(`⚠ Dosis diaria por kg supera el techo (${maxDaily} mg/día). Sugerido máx ${cappedPerTake} mg/dosis.`);
    }
    return {
      kind: "perKg",
      drug: d,
      dosePerTakeMg: cappedPerTake,
      dailyMg: Math.min(dailyMg, maxDaily),
      freqHours: d.freqHours,
      maxDailyMg: maxDaily,
      doseMgPerKg: d.doseMgPerKg,
      warnings: warns,
      notes: d.notes,
    };
  }

  // Convierte mg a mL para una presentación dada
  function toMl(mg, presentation) {
    if (!presentation) return null;
    if (presentation.mgPerMl) return +(mg / presentation.mgPerMl).toFixed(2);
    if (presentation.mgPerUnit && presentation.unit) {
      return { units: +(mg / presentation.mgPerUnit).toFixed(2), unit: presentation.unit };
    }
    return null;
  }

  window.__AR_PEDS = { PEDS_DRUGS, compute, toMl };
})();
