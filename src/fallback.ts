/**
 * Fallback lookup providers, asked when a code is not in the local
 * database: e.g. a licensed radio-code service you subscribe to. None is
 * configured by default. Hits are cached into D1 by the caller.
 */

export interface FallbackProvider {
  name: string;
  /** Return the code, or null when this provider has none. Throw only
   * for real failures (network, auth); the caller logs and skips them. */
  lookup(brand: string, identifier: string): Promise<string | null>;
}

/** Providers enabled for this deployment, in priority order. Gate each on
 * its own secret, e.g. `if (env.MY_SERVICE_KEY) providers.push(...)`. */
export function buildProviders(_env: Env): FallbackProvider[] {
  return [];
}

export async function queryProviders(
  providers: FallbackProvider[],
  brand: string,
  identifier: string,
): Promise<{ code: string; provider: string } | null> {
  for (const provider of providers) {
    try {
      const code = await provider.lookup(brand, identifier);
      if (code) return { code, provider: provider.name };
    } catch (err) {
      // A failing provider must not break the lookup.
      console.error(`fallback provider ${provider.name} failed`, err);
    }
  }
  return null;
}
