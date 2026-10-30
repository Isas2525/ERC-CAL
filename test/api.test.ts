import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import headers from "../public/_headers?raw";
import { body, call } from "./helpers";

const nhtsa = (row: Record<string, string>) => async () => Response.json({ Results: [row] });

describe("vin decoding", () => {
  it("decodes a US VIN", async () => {
    let asked = "";
    const fetchVin = async (url: string) => {
      asked = url;
      return Response.json({ Results: [{ Make: "HONDA", Model: "Accord", Trim: "EX", ModelYear: "2003" }] });
    };
    const r = await call("/api/vin/1hgcm82633a004352", {}, { fetchVin });
    expect(asked).toContain("/DecodeVinValues/1HGCM82633A004352?format=json");
    expect(await body(r)).toMatchObject({
      decoded: true, kind: "vin", check_digit_ok: true, make: "honda", model: "Accord EX", model_year: 2003,
      message: "Decoded: 2003 Honda Accord.",
    });
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
    const r = await call("/api/vin/ABC");
    expect(r.status).toBe(422);
    expect(await body(r)).toMatchObject({ field: "vin" });
  });

  it("caches decoded VINs at the edge, but not failures", async () => {
    const cache = await caches.open(`test-${crypto.randomUUID()}`);
    let calls = 0;
    const counting = (ok: boolean) => async () => {
      calls++;
      return ok ? Response.json({ Results: [{ Make: "HONDA", Model: "Fit", ModelYear: "2010" }] }) : new Response("", { status: 503 });
    };
    await call("/api/vin/JHMGE8H50AS000000", {}, { cache, fetchVin: counting(false) });
    await call("/api/vin/JHMGE8H50AS000000", {}, { cache, fetchVin: counting(true) });
    const third = await call("/api/vin/JHMGE8H50AS000000", {}, { cache, fetchVin: counting(true) });
    expect(calls).toBe(2);
    expect(await body(third)).toMatchObject({ decoded: true, model: "Fit" });
  });
});

describe("api plumbing", () => {
  it("is open: no login needed", async () => {
    expect(await body(await call("/api/health"))).toEqual({ status: "ok" });
    const r = await exports.default.fetch("https://vault.test/api/health");
    expect(r.status).toBe(200);
  });

  it("rejects writes and unknown routes", async () => {
    expect((await call("/api/health", { method: "POST" })).status).toBe(405);
    expect((await call("/api/vehicles")).status).toBe(404);
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
});
