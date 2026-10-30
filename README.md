# ERC-CAL

A private vault for the infotainment unlock codes of **your own vehicles**
(Toyota, Lexus, Nissan, Honda, Mitsubishi, Clarion units), served at
tokyomodelvault.com.

After a battery disconnect, many head units lock and ask for a code. ERC-CAL
lets you save the code you were issued (from your dealer, paperwork, or the
manufacturer's official code service) against the unit's on-screen ERC code
or serial number, and find it again in seconds.

> ERC-CAL **stores and looks up** codes. It does not generate, calculate or
> reverse-engineer unlock codes, and it contains no manufacturer algorithms.
> The identifier you type is only a database key.

## How it runs

- **Cloudflare Worker** (`src/`) serves the JSON API under `/api/*` and the
  frontend (`public/`, bundled into the Worker at build time).
- **D1** (Cloudflare's SQLite) stores the codes.
- **Cloudflare Access** sits in front of the domain: only the owner's email
  can sign in (one-time PIN sent by email). The Worker also verifies Access's
  signed token on every API call and refuses everything if login isn't
  configured, so codes are never served without a valid sign-in.
- `workers.dev` and preview URLs are off, so the custom domain is the only
  way in.

## Features

- Brand selector with a per-brand guide to finding the ERC code or serial
- Live input validation mirrored on the server (exact 16-char hex for
  Toyota/Lexus ERC codes, length and character rules for serials)
- Forgiving input: spaces, dashes, dots and case are ignored
- Save / update / delete codes, with optional model, year and notes
- Copy-to-clipboard, loading states, clear error messages, expired-login notice
- Dark and light themes, mobile-first layout
- Strict Content-Security-Policy; API responses are never cached
- Pluggable fallback providers (`src/fallback.ts`), results cached in D1

## Develop

Requires Node 22+. Use npm 11 (`packageManager` in package.json): npm 10
crashes resolving vitest's dependencies.

```bash
npx npm@11.21.0 install
echo 'AUTH_DISABLED="true"' > .dev.vars        # local only: skips Access
npx wrangler d1 migrations apply erc-cal --local
npm run dev                                    # http://localhost:8787
```

```bash
npm test          # 53 tests in the Workers runtime with a local D1
npm run typecheck
```

## Configuration

| Name | Where | What |
| --- | --- | --- |
| `DB` | D1 binding | The `erc-cal` database |
| `ACCESS_TEAM_DOMAIN` | var | e.g. `https://<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | var | The Access application's audience tag |
| `ALLOWED_EMAILS` | secret | Comma-separated emails allowed through (defense in depth) |
| `AUTH_DISABLED` | `.dev.vars` only | `"true"` skips Access locally. Never set in production. |

## API

All routes require a valid Access sign-in.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{status, codes_stored}` |
| GET | `/api/brands` | | Brand rules and retrieval guides |
| POST | `/api/lookup` | `{brand, identifier}` | `{found, code, source, ...}` |
| POST | `/api/codes` | `{brand, identifier, code, model?, model_year?, notes?}` | `{created, ...}` |
| DELETE | `/api/codes/{brand}/{identifier}` | | `{deleted}` or 404 |

POST bodies must be `application/json`. Validation errors return `422` with
`{error, field}` so the UI can point at the offending input.

## Layout

```
src/brands.ts       brand rules + retrieval guides (single source of truth)
src/validation.ts   normalization and validation with user-facing messages
src/store.ts        D1 access
src/auth.ts         Cloudflare Access JWT verification
src/fallback.ts     external provider interface
src/index.ts        routing, error handling, page headers
public/             index.html, app.js, theme.js (styles.css is built)
styles/input.css    Tailwind v4 source
migrations/         D1 schema
test/               vitest suites (run inside workerd)
```
