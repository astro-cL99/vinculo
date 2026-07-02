import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { TERMS_MD, PRIVACY_MD, TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal-docs";
import { CheckCircle2, ShieldAlert, FileText } from "lucide-react";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos de uso y Privacidad — Vínculo" },
      {
        name: "description",
        content:
          "Términos de uso y política de privacidad versionados de Vínculo. Cumplimiento Ley 19.628 y 21.719.",
      },
    ],
  }),
  component: TermsPage,
});

type Acceptance = { doc_type: "terms" | "privacy"; doc_version: string; accepted_at: string };

// Renderiza un markdown muy simple (h1/h2, listas, tablas, párrafos, énfasis).
function MD({ src }: { src: string }) {
  const html = useMemo(() => renderMd(src), [src]);
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert prose-headings:tracking-tight"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function renderMd(src: string) {
  const lines = src.split("\n");
  const out: string[] = [];
  let inTable = false;
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
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

function inline(s: string) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

function TermsPage() {
  const { user, loading } = useAuth();
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("terms_acceptances")
        .select("doc_type, doc_version, accepted_at")
        .eq("user_id", user.id);
      setAcceptances((data as Acceptance[]) ?? []);
    })();
  }, [user]);

  const acceptedTerms = acceptances.find(
    (a) => a.doc_type === "terms" && a.doc_version === TERMS_VERSION,
  );
  const acceptedPrivacy = acceptances.find(
    (a) => a.doc_type === "privacy" && a.doc_version === PRIVACY_VERSION,
  );
  const upToDate = acceptedTerms && acceptedPrivacy;

  async function accept() {
    if (!user || !agree) return;
    setBusy(true);
    setMsg(null);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const rows = [
      { user_id: user.id, doc_type: "terms", doc_version: TERMS_VERSION, user_agent: ua },
      { user_id: user.id, doc_type: "privacy", doc_version: PRIVACY_VERSION, user_agent: ua },
    ];
    const { error } = await supabase.from("terms_acceptances").upsert(rows, {
      onConflict: "user_id,doc_type,doc_version",
      ignoreDuplicates: true,
    });
    setBusy(false);
    if (error) {
      setMsg("Error: " + error.message);
      return;
    }
    setMsg("✓ Aceptación registrada. Gracias.");
    const { data } = await supabase
      .from("terms_acceptances")
      .select("doc_type, doc_version, accepted_at")
      .eq("user_id", user.id);
    setAcceptances((data as Acceptance[]) ?? []);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Términos y Privacidad</h1>
        </div>

        <Card className="mb-6 border-yellow-500/40 bg-yellow-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-yellow-700 dark:text-yellow-400" />
            <p className="text-sm">
              <strong>Aviso clínico permanente:</strong> Vínculo es una herramienta de
              apoyo. <strong>La IA no diagnostica</strong>; las sugerencias deben ser
              contrastadas y la <strong>decisión clínica final es del profesional tratante</strong>.
            </p>
          </div>
        </Card>

        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">Términos v{TERMS_VERSION}</Badge>
          <Badge variant="outline">Privacidad v{PRIVACY_VERSION}</Badge>
          {!loading && user && upToDate && (
            <Badge className="bg-green-600 text-white">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Aceptados al día
            </Badge>
          )}
          {!loading && user && !upToDate && (
            <Badge variant="destructive">Aceptación pendiente</Badge>
          )}
        </div>

        <Tabs defaultValue="terms" className="mb-6">
          <TabsList>
            <TabsTrigger value="terms">Términos</TabsTrigger>
            <TabsTrigger value="privacy">Privacidad</TabsTrigger>
          </TabsList>
          <TabsContent value="terms">
            <Card className="p-6">
              <MD src={TERMS_MD} />
            </Card>
          </TabsContent>
          <TabsContent value="privacy">
            <Card className="p-6">
              <MD src={PRIVACY_MD} />
            </Card>
          </TabsContent>
        </Tabs>

        {!loading && !user && (
          <Card className="p-6 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              Para registrar tu aceptación versionada (auditoría legal) necesitas iniciar sesión
              como profesional.
            </p>
            <Button asChild>
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </Card>
        )}

        {!loading && user && !upToDate && (
          <Card className="p-6">
            <h2 className="mb-3 font-semibold">Aceptar la versión vigente</h2>
            <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={agree}
                onCheckedChange={(v) => setAgree(v === true)}
                className="mt-0.5"
              />
              <span>
                He leído y acepto los Términos de uso (v{TERMS_VERSION}) y la Política de
                Privacidad (v{PRIVACY_VERSION}). Entiendo que la IA es una herramienta de
                apoyo y que la decisión clínica final es de mi responsabilidad como profesional.
              </span>
            </label>
            <Button onClick={accept} disabled={!agree || busy}>
              {busy ? "Registrando…" : "Aceptar y registrar"}
            </Button>
            {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
          </Card>
        )}

        {!loading && user && upToDate && (
          <Card className="p-4 text-sm text-muted-foreground">
            Aceptaste los términos vigentes el{" "}
            <strong>{new Date(acceptedTerms!.accepted_at).toLocaleString("es-CL")}</strong> y la
            política de privacidad el{" "}
            <strong>{new Date(acceptedPrivacy!.accepted_at).toLocaleString("es-CL")}</strong>.
          </Card>
        )}

        {acceptances.length > 0 && (
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Historial de aceptaciones ({acceptances.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {acceptances
                .slice()
                .sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))
                .map((a, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground">
                    {a.doc_type} v{a.doc_version} —{" "}
                    {new Date(a.accepted_at).toLocaleString("es-CL")}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
