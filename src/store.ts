/**
 * D1 storage for unlock codes. The rest of the app talks to CodeStore,
 * never to D1 directly. The UNIQUE (brand, identifier) constraint doubles as
 * the lookup index.
 */

export interface CodeRecord {
  id: number;
  brand: string;
  identifier: string;
  code: string;
  model: string | null;
  model_year: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CodeFields {
  code: string;
  model?: string | null;
  model_year?: number | null;
  notes?: string | null;
}

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export class CodeStore {
  constructor(private readonly db: D1Database) {}

  get(brand: string, identifier: string): Promise<CodeRecord | null> {
    return this.db
      .prepare("SELECT * FROM unlock_codes WHERE brand = ?1 AND identifier = ?2")
      .bind(brand, identifier)
      .first<CodeRecord>();
  }

  /** Insert or update; returns the stored record and whether it was new. */
  async upsert(brand: string, identifier: string, f: CodeFields): Promise<{ record: CodeRecord; created: boolean }> {
    const existed = (await this.get(brand, identifier)) !== null;
    const ts = now();
    const record = await this.db
      .prepare(
        `INSERT INTO unlock_codes (brand, identifier, code, model, model_year, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT (brand, identifier) DO UPDATE SET
           code = excluded.code, model = excluded.model, model_year = excluded.model_year,
           notes = excluded.notes, updated_at = excluded.updated_at
         RETURNING *`,
      )
      .bind(brand, identifier, f.code, f.model ?? null, f.model_year ?? null, f.notes ?? null, ts)
      .first<CodeRecord>();
    if (!record) throw new Error("upsert returned no row");
    return { record, created: !existed };
  }

  async delete(brand: string, identifier: string): Promise<boolean> {
    const res = await this.db
      .prepare("DELETE FROM unlock_codes WHERE brand = ?1 AND identifier = ?2")
      .bind(brand, identifier)
      .run();
    return res.meta.changes > 0;
  }

  async count(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS n FROM unlock_codes").first<{ n: number }>();
    return row?.n ?? 0;
  }
}
