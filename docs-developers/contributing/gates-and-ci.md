---
title: Quality gates and CI
description: "Each repo's full pre-merge gate, what CI actually runs, the green-baseline lint policy, test conventions, and the Definition of Done."
---

Every repo has a **full gate**: the exact command sequence CI runs on every PR
and push. A change is not done until the gate of every repo you touched passes
locally. The gates are per-repo and independent. Don't run Go checks for a
frontend change, and remember that green CI in one repo says nothing about the
[seam between repos](cross-repo-changes.md).

## The full gates (run these before calling anything done)

**audiosilo-server**

```sh
cd ~/dev/audiosilo/audiosilo-server
scripts/build-admin.sh   # the admin console (Node 24): npm ci + check + build
go build ./... && go vet ./... && go test -race ./... && golangci-lint run
# the native SQLite engine (CI's test-native job), needs a C compiler:
TAGS="sqlite_native sqlite_fts5 sqlite_preupdate_hook"
CGO_ENABLED=1 go vet -tags "$TAGS" ./... && CGO_ENABLED=1 go test -race -tags "$TAGS" ./... \
  && CGO_ENABLED=1 golangci-lint run --build-tags=sqlite_native,sqlite_fts5,sqlite_preupdate_hook
```

The native run matters most for a change under `internal/store/` or to SQL,
because the engine's files build only under its tags (see
[SQLite choices](../server/data-model.md#sqlite-choices)).

`scripts/build-admin.sh` is the admin console's gate. It runs `npm ci`, then
`npm run check` (`tsc -b`, ESLint including the CSP guard rules,
`prettier --check`, Vitest), then the build, which itself fails on any CSP
violation. Skip it only when `admin-ui/` is untouched. Without a build,
`internal/web/adminui`'s `TestEmbeddedBuild` skips instead of checking the
embedded console.

**audiosilo-frontend**

```sh
cd ~/dev/audiosilo/audiosilo-frontend
npx tsc --noEmit && npm run lint && npm run format && npm test
# after a dependency change, also:
npx expo install --check && node scripts/check-native-dupes.mjs
```

`npm run format` is `prettier --check .`. It **fails** on unformatted files
rather than fixing them. Auto-fix locally with `npx prettier --write .` before
committing.

## What CI actually runs

The workflows for the server, player and metadata repos, verified against
`.github/workflows/`:

### audiosilo-server

| Workflow | Name | Triggers | What it does |
|---|---|---|---|
| `ci.yml` | `ci` | every PR; push to `main` | Four jobs side by side: **test**, **test-native**, **admin-ui** and **lint**. See [The server's `ci.yml` jobs](#the-servers-ciyml-jobs). |
| `image.yml` | `server image` | `v*` tags; push to `main`; manual dispatch (input `web_version`) | Builds the Docker image, baking the pinned web player in via the `WEB_IMAGE` build-arg, and pushes `ghcr.io/<owner>/audiosilo-server` (semver and `latest` on tags; `edge` on `main`; `sha-<short>` off a tag). See [Testing main before a release](releasing.md#testing-main-before-a-release-edge). |
| `release.yml` | `release (native binaries)` | `v*` tags; manual dispatch (input `web_version`) | GoReleaser: cross-platform native binaries with the web player embedded (`-tags embedplayer`; the Linux ones also build the native SQLite engine in, static), published as a **draft** GitHub Release. |
| `probe-drift.yml` | `probe-drift` | PRs and pushes to `main` touching `internal/metadata/**`, the `Dockerfile` or the workflow; weekly (Monday 05:17 UTC); manual dispatch | Job **image-ffprobe**. It builds the `internal/metadata` test binary, then runs `TestProbeMatchesLiveFFprobe` and `TestProbeMatchesGoldens` in the Dockerfile's Alpine base image, with that image's ffmpeg installed and `AUDIOSILO_PROBE_LIVE=1`. It fails when the [in-process probe](../server/scanner.md#the-in-process-probe) answers a fixture differently from the image's ffprobe (drift), or when that ffprobe is missing or of a release the probe has no rules for. It runs weekly because Alpine updates ffmpeg with no change in the repo. See [The in-process probe's fixtures](#the-in-process-probes-fixtures). |

#### The server's `ci.yml` jobs

- **test** runs on the pure-Go modernc engine. It sets up Go from `go.mod`,
  Node from `admin-ui/.nvmrc`, and runs `scripts/build-admin.sh --vite-only`
  before the Go steps, so the embed tests see a real build. It does no
  typecheck, since the admin-ui job does that. It then installs ffmpeg, runs
  `go test -coverprofile=coverage.out ./...` with no `-race`, and uploads the
  coverage artifact. The coverage run compiles every package, test files or
  not, so there is no separate build step.
- **test-native** runs on the native SQLite engine the Docker image ships, with
  `CGO_ENABLED=1` and its build tags, since the engine's files build only under
  them (see [SQLite choices](../server/data-model.md#sqlite-choices)). It
  installs ffmpeg, runs `go test -race` over the whole suite, then runs
  golangci-lint with the same tags. Its govet replaces a separate `go vet` step.
  There is no admin console build here, so the embed tests skip in this job and
  run in **test**.
- The race detector runs only in **test-native**. It instruments the pure-Go
  SQLite, which is transpiled C, and makes the modernc run several times
  slower. The cgo engine's C code is not instrumented.
- **admin-ui** runs the full `scripts/build-admin.sh` (`npm ci`,
  `npm run check`, the build).
- **lint** runs `golangci-lint-action@v9` (golangci-lint v2, config
  `.golangci.yml`) on the default build.

Both Go test jobs get ffmpeg and ffprobe from the local `setup-ffmpeg` action.
It installs a pinned, checksummed static build (cached between runs) of the
FFmpeg release the image's Alpine ships, so the ffprobe-dependent scanner tests
and the in-process probe's live comparison run in both jobs.

### audiosilo-frontend

| Workflow | Name | Triggers | What it does |
|---|---|---|---|
| `ci.yml` | `ci` | every PR; push to `main` | Job **check** runs, in order: Node from `.nvmrc`, `npm ci`, `npx expo install --check` (the Expo SDK pins; `expo.install.exclude` in `package.json` holds the one deliberate drift, AsyncStorage 3.x), `node scripts/check-native-dupes.mjs` (one copy of each native module), `npx tsc --noEmit`, `npm run lint`, `npm run format` (prettier `--check`), `npm test -- --ci --coverage`. |
| `web.yml` | `web image` | push to `main`; `v*` tags; manual dispatch | `npx expo export --platform web` (built with `baseUrl=/web`) and publishes the static export as `ghcr.io/<owner>/audiosilo-web` (`:latest` from `main`, semver from tags). |

### audiosilo-meta

| Workflow | Name | Triggers | What it does |
|---|---|---|---|
| `check.yml` | `check` | every PR; push to `main` | A `changes` job classifies the diff first, then parallel jobs run. See [The meta `check.yml` jobs](#the-meta-checkyml-jobs). |
| `release.yml` | `release` | push to `main` (paths touching data, schema, the builder, or the compose code, but not `data/go.mod` - it changes no data); `community-data` repository_dispatch from `audiosilo-meta-community`; manual dispatch (refused unless run on `main`) | Composes the SQLite artifact from both repositories, creates the release as a **draft**, verifies every asset against the GitHub API's own reported size and sha256 digest, publishes only once verification passes, and sends the signed webhook notification. |
| `image.yml` | `image` | `v*` tags; manual dispatch | Builds and publishes the `metaserve` + static-site container image to `ghcr.io/kodestar/audiosilo-meta` (no catalogue data baked in). |
| `intake.yml` | `intake` | issue edited/labeled; `workflow_call` from `route.yml`; push to `main` | Turns a data issue-form submission into a validated bot pull request (`metaissue --profile core`), and rebases every open `bot-intake` pull request (the intake bot's and the sync bot's) on every push to `main`. |
| `route.yml` | `route` | issue opened | Routes an issue filed through the AudioSilo Contributions App (by a Bridge) by its title prefix: labels it and calls `intake.yml`, or holds it with `intake:held` (a young account, too many open App-filed issues, a denylisted id). The community repository has its own copy. See [Issues filed through the AudioSilo App](../meta/contributing-data.md#issues-filed-through-the-audiosilo-app). |
| `ai-verify.yml` | `ai-verify` | PR touching `data/**`; manual dispatch | Advisory, non-blocking AI review of a data pull request's records, reading an entry-level change summary from `metadiff` rather than the raw diff. A rebase that leaves that summary unchanged reuses the last verdict without a model call; a manual dispatch or a re-run always judges afresh. |
| `workflows.yml` | `workflows` | PR or push touching `.github/workflows/**` or `.github/scripts/**` | Lints the workflows themselves (actionlint) and the shell scripts they call out to (shellcheck). It is paths-filtered, so it is not a required check. |

#### The meta `check.yml` jobs

A `changes` job classifies the diff first. Then these jobs run in parallel:

- **build** runs `go build` and `go vet`, and **test** runs `go test -race` in
  three shards. Both are Go-gated.
- **metacheck** and **metafmt** run `metacheck --profile core` and
  `metafmt --check --profile core`. They are unconditional, since they are the
  data's own check.
- **advisories** (pull requests only, never red) runs metacheck over the base
  for the advisory delta.
- **check** is the verdict over the jobs above, not the ones below. It writes
  the advisories the PR introduces into its summary. It is the name branch
  protection and the sync bot require (see
  [`check` is the verdict](../meta/contributing-data.md#check-is-the-verdict)).
- **lint** runs `golangci-lint run` (v2.12, over the linter set `.golangci.yml`
  pins). Go-gated.
- **vuln** runs `govulncheck` directly (pinned to v1.8.0). Go-gated.
- **compose** (pull requests only, compose-gated) builds the artifact against a
  shallow `audiosilo-meta-community` checkout, to catch the cross-repo rules a
  single tree can't see.
- **site** builds, typechecks and tests `site/` when present.

A PR touching only `data/go.mod` is classified as Go, not data, so it still
runs the Go-gated jobs. `data/go.mod` is the nested, code-free module that
keeps this module's zip small (see
[Package layout](../meta/overview.md#package-layout)).

:::note[CI can't see cross-repo drift]
Each repo's CI is independent, so a server-side wire change with no matching
frontend change sails through both pipelines green. The
[cross-repo checklist](cross-repo-changes.md) is what covers that gap.
:::

## The green-baseline lint policy

The server and audiosilo-meta repos run **golangci-lint
v2** in CI from a *green baseline*: the suppressions in each `.golangci.yml` are
documented and intentional. The policy:

- **fix new findings** in the code you touched;
- **never widen the excludes** to make a finding go away.

## Test conventions

**Every feature ships with a test, in the same change.** Where and how depends on
the repo.

### Server (Go)

- Handler and integration tests use the **`newTestEnv` harness** in
  `internal/api/api_test.go`: a file-backed SQLite database plus the tiny
  generated M4B fixtures in `testdata/library`. The database is file-backed, as
  in production. Reads go to the read-only reader pool, so a write sent through
  a read method fails the test instead of passing on `:memory:`.
- **Never migrate per test.** Open a test database with **`storetest.Open(t)`**
  (`internal/store/storetest`; `storetest.Path(t)` when the test opens the file
  itself), not `store.Open` on a fresh file or `:memory:`. Under `-race` running
  every migration costs about a second, so the helper migrates once per test
  binary and hands each test a file-backed copy.
- **Cheap hashing.** A package whose tests create many password users calls
  `auth.UseCheapHashingForTests()` from its `TestMain` (see
  `internal/api/main_test.go`), because one argon2id hash at the real cost takes
  about a quarter of a second under `-race`. It panics outside a test binary.
- **Tests run in parallel.** A new top-level test starts with `t.Parallel()`.
  Each has its own database and temp dirs, so the only thing tests share is the
  read-only `testdata/` fixtures. Copy one into `t.TempDir()` before changing
  it. The exceptions:
  - a test that calls `t.Setenv` or `t.Chdir`, since both panic in a parallel
    test;
  - a test that writes a package-level variable. Pass the value in instead, as
    `hashWithCost` does for `TestHashCost`.
- Pure-logic tests sit next to the code (`internal/api/middleware_test.go`,
  `internal/catalog/shares_test.go`, `internal/web/web_test.go`, …). Keep
  business logic out of `internal/api` handlers, so it stays unit-testable.
  `api` is transport-only.
- **Security-critical code requires both an allowed *and* a denied regression
  test.** The denied one is the point. That covers anything touching:
  - `library.SafeJoin`;
  - `Scope.Allows`, `VisibleInBrowse` or `pathFilterSQL`;
  - the household member rule (`catalog/members.go`) and member routes
    (`handlers_members.go`);
  - the rate limiters;
  - `auth.ResolveRequest` or `lookupToken`;
  - `web.htmlCSP`;
  - `bearerToken`.

  See [Auth & security](../server/auth-and-security.md).

### The in-process probe's fixtures

The scanner's [in-process probe](../server/scanner.md#the-in-process-probe)
must answer exactly as ffprobe does, so it is tested against ffprobe's own
answers, with and without ffprobe installed:

- **The corpus.** `internal/metadata/testdata/probe` holds about 90 small
  fixtures (a few seconds of audio each, under 3 MB together) in every shape
  the probe reads or leaves to ffprobe: MP3 (CBR, VBR with and without a Xing
  or VBRI header, gapless, ID3 and APE tags, chapters), M4B and M4A, FLAC, Ogg
  Vorbis, Opus and FLAC (`.ogg` and `.opus`) and MKA, plus crafted and
  truncated files. `scripts/gen-probe-fixtures.sh` makes them, with
  `cmd/mkfixtures` for the crafted ones. The script needs ffmpeg and ffprobe
  7.x or 8.x with libmp3lame, libvorbis and libopus, the `lame` CLI and
  `metaflac`. Regenerating rewrites every fixture, since encoders differ by
  version. Commit the files and the goldens together, and review the goldens'
  diff.
- **Goldens.** `golden-<release>.json` (`golden-7.1.json`, `golden-8.1.json`)
  is a known release's normalised answer for every fixture, written by
  `cmd/probediff -golden`. The script writes one for the local ffprobe and,
  through docker, one for the Docker image's. `probe_golden_test.go` checks the
  probe against each with no ffprobe needed, so the plain `go test ./...` gate
  covers it everywhere.
- **The live comparison.** `probe_live_test.go` compares the probe with the
  ffprobe on `PATH` over the fixtures, and over any folders of real books
  `AUDIOSILO_PROBE_DIRS` (a path list) names. It skips without an ffprobe, or
  with one of a release the probe has no rules for. When `AUDIOSILO_PROBE_LIVE`
  is set, either case is a failure instead. The `probe-drift` workflow sets it.
- **Adding a release.** Add its rules where they differ, its golden and a
  `knownRules` entry. The live test and the CI job then cover it.
- **Stand-in ffprobe scripts.** A test whose ffprobe is a script on *valid*
  files (to fake a rejection or a time-out) would otherwise be answered by the
  probe and never run the script. Such a test calls
  `metadata.ForceFFprobeForTests(path)`, as `library`'s `stubProbe` helper
  does. It sends every `Extract` given that ffprobe path to ffprobe. It is keyed
  by the path, so parallel tests don't touch each other, and it panics outside
  a test binary.

### Frontend (TypeScript)

- Harness: **jest-expo (Jest 30) and `@testing-library/react-native` 14**.
  Matchers are built in (no `jest-native`). `jest.setup.ts` provides in-memory
  mocks for `expo-secure-store` and AsyncStorage. Tests mock `fetch` and
  `@/api/reachability` as needed, and flip `Platform.OS` at runtime to cover
  the web and native branches.
- Pure, framework-free modules get direct co-located `*.test.ts` files
  (`src/api/client.ts`, `src/lib/*`, `src/playback/book-queue.ts`,
  `src/playback/progress-sync.ts`, `src/stores/*`). Keep logic out of
  `src/app/**` screens so it stays unit-testable. See
  [Testing the player](../frontend/testing.md).

## Two gate gotchas

- **ffmpeg-dependent tests skip silently.** A few server scanner tests need
  ffprobe. Without it they `t.Skip` and the suite still passes, so a green local
  run without ffmpeg proved less than you think. CI installs a pinned ffmpeg to
  keep those tests live. Install it locally too. The in-process probe's golden
  test needs no ffprobe, and its live comparison skips without one (see
  [The in-process probe's fixtures](#the-in-process-probes-fixtures)).
- **Keep `package-lock.json` committed in sync.** CI uses `npm ci` (frozen
  lockfile). After any dependency change, regenerate the lockfile with
  `npm install` and commit it. Otherwise CI fails on a lockfile mismatch.

## Definition of Done (digest)

The workspace file `~/dev/audiosilo/CODE-HEALTH.md` exists because a full health
review found that the recurring problems (wire-contract drift, dead code, stale
docs, untested modules) were *patterns*, not one-offs. They were conventions
that were documented but never mechanically checked. It is the checklist that
catches the drift, so read it before adding code. The digest:

**Always**

- The repo's full gate (above) passes.
- New logic ships with a test **in the same change**.
- You searched for and **removed anything the change supersedes** (an old
  hook, method, constant or flag). Don't leave the previous implementation
  behind.
- Any doc or comment the change contradicts is **updated in the same commit**.
  Grep the symbol, flag or route you changed across `*.md` and doc-comments.
  Docs updates are part of done. That includes this documentation site (see
  [Maintaining these docs](documentation.md)) and, for seam changes, the workspace
  `CROSS-REPO.md`.

**If you touched the wire format** (any JSON a handler emits or a client decodes)

- Both repos are updated in one logical change.
- **Every** field is mirrored in `types.ts`, even ones the client doesn't read
  yet.
- Tests on **both** sides.
- `CROSS-REPO.md` is updated if the seam changed.

Full walkthrough: [Landing a cross-repo change](cross-repo-changes.md).

**If you touched a security-critical path**

- Allowed **and** denied regression tests (see the list in
  [Server (Go)](#server-go)).
- User-influenced SQL `LIKE` input is `ESCAPE`d.

**If you mapped an HTTP error**

- 4xx only for genuine client errors, branching on typed sentinels
  (`errors.Is(err, catalog.ErrNotFound)` and friends).
- Everything else is a 500 plus a server-side log. **Never** put `err.Error()`
  in a response body.

**If you edited native code** (`modules/audiosilo-player/{ios,android}`)

- Ran the [native checks](../frontend/testing.md#native-checks) for what you
  changed (the Android JVM tests, the iOS self-check, Android Auto on the Desktop
  Head Unit, CarPlay in the Simulator, or a device build via `npx expo run:ios` /
  `run:android`) and verified the behavior. A Metro reload does not pick up
  native changes, and Jest and the web prove nothing about Swift or Kotlin.

:::caution[Green gates ≠ verified]
The gates all run on Node and CI engines with full `Intl` and no real device. A
change can pass every gate and still crash on the Hermes runtime or misbehave
against a live server. Don't claim something *works* from green checks alone;
exercise the affected flow.
:::
