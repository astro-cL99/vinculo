import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Download, FileJson } from "lucide-react";
import { downloadFile, downloadJson } from "@/lib/download";
import type { Template } from "@/lib/templates";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca de plantillas — Vínculo" },
      {
        name: "description",
        content: "Plantillas semilla para APS chilena: EMPA, HTA, DM2, IRA alta y más.",
      },
    ],
  }),
  component: LibraryPage,
});

const LIBRARY: Template[] = [
  {
    id: "seed-empa-adulto",
    name: "EMPA adulto — signos vitales normales",
    description: "Examen de Medicina Preventiva del Adulto: signos vitales y antropometría base.",
    fields: [
      { selector: "input[name='presionSistolica']", type: "text", label: "PA sistólica", value: "120" },
      { selector: "input[name='presionDiastolica']", type: "text", label: "PA diastólica", value: "75" },
      { selector: "input[name='frecuenciaCardiaca']", type: "text", label: "FC", value: "72" },
      { selector: "input[name='frecuenciaRespiratoria']", type: "text", label: "FR", value: "16" },
      { selector: "input[name='saturacion']", type: "text", label: "SatO2", value: "98" },
      { selector: "input[name='temperatura']", type: "text", label: "T°", value: "36.5" },
    ],
  },
  {
    id: "seed-control-htn-lab",
    name: "Control crónico HTA + lab",
    description: "HTA compensado con resumen de exámenes auto-extraídos vía 🧪 Lab.",
    fields: [
      { selector: "textarea[name='anamnesis']", type: "textarea", label: "Anamnesis", value: "Paciente acude a control HTA. Adherencia a tratamiento, sin síntomas cardiovasculares." },
      { selector: "textarea[name='laboratorio']", type: "textarea", label: "Laboratorio", value: "Lab {{lab.glicemia.fecha}}: Glicemia {{lab.glicemia}}, Creat {{lab.creatinina}}, Hb {{lab.hemoglobina}}, CT {{lab.colesterol_total}} / LDL {{lab.ldl}} / HDL {{lab.hdl}} / TG {{lab.trigliceridos}}." },
      { selector: "textarea[name='indicaciones']", type: "textarea", label: "Indicaciones", value: "1. Mantener tratamiento. 2. Dieta hiposódica. 3. Actividad física. 4. Control en 3 meses." },
    ],
  },
  {
    id: "seed-control-dm2-lab",
    name: "Control crónico DM2 + lab",
    description: "DM2 compensada con HbA1c, microalbuminuria, RAC y función renal.",
    fields: [
      { selector: "textarea[name='anamnesis']", type: "textarea", label: "Anamnesis", value: "Paciente DM2 en control. Adherencia a tratamiento, sin síntomas de hipoglicemia." },
      { selector: "textarea[name='laboratorio']", type: "textarea", label: "Laboratorio", value: "Lab {{lab.hba1c.fecha}}: HbA1c {{lab.hba1c}}, Glicemia {{lab.glicemia}}, Creat {{lab.creatinina}} (VFG {{lab.vfg}}), MAU {{lab.microalbuminuria}}, RAC {{lab.rac}}." },
      { selector: "textarea[name='indicaciones']", type: "textarea", label: "Indicaciones", value: "1. Continuar tratamiento. 2. Dieta diabético. 3. HbA1c en 3 meses. 4. Fondo de ojo cada 2 años." },
    ],
  },
  {
    id: "seed-empa-lab",
    name: "EMPA + perfil bioquímico",
    description: "Resumen de perfil bioquímico básico para examen preventivo.",
    fields: [
      { selector: "textarea[name='laboratorio']", type: "textarea", label: "Laboratorio", value: "Perfil bioquímico {{lab.glicemia.fecha}}: Glicemia {{lab.glicemia}}, Creat {{lab.creatinina}}, CT {{lab.colesterol_total}}, LDL {{lab.ldl}}, HDL {{lab.hdl}}, TG {{lab.trigliceridos}}, TSH {{lab.tsh}}." },
    ],
  },
  {
    id: "seed-ira-alta",
    name: "IRA alta viral — adulto",
    description: "Resfrío común / faringitis viral en adulto sin criterios de gravedad.",
    fields: [
      { selector: "textarea[name='anamnesis']", type: "textarea", label: "Anamnesis", value: "Cuadro de 2-3 días: congestión nasal, odinofagia leve, tos seca, malestar general. Afebril." },
      { selector: "textarea[name='examenFisico']", type: "textarea", label: "Examen físico", value: "BEG, hidratado, afebril. Faringe eritematosa sin exudado. Otoscopia normal. SatO2 >97% AA." },
      { selector: "textarea[name='indicaciones']", type: "textarea", label: "Indicaciones", value: "1. Reposo. 2. Hidratación. 3. Paracetamol 500mg c/8h SOS. 4. Lavados nasales. 5. Consultar si fiebre >38.5°C >72h, disnea, dolor torácico." },
    ],
  },
];

function LibraryPage() {
  function downloadAll() {
    downloadJson(
      {
        name: "Plantillas base CESFAM",
        version: 1,
        exportedAt: new Date().toISOString().slice(0, 10),
        templates: LIBRARY,
      },
      "plantillas-base-cesfam.json",
    );
  }
  function downloadOne(t: Template) {
    downloadJson({ templates: [t] }, `${t.id}.json`);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Biblioteca de plantillas</h1>
            <p className="mt-2 text-muted-foreground">
              Set semilla para medicina general APS. Edita en el editor antes de usar — los selectores
              de Rayen pueden variar según la versión.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => downloadFile("/plantillas-base-cesfam.json", "plantillas-base-cesfam.json")}
            >
              <Download className="mr-2 h-4 w-4" /> Set oficial
            </Button>
            <Button className="bg-[image:var(--gradient-hero)]" onClick={downloadAll}>
              <FileJson className="mr-2 h-4 w-4" /> Descargar todas
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {LIBRARY.map((t) => (
            <article
              key={t.id}
              className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
            >
              <h2 className="font-semibold">{t.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.fields.map((f, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
              <div className="mt-auto pt-4">
                <Button size="sm" variant="outline" onClick={() => downloadOne(t)}>
                  <Download className="mr-2 h-4 w-4" /> Descargar JSON
                </Button>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight">Recursos farmacológicos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Guías clínicas oficiales que la extensión consulta automáticamente desde el arsenal de farmacia.
          </p>
          <article className="mt-4 flex flex-col rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold">Medicamentos en el Embarazo (FDA A/B/C/D/X)</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                8° Guía Clínica — Servicio de Salud Araucanía Sur. ~210 fármacos clasificados con observaciones
                clínicas. Integrada en el arsenal: al recetar un fármaco categoría D o X, la extensión antepone
                un aviso al texto pegable.
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-3 md:mt-0"
              onClick={() => downloadFile("/recursos/guia-medicamentos-embarazo.pdf", "guia-medicamentos-embarazo.pdf")}
            >
              <Download className="mr-2 h-4 w-4" /> Descargar PDF
            </Button>
          </article>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
