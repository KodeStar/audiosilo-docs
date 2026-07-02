---
title: API conventions
description: "Base path, authentication, error envelope, path-addressed content, pagination, capability flags, rate limiting, and CORS — the rules every endpoint follows."
---

Everything a client needs to know before calling any endpoint. The normative
source is the route table in `internal/api/api.go` and the handlers in
`internal/api/handlers_*.go`; the complete endpoint list is in the
[reference](reference.md).

## Base path and versioning

All JSON API routes live under **`/api/v1`**. The version is advertised by
[`GET /api/v1/server`](reference.md#get-apiv1server) as `"api": "v1"` — there is
no other versioning mechanism (no version headers, no v2).

A few routes deliberately live *outside* the prefix:

| Route | Why |
|---|---|
| `GET /healthz` (also served at `GET /api/v1/healthz`) | container/orchestrator healthchecks expect a root-level probe |
| `GET /setup`, `POST /setup` | the first-run setup wizard is a browser page, not an API surface (and is off unless the launcher enables it) |
| `GET /.well-known/apple-app-site-association`, `GET /.well-known/assetlinks.json` | the well-known location is mandated by iOS/Android |
| `/`, `/connect`, `/admin`, `/assets/…`, `/web/…` | the baked-in admin/connect UI and the web player — static pages over the API, not part of it (see [Web UI](../web-ui.md)) |

## Requests

- Bodies are JSON. `decodeJSON` (in `internal/api/respond.go`) caps every
  control-plane body at **1 MiB** and decodes with `DisallowUnknownFields` — a
  body containing a field the server doesn't know is a **400**, not silently
  ignored. Keep client payloads exactly in sync with the documented shapes.
- Path parameters like the library `id` must be integers; anything else is a 400.
- Timestamps on the wire are RFC 3339 strings (e.g. `2026-07-01T19:42:07Z`).

:::caution Empty lists can be `null`
List-valued response fields are Go slices; when a result is empty the field
serializes as JSON `null`, not `[]` (e.g. `{"books": null}`). Treat `null` and
`[]` as equivalent.
:::

## Authentication

Every route except the public set (`/server`, `/healthz`, `/auth/redeem`,
`/auth/exchange`, `/auth/login`, `/demo/session`, `/setup`, the well-known files,
and the static UI) requires a **session bearer token**:

```
Authorization: Bearer <session token>
```

Admin routes (`/api/v1/admin/*`) additionally require the `admin` role (403
otherwise). Tokens are opaque secrets, stored server-side only as SHA-256 hashes;
sessions have **no expiry** and are revoked explicitly (`POST /auth/logout`, or
by an admin disabling/deleting the account). Every authenticated request bumps
the token's `last_seen`, which is what surfaces as a user's "last activity".

There are three ways to obtain a session token:

1. **Auth-code pairing** (the primary flow): `POST /auth/redeem` with an
   invite or recovery code returns a *pairing payload* — a single-use pairing
   token (10-minute TTL) plus QR/deep-link carriers. `POST /auth/exchange`
   trades the pairing token for a durable session token (`{ token, user }`) and
   revokes the pairing token.
2. **Password login**: `POST /auth/login` with `username`/`password` returns
   `{ token, user }` directly. Passwords are optional for non-admin accounts, so
   this only works for accounts that have one.
3. **Demo session**: `POST /demo/session` (only when demo mode is enabled)
   mints a throwaway account and returns a session token immediately.

An already-authenticated client can mint a fresh pairing payload for another
device with `POST /auth/pair`. See [Auth & security](../auth-and-security.md)
for the trust model behind codes, tokens, and hashes.

### Media requests: `?token=` — media GETs only

`GET /libraries/{id}/cover` and `GET /libraries/{id}/stream` accept the session
token **either** as the bearer header **or** as a `?token=` query parameter.
This exists because browser `<img>` and `<audio>` elements cannot set an
`Authorization` header. The query fallback is deliberately confined to these two
routes (`requireMediaAuth` in `internal/api/middleware.go`): a token in a query
string can leak into access logs and `Referer` headers, so no other route
accepts it. Native clients should keep using the header even for media.

## Error envelope and status conventions

Every error is a JSON object with a single field:

```json
{ "error": "no access to this path" }
```

Status mapping is consistent across handlers:

| Status | Meaning |
|---|---|
| `400` | malformed body / unknown JSON field, missing or invalid parameter (`path is required`, `invalid cursor`, non-integer `{id}`), path escaping the library root, domain validation (`mode must be "book" or "collection"`, admin needs a password, password too short) |
| `401` | missing/invalid/expired token, bad credentials, invalid auth code, wrong `current_password` |
| `403` | authenticated but not allowed: no share grants the library or path, `admin only`, demo accounts on password/recovery routes, bad setup token |
| `404` | library/user/share/invite not found, `no book at that path`, feature not configured (demo mode off, well-known files unset) |
| `409` | conflicts: `name already taken` (library/share), last-enabled-admin guard, setup already completed |
| `429` | a rate limiter tripped (see below) |
| `500` | unexpected internal failure — the message is generic; details go to the server log only |
| `503` | database unreachable (`/healthz`), transcoding requested without ffmpeg, demo at capacity, or the request timeout (below) |

**Request timeout.** Non-streaming requests are bounded at **30 s** by
`http.TimeoutHandler`; a request that exceeds it gets
`503 {"error":"request timed out"}`. Streaming paths — `/stream`, `/cover`, and
the `/web` static mount — are exempt, so audio playback can run indefinitely.

## Path-addressed content: `?path=`

Content identity is `(library_id, rel_path)` — never a database id. Every
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

- **Traversal safety** — the path is resolved through `library.SafeJoin`, which
  rejects `..` escapes, absolute-path injection, and symlinks pointing outside
  the library root (400 `invalid path`).
- **Scope authorization** — the path is checked against the caller's share
  scope (`authorizedPath`); a path outside any granting share is 403, even if it
  exists. Admins bypass scoping.

:::warning `books.id` is not an identity
Book objects include an `id`, but it is a rebuildable index artifact — it
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
paging cost does not grow with depth — never assume the cursor's format (it is
base64 today, but opaque by contract). A malformed cursor is 400
`invalid cursor`. Changing `sort`/filters invalidates a cursor.

