/**
 * Rate limiter en memoria (ventana deslizante simple) y validador de origen
 * para proteger endpoints públicos que consumen créditos de IA.
 *
 * Nota: el estado vive en memoria del Worker, así que es por-instancia.
 * Suficiente como defensa básica contra abuso/bots; para algo más estricto
 * habría que usar Durable Objects o KV.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

const ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"];

export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  // La extensión Chrome a veces no envía Origin (content script en MV3): permitir.
  if (!origin) return true;
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("moz-extension://")) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    return ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s));
  } catch {
    return false;
  }
}

export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}
