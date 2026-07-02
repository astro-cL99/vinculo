/* Vínculo — Aprendizaje de flujos
 * Consolida varias grabaciones (samples) del MISMO flujo en un template
 * que distingue:
 *   - pasos required vs optional (frecuencia ≥ 70 %)
 *   - valores static / variable / patient-specific
 *   - selectores con cascada de fallbacks
 *
 * No depende de ninguna librería externa. Expone `window.__AR_LEARN`.
 */
(function () {
  if (window.__AR_LEARN) return;

  // -----------------------------------------------------------------
  // Similitud de pasos (Jaccard sobre tokens de selector + label + tipo)
  // -----------------------------------------------------------------
  function tokenize(step) {
    const out = new Set();
    if (!step) return out;
    out.add("T:" + step.type);
    if (step.target) {
      String(step.target).toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean)
        .forEach((t) => out.add("S:" + t));
    }
    if (step.label) {
      String(step.label).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)
        .forEach((t) => out.add("L:" + t));
    }
    if (step.inputType) out.add("I:" + step.inputType);
    return out;
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a.type !== b.type) return 0;
    const sa = tokenize(a);
    const sb = tokenize(b);
    let inter = 0;
    sa.forEach((t) => { if (sb.has(t)) inter++; });
    const uni = sa.size + sb.size - inter;
    return uni ? inter / uni : 0;
  }

  // -----------------------------------------------------------------
  // Alineación tipo Needleman-Wunsch SIMPLIFICADA, sólo para acumular
  // pasos en "buckets". Coste O(N*M).
  // -----------------------------------------------------------------
  function alignTwo(seqA, seqB) {
    const n = seqA.length, m = seqB.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const dir = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const GAP = -0.4;
    for (let i = 1; i <= n; i++) { dp[i][0] = i * GAP; dir[i][0] = 1; }
    for (let j = 1; j <= m; j++) { dp[0][j] = j * GAP; dir[0][j] = 2; }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const sim = similarity(seqA[i - 1], seqB[j - 1]);
        const match = dp[i - 1][j - 1] + (sim > 0.4 ? sim : -0.3);
        const up = dp[i - 1][j] + GAP;
        const left = dp[i][j - 1] + GAP;
        let best = match, d = 0;
        if (up > best) { best = up; d = 1; }
        if (left > best) { best = left; d = 2; }
        dp[i][j] = best; dir[i][j] = d;
      }
    }
    const pairs = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      const d = dir[i][j];
      if (i > 0 && j > 0 && d === 0) { pairs.unshift([i - 1, j - 1]); i--; j--; }
      else if (i > 0 && d === 1) { pairs.unshift([i - 1, null]); i--; }
      else { pairs.unshift([null, j - 1]); j--; }
    }
    return pairs;
  }

  // -----------------------------------------------------------------
  // Construye buckets de pasos a partir de N samples.
  // Cada bucket = pasos "equivalentes" entre samples.
  // -----------------------------------------------------------------
  function buildBuckets(samples) {
    if (!samples.length) return [];
    // Empezamos con el sample más largo como esqueleto.
    const order = [...samples].sort((a, b) => (b.steps?.length || 0) - (a.steps?.length || 0));
    const skeleton = order[0].steps.map((s, i) => ({ steps: [s], sourceIdx: [order[0]._idx], origPos: [i] }));
    for (let s = 1; s < order.length; s++) {
      const sample = order[s];
      const pairs = alignTwo(skeleton.map((b) => b.steps[0]), sample.steps);
      // Reconstruir nuevo esqueleto preservando orden mezclado.
      const next = [];
      pairs.forEach(([si, sj]) => {
        if (si != null && sj != null) {
          const bucket = skeleton[si];
          bucket.steps.push(sample.steps[sj]);
          bucket.sourceIdx.push(sample._idx);
          bucket.origPos.push(sj);
          next.push(bucket);
        } else if (si != null) {
          next.push(skeleton[si]);
        } else if (sj != null) {
          next.push({ steps: [sample.steps[sj]], sourceIdx: [sample._idx], origPos: [sj] });
        }
      });
      // Reemplazar skeleton (manteniendo referencias)
      skeleton.length = 0;
      next.forEach((b) => skeleton.push(b));
    }
    return skeleton;
  }

  // -----------------------------------------------------------------
  // Detecta si un valor parece dato del paciente (cruzando con labs).
  // -----------------------------------------------------------------
  function valueLooksLikeLab(value, labs) {
    if (!labs || !value) return null;
    const v = String(value).replace(",", ".").trim();
    if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
    const num = parseFloat(v);
    for (const [key, a] of Object.entries(labs)) {
      const lv = parseFloat(String(a?.value || "").replace(",", "."));
      if (!isNaN(lv) && Math.abs(lv - num) < 0.01) return key;
    }
    return null;
  }

  // -----------------------------------------------------------------
  // Construye selectores robustos a partir de un paso.
  // Cascada: id/name → cssPath original → label semántico → texto+rol.
  // -----------------------------------------------------------------
  function buildSemanticTarget(step) {
    return {
      label: step.label || "",
      role: step.inputType || step.type,
      text: step.text || "",
    };
  }

  // -----------------------------------------------------------------
  // Consolida un FlowTemplate desde los samples existentes.
  // -----------------------------------------------------------------
  function consolidate(samples, ctx) {
    const tagged = samples.map((s, idx) => ({ ...s, _idx: idx }));
    const buckets = buildBuckets(tagged);
    const N = samples.length;
    const labs = (ctx && ctx.labs) || {};
    const REQUIRED_THRESHOLD = N >= 3 ? 0.7 : 0.5;
    const steps = buckets.map((b) => {
      const freq = new Set(b.sourceIdx).size / N;
      const required = freq >= REQUIRED_THRESHOLD;
      const repr = b.steps[0];
      // Variabilidad de valores (sólo fill)
      let variability = "static";
      let valueExamples = [];
      if (repr.type === "fill") {
        const values = b.steps.map((s) => (s.value == null ? "" : String(s.value)));
        const unique = Array.from(new Set(values));
        valueExamples = unique.slice(0, 5);
        if (unique.length > 1) variability = "variable";
        // patient-specific override si CUALQUIER valor coincide con un lab
        const matchKey = values
          .map((v) => valueLooksLikeLab(v, labs))
          .find((k) => !!k);
        if (matchKey) {
          variability = "patient-specific";
          repr._labKey = matchKey;
        }
      }
      // Selectores en cascada — único + alternativos vistos en samples
      const selectors = Array.from(new Set(b.steps.map((s) => s.target).filter(Boolean)));
      return {
        type: repr.type,
        target: repr.target,
        selectors,
        semanticTarget: buildSemanticTarget(repr),
        label: repr.label || "",
        inputType: repr.inputType,
        value: repr.value,
        valueExamples,
        required,
        frequency: Math.round(freq * 100) / 100,
        variability,
        labKey: repr._labKey || null,
        key: repr.key || null,
        delay: Math.round(b.steps.reduce((a, s) => a + (s.delay || 200), 0) / b.steps.length),
      };
    });

    const requiredSteps = steps.filter((s) => s.required);
    const confidence = steps.length
      ? Math.round((requiredSteps.length / steps.length) * 100) / 100
      : 0;
    return {
      steps,
      sampleCount: N,
      confidence,
      builtAt: Date.now(),
    };
  }

  // -----------------------------------------------------------------
  // Migración: convierte un flujo v0.8 (con `steps`) a FlowTemplate v0.9.
  // -----------------------------------------------------------------
  function migrate(flow) {
    if (!flow) return flow;
    if (flow.template && Array.isArray(flow.samples)) return flow; // ya migrado
    const sample = {
      steps: flow.steps || [],
      capturedAt: flow.createdAt || Date.now(),
    };
    return {
      ...flow,
      samples: [sample],
      template: consolidate([sample], {}),
      feedback: flow.feedback || { plays: [] },
    };
  }

  // -----------------------------------------------------------------
  // Telemetría local de reproducciones.
  // -----------------------------------------------------------------
  function appendPlayResult(flow, result) {
    flow.feedback = flow.feedback || { plays: [] };
    flow.feedback.plays.push({ ...result, ts: Date.now() });
    if (flow.feedback.plays.length > 50) {
      flow.feedback.plays = flow.feedback.plays.slice(-50);
    }
    return flow;
  }
  function healthScore(flow) {
    const plays = (flow.feedback?.plays || []).slice(-10);
    if (!plays.length) return null;
    const ok = plays.reduce((a, p) => a + (p.ok || 0), 0);
    const total = plays.reduce((a, p) => a + (p.totalSteps || 0), 0);
    if (!total) return null;
    return Math.round((ok / total) * 100);
  }

  window.__AR_LEARN = {
    consolidate,
    migrate,
    similarity,
    alignTwo,
    appendPlayResult,
    healthScore,
    valueLooksLikeLab,
  };
})();
