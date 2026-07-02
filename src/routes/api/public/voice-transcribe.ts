/**
 * STT clínico para extensión Vínculo.
 *
 * Estrategia: ElevenLabs Scribe v2 como motor principal (mejor calidad ES-CL,
 * diarización opcional). Si ElevenLabs falla (bloqueo CF, rate limit, sin créditos),
 * cae a Lovable AI Gateway (Gemini 2.5 Flash multimodal).
 *
 * No se persiste audio. Solo se devuelve el texto transcrito.
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit, getClientIp, isOriginAllowed, isProd } from "@/lib/rate-limit.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_PROMPT =
  "Eres un transcriptor clínico para Atención Primaria en Chile. " +
  "Transcribe el audio en español neutro chileno, literal, sin resumir ni interpretar. " +
  "Si distingues claramente dos hablantes diferéncialos como 'Profesional:' y 'Paciente:' en líneas separadas. " +
  "Si solo hay un hablante o no estás seguro, devuelve el texto plano sin prefijos. " +
  "Devuelve EXCLUSIVAMENTE la transcripción, sin comentarios, sin disclaimers, sin markdown.";

export const Route = createFileRoute("/api/public/voice-transcribe")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          if (!isOriginAllowed(request)) {
            return Response.json({ error: "Origen no permitido" }, { status: 403, headers: CORS });
          }
          const ip = getClientIp(request);
          if (!checkRateLimit(`vt:${ip}`, 20, 60_000)) {
            return Response.json(
              { error: "Demasiadas solicitudes. Intenta en un minuto." },
              { status: 429, headers: { ...CORS, "Retry-After": "60" } },
            );
          }

          const inFD = await request.formData();
          const audio = inFD.get("audio");
          if (!(audio instanceof Blob) || audio.size === 0) {
            return Response.json(
              { error: "Falta archivo de audio" },
              { status: 400, headers: CORS },
            );
          }
          if (audio.size > 20 * 1024 * 1024) {
            return Response.json(
              { error: "Audio demasiado grande (>20MB). Divide la grabación en segmentos más cortos." },
              { status: 413, headers: CORS },
            );
          }

          const mimeRaw = (audio.type || "audio/webm").split(";")[0].trim().toLowerCase();

          // === Motor 1: ElevenLabs Scribe v2 ===
          const elevenKey = process.env.ELEVENLABS_API_KEY;
          if (elevenKey) {
            try {
              const result = await transcribeWithElevenLabs(audio, mimeRaw, elevenKey);
              if (result.ok) {
                return Response.json(
                  { text: result.text, speakers: result.speakers, engine: "elevenlabs" },
                  { headers: CORS },
                );
              }
              console.warn("ElevenLabs STT falló, intentando Gemini fallback:", result.error);
            } catch (e) {
              console.warn("ElevenLabs STT excepción, intentando Gemini fallback:", e);
            }
          }

          // === Motor 2 (fallback): Lovable AI Gateway / Gemini ===
          const lovableKey = process.env.LOVABLE_API_KEY;
          if (!lovableKey) {
            return Response.json(
              { error: "Ningún motor STT configurado (ELEVENLABS_API_KEY ni LOVABLE_API_KEY)" },
              { status: 500, headers: CORS },
            );
          }
          const geminiResult = await transcribeWithGemini(audio, mimeRaw, lovableKey);
          if (!geminiResult.ok) {
            return Response.json(
              { error: geminiResult.error, upstream_status: geminiResult.status },
              { status: 502, headers: CORS },
            );
          }
          return Response.json(
            {
              text: geminiResult.text,
              speakers: estimateSpeakers(geminiResult.text),
              engine: "gemini",
            },
            { headers: CORS },
          );
        } catch (e) {
          console.error("voice-transcribe exception", e);
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

// ---------- ElevenLabs ----------

async function transcribeWithElevenLabs(
  audio: Blob,
  mime: string,
  apiKey: string,
): Promise<
  | { ok: true; text: string; speakers: number }
  | { ok: false; error: string; status?: number }
> {
  const ext = mimeToExt(mime);
  const fd = new FormData();
  // ElevenLabs acepta el blob directamente; le damos un nombre con extensión
  // para que infiera el formato correcto.
  fd.append("file", audio, `audio.${ext}`);
  fd.append("model_id", "scribe_v2");
  fd.append("language_code", "spa");
  fd.append("diarize", "true");
  fd.append("tag_audio_events", "false");

  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: fd,
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("ElevenLabs STT error", r.status, t.slice(0, 300));
    return { ok: false, status: r.status, error: `ElevenLabs ${r.status}: ${t.slice(0, 200)}` };
  }

  const data = (await r.json()) as {
    text?: string;
    words?: Array<{ text?: string; speaker_id?: string; type?: string }>;
  };

  const words = data.words || [];
  const speakerIds = new Set(
    words.map((w) => w.speaker_id).filter((s): s is string => !!s),
  );

  let text = (data.text || "").trim();

  // Si hay diarización (2+ hablantes), reconstruimos con prefijos.
  if (speakerIds.size >= 2 && words.length > 0) {
    const lines: string[] = [];
    let currentSpeaker = "";
    let buffer = "";
    const speakerLabel = (id: string, order: string[]) => {
      const idx = order.indexOf(id);
      return idx === 0 ? "Profesional" : "Paciente";
    };
    const order = Array.from(speakerIds);
    for (const w of words) {
      const sp = w.speaker_id || currentSpeaker;
      if (sp !== currentSpeaker) {
        if (buffer.trim()) lines.push(`${speakerLabel(currentSpeaker, order)}: ${buffer.trim()}`);
        currentSpeaker = sp;
        buffer = "";
      }
      buffer += w.text || "";
    }
    if (buffer.trim()) lines.push(`${speakerLabel(currentSpeaker, order)}: ${buffer.trim()}`);
    text = lines.join("\n");
  }

  return { ok: true, text, speakers: Math.max(speakerIds.size, text ? 1 : 0) };
}

// ---------- Gemini fallback ----------

async function transcribeWithGemini(
  audio: Blob,
  mime: string,
  apiKey: string,
): Promise<
  | { ok: true; text: string }
  | { ok: false; error: string; status?: number }
> {
  const supportedMime = pickSupportedMime(mime);
  const buf = new Uint8Array(await audio.arrayBuffer());
  const b64 = bufferToBase64(buf);

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: GEMINI_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe este audio clínico ahora." },
          {
            type: "input_audio",
            input_audio: { data: b64, format: mimeToFormat(supportedMime) },
          },
        ],
      },
    ],
    temperature: 0,
  };

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.error("Lovable AI STT error", r.status, errText.slice(0, 400));
    let friendly = `Transcripción falló (${r.status})`;
    if (r.status === 402) friendly = "Sin créditos en Lovable AI.";
    else if (r.status === 429) friendly = "Límite de uso alcanzado. Intenta nuevamente.";
    else if (r.status === 401 || r.status === 403) friendly = "Credenciales de Lovable AI inválidas.";
    return { ok: false, status: r.status, error: friendly };
  }

  const data = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  return { ok: true, text };
}

// ---------- helpers ----------

function bufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

function pickSupportedMime(mime: string): string {
  const ok = [
    "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg",
    "audio/mp3", "audio/aac", "audio/flac", "audio/aiff",
  ];
  return ok.includes(mime) ? mime : "audio/webm";
}

function mimeToFormat(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/aac": "aac",
    "audio/flac": "flac", "audio/aiff": "aiff",
  };
  return map[mime] || "webm";
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "mp4",
    "audio/aac": "aac", "audio/flac": "flac",
  };
  return map[mime] || "webm";
}

function estimateSpeakers(text: string): number {
  const hasProf = /(^|\n)\s*Profesional\s*:/i.test(text);
  const hasPac = /(^|\n)\s*Paciente\s*:/i.test(text);
  if (hasProf && hasPac) return 2;
  if (hasProf || hasPac) return 1;
  return text.trim() ? 1 : 0;
}
