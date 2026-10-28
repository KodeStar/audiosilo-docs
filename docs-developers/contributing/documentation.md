---
title: Maintaining these docs
description: "How the documentation site works, when a code change requires a docs change, and how to regenerate screenshots."
---

Documentation is part of the Definition of Done for AudioSilo: a change that
alters behaviour, UI, configuration, or the wire contract isn't finished until
the affected pages here say the new truth. This page is the operating manual
for the docs themselves.

## Where things live

The docs are their own repo, `audiosilo-docs`, a sibling of the code repos
inside the `~/dev/audiosilo` workspace:

```
audiosilo-docs/
  docs-users/          the User Guide        (served at /users)
  docs-developers/     the Developer Docs    (served at /developers)
  sidebars-users.ts    hand-written sidebar + canonical page list
  sidebars-developers.ts
  screenshots/         the capture pipeline (manifest.mjs, run.sh, capture-*.mjs)
  static/img/screenshots/   the generated images the pages embed
  src/                 landing page + theme (shared Shelf tokens, follows the system colour scheme)
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
code repos' gates. A `prebuild` check (`scripts/check-admonitions.mjs`) also
rejects old-style admonition titles (see Writing style below).

Search (the `@easyops-cn/docusaurus-search-local` theme) builds its index
during `npm run build`, so the search box returns nothing under `npm start`.
To try a search, or to check how a page ranks, use the built site:
`npm run build && npm run serve`. A postinstall script,
`scripts/patch-search-link.mjs`, makes the theme's "See all results" link
point at `/search?q=` (the theme ignores `trailingSlash: false`); it fails
the install if a theme upgrade changes that line, so check the link still
keeps its query and then update or remove the script.

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
| Recaps, characters, the series rails and the spoiler gate (`src/components/library/book-meta.tsx`, `meta-gating.ts`, `community-cover.ts`) | [frontend/state-and-data.md](../frontend/state-and-data.md#spoiler-gating-srccomponentslibrarymeta-gatingts) + `/users/listening/recaps-and-characters` |
| The end of a book, what plays next | [frontend/end-of-book.md](../frontend/end-of-book.md) + `/users/listening/end-of-book`, `/users/listening/up-next`, the Up next and downloads settings in `/users/listening/settings` |
| The sleep timer | [frontend/sleep-timer.md](../frontend/sleep-timer.md) + `/users/listening/sleep-timer`, the Sleep settings in `/users/listening/settings` |
| Playback engines / native module | [frontend/playback.md](../frontend/playback.md) (+ `/users/listening/playback` for lock-screen and headphone behaviour) |
| How the web loads a server's covers and audio (`CoverImage`, `src/lib/cors-mode.ts`, the `<audio>` element's `crossOrigin`; server `cors`, `Cross-Origin-Resource-Policy`) | [frontend/playback.md](../frontend/playback.md#web-engine-servicewebts) + [overview.md](../frontend/overview.md#styling-conventions) (`CoverImage`) + [api/index.md CORS](../server/api/index.md#cors) + [auth-and-security.md](../server/auth-and-security.md#transport-hardening) + [cross-repo-contract.md §12](../architecture/cross-repo-contract.md#12-cors-for-web-development) (after the workspace `CROSS-REPO.md` §12) |
| Smart speed, Voice boost, time saved (`effects.ts`, `time-saved.ts`, `effects-settings.tsx`, the Android `effects/` processors, `VoiceBoostTap.swift`, `VoiceBoostDSP.swift`) | [frontend/audio-effects.md](../frontend/audio-effects.md) (+ [frontend/book-page.md](../frontend/book-page.md) for `smartSpeedSaved`) + `/users/listening/full-player` (Smart speed and Voice boost), the Playback settings in `/users/listening/settings`, the Your listening row in `/users/listening/book-page` + the `web-player/phone-speed-sheet.png`, `settings.png` and `phone-settings.png` screenshots |
| CarPlay, Android Auto (`src/car/`, the module's car code, `plugins/withCarPlay.js`), the after-first-unlock token store, the iOS widgets and Live Activity (`src/widgets/`) | [frontend/native-integrations.md](../frontend/native-integrations.md) (+ [testing.md](../frontend/testing.md#native-checks) for how to run them) + `/users/listening/in-the-car`, `/users/listening/mobile-apps` (Availability, In the car, widgets), `/users/listening/sleep-timer` (the Live Activity). The web can't show these surfaces: device screenshots, when there are any, are added by hand to the manifest |
| Connection ids, the identity migration (`src/lib/connection-id.ts`, `src/lib/identity-migration.ts`, a new document keyed by a connection id) | [frontend/state-and-data.md](../frontend/state-and-data.md#connection-identity-server_iduser_id) (+ `ID_DOCUMENTS` when a new document is keyed by a connection id) |
| Profiles, the PIN, the Household page's On this device (`src/stores/profiles.ts`, `src/lib/profile-pin.ts`, `src/components/profiles/`, `src/components/household/device-people.tsx`) | [frontend/profiles.md](../frontend/profiles.md) + `/users/listening/profiles`, `/users/listening/household` |
| Household members: the Household page, the add sheet, member cards, `addMemberHere` (`src/components/household/`, `src/components/connect/add-member-here.ts`; server `auth/members.go`, `catalog/members.go`, `handlers_members.go`, the `household.*` settings; the console's `people/household.tsx`) | [frontend/household.md](../frontend/household.md) + [state-and-data.md](../frontend/state-and-data.md#household-members) + [kids-mode.md](../frontend/kids-mode.md) + [you-and-settings.md](../frontend/you-and-settings.md#account-srccomponentsaccount) (a member's account page, the lost-phone tick) + the [reference](../server/api/reference.md#household-members) + [api/index.md](../server/api/index.md#error-envelope-and-status-conventions) (the codes and the capability) + [auth-and-security.md](../server/auth-and-security.md#household-members) + [data-model.md](../server/data-model.md#accounts--credentials) + [server/configuration.md](../server/configuration.md#household-members-household) + [backups-and-notifications.md](../server/backups-and-notifications.md#audit-log) (the `member` audit area) + the [cross-repo contract](../architecture/cross-repo-contract.md#15-household-members-profiles-and-kids-mode-stay-client-side) + `/users/listening/household`, `/users/listening/kids-mode`, `/users/listening/account`, `/users/listening/profiles`, `/users/admin/users-and-invites#household-members`, `/users/admin/server` (Household, the audit log) |
| Kids mode (`src/components/kids/`, the bedtime rule and the kids 1× speed in `src/playback/listener-settings.ts`, applied by `auto-sleep-controller.ts`, the kids car snapshot in `src/car/`) | [frontend/kids-mode.md](../frontend/kids-mode.md) (+ [frontend/sleep-timer.md](../frontend/sleep-timer.md) for the auto sleep rule) + `/users/listening/kids-mode` (+ `/users/listening/in-the-car` for the car) |
| Listening in the house (`src/components/house/`, the household hooks; server `catalog/household.go`) | [frontend/listening-in-the-house.md](../frontend/listening-in-the-house.md) + the [reference](../server/api/reference.md#listening-in-the-house) + [auth-and-security.md](../server/auth-and-security.md#listening-in-the-house-what-other-people-see) + `/users/listening/in-the-house`, `/users/admin/activity` (what the server records) |
| Chromecast (`src/cast/`, `plugins/withCast.js`; server `auth/cast.go`, `handlers_cast.go`, the web CSP) | [frontend/chromecast.md](../frontend/chromecast.md) + the [reference](../server/api/reference.md#casting) + [auth-and-security.md](../server/auth-and-security.md#cast-tokens) + [server/web-ui.md](../server/web-ui.md#per-document-csp-htmlcsp) for the web CSP (`castSenderScripts`, the policy `TestHTMLCSPCastSender` pins) + `/users/listening/chromecast`, `/users/listening/playback` (other speakers), `/users/getting-started/remote-access` (the certificate note) |
| Downloads / PWA, the offline companion (`offline-meta.ts`) | [frontend/offline.md](../frontend/offline.md) + `/users/listening/offline-downloads` |
| The web start: async routes, `deferred`/`afterPaint`, the root's services (`root-services*.tsx`), the startup cache (`src/api/startup-cache.ts`), the startup queries (`startup-queries.ts`), the start scripts' compile hint and parts (`scripts/web-start-chunks.cjs`), first-screen covers, the web's language chunks (`catalogs.web.ts`), `sw.js`'s build precache | [frontend/overview.md](../frontend/overview.md#the-web-start-a-split-build) + [offline.md](../frontend/offline.md#publicswjs) + [state-and-data.md](../frontend/state-and-data.md#the-startup-cache-web) + [i18n.md](../frontend/i18n.md) + `/users/listening/browsing` (the home screen's note), `/users/listening/offline-downloads` (the PWA), `/users/listening/settings` (Language) |
| First-run setup: the `/setup` page (`handlers_setup.go`, `assets/setup.*`), the console's Set up your server flow and Overview card (`features/setup/`, `finish-setup-card.tsx`), `catalog/setup.go`, `library/preview.go`, `library/mounts.go`, `handlers_admin_setup.go` | `/users/getting-started/first-run` (a section and shot per step) + the quickstarts' setup step (`/users/getting-started/quickstart-docker`, `install-unraid`, `install-binary`) + `/users/admin/console-tour` (the card) + [web-ui.md](../server/web-ui.md#the-first-run-setup-flow) (the flow and the `/setup` page) + the [reference](../server/api/reference.md#admin-first-run-setup) (and `POST /setup`) + [api/index.md](../server/api/index.md#error-envelope-and-status-conventions) (the codes) + [data-model.md](../server/data-model.md#server-state) (`setup_state`, `0053`) + [configuration.md](../server/configuration.md) (`--setup`) + [backups-and-notifications.md](../server/backups-and-notifications.md#audit-log) (`settings.setup`) + the `server/setup-wizard*.png` and `setup/*.png` screenshots (`capture-setup.mjs`: `SHOTS_ONLY=setup/,server/setup-wizard screenshots/run.sh`) |
| The ebook reader: the server's `ebook` field, `handlers_ebook.go`, `library/ebook.go` (`BookEbook`, `OpenEbook`), `catalog/reading_progress.go` (`ResolvePlace`), `web.readerCSP`; the player's `reader/` (the reader document, `scripts/build-reader.mjs`), `src/reader/` (the web and app hosts, the app's EPUB cache and chunked transfer), Read on the book page, the ebook in downloads (`manifest.ebookUri`) | [frontend/reader.md](../frontend/reader.md) + [frontend/offline.md](../frontend/offline.md) + the [reference](../server/api/reference.md#ebooks-and-the-reading-place) + [server/web-ui.md](../server/web-ui.md#the-reader-document-readercsp) + [scanner.md](../server/scanner.md#a-books-ebook) + the [cross-repo contract](../architecture/cross-repo-contract.md#18-the-ebook-reader) + `/users/listening/reading-the-ebook` (+ `/users/listening/keyboard-shortcuts` for its keys, `/users/listening/offline-downloads` for the ebook in downloads) + the `web-player/reader*.png` and `book-read.png` screenshots |
| Scanner, detection, metadata | [server/scanner.md](../server/scanner.md) + `/users/getting-started/organizing-your-library` (+ [configuration.md](../server/configuration.md#library-scans-scan) and `/users/admin/libraries#rescanning` for `scan.concurrency`) |
| Community chapters (`internal/chapteralign`, `internal/chaptercheck`, `catalog/communitychapters.go`, the Chapters card's panel) | [server/community-chapters.md](../server/community-chapters.md) + the Community chapters section of `/users/admin/books` (and `/users/admin/health` for the Health rows) |
| Auth, invites, shares | [server/auth-and-security.md](../server/auth-and-security.md) + `/users/admin/users-and-invites`, `/users/admin/sharing` |
| Rate limiting (`api/ratelimit.go`, `rateLimit`, `requireAuth`/`mediaAuth`'s per-credential buckets, `rate_limit.*`) | [auth-and-security.md](../server/auth-and-security.md#rate-limiting) + [api/index.md](../server/api/index.md#rate-limiting) + [configuration.md](../server/configuration.md#rate-limits-rate_limit) + `/users/getting-started/remote-access` (why it's safe, the reverse proxy), `/users/troubleshooting` (Too many tries) |
| The Bridge: the server's side (`auth/bridge.go`, `internal/bridge`, `handlers_bridge.go`, `handlers_bridge_estimate.go`, the `bridge` capability, the console's `features/bridge/`) or `audiosilo-bridge` (its config, images, compose example, mapping checks, job runner, page, the agent container and its credential hand-off, `sidecars.generate`, `sidecars.describe`, `sidecars.contribute`, `meta.correct`, the setup checklist, the Accounts tab and its GitHub sign-in) | [the Bridge developer pages](../bridge/index.md) (index, pairing and jobs, mappings, characters and recaps, the .audiosilo folder, the agent container, contributions, configuration, development) + the [reference](../server/api/reference.md#the-bridge) + [api/index.md](../server/api/index.md#capability-flags---gate-your-features) (the capability, the codes, the bridge token) + [auth-and-security.md](../server/auth-and-security.md#bridge-tokens) + [data-model.md](../server/data-model.md#the-bridge) + [backups-and-notifications.md](../server/backups-and-notifications.md#events) (the `bridge_job_*` events) + [web-ui.md](../server/web-ui.md) (the console's Settings > Bridge and the book page's Bridge parts) + the [cross-repo contract](../architecture/cross-repo-contract.md#16-the-bridge) (after the workspace `CROSS-REPO.md` §23) + `/users/admin/bridge`, `/users/admin/generating-characters-and-recaps`, `/users/getting-started/running-a-bridge` (its steps follow the setup checklist's order), `/users/getting-started/bridge-accounts` and `/users/community/contributing-from-your-server` + [meta/contributing-data.md](../meta/contributing-data.md#issues-filed-through-the-audiosilo-app) (what the Bridge files, and how meta routes it) + the `admin/settings-bridge*.png`, `admin/bridge-setup.png`, `admin/bridge-pair.png`, `admin/book-generate.png`, `admin/generate-dialog.png` and `admin/book-description.png` screenshots + the Bridge page's `bridge/*.png` screenshots (`capture-bridge.mjs`: `BRIDGE=<checkout> SHOTS_ONLY=bridge/ screenshots/run.sh`) |
| Podcasts: library kind, `internal/podcast`, catalog/handlers, the Bridge's `podcastjob`, `netguard`, feed/Fetch files, downloads, on-demand/status/Retry and queue prefetch, listener fetch limits, claim priority/reserved capacity, retention aggregates/policies, generations/ETags, publication journals, CHAP or root markers; directory search and OPML (`internal/podcast/{discovery,opml,quota}`, `follow.go`, `opmlimport.go`, `export.go`, `podcasts.discovery.enabled`, the Podcast Index variables) | [bridge/podcasts.md](../bridge/podcasts.md) (with its [discovery and OPML](../bridge/podcasts.md#discovery-and-opml-transfer) section, its [player](../bridge/podcasts.md#player-phase-2d-1) and [player discovery and OPML](../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2) sections) + [server/modules.md](../server/modules.md), [configuration.md](../server/configuration.md#managed-modules-modules) (and its [podcast discovery](../server/configuration.md#podcast-discovery-podcastsdiscovery) section), [API reference](../server/api/reference.md#podcasts) (including admin storage and Bridge retention), [API flags](../server/api/index.md#capability-flags---gate-your-features), [data-model.md](../server/data-model.md#podcasts), [scanner.md](../server/scanner.md#podcast-libraries), [auth-and-security.md](../server/auth-and-security.md#podcast-visibility), [bridge/configuration.md](../bridge/configuration.md#podcasts), [attachments.md](../bridge/attachments.md#podcast-chap-attachments), [mappings.md](../bridge/mappings.md#podcast-libraries-the-marker), [pairing-and-jobs.md](../bridge/pairing-and-jobs.md#podcast-jobs), [bridge/index.md](../bridge/index.md), [cross-repo-contract.md](../architecture/cross-repo-contract.md#17-podcast-shows-feeds-and-client-visibility) + `/users/admin/podcasts`, `/users/admin/libraries`, `/users/admin/bridge`, `/users/admin/server#modules`, `/users/getting-started/running-a-bridge`, `/users/faq` (what a directory search sends) + `admin/libraries.png`, `admin/library-add.png`, `admin/library-add-podcasts.png`, `admin/library-edit.png` and `admin/settings-modules.png` |
| The player's podcasts: `src/components/podcasts/`, `src/playback/episode-fetch.ts`, Home's New episodes (`new-episodes-*`, `use-new-episodes.ts`), the `shows` Library mode, `src/lib/library-kind.ts`, the podcast client gate (`auth.PodcastPlayerMinVersion`, `app.json` `expo.version`, `client-id.ts`), the gated whole-list replace (`catalog.GatedScopes`); finding shows (`find-shows-*`, `directory-search.tsx`, `discovery-*`, `follow-by-url.tsx`, `follow-requests.tsx`, `opml-*`, `use-opml-import.ts`, `shows-actions.tsx`, `check-episodes-button.tsx`, `artwork-retry.ts`, `src/lib/podcast-requests.ts`, `findShowsHref`, the `podcast_discovery` / `podcast_opml` client methods and hooks), the server's CORS lists (`corsAllowHeaders`, `corsExposeHeaders`) | [frontend/podcasts.md](../frontend/podcasts.md) (and its [Finding shows](../frontend/podcasts.md#finding-shows)) + [bridge/podcasts.md](../bridge/podcasts.md#player-phase-2d-1) (the wire and the controller's rules; [discovery and OPML](../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2) for 2d-2) + [api/index.md CORS](../server/api/index.md#cors) and [cross-repo-contract.md §12](../architecture/cross-repo-contract.md#12-cors-for-web-development) + [auth-and-security.md](../server/auth-and-security.md#podcast-visibility) + the [reference](../server/api/reference.md#podcasts) (the gate, the replace rules) + [api/index.md](../server/api/index.md#client-identification-x-audiosilo-client) + the lines in [playback.md](../frontend/playback.md), [state-and-data.md](../frontend/state-and-data.md), [offline.md](../frontend/offline.md), [chromecast.md](../frontend/chromecast.md), [end-of-book.md](../frontend/end-of-book.md) and [kids-mode.md](../frontend/kids-mode.md) + `/users/listening/podcasts` (and the podcast lines in `browsing`, `up-next`, `end-of-book`, `offline-downloads`, `chromecast`, `kids-mode`, `mobile-apps`, `/users/troubleshooting`, `/users/admin/podcasts`, `/users/admin/server#modules`, `/users/faq`) + the `web-player/library-shows.png`, `podcast-show.png`, `home-new-episodes.png`, `episode-fetching.png`, `phone-podcast-show.png`, `find-shows-search.png`, `find-shows-address.png`, `find-shows-import.png` and `phone-find-shows.png` screenshots (the podcast seed in `run.sh` and its `directory` fixture; Find shows' stand-in routes in `capture-web.mjs`) |
| Managed modules: the server's `internal/modules` (its `Runner`, the `builtin` registry), `api/modules.go`, a `modules.<id>` setting, the console's Settings > Modules (`features/settings/modules-topic.tsx`), the player's `src/modules/` registry and slots | [server/modules.md](../server/modules.md) (+ the adding-a-module steps) + [configuration.md](../server/configuration.md#managed-modules-modules) (the key, the variable, the runtime table) + the [reference](../server/api/reference.md#get-apiv1adminmodules) (`GET /admin/modules`, the settings envelope's `modules`, the module's flag on `GET /server`, the module's Bridge jobs) + [api/index.md](../server/api/index.md#capability-flags---gate-your-features) (the flag, `module_off`, `kid_account`, `demo_account`) + [bridge/pairing-and-jobs.md](../bridge/pairing-and-jobs.md#jobs-of-a-managed-module) (the jobs a module owns, held while it is off) + [web-ui.md](../server/web-ui.md) + [frontend/state-and-data.md](../frontend/state-and-data.md#player-modules-srcmodules) + the [cross-repo contract](../architecture/cross-repo-contract.md#8-capability-flags-get-apiv1server) + `/users/admin/server#modules` (the console's Learn more link opens it: keep the heading) + `/users/admin/bridge#when-the-contributions-module-is-off` + the `admin/settings-modules.png` screenshot |
| Chapterless books: the Bridge's `internal/chapterdetect`, `chapter_detecting`, the windows manifest, `chapters.detect`; the server's `metadata/chapterlist.go`, `catalog/generatedchapters.go`, the console's Detect chapters (`health/detect-chapters-dialog.tsx`) and the Chapters card's source control; the player's generated caption | [bridge/chapters.md](../bridge/chapters.md) + [bridge/attachments.md](../bridge/attachments.md#chaptersjson) + [bridge/pairing-and-jobs.md](../bridge/pairing-and-jobs.md#kinds-are-allow-listed-twice) (the kinds table) + [server/community-chapters.md](../server/community-chapters.md#generated-chapters) + the [reference](../server/api/reference.md#post-apiv1adminbridgejobs) (`chapters_source`, `chapter_choice`, `generated_chapters_fit`, the `409` codes) + [api/index.md](../server/api/index.md#capability-flags---gate-your-features) (the `chapters` feature, the codes) + [data-model.md](../server/data-model.md) + [backups-and-notifications.md](../server/backups-and-notifications.md#events) (`chapters_source` on the event) + [web-ui.md](../server/web-ui.md) (Health, the Chapters card) + [frontend/book-page.md](../frontend/book-page.md#the-chapters-tab) (the caption) + `/users/admin/generating-characters-and-recaps#books-without-chapters`, `/users/admin/health`, `/users/admin/books#chapters-found-in-the-narration`, `/users/listening/book-page#chapters` + the `admin/health-detect-chapters.png`, `admin/detect-chapters-dialog.png` and `admin/book-chapters-generated.png` screenshots |
| Generated characters, recaps and descriptions: `.audiosilo/` (the server's `library/attachments.go`, `metadata/attachments.go`, `catalog/attachments.go`, `meta/generated.go`; the Bridge's `internal/generate`, `internal/pipeline/describe_stage.go`), the console's Description part (`describe-section.tsx`) or the player's generate action, mark and About (`src/components/bridge/`, `GeneratedMark`, `aboutContent`) | [bridge/attachments.md](../bridge/attachments.md) + [bridge/generating.md](../bridge/generating.md) + [server/scanner.md](../server/scanner.md#the-bridges-attachments) + the `/meta` [generated content](../server/api/reference.md#generated-content) + [frontend/book-page.md](../frontend/book-page.md#the-primary-action-and-the-action-row) (and its About) + `/users/admin/generating-characters-and-recaps`, `/users/listening/recaps-and-characters`, `/users/listening/book-page` (About) + the `admin/book-description.png` and `web-player/book-about-generated.png` screenshots |
| Metadata mirror mode (`metadata.mode`, `internal/metamirror`, `internal/meta/mirror.go`, the Source card, the mirror panel on Health > System) | [server/configuration.md](../server/configuration.md#mirror-mode-metadatamode-mirror) + the mirror routes in [api/reference.md](../server/api/reference.md#the-local-copys-status-metadatamirror) + `/users/admin/server` (Keeping a local copy), `/users/admin/health` (the local copy), `/users/faq` (privacy) |
| `pkg/query`, `pkg/query/querytest`, `pkg/release` in audiosilo-meta, or the artifact schema | [meta/overview.md](../meta/overview.md#public-go-packages) + [meta/data-model.md](../meta/data-model.md#the-compiled-artifact-and-schema-versioning) + the [cross-repo contract](../architecture/cross-repo-contract.md#13-community-metadata-a-three-repo-seam) (mirror-mode servers read the artifact directly) |
| Meta schemas, `metaserve` API, or intake tooling (`route.yml`, the intake denylist included) | [meta developer pages](../meta/overview.md) (data model, API, contributing) - and the [cross-repo contract](../architecture/cross-repo-contract.md) when the server's `/meta` envelope is affected, and `/users/community/contributing-from-your-server` when the limits that hold a Bridge's submission change |
| meta.audiosilo.app site UI | `/users/community/meta-site` + the `meta/` screenshots (+ [meta/overview.md](../meta/overview.md) when it is a site-architecture change) |
| Build / release / distribution | [release-pipeline.md](../architecture/release-pipeline.md) + [releasing.md](./releasing.md) (+ `/users/getting-started/install-unraid` when the native archives or the LinuxServer.io image's template, paths or defaults change) |
| A capability flag | [server/api/index.md](../server/api/index.md) + the feature's user page |
| The shared design tokens (`audiosilo-server/admin-ui/src/styles/globals.css`: colours, font stacks, shadows, motion) | Section 2 (shared tokens) of this site's `src/css/custom.css`, copied across verbatim (the dark block stays inside its `@media screen` wrapper), then a look at the built site in light and dark |

:::tip
When you flip something from "planned" to "shipped" (WebSocket sync or
uploads), search the whole docs tree for
the feature name - several pages deliberately mark these as not-yet-shipped.
:::

## Screenshots

Every embedded image is listed in `screenshots/manifest.mjs` and lives under
`static/img/screenshots/`. The pipeline (`screenshots/run.sh`) rebuilds the
server, seeds a small public-domain LibriVox library, runs a demo-mode server,
and captures the web player, admin console, connect page, the first-run
setup page and console flow (on a second, `--setup` server) and, when the
`audiosilo-bridge` checkout is there, the Bridge's own page (a real Bridge paired
with the demo server, `capture-bridge.mjs`) with Playwright.
Anything it can't reach gets a labelled placeholder so the build never breaks.

Rules that keep this maintainable:

1. **Pages embed only manifest-listed images.** Add the manifest entry first.
2. **Never hand-edit a generated screenshot** - fix the capture script or the
   seeded state, then re-run; otherwise the next regeneration loses your edit.
3. **UI changed? Re-run `screenshots/run.sh`** and commit the refreshed images
   alongside the docs change.

## Adding a page

1. Create the `.md` file under `docs-users/` or `docs-developers/` with
   `title:` and `description:` frontmatter (body starts at `##`; the
   `title:` already renders as the page heading, so do not repeat it).
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
- **Admonition titles go in brackets.** Write `:::note[Title]` (also `tip`,
  `info`, `warning`, `danger`, `caution`), then the body, then a closing `:::`.
  The old `:::note Title` form no longer parses on this site (`future.v4`
  turns off `markdown.mdx1Compat.admonitions`) and shows up as literal
  `:::note Title` text, so the build rejects it. A bare `:::note` without a
  title is fine.

## Deployment

Pushes to `main` build and publish the site via GitHub Actions
(`.github/workflows/deploy.yml`) to GitHub Pages. The site serves at its custom
domain `docs.audiosilo.app`: `docusaurus.config.ts` sets `url`/`baseUrl` and a
`static/CNAME` file is committed.
