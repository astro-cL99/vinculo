/* Catálogo declarativo de roles APS — define qué módulos ve cada profesión.
 * Los `modules` son IDs de botón que el role-router muestra/oculta en la FAB.
 */
window.__AR_ROLES = window.__AR_ROLES || [
  {
    id: "medico",
    label: "👨‍⚕️ Médico",
    modules: ["clin", "rec", "lab", "labcfg", "fundus", "chronic", "ges", "act", "receta", "consultor", "deriv", "resumen", "plantillas"],
  },
  {
    id: "enfermeria",
    label: "💉 Enfermería",
    modules: ["clin", "rec", "lab", "labcfg", "chronic", "ges", "act", "consultor", "deriv", "resumen", "plantillas"],
  },
  {
    id: "kine",
    label: "🦵 Kinesiología",
    modules: ["clin", "rec", "act", "consultor", "deriv", "resumen", "plantillas"],
  },
  {
    id: "nutri",
    label: "🥗 Nutrición",
    modules: ["clin", "lab", "act", "consultor", "deriv", "resumen", "plantillas"],
  },
  {
    id: "odonto",
    label: "🦷 Odontología",
    modules: ["clin", "act", "receta", "consultor", "deriv", "resumen", "plantillas"],
  },
  {
    id: "tens",
    label: "🩹 TENS",
    modules: ["clin", "rec", "act", "consultor", "deriv", "resumen", "plantillas"],
  },
  {
    id: "psico",
    label: "🧠 Psicología",
    modules: ["clin", "act", "consultor", "deriv", "resumen", "plantillas"],
  },
];
