import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/roadmap")({
  component: RoadmapPage,
  head: () => ({
    meta: [
      { title: "Roadmap copiloto — Vínculo" },
      {
        name: "description",
        content:
          "Funciones planificadas del copiloto médico: calculadoras, GES, IA local, anonimización y más. Vota qué priorizar.",
      },
      { property: "og:title", content: "Roadmap copiloto — Vínculo" },
    ],
  }),
});

type Item = {
  id: string;
  title: string;
  description: string;
  group: string;
};

const ITEMS: Item[] = [
  // Clínico
  { id: "calc_ascvd", group: "Clínico", title: "Calculadora ASCVD", description: "Riesgo CV a 10 años con auto-relleno desde labs y edad." },
  { id: "calc_chads", group: "Clínico", title: "CHA₂DS₂-VASc + HAS-BLED", description: "Anticoagulación en FA con cruce de fármacos en ficha." },
  { id: "calc_findrisc", group: "Clínico", title: "FINDRISC", description: "Tamizaje DM2 a partir de IMC, edad y antecedentes." },
  { id: "calc_wells", group: "Clínico", title: "Wells TVP/TEP, qSOFA, CURB-65", description: "Scores de cabecera con un click." },
  { id: "ges_auto", group: "Clínico", title: "Score GES automático", description: "Sospecha → garantía explícita según diagnóstico." },
  { id: "drug_interact", group: "Clínico", title: "Interacciones farmacológicas", description: "Base local mini cruzando recetas activas." },
  { id: "missing_exams", group: "Clínico", title: "Exámenes faltantes", description: "p.ej. paciente HTA sin RAC en 12 meses." },

  // Operativo
  { id: "ic_auto", group: "Operativo CESFAM", title: "IC auto-generada", description: "Motivo + antecedentes + exámenes en formato SIDRA." },
  { id: "lme_auto", group: "Operativo CESFAM", title: "Plantillas LME con CIE-10", description: "Licencias médicas con diagnóstico obligatorio." },
  { id: "rem_codes", group: "Operativo CESFAM", title: "Códigos REM auto", description: "Sugerencia de código REM según prestación." },

  // Datos
  { id: "telemetry", group: "Datos & aprendizaje", title: "Telemetría local", description: "Ranking adaptativo de plantillas/flujos más usados." },
  { id: "share_packs", group: "Datos & aprendizaje", title: "Paquetes biblioteca CESFAM", description: "Exportar/importar entre centros." },
  { id: "feedback", group: "Datos & aprendizaje", title: "Feedback 👍/👎 por plantilla", description: "Reordena sugerencias automáticamente." },

  // IA
  { id: "ai_summary", group: "IA (Lovable AI)", title: "Resumen automático ficha", description: "Últimas 5 atenciones en 3 líneas." },
  { id: "ai_dx", group: "IA (Lovable AI)", title: "Diagnóstico diferencial", description: "Contexto anonimizado al gateway." },
  { id: "ai_patient_lang", group: "IA (Lovable AI)", title: "Reescritura lenguaje paciente", description: "Indicaciones impresas en lenguaje simple." },
  { id: "ai_cie10", group: "IA (Lovable AI)", title: "CIE-10 desde texto libre", description: "Codificación asistida." },

  // Seguridad
  { id: "anonymize", group: "Seguridad", title: "Modo anonimizar", description: "Reemplaza RUT, nombre, fecha al enviar a IA." },
  { id: "paste_block", group: "Seguridad", title: "Bloqueo de pegado fuera de Rayen", description: "Datos del paciente no salen." },
  { id: "audit_log", group: "Seguridad", title: "Log local auditable", description: "Replays, pegados y llamadas IA registradas." },

  // Educación
  { id: "edu_tooltips", group: "Educación", title: "Tarjetas didácticas", description: "Tooltip semántico sobre RAC, VFG, fármacos…" },
  { id: "edu_becado", group: "Educación", title: "Modo becado", description: "Justificación clínica de cada sugerencia." },
];

const VOTES_KEY = "ar_roadmap_votes_v1";

function loadVotes(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(VOTES_KEY) || "{}"); } catch { return {}; }
}
function saveVotes(v: Record<string, number>) {
  try { localStorage.setItem(VOTES_KEY, JSON.stringify(v)); } catch {}
}

function RoadmapPage() {
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [voted, setVoted] = useState<Record<string, boolean>>({});

  useEffect(() => { setVotes(loadVotes()); }, []);

  const toggle = (id: string) => {
    const next = { ...votes };
    const did = !!voted[id];
    next[id] = Math.max(0, (next[id] || 0) + (did ? -1 : 1));
    setVotes(next);
    saveVotes(next);
    setVoted({ ...voted, [id]: !did });
  };

  const groups = Array.from(new Set(ITEMS.map((i) => i.group)));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-4xl font-bold tracking-tight">Roadmap del copiloto médico</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Funciones planificadas para Vínculo. Vota 👍 las que más te ayudarían
          en tu CESFAM. Los votos se guardan localmente en tu equipo (sin servidor).
        </p>
        <div className="mt-10 grid gap-8">
          {groups.map((g) => (
            <section key={g}>
              <h2 className="mb-4 text-2xl font-semibold">{g}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {ITEMS.filter((i) => i.group === g).map((i) => (
                  <Card key={i.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="flex-1">
                      <h3 className="font-semibold">{i.title}</h3>
                      <p className="text-sm text-muted-foreground">{i.description}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        size="sm"
                        variant={voted[i.id] ? "default" : "outline"}
                        onClick={() => toggle(i.id)}
                      >
                        👍 {votes[i.id] || 0}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
