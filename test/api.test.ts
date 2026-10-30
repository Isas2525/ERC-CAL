import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import headers from "../public/_headers?raw";
import { body, call, post, put } from "./helpers";

const prius = {
  vin: "zvw30-1234567",
  make: "toyota",
  model: "Prius",
  model_year: 2012,
  nickname: "Blue Prius",
  unit_brand: "toyota",
  unit_model: "nszt-w62g",
  unit_serial: "ab 1234 567",
  erc: "",
};

const create = async (over: Record<string, unknown> = {}) => {
  const r = await post("/api/vehicles", { ...prius, ...over });
  expect(r.status).toBe(201);
  return body(r);
};

describe("vehicles", () => {
  it("starts empty", async () => {
    expect(await body(await call("/api/health"))).toEqual({ status: "ok", vehicles: 0, codes: 0 });
    expect(await body(await call("/api/vehicles"))).toEqual([]);
  });

  it("creates a vehicle, normalizing what was typed", async () => {
    const v = await create();
    expect(v).toMatchObject({
      vin: "ZVW30-1234567",
      make: "toyota",
      model: "Prius",
      model_year: 2012,
      unit_model: "NSZT-W62G",
      unit_serial: "AB1234567",
      erc: null,
      unlock_code: null,
      code_saved_at: null,
      history: [],
    });
    expect(v).not.toHaveProperty("vin_key");
    const list = await body(await call("/api/vehicles"));
    expect(list).toHaveLength(1);
  });

  it("records the code and its history when one is given", async () => {
    const v = await create({ erc: "1a2b 3c4d-5e6f.7a8b", unlock_code: " ab12cd34 ", code_source: "dealer" });
    expect(v).toMatchObject({ erc: "1A2B3C4D5E6F7A8B", unlock_code: "AB12CD34", code_source: "dealer" });
    expect(v.code_saved_at).toBeTruthy();
    expect(v.history).toHaveLength(1);
    expect(v.history[0]).toMatchObject({ unlock_code: "AB12CD34", erc: "1A2B3C4D5E6F7A8B", code_source: "dealer" });
    expect(await body(await call("/api/health"))).toMatchObject({ vehicles: 1, codes: 1 });
  });

  it("keeps old codes in the history when the code changes", async () => {
    const v = await create({ unlock_code: "1111" });
    const payload = { ...prius, unlock_code: "1111" };

    // Saving without changing the code adds no history.
    await put(`/api/vehicles/${v.id}`, { ...payload, notes: "label under the glovebox" });
    expect((await body(await call(`/api/vehicles/${v.id}`))).history).toHaveLength(1);

    const updated = await body(await put(`/api/vehicles/${v.id}`, { ...payload, unlock_code: "2222", erc: "AAAABBBBCCCCDDDD" }));
    expect(updated.unlock_code).toBe("2222");
    expect(updated.notes).toBeNull();
    expect(updated.history.map((e: any) => e.unlock_code)).toEqual(["2222", "1111"]);
    expect(updated.history[0].erc).toBe("AAAABBBBCCCCDDDD");
  });

  it("clearing the code keeps the history", async () => {
    const v = await create({ unlock_code: "1111" });
    const cleared = await body(await put(`/api/vehicles/${v.id}`, { ...prius, unlock_code: null }));
    expect(cleared.unlock_code).toBeNull();
    expect(cleared.code_saved_at).toBeNull();
    expect(cleared.history).toHaveLength(1);
  });

  it("refuses a second vehicle with the same VIN, however it's written", async () => {
    const v = await create();
    const r = await post("/api/vehicles", { ...prius, vin: "ZVW 30 1234567" });
    expect(r.status).toBe(409);
    expect(await body(r)).toMatchObject({ field: "vin", existing_id: v.id });

    // Editing a vehicle may keep its own VIN, but not take another's.
    const other = await create({ vin: "1HGCM82633A004352", make: "honda", unit_brand: "honda" });
    expect((await put(`/api/vehicles/${v.id}`, prius)).status).toBe(200);
    expect((await put(`/api/vehicles/${other.id}`, { ...prius })).status).toBe(409);
  });

  it("deletes a vehicle and its history", async () => {
    const v = await create({ unlock_code: "1111" });
    expect(await body(await call(`/api/vehicles/${v.id}`, { method: "DELETE" }))).toEqual({ deleted: true });
    expect((await call(`/api/vehicles/${v.id}`)).status).toBe(404);
    expect((await call(`/api/vehicles/${v.id}`, { method: "DELETE" })).status).toBe(404);
    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM code_history").first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it.each([
    [{ vin: "" }, "vin", "Enter the VIN"],
    [{ vin: "ABC" }, "vin", "That's 3 characters"],
    [{ vin: "1HGCM82633A00435O" }, "vin", "never contains I, O or Q"],
    [{ vin: "ZVW30_1234567" }, "vin", "Invalid character"],
    [{ make: "ford" }, "make", "Choose the vehicle's make"],
    [{ unit_brand: "pioneer" }, "unit_brand", "Choose the infotainment unit's brand"],
    [{ erc: "1A2B3C" }, "erc", "exactly 16"],
    [{ erc: "1A2B3C4D5E6F7A8G" }, "erc", "only uses 0-9 and A-F"],
    [{ unit_serial: "AB1" }, "unit_serial", "too short"],
    [{ unit_serial: "AB12É45" }, "unit_serial", "Invalid character"],
    [{ unlock_code: "12 34!" }, "unlock_code", "only letters, digits and dashes"],
    [{ code_source: "friend" }, "code_source", "Choose where the code came from"],
    [{ model_year: 1820 }, "model_year", "4-digit year"],
    [{ model_year: "2014" }, null, null],
    [{ notes: "x".repeat(1001) }, "notes", "too long"],
  ])("validates %j", async (over, field, message) => {
    const r = await post("/api/vehicles", { ...prius, ...over });
    if (field === null) {
      expect(r.status).toBe(201);
      return;
    }
    expect(r.status).toBe(422);
    const b = await body(r);
    expect(b.field).toBe(field);
    expect(b.error).toContain(message);
  });

  it("404s unknown and malformed ids", async () => {
    expect((await call("/api/vehicles/999")).status).toBe(404);
    expect((await call("/api/vehicles/abc")).status).toBe(404);
    expect((await put("/api/vehicles/999", prius)).status).toBe(404);
  });
});

