/* Thin JSON client for the Worker API. Errors carry a user-facing message,
 * and the `field` the server blamed so forms can point at it. */

export class ApiError extends Error {
  constructor(message, { status = 0, field = null, expired = false, data = null } = {}) {
    super(message);
    Object.assign(this, { status, field, expired, data });
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // When the login expires, Cloudflare Access answers with a redirect to
      // its sign-in page; catch it instead of following it.
      redirect: "manual",
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.");
  }
  if (res.type === "opaqueredirect" || res.status === 401) {
    throw new ApiError("Your sign-in has expired. Reload the page to sign in again.", { status: 401, expired: true });
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status}).`, {
      status: res.status,
      field: data && data.field,
      data,
    });
  }
  return data;
}

/** Vehicle fields the API accepts, taken from a stored vehicle. */
export const editable = (v) => ({
  nickname: v.nickname, vin: v.vin, make: v.make, model: v.model, model_year: v.model_year,
  unit_brand: v.unit_brand, unit_model: v.unit_model, unit_serial: v.unit_serial, erc: v.erc,
  unlock_code: v.unlock_code, code_source: v.code_source, notes: v.notes,
});
