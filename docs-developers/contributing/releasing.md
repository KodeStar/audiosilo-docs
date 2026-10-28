---
title: Cutting a release
description: "The operator's runbook: web image first, then the server image and native binaries on a v* tag, plus the app-store track."
---

AudioSilo ships several artifacts from the server and player repos, and **order
matters**: the server image and the native binaries both bake in a **pinned web
player build**, so the web image must exist before the server release that
consumes it. The conceptual overview is in the
[release pipeline](../architecture/release-pipeline.md); this page is the
step-by-step runbook. The maintainer notes it follows are
`audiosilo-server/RELEASING.md`.

## What ships

| Artifact | Built by | Trigger | Where it lands |
|---|---|---|---|
| `ghcr.io/kodestar/audiosilo-web` | `audiosilo-frontend/.github/workflows/web.yml` | push to `main` (`:latest`); `v*` tags (semver) | GHCR - a tiny image holding only the static web export (`baseUrl=/web`) |
| `ghcr.io/kodestar/audiosilo-server` | `audiosilo-server/.github/workflows/image.yml` | `v*` tags; push to `main` (`:edge`); manual dispatch | GHCR - the deployable image, web player baked in at `/app/web` |
| Native server binaries | `audiosilo-server/.github/workflows/release.yml` (GoReleaser) | `v*` tags; manual dispatch | **Draft** GitHub Release on `KodeStar/audiosilo-server` |
| `lscr.io/linuxserver/audiosilo` | LinuxServer.io's CI ([linuxserver/docker-audiosilo](https://github.com/linuxserver/docker-audiosilo)) | publishing a server release (polled hourly) | Docker Hub / GHCR / lscr.io, and Unraid Community Applications |
| iOS / Android apps | EAS Build (manual, outside CI) | on demand | App Store Connect / Google Play Console |
| Android sideload APK | EAS Build, `production-apk` profile (manual) | each app release, from 2.5.0 | an `AudioSilo-<version>.apk` asset on the frontend's **App** GitHub Release |

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

Builds the multi-stage `Dockerfile`, baking the web player in at `/app/web` from
the `WEB_IMAGE` build-arg (mechanism in the
[release pipeline](../architecture/release-pipeline.md)), and pushes
`ghcr.io/kodestar/audiosilo-server` tagged with the semver version and `latest`.
A release carries no `sha-` tag: pin one by its version.

- On a tag push, the baked-in web image is **`audiosilo-web:latest`**. To pin a
  specific web version instead, run the workflow manually **on the tag** and set
  its `web_version` input (`gh workflow run image.yml -R
  KodeStar/audiosilo-server --ref v1.4.0 -f web_version=<web version>`).
  Without `--ref` the dispatch runs on `main`: it publishes only a
  `sha-<short>` tag with that player, and no release (a dispatch on `main` moves
  `:edge` only when `web_version` is left at `latest`).
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
- **Admin console embedded:** a before-hook runs `scripts/build-admin.sh
  --build-only` (the build output is never committed), so
  every binary carries the console under `internal/web/adminui`.
- **ffmpeg/ffprobe are NOT bundled** (large, usually present). At runtime the
  server prefers a local copy (explicit flag → next to the binary → `$PATH`) and
  otherwise downloads a cached static build into `<data>/tools` on first run -
  see the [media docs](../server/media.md).
