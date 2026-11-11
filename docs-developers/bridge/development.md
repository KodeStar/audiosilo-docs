---
title: Bridge development
description: "Working in audiosilo-bridge: the gate and CI, the package layout and dependency direction, the -tags embedui seam for the page, and the page's API with its local-network guard."
---

`audiosilo-bridge` is a Go module (`github.com/kodestar/audiosilo-bridge`, Go 1.26,
AGPL-3.0) with a small web page in `web/` (Vite, React 19, TypeScript, Tailwind v4,
Node 24).

- The repository is public (`github.com/KodeStar/audiosilo-bridge`), and its images
  are public from v0.3.0.
- Its own `CLAUDE.md` and `PACKAGES.md` (the per-package rules and history) are
  authoritative.
- The seam with the server is section 23 of the workspace `CROSS-REPO.md`.

## The gate

Run each side you touched before calling a change done, plus an image build when
the Dockerfile changed:

```sh
cd ~/dev/audiosilo/audiosilo-bridge
go build ./... && go vet ./... && go test -race ./... && golangci-lint run   # Go
cd web && npm run typecheck && npm run lint && npm run format && npm test   # the page
docker build --target slim .   # a Dockerfile change: slim | cuda | full | agent
```

- **`npm run typecheck`, never `npx tsc --noEmit`**: the root `tsconfig.json` only
  holds project references, so a bare `tsc --noEmit` checks nothing.
- **golangci-lint v2** at a green baseline, as in the other Go repos: fix new
  findings, don't widen the excludes.
- A Go version bump is three edits: `go.mod`, `.go-version` and the Dockerfile's
  `golang:` tag.
