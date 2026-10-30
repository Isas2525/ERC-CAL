/**
 * VIN decoding through NHTSA's free vPIC service. It knows vehicles sold in
 * North America; Japanese-market chassis numbers aren't VINs, so those are
 * answered locally with a hint instead of a network call.
 */

import { checkVin, MAKES } from "../public/js/shared/rules.js";
import { ValidationError } from "./validation";

export type VinFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface VinDecodeResult {
  decoded: boolean;
  kind: "vin" | "chassis";
  check_digit_ok: boolean | null;
  make: string | null;       // one of MAKES' keys, when recognized
  make_name: string | null;  // as NHTSA spells it
  model: string | null;
  model_year: number | null;
  message: string;
}

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function decodeVin(raw: string, fetcher: VinFetcher = fetch): Promise<VinDecodeResult> {
  const vin = checkVin(raw);
  if (vin.error) throw new ValidationError(vin.error, "vin");
  const base = { kind: vin.kind as VinDecodeResult["kind"], check_digit_ok: vin.check_digit_ok ?? null };
  const miss = (message: string): VinDecodeResult =>
    ({ ...base, decoded: false, make: null, make_name: null, model: null, model_year: null, message });

  if (vin.kind === "chassis") {
    return miss("That's a Japanese chassis (frame) number. Online decoders can't read those, so fill in the make and model yourself.");
  }

  let row: Record<string, unknown> | undefined;
  try {
    const res = await fetcher(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin.key!)}?format=json`,
      { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`vPIC answered ${res.status}`);
    row = ((await res.json()) as { Results?: Record<string, unknown>[] }).Results?.[0];
  } catch (err) {
    console.error("vin decode failed", err);
    return miss("The VIN lookup service isn't answering right now. Fill in the details yourself, or try again later.");
  }

  const makeName = clean(row?.Make);
  if (!makeName) return miss("No match for this VIN in the US database. It may be a non-US vehicle; fill in the details yourself.");

  const year = Number(clean(row?.ModelYear));
  const make = MAKES.find((m) => m.name.toLowerCase() === makeName.toLowerCase());
  return {
    ...base,
    decoded: true,
    make: make?.key ?? "other",
    make_name: makeName,
    model: [clean(row?.Model), clean(row?.Trim)].filter(Boolean).join(" ") || null,
    model_year: Number.isInteger(year) && year > 1900 ? year : null,
    message: `Decoded: ${[year || null, make && make.key !== "other" ? make.name : makeName, clean(row?.Model)].filter(Boolean).join(" ")}.`,
  };
}
