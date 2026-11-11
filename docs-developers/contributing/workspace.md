---
title: Workspace setup
description: "How the multi-repo workspace is laid out, the toolchain you need, and how to run the whole stack locally."
---

AudioSilo is one product across several repositories, and they are developed
together from a single **workspace folder**. Get the layout right first, because
some of the build scripts assume it.

## The layout

The workspace root is itself a small git repo, the
**`KodeStar/audiosilo` meta repo**. It holds the cross-repo glue: the
integration contract, the code-health checklist, the distribution and store
runbooks, and the app-store asset pipeline. The code repos are independent
clones **inside** it, gitignored by the meta repo:

```
~/dev/audiosilo/           github.com/KodeStar/audiosilo (the glue)
├── CLAUDE.md, CROSS-REPO.md, CODE-HEALTH.md,     workspace-level guides
│   DISTRIBUTION.md, store/, ...                  (the integration contract lives here)
├── audiosilo-server/      github.com/KodeStar/audiosilo-server    (Go)
├── audiosilo-frontend/    github.com/KodeStar/audiosilo-frontend  (Expo / React Native)
├── audiosilo-bridge/      github.com/KodeStar/audiosilo-bridge    (the Bridge)
├── audiosilo-meta/        github.com/KodeStar/audiosilo-meta      (community metadata DB)
├── audiosilo-meta-community/ github.com/KodeStar/audiosilo-meta-community (CC BY-SA community packs)
├── audiosilo-meta-sync/   github.com/KodeStar/audiosilo-meta-sync (private series-completion bot)
├── audiosilo-meta-bot/    github.com/KodeStar/audiosilo-meta-bot  (private Discord notification bot)
├── audiosilo-site/        github.com/KodeStar/audiosilo-site      (marketing site)
└── audiosilo-docs/        this documentation site (Docusaurus)
```

Two former repos are **archived** (November 2026) and no longer part of the
workspace:

- `audiosilo-manager`, the desktop manager;
- `audiosilo-sidecars`, the contributor extraction tool.

