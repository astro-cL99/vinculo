import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Sparkles, Wrench, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog público — Vínculo" },
      { name: "description", content: "Historial de versiones del Vínculo con semver y mejoras visibles para el equipo CESFAM." },
      { property: "og:title", content: "Changelog público — Vínculo" },
      { property: "og:description", content: "Cada release con su tipo de cambio (major/minor/patch), resumen y feedbacks asociados." },
    ],
  }),
  component: ChangelogPage,
});

type Entry = {
  id: string;
  version: string;
  semver_type: "major" | "minor" | "patch";
  summary: string;
  published_at: string;
};
type Item = {
  changelog_id: string;
  feedback: { id: string; title: string; type: string; severity: string } | null;
};

const TYPE_META: Record<string, { Icon: typeof GitBranch; cls: string; label: string }> = {
  major: { Icon: AlertTriangle, cls: "bg-destructive/10 text-destructive border-destructive/30", label: "Major" },
  minor: { Icon: Sparkles, cls: "bg-primary/10 text-primary border-primary/30", label: "Minor" },
  patch: { Icon: Wrench, cls: "bg-muted text-muted-foreground border-border", label: "Patch" },
};

function ChangelogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [items, setItems] = useState<Record<string, Item["feedback"][]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: e } = await supabase.from("changelog_entries").select("*").order("published_at", { ascending: false });
      setEntries((e as Entry[]) ?? []);
      const { data: i } = await supabase.from("changelog_items").select("changelog_id, feedback:feedback_id(id,title,type,severity)");
      const grouped: Record<string, Item["feedback"][]> = {};
      ((i as unknown as Item[]) ?? []).forEach((row) => {
        if (!grouped[row.changelog_id]) grouped[row.changelog_id] = [];
        if (row.feedback) grouped[row.changelog_id].push(row.feedback);
      });
      setItems(grouped);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <GitBranch className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Changelog</h1>
        </div>
        <p className="mb-8 text-muted-foreground">
          Versiones publicadas del Vínculo siguiendo <strong>semver</strong>. Las versiones se numeran como <code>MAJOR.MINOR.PATCH</code> y se publican automáticamente desde el dashboard interno cuando se cierran feedbacks.
        </p>
        {loading && <p className="text-muted-foreground">Cargando…</p>}
        {!loading && entries.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">Aún no hay releases publicados.</Card>
        )}
        <div className="space-y-4">
          {entries.map((e) => {
            const m = TYPE_META[e.semver_type];
            const linked = items[e.id] ?? [];
            return (
              <Card key={e.id} className="p-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold">v{e.version}</span>
                    <Badge variant="outline" className={m.cls}>
                      <m.Icon className="mr-1 h-3 w-3" />
                      {m.label}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(e.published_at).toLocaleDateString("es-CL")}</span>
                </div>
                <p className="text-sm">{e.summary}</p>
                {linked.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Incluye {linked.length} feedback{linked.length === 1 ? "" : "s"}:</p>
                    <ul className="space-y-1 text-xs">
                      {linked.map((f) => f && (
                        <li key={f.id} className="text-muted-foreground">
                          <span className="mr-1 font-mono uppercase text-foreground/70">[{f.type}]</span>
                          {f.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
