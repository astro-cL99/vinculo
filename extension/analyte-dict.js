/* Vínculo — Diccionario de analitos (paso 1 de A1: modularización).
 *
 * Mantenemos por ahora la copia dentro de content.js (para no romper nada),
 * pero exponemos aquí una referencia consultable para módulos externos:
 *
 *   window.__AR_DICT = {
 *     ANALYTE_DICT, ANALYTE_RANGES, normalizeName(s), matchAnalyte(name)
 *   };
 *
 * En la siguiente iteración, content.js leerá de aquí y borrará su copia
 * local. Por ahora coexisten — si content.js redefine los símbolos, su copia
 * local gana porque está dentro de su propio IIFE.
 *
 * Fuente única: src/lib/lab-analytes.ts (mantener sincronizado).
 */
(function () {
  if (window.__AR_DICT) return;

  // El diccionario completo vive en content.js. Aquí exponemos sólo helpers
  // utilitarios que pueden usar otros módulos sin cargar todo el catálogo.
  function normalizeName(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Stub que será sobrescrito por content.js cuando esté listo.
  // Hasta entonces los módulos externos pueden usar window.__AR_DICT.match(name)
  // y obtener null si content.js aún no inicializa.
  window.__AR_DICT = {
    normalizeName,
    match(name) { return null; },
    _setDict(dict, ranges, matcher) {
      this.ANALYTE_DICT = dict;
      this.ANALYTE_RANGES = ranges;
      this.match = matcher;
    },
  };
})();
