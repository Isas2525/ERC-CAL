/**
 * Turns a request body into a VehicleInput, or throws a ValidationError
 * naming the offending field so the form can point at it. The rules
 * themselves live in public/js/shared/rules.js, shared with the browser.
 */

import {
  checkCode,
  checkErc,
  checkSerial,
  checkText,
  checkVin,
  checkYear,
  findMake,
  findSource,
} from "../public/js/shared/rules.js";
import { findUnit } from "../public/js/shared/units.js";

export class ValidationError extends Error {
  constructor(message: string, readonly field: string | null = null) {
    super(message);
  }
}

export interface VehicleInput {
  nickname: string | null;
  vin: string;
  vin_key: string;
  make: string;
  model: string | null;
  model_year: number | null;
  unit_brand: string;
  unit_model: string | null;
  unit_serial: string | null;
  erc: string | null;
  unlock_code: string | null;
  code_source: string | null;
  notes: string | null;
}

type Check<T> = { value?: T; error?: string };

function take<T>(result: Check<T>, field: string): T {
  if (result.error) throw new ValidationError(result.error, field);
  return result.value as T;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function parseVehicle(body: Record<string, unknown>): VehicleInput {
  const vin = checkVin(body.vin);
  if (vin.error) throw new ValidationError(vin.error, "vin");

  const make = typeof body.make === "string" ? findMake(body.make) : undefined;
  if (!make) throw new ValidationError("Choose the vehicle's make.", "make");

  const unit = typeof body.unit_brand === "string" ? findUnit(body.unit_brand) : undefined;
  if (!unit) throw new ValidationError("Choose the infotainment unit's brand.", "unit_brand");

  let code_source: string | null = null;
  if (body.code_source != null && body.code_source !== "") {
    const source = typeof body.code_source === "string" ? findSource(body.code_source) : undefined;
    if (!source) throw new ValidationError("Choose where the code came from.", "code_source");
    code_source = source.key;
  }

  return {
    nickname: take(checkText(body.nickname, 60, "Nickname"), "nickname"),
    vin: vin.value!,
    vin_key: vin.key!,
    make: make.key,
    model: take(checkText(body.model, 60, "Model"), "model"),
    model_year: take(checkYear(body.model_year), "model_year"),
    unit_brand: unit.key,
    unit_model: take(checkText(body.unit_model, 40, "Unit model"), "unit_model")?.toUpperCase() ?? null,
    unit_serial: take(checkSerial(str(body.unit_serial)), "unit_serial"),
    erc: take(checkErc(str(body.erc)), "erc"),
    unlock_code: take(checkCode(str(body.unlock_code)), "unlock_code"),
    code_source,
    notes: take(checkText(body.notes, 1000, "Notes"), "notes"),
  };
}
