---
title: Endpoint reference
description: "Every route the server exposes: method, auth requirement, parameters, response envelope, and status codes - grouped by area."
---

The complete HTTP surface, derived from the route table in
`internal/api/api.go`. Conventions (auth, errors, pagination, rate limits) are
in the [API conventions](index.md) page and are not repeated per endpoint.

**Auth legend** - *Public*: no token. *Session*: bearer session token.
*Session (media)*: session token via header **or** `?token=` query parameter.
*Admin*: session token + `admin` role.

All `/api/v1` bodies and responses are JSON. Timestamps are RFC 3339. Remember
that empty list fields may serialize as `null`.

## Server & meta

### `GET /api/v1/server`

*Public.* Server identity and capability discovery - call this before anything
else and gate features on the flags.

```json
{
  "name": "AudioSilo",
  "version": "1.4.2",
  "api": "v1",
  "capabilities": {
    "admin_ui": true,
    "web_player": true,
    "transcode": true,
    "upload": false,
    "websocket": false
  },
  "auth": { "methods": ["auth_code", "password"] },
  "demo": { "enabled": false }
}
```

`version` is stamped from the release tag (`"dev"` for local builds).
`transcode` is true only when ffmpeg is configured; `web_player` only when the
`/web` mount is populated; `upload` and `websocket` are reserved for future
phases and currently always false.

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

Both mutating routes here share a rate limit (10 attempts per IP per 15
minutes) and are **refused for demo accounts** (403), so a throwaway session
can't mint a durable login.

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

*Session.* Mints (or replaces) the caller's durable **recovery code** - an auth
code with unlimited uses and no expiry, owned by the user, redeemable through
the normal `/auth/redeem` flow. Returned exactly once; only its hash is stored.

Response `201`:

```json
{ "recovery_code": "H7XD-4WQN-C9K2-TMPV" }
```

`403` for demo accounts, `429` on the shared limit.

### `DELETE /api/v1/auth/recovery`

*Session.* Removes the caller's recovery code (no-op if none). Response:
`204 No Content`.

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

Conditional book fields: `asin`/`isbn` appear only when known (tags or
enrichment); `codec` is omitted when never probed; `added_at` when unknown.
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

*Session (media).* A book's cover for a path: an indexed sibling cover file if
present, otherwise embedded art extracted from the book's primary audio file
(served with `Cache-Control: private, max-age=86400`).

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes |
| `token` | string | no (media-auth fallback) |

Response `200`: image bytes with the appropriate `Content-Type`; `404`
(`no cover`) when there is neither a cover file nor embedded art.

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

Response `201`: the created user object. `409` `username already taken` on a
duplicate username; `400` with a specific message on a validation failure (missing
admin password, password too short, …).

### `GET /api/v1/admin/users/{id}`

One account plus everything the console needs to manage it:

```json
{
  "user": { "id": 4, "username": "sam", "role": "user", "disabled": false,
            "has_password": false, "has_recovery": true, "is_demo": false },
  "accessible_libraries": [ { "id": 1, "name": "Audiobooks", "root": "/srv/audiobooks",
                              "default_view": "hybrid", "sort_order": 0 } ],
  "shares": [ { "id": 2, "name": "Fantasy shelf", "description": "", "read_only": true,
                "paths": [ { "library_id": 1, "path": "Brandon Sanderson" } ] } ],
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

`auth_codes` is **invite metadata only** (never the code itself, and never
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
| `400` | admin must keep a password / password too short |
| `404` | user not found |
| `409` | would demote/disable the last enabled admin |

### `DELETE /api/v1/admin/users/{id}`

Permanently deletes an account and **all** its durable state (sessions, auth
codes, progress, bookmarks, notes, history, share grants) via cascade; files on
disk are untouched. Response: `204 No Content`.

| Status | Meaning |
|---|---|
| `400` | self-delete refused (disable your own account instead) |
| `404` | user not found |
| `409` | last enabled admin |

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
  "invite_url": "https://books.example.com/connect#code=9M4K-P2TQ-WX7V-3RHD"
}
```

