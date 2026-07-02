/**
 * Descarga del ZIP de la extensión. Redirige al asset estático público
 * para evitar SSRF (la versión anterior construía la URL desde request.url).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/asistente-rayen-zip")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/asistente-rayen.zip",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
