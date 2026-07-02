import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Acceso interno — Vínculo" },
      { name: "description", content: "Ingreso al panel de gestión interna del equipo Vínculo." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message || "Datos inválidos"); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
        if (error) throw error;
        nav({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        setMsg("Cuenta creada. Revisa tu correo para confirmar. El equipo te asignará el rol admin si corresponde.");
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error desconocido");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
        <Card className="w-full p-6">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Acceso interno</h1>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Panel restringido al equipo Vínculo. Si solo quieres usar la extensión, no necesitas cuenta.
          </p>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            {msg && <p className="text-sm text-emerald-600">{msg}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); setMsg(null); }}
            className="mt-3 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? "¿Sin cuenta? Crear una" : "¿Ya tienes cuenta? Ingresar"}
          </button>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