The code rides in the `invite_url` **fragment**, so it never reaches server
logs; the connect page auto-redeems it client-side.

### `DELETE /api/v1/admin/users/{id}/recovery`

Revokes a user's recovery code (the admin's only lever for a leaked one, since
recovery codes are not listable). No-op if none. `204 No Content`.

### `POST /api/v1/admin/authcodes/{id}/rotate`

Regenerates an existing invite's secret in place (the admin "Resend"): the old
code dies, no new row is created, and `max_uses` is preserved with the expiry
renewed for the invite's original window. No body. Response `200`:
`{ "auth_code": "…", "invite_url": "…" }` (same shape as creation). `404` if
the invite doesn't exist.

### `DELETE /api/v1/admin/authcodes/{id}`

Revokes (deletes) an issued invite immediately. `204 No Content`.

## Admin: libraries & shares

All *Admin*.

### `GET /api/v1/admin/libraries`

All libraries in display order, wrapped as `{ "libraries": [ … ] }` - the same
library object shape as [`GET /api/v1/libraries`](#get-apiv1libraries).

### `POST /api/v1/admin/libraries`

Creates a library and kicks off an initial background scan (browsing via `/fs`
works immediately; the index fills in behind).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | unique |
| `root` | string | yes | **server-local** filesystem path (mount network shares first) |
| `default_view` | string | no | defaults to `"hybrid"` |

Response `201`: the created library. `409` `name already taken`.

### `PUT /api/v1/admin/libraries/order`

Sets display order from an ordered id list (position 0 first); ids not listed
keep their order. This order is also the final de-duplication tiebreaker between
otherwise-equal copies of the same book (see [`GET /api/v1/search`](#get-apiv1search)).

Body: `{ "ids": [2, 1, 3] }`. Response `200`: `{ "libraries": [ … ] }` in the
new order.

### `PATCH /api/v1/admin/libraries/{id}`

Edits `name`, `root`, and/or `default_view` - empty/omitted fields keep their
current values (`sort_order` is managed via `/order`). Changing anything
triggers a background rescan. Response `200`: the updated library. `404` /
`409` as for create.

### `DELETE /api/v1/admin/libraries/{id}`

Removes the library and everything indexed under it (books, files, chapters,
FTS rows). Audio files on disk are untouched. `204 No Content`.

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
rescans; modifies no file on disk. `?path=` required.

| Body field | Type | Required |
|---|---|---|
| `asin` | string | at least one of the two |
| `isbn` | string | at least one of the two |

Response `200`: `{ "status": "enrichment set", "path": "…" }`.

### `POST /api/v1/admin/libraries/{id}/scan`

Starts a background rescan. Returns immediately: `202 Accepted`,
`{ "status": "scan started" }`. `404` library not found.

### `GET /api/v1/admin/libraries/{id}/scan`

Progress of the (possibly running) scan:

```json
{ "running": true, "total": 812, "done": 394, "indexed": 388 }
```

### `GET /api/v1/admin/shares`

All shares (with their path rules):

```json
{
  "shares": [
    {
      "id": 2,
      "name": "Fantasy shelf",
      "description": "Sam's corner",
      "read_only": true,
      "paths": [ { "library_id": 1, "path": "Brandon Sanderson" } ]
    }
  ]
}
```

A rule's `path: ""` means the whole library.

### `POST /api/v1/admin/shares`

Creates a share, optionally with initial path rules (inserted atomically - a
bad rule rolls the whole thing back).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | unique |
| `description` | string | no | |
| `read_only` | bool | no | |
| `paths` | array | no | `[ { "library_id": 1, "path": "Brandon Sanderson" } ]` |

Response `201`: the full share (with `paths`). `409` `name already taken`.

### `GET /api/v1/admin/shares/{id}`

One share with its `paths`. `404` if missing.

### `PATCH /api/v1/admin/shares/{id}`

Updates share metadata. An empty `name` keeps the current one, but
`description` and `read_only` are **replaced with whatever the body says**
(send the full desired values). Path rules are *not* editable here - use the
`/paths` sub-routes. Response `200`: the updated share. `404` / `409`.

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