describe("vin decoding", () => {
  const nhtsa = (row: Record<string, string>) => async () => Response.json({ Results: [row] });

  it("decodes a US VIN", async () => {
    let asked = "";
    const fetchVin = async (url: string) => {
      asked = url;
      return Response.json({ Results: [{ Make: "HONDA", Model: "Accord", Trim: "EX", ModelYear: "2003" }] });
    };
    const r = await body(await call("/api/vin/1hgcm82633a004352", {}, { fetchVin }));
    expect(asked).toContain("/DecodeVinValues/1HGCM82633A004352?format=json");
    expect(r).toMatchObject({ decoded: true, kind: "vin", check_digit_ok: true, make: "honda", model: "Accord EX", model_year: 2003 });
  });

  it("maps unknown makes to other", async () => {
    const r = await body(await call("/api/vin/11111111111111111", {}, { fetchVin: nhtsa({ Make: "FORD", Model: "Focus", ModelYear: "2015" }) }));
    expect(r).toMatchObject({ decoded: true, make: "other", make_name: "FORD" });
  });

  it("answers Japanese chassis numbers without a network call", async () => {
    const fetchVin = async (): Promise<Response> => { throw new Error("must not be called"); };
    const r = await body(await call("/api/vin/ZVW30-1234567", {}, { fetchVin }));
    expect(r).toMatchObject({ decoded: false, kind: "chassis" });
  });

  it("survives the decoder being down or not knowing the VIN", async () => {
    const down = async () => new Response("busy", { status: 503 });
    expect(await body(await call("/api/vin/11111111111111111", {}, { fetchVin: down }))).toMatchObject({ decoded: false });
    const blank = nhtsa({ Make: "", Model: "" });
    expect(await body(await call("/api/vin/11111111111111111", {}, { fetchVin: blank }))).toMatchObject({ decoded: false });
  });

  it("rejects an invalid VIN", async () => {
    expect((await call("/api/vin/ABC")).status).toBe(422);
  });
});

