import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Lightbulb, Send, MessageSquare, User2, Clock, ArrowBigUp, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/sugerencias")({
  head: () => ({
    meta: [
      { title: "Sugerencias — Vínculo" },
      {
        name: "description",
        content:
          "Comparte y vota ideas para el copiloto Vínculo. Las más votadas suben en el ranking.",
      },
      { property: "og:title", content: "Sugerencias — Vínculo" },
      {
        property: "og:description",
        content:
          "Buzón público con sistema de votos. Prioriza las mejoras que más te ayudarían.",
      },
    ],
  }),
  component: SuggestionsPage,
});

type Suggestion = {
  id: string;
  author: string;
  message: string;
  created_at: string;
};

type SuggestionWithVotes = Suggestion & { votes: number; voted: boolean };

const dateFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

const FP_KEY = "ar_voter_fp";
function getFingerprint(): string {
  if (typeof window === "undefined") return "";
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) {
    fp =
      (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
      "-" +
      Date.now().toString(36);
    localStorage.setItem(FP_KEY, fp);
  }
  return fp;
}

function SuggestionsPage() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const fp = useMemo(() => (typeof window !== "undefined" ? getFingerprint() : ""), []);

  const load = async () => {
    setLoading(true);
    const [{ data: sData }, { data: vData }] = await Promise.all([
      supabase
        .from("suggestions")
        .select("id, author, message, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("suggestion_votes").select("suggestion_id, voter_fingerprint").limit(10000),
    ]);

    if (sData) setItems(sData as Suggestion[]);

    const counts: Record<string, number> = {};
    const mine = new Set<string>();
    (vData ?? []).forEach((v: { suggestion_id: string; voter_fingerprint: string }) => {
      counts[v.suggestion_id] = (counts[v.suggestion_id] ?? 0) + 1;
      if (v.voter_fingerprint === fp) mine.add(v.suggestion_id);
    });
    setVoteCounts(counts);
    setMyVotes(mine);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [fp]);

  const ranked: SuggestionWithVotes[] = useMemo(() => {
    return items
      .map((s) => ({
        ...s,
        votes: voteCounts[s.id] ?? 0,
        voted: myVotes.has(s.id),
      }))
      .sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [items, voteCounts, myVotes]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const a = author.trim();
    const m = message.trim();
    if (a.length < 1) {
      setFeedback({ kind: "err", text: "Ingresa tu nombre." });
      return;
    }
    if (m.length < 3) {
      setFeedback({ kind: "err", text: "La sugerencia es muy corta." });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("suggestions").insert({ author: a, message: m });
    setSubmitting(false);
    if (error) {
      setFeedback({ kind: "err", text: "No se pudo enviar. Intenta de nuevo." });
      return;
    }
    setMessage("");
    setFeedback({ kind: "ok", text: "¡Gracias! Tu sugerencia quedó registrada." });
    load();
  };

  const onVote = async (suggestionId: string) => {
    if (myVotes.has(suggestionId) || votingId) return;
    setVotingId(suggestionId);
    // optimistic
    setMyVotes((prev) => new Set(prev).add(suggestionId));
    setVoteCounts((prev) => ({ ...prev, [suggestionId]: (prev[suggestionId] ?? 0) + 1 }));

    const { error } = await supabase
      .from("suggestion_votes")
      .insert({ suggestion_id: suggestionId, voter_fingerprint: fp });

    if (error) {
      // rollback (unless it was a duplicate, which is fine)
      const isDuplicate = error.code === "23505";
      if (!isDuplicate) {
        setMyVotes((prev) => {
          const next = new Set(prev);
          next.delete(suggestionId);
          return next;
        });
        setVoteCounts((prev) => ({
          ...prev,
          [suggestionId]: Math.max(0, (prev[suggestionId] ?? 1) - 1),
        }));
      }
    }
    setVotingId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Lightbulb className="h-3.5 w-3.5" /> Buzón público con votos
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Sugerencias del equipo
          </h1>
          <p className="mt-3 text-muted-foreground">
            Cuéntanos qué te gustaría que Vínculo haga por ti. Vota las ideas
            que más te ayudarían: las más votadas suben en el ranking.
          </p>
        </div>

        <Card className="mt-8 p-6">
          <form onSubmit={onSubmit} className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Tu nombre</label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Ej: Dra. Pérez, CESFAM Colina"
                maxLength={80}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Tu sugerencia</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe la mejora, función o flujo que te ayudaría…"
                rows={5}
                maxLength={2000}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {message.length}/2000 — la fecha y hora se registran automáticamente al enviar.
              </p>
            </div>
            {feedback && (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  feedback.kind === "ok"
                    ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                {feedback.text}
              </div>
            )}
            <div>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[image:var(--gradient-hero)]"
              >
                <Send className="mr-2 h-4 w-4" />
                {submitting ? "Enviando…" : "Subir sugerencia"}
              </Button>
            </div>
          </form>
        </Card>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Trophy className="h-5 w-5 text-primary" />
            Ranking de sugerencias
            <span className="text-sm font-normal text-muted-foreground">
              ({ranked.length})
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ordenadas por cantidad de votos. Puedes votar una vez por sugerencia desde este dispositivo.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">Cargando…</p>
          ) : ranked.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Aún no hay sugerencias. ¡Sé el primero en aportar!
            </p>
          ) : (
            <ul className="mt-6 grid gap-3">
              {ranked.map((s, idx) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        type="button"
                        variant={s.voted ? "default" : "outline"}
                        size="sm"
                        disabled={s.voted || votingId === s.id}
                        onClick={() => onVote(s.id)}
                        className="h-auto flex-col gap-0.5 px-3 py-2"
                        aria-label={s.voted ? "Ya votaste" : "Votar"}
                      >
                        <ArrowBigUp className="h-5 w-5" />
                        <span className="text-sm font-bold tabular-nums">{s.votes}</span>
                      </Button>
                      {idx < 3 && s.votes > 0 && (
                        <span className="text-[10px] font-semibold text-primary">
                          #{idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <User2 className="h-3.5 w-3.5" />
                          {s.author}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {dateFmt.format(new Date(s.created_at))}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {s.votes} {s.votes === 1 ? "voto" : "votos"}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                        {s.message}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
