---
title: API stability
description: "Which AudioSilo routes a third-party client can build on, what the server promises about them within v1, how a deprecation is announced and what a client has to do in return."
---

This page is the compatibility policy for clients other than AudioSilo's own. It
says which routes are stable, what the server guarantees about them, and what it
expects from a client in return. The conventions every route follows are in
[API conventions](index.md), the routes themselves in the
[API reference](reference.md), and the additions and deprecations of each
release in the [API changelog](changelog.md).

The policy writes down a rule the project already works by. Shipped iOS and
Android builds lag the server, so an old player's calls have to keep working
after an upgrade, and every wire change is additive. A third-party client gets
the same treatment as an old player.

## Route tiers

| Tier | Routes | Promise |
|---|---|---|
| **Stable** | The player API under `/api/v1`: `GET /server`, sign-in and pairing (`/auth/*`), libraries, books, `/item`, covers, streams, progress, bookmarks and the rest of `/me/*`, the ebook and reading progress, the household and casting routes. `GET /healthz` outside the prefix | The guarantees below hold for all of v1 |
| **Console-internal** | `/api/v1/admin/*` | Built for the admin console of the same release. A route or field can change in any release |
| **Bridge-internal** | `/api/v1/bridge/*` | Built for the Bridge, which negotiates what it can do with the server in its heartbeat. A route or field can change in any release |
| **Experimental** | A Stable-path route or field the [API reference](reference.md) marks as experimental | Can change or go in any release. No route is marked experimental today |

A client that calls a console or Bridge route takes on that route's churn. Read
the [API changelog](changelog.md) before upgrading the server it talks to.

## What the server guarantees for Stable routes

Within `/api/v1`, a release never:

- removes, renames or changes the JSON type of a response field;
- makes a request that worked fail, including one that leaves out a request
  field the release added;
- changes the error envelope. An error stays `{"error": "...", "code": "..."}`
  (the `code` only where the [error table](index.md#error-envelope-and-status-conventions)
  lists one), and a status keeps its meaning.

New behaviour arrives as a new field, a new route or a new value of a field a
client already reads, and the server announces it with a
[capability flag](index.md#capability-flags---gate-your-features) on
`GET /server`. A breaking change would ship as `/api/v2` beside `/api/v1`, with
v1 kept through the deprecation window below. There is no `/api/v2` today.

## Deprecation

A field or route that is going away is first marked deprecated in the
[API reference](reference.md) and listed in the [API changelog](changelog.md)
for the release that deprecates it. The server keeps serving it for at least
two minor releases and at least six months after that release, whichever is
longer. Only then can a later release remove it, and the changelog lists the
removal too.

## What a client has to do

The guarantees assume a client that:

- **ignores response fields it doesn't know.** Every release adds fields, and
  each one is a new key in an object the client already reads.
- **treats `null` and `[]` the same.** An empty list can serialize as either
  (see [Requests](index.md#requests)).
- **gates a feature on its capability flag**, not on the server's version. A
  flag that is absent counts as `false`. See
  [Gate on the flag, not the version](index.md#gate-on-the-flag-not-the-version).
- **sends `X-AudioSilo-Client`**, so the admin can see which client a device
  runs (see
  [Client identification](index.md#client-identification-x-audiosilo-client)).
- **sends only the documented request fields.** The server decodes request
  bodies strictly, and an unknown field is a `400`.
- **reads an error's `code` when there is one**, and falls back to the status
  when there isn't.
