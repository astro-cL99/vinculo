import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/instalacion")({
  head: () => ({
    meta: [
      { title: "Instalación — Vínculo" },
      {
        name: "description",
        content: "Cómo instalar la extensión Vínculo en Chrome o Edge en 5 minutos.",
      },
    ],
  }),
  component: InstallPage,
});

function InstallPage() {
  const steps = [
    {
      title: "Descarga el ZIP",
      body: (
        <p>
          Ve a la página de{" "}
          <Link to="/descargar" className="text-primary hover:underline">descarga</Link> y baja{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">asistente-rayen.zip</code>.
        </p>
      ),
    },
    {
      title: "Descomprime en una carpeta estable",
      body: (
        <p>
          Por ejemplo: <code className="rounded bg-muted px-1.5 py-0.5 text-sm">C:\AsistenteRayen</code>.
          No la borres después — Chrome carga la extensión desde esa carpeta.
        </p>
      ),
    },
    {
      title: "Abre chrome://extensions",
      body: (
        <p>
          En Chrome, Edge o Brave, escribe en la barra de direcciones{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">chrome://extensions</code> y presiona Enter.
          En Edge también funciona <code className="rounded bg-muted px-1.5 py-0.5 text-sm">edge://extensions</code>.
        </p>
      ),
    },
    {
      title: "Activa el Modo desarrollador",
      body: <p>Toggle en la esquina superior derecha de la página de extensiones.</p>,
    },
    {
      title: "Carga descomprimida",
      body: (
        <p>
          Click en <strong>Cargar descomprimida</strong> y selecciona la carpeta donde descomprimiste el ZIP.
          Verás el ⚡ Vínculo en la barra de extensiones.
        </p>
      ),
    },
    {
      title: "Abre Rayen",
      body: (
        <p>
          Entra a{" "}
          <a
            href="https://clinico.rayenaps.cl"
            className="text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            clinico.rayenaps.cl
          </a>
          . Verás el botón flotante <strong>⚡ Plantillas</strong> en la esquina inferior derecha.
        </p>
      ),
    },
    {
      title: "Importa el set base (opcional)",
      body: (
        <p>
          Click en ⚡ Plantillas → <strong>Importar JSON</strong> → selecciona{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">plantillas-base-cesfam.json</code>.
        </p>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Guía de instalación</h1>
        <p className="mt-3 text-muted-foreground">
          5 minutos. Sin permisos de administrador. Funciona en Chrome, Edge, Brave y otros navegadores
          basados en Chromium.
        </p>

        <ol className="mt-10 space-y-5">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[image:var(--gradient-hero)] text-sm font-bold text-primary-foreground">
                  {i + 1}
                </div>
                <div>
                  <h2 className="font-semibold">{s.title}</h2>
                  <div className="mt-1 text-sm text-muted-foreground">{s.body}</div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-xl border border-border bg-secondary/40 p-6">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">¿Cómo actualizar a una nueva versión?</h3>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                <li>Descarga el nuevo ZIP desde esta página.</li>
                <li>Reemplaza el contenido de tu carpeta (ej: C:\AsistenteRayen) con la versión nueva.</li>
                <li>
                  En <code className="rounded bg-muted px-1 py-0.5 text-xs">chrome://extensions</code>{" "}
                  presiona el botón ↻ recargar sobre la tarjeta de Vínculo.
                </li>
                <li>Tus plantillas guardadas se mantienen — viven en el navegador, no en el ZIP.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <Link to="/descargar">
            <Button size="lg" className="bg-[image:var(--gradient-hero)]">
              <Download className="mr-2 h-4 w-4" /> Ir a descargar
            </Button>
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
