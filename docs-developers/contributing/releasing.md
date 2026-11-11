---
title: Cutting a release
description: "The operator's runbook: web image first, then the server image and native binaries on a v* tag, plus the app-store track."
---

AudioSilo ships several artifacts from the server and player repos, and **order
matters**. The server image and the native binaries both bake in a **pinned web
player build**, so the web image must exist before the server release that
consumes it. The [release pipeline](../architecture/release-pipeline.md) gives
the conceptual overview. This page is the step-by-step runbook, and it follows
the maintainer notes in `audiosilo-server/RELEASING.md`.

## What ships

| Artifact | Built by | Trigger | Where it lands |
|---|---|---|---|
| `ghcr.io/kodestar/audiosilo-web` | `audiosilo-frontend/.github/workflows/web.yml` | push to `main` (`:latest`); `v*` tags (semver) | GHCR. A tiny image holding only the static web export (`baseUrl=/web`) |
| `ghcr.io/kodestar/audiosilo-server` | `audiosilo-server/.github/workflows/image.yml` | `v*` tags; push to `main` (`:edge`); manual dispatch | GHCR. The deployable image, with the web player baked in at `/app/web` |
| Native server binaries | `audiosilo-server/.github/workflows/release.yml` (GoReleaser) | `v*` tags; manual dispatch | **Draft** GitHub Release on `KodeStar/audiosilo-server` |
| `lscr.io/linuxserver/audiosilo` | LinuxServer.io's CI ([linuxserver/docker-audiosilo](https://github.com/linuxserver/docker-audiosilo)) | publishing a server release (polled hourly) | Docker Hub, GHCR and lscr.io, and Unraid Community Applications |
| iOS and Android apps | EAS Build (manual, outside CI) | on demand | App Store Connect and Google Play Console |
| Android sideload APK | EAS Build, `production-apk` profile (manual) | each app release, from 2.5.0 | an `AudioSilo-<version>.apk` asset on the frontend's **App** GitHub Release |

## Step 1: publish the web player image (audiosilo-frontend) {/* #step-1---publish-the-web-player-image-audiosilo-frontend */}

To publish the web player image, push to `main` (or push a `v*` tag) in
**audiosilo-frontend**. **Do this first**, because both server release
workflows pull this image.

`web.yml` runs `npx expo export --platform web`, built with `baseUrl=/web` from
`app.json`. It then pushes `ghcr.io/kodestar/audiosilo-web:latest`, plus the
semver tag on `v*` tags. It publishes `:latest` only from the default branch.

When its run is green, the new `audiosilo-web:latest` is on GHCR.

## Step 2: tag the server (audiosilo-server) {/* #step-2---tag-the-server-audiosilo-server */}

To release the server, push a `v*` tag (e.g. `v1.4.0`) in
**audiosilo-server**. One tag triggers two independent pipelines.

### 2a. Docker image (`image.yml`, name: *server image*)

`image.yml` builds the multi-stage `Dockerfile`. It bakes the web player in at
`/app/web` from the `WEB_IMAGE` build-arg (the
[release pipeline](../architecture/release-pipeline.md) explains the
mechanism), and pushes `ghcr.io/kodestar/audiosilo-server` tagged with the
semver version and `latest`. A release carries no `sha-` tag, so pin a release
by its version.

- On a tag push, the baked-in web image is **`audiosilo-web:latest`**. To pin a
  specific web version instead, run the workflow manually **on the tag** and set
  its `web_version` input (`gh workflow run image.yml -R
  KodeStar/audiosilo-server --ref v1.4.0 -f web_version=<web version>`).
- Without `--ref`, the dispatch runs on `main`. It then publishes only a
  `sha-<short>` tag with that player, and no release. A dispatch on `main`
  moves `:edge` only when `web_version` is left at `latest`.
- The `VERSION` build-arg stamps the release version into the binary (through
  ldflags into `internal/api.Version`). `GET /api/v1/server`, the admin console
  and the web player report it.
- GHCR references must be lowercase. The workflows lowercase the repository
  owner themselves.
- One-time setup: make both GHCR packages public after the first push, or run
  `docker login ghcr.io` on the deploy host.

