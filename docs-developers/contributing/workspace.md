---
title: Workspace setup
description: "How the multi-repo workspace is laid out, the toolchain you need, and how to run the whole stack locally."
---

AudioSilo is one product across several repositories, and they are developed
together from a single **workspace folder**. Get the layout right first - some of
the build machinery assumes it.

## The layout

The workspace root is itself a small git repo - the
**`audiosilo-workspace` meta repo** - holding the cross-repo glue (the
integration contract, code-health checklist, distribution/store runbooks, and
the app-store asset pipeline). The code repos are independent clones **inside**
it, gitignored by the meta repo:

```
~/dev/audiosilo/           github.com/KodeStar/audiosilo-workspace (the glue)
├── CLAUDE.md, CROSS-REPO.md, CODE-HEALTH.md,     workspace-level guides
│   DISTRIBUTION.md, store/, ...                  (the integration contract lives here)
├── audiosilo-server/      github.com/KodeStar/audiosilo-server    (Go)
├── audiosilo-frontend/    github.com/KodeStar/audiosilo-frontend  (Expo / React Native)
├── audiosilo-manager/     github.com/KodeStar/audiosilo-manager   (Wails desktop)
├── audiosilo-meta/        github.com/KodeStar/audiosilo-meta      (community metadata DB)
├── audiosilo-sidecars/    github.com/KodeStar/audiosilo-sidecars  (contributor extraction tool)
├── audiosilo-site/        github.com/KodeStar/audiosilo-site      (marketing site)
└── audiosilo-docs/        this documentation site (Docusaurus)
```

Setting up from scratch is two commands - the bootstrap script clones any child
repo that's missing (`PROTO=https` to clone over HTTPS instead of SSH):

```sh
git clone https://github.com/KodeStar/audiosilo-workspace.git ~/dev/audiosilo
cd ~/dev/audiosilo && scripts/bootstrap.sh
```

### Why one workspace (not three scattered checkouts)

- **Cross-repo work is the norm here.** Wire-format changes, pairing, media auth,
  and capability flags all touch two or three repos in one logical change (see
  [cross-repo changes](cross-repo-changes.md)). Opening your editor/agent at the
  workspace root puts every repo in scope at once and removes the cross-repo
  permission friction of working in a single repo.
- **The manager literally won't build without a sibling server checkout.**
  `audiosilo-manager/go.mod` contains
  `replace github.com/kodestar/audiosilo-server => ../audiosilo-server` - it
  compiles the server's public `pkg/launcher` and `pkg/match` straight from the
  sibling directory. The manager's CI checks out both repos side by side for the
  same reason.
- **Helper scripts assume the layout.** For example
  `audiosilo-server/scripts/build-web.sh` defaults `FRONTEND_DIR` to
  `$HOME/dev/audiosilo/audiosilo-frontend`.

:::caution Keep the server checkout fresh
Because the manager compiles the server's packages via that `replace`, a **stale
`audiosilo-server` checkout can break the manager build** (missing symbols the
manager expects). If the manager suddenly fails to compile, `git -C
../audiosilo-server pull` before debugging anything else.
:::

## Toolchain matrix

| Tool | Needed for | Install / notes |
|---|---|---|
| **Go 1.25+** | server, manager | Both `go.mod` files declare `go 1.25.3`. |
| **Node 24** | frontend, manager UI | `.nvmrc` pins `24.16.0` (in `audiosilo-frontend` and at the `audiosilo-manager` repo root) - run `nvm use` in each. **Older Node breaks Expo**: React Native 0.85 needs ≥ 20.19.4, and the Expo CLI's env-file loader uses `util.parseEnv` (Node ≥ 20.12), so an old system `node` crashes the moment a `.env` file exists. |
| **golangci-lint v2** | server, manager lint gates | v2 is required for Go 1.25. Config is each repo's `.golangci.yml`; both are adopted at a *green baseline* (see [gates and CI](gates-and-ci.md)). |
| **Wails CLI** | manager builds / dev loop | `go install github.com/wailsapp/wails/v2/cmd/wails@latest`, then make sure `$(go env GOPATH)/bin` is on `PATH`. Linux also needs `libgtk-3-dev` and `libwebkit2gtk-4.1-dev`. |
| **ffmpeg / ffprobe** | server scanner tests, transcoding, manager DRM-strip | Optional at runtime (the server degrades gracefully), but a few scanner tests `t.Skip` without ffprobe - install it so they actually run (CI installs it). The manager's Audible pipeline also shells out to ffmpeg. |
| **Docker** | container images, `scripts/fetch-web-player.sh` | Only needed for image builds / release work, not day-to-day dev. |
| **Playwright** | regenerating documentation screenshots | Only if you work on the docs screenshot pipeline (`audiosilo-docs/screenshots/`) or the marketing/store asset runbook (workspace `SCREENSHOTS.md`). See [documentation](documentation.md). |
| **Xcode / Android Studio (JDK 17 + SDK)** | native frontend dev builds | Only for running the player on iOS/Android; web dev needs neither. |

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
go build -o bin/audiosilo ./cmd/audiosilo
AUDIOSILO_WEB_DIR=~/dev/audiosilo/audiosilo-frontend/dist \
  AUDIOSILO_TLS_MODE=off \
  ./bin/audiosilo --data ./data
