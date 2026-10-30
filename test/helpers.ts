import { env } from "cloudflare:test";
import { handleRequest, type Deps } from "../src/index";

export const TEAM = "https://tmv-test.cloudflareaccess.com";
export const AUD = "test-audience-tag";

/** Env with auth switched off, for tests about the API itself. */
export const openEnv = (): Env => ({ ...env, AUTH_DISABLED: "true" }) as Env;

/** Env with Access configured, for auth tests. */
export const accessEnv = (extra: Partial<Record<string, string>> = {}): Env =>
  ({ ...env, AUTH_DISABLED: "", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ...extra }) as Env;

export function call(
  path: string,
  init: RequestInit & { json?: unknown } = {},
  opts: { env?: Env } & Deps = {},
): Promise<Response> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const request = new Request(`https://vault.test${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  return handleRequest(request, opts.env ?? openEnv(), { fetchJwks: opts.fetchJwks, fetchVin: opts.fetchVin });
}

export const post = (path: string, json: unknown, opts?: Parameters<typeof call>[2]) =>
  call(path, { method: "POST", json }, opts);

export const put = (path: string, json: unknown, opts?: Parameters<typeof call>[2]) =>
  call(path, { method: "PUT", json }, opts);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const body = async (r: Response): Promise<any> => r.json();

// --- Signing test JWTs ------------------------------------------------------

const b64url = (bytes: Uint8Array | string) => {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = "";
  for (const b of raw) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function makeSigner(kid = "key-1") {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const publicJwk = { ...jwk, kid, alg: "RS256", use: "sig" };

  async function sign(claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
    const h = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT", ...header }));
    const p = b64url(JSON.stringify(claims));
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
  }
  return { publicJwk, sign };
}

export const validClaims = (over: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return { iss: TEAM, aud: [AUD], email: "owner@example.com", iat: now, nbf: now, exp: now + 3600, ...over };
};
