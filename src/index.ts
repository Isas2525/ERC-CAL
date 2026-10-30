/**
 * Tokyo Model Vault Worker. The app itself is plain files served by Workers
 * Static Assets from public/ (headers in public/_headers), and every
 * visitor's garage lives in their own browser. The Worker only runs for
 * /api/*: VIN decoding, cached at the edge so repeat lookups are free.
 */

import { decodeVin, InputError, type VinFetcher } from "./vin";
import { checkVin } from "../public/js/shared/rules.js";

export interface Deps {
  fetchVin?: VinFetcher;
  /** Edge cache for decoded VINs; null turns caching off (tests). */
  cache?: Cache | null;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200, cacheControl = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });

// What NHTSA knows about a VIN doesn't change; keep answers for a month.
const VIN_TTL_S = 30 * 24 * 60 * 60;

async function vinLookup(raw: string, deps: Deps): Promise<Response> {
  const vin = checkVin(raw);
  if (vin.error) throw new InputError(vin.error, "vin");
  const cache = deps.cache === undefined ? caches.default : deps.cache;
  const cacheKey = new Request(`https://vin-cache.internal/${vin.key}`);

  const hit = await cache?.match(cacheKey);
  if (hit) return json(await hit.json(), 200, "private, max-age=86400");

  const result = await decodeVin(vin.key!, deps.fetchVin);
  // Only cache real answers; a decoder outage should be retried next time.
  if (result.decoded && cache) {
    await cache.put(cacheKey, json(result, 200, `public, max-age=${VIN_TTL_S}`));
  }
  return json(result, 200, result.decoded ? "private, max-age=86400" : "no-store");
}

async function handleApi(request: Request, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Method not allowed.");

  if (pathname === "/api/health") return json({ status: "ok" });

  const vin = pathname.match(/^\/api\/vin\/([^/]+)$/);
  if (vin) return vinLookup(decodeURIComponent(vin[1]), deps);

  throw new HttpError(404, "Not found.");
}

export async function handleRequest(request: Request, deps: Deps = {}): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) {
    // Static assets answer every other path before the Worker runs.
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  try {
    return await handleApi(request, deps);
  } catch (err) {
    if (err instanceof InputError) return json({ error: err.message, field: err.field }, 422);
    if (err instanceof HttpError) return json({ error: err.message, field: null }, err.status);
    console.error("unhandled error", err);
    return json({ error: "Something went wrong on the server. Please try again.", field: null }, 500);
  }
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
} satisfies ExportedHandler<Env>;
