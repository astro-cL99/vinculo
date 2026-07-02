import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, MessageSquare, Tag, BarChart3, LogOut, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard interno — Vínculo" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DashboardPage,
});

type Feedback = {
  id: string;
  created_at: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  ext_version: string | null;
  ruleset_composite: string | null;
  role: string | null;
  status: string;
  admin_notes: string | null;
};

type Changelog = { id: string; version: string; semver_type: string; summary: string; published_at: string };
type AuditRow = {
  id: string;
  created_at: string;
  event_type: string;
  source: string;
  rule_id: string | null;
  patient_hash: string | null;
  ruleset_composite: string | null;
  ext_version: string | null;
  evidence: Record<string, unknown>;
};

const SEVERITY_CLS: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
  med: "bg-yellow-500/15 text-yellow-800 border-yellow-500/30 dark:text-yellow-300",
  low: "bg-muted text-muted-foreground",
};
const STATUSES = ["new", "triaged", "in_progress", "done", "wontfix"] as const;

function DashboardPage() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Feedback[]>([]);
  const [releases, setReleases] = useState<Changelog[]>([]);
  const [filter, setFilter] = useState({ status: "all", type: "all", severity: "all" });
  const [busy, setBusy] = useState(false);
  const [pubSummary, setPubSummary] = useState("");
  const [pubType, setPubType] = useState<"major" | "minor" | "patch">("minor");
  const [pubFeedback, setPubFeedback] = useState<Set<string>>(new Set());
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditFilter, setAuditFilter] = useState({ source: "all", event: "all", q: "" });

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
  }, [isAdmin]);

  async function refresh() {
    const [{ data: f }, { data: c }, { data: a }] = await Promise.all([
      supabase.from("feedback").select("*").order("created_at", { ascending: false }),
      supabase.from("changelog_entries").select("*").order("published_at", { ascending: false }),
      supabase.from("clinical_audit").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    setItems((f as Feedback[]) ?? []);
    setReleases((c as Changelog[]) ?? []);
    setAudit((a as AuditRow[]) ?? []);
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("feedback").update({ status }).eq("id", id);
    refresh();
  }
  async function updateNotes(id: string, admin_notes: string) {
    await supabase.from("feedback").update({ admin_notes }).eq("id", id);
  }

  async function publish() {
    if (!pubSummary.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("publish_changelog", {
      _semver_type: pubType,
      _summary: pubSummary.trim(),
      _feedback_ids: Array.from(pubFeedback),
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setPubSummary(""); setPubFeedback(new Set());
    alert(`✓ Release publicado: v${(data as { version: string }[])?.[0]?.version}`);
    refresh();
  }

  const filtered = useMemo(() => items.filter((i) =>
    (filter.status === "all" || i.status === filter.status) &&
    (filter.type === "all" || i.type === filter.type) &&
    (filter.severity === "all" || i.severity === filter.severity)
  ), [items, filter]);

  function auditMatch(r: AuditRow) {
    if (auditFilter.source !== "all" && r.source !== auditFilter.source) return false;
    if (auditFilter.event !== "all" && r.event_type !== auditFilter.event) return false;
    const q = auditFilter.q.trim().toLowerCase();
    if (!q) return true;
    return [r.rule_id, r.patient_hash, r.ruleset_composite, r.ext_version, JSON.stringify(r.evidence)]
      .some((v) => (v || "").toString().toLowerCase().includes(q));
  }

  const metrics = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byVersion: Record<string, number> = {};
    items.forEach((i) => {
      byStatus[i.status] = (byStatus[i.status] || 0) + 1;
      byType[i.type] = (byType[i.type] || 0) + 1;
      if (i.ext_version) byVersion[i.ext_version] = (byVersion[i.ext_version] || 0) + 1;
    });
    return { byStatus, byType, byVersion, total: items.length, open: items.filter((i) => i.status !== "done" && i.status !== "wontfix").length };
  }, [items]);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Cargando…</div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
          <Card className="p-6 text-center">
            <h1 className="mb-2 text-xl font-bold">Acceso no autorizado</h1>
            <p className="mb-4 text-sm text-muted-foreground">Tu cuenta no tiene rol <code>admin</code>. Solicita acceso al equipo Vínculo.</p>
            <Button variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const candidatesForRelease = items.filter((i) => i.status === "done" || i.status === "in_progress");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Dashboard interno</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>

        <Tabs defaultValue="feedback">
          <TabsList>
            <TabsTrigger value="feedback"><MessageSquare className="mr-2 h-4 w-4" />Feedback</TabsTrigger>
            <TabsTrigger value="releases"><Tag className="mr-2 h-4 w-4" />Releases</TabsTrigger>
            <TabsTrigger value="audit"><ShieldCheck className="mr-2 h-4 w-4" />Auditoría</TabsTrigger>
            <TabsTrigger value="metrics"><BarChart3 className="mr-2 h-4 w-4" />Métricas</TabsTrigger>
          </TabsList>

          <TabsContent value="feedback" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filter.type} onValueChange={(v) => setFilter({ ...filter, type: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {["bug","idea","usability","clinical","performance","other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filter.severity} onValueChange={(v) => setFilter({ ...filter, severity: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las severidades</SelectItem>
                  {["critical","high","med","low"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 && <Card className="p-6 text-center text-muted-foreground">Sin feedback con estos filtros.</Card>}
            {filtered.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={SEVERITY_CLS[f.severity]}>{f.severity}</Badge>
                    <Badge variant="secondary">{f.type}</Badge>
                    <span className="font-medium">{f.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString("es-CL")}</span>
                </div>
                <p className="mb-2 whitespace-pre-wrap text-sm text-muted-foreground">{f.description}</p>
                <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {f.ext_version && <span>ext <code>{f.ext_version}</code></span>}
                  {f.ruleset_composite && <span>ruleset <code>{f.ruleset_composite}</code></span>}
                  {f.role && <span>rol <code>{f.role}</code></span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={f.status} onValueChange={(v) => updateStatus(f.id, v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder="Notas internas (no se publican)…"
                    defaultValue={f.admin_notes || ""}
                    onBlur={(e) => updateNotes(f.id, e.target.value)}
                    rows={1}
                    className="flex-1 min-h-[40px]"
                  />
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="releases" className="mt-4 space-y-4">
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">Publicar nuevo release</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Select value={pubType} onValueChange={(v) => setPubType(v as "major" | "minor" | "patch")}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="major">major</SelectItem>
                      <SelectItem value="minor">minor</SelectItem>
                      <SelectItem value="patch">patch</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea placeholder="Resumen del release…" value={pubSummary} onChange={(e) => setPubSummary(e.target.value)} rows={2} />
                </div>
                {candidatesForRelease.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Incluir feedbacks ({pubFeedback.size}/{candidatesForRelease.length})</summary>
                    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2">
                      {candidatesForRelease.map((f) => (
                        <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={pubFeedback.has(f.id)}
                            onChange={(e) => {
                              const next = new Set(pubFeedback);
                              if (e.target.checked) next.add(f.id); else next.delete(f.id);
                              setPubFeedback(next);
                            }}
                          />
                          <span className="text-xs"><Badge variant="secondary" className="mr-1">{f.type}</Badge>{f.title}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                )}
                <Button onClick={publish} disabled={busy || !pubSummary.trim()}>
                  {busy ? "Publicando…" : "Publicar release"}
                </Button>
              </div>
            </Card>
            <h3 className="font-semibold">Releases publicados</h3>
            {releases.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">v{r.version}</span>
                    <Badge variant="outline">{r.semver_type}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(r.published_at).toLocaleString("es-CL")}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>
              </Card>
            ))}
            <Link to="/changelog" className="text-sm text-primary hover:underline">Ver changelog público →</Link>
          </TabsContent>

          <TabsContent value="audit" className="mt-4 space-y-4">
            <Card className="border-yellow-500/40 bg-yellow-500/5 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Registro <strong>append-only</strong> de
              sugerencias clínicas mostradas por la extensión. Inmutable a nivel de base de datos
              (incluye timestamp UTC, ruleset_hash, evidencia mostrada y hash anónimo de paciente).
              Mostrando últimas 500.
            </Card>
            <div className="flex flex-wrap gap-2">
              <Select value={auditFilter.source} onValueChange={(v) => setAuditFilter({ ...auditFilter, source: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda fuente</SelectItem>
                  {["ges","lab","consultor","interactions","peds","dx-suggest","arsenal","farmacia","other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={auditFilter.event} onValueChange={(v) => setAuditFilter({ ...auditFilter, event: v })}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo evento</SelectItem>
                  {["suggestion_shown","suggestion_accepted","suggestion_dismissed","ai_consult","lab_critical_shown","ges_alert_shown"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <input
                type="text"
                placeholder="Buscar (rule_id, hash, ruleset)…"
                value={auditFilter.q}
                onChange={(e) => setAuditFilter({ ...auditFilter, q: e.target.value })}
                className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rows = audit.filter(auditMatch);
                  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `clinical_audit_${new Date().toISOString().slice(0,10)}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >Exportar JSON</Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-2 py-1.5">Timestamp UTC</th>
                    <th className="px-2 py-1.5">Evento</th>
                    <th className="px-2 py-1.5">Fuente</th>
                    <th className="px-2 py-1.5">Rule ID</th>
                    <th className="px-2 py-1.5">Paciente (hash)</th>
                    <th className="px-2 py-1.5">Ruleset</th>
                    <th className="px-2 py-1.5">Ext</th>
                    <th className="px-2 py-1.5">Evidencia</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.filter(auditMatch).map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-2 py-1.5 font-mono">{new Date(r.created_at).toISOString().replace("T"," ").slice(0,19)}</td>
                      <td className="px-2 py-1.5"><Badge variant="secondary">{r.event_type}</Badge></td>
                      <td className="px-2 py-1.5"><Badge variant="outline">{r.source}</Badge></td>
                      <td className="px-2 py-1.5 font-mono">{r.rule_id || "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.patient_hash ? r.patient_hash.slice(0,10)+"…" : "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.ruleset_composite || "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.ext_version || "—"}</td>
                      <td className="max-w-md px-2 py-1.5">
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">ver</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(r.evidence, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audit.filter(auditMatch).length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">Sin registros con estos filtros.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="mt-4 grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Total feedback</p>
              <p className="text-3xl font-bold">{metrics.total}</p>
              <p className="text-xs text-muted-foreground mt-1">{metrics.open} abiertos</p>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-xs uppercase text-muted-foreground">Por estado</p>
              {Object.entries(metrics.byStatus).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v}</span></div>
              ))}
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-xs uppercase text-muted-foreground">Por tipo</p>
              {Object.entries(metrics.byType).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v}</span></div>
              ))}
            </Card>
            <Card className="p-4 md:col-span-3">
              <p className="mb-2 text-xs uppercase text-muted-foreground">Versiones reportantes</p>
              {Object.entries(metrics.byVersion).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm"><code>{k}</code><span className="font-mono">{v}</span></div>
              ))}
              {Object.keys(metrics.byVersion).length === 0 && <p className="text-sm text-muted-foreground">Sin datos.</p>}
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
