// Consultor IA — proxy a Lovable AI Gateway con streaming SSE.
// Modos: "patient" (lenguaje simple, sin contexto clínico) y "professional" (con contexto sanitizado).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PATIENT = `Eres un asistente de salud para personas SIN formación médica en Chile.
Reglas:
- Lenguaje simple, frases cortas, sin tecnicismos. Si usas un término médico, explícalo entre paréntesis.
- No diagnostiques. No reemplazas a un profesional.
- Da información orientativa y, cuando aplique, sugiere "consulte con su médico/enfermera del CESFAM".
- Si la pregunta es urgente (dolor de pecho, sangrado activo, dificultad respiratoria severa, etc.), recomienda llamar al 131 (SAMU) o ir al SAPU/SAR más cercano.
- Termina SIEMPRE con una línea: "ℹ️ Información orientativa, no reemplaza una consulta profesional."
- Responde en español de Chile.`;

const SYSTEM_PROFESSIONAL = `Eres un consultor clínico para profesionales de la salud APS de un CESFAM en Chile (médicos, enfermería, kinesiología, nutrición, odontología, TENS, psicología).
Reglas:
- Respuestas breves, accionables, basadas en guías MINSAL / GES / orientaciones técnicas chilenas.
- Cita la fuente entre paréntesis al final de cada recomendación cuando sea posible (ej: "(GES Diabetes 2022)", "(OT MINSAL HTA 2010)").
- Usa formato markdown con bullets cuando ayude a la lectura.
- Si la pregunta es ambigua, pide aclaración en 1 línea antes de responder.
- Sé respetuoso del rol: si la pregunta es de farmacología y el rol no prescribe, sugiere derivación al médico.
- El contexto del paciente que recibes ya está anonimizado. NUNCA pidas RUT, nombre o datos identificatorios.
- Responde en español de Chile.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, mode, sanitizedContext, role, model } = await req.json();
    if (!Array.isArray(messages) || !messages.length) {
      return new Response(JSON.stringify({ error: "messages requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPro = mode === "professional";
    let system = isPro ? SYSTEM_PROFESSIONAL : SYSTEM_PATIENT;
    if (isPro && role) system += `\n\nRol del usuario: ${String(role).slice(0, 60)}.`;
    if (isPro && sanitizedContext && typeof sanitizedContext === "object") {
      system += `\n\nContexto del paciente (anonimizado):\n` +
        "```json\n" + JSON.stringify(sanitizedContext).slice(0, 4000) + "\n```";
    }

    const chosenModel = (typeof model === "string" && model) || "google/gemini-3-flash-preview";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [{ role: "system", content: system }, ...messages.slice(-30)],
        stream: true,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes, intenta en un momento." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Sin créditos en Lovable AI. Agrega fondos en Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("AI gateway", resp.status, t);
      return new Response(JSON.stringify({ error: "Error del gateway IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("consultor-ia error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
