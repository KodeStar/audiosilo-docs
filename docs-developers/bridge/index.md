---
title: The Bridge
description: "The optional companion that writes to the libraries and runs the heavy jobs, so the server stays read-only: what it is, the pull-only rule, and how it relates to the server."
---

The **Bridge** is an optional, always-on companion to an AudioSilo server. It
**writes** to the library folders and runs the heavy jobs, so the server itself can
stay read-only and safe to expose to the internet. It is a separate program in its
own repository, `audiosilo-bridge`, and runs beside the server, usually as a second
container.

:::info[Public repository and images, built in phases]
The `audiosilo-bridge` repository is **public**, and its images,
`ghcr.io/kodestar/audiosilo-bridge`, are public from v0.3.0 and pull with no
login. A `v*` tag's GitHub release carries the binaries an
[ASR worker](workers.md#installing-a-worker) installed by hand runs. Bridge v0.3.0 is the release that speaks to server 2.4.0 (podcasts,
contributions, generating and detecting chapters): run v0.3.0 or later with a
2.4.0 server. Nothing checks the version: the server offers each feature by the
job kinds the Bridge's heartbeat reports, so an older Bridge pairs but lacks
them. The Bridge is being built in phases. **Phase 0** laid
the foundations: pairing, the heartbeat and the capability, the job queue with
leases, the library mapping checks and one proof job, `bridge.verify`. **Phase 1a**
added the first job that makes it useful,
[`sidecars.generate`](generating.md): characters and recaps for a book, written
into the book's [`.audiosilo/` folder](attachments.md) by the sidecars engine, with
its AI agents in a separate [agent container](agent-container.md). **Phase 1b**
added [ASR workers](workers.md): the same binary run natively where speech
recognition is fast (a Mac's Metal), taking the transcription off the Bridge.
**Phase 1c** added own-words, spoiler-free [descriptions](generating.md#the-description-step):
every generate run writes one too, and `sidecars.describe` writes one alone for a
book generated earlier. **Phase 1d** added [chapterless books](chapters.md): a book
with no chapter markers gets its chapters found in the narration, written as
`chapters.json`, and `chapters.detect` finds them on their own, with no agent.
**Phase 2a** added the server's managed modules, and **Phase 2b**
[contributions](contributions.md): an Accounts tab (a GitHub sign-in through the
AudioSilo Contributions App, and the agent's credential handed to the agent
container per run), `sidecars.contribute` and `meta.correct`, and the setup
checklist the heartbeat carries to the console.
**Phase 2c-1** adds [podcast shows](podcasts.md): subscribe/poll jobs, feed
details and artwork, guarded HTTP and sealed private-feed credentials.
**Phase 2c-2a** adds episode downloads, per-show API retention, pinned audio
generations and MP3 CHAP attachments. **Phase 2c-2b** adds on-demand episode
fetching on play, fetch status/Retry, one-ahead queue preparation and a
reserved download slot for play requests. **Phase 2c-3** adds server-side
podcast [directory search and OPML import/export](podcasts.md#discovery-and-opml-transfer)
with no Bridge change. **Phase 2d-1** adds the player's
[podcast views](podcasts.md#player-phase-2d-1) (first released in player 2.4.0), again
with no Bridge change, and **Phase 2d-2** its
[discovery, follow by URL and OPML screens](podcasts.md#player-discovery-and-opml-phase-2d-2)
(a CORS change on the server only). Read-along, Audible backups and file moves
arrive later.
:::

## What it is for

The server never writes into a library: it reads the folders, indexes them and
streams them. Anything that has to **change** files, or that is too heavy to run in
the server (speech recognition, an AI agent), belongs to the Bridge. Its jobs are
started from the server's admin console (and, for generating, from the player's
admin-only action).

The engine came from **audiosilo-sidecars**: its packages (speech recognition, the
agent pipeline, QA, spelling, contribution, the scheduler and supervisor) were
imported **with their history**, so `git log --follow` and `git blame` still reach
the reliability fixes made there. The shell around it (the server link, the job
runner, the mapping checks, the Bridge's own page) is new and smaller. Since Phase
1a the engine runs, behind `sidecars.generate`
([the engine wiring](generating.md#the-engine-wiring)).

## The pull-only rule

**The Bridge calls the server; the server never calls the Bridge.** There is no route
on the Bridge that the server calls and no Bridge address the server dials:

```mermaid
flowchart LR
    subgraph srv["audiosilo-server (read-only for content)"]
        api["/api/v1/bridge/*<br/>/api/v1/admin/bridge/*"]
        jobs[("bridge_jobs<br/>bridge_status")]
        api --- jobs
    end
    subgraph br["audiosilo-bridge"]
        link["server link"]
        runner["job runner + engine"]
        page["its own page<br/>(LAN, :8091)"]
    end
    subgraph ag["agent container"]
        agent["agent-runner<br/>(claude, codex)"]
    end
    worker["ASR worker<br/>(native, e.g. a Mac's Metal)"]
    files[("library folders")]
    staging[("staging volume")]
    admin["admin's browser"]

    link -->|"pair, heartbeat every 30 s,<br/>long-poll claims, progress"| api
    runner -->|"reads and writes"| files
    runner -->|"stages jobs, harvests"| staging
    agent -->|"claims and runs jobs"| staging
    worker -->|"long-polls segments,<br/>uploads transcripts"| page
    admin -->|"console: pair, Verify,<br/>Generate, cancel"| api
    admin -.->|"opens (link from the console)"| page
```

- The server **stores intents and status**: console and podcast jobs in
  `bridge_jobs`, follows and feed state in its catalog, and the Bridge's last
  heartbeat in `bridge_status`. It never opens a connection to the Bridge.
- The Bridge **pulls**: it sends a heartbeat every 30 seconds, long-polls for jobs,
  and reports progress, which renews each job's lease.
- The console links to the Bridge's own page (the heartbeat's `ui_url`) for the
  admin's browser to open, nothing more.
- **Saved content stays readable without the Bridge.** Its capability turns off
  two minutes after its last heartbeat; feed polling and new Bridge work wait
  for its return. Podcast reads still require a compatible client and scope.

This keeps the server's surface unchanged: it needs no route to the Bridge, no
credentials for it, and nothing about the Bridge's network.

## How it relates to the server

The Bridge is a client of the server's wire format alongside the player. The
server defines the contract and the Bridge mirrors it **by hand** (its
`internal/link`; there is no codegen). A
change to the server's `internal/bridge` or `handlers_bridge.go` is a change in
`audiosilo-bridge` too, with a test on each side. The seam is section 23 of the
workspace `CROSS-REPO.md`; this site's digest is
[the cross-repo contract](../architecture/cross-repo-contract.md#16-the-bridge).

| | Server (`audiosilo-server`) | Bridge (`audiosilo-bridge`) |
|---|---|---|
| Pairing | the console mints a code; `POST /bridge/pair` trades it for a token of kind `bridge` | exchanges the code once, keeps the token sealed |
| Status | stores the last heartbeat; `capabilities.bridge` while it is under 2 minutes old | `PUT /bridge/status` every 30 s |
| Jobs | `bridge_jobs`: the intent and the lease | `server_jobs`: the execution truth |
| Libraries | lists them (id, name, root) and each indexed book's files with their sizes | checks where it sees each one, and whether it can write there |
| UI | Settings > Bridge, the book page's Community card and the series cards in the admin console; the player's book page for an admin | its own page on port 8091 |
| Generated content | indexes a book's `.audiosilo/` files and serves them on `/meta` | writes them |

A few rules hold across the seam:

- **Console Bridge actions are admin-only.** Only an admin pairs a Bridge,
  queues console jobs or cancels them, and the Bridge's token works only while
  that admin is enabled. Podcast follow/unfollow/check are separate module user
  actions for adults, not demo accounts; the server creates their jobs.
- **One Bridge per server.** Pairing another revokes the first.
- **Library mappings are checked, never assumed.** The Bridge proves it sees the
  server's copy of a library (a known book's file sizes, or a podcast root marker) before
  anything may write there. See [Library mappings](mappings.md).
- **Path is the identity**, as everywhere: a job is about `(library_id, rel_path)`,
  follows its book when it moves, and goes with its library.
- **Hidden folders stay hidden.** No server route reaches content through a
  dot-folder by name (it never indexes, lists, streams or serves one), so the
  folder the Bridge keeps its files in, inside a book (`.audiosilo/`), can never
  become a phantom book or a streamable file. See
  [the hidden-path rule](attachments.md#the-hidden-path-rule).
- **Agents never touch the library.** The AI agent CLIs run only in the
  [agent container](agent-container.md), which sees a staging folder and its own
  config, nothing else.

## Compatibility

Everything is additive. An older server has no Bridge routes and no `bridge` flag:
the Bridge's pairing gets a `404` (or `405`) and says the server is too old. The
player's first Bridge UI (Phase 1a, admins only) is gated on the flag and the
`sidecars` feature, so it never shows against an older server. Players shipped
before it never see the Bridge, but they do see generated characters and recaps
for a book matched with community metadata (merged into its `/meta` work, without
the mark; see [generated content](../server/api/reference.md#generated-content)).

## In these pages

- [Pairing and jobs](pairing-and-jobs.md) - the token, the heartbeat (its
  `accepts` negotiation and the setup checklist) and the capability, the job model (states, leases, attempts, cancel, resume after a
  restart) and `bridge.verify`.
- [Library mappings](mappings.md) - how the Bridge finds each library and proves it
  has the right one.
- [Characters and recaps](generating.md) - `sidecars.generate`: queueing, the
  estimate, the run, its progress, parks and result, the description step and
  `sidecars.describe`, budgets and the transcript retention.
- [Chapterless books](chapters.md) - Phase 1d: the windows, the
  `chapter_detecting` stage and its detector, `chapters.detect`, and how the
  chapters reach the server.
- [The .audiosilo folder](attachments.md) - where the results go, their formats,
  and how the server finds, checks and serves them.
- [The agent container](agent-container.md) - where the AI agents run, the
  staging protocol, and the credential hand-off.
- [Contributions](contributions.md) - Phase 2b: the Accounts tab (the GitHub
  sign-in, the agent credentials), `sidecars.contribute` and `meta.correct`.
- [Podcasts](podcasts.md) - feed files, polling, downloads, retention,
  generation/publication recovery, CHAP, private credentials and the HTTP guard.
- [Configuration](configuration.md) - the Bridge's settings and environment, the
  images and the compose example.
- [Development](development.md) - the gate, the layout and the Bridge's own page.
- The server's routes are in the [API reference](../server/api/reference.md#the-bridge).
