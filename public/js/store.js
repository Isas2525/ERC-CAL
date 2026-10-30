/**
 * The garage, kept in this browser's localStorage. Nothing about a
 * visitor's vehicles ever leaves their device, so the site needs no login
 * and no visitor can see another's codes.
 *
 * Every change of unlock code is also appended to the vehicle's history,
 * so an older code is never lost when a newer one is saved.
 */

import { checkCode, checkErc, checkSerial, findSource } from "./shared/rules.js";
import { parseVehicle, VehicleError } from "./shared/vehicle.js";

const KEY = "tmv-garage";
const VERSION = 1;
export const BACKUP_APP = "tokyo-model-vault";

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const isoDate = (v, fallback) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString().replace(/\.\d{3}Z$/, "Z") : fallback;

/** Public shape of a vehicle: everything but the matching key. */
function present({ vin_key, history, ...v }, withHistory) {
  return withHistory ? { ...v, history: history.map((e) => ({ ...e })) } : v;
}

export class Garage {
  /** `storage` is any object with getItem/setItem (localStorage in the app). */
  constructor(storage) {
    this.storage = storage;
  }

  read() {
    let data = null;
    try {
      data = JSON.parse(this.storage.getItem(KEY) || "null");
    } catch {
      data = null;
    }
    if (!data || data.version !== VERSION || !Array.isArray(data.vehicles)) {
      return { version: VERSION, next_id: 1, last_backup_at: null, vehicles: [] };
    }
    return data;
  }

  write(data) {
    try {
      this.storage.setItem(KEY, JSON.stringify(data));
    } catch {
      throw new VehicleError("This browser won't let the site save data (private browsing or storage full).");
    }
  }

  list() {
    return this.read().vehicles
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
      .map((v) => present(v, false));
  }

  get(id) {
    const v = this.read().vehicles.find((x) => x.id === id);
    if (!v) throw new VehicleError("Vehicle not found.", null, { status: 404 });
    return present(v, true);
  }

  stats() {
    const { vehicles, last_backup_at } = this.read();
    return { vehicles: vehicles.length, codes: vehicles.filter((v) => v.unlock_code).length, last_backup_at };
  }

  static historyEntry(f, ts) {
    return { unlock_code: f.unlock_code, erc: f.erc, unit_serial: f.unit_serial, code_source: f.code_source, recorded_at: ts };
  }

  assertVinFree(data, vinKey, exceptId) {
    const other = data.vehicles.find((v) => v.vin_key === vinKey && v.id !== exceptId);
    if (other) {
      throw new VehicleError("A vehicle with this VIN is already in your garage.", "vin", { status: 409, existing_id: other.id });
    }
  }

  create(body) {
    const f = parseVehicle(body);
    const data = this.read();
    this.assertVinFree(data, f.vin_key, null);
    const ts = now();
    const vehicle = {
      id: data.next_id++,
      ...f,
      code_saved_at: f.unlock_code ? ts : null,
      created_at: ts,
      updated_at: ts,
      history: f.unlock_code ? [Garage.historyEntry(f, ts)] : [],
    };
    data.vehicles.push(vehicle);
    this.write(data);
    return present(vehicle, true);
  }

  /** Full replace of the editable fields. */
  update(id, body) {
    const f = parseVehicle(body);
    const data = this.read();
    const current = data.vehicles.find((v) => v.id === id);
    if (!current) throw new VehicleError("Vehicle not found.", null, { status: 404 });
    this.assertVinFree(data, f.vin_key, id);
    const ts = now();
    const codeChanged = f.unlock_code !== current.unlock_code;
    Object.assign(current, f, {
      code_saved_at: codeChanged ? (f.unlock_code ? ts : null) : current.code_saved_at,
      updated_at: ts,
    });
    if (codeChanged && f.unlock_code) current.history.unshift(Garage.historyEntry(f, ts));
    this.write(data);
    return present(current, true);
  }

  remove(id) {
    const data = this.read();
    const before = data.vehicles.length;
    data.vehicles = data.vehicles.filter((v) => v.id !== id);
    if (data.vehicles.length === before) throw new VehicleError("Vehicle not found.", null, { status: 404 });
    this.write(data);
  }

  exportBackup() {
    const data = this.read();
    const exported_at = new Date().toISOString();
    data.last_backup_at = exported_at;
    this.write(data);
    return {
      app: BACKUP_APP,
      version: 1,
      exported_at,
      vehicles: data.vehicles.map((v) => present(v, true)),
    };
  }

  /** Restore a backup; vehicles whose VIN is already stored are skipped.
   * Everything is validated first, so a bad file changes nothing. */
  importBackup(backup) {
    if (!backup || backup.app !== BACKUP_APP || !Array.isArray(backup.vehicles)) {
      throw new VehicleError("That file isn't a Tokyo Model Vault backup.");
    }
    if (backup.vehicles.length > 1000) throw new VehicleError("A backup can hold at most 1000 vehicles.");
    const ts = now();
    const rows = backup.vehicles.map((raw, i) => {
      const v = raw && typeof raw === "object" ? raw : {};
      let f;
      try {
        f = parseVehicle(v);
      } catch (err) {
        throw new VehicleError(`Vehicle ${i + 1} in the backup: ${err.message}`);
      }
      const history = (Array.isArray(v.history) ? v.history : []).slice(0, 200).flatMap((h) => {
        const code = checkCode(h?.unlock_code);
        if (code.error || !code.value) return [];
        return [{
          unlock_code: code.value,
          erc: checkErc(h.erc ?? "").value ?? null,
          unit_serial: checkSerial(h.unit_serial ?? "").value ?? null,
          code_source: typeof h.code_source === "string" && findSource(h.code_source) ? h.code_source : null,
          recorded_at: isoDate(h.recorded_at, ts),
        }];
      });
      const created_at = isoDate(v.created_at, ts);
      return {
        ...f,
        code_saved_at: f.unlock_code ? isoDate(v.code_saved_at, created_at) : null,
        created_at,
        updated_at: isoDate(v.updated_at, created_at),
        history,
      };
    });

    const data = this.read();
    let added = 0;
    for (const row of rows) {
      if (data.vehicles.some((v) => v.vin_key === row.vin_key)) continue;
      data.vehicles.push({ id: data.next_id++, ...row });
      added++;
    }
    this.write(data);
    const skipped = rows.length - added;
    return { added, skipped, message: `Restored ${added} vehicle(s)${skipped ? `; ${skipped} already in your garage` : ""}.` };
  }
}

/** The app's garage. Falls back to memory when storage is blocked, so the
 * site still works (without saving) in locked-down browsers. */
function browserStorage() {
  try {
    const probe = "tmv-probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return { storage: localStorage, persistent: true };
  } catch {
    const mem = new Map();
    return {
      storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) },
      persistent: false,
    };
  }
}

const { storage, persistent } = typeof window === "undefined" ? { storage: null, persistent: false } : browserStorage();
export const garage = new Garage(storage);
export const canSave = persistent;

/** Ask the browser not to evict the garage under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}

/** Vehicle fields the form edits, taken from a stored vehicle. */
export const editable = (v) => ({
  nickname: v.nickname, vin: v.vin, make: v.make, model: v.model, model_year: v.model_year,
  unit_brand: v.unit_brand, unit_model: v.unit_model, unit_serial: v.unit_serial, erc: v.erc,
  unlock_code: v.unlock_code, code_source: v.code_source, notes: v.notes,
});
