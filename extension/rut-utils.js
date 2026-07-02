/* Vínculo — Validación y normalización del RUT chileno (módulo 11).
 *
 * 100% local, sin red ni base de datos externa. Solo verifica matemáticamente
 * que el dígito verificador (DV) calculado a partir del cuerpo coincide con
 * el DV declarado.
 *
 * API:
 *   window.__AR_RUT = {
 *     clean(rut) -> "12345678K"   // sin puntos, sin guion, K en mayúscula
 *     format(rut) -> "12.345.678-K" // formato canónico
 *     dv(cuerpo) -> "K"            // dígito verificador esperado
 *     validate(rut) -> { ok, rut, formatted, motivo? }
 *     equal(a, b) -> boolean       // comparación normalizada
 *   }
 */
(function () {
  if (window.__AR_RUT) return;

  function clean(rut) {
    return String(rut || "")
      .replace(/[.\-\s]/g, "")
      .toUpperCase();
  }

  function dv(cuerpo) {
    const c = String(cuerpo || "").replace(/\D/g, "");
    if (!c) return "";
    let suma = 0;
    let mul = 2;
    for (let i = c.length - 1; i >= 0; i--) {
      suma += parseInt(c[i], 10) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const r = 11 - (suma % 11);
    if (r === 11) return "0";
    if (r === 10) return "K";
    return String(r);
  }

  function format(rut) {
    const c = clean(rut);
    if (c.length < 2) return c;
    const cuerpo = c.slice(0, -1);
    const verif = c.slice(-1);
    // Insertar puntos cada 3 dígitos desde la derecha
    const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${conPuntos}-${verif}`;
  }

  function validate(rut) {
    const c = clean(rut);
    if (!c) return { ok: false, rut: "", formatted: "", motivo: "RUT vacío" };
    if (c.length < 2) return { ok: false, rut: c, formatted: c, motivo: "RUT muy corto" };
    if (!/^\d+[\dK]$/.test(c)) return { ok: false, rut: c, formatted: c, motivo: "Caracteres inválidos" };
    const cuerpo = c.slice(0, -1);
    const declarado = c.slice(-1);
    const esperado = dv(cuerpo);
    if (declarado !== esperado) {
      return { ok: false, rut: c, formatted: format(c), motivo: `DV inválido (esperado ${esperado})` };
    }
    return { ok: true, rut: c, formatted: format(c) };
  }

  function equal(a, b) {
    return clean(a) === clean(b) && clean(a) !== "";
  }

  window.__AR_RUT = { clean, format, dv, validate, equal };
})();
