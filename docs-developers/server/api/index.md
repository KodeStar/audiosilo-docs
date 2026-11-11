---
title: API conventions
description: "Base path, authentication, error envelope, path-addressed content, pagination, capability flags, rate limiting and CORS: the rules every endpoint follows."
---

Everything a client needs to know before calling any endpoint. The normative
source is the route table in `internal/api/api.go` and the handlers in
`internal/api/handlers_*.go`. The complete endpoint list is in the
[API reference](reference.md).

## Base path and versioning

All JSON API routes live under **`/api/v1`**. The server advertises the version
in [`GET /api/v1/server`](reference.md#get-apiv1server) as `"api": "v1"`. There
is no other versioning mechanism: no version headers and no v2.

A few routes deliberately live *outside* the prefix:

| Route | Why |
|---|---|
| `GET /healthz` (also served at `GET /api/v1/healthz`) | container and orchestrator healthchecks expect a root-level probe |
| `GET /setup`, `POST /setup` | the first-run setup page is a browser page, not an API surface, and it is off unless the launcher enables it. The console's first-run flow uses `/api/v1/admin/setup` |
| `GET /.well-known/apple-app-site-association`, `GET /.well-known/assetlinks.json` | iOS and Android mandate the well-known location |
| `/`, `/connect`, `/admin`, `/assets/…`, `/web/…` | the admin console, the connect page and the web player. They are static pages over the API, not part of it (see [Web UI](../web-ui.md)) |

## Requests

- Bodies are JSON. `decodeJSON` (in `internal/api/respond.go`) caps every
  control-plane body at **1 MiB** and decodes with `DisallowUnknownFields`. A
  body containing a field the server doesn't know is a **400**, not silently
  ignored. The one exception is `POST /demo/session`, which tolerates an empty
  or loose body. Keep client payloads exactly in sync with the documented shapes.
- Path parameters like the library `id` must be integers. Anything else is a 400.
- Timestamps on the wire are RFC 3339 strings (e.g. `2026-07-01T19:42:07Z`).

:::caution[Empty lists can be `null`]
List-valued response fields are Go slices. When a result is empty, the field
serializes as JSON `null`, not `[]` (e.g. `{"books": null}`). Treat `null` and
`[]` as equivalent.
:::

## Response compression

The server gzips JSON answers to `GET` requests under `/api/v1/`
(`gzip.BestSpeed`, `api/compress.go`, server v2.5.1) for a client that sends
`Accept-Encoding: gzip`. A 200-book page is about 71 KB of JSON and about 10 KB
gzipped.

- The JSON shape is unchanged, and nothing needs opting in. Browsers, the apps'
  `fetch` and Go's `http.Transport` (the Bridge) all send the header and decode
  the answer themselves.
- A client that sends no `Accept-Encoding`, or one without gzip, gets the plain
  bytes as before.

An answer is compressed only when both the request and the answer qualify.

**The request** is a `GET` under `/api/v1/` without a `Range` header, and it is
not in one of the excluded classes:

- the media: a cover, a stream, an ebook, a community cover (`/meta/cover`) and
  a backup's download;
- everything under `/api/v1/auth/`;
- everything under `/api/v1/bridge/`: the Bridge's long-poll claim, and job
  parameters that can carry a private feed URL.

A `HEAD` of such a `GET` follows the same rule (from 2.5.1). It sends no body,
but it carries the same `Vary: Accept-Encoding` as its `GET`, and the same
`Content-Encoding: gzip` when the `GET` would be gzipped. A cache that learns
from a `HEAD` therefore stores the right variant. A `POST` or any other method
is never compressed.

**The answer** is `application/json`, at least **1 KiB**, and has a body (not
`204` or `304`). Its handler has set no `Content-Encoding` or `ETag` of its own.
A handler with a validator, such as
[`GET /libraries/{id}/readalong`](reference.md#get-apiv1librariesidreadalong),
compresses its own representation. Smaller answers go out as they are.

Every JSON answer to a compressible request, `HEAD` included, carries
`Vary: Accept-Encoding`, compressed or not. A cache in between therefore never
hands one client's encoding to another. A
[list answer cache](../overview.md#the-list-answer-cache) hit sends a gzip made
when the answer was stored.

**Why the exclusions.** Compressing a secret beside text an attacker can
influence leaks the secret through the compressed size (BREACH). Every
credential the API hands out is minted by a `POST`: sign-in, pairing, API keys,
cast tokens, member sessions, auth codes, Bridge pairing and recovery codes.
`/api/v1/auth/` is also excluded whole, so no compressed body holds a
credential. Media keeps its exact bytes for `Range` and seeking.

:::note[Adding a route]
A new `GET` that returns a credential, or a long poll or stream, joins
`compressExcluded` in `api/compress.go` (path prefixes), with a test that it
stays identity. Anything else is compressed by default.
:::

A reverse proxy needs no compression rule for the API, because the server
compresses. A proxy that compresses again is harmless, since it sees the
answer's `Content-Encoding` and passes it through.

## Authentication

Every route requires a **session bearer token**, except the public set:
`/server`, `/healthz`, `/auth/redeem`, `/auth/exchange`, `/auth/login`,
`/demo/session`, `/bridge/pair`, `/setup`, the well-known files and the static UI.

```
Authorization: Bearer <session token>
```

Admin routes (`/api/v1/admin/*`) also require the `admin` role, and answer 403
otherwise. Tokens are opaque secrets. The server stores them only as SHA-256
hashes.

Sessions have **no expiry**. They end only when something revokes them:

- `POST /auth/logout`;
- an admin signing out one device (`DELETE /admin/devices/{id}`) or all of them
  (`POST /admin/users/{id}/sign-out`);
- disabling or deleting the account;
- a password change or reset, which keeps only the caller's session (see
  [Password changes end sessions](../auth-and-security.md#password-changes-end-sessions)).

Every authenticated request bumps the token's `last_seen`, which is what
surfaces as a user's "last activity". The request also records its address
(`last_ip`) on the token, and its app when it names one (see
[Client identification](#client-identification-x-audiosilo-client)).

### Getting a session token

There are four ways to obtain a session token:

1. **Auth-code pairing** (the primary flow). `POST /auth/redeem` with an invite
   or recovery code returns a *pairing payload*, without consuming a use. The
   payload is a pairing token plus its QR and deep-link carriers.
   `POST /auth/exchange` trades the pairing token for a durable session token
   (`{ token, user }`) and claims one invite use per device that pairs. An
   invite-derived pairing token stays valid for as long as the invite has uses
   left, so one QR can pair several devices. A recovery-derived one lasts 10
   minutes.
2. **Password login**. `POST /auth/login` with `username` and `password` returns
   `{ token, user }` directly. Passwords are optional for non-admin accounts, so
   this only works for accounts that have one.
3. **Demo session**. `POST /demo/session` mints a throwaway account and returns
   a session token immediately. It works only when demo mode is enabled.
4. **A household member's session, made by their owner** (capability
   `household_members`). `POST /me/household/members` with `sign_in_here`, or
   `POST /me/household/members/{id}/session`, returns the member's session
   envelope, signed in on the owner's device (see
   [Household members](reference.md#household-members)).

An already-authenticated client can mint a fresh pairing payload for another
device with `POST /auth/pair`. That token is single-use with a 10-minute TTL,
since the user is present and can mint another. An owner mints one for a
member's own device the same way, with `POST /me/household/members/{id}/pair`.
See [Auth & security](../auth-and-security.md) for the trust model behind
codes, tokens and hashes.

### Personal API keys

A user can also mint a **personal API key** (`POST /auth/tokens`). It is a
non-expiring bearer credential for headless integrations such as dashboards and
cron.

- A client presents it in the same `Authorization: Bearer …` header, and it
  authenticates exactly like a session token, **acting as its owner**. An
  admin's key satisfies the admin-role check, and a regular user's does not.
- Pairing tokens are never accepted as a bearer credential, and an API key is
  never valid for `/auth/exchange`.
- An API key **cannot mint a fresh durable credential**. The server refuses an
  API-key caller (403) on the credential-minting routes: create key, recovery,
  pair, set password, cast token, the calendar link and every household member
  route. Revoking a leaked key therefore cuts off everything it could reach.

See [Personal API keys](reference.md#personal-api-keys) in the API reference.

### The Bridge's token

The paired **Bridge** (capability `bridge`) holds a credential of its own, a
token of kind `bridge` from
[`POST /bridge/pair`](reference.md#post-apiv1bridgepair). It is the narrowest
credential the server has. The server accepts it:

- **only** on the Bridge's own routes (`/api/v1/bridge/*`, except the public
  pairing exchange);
- only in the `Authorization` header;
- only while the admin who paired it is still an enabled admin.

Every other route refuses it (`401`), and the Bridge's routes refuse every
other credential. On those routes a failure to check the token is a `503`, not
a `401`, since a `401` tells the Bridge its token is refused. Its calls don't
bump `last_seen`. See [The Bridge](reference.md#the-bridge).

### Calendar feed tokens

A listener's **calendar feed** (capability `upcoming_calendar`) is a token of
kind `feed`, made by
[`POST /me/upcoming/calendar`](reference.md#post-apiv1meupcomingcalendar). Only a
session can make one, and a user has one at most.

- The server accepts it **only** on
  [`GET /me/upcoming/releases.ics`](reference.md#get-apiv1meupcomingreleasesics),
  as the header or as `?token=`. A calendar app reads a subscription by its URL
  alone.
- That route takes no other kind. A feed token is `401` everywhere else, and a
  session or API key is `401` there.
- Its polls don't bump `last_seen`, and it is never a device.

See [Calendar feed tokens](../auth-and-security.md#calendar-feed-tokens).

### Media requests: `?token=` for media GETs and the calendar feed only {/* #media-requests-token---media-gets-and-the-calendar-feed-only */}

Browser `<img>` and `<audio>` elements cannot set an `Authorization` header. So
four media routes accept the session token **either** as the bearer header
**or** as a `?token=` query parameter:

- `GET /libraries/{id}/cover`;
- `GET /libraries/{id}/stream`;
- `GET /libraries/{id}/meta/cover`, a community cover (`meta_covers`);
- `GET /me/upcoming/cover`, an upcoming release's cover (`upcoming_covers`).

The query fallback is deliberately confined to these four routes and the
calendar feed, whose `?token=` is a **feed** token, never a session token. A
token in a query string can leak into access logs and `Referer` headers, so no
other route accepts it. Native clients should keep using the header even for
media. The guards are all `mediaAuth` in `internal/api/middleware.go`:
`requireBookMediaAuth` for cover and stream, `requireMediaAuth` for the two
community covers and `requireFeedAuth` for the feed.

A book's **ebook** ([`GET /libraries/{id}/ebook`](reference.md#get-apiv1librariesidebook),
capability `ebooks`) is deliberately not one of them. It takes the header only,
and has no URL token of any kind. Its only reader is the player, which can set
the header and hands the bytes to its reader document itself. The same holds
for a book's read-along map
([`GET /libraries/{id}/readalong`](reference.md#get-apiv1librariesidreadalong),
capability `readalong`).

A book's cover and stream also accept a **cast token** (capability `cast`) as
the `?token=`. A player mints it for the Chromecast receiver, so the receiver
never sees the session token. See
[Cast tokens as media auth](reference.md#cast-tokens-as-media-auth).

### Client identification: `X-AudioSilo-Client`

A client names itself on each request with an optional header:

```
X-AudioSilo-Client: AudioSilo/1.4.2 (ios)
```

The form is `<app>/<version> (<platform>)`. The version and the platform are
optional. The admin console sends `AudioSilo Admin (web)`, since it ships
inside the server. `auth.ParseClient` parses the header strictly:

- an app name of up to 40 plain characters;
- a version of up to 32;
- a platform of up to 24, lower-cased.

The server ignores a malformed or empty value, as if it were absent. It is
never an error.

The server keeps the newest value **per token** (app, version and platform)
for the admin console's [devices and sessions](reference.md#admin-activity),
plus the address of the token's newest request. It overwrites both and keeps no
history. The daily retention job blanks a signed-out token's address.

A request **without** the header keeps the stored app. Media fetches by a
browser's `<img>` or `<audio>` can't set headers, so they don't erase it. A
token whose client never sent the header (players released before it) reads as
an unknown app (`client: null`).

Who sends it:

- **The player.** It always sends it on native. On the web it sends it only when
  the API is **same-origin** with the page. A custom header makes a
  cross-origin request non-simple, so the browser sends a CORS preflight, and
  servers released before the header don't allow it (see [CORS](#cors)). The
  embedded `/web` player is same-origin, so it identifies itself with the
  version of the web build the server bakes in (`AudioSilo/2.2.0 (web)`). A
  development build opts in cross-origin with
  `EXPO_PUBLIC_IDENTIFY_CROSS_ORIGIN=1`.
- **The admin console.** It always sends it, since it is same-origin.
- **A watch app.** The Apple Watch app sends
  `audiosilo-watch/<version> (watchos)` ([Apple Watch](../../frontend/apple-watch.md)),
  and a Wear OS app, when there is one, sends `(wearos)`. It parses like any
  other client. The console's devices, sessions and Activity name it "Apple
  Watch" or "Wear OS" with a watch icon, and the player's My devices names it
  the same way.
- Anything else may send it. Nothing requires it.

The header also decides whether a client sees podcast libraries at all:

- The console, `AudioSilo/dev` and players from **2.2.0** see them.
- Older players, watch apps (the watch has no podcasts) and anything
  unidentified do not.

See [Podcast visibility](../auth-and-security.md#podcast-visibility).

## Error envelope and status conventions

Every error is a JSON object with an `error` message:

```json
{ "error": "no access to this path" }
```

Failures a person can fix also carry a machine-readable **`code`** next to
`error`. The field is additive, so a client that predates it reads only `error`:

```json
{ "error": "username already taken", "code": "username_taken" }
```

| `code` | Status | When |
|---|---|---|
| `username_taken` | `409` | creating an account with a username that exists (`POST /admin/users`) |
| `name_taken` | `409` | a library or share name already in use (create, rename) |
| `library_grant` | `409` | `POST`/`DELETE /admin/shares/{id}/paths` on a whole-library grant: its rules change only by granting or revoking the library |
| `config_library` | `409` | a library the server's config declares: renaming it or moving its folder (`PATCH /admin/libraries/{id}`, from 2.4.0), or deleting it (`DELETE /admin/libraries/{id}`, from 2.4.1) |
| `last_admin` | `409` | demoting or disabling the last enabled admin |
| `admin_needs_password` | `400` | an admin without a password (creating one, promoting a password-less account, or clearing an admin's password) |
| `password_too_short` | `400` | a password under the minimum length |
| `cannot_delete_self` | `400` | an admin deleting their own account |
| `path_not_absolute` | `400` | `GET /admin/fs/dirs` or `POST /admin/setup/preview` with a relative path |
| `folder_unreadable` | `404` | `GET /admin/fs/dirs` or `POST /admin/setup/preview` on a missing or unreadable folder |
| `invalid_setup_step` | `400` | `PUT /admin/setup` naming a step id the flow doesn't have, or an outcome other than `done` / `skipped` |
| `book_not_found` | `404` | the Bridge's `PUT /bridge/libraries/{id}/enrichment` for no book of a books library at the path; an admin catalog call on a path that is not an indexed book (book page, edit, bulk edit, match, cover upload, community cover); an admin progress edit on a path with no progress and no indexed book; `POST /admin/bridge/jobs` and `GET /admin/bridge/estimate` on a path that is not an indexed book |
| `invalid_override` | `400` | a metadata edit the server refuses; the body also carries a `field` key naming the offending field (`PATCH /admin/libraries/{id}/book`, `POST /admin/books/bulk`) |
| `module_off` | `404` | any route a [managed module](../modules.md) mounts, while that module is off (Settings > Modules), for a caller the route's auth check admits (it runs first). The route exists either way, so turning the module on needs no restart. The `podcasts` module mounts `POST`/`DELETE /podcasts/follow`, `POST /podcasts/check`, the `/podcasts/discovery/*` routes and `POST /podcasts/opml/import`. Also `POST /admin/bridge/jobs` for a job the module owns (`sidecars.contribute`, `meta.correct`, `sidecars.generate` with `contribute: "issue"`, the `contributions` module), checked before anything else about the job |
| `metadata_off` | `404` | a community match search, a `POST /admin/books/works` work-id batch, a community cover (`POST /admin/meta/covers`, `PUT /admin/libraries/{id}/cover/community`), or the metadata mirror (`GET /admin/meta/mirror`, `POST /admin/meta/mirror/check`) while community metadata is turned off; also [`GET /me/upcoming`](reference.md#get-apiv1meupcoming), [`GET`](reference.md#get-apiv1meupcomingcalendar)/[`POST /me/upcoming/calendar`](reference.md#post-apiv1meupcomingcalendar), [`/me/upcoming/releases.ics`](reference.md#get-apiv1meupcomingreleasesics) and [`/me/upcoming/cover`](reference.md#get-apiv1meupcomingcover) (checked after `kid_account` and, on the mint, the `demo_account` and API-key refusals; before `upcoming_off`). Never `DELETE /me/upcoming/calendar` |
| `upcoming_off` | `404` | the same upcoming routes as `metadata_off` while community metadata is on but the upcoming releases job is switched off (`upcoming.enabled`, the console's Settings > Metadata) |
| `too_large` | `400` / `413` | a bulk edit or an issue ignore over 1000 books, a cover batch over 60, a community cover batch over 12, or a work-id batch over 100 (`400`); a custom cover upload over 5 MiB, or a community cover over 16 MiB or 40 megapixels (`413`); a [listening sync](reference.md#post-apiv1melisteningsync) body over 1 MiB (`413`) |
| `unsupported_image` | `415` | a custom cover (uploaded or community) that is not a JPEG, PNG or WebP image |
| `cover_unavailable` | `502` | `PUT /admin/libraries/{id}/cover/community`, `GET /libraries/{id}/meta/cover` or [`GET /me/upcoming/cover`](reference.md#get-apiv1meupcomingcover) when the server couldn't fetch the image (the latter two also for a minute after a failed fetch, without asking again) |
| `not_found` | `404` | an [unknown API route](#error-envelope-and-status-conventions) (below), `DELETE /admin/libraries/{id}` for a library that doesn't exist, and [`GET /me/upcoming/cover`](reference.md#get-apiv1meupcomingcover) for a work the caller's upcoming list doesn't hand out a cover for (not listed for them, or listed without one) |
| `invalid_schedule` | `400` | a library `scan_schedule` that isn't `""`, `every:<N>h` (1, 3, 6, 12, 24) or `daily:HH:MM` (`POST`/`PATCH /admin/libraries`) |
| `invalid_pattern` | `400` | a library `ignore_patterns` list the server refuses: more than 100 patterns, one over 200 bytes, one that matches nothing, or a malformed wildcard; the message names the line (`POST`/`PATCH /admin/libraries`, `POST /admin/setup/preview`) |
| `invalid_metadata_source` | `400` | a library `metadata_source` other than `"tags"` or `"path"` (`POST`/`PATCH /admin/libraries`) |
| `not_indexable` | `404` | `POST /admin/libraries/{id}/book/rescan` on a path with no book any more (gone, not a book, or skipped by the library's ignore rules); the Bridge's `POST /bridge/rescan` on a path with nothing indexable (with `mode: "attachments"`, no indexed book there) |
| `current_device` | `409` | `DELETE /admin/devices/{id}` on the token making the request (sign out instead) |
| `no_access` | `409` | `PATCH /admin/libraries/{id}/progress` that would start progress on a book the person can't see (their own access, not the admin's) |
| `invalid_range` | `400` | `GET /admin/stats?range=` or `GET /admin/listening?range=` with a range that isn't `7d`, `30d`, `90d`, `1y` or a year |
| `invalid_setting` | `400` | `PATCH /admin/settings` with a value the server refuses (including a `demo.library` that names no library, and turning `metadata.enabled` on when no metadata service is configured); the body also carries `field`, the setting's id (`network.bind`) |
| `unknown_setting` | `400` | `PATCH /admin/settings` naming something that isn't a setting (`field` names it) |
| `setting_read_only` | `400` | `PATCH /admin/settings` changing a setting shown but not changeable there (`players.web_dir`, `backups.dir`; `field` names it) |
| `setting_locked` | `409` | `PATCH /admin/settings` changing a setting an `AUDIOSILO_*` variable sets (`field` names it) |
| `update_check_off` | `409` | `POST /admin/update/check` while the update check is turned off |
| `not_mirror_mode` | `409` | `GET /admin/meta/mirror` or `POST /admin/meta/mirror/check` on a server that isn't keeping a local copy of the community metadata (remote mode, or `metadata.mode: mirror` saved but not restarted into) |
| `backup_running` | `409` | `POST /admin/backups` while a backup is being made |
| `backup_not_found` | `404` | a backup name that isn't in the backups folder (download, delete, restore) |
| `invalid_backup` | `400` | `POST /admin/backups/{name}/restore` on a file that is damaged or isn't an AudioSilo database |
| `backup_too_new` | `400` | `POST /admin/backups/{name}/restore` on a backup made by a newer server |
| `invalid_target` | `400` | a notification destination the server refuses (`POST`/`PATCH /admin/notifications`); `field` names the field (`kind`, `name`, `url`, `secret`, `events`) |
| `too_many_targets` | `409` | `POST /admin/notifications` when the server has 20 destinations |
| `demo_account` | `403` | a demo account on a route it can't use: the self-service routes (password, recovery code, API keys), sharing a collection, `GET /me/share-targets`, `PUT /me/household`, every `/me/household/members` route but the list, [`POST /me/upcoming/calendar`](reference.md#post-apiv1meupcomingcalendar) (before the API-key refusal), and every user route a managed module mounts |
| `kid_account` | `403` | a kid household member on `POST /auth/password`, `POST /auth/tokens`, `POST /auth/pair`, `POST /auth/recovery`, `PUT /me/household`, `PUT /me/collections/{id}/shares`, `GET /me/upcoming`, every `/me/upcoming/*` route (the calendar's three, the feed and the cover) or a user route a managed module mounts (where it is enforced: [Kids](../auth-and-security.md#household-members)) |
| `kid_account` | `409` | the admin's `POST /admin/users/{id}/authcode` or `POST /admin/authcodes/{id}/rotate` for a kid household member's account (a kid holds no invite; only their owner sets up their devices) |
| `member_cannot_manage` | `403` | a household member on every `/me/household/members` route but the list (which answers a member `200`, `allowed: false`, `reason: "member"`) |
| `feature_off` | `403` | adding a household member while `household.members_enabled` is off |
| `not_allowed` | `403` | adding a household member while the admin turned off the caller's `can_add_members` |
| `member_limit` | `409` | adding a household member at `household.max_members` |
| `member_disabled` | `409` | `POST /me/household/members/{id}/session` or `.../pair` for a member whose account the admin disabled (no token of theirs would work, so none is made) |
| `invalid_name` | `400` | a household member's name that is empty, over 40 characters, or holds control characters |
| `invalid_collections` | `400` | a member's `collection_ids` naming a collection that isn't the caller's own |
| `member_not_admin` | `409` | `PATCH /admin/users/{id}` making a household member an admin, or assigning an admin as a member |
| `member_fields_required` | `400` | `PATCH /admin/users/{id}` with a `managed_by` id but not both `member_kind` and `member_access`, or either of those without it |
| `owner_is_member` | `409` | `PATCH /admin/users/{id}` assigning to an owner who is a household member |
| `owner_is_demo` | `409` | `PATCH /admin/users/{id}` assigning to a demo account |
| `member_is_demo` | `409` | `PATCH /admin/users/{id}` assigning a demo account as someone's member |
| `kid_no_password` | `400` | `PATCH /admin/users/{id}` with a non-empty `password` when the request leaves the account a kid (a kid with no household change in it, or an assign as a kid; `""`, clearing, is fine). `POST /auth/password` racing the owner's switch to kid answers `403 kid_account` instead |
| `self_managed` | `409` | `PATCH /admin/users/{id}` assigning a person to themselves |
| `has_members` | `409` | `PATCH /admin/users/{id}` assigning a person who has household members of their own |
| `invalid_keep_members` | `400` | `DELETE /admin/users/{id}?keep_members=` with an entry that isn't one of that person's members |
| `kind_unavailable` | `409` | `POST /admin/bridge/jobs` (or `GET /admin/bridge/estimate`) for a kind the paired Bridge doesn't run, or before any Bridge has reported |
| `library_not_writable` | `409` | podcast follow/check, or `POST /admin/bridge/jobs` for a kind that writes (`sidecars.generate`, `sidecars.describe`, `chapters.detect`, `readalong.align`) in a library the Bridge's last heartbeat doesn't report mapped and writable |
| `cannot_contribute` | `409` | `POST /admin/bridge/jobs` for `sidecars.generate` with `contribute: "issue"`, `sidecars.contribute` or `meta.correct` while the Bridge's last heartbeat doesn't say it can contribute (its `setup.can_contribute`, else `estimates.sidecars.can_contribute`) |
| `generate_open` | `409` | `POST /admin/bridge/jobs` for `sidecars.describe`, `chapters.detect`, `sidecars.contribute` or `readalong.align` while a `sidecars.generate` job is open for the book (it writes the description, finds a chapterless book's chapters, and replaces the characters and recaps a share would file, itself; a read-along waits because both transcribe the same audio) |
| `contribute_open` | `409` | `POST /admin/bridge/jobs` for `sidecars.generate` while a `sidecars.contribute` job is queued or working for the book (a parked one, or a queued one held while the `contributions` module is off, is cancelled instead) |
| `not_edited` | `400` | `POST /admin/bridge/jobs` for `meta.correct` with a change whose field isn't an edit made on this server, or whose corrected value isn't the book's value now; `field` names it |
| `detect_open` | `409` | `POST /admin/bridge/jobs` for `sidecars.generate` while a `chapters.detect` job is queued or working for the book (the generate job after it reuses its transcription), or for `sidecars.describe` or `readalong.align` while one is open |
| `readalong_open` | `409` | `POST /admin/bridge/jobs` for `sidecars.generate` while a `readalong.align` job is queued or working for the book (a parked one is cancelled instead), or for `chapters.detect` while one is open: all three transcribe the same audio on the Bridge |
| `no_ebook` | `409` | `POST /admin/bridge/jobs` for `readalong.align` for a book the index holds no ebook for |
| `no_readalong` | `404` | [`GET /libraries/{id}/readalong`](reference.md#get-apiv1librariesidreadalong) for a book with no read-along map (none, one that fails the server's checks, no ebook, a part's path, a podcast library) |
| `readalong_stale` | `409` | [`GET /libraries/{id}/readalong`](reference.md#get-apiv1librariesidreadalong) for a map made for another ebook or other audio, with `reason` `ebook_changed` or `audio_changed` |
| `describe_open` | `409` | `POST /admin/bridge/jobs` for `chapters.detect` while a `sidecars.describe` job is open for the book |
| `chapters_chosen` | `409` | `POST /admin/bridge/jobs` for `chapters.detect` for a book whose chapter source an admin chose (`files` or `community`): chapters found in the narration stand in only with no choice |
| `finished` | `409` | `POST /admin/bridge/jobs/{id}/cancel` on a job that already ended |
| `not_held` | `409` | the Bridge's `PATCH /bridge/jobs/{id}` from a claim that no longer holds the job (it ended, was cancelled, its lease ran out, or it no longer exists) |
| `no_heartbeat` | `409` | the Bridge's `GET /bridge/jobs/next` before its first heartbeat |
| `no_book` | `404` | the Bridge's `GET /bridge/libraries/{id}/book` with no indexed book at the path (or in the library) |
| `unknown_account` | `404` | an [Audible account](reference.md#audible-accounts) route naming an account id the Bridge couldn't have made, a titles call or Check now for an account the server doesn't have |
| `account_paused` | `409` | `POST /admin/audible/accounts/{account}/poll` (Check now), a backup or Back up everything for an account whose library was deleted, until the Bridge maps it again |
| `unknown_title` | `404` | an Audible title route (a backup, `PATCH /admin/audible/titles/{account}/{asin}`) naming no title of the account |
| `already_matched` / `import_open` / `not_available` | `409` | [`POST /admin/audible/titles/{account}/{asin}/backup`](reference.md#post-apiv1adminaudibletitlesaccountasinbackup): the title is on this server; its backup is waiting, running or pending; it is `unavailable` or `gone` |
| `invalid_dest_path` / `invalid_template` | `400` | a title's `dest_path` or an account's `template` the server refuses (the reason in `error`) |
| `unknown_user` | `404` | the Bridge's `PUT /bridge/audible/accounts/{account}` naming no user, or one an account may not be mapped to (a kid household member, a demo or a disabled account) |
| `unknown_library` | `404` | the Bridge's `PUT /bridge/audible/accounts/{account}` or `GET /bridge/libraries/{id}/books` naming no library |
| `not_books` | `400` | the same two routes naming a podcast library |
| `sync_off` | `403` | the Bridge's [Audible position sync](reference.md#audible-position-sync) routes (`POST /bridge/audible/accounts/{account}/listening`, `GET /bridge/progress`) while the `audible` module or the account's sync is off, or the account is paused |
| `user_unavailable` | `403` | the same two routes when the account's person was disabled, made a kid or a demo account since it was mapped |
| `invalid_policy` / `invalid_marketplace` | `400` | an Audible account's `policy` (not `all`, `series` or `manual`; the Bridge's PUT or the console's PATCH) or `marketplace` (not one of the metadata regions) |
| `asin_set` | `409` | the Bridge's `PUT /bridge/libraries/{id}/enrichment` for a book that has another ASIN, or an admin's ASIN edit |

### Codes by area

The codes below come from feature areas whose full rules live in the API
reference.

**Podcast actions** (full shapes and async feed failures:
[Podcasts](reference.md#podcasts)):

- `invalid_request` and `invalid_feed_url` (`400`).
- `no_library_access` (`403`).
- `show_not_found` (`404`).
- `not_podcast_library`, `bridge_unavailable`, `library_not_writable` and
  `privacy_conflict` (`409`). The server sends `privacy_conflict` when the
  caller has an open request for the feed with the other privacy.
- `too_many_requests` and `checked_recently` (`429`).
- Missing podcast media answers `503 podcast_fetching`,
  `podcast_fetch_unavailable` or `podcast_fetch_failed`, with a fetch Status and
  `Retry-After: 2`. Only a queued or fetching episode is worth repeating. A
  terminal failure needs an explicit Retry. A listener's Retry adds
  `409 fetch_limit`. See
  [Podcast fetch status and Retry](reference.md#podcast-fetch-status-and-retry).
- Admin storage adds `episode_not_found` (`404`) and `identity_changed` (`409`).
  Policy writes and new downloads use `module_off` (`404`) and the exact checks
  for the Bridge's kind and a writable mapping. A valid present pin returns 200
  before those storage checks.
- The retention reads that only the paired Bridge may make use the same
  identity code and `Cache-Control: no-store`. They never carry per-user
  listening data.

**Library kinds** add `invalid_kind` and `kind_immutable` (`400`), and
`root_overlaps` (`409`, also from `POST /admin/setup/preview`).

**[Podcast discovery](reference.md#podcast-discovery):**

- `invalid_query`, `invalid_provider`, `invalid_limit` and `invalid_country`
  (`400`).
- `discovery_off` and `artwork_not_found` (`404`).
- `provider_unavailable` (`409`).
- `discovery_rate_limited` and `provider_rate_limited` (`429`, with
  `Retry-After`).
- `provider_rejected`, `discovery_unavailable` and `artwork_unavailable`
  (`502`).
- `discovery_busy` (`503`, `Retry-After: 1`).
- `discovery_timeout` (`504`).

From 2.5.1 artwork has an admission of its own, sized for a results page. The
server then serves each of a page's images asked for at once, rather than
answering `503 discovery_busy` (see the limits in
[Podcast discovery](reference.md#podcast-discovery)).

**[OPML import and export](reference.md#opml-import-and-export):**

- `invalid_opml` (`400`).
- `library_not_found` (`404`): an import's `library_id` names no library.
- `opml_limit` and `opml_export_limit` (`413`).
- `unsupported_opml_type` (`415`).
- `opml_rate_limited` (`429`, with `Retry-After`).
- `opml_busy` (`503`, `Retry-After: 1`).

An import's per-row results carry their own codes in a `200`. `HEAD` on the new
GET routes is `405 method_not_allowed`.

**[Listening sync](reference.md#post-apiv1melisteningsync)** adds
`too_many_events` (`400`, a batch of more than 500 events) and uses `too_large`
(`413`, a body over 1 MiB). Each event's `status` and `reason` ride in a `200`,
never as the batch's error. The reasons are `older`, `resume_behind`, `invalid`,
`unknown_kind`, `too_old`, `duration_mismatch`, `no_access` and `not_found`.

**[Watch renditions](reference.md#watch-renditions):**

- `bad_rendition` (`400`): a kind other than `watch`, or a podcast library.
- `rendition_unavailable` (`404`): no ffmpeg or no data directory.
- `rendition_failed` (`422`, with `Retry-After` set to the seconds left).
  ffmpeg refused the file or its copy came out short. The server remembers the
  failure for an hour.
- `rendition_pending` (`503`, `Retry-After: 15`): still encoding.
- `rendition_error` (`503`, `Retry-After: 60`): a failure that isn't the file's.

### Using the codes

**Branch on `code`, not on the English `error` text**, which is free to change.
Errors without a `code` are ones a client can't help the person fix.

**Unknown API routes.** From 2.5.0, any `/api/v1/` path that no route claims
answers in this envelope (`apiNoRoute` in `respond.go`), not with the plain-text
404 of the web UI's catch-all:

- `404 {"error":"not found","code":"not_found"}`;
- `405 {"error":"method not allowed","code":"method_not_allowed"}` with an
  `Allow` header, when the path is a route under another method.

A client probing for a route an older server lacks therefore gets JSON either
way.

The media file-serving layer is separate. Missing-file and transcode failures
from that layer use plain-text `http.Error` responses. The server returns
podcast fetch 503s before file serving, and they include the fetch summary in
JSON.

### Status codes

Status mapping is consistent across handlers:

| Status | Meaning |
|---|---|
| `400` | malformed body / unknown JSON field, missing or invalid parameter (`path is required`, `invalid cursor`, non-integer `{id}`), path escaping the library root, domain validation (`mode must be "book" or "collection"`, admin needs a password, password too short) |
| `401` | missing/invalid/expired token, bad credentials, invalid auth code, wrong `current_password` |
| `403` | authenticated but not allowed: no share grants the library or path, `admin only`, demo accounts on the self-service routes (password/recovery/API keys), an API key on a credential-minting route (create key/recovery/pair/password/cast token) or on a household member route, a kid household member on the routes a kid can't use, a member managing members, adding a member while it is switched off, bad setup token |
| `404` | library/user/share/invite not found, another user's (or an unknown) bookmark or note on an edit, `no book at that path`, a path with a hidden (dot) segment on any content route (it reads as missing, after the scope check: `library.ContentPath`), feature not configured (demo mode off, well-known files unset) |
| `409` | conflicts: `name already taken` (library/share), last-enabled-admin guard, the household member cap, a session or pairing code for a member the admin disabled, the admin's household refusals, signing out the device making the request, starting someone's progress on a book they can't see, setup already completed |
| `413` | a request body over an endpoint's size cap (a custom cover over 5 MiB, a listening sync batch over 1 MiB) |
| `415` | an upload of a type the endpoint doesn't take (a custom cover that isn't JPEG/PNG/WebP) |
| `429` | a rate limiter tripped (see [Rate limiting](#rate-limiting)) |
| `500` | unexpected internal failure. The message is generic, and details go to the server log only |
| `502` | an upstream service failed: the community metadata service (`/meta` unless the book has [generated content](reference.md#generated-content), `/meta/cover`, `/meta/work`, the admin match search), or a community cover's own host (`PUT /admin/libraries/{id}/cover/community`, and `GET /libraries/{id}/meta/cover`, which answers a URL whose fetch failed less than a minute ago with the same `502` without asking its host again) |
| `503` | database unreachable (`/healthz`), transcoding requested without ffmpeg, demo at capacity, a Bridge's token that couldn't be checked, or the request timeout (below) |

**Request timeout.** `http.TimeoutHandler` bounds non-streaming requests at
**30 s**. A request that exceeds it gets `503 {"error":"request timed out"}`.

Streaming reads are exempt, so audio playback can run indefinitely and a large
backup can finish downloading:

- `GET` and `HEAD` on exactly `/libraries/{id}/stream` and
  `/libraries/{id}/cover`. The community `/libraries/{id}/meta/cover` is a
  bounded thumbnail and stays under the timeout.
- a backup's download (`GET /admin/backups/{name}`), but not the `…/restore`
  beside it;
- the `/web` static mount.

Only reads are exempt. An upload to a streaming-shaped path (the admin
custom-cover `PUT /admin/libraries/{id}/cover`) stays bounded by the 30 s
timeout, so a slow client can't hold it open.

## Path-addressed content: `?path=`

Content identity is `(library_id, rel_path)`, never a database id. Every
content endpoint takes the book or file path as a **query parameter**:

```
GET /api/v1/libraries/3/item?path=Brandon%20Sanderson/Mistborn/The%20Final%20Empire
```

It is a query parameter, not a URL path segment, to avoid encoded-slash
problems. Proxies and routers disagree about `%2F` in paths, while a query value
round-trips reliably. The value is the slash-separated path relative to the
library root, exactly as returned by `/fs` listings, book `rel_path` fields and
chapter `file_path` fields.

Two server-side guarantees apply to every `?path=`, plus a length cap.

**Length cap.** The cap is 4096 bytes as sent (`relpath.MaxBytes`, which
`catalog.MaxPathBytes` names). These routes answer a longer path with 400
`path is too long`:

- the content routes (`item`, `chapters`, `cover`, `stream`, progress,
  bookmarks, notes, history, `POST /cast/token` and the like);
- browse (`/fs`);
- removing from the queue or a collection;
- the admin folder override (`PUT` and `DELETE`);
- the Bridge's book read.

The check comes **first**. It runs before the server looks the library up, so
an unknown or ungranted library answers 400 for such a path, not 404 or 403. It
also runs before the path is cleaned or stored. Elsewhere:

- In a [listening sync](reference.md#post-apiv1melisteningsync) batch,
  including the Bridge's Audible listening batch, such an event is `rejected`
  `invalid` whatever its library, and the rest of the batch applies.
- The podcast routes (unfollow, fetch, retention and policy) and the Bridge's
  ASIN enrichment refuse such a path with their usual `400 invalid_request`:
  a show or episode path that `feed.ShowPath` or `EpisodePath` doesn't take, or
  no book path.
- A podcast show or episode folder name over the cap in a Bridge's feed is
  invalid.

**Traversal safety.** The server resolves the path through `library.SafeJoin`,
which rejects `..` escapes, absolute-path injection and symlinks pointing
outside the library root (400 `invalid path`).

**Scope authorization.** The server checks the path against the caller's share
scope (`authorizedPath`). A path outside any granting share is 403, even if it
exists. Admins bypass book share scoping, but the podcast client and
private-show filters apply to admins too (see
[Podcast visibility](../auth-and-security.md#podcast-visibility)).

:::warning[`books.id` is not an identity]
Book objects include an `id`, but it is a rebuildable index artifact. It
changes on rescans and must never be persisted or used to address content.
Always use `(library_id, rel_path)`. See
[Invariants](../../architecture/invariants.md).
:::

## Pagination

**Book lists are keyset-paginated.** `GET /libraries/{id}/books` takes `limit`
(default 50; values ≤ 0 or > 200 fall back to 50) and an opaque `cursor`. A page
whose result was truncated carries `next_cursor`:

```json
{ "books": ["…"], "next_cursor": "VGhlIFdheSBvZiBLaW5ncwAxNDI" }
```

Pass it back verbatim as `?cursor=` for the next page. A page without
`next_cursor` is the last one. Cursors encode the sort key of the last row, so
paging cost does not grow with depth. Never assume the cursor's format: it is
base64 today, but opaque by contract. A malformed cursor is 400
`invalid cursor`. Changing `sort` or the filters invalidates a cursor.

The admin console's book list ([`GET /admin/books`](reference.md#get-apiv1adminbooks))
pages the same way, with its own defaults: 60 per page, and values ≤ 0 or > 200
fall back to 60. Its cursor names the ordering it was minted for, so replaying
it under another `sort` or `order` is `400 invalid cursor`.

**Filesystem listings are offset-paginated.** `GET /libraries/{id}/fs` takes
`offset` and `limit` (default 200, max 500). It returns `total` and `offset`,
and `next_offset` when more entries remain. Directory size bounds a directory
listing, so offsets are fine there.

**A listener's own lists across books are keyset-paginated too**, newest first,
with the same kind of opaque `cursor` and `next_cursor`. See the rules they
share under [`GET /me/bookmarks`](reference.md#get-apiv1mebookmarks).

Other list endpoints (`/search`, `/books/recent`, a single book's history) are
single-shot with a `limit` and no pagination.

The server may answer `GET /libraries/{id}/books`, `GET /books/recent`,
`GET /search` and `GET /libraries/{id}/authors`, `/narrators` and `/series`
from a server-side cache that any database write empties. An answer is
therefore never staler than one built fresh, and nothing on the wire changes
(see [the list answer cache](../overview.md#the-list-answer-cache)).

## Capability flags: gate your features {/* #capability-flags---gate-your-features */}

`GET /api/v1/server` is public and returns the server's capabilities:

```json
{
  "name": "Hearthside",
  "version": "1.4.2",
  "api": "v1",
  "capabilities": {
    "admin_ui": true,
    "web_player": true,
    "transcode": true,
    "upload": false,
    "websocket": false,
    "api_keys": true,
    "metadata": true,
    "export": true,
    "meta_bundle": true,
    "meta_covers": true,
    "browse_people": true,
    "series_memberships": true,
    "series_books": true,
    "cover_sizes": true,
    "next_book": true,
    "queue": true,
    "collections": true,
    "ratings": true,
    "progress_edit": true,
    "user_stats": true,
    "my_devices": true,
    "annotations": true,
    "addresses": true,
    "household": true,
    "cast": true,
    "household_members": true,
    "bridge": false,
    "contributions": false,
    "podcasts": false,
    "audible": false,
    "podcast_fetch": true,
    "podcast_discovery": false,
    "podcast_opml": true,
    "ebooks": true,
    "readalong": true,
    "renditions": true
  },
  "auth": { "methods": ["auth_code", "password"] },
  "renditions": ["watch"],
  "demo": { "enabled": false }
}
```

`name` is the server's display name (`"AudioSilo"` until an admin names it).
`demo.enabled` drives the "Try the demo" affordance.

Clients **must** feature-gate on these flags rather than probing endpoints. A
server that predates a flag omits it, so treat a missing flag as `false`
unless its row says otherwise. Some flags are always `true` on a server that
has them. For the others, each row says when the flag is `true`.

### Server setup

| Flag | Gates |
|---|---|
| `transcode` | whether ffmpeg is configured. Without it, `?transcode=1` is 503 |
| `web_player` | whether `/web` is mounted |
| `api_keys` | whether the server supports user-minted [API keys](reference.md#personal-api-keys) |
| `metadata` | whether [community metadata lookup](reference.md#get-apiv1librariesidmeta) is configured. It gates the standalone [work lookup](reference.md#get-apiv1metawork) too, and the enriched-book material is drawn only when it is true |
| `export` | whether the admin [library export](reference.md#get-apiv1adminlibrariesidexport) exists |
| `upload`, `websocket` | roadmap phases. They will flip on when they land |

### Catalog and browsing

| Flag | Gates |
|---|---|
| `meta_bundle` | `include=previous` and `spoilers=hide` on [`/meta`](reference.md#get-apiv1librariesidmeta). Always equal to `metadata` |
| `meta_covers` | the server serving the community covers that a book's `/meta` envelope hands out, at [`/meta/cover`](reference.md#get-apiv1librariesidmetacover). Always equal to `metadata`. Without it the web player shows placeholders for those covers, since its CSP takes images only from the server. Native apps load the `cover_url` directly |
| `browse_people` | the browse lists [`/authors`, `/narrators`](reference.md#get-apiv1librariesidauthors--get-apiv1librariesidnarrators) and [`/series`](reference.md#get-apiv1librariesidseries), and `narrator=` on [`/books`](reference.md#get-apiv1librariesidbooks) |
| `cover_sizes` | `?size=160\|320\|640` thumbnails on [`/cover`](reference.md#get-apiv1librariesidcover). The server takes `96` too from 2.5.1, but the flag is also true on older servers, which refuse `96` |
| `next_book` | [`/next`](reference.md#get-apiv1librariesidnext), the server's answer to what plays after a book |
| `series_memberships` | `memberships=1` on [`/books`](reference.md#get-apiv1librariesidbooks) and [`/series`](reference.md#get-apiv1librariesidseries), so a book counts in every series it is in |
| `series_books` | [`/series/books`](reference.md#get-apiv1librariesidseriesbooks), the first page of several series' books in one request |

### The listener's own state

Each of these is always `true` on a server that has it.

| Flag | Gates |
|---|---|
| `queue` | up next, [`/me/queue`](reference.md#get-apiv1mequeue) |
| `collections` | [`/me/collections`](reference.md#get-apiv1mecollections) and everything under it, and [`/me/share-targets`](reference.md#get-apiv1meshare-targets) |
| `ratings` | [`/libraries/{id}/rating`](reference.md#get-apiv1librariesidrating) and [`/me/ratings`](reference.md#get-apiv1meratings) |
| `progress_edit` | [`PATCH /libraries/{id}/progress`](reference.md#patch-apiv1librariesidprogress) (mark finished or unfinished, edit the dates) and `started_at` / `finished_at` on progress responses |
| `user_stats` | [`/me/stats`](reference.md#get-apiv1mestats), [`/me/listening`](reference.md#get-apiv1melistening) and [`/me/goal`](reference.md#get-apiv1megoal--put-apiv1megoal--delete-apiv1megoal) |
| `my_devices` | [`/me/devices`](reference.md#get-apiv1medevices), the caller's own signed-in devices |
| `annotations` | a bookmark's `label` (on [`POST …/bookmarks`](reference.md#get-apiv1librariesidbookmarks--post-apiv1librariesidbookmarks) and every bookmark answer), the owner's edits [`PATCH /bookmarks/{id}`](reference.md#patch-apiv1bookmarksid) and [`PATCH /notes/{id}`](reference.md#patch-apiv1notesid), the all-books lists [`/me/bookmarks`](reference.md#get-apiv1mebookmarks) and [`/me/notes`](reference.md#get-apiv1menotes), and `cursor` paging plus each row's `book` on [`/me/history`](reference.md#get-apiv1mehistory) |
| `listening_sync` | listening sync (Sync v2): [`POST /me/listening/sync`](reference.md#post-apiv1melisteningsync), and `device_name` / `other_place` on every progress response. See [Listening sync in the player](#listening-sync-in-the-player) |

#### Listening sync in the player

The player records listening as events unless `listening_sync` is `false`. An
unknown flag counts as `true` (see
[the outbox](../../frontend/offline.md#listening-sync-the-outbox)). When the flag
is `false`, the player saves by `PUT .../progress` and `POST .../history` as
before. A player that finds the route gone (`404` or `405`) reads `/server`
again. If the flag is then missing, it sends what waited as one legacy save per
book.

### Addresses, the household and casting

Each of these is always `true` on a server that has it.

| Flag | Gates |
|---|---|
| `addresses` | the server's [home and away addresses](reference.md#home-and-away-addresses) on every pairing payload and its links, on the exchange, login and demo answers, and [`GET /addresses`](reference.md#get-apiv1addresses) |
| `household` | [Listening in the house](reference.md#listening-in-the-house): the caller's opt-in at [`/me/household`](reference.md#get-apiv1mehousehold--put-apiv1mehousehold) and [`GET /household/listening`](reference.md#get-apiv1householdlistening). Without it the player hides the sharing switch and the Home row |
| `household_members` | [Household members](reference.md#household-members): `/me/household/members/**`, `managed_by`, `member_kind` and (for a member) `display_name` on the `user` object, and `member_sign_ins` on [`/me/devices`](reference.md#get-apiv1medevices) with its `?also_members=1`. Without it the player offers no "Add someone to your household". It never depends on the caller. Whether this caller may add is the members list's `allowed` |
| `cast` | [`POST /cast/token`](reference.md#post-apiv1casttoken), and a cast token as the `?token=` of a book's cover and stream. Without it the player shows no Cast button |

### Reading

Each of these is always `true` on a server that has it.

| Flag | Gates |
|---|---|
| `ebooks` | the reader: a book's [`ebook`](reference.md#get-apiv1librariesidbooks) field, its bytes at [`GET /libraries/{id}/ebook`](reference.md#get-apiv1librariesidebook) and the reader's place at [`/libraries/{id}/reading-progress`](reference.md#get-apiv1librariesidreading-progress). The player offers Read on the web and in the apps when the flag is `true` and the book has an `ebook`. A downloaded book also offers it while the flag is unknown offline |
| `readalong` | read-along: a book's [`readalong`](reference.md#get-apiv1librariesiditem) field on `/item` and its map at [`GET /libraries/{id}/readalong`](reference.md#get-apiv1librariesidreadalong). The route exists either way. Whether a book has a map is its `readalong.state`. The player follows the narration with it, in the companion's Text tab and the reader's Follow narration |

### Upcoming releases

Added in 2.6.0. These three follow two settings. Kids and demo accounts are
refused by the routes, not by the flags.

| Flag | Gates |
|---|---|
| `upcoming` | [upcoming releases](reference.md#upcoming-releases): [`GET /me/upcoming`](reference.md#get-apiv1meupcoming). It is `true` while community metadata is on **and** the upcoming releases job is switched on (`upcoming.enabled`, on by default; the console's Settings > Metadata), so it can change while the server runs. An older server omits it. The `release_date` on the `/meta` rails' works is additive and needs no flag |
| `upcoming_calendar` | the [calendar feed](reference.md#the-calendar-feed): `GET`, `POST` and `DELETE /me/upcoming/calendar`, and `GET /me/upcoming/releases.ics`. Exactly `upcoming` (`false`, never absent, while off) |
| `upcoming_covers` | an upcoming release's cover from the server, [`GET /me/upcoming/cover`](reference.md#get-apiv1meupcomingcover). Exactly `upcoming`. Without it a client shows no cover for an item, since the web player can't load the `cover_url` itself |

### Watch renditions

| Flag | Gates |
|---|---|
| `renditions` | [watch renditions](reference.md#watch-renditions): `rendition=watch` on [`/stream`](reference.md#get-apiv1librariesidstream) and [`POST`/`GET /libraries/{id}/renditions`](reference.md#post-apiv1librariesidrenditions--get-apiv1librariesidrenditions). It is `true` while ffmpeg is configured **and** the server has a data directory, and `false` (sent, not absent) otherwise. An older server omits it |

The kinds the server makes are the top-level `renditions` list beside `auth`:
`["watch"]`, or `[]` while off. The flag stays a boolean for clients that read
`capabilities` as a map of booleans.

### Podcasts (core flags)

These describe the server, not the caller. Neither discovery nor OPML is a
module flag. The routes still answer grants, kid and demo refusals and the
client gate.

| Flag | Gates |
|---|---|
| `podcast_fetch` | optional. `true` means the server supports the [on-demand, status and Retry protocol](reference.md#podcast-fetch-status-and-retry), even when the module is off or the Bridge is offline. An older server omits it |
| `podcast_discovery` | directory search. `true` when directory search was enabled at start (`podcasts.discovery.enabled`) **and** the Podcasts module is on, whatever the Bridge's state or a directory key. Sent `false` otherwise. Absent on older servers, so treat absent as unsupported |
| `podcast_opml` | OPML import and export. Always `true`: the server speaks the protocol even offline or with the module off. The import still needs the module, and the export does not. Absent on older servers, so treat absent as unsupported |

Keep `podcast_fetch` separate from the live `podcasts` module flag
([managed modules](#managed-modules)). Ready media and status reads stay core.
The client and private scope still applies, admins included, and players older
than 2.2.0 remain hidden. Episode lists and `Book.episode` may include an
optional `fetch:Status`. Tolerate its absence on older servers.

The player offers its directory search only with `podcast_discovery`, and OPML
import and export only with `podcast_opml`. See
[Podcast discovery](reference.md#podcast-discovery) and
[OPML import and export](reference.md#opml-import-and-export).

### The Bridge

`bridge` is the first flag that depends on something outside the server. A
[managed module's flag](../modules.md#the-toggle-and-the-capability-flag) can
too.

| Flag | Gates |
|---|---|
| `bridge` | anything that needs the [Bridge](reference.md#the-bridge). It is `true` only while a Bridge is paired and its last heartbeat is under two minutes old, so it turns off when the Bridge stops |

While `bridge` is `true`, a top-level `bridge: {version, features}` object sits
beside `capabilities`. `features` is a list, never `null`. It names the job
families the Bridge runs that the server knows:

- `bridge`;
- `sidecars`, for generating characters, recaps and descriptions;
- `chapters`, for finding a chapterless book's chapters;
- `meta`, for filing corrections;
- `readalong`, for making read-along maps;
- `contribute`, while the Bridge can file contributions to the community
  database. That means it has a GitHub token that GitHub accepts, from its
  Accounts sign-in, its environment or `gh`. The server reads this from the
  heartbeat's `setup.can_contribute`, else `estimates.sidecars.can_contribute`.

An older Bridge reports fewer families, so check `features` rather than the
Bridge's version.

The block goes only to a **signed-in** caller: a session or API key of any
role, but not a demo account's. An anonymous caller gets the flag alone. The
server reuses the heartbeat it read for up to 5 seconds, so the flag can lag by
that much.

Check the flag **and** the feature you need:

- The player shows an admin **Generate characters and recaps** only with
  `bridge`, `sidecars` in `features` and `metadata`.
- The console's Health offers **Detect chapters** only with `chapters` in
  `features`.
- The book page's Read-along card offers **Make read-along** only with
  `readalong`.

### Managed modules

Each [managed module](../modules.md) adds one flag, named after the module. A
module ships off, and an admin turns it on in the console's Settings > Modules,
so the flag can change while the server runs. It is `true` only while the
module is on **and**, for a module that needs the Bridge, an online Bridge
offers the feature it needs. It is `false` (sent, not absent) otherwise. An
older server omits it.

| Flag | Gates |
|---|---|
| `podcasts` | the Podcasts module: follow, unfollow and check, new downloads, retention writes, and feed, download and retention scheduling. Needs the `podcast` Bridge feature, so it is false unless the toggle is on and that Bridge is online. Reads and valid present-pin reuse stay core, with client and private scope on player content. Players older than 2.2.0 remain excluded. The player shows Follow only while it is `true`. See [Podcasts](reference.md#podcasts) |
| `audible` | the Audible module: the console's [Audible routes](reference.md#audible-accounts) (`404 module_off` while off), the scheduled `audible.poll`, the `audible.import` backups and the `audible.sync` position sync (its two Bridge routes are `403 sync_off` while off). Needs the Bridge's `audible` feature. Only the console reads it. The player has no Audible surface and doesn't mirror it yet |
| `contributions` | the Contributions module: sending corrections and generated characters and recaps to the community database through the Bridge. Needs the Bridge's `contribute` feature. The console reads it for the generate dialog's contribute switch, Share with the community and Suggest corrections, and corrections also need `meta` in `bridge.features`. The player never contributes and doesn't read it |

### Gate on the flag, not the version

Gate on the flag rather than on the server version. An older server answers
`size=` and `narrator=` by ignoring them (full art, the unfiltered list), and
the new routes with a `404`.

Request bodies are decoded strictly, so a field added to an existing body (such
as a bookmark's `label`) is gated by its flag too. An older server refuses the
unknown field with `400 invalid request`.

Progress dates are the same. Without `progress_edit`, a progress response never
has `started_at` / `finished_at`, so their absence says nothing. With it, an
absent date is unknown or not set.

## Rate limiting

Two limiter mechanisms guard the API (`internal/api/ratelimit.go`):

- **Token buckets.** They are keyed by client IP until a request's credential is
  proved, and by the credential after. The `/auth/*` routes and a demo
  account's API requests stay keyed by IP.
- **Failure lockouts and attempt caps**, keyed by IP.

Tripping any of them returns **429** with an error envelope. From 2.5.0 it also
carries a `Retry-After` header in whole seconds (at least 1). The value is the
wait for the bucket's next token, or the time left on the lockout
(`tooManyAttempts`). [Auth & security](../auth-and-security.md#rate-limiting)
explains how it is worked out. Every other `429` the server sends carries one
too, including the podcast routes' and the budgets below, so a client can say
when to try again.

| Limiter | Scope | Policy |
|---|---|---|
| Address token bucket | public routes, every `/auth/*` route (with or without a token), the Bridge's `/bridge/*`, a request whose token is missing or refused, a demo account's API requests (not its covers and audio); static files are not counted | ~50 requests/second, burst 200, per IP (`rate limit exceeded`) |
| Credential token bucket | every other authenticated API request (admin routes included), once its token is proved | ~50,000 requests/second, burst 100,000, per session or API key; past it the address is charged too |
| Media token bucket | `GET /libraries/{id}/cover`, `GET /libraries/{id}/stream`, `GET /libraries/{id}/meta/cover` | ~200 requests/second, burst 2000, per credential (a cast token has a bucket of its own) |
| Login lockout | `POST /auth/login` | 10 *failed* attempts per 15 min per IP; a success resets the counter |
| Redeem lockout | `POST /auth/redeem`, `POST /auth/exchange`, `POST /bridge/pair` (one shared counter) | 10 *failed* attempts per 15 min per IP; a success resets |
| Demo cap | `POST /demo/session` | at most 5 demo sessions per IP per 15 min, metered at admission (failures count too) |
| Account mutations | `POST /auth/password`, `POST /auth/recovery`, `/auth/tokens` (create/revoke; listing is not counted) | at most 10 attempts per IP per 15 min, metered at admission |

The three token buckets' rates are `rate_limit.*` in the server's
[configuration](../configuration.md#rate-limits-rate_limit). The table shows
the defaults. A failed authentication on any route charges the address bucket,
so the address limit bounds guessing tokens.
[Auth & security](../auth-and-security.md#rate-limiting) explains how the
address and credential buckets work together.

Podcast discovery and OPML transfer add their own per-user budgets on top. The
server answers them with `429`, a `code` and `Retry-After`. See
[Podcast discovery](reference.md#podcast-discovery) and
[OPML import and export](reference.md#opml-import-and-export).

**Client IP resolution.** The server honours `X-Forwarded-For` only when the
direct peer is inside a `trusted_proxies` CIDR (config). Otherwise it uses the
TCP peer address, so clients cannot spoof their way out of a lockout. See
[Configuration](../configuration.md).

## CORS

CORS is a strict allow-list driven by `cors_origins` in the server config:

- **Unset (default):** the server never emits CORS headers. Cross-origin
  browser requests fail preflight. Native apps and same-origin web clients,
  including the player served at `/web`, are unaffected.
- **Listed origins:** every answer carries `Vary: Origin`. From 2.4.0 that
  includes answers with no `Origin`, with a denied one, and preflights, so a
  browser cache never reuses an answer made without the grant for a granted
  origin, or the other way round. An exact-match `Origin` gets:
  - `Access-Control-Allow-Origin: <that origin>`;
  - the methods `GET, POST, PUT, PATCH, DELETE, OPTIONS`;
  - the request headers `Authorization, Content-Type, X-AudioSilo-Client, Range`
    (`Access-Control-Allow-Headers`);
  - the exposed response headers
    `Retry-After, X-OPML-Exported, X-OPML-Omitted-Private, X-OPML-Omitted-Unavailable`
    (`Access-Control-Expose-Headers`), on every allowed response, not only
    preflights;
  - a 600 s preflight cache.

  `OPTIONS` requests short-circuit with 204.
- **`"*"`:** allows any origin. The server echoes the request's own `Origin`
  back.

For local player development against a dev server, set
`cors_origins: ["http://localhost:8081"]`.

A denied or absent origin gets no CORS header but `Vary`. A server with
`cors_origins` unset gets none at all.

### The allowed and exposed headers

The two lists are the consts `corsAllowHeaders` and `corsExposeHeaders`
(`internal/api/middleware.go`).

- `Range` is allowed for a script's fetch of a stream with the `Authorization`
  header. The player's episode probe sends `Range: bytes=0-0` with its token,
  so cross-origin it is always preflighted. An `<audio>` element's own Range
  requests come from the browser and are never preflighted.
- `Retry-After` is exposed because every `429` sends it, and so do some `503`s:
  a busy transcode, or an episode on its way. The request timeout sends none.
- The OPML export's counts are exposed too.

A cross-origin web player therefore reads these headers as the `/web` player
and native apps always could. An older server exposes nothing, so the player
falls back to the body's `retry_after_seconds` for an episode fetch and reads
the export counts as unknown.

### Covers and audio

Whether covers and audio load depends on how the player loads them.

- **CORS mode.** The web player loads another origin's covers, artwork and
  audio in CORS mode: it sets `crossOrigin="anonymous"` on the `<img>` and the
  `<audio>` element, but only when the URL is cross-origin to the page. The
  request then carries `Origin`, and the server's CORS layer answers it on
  media like any other route, a `206` and a `401` included. So `cors_origins`
  decides whether a player on another site shows covers and plays audio, and
  whether Web Audio (Voice boost) can hear the stream. CORS mode ignores
  `Cross-Origin-Resource-Policy`.
- **Same origin.** The player at `/web` is same-origin and sets no attribute.
- **An older player** loads them as no-cors requests with no `Origin`, which
  CORS never covers. What lets those load is the media answer's
  `Cross-Origin-Resource-Policy`. Once `cors_origins` is set, it is
  `cross-origin` on every authenticated media answer (from 2.4.1; before, it
  was `same-site` and the browser blocked the covers). It stays `cross-origin`
  until shipped players load in CORS mode. Then the server can narrow it.

See [Transport hardening](../auth-and-security.md#transport-hardening).

## The contract is hand-mirrored

There is no OpenAPI spec and no codegen. The player mirrors these JSON shapes by
hand in `audiosilo-frontend/src/api/types.ts`, and the Bridge mirrors them in its
`internal/link`. **Any wire change is therefore a multi-repo change**: the
handler, the mirrored types and the tests on both sides move together. See the
[cross-repo contract](../../architecture/cross-repo-contract.md) before touching
a payload.
