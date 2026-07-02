/* Vínculo — Sugerencias de diagnóstico desde valores de laboratorio
 * Reglas conservadoras basadas en valores de referencia ampliamente aceptados
 * (OMS, KDIGO, ATP-IV, ADA, MINSAL). NO reemplaza el juicio clínico.
 *
 * API: window.__AR_DX.fromLabs(labAnalytes, ctx?) -> [{cie10, label, severity, basis}]
 *
 * labAnalytes: objeto { glicemia: { value, unit, fecha }, ... } (formato lab session)
 * ctx: { sex: "M"|"F", age?: number } (ctx opcional para reglas sexo-específicas)
 */
(function () {
  if (window.__AR_DX) return;

  const num = (a) => {
    if (!a) return null;
    const v = typeof a === "object" ? a.value : a;
    if (v == null) return null;
    const m = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };

  function fromLabs(labs, ctx) {
    if (!labs) return [];
    const sex = (ctx?.sex || "").toUpperCase().startsWith("F") ? "F" : (ctx?.sex || "").toUpperCase().startsWith("M") ? "M" : null;
    const out = [];
    const add = (cie10, label, severity, basis) => out.push({ cie10, label, severity, basis });

    // ---- Hemoglobina (anemia OMS) ----
    const hb = num(labs.hemoglobina);
    if (hb != null) {
      if (sex === "F") {
        if (hb < 8) add("D64.9", "Anemia severa", "alta", `Hb ${hb} g/dL (<8)`);
        else if (hb < 11) add("D64.9", "Anemia moderada", "media", `Hb ${hb} g/dL (mujer <11)`);
        else if (hb < 12) add("D64.9", "Anemia leve", "baja", `Hb ${hb} g/dL (mujer <12)`);
      } else if (sex === "M") {
        if (hb < 8) add("D64.9", "Anemia severa", "alta", `Hb ${hb} g/dL (<8)`);
        else if (hb < 11) add("D64.9", "Anemia moderada", "media", `Hb ${hb} g/dL (hombre <11)`);
        else if (hb < 13) add("D64.9", "Anemia leve", "baja", `Hb ${hb} g/dL (hombre <13)`);
      } else {
        // sin sexo: usar umbral neutro
        if (hb < 8) add("D64.9", "Anemia severa", "alta", `Hb ${hb} g/dL (<8)`);
        else if (hb < 12) add("D64.9", "Anemia (probable)", "baja", `Hb ${hb} g/dL — verificar sexo`);
      }
      // VCM para subtipo
      const vcm = num(labs.vcm);
      if (vcm != null && hb < (sex === "M" ? 13 : 12)) {
        if (vcm < 80) add("D50.9", "Anemia microcítica (sospecha ferropénica)", "media", `Hb ${hb} + VCM ${vcm} (<80)`);
        else if (vcm > 100) add("D53.9", "Anemia macrocítica (descartar B12/folato)", "media", `Hb ${hb} + VCM ${vcm} (>100)`);
      }
    }

    // ---- Glicemia / HbA1c (ADA / MINSAL) ----
    // Subtipos: glicemia.subtype puede ser "ayunas" | "postcarga_2h" | "random" | "hgt" | "capilar"
    const gli = num(labs.glicemia);
    const a1c = num(labs.hba1c);
    const subtype = labs.glicemia?.subtype || null;
    const isFasting = subtype === "ayunas" || subtype === null;
    const isPostLoad = subtype === "postcarga_2h";
    if (gli != null && isPostLoad && gli >= 200) {
      add("E11.9", "Diabetes mellitus tipo 2 (PTGO 2h ≥200)", "alta", `Glicemia post-carga ${gli} mg/dL`);
    } else if (gli != null && isFasting && gli >= 126) {
      add("E11.9", "Diabetes mellitus tipo 2 (sospecha — confirmar con 2ª muestra)", "alta", `Glicemia ayuno ${gli} mg/dL (≥126)`);
    } else if (gli != null && isFasting && gli >= 100) {
      add("R73.0", "Glicemia alterada en ayunas", "media", `Glicemia ayuno ${gli} mg/dL (100-125)`);
    } else if (gli != null && subtype === "random" && gli >= 200) {
      add("E11.9", "DM2 (glicemia al azar ≥200 + síntomas)", "alta", `Glicemia random ${gli} mg/dL`);
    }
    if (a1c != null) {
      if (a1c >= 6.5) add("E11.9", "Diabetes mellitus tipo 2", "alta", `HbA1c ${a1c}% (≥6.5)`);
      else if (a1c >= 5.7) add("R73.0", "Prediabetes", "media", `HbA1c ${a1c}% (5.7-6.4)`);
      // control DM2
      if (a1c >= 9) add("E11.65", "DM2 mal controlada", "alta", `HbA1c ${a1c}% (≥9)`);
    }

    // ---- TSH ----
    const tsh = num(labs.tsh);
    const t4 = num(labs.t4_libre);
    if (tsh != null) {
      if (tsh > 10) add("E03.9", "Hipotiroidismo (probable)", "alta", `TSH ${tsh} µUI/mL (>10)`);
      else if (tsh > 4.5) {
        if (t4 != null && t4 < 0.8) add("E03.9", "Hipotiroidismo", "alta", `TSH ${tsh} + T4L ${t4} bajo`);
        else add("E02", "Hipotiroidismo subclínico", "media", `TSH ${tsh} µUI/mL (4.5-10)`);
      } else if (tsh < 0.3) {
        add("E05.9", "Hipertiroidismo (sospecha)", "media", `TSH ${tsh} µUI/mL (<0.3)`);
      }
    }

    // ---- Perfil lipídico (ATP-IV / MINSAL) ----
    const ct = num(labs.colesterol_total);
    const ldl = num(labs.ldl);
    const hdl = num(labs.hdl);
    const tg = num(labs.trigliceridos);
    if (ldl != null && ldl >= 190) add("E78.0", "Hipercolesterolemia severa", "alta", `LDL ${ldl} mg/dL (≥190)`);
    else if (ldl != null && ldl >= 160) add("E78.0", "Hipercolesterolemia", "media", `LDL ${ldl} mg/dL (≥160)`);
    else if (ct != null && ct >= 240) add("E78.0", "Hipercolesterolemia", "media", `CT ${ct} mg/dL (≥240)`);
    if (tg != null) {
      if (tg >= 500) add("E78.1", "Hipertrigliceridemia severa (riesgo pancreatitis)", "alta", `TG ${tg} mg/dL (≥500)`);
      else if (tg >= 200) add("E78.1", "Hipertrigliceridemia", "media", `TG ${tg} mg/dL (≥200)`);
    }
    if (ct != null && tg != null && ldl != null) {
      if ((ldl >= 130 || ct >= 200) && tg >= 150) add("E78.2", "Dislipidemia mixta", "media", `LDL ${ldl} + TG ${tg}`);
    }
    if (hdl != null) {
      if (sex === "M" && hdl < 40) add("E78.6", "HDL bajo (factor riesgo CV)", "baja", `HDL ${hdl} (hombre <40)`);
      else if (sex === "F" && hdl < 50) add("E78.6", "HDL bajo (factor riesgo CV)", "baja", `HDL ${hdl} (mujer <50)`);
    }

    // ---- Función renal ----
    const creat = num(labs.creatinina);
    const vfg = num(labs.vfg);
    if (vfg != null) {
      if (vfg < 15) add("N18.5", "Enfermedad renal crónica G5", "alta", `VFG ${vfg} (<15)`);
      else if (vfg < 30) add("N18.4", "Enfermedad renal crónica G4", "alta", `VFG ${vfg} (15-29)`);
      else if (vfg < 45) add("N18.3", "Enfermedad renal crónica G3b", "media", `VFG ${vfg} (30-44)`);
      else if (vfg < 60) add("N18.3", "Enfermedad renal crónica G3a", "media", `VFG ${vfg} (45-59)`);
      else if (vfg < 90) add("N18.2", "ERC G2 (con marcadores de daño)", "baja", `VFG ${vfg} (60-89)`);
    } else if (creat != null) {
      const crLimit = sex === "F" ? 1.1 : 1.3;
      if (creat > crLimit) add("N28.9", "Función renal alterada (revisar VFG)", "media", `Creat ${creat} mg/dL (>${crLimit})`);
    }
    const rac = num(labs.rac);
    if (rac != null) {
      if (rac >= 300) add("N18.9", "Albuminuria severa (A3)", "alta", `RAC ${rac} mg/g (≥300)`);
      else if (rac >= 30) add("N18.9", "Albuminuria moderada (A2)", "media", `RAC ${rac} mg/g (30-300)`);
    }

    // ---- Hígado ----
    const got = num(labs.got);
    const gpt = num(labs.gpt);
    const ggt = num(labs.ggt);
    if (gpt != null && gpt > 120) add("K76.9", "Hipertransaminasemia (>3x VN)", "media", `GPT ${gpt} U/L`);
    else if (gpt != null && gpt > 40) add("R74.0", "Transaminasas levemente elevadas", "baja", `GPT ${gpt} U/L`);
    if (got != null && got > 120) add("K76.9", "Hipertransaminasemia (>3x VN)", "media", `GOT ${got} U/L`);
    if (ggt != null && ggt > 100) add("R74.8", "GGT elevada (descartar colestasis/OH)", "baja", `GGT ${ggt} U/L`);

    // ---- Electrolitos ----
    // ---- Electrolitos (con cruce drug-watch para alertas QT) ----
    const k = num(labs.potasio);
    const na = num(labs.sodio);
    // Detectar fármacos en pantalla que interactúan con K+ o QT
    let drugCtx = null;
    try { drugCtx = window.__AR_DRUG?.scanDom?.(document) || null; } catch {}
    const drugText = drugCtx ? drugCtx.map((m) => m.text).join(" ").toLowerCase() : "";
    const onDiuretic = /furosemid|hidroclorot|tiazida|espironolacton/.test(drugText);
    const onQTdrug = /amiodarona|sotalol|haloperidol|citalopram|escitalopram|ondansetron|azitromicina|claritromicina|levofloxacin|moxifloxacin/.test(drugText);
    if (k != null) {
      if (k >= 6) add("E87.5", "Hiperkalemia severa (riesgo arritmia)", "alta", `K ${k} mEq/L (≥6)${onDiuretic ? " · paciente con diurético/IECA — revisar" : ""}`);
      else if (k >= 5.5) add("E87.5", "Hiperkalemia", "media", `K ${k} mEq/L (≥5.5)`);
      else if (k < 3) add("E87.6", `Hipokalemia severa${onQTdrug ? " — ALERTA QT" : ""}`, "alta", `K ${k} mEq/L (<3)${onQTdrug ? " · paciente con fármaco QT-prolongador" : ""}${onDiuretic ? " · diurético" : ""}`);
      else if (k < 3.5) add("E87.6", `Hipokalemia${onQTdrug ? " (ojo QT)" : ""}`, onQTdrug ? "alta" : "media", `K ${k} mEq/L (<3.5)${onDiuretic ? " · diurético" : ""}`);
    }
    if (na != null) {
      if (na < 120) add("E87.1", "Hiponatremia severa (<120) — urgencia", "alta", `Na ${na} mEq/L`);
      else if (na < 125) add("E87.1", "Hiponatremia moderada (120-124)", "alta", `Na ${na} mEq/L`);
      else if (na < 130) add("E87.1", "Hiponatremia leve (125-129)", "media", `Na ${na} mEq/L`);
      else if (na < 135) add("E87.1", "Hiponatremia limítrofe (130-134)", "baja", `Na ${na} mEq/L`);
      else if (na > 150) add("E87.0", "Hipernatremia", "alta", `Na ${na} mEq/L (>150)`);
    }

    // ---- Ácido úrico ----
    const au = num(labs.acido_urico);
    if (au != null) {
      if (sex === "M" && au > 7) add("E79.0", "Hiperuricemia (hombre >7)", "baja", `AU ${au} mg/dL`);
      else if (sex === "F" && au > 6) add("E79.0", "Hiperuricemia (mujer >6)", "baja", `AU ${au} mg/dL`);
      else if (au > 7) add("E79.0", "Hiperuricemia", "baja", `AU ${au} mg/dL`);
    }

    // ---- Vitamina D / B12 / Ferritina ----
    const vd = num(labs.vitamina_d);
    if (vd != null) {
      if (vd < 12) add("E55.9", "Déficit severo vitamina D", "media", `25-OH-D ${vd} ng/mL`);
      else if (vd < 20) add("E55.9", "Deficiencia vitamina D", "baja", `25-OH-D ${vd} ng/mL`);
      else if (vd < 30) add("E55.9", "Insuficiencia vitamina D", "baja", `25-OH-D ${vd} ng/mL`);
    }
    const b12 = num(labs.vitamina_b12);
    if (b12 != null && b12 < 200) add("E53.8", "Déficit vitamina B12", "media", `B12 ${b12} pg/mL (<200)`);
    const ferr = num(labs.ferritina);
    if (ferr != null && ferr < 30) add("E61.1", "Déficit de hierro (ferropenia)", "media", `Ferritina ${ferr} ng/mL (<30)`);

    // ---- Plaquetas / leucocitos ----
    // Valor 0 = examen no tomado (fisiológicamente imposible). Se ignora.
    const plt = num(labs.plaquetas);
    if (plt != null && plt > 0) {
      // toleramos miles/µL: 1.5-450 ó 1.500-450.000
      const v = plt > 2000 ? plt / 1000 : plt;
      if (v < 50) add("D69.6", "Trombocitopenia severa", "alta", `Plaquetas ${plt}`);
      else if (v < 150) add("D69.6", "Trombocitopenia", "media", `Plaquetas ${plt}`);
      else if (v > 450) add("D75.2", "Trombocitosis", "baja", `Plaquetas ${plt}`);
    }
    const leu = num(labs.leucocitos);
    if (leu != null && leu > 0) {
      const v = leu > 200 ? leu / 1000 : leu;
      if (v > 12) add("D72.8", "Leucocitosis", "media", `Leucocitos ${leu}`);
      else if (v < 4) add("D72.8", "Leucopenia", "media", `Leucocitos ${leu}`);
    }

    // ---- Inflamación / proteínas ----
    const pcr = num(labs.pcr);
    if (pcr != null) {
      if (pcr >= 100) add("R65.9", "Respuesta inflamatoria sistémica (PCR muy elevada)", "alta", `PCR ${pcr} mg/L (≥100)`);
      else if (pcr >= 10) add("R79.8", "PCR elevada (proceso inflamatorio/infeccioso)", "media", `PCR ${pcr} mg/L (≥10)`);
    }
    const vhs = num(labs.vhs);
    if (vhs != null && vhs > 50) add("R70.0", "VHS muy elevada", "media", `VHS ${vhs} mm/h (>50)`);
    const alb = num(labs.albumina);
    if (alb != null) {
      if (alb < 2.5) add("E88.0", "Hipoalbuminemia severa", "alta", `Albúmina ${alb} g/dL (<2.5)`);
      else if (alb < 3.5) add("E88.0", "Hipoalbuminemia", "media", `Albúmina ${alb} g/dL (<3.5)`);
    }

    // ---- Cardiacos ----
    const trop = num(labs.troponina);
    if (trop != null && trop > 0.04) add("I21.9", "Troponina elevada (descartar SCA)", "alta", `Troponina ${trop} ng/mL`);
    const probnp = num(labs.nt_probnp);
    if (probnp != null) {
      if (probnp >= 900) add("I50.9", "NT-proBNP elevado (sospecha IC)", "alta", `NT-proBNP ${probnp} pg/mL`);
      else if (probnp >= 125) add("I50.9", "NT-proBNP sobre rango (descartar IC)", "media", `NT-proBNP ${probnp} pg/mL`);
    }
    const ck = num(labs.ck);
    if (ck != null && ck > 1000) add("M62.82", "Rabdomiólisis (sospecha)", "alta", `CK ${ck} U/L (>1000)`);

    // ---- Pancreático / hepático adicional ----
    const ldh = num(labs.ldh);
    if (ldh != null && ldh > 500) add("R74.0", "LDH elevada", "baja", `LDH ${ldh} U/L`);
    const lipasa = num(labs.lipasa);
    if (lipasa != null && lipasa > 180) add("K85.9", "Lipasa elevada (sospecha pancreatitis)", "alta", `Lipasa ${lipasa} U/L`);
    const amilasa = num(labs.amilasa);
    if (amilasa != null && amilasa > 300) add("K85.9", "Amilasa elevada", "media", `Amilasa ${amilasa} U/L`);
    const bilD = num(labs.bilirrubina_total);
    if (bilD != null && bilD > 2) add("R17", "Hiperbilirrubinemia (ictericia)", "media", `Bili total ${bilD} mg/dL`);

    // ---- Coagulación ----
    const inr = num(labs.inr);
    if (inr != null) {
      if (inr > 5) add("D68.4", "INR críticamente elevado (riesgo hemorragia)", "alta", `INR ${inr} (>5)`);
      else if (inr > 3.5) add("D68.4", "INR sobre rango terapéutico", "media", `INR ${inr}`);
    }

    // ---- Tiroideos extra ----
    const antiTpo = num(labs.anti_tpo);
    if (antiTpo != null && antiTpo > 35) add("E06.3", "Tiroiditis autoinmune (anti-TPO+)", "media", `Anti-TPO ${antiTpo} UI/mL`);

    // ---- Hierro / metabolismo Fe ----
    const sat = num(labs.saturacion_transferrina);
    if (sat != null && sat < 20) add("E61.1", "Déficit de hierro (sat. transferrina baja)", "media", `Sat. transferrina ${sat}%`);
    const fe = num(labs.fierro);
    if (fe != null && fe < 50) add("E61.1", "Déficit de hierro (sideremia baja)", "baja", `Fe ${fe} µg/dL`);

    // ---- Calcio / fósforo / magnesio ----
    const ca = num(labs.calcio);
    if (ca != null) {
      if (ca > 12) add("E83.52", "Hipercalcemia", "alta", `Ca ${ca} mg/dL (>12)`);
      else if (ca > 10.5) add("E83.52", "Hipercalcemia leve", "media", `Ca ${ca} mg/dL`);
      else if (ca < 8) add("E83.51", "Hipocalcemia", "media", `Ca ${ca} mg/dL (<8)`);
    }
    const mg = num(labs.magnesio);
    if (mg != null) {
      if (mg < 1.5) add("E83.42", "Hipomagnesemia", "media", `Mg ${mg} mg/dL`);
      else if (mg > 2.5) add("E83.41", "Hipermagnesemia", "media", `Mg ${mg} mg/dL`);
    }
    const fosf = num(labs.fosforo);
    if (fosf != null) {
      if (fosf > 5) add("E83.39", "Hiperfosfatemia", "media", `P ${fosf} mg/dL`);
      else if (fosf < 2.5) add("E83.39", "Hipofosfatemia", "media", `P ${fosf} mg/dL`);
    }

    // ---- Diferencial leucocitario (sólo evaluamos si parece valor absoluto k/µL) ----
    const neut = num(labs.neutrofilos);
    if (neut != null && neut < 50) {
      if (neut < 0.5) add("D70", "Neutropenia severa", "alta", `Neutrófilos ${neut} k/µL`);
      else if (neut < 1.5) add("D70", "Neutropenia", "media", `Neutrófilos ${neut} k/µL`);
    }
    const eos = num(labs.eosinofilos);
    if (eos != null && eos > 0.5 && eos < 50) add("D72.1", "Eosinofilia", "baja", `Eosinófilos ${eos} k/µL`);

    // ---- Orina química (cualitativos) ----
    const ket = labs.cuerpos_cetonicos;
    if (ket && /\+|positiv|abundant/i.test(String(ket.value || ket))) {
      add("R82.4", "Cetonuria", "media", `Cuerpos cetónicos: ${ket.value || ket}`);
    }
    const protOr = labs.proteina_orina;
    if (protOr && /\+|positiv/i.test(String(protOr.value || protOr))) {
      add("R80.9", "Proteinuria", "media", `Proteínas en orina: ${protOr.value || protOr}`);
    }

    // ---- PSA ----
    const psa = num(labs.psa);
    if (psa != null && psa >= 4) add("R97.2", "PSA elevado (derivar urología)", "media", `PSA ${psa} ng/mL (≥4)`);

    return out;
  }

  window.__AR_DX = { fromLabs };
})();
