import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import vinculoLogo from "@/assets/vinculo-logo.jpg.asset.json";

export function SiteHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const { isAdmin } = useAuth();
  const baseLinks = [
    { to: "/", label: "Inicio" },
    { to: "/descargar", label: "Descargar" },
    { to: "/biblioteca", label: "Biblioteca" },
    { to: "/instalacion", label: "Instalación" },
    { to: "/changelog", label: "Changelog" },
    { to: "/sugerencias", label: "Sugerencias" },
    { to: "/terminos", label: "Términos" },
  ] as const;
  const adminLinks = [{ to: "/dashboard", label: "Dashboard" }] as const;
  const links = isAdmin ? [...baseLinks, ...adminLinks] : baseLinks;
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-lg bg-white">
            <img src={vinculoLogo.url} alt="Vínculo" className="h-6 w-6 object-contain" />
          </span>
          <span>Vínculo App</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <nav className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {links.map((l) => {
              const active = pathname === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-8 text-sm text-muted-foreground">
        <p className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-foreground/80">
          ⚠️ <strong>Vínculo es una herramienta de apoyo.</strong> La IA{" "}
          <strong>no diagnostica</strong>; la decisión clínica final es{" "}
          <strong>responsabilidad del profesional tratante</strong>.
        </p>
        <p>
          Las plantillas se guardan localmente en cada equipo, sin envío de datos a la nube.{" "}
          <Link to="/terminos" className="underline hover:text-foreground">
            Términos
          </Link>
          {" · "}
          <Link to="/privacidad" className="underline hover:text-foreground">
            Política de Privacidad
          </Link>
          .
        </p>

      </div>
    </footer>
  );
}
