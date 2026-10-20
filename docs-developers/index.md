---
title: The system at a glance
description: "How AudioSilo's Go server and Expo player fit together, with an optional Bridge for library jobs and a community metadata database."
slug: /
---

AudioSilo is a self-hosted audiobook platform built around a **server and player**.
The server owns the data and the HTTP/JSON contract; the player is a thin,
fully-typed read side over that contract.

| Repo | Role | Stack |
|---|---|---|
| `audiosilo-server` | The **server** - source of truth for content and the API. JSON API + baked-in admin/connect UI; serves the web player at `/web`. Safe to expose to the internet. | Go 1.26, SQLite (modernc, pure Go), FTS5 |
| `audiosilo-frontend` | The **player** - one codebase shipping to web PWA + iOS + Android. Read side of the product; its web export is served *by* the server at `/web`. | Expo SDK 56, React Native 0.85 (new architecture), React 19, Expo Router, Uniwind (Tailwind v4) |

The optional **[Bridge](bridge/index.md)** (`audiosilo-bridge`, private for now)
pairs with a server, writes to its libraries and runs the heavy jobs, so the
server stays read-only. It always calls the server, never the reverse. Its first real job generates a book's
[characters and recaps](bridge/generating.md) into the book's folder, with its AI
agents in a separate [agent container](bridge/agent-container.md).

The code repos (plus this docs site) live side by side in a single
workspace folder (`~/dev/audiosilo`), whose root is itself the small
`audiosilo-workspace` meta repo holding the cross-repo glue (the integration
contract, code-health checklist, release runbooks); see
[the workspace guide](contributing/workspace.md) for how to check everything
out and work across the repos.

## Architecture

```mermaid
flowchart LR
    subgraph fe["audiosilo-frontend - the player (read side)"]
        ios["iOS app"]
        droid["Android app"]
        pwa["Web PWA"]
    end

    subgraph srv["audiosilo-server - source of truth"]
        api["JSON API<br/>/api/v1"]
        webmount["/web<br/>web player (static export)"]
        adminui["/admin + /connect<br/>baked-in UI"]
        db[("SQLite index<br/>(rebuildable)")]
        files[("Library folders<br/>(filesystem = truth)")]
        api --- db
        api --- files
    end

    bridge["audiosilo-bridge<br/>(optional companion)"]

    ios -->|"JSON API + media streams"| api
    droid -->|"JSON API + media streams"| api
    pwa -->|"JSON API + media streams"| api
    webmount -.->|"serves the web build"| pwa
    bridge -->|"pulls: heartbeat, jobs"| api
    bridge -->|"writes (checked mappings)"| files
```

Three structural facts to internalize before reading anything else:

- **The server is the only writer of the API contract.** The frontend mirrors
  its JSON shapes **by hand** - there is no codegen, so a wire change is always
  a multi-repo change. See
  [Cross-repo contract](architecture/cross-repo-contract.md).
- **The filesystem is the source of truth; the database is a rebuildable index.**
  Content is addressed by `(library_id, rel_path)`, never by a database id. See
  [Invariants](architecture/invariants.md).
- **The server's content API is read-only.** Files change on disk, copied in by
  hand or written by the [Bridge](bridge/index.md) through its checked mappings,
  and a scan updates the index.

## The data flows

**Streaming.** The player fetches a book's chapters
(`GET /libraries/{id}/chapters?path=` → `{chapters, files, duration}`), then
streams individual **audio files** - never a folder/book path - with HTTP Range
requests (`GET /libraries/{id}/stream?path=`). Media auth rides as a `?token=`
query param because browsers can't set headers on `<img>`/`<audio>`. For a codec
browsers can't decode (`direct_playable: false`) the web player streams the
server's on-the-fly MP3 instead (`?transcode=1&t=`, ffmpeg, gated by the
`transcode` capability), re-requesting it on every seek.

**Progress sync.** The player saves position every 15 seconds while playing (and
on pause/seek/rate/stop), path-keyed, via `PUT /libraries/{id}/progress?path=`.
The server reconciles last-write-wins by `updated_at` (`catalog.SaveProgress`);
the client keeps an offline replay queue (`src/playback/progress-sync.ts`).
Realtime WebSocket sync is **planned** (Phase C remainder) - the `websocket`
capability flag is already reserved for it.

