/**
 * D1 storage. The rest of the Worker talks to VehicleStore, never to D1
 * directly. Every change of unlock code is also written to code_history,
 * so an older code is never lost when a newer one is saved.
 */

import type { VehicleInput } from "./validation";

export interface Vehicle extends Omit<VehicleInput, "vin_key"> {
  id: number;
  code_saved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  id: number;
  unlock_code: string;
  erc: string | null;
  unit_serial: string | null;
  code_source: string | null;
  recorded_at: string;
}

export class DuplicateVinError extends Error {
  constructor(readonly existingId: number) {
    super("A vehicle with this VIN is already in your garage.");
  }
}

const COLUMNS = [
  "nickname", "vin", "vin_key", "make", "model", "model_year", "unit_brand", "unit_model",
  "unit_serial", "erc", "unlock_code", "code_source", "notes",
] as const;

const SELECT =
  "SELECT id, nickname, vin, make, model, model_year, unit_brand, unit_model, unit_serial, erc, " +
  "unlock_code, code_source, code_saved_at, notes, created_at, updated_at FROM vehicles";

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export class VehicleStore {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<Vehicle[]> {
    const { results } = await this.db.prepare(`${SELECT} ORDER BY updated_at DESC, id DESC LIMIT 1000`).all<Vehicle>();
    return results;
  }

  get(id: number): Promise<Vehicle | null> {
    return this.db.prepare(`${SELECT} WHERE id = ?1`).bind(id).first<Vehicle>();
  }

  async history(id: number): Promise<HistoryEntry[]> {
    const { results } = await this.db
      .prepare(
        "SELECT id, unlock_code, erc, unit_serial, code_source, recorded_at FROM code_history " +
          "WHERE vehicle_id = ?1 ORDER BY recorded_at DESC, id DESC",
      )
      .bind(id)
      .all<HistoryEntry>();
    return results;
  }

  private async assertVinFree(vinKey: string, exceptId: number | null): Promise<void> {
    const row = await this.db
      .prepare("SELECT id FROM vehicles WHERE vin_key = ?1 AND id IS NOT ?2")
      .bind(vinKey, exceptId)
      .first<{ id: number }>();
    if (row) throw new DuplicateVinError(row.id);
  }

  private historyInsert(vehicleId: number | null, f: VehicleInput, ts: string): D1PreparedStatement {
    // A null id means "the vehicle inserted just before, in this batch".
    return this.db
      .prepare(
        "INSERT INTO code_history (vehicle_id, unlock_code, erc, unit_serial, code_source, recorded_at) " +
          "VALUES (COALESCE(?1, last_insert_rowid()), ?2, ?3, ?4, ?5, ?6)",
      )
      .bind(vehicleId, f.unlock_code, f.erc, f.unit_serial, f.code_source, ts);
  }

  async create(f: VehicleInput): Promise<Vehicle> {
    await this.assertVinFree(f.vin_key, null);
    const ts = now();
    const insert = this.db
      .prepare(
        `INSERT INTO vehicles (${COLUMNS.join(", ")}, code_saved_at, created_at, updated_at)
         VALUES (${COLUMNS.map((_, i) => `?${i + 1}`).join(", ")}, ?14, ?15, ?15)`,
      )
      .bind(...COLUMNS.map((c) => f[c]), f.unlock_code ? ts : null, ts);
    // One batch is one transaction: the vehicle and its first history row
    // are written together or not at all.
    const results = await this.db.batch<{ id: number }>(
      f.unlock_code ? [insert, this.historyInsert(null, f, ts)] : [insert],
    );
    const id = results[0].meta.last_row_id;
    return (await this.get(id))!;
  }

  /** Returns null when the vehicle doesn't exist. */
  async update(id: number, f: VehicleInput): Promise<Vehicle | null> {
    const current = await this.get(id);
    if (!current) return null;
    await this.assertVinFree(f.vin_key, id);
    const ts = now();
    const codeChanged = f.unlock_code !== current.unlock_code;
    const savedAt = codeChanged ? (f.unlock_code ? ts : null) : current.code_saved_at;
    const update = this.db
      .prepare(
        `UPDATE vehicles SET ${COLUMNS.map((c, i) => `${c} = ?${i + 1}`).join(", ")},
           code_saved_at = ?14, updated_at = ?15 WHERE id = ?16`,
      )
      .bind(...COLUMNS.map((c) => f[c]), savedAt, ts, id);
    await this.db.batch(codeChanged && f.unlock_code ? [update, this.historyInsert(id, f, ts)] : [update]);
    return this.get(id);
  }

  async delete(id: number): Promise<boolean> {
    const [, res] = await this.db.batch([
      this.db.prepare("DELETE FROM code_history WHERE vehicle_id = ?1").bind(id),
      this.db.prepare("DELETE FROM vehicles WHERE id = ?1").bind(id),
    ]);
    return res.meta.changes > 0;
  }

  async stats(): Promise<{ vehicles: number; codes: number }> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS vehicles, COUNT(unlock_code) AS codes FROM vehicles")
      .first<{ vehicles: number; codes: number }>();
    return { vehicles: row?.vehicles ?? 0, codes: row?.codes ?? 0 };
  }

  /** Restore one vehicle from a backup, keeping its dates and history.
   * Returns false (and writes nothing) when its VIN is already stored. */
  async restore(
    f: VehicleInput,
    dates: { created_at: string; updated_at: string; code_saved_at: string | null },
    history: Omit<HistoryEntry, "id">[],
  ): Promise<boolean> {
    const existing = await this.db.prepare("SELECT id FROM vehicles WHERE vin_key = ?1").bind(f.vin_key).first();
    if (existing) return false;
    const row = await this.db
      .prepare(
        `INSERT INTO vehicles (${COLUMNS.join(", ")}, code_saved_at, created_at, updated_at)
         VALUES (${COLUMNS.map((_, i) => `?${i + 1}`).join(", ")}, ?14, ?15, ?16) RETURNING id`,
      )
      .bind(...COLUMNS.map((c) => f[c]), dates.code_saved_at, dates.created_at, dates.updated_at)
      .first<{ id: number }>();
    if (history.length) {
      await this.db.batch(
        // Oldest first, so ids keep the same order as the dates.
        [...history].reverse().map((h) =>
          this.db
            .prepare(
              "INSERT INTO code_history (vehicle_id, unlock_code, erc, unit_serial, code_source, recorded_at) " +
                "VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(row!.id, h.unlock_code, h.erc, h.unit_serial, h.code_source, h.recorded_at),
        ),
      );
    }
    return true;
  }

  async exportAll(): Promise<(Vehicle & { history: HistoryEntry[] })[]> {
    const vehicles = await this.list();
    const { results } = await this.db
      .prepare(
        "SELECT vehicle_id, id, unlock_code, erc, unit_serial, code_source, recorded_at FROM code_history " +
          "ORDER BY recorded_at DESC, id DESC",
      )
      .all<HistoryEntry & { vehicle_id: number }>();
    const byVehicle = new Map<number, HistoryEntry[]>();
    for (const { vehicle_id, ...entry } of results) {
      byVehicle.set(vehicle_id, [...(byVehicle.get(vehicle_id) ?? []), entry]);
    }
    return vehicles.map((v) => ({ ...v, history: byVehicle.get(v.id) ?? [] }));
  }
}
