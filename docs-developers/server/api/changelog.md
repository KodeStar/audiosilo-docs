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
  provider.
- **A work's other recordings together.** `work_id` on a book,
  `other_recordings` on `/item` ([Other recordings](reference.md#other-recordings))
  and `local_others` on `/meta`. Capability `other_recordings`.
- **Which generated parts a book has.** `generated_parts` on a book, beside
  `generated`
  ([`GET /libraries/{id}/books`](reference.md#get-apiv1librariesidbooks)).
  No capability flag: a client reads it when it is there.
- **A private show that lost its address.** `status.secret_missing` on a
  podcast show ([Podcast read routes](reference.md#podcast-read-routes)). No
  capability flag: a client reads it when it is there.
- **A Stay in listening sync.** A listen's `start` on `POST /me/listening/sync`
  can be `stay` ([A Stay](reference.md#a-stay)). Capability `listening_stay`.
  Without it, send `jump`: an older server refuses a `stay` event as `invalid`.
- **Error codes.** `POST /auth/exchange` answers `401` with `code`
  `invite_used` or `invite_expired` for a token the invite minted.
  `POST /auth/password` answers `401 current_password_incorrect` for a wrong
  `current_password`, which a client tells apart from a session that ended.
  `POST /auth/oidc/finish` answers `401` with `oidc_no_sign_in` or
  `oidc_sign_in_expired`.

Changes a client may notice, none of them breaking:

- `GET /me/progress` and `GET /me/favourites` answer `[]` for a caller with
  none, never `null`.

Deprecations: none.
