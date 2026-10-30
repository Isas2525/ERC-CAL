/**
 * Tokyo Model Vault Worker: the JSON API under /api/*. Everything else
 * (the app itself) is served by Workers Static Assets from public/, with
 * its security headers in public/_headers.
 */

import { AuthError, type JwksFetcher, requireAccess } from "./auth";
import { DuplicateVinError, type HistoryEntry, VehicleStore } from "./store";
import { parseVehicle, ValidationError } from "./validation";
import { decodeVin, type VinFetcher } from "./vin";
import { checkCode, checkErc, checkSerial, findSource } from "../public/js/shared/rules.js";

export interface Deps {
  fetchJwks?: JwksFetcher;
  fetchVin?: VinFetcher;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Codes must never sit in a browser or proxy cache.
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...headers } });

const MAX_BODY = 32 * 1024;
const MAX_IMPORT = 2 * 1024 * 1024;

async function readJson(request: Request, maxBytes = MAX_BODY): Promise<Record<string, unknown>> {
  // Requiring application/json means a cross-site form can't post here
  // without a CORS preflight, which this API never grants.
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Requests must be sent as JSON.");
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "That request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Request body must be a JSON object.");
  return body as Record<string, unknown>;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, "Vehicle not found.");
  return id;
}

async function vehicleDetail(store: VehicleStore, id: number): Promise<Response> {
  const vehicle = await store.get(id);
  if (!vehicle) throw new HttpError(404, "Vehicle not found.");
  return json({ ...vehicle, history: await store.history(id) });
}

const isoDate = (v: unknown, fallback: string) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString().replace(/\.\d{3}Z$/, "Z") : fallback;

async function importBackup(request: Request, store: VehicleStore): Promise<Response> {
  const body = await readJson(request, MAX_IMPORT);
  if (body.app !== "tokyo-model-vault" || !Array.isArray(body.vehicles)) {
    throw new HttpError(400, "That file isn't a Tokyo Model Vault backup.");
  }
  if (body.vehicles.length > 1000) throw new HttpError(413, "A backup can hold at most 1000 vehicles.");

  // Validate everything before writing anything, so a bad file changes nothing.
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const rows = body.vehicles.map((raw: unknown, i: number) => {
    const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    try {
      const fields = parseVehicle(v);
      const history = (Array.isArray(v.history) ? v.history : []).slice(0, 200).flatMap((h: Record<string, unknown>) => {
        const code = checkCode(h?.unlock_code);
        if (code.error || !code.value) return [];
        return [{
          unlock_code: code.value,
          erc: checkErc(h.erc ?? "").value ?? null,
          unit_serial: checkSerial(h.unit_serial ?? "").value ?? null,
          code_source: typeof h.code_source === "string" && findSource(h.code_source) ? h.code_source : null,
          recorded_at: isoDate(h.recorded_at, now),
        } satisfies Omit<HistoryEntry, "id">];
      });
      const created_at = isoDate(v.created_at, now);
      return {
        fields,
        history,
        dates: {
          created_at,
          updated_at: isoDate(v.updated_at, created_at),
          code_saved_at: fields.unlock_code ? isoDate(v.code_saved_at, created_at) : null,
        },
      };
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new HttpError(422, `Vehicle ${i + 1} in the backup: ${err.message}`, { field: null });
      }
      throw err;
    }
  });

  let added = 0;
  for (const row of rows) if (await store.restore(row.fields, row.dates, row.history)) added++;
  return json({ added, skipped: rows.length - added, message: `Restored ${added} vehicle(s); ${rows.length - added} already in your garage.` });
}

async function handleApi(request: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;
  const allow = (...methods: string[]) => {
    if (!methods.includes(method)) throw new HttpError(405, "Method not allowed.");
  };

  await requireAccess(request, env, deps.fetchJwks);
  const store = new VehicleStore(env.DB);

  if (pathname === "/api/health") {
    allow("GET");
    return json({ status: "ok", ...(await store.stats()) });
  }

  if (pathname === "/api/vehicles") {
    allow("GET", "POST");
    if (method === "GET") return json(await store.list());
    const vehicle = await store.create(parseVehicle(await readJson(request)));
    return json({ ...vehicle, history: await store.history(vehicle.id) }, 201);
  }

  const one = pathname.match(/^\/api\/vehicles\/([^/]+)$/);
  if (one) {
    allow("GET", "PUT", "DELETE");
    const id = parseId(one[1]);
    if (method === "GET") return vehicleDetail(store, id);
    if (method === "DELETE") {
      if (!(await store.delete(id))) throw new HttpError(404, "Vehicle not found.");
      return json({ deleted: true });
    }
    const fields = parseVehicle(await readJson(request));
    if (!(await store.update(id, fields))) throw new HttpError(404, "Vehicle not found.");
    return vehicleDetail(store, id);
  }

  const vin = pathname.match(/^\/api\/vin\/([^/]+)$/);
  if (vin) {
    allow("GET");
    return json(await decodeVin(decodeURIComponent(vin[1]), deps.fetchVin));
  }

  if (pathname === "/api/export") {
    allow("GET");
    const exported_at = new Date().toISOString();
    return json(
      { app: "tokyo-model-vault", version: 1, exported_at, vehicles: await store.exportAll() },
      200,
      { "Content-Disposition": `attachment; filename="tokyo-model-vault-${exported_at.slice(0, 10)}.json"` },
    );
  }

  if (pathname === "/api/import") {
    allow("POST");
    return importBackup(request, store);
  }

  throw new HttpError(404, "Not found.");
}

export async function handleRequest(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) {
    // Static assets answer every other path before the Worker runs.
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  try {
    return await handleApi(request, env, deps);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.message, field: err.field }, 422);
    if (err instanceof HttpError) return json({ error: err.message, field: null, ...err.extra }, err.status);
    if (err instanceof AuthError) return json({ error: err.message, field: null }, err.status);
    if (err instanceof DuplicateVinError) {
      return json({ error: err.message, field: "vin", existing_id: err.existingId }, 409);
    }
    if (String(err).includes("no such table")) {
      console.error("database not migrated", err);
      return json({ error: "The database needs updating. Run: npm run db:migrate", field: null }, 503);
    }
    console.error("unhandled error", err);
    return json({ error: "Something went wrong on the server. Please try again.", field: null }, 500);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
