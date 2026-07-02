import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Plus, Trash2, Download, Upload, FileJson, FlaskConical, Copy, Bell } from "lucide-react";
import type { Template, TemplateField, TemplateBundle } from "@/lib/templates";
import { downloadJson } from "@/lib/download";
import { ANALYTE_DICT, ANALYTE_KEYS } from "@/lib/lab-analytes";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor de plantillas — Vínculo" },
      {
        name: "description",
        content: "Crea, edita y exporta plantillas de autocompletado para Rayen APS.",
      },
    ],
  }),
  component: EditorPage,
});

function newField(): TemplateField {
  return { selector: "", type: "text", label: "", value: "" };
}
function newTemplate(): Template {
  return {
    id: crypto.randomUUID(),
    name: "Nueva plantilla",
    description: "",
    fields: [newField()],
  };
}

function EditorPage() {
  const [templates, setTemplates] = useState<Template[]>([newTemplate()]);
  const [activeId, setActiveId] = useState(templates[0].id);
  const active = templates.find((t) => t.id === activeId) ?? templates[0];

  function update(id: string, patch: Partial<Template>) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  function updateField(tid: string, idx: number, patch: Partial<TemplateField>) {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === tid
          ? { ...t, fields: t.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) }
          : t,
      ),
    );
  }
  function addField(tid: string) {
    setTemplates((prev) =>
      prev.map((t) => (t.id === tid ? { ...t, fields: [...t.fields, newField()] } : t)),
    );
  }
  function removeField(tid: string, idx: number) {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === tid ? { ...t, fields: t.fields.filter((_, i) => i !== idx) } : t,
      ),
    );
  }
  function addTemplate() {
    const t = newTemplate();
    setTemplates((p) => [...p, t]);
    setActiveId(t.id);
  }
  function removeTemplate(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    setTemplates((p) => {
      const next = p.filter((t) => t.id !== id);
      if (next.length === 0) {
        const blank = newTemplate();
        setActiveId(blank.id);
        return [blank];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function onExport() {
    const bundle: TemplateBundle = {
      name: "Plantillas Vínculo",
      version: 1,
      exportedAt: new Date().toISOString().slice(0, 10),
      templates,
    };
    downloadJson(bundle, `plantillas-${new Date().toISOString().slice(0, 10)}.json`);
  }
  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as TemplateBundle | Template[];
      const incoming = Array.isArray(parsed) ? parsed : parsed.templates;
      if (!Array.isArray(incoming)) throw new Error("Formato inválido");
      const normalized = incoming.map((t) => ({
        id: t.id || crypto.randomUUID(),
        name: t.name || "Sin nombre",
        description: t.description || "",
        fields: Array.isArray(t.fields) ? t.fields : [],
      }));
      setTemplates(normalized.length ? normalized : [newTemplate()]);
      setActiveId(normalized[0]?.id ?? newTemplate().id);
    } catch (err) {
      alert("No se pudo importar: " + (err as Error).message);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Editor de plantillas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Construye plantillas, exporta a JSON e impórtalas en la extensión.
            </p>
          </div>
          <div className="flex gap-2">
            <label>
              <input type="file" accept="application/json" onChange={onImport} className="hidden" />
              <Button variant="outline" asChild>
                <span><Upload className="mr-2 h-4 w-4" /> Importar JSON</span>
              </Button>
            </label>
            <Button onClick={onExport} className="bg-[image:var(--gradient-hero)]">
              <Download className="mr-2 h-4 w-4" /> Exportar JSON
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Plantillas ({templates.length})
              </span>
              <Button size="sm" variant="ghost" onClick={addTemplate}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      t.id === activeId
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <span className="truncate">{t.name || "Sin nombre"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{t.fields.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-3">
                <div>
                  <Label htmlFor="tpl-name">Nombre</Label>
                  <Input
                    id="tpl-name"
                    value={active.name}
                    onChange={(e) => update(active.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="tpl-desc">Descripción</Label>
                  <Input
                    id="tpl-desc"
                    value={active.description ?? ""}
                    onChange={(e) => update(active.id, { description: e.target.value })}
                  />
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeTemplate(active.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Campos ({active.fields.length})</h3>
                <Button size="sm" variant="outline" onClick={() => addField(active.id)}>
                  <Plus className="mr-1 h-4 w-4" /> Añadir campo
                </Button>
              </div>

              <div className="mt-3 space-y-3">
                {active.fields.map((f, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-secondary/30 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Campo #{idx + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeField(active.id, idx)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <div>
                        <Label className="text-xs">Etiqueta</Label>
                        <Input
                          value={f.label}
                          placeholder="Ej: Presión sistólica"
                          onChange={(e) => updateField(active.id, idx, { label: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                          value={f.type}
                          onChange={(e) => updateField(active.id, idx, { type: e.target.value })}
                        >
                          {["text", "textarea", "number", "select-one", "checkbox", "radio"].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs">Selector CSS</Label>
                      <Input
                        value={f.selector}
                        placeholder="input[name='presionSistolica']"
                        onChange={(e) => updateField(active.id, idx, { selector: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs">Valor</Label>
                      {f.type === "textarea" ? (
                        <Textarea
                          rows={3}
                          value={String(f.value ?? "")}
                          onChange={(e) => updateField(active.id, idx, { value: e.target.value })}
                        />
                      ) : f.type === "checkbox" ? (
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                          value={f.value ? "true" : "false"}
                          onChange={(e) =>
                            updateField(active.id, idx, { value: e.target.value === "true" })
                          }
                        >
                          <option value="true">marcado</option>
                          <option value="false">desmarcado</option>
                        </select>
                      ) : (
                        <Input
                          value={String(f.value ?? "")}
                          onChange={(e) => updateField(active.id, idx, { value: e.target.value })}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-lg border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  <strong className="text-foreground">Tip:</strong> en lugar de escribir selectores
                  manualmente, lo más rápido es usar el modo <em>Capturar formulario</em> dentro de
                  Rayen — la extensión detecta selectores automáticamente.
                </p>
              </div>
            </div>

            <PlaceholdersPanel />
            <ConditionalsPanel />
            <RemindersInfoPanel />
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function PlaceholdersPanel() {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(token: string) {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 1200);
    });
  }
  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Placeholders de laboratorio</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Pega cualquier token dentro del valor de un campo (ej. en una anamnesis). Cuando el médico
        aplique la plantilla en Rayen tras pulsar <b>🧪 Lab</b>, los tokens se reemplazan con los
        valores reales del paciente. Si falta un examen aparece <code>[?nombre?]</code> para
        revisión.
      </p>
      <div className="mt-3 grid max-h-72 gap-1.5 overflow-auto pr-1">
        {ANALYTE_KEYS.map((k) => {
          const token = `{{lab.${k}}}`;
          const isCopied = copied === token;
          return (
            <button
              key={k}
              type="button"
              onClick={() => copy(token)}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-left text-xs hover:bg-secondary"
            >
              <span className="font-mono">{token}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span>{ANALYTE_DICT[k].label}</span>
                {isCopied ? (
                  <span className="text-primary">✓ copiado</span>
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Variantes: <code>.value</code> · <code>.unit</code> · <code>.fecha</code> ·{" "}
        <code>.range</code>. Ejemplo:{" "}
        <code className="font-mono">
          HbA1c {`{{lab.hba1c.value}} {{lab.hba1c.unit}}`} ({`{{lab.hba1c.fecha}}`})
        </code>
        .
      </p>
    </div>
  );
}

function ConditionalsPanel() {
  const examples: { title: string; code: string; explain: string }[] = [
    {
      title: "Control glicémico según HbA1c",
      explain: "Adapta la indicación al nivel de control metabólico.",
      code: `{{if lab.hba1c.value >= 9}}Mal control severo (HbA1c {{lab.hba1c.value}}%). Reforzar adherencia, intensificar tratamiento.{{elseif lab.hba1c.value >= 7}}Control insuficiente (HbA1c {{lab.hba1c.value}}%). Ajustar terapia.{{else}}Buen control glicémico (HbA1c {{lab.hba1c.value}}%). Mantener conducta.{{/if}}`,
    },
    {
      title: "Dislipidemia mixta",
      explain: "Operadores && y ||. Combina varios analitos.",
      code: `{{if lab.ldl.value > 100 && lab.hdl.value < 40}}Dislipidemia aterogénica (LDL {{lab.ldl.value}}, HDL {{lab.hdl.value}}). Iniciar estatina.{{/if}}`,
    },
    {
      title: "Pedir exámenes faltantes",
      explain: "missing() detecta analitos no presentes en el lab actual.",
      code: `{{if missing(lab.creatinina)}}Solicitar creatinina y VFG.{{/if}}{{if missing(lab.hba1c)}}Solicitar HbA1c.{{/if}}`,
    },
    {
      title: "Función renal",
      explain: "Comparación numérica directa.",
      code: `{{if lab.vfg.value < 60}}ERC: VFG {{lab.vfg.value}} mL/min — evaluar etapa y derivar.{{else}}Función renal conservada (VFG {{lab.vfg.value}}).{{/if}}`,
    },
    {
      title: "Anidamiento",
      explain: "Un {{if}} dentro de otro {{if}}.",
      code: `{{if lab.hba1c.value > 7}}DM mal controlada{{if lab.ldl.value > 100}} + dislipidemia{{/if}}.{{else}}DM compensada.{{/if}}`,
    },
  ];

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Plantillas inteligentes — condicionales</h3>
        <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          Nuevo · v0.5
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Usa <code>{`{{if cond}}...{{elseif cond}}...{{else}}...{{/if}}`}</code> para que la
        indicación se adapte al laboratorio del paciente. Soporta operadores{" "}
        <code>{`>`}</code> <code>{`>=`}</code> <code>{`<`}</code> <code>{`<=`}</code>{" "}
        <code>{`==`}</code> <code>{`!=`}</code> <code>{`&&`}</code> <code>{`||`}</code>{" "}
        <code>{`!`}</code>, y funciones <code>present(lab.x)</code>,{" "}
        <code>missing(lab.x)</code>, <code>num(lab.x)</code>.
      </p>

      <div className="mt-3 space-y-3">
        {examples.map((ex) => (
          <ConditionalExample key={ex.title} {...ex} />
        ))}
      </div>

      <div className="mt-4 rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Cómo funciona:</strong> al aplicar la plantilla en
        Rayen tras pulsar 🧪 Lab, la extensión evalúa cada condición con los valores reales del
        paciente y deja sólo el bloque que corresponde. Si una expresión es inválida, el bloque
        completo queda vacío y se registra el error en la consola (modo 🐞).
      </div>
    </div>
  );
}

function ConditionalExample({ title, code, explain }: { title: string; code: string; explain: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{explain}</div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
        >
          {copied ? "✓ copiado" : <><Copy className="h-3 w-3" /> copiar</>}
        </button>
      </div>
      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

const REMINDER_RULES_DOC: { id: string; label: string; category: string; severity: string; windowMonths: number; hint?: string }[] = [
  { id: "dm2_fondo_ojo", label: "Fondo de ojo", category: "DM2", severity: "warn", windowMonths: 24, hint: "Norma MINSAL: control oftalmológico cada 2 años (vigencia GES si fondo de ojo negativo)." },
  { id: "dm2_pie_diabetico", label: "Evaluación pie diabético", category: "DM2", severity: "warn", windowMonths: 12, hint: "Examen anual de pie." },
  { id: "dm2_hba1c", label: "HbA1c", category: "DM2", severity: "high", windowMonths: 6, hint: "Cada 3-6 meses según control." },
  { id: "dm2_microalbuminuria", label: "Microalbuminuria / RAC", category: "DM2", severity: "warn", windowMonths: 12, hint: "Tamizaje anual de nefropatía." },
  { id: "dm2_creatinina", label: "Creatinina + VFG", category: "DM2", severity: "warn", windowMonths: 12 },
  { id: "hta_pa_reciente", label: "PA registrada", category: "HTA", severity: "warn", windowMonths: 6, hint: "Control de presión cada 6 meses." },
  { id: "hta_lipidos", label: "Perfil lipídico", category: "HTA", severity: "info", windowMonths: 12 },
  { id: "hta_creatinina", label: "Creatinina anual", category: "HTA", severity: "info", windowMonths: 12 },
  { id: "vac_influenza", label: "Vacuna influenza (temporada)", category: "Vacunas", severity: "warn", windowMonths: 10, hint: "Campaña marzo-mayo en Chile." },
  { id: "vac_neumo_65", label: "Vacuna neumocócica 65+", category: "Vacunas", severity: "info", windowMonths: 60 },
  { id: "empa_adulto", label: "EMPA (15-64a)", category: "EMP", severity: "info", windowMonths: 36 },
  { id: "empam", label: "EMPAM (65+)", category: "EMP", severity: "warn", windowMonths: 12 },
];

function RemindersInfoPanel() {
  const grouped = REMINDER_RULES_DOC.reduce<Record<string, typeof REMINDER_RULES_DOC>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});
  const sevTone = (s: string) =>
    s === "high"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : s === "warn"
        ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300";

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Recordatorios clínicos</h3>
        <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          Nuevo · v0.6
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Cuando abras una ficha en Rayen, verás un banner amarillo discreto arriba con los pendientes
        detectados (fondo de ojo, vacunas, exámenes, EMP/EMPAM…). El ícono <b>🔔</b> en la barra
        flotante muestra el número y abre el panel lateral con detalle. Cero datos salen del
        equipo: todo se calcula leyendo la ficha visible y comparando con tu configuración local.
      </p>

      <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/60">
        <strong>Importante:</strong> la detección es heurística y solo orientativa. Siempre valida
        con la ficha real antes de actuar. Configura ventanas y desactiva reglas desde la pestaña
        ⚙ <b>Configurar</b> dentro del panel 🔔 de la extensión.
      </div>

      <div className="mt-4 space-y-3">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {cat}
            </div>
            <div className="grid gap-1.5">
              {items.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs ${sevTone(r.severity)}`}
                >
                  <div>
                    <div className="font-semibold">{r.label}</div>
                    {r.hint && <div className="mt-0.5 opacity-80">{r.hint}</div>}
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-[11px] font-mono opacity-80">
                    cada {r.windowMonths}m
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Cómo se detecta:</strong> la extensión lee el texto
        visible de la ficha (diagnósticos activos, edad, sexo, fechas de exámenes, vacunas
        registradas) y los analitos extraídos por <b>🧪 Lab</b>. Si no encuentra un registro o si
        la última fecha excede la ventana, aparece como pendiente.
      </div>
    </div>
  );
}
