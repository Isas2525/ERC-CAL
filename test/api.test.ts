import { describe, expect, it } from "vitest";
import type { FallbackProvider } from "../src/fallback";
import { call, post } from "./helpers";

const body = async (r: Response) => (await r.json()) as Record<string, any>;

describe("api", () => {
  it("reports health", async () => {
    const r = await call("/api/health");
    expect(r.status).toBe(200);
    expect(await body(r)).toEqual({ status: "ok", codes_stored: 0 });
  });

  it("lists brands in order with their rules", async () => {
    const brands = (await (await call("/api/brands")).json()) as any[];
    expect(brands.map((b) => b.key)).toEqual(["toyota", "lexus", "nissan", "honda", "mitsubishi", "clarion"]);
    expect(brands[0].min_len).toBe(16);
    expect(brands[0].max_len).toBe(16);
    expect(brands[0].identifier_noun).toBe("ERC code");
    expect(brands[0].retrieval_steps.length).toBeGreaterThan(0);
  });

  it("saves then finds a code, however the identifier is typed", async () => {
    const saved = await post("/api/codes", {
      brand: "toyota",
      identifier: "1a2b 3c4d-5e6f.7a8b",
      code: "abcd1234",
      model: "Corolla",
      model_year: 2019,
      notes: "dealer invoice",
    });
    expect(saved.status).toBe(200);
    expect(await body(saved)).toMatchObject({ created: true, identifier: "1A2B3C4D5E6F7A8B", code: "ABCD1234" });

    const found = await body(await post("/api/lookup", { brand: "Toyota", identifier: "1A2B3C4D5E6F7A8B" }));
    expect(found).toMatchObject({
      found: true,
      code: "ABCD1234",
      source: "local",
      model: "Corolla",
      model_year: 2019,
      notes: "dealer invoice",
    });
    expect((await body(await call("/api/health"))).codes_stored).toBe(1);
  });

  it("updates an existing code", async () => {
    const payload = { brand: "nissan", identifier: "BP1234567", code: "1111" };
    expect((await body(await post("/api/codes", payload))).created).toBe(true);
    const updated = await body(await post("/api/codes", { ...payload, code: "2222" }));
    expect(updated).toMatchObject({ created: false, message: "Code updated." });
    expect((await body(await post("/api/lookup", { brand: "nissan", identifier: "bp1234567" }))).code).toBe("2222");
  });

  it("explains a miss", async () => {
    const r = await post("/api/lookup", { brand: "honda", identifier: "U1234567" });
    expect(r.status).toBe(200);
    const b = await body(r);
    expect(b.found).toBe(false);
    expect(b.code).toBeNull();
    expect(b.message.startsWith("Nothing is stored for Honda radio serial U1234567.")).toBe(true);
  });

  it("keeps brands separate", async () => {
    await post("/api/codes", { brand: "nissan", identifier: "AB12345", code: "9999" });
    expect((await body(await post("/api/lookup", { brand: "clarion", identifier: "AB12345" }))).found).toBe(false);
  });

  it.each([
    [{ brand: "", identifier: "x" }, "brand", "choose a brand"],
    [{ brand: "ford", identifier: "x" }, "brand", "Unsupported brand"],
    [{ brand: 7, identifier: "x" }, "brand", "choose a brand"],
    [{ brand: "toyota", identifier: "   " }, "identifier", "Please enter the ERC code."],
    [{ brand: "toyota" }, "identifier", "Please enter the ERC code."],
    [{ brand: "toyota", identifier: "1A2B3C" }, "identifier", "exactly 16"],
    [{ brand: "toyota", identifier: "1A2B3C4D5E6F7A8G" }, "identifier", "Non-hexadecimal"],
    [{ brand: "toyota", identifier: "1A2B3C4D5E6F7A8!" }, "identifier", "Invalid character"],
    [{ brand: "nissan", identifier: "BP12" }, "identifier", "Too short"],
    [{ brand: "nissan", identifier: "BP1234567890123" }, "identifier", "Too long"],
    [{ brand: "nissan", identifier: "BP12345É" }, "identifier", "Invalid character"],
    // toUpperCase() would turn ß into SS and make this look valid.
    [{ brand: "nissan", identifier: "BP12345ß" }, "identifier", "Invalid character"],
    [{ brand: "nissan", identifier: "B".repeat(129) }, "identifier", "too long"],
  ])("rejects lookup %j", async (payload, field, fragment) => {
    const r = await post("/api/lookup", payload);
    expect(r.status).toBe(422);
    const b = await body(r);
    expect(b.field).toBe(field);
    expect(b.error).toContain(fragment);
  });

  it.each([
    ["", "Please enter the unlock code"],
    ["12 34", "only letters, digits and dashes"],
    ["X".repeat(33), "too long"],
    ["１２３４", "only letters, digits and dashes"],
  ])("rejects stored code %j", async (code, fragment) => {
    const r = await post("/api/codes", { brand: "honda", identifier: "U1234567", code });
    expect(r.status).toBe(422);
    const b = await body(r);
    expect(b.field).toBe("code");
    expect(b.error).toContain(fragment);
  });

  it.each([1700, 2019.5, "2019"])("rejects model_year %j", async (model_year) => {
    const r = await post("/api/codes", { brand: "honda", identifier: "U1234567", code: "12345", model_year });
    expect(r.status).toBe(422);
    expect((await body(r)).field).toBe("model_year");
  });

  it("rejects over-long notes", async () => {
    const r = await post("/api/codes", { brand: "honda", identifier: "U1234567", code: "1", notes: "n".repeat(501) });
    expect(r.status).toBe(422);
    expect((await body(r)).field).toBe("notes");
  });

  it("deletes", async () => {
    await post("/api/codes", { brand: "mitsubishi", identifier: "MIT12345", code: "4321" });
    const r = await call("/api/codes/mitsubishi/mit-12345", { method: "DELETE" });
    expect(await body(r)).toEqual({ deleted: true });
    expect((await call("/api/codes/mitsubishi/MIT12345", { method: "DELETE" })).status).toBe(404);
  });

  it("uses a fallback provider once, then the cache", async () => {
    let calls = 0;
    const provider: FallbackProvider = {
      name: "test-provider",
      async lookup(_b, id) {
        calls++;
        return id === "PE1234567" ? "7777" : null;
      },
    };
    const first = await body(await post("/api/lookup", { brand: "clarion", identifier: "PE1234567" }, { providers: [provider] }));
    expect(first).toMatchObject({ found: true, code: "7777", source: "test-provider" });
    const second = await body(await post("/api/lookup", { brand: "clarion", identifier: "PE1234567" }, { providers: [provider] }));
    expect(second.source).toBe("local");
    expect(calls).toBe(1);
  });

  it("survives a failing provider", async () => {
    const broken: FallbackProvider = {
      name: "broken",
      async lookup() {
        throw new Error("network down");
      },
    };
    const r = await post("/api/lookup", { brand: "clarion", identifier: "PE7654321" }, { providers: [broken] });
    expect(r.status).toBe(200);
    expect((await body(r)).found).toBe(false);
  });

  it("never lets responses be cached", async () => {
    const r = await call("/api/health");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("requires JSON requests", async () => {
    const form = await call("/api/codes", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ brand: "honda", identifier: "U1234567", code: "1" }),
    });
    expect(form.status).toBe(415);
    const broken = await call("/api/codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect(broken.status).toBe(400);
    expect((await call("/api/codes", { method: "POST", json: [1] })).status).toBe(400);
  });

  it("rejects wrong methods and unknown routes", async () => {
    expect((await call("/api/lookup")).status).toBe(405);
    expect((await call("/api/codes", { method: "GET" })).status).toBe(405);
    expect((await call("/api/nope")).status).toBe(404);
  });
});

describe("frontend", () => {
  it("serves the page with a strict content-security policy", async () => {
    const r = await call("/");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("text/html");
    expect(await r.text()).toContain("ERC-CAL");
    const csp = r.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("serves scripts and styles with the right types", async () => {
    expect((await call("/app.js")).headers.get("Content-Type")).toContain("javascript");
    expect((await call("/theme.js")).headers.get("Content-Type")).toContain("javascript");
    expect((await call("/styles.css")).headers.get("Content-Type")).toContain("text/css");
  });

  it("answers revalidation with 304", async () => {
    const etag = (await call("/app.js")).headers.get("ETag")!;
    const again = await call("/app.js", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
  });

  it("404s unknown files", async () => {
    expect((await call("/wp-admin")).status).toBe(404);
  });
});
