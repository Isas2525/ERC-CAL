-- Tokyo Model Vault: one row per vehicle, with its infotainment unit's
-- identifiers and current unlock code. Every code ever saved is kept in
-- code_history.
CREATE TABLE IF NOT EXISTS vehicles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname      TEXT,
    vin           TEXT    NOT NULL,          -- as entered (upper-cased)
    vin_key       TEXT    NOT NULL UNIQUE,   -- without separators, for matching
    make          TEXT    NOT NULL,
    model         TEXT,
    model_year    INTEGER,
    unit_brand    TEXT    NOT NULL,
    unit_model    TEXT,
    unit_serial   TEXT,
    erc           TEXT,
    unlock_code   TEXT,
    code_source   TEXT,
    code_saved_at TEXT,
    notes         TEXT,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS code_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id   INTEGER NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    unlock_code  TEXT    NOT NULL,
    erc          TEXT,
    unit_serial  TEXT,
    code_source  TEXT,
    recorded_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS code_history_vehicle ON code_history (vehicle_id, recorded_at);

-- Carry over codes saved by the first version (ERC-CAL). Those had no VIN,
-- so each gets a placeholder the owner replaces when editing the vehicle.
INSERT INTO vehicles (nickname, vin, vin_key, make, model, model_year, unit_brand,
                      unit_serial, erc, unlock_code, code_source, code_saved_at, notes,
                      created_at, updated_at)
SELECT 'Imported from ERC-CAL',
       'UNKNOWN-' || id, 'UNKNOWN' || id,
       CASE WHEN brand IN ('toyota', 'lexus', 'nissan', 'honda', 'mitsubishi') THEN brand ELSE 'other' END,
       model, model_year,
       brand,
       CASE WHEN brand IN ('toyota', 'lexus') THEN NULL ELSE identifier END,
       CASE WHEN brand IN ('toyota', 'lexus') THEN identifier ELSE NULL END,
       code, 'other', updated_at, notes, created_at, updated_at
FROM unlock_codes;

INSERT INTO code_history (vehicle_id, unlock_code, erc, unit_serial, code_source, recorded_at)
SELECT id, unlock_code, erc, unit_serial, code_source, code_saved_at FROM vehicles
WHERE nickname = 'Imported from ERC-CAL' AND vin_key LIKE 'UNKNOWN%';

-- The old table stays, unused, as a safety copy. Drop it once you've
-- checked the import: DROP TABLE unlock_codes;
