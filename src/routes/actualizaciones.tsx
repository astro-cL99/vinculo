import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import {
  Download,
  Pill,
  ThermometerSun,
  Workflow,
  Package,
  CheckCircle2,
  Upload,
  RotateCcw,
} from "lucide-react";
import { downloadFile } from "@/lib/download";

export const Route = createFileRoute("/actualizaciones")({
  head: () => ({
    meta: [
      { title: "Actualizaciones de datos clínicos — Vínculo" },
      {
        name: "description",
        content:
          "Mantén la base clínica del CESFAM (fármacos renales, sick-day rules, flujogramas) actualizada localmente, sin depender del servidor.",
      },
    ],
  }),
  component: UpdatesPage,
});

type DataSet = {
  href: string;
  filename: string;
  title: string;
  count: string;
  desc: string;
  Icon: typeof Pill;
  tone: "primary" | "warm" | "cool" | "accent";
};

const SETS: DataSet[] = [
  {
    href: "/datos/bundle.json",
    filename: "asistente-rayen-datos.json",
    title: "Bundle completo",
    count: "Renal + Sick-day + Flujogramas",
    desc: "Recomendado. Un solo archivo con toda la base clínica oficial vigente. Importa una sola vez en cada PC del CESFAM.",
    Icon: Package,
    tone: "primary",
  },
  {
    href: "/datos/renal.json",
    filename: "renal.json",
    title: "Tabla de ajuste renal",
    count: "121 fármacos",
    desc: "Ajustes por VFG (CG / CKD-EPI) por bucket ≥50, 10–49, <10 y diálisis.",
    Icon: Pill,
    tone: "warm",
  },
  {
    href: "/datos/sickday.json",
    filename: "sickday.json",
    title: "Sick-day rules",
    count: "12 grupos farmacológicos",
    desc: "Reglas de suspensión transitoria en gastroenteritis, fiebre, deshidratación.",
    Icon: ThermometerSun,
    tone: "cool",
  },
  {
    href: "/datos/flows.json",
    filename: "flujogramas.json",
    title: "Flujogramas APS",
    count: "23 flujos",
    desc: "Cirugía menor, ORL, oftalmología, CCR, salud mental, demencia, telesalud y más.",
    Icon: Workflow,
    tone: "accent",
  },
];

const TONE: Record<DataSet["tone"], string> = {
  primary: "bg-[image:var(--gradient-hero)] text-primary-foreground",
  warm: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  cool: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  accent: "bg-accent text-accent-foreground",
};

function UpdatesPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <div className="max-w-3xl">
          <span className="inline-block rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            Modo CESFAM offline · v0.8.0
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Actualizaciones de la base clínica
          </h1>
          <p className="mt-3 text-muted-foreground">
            Cada equipo del CESFAM mantiene su propia copia de la base clínica (fármacos
            renales, sick-day rules, flujogramas). Descarga aquí la versión oficial
            vigente y aplícala localmente desde el ⚡ del navegador. Cero dependencia de
            internet en el momento de la consulta.
          </p>
        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          {SETS.map((s) => {
            const Icon = s.Icon;
            return (
              <article
                key={s.href}
                className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${TONE[s.tone]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{s.title}</h2>
                    <p className="text-xs font-medium text-muted-foreground">{s.count}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{s.desc}</p>
                <Button
                  variant={s.tone === "primary" ? "default" : "outline"}
                  className={`mt-4 w-full ${s.tone === "primary" ? "bg-[image:var(--gradient-hero)]" : ""}`}
                  onClick={() => downloadFile(s.href, s.filename)}
                >
                  <Download className="mr-2 h-4 w-4" /> {s.filename}
                </Button>
              </article>
            );
          })}
        </section>

        <section className="mt-12 rounded-xl border border-border bg-secondary/40 p-6 md:p-8">
          <h2 className="text-xl font-semibold">Cómo aplicar en cada PC del CESFAM</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Funciona sin permisos de administrador. Toma menos de un minuto por equipo.
          </p>
          <ol className="mt-6 space-y-4">
            {[
              {
                Icon: Download,
                title: "Descarga el bundle",
                body: "Bájate asistente-rayen-datos.json (botón superior). Puedes copiarlo a un pendrive o a la red interna y distribuirlo al resto de equipos.",
              },
              {
                Icon: Upload,
                title: "Abre el ⚡ Vínculo del navegador",
                body: "Click en el ícono de la extensión, pestaña Datos clínicos → Importar JSON…",
              },
              {
                Icon: CheckCircle2,
                title: "Listo",
                body: "Los nuevos fármacos / flujos quedan activos de inmediato. Puedes verificar el conteo (Renal · Sick-day · Flujogramas) en la misma ventana.",
              },
              {
                Icon: RotateCcw,
                title: "Volver a fábrica",
                body: "Si algo falla, usa Restaurar TODO de fábrica en el popup. Vuelves a los datos embebidos en la versión instalada de la extensión, sin perder plantillas ni flujos personalizados grabados.",
              },
            ].map((s, i) => {
              const Icon = s.Icon;
              return (
                <li
                  key={s.title}
                  className="flex items-start gap-4 rounded-lg border border-border bg-card p-4"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[image:var(--gradient-hero)] text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Icon className="h-4 w-4 text-primary" />
                      {s.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold">¿Quién genera las actualizaciones?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              El equipo médico del CESFAM. Pueden editar el JSON exportado por la
              extensión (pestaña Datos clínicos → Exportar actual), revisarlo entre
              colegas, y volverlo a distribuir como nuevo bundle. El formato es texto
              plano, fácil de versionar en una carpeta compartida.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold">Privacidad</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Los archivos JSON contienen <b>tablas clínicas</b>, no datos de pacientes.
              Los datos de pacientes (lab, prescripciones) nunca salen del navegador
              donde se ejecuta la extensión.
            </p>
          </div>
        </section>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link to="/descargar">
            <Button size="lg" variant="outline">
              <Download className="mr-2 h-4 w-4" /> Descargar extensión
            </Button>
          </Link>
          <Link to="/instalacion">
            <Button size="lg" className="bg-[image:var(--gradient-hero)]">
              Guía de instalación →
            </Button>
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
