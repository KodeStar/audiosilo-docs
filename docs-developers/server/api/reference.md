---
title: Endpoint reference
description: "Every route the server exposes: method, auth requirement, parameters, response envelope, and status codes - grouped by area."
---

The complete HTTP surface, derived from the route table in
`internal/api/api.go`. Conventions (auth, errors, pagination, rate limits) are
in the [API conventions](index.md) page and are not repeated per endpoint.

**Auth legend** - *Public*: no token. *Session*: bearer session token.
*Session (media)*: session token via header **or** `?token=` query parameter.
*Admin*: session token + `admin` role. A personal **API key** authenticates as
its owner anywhere a *Session* token does - so an admin's key also satisfies
*Admin* - with one carve-out: it is refused on the credential-minting routes (see
[Personal API keys](#personal-api-keys)).

All `/api/v1` bodies and responses are JSON. Timestamps are RFC 3339. Remember
that empty list fields may serialize as `null`.

## Server & meta

### `GET /api/v1/server`

*Public.* Server identity and capability discovery - call this before anything
else and gate features on the flags.

```json
{
  "name": "AudioSilo",
  "server_id": "kx8Qz1c7m2Vw0aB3dEfGh",
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
    "export": true
  },
  "auth": { "methods": ["auth_code", "password"] },
  "demo": { "enabled": false }
}
```

`server_id` is a stable, per-install identity minted once and persisted in
`config.yaml` (so it survives a database rebuild). It never changes for the life of
the install; clients use it as the identity for a paired server and key their
per-server state (downloads, progress, cache) on it. It is also returned by the
pairing exchange (`POST /auth/exchange`) and login/demo responses, so a client has
it the moment it pairs. `version` is stamped from the release tag (`"dev"` for local builds).
`transcode` is true only when ffmpeg is configured; `web_player` only when the
`/web` mount is populated; `upload` and `websocket` are reserved for future
phases and currently always false. `api_keys` is true on servers that support
user-minted [personal API keys](#personal-api-keys). `metadata` reflects the
**runtime** state of [community metadata lookup](#get-apiv1librariesidmeta): it
is true only when a valid `metadata.base_url` is configured **and** the lookup is
switched on. An admin can flip it on or off at runtime via
[`PATCH /api/v1/admin/settings`](#patch-apiv1adminsettings) (no restart), so this
flag can change during a server's lifetime; clients gate the enriched-book
section on it and should re-read it after reconnecting. `export` is true on
servers that support the admin
[library export](#get-apiv1adminlibrariesidexport).

### `GET /healthz` · `GET /api/v1/healthz`

*Public.* Liveness/readiness probe: checks database read-reachability under a
2-second deadline. Both paths serve the same handler (the root form suits
container healthchecks).

```json
{ "status": "ok" }
```

| Status | Meaning |
|---|---|
| `200` | database reachable for reads |
| `503` | `{"error":"database unavailable"}` |

## Authentication & pairing

See [API conventions - Authentication](index.md#authentication) for the flow
overview and [Auth & security](../auth-and-security.md) for the trust model.

### `POST /api/v1/auth/redeem`

*Public.* Validates an auth code (admin-minted invite **or** user-owned
recovery code - both redeem identically) and returns a pairing payload
**without consuming a use** - the use is claimed when a device actually
completes `/auth/exchange`, so opening an invite link costs nothing.
Rate-limited: 10 failed attempts per IP per 15 minutes.

Request body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | human-typable code, e.g. `9M4K-P2TQ-WX7V-3RHD`; common look-alikes (O/0, I/L/1) are normalized |

Response `200` - the pairing payload (`PairingPayload` in `internal/api/qr.go`):

```json
{
  "server_name": "AudioSilo",
  "base_url": "https://books.example.com",
  "pairing_token": "3vJx0eKQm9WZbT5nR8sHc2fLdA7yUqPgVi4oXk1NwsE",
  "uri": "audiosilo://connect?server=https%3A%2F%2Fbooks.example.com&token=3vJx0eKQ…",
  "web_url": "https://books.example.com/web/connect?token=3vJx0eKQ…",
  "qr_png_data_uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg…",
  "links": {
    "web": "https://books.example.com/web",
    "admin": "https://books.example.com/admin"
  },
  "code_expires_at": "2026-07-04T09:30:00Z",
  "uses_remaining": 5
}
```

`pairing_token` is **as redeemable as the code that minted it**: redeemed from
an invite it inherits the invite's remaining uses and expiry (one QR can pair
several devices, each exchange claiming one use); redeemed from a recovery code
it lasts 10 minutes (multi-scan within that window, since recovery codes are
unlimited). Complete it with `/auth/exchange`. `code_expires_at` and
`uses_remaining` describe the parent invite's budget (advisory - concurrent
exchanges may consume uses after the redeem); both are omitted for recovery
codes and unlimited invites. `web_url` is what the QR encodes (opens the native
app via Universal/App Links on claimed domains, else the embedded web player);
`uri` is the custom-scheme equivalent for an explicit "Open in app" action.
`links.ios`/`links.android` (store links) are omitted until the store apps ship.
`base_url` honors the configured `public_url`, falling back to the request host.

| Status | Meaning |
|---|---|
| `400` | `code` missing |
| `401` | invalid or expired auth code (also: code owner disabled/deleted - a rejected attempt never burns a use) |
| `429` | redeem lockout tripped |

### `POST /api/v1/auth/exchange`

*Public.* Turns a pairing token into a durable, device-named session token.
This is where an invite use is claimed: a token minted by redeeming an invite
stays valid afterwards (governed by the invite's remaining uses and expiry, so
one QR can pair several devices), while a token from `/auth/pair` or the demo
flow is single-use and revoked on success. Shares the redeem rate limiter:
10 failed attempts per IP per 15 minutes.

| Field | Type | Required | Notes |
|---|---|---|---|
| `pairing_token` | string | yes | from `/auth/redeem`, `/auth/pair`, or a scanned QR |
| `device_name` | string | no | label shown in session listings, e.g. `"Pixel 9"` |

Response `200`:

```json
{
  "token": "Qm9WZbT5nR8sHc2fLdA7yUqPgVi4oXk1NwsE3vJx0eK",
  "server_id": "kx8Qz1c7m2Vw0aB3dEfGh",
  "user": {
    "id": 4,
    "username": "sam",
    "role": "user",
    "disabled": false,
    "has_password": false,
    "has_recovery": true,
    "is_demo": false
  }
}
```

`server_id` is the paired server's stable identity (see `GET /server`); the client
adopts it as the connection's id.

| Status | Meaning |
|---|---|
| `400` | `pairing_token` missing |
| `401` | `invite already used on all its devices - ask for a new invite` (the parent invite's use cap is spent) |
| `401` | `invite has expired - ask for a new invite` (the parent invite expired after the redeem) |
| `401` | `invalid or expired pairing token` (anything else: bogus/revoked token, single-use token already exchanged, code owner disabled) |
| `429` | redeem lockout tripped |

A refused exchange never burns an invite use.

### `POST /api/v1/auth/login`

*Public.* Username/password login. Only works for accounts that have a password
(admins always do; regular users may be pairing-only). Rate-limited: 10 failed
attempts per IP per 15 minutes.

| Field | Type | Required |
|---|---|---|
| `username` | string | yes |
| `password` | string | yes |
| `device_name` | string | no |

Response `200`: `{ "token": "…", "user": { … } }` - same shape as
`/auth/exchange`.

| Status | Meaning |
|---|---|
| `401` | invalid credentials (also returned for disabled or password-less accounts - deliberately indistinguishable) |
| `429` | login lockout tripped |

### `POST /api/v1/auth/pair`

*Session.* Issues a fresh pairing payload for the calling user - "add another
device" from an existing session. No request body. Response `200`: a
`PairingPayload` (same shape as `/auth/redeem`).

### `POST /api/v1/auth/logout`

*Session.* Revokes the token used to make the call. No body. Response: `204 No
Content`.

### `GET /api/v1/me`

*Session.* The authenticated account, reloaded so the derived fields are fresh:

```json
{
  "id": 4,
  "username": "sam",
  "role": "user",
  "disabled": false,
  "has_password": true,
  "has_recovery": false,
  "is_demo": false,
  "last_seen_at": "2026-07-02T08:15:00Z"
}
```

`last_seen_at` is derived from the account's most recent token activity and is
omitted when there is none. `role` is `"admin"` or `"user"`.

## Self-service account

The routes in this section, together with the [API keys](#personal-api-keys)
below, share one rate limit (10 attempts per IP per 15 minutes) and are
**refused for demo accounts** (403), so a throwaway session can't mint a durable
credential.

### `POST /api/v1/auth/password`

*Session.* Set or change your own password.

| Field | Type | Required | Notes |
|---|---|---|---|
| `password` | string | yes | the new password; empty is rejected (clearing a password is admin-only) |
| `current_password` | string | conditional | required only when the account already has a password |

Response: `204 No Content`.

| Status | Meaning |
|---|---|
| `400` | password missing or too short |
| `401` | `current_password` incorrect |
| `403` | demo account |
| `429` | account-mutation limit tripped |

### `POST /api/v1/auth/recovery`

:::caution Legacy - being retired
The frontend player no longer offers recovery codes; it nudges users to set a
password and relies on the reconnect flow instead. This endpoint (and the two
recovery revoke routes below) is kept only so older app builds keep working, and
is slated for removal once those clients age out. New clients should not call it.
:::

*Session.* Mints (or replaces) the caller's durable **recovery code** - an auth
code with unlimited uses and no expiry, owned by the user, redeemable through
the normal `/auth/redeem` flow. Returned exactly once; only its hash is stored.

Response `201`:

```json
{ "recovery_code": "H7XD-4WQN-C9K2-TMPV" }
```

`403` for demo accounts, `429` on the shared limit.

### `DELETE /api/v1/auth/recovery`

*Legacy (see above).* *Session.* Removes the caller's recovery code (no-op if
none). Response: `204 No Content`.

## Personal API keys

User-minted, **non-expiring** bearer credentials ("API keys") for headless
integrations - dashboards, cron jobs, monitoring. A key authenticates on any
*Session* or *Session (media)* route exactly like a session token and **acts as
its owner**: an admin's key also passes *Admin* routes, a regular user's does
not. A pairing token is never accepted as a bearer credential, and an API key is
never valid for `/auth/exchange`. Revocation is the only lifecycle - a key never
expires. All three routes share the [self-service](#self-service-account) rate
limit (10 attempts per IP per 15 minutes) and are **refused for demo accounts**
(403).

**Containment.** A key cannot mint a *fresh durable credential*. A request that
authenticates with an API key is refused (**403**) on the four credential-minting
routes - `POST /auth/tokens` (another key), `POST /auth/recovery`,
`POST /auth/pair`, and `POST /auth/password` - so revoking a leaked key cuts off
everything it could reach: it can't spawn a key, recovery code, pairing token, or
password that would outlive its own revocation (mirrors GitHub's "a token cannot
create tokens"). It may still **list and revoke** keys and clear a recovery code,
since those only reduce access.

### `POST /api/v1/auth/tokens`

*Session.* Mints an API key and returns the secret **exactly once**.

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | string | yes | display name; trimmed, 1-100 characters |

Response `200`:

```json
{
  "token": "Qm9WZbT5nR8sHc2fLdA7yUqPgVi4oXk1NwsE3vJx0eK",
  "api_key": {
    "id": 3,
    "label": "Home dashboard",
    "created_at": "2026-07-08T14:02:11Z",
    "last_seen": null
  }
}
```

`token` is the bearer secret - only its SHA-256 hash is stored, so this is the
one time it appears. `api_key.last_seen` is `null` until the key first
authenticates a request.

| Status | Meaning |
|---|---|
| `400` | `label` missing/empty, or longer than 100 characters |
| `403` | demo account, or the caller is itself authenticating with an API key (containment - a key can't mint another) |
| `429` | account-mutation limit tripped |

### `GET /api/v1/auth/tokens`

*Session.* The caller's live (non-revoked) API keys, newest first - **metadata
only** (never the secret or its hash):

```json
{
  "api_keys": [
    {
      "id": 3,
      "label": "Home dashboard",
      "created_at": "2026-07-08T14:02:11Z",
      "last_seen": "2026-07-09T06:30:00Z"
    }
  ]
}
```

`403` for demo accounts; `429` on the shared limit.

### `DELETE /api/v1/auth/tokens/{id}`

*Session.* Revokes one of the caller's **own** API keys by id; it stops working
immediately. Response: `204 No Content`.

| Status | Meaning |
|---|---|
| `403` | demo account |
| `404` | no such API key for this caller (missing, already revoked, another user's, or not an API-key token id) |
| `429` | account-mutation limit tripped |

## Demo

### `POST /api/v1/demo/session`

*Public (gated on demo mode).* Provisions a throwaway demo account granted the
configured demo library and logs the caller straight in. Per-IP limited (5 per
15 minutes) and capped globally (`demo.max_users`, default 200 live accounts);
idle demo accounts are reaped in the background.

Request body (optional):

| Field | Type | Required | Notes |
|---|---|---|---|
| `device_name` | string | no | defaults to `"Demo"` |

Response `200` - a session **plus** a pairing payload so a phone can scan the
QR and join as the same demo user:

```json
{
  "token": "Qm9WZbT5nR8sHc2fLdA7yUqPgVi4oXk1NwsE3vJx0eK",
  "user": {
    "id": 91,
    "username": "demo_a3f19c02b7d4",
    "role": "user",
    "disabled": false,
    "has_password": false,
    "has_recovery": false,
    "is_demo": true
  },
  "pairing": { "server_name": "AudioSilo", "pairing_token": "…", "…": "…" }
}
```

| Status | Meaning |
|---|---|
| `404` | demo mode is not enabled |
| `429` | per-IP demo cap tripped |
| `500` | configured `demo.library` doesn't exist |
| `503` | demo is at capacity |

:::note Demo root redirect
When demo mode is enabled **and** the web player is mounted, `GET /` (the exact
site root only) responds `302 Found` → `/web/demo`, landing visitors on the
player's instant-demo screen. All other static routes (`/connect`, `/admin`, …)
are untouched.
:::

## Libraries & browsing

### `GET /api/v1/libraries`

*Session.* Libraries the caller can reach through any share (admins see all).

```json
{
  "libraries": [
    {
      "id": 1,
      "name": "Audiobooks",
      "root": "/srv/audiobooks",
      "default_view": "hybrid",
      "sort_order": 0
    }
  ]
}
```

### `GET /api/v1/libraries/{id}/fs`

*Session.* The filtered filesystem view - the real directory tree, scoped to
the caller's share rules, requiring no prior indexing. Lists **audio files and
directories only** (covers/NFOs are filtered out so every entry is actionable),
with indexed-book metadata attached where available. Offset-paginated.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `path` | string | `""` (library root) | directory to list, relative to the root |
| `offset` | int | `0` | |
| `limit` | int | `200` | values ≤ 0 or > 500 fall back to 200 |

```json
{
  "path": "Brandon Sanderson/Mistborn",
  "entries": [
    {
      "name": "The Final Empire",
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "is_dir": true,
      "is_audio": false,
      "size": 0,
      "mod_time": 0,
      "is_book": true,
      "title": "The Final Empire",
      "author": "Brandon Sanderson",
      "series": "Mistborn",
      "series_index": 1,
      "duration": 88347.4
    }
  ],
  "total": 3,
  "offset": 0
}
```

`next_offset` is present when more entries remain. The book annotation fields
(`is_book`, `title`, `author`, `series`, `series_index`, `duration`) are
omitted for plain directories/files; `override` (`"book"` or `"collection"`)
appears when an explicit folder-detection override is set (admin concern - see
[Scanner](../scanner.md)). Dotfiles are hidden; directories sort before files.

| Status | Meaning |
|---|---|
| `400` | invalid library id, or `path` escapes the root |
| `403` | no share grants this library |
| `404` | directory not found |

### `GET /api/v1/libraries/{id}/books`

*Session.* The computed view from the index, scoped to the caller's shares.
Keyset-paginated (see [conventions](index.md#pagination)).

| Query param | Type | Default | Notes |
|---|---|---|---|
| `author` | string | - | exact-match filter |
| `series` | string | - | exact-match filter |
| `sort` | string | `author` | `author` \| `title` \| `recent` (`recent` = newest `added_at` first) |
| `limit` | int | `50` | ≤ 0 or > 200 falls back to 50 |
| `cursor` | string | - | opaque cursor from a previous page's `next_cursor` |

```json
{
  "books": [
    {
      "id": 412,
      "library_id": 1,
      "rel_path": "Brandon Sanderson/Mistborn/The Final Empire",
      "is_folder": true,
      "title": "The Final Empire",
      "author": "Brandon Sanderson",
      "series": "Mistborn",
      "series_index": 1,
      "narrator": "Michael Kramer",
      "duration": 88347.4,
      "format": "m4b",
      "codec": "aac",
      "size": 512847361,
      "added_at": "2026-05-14T09:12:44Z"
    }
  ],
  "next_cursor": "QnJhbmRvbiBTYW5kZXJzb24ANDEy"
}
```

Conditional book fields: `asin`/`isbn` appear only when known (attached via
[enrichment](#put-apiv1adminlibrariesidenrichment) or set by an
[admin edit](#patch-apiv1adminlibrariesidbook)); `codec` is omitted when never
probed; `added_at` when unknown.

Metadata fields (`title`, `author`, `narrator`, `series`, `series_index`,
`asin`, `isbn`) and chapter titles carry the **effective** values: what the scan
found, with any admin metadata edits layered on top. The shape is unchanged; a
player simply sees the edited value. The same holds for every book-shaped
response, search, the `/fs` annotations and the export.
List responses omit `files`, `chapters`, and `direct_playable` (single-book
responses include them). `next_cursor` is omitted on the last page. Invalid
cursor → `400`.

### `GET /api/v1/search`

*Session.* Full-text search (FTS5 over title/author/series/narrator) across
every library the caller can reach, scoped per-library to their share rules.
Results are relevance-ranked and de-duplicated across libraries. De-dup keeps
the best copy of a book: format tier first (M4B/AAC over MP3 over anything
else), then single-file over multipart, then higher bitrate, then library
order (`internal/catalog/dedup.go`).

| Query param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | - | alphanumeric tokens are AND-ed with prefix matching; empty/symbol-only queries return no results |
| `limit` | int | `50` | ≤ 0 or > 200 falls back to 50 |

Response `200`: `{ "books": [ … ] }` - Book objects as in `/books`, plus the
de-duplication annotations:

| Field | Type | Notes |
|---|---|---|
| `dedup_key` | string | groups copies of the same logical book; a display hint, **not** an identity |
| `multi_file` | bool | whether this copy is multipart |
| `other_locations` | array | the best copy in each **other** library, one entry per library (copies in the winner's own library are omitted): `{ library_id, library_name, path, format?, size?, multi_file? }` |

### `GET /api/v1/books/recent`

*Session.* Most recently added books across **all** accessible libraries,
merged and de-duplicated (same annotations as `/search`), newest `added_at`
first - one call for a "recently added" shelf.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | `50` | ≤ 0 or > 200 falls back to 50 |

Response `200`: `{ "books": [ … ] }`.

## Books & content

These endpoints resolve `(library, path)` to a book via the index, **indexing
on demand** if the background scan hasn't reached the path yet - so a freshly
added book is playable immediately.

### `GET /api/v1/libraries/{id}/item`

*Session.* Full book detail for a path.

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes |

Response `200` - a Book including files, chapters, and playability:

```json
{
  "id": 412,
  "library_id": 1,
  "rel_path": "Brandon Sanderson/Mistborn/The Final Empire",
  "is_folder": true,
  "title": "The Final Empire",
  "author": "Brandon Sanderson",
  "series": "Mistborn",
  "series_index": 1,
  "narrator": "Michael Kramer",
  "duration": 88347.4,
  "format": "m4b",
  "codec": "aac",
  "size": 512847361,
  "added_at": "2026-05-14T09:12:44Z",
  "files": [
    {
      "rel_path": "Brandon Sanderson/Mistborn/The Final Empire/The Final Empire.m4b",
      "seq": 0,
      "duration": 88347.4,
      "format": "m4b",
      "size": 512847361
    }
  ],
  "chapters": [
    {
      "index": 0,
      "title": "Chapter 1",
      "file_index": 0,
      "file_path": "Brandon Sanderson/Mistborn/The Final Empire/The Final Empire.m4b",
      "start": 0,
      "end": 1843.2,
      "book_offset": 0
    }
  ],
  "direct_playable": true
}
```

`direct_playable` reports whether the codec plays natively in browsers (unknown
codec ⇒ `true`; the client falls back to `?transcode=1` if direct playback
fails). Durations/positions are seconds (float).

| Status | Meaning |
|---|---|
| `400` | missing `path` / invalid library id |
| `403` | path outside the caller's share scope |
| `404` | `no book at that path` (not indexable) |

### `GET /api/v1/libraries/{id}/chapters`

*Session.* A book's normalized playable units. Every chapter carries
`file_path` - the actual audio file to stream - plus its in-file `start`/`end`
and `book_offset` on the whole-book timeline, so single-file m4b chapters and
multi-file mp3 parts render identically.

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes | 

```json
{
  "library_id": 1,
  "path": "Brandon Sanderson/Mistborn/The Final Empire",
  "duration": 88347.4,
  "is_folder": true,
  "files": [
    {
      "rel_path": "Brandon Sanderson/Mistborn/The Final Empire/The Final Empire.m4b",
      "seq": 0,
      "duration": 88347.4,
      "format": "m4b",
      "size": 512847361
    }
  ],
  "chapters": [
    {
      "index": 0,
      "title": "Chapter 1",
      "file_index": 0,
      "file_path": "Brandon Sanderson/Mistborn/The Final Empire/The Final Empire.m4b",
      "start": 0,
      "end": 1843.2,
      "book_offset": 0
    }
  ],
  "codec": "aac",
  "direct_playable": true
}
```

Same status codes as `/item`.

### `GET /api/v1/libraries/{id}/meta`

*Session.* Community metadata enrichment for a book - a description, production
details, and the series it belongs to - composed server-side from the community
metadata API ([meta.audiosilo.app](https://meta.audiosilo.app)) and cached. The
path is authorized against the caller's share scope exactly like `/item`. Gated
by the `metadata` [capability](#get-apiv1server): when it is false the route
returns 404, so a client that honours the flag never calls this.

The server resolves the book's `asin`/`isbn` (the effective fields on the
indexed book: backfilled by the manager into `book_enrichment`, or set by an
admin edit, which wins), looks the recording up
upstream, and folds the matched recording plus up to three series rails (one per
reading-order family - see [Reading-order families](#reading-order-families)) into
one envelope. Every series-rail entry carries its own `web_url`, so a client links
to the metadata site without ever building a URL itself.

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes |

Response `200` on a match:

```json
{
  "matched": true,
  "work": {
    "id": "the-martian",
    "title": "The Martian",
    "subtitle": "",
    "authors": [{ "id": "andy-weir", "name": "Andy Weir" }],
    "language": "en",
    "first_published": "2011",
    "description": "An astronaut is stranded on Mars…",
    "characters": [
      {
        "id": "mark-watney",
        "name": "Mark Watney",
        "aliases": ["The Martian"],
        "role": "protagonist",
        "reveal": { "chapter": 1 },
        "description": "The stranded astronaut, an engineer-botanist…"
      }
    ],
    "recaps": [
      {
        "through": { "chapter": 6 },
        "scope": "book",
        "text": "Watney has survived the storm and taken stock of Hab…"
      }
    ],
    "recap_summary": {
      "in_short": "A botanist is left behind on Mars and has to keep himself alive…",
      "ending": "The Ares 3 crew slingshots back and catches him mid-intercept…"
    }
  },
  "recording": {
    "id": "podium-2013",
    "narrators": [{ "id": "r-c-bray", "name": "R. C. Bray" }],
    "abridged": false,
    "runtime_min": 634,
    "release_date": "2013-03-22",
    "publisher": "Podium Audio",
    "cover_url": "https://…"
  },
  "series": [
    {
      "id": "wandering-earth",
      "name": "The Wandering Earth",
      "position": "1",
      "works": [
        {
          "id": "the-martian",
          "title": "The Martian",
          "position": "1",
          "authors": [{ "id": "andy-weir", "name": "Andy Weir" }],
          "cover_url": "https://…",
          "web_url": "https://meta.audiosilo.app/work?id=the-martian"
        }
      ]
    }
  ],
  "web_url": "https://meta.audiosilo.app/work?id=the-martian"
}
```

`work` is always present on a match; `recording` and `series` are omitted when
the upstream has none, and every `omitempty` string/number field (`subtitle`,
`first_published`, `description`, `abridged`, `runtime_min`, `release_date`,
`publisher`, `cover_url`) is dropped when empty. `series[].position` is this
work's position in that series; `series[].works` is the full ordered rail,
**including the current work** (the client filters it out before drawing a "more
in this series" row). Positions are strings ("1", "2.5", "1-3.5").

#### Reading-order families

Some series come in more than one reading order: a **primary** series (usually
publication order) plus **variant** series whose `ordering_of` names it - a
chronological order, the author's recommended order (metaserve's artifact
`schema_version` 7 fields; see the [metadata API](../../meta/api.md)). A primary
and its variants are one **ordering family**. The server collapses each family the
work belongs to into **one** rail rather than one rail per order (`seriesRails` /
`familyMains` in `internal/meta/service.go`):

- **Family key** is a membership's `ordering_of`, or its own `id` when that is
  empty.
- **Main view.** The rail's top-level `id`, `name`, `position` and `works` are the
  family's main view: the primary whenever the work is in it, else the variant that
  holds it (a book only a chronological order places keeps that order, the only one
  that places it). The choice reads `ordering_of` rather than trusting the
  upstream's membership order.
- **Alternates.** The family's other orders ride along in `orderings[]`, in
  metaserve's family order (primary first, then variants by id), the main view
  excluded. Each is fetched from the upstream `series/{id}`, at most two per family
  (`maxOrderingAlternates`), and every main view is fetched before any alternate, so
  a slow upstream under the compose deadline costs alternates, never rails.
- **The three-rail cap counts families** (`maxSeriesRails`), not series, so a work
  in "Narnia" and "Narnia (Chronological)" spends one slot. One enrichment issues at
  most 3 x (1 + 2) series requests.
- **Failures are partial, not fatal.** A failed alternate ships the rail without
  it; like a failed rail, it makes the envelope partial, which is cached for the
  2-minute transport-error TTL rather than 24 h, so the missing order reappears soon.

The extra fields are additive and `omitempty`:

```json
{
  "id": "narnia",
  "name": "The Chronicles of Narnia",
  "position": "1",
  "ordering": "publication",
  "works": [ ... ],
  "orderings": [
    {
      "id": "narnia-chronological",
      "name": "The Chronicles of Narnia (Chronological)",
      "ordering": "chronological",
      "ordering_of": "narnia",
      "position": "2",
      "works": [ ... ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `ordering` | the main view's reading order (`publication`, `chronological`, `recommended`), omitted when unstated |
| `ordering_of` | set only when the main view is itself a variant: the primary's id, so a client keys the family as `ordering_of \|\| id` |
| `orderings[]` | the alternate views: `{id, name, ordering?, ordering_of?, position?, works}`; `works` entries have exactly the rail's `works` shape |
| `orderings[].position` | this work's position in that order - **empty** when that order does not place the work at all |

**Why server-side:** shipped native players lag the server. A player that predates
reading orders reads only the top-level view, so it now sees one rail per family in
the primary order - and its "previous books" catch-up can no longer offer a
chronological order's earlier books (The Magician's Nephew, before The Lion, the
Witch and the Wardrobe) as books to catch up on. Against a metaserve that sends no
ordering fields every series is its own family and the rails are exactly what they
were before, with one exception: a work listed at two positions of one series is
now one rail, at its first position.

`work.characters`, `work.recaps` and `work.recap_summary` are the community
**expressive layer** (the CC BY-SA content, spoiler-tagged and position-keyed);
all three are `omitempty`, so they are absent when the upstream has none. A
**position** is
`{ "chapter": <int >= 0> }` on the work's own, edition-independent timeline (the
logical work chapter, 1-based; `0` = front matter / prior-book knowledge), which
the client maps onto its recording's chapters.

- Each **character** carries an `id` (unique within the work, not global), a
  `name`, optional `aliases` and `role` (`protagonist`/`antagonist`/`supporting`/
  `minor`), a `reveal` position (where the character is first disclosed - the
  spoiler gate), and an own-words `description`. Recurring characters are
  re-described per book (Kindle-X-Ray style), so a client reveals only up to
  where the listener is.
- Each **recap** carries a `through` position (safe to show once the listener has
  finished that chapter), an optional `scope` (`book` or `series` - a
  `chapter: 0` + `series` recap is the "previously, in earlier books" summary),
  and own-words `text`.
- **`recap_summary`** is the whole-book refresher, not keyed to a position:
  `{ "in_short": …, "ending": … }`, both fields `omitempty`. `in_short` is a
  spoiler-light "what this book is" summary a client can show up front; `ending`
  is **by construction a full spoiler** and must only be revealed deliberately
  (the player shows it once the book is finished, or behind an explicit tap on a
  previous book). The whole object is omitted when the work has neither, and an
  all-blank upstream object is never emitted.

These fields are additive: they are passed straight through from the upstream
`GET /works/{id}` (see the [three-repo seam](../../architecture/cross-repo-contract.md)),
not composed or reshaped like `recording`/`series`. The one field the server
drops is the character cross-reference (`xref`) - it is not exposed to clients. A
client that ignores these fields is unaffected.

When the book has neither an `asin` nor an `isbn`, or the upstream reports no
match, the response is `200 { "matched": false }` - a normal, non-error result
that the client treats as "nothing to show":

```json
{ "matched": false }
```

| Status | Meaning |
|---|---|
| `200` | `{ "matched": true, … }` on a match, or `{ "matched": false }` when there is nothing to show |
| `400` | missing `path` / invalid library id |
| `403` | path outside the caller's share scope |
| `404` | `no book at that path`, **or** metadata lookup is disabled on this server (`metadata` capability false) |
| `502` | `metadata service unavailable` - the upstream was unreachable or errored |

### `GET /api/v1/meta/work`

*Session.* One community **work** document by its metadata-database id, with no
book, library, or path involved. This is what the player uses to catch a listener
up on the **earlier books of a series**: the series rails returned by
`/libraries/{id}/meta` name works the caller may not own, so there is no path to
address them by.

| Query param | Type | Required |
|---|---|---|
| `id` | string | yes - the work id from a `series[].works[].id` (or `work.id`) |

The id rides in the **query string, not a path segment**, because metadata-site
work slugs are not guaranteed to be path-segment safe.

Unlike `/libraries/{id}/meta` this route is **plain authed, not scope-checked**:
a work id says nothing about what is on this server, so a scoped user may read
any work. It is gated by the same `metadata` [capability](#get-apiv1server) and
served from the same bounded cache as the enrichment lookups (its own `w:` key
space; 24 h positive / 1 h not-found / 2 min transport-error TTLs).

Response `200`:

```json
{
  "work": {
    "id": "the-martian",
    "title": "The Martian",
    "authors": [{ "id": "andy-weir", "name": "Andy Weir" }],
    "language": "en",
    "first_published": "2011",
    "description": "An astronaut is stranded on Mars…",
    "characters": [],
    "recaps": [],
    "recap_summary": { "in_short": "…", "ending": "…" }
  }
}
```

`work` is exactly the same shape as `work` inside the `/libraries/{id}/meta`
envelope (documented above, same `omitempty` rules) - there is deliberately no
second work type. The enrichment fields that only make sense for a matched local
book (`matched`, `recording`, `series`, `web_url`) are **not** returned here.

| Status | Meaning |
|---|---|
| `200` | `{ "work": … }` |
| `400` | `id is required` - the `id` param is missing or blank; `invalid id` - it is longer than 200 bytes or contains control characters |
| `404` | `no such work` - the upstream has no work with that id |
| `404` | `metadata lookup not enabled` - the lookup is off on this server |
| `502` | `metadata service unavailable` - the upstream was unreachable or errored |

## Streaming & media

Both routes take *media auth* (header **or** `?token=`) and are exempt from the
30 s request timeout. See [Media](../media.md) for serving internals.

### `GET /api/v1/libraries/{id}/stream`

*Session (media).* Streams one **audio file** by path. The path must be a real
file - a chapter's `file_path` or a `files[].rel_path` - never a book/folder
path.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `path` | string | required | library-relative audio file path |
| `download` | `1` | - | sets `Content-Disposition: attachment` so browsers save the file |
| `transcode` | `1` | - | re-encode to MP3 via ffmpeg for codecs browsers can't decode |
| `t` | float | `0` | with `transcode=1`: start the transcode this many seconds in |
| `token` | string | - | session token (media-auth fallback) |

Direct serving (default) supports HTTP **Range** (`206 Partial Content`) and
sets the audio `Content-Type` from the file. Transcoded output is MP3 and **not
byte-seekable** - no Range, no `Content-Length`; a client seeks by re-requesting
with a new `t`. The ffmpeg process is bound to the request, so disconnecting
kills it.

| Status | Meaning |
|---|---|
| `200` / `206` | file bytes (Range honored for direct serving) |
| `400` | missing `path` / path escapes the root |
| `401` | missing/invalid token |
| `403` | path outside the caller's scope |
| `404` | file does not exist |
| `503` | `transcode=1` but ffmpeg is not configured (check the `transcode` capability) |

### `GET /api/v1/libraries/{id}/cover`

*Session (media).* A book's cover for a path, first match wins:

1. a **custom cover** an admin uploaded
   ([`PUT /admin/libraries/{id}/cover`](#put-apiv1adminlibrariesidcover--delete-apiv1adminlibrariesidcover)),
   served from the database with `Cache-Control: private, no-cache` and an
   `ETag` (`"cover-<id>"`, derived from when the cover was stored), so a
   replaced cover shows up at once: a client revalidates, and a matching
   `If-None-Match` gets a `304` without the image being read from the
   database. Custom covers carry no `Last-Modified`, so a client that
   revalidates after the custom cover was removed can't get a `304` from an
   older sidecar file and keep showing the removed cover;
2. an indexed sibling cover file;
3. embedded art extracted from the book's primary audio file (served with
   `Cache-Control: private, max-age=86400`).

The path is authorized against the caller's share scope before any of the
three is tried, custom covers included.

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes |
| `token` | string | no (media-auth fallback) |

Response `200`: image bytes with the appropriate `Content-Type`; `404`
(`no cover`) when there is no custom cover, no cover file and no embedded art.

## Listening state

Per-user durable state, addressed by `(library, path)` - the **book** path.
Positions are seconds on the whole-book timeline. Every path-scoped route below
requires `?path=` and authorizes it against the caller's share scope (`400`
missing path, `403` out of scope apply throughout). Cross-book list routes
(`/me/…`) filter to paths the caller can *still* access, so state under a
revoked share isn't returned.

### `GET /api/v1/me/progress`

*Session.* All progress rows for the caller (offline-sync seed).

```json
{
  "progress": [
    {
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "position": 12043.6,
      "duration": 88347.4,
      "finished": false,
      "playback_speed": 1.25,
      "version": 7,
      "device_id": "pixel-9-sam",
      "updated_at": "2026-07-01T19:42:07Z"
    }
  ]
}
```

### `GET /api/v1/libraries/{id}/progress`

*Session.* Progress for one book. Response `200`:
`{ "progress": { … } }` - or `{ "progress": null }` when none exists.

### `PUT /api/v1/libraries/{id}/progress`

*Session.* Upserts progress with **last-write-wins** reconciliation: the newer
`updated_at` wins; `version` breaks exact-timestamp ties. A stale write is not
an error - the response returns the *effective stored* progress, so clients
converge.

| Body field | Type | Notes |
|---|---|---|
| `position` | float | seconds, whole-book timeline |
| `duration` | float | book duration as the client knows it |
| `finished` | bool | |
| `playback_speed` | float | values ≤ 0 are normalized to `1.0` |
| `version` | int | send the last version you saw; `0` lets the server assign (stored + 1) |
| `device_id` | string | free-form writer identifier |
| `updated_at` | string | RFC 3339; empty = server time. **This drives the merge** - send the real client-side write time when replaying offline queues |
| `library_id`, `path` | - | accepted but ignored; taken from the URL and `?path=` |

Response `200`: `{ "progress": { … } }` (the winning row).

### `GET /api/v1/libraries/{id}/bookmarks` · `POST /api/v1/libraries/{id}/bookmarks`

*Session.* List / add bookmarks for a book (`?path=` on both).

GET response: `{ "bookmarks": [ … ] }` (objects as below).

POST body: `{ "position": 4211.5, "note": "great line" }` (`note` optional).
Response `201` - the created bookmark **unwrapped**:

```json
{
  "id": 12,
  "library_id": 1,
  "path": "Brandon Sanderson/Mistborn/The Final Empire",
  "position": 4211.5,
  "note": "great line",
  "created_at": "2026-06-30T21:04:11Z"
}
```

### `DELETE /api/v1/bookmarks/{id}`

*Session.* Deletes one of the **caller's own** bookmarks by id (another user's
id is a silent no-op). Response: `204 No Content` (idempotent - no 404).

### `GET /api/v1/libraries/{id}/notes` · `POST /api/v1/libraries/{id}/notes`

*Session.* List / add free-form notes for a book (`?path=` on both).

POST body: `{ "position": 0, "body": "re-read ch. 12 for the foreshadowing" }`
(`position` optional). Response `201` - the created note unwrapped:

```json
{
  "id": 5,
  "library_id": 1,
  "path": "Brandon Sanderson/Mistborn/The Final Empire",
  "position": 0,
  "body": "re-read ch. 12 for the foreshadowing",
  "created_at": "2026-06-28T10:00:00Z",
  "updated_at": "2026-06-28T10:00:00Z"
}
```

GET response: `{ "notes": [ … ] }` (same object shape).

### `DELETE /api/v1/notes/{id}`

*Session.* Deletes one of the caller's own notes. `204 No Content`.

### `GET /api/v1/me/history`

*Session.* The caller's recent listening spans across all books, newest first.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | `100` | ≤ 0 or > 500 falls back to 100 |

```json
{
  "history": [
    {
      "id": 88,
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "from_pos": 11250.0,
      "to_pos": 12043.6,
      "started_at": "2026-07-01T19:20:00Z",
      "ended_at": "2026-07-01T19:42:07Z"
    }
  ]
}
```

### `GET /api/v1/libraries/{id}/history`

*Session.* History for one book (`?path=` required; `limit` as above).
Response: `{ "history": [ … ] }`.

### `POST /api/v1/libraries/{id}/history`

*Session.* Records a listening span (`?path=` required).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `from_pos` | float | no | span start position (seconds); not validated - defaults to `0` if omitted |
| `to_pos` | float | no | span end position; not validated - defaults to `0` if omitted |
| `started_at` | string | no | RFC 3339; defaults to server time |
| `ended_at` | string | no | RFC 3339; defaults to server time |

Response: `201 Created`, empty body.

### `GET /api/v1/me/favourites`

*Session.* The caller's favourites across all accessible libraries, newest
first, enriched from the index where a book exists at the path:

```json
{
  "favourites": [
    {
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "is_book": true,
      "title": "The Final Empire",
      "author": "Brandon Sanderson",
      "series": "Mistborn",
      "series_index": 1,
      "duration": 88347.4,
      "created_at": "2026-06-25T18:30:00Z"
    }
  ]
}
```

A favourite may also be a plain navigation folder - then `is_book` is `false`
and the book fields are empty (render it by its path leaf).

### `POST /api/v1/libraries/{id}/favourites` · `DELETE /api/v1/libraries/{id}/favourites`

*Session.* Heart / un-heart a path (`?path=` required on both; one favourite
per user+library+path). Both are idempotent. POST → `201 Created` (empty body);
DELETE → `204 No Content`.

## Admin: users & auth codes

All *Admin*. Plaintext codes/passwords are never retrievable after creation -
responses that include a code are the one time you see it.

### `GET /api/v1/admin/users`

All accounts, wrapped as `{ "users": [ … ] }`:

```json
{
  "users": [
    {
      "id": 4,
      "username": "sam",
      "role": "user",
      "disabled": false,
      "has_password": false,
      "has_recovery": true,
      "is_demo": false,
      "last_seen_at": "2026-07-02T08:15:00Z"
    }
  ]
}
```

### `POST /api/v1/admin/users`

Create an account.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | yes | |
| `password` | string | admins only | optional for non-admins (pairing-only accounts); required for `role: "admin"` |
| `role` | string | yes | `"admin"` or `"user"` |

Response `201`: the created user object. `409` `username already taken`
(`code: "username_taken"`) on a duplicate username; `400` with a specific message
on a validation failure - `admin_needs_password`, `password_too_short` (see
[error codes](index.md#error-envelope-and-status-conventions)).

### `GET /api/v1/admin/users/{id}`

One account plus everything the console needs to manage it:

```json
{
  "user": { "id": 4, "username": "sam", "role": "user", "disabled": false,
            "has_password": false, "has_recovery": true, "is_demo": false },
  "accessible_libraries": [ { "id": 1, "name": "Audiobooks", "root": "/srv/audiobooks",
                              "default_view": "hybrid", "sort_order": 0 } ],
  "shares": [ { "id": 2, "name": "Fantasy shelf", "description": "", "read_only": true,
                "paths": [ { "library_id": 1, "path": "Brandon Sanderson" } ] },
              { "id": 5, "name": "Library: Audiobooks", "description": "Whole library",
                "read_only": false, "whole_library_id": 1,
                "paths": [ { "library_id": 1, "path": "" } ] } ],
  "auth_codes": [
    {
      "id": 9,
      "label": "Invite for sam",
      "max_uses": 5,
      "uses": 1,
      "expires_at": "2026-07-03T10:00:00Z",
      "redeemed_at": "2026-07-02T11:20:31Z",
      "created_at": "2026-07-02T10:00:00Z"
    }
  ]
}
```

`shares` marks whole-library grants with `whole_library_id` (see
[`GET /admin/shares`](#get-apiv1adminshares)). `auth_codes` is **invite metadata only** (never the code itself, and never
recovery codes - recovery presence surfaces as `user.has_recovery`).
`expires_at` empty/omitted = no expiry; `max_uses: 0` = unlimited;
`redeemed_at` omitted = never redeemed. `404` if the user doesn't exist.

### `PATCH /api/v1/admin/users/{id}`

Edit an account in place - any subset of:

| Body field | Type | Notes |
|---|---|---|
| `role` | string | `"admin"` \| `"user"` |
| `password` | string | `""` clears the password (non-admins only) |
| `disabled` | bool | reversible lockout; disabling revokes nothing but blocks all token use |

Response `200`: the updated user object.

| Status | Meaning |
|---|---|
| `400` | admin must keep a password (`admin_needs_password`) / password too short (`password_too_short`) |
| `404` | user not found |
| `409` | would demote/disable the last enabled admin (`last_admin`) |

### `DELETE /api/v1/admin/users/{id}`

Permanently deletes an account and **all** its durable state (sessions, auth
codes, progress, bookmarks, notes, history, share grants) via cascade; files on
disk are untouched. Response: `204 No Content`.

| Status | Meaning |
|---|---|
| `400` | self-delete refused (disable your own account instead) - `cannot_delete_self` |
| `404` | user not found |
| `409` | last enabled admin - `last_admin` |

### `POST /api/v1/admin/users/{id}/authcode`

Mints an invite code for a user. Minting atomically **supersedes** the user's
other still-redeemable invites (one active invite per user; spent/expired ones
remain as history). Body optional:

| Body field | Type | Default | Notes |
|---|---|---|---|
| `label` | string | `""` | display label |
| `max_uses` | int | `5` | explicit `0` = unlimited (negative values are clamped to 0) |
| `ttl_days` | int | `1` | explicit `0` = never expires |

Response `201` - shown once:

```json
{
  "auth_code": "9M4K-P2TQ-WX7V-3RHD",
  "invite_url": "https://books.example.com/connect#code=9M4K-P2TQ-WX7V-3RHD",
  "max_uses": 5,
  "expires_at": "2026-07-03T10:00:00Z"
}
```

`max_uses` is the device limit the invite was given (`0` = unlimited) and
`expires_at` its expiry (RFC 3339, omitted when it never expires), so a client
shows the server's numbers rather than re-deriving them.

The code rides in the `invite_url` **fragment**, so it never reaches server
logs; the connect page auto-redeems it client-side.

### `DELETE /api/v1/admin/users/{id}/recovery`

*Legacy - being retired alongside `POST /auth/recovery` once old clients age
out.* Revokes a user's recovery code (the admin's only lever for a leaked one,
since recovery codes are not listable). No-op if none. `204 No Content`.

### `POST /api/v1/admin/authcodes/{id}/rotate`

Regenerates an existing invite's secret in place (the console's **Rotate**): the old
code dies, no new row is created, the use counter resets, and `max_uses` is
preserved with the expiry renewed for the invite's original window. In the same
transaction it retires the user's **other** still-redeemable invites, so the
rotated invite is their one active invite - rotating an expired (or used-up)
invite revives it as that one. No body. Response `200`: the same shape as
creation (`auth_code`, `invite_url`, `max_uses`, `expires_at`). `404` if the
invite doesn't exist.

### `DELETE /api/v1/admin/authcodes/{id}`

Revokes (deletes) an issued invite immediately. `204 No Content`.

### `GET /api/v1/admin/invites`

Every account's invite codes in one list (the console's People > Invites page),
newest first, wrapped as `{ "invites": [ … ] }`:

```json
{
  "invites": [
    {
      "id": 9,
      "label": "Invite for sam",
      "max_uses": 5,
      "uses": 1,
      "expires_at": "2026-07-03T10:00:00Z",
      "redeemed_at": "2026-07-02T11:20:31Z",
      "created_at": "2026-07-02T10:00:00Z",
      "user_id": 4,
      "username": "sam"
    }
  ]
}
```

Each entry is the same invite metadata as `auth_codes` in
[`GET /admin/users/{id}`](#get-apiv1adminusersid) plus the account it pairs
(`user_id`, `username`). It **never** includes the code itself (only its hash
is stored) and never lists recovery codes. `expires_at` / `redeemed_at` are
omitted when unset; `max_uses: 0` = unlimited. An empty server returns
`{ "invites": [] }`. `401` anonymous, `403` non-admin.

## Admin: libraries & shares

All *Admin*.

### `GET /api/v1/admin/libraries`

All libraries in display order, wrapped as `{ "libraries": [ … ] }` - the
library object of [`GET /api/v1/libraries`](#get-apiv1libraries) plus two
admin-only fields:

```json
{
  "libraries": [
    { "id": 1, "name": "Audiobooks", "root": "/srv/audiobooks",
      "default_view": "hybrid", "sort_order": 0,
      "book_count": 812, "available": true,
      "scan": { "running": false, "total": 812, "done": 812, "indexed": 812 } }
  ]
}
```

- `book_count` (int) - books indexed in the library.
- `available` (bool) - whether the root folder is reachable right now. It is
  `false` when the root is missing, unreadable, or doesn't answer within
  **2 seconds**; when it is an empty folder while books are still indexed
  under it (what an unmounted network share looks like); or when the last scan
  stopped at the [unavailable-root guard](../scanner.md#the-unavailable-root-guard)
  (a successful rescan clears that). A hung network mount can't stall the list:
  roots are probed in parallel, at most one probe per root runs at a time,
  each answer is cached for 15 seconds, and a probe already stuck past the
  timeout answers "not responding" at once for later requests.
- `scan` - the library's scan progress, the same object as
  [`GET /admin/libraries/{id}/scan`](#get-apiv1adminlibrariesidscan) (`running`,
  `total`, `done`, `indexed`, `unavailable` when set). The console polls this
  list - every second while any library is scanning - instead of each
  library's scan endpoint, which remains available.

### `POST /api/v1/admin/libraries`

Creates a library and kicks off an initial background scan (browsing via `/fs`
works immediately; the index fills in behind).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | unique |
| `root` | string | yes | **server-local** filesystem path (mount network shares first) |
| `default_view` | string | no | defaults to `"hybrid"` |

Response `201`: the created library. `409` `name already taken`
(`code: "name_taken"`).

### `PUT /api/v1/admin/libraries/order`

Sets display order from an ordered id list (position 0 first); ids not listed
keep their order. This order is also the final de-duplication tiebreaker between
otherwise-equal copies of the same book (see [`GET /api/v1/search`](#get-apiv1search)).

Body: `{ "ids": [2, 1, 3] }`. Response `200`: `{ "libraries": [ … ] }` in the
new order, in the same enriched shape as
[`GET /admin/libraries`](#get-apiv1adminlibraries) (with `book_count`,
`available` and `scan`).

### `PATCH /api/v1/admin/libraries/{id}`

Edits `name`, `root`, and/or `default_view` - empty/omitted fields keep their
current values (`sort_order` is managed via `/order`). Changing anything
triggers a background rescan. Response `200`: the updated library. `404` /
`409` as for create.

### `DELETE /api/v1/admin/libraries/{id}`

Removes the library and everything indexed under it (books, files, chapters,
FTS rows), and - by cascade - every user's state keyed to it: progress,
bookmarks, notes, listening history and favourites, plus its folder overrides,
enrichment, metadata edits, custom covers and any share path rules pointing into
it. Its whole-library grant
shares (`whole_library_id` = this library) are deleted too, unless one also
holds rules for another library, which it keeps granting. Audio files on disk are
untouched. `204 No Content`.

### `PUT /api/v1/admin/libraries/{id}/folder-override`

Forces how the auto-detector classifies a folder, then rescans. `?path=`
required (must resolve inside the root).

Body: `{ "mode": "collection" }` - `"book"` = the folder is one multi-file
book; `"collection"` = one book per file inside it.

Response `200`: `{ "status": "override set", "path": "…", "mode": "collection" }`.
`400` for any other mode; `404` library not found.

### `DELETE /api/v1/admin/libraries/{id}/folder-override`

Clears the override (back to auto-detection) and rescans. `?path=` required.
Response `200`: `{ "status": "override cleared", "path": "…" }`.

### `PUT /api/v1/admin/libraries/{id}/enrichment`

Attaches durable, path-keyed external identifiers to a book (used by the
desktop manager after matching a book against Audible/ISBN sources). Survives
rescans (every re-index of the book layers it back on); modifies no file on
disk. `?path=` required. An admin's own edit of `asin`/`isbn`
([`PATCH …/book`](#patch-apiv1adminlibrariesidbook)) wins over the enrichment
for that field; reverting the edit falls back to the enrichment.

| Body field | Type | Required |
|---|---|---|
| `asin` | string | at least one of the two |
| `isbn` | string | at least one of the two |

Response `200`: `{ "status": "enrichment set", "path": "…" }`.

### `GET /api/v1/admin/libraries/{id}/export`

Downloads the library's book list as a JSON **file**, in the envelope the
community metadata site ([meta.audiosilo.app](https://meta.audiosilo.app)) imports
on its Watching page - so a user can mark which entries of a series they own.
Advertised by the `export` [capability](#get-apiv1server).

Unlike every other endpoint this one answers with a file download rather than a
plain JSON body:

| Header | Value |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="audiosilo-<library-slug>-<YYYY-MM-DD>.json"` |

```json
{
  "format": "audiosilo-books",
  "version": 1,
  "source": "audiosilo-server",
  "server_version": "1.4.2",
  "library": { "id": 1, "name": "My Books" },
  "exported_at": "2026-09-21T10:00:00Z",
  "books": [
    {
      "title": "Die Trying",
      "authors": ["Lee Child"],
      "narrators": ["Dick Hill"],
      "series": "Jack Reacher",
      "series_position": "2",
      "asin": "B002V0QK4C",
      "isbn": "9780553505405",
      "runtime_min": 612,
      "chapters": 24
    }
  ]
}
```

**The file is meant to leave the server**, so it carries bibliographic facts
only. It contains **no path, size, codec, format or any other filesystem
detail** - not even the library's root.

Per-book notes:

- Every field except `title` is omitted when it is unknown or empty, so a
  sparsely-tagged library yields short entries rather than blank ones.
- `authors` / `narrators` are lists. The index stores one string per book, so it
  is split only where it clearly holds several names: on `;`, ` & ` and ` and `
  always, and on a comma **only** when every resulting part still has at least
  two words. That keeps suffixed names such as `Alexandre Dumas, pere` and
  surname-first forms such as `Dumas, Alexandre` whole.
- `series_position` is a string so half-positions survive: `2` for book two,
  `2.5` for a novella between books. Omitted when there is no position.
- `runtime_min` is the book's duration in whole minutes (rounded);
  `chapters` is the number of indexed chapters. Both are omitted when unknown.
- `asin` / `isbn` come from the book's identifiers, including any attached via
  [`PUT …/enrichment`](#put-apiv1adminlibrariesidenrichment).
- A multi-file (folder) book is **one** entry, and copies of the same book within
  the library collapse to one entry - the same grouping search and
  "recently added" de-duplicate on.

`404 { "error": "library not found" }` for an unknown library; `403` for a
non-admin caller; `401` unauthenticated. The bearer token must be sent in the
`Authorization` header (the media-only `?token=` fallback does not apply here).

```sh
curl -OJ -H "Authorization: Bearer $TOKEN" \
  https://books.example.com/api/v1/admin/libraries/1/export
```

### `POST /api/v1/admin/libraries/{id}/scan`

Starts a background rescan. Returns immediately: `202 Accepted`,
`{ "status": "scan started" }`. `404` library not found.

### `GET /api/v1/admin/libraries/{id}/scan`

Progress of the (possibly running) scan:

```json
{ "running": true, "total": 812, "done": 394, "indexed": 388 }
```

`unavailable` (bool, omitted when false) is `true` when the last finished scan
stopped at the [unavailable-root guard](../scanner.md#the-unavailable-root-guard),
so nothing was pruned.

A scan an admin request queues - `POST …/scan`, creating or editing a library
(`POST /admin/libraries`, `PATCH /admin/libraries/{id}`), setting or clearing a
folder override, or the setup wizard - is marked running before that request
returns, so a status poll made right after it reports `running: true` (with
`total`/`done` at `0` until discovery finishes).

### `GET /api/v1/admin/fs/dirs`

The add-library folder picker: the subfolders of an absolute path on the
**server's** filesystem. `?path=` is the folder to list; empty means the
filesystem root (`/`, or the working directory's drive on Windows).

```json
{
  "path": "/srv",
  "parent": "/",
  "dirs": [
    { "name": "audiobooks", "path": "/srv/audiobooks" },
    { "name": "Podcasts", "path": "/srv/Podcasts" }
  ]
}
```

- **Folders only**, never files - no sizes, owners or timestamps. Hidden
  (dot) folders are skipped; symlinks that resolve to folders are included.
- Sorted case-insensitively by name; `path` values are absolute, in the
  server's own path syntax, and `path` itself is the cleaned request path.
- `parent` is omitted at a filesystem root.
- At most **1,000** entries; `truncated: true` (otherwise omitted) when there
  were more.

| Status | Meaning |
|---|---|
| `400` | `path must be absolute` (`code: "path_not_absolute"`) - a relative `path` |
| `404` | `folder not found or not readable` (`code: "folder_unreadable"`) - missing, not a folder, or unreadable by the server (the OS error is not echoed) |
| `401` / `403` | anonymous / non-admin |

Bounds rationale: an admin can already point a library at any folder and then
browse it, so listing folder names reveals nothing new to that role.

### `GET /api/v1/admin/shares`

All shares (with their path rules and who has them):

```json
{
  "shares": [
    {
      "id": 2,
      "name": "Fantasy shelf",
      "description": "Sam's corner",
      "read_only": true,
      "paths": [ { "library_id": 1, "path": "Brandon Sanderson" } ],
      "member_ids": [4, 7]
    },
    {
      "id": 5,
      "name": "Library: Audiobooks",
      "description": "Whole library",
      "read_only": false,
      "paths": [ { "library_id": 1, "path": "" } ],
      "whole_library_id": 1,
      "member_ids": [4]
    }
  ]
}
```

A rule's `path: ""` means the whole library. `member_ids` lists the ids of the
users the share is granted to (`[]`, never `null`, when none). The single-share
`GET /admin/shares/{id}` does not carry it.

`whole_library_id` (omitted for ordinary shares) marks the shares a
whole-library grant ([`POST /admin/library-access`](#post-apiv1adminlibrary-access))
creates: the id of the library it grants whole. Clients list those as library
access rather than as named shares, by this field - not by the share's name or
rules (a share an admin fills with a whole library stays an ordinary share).
`GET /admin/shares/{id}` and the `shares` of
[`GET /admin/users/{id}`](#get-apiv1adminusersid) carry it too. Migration 0015
added the column and backfilled the existing `Library: <name>` grant shares.

### `POST /api/v1/admin/shares`

Creates a share, optionally with initial path rules (inserted atomically - a
bad rule rolls the whole thing back).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | unique |
| `description` | string | no | |
| `read_only` | bool | no | |
| `paths` | array | no | `[ { "library_id": 1, "path": "Brandon Sanderson" } ]` |

Response `201`: the full share (with `paths`). `409` `name already taken`
(`code: "name_taken"`).

### `GET /api/v1/admin/shares/{id}`

One share with its `paths`. `404` if missing.

### `PATCH /api/v1/admin/shares/{id}`

Updates share metadata. An empty `name` keeps the current one, but
`description` and `read_only` are **replaced with whatever the body says**
(send the full desired values). Path rules are *not* editable here - use the
`/paths` sub-routes. Response `200`: the updated share. `404` / `409`
(`name_taken`).

### `DELETE /api/v1/admin/shares/{id}`

Deletes the share; its path rules and user grants cascade. `204 No Content`.

### `POST /api/v1/admin/shares/{id}/paths` · `DELETE /api/v1/admin/shares/{id}/paths`

Adds / removes one path rule. Body for both:

| Body field | Type | Required | Notes |
|---|---|---|---|
| `library_id` | int | yes | |
| `path` | string | no | `""` = whole library |

Response: `204 No Content`. `400` when `library_id` is missing/zero.

### `POST /api/v1/admin/share-access` · `DELETE /api/v1/admin/share-access`

Grants / revokes a share to/from a user. Body:
`{ "user_id": 4, "share_id": 2 }`. Response: `204 No Content`.

### `POST /api/v1/admin/library-access`

Convenience sugar: grants a user an entire library by creating/granting a
whole-library share under the hood. Body:
`{ "user_id": 4, "library_id": 1 }`. Response: `204 No Content`.

The grant share is found by `whole_library_id` first, so it survives a library
rename; only an **unmarked** older share named `Library: <name>` is reused as a
fallback (and then marked). A share marked for a *different* library is never
reused - adding this library's rule to it would hand this library to everyone
who has that one. When such a share already holds the `Library: <name>` name (a
library was renamed and a new one took its old name), the new grant share is
named `Library: <name> (<library id>)` instead; the name is internal, since
clients show the library's own name. Errors: `404` for an unknown library;
`409` with `code: name_taken` only if even that name is taken.

## Admin: catalog

All *Admin*. The queries behind the admin console's Library and Book screens
(the screens themselves arrive in a later release; the API is in place). They
see **every** library (no share scoping) and address books by
`(library_id, path)` like everything else - the internal book id only ever
travels inside an opaque cursor.

Metadata edits are **overrides stored in the database**, keyed by path: no file
on disk is ever modified. Each edit is a lock - a rescan re-reads the file but
re-applies the edit in the same transaction, so the edited value is what players,
search and the export see until it is reverted. See
[Data model](../data-model.md#metadata-overrides-and-effective-values) for how
the layering works.

The overridable fields, with the rules a value must pass. Setting a field to
`""` is an edit too (the field is held blank, whatever the scan finds); to go
back to the scanned value, **revert** it instead.

| Field | Rule |
|---|---|
| `title` | required (cannot be emptied), at most 500 characters, no control characters |
| `author`, `narrator`, `series` | at most 500 characters, no control characters |
| `series_index` | a number from 0 to 100000 (`2`, `2.5`); stored in its shortest form, `""` for none |
| `published` | `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, and a real date |
| `description` | at most 20000 characters; line breaks and tabs kept, other control characters refused |
| `asin` | 10 letters or digits (uppercased) |
| `isbn` | an ISBN-10 or ISBN-13; hyphens and spaces are stripped, `x` uppercased |

Values are trimmed. `published` and `description` are admin-console fields only:
they appear in these endpoints but not on the player's book JSON.

Every field reports a **source**: `path` (a scanned value equal to what the
folder and file names yield), `tag` (any other scanned value - it came from the
file's embedded tags), `edited` (typed by an admin), `community` (accepted from
a community-metadata match, or an ASIN/ISBN attached through
[enrichment](#put-apiv1adminlibrariesidenrichment)), or `""` when the field has
no value. The scan does not store sources; `path` vs `tag` is worked out when
the book is read, by the same rule for every book, so a tag that happens to
match the folder name reads as `path`.

### `GET /api/v1/admin/books`

A page of books across every library, filtered, searched and sorted,
keyset-paginated over the chosen ordering (never OFFSET, so a deep page costs
what the first does).

| Query param | Type | Default | Notes |
|---|---|---|---|
| `library_id` | int | - | one library; a non-positive or non-integer id is `400` |
| `q` | string | - | full-text search over title/author/series/narrator, the same prefix matching as [`/search`](#get-apiv1search); punctuation-only input filters nothing |
| `author` · `series` · `narrator` | string | - | exact match on the effective value |
| `format` | string, repeatable | - | `?format=m4b&format=mp3`; at most 50 values |
| `codec` | string, repeatable | - | ffprobe codec name (`aac`, `mp3`, …); at most 50 values |
| `direct_playable` | `true`\|`false` | - | the book's codec plays in browsers (an unknown codec counts as playable) |
| `has_cover` | `true`\|`false` | - | a sibling image, embedded art or a custom cover |
| `has_chapters` | `true`\|`false` | - | **more than one** chapter (every single-part book has one) |
| `matched` | `true`\|`false` | - | the book has an ASIN or an ISBN |
| `edited` | `true`\|`false` | - | the book has a metadata or chapter-title edit |
| `min_duration` · `max_duration` | number (seconds) | - | inclusive bounds; `0` means no bound |
| `added_after` | date | - | inclusive lower bound on `added_at`: `YYYY-MM-DD` (used as is) or an RFC 3339 time (any offset; converted to UTC before comparing) |
| `added_before` | date | - | exclusive upper bound, same formats |
| `sort` | string | `title` | `title` \| `author` \| `series` \| `narrator` \| `added` \| `duration` \| `size` |
| `order` | string | `asc` | `asc` \| `desc` |
| `limit` | int | `60` | ≤ 0 or > 200 falls back to 60 |
| `cursor` | string | - | `next_cursor` from the previous page |

Text sorts are case-insensitive. The `author`, `series` and `narrator` sorts put
books with that field blank **last** (in ascending order) and break ties
sensibly: `author` sorts by author, then series, series position and title;
`series` by series, position, then title; `narrator` by narrator, then title.

A filter that can't be parsed (`has_cover=yes`, `min_duration=-1`,
`added_after=last week`, an unknown `sort` or `order`) is a `400` with a message
naming the parameter - it is never silently dropped, which would show an
unfiltered list as if it were filtered. More than 50 `format` or `codec` values
is a `400` too (`too many format or codec values`).

```json
{
  "books": [
    {
      "library_id": 1,
      "library_name": "Audiobooks",
      "path": "Andy Weir/The Martian",
      "is_folder": true,
      "title": "The Martian",
      "author": "Andy Weir",
      "narrator": "R. C. Bray",
      "series": "",
      "series_index": 0,
      "published": "2011",
      "duration": 38040.5,
      "format": "m4b",
      "codec": "aac",
      "direct_playable": true,
      "size": 304112640,
      "added_at": "2026-05-14T09:12:44Z",
      "has_cover": true,
      "custom_cover": false,
      "chapter_count": 27,
      "file_count": 1,
      "asin": "B00B5HZGUG",
      "isbn": "",
      "edited": true
    }
  ],
  "next_cursor": "eyJzIjoidGl0bGUiLCJ2IjpbIlRoZSBNYXJ0aWFuIl0sImlkIjo0MTJ9"
}
```

- Every field is always present (empty string / `0` / `false` when unknown).
  `path` is the book path (the player's `rel_path`).
- `custom_cover` - an admin uploaded a cover; `has_cover` includes it.
- `file_count` is `1` for a single-file book.
- The cursor names the ordering it was minted for: replaying it with another
  `sort` or `order` (or a malformed one) is `400 invalid cursor`. Changing the
  filters between pages is not detected, so restart from the first page when
  they change. `next_cursor` is omitted on the last page.

### `GET /api/v1/admin/books/facets`

The facet panel for the same filter parameters as
[`GET /admin/books`](#get-apiv1adminbooks) (`sort`, `order`, `limit` and
`cursor` don't apply). Each dimension is counted **with every other filter
applied but its own**, so a facet shows what each choice would give; `total` is
the count with all filters applied.

```json
{
  "total": 812,
  "libraries": [ { "library_id": 1, "count": 744 }, { "library_id": 2, "count": 68 } ],
  "formats": [ { "value": "m4b", "count": 701 }, { "value": "mp3", "count": 111 } ],
  "codecs": [ { "value": "aac", "count": 690 }, { "value": "mp3", "count": 111 }, { "value": "", "count": 11 } ],
  "direct_playable": { "yes": 806, "no": 6 },
  "has_cover": { "yes": 790, "no": 22 },
  "has_chapters": { "yes": 650, "no": 162 },
  "matched": { "yes": 401, "no": 411 },
  "edited": { "yes": 37, "no": 775 }
}
```

`formats` and `codecs` are ordered by count, largest first (a `""` value is a
book whose codec was never probed). The `q`, `author`, `series`, `narrator`,
duration and added-date filters apply to every dimension. `400` for an
unparseable filter, as for the list.

### `POST /api/v1/admin/books/bulk`

Applies the same field edit to many books in one transaction - **every book is
edited or none is**. Merging two spellings of an author is a bulk `set` of
`author` over their books.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `books` | array | yes | `[ { "library_id": 1, "path": "Andy Weir/Artemis" } ]`, at most 1000 |
| `set` | object | one of `set` / `revert` | field → value, for the fields above |
| `revert` | array | one of `set` / `revert` | field names to put back to what the scan found |
| `source` | string | no | `"edited"` (default) or `"community"` |

```json
{
  "books": [
    { "library_id": 1, "path": "Sanderson, Brandon/Elantris" },
    { "library_id": 1, "path": "Brandon Sanderson/Warbreaker" }
  ],
  "set": { "author": "Brandon Sanderson" }
}
```

Response `200`: `{ "updated": 2 }` - the number of distinct books edited
(entries naming the same library and path, after the path is cleaned, count
once).

| Status | Meaning |
|---|---|
| `400` | `books is required`; `nothing to change`; `invalid request` (malformed body or an unknown key); `code: "too_large"` for more than 1000 books; `code: "invalid_override"` with `field` for a value that fails its rule, or with `field: "chapters"` for any chapter edit (`chapter titles can only be edited one book at a time` - chapter indexes are per book) |
| `404` | `code: "book_not_found"` - one of the paths is not an indexed book (nothing was changed) |

A field cannot be both set and reverted in one request (`invalid_override`).
Reverting a field that has no edit is a no-op.

### `GET /api/v1/admin/authors` · `GET /api/v1/admin/narrators`

The distinct authors (or narrators) with their book counts and total duration,
plus spellings that look like the same person. `?library_id=` narrows to one
library (all libraries when absent; a non-positive or non-integer id is `400`).

```json
{
  "authors": [
    { "name": "Brandon Sanderson", "books": 14, "duration": 1204112.6 },
    { "name": "Sanderson, Brandon", "books": 2, "duration": 140221.0 }
  ],
  "merge_suggestions": [
    { "names": ["Brandon Sanderson", "Sanderson, Brandon"], "suggested": "Brandon Sanderson", "books": 16 }
  ],
  "unknown": 3
}
```

The narrators route uses the key `narrators` instead of `authors`.

- A name is the **whole** effective field value: a `Michael Kramer & Kate
  Reading` credit is one entry, matching the exact `narrator` filter and the bulk
  edit that act on it. Names sort case-insensitively.
- `unknown` counts books with the field blank (they are not listed).
- A merge suggestion groups names that compare equal once `Surname, Given` is
  turned round (only when the part before the comma is one word, so `Alexandre
  Dumas, pere` stays whole) and case, spacing and punctuation are ignored (so
  `J.R.R. Tolkien` and `J. R. R. Tolkien` group). `suggested` is the spelling
  with the most books (ties: alphabetical); `books` is the group's total. The
  server never merges on its own - applying a suggestion is a
  [bulk edit](#post-apiv1adminbooksbulk).

### `GET /api/v1/admin/series`

Every series with the books the server holds in it. `?library_id=` as for
authors.

```json
{
  "series": [
    { "name": "Mistborn", "author": "Brandon Sanderson", "books": 3,
      "duration": 284110.2, "positions": [1, 2, 3] }
  ]
}
```

`author` is the most common author among the series' books; `positions` lists
the distinct non-zero series positions held, ascending (so a client can mark the
gaps). Sorted case-insensitively by name. Books with no series are not counted.

### `GET /api/v1/admin/libraries/{id}/book`

Everything the console's book page shows about one book. `?path=` required (the
book path).

```json
{
  "book": { "library_id": 1, "path": "Andy Weir/The Martian", "title": "The Martian: Classroom Edition", "…": "the same object as a GET /admin/books row" },
  "description": "Six days ago, astronaut Mark Watney became one of the first people to walk on Mars.",
  "fields": {
    "title": { "value": "The Martian: Classroom Edition", "source": "edited", "scanned": "The Martian",
               "locked": true, "edited_by": "admin", "edited_at": "2026-10-03T09:30:12.48Z" },
    "author": { "value": "Andy Weir", "source": "tag", "scanned": "Andy Weir", "locked": false },
    "series_index": { "value": "", "source": "", "scanned": "", "locked": false },
    "asin": { "value": "B00B5HZGUG", "source": "community", "scanned": "", "locked": false }
  },
  "chapters": [
    { "index": 0, "title": "Sol 6", "scanned_title": "Chapter 1", "edited": true,
      "file_path": "Andy Weir/The Martian/The Martian.m4b", "start": 0, "end": 1843.2, "book_offset": 0 }
  ],
  "files": [
    { "path": "Andy Weir/The Martian/The Martian.m4b", "seq": 0, "duration": 38040.5,
      "format": "m4b", "codec": "aac", "size": 304112640, "bitrate": 63955 }
  ],
  "listeners": [
    { "user_id": 4, "username": "sam", "position": 12043.6, "duration": 38040.5,
      "finished": false, "updated_at": "2026-10-01T19:42:07Z" }
  ],
  "shares": [
    { "share_id": 2, "name": "Sci-fi shelf", "path": "Andy Weir" },
    { "share_id": 5, "name": "Library: Audiobooks", "path": "", "whole_library_id": 1 }
  ],
  "folder": { "path": "Andy Weir/The Martian", "override": "" },
  "indexed_at": "2026-10-03T09:12:01.33Z"
}
```

- `fields` carries **all nine** overridable fields (the example shows four).
  Each has the effective `value`, its `source`, the `scanned` value (what the
  scan found - the revert target), `locked` (an admin edit holds it), and for an
  edit `edited_by` (the username; omitted once that account is deleted) and
  `edited_at`. `series_index` is a string here (`"2.5"`, `""` for none).
- `chapters` - every chapter with its effective `title`, the `scanned_title`
  and whether an edit renames it.
- `files` - each audio file (a single-file book lists itself), with its own
  `codec` and a derived `bitrate` in bits per second (`0` when the duration is
  unknown).
- `listeners` - every user's progress on the path, most recent first.
- `shares` - each share whose rules include the path, with the rule that does
  (`path: ""` = the whole library).
- `folder` - the folder whose detection decides the book's shape (the book's
  own folder, or the folder a single-file book sits in; `""` = the library root)
  and its folder-detection `override` (`"book"`, `"collection"` or `""`).

| Status | Meaning |
|---|---|
| `400` | `invalid library id`; `path is required` (missing, or a path that cleans away to nothing) |
| `404` | `library not found`; `code: "book_not_found"` - no book is indexed at that path |

### `PATCH /api/v1/admin/libraries/{id}/book`

Sets or reverts metadata edits (and chapter titles) on one book, then returns
the updated book page - the same body as
[`GET …/book`](#get-apiv1adminlibrariesidbook). `?path=` required. Everything in
one request is applied in one transaction.

| Body field | Type | Notes |
|---|---|---|
| `set` | object | field → value, for the fields in the table above |
| `revert` | array | field names to put back to what the scan found |
| `source` | string | `"edited"` (default) or `"community"` (accepted from a [match](#get-apiv1adminlibrariesidbookmatch)) - recorded on every field this request sets |
| `chapters.set` | object | chapter index (as a string key) → new title; a title cannot be empty (revert it instead), at most 500 characters |
| `chapters.revert` | array | chapter indexes to put back to the scanned title |

```json
{
  "set": { "title": "The Martian: Classroom Edition", "published": "2011" },
  "revert": ["narrator"],
  "chapters": { "set": { "0": "Sol 6" }, "revert": [3] }
}
```

A revert restores the value from what the last scan stored - no rescan and no
disk access. Reverting an ASIN/ISBN falls back to any enrichment for it.

| Status | Meaning |
|---|---|
| `200` | the updated book page |
| `400` | `nothing to change` (empty body); `invalid request` (malformed JSON or an unknown key); `code: "invalid_override"` with a `field` key for an edit the server refuses - see below |
| `404` | `library not found`; `code: "book_not_found"` |

```json
{ "error": "asin: must be 10 letters or digits", "code": "invalid_override", "field": "asin" }
```

`invalid_override` covers an unknown field (`field` names it, e.g.
`cover_path`), a value that fails its rule, a field both set and reverted, a
`source` other than the two above (`field: "source"`), and chapter problems
(`field: "chapters"`: a chapter the book doesn't have, an empty title, one index
both renamed and reverted).

### `GET /api/v1/admin/libraries/{id}/book/match`

Community works a book might be, from the community metadata service, for the
console's match dialog. Requires the `metadata` [capability](#get-apiv1server).
`?path=` required.

| Query param | Type | Notes |
|---|---|---|
| `q` | string | free-text search, at most 300 characters |
| `asin` · `isbn` | string | look an identifier up directly, at most 20 characters each |

With none of the three, the server searches the book's own title and author and
looks up its own ASIN/ISBN. The identifier lookup and the text search run
concurrently; together they expand at most **6** hits into full works with their
recordings. Results are not cached (an admin action, so the fan-out is bounded
instead: work fetches share the same concurrency limit as `GET /meta/work`).

```json
{
  "candidates": [
    {
      "work_id": "the-martian",
      "title": "The Martian",
      "authors": [ { "id": "andy-weir", "name": "Andy Weir" } ],
      "language": "en",
      "first_published": "2011",
      "description": "Stranded.",
      "series": [],
      "cover_url": "https://meta.audiosilo.app/covers/the-martian.jpg",
      "web_url": "https://meta.audiosilo.app/work?id=the-martian",
      "recordings": [
        {
          "id": "rec1",
          "narrators": [ { "id": "r-c-bray", "name": "R. C. Bray" } ],
          "runtime_min": 634,
          "release_date": "2013-03-22",
          "publisher": "Podium Audio",
          "asins": ["B00B5HZGUG"],
          "isbns": ["9780553418026"]
        }
      ],
      "recording_id": "rec1",
      "score": 100
    }
  ]
}
```

- Sorted by `score` (0-100), best first. An identifier hit scores 100 and names
  the recording it resolved to in `recording_id`. Otherwise the score weighs
  title agreement (55), author (30) and runtime (15: within 3% of a recording's
  runtime counts fully, within 10% half); a fact the book or the work lacks is
  left out rather than counted as a mismatch.
- `series` lists each series once, at its main position (`{ "name", "position"
  }`); alternate reading orders are left out. `subtitle`, `language`,
  `first_published`, `description`, `cover_url`, `recording_id` and the
  recordings' optional fields are omitted when empty; `asins`/`isbns` are always
  arrays.
- No hits is `200 { "candidates": [] }`.

Accepting a candidate is two existing writes: attach its ASIN/ISBN with
[`PUT …/enrichment`](#put-apiv1adminlibrariesidenrichment), and apply the
fields you take from it with [`PATCH …/book`](#patch-apiv1adminlibrariesidbook)
and `source: "community"`.

| Status | Meaning |
|---|---|
| `400` | `query too long`; `invalid library id`; `path is required` |
| `404` | `code: "metadata_off"` - community metadata is turned off; `library not found`; `code: "book_not_found"` |
| `502` | `metadata service unavailable` - the community service could not be reached and nothing was found. Partial failures still return what was found: if the identifier lookup or the text search fails but the other found hits, those candidates are returned, and a candidate whose work fails to load is left out |

### `PUT /api/v1/admin/libraries/{id}/cover` · `DELETE /api/v1/admin/libraries/{id}/cover`

Uploads (`PUT`) or removes (`DELETE`) a book's **custom cover**. `?path=`
required. The `PUT` body is the raw image (any `Content-Type` header is
ignored; the type is sniffed from the bytes). The cover is stored in the
database - never in the library folder - so it is part of any database backup
and follows the book on a move. The ordinary
[cover endpoint](#get-apiv1librariesidcover) serves it ahead of the book's own
art.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" --data-binary @cover.jpg \
  "https://books.example.com/api/v1/admin/libraries/1/cover?path=Andy%20Weir/The%20Martian"
```

Responses `200`: `{ "status": "cover set", "path": "…" }` /
`{ "status": "cover removed", "path": "…" }`. Removing a cover that isn't there
is not an error.

| Status | Meaning |
|---|---|
| `400` | `could not read the image`; `invalid library id`; `path is required` |
| `404` | `library not found`; `code: "book_not_found"` (`PUT` only - the path must be an indexed book) |
| `413` | `code: "too_large"` - the image is larger than 5 MiB |
| `415` | `code: "unsupported_image"` - not a JPEG, PNG or WebP image |

## Admin: stats

### `GET /api/v1/admin/stats`

*Admin.* Powers the console dashboard: catalog totals, per-library counts, and
a cross-user "currently listening" feed (up to 200 rows, newest first; `title`/
`author` may be empty if the scan hasn't reached a path yet).

```json
{
  "total_books": 1284,
  "total_libraries": 2,
  "total_users": 5,
  "libraries": [
    { "id": 1, "name": "Audiobooks", "book_count": 1201 },
    { "id": 2, "name": "Kids", "book_count": 83 }
  ],
  "listening": [
    {
      "user_id": 4,
      "username": "sam",
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "title": "The Final Empire",
      "author": "Brandon Sanderson",
      "position": 12043.6,
      "duration": 88347.4,
      "finished": false,
      "updated_at": "2026-07-01T19:42:07Z"
    }
  ]
}
```

## Admin: settings

Runtime-toggleable server settings, surfaced in the console's **Overview**
section. The envelope is a feature-keyed object so future settings can join it
without reshaping the wire contract; today it carries only `metadata`.

### `GET /api/v1/admin/settings`

*Admin.* Returns the current runtime settings.

```json
{
  "metadata": {
    "enabled": true,
    "base_url": "https://meta.audiosilo.app",
    "available": true
  }
}
```

For `metadata`: `enabled` is the runtime on/off flag; `base_url` is the
configured metadata service URL (empty when none is set); `available` reports
whether the lookup **can** be enabled at all - true only when `base_url` is a
valid absolute `http(s)` URL. When `available` is false the feature is
permanently off until the server config gains a valid `base_url`, and any attempt
to enable it is rejected. The live `metadata` [capability](#get-apiv1server) is
`enabled && available`.

### `PATCH /api/v1/admin/settings`

*Admin.* Flips runtime settings and persists them to `config.yaml` (so the change
survives a restart). Send only the fields you want to change - an **absent field
is left unchanged**. Returns the same envelope as `GET` with the new state.

```json
{ "metadata": { "enabled": false } }
```

Setting `metadata.enabled` to `true` when the lookup is unavailable (no valid
`metadata.base_url`) is a **`400`** - configure `metadata.base_url` first.
Toggling the flag takes effect immediately across the server: it gates
`GET /libraries/{id}/meta` and the `metadata` capability, so every connected
player starts or stops showing the enriched-book section without a restart.

| Status | Meaning |
|---|---|
| `200` | updated; body is the current settings envelope |
| `400` | invalid body, or enabling metadata when no valid `metadata.base_url` is configured |
| `500` | the settings could not be persisted (the in-memory change is rolled back) |

## Well-known

Native deep-link association files. Both are *Public*, config-driven
(`app_links` in the YAML - see [Configuration](../configuration.md)), and
**404 when the relevant identifiers are unset** - clients then fall back to the
web player and the custom-scheme "Open in app" button.

### `GET /.well-known/apple-app-site-association`

iOS Universal Links. Served when `app_links.apple_app_ids` is configured; the
claimed paths are the pairing handoff and connect pages:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["ABCDE12345.app.audiosilo.player"],
        "components": [ { "/": "/web/connect*" }, { "/": "/connect*" } ]
      }
    ]
  }
}
```

### `GET /.well-known/assetlinks.json`

Android App Links. Served when `app_links.android_package` **and**
`app_links.android_sha256` are configured:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.audiosilo.player",
      "sha256_cert_fingerprints": ["14:6D:E9:83:C5:73:AB:31:0F:..."]
    }
  }
]
```

## First-run setup wizard

Only active when the launcher enabled it (`--setup` / `pkg/launcher`); a normal
headless deployment never exposes this surface. The wizard self-closes the
moment an admin exists. The one-time setup token rides in the page URL
**fragment** (`/setup#token=…`) so it never reaches server logs; the POST
verifies it in constant time. See [Web UI](../web-ui.md).

### `GET /setup`

*Public (gated).* Serves the wizard HTML. `404` when the wizard was never
enabled; `303 See Other` → `/admin` when enabled but an admin already exists.

### `POST /setup`

*Public (token-guarded).* Creates the first admin and the first library, then
starts a background scan.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | yes | the one-time setup token |
| `username` | string | no | defaults to `"admin"` |
| `password` | string | yes | admins must have a password |
| `library_name` | string | yes | |
| `library_root` | string | yes | must be an existing directory on the server |

Response `201`: `{ "user": { … }, "library": { … } }`.

| Status | Meaning |
|---|---|
| `400` | validation (missing library fields, folder doesn't exist, password rules) |
| `403` | invalid setup token |
| `409` | setup not available (already completed or never enabled) |

---

:::note Static UI routes
`internal/api/api.go` also mounts the baked-in static UI via `web.Register`:
`GET /` (connect page), `/connect`, `/admin`, `/assets/…`, `/favicon.ico`,
`/sw.js`, `/manifest.webmanifest`, and the web player at `/web/…` (when
configured). These are plain pages *over* the API - they hold no privilege of
their own and are documented in [Web UI](../web-ui.md), not here.
:::
