---
title: Quality gates and CI
description: "Each repo's full pre-merge gate, what CI actually runs, the green-baseline lint policy, test conventions, and the Definition of Done."
---

Every repo has a **full gate** — the exact command sequence CI runs on every PR
and push. A change is not done until the gate of every repo you touched passes
locally. The gates are per-repo and independent: don't run Go checks for a
frontend change, and remember that green CI in one repo says nothing about the
[seam between repos](cross-repo-changes.md).

## The full gates (run these before calling anything done)

**audiosilo-server**

```sh
cd ~/dev/audiosilo/audiosilo-server
go build ./... && go vet ./... && go test -race ./... && golangci-lint run
```

**audiosilo-frontend**

```sh
cd ~/dev/audiosilo/audiosilo-frontend
npx tsc --noEmit && npm run lint && npm run format && npm test
```

`npm run format` is `prettier --check .` — it **fails** on unformatted files
rather than fixing them. Auto-fix locally with `npx prettier --write .` before
committing.

**audiosilo-manager** (two sides, both required)

```sh
cd ~/dev/audiosilo/audiosilo-manager
go build ./... && go vet ./... && go test -race ./... && golangci-lint run   # Go side
cd frontend && npx tsc --noEmit && npm run lint && npm run format && npm test  # UI side
```

## What CI actually runs

Every workflow across the three repos, verified against
`.github/workflows/`:

### audiosilo-server

| Workflow | Name | Triggers | What it does |
|---|---|---|---|
| `ci.yml` | `ci` | every PR; push to `main` | Job **test**: Go from `go.mod`, installs ffmpeg (so the ffprobe-dependent scanner tests stay live), `go build ./...`, `go vet ./...`, `go test -race -coverprofile=coverage.out ./...`, uploads the coverage artifact. Job **lint**: `golangci-lint-action@v8` (golangci-lint v2, config `.golangci.yml`). |
| `image.yml` | `server image` | `v*` tags; manual dispatch (input `web_version`) | Builds the Docker image, baking the pinned web player in via the `WEB_IMAGE` build-arg, and pushes `ghcr.io/<owner>/audiosilo-server` (semver + sha + `latest` tags). See [releasing](releasing.md). |
| `release.yml` | `release (native binaries)` | `v*` tags; manual dispatch (input `web_version`) | GoReleaser: cross-platform native binaries with the web player embedded (`-tags embedplayer`), published as a **draft** GitHub Release. |

### audiosilo-frontend

| Workflow | Name | Triggers | What it does |
|---|---|---|---|
| `ci.yml` | `ci` | every PR; push to `main` | Job **check**: Node from `.nvmrc`, `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run format` (prettier `--check`), `npm test -- --ci --coverage`. |
| `web.yml` | `web image` | push to `main`; `v*` tags; manual dispatch | `npx expo export --platform web` (built with `baseUrl=/web`) and publishes the static export as `ghcr.io/<owner>/audiosilo-web` (`:latest` from `main`, semver from tags). |

### audiosilo-manager

