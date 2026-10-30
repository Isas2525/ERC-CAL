# Tokyo Model Vault

A private garage for the infotainment unlock codes of **your own vehicles**,
served at [tokyomodelvault.com](https://tokyomodelvault.com).

After a battery change, many head units lock and ask for a code. The code is
issued for one specific unit, so you need that unit's details first. For each
car, Tokyo Model Vault keeps the VIN (or Japanese chassis number), the head
unit's brand, model, serial and ERC, and the unlock code. Until you have the
code, it walks you through getting one:

1. **Identify the car**: VIN or chassis number. US-market VINs can be decoded
   to make, model and year.
2. **Read the unit**: step-by-step guides to show the ERC (Toyota/Lexus) or
   find the serial (Honda, Nissan, Mitsubishi, Clarion, others).
3. **Request the code**: who can legitimately issue it (dealer, the maker's
   own service), what to bring, and a ready-to-send request you can copy or
   email.
4. **Save it**: next time the unit locks, the code is one tap away. Older
   codes stay in the vehicle's history.

> Tokyo Model Vault **stores** codes you were issued. It never generates,
> calculates or reverse-engineers unlock codes.

## Features

- Garage with status for every car (*Needs ERC*, *Ready to request*, *Code saved*)
  and instant search by VIN, serial, ERC, code or name
- Guided "Get your unlock code" steps on each vehicle, saved as you go
- Unlock code hidden until you tap **Show**; one-tap copy
- Code history: replacing a code never loses the old one
- VIN check-digit validation and decoding via NHTSA's free vPIC service
- Backup export and restore (JSON), keeping dates and history
- Light and dark themes (follows your device), mobile-first, keyboard accessible
- Strict Content-Security-Policy, no third-party requests from the browser

## How it runs

- **Workers Static Assets** serves the app in `public/` (free and unlimited
  requests, cached at the edge). Only `/api/*` runs the Worker.
- **Cloudflare Worker** (`src/`) is the JSON API.
- **D1** (Cloudflare's SQLite) stores vehicles and code history.
- **Cloudflare Access** sits in front of the domain: only the owner's email
  can sign in. The Worker also verifies Access's signed token on every API
  call and refuses everything if login isn't configured.
- `workers.dev` and preview URLs are off, so the custom domain is the only
  way in.

## Develop

Requires Node 22+ and npm 11 (`packageManager` in package.json): npm 10
crashes resolving vitest's dependencies.

```bash
npx npm@11.21.0 install
echo 'AUTH_DISABLED="true"' > .dev.vars   # local only: skips Access
npm run db:migrate:local
npm run dev                               # http://localhost:8787
```

```bash
npm test            # API, auth and rules suites in the Workers runtime
npm run typecheck
```

GitHub Actions runs both on every push to `main` and every pull request.

## Deploy

```bash
npx wrangler login     # once
npm run deploy         # applies D1 migrations, builds the CSS, deploys
```

`npm run deploy` runs `npm run db:migrate` first. If you deploy another
way, run that yourself before the new Worker goes live, or the API will
answer *"The database needs updating"*.

Migration `0002` moves codes saved by the first version (ERC-CAL) into
vehicles named *Imported from ERC-CAL*, with a placeholder VIN to replace.
The old `unlock_codes` table is left in place as a safety copy.

## Configuration

| Name | Where | What |
| --- | --- | --- |
| `DB` | D1 binding | The `erc-cal` database |
| `ACCESS_TEAM_DOMAIN` | var | e.g. `https://<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | var | The Access application's audience tag |
| `ALLOWED_EMAILS` | secret | Comma-separated emails allowed through (defense in depth) |
| `AUTH_DISABLED` | `.dev.vars` only | `"true"` skips Access locally. Never set in production. |

## API

All routes require a valid Access sign-in. POST and PUT bodies must be
`application/json`. Validation errors return `422` with `{error, field}`.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{status, vehicles, codes}` |
| GET | `/api/vehicles` | All vehicles, most recently updated first |
| POST | `/api/vehicles` | The new vehicle (`201`), or `409` with `existing_id` for a known VIN |
| GET | `/api/vehicles/{id}` | The vehicle with its `history` |
| PUT | `/api/vehicles/{id}` | The updated vehicle (full replace) |
| DELETE | `/api/vehicles/{id}` | `{deleted: true}` |
| GET | `/api/vin/{vin}` | Decoded make/model/year, when NHTSA knows the VIN |
| GET | `/api/export` | A JSON backup (download) |
| POST | `/api/import` | Restores a backup; VINs already stored are skipped |

## Layout

```
public/js/shared/   rules.js (validation), units.js (guides): used by browser AND Worker
public/js/          app.js (router), api.js, ui.js, views/
public/_headers     security headers for the static app
src/index.ts        API routing and error handling
src/validation.ts   request body -> VehicleInput
src/store.ts        D1 access
src/vin.ts          NHTSA VIN decoding
src/auth.ts         Cloudflare Access JWT verification
styles/input.css    Tailwind v4 source (built to public/styles.css)
migrations/         D1 schema
test/               vitest suites (run inside workerd)
```
