import { beforeEach, describe, expect, it } from "vitest";
import { Garage } from "../public/js/store.js";
import { memoryStorage } from "./helpers";

const prius = {
  vin: "zvw30-1234567",
  make: "toyota",
  model: "Prius",
  model_year: 2012,
  nickname: "Blue Prius",
  unit_brand: "toyota",
  unit_model: "nszt-w62g",
  unit_serial: "ab 1234 567",
  erc: "",
};

let storage: ReturnType<typeof memoryStorage>;
let garage: Garage;
beforeEach(() => {
  storage = memoryStorage();
  garage = new Garage(storage);
});

const create = (over: Record<string, unknown> = {}) => garage.create({ ...prius, ...over });
const caught = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err as Error & { field: string | null; status?: number; existing_id?: number };
  }
  throw new Error("expected an error");
};

describe("garage", () => {
  it("starts empty, and survives corrupt storage", () => {
    expect(garage.list()).toEqual([]);
    storage.setItem("tmv-garage", "{not json");
    expect(garage.list()).toEqual([]);
  });

  it("creates a vehicle, normalizing what was typed", () => {
    const v = create();
    expect(v).toMatchObject({
      id: 1, vin: "ZVW30-1234567", make: "toyota", model_year: 2012, unit_model: "NSZT-W62G",
      unit_serial: "AB1234567", erc: null, unlock_code: null, code_saved_at: null, history: [],
    });
    expect(v).not.toHaveProperty("vin_key");
    expect(garage.list()).toHaveLength(1);
    // It's really persisted, not just held in memory.
    expect(new Garage(storage).get(1).vin).toBe("ZVW30-1234567");
  });

  it("records the code and its history when one is given", () => {
    const v = create({ erc: "1a2b 3c4d-5e6f.7a8b", unlock_code: " ab12cd34 ", code_source: "dealer" });
    expect(v).toMatchObject({ erc: "1A2B3C4D5E6F7A8B", unlock_code: "AB12CD34", code_source: "dealer" });
    expect(v.code_saved_at).toBeTruthy();
    expect(v.history).toEqual([expect.objectContaining({ unlock_code: "AB12CD34", erc: "1A2B3C4D5E6F7A8B" })]);
    expect(garage.stats()).toMatchObject({ vehicles: 1, codes: 1 });
  });

  it("keeps old codes in the history when the code changes", () => {
    const v = create({ unlock_code: "1111" });
    garage.update(v.id, { ...prius, unlock_code: "1111", notes: "label under the glovebox" });
    expect(garage.get(v.id).history).toHaveLength(1);
    const updated = garage.update(v.id, { ...prius, unlock_code: "2222", erc: "AAAABBBBCCCCDDDD" });
    expect(updated.notes).toBeNull();
    expect(updated.history.map((e: any) => e.unlock_code)).toEqual(["2222", "1111"]);
  });

  it("clearing the code keeps the history", () => {
    const v = create({ unlock_code: "1111" });
    const cleared = garage.update(v.id, { ...prius, unlock_code: null });
    expect(cleared).toMatchObject({ unlock_code: null, code_saved_at: null });
    expect(cleared.history).toHaveLength(1);
  });

  it("refuses a second vehicle with the same VIN, however it's written", () => {
    const v = create();
    expect(caught(() => create({ vin: "ZVW 30 1234567" }))).toMatchObject({ field: "vin", status: 409, existing_id: v.id });
    const other = create({ vin: "1HGCM82633A004352", make: "honda", unit_brand: "honda" });
    expect(() => garage.update(v.id, prius)).not.toThrow();
    expect(caught(() => garage.update(other.id, prius)).status).toBe(409);
  });

  it("deletes, and never reuses an id", () => {
    const v = create();
    garage.remove(v.id);
    expect(caught(() => garage.get(v.id)).status).toBe(404);
    expect(caught(() => garage.remove(v.id)).status).toBe(404);
    expect(create().id).toBe(2);
  });

  it.each([
    [{ vin: "" }, "vin", "Enter the VIN"],
    [{ vin: "1HGCM82633A00435O" }, "vin", "never contains I, O or Q"],
    [{ make: "ford" }, "make", "Choose the vehicle's make"],
    [{ unit_brand: "pioneer" }, "unit_brand", "Choose the infotainment unit's brand"],
    [{ erc: "1A2B3C4D5E6F7A8G" }, "erc", "only uses 0-9 and A-F"],
    [{ unit_serial: "AB1" }, "unit_serial", "too short"],
    [{ unlock_code: "12 34!" }, "unlock_code", "only letters, digits and dashes"],
    [{ code_source: "friend" }, "code_source", "Choose where the code came from"],
    [{ model_year: 1820 }, "model_year", "4-digit year"],
    [{ notes: "x".repeat(1001) }, "notes", "too long"],
  ])("validates %j", (over, field, message) => {
    const err = caught(() => create(over));
    expect(err.field).toBe(field);
    expect(err.message).toContain(message);
    expect(garage.list()).toEqual([]);
  });

  it("says so when the browser refuses to save", () => {
    const full = new Garage({ getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } });
    expect(caught(() => full.create(prius)).message).toMatch(/won't let the site save/);
  });
});

describe("backups", () => {
  it("round-trips, keeping history and dates, and remembers when", () => {
    const v = create({ unlock_code: "1111", code_source: "paperwork" });
    garage.update(v.id, { ...prius, unlock_code: "2222" });
    const backup = JSON.parse(JSON.stringify(garage.exportBackup()));
    expect(backup).toMatchObject({ app: "tokyo-model-vault", version: 1 });
    expect(garage.stats().last_backup_at).toBe(backup.exported_at);

    const fresh = new Garage(memoryStorage());
    expect(fresh.importBackup(backup)).toMatchObject({ added: 1, skipped: 0 });
    expect(fresh.importBackup(backup)).toMatchObject({ added: 0, skipped: 1 });
    const [restored] = fresh.list();
    const detail = fresh.get(restored.id);
    expect(detail).toMatchObject({ unlock_code: "2222", created_at: v.created_at });
    expect(detail.history.map((e: any) => e.unlock_code)).toEqual(["2222", "1111"]);
  });

  it("rejects a bad backup without changing anything", () => {
    expect(caught(() => garage.importBackup({ vehicles: [] })).message).toMatch(/isn't a Tokyo Model Vault backup/);
    const err = caught(() => garage.importBackup({ app: "tokyo-model-vault", vehicles: [{ ...prius }, { ...prius, vin: "X" }] }));
    expect(err.message).toMatch(/^Vehicle 2 in the backup/);
    expect(garage.list()).toEqual([]);
  });
});
