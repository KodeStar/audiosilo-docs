---
title: Maintaining these docs
description: "How the documentation site works, when a code change requires a docs change, and how to regenerate screenshots."
---

Documentation is part of the Definition of Done for AudioSilo: a change that
alters behaviour, UI, configuration, or the wire contract isn't finished until
the affected pages here say the new truth. This page is the operating manual
for the docs themselves.

## Where things live

The docs are their own repo, `audiosilo-docs`, a sibling of the three code
repos inside the `~/dev/audiosilo` workspace:

```
audiosilo-docs/
  docs-users/          the User Guide        (served at /users)
  docs-developers/     the Developer Docs    (served at /developers)
  sidebars-users.ts    hand-written sidebar + canonical page list
  sidebars-developers.ts
  screenshots/         the capture pipeline (manifest.mjs, run.sh, capture-*.mjs)
  static/img/screenshots/   the generated images the pages embed
  src/                 landing page + theme (pink #db2777, dark-first)
```

It's a standard [Docusaurus](https://docusaurus.io) site with **two docs
instances** - one per audience. The User Guide assumes a self-hoster who is
not a programmer; the Developer Docs assume a contributor. Keep material in
the right instance and cross-link sparingly.

## Local workflow

```sh
cd audiosilo-docs
npm install        # first time
npm start          # live-reloading dev server
npm run build      # the docs gate - MUST pass before a change is done
```

`npm run build` is deliberately strict: broken internal links, broken anchors,
and missing embedded images all **fail the build**. That is the mechanical
check that pages and screenshots stay consistent - treat it exactly like the
code repos' gates.

## When a code change needs a docs change

Grep these docs for the symbol, flag, route, or UI label you changed -
`onBrokenLinks` can't catch a stale *claim*, only a stale link. The common
mappings:

