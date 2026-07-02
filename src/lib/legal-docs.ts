// Documentos legales versionados — Vínculo
// Cada vez que cambie el contenido sustantivo, suba la versión y los profesionales
// serán requeridos a aceptar nuevamente (auditoría inmutable en terms_acceptances).

export const TERMS_VERSION = "2026-05-07";
export const PRIVACY_VERSION = "2026-05-07";

export const TERMS_MD = `# Términos de Uso — Vínculo

**Versión ${TERMS_VERSION}**

## 1. Naturaleza de la herramienta

Vínculo es una **herramienta de apoyo** para profesionales de Atención
Primaria de Salud (APS) en Chile. **No es un dispositivo médico de diagnóstico**
y **no reemplaza el juicio clínico**. Toda decisión diagnóstica, terapéutica o
de derivación corresponde exclusivamente al profesional tratante.

## 2. Uso aceptable

- Solo para profesionales de salud habilitados por el MINSAL.
- En contexto de atención clínica autorizada por el establecimiento.
- Los datos del paciente nunca deben compartirse fuera del entorno autorizado.

## 3. Limitaciones

- Las sugerencias de IA pueden contener errores u omisiones.
- Las reglas clínicas se basan en guías GES/MINSAL vigentes a la fecha del
  ruleset (ver "Versión activa del ruleset" en la extensión).
- El profesional debe contrastar siempre con la evidencia más reciente.

## 4. Responsabilidad

El uso de Vínculo es bajo responsabilidad del profesional. Los autores
no responden por daños derivados de decisiones clínicas tomadas con o sin la
herramienta.

## 5. Versionado

Estos términos están versionados. Si cambian sustantivamente, se solicitará
una nueva aceptación al ingresar.
`;

export const PRIVACY_MD = `# Política de Privacidad — Vínculo

**Versión ${PRIVACY_VERSION}**

Vínculo cumple las leyes **19.628** y **21.719** sobre protección
de datos personales y datos sensibles de salud.

## 1. Principios

- **Privacy-by-default**: hasta que aceptes el consentimiento, las funciones
  que tocan datos del paciente permanecen inactivas.
- **Local-first**: los datos clínicos del paciente no se envían a servidores
  externos del proveedor.
- **Anonimización**: los identificadores de paciente se almacenan como hash
  SHA-256 truncado con sal local única por instalación.

## 2. Datos que se procesan

| Tipo | Lugar | Retención |
|------|-------|-----------|
| Plantillas y configuración | \`chrome.storage.local\` | Hasta desinstalar |
| Hash anónimo de paciente | Local | Hasta rotar la sal |
| Feedback enviado por ti | Servidor (Lovable Cloud) | Indefinida (auditoría) |
| Aceptación de términos | Servidor (auditoría) | Indefinida |

## 3. Consultor IA

Cuando consultas la IA, se envía solo el contexto clínico **sin PII** (sin
nombre, RUT, teléfono ni dirección). El procesamiento ocurre vía Lovable AI
Gateway. Puedes desactivar esta función en el banner de consentimiento.

## 4. Tus derechos (Ley 21.719)

- **Acceso, rectificación, oposición y cancelación** de tus datos.
- **Portabilidad** del feedback que enviaste.
- Solicitudes a: contacto del proyecto en el sitio público.

## 5. Delegado de Protección de Datos

A designar antes de diciembre de 2026 conforme a Ley 21.719.

## 6. Versionado

Esta política está versionada. Cambios sustantivos requieren nueva aceptación.
`;
