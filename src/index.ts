/**
 * ERC-CAL Worker: JSON API under /api/*, and the static frontend.
 */

import { AuthError, type JwksFetcher, requireAccess } from "./auth";
import { ASSETS } from "./assets.gen";
import { BRANDS } from "./brands";
import { buildProviders, type FallbackProvider, queryProviders } from "./fallback";
import { CodeStore } from "./store";
import {
  normalizeIdentifier,
  optionalText,
  optionalYear,
  resolveBrand,
  validateCode,
  ValidationError,
} from "./validation";

export interface Deps {
  providers: FallbackProvider[];
  fetchJwks?: JwksFetcher;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly field: string | null = null) {
    super(message);
  }
}

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Codes must never sit in a browser or proxy cache.
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: API_HEADERS });
const error = (status: number, message: string, field: string | null = null) => json({ error: message, field }, status);

const PAGE_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};

async function readJson(request: Request): Promise<Record<string, unknown>> {
  // Requiring application/json means a cross-site form can't post here
  // without a CORS preflight, which this API never grants.
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Requests must be sent as JSON.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Request body must be a JSON object.");
  return body as Record<string, unknown>;
}

function limited(value: unknown, field: string, max: number): unknown {
  if (typeof value === "string" && value.length > max) {
    throw new ValidationError(`${field} is too long (max ${max} characters).`, field);
  }
  return value;
}

async function lookup(request: Request, store: CodeStore, providers: FallbackProvider[]): Promise<Response> {
  const body = await readJson(request);
  const brand = resolveBrand(limited(body.brand, "brand", 32));
  const identifier = normalizeIdentifier(brand, limited(body.identifier, "identifier", 128));

  const record = await store.get(brand.key, identifier);
  if (record) {
    return json({
      found: true,
      brand: brand.key,
      identifier,
      code: record.code,
      source: "local",
      model: record.model,
      model_year: record.model_year,
      notes: record.notes,
      message: "Unlock code found.",
    });
  }

  const hit = await queryProviders(providers, brand.key, identifier);
  if (hit) {
    await store.upsert(brand.key, identifier, { code: hit.code, notes: `via ${hit.provider}` });
    return json({
      found: true,
      brand: brand.key,
      identifier,
      code: hit.code,
      source: hit.provider,
      model: null,
      model_year: null,
      notes: null,
      message: `Unlock code found via ${hit.provider}.`,
    });
  }

  return json({
    found: false,
    brand: brand.key,
    identifier,
    code: null,
    source: null,
    model: null,
    model_year: null,
    notes: null,
    message:
      `Nothing is stored for ${brand.name} ${brand.identifier_noun} ${identifier}. ` +
      "Check it was typed exactly as shown, or add the code you were issued using 'Save a code'.",
  });
}

async function saveCode(request: Request, store: CodeStore): Promise<Response> {
  const body = await readJson(request);
  const brand = resolveBrand(limited(body.brand, "brand", 32));
  const identifier = normalizeIdentifier(brand, limited(body.identifier, "identifier", 128));
  const code = validateCode(limited(body.code, "code", 64));
  const { record, created } = await store.upsert(brand.key, identifier, {
    code,
    model: optionalText(body.model, "model", 64),
    model_year: optionalYear(body.model_year),
    notes: optionalText(body.notes, "notes", 500),
  });
  return json({
    created,
    brand: record.brand,
    identifier: record.identifier,
    code: record.code,
    message: created ? "Code saved." : "Code updated.",
  });
}

async function deleteCode(brandKey: string, rawIdentifier: string, store: CodeStore): Promise<Response> {
  const brand = resolveBrand(brandKey);
  const identifier = normalizeIdentifier(brand, rawIdentifier);
  if (!(await store.delete(brand.key, identifier))) throw new HttpError(404, "No stored code to delete.");
  return json({ deleted: true });
}

async function handleApi(request: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;

  await requireAccess(request, env, deps.fetchJwks);
  const store = new CodeStore(env.DB);

  if (pathname === "/api/health") {
    if (method !== "GET") throw new HttpError(405, "Method not allowed.");
    return json({ status: "ok", codes_stored: await store.count() });
  }
  if (pathname === "/api/brands") {
    if (method !== "GET") throw new HttpError(405, "Method not allowed.");
    return json(BRANDS);
  }
  if (pathname === "/api/lookup") {
    if (method !== "POST") throw new HttpError(405, "Method not allowed.");
    return lookup(request, store, deps.providers);
  }
  if (pathname === "/api/codes") {
    if (method !== "POST") throw new HttpError(405, "Method not allowed.");
    return saveCode(request, store);
  }
  const del = pathname.match(/^\/api\/codes\/([^/]+)\/([^/]+)$/);
  if (del) {
    if (method !== "DELETE") throw new HttpError(405, "Method not allowed.");
    return deleteCode(decodeURIComponent(del[1]), decodeURIComponent(del[2]), store);
  }
  throw new HttpError(404, "Not found.");
}

function serveAsset(request: Request): Response {
  const { pathname } = new URL(request.url);
  const asset = ASSETS[pathname === "/" ? "/index.html" : pathname];
  if (!asset || (request.method !== "GET" && request.method !== "HEAD")) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain", ...PAGE_HEADERS } });
  }
  if (request.headers.get("If-None-Match") === asset.etag) {
    return new Response(null, { status: 304, headers: { ETag: asset.etag } });
  }
  return new Response(request.method === "HEAD" ? null : asset.body, {
    headers: {
      "Content-Type": asset.type,
      ETag: asset.etag,
      // Revalidate every load: the files are tiny and must update on deploy.
      "Cache-Control": "no-cache",
      ...PAGE_HEADERS,
    },
  });
}

export async function handleRequest(request: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return serveAsset(request);
  try {
    return await handleApi(request, env, deps);
  } catch (err) {
    if (err instanceof ValidationError) return error(422, err.message, err.field);
    if (err instanceof HttpError) return error(err.status, err.message, err.field);
    if (err instanceof AuthError) return error(err.status, err.message);
    console.error("unhandled error", err);
    return error(500, "Something went wrong on the server. Please try again.");
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, { providers: buildProviders(env) });
  },
} satisfies ExportedHandler<Env>;