| You changed… | Update |
|---|---|
| An API route, envelope, or field | [server/api/reference.md](../server/api/reference.md) (+ [conventions](../server/api/index.md)), [cross-repo contract](../architecture/cross-repo-contract.md) - after updating the workspace `CROSS-REPO.md` itself |
| Config keys, env vars, CLI flags | [server/configuration.md](../server/configuration.md) + the User Guide pages that mention them (`/users/getting-started/remote-access`, quickstarts) |
| Admin console UI (`admin-ui`) | `/users/admin/*` pages + the `admin/` screenshots (capture just those with `SHOTS_ONLY=admin/ screenshots/run.sh`) + [server/web-ui.md](../server/web-ui.md) for build, serving, CSP or new-section changes |
| Player screens or strings | `/users/listening/*` pages + the `web-player/` screenshots |
| The player's design system (`STYLEGUIDE.md`, tokens, fonts, `src/components/ui/` primitives) | [frontend/overview.md](../frontend/overview.md#styling-conventions) (+ [testing.md](../frontend/testing.md) when the token generator or style guards change); the frontend's own `STYLEGUIDE.md` stays authoritative, so these pages summarise it rather than copy it |
| The player's shell: tabs, route groups, breakpoints, top bar | [frontend/overview.md](../frontend/overview.md#the-shell-tabs-and-navigation) + the route map, `/users/listening/browsing` (getting around), `/users/listening/mobile-apps` |
| The full player, mini / docked player, the companion, player sheets, web keyboard shortcuts | [frontend/player-ui.md](../frontend/player-ui.md) + `/users/listening/full-player`, `/users/listening/playback`, `/users/listening/companion`, `/users/listening/keyboard-shortcuts` (+ `/users/listening/up-next` for the Up next sheet, `/users/listening/browsing` for Previously on) |
| The book page (`src/components/book/`, the book tabs) | [frontend/book-page.md](../frontend/book-page.md) + `/users/listening/book-page` + the `web-player/book-*.png` and `phone-book-detail.png` screenshots |
| Bookmarks and notes (`src/components/annotations/`, the editors, labels) | [frontend/annotations.md](../frontend/annotations.md) + `/users/listening/bookmarks-and-notes` (+ the `annotations` rows in [state-and-data.md](../frontend/state-and-data.md#bookmarks-notes-and-the-journal)) |
| The Journal (`src/components/journal/`, export, `src/lib/listening-sessions.ts`) | [frontend/journal.md](../frontend/journal.md) + `/users/listening/journal` + the `web-player/journal*.png` screenshots |
| The You hub, Your listening, Year in listening (`src/components/you/`, the `/year` modal, sharing a card) | [frontend/you-and-settings.md](../frontend/you-and-settings.md) + `/users/listening/you`, `/users/listening/year-in-listening` + the `web-player/you-stats.png`, `phone-you-stats.png` and `year.png` screenshots |
| Settings or a server's Account page (`src/components/settings/`, `src/components/account/`) | [frontend/you-and-settings.md](../frontend/you-and-settings.md) + `/users/listening/settings`, `/users/listening/account` (+ `/users/listening/api-keys` for API keys) + the `web-player/settings.png`, `phone-settings.png` and `account.png` screenshots; when a setting moves, every page that links its `settings.md#…` anchor |
| Connect and onboarding (`src/app/connect/`, `src/components/connect/`), home and away addresses (`address-route.ts`, `address-runner.ts`, `server-address.ts`) | [frontend/connect-and-addresses.md](../frontend/connect-and-addresses.md) + `/users/listening/connecting` + the `web-player/connect*.png` screenshots; the server side of the addresses is [server/configuration.md](../server/configuration.md#home-address-lan_url) and `/users/getting-started/remote-access` |
| Recaps, characters, the series rails and the spoiler gate (`src/components/library/book-meta.tsx`, `meta-gating.ts`) | [frontend/state-and-data.md](../frontend/state-and-data.md#spoiler-gating-srccomponentslibrarymeta-gatingts) + `/users/listening/recaps-and-characters` |
| The end of a book, what plays next | [frontend/end-of-book.md](../frontend/end-of-book.md) + `/users/listening/end-of-book`, `/users/listening/up-next`, the Up next and downloads settings in `/users/listening/settings` |
| The sleep timer | [frontend/sleep-timer.md](../frontend/sleep-timer.md) + `/users/listening/sleep-timer`, the Sleep settings in `/users/listening/settings` |
| Playback engines / native module | [frontend/playback.md](../frontend/playback.md) (+ `/users/listening/playback` for lock-screen and headphone behaviour) |
| Smart speed, Voice boost, time saved (`effects.ts`, `time-saved.ts`, `effects-settings.tsx`, the Android `effects/` processors, `VoiceBoostTap.swift`, `VoiceBoostDSP.swift`) | [frontend/audio-effects.md](../frontend/audio-effects.md) (+ [frontend/book-page.md](../frontend/book-page.md) for `smartSpeedSaved`) + `/users/listening/full-player` (Smart speed and Voice boost), the Playback settings in `/users/listening/settings`, the Your listening row in `/users/listening/book-page` + the `web-player/phone-speed-sheet.png`, `settings.png` and `phone-settings.png` screenshots |
| CarPlay, Android Auto (`src/car/`, the module's car code, `plugins/withCarPlay.js`), the after-first-unlock token store, the iOS widgets and Live Activity (`src/widgets/`) | [frontend/native-integrations.md](../frontend/native-integrations.md) (+ [testing.md](../frontend/testing.md#native-checks) for how to run them) + `/users/listening/in-the-car`, `/users/listening/mobile-apps` (Availability, In the car, widgets), `/users/listening/sleep-timer` (the Live Activity). The web can't show these surfaces: device screenshots, when there are any, are added by hand to the manifest |
| Downloads / PWA, the offline companion (`offline-meta.ts`) | [frontend/offline.md](../frontend/offline.md) + `/users/listening/offline-downloads` |
| Scanner, detection, metadata | [server/scanner.md](../server/scanner.md) + `/users/getting-started/organizing-your-library` |
| Community chapters (`internal/chapteralign`, `internal/chaptercheck`, `catalog/communitychapters.go`, the Chapters card's panel) | [server/community-chapters.md](../server/community-chapters.md) + the Community chapters section of `/users/admin/books` (and `/users/admin/health` for the Health rows) |
| Auth, invites, shares | [server/auth-and-security.md](../server/auth-and-security.md) + `/users/admin/users-and-invites`, `/users/admin/sharing` |
| Manager features | `/users/manager/*` + [manager developer pages](../manager/overview.md) + `manager/` screenshots |
| Meta schemas, `metaserve` API, or intake tooling | [meta developer pages](../meta/overview.md) (data model, API, contributing) - and the [cross-repo contract](../architecture/cross-repo-contract.md) when the server's `/meta` envelope is affected |
| meta.audiosilo.app site UI | `/users/community/meta-site` + the `meta/` screenshots (+ [meta/overview.md](../meta/overview.md) when it is a site-architecture change) |
| Build / release / distribution | [release-pipeline.md](../architecture/release-pipeline.md) + [releasing.md](./releasing.md) (+ `/users/getting-started/install-unraid` when the native archives or the LinuxServer.io image's template, paths or defaults change) |
| A capability flag | [server/api/index.md](../server/api/index.md) + the feature's user page |

:::tip
When you flip something from "planned" to "shipped" (WebSocket sync,
uploads, manager installers…), search the whole docs tree for
the feature name - several pages deliberately mark these as not-yet-shipped.
:::

## Screenshots

Every embedded image is listed in `screenshots/manifest.mjs` and lives under
`static/img/screenshots/`. The pipeline (`screenshots/run.sh`) rebuilds the
server, seeds a small public-domain LibriVox library, runs a demo-mode server,
and captures the web player, admin console, connect page, and setup wizard
with Playwright. Anything it can't reach (the desktop manager on a headless
machine) gets a labelled placeholder so the build never breaks.

Rules that keep this maintainable:

1. **Pages embed only manifest-listed images.** Add the manifest entry first.
2. **Never hand-edit a generated screenshot** - fix the capture script or the
   seeded state, then re-run; otherwise the next regeneration loses your edit.
3. **UI changed? Re-run `screenshots/run.sh`** and commit the refreshed images
   alongside the docs change.
4. Manager screenshots are captured semi-manually - see
   `screenshots/README.md` for the exact procedure and framing rules.

## Adding a page

1. Create the `.md` file under `docs-users/` or `docs-developers/` with
   `title:` and `description:` frontmatter (body starts at `##`).
2. Add its id to the matching `sidebars-*.ts` - sidebars are hand-written so
   reading order stays deliberate; the build fails if the ids drift.
3. Link related pages with relative `.md` links (validated at build time).
4. `npm run build`.

## Writing style

- **Hyphens, not em dashes.** Use a spaced hyphen (`-`) or restructure the
  sentence; do not use the em dash character. A spaced hyphen reads fine
  mid-sentence, and em dashes also produce messy heading anchors. The one
  exception: a code block that reproduces literal program output verbatim must
  match the source, em dashes included (no current output contains one).
- Cross-referenced headings should use a colon or rephrase rather than a dash,
  so the auto-generated anchor stays clean and stable.

## Deployment

Pushes to `main` build and publish the site via GitHub Actions
(`.github/workflows/deploy.yml`) to GitHub Pages. The site serves at its custom
domain `docs.audiosilo.app`: `docusaurus.config.ts` sets `url`/`baseUrl` and a
`static/CNAME` file is committed.
