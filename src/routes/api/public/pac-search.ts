/**
 * Búsqueda en vivo en Farmacia Popular (PAC) — farmaciapopularonline.cl
 *
 * Flujo:
 *   1. GET /ConsultorPAC?farmacia=PAC   → obtiene ASP.NET_SessionId
 *   2. POST /ConsultorPAC/ObtenerMedicamentos (Texto=q)   → guarda filtro en sesión
 *   3. GET  /ConsultorPAC?farmacia=PAC   → devuelve HTML con la tabla filtrada
 *
 * Parsea la tabla #grdDatos y devuelve un JSON estable. Cache en memoria
 * por 10 minutos por consulta para no martillar el origen.
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit, getClientIp, isOriginAllowed } from "@/lib/rate-limit.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const PAC_BASE = "https://farmaciapopularonline.cl";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: PacRow[] }>();

export type PacRow = {
  requiereReceta: boolean;
  medicamento: string;
  principio: string;          // "PREGABALINA 150 MG"
  principioBase: string;      // "pregabalina"
  forma: string;              // "CAPSULA"
  stock: "disponible" | "agotado";
  precio: number;             // 990
  precioTxt: string;          // "$990"
};

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function principioBase(p: string): string {
  // "PREGABALINA 150 MG" → "pregabalina"
  return norm(p.split(/\s+\d/)[0] || p);
}

function parseTable(html: string): PacRow[] {
  const tableMatch = html.match(/<table[^>]*id="grdDatos"[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const rowMatches = tableMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows: PacRow[] = [];
  for (const tr of rowMatches) {
    const cells = Array.from(tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (cells.length < 6) continue;
    if (/requiere receta/i.test(cells[0])) continue; // header
    const stock = /disponible/i.test(cells[4]) ? "disponible" : "agotado";
    const precioTxt = cells[5] || "$0";
    const precio = Number(precioTxt.replace(/[^\d]/g, "")) || 0;
    rows.push({
      requiereReceta: /^s/i.test(cells[0]),
      medicamento: cells[1],
      principio: cells[2],
      principioBase: principioBase(cells[2]),
      forma: cells[3].toUpperCase(),
      stock,
      precio,
      precioTxt,
    });
  }
  return rows;
}

const UA = "Mozilla/5.0 (compatible; VinculoApp/1.0)";
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = FETCH_TIMEOUT_MS, ...rest } = init;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(to);
  }
}

async function scrapeOnce(q: string): Promise<PacRow[]> {
  // 1. Establecer sesión
  const r1 = await fetchWithTimeout(`${PAC_BASE}/ConsultorPAC?farmacia=PAC`, {
    headers: { "User-Agent": UA },
  });
  const setCookie = r1.headers.get("set-cookie") || "";
  const sessionMatch = setCookie.match(/ASP\.NET_SessionId=([^;]+)/i);
  if (!sessionMatch) throw new Error("No se obtuvo sesión PAC");
  const cookie = `ASP.NET_SessionId=${sessionMatch[1]}`;

  // 2. Aplicar filtro
  const body = new URLSearchParams({ Texto: q }).toString();
  const r2 = await fetchWithTimeout(`${PAC_BASE}/ConsultorPAC/ObtenerMedicamentos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": `${PAC_BASE}/ConsultorPAC?farmacia=PAC`,
      "Cookie": cookie,
      "User-Agent": UA,
    },
    body,
  });
  if (!r2.ok) throw new Error(`Filter HTTP ${r2.status}`);

  // 3. Leer HTML con resultados
  const r3 = await fetchWithTimeout(`${PAC_BASE}/ConsultorPAC?farmacia=PAC`, {
    headers: { "Cookie": cookie, "User-Agent": UA },
  });
  if (!r3.ok) throw new Error(`HTML HTTP ${r3.status}`);
  const html = await r3.text();
  return parseTable(html);
}

async function scrape(query: string): Promise<{ rows: PacRow[]; stale?: boolean; warn?: string }> {
  const q = query.trim();
  if (q.length < 2) return { rows: [] };
  const key = norm(q);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { rows: hit.data };

  // Hasta 2 intentos contra el upstream (PAC es inestable)
  let lastErr: unknown = null;
  for (let i = 0; i < 2; i++) {
    try {
      const data = await scrapeOnce(q);
      cache.set(key, { at: Date.now(), data });
      return { rows: data };
    } catch (e) {
      lastErr = e;
    }
  }
  // Fallback: devolver caché vencida si existe, marcada como stale
  if (hit) {
    return { rows: hit.data, stale: true, warn: "Datos en caché — PAC no responde" };
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}


export const Route = createFileRoute("/api/public/pac-search")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          if (!isOriginAllowed(request)) {
            return Response.json({ error: "Origen no permitido" }, { status: 403, headers: CORS });
          }
          const ip = getClientIp(request);
          if (!checkRateLimit(`pac:${ip}`, 60, 60_000)) {
            return Response.json({ error: "Demasiadas solicitudes" }, {
              status: 429,
              headers: { ...CORS, "Retry-After": "60" },
            });
          }
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") || "").trim();
          if (q.length < 2) {
            return Response.json({ rows: [], note: "Mínimo 2 caracteres" }, { headers: CORS });
          }
          const { rows, stale, warn } = await scrape(q);

          // Agrupar por principio activo (para autocomplete) + lista completa
          const byPrincipio = new Map<string, { principio: string; principioBase: string; formas: Set<string>; count: number }>();
          for (const r of rows) {
            const key = r.principio;
            const g = byPrincipio.get(key) || {
              principio: r.principio,
              principioBase: r.principioBase,
              formas: new Set<string>(),
              count: 0,
            };
            g.formas.add(r.forma);
            g.count++;
            byPrincipio.set(key, g);
          }
          const principios = Array.from(byPrincipio.values()).map((g) => ({
            principio: g.principio,
            principioBase: g.principioBase,
            formas: Array.from(g.formas),
            count: g.count,
          }));

          return Response.json({ rows, principios, stale: stale || false, warn }, { headers: CORS });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[pac-search] error:", msg);
          return Response.json({ error: "PAC no responde", detail: msg, rows: [], principios: [] }, {
            status: 502,
            headers: CORS,
          });
        }
      },
    },
  },
});
