---
title: "Server overview"
description: "What audiosilo-server is, its design priorities, the full package layout with responsibilities, the dependency direction, and where business logic and tests live."
---

`audiosilo-server` is a self-hosted **audiobook server** written in Go: a JSON API
plus a baked-in admin/connect web UI, with the separately-built player frontend
served at `/web`. It is designed to be **safe for inexperienced users to expose to
the internet**: secure defaults, no default passwords, app-layer hardening, and
configurable TLS.

Module path: `github.com/kodestar/audiosilo-server`.

## Design priorities (in order)

When two concerns conflict, the earlier one wins:

1. **Safe to expose to the internet.** Hashed secrets, rate limiting, strict CSP,
   path-traversal defenses — see [Auth & security](auth-and-security.md).
2. **Fast regardless of library size.** FTS5 full-text search and keyset
   pagination keep queries O(1)-ish however deep the catalog grows — see
   [Data model](data-model.md).
3. **No-wait first connection.** The filesystem view (`GET /libraries/{id}/fs`)
   needs no prior indexing, so a freshly connected client browses immediately
   while the scanner works in the background — see [Scanner](scanner.md).
4. **Portable.** The filesystem is the source of truth for content; the SQLite
   database is a **rebuildable** index/cache. Content is never stored only in the
   DB, and durable user state survives a full index rebuild.

Priority 4 underpins the workspace-wide invariant that **the path is the
identity**: content is addressed by `(library_id, rel_path)`, never by a database
id (see [Architecture invariants](../architecture/invariants.md)).

## Package layout

```text
cmd/audiosilo/        entrypoint (flag wiring)
pkg/launcher/         PUBLIC run loop
pkg/match/            PUBLIC fuzzy book matcher
internal/config/      YAML + env config
internal/store/       SQLite open + migrations
internal/auth/        users, tokens, auth codes
internal/catalog/     the data layer
internal/library/     fs view + scanner
internal/metadata/    tag/ffprobe extraction
internal/media/       streaming + covers
internal/toolfetch/   ffmpeg/ffprobe download
internal/api/         HTTP transport
internal/server/      HTTP(S) server + TLS
internal/web/         baked-in web UI
testdata/library/     M4B test fixtures
```

### `cmd/audiosilo`

The binary entrypoint. It only parses flags (`--data`, `--ffprobe`, `--ffmpeg`,
`--setup`) and delegates everything to `pkg/launcher.Run`. Keep it thin — any
logic added here would be invisible to the desktop manager, which does not go
through `main`.

### `pkg/launcher` (public)

The shared run loop: load config → open the store → wire services → first-run
bootstrap (auto-admin banner, or the token-guarded `/setup` wizard in setup mode)
→ sync config-declared libraries → kick off the initial background scan → serve
until the context is cancelled. It is public (under `pkg/`) **precisely so the
audiosilo-manager desktop app can run the server in-process** via
`launcher.Run`/`launcher.Options` — see
[Manager server integration](../manager/server-integration.md). `Options` carries
embedding-friendly overrides (`Bind`, `TLSMode`, `PublicURL`, `Libraries`,
`OnURL`) that are re-validated after being layered onto the loaded config.
`resolveTools` here picks the ffmpeg/ffprobe binaries: an explicit path, a copy
next to the executable, `$PATH`, and only then a download via
`internal/toolfetch`.

### `pkg/match` (public)

A fuzzy **same-book matcher** (`Best`, `CleanTitle`, `SeqFromTitle`,
`Normalize`, `NormalizeSeries`) that identifies the same book across messy,
inconsistently-tagged titles. Public because the manager uses it to match an
Audible library against a server's index (which then feeds
`book_enrichment` — see [Data model](data-model.md)); it is also usable for
server-side enrichment/dedup.

### `internal/config`

YAML config (`config.yaml` in the data dir) plus `AUDIOSILO_*` environment
overrides, validation, and secure defaults. Owns the `TLSMode` enum
(`off`/`selfsigned`/`autocert`), the `Demo` config, `AppLinkConfig` for the
native deep-link association files, and `WebDir`. See
[Configuration](configuration.md).

### `internal/store`

Opens SQLite via `modernc.org/sqlite` (pure Go — the binary is CGO-free and
cross-compiles anywhere) and applies the embedded, append-only migrations in
`internal/store/migrations/`. `store.DB` routes reads and writes to separate
pools (single-connection writer, read-only reader pool over WAL) and provides
`WithTx` with slow-transaction logging. See [Data model](data-model.md) for the
schema and the SQLite rationale.

### `internal/auth`

Accounts and credentials: argon2id password hashing (`hash.go`), opaque
SHA-256-hashed bearer tokens (session + pairing kinds), and redeemable auth
codes (invite + recovery kinds) with atomic redemption. Also owns the admin
safety guards (`ErrLastAdmin`, `ErrAdminNeedsPassword`) and the demo-account
reaper queries. See [Auth & security](auth-and-security.md).

### `internal/catalog`

The data layer over the store: libraries, books/files/chapters, FTS search,
keyset-paginated listings, per-user listening state
(progress/bookmarks/notes/history/favourites), filesystem-based shares and the
`Scope` authorization model, folder-detection overrides, path-keyed enrichment,
and `MoveDurableState` (move-tracking). Handlers call into this package; it is
where catalog business logic belongs.

