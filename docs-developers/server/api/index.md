---
title: API conventions
description: "Base path, authentication, error envelope, path-addressed content, pagination, capability flags, rate limiting, and CORS - the rules every endpoint follows."
---

Everything a client needs to know before calling any endpoint. The normative
source is the route table in `internal/api/api.go` and the handlers in
`internal/api/handlers_*.go`; the complete endpoint list is in the
[reference](reference.md).

## Base path and versioning

All JSON API routes live under **`/api/v1`**. The version is advertised by
[`GET /api/v1/server`](reference.md#get-apiv1server) as `"api": "v1"` - there is
no other versioning mechanism (no version headers, no v2).

A few routes deliberately live *outside* the prefix:

| Route | Why |
|---|---|
| `GET /healthz` (also served at `GET /api/v1/healthz`) | container/orchestrator healthchecks expect a root-level probe |
| `GET /setup`, `POST /setup` | the first-run setup page is a browser page, not an API surface (and is off unless the launcher enables it); the console's first-run flow uses `/api/v1/admin/setup` |
| `GET /.well-known/apple-app-site-association`, `GET /.well-known/assetlinks.json` | the well-known location is mandated by iOS/Android |
| `/`, `/connect`, `/admin`, `/assets/…`, `/web/…` | the baked-in admin/connect UI and the web player - static pages over the API, not part of it (see [Web UI](../web-ui.md)) |

## Requests

- Bodies are JSON. `decodeJSON` (in `internal/api/respond.go`) caps every
  control-plane body at **1 MiB** and decodes with `DisallowUnknownFields` - a
  body containing a field the server doesn't know is a **400**, not silently
  ignored (the one exception: `POST /demo/session` tolerates an empty or loose
  body). Keep client payloads exactly in sync with the documented shapes.
- Path parameters like the library `id` must be integers; anything else is a 400.
- Timestamps on the wire are RFC 3339 strings (e.g. `2026-07-01T19:42:07Z`).

:::caution Empty lists can be `null`
List-valued response fields are Go slices; when a result is empty the field
serializes as JSON `null`, not `[]` (e.g. `{"books": null}`). Treat `null` and
`[]` as equivalent.
:::

## Authentication

Every route except the public set (`/server`, `/healthz`, `/auth/redeem`,
`/auth/exchange`, `/auth/login`, `/demo/session`, `/bridge/pair`, `/setup`, the well-known files,
and the static UI) requires a **session bearer token**:

```
Authorization: Bearer <session token>
```

Admin routes (`/api/v1/admin/*`) additionally require the `admin` role (403
otherwise). Tokens are opaque secrets, stored server-side only as SHA-256 hashes;
sessions have **no expiry** and are revoked explicitly (`POST /auth/logout`, or
by an admin disabling/deleting the account, or signing that one device out
with `DELETE /admin/devices/{id}`). Every authenticated request bumps the
token's `last_seen`, which is what surfaces as a user's "last activity", and
records the request's address (`last_ip`) and, when it names one, its app (see
[Client identification](#client-identification-x-audiosilo-client)) on the
token.

There are four ways to obtain a session token:

1. **Auth-code pairing** (the primary flow): `POST /auth/redeem` with an
   invite or recovery code returns a *pairing payload* - a pairing token plus
   QR/deep-link carriers - without consuming a use. `POST /auth/exchange`
   trades the pairing token for a durable session token (`{ token, user }`),
   claiming one invite use per device that pairs. An invite-derived pairing
   token stays valid for as long as the invite has uses left (one QR can pair
   several devices); a recovery-derived one lasts 10 minutes.
2. **Password login**: `POST /auth/login` with `username`/`password` returns
   `{ token, user }` directly. Passwords are optional for non-admin accounts, so
   this only works for accounts that have one.
3. **Demo session**: `POST /demo/session` (only when demo mode is enabled)
   mints a throwaway account and returns a session token immediately.
4. **A household member's session, made by their owner** (capability
   `household_members`): `POST /me/household/members` with `sign_in_here`, or
   `POST /me/household/members/{id}/session`, returns the member's session envelope,
   signed in on the owner's device (see
   [Household members](reference.md#household-members)).

An already-authenticated client can mint a fresh pairing payload for another
device with `POST /auth/pair` - that token is single-use with a 10-minute TTL,
since the user is present and can mint another (an owner mints one for a member's
own device with `POST /me/household/members/{id}/pair`, alike). See
[Auth & security](../auth-and-security.md) for the trust model behind codes,
tokens, and hashes.

A user can also mint a **personal API key** (`POST /auth/tokens`) - a
non-expiring bearer credential for headless integrations such as dashboards and
cron. It is presented in the same `Authorization: Bearer …` header and
authenticates exactly like a session token, **acting as its owner**: an admin's
key satisfies the admin-role check, a regular user's does not. Pairing tokens
are never accepted as a bearer credential, and an API key is never valid for
`/auth/exchange`. It also **cannot mint a fresh durable credential** - an API-key
caller is refused (403) on the credential-minting routes (create key, recovery,
pair, set password, cast token, and every household member route), so revoking a
leaked key cuts off everything it could reach.
See the [reference](reference.md#personal-api-keys).

The paired **Bridge** (capability `bridge`) holds a credential of its own, a token
of kind `bridge` from [`POST /bridge/pair`](reference.md#post-apiv1bridgepair). It
is the narrowest credential the server has: it is accepted **only** on the Bridge's
own routes (`/api/v1/bridge/*`, except the public pairing exchange), only in the
`Authorization` header, and only while the admin who paired it is still an
enabled admin; every other route refuses it (`401`), and the Bridge's routes refuse
every other credential. On those routes a failure to check the token is a `503`,
not a `401`, since a `401` tells the Bridge its token is refused. Its calls don't
bump `last_seen`. See [The Bridge](reference.md#the-bridge).

### Media requests: `?token=` - media GETs only

`GET /libraries/{id}/cover`, `GET /libraries/{id}/stream` and
`GET /libraries/{id}/meta/cover` (a community cover, `meta_covers`) accept the
session token **either** as the bearer header **or** as a `?token=` query
parameter. This exists because browser `<img>` and `<audio>` elements cannot set
an `Authorization` header. The query fallback is deliberately confined to these
three routes (`requireBookMediaAuth` for cover and stream, `requireMediaAuth` for
`/meta/cover`, both `mediaAuth` in `internal/api/middleware.go`): a token in a query
string can leak into access logs and `Referer` headers, so no other route
accepts it. Native clients should keep using the header even for media.

A book's cover and stream also accept a **cast token** (capability `cast`) as the
`?token=`, which a player mints for the Chromecast receiver so it never sees the
session token: see [Cast tokens as media auth](reference.md#cast-tokens-as-media-auth).

### Client identification: `X-AudioSilo-Client`

A client names itself on each request with an optional header:

```
X-AudioSilo-Client: AudioSilo/1.4.2 (ios)
```

The form is `<app>/<version> (<platform>)`; the version and the platform are
optional (the admin console sends `AudioSilo Admin (web)`, since it ships inside
the server). `auth.ParseClient` parses it strictly - an app name of up to 40
plain characters, a version of up to 32, a platform of up to 24 (lower-cased) -
and a malformed or empty value is ignored, as if absent. It is never an error.

The server keeps the newest value **per token**, for the admin console's
[devices and sessions](reference.md#admin-activity): app, version and platform,
plus the address of the token's newest request. Both are overwritten, never
kept as a history, and a signed-out token's address is blanked by the daily
retention job. A request **without** the header keeps the stored app, so
media fetches by a browser's `<img>` / `<audio>` (which can't set headers) don't
erase it. A token whose client never sent the header (players released before
it) reads as an unknown app (`client: null`).

Who sends it:

- **The player** - always on native. On web only when the API is
  **same-origin** with the page: a custom header makes a cross-origin request
  non-simple, so the browser sends a CORS preflight, and servers released before
  the header don't allow it (see [CORS](#cors)). The embedded `/web` player is
  same-origin, so it identifies itself.
- **The admin console** - always (it is same-origin).
- Anything else may send it; nothing requires it.

The header also decides whether a client sees podcast libraries at all: see
[Podcast visibility](../auth-and-security.md#podcast-visibility).

## Error envelope and status conventions

Every error is a JSON object with an `error` message:

```json
{ "error": "no access to this path" }
```

Failures a person can fix also carry a machine-readable **`code`** next to
`error` (additive - a client that predates it reads only `error`):

```json
{ "error": "username already taken", "code": "username_taken" }
```

| `code` | Status | When |
|---|---|---|
| `username_taken` | `409` | creating an account with a username that exists (`POST /admin/users`) |
| `name_taken` | `409` | a library or share name already in use (create, rename) |
| `last_admin` | `409` | demoting or disabling the last enabled admin |
| `admin_needs_password` | `400` | an admin without a password (creating one, promoting a password-less account, or clearing an admin's password) |
| `password_too_short` | `400` | a password under the minimum length |
| `cannot_delete_self` | `400` | an admin deleting their own account |
| `path_not_absolute` | `400` | `GET /admin/fs/dirs` or `POST /admin/setup/preview` with a relative path |
| `folder_unreadable` | `404` | `GET /admin/fs/dirs` or `POST /admin/setup/preview` on a missing or unreadable folder |
| `invalid_setup_step` | `400` | `PUT /admin/setup` naming a step id the flow doesn't have, or an outcome other than `done` / `skipped` |
| `book_not_found` | `404` | an admin catalog call on a path that is not an indexed book (book page, edit, bulk edit, match, cover upload, community cover); an admin progress edit on a path with no progress and no indexed book; `POST /admin/bridge/jobs` and `GET /admin/bridge/estimate` on a path that is not an indexed book |
| `invalid_override` | `400` | a metadata edit the server refuses; the body also carries a `field` key naming the offending field (`PATCH /admin/libraries/{id}/book`, `POST /admin/books/bulk`) |
| `module_off` | `404` | any route a [managed module](../modules.md) mounts, while that module is off (Settings > Modules), for a caller the route's auth check admits (it runs first). The route exists either way, so turning the module on needs no restart. The `podcasts` module mounts `POST`/`DELETE /podcasts/follow` and `POST /podcasts/check`. Also `POST /admin/bridge/jobs` for a job the module owns (Phase 2b: `sidecars.contribute`, `meta.correct`, `sidecars.generate` with `contribute: "issue"`, the `contributions` module), checked before anything else about the job |
| `metadata_off` | `404` | a community match search, a `POST /admin/books/works` work-id batch, a community cover (`POST /admin/meta/covers`, `PUT /admin/libraries/{id}/cover/community`), or the metadata mirror (`GET /admin/meta/mirror`, `POST /admin/meta/mirror/check`) while community metadata is turned off |
| `too_large` | `400` / `413` | a bulk edit or an issue ignore over 1000 books, a cover batch over 60, a community cover batch over 12, or a work-id batch over 100 (`400`); a custom cover upload over 5 MiB, or a community cover over 16 MiB or 40 megapixels (`413`) |
| `unsupported_image` | `415` | a custom cover (uploaded or community) that is not a JPEG, PNG or WebP image |
| `cover_unavailable` | `502` | `PUT /admin/libraries/{id}/cover/community` or `GET /libraries/{id}/meta/cover` when the server couldn't fetch the image (the latter also for a minute after a failed fetch, without asking again) |
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
| `setting_locked` | `409` | `PATCH /admin/settings` changing a setting an `AUDIOSILO_*` variable or the launcher sets (`field` names it) |
| `update_check_off` | `409` | `POST /admin/update/check` while the update check is turned off |
| `not_mirror_mode` | `409` | `GET /admin/meta/mirror` or `POST /admin/meta/mirror/check` on a server that isn't keeping a local copy of the community metadata (remote mode, or `metadata.mode: mirror` saved but not restarted into) |
| `backup_running` | `409` | `POST /admin/backups` while a backup is being made |
| `backup_not_found` | `404` | a backup name that isn't in the backups folder (download, delete, restore) |
| `invalid_backup` | `400` | `POST /admin/backups/{name}/restore` on a file that is damaged or isn't an AudioSilo database |
| `backup_too_new` | `400` | `POST /admin/backups/{name}/restore` on a backup made by a newer server |
| `invalid_target` | `400` | a notification destination the server refuses (`POST`/`PATCH /admin/notifications`); `field` names the field (`kind`, `name`, `url`, `secret`, `events`) |
| `too_many_targets` | `409` | `POST /admin/notifications` when the server has 20 destinations |
| `demo_account` | `403` | a demo account on a route it can't use: the self-service routes (password, recovery code, API keys), sharing a collection, `GET /me/share-targets`, `PUT /me/household`, every `/me/household/members` route but the list, and (Phase 2b) every user route a managed module mounts |
| `kid_account` | `403` | a kid household member on `POST /auth/password`, `POST /auth/tokens`, `POST /auth/pair`, `POST /auth/recovery`, `PUT /me/household`, `PUT /me/collections/{id}/shares` or (Phase 2b) a user route a managed module mounts (where it is enforced: [Kids](../auth-and-security.md#household-members)) |
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
| `library_not_writable` | `409` | podcast follow/check, or `POST /admin/bridge/jobs` for a kind that writes (`sidecars.generate`, `sidecars.describe`, `chapters.detect`) in a library the Bridge's last heartbeat doesn't report mapped and writable |
| `cannot_contribute` | `409` | `POST /admin/bridge/jobs` for `sidecars.generate` with `contribute: "issue"`, `sidecars.contribute` or `meta.correct` while the Bridge's last heartbeat doesn't say it can contribute (its `setup.can_contribute`, else `estimates.sidecars.can_contribute`) |
| `generate_open` | `409` | `POST /admin/bridge/jobs` for `sidecars.describe`, `chapters.detect` or `sidecars.contribute` while a `sidecars.generate` job is open for the book (it writes the description, finds a chapterless book's chapters, and replaces the characters and recaps a share would file, itself) |
| `contribute_open` | `409` | `POST /admin/bridge/jobs` for `sidecars.generate` while a `sidecars.contribute` job is queued or working for the book (a parked one, or a queued one held while the `contributions` module is off, is cancelled instead) |
| `not_edited` | `400` | `POST /admin/bridge/jobs` for `meta.correct` with a change whose field isn't an edit made on this server, or whose corrected value isn't the book's value now; `field` names it |
| `detect_open` | `409` | `POST /admin/bridge/jobs` for `sidecars.generate` while a `chapters.detect` job is queued or working for the book (the generate job after it reuses its transcription), or for `sidecars.describe` while one is open |
| `describe_open` | `409` | `POST /admin/bridge/jobs` for `chapters.detect` while a `sidecars.describe` job is open for the book |
| `chapters_chosen` | `409` | `POST /admin/bridge/jobs` for `chapters.detect` for a book whose chapter source an admin chose (`files` or `community`): chapters found in the narration stand in only with no choice |
| `finished` | `409` | `POST /admin/bridge/jobs/{id}/cancel` on a job that already ended |
| `not_held` | `409` | the Bridge's `PATCH /bridge/jobs/{id}` from a claim that no longer holds the job (it ended, was cancelled, its lease ran out, or it no longer exists) |
| `no_heartbeat` | `409` | the Bridge's `GET /bridge/jobs/next` before its first heartbeat |
| `no_book` | `404` | the Bridge's `GET /bridge/libraries/{id}/book` with no indexed book at the path (or in the library) |

Podcast actions add `invalid_request` and `invalid_feed_url` (`400`),
`no_library_access` (`403`), `show_not_found` (`404`), `not_podcast_library`,
`bridge_unavailable` and `library_not_writable` (`409`), and
`too_many_requests` / `checked_recently` (`429`). Library kinds add
`invalid_kind` / `kind_immutable` (`400`) and `root_overlaps` (`409`, also from `POST /admin/setup/preview`). An
undownloaded episode streams as `404 not_downloaded`. Full shapes and async
feed failures: [Podcasts](reference.md#podcasts).

**Branch on `code`, not on the English `error` text**, which is free to change.
Errors without a `code` are ones a client can't help the person fix.

The media file-serving layer is separate: missing-file and transcode failures
from that layer use plain-text `http.Error` responses. Podcast `not_downloaded`
is returned before file serving and uses the JSON envelope.

Status mapping is consistent across handlers:

| Status | Meaning |
|---|---|
| `400` | malformed body / unknown JSON field, missing or invalid parameter (`path is required`, `invalid cursor`, non-integer `{id}`), path escaping the library root, domain validation (`mode must be "book" or "collection"`, admin needs a password, password too short) |
| `401` | missing/invalid/expired token, bad credentials, invalid auth code, wrong `current_password` |
| `403` | authenticated but not allowed: no share grants the library or path, `admin only`, demo accounts on the self-service routes (password/recovery/API keys), an API key on a credential-minting route (create key/recovery/pair/password/cast token) or on a household member route, a kid household member on the routes a kid can't use, a member managing members, adding a member while it is switched off, bad setup token |
| `404` | library/user/share/invite not found, another user's (or an unknown) bookmark or note on an edit, `no book at that path`, a path with a hidden (dot) segment on any content route (it reads as missing, after the scope check: `library.ContentPath`), feature not configured (demo mode off, well-known files unset) |
| `409` | conflicts: `name already taken` (library/share), last-enabled-admin guard, the household member cap, a session or pairing code for a member the admin disabled, the admin's household refusals, signing out the device making the request, starting someone's progress on a book they can't see, setup already completed |
| `413` | a request body over an endpoint's size cap (a custom cover over 5 MiB) |
| `415` | an upload of a type the endpoint doesn't take (a custom cover that isn't JPEG/PNG/WebP) |
| `429` | a rate limiter tripped (see below) |
| `500` | unexpected internal failure - the message is generic; details go to the server log only |
| `502` | an upstream service failed: the community metadata service (`/meta` unless the book has [generated content](reference.md#generated-content), `/meta/cover`, `/meta/work`, the admin match search), or a community cover's own host (`PUT /admin/libraries/{id}/cover/community`, and `GET /libraries/{id}/meta/cover`, which answers a URL whose fetch failed less than a minute ago with the same `502` without asking its host again) |
| `503` | database unreachable (`/healthz`), transcoding requested without ffmpeg, demo at capacity, a Bridge's token that couldn't be checked, or the request timeout (below) |

**Request timeout.** Non-streaming requests are bounded at **30 s** by
`http.TimeoutHandler`; a request that exceeds it gets
`503 {"error":"request timed out"}`. Streaming reads - `GET`/`HEAD` on
`/libraries/{id}/stream` and `/libraries/{id}/cover` (exactly: the community
`/libraries/{id}/meta/cover` is a bounded thumbnail and stays under the timeout), a backup's download (`GET /admin/backups/{name}`, not the
`…/restore` beside it) and the `/web` static mount - are exempt, so audio playback can run indefinitely and a
large backup can finish downloading. Only reads are exempt: an upload to a streaming-shaped
path (the admin custom-cover `PUT /admin/libraries/{id}/cover`) stays bounded
by the 30 s timeout, so a slow client can't hold it open.

## Path-addressed content: `?path=`

Content identity is `(library_id, rel_path)` - never a database id. Every
content endpoint takes the book/file path as a **query parameter**:

```
GET /api/v1/libraries/3/item?path=Brandon%20Sanderson/Mistborn/The%20Final%20Empire
```

It is a query parameter (not a URL path segment) to avoid encoded-slash
problems: proxies and routers disagree about `%2F` in paths, while a query value
round-trips reliably. The value is the slash-separated path relative to the
library root, exactly as returned by `/fs` listings, book `rel_path` fields, and
chapter `file_path` fields.

Two server-side guarantees apply to every `?path=`:

- **Traversal safety** - the path is resolved through `library.SafeJoin`, which
  rejects `..` escapes, absolute-path injection, and symlinks pointing outside
  the library root (400 `invalid path`).
- **Scope authorization** - the path is checked against the caller's share
  scope (`authorizedPath`); a path outside any granting share is 403, even if it
  exists. Admins bypass book share scoping; podcast client and private-show
filters apply to admins too (see [Podcast visibility](../auth-and-security.md#podcast-visibility)).

:::warning `books.id` is not an identity
Book objects include an `id`, but it is a rebuildable index artifact - it
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

Pass it back verbatim as `?cursor=` for the next page; a page without
`next_cursor` is the last one. Cursors encode the sort key of the last row, so
paging cost does not grow with depth - never assume the cursor's format (it is
base64 today, but opaque by contract). A malformed cursor is 400
`invalid cursor`. Changing `sort`/filters invalidates a cursor.

The admin console's book list ([`GET /admin/books`](reference.md#get-apiv1adminbooks))
pages the same way, with its own defaults (60 per page; values ≤ 0 or > 200 fall
back to 60). Its cursor names the ordering it was minted for, so replaying it
under another `sort`/`order` is `400 invalid cursor`.

**Filesystem listings are offset-paginated.** `GET /libraries/{id}/fs` takes
`offset`/`limit` (default 200, max 500) and returns `total`, `offset`, and -
when more entries remain - `next_offset`. Directory listings are bounded by
directory size, so offsets are fine there.

**A listener's own lists across books are keyset-paginated too**, newest first
with the same kind of opaque `cursor` / `next_cursor`: see
[the rules they share](reference.md#get-apiv1mebookmarks).

Other list endpoints (`/search`, `/books/recent`, a single book's history) are
single-shot with a `limit` and no pagination.

## Capability flags - gate your features

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
    "podcasts": false
  },
  "auth": { "methods": ["auth_code", "password"] },
  "demo": { "enabled": false }
}
```

`name` is the server's display name (`"AudioSilo"` until an admin names it).
Clients **must** feature-gate on these flags rather than probing endpoints:
`transcode` reflects whether ffmpeg is configured (without it, `?transcode=1`
is 503), `web_player` whether `/web` is mounted, `api_keys` whether the server
supports user-minted [API keys](reference.md#personal-api-keys), `metadata`
whether [community metadata lookup](reference.md#get-apiv1librariesidmeta) is
configured (it gates the standalone
[work lookup](reference.md#get-apiv1metawork) too, and the enriched-book
material is drawn only when it is true), `export` whether the admin
[library export](reference.md#get-apiv1adminlibrariesidexport) exists,
`upload`/`websocket` are roadmap phases that will flip on when they land.
`demo.enabled` drives the "Try the demo" affordance.

The player-redesign data API added these. A server that predates a flag omits
it, so treat a missing flag as `false`:

| Flag | Gates |
|---|---|
| `meta_bundle` | `include=previous` and `spoilers=hide` on [`/meta`](reference.md#get-apiv1librariesidmeta); always equal to `metadata` |
| `browse_people` | the browse lists [`/authors`, `/narrators`](reference.md#get-apiv1librariesidauthors--get-apiv1librariesidnarrators) and [`/series`](reference.md#get-apiv1librariesidseries), and `narrator=` on [`/books`](reference.md#get-apiv1librariesidbooks) |
| `cover_sizes` | `?size=160\|320\|640` thumbnails on [`/cover`](reference.md#get-apiv1librariesidcover) |
| `next_book` | [`/next`](reference.md#get-apiv1librariesidnext), the server's answer to what plays after a book |
| `series_memberships` | `memberships=1` on [`/books`](reference.md#get-apiv1librariesidbooks) and [`/series`](reference.md#get-apiv1librariesidseries): a book counts in every series it is in |
| `series_books` | [`/series/books`](reference.md#get-apiv1librariesidseriesbooks), the first page of several series' books in one request |

`meta_covers`, always equal to `metadata`, came later: the server serves the
community covers a book's `/meta` envelope hands out at
[`/meta/cover`](reference.md#get-apiv1librariesidmetacover). Without it the web
player shows placeholders for those covers, since its CSP takes images only from
the server; native apps load the `cover_url` directly.

The listener's own state, stats, annotations and the server's addresses added eight,
each always `true` on a server that has it:

| Flag | Gates |
|---|---|
| `queue` | up next, [`/me/queue`](reference.md#get-apiv1mequeue) |
| `collections` | [`/me/collections`](reference.md#get-apiv1mecollections) and everything under it, and [`/me/share-targets`](reference.md#get-apiv1meshare-targets) |
| `ratings` | [`/libraries/{id}/rating`](reference.md#get-apiv1librariesidrating) and [`/me/ratings`](reference.md#get-apiv1meratings) |
| `progress_edit` | [`PATCH /libraries/{id}/progress`](reference.md#patch-apiv1librariesidprogress) (mark finished or unfinished, edit the dates) and `started_at` / `finished_at` on progress responses |
| `user_stats` | [`/me/stats`](reference.md#get-apiv1mestats), [`/me/listening`](reference.md#get-apiv1melistening) and [`/me/goal`](reference.md#get-apiv1megoal--put-apiv1megoal--delete-apiv1megoal) |
| `my_devices` | [`/me/devices`](reference.md#get-apiv1medevices), the caller's own signed-in devices |
| `annotations` | a bookmark's `label` (on [`POST …/bookmarks`](reference.md#get-apiv1librariesidbookmarks--post-apiv1librariesidbookmarks) and every bookmark answer), the owner's edits [`PATCH /bookmarks/{id}`](reference.md#patch-apiv1bookmarksid) and [`PATCH /notes/{id}`](reference.md#patch-apiv1notesid), the all-books lists [`/me/bookmarks`](reference.md#get-apiv1mebookmarks) and [`/me/notes`](reference.md#get-apiv1menotes), and `cursor` paging plus each row's `book` on [`/me/history`](reference.md#get-apiv1mehistory) |
| `addresses` | the server's [home and away addresses](reference.md#home-and-away-addresses) on every pairing payload and its links, on the exchange, login and demo answers, and [`GET /addresses`](reference.md#get-apiv1addresses) |

The player redesign's Phase 8 added two, each always `true` on a server that has it:

| Flag | Gates |
|---|---|
| `household` | [Listening in the house](reference.md#listening-in-the-house): the caller's opt-in at [`/me/household`](reference.md#get-apiv1mehousehold--put-apiv1mehousehold) and [`GET /household/listening`](reference.md#get-apiv1householdlistening). Without it the player hides the sharing switch and the Home row |
| `cast` | [`POST /cast/token`](reference.md#post-apiv1casttoken) and a cast token as the `?token=` of a book's cover and stream. Without it the player shows no Cast button |

Phase 8b-1 added one more, always `true` on a server that has it:

| Flag | Gates |
|---|---|
| `household_members` | [Household members](reference.md#household-members): `/me/household/members/**`, `managed_by`, `member_kind` and (for a member) `display_name` on the `user` object, `member_sign_ins` on [`/me/devices`](reference.md#get-apiv1medevices) and its `?also_members=1`. Without it the player offers no "Add someone to your household". It never depends on the caller: whether this caller may add is the members list's `allowed` |

The Bridge added one more, the first flag that depends on something outside the
server (a [managed module's](../modules.md#the-toggle-and-the-capability-flag) flag, below, can too):

| Flag | Gates |
|---|---|
| `bridge` | anything that needs the [Bridge](reference.md#the-bridge). It is `true` only while a Bridge is paired and its last heartbeat is under two minutes old, so it turns off when the Bridge stops. While it is `true`, a top-level `bridge: {version, features}` object sits beside `capabilities`: `features` lists the job families the Bridge runs that the server knows (`bridge`, `sidecars` for generating characters and recaps and, from a Phase 1c Bridge, descriptions, and `chapters` for finding a chapterless book's chapters, from a Phase 1d Bridge, and `meta` for filing corrections, from a Phase 2b Bridge), plus `contribute` while the Bridge can file contributions to the community database (it has a GitHub token GitHub accepts, from its Accounts sign-in, its environment or `gh`: its heartbeat's `setup.can_contribute`, else `estimates.sidecars.can_contribute`); a list, never `null`. Since Phase 2b the block goes only to a **signed-in** caller (a session or API key of any role, not a demo account's); an anonymous caller gets the flag alone. The server reuses the heartbeat it read for up to 5 seconds, so the flag can lag by that much. Check the flag **and** the feature you need: the player shows an admin **Generate characters and recaps** only with `bridge`, `sidecars` in `features` and `metadata`, and the console's Health offers **Detect chapters** only with `chapters` in `features` |

Then each [managed module](../modules.md) adds one flag, named after the module. A
module ships off and an admin turns it on in the console's Settings > Modules, so the
flag can change while the server runs. It is `true` only while the module is on
**and**, for a module that needs the Bridge, an online Bridge offers the feature it
needs; it is `false` (sent, not absent) otherwise. An older server omits it:

| Flag | Gates |
|---|---|
| `podcasts` | the Podcasts module: follow/unfollow/check and feed scheduling. Needs the `podcast` Bridge feature; false unless the toggle is on and that Bridge is online. Read routes are core, subject to the client gate and private-show scope. Released players remain excluded until a supported player release; see [Podcasts](reference.md#podcasts) |
| `contributions` | the Contributions module: sending corrections and generated characters and recaps to the community database through the Bridge. Needs the Bridge's `contribute` feature. The console reads it (the generate dialog's contribute switch, Share with the community, Suggest corrections; with `meta` in `bridge.features` for corrections); the player never contributes and doesn't read it |

Gate on the flag rather than on the server version: an older server answers
`size=` and `narrator=` by ignoring them (full art, the unfiltered list) and the
new routes with a `404`. Request bodies are decoded strictly, so a field added to an
existing body (such as a bookmark's `label`) is gated by its flag too: an older
server refuses the unknown field with `400 invalid request`. Progress dates are the same: without `progress_edit` a
progress response never has `started_at` / `finished_at`, so their absence says
nothing; with it, an absent date is unknown or not set.

## Rate limiting

Two limiter mechanisms guard the API (`internal/api/ratelimit.go`), keyed by
client IP except for authenticated media. Tripping any of them returns **429**
with an error envelope.

| Limiter | Scope | Policy |
|---|---|---|
| General token bucket | every request except static files and media | ~50 requests/second, burst 200, per IP (`rate limit exceeded`) |
| Media token bucket | `GET /libraries/{id}/cover`, `GET /libraries/{id}/stream`, `GET /libraries/{id}/meta/cover` | ~200 requests/second, burst 2000, per credential (a cast token has a bucket of its own); a failed authentication counts against the general bucket ([details](../auth-and-security.md#rate-limiting)) |
| Login lockout | `POST /auth/login` | 10 *failed* attempts per 15 min per IP; a success resets the counter |
| Redeem lockout | `POST /auth/redeem`, `POST /bridge/pair` (one shared counter) | 10 *failed* attempts per 15 min per IP; a success resets |
| Demo cap | `POST /demo/session` | at most 5 demo sessions per IP per 15 min, metered at admission (failures count too) |
| Account mutations | `POST /auth/password`, `POST /auth/recovery`, `/auth/tokens` (create/list/revoke) | at most 10 attempts per IP per 15 min, metered at admission |

**Client IP resolution:** `X-Forwarded-For` is honored only when the direct
peer is inside a `trusted_proxies` CIDR (config); otherwise the TCP peer address
is used, so clients cannot spoof their way out of a lockout. See
[Configuration](../configuration.md).

## CORS

CORS is a strict allow-list driven by `cors_origins` in the server config:

- **Unset (default):** no CORS headers are ever emitted. Cross-origin browser
  requests fail preflight; native apps and same-origin web clients (including
  the player served at `/web`) are unaffected.
- **Listed origins:** an exact-match `Origin` gets
  `Access-Control-Allow-Origin: <that origin>` (plus `Vary: Origin`), methods
  `GET, POST, PUT, PATCH, DELETE, OPTIONS`, headers
  `Authorization, Content-Type, X-AudioSilo-Client`, and
  a 600 s preflight cache. `OPTIONS` requests short-circuit with 204.
- **`"*"`:** allows any origin (the request's own `Origin` is echoed back).

For local player development against a dev server, set
`cors_origins: ["http://localhost:8081"]`.

## The contract is hand-mirrored

There is no OpenAPI spec and no codegen. The player mirrors these JSON shapes by
hand in `audiosilo-frontend/src/api/types.ts`, and the Bridge mirrors them in its
`internal/link`, so **any wire change is a multi-repo change** - handler,
mirrored types, and tests on both sides move together. See the
[cross-repo contract](../../architecture/cross-repo-contract.md) before touching
a payload.
