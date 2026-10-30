-- One row per stored code, keyed by (brand, normalized identifier).
CREATE TABLE IF NOT EXISTS unlock_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    brand       TEXT    NOT NULL,
    identifier  TEXT    NOT NULL,
    code        TEXT    NOT NULL,
    model       TEXT,
    model_year  INTEGER,
    notes       TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    UNIQUE (brand, identifier)
);
