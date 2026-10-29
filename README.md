# ERC-CAL

A personal vault for the infotainment unlock codes of **your own vehicles**
(Toyota, Lexus, Nissan, Honda, Mitsubishi, Clarion units).

After a battery disconnect, many head units lock and ask for a code. ERC-CAL
lets you save the code you were issued (from your dealer, paperwork, or the
manufacturer's official code service) against the unit's on-screen ERC code
or serial number, and find it again in seconds.

> ERC-CAL **stores and looks up** codes. It does not generate, calculate or
> reverse-engineer unlock codes, and it contains no manufacturer algorithms.
> The identifier you type is only a database key.

## Features

- Brand selector with a per-brand guide to finding the ERC code or serial
- Live input validation (exact 16-char hex for Toyota/Lexus ERC codes, length
  and character rules for serials) mirrored on the server
- Forgiving input: spaces, dashes, dots and case are ignored, so
  `1a2b 3c4d-5e6f` and `1A2B3C4D5E6F` find the same record
- Save / update / delete codes, with optional model, year and notes
- Copy-to-clipboard, loading states, clear error messages
- Dark and light themes, mobile-first layout
- Pluggable fallback providers (e.g. a licensed code service or your own
  PostgreSQL), with results cached locally

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000. API docs are at `/docs`.

| Variable | Default | What |
| --- | --- | --- |
| `ERC_CAL_DB` | `backend/data/codes.db` | SQLite file path |
| `ERC_CAL_FRONTEND` | `frontend/` | Directory served at `/` |
| `ERC_CAL_DISABLE_FALLBACK` | unset | `1` disables fallback providers |

## Test

```bash
cd backend
pytest -q
```

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{status, codes_stored}` |
| GET | `/api/brands` | | Brand rules and retrieval guides |
| POST | `/api/lookup` | `{brand, identifier}` | `{found, code, source, ...}` |
| POST | `/api/codes` | `{brand, identifier, code, model?, model_year?, notes?}` | `{created, ...}` |
| DELETE | `/api/codes/{brand}/{identifier}` | | `{deleted}` or 404 |

Validation errors return `422` with `{error, field}` so the UI can point at
the offending input.

## Layout

```
backend/app/brands.py      brand rules + retrieval guides (single source of truth)
backend/app/validation.py  normalization and validation with user-facing messages
backend/app/db.py          SQLite store (swap this module for PostgreSQL)
backend/app/fallback.py    external provider interface
backend/app/main.py        FastAPI routes and error handling, serves the frontend
frontend/                  static UI (index.html + app.js)
```

### Adding a fallback provider

Implement `FallbackProvider` in `backend/app/fallback.py` (a `name` and a
`lookup(brand, identifier) -> str | None`) and append it in
`build_providers()`, typically gated on an API-key env var. A provider that
raises is logged and skipped; a hit is cached into the local database.

## Before deploying publicly

- **There is no authentication.** Anyone who can reach the server can read
  and change stored codes. Keep it on localhost or a private network, or add
  auth before exposing it.
- The UI loads Tailwind from its Play CDN, which is meant for development.
  For production, compile the CSS with the Tailwind CLI and serve it as a
  static file.