- Outputs: `.tar.gz` (Linux/macOS), `.zip` (Windows), `.deb`/`.rpm` (which depend
  on the distro's ffmpeg and install a systemd unit), and `checksums.txt`.
- The GitHub Release is created as a **draft** - a human reviews the notes and
  artifacts, then publishes. The draft appears before the workflow finishes: its
  last step then smoke-tests the uploaded archives, so **publish only once the run
  is green**. Publishing is also what triggers the LinuxServer.io image (see
  [the release pipeline](../architecture/release-pipeline.md#smoke-test-and-the-linuxserverio-image-downstream)).
  The notes end with GoReleaser's `release.footer`,
  which also carries the one sponsor line ("AudioSilo is free; sponsors keep it
  going", linking GitHub Sponsors, the same message as the admin console's update
  notice). Keep it when you rewrite the notes by hand, and add nothing more (no
  tiers, no rewards).

Validate the GoReleaser config locally without releasing:

```sh
goreleaser check
goreleaser build --snapshot --clean --skip=before --single-target
```

(`--skip=before` skips the web-player fetch, which needs Docker + network, and
the admin console build; the committed `.gitkeep` files keep both embeds
compiling. Run `scripts/build-admin.sh` first if the snapshot should carry the
real console.)

## Versions and tags

- Releases are **`v`-prefixed semver tags** (`v*`) on each repo; there is no
  cross-repo version lockstep. GoReleaser does not mark a pre-release tag (for
  example `v2.1.0-rc1`) as a pre-release itself: tick **Set as a pre-release**
  when publishing one, or `releases/latest` moves to it and the LinuxServer.io
  image ships it to every Unraid install. A pre-release tag also moves the server
  image's `:latest` (`image.yml` publishes it on every `v*` tag). The server↔web pairing is by **image pinning**,
  not version numbers, and native apps negotiate against any server version via
  the `GET /server` capability flags.
- The server version string comes from the release tag via ldflags
  (`internal/api.Version`) in both the Docker and GoReleaser builds; a local
  `go build` or `docker build` reports `dev` (a GoReleaser snapshot
  `<next patch>-snapshot`), and an `image.yml` build of a branch (`:edge`, or a
  dispatch on a branch) reports `dev-<short sha>`, the same 7 characters as its
  `sha-` tag.
- Frontend `v*` tags version the **web image**; the native app's marketing
  version is separate (`app.json` → `expo.version`, below).

## Step 3 - post-release verification

The end-to-end smoke test from `RELEASING.md`:

1. `docker compose up -d`; grab the admin password from `docker compose logs`.
   (If this machine ran a previous release, `docker compose pull` first - `up`
   won't re-pull an already-cached `:latest`.)
2. Open `/admin`, sign in, add a library, then **Invite someone** and copy the
   invite link.
3. **Web:** open the invite link → connect screen → **Open web player** (or
   visit `/web`) → it exchanges the token and drops you into the player.
4. **Native:** run the app from audiosilo-frontend (`expo start` / a dev build),
   scan the QR or open the invite to pair. Tap-to-open-app from the OS
   additionally needs `app_links` configured and HTTPS on the claimed domain.

Worth checking at the same time: `GET /api/v1/server` reports the new version
(and `web_player: true`), and the draft GitHub Release's artifacts and
`checksums.txt` look right **before** you publish it.

## Testing main before a release (`:edge`)

Every push to `main` in audiosilo-server also runs `image.yml` and publishes
**`:edge`** (plus `sha-<short>`, to pin one commit); `:latest` stays
release-only. How the tags, `concurrency` and the `dev-<short sha>` version work is in
the [release pipeline](../architecture/release-pipeline.md#2-server-docker-image---audiosilo-servergithubworkflowsimageyml).

- A frontend-only change doesn't rebuild edge, so its baked player stays at
  whatever `audiosilo-web:latest` was when edge was built. Once the frontend's
  `web.yml` run has published, refresh it with
  `gh workflow run image.yml -R KodeStar/audiosilo-server --ref main`.
- Edge may run database migrations a release can't undo, so test it against a
  **copy** of a data directory, never the live one.

User-facing instructions (including why an LSIO install can't just switch tags)
are in the User Guide's
[Quick start with Docker](/users/getting-started/quickstart-docker#testing-unreleased-builds).

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
- **The first iOS build with the widget extension** signs two targets: the App
  Group `group.app.audiosilo` has to be registered with Apple and enabled on both
  `app.audiosilo` and `app.audiosilo.widget`, and EAS needs a provisioning profile
  for each. EAS can register the extension's id and the group itself when it is
  signed in with an Apple ID (an App Store Connect API key alone skips the group).
  Details in [Native integrations](../frontend/native-integrations.md#widgets-and-the-live-activity-ios).
- **Android Auto on Google Play** needs the Android Auto form factor added to the
  release (Play Console > Advanced settings > Form factors), and Google reviews such
  releases against its car app quality guidelines (a failure blocks open testing and
  production).
- **Android release builds are minified and resource-shrunk with R8**, enabled by
  the `expo-build-properties` plugin entry in `app.json` (`enableMinifyInReleaseBuilds`,
  `enableShrinkResourcesInReleaseBuilds`). Debug builds and jest never run R8, so a
  new or upgraded native dependency needs
  [an Android release build](../frontend/testing.md#an-android-release-build) before
  it ships. A release-only `ClassNotFoundException`, `NoSuchMethodError` or
  `NoSuchFieldError` (or a field read by reflection arriving empty) means R8 stripped
  code: add a keep rule to the same plugin entry's `android.extraProguardRules`, one
  comment per rule saying what it keeps; never turn minify off. A release-only
  `Resources$NotFoundException` is the resource shrinker instead, which a ProGuard
  rule can't keep: the resource needs a `tools:keep` list in its own `res/raw/*.xml`,
  written by a config plugin (React Native already generates `raw/keep.xml`, so not
  that name). R8's mapping file ships inside the `.aab`, so the Play Console
  deobfuscates crash traces without a separate upload. A `preview` build (internal
  distribution) is an APK whose mapping is kept nowhere: to trace one, build it with
  `EAS_LOCAL_BUILD_SKIP_CLEANUP=1 eas build --local` and keep
  `android/app/build/outputs/mapping/release/mapping.txt` from the working directory
  it leaves behind.
- **The project is on the EAS free tier**, so the preferred path is
  **`eas build --local`** - it compiles on your own machine (no build-quota
  usage, no cloud queue) while still using EAS-managed signing credentials and
  the remote version counter. One platform per invocation; iOS needs Xcode +
  Fastlane, Android needs JDK 17 + `ANDROID_HOME`.
- **The sideload APK.** From 2.5.0 each app release on
  `KodeStar/audiosilo-frontend` (the **App x.y.z** GitHub Release on the `v*`
  tag) also carries an APK, for people who don't use Google Play or don't want to
  wait for its review. `eas.json`'s `production-apk` profile is `production` plus
  `android.buildType: apk`, so it is the same app code and version as the store
  build. Build it with
  `eas build --platform android --profile production-apk --local` and attach the
  file to the release as **`AudioSilo-<version>.apk`** (that name is what the
  User Guide and the Obtainium flow it describes expect). It is signed with the
  upload key, not Google Play's app signing key, so Android won't update a Play
  install with it or the reverse: users switching must uninstall first (see
  [Android without Google Play](/users/listening/mobile-apps#android-without-google-play)
  in the User Guide).
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

:::tip[When a release involves a wire change]
A cross-repo wire change only reaches users compatibly because the server image
pins its web build. Land the change per the
[cross-repo checklist](cross-repo-changes.md) first, then release web → server in
that order.
:::