```

The **first run prints the admin credentials and an auth code once** - copy them
then. You get the web player at `http://localhost:8080/web`, the admin console at
`/admin`, and the public connect page at `/`.

### Or: a live frontend dev loop (hot reload)

For frontend work you don't want to re-export on every change. Run the player on
its own dev server and point it at the API:

```sh
cd ~/dev/audiosilo/audiosilo-frontend && npm run web   # http://localhost:8081
```

The player and API are now different origins, so set the server's config
`cors_origins` to include `http://localhost:8081` (see
[server configuration](../server/configuration.md)). The server's default TLS is
self-signed - either trust it in the browser or run with
`AUDIOSILO_TLS_MODE=off` locally.

## Per-repo dev commands

Run commands **from each repo's own root** - the toolchains are fully
independent.

**audiosilo-server**

```sh
go build -o bin/audiosilo ./cmd/audiosilo   # build the binary
./bin/audiosilo --data ./data               # run (first run prints creds once)
go test -race ./...                          # tests (in-memory SQLite + fixtures)
scripts/build-web.sh                         # build the web export for AUDIOSILO_WEB_DIR
```

Useful flags: `--data` (config/db/certs dir), `--ffprobe`/`--ffmpeg` (`""`
disables), `--setup` (first-run browser wizard instead of the printed creds).

**audiosilo-frontend**

```sh
nvm use                     # Node 24 first, always
npm run web                 # web dev server (no native build needed)
npm run ios / npm run android   # native dev build (see gotchas below)
npx tsc --noEmit            # typecheck
npm test                    # jest-expo unit tests
npx expo export -p web      # bundle smoke test
```

**audiosilo-manager**

```sh
wails dev                   # hot-reload dev (Go + Vite)
wails build                 # production app into build/bin/
go test -race ./...         # Go-side tests
cd frontend && npm test     # UI tests (vitest)
```

**audiosilo-docs** (this site)

```sh
npm run start               # local dev server
npm run build               # production build (fails on broken links)
```

The full pre-merge quality gate for each repo is on
[gates and CI](gates-and-ci.md).

## Environment gotchas

These are the ones that repeatedly bite new setups - each is documented in the
repos' own guides and verified here:

- **Use Node 24 via nvm, every shell.** The frontend and the manager both pin
  `24.16.0` in `.nvmrc` (locations in the toolchain matrix above). A machine's
  default `node` being too old fails in confusing ways (the Expo env loader
  crash above).
- **Don't `cd` into `node_modules`.** Run tool commands from the repo root - in a
  persistent shell a stray `cd` into `node_modules` breaks Expo's config
  resolution for every subsequent command.
- **Native runs need a dev build, not Expo Go.** The player has a custom native
  module (`modules/audiosilo-player`), plus `react-native-svg` and
  `expo-secure-store` - Expo Go can't load them. Use `npx expo prebuild`, then
  `npx expo run:ios` / `npx expo run:android`. Web (`npm run web`) needs no
  native build at all.
- **Editing native module code requires a full rebuild.** Changes under
  `modules/audiosilo-player/{ios,android}` are **not** picked up by a Metro/JS
  reload - rerun `npx expo run:ios` / `run:android` on a device or simulator.
  Treat any native edit as unverified until a device build confirms it.
- **No FontAwesome token is needed to build.** Icons are vendored as plain SVG in
  the frontend (`src/components/ui/icon-data.ts`); `npm install` pulls nothing
  private. A FontAwesome Pro token is only needed to *add or regenerate* an icon
  via the isolated generator in `scripts/glyphs/`.
- **Web dev needs CORS** (different origins, see above) or a same-origin export
  via `build-web.sh`.

Once you're set up, read the workspace `CODE-HEALTH.md` (Definition of Done) and
the [invariants](../architecture/invariants.md) before writing code, and
[gates and CI](gates-and-ci.md) before opening a PR.
