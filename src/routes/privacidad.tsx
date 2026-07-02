import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRIVACY_MD, PRIVACY_VERSION } from "@/lib/legal-docs";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de Privacidad — Vínculo" },
      {
        name: "description",
        content:
          "Política de Privacidad pública de Vínculo. Cumplimiento Ley 19.628 y Ley 21.719 sobre protección de datos personales y datos sensibles de salud.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: PrivacyPage,
});

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function inline(s: string) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

function renderMd(src: string) {
  const lines = src.split("\n");
  const out: string[] = [];
  let inTable = false;
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (/^# /.test(line)) {
      out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (/^## /.test(line)) {
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split("|").map((c) => escapeHtml(c.trim()));
      const next = lines[i + 1] || "";
      const isSep = /^\|\s*[-:|\s]+\|$/.test(next);
      if (!inTable) {
        out.push("<table><thead><tr>");
        cells.forEach((c) => out.push(`<th>${c}</th>`));
        out.push("</tr></thead><tbody>");
        inTable = true;
        if (isSep) i++;
      } else {
        out.push("<tr>");
        cells.forEach((c) => out.push(`<td>${c}</td>`));
        out.push("</tr>");
      }
      continue;
    } else if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
    if (/^[-*] /.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    } else if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (line === "") {
      out.push("");
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inTable) out.push("</tbody></table>");
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function PrivacyPage() {
  const html = renderMd(PRIVACY_MD);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Política de Privacidad</h1>
          <Badge variant="outline">v{PRIVACY_VERSION}</Badge>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Este es el texto público de la política. Para registrar tu aceptación versionada como
          profesional, ingresa a{" "}
          <Link to="/terminos" className="underline hover:text-foreground">
            Términos y Privacidad
          </Link>
          .
        </p>
        <Card className="p-6">
          <div
            className="prose prose-sm max-w-none dark:prose-invert prose-headings:tracking-tight"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Card>
        <p className="mt-6 text-xs text-muted-foreground">
          Solicitudes ARCO (acceso, rectificación, cancelación, oposición) y portabilidad de datos:
          a través del formulario de{" "}
          <Link to="/sugerencias" className="underline hover:text-foreground">
            contacto
          </Link>
          . Plazo de respuesta: hasta 30 días corridos.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
