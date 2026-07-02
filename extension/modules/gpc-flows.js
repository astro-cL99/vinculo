/* Vínculo - GPC MINSAL flow engine
 * Sugerencias contextuales basadas en Guías Clínicas MINSAL:
 *   - HTA adulto (2018)
 *   - ERC (2017)
 *   - DM2 (2017)
 *   - Hipotiroidismo (2013)
 *   - HTA pediátrica (2024)
 *
 * Expone: window.__AR_GPC con:
 *   - DATA: dataset cargado
 *   - suggestFromContext({hba1c, vfg, rac, tsh, t4l, pas, pad, edad, embarazo, dm, ...})
 *   - getGuide(id)
 *   - openPanel()
 */
(function(){
  'use strict';
  if (window.__AR_GPC) return;

  const URL_DATA = (window.chrome?.runtime?.getURL?.('data/gpc-minsal.json')) || 'data/gpc-minsal.json';
  let DATA = null;
  let loadingPromise = null;

  async function loadData(){
    if (DATA) return DATA;
    if (loadingPromise) return loadingPromise;
    loadingPromise = fetch(URL_DATA).then(r => r.json()).then(j => { DATA = j; return j; })
      .catch(err => { console.warn('[AR_GPC] no se pudo cargar gpc-minsal.json', err); return null; });
    return loadingPromise;
  }

  function num(v){ const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; }

  /* === Motor de sugerencias contextuales === */
  function suggestFromContext(ctx = {}){
    if (!DATA) return [];
    const out = [];
    const hba1c = num(ctx.hba1c);
    const vfg   = num(ctx.vfg ?? ctx.vfge ?? ctx.tfg);
    const rac   = num(ctx.rac ?? ctx.albuminuria);
    const tsh   = num(ctx.tsh);
    const t4l   = num(ctx.t4l);
    const pas   = num(ctx.pas);
    const pad   = num(ctx.pad);
    const edad  = num(ctx.edad);
    const embarazo = !!ctx.embarazo;
    const dm    = !!ctx.dm;
    const erc   = !!ctx.erc;
    const fragil = !!ctx.fragil;
    const pediatrico = edad !== null && edad < 15;

    /* DM2 */
    if (hba1c !== null) {
      if (hba1c >= 6.5) out.push({ guia: 'DM2', icd: 'E11', titulo: 'HbA1c ≥ 6,5% sugiere DM2',
        msg: 'Confirmar con 2ª medición. Iniciar Metformina si VFG ≥30. Educación + plan alimentario.' });
      if (hba1c > 9 || (ctx.glicemia && num(ctx.glicemia) > 300))
        out.push({ guia: 'DM2', titulo: 'Debut inestable / mal control severo',
          msg: 'HbA1c >9% o glicemia >300 mg/dL: considerar Insulina NPH 0,1–0,2 U/kg/día nocturna + Metformina.' });
      const meta = fragil ? '<8%' : (edad >= 75 ? '7–7,5%' : '<7%');
      out.push({ guia: 'DM2', titulo: `Meta HbA1c sugerida: ${meta}`, msg: 'Ajustar según fragilidad, edad y comorbilidades (GPC MINSAL DM2 2017).' });
    }

    /* ERC */
    if (vfg !== null) {
      let etapa = '';
      if (vfg >= 90) etapa = 'G1';
      else if (vfg >= 60) etapa = 'G2';
      else if (vfg >= 45) etapa = 'G3a';
      else if (vfg >= 30) etapa = 'G3b';
      else if (vfg >= 15) etapa = 'G4';
      else etapa = 'G5';
      if (vfg < 60) out.push({ guia: 'ERC', icd: 'N18', titulo: `VFG ${vfg} → etapa ${etapa}`,
        msg: 'Confirmar con nuevo examen en 2 semanas (descartar IRA). Indicar IECA/ARA II si HTA o RAC ≥30.' });
      if (vfg < 30) out.push({ guia: 'ERC', titulo: 'Derivar a Nefrología',
        msg: 'VFG <30 (G4-G5): derivación obligatoria. Suspender Metformina. Ajustar dosis fármacos.' });
      if (dm && vfg >= 30 && vfg < 45)
        out.push({ guia: 'DM2', titulo: 'Metformina: ajustar dosis',
          msg: 'VFG 30–44 (G3b): reducir Metformina a la mitad de la dosis máxima.' });
    }
    if (rac !== null) {
      if (rac >= 30 && rac <= 300)
        out.push({ guia: 'ERC', titulo: `RAC ${rac} mg/g → A2 (microalbuminuria)`,
          msg: 'Iniciar IECA o ARA II (no combinar). Meta PA <130/80. Control K+ y creatinina en 1 semana.' });
      else if (rac > 300)
        out.push({ guia: 'ERC', titulo: `RAC ${rac} mg/g → A3 (proteinuria clínica)`,
          msg: 'Derivar a nefrología. Seguimiento con RPC o proteinuria 24h. IECA/ARA II obligatorio si PA elevada.' });
    }

    /* Hipotiroidismo */
    if (tsh !== null) {
      if (tsh >= 4.5 && tsh <= 10) {
        if (embarazo) out.push({ guia: 'Hipotiroidismo', titulo: 'TSH 4,5–10 en embarazo',
          msg: 'Iniciar Levotiroxina 50–75 mcg/día y derivar a endocrinología.' });
        else if (t4l !== null && t4l < 0.8)
          out.push({ guia: 'Hipotiroidismo', titulo: 'Hipotiroidismo clínico leve',
            msg: 'TSH 4,5–10 con T4L baja: iniciar Levotiroxina 25–50 mcg y derivar.' });
        else
          out.push({ guia: 'Hipotiroidismo', titulo: 'TSH 4,5–10 (subclínico)',
            msg: 'Control en 6 meses. Considerar Levotiroxina 25–50 mcg si AcTPO+, bocio, deseo embarazo o síntomas.' });
      } else if (tsh > 10 && tsh <= 20) {
        out.push({ guia: 'Hipotiroidismo', icd: 'E03', titulo: `TSH ${tsh} → iniciar Levotiroxina`,
          msg: 'Dosis 50–100 mcg/día (1,0–1,6 mcg/kg si >20). Control TSH a 6–8 semanas. Tomar en ayunas.' });
      } else if (tsh > 20) {
        out.push({ guia: 'Hipotiroidismo', icd: 'E03', titulo: `TSH ${tsh} → Levotiroxina por peso`,
          msg: 'Dosis 1,0–1,6 mcg/kg/día. En >75 años iniciar 25–50 mcg y derivar a endocrinología.' });
      }
    }

    /* HTA */
    if (pas !== null || pad !== null) {
      const ps = pas ?? 0, pd = pad ?? 0;
      if (pediatrico) {
        out.push({ guia: 'HTA pediátrica', titulo: 'Validar percentiles según edad/sexo/talla',
          msg: 'Usar tablas p95 (anexos GPC 2024). Etapa 1 ≥p95; Etapa 2 ≥p95+12 o ≥140/90.' });
        if (ps >= 140 || pd >= 90)
          out.push({ guia: 'HTA pediátrica', titulo: 'PA ≥140/90 → derivar',
            msg: 'Sugiere etapa 2: derivar a nefrología/cardiología pediátrica para estudio etiológico.' });
      } else {
        if (ps >= 180 || pd >= 110)
          out.push({ guia: 'HTA', titulo: 'Crisis hipertensiva (≥180/110)',
            msg: 'Evaluar daño órgano blanco. Si emergencia → derivar a urgencia.' });
        else if (ps >= 160 || pd >= 100)
          out.push({ guia: 'HTA', icd: 'I10', titulo: 'HTA etapa 2',
            msg: 'Iniciar terapia dual: IECA/ARA II + diurético tiazídico o BCC. Confirmar con perfil de PA o MAPA.' });
        else if (ps >= 140 || pd >= 90)
          out.push({ guia: 'HTA', icd: 'I10', titulo: 'HTA etapa 1',
            msg: 'Confirmar con perfil de PA (3 mediciones, 3 días) o MAPA. Iniciar IECA/ARA II si confirmado.' });
        const metaPA = (dm || erc || (rac !== null && rac >= 30)) ? '<130/80' : (edad >= 80 ? '<150/90' : '<140/90');
        out.push({ guia: 'HTA', titulo: `Meta PA sugerida: ${metaPA}`,
          msg: embarazo ? 'Embarazo: contraindicados IECA/ARA II. Usar metildopa, labetalol o nifedipino.' : 'GPC HTA MINSAL 2018.' });
      }
    }

    return out;
  }

  /* === Panel UI === */
  function ensureStyles(){
    if (document.getElementById('ar-gpc-styles')) return;
    const s = document.createElement('style');
    s.id = 'ar-gpc-styles';
    s.textContent = `
      .ar-gpc-fab{position:fixed;bottom:20px;left:160px;z-index:2147483646;background:#0a7;color:#fff;border:none;border-radius:24px;padding:10px 14px;font:600 13px system-ui;box-shadow:0 4px 12px rgba(0,0,0,.25);cursor:pointer}
      .ar-gpc-fab:hover{background:#085}
      .ar-gpc-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center}
      .ar-gpc-card{background:#fff;border-radius:12px;max-width:760px;width:92%;max-height:84vh;overflow:auto;padding:18px;font:14px system-ui;color:#222}
      .ar-gpc-card h2{margin:0 0 8px;font-size:18px;color:#0a7}
      .ar-gpc-card h3{margin:14px 0 6px;font-size:14px;color:#085;border-bottom:1px solid #eee;padding-bottom:4px}
      .ar-gpc-card ul{margin:6px 0 12px 18px;padding:0}
      .ar-gpc-card li{margin:3px 0}
      .ar-gpc-card .tag{display:inline-block;background:#e6f7f0;color:#085;border-radius:8px;padding:2px 8px;font-size:11px;margin-left:6px}
      .ar-gpc-close{float:right;background:#eee;border:none;border-radius:6px;padding:4px 10px;cursor:pointer}
      .ar-gpc-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      .ar-gpc-tab{background:#eef;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer}
      .ar-gpc-tab.active{background:#0a7;color:#fff}
      .ar-gpc-link{color:#0a7;font-size:11px;text-decoration:underline}
    `;
    document.documentElement.appendChild(s);
  }

  function renderGuide(id){
    const G = DATA?.[id]; if (!G) return '<p>Guía no disponible</p>';
    const sections = Object.entries(G).map(([k,v]) => {
      const title = k.replace(/_/g,' ').replace(/\b\w/g, m=>m.toUpperCase());
      let body = '';
      if (Array.isArray(v)) {
        body = '<ul>' + v.map(item => {
          if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
          if (item.etapa) return `<li><b>${item.etapa}</b> · VFG ${item.vfg} — ${escapeHtml(item.desc)}</li>`;
          if (item.cat) return `<li><b>${item.cat}</b> · RAC ${item.rac} — ${escapeHtml(item.desc)}</li>`;
          if (item.perfil) return `<li><b>${escapeHtml(item.perfil)}:</b> ${escapeHtml(item.meta)}</li>`;
          if (item.tsh) return `<li><b>TSH ${escapeHtml(item.tsh)}:</b> ${escapeHtml(item.accion)}</li>`;
          if (item.edad) return `<li><b>${escapeHtml(item.edad)}</b> · normal ${escapeHtml(item.normal||'')} · etapa1 ${escapeHtml(item.etapa1||'')} · etapa2 ${escapeHtml(item.etapa2||'')}</li>`;
          return `<li>${escapeHtml(JSON.stringify(item))}</li>`;
        }).join('') + '</ul>';
      } else if (typeof v === 'string') body = `<p>${escapeHtml(v)}</p>`;
      return `<h3>${title}</h3>${body}`;
    }).join('');
    return sections;
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function openPanel(initial){
    ensureStyles();
    const guideIds = [
      ['hta_adulto','HTA adulto'],
      ['hta_pediatrica','HTA pediátrica'],
      ['erc','ERC'],
      ['dm2','DM2'],
      ['hipotiroidismo','Hipotiroidismo'],
    ];
    let active = initial || 'hta_adulto';
    const wrap = document.createElement('div');
    wrap.className = 'ar-gpc-modal';
    const sources = (DATA?._meta?.guias || []).map(g => `<a class="ar-gpc-link" href="${g.url}" target="_blank" rel="noopener">${escapeHtml(g.titulo)}</a>`).join(' · ');
    wrap.innerHTML = `
      <div class="ar-gpc-card">
        <button class="ar-gpc-close">Cerrar</button>
        <h2>📚 Guías Clínicas MINSAL <span class="tag">GPC/GES</span></h2>
        <div class="ar-gpc-tabs">${guideIds.map(([k,t])=>`<button class="ar-gpc-tab${k===active?' active':''}" data-id="${k}">${t}</button>`).join('')}</div>
        <div class="ar-gpc-body">${renderGuide(active)}</div>
        <div style="margin-top:14px;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:8px">Fuentes: ${sources}</div>
      </div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    wrap.querySelector('.ar-gpc-close').onclick = () => wrap.remove();
    wrap.querySelectorAll('.ar-gpc-tab').forEach(b => b.onclick = () => {
      active = b.dataset.id;
      wrap.querySelectorAll('.ar-gpc-tab').forEach(x => x.classList.toggle('active', x.dataset.id===active));
      wrap.querySelector('.ar-gpc-body').innerHTML = renderGuide(active);
    });
    document.body.appendChild(wrap);
  }

  function mountFAB(){
    // FAB eliminado: ahora se accede desde 📚 Recursos clínicos → pestaña GPC.
    const old = document.getElementById('ar-gpc-fab');
    if (old) old.remove();
  }

  loadData().then(() => {
    if (document.body) mountFAB();
    else document.addEventListener('DOMContentLoaded', mountFAB, { once: true });
  });

  window.__AR_GPC = {
    get DATA(){ return DATA; },
    loadData,
    suggestFromContext,
    getGuide: (id) => DATA?.[id] || null,
    openPanel
  };
})();