**Pairing.** An admin mints an invite code; the code rides a URL **fragment**
(`/connect#code=…`) so it never reaches server logs. The connect page redeems it
(`POST /auth/redeem` → a pairing token that inherits the invite's uses/expiry)
and offers two carriers: an HTTPS `web_url` (QR / Universal Links) and an
`audiosilo://connect?...` custom-scheme deep link. The app or web player
exchanges the pairing token for a device-scoped session (`POST /auth/exchange`),
claiming one invite use per device - so each device being set up can scan the
same QR.

**File placement.** Files reach a library folder outside the server's API:
copied in by hand, or written by the [Bridge](bridge/index.md). A
non-destructive reindex (`POST /admin/libraries/{id}/scan`) picks them up. See
[Organizing your library](/users/getting-started/organizing-your-library) for the
folder conventions. A server-side `POST /uploads` endpoint is **planned**
(Phase B), not shipped.

## Design priorities

The server's priorities, in order - when they conflict, the earlier one wins:

1. **Safe to expose to the internet.** Secure defaults, no default passwords,
   hashed secrets, app-layer hardening, configurable TLS. Inexperienced users will
   port-forward this.
2. **Fast regardless of library size.** FTS5 search + keyset pagination; never
   OFFSET on large tables.
3. **No-wait first connection.** The filesystem view (`/fs`) needs no indexing -
   a fresh server is browsable and playable immediately, with the index catching
   up in the background.
4. **Portable.** The filesystem is the source of truth; the database is a
   rebuildable index/cache. Delete the DB and nothing of value is lost.

## How these docs are organized

- **[Architecture](architecture/invariants.md)** - start here. The
  [invariants](architecture/invariants.md) every change must preserve, the
  [cross-repo contract](architecture/cross-repo-contract.md) (every seam between
  the repos), and the [release pipeline](architecture/release-pipeline.md).
- **[Server](server/overview.md)** - package layout, [data model](server/data-model.md),
  [auth and security](server/auth-and-security.md), the [scanner](server/scanner.md),
  [media serving](server/media.md), the [baked-in web UI](server/web-ui.md),
  [configuration](server/configuration.md), and the [HTTP API](server/api/index.md).
- **[Player app](frontend/overview.md)** - the Expo codebase:
  [playback](frontend/playback.md) (the fiddly part), [the end of a book](frontend/end-of-book.md),
  [the sleep timer](frontend/sleep-timer.md), [player UI](frontend/player-ui.md),
  [offline downloads](frontend/offline.md), [state and data](frontend/state-and-data.md),
  [i18n](frontend/i18n.md), [testing](frontend/testing.md).
- **[The Bridge](bridge/index.md)** - `audiosilo-bridge`, the optional companion
  that writes to a server's libraries and runs its heavy jobs:
  [pairing and jobs](bridge/pairing-and-jobs.md), [mappings](bridge/mappings.md),
  [generating characters and recaps](bridge/generating.md) and
  [development](bridge/development.md).
- **[Metadata database](meta/overview.md)** - `audiosilo-meta`, the
  community audiobook metadata database behind meta.audiosilo.app that the server
  and player enrich books from: the [data model](meta/data-model.md), the
  [`metaserve` HTTP API](meta/api.md), and [contributing data](meta/contributing-data.md).
- **[Contributing](contributing/workspace.md)** - the
  [workspace setup](contributing/workspace.md), [per-repo gates and CI](contributing/gates-and-ci.md),
  [how to land a cross-repo change](contributing/cross-repo-changes.md),
  [cutting a release](contributing/releasing.md), and
  [writing these docs](contributing/documentation.md).

If you just want to *run* AudioSilo rather than hack on it, the
[user guide](/users/getting-started/first-run) covers installation and everyday use.

:::info The normative contract lives in the workspace
`~/dev/audiosilo/CROSS-REPO.md` (checked into the workspace root, alongside
`CLAUDE.md` and `CODE-HEALTH.md`) is the **normative** integration contract
between the repos. These docs are a readable tour of the same material - when a
seam changes, CROSS-REPO.md is updated first and these pages follow.
:::

## Where to start

- "I want to add or change an API endpoint" →
  [Cross-repo contract](architecture/cross-repo-contract.md), then
  [cross-repo changes](contributing/cross-repo-changes.md).
- "I want to understand why the code is shaped this way" →
  [Invariants](architecture/invariants.md).
- "Something won't play / wrong Content-Type / scope leak / scanner issue" →
  the [server docs](server/overview.md).
- "UI looks wrong / navigation / timeline math / offline" →
  the [frontend docs](frontend/overview.md).
- "Pairing, media auth, a new wire field, transcode" → **both repos**; read the
  [contract](architecture/cross-repo-contract.md) before starting.
