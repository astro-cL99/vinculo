/**
 * Diccionario compartido de analitos de laboratorio.
 * Mapea variantes de nombres tal como aparecen en Rayen → claves canónicas.
 * Usado tanto por la extensión (content.js mediante una copia espejo) como
 * por el editor del panel web para sugerir placeholders.
 */

export type AnalyteKey =
  | "glicemia"
  | "creatinina"
  | "vfg"
  | "urea"
  | "bun"
  | "acido_urico"
  | "hemoglobina"
  | "hematocrito"
  | "leucocitos"
  | "plaquetas"
  | "vcm"
  | "hba1c"
  | "colesterol_total"
  | "ldl"
  | "hdl"
  | "vldl"
  | "trigliceridos"
  | "rel_col_ldl_hdl"
  | "tsh"
  | "t4_libre"
  | "t3"
  | "t3_libre"
  | "anti_tpo"
  | "got"
  | "gpt"
  | "ggt"
  | "fosfatasas_alcalinas"
  | "bilirrubina_total"
  | "bilirrubina_directa"
  | "bilirrubina_indirecta"
  | "ldh"
  | "amilasa"
  | "lipasa"
  | "sodio"
  | "potasio"
  | "cloro"
  | "calcio"
  | "magnesio"
  | "fosforo"
  | "microalbuminuria"
  | "rac"
  | "vitamina_d"
  | "vitamina_b12"
  | "ferritina"
  | "fierro"
  | "saturacion_transferrina"
  | "transferrina"
  | "tibc"
  | "tiempo_protrombina"
  | "inr"
  | "ttpa"
  | "neutrofilos"
  | "linfocitos"
  | "monocitos"
  | "eosinofilos"
  | "basofilos"
  | "rdw"
  | "mch"
  | "mchc"
  | "eritrocitos"
  | "pcr"
  | "vhs"
  | "proteinas_totales"
  | "albumina"
  | "globulinas"
  | "troponina"
  | "ck"
  | "ckmb"
  | "nt_probnp"
  | "bhcg"
  | "psa";

