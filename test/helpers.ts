import { handleRequest, type Deps } from "../src/index";

export function call(path: string, init: RequestInit = {}, deps: Deps = {}): Promise<Response> {
  // Caching is off unless a test asks for it, so tests can't leak into each other.
  return handleRequest(new Request(`https://vault.test${path}`, init), { cache: null, ...deps });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const body = async (r: Response): Promise<any> => r.json();

/** An in-memory stand-in for localStorage. */
export function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}