| Workflow | Name | Triggers | What it does |
|---|---|---|---|
| `ci.yml` | `CI` | every PR; push to `main` | Job **go**: checks out `KodeStar/audiosilo-server@main` **as a sibling** (the `replace` directive needs it), then `go build ./...`, `go vet ./...`, `go test -race ./...`, plus `golangci-lint-action@v6`. Job **frontend**: `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run format`, `npm test` in `frontend/`. |
| `desktop.yml` | `Desktop build` | `v*` tags; manual dispatch | Native-runner matrix (macOS `darwin/universal`, Windows `windows/amd64`, Linux `linux/amd64` — a webview UI can't cross-compile): installs the Wails CLI, `wails build` with the version injected via ldflags, uploads `build/bin/*` as workflow artifacts. Signing/notarization steps are stubbed pending certificates. |

:::note CI can't see cross-repo drift
Each repo's CI is independent, so a server-side wire change with no matching
frontend change sails through both pipelines green. The
[cross-repo checklist](cross-repo-changes.md) is what covers that gap.
:::

## The green-baseline lint policy

Both Go repos run **golangci-lint v2** from a *green baseline*: the suppressions
in each `.golangci.yml` are documented and intentional. The policy is simple —

- **fix new findings** in the code you touched;
- **never widen the excludes** to make a finding go away.

## Test conventions

**Every feature ships with a test, in the same change.** Where and how depends on
the repo:

### Server (Go)

- Handler/integration tests use the **`newTestEnv` harness** in
  `internal/api/api_test.go` — an in-memory SQLite database plus the tiny
  generated M4B fixtures in `testdata/library`.
- Pure-logic tests sit next to the code (`internal/api/middleware_test.go`,
  `internal/catalog/shares_test.go`, `internal/web/web_test.go`, …). Keep
  business logic out of `internal/api` handlers — `api` is transport-only — so it
  stays unit-testable.
- **Security-critical code requires both an allowed *and* a denied regression
  test** (the denied one is the point). That covers anything touching
  `library.SafeJoin`, `Scope.Allows` / `VisibleInBrowse` / `pathFilterSQL`, the
  rate limiters, `auth.ResolveToken`, `web.htmlCSP`, or `bearerToken`. See
  [auth and security](../server/auth-and-security.md).

### Frontend (TypeScript)

- Harness: **jest-expo (jest 29) + `@testing-library/react-native` 14** —
  matchers are built in (no `jest-native`). `jest.setup.ts` provides in-memory
  mocks for `expo-secure-store` and AsyncStorage; tests mock `fetch` /
  `@/api/reachability` as needed, and flip `Platform.OS` at runtime to cover
  web-vs-native branches.
- Pure, framework-free modules get direct co-located `*.test.ts` files
  (`src/api/client.ts`, `src/lib/*`, `src/playback/book-queue.ts`,
  `src/playback/progress-sync.ts`, `src/stores/*`). Keep logic out of
  `src/app/**` screens so it stays unit-testable. See
  [frontend testing](../frontend/testing.md).

### Manager (Go + TypeScript)

Same gate shape as the other two. Crypto/protocol surfaces — Audible
signing/voucher handling, SFTP host-key TOFU, `transfer.SafeJoin` — get unit
tests (allowed **and** denied, like the server's security paths). Live Audible
logins/downloads and real VPS deploys are verified manually.

## Two gate gotchas

- **ffmpeg-dependent tests skip silently.** A few server scanner tests need
  ffprobe; without it they `t.Skip` and the suite still passes — so a green local
  run without ffmpeg proved less than you think. CI installs ffmpeg precisely to
  keep those tests live. Install it locally too.
- **Keep `package-lock.json` committed in sync.** CI uses `npm ci` (frozen
  lockfile), so after any dependency change regenerate the lockfile with
  `npm install` and commit it — otherwise CI fails on a lockfile mismatch.

## Definition of Done (digest)

The workspace file `~/dev/audiosilo/CODE-HEALTH.md` exists because a full health
review found that the recurring problems (wire-contract drift, dead code, stale
docs, untested modules) were *patterns*, not one-offs — conventions that were
documented but never mechanically checked. It is the checklist that catches the
drift; read it before adding code. The digest:

**Always**

- The repo's full gate (above) passes.
- New logic ships with a test **in the same change**.
- You searched for and **removed anything the change supersedes** (old
  hook/method/constant/flag) — don't leave the previous implementation behind.
- Any doc or comment the change contradicts is **updated in the same commit** —
  grep the symbol/flag/route you changed across `*.md` and doc-comments. Docs
  updates are part of done: that includes this documentation site (see
  [writing the docs](documentation.md)) and, for seam changes, the workspace
  `CROSS-REPO.md`.

**If you touched the wire format** (any JSON a handler emits / a client decodes)

- Both repos updated in one logical change; **every** field mirrored in
  `types.ts`, even ones the client doesn't read yet; tests on **both** sides;
  `CROSS-REPO.md` updated if the seam changed. Full walkthrough:
  [cross-repo changes](cross-repo-changes.md).

**If you touched a security-critical path**

- Allowed **and** denied regression tests (see the list above); user-influenced
  SQL `LIKE` input is `ESCAPE`d.

**If you mapped an HTTP error**

- 4xx only for genuine client errors, branching on typed sentinels
  (`errors.Is(err, catalog.ErrNotFound)` and friends); everything else is a 500
  plus a server-side log — **never** `err.Error()` in a response body.

**If you edited native code** (`modules/audiosilo-player/{ios,android}`)

- Rebuilt on a device (`npx expo run:ios` / `run:android`) and verified the
  behavior — a Metro reload does not pick up native changes, and there is no
  other way to know it even compiles.

:::caution Green gates ≠ verified
The gates all run on Node/CI engines with full `Intl` and no real device — a
change can pass every gate and still crash on the Hermes runtime or misbehave
against a live server. Don't claim something *works* from green checks alone;
exercise the affected flow.
:::
