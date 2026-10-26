# Save to Cache — browser extension

Chrome MV3 extension (Plasmo) that clips pages into Cache collections and imports Instagram Saved, TikTok Favorites, YouTube Watch Later, and Chrome bookmarks.

## Develop

```bash
bun install
bun run dev
```

Load `build/chrome-mv3-dev` as an unpacked extension in `chrome://extensions`.

## Build / package for stores

```bash
bun run build     # → build/chrome-mv3-prod
bun run package   # → build/chrome-mv3-prod.zip
```

Upload the zip to the Chrome Web Store.

## Build for a self-hosted Cache instance

The default build targets `cachd.app`. To build an extension for your own Cache
host, set an exact HTTPS match in `.env.production` in this directory:

```env
PLASMO_PUBLIC_CACHE_APP_SITE_MATCH=https://cache.example.com/*
```

Set `BETTER_AUTH_URL` in the Cache server environment to the same origin, then
build and package the extension:

```bash
bun run package
```

The custom origin is added to the extension's site bridge and host permissions.
The Cache server trusts its configured `BETTER_AUTH_URL` for the extension
token CORS flow. If the web app uses a separate origin, add that exact origin
to `TRUSTED_ORIGINS` as well.

## Architecture

Single Plasmo/TypeScript tree — no dual legacy pipeline.

| Entry | Role |
|-------|------|
| `src/background.ts` | Service worker: action click, API proxy, bookmark sync, ingest |
| `src/contents/popup-overlay.tsx` | In-page save UI (toolbar click) |
| `src/contents/social-save.ts` | IG / TikTok / YouTube saved-item import |
| `src/contents/cache-site.ts` | Cache webapp bridge (install signal + token) |
| `src/page-world/*` | MAIN-world helpers (page cookies / ytcfg), registered by SW |
| `lib/runtime.ts` | Shared message types, storage keys, endpoints |

Background owns network + secrets. Content scripts talk through `chrome.runtime` messages (`MESSAGE_TYPES` in `lib/runtime.ts`).

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Token, last collections, bookmark queue |
| `bookmarks` | Chrome bookmark continuous sync |
| `tabs` | Open Cache, open-and-sync orchestration |
| `scripting` | Plasmo MAIN-world content script registration |
| Host: Instagram / TikTok / YouTube | Social import |
| Host: `cachd.app` | API + auth bridge |

## Store listing checklist

- [x] MV3 package zip (`bun run package`)
- [x] `homepage_url` → https://cachd.app
- [x] Icons 16–128
- [x] Description
- [ ] Chrome Web Store screenshots (1280×800)
- [ ] Privacy policy URL on listing (`https://cachd.app/legal/privacy-policy`)
- [ ] Permission justifications in CWS form
- [ ] Set production extension ID in app `lib/common/constants.ts` after publish
