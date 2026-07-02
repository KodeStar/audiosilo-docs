---
title: Cutting a release
description: "The operator's runbook: web image first, then the server image and native binaries on a v* tag, plus the app-store and manager tracks."
---

AudioSilo ships several artifacts from three repos, and **order matters** for the
first two: the server image and the native binaries both bake in a **pinned web
player build**, so the web image must exist before the server release that
consumes it. The conceptual overview is in the
[release pipeline](../architecture/release-pipeline.md); this page is the
step-by-step runbook. The maintainer notes it follows are
`audiosilo-server/RELEASING.md`.

## What ships

| Artifact | Built by | Trigger | Where it lands |
|---|---|---|---|
| `ghcr.io/kodestar/audiosilo-web` | `audiosilo-frontend/.github/workflows/web.yml` | push to `main` (`:latest`); `v*` tags (semver) | GHCR - a tiny image holding only the static web export (`baseUrl=/web`) |
| `ghcr.io/kodestar/audiosilo-server` | `audiosilo-server/.github/workflows/image.yml` | `v*` tags; manual dispatch | GHCR - the deployable image, web player baked in at `/app/web` |
| Native server binaries | `audiosilo-server/.github/workflows/release.yml` (GoReleaser) | `v*` tags; manual dispatch | **Draft** GitHub Release on `KodeStar/audiosilo-server` |
| iOS / Android apps | EAS Build (manual, outside CI) | on demand | App Store Connect / Google Play Console |
| Manager desktop app | `audiosilo-manager/.github/workflows/desktop.yml` | `v*` tags; manual dispatch | Workflow artifacts (installers via GitHub Releases are **planned**) |

## Step 1 - publish the web player image (audiosilo-frontend)

Push to `main` (or tag `v*`) in **audiosilo-frontend**. `web.yml` runs
`npx expo export --platform web` (built with `baseUrl=/web` from `app.json`) and
pushes `ghcr.io/kodestar/audiosilo-web:latest` - plus the semver tag on `v*`
tags. `:latest` is only published from the default branch.

**Do this first.** Both server release workflows pull this image.

## Step 2 - tag the server (audiosilo-server)

Push a `v*` tag (e.g. `v1.4.0`) in **audiosilo-server**. One tag triggers two
independent pipelines:

### 2a. Docker image (`image.yml`, name: *server image*)

Builds the multi-stage `Dockerfile`, baking the web player in at `/app/web` via
`COPY --from` of the `WEB_IMAGE` build-arg, and pushes
`ghcr.io/kodestar/audiosilo-server` tagged with the semver version, the commit
sha, and `latest`.

- On a tag push, the baked-in web image is **`audiosilo-web:latest`**. To pin a
  specific web version instead, run the workflow manually
  (`workflow_dispatch`) and set its `web_version` input.
- The release version is stamped into the binary via the `VERSION` build-arg
  (ldflags → `internal/api.Version`) and reported by `GET /api/v1/server`, the
  admin console, and the web player.
- GHCR references must be lowercase; the workflows lowercase the repository
  owner themselves.
- One-time setup: make both GHCR packages public after the first push, or
  `docker login ghcr.io` on the deploy host.

You can also build locally:

```sh
docker login ghcr.io
docker build --build-arg WEB_IMAGE=ghcr.io/kodestar/audiosilo-web:latest \
  -t ghcr.io/kodestar/audiosilo-server:dev .
docker push ghcr.io/kodestar/audiosilo-server:dev
```

### 2b. Native binaries (`release.yml`, name: *release (native binaries)*)

The same tag runs GoReleaser (`.goreleaser.yml`) for home users who don't want
Docker. The server is CGO-free (modernc SQLite), so linux/darwin/windows ×
amd64/arm64 all cross-compile from one Linux runner.

- **Web player embedded:** builds with `-tags embedplayer`;
  `scripts/fetch-web-player.sh` populates `internal/web/player/` from the pinned
  web image (the `WEB_IMAGE` env, defaulting to `:latest`, overridable via the
  dispatch input) - so `/web` works with no `web_dir`.
- **ffmpeg/ffprobe are NOT bundled** (large, usually present). At runtime the
  server prefers a local copy (explicit flag → next to the binary → `$PATH`) and
  otherwise downloads a cached static build into `<data>/tools` on first run -
  see the [media docs](../server/media.md).