describe("backups", () => {
  it("round-trips through export and import, keeping history and dates", async () => {
    const v = await create({ unlock_code: "1111", code_source: "paperwork" });
    await put(`/api/vehicles/${v.id}`, { ...prius, unlock_code: "2222" });
    const r = await call("/api/export");
    expect(r.headers.get("Content-Disposition")).toMatch(/^attachment; filename="tokyo-model-vault-\d{4}-\d{2}-\d{2}\.json"$/);
    const backup = await body(r);
    expect(backup).toMatchObject({ app: "tokyo-model-vault", version: 1 });
    expect(backup.vehicles[0].history).toHaveLength(2);

    await call(`/api/vehicles/${v.id}`, { method: "DELETE" });
    expect(await body(await post("/api/import", backup))).toMatchObject({ added: 1, skipped: 0 });
    // Importing again skips what's already there.
    expect(await body(await post("/api/import", backup))).toMatchObject({ added: 0, skipped: 1 });

    const [restored] = await body(await call("/api/vehicles"));
    const detail = await body(await call(`/api/vehicles/${restored.id}`));
    expect(detail).toMatchObject({ unlock_code: "2222", created_at: v.created_at });
    expect(detail.history.map((e: any) => e.unlock_code)).toEqual(["2222", "1111"]);
  });

  it("rejects a bad backup without writing anything", async () => {
    expect((await post("/api/import", { vehicles: [] })).status).toBe(400);
    const r = await post("/api/import", {
      app: "tokyo-model-vault",
      vehicles: [{ ...prius }, { ...prius, vin: "X" }],
    });
    expect(r.status).toBe(422);
    expect((await body(r)).error).toMatch(/^Vehicle 2 in the backup/);
    expect(await body(await call("/api/vehicles"))).toEqual([]);
  });
});

describe("migration from ERC-CAL", () => {
  it("carries old codes over as vehicles", async () => {
    // Re-run 0002's carry-over on a fresh legacy row.
    await env.DB.prepare(
      "INSERT INTO unlock_codes (brand, identifier, code, model, created_at, updated_at) VALUES ('toyota', '1A2B3C4D5E6F7A8B', 'ABCD', 'Corolla', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
    ).run();
    const sql = (env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0002"))!.queries)
      .filter((q) => q.includes("INSERT INTO"));
    for (const q of sql) await env.DB.prepare(q).run();

    const [v] = await body(await call("/api/vehicles"));
    expect(v).toMatchObject({ nickname: "Imported from ERC-CAL", make: "toyota", erc: "1A2B3C4D5E6F7A8B", unlock_code: "ABCD", model: "Corolla" });
    expect((await body(await call(`/api/vehicles/${v.id}`))).history).toHaveLength(1);
  });
});

describe("api plumbing", () => {
  it("never lets responses be cached", async () => {
    expect((await call("/api/vehicles")).headers.get("Cache-Control")).toBe("no-store");
  });

  it("requires JSON requests", async () => {
    const r = await call("/api/vehicles", { method: "POST", body: "vin=x", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    expect(r.status).toBe(415);
    const bad = await call("/api/vehicles", { method: "POST", body: "{", headers: { "Content-Type": "application/json" } });
    expect(bad.status).toBe(400);
    const arr = await post("/api/vehicles", [1]);
    expect(arr.status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    expect((await post("/api/vehicles", { ...prius, notes: "x".repeat(40_000) })).status).toBe(413);
  });

  it("rejects wrong methods and unknown routes", async () => {
    expect((await call("/api/health", { method: "POST" })).status).toBe(405);
    expect((await call("/api/vehicles", { method: "DELETE" })).status).toBe(405);
    expect((await call("/api/nope")).status).toBe(404);
  });
});

describe("static site", () => {
  // Workers Static Assets serves public/ (checked end to end with
  // `npm run dev`); here we check the headers it is given.
  it("sends a strict content-security policy with every page", () => {
    const [route, ...lines] = headers.trim().split("\n");
    expect(route).toBe("/*");
    const csp = lines.find((l) => l.trim().startsWith("Content-Security-Policy:")) || "";
    for (const rule of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
      expect(csp).toContain(rule);
    }
    expect(csp).not.toContain("unsafe-inline");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
  });

  it("runs the Worker, with its auth check, for /api", async () => {
    const r = await exports.default.fetch("https://vault.test/api/health");
    expect(r.status).toBe(401);
  });
});
