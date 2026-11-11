---
title: Apple Watch
description: "The standalone watchOS app (targets/watch/) and the phone's side (modules/audiosilo-watch, src/watch/): the target, the Foundation-only Core and its tests, the phone-watch message contract and when the watch publishes its state, held books, the phone's ledger and the watch in Downloads, one WatchConnectivity delegate per side, the release check, and what paired simulators can't do."
---

A standalone SwiftUI watchOS 11 app: its own token, `device_id`, outbox and downloads,
talking to the server directly. The phone hands it a pairing token and books over
WatchConnectivity and nothing else. There is no sync relay through the phone. With the
phone in reach, watchOS already routes the watch's `URLSession` through it. The listener's
side is in the [User Guide](/users/listening/apple-watch).

The authoritative rules live in the frontend's `CONVENTIONS.md`, "Apple Watch app". This
page is the map.

| Piece | Where |
|---|---|
| The watch app | `targets/watch/` (Swift, not bundled by Metro) |
| Pure rules, the tested part | `targets/watch/Core/` |
| Host tests | `watch-core/` (SwiftPM, `Sources/WatchCore` is a symlink to `Core/`) |
| The watch's end of the messages | `targets/watch/Phone/PhoneLink.swift`, `Core/PhoneMessages.swift` |
| The phone's module | `modules/audiosilo-watch` (apple only): `WatchLink.swift`, `AudiosiloWatchModule.swift`, the `AudiosiloWatchAppDelegateSubscriber` |
| The phone's TS surface | `src/watch/`: `watch-model.ts` (messages and visibility, pure), `watch-rows.ts` (the Downloads rows, pure), `watch-ledger.ts`, `send.ts`, `use-watch.ts`, `watch-store.ts`, `link.ios.ts`, and `link.ts` (the no-op for web and Android) |
| The phone's UI | `src/components/account/apple-watch-card.tsx`, `src/components/downloads/watch-section.tsx`, the `'watch'` action in `src/components/library/books/book-actions.tsx` |
| The scheme | `plugins/withWatchScheme.js` |

## The target