export const ANALYTE_DICT: Record<AnalyteKey, { label: string; aliases: string[] }> = {
  glicemia: { label: "Glicemia", aliases: ["glicemia", "glucosa", "glucemia", "glicemia ayuno"] },
  creatinina: { label: "Creatinina", aliases: ["creatinina", "creatinina serica", "creatinina sérica", "creat"] },
  vfg: { label: "VFG (eGFR)", aliases: ["vfg", "egfr", "filtrado glomerular", "tasa de filtracion glomerular"] },
  urea: { label: "Urea", aliases: ["urea", "uremia"] },
  bun: { label: "BUN", aliases: ["bun", "nitrogeno ureico"] },
  acido_urico: { label: "Ácido úrico", aliases: ["acido urico", "ácido úrico"] },
  hemoglobina: { label: "Hemoglobina", aliases: ["hemoglobina", "hb", "hgb"] },
  hematocrito: { label: "Hematocrito", aliases: ["hematocrito", "hto", "hct"] },
  leucocitos: { label: "Leucocitos", aliases: ["leucocitos", "blancos", "wbc"] },
  plaquetas: { label: "Plaquetas", aliases: ["plaquetas", "plt"] },
  vcm: { label: "VCM", aliases: ["vcm", "volumen corpuscular medio"] },
  hba1c: {
    label: "HbA1c",
    aliases: ["hba1c", "hemoglobina glicosilada", "hemoglobina glicada", "a1c"],
  },
  colesterol_total: { label: "Colesterol total", aliases: ["colesterol total"] },
  ldl: { label: "LDL", aliases: ["ldl", "ldl colesterol", "colesterol ldl"] },
  hdl: { label: "HDL", aliases: ["hdl", "hdl colesterol", "colesterol hdl"] },
  vldl: { label: "VLDL", aliases: ["vldl", "vldl colesterol", "colesterol vldl"] },
  trigliceridos: { label: "Triglicéridos", aliases: ["trigliceridos", "triglicéridos", "tg"] },
  rel_col_ldl_hdl: {
    label: "Relación LDL/HDL",
    aliases: ["relacion ldl hdl", "rel ldl hdl", "ratio ldl hdl", "indice ldl hdl"],
  },
  tsh: { label: "TSH", aliases: ["tsh", "hormona tiroestimulante"] },
  t4_libre: { label: "T4 libre", aliases: ["t4 libre", "t4l", "tiroxina libre"] },
  t3: { label: "T3 total", aliases: ["t3", "t3 total", "triiodotironina"] },
  t3_libre: { label: "T3 libre", aliases: ["t3 libre", "triiodotironina libre"] },
  anti_tpo: { label: "Anti-TPO", aliases: ["anti tpo", "anti-tpo", "antitiroperoxidasa"] },
  got: { label: "GOT/AST", aliases: ["got", "ast", "aspartato aminotransferasa"] },
  gpt: { label: "GPT/ALT", aliases: ["gpt", "alt", "alanino aminotransferasa"] },
  ggt: { label: "GGT", aliases: ["ggt", "gamma glutamil"] },
  fosfatasas_alcalinas: { label: "Fosfatasas alcalinas", aliases: ["fosfatasas alcalinas", "fal"] },
  bilirrubina_total: { label: "Bilirrubina total", aliases: ["bilirrubina total", "bili total"] },
  bilirrubina_directa: { label: "Bilirrubina directa", aliases: ["bilirrubina directa", "bili directa"] },
  bilirrubina_indirecta: { label: "Bilirrubina indirecta", aliases: ["bilirrubina indirecta", "bili indirecta"] },
  ldh: { label: "LDH", aliases: ["ldh", "lactato deshidrogenasa"] },
  amilasa: { label: "Amilasa", aliases: ["amilasa"] },
  lipasa: { label: "Lipasa", aliases: ["lipasa"] },
  sodio: { label: "Sodio", aliases: ["sodio", "na", "natremia"] },
  potasio: { label: "Potasio", aliases: ["potasio", "k", "kalemia"] },
  cloro: { label: "Cloro", aliases: ["cloro", "cl"] },
  calcio: { label: "Calcio", aliases: ["calcio", "ca", "calcemia"] },
  magnesio: { label: "Magnesio", aliases: ["magnesio", "mg"] },
  fosforo: { label: "Fósforo", aliases: ["fosforo", "fósforo", "p"] },
  microalbuminuria: { label: "Microalbuminuria", aliases: ["microalbuminuria", "albumina urinaria"] },
  rac: {
    label: "RAC (rel. albúmina/creatinina)",
    aliases: ["rac", "relacion albumina creatinina", "ratio albumina creatinina"],
  },
  vitamina_d: { label: "Vitamina D", aliases: ["vitamina d", "25 oh vitamina d"] },
  vitamina_b12: { label: "Vitamina B12", aliases: ["vitamina b12", "b12", "cobalamina"] },
  ferritina: { label: "Ferritina", aliases: ["ferritina"] },
  fierro: { label: "Hierro sérico", aliases: ["hierro", "fierro", "fe"] },
  saturacion_transferrina: {
    label: "Saturación transferrina",
    aliases: ["saturacion transferrina", "% saturacion transferrina", "indice saturacion transferrina"],
  },
  transferrina: { label: "Transferrina", aliases: ["transferrina"] },
  tibc: { label: "TIBC", aliases: ["tibc", "capacidad total de fijacion de hierro"] },
  tiempo_protrombina: { label: "Tiempo de protrombina", aliases: ["tiempo de protrombina", "tp"] },
  inr: { label: "INR", aliases: ["inr"] },
  ttpa: { label: "TTPA", aliases: ["ttpa", "kptt", "aptt"] },
  neutrofilos: { label: "Neutrófilos", aliases: ["neutrofilos", "neutrófilos", "segmentados"] },
  linfocitos: { label: "Linfocitos", aliases: ["linfocitos", "linf"] },
  monocitos: { label: "Monocitos", aliases: ["monocitos", "mono"] },
  eosinofilos: { label: "Eosinófilos", aliases: ["eosinofilos", "eosinófilos", "eos"] },
  basofilos: { label: "Basófilos", aliases: ["basofilos", "basófilos", "baso"] },
  rdw: { label: "RDW", aliases: ["rdw", "ancho de distribucion eritrocitaria"] },
  mch: { label: "HCM/MCH", aliases: ["mch", "hcm", "hemoglobina corpuscular media"] },
  mchc: { label: "CHCM/MCHC", aliases: ["mchc", "chcm"] },
  eritrocitos: { label: "Eritrocitos", aliases: ["eritrocitos", "globulos rojos", "rbc", "hematies"] },
  pcr: { label: "PCR", aliases: ["pcr", "proteina c reactiva", "pcr cuantitativa"] },
  vhs: { label: "VHS", aliases: ["vhs", "velocidad de eritrosedimentacion", "velocidad de sedimentacion"] },
  proteinas_totales: { label: "Proteínas totales", aliases: ["proteinas totales", "ptot"] },
  albumina: { label: "Albúmina", aliases: ["albumina", "albúmina", "albumina serica"] },
  globulinas: { label: "Globulinas", aliases: ["globulinas"] },
  troponina: { label: "Troponina", aliases: ["troponina", "troponina i", "troponina t"] },
  ck: { label: "CK/CPK", aliases: ["ck", "cpk", "creatin kinasa"] },
  ckmb: { label: "CK-MB", aliases: ["ckmb", "ck mb", "ck-mb"] },
  nt_probnp: { label: "NT-proBNP", aliases: ["nt probnp", "nt-probnp", "bnp"] },
  bhcg: { label: "β-hCG", aliases: ["bhcg", "beta hcg", "subunidad beta hcg"] },
  psa: { label: "PSA", aliases: ["psa", "antigeno prostatico especifico"] },
};

export const ANALYTE_KEYS = Object.keys(ANALYTE_DICT) as AnalyteKey[];

/** Lista plana para sugerir placeholders en el editor. */
export const PLACEHOLDER_SUGGESTIONS = ANALYTE_KEYS.flatMap((k) => [
  { token: `{{lab.${k}}}`, label: `${ANALYTE_DICT[k].label} (valor + unidad)` },
  { token: `{{lab.${k}.value}}`, label: `${ANALYTE_DICT[k].label} — solo valor` },
  { token: `{{lab.${k}.unit}}`, label: `${ANALYTE_DICT[k].label} — solo unidad` },
  { token: `{{lab.${k}.fecha}}`, label: `${ANALYTE_DICT[k].label} — fecha` },
]);
