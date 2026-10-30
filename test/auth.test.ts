import { describe, expect, it } from "vitest";
import { accessEnv, AUD, call, makeSigner, TEAM, validClaims } from "./helpers";

const withToken = (token: string) => ({ headers: { "Cf-Access-Jwt-Assertion": token } });

async function setup() {
  const signer = await makeSigner();
  let fetches = 0;
  const fetchJwks = async (url: string) => {
    fetches++;
    expect(url).toBe(`${TEAM}/cdn-cgi/access/certs`);
    return { keys: [signer.publicJwk] };
  };
  const get = (token: string | null, env = accessEnv()) =>
    call("/api/health", token ? withToken(token) : {}, { env, fetchJwks });
  return { signer, get, fetches: () => fetches };
}

describe("cloudflare access", () => {
  it("refuses everything when login isn't configured", async () => {
    const { signer, get } = await setup();
    const token = await signer.sign(validClaims());
    const r = await get(token, accessEnv({ ACCESS_AUD: "" }));
    expect(r.status).toBe(503);
  });

  it("refuses requests with no token", async () => {
    const { get } = await setup();
    expect((await get(null)).status).toBe(401);
  });

  it("accepts a valid token and caches the keys", async () => {
    const { signer, get, fetches } = await setup();
    const token = await signer.sign(validClaims());
    expect((await get(token)).status).toBe(200);
    expect((await get(token)).status).toBe(200);
    expect(fetches()).toBe(1);
  });

  it("accepts a string audience", async () => {
    const { signer, get } = await setup();
    expect((await get(await signer.sign(validClaims({ aud: AUD })))).status).toBe(200);
  });

  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 120 }],
    ["not yet valid", { nbf: Math.floor(Date.now() / 1000) + 600 }],
    ["wrong issuer", { iss: "https://evil.cloudflareaccess.com" }],
    ["wrong audience", { aud: ["someone-else"] }],
    ["no expiry", { exp: undefined }],
  ])("rejects a token that is %s", async (_label, over) => {
    const { signer, get } = await setup();
    const r = await get(await signer.sign(validClaims(over)));
    expect(r.status).toBe(401);
  });

  it("rejects a token signed by another key", async () => {
    const { get } = await setup();
    const imposter = await makeSigner("key-1");
    expect((await get(await imposter.sign(validClaims()))).status).toBe(401);
  });

  it("rejects an unsigned token", async () => {
    const { signer, get } = await setup();
    const signed = await signer.sign(validClaims(), { alg: "none" });
    const [h, p] = signed.split(".");
    expect((await get(`${h}.${p}.`)).status).toBe(401);
  });

  it.each(["garbage", "a.b.c", ""])("rejects malformed token %j", async (token) => {
    const r = await call("/api/health", withToken(token), { env: accessEnv(), fetchJwks: async () => ({ keys: [] }) });
    expect(r.status).toBe(401);
  });

  it("enforces the allowed-email list", async () => {
    const { signer, get } = await setup();
    const token = await signer.sign(validClaims({ email: "Owner@Example.com" }));
    expect((await get(token, accessEnv({ ALLOWED_EMAILS: "owner@example.com" }))).status).toBe(200);
    expect((await get(token, accessEnv({ ALLOWED_EMAILS: "someone@else.com" }))).status).toBe(403);
  });

  it("guards every API route, not just health", async () => {
    for (const path of ["/api/vehicles", "/api/vehicles/1", "/api/export", "/api/vin/ZVW301234567"]) {
      expect((await call(path, {}, { env: accessEnv() })).status).toBe(401);
    }
  });
});