- Outputs: `.tar.gz` (Linux/macOS), `.zip` (Windows), `.deb`/`.rpm` (which depend
  on the distro's ffmpeg and install a systemd unit), and `checksums.txt`.
- The GitHub Release is created as a **draft** - a human reviews the notes and
  artifacts, then publishes.

Validate the GoReleaser config locally without releasing:

```sh
goreleaser check
goreleaser build --snapshot --clean --skip=before --single-target
```

(`--skip=before` skips the web-player fetch, which needs Docker + network; the
committed `internal/web/player/.gitkeep` keeps the embed compiling.)

## Versions and tags

- Releases are **`v`-prefixed semver tags** (`v*`) on each repo; there is no
  cross-repo version lockstep. The server↔web pairing is by **image pinning**,
  not version numbers, and native apps negotiate against any server version via
  the `GET /server` capability flags.
- The server version string comes from the release tag via ldflags
  (`internal/api.Version`) in both the Docker and GoReleaser builds; untagged
  builds report `dev`.
- Frontend `v*` tags version the **web image**; the native app's marketing
  version is separate (`app.json` → `expo.version`, below).

## Step 3 - post-release verification

The end-to-end smoke test from `RELEASING.md`:

1. `docker compose up -d`; grab the admin password from
   `docker compose logs`.
2. Open `/admin`, sign in, add a library, create a user, click **Copy invite**.
3. **Web:** open the invite link → connect screen → **Open web player** (or
   visit `/web`) → it exchanges the token and drops you into the player.
4. **Native:** run the app from audiosilo-frontend (`expo start` / a dev build),
   scan the QR or open the invite to pair. Tap-to-open-app from the OS
   additionally needs `app_links` configured and HTTPS on the claimed domain.

Worth checking at the same time: `GET /api/v1/server` reports the new version
(and `web_player: true`), and the draft GitHub Release's artifacts and
`checksums.txt` look right **before** you publish it.

## The app-store track (iOS / Android)

The native apps are a **separate pipeline** from everything above - nothing about
a server/web release touches them, and they don't run in CI. The full personal
runbook is the workspace `~/dev/audiosilo/STORE-DEPLOYMENT.md` (committed to the
meta repo at the workspace root). The honest summary:

- **Builds go through EAS Build** - the app has a custom native module
  (`modules/audiosilo-player`) so it must be compiled; Expo Go can't run it.
  `eas.json` uses `appVersionSource: remote` with `autoIncrement: true`, so build
  numbers are managed by EAS; the user-facing **marketing version** is bumped by
  hand in `app.json` → `expo.version` for each real release.
- **The project is on the EAS free tier**, so the preferred path is
  **`eas build --local`** - it compiles on your own machine (no build-quota
  usage, no cloud queue) while still using EAS-managed signing credentials and
  the remote version counter. One platform per invocation; iOS needs Xcode +
  Fastlane, Android needs JDK 17 + `ANDROID_HOME`.
- **Submission:** `eas submit --latest` per platform, with documented escape
  hatches - uploading the `.ipa` directly with `xcrun altool` when the EAS
  submit queue is slow, and manual `.aab` upload in the Play Console (which
  Google *requires* for the very first Android release anyway).
- **No OTA updates.** `expo-updates` is not installed, so every change - JS or
  native - ships as a full store build.
- **Current status: working through the stores' release processes, not
  generally available.** Builds flow to TestFlight and Play testing tracks. On
  Google Play, a personal developer account must run a closed test with ≥ 12
  opted-in testers for 14 continuous days before production unlocks - that
  tenure, not the build, is the long pole. On Apple, the gate is human App
  Review; the "reviewer needs a server" problem (guideline 2.1) is answered with
  the public demo server noted in `store/metadata/ios/review_notes.txt`, which
  must stay reachable throughout a review.

## Manager distribution (planned installers)

`audiosilo-manager/.github/workflows/desktop.yml` builds the Wails app on `v*`
tags across a native-runner matrix (macOS `darwin/universal`, Windows
`windows/amd64`, Linux `linux/amd64` - the webview UI can't cross-compile),
checking out the server repo as a sibling for the `replace` directive and
stamping the version via `-ldflags "-X main.version=<tag>"`.

Today the outputs are **unsigned workflow artifacts**, not a published release.
Per the workspace `DISTRIBUTION.md`, the plan is native installers on GitHub
Releases - macOS `.dmg` with notarization, Windows NSIS `.exe`, Linux
`AppImage` - but signing is credential-gated: it needs an Apple Developer ID
certificate + notarization credentials and a Windows Authenticode certificate.
Until those exist, the signing steps in `desktop.yml` are stubbed and unsigned
builds hit Gatekeeper/SmartScreen warnings.

:::tip When a release involves a wire change
A cross-repo wire change only reaches users compatibly because the server image
pins its web build. Land the change per the
[cross-repo checklist](cross-repo-changes.md) first, then release web → server in
that order.
:::
