---
title: Cross-repo contract
description: "Every seam where changing one AudioSilo repo forces a change in another - a readable digest of the workspace CROSS-REPO.md."
---

The server defines the JSON/HTTP contract; the frontend and the manager mirror it
**by hand** (no codegen). This page is a tour of every seam - every place where a
change in one repo forces a change (or a deliberate decision) in another.

:::info This page is the tour, not the source
The **normative** contract is `~/dev/audiosilo/CROSS-REPO.md` in the workspace
root. When a seam changes, **update CROSS-REPO.md first**, in the same logical
change as the code - then bring this page in line. If this page and CROSS-REPO.md
ever disagree, CROSS-REPO.md wins.
:::

Canonical reference points on each side of the main seam:

- Server route table: `internal/api/api.go`
- Frontend client (mirrors it 1:1): `src/api/client.ts`
- Frontend wire types: `src/api/types.ts`
- Manager's mirrored subset: `internal/serverapi` (in audiosilo-manager)

## 1. Path is the identity - `(library_id, rel_path)`

**What couples:** the deepest shared invariant - content is addressed by
`(library_id, rel_path)` with the path in a `?path=` query param, never by DB id
(see [Invariants §1](invariants.md#1-path-is-the-identity)).

**Server:** `catalog.GetBookByPath` resolves `(library, path)` → book (indexing
on demand); `library.SafeJoin` guards every user-derived filesystem access;
durable user state is path-keyed with no FK to `books`.
**Frontend:** every content call in `src/api/client.ts` passes `?path=`; helpers
in `src/lib/paths.ts`; client state persists keyed by `(library_id, path)`.

**A change requires:** touching path semantics (normalization, casing, what a
"book path" vs a "file path" means) means changing both sides at once, **plus**
the move-tracking fingerprint logic - and re-checking seam 6 (a track URL must
stay a real file path).

## 2. JSON envelopes (hand-mirrored, no codegen)

**What couples:** every response shape. Auth returns `{ token, user }`; `/me`
returns the user directly; lists are wrapped (`{ libraries }`,
`{ books, next_cursor }`, `{ progress }`, `{ bookmarks }`, `{ notes }`,
`{ history }`, `{ favourites }`; the all-books `/me/bookmarks`, `/me/notes` and
`/me/history` add an optional `next_cursor`); chapters return `{ chapters, files, duration }`;
errors are `{ error }`. The `user` object carries `has_password`/`has_recovery`,
which drive the frontend's sign-out warning.

**Server:** `internal/api/handlers_*.go` define the JSON.
**Frontend:** `src/api/types.ts` re-declares the shapes; `src/api/client.ts`
unwraps the envelopes (errors become `ApiError(status, error)`); `src/api/hooks.ts`
exposes React Query hooks.

**A change requires:** the full [wire-change checklist](#the-wire-change-checklist)
- a field rename is a two-repo edit (three, if the manager reads that shape).

**Admin metadata edits don't move the player wire.** The book JSON's metadata
fields carry the *effective* values (scan, then enrichment, then any admin
override), so a player simply receives the edited title/author/etc. with no new
field to mirror. Of the columns the edits introduced, `published` rides on every
player book and `description` on `GET /libraries/{id}/item` only (it can be long,
so list pages leave it out); `has_cover`, the scanned values and per-file codec stay
off the player's book JSON (`json:"-"` on `catalog.Book`) and surface only through
the admin-only catalog API (`/api/v1/admin/books` and friends), which the admin
console in the server repo consumes.

**Player-redesign data API (Phase 1a).** Additive shapes the frontend mirrors in
`types.ts`/`client.ts`/`hooks.ts`, each behind a capability flag (seam 8), read by
the browse screens and Home and by the player (the cover wash, the end of a book):
every `Book` gains `published`, `cover_color` (`{bg,
accent?, on_accent?}`, sent only while it matches the current art) and
`cover_version` (a hash of the book's cover art identity, a cache buster rather than
a content hash); `GET /libraries/{id}/authors`,
`/narrators` (`{ authors|narrators, unknown }`, normalised by the client to
`PeopleList { people, unknown }`) and `/series` (`{ series }`) are scope-filtered
browse lists, and `/books` takes `narrator=` (`useLibraryBooks`); `GET
/libraries/{id}/next` answers `{ source, next?, book?, work? }` (`NextBook`, seam
14). The share-scope SQL behind all of these (`pathFilterSQL`) is a case-sensitive
byte-range prefix, matching `Scope.Allows` exactly.

**Player-redesign user state (Phase 1b).** The listener's own state, mirrored the
same way and gated per feature (seam 8), read by Up next, collections, the book
menu, Home and the end credits (only `/me/devices` has no screen yet): up next
(`/me/queue`, `{ queue }`), collections shared read-only with named users
(`/me/collections/**`, `{ collections }` / `{ collection, items }`, and
`/me/share-targets`, `{ users }`), ratings (`/libraries/{id}/rating`,
`{ rating }`, and `/me/ratings`), the caller's own progress edit
(`PATCH /libraries/{id}/progress`, mark finished or unfinished, edit the dates)
with `started_at` / `finished_at` on every progress response, personal stats
(`/me/stats`, `{ stats }`; `/me/listening`; `/me/goal`, a books-per-year goal)
and the caller's devices (`/me/devices`). List entries are `{ library_id, path }`
book references (seam 1) carrying an optional list-shape `book`; every list is
filtered by the caller's current access, and an id that isn't the caller's is a
`404`. Shapes and status codes are in the
[reference](../server/api/reference.md#up-next-collections-and-ratings); the
security rules in
[Auth & security](../server/auth-and-security.md#the-listeners-own-state-me).

**Bookmark labels, edits and the lists across books.** Gated by `annotations`
(seam 8): every bookmark carries `label`, which `POST .../bookmarks` accepts; the
owner edits a row with `PATCH /bookmarks/{id}` and `PATCH /notes/{id}`, each
answering the bare row; `GET /me/bookmarks` (`{ bookmarks, next_cursor? }`) and
`/me/notes` (`{ notes, next_cursor? }`) list the caller's rows across books, and
`/me/history` pages on the same `cursor` with a `book?` per row. Shapes, bounds and
status codes are in the [reference](../server/api/reference.md#patch-apiv1bookmarksid),
the security rules in
[Auth & security](../server/auth-and-security.md#the-listeners-own-state-me), and the
client side in [State & data](../frontend/state-and-data.md#bookmarks-notes-and-the-journal).

## 3. Media auth rides in the URL - `?token=`

**What couples:** browsers can't set an `Authorization` header on
`<img>`/`<audio>`, so cover and stream GETs accept the session token as a
`?token=` query param on every platform.

**Server:** `internal/api/middleware.go` - only cover + stream routes use
`requireMediaAuth`, which calls `bearerToken(r, true)`; all other routes are
header-only (`bearerToken(r, false)`), so tokens never ride the query string where
they could leak into access logs or Referer headers.
**Frontend:** `client.ts` `mediaTokenQuery()` → `coverUrl()`/`streamUrl()`. Native
also sends the header (belt-and-braces); web relies solely on the query param.

**Cover thumbnails** ride the same path: `GET /libraries/{id}/cover?size=160|320|640`
(capability `cover_sizes`) is a JPEG of the same art with an `ETag` of size + art
version and `Cache-Control: private, no-cache` (custom cover) or
`private, max-age=86400` (file art); any other `size` is a `400`, and a thumbnail
that can't be made is a `404` the client answers by falling back to the full-art
URL. Clients add the book's `cover_version` as `v=` purely as a cache buster:
`coverUrl(lib, path, { size, version })`.

**A change requires:** do **not** "tighten" the server to reject query-param
tokens on media routes without first removing the web player's dependency on
them - the web player cannot authenticate media any other way.

## 4. Audio `Content-Type` must be real (byte-sniffed)

**What couples:** iOS AVPlayer rejects audio served as `application/octet-stream`
under `nosniff` (error `-12847`), so the served MIME type must be genuinely
correct.

**Server:** `internal/media/media.go` `ServeFile` sniffs magic bytes - `ftyp` →
`audio/mp4`, ID3/MPEG-sync → `audio/mpeg`, ADTS → `audio/aac`, plus
`fLaC`/`OggS`/`RIFF`/`WAVE` - falling back to the extension.
**Frontend:** assumes a correct `Content-Type`; there is deliberately no client
workaround.

**A change requires:** any change to how audio is served (new container support,
a proxy in front) must preserve true audio MIME types, validated on an iOS device.

## 5. Transcode negotiation: `direct_playable` and `?transcode=1`

**What couples:** whether a file needs server-side transcoding to play in a given
client.

**Server:** the scanner records each book's `codec` (ffprobe `codec_name`,
migration `0008_book_codec`); `item`/`chapters` expose `direct_playable` via
`media.DirectPlayable`; `GET .../stream?path=…&transcode=1` pipes through ffmpeg
to MP3 (`media.Transcode`), with `&t=<seconds>` to start mid-file (transcoded
output isn't byte-seekable). All gated by the `--ffmpeg` flag and reflected in the
`transcode` capability (seam 8).
**Frontend:** `Book.direct_playable`/`codec` and
`ChaptersResponse.direct_playable`/`codec` are mirrored in `types.ts`, and
`client.ts` `streamUrl(…, { transcode, t })` builds a transcoded stream URL. The
**web player negotiates it** (`src/playback/transcode.ts`): on web, a book whose
`direct_playable` is explicitly `false` streams with `?transcode=1` when its
server's `transcode` capability is `true`; the web engine re-requests with a new
`&t=` on every seek and keeps positions track-absolute, the book page says the
audio is converted for this browser, and downloading such a book is off in the
browser. Native engines never transcode (they rely on the platform's own
decoders); a downloaded file is never transcoded. Details in
[frontend playback](../frontend/playback.md#web-transcode-negotiation-transcodets).

**A change requires:** changing `direct_playable`'s meaning or the transcode query
params changes both sides. The negotiation degrades by design: an absent
`direct_playable` (an older server, or any list response - only `item` and
`chapters` carry it) reads as playable, as does a codec never probed (sent as
`true`), and
an unknown or `false` `transcode` capability streams the file directly, exactly as
before negotiation existed.

## 6. The chapter / whole-book timeline model

**What couples:** the subtlest shared model - single-file m4b chapters and
multi-file mp3 "parts" are normalized to one shape so a player renders both
identically.

**Server:** `metadata.Chapter` carries `file_path` (the library-relative file to
stream), in-file `start`/`end`, and `book_offset` (its start on the whole-book
timeline); `GET .../chapters` returns `{ chapters, files, duration }`.
**Frontend:** `src/playback/book-queue.ts` builds the track queue from `files`
(else distinct chapter `file_path`s, else the single-file path);
`src/playback/store.ts` maps `(trackIndex, position)` ↔ whole-book position via
cumulative `offsets` and overlays chapters by `book_offset`.

**A change requires:** any change to chapter normalization changes the queue
builder and the timeline math with it. And always: **stream the file, not the
book** - a folder path in a track URL is the MediaToolbox `-12864` bug class
(see [Invariants §3](invariants.md#3-stream-the-file-never-the-book)).

## 7. Pairing / connect deep links

**What couples:** the auth-code → session handshake, spanning both repos and two
URL carriers.

**Server:** `internal/api/qr.go` `buildPairing` emits `web_url`
(`<base>/web/connect?token=…`, encoded in the QR - opens the app via
Universal/App Links on claimed domains, else the web player) and `uri`
(`audiosilo://connect?server=<base>&token=<pairing_token>`, custom scheme). Flow:
`POST /auth/redeem` (code → pairing payload) → `POST /auth/exchange` (pairing
token → device-scoped session).
**Frontend:** the `audiosilo` scheme in `app.json`; the connect/pairing parser and
the `/web/connect` route consume both carriers; `client.ts`
`redeemCode()`/`exchange()`.

**A change requires:** the scheme, the query keys (`server`, `token`), and the
`/web/connect` route path are a contract - change the server emitter, the parser,
and `app.json` together, or pairing breaks.

## 8. Capability flags: `GET /api/v1/server`

**What couples:** feature negotiation, so any app build can talk to any server
version.

**Server:** `handleServerInfo` advertises `admin_ui`, `web_player`, `upload`,
`transcode`, `websocket`, `api_keys`, `export`, `metadata`, `meta_bundle`,
`browse_people`, `cover_sizes`, `next_book` and the flags added after it, plus the
server version
(`api.Version`, stamped from the release tag via ldflags). `transcode` reflects
ffmpeg availability; `web_player` reflects whether `/web` is populated; `api_keys`
reflects that the server accepts user-minted API keys; `metadata` and
`meta_bundle` follow the runtime metadata switch; `browse_people`, `cover_sizes`,
`next_book` and every flag after it are always true on a server that has them (the
full table is in
[API conventions](../server/api/index.md#capability-flags---gate-your-features)).
(`upload` and `websocket` are reserved for **planned** phases - `POST /uploads`
and WebSocket sync are not shipped.)
**Frontend:** the `ServerInfo` type; feature gating and the "connected server
version" display key off it. Every flag from `meta_bundle` on is optional on `Capabilities`
and read through the exported, tri-state `useCapability(flag, connectionId?)` in
`hooks.ts` (`undefined` until `/server` answers, then `true`/`false`); the gated
hooks give a server without the flag no query function (`skipToken`), so it is
never asked, and the gated mutations (`useCapabilityMutation`) reject with
`CapabilityError` (not an
`ApiError`, so no reconnect banner) without sending anything while the flag is
false or `/server` hasn't answered.

**A change requires:** adding a capability is a two-repo change - flip the flag as
the feature lands server-side, and gate the new UI on it client-side. Never assume
a capability is present.

## 9. The web player is served *by* the server at `/web`

**What couples:** the frontend's web build is not vendored in the server repo -
the server serves it at runtime from `web_dir` (Docker bakes a pinned build in;
native binaries embed one via `-tags embedplayer`).

**Frontend:** `app.json` `experiments.baseUrl: "/web"` - the export must be built
with `baseUrl=/web` so asset URLs resolve under the subpath; `web.output: "static"`.
**Server:** `internal/web/web.go` serves `web_dir` at `/web` with an SPA fallback
to `index.html`, 404s for missing assets, and a per-response scoped CSP that
hashes each document's inline scripts.

**A change requires:** watch the CSP coupling - the hash is computed per document
at serve time, so it usually tracks automatically, but a change in how Expo
inlines bootstrap scripts can break strict CSP. Compatibility is otherwise "by
construction": the server image pins a specific web build.

## 10. Demo mode - `demo.audiosilo.app`

**What couples:** the public throwaway-account demo flow.

**Server:** `config.demo.*` (enabled/library/max_users/idle_ttl);
`POST /demo/session` mints a reaped throwaway account (migration
`0005_user_is_demo`); in demo mode the site root `/` redirects to
`const webDemoPath = "/web/demo"` in `api.go` - explicitly the single point of
coupling with the player's router.
**Frontend:** `client.ts` `demoSession()` + the `DemoSession` type, and the
`/web/demo` route/screen in the Expo router.

**A change requires:** rename the player's demo route → update `webDemoPath` in
the server, in the same change.

## 11. Build & release coupling (order matters)

**What couples:** the deployable server image contains a **pinned** web player, so
the web image must exist before the server image builds.

**Frontend:** `.github/workflows/web.yml` exports the web build and pushes
`ghcr.io/<owner>/audiosilo-web`.
**Server:** `Dockerfile` does `FROM ${WEB_IMAGE} AS web` then `COPY --from=web /web /app/web`;
`.github/workflows/image.yml` builds and pushes
`ghcr.io/<owner>/audiosilo-server`; `.github/workflows/release.yml` +
`scripts/fetch-web-player.sh` embed the same pinned build into native binaries.

**A change requires:** publish the web image **before** the server image on every
release. Full detail in [Release pipeline](release-pipeline.md); the operator
runbook is [Releasing](../contributing/releasing.md).

## 12. CORS for web development

**What couples:** during development the web player (`expo start --web` on
`:8081`) and the API (`:8080`) are different origins.

**Server:** set `cors_origins` to include the web origin (e.g.
`http://localhost:8081`); `"*"` disables the check; empty means no cross-origin
headers (native and same-origin still work).
**Frontend:** `npm run web` serves on `:8081` by default.

The player's `X-AudioSilo-Client` identity header is a custom header, so it
would force a preflight on every cross-origin call. The server's
`Access-Control-Allow-Headers` lists it, but servers released before it don't,
so the web player sends it **only same-origin** (`shouldIdentify` in
`src/lib/client-id.ts`; native always sends it). Keep that rule when adding any
custom request header (see
[Client identification](../server/api/index.md#client-identification-x-audiosilo-client)).

**A change requires:** nothing structural - just remember self-signed TLS (the
server default) needs trusting in the browser, or use `AUDIOSILO_TLS_MODE=off`
for plain-HTTP local dev.

## 13. The manager ↔ server seam

**What couples:** `audiosilo-manager` is the write/management side, but its
*network* relationship with the server is read-only for content - all file writes
happen client-side (SFTP or a local/mounted copy).

**What the manager consumes** (via its `internal/serverapi`):

- pairing/auth: `POST /auth/redeem` → `POST /auth/exchange` (session token stored
  in the OS keychain, never the registry file);
- `GET /server`, `GET /admin/libraries`, `GET /libraries/{id}/fs`,
  `GET /libraries/{id}/books` + `GET /search` (series-sibling detection,
  existence-by-ASIN), `GET /libraries/{id}/item`;
- `GET /me/progress` + `PUT /libraries/{id}/progress` (the same write the player
  makes) for stats sync;
- `POST /admin/libraries/{id}/scan` - a non-destructive reindex after placement;
- its **one enrichment write**: `PUT /admin/libraries/{id}/enrichment?path=`
  (`{asin, isbn}`) - a durable, path-keyed `book_enrichment` row, layered back
  onto the book by every re-index (`catalog.UpsertBook`); it modifies no file.

**Shared code, not just shared wire:** the fuzzy book matcher lives in the
server's public `pkg/match` (`Best`, `CleanTitle`, `SeqFromTitle`) and the manager
imports it. The "create a local server" flow runs the server **in-process** via
the server's public `pkg/launcher` (`Run`/`Options`). The manager depends on the
server module via a local `replace ../audiosilo-server`, so CI checks out both
repos as siblings.

**A change requires:** the manager hand-mirrors the server shapes it reads, same
rule as the frontend - a wire change to any endpoint above touches the server
handler **and** `serverapi`, with tests on both. Changes to `pkg/match` or
`pkg/launcher` are public-API changes consumed by another repo: build the manager
against them before calling it done. See
[manager server integration](../manager/server-integration.md).

## 14. Community metadata: a three-repo seam

**What couples:** enriched book metadata (description, characters, recaps, "more
in this series") originates in a fourth repo, `audiosilo-meta`, and flows through
the server to the player.

**Upstream (`audiosilo-meta`):** `metaserve` serves the community metadata
read-only (`GET /lookup`, `/works/{id}`, `/series/{id}`) - see the
[metadata database developer pages](../meta/overview.md).
**Server:** `internal/meta` resolves a book's ASIN/ISBN against `metaserve` and
composes an enrichment envelope, returned at `GET /libraries/{id}/meta` behind an
admin off-switch and a bounded cache; `GET /meta/work?id=…` serves one work
document straight through (authed but **not** library-scoped, since a work id
names nothing on this server) from the same cache, for the earlier books of a
series the caller does not own. The `metadata` capability on `GET /server`
reflects whether either lookup is live. The admin console's match dialog
(`GET /admin/libraries/{id}/book/match`) asks `metaserve`'s structured
`GET /works/match` with the book's tag and path facts, falling back to
`lookup` + `works/search` against a `metaserve` that predates the route; its
candidates pass `metaserve`'s `score` and `reasons` through to the console's
hand-mirrored types (`admin-ui/src/api/types.ts`), not to the player.
**Frontend:** the `BookMeta` envelope (hand-mirrored in `src/api/types.ts`) is
fetched by `client.bookMeta` and rendered capability-gated on the book screen's
Recaps/Characters/Series tabs, and also read by the series page, Home (the Now card
and Previously on), Search, the end credits and the player's companion and reveal
toast; `client.metaWork` / `useMetaWork` lazily fetch a
previous book's work when the reader opens its row. Reading-order families
(metaserve `schema_version` 7 `ordering` / `ordering_of` / `orderings`) are
collapsed **server-side** into one rail per family, with the other orders as
additive alternates, so a shipped player that ignores them still sees one rail in
the primary order; the current player adds a per-family order toggle that its
"previous books" list follows (see
[Reading-order families](../server/api/reference.md#reading-order-families)).

The player-redesign bundle (Phase 1a) adds, all additive: `work.community_description`
(the CC BY-SA description, apart from the CC0 `description`), `work.attribution`
(present iff the work carries CC BY-SA content; **the server writes the legal
text** and a client must render it beside that content, never compose it),
`recording.chapter_count`, and `local` `{library_id, path}` on each rail entry the
caller owns (main view and orderings). `local` is resolved **per request, after
the shared cache, on a copy**, and never stored in it. `?include=previous` adds
`previous[]` (the main view's earlier works, nearest first, at most 5) and
`?spoilers=hide` gates the envelope by the caller's saved server progress, both
behind the `meta_bundle` capability; spoiler gating still **stays on the device
by default** (the player gates against its live position and does not send the
param). A failure placing the caller's books sends the envelope without `local`
rather than failing it. `GET /libraries/{id}/next` answers from the community rail
only when it places the next work on one of the caller's books (possibly in
another library); otherwise the local series, then the folder, then none answer,
with an unplaced community next work riding along as `work` without `local`.
Answers are also kept in a persistent `meta_cache` table (no config key, follows
`metadata.enabled`, community data only; the newest 20,000 rows, works fetched by
id at most 2,000 of them) so a restart is warm and an outage serves the last known
answer. See
[`/meta`](../server/api/reference.md#get-apiv1librariesidmeta) and
[Configuration](../server/configuration.md#the-persistent-cache).

**A change requires:** because the server consumes `metaserve`'s response shapes,
a change to those shapes ripples audiosilo-meta -> the server's `internal/meta` ->
the player (only if the server's outward `/meta` envelope changes). Keep it
additive, same as every other seam here.

## The wire-change checklist

Every change to the wire format follows the same shape (the worked example in
CROSS-REPO.md is the listening-history feature):

1. **Server**: add/modify the handler in `internal/api/handlers_*.go`; wire the
   route in `internal/api/api.go`; keep business logic in
   `auth`/`catalog`/`library`/`media` (the `api` package is transport-only).
2. **Server test**: `internal/api/*_test.go` (security-critical paths need both an
   allowed and a denied test).
3. **Frontend types**: mirror the shape in `src/api/types.ts`.
4. **Frontend client**: add/extend the method in `src/api/client.ts`.
5. **Frontend hooks**: expose it via `src/api/hooks.ts`; consume it in a screen.
6. **Frontend test**: `src/api/client.test.ts`.
7. **Manager**, if it reads the changed shape: update `internal/serverapi` + its
   tests.
8. **Update `~/dev/audiosilo/CROSS-REPO.md`** - the seam catalog must describe the
   new reality (ideally edited first, as the design step).
9. Run **each touched repo's full gate** ([gates and CI](../contributing/gates-and-ci.md))
   and land the PRs as a mentioned pair.

The step-by-step contributor walkthrough is
[cross-repo changes](../contributing/cross-repo-changes.md).
