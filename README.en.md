# VoxPop 🗳️

> **VoxPop** (vox populi, the voice of the people) — an open-source poll & survey service that runs entirely on Cloudflare's **free tier**: self-host in 5 minutes, free forever, with built-in duplicate-voting protection, lightweight analytics, and one-line embedding into any webpage.

[English](README.en.md) | [中文](README.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/TNT-Likely/voxpop)

**Live demo**: [voxpop-demo.sunxiaoyes.workers.dev](https://voxpop-demo.sunxiaoyes.workers.dev) (seeded with sample data — vote freely)

## Preview

![Voting flow](.github/assets/demo.gif)

| Light | Dark |
|---|---|
| ![Poll page, light](.github/assets/poll-light.png) | ![Poll page, dark](.github/assets/poll-dark.png) |

Live results: they update right below the form as votes come in.

![Live results](.github/assets/live-results.png)

## Features

- **Four question types**: single choice / multiple choice / cascading select (up to 3 levels) / free text
- **Four-layer duplicate-voting protection**: Turnstile → first-party cookie + HMAC fingerprint → transactional pre-check → DB unique constraint
- **Built-in lightweight analytics**: PV/UV, country, device, browser, OS, referrer, time-of-day, plus **custom dimensions** passed from your app via URL params (whitelisted per poll)
- **Bilingual UI**: auto-detected via Accept-Language, switchable with `?lang=en|zh`
- **Light & dark themes**: follows the system + manual three-state toggle (auto / light / dark); embeds can force `?theme=dark`
- **Accent color injection**: per-poll accent color; embeds can override with `?accent=RRGGBB`; posters follow
- **Responsive**: mobile / iPad / desktop
- **QR share poster**: one-click shareable image with QR code on the results page
- **Self-serve polls**: create from the public `/new` page (Turnstile + 5 per device per day, unlisted by default — an admin can list them)
- **App discovery API**: `GET /api/app/polls?app=&channel=` with two-dimensional **app × channel targeting** (free-form tags, e.g. `appstore` / `ipa` / `apk` / `googleplay`) for in-app poll banners
- **One-line embedding**: `embed.js` iframe with auto-height
- **Zero cost**: Workers + D1 + Turnstile all fit inside Cloudflare's free tier — no VPS needed
- **Privacy friendly**: no raw IPs or UAs stored — only HMAC digests and enums, no PII
- **Minimal dependencies**: vanilla JS frontend; Hono is the only runtime dependency

## Deploy

Prerequisites: a Cloudflare account (free plan works) + Node.js 20+.

```bash
git clone https://github.com/TNT-Likely/voxpop.git
cd voxpop
npm install
npx wrangler d1 create voxpop    # fill the output database_id into wrangler.jsonc
cp .dev.vars.example .dev.vars   # local dev config
npm run db:local                 # init local DB (remote: npm run db:remote)

# Production secrets (admin password + HMAC salt)
npx wrangler secret put ADMIN_KEY
npx wrangler secret put SERVER_SALT
# Optional: create a free Turnstile site in the Cloudflare dashboard, then:
# npx wrangler secret put TURNSTILE_SECRET_KEY and add the site key to vars in wrangler.jsonc

npm run deploy
```

Admin UI: `https://<your-domain>/admin` — sign in with `ADMIN_KEY` to create polls, view stats, and grab embed codes.

### One-click deploy (Deploy to Cloudflare)

Click the Deploy button above — Cloudflare clones the repo and provisions the Worker + D1. Then finish with three steps:

```bash
npx wrangler secret put ADMIN_KEY     # admin UI password
npx wrangler secret put SERVER_SALT   # long random string (HMAC salt)
npx wrangler d1 execute voxpop --remote --file=./migrations/0001_init.sql  # init schema
```

### Enabling Turnstile (optional, free)

The verification code is built in and skipped until keys are configured. To enable:

1. Cloudflare dashboard → **Turnstile** → Add site: use both hostnames (custom domain + workers.dev), Managed or Invisible mode, and grab the Site Key / Secret Key;
2. `npx wrangler secret put TURNSTILE_SECRET_KEY`;
3. Add `"TURNSTILE_SITE_KEY": "0x..."` to `vars` in `wrangler.jsonc` and `npm run deploy` again.

## Embedding

The admin poll page shows a ready-made embed snippet, equivalent to:

```html
<script src="https://<your-domain>/embed.js"></script>
<div class="voxpop-poll" data-poll="<pollId>"></div>
```

Or via npm (bundler / UMD friendly):

```bash
npm install voxpop-embed
```

```js
import VoxPop from 'voxpop-embed';
VoxPop.mount(document.querySelector('#box'), { host: 'https://<your-domain>', poll: '<pollId>' });
```

## Local development

```bash
npm run dev          # http://localhost:8787
npm run typecheck
npm test
```

What's inside: four question types (cascading / text included), four-layer duplicate protection, a Turnstile switch, analytics with custom-dimension whitelisting, daily Cron rollups (raw events kept 180 days), Chart.js admin dashboards, JSON/CSV export, and embed.js.

## Tech stack

Cloudflare Workers (Hono + TypeScript SSR + Static Assets) · D1 (SQLite) · Turnstile (optional) · vanilla JS frontend — Hono is the only runtime dependency.

## License

MIT © 2026 TNT-Likely
