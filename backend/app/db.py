"""SQLite storage.

One table, ``unlock_codes``, keyed by ``(brand, identifier)``. The
identifier is always stored *normalized* (see ``brands.Brand.normalize``)
so lookups are exact-match and indexed.

Swapping to PostgreSQL later means replacing this module only: the rest
of the app talks to the ``CodeStore`` interface, not to sqlite3.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "codes.db"

SCHEMA = """
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
CREATE INDEX IF NOT EXISTS idx_unlock_codes_lookup
    ON unlock_codes (brand, identifier);
"""


@dataclass
class CodeRecord:
    id: int
    brand: str
    identifier: str
    code: str
    model: str | None
    model_year: int | None
    notes: str | None
    created_at: str
    updated_at: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class CodeStore:
    """Thread-safe SQLite-backed store.

    FastAPI runs sync endpoints in a threadpool, so a single connection is
    shared behind a lock rather than opened per request.
    """

    def __init__(self, path: str | os.PathLike[str] | None = None) -> None:
        self.path = str(path or os.environ.get("ERC_CAL_DB", DEFAULT_DB_PATH))
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def get(self, brand: str, identifier: str) -> CodeRecord | None:
        with self._tx() as conn:
            row = conn.execute(
                "SELECT * FROM unlock_codes WHERE brand = ? AND identifier = ?",
                (brand, identifier),
            ).fetchone()
        return CodeRecord(**dict(row)) if row else None

    def upsert(
        self,
        brand: str,
        identifier: str,
        code: str,
        model: str | None = None,
        model_year: int | None = None,
        notes: str | None = None,
    ) -> tuple[CodeRecord, bool]:
        """Insert or update. Returns ``(record, created)``."""
        now = _now()
        with self._tx() as conn:
            existing = conn.execute(
                "SELECT id FROM unlock_codes WHERE brand = ? AND identifier = ?",
                (brand, identifier),
            ).fetchone()
            if existing:
                conn.execute(
                    """UPDATE unlock_codes
                       SET code = ?, model = ?, model_year = ?, notes = ?, updated_at = ?
                       WHERE id = ?""",
                    (code, model, model_year, notes, now, existing["id"]),
                )
                created = False
            else:
                conn.execute(
                    """INSERT INTO unlock_codes
                       (brand, identifier, code, model, model_year, notes, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (brand, identifier, code, model, model_year, notes, now, now),
                )
                created = True
            row = conn.execute(
                "SELECT * FROM unlock_codes WHERE brand = ? AND identifier = ?",
                (brand, identifier),
            ).fetchone()
        return CodeRecord(**dict(row)), created

    def delete(self, brand: str, identifier: str) -> bool:
        with self._tx() as conn:
            cur = conn.execute(
                "DELETE FROM unlock_codes WHERE brand = ? AND identifier = ?",
                (brand, identifier),
            )
        return cur.rowcount > 0

    def count(self) -> int:
        with self._tx() as conn:
            return conn.execute("SELECT COUNT(*) FROM unlock_codes").fetchone()[0]

    def close(self) -> None:
        with self._lock:
            self._conn.close()
