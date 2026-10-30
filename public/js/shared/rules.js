/**
 * Validation and normalization shared by the browser and the Worker.
 *
 * The Worker imports this file directly (see src/validation.ts), so the
 * instant feedback in the form and the server's final check can never
 * disagree. Every check returns { value } on success or { error } with a
 * message that is safe to show the user.
 */

/** Spaces, dots and dashes are noise in a hand-typed identifier. */
export const stripSeparators = (raw) => String(raw ?? "").replace(/[\s.-]/g, "");
export const toKey = (raw) => stripSeparators(raw).toUpperCase();

/** Characters other than ASCII letters and digits, checked before
 * upper-casing because toUpperCase() turns "ß" into "SS". */
function badChars(raw) {
  return [...new Set(stripSeparators(raw))].filter((c) => !/^[0-9A-Za-z]$/.test(c)).sort();
}
const listChars = (chars) => chars.map((c) => `'${c}'`).join(" ");

// ---- VIN / chassis number ---------------------------------------------------

const VIN_VALUES = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** ISO 3779 check digit (position 9). Mandatory in North America only, so a
 * mismatch is a warning, never a rejection. */
export function vinCheckDigitOk(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = /\d/.test(c) ? Number(c) : VIN_VALUES[c];
    if (v === undefined) return false;
    sum += v * VIN_WEIGHTS[i];
  }
  const expected = sum % 11 === 10 ? "X" : String(sum % 11);
  return vin[8] === expected;
}

/**
 * A 17-character VIN, or the shorter chassis (frame) number that
 * Japanese-market cars carry instead, e.g. "ZVW30-1234567".
 * Returns { value, key, kind: "vin" | "chassis", check_digit_ok } or { error }.
 */
export function checkVin(raw) {
  const value = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!value) return { error: "Enter the VIN or chassis number." };
  const bad = badChars(raw);
  if (bad.length) return { error: `Invalid character(s) ${listChars(bad)}. Use only letters, digits and dashes.` };
  const key = toKey(value);
  if (key.length === 17) {
    if (/[IOQ]/.test(key)) {
      return { error: "A 17-character VIN never contains I, O or Q. Check for the digits 1 and 0." };
    }
    return { value, key, kind: "vin", check_digit_ok: vinCheckDigitOk(key) };
  }
  if (key.length >= 6 && key.length <= 16) {
    return { value, key, kind: "chassis", check_digit_ok: null };
  }
  return {
    error:
      `That's ${key.length} characters. Enter the 17-character VIN, or the chassis (frame) number ` +
      "on Japanese-market cars, e.g. ZVW30-1234567.",
  };
}

// ---- Head unit identifiers --------------------------------------------------

/** The 16-character ERC that Toyota/Lexus units show on their service screen. */
export function checkErc(raw) {
  const bad = badChars(raw);
  if (bad.length) return { error: `Invalid character(s) ${listChars(bad)}. The ERC is 16 characters, 0-9 and A-F.` };
  const value = toKey(raw);
  if (!value) return { value: null };
  if (value.length !== 16) return { error: `The ERC is exactly 16 characters; this has ${value.length}.` };
  const nonHex = [...new Set(value)].filter((c) => !/[0-9A-F]/.test(c)).sort();
  if (nonHex.length) {
    return { error: `The ERC only uses 0-9 and A-F, so ${listChars(nonHex)} must be a misread (O is usually 0).` };
  }
  return { value };
}

export function checkSerial(raw) {
  const bad = badChars(raw);
  if (bad.length) return { error: `Invalid character(s) ${listChars(bad)}. Use only letters and digits.` };
  const value = toKey(raw);
  if (!value) return { value: null };
  if (value.length < 4) return { error: "That serial looks too short (at least 4 characters)." };
  if (value.length > 24) return { error: "That serial looks too long (at most 24 characters)." };
  return { value };
}

export function checkCode(raw) {
  const value = String(raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!value) return { value: null };
  if (value.length > 32) return { error: "Unlock codes are at most 32 characters." };
  if (!/^[0-9A-Z-]+$/.test(value)) return { error: "Unlock codes contain only letters, digits and dashes." };
  return { value };
}

export function checkYear(raw) {
  if (raw == null || raw === "") return { value: null };
  const n = typeof raw === "number" ? raw : /^\d{4}$/.test(String(raw).trim()) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1950 || n > 2100) return { error: "Year must be a 4-digit year, e.g. 2014." };
  return { value: n };
}

export function checkText(raw, max, label) {
  if (raw == null) return { value: null };
  if (typeof raw !== "string") return { error: `${label} must be text.` };
  const value = raw.trim();
  if (value.length > max) return { error: `${label} is too long (max ${max} characters).` };
  return { value: value || null };
}

// ---- Choices ----------------------------------------------------------------

/** Vehicle makes, with the head-unit guide each one starts on. */
export const MAKES = [
  { key: "toyota", name: "Toyota", unit: "toyota" },
  { key: "lexus", name: "Lexus", unit: "lexus" },
  { key: "nissan", name: "Nissan", unit: "nissan" },
  { key: "honda", name: "Honda", unit: "honda" },
  { key: "mitsubishi", name: "Mitsubishi", unit: "mitsubishi" },
  { key: "mazda", name: "Mazda", unit: "other" },
  { key: "subaru", name: "Subaru", unit: "other" },
  { key: "suzuki", name: "Suzuki", unit: "other" },
  { key: "daihatsu", name: "Daihatsu", unit: "other" },
  { key: "acura", name: "Acura", unit: "honda" },
  { key: "infiniti", name: "Infiniti", unit: "nissan" },
  { key: "other", name: "Other", unit: "other" },
];

export const CODE_SOURCES = [
  { key: "dealer", name: "Dealer" },
  { key: "manufacturer", name: "Manufacturer service" },
  { key: "paperwork", name: "Original paperwork / code card" },
  { key: "provider", name: "Paid code service" },
  { key: "other", name: "Other" },
];

export const findMake = (key) => MAKES.find((m) => m.key === key);
export const findSource = (key) => CODE_SOURCES.find((s) => s.key === key);
