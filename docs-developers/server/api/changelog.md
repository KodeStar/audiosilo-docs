---
title: API changelog
description: "Per release, the additions and deprecations on the Stable routes of the AudioSilo server API, with a capability flag for each new behaviour."
---

This page lists, for each server release, what changed on the
[Stable routes](stability.md#route-tiers): new routes, new fields, new error
codes, new capability flags, deprecations and removals. Console-internal
(`/admin/*`) and Bridge-internal (`/bridge/*`) changes are not listed. The
[API reference](reference.md) has the full shape of each route, and
[API stability](stability.md) says what the server promises.

A release with no Stable change has no section. Each release's notes on GitHub
link here when it has one.

## v2.7.0

Additions:

- **Retrying a bookmark.** With capability `bookmark_client_id`, a client can supply a UUID on a
  bookmark create. A fresh save returns 201, a replay for the same book returns the stored row
  with 200, and reuse for another book returns 409 `client_id_conflict`. A malformed UUID returns
  400 `invalid_request`.
- **Recognizing the server’s 401.** With capability `unauthorized_mark`, every 401 from the server
  carries the CORS-exposed header `X-AudioSilo-Unauthorized`. Its value is the body’s code or
  `unauthorized`. A session token that cannot be checked because the database is unavailable gets
  503.
- **Single sign-on.** `GET /auth/oidc/start`, `GET /auth/oidc/callback` and
  `POST /auth/oidc/finish` ([Single sign-on](reference.md#single-sign-on)),
  for a page on the server's own origin. Capability `oidc`. While it is `true`,
  `auth.methods` on `GET /server` adds `"oidc"` and `auth.oidc.name` names the
  provider. The start takes an optional `intent` tag, and the finish takes an
  optional `intent` in its body and echoes the trip's tag as `intent`
  (see [`GET /auth/oidc/start`](reference.md#get-apiv1authoidcstart)). Each
  sign-in has its own flow, so two tabs can sign in at once: the callback lands
  on `/web/connect?oidc=1&flow=<key>`, and the finish takes that key as an
  optional `flow` in its body to finish only that flow's sign-in. For
  `return=admin` the start also takes an optional `next`, the console page to
  land on.
- **A work's other recordings together.** `work_id` on a book,
  `other_recordings` on `/item` ([Other recordings](reference.md#other-recordings))
  and `local_others` on `/meta`. Capability `other_recordings`.
- **LibriVox links.** A `/meta` recording can carry `librivox` with the project ID and links. A
  console-matched book can receive this metadata without an identifier.
- **Edited chapters.** A book using the chapter list saved in the editor reports
  `chapters_source: "edited"`. A cast token minted with `editor: true` lasts four hours and has a
  separate limit of five per person.
- **Which generated parts a book has.** `generated_parts` on a book, beside
  `generated` ([`GET /libraries/{id}/books`](reference.md#get-apiv1librariesidbooks)).
- **A private show that lost its address.** `status.secret_missing` on a
  podcast show ([Podcast read routes](reference.md#podcast-read-routes)).
  Neither this nor `generated_parts` has a capability flag. A client reads each
  field when it is there.
- **A Stay in listening sync.** A listen's `start` on `POST /me/listening/sync`
  can be `stay` ([A Stay](reference.md#a-stay)). Capability `listening_stay`.
  Without it, send `jump`: an older server refuses a `stay` event as `invalid`.
  A `finish` made at or before another device's Stay that holds the row is
  answered `not_applied` with the `reason` `behind`, which only the Bridge's
  Audible route sent before. Treat an unknown `reason` as `not_applied`.
- **How a transcode is going.** A `HEAD` of a stream with `transcode=1` carries
  `X-AudioSilo-Transcode-Sent`, the bytes the same ask's running `GET` has
  written so far ([Transcode slots](reference.md#get-apiv1librariesidstream)).
  CORS exposes it. No capability flag: a client reads the header when it is
  there.
- **Error codes.** `POST /auth/exchange` answers `401` with `code`
  `invite_used` or `invite_expired` for a token the invite minted.
  `POST /auth/password` answers `401 current_password_incorrect` for a wrong
  `current_password`, which a client tells apart from a session that ended.
  `POST /auth/oidc/finish` answers `401` with `oidc_no_sign_in` or
  `oidc_sign_in_expired`, and `403 oidc_intent_mismatch` for a body `intent`
  that isn't the sign-in's tag. `POST /auth/exchange` and the single sign-on
  finish answer `500` when the session can't be written, with the token left
  unspent for a retry.

Changes to existing routes:

- JSON reads bypass gzip when a request carries an `Upgrade` header.
  Authentication errors on opted-in reads and the small `/api/v1/healthz`
  response no longer acquire `Vary: Accept-Encoding` from the gzip writer.
  A [read-along map](reference.md#get-apiv1librariesidreadalong) requested
  with `Range` now uses the identity ETag even when the client accepts gzip.
  Its `200` response carries the whole uncompressed map.
- When a community or Upcoming cover fetch encounters user info (username or
  password) in the original URL or a redirect target, the player receives
  `404 no cover`. Podcast discovery artwork returns `502 artwork_unavailable`
  for a redirect with user info. See [Podcast discovery](reference.md#podcast-discovery).
- `POST /auth/password` returns 200 with `signed_out`, the number of the caller’s other sessions
  ended. Clients supporting older servers must also accept their empty 204.
- While the server starts, every request, both health routes and `GET /server` included, returns
  503 `server_starting`, `starting_for_seconds` and `Retry-After: 5`. Health probes bypass rate
  limiting.
- A podcast fetch status or retry returns 409 `show_unreadable` when the server cannot read the
  show folder. Streaming that episode returns 404 `episode_not_found` without scheduling a
  download. A temporary share fault on a file open or folder listing returns 503
  `share_not_answering` with `Retry-After: 30`.
- A show lookup accepts the other Unicode spelling of a uniquely visible indexed show. A hand rename preserves follows and episode places.
- [OPML import](reference.md#post-apiv1podcastsopmlimport): an unknown library, like one the
  caller holds no whole grant on, returns 403 `no_library_access` (it was 404
  `library_not_found`). The import has its own 5 minute bound instead of the 30 s request
  timeout, and runs to its end when its client stops waiting. Two imports run at once per
  server: a third returns 503 `opml_busy` with `Retry-After: 1` and refunds its request
  allowance. An invalid document that followed nothing also refunds the allowance.
- A paired Bridge's requests no longer spend its address's rate limit bucket (each Bridge token
  has its own), so players behind the same address as a Bridge are not slowed by its work.
- The player’s series rails, Upcoming and the local recordings in `/meta` follow a recorded
  community work match even when the book has no ASIN or ISBN. If the work no longer lists the
  recording selected for the match, the match does not substitute another edition’s details.
- A path query over 4,096 bytes returns 400 before credentials are checked. Oversized request
  lists are refused during decoding. Queue replacements allow 500 entries, collection replacements
  1,000 and listening batches 500 events. Oversized replacements return 400 `too many items`, and
  an oversized listening batch returns 400 `too_many_events`.
- `GET /me/progress` and `GET /me/favourites` answer `[]` for a caller with
  none, never `null`.
- A path in the other Unicode spelling (NFC or NFD) of an indexed path reaches
  that book, and every answer carries the index's spelling. A path the disk
  doesn't hold as given, such as another case on a case-insensitive disk, is
  answered as a missing path (`404`) on every route, after the same work as a
  missing path. A whole-list `PUT` of user state that names a track path or
  another spelling keeps that entry under its book.
- [`GET /libraries/{id}/fs`](reference.md#get-apiv1librariesidfs) answers `404`
  for a folder outside the caller's share rules, where it answered `200` with no
  entries, and for a path that leaves the library through a link. A folder made
  on disk after its parent was listed can answer `404` for up to 3 seconds.
- `PUT /libraries/{id}/progress` stores and echoes `updated_at` as fixed-width
  UTC milliseconds, whatever RFC 3339 form was sent.
- In listening sync, a device's span that lands up to 2 s before the end of its
  own last span is not answered `older`.
- Transcode slots are held per ask: a repeat ask for the same stream takes over
  its earlier request's slot, and a token holds at most 2 of the 4, its third
  ask taking its earliest stream for the same file, then its oldest stream. Only an identical
  download can take over a download. With two downloads held, a different ask gets 503. A
  transcoded download is named `<stem>.mp3`. A `HEAD` with `transcode=1` starts no ffmpeg and
  answers `503` with `Retry-After: 5` when a `GET` would. A `t` that is no
  positive number starts at `0`. A download or a transcode for a chapter editor token ends
  after 10 minutes in which its client read nothing.
- A missing podcast episode's stream answers `503`, `Retry-After: 2`, with
  `code: "identity_changed"` and no `fetch` summary while the episode's previous
  identity's fetch is still stopping, where it answered `409`
  ([Podcast fetch status](reference.md#podcast-fetch-status-and-retry)).
- `POST /podcasts/follow` and an OPML row answer `invalid_feed_url` for a feed
  host over 253 characters. A queued follow request fails `request_expired`
  once no online Bridge has offered to follow feeds for two minutes. A parked
  fetch no longer counts toward a listener's five open fetches.
- A grown-up household member’s device has an empty `last_ip` when the owner lists it. Ending the
  owner’s sessions also ends the corresponding member credentials.
- Household listening activity reports `playing` for 150 seconds after the latest save.
- Cached MP3 remuxes and watch renditions send a strong ETag and omit `Last-Modified`. At the
  cast-token limits (20 per sending device, 100 per person), the least recently used token goes
  first.
- Every credential a session mints (a pairing token, an API key, a feed or cast
  token, a recovery code, a member's pairing) is minted against that session in
  one transaction: a session signed out, disabled or with its password changed
  a moment before gets `401` and nothing is made. A cast token's expiry slides
  to 24 hours after its last use, at most 72 hours after its mint, and a
  disabled account's cast token stops at once. A token ends at its
  `expires_at` second.

Deprecations: none.