**Filesystem listings are offset-paginated.** `GET /libraries/{id}/fs` takes
`offset`/`limit` (default 200, max 500) and returns `total`, `offset`, and —
when more entries remain — `next_offset`. Directory listings are bounded by
directory size, so offsets are fine there.

Other list endpoints (`/search`, `/books/recent`, history) are single-shot with
a `limit` and no pagination.

## Capability flags — gate your features

`GET /api/v1/server` is public and returns the server's capabilities:

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

Clients **must** feature-gate on these flags rather than probing endpoints:
`transcode` reflects whether ffmpeg is configured (without it, `?transcode=1`
is 503), `web_player` whether `/web` is mounted, `upload`/`websocket` are
roadmap phases that will flip on when they land. `demo.enabled` drives the
"Try the demo" affordance.

## Rate limiting

Two limiter mechanisms guard the API (`internal/api/ratelimit.go`), all keyed by
client IP. Tripping any of them returns **429** with an error envelope.

| Limiter | Scope | Policy |
|---|---|---|
| Global token bucket | every request | ~20 requests/second, burst 40, per IP (`rate limit exceeded`) |
| Login lockout | `POST /auth/login` | 10 *failed* attempts per 15 min per IP; a success resets the counter |
| Redeem lockout | `POST /auth/redeem` | 10 *failed* attempts per 15 min per IP; a success resets |
| Demo cap | `POST /demo/session` | at most 5 demo sessions per IP per 15 min, metered at admission (failures count too) |
| Account mutations | `POST /auth/password`, `POST /auth/recovery` | at most 10 attempts per IP per 15 min, metered at admission |

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
  `GET, POST, PUT, DELETE, OPTIONS`, headers `Authorization, Content-Type`, and
  a 600 s preflight cache. `OPTIONS` requests short-circuit with 204.
- **`"*"`:** allows any origin (the request's own `Origin` is echoed back).

For local player development against a dev server, set
`cors_origins: ["http://localhost:8081"]`.

## The contract is hand-mirrored

There is no OpenAPI spec and no codegen. The player mirrors these JSON shapes by
hand in `audiosilo-frontend/src/api/types.ts` (and the manager in its
`internal/serverapi`), so **any wire change is a multi-repo change** — handler,
mirrored types, and tests on both sides move together. See the
[cross-repo contract](../../architecture/cross-repo-contract.md) before touching
a payload.
