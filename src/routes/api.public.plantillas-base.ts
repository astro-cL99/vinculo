import { createFileRoute } from "@tanstack/react-router";
import plantillas from "../../public/plantillas-base-cesfam.json";

export const Route = createFileRoute("/api/public/plantillas-base")({
  server: {
    handlers: {
      GET: () => {
        return new Response(JSON.stringify(plantillas, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": 'attachment; filename="plantillas-base-cesfam.json"',
            "cache-control": "no-cache",
          },
        });
      },
    },
  },
});
