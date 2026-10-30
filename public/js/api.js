/* Thin JSON client for the Worker API (VIN decoding). Errors carry a
 * user-facing message, and the `field` the server blamed. */

export class ApiError extends Error {
  constructor(message, { status = 0, field = null } = {}) {
    super(message);
    Object.assign(this, { status, field });
  }
}

export async function api(path) {
  let res;
  try {
    res = await fetch(path, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status}).`, {
      status: res.status,
      field: data && data.field,
    });
  }
  return data;
}
