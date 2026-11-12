---
title: Wear OS
description: "The standalone Wear OS app (wear/, wear-core/, plugins/withWearApp.js) and the Android phone's side (modules/audiosilo-watch/android): the Gradle wiring, the pure Kotlin core and its tests, downloads and sync in WorkManager, playback, the Data Layer contract with its receipts, the phone in Downloads, the release check, and what the emulator can't show."
---

A standalone Kotlin app for Wear OS 3 and later (minSdk 30), written with Compose for Wear OS
Material 3. It is the Apple Watch app's twin: its own token, `device_id`, outbox and downloads,
talking to the server directly. The Android phone hands it a pairing token and books over the
Wear Data Layer and nothing else. There is no sync relay through the phone. The listener's side
is in the [User Guide](/users/listening/wear-os).

The authoritative rules live in the frontend's `CONVENTIONS.md`, "Wear OS app" and the phone's
"Android: the Wear OS phone side". This page is the map. Most rules are the
[Apple Watch's](apple-watch.md), ported, and this page names where Wear differs.

| Piece | Where |
|---|---|
| The watch app, module `:wear` | `wear/` (package `app.audiosilo.wear`, outside `android/` so it survives `prebuild --clean`) |
| Pure rules, the tested part | `wear-core/` (Kotlin/JVM, package `app.audiosilo.wear.core`, a composite build) |
| The Gradle wiring | `plugins/withWearApp.js` |
| The watch's end of the messages | `wear/.../phone/PhoneLink.kt`, `PhoneLinkService.kt`; `wear-core`'s `PhoneMessages.kt`, `PhoneInbox.kt` |
| The phone's module | `modules/audiosilo-watch/android/`: `WearLink.kt` (the only Data Layer user), `WearRules.kt` (its pure rules), `WearLinkService.kt`, `AudiosiloWatchModule.kt` |
| The phone's TS surface | `src/watch/`, shared with the Apple Watch: `link.native.ts` for iOS and Android, `link.ts` the web no-op, `watch-model.ts` with `watchKindOf` and `watchWording` |
| The phone's UI | `src/components/account/watch-card.tsx`, `src/components/downloads/watch-section.tsx`, the `'watch'` action in `book-actions.tsx` |

## The build

The package is `app.audiosilo`, the same as the phone's. The Data Layer only connects apps
with the same package and the same signing certificate.

`withWearApp` adds one tagged block after `include ':app'` in the generated
`android/settings.gradle`: `include ':wear'` with its `projectDir` at `../wear`, and
`includeBuild('../wear-core')`. Prebuild twice leaves one block. Nothing goes into the root
`build.gradle`: `wear/build.gradle` puts the Compose compiler plugin on its own `buildscript`
at the root's `kotlinVersion`, and applies EAS's `eas-build-inject-android-credentials.gradle`
and `eas-build-configure-version.gradle` when they are present. Its versionCode comes from
`:app`'s `defaultConfig`, so EAS gives each Wear build a code of its own.

React Native's root plugin makes `:app:preBuild` depend on `:wear:preBuild`, so a broken
`:wear` breaks the phone's build. `AUDIOSILO_NO_WEAR=1` skips the wiring, and a prebuild with
it set takes the block out of an `android/` already wired.

Media3 is the phone's strict 1.9.0. There is no Horologist, because its alpha needs a newer
Kotlin standard library than the SDK resolves.

The EAS profiles all extend `production`:

| Profile | Builds | For |
|---|---|---|
| `production-wear` | an AAB, `:wear:bundleRelease` | Google Play's Wear OS track |
| `production-wear-apk` | a signed APK, `:wear:assembleRelease` | the GitHub release, as `AudioSilo-wear-X.Y.Z.apk`, beside the phone's `production-apk` |
| `preview-wear` | an APK | emulator installs |

With `appVersionSource: remote`, each of these builds takes the next remote versionCode,
`preview-wear` included. That is harmless, since codes only have to rise.

## The Core boundary

`wear-core/` imports nothing from `android.*`, so `npm run test:wear` runs it on any JDK 17.
It ports `targets/watch/Core/*` file for file, with the Swift suites' vectors as JUnit tests:
Timeline, PlayerRules, SleepTimer, SpanRecorder, Outbox, AckAndOffer, ClockSkew,
AddressPicker, AccountRules, ClientHeader (`audiosilo-watch/<ver> (wearos)`), RenditionPlan,
PhoneMessages, HeldBooks, StatePublication, ContinueOrder, QueryString and JsonFile. A rule
changed on one watch changes on both, tests included. Swift's `rounded()` is `roundHalfAway`
here, since Kotlin's `round` rounds half to even.

Not ported, because they are Apple-only: `Outbox.backgroundBody` and `applyBackground`,
`ClockSkew.clockOffset`, `BackgroundSync`, `AddressPicker.unattended` and
`RenditionPlan.keepsTransfer`. Wear's `SyncSchedule` says when a send runs instead.

Wear's own pure files are `Downloads.kt` (the account, the item cache, the downloads index,
Continue listening's rows), `BookDownload` (one book's run), `SystemPause`, `PhoneInbox`,
`FileSpanStore` and `Labels` (the screens' words).

**Durable files.** `JsonFile(durable = true)` syncs the bytes before its rename and the folder
after, so a battery death never leaves an empty file. Only `outbox.json`, `open-span.json` and
`places.json` are durable, since losing them loses listening. Everything else is rebuilt from the
server or the phone. While playing, a plain 5 s tick syncs only the open span, and the 15 s cut
syncs the outbox, then the next span, then the place. `places.json` is synced on a pause, seek,
stop, rate change, the end, a closed span, the background, a removal and sign-out. On the plain
tick the place changes in memory only, and at launch `PlaceStore.recover` takes a newer place
from the span a kill left behind. An outbox with nothing waiting removes its file.

## Downloads

One WorkManager `BookWorker` per book (unique work `book:<name>`, `KEEP`, any connected
network) runs `BookDownload`:

1. It reads the item and chapters, then `POST .../renditions`.
2. It polls at `retry_after_seconds` (15 s at least) for up to 30 min, then hands over to
   WorkManager's backoff.
3. It checks the free space against the rendition's bytes plus 200 MB.
4. It fetches each file into `books/<folder>/` with `Range` and `If-Range` on the strong ETag.
   A `.part` and an `.etag` sit beside the file, so every run is idempotent. A 416 starts that
   file again from 0.

Unlike the Apple Watch, the prepare step runs in the background too. A book sent from the phone
starts preparing with the watch app closed, and Home shows Preparing, then Downloading, as the
worker moves on. Each stage change publishes `watch-state`, so the phone's row follows.

**Wi-Fi.** The worker asks for unmetered Wi-Fi (`WifiRequest`, `TRANSPORT_WIFI` and
`NOT_METERED`) and binds OkHttp to it, as Wear's guidance asks for large transfers. After 30 s
with none, the record says "Waiting for Wi-Fi" and the row offers "Use the phone's connection
(slow)". Taking it sets `slow` on the record and replaces the work on the default network. The
worker waits up to 10 min for Wi-Fi before the backoff takes over. The process can be killed
during that wait, which was seen once on the Wear OS 6 emulator, and the next run picks up where
it was.

Each run picks its own address over its own network (`AddressPicker.pick`, home only after the
`server_id` probe). A run can outlast that network, so `ProvenBookServer` proves a home pick
again once it is 90 s old.

The worker runs in the foreground (`dataSync`) with a "Getting (title) ready" notification. The
watch asks for `POST_NOTIFICATIONS` once, after the first sign-in.

## Sync

`AppModel.schedule(trigger)` runs `SyncSchedule.plan`. In the foreground the watch flushes at
launch (after `spans.recover()`), on the foreground, after each closed span, every 60 s while
events wait, and when a network comes up. In the background `SyncWorker.expedite` enqueues
unique work `sync` (`KEEP`, `CONNECTED`, `RUN_AS_NON_EXPEDITED` out of quota), with the 15 min
`sync-periodic` backstop while events wait.

**Differs from the Apple Watch:** the worker builds the body when it runs, so each attempt sends
a fresh `sent_at` and needs no `clock_offset`. The worker runs the `server_id` probe itself, so
the home address is allowed in the background too. It never gates on a connectivity API: a
`NetworkCallback` only triggers a try.

Sign-out, and a replacing account, are blocked while events wait unless the listener discards
them. Sign-out stops the player first.

## Playback

`PlayerEngine`, the twin of `WatchAudioEngine.swift`, owns one ExoPlayer with one `MediaItem`
per downloaded file. Audio focus and becoming-noisy are handled, with speech attributes.
`PlaybackService` (a `MediaSessionService`) holds the session over `ChapterPlayer`, a
`ForwardingPlayer` that sends every outside command through the engine: next and previous are
chapters, the skips are 15 and 30 s, and a scrubber is a move. `OngoingNotification` adds the
`OngoingActivity` while playing.

**The speaker.** `setSuppressPlaybackOnUnsuitableOutput(true)` holds until the listener confirms
the speaker (prefs `player`, `speakerConfirmed`). A play with only the built-in speaker shows the
one-time question in `Prompts.kt`. Yes rebuilds the player without suppression and hands it to the
session. No opens `OutputSwitcher`: the media output panel, else the Bluetooth settings, because
Media3 1.9.0 opens neither.

**A pause the system makes** is read from Media3's reasons (`SystemPause`). A focus loss, noisy,
an unsuitable output or suppressed-too-long ends the span where the audio last moved. A transient
focus loss closes the span but keeps the wish to play.

Spans, ticks, the pull before play, the offer and its throttles are the Apple Watch's.

## Storage and identity

`TokenStore` seals the token with a non-exportable Android Keystore AES-GCM key
(`audiosilo.session`). The ciphertext and `device_id` live in `noBackupFilesDir`.
`allowBackup=false`, and `data_extraction_rules.xml` excludes every domain. `device_name` at the
exchange is `Settings.Global.DEVICE_NAME`, else `Build.MODEL`, so the User Guide does not promise
the watch's own name.

`network_security_config.xml` allows cleartext, as the phone's `usesCleartextTraffic` does, for
the [home address after the probe](connect-and-addresses.md#pairing-at-a-self-signed-servers-home-http).
It trusts system CAs only. An away address needs trusted HTTPS.

## Sign-in

`AppModel.receive` handles the phone's messages one at a time, in order. A `pair` is exchanged at
`base_url`, then `away`, then the home http address under `pairingFallback`'s rule. Past
`expires_at` the watch says "Send again from your phone". There is no typed sign-in. With no
node advertising `audiosilo_phone_app`, Setup offers "Get AudioSilo on your phone", which opens
Play on the phone (`RemoteActivityHelper`).

## The Data Layer contract

The JSON messages are the [Apple Watch's](apple-watch.md#the-message-contract), each a DataItem
of UTF-8 JSON (not a DataMap). Every message from the phone carries `sent_at` (RFC 3339, set by
`watch-model.ts` on every platform; the Apple Watch ignores it). It makes each send a new
DataItem, since an identical put sends nothing, and it lets the watch ignore a `remove` older than
the download it would remove. `<node>` is the target watch's node id. DataItems reach every
node, so a watch ignores items addressed to another.

| Item | Path | Put by |
|---|---|---|
| `pair` | `/audiosilo/v1/to/<node>/pair` (one path, so a new pair replaces an undelivered one) | the phone |
| `book`, `remove` | `/audiosilo/v1/to/<node>/book/<key>`, `<key>` the hex SHA-256 of `<server_id>.<user_id>\|<library_id>\|<path>` (one path per book, so the latest intent wins) | the phone |
| receipt | `/audiosilo/v1/from/<node>/taken/<key>`, `{v:1, type:"taken", path, sent_at}` | the watch |
| `watch-state` | `/audiosilo/v1/watch-state` (the latest only) | the watch |

**Receipts, not deletes.** The watch never deletes the phone's items: a cross-device delete
loses to the put by wall clock when the phone's clock runs ahead, and the two ends then disagree
for good. Once the watch has kept an item's effect, it puts a receipt naming the item's path and
echoing its `sent_at` as text. The phone deletes its own item only when both match what it holds,
so a newer send at that path stays. The watch drops its receipt once the item is gone. An
unknown message type gets no receipt.

**Starts.** An item put before the watch app was installed fires no change event, so the watch
reads all of `/audiosilo/v1/to/<me>/` and its receipts at every start and every return to the
foreground. A sweep drops settled receipts before it takes items. The watch ignores DELETED under
`/to/<me>/`: uninstalling the phone app deletes its items on the watch.

There is no state request. Play services keeps the watch's items for a reinstalled phone app.

**One listener per side.** On the watch, `PhoneLinkService` (the one `WearableListenerService`,
filtered to `/audiosilo/v1/to/`, so Play services starts the app for an item even when it was
swiped away) and the running process's DataClient listener both hand events to
`PhoneLink.onEvents`, which handles one at a time under a lock. On the phone, `WearLink.kt` is
the only code that puts or deletes under `/audiosilo/v1/`, woken by `WearLinkService` for
receipts and `watch-state`, plus a sweep at start. `watch-state` is published as the Apple
Watch's `StatePublication`.

**Installed and paired.** The watch advertises `audiosilo_wear_app` and the phone
`audiosilo_phone_app` (each module's `res/values/wear.xml`). Only Play services reads those
arrays, by name, so a raw keep file holds each through release resource shrinking. A
`tools:keep` on a values file's root is dropped when the values merge. `wear.yml` fails if the
watch's release APK loses its capability.

The phone's snapshot (`WearRules.snapshot`) is `paired` when the Wearable API answers and a watch
is connected or has a `watch-state`, and `installed` when a target exists. `isSupported` is Play
services being there. A Data Layer that fails or gives no answer in 5 s is not "no watch":
`getSnapshot` rejects with `ERR_NO_ANSWER`, and JS keeps its last answer.

**One watch at a time.** The target is the node with the app (the capability or a
`watch-state`) whose `watch-state` this phone saw last (kept in prefs), else a connected one
nearby, else a connected one. `watch_id` is its node id. A new pair drops any pair held for
another watch.

**Pairs expire.** The phone prunes a `pair` past `expires_at` at every snapshot, send and start,
so a pairing token does not linger on a watch.

## The phone in Downloads

The ledger and its rows are the [Apple Watch's](apple-watch.md#the-watch-in-downloads). On
Wear, `outstanding` is the phone's own `book` and `remove` items still present, never `failed`,
since a DataItem waits for the watch. The 7-day hold ends one the watch never takes. "Delivered"
means the watch app took the item, so the row never asks the listener to open the watch app.

`watchWording` maps each Apple-worded key to its Wear twin: the card is "Wear OS watch", the
section "On your watch", and Set up is "Set up your watch". The card's `install` status offers
**Install on watch** (`openInstallOnWatch`, `RemoteActivityHelper` on every connected watch). The
card, the action and the section hide for a kid's or demo account, as on iOS.

## Tests

```sh
npm run test:wear    # wear-core's JUnit suites; skips, and passes, without JDK 17
```

After `npx expo prebuild -p android`, from `android/`:

```sh
./gradlew :wear:assembleDebug :wear:testDebugUnitTest :app:assembleDebug
./gradlew :audiosilo-watch:testDebugUnitTest    # the phone's WearRules
```

`:wear`'s JVM tests cover `ApiClient` on MockWebServer, the router, `TokenStore`, Continue
listening, the Media3 constants and the screens' words. `.github/workflows/wear.yml` runs the
core tests, then a prebuild and
`:wear:assembleDebug :wear:testDebugUnitTest :wear:assembleRelease :app:assembleDebug`. It then
checks that the release dex holds no debug sign-in and keeps its capability, and runs the phone
module's `:audiosilo-watch:testDebugUnitTest`. The phone's TS side is ordinary jest with the
module mocked ([the list](testing.md#whats-covered-today)).

**The debug sign-in** (debug builds only) reads intent extras on `MainActivity`: `debug_pair`,
`debug_book` and `debug_remove` take v1 messages as JSON, as if the phone sent them, and
`debug_play` plays the first book. `src/release` has an empty stand-in that R8 removes. The
recipe is in `CONVENTIONS.md`:

```sh
node scripts/watch-debug-pair.mjs http://10.0.2.2:8080 <user> <password>
adb -s <wear> shell am start -n app.audiosilo/app.audiosilo.wear.MainActivity --es debug_pair "'<json>'"
```

Force a background sync with `adb shell cmd jobscheduler run -f app.audiosilo <job id>`
(`dumpsys jobscheduler | grep app.audiosilo` lists them).

### What the emulator can't show

Everything here was run on the Wear OS emulator, paired with a phone emulator or an Android phone
for the Data Layer. Not run on a real watch yet: a run with the phone off, 30 min or more with the
wrist down, Doze and battery saver delaying the workers, Bluetooth headphones and the
unsuitable-output guard on a watch with a speaker, download speed over Wi-Fi against the phone's
Bluetooth link, storage on a small watch, Samsung's background limits, the real `device_name` and
a phone call during speaker playback. Their sentences in the [User Guide](/users/listening/wear-os)
stay hedged until they have been.

## The release check

After the phone's AAB and APK, build the watch's:

```sh
eas build -p android --profile production-wear --local
eas build -p android --profile production-wear-apk --local
```

Check the AAB with `bundletool dump manifest`: its versionCode differs from the phone AAB's,
`versionName` equals `expo.version`, and `android.hardware.type.watch` is required. The first
time, Play Console needs the Wear OS form factor added, Wear screenshots and a listing mention.
The AAB goes to the Wear OS track, whose review is separate from the phone's. The APK goes on the
GitHub release beside the phone's. A GitHub APK and a Play-installed app are signed with
different keys, so they can't talk to each other over the Data Layer. See
[Releasing](../contributing/releasing.md#the-app-store-track-ios--android).
