---
title: Bridge development
description: "Working in audiosilo-bridge: the gate and CI, the package layout and dependency direction, the -tags embedui seam for the page, and the page's API with its local-network guard."
---

`audiosilo-bridge` is a Go module (`github.com/kodestar/audiosilo-bridge`, Go 1.26,
AGPL-3.0) with a small web page in `web/` (Vite, React 19, TypeScript, Tailwind v4,
Node 24). The repository is public (`github.com/KodeStar/audiosilo-bridge`; its
images are public from v0.3.0); its own `CLAUDE.md` and `PACKAGES.md` (the
per-package rules and history) are authoritative, and the seam with the server is
section 23 of the workspace `CROSS-REPO.md`.

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

CI (`.github/workflows/ci.yml`) runs both sides on every pull request and every
push to `main`: a **go** job (build, vet, `go test -race`, golangci-lint) and a
**web** job (`npm ci`, typecheck, lint, the prettier check, the tests and a
production build). `image.yml` builds and pushes the four images to the public
GHCR package on `v*` tags and on manual dispatch (`full`, `slim` and `agent` for
amd64 and arm64, `cuda` for amd64); which tags each publishes is in
[the images](configuration.md#the-images). `release.yml` attaches the four worker
archives and `checksums.txt` to a `v*` tag's GitHub release (see
[Installing a worker](workers.md#installing-a-worker)).

To run it locally:

```sh
scripts/build-web.sh                    # build the page and embed it into bin/audiosilo-bridge
./bin/audiosilo-bridge --data ./data    # the first start prints the page's password ONCE
./bin/audiosilo-bridge reset-password --data ./data   # lost it: a new one, printed once
```

Then open `http://localhost:8091`, sign in, and pair it with a local server (see
[Pairing and jobs](pairing-and-jobs.md#pairing)). The server's own local stack is
in [the workspace guide](../contributing/workspace.md#run-the-whole-stack-locally);
run it with `AUDIOSILO_TLS_MODE=off` so the Bridge can reach it over plain HTTP.

## The `-tags embedui` seam

The page is built into `web/dist`, which `go:embed` can't reach from
`internal/web`. So:

- the **default build** (`go build ./...`, the Go gate, CI's go job) embeds a tiny
  placeholder page from `internal/web/dist-placeholder/`, and needs no Node and no
  generated files;
- **`-tags embedui`** embeds `internal/web/dist/` instead, which
  `scripts/build-web.sh` fills (it builds `web/`, copies `web/dist` there and
  builds `bin/audiosilo-bridge` with the tag; `--sync-only` skips the Go build).
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
              0004 workers, 0005 books.goal, 0006 accounts)
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

**Dependency direction:** `app` depends on everything in the shell; `api` calls
only the Backend interface `app` implements (it imports the other packages for
their types); `verify -> {jobs, link, mapping}`; `jobs -> {link, store}`;
`mapping -> link`; `generate -> {jobs, link, mapping, store, engine}`;
`accounts -> {agentproto, ghauth, secrets, store}`; `correct -> {contrib, jobs,
metaops}`; `setup -> link`;
`agentbox -> {agent, agentproto}`, `agentrun -> agentproto`; `link` and
`agentproto` are leaves. The engine keeps the directions it had in
audiosilo-sidecars (`PACKAGES.md`).

Conventions that carry the design:

- **`internal/api` is transport only.** It validates and calls the Backend; the
  logic lives in `app`, `jobs`, `mapping` and `verify`, where it is unit-tested.
- **The wire to the server is mirrored by hand** in `internal/link`, as every client
  of the server does. A server change to `internal/bridge` or `handlers_bridge.go`
  is a change here too, with a test on both sides. The `X-AudioSilo-Client` value it
  sends on every call, `AudioSilo Bridge/<version> (<os>)`, must parse with the
  server's `auth.ParseClient`; a test holds the server's pattern.
- **Secrets are never logged or echoed.** The page's password is printed once at the
  first start (to standard error, never through the logger) and once by
  `reset-password` (to standard output), the server token, the
  GitHub sign-in and the Accounts tab's agent credentials are sealed (the page API
  says only whether one is set), and the log ring redacts attributes whose key looks like a secret
  (`token`, `password`, `code`, `key`, `secret`, `cookie`, `authorization`).
- **Every feature ships with a test**, and the security-critical code (the
  local-network guard, the page's auth, `SafeJoin`, the secrets, the claim and
  lease handling) with an allowed **and** a denied test.
- **Writes into a library** go only through typed operations, every path through
  `mapping.SafeJoin` against a **checked** mapping, written to a temporary file and
  renamed, umask 022, with a targeted rescan after (`POST /bridge/rescan`). A
  library that isn't mapped and writable refuses them. The only write (Phase 1a,
  and Phase 1c's `description.json`) is a
  book's [`.audiosilo/` files](attachments.md#how-the-bridge-writes-them); deletes,
  when a later phase needs them, move to `.audiosilo-trash/`.
- **No agent CLI runs in the Bridge** (decision 15). The engine gets only
  `agentbox`'s runner; the local claude and codex runners stay for their output
  parsers (`agent.ClaudeResult`, `agent.CodexResult`, shared with the container
  runs) and their tests.

## The page and its API

The Bridge serves its own page and a small JSON API under `/api` on its `listen`
address (`:8091`). The page has seven tabs: **Status** (led by a **Get set up** card,
the [setup checklist](pairing-and-jobs.md#the-setup-checklist) with an **Open**
link to the tab of each step still to do, until every required step is done; pairing, the last heartbeat,
the job kinds and lanes, where the secret key came from, and a **Characters and
recaps** card: the agent container and each CLI's version and credential kind, the
speech recognition, the monthly budget with this month's spend, the per-book cap
and the transcript retention, noting that the monthly budget is set on the
**Settings** tab and applies straight away (when
`AUDIOSILO_BRIDGE_AGENT_MONTHLY_BUDGET_USD` sets it, that applies at the next
start) while the per-book cap and the retention are `config.yaml` settings
applied at the next start), **Libraries** (each server library, the folder the
Bridge uses and its last check, with **Check now**), **Jobs** (the jobs it ran,
with cancel, a `bridge.verify` result as a file table, and for a
`sidecars.generate`, `sidecars.describe` or `chapters.detect` job its stage, progress, cost, the park's code, hint and
retry time, and **Retry** while it is parked; once done, the files it saved and
whether a description came, for a describe job what its check measured against, and
for a chapters job how many chapters it found), **Settings** (its public address,
the check interval, the ASR fallback, the monthly agent budget, the password),
**Accounts** (Phase 2b: the GitHub sign-in and the agent's credentials; see
[Contributions](contributions.md#the-pages-routes)), **Workers** (the [ASR workers](workers.md): add one, its token shown once in the commands to run, its state and figures, remove) and **Logs**
(recent lines). It has no router: the tab rides the URL hash, and `#/jobs/<id>`
opens one job (the server's console links a parked job there, by its server job
id).

| Route | What it does |
|---|---|
| `GET /api/health` | `{ "status": "ok" }`, no sign-in |
| `POST /api/login` | `{ password }` -> `{ token }`; rate limited per address |
| `POST /api/logout` | ends the session |
| `POST /api/password` | `{ current, new }`; at least 8 characters. A wrong current password is `403`, not `401` (a `401` signs the page out) |
| `GET /api/status` | the Bridge's state: version, pairing (with the reason when the server refuses its token), online, last heartbeat and error, kinds, lanes, the secret key's source, `public_url`, the server address the pairing form starts with, (Phase 2b) `setup` and `setup_complete`, and `worker_downloads` (true when the image's worker builds are there, so the [worker install](workers.md#installing-a-worker) is served) |
| `POST /api/pair` | `{ server_url, code }`: pair with a server. `400` for an address that isn't an absolute `http(s)` URL; `422` when the server refused the code, is too old for a Bridge (`404`/`405`), refused the pairing otherwise, or has a certificate the Bridge can't verify (the message says to use its `http://` address); `502` for a server it can't reach; `409` when already paired |
| `POST /api/unpair` | forget the token here |
| `GET /api/libraries` | the server's libraries with the Bridge's folder, whether it is configured, and the last check |
| `PUT /api/libraries/{id}` | `{ mount_path }` (absolute; `""` goes back to the server's path), then re-checks that library; `409 locked` when `AUDIOSILO_BRIDGE_LIBRARIES` sets the mappings |
| `POST /api/libraries/check` | check the mappings now (`202`) |
| `GET` / `PUT /api/settings` | `public_url`, `mapping_check_minutes`, `asr_worker_fallback` (`local` or `wait`; empty on a save keeps it), `monthly_budget_usd` (Phase 2b: `0` or more, applied live; a save records `agent.budget_reviewed_at`, and a value the environment locks can't change; absent on a save keeps it) with `budget_reviewed`, and which settings the environment locks (a locked one is never written to `config.yaml`) |
| `GET /api/accounts`, `POST /api/accounts/github/device`, `DELETE /api/accounts/github`, `PUT` / `DELETE /api/accounts/agent` | Phase 2b's Accounts tab: see [Contributions](contributions.md#the-pages-routes). No route answers a credential back |
| `GET /api/jobs` | the jobs it ran, newest first (`before`, `limit` up to 200) |
| `GET /api/jobs/{id}` | one job (`404` when the Bridge has no such job) |
| `POST /api/jobs/{id}/cancel` | stop a job it is running (`202`; `404` when it isn't running here) |
| `POST /api/jobs/{id}/retry` | retry a parked job's work (`202`): re-admit its engine book, or make a job waiting on its own park look again now; `404` for no such job here, `409` when it isn't parked |
| `GET /api/engine` | the engine's state: `started`, the `agent` container (backend, available and why not, version, slots, last heartbeat, each CLI's version and credential kind, subscription, the staging dir), `asr` (where speech recognition runs now: `backend` `worker` with a worker connected, and `worker_fallback`), `monthly_budget_usd`, `month_spent_usd`, `book_budget_usd`, `transcript_retention_days` |
| `GET /api/logs` | recent log lines (`after`, `limit` up to 1000, `level`) |
| `GET /api/workers` | the paired workers: the `workers` row (name, created and last seen, version, platform, backend, device, model, segments, audio and decode seconds) with `connected` and the `task` it decodes now |
| `POST /api/workers` | `{ name }` -> `201 { worker, token }`: pair a worker; the token is in this answer only. `400` without a name |
| `DELETE /api/workers/{id}` | remove a worker, revoking its token (`204`; `404` for none) |
| `GET /worker/install.sh` | **no sign-in**: the worker's install script with the address this request reached baked in; past the local-network guard (a `403` like every route), always `200` and a script, one that prints why and exits 1 when it can't be served (see [Installing a worker](workers.md#installing-a-worker)) |
| `GET /worker/download/{os}/{arch}` | **no sign-in**: the gzipped worker build for `darwin` or `linux`, `arm64` or `amd64`; `404` with a plain-text reason for another platform or a Bridge without the builds |

Errors are `{ "error": "..." }`, with a `code` where a client branches on it. The
page's API mirrors these shapes by hand in `web/src/api/types.ts`.

### The local-network guard

Two rules protect the page, and both hold for **every** request, loopback included:

- **Local network only.** A connection whose address isn't loopback, private
  (RFC 1918, or an IPv6 unique local address) or link-local gets
  `403 {"code": "lan_only"}`, and the page shows a "local network only" screen. The
  check reads the connection's own address, **never** a forwarded header (so the
  page isn't meant to sit behind a reverse proxy, and a client can't claim to be
  local). Carrier-grade NAT ranges (Tailscale's among them) are **not** local.
- **The password, always.** Every route but `/api/health`, `/api/login` and the
  two [worker install routes](workers.md#security) (`/worker/install.sh`,
  `/worker/download/...`) needs a session token, even from the same machine. The
  worker protocol under `/worker/v1` takes a worker token instead. An agent container sharing the
  Bridge's network could otherwise reach the page (the compose example gives it a
  network of its own, but nothing makes an installation do so); the research spike
  that settled the agent design showed it could.

Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and
`Referrer-Policy: no-referrer`, and the API's add a `default-src 'none'` content
security policy and `Cache-Control: no-store`.
