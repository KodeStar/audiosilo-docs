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

Changes a client may notice, none of them breaking:

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
  ask taking over its oldest. A `HEAD` with `transcode=1` starts no ffmpeg and
  answers `503` with `Retry-After: 5` when a `GET` would. A `t` that is no
  positive number starts at `0`. A transcode for a chapter editor token ends
  after 10 minutes in which its client read nothing.
- A missing podcast episode's stream answers `503`, `Retry-After: 2`, with
  `code: "identity_changed"` and no `fetch` summary while the episode's previous
  identity's fetch is still stopping, where it answered `409`
  ([Podcast fetch status](reference.md#podcast-fetch-status-and-retry)).
- `POST /podcasts/follow` and an OPML row answer `invalid_feed_url` for a feed
  host over 253 characters. A queued follow request fails `request_expired`
  once no online Bridge has offered to follow feeds for two minutes. A parked
  fetch no longer counts toward a listener's five open fetches.
- Every credential a session mints (a pairing token, an API key, a feed or cast
  token, a recovery code, a member's pairing) is minted against that session in
  one transaction: a session signed out, disabled or with its password changed
  a moment before gets `401` and nothing is made. A cast token's expiry slides
  to 24 hours after its last use, at most 72 hours after its mint, and a
  disabled account's cast token stops at once. A token ends at its
  `expires_at` second.

Deprecations: none.
