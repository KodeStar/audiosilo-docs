---
title: Cross-repo contract
description: "Every seam where changing one AudioSilo repo forces a change in another — a readable digest of the workspace CROSS-REPO.md."
---

The server defines the JSON/HTTP contract; the frontend and the manager mirror it
**by hand** (no codegen). This page is a tour of every seam — every place where a
change in one repo forces a change (or a deliberate decision) in another.

:::info This page is the tour, not the source
The **normative** contract is `~/dev/audiosilo/CROSS-REPO.md` in the workspace
root. When a seam changes, **update CROSS-REPO.md first**, in the same logical
change as the code — then bring this page in line. If this page and CROSS-REPO.md
ever disagree, CROSS-REPO.md wins.
:::

Canonical reference points on each side of the main seam:

- Server route table: `internal/api/api.go`
- Frontend client (mirrors it 1:1): `src/api/client.ts`
- Frontend wire types: `src/api/types.ts`
- Manager's mirrored subset: `internal/serverapi` (in audiosilo-manager)

## 1. Path is the identity — `(library_id, rel_path)`

**What couples:** the deepest shared invariant — content is addressed by
`(library_id, rel_path)` with the path in a `?path=` query param, never by DB id
(see [Invariants §1](invariants.md#1-path-is-the-identity)).

**Server:** `catalog.GetBookByPath` resolves `(library, path)` → book (indexing
on demand); `library.SafeJoin` guards every user-derived filesystem access;
durable user state is path-keyed with no FK to `books`.
**Frontend:** every content call in `src/api/client.ts` passes `?path=`; helpers
in `src/lib/paths.ts`; client state persists keyed by `(library_id, path)`.

**A change requires:** touching path semantics (normalization, casing, what a
"book path" vs a "file path" means) means changing both sides at once, **plus**
the move-tracking fingerprint logic — and re-checking seam 6 (a track URL must
stay a real file path).

## 2. JSON envelopes (hand-mirrored, no codegen)

**What couples:** every response shape. Auth returns `{ token, user }`; `/me`
returns the user directly; lists are wrapped (`{ libraries }`,
`{ books, next_cursor }`, `{ progress }`, `{ bookmarks }`, `{ notes }`,
`{ history }`, `{ favourites }`); chapters return `{ chapters, files, duration }`;
errors are `{ error }`. The `user` object carries `has_password`/`has_recovery`,
which drive the frontend's sign-out warning.

**Server:** `internal/api/handlers_*.go` define the JSON.
**Frontend:** `src/api/types.ts` re-declares the shapes; `src/api/client.ts`
unwraps the envelopes (errors become `ApiError(status, error)`); `src/api/hooks.ts`
exposes React Query hooks.

**A change requires:** the full [wire-change checklist](#the-wire-change-checklist)
— a field rename is a two-repo edit (three, if the manager reads that shape).

## 3. Media auth rides in the URL — `?token=`

**What couples:** browsers can't set an `Authorization` header on
`<img>`/`<audio>`, so cover and stream GETs accept the session token as a
`?token=` query param on every platform.

**Server:** `internal/api/middleware.go` — only cover + stream routes use
`requireMediaAuth`, which calls `bearerToken(r, true)`; all other routes are
header-only (`bearerToken(r, false)`), so tokens never ride the query string where
they could leak into access logs or Referer headers.
**Frontend:** `client.ts` `mediaTokenQuery()` → `coverUrl()`/`streamUrl()`. Native
also sends the header (belt-and-braces); web relies solely on the query param.

**A change requires:** do **not** "tighten" the server to reject query-param
tokens on media routes without first removing the web player's dependency on
them — the web player cannot authenticate media any other way.

## 4. Audio `Content-Type` must be real (byte-sniffed)

**What couples:** iOS AVPlayer rejects audio served as `application/octet-stream`
under `nosniff` (error `-12847`), so the served MIME type must be genuinely
correct.

**Server:** `internal/media/media.go` `ServeFile` sniffs magic bytes — `ftyp` →
`audio/mp4`, ID3/MPEG-sync → `audio/mpeg`, ADTS → `audio/aac`, plus
`fLaC`/`OggS`/`RIFF`/`WAVE` — falling back to the extension.
**Frontend:** assumes a correct `Content-Type`; there is deliberately no client
workaround.

**A change requires:** any change to how audio is served (new container support,
a proxy in front) must preserve true audio MIME types, validated on an iOS device.

## 5. Transcode negotiation — `direct_playable` + `?transcode=1`

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
`client.ts` `streamUrl(…, { transcode, t })` can request a transcoded stream.

:::caution Planned, not shipped
**Automatic web transcode negotiation is not yet wired**: the playback engines in
`src/playback/` do not read `direct_playable` to switch to the transcoded URL, and
seeking a non-byte-seekable stream needs more work. This is a tracked follow-up.
:::

**A change requires:** changing `direct_playable`'s meaning or the transcode query
params changes both sides — and auto-negotiation, when wired, must degrade
gracefully against a server with ffmpeg disabled (`transcode: false`).

## 6. The chapter / whole-book timeline model

**What couples:** the subtlest shared model — single-file m4b chapters and
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
book** — a folder path in a track URL is the MediaToolbox `-12864` bug class
(see [Invariants §3](invariants.md#3-stream-the-file-never-the-book)).

## 7. Pairing / connect deep links

**What couples:** the auth-code → session handshake, spanning both repos and two
URL carriers.

**Server:** `internal/api/qr.go` `buildPairing` emits `web_url`
(`<base>/web/connect?token=…`, encoded in the QR — opens the app via
Universal/App Links on claimed domains, else the web player) and `uri`
(`audiosilo://connect?server=<base>&token=<pairing_token>`, custom scheme). Flow:
`POST /auth/redeem` (code → pairing payload) → `POST /auth/exchange` (pairing
token → device-scoped session).
**Frontend:** the `audiosilo` scheme in `app.json`; the connect/pairing parser and
the `/web/connect` route consume both carriers; `client.ts`
`redeemCode()`/`exchange()`.

**A change requires:** the scheme, the query keys (`server`, `token`), and the
`/web/connect` route path are a contract — change the server emitter, the parser,
and `app.json` together, or pairing breaks.

## 8. Capability flags — `GET /api/v1/server`

**What couples:** feature negotiation, so any app build can talk to any server
version.

**Server:** `handleServerInfo` advertises `admin_ui`, `web_player`, `upload`,
`transcode`, `websocket`, plus the server version (`api.Version`, stamped from the
release tag via ldflags). `transcode` reflects ffmpeg availability; `web_player`
reflects whether `/web` is populated. (`upload` and `websocket` are reserved for
**planned** phases — `POST /uploads` and WebSocket sync are not shipped.)
**Frontend:** the `ServerInfo` type; feature gating and the "connected server
version" display key off it.

**A change requires:** adding a capability is a two-repo change — flip the flag as
the feature lands server-side, and gate the new UI on it client-side. Never assume
a capability is present.

## 9. The web player is served *by* the server at `/web`

**What couples:** the frontend's web build is not vendored in the server repo —
the server serves it at runtime from `web_dir` (Docker bakes a pinned build in;
native binaries embed one via `-tags embedplayer`).

**Frontend:** `app.json` `experiments.baseUrl: "/web"` — the export must be built
with `baseUrl=/web` so asset URLs resolve under the subpath; `web.output: "static"`.
**Server:** `internal/web/web.go` serves `web_dir` at `/web` with an SPA fallback
to `index.html`, 404s for missing assets, and a per-response scoped CSP that
hashes each document's inline scripts.

**A change requires:** watch the CSP coupling — the hash is computed per document
at serve time, so it usually tracks automatically, but a change in how Expo
inlines bootstrap scripts can break strict CSP. Compatibility is otherwise "by
construction": the server image pins a specific web build.

## 10. Demo mode — `demo.audiosilo.app`

**What couples:** the public throwaway-account demo flow.

**Server:** `config.demo.*` (enabled/library/max_users/idle_ttl);
`POST /demo/session` mints a reaped throwaway account (migration
`0005_user_is_demo`); in demo mode the site root `/` redirects to
`const webDemoPath = "/web/demo"` in `api.go` — explicitly the single point of
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
**Server:** `Dockerfile` does `COPY --from=${WEB_IMAGE}`;
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

**A change requires:** nothing structural — just remember self-signed TLS (the
server default) needs trusting in the browser, or use `AUDIOSILO_TLS_MODE=off`
for plain-HTTP local dev.

## 13. The manager ↔ server seam

**What couples:** `audiosilo-manager` is the write/management side, but its
*network* relationship with the server is read-only for content — all file writes
happen client-side (SFTP or a local/mounted copy).

**What the manager consumes** (via its `internal/serverapi`):

- pairing/auth: `POST /auth/redeem` → `POST /auth/exchange` (session token stored
  in the OS keychain, never the registry file);
- `GET /server`, `GET /admin/libraries`, `GET /libraries/{id}/fs`,
  `GET /libraries/{id}/books` + `GET /search` (series-sibling detection,
  existence-by-ASIN), `GET /libraries/{id}/item`;
- `GET /me/progress` + `PUT /libraries/{id}/progress` (the same write the player
  makes) for stats sync;
- `POST /admin/libraries/{id}/scan` — a non-destructive reindex after placement;
- its **one enrichment write**: `PUT /admin/libraries/{id}/enrichment?path=`
  (`{asin, isbn}`) — a durable, path-keyed `book_enrichment` row, re-applied by
  the scanner via `catalog.ApplyEnrichments`; it modifies no file.

**Shared code, not just shared wire:** the fuzzy book matcher lives in the
server's public `pkg/match` (`Best`, `CleanTitle`, `SeqFromTitle`) and the manager
imports it. The "create a local server" flow runs the server **in-process** via
the server's public `pkg/launcher` (`Run`/`Options`). The manager depends on the
server module via a local `replace ../audiosilo-server`, so CI checks out both
repos as siblings.

**A change requires:** the manager hand-mirrors the server shapes it reads, same
rule as the frontend — a wire change to any endpoint above touches the server
handler **and** `serverapi`, with tests on both. Changes to `pkg/match` or
`pkg/launcher` are public-API changes consumed by another repo: build the manager
against them before calling it done. See
[manager server integration](../manager/server-integration.md).

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
8. **Update `~/dev/audiosilo/CROSS-REPO.md`** — the seam catalog must describe the
   new reality (ideally edited first, as the design step).
9. Run **each touched repo's full gate** ([gates and CI](../contributing/gates-and-ci.md))
   and land the PRs as a mentioned pair.

The step-by-step contributor walkthrough is
[cross-repo changes](../contributing/cross-repo-changes.md).
