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
    "export": true,
    "meta_bundle": true,
    "browse_people": true,
    "cover_sizes": true,
    "next_book": true,
    "queue": true,
    "collections": true,
    "ratings": true,
    "progress_edit": true,
    "user_stats": true,
    "my_devices": true
  },
  "auth": { "methods": ["auth_code", "password"] },
  "demo": { "enabled": false }
}
```

`name` is the server's display name: the `name` key in `config.yaml`, which an
admin sets in the console's Settings > General (it can change while the server
runs); `"AudioSilo"` when unset.
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

The player-redesign data API (Phase 1a) adds four flags. An older server omits
them, so a client treats a missing flag as false and never sends the request it
gates:

| Flag | Value | Gates |
|---|---|---|
| `meta_bundle` | the same as `metadata` | the [`/meta`](#get-apiv1librariesidmeta) query params `include=previous` and `spoilers=hide` (an older server ignores both and sends the full envelope) |
| `browse_people` | always `true` | the browse lists [`/authors`, `/narrators`](#get-apiv1librariesidauthors--get-apiv1librariesidnarrators) and [`/series`](#get-apiv1librariesidseries), and the `narrator` filter on [`/books`](#get-apiv1librariesidbooks) |
| `cover_sizes` | always `true` | cover thumbnails, [`/cover?size=`](#get-apiv1librariesidcover) |
| `next_book` | always `true` | [`/next`](#get-apiv1librariesidnext), what to play after a book |

Phase 1b (the listener's own state and stats) adds six more, all always `true` on
a server that has them and absent on an older one:

| Flag | Value | Gates |
|---|---|---|
| `queue` | always `true` | [Up next](#up-next-collections-and-ratings): `/me/queue`, every method |
| `collections` | always `true` | [Collections](#get-apiv1mecollections): `/me/collections/**` and `/me/share-targets` |
| `ratings` | always `true` | [`/libraries/{id}/rating`](#get-apiv1librariesidrating) and [`/me/ratings`](#get-apiv1meratings) |
| `progress_edit` | always `true` | [`PATCH /libraries/{id}/progress`](#patch-apiv1librariesidprogress), and `started_at` / `finished_at` on the [progress](#get-apiv1meprogress) responses |
| `user_stats` | always `true` | [Your listening](#your-listening): `/me/stats`, `/me/listening` and `/me/goal` |
| `my_devices` | always `true` | [Your devices](#your-devices): `/me/devices` |

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
`server_name` is the server's display name, as `GET /server`'s `name`.

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
| `device_id` | string | no |

`device_id` is a random id the client keeps for itself across sign-ins (16 to
64 of `A-Z a-z 0-9 _ -`; anything else is ignored, as if absent). The server
stores only its SHA-256, on the session. A sign-in whose `device_id` an earlier
session of the same person already carried, signed out or not, is not
announced as a `new_device` [event](#get-apiv1adminevents); one without it
always is. The admin console sends one; players may adopt it. An admin signing
a session out (`DELETE /admin/devices/{id}`) forgets its `device_id` on every
session of that person, and a new password or a disabled account forgets all of
that person's, so the browser's next sign-in is announced again.

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

## Your devices

*Session.* Capability `my_devices`. The caller's own signed-in devices, the
player-side counterpart of the admin's
[`GET /admin/devices`](#get-apiv1admindevices): a device is a live session token
(a paired phone, a browser) or a personal API key, never a pairing token. These
routes only ever touch the caller's own tokens.

### `GET /api/v1/me/devices`

*Session.* The caller's live session and API-key tokens, most recently seen
first (`auth.ListDevices` for the caller).

```json
{
  "devices": [
    {
      "id": 57,
      "kind": "session",
      "name": "Pixel 9",
      "client": { "app": "AudioSilo", "version": "1.4.2", "platform": "android" },
      "created_at": "2026-07-02T11:20:31Z",
      "last_seen": "2026-10-04T19:41:56Z",
      "last_ip": "192.168.1.24",
      "current": true
    }
  ]
}
```

The fields are those of the [admin's device list](#get-apiv1admindevices)
without `user_id` and `username`: `kind` is `session` or `api`, `name` the device
name sent at sign-in (an API key's label), `client` the app the token last
reported (`null` until a request names one), `last_seen` the newest
authenticated request (`null` before any), `last_ip` that request's address, and
`current` marks the token making this request.

### `DELETE /api/v1/me/devices/{id}`

*Session.* Signs one of the caller's devices out by revoking its token. The
caller's other devices stay signed in.

```json
{ "current": false }
```

Revoking the **current** device is allowed (unlike the admin route's
`409 current_device`): the response says `"current": true`, and the token is
dead for every later request, so the client signs out locally. An API-key caller
may revoke too, since revoking only reduces access.

| Status | Meaning |
|---|---|
| `200` | revoked; `current` says whether it was the token making this request |
| `404` | `device not found` - not one of the caller's live session or API-key tokens: another user's, unknown, a pairing token or already revoked (never `403`, so the answer doesn't confirm that another user's token exists) |

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
[Scanner](../scanner.md)). `split_discs: true` marks a folder whose audio is
only in disc folders directly in it (`CD1`, `CD2`, ...), each indexed as its
own book, which a `book` override would join into one (see
[Joined books](../scanner.md#joined-books-disc-sets)); it is sent to **admin**
callers only and omitted otherwise, so the player's listing is unchanged.
Dotfiles are hidden; directories sort before files.

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
| `narrator` | string | - | exact-match filter on the whole narrator credit (`browse_people` capability; an older server ignores it and returns the unfiltered list) |
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
      "added_at": "2026-05-14T09:12:44Z",
      "published": "2006-07-17",
      "cover_color": { "bg": "#1d2a3a", "accent": "#e8a33c", "on_accent": "#000000" },
      "cover_version": "3f9a1c07be"
    }
  ],
  "next_cursor": "QnJhbmRvbiBTYW5kZXJzb24ANDEy"
}
```

Conditional book fields: `asin`/`isbn` appear only when known (attached via
[enrichment](#put-apiv1adminlibrariesidenrichment) or set by an
[admin edit](#patch-apiv1adminlibrariesidbook)); `codec` is omitted when never
probed; `added_at` when unknown. Every book response (lists, search, recent,
`/item`, `/next`) also carries, each omitted when empty:

| Field | Type | Notes |
|---|---|---|
| `published` | string | the publication date, `YYYY`, `YYYY-MM` or `YYYY-MM-DD`: the effective value from an [admin edit](#patch-apiv1adminlibrariesidbook) or an accepted community match |
| `cover_color` | object | the cover's palette, lowercase `#rrggbb`: `bg` is its dominant colour; `accent` a vibrant colour of the cover adjusted to a WCAG contrast of at least 4.5:1 against `bg`, and `on_accent` (`#ffffff` or `#000000`) the text colour on it. `accent` and `on_accent` are omitted together when the cover has no usable vibrant colour |
| `cover_version` | string | an opaque token (10 characters) for the cover art. Append it to a cover URL as `v=` so a client cache refetches a replaced cover |

`cover_version` is on every indexed book: a short hash of the book's cover art
identity (`books.cover_art`). That identity starts from index data alone (a custom
cover's upload time, else the book's mtime, size and sidecar path), so it moves
when a custom cover is uploaded or removed, when a re-index rewrites the book, and
when a move or a disc join carries a custom cover. It also moves **once** at the
book's first thumbnail of file art, to the version of the image itself (the
sidecar's or audio file's size and modification time), so from then on it follows
a sidecar overwritten in place, which leaves the index unchanged. A client may
therefore fetch a cover once more after its first thumbnail; it is a cache buster,
not a content hash.

`cover_color` is read from a thumbnail of the art (any
[`/cover?size=`](#get-apiv1librariesidcover) request or the console's
[`POST /admin/covers`](#post-apiv1admincovers)) and stored tagged with the
`cover_version` it was read for. It is sent only while that tag is the book's
current `cover_version`, so it appears after the first thumbnail of the current
art and disappears, without anything being cleared, when the art identity moves,
until the next thumbnail. The long `description` is not on list responses: only
[`/item`](#get-apiv1librariesiditem) reads and sends it.

Metadata fields (`title`, `author`, `narrator`, `series`, `series_index`,
`asin`, `isbn`) and chapter titles carry the **effective** values: what the scan
found, with any admin metadata edits layered on top. The shape is unchanged; a
player simply sees the edited value. The same holds for every book-shaped
response, search, the `/fs` annotations and the export.
List responses omit `files`, `chapters`, and `direct_playable` (single-book
responses include them). `next_cursor` is omitted on the last page. Invalid
cursor → `400`.

### `GET /api/v1/libraries/{id}/authors` · `GET /api/v1/libraries/{id}/narrators`

*Session.* The distinct authors (or narrators) of one library, with their book
counts and total duration - the player's browse lists (`browse_people`
capability). The same aggregate as the admin console's
[`/admin/authors`](#get-apiv1adminauthors--get-apiv1adminnarrators), but limited
to the caller's share scope and without `merge_suggestions`.

```json
{
  "authors": [
    { "name": "Brandon Sanderson", "books": 14, "duration": 1204112.6 }
  ],
  "unknown": 3
}
```

The narrators route uses the key `narrators` instead of `authors`.

- A name is the **whole** effective field value: a `Michael Kramer & Kate
  Reading` credit is one entry, matching the exact `author` / `narrator` filter on
  [`/books`](#get-apiv1librariesidbooks). Names sort case-insensitively.
- `unknown` counts books with the field blank (they are not listed).
- Only books the caller's shares grant are counted, so a share-scoped user never
  sees a count for a book outside their grant.

| Status | Meaning |
|---|---|
| `400` | invalid library id |
| `403` | `no access to this library` - no share grants it |
| `404` | `library not found` |

### `GET /api/v1/libraries/{id}/series`

*Session.* Every series of one library with the books the caller can reach in it
(`browse_people` capability): the admin console's
[`/admin/series`](#get-apiv1adminseries) aggregate, within the caller's share
scope.

```json
{
  "series": [
    { "name": "Mistborn", "author": "Brandon Sanderson", "books": 3,
      "duration": 284110.2, "positions": [1, 2, 3] }
  ]
}
```

`author` is the most common author among the series' books; `positions` lists the
distinct non-zero series positions held, ascending (so a client can mark the
gaps). Sorted case-insensitively by name; books with no series are not counted.
Same status codes as `/authors`.

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

Response `200` - a Book including files, chapters, playability and, when there
is one, its `description`:

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
  "direct_playable": true,
  "description": "For a thousand years the ash fell and no flowers bloomed…"
}
```

`description` is the book's effective description (an admin edit or an accepted
community match), omitted when empty. It can be long, so only this single-book
response carries it; list, search, recent and `/next` books leave it out. It is
not the community-written `community_description` on
[`/meta`](#get-apiv1librariesidmeta). The other fields every book carries
(`published`, `cover_color`, `cover_version`) are described under
[`/books`](#get-apiv1librariesidbooks).

`direct_playable` reports whether the codec plays natively in browsers (unknown
codec ⇒ `true`; the client falls back to `?transcode=1` if direct playback
fails). Durations/positions are seconds (float).

`path` may be the book's own path or a path inside it: a part of a folder book,
or a disc folder (or a file in one) of a book
[joined from its disc folders](../scanner.md#joined-books-disc-sets). Either
resolves to the whole book, its `rel_path` the book's. The book must be in the
caller's scope too: a share granting only part of a book (one disc folder, one
file) gets the same `403` as a path outside the share, and nothing is read or
indexed on its behalf. The same holds for `/chapters`, `/cover`, `/meta` and `/next`;
`/stream` is scoped on the file path alone, so granted files still stream.

| Status | Meaning |
|---|---|
| `400` | missing `path` / invalid library id |
| `403` | `no access to this path`: the path, or the book it resolves to, is outside the caller's share scope |
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

### `GET /api/v1/libraries/{id}/next`

*Session.* What to play after a book, decided by the server so every player
follows a series the same way (`next_book` capability). The path is resolved and
authorized exactly like [`/item`](#get-apiv1librariesiditem), and everything the
answer names is inside the caller's share scope.

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes - the book just finished (or any path `/item` accepts) |

```json
{
  "source": "community",
  "next": { "library_id": 1, "path": "Brandon Sanderson/Mistborn/The Well of Ascension" },
  "book": {
    "id": 413,
    "library_id": 1,
    "rel_path": "Brandon Sanderson/Mistborn/The Well of Ascension",
    "title": "The Well of Ascension",
    "author": "Brandon Sanderson",
    "series": "Mistborn",
    "series_index": 2,
    "duration": 105934.1
  },
  "work": {
    "id": "the-well-of-ascension",
    "title": "The Well of Ascension",
    "position": "2",
    "authors": [{ "id": "brandon-sanderson", "name": "Brandon Sanderson" }],
    "web_url": "https://meta.audiosilo.app/work?id=the-well-of-ascension",
    "local": { "library_id": 1, "path": "Brandon Sanderson/Mistborn/The Well of Ascension" }
  }
}
```

| Field | Notes |
|---|---|
| `source` | the step that produced `next`, or that decided nothing follows: `community`, `series`, `folder` or `none` |
| `next` | `{library_id, path}`, the book to play next, always one the caller can open. Open it by its own `library_id`: a `community` answer can name a book in **another** of the caller's libraries. Absent when nothing follows |
| `book` | the next book's indexed metadata in the list shape (no `files`, `chapters` or `description`); absent when `next` is a folder not indexed yet |
| `work` | the community series rail's next entry, shaped like a [`/meta` rail entry](#get-apiv1librariesidmeta). With `local` beside a `community` answer; **without** `local` beside a `series`, `folder` or `none` answer when the rail names a next work the server could not place on one of the caller's books (a client can show it as "next in the series, not on this server"). Absent when the rail names nothing |

The community rail answers first, but only when it can **place** its next entry on
one of the caller's books. Otherwise the local steps decide, in order, and the
first one with an answer wins:

1. **`community`** - community metadata is on and the book matches a work with at
   least one series rail. The server reads the entry after the current work on the
   **first rail's main view** (the smallest numeric position above the current
   one; unnumbered entries such as an omnibus `1-3` are skipped) and places it for
   the caller exactly as `/meta` places [`local`](#owned-entries-local). When it is
   placed, the answer is `next` + `book` + `work`. When it is not (the caller's copy
   is untagged, or filed under a series named unlike the rail, or they don't have
   it), failing to place proves nothing, so the steps below answer and the entry
   rides along as `work` without `local`. Nothing comes from this step (no `work`)
   when the book has no ASIN/ISBN, has no match or no rails, the metadata service
   fails, the current position is not a number, or the current work is last on the
   rail (a rail can lag the library). A failure reading the caller's books leaves
   the entry unplaced, as `/meta` degrades.
2. **`series`** - the book has a `series` and a `series_index` above 0: the book of
   exactly that series in the same library with the smallest higher
   `series_index` (ties by path), within the caller's scope. When other books of
   the series are numbered but none comes later the answer is
   `{"source": "series"}`, the end of the series; when nothing else is numbered the
   step falls through.
3. **`folder`** - the book's parent folder, listed whole as the caller may open it
   (their share scope and the library's ignore rules): the first book or folder
   whose name sorts after the current one, preferring an indexed book. Names are
   compared the way the player's `localeCompare` (numeric, base sensitivity) does:
   case and accents folded, numbers by value, so `Book 2` comes before `Book 10`;
   ties by path. A folder that is not indexed is offered only when nothing in the
   folder, the current book included, is indexed (a folder mid-scan); loose files
   that are not books are never offered. Ordering is by name, not `series_index`.
   An unreadable folder falls through.
4. **`none`** - `{"source": "none"}`.

| Status | Meaning |
|---|---|
| `400` | missing `path` / invalid library id |
| `403` | the path, or the book it resolves to, is outside the caller's share scope |
| `404` | `library not found`, or `no book at that path` |
| `500` | `could not find the next book` - a database failure |

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
to the metadata site without ever building a URL itself. Answers are cached in
memory and in the server's database (see
[Configuration](../configuration.md#community-metadata-metadata)), so a restart
serves them warm and a known book keeps its enrichment through a metadata-service
outage.

| Query param | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | |
| `include` | string | no | `previous` adds [`previous[]`](#previous-books-and-spoiler-gating). May repeat or be comma-separated; unknown values are ignored. `meta_bundle` capability |
| `spoilers` | string | no | `hide` gates the envelope by the caller's saved progress ([below](#previous-books-and-spoiler-gating)); any other value is ignored. `meta_bundle` capability |

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
    },
    "community_description": {
      "text": "Mark Watney is the first person stranded on Mars…",
      "license": "CC-BY-SA-4.0"
    },
    "attribution": {
      "credit": "AudioSilo Meta community contributors",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
      "source_url": "https://meta.audiosilo.app/work?id=the-martian"
    }
  },
  "recording": {
    "id": "podium-2013",
    "narrators": [{ "id": "r-c-bray", "name": "R. C. Bray" }],
    "abridged": false,
    "runtime_min": 634,
    "release_date": "2013-03-22",
    "publisher": "Podium Audio",
    "cover_url": "https://…",
    "chapter_count": 26
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
          "web_url": "https://meta.audiosilo.app/work?id=the-martian",
          "local": { "library_id": 1, "path": "Andy Weir/The Martian" }
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
`publisher`, `cover_url`, `chapter_count`) is dropped when empty.
`recording.chapter_count` is the matched recording's chapter count, omitted when
the metadata service does not know it. `series[].position` is this
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
  `{ "in_short": …, "ending": … }`, both fields `omitempty`. Both are
  spoilers: `in_short` is the whole book in one own-words paragraph, **ending
  included**, and `ending` is **by construction a full spoiler**. A client must
  only reveal either deliberately (the player shows the current book's
  `in_short` once it is finished or behind an explicit tap on a "Whole-book
  summary" row, and its `ending` once finished; a previous book's row, opened
  deliberately, shows `in_short` and puts `ending` behind its own tap). The whole object is omitted when the work has neither, and an
  all-blank upstream object is never emitted.

These fields are additive: they are passed straight through from the upstream
`GET /works/{id}` (see the [three-repo seam](../../architecture/cross-repo-contract.md)),
not composed or reshaped like `recording`/`series`. The one field the server
drops is the character cross-reference (`xref`) - it is not exposed to clients. A
client that ignores these fields is unaffected.

`work.community_description` (`{ "text": …, "license": … }`, `license` omitted
when unstated) is the community-written, spoiler-free description: part of the CC
BY-SA layer, kept apart from `description` (the CC0 core's blurb) because the two
carry different licences. It is absent for most works.

#### Attribution

`work.attribution` is the credit the CC BY-SA layer requires wherever it is shown:

| Field | Value |
|---|---|
| `credit` | `AudioSilo Meta community contributors` |
| `license` | `CC BY-SA 4.0` |
| `license_url` | `https://creativecommons.org/licenses/by-sa/4.0/` |
| `source_url` | the work's page on the metadata site (the envelope's `web_url`) |

It is present **if and only if** the work carries CC BY-SA content
(`characters`, `recaps`, `recap_summary` or `community_description`), so a client
shows the credit exactly when it shows content that needs it. The server writes
the legal text: a client renders these fields beside that content and never
composes its own. It is on every work the server returns: the envelope's `work`,
each `previous[]` work and [`/meta/work`](#get-apiv1metawork). With
`spoilers=hide`, a work left with no CC BY-SA content after gating loses its
`attribution` too.

#### Owned entries (`local`)

Every rail entry the **caller** owns carries `local`, `{ "library_id": …, "path":
… }`: the book to open for that entry. It appears in the main view
(`series[].works[]`) and in each alternate order (`series[].orderings[].works[]`),
and is absent where the caller has no copy. It is worked out for each request,
after the cache and on a copy of the rails, and is never stored: the cached
envelope is shared by every caller.

The candidates are the caller's books, in every library they can reach and only
the paths their shares grant, whose `series` matches a rail or ordering name with
case, accents, punctuation and spacing ignored (`The Expanse` matches `the
Expanse!`). Each entry gets at most one book, the first that applies:

1. the current work's entry: the book the request is for;
2. a book the server already knows to be that work (from the community answers it
   has cached, in memory or else in its database, fresh or stale; never a new
   upstream call, so placement doesn't change with a restart);
3. in an alternate order, the book the main view placed for the same work;
4. a book of a series named like this view (the rail's or ordering's own name)
   whose `series_index` equals the entry's numeric position.

A book known to be a particular work is placed by that identity only, never by
its number, so a novella numbered like the next volume holds no slot. When two
books qualify, one in the requested book's library wins, then library order, then
path.

`local` is an extra: when the caller's books can't be read, the envelope is sent
without it (the failure is logged) rather than failing the lookup.

#### Previous books and spoiler gating

`include=previous` adds `previous`: the works **before** this one in its series,
nearest first, at most five, each the same shape as `work`. They come from each
rail's **main view** only (an alternate order's earlier books are exactly the
reading-order spoiler the main view avoids): every entry whose numeric position is
below the current work's. A rail whose own position is not a number contributes
nothing, nor does an unnumbered entry; a work on two rails counts once. Each is
fetched and cached like [`/meta/work`](#get-apiv1metawork), and one that fails is
left out rather than failing the envelope. `previous` is omitted when there are
none.

`spoilers=hide` gates the envelope by the **caller's own saved progress** on this
book (the server's progress record, mapped onto the book's chapters by
`book_offset`; no saved progress counts as not started):

| Content | Kept when |
|---|---|
| the current work, whole | the book is finished |
| a character | its `reveal.chapter` is at most the current chapter (at least chapter 1, so a book not yet started still shows its opening cast) |
| a recap | its `through.chapter` is `0`, or below the current chapter (the chapter being heard is not over) |
| `recap_summary` | the book is finished (`in_short` and `ending` both summarize the whole book) |
| a `previous[]` work | always, except its `recap_summary.ending` |

These are the player's own rules (`meta-gating.ts`), but the player does not use
this param: it gates on the device against its live position, which can be ahead
of the last saved one. `spoilers=hide` is for clients that cannot gate
themselves.

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
| `500` | with `spoilers=hide`, `could not load progress` - the caller's progress could not be read; the ungated envelope is never sent instead |
| `502` | `metadata service unavailable` - the upstream was unreachable or errored and the server holds no earlier answer for the book |

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
space; 24 h positive / 1 h not-found / 2 min transport-error TTLs). A found work is
also kept in the database cache, so it survives a restart and is served through an
upstream outage. An unknown id is remembered in memory only, except that a `404`
for a work the database already holds replaces that row, so a work upstream has
dropped is not served again in a later outage.

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
envelope (documented above, same `omitempty` rules, including
`community_description` and [`attribution`](#attribution)) - there is deliberately
no second work type. The enrichment fields that only make sense for a matched local
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
   older sidecar file and keep showing the removed cover. A custom cover is
   served only while a book is indexed at its path, and a request for a part
   path inside a folder book gets that book's custom cover;
2. an indexed sibling cover file (served with
   `Cache-Control: private, max-age=86400`);
3. embedded art extracted from the book's primary audio file (served with
   `Cache-Control: private, max-age=86400`). Its `Content-Type` is sniffed from
   the image bytes (JPEG, PNG, GIF, WebP or BMP), never taken from the tag;
   embedded data that isn't one of those images counts as no art, whatever the
   tag claims.

The path is authorized against the caller's share scope before any of the
three is tried, custom covers included.

| Query param | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | |
| `size` | int | no | `160`, `320` or `640`: a JPEG thumbnail instead of the full art (`cover_sizes` capability; below) |
| `v` | string | no | ignored by the server; clients append the book's `cover_version` as a cache buster |
| `token` | string | no | media-auth fallback |

Response `200`: image bytes with the appropriate `Content-Type`; `404`
(`no cover`) when there is no custom cover, no cover file and no embedded art.

**Thumbnails (`?size=`).** With `size`, the response is a JPEG of the same art
(custom cover, sidecar image or embedded art, in the same order) scaled to fit
within `size` x `size` pixels, never scaled up, from the server's in-memory
thumbnail cache - the one the admin console's
[`POST /admin/covers`](#post-apiv1admincovers) uses. Its longer side is at most
`size` pixels (a 2:3 portrait cover at `320` is 213 x 320). A source larger than 40
megapixels, or one that can't be decoded, is a `404` here although the full-art URL
still serves it, so a client falls back to the URL without `size` on a thumbnail
`404`.

- `ETag` is `"thumb-<size>-<hash>"`, the hash of the art's own version: the value
  the book's [`cover_version`](#get-apiv1librariesidbooks) takes from its first
  thumbnail on. `If-None-Match` is matched like the server's other validators (a
  list, weak tags).
- A matching request gets a `304` without the image being read once the book's
  `cover_color` is recorded for this art. Until then the server still reads the art
  (usually from the thumbnail cache) to record it, and then answers the `304`, so a
  client that only ever revalidates still gets the colour onto the book.
- `Cache-Control` is `private, no-cache` for a custom cover (it can be replaced at
  any moment, so a client revalidates every time) and `private, max-age=86400` for
  a sidecar or embedded cover, as for full art.
- Neither header is sent on a `404`, so "no cover" is never cached.
- Each thumbnail (a cached one too) records on the book what it lacks for this
  art: its [`cover_color`](#get-apiv1librariesidbooks) and, at the first one, its
  art identity, which moves `cover_version`. The write is bounded (250 ms, not tied
  to the request), so a busy database costs only the colour until the next
  thumbnail, never the response.
- Art reads are bounded across all requests (8 at a time, with decodes bounded
  separately), shared with `POST /admin/covers`.

A client appends `v=<cover_version>` to every cover URL (with or without `size`)
so a cover replaced since the last fetch is a new URL to its image cache.

| Status | Meaning |
|---|---|
| `400` | `size must be one of [160 320 640]` - any other value, including an empty `size=` (an older server ignores `size`, so only send it when `cover_sizes` is true); missing `path` / invalid library id |
| `304` | `If-None-Match` matched (thumbnails, and custom covers) |
| `403` | the path, or the book it resolves to, is outside the caller's share scope |
| `404` | `no cover`: no art at all, no book at the path, or (with `size`) art that cannot be decoded or is over 40 megapixels |
| `500` | `could not load cover` - the art could not be read (an unreadable network mount) or a database failure; not cached, so the next request tries again |

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
      "updated_at": "2026-07-01T19:42:07Z",
      "started_at": "2026-06-20T21:05:12Z"
    }
  ]
}
```

`started_at` and `finished_at` (RFC 3339, UTC) are the book's start and finish
dates, on every progress response of a server with the `progress_edit`
capability (this list, the single-book read and the `PUT` echo). Each is
omitted when unknown or none: `started_at` on rows saved before the server
recorded it, `finished_at` while the book is unfinished. How they are stamped is
under [`PUT`](#put-apiv1librariesidprogress); a listener corrects them with
[`PATCH`](#patch-apiv1librariesidprogress).

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

Each save is also the heartbeat of the caller's **listening session** on the
book, which the server derives for the admin console (see
[Admin: activity](#admin-activity)). That happens whether or not the save wins
last-write-wins, never changes the response, and a failure to record it is only
logged. The server also stamps the row's start and finish dates (`started_at`
on the first save, `finished_at` when `finished` turns on, cleared when it turns
off), taken from the save's own `updated_at` (server time when it is missing or
implausible). With `progress_edit` they ride on the response; any
`started_at` / `finished_at` in the `PUT` body is **ignored** (the save stamps
them), so a client changes them only through
[`PATCH`](#patch-apiv1librariesidprogress).

### `PATCH /api/v1/libraries/{id}/progress`

*Session.* Capability `progress_edit`. The caller's own edit of their progress
on a book (`?path=` required): mark it finished or **unfinished**, move the
position, or set or clear the start and finish dates. The same rules as an
admin's [edit of someone's progress](#patch-apiv1adminlibrariesidprogress)
(`catalog.EditProgress`), applied with the caller's own access. Any subset of:

| Body field | Type | Notes |
|---|---|---|
| `finished` | bool | `true` moves the position to the end and stamps the finish now (unless `finished_at` is given); `false` (mark unfinished) clears the finish date and keeps the position (unless `position` is given) |
| `position` | float | seconds; between `0` and the book's duration |
| `started_at` | string \| null | RFC 3339 or `YYYY-MM-DD` (the start of that day, server time); `null` clears it |
| `finished_at` | string \| null | RFC 3339 or `YYYY-MM-DD` (the **end** of that day, server time, or now if that is sooner); `null` clears it; needs the book to be (or become) finished |

A field left out stays as it is. With no progress on the book yet, an indexed
book in the caller's scope gets a new row (its start stamped now). The write is
stamped with the server's time and a higher `version`, so under last-write-wins
it beats what a device saved before it, while a device that has the book loaded
overrides it on its next save. It is not playback, so it records no
[listening session](#admin-activity).

Response `200`: `{ "progress": { … } }` - the player's progress object, with
its dates.

| Status | Meaning |
|---|---|
| `400` | `path is required`; `invalid request` (a malformed body, an unknown key or an unparseable date); `those dates or that position don't fit this book` - a negative position or one past the book's end, a date more than a day in the future, a finish before the start, or a finish date on a book that isn't (and isn't becoming) finished |
| `403` | `no access to this path` - outside the caller's current access |
| `404` | no progress at that path and no indexed book there |

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

## Up next, collections and ratings

*Session* (a session token or an API key). The listener's own lists, gated by
capability: `queue` for up next, `collections` for collections and the share
picker, `ratings` for ratings. Rules shared by every route in this section:

- **A reference is a book path.** List entries are addressed as
  `{ "library_id": 1, "path": "…" }`: the book's own `rel_path` (cleaned like
  every path). Entries are stored by path with no link to the index, like
  progress and favourites, so they survive a rescan and follow a moved book.
- **`book`** on an entry is the book in the [list shape](#get-apiv1librariesidbooks)
  (no `description`), present while the path is indexed. A client renders an
  entry without it by its path leaf.
- **Lists show only what the caller can open now.** An entry whose path is
  outside the caller's **current** access (a share since taken away) is kept in
  the database but left out of every response and every count, as favourites
  are. It reappears if access comes back.
- **Adding one book resolves it.** A single add (`POST`) and a rating `PUT`
  accept any path inside a book, like [`/item`](#get-apiv1librariesiditem): a
  part of a folder book or a disc folder resolves to the whole book, a book not
  yet indexed is indexed on demand, and the book's own path is what is stored.
  A path outside the caller's access is `403 no access to this path`; a path
  that isn't a book is `404`.
- **Replacing a whole list doesn't.** A `PUT` of a whole list indexes nothing:
  each entry must be a book already indexed at exactly that path and inside the
  caller's current access. Any other entry is **skipped**, not an error, and the
  response is the stored result, so a client reconciles with what it gets back.
  Duplicates collapse (the first wins).
- **Removing one entry is never scoped.** `DELETE …?library_id=&path=` removes
  only the caller's own row, so it needs no access check and a revoked path can
  still be cleaned up. It is idempotent (`204` whether or not the entry existed).
- **Another user's id is a `404`.** Every route addressed by an id answers `404`
  for an id that isn't the caller's, never `403`, so the answer doesn't confirm
  that another user's collection exists.
- **Positions** are 0-based indexes in the stored order. Absent or past the end
  means the end; a negative one is a `400`.

### `GET /api/v1/me/queue`

*Session.* Capability `queue`. The caller's up next, in order.

```json
{
  "queue": [
    {
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Well of Ascension",
      "added_at": "2026-10-04T19:45:02Z",
      "book": { "id": 413, "library_id": 1, "rel_path": "Brandon Sanderson/Mistborn/The Well of Ascension", "title": "The Well of Ascension", "…": "…" }
    }
  ]
}
```

### `PUT /api/v1/me/queue`

*Session.* Replaces the caller's whole up next with this order.

```json
{ "items": [ { "library_id": 1, "path": "Brandon Sanderson/Mistborn/The Well of Ascension" } ] }
```

Entries follow the [replace rules](#up-next-collections-and-ratings): duplicates
collapse, entries that aren't an indexed book in the caller's access are
skipped. Every stored row not in the list is deleted, **including** rows the
caller can't currently see. Response `200`: the queue, as `GET`.

| Status | Meaning |
|---|---|
| `400` | a malformed body; `too many items` - more than 500 |

### `POST /api/v1/me/queue`

*Session.* Adds one book.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `library_id` | int | yes | |
| `path` | string | yes | any path in the book; the book's own path is stored |
| `position` | int | no | 0-based; absent or past the end = the end |

A book already queued **moves** to `position` when one is given, and otherwise
stays where it is (so adding twice is harmless). Response `200`: the whole
queue, as `GET`.

| Status | Meaning |
|---|---|
| `400` | a malformed body, a missing path, or a negative `position` |
| `403` | `no access to this path` |
| `404` | no book at that path |
| `409` | `code: "queue_full"` - the queue already holds 500 books |

### `DELETE /api/v1/me/queue`

*Session.* Removes one book (`?library_id=&path=`). `204 No Content`,
idempotent, with no access check.

### `GET /api/v1/me/collections`

*Session.* Capability `collections`. The collections the caller owns, then the
ones shared with them, each group most recently updated first.

```json
{
  "collections": [
    {
      "id": 7,
      "name": "Long drives",
      "description": "Big books for the summer trip",
      "owner": { "id": 4, "username": "sam" },
      "owned": true,
      "shared_with": [ { "id": 6, "username": "alex" } ],
      "item_count": 12,
      "preview": [ { "id": 412, "library_id": 1, "rel_path": "Brandon Sanderson/Mistborn/The Final Empire", "title": "The Final Empire", "…": "…" } ],
      "created_at": "2026-09-30T18:02:11Z",
      "updated_at": "2026-10-04T20:15:40Z"
    }
  ]
}
```

- `owned` - the caller owns it. Otherwise it was **shared with** the caller,
  read-only, and `owner` names who did.
- `shared_with` - who the owner shares it with (`[]` when nobody). Sent to the
  owner only, never to a viewer.
- `item_count` - the items **the caller** can open now; a viewer never learns
  how many of the owner's items are out of their reach.
- `preview` - the first (up to) four of those items that are indexed, as list
  books, for a cover mosaic.
- `updated_at` moves on a rename, a new description, and any change to the
  items. Sharing doesn't move it.

Collections are **shared read-only**: only the owner renames, describes, edits
the items or the shares; a viewer can read the collection and leave it. A viewer
sees only the items their **own** current access allows, never the owner's.

### `POST /api/v1/me/collections`

*Session.* Creates a collection owned by the caller.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | trimmed; 1 to 100 characters, no control characters |
| `description` | string | no | up to 1,000 characters |

Response `201`: `{ "collection": { … } }`.

| Status | Meaning |
|---|---|
| `400` | a malformed body, or a name or description outside the rules |
| `409` | `code: "collections_full"` - the caller already owns 100 collections |

### `GET /api/v1/me/collections/{id}`

*Session.* One collection and its items, in order, filtered by the **caller's**
current access.

```json
{
  "collection": { "id": 7, "name": "Long drives", "owned": true, "…": "…" },
  "items": [
    {
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "added_at": "2026-09-30T18:03:00Z",
      "book": { "id": 412, "title": "The Final Empire", "…": "…" }
    }
  ]
}
```

`404` when the caller neither owns it nor has it shared with them.

### `PATCH /api/v1/me/collections/{id}`

*Session.* Renames or re-describes a collection (owner only): any subset of
`name` and `description`, with the rules of `POST`. Response `200`:
`{ "collection": { … } }`.

| Status | Meaning |
|---|---|
| `400` | a malformed body, or a name or description outside the rules |
| `403` | `code: "not_owner"` - the collection is shared with the caller, who can't change it |
| `404` | not the caller's collection and not shared with them |

### `DELETE /api/v1/me/collections/{id}`

*Session.* For the owner, deletes the collection with its items and shares. For
a viewer, **leaves** it: only their own share is removed, and the owner's
collection is untouched. `204 No Content`; `404` for anyone else.

### `PUT /api/v1/me/collections/{id}/items`

*Session.* Replaces the collection's items with this order (owner only), body
`{ "items": [ { "library_id": 1, "path": "…" } ] }`, by the
[replace rules](#up-next-collections-and-ratings) of up next. Response `200`:
the collection and its items, as `GET /me/collections/{id}`.

| Status | Meaning |
|---|---|
| `400` | a malformed body; more than 1,000 items |
| `403` | `code: "not_owner"` |
| `404` | not the caller's collection and not shared with them |

### `POST /api/v1/me/collections/{id}/items`

*Session.* Adds one book (owner only), with the body and semantics of
[`POST /me/queue`](#post-apiv1mequeue): `library_id`, `path` and an optional
`position`; a book already in it moves to `position` when one is given.
Response `200`: the collection and its items, as `GET /me/collections/{id}`.

| Status | Meaning |
|---|---|
| `400` | a malformed body, a missing path, or a negative `position` |
| `403` | `code: "not_owner"`; or `no access to this path` |
| `404` | not the caller's collection and not shared with them; or no book at that path |
| `409` | `code: "collection_full"` - the collection already holds 1,000 books |

### `DELETE /api/v1/me/collections/{id}/items`

*Session.* Removes one book (`?library_id=&path=`, owner only). `204 No
Content`, idempotent, with no access check on the path. `403`
`code: "not_owner"` for a viewer, `404` for anyone else.

### `PUT /api/v1/me/collections/{id}/shares`

*Session.* Replaces who the collection is shared with (owner only), body
`{ "user_ids": [6, 9] }` (`[]` stops sharing it). Each id must be an existing,
enabled, non-demo account other than the owner; one that isn't rejects the
whole request. Response `200`: `{ "collection": { … } }`, its `shared_with`
updated.

| Status | Meaning |
|---|---|
| `400` | a malformed body; `unknown user`; more than 50 users |
| `403` | `not available for demo accounts` - the owner is a demo account; or `code: "not_owner"` |
| `404` | not the caller's collection and not shared with them |

A viewer sees the owner's username and the items **they** can open; nothing of
the owner's access is shared with them.

### `GET /api/v1/me/share-targets`

*Session.* Capability `collections`. Who the caller can share a collection
with: every enabled, non-demo account other than the caller, by username.

```json
{ "users": [ { "id": 6, "username": "alex" }, { "id": 9, "username": "robin" } ] }
```

This is the one place a non-admin sees other accounts' usernames. A demo
account gets `403`, so a public demo can't list the server's usernames.

### `GET /api/v1/libraries/{id}/rating`

*Session.* Capability `ratings`. The caller's rating of a book (`?path=`, the
exact path, scoped like progress: use the book's own `rel_path`).

```json
{
  "rating": {
    "library_id": 1,
    "path": "Brandon Sanderson/Mistborn/The Final Empire",
    "rating": 5,
    "note": "The heist that becomes a revolution.",
    "created_at": "2026-10-02T21:14:00Z",
    "updated_at": "2026-10-03T08:01:37Z"
  }
}
```

`{ "rating": null }` when the caller hasn't rated it. `400` missing path; `403`
out of scope.

### `PUT /api/v1/libraries/{id}/rating`

*Session.* Rates a book (`?path=`, any path in it: it resolves to the book and
is stored on the book's own path, by the
[add rules](#up-next-collections-and-ratings)).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `rating` | int | yes | `1` to `5` |
| `note` | string | no | a short private note; trimmed; up to 500 characters |

Response `200`: `{ "rating": { … } }`, `note` `""` when there is none. One
rating per book per user: rating again updates it and moves `updated_at`.

| Status | Meaning |
|---|---|
| `400` | missing path; a malformed body; `rating` not a whole number from 1 to 5; a note over 500 characters |
| `403` | `no access to this path` |
| `404` | no book at that path |

### `DELETE /api/v1/libraries/{id}/rating`

*Session.* Removes the caller's rating of a book (`?path=`, exact, scoped like
`GET`). `204 No Content`, idempotent.

### `GET /api/v1/me/ratings`

*Session.* Capability `ratings`. Every rating the caller has made that they can
still open, most recently updated first, each with its `book` when indexed.

```json
{
  "ratings": [
    {
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "rating": 5,
      "note": "The heist that becomes a revolution.",
      "created_at": "2026-10-02T21:14:00Z",
      "updated_at": "2026-10-03T08:01:37Z",
      "book": { "id": 412, "title": "The Final Empire", "…": "…" }
    }
  ]
}
```

## Your listening

*Session.* Capability `user_stats`. The caller's own listening, the player-side
counterpart of the admin's [Activity](#range-listening-activity), computed from
the same listening sessions and daily roll-ups but only ever **the caller's**.

`range` is as on the admin routes: `7d`, `30d`, `90d`, `1y` (365 days) ending
now, a calendar year such as `2025`, or `year` (the current calendar year in
server time); empty means `30d`, and anything else is `400`
`code: "invalid_range"`. Days, hours and weekdays are in the **server's** time
zone, as on the admin Activity page.

### `GET /api/v1/me/stats`

*Session.* The caller's listening over a period.

```json
{
  "stats": {
    "range": "30d",
    "from": "2026-09-04T19:42:08Z",
    "to": "2026-10-04T19:42:08Z",
    "timezone": "BST",
    "utc_offset": 60,
    "totals":   { "listened": 102380.5, "sessions": 61, "books": 5, "finished": 2 },
    "previous": { "listened": 88012.0, "sessions": 54, "books": 4, "finished": 1 },
    "estimated": 0,
    "days": [ { "date": "2026-09-04", "listened": 3021.3 } ],
    "hour_weekday": [ [0, 0, "… 24 values …"], "… 7 rows, Monday first …" ],
    "top_books": [ { "library_id": 1, "path": "Brandon Sanderson/Mistborn/The Final Empire",
                     "title": "The Final Empire", "author": "Brandon Sanderson", "listened": 38211.0 } ],
    "top_authors":   [ { "name": "Brandon Sanderson", "listened": 61022.4, "books": 3 } ],
    "top_narrators": [ { "name": "Michael Kramer", "listened": 61022.4, "books": 3 } ],
    "top_series":    [ { "name": "Mistborn", "listened": 52011.9, "books": 2 } ],
    "finished_books": [ { "library_id": 1, "path": "Brandon Sanderson/Mistborn/The Final Empire",
                          "title": "The Final Empire", "author": "Brandon Sanderson",
                          "finished_at": "2026-09-28T22:40:12Z" } ],
    "playback": [ { "transcoded": false, "codec": "aac", "listened": 102380.5, "sessions": 61 } ],
    "clients":  [ { "app": "AudioSilo", "version": "1.4.2", "platform": "ios", "devices": 2 } ]
  }
}
```

The fields mean what they mean in the admin's
[`activity`](#range-listening-activity), for the caller alone:

- `totals` - the caller's `listened` (wall-clock seconds), `sessions`, `books`
  listened to and books `finished` in the period (by the caller's own finish
  dates); `previous` the same for the period of equal length just before;
  `estimated` how many of `totals.listened`'s seconds are estimates.
- `days` - every day of the period, oldest first, zero days included;
  `hour_weekday` - 7 rows (0 = Monday) of 24 hours, raw sessions only.
- `top_books`, `top_authors`, `top_narrators`, `top_series` - up to 10 each, by
  listened time. `finished_books` - the books the caller finished in the period,
  newest first, up to 100.
- `playback` and `clients` - the caller's listening by codec and transcoding,
  and the caller's devices that listened, by app build.

**Only the caller, and only what they can open now.** Nothing about other
people is computed or sent: no `listeners`, `by_user`, `top_users`, funnel,
drop-offs, storage, coverage, growth, peak concurrency, inactive users or any
username. The top lists and `finished_books` pass through the caller's
**current** access: a book they can no longer open is dropped from `top_books`
and `finished_books`, and authors, narrators and series are ranked from the
books they can still open, so a path, title or author from a share since taken
away never comes back. `totals`, `days` and `hour_weekday` are the caller's own
time and count everything.

### `GET /api/v1/me/listening`

*Session.* The caller's listening per day over a period, without the rest of
the stats: the same `days` as `/me/stats`, for a year calendar or streaks
(which the client works out from `days`).

```json
{
  "range": "2026",
  "from": "2025-12-31T23:00:00Z",
  "to": "2026-10-04T19:42:08Z",
  "timezone": "BST",
  "utc_offset": 60,
  "days": [ { "date": "2026-01-01", "listened": 3120.4 } ]
}
```

As [`GET /admin/listening`](#get-apiv1adminlistening) with `user_id` set to the
caller, without `by_user`. `400` `code: "invalid_range"`.

### `GET /api/v1/me/goal` · `PUT /api/v1/me/goal` · `DELETE /api/v1/me/goal`

*Session.* The caller's listening goal: a number of books to finish each
calendar year, one per account, kept on the server so every device shows the
same goal.

`GET` answers:

```json
{
  "goal": { "books_per_year": 24, "updated_at": "2026-01-02T09:00:00Z" },
  "year": "2026",
  "finished": 17
}
```

`goal` is `null` when none is set. `year` is the server's current calendar year
and `finished` the books the caller has finished in it (server time, counted
like `totals.finished`), there whether or not a goal is set.

`PUT` sets the goal, body `{ "books_per_year": 24 }` (a whole number from 1 to
1,000, else `400`), and answers `200` as `GET`. `DELETE` clears it: `204 No
Content`, idempotent.

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
codes, progress, bookmarks, notes, history, listening sessions and daily
listening totals, share grants) via cascade; files on
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
library object of [`GET /api/v1/libraries`](#get-apiv1libraries) plus
admin-only fields:

```json
{
  "libraries": [
    { "id": 1, "name": "Audiobooks", "root": "/srv/audiobooks",
      "default_view": "hybrid", "sort_order": 0,
      "book_count": 812, "available": true,
      "scan": { "running": false, "total": 812, "done": 812, "indexed": 3,
                "added": 1, "updated": 2, "moved": 0, "removed": 1 },
      "scan_schedule": "every:6h",
      "ignore_patterns": ["# publisher samples", "*.sample.mp3", "Extras/"],
      "next_scan_at": "2026-10-04T15:00:00Z" }
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
  [`GET /admin/libraries/{id}/scan`](#get-apiv1adminlibrariesidscan). The
  console polls this list - every second while any library is scanning or
  waiting in the queue - instead of each library's scan endpoint, which
  remains available.
- `scan_schedule` (string) - the library's scan schedule: `""` (none),
  `every:<N>h` (N = 1, 3, 6, 12 or 24 hours after the last scan started) or
  `daily:HH:MM` (server time zone). See
  [Scheduled scans](../scanner.md#scheduled-scans).
- `ignore_patterns` (string array, `[]` when none) - the library's
  [ignore rules](../scanner.md#ignore-rules), one pattern per entry, comments
  (`#` lines) included.
- `next_scan_at` (RFC 3339, UTC) - when the next scheduled scan is due; omitted
  without a schedule.

### `POST /api/v1/admin/libraries`

Creates a library and queues its first scan in the
[job queue](../scanner.md#the-job-queue) (trigger `manual`; browsing via `/fs`
works immediately; the index fills in behind).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | unique |
| `root` | string | yes | **server-local** filesystem path (mount network shares first) |
| `default_view` | string | no | defaults to `"hybrid"` |
| `scan_schedule` | string | no | `""` (default), `every:<N>h` or `daily:HH:MM` - see `GET /admin/libraries`. Stored in canonical form (`every:06h` is saved as `every:6h`) |
| `ignore_patterns` | string array | no | ignore rules, one pattern per entry (an entry with line breaks is split into one pattern per line); lines are trimmed and blank ones dropped. At most 100 patterns of 200 bytes |

Response `201`: the created library (the player's library object; the scan
settings are not echoed - read them from
[`GET /admin/libraries`](#get-apiv1adminlibraries)).

| Status | Meaning |
|---|---|
| `400` | `name and root are required`; `invalid request`; `code: "invalid_schedule"` (a schedule that isn't one of the forms above); `code: "invalid_pattern"` (too many patterns, one too long, one that matches nothing, or a malformed wildcard - the message names the line) |
| `409` | `name already taken` (`code: "name_taken"`) |

### `PUT /api/v1/admin/libraries/order`

Sets display order from an ordered id list (position 0 first); ids not listed
keep their order. This order is also the final de-duplication tiebreaker between
otherwise-equal copies of the same book (see [`GET /api/v1/search`](#get-apiv1search)).

Body: `{ "ids": [2, 1, 3] }`. Response `200`: `{ "libraries": [ … ] }` in the
new order, in the same enriched shape as
[`GET /admin/libraries`](#get-apiv1adminlibraries) (with `book_count`,
`available`, `scan` and the scan settings).

### `PATCH /api/v1/admin/libraries/{id}`

Edits `name`, `root`, `default_view`, `scan_schedule` and/or `ignore_patterns`
(the body fields of create). An empty or omitted `name`, `root` or
`default_view` keeps its current value; an omitted `scan_schedule` or
`ignore_patterns` keeps it too, while `""` / `[]` clears it (`sort_order` is
managed via `/order`).

A rescan is queued (trigger `change`) **only** when the root or the ignore rules
change, since those make the index stale. A rename, a new default view or a new
schedule doesn't rescan.

:::note Behaviour change
Before admin console Phase 3, every `PATCH` rescanned the library, a rename
included.
:::

Response `200`: the updated library (without the scan settings, as for
create), plus `job` - the queued scan, as for
[`POST …/scan`](#post-apiv1adminlibrariesidscan) - when the edit queued one
(omitted otherwise). `400` (including `invalid_schedule` / `invalid_pattern`) /
`404` / `409` as for create.

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
book; `"collection"` = one book per file inside it. On a folder with no audio
of its own whose audio is only in two or more disc folders directly in it,
`"book"` joins the discs into one book and the rescan carries their listening
state onto it (see [Joined books](../scanner.md#joined-books-disc-sets)); on
any other folder without audio it changes nothing. Clearing it splits the discs
out again.

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

Queues a rescan in the [job queue](../scanner.md#the-job-queue) (trigger
`manual`, started by the caller). Returns immediately: `202 Accepted` with the
job that will scan the library - the waiting one if the library already waits,
or a new one queued behind a running scan of it:

```json
{ "status": "scan started",
  "job": { "id": 7, "kind": "scan", "library_id": 1, "library_name": "Audiobooks",
           "trigger": "manual", "started_by": 1, "queued_at": "2026-10-04T09:12:44Z" } }
```

The job object is described under [`GET /admin/jobs`](#get-apiv1adminjobs).
`404` library not found. (The `job` key is new; the `status` text is unchanged.)

### `POST /api/v1/admin/scan`

Queues a scan of **every** library, in display order (trigger `manual`, started
by the caller); the queue runs them one at a time, with the same coalescing as
a single rescan. The console's "Check again" and "Rescan every library" are
this. No body. `202 Accepted`: `{ "jobs": [ … ] }`, one job per library (the
objects of [`GET /admin/jobs`](#get-apiv1adminjobs)).

### `GET /api/v1/admin/libraries/{id}/scan`

Progress of the library's (possibly running) scan:

```json
{ "running": true, "queued": true, "total": 812, "done": 394, "indexed": 6,
  "added": 2, "updated": 4, "moved": 1, "removed": 0 }
```

- `running` - a scan of the library is running now.
- `queued` (omitted when false) - a scan of the library waits in the job queue:
  behind another library's scan, or to run again after the current one.
- `total` / `done` - books discovered / books checked so far (`0` until
  discovery finishes).
- `added` / `updated` / `moved` / `removed` - what the scan has changed so far;
  `indexed` is `added + updated` (books written to the index, unchanged books
  are skipped).
- `unavailable` (omitted when false) - the last finished scan stopped at the
  [unavailable-root guard](../scanner.md#the-unavailable-root-guard), so
  nothing was pruned.

A scan an admin request queues - `POST …/scan`, creating a library, an edit
that changes the root or ignore rules, setting or clearing a folder override,
or the setup wizard - reads as `queued` (or `running`) before that request
returns, so a status poll made right after it sees the scan.

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

`POST` also takes several rules at once, `{ "rules": [{ "library_id": 1, "path": "…" }, …] }`
(1 to 1000), added in one transaction: all or none. The console uses it to add a
selection of books to a share.

Response: `204 No Content`. `400` when a `library_id` is missing/zero (nothing is
added), or with code `too_large` for more than 1000 rules.

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
(see [Built-in web UI](../web-ui.md#what-the-console-has-today)). They
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

Values are trimmed. The player's book JSON carries the effective `published` on
every book and `description` on [`/item`](#get-apiv1librariesiditem) only.

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
| `edited` | `true`\|`false` | - | the book has a metadata edit, or a chapter-title edit on a chapter it still has (one on an index a rescan dropped is dormant and doesn't count) |
| `min_duration` · `max_duration` | number (seconds) | - | inclusive bounds; `0` means no bound |
| `added_after` | date | - | inclusive lower bound on `added_at`: `YYYY-MM-DD` (used as is) or an RFC 3339 time (any offset; converted to UTC before comparing) |
| `added_before` | date | - | exclusive upper bound, same formats |
| `issue` | string | - | one [Health issue](#get-apiv1adminissues) kind's books: `scan_error`, `suspect`, `split_discs` (one row per split book: its first disc), `no_cover`, `unmatched`, `no_chapters` or `transcode` (not `duplicate`, which comes as groups from [`/admin/issues/duplicates`](#get-apiv1adminissuesduplicates)). Books an admin ignored for that kind are left out. Any other value is `400 unknown issue` |
| `issue_ignored` | `true`\|`false` | - | with `issue`, list **only** the books an admin ignored for it; without `issue` it is `400 issue_ignored needs an issue` |
| `sort` | string | `title` | `title` \| `author` \| `series` \| `narrator` \| `added` \| `duration` \| `size` |
| `order` | string | `asc` | `asc` \| `desc` |
| `limit` | int | `60` | ≤ 0 or > 200 falls back to 60 |
| `cursor` | string | - | `next_cursor` from the previous page |

Text sorts are case-insensitive. The `author`, `series` and `narrator` sorts put
books with that field blank **last** in either direction (`order=desc` reverses
the named books, not where the blanks go) and break ties
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
      "matched": true,
      "edited": true,
      "edited_fields": ["narrator"],
      "scan_error": "probe_failed",
      "scan_error_file": "Andy Weir/The Martian/The Martian.m4b",
      "scan_error_detail": "[mov,mp4,m4a,3gp,3g2,mj2 @ 0x7f8c] moov atom not found; Invalid data found when processing input"
    }
  ],
  "next_cursor": "eyJzIjoidGl0bGUiLCJ2IjpbIlRoZSBNYXJ0aWFuIl0sImlkIjo0MTJ9"
}
```

- Every field is always present (empty string / `0` / `false` when unknown),
  except the four Health fields below, which are omitted when empty or `0`.
  `path` is the book path (the player's `rel_path`).
- `custom_cover` - an admin uploaded a cover; `has_cover` includes it.
- `matched` - the book has an ASIN or ISBN: the same rule as the `matched` filter.
- `edited_fields` - the fields with an override (an edit or an accepted community
  value), `[]` when none; `edited` is also true for a chapter-title edit alone.
- `file_count` is `1` for a single-file book.
- `scan_error` - the first problem reading the book's files on its last
  indexing: `unreadable` (a file couldn't be opened), `empty_file` (0 bytes)
  or `probe_failed` (ffprobe couldn't read it). `scan_error_file` is the
  library-relative file, `scan_error_detail` the OS's or ffprobe's own message
  (shown as is; may be empty for `empty_file`). An ffprobe message keeps every
  distinct line ffprobe printed, joined with `"; "`, at most 300 bytes. A
  recorded problem is re-checked on every scan, so it clears once the file
  reads (fixed permissions, a share back online). See
  [Read problems](../scanner.md#read-problems).
- `suspect_parts` - set (to 2 or more) when a folder book's parts look like
  that many separate books (see
  [Folders that may hold several books](../scanner.md#folders-that-may-hold-several-books)).
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
  `J.R.R. Tolkien` and `J. R. R. Tolkien` group). Letters of every script are
  kept, so names in non-Latin scripts get suggestions too and two different
  ones never group by accident. `suggested` is the spelling
  with the most books (ties: the `Given Surname` form over `Surname, Given`, then
  alphabetical); `books` is the group's total. The
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

### `POST /api/v1/admin/books/works`

Which community work each of many books is - how the console's Series cards
place an owned book on a community series rail by identity, whatever its
`series_index` says. Each book's ASIN (preferred) or ISBN is resolved to the id
of the work it belongs to, the same ids as a rail's `series[].works[].id` from
[`GET /libraries/{id}/meta`](#get-apiv1librariesidmeta). Requires the `metadata`
[capability](#get-apiv1server). Display only: no book is changed.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `books` | array | yes | `[ { "library_id": 1, "path": "Andy Weir/The Martian" } ]`, 1 to 100 entries |

```json
{
  "books": [
    { "library_id": 1, "path": "Andy Weir/The Martian" },
    { "library_id": 1, "path": "Andy Weir/Artemis" }
  ]
}
```

Response `200`, one entry per requested book, in request order (`library_id`
and `path` echo the request):

```json
{
  "works": [
    { "library_id": 1, "path": "Andy Weir/The Martian", "work_id": "the-martian", "failed": false },
    { "library_id": 1, "path": "Andy Weir/Artemis", "work_id": "", "failed": false }
  ]
}
```

- `work_id` is `""` when the book has no ASIN or ISBN, the upstream has no
  match for it, its lookup failed, or no book is indexed at the path (an unknown
  `library_id` too).
- `failed` is `true` only when that book's own lookup failed or ran out of
  time, so asking again later may resolve it. A clean "no match" is never
  `failed`, so a client asks again only about the failed books.
- Each distinct identifier is answered from the first of: the book's cached
  enrichment (a book a player has opened carries its work id there, a cached
  "no match" too), the server's own cache of these lookups (the `l:` key space,
  with the enrichment TTLs), then one upstream lookup. Concurrent requests for
  the same identifier share one lookup, upstream lookups from console requests
  are bounded, and the whole batch runs under the enrichment compose deadline,
  so lookups still queued when it fires come back `failed`. A failure is never
  cached here.
- These lookups never slow down or age a player's
  [`/meta`](#get-apiv1librariesidmeta): enrichment never reads the `l:` key space
  nor waits for a console lookup.

| Status | Meaning |
|---|---|
| `400` | `books is required` (an empty list); `invalid request` (malformed body or an unknown key); `code: "too_large"` for more than 100 books |
| `401` / `403` | anonymous / non-admin |
| `404` | `code: "metadata_off"` - community metadata is turned off |
| `500` | `could not load books` - a database failure (an upstream failure is never an error, it is `failed: true`) |

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
      "finished": false, "updated_at": "2026-10-01T19:42:07Z",
      "started_at": "2026-09-12T20:03:10Z", "finished_at": null }
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
- `listeners` - every user's progress on the path, most recent first, with
  the start and finish dates of
  [`GET /admin/users/{id}/progress`](#get-apiv1adminusersidprogress)
  (`started_at` / `finished_at`, `null` when not known).
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
| `chapters.set` | object | chapter index (as a string key) → new title; a title cannot be empty (revert it instead), at most 500 characters. The rename is stored against that chapter's file and start, not its index, so it stays on the same chapter if a rescan inserts or drops others |
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
| `q` | string | free text, matched alongside the book's own facts; at most 300 characters |
| `asin` · `isbn` | string | look an identifier up directly, at most 20 characters each; normalized first (an ASIN uppercased, an ISBN without hyphens and spaces) |

The server asks the community service's **structured match**,
[`GET /api/v1/works/match`](../../meta/api.md#apiv1worksmatch), with the
book's facts as separate guesses, since tags and folder names are each often
wrong:

- what the book's **library path** says (`derivePathFacts`, layout only): the
  top folder as an `author` guess, the folder holding the book as a `series`
  guess, and the book's folder or file name as a `title` guess, sent as named
  (metaserve reads numbering such as `Sharpe - 08 - ` and takes the position
  from it). Disc and track folders (`CD1`, `Track 01`) are dropped first, and a
  plain-number leaf (`Stormlight Archive/03`) is the series' volume rather than
  a title;
- the book's tagged title, author and series (the tagged series only when it
  names another series than the folder), the tagged position (only when no
  different series folder goes up with it, since one position applies to every
  series guess), and its runtime;
- `q`, and the ASIN/ISBN: the typed ones, or the book's own when nothing was
  typed, which metaserve looks up itself.

Each value is cut to 256 bytes, as metaserve reads it. A typed `asin`/`isbn`
with no `q` only looks that identifier up. A book with nothing to match on
(no title, author, series or usable identifier) gets an empty answer without a
request. At most **6** results are expanded into full works with their
recordings. Results are not cached (an admin action, so the fan-out is bounded
instead: work fetches share the same concurrency limit as `GET /meta/work`).

**Older community service.** A metaserve that predates `works/match` answers it
as a missing route (a `404`, since it reads `match` as a work id; a `405`; or a
`200` without `results`). The server then runs the previous lookup and
`works/search` (the typed text, else the tagged title cleaned of its series name
and edition fluff plus the author), concurrently, scored as described below, and
remembers the missing route for **15 minutes** before trying `works/match`
again. A `503` (over metaserve's match budget) or any other `5xx` from
`works/match` is an outage, answered `502`, never a fallback.

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
      "score": 100,
      "reasons": { "identifier": "asin" }
    }
  ]
}
```

- Sorted by `score` (0-100), best first. From `works/match` it is metaserve's
  score: 100 for an identifier hit, otherwise the better of its structured-facts
  score and its typed-text score. `reasons` (optional) passes metaserve's
  account through unchanged, each field present only when the request let it be
  judged: `title` and `text` (similarity, 0-1), `author` (`full`, `surname` or
  `none`), `series` (`position`, `name`, `conflict` or `none`), `runtime` (the
  relative difference of the closest recording, `0.02` = 2%) and `identifier`
  (`asin` or `isbn`). `recording_id` is the recording an identifier named.
- On the fallback search an identifier hit scores 100 (with
  `reasons.identifier`) and names the recording it resolved to in
  `recording_id`; a search hit has no `reasons`, and its score weighs
  title agreement (55), author (30) and runtime (15: within 3% of a recording's
  runtime counts fully, within 10% half); a fact the book or the work lacks is
  left out rather than counted as a mismatch. The title is compared both as
  tagged and cleaned of series name and edition fluff, whichever fits better
  (only the book's side is cleaned, so a work's own "(Dramatized Adaptation)"
  still tells it apart). An author credit counts as a full match when it folds
  equal to one of the work's authors or contains every word of a multi-word
  name (so `Brandon Sanderson, Mary Robinette Kowal` matches both); otherwise
  the word overlap counts. Comparisons keep letters of every script.
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
| `502` | `metadata service unavailable` - the community service failed (including a `503` or `5xx` from `works/match`) and no candidate could be returned. Partial failures still return what was found: on the fallback, if the identifier lookup or the text search fails but the other leg yields candidates, those are returned, and a candidate whose work fails to load is left out. When nothing is returned, any failure along the way (either leg, or loading a hit's work) is a `502`, not an empty list - the failed leg may well have found the book |

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
is not an error. Setting or removing a cover moves the book's
[`cover_version`](#get-apiv1librariesidbooks) at once, so its `cover_color` stops
being sent until the next thumbnail of the new art records one.

| Status | Meaning |
|---|---|
| `400` | `could not read the image`; `invalid library id`; `path is required` |
| `404` | `library not found`; `code: "book_not_found"` (`PUT` only - the path must be an indexed book) |
| `413` | `code: "too_large"` - the image is larger than 5 MiB |
| `415` | `code: "unsupported_image"` - not a JPEG, PNG or WebP image |

### `POST /api/v1/admin/covers`

Cover thumbnails for many books in one request - how the admin console shows
covers in its grids, without a session token in any image URL. Each cover is
resolved like [`GET /libraries/{id}/cover`](#get-apiv1librariesidcover): a
custom cover, then the sidecar image, then embedded art. It never indexes a
path on demand.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `books` | array | yes | `[ { "library_id": 1, "path": "Andy Weir/The Martian" } ]`, 1 to 60 entries |
| `size` | int | no | the longest side of the thumbnail in pixels: `160`, `320` (default) or `640` |

```json
{
  "books": [
    { "library_id": 1, "path": "Andy Weir/The Martian" },
    { "library_id": 1, "path": "Andy Weir/Artemis" }
  ],
  "size": 320
}
```

Response `200`, one entry per requested book, in request order:

```json
{
  "covers": [
    { "library_id": 1, "path": "Andy Weir/The Martian", "data": "data:image/jpeg;base64,/9j/4AAQSkZJRg…" },
    { "library_id": 1, "path": "Andy Weir/Artemis", "data": "" }
  ]
}
```

- `data` is a JPEG thumbnail as a `data:` URL, scaled to fit within `size` x
  `size` (never scaled up; transparency is flattened onto white). It is `""`
  when the book has no art, the art can't be read or decoded, or no book is
  indexed at the path (an unknown `library_id` too).
- Thumbnails are cached in server memory, keyed by the art's version (a custom
  cover's upload time, a file's size and modification time), so a replaced
  cover is picked up on the next request. A source image larger than 40
  megapixels is refused from its header (it reads as no art).
- Each thumbnail also records the book's
  [`cover_color`](#get-apiv1librariesidbooks) (and, at its first thumbnail, the art
  identity behind `cover_version`) when the book lacks them for this art, exactly
  as [`GET /libraries/{id}/cover?size=`](#get-apiv1librariesidcover) does.

| Status | Meaning |
|---|---|
| `400` | `books is required` (an empty list); `size must be one of [160 320 640]`; `invalid request` (malformed body or an unknown key); `code: "too_large"` for more than 60 books |
| `401` / `403` | anonymous / non-admin |
| `500` | `could not load covers` - a database failure (an unreadable image is never an error, it is `""`) |

## Admin: health & jobs

All *Admin*. The queries behind the console's Health > Issues and Health > Jobs
screens (admin console Phase 3). Issues are computed from the index on request;
the only thing stored is an admin's "ignore this", path-keyed. Scans run through
one [job queue](../scanner.md#the-job-queue) and each is recorded in
[`scan_runs`](../scanner.md#scan-history-scan_runs).

### `GET /api/v1/admin/issues`

Every issue category's numbers, the libraries whose folder is offline, and when
a scan last finished.

```json
{
  "categories": [
    { "kind": "scan_error", "count": 2, "ignored": 0,
      "samples": [ { "library_id": 1, "path": "Damaged/The Damaged Book.m4b", "title": "The Damaged Book" } ] },
    { "kind": "duplicate", "count": 1, "ignored": 0, "samples": [ … ] },
    { "kind": "no_cover", "count": 14, "ignored": 3, "samples": [ … ] }
  ],
  "offline": [
    { "library_id": 2, "name": "NAS", "root": "/mnt/nas/books", "books": 812, "listeners": 4 }
  ],
  "checked_at": "2026-10-04T09:12:44Z"
}
```

- `categories` - one entry per kind, always in this order: `scan_error`,
  `suspect`, `split_discs`, `duplicate`, `no_cover`, `unmatched`,
  `no_chapters`, `transcode`. `split_discs` is a book split across disc
  folders (a CD rip read as one book per disc), counted once and listed by its
  first disc; the console's fix sets a `book`
  [folder override](#put-apiv1adminlibrariesidfolder-override) on the folder
  holding the discs, which joins them. Its discs are never also grouped as
  `duplicate`.
  `unmatched` is **left out while community metadata is off** (there is
  nothing to match against). What puts a book in each kind is in
  [Issues](../scanner.md#issues).
- `count` - books that need attention, not counting the ones an admin ignored
  (for `duplicate`, the number of **groups**); `ignored` - how many an admin
  ignored (groups for `duplicate`).
- `samples` - up to three books to show (the newest, or each group's first
  copy), `[]` when none.
- `offline` - libraries whose root can't be read right now (the same probe as
  `available` on [`GET /admin/libraries`](#get-apiv1adminlibraries)), with
  their indexed `books` and how many people have `listeners` progress in them:
  what the scanner kept, since nothing is pruned while a root is offline.
  `[]` when none.
- `checked_at` - when the newest finished scan of any library ended (`""` when
  none has; interrupted runs don't count).

### `GET /api/v1/admin/issues/duplicates`

Groups of books that look like the same book **within one library** (copies in
different libraries are deliberate and never grouped).

| Query param | Type | Notes |
|---|---|---|
| `library_id` | int | one library; a non-positive or non-integer id is `400 invalid library_id` |
| `ignored` | `true` | return **only** the groups an admin said are different books (instead of the open ones) |

```json
{
  "groups": [
    {
      "reason": "same_files",
      "ignored": false,
      "books": [
        { "library_id": 1, "path": "Lewis Carroll/Alice's Adventures in Wonderland", "title": "Alice's Adventures in Wonderland",
          "…": "the rest of a GET /admin/books row", "listeners": 2 },
        { "library_id": 1, "path": "Inbox/Alice (copy)", "…": "…", "listeners": 0 }
      ]
    }
  ]
}
```

- `reason` - `same_files` when the copies' audio is identical (same
  fingerprint and size), otherwise `same_book` (the same ASIN or ISBN, or the
  same author, title and narrator with lengths within a minute or 2%).
- `books` - each copy as a [`GET /admin/books`](#get-apiv1adminbooks) row plus
  `listeners` (people with progress on it), the copy worth keeping **first**
  (better format, then a single file, then the higher bitrate, then more
  listeners).
- `ignored` - every copy in the group is ignored for `duplicate`. Without
  `?ignored=true` only groups with `ignored: false` are returned; with it, only
  the ignored ones. An ignored group becomes open again by itself when a new
  copy joins it.
- At most 500 groups (counted after that filter, so every ignored group can be
  reached), ordered by library and the kept copy's path.

### `POST /api/v1/admin/issues/ignore` · `DELETE /api/v1/admin/issues/ignore`

`POST` stops listing books under one issue kind; `DELETE` lists them again (the
console's Undo and "Show again"). For duplicates, ignore every copy of a group
("They're different books").

```json
{ "kind": "no_cover", "books": [ { "library_id": 1, "path": "Sun Tzu/The Art of War" } ] }
```

- `kind` - one of the eight kinds above.
- `books` - 1 to 1000 `{library_id, path}` refs. The books needn't be indexed:
  the rows are path-keyed durable state (`issue_ignores`), so an ignore
  survives rescans and rebuilds and moves with the book. A ref in a library
  that doesn't exist is skipped.
- Idempotent both ways. Response `204 No Content`.

| Status | Meaning |
|---|---|
| `400` | `invalid request`; `books is required`; `every book needs a library_id and a path`; `unknown issue`; `code: "too_large"` for more than 1000 books |

### `POST /api/v1/admin/libraries/{id}/book/rescan`

Reads one book's files again **now** (tags, ffprobe, cover, read problems) and
returns its book page - the same body as
[`GET /admin/libraries/{id}/book`](#get-apiv1adminlibrariesidbook). `?path=`
required. It runs outside the job queue (one book is quick), so it never waits
behind a library scan. The re-read runs detached from the request, for up to 10
minutes (and never past server shutdown), so on a slow share it is still saved
even if the response times out; the book's next look shows it. The console uses
it for "Read the files again" on a book's page and "Read again" on Health's
unreadable files.

| Status | Meaning |
|---|---|
| `200` | the book page, re-read; check `book.scan_error` to see whether the problem is gone |
| `400` | `invalid library id`; `path is required` |
| `404` | `library not found`; `code: "not_indexable"` - there is no book at that path any more (gone from disk, not a book, or skipped by the library's ignore rules) |

### `GET /api/v1/admin/jobs`

The scan running now (with live progress), the scans waiting behind it, and
every scheduled library's next scan.

```json
{
  "running": {
    "id": 7, "kind": "scan", "library_id": 1, "library_name": "Audiobooks",
    "trigger": "manual", "started_by": 1,
    "queued_at": "2026-10-04T09:12:40Z", "started_at": "2026-10-04T09:12:41Z",
    "run_id": 31,
    "progress": { "running": true, "total": 812, "done": 394, "indexed": 6,
                  "added": 2, "updated": 4, "moved": 1, "removed": 0 }
  },
  "queued": [
    { "id": 8, "kind": "scan", "library_id": 2, "library_name": "Kids",
      "trigger": "schedule", "started_by": null, "queued_at": "2026-10-04T09:13:00Z" }
  ],
  "schedules": [
    { "library_id": 2, "library_name": "Kids", "schedule": "every:6h", "next_at": "2026-10-04T15:13:00Z" }
  ]
}
```

- `running` - the running job, or `null` when the queue is idle. `progress` is
  the library's scan progress (the object of
  [`GET …/scan`](#get-apiv1adminlibrariesidscan)); `run_id` is its
  [scan run](#get-apiv1adminscan-runsid) once the run is recorded.
- `queued` - waiting jobs in the order they will run (`[]` when none). Jobs
  live in memory: their ids restart from 1 with the server, and a waiting job
  doesn't survive a restart.
- A job's `kind` is always `"scan"`; `trigger` is `manual` (an admin asked),
  `schedule`, `startup` or `change` (a library or folder setting changed);
  `started_by` is the admin's user id, `null` for a schedule or startup.
- `schedules` - every library with a schedule, with its `schedule` string and
  `next_at` (RFC 3339, UTC); `[]` when none.

The console polls this every second while a job runs or waits, every 15
seconds otherwise.

### `DELETE /api/v1/admin/jobs/{id}`

Drops a queued job, or stops the running one. A stopped scan ends during its
folder walk or at its next book, **before** the prune step, so nothing is
removed from the index; its run is recorded as `cancelled`. A prune already
under way is never interrupted (it is one transaction) and finishes first.
Dropping a queued scheduled scan skips that slot of the schedule. `204 No Content`. `400 invalid job id`; `404 no such
job (it may have finished)`.

### `GET /api/v1/admin/scan-runs`

Recorded scans, newest first, without their logs.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `library_id` | int | - | one library; `400 invalid library_id` for a non-positive or non-integer id |
| `before` | int | - | a run id: only older runs (the next page) |
| `limit` | int | `50` | ≤ 0 or > 200 falls back to 50 |

```json
{
  "runs": [
    { "id": 31, "library_id": 1, "library_name": "Audiobooks", "trigger": "manual",
      "started_by": 1, "started_by_name": "admin",
      "started_at": "2026-10-04T09:12:41Z", "finished_at": "2026-10-04T09:13:03Z",
      "status": "ok", "books": 812, "added": 2, "updated": 4, "moved": 1, "removed": 1, "errors": 1 }
  ],
  "next_before": 31
}
```

- `status` - `running`, `ok`, `partial` (part of the folder couldn't be read,
  so nothing was removed), `unavailable` (the root was unreachable; nothing
  removed; also a root that didn't answer within 2 seconds), `failed` (nothing
  removed), `cancelled` (stopped by an admin; nothing removed) or `interrupted` (the server stopped mid-scan).
- `books` - books discovered on disk; `added` / `updated` / `moved` /
  `removed` - what the scan changed (a moved or renamed book counts once, as
  `moved`; a book joined from its disc folders, or split back into them, is a
  reshape counted in neither `added` nor `removed`); `errors` - books whose files had a read
  problem, plus index writes that failed.
- `started_by_name` is omitted for a schedule or startup scan, or once the
  account is deleted (`started_by` is then `null`). `finished_at` is `null`
  while the scan runs.
- `next_before` is present when the page is full: pass it as `before` for the
  next page.
- Only the newest **100** runs of each library are kept.

### `GET /api/v1/admin/scan-runs/{id}`

One recorded scan, the same object with its `log`:

```json
{
  "id": 31, "library_id": 1, "library_name": "Audiobooks", "trigger": "manual", "…": "…",
  "log": [
    { "at": "2026-10-04T09:12:41Z", "level": "info", "kind": "started", "path": "/srv/audiobooks" },
    { "at": "2026-10-04T09:12:41Z", "level": "info", "kind": "discovered", "count": 812 },
    { "at": "2026-10-04T09:12:42Z", "level": "info", "kind": "moved",
      "path": "Old Folder/Book", "to": "New Folder/Book" },
    { "at": "2026-10-04T09:12:55Z", "level": "warn", "kind": "problem",
      "path": "Damaged/The Damaged Book.m4b", "code": "probe_failed",
      "detail": "[mov,mp4,m4a,3gp,3g2,mj2 @ 0x7f8c] moov atom not found; Invalid data found when processing input" },
    { "at": "2026-10-04T09:13:03Z", "level": "info", "kind": "removed", "path": "Gone/Book" },
    { "at": "2026-10-04T09:13:03Z", "level": "info", "kind": "finished", "count": 812 }
  ]
}
```

Each event has `at`, `level` (`info`, `warn` or `error`) and `kind`, plus the
facts the kind needs: `path`, `to` (a move's destination), `code` (a read
problem's code, as `scan_error`), `detail` (a tool's or the OS's own message)
and `count`. Kinds: `started`, `discovered`, `unreadable`, `moved`, `joined`
(a disc book at `path` joined into the book at `to`; `code` `length_unknown`
when its listening state stayed with the disc because an earlier disc's length
is unknown), `split` (the joined book at `path` read as its discs again),
`problem`, `error`, `removed`, `partial` and `truncated` (a log keeps at most 300 events,
at most half of them problems; this line counts the ones dropped), then one closing event saying how the scan
ended: `finished`, `unavailable`, `failed`, `cancelled` or `interrupted`. A removed book leaves nothing in the index but its `removed`
line here - see [Prune](../scanner.md#prune-what-a-removed-book-leaves-behind).
`404 no such scan`; `400 invalid run id`.

## Admin: activity

All *Admin* (a non-admin gets `403`). Listening sessions, signed-in devices and
an admin's edits of someone's progress: the API behind the admin console's
Activity screens, People > Devices and the progress menus on a person's page
and a book's page. Sessions are derived on the server from the
progress saves players already make - see
[Listening sessions](../data-model.md#listening-sessions-how-they-are-derived)
for the rules (session gap and continuation, listened time, what isn't
counted). A session with no listening recorded yet (a single save, such as a
"mark finished") is left out of both session routes and of the stats, so a
session appears from its second save. A **device** is
a signed-in token: a session (a paired phone, a browser) or a personal API key,
never a pairing token. Its app comes from the
[`X-AudioSilo-Client`](index.md#client-identification-x-audiosilo-client)
header.

The session object, shared by both session routes:

```json
{
  "id": 412,
  "user_id": 4,
  "username": "sam",
  "library_id": 1,
  "path": "Brandon Sanderson/Mistborn/The Final Empire",
  "title": "The Final Empire",
  "author": "Brandon Sanderson",
  "device_id": 57,
  "device_name": "Pixel 9",
  "client": { "app": "AudioSilo", "version": "1.4.2", "platform": "android" },
  "started_at": "2026-10-04T19:02:11.000Z",
  "last_at": "2026-10-04T19:41:56.000Z",
  "start_position": 10620.4,
  "position": 12043.6,
  "duration": 88347.4,
  "speed": 1.25,
  "listened": 1138.9,
  "codec": "aac",
  "transcoded": false,
  "finished": false,
  "backfilled": false,
  "state": "playing",
  "chapter": "Chapter 12",
  "ip": "192.168.1.24"
}
```

- `title` / `author` come from the index; `""` when the book isn't indexed
  (any more), in which case `path` names it.
- `device_id` is the token's id - the `id` that
  [`GET /admin/devices`](#get-apiv1admindevices) lists. `device_name` and
  `client` are copied onto the session when it is recorded, so they survive the
  device's sign-out. `client` is `null` for an app that never named itself
  (players released before the header).
- Times are UTC with milliseconds. `started_at` is the first save of the
  session, `last_at` the newest.
- `start_position` / `position` are the book positions (seconds) at the first
  and newest save; `duration` and `speed` are the newest save's.
- `listened` is **wall-clock seconds** of playback in the session, not book time.
- `codec` is the book's indexed codec when the session started (`""` unknown);
  `transcoded` is true when the same device streamed a file of this book with
  `?transcode=1` during the session.
- `backfilled` is true for a session made at the upgrade to migration 0021 from
  the players' own listening spans, from before the server recorded sessions:
  `device_id` is `0`, `device_name` `""`, `client` `null` and `codec` `""`.
- `finished` - a save in the session marked the book finished.
- `state` - `playing` (a save within the last 60 seconds), `paused` (within 10
  minutes) or `ended`. A session can come back from `ended`: a late save whose
  position advanced by about the time that passed (a phone that kept playing
  without saving) continues it, up to 12 hours after its last save.
- `chapter` (the chapter title at `position`) and `ip` (the device's newest
  address) are present on **live** sessions only.

### `GET /api/v1/admin/sessions/live`

Who is listening now: the open sessions (a save within the last 10 minutes),
newest first, **one per device** - a device that moved on to another book shows
only the book it is on now. Each carries `chapter` and `ip`.

```json
{ "sessions": [ { "id": 412, "username": "sam", "state": "playing", "…": "…" } ] }
```

`sessions` is `[]` when nobody is listening.

### `GET /api/v1/admin/sessions`

Sessions newest first (open ones included), a page at a time.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `user_id` | int | - | one listener |
| `library_id` | int | - | one library |
| `path` | string | - | one book; needs `library_id` |
| `before` | int | - | a session id: only older sessions (the next page) |
| `limit` | int | `50` | ≤ 0 or > 200 falls back to 50 |

```json
{ "sessions": [ { "id": 412, "…": "…" } ], "next_before": 363 }
```

`next_before` is the id to pass as `before` for the next page, `null` on the
last page. `400` `invalid user_id` / `invalid library_id` / `invalid before`
(not a positive integer); `400` `path needs library_id`.

### `GET /api/v1/admin/devices`

Signed-in devices - live (not revoked, not expired) session tokens and API keys
- of one person (`?user_id=`) or of everyone, most recently seen first.

```json
{
  "devices": [
    {
      "id": 57,
      "user_id": 4,
      "username": "sam",
      "kind": "session",
      "name": "Pixel 9",
      "client": { "app": "AudioSilo", "version": "1.4.2", "platform": "android" },
      "created_at": "2026-07-02T11:20:31Z",
      "last_seen": "2026-10-04T19:41:56Z",
      "last_ip": "192.168.1.24",
      "current": false
    }
  ]
}
```

- `kind` - `session` or `api`. `name` is the device name the player sent at
  sign-in (an API key's label).
- `client` - the app the token last reported, `null` until a request names one
  (players released before the header stay `null`).
- `last_seen` - the newest authenticated request, `null` before any.
  `last_ip` - that request's address (`""` before any). Both are overwritten
  each time; no history of addresses is kept.
- `current` - the token making this request.

`devices` is `[]` when there are none. `400 invalid user_id` for a non-positive
or non-integer id.

### `DELETE /api/v1/admin/devices/{id}`

Signs one device out by revoking its token, whoever owns it. The person's
other devices stay signed in. `204 No Content`.

| Status | Meaning |
|---|---|
| `400` | `invalid device id` |
| `404` | `device not found` - no live session or API key with that id (already signed out, a pairing token, or unknown) |
| `409` | `code: "current_device"` - the token making this request; sign out of the console instead |

### `GET /api/v1/admin/users/{id}/progress`

One person's progress on every book, most recently saved first. Not filtered
by shares (admin view).

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
      "updated_at": "2026-10-04T19:41:56Z",
      "title": "The Final Empire",
      "author": "Brandon Sanderson",
      "started_at": "2026-09-12T20:03:10Z",
      "finished_at": null
    }
  ]
}
```

The [progress fields](#get-apiv1meprogress) plus `title` / `author` (`""` when
not indexed) and the dates: `started_at` is the time of the first save (`null`
for rows saved before the server recorded it), `finished_at` the time of the
save that last marked it finished, or of the admin edit that did (`null` while unfinished; finished rows from before were given
their last save time). `400 invalid user id`; `404 user not found`.

### `PATCH /api/v1/admin/libraries/{id}/progress`

An admin's edit of someone's progress on a book (`?path=` and `?user_id=`
required). Any subset of:

| Body field | Type | Notes |
|---|---|---|
| `finished` | bool | `true` moves the position to the end and stamps the finish now (unless `finished_at` is given); `false` clears the finish date and keeps the position (unless `position` is given) |
| `position` | float | seconds; between `0` and the book's duration |
| `started_at` | string \| null | RFC 3339 or `YYYY-MM-DD` (the start of that day, server time); `null` clears it |
| `finished_at` | string \| null | RFC 3339 or `YYYY-MM-DD` (the **end** of that day, server time, or now if that is sooner); `null` clears it; needs the book to be (or become) finished |

A day-only finish date counts from the end of its day so that a book started
and finished on the same day fits: a start at 15:00 and a finish "today" is a
finish after the start, not at the midnight before it.

A field left out stays as it is. When the person has no progress on the book
yet but it is indexed, the row is created (its start stamped now), but only if
**the person** can see the book: their own access (whole libraries and shares;
an admin target sees everything), not the access of the admin making the call.
Otherwise the edit is refused with `409` `no_access` and nothing is written.
Progress the person already has stays editable after their access is taken
away, so an admin can still tidy it. The write is
stamped with the server's time and a higher `version`, so it beats what a
device saved before it under last-write-wins, while a device still playing the
book overrides it on its next save.

Response `200`: `{ "progress": { … } }` - the object of
[`GET /admin/users/{id}/progress`](#get-apiv1adminusersidprogress).

| Status | Meaning |
|---|---|
| `400` | `invalid user_id`; `path is required`; `invalid request` (malformed body, an unknown key or an unparseable date); `those dates or that position don't fit this book` - a finish date on an unfinished book, a finish before the start, a date more than a day in the future, or a position outside the book |
| `404` | `user not found`; `library not found`; `code: "book_not_found"` - no progress at that path and no indexed book there |
| `409` | `code: "no_access"` - no progress at that path, and the person can't see the book; give them access first |

`409` rather than `403`, because the admin is allowed to make the call (a `403`
from an `/admin` route tells the console its own session lost the admin role).
A path with neither progress nor an indexed book is `404 book_not_found` whatever
the person's access.

## Admin: stats

### `GET /api/v1/admin/stats`

*Admin.* Powers the console dashboard: catalog totals, per-library counts, and
a cross-user "currently listening" feed (up to 200 rows, newest first; `title`/
`author` may be empty if the scan hasn't reached a path yet; an empty list, never
`null`, when nobody has listened yet).

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

#### `?range=`: listening activity

| Query param | Type | Default | Notes |
|---|---|---|---|
| `range` | string | - | `7d`, `30d`, `90d`, `1y` (365 days) ending now; a calendar year such as `2025` (from 2000 to this year; the current year ends now); or `year`, the current calendar year in **server** time. An empty value means `30d` |

With `range` present the response is **only** an **`activity`** object
(`{"activity": {…}}`), the Activity page for the period, without the overview
fields above; without it the response is exactly the one above. An unknown range is
`400` `code: "invalid_range"`. Days, hours and weekdays are counted in the
**server's** time zone.

```json
{
  "activity": {
    "range": "30d",
    "from": "2026-09-04T19:42:08Z",
    "to": "2026-10-04T19:42:08Z",
    "timezone": "BST",
    "utc_offset": 60,
    "totals":   { "listened": 412380.5, "sessions": 214, "listeners": 4, "books": 23, "finished": 3 },
    "estimated": 0,
    "previous": { "listened": 388012.0, "sessions": 199, "listeners": 4, "books": 19, "finished": 2 },
    "days": [
      { "date": "2026-09-04", "listened": 9021.3,
        "by_user": [ { "user_id": 4, "listened": 7200.0 }, { "user_id": 6, "listened": 1821.3 } ] }
    ],
    "hour_weekday": [ [0, 0, "… 24 values …"], "… 7 rows, Monday first …" ],
    "top_books": [ { "library_id": 1, "path": "Brandon Sanderson/Mistborn/The Final Empire",
                     "title": "The Final Empire", "author": "Brandon Sanderson",
                     "listened": 38211.0, "listeners": 2 } ],
    "top_authors":   [ { "name": "Brandon Sanderson", "listened": 61022.4, "books": 3 } ],
    "top_narrators": [ { "name": "Michael Kramer", "listened": 61022.4, "books": 3 } ],
    "top_users": [ { "user_id": 4, "username": "sam", "listened": 201330.2,
                     "sessions": 96, "books": 9, "finished": 2 } ],
    "funnel": { "started": 31, "reached_25": 22, "reached_50": 15, "reached_75": 9, "finished": 6 },
    "drop_offs": [ { "library_id": 1, "path": "Old Books/The Long One", "title": "The Long One",
                     "chapter_index": 3, "chapter": "Chapter 4", "listeners": 2, "scan_error": false } ],
    "playback": [ { "transcoded": false, "codec": "aac", "listened": 380112.5, "sessions": 190 },
                  { "transcoded": true, "codec": "opus", "listened": 32268.0, "sessions": 24 } ],
    "peak_concurrent": { "streams": 3, "at": "2026-09-21T20:14:03Z" },
    "clients": [ { "app": "AudioSilo", "version": "1.4.2", "platform": "ios", "devices": 3 },
                 { "app": "", "version": "", "platform": "", "devices": 1 } ],
    "growth": [ { "date": "2026-09-04T19:42:08Z", "books": 1270 },
                { "date": "2026-10-04T19:42:08Z", "books": 1284 } ],
    "storage": {
      "bytes": 912345678901,
      "by_library": [ { "library_id": 1, "name": "Audiobooks", "bytes": 880000000000, "books": 1201 } ],
      "by_format":  [ { "key": "m4b", "bytes": 700000000000, "books": 811 } ],
      "by_codec":   [ { "key": "aac", "bytes": 760000000000, "books": 990 } ]
    },
    "coverage": { "books": 1284, "identified": 802, "with_chapters": 1100, "with_cover": 1250 },
    "inactive_users": [ { "user_id": 9, "username": "old-tablet", "last_seen_at": "2026-06-01T10:00:00Z" } ]
  }
}
```

Listening (`totals`, `days`, `hour_weekday`, the `top_*` lists, `playback`,
`peak_concurrent`, `clients`) comes from listening sessions that recorded some
listening, and for days older than the
raw retention from the daily totals they were rolled up into. A session's
listened time is spread evenly over the hours between its first and last save,
and only the part inside the period counts.

- `range` echoes the period (`year` answers with the year it resolved to, such
  as `"2026"`, so a client whose clock is on the other side of New Year from
  the server learns the server's year); `from` / `to` are its bounds (RFC 3339, UTC; `to`
  is rounded up to the next whole second). `timezone` is the server zone's
  abbreviation at `to` and `utc_offset` its offset from UTC in minutes.
- `totals` - `listened` (wall-clock seconds), `sessions` (sessions that started
  in the period), `listeners` (people who listened), `books` (books listened
  to), `finished` (books whose finish date falls in the period). `previous` is
  the same for the period of equal length just before `from`, for deltas.
- `estimated` - how many of `totals.listened`'s seconds are estimates: listening
  from before the server recorded sessions that the players' spans didn't cover
  (see [Listening from before sessions](../data-model.md#listening-from-before-sessions)).
  Estimates count in `totals` and the `top_*` lists, never in `days` or
  `hour_weekday`. Sessions backfilled from spans count everywhere but `clients`
  and `playback`.
- `days` - one entry per day of the period, oldest first, zero days included;
  `by_user` lists each listener's seconds that day (`[]` on a quiet day).
- `hour_weekday` - listened seconds as 7 rows (weekday, **0 = Monday**) of 24
  hours. Raw sessions only: a rolled-up day has no hours.
- `top_books`, `top_authors`, `top_narrators`, `top_users` - up to 10 each, by
  listened time. Authors and narrators are the whole field value (as the
  Library aggregates count them); `books` counts distinct books.
  `top_users[].finished` counts that person's books finished in the period.
- `funnel` - people x books with a progress save in the period, by how far each
  got (the current position, so a restarted book counts where it is now; a
  finished book counts as 100%).
- `drop_offs` - up to 5 chapters where at least two people stopped the same
  book: unfinished progress with no save for 30 days. `chapter_index` is
  0-based; `scan_error` says the book has a read problem the Health page lists.
  Independent of the period.
- `playback` - listening by how it played: direct or `transcoded`, per `codec`
  (`""` unknown), with `listened` in the period and `sessions` started in it.
- `peak_concurrent` - the most sessions open at once in the period
  (`streams`), and when (`at`, `null` with none).
- `clients` - the devices that listened in the period (raw sessions only),
  counted once per app build, using the app each session recorded at the time
  (a later upgrade doesn't rewrite the past). `app: ""` is a client that never
  named itself (released before the header).
- `growth` - the number of books indexed now that had appeared on disk by each
  sample `date` (RFC 3339): daily for a period up to a month, weekly up to a
  quarter, monthly beyond, ending at `to`. Books removed since aren't counted
  back.
- `storage` - the collection now: total `bytes`, `by_library` (in library
  order), `by_format` and `by_codec` (`key: ""` = unknown).
- `coverage` - books now, and how many have an ASIN or ISBN (`identified`),
  more than one chapter (`with_chapters`) and a cover (`with_cover`).
- `inactive_users` - enabled, non-demo accounts with no authenticated request
  for 60 days (an account that never made one counts once it is that old;
  `last_seen_at` is then `null`), longest idle first. Independent of the period.

Every list in `activity` is `[]`, never `null`, when empty.

### `GET /api/v1/admin/listening`

*Admin.* Listening per day over a period, of everyone or of one person: the
same `days` the [Activity page](#range-listening-activity) reports, without
computing the rest of it. The console's Overview reads it for the year
calendar, and a person's page for their listening year (`range=year`, with
`utc_offset` to place their finish dates in the server's year).

| Query param | Type | Default | Notes |
|---|---|---|---|
| `range` | string | `30d` | as [`/admin/stats?range=`](#range-listening-activity): `7d`, `30d`, `90d`, `1y`, a calendar year, or `year` (the server's current year) |
| `user_id` | int | - | one person's listening; everyone's without it |

```json
{
  "range": "2026",
  "from": "2025-12-31T23:00:00Z",
  "to": "2026-10-04T19:42:08Z",
  "timezone": "BST",
  "utc_offset": 60,
  "days": [
    { "date": "2026-01-01", "listened": 3120.4,
      "by_user": [ { "user_id": 4, "listened": 3120.4 } ] }
  ]
}
```

`range`, `from`, `to`, `timezone` and `utc_offset` as in `activity` (`year`
answers with the year itself); `days` is one entry per
day of the period, oldest first, zero days included, in server time. With
`user_id`, `listened` and `by_user` hold only that person's listening.
`400` `code: "invalid_range"`; `400 invalid user_id`; `404 user not found`.

## Admin: settings

The server settings the admin console's **Server > Settings** edits. The
envelope is keyed by section, and each setting's id is `<section>.<name>`; the
settings table in `internal/config/settings.go` says which `config.yaml` key
and `AUDIOSILO_*` variable each one is, and whether it needs a restart (see
[Changing settings at runtime](../configuration.md#changing-settings-at-runtime)).

### `GET /api/v1/admin/settings`

*Admin.* Returns the current settings.

```json
{
  "general": {
    "name": "Hearthside",
    "public_url": "https://books.example.com",
    "update_check": true,
    "session_days": 400
  },
  "network": {
    "bind": "0.0.0.0:8080",
    "tls_mode": "selfsigned",
    "tls_hosts": [],
    "trusted_proxies": ["10.0.0.2/32"],
    "cors_origins": []
  },
  "players": {
    "web_dir": "/app/web",
    "web_player": "dir",
    "apple_app_ids": [],
    "android_package": "",
    "android_sha256": []
  },
  "metadata": {
    "enabled": true,
    "base_url": "https://meta.audiosilo.app",
    "available": true
  },
  "demo": {
    "enabled": false,
    "library": "",
    "max_users": null,
    "max_users_default": 200,
    "idle_ttl": "24h"
  },
  "backups": {
    "schedule": "daily:03:00",
    "keep": 7,
    "dir": ""
  },
  "locked": { "players.web_dir": "AUDIOSILO_WEB_DIR" },
  "restart_settings": [
    "network.bind", "network.tls_mode", "network.tls_hosts", "players.web_dir",
    "metadata.base_url", "demo.enabled", "demo.idle_ttl", "backups.dir"
  ],
  "restart_pending": []
}
```

Every value is the **saved** one (what `config.yaml` now holds, with the
environment's values for keys a variable sets); a restart setting saved since
the server started is listed in `restart_pending` until a restart puts it in
effect. Lists are never `null`.

| Field | Meaning |
|---|---|
| `general.name` | display name; `""` means `"AudioSilo"` (what `GET /server` then reports) |
| `general.public_url` | `""` = derived from each request's host |
| `players.web_dir` | read-only: changed only in `config.yaml` or `AUDIOSILO_WEB_DIR` |
| `players.web_player` | read-only: where `/web` is served from - `"embedded"` (baked into the build), `"dir"` (from `web_dir`) or `""` (not mounted) |
| `metadata.available` | read-only: a metadata service exists (`base_url` was a valid absolute `http(s)` URL when the server started), so `enabled` can be turned on. The live `metadata` [capability](#get-apiv1server) is `enabled && available` |
| `demo.max_users` | `null` = the default cap (`max_users_default`); `0` = no limit |
| `demo.idle_ttl` | `""` = 24h |
| `backups.schedule` | `""` (off), `daily:HH:MM` or `weekly:DAY:HH:MM` in the server's time zone; stored in canonical form (see [Backups](#admin-backups)) |
| `backups.keep` | how many scheduled backups are kept, 1-365 (manual and before-restore backups stay until deleted) |
| `backups.dir` | read-only: changed only in `config.yaml` or `AUDIOSILO_BACKUP_DIR`; `""` = `<data>/backups` (`GET /admin/backups`' `status.dir` has the folder in use) |
| `locked` | setting id → why the console can't change it: the `AUDIOSILO_*` variable that set it, or `"launcher"` (a launcher override, the desktop manager's `bind`, `tls.mode` and `public_url`) |
| `restart_settings` | the setting ids read only at start (fixed) |
| `restart_pending` | restart settings whose saved value differs from the one the server started with |

### `PATCH /api/v1/admin/settings`

*Admin.* Changes settings, writes them to `config.yaml` and applies them.
The body has the `GET` envelope's shape with **only the settings to change**:

```json
{ "general": { "name": "Hearthside" }, "network": { "trusted_proxies": ["10.0.0.2"] } }
```

A change is **all or nothing**: each value is normalized and checked (the
rules are in
[Changing settings at runtime](../configuration.md#changing-settings-at-runtime)),
then the config as a whole is validated, and one refused setting leaves
everything as it was. Settings that apply at once do so for the next request;
a restart setting is saved and appears in `restart_pending`. The answer is the
`GET` envelope with the new state, so `trusted_proxies` above comes back as
`["10.0.0.2/32"]`.

A refusal names the setting in `field` (its id), with the reason in `error`
written so a form can show it under the field:

```json
{ "error": "must be host:port, like 0.0.0.0:8080 or :8080", "code": "invalid_setting", "field": "network.bind" }
```

| Status | `code` | Meaning |
|---|---|---|
| `200` | | saved; body is the settings envelope |
| `400` | | not a JSON object of sections |
| `400` | `invalid_setting` | a value of the wrong type, one its normalizer refuses, a config that doesn't validate (e.g. `tls_mode: "autocert"` without `tls_hosts`, demo on without a library), a `demo.library` that names no library (`field: "demo.library"`), a change that would leave `config.yaml` invalid on its own because a value it needs comes only from an `AUDIOSILO_*` variable (the file keeps its own values for those; e.g. `demo.enabled: true` while the library is only in `AUDIOSILO_DEMO_LIBRARY`; the `error` names the variable), a `general.session_days` outside 30-3650, or turning `metadata.enabled` on when no metadata service exists (`available` is false; `field: "metadata.enabled"` - set a valid `metadata.base_url` and restart first). Also JSON `null` for a setting that can't be unset (anything but `demo.max_users`, whose `null` means the default), refused with "enter a value" |
| `400` | `unknown_setting` | a section or name that isn't a setting (including the read-only extras such as `metadata.available`) |
| `400` | `setting_read_only` | `players.web_dir` or `backups.dir` |
| `409` | `setting_locked` | a setting an environment variable or the launcher sets (see `locked`) |
| `500` | | `config.yaml` couldn't be written; nothing changed |

Turning `metadata.enabled` on or off takes effect immediately across the
server: it gates `GET /libraries/{id}/meta` and the `metadata` capability, so
every connected player starts or stops showing the enriched-book section.
Turning `general.update_check` off stops the [update check](#get-apiv1adminupdate)
at once, and a new `backups.schedule` or `backups.keep` is handed to the backup
service at once (the next scheduled backup is counted again). Every save is
recorded in the [audit log](#admin-audit-log) as `settings.update`, each
changed setting with its old and new value.

## Admin: system, updates and logs

What the console's Health > System, Server > About and Server > Logs show. All
*Admin*; a member's token gets `403`.

### `GET /api/v1/admin/system`

*Admin.* Everything the server depends on, in one answer:

```json
{
  "name": "Hearthside",
  "server_id": "kx8Qz1c7m2Vw0aB3dEfGh",
  "version": "1.16.0",
  "go_version": "go1.25.1",
  "os": "linux",
  "arch": "amd64",
  "install": "docker",
  "started_at": "2026-10-04T08:12:31Z",
  "data_dir": "/data",
  "database": { "bytes": 18874368, "schema": "0019_audit_notifications.sql" },
  "tools": [
    { "name": "ffmpeg", "path": "/usr/bin/ffmpeg", "version": "6.1.1", "source": "local" },
    { "name": "ffprobe", "path": "/usr/bin/ffprobe", "version": "6.1.1", "source": "local" }
  ],
  "metadata": {
    "enabled": true,
    "available": true,
    "base_url": "https://meta.audiosilo.app",
    "health": { "reachable": true, "latency_ms": 84, "checked_at": "2026-10-04T09:40:02Z" }
  },
  "tls": {
    "mode": "autocert",
    "hosts": ["books.example.com"],
    "certificates": [
      { "host": "books.example.com", "issued": true, "subject": "books.example.com",
        "issuer": "R11", "not_before": "2026-09-01T00:00:00Z", "not_after": "2026-11-30T00:00:00Z",
        "self_signed": false, "dns_names": ["books.example.com"] }
    ]
  },
  "libraries": [
    { "id": 1, "name": "Books", "root": "/library", "available": true,
      "disk": { "total": 4000787030016, "free": 1210012344320 } }
  ],
  "web_player": "embedded",
  "update": { "enabled": true, "current": "1.16.0", "latest": null, "update_available": false,
              "comparable": true, "checked_at": null, "error": "", "install": "docker" },
  "backups": { "dir": "/data/backups", "running": false, "last": null,
               "latest": { "name": "audiosilo-20261004-020000Z-scheduled.db", "size": 1339392,
                           "created_at": "2026-10-04T02:00:00Z", "kind": "scheduled" },
               "next": "2026-10-05T03:00:00+01:00" }
}
```

| Field | Meaning |
|---|---|
| `name` | the display name (`"AudioSilo"` when unset) |
| `version` | as in `GET /server`: stamped from the release tag (`"dev"` for a local build) |
| `install` | `"docker"` (a container: `/.dockerenv` or `/run/.containerenv` exists), `"binary"` (a release build) or `"source"` (version `dev`); the console words its "how to update" on it |
| `started_at` | when the server started |
| `database` | `bytes`: pages in use × page size (the WAL isn't counted); `schema`: the newest applied migration |
| `tools` | ffmpeg then ffprobe. `path` `""` when off or not found; `version` from `-version` (cached per path; `""` if it didn't say); `source` `"local"` (configured, next to the binary or on `PATH`), `"downloaded"` (in `<data>/tools`), or `""` |
| `metadata` | `enabled` is the live switch; `available` and `base_url` are the service the server started with (a saved new `base_url` waits for a restart) |
| `metadata.health` | the service's `/healthz`: `reachable`, `latency_ms`, `checked_at` and `error` when it didn't answer. Cached for a minute, and asked **only while the lookup is on**; `null` while it's off |
| `tls` | the boot `tls.mode` and `tls.hosts`, and the certificates it serves, read from their files (never generated or requested here): the self-signed pair, or one per host from the autocert cache (`issued: false` until Let's Encrypt has issued it). Empty for mode `off`. `error` is set when a certificate file couldn't be read |
| `libraries[]` | each library's root, whether it answers (the same bounded probe as the scanner's), and `disk` (`total`, `free` to the server, in bytes) or `null` when the root doesn't answer or the OS doesn't say |
| `web_player` | as in the settings envelope |
| `update` | the [update status](#get-apiv1adminupdate) |
| `backups` | the backups' `status` as in [`GET /admin/backups`](#get-apiv1adminbackups) (folder, running, last attempt, latest backup, next scheduled one); `null` only for a server built without the backup service (tests), never one the launcher starts |

Nothing here reaches outside the server except the metadata health check. The
slow parts (a tool's first `-version`, the health check, the root probes) run
side by side, each with its own bound.

### `GET /api/v1/admin/update`

*Admin.* The update check's state (the console's Overview reads it for the
"*version* available" link):

```json
{
  "enabled": true,
  "current": "1.15.0",
  "latest": {
    "version": "v1.16.0",
    "name": "v1.16.0",
    "url": "https://github.com/KodeStar/audiosilo-server/releases/tag/v1.16.0",
    "published_at": "2026-10-01T12:00:00Z"
  },
  "update_available": true,
  "comparable": true,
  "checked_at": "2026-10-04T08:13:31Z",
  "error": "",
  "install": "docker"
}
```

| Field | Meaning |
|---|---|
| `enabled` | the `update_check` setting |
| `current` | the running version (release builds report it without the tag's `v`) |
| `latest` | the newest release the last successful check found, or `null` before one |
| `update_available` | `latest` is newer than `current`; always false when `comparable` is false |
| `comparable` | `current` is a release version (`MAJOR.MINOR.PATCH`, with or without a `v`, optionally `-prerelease`); false for a local build (`dev`) or a development image (`dev-<commit>`) |
| `checked_at` | the last request, successful or not; `null` before the first |
| `error` | why the last request failed: `"rate_limited"`, `"unreachable"`, `"bad_response"`, or `""` |
| `install` | as in `GET /admin/system` |

The checker asks GitHub a minute after the server starts and then at most once
a day, only while the check is on; see
[Update check](../configuration.md#update-check) for exactly what it sends.

### `POST /api/v1/admin/update/check`

*Admin.* Checks now and answers with the new status (the shape above). Within a
minute of the last request (or while one is in flight) it answers with that
request's result instead of asking GitHub again. A failed request is not an
error here: it is reported in `error`.

| Status | Meaning |
|---|---|
| `200` | the update status |
| `409` `update_check_off` | the update check is turned off |

### `GET /api/v1/admin/logs`

*Admin.* The newest log lines. The server keeps every record at **info** and
above in memory (`internal/logring`, the newest 2000), from when it started;
nothing is written to disk.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `level` | string | all | `info`, `warn` or `error`: lines at that level or above (`all`, `debug` and `""` mean every line) |
| `q` | string | - | only lines whose message or a `key=value` attribute contains it, ignoring case (cut at 200 characters) |
| `after` | int | - | only lines with `seq` greater than this: the live tail's cursor (`last_seq` of the previous answer) |
| `limit` | int | `500` | at most this many, the **newest** matching ones (1-1000) |

```json
{
  "entries": [
    { "seq": 41, "time": "2026-10-04T09:40:12.511Z", "level": "info",
      "message": "scan complete",
      "attrs": [ { "key": "library", "value": "Books" }, { "key": "books", "value": "8" } ] }
  ],
  "last_seq": 41,
  "truncated": false
}
```

`entries` are oldest first, and each entry's `attrs` is always an array
(empty when the line has none). `seq` increases by one per line logged, so the
console polls with `after=<last_seq>` and appends what comes back. `last_seq`
is the newest line in memory whether or not it matched. `truncated` is true
when matching lines were left out: older ones past `limit`, or lines after
`after` that were already dropped from memory. An `after` beyond the newest
line (a cursor from before the server restarted, since `seq` starts over at 1)
is answered as a fresh first page, marked `truncated`, so a live tail picks up
the new process. Attributes in a group have dotted keys (`req.path`); an
attribute whose dotted key names a secret (a word such as `token`, `password`,
`code`, `key`, `secret`, `cookie` or `authorization`, so a group named `token`
hides all its members) has the value `[redacted]`, and long messages and values
are cut.

| Status | Meaning |
|---|---|
| `200` | the lines |
| `400` | `level` isn't one of the above, or `after` isn't a number |

## Admin: backups

The console's **Server > Settings > Backups**: copies of the database in the
backups folder, made on the `backups.schedule` or on request, and a restore
applied at the next start. All *Admin*. How backups are made, kept and
restored is in
[Backups, audit log and notifications](../backups-and-notifications.md#backups-internalbackup).
A backup is identified by its **file name** (`audiosilo-<UTC time>-<kind>.db`);
a name that isn't a backup's (`backup.validName`) or isn't in the folder is
`404 backup_not_found`.

### `GET /api/v1/admin/backups`

*Admin.* The backups in the folder (newest first), the service's state, and any
restore waiting for, or applied at, a start:

```json
{
  "backups": [
    { "name": "audiosilo-20261004-174512Z-manual.db", "size": 1347584,
      "created_at": "2026-10-04T17:45:12Z", "kind": "manual" },
    { "name": "audiosilo-20261004-020000Z-scheduled.db", "size": 1339392,
      "created_at": "2026-10-04T02:00:00Z", "kind": "scheduled" }
  ],
  "status": {
    "dir": "/data/backups",
    "running": false,
    "last": { "at": "2026-10-04T18:45:12.402+01:00", "ok": true, "trigger": "manual",
              "name": "audiosilo-20261004-174512Z-manual.db" },
    "latest": { "name": "audiosilo-20261004-174512Z-manual.db", "size": 1347584,
                "created_at": "2026-10-04T17:45:12Z", "kind": "manual" },
    "next": "2026-10-05T03:00:00+01:00"
  },
  "restore": { "pending": null, "last": null }
}
```

| Field | Meaning |
|---|---|
| `backups[].kind` | `scheduled`, `manual` or `before-restore` (the copy of the database a restore replaced). A file put in the folder under another valid name reads as `manual`, dated by its modification time |
| `backups[].created_at` | from the name (UTC, to the second) |
| `status.running` | a backup is being made now |
| `status.last` | the newest attempt **since the server started** (`null` before one): `trigger` `scheduled` or `manual`, and on failure `ok: false` with `error` `disk_full`, `permission_denied` or `failed` (the cause is in the log) |
| `status.latest` | the newest backup in the folder that isn't a before-restore copy, whenever it was made (`null` when there is none) |
| `status.next` | the next scheduled backup, in the server's time zone; `null` when the schedule is off |
| `restore.pending` | the restore waiting for the next start: `{name, requested_at, requested_by, schema}` (`schema` is the backup's newest migration), or `null` |
| `restore.last` | how the last restore went, written at start: `{name, applied_at, requested_by, ok, error, safety_copy}`. `error` (when `ok` is false) is `missing`, `unusable`, `newer` or `failed`, and the database was left as it was; `safety_copy` names the before-restore backup (or, if the database couldn't be copied, the file it was renamed to in the data folder). A restore marker that couldn't be read is reported as `error: "failed"` with an empty `name`. `null` when no restore ever ran |

### `POST /api/v1/admin/backups`

*Admin.* Starts a manual backup in the background and answers `202` with the
`GET` envelope, whose `status.running` is already `true`. Poll `GET` while it
stays true; the outcome is then `status.last`. Audited (`backup.create`).

| Status | Meaning |
|---|---|
| `202` | started; body is the envelope |
| `409` `backup_running` | a backup is already being made |

### `GET /api/v1/admin/backups/{name}`

*Admin.* Downloads a backup: `Content-Type: application/vnd.sqlite3`,
`Content-Disposition: attachment; filename="<name>"`, `Cache-Control: no-store`,
served with `http.ServeContent` (ranges supported). The path is outside the
API's 30-second request timeout, like streaming (a restore or a delete stays
bounded by it). Every download (`GET`; a `HEAD` isn't) is audited
(`backup.download`): the file holds every account's password and token hashes.

| Status | Meaning |
|---|---|
| `200` | the file |
| `404` `backup_not_found` | no such backup |

### `DELETE /api/v1/admin/backups/{name}`

*Admin.* Deletes a backup from the folder. A restore waiting for this backup is
cancelled first. Audited (`backup.delete`).

| Status | Meaning |
|---|---|
| `204` | deleted |
| `404` `backup_not_found` | no such backup |

### `POST /api/v1/admin/backups/{name}/restore`

*Admin.* Checks the backup and marks it to be restored **at the next start**
(`<data>/restore.json`), replacing any restore already waiting. Nothing
changes until the server restarts. The answer is the `GET` envelope with
`restore.pending` set. Audited (`backup.restore`, with the backup's `schema`).
The check here is quick (readable, an AudioSilo schema this server knows); the
full integrity check (`PRAGMA quick_check`) runs at the next start, which
reports a damaged backup as a refused restore (`restore.last.error`
`"unusable"`) and leaves the database as it was.

| Status | Meaning |
|---|---|
| `200` | scheduled; body is the envelope |
| `400` `invalid_backup` | the file can't be read as an AudioSilo database (no schema record or accounts table) |
| `400` `backup_too_new` | it was made by a newer server (it has a migration this one doesn't ship) |
| `404` `backup_not_found` | no such backup |

### `DELETE /api/v1/admin/restore`

*Admin.* Cancels the restore waiting for the next start. `204` whether or not
one was waiting; audited (`backup.restore_cancel`) when one was.

## Admin: notifications and events

The console's **Server > Settings > Notifications** (where the server sends
what happens) and the top bar's bell (the event feed). All *Admin*. Event
kinds, payloads, the webhook signature and the delivery rules are in
[Notifications](../backups-and-notifications.md#notifications-internalnotify).

A destination's `url` and `secret` are **write-only**: they are never returned.
A destination reads:

```json
{
  "id": 1,
  "kind": "webhook",
  "name": "Home Assistant",
  "enabled": true,
  "events": ["book_added", "scan_failed", "library_unavailable", "update_available", "backup_failed"],
  "created_at": "2026-10-04T17:45:20.117Z",
  "updated_at": "2026-10-04T17:45:20.117Z",
  "last_at": "2026-10-04T17:45:20.204Z",
  "last_ok": true,
  "last_error": "",
  "address": "http://192.168.1.5:8123/api/webhook/audi…",
  "has_secret": true
}
```

| Field | Meaning |
|---|---|
| `kind` | `webhook`, `ntfy` or `discord`; can't change after creation |
| `events` | the event kinds sent there, in `notify.Kinds` order |
| `last_at`, `last_ok`, `last_error` | the newest delivery or test: `null` before the first; `last_error` is `timeout`, `unreachable`, `http_<status>` or `failed` (never the address or the answer) |
| `address` | the redacted address (`notify.Redact`): scheme, host and path with the last segment cut to four characters and `…` (just `…` when it has four or fewer), a query as `?…`, user info dropped |
| `has_secret` | a signing secret (webhook) or access token (ntfy) is saved |

### `GET /api/v1/admin/notifications`

*Admin.* `{"targets": [...], "events": [...], "kinds": [...]}`: the
destinations (oldest first), the event kinds the server knows (`book_added`,
`scan_failed`, `library_unavailable`, `new_device`, `invite_redeemed`,
`update_available`, `backup_failed`) and the destination kinds.

### `POST /api/v1/admin/notifications`

*Admin.* Adds a destination and answers `201` with it:

```json
{ "kind": "ntfy", "name": "My phone", "url": "https://ntfy.sh/hearthside-alerts",
  "secret": "", "enabled": true, "events": ["scan_failed", "backup_failed"] }
```

`enabled` defaults to `true`; `secret` and `events` may be left out. The fields
are checked by `notify.Clean` (see
[Destinations](../backups-and-notifications.md#destinations)). Audited
(`notify.create`, with its kind and events, never its address).

| Status | Meaning |
|---|---|
| `201` | added; body is the destination |
| `400` | not a JSON object |
| `400` `invalid_target` | a field the server refuses; `field` names it (`kind`, `name`, `url`, `secret` or `events`), `error` says why in English words a form can show, and `reason` says why as a code a client words itself (`kind_unknown`, `kind_fixed`, `name_required`, `name_too_long`, `name_control`, `url_required`, `url_too_long`, `url_invalid`, `url_discord`, `url_ntfy`, `secret_too_long`, `secret_control`, `secret_discord`, `secret_again`, `event_unknown`; new ones may be added, so fall back to `error`). A `*_too_long` reason also carries `max`, the limit in characters. |
| `409` `too_many_targets` | the server has 20 destinations already |

### `PATCH /api/v1/admin/notifications/{id}`

*Admin.* Changes the fields sent (`name`, `url`, `secret`, `enabled`,
`events`); an absent field keeps its value, so the address and secret survive
an edit that doesn't send them. `"secret": ""` clears the secret. A saved
secret doesn't follow the address to another server: a new `url` with a
different scheme, host or port and no `secret` in the body is
`400 invalid_target` with `field: "secret"` and `reason: "secret_again"` (send the secret again, or `""`);
a new path on the same server keeps it. Answers `200`
with the destination. Sending a different `kind` is `400 invalid_target` with
`field: "kind"` and `reason: "kind_fixed"`; other refusals as for `POST`; `404` (no `code`) when there is
no such destination. Audited (`notify.update`, recording `address_changed` /
`secret_changed` rather than either value).

### `DELETE /api/v1/admin/notifications/{id}`

*Admin.* Removes a destination: `204`, or `404` when there is none. Audited
(`notify.delete`).

### `POST /api/v1/admin/notifications/{id}/test`

*Admin.* Sends one `test` message now (no retries, not added to the feed),
records the outcome on the destination, and answers:

```json
{ "ok": false, "error": "unreachable", "target": { "id": 2, "last_ok": false, "last_error": "unreachable" } }
```

(`target` is the whole destination as above.) `error` is `""` when it arrived,
and `"failed"` from a server built without the notification service (an
embedder's; never one the launcher starts).
A failed delivery is not an HTTP error here: the answer is `200` either way,
`404` when there is no such destination.

### `GET /api/v1/admin/events`

*Admin.* The event feed (the bell), newest first. Events are kept for 90 days.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `before` | int | - | only events with a smaller `id`: the previous page's `next_before` |
| `limit` | int | `20` | at most 100 (a larger one is cut to 100; zero or less means 20) |
| `kind` | string | - | only events of this kind (one of the [event kinds](../backups-and-notifications.md#events)) |

```json
{
  "events": [
    { "id": 12, "at": "2026-10-04T17:48:03.220Z", "kind": "new_device",
      "data": { "user": "maya", "device": "Maya's iPhone", "app": "AudioSilo 1.4.2" } },
    { "id": 11, "at": "2026-10-04T17:44:58.901Z", "kind": "book_added",
      "data": { "library": "Books", "library_id": 1, "count": 8,
                "titles": ["Alice's Adventures in Wonderland", "Through the Looking-Glass", "The Adventures of Sherlock Holmes", "The Hound of the Baskervilles", "The Call of the Wild"] } }
  ],
  "next_before": 0
}
```

`data` per kind is in [Events](../backups-and-notifications.md#events) (a
failed scan's `detail` is here, for the bell, but never sent to a destination);
`next_before` is `0` on the last page. A `before` that isn't a non-negative
number, or a `kind` that isn't an event kind, is `400`.

## Admin: audit log

### `GET /api/v1/admin/audit`

*Admin.* What admins changed, newest first (the console's **Server > Audit
log**). Kept for 365 days, at most 100,000 events. Which actions are recorded
is in [Audit log](../backups-and-notifications.md#audit-log).

| Query param | Type | Default | Notes |
|---|---|---|---|
| `actor_id` | int | - | one account's actions |
| `area` | string | - | an action's first part (`user`, `invite`, `library`, `book`, `share`, `device`, `progress`, `issue`, `settings`, `backup`, `notify`); `[a-z_]{1,32}` |
| `q` | string | - | the target or the actor's name contains it, ignoring case; at most 200 characters |
| `before` | int | - | the previous page's `next_before` |
| `limit` | int | `50` | at most 200 (a larger one is cut to 200; zero or less means 50) |

```json
{
  "events": [
    { "id": 31, "at": "2026-10-04T17:45:20.117Z", "actor_id": 1, "actor_name": "admin",
      "via": "session", "action": "settings.update", "target": "",
      "details": { "changes": [ { "setting": "backups.schedule", "from": "daily:03:00", "to": "weekly:sun:03:00" } ] } },
    { "id": 30, "at": "2026-10-04T17:41:02.550Z", "actor_id": null, "actor_name": "",
      "via": "system", "action": "backup.restore_applied",
      "target": "audiosilo-20261004-020000Z-scheduled.db",
      "details": { "requested_by": "admin", "safety_copy": "audiosilo-20261004-174100Z-before-restore.db" } }
  ],
  "next_before": 0
}
```

| Field | Meaning |
|---|---|
| `actor_id`, `actor_name` | the admin, copied when it happened (kept when the account is renamed or deleted); `null` and `""` for the server itself |
| `via` | `session` (the console or another signed-in app), `api` (a personal API key) or `system` |
| `action` | `<area>.<verb>`, like `user.update`; a console words the ones it knows and shows the code for the rest |
| `target` | what it was done to, as a person reads it: a username, a library's name, `<library>: <path>` for a book, a backup's file name, a destination's name; `""` when the action has none |
| `details` | the change's facts (which fields, from what to what, counts). Never a secret, never an IP address |

| Status | Meaning |
|---|---|
| `200` | the page |
| `400` | `actor_id` or `before` isn't a number, `area` doesn't match, or `q` is over 200 characters |

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