### `internal/library`

Two filesystem subsystems: `fsview.go` (instant, index-free directory browsing
via `BrowseFS`, plus `SafeJoin` — the path-traversal gate every user-derived
filesystem access must pass) and `scanner.go` (the background scanner that
builds the index: discovery, book detection, metadata enrichment, chapter
normalization, move detection, pruning). See [Scanner](scanner.md).

### `internal/metadata`

Metadata extraction: embedded tags in-process via `dhowden/tag`, durations /
chapters / codec via ffprobe when available (`probe.go`), and
`DeriveFromPath` — the structural path heuristic
(`Author/Series/01 - Title.m4b`) that fills gaps for untagged files. Defines the
normalized `metadata.Chapter` shape (with `file_path` and `book_offset`) that
makes single-file and multi-file books look identical to clients. All ffprobe
paths degrade gracefully when the tool is absent.

### `internal/media`

Serves audiobook bytes: `ServeFile` (HTTP Range support via
`http.ServeContent`, with byte-sniffed audio `Content-Type` so strict players
like iOS AVPlayer accept the stream), `Transcode` (on-the-fly ffmpeg pipe to
MP3 for codecs browsers can't decode), `DirectPlayable` (the codec allow-list
clients use to decide whether to request `?transcode=1`), and `EmbeddedCover`
extraction. See [Media & streaming](media.md).

### `internal/toolfetch`

On-demand download of a cached static ffmpeg/ffprobe build into
`<data>/tools` when no local copy is found (HTTPS, self-checked by running
`-version`). Degrades gracefully offline and retries on the next start. Only
consulted by `pkg/launcher.resolveTools` after all local resolution fails.

### `internal/api`

HTTP transport **only**: routing (`api.go` is the full route table), middleware
(auth, CORS, security headers, real-IP, timeouts), rate limiting
(`ratelimit.go`), and the `handlers_*.go` files. See the
[API introduction](api/index.md) and [reference](api/reference.md).

### `internal/server`

The HTTP(S) server itself: TLS modes (`off` for reverse proxies, `selfsigned`,
`autocert`/Let's Encrypt) and graceful shutdown.

### `internal/web`

The baked-in admin/connect UI — vanilla HTML/CSS/JS with no build step, embedded
in the binary — plus the mount that serves the **player** (the separate
audiosilo-frontend export) at `/web` from `web_dir`. Owns both CSP policies (the
strict site-wide one and the per-document `htmlCSP` for the player). See
[Web UI](web-ui.md).

## Dependency direction

```mermaid
graph TD
  cmd["cmd/audiosilo"] --> launcher["pkg/launcher"]
  launcher --> api & server & toolfetch
  api["internal/api<br/>(transport only)"] --> auth & catalog & library & media & config & web
  server --> config
  library --> catalog & metadata
  auth --> store
  catalog --> store
  catalog --> metadata
  web["internal/web"]
  media["internal/media"]

  classDef pub fill:#fdf2f8,stroke:#db2777;
  class launcher,cmd pub;
```

Rules of thumb:

- Everything DB-backed goes through `internal/store`; nothing else touches SQL
  connections directly.
- `internal/media` and `internal/web` are leaf packages — they know nothing
  about the catalog or auth.
- `pkg/match` is deliberately dependency-free of the rest of the server.

## `api` is transport-only

The single most important layering rule: **keep business logic out of
handlers**. `internal/api` decodes requests, enforces auth/scope, calls into
`auth`/`catalog`/`library`/`media`, and encodes responses — nothing more. Logic
placed in the non-`api` packages stays unit-testable without an HTTP harness,
and the same logic is reachable by future non-HTTP surfaces (the planned
WebSocket layer must reuse `catalog.SaveProgress`'s last-write-wins merge, for
example).

If you find yourself writing a loop, a merge rule, or an SQL query inside a
`handlers_*.go` file, it belongs in `catalog` (or `auth`, `library`, `media`)
instead.

## Test landscape

Every feature ships with a test (see
[Gates & CI](../contributing/gates-and-ci.md) for the full gate):

- **Handler/integration tests** use the `newTestEnv` harness in
  `internal/api/api_test.go`: an in-memory SQLite store (`store.Open(ctx,
  ":memory:")`), a seeded admin + auth code, and the real `testdata/library`
  fixtures (tiny generated M4B files under author/series folders).
  `newTestEnvWith` accepts a config mutator for routes registered at build time
  (e.g. the demo root redirect).
- **Pure-logic tests** sit next to the code: `internal/api/middleware_test.go`,
  `internal/catalog/shares_test.go` and `catalog_test.go` (with its own
  `newTestCatalog`), `internal/web/web_test.go`, and so on.
- A few scanner tests need `ffprobe` on the machine; without it they `t.Skip`
  (CI installs ffmpeg).
- **Security-critical code requires both an allowed and a denied regression
  test** — the enumerated list is in
  [Auth & security](auth-and-security.md#the-allowed--denied-test-rule).

Full gate, run from the repo root before calling any change done:

```sh
go build ./... && go vet ./... && go test -race ./... && golangci-lint run
```
