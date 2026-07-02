/* Vínculo — Catálogo AUGE/GES MINSAL
 * Carga data/auge-ges.json y expone API de búsqueda + sugerencias contextuales.
 *
 * API: window.__AR_AUGE
 *   .ready                     → Promise (resuelve cuando carga el JSON)
 *   .all()                     → array completo de problemas GES
 *   .byId(id)                  → problema por número GES (e.g. "21", "1A.2")
 *   .search(query, limit=20)   → match por nombre, keywords o especialidad
 *   .suggestFromText(texto)    → sugiere guías GES desde texto libre (ficha, dx)
 *   .meta()                    → versión y total
 *   .renderCard(problema)      → HTML de tarjeta para listas
 */
(function () {
  if (window.__AR_AUGE) return;

  let DATA = null;
  let LOAD_ERR = null;

  // Mapeo dx-clave → id(s) GES principales (curado a partir del catálogo MINSAL)
  // Permite que si el clínico pone E11 (DM2), sugiramos guía #7, etc.
  const DX_TO_GES = {
    // Diabetes
    "diabetes mellitus tipo 2": ["7", "7.1"],
    "diabetes tipo 2": ["7"],
    "dm2": ["7"],
    "e11": ["7"],
    "diabetes mellitus tipo 1": ["6"],
    "dm1": ["6"],
    "e10": ["6"],
    "diabetes y embarazo": ["7.1"],
    "diabetes gestacional": ["7.1"],
    // HTA y CV
    "hipertension arterial": ["21"],
    "hta": ["21"],
    "i10": ["21"],
    "infarto agudo del miocardio": ["5"],
    "iam": ["5"],
    "scacest": ["5"],
    "i21": ["5"],
    "ataque cerebrovascular": ["37"],
    "acv isquemico": ["37"],
    "i63": ["37"],
    "hemorragia subaracnoidea": ["42"],
    // Renal
    "insuficiencia renal cronica": ["1A", "1A.1", "1A.2", "1A.3", "64.2"],
    "erc": ["64.1", "64.2"],
    "n18": ["64.2"],
    "hemodialisis": ["1A.2"],
    // Respiratorias
    "epoc": ["38"],
    "j44": ["38"],
    "asma adulto": ["61"],
    "asma bronquial": ["61"],
    "j45": ["61"],
    "asma menor 15": ["39"],
    "neumonia adulto mayor": ["20"],
    "nac": ["20"],
    "j18": ["20"],
    "ira ambulatoria": ["19"],
    // Mental
    "depresion": ["34", "34.1", "34.2"],
    "f32": ["34"],
    "f33": ["34"],
    "esquizofrenia": ["15"],
    "f20": ["15"],
    "trastorno bipolar": ["75"],
    "f31": ["75"],
    "consumo alcohol drogas menor 20": ["53"],
    "alzheimer": ["85.1"],
    "demencia": ["85.1"],
    "f00": ["85.1"],
    "g30": ["85.1"],
    // Endocrino
    "hipotiroidismo": ["76"],
    "e03": ["76"],
    // Cánceres
    "cancer cervicouterino": ["3"],
    "cacu": ["3"],
    "cancer mama": ["8"],
    "c50": ["8"],
    "cancer gastrico": ["27"],
    "c16": ["27"],
    "cancer prostata": ["28"],
    "c61": ["28"],
    "cancer colorrectal": ["70"],
    "c18": ["70"],
    "c19": ["70"],
    "c20": ["70"],
    "cancer pulmon": ["81"],
    "c34": ["81"],
    "cancer tiroides": ["82"],
    "cancer renal": ["83"],
    "cancer vesical": ["72"],
    "cancer ovario": ["71"],
    "cancer testiculo": ["16"],
    "linfoma hodgkin": ["17.1"],
    "linfoma no hodgkin": ["17.2"],
    "leucemia adulto": ["45.1", "45.2"],
    "mieloma multiple": ["84"],
    "alivio dolor cancer": ["4"],
    "cuidados paliativos": ["4"],
    // Infecciosas
    "vih": ["18"],
    "sida": ["18"],
    "b20": ["18"],
    "hepatitis b": ["68"],
    "hepatitis c": ["69"],
    // Oftalmo
    "retinopatia diabetica": ["31"],
    "vicios refraccion": ["29"],
    "estrabismo": ["30"],
    "trauma ocular": ["50"],
    "desprendimiento retina": ["32"],
    "cataratas": ["11"],
    // Trauma / quirúrgico
    "politraumatizado": ["48"],
    "tec": ["49"],
    "traumatismo craneoencefalico": ["49"],
    "gran quemado": ["55"],
    "artrosis cadera": ["12", "41"],
    "artrosis rodilla": ["41"],
    "escoliosis": ["10"],
    "hernia nucleo pulposo": ["44"],
    "hiperplasia prostatica": ["35"],
    "n40": ["35"],
    // Pediatría / parto
    "displasia luxante cadera": ["65"],
    "fisura labiopalatina": ["13"],
    "cardiopatia congenita": ["2"],
    "parto prematuro": ["24"],
    "retinopatia prematuro": ["57"],
    "displasia broncopulmonar": ["58"],
    "epilepsia infantil": ["22"],
    "epilepsia adulto": ["60"],
    "g40": ["60"],
    "analgesia parto": ["54"],
    "sdr recien nacido": ["40"],
    "hipoacusia menor 4": ["77"],
    "hipoacusia adulto mayor": ["56"],
    "disrafia espinal": ["9"],
    // Reumatológicas
    "artritis reumatoide": ["52"],
    "m06": ["52"],
    "lupus": ["78"],
    "artritis idiopatica juvenil": ["63"],
    // Otras
    "hemofilia": ["33"],
    "fibrosis quistica": ["51", "51.1"],
    "esclerosis multiple": ["67", "67.1"],
    "parkinson": ["62", "62.1"],
    "g20": ["62"],
    "salud oral 6 anos": ["23"],
    "salud oral 60 anos": ["47"],
    "urgencia odontologica": ["46"],
    "salud oral embarazada": ["66"],
    "ayudas tecnicas adulto mayor": ["36"],
    "covid rehabilitacion": ["87"],
    "marcapaso": ["25"],
    "valvulopatia": ["74", "79"],
    "colecistectomia preventiva": ["26"],
    "helicobacter pylori": ["80"],
  };

  const ready = (async () => {
    try {
      const url = (typeof chrome !== "undefined" && chrome.runtime?.getURL)
        ? chrome.runtime.getURL("data/auge-ges.json")
        : "data/auge-ges.json";
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      DATA = await res.json();
    } catch (e) {
      LOAD_ERR = e;
      try { window.__AR_LOG?.warn?.("E_STORAGE", "auge-ges.json no disponible: " + (e?.message || e)); } catch {}
    }
  })();

  const norm = (s) => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();

  function all() { return DATA?.problemas || []; }
  function meta() { return DATA ? { version: DATA.version, total: DATA.total, ultimaActualizacion: DATA.ultimaActualizacion } : null; }
  function byId(id) { return all().find((p) => p.id === id) || null; }

  function search(query, limit = 20) {
    const q = norm(query);
    if (!q || !DATA) return [];
    const out = [];
    for (const p of DATA.problemas) {
      const hay = norm(p.nombre + " " + p.especialidad + " " + (p.keywords || []).join(" "));
      if (hay.includes(q)) out.push(p);
      if (out.length >= limit) break;
    }
    return out;
  }

  function suggestFromText(text) {
    const t = norm(text);
    if (!t || !DATA) return [];
    const ids = new Set();
    for (const [key, gesIds] of Object.entries(DX_TO_GES)) {
      if (t.includes(norm(key))) gesIds.forEach((id) => ids.add(id));
    }
    return [...ids].map(byId).filter(Boolean);
  }

  function renderCard(p) {
    if (!p) return "";
    const url = (p.urls && p.urls[0]) || null;
    const link = url
      ? `<a href="${url}" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:underline">Ver guía MINSAL ↗</a>`
      : '<span style="color:#94a3b8">Sin URL pública</span>';
    const meta = [p.metodologia, p.publicacion, p.actualizacion ? "act. " + p.actualizacion : null].filter(Boolean).join(" · ");
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:6px;background:#fff">
      <div style="font-size:11px;color:#64748b">GES #${p.id} · ${p.especialidad}</div>
      <div style="font-weight:600;font-size:13px;color:#0f172a;margin:2px 0">${p.nombre}</div>
      <div style="font-size:11px;color:#475569">${meta}</div>
      <div style="margin-top:4px;font-size:12px">${link}</div>
    </div>`;
  }

  window.__AR_AUGE = {
    ready, all, byId, search, suggestFromText, meta, renderCard,
    isLoaded: () => DATA != null,
    loadError: () => LOAD_ERR,
  };
})();
