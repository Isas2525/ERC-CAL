# Tokyo Model Vault

Infotainment unlock code guides and a private garage for **your own
vehicles**, at [tokyomodelvault.com](https://tokyomodelvault.com).
Free, no account, no login: open the URL and use it.

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

## Where your data lives

Each visitor's garage is saved **only in their own browser** (localStorage).
Nothing about anyone's vehicles is sent to the server, so there's nothing to
log in to and no one can see anyone else's codes.

The trade-off: browsers can erase site data. Clearing browsing data does,
and Safari on iPhone clears it after 7 days without a visit unless the site
is added to the Home Screen. So the app:

- asks the browser to keep its data (`navigator.storage.persist()`),
- installs to the Home Screen (web app manifest, which also exempts it from
  Safari's 7-day limit) and works offline (`sw.js`),
- reminds you to **Export backup** when codes haven't been backed up for 30
  days. **Import backup** restores it, or moves it to another device.

## Features

- Garage with status for every car (*Needs ERC*, *Ready to request*, *Code saved*)
  and instant search by VIN, serial, ERC, code or name
- Guided "Get your unlock code" steps on each vehicle, saved as you go
- Unlock code hidden until you tap **Show**; one-tap copy
- Code history: replacing a code never loses the old one
- VIN check-digit validation and decoding via NHTSA's free vPIC service,
  cached at the edge for 30 days
- Light and dark themes (follows your device), mobile-first, keyboard accessible
- Strict Content-Security-Policy, no third-party requests from the browser

## How it runs

- **Workers Static Assets** serves the app in `public/` (free and unlimited
  requests, cached at the edge).
- **Cloudflare Worker** (`src/`) only handles `/api/*`: VIN decoding.
- No database and no login.

## Develop

Requires Node 22+ and npm 11 (`packageManager` in package.json): npm 10
crashes resolving vitest's dependencies.

```bash
npx npm@11.21.0 install
npm run dev          # http://localhost:8787
```

```bash
npm test             # store, rules and API suites in the Workers runtime
npm run typecheck
```

GitHub Actions runs both on every push to `main` and every pull request.

## Deploy

```bash
npx wrangler login   # once
npm run deploy       # builds the CSS and deploys to both custom domains
```

## API

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{status}` |
| GET | `/api/vin/{vin}` | Decoded make/model/year when NHTSA knows the VIN; `422` for an invalid VIN |

## Layout

```
public/js/shared/   rules.js, units.js (guides), vehicle.js: used by browser AND Worker
public/js/store.js  the garage, in localStorage, with backups
public/js/          app.js (router), api.js, ui.js, views/
public/sw.js        offline cache;  public/manifest.webmanifest  Home Screen install
public/_headers     security headers for the static app
src/index.ts        API routing, edge cache
src/vin.ts          NHTSA VIN decoding
styles/input.css    Tailwind v4 source (built to public/styles.css)
test/               vitest suites (run inside workerd)
```