- **The Audible fake** and its tests build only with the
  `audiblefake` tag, so the untagged gate skips them. A change to the Audible
  packages also runs:

  ```sh
  go vet -tags audiblefake ./internal/audible/... ./internal/audibleacct ./internal/audiblejob ./internal/audiblesync ./internal/app ./cmd/audiblefake
  go test -race -tags audiblefake ./internal/audible/... ./internal/audibleacct ./internal/audiblejob ./internal/audiblesync
  go test -race -tags audiblefake -run Audible ./internal/app
  ```

  See [Audible](audible.md#the-audible-fake).

The workflows:

| Workflow | When | What |
|---|---|---|
| `.github/workflows/ci.yml` | every pull request and every push to `main` | a **go** job (build, vet, `go test -race`, the `audiblefake` steps above, golangci-lint) and a **web** job (`npm ci`, typecheck, lint, the prettier check, the tests and a production build) |
| `image.yml` | `v*` tags and manual dispatch | builds and pushes the four images to the public GHCR package: `full`, `slim` and `agent` for amd64 and arm64, `cuda` for amd64. Which tags each publishes is in [the images](configuration.md#the-images) |
| `release.yml` | `v*` tags | attaches the four worker archives and `checksums.txt` to the tag's GitHub release (see [Installing a worker](workers.md#installing-a-worker)) |

To run it locally:

```sh
scripts/build-web.sh                    # build the page and embed it into bin/audiosilo-bridge
./bin/audiosilo-bridge --data ./data    # the first start prints the page's password ONCE
./bin/audiosilo-bridge reset-password --data ./data   # lost it: a new one, printed once
```

Then open `http://localhost:8091`, sign in, and pair it with a local server (see
[Pairing and jobs](pairing-and-jobs.md#pairing)). The server's own local stack is
in [the workspace guide](../contributing/workspace.md#run-the-whole-stack-locally).
Run it with `AUDIOSILO_TLS_MODE=off` so the Bridge can reach it over plain HTTP.

## The `-tags embedui` seam

The page is built into `web/dist`, which `go:embed` can't reach from
`internal/web`. So:

- the **default build** (`go build ./...`, the Go gate, CI's go job) embeds a tiny
  placeholder page from `internal/web/dist-placeholder/`, and needs no Node and no
  generated files;
- **`-tags embedui`** embeds `internal/web/dist/` instead, which
  `scripts/build-web.sh` fills. The script builds `web/`, copies `web/dist` there
  and builds `bin/audiosilo-bridge` with the tag. `--sync-only` skips the Go build.
  The Dockerfile does the same in its build stage.

`internal/web/dist/` is gitignored: **never commit it**. The embedded page is served
with a single-page-app fallback: an extensionless path is a client-side route and
gets `index.html`, while a missing file with an extension is a real `404`.

## Layout

```
cmd/audiosilo-bridge/  serve (default), version, agent-runner, agent-login; --data, --listen
internal/
  -- the shell (new in Phase 0) --
  app/        the wiring, and the page API's Backend: pairing, the heartbeat, mapping checks
  api/        the page's HTTP API (transport only; local-network guard; password always)
  link/       the client of the server's Bridge routes; hand-mirrored wire types
  mapping/    library mappings: SafeJoin, the size comparison, the write probe
  jobs/       the generic runner: lanes, claims, the lease keepalive, cancel, resume
  verify/     bridge.verify, the proof job
  -- Phase 1a --
  generate/   sidecars.generate: server job -> engine book, progress and parks, the
              .audiosilo/ write, the heartbeat's estimates, the transcript retention;
              sidecars.describe (Phase 1c): a description from a finished run's notes;
              chapters.detect and chapters.json (Phase 1d): chapters found in the narration;
              sidecars.contribute (Phase 2b): a share of a run's kept results
  agentproto/ the staging protocol both sides share (names, JSON, request validation,
              regular-file reads); a leaf
  agentbox/   the Bridge's side: an agent.Runner that stages, waits, harvests
  agentrun/   the agent container's runner (agent-runner) and agent-login
  logring/    recent log lines for the page (secret-looking attributes redacted)
  web/        go:embed of the page (chosen by build tag)
  secrets/    sealed-file secrets keyed by AUDIOSILO_BRIDGE_SECRET_KEY or secret.key
  config/     config.yaml + AUDIOSILO_BRIDGE_* (bridge.go: the Bridge's own settings)
  store/      SQLite, append-only migrations (0001 the engine, 0002 server_jobs,
              0003 generate_books, server_jobs.server_id, books.contrib_mode,
              0004 workers, 0005 books.goal, 0006 accounts, 0007-0008 podcasts,
              0009-0012 and 0014 Audible, 0013 idx_books_unfinished: a partial
              index whose WHERE is unfinishedBook's word for word, so the
              periodic passes scan only the books the engine may act on)
  -- Phase 2b --
  ghauth/     the GitHub App's device flow, refresh, revoke and /user; a leaf
  accounts/   the Accounts tab: the GitHub sign-in and the agent credentials (vault-sealed)
  setup/      the setup checklist the heartbeat and the Status tab show; pure
  correct/    meta.correct: an admin's corrections as one correction-batch issue
  auth/       the page's single password, hashed sessions, the login limiter
  -- Phase 1b --
  workerproto/ the worker wire protocol (routes, version, task and result shapes); a leaf
  workers/    the Bridge's side: the segment queue, leases, registry and the ASR router
  worker/     `audiosilo-bridge worker`: client, run loop, spool, the service install
  workerdist/ the worker builds the images carry and install.sh (the install routes); a leaf
  -- the engine (from audiosilo-sidecars; wired by app/engine.go since Phase 1a) --
  toolfetch/ audio/ asr/ transcript/ ebook/ scratch/ qa/ spelling/ agent/ repair/
  pipeline/ contrib/ state/ eta/ scheduler/ supervisor/ metaops/ events/ pricing/ fsutil/
  chapterdetect/ (Phase 1d: a chapterless book's chapters from its narration; pure)
web/          the page: Vite + React 19 + TypeScript + Tailwind v4
docker/       entrypoint.sh (owns /bridge-data, umask 022, drops to PUID:PGID)
Dockerfile    the slim, full, cuda and agent targets
compose.example.yaml  the server, the Bridge and the agent container
```

**Dependency direction:**

- `app` depends on everything in the shell.
- `api` calls only the Backend interface `app` implements. It imports the other
  packages for their types.
- `verify -> {jobs, link, mapping}`; `jobs -> {link, store}`; `mapping -> link`;
  `generate -> {jobs, link, mapping, store, engine}`.
- `accounts -> {agentproto, ghauth, secrets, store}`;
  `correct -> {contrib, jobs, metaops}`; `setup -> link`.
- `agentbox -> {agent, agentproto}`; `agentrun -> agentproto`.
- `link` and `agentproto` are leaves.

The engine keeps the directions it had in audiosilo-sidecars, which the Bridge's
`PACKAGES.md` records.

Conventions that carry the design:

- **`internal/api` is transport only.** It validates and calls the Backend. The
  logic lives in `app`, `jobs`, `mapping` and `verify`, where it is unit-tested.
- **The wire to the server is mirrored by hand** in `internal/link`, as every client
  of the server does. A server change to `internal/bridge` or `handlers_bridge.go`
  is a change here too, with a test on both sides. The `X-AudioSilo-Client` value it
  sends on every call, `AudioSilo Bridge/<version> (<os>)`, must parse with the
  server's `auth.ParseClient`; a test holds the server's pattern.
- **Secrets are never logged or echoed.**
  - The page's password is printed once at the first start (to standard error,
    never through the logger), and once by `reset-password` (to standard output).
  - The server token, the GitHub sign-in and the Accounts tab's agent credentials
    are sealed. The page API says only whether one is set.
  - The log ring redacts attributes whose key looks like a secret (`token`,
    `password`, `code`, `key`, `secret`, `cookie`, `authorization`).
- **Every feature ships with a test**, and the security-critical code (the
  local-network guard, the page's auth, `SafeJoin`, the secrets, the claim and
  lease handling) with an allowed **and** a denied test.
- **Writes into a library** go only through typed operations. Every path goes
  through `mapping.SafeJoin` against a **checked** mapping. Each file is written to
  a temporary file and renamed, with umask 022, and a targeted rescan follows
  (`POST /bridge/rescan`). A library that isn't mapped and writable refuses them.
  The jobs that write:
  - the generate, describe, `chapters.detect` and `readalong.align` jobs write only
    a book's [`.audiosilo/` files](attachments.md#how-the-bridge-writes-them),
    `description.json` among them;
  - the podcast jobs write a show's files in a podcast library
    ([Podcasts](podcasts.md));
  - `audible.import` installs a backed-up title without replacing anything
    ([The hardened transfer](audible.md#the-hardened-transfer-internaltransfer)).

  A delete moves the files into `.audiosilo-trash/` first, as podcast retention
  does
  ([Retention policy and deletion authority](podcasts.md#retention-policy-and-deletion-authority)).
- **No agent CLI runs in the Bridge.** The engine gets only `agentbox`'s runner.
  The local claude and codex runners stay for their output parsers
  (`agent.ClaudeResult`, `agent.CodexResult`, shared with the container runs) and
  their tests.

## The page and its API

The Bridge serves its own page and a small JSON API under `/api` on its `listen`
address (`:8091`). The page's icon is `public/favicon.svg`, also in the placeholder
page.

The page follows the system colour scheme, dark by default. Under
`prefers-color-scheme: light`, `index.css` redefines the brand tokens and the state
shades it uses with the server console's light palette. `src/theme.test.ts` fails
on a token or a used shade that the light block misses.

The page has seven tabs:

- **Status.** It leads with a **Get set up** card: the
  [setup checklist](pairing-and-jobs.md#the-setup-checklist), with an **Open**
  link to the tab of each step still to do, until every required step is done.
  Below it are pairing, the last heartbeat, the job kinds and lanes, and where the
  secret key came from. A **Characters and recaps** card shows the agent container
  and each CLI's version and credential kind, the speech recognition, the monthly
  budget with this month's spend, the per-book cap and the transcript retention.
  The card notes where each is set:
  - the monthly budget on the **Settings** tab, applied straight away. When
    `AUDIOSILO_BRIDGE_AGENT_MONTHLY_BUDGET_USD` sets it, it applies at the next
    start;
  - the per-book cap and the retention in `config.yaml`, applied at the next
    start.
- **Libraries.** Each server library, the folder the Bridge uses and its last
  check, with **Check now**.
- **Jobs.** The jobs it ran, with cancel, and a `bridge.verify` result as a file
  table.
  - For a `sidecars.generate`, `sidecars.describe` or `chapters.detect` job it
    shows the stage, progress, cost, the park's code, hint and retry time, and
    **Retry** while the job is parked.
  - Once the job is done it shows the files it saved and whether a description
    came. For a describe job it shows what its check measured against, and for a
    chapters job how many chapters it found.
  - A known kind is named in words only, with its raw kind in the label's tooltip.
  - A park leads with its hint for people, with the engine's own message under a
    collapsed **Details** line.
- **Settings.** Its public address, the check interval, the ASR fallback, the
  monthly agent budget and the password.
- **Accounts.** The GitHub sign-in and the agent's credentials (see
  [Contributions](contributions.md#the-pages-routes)).
- **Workers.** The [ASR workers](workers.md): add one (its token shown once in the
  commands to run), its state and figures, and remove.
- **Logs.** Recent lines.

The page has no router. The tab rides the URL hash, and `#/jobs/<id>` opens one
job; the server's console links a parked job there, by its server job id.

| Route | What it does |
|---|---|
| `GET /api/health` | `{ "status": "ok" }`, no sign-in |
| `POST /api/login` | `{ password }` -> `{ token }`; rate limited per address |
| `POST /api/logout` | ends the session |
| `POST /api/password` | `{ current, new }`, at least 8 characters. A wrong current password is `403`, not `401`, since a `401` signs the page out. `409` means the current password was right, but a reset or another change replaced it in the meantime. Nothing changed, so sign in with the new one |
| `GET /api/status` | the Bridge's state: version, pairing (with the reason when the server refuses its token), online, last heartbeat and error, kinds, lanes, the secret key's source, `public_url`, the server address the pairing form starts with, `setup` and `setup_complete`, and `worker_downloads`. `worker_downloads` is true when the image's worker builds are there, so the [worker install](workers.md#installing-a-worker) is served |
| `POST /api/pair` | `{ server_url, code }`: pair with a server. The failures are in [the pairing failure table](pairing-and-jobs.md#pairing) and [below](#post-apipair-failures) |
| `POST /api/unpair` | forget the token here |
| `GET /api/libraries` | the server's libraries with the Bridge's folder, whether it is configured, and the last check |
| `PUT /api/libraries/{id}` | `{ mount_path }` (absolute; `""` goes back to the server's path), then re-checks that library; `409 locked` when `AUDIOSILO_BRIDGE_LIBRARIES` sets the mappings |
| `POST /api/libraries/check` | check the mappings now (`202`) |
| `GET` / `PUT /api/settings` | `public_url`, `mapping_check_minutes`, `asr_worker_fallback`, `monthly_budget_usd` with `budget_reviewed`, and which settings the environment locks. A locked one is never written to `config.yaml`. `asr_worker_fallback` is `local` or `wait`, and an empty one on a save keeps it. `monthly_budget_usd` is `0` or more and applies live. A save records `agent.budget_reviewed_at`, a value the environment locks can't change, and an absent value on a save keeps it |
| `GET /api/accounts`, `POST /api/accounts/github/device`, `DELETE /api/accounts/github`, `PUT` / `DELETE /api/accounts/agent` | the Accounts tab: see [Contributions](contributions.md#the-pages-routes). No route answers a credential back |
| `GET /api/jobs` | the jobs it ran, newest first (`before`, `limit` up to 200) |
| `GET /api/jobs/{id}` | one job (`404` when the Bridge has no such job) |
| `POST /api/jobs/{id}/cancel` | stop a job it is running (`202`; `404` when it isn't running here) |
| `POST /api/jobs/{id}/retry` | retry a parked job's work (`202`). It re-admits the job's engine book, or makes a job waiting on its own park look again now. `404` for no such job here, `409` when it isn't parked |
| `GET /api/engine` | the engine's state: `started`; the `agent` container (backend, available and why not, version, slots, last heartbeat, each CLI's version and credential kind, subscription, the staging dir); `asr`, where speech recognition runs now (`backend` `worker` with a worker connected, and `worker_fallback`); `monthly_budget_usd`, `month_spent_usd`, `book_budget_usd` and `transcript_retention_days` |
| `GET /api/logs` | recent log lines (`after`, `limit` up to 1000, `level`) |
| `GET /api/workers` | the paired workers: the `workers` row (name, created and last seen, version, platform, backend, device, model, segments, audio and decode seconds) with `connected` and the `task` it decodes now |
| `POST /api/workers` | `{ name }` -> `201 { worker, token }`: pair a worker. The token is in this answer only. `400` without a name |
| `DELETE /api/workers/{id}` | remove a worker, revoking its token (`204`; `404` for none) |
| `GET /worker/install.sh` | **no sign-in**: the worker's install script with the Bridge's address baked in. It always answers `200`. When it can't serve the install (no builds, a bad `Host`, a caller outside the local network), the script prints why and exits 1 (see [Installing a worker](workers.md#installing-a-worker)) |
| `GET /worker/download/{os}/{arch}` | **no sign-in**: the gzipped worker build for `darwin` or `linux`, `arm64` or `amd64`. `404` with a plain-text reason for another platform, or for a Bridge without the builds |

Errors are `{ "error": "..." }`, with a `code` where a client branches on it. The
page's API mirrors these shapes by hand in `web/src/api/types.ts`.

### `POST /api/pair` failures

| Status | When |
|---|---|
| `400` | the address isn't an absolute `http(s)` URL |
| `422` | the server refused the code, is too old for a Bridge (`404`/`405`), refused the pairing otherwise, or has a certificate the Bridge can't verify. For the certificate, the message says to use the server's `http://` address |
| `502` | the Bridge can't reach the server, the server answered `5xx`, or its answer can't be used. For a server it can't reach, the message names the address, and for a failed lookup, a refused connection or a timeout, the address to use instead |
| `500` | the server accepted the code, but the Bridge couldn't save the pairing. The message is a sentence. The token is removed again, so make a new code |
| `409` | the Bridge is already paired |

### The local-network guard

Two rules protect the page, and both hold for **every** request, loopback included:

- **Local network only.** A connection whose address isn't loopback, private
  (RFC 1918, or an IPv6 unique local address) or link-local gets
  `403 {"code": "lan_only"}`, and the page shows a "local network only" screen.
  The exception is `/worker/install.sh`, which answers with a script (see
  [Installing a worker](workers.md#installing-a-worker)).
  - The check reads the connection's own address, **never** a forwarded header. So
    the page isn't meant to sit behind a reverse proxy, and a client can't claim to
    be local.
  - Carrier-grade NAT ranges, Tailscale's among them, are **not** local.
- **The password, always.** Every route needs a session token, even from the same
  machine, except `/api/health`, `/api/login` and the two
  [worker install routes](workers.md#security) (`/worker/install.sh`,
  `/worker/download/...`). The worker protocol under `/worker/v1` takes a worker
  token instead. An agent container sharing the Bridge's network could otherwise
  reach the page. The compose example gives it a network of its own, but nothing
  makes an installation do so, and the research spike that settled the agent design
  showed it could.

Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and
`Referrer-Policy: no-referrer`, and the API's add a `default-src 'none'` content
security policy and `Cache-Control: no-store`.
