/* Vínculo — Hashing anónimo de paciente (Fase 3)
 *
 * Convierte el RUT del paciente en un identificador SHA-256 con sal local
 * generada en el primer arranque. La sal NO se sincroniza entre equipos,
 * por lo que el mismo paciente produce un hash distinto en cada CESFAM →
 * imposible cruzar hashes entre instalaciones.
 *
 * Uso (logs, deduplicación interna):
 *   const id = await window.__AR_PATIENT_HASH.hash(rut);  // "ph_a3f9..."
 *
 * NUNCA usar para identificar al paciente en la UI clínica. El hash se
 * destina a correlación técnica anónima dentro del mismo equipo.
 */
(function () {
  if (window.__AR_PATIENT_HASH) return;

  const SALT_KEY = "ar_patient_salt";
  const HASH_VERSION = 1;
  let saltCached = null;

  function bytesToHex(bytes) {
    let h = "";
    for (let i = 0; i < bytes.length; i++) h += bytes[i].toString(16).padStart(2, "0");
    return h;
  }

  function newSalt() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return bytesToHex(arr);
  }

  function getSalt() {
    if (saltCached) return Promise.resolve(saltCached);
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([SALT_KEY], function (res) {
          let s = res && res[SALT_KEY];
          if (!s || typeof s !== "string" || s.length < 32) {
            s = newSalt();
            chrome.storage.local.set({ [SALT_KEY]: s });
          }
          saltCached = s;
          resolve(s);
        });
      } catch (_) {
        if (!saltCached) saltCached = newSalt();
        resolve(saltCached);
      }
    });
  }

  function normalizeRut(rut) {
    if (!rut) return "";
    return String(rut).replace(/[^0-9kK]/g, "").toLowerCase();
  }

  async function hash(rut) {
    const norm = normalizeRut(rut);
    if (!norm) return "";
    if (window.__AR_CONSENT && !window.__AR_CONSENT.allows("patientHash")) return "";
    const salt = await getSalt();
    const data = new TextEncoder().encode("ARv" + HASH_VERSION + "|" + salt + "|" + norm);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return "ph_" + bytesToHex(new Uint8Array(buf)).slice(0, 16);
  }

  function rotateSalt() {
    return new Promise(function (resolve) {
      const s = newSalt();
      saltCached = s;
      try { chrome.storage.local.set({ [SALT_KEY]: s }, function () { resolve(s); }); }
      catch (_) { resolve(s); }
    });
  }

  function info() {
    return getSalt().then(function (s) {
      return {
        version: HASH_VERSION,
        algorithm: "SHA-256",
        saltLength: s.length,
        saltPreview: s.slice(0, 8) + "…",
      };
    });
  }

  window.__AR_PATIENT_HASH = {
    hash: hash,
    rotateSalt: rotateSalt,
    info: info,
    HASH_VERSION: HASH_VERSION,
  };
})();