`@bacons/apple-targets` (an exact pin, **last** in `app.json`'s plugins) adds
`targets/watch/` to the Xcode project at prebuild. It edits only the project, never the
AppDelegate, so `withCarPlay`'s exact-text rewrite still applies. `expo-target.config.js`
declares `type: 'watch'`, the name `AudioSiloWatch`, the bundle `.watchkitapp`
(`app.audiosilo.watchkitapp`), deployment target 11.0, and system frameworks only. No Swift
package or pod goes on this target (apple-targets #171).

Every file under `targets/watch/` is compiled into the target (a synchronized group), so keep
notes and fixtures out of it. `Assets.xcassets` is regenerated from the config's `icon`.

apple-targets makes no scheme, and the one Xcode makes up also builds the iPhone app, so every
pod compiled for watchOS and failed. `withWatchScheme` writes a shared `AudioSiloWatch` scheme
with only the watch target:

```sh
npx expo prebuild -p ios --clean
xcodebuild -workspace ios/AudioSilo.xcworkspace -scheme AudioSiloWatch -sdk watchsimulator build
```

Build the phone scheme with `-destination` only, never `-sdk iphonesimulator`.

`Info.plist` sets `WKRunsIndependentlyOfCompanionApp`, `UIBackgroundModes: [audio]` and ATS
`NSAllowsLocalNetworking` with `NSLocalNetworkUsageDescription`, and no arbitrary loads. There is
no certificate override. A self-signed server is reached over its
[home HTTP](connect-and-addresses.md#pairing-at-a-self-signed-servers-home-http), with the same
home names as the phone.

## The Core boundary

`targets/watch/Core/` imports **nothing but Foundation**: no SwiftUI, WatchKit, AVFoundation or
WatchConnectivity. That is what lets `watch-core/` compile it on the host. `Net/`, `Storage/`,
`Phone/`, `Playback/` and `UI/` are the platform shell around it and only Xcode compiles them.

The watch is a **hand port** of the rules it shares with the player, so a change to one of
these changes both sides, with tests on both:

| The player | The watch |
|---|---|
| `book-queue.ts` | `Core/Timeline.swift`; whole-book chapter moves in `Core/PlayerRules.swift` |
| `listening-sync.ts`, `listening-outbox.ts` | `Core/SpanRecorder.swift`, `Core/Outbox.swift` |
| `progress-sync.ts`, `place-reconcile.ts` | `Core/AckAndOffer.swift` |
| `server-address.ts`, `pairingFallback` | `Core/AddressPicker.swift` |
| `client-id.ts` | `Core/ClientHeader.swift` (`audiosilo-watch/<ver> (watchos)`) |

Sync is [Sync v2](../architecture/cross-repo-contract.md#19-listening-sync-sync-v2) with no
`PUT .../progress` fallback. A server without `listening_sync` and `"watch"` in `renditions` gets
the "too old" screen. A server without only the rendition (ffmpeg gone) still takes the
listening that waits.

**What it reads and sends:** `GET /server`, `POST /auth/exchange`, `POST /auth/logout`,
`GET /addresses`, `GET /me/progress`, `GET /libraries/{id}/progress`, `/item`, `/chapters`,
`POST`/`GET /libraries/{id}/renditions`, `GET /libraries/{id}/stream?rendition=watch&download=1`
(with `Authorization: Bearer`, never `?token=`), and `POST /me/listening/sync`. Downloads are
always the [watch rendition](../server/media.md#watch-renditions-medianewrenditioncache).
Preparing is polled in the foreground. Each ready file goes through the one background
`URLSession` (`Net/BackgroundDownloads.swift`), after a free-space check of the rendition's
bytes plus 200 MB. The server's encode runs under its own lifetime, whoever is polling:
`renditionsOfBook` queues every file under `baseCtx` (`FileCache.Queue`). So "Preparing on the
server" tells the listener the wrist can go down. The download itself waits for the app
(`DownloadManager.active`).

**Home on the watch** lists what is held, queued, preparing or downloading (`OnTheWaySection`) above
On this watch and Continue listening, so a sent book is in plain sight. A book shows once, because
Continue listening leaves out what On the way lists.

**Now Playing's figures** are both audio time and add up to the chapter (`Skips.figures`, the phone's
seek bar). Away from 1x, one more line gives the wall-clock time left in the phone's phrase
(`Skips.wallClockLine`, `formatTimeLeft`). At 1x that line is absent.

**Addresses.** The home rule is the [phone's](connect-and-addresses.md#the-pick-rule-srclibserver-addressts):
no token before the `server_id` probe. The pick is dropped on backgrounding and probed again while active.
The background upload goes to the away or paired address, never home
(`AddressPicker.unattended`), so a server with only a home address syncs in the foreground.

**Background sync.** Going to the background cuts the span. The watch hands the outbox's first
chunk to a background upload carrying `clock_offset`, not `sent_at`, and adds a best-effort app
refresh flush. Replays are safe (event ids are the idempotency keys). An answer that arrives on a
wake is applied like a foreground one, for the account it was sent for. In the foreground the
watch sends the outbox at launch, on the foreground, after each closed span, and every 60 s while
events wait. It never gates on `NWPathMonitor`, which was seen reporting `unsatisfied` while
`URLSession` worked. It tries, and a failure with no answer means offline.

**Signing out, or replacing the account,** is blocked while events wait unless the listener
discards them (`Core/AccountRules.swift`). Both delete the account's downloads and held books.

## Tests

```sh
npm run test:watch    # swift test on watch-core/; skips, and passes, without swift
```

`.github/workflows/watch.yml` runs it on a macOS runner when `targets/watch/**`, `watch-core/**`
or the script change, since the Linux `ci` job has no Swift toolchain. The Swift tests carry the
TS test vectors. They cover the timeline, spans, the outbox, acks and offers, addresses, message
decoding, the rendition plan, held books, the `remove` decision and `StatePublication`.

The phone's side is ordinary jest with the module mocked ([the list](testing.md#whats-covered-today)).

Neither proves anything about the shell. How to run the app on a simulator, including the
`DEBUG`-only launch variables (`AUDIOSILO_DEBUG_PAIR`, `_BOOK`, `_REMOVE`, `_PLAY`, compiled out
of release, with `scripts/watch-debug-pair.mjs` to mint a pair) is in `CONVENTIONS.md`. Reaching
any screen beyond Home needs a tap: `simctl` can't, `idb ui tap` can.

### What paired simulators can't do

**`transferUserInfo` does not reach the watch between paired simulators, and the phone can't
tell.** It was seen with Xcode 26.6, and with a bare control app, so it is the simulator and not
this code. With the watch simulator up, the transfer finishes at IDS level, so it leaves
`outstandingUserInfoTransfers` and the Downloads row reads "Delivered" within seconds, but the
watch never receives it. With the watch simulator shut down, it times out after about 30 s and the
row reads as failed. Don't take "Delivered" on a simulator as proof of anything.

`sendMessage` and `updateApplicationContext` do deliver, so a `pair` while the watch is reachable
and `watch-state` work on simulators. Every `book` and `remove`, and a `pair` sent to a watch that
isn't reachable, need a **real device**. `AUDIOSILO_DEBUG_BOOK` and `AUDIOSILO_DEBUG_REMOVE` stand
in on a simulator, entering at the same point a received message does.

The simulator may send the app to the background after about a minute without input and stop its
audio, so background playback needs a device too. On real hardware (TestFlight builds 28 and 29),
playing on after a crown press, the route picker and one-time speaker question with no headphones
connected, removing headphones pausing the book, a `book` sent with the app closed arriving (a few
minutes to "Delivered") and the watch reaching a LAN server have all been seen. Not run on a device
yet: a long stretch with the wrist down, a background upload with the app closed, and a run with
the phone off. Their sentences in the [User Guide](/users/listening/apple-watch) stay hedged until
they have been.

## The message contract

Every message carries `v: 1`. Both sides ignore unknown types and newer versions. The messages
are built and parsed in `src/watch/watch-model.ts` and `Core/PhoneMessages.swift`. A field
changed in one changes in the other, with tests on both. Messages are plain property lists only, for
example `addresses: {}`, never a null. The native side rejects the rest.

**`pair`, phone to watch** (`sendMessage` when reachable, else `transferUserInfo`):

```json
{"v": 1, "type": "pair", "server_id": "...", "server_name": "Home",
 "user_id": 1, "user_name": "sam", "base_url": "https://...", "server_url": "https://...",
 "addresses": {"home": "http://...", "away": "https://..."},
 "pairing_token": "...", "expires_at": "2026-11-05T12:00:00.000Z", "phone_name": "Sam's iPhone"}
```

The phone mints it with `POST /auth/pair {"ttl_seconds": 600}`. `expires_at` counts from before
the request, but the server truncates its own expiry to whole seconds, so this one can run under a
second later. It is only a hint; the watch's exchange is what decides. Past it the watch tries
nothing and asks to send again. Otherwise it exchanges at once
(`POST /auth/exchange {pairing_token, device_name}`), trying in this order:

1. `base_url`;
2. `away`;
3. the home http address, under
   [`pairingFallback`'s rule](connect-and-addresses.md#pairing-at-a-self-signed-servers-home-http).

A server's own answer at any address ends it, since the token is single use.

**`book`, phone to watch** (always `transferUserInfo`, which survives the watch app being closed):

```json
{"v": 1, "type": "book", "server_id": "...", "user_id": 1, "library_id": 1,
 "path": "Author/Book", "title": "Book", "author": "Author"}
```

**`watch-state`, watch to phone** (`updateApplicationContext`, the latest only):

```json
{"v": 1, "type": "watch-state", "signed_in": true, "server_id": "...", "user_id": 1,
 "app_version": "2.6.0", "unsent_events": 0, "couldnt_sync": 0,
 "last_sync_at": "2026-11-05T12:00:00Z",
 "books": [{"library_id": 1, "path": "Author/Book", "title": "Book",
            "state": "ready", "bytes": 12345}]}
```

`state` is `queued`, `preparing`, `downloading`, `ready` or `failed`. The phone reads a state a
newer watch app names as `queued`, and leaves out a book without its ids.

**When `watch-state` goes** (`Core/StatePublication.swift`, `Phone/PhoneLink.swift`). A launch owes
the phone the state whatever it says, so a reinstall or a sign-out corrects a phone holding an
older one. That waits for the first unlock, because before it nothing kept can be read. After the
launch, only a change is owed. A state counts as sent only once `updateApplicationContext` took it.
A refusal stays owed and goes again at activation, `becameActive`, a reachability or companion
change, or with the next changed state, never on a timer. Content identical to the session's last
context returns success and sends nothing (seen in the watchOS 26.5 framework), so that is no
error.

**`remove`, phone to watch** (always `transferUserInfo`):

```json
{"v": 1, "type": "remove", "server_id": "...", "user_id": 1, "library_id": 1, "path": "Author/Book"}
```

The watch handles it in its turn, behind any sign-in (`AppModel.receive`,
`HeldBooks.noteRemove`/`finishRemove`), and only for the account it is signed in to. It removes the
book by `downloads.remove`, the same path removing by hand takes, so `willRemove` stops a playing
book and its span closes. It also clears a held row. A refused `remove` changes nothing, so a held
book of that account still comes if it signs in. There is no reply; the phone reads the outcome
from `watch-state`. An old watch ignores the unknown type.

A `book` is held the moment it arrives, so a `remove`'s ticket keeps the two apart. The ticket
clears only the row the `remove` arrived after. Until the record has gone, that record settles no
row, so a book sent again right after a Remove stands.

**Order is the rule of `pair` then `book`.** The watch handles messages one at a time, in order,
so a `book` after its `pair` waits for that sign-in. `sendPair` answers only once the pair is ahead
of what follows. That is when the watch replied to `sendMessage`, or when the send fell back to
`transferUserInfo`, FIFO with the books. After 10 s with no reply it transfers too. A second copy is harmless, since the
token is single use and the watch ignores a failed sign-in again for an account it holds. A new
pair cancels an undelivered older one and moves the queued books behind itself. Two sends at once
for a connection share one pair (`setUpWatch`), and a book sent while a pair has over a minute
left follows it rather than minting another.

**A book's sends and Removes go one at a time**, in the order asked (`send.ts`, `inTurn`).
Otherwise a Remove tapped while a send waits for its pair would overtake that `book`. When
`sendPair` settles, it moves what is still queued behind itself, in their order.

**Who sees what** (`watch-model.ts`):

- **The card** shows for a paired watch and an account that can use one: not a kid's
  (403 `kid_account`) and not a demo's. Until the app is on the watch, the install line takes
  the place of its button.
- **The book action** needs the app installed and `watch` in the server's `renditions`. It never
  shows on an episode.
- **The Downloads section** needs the app installed and an account that can use one
  (`watchSectionVisible`).

The card keeps set-up, signed in as and what waits. The books are in Downloads, and both the card
and the Send to watch toast link there (`openDownloads`). The link uses `?watch=<connection id>`,
not `?connection=`, because `?connection=` scopes content and the Downloads page is every
server's. `&at=` tells one link from the next, so each scrolls to the section.

## The watch in Downloads

The watch only says what it holds now, and `transferUserInfo` answers nothing, so the phone keeps a
**ledger** (`src/watch/watch-ledger.ts`, `audiosilo.watchLedger` in AsyncStorage) by watch and then by
`<server_id>.<user_id>`, keyed `(library_id, path)`, never a DB id. The rules are pure, in
`src/watch/watch-rows.ts`, and `WatchSection` shows them.

- **The watch is named by `watch_id`**, a UUID in a file in `watchDirectoryURL`, which the system
  keeps for that watch and deletes with it (or with the app). So a row can't show for another watch
  or survive the app leaving this one. With no id there is no ledger, only what the watch lists.
- **`watch-state` wins over the ledger**, and is shown only for the account it names, since it has no
  account per book. Books the watch downloaded itself are listed too.
- **Delivered or not:** the native snapshot's `outstanding` holds the undelivered `book`s and
  `remove`s, never a `pair` (it holds a token). One the system reports failed stays listed (`failed`)
  for the run, or it would read as delivered.
- **A row is written when Send is tapped** (`handed_over: false`, so a kill mid-send can't read as
  delivered), put back if the send fails, and stops claiming progress after 7 days (`WATCH_HOLD_MS`,
  the watch's own hold limit), with Send again.
- **Once seen in `watch-state`, a book that leaves it is gone**, so the row goes: removed by hand on
  the watch, or the watch left that account.
- **Remove** says removing until `watch-state` drops the book, and that survives a restart. It
  never claims the removal finished while the message is outstanding.
  - A `remove` delivered while the watch says it is signed out or on another account reads as
    refused (`remove_refused`). The row explains and can be dismissed. This heals itself if it
    was only a sign-in still running.
  - Once the `remove` is delivered, the row offers Remove again through the same confirm
    (`rowActions`). The watch keeps a `remove` it has not yet handled only in memory, and a kill
    loses it. The repeat restarts the row's hold limit. It does nothing to a book already gone,
    but it can't tell a copy that came back on the watch since, so it stops and removes that
    one.

## Held books

A book the watch can't take yet is **held, not dropped**. `transferUserInfo` delivers in the
background and the phone has already said "Sent", so a book arriving during a sign-in, after a
failed one, on a too-old server or for another account is a normal case.
`Core/HeldBooks.swift` keeps it in `held-books.json`:

- It is written the moment it arrives, ahead of any sign-in still running, so a kill loses nothing.
- It is queued through the Download button's path once its account is ready **and** its server
  has said it serves the watch. `checkServer` releases them: sign-in sets `.ready` before it has
  asked, and a too-old server's 404 would read as a failed download.
- Its row goes only once a record not failed is safely in the download index.
- 20 books wait at most, for 7 days. One that ages out, goes over the cap, or whose account the
  listener refused (Keep this account) is given up on and kept 7 more days, so it is seen
  rather than lost silently. Sent again, it replaces its row and waits afresh.
- `forget` (from `forgetAccount`: a sign-out, a replace that succeeded) deletes all of that
  account's rows, so no titles of it stay. A blocked or failed sign-in changes nothing.
- `watch-state` has no account per book, so a row goes there (`queued`, then `failed`) only under
  its own account. The watch's own screens show all of them (`HeldBookRows`).

## One delegate on each side

`WCSession.default` has one delegate, and setting a second silently takes the first one's
messages away. So each side has exactly one, and **nothing else may set
`WCSession.default.delegate`**:

- **The watch:** `Phone/PhoneLink.swift`, activated at launch before anything else. Messages that
  arrive before `onMessage` is set wait for it. A wake for the phone's messages
  (`.backgroundTask(.watchConnectivity)`) stays up until they are delivered and handled, 20 s at
  most.
- **The phone:** `modules/audiosilo-watch/ios/WatchLink.swift`, activated by
  `AudiosiloWatchAppDelegateSubscriber` (`appDelegateSubscribers` in `expo-module.config.json`), not
  by editing the AppDelegate text. So `withCarPlay` stays untouched, and a CarPlay-first or
  background launch activates it too. Every session property means something only once activated,
  so reads and sends wait for it (`whenActivated`, 5 s at most, then "no watch").

The phone's cold-start copy of `watch-state` lives in `watchDirectoryURL`, the folder the system
keeps for this very watch, never in `UserDefaults`. In `UserDefaults`, a watch paired while the app
wasn't running would read the last one's sign-in.

JS reaches the module only through `src/watch/link.ios.ts`. `watchLink.supported` is read once at
load, so `useSendToWatch` and the card cost a platform without a watch nothing. Wear OS comes in
behind the same `WatchLink`.

## The release check

**Before submitting the first production IPA that holds the watch app, check that the watch's
`CFBundleVersion` matches the phone's** (apple-targets #147). The plugin sets the watch's
`CURRENT_PROJECT_VERSION` from `ios.buildNumber || 1`, and EAS ignores `ios.buildNumber` under
remote versioning, so don't commit a hard-coded `ios.buildNumber` to work around it. `app.json` does
commit `ios.appleTeamId`.

```sh
unzip -q AudioSilo.ipa -d /tmp/ipa
plutil -extract CFBundleVersion raw /tmp/ipa/Payload/AudioSilo.app/Info.plist
plutil -extract CFBundleVersion raw /tmp/ipa/Payload/AudioSilo.app/Watch/AudioSiloWatch.app/Info.plist
```

The two must print the same number. See [Releasing](../contributing/releasing.md#the-app-store-track-ios--android).
