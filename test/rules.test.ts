import { describe, expect, it } from "vitest";
import { checkCode, checkErc, checkSerial, checkVin, checkYear, MAKES, vinCheckDigitOk } from "../public/js/shared/rules.js";
import { findUnit, UNITS, usesErc, vehicleStatus } from "../public/js/shared/units.js";

describe("vin", () => {
  it("validates check digits", () => {
    expect(vinCheckDigitOk("1HGCM82633A004352")).toBe(true);
    expect(vinCheckDigitOk("11111111111111111")).toBe(true);
    expect(vinCheckDigitOk("1HGCM82643A004352")).toBe(false);
  });

  it("tells VINs and Japanese chassis numbers apart", () => {
    expect(checkVin(" jtdkb20u 093123456 ")).toMatchObject({ kind: "vin", key: "JTDKB20U093123456", value: "JTDKB20U093123456" });
    expect(checkVin("ZVW30-1234567")).toMatchObject({ kind: "chassis", key: "ZVW301234567", value: "ZVW30-1234567", check_digit_ok: null });
  });

  it("explains what's wrong", () => {
    expect(checkVin("").error).toMatch(/Enter the VIN/);
    expect(checkVin("ẞ1234567").error).toMatch(/Invalid character/);
    expect(checkVin("A".repeat(18)).error).toMatch(/18 characters/);
  });
});

describe("unit identifiers", () => {
  it("ERC", () => {
    expect(checkErc("")).toEqual({ value: null });
    expect(checkErc("1a2b-3c4d 5e6f.7a8b")).toEqual({ value: "1A2B3C4D5E6F7A8B" });
    expect(checkErc("1A2B3C4D5E6F7A8O").error).toMatch(/O is usually 0/);
  });

  it("serial and code", () => {
    expect(checkSerial(" ab-12 34 ")).toEqual({ value: "AB1234" });
    expect(checkCode(" 1a2b-3c4d ")).toEqual({ value: "1A2B-3C4D" });
    expect(checkCode("x".repeat(33)).error).toBeTruthy();
  });

  it("year", () => {
    expect(checkYear("2014")).toEqual({ value: 2014 });
    expect(checkYear(2014)).toEqual({ value: 2014 });
    expect(checkYear("20x4").error).toBeTruthy();
    expect(checkYear("")).toEqual({ value: null });
  });
});

describe("guides", () => {
  it("every make starts on a real guide", () => {
    for (const make of MAKES) expect(findUnit(make.unit), make.key).toBeTruthy();
  });

  it("every guide says how to find the unit and get the code", () => {
    for (const unit of UNITS) {
      expect(unit.find_serial.length, unit.key).toBeGreaterThan(0);
      expect(unit.get_code.length, unit.key).toBeGreaterThan(0);
      if (unit.needs === "erc") expect(unit.find_erc.length, unit.key).toBeGreaterThan(0);
      if (unit.official) expect(unit.official.url).toMatch(/^https:\/\//);
    }
    expect(usesErc(findUnit("toyota")!)).toBe(true);
    expect(usesErc(findUnit("honda")!)).toBe(false);
  });

  it("tracks a vehicle's status", () => {
    expect(vehicleStatus({ unit_brand: "toyota" }).key).toBe("missing");
    expect(vehicleStatus({ unit_brand: "toyota", unit_serial: "AB1234" }).key).toBe("missing");
    expect(vehicleStatus({ unit_brand: "toyota", erc: "1A2B3C4D5E6F7A8B" }).key).toBe("ready");
    expect(vehicleStatus({ unit_brand: "honda", unit_serial: "U1234567" }).key).toBe("ready");
    expect(vehicleStatus({ unit_brand: "honda", unlock_code: "12345" }).key).toBe("unlocked");
  });
});
