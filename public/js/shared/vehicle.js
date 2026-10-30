/**
 * Turns form input into a clean vehicle record, or throws a
 * VehicleError naming the offending field so the form can point at it.
 */

import { checkCode, checkErc, checkSerial, checkText, checkVin, checkYear, findMake, findSource } from "./rules.js";
import { findUnit } from "./units.js";

export class VehicleError extends Error {
  constructor(message, field = null, extra = {}) {
    super(message);
    this.field = field;
    Object.assign(this, extra);
  }
}

function take(result, field) {
  if (result.error) throw new VehicleError(result.error, field);
  return result.value;
}

const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function parseVehicle(body) {
  const vin = checkVin(body.vin);
  if (vin.error) throw new VehicleError(vin.error, "vin");

  const make = typeof body.make === "string" ? findMake(body.make) : undefined;
  if (!make) throw new VehicleError("Choose the vehicle's make.", "make");

  const unit = typeof body.unit_brand === "string" ? findUnit(body.unit_brand) : undefined;
  if (!unit) throw new VehicleError("Choose the infotainment unit's brand.", "unit_brand");

  let code_source = null;
  if (body.code_source != null && body.code_source !== "") {
    const source = typeof body.code_source === "string" ? findSource(body.code_source) : undefined;
    if (!source) throw new VehicleError("Choose where the code came from.", "code_source");
    code_source = source.key;
  }

  return {
    nickname: take(checkText(body.nickname, 60, "Nickname"), "nickname"),
    vin: vin.value,
    vin_key: vin.key,
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
