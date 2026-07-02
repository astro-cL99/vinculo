import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import vinculoBanner from "@/assets/vinculo-banner-full.jpg.asset.json";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Download,
  Keyboard,
  Database,
  ShieldCheck,
  Wand2,
  FolderArchive,
  Puzzle,
  ToggleRight,
  CheckCircle2,
} from "lucide-react";

const INSTALL_STEPS = [
  {
    n: 1,
    icon: Download,
    title: "Descarga el ZIP",
    desc: "Bajas asistente-rayen.zip desde la sección Descargar. Pesa menos de 1 MB.",
    code: "→ asistente-rayen.zip",
  },
  {
    n: 2,
    icon: FolderArchive,
    title: "Descomprime",
    desc: "Extrae el ZIP en una carpeta estable, por ejemplo C:\\AsistenteRayen. No la muevas después.",
    code: "C:\\AsistenteRayen\\",
  },
  {
    n: 3,
    icon: Puzzle,
    title: "Carga en Chrome",
    desc: "Abre chrome://extensions, activa Modo desarrollador y elige Cargar descomprimida.",
    code: "chrome://extensions",
  },
  {
    n: 4,
    icon: ToggleRight,
    title: "Activa y úsala",
    desc: "Abre clinico.rayenaps.cl. El botón ⚡ Plantillas aparece abajo a la derecha.",
    code: "⚡ Plantillas — listo",
  },
] as const;

function HeroInstallShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % INSTALL_STEPS.length), 2800);
    return () => clearInterval(t);
  }, [paused]);

  const ActiveIcon = INSTALL_STEPS[active].icon;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* glow halo */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2rem] bg-[image:var(--gradient-hero)] opacity-20 blur-3xl"
      />
      {/* floating step pills */}
      <div className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full border border-border bg-card/95 px-2 py-1.5 shadow-[var(--shadow-card)] backdrop-blur">
        {INSTALL_STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Paso ${i + 1}: ${s.title}`}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                isActive
                  ? "bg-[image:var(--gradient-hero)] text-primary-foreground shadow-sm scale-105"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{i + 1}</span>
            </button>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)]">
        {/* browser chrome */}
        <div className="flex items-center gap-1.5 border-b border-border bg-secondary/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
          <span className="ml-3 truncate font-mono text-xs text-muted-foreground">
            {INSTALL_STEPS[active].code}
          </span>
        </div>

        {/* preview body — animated swap */}
        <div key={active} className="relative h-[320px] animate-in fade-in slide-in-from-bottom-2 duration-500">
          {active === 0 && <PreviewDownload />}
          {active === 1 && <PreviewUnzip />}
          {active === 2 && <PreviewExtensions />}
          {active === 3 && <PreviewLive />}
        </div>

        {/* footer with active label and progress bar */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ActiveIcon className="h-3.5 w-3.5 text-primary" />
              Paso {active + 1}: {INSTALL_STEPS[active].title}
            </div>
            <span className="font-mono text-muted-foreground">
              {String(active + 1).padStart(2, "0")} / 0{INSTALL_STEPS.length}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
            <div
              key={`bar-${active}-${paused}`}
              className="h-full bg-[image:var(--gradient-hero)]"
              style={{
                width: "100%",
                animation: paused ? "none" : "heroProgress 2.8s linear",
                transformOrigin: "left",
              }}
            />
          </div>
        </div>
      </div>

      <style>{`@keyframes heroProgress { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
    </div>
  );
}

function InstallShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % INSTALL_STEPS.length), 3500);
    return () => clearInterval(t);
  }, [paused]);

  const ActiveIcon = INSTALL_STEPS[active].icon;

  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Zap className="h-3 w-3 text-primary" /> Instalación en 4 pasos
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight">Listo en menos de 5 minutos</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Pasa el cursor por cada paso para ver la previsualización. La secuencia avanza sola.
          </p>
        </div>

        <div
          ref={wrapRef}
          className="grid gap-8 md:grid-cols-[1.1fr_1fr]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Steps list */}
          <ol className="space-y-3">
            {INSTALL_STEPS.map((s, i) => {
              const isActive = i === active;
              const isDone = i < active;
              const StepIcon = s.icon;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    aria-current={isActive ? "step" : undefined}
                    className={`group relative flex w-full items-start gap-4 overflow-hidden rounded-xl border p-5 text-left transition-all duration-300 ${
                      isActive
                        ? "border-primary/50 bg-card shadow-[var(--shadow-elegant)] scale-[1.02]"
                        : "border-border bg-card/60 hover:border-primary/30 hover:bg-card"
                    }`}
                  >
                    {/* progress glow bar */}
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 w-1 transition-all duration-500 ${
                        isActive ? "bg-[image:var(--gradient-hero)]" : isDone ? "bg-primary/40" : "bg-transparent"
                      }`}
                    />
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-all duration-300 ${
                        isActive
                          ? "bg-[image:var(--gradient-hero)] text-primary-foreground scale-110"
                          : isDone
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-xs ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                          0{s.n}
                        </span>
                        <h3 className="font-semibold">{s.title}</h3>
                      </div>
                      <p
                        className={`mt-1 text-sm transition-colors ${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {s.desc}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
            <li className="pt-2">
              <Link to="/instalacion">
                <Button variant="outline" className="w-full">
                  Ver guía completa con capturas →
                </Button>
              </Link>
            </li>
          </ol>

          {/* Live preview */}
          <div className="relative">
            <div className="sticky top-24 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)]">
              {/* browser chrome */}
              <div className="flex items-center gap-1.5 border-b border-border bg-secondary/50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                <span className="ml-3 truncate font-mono text-xs text-muted-foreground">
                  {INSTALL_STEPS[active].code}
                </span>
              </div>

              {/* preview body */}
              <div key={active} className="relative h-[280px] animate-in fade-in slide-in-from-bottom-2 duration-500">
                {active === 0 && <PreviewDownload />}
                {active === 1 && <PreviewUnzip />}
                {active === 2 && <PreviewExtensions />}
                {active === 3 && <PreviewLive />}
              </div>

              {/* progress dots */}
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ActiveIcon className="h-3.5 w-3.5 text-primary" />
                  Paso {active + 1} de {INSTALL_STEPS.length}
                </div>
                <div className="flex gap-1.5">
                  {INSTALL_STEPS.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActive(i)}
                      aria-label={`Ir al paso ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        i === active ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewDownload() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[image:var(--gradient-soft)] p-6">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-elegant)]">
        <Download className="h-7 w-7 animate-bounce" />
      </div>
      <div className="w-full max-w-xs">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>asistente-rayen.zip</span>
          <span>691 KB</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-full origin-left animate-[progress_2s_ease-out_infinite] bg-[image:var(--gradient-hero)]" />
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Descargando desde lovable.app…</p>
      <style>{`@keyframes progress{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}`}</style>
    </div>
  );
}

function PreviewUnzip() {
  return (
    <div className="flex h-full flex-col gap-2 p-5 font-mono text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <FolderArchive className="h-4 w-4 text-primary" /> C:\AsistenteRayen\
      </div>
      <div className="ml-2 space-y-1">
        {["manifest.json", "background.js", "content.css", "popup.html", "data/", "modules/", "..."].map((f, i) => (
          <div
            key={f}
            className="flex items-center gap-2 rounded px-2 py-1 text-foreground/80 animate-in fade-in slide-in-from-left-2"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" /> {f}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewExtensions() {
  return (
    <div className="h-full bg-secondary/30 p-4">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">Extensiones</div>
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-muted-foreground">Modo desarrollador</span>
        <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-primary px-0.5">
          <span className="h-4 w-4 translate-x-4 rounded-full bg-white shadow transition-transform" />
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary animate-pulse">
          Cargar descomprimida
        </span>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">Empaquetar</span>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">Actualizar</span>
      </div>
      <div className="mt-4 rounded-lg border border-primary/40 bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded bg-[image:var(--gradient-hero)] text-primary-foreground">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold">Vínculo</div>
            <div className="text-[10px] text-muted-foreground">v1.0.65 · Activo</div>
          </div>
          <span className="ml-auto inline-flex h-4 w-7 items-center rounded-full bg-primary px-0.5">
            <span className="h-3 w-3 translate-x-3 rounded-full bg-white" />
          </span>
        </div>
      </div>
    </div>
  );
}

function PreviewLive() {
  return (
    <div className="relative h-full bg-background p-4">
      <div className="space-y-2">
        {["Anamnesis", "Examen físico", "Indicaciones"].map((l) => (
          <div key={l} className="rounded-md border border-border bg-secondary/40 p-2.5">
            <div className="text-[10px] font-semibold text-muted-foreground">{l}</div>
            <div className="mt-1 h-1.5 w-3/4 rounded bg-muted" />
            <div className="mt-1 h-1.5 w-1/2 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-[image:var(--gradient-hero)] px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        <Zap className="h-4 w-4" /> Plantillas
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vínculo — Autocompletado clínico para Rayen APS" },
      {
        name: "description",
        content:
          "Extensión Chrome y panel de plantillas para acelerar el registro clínico en clinico.rayenaps.cl. Datos 100% locales.",
      },
      { property: "og:title", content: "Vínculo" },
      {
        property: "og:description",
        content: "Plantillas locales y autocompletado para Rayen APS — pensado por médicos, para médicos.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* HERO — Apple magichromatic */}
      <section className="relative overflow-hidden">
        {/* Iridescent ambient orbs */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-24 h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.88_0.12_320/0.55),transparent_70%)] blur-3xl" />
          <div className="absolute top-10 -right-24 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.88_0.12_260/0.5),transparent_70%)] blur-3xl" />
          <div className="absolute -bottom-40 left-1/4 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.92_0.08_360/0.45),transparent_70%)] blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-12 pb-12 text-center md:pt-16 md:pb-16">
          {/* Hero logo — transparent PNG, big presence */}
          <div className="relative mb-8 flex w-full items-center justify-center md:mb-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 mx-auto h-[20rem] w-[40rem] max-w-[100vw] rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.88_0.12_290/0.55),oklch(0.9_0.1_330/0.35)_45%,transparent_72%)] blur-3xl"
            />
            <img
              src={vinculoBanner.url}
              alt="Vínculo — Volver a mirarnos"
              className="w-full max-w-2xl select-none mix-blend-multiply motion-safe:animate-[fadeUp_900ms_ease-out_both]"
              draggable={false}
            />
          </div>
          <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }`}</style>

          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Beta v0.1
            <span className="text-border">·</span>
            CESFAM
          </div>


          {/* Headline */}
          <h1 className="max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight text-foreground md:text-7xl lg:text-[5.5rem]">
            Menos clicks.
            <span className="mt-1 block text-iridescent">Más tiempo para el paciente.</span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-7 max-w-2xl text-lg font-normal leading-relaxed text-muted-foreground md:text-xl">
            Extensión de Chrome para{" "}
            <code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.92em] text-foreground/90">
              clinico.rayenaps.cl
            </code>
            . Datos 100% locales, privacidad garantizada.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Link to="/descargar">
              <Button
                size="lg"
                className="h-12 rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_oklch(0.58_0.18_255/0.5)] transition-all hover:bg-primary/90 hover:shadow-[0_14px_36px_-10px_oklch(0.58_0.18_255/0.6)]"
              >
                <Download className="mr-2 h-4 w-4" /> Descargar extensión
              </Button>
            </Link>
            <Link to="/instalacion">
              <Button
                size="lg"
                variant="ghost"
                className="h-12 rounded-full px-7 text-base font-semibold text-primary hover:bg-primary/5"
              >
                Cómo instalar →
              </Button>
            </Link>
          </div>

          {/* Mockup */}
          <div className="relative mt-16 w-full max-w-4xl">
            <div
              aria-hidden
              className="absolute -inset-2 rounded-[2rem] bg-[image:var(--gradient-iridescent)] opacity-20 blur-2xl"
            />
            <div className="relative">
              <HeroInstallShowcase />
            </div>
          </div>

          <p className="mt-10 text-sm text-muted-foreground">
            Pasa el cursor sobre la previsualización para pausar.
          </p>
        </div>
      </section>

      <InstallShowcase />

      {/* FEATURES */}
      <section className="relative mx-auto max-w-6xl px-4 py-24 md:py-32">
        <div className="text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">¿Qué hace por ti?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Pensado para médicos de APS. Captura un formulario una vez, reutilízalo para siempre.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Wand2,
              title: "Autocompleta formularios",
              desc: "Llena con un click signos vitales, anamnesis, examen físico, indicaciones y diagnósticos.",
            },
            {
              icon: Keyboard,
              title: "Atajo Ctrl+Shift+Espacio",
              desc: "Selector rápido tipo Spotlight: busca y aplica la plantilla sin sacar las manos del teclado.",
            },
            {
              icon: Database,
              title: "Capturar formulario",
              desc: "Llena un formulario una vez, presiona “Guardar plantilla” y la extensión aprende los selectores sola.",
            },
            {
              icon: ShieldCheck,
              title: "100% local",
              desc: "Las plantillas viven en chrome.storage.local. Cero red, cero datos clínicos fuera del equipo.",
            },
            {
              icon: Download,
              title: "Importar / Exportar JSON",
              desc: "Comparte un set base entre todos los PCs del CESFAM con un archivo JSON.",
            },
            {
              icon: Zap,
              title: "Sin OCR ni magia frágil",
              desc: "Lee el DOM directamente, mucho más confiable que reconocer pantalla.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border/70 bg-card p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-elegant)]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden border-t border-border/60">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute -top-32 left-1/2 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,oklch(0.9_0.1_280/0.5),transparent_70%)] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center md:py-28">
          <h2 className="text-4xl font-bold tracking-tight md:text-6xl">
            ¿Listo para <span className="text-iridescent">probarla</span>?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Descarga la extensión, sigue la guía de 5 minutos y empieza a ahorrar tiempo en cada consulta.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/descargar">
              <Button
                size="lg"
                className="h-12 rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_oklch(0.58_0.18_255/0.5)] hover:bg-primary/90"
              >
                <Download className="mr-2 h-4 w-4" /> Descargar
              </Button>
            </Link>
            <Link to="/biblioteca">
              <Button
                size="lg"
                variant="ghost"
                className="h-12 rounded-full px-7 text-base font-semibold text-primary hover:bg-primary/5"
              >
                Ver biblioteca →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
