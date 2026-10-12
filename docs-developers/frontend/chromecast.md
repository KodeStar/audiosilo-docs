---
title: Chromecast
description: "Casting in the player (src/cast/): a playback route behind the store's service indirection, cast tokens in the receiver's URLs, the native and web drivers, the Cast button, the withCast config plugin, the Android notification decision, and the known limits."
---

The player casts a book to a Chromecast or any Google Cast device (a TV with Cast
built in, a Nest speaker) through the **Default Media Receiver** (app id `CC1AD845`,
no Cast registration): it plays the book's files as they are. Native uses
`react-native-google-cast` (4.9.1, pinned exactly) over the Google Cast SDKs for iOS
and Android; the web uses Google's Cast Web Sender on Chromium. The server side is
capability `cast` and its cast tokens
([the reference](../server/api/reference.md#casting)).

## Casting is a playback route, not a second player

`createPlaybackService()` (both `service.native.ts` and `service.web.ts`) returns the
platform engine wrapped in `routed(...)`, a **`RoutedPlaybackService`**
(`src/cast/routed-service.ts`): the one `PlaybackService` the store ever gets. It
forwards every call to the route in use, the device's own engine or, while a Cast
session is connected, a **`CastPlaybackService`** (`src/cast/cast-service.ts`), and
forwards only that route's snapshots. So `store.ts`, `book-queue.ts` and
`progress-sync.ts` drive a cast exactly as they drive the phone and never know which
it is: saves, the resume floor, the stall watchdog and the chapter UI work
unchanged.

Switching routes is a pause on one side and a paused load on the other:

- **`beginCast`** (a session connected): pause the local engine, emit a `paused`
  snapshot at its place (the store saves it as any pause), unload the local engine,
  load the book on the receiver there at the same speed, and play it when the phone
  was playing. A book that can't be cast stays on the device, paused, and
  `onCastFailed` explains why and ends the session.
- **`endCast`** (the session ended): the receiver's last place (read once more while
  the session can still answer) comes back as a `paused` snapshot and is loaded into
  the local engine there. The device never starts playing by itself when a cast ends.

`CastPlaybackService` implements the engine contract over one session's
`CastRemote`. `load` sends the receiver a queue with **one item per track**, in the
store's track order, so a queue index is a track index: each item's `contentId` is
the stream URL, with its MIME type (`castContentType`), `streamDuration`,
`musicTrack` metadata and the book's cover, in an `audioBook` container, starting at
`(startIndex, startTime)` with the store's `playbackRate`. The receiver's status maps
back into the same per-track snapshot (`castTrackIndex`, `castState`; a `buffering`
while playing stays `playing`, so the watchdog never calls a normal LAN buffer a dead
stream). A move nobody here asked for (the TV remote, Google Home, the Cast
notification) is reported through `onRemoteMove`, as the native engines report the
lock screen's, so the store lowers its resume floor and saves.

`startCastSync()` (`src/cast/cast-session.ts`, started once by the root layout)
follows the driver's session events, switches the route and keeps the `useCast`
store (`supported`, `status`, `deviceName`) current. A session resumed with our media
playing while the app has no book loaded (it was killed or relaunched mid-cast) is
adopted the way the Android car adoption works (`adoptLoaded`, so the
[play rule](profiles.md#switching-and-the-play-rule) applies), then given the queue
the store built.

Guards that keep a route switch honest:

- **Stale work is dropped.** The router's switches (`beginCast`, the hand-back) and
  the session sync's event handling each carry a generation: a switch or event that a
  newer one overtook while it awaited does nothing when it resumes. A receiver status
  that arrives while a load of ours is in flight is not trusted as the book's place.
- **Foreign media** is told apart by stream identity (`streamIdentity` in
  `cast-media.ts`: the URL's route and its `path`/`transcode` parameters, ignoring the
  address, `token=` and `t=`), or by the book a receiver item names. Another sender's
  book, or another app's media on the same receiver, is never paused, seeked, re-rated
  or stopped by us; ours waits, paused, and the next play loads it back.
- **An early end of a transcoded stream** (`isEarlyTranscodeEnd`: the receiver says
  `finished` well before the file's end, a stream the server or a proxy closed) is not
  the book's end: seen playing just now, the queue is loaded again there and plays on;
  seen long ago, the book comes back paused there and the next play reloads it.
- **The car wins.** A CarPlay or Android Auto play request while a book is on a
  receiver ends the cast first (`endCastForCar`: the receiver's place is read, the book
  comes back paused there, then the session ends), so the car's play starts on this
  device, never on the TV.

## The receiver never gets the session token

`prepareCast` (`src/cast/cast-prepare.ts`) builds the receiver's queue:

- It resolves the book's client (`resolveClient`) and its capabilities: no `cast`, no
  casting.
- The URLs are built on the connection's **address in use now** (`client.baseUrl`,
  the `effectiveUrl`: the home address when it was picked), by a second `ApiClient`
  constructed with a **cast token** in place of the session token, so the existing
  `streamUrl` / `coverUrl` builders put the cast token in the `?token=`. A downloaded
  book casts from its server too: the receiver can't read this device's files.
- `castTokens` (`cast-token.ts`) mints a token with `client.castToken(libraryId,
  path)` and reuses it for that book until an hour before it expires
  (`CAST_TOKEN_MARGIN_MS`): a receiver still fetches later files and seeks with it.
  Concurrent asks share one request. In memory only, never persisted; a removed
  connection's tokens are dropped (`onConnectionRemoved`). What a cast token may read
  and how long it lives are the server's rules:
  [Cast tokens](../server/auth-and-security.md#cast-tokens).

The pure rules are `cast-media.ts`:

- **`castBlockReason`** - why a book can't be cast: `unsupported` (no `cast` flag),
  `local-address` (the address is this device: `localhost`, `*.localhost`, the
  loopback range, `::1`, `0.0.0.0`; `isReachableByReceiver`), `codec` (it needs the
  transcoder and the server has none), `no-connection` (its server isn't signed in).
  The Cast button and the cast engine share it.
- **`castNeedsTranscode`** - the server's `direct_playable: false`, or a codec the
  Default Media Receiver doesn't play (`CAST_UNPLAYABLE_CODECS`: ALAC, the AC-3
  family, DTS, TrueHD, WMA, AMR). Such a book casts with `?transcode=1` when the
  server has `transcode`. A transcoded stream can't be seeked by the receiver, so a
  start or seek inside one asks for the stream from that point (`&t=`,
  `itemStartingAt`). A full transcoder (`503`) makes the receiver report an error,
  which reaches the store as the engine's `error` state (the player's Retry).

The web player's Remote Playback prompt (`el.remote.prompt()`) was **removed** for
this reason: it hands the receiver the element's own URL, which carries the session
token. The web's route picker is now Safari's AirPlay only: `service.web.ts`'s
`canShowRoutePicker` / `showRoutePicker` answer only where the element has
`webkitShowPlaybackTargetPicker` (`hasAirPlayPicker`), and the output pill beside the Cast button is labelled "Audio output" on every platform
(AirPlay on iOS and Safari, the media output panel on Android).

## The drivers

`castDriver` (`driver.native.ts`, `driver.web.ts`, behind the `CastDriver` type)
reports the session's life (`starting`, `started`, `resumed`, `startFailed`,
`suspended`, `ending`, `ended`) and gives a connected session's `CastRemote`.

- **Native**: discovery, the device chooser and the session are the SDK's.
  `supported()` is false when this binary has no Cast module (a store build older
  than the JS bundle: nothing touches the library then) or, on Android, when Google
  Play services isn't available. Status comes from the `RemoteMediaClient` events,
  with reads bounded to 1.5 s (an Android getter can hang).
- **Web**: Google's Cast Web Sender (`cast_sender.js?loadCastFramework=1` from
  `https://www.gstatic.com`), only on Chromium on an **https** page
  (`webCastSupported`: a secure context, `location.protocol` `https:`, and a
  Chromium brand; never Safari, Firefox or any iOS browser). A secure context alone
  is not enough: on `http://localhost` the sender loads its framework from
  scheme-relative URLs that become `http://`, which the CSP refuses (and a receiver
  couldn't reach a localhost server anyway). It is loaded **lazily** the first time
  the Cast button shows for a book it can cast (`ensureCastReady`, 15 s timeout),
  never at startup and never for a button that can only explain a blocked book; a
  failed load is kept for the page rather than retried. **One tab owns a session**: the
  sender joins any session this origin has (so a reload mid-cast finds it again), but
  only the tab that started it follows it (a mark in that tab's `sessionStorage`); any
  other tab leaves the session it was joined to without stopping the receiver, so two
  tabs never drive one receiver. The server's web CSP admits
  the sender's three scripts by path in `script-src`
  ([Web UI](../server/web-ui.md#per-document-csp-htmlcsp)).

## The Cast button

`CastButton` (`cast-button.native.tsx`, `cast-button.web.tsx`; the rule is the pure
`castButtonModel`, read through `useCastButton`) sits in the full player's action row
and in the docked player (only when the dock has room for all its actions,
`dockLayout`'s `allActions`). It shows only while a book is loaded, on a device that can cast, and when
the playing book's server has `cast` (an older server, or flags not known yet: no
button); while a session is connected it shows whatever the book, so a cast can
always be stopped. Native renders the SDK's own `CastButton` in a 44 pt frame; the
web draws our own, which opens Chrome's Cast chooser. When `castBlockReason` blocks
the book, the button explains why instead (a toast) rather than casting. Strings are
in the `cast` namespace.

## What doesn't apply while casting

- **Smart speed, Voice boost and auto-rewind**: `configure` keeps the config but the
  receiver plays plain audio (they are the device engine's).
- **Volume**: `setVolume` is a no-op. Its only caller is the sleep timer's fade, and
  the receiver's volume is the TV's own, which a fade and its restore must never
  touch. The sleep timer still **pauses** the cast (the sender drives it).
- Skip lengths are the store's own and work as usual.

## Native configuration (`plugins/withCast.js`)

The library's own Expo config plugin with the app's options, plus one Android
addition. Listed in `app.json` **before** `./plugins/withCarPlay`: mods of one kind
run in reverse registration order, so withCarPlay's exact match still sees Expo's
AppDelegate template and the Cast edits land after it (`withCast.test.ts` runs both,
in that order, over the SDK 56 AppDelegate fixture).

- `receiverAppId: 'CC1AD845'`, `expandedController: false` (the app's own full
  player is the controller).
- **iOS**: discovery starts on the first tap of the Cast button
  (`iosStartDiscoveryAfterFirstTapOnCastButton`), so the local network prompt comes
  when the listener asks to cast; sessions are suspended in the background
  (`iosSuspendSessionsWhenBackgrounded`). `NSLocalNetworkUsageDescription` in
  `app.json` names both uses: "AudioSilo uses your local network to reach your
  AudioSilo server and to find Cast devices to play on." (localised in
  `assets/locales`).
- **Android**: `play-services-cast-framework` is **pinned** (`22.3.1`; the library's
  default is `+`, a build that changes under us), and the library's expanded
  controller activity is declared here (not exported), because the Cast notification
  opens it and the plugin declares it only with `expandedController`, which would also
  turn on iOS's automatic expanded controls.

### The Android notification

While a book casts, the app's Media3 engine is unloaded, so the **Cast SDK's own
media notification and media session** are the lock screen's and the notification
shade's controls for the cast (previous/next step by file, the receiver's queue).
Its foreground service also keeps the app alive, so the receiver's place keeps being
saved.

### iOS in the background

iOS suspends an app that plays no audio itself, and the device's engine is unloaded
while casting (a silent keep-alive wouldn't pass App Review). The TV keeps playing;
the app saves the receiver's place as it leaves the foreground (`checkpoint`), and
reads where the TV got to when it comes back (`refresh`).

## Known limits

- **Not yet tested on a real Cast device.** Every rule above is unit-tested, but
  discovery, a session, seeks, the Android notification, the iOS background
  behaviour and the web sender have not been run against a Cast device.
- iOS: the sender is suspended in the background (above), and there are no iOS
  lock-screen controls for a cast.
- The receiver shows no chapter list.
- The native SDK (v4) has no "jump to item": moving to another file reloads the queue
  from there.
- The docked player shows the Cast button only when it is wide enough for all its
  actions; the full player always has it.

## Testing

`cast-media.test.ts` (the pure rules), `cast-token.test.ts`, `cast-prepare.test.ts`,
`cast-service.test.ts`, `routed-service.test.ts`, `cast-session.test.ts`,
`cast-store.test.ts`, `cast-button-model.test.ts`, `cast-button.test.tsx`,
`driver.native.test.ts`, `sdk-shapes.test.ts` and `web-sender.test.ts` in `src/cast/`;
`plugins/withCast.test.ts` for the config plugin. A device pass with a Cast device
is still owed (above).