You can also build locally:

```sh
docker login ghcr.io
docker build --build-arg WEB_IMAGE=ghcr.io/kodestar/audiosilo-web:latest \
  -t ghcr.io/kodestar/audiosilo-server:dev .
docker push ghcr.io/kodestar/audiosilo-server:dev
```

The image builds the native SQLite engine in by default. Add
`--build-arg SQLITE_ENGINE=modernc` for the pure-Go one (see
[SQLite choices](../server/data-model.md#sqlite-choices)).

### 2b. Native binaries (`release.yml`, name: *release (native binaries)*)

The same tag runs GoReleaser (`.goreleaser.yml`) for home users who don't want
Docker. It builds linux, darwin and windows for amd64 and arm64, all from one
Linux runner. The Linux binaries build the native SQLite engine in, and the
macOS and Windows ones stay pure Go (see
[Native binaries in the release pipeline](../architecture/release-pipeline.md#3-native-binaries---releaseyml--goreleaseryml)).
A local `goreleaser build --snapshot` of a Linux target needs that target's C
compiler (`x86_64-linux-gnu-gcc` or `aarch64-linux-gnu-gcc`). On a Mac, build
in a `golang:1.26` container.

- **Web player embedded.** The binaries build with `-tags embedplayer`.
  `scripts/fetch-web-player.sh` populates `internal/web/player/` from the
  pinned web image, so `/web` works with no `web_dir`. The image comes from the
  `WEB_IMAGE` env, which defaults to `:latest` and which the dispatch input can
  override.
- **Admin console embedded.** A before-hook runs `scripts/build-admin.sh
  --build-only`, so every binary carries the console under
  `internal/web/adminui`. The build output is never committed.
- **ffmpeg and ffprobe are NOT bundled**, since they are large and usually
  present. At runtime the server prefers a local copy: the explicit flag first,
  then one next to the binary, then `$PATH`. Otherwise it downloads a cached
  static build into `<data>/tools` on first run (see the
  [media docs](../server/media.md)).
- **Outputs:** `.tar.gz` (Linux and macOS), `.zip` (Windows), `.deb` and `.rpm`
  (which depend on the distro's ffmpeg and install a systemd unit), and
  `checksums.txt`.
- **A draft release.** GoReleaser creates the GitHub Release as a **draft**.
  The person cutting the release reviews its notes and artifacts, then
  publishes it. The draft appears before the workflow finishes, because the
  workflow's last step then smoke-tests the uploaded archives. So **publish
  only once the run is green**. Publishing is also what triggers the
  LinuxServer.io image (see
  [Smoke test and the LinuxServer.io image](../architecture/release-pipeline.md#smoke-test-and-the-linuxserverio-image-downstream)).
- **The sponsor line.** The notes end with GoReleaser's `release.footer`, which
  also carries the one sponsor line: "AudioSilo is free; sponsors keep it
  going", linking GitHub Sponsors. It is the same message as the admin
  console's update notice. Keep it when you rewrite the notes by hand, and add
  nothing more (no tiers, no rewards).

Validate the GoReleaser config locally without releasing:

```sh
goreleaser check
goreleaser build --snapshot --clean --skip=before --single-target
```

`--skip=before` skips the web-player fetch, which needs Docker and network, and
the admin console build. The committed `.gitkeep` files keep both embeds
compiling. Run `scripts/build-admin.sh` first if the snapshot should carry the
real console.

When the run is green and you have published the draft, the release is out.

## Versions and tags

- Releases are **`v`-prefixed semver tags** (`v*`) on each repo. There is no
  cross-repo version lockstep.
- GoReleaser does not mark a pre-release tag (for example `v2.1.0-rc1`) as a
  pre-release itself. Tick **Set as a pre-release** when publishing one.
  Otherwise `releases/latest` moves to it, and the LinuxServer.io image ships it
  to every Unraid install. A pre-release tag also moves the server image's
  `:latest`, since `image.yml` publishes it on every `v*` tag.
- The server and the web player are paired by **image pinning**, not by version
  numbers. Native apps negotiate against any server version through the
  `GET /server` capability flags.
- The server version string comes from the release tag via ldflags
  (`internal/api.Version`) in both the Docker and GoReleaser builds. Other
  builds report:
  - a local `go build` or `docker build`: `dev`;
  - a GoReleaser snapshot: `<next patch>-snapshot`;
  - an `image.yml` build of a branch (`:edge`, or a dispatch on a branch):
    `dev-<short sha>`, the same 7 characters as its `sha-` tag.
- Frontend `v*` tags version the **web image**. The native app's marketing
  version is separate (`expo.version` in `app.json`, see
  [The app-store track](#the-app-store-track-ios--android)).

## Step 3: post-release verification {/* #step-3---post-release-verification */}

To check a release end to end, run the smoke test from `RELEASING.md`:

1. On a machine that ran an earlier release, run `docker compose pull` first,
   because `up` does not re-pull a cached `:latest`. Then start the stack with
   `docker compose up -d`, and copy the admin password from
   `docker compose logs`.
2. Open `/admin`, sign in, add a library, then select **Invite someone** and
   copy the invite link.
3. **Web:** open the invite link, then select **Open web player** on the
   connect screen (or visit `/web`). The page exchanges the token, and the web
   player opens signed in.
4. **Native:** run the app from audiosilo-frontend (`expo start` or a dev
   build), then scan the QR or open the invite to pair. Opening the app from a
   link in the OS also needs `app_links` configured and HTTPS on the claimed
   domain.

Check at the same time that `GET /api/v1/server` reports the new version and
`web_player: true`. Check the draft GitHub Release's artifacts and
`checksums.txt` **before** you publish it.

When all four steps work, the release is good.

## Testing main before a release (`:edge`)

Every push to `main` in audiosilo-server also runs `image.yml` and publishes
**`:edge`**, plus `sha-<short>` to pin one commit. `:latest` stays
release-only. The
[server Docker image section of the release pipeline](../architecture/release-pipeline.md#2-server-docker-image---audiosilo-servergithubworkflowsimageyml)
explains how the tags, `concurrency` and the `dev-<short sha>` version work.

- A frontend-only change doesn't rebuild edge. Its baked player stays at
  whatever `audiosilo-web:latest` was when edge was built. Once the frontend's
  `web.yml` run has published, refresh it with
  `gh workflow run image.yml -R KodeStar/audiosilo-server --ref main`.
- Edge may run database migrations a release can't undo, so test it against a
  **copy** of a data directory, never the live one.

The User Guide's
[Quick start with Docker](/users/getting-started/quickstart-docker#testing-unreleased-builds)
has the user-facing instructions, including why an LSIO install can't just
switch tags.

## The app-store track (iOS / Android)

The native apps are a **separate pipeline** from everything above. Nothing about
a server or web release touches them, and they don't run in CI. The full
personal runbook is the workspace `~/dev/audiosilo/STORE-DEPLOYMENT.md`,
committed to the meta repo at the workspace root. In short:

### Builds and versions

- **Builds go through EAS Build.** The app has a custom native module
  (`modules/audiosilo-player`), so it must be compiled. Expo Go can't run it.
- `eas.json` uses `appVersionSource: remote` with `autoIncrement: true`, so EAS
  manages the build numbers. The person cutting the release bumps the
  user-facing **marketing version** by hand in `expo.version` in `app.json` for
  each real release.
- **The project is on the EAS free tier**, so the preferred path is
  **`eas build --local`**. It compiles on your own machine, with no build-quota
  usage and no cloud queue, while still using EAS-managed signing credentials
  and the remote version counter. It builds one platform per invocation. iOS
  needs Xcode and Fastlane, and Android needs JDK 17 and `ANDROID_HOME`.

### First builds with a new target

- **The first production IPA with the watch app:** check that its watch
  `CFBundleVersion` matches the phone's before submitting
  ([The release check](../frontend/apple-watch.md#the-release-check)).
- **The first iOS build with the widget extension** signs two targets:
  - The App Group `group.app.audiosilo` has to be registered with Apple and
    enabled on both `app.audiosilo` and `app.audiosilo.widget`.
  - EAS needs a provisioning profile for each.
  - EAS can register the extension's id and the group itself when it is signed
    in with an Apple ID. An App Store Connect API key alone skips the group.

  Details are in
  [Native integrations](../frontend/native-integrations.md#widgets-and-the-live-activity-ios).
- **Android Auto on Google Play** needs the Android Auto form factor added to
  the release (Play Console > Advanced settings > Form factors). Google reviews
  such releases against its car app quality guidelines, and a failure blocks
  open testing and production.

### R8 on Android release builds

**Android release builds are minified and resource-shrunk with R8.** The
`expo-build-properties` plugin entry in `app.json` enables it
(`enableMinifyInReleaseBuilds`, `enableShrinkResourcesInReleaseBuilds`).

- Debug builds and jest never run R8. A new or upgraded native dependency
  therefore needs
  [an Android release build](../frontend/testing.md#an-android-release-build)
  before it ships.
- **R8 stripped code** when a release build alone throws
  `ClassNotFoundException`, `NoSuchMethodError` or `NoSuchFieldError`, or a field
  read by reflection arrives empty. Add a keep rule to the same plugin entry's
  `android.extraProguardRules`, with one comment per rule saying what it keeps.
  Never turn minify off.
- **The resource shrinker** is the cause of a release-only
  `Resources$NotFoundException`. A ProGuard rule can't keep a resource. The
  resource needs a `tools:keep` list in its own `res/raw/*.xml`, written by a
  config plugin. React Native already generates `raw/keep.xml`, so do not use
  that name.
- **Mapping files.** R8's mapping file ships inside the `.aab`, so the Play
  Console deobfuscates crash traces without a separate upload. A `preview`
  build (internal distribution) is an APK whose mapping is kept nowhere. To
  trace one, build it with `EAS_LOCAL_BUILD_SKIP_CLEANUP=1 eas build --local`
  and keep `android/app/build/outputs/mapping/release/mapping.txt` from the
  working directory it leaves behind.

### The sideload APK

From 2.5.0, each app release on `KodeStar/audiosilo-frontend` (the
**App x.y.z** GitHub Release on the `v*` tag) also carries an APK.

- `eas.json`'s `production-apk` profile is `production` plus
  `android.buildType: apk`, so the APK has the same app code and version as the
  store build.
- To build it, run
  `eas build --platform android --profile production-apk --local`. Attach the
  file to the release as **`AudioSilo-<version>.apk`**, the name the User Guide
  shows. Keep it the only `.apk` on the release, so Obtainium picks it without
  asking.
- It is signed with the upload key, not Google Play's app signing key. It and a
  Play install therefore can't update each other, and switching means
  uninstalling first (see
  [Android without Google Play](/users/listening/mobile-apps#android-without-google-play)
  in the User Guide).
- Like a `preview` APK, it carries no R8 mapping for a console to use. To trace
  its crashes, build it with `EAS_LOCAL_BUILD_SKIP_CLEANUP=1` and keep its
  `mapping.txt` (the path is in
  [R8 on Android release builds](#r8-on-android-release-builds)).

### Submission and review

- **Submission:** `eas submit --latest` per platform. There are two documented
  escape hatches:
  - upload the `.ipa` directly with `xcrun altool` when the EAS submit queue is
    slow;
  - upload the `.aab` manually in the Play Console, which Google *requires* for
    the very first Android release anyway.
- **No OTA updates.** `expo-updates` is not installed, so every change, JS or
  native, ships as a full store build.
- **Current status: the apps are in the App Store and on Google Play.** Every
  update still goes through each store's review.
  - On Apple that is human App Review. The "reviewer needs a server" problem
    (guideline 2.1) is answered with the public demo server noted in
    `store/metadata/ios/review_notes.txt`, which must stay reachable throughout
    a review.
  - On Google Play an update's review can take days, which is why each release
    also carries the sideload APK.

:::tip[When a release involves a wire change]
A cross-repo wire change only reaches users compatibly because the server image
pins its web build. Land the change per the
[cross-repo checklist](cross-repo-changes.md) first, then release the web image
and then the server, in that order.
:::
