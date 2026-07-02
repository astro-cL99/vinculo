import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  asistenteRayenZipBase64,
  asistenteRayenZipBytes,
  plantillasBaseBytes,
  plantillasBaseJson,
} from "@/generated/downloadArtifacts";
import {
  Download,
  FileJson,
  CheckCircle2,
  History,
  Sparkles,
  Wrench,
  AlertTriangle,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type ReleaseType = "major" | "minor" | "patch";
type Release = {
  version: string;
  date: string;
  type: ReleaseType;
  highlights: string[];
};

const RELEASES: Release[] = [
  {
    version: "1.0.86",
    date: "2026-05-30",
    type: "minor",
    highlights: [
      "🎙 Transcripción de voz migrada a Lovable AI (Gemini 2.5): adiós al bloqueo intermitente 401 de ElevenLabs Free Tier.",
      "Sin secretos extra para el profesional: usa la cuota de Lovable AI ya provisionada (cero costo adicional para el CESFAM).",
      "🔒 Nueva página pública /privacidad (Ley 19.628 + 21.719) con enlace permanente en el footer.",
      "Manifest de la extensión apunta a la URL estable de producción (neghme.lovable.app), listo para Chrome Web Store.",
      "Endpoint apunta a producción: ya no depende del preview de Lovable.",
    ],
  },
  {
    version: "1.0.85",
    date: "2026-05-28",
    type: "minor",
    highlights: [
      "🤰 Nueva pestaña 'Embarazo (FDA)' en Recursos clínicos: 239 fármacos con categoría A/B/C/D/X, notas y 3° trimestre (Guía SSASUR).",
      "Arsenal CESFAM: badge de categoría FDA junto al nombre + caja 'Riesgo en embarazo' en el detalle de cada fármaco.",
      "Farmacia: el escaneo de receta ahora levanta alertas automáticas cuando detecta fármacos categoría C (media) o D/X (alta).",
      "Texto pegable de recetas antepone ⚠ Embarazo cat. D/X con la nota clínica de la guía.",
      "Versionado alineado entre la página de descarga y el manifest del ZIP.",
    ],
  },

  {
    version: "1.0.83",
    date: "2026-05-24",
    type: "minor",
    highlights: [
      "🎙 Anamnesis por voz: graba la conversación médico-paciente y la estructura en 5 secciones (Motivo, Historia, Antecedentes, Examen, Plan).",
      "Sin almacenamiento de audio — se procesa y descarta de inmediato. Cumple Ley 21.719 (Chile).",
      "Toggle obligatorio de consentimiento + log local cifrado en el navegador.",
      "Chip 🎙 Dictar se inyecta automáticamente junto a campos Anamnesis / Motivo de consulta en Rayen.",
      "Vista previa editable + 3 modos de inserción: estructurado, texto plano, transcripción cruda.",
    ],
  },
  {
    version: "1.0.82",
    date: "2026-05-24",
    type: "minor",
    highlights: [
      "Elimina por completo la integración ICD-11 (módulo `dx-icd11.js` y atributos `data-ar-icd11`).",
      "Silencia logs ruidosos del Resumen HC tras flag `window.__AR_DEBUG`.",
      "Limpieza de tests obsoletos y referencias a archivos eliminados.",
    ],
  },
  {
    version: "1.0.81",
    date: "2026-05-24",
    type: "minor",
    highlights: [
      "Resumen Historia Clínica: extractor de atenciones reales (Anamnesis, Dx, Rx, Exámenes, Derivaciones).",
      "Lectura instantánea — ya no abre atención por atención; usa caché de red + estado React.",
      "Filtra NSP, 'No Informado' y tomas de muestra sin contenido clínico.",
      "Inyector page-sniffer captura fetch/XHR y globals de la página Rayen.",
    ],
  },
  {
    version: "1.0.65",
    date: "2026-05-12",
    type: "patch",
    highlights: [
      "Corrige cuadro de medicamentos: SOS ya no se imprime con el valor de la columna Noche.",
      "Se elimina la integración ICD-11 para evitar dependencias externas y fallos de carga.",
    ],
  },
  {
    version: "1.0.60",
    date: "2026-04-28",
    type: "minor",
    highlights: [
      "Nuevo cuadro de medicamentos con columna Cantidad (8 campos serializados).",
      "Mejoras en historial local de documentos generados (reimpresión en un clic).",
      "Refinamientos de CSS de impresión carta.",
    ],
  },
  {
    version: "1.0.50",
    date: "2026-03-15",
    type: "minor",
    highlights: [
      "Detección de diagnóstico con mapeo a abreviaciones APS.",
      "Validación de RUT con dígito verificador y corrección automática de género.",
      "Informe Biomédico COMPIN con autollenado desde la ficha.",
    ],
  },
  {
    version: "1.0.40",
    date: "2026-02-02",
    type: "minor",
    highlights: [
      "Calculadora pediátrica de dosis integrada.",
      "Alertas de interacciones farmacológicas en tiempo real.",
      "Set ampliado de documentos imprimibles (HTA, DM2, sick-day rules).",
    ],
  },
  {
    version: "1.0.30",
    date: "2025-12-10",
    type: "minor",
    highlights: [
      "Arsenal CESFAM y módulo Farmacia (PROA) cargados localmente.",
      "Recordatorios clínicos APS por edad, sexo y patología.",
      "Lab parser: extracción automática desde resultados pegados.",
    ],
  },
  {
    version: "1.0.0",
    date: "2025-10-01",
    type: "major",
    highlights: [
      "Primera versión estable: aprendizaje de flujos local-first, sin nube.",
      "Plantillas con condicionales y grabación de flujos.",
      "Auto-relleno de exámenes en ficha Rayen.",
    ],
  },
];

const TYPE_META: Record<ReleaseType, { Icon: typeof History; cls: string; label: string }> = {
  major: { Icon: AlertTriangle, cls: "bg-destructive/10 text-destructive border-destructive/30", label: "Major" },
  minor: { Icon: Sparkles, cls: "bg-primary/10 text-primary border-primary/30", label: "Minor" },
  patch: { Icon: Wrench, cls: "bg-muted text-muted-foreground border-border", label: "Patch" },
};

export const Route = createFileRoute("/descargar")({
  head: () => ({
    meta: [
      { title: "Descargar — Vínculo" },
      {
        name: "description",
        content: "Descarga la extensión Vínculo y el set base de plantillas para CESFAM.",
      },
    ],
  }),
  component: DownloadPage,
});

type DownloadStatus = "idle" | "downloading" | "done" | "error";
type DownloadSource =
  | { kind: "base64"; data: string; mimeType: string }
  | { kind: "text"; data: string; mimeType: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatReleaseDate(date: string): string {
  const [year, month, day] = date.split("-");
  const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  return `${Number(day)} ${monthNames[Number(month) - 1]} ${year}`;
}

function downloadPublicFile(source: DownloadSource, filename: string, onDone: () => void, onError: (msg: string) => void) {
  try {
    const blob = source.kind === "text"
      ? new Blob([source.data], { type: source.mimeType })
      : (() => {
          const binary = atob(source.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          return new Blob([bytes], { type: source.mimeType });
        })();

    if (!blob.size || blob.size < 100) {
      throw new Error("El archivo descargado está vacío o incompleto.");
    }

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    onDone();
  } catch (err) {
    onError((err as Error)?.message || "Error al iniciar la descarga");
  }
}

function useFileDownload() {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState(1); // 0..100, -1 = indeterminate
  const [loaded, setLoaded] = useState(1);
  const [total, setTotal] = useState(1);

  function start(source: DownloadSource, filename: string, fallbackBytes = 0) {
    setStatus("downloading");
    setProgress(20);
    setLoaded(fallbackBytes);
    setTotal(fallbackBytes || 726758);
    downloadPublicFile(
      source,
      filename,
      () => {
        setProgress(100);
        setStatus("done");
        toast.success(`${filename} descargado`, {
          description: "La descarga quedó iniciada sin salir de Lovable.",
        });
      },
      (msg) => {
        setStatus("error");
        toast.error(`No se pudo descargar ${filename}`, { description: msg });
      }
    );
  }

  function reset() {
    setStatus("idle");
    setProgress(0);
    setLoaded(0);
    setTotal(0);
  }

  return { status, progress, loaded, total, start, reset };
}

function DownloadCard({
  variant,
  icon,
  title,
  description,
  filename,
  source,
  fallbackBytes,
  footer,
}: {
  variant: "primary" | "secondary";
  icon: React.ReactNode;
  title: string;
  description: string;
  filename: string;
  source: DownloadSource;
  fallbackBytes?: number;
  footer: React.ReactNode;
}) {
  const dl = useFileDownload();
  const isPrimary = variant === "primary";
  const isDownloading = dl.status === "downloading";
  const isDone = dl.status === "done";
  const isError = dl.status === "error";
  const totalShown = dl.total || fallbackBytes || 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div
        className={
          isPrimary
            ? "grid h-10 w-10 place-items-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground"
            : "grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground"
        }
      >
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>

      <Button
        className={
          isPrimary
            ? "mt-5 w-full bg-[image:var(--gradient-hero)]"
            : "mt-5 w-full"
        }
        variant={isPrimary ? "default" : "outline"}
        disabled={isDownloading}
        onClick={() => dl.start(source, filename, fallbackBytes)}
      >
        {isDownloading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isDone && !isDownloading && <CheckCircle2 className="mr-2 h-4 w-4" />}
        {isError && <XCircle className="mr-2 h-4 w-4" />}
        {!isDownloading && !isDone && !isError && <Download className="mr-2 h-4 w-4" />}
        {isDownloading
          ? "Descargando…"
          : isDone
            ? "Descargado — descargar de nuevo"
            : isError
              ? "Reintentar"
              : filename}
      </Button>

      {(isDownloading || isDone) && (
        <div className="mt-3 space-y-1.5">
          <Progress
            value={dl.progress < 0 ? undefined : dl.progress}
            className={isDone ? "[&>div]:bg-primary" : ""}
          />
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {formatBytes(dl.loaded)}
              {totalShown > 0 && ` / ${formatBytes(totalShown)}`}
            </span>
            <span>
              {isDone ? "Listo" : dl.progress < 0 ? "…" : `${dl.progress}%`}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3">{footer}</div>
    </div>
  );
}

function DownloadPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Descargar Vínculo</h1>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-mono">
            v{RELEASES[0].version}
          </Badge>
        </div>
        <p className="mt-3 text-muted-foreground">
          Para Chrome, Edge, Brave y otros navegadores basados en Chromium. Incluye{" "}
          <strong>auto-relleno de exámenes</strong>, <strong>grabación de flujos</strong>,{" "}
          <strong>plantillas con condicionales</strong>, <strong>recordatorios clínicos APS</strong>{" "}
          y <strong>modo local actualizable</strong> para que cada CESFAM mantenga su base clínica
          (fármacos, flujogramas) sin depender del servidor.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <DownloadCard
            variant="primary"
            icon={<Download className="h-5 w-5" />}
            title="Extensión (.zip)"
            description="Archivo descomprimible para cargar en modo desarrollador."
            filename="asistente-rayen.zip"
            source={{ kind: "base64", data: asistenteRayenZipBase64, mimeType: "application/zip" }}
            fallbackBytes={asistenteRayenZipBytes}
            footer={
              <Link to="/instalacion" className="block text-center text-sm text-primary hover:underline">
                Ver guía de instalación →
              </Link>
            }
          />

          <DownloadCard
            variant="secondary"
            icon={<FileJson className="h-5 w-5" />}
            title="Plantillas base CESFAM"
            description="Set inicial editable: EMPA, control HTA, DM2, IRA alta. Importable desde la extensión."
            filename="plantillas-base-cesfam.json"
            source={{ kind: "text", data: plantillasBaseJson, mimeType: "application/json;charset=utf-8" }}
            fallbackBytes={plantillasBaseBytes}
            footer={
              <Link to="/biblioteca" className="block text-center text-sm text-primary hover:underline">
                Ver biblioteca →
              </Link>
            }
          />
        </div>

        <div className="mt-10 rounded-xl border border-border bg-secondary/40 p-6">
          <h3 className="font-semibold">Próximos pasos</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              "Descomprime el ZIP en una carpeta estable (ej: C:\\AsistenteRayen).",
              "Abre chrome://extensions, activa Modo desarrollador, Cargar descomprimida.",
              "Abre clinico.rayenaps.cl y verás el botón ⚡ Plantillas abajo a la derecha.",
              "Importa el JSON base desde el panel para tener plantillas listas.",
            ].map((s) => (
              <li key={s} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <section className="mt-12">
          <div className="mb-5 flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Historial de versiones</h2>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Resumen de los cambios más relevantes en cada release. Versionado{" "}
            <strong>semver</strong> (<code>MAJOR.MINOR.PATCH</code>).
          </p>
          <ol className="relative space-y-4 border-l border-border pl-6">
            {RELEASES.map((r, idx) => {
              const m = TYPE_META[r.type];
              const isLatest = idx === 0;
              return (
                <li key={r.version} className="relative">
                  <span
                    className={`absolute -left-[31px] top-2 grid h-5 w-5 place-items-center rounded-full border-2 ${
                      isLatest ? "border-primary bg-primary" : "border-border bg-card"
                    }`}
                  >
                    <m.Icon className={`h-3 w-3 ${isLatest ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  </span>
                  <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold">v{r.version}</span>
                      <Badge variant="outline" className={m.cls}>
                        {m.label}
                      </Badge>
                      {isLatest && (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          Actual
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatReleaseDate(r.date)}
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {r.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 text-center">
            <Link to="/changelog" className="text-sm text-primary hover:underline">
              Ver changelog completo →
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