The Bridge does their jobs now (see
[What it is for](../bridge/index.md#what-it-is-for)). The bootstrap script
doesn't clone them. An existing checkout of either stays gitignored, so it
doesn't show up as untracked.

Setting up from scratch takes two commands. The bootstrap script clones any
child repo that's missing (set `PROTO=https` to clone over HTTPS instead of
SSH):

```sh
git clone https://github.com/KodeStar/audiosilo.git ~/dev/audiosilo
cd ~/dev/audiosilo && scripts/bootstrap.sh
```

The two private bots need repository access. The bootstrap script skips either
one it cannot clone and continues with the public repositories.

### Why one workspace

- **Cross-repo work is the norm here.** Wire-format changes, pairing, media auth,
  and capability flags can touch several repos in one logical change (see
  [Landing a cross-repo change](cross-repo-changes.md)). Opening your editor or agent at
  the workspace root puts every repo in scope at once, and removes the
  cross-repo permission prompts you get when you work in a single repo.
- **Helper scripts assume the layout.** For example
  `audiosilo-server/scripts/build-web.sh` defaults `FRONTEND_DIR` to
  `$HOME/dev/audiosilo/audiosilo-frontend`.

## Toolchain matrix

| Tool | Needed for | Install / notes |
|---|---|---|
| **Go 1.26+** | server, audiosilo-meta, the Bridge | Each `go.mod` sets the minimum `go` version, and the server's also pins a `toolchain`. With the default `GOTOOLCHAIN=auto`, any Go 1.21+ fetches the toolchain it needs on first use. |
| **Node 24** | frontend, the server's admin console, this docs site | `.nvmrc` pins `24.16.0` in `audiosilo-frontend` and in `audiosilo-server/admin-ui`. Run `nvm use` in each. **Older Node breaks Expo.** React Native 0.88 needs Node `^22.13`, `^24.3` or `>= 26` (not 23 or 25). The Expo CLI's env-file loader uses `util.parseEnv` (Node ≥ 20.12), so an old system `node` crashes the moment a `.env` file exists. |
| **golangci-lint v2** | server and audiosilo-meta lint gates | v2 has been required since Go 1.25. Config is each repo's `.golangci.yml`, adopted at a *green baseline* (see [Quality gates and CI](gates-and-ci.md)). |
| **ffmpeg / ffprobe** | server scanner tests, transcoding | Optional at runtime, since the server degrades gracefully. A few scanner tests `t.Skip` without ffprobe, so install it to make them run (CI installs it). Use 7.1 or 8.1 to run the in-process probe's live comparison. Regenerating its fixtures also needs `lame` and `metaflac` (see [The in-process probe's fixtures](gates-and-ci.md#the-in-process-probes-fixtures)). |
| **Docker** | container images, `scripts/fetch-web-player.sh` | Only needed for image builds and release work, not day-to-day dev. |
| **Playwright** | regenerating documentation screenshots | Only if you work on the docs screenshot pipeline (`audiosilo-docs/screenshots/`) or the marketing and store asset runbook (workspace `SCREENSHOTS.md`). See [Maintaining these docs](documentation.md). |
| **Xcode / Android Studio (JDK 17 + Android SDK 37)** | native frontend dev builds | Only for running the player on iOS or Android. Web dev needs neither. |

## Run the whole stack locally

The web player is a static Expo export that the server serves at `/web`. To see
the real thing end to end:

```sh
# 1) Build the web player export (baseUrl=/web) from the frontend.
cd ~/dev/audiosilo/audiosilo-server
scripts/build-web.sh
#    → builds into ~/dev/audiosilo/audiosilo-frontend/dist and prints
#      the AUDIOSILO_WEB_DIR to use.

# 2) Run the server with the player mounted at /web, plain HTTP for local dev.
#    (scripts/build-admin.sh first, or /admin serves a "console not built" page.)
go build -o bin/audiosilo ./cmd/audiosilo
AUDIOSILO_WEB_DIR=~/dev/audiosilo/audiosilo-frontend/dist \
  AUDIOSILO_TLS_MODE=off \
  ./bin/audiosilo --data ./data
```

The **first run prints the admin credentials and an auth code once**, so copy
them then. You get the web player at `http://localhost:8080/web`, the admin console at
`/admin`, and the public connect page at `/`.

### Or: a live frontend dev loop (hot reload)

For frontend work you don't want to re-export on every change. Run the player on
its own dev server and point it at the API:

```sh
cd ~/dev/audiosilo/audiosilo-frontend && npm run web   # http://localhost:8081
```

The player and API are now different origins, so set the server's config
`cors_origins` to include `http://localhost:8081` (see
[Configuration reference](../server/configuration.md)). The server's default TLS is
self-signed, so either trust it in the browser or run with
`AUDIOSILO_TLS_MODE=off` locally.

## Per-repo dev commands

Run commands **from each repo's own root**. The toolchains are fully
independent.

**audiosilo-server**

```sh
go build -o bin/audiosilo ./cmd/audiosilo   # build the binary (pure-Go SQLite)
CGO_ENABLED=1 go build -tags "sqlite_native sqlite_fts5 sqlite_preupdate_hook" \
  -o bin/audiosilo ./cmd/audiosilo          # or native C SQLite (Docker, Linux releases)
./bin/audiosilo --data ./data               # run (first run prints creds once)
go test -race ./...                          # tests (in-memory SQLite + fixtures)
scripts/build-web.sh                         # build the web export for AUDIOSILO_WEB_DIR
scripts/build-admin.sh                       # build the admin console (admin-ui) to embed
npm --prefix admin-ui run dev                # admin console dev server (proxies to :8080)
```

Useful flags:

- `--data`: the config, database and certificates directory.
- `--ffprobe` and `--ffmpeg`: the tool paths (`""` disables one).
- `--setup`: choose the first admin's password on a browser page instead of
  the printed credentials. The console's setup flow follows either way.

**audiosilo-frontend**

```sh
nvm use                     # Node 24 first, always
npm run web                 # web dev server (no native build needed)
npm run ios / npm run android   # native dev build (see gotchas below)
npx tsc --noEmit            # typecheck
npm test                    # jest-expo unit tests
npx expo export -p web      # bundle smoke test
```

**audiosilo-bridge** (see [the Bridge's development page](../bridge/development.md))

```sh
scripts/build-web.sh                    # build its page and embed it into bin/audiosilo-bridge
./bin/audiosilo-bridge --data ./data    # run (the first start prints its page's password once)
go test -race ./...                     # Go tests
cd web && npm test                      # page tests (vitest)
```

**audiosilo-docs** (this site)

```sh
npm run start               # local dev server
npm run build               # production build (fails on broken links)
```

The full pre-merge quality gate for each repo is on
[Quality gates and CI](gates-and-ci.md).

## Environment gotchas

These are the ones that repeatedly bite new setups. Each is documented in the
repos' own guides and verified here:

- **Use Node 24 via nvm, in every shell.** The frontend and the server's
  `admin-ui` both pin `24.16.0` in `.nvmrc`. A machine's default `node` that is
  too old fails in confusing ways, such as the Expo env loader crash in the
  [Toolchain matrix](#toolchain-matrix).
- **Don't `cd` into `node_modules`.** Run tool commands from the repo root. In a
  persistent shell, a stray `cd` into `node_modules` breaks Expo's config
  resolution for every later command.
- **Native runs need a dev build, not Expo Go.** The player has a custom native
  module (`modules/audiosilo-player`), plus `react-native-svg` and
  `expo-secure-store`, and Expo Go can't load them. Use `npx expo prebuild`,
  then `npx expo run:ios` or `npx expo run:android`. Web (`npm run web`) needs
  no native build at all.
- **Editing native module code requires a full rebuild.** A Metro reload does
  **not** pick up changes under `modules/audiosilo-player/{ios,android}`. Rerun
  `npx expo run:ios` or `run:android` on a device or simulator. Treat any native
  edit as unverified until a device build confirms it.
- **No FontAwesome token is needed to build.** Icons are vendored as plain SVG in
  the frontend (`src/components/ui/icon-data.ts`), so `npm install` pulls
  nothing private. A FontAwesome Pro token is only needed to *add or
  regenerate* an icon via the isolated generator in `scripts/glyphs/`.
- **Web dev needs CORS** when the player and the API are on different origins
  (see [Or: a live frontend dev loop](#or-a-live-frontend-dev-loop-hot-reload)),
  or a same-origin export via `build-web.sh`.

Once you're set up, read the workspace `CODE-HEALTH.md` (Definition of Done) and
the [invariants](../architecture/invariants.md) before writing code, and
[Quality gates and CI](gates-and-ci.md) before opening a PR.
