/**
 * Cloudflare Access verification.
 *
 * Access sits in front of the site and only lets the owner in. As a second
 * layer, every API request must carry Access's signed JWT
 * (Cf-Access-Jwt-Assertion), verified here against the team's public keys.
 * If Access is ever misconfigured or bypassed, the API refuses rather than
 * serving codes.
 *
 * Fails closed: with ACCESS_TEAM_DOMAIN / ACCESS_AUD unset, every request is
 * rejected, unless AUTH_DISABLED is "true" (local development only).
 */

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 403 | 503 = 401) {
    super(message);
  }
}

export interface AccessIdentity {
  email: string | null;
}

export type JwksFetcher = (url: string) => Promise<{ keys: JsonWebKey[] }>;

const defaultJwksFetcher: JwksFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  return res.json();
};

const KEY_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;
let keyCache: { url: string; keys: Map<string, CryptoKey>; at: number } | null = null;

async function getKey(certsUrl: string, kid: string, fetchJwks: JwksFetcher): Promise<CryptoKey | undefined> {
  const fresh = keyCache && keyCache.url === certsUrl && Date.now() - keyCache.at < KEY_TTL_MS;
  // Refetch on a cache miss too: Access rotates keys.
  if (!fresh || !keyCache!.keys.has(kid)) {
    const { keys } = await fetchJwks(certsUrl);
    const imported = new Map<string, CryptoKey>();
    for (const jwk of keys) {
      const id = (jwk as JsonWebKey & { kid?: string }).kid;
      if (!id || jwk.kty !== "RSA") continue;
      imported.set(
        id,
        await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]),
      );
    }
    keyCache = { url: certsUrl, keys: imported, at: Date.now() };
  }
  return keyCache!.keys.get(kid);
}

function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64urlJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

/** Verify an Access JWT and return the identity it asserts. */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  audience: string,
  fetchJwks: JwksFetcher = defaultJwksFetcher,
): Promise<AccessIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("Malformed access token.");
  const [h, p, s] = parts;

  let header: Record<string, unknown>, payload: Record<string, unknown>;
  try {
    header = b64urlJson(h);
    payload = b64urlJson(p);
  } catch {
    throw new AuthError("Malformed access token.");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new AuthError("Unsupported access token.");

  const key = await getKey(`${teamDomain}/cdn-cgi/access/certs`, header.kid, fetchJwks);
  if (!key) throw new AuthError("Unknown access token key.");
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new AuthError("Invalid access token signature.");

  const nowS = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_S < nowS) throw new AuthError("Access token expired.");
  if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_S > nowS) throw new AuthError("Access token not yet valid.");
  if (payload.iss !== teamDomain) throw new AuthError("Access token from the wrong issuer.");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audience)) throw new AuthError("Access token for a different application.");

  return { email: typeof payload.email === "string" ? payload.email : null };
}

/** Throws AuthError unless the request carries a valid Access token for
 * an allowed identity. */
export async function requireAccess(
  request: Request,
  env: Env,
  fetchJwks: JwksFetcher = defaultJwksFetcher,
): Promise<AccessIdentity> {
  if (env.AUTH_DISABLED === "true") return { email: null };

  const team = (env.ACCESS_TEAM_DOMAIN || "").replace(/\/+$/, "");
  const aud = env.ACCESS_AUD || "";
  if (!team || !aud) throw new AuthError("Login is not configured on the server.", 503);

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AuthError("Not signed in.");
  const identity = await verifyAccessJwt(token, team, aud, fetchJwks);

  const allowed = (env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes((identity.email || "").toLowerCase())) {
    throw new AuthError("This account is not allowed.", 403);
  }
  return identity;
}

/** Test hook: forget cached keys. */
export function _resetKeyCache(): void {
  keyCache = null;
}
