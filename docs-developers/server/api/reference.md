---
title: Endpoint reference
description: "Every route the server exposes: method, auth requirement, parameters, response envelope, and status codes - grouped by area."
---

The complete HTTP surface, derived from the route table in
`internal/api/api.go`. Conventions (auth, errors, pagination, rate limits) are
in the [API conventions](index.md) page and are not repeated per endpoint.

**Auth legend** - *Public*: no token. *Session*: bearer session token.
*Session (media)*: session token via header **or** `?token=` query parameter
(a book's cover and stream also take a [cast token](#cast-tokens-as-media-auth)
as the `?token=`).
*Admin*: session token + `admin` role. A personal **API key** authenticates as
its owner anywhere a *Session* token does - so an admin's key also satisfies
*Admin* - with one carve-out: it is refused on the credential-minting routes (see
[Personal API keys](#personal-api-keys)).
*Bridge token*: the paired Bridge's own token, accepted only on the
[`/bridge/*` routes](#the-bridge) and refused everywhere else.
*Feed token*: a listener's calendar feed token, accepted only on
[`GET /me/upcoming/releases.ics`](#get-apiv1meupcomingreleasesics) (header or
`?token=`), which takes no other credential.

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
    "podcast_fetch": true,
    "podcast_discovery": false,
    "podcast_opml": true,
    "ebooks": true,
    "readalong": true,
    "upcoming": true,
    "upcoming_calendar": true,
    "upcoming_covers": true
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
the install; clients use it as the identity for a paired server. The player keys its
per-connection state (token, downloads, progress, cache) on `<server_id>.<user_id>`, one
user on one server, so two people signed in to one server stay apart (see
[Connection identity](../../frontend/state-and-data.md#connection-identity-server_iduser_id)). It is also returned by the
pairing exchange (`POST /auth/exchange`) and login/demo responses, so a client has
it the moment it pairs. `version` is stamped from the release tag (`"dev"` for local builds, `"dev-<short sha>"` for an `:edge` image).
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

The player-redesign data API (Phase 1a, and the series flags after it) adds
these flags. An older server omits them, so a client treats a missing flag as false and never sends the request it
gates:

| Flag | Value | Gates |
|---|---|---|
| `meta_bundle` | the same as `metadata` | the [`/meta`](#get-apiv1librariesidmeta) query params `include=previous` and `spoilers=hide` (an older server ignores both and sends the full envelope) |
| `browse_people` | always `true` | the browse lists [`/authors`, `/narrators`](#get-apiv1librariesidauthors--get-apiv1librariesidnarrators) and [`/series`](#get-apiv1librariesidseries), and the `narrator` filter on [`/books`](#get-apiv1librariesidbooks) |
| `cover_sizes` | always `true` | cover thumbnails, [`/cover?size=`](#get-apiv1librariesidcover) |
| `next_book` | always `true` | [`/next`](#get-apiv1librariesidnext), what to play after a book |
| `series_memberships` | always `true` | `memberships=1` on [`/books`](#get-apiv1librariesidbooks) and [`/series`](#get-apiv1librariesidseries): a book counts in every series it is in, not only its main one (an older server ignores the param and places books by their main series) |
| `series_books` | always `true` | [`/series/books`](#get-apiv1librariesidseriesbooks): the first page of several series' books in one request (without it, ask `/books` once per series) |

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

`annotations` (always `true`, absent on an older server) gates bookmark labels, the
owner's edits of bookmarks and notes, and the lists across books: see
[Capability flags](index.md#capability-flags---gate-your-features) for what it
covers. `addresses` (always `true`, absent on an older server) says the server reports
its [home and away addresses](#home-and-away-addresses): on every pairing payload and
its links, on the exchange, login and demo answers, and at
[`GET /addresses`](#get-apiv1addresses).
`meta_covers` (the same as `metadata`, absent on an older server) says the server
serves the community covers a book's `/meta` envelope hands out, as thumbnails at
[`GET /libraries/{id}/meta/cover`](#get-apiv1librariesidmetacover).

The player redesign's Phase 8 adds two more, both always `true` on a server that
has them and absent on an older one:

| Flag | Value | Gates |
|---|---|---|
| `household` | always `true` | [Listening in the house](#listening-in-the-house): `GET`/`PUT /me/household` and `GET /household/listening` |
| `cast` | always `true` | [Casting](#casting): `POST /cast/token`, and a cast token as the `?token=` of a book's [cover](#get-apiv1librariesidcover) and [stream](#get-apiv1librariesidstream) |

Phase 8b-1 adds one more, always `true` on a server that has it and absent on an older one:

| Flag | Value | Gates |
|---|---|---|
| `household_members` | always `true` | [Household members](#household-members): `/me/household/members/**`; `managed_by`, `member_kind` and (for a member) `display_name` on the [`user`](#get-apiv1me); `member_sign_ins` and `?also_members=1` on [Your devices](#your-devices) |

The flag never depends on the caller or on the admin's switches: whether **this**
caller may add a member is the members list's `allowed`.

Phase 2c-2b adds another core flag, `podcast_fetch:true` (absent on older
servers), for [on-demand fetch/status/Retry](#podcast-fetch-status-and-retry)
and optional `fetch:Status` on episodes and `Book.episode`. It stays true
independently of module/Bridge availability.

Phase 2c-3 adds two more, both absent on older servers (treat absent as
unsupported):

| Flag | Value | Gates |
|---|---|---|
| `podcast_discovery` | `podcasts.discovery.enabled` at start **and** the Podcasts module's toggle on; sent `false` otherwise. It does not depend on the Bridge or on a directory key | [directory search](#podcast-discovery) (check `providers` for Podcast Index) |
| `podcast_opml` | always `true` | the [OPML import and export](#opml-import-and-export) protocol, even offline or module-off; the import still needs the module (`404 module_off`), the export does not |

Both describe the server's configuration, not the caller's permissions: a kid,
demo account or unrecognized client is still refused by the routes.

Bridge Phases 3b and 3c add two more, always `true` on a server that has them
and absent on an older one:

| Flag | Gates |
|---|---|
| `ebooks` | [the reader](#ebooks-and-the-reading-place): a book's `ebook` field, [`GET /libraries/{id}/ebook`](#get-apiv1librariesidebook) and [`GET`](#get-apiv1librariesidreading-progress)/[`PUT /libraries/{id}/reading-progress`](#put-apiv1librariesidreading-progress). A client offers Read only when the book has an `ebook` **and** it is `true` (the player also while it is unknown offline, for a book whose download holds the EPUB; never when `false`) |
| `readalong` | [read-along](#get-apiv1librariesidreadalong) (Phase 3c): a book's `readalong` field on [`/item`](#get-apiv1librariesiditem) and [`GET /libraries/{id}/readalong`](#get-apiv1librariesidreadalong). It says the route exists, not that any book has a map: a client also needs the book's `readalong.state` to be `ready` (and its `ebook`). Making a map needs a [Bridge](#the-bridge) whose `features` list `readalong` |

Track U (2.6.0) adds three that follow two settings: `upcoming`,
`upcoming_calendar` and `upcoming_covers` are all `true` while community metadata
is on **and** the upcoming releases job is switched on, and `false` (sent, not
absent) otherwise; an older server omits them. See
[Upcoming releases](#upcoming-releases) and
[Capability flags](index.md#capability-flags---gate-your-features).

`bridge` follows the Bridge rather than a setting, so it can change from one
request to the next: it is `true` only while a [Bridge](#the-bridge) is paired and its last heartbeat is under two minutes
old, and only then, **for a signed-in caller**, does a top-level
`bridge: {version, features}` object sit beside `capabilities`. An older server has
neither. See
[the `bridge` capability](#get-apiv1server-the-bridge-capability-and-block).

Each [managed module](../modules.md#the-toggle-and-the-capability-flag) adds a flag
named after it: `true` only while an admin has it on **and**, for a module that needs
the Bridge, an online Bridge lists the feature it needs in `bridge.features`; sent as
`false` otherwise, absent on an older server. Like `bridge`, it can change from one
request to the next.

| Flag | Value | Gates |
|---|---|---|
| `contributions` | the Contributions module on **and** a Bridge offering `contribute` | the console's contributing actions: the generate dialog's contribute switch, Share with the community and Suggest corrections (which also needs `meta` in `bridge.features`); the player doesn't read it. The module has no routes or background work of its own: its actions are [Bridge jobs it owns](#post-apiv1adminbridgejobs) (`404 module_off` while it is off) |

`podcasts` is the other module flag: true only with its toggle on and an online
Bridge offering `podcast`. It gates follow/check, new fetches, policy writes
and scheduling. [Core reads and ready media](#podcasts) remain available
offline/module-off; `podcast_fetch` advertises protocol support separately.

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
  "server_id": "kx8Qz1c7m2Vw0aB3dEfGh",
  "base_url": "https://books.example.com",
  "pairing_token": "3vJx0eKQm9WZbT5nR8sHc2fLdA7yUqPgVi4oXk1NwsE",
  "uri": "audiosilo://connect?server=https%3A%2F%2Fbooks.example.com&token=3vJx0eKQ…&sid=kx8Qz1c7m2Vw0aB3dEfGh",
  "web_url": "https://books.example.com/web/connect?token=3vJx0eKQ…&sid=kx8Qz1c7m2Vw0aB3dEfGh",
  "qr_png_data_uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg…",
  "links": {
    "web": "https://books.example.com/web",
    "admin": "https://books.example.com/admin"
  },
  "code_expires_at": "2026-07-04T09:30:00Z",
  "uses_remaining": 5,
  "addresses": {
    "home": "http://192.168.1.20:8080",
    "away": "https://books.example.com"
  }
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
`server_name` is the server's display name, as `GET /server`'s `name`, and
`server_id` its stable id, as `GET /server`'s `server_id`. Both links end with that id as
`sid=` (after the address params below; absent only on a server without an id, which
the launcher always mints), so a client can check who answers at an address before
sending the token there.
`addresses` is the server's [home and away addresses](#home-and-away-addresses), omitted
when it has neither; both links then carry them too (below).

#### Home and away addresses

On a server with the `addresses` capability, every pairing payload (`/auth/redeem`,
`/auth/pair`, the demo session's `pairing`), the [`/auth/exchange`](#post-apiv1authexchange),
[`/auth/login`](#post-apiv1authlogin) and [`/demo/session`](#post-apiv1demosession)
answers, and [`GET /addresses`](#get-apiv1addresses) carry the same object:

| Field | Type | Meaning |
|---|---|---|
| `home` | string, optional | The server's address on the household network: the configured [`lan_url`](../configuration.md#home-address-lan_url), else the address **this request** arrived on (scheme + `Host`) when that is a home-network host and the request did not come through a proxy ([the rule](../configuration.md#home-address-lan_url)). On a self-signed server with [home HTTP](../configuration.md#home-http-tlshome_http) the derived one is always `http://`, on the request's port |
| `away` | string, optional | The address that works from anywhere: the configured `public_url` |

A `home` equal to the `away` is dropped. On the pairing payloads and the sign-in answers
the object is omitted when neither is known. Because `home` can be derived from the
request, an answer read through the away address usually has no `home`: a client keeps a
`home` it already knows rather than forgetting it.

The two links carry the same addresses as extra query parameters **after** the existing
ones, only those that are set, so an older client ignores them:

```text
audiosilo://connect?server=https%3A%2F%2Fbooks.example.com&token=…&away=https%3A%2F%2Fbooks.example.com&home=http%3A%2F%2F192.168.1.20%3A8080&sid=kx8Qz1c7m2Vw0aB3dEfGh
https://books.example.com/web/connect?token=…&away=https%3A%2F%2Fbooks.example.com&home=http%3A%2F%2F192.168.1.20%3A8080&sid=kx8Qz1c7m2Vw0aB3dEfGh
```

Read them by name: the encoder sorts them (`away` before `home`), and `sid` comes last.

On a self-signed server with [home HTTP](../configuration.md#home-http-tlshome_http) (the
default), the port also answers plain HTTP to home-network clients, and a derived `home`
is `http://` even when the request came over https: a device pairing at
`https://192.168.1.20:8080` gets `home` `http://192.168.1.20:8080` (an https request
without a port gets `http://<host>:443`, the port that answers). `base_url`, `web_url`
and the `uri`'s `server=` stay https, even for a pairing asked for over plain HTTP
(the https base on the same port, `:80` for a Host without one), so a link reads
`…server=https%3A%2F%2F192.168.1.20%3A8080&token=…&home=http%3A%2F%2F192.168.1.20%3A8080&sid=…`.
A native app that can't trust the certificate at `server` exchanges the token at that
`home` instead, when it has the same host and port and a tokenless `GET <home>/api/v1/server`
answers with the link's `sid` (the token then travels in cleartext, so it must reach this
server and no other box at the same private address); the player's rule is in
[Connect and home/away addresses](../../frontend/connect-and-addresses.md).

A client must not send a token to a `home` address until a tokenless
`GET <home>/api/v1/server` there has answered with the same `server_id`: a private
address can belong to a different machine on another network. The player's rule is in
[Connect and home/away addresses](../../frontend/connect-and-addresses.md#the-pick-rule-srclibserver-addressts).

| Status | Meaning |
|---|---|
| `400` | `code` missing |
| `401` | `code: "invite_used"`: a real invite with no uses left (from 2.5.0) |
| `401` | `code: "invite_expired"`: a real invite past its expiry (from 2.5.0) |
| `401` | `invalid or expired auth code`, no `code` (anything else: an unknown code, the code owner disabled or deleted - a rejected attempt never burns a use) |
| `429` | redeem lockout tripped, with `Retry-After` (seconds until the lockout ends) |

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

`server_id` is the paired server's stable identity (see `GET /server`); the player's
connection id is `<server_id>.<user_id>` with the answer's `user`
([Connection identity](../../frontend/state-and-data.md#connection-identity-server_iduser_id)). On a server with `addresses`, the answer also carries
`addresses` (`{ "home"?, "away"? }`, omitted when neither is known; see
[Home and away addresses](#home-and-away-addresses)).

| Status | Meaning |
|---|---|
| `400` | `pairing_token` missing |
| `401` | `invite already used on all its devices - ask for a new invite` (the parent invite's use cap is spent) |
| `401` | `invite has expired - ask for a new invite` (the parent invite expired after the redeem) |
| `401` | `invalid or expired pairing token` (anything else: bogus/revoked token, single-use token already exchanged, code owner disabled) |
| `429` | redeem lockout tripped, with `Retry-After` |

A refused exchange never burns an invite use. Its `401`s carry no `code` (unlike
`/auth/redeem`'s): tell them apart only by the English `error`, or not at all.

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
session of that person, and a new password,
[Sign out everywhere](#post-apiv1adminusersidsign-out) or a disabled account forgets
all of that person's, so the browser's next sign-in is announced again.

A sign-in racing a password change gets no session, only `401 invalid credentials`
(server#281, [the sign-in race](../auth-and-security.md#password-changes-end-sessions)).

Response `200`: `{ "token": "…", "user": { … }, "server_id": "…" }`, plus `addresses`
on a server with that capability - the same shape as `/auth/exchange`.

From 2.5.0 a `username` with surrounding spaces (a pasted or autocompleted
`"alex "`) signs in as the account without them, when no account has the name
exactly as typed (that one wins). Case still counts (`auth.Service.Authenticate`).

| Status | Meaning |
|---|---|
| `401` | invalid credentials (also returned for disabled or password-less accounts - deliberately indistinguishable) |
| `429` | login lockout tripped, with `Retry-After` (seconds until the lockout ends) |

### `POST /api/v1/auth/pair`

*Session.* Issues a fresh pairing payload for the calling user - "add another
device" from an existing session. The body is optional:

```json
{ "ttl_seconds": 120 }
```

Response `200`: a
`PairingPayload` (same shape as `/auth/redeem`, without the invite budget fields). Its
token is single-use and lasts 10 minutes (`pairingTTL`), so the player counts down from
when the payload arrived. `ttl_seconds` (from 2.4.0) asks for a shorter life, clamped to
30 seconds through 10 minutes (`pairTTL`): a caller can shorten a token's life, never
lengthen it; no body or no field is the 10 minutes, and a malformed body is `400
invalid request`. The admin console's **Listen in player** uses it too, to sign the
web player in as the admin in a new tab, asking 120 seconds (`PLAYER_TAB_TTL_SECONDS`),
since that token rides the tab's URL and history. An API key gets `403`. A kid's account (a [household member](#household-members)
with `member_kind: "kid"`) gets `403` `code: "kid_account"`: its owner sets up its
devices with [`POST /me/household/members/{id}/pair`](#post-apiv1mehouseholdmembersidpair).

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
  "last_seen_at": "2026-07-02T08:15:00Z",
  "managed_by": null,
  "member_kind": null
}
```

`last_seen_at` is derived from the account's most recent token activity and is
omitted when there is none. `role` is `"admin"` or `"user"`.

On a server with `household_members`, `managed_by` and `member_kind` are always
present: both `null` for an account nobody manages, and for a
[household member](#household-members) the owner (`{ "id": 4, "username": "sam" }`)
and `"kid"` or `"grownup"`. A member's `user` also carries `display_name`, the name
the owner typed for them (`users.display_name`), so the member's own device can greet
them by it; it is omitted while that is empty (a member the admin assigned, until the
owner renames them) and for everyone else, a former member included (`api.meUser`).
The same `user` object rides on every session envelope (exchange, login, demo, a
member's session). The member's `member_access` is not on it: it is the owner's
business (the [members list](#get-apiv1mehouseholdmembers)) and the admin's, and the
player's `managed_by` never carries the owner's own typed name (only the admin's
does). An older player ignores the new fields; the server limits a kid whatever the
player shows.

### `GET /api/v1/addresses`

*Session* (any role, demo accounts included). Capability `addresses`. The server's
[home and away addresses](#home-and-away-addresses) as seen from this request, so a
device paired before an address was set learns it:

```json
{ "home": "http://192.168.1.20:8080", "away": "https://books.example.com" }
```

Either field is omitted when unknown, and the answer is `{}` when neither is.

| Status | Meaning |
|---|---|
| `200` | the addresses (`{}` when neither is known) |
| `401` | no valid session or API key |

## Self-service account

The routes in this section but `DELETE /auth/recovery` (which only reduces access, so
it is neither limited nor refused), together with the [API keys](#personal-api-keys)
below (but their listing, `GET /auth/tokens`, which is not counted), share one rate
limit (10 attempts per IP per 15 minutes; a refusal is `429` with `Retry-After`, the
seconds until the lockout ends) and are
**refused for demo accounts** (403 `code: "demo_account"`, `not available for demo
accounts`), so a throwaway session can't mint a durable credential. `POST
/auth/password`, `POST /auth/recovery` and `POST /auth/tokens` (and `POST /auth/pair`)
are also refused for a kid's account (403 `code: "kid_account"`, `not available for a
kid's account`): a kid signs in only on devices its owner sets up (the admin can't
mint or rotate a kid's invite either: `409 kid_account`, below). The refusal comes
from one route wrapper (`api.notKid`) before the handler runs, and the recovery code,
API key and pairing writes refuse a kid again inside their own transaction
(`auth.refuseKid`), so a request that passed the wrapper just before the owner's
switch to kid committed still gets `403 kid_account` and leaves nothing behind. A
password racing that switch is refused inside `auth.UpdateUser` instead
(`ErrKidNoPassword`), and the route answers it as `403 kid_account` too.

### `POST /api/v1/auth/password`

*Session.* Set or change your own password.

| Field | Type | Required | Notes |
|---|---|---|---|
| `password` | string | yes | the new password; empty is rejected (clearing a password is admin-only) |
| `current_password` | string | conditional | required only when the account already has a password |

Response: `204 No Content`.

**Changing a password ends the other sessions** (server#281). Replacing a password
the account had revokes every `session` token of the caller but the one making the
request, with their open pairing codes (unlinked `pairing` tokens from
[`POST /auth/pair`](#post-apiv1authpair)) and their recovery code (`has_recovery`
turns `false`); API keys, the [calendar feed token](#the-calendar-feed) and Bridge
tokens stay, and a first password ends nothing
([Password changes end sessions](../auth-and-security.md#password-changes-end-sessions)).
An ended token is refused (`401`) on its very next request, media `?token=` included;
a shipped app takes its existing 401 path (signed out, pair again). The response
carries no count: a client that wants to say what happened reads
[`GET /me/devices`](#get-apiv1medevices) again.

| Status | Meaning |
|---|---|
| `400` | password missing or too short |
| `401` | `current_password` incorrect |
| `403` | demo account (`demo_account`); a kid's account (`kid_account`, also when the owner's switch to kid commits between the wrapper and the write) |
| `429` | account-mutation limit tripped |

### `POST /api/v1/auth/recovery`

:::caution[Legacy - being retired]
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

`403` for demo accounts (`demo_account`) and kids (`kid_account`), `429` on the shared limit.

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
expires. Creating and revoking share the [self-service](#self-service-account) rate
limit (10 attempts per IP per 15 minutes; a refusal is `429` with `Retry-After`);
listing does not spend it (from 2.4.0). All three are **refused for demo accounts**
(403).

**Containment.** A key cannot mint a *fresh durable credential*. A request that
authenticates with an API key is refused (**403**) on the credential-minting
routes - `POST /auth/tokens` (another key), `POST /auth/recovery`,
`POST /auth/pair`, `POST /auth/password`, [`POST /cast/token`](#post-apiv1casttoken)
(refused although a cast token would die with the key),
[`POST`](#post-apiv1meupcomingcalendar) and
[`DELETE /me/upcoming/calendar`](#delete-apiv1meupcomingcalendar) (a calendar link,
which would outlive the key), and every
[household member](#household-members) route (adding one with `sign_in_here`,
`…/{id}/session` and `…/{id}/pair` make a member's session or pairing code) - so
revoking a leaked key cuts off everything it could reach: it can't spawn a key,
recovery code, pairing token, password or member session that would outlive its own
revocation (mirrors GitHub's "a token cannot create tokens"). It may still **list and revoke** keys and clear a recovery code,
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
| `403` | demo account (`demo_account`), a kid's account (`kid_account`), or the caller is itself authenticating with an API key (containment - a key can't mint another) |
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
routes only ever touch the caller's own tokens, and, with `?also_members=1`, the
sessions and API keys of the caller's own household members made on the device being
signed out.

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
      "current": true,
      "member_sign_ins": [ { "id": 12, "name": "Evie" } ]
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

`member_sign_ins` (capability `household_members`; always present there, `[]` when
none, and always `[]` for a member caller, who has no members) names the caller's own [household members](#household-members) holding a live
session or API key that was made **on that device**: a member signed in through
`sign_in_here` or [`…/members/{id}/session`](#post-apiv1mehouseholdmembersidsession)
records the caller's token as its `tokens.created_on_token_id`. `name` is the member's
display name, else their username. Someone else's members never appear, and a
member's own device (paired from its code) is not "made on" any of the caller's.

### `DELETE /api/v1/me/devices/{id}`

*Session.* Signs one of the caller's devices out by revoking its token. The
caller's other devices stay signed in.

```json
{ "current": false, "members_signed_out": 2 }
```

`?also_members=1` (or `true`; any other value is off) also revokes, in the same
transaction, every session and API key of the caller's own household members whose
`created_on_token_id` is that device: the "Also sign out Evie and Ellis on that
device" of a lost phone. `members_signed_out` counts the **members** signed out (not
their tokens): always present, `0` without the parameter. A member's sign-ins made
anywhere else stay. The parameter is only meaningful on a server with
`household_members`; an older server ignores it and answers `{ "current": … }`.

Revoking the **current** device is allowed (unlike the admin route's
`409 current_device`): the response says `"current": true`, and the token is
dead for every later request. A player shouldn't offer it for that row, though:
signing out the normal way (`POST /auth/logout` after the app's own teardown)
lets it save the final position and flush queued progress first, which a revoke
would refuse. An API-key caller
may revoke too, since revoking only reduces access. A token of the caller's that
has expired but isn't revoked yet can still be revoked (`200`), though the list
already hides it. Revoking also clears that browser's sign-in key, so a later
password sign-in from it is announced as a new device. A self-revoke is not
written to the admin audit log, but each member `?also_members=1` signs out is:
`member.device_revoke` with the caller as actor, the member as target and the
caller's `device_id`, as on the [member route](#delete-apiv1mehouseholdmembersiddevicesdevice_id).

| Status | Meaning |
|---|---|
| `200` | revoked; `current` says whether it was the token making this request, `members_signed_out` how many members went with it |
| `400` | `invalid device id` - not a number |
| `404` | `device not found` - not one of the caller's session or API-key tokens: another user's, unknown, a pairing token or already revoked (never `403`, so the answer doesn't confirm that another user's token exists) |

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
  "server_id": "kx8Qz1c7m2Vw0aB3dEfGh",
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

On a server with `addresses`, the answer and its `pairing` also carry `addresses` (see
[Home and away addresses](#home-and-away-addresses)).

| Status | Meaning |
|---|---|
| `404` | demo mode is not enabled |
| `429` | per-IP demo cap tripped, with `Retry-After` |
| `500` | configured `demo.library` doesn't exist |
| `503` | demo is at capacity |

:::note[Demo root redirect]
When demo mode is enabled **and** the web player is mounted, `GET /` (the exact
site root only) responds `302 Found` → `/web/demo`, landing visitors on the
player's instant-demo screen. All other static routes (`/connect`, `/admin`, …)
are untouched.
:::

## Libraries & browsing

### `GET /api/v1/libraries`

*Session.* Libraries the caller can reach through any share, or, for a
[household member](#household-members), through their owner (admins see all).

```json
{
  "libraries": [
    {
      "id": 1,
      "name": "Audiobooks",
      "kind": "books",
      "root": "/srv/audiobooks",
      "default_view": "hybrid",
      "sort_order": 0
    }
  ]
}
```

`kind` is always sent: `books` or `podcasts`. Podcast libraries are omitted
unless the authenticated request passes the
[podcast client gate](../auth-and-security.md#podcast-visibility), including
for admins. Library membership does not require a visible show, so a granted
podcast library containing only unfollowed private shows still appears here.

`root` (the library's folder on the server's disk) is sent only to an admin who
is not a demo visitor. From 2.5.0 a listener and a demo session get each library
without it (`listenerLibrary` in `handlers_library.go`); a client treats it as
optional. The admin routes (`GET /admin/libraries`) keep it.

### `GET /api/v1/libraries/{id}/fs`

*Session.* The filtered filesystem view - the real directory tree, scoped to
the caller's share rules, requiring no prior indexing. Lists **audio files and
directories only** (covers/NFOs are filtered out so every entry is actionable),
with indexed-book metadata attached where available. Offset-paginated.
For podcast libraries this is an index view instead: show folders at the root,
episode titles inside, serial shows oldest first and episodic shows newest
first. Episodes appear even without files; feed/artwork files never appear.
The podcast branch caps a page at 2,000 entries and applies private scope.

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
    },
    {
      "name": "The Well of Ascension",
      "path": "Brandon Sanderson/Mistborn/The Well of Ascension",
      "is_dir": true,
      "is_audio": false,
      "size": 0,
      "mod_time": 0,
      "pending_book": true
    }
  ],
  "total": 2,
  "offset": 0
}
```

`next_offset` is present when more entries remain. The book annotation fields
(`is_book`, `title`, `author`, `series`, `series_index`, `series_index_end` for a
range as on a book, `duration`) are
omitted for plain directories/files; `override` (`"book"` or `"collection"`)
appears when an explicit folder-detection override is set (admin concern - see
[Scanner](../scanner.md)). `split_discs: true` marks a folder whose audio is
only in disc folders directly in it (`CD1`, `CD2`, ...), each indexed as its
own book, which a `book` override would join into one (see
[Joined books](../scanner.md#joined-books-disc-sets)); it is sent to **admin**
callers only and omitted otherwise, so the player's listing is unchanged.

**Order.** Directories come first, then files, each group in **natural order**
(`naturalLess`, the order a folder book's files play in, so `2` lists before `10`;
see [Book detection](../scanner.md#book-detection-booksindir)). A
joined book's discs play in `discOrder`, which also ignores spaces, hyphens and
underscores, so only a disc set named unevenly (`CD1` beside `CD 2`) lists in
another order than it plays. An older server sorts each group by its lowercased
name, character by character (`10` before `2`).

**What is listed.** Dotfiles are hidden. An `.mka` beside a file of the same name
in another audio format (`Book.m4b` + `Book.mka`) is left out, as the scanner
leaves it out of the book (`library.shadowedMKA`, the rule `folderAudio` uses;
see [Recognized audio](../media.md#recognized-audio-metadataaudioextensions)); a
lone `.mka` is listed.

**`pending_book: true`** marks a folder the background scan has not
indexed yet that the scanner would read as a book (`library.MarkPendingBooks`,
called from `annotateWithBooks`), so a player can open it as a book: any content
route then indexes it on demand
([On-demand indexing](../scanner.md#on-demand-indexing-indexpath)). The scanner's
own rules decide, from directory reads alone (no audio is opened):

- a folder holding audio of its own (the hidden and
  [ignore](../scanner.md#ignore-rules) rules applied) is one, unless it has a
  `collection` override;
- a folder with a `book` override that is a disc set is the joined book, and its
  disc folders are none; without that override each disc folder holding audio is
  one and the folder above is none.

It is sent to every caller (player and console), but only on a folder the
caller's scope **allows**: a folder listed only as the way down to a grant is
never flagged. It is never sent alongside `is_book`, never in a podcast library's
listing, and absent (not `false`) otherwise. No capability flag: an older player
ignores the field, and a newer player on an older server finds it absent.

The pass is bounded (see [the filesystem view](../scanner.md#the-filesystem-view-browsefs)),
so a folder can be listed unflagged: one with an indexed book at or below it, one
the pass doesn't reach in its 2 seconds, and every folder when the library's folder
overrides or the index lookups for the page can't be read.

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
| `author` | string | - | the books whose author credit is this value, or names it as one of its people (`Brandon Sanderson` finds `Brandon Sanderson & Janci Patterson`; see [the people lists](#get-apiv1librariesidauthors--get-apiv1librariesidnarrators)). Exact, case included |
| `series` | string | - | the books whose main `series` is this series, in any spelling (case, accents, punctuation and spacing aside; see [`/series`](#get-apiv1librariesidseries)). With `memberships=1`, also the books that list it among their other series (see `series_list` below) |
| `memberships` | `1` | - | `series_memberships` capability: makes `series` match every series a book is in. Without it a book is found only by its main series, as shipped players expect |
| `narrator` | string | - | as `author`, on the narrator credit (`browse_people` capability; an older server ignores it and returns the unfiltered list; one before the co-credit split matches whole credits only) |
| `genre` | string | - | the books with this genre (see `genres` below): one value, matched case-insensitively with spacing collapsed and trimmed (`?genre=science%20fiction` finds `Science Fiction`). No capability: an older server ignores it and returns the unfiltered list |
| `tag` | string | - | as `genre`, on `tags`. With `genre`, both must match |
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
| `series_index_end` | number | the end of a main series position that is a **range** (an omnibus of books 1-3: `series_index` `1`, `series_index_end` `3`). `series_index` stays the start, so a client that doesn't know the field reads the omnibus as book 1. Omitted for a single position |
| `series_list` | array | every series the book is in, `[{"name", "position", "position_end"?}]` (position `0` = unnumbered; `position_end` only for a range, as `series_index_end`): its main `series` first (at `series_index`), then the others an [admin edit](#patch-apiv1adminlibrariesidbook) or a community match added. Sent only for a book in more than one series; otherwise `series`/`series_index` say it all |
| `subtitle` | string | the book's subtitle: from an Audiobookshelf `metadata.json`, the work's subtitle on an accepted community match, or an [admin edit](#patch-apiv1adminlibrariesidbook). Never from the audio tags |
| `publisher` | string | the publisher, from the same sources as `subtitle` (the recording's publisher on a match) |
| `language` | string | the language as the source gives it: a name (`English`) or a code (`en`, `en-GB`), at most 64 characters. Same sources as `subtitle` (the work's language on a match) |
| `abridged` | boolean | whether the recording is abridged. **Absent means unknown**, never "unabridged": an Audiobookshelf file and a community match only ever say `true` (both write `false` for "not recorded"), so `false` comes only from an admin edit |
| `genres` | string[] | the book's genres: the files' genre tag (split on `;` and NUL, never `,`; placeholders such as `Audiobook`, `Speech`, `Spoken Word` and `Other` dropped), an Audiobookshelf `metadata.json`, or an admin edit. Each label once, compared case-insensitively, the first spelling kept; at most 50, each at most 64 characters. Sent on list and search pages too, so a client can filter a loaded library on the device |
| `tags` | string[] | freeform tags, as `genres`, from an Audiobookshelf `metadata.json` or an admin edit only (no audio tag carries them) |
| `generated` | boolean | `true` when the book's `.audiosilo/` folder holds characters, recaps or (since Bridge Phase 1c) a description the [Bridge](#the-bridge) generated on this server (read from the book's attachment signature, so a file that failed its checks still counts); omitted otherwise. A client asks [`/meta`](#generated-content) for such a book even when it has no `asin` or `isbn` |
| `ebook` | object | `{"path", "size"}`: the book's ebook (Bridge Phase 3b, capability `ebooks`), the one readable `.epub` the scan found beside its audio (DRM is not judged) (see [A book's ebook](../scanner.md#a-books-ebook)): its library-relative `path` (for display: the file is fetched by the **book's** path at [`/ebook`](#get-apiv1librariesidebook)) and its `size` in bytes when last scanned. Omitted when the book has none |

A book at a range, here as the omnibus of Mistborn 1-3 that is also book 1 of a
box-set series:

```json
{
  "series": "Mistborn",
  "series_index": 1,
  "series_index_end": 3,
  "series_list": [
    { "name": "Mistborn", "position": 1, "position_end": 3 },
    { "name": "Cosmere Box Sets", "position": 1 }
  ]
}
```

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

Metadata fields (`title`, `subtitle`, `author`, `narrator`, `series`,
`series_index`, `published`, `publisher`, `language`, `abridged`, `genres`,
`tags`, `asin`, `isbn`) and chapter titles carry the **effective** values: what the scan
found, with any admin metadata edits layered on top. A book with a `series` and
no position takes the one its title gives when the title is the series' name
and then a number ("He Who Fights with Monsters 4: A LitRPG Adventure" is
`series_index` 4); a number run on from the name, a range ("1-12") or one
followed by more words gives none. A range comes only from an edit, a community
match or a `series-part` tag such as `1-3` (see `series_index_end`). The shape is unchanged; a
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

- A co-credit counts once for each person it names: a `Michael Kramer & Kate
  Reading` credit adds a book to both `Michael Kramer` and `Kate Reading`, and the
  `author` / `narrator` filter on [`/books`](#get-apiv1librariesidbooks) finds it
  by either name. Names sort case-insensitively.
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
      "duration": 284110.2, "positions": [1, 2, 3], "extra_books": 0 }
  ]
}
```

`author` is the most common author among the series' books; `positions` lists the
distinct non-zero series positions held, ascending (so a client can mark the
gaps). A book at a range holds its start, every whole number inside it and its
end (an omnibus of 1-3 adds `1, 2, 3`; one of 2.5-4 adds `2.5, 3, 4`), so an
older player shows no gaps inside an omnibus it has. Sorted case-insensitively
by name; books with no series are not counted.
Same status codes as `/authors`.

**One series, any spelling.** Series names that differ only in case, accents,
punctuation or spacing are one series ("He Who Fights With Monsters", "He Who
Fights with Monsters" and "He Who Fights WIth Monsters"): one entry, its books,
positions and length merged. Its `name` is the spelling its matched books (with
an ASIN or ISBN) use most, else the one most of its books use, ties to the first
alphabetically. Every series filter takes any spelling of the series it names
(`/books?series=`, [`/series/books`](#get-apiv1librariesidseriesbooks), the
admin [`/admin/books?series=`](#get-apiv1adminbooks)) and so does
[`/next`](#get-apiv1librariesidnext)'s series step, so the `name` here loads all of
them. Nothing fuzzier merges: "The Expanse" and "Expanse" stay two series. The
JSON is unchanged; an older player simply sees fewer, fuller series.

By default a book counts only in its main `series`, which is what shipped players
expect. With `?memberships=1` (`series_memberships` capability) it counts in every
series of its `series_list`, at its position there, and `extra_books` is how many
of `books` are in the series that way (without the param it is always `0`). Load
such a series' books with `/books?series=...&memberships=1`.

### `GET /api/v1/libraries/{id}/series/books`

*Session.* The first page of books of several series in one request
(`series_books` capability): the player's Library > Series cards ask for the
series on screen together instead of one [`/books`](#get-apiv1librariesidbooks)
request each.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `name` | string, repeated | - | a series name, once per series: `?name=Mistborn&name=Discworld`. It finds the series in any spelling (see [`/series`](#get-apiv1librariesidseries)) and comes back verbatim. At least one, at most 50 distinct. Empty names are ignored and a repeated name is answered once |
| `limit` | int | `50` | the page size of each series, as on `/books` (≤ 0 or > 200 falls back to 50) |

```json
{
  "series": [
    {
      "name": "Mistborn",
      "books": [
        { "id": 412, "library_id": 1, "rel_path": "Brandon Sanderson/Mistborn/The Final Empire",
          "title": "The Final Empire", "series": "Mistborn", "series_index": 1 }
      ],
      "next_cursor": "QnJhbmRvbiBTYW5kZXJzb24ANDEy"
    },
    { "name": "Discworld", "books": [] }
  ]
}
```

One entry per distinct name, in the order the names were given. Each entry is
exactly the first page that `/books?series=<name>&memberships=1&limit=<limit>`
returns (the default `author` sort, a book in several series found by each of
them, the same book fields), so its `next_cursor` continues on that `/books`
query; it is omitted once the series has no more books. `books` is `[]`, never
`null`, for a series with no books the caller can reach. The caller's share path
rules apply as on `/books`.

| Status | Meaning |
|---|---|
| `400` | invalid library id; `at least one series name is required` (no non-empty `name`); `at most 50 series per request` |
| `403` | `no access to this library` - no share grants it |
| `404` | `library not found` |

### `GET /api/v1/search`

*Session.* Full-text search (FTS5 over title/author/series/narrator/genres/tags) across
every library the caller can reach, scoped per-library to their share rules.
Results are relevance-ranked and de-duplicated across books libraries. Podcast
libraries are excluded even for podcast-capable callers. De-dup keeps
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

*Session.* Most recently added books across accessible **books** libraries,
merged and de-duplicated (same annotations as `/search`), newest `added_at`
first - one call for a "recently added" shelf.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | `50` | ≤ 0 or > 200 falls back to 50 |

Response `200`: `{ "books": [ … ] }`.

## Podcasts

Phase 2c-2 exposes feed following, indexed show/episode reads, scheduled and
admin-requested downloads, retention, CHAP chapters and on-demand fetch/status/Retry.
Phase 2c-3 adds [directory search](#podcast-discovery) and
[OPML import and export](#opml-import-and-export), API only.
Phase 2d-1 adds the [player](../../bridge/podcasts.md#player-phase-2d-1)
(no new route). The recognized clients, through `X-AudioSilo-Client`, are the
console's `AudioSilo Admin`, the player's `AudioSilo` with version `dev`, and
released players from **`AudioSilo/2.2.0`** (`auth.PodcastPlayerMinVersion`). A
missing or other client, or a player older than 2.2.0, is denied podcast
content even for an admin. See [visibility](../auth-and-security.md#podcast-visibility).

### Podcast read routes

*Session.* Core routes, not module-gated; kids may read within their scope.
Library routes require a podcast library (`409 not_podcast_library` on books).
Normal library access errors apply. An authorized library with every show
filtered out returns **empty lists**, not `403`. A hidden individual show is
`404 show_not_found` on the dedicated episode endpoint.

| Route | Response |
|---|---|
| `GET /api/v1/libraries/{id}/podcasts` | `200 {shows: [Show]}`; visible shows in title order, cap 2,000 |
| `GET /api/v1/libraries/{id}/podcasts/episodes` | `200 {episodes: [Episode], next_cursor: string \| null}` |
| `GET /api/v1/me/podcasts` | `200 {shows: [Show], requests: [Request]}`; followed visible shows plus the caller's open subscribe requests and those ended within seven days, in accessible podcast libraries |

Episodes require `show=<show path>`. `order` is `newest` (default) or `oldest`;
`limit` defaults to 50 and must be 1 through 200 (`400 invalid_request` otherwise).
Episodes are ordered by `published` (undated as the earliest), then
season (none counts as 0), then episode number (unnumbered before numbered,
oldest first), then path, the order the Bridge's `feed.json` uses, so an
undated serial such as a LibriVox reading lists as its feed numbers it.
Pagination uses an opaque `cursor` over that keyset; it is bound to show and
order, and a cursor from a server before 2.4.0 (a published/path keyset) is
refused. Invalid order/cursor gives `400 invalid cursor`.
Per-episode grants are applied before pagination.

A **Show**:

```json
{
  "library_id": 3, "path": "Example Show", "title": "Example Show",
  "author": "Example", "description": "Plain text", "link": "https://example.com/",
  "language": "en", "type": "episodic", "explicit": false, "private": false,
  "feed_url": "https://example.com/feed.xml", "feed_host": "example.com",
  "podcast_guid": "", "episode_count": 1,
  "latest_published": "2026-10-19T21:00:00Z", "cover_version": "9f2c1a",
  "following": true, "retention": {"mode":"keep","keep":3,"days":7},
  "status": {"last_checked": null, "last_success": null, "next_check": null, "error": null}
}
```

Private shows have `feed_url: null` and `link: ""`. Only their followers see
them, including player-facing admins; following by URL proves access through
the current or previous normalized URL hash. Unknown times and
`latest_published` are `null`. A status error is `{code, message}`.
Artwork is `GET /api/v1/libraries/{id}/cover?path=<show>[&size=160|320|640]` (`96` too from 2.5.1);
episode covers use the same show artwork.
`retention` is additive policy data on both show-list routes; older clients
must tolerate it. The server supplies the default when there is no override.

An **Episode**:

```json
{
  "path": "Example Show/2026-10-19-3fa94c0b1d.mp3", "title": "An episode",
  "published": "2026-10-19T21:00:00Z", "duration": 1720, "duration_source": "feed",
  "season": null, "episode": null, "episode_type": "full", "explicit": false,
  "description": "Plain text", "downloaded": false, "size": 0, "removed": false
}
```

`duration` is seconds; `duration_source` is `file` (present file and positive
`fetch.duration_ms`), `feed` or `none` (zero duration). `published`, `season`
and `episode` may be `null`; `episode_type` is `full`, `trailer` or `bonus`.
`removed` means the episode disappeared from the feed, independently of whether
its audio is present. `GET /libraries/{id}/item?path=<episode>` adds `episode`
to the normal Book JSON, with `show_path`, `published`, `season`, `episode`,
`episode_type`, `explicit`, `downloaded`, `duration_source` and `removed`.
That object is omitted for books. Both the episode list and `Book.episode`
add optional `generation` (integer), `sha256` (string) and `timeline_changed`
(boolean) when a valid Fetch exists, including a deleted generation. The flag
is explicitly false for an unchanged first generation and latches true after
different bytes are fetched. It does not rescale/reset saved progress or
bookmarks. `downloaded` needs committed regular audio of the expected size,
with no deletion timestamp or publication barrier; absent size is zero.
Both also add optional `fetch:Status`, independently of those generation fields,
from one batched status query per page. Older servers omit it. This public
summary differs from the on-disk Fetch pin; see [status and Retry](#podcast-fetch-status-and-retry).
An episode without a file has empty `chapters` and `files`; a stream request
triggers shared work and waits up to two seconds before a status-bearing 503.
The server never indexes podcast audio on demand itself. Present episodes
use probed duration/codec. Valid MP3 CHAP is served
through the existing chapters/files envelope with optional
`chapters_source:"id3_chap"`; without usable CHAP a present file gets one
whole-file chapter.

Direct podcast streams/downloads use
`ETag: "podcast-g<generation>-<sha256>"`, `Cache-Control: private, no-cache` and
byte ranges. Matching `If-Range` permits 206; an old validator gets the full
current generation as 200. Changed hash/generation changes the ETag even at
equal size/mtime. Each request keeps its validated opened descriptor through
serving/transcode; transformed output does not advertise the source strong
ETag or byte seeking. Ready files remain core when the module/Bridge is off.

### Podcast fetch status and Retry

The core [`podcast_fetch`](#get-apiv1server) flag advertises this protocol,
independently of `capabilities.podcasts` (the module on with its online Bridge
requirement met). Neither flag bypasses the client gate, private-show scope or
authentication.

*Session with episode read scope; kids allowed.* GET is core observation only.
POST also requires not-demo auth (`403 demo_account`), but does not use the
adult follow/check wrapper. The canonical non-hidden path must name an exact
indexed episode in a podcast library. POST JSON is strict, at most 4 KiB;
only `path` is accepted, never URL, priority, kind or identity.

| Route | Query/body | Success |
|---|---|---|
| `GET /api/v1/libraries/{id}/podcasts/fetch` | `?path=<show>/<episode.mp3>` | `200 {fetch:Status}`, never queues work |
| `POST /api/v1/libraries/{id}/podcasts/fetch` | `{"path":"<show>/<episode.mp3>"}` | `202 {fetch:Status}` for shared/new work, `200` if ready |

Both routes set `Cache-Control: no-store`. New POST work needs the module on,
an online Bridge offering `podcast.fetch` and a writable mapping. It bypasses
terminal failure cooldown, shares/promotes any open intent to 100 and never
replaces a valid present pin. Ready returns 200 before those storage checks;
existing work can still be returned/promoted when new work would be refused.
POST also starts one-ahead queue preparation. Unlike the
[admin fetch route](#podcast-storage-admin), its response is a fetch summary,
not a job request.

Every **Status** key is present:

| Field | Type | Meaning |
|---|---|---|
| `state` | string | `absent`, `queued`, `fetching`, `ready`, `failed` or `unavailable` |
| `request_id` | integer or null | matching fetch job id, if available |
| `bytes_received` | int64, nonnegative | safe byte count, possibly a proven resumed prefix; may reset |
| `bytes_total` | int64 or null | nonnegative known total; not a feed estimate |
| `retry_after_seconds` | integer | 2 for queued/fetching/unavailable, 0 for absent/ready/failed |
| `error` | null or `{code,message}` | sanitized server-owned reason; no raw job text/URL |

Absent is id/total null, received 0, retry 0, error null. Queued has an id,
received 0, total null and error null. Claimed/running/parked work is fetching,
with sanitized progress counters (received is clamped to a known total).
Ready has id null, both counts equal the committed Fetch bytes, retry 0 and
error null; it wins over stale job state. Failed retains a safe reason and
the latest failed id when available (null after pruning). Unavailable overlays
a refusal with retry 2, retaining an existing id/counters if any. Reasons
include `module_off`, `bridge_unavailable`, `library_not_writable`,
`demo_account` and, on a refused stream creation, `fetch_limit`.
Module-off status is unavailable even for claimed/running work that may finish.
List summaries use indexed presence; these GET/POST routes verify a committed
descriptor opens before answering ready. Status never includes requester,
params or progress messages.

The shared `wire-2b.json` examples are:

```json
{
  "fetch": {
    "state": "fetching", "request_id": 81,
    "bytes_received": 100, "bytes_total": 1000,
    "retry_after_seconds": 2, "error": null
  }
}
```

```json
{"state":"ready","request_id":null,"bytes_received":16493,"bytes_total":16493,"retry_after_seconds":0,"error":null}
```

```json
{"state":"failed","request_id":82,"bytes_received":0,"bytes_total":null,"retry_after_seconds":0,"error":{"code":"too_large","message":"The episode exceeds the size limit."}}
```

Missing-audio `/stream` (including Range, `download=1` and transcode) shares the
same intent at priority 100. After access/exact-path checks, the absent-file
fetch branch spends at most **two seconds** on enqueue/promotion/DB reads/wait,
with a final presence check. A ready descriptor serves normal media; otherwise
the response is `503`, `Retry-After: 2`, `Cache-Control: no-store` and JSON:

```json
{
  "error": "Episode is being fetched.", "code": "podcast_fetching",
  "fetch": {
    "state": "fetching", "request_id": 81,
    "bytes_received": 100, "bytes_total": 1000,
    "retry_after_seconds": 2, "error": null
  }
}
```

Unavailable uses `code:"podcast_fetch_unavailable"` and
`error:"The episode cannot be fetched right now."`; terminal failure uses
`code:"podcast_fetch_failed"` and `error:"The episode could not be fetched."`,
with the same headers and their Status. The final deadline summary can lag a
transition (queued while already fetching). Disconnect/timeout never cancels
household work. There is no publisher pass-through or partial playback.

Every trigger shares one open intent per library/path and current identity.
Play and Retry use priority 100; the other triggers' priorities are in
[fetch and retain jobs](../../bridge/podcasts.md#fetch-and-retain-jobs).
Promotion never demotes or resets requester/attempts/progress.
A non-admin may create five open fetch intents, counting prefetch and parked
jobs across libraries. Admins are exempt; joining/promoting existing work
does not spend or transfer quota. At the cap, a stream returns unavailable
with nested `fetch.error.code:"fetch_limit"` and no new id. POST Retry instead
returns `409 fetch_limit` with the ordinary error envelope.

| Status/code | GET/POST refusal |
|---|---|
| `400 invalid_request` | invalid/missing episode path, malformed or unknown POST fields |
| `403` / `404` | normal scope/client/private-path denial; queues nothing |
| `404 episode_not_found` | episode missing from the index |
| `409 not_podcast_library` | books library |
| `404 module_off` | POST would create work with the module off |
| `409 bridge_unavailable` / `library_not_writable` | POST would create work without the needed Bridge/mapping |
| `409 fetch_limit` | POST would exceed the non-admin creator cap |
| `409 identity_changed` | identity changed, or replacement work is still held; can also interrupt a stream trigger |

Unexpected faults remain sanitized 500s. GET reports availability/failure in
Status, not as a scheduling error. Ordinary stream retries honor terminal
cooldown; GET never retries a failed job. Clients repeat one request (GET
status, or the media request) no sooner than every two seconds, and only
while queued/fetching. Stop at ready/failed/unavailable; failure needs explicit POST Retry or a later
scheduled attempt. An unavailable retry interval is not permission for a POST
loop. The player's mirrors, hooks, cache refresh and generation/CHAP rules
are in [Player (Phase 2d-1)](../../bridge/podcasts.md#player-phase-2d-1).

### Podcast follow requests

A **Request**:

```json
{
  "id": 81, "library_id": 3, "state": "failed", "feed": "https://example.com/...",
  "private": true, "show_path": null,
  "error": {"code": "request_expired", "message": "The follow request expired. Follow the feed again."},
  "created_at": "2026-10-20T08:00:00Z", "updated_at": "2026-10-20T08:01:00Z"
}
```

`feed` is a redacted display address. `library_id` and `show_path` may be
`null`; `error` is `null` unless failed. Follow requests use the Bridge job states.

### Podcast actions

*Session, adult, not demo; Podcasts module.* The common module user wrapper
checks auth, `notKid` (`403 kid_account`), `notDemo` (`403 demo_account`), then
the toggle (`404 module_off`). The capability flag needs an online Bridge too;
the route gate checks the toggle and handlers check Bridge availability when
queuing work. POST bodies are strict JSON, at most 8 KiB. Feed URLs go in the
body, never in query strings.

| Route | Body/query | Success |
|---|---|---|
| `POST /api/v1/podcasts/follow` | `{library_id, path}` **or** `{library_id, feed_url, private?}` | `200 {state:"following", show:Show}` for an existing show; `202 {state:"subscribing", request:Request}` when queued |
| `DELETE /api/v1/podcasts/follow` | `?library_id=3&path=<show>` | `204`, also when already unfollowed |
| `POST /api/v1/podcasts/check` | `{library_id, path}` | `202 {request:{id,state}}`, returning an open poll when one exists |

Follow by path requires a visible show. Follow by URL needs a grant on the
whole library and matches current/previous URL hashes before queuing; knowing
a private URL supplies proof to follow that show. An existing follow is
idempotent. A missing private credential queues a restoring subscribe when
the URL is supplied. `private:true` forces privacy; `false` cannot override
automatic detection. Each user can have five open subscribe requests; a second
request for their same library/hash and the same privacy returns the open one.
An [OPML import](#opml-import-and-export) row answers the same way as a
follow by URL. Manual check requires
the caller to follow a visible show and, without an open poll, refuses a check
within 60 seconds of the last one.

| Status/code | Meaning |
|---|---|
| `400 invalid_request` | missing/invalid library, both or neither path and URL, private with path, an invalid unfollow/check show path, or unknown body fields |
| `400 invalid_feed_url` | malformed, non-HTTP(S), hostless or over-2,048-byte feed URL, or one whose normalized form changes when normalized again |
| `403 no_library_access` | no accessible library, or URL follow without a whole-library grant |
| `404 show_not_found` | missing, hidden or invalid show on follow by path, or check without following |
| `409 not_podcast_library` | a books library |
| `409 bridge_unavailable` | no online Bridge offering the action's podcast kind |
| `409 library_not_writable` | Bridge mapping is not writable |
| `409 privacy_conflict` | the caller already has an open subscribe request for this feed with the other privacy (a public request never joins a private one, and a private URL is never attached to a public one); wait for it to end, then follow again |
| `429 too_many_requests` | five open subscribe requests (`Retry-After: 30`, a guess at when one has settled) |
| `429 checked_recently` | last check under 60 seconds ago (`Retry-After`: the seconds until the minute is up) |

Async failures appear on Request/Show status, rather than as the follow
response's HTTP status. Codes include `invalid_feed_url`, `blocked_address`,
`dns`, `timeout`, `tls`, `network`, `http_<status>`, `gone` (410), `too_large`,
`not_a_feed`, `not_a_podcast`, `not_podcast_library`, `library_not_writable`,
`feed_secret_missing`, `request_expired`, `write_failed`, and server-only
`bridge_lost`. A private request lost before claim on a server restart is
`request_expired`; follow again. Lost Bridge credentials are
`feed_secret_missing`; follow the URL again to restore them. No podcast job
sends a finished/failed notification. See [the Bridge implementation](../../bridge/podcasts.md).

### Podcast discovery

*Session, adult, not demo; Podcasts module.* Directory search finds public
shows by name; following one is the ordinary
[`POST /podcasts/follow`](#podcast-actions) with `{library_id, feed_url}`
(there is no provider-id follow and no new follow field). The player's Add
shows page calls them (the player from 2.4.0,
[Phase 2d-2](../../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2));
the console does not.

| Route | Query | Success |
|---|---|---|
| `GET /api/v1/podcasts/discovery/providers` | none | `200 {providers:[{id, available}]}` |
| `GET /api/v1/podcasts/discovery/search` | `q`, optional `provider`, `limit`, `country` | `200 PodcastDiscoverySearch` |
| `GET /api/v1/podcasts/discovery/artwork` | `id` (and a media `token`) | `200` `image/jpeg` |

The checks run in this order, and a refused request has no other effect:
authentication (`401`), `403 kid_account`, `403 demo_account`,
`404 module_off`, then the [client gate](../auth-and-security.md#podcast-visibility)
(`403 no_library_access`, no admin exception), then `404 discovery_off` while
`podcasts.discovery.enabled` was off at start
([configuration](../configuration.md#podcast-discovery-podcastsdiscovery)).
Search needs no library grant: it reads only public directory data and
reveals nothing about the server's libraries. An unknown or repeated query
parameter is `400 invalid_request`. JSON answers carry
`Cache-Control: no-store`. `HEAD` on these routes (and on the export below)
answers `405 method_not_allowed` with `Allow: GET` before anything else runs,
so it never starts a fetch. The artwork route is *Session (media)*: it also
takes a session or API key as `?token=` (for an `<img>`), uses the media rate
limit, and refuses cast, pairing and Bridge tokens (`401`).

**Providers.** Always two entries, in this order:

```json
{"providers":[{"id":"itunes","available":true},{"id":"podcast_index","available":false}]}
```

`itunes` (Apple's iTunes Search API) is always available. `podcast_index` is
available when the server holds a valid Podcast Index key pair from its
environment; nothing probes the service, so `available` says only that the
pair is configured. A search uses exactly the provider it names: there is no
automatic fallback and no merged ranking.

**Search parameters.**

| Param | Rule | Error |
|---|---|---|
| `q` | required; valid UTF-8 with no control characters, then trimmed and runs of whitespace collapsed to one space, letter case kept; 2 to 200 characters and at most 800 bytes after that | `400 invalid_query` |
| `provider` | `itunes` (default) or `podcast_index` | `400 invalid_provider` |
| `limit` | a decimal integer 1 to 50, default 20 | `400 invalid_limit` |
| `country` | iTunes only: an ISO 3166-1 alpha-2 code, any case, default `US` (never taken from `metadata.region`); refused with `podcast_index` | `400 invalid_country` |

There is no pagination. A `podcast_index` search while that provider is not
configured is `409 provider_unavailable`.

```json
{
  "provider": "itunes",
  "query": "fixture show",
  "country": "US",
  "results": [
    {
      "title": "Fixture One",
      "author": "A & B",
      "feed_url": "https://feeds.example.org/one.xml",
      "artwork_url": "/api/v1/podcasts/discovery/artwork?id=4745a0c5c9b5a0a81f9d9396ab9abcc27c981462c6fdcbb7ab8f117de612d0e6",
      "provider_ids": {"itunes": "12345", "podcast_index": null},
      "episode_count": 12,
      "provider_url": "https://podcasts.apple.com/us/podcast/fixture-one/id12345"
    },
    {
      "title": "Fixture Two",
      "author": "",
      "feed_url": "https://feeds.example.org/two.xml",
      "artwork_url": null,
      "provider_ids": {"itunes": "9007199254740993", "podcast_index": null},
      "episode_count": 0,
      "provider_url": null
    }
  ]
}
```

Every key is always present; `results` is `[]` when nothing matched.
`query` echoes the cleaned search text and `country` is `null` for Podcast
Index. In each result:

- `title` and `author` are plain text (controls stripped, at most 500
  characters; `author` is `""` when the directory gave none). Never HTML. A
  row without a title is dropped.
- `feed_url` is the normalized public feed URL, the value to follow. Rows
  whose feed looks private (a query, user info, a token-like path, a
  private-feed host), points at a literal non-public address, `localhost` or
  `.local`, is not HTTP(S), is over 2,048 bytes or does not normalize stably are
  dropped. The server does not fetch or validate the feed at search time; the
  Bridge's subscribe job does that when someone follows it. Results are
  deduplicated by `feed_url`, the first row winning, in the directory's order.
- `artwork_url` is `null` or a **relative** link to this server's artwork
  proxy; the directory's own image URL is never returned.
- `provider_ids` holds each directory's numeric id as a decimal **string**
  (ids can exceed 2^53, so never parse them as a float), `null` when unknown.
- `episode_count` is an integer or `null` when the directory gave none or an
  invalid one; `0` is a real zero.
- `provider_url` is the show's page on the directory (`podcasts.apple.com` or
  `itunes.apple.com` over HTTPS for iTunes, `https://podcastindex.org/podcast/<id>`
  for Podcast Index), or `null`.

No result says anything about the server's own state (whether a show is
already in a library or followed).

**What the directory receives.** One GET per search the cache cannot answer,
with no retry and no redirect followed, to a fixed HTTPS origin:
`https://itunes.apple.com/search` with `term`, `limit`, `country` and fixed
`media=podcast&entity=podcast&version=2`, or
`https://api.podcastindex.org/api/1.0/search/byterm` with `q` and `max`.
Podcast Index requests also carry `X-Auth-Key`, `X-Auth-Date` (Unix seconds)
and `Authorization` (the lowercase hex SHA-1 of key, secret and that time,
joined with nothing); the secret itself is never sent. Both send
`User-Agent: AudioSilo/<version>`. The directory sees the search text and the
server's IP address; no user, library or device information is sent.

**Budgets.** All in memory, reset by a restart.

| Budget | Policy |
|---|---|
| Per user (across their tokens and both providers) | 10 searches/minute, burst 3, cache hits included, admins too |
| iTunes directory fetches | 20/minute, burst 1, server-wide (a conservative local policy) |
| Podcast Index directory fetches | 30/minute, burst 2, server-wide |
| Concurrent directory fetches | 2 server-wide; identical searches in flight share one fetch |
| Result cache | provider + cleaned `q` (case kept) + country + limit; 15 minutes, at most 256 entries and 8 MiB |
| Failure cache | a failed search is answered again for 15 seconds without asking the directory |
| Upstream `429` | the provider cools down for its `Retry-After` (seconds or a date), clamped to 1 to 300 seconds, 60 by default |

A directory fetch has five seconds end to end, bodies are capped at 2 MiB
decoded and must be exactly one JSON document. Turning the Podcasts module off
cancels fetches in flight (their waiters get `404 module_off`) and empties
every cache, so turning it back on starts empty.

| Status/code | Retry-After | When |
|---|---|---|
| `409 provider_unavailable` | - | `provider=podcast_index` without a valid key pair |
| `429 discovery_rate_limited` | seconds until the next token | the caller's own search (or artwork) budget is spent |
| `429 provider_rate_limited` | seconds | the server's directory or image budget is spent, or the directory is cooling down after its own `429` |
| `503 discovery_busy` | `1` | both fetch slots are busy, or the per-user budget table is full |
| `504 discovery_timeout` | - | the directory did not answer within the budget |
| `502 provider_rejected` | - | Podcast Index refused the key pair (`401`/`403`) |
| `502 discovery_unavailable` | - | any other directory failure: another status, network or TLS failure, a refused address or redirect, malformed or oversize JSON |

Error messages are safe text; they never carry a directory's body, headers,
URL or the credentials. Logs name the provider and a short reason only.

**Artwork.** `id` is 64 lowercase hex characters naming an image URL a recent
search result registered (its SHA-256). The caller can never name a URL: an id
of the wrong shape, unknown, expired or evicted is `404 artwork_not_found` and
fetches nothing. The server fetches the image itself (public addresses only,
checked at connect time, at most three redirects and never from HTTPS down to
HTTP, no credentials, cookies or caller headers, five seconds, at most 2 MiB)
and re-encodes it as a JPEG of at most 320 px. SVG, HTML and anything that does
not decode as an image fail. Success is `image/jpeg` with
`X-Content-Type-Options: nosniff` and `Cache-Control: private, max-age=300`.
A failed fetch is `502 artwork_unavailable`, answered again for a minute
without refetching. Registrations last 15 minutes (at most 4,096; eviction can
404 an id before its search expires), images are cached up to 32 MiB. Budgets
(from 2.5.1: artwork's own, sized by a results page of 20, and never
shared with search's): 120 artwork requests/minute per user (burst 40, hits
included), 120 image fetches/minute server-wide (burst 40), four fetching at once
and up to 40 more misses waiting for a slot, each for up to the five-second fetch
budget. A miss past those 44, or one that got no slot in time, is `503
discovery_busy` (`Retry-After: 1`; a miss that never fetched gives its image token
back); a spent bucket is the same `429` codes as search. Show a placeholder when
the artwork 404s or fails.

### OPML import and export

OPML is how podcast apps move subscription lists. The import follows each feed
of an uploaded list as the caller; the export writes the caller's followed
public shows. The player imports from its Add shows page and exports from the
Shows library mode ([Phase 2d-2](../../bridge/podcasts.md#player-discovery-and-opml-phase-2d-2));
the console has no screen for either.

#### `POST /api/v1/podcasts/opml/import`

*Session, adult, not demo; Podcasts module.* `?library_id=<id>` names one
podcast library the caller holds **whole** (no other parameter; a user can
only import for themselves). The body is the raw OPML document: no JSON,
multipart, remote URL or compression.

```bash
curl -X POST "$SERVER/api/v1/podcasts/opml/import?library_id=7" \
  -H "Authorization: Bearer $TOKEN" -H "X-AudioSilo-Client: AudioSilo/dev" \
  -H "Content-Type: text/x-opml" --data-binary @subscriptions.opml
```

(`--data-binary @-` reads it from standard input.) The checks before the
body is read, in order: authentication, `403 kid_account`, `403 demo_account`,
`404 module_off`, the client gate (`403 no_library_access`), unknown or
repeated parameters (`400 invalid_request`), a missing or non-positive
`library_id` (`400 invalid_request`), `404 library_not_found`, no whole-library
grant (`403 no_library_access`, checked before the kind so an ungranted
library's kind is not revealed), `409 not_podcast_library`, then the content
type: `application/xml`, `text/xml`, `text/x-opml` or `application/x-opml+xml`,
with no parameter but `charset=utf-8` and no `Content-Encoding` but `identity`,
else `415 unsupported_opml_type`. Then the caller's import budget (2/minute,
burst 1: `429 opml_rate_limited` with `Retry-After`, or `503 opml_busy` with
`Retry-After: 1` while the server's per-user budget table is full), the body
(read whole, at most 1 MiB), and one of two server-wide import slots
(`503 opml_busy`, `Retry-After: 1`).

The whole document is validated before any row acts, so a refused document
changes nothing:

| Status/code | When |
|---|---|
| `413 opml_limit` | over 1,048,576 bytes (whatever `Content-Length` says), over 1,000 outlines (categories included), outlines nested over 16 deep, XML depth over 32, over 5,000 elements, over 32 attributes on one element, or one decoded attribute value over 8,192 bytes |
| `400 invalid_opml` | not well-formed; a DOCTYPE, DTD or other directive (even unused); a processing instruction other than the initial XML declaration; an encoding other than UTF-8; an unknown entity; a duplicated attribute (including `xmlUrl` in another letter case); not exactly one unnamespaced `<opml>` root with `version` `1.0` or `2.0`, with at most one `<head>` and exactly one `<body>`; content after the root |

A leading UTF-8 byte order mark is accepted. Entities, includes and linked
OPML are never fetched. Titles, groups and `htmlUrl` are ignored: only the
`<body>` outline tree is read, flattened in document order. An outline with an
`xmlUrl` attribute (any letter case) is a subscription, whatever its `type`;
one whose `xmlUrl` is blank, or a `type="rss"` outline without one, is a row
with `missing_feed_url` (`htmlUrl` or `url` is never used instead); any other
outline is a category and produces no row (but counts in `outline_index`).
Within an upload the first outline with a given normalized URL wins.

`200` answers the decisions, not completion:

```ts
type OpmlRowStatus = 'followed' | 'already_following' | 'queued' |
  'already_queued' | 'duplicate' | 'invalid' | 'limited' | 'unavailable' | 'error';
interface OpmlImportRow {
  outline_index: number; // 1-based among ALL outlines, categories included
  status: OpmlRowStatus;
  feed: string | null;   // a redacted label (scheme and host, "/..." for the rest)
  private: boolean;
  path: string | null;
  request_id: number | null;
  duplicate_of: number | null;
  error: { code: string; message: string } | null;
}
interface OpmlImportResult { library_id: number; rows: OpmlImportRow[] }
```

Every key is always present and `rows` is `[]` for a list with no
subscriptions. For example, a list whose first outline is a category:

```json
{
  "library_id": 7,
  "rows": [
    {"outline_index": 2, "status": "already_following", "feed": "https://feeds.example.org/...", "private": false, "path": "Fixture One", "request_id": null, "duplicate_of": null, "error": null},
    {"outline_index": 3, "status": "duplicate", "feed": "https://feeds.example.org/...", "private": false, "path": null, "request_id": null, "duplicate_of": 2, "error": null},
    {"outline_index": 5, "status": "queued", "feed": "https://feeds.example.org/...", "private": true, "path": null, "request_id": 81, "duplicate_of": null, "error": null},
    {"outline_index": 6, "status": "invalid", "feed": null, "private": true, "path": null, "request_id": null, "duplicate_of": null, "error": {"code": "invalid_feed_url", "message": "Invalid feed URL."}}
  ]
}
```

| `status` | Meaning | Set fields |
|---|---|---|
| `followed` | a show already in the library, now followed | `path` |
| `already_following` | the caller already follows it (a previous URL of the show counts too) | `path` |
| `queued` | a new `podcast.subscribe` request (or a secret repair) was queued | `request_id`; `path` for a repair |
| `already_queued` | the caller's open subscribe request for this feed was reused (a parked one too) | `request_id`; `path` when it repairs a known show |
| `duplicate` | the same normalized URL appeared earlier in this upload (even if that row failed) | `duplicate_of` (the earlier `outline_index`) |
| `invalid` | `error.code` `missing_feed_url` or `invalid_feed_url` | `error` |
| `limited` | `error.code` `too_many_requests`: the wave is full (below) | `error` |
| `unavailable` | `error.code` `bridge_unavailable`, `library_not_writable` or `module_off` | `error` |
| `error` | `error.code` `privacy_conflict`, `no_library_access`, `subscribe_failed` or `recently_failed` | `error`; `request_id` for `recently_failed` |

`feed` is the redacted label even for public URLs, and `null` for an
invalid or missing URL; `private` follows the usual automatic detection, a
matched private show's flag, and is `true` for a row whose URL could not be
classified. An import cannot force a public-looking URL private: use the
single follow's `private:true` for a member feed without a recognizable secret.
Errors never echo the document, a title or a raw URL.

Each row acts as the caller through the same follow-by-URL service as
`POST /podcasts/follow`: the whole-library grant and the module are rechecked
per row (a module switched off midway turns the remaining rows into
`unavailable`/`module_off`, a revoked grant into `error`/`no_library_access`),
a known show (current or previous URL) is followed at once, even with the
Bridge offline, and only a new feed or a secret repair needs an online Bridge
running `podcast.subscribe` and a writable mapping. Each row commits on its
own: a later failure never undoes an earlier row.

**Recently failed feeds.** When the caller's last `podcast.subscribe` request
for a feed in this library failed within the last hour
(`podcast.RecentFailureWindow`), the row answers `error` with
`error.code: "recently_failed"` and `request_id` set to that failed request,
and nothing is queued again, so a few dead feeds cannot take every wave's
slots. Only a failure of the feed itself counts (its address, its answer, the
network): a request that ended `request_expired` (a server restart),
`bridge_lost`, `library_not_writable`, `not_podcast_library`, `write_failed`,
`feed_secret_missing` or `identity_changed` does not (`notFeedFailures` in
`internal/bridge`), nor one the caller has asked again since. A single [`POST /podcasts/follow`](#podcast-actions) by
address always retries; that is the player's Try again. Older players show the
row as a plain error.

**Waves.** One upload creates at most **five new** subscribe requests, and the
caller can never have more than five open subscribe requests at once (single
follows and imports together, admins included). Following known shows and
reusing open requests spend neither. Rows past either limit answer `limited`
with `too_many_requests`; nothing is kept for later. Uploading the same
document again is the retry: rows already done answer `already_following` or
`already_queued`, and once earlier requests finish (poll
[`GET /me/podcasts`](#podcast-read-routes)'s `requests`), the next five
`limited` rows are admitted. A private URL lives only in the server's memory
until the Bridge claims its request; a restart before that ends the request as
`request_expired`, and re-uploading recovers it.

The import runs under the server's 30-second request timeout. If that or a
dropped connection ends it, rows already committed stay and the rest are not
attempted; a re-upload continues safely.

#### `GET /api/v1/podcasts/opml/export`

*Session, not demo.* A core read, not module-gated: it works with the module
off, the Bridge offline or unpaired, discovery off or no directory key. Kids
may export within their scope. The client gate applies (`403 no_library_access`),
there are no parameters (`400 invalid_request`), and the per-user budget is
6/minute, burst 2 (`429 opml_rate_limited` with `Retry-After`; `503 opml_busy`
with `Retry-After: 1` while the per-user budget table is full).

```bash
curl -OJ -D - "$SERVER/api/v1/podcasts/opml/export" \
  -H "Authorization: Bearer $TOKEN" -H "X-AudioSilo-Client: AudioSilo/dev"
```

(`-D -` prints the response headers, so the `X-OPML-*` counts below show.)
It writes the shows the caller follows now, across every podcast library their
current scopes show them (no admin or other-user bypass; a follow of a show
since replaced at its path, pruned or hidden counts for nothing). No follows is
a valid, empty document. The body is deterministic OPML 2.0:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>AudioSilo subscriptions</title></head>
  <body>
    <outline type="rss" text="Fixture One" title="Fixture One" xmlUrl="https://feeds.example.org/one.xml"></outline>
  </body>
</opml>
```

UTF-8, LF line endings, two-space indent, flat outlines with `type`, `text`,
`title` and `xmlUrl` in that order (titles control-stripped, at most 500
characters, `Podcast` when empty), sorted by URL bytes. A public URL followed
in several libraries is written once, titled from the lowest library id then
show path. No date, user or server name is written, and nothing but the
subscription: no progress, policies, pending requests or files.

**Private shows are never exported**, whoever asks, admins included, and
there is no option to include them: the server keeps no recoverable copy of a
private URL. A public show whose URL is missing or no longer normalizes is
left out as unavailable, and one whose URL now looks private as private.

| Header | Value |
|---|---|
| `Content-Type` | `text/x-opml; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="audiosilo-subscriptions.opml"` |
| `Cache-Control` | `no-store` |
| `X-Content-Type-Options` | `nosniff` |
| `X-OPML-Exported` | the number of outlines written (unique public URLs) |
| `X-OPML-Omitted-Private` | followed, visible shows left out as private |
| `X-OPML-Omitted-Unavailable` | followed, visible shows left out with no usable public URL |

The omission counts count follows before duplicate URLs are merged. More than
10,000 matching follows, or an export over 4 MiB, is `413 opml_export_limit`
(never a truncated list); the two refusals share the code and their
`error.message` says which limit was hit ("Too many subscriptions to export
(more than 10,000)." or "The subscription list is too large to export (over
4 MiB)."). Fetch it with the `Authorization` header; there is no
`?token=` download link.

### Podcast storage (admin)

*Admin, not demo.* These routes use the separate admin catalog, not the player
client/private-show gate. Retention GET is core. PUT/DELETE and a new fetch
need the Podcasts module on, an online Bridge advertising the exact job kind
(`podcast.retain` or `podcast.fetch`) and a mapped, writable podcast library.
Non-admin callers get 403. Request JSON is strict and capped at 4 KiB.

| Route | Query/body | Success |
|---|---|---|
| `GET /api/v1/admin/libraries/{id}/podcasts/retention` | `?path=<show>` | `200 {retention:Policy}` |
| `PUT /api/v1/admin/libraries/{id}/podcasts/retention` | `?path=<show>`, body Policy | `200 {retention:Policy}` after durable save |
| `DELETE /api/v1/admin/libraries/{id}/podcasts/retention` | `?path=<show>` | `204`, resets to default |
| `POST /api/v1/admin/libraries/{id}/podcasts/fetch` | `{"path":"<show>/<episode.mp3>"}` | `202 {request:{id:81,state:"queued"}}`, or `200 {downloaded:true}` for a valid present pin |

Policy is `{"mode":"keep","keep":3,"days":7}` by default. All three fields
are required on PUT and returned, including unused values: mode
`keep|on_demand|archive`, keep integer 1..1000, days integer 0..365. Overrides
are shared per library/show path/show id and survive index rebuilds; replacing
a show at the same path starts with the default. PUT/DELETE wake scheduling
and do not wait for disk changes. There is no retention UI yet.

Keep downloads the newest N currently listed episodes (the
[episode order](#podcast-read-routes) descending, undated last); Archive
downloads all currently listed episodes oldest first and never deletes. On demand schedules no feed-wide downloads;
play, one-ahead queue preparation and admin fetch work.
No followers means no policy-scheduled downloads/deletions; authorized
play/Retry and queue preparation still work. Removed feed entries are not
auto-fetched, but explicit fetch can try the saved enclosure.

Keep deletes only outside its window; On demand has no window requirement;
both wait for every follower to finish plus the grace days, and favourites,
queues, active streams and open fetches protect an episode. Keep N is not a
disk limit. The full rules are in
[retention](../../bridge/podcasts.md#retention-policy-and-deletion-authority).

Fetch uses priority 20 and the admin's requester id, returns the existing open
job's actual state, and bypasses terminal failure cooldown. It never replaces
a valid present pin or creates duplicate open work. The present-pin 200 check
runs before module/Bridge/mapping checks, so it works offline or module-off.
Player-facing fetch/status routes use a different envelope and read scope;
see [status and Retry](#podcast-fetch-status-and-retry).

| Status/code | Meaning |
|---|---|
| `400 invalid_request` | missing/invalid show or episode path, unknown fields, incomplete/out-of-bounds policy |
| `404 library_not_found` / `show_not_found` / `episode_not_found` | missing library/show/episode |
| `403 demo_account` | a demo account (other non-admin callers get `403` without a code) |
| `404 module_off` | a storage-changing action while the module is off |
| `409 not_podcast_library` | a books library |
| `409 bridge_unavailable` / `library_not_writable` | no online Bridge offering the needed kind, or no writable mapping |
| `409 identity_changed` | the indexed identity changed during the operation, or a fetch for a replaced episode at the same path is still running |

Unexpected failures use sanitized 500 responses. Async fetch failures are a
failed job with a safe `{code,message,retry_after_seconds?}` result; see
[jobs](../../bridge/podcasts.md#fetch-and-retain-jobs) for the codes,
params/results, backoff, progress and recovery.

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
  "published": "2006-07-17",
  "description": "For a thousand years the ash fell and no flowers bloomed…",
  "subtitle": "Mistborn, Book 1",
  "publisher": "Macmillan Audio",
  "language": "English",
  "abridged": false,
  "genres": ["Fantasy", "Epic"],
  "tags": ["Owned", "Book club"],
  "cover_color": { "bg": "#1d2a3a", "accent": "#e8a33c", "on_accent": "#000000" },
  "cover_version": "3f9a1c07be",
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

`description` is the book's effective description (an admin edit or an accepted
community match), omitted when empty. It can be long, so only this single-book
response carries it; list, search, recent and `/next` books leave it out. It is
not the community-written `community_description` on
[`/meta`](#get-apiv1librariesidmeta). The other fields every book carries
(`published`, `subtitle`, `publisher`, `language`, `abridged`, `genres`, `tags`,
`cover_color`, `cover_version`, and `series_index_end`, `series_list`,
`generated` and `ebook` when they apply) are described under
[`/books`](#get-apiv1librariesidbooks); each is omitted when empty or unknown.

`chapters_source` is `"community"` when the book's `chapters` are a community
recording's chapter list fitted onto its audio rather than the files' own (see
[Community chapters](../community-chapters.md)), `"generated"` when they are the
chapters a Bridge found in the narration of a book with none of its own (Bridge
Phase 1d; see [Generated chapters](../community-chapters.md#generated-chapters)),
`"id3_chap"` for a podcast's validated MP3 CHAP attachment, and absent otherwise. It is
additive: the chapters have the same shape either way, and only this
single-book response (and [`/chapters`](#get-apiv1librariesidchapters)) carries
it.

`readalong` (Phase 3c, capability `readalong`) is the state of the book's
read-along map, the file a Bridge's `readalong.align` job wrote beside it (see
[Read-along](../../bridge/readalong.md)):

```json
"readalong": { "state": "ready", "coverage": 0.996, "generated_at": "2026-11-02T10:11:12Z" }
"readalong": { "state": "stale", "reason": "ebook_changed" }
```

`ready`: the map fits the book, `coverage` the share of the ebook's text it lines
up (0 to 1), `generated_at` when it was made; fetch it from
[`/readalong`](#get-apiv1librariesidreadalong). `stale`: it was made for another
ebook (`reason` `ebook_changed`) or other audio (`audio_changed`; the rules:
[Read-along](../../bridge/readalong.md#on-the-server)), so a client hides it until an admin
makes it again. Omitted when the book has no ebook, no map, or a map that fails the
server's checks. Only this single-book response (and the console's book page)
carries it, never a list row: working it out may read the ebook's digest.

`direct_playable` reports whether the book plays in browsers **as the server
serves it** (unknown codec ⇒ `true`). A book with a Matroska (`.mka`) file is
`false` (from 2.4.0), except one whose `.mka` files hold MP3 on a server with
ffmpeg configured: [`/stream`](#get-apiv1librariesidstream) serves those as
their remux to MP3, so it is `true`. Answering `/item` (or `/chapters`) also
starts those files' remuxes in the background, so the first stream usually
finds them ready. The web player streams a `false` book with `?transcode=1` when
the `transcode` capability is true; it does not retry through the transcoder after
a failed direct play. Durations/positions are seconds (float).

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
  "direct_playable": true,
  "chapters_source": "community"
}
```

`chapters_source` - `"community"` when `chapters` are a community recording's
list fitted onto the book's audio (an admin chose them, or the files have no
chapters of their own); `"generated"` (Bridge Phase 1d) when they are the
chapters a Bridge found in the narration of a book with no chapters of its own
(its `.audiosilo/chapters.json`); `"id3_chap"` for a podcast's validated MP3
CHAP attachment; **absent** for other files' own chapters, and on
servers before it. The chapters keep the same shape either way, so an old client
plays community or generated chapters as ordinary ones. See
[Community chapters](../community-chapters.md) and
[Generated chapters](../community-chapters.md#generated-chapters).

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
| `work` | the next entry of the community rail that decided (see step 1), shaped like a [`/meta` rail entry](#get-apiv1librariesidmeta). With `local` beside a `community` answer; **without** `local` beside a `series`, `folder` or `none` answer when the rail names a next work the server could not place on one of the caller's books (a client can show it as "next in the series, not on this server"). Absent when no rail names one |

The server follows **every series the book is in**: its main `series` first, then
its other series (`series_list`) in their order. The community rails answer first,
but only when they can **place** the next entry on one of the caller's books.
Otherwise the local steps decide, in order, and the first one with an answer wins:

1. **`community`** - community metadata is on and the book matches a work with at
   least one series rail. The rails are taken in the book's own order: a rail
   named like its main series first (by the rail's name or one of its orderings',
   ignoring case, accents, punctuation and spacing), then rails named like its
   other series in list order, then the rest as the envelope lists them. On each
   the server reads the entry after the current work on the rail's **main view**
   (the smallest numeric position above the current one; an entry at a range
   such as an omnibus `1-3` counts by its start, and a current work at a range
   by its end, so after the omnibus comes `4`; a single entry wins a tie with a
   range starting at the same number; unnumbered entries are skipped), passing over any entry that comes at or
   before the current work on a rail ranked above it, so two orders of the same
   books (a chronological series and a publication-order one) can't step
   backwards or loop. The **first rail with a next entry decides**, and a later
   rail's entry never answers in its place: the server
   places that entry for the caller exactly as `/meta` places
   [`local`](#owned-entries-local), and when it is placed the answer is `next` +
   `book` + `work`. When it is not (the caller's copy is untagged, or filed under
   a series named unlike the rail, or they don't have it), failing to place proves
   nothing, so the steps below answer and the entry rides along as `work` without
   `local`. Nothing comes from this step (no `work`) when the book has no
   ASIN/ISBN, has no match or no rails, the metadata service fails, or no rail has
   a next entry (no current position is a number, the current work is last on
   every rail, or every later entry steps back; a rail can lag the library). A
   failure reading the caller's books leaves the entry unplaced, as `/meta`
   degrades.
2. **`series`** - the book's series with a position above 0, main series first
   (`series` at `series_index`, then each other series at its position there). For
   each, the candidate is the book of that series (in any spelling, as
   [`/series`](#get-apiv1librariesidseries) groups them) in the same library
   (by its main series or one of its other series, at its position in that
   series) with the smallest higher position (ties: a single position before a
   range starting there, then by path), within the caller's scope, passing over
   any book that comes at or before the current book in a series ranked above in
   which both books are numbered. A book at a range counts from its end (after an
   omnibus of 1-3, the next is 4) and a candidate by its start (from book 2, an
   omnibus of 1-3 is no step forward); a book inside the current omnibus in a
   series ranked above is passed over. The first series with a
   later book that isn't passed over answers. When none has a later book but some other book in one of them is
   numbered, the answer is `{"source": "series"}`, the end of the series; when
   nothing else is numbered the step falls through.
3. **`folder`** - the book's parent folder, listed whole as the caller may open it
   (their share scope and the library's ignore rules): the first book or folder
   whose name sorts after the current one, preferring a book: an indexed one or,
   from 2.5.0 (server#211, `markPendingNext`), a folder no scan has reached that a
   scan would make a book of (`library.MarkPendingBooks`, the folder listing's
   [`pending_book`](#get-apiv1librariesidfs) rule; only folders before the first
   indexed book after the current one are read). A pending answer has `next` but no
   `book`; opening it indexes it on demand, as `/item` does. Names are
   compared the way the player's `localeCompare` (numeric, base sensitivity) does:
   case and accents folded, numbers by value, so `Book 2` comes before `Book 10`;
   ties by path. A folder that is not indexed is offered only when nothing in the
   folder, the current book included, is indexed (a folder mid-scan); loose files
   that are not books are never offered. Ordering is by name, not `series_index`.
   An unreadable folder falls through.
4. **`none`** - `{"source": "none"}`.

After a **podcast episode** (a path in a podcast library) none of those steps
run: the answer is the next episode of its show in the
[episode order](#podcast-read-routes) oldest first (whichever way the show
lists), among the episodes in scope that can still play (in the feed, or kept
on disk), as a `folder` answer with `next` and `book`; `{"source": "none"}` at
the show's end. Episode file names say nothing about their order, so the
folder's name order is never used (`catalog.NextPodcastEpisode`).

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
indexed book: stored in `book_enrichment`, or set by an
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
          "release_date": "2013-03-22",
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
in this series" row). Positions are strings ("1", "2.5", "1-3.5"). Each rail entry
(in `series[].works[]` and `series[].orderings[].works[]`) carries `release_date`
(2.6.0, additive): the work's first release, the earliest across its recordings and
marketplaces, at the precision the community states it (`YYYY`, `YYYY-MM` or
`YYYY-MM-DD`), omitted when unknown. A cached envelope gains it once its entry is
next refreshed (within a day). The console's Series page dates its gaps by it, and
[upcoming releases](#upcoming-releases) classify by the same date.

#### Series rules

The community lists every series a work is in, and not each of them is a series
a book of the work is in. The server applies one set of rules
(`internal/meta/seriesrules.go`) to the rails above and to the
[match dialog's candidates](#get-apiv1adminlibrariesidbookmatch), which is what a
match writes onto a book:

- a **variant reading order** (`ordering_of`) is an alternate view of its rail,
  never a series of its own;
- a **translation** (`translation_of`) of another series the work is in, whose
  original is in the work's language, and a series whose derived `language`
  differs from the work's (primary subtags; an unknown language agrees), are left
  out;
- an **edition** is a series named exactly like another of the work's series plus a
  bracketed qualifier or a "narrated by" tail. The community API links no series to
  a recording, so the qualifier says which recordings hold it: `abridged` (the
  abridged recordings), a full cast or dramatisation (a recording with four or more
  narrators, or one named "Full Cast"), "Narrated by X" / "Gesprochen von X" (the
  recordings X narrates). An "(Unabridged)" edition repeats its base, and a language
  edition or an ordering note holds no recording, so those are left out. A book is
  in an edition only as one of its recordings, and then it is its main series.
- A name that only extends another ("Discworld: Tiffany Aching") is a series of its
  own.

The language and translation facts come from each series' record (`series/{id}`),
read once per series and cached as long as an enrichment.

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
  in "Narnia" and "Narnia (Chronological)" spends one slot.
- **The cap goes to the book's own series** (the [series rules](#series-rules)).
  Before the cap, an **edition** named for a kind of recording ("Discworld
  (abridged)", "Harry Potter (Full-Cast Editions)") is kept only when the envelope's
  recording is that kind (the recording the lookup named, or the work's only one;
  never a guess of the first recording), and then goes first, since it is the
  book's main series; other editions are left out. Without this, a Discworld novel
  listed in six series, three of them "(abridged)" editions, lost its "Discworld:
  Tiffany Aching" rail to them. An edition named for anything else (an ordering note
  from a metaserve that predates `ordering_of`) keeps its place, so a pre-v7 upstream
  still yields the same rails. A series known to be **foreign** (another language
  than the work, or a translation of another of its series) is left out: before the
  cap when the server already holds its record, else once its record is fetched, and
  then it hands its slot to the next family (at most twice, `maxForeignRails`). One
  enrichment issues at most (3 + 2) main-view requests plus 3 x 2 alternates.
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
carry different licences. It is absent for most works. A description generated
on this server never appears here: it rides in `work.generated_description`
([Generated content](#generated-content)).

#### Attribution

`work.attribution` is the credit the CC BY-SA layer requires wherever it is shown:

| Field | Value |
|---|---|
| `credit` | `AudioSilo Meta community contributors` |
| `license` | `CC BY-SA 4.0` |
| `license_url` | `https://creativecommons.org/licenses/by-sa/4.0/` |
| `source_url` | the work's page on the metadata site (the envelope's `web_url`) |

It is present **if and only if** the work's **community** content carries CC
BY-SA material (`characters`, `recaps`, `recap_summary` or
`community_description`), so a client shows the credit exactly when it shows
content that needs it. [Generated content](#generated-content) never counts. The server writes
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
   whose `series_index` equals the entry's numeric position. An entry at a range
   (`"1-3"`) takes a book at that same range (`series_index` 1,
   `series_index_end` 3); an entry at one number takes a book at it, else a book
   whose range starts there.

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

#### Generated content

Characters, recaps and (since Bridge Phase 1c) the description the
[Bridge](#the-bridge) generated for the book on this server (its
[`.audiosilo/` files](../../bridge/attachments.md), checked and indexed by the
scan) are laid into the answer **per request**, after the shared cache and
`local`, on the request's own copy: never into the cache. Community content wins
**per dimension**:

- **A matched book.** When the community work has no characters,
  `work.characters` are the generated ones; when it has no recap list,
  `work.recaps` are the generated recaps and, when it has no `recap_summary`
  either, `work.recap_summary` the generated `{in_short, ending}` (omitted when
  both are blank); when it has no `community_description`,
  `work.generated_description` is the generated description (below). A
  community work with a summary but no list keeps its own summary beside the
  generated list. `work.generated` then names what came from the files:

  ```json
  "generated": { "characters": false, "recaps": true, "recap_summary": true, "description": true,
                 "generated_at": "2026-10-16T09:12:44Z" }
  ```

  `recaps` is `true` when the recap list or the summary was generated, as before
  Phase 1e, so an older client reads it unchanged. `recap_summary` (Bridge Phase
  1e) is `true` only when `work.recap_summary` itself came from the files:
  `false` beside a generated list means the summary is the community's, so a
  client credits it to the community; a client that finds it absent (an older
  server) reads `recaps` for both. The four booleans are always sent together
  (`description` since Phase 1c, `recap_summary` since Phase 1e); `generated_at`
  is the provenance's time (`bridge.json`'s `generated_at`, or its `description`
  object's when the description is all the object names, so a description
  written later by a `sidecars.describe` job shows its own time), omitted when
  unknown; the whole object is omitted when nothing was generated (or the
  community has it all).
- **A book with no match** (no `asin`/`isbn`, or none upstream) but generated
  content answers `matched: false` **with a work** of its own: `id` empty,
  `title` the book's, `authors` `[]`, the generated `characters`, `recaps`,
  `recap_summary` and `generated_description`, and `generated`:

  ```json
  { "matched": false, "work": { "id": "", "title": "The Book", "authors": [], "language": "",
    "characters": [ … ], "recaps": [ … ],
    "generated": { "characters": true, "recaps": true, "recap_summary": false, "description": false } } }
  ```

  A book whose only generated file is its description answers just that:

  ```json
  { "matched": false, "work": { "id": "", "title": "The Book", "authors": [], "language": "",
    "generated_description": { "text": "…" },
    "generated": { "characters": false, "recaps": false, "recap_summary": false, "description": true,
                   "generated_at": "2026-10-16T09:31:02Z" } } }
  ```

- **An upstream failure** is a `502` only when the book has no generated
  content; with some, the answer is the unmatched one above (the server's own
  content doesn't depend on the upstream).

**The generated description** (Phase 1c) is the book's own-words, spoiler-free
description, `work.generated_description: { "text": … }` (no licence, no
attribution). It rides in its **own** field, never in `community_description`:
the shipped 2.0 app shows `community_description` first in About, over the
book's own description, and credits it to the community, so a generated text
there would replace real blurbs on old apps; those apps ignore the new field.
The server fills it only when the community work has no `community_description`;
the work's core `description` (the publisher's kind) doesn't block it, since the
player orders those itself (the book's own description, then the core one, then
the generated one).

**Attribution is the community's alone.** `work.attribution` is decided from
the community content before anything generated is laid in, so generated
characters, recaps or a description never make the server claim the CC BY-SA
credit, and a work whose only content is generated carries none. A client shows
the credit beside the community's dimension only (the player's `communityCredit`).

**Spoiler gates:** `spoilers=hide` gates the generated characters and recaps
exactly as it gates the community's (a gate that leaves an unmatched book nothing
answers plain `{ "matched": false }`), and **keeps** the generated description:
it is spoiler-free by construction (the Bridge writes it from the opening
chapters' notes only). `include=previous` stays community only.

Metadata off, `/meta` is `404` as ever: generated content needs metadata on, as
the generate action does. A book whose row names no generated file
(`generated` absent) isn't looked up, so this costs nothing for other books, and
only the parts the community work leaves to fill **and** the book's signature
names are read (a work with community characters and recaps reads just the
description).

**Older players.** A player that predates the field ignores everything beside
`matched: false`, so it shows nothing for an unmatched book. For a matched book
it shows the merged work as it would the community's: the generated dimension
without a mark, and the work's community credit beside it when the community
has the other dimension. The owner kept that behaviour as built (Bridge Phase
1a): newer players mark the generated dimension and drop the credit there. No
older player shows a generated description: it is a field they don't know.

| Status | Meaning |
|---|---|
| `200` | `{ "matched": true, … }` on a match, or `{ "matched": false }` (with a `work` when the book has generated content) otherwise |
| `400` | missing `path` / invalid library id |
| `403` | path outside the caller's share scope |
| `404` | `no book at that path`, **or** metadata lookup is disabled on this server (`metadata` capability false) |
| `500` | with `spoilers=hide`, `could not load progress` - the caller's progress could not be read; the ungated envelope is never sent instead |
| `502` | `metadata service unavailable` - the upstream was unreachable or errored, the server holds no earlier answer for the book, and it has no generated content |

### `GET /api/v1/libraries/{id}/meta/cover`

*Session (media).* A community cover from the book's `/meta` envelope, as a JPEG
thumbnail the server fetched: a series rail entry's `cover_url` (main view or any
ordering, so the `previous[]` books too) or the recording's. This is how the player
shows community covers. The web player's CSP takes images only from the server, so
it can't load a `cover_url` from its own host, and with this route a listener's
device never contacts the cover hosts at all. Gated by the `meta_covers`
[capability](#get-apiv1server), which follows `metadata`: when it is false the
route returns 404. Like `/cover` it takes media auth, so the session token may ride
as `?token=` on an `<img>`.

| Query param | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | the book whose `/meta` envelope handed out the cover; authorized against the caller's share scope exactly like `/meta` |
| `url` | string | yes | the `cover_url`, exactly as the envelope carries it |
| `size` | int | no | `96` (from 2.5.1), `160`, `320` (default) or `640`: the thumbnail's longest side in pixels |
| `token` | string | no | media-auth fallback |

**Not an open proxy.** The server looks up the book's envelope (the same lookup and
cache as `/meta`) and serves `url` only when it is, character for character, a
cover URL that envelope hands out. Anything else is `404 no such cover` before
anything is fetched, so a caller can make the server fetch only images it could
already see named in a book it can reach. The fetch itself keeps the guards of
[`PUT …/cover/community`](#put-apiv1adminlibrariesidcovercommunity): public
addresses only, at most 3 redirects, 15 seconds, at most 16 MiB.

Response `200`: `image/jpeg`, the image decoded and re-encoded within `size` x
`size` pixels (never scaled up), so the upstream's bytes and content type never
reach the client.

- Thumbnails come from the server's in-memory thumbnail cache, the one
  [`POST /admin/meta/covers`](#post-apiv1adminmetacovers) uses (keyed by URL and
  size). Requests for the same thumbnail at once share one fetch.
- `ETag` is `"community-<size>-<rev>-<hash>"`, the hash of the URL (`rev` names
  how the server makes thumbnails, as on [`?size=`](#get-apiv1librariesidcover)), and
  `Cache-Control` is `private, max-age=86400` (a community cover URL names one
  image; a new cover is a new URL). A matching `If-None-Match` is a `304` without
  the image being fetched.
- **A failed fetch is not cached, but it is remembered for 1 minute**: until then
  the same URL is answered `502 cover_unavailable` straight away, without asking
  its host again, so a broken or hung host isn't fetched on every render. The
  console's batch ignores that window and always tries again.
- An image that can't be decoded or is over 40 megapixels is cached as "no
  cover" (`404`).
- Unlike `/cover` and `/stream`, this route stays under the 30 s
  [request timeout](index.md#error-envelope-and-status-conventions): it is a
  bounded thumbnail, not a stream.

| Status | Meaning |
|---|---|
| `200` | the JPEG thumbnail |
| `304` | `If-None-Match` matched |
| `400` | `url is required`; `size must be one of [96 160 320 640]` (an empty `size=` too); `path is required` / `invalid library id` |
| `401` | missing/invalid token |
| `403` | path outside the caller's share scope |
| `404` | `no such cover` - the book is unmatched (no `asin`/`isbn`, or no match upstream) or its envelope hands out no such URL; `no cover` - the image isn't one the server can decode, or is over 40 megapixels; `no book at that path`; `metadata lookup not enabled` (`meta_covers` false) |
| `502` | `metadata service unavailable` - the book's envelope couldn't be had; `code: "cover_unavailable"` - the image couldn't be fetched (an address that isn't public, a timeout, too many redirects, an answer other than `200`), or its fetch failed less than a minute ago |

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
30 s request timeout. Both also take a [cast token](#cast-tokens-as-media-auth) as
the `?token=` (capability `cast`), for the book it was minted for. See
[Media](../media.md) for serving internals.

### `GET /api/v1/libraries/{id}/stream`

*Session (media).* Streams one **audio file** by path. The path must be a real
file - a chapter's `file_path` or a `files[].rel_path` - never a book/folder
path.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `path` | string | required | library-relative audio file path |
| `download` | `1` | - | sets `Content-Disposition: attachment` so browsers save the file (a remuxed `.mka` is named `<stem>.mp3`) |
| `transcode` | `1` | - | re-encode to MP3 via ffmpeg for codecs browsers can't decode |
| `original` | `1` | - | an `.mka`: serve the stored Matroska bytes, never the remux (for API tools and backups) |
| `t` | float | `0` | with `transcode=1`: start the transcode this many seconds in |
| `token` | string | - | session token (media-auth fallback), or a [cast token](#cast-tokens-as-media-auth) for this file's book |

Direct serving (default) supports HTTP **Range** (`206 Partial Content`) and
sets the audio `Content-Type` from the file. Transcoded output is MP3 and **not
byte-seekable** - no Range, no `Content-Length`; a client seeks by re-requesting
with a new `t`. The ffmpeg process is bound to the request, so disconnecting
kills it. A `HEAD` with `transcode=1` gets the headers without running ffmpeg.

**Matroska holding MP3** (server#174). While ffmpeg is configured, a request
for an `.mka` file without `transcode=1` or `original=1` is answered with a
cached lossless copy of its audio as plain MP3: `Content-Type: audio/mpeg`,
`Accept-Ranges: bytes`, Range honoured, chapters as ID3 `CHAP` frames, a strong
`ETag: "remux-<key>"` and the copy's own `Last-Modified` (so a validator kept
from the stored Matroska never earns a `304` or a spliced range). It is the
same URL that served the Matroska before, so shipped clients stream the MP3 with
no change. A podcast library's stream is never remuxed. A copy not made yet is
waited for up to 2 seconds; past that (or when the server is short of disk, or the copy fails) that request gets
the live MP3 transcode instead, as `transcode=1` would, and the copy goes on
for the next one. From 2.5.0 (server#212) a `download=1` request, and a stream
that finds every transcode slot busy, keep waiting for a copy still being made,
up to 45 seconds (`remuxDownloadWait`), so a download saves the lossless copy
rather than the transcode and a busy server doesn't answer `503`; past that they
are transcoded after all. An `.mka` holding another codec (AAC, Opus, FLAC) is served
as stored, `audio/x-matroska`. See
[Remuxing Matroska](../media.md#remuxing-matroska-mediaremuxer).

| Status | Meaning |
|---|---|
| `200` / `206` | file bytes (Range honored for direct serving and a remuxed `.mka`) |
| `400` | missing `path` / path escapes the root |
| `401` | missing/invalid token |
| `403` | path outside the caller's scope |
| `404` | file does not exist |
| `503` | `transcode=1` but ffmpeg is not configured (check the `transcode` capability), or every transcode slot is busy (`server busy transcoding; try again shortly`, with `Retry-After: 5`; also a cold `.mka` answered with the transcode); `the server is shutting down` for a remux cut short by shutdown |

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
| `size` | int | no | `96` (from 2.5.1; older servers refuse it, below), `160`, `320` or `640`: a JPEG thumbnail instead of the full art (`cover_sizes` capability; below) |
| `v` | string | no | ignored by the server; clients append the book's `cover_version` as a cache buster |
| `token` | string | no | media-auth fallback: a session token, or a [cast token](#cast-tokens-as-media-auth) for this book |

Response `200`: image bytes with the appropriate `Content-Type`; `404`
(`no cover`) when there is no custom cover, no cover file and no embedded art.

**Thumbnails (`?size=`).** With `size`, the response is a JPEG of the same art
(custom cover, sidecar image or embedded art, in the same order) scaled to fit
within `size` x `size` pixels, never scaled up, from the server's in-memory
thumbnail cache - the one the admin console's
[`POST /admin/covers`](#post-apiv1admincovers) uses. Its longer side is at most
`size` pixels (a 2:3 portrait cover at `320` is 213 x 320). A JPEG already within
`size` may be sent re-encoded at quality 80 when that is smaller (see
[Media](../media.md#thumbnails-for-the-admin-console-post-admincovers)). A source
larger than 40 megapixels, or one that can't be decoded, is a `404` here although
the full-art URL still serves it, so a client falls back to the URL without `size`
on a thumbnail `404`.

`96` is for a table row's small cover. The admin console asks for it through
[`POST /admin/covers`](#post-apiv1admincovers), never this route, which takes it
because the two share their sizes. A server before 2.5.1 answers it `400`, and
`cover_sizes` is true on both, so a client that talks to older servers (the
player) keeps to `160` and up.

- `ETag` is `"thumb-<size>-<rev>-<hash>"`. `rev` names how the server makes
  thumbnails: it changes when a server update makes other bytes of the same art,
  so a client fetches each thumbnail once more after such an update instead of
  keeping, or resuming a range of, the old bytes. `hash` is the art's own
  version: the value the book's [`cover_version`](#get-apiv1librariesidbooks)
  takes from its first thumbnail on. `If-None-Match` is matched like the server's
  other validators (a list, weak tags).
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
| `400` | `size must be one of [96 160 320 640]` - any other value, including an empty `size=` (an older server ignores `size`, so only send it when `cover_sizes` is true); missing `path` / invalid library id |
| `304` | `If-None-Match` matched (thumbnails, and custom covers) |
| `403` | the path, or the book it resolves to, is outside the caller's share scope |
| `404` | `no cover`: no art at all, no book at the path, or (with `size`) art that cannot be decoded or is over 40 megapixels |
| `500` | `could not load cover` - the art could not be read (an unreadable network mount) or a database failure; not cached, so the next request tries again |

### Cast tokens as media auth

A Chromecast receiver plays a book from URLs the player hands it, so the player
never hands over its session token: it mints a **cast token** for the book with
[`POST /cast/token`](#post-apiv1casttoken) and builds the receiver's URLs with that
instead. The two routes above accept one as the `?token=` (the middleware
`requireBookMediaAuth`; `auth.ResolveCastRequest`, one token lookup that decides
session, API key or cast) only when **all** of these hold:

- the request carries **no** `Authorization` header (a cast token is never a bearer
  credential, nor accepted beside one);
- the token is live (not revoked or expired, its user enabled, and the session that
  minted it still signed in; see [Cast tokens](../auth-and-security.md#cast-tokens));
- the request's library is the token's, and its `?path=` (cleaned first, so `..`
  can't climb out) is the token's book or a file or folder inside it on a segment
  boundary: a token for `Author/Book` reaches `Author/Book/01.mp3`, never
  `Author/Book 2/01.mp3`;
- the path addresses the token's **own** book in the index (`api.castOwnBook`): a
  folder book's folder can hold other books (`Series` holding `Series/Book 2`), and
  a cast token for `Series` never reaches them; a path the index places in no book is
  refused too.

Any refusal is the same `401` as a bad session token. The handler then checks the
person's **current** share scope as for every request, so a book whose share was
taken away since the mint is a `403`. A cast token is never accepted on any other
route, [`/meta/cover`](#get-apiv1librariesidmetacover) included.

An answer authenticated by a cast token carries
`Cross-Origin-Resource-Policy: cross-origin` in place of the server's usual
`same-site`: the receiver is a web app served from another site (`gstatic.com`)
that loads the files as `<audio>` and `<img>`, which the browser would otherwise
block. A session's or API key's media answer opts out the same way only when
`cors_origins` is set (from 2.4.1; see
[Transport hardening](../auth-and-security.md#transport-hardening)). A cast token authenticates `?transcode=1&t=`
like a session (the player asks for it for codecs a Cast receiver can't play);
each such stream holds one of the transcoder's slots while the receiver reads it,
and it marks the **sending device's** listening session as transcoded (the sender's
own progress saves make the session). The media rate limiter keys a cast token by its
token id like any credential, so it has a bucket of its own.

## Ebooks and the reading place

The reader (Bridge Phase 3b, capability `ebooks`): a book whose folder holds its
EPUB carries an [`ebook`](#get-apiv1librariesidbooks) field, the player fetches
the file from [`/ebook`](#get-apiv1librariesidebook) and keeps the reader's place
in it with [`/reading-progress`](#get-apiv1librariesidreading-progress). All three
routes address the **book** by its own path (`?path=`, as
[`/item`](#get-apiv1librariesiditem)), never the `.epub`'s path or a track's, and
all take *Session* auth from the `Authorization` header only. Which file is a
book's ebook is the scan's call: see
[A book's ebook](../scanner.md#a-books-ebook). The web player's reader is the
document at [`/web/reader.html`](../web-ui.md#the-reader-document-readercsp).

### `GET /api/v1/libraries/{id}/ebook`

*Session* (a session token or an API key). The ebook of the book at `?path=`, as
bytes:

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes: the book's own path (`rel_path`), not a part, a track or the `.epub` |

Response `200` (or `206` for a Range request): the file the scan recorded for the
book, opened afresh and checked to be a regular file inside the library (a link
swapped in since the scan is never followed out), served with `http.ServeContent`:
Range, an `ETag` from its size and mtime, `Last-Modified`. Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/epub+zip` |
| `Content-Security-Policy` | `sandbox; default-src 'none'` (navigating to the URL runs and loads nothing) |
| `Cache-Control` | `private, no-cache` |
| `X-Content-Type-Options`, `Cross-Origin-Resource-Policy` | the site-wide `nosniff` and `same-site` |

**No `?token=`.** Unlike [`/cover` and `/stream`](#streaming--media), this route
never reads a token from the URL, and there is no URL token for it of any kind (a
[cast token](#cast-tokens-as-media-auth) is refused either way). The web player
fetches the bytes with its bearer header and hands them to its reader document, and
the apps download them with the header into a local file they post to their reader
in chunks, so nothing ever holds a URL that carries a credential. The bytes are
exempt from the 30 s request timeout (an illustrated EPUB can be tens of megabytes on a slow
link), but the book lookup before them is not: a lookup past it is
`503 request timed out` (`writeCatalogError` on `context.DeadlineExceeded`), as the
timeout middleware answers elsewhere. The
route is limited with the authenticated API, per credential, not by the media
bucket ([rate limiting](index.md#rate-limiting)).

| Status | Meaning |
|---|---|
| `200` / `206` | the EPUB's bytes |
| `400` | missing `path` / invalid library id |
| `401` | no `Authorization` header, or a bad token (a `?token=` alone is a `401`) |
| `403` | the book is outside the caller's share scope |
| `404` | `this book has no ebook`: the book has none (no `.epub`, several, an unreadable one), the file is gone or no longer a regular file inside the library, the path is inside the book but not its own (a track, the `.epub` in its folder), or the library is a podcast library; `no book at this path` when there is no book there; `not found` for a hidden or `.audiosilo/` path |
| `500` | `could not load the ebook`: the file is there but can't be read right now (a permission, a flaky mount; logged) |
| `503` | `request timed out`: the book lookup ran past the request timeout |

### `GET /api/v1/libraries/{id}/readalong`

*Session* (a session token or an API key), capability `readalong` (Bridge Phase
3c). The read-along map of the book at `?path=`: where each sentence of its ebook
is spoken in its audio, as a Bridge wrote it into the book's `.audiosilo/` folder
(the format, `audiosilo-readalong/v1`, is in
[Read-along](../../bridge/readalong.md#the-map-audiosilo-readalongv1)).

| Query param | Type | Required |
|---|---|---|
| `path` | string | yes: the book's own path (`rel_path`), not a part or a track |

Response `200`: the map file's bytes as they are on disk.

| Header | Value |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` |
| `Content-Encoding` | `gzip` when the request's `Accept-Encoding` allows it (`Vary: Accept-Encoding`) |
| `ETag` | `"<size hex>-<mtime ns hex>"` of the file (the same for both encodings); a matching `If-None-Match` is `304` |
| `Cache-Control` | `private, no-cache` (the Bridge may rewrite the map at any moment) |

**Header auth only**, as [`/ebook`](#get-apiv1librariesidebook): `?token=` is
never read, and a map is at most 16 MiB, so it stays under the request timeout.
Every request reads the file again (a regular file in a real `.audiosilo` folder,
never through a link; read once more when the Bridge renamed a new map in as it
was opened) and checks it against the book **now**, never trusting the indexed
copy for the bytes it sends: its head must pass the server's checks, its
`ebook.sha256` must be the digest of the book's ebook (the stored one only while
the file on disk still has the signature it was computed for, else hashed now),
and its `audio.files` must be the book's files.

| Status | Meaning |
|---|---|
| `200` | the map |
| `304` | not modified |
| `400` | missing `path` / invalid library id |
| `401` | no `Authorization` header, or a bad token (a `?token=` alone is a `401`) |
| `403` | the book is outside the caller's share scope |
| `404` | `code: "no_readalong"` (`this book has no read-along`): the book has no map, a map that fails its checks, or no ebook; the path is a part of the book, not its own; or the library is a podcast library. `no book at this path` when there is no book there |
| `409` | `code: "readalong_stale"` with `reason` (`ebook_changed` or `audio_changed`): the map was made for another ebook or other audio; an admin makes it again |
| `500` | `could not load the read-along`: the file is there but can't be read right now (logged) |
| `503` | `request timed out`: the book lookup ran past the request timeout |

### `GET /api/v1/libraries/{id}/reading-progress`

*Session.* The caller's place in the ebook of the book at `?path=` (a part path
reads its book's):

```json
{
  "reading_progress": {
    "library_id": 1,
    "path": "Charles Dickens/A Christmas Carol",
    "cfi": "epubcfi(/6/14!/4/2/1:0)",
    "progression": 0.4213,
    "version": 3,
    "device_id": "web-7f3c9a",
    "device_name": "Pixel 8",
    "updated_at": "2026-10-25T10:00:00.000Z"
  }
}
```

or `{ "reading_progress": null }` when the caller has none for the book. `cfi` is
the place as an EPUB CFI; `progression` the same place as a fraction of the book
(0 to 1); `version` the server's count of applied writes (bumped on every one);
`device_id` the client's id of the device that wrote it and `device_name` that
device's name as the server knows it from the saving token (`""` when unknown).
`updated_at` is the client's time of the save, stored as fixed-width UTC
milliseconds. `400` / `403` as `/ebook`; `404` when there is no book at the path
or the book has no ebook.

The place is separate from listening [progress](#get-apiv1librariesidprogress)
on purpose: neither ever moves the other. It is durable, path-keyed user state
(`reading_progress`, see the [data model](../data-model.md#durable-per-user-state-path-keyed-no-fk-to-books)),
so it survives an index rebuild and moves with the book.

### `PUT /api/v1/libraries/{id}/reading-progress`

*Session.* Saves the caller's place, keyed on the book's own path (a part path
resolves to its book), by Sync v2's conflict rule.

| Body field | Type | Notes |
|---|---|---|
| `cfi` | string | required: starts `epubcfi(`, at most 2048 bytes |
| `progression` | float | required (absent or `null` is a `400`, never read as 0): 0 to 1 |
| `device_id` | string | required, non-empty, at most 200 bytes: this device's id (the conflict rule tells devices apart by it) |
| `updated_at` | string | required, RFC 3339: when the save was made on the device (send the real time when replaying an offline queue). A time more than five minutes in the future is replaced by server time |
| `base_version` | int | the stored `version` this device last saw (`0`: it has seen none). Absent: the save never diverges (below). Negative is a `400` |
| `device_name` | - | accepted and ignored: the name is always the saving token's |

The body is decoded strictly: any other field is a `400` (an echoed
[`other_place`](#the-conflict-rule-sync-v2) is accepted, since its fields are
these; a whole stored row is not).

Response `200`:

```json
{
  "reading_progress": { "library_id": 1, "path": "…", "cfi": "epubcfi(…)", "progression": 0.6,
                        "version": 5, "device_id": "phone-1", "device_name": "Pixel 8",
                        "updated_at": "…" },
  "other_place": { "cfi": "epubcfi(…)", "progression": 0.31, "device_id": "web-7f3c9a",
                   "device_name": "Kitchen iPad", "updated_at": "…" }
}
```

`reading_progress` is the row stored **after** the save, whichever place won;
`other_place` comes only on a diverged save and is never stored.

#### The conflict rule (Sync v2)

`catalog.ResolvePlace`, one writer transaction with the read of the stored row:

- **No row stored**: the save applies (version 1).
- **Diverged**: a row is stored, `base_version` is sent and is not its `version`,
  and another device (`device_id`) wrote it, or `base_version` is `0` whatever the
  device (a device id outlives the places a client kept: signed out and back in, its
  start must not replace its own place further on). The device saved without seeing
  that row, so the server never moves the place back silently: it keeps the **further**
  place by `progression` (the save applies when it is further, with a bumped
  version; otherwise the stored row stays, and a tie keeps the stored row) and
  answers the place it did not keep as `other_place`. The web player offers it
  ("On Pixel 8 you were at 60%. Jump there?").
- **Anything else** (the same device's own queued saves made on a version it saw,
  a save made on the stored version, a save with no `base_version`) is **last-write-wins** exactly as
  [`PUT /progress`](#put-apiv1librariesidprogress): the later `updated_at` wins,
  the version breaking a tie. A stale save is not an error: the stored row comes
  back, with no `other_place`. This is how moving back on purpose works: once the
  device has seen the newer row (and sends its version), its save applies.

A save records no listening session (reading isn't listening).

| Status | Meaning |
|---|---|
| `200` | the stored row, and `other_place` on a diverged save |
| `400` | `invalid request` (not JSON, an unknown field), or the reason: `cfi must be an EPUB CFI`, `cfi is too long`, `progression must be from 0 to 1`, `device_id is required`, `device_id is too long`, `base_version must not be negative`, `updated_at must be an RFC3339 time`; plus missing `path` / invalid library id |
| `403` | the book is outside the caller's share scope |
| `404` | no book at the path, or the book has no ebook (a client drops such a queued save: it can never succeed) |

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

#### The progress path

The three `/libraries/{id}/progress` routes (this read, `PUT` with its listening
session, and `PATCH`) keep a book's progress on **the book's path**
(`api.progressPath` over `catalog.BookPathOfFile`). The `?path=` is scope-checked as
given (out of scope is the usual `403`), then:

- the path of an indexed book, or of one of its **track files**
  (`Author/Book/02.mp3`), is keyed on that book's path, when the caller's scope
  allows the book. A file of a book nested in another book's folder belongs to the
  innermost book (`Series/Book 2/01.m4b` is `Series/Book 2`'s). The row in the
  response carries the book's `path`, so `PUT ?path=Author/Book/02.mp3` answers
  `"path": "Author/Book"`;
- anything else keeps the path as given, as before: a navigation folder, a book the
  index doesn't hold yet (a save never indexes on demand), a book above a grant that
  reaches only its part (the book outside the scope is never read or written), and a
  **disc folder** of a joined book, which keeps its own key (a download of that disc
  saves there, on the disc's own timeline).

A failure of that lookup is a `500` (`could not load progress` / `could not save
progress`), never a save under another key. Rows an older server or client already
wrote under a part path stay where they are (they are not merged into the book's
row), and bookmarks, notes, history, favourites, ratings and the queue keep the path
they are given. [`POST /cast/token`](#post-apiv1casttoken) grants the book's path
too, but by the media routes' rule rather than this one: a disc folder resolves to
its joined book, a book not indexed yet is read on demand, and a book outside the
caller's scope is a `403`.

### `PUT /api/v1/libraries/{id}/progress`

*Session.* Upserts progress with **last-write-wins** reconciliation: the newer
`updated_at` wins; `version` breaks exact-timestamp ties. The comparison and the
write are one database transaction, so an older save can never overwrite a newer
one that landed in between. A stale write is not an error - the response
returns the *effective stored* progress, so clients converge.

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

Response `200`: `{ "progress": { … } }` (the winning row), keyed on
[the progress path](#the-progress-path).

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
on a book (`?path=` required, a track file's path editing its book's row: see
[the progress path](#the-progress-path)): mark it finished or **unfinished**, move the
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
book in the caller's scope gets a new row (its start stamped now). An edit that
sets nothing (`{}`) writes nothing: it answers the current row, or `404
book_not_found` when there is none (it never starts the book). An exact
(RFC 3339) date may be at most 5 minutes ahead of the server's clock, for a
client clock running a little fast; a day-only date keeps a day of slack, since
the client's today can be the server's tomorrow. The write is
stamped with the server's time (to the sub-second, so a device save made just
before the edit can't outrank it) and a higher `version`, so under last-write-wins
it beats what a device saved before it, while a device that has the book loaded
overrides it on its next save. It is not playback, so it records no
[listening session](#admin-activity).

Response `200`: `{ "progress": { … } }` - the player's progress object, with
its dates.

| Status | Meaning |
|---|---|
| `400` | `path is required`; `invalid request` (a malformed body, an unknown key or an unparseable date); `those dates or that position don't fit this book` (no code) - a negative position or one past the book's end, an exact date more than 5 minutes ahead of server time (a day-only date more than 24 hours ahead), a finish before the start, or a finish date on a book that isn't (and isn't becoming) finished |
| `403` | `no access to this path` - outside the caller's current access, **even when a progress row already exists there** (unlike the admin edit, a listener can't tidy progress on a book they can no longer open) |
| `404` | `code: "book_not_found"` (`no progress or book at this path`) - no progress at that path and no indexed book there, or an empty edit on a book with no progress |

### `GET /api/v1/libraries/{id}/bookmarks` · `POST /api/v1/libraries/{id}/bookmarks`

*Session.* List / add bookmarks for a book (`?path=` on both). GET lists them
by position.

GET response: `{ "bookmarks": [ … ] }` (objects as below; `[]` when there are
none, never `null`).

POST body: `{ "position": 4211.5, "note": "great line", "label": "quote" }`
(`note` and `label` optional). Response `201` - the created bookmark **unwrapped**:

```json
{
  "id": 12,
  "library_id": 1,
  "path": "Brandon Sanderson/Mistborn/The Final Empire",
  "position": 4211.5,
  "note": "great line",
  "label": "quote",
  "created_at": "2026-06-30T21:04:11.000Z"
}
```

`label` (capability `annotations`) is a client-defined **machine key**, never
display text: `""` (none) or a lowercase key matching `^[a-z][a-z0-9_]{0,31}$`
(`catalog.checkBookmark`). The server checks only that shape, never a set of
known keys (the player's are in [Labels](../../frontend/annotations.md#labels)). A
server with `annotations` emits `label` on every bookmark (`""` when none); an
older one never does, and refuses a POST that carries it.

`note` is at most 2,000 characters (Unicode code points, `catalog.MaxBookmarkNote`).
`position` must be a number, `0` or more (it isn't checked against the book's
duration). `created_at` is server time in a fixed-width UTC millisecond form
(`2026-06-30T21:04:11.000Z`), the form the across-books lists order by as text.

| Status | Meaning |
|---|---|
| `400` | `path is required`; `invalid request` (a malformed body or an unknown key); `invalid position` (negative, or not a number, such as `"12"`); `invalid label` (not `""` or a machine key: `Quote`, `fell-asleep`, more than 32 characters); `note too long` (over 2,000 characters) |
| `403` | `no access to this path` |

### `DELETE /api/v1/bookmarks/{id}`

*Session.* Deletes one of the **caller's own** bookmarks by id (another user's
id is a silent no-op). Response: `204 No Content` (idempotent - no 404).

### `PATCH /api/v1/bookmarks/{id}`

*Session.* Capability `annotations`. The owner's edit of one of their bookmarks
(`catalog.EditBookmark`). Any subset of:

| Body field | Type | Notes |
|---|---|---|
| `note` | string | replaces the note; `""` clears it; at most 2,000 characters |
| `label` | string | replaces the label; `""` clears it; a machine key as on [POST](#get-apiv1librariesidbookmarks--post-apiv1librariesidbookmarks) |

A field left out (or sent as `null`) stays as it is; the position can't be
edited. The read, the checks and the write are one writer transaction, and only
the fields sent are checked, so a label-only edit works on a bookmark whose note
an older server let grow past 2,000 characters.

Response `200` - the whole updated bookmark, unwrapped, the same object as POST
answers.

| Status | Meaning |
|---|---|
| `400` | `invalid bookmark id` (not a number); `invalid request` (a malformed body or an unknown key, such as `position`); `nothing to change` (neither field given, or no body); `invalid label`; `note too long` |
| `404` | `bookmark not found` - an unknown id, another user's, or one whose book is outside the caller's **current** access (a since-revoked share): never `403`, so the answer doesn't confirm that someone else's bookmark exists. The row is kept, and is editable again if access comes back |

### `GET /api/v1/libraries/{id}/notes` · `POST /api/v1/libraries/{id}/notes`

*Session.* List / add free-form notes for a book (`?path=` on both). GET lists
them by position.

POST body: `{ "position": 0, "body": "re-read ch. 12 for the foreshadowing" }`
(`position` optional, `0` when left out; a number, `0` or more). Response `201` -
the created note unwrapped:

```json
{
  "id": 5,
  "library_id": 1,
  "path": "Brandon Sanderson/Mistborn/The Final Empire",
  "position": 0,
  "body": "re-read ch. 12 for the foreshadowing",
  "created_at": "2026-06-28T10:00:00.000Z",
  "updated_at": "2026-06-28T10:00:00.000Z"
}
```

GET response: `{ "notes": [ … ] }` (same object shape; `[]` when there are
none). `created_at` and `updated_at` are server time in the same fixed-width UTC
millisecond form as a bookmark's.

`body` is at most 10,000 characters (Unicode code points, `catalog.MaxNoteBody`):
over that is `400 body too long`, here and on
[`PATCH`](#patch-apiv1notesid). A negative position, or one that isn't a number,
is `400 invalid position`, also on both.

### `DELETE /api/v1/notes/{id}`

*Session.* Deletes one of the caller's own notes. `204 No Content`.

### `PATCH /api/v1/notes/{id}`

*Session.* Capability `annotations`. The owner's edit of one of their notes
(`catalog.EditNote`). Any subset of:

| Body field | Type | Notes |
|---|---|---|
| `body` | string | replaces the text; at most 10,000 characters |
| `position` | float | seconds on the whole-book timeline; must be `0` or more (it isn't checked against the book's duration) |

A field left out (or sent as `null`) stays as it is, and only the fields sent are
checked. Every edit stamps `updated_at` with server time; `created_at` never
changes. One writer transaction, as for bookmarks.

Response `200` - the whole updated note, unwrapped, the same object as POST
answers.

| Status | Meaning |
|---|---|
| `400` | `invalid note id` (not a number); `invalid request` (a malformed body or an unknown key); `invalid position` (negative, or not a number, such as `"12"`); `nothing to change` (neither field given, or no body); `body too long` |
| `404` | `note not found` - an unknown id, another user's, or one whose book is outside the caller's current access (never `403`, as for bookmarks) |

### `GET /api/v1/me/bookmarks`

*Session.* Capability `annotations`. The caller's bookmarks across every book
they can still open, newest first (`catalog.ListMyBookmarks`), a page at a time.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | `100` | absent or ≤ 0 is 100; over 500 is 500 (an older server: over 500 falls back to 100) |
| `cursor` | string | - | the previous page's `next_cursor`, passed back verbatim |

```json
{
  "bookmarks": [
    {
      "id": 12,
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "position": 4211.5,
      "note": "great line",
      "label": "quote",
      "created_at": "2026-06-30T21:04:11.000Z",
      "book": { "id": 412, "title": "The Final Empire", "author": "Brandon Sanderson", "…": "…" }
    }
  ],
  "next_cursor": "MjAyNi0wNi0zMFQyMTowNDoxMS4wMDBaADEy"
}
```

Rules shared with [`/me/notes`](#get-apiv1menotes) and
[`/me/history`](#get-apiv1mehistory):

- **Order** is newest first by the row's timestamp (`created_at` here and for
  notes, `ended_at` for history), then by `id`, newest first, to break ties.
- **Paging is keyset**, on that `(timestamp, id)` pair, as for
  [book lists](index.md#pagination): `next_cursor` is present only when more
  rows follow, it is opaque, and a cursor that doesn't decode is
  `400 invalid cursor`. Ties in the timestamp neither repeat nor skip a row.
- **Only what the caller can open now.** A row whose path is outside the
  caller's **current** access (a share since taken away) is kept in the
  database but left out. The filter is in the query, so a page is always full
  of rows the caller can see.
- **`book`** is the book in the [list shape](#get-apiv1librariesidbooks) (no
  `description`), present while the path is indexed; a client renders a row
  without it by its path leaf. A page's books are read in one batch.
- An empty list is `[]`, never `null`.

### `GET /api/v1/me/notes`

*Session.* Capability `annotations`. The caller's notes across books, newest
`created_at` first (`catalog.ListMyNotes`); `limit`, `cursor` and the rules as
[`/me/bookmarks`](#get-apiv1mebookmarks).

```json
{
  "notes": [
    {
      "id": 5,
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "position": 0,
      "body": "re-read ch. 12 for the foreshadowing",
      "created_at": "2026-06-28T10:00:00.000Z",
      "updated_at": "2026-06-28T10:00:00.000Z",
      "book": { "id": 412, "title": "The Final Empire", "author": "Brandon Sanderson", "…": "…" }
    }
  ]
}
```

### `GET /api/v1/me/history`

*Session.* The caller's listening spans across all books, newest `ended_at`
first (`catalog.ListAllHistory`). Spans an
[imported](#admin-listening-imports) history wrote (one per imported session)
are included, in the same shape.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | `100` | absent or ≤ 0 is 100; over 500 is 500 (an older server: over 500 falls back to 100) |
| `cursor` | string | - | `annotations` servers: the previous page's `next_cursor` |

```json
{
  "history": [
    {
      "id": 88,
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Final Empire",
      "from_pos": 11250.0,
      "to_pos": 12043.6,
      "started_at": "2026-07-01T19:20:00.000Z",
      "ended_at": "2026-07-01T19:42:07.000Z",
      "book": { "id": 412, "title": "The Final Empire", "…": "…" }
    }
  ],
  "next_cursor": "MjAyNi0wNy0wMVQxOTo0MjowNy4wMDBaADg4"
}
```

Every server has this route, without the capability. Without `cursor` it answers
the first page. A server with `annotations` adds each row's `book` and
`next_cursor`, and pages on `cursor` by the [`/me/bookmarks`](#get-apiv1mebookmarks)
rules; one without ignores `cursor`, sends neither, and always returns its one page.

### `GET /api/v1/libraries/{id}/history`

*Session.* History for one book (`?path=` required; `limit` as above), newest
`ended_at` first, ties by `id` newest first. Response: `{ "history": [ … ] }`
(`[]` when there is none).

### `POST /api/v1/libraries/{id}/history`

*Session.* Records a listening span (`?path=` required).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `from_pos` | float | no | span start position (seconds); not validated - defaults to `0` if omitted |
| `to_pos` | float | no | span end position; not validated - defaults to `0` if omitted |
| `started_at` | string | no | RFC 3339 (any offset, any fraction) |
| `ended_at` | string | no | RFC 3339 |

Both times are stored, and returned, in the fixed-width UTC millisecond form
(`2026-07-01T19:42:07.000Z`), so the lists can order them as text. A span is
never refused for its times: when only one of them parses, both take it (a
zero-length span); when neither does (or both are left out), both are the
server's time now.

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
and the book fields are empty (render it by its path leaf). A book at a range
position also carries `series_index_end`, as on a [book](#get-apiv1librariesidbooks).

### `POST /api/v1/libraries/{id}/favourites` · `DELETE /api/v1/libraries/{id}/favourites`

*Session.* Heart / un-heart a path (`?path=` required on both; one favourite
per user+library+path). Both are idempotent. POST → `201 Created` (empty body);
DELETE → `204 No Content`.

From 2.5.0 (server#211) a `POST` on a book no scan has reached yet (a pending
folder) also indexes it on demand (`indexFavourite`), so it shows on
[`/me/favourites`](#get-apiv1mefavourites), which reads the index, without being
opened first. It is best-effort: the read runs detached from the request, which
waits for it up to 5 s (`favouriteIndexWait`); the favourite is saved either way,
and a path that is no book (an author's folder) stays a bare favourite. Podcast
libraries are never indexed this way.

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
  Ownership (for a collection) and the body are checked first, so a stranger, a
  viewer or a bad request never triggers indexing. A `library_id` of 0 or less
  is `400 invalid library id`; a library or path outside the caller's access is
  `403 no access to this path` (an admin naming a library that doesn't exist
  gets `404`); a path that isn't a book is `404` (`book not found` on a list
  add, `no book at this path` on a rating).
- **Replacing a whole list doesn't.** A `PUT` of a whole list must name its
  list: `items` (or `user_ids` for shares). A missing or `null` key is `400`
  (`items is required`, `user_ids is required`), because a whole replace deletes
  every row not listed; only an explicit `[]` clears the list. It indexes nothing:
  each entry must be a book already indexed at exactly that path and inside the
  caller's current access. Any other entry is **skipped**, not an error, and the
  response is the stored result, so a client reconciles with what it gets back.
  Duplicates collapse (the first wins). It is a whole replace: every stored row
  not in the list is deleted, **including** rows the caller can't currently see,
  with one exception. **A caller the [podcast client gate](../auth-and-security.md#podcast-visibility)
  hides podcasts from** (a 2.1.x or older player) keeps the stored podcast
  episodes it could see if it passed the gate: each stays just after the listed
  entry it followed, or all go after the new list, in their stored order, when
  the new order would shuffle them. They count toward the list's cap (the
  oldest of them go when the list and they together exceed it). Episodes hidden
  for another reason (a revoked share, an unfollowed private show) are deleted as
  before, and a replace from a podcast-seeing client deletes every unlisted row.
  So an old device reordering Up next can't drop a newer player's episodes.
  A whole-list body may be up to 4 MiB (other bodies keep the default limit).
- **Removing one entry is never scoped.** `DELETE …?library_id=&path=` removes
  only the caller's own row, so it needs no access check and a revoked path can
  still be cleaned up. It matches the path exactly (a part path is not resolved
  to its book, so pass the entry's stored `path`), as does a rating `DELETE`. It
  is idempotent (`204` whether or not the entry existed);
  `400` `invalid library id` or `path is required` when either is missing.
- **Another user's id is a `404`.** Every route addressed by an id answers `404`
  for an id that isn't the caller's, never `403`, so the answer doesn't confirm
  that another user's collection exists.
- **Positions are the list as the caller sees it.** A single add's `position` is
  a 0-based index in the visible, scope-filtered order the `GET` returns: the
  book lands just before the visible entry now at that index, and hidden rows in
  front of that entry stay in front. Absent, or at least the number of other
  visible entries, puts it just after the last visible entry. Negative is
  `400 invalid position`. Hidden rows never move. For a book already listed,
  `position` is where it ends up (visible `[A, B]` plus `{A, "position": 1}` gives
  `[B, A]`); without `position` it stays put.
- **Caps count visible entries.** A new book on a list whose visible entries
  already number its cap (500 for up next, 1,000 for a collection) is `409`
  (`queue_full`, `collection_full`). When only hidden rows push the stored total
  over the cap, the oldest hidden rows (by `added_at`) are deleted to make room,
  for good: if access comes back, only the survivors reappear. A move never
  evicts. A whole-list `PUT` is different: it replaces everything, hidden rows
  included, and more entries than the cap in its body (before duplicates
  collapse) is `400 too many items`.
- **Timestamps** on these rows (`added_at`, `created_at`, `updated_at`), and the
  goal's `updated_at`, are fixed-width UTC with milliseconds, such as
  `2026-10-01T09:01:00.000Z`.
- **No demo or rate-limit special cases**, except the two sharing routes below,
  which refuse demo accounts.

### `GET /api/v1/me/queue`

*Session.* Capability `queue`. The caller's up next, in order.

```json
{
  "queue": [
    {
      "library_id": 1,
      "path": "Brandon Sanderson/Mistborn/The Well of Ascension",
      "added_at": "2026-10-04T19:45:02.000Z",
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
caller can't currently see, except the podcast episodes a gated (pre-2.2.0)
player keeps (see the [replace rules](#up-next-collections-and-ratings)).
Response `200`: the queue, as `GET`.

| Status | Meaning |
|---|---|
| `400` | `invalid request` (a malformed body); `items is required` (missing or `null`); `too many items` - more than 500 entries in the body, counted **before** duplicates collapse |

### `POST /api/v1/me/queue`

*Session.* Adds one book.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `library_id` | int | yes | |
| `path` | string | yes | any path in the book; the book's own path is stored |
| `position` | int | no | 0-based, in the queue **as the caller sees it**; absent or past the end = after the last visible entry |

A book already queued **moves** to `position` when one is given, and otherwise
stays where it is (so adding twice is harmless). See
[positions and caps](#up-next-collections-and-ratings) for hidden rows. Response
`200`: the whole queue, as `GET`.

| Status | Meaning |
|---|---|
| `400` | `invalid request` (a malformed body or a missing path); `invalid library id`; `invalid position` (negative) |
| `403` | `no access to this path` |
| `404` | `book not found` - no book at that path |
| `409` | `code: "queue_full"` (`the queue holds at most 500 books`) - the caller already sees 500 books in it |

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
      "created_at": "2026-09-30T18:02:11.000Z",
      "updated_at": "2026-10-04T20:15:40.000Z"
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
- `shared_with` is read only for the owner: a viewer's response never reads the
  share list at all.

Collections are **shared read-only**: only the owner renames, describes, edits
the items or the shares; a viewer can read the collection and leave it. A viewer
sees only the items their **own** current access allows, never the owner's.

### `POST /api/v1/me/collections`

*Session.* Creates a collection owned by the caller.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | trimmed; 1 to 100 characters (Unicode characters, not bytes); invalid UTF-8 or any control character is refused |
| `description` | string | no | trimmed; up to 1,000 characters; invalid UTF-8 or a control character other than a line break (`\n`, `\r`) or tab is refused |

Response `201`: `{ "collection": { … } }`.

| Status | Meaning |
|---|---|
| `400` | `invalid request` (a malformed body); `the name must be 1 to 100 characters, with no control characters`; `the description must be at most 1000 characters, with no control characters but line breaks and tabs` |
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
      "added_at": "2026-09-30T18:03:00.000Z",
      "book": { "id": 412, "title": "The Final Empire", "…": "…" }
    }
  ]
}
```

`404` `collection not found` when the caller neither owns it nor has it shared
with them; `400 invalid collection id` for an id that isn't a number.

### `PATCH /api/v1/me/collections/{id}`

*Session.* Renames or re-describes a collection (owner only): any subset of
`name` and `description`, with the rules of `POST` (a body with neither changes
nothing). Who may change it is settled before the fields are checked: a stranger
gets `404` and a viewer `403 not_owner` whatever the name or description. Response
`200`: `{ "collection": { … } }`.

| Status | Meaning |
|---|---|
| `400` | a malformed body, or a name or description outside the rules of `POST` |
| `403` | `code: "not_owner"` (`only the collection's owner can change it`) - the collection is shared with the caller, who can't change it |
| `404` | not the caller's collection and not shared with them |

### `DELETE /api/v1/me/collections/{id}`

*Session.* For the owner, deletes the collection with its items and shares. For
a viewer, **leaves** it: only their own share is removed, and the owner's
collection is untouched. `204 No Content`; `404` for anyone else.

### `PUT /api/v1/me/collections/{id}/items`

*Session.* Replaces the collection's items with this order (owner only), body
`{ "items": [ { "library_id": 1, "path": "…" } ] }`, by the
[replace rules](#up-next-collections-and-ratings) of up next (a whole replace:
rows the owner can't currently see are deleted too, except the podcast episodes
a gated, pre-2.2.0 player keeps). Response `200`: the
collection and its items, as `GET /me/collections/{id}`. Ownership is checked
before the size and the entries, so a stranger gets `404` (and a viewer `403`)
rather than `too many items`; only a malformed body or a missing `items` is
refused before it.

| Status | Meaning |
|---|---|
| `400` | `invalid request` (a malformed body); `items is required`; `too many items` - more than 1,000 |
| `403` | `code: "not_owner"` |
| `404` | not the caller's collection and not shared with them |

### `POST /api/v1/me/collections/{id}/items`

*Session.* Adds one book (owner only), with the body and semantics of
[`POST /me/queue`](#post-apiv1mequeue): `library_id`, `path` and an optional
`position`; a book already in it moves to `position` when one is given.
Response `200`: the collection and its items, as `GET /me/collections/{id}`.
Ownership is checked first, before the body: a stranger gets `404` and a viewer
`403 not_owner` before any `400`, and neither triggers indexing. `position` is in
the collection as the owner sees it, with the queue's
[position and cap rules](#up-next-collections-and-ratings).

| Status | Meaning |
|---|---|
| `400` | `invalid request` (a malformed body or a missing path); `invalid library id`; `invalid position` |
| `403` | `code: "not_owner"`; or `no access to this path` |
| `404` | `collection not found` - not the caller's collection and not shared with them; or `book not found` |
| `409` | `code: "collection_full"` (`a collection holds at most 1000 books`) - the owner already sees 1,000 books in it |

### `DELETE /api/v1/me/collections/{id}/items`

*Session.* Removes one book (`?library_id=&path=`, owner only). `204 No
Content`, idempotent, with no access check on the path. `403`
`code: "not_owner"` for a viewer, `404` for anyone else.

### `PUT /api/v1/me/collections/{id}/shares`

*Session.* Replaces who the collection is shared with (owner only), body
`{ "user_ids": [6, 9] }` (`[]` stops sharing it; a missing or `null` key is
`400 user_ids is required`). Each id must be an existing, enabled, non-demo
account other than the owner, or someone it is already shared with (a viewer
disabled since stays valid, so the `shared_with` the owner was shown can be sent
back); a new disabled, demo or unknown id rejects the whole request. A kid (a
[household member](#household-members) with `member_kind: "kid"`) is a valid id only
for their own owner: from anyone else it is `unknown user`, whatever the collection
held before, so the answer never says who is a kid. A kid caller can't share at all. After the
demo check and the body, ownership is settled before the ids are checked. Response `200`: `{ "collection": { … } }`, its `shared_with`
updated (`updated_at` doesn't move).

| Status | Meaning |
|---|---|
| `400` | `invalid request` (a malformed body); `user_ids is required`; `unknown user`; `a collection can be shared with at most 50 users` (distinct ids) |
| `403` | `code: "demo_account"` - the caller is a demo account (checked first, so even for a collection that isn't theirs); `code: "kid_account"` - the caller is a kid; or `code: "not_owner"` |
| `404` | not the caller's collection and not shared with them |

A viewer sees the owner's username and the items **they** can open; nothing of
the owner's access is shared with them, except with the owner's own
[household member](#household-members) on `access: "collections"`, whose access is
the books of the collections their owner shares with them.

### `GET /api/v1/me/share-targets`

*Session.* Capability `collections`. Who the caller can share a collection
with: every enabled, non-demo account other than the caller, by username. A kid
household member is listed only to their own owner.

```json
{ "users": [ { "id": 6, "username": "alex" }, { "id": 9, "username": "robin" } ] }
```

This is the one place a non-admin can list every other account's username (a
shared collection also shows its owner, and
[`GET /household/listening`](#get-apiv1householdlistening) the other people who
share). A demo
account gets `403` `code: "demo_account"`, so a public demo can't
list the server's usernames.

### `GET /api/v1/libraries/{id}/rating`

*Session.* Capability `ratings`. The caller's rating of a book (`?path=`, the
exact path as given, scope-checked like progress but never moved to a book's path
as [progress is](#the-progress-path): use the book's own `rel_path`).

```json
{
  "rating": {
    "library_id": 1,
    "path": "Brandon Sanderson/Mistborn/The Final Empire",
    "rating": 5,
    "note": "The heist that becomes a revolution.",
    "created_at": "2026-10-02T21:14:00.000Z",
    "updated_at": "2026-10-03T08:01:37.000Z"
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
| `rating` | int | yes | a JSON integer from `1` to `5` (`4.5` and `"4"` are refused) |
| `note` | string | no | a short private note; trimmed; up to 500 characters after trimming |

The `PUT` **replaces the whole rating**: leaving `note` out clears a note saved
before. One rating per book per user; rating again moves `updated_at`. The body
is checked before the book is resolved, so a bad body never triggers indexing.
Response `200`: `{ "rating": { … } }`, `note` `""` when there is none.

| Status | Meaning |
|---|---|
| `400` | missing path; `invalid request` (a malformed body); `rating must be a whole number from 1 to 5` (also when absent or `null`); `the note is longer than 500 characters` |
| `403` | `no access to this path` |
| `404` | `no book at this path` |

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
      "created_at": "2026-10-02T21:14:00.000Z",
      "updated_at": "2026-10-03T08:01:37.000Z",
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

- `totals` - the caller's `listened` (wall-clock seconds), `sessions`, books
  `finished` in the period (by the caller's own finish dates, **all** of them,
  including books they can no longer open: a count, no paths, so
  `totals.finished` can exceed `finished_books`' length) and `books` listened to
  **or** finished in it (a book marked finished with no listening recorded
  still counts, so `finished` is never more than `books`); `previous`
  the same for the period of equal length just before;
  `estimated` how many of `totals.listened`'s seconds are estimates.
- `days` - every day of the period, oldest first, zero days included;
  `hour_weekday` - 7 rows (0 = Monday) of 24 hours, raw sessions only.
- `top_books`, `top_authors`, `top_narrators`, `top_series` - up to 10 each, by
  listened time. `top_series` is only here; the admin `activity` has none. `finished_books` - the books the caller finished in the period,
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
time and counts, and include everything.

`400` `code: "invalid_range"` (`range must be 7d, 30d, 90d, 1y or a year`).

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
  "goal": { "books_per_year": 24, "updated_at": "2026-01-02T09:00:00.000Z" },
  "year": "2026",
  "finished": 17
}
```

`goal` is `null` when none is set. `year` is the server's current calendar year
and `finished` the books the caller has finished in it (server time, counted
like `totals.finished`: every finish, including books they can no longer
open), there whether or not a goal is set.

`PUT` sets the goal, body `{ "books_per_year": 24 }`, and answers `200` as
`GET`: `400` `books_per_year must be a whole number from 1 to 1000`, or
`invalid request` for a malformed body or an unknown field. `DELETE` clears it:
`204 No Content`, idempotent.

## Upcoming releases

*Session.* Capability `upcoming` (2.6.0). What is coming and what is missing in the
series the caller holds: preorders, recent releases and missing volumes, worked out
from the community metadata by a background job (`internal/upcoming.Runner`), so a
request reads only what the job stored and never asks the metadata service itself.
No Bridge is needed.

The player (2.6.0) shows it as Home's Coming up in your series, an Upcoming page and the
You hub's Upcoming section, merged across the listener's servers one row per work
([Upcoming releases](../../frontend/state-and-data.md#upcoming-releases)), and dates the
series page's ghost volumes from `release_date` on [`/meta`](#get-apiv1librariesidmeta).

**The job.** It runs about an hour after the server starts, then once a day (give
or take an hour), and a light pass once a burst of new or edited books settles (it
looks up the new books' works and reads only community series it has never read). A
run:

1. gives each owned book with an ASIN or ISBN its community work id (the metadata
   cache's answer, else a lookup under the service's own budget), and looks again
   after 30 days (at most 500 of those month-old re-checks a run; a new or
   changed book is always looked up);
2. gives each local series (library and folded series name) the community series it
   is (one or more), from its books' works' series named like it (the `/meta` rails' naming rule,
   then give or take a leading article or a trailing "Series"), looked up again
   after 30 days or when the series gains books;
3. asks the metadata service's watch feed, 50 series a request, which series have
   news;
4. reads `series/{id}` for a series it has never read, one with news, or one read
   over a week ago; a `404` marks the series gone, dropped a week later;
5. classifies each local series against the community series (below) and replaces
   its items.

A failed read keeps what earlier runs stored (a series is replaced only by a read
that worked), and a failed run is tried again an hour later, up to three times.
With metadata off or the switch off, the job makes no call at all, and switching it
off stops a run in flight. In [mirror mode](../configuration.md#mirror-mode-metadatamode-mirror)
the local copy answers every read. The job's status (last run, last success, last
error, next run, series and item counts) is the read-only `metadata.upcoming_status`
on [`GET /admin/settings`](#get-apiv1adminsettings).

**What counts.** For each local series, a member of the community series the series
doesn't hold is:

- `preorder` when its first release is still ahead (at the precision the date
  states: `2026-11` is ahead for all of October);
- `released` when it came out within the window (`upcoming.window_days`, 90 days by
  default);
- `missing` when it is below the highest volume the series holds (an interior gap),
  or the single next volume after that highest one when it is out and is no preorder
  or recent release already.

A book whose community work is known holds that work's entry (a range: every entry
inside it), whatever its own series number says; a book whose work isn't known holds
the entry at its own series number. A box set counts as held when every volume
inside it is. Only whole-number positions (and ranges starting on one) can be
`missing`: a novella at 2.5 is never a gap, though it is a preorder or a release
like any other member.

### `GET /api/v1/me/upcoming`

*Session.* Requires the `upcoming` capability; a kid's account gets `403`
`code: "kid_account"`. A demo account reads it like anyone else.

```json
{
  "status": "ok",
  "generated_at": "2026-10-30T04:12:00.000Z",
  "window_days": 90,
  "items": [
    {
      "kind": "preorder",
      "release_date": "2026-11-12",
      "first_seen_at": "2026-10-29T04:10:41.000Z",
      "work": {
        "id": "the-expanse-10",
        "title": "Book Ten",
        "authors": [{ "id": "james-s-a-corey", "name": "James S. A. Corey" }],
        "cover_url": "https://…",
        "web_url": "https://meta.audiosilo.app/work?id=the-expanse-10"
      },
      "series": { "id": "the-expanse", "name": "The Expanse", "position": "10" },
      "local": { "library_id": 3, "series": "The Expanse" }
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `status` | `ok` (a run succeeded within the last 48 hours), `pending` (no run has succeeded yet: `items` is empty or what a light pass found) or `stale` (none has for 48 hours: the items are the last ones stored) |
| `generated_at` | the last successful run; absent while `pending` |
| `window_days` | the recent-release window the server counts by |
| `items[].kind` | `preorder`, `released` or `missing`, as above. A preorder whose day has come since the last run already reads `released` |
| `items[].release_date` | the work's first release (the earliest across its recordings and marketplaces), at the precision the community states it: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; absent when unknown |
| `items[].first_seen_at` | when the job first listed the item (a client's "new" badge) |
| `items[].work` | the community work: `id`, `title`, `authors` (`{id, name}`), `cover_url` (absent when none) and `web_url` (its page on the metadata site) |
| `items[].series` | the community series and the work's `position` in it (a string: `"10"`, `"2.5"`, `"1-3"`) |
| `items[].local` | the caller's series view the item belongs to: `library_id` and the series' local spelling (`series`), to open it by name. No other DB id is sent |

**Who sees what.** A series is the caller's only through a book of it they can see
(their libraries and shares, `catalog.UserScopes`; the book's main series or one of
its other series). An item is dropped when the caller can see a copy of that work
anywhere, and each work is listed once (the first library in sort order). Podcast
libraries never count. Items come in order: preorders soonest first, then releases
newest first, then missing volumes by series and position.

Errors: a kid's `403` `kid_account` comes first (the route's own check), then `404`
`code: "metadata_off"` while community metadata is off, `404` `code: "upcoming_off"` while the job is switched off
(`upcoming.enabled`, the console's Settings > Metadata). Either way the capability
is `false`, so a client that honours it never asks.

### The calendar feed

Capability `upcoming_calendar` (Track U3, 2.6.0; `true` exactly when `upcoming`
is). A listener subscribes a calendar app to their own upcoming releases through
one secret link per user per server: `GET /me/upcoming/releases.ics?token=<secret>`.
The secret is a token of its own kind, `feed`, accepted on that route **only**
(see [Calendar feed tokens](../auth-and-security.md#calendar-feed-tokens)), so a
leaked link reads that one person's release list and nothing else. The player's
card: [The upcoming calendar](../../frontend/state-and-data.md#the-upcoming-calendar).

#### `GET /api/v1/me/upcoming/calendar`

*Session* (an API key may read it). Whether the caller has a calendar link, never
the link itself (the server keeps only its hash):

```json
{ "active": true, "created_at": "2026-10-30T09:14:02.517Z" }
```

`created_at` (RFC 3339, UTC, milliseconds) is absent while `active` is `false`.
It is the mint's own `created_at` exactly, and later than the link it replaced,
so a client that kept a copy of a link compares the two to tell whether its copy
is still the live one (a link reset or turned off on another device is not).

Errors, in order: `401`; `403` `kid_account`; `404` `metadata_off`; `404`
`upcoming_off`.

#### `POST /api/v1/me/upcoming/calendar`

*Session only.* Makes the caller's calendar link, ending the one they had in the
same transaction (a reset). No body. `201`, with `Cache-Control: no-store`:

```json
{
  "path": "/api/v1/me/upcoming/releases.ics?token=<secret>",
  "created_at": "2026-10-30T09:14:02.517Z"
}
```

`path` is server-relative, not a URL: the server knows no reliable public
address, so the client puts it on the address a calendar app should fetch it
from (the player uses the server's away address when it has one, else the address
it reaches the server at). This is the only time the secret is answered: a client
that wants to show the link again keeps it as it keeps a session token.

Errors, in order: `401`; `403` `kid_account`; `403` `demo_account` (a demo
account can't make a credential); `403` for an API key (a key never mints a
credential, [Personal API keys](#personal-api-keys)); `404` `metadata_off`; `404`
`upcoming_off`.

#### `DELETE /api/v1/me/upcoming/calendar`

*Session only.* Ends the caller's calendar link: `204` whether there was one or
not. Not gated on the two switches (ending a link only takes access away), so it
works while upcoming releases are off. Errors: `401`; `403` `kid_account`; `403`
for an API key.

#### `GET /api/v1/me/upcoming/releases.ics`

*Feed token only*, as `?token=` (a calendar app can't set a header) or the
`Authorization` header. A session, API key, cast, bridge or pairing token is
`401` here, and a feed token is `401` on every other route. It runs under the
media rate limit, per credential.

The token owner's [`GET /me/upcoming`](#get-apiv1meupcoming) list, read with their
scopes at this request (a share taken away is felt at once), as an iCalendar
document (RFC 5545):

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AudioSilo//Upcoming releases//EN
CALSCALE:GREGORIAN
X-WR-CALNAME:AudioSilo: upcoming releases (Den\, upstairs)
REFRESH-INTERVAL;VALUE=DURATION:PT12H
X-PUBLISHED-TTL:PT12H
BEGIN:VEVENT
UID:the-expanse-10@kx8Qz1c7m2Vw0aB3dEfGh
DTSTAMP:20261030T041200Z
DTSTART;VALUE=DATE:20261112
DTEND;VALUE=DATE:20261113
SUMMARY:Book Ten (The Expanse #10)
DESCRIPTION:By James S. A. Corey\nFirst release: 2026-11-12\nhttps://meta.a
 udiosilo.app/work?id=the-expanse-10
URL:https://meta.audiosilo.app/work?id=the-expanse-10
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR
```

- **Events.** One all-day `VEVENT` per `preorder` or `released` item whose
  `release_date` is a whole day (`YYYY-MM-DD`). A `missing` item (its date is a
  back-catalogue first release, often years past) and a `YYYY` or `YYYY-MM` date
  (no honest all-day event) are left out. `DTSTART;VALUE=DATE` is the day and
  `DTEND` the next. `UID` is `<work id>@<server_id>` (`audiosilo` when the server
  has none), so a date that slips moves the event rather than adding one. `DTSTAMP`
  is the list's `generated_at` (else now), in UTC. `SUMMARY` is "Title (Series
  #position)", the same label as the `book_released` notification; `DESCRIPTION`
  is "By *authors*", "First release: *date*" and the work's `web_url`, which is
  also the `URL`. `TRANSP:TRANSPARENT`: an event never shows the listener as busy.
- **The calendar.** `X-WR-CALNAME` is "AudioSilo: upcoming releases", with the
  server's name in brackets when it has one; `REFRESH-INTERVAL` and
  `X-PUBLISHED-TTL` ask for a poll every 12 hours. There is no `METHOD` (a
  subscription needs none; with one, RFC 5545 asks the `Content-Type` for a
  matching `method` parameter and iTIP's `PUBLISH` an `ORGANIZER`). A server whose
  job never ran (`pending`), or a list with no such item, answers a calendar with
  no component, which calendar apps read as empty.
- **Text.** CRLF line ends; lines folded at 75 octets, never inside a UTF-8
  sequence; TEXT values escaped (`\\`, `\;`, `\,`, `\n`; a CR, an LF or a CRLF is
  one line break; a tab is kept; other control characters and invalid UTF-8 are
  dropped); a URI
  with a space or a control character is left out.
- **Headers.** `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition:
  inline; filename="releases.ics"`, `Cache-Control: private, max-age=3600` and an
  `ETag` (`"ics-"` and the first 16 hex digits of the body's SHA-256): a poll that
  sends it back in `If-None-Match` gets a `304`. Never gzipped.

Errors, in order: `401` (no token, an unknown or ended one, or another kind);
`403` `kid_account` (a leftover token of a person who is now a kid); `404`
`metadata_off`; `404` `upcoming_off`. A disabled account's token is refused
(`401`) while it is disabled.

#### `GET /api/v1/me/upcoming/cover`

*Session (media)*: a session token or API key, as the header or `?token=` (never a
cast or feed token). Capability `upcoming_covers` (`true` exactly when `upcoming`
is). A JPEG thumbnail of the cover the caller's own `/me/upcoming` list hands out
for a work **right now**, so a client shows community covers from its own server
(the web player's CSP refuses another host, and the device never contacts the
cover's host).

| Param | Meaning |
|---|---|
| `work` | required: the item's `work.id` |
| `size` | optional: one of the [cover sizes](#get-apiv1librariesidcover) (96, 160, 320 or 640), 320 when unset |

It is not an image proxy: the server reads the caller's list for that one work
(the list's own rules: the caller's scopes, a work they hold a copy of dropped)
and serves only the `cover_url` it holds, from the database alone (no metadata
traffic). Then it is [`/meta/cover`](#get-apiv1librariesidmetacover)'s tail: the
same guarded fetch (16 MiB cap, one fetch at a time per image), thumbnail cache,
`ETag` and `Cache-Control`.

Errors, in order: `401`; `403` `kid_account`; `404` `metadata_off`; `404`
`upcoming_off`; `400` without `work` or with a `size` outside the list; `404`
`not_found` for a work not in the caller's list (another person's series, one the
caller holds, none at all) or listed without a cover, before any fetch; `502`
`cover_unavailable` when the image couldn't be fetched (also for a minute after a
failed fetch, as on `/meta/cover`); `404` (no code) when the fetched file is no usable
image.

## Listening in the house

*Session.* Capability `household`. People on one server who choose to share see
what the others who share are listening to (the player's Home row and the book
page's "In the house" card). The rules live in `catalog.HouseListening`
(`internal/catalog/household.go`): opt-in and reciprocal (a caller who doesn't
share gets an empty `listening` list), with every privacy rule in
[what other people see](../auth-and-security.md#listening-in-the-house-what-other-people-see).

Polling only: there is no realtime channel (the player asks every minute while it
is in the foreground). No admin route reads or changes anyone's choice.

### `GET /api/v1/me/household` · `PUT /api/v1/me/household`

*Session.* The caller's own choice.

```json
{ "share_listening": false }
```

`PUT` takes the same shape, `{ "share_listening": true }`, and answers `200` as
`GET`. The others see only listening done since sharing was last turned on
([`GET /household/listening`](#get-apiv1householdlistening)); saving the same
choice again does not reset that. The field is required and the body is decoded
strictly: a missing field (`{}`), an unknown field or a wrong type is `400`
`invalid request`. A demo account's `PUT` is `403` (`code: "demo_account"`; its `GET` works and reads
`false`), so a public demo never shows up in anyone's house. A personal API key may
set it: it is the person's own credential and mints nothing. A kid's account
(a [household member](#household-members)) gets `403` `code: "kid_account"` on `PUT`,
and its `GET` always reads `false`, even if it shared before it was made a kid.

### `GET /api/v1/household/listening`

*Session.* What the other people who share are listening to, newest first. Only
listening done since a person last turned sharing on is shown.

```json
{
  "sharing": true,
  "listening": [
    {
      "user_id": 3,
      "username": "sam",
      "library_id": 1,
      "path": "Will Wight/Cradle/Unsouled",
      "title": "Unsouled",
      "author": "Will Wight",
      "state": "playing",
      "position": 5123.4,
      "duration": 36120.5,
      "chapter": "Chapter 4",
      "chapter_index": 3,
      "updated_at": "2026-10-09T19:59:30.000Z"
    }
  ]
}
```

- `sharing` - whether the caller shares. While it is `false`, `listening` is `[]`.
  A kid household member never shares and never sees anyone (`{ "sharing": false,
  "listening": [] }`), and never appears as a row.
- `state` - from the age of the person's newest save: `playing` within 60 seconds,
  `paused` within 10 minutes (the session gap), else `recent`.
- `title` - the index's title, else the path's last segment (a book no longer
  indexed); `author` and `duration` are `null` when unknown (`duration` falls back
  to the session's own).
- `position` - seconds into the whole book; `chapter` and `chapter_index` (0-based)
  are the chapter at that position, as the admin's live sessions show it: both
  `null` for a book with one chapter or none, and `chapter` alone `null` for a
  chapter whose title names nothing (`Track 01`), where `chapter_index` still says
  which.
- `updated_at` - the newest save, fixed-width millisecond UTC.

## Household members

*Session.* Capability `household_members`. Any non-demo person who isn't a member
themselves (the **owner**) adds the people they live with from the player, with no
admin and no invite, while the server's and the admin's switches allow it (below). A
**member** is a real account (`role: "user"`, made with no password; a grown-up may
set one later, a kid never holds one) whose `users.managed_by` is the owner, with a
`member_kind` (`kid` or `grownup`) and a `member_access` (`all` or `collections`) that
the owner sets (the admin can too, with
[Assign to someone](#patch-apiv1adminusersid)). What a member may listen to (the owner's
current access for `all`, the collections the owner shares with them for
`collections`, plus their own grants), and the one-level rule, are the member rule in
[Auth & security](../auth-and-security.md#household-members).

**Guards, in the order they answer.** Anonymous is `401` (`requireAuth`). On the
`{id}` routes the ids are read first: one that isn't a number is `400` (`invalid
member id`, or `invalid device id` for `{device_id}`). Then `memberOwner`: an API key
is `403` (`denyAPIKey`; the list too), a demo account `403` `code: "demo_account"`, a
member caller `403` `code: "member_cannot_manage"`. Create, session and pair then
spend the account [rate limit](../auth-and-security.md#rate-limiting) (`429`). The body comes next
(decoded strictly: an unknown field, such as `role`, is `400 invalid request`), and
last the route's own transaction. Someone else's member (or no such account) is `404`
`member not found` on every `{id}` route, so the answer never says whether the id
exists. Only **adding** checks the server's switch, the owner's switch and the cap:
every other route keeps working on the caller's existing members when the feature is
off, so an owner can always rename, sign out and delete them.

**The member object** (`HouseholdMember`), as the list, the create and the `PATCH`
answer it:

```json
{
  "id": 12,
  "name": "Evie",
  "username": "evie",
  "kind": "kid",
  "access": "collections",
  "created_at": "2026-10-13T10:00:00.000Z",
  "devices": 1,
  "collections": [ { "id": 4, "name": "Evie's books", "items": 2 } ],
  "last_listened_at": "2026-10-13T18:00:00.000Z"
}
```

- `name` - the name the owner typed (`users.display_name`), else the username.
  `username` is derived from it at create (below) and never changes with a rename.
- `collections` - present (maybe `[]`) for `access: "collections"`, absent for `all`:
  the owner's collections shared with the member, `items` counting the books the
  **owner** can reach now.
- `devices` - how many live sessions and API keys the member has.
- `last_listened_at` - the member's newest listening, `null` when never.
- `created_at` - fixed-width millisecond UTC. The list is ordered by it, then `id`.

### `GET /api/v1/me/household/members`

The caller's members and whether they may add one:

```json
{ "allowed": true, "max": 6, "members": [ { "id": 12, "name": "Evie", "…": "…" } ] }
```

It never refuses a signed-in session: a demo account and a member get `200` too.
When the caller may not add, `allowed` is `false` with a `reason`, checked in this
order (`auth.MayAddMembers`, the one ladder the create runs as well):

| `reason` | Why |
|---|---|
| `demo` | a demo account (`members` is `[]`) |
| `member` | the caller is a household member (`members` is `[]`) |
| `feature_off` | the server's `household.members_enabled` is off |
| `not_allowed` | the admin turned off the caller's `can_add_members` |

Anyone else's `members` are listed whatever `allowed` says. `max` is
`household.max_members`. Being at the cap is **not** a reason: the client compares
`members.length` with `max`. An API key gets `403`.

### `POST /api/v1/me/household/members`

Adds a member.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | trimmed; 1-40 characters, no control characters |
| `kind` | string | yes | `"kid"` or `"grownup"` |
| `access` | string | yes | `"all"` or `"collections"` |
| `sign_in_here` | bool | no | also sign the member in on the caller's device |
| `collection_ids` | int[] | no | the caller's own collections to share with the member (below) |

In one transaction (`auth.CreateMember`) it checks the caller may add (demo, member,
the server's switch, the caller's switch, then the cap, in that order), then the name,
`kind` and `access`, derives the username, inserts the account (`role` user, an empty
password hash, the three member columns and the typed name), shares the collections
and, with `sign_in_here`, issues a session. Anything refused changes nothing.

- **The username** is the name lowercased and folded to ASCII letters and digits
  (`Évie Marie` -> `evie-marie`, any run of anything else one `-`, at most 24 bytes,
  `member` when nothing is left); if that is taken, that with the owner's username
  folded the same way (`evie-sam`; skipped when nothing is left of it), then the first
  part numbered (`evie-2`, `evie-3` and on) with no cap: the first one no account has,
  ignoring case, read once inside the transaction, so there is always a free one and
  the create never answers `username_taken`.
- **`sign_in_here`** issues a session for the member named as the caller's own
  device, recording the caller's token as its `created_on_token_id` (so the caller's
  [device list](#get-apiv1medevices) names the member under `member_sign_ins`, and
  [`?also_members=1`](#delete-apiv1medevicesid) can sign it out).
- **`collection_ids`** is the full set of the caller's collections to share with the
  member (any `access`; the player sends it for `collections`), applied inside the same
  transaction (`catalog.SetMemberCollections` through `auth.ShareFunc`). An id that
  isn't one of the caller's own collections is `400 invalid_collections` and nothing is
  applied. The [50-person share cap](#put-apiv1mecollectionsidshares) applies. `[]` is
  allowed: a kid can start with nothing.

Response `201`:

```json
{ "member": { "id": 12, "name": "Evie", "…": "…" },
  "session": { "token": "…", "user": { "id": 12, "username": "evie", "managed_by": { "id": 4, "username": "sam" }, "member_kind": "kid", "display_name": "Evie", "…": "…" }, "server_id": "…" } }
```

`session` (only with `sign_in_here`) is the usual session envelope, the same shape as
[`/auth/exchange`](#post-apiv1authexchange)'s, `addresses` included where the server
has them. A kid is meant to be signed in here; a grown-up is usually shown a pairing
code instead.

| Status | Meaning |
|---|---|
| `201` | `{ member, session? }` |
| `400` | `invalid request` (malformed, an unknown field, a wrong type); `code: "invalid_name"`; a `kind` or `access` that isn't one of the two values (no `code`); `code: "invalid_collections"`; `a collection can be shared with at most 50 users` (a chosen collection already has 50 other people) |
| `401` | anonymous |
| `403` | API key; `demo_account`; `member_cannot_manage`; `code: "feature_off"`; `code: "not_allowed"` |
| `409` | `code: "member_limit"` (at `max`) |
| `429` | the self-service rate limit |

### `POST /api/v1/me/household/members/{id}/session`

No body. Signs the member in on the caller's device, as `sign_in_here` does (named as
the caller's device, `created_on_token_id` the caller's token). Response `201`: the
session envelope. Used for "They'll also use this phone" and "Sign in on this
device".

| Status | Meaning |
|---|---|
| `201` | the member's session envelope |
| `400` | `invalid member id` |
| `403` | API key; `demo_account`; `member_cannot_manage` |
| `404` | not the caller's member |
| `409` | `code: "member_disabled"`: the admin disabled the member's account, so no token of theirs would work (nothing is issued) |
| `429` | the self-service rate limit |

### `POST /api/v1/me/household/members/{id}/pair`

No body. Response `200`: a `PairingPayload` for the **member's** own device, built like
[`/auth/pair`](#post-apiv1authpair)'s, with the same lifetime (`pairingTTL`, 10
minutes): single use, unlinked. It works for a kid (who can't call `/auth/pair`
itself). A device that signs in with it is the member's own: it records no
`created_on_token_id`.

| Status | Meaning |
|---|---|
| `200` | the pairing payload |
| `400` | `invalid member id` |
| `403` | API key; `demo_account`; `member_cannot_manage` |
| `404` | not the caller's member |
| `409` | `code: "member_disabled"` (as above; no pairing token is minted) |
| `429` | the self-service rate limit |

### `GET /api/v1/me/household/members/{id}/devices`

Response `200`: a bare array of the member's live sessions and API keys, each shaped as
a [`GET /me/devices`](#get-apiv1medevices) row with `current` always `false` and no
`member_sign_ins` (`[]` when none). `400` `invalid member id`, `403` as above, `404`
not the caller's member. No rate limit.

### `DELETE /api/v1/me/household/members/{id}/devices/{device_id}`

Signs the member out of one device, in one transaction. `204`; `404` `member not
found` for anyone but the caller's member, then `404` `device not found` for a device
that isn't the member's live session or API key; `400` for an id that isn't a number;
`403` as above. Audited `member.device_revoke` (`device_id`).

### `PATCH /api/v1/me/household/members/{id}`

Changes a member: any of `name`, `kind`, `access` and `collection_ids` (the same rules
as the create; `collection_ids` replaces the full set: a share on each listed
collection, and the member removed from every other collection the caller owns;
other people's collections are never touched). `{}` is `400` `nothing to change`.
Response `200`: the member object. Everything runs in one transaction
(`auth.UpdateMember`), with the ownership settled before the input is checked, so a
refused field changes nothing.

Switching a grown-up to a **kid** clears, in the same transaction, everything a kid
can't hold ([Kids](../auth-and-security.md#household-members)); their signed-in
sessions stay signed in. Switching kind leaves `access` as it was.

| Status | Meaning |
|---|---|
| `200` | the member, as it is now |
| `400` | `invalid member id`, `invalid request`, `nothing to change`, `invalid_name`, a bad `kind` or `access`, `invalid_collections`, `a collection can be shared with at most 50 users` |
| `403` | API key; `demo_account`; `member_cannot_manage` |
| `404` | not the caller's member |

### `DELETE /api/v1/me/household/members/{id}`

Deletes the member's account and all of its state (the schema's cascade, as
[`DELETE /admin/users/{id}`](#delete-apiv1adminusersid)). `204`; `400` `invalid
member id`, `403` as above, `404` not the caller's member.

### What a member may and may not do

| Route | A grown-up member | A kid |
|---|---|---|
| browse, search, play, progress, bookmarks, notes, Up next, ratings, a cast token | yes, within their access | yes, within their access |
| their own collections (`POST /me/collections`, items) | yes | yes |
| `PUT /me/collections/{id}/shares` | yes | `403 kid_account` |
| `POST /auth/password`, `POST /auth/tokens`, `POST /auth/pair`, `POST /auth/recovery` | yes | `403 kid_account` |
| `PUT /me/household` | yes | `403 kid_account` (`GET` reads `false`) |
| `/me/household/members/**` | `403 member_cannot_manage` (the list: `200`, `reason: "member"`) | the same |
| `/admin/**` | `403` (role `user`) | `403` (role `user`) |

Where the `kid_account` refusals are enforced, including a request that races the
owner's switch to kid: [Kids](../auth-and-security.md#household-members).

A kid's password sign-in fails like any password-less account's (`401` on
[`/auth/login`](#post-apiv1authlogin)). A member the admin disabled can't sign in at
all, like any disabled account, and their owner's session and pair routes answer
`409 member_disabled`. **Audit:** each route that changes something writes a
`member.*` event with the owner as actor and the member as target (see
[Audit log](../backups-and-notifications.md#audit-log)).

## Casting

*Session.* Capability `cast`. A Chromecast receiver plays a book from URLs the
player hands it; those URLs carry a short-lived, book-scoped, media-only **cast
token** instead of the player's session token (`internal/auth/cast.go`,
`internal/api/handlers_cast.go`). Where the token is accepted is
[Cast tokens as media auth](#cast-tokens-as-media-auth). For the web player to
cast, the per-document CSP of `/web` admits Google's Cast Web Sender:
`script-src` names its three scripts on `https://www.gstatic.com` by path, the only
remote sources in the policy (see [Web UI](../web-ui.md#per-document-csp-htmlcsp)).

### `POST /api/v1/cast/token`

*Session.* Mints a cast token for one book.

```json
{ "library_id": 1, "path": "Will Wight/Cradle/Unsouled" }
```

Response `201`:

```json
{
  "token": "q3Xb0m…",
  "expires_at": "2026-10-10T20:00:00.000Z"
}
```

The path resolves exactly as on the media routes, and a part path (one file, or a
disc folder) resolves to its book: the grant is recorded on the book's path, never
the part's, so the token covers every file of that book and no other book's.
The secret is returned once. `expires_at` falls on a whole second. A demo account
may mint (it can play); an API key may not. How long a cast token lives, how many a
person keeps, what ends it and how dead ones are pruned:
[Cast tokens](../auth-and-security.md#cast-tokens).

| Status | Meaning |
|---|---|
| `201` | `{ token, expires_at }` |
| `400` | `invalid request` (a malformed body or an unknown field), `path is required` |
| `401` | no session (a cast token can't mint another: it is never a bearer credential) |
| `403` | the library or the path is outside the caller's access; `error.code: "not_a_book"` (`Only books can be cast.`) for a path in a podcast library, since episodes are not cast (from 2.4.0; before, the same 403 with no code); or `not available when authenticating with an API key` (a key never mints another credential) |
| `404` | `book not found` (no book at the path), or `library not found` (an admin naming an unknown library; anyone else gets the `403`) |
| `500` | `could not start casting`; `access check failed`, `could not load library` or `could not load book` on a database failure |

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
      "last_seen_at": "2026-07-02T08:15:00Z",
      "managed_by": null,
      "member_kind": null,
      "member_access": null,
      "can_add_members": true,
      "members_count": 2,
      "display_name": ""
    },
    {
      "id": 12,
      "username": "evie",
      "role": "user",
      "…": "…",
      "managed_by": { "id": 4, "username": "sam", "display_name": "" },
      "member_kind": "kid",
      "member_access": "collections",
      "can_add_members": true,
      "members_count": 0,
      "display_name": "Evie"
    }
  ]
}
```

Each user is the [`/me`](#get-apiv1me) object plus the household member fields
(capability `household_members`) only the admin sees (`api.adminUser`):

| Field | Meaning |
|---|---|
| `managed_by` | `{ id, username, display_name }` of the owner for a [household member](#household-members), else `null`. The owner's `display_name` is their own typed name (`""` unless they were once a member themselves): the console names an owner by it, else the username. The player's `managed_by` never carries it |
| `member_kind` | `"kid"` or `"grownup"` for a member, else `null` |
| `member_access` | `"all"` or `"collections"` for a member, else `null` |
| `can_add_members` | the admin's per-person switch (default `true`) |
| `members_count` | how many members this person has |
| `display_name` | the name the owner typed for a member, always present (`""` for everyone else; kept when the member is made independent, though `/me` then leaves it off) |

The same fields are on `GET /admin/users/{id}`'s `user`, on the `PATCH` answer and on
the create's.

### `POST /api/v1/admin/users`

Create an account.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | yes | |
| `password` | string | admins only | optional for non-admins (pairing-only accounts); required for `role: "admin"` |
| `role` | string | yes | `"admin"` or `"user"` |

Response `201`: the created account as the admin's user object above (re-read after
the insert, so its stored defaults, `can_add_members` among them, are there). `409`
`username already taken` (`code: "username_taken"`) on a duplicate username; `400`
with a specific message on a validation failure - `admin_needs_password`,
`password_too_short` (see [error codes](index.md#error-envelope-and-status-conventions)).

### `GET /api/v1/admin/users/{id}`

One account plus everything the console needs to manage it:

```json
{
  "user": { "id": 4, "username": "sam", "role": "user", "disabled": false,
            "has_password": false, "has_recovery": true, "is_demo": false, "…": "…" },
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
  ],
  "members": [ { "id": 12, "name": "Evie", "username": "evie", "kind": "kid", "access": "collections",
                 "created_at": "2026-10-13T10:00:00.000Z", "devices": 1, "disabled": false } ],
  "member_collections": []
}
```

- `members` - this person's own household members, oldest first (`[]` for none):
  each the owner's list's member (`id`, `name`, `username`, `kind`, `access`,
  `created_at`, `devices`; without `collections` and `last_listened_at`) plus
  `disabled`.
- `member_collections` - for a member on `access: "collections"`, the owner's
  collections shared with them (`{ id, name, items }`, `items` counted by the owner's
  current access), else `[]`.
- `accessible_libraries` includes a member's **derived** access (the owner's libraries
  for `all`, the libraries their shared collections reach for `collections`), read
  through the same member rule as the member's own requests, while `shares` stays the
  admin's direct grants only.
- For a household member only, `owner_libraries` (the libraries the owner reaches
  now, as the member's `all` access would follow them) and `owner_is_admin` (an admin
  owner gives every library), so the console's Access tab needs no second detail.
  `[]` and `false` for a member whose owner derives nothing (bad data). Absent for
  everyone else.

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
| `password` | string | `""` clears the password (non-admins only); a non-empty one is refused when the request leaves the account a kid (beside Make independent, or an assign as a grown-up, it is fine). Replacing or clearing a password the account had ends its sessions (below) |
| `disabled` | bool | reversible lockout; disabling revokes nothing but blocks all token use |
| `can_add_members` | bool | the per-person switch: may this person add household members |
| `managed_by` | int \| `null` | an owner's id: "Assign to someone", with `member_kind` and `member_access` beside it. `null`: "Make independent" |
| `member_kind` | string | `"kid"` \| `"grownup"`; only with a `managed_by` id |
| `member_access` | string | `"all"` \| `"collections"`; only with a `managed_by` id |

The body is decoded strictly, and the whole of it is **one transaction**
(`auth.UpdateUser`): every field is checked against the account before anything is
written, so a refused field changes nothing, not even the fields before it. The
checks run in this order, each against the account as the ones before it leave it:
the password, the household, the role, the disabled state, then `can_add_members`.
So a password and "make admin" work in one request on a password-less account, and
"Make independent" and "make admin" work in one request on a member (with a
`password` beside them when the member has none, as every member starts and a kid
always is, or it is `400 admin_needs_password`).

- **Assign to someone** (`managed_by: <id>`) makes the account a member of that owner
  with the given kind and access. Its own grants stay (the member rule is a union).
  Neither the owner's cap nor their switch applies: the admin decides. Moving a member
  to another owner works the same way.
- **Joining another owner's household** (an assign to an owner the account doesn't
  already have: a first assign, or a move) signs the person out of what someone else
  set up for them ([Moving between households](../auth-and-security.md#household-members)).
- **Assigning as a kid** clears what a kid can't hold, as the owner's
  [switch to kid](#patch-apiv1mehouseholdmembersid) does. A non-empty `password`
  beside it is `400 kid_no_password`; `""` is fine.
- **Make independent** (`managed_by: null`) clears the three member columns: the
  account keeps only its direct grants, and `display_name`. What it signs out is in
  [Moving between households](../auth-and-security.md#household-members). A no-op on
  an account that isn't a member.

- **A password reset ends the person's sessions** (server#281): replacing or clearing
  a password the account had ends their sessions exactly as a
  [self-service change](#post-apiv1authpassword) does, in the same transaction. Only
  the admin's own session survives, when the account is the admin's.

Response `200`: the updated user object (with the fields above).

| Status | Meaning |
|---|---|
| `400` | admin must keep a password (`admin_needs_password`) / password too short (`password_too_short`); `managed_by` that isn't a positive id or `null`; `code: "member_fields_required"` (`managed_by: <id>` without both `member_kind` and `member_access`, or either of those without it); a `kind` or `access` that isn't one of the two values; `code: "kid_no_password"` (a non-empty `password` when the request leaves the account a kid: a kid with no household change in it, or an assign as a kid) |
| `404` | user not found (the account, or the owner named by `managed_by`) |
| `409` | would demote/disable the last enabled admin (`last_admin`); `code: "member_not_admin"` (making a member an admin, or assigning an admin as a member); `code: "owner_is_member"` (the owner is a member); `code: "owner_is_demo"` (the owner is a demo account); `code: "member_is_demo"` (the account being assigned is a demo account); `code: "self_managed"` (`managed_by` is the account itself); `code: "has_members"` (the account has members of its own) |

What `user.update` records: [Audit log](../backups-and-notifications.md#audit-log).

### `DELETE /api/v1/admin/users/{id}`

Permanently deletes an account and **all** its durable state (sessions, auth
codes, progress, bookmarks, notes, history, listening sessions and daily
listening totals, share grants) via cascade; files on
disk are untouched. Response: `204 No Content`.

The person's [household members](#household-members) are deleted with them, in the
same transaction, except those named in `keep_members`, as comma-separated ids
(`?keep_members=3,7`), the parameter repeated (`?keep_members=3&keep_members=7`), or
both: every value counts. Each kept member becomes an ordinary account (the three
member columns cleared, so only their direct grants remain), as with Make
independent ([audited](../backups-and-notifications.md#audit-log) on `user.delete`).

The checks answer in this order: an id that isn't a number, then a malformed
`keep_members` (`400 invalid_keep_members`), then a self-delete (`400
cannot_delete_self`), then the account (`404`), then, inside the transaction, the
last-admin rule and the keep list.

| Status | Meaning |
|---|---|
| `400` | self-delete refused (disable your own account instead) - `cannot_delete_self`; `code: "invalid_keep_members"` (a `keep_members` entry that isn't a positive id, or isn't one of this person's members: nothing is deleted) |
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

`404` if the user doesn't exist. `409 code: "kid_account"` (`not available for a kid's
account`) for a kid household member: a kid holds no invite, only their owner sets up
their devices (from the player). The refusal is read inside the minting transaction
(`auth.refuseKid`), so an owner's switch to kid can't slip between the check and the
invite.

### `POST /api/v1/admin/users/{id}/sign-out`

The console's **Sign out everywhere** (server#281): ends the person's sessions as a
[password change](#post-apiv1authpassword) does (the same tokens end and stay),
keeping the admin's own when the account is the admin's, without changing the
password. It also forgets the browsers they signed in from, so each one's next
password sign-in is announced as a `new_device`. API keys stay, revoked one at a time
with [`DELETE /admin/devices/{id}`](#delete-apiv1admindevicesid). No body.

Response `200`, the number of sessions it ended (`0` when there were none):

```json
{ "signed_out": 3 }
```

| Status | Meaning |
|---|---|
| `400` | `invalid user id` |
| `404` | `user not found` |

Audited as `user.sign_out_everywhere` with `signed_out` in the details
([Audit log](../backups-and-notifications.md#audit-log)).

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
invite doesn't exist. `409 code: "kid_account"` when the invite's account is a kid's
(a used-up or expired invite kept as history from before the switch to kid can't be
revived into it).

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
      "kind": "books", "default_view": "hybrid", "sort_order": 0,
      "book_count": 812, "available": true,
      "scan": { "running": false, "total": 812, "done": 812, "indexed": 3,
                "added": 1, "updated": 2, "moved": 0, "removed": 1 },
      "scan_schedule": "every:6h",
      "ignore_patterns": ["# publisher samples", "*.sample.mp3", "Extras/"],
      "metadata_source": "tags",
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
- `metadata_source` (string) - where the library's books take their title,
  author, series and series position from first: `"tags"` (the default: the
  files' tags, with the path filling what they leave empty) or `"path"` (the
  folder layout, `Author/Series/03 - Title`, with the tags filling what it
  leaves empty). See
  [Data model](../data-model.md#metadata-overrides-and-effective-values). Like
  the scan settings, it is not on the player's
  [`GET /api/v1/libraries`](#get-apiv1libraries).
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
| `kind` | string | no | `books` (default) or `podcasts`; fixed after create |
| `default_view` | string | no | defaults to `"hybrid"` |
| `scan_schedule` | string | no | `""` (default), `every:<N>h` or `daily:HH:MM` - see `GET /admin/libraries`. Stored in canonical form (`every:06h` is saved as `every:6h`) |
| `ignore_patterns` | string array | no | ignore rules, one pattern per entry (an entry with line breaks is split into one pattern per line); lines are trimmed and blank ones dropped. At most 100 patterns of 200 bytes |
| `metadata_source` | string | no | `"tags"` (default) or `"path"` - see `GET /admin/libraries` |

A new library goes last in the display order (`sort_order` one past the
highest, from 2.5.1). Response `201`: the created library (the player's library object; the scan
settings are not echoed - read them from
[`GET /admin/libraries`](#get-apiv1adminlibraries)).

| Status | Meaning |
|---|---|
| `400` | `name and root are required`; `invalid request`; `code: "invalid_schedule"` (a schedule that isn't one of the forms above); `code: "invalid_pattern"` (too many patterns, one too long, one that matches nothing, or a malformed wildcard - the message names the line); `code: "invalid_metadata_source"` (a `metadata_source` other than `"tags"` or `"path"`) |
| `409` | `name already taken` (`code: "name_taken"`); also `name_taken` when the server's config declares a library by this name at another folder (the next start would give it the declared folder; the library is deleted, say, and not back yet) |

Invalid `kind` is `400 invalid_kind`. If either library is a podcast library,
equal, ancestor or descendant roots conflict (`409 root_overlaps`), using
cleaned absolute paths. This also applies when moving a books root over a
podcast root. Podcast libraries stay in this admin list regardless of the
player gate; book detection/export and admin book tools require books libraries
(`409 not_book_library` where applicable).

### `PUT /api/v1/admin/libraries/order`

Sets display order from an ordered id list (position 0 first); ids not listed
keep their order. This order is also the final de-duplication tiebreaker between
otherwise-equal copies of the same book (see [`GET /api/v1/search`](#get-apiv1search)).

Body: `{ "ids": [2, 1, 3] }`. Response `200`: `{ "libraries": [ … ] }` in the
new order, in the same enriched shape as
[`GET /admin/libraries`](#get-apiv1adminlibraries) (with `book_count`,
`available`, `scan` and the scan settings).

### `PATCH /api/v1/admin/libraries/{id}`

Edits `name`, `root`, `default_view`, `scan_schedule`, `ignore_patterns` and/or
`metadata_source` (the body fields of create). An empty or omitted `name`,
`root` or `default_view` keeps its current value; an omitted `scan_schedule`,
`ignore_patterns` or `metadata_source` keeps it too, while `""` / `[]` clears a
schedule or the ignore rules (`sort_order` is managed via `/order`).

Sending the existing `kind` is accepted; a different kind is
`400 kind_immutable`. Root changes enforce the same `409 root_overlaps` rule
as create.

A library the server's config declares (`config.yaml`, or the app embedding
the server: `launcher.Options.Libraries`; no environment variable declares one) keeps the name and
folder declared there, since every start upserts it by name
(`launcher.syncLibraries`) and the server never writes a library to
`config.yaml`. A different `name` or `root` on such a library is
`409 config_library` (from 2.4.0; before, the rename stuck until the next
start brought the declared library back as a second one); the same values
resent write nothing, and its other settings stay editable. The console reads
the declared names from `GET /admin/setup`'s `config_libraries` and locks the
fields. Renaming another library to a declared name at another folder is
`409 name_taken`.

A rescan is queued (trigger `change`) **only** when the root or the ignore rules
change, since those make the index stale. A rename, a new default view or a new
schedule doesn't rescan. Nor does a new `metadata_source`: every book of the
library is re-resolved from what the last scan stored, in the edit's own
transaction, before the response is sent, so no reader sees the new setting
with the old values. Admin edits and accepted community values stay on top.

:::note[Behaviour change]
Before admin console Phase 3, every `PATCH` rescanned the library, a rename
included.
:::

Response `200`: the updated library (without the scan settings, as for
create), plus `job` - the queued scan, as for
[`POST …/scan`](#post-apiv1adminlibrariesidscan) - when the edit queued one
(omitted otherwise). `400` (including `invalid_schedule` / `invalid_pattern` /
`invalid_metadata_source`) /
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

A library the server's config declares (see
[`PATCH`](#patch-apiv1adminlibrariesid) above) is `409 config_library` (from
2.4.1, server#176): every start upserts it by name, so it would come back empty,
with everyone's progress, bookmarks and notes in it gone. Remove it from
`config.yaml` (or the app embedding the server) and restart instead. The console
disables its **Delete library...** with the reason.

An id with no library is `404 not_found` (`library not found`), with no audit row
(from 2.5.0, server#198; before, the delete answered `204` and recorded one).

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

Attaches durable, path-keyed external identifiers to a book. Survives
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

| Query param | Type | Default | Notes |
|---|---|---|---|
| `include` | string | - | A comma list, for the admin's own scripts: `paths` adds each row's `paths`, `tags` its `tags`, `description` its `description` (see below); `include=paths,tags,description` asks for all three, and repeating the param (`?include=paths&include=tags`) counts too. Any other value is `400` `include must be a comma list of "paths", "tags" and "description"`, so a typo never silently drops what was asked for |
| `copies` | string | `merged` | `merged` writes copies of the same book as one row (see the per-book notes); `separate` writes one row per copy (see below). Any other value is `400` `copies must be "merged" or "separate"` |

Unlike every other endpoint this one answers with a file download rather than a
plain JSON body:

| Header | Value |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="audiosilo-<library-slug>-<YYYY-MM-DD>.json"`, with `-private` before `.json` when the export holds paths or tags (`include=description` alone keeps the shareable name) |

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
      "subtitle": "A Jack Reacher Novel",
      "authors": ["Lee Child"],
      "narrators": ["Dick Hill"],
      "series": "Jack Reacher",
      "series_position": "2",
      "published": "1998-07-13",
      "publisher": "Brilliance Audio",
      "language": "English",
      "abridged": false,
      "genres": ["Thriller"],
      "asin": "B002V0QK4C",
      "isbn": "9780553505405",
      "runtime_min": 612,
      "chapters": 24
    }
  ]
}
```

**The file is meant to leave the server**, so by default it carries
bibliographic facts only. It contains **no path, size, codec, format or any
other filesystem detail** - not even the library's root - and **not the
book's tags**, which are the owner's own notes ("Owned", "Read"). Genres are
facts about the book and stay. A regression test pins that, both ways: no path
or tag without its `include`, each with it.

With `?include=paths` each row also carries `paths`, the path of every copy that
collapsed into the row (index order), so a script can tie it back to the books;
the envelope's `library.id` names the library they are in (one export is one
library, so no row repeats it). With `?include=tags` each row carries its
`tags`:

```json
{ "title": "Die Trying", "…": "the facts above", "tags": ["Owned"],
  "paths": ["Lee Child/Jack Reacher/02 Die Trying", "Lee Child/Die Trying (MP3)"] }
```

With `?include=description` each row carries its `description`. It is opt-in
for size rather than privacy: a description is long and usually a publisher's
blurb, so the file to share stays lean.

With `?copies=separate` copies of the same book are not merged: each indexed
book is its own row with its own facts and (with `include=tags` /
`include=paths`) its own `tags` and a `paths` holding its own path alone, so a
script can act on one copy (move it, rewrite its tags) without the item
endpoint. A server from before `copies` ignores the param and answers merged
rows (it refuses `include=description` with a `400`, though), so a script that
needs one copy per row checks that each row's `paths` holds one path:

```json
{ "title": "Die Trying", "…": "this copy's facts", "tags": ["Owned"],
  "paths": ["Lee Child/Jack Reacher/02 Die Trying"] }
{ "title": "Die Trying", "…": "that copy's facts", "tags": ["To check"],
  "paths": ["Lee Child/Die Trying (MP3)"] }
```

The paths describe the server's folders (people's names, a share's layout) and
the tags are personal, so such a file is for the admin alone (hence the
`-private` filename): the console's **Export with file paths and tags...** asks
for `include=paths,tags,description&copies=separate` and warns not to attach it
to a public issue or upload it to the community site.

Per-book notes:

- Every field except `title` is omitted when it is unknown or empty, so a
  sparsely-tagged library yields short entries rather than blank ones.
- `authors` / `narrators` are lists. The index stores one string per book, so it
  is split only where it clearly holds several names: on `;`, ` & ` and ` and `
  always, and on a comma **only** when every resulting part still has at least
  two words. That keeps suffixed names such as `Alexandre Dumas, pere` and
  surname-first forms such as `Dumas, Alexandre` whole.
- `series_position` is a string so half-positions survive: `2` for book two,
  `2.5` for a novella between books, `1-3` for an omnibus numbered as a range
  (the metadata site's importer reads it as one). Omitted when there is no position.
- `series` / `series_position` are the book's main series. `series_list` is
  every series the book is in, the main one first when it has one, as
  `[{ "name", "position" }]` (`position` in the same string form, omitted when
  the book has none in that series). Present exactly when the player's
  [`Book.series_list`](#get-apiv1librariesidbooks) is, so a book in only its
  main series carries just `series`. In a merged row the main series and its
  position come from one copy (a later copy only fills a missing position in the
  same series), and `series_list` is every series any copy lists, the main one
  first, each once:

  ```json
  { "title": "The Colour of Magic", "authors": ["Terry Pratchett"],
    "series": "Discworld", "series_position": "1",
    "series_list": [ { "name": "Discworld", "position": "1" },
                     { "name": "Rincewind", "position": "1" } ],
    "published": "1983-11-24" }
  ```
- `runtime_min` is the book's duration in whole minutes (rounded);
  `chapters` is the number of indexed chapters. Both are omitted when unknown.
- `asin` / `isbn` come from the book's identifiers, including any attached via
  [`PUT …/enrichment`](#put-apiv1adminlibrariesidenrichment).
- `subtitle`, `published` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `publisher`,
  `language`, `abridged`, `genres`, (with `include=description`) `description`
  and (with `include=tags`) `tags` are the effective values, as on the player's
  [`Book`](#get-apiv1librariesidbooks) (`abridged` absent while unknown;
  `description` as [`/item`](#get-apiv1librariesiditem) sends it). The
  metadata site's importer reads `subtitle`, `publisher`, `language` and
  `abridged` and ignores keys it doesn't know (`genres`, `series_list`,
  `published`, `description`, `tags`, `paths`), so the envelope's `version`
  stays `1`.
- A multi-file (folder) book is **one** entry. By default (`copies=merged`)
  copies of the same book within the library also collapse to one entry - the
  same grouping search and "recently added" de-duplicate on. The entry takes
  each fact (`published`, `description` and `series_list` included) from
  whichever copy has it, and holds every copy's paths and tags.

`404 { "error": "library not found" }` for an unknown library; `403` for a
non-admin caller; `401` unauthenticated. The bearer token must be sent in the
`Authorization` header (the media-only `?token=` fallback does not apply here).

```sh
curl -OJ -H "Authorization: Bearer $TOKEN" \
  https://books.example.com/api/v1/admin/libraries/1/export

# For your own scripts: one row per copy, with paths, tags and descriptions
curl -OJ -H "Authorization: Bearer $TOKEN" \
  "https://books.example.com/api/v1/admin/libraries/1/export?include=paths,tags,description&copies=separate"
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
or a `POST /setup` that sends library fields - reads as `queued` (or `running`) before that request
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
rename. Failing that, an **unmarked** share the grant itself could have made is
reused as a fallback (and then marked): description `Whole library`, named
`Library: <name>` (made before the column existed) or `Library: <name> (<library
id>)` (left by an interrupted grant). Marked or not, a share is reused only when
its one path rule is this library's whole-library rule (`""`), or when it has no
rules and nobody holds it. Anything else - an admin's own share that happens to be
named `Library: <name>` and covers a folder, a grant since narrowed to a folder, a
share that also covers another library, or an empty share someone holds - is left
exactly as it is, because adding the whole-library rule to it would widen what its
holders see or hand its other rules to the new user. A share marked for a
*different* library is never reused either: that would hand this library to
everyone who has that one.

When no share qualifies, a new grant share is made. If `Library: <name>` is
already taken (by a share that didn't qualify, or by another library's grant
after a rename), it is named `Library: <name> (<library id>)` instead, and from
2.5.0 (server#230) when that is taken too, `Library: <name> (<library id>) 2`,
`3` and so on (`grantName`, up to 20 names); the name is internal, since clients
show the library's own name. From 2.5.0 the new share is created with its
whole-library rule and its `whole_library_id` mark in one transaction
(`createWholeLibraryShare`), so an interrupted grant never leaves a share without
its rule, and the transaction looks for a grant share again first, so first grants
sent together share one share. Errors: `404` for an unknown library; `409` with
`code: name_taken` only if every one of those names is taken.

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
| `subtitle`, `author`, `narrator`, `series`, `publisher` | at most 500 characters, no control characters |
| `language` | a language name or code (`English`, `en-GB`), at most 64 characters, no control characters. Refused: `must be a language name or code, at most 64 characters` |
| `abridged` | `"true"`, `"false"` or `""` (unknown; stored as `NULL`), any case. Refused: `must be "true", "false" or empty` |
| `genres`, `tags` | a JSON list of strings (`["Fantasy","Epic"]`), `""` for none. Each label is trimmed with its inner spacing collapsed, blanks dropped, and kept once by its key (lowercased, spacing collapsed), the first spelling winning; at most 64 characters each, no control characters, at most 50 labels. Stored as canonical JSON without HTML escaping, `""` for an empty list. Refused: `must be a list of names`, `a label must be at most 64 characters, with no control characters`, `too many labels (at most 50)`. To change a list without replacing it, use `add` / `remove` ([bulk edit](#post-apiv1adminbooksbulk)) |
| `series_index` | a number from 0 to 100000 (`2`, `2.5`), or a **range** for an omnibus: two numbers apart by a hyphen or an en dash, spaces allowed (`1-3`, `1 - 3`, `1–3`), with 0 < start < end ≤ 100000 and end - start ≤ 100. Stored in its shortest form (`2.5`, `1-3`), `""` for none. Refused: `invalid_override` with the reason `must be a number from 0 to 100000, or a range like 1-3` |
| `more_series` | the other series the book is in beyond `series`: a JSON list of `{"name": string, "position": number, "position_end"?: number}` (position 0 = none, else 0 to 100000; `position_end` a range's end, by the `series_index` rules), at most 20; names trimmed and checked like `series`, blank names dropped, each name kept once (the first). Stored as canonical JSON (`[{"name":"City Watch","position":1}]`, `[{"name":"Box Sets","position":1,"position_end":3}]`), `""` for none. Only an edit or a community match sets it; tags give one series |
| `published` | `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, and a real date |
| `description` | at most 20000 characters; line breaks and tabs kept, other control characters refused |
| `asin` | 10 letters or digits (uppercased) |
| `isbn` | an ISBN-10 or ISBN-13; hyphens and spaces are stripped, `x` uppercased |

Values are trimmed. The player's book JSON carries the effective `published`,
`subtitle`, `publisher`, `language`, `abridged`, `genres` and `tags` on every
book and `description` on [`/item`](#get-apiv1librariesiditem) only.

Every field reports a **source**: `path` (a scanned value equal to what the
folder and file names yield), `tag` (any other scanned value - it came from the
file's embedded tags), `abs` (from an Audiobookshelf `metadata.json` in the
book's folder), `edited` (typed by an admin), `community` (accepted from
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
| `q` | string | - | full-text search over title/author/series/narrator/genres/tags, the same prefix matching as [`/search`](#get-apiv1search); punctuation-only input filters nothing |
| `author` · `series` · `narrator` | string | - | the effective value: `series` the main series, or one its `more_series` names, in any spelling (case, accents, punctuation and spacing aside, as [`/series`](#get-apiv1librariesidseries) groups them); `author` and `narrator` the whole credit or one of the people it names, exactly (as the [player's list](#get-apiv1librariesidbooks)) |
| `genre` · `tag` | string | - | a genre (tag) the book has, one value each, case-insensitive with spacing collapsed, as on the [player's list](#get-apiv1librariesidbooks) |
| `format` | string, repeatable | - | `?format=m4b&format=mp3`; at most 50 values |
| `codec` | string, repeatable | - | ffprobe codec name (`aac`, `mp3`, …); at most 50 values |
| `direct_playable` | `true`\|`false` | - | the book's codec plays in browsers (an unknown codec counts as playable) and no file of it is in a container no browser plays (`.mka`), judged on the stored files: an MP3-in-`.mka` book the stream remuxes still counts as `false` here |
| `has_cover` | `true`\|`false` | - | a sibling image, embedded art or a custom cover |
| `has_chapters` | `true`\|`false` | - | **more than one** chapter (every single-part book has one) |
| `matched` | `true`\|`false` | - | the book has an ASIN or an ISBN |
| `edited` | `true`\|`false` | - | the book has a metadata edit, or a chapter-title edit on a chapter it still has (one on an index a rescan dropped is dormant and doesn't count) |
| `min_duration` · `max_duration` | number (seconds) | - | inclusive bounds; `0` means no bound |
| `added_after` | date | - | inclusive lower bound on `added_at`: `YYYY-MM-DD` (used as is) or an RFC 3339 time (any offset; converted to UTC before comparing) |
| `added_before` | date | - | exclusive upper bound, same formats |
| `issue` | string | - | one [Health issue](#get-apiv1adminissues) kind's books: `scan_error`, `suspect`, `split_discs` (one row per split book: its first disc), `no_cover`, `unmatched`, `series_spellings`, `no_chapters`, `detailed_chapters` or `transcode` (not `duplicate`, which comes as groups from [`/admin/issues/duplicates`](#get-apiv1adminissuesduplicates)). Books an admin ignored for that kind are left out. Any other value is `400 unknown issue` |
| `issue_ignored` | `true`\|`false` | - | with `issue`, list **only** the books an admin ignored for it; without `issue` it is `400 issue_ignored needs an issue` |
| `sort` | string | `title` | `title` \| `author` \| `surname` \| `series` \| `narrator` \| `published` \| `added` \| `duration` \| `size` |
| `order` | string | `asc` | `asc` \| `desc` |
| `limit` | int | `60` | ≤ 0 or > 200 falls back to 60 |
| `cursor` | string | - | `next_cursor` from the previous page |

Text sorts are case-insensitive. The `author`, `surname`, `series`, `narrator`
and `published` sorts put books with that field blank **last** in either
direction (`order=desc` reverses the named books, not where the blanks go) and
break ties sensibly: `author` sorts by author, then series, series position and
title; `surname` by the author's surname first (the first name of a co-credit;
"Ursula K. Le Guin" and "Le Guin, Ursula K." under L, a "Jr." ignored), then
author as written, series, position and title; `series` by series, position,
then title; `narrator` by narrator, then title; `published` oldest first by the
book's release date - its `published` value, else the date its file tags give
(usually the recording's, never shown on the wire) - then series, position and
title, with a bare year before that year's dates. With `series=`, `sort=series`
orders by each book's position *in that series* (its main one or one of its
`more_series`), unnumbered last, then title.

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
      "subtitle": "",
      "author": "Andy Weir",
      "narrator": "R. C. Bray",
      "authors": ["Andy Weir"],
      "narrators": ["R. C. Bray"],
      "series": "",
      "series_index": 0,
      "series_list": [],
      "published": "2011",
      "publisher": "Podium Audio",
      "language": "English",
      "abridged": null,
      "genres": ["Science Fiction"],
      "tags": ["Owned"],
      "duration": 38040.5,
      "format": "m4b",
      "codec": "aac",
      "direct_playable": true,
      "size": 304112640,
      "added_at": "2026-05-14T09:12:44Z",
      "has_cover": true,
      "custom_cover": false,
      "cover_color": { "bg": "#1d2a44", "accent": "#e8a33c", "on_accent": "#000000" },
      "cover_version": "3f9a1c07be",
      "chapter_count": 27,
      "file_count": 1,
      "asin": "B00B5HZGUG",
      "isbn": "",
      "matched": true,
      "edited": true,
      "edited_fields": ["narrator"],
      "scan_error": "probe_failed",
      "scan_error_file": "Andy Weir/The Martian/The Martian.m4b",
      "scan_error_detail": "[mov,mp4,m4a,3gp,3g2,mj2 @ 0x7f8c] moov atom not found; Invalid data found when processing input",
      "chapters_source": "files",
      "chapters_check": "refine"
    }
  ],
  "next_cursor": "eyJzIjoidGl0bGUiLCJ2IjpbIlRoZSBNYXJ0aWFuIl0sImlkIjo0MTJ9"
}
```

- Every field is always present (empty string / `0` / `false` when unknown),
  except `cover_color`, `cover_version`, the four Health fields below, `chapters_check`,
  `chapter_choice` and `ebook`, which are omitted when empty or `0`.
  `path` is the book path (the player's `rel_path`).
- `custom_cover` - an admin uploaded a cover; `has_cover` includes it.
- `series_list` - every series the book is in, `[{"name", "position", "position_end"?}]`: its main
  `series` first (at `series_index`), then its `more_series`, each name once; `[]`
  for none. `series_index_end` (omitted otherwise) and an entry's `position_end`
  are a range's end, as on the player's `Book`.
- `cover_color` - the colours read from the cover art, as on the player's `Book`
  (`bg`, plus `accent` and `on_accent` when the art has a vibrant colour that
  reads on it). Omitted until the server has read the current art's colour, from a
  thumbnail or in the [background colour pass](../media.md#the-background-colour-pass).
  The book page (`GET /admin/libraries/{id}/book`) carries it too.
- `cover_version` - from 2.5.1, the book's
  [`cover_version`](#get-apiv1librariesidbooks), the same value the player's
  `Book` has: a short token that moves when the cover art does, so a client can
  key cached thumbnails by it. Omitted for a book with no art identity yet. The
  duplicates groups' copies and the book page's `book` carry it too.
- `matched` - the book has an ASIN or ISBN: the same rule as the `matched` filter.
- `abridged` - `true`, `false`, or `null` while nothing says (always present,
  unlike the player's `Book`, which omits it). `genres` and `tags` are `[]` for
  none.
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
- `chapters_source` - where the book's chapters come from now: `files` (the
  scan's own), `community` (a community chapter list fitted onto the audio) or
  `generated` (the chapters a Bridge found in the narration, Phase 1d).
- `chapter_choice` - the admin's choice of chapter source on the book page,
  `files` or `community`; omitted when it is automatic. Chapters found in the
  narration stand in only with no choice, so the console's Health `no_chapters`
  rows offer no **Detect chapters** for a book with one (and a `chapters.detect`
  job for it is `409 chapters_chosen`).
- `ebook` - from 2.5.0, the book's ebook as on the player's `Book`:
  `{"path", "size"}` (`books.ebook_path` and, since `0058`, `books.ebook_size`,
  recorded with it), omitted when the book has none. The book page's `book` carries it too
  (its Files card and hero chip, and the Read-along card's gate). The book page's
  `book` also carries `readalong` (Phase 3c), as on the player's
  [`/item`](#get-apiv1librariesiditem): never a list row.
- `chapters_check` - the status of the book's last
  [community chapter check](../community-chapters.md): `fill`, `titles`,
  `refine`, `restructure`, `same`, `length_mismatch`, `structure_mismatch`,
  `crosses_files`, `no_match` or `unavailable`; omitted when it was never
  checked. The console's `no_chapters` rows use it to say why community
  chapters weren't used.
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
  "edited": { "yes": 37, "no": 775 },
  "genres": [ { "value": "Fantasy", "count": 214 }, { "value": "Science Fiction", "count": 98 } ],
  "tags": [ { "value": "Owned", "count": 40 } ]
}
```

`formats` and `codecs` are ordered by count, largest first (a `""` value is a
book whose codec was never probed). `genres` and `tags` count books by label key
(case and spacing aside), each named by the spelling most of its books use (ties
alphabetical), largest first with ties alphabetical, and hold at most the 100
most common; `[]` when no book has one. Each is counted with every filter but its
own (`genre` for `genres`, `tag` for `tags`). The `q`, `author`, `series`,
`narrator`, duration and added-date filters apply to every dimension. `400` for an
unparseable filter, as for the list.

### `POST /api/v1/admin/books/bulk`

Applies the same field edit to many books in one transaction - **every book is
edited or none is**. Merging two spellings of an author is a bulk `set` of
`author` over their books.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `books` | array | yes | `[ { "library_id": 1, "path": "Andy Weir/Artemis" } ]`, at most 1000 |
| `set` | object | one of `set` / `revert` / `add` / `remove` / `chapter_source` | field → value, for the fields above |
| `revert` | array | one of these | field names to put back to what the scan found |
| `add` | object | one of these | label field (`genres`, `tags`) → labels to add to **each book's own** effective list: `{"tags": ["Owned", "Book club"]}`. A label the book already has (any case) is skipped. Cleaned and bounded as an edit of the field is |
| `remove` | object | one of these | label field → labels to take out of each book's list, matched case-insensitively with spacing collapsed: `{"tags": ["read"]}` removes `Read` |
| `chapter_source` | string | one of these | where every book's chapters come from: `"community"`, `"files"` or `"auto"` (as on [`PATCH …/book`](#patch-apiv1adminlibrariesidbook)). The console's Health "Use detailed chapters" sends `"community"` |
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
| `400` | `books is required`; `nothing to change`; `invalid request` (malformed body or an unknown key); `code: "too_large"` for more than 1000 books; `code: "invalid_override"` with `field` for a value that fails its rule (`field: "chapter_source"` for a source other than the three), or with `field: "chapters"` for any chapter edit (`chapter titles can only be edited one book at a time` - chapter indexes are per book) |
| `404` | `code: "book_not_found"` - one of the paths is not an indexed book (nothing was changed) |

A field cannot be both set and reverted in one request (`invalid_override`).
Reverting a field that has no edit is a no-op.

`add` and `remove` exist because a bulk `set` of `tags` would give every book the
same list, wiping each one's own. For each book they merge into its current
effective list (the labels removed, then the new ones appended in the order
given) and write the result as an `edited` (or `community`) override of that
field, only where the list changes: adding a tag a book already has leaves it
untouched (no override written). Each is refused with `400`
`code: "invalid_override"` and `field` set when it names a field other than
`genres` / `tags` (`only genres and tags take add`), names a field the request
also sets or reverts (`cannot be set or reverted and changed by add at once`),
names one label in both (`a label cannot be added and removed at once`), or would
leave a book with more than 50 labels (`too many labels (at most 50)`). The
single-book [`PATCH …/book`](#patch-apiv1adminlibrariesidbook) takes `add` and
`remove` too, by the same rules.

```json
{
  "books": [
    { "library_id": 1, "path": "Andy Weir/The Martian" },
    { "library_id": 1, "path": "Andy Weir/Artemis" }
  ],
  "add": { "tags": ["Owned"] },
  "remove": { "tags": ["To buy"] }
}
```

A bulk edit of `series` (without `more_series`) makes the
[series swap](#patch-apiv1adminlibrariesidbook) one book at a time: only the
books whose `more_series` lists the new series swap; the others simply get the
new main series. One book whose old main series can't be listed refuses the whole
request: `400` `code: "invalid_override"` with `field: "series"`, its `error`
ending with that book's path in parentheses.

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
    { "names": ["Brandon Sanderson", "Sanderson, Brandon"], "suggested": "Brandon Sanderson", "books": 16, "other_books": 2 }
  ],
  "unknown": 3
}
```

The narrators route uses the key `narrators` instead of `authors`.

- A name is one **person**: a credit counts for each person it names, so a
  `Michael Kramer & Kate Reading` book counts once for Michael Kramer and once
  for Kate Reading, and the `narrator` filter finds it by either. The split is
  deliberately shy: `;`, ` & ` and ` and ` always split, a comma only when every
  part is a full name (two words or more), so `Alexandre Dumas, pere` and
  `Sanderson, Brandon` stay one person. A name given twice in a credit counts
  once. Names are exact (`kate reading` is another spelling, for a merge) and
  sort case-insensitively.
- `unknown` counts books whose credit names nobody (blank, or only joiners);
  they are not listed.
- A merge suggestion groups names that compare equal once `Surname, Given` is
  turned round (only when the part before the comma is one word, so `Alexandre
  Dumas, pere` stays whole) and case, spacing and punctuation are ignored (so
  `J.R.R. Tolkien` and `J. R. R. Tolkien` group). Suggestions are over **whole
  credits**, since a merge rewrites the whole field of every book whose credit
  is one of the other spellings (never a co-credit that merely names one):
  `other_books` is how many books that is, `books` every spelling's together. Letters of every script are
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
      "duration": 284110.2, "positions": [1, 2, 3], "extra_books": 0 }
  ]
}
```

`author` is the most common author among the series' books; `positions` lists
the distinct non-zero series positions held, ascending (so a client can mark the
gaps; a range holds every whole number inside it, as on the player's `/series`). A book counts in every series it is in, its main `series` and each of its
`more_series`, at its position there; `extra_books` is how many of `books` are in
the series through `more_series`. Spellings of one series are one entry, named as
on the [player's `/series`](#get-apiv1librariesidseries); the console loads each
card's books with `series=<name>&sort=series`, which finds every spelling. Sorted
case-insensitively by name. Books with no series are not counted.

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
  "indexed_at": "2026-10-03T09:12:01.33Z",
  "chapter_source": "files",
  "chapter_choice": "",
  "community_chapters": {
    "status": "refine",
    "work_id": "the-martian",
    "recording_id": "the-martian-1",
    "detail": {
      "local_duration": 38040.5, "community_duration": 38052.1,
      "ratio": 0.9997, "worst": 0.9981,
      "local_chapters": 27, "community_chapters": 41,
      "anchors": 26, "snapped": 14, "approximate": 0,
      "omitted": ["Preview: Artemis"]
    },
    "checked_at": "2026-10-03T09:20:44.10Z"
  },
  "community_checking": false,
  "match_query": "The Martian: Classroom Edition Andy Weir",
  "generated_description": { "text": "Mark Watney, a botanist on the third crewed mission to Mars, ...",
                             "generated_at": "2026-10-16T09:31:02Z" }
}
```

- `fields` carries **all sixteen** overridable fields, in the order of the
  table above (the example shows four).
  Each has the effective `value`, its `source`, the `scanned` value (what the
  scan found - the revert target), `locked` (an admin edit holds it), and for an
  edit `edited_by` (the username; omitted once that account is deleted) and
  `edited_at`. `series_index` is a string here (`"2.5"`, `"1-3"` for a range,
  `""` for none), `abridged` `"true"` / `"false"` / `""`, and `genres` / `tags`
  their canonical JSON list (`"[\"Owned\"]"`, `""` for none).
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
- `chapter_source` - where `chapters` come from now: `"files"` (the scan's
  own), `"community"` (the community list below, fitted onto the audio) or
  `"generated"` (the chapters a Bridge found in the narration, its
  `chapters.json`: Bridge Phase 1d, see
  [Generated chapters](../community-chapters.md#generated-chapters)).
- `chapter_choice` - the admin's choice of source: `"files"`, `"community"`,
  or `""` when it is automatic (the community's chapters are used only for a
  `fill`: a book with no chapters of its own; chapters found in the narration
  only with no choice, when the community's don't apply). It is never
  `"generated"`. It is not a metadata edit, so it is not in `fields` and doesn't
  make the book `edited`.
- `generated_chapters_fit` - present and `true` when the book has a stored
  `chapters.json` that fits its files as they are now, so it would stand in with
  no choice whenever the community's don't apply: always while `chapter_source` is
  `"generated"`; otherwise it is checked only while a choice is made (the
  community's own fit is not weighed, so with a `community` choice it can be `true`
  while removing the choice would keep the community's). Over a `files` choice the
  console's Chapters card then offers **Use automatic** with a note that found
  chapters are kept out. Omitted otherwise.
- `community_chapters` - the book's last
  [community chapter check](../community-chapters.md), `null` when it has none
  (a book with no ASIN or ISBN is never checked):
  - `status` - a fit (`fill`, `titles`, `refine`, `restructure`, `same`), a
    reason it failed (`length_mismatch`: another edition; `structure_mismatch`:
    the book's own chapters don't line up; `crosses_files`: a community chapter
    runs from one file into the next), `no_match` (no community recording for
    the ASIN/ISBN) or `unavailable` (the recording has no chapter list).
  - `work_id`, `recording_id` - the community recording checked against;
    omitted for `no_match`.
  - `detail` - what the fit found (omitted for `no_match` and `unavailable`):
    the two timelines' lengths (`local_duration`, `community_duration`,
    seconds), `ratio` (the length-weighted median of local over community
    length across the anchored stretches) and `worst` (the stretch furthest
    from 1), both omitted when unmeasured, the two chapter counts
    (`community_chapters` as fitted, after `omitted`), `anchors` (the book's
    boundaries pinned to community ones), `snapped` (placed boundaries moved
    onto a pause), `approximate` (ones that couldn't be and may be a few seconds
    off), and when they apply `omitted[]` (community chapter titles not in this
    copy), `title_diffs[]` (`{index, current, community}`, for `titles`) and
    `straddle` (`{title, at, from, to}`: the chapter a file boundary falls
    inside, the boundary's place on the book's timeline, and the files either
    side, for `crosses_files`).
  - `checked_at` - when the check was recorded (or last renewed: a recheck
    that finds the same list for the same audio only moves it). The fitted
    list itself is not sent; once used, it is the book's `chapters`.
  - `stale` - present and `true` when the book has changed since the check
    (other audio, other identifiers): it is not used until the book is checked
    again.
- `community_checking` - a check of this book is running now (`POST
  …/book/community-chapters`, or the background pass); poll the page until it
  is `false`.
- `community_check_failed` - present and `true` when the book's last check
  failed (the community service didn't answer, or the check ran out of time):
  `community_chapters` is then the check before it.
- `match_query` - the text the console's
  [match dialog](#get-apiv1adminlibrariesidbookmatch) opens its search box
  with (`meta.SearchPrefill`): the book's title and author, unless the tags
  look swapped or junk, where the folders' reading of the path
  (`metadata.FromPathLayout`) replaces them. Swapped means the title is the
  author folder's name, or the author, cleaned of series and numbering, is the
  path's title; a tag that matches its own path fact is never swapped
  (`Dune/Dune` by Frank Herbert). A junk title (`Unknown`, `Untitled`,
  `Track 01`, `03`) or a junk author (`Unknown`, `Various Artists`) is replaced
  on its own. A fact the path doesn't give keeps the tag's value. It only fills
  the box: the match itself always sends the book's own facts, and `q` is what
  the admin then searches for. Always present (`""` for a book with nothing to
  say).
- `generated_description` - the description the [Bridge](#the-bridge) generated
  for the book (its checked `.audiosilo/description.json`, Phase 1c), with
  `generated_at` the time `bridge.json`'s `description` object gives (omitted when
  unknown). Omitted when the book has none. It is read only when the book's
  attachment signature names a description, and never the characters or recaps.
  The console's Community card shows it in its Description part.

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
| `add` · `remove` | object | label field (`genres`, `tags`) → labels to add to, or take out of, the book's own list, as on the [bulk edit](#post-apiv1adminbooksbulk) (same rules and refusals) |
| `source` | string | `"edited"` (default) or `"community"` (accepted from a [match](#get-apiv1adminlibrariesidbookmatch)) - recorded on every field this request sets |
| `chapters.set` | object | chapter index (as a string key) → new title; a title cannot be empty (revert it instead), at most 500 characters. The rename is stored against that chapter's file and start, not its index, so it stays on the same chapter if a rescan inserts or drops others |
| `chapters.revert` | array | chapter indexes to put back to the scanned title |
| `chapter_source` | string | where the book's chapters come from: `"community"` (the fitted community list, when the last check fitted), `"files"` (the scan's own) or `"auto"` (remove the choice: community only for a `fill`, else chapters a Bridge found in the narration when they fit). Stored as a path-keyed `chapter_choices` row, so it survives rescans and moves with the book; switching back restores the files' chapters exactly, renames included. `"generated"` is not a choice: `"files"` turns found chapters off and `"auto"` brings them back |

```json
{
  "set": { "title": "The Martian: Classroom Edition", "published": "2011" },
  "revert": ["narrator"],
  "chapters": { "set": { "0": "Sol 6" }, "revert": [3] }
}
```

A revert restores the value from what the last scan stored - no rescan and no
disk access. Reverting an ASIN/ISBN falls back to any enrichment for it.

**Making an other series the main one swaps them.** When an edit sets `series` to
a series the book's `more_series` lists (in any spelling: case, accents, punctuation and spacing aside), and does not set
or revert `more_series` itself, the server swaps the two: the old main series,
at its old `series_index`, takes that entry's place in `more_series` (a book with
no main series just drops the entry, and another entry already naming the old
main series gives way), and `series_index` becomes the entry's position (unless
the edit sets or reverts `series_index` itself). A range moves with it both ways:
a main series at `1-3` becomes an entry with `position_end` 3, and an entry with
one becomes `series_index` `"1-3"`. Reverting `series` swaps back
the same way when the series it returns to is listed. The swapped `more_series` and `series_index` are written as the edit's
own overrides, so they read as edited and can be reverted like any other edit,
except that a value equal to what the book has without an edit goes back to
following the scan instead (for `series_index`, only when the new main series is
the series the file's number belongs to). So swapping and reverting `series`
leaves the number read off the file again, as it was.
An edit that sets `more_series` never swaps, and neither does a community edit
(`source: "community"`): a match lays out the series itself. If the old main
series can't be listed (a name too long for a list entry, or a position out of
range), the edit is refused: `400` `invalid_override` with `field: "series"`.
The console's Book page drafts the same swap before saving, so the fields and the
save dialog show it, and its save sends the drafted `more_series` and
`series_index` itself. As that edit names `more_series`, the server swaps nothing
and writes the values as edits, even one equal to the file's; reverting `series`
afterwards is an ordinary revert, so it swaps back as above.

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
series swap whose old main series can't be listed (`field: "series"`), a
`source` other than the two above (`field: "source"`), a `chapter_source` other
than the three above (`field: "chapter_source"`), and chapter problems
(`field: "chapters"`: a chapter the book doesn't have, an empty title, one index
both renamed and reverted).

An edit is audited as `book.edit` (`chapter_source` in its details when
sent). It also wakes the [community chapter checks](../community-chapters.md#when-a-book-is-checked),
so a newly set ASIN or ISBN is checked soon after.

### `POST /api/v1/admin/libraries/{id}/book/community-chapters`

Checks the book against its community recording's chapter list **now**, in the
background, and returns the book page (the same body as
[`GET …/book`](#get-apiv1adminlibrariesidbook)) with `community_checking:
true`. `?path=` required. A long book's pause search takes a while, so poll the
book page until `community_checking` is `false`; the check's outcome is then in
`community_chapters`, and `chapters` / `chapter_source` reflect it (a `fill`
is used at once unless the admin chose the files' chapters). A book already
being checked is not checked twice. Not audited: it changes nothing an admin
chose (picking a source is a `PATCH`).

| Status | Meaning |
|---|---|
| `200` | the book page, `community_checking: true` |
| `400` | `invalid library id`; `path is required` |
| `401` / `403` | anonymous / non-admin |
| `404` | `code: "metadata_off"` - community metadata is turned off; `library not found`; `code: "book_not_found"` - no book is indexed at that path |

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

- what the book's **library path** says (`metadata.ReadPathLayout`, layout only): the
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
instead: work fetches share the same concurrency limit as `GET /meta/work`). The
[series rules](#series-rules) read each candidate series' record once (at most 16
per request, within 5 seconds, none for a work with no language and one series),
and those facts are cached.

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
          "asin_refs": [
            { "region": "uk", "asin": "B00B5HZGUG" },
            { "region": "us", "asin": "B00B5HZGUG" }
          ],
          "asin_region": "uk",
          "isbns": ["9780553418026"],
          "series": []
        }
      ],
      "recording_id": "rec1",
      "default_recording_id": "rec1",
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
- `series` lists the series a book of the work is in whatever its recording
  (`{ "id", "name", "position" }`, each once, at its first position), by the
  [series rules](#series-rules): no alternate reading orders, translations,
  other-language series or editions. Each recording's `series` is the list for a
  book that is that recording, its main series first: an edition named for it
  ("Harry Potter (Full-Cast Editions)" for the full-cast recording) in front of the
  work's series. The console's dialog offers the chosen recording's list, the book's
  own series first when the work is in it. `subtitle`, `language`,
  `first_published`, `description`, `cover_url`, `recording_id` and the
  recordings' optional fields are omitted when empty; `asins`/`isbns` are always
  arrays.
- A recording's `asins` are its distinct ASINs **best first for this server**:
  the preferred marketplace's ([`metadata.region`](../configuration.md#community-metadata-metadata)),
  then the US store's, then the rest in the service's order (by region), so
  `asins[0]` is the one to attach. `asin_refs` keeps each with its Audible
  marketplace (`us`, `uk`, `ca`, `au`, `de`, `fr`, `es`, `it`, `jp`, `in`,
  `br`), as the service lists them; a publisher-direct ASIN sold under one id
  in several stores appears once per region. `asin_region` names the store of
  `asins[0]`.
- `default_recording_id` is the recording the book most likely is: the one an
  identifier named, else the one whose runtime is closest to the book's, a
  recording selling in the preferred marketplace winning a tie. The console's
  dialog and a bulk run both start from it.
- No hits is `200 { "candidates": [] }`.

`cover_url` is an image on its own host (Audible's CDN, Open Library), which
the console's CSP doesn't load, so the console shows it through
[`POST /admin/meta/covers`](#post-apiv1adminmetacovers).

Accepting a candidate takes up to two existing writes: the fields you take
from it, the ASIN and ISBN included, with
[`PATCH …/book`](#patch-apiv1adminlibrariesidbook) and `source: "community"`,
and, when the cover is taken too, keeping it as the book's custom cover with
[`PUT …/cover/community`](#put-apiv1adminlibrariesidcovercommunity). To match
many books at once, see [Bulk community matching](#bulk-community-matching).

| Status | Meaning |
|---|---|
| `400` | `query too long`; `invalid library id`; `path is required` |
| `404` | `code: "metadata_off"` - community metadata is turned off; `library not found`; `code: "book_not_found"` |
| `502` | `metadata service unavailable` - the community service failed (including a `503` or `5xx` from `works/match`) and no candidate could be returned. Partial failures still return what was found: on the fallback, if the identifier lookup or the text search fails but the other leg yields candidates, those are returned, and a candidate whose work fails to load is left out. When nothing is returned, any failure along the way (either leg, or loading a hit's work) is a `502`, not an empty list - the failed leg may well have found the book |

### Bulk community matching

The console's **Match automatically** (Health > Not matched). A **match run**
matches many books against the community service in the background, exactly
as [`…/book/match`](#get-apiv1adminlibrariesidbookmatch) matches one (the same
facts, the preferred marketplace's ASIN), but expands only the best two works
per book and asks a couple of books at a time. It only **looks**: each book's
best candidate and what it offers are recorded for the admin to review, and
nothing changes until the run is **applied**. Applying writes community
overrides (as [`PATCH …/book`](#patch-apiv1adminlibrariesidbook) with
`source: "community"` does) and, for a book with no cover, the community cover
(as [`PUT …/cover/community`](#put-apiv1adminlibrariesidcovercommunity)), so
every change is reversible. Admin only; every endpoint answers `404 code:
"metadata_off"` while community metadata is off. One run works at a time
(server-wide); the newest 10 runs are kept, with their books.

A run is a `match` run (the books with no ASIN or ISBN: the Health page's
"Not matched", less those ignored there), a `repick` run (the books whose
ASIN is a **community** override, never one from the tags, an admin's edit or
an enrichment write: each is looked up, and when its recording now sells
in the preferred marketplace under another ASIN, that is offered) or a
`refresh` run (every book with an ASIN or ISBN, whoever set it: each is looked
up by its own identifier alone, the ISBN when the ASIN finds nothing, and the
record it names is the book, `auto` whatever its score unless its recording's
length is more than 10% from the book's, which makes it `review`; an identifier the
community doesn't know is `none` with `detail: "identifier_unknown"`, never a
fuzzy match by title). A refresh fills in, or with `overwrite` replaces, the
details an identifier alone didn't bring (an enrichment write, an `ids`
apply), and cleans up the series an earlier match wrote (see the `overwrite`
scope below); it never changes the identifier itself. Only books a scope would
change are recorded (a book already up to date leaves no item, as a repick
records only books with a new ASIN), and each refresh proposal names the
identifier it was found by (`proposal.found_by`, `"asin:<ASIN>"` or
`"isbn:<ISBN>"`), as each repick proposal names the ASIN it looked up (from
2.4.0; a repick recorded earlier has none): applying it changes nothing on a
book that no longer has that identifier (matched again since, by hand).

Each book's **outcome**:

| Outcome | Meaning |
|---|---|
| `auto` | Confident: the best candidate scores **90** or more, at least **10** ahead of the next, its recording has an ASIN or ISBN, and, when both lengths are known, the recording's runtime is within **10%** of the book's (the closest recording of a work can still be another edition). Applied unless the admin leaves it out. A repick's offers are all `auto`. |
| `review` | A candidate that isn't confident. Applied only if the admin puts it in. One held because its recording's length is more than 10% from the book's (a match run's or a refresh's) carries `detail: "length_differs"` (from 2.4.0), worded with the item's `book.duration` and the proposal's `runtime_min`. |
| `none` | No candidate. |
| `error` | The service failed for this book (`detail: "metadata_unavailable"`). Five in a row stop the run. |

Run **statuses**: `matching` → `ready` (waiting for review) → `applying` →
`applied`; `cancelled` (stopped while matching), `failed` (stopped by itself:
`error` is `metadata_off` when community metadata was turned off,
`metadata_unavailable` when the service kept failing, `internal`), and
`interrupted` (the server stopped mid-match; a run stopped mid-apply goes back
to `ready` at the next start, its applied books marked).

#### `GET /api/v1/admin/match-runs`

The kept runs, newest first, and the marketplace a new run would prefer.

```json
{
  "runs": [
    {
      "id": 3,
      "library_id": null,
      "mode": "match",
      "region": "uk",
      "status": "ready",
      "started_by": 1,
      "started_by_name": "admin",
      "started_at": "2026-10-07T21:00:00Z",
      "finished_at": "2026-10-07T21:04:12Z",
      "total": 570,
      "done": 570,
      "scope": "",
      "apply_total": 0,
      "apply_done": 0,
      "applied_at": null,
      "counts": { "auto": 412, "pending": 412, "review": 98, "none": 58, "error": 2,
                  "applied": 0, "skipped": 0, "failed": 0 }
    }
  ],
  "region": "uk"
}
```

`library_id` `null` = every library (`library_name` names one). `total`/`done`
count the books matched, `apply_total`/`apply_done` the last apply. `counts`
are the items by outcome, `pending` the `auto` ones not applied yet, and
`applied`/`skipped`/`failed` what applying did. `scope` is the last apply's.

#### `POST /api/v1/admin/match-runs`

`{"library_id"?: 2, "mode"?: "match" | "repick" | "refresh"}` (omitted, or no body at all:
every library, a `match` run). A book of a library deleted while the run works
is left out. Starts the run in the background and answers `202` with it (as
in the list). The admin's console polls
[`GET …/match-runs/{id}`](#get-apiv1adminmatch-runsid) while it works.
Audited as `book.match_run`, `book.asin_repick` or `book.match_refresh` (`run`,
`books`, `region`).

| Status | Meaning |
|---|---|
| `400` | `invalid request`; `mode must be "match", "repick" or "refresh"`; `code: "no_region"` - a repick with no `metadata.region` set |
| `404` | `library not found` |
| `409` | `code: "match_run_busy"` - a run is matching or applying |

#### `GET /api/v1/admin/match-runs/{id}`

One run, as in the list (`404` when it isn't kept).

#### `GET /api/v1/admin/match-runs/{id}/items`

A page of the run's books, the best match first (score descending, a tie in
the order they were recorded): `?outcome=auto|review|none|error` (omitted: all),
`?after=<item id>` (the previous page's `next_after`; the page reads on from that
item's score, so every page follows one order), `?limit=` (1-200, default 50).

```json
{
  "items": [
    {
      "id": 41,
      "run_id": 3,
      "library_id": 1,
      "path": "Andy Weir/The Martian",
      "outcome": "auto",
      "score": 96,
      "runner_up": 61,
      "proposal": {
        "work_id": "the-martian",
        "recording_id": "bray",
        "title": "The Martian",
        "authors": "Andy Weir",
        "narrators": "R. C. Bray",
        "runtime_min": 634,
        "web_url": "https://meta.audiosilo.app/work?id=the-martian",
        "cover_url": "https://m.media-amazon.com/images/I/x.jpg",
        "asin_region": "uk",
        "values": { "title": "The Martian", "author": "Andy Weir", "narrator": "R. C. Bray",
                    "published": "2011", "asin": "B0UK000001" }
      },
      "applied": "",
      "book": { "title": "The Martian (Unabridged)", "author": "Andy Weir", "duration": 38052.4 },
      "changes": {
        "ids": { "fields": ["asin"], "cover": false },
        "fill": { "fields": ["narrator", "published", "asin"], "cover": true },
        "overwrite": { "fields": ["title", "narrator", "published", "asin"], "cover": true }
      }
    }
  ],
  "next_after": 0
}
```

- `proposal.values` is what the best candidate offers for each overridable
  field, in stored form (a value an override would refuse is left out), as the
  match dialog's compare table would offer it: its chosen recording is the
  identifier's, else the closest runtime (a recording selling in the preferred
  marketplace wins a tie), and its ASIN is that recording's best for this
  server, named by `asin_region`.
- `book` is the book as it is now, with its `duration` in seconds (omitted when
  unknown); `gone: true` when nothing is indexed at the path any more.
- `matched_since: true` (a match run only) when the book has an ASIN or ISBN now
  that it didn't have when the run looked: matched since, by hand or otherwise.
  Its `changes` are empty, and an apply leaves it alone under any scope.
- `changes` is what applying would write under each scope the run's mode takes
  (fields in display order, set or reverted, and whether the cover is taken),
  worked out against the book now by the same rules the apply uses, so the
  review can't disagree with it. A `match` run's items carry `ids`, `fill` and
  `overwrite`; a `refresh` run's `fill` and `overwrite` (it writes no
  identifier); a `repick` run's only `ids` (its ASIN, whatever the scope). When a
  scope changes the book's series, its change also carries `series`: the book's
  series `from` (now) and `to` (after), each `[{ "name", "position", "position_end"? }]` with the
  main series first (`position` 0 = none; `position_end` a range's end), so a series it removes is visible:

  ```json
  "overwrite": {
    "fields": ["series", "more_series"],
    "cover": false,
    "series": {
      "from": [ { "name": "Harry Potter (Full-Cast Editions)", "position": 2 },
                { "name": "Harry Potter (Narrated by Stephen Fry)", "position": 2 } ],
      "to": [ { "name": "Harry Potter", "position": 2 } ]
    }
  }
  ```
- `applied` is what applying did: `""` (not yet), `applied`, `skipped` (with
  `detail` `nothing_to_change`, `matched_since` or `book_gone`) or `failed` (`edit_failed`,
  `cover_failed`); an `applied` item can carry `cover_failed` when its fields
  went on but its cover couldn't be fetched. A match item an apply's
  stop cut short after its fields went in stays `""` with `detail`
  `cover_pending`, so the next apply takes its cover.

#### `POST /api/v1/admin/match-runs/{id}/apply`

`{"scope": "ids" | "fill" | "overwrite", "exclude"?: [item ids], "include"?:
[item ids]}`. Applies the run's `auto` items, less `exclude`, plus the
`include` items (`review` ones the admin chose), each only while not yet
applied, in the background; answers `202` with the run (`applying`). What a
book gets, under each **scope**:

| Scope | Writes |
|---|---|
| `ids` | The ASIN and ISBN, where the book has none. |
| `fill` | Also every field the book has empty, and the community cover when it has no cover (a checked book with none, and no custom cover). |
| `overwrite` | Also every field whose value differs, as accepting the dialog's default ticks does; the cover only when it has none. The book's series are **replaced** by the community's for its recording (the [series rules](#series-rules)): a `series`, `series_index` or `more_series` value the community wrote earlier that it no longer offers (a series it deleted or merged, an edition or a translation) is reverted to what the files say. |

Under every scope a field an admin **edited** (`source: "edited"`) is never
replaced, a value the book already has isn't rewritten, and a series position
is written only beside the series it numbers (the book's own, or the one being
set). Only `overwrite` reverts, and only community values: a series an admin
typed stays, and a revert never removes an edit made after the run looked (a
[`PATCH …/book`](#patch-apiv1adminlibrariesidbook) revert sent with `source:
"community"` removes only a community value). A series position is put back from
the files only beside the files' own series. A community position that is a
range (an omnibus, `"1-3"`) is written as one: `series_index` `"1-3"`, or a
`more_series` entry's `position_end`; one the field refuses (a span over 100) is
no position. A
retired work id is a redirect the server follows, so a merged record's series
are the ones written. A repick writes its ASIN whatever the scope, and only while
the book's ASIN is still the community override it found and still the ASIN it
looked up (`found_by`), so a book matched again by hand since, to another
record, keeps that match; a refresh takes only
`fill` or `overwrite` (`400` for `ids`, which would write nothing). Audited as
`book.match_apply` (`run`, `books`, `scope`). Applying `ready` again after a
stopped apply takes the rest.

| Status | Meaning |
|---|---|
| `400` | `invalid request`; `scope must be …` (also a scope the run's mode doesn't take: `ids` for a refresh); `code: "too_large"` - more than 20,000 ids in `include` or `exclude` |
| `404` | `no such match run` |
| `409` | `code: "match_run_busy"` - a run is matching or applying; `code: "match_run_not_ready"` - this run isn't `ready` |

#### `POST /api/v1/admin/match-runs/{id}/cancel`

Stops the run while it works: matching stops (`cancelled`, nothing changed);
applying stops after the books in hand (`ready` again, the rest still to
apply). Turning community metadata off stops an apply the same way. `204`; `409 code: "match_run_not_running"` when it isn't working.
Audited as `book.match_stop`.

#### `DELETE /api/v1/admin/community-matches`

Undoes the community matches so the books can be matched from fresh (Server >
Settings > Community metadata > Danger zone). `?library_id=` limits it to one
library; without it, every library. In one transaction it removes every
`source: "community"` override (whether a match dialog or a run wrote it) and
every community cover (one kept from the match dialog or by a run), rebuilds
each book's effective metadata and cover, and removes the match runs with their
reviews: every run, or for one library its runs and its books' items in runs
over every library. An admin's own edits and uploaded covers, the tags and
identifiers stored in `book_enrichment` all stay, so a book whose tags carry an
ASIN or ISBN is still matched afterwards. It sends nothing out, so it works
with community metadata off (and with no service configured).

```json
{ "books": 128, "covers": 41, "runs": 3 }
```

`books` counts the books that had a community value or cover, `covers` the
community covers removed, `runs` the runs removed. Audited as
`book.match_clear` with the same counts (target: the library's name, empty for
every library).

| Status | Meaning |
|---|---|
| `400` | `invalid library_id` |
| `404` | `library not found` |
| `409` | `code: "match_run_busy"` - a run is matching or applying (stop it or wait, then try again) |

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

### `PUT /api/v1/admin/libraries/{id}/cover/community`

Keeps a community cover (a [match](#get-apiv1adminlibrariesidbookmatch)
candidate's or recording's `cover_url`) as the book's **custom cover**: the
server fetches the image and stores it exactly as an
[upload](#put-apiv1adminlibrariesidcover--delete-apiv1adminlibrariesidcover)
(in the database, never in the library folder; `DELETE …/cover` removes it).
It is recorded as a community cover, so
[clearing the community matches](#delete-apiv1admincommunity-matches) removes
it, where an upload stays.
Requires the `metadata` [capability](#get-apiv1server). `?path=` required.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | an absolute `http`/`https` URL, at most 2048 characters |

```json
{ "url": "https://covers.openlibrary.org/b/isbn/9780553418026-L.jpg" }
```

The fetch connects to **public addresses only**: every connection's resolved
address, a redirect's included, is checked when it is made, so a loopback,
private, link-local or otherwise reserved address is refused (no proxy is
used). It follows at most 3 redirects and gives up after 15 seconds. The image
must be a JPEG, PNG or WebP; one with more than 40 megapixels is refused from
its header, and one over 5 MiB (the upload limit) is re-encoded as a JPEG
within 1600 x 1600 pixels first. The book is checked before anything is
fetched. A success is audited as `book.cover_set` with `source: "community"`
and, like an upload, moves the book's
[`cover_version`](#get-apiv1librariesidbooks).

Response `200`: `{ "status": "cover set", "path": "…" }`.

| Status | Meaning |
|---|---|
| `400` | `url must be an absolute http(s) URL`; `invalid request` (malformed body or an unknown key); `invalid library id`; `path is required` |
| `401` / `403` | anonymous / non-admin |
| `404` | `code: "metadata_off"` - community metadata is turned off; `library not found`; `code: "book_not_found"` |
| `413` | `code: "too_large"` - the image is over 16 MiB, or over 40 megapixels |
| `415` | `code: "unsupported_image"` - not a JPEG, PNG or WebP image |
| `502` | `code: "cover_unavailable"` - the image couldn't be fetched (an address that isn't public, a timeout, too many redirects, an answer other than `200`) |

### `POST /api/v1/admin/covers`

Cover thumbnails for many books in one request - how the admin console shows
covers in its grids, without a session token in any image URL. Each cover is
resolved like [`GET /libraries/{id}/cover`](#get-apiv1librariesidcover): a
custom cover, then the sidecar image, then embedded art. It never indexes a
path on demand.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `books` | array | yes | `[ { "library_id": 1, "path": "Andy Weir/The Martian" } ]`, 1 to 60 entries |
| `size` | int | no | the longest side of the thumbnail in pixels: `96` (from 2.5.1, for a table row), `160`, `320` (default) or `640` |

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
    { "library_id": 1, "path": "Andy Weir/The Martian", "data": "data:image/jpeg;base64,/9j/4AAQSkZJRg…", "version": "3f9a1c07be" },
    { "library_id": 1, "path": "Andy Weir/Artemis", "data": "" }
  ]
}
```

- `data` is a JPEG thumbnail as a `data:` URL, scaled to fit within `size` x
  `size` (never scaled up; transparency is flattened onto white). It is `""`
  when the book has no art, the art can't be read or decoded, or no book is
  indexed at the path (an unknown `library_id` too).
- `version` - from 2.5.1, with every thumbnail (omitted when `data` is `""`):
  the [`cover_version`](#get-apiv1adminbooks) the book's admin row has **once
  this request's colour is recorded**. It can differ from the version on the row
  the client read: the cover may have been replaced since, or this is the book's
  first thumbnail, which moves its version to the art's own. A client that keeps
  thumbnails should file each under this `version`, never under the row's, so
  the next row it reads finds it.
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
| `400` | `books is required` (an empty list); `size must be one of [96 160 320 640]`; `invalid request` (malformed body or an unknown key); `code: "too_large"` for more than 60 books |
| `401` / `403` | anonymous / non-admin |
| `500` | `could not load covers` - a database failure (an unreadable image is never an error, it is `""`) |

### `POST /api/v1/admin/meta/covers`

Thumbnails of community cover images - how the console's match dialog shows
each candidate's `cover_url` (from
[`GET …/book/match`](#get-apiv1adminlibrariesidbookmatch)), which its CSP
can't load from the image's own host. Requires the `metadata`
[capability](#get-apiv1server). The server fetches each image as
[`PUT …/cover/community`](#put-apiv1adminlibrariesidcovercommunity) does
(public addresses only, at most 3 redirects, 15 seconds each).

| Body field | Type | Required | Notes |
|---|---|---|---|
| `urls` | string array | yes | 1 to 12 cover URLs |
| `size` | int | no | the longest side of the thumbnail in pixels: `96` (from 2.5.1), `160`, `320` (default) or `640` |

```json
{
  "urls": [
    "https://meta.audiosilo.app/covers/the-martian.jpg",
    "https://covers.openlibrary.org/b/isbn/9780553418026-L.jpg"
  ],
  "size": 160
}
```

Response `200`, one entry per requested URL, in request order:

```json
{ "covers": ["data:image/jpeg;base64,/9j/4AAQSkZJRg…", ""] }
```

- Each entry is a JPEG thumbnail as a `data:` URL, scaled as for
  [`POST /admin/covers`](#post-apiv1admincovers), or `""` when the image
  couldn't be fetched or decoded (a URL that isn't http(s), one too large, or
  not an image, too).
- Thumbnails are cached in the same server memory cache, keyed by URL and
  size, and shared with the player's
  [`/meta/cover`](#get-apiv1librariesidmetacover). An image that couldn't be
  decoded is cached as `""`; a fetch that failed is not, so the next request
  tries again (this batch ignores the minute `/meta/cover` waits after a failed
  fetch). Requests for the same thumbnail at once share one fetch.
- The whole batch has 20 seconds: an image that hasn't arrived by then is
  answered `""` rather than holding the rest back. Fetches are bounded across
  all requests.

| Status | Meaning |
|---|---|
| `400` | `urls is required` (an empty list); `size must be one of [96 160 320 640]`; `invalid request` (malformed body or an unknown key); `code: "too_large"` for more than 12 URLs |
| `401` / `403` | anonymous / non-admin |
| `404` | `code: "metadata_off"` - community metadata is turned off |

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
  `series_spellings`, `no_chapters`, `detailed_chapters`, `transcode`.
  `series_spellings` is a book whose main series another book of its library
  spells another way (the same series in a different case, accent, punctuation or
  spacing; see [`/series`](#get-apiv1librariesidseries)); every book of such a
  series is counted, and
  [`/admin/issues/series-spellings`](#get-apiv1adminissuesseries-spellings) lists
  them per series. `detailed_chapters` is a
  book whose last [community chapter check](../community-chapters.md) found
  finer community chapters that fit (`refine`) and whose chapter source no
  admin has chosen; the console's fix is a bulk edit with
  `chapter_source: "community"`. `split_discs` is a book split across disc
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
different libraries are usually deliberate and are grouped only with `across`).

| Query param | Type | Notes |
|---|---|---|
| `library_id` | int | one library; a non-positive or non-integer id is `400 invalid library_id` |
| `ignored` | `true` | return **only** the groups an admin said are different books (instead of the open ones) |
| `across` | `1` or `true` | also group copies in **different** libraries (2.4.0, the console's "Include other libraries"): each copy's row names its `library_id` and `library_name`, and with `library_id` the groups holding one of that library's books are kept, their copies from any library. Without it nothing changes; the Health `duplicate` count never uses it |
| `limit` | int | from 2.5.1: groups per page, at most 500 (a larger value is 500; one that is not a positive integer counts as absent). A page can end early (below), so page on `next_cursor`, not on the count |
| `cursor` | string | from 2.5.1: the previous page's `next_cursor`, passed back verbatim; a malformed one is `400 invalid cursor` |

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
  ],
  "total": 132,
  "next_cursor": "THV3aXMgQ2Fycm9sbC9BbGljZSdzIEFkdmVudHVyZXMgaW4gV29uZGVybGFuZAAx"
}
```

- `reason` - why the books were grouped, from the joins that formed the group.
  "Lengths match" means within a minute or 2%. For `same_book` an unknown length
  (no ffprobe) matches only another unknown one; for a shared ASIN or ISBN an
  unknown length is no evidence either way, so it never makes the lengths differ.

  | `reason` | Meaning |
  |---|---|
  | `id_length_differs` | The books were grouped by a shared ASIN or ISBN but their lengths don't match (the group's shortest and longest known lengths are compared): one may be matched to the wrong recording, or a copy is incomplete. Not plain copies: the console marks none as the one to keep. |
  | `same_files` | Every book in the group has the same audio (same fingerprint and size). From 2.5.1 a group that identical audio joins only in part takes the reason of what joins the rest (before, two identical copies were enough). |
  | `same_id` | Two of the books share an ASIN or ISBN and their lengths match. |
  | `same_book` | The books share author, title and narrator and their lengths match. |

  A group joined in several ways takes the first reason of this table that
  any of its joins gives: `id_length_differs` outranks even `same_files`, as
  such a group holds a different recording beside its identical copies.
  An older server says `same_book` for both identifier reasons; a client should
  read a `reason` it doesn't know like `same_book`.
- `books` - each copy as a [`GET /admin/books`](#get-apiv1adminbooks) row plus
  `listeners` (people with progress on it), the copy worth keeping **first**
  (better format, then a single file, then the higher bitrate, then more
  listeners). Under `id_length_differs` the order says nothing about which to
  keep.
- `ignored` - every copy in the group is ignored for `duplicate`. Without
  `?ignored=true` only groups with `ignored: false` are returned; with it, only
  the ignored ones. An ignored group becomes open again by itself when a new
  copy joins it.
- Groups are ordered by library and the kept copy's path, and paged by keyset
  on that order (from 2.5.1): `cursor` names the last group's kept copy, so a
  group that comes or goes between pages moves no other group across the
  boundary. The groups are found afresh for every page. A group whose kept copy
  changes between two page loads (a better copy arrived) can sort elsewhere, so
  a client paging through should show a group once even if a later page brings
  it again.
- `total` - how many groups there are in all, on every page (counted after the
  `ignored` filter, so every ignored group can be reached). `next_cursor` is
  omitted on the last page.
- With `limit`, a page also stops before a group that would take it past
  **300 copies**, unless the page is still empty. Each copy is a full admin row,
  so without this a few very large groups (identical audio across a big library)
  would make one answer megabytes. A single group of more than 300 copies is a
  page of its own. So a page can hold fewer than `limit` groups and still have a
  `next_cursor`.
- Without `limit` (an older console, or a script that doesn't page) the answer
  is the first 500 groups whole, with no bound on their copies, as before, plus
  `total` and, past 500, a `next_cursor`.

### `GET /api/v1/admin/issues/series-spellings`

The series a library's books spell more than one way, one entry per series and
library, from the same rule as the `series_spellings` count.

| Query param | Type | Notes |
|---|---|---|
| `library_id` | int | one library; a non-positive or non-integer id is `400 invalid library_id` |
| `ignored` | `true` | return the series with a book an admin ignored for `series_spellings` (instead of those with a book not ignored) |

```json
{
  "groups": [
    {
      "library_id": 5,
      "suggested": "He Who Fights with Monsters",
      "spellings": [
        { "name": "He Who Fights With Monsters", "books": 8 },
        { "name": "He Who Fights with Monsters", "books": 5 }
      ],
      "books": 13
    }
  ]
}
```

- `suggested` - the spelling to offer, by the rule
  [`/series`](#get-apiv1librariesidseries) names a series by (the spelling its
  matched books use most, else the one most of its books use, ties alphabetical),
  counted over this library's books whose main series it is. So it can differ from
  the name `/series` or [`/admin/series`](#get-apiv1adminseries) gives when other
  libraries or other-series lists spell it too. The console offers it first.
- `spellings` - every spelling the library's books give it as their main series,
  with its books, most books first (ties alphabetical). Ignored books' spellings
  are listed too, so a rename leaves none behind.
- `books` - all of the books in that library whose main series it is (a book that
  lists it only among its other series is not counted, and a rename doesn't touch
  it).
- A series can be in both views while some of its books are ignored and some not.
  At most 200 entries, ordered by `suggested` (case-insensitive), then library.

The console's fix is a [bulk edit](#post-apiv1adminbooksbulk) setting `series` on
the books of the other spellings, as an author merge is; ignoring a series is a
`series_spellings` ignore of every one of its books.

### `POST /api/v1/admin/issues/ignore` · `DELETE /api/v1/admin/issues/ignore`

`POST` stops listing books under one issue kind; `DELETE` lists them again (the
console's Undo and "Show again"). For duplicates, ignore every copy of a group
("They're different books").

```json
{ "kind": "no_cover", "books": [ { "library_id": 1, "path": "Sun Tzu/The Art of War" } ] }
```

- `kind` - one of the ten kinds above.
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
  "imported": false,
  "state": "playing",
  "chapter": "Chapter 12",
  "chapter_index": 12,
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
  `device_id` is `0`, `device_name` `""`, `client` `null` and `codec` `""`. It
  is also true for a session [imported](#admin-listening-imports) from another
  server. Neither kind counts in `clients` or `playback`.
- `imported` - written by a listening import: `backfilled` too, `device_id` `0`,
  `client.app` `"Audiobookshelf"` (with the ABS client's version and `ios`,
  `android`, `web` or `""` as the platform), `device_name` the device ABS
  recorded, `codec` `""` and `speed` `1`. The console labels sessions from this
  flag.
- `finished` - a save in the session marked the book finished.
- `state` - `playing` (a save within the last 60 seconds), `paused` (within 10
  minutes) or `ended`. A session can come back from `ended`: a late save whose
  position advanced by about the time that passed (a phone that kept playing
  without saving) continues it, up to 12 hours after its last save.
- `chapter`, `chapter_index` and `ip` are present on **live** sessions only.
  `chapter_index` is the 0-based place of the chapter at `position` and
  `chapter` its title, tidied the way the player tidies a filename-shaped one
  (the audio extension dropped, underscores as spaces, a trailing bitrate tag
  removed). `chapter` is omitted when the title names nothing (empty, a bare
  number such as `024`, a track or disc number such as `Track 01`; a title in
  another script always names something), so a client says "Chapter
  `chapter_index` + 1" instead. A numbered title such as `Chapter 10` or
  `Part 7` is kept as written: in a book that opens with a prologue the
  thirteenth chapter can be titled `Chapter 12`, as in the example. A book with
  a single chapter (the whole book) has neither field. `ip` is the device's
  newest address.

### `GET /api/v1/admin/sessions/live`

Who is listening now: the open sessions (a save within the last 10 minutes),
newest first, **one per device** - a device that moved on to another book shows
only the book it is on now. Each carries `ip`, and `chapter_index` and `chapter`
as described [above](#admin-activity) for a book with more than one
chapter.

```json
{ "sessions": [ { "id": 412, "username": "sam", "state": "playing", "…": "…" } ] }
```

`sessions` is `[]` when nobody is listening.

### `GET /api/v1/admin/sessions`

Sessions newest first by when they **started** (ties by id; open ones
included), a page at a time. Not by id: an
[imported](#admin-listening-imports) session is old but has a newer id than
every session recorded here.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `user_id` | int | - | one listener |
| `library_id` | int | - | one library |
| `path` | string | - | one book; needs `library_id` |
| `before` | int | - | the id of the previous page's last session: the sessions after it in this order (the next page) |
| `before_at` | string | - | that session's `started_at` (RFC3339), with `before`: the page continues from there even if the session is gone since |
| `limit` | int | `50` | ≤ 0 or > 200 falls back to 50 |

```json
{ "sessions": [ { "id": 412, "…": "…" } ], "next_before": 363 }
```

`next_before` is the id to pass as `before` for the next page, `null` on the
last page. Send the last session's `started_at` as `before_at` too (the console
does): the page then continues exactly where the last one ended, even if that
session is gone since (retention, an undone import). Without `before_at`, a gone
`before` session continues from the nearest session recorded here, which can
repeat a few imported ones. `400` `invalid user_id` / `invalid library_id` /
`invalid before` (not a positive integer) / `invalid before_at` (not a time, or
without `before`); `400` `path needs library_id`.

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

A field left out stays as it is, and an edit that sets nothing (`{}`) writes
nothing: it answers the current row, or `404 book_not_found` when there is none.
An exact (RFC 3339) date may be at most 5 minutes ahead of the server's clock; a
day-only date has a day of slack. When the person has no progress on the book
yet but it is indexed, the row is created (its start stamped now), but only if
**the person** can see the book: their own access (whole libraries and shares;
an admin target sees everything), not the access of the admin making the call.
Otherwise the edit is refused with `409` `no_access` and nothing is written.
Progress the person already has stays editable after their access is taken
away, so an admin can still tidy it. The write is
stamped with the server's time (to the sub-second) and a higher `version`, so it beats what a
device saved before it under last-write-wins, while a device still playing the
book overrides it on its next save.

Response `200`: `{ "progress": { … } }` - the object of
[`GET /admin/users/{id}/progress`](#get-apiv1adminusersidprogress).

| Status | Meaning |
|---|---|
| `400` | `invalid user_id`; `path is required`; `invalid request` (malformed body, an unknown key or an unparseable date); `those dates or that position don't fit this book` - a finish date on an unfinished book, a finish before the start, an exact date more than 5 minutes ahead of server time (a day-only date more than a day ahead), or a position outside the book |
| `404` | `user not found`; `library not found`; `code: "book_not_found"` - no progress at that path and no indexed book there |
| `409` | `code: "no_access"` - no progress at that path, and the person can't see the book; give them access first |

`409` rather than `403`, because the admin is allowed to make the call (a `403`
from an `/admin` route tells the console its own session lost the admin role).
A path with neither progress nor an indexed book is `404 book_not_found` whatever
the person's access.

## Admin: listening imports

The console's **Server > Settings > Import**: another server's listening
history copied into a person's own, so someone moving to AudioSilo keeps their
stats. v1 reads **Audiobookshelf** (ABS) only and is **admin only**: no
capability flag, no player route (the console ships inside the server). The
work is `internal/importer` (the ABS client, matching, planning, the background
fetch); the rows are `catalog/imports.go`; the handlers
(`api/handlers_import.go`) are transport only. What an applied import writes
is in the [data model](../data-model.md#listening-imports).

The flow: **connect** (check the address and token, list the ABS users) →
**start** (one import per mapped user, fetched in the background) → **review**
(poll until `review`; optionally change the cutoff, re-planned from the stored
fetch) → **apply** (one transaction) → optionally **undo**.

The ABS **token** is sent in the connect and start bodies only. It is held in
memory by the running fetch and is never stored, logged or returned; a fetch
the server stopped mid-way can't resume (it fails as `interrupted`). The ABS
client is read-only (`GET`s), checks `GET /status` says `audiobookshelf` (and
`isInit`) **before** sending the token anywhere, accepts only `http`/`https`
addresses without credentials, a query or a fragment, follows redirects only to
the same host (never `https` → `http`, at most 4 of them), caps every response size
and times out each request (3 minutes) and the whole fetch (30 minutes). Its
errors are fixed English sentences with a code; an ABS response body never
reaches a response or a log. There is no private-address block: ABS usually
lives on the LAN or a container network, and only admins reach these routes.

Import **statuses**: `fetching` → `review` (or `failed`) → `applying` →
`applied` → `undone` (by an undo, or by a later import replacing it). At
startup (`catalog.InterruptImports`) an import left `fetching` becomes `failed`
with `error_code` `interrupted`, and one left `applying` goes back to `review`
(the apply is one transaction, so nothing of it was written).

An **import** reads:

```json
{
  "id": 7,
  "user_id": 4,
  "username": "sam",
  "source": "abs",
  "source_url": "http://audiobookshelf",
  "source_user": "sam",
  "status": "review",
  "cutoff": "2026-03-14T18:22:05Z",
  "cutoff_utc_offset": 0,
  "created_at": "2026-10-08T09:12:44Z",
  "applied_at": null,
  "error": "",
  "error_code": "",
  "summary": {
    "items": 212,
    "matched": { "path": 180, "asin": 9, "isbn": 0, "title": 14 },
    "unmatched": 9,
    "sessions": 4310,
    "skipped_after_cutoff": 57,
    "listened": 2215440.5,
    "estimated": 86400,
    "progress": 198,
    "finished": 161,
    "bookmarks": 73,
    "first_listen": "2021-02-03T20:11:09Z",
    "last_listen": "2026-03-13T22:40:51Z"
  }
}
```

| Field | Meaning |
|---|---|
| `source_url` | the ABS address as normalised (`importer.ParseBaseURL`: trimmed, no trailing slash, a pasted web-app link under `/audiobookshelf/...` cut back to `/audiobookshelf`); never a credential |
| `source_user` | the ABS username, filled in when the fetch finishes (`""` before) |
| `cutoff` | sessions **starting at or after** it are skipped; RFC 3339 UTC to the second (rounded down); `null` = none. Always the resolved value, never `"auto"` |
| `cutoff_utc_offset` | the server's offset from UTC at the cutoff, in minutes (that date's, daylight saving included); `null` without a cutoff. A client shows and edits the cutoff in server time with it (a chosen day is the server's midnight), whatever its own zone |
| `created_at`, `applied_at` | RFC 3339 UTC; `applied_at` `null` until applied |
| `error`, `error_code` | `""` unless `failed`. `error` is a safe English sentence; `error_code` is `abs_unreachable` (also a timeout), `abs_unauthorized`, `not_abs`, `fetch_failed` or `interrupted` |
| `summary` | `null` while fetching or when the fetch failed; planned at review (recounted by a cutoff change) and rewritten at apply with what was written |

The fetched history is kept (gzipped, in `import_payloads`) only while the
import can still be reviewed: it is deleted once the import is applied, undone
or deleted.

`summary` counts: `items` the ABS books the user has any history for (a
session, progress or a bookmark); `matched` the matched ones by tier;
`unmatched` the rest; `sessions` the sessions imported (matched books, before
the cutoff, with listening; those already past the session retention are
written as daily totals, still counted here) and `skipped_after_cutoff` those
the cutoff drops; `listened` their seconds; `estimated` the seconds added as
estimates (none for a book ABS has as finished without one listening session);
`progress`
the progress rows created or moved on; `finished` the books given a finish
(or a missing finish date) from ABS; `bookmarks` the bookmarks added;
`first_listen` / `last_listen` the earliest and latest imported session start
(`null` without sessions).

`GET /admin/imports/{id}` adds the books that will be skipped, most listened
first, at most 500:

```json
{
  "id": 7,
  "…": "…",
  "unmatched_items": [
    { "title": "The Way of Kings", "author": "Brandon Sanderson",
      "listened": 163020.4, "sessions": 61, "reason": "split_discs" }
  ]
}
```

| `reason` | Meaning |
|---|---|
| `no_match` | nothing here matched |
| `contested` | two ABS items still in ABS (each with its own progress) resolved to the same book here, so both are skipped (one of them would be wrong), and so is any deleted item on that book |
| `no_access` | the only match is a book the target user can't access |
| `split_discs` | the ABS item is a folder this server splits into one book per disc folder (`books.split_parent`); the history can't be divided, so join the discs first |

**Matching** (`importer.matcher`), best evidence first, only among the books
the target user can access (a match only among the others is `no_access`):

1. **Path**: whole components compared from the end, Unicode-normalised (NFC),
   so the same relative path, or one a suffix of the other (the libraries
   rooted at different depths; the ABS side compares its absolute path, so the
   folders above its library folder count). A folder on one side matches the
   single file alone in that folder on the other. The closest unique candidate
   wins; a tie falls through.
2. **ASIN**, then **ISBN** (normalised; the first accessible book in library
   order).
3. **Title, author and series**: `pkg/match.Best` among the books of an author
   whose normalised name contains, or is contained in, the item's.

Path and title matches also need the lengths to agree (within 5% of the
longer, plus 2 minutes; an unknown length agrees with anything). An item ABS
deleted is known only from its newest session's metadata, so it skips the path
tier; it has no progress or bookmarks (any ABS still lists are dropped), so
deleted items that resolve to one book all match it, with at most one item
still in ABS, and their sessions merge. The apply matches again, so a book
added since the review is found.

**Cutoff** values, in a start or a `PATCH`: `"auto"` (each user's first
listening recorded here, `catalog.ListeningStart`: their earliest non-imported
session or non-estimated rolled-up day; `null` when they have none), `null`
(no cutoff), an RFC 3339 time, or a `YYYY-MM-DD` day (its start in server
time). Anything else is `400` `invalid_import` (`cutoff must be "auto", null
or a date`). The cutoff gates sessions and estimates only; progress and
bookmarks are merged whatever it is.

All routes are *Admin*. The import routes' error envelopes carry the codes
below (`invalid request`, `invalid user_id` and `invalid import id` are plain
`400`s without a code).

### `POST /api/v1/admin/imports/abs/users`

`{"url": "http://audiobookshelf", "token": "…"}`. Checks the address is ABS and
the token works, and lists its users: every user with an admin or root token or
API key (`GET /api/users`), or only the token's own with a user's token (ABS
answers that list `403`, so `GET /api/me`). Each carries the AudioSilo user
with the same username (any case), if any.

```json
{
  "version": "2.37.1",
  "users": [
    { "abs_id": "c1a5e0f2-…", "username": "sam", "type": "user", "suggested_user_id": 4 },
    { "abs_id": "root", "username": "root", "type": "root", "suggested_user_id": null }
  ]
}
```

| Status | Meaning |
|---|---|
| `200` | the server's version and its users |
| `400` | `invalid request`; `code: "invalid_url"` - not an absolute `http`/`https` URL, or it carries credentials, a query or a fragment; `code: "invalid_import"` - the token is empty, over 8 KiB or holds a line break or NUL (ABS is not contacted) |
| `502` | `code: "abs_unreachable"` (no answer, a timeout or a `5xx`), `"not_abs"` (`/status` didn't answer as an initialised Audiobookshelf), `"abs_unauthorized"` (the token was refused) or `"fetch_failed"` (an unreadable answer) |

Not audited (it changes nothing).

### `POST /api/v1/admin/imports/abs`

```json
{
  "url": "http://audiobookshelf",
  "token": "…",
  "users": [ { "abs_user_id": "c1a5e0f2-…", "user_id": 4 } ],
  "cutoff": "auto"
}
```

Records one import per mapping (`fetching`), all or none, and fetches them in
the background on the server's lifetime context: `/status`, every **book**
library's items the token can see (`GET /api/libraries`,
`/api/libraries/{id}/items?limit=0`), then per user their progress and
bookmarks (`GET /api/users/{id}`, or `/api/me` for a user's own token) and their
sessions (`/listening-sessions`, 200 a page). Podcast libraries, episodes and
sessions with no listening are left out. `cutoff` omitted means `"auto"`.
Answers `202` `{"imports": [...]}` (as above, `fetching`); poll
[`GET …/imports/{id}`](#get-apiv1adminimportsid) until the status leaves
`fetching`. Audited per import as `import.start` (target: the username;
`import`, `source`).

| Status | Meaning |
|---|---|
| `400` | `invalid request`; `code: "invalid_url"`; `code: "invalid_import"` - the token is missing (`the API token is required`) or over 8 KiB or holding a line break (`the API token is not valid`), no mappings or more than 100, a mapping without `abs_user_id`, the same `user_id` twice, an unknown `user_id`, or a bad `cutoff` |
| `409` | `code: "import_running"` - one of the users already has an import `fetching` or `applying` |

Nothing reaches ABS before the `202`: an unreachable server or a refused token
shows up as a `failed` import.

### `GET /api/v1/admin/imports`

`{"imports": [...]}`, newest first: everyone's, or one person's with
`?user_id=`. `400` `invalid user_id`.

### `GET /api/v1/admin/imports/{id}`

The import with its `unmatched_items`. `404` `code: "import_not_found"`.

### `PATCH /api/v1/admin/imports/{id}`

`{"cutoff": "auto" | null | "<RFC 3339>" | "YYYY-MM-DD"}` (required). Plans the
import again from the history it already fetched (nothing is fetched) and
answers `200` with the import and its `unmatched_items`. Not audited (nothing is
written outside the import).

| Status | Meaning |
|---|---|
| `400` | `invalid request` (no `cutoff`); `code: "invalid_import"` - a bad `cutoff` |
| `404` | `code: "import_not_found"` |
| `409` | `code: "import_not_ready"` - it isn't in `review` |

### `POST /api/v1/admin/imports/{id}/apply`

Applies a `review` import: it moves to `applying`, then one transaction undoes
the user's previous `applied` import from the same source (it becomes
`undone`, so a re-import never double counts), matches and plans again against
the user's state, writes it (sessions, a `listening_history` span per session,
estimates, progress and bookmarks), and marks it `applied`. A session already
older than the session retention (`activity.session_days` as set when the
apply runs) is written as the `listening_daily` totals the daily prune would
make of it rather than as a session, so it shows in the stats and history but
not in `GET /admin/sessions`. The request's cancellation
doesn't stop it. A failure puts it back in `review`. Answers `200` with the
import (`applied`, `summary` as written). Audited as `import.apply` (`import`,
`sessions`, `listened`).

| Status | Meaning |
|---|---|
| `404` | `code: "import_not_found"` |
| `409` | `code: "import_not_ready"` - it isn't in `review` |

### `POST /api/v1/admin/imports/{id}/undo`

Takes an applied import back out: its sessions, rolled-up days, estimates,
history spans and bookmarks are deleted (by `import_id`; a bookmark the person
edited or labelled since is kept and becomes theirs), and each progress row it
changed is restored to what it was before, unless it changed since (a player's
save or an edit: then it stays). Answers `200` with the import (`undone`). Audited as
`import.undo` (`import`).

| Status | Meaning |
|---|---|
| `404` | `code: "import_not_found"` |
| `409` | `code: "import_not_applied"` |

### `DELETE /api/v1/admin/imports/{id}`

Removes an import that isn't applied, with its fetched history if it still has one. A `fetching`
one can be deleted (its fetch then writes nothing). `204`. Not audited.

| Status | Meaning |
|---|---|
| `404` | `code: "import_not_found"` |
| `409` | `code: "import_applied"` - undo it first; `code: "import_not_ready"` - it is being applied |

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
    { "id": 1, "name": "Audiobooks", "kind": "books", "book_count": 1201 },
    { "id": 2, "name": "Kids", "kind": "books", "book_count": 83 }
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

Each `libraries[]` entry carries its `kind` (`books` or `podcasts`, from
2.4.0), so the dashboard's "Books per library" lists books libraries only.

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
  in the period), `listeners` (people who listened), `finished` (the distinct
  books with a finish date in the period: a book two people finished counts
  once) and `books` (the books listened to **or** finished in the period, so a
  book marked finished or imported with no listening recorded still counts, and
  `finished` is never more than `books`). `previous` is the same for the period
  of equal length just before `from`, for deltas.
- `estimated` - how many of `totals.listened`'s seconds are estimates: listening
  from before the server recorded sessions that the players' spans didn't cover
  (see [Listening from before sessions](../data-model.md#listening-from-before-sessions)),
  or where an [imported](#admin-listening-imports) history's progress went
  further than its sessions.
  Estimates count in `totals` and the `top_*` lists, never in `days` or
  `hour_weekday`. Backfilled sessions (from spans, or imported) count
  everywhere but `clients` and `playback`.
- `days` - one entry per day of the period, oldest first, zero days included;
  `by_user` lists each listener's seconds that day (`[]` on a quiet day).
- `hour_weekday` - listened seconds as 7 rows (weekday, **0 = Monday**) of 24
  hours. Raw sessions only: a rolled-up day has no hours.
- `top_books`, `top_authors`, `top_narrators`, `top_users` - up to 10 each, by
  listened time. Authors and narrators are the whole field value (unlike the
  Library's people lists, which split co-credits: shipped players match these
  names to books by the whole value); `books` counts distinct books.
  `top_users[].finished` counts that person's books finished in the period and
  `top_users[].books` the books they listened to or finished in it, counted
  like `totals`.
- `funnel` - people x books with a progress save in the period, by how far each
  got (the current position, so a restarted book counts where it is now; a
  finished book counts as 100%).
- `drop_offs` - up to 5 chapters where at least two people stopped the same
  book: unfinished progress with no save for 30 days. `chapter_index` is
  0-based; `chapter` is its title tidied as on a live session (`""` when it
  names nothing, where the console says "Chapter `chapter_index` + 1");
  `scan_error` says the book has a read problem the Health page lists.
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
    "lan_url": "http://192.168.1.20:8080",
    "update_check": true,
    "session_days": 400
  },
  "network": {
    "bind": "0.0.0.0:8080",
    "tls_mode": "selfsigned",
    "tls_home_http": true,
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
    "region": "uk",
    "mode": "remote",
    "upcoming": true,
    "available": true,
    "upcoming_status": {
      "last_run_at": "2026-10-30T04:12:00.000Z",
      "last_success_at": "2026-10-30T04:12:00.000Z",
      "next_run_at": "2026-10-31T04:40:12.000Z",
      "series": 14,
      "items": 9
    }
  },
  "demo": {
    "enabled": false,
    "library": "",
    "max_users": null,
    "max_users_default": 200,
    "idle_ttl": "24h"
  },
  "household": {
    "members_enabled": true,
    "max_members": 6,
    "max_members_default": 6,
    "max_members_min": 1,
    "max_members_max": 50
  },
  "backups": {
    "schedule": "daily:03:00",
    "keep": 7,
    "dir": ""
  },
  "modules": {
    "contributions": false
  },
  "locked": { "players.web_dir": "AUDIOSILO_WEB_DIR" },
  "restart_settings": [
    "network.bind", "network.tls_mode", "network.tls_home_http", "network.tls_hosts", "players.web_dir",
    "metadata.base_url", "metadata.mode", "demo.enabled", "demo.idle_ttl", "backups.dir"
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
| `general.lan_url` | the [home address](../configuration.md#home-address-lan_url); `""` = derived from a request on a home-network host |
| `players.web_dir` | read-only: changed only in `config.yaml` or `AUDIOSILO_WEB_DIR` |
| `players.web_player` | read-only: where `/web` is served from - `"embedded"` (baked into the build), `"dir"` (from `web_dir`) or `""` (not mounted) |
| `metadata.region` | the preferred Audible marketplace (`""` = none; see [Configuration](../configuration.md#community-metadata-metadata)) |
| `metadata.mode` | `"remote"` (ask `base_url` for each book) or `"mirror"` (keep a local copy and answer from it; see [Mirror mode](../configuration.md#mirror-mode-metadatamode-mirror)). A restart setting: a saved change is listed in `restart_pending`, and `GET /admin/system`'s `metadata.mode` keeps the running mode until the restart |
| `metadata.upcoming` | the [upcoming releases](#upcoming-releases) job's switch (config `upcoming.enabled`, default `true`). Applies at once: switched on (with metadata on) it runs soon when no run has succeeded for a day; switched off it stops a run in flight. The live `upcoming` [capability](#get-apiv1server) is `metadata` **and** this |
| `metadata.upcoming_status` | read-only (2.6.0): how the job's runs went, absent without a metadata service. `last_run_at`, `last_success_at` (both absent before the first run; equal when the last run worked), `last_error` (the last failed run's error, cleared by a success), `next_run_at`, `series` (local series matched to a community series) and `items` (what they lack in all). The console's Settings > Metadata words it |
| `metadata.available` | read-only: a metadata service exists (`base_url` was a valid absolute `http(s)` URL when the server started), so `enabled` can be turned on. The live `metadata` [capability](#get-apiv1server) is `enabled && available` |
| `demo.max_users` | `null` = the default cap (`max_users_default`); `0` = no limit |
| `demo.idle_ttl` | `""` = 24h |
| `household.members_enabled` | people may add [household members](#household-members) from the player (default `true`); off refuses new ones only (`403 feature_off`) |
| `household.max_members` | members per person, 1-50 (default 6); outside the range is `400 invalid_setting` (`field: "household.max_members"`) |
| `household.max_members_default`, `household.max_members_min`, `household.max_members_max` | read-only facts: the cap's default (6) and range (1 to 50), so the console names the range and checks a value before saving |
| `backups.schedule` | `""` (off), `daily:HH:MM` or `weekly:DAY:HH:MM` in the server's time zone; stored in canonical form (see [Backups](#admin-backups)) |
| `backups.keep` | how many scheduled backups are kept, 1-365 (manual and before-restore backups stay until deleted; the newest three before-upgrade backups are kept apart) |
| `backups.dir` | read-only: changed only in `config.yaml` or `AUDIOSILO_BACKUP_DIR`; `""` = `<data>/backups` (`GET /admin/backups`' `status.dir` has the folder in use) |
| `modules.<id>` | each [managed module's](../modules.md) toggle, by module id (`false` by default; config key `modules.<id>.enabled`, variable `AUDIOSILO_MODULES_<ID>_ENABLED`). Applies at once, with no restart. [`GET /admin/modules`](#get-apiv1adminmodules) says more about each |
| `locked` | setting id → why the console can't change it: the `AUDIOSILO_*` variable that set it, or `"launcher"` (a launcher override for `bind`, `tls.mode` or `public_url`) |
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
| `400` | `invalid_setting` | a value of the wrong type, one its normalizer refuses, a config that doesn't validate (e.g. `tls_mode: "autocert"` without `tls_hosts`, demo on without a library), a `demo.library` that names no library (`field: "demo.library"`), a change that would leave `config.yaml` invalid on its own because a value it needs comes only from an `AUDIOSILO_*` variable (the file keeps its own values for those; e.g. `demo.enabled: true` while the library is only in `AUDIOSILO_DEMO_LIBRARY`; the `error` names the variable), a `general.session_days` outside 30-3650, a `household.max_members` outside 1-50, or turning `metadata.enabled` on when no metadata service exists (`available` is false; `field: "metadata.enabled"` - set a valid `metadata.base_url` and restart first). Also JSON `null` for a setting that can't be unset (anything but `demo.max_users`, whose `null` means the default), refused with "enter a value" |
| `400` | `unknown_setting` | a section or name that isn't a setting (including the read-only extras such as `metadata.available`) |
| `400` | `setting_read_only` | `players.web_dir` or `backups.dir` |
| `409` | `setting_locked` | a setting an environment variable or the launcher sets (see `locked`) |
| `500` | | `config.yaml` couldn't be written; nothing changed |

Turning `metadata.enabled` on or off takes effect immediately across the
server: it gates `GET /libraries/{id}/meta` and the `metadata` capability, so
every connected player starts or stops showing the enriched-book section.
Turning `general.update_check` off stops the [update check](#get-apiv1adminupdate)
at once, and a new `backups.schedule` or `backups.keep` is handed to the backup
service at once (the next scheduled backup is counted again). Turning a
`modules.<id>` on or off starts or stops that module's background work at once (the
save doesn't wait for a stopping module), turns its routes on or off (`404
module_off` while off), gates the [Bridge jobs it owns](#post-apiv1adminbridgejobs)
and changes its capability flag. Every save is
recorded in the [audit log](#admin-audit-log) as `settings.update`, each
changed setting with its old and new value.

### `GET /api/v1/admin/modules`

*Admin.* Every [managed module](../modules.md), in the order the console lists them,
with where it stands. The console's Settings > Modules reads this (every 15 seconds,
and after each settings save).

```json
{
  "modules": [
    {
      "id": "contributions",
      "enabled": true,
      "active": false,
      "requires_bridge": "contribute",
      "bridge_state": "no_feature"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | the module's id: its capability flag on [`GET /server`](#get-apiv1server), its setting `modules.<id>` and the console's copy |
| `enabled` | the toggle, as the server runs now |
| `active` | the capability flag: `enabled` **and** the Bridge requirement met |
| `requires_bridge` | the Bridge feature the module needs (one of `bridge.features`); omitted for a module that needs no Bridge |
| `bridge_state` | omitted with `requires_bridge`. `offline`: no paired Bridge has sent a heartbeat in the last two minutes; `no_feature`: the online Bridge doesn't offer the feature (for `contribute`: it can't contribute, having no GitHub token GitHub accepts, whether its Accounts sign-in, `AUDIOSILO_BRIDGE_GITHUB_TOKEN` or `gh`); `ready`: it does |

The registry also includes `podcasts`, with `requires_bridge: "podcast"`;
both modules ship disabled. Setting it uses
`{"modules":{"podcasts":true}}` on `PATCH /admin/settings`.

`modules` is `[]` on a server with none. Whether a toggle is locked is the settings
envelope's `locked["modules.<id>"]`, not repeated here; a toggle is changed with
[`PATCH /admin/settings`](#patch-apiv1adminsettings) (`{"modules": {"contributions":
true}}`). A member's token gets `403`. An older server answers `404`.

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
    "health": { "reachable": true, "latency_ms": 84, "checked_at": "2026-10-04T09:40:02Z" },
    "mode": "remote"
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
| `version` | as in `GET /server`: stamped from the release tag (`"dev"` for a local build, `"dev-<short sha>"` for an `:edge` image) |
| `install` | `"docker"` (a container: `/.dockerenv` or `/run/.containerenv` exists), `"binary"` (a release build) or `"source"` (version `dev`); the console words its "how to update" on it |
| `started_at` | when the server started |
| `database` | `bytes`: pages in use × page size (the WAL isn't counted); `schema`: the newest applied migration |
| `tools` | ffmpeg then ffprobe. `path` `""` when off or not found; `version` from `-version` (cached per path; `""` if it didn't say); `source` `"local"` (configured, next to the binary or on `PATH`), `"downloaded"` (in `<data>/tools`), or `""` |
| `metadata` | `enabled` is the live switch; `available` and `base_url` are the service the server started with (a saved new `base_url` waits for a restart) |
| `metadata.health` | the service's `/healthz`: `reachable`, `latency_ms`, `checked_at` and `error` when it didn't answer. Cached for a minute, and asked **only while the lookup is on**; `null` while it's off. In mirror mode the request takes the same path as every lookup, so the local copy answers it once the copy is ready, and `base_url` until then |
| `metadata.mode` | the mode the server **runs** with, `"remote"` or `"mirror"` (a saved change to the setting waits for a restart) |
| `metadata.mirror` | mirror mode only (absent in remote mode, and when the server has no metadata service): the local copy's status, the object below |
| `tls` | the boot `tls.mode` and `tls.hosts`, and the certificates it serves, read from their files (never generated or requested here): the self-signed pair, or one per host from the autocert cache (`issued: false` until Let's Encrypt has issued it). Empty for mode `off`. `error` is set when a certificate file couldn't be read |
| `libraries[]` | each library's root, whether it answers (the same bounded probe as the scanner's), and `disk` (`total`, `free` to the server, in bytes) or `null` when the root doesn't answer or the OS doesn't say |
| `web_player` | as in the settings envelope |
| `update` | the [update status](#get-apiv1adminupdate) |
| `backups` | the backups' `status` as in [`GET /admin/backups`](#get-apiv1adminbackups) (folder, running, last attempt, latest backup, next scheduled one); `null` only for a server built without the backup service (tests), never one the launcher starts |

Nothing here reaches outside the server except the metadata health check (in
mirror mode, only while no local copy is ready). The slow parts (a tool's first
`-version`, the health check, the root probes) run side by side, each with its
own bound.

#### The local copy's status (`metadata.mirror`)

In [mirror mode](../configuration.md#mirror-mode-metadatamode-mirror) the
server keeps a local copy of the community metadata. Its status, here, in
[`GET /admin/meta/mirror`](#get-apiv1adminmetamirror) and in the answer of
[`POST /admin/meta/mirror/check`](#post-apiv1adminmetamirrorcheck):

```json
{
  "state": "downloading",
  "tag": "data-v2026.10.08-1a2b3c4-5d6e7f8",
  "built_at": "2026-10-08T05:14:03Z",
  "schema_version": 7,
  "size_bytes": 1755340800,
  "checked_at": "2026-10-08T08:00:12Z",
  "downloaded_at": "2026-10-08T08:01:40Z",
  "progress": { "done": 183500800, "total": 443547136 },
  "fallback": false
}
```

| Field | Meaning |
|---|---|
| `state` | `"empty"` (no copy and no failed attempt yet), `"downloading"` (a download is running, over a copy or not), `"opening"` (a copy is being opened, which takes seconds: the one on disk just after a start, with `fallback` true, or a finished download before it replaces the current copy, which answers meanwhile, so `fallback` stays false), `"ready"` (a usable copy answers) or `"error"` (no usable copy, and the last attempt failed). A failed update over a working copy stays `"ready"`, with `error` set |
| `tag` | the data release the copy came from (`data-vYYYY.MM.DD-<core7>-<community7>`); absent without a copy |
| `built_at` | when audiosilo-meta built the artifact |
| `schema_version` | the artifact's schema version |
| `schema_newer` | `true` when that is newer than this server's code understands (`query.MaxSchemaVersion`): the copy still answers, any query that breaks on it goes to `base_url`, and the server wants updating. Absent otherwise |
| `size_bytes` | the copy's size on disk |
| `checked_at` | the last check of the release list (successful or not); absent before the first |
| `next_check_at` | when the next check is due (the **Schedule** in [Mirror mode](../configuration.md#mirror-mode-metadatamode-mirror)); absent while a check is running |
| `downloaded_at` | when the copy was downloaded |
| `progress` | only while downloading: `done` and `total` compressed bytes (`total` `0` when the release declares no size) |
| `error` | the last failed check, as the server words it (e.g. `not enough disk space: need 2.5 GB, have 1.1 GB`); kept while a working copy answers, cleared by the next successful check |
| `fallback` | `true` while lookups go to `base_url` because no usable copy is loaded |

The timestamps and `tag`, `built_at`, `schema_version`, `size_bytes` and
`downloaded_at` are omitted when they have no value. `fallback` is always
present.

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
| `comparable` | `current` is a release version (`MAJOR.MINOR.PATCH`, with or without a `v`, optionally `-prerelease`); false for a local build (`dev`) or a development image (`dev-<short sha>`) |
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

### `GET /api/v1/admin/meta/mirror`

*Admin.* The local metadata copy's [status](#the-local-copys-status-metadatamirror)
on its own, without the rest of `GET /admin/system` (no tool versions, disk
probes or health check): what Health > System
[polls while the copy is busy](../web-ui.md#what-the-console-has-today).

| Status | Meaning |
|---|---|
| `200` | the copy's status |
| `404` `metadata_off` | community metadata is switched off |
| `409` `not_mirror_mode` | the server isn't keeping a local copy: it runs in remote mode (a saved `metadata.mode: mirror` waits for a restart), or the copy's folder couldn't be prepared |

### `POST /api/v1/admin/meta/mirror/check`

*Admin.* Asks the mirror to look for a newer copy now (the console's **Check
now**). It never waits for the check: it wakes the mirror and answers `202` with
the copy's [status](#the-local-copys-status-metadatamirror), whose
`next_check_at` is now (the check is due), and the check runs in the background
(a download, if there is a newer copy, shows in `state` and `progress`). While a
check is already running it does nothing more.
The check is the scheduled one: the conditional release-list request, then a
download only when the newest data release isn't the copy held (see
[Mirror mode](../configuration.md#mirror-mode-metadatamode-mirror)). Not
recorded in the audit log, since it changes nothing an admin chose.

| Status | Meaning |
|---|---|
| `202` | the check was asked for; body is the copy's status |
| `404` `metadata_off` | community metadata is switched off (checked first, in either mode) |
| `409` `not_mirror_mode` | the server isn't keeping a local copy (as above) |

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
| `backups[].kind` | `scheduled`, `manual`, `before-restore` (the copy of the database a restore replaced) or `before-upgrade` (the copy a start with pending migrations made first, from 2.5.0). A file put in the folder under another valid name reads as `manual`, dated by its modification time |
| `backups[].created_at` | from the name (UTC, to the second) |
| `status.running` | a backup is being made now |
| `status.last` | the newest attempt **since the server started** (`null` before one): `trigger` `scheduled` or `manual`, and on failure `ok: false` with `error` `disk_full`, `permission_denied` or `failed` (the cause is in the log) |
| `status.latest` | the newest backup in the folder that isn't a before-restore or before-upgrade copy, whenever it was made (`null` when there is none) |
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
`update_available`, `backup_failed`, `bridge_job_finished`, `bridge_job_failed`)
and the destination kinds.

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
| `area` | string | - | an action's first part (`user`, `member`, `invite`, `library`, `book`, `share`, `device`, `progress`, `issue`, `settings`, `backup`, `notify`, `import`); `[a-z_]{1,32}` |
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
| `actor_id`, `actor_name` | the admin (for a `member.*` event, the owner who did it in the player), copied when it happened (kept when the account is renamed or deleted); `null` and `""` for the server itself |
| `via` | `session` (the console or another signed-in app), `api` (a personal API key) or `system` |
| `action` | `<area>.<verb>`, like `user.update`; a console words the ones it knows and shows the code for the rest |
| `target` | what it was done to, as a person reads it: a username, a library's name, `<library>: <path>` for a book, a backup's file name, a destination's name; `""` when the action has none |
| `details` | the change's facts (which fields, from what to what, counts). Never a secret, never an IP address |

| Status | Meaning |
|---|---|
| `200` | the page |
| `400` | `actor_id` or `before` isn't a number, `area` doesn't match, or `q` is over 200 characters |

## Admin: support card

The admin console's Overview card that points at GitHub Sponsors
(`catalog/support.go`, `api/handlers_support.go`). Only the console asks: the
player never sees it, and there is no capability flag. Both routes are *Admin*:
`401` without a valid session or API key, `403` for a member's token. What the
console does with them is in
[The admin console](../web-ui.md#the-support-card).

### `GET /api/v1/admin/support`

*Admin.* Whether the card shows now:

```json
{ "show": true }
```

`show` is false after an "I've donated" (for good), while a "Not now" lasts,
and on a server that hasn't been in use long enough: it turns true 30 days
after the earliest non-demo account's `created_at`
(`catalog.SupportAfterDays`), or after 7 (`SupportMinDays`) once 10 books
(`SupportAfterFinished`) have been finished by non-demo accounts since then. A
server with no non-demo account (setup not finished) never shows it. The
answer is worked out on every request; nothing is cached.

### `POST /api/v1/admin/support`

*Admin.* An admin's answer, stored for the whole server (in `server_state`,
key `support_card`; see [Data model](../data-model.md#server-state)). Taken on
trust: nothing is checked, nothing leaves the server, and it unlocks nothing.

```json
{ "action": "snoozed" }
```

| `action` | Effect |
|---|---|
| `"donated"` | hides the card for good |
| `"snoozed"` | hides it for six months from now (`catalog.SupportSnoozeMonths`) |

```json
{ "show": false, "until": "2027-04-09T14:16:29Z" }
```

`show` is always false (the card is hidden either way, so nothing is
recomputed). `until` (RFC 3339) is when a snooze this request stored ends, and
is absent after `"donated"`, or when nothing changed: once a server holds a
donation, a later `"donated"` or `"snoozed"` stores nothing (a snooze never
turns "for good" back into a snooze) and answers `{ "show": false }`. The
console words its toast from `until`, not from the button pressed. A change is
recorded in the [audit log](#admin-audit-log) as `settings.support`, with
`choice` and, for a snooze, `returns_at`; a request that changed nothing is not.

| Status | Meaning |
|---|---|
| `200` | the answer was taken (or there was nothing to change) |
| `400` | `invalid request` (no body, not JSON, or a field other than `action`), or `action must be "donated" or "snoozed"` |
| `401` | no valid session or API key |
| `403` | not an admin |

## Admin: first-run setup

The admin console's "Set up your server" flow (FIRST-RUN-PLAN.md Phase F1;
`catalog/setup.go`, `library/preview.go`, `library/mounts.go`,
`api/handlers_admin_setup.go`). The flow writes every setting through the
ordinary admin routes ([settings](#admin-settings), [library
create and edit](#admin-libraries--shares)); these routes keep only its
progress and answer a read-only preview of a books folder. Only the console
asks: the player never sees them, and there is no capability flag. All three
are *Admin*: `401` without a valid session or API key, `403` for a non-admin.
What the console does with them is in
[The admin console](../web-ui.md#the-first-run-setup-flow). A server from
before the flow answers `404`.

### `GET /api/v1/admin/setup`

*Admin.* The flow's progress, and what its steps need to know about this
server and this request:

```json
{
  "state": {
    "finished": false,
    "dismissed": false,
    "steps": { "folder": "done", "naming": "skipped" }
  },
  "request": {
    "host": "nas:8080",
    "scheme": "http",
    "proxied": true,
    "peer": "172.18.0.5",
    "peer_trusted": false
  },
  "config_libraries": ["Audiobooks"],
  "mount_hints": ["/audiobooks", "/podcasts"]
}
```

- `state` is server-wide (the `server_state` key `setup_state`; see
  [Data model](../data-model.md#server-state)). The step ids, in the console's
  order, are `folder`, `naming`, `metadata`, `reach`, `abs`, `backups`,
  `phone` and `bridge`, each `"done"` or `"skipped"`; an absent id is a step
  not yet seen. A server with no row (a fresh one) answers `finished: false`,
  `dismissed: false`, `steps: {}`; migration `0053` stored an upgraded server
  as finished and dismissed.
- `request` is this request as the server saw it. The server never trusts
  `X-Forwarded-Host` or `X-Forwarded-Proto`, so `host` (the `Host` header) and
  `scheme` (`https` only for a TLS connection to the server itself) are the
  direct connection's; the console compares them with the address the browser
  uses. `proxied` is true when the request carried any forwarding header, and
  only then is `peer` sent: the address that connected (the proxy), for
  `network.trusted_proxies`. `peer_trusted` says whether that address is
  already trusted.
- `config_libraries` are the names of the libraries `config.yaml` or the
  environment declares (re-added at every start).
- `mount_hints` are folders mounted into the server that may hold books, read
  from `/proc/self/mountinfo` on Linux: folders that exist, not system paths
  (`/`, `/proc`, `/sys`, `/tmp`, `/dev`, `/run`, `/boot`, `/snap` and anything
  under them or under `/etc`, by whole path segments, so `/devices` is
  offered), not pseudo
  filesystems, not the server's data folder, sorted, at most 20. `[]` on other
  systems, when the table can't be read, and once the flow is finished, unless
  its folder step was skipped and can still be reopened from the Overview card
  (only that step offers them).

| Status | Meaning |
|---|---|
| `200` | the envelope |
| `401` / `403` | anonymous / non-admin |

### `PUT /api/v1/admin/setup`

*Admin.* Records the flow's progress. Every field is optional and only the
fields sent change; `steps` merges (an id it names takes the new outcome, the
others keep theirs), in one writer transaction.

```json
{ "finished": true, "steps": { "bridge": "skipped" } }
```

Answers `200` with the whole `state` as `GET` returns it:

```json
{ "finished": true, "dismissed": false, "steps": { "folder": "done", "bridge": "skipped" } }
```

Each request is recorded in the [audit log](#admin-audit-log) as
`settings.setup`, its details the fields it sent. Sending `dismissed: true`
hides the Overview's "Finish setting up" card for every admin.

| Status | Meaning |
|---|---|
| `200` | saved; the state |
| `400` | `invalid request` (no body, not JSON, or a field other than `finished`, `dismissed` and `steps`), or `invalid_setup_step` (a step id the flow doesn't have, or an outcome other than `"done"` / `"skipped"`; nothing is saved) |
| `401` / `403` | anonymous / non-admin |

### `POST /api/v1/admin/setup/preview`

*Admin.* What a books library at a folder would hold, and a sample of its
books named both ways (from the files' tags and from the folder names), so
the flow can suggest the library's `metadata_source` before the library
exists. Read-only: it writes nothing to the index, returns names and counts
only (never a file's contents) and is not audited.

```json
{ "root": "/audiobooks", "ignore_patterns": ["Extras/"] }
```

`ignore_patterns` is optional and checked as a library's skip rules are.

```json
{
  "root": "/audiobooks",
  "counts": { "audio_files": 812, "folder_books": 64, "file_books": 3, "capped": false },
  "same_root": null,
  "samples": [
    {
      "rel_path": "Arthur Conan Doyle/Sherlock Holmes/2 - The Sign of the Four",
      "tags": { "title": "The Sign of Four (Unabridged)", "author": "Doyle, Arthur Conan",
                "narrator": "David Clarke", "series": "Sherlock Holmes", "position": "2" },
      "path": { "title": "The Sign of the Four", "author": "Arthur Conan Doyle",
                "narrator": "David Clarke", "series": "Sherlock Holmes", "position": "2" },
      "abs": false
    }
  ],
  "blanks": { "tags": 4, "path": 1 },
  "suggested": "path"
}
```

- **The folder** is checked as the add-library folder picker checks it: an
  absolute path the server can open and list. `root` comes back cleaned.
- **The root** is checked against the other libraries as library create checks
  it, so a folder inside, or containing, a podcast library's folder is refused
  with `409 root_overlaps`. Two books libraries at one folder are allowed, so
  `same_root` names a library already at exactly this folder (a warning for
  the console to show), else `null`.
- **The walk** discovers books as a scan does (folder books and single-file
  books, the same detection, no folder overrides), bounded at 5,000 folders or
  10 seconds. `counts.capped` is true when the walk stopped early, so there are
  more than it counted; it says nothing else.
- **The samples** are up to 8 books spread evenly over the books found in path
  order, read four at a time as a scan reads names (the primary file's tags,
  the folder's Audiobookshelf `metadata.json`; no fingerprint, chapters or
  covers), all under the preview's overall limit of 15 seconds. A sample read
  still running then is ended and left out, so the answer has **fewer
  samples**; that never sets `capped`.
- `tags` and `path` are the names a library whose `metadata_source` is `"tags"`
  or `"path"` would show for the book (the same resolution the index uses, so
  the preview and the library never disagree): each side falls back to the
  other for what it leaves empty. `position` is a series position as text
  (`"2"`, `"1-3"` for a range). `abs` is true when the book's folder has a
  `metadata.json`, which goes over both.
- `blanks` counts, over the samples, the names each source leaves empty **on
  its own** (before any fallback): an empty title, author or series, and a
  missing position beside a series. The tags count a generic title ("Track
  01") as none; the narrator is never counted, since both modes take it from
  the tags.
- `suggested` is the source with fewer blanks, `"tags"` on a tie (also when
  there are no samples).

| Status | Meaning |
|---|---|
| `200` | the preview |
| `400` | `invalid request` (no body, not JSON, an unknown field), `root is required`, `path_not_absolute` (a relative `root`) or `invalid_pattern` (a skip rule the server refuses) |
| `401` / `403` | anonymous / non-admin |
| `404` | `folder_unreadable` - missing, not a folder, or unreadable by the server (the OS error is not echoed) |
| `409` | `root_overlaps` - overlaps a podcast library's folder |

## The Bridge

Capability `bridge`. The **Bridge** is an optional companion program that writes to
the libraries and runs the heavy jobs, so the server stays read-only
(`internal/bridge`, `auth/bridge.go`, `api/handlers_bridge.go`; the design is in
[The Bridge](../../bridge/index.md)). **The server never connects to it.** It keeps
the jobs admins ask for and the Bridge's last heartbeat, and the Bridge calls in.

There are two sets of routes:

- **The console's**, under `/admin/bridge`: *Admin*, like every admin route (an
  admin's API key works on them, except on `POST /admin/bridge/pair`, which mints a
  credential).
- **The Bridge's own**, under `/bridge`: *Bridge token*. A **bridge token** (a token
  of kind `bridge`, from [`POST /bridge/pair`](#post-apiv1bridgepair)) is accepted
  on these routes **only**, in the `Authorization: Bearer` header **only** (never
  as `?token=`), and only while the admin who paired it is still an enabled admin.
  Every other route refuses it with `401`, and these routes refuse every other
  credential (a session, an API key, a cast token) with `401`.

On the Bridge's routes **only a missing or refused token is `401`** (`missing bearer
token`, `invalid or expired token`): the Bridge reads it as "my token is refused",
stops calling in and tries again every 5 minutes. A failure to **check** the token
(the database) is `503 could not check the token, try again`, which the Bridge
simply retries. The heartbeat and the claim also check the token again inside their
own write, so a call authenticated just before a pairing or an unpair revoked its
token (a long poll above all) saves nothing and claims nothing: `401`. A bridge
token's calls never touch the token's `last_seen`: they are not its admin's
activity.

### `GET /api/v1/server`: the `bridge` capability and block

`capabilities.bridge` is `true` only while a Bridge is paired **and** its last
heartbeat is under two minutes old (the Bridge beats every 30 seconds). While it
is, a top-level `bridge` object sits beside `capabilities` (which stays all
booleans), **for a signed-in caller only** (Phase 2b): a session or an API key in
the `Authorization` header, of any role but a demo account's. The check records
nothing on the token (`auth.Peek`), and a missing or refused token is simply
anonymous, never a `401`. An anonymous, refused, demo or bridge token gets the
flags alone. The console and the player's admin-only generate action, the clients
that read the block, ask with their token.

```json
{
  "capabilities": { "…": true, "bridge": true },
  "bridge": { "version": "0.2.0", "features": ["bridge", "sidecars"] }
}
```

- `version` - the version the Bridge reported.
- `features` - the job families the Bridge runs that this server knows: the part of
  each known kind before its dot (`bridge.verify` is `bridge`, `sidecars.generate`,
  `sidecars.describe` and `sidecars.contribute` are `sidecars`, `chapters.detect`
  is `chapters`, `meta.correct` is `meta`, `readalong.align` is `readalong`, and
  the podcast kinds give `podcast`),
  plus `contribute` while the Bridge can
  file contributions (the last heartbeat's `setup.can_contribute`, else its
  `estimates.sidecars.can_contribute`), which the `contributions`
  [module](../modules.md) needs. Sorted, each once, always a list
  (`[]` for none), never `null`. A kind the Bridge advertises that the
  server doesn't know adds nothing.

The server keeps the last heartbeat it read for up to 5 seconds, so `GET /server`,
which every client calls often, rarely reads the database for it. A pairing or an
unpair made on this server drops it at once; a demoted admin's Bridge shows as
offline here within those 5 seconds.

With no Bridge online the flag is `false` and there is no `bridge` key, for any
caller; an older server has neither, and a server before Phase 2b sends the block
to every caller. A client never assumes the Bridge: it checks the flag **and**
the feature it needs.

### `GET /api/v1/admin/bridge`

*Admin.* The pairing, the last heartbeat and every server library with the Bridge's
mapping of it. The console's Settings > Bridge reads this.

```json
{
  "paired": true,
  "paired_at": "2026-10-15T12:31:07Z",
  "paired_by": { "id": 1, "username": "admin" },
  "pairing": null,
  "online": true,
  "heartbeat_at": "2026-10-15T12:40:37Z",
  "version": "0.1.0",
  "kinds": ["bridge.verify"],
  "features": ["bridge", "contribute"],
  "libraries": [
    {
      "id": 1, "name": "Audiobooks", "root": "/audiobooks",
      "mapping": {
        "library_id": 1, "mount_path": "/audiobooks", "mapped": true, "writable": true,
        "checked_path": "Andy Weir/Project Hail Mary", "error": ""
      }
    },
    {
      "id": 2, "name": "Kids", "root": "/kids",
      "mapping": {
        "library_id": 2, "mount_path": "/kids", "mapped": false, "writable": false,
        "checked_path": "", "error": "the library has no indexed book to compare against yet"
      }
    }
  ],
  "workers": [],
  "ui_url": "http://192.168.1.10:8091",
  "estimates": {
    "sidecars": {
      "asr_seconds_per_audio_hour": 900, "agent_usd_per_audio_hour": 1.6,
      "agent_usd_per_ebook": null, "samples": 3, "agent_backend": "claude",
      "agent_ready": true, "subscription": true, "can_contribute": true,
      "monthly_budget_usd": 100, "month_spent_usd": 12.3
    }
  },
  "setup": {
    "items": [
      { "id": "paired", "done": true, "required": true },
      { "id": "libraries", "done": false, "required": true, "detail": "1 of 2 libraries writable", "library_ids": [2] },
      { "id": "asr", "done": true, "required": true, "detail": "local" },
      { "id": "agent", "done": true, "required": true, "detail": "claude" },
      { "id": "budget", "done": false, "required": true, "detail": "$100 a month" },
      { "id": "github", "done": true, "required": false, "detail": "octocat" }
    ],
    "can_contribute": true,
    "github_login": "octocat"
  }
}
```

- `paired` - a bridge token is live: not revoked, and its admin still an enabled
  admin. `paired_at` and `paired_by` (`{id, username}`, `null` once that account is
  gone) only while it is.
- `pairing` - `{ "expires_at": "…" }` while a pairing code made in the console is
  waiting to be exchanged, else `null`. A code can wait while a Bridge is paired
  (pairing another one).
- `online` - the last heartbeat is under two minutes old (the same rule as the
  capability). `heartbeat_at`, `version`, `kinds`, `features`, `workers` and
  `ui_url` are the last heartbeat's, present only while paired and after the first
  heartbeat (`kinds`, `features`, `workers` are `[]` before; the others absent).
  `features` are worked out as on [`GET /server`](#get-apiv1server-the-bridge-capability-and-block),
  `contribute` included.
- `libraries` - every server library (`[]` with none), each with `mapping`: the
  Bridge's last check of it (the fields of the
  [heartbeat's](#put-apiv1bridgestatus) `libraries`), or `null` when it reported
  none for that library (or none at all yet).
- `workers` - the transcription workers the Bridge reports (`name`, `version`,
  `platform`, `last_seen`); always `[]` today.
- `ui_url` - the Bridge's own page on the local network, which the console links to
  (an absolute `http(s)` URL, checked when the heartbeat arrives).
- `estimates` - the last heartbeat's [costing figures](#put-apiv1bridgestatus),
  omitted when it sent none (or they were dropped as out of bounds). The console's
  agent, Paid by, This month and Estimates from rows read them.
- `setup` - Phase 2b: the last heartbeat's [setup checklist](#put-apiv1bridgestatus)
  as the server kept it (`items` in the Bridge's order, each `id`, `done`,
  `required`, `detail` when there is one and `library_ids` for the libraries
  still to fix; `can_contribute`; `github_login`, the GitHub account signed in on
  the Bridge's Accounts tab, absent while it files with a token from its
  environment or `gh`; admins only: `GET /server` never carries it). Omitted when
  the Bridge sent none (an older Bridge, or a server it hasn't been told accepts it
  yet) or the block didn't decode. The console's Setup card reads it.

### `POST /api/v1/admin/bridge/pair`

*Admin, a session only.* Makes a pairing code for a Bridge to exchange at
[`POST /bridge/pair`](#post-apiv1bridgepair). Response `201`:

```json
{
  "code": "7KQ2-M9XD-4TPA-W3HN",
  "expires_at": "2026-10-15T12:46:07Z",
  "server_url": "https://audiosilo.example.com"
}
```

The code is shown once (the server keeps only its hash) and lasts **15 minutes**.
It is case-insensitive and its hyphens are optional, like an invite code. Making a
code replaces one still waiting; a Bridge already paired keeps working until a new
one exchanges the code. `server_url` is the address to give the Bridge: the
server's [home address](#home-and-away-addresses) when it has one (its address on
the local network, plain `http` for a server with a self-signed certificate, which
a Bridge can't verify), else the address the server builds its links with (the
configured `public_url`, or the address the request came in on). Audited as
`bridge.code`.

| Status | Meaning |
|---|---|
| `201` | `{ code, expires_at, server_url }` |
| `401` | no valid session |
| `403` | not an admin, or `not available when authenticating with an API key` |

### `DELETE /api/v1/admin/bridge`

*Admin.* Unpairs the Bridge: revokes every bridge token and forgets the Bridge's
status and any code waiting. The Bridge's next call gets `401`. Its jobs stay: a
queued job waits for the next Bridge, and a job it was running is queued again when
its lease runs out (see [Leases](#leases-attempts-and-cancelling)). `204 No Content`.
Audited as `bridge.unpair`.

### The job object

Every job route, the console's and the Bridge's, answers jobs in one shape:

```json
{
  "id": 12,
  "kind": "bridge.verify",
  "library_id": 1,
  "path": null,
  "params": {},
  "state": "done",
  "progress": { "step": "writable", "message": "Checking the book's folder can be written" },
  "result": {
    "library_id": 1, "mount_path": "/audiobooks", "path": "Andy Weir/Project Hail Mary",
    "files": [
      { "path": "Andy Weir/Project Hail Mary/Project Hail Mary.m4b",
        "size": 912345678, "expected_size": 912345678, "ok": true }
    ],
    "writable": true, "elapsed_ms": 412
  },
  "error": "",
  "requested_by": { "id": 1, "username": "admin" },
  "priority": 0,
  "attempts": 1,
  "lease_until": null,
  "cancel_requested": false,
  "created_at": "2026-10-15T12:41:02Z",
  "updated_at": "2026-10-15T12:41:03Z",
  "claimed_at": "2026-10-15T12:41:02Z",
  "finished_at": "2026-10-15T12:41:03Z"
}
```

- `library_id` and `path` - what the job is about, path-keyed like every durable
  record: a book's indexed path, `null` for a job about a whole library (or about
  no library). A job follows its book when the scanner sees it move, and goes with
  its library.
- `params` - the kind's parameters as the server normalised them (`bridge.verify`
  stores a `hold_seconds` of 0 as `{}`; `sidecars.generate` stores every field with
  its default; `sidecars.describe`, `chapters.detect` and `readalong.align` store `{}`;
  `sidecars.contribute` its `dimensions` in order; `meta.correct` the checked
  changes with the server's `source`); `progress` and `result` - JSON objects the Bridge reported (`{}`
  until it does; the server stores them as they are: `sidecars.generate`'s shapes
  are in [Characters and recaps](../../bridge/generating.md#progress), `sidecars.describe`'s in
  [A description on its own](../../bridge/generating.md#a-description-on-its-own-sidecarsdescribe),
  `chapters.detect`'s in [Chapterless books](../../bridge/chapters.md#goal-chapters-and-the-chaptersdetect-job),
  `readalong.align`'s in [Read-along](../../bridge/readalong.md#at-done-the-50-refusal-and-the-write),
  `sidecars.contribute`'s and `meta.correct`'s results in [Contributions](../../bridge/contributions.md),
  their progress a `{step, message, done, total}` with the steps `sharing` and
  `done`, or `checking`, `filing` and `done`); `error` -
  why it failed or was parked (`""` otherwise).
- `state` - `queued`, `claimed`, `running`, `done`, `failed`, `needs_attention` or
  `cancelled` (see [Job states](#job-states)).
- `requested_by` - the admin who queued it, `null` once that account is deleted.
- `attempts` - how many times it has been claimed; `lease_until` - when the current
  claim's lease runs out (`null` when no claim holds it); `cancel_requested` - an
  admin asked the Bridge to stop it.
- Times are RFC 3339 UTC, whole seconds.

#### Job states

| State | Meaning |
|---|---|
| `queued` | waiting for the Bridge |
| `claimed` | the Bridge took it (leased) and hasn't reported it running yet |
| `running` | the Bridge reported it running (leased) |
| `needs_attention` | the Bridge parked it: it still holds it, with no lease |
| `done` · `failed` · `cancelled` | ended (`finished_at` set) |

A kind, a library and a path have at most **one open job** (queued, claimed,
running or needs attention) at a time: queuing the same again returns that job.

#### Leases, attempts and cancelling

A claim leases the job for **2 minutes**, and every report from the Bridge renews
the lease (the Bridge reports at least every 30 seconds while it works, every
10 seconds after a report that didn't get through). A lease
that runs out puts the job back in the queue, dropping the dead attempt's
`progress`, `result` and `error`, unless it was the **third** attempt (the job
fails, `error` "the Bridge stopped reporting on every attempt") or an admin had
asked to cancel it (it is cancelled); those two keep what was reported. A claim
waiting for a job is woken when a lease runs out, so a requeued job is picked up at
once. Leases are checked whenever a job
is claimed, reported on, cancelled or read, so a Bridge that died mid-job leaves
the job queued again (or ended) by the time anyone looks.

Cancelling a queued or parked job ends it at once. Cancelling a claimed or running
one sets `cancel_requested`, which the Bridge reads in the answer to its next
report and stops; if it never reports again, the job is cancelled when the lease
runs out.

### `GET /api/v1/admin/bridge/jobs`

*Admin.* Jobs, newest first.

| Param | Meaning |
|---|---|
| `library_id` | only this library's jobs (a positive integer, else `400 invalid library_id`) |
| `path` | only jobs about this book path |
| `state` | only jobs in this state |
| `kind` | only this job kind; without it `podcast.poll` is omitted (`kind=podcast.poll` explicitly includes routine checks); `podcast.fetch` and `podcast.retain` are listed by default |
| `before` | the previous page's `next_before` (a positive integer, else `400 invalid before`) |
| `limit` | page size, 1 to 200 (anything outside that: 50) |

```json
{ "jobs": [ { "id": 12, "kind": "bridge.verify", "…": "…" } ], "next_before": 12 }
```

`jobs` is `[]` when there are none. `next_before` is present only when there is
another page (the server reads one row past the page to know): pass it as
`before`.

Subscribe job params, errors and results are redacted in listings and detail
reads; a private feed URL appears only in the Bridge's claim answer. See
[Podcast jobs](../../bridge/podcasts.md#job-wire-format).

### `POST /api/v1/admin/bridge/jobs`

*Admin.* Queues a job. `podcast.subscribe`, `podcast.poll`, `podcast.fetch` and
`podcast.retain` are server-internal and refused here with `400` (no code): use
listener follow/check, the admin storage routes or the scheduler instead.
Book-writing kinds on a podcast library return `409 not_book_library`;
podcast kinds are only ever queued for a podcast library (follow and check answer
`409 not_podcast_library` for a books library before queuing).

```json
{ "kind": "bridge.verify", "library_id": 1, "path": "Andy Weir/Project Hail Mary", "params": { "hold_seconds": 0 } }
```

| Field | Meaning |
|---|---|
| `kind` | the job kind: one the server knows **and** the paired Bridge advertised in its last heartbeat (kinds are allow-listed twice) |
| `library_id` | the library, when the kind is about one (every kind needs it) |
| `path` | an indexed book in that library (optional or required, per kind); the job is about the book's own path |
| `params` | the kind's parameters, checked per kind (unknown fields refused), at most 16 KiB as sent (`meta.correct`: 128 KiB) |

The request body is at most 132 KiB (the largest params cap,
`bridge.MaxParamsBytes`, plus 4 KiB); a longer one is `400 invalid request` before
it is read whole.

The kinds:

- **`bridge.verify`** needs `library_id`, takes an optional book `path` (without
  one the Bridge checks the library's sample book, the one its mapping check uses:
  see [`GET /bridge/libraries/{id}/book`](#get-apiv1bridgelibrariesidbook)), and
  `params` `{ "hold_seconds": 0-600 }` (optional; 0 is stored as `{}`), how long
  the Bridge waits before it finishes, so a cancel or a stopped Bridge can be
  tried mid-job. What it does and reports is in
  [Pairing and jobs](../../bridge/pairing-and-jobs.md#the-proof-job-bridgeverify).
- **`sidecars.generate`** (Phase 1a) generates a book's characters and recaps and
  writes them into its `.audiosilo/` folder. It needs `library_id` **and** a book
  `path`, and takes `params`
  `{ "source": "auto" | "audio" | "ebook", "contribute": "local" | "issue", "work_id": "…" }`,
  all optional (stored as `{"source": "auto", "contribute": "local"}` plus a
  `work_id` when given: at most 200 bytes, no control characters). It **writes**
  into the library, so it is queued only for a library the last heartbeat reports
  mapped and writable, and `contribute: "issue"` only while the Bridge can
  contribute (the heartbeat's `setup.can_contribute`, else
  `estimates.sidecars.can_contribute`). See
  [Characters and recaps](../../bridge/generating.md). Queuing it while a
  `sidecars.describe` job is open for the book cancels that job (at once when it
  is queued or parked, else by asking the Bridge), since this run writes the
  description too. It is refused while a `chapters.detect` job is queued or
  working for the book (`detect_open`: cancelling it would throw its
  transcription away, and a generate job queued after it reuses that), and cancels
  a **parked** one in the same way, since this run finds the chapters itself. Since
  Phase 2b it is likewise refused while a `sidecars.contribute` job is queued or
  working for the book (`contribute_open`: it would replace what is being filed),
  and cancels a parked one, or a queued one held while the `contributions` module
  is off (no claim hands it out).
- **`sidecars.describe`** (Phase 1c) writes a book's own-words description from
  the notes the Bridge kept when it generated the book (no new speech
  recognition) into its `.audiosilo/` folder. It needs `library_id` **and** a book
  `path`, and takes `params` `{}` or none (any field is refused; stored as `{}`).
  It writes, so the same mapped-and-writable rule applies, and it is refused
  while a `sidecars.generate` job (`generate_open`) or a `chapters.detect` job
  (`detect_open`: both rewrite the book's `bridge.json`) is open for the book. See
  [A description on its own](../../bridge/generating.md#a-description-on-its-own-sidecarsdescribe).
- **`chapters.detect`** (Phase 1d) finds the chapters of a book with no chapter
  markers in its narration (speech recognition and detection only, no agent) and
  writes them into its `.audiosilo/` folder as
  [`chapters.json`](../../bridge/attachments.md#chaptersjson), which the server
  then uses as the book's chapters. It needs `library_id` **and** a book `path`,
  and takes `params` `{}` or none (any field is refused; stored as `{}`). It
  writes, so the same mapped-and-writable rule applies. It is refused while a
  `sidecars.generate` job is open for the book (`generate_open`: that run finds
  them itself), while a `sidecars.describe` job is (`describe_open`), and for a
  book whose chapter source an admin chose (`chapters_chosen`: the list would
  never be used). See [Chapterless books](../../bridge/chapters.md).
- **`readalong.align`** (Phase 3c) makes a book's read-along map: the Bridge
  reuses the transcript it kept for the book (else transcribes it; no agent),
  lines the words up with the book's ebook, and writes
  [`readalong.json`](../../bridge/attachments.md#readalongjson) into its
  `.audiosilo/` folder. It needs `library_id` **and** a book `path` in a books
  library, and takes `params` `{}` or none (any field is refused; stored as `{}`).
  It writes, so the same mapped-and-writable rule applies. It is refused for a
  book the index holds no ebook for (`no_ebook`, checked before the queue), and
  while a `sidecars.generate` (`generate_open`) or `chapters.detect`
  (`detect_open`) job is open for the book, parked ones included. A new
  `sidecars.generate` job is refused while a read-along job is queued or working
  (`readalong_open`) and cancels a parked one; a new `chapters.detect` job is
  refused while one is open. Re-aligning a book with a ready map is allowed. Its
  progress is `chapters.detect`'s shape (`stage` including `readalong_aligning`);
  its result is `{library_id, path, file, coverage: {text, audio}, sections, spans,
  audio_gaps, heal_windows, transcribed, ebook_sha256}`. A map under 50% text
  coverage fails the job and writes nothing. See [Read-along](../../bridge/readalong.md).
- **`sidecars.contribute`** (Phase 2b) files the characters and recaps the Bridge
  generated for the book earlier on this server and kept (its own copy, not the
  book's `.audiosilo/` files), to the community metadata
  database as intake issues ("Share with the community"). It needs `library_id`
  **and** a book `path`, and takes `params` `{ "work_id": "…", "dimensions":
  ["characters", "recaps"] }`, both optional (`dimensions` from those two, each
  once, stored in that order; absent or empty means both; `work_id` as for
  `sidecars.generate`). It **writes nothing** into the library, so it works on any
  library. It is refused while a `sidecars.generate` job is open for the book
  (`generate_open`). Result: `{library_id, path, work_id, contributed, covered}`,
  where `contributed` is `{characters?, recaps?}` (the issue URLs) and `covered`
  lists the dimensions the community already had. See [Contributions](../../bridge/contributions.md#sharing-later-sidecarscontribute).
- **`meta.correct`** (Phase 2b) files an admin's edits of the book's details to the
  community metadata database as one correction-batch issue ("Suggest
  corrections"). It needs `library_id` **and** a book `path`, and takes `params`
  `{ "work_id": "…", "recording_id": "…", "asin": "…", "isbn": "…", "region": "…",
  "changes": [{ "field": "title", "current": "…", "corrected": "…" }], "evidence":
  "…" }` (`work_id`, `changes` and `evidence` required): 1 to 25 changes, each
  `field` once from `title`, `author`, `narrator`, `series`, `series_index`,
  `more_series`, `published`, `isbn`; each value trimmed, one line, at most 500
  characters, no control characters, `corrected` (as the community reads it,
  below) set and different from `current` as sent; `evidence` (CRLF read as LF,
  trimmed; line breaks and tabs kept) at most 2000 characters both as written and
  as the issue carries it (a line starting with `#` loses its indent and counts
  one more), not `_No response_` (the community reads that as a blank field) nor
  reading as nothing; the lengths count the text as written, not decoded;
  `recording_id` a community slug; and the params within this kind's 128 KiB cap
  (`params too large`). The values and the evidence are checked as the community
  reads them, each HTML character reference ending in `;` decoded (one naming
  whitespace reads as a space): none may hold a control character, the
  evidence's line breaks and tabs aside (`… holds a control character`), or a
  bidirectional embedding, override or isolate control, `&#x202E;` included
  (`… holds a bidirectional override character`; U+202A-U+202E, U+2066-U+2069;
  the joiners and marks right-to-left scripts need are allowed). Each change must
  be an **edit made on this server**: the field's source is `edited` on the book
  and `corrected` is its value now, else `400 not_edited`. The server stores the
  book's own spelling of each corrected value and stamps `source` as
  `audiosilo-server/<version>`, whatever was sent (a sent `source` must still be
  at most 128 bytes, with no control characters). It writes nothing into the
  library. Result: `{issue_url, issue_number, changes, auto: [fields], maintainer:
  [fields]}`. See [Contributions](../../bridge/contributions.md#corrections-metacorrect).

`sidecars.contribute`, `meta.correct` and a `sidecars.generate` job with
`contribute: "issue"` belong to the `contributions` [module](../../bridge/pairing-and-jobs.md#jobs-of-a-managed-module):
while it is off they are `404 module_off` (checked first, before the book), and one
already queued is held (the Bridge isn't given it) until the module is on again,
though a new `sidecars.generate` job for the book cancels a held
`sidecars.contribute` one;
while it is on they are `409 cannot_contribute` unless the Bridge can contribute.

A job being cancelled (`cancel_requested`) refuses nothing (it ends without
writing). Which open kind refuses, or gives way to, which is one table:
[Kinds are allow-listed twice](../../bridge/pairing-and-jobs.md#kinds-are-allow-listed-twice).

The Bridge may be offline: the job waits for it. Response `201` with the new job,
or `200` with the open job already there for that kind, library and path (no
second job is made). That open job may be one still stopping after a cancel
(`cancel_requested: true`): nothing new can be queued for it until it ends, and
the console says so. A new job is audited as `bridge.job`.

| Status | Meaning |
|---|---|
| `201` | the job, queued |
| `200` | the open job of that kind for that library and path |
| `400` | `invalid request` (not JSON, an unknown field, a body past the bound above); or a check of the kind, each message starting `invalid: `: `unknown kind "…"`, `library_id is required`, `this kind takes no library or path`, `this kind takes no path`, `path is required`, `params too large`, or a params error (`hold_seconds must be 0-600`, `source must be auto, audio or ebook`, `contribute must be local or issue`, a `work_id` too long or with a control character, an unknown field, a `dimensions` entry that isn't `characters` or `recaps` or is repeated, a `meta.correct` params error (the kind's checks above): no `work_id` or `evidence` (or evidence reading as nothing), a field that can't be corrected or is listed twice, a corrected value that is empty or reads the same as the current one, a change or the evidence past its bounds (counted as written), a value or the evidence holding a control character (the evidence's line breaks and tabs aside) or a bidirectional override character, written or as a character reference that reads as one, a `recording_id` that isn't a community slug, an identifier too long); `code: "not_edited"` with `field` - a `meta.correct` change of a field that isn't an edit made on this server, or whose corrected value isn't the book's value now |
| `404` | `library not found`; `code: "book_not_found"` - the path is not an indexed book; `code: "module_off"` - a job of the `contributions` module (`sidecars.contribute`, `meta.correct`, `sidecars.generate` with `contribute: "issue"`) while the module is off |
| `409` | `code: "kind_unavailable"` - no Bridge has reported, or the paired one doesn't run that kind (a Bridge from before Phase 1c doesn't run `sidecars.describe`, one from before Phase 1d `chapters.detect`, one from before Phase 2b `sidecars.contribute` or `meta.correct`, one from before Phase 3c `readalong.align`); `code: "library_not_writable"` - a kind that writes, for a library the last heartbeat doesn't report mapped and writable; `code: "cannot_contribute"` - `sidecars.generate` with `contribute: "issue"`, `sidecars.contribute` or `meta.correct` while the Bridge can't contribute; `code: "generate_open"` - `sidecars.describe`, `chapters.detect`, `sidecars.contribute` or `readalong.align` while a `sidecars.generate` job is open for the book ("a generate job is still open for this book; queue this once it has finished"); `code: "contribute_open"` - `sidecars.generate` while a `sidecars.contribute` job is queued or working for the book (a parked one, or a queued one held while the `contributions` module is off, is cancelled instead); `code: "detect_open"` - `sidecars.generate` while a `chapters.detect` job is queued or working for the book, or `sidecars.describe` or `readalong.align` while one is open ("a chapter detection job is still open for this book; queue this once it has finished"); `code: "describe_open"` - `chapters.detect` while a `sidecars.describe` job is open for the book; `code: "chapters_chosen"` - `chapters.detect` for a book whose chapter source an admin chose (`files` or `community`), checked before the queue ("an admin chose this book's chapter source, so chapters found in the narration would never be used; set it back to automatic first"); `code: "readalong_open"` - `sidecars.generate` while a `readalong.align` job is queued or working for the book (a parked one is cancelled instead), or `chapters.detect` while one is open ("a read-along job is still open for this book; queue this once it has finished"); `code: "no_ebook"` - `readalong.align` for a book the index holds no ebook for, checked before the queue ("this book has no ebook to align with its narration"). `library_not_writable`, `cannot_contribute` and the open-job codes are checked after the dedupe: an open job of the same kind for the book is still returned (`200`) |

### `GET /api/v1/admin/bridge/jobs/{id}`

*Admin.* One job (the [job object](#the-job-object)). `400 invalid job id`; `404 job
not found`.

### `POST /api/v1/admin/bridge/jobs/{id}/cancel`

*Admin.* Cancels a job: at once when it is queued or parked, else by asking the
Bridge (`cancel_requested`; see [Leases](#leases-attempts-and-cancelling)). Answers
`200` with the job as it is now. Audited as `bridge.cancel`.

| Status | Meaning |
|---|---|
| `200` | the job (`cancelled`, or still running with `cancel_requested: true`) |
| `400` | `invalid job id` |
| `404` | `job not found` |
| `409` | `code: "finished"` - the job already ended |

### `GET /api/v1/admin/bridge/estimate`

*Admin* (an API key works). What queueing `sidecars.generate` for a book would
take: the confirmation dialogs (the console's and the player's) read it, and the
console's book card and series batch read its brief form (the card's
**Write a description** reads its `can_describe` and `has.*.description` too).
How each figure is worked out is in
[Characters and recaps](../../bridge/generating.md#the-estimate).

| Param | Meaning |
|---|---|
| `library_id`, `path` | the book (required; an indexed book's path) |
| `kind` | `sidecars.generate` (the default) or, Phase 3c, `readalong.align` (its own answer, below) |
| `brief` | `1`: no look into the book's folder for an ebook (`source` is `audio`, no `ebook`) and no scan of the series (`earlier` is `[]`): the cheap answer for a label or a batch |

```json
{
  "kind": "sidecars.generate",
  "library_id": 1,
  "path": "Brandon Sanderson/The Stormlight Archive/Words of Radiance",
  "source": "audio",
  "asr_hours": 12.06,
  "agent_cost_usd": 77.16,
  "subscription": true,
  "agent_ready": true,
  "can_contribute": false,
  "figures": true,
  "duration_seconds": 173621,
  "writable": true,
  "can_describe": true,
  "has": {
    "community": { "characters": false, "recaps": false, "description": false },
    "local": { "characters": false, "recaps": false, "description": false }
  },
  "earlier": [
    { "library_id": 1, "path": "Brandon Sanderson/The Stormlight Archive/The Way of Kings",
      "title": "The Way of Kings", "series_index": "1", "asr_hours": 11.43, "agent_cost_usd": 73.15 }
  ]
}
```

| Field | Meaning |
|---|---|
| `source` | `ebook` when the book has an ebook the Bridge would read (exactly one regular, non-hidden `.epub` directly in a folder book's folder; `<stem>.epub` beside a single-file book), else `audio` |
| `ebook` | that `.epub`, library-relative; omitted for audio |
| `duration_seconds` | the book's length (`0` when unknown) |
| `asr_hours` | expected transcription wall time: `duration_seconds / 3600 * asr_seconds_per_audio_hour / 3600`, rounded to hundredths; `0` for an ebook, without figures, or for audio of unknown length |
| `agent_cost_usd` | expected agent spend, rounded to cents: the length times `agent_usd_per_audio_hour`, or `agent_usd_per_ebook`; `null` when the Bridge has no history for that source yet (or sent no figures): no estimate, never a free run |
| `subscription`, `agent_ready`, `can_contribute` | the Bridge's: its agent credential is a subscription (the cost is notional), the agent container is ready, and it can offer results to the community (`contribute: "issue"`; the heartbeat's `setup.can_contribute`, else its estimates'). `can_contribute` is `false` while the `contributions` module is off |
| `figures` | the last heartbeat carried estimates. Without them every field above but `can_contribute` is a default, so a false `agent_ready` means "not known yet" |
| `writable` | the Bridge last reported the library mapped and writable (else queueing is `409 library_not_writable`) |
| `can_describe` | the Bridge is online and runs `sidecars.describe` (Phase 1c; a 1a or 1b Bridge doesn't). With `brief=1` too |
| `has.community` | what the book's community work carries (metadata on and the book matched; `false` otherwise): `characters`, `recaps` (a recap list: a whole-book summary alone doesn't count, since generated recaps still fill the list beside it) and `description`, which is its `community_description` **or** its core `description` (the player shows either before a generated one, so a generated description would never be read) |
| `has.community_unknown` | `true` when the community couldn't be asked right now, so `has.community` is no answer (never read it as "none"); omitted otherwise |
| `has.local` | what the book's indexed [`.audiosilo/` files](../../bridge/attachments.md) carry: `characters`, `recaps` and `description` |
| `earlier` | the books of the same library before this one in its first numbered series (any spelling), with no recaps generated here and, metadata on, none in the community (a book the community couldn't be asked about is left out): the nearest 10, in reading order, each with its own `asr_hours` and `agent_cost_usd` (costed from its audio). `[]` for none, and with `brief=1` |
| `open_job` | the book's open `sidecars.generate` [job](#the-job-object), else (Phase 1d) the open job of another kind that refuses a generate job now: a queued or working `chapters.detect` job, (Phase 2b) `sidecars.contribute` job (not a queued one held while the `contributions` module is off) or (Phase 3c) `readalong.align` job, whose `kind` says so; omitted when there is neither |

| Status | Meaning |
|---|---|
| `200` | the estimate |
| `400` | `library_id and path are required`; `no estimate for that kind` |
| `401` / `403` | no admin credential |
| `404` | `library not found`; `code: "book_not_found"` - no indexed book at that path |
| `409` | `code: "kind_unavailable"` - no Bridge has reported, or it doesn't offer the kind |

With `kind=readalong.align` (Phase 3c) the answer is the read-along confirmation's:

```json
{
  "kind": "readalong.align",
  "asr_hours": 2.98,
  "figures": true,
  "writable": true,
  "ebook": { "path": "Jack London/The Call of the Wild/The Call of the Wild.epub", "size": 412345 },
  "readalong": { "state": "ready", "coverage": 0.996, "generated_at": "2026-11-02T10:11:12Z" }
}
```

| Field | Meaning |
|---|---|
| `asr_hours` | one transcription of the book's whole audio at the Bridge's `asr_seconds_per_audio_hour`, as for generate (a loop-repair round and the heal's windows can add to it). Much less when the Bridge still has the book's transcript (a re-align takes minutes); never an agent |
| `figures`, `writable` | as above |
| `ebook` | the book's ebook (`{path, size}`), `null` when it has none: queueing is then `409 no_ebook` |
| `readalong` | the book's map now, as [`Book.readalong`](#get-apiv1librariesiditem); `null` for none |
| `open_job` | the book's open `readalong.align` job, else the open `sidecars.generate` or `chapters.detect` job it would wait for; omitted when there is none |

### `POST /api/v1/bridge/pair`

*Public, rate limited.* The Bridge trades a pairing code from
[`POST /admin/bridge/pair`](#post-apiv1adminbridgepair) for its token.

```json
{ "code": "7KQ2-M9XD-4TPA-W3HN" }
```

Response `201`:

```json
{ "token": "b8Hq…", "server_id": "kx8Qz1c7m2Vw0aB3dEfGh", "server_name": "AudioSilo" }
```

In one transaction the server checks the code (its hash, its expiry, and that the
admin who made it is still an enabled admin), uses it up, revokes every earlier
bridge token and clears the last Bridge's status: **one Bridge per server**, and a
new one starts from nothing. The token belongs to that admin and is shown once.
Failures count against the same per-address limit as
[`POST /auth/redeem`](#post-apiv1authredeem) (10 failed attempts in 15 minutes); a
success resets it. Audited as `bridge.paired`, by the server itself since no admin
made the request (with no details: the audit log keeps no addresses).

| Status | Meaning |
|---|---|
| `201` | `{ token, server_id, server_name }` |
| `400` | `code is required` |
| `401` | `invalid or expired pairing code` (wrong, used or expired, or its admin is no longer an enabled admin) |
| `429` | `too many attempts, try again later`, with `Retry-After` (seconds until the lockout ends) |

A server without the Bridge routes answers `404` (or `405`); the Bridge reads that
as "this server is too old for a Bridge".

### `PUT /api/v1/bridge/status`

*Bridge token.* The heartbeat, every 30 seconds: what the Bridge is and what it
found. The server keeps the last one only (one row, never a history).

```json
{
  "version": "0.1.0",
  "kinds": ["bridge.verify"],
  "libraries": [
    { "library_id": 1, "mount_path": "/audiobooks", "mapped": true, "writable": true,
      "checked_path": "Andy Weir/Project Hail Mary", "error": "" }
  ],
  "workers": [],
  "ui_url": "http://192.168.1.10:8091",
  "estimates": {
    "sidecars": {
      "asr_seconds_per_audio_hour": 900,
      "agent_usd_per_audio_hour": 1.6,
      "agent_usd_per_ebook": null,
      "samples": 3,
      "agent_backend": "claude",
      "agent_ready": true,
      "subscription": true,
      "can_contribute": false,
      "monthly_budget_usd": 100,
      "month_spent_usd": 12.3
    }
  }
}
```

| Field | Meaning |
|---|---|
| `version` | the Bridge's version (at most 128 bytes) |
| `kinds` | the job kinds it runs, each `family.name` in lower case, listed once (at most 64) |
| `libraries` | its last check of each library it has checked (at most 512, each `library_id` once and above 0): `mount_path` where it looked, `mapped` (a known book's files were there with the server's sizes), `writable` (a probe file could be written and removed there), `checked_path` (the book it compared), `error` (why it isn't mapped or writable, `""` when it is); the three texts at most 1 KiB each |
| `workers` | the transcription workers connected to it (at most 64; `name`, `version`, `platform`, `last_seen`, at most 128 bytes each; `[]` today) |
| `ui_url` | its own page on the local network: an absolute `http(s)` URL without credentials, or `""` |
| `setup` | optional, Phase 2b, sent only after a reply listed it in `accepts`: the Bridge's setup checklist, `{ items: [{ id, done, required, detail?, library_ids? }], can_contribute, github_login? }`. Read leniently like `estimates` (an unknown key ignored, a block that doesn't decode dropped, never refused) and bounded: the first 16 items kept (the rest left out); an item whose `id` doesn't match `^[a-z][a-z0-9_]{0,31}$`, or repeats one, is left out (an unknown id is kept); `detail` cleaned to 256 bytes; in `library_ids` a zero, negative or repeated id left out (at most 512 kept); a `github_login` that isn't GitHub's shape dropped. Its `can_contribute` wins over the estimates'. The ids a Phase 2b Bridge sends, their order and meaning: [The setup checklist](../../bridge/pairing-and-jobs.md#the-setup-checklist) |
| `estimates` | optional: its figures for costing a job before it is queued, one block per job family. `sidecars`: `asr_seconds_per_audio_hour` (ASR wall time per hour of audio, learned or a seed), `agent_usd_per_audio_hour` and `agent_usd_per_ebook` (agent spend from finished books, `null` before any), `samples` (the finished books they come from), `agent_backend` (`""` when none), `agent_ready` (the agent container answers and has a credential), `subscription` (that credential is a subscription login), `can_contribute` (it can file community intake issues), `monthly_budget_usd` (`0` = no cap) and `month_spent_usd`. Read leniently: an unknown key is ignored, and a block that doesn't decode, or holds a number below 0 or past its bound, is **dropped**, never refused (`agent_backend` is cleaned like the other text) |

The structure is checked and refused when wrong: a malformed kind, a repeated
kind, a library id that is repeated or not above 0, too many entries, or a `ui_url`
that isn't an absolute `http(s)` URL (the console renders it as a link). The **free
text** (the version, each mapping's paths and error, the workers' fields) is
**cleaned instead of refused**: broken UTF-8 becomes U+FFFD, each control character
a space, and the text is cut to its limit. Much of it comes from the outside world
(a file's name, an OS error), and a refused heartbeat would leave the Bridge
offline. The body is at most 64 KiB. The answer lists the server's libraries, so
the Bridge can map the ones it hasn't checked yet, and (Phase 2b) `accepts`, the
optional protocol features this server accepts:

```json
{
  "server_time": "2026-10-15T12:40:37Z",
  "libraries": [ { "id": 1, "name": "Audiobooks", "root": "/audiobooks", "kind": "books" } ],
  "accepts": ["setup", "claim_min_priority"]
}
```

Every library in the reply includes `kind: "books"|"podcasts"`; the Bridge
treats a missing kind from an older server as books. Podcast support adds
`podcast.subscribe`, `podcast.poll`, `podcast.fetch` and `podcast.retain` to the existing `kinds` list without a
new heartbeat request field.
`claim_min_priority` negotiates a claim query option, not a heartbeat block.

The heartbeat itself is decoded strictly (an unknown field is a `400`), so a
Bridge sends an optional block only after a reply listed it, and drops them all and
resends once on a `400` (an older server answers no `accepts`). See
[Optional blocks](../../bridge/pairing-and-jobs.md#optional-blocks-accepts).

| Status | Meaning |
|---|---|
| `200` | `{ server_time, libraries, accepts }` |
| `400` | `invalid status` (not JSON, too large, an unknown field), or a structure the checks refuse (`invalid: kind "…"`, `invalid: library 0`, `invalid: ui_url must be an http(s) URL`, …) |
| `401` | no bridge token or a refused one, including one a pairing or an unpair revoked after the request arrived |
| `503` | the token couldn't be checked, or (from 2.5.1) the heartbeat couldn't be saved (`could not save the status`; a `500` before): the Bridge retries |

### `GET /api/v1/bridge/jobs/next`

*Bridge token.* Claims the next job: a long poll.

| Param | Meaning |
|---|---|
| `wait` | seconds to wait for a job when none is queued, 0 to 25 (more is 25; default 0) |
| `kind` | repeatable: only these kinds (the ones the Bridge has a free lane for) |
| `min_priority` | optional single signed base-10 int32 floor; only send after heartbeat `accepts` lists `claim_min_priority`. Invalid/empty/repeated/out-of-range is `400 invalid_request`; omitted means no floor |

The server picks from the kinds the last heartbeat named **and** the server knows,
narrowed to the `kind` values when there are any. It hands out the highest
priority, then oldest, queued job of those kinds, leased for 2 minutes and with
`attempts` one higher, and answers `200` with the [job](#the-job-object). With no
job it waits up to `wait` (a job queued meanwhile, or one put back by a lapsed
lease, wakes it) and then answers `204`; when no kind is left after the narrowing it answers
`204` at once, and when the server is stopping it ends the wait with `204`. The
token is checked again with every claim, so a Bridge that a pairing or an unpair
replaced during its long poll gets `401`, never a job. A claim with nothing to
do (no job to hand out, no lease run out, no private follow request whose feed
URL the server lost) writes nothing on the server.

The priority floor is applied in the claim transaction before lease/attempt
mutation, alongside kinds, module and token checks. The reserved Bridge
dispatcher requests `kind=podcast.fetch&min_priority=100&wait=25`; ordinary
claims omit the floor. An undelivered untouched claim is released without
spending an attempt on write/flush failure or Bridge disconnect. A delivered
reply is retained across subsequent shutdown/deadline. See
[claims and leases](../../bridge/pairing-and-jobs.md#claims-and-leases) for
admission, capacity fallback and immediate cancel/join/reissue on eligibility
changes.

| Status | Meaning |
|---|---|
| `200` | the job, now `claimed` |
| `204` | no job |
| `400` | `code: "invalid_request"` for invalid `min_priority` |
| `409` | `code: "no_heartbeat"` - send a heartbeat first |
| `401` | no bridge token or a refused one (also when it was revoked during the wait) |
| `503` | the token couldn't be checked, or the request deadline expired |

### `PATCH /api/v1/bridge/jobs/{id}`

*Bridge token.* The Bridge's report on a job it holds: progress, a new state, the
result, an error. Every report renews the lease.

```json
{
  "attempt": 1,
  "state": "running",
  "progress": { "step": "stat", "message": "Comparing the files", "done": 2, "total": 4 }
}
```

| Field | Meaning |
|---|---|
| `attempt` | **required**: the `attempts` its claim returned. A report from an earlier claim (one whose lease ran out and was claimed again) is refused |
| `state` | optional: `running`, `done`, `failed`, `needs_attention` or `cancelled` (from `claimed`, `running` or `needs_attention`) |
| `progress` | optional: a JSON object, at most 16 KiB |
| `result` | optional: a JSON object, at most 64 KiB |
| `error` | optional: text, cleaned rather than refused (control characters become spaces, line breaks are kept, cut at 2 KiB) |

A field left out keeps its value. A `claimed` or `running` job's lease is renewed;
`needs_attention` drops the lease (the Bridge still holds the job); `done`,
`failed` and `cancelled` end it. The answer is the job as stored: its
`cancel_requested` asks the Bridge to stop.

| Status | Meaning |
|---|---|
| `200` | the job |
| `400` | `invalid job id`; `invalid update` (not JSON, over 128 KiB, an unknown field); or a check, each message starting `invalid: `: `progress must be a JSON object` (or `result`), `progress too large` (or `result`), or a state it can't report (`state "queued" from "running"`) |
| `409` | `code: "not_held"` - this claim no longer holds the job: it ended, was cancelled, its lease ran out and it was queued or claimed again, or it no longer exists (gone with its library). The Bridge drops it. This route never answers `finished` (only the console's cancel does) |

### `GET /api/v1/bridge/libraries/{id}/marker`

*Bridge token.* Reads the mapping marker for an empty or populated podcast
library (the route accepts either kind). Response `200 {"nonce":"<32 lowercase hex>"}`
requires `<root>/.audiosilo/library.json` to be a regular file no larger than
4 KiB, with version `1`, matching `library_id`, and a valid nonce; the marker
folder cannot be a symlink. The server reads only and never creates it.
Missing/invalid marker is `404 no_marker`, missing library `404 library_not_found`.
See [Library mappings](../../bridge/mappings.md#podcast-libraries-the-marker).

### Bridge podcast retention

*Paired Bridge bearer token only.* Session/API/cast tokens and query tokens
are refused, including an admin's token. These are core reads and return
`Cache-Control: no-store`; they expose no per-user listening data.

`GET /api/v1/bridge/libraries/{id}/podcasts/retention?path=<show>&show_id=<id>`
returns `200 {retention:Policy}`. A missing/invalid `path` or `show_id` is
`400 invalid_request`, missing library `404 library_not_found`, books library
`409 not_podcast_library`, missing show `404 show_not_found`, and a different
current show id `409 identity_changed`.

`POST /api/v1/bridge/libraries/{id}/podcasts/retention/check` is a read-only
check with strict JSON, capped at 4 KiB:

```json
{"show_id":"a1b2c3d4e5f60718","path":"Fixture Show/2026-10-19-1cc306d831.mp3","generation":2,"sha256":"7be5836ba147da1215098df9f7a34f33b157d07fd92dd801928c9caef17e6d2b","bytes":16493}
```

Generation must be positive, SHA-256 64 lowercase hex and bytes a positive
int64. The indexed present generation/hash/size and show id must match.
Missing episode is `404 episode_not_found`, mismatch `409 identity_changed`;
bad input is `400 invalid_request`, books library `409 not_podcast_library`,
missing library `404 library_not_found`. Success includes **all** these keys:

```json
{
  "library_id":3,"show_path":"Fixture Show","show_id":"a1b2c3d4e5f60718",
  "path":"Fixture Show/2026-10-19-1cc306d831.mp3","generation":2,
  "sha256":"7be5836ba147da1215098df9f7a34f33b157d07fd92dd801928c9caef17e6d2b","bytes":16493,
  "checked_at":"2026-10-21T08:00:00Z","policy":{"mode":"keep","keep":3,"days":7},
  "followers":2,"all_finished":true,"all_finished_at":"2026-10-12T08:00:00Z",
  "starred":false,"queued":false,"active_stream":false,"fetch_open":false,
  "outside_keep_window":true,"delete_after":"2026-10-28T08:00:00Z","eligible":false
}
```

`all_finished_at` and `delete_after` are RFC 3339 strings or `null`; other
flags are booleans, followers an integer. The server combines one consistent
DB snapshot with live stream marks; no names, user ids or positions leave it.
The Bridge requires complete valid fields and a matching local hash/size,
rechecks just before deletion and denies on error. Freshness is at most five
seconds measured from request dispatch by its own monotonic clock, independent
of the server's `checked_at`. See [aggregate rules](../../bridge/podcasts.md#retention-policy-and-deletion-authority).

### `GET /api/v1/bridge/libraries/{id}/book`

*Bridge token.* One **indexed** book's files with the size and modification time
the server sees **now**, for the Bridge's mapping check and its jobs. `?path=` names
the book. Without it the answer is the library's **sample book**, the mapping
check's: the first **whole** book (every file present on the server's disk) among
the library's first five by title, so one book deleted before a scan notices
doesn't make the whole library look unmapped; the first of them when none is
whole.

```json
{
  "library_id": 1,
  "path": "Andy Weir/Project Hail Mary",
  "files": [
    { "path": "Andy Weir/Project Hail Mary/Project Hail Mary.m4b", "size": 912345678, "mod_time": 1781234567, "duration": 58008.4 }
  ],
  "book": {
    "title": "Project Hail Mary", "authors": ["Andy Weir"], "narrators": ["Ray Porter"],
    "series": "", "series_index": "", "asin": "B08G9PRS1K", "isbn": "",
    "duration": 58008.4, "work_id": "project-hail-mary",
    "ebook": { "path": "Andy Weir/Project Hail Mary/Project Hail Mary.epub", "size": 1048576 }
  }
}
```

`book` is present only when a `path` was asked for (never on the sample-book
answer): what a job about the book reads. The effective values; `authors` and
`narrators` are the credits split as the server splits them (`[]` for none);
`series_index` is the position as the server formats it (`"3"`, `"1-3"`, `""`
for none); `duration` is in seconds; `work_id` is the community work the
metadata cache already knows for the book's ASIN or ISBN, `""` otherwise (the
cache only, never an upstream call; `""` while metadata is off). `ebook` (Phase 3c)
is the book's ebook as the server indexed it (the reader's file, the one a
`readalong.align` job aligns), omitted when it has none.

File paths are relative to the library root. A single-file book (one audio file,
indexed without separate parts) is listed as its own one file. `size` and
`mod_time` (Unix seconds) are read from the disk on the request; a file the server
can't stat keeps its indexed size and `mod_time` `0`. `duration` (Phase 3c) is the
file's indexed length in seconds (a single-file book's is the book's), from which a
read-along map's whole-book times are built; an older Bridge ignores it. Only an indexed book answers:
this never indexes a path on demand.

| Status | Meaning |
|---|---|
| `200` | `{ library_id, path, files, book? }` |
| `400` | `invalid library id` |
| `404` | `library not found`; `code: "no_book"` - no indexed book at that path (or none in the library) |

Without a path, a podcast library always returns `404 no_book`, so an older
Bridge cannot map it through a sample episode. Use the marker route above.

### `POST /api/v1/bridge/rescan`

*Bridge token.* Reads one path again now, after the Bridge changed files there.

```json
{ "library_id": 1, "path": "Andy Weir/Project Hail Mary", "mode": "full", "from": "Andy Weir/Hail Mary" }
```

| Field | Meaning |
|---|---|
| `library_id`, `path` | required: the path to read again |
| `mode` | `full` (the default when absent) or `attachments` |
| `from` | with `full` only: the book's path **before** a move the Bridge made |

- **`full`** indexes whatever is at the path, a new book included (re-reading its
  audio), and answers `200 { "path": "…" }` with the book's indexed path. With
  `from`, the server also carries the book's durable state from there exactly as
  a scan's [move detection](../scanner.md#move-detection) would (listening state,
  edits, covers, enrichment, Bridge jobs, the favourites of the folders it left),
  then drops the old row, but only when no book is at `from` on disk any more and
  the two fingerprints match; otherwise `from` is ignored (logged), never an
  error. This closes Phase 0's gap where a rescan of a renamed book defeated move
  detection.
- **`attachments`** re-reads only the book's
  [`.audiosilo/` files](../../bridge/attachments.md), never its audio: the
  Bridge's call after writing characters, recaps, a description, chapters or a
  read-along map. The path is the book's, or a path inside it. A changed
  `chapters.json` re-resolves the book's chapters at once. It answers what is now
  indexed (`description` since Phase 1c, `chapters` since Phase 1d, `readalong`
  since Phase 3c):

```json
{ "path": "Andy Weir/Project Hail Mary", "attachments": { "characters": true, "recaps": true, "description": true, "chapters": false, "bridge": true, "readalong": false } }
```

For a podcast library, `path` names a show folder or an already indexed
episode whose show is refreshed from `feed.json`. Response is
`200 {"path":"<show>","episodes":N}`; missing/invalid feed is
`404 not_indexable`. `mode:"attachments"` and any supplied `from` are `400`.
No arbitrary audio is indexed. Podcast feed details, committed audio presence,
publication barriers and matching CHAP attachments are read without probing or
hashing audio. A pending journal leaves its episode unready.

The re-read runs detached from the request for up to 10 minutes, like the
console's [rescan of one book](#post-apiv1adminlibrariesidbookrescan). A path
through a hidden (dot) folder is never indexed. The body is at most 8 KiB.

| Status | Meaning |
|---|---|
| `200` | `{ path }` (`full`), or `{ path, attachments }` (`attachments`) |
| `400` | `library_id and path are required`; `mode must be full or attachments`; `invalid from`; `from is only for a full rescan` |
| `404` | `library not found`; `code: "not_indexable"` - nothing indexable at that path (gone, not a book, in a hidden folder, outside the library, or skipped by its ignore rules), or for `attachments` no indexed book there |

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

## First-run setup page

Only active when the launcher enabled it (`--setup` / `pkg/launcher`); a normal
headless deployment never exposes this surface. The page self-closes the
moment an admin exists. The one-time setup token rides in the page URL
**fragment** (`/setup#token=…`) so it never reaches server logs; the POST
verifies it in constant time. The page asks only for the account; the admin
console's [first-run setup flow](#admin-first-run-setup) does the rest. See
[Web UI](../web-ui.md#first-run-setup-page-setup).

### `GET /setup`

*Public (gated).* Serves the setup page. `404` when it was never enabled;
`303 See Other` → `/admin` when enabled but an admin already exists.

### `POST /setup`

*Public (token-guarded).* Creates the first admin. The page sends only the
token and the account; the library fields are still accepted so a caller that
scripts this route (an older page, the desktop manager) keeps working.

| Body field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | yes | the one-time setup token |
| `username` | string | no | defaults to `"admin"` |
| `password` | string | yes | admins must have a password |
| `library_name` | string | with `library_root` | optional; send both or neither |
| `library_root` | string | with `library_name` | must be an existing directory on the server |

Without the library fields it creates only the admin: `201 { "user": { … } }`.
With both, it checks the folder exists before making the admin, then creates
the library with the defaults, starts its background scan and records the
console flow's `folder` step as done (its `naming` step stays open):
`201 { "user": { … }, "library": { … } }`.

| Status | Meaning |
|---|---|
| `400` | validation (only one of the library fields, the folder doesn't exist, password rules) |
| `403` | invalid setup token |
| `409` | setup not available (already completed or never enabled); with the library fields, also a library create refusal (`name_taken`, `root_overlaps`) after the admin was made, which then exists |

---

:::note[Static UI routes]
`internal/api/api.go` also mounts the baked-in static UI via `web.Register`:
`GET /` (connect page), `/connect`, `/admin`, `/assets/…`, `/favicon.ico`,
`/sw.js`, `/manifest.webmanifest`, and the web player at `/web/…` (when
configured). These are plain pages *over* the API - they hold no privilege of
their own and are documented in [Web UI](../web-ui.md), not here.
:::
