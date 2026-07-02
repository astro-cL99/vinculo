/**
 * Recibe la transcripción de una conversación médico-paciente y la estructura
 * como anamnesis APS usando Lovable AI (Gemini Flash). No persiste nada.
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit, getClientIp, isOriginAllowed, isProd } from "@/lib/rate-limit.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const SYSTEM = `Eres un asistente clínico chileno de Atención Primaria (APS).
Recibirás la transcripción literal de una conversación médico-paciente.
Tu tarea es estructurarla como una anamnesis clínica concisa, en español neutro chileno,
RESPETANDO ESTRICTAMENTE la información mencionada. NO inventes datos, NO agregues
diagnósticos no enunciados. Si una sección no fue tratada, déjala como cadena vacía.
Corrige automáticamente errores obvios de transcripción en términos médicos y
fármacos (ej: "losartán", "metformina", "salbutamol"). Usa lenguaje clínico breve,
no narrativo.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "estructurar_anamnesis",
    description: "Devuelve la anamnesis estructurada en 5 secciones APS",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo de consulta (1-2 líneas)" },
        historia: {
          type: "string",
          description:
            "Historia de la enfermedad actual: inicio, evolución, síntomas, factores, tratamientos previos",
        },
        antecedentes: {
          type: "string",
          description:
            "Antecedentes mórbidos, quirúrgicos, familiares, alérgicos, farmacológicos, hábitos",
        },
        examen: {
          type: "string",
          description: "Hallazgos del examen físico mencionados (si se mencionan)",
        },
        plan: {
          type: "string",
          description:
            "Plan: indicaciones, exámenes solicitados, derivaciones, controles, educación al paciente",
        },
        textoPlano: {
          type: "string",
          description:
            "Versión narrativa única (1-2 párrafos) de toda la anamnesis, lista para pegar como texto libre",
        },
      },
      required: ["motivo", "historia", "antecedentes", "examen", "plan", "textoPlano"],
      additionalProperties: false,
    },
  },
};

export const Route = createFileRoute("/api/public/voice-structure")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          if (!isOriginAllowed(request)) {
            return Response.json({ error: "Origen no permitido" }, { status: 403, headers: CORS });
          }
          const ip = getClientIp(request);
          if (!checkRateLimit(`vs:${ip}`, 30, 60_000)) {
            return Response.json(
              { error: "Demasiadas solicitudes. Intenta en un minuto." },
              { status: 429, headers: { ...CORS, "Retry-After": "60" } },
            );
          }
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json(
              { error: "LOVABLE_API_KEY no configurado" },
              { status: 500, headers: CORS },
            );
          }


          const body = (await request.json()) as { transcript?: string };
          const transcript = String(body?.transcript || "").trim();
          if (transcript.length < 10) {
            return Response.json(
              { error: "Transcripción muy corta o vacía" },
              { status: 400, headers: CORS },
            );
          }
          if (transcript.length > 30000) {
            return Response.json(
              { error: "Transcripción demasiado larga (>30k caracteres)" },
              { status: 413, headers: CORS },
            );
          }

          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: SYSTEM },
                {
                  role: "user",
                  content: `Transcripción de la conversación:\n\n${transcript}`,
                },
              ],
              tools: [TOOL],
              tool_choice: {
                type: "function",
                function: { name: "estructurar_anamnesis" },
              },
            }),
          });

          if (r.status === 429) {
            return Response.json(
              { error: "Demasiadas solicitudes, intenta en un momento" },
              { status: 429, headers: CORS },
            );
          }
          if (r.status === 402) {
            return Response.json(
              { error: "Crédito de IA agotado en el espacio de trabajo" },
              { status: 402, headers: CORS },
            );
          }
          if (!r.ok) {
            const t = await r.text().catch(() => "");
            console.error("Lovable AI error", r.status, t.slice(0, 400));
            return Response.json(
              { error: `IA falló (${r.status})` },
              { status: 502, headers: CORS },
            );
          }

          const data = await r.json();
          const call = data?.choices?.[0]?.message?.tool_calls?.[0];
          const argsStr = call?.function?.arguments;
          if (!argsStr) {
            return Response.json(
              { error: "La IA no devolvió estructura válida" },
              { status: 502, headers: CORS },
            );
          }
          let parsed: Record<string, string>;
          try {
            parsed = JSON.parse(argsStr);
          } catch {
            return Response.json(
              { error: "JSON inválido de la IA" },
              { status: 502, headers: CORS },
            );
          }

          return Response.json(
            {
              motivo: parsed.motivo || "",
              historia: parsed.historia || "",
              antecedentes: parsed.antecedentes || "",
              examen: parsed.examen || "",
              plan: parsed.plan || "",
              textoPlano: parsed.textoPlano || "",
            },
            { headers: CORS },
          );
        } catch (e) {
          console.error("voice-structure exception", e);
          return Response.json(
            {
              error: isProd()
                ? "Error interno del servidor"
                : e instanceof Error
                  ? e.message
                  : "Error desconocido",
            },
            { status: 500, headers: CORS },
          );
        }
      },
    },
  },
});
