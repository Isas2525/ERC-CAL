/**
 * Input validation. Every failure is a ValidationError whose message is
 * safe and helpful to show the user, with `field` naming the input so the
 * frontend can highlight it.
 */

import { BRANDS, type Brand, getBrand, normalize, stripSeparators } from "./brands";

export class ValidationError extends Error {
  constructor(message: string, readonly field: string | null = "identifier") {
    super(message);
  }
}

const ALNUM = /^[0-9A-Za-z]$/;
const HEX = /^[0-9A-F]$/;

export function resolveBrand(key: unknown): Brand {
  if (typeof key !== "string" || !key.trim()) {
    throw new ValidationError("Please choose a brand.", "brand");
  }
  const brand = getBrand(key);
  if (!brand) {
    const supported = BRANDS.map((b) => b.name).join(", ");
    throw new ValidationError(`Unsupported brand '${key}'. Supported brands: ${supported}.`, "brand");
  }
  return brand;
}

/** Normalize and validate an identifier for `brand`; returns the lookup key. */
export function normalizeIdentifier(brand: Brand, raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ValidationError(`Please enter the ${brand.identifier_noun}.`);
  }
  // Characters first: a bad character is a clearer message than a length
  // complaint when both are wrong. Checked before upper-casing, because
  // toUpperCase() turns some non-ASCII letters into ASCII ("ß" -> "SS").
  const stripped = stripSeparators(raw);
  const bad = [...new Set(stripped)].filter((c) => !ALNUM.test(c)).sort();
  if (bad.length) {
    throw new ValidationError(`Invalid character(s) ${bad.map((c) => `'${c}'`).join(" ")}. ${brand.requirement}`);
  }
  const value = normalize(raw);

  const len = value.length;
  if (brand.min_len === brand.max_len && len !== brand.min_len) {
    throw new ValidationError(
      `Expected exactly ${brand.min_len} characters but got ${len}. ${brand.requirement}`,
    );
  }
  if (len < brand.min_len) {
    throw new ValidationError(`Too short (${len} characters, minimum ${brand.min_len}). ${brand.requirement}`);
  }
  if (len > brand.max_len) {
    throw new ValidationError(`Too long (${len} characters, maximum ${brand.max_len}). ${brand.requirement}`);
  }

  if (!new RegExp(brand.pattern).test(value)) {
    // Length is fine, so the character class is wrong (e.g. a non-hex
    // letter in a hex-only field). Name the offenders.
    if (brand.pattern.startsWith("^[0-9A-F]")) {
      const nonHex = [...new Set(value)].filter((c) => !HEX.test(c)).sort();
      if (nonHex.length) {
        throw new ValidationError(`Non-hexadecimal character(s) ${nonHex.join(" ")}. ${brand.requirement}`);
      }
    }
    throw new ValidationError(`Unrecognized format. ${brand.requirement}`);
  }
  return value;
}

/** Validate an unlock code being stored by the owner. */
export function validateCode(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ValidationError("Please enter the unlock code to store.", "code");
  }
  const value = raw.trim().toUpperCase();
  if (value.length > 32) throw new ValidationError("Unlock code is too long (max 32 characters).", "code");
  if (!/^[0-9A-Z-]+$/.test(value)) {
    throw new ValidationError("Unlock code may contain only letters, digits and dashes.", "code");
  }
  return value;
}

/** Optional free-text field: trimmed string, or null when empty. */
export function optionalText(raw: unknown, field: string, max: number): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new ValidationError(`${field} must be text.`, field);
  const value = raw.trim();
  if (value.length > max) throw new ValidationError(`${field} is too long (max ${max} characters).`, field);
  return value || null;
}

export function optionalYear(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1980 || raw > 2100) {
    throw new ValidationError("Year must be a 4-digit year between 1980 and 2100.", "model_year");
  }
  return raw;
}
