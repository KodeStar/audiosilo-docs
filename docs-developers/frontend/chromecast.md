---
title: Chromecast
description: "Casting in the player (src/cast/): a playback route behind the store's service indirection, cast tokens in the receiver's URLs, the native and web drivers, the Cast button, the withCast config plugin, the Android notification decision, and the known limits."
---

The player casts a book to a Chromecast or any Google Cast device, such as a TV with
Cast built in or a Nest speaker. It uses the **Default Media Receiver** (app id
`CC1AD845`, no Cast registration), which plays the book's files as they are.

- Native uses `react-native-google-cast` (4.9.1, pinned exactly) over the Google Cast
  SDKs for iOS and Android.
- The web uses Google's Cast Web Sender on Chromium.

The server side is capability `cast` and its cast tokens (see
[Casting in the API reference](../server/api/reference.md#casting)).

## Casting is a playback route, not a second player

`createPlaybackService()` (in both `service.native.ts` and `service.web.ts`) returns the
platform engine wrapped in `routed(...)`. The result is a **`RoutedPlaybackService`**
(`src/cast/routed-service.ts`), the one `PlaybackService` the store ever gets. It
forwards every call to the route in use, and forwards only that route's snapshots. The
route is the device's own engine or, while a Cast session is connected, a
**`CastPlaybackService`** (`src/cast/cast-service.ts`).

So `book-queue.ts` and `progress-sync.ts` drive a cast exactly as they drive the phone.
`store.ts` nearly does too: saves, the resume floor, the stall watchdog and the chapter
UI work unchanged. The store asks about the route in one place, the download hot-swap
(`switchCurrentBookToLocal`). It checks `isCasting()`, and while casting it only hands
the route the phone's local copy (`rememberLoad`) instead of reloading, since the
receiver streams from the server whatever the phone holds. It hands it over, and
commits the copy's queue, only when the download holds the receiver's files in the
receiver's order, because the receiver's track indices are read through the store's
queue. Any other copy changes nothing, and the next start uses it. While a session
is handed back to the phone, the route's own `swapTo` refuses such a copy too, as it
refuses a copy of a book no longer loaded. `adoptLoaded` also hands the route the
adopted book's queue (`rememberLoad`). `isCasting` and `rememberLoad` are
optional `PlaybackService` members that only the route switch implements.

Switching routes is a pause on one side and a paused load on the other:

- **`beginCast`** runs when a session connects. It pauses the local engine and emits a
  `paused` snapshot at its place, which the store saves as any pause. It then unloads
  the local engine, loads the book on the receiver at that place and the same speed,
  and plays it when the phone was playing. A book that can't be cast stays on the
  device, paused, and `onCastFailed` explains why and ends the session. The phone
  then loads the copy the route last remembered for that book, so a download that
  landed while the receiver was asked plays from the device. A start the receiver
  refuses mid-session (`load`) does the same.
- **`endCast`** runs when the session ends. It reads the receiver's last place once more
  while the session can still answer. That place comes back as a `paused` snapshot and
  is loaded into the local engine there. The device never starts playing by itself
  when a cast ends.

`CastPlaybackService` implements the engine contract over one session's
`CastRemote`. `load` sends the receiver a queue with **one item per track**, in the
store's track order, so a queue index is a track index. Each item has:

- the stream URL as its `contentId`, with its MIME type (`castContentType`),
- `streamDuration`,
- `musicTrack` metadata and the book's cover.

The queue goes in an `audioBook` container, starting at `(startIndex, startTime)` with
the store's `playbackRate`.

The receiver's status maps back into the same per-track snapshot (`castTrackIndex`,
`castState`). A `buffering` while playing stays `playing`, so the watchdog never calls a
normal LAN buffer a dead stream. A move that nobody here asked for, from the TV remote,
Google Home or the Cast notification, is reported through `onRemoteMove`. The native
engines report the lock screen's moves the same way, so the store lowers its resume
floor and saves, in the same order as the native engines (see
[Native bridge](playback.md#native-bridge-servicenativets)). The route passes the local engine's
`onLanded` on only while it plays locally.

`startCastSync()` (`src/cast/cast-session.ts`) starts once from the root layout. It
follows the driver's session events, switches the route and keeps the `useCast` store
(`supported`, `status`, `deviceName`) current.

On native, a session can resume with our media playing while the app has no book
loaded, because the app was killed or relaunched mid-cast. The session sync adopts that
session the way the Android car adoption works (`adoptLoaded`, so the
[play rule](profiles.md#switching-and-the-play-rule) applies), then gives it the queue
the store built.

These guards keep a route switch correct:

- **Stale work is dropped.** The router's switches (`beginCast`, the hand-back) and
  the session sync's event handling each carry a generation. A switch or event that a
  newer one overtook while it awaited does nothing when it resumes. A receiver status
  that arrives while a load of ours is in flight is not trusted as the book's place.
- **Foreign media is left alone.** The route tells our media apart by stream identity
  or by the book a receiver item names. `streamIdentity` in `cast-media.ts` compares the
  URL's route and its `path` and `transcode` parameters, ignoring the address, `token=`
  and `t=`. The cast route's controls never pause, seek, re-rate or stop another
  sender's book, or another app's media on the same receiver. Ours waits, paused, and
  the next play loads it back. Ending the session is not guarded. A car play
  (`endCastForCar`) and a book that can't be cast (`onCastFailed`) end it with
  `endSession(true)`, which stops whatever the receiver plays, another sender's book
  included.
- **An early end of the last file is not the book's end.** `isEarlyTranscodeEnd` is the
  web engine's rule. It applies when the receiver says the last file `finished` well
  before its end, from a transcoded stream that the server or a proxy closed, or a
  dropped direct one. If the book was seen playing just now, the queue is loaded again
  there and plays on. If it was seen long ago, the book comes back paused there and the
  next play reloads it. A stream that ends again without real progress past the reload
  is the end after all. On an earlier file, a `finished` is the receiver moving on to
  the next item, so an early end there is not caught and the rest of that file is
  skipped.
- **The car wins.** A CarPlay or Android Auto play request while a book is on a
  receiver ends the cast first (`endCastForCar`). It reads the receiver's place, brings
  the book back paused there, then ends the session. So the car's play starts on this
  device, never on the TV.

## The receiver never gets the session token

`prepareCast` (`src/cast/cast-prepare.ts`) builds the receiver's queue:

- It resolves the book's client (`resolveClient`) and its capabilities. Without `cast`
  there is no casting.
- It builds the URLs on the connection's **address in use now** (`client.baseUrl`, the
  `effectiveUrl`), which is the home address when that was picked. A second `ApiClient`
  builds them, constructed with a **cast token** in place of the session token, so the
  existing `streamUrl` and `coverUrl` builders put the cast token in the `?token=`. A
  downloaded book casts from its server too, because the receiver can't read this
  device's files.
- `castTokens` (`cast-token.ts`) mints a token with `client.castToken(libraryId,
  path)`. It reuses the token for that book until an hour before it expires
  (`CAST_TOKEN_MARGIN_MS`), because a receiver still fetches later files and seeks with
  it. Concurrent asks share one request. Tokens live in memory only and are never
  persisted, and a removed connection's tokens are dropped (`onConnectionRemoved`). What
  a cast token may read and how long it lives are the server's rules (see
  [Cast tokens](../server/auth-and-security.md#cast-tokens)).
- When the receiver refuses its token, `prepareCast(..., { freshToken })` mints a
  new one to replace the cached one (see
  [A receiver refused its token](#a-receiver-refused-its-token)).

The pure rules are `cast-media.ts`:

- **`castBlockReason`** says why a book can't be cast. The Cast button and the cast
  engine share it.

  | Reason | When |
  |---|---|
  | `unsupported` | The server has no `cast` flag. |
  | `local-address` | The address is this device: `localhost`, `*.localhost`, the loopback range, `::1`, `0.0.0.0` (`isReachableByReceiver`). |
  | `codec` | The book needs the transcoder and the server has none. |
  | `no-connection` | The book's server isn't signed in. |
  | `episode` | A podcast episode, which never casts. |
  | `proxy` | The address in use is the origin of the connection's [proxy headers](state-and-data.md#proxy-headers) (`behindProxy`). The receiver fetches by itself and can't send them, so the proxy would turn it away. |

- **`castNeedsTranscode`** is true for the server's `direct_playable: false`, or for a
  codec the Default Media Receiver doesn't play (`CAST_UNPLAYABLE_CODECS`: ALAC, the
  AC-3 family, DTS, TrueHD, WMA, AMR). Such a book casts with `?transcode=1` when the
  server has `transcode`. The receiver can't seek a transcoded stream, so a start or
  seek inside one asks for the stream from that point (`&t=`, `itemStartingAt`). A full
  transcoder (`503`) makes the receiver report an error. That reaches the store as the
  engine's `error` state, which shows the player's Retry.

The web player's Remote Playback prompt (`el.remote.prompt()`) was **removed** for this
reason. It hands the receiver the element's own URL, which carries the session token.

The web's route picker is now Safari's AirPlay only. `service.web.ts`'s
`canShowRoutePicker` and `showRoutePicker` answer only where the element has
`webkitShowPlaybackTargetPicker` (`hasAirPlayPicker`). The output pill beside the Cast
button is labelled "Audio output" on every platform. It opens AirPlay on iOS and
Safari, and the media output panel on Android.

### A receiver refused its token

The server keeps a bounded number of cast tokens per sending device and ends the
least recently used one, which a receiver may still be playing with (see
[Cast tokens](../server/auth-and-security.md#cast-tokens)). So
`CastPlaybackService` treats a refusal as a reason to mint once more:

- **A load the receiver refuses** is sent once more with a new token (`freshToken`).
  An error while a load of ours is in flight counts as a refusal
  (`ReceiverRefused`), and the load is sent again at the same place.
- **A later file playing first is a refusal too.** When the receiver plays or
  pauses a later file than the one asked for before it ever played or paused the
  asked file (`skippedPast`), it was refused that file and skipped on, perhaps to
  a file in its cache. Its errors need not reach the phone, as on Android. That
  counts while the load is in flight, or within `ASKED_MOVE_MS` of the move once
  the load answered, since later a file the receiver played unseen may have run
  on into the next. A buffering or loading status does not count: a new media
  session's first status can still name the media it replaces, and the native
  SDK's status carries no session id to tell them apart. So a move with a valid
  token mints nothing. Nor does the file the receiver was on when the move was
  asked count, at or past where it was then (`Intent.from`), since that is the
  replaced media playing on.
- **The asked place is held.** A queue sent puts the snapshot at the place it
  asks for at once, as a local engine's file load does. Until the receiver plays
  or pauses there (`landInFlight`), for at most `ASKED_MOVE_MS` after the move
  (`holdingAsked`), no status or tick moves the snapshot. Those statuses are the
  media the queue replaces (its `interrupted` stop at its file's start, or a
  later file), and the replaced media never becomes the book's place. Otherwise
  the store would save that place, end the listening span the move began there,
  raise its resume floor past the asked place so that every save below it is
  refused, or read a later file as the engine running off the asked one.
- **A receiver that stops on an error mid-book** is loaded again with a new token,
  playing on when it was. This happens only as the error arrives; an error already
  shown is the listener's to retry, since the receiver repeats it on every status
  read.
- **The reload goes where the phone meant the receiver to be.** The Default Media
  Receiver skips a refused queue item and tries the next, so its error names the
  last file it tried. The service keeps `intended`: the place its own load, seek or
  file jump asked for, or the next file's start once one ended, until the receiver
  plays or pauses there. The reload goes there (`refusedPlace`). When the error comes
  `ASKED_MOVE_MS` (8 s) or more after the move, it goes to where the receiver was
  last seen in that file, if that is further on. In that case, a receiver that
  settled on another file meanwhile is followed instead: the reload goes to the
  error's own file.
- **Stale statuses are hidden for a bounded time.** While the queue is sent again,
  the files the receiver skips on to are not the book's place, for at most
  `ASKED_MOVE_MS` after the error, so a load never answered hides nothing for good.
  An error of the queue the new one replaces is ignored: one naming a URL with the
  token from before the mint, or a status read begun before the new queue was sent.
- **A book load refused to the end still stands**, at the place it asked for until
  a status says where, because the receiver holds the book and a failed load would
  hand it back to the phone while the receiver plays on. A seek, file jump or play
  refused that way fails.
- **Mints are capped.** Within `REMINT_EVERY_MS` (a minute) of a book's last mint,
  another comes only when the receiver has played with the last token at the
  intended place, and never a third. A token that never played gets one more mint
  a minute after it was minted. The count is kept across loads and resets, and
  another book may mint at once. So a failure with another cause never mints on
  every try, since each mint can end another receiver's token. A queue refused
  while a mint is on its way waits on that mint and is sent again after it.

**Play or pause after a reload** follows `playIntent`, the latest settled word
from either side: this phone's `play`, or its `pause` or `load` (sent paused), or
the receiver's own `playing`, `paused` or stop (the TV remote, Google Home) or the
book's end, read when no load of ours is in flight. A session it did not load
starts from the play state it was taken over in (`adoptQueue`). A queue sent again
after a refusal, a seek or a skip plays by it, since the receiver reads `buffering`
or `loading` while it takes one. A queue goes out by the play intent as it is when
it is sent, since a play or pause may come while a token is minted. A play or
pause given while the queue is on its way reaches the media it replaces, so it is
sent again once the receiver has taken the queue.

## The drivers

`castDriver` (`driver.native.ts`, `driver.web.ts`, behind the `CastDriver` type)
reports the session's life (`starting`, `started`, `resumed`, `startFailed`,
`suspended`, `ending`, `ended`) and gives a connected session's `CastRemote`.

### Native

Discovery, the device chooser and the session are the SDK's. `supported()` is false
in two cases:

- This binary has no Cast module, as in a store build older than the JS bundle. Nothing
  touches the library then.
- On Android, Google Play services isn't available.

Status comes from the `RemoteMediaClient` events, with reads bounded to 1.5 s, because
an Android getter can hang.

The load request (`nativeLoadRequest`, `sdk-shapes.ts`) carries the place twice: in
the queue data (`startIndex`, `startTime`) and as a top-level `startTime`, as the web
sender's request does (`currentTime`). A receiver given the place only in the queue
data started a queue sent paused at 0:00. The top-level `startTime` is what makes a
paused recast start where it was asked.

### Web

The web driver uses Google's Cast Web Sender (`cast_sender.js?loadCastFramework=1` from
`https://www.gstatic.com`). It runs only on Chromium on an **https** page.
`webCastSupported` checks for a secure context, `location.protocol` `https:`, and a
Chromium brand, so it is never Safari, Firefox or any iOS browser. A secure context
alone is not enough. On `http://localhost` the sender loads its framework from
scheme-relative URLs that become `http://`, which the CSP refuses, and a receiver
couldn't reach a localhost server anyway.

The sender is loaded **lazily** (`ensureCastReady`, 15 s timeout), the first time the
Cast button shows for a book it can cast. It never loads at startup, and never for a
button that can only explain a blocked book. A failed load is kept for the page rather
than retried.

**One tab owns a session.** Once loaded, the sender joins any session this origin has,
but only the tab that started it follows it, marked in that tab's `sessionStorage`.
Any other tab leaves the session it was joined to without stopping the receiver, so two
tabs never drive one receiver.

Since the sender loads only when the Cast button shows for a loaded book, a reload
mid-cast doesn't pick the cast up by itself. Nothing is joined until the listener
starts a book. That book is then handed to the receiver at its own place, replacing what
the receiver played; the web never adopts the receiver's book.

The server's web CSP admits the sender's three scripts by path in `script-src` (see
[Web UI](../server/web-ui.md#per-document-csp-htmlcsp)).

## The Cast button

`CastButton` (`cast-button.native.tsx`, `cast-button.web.tsx`) sits in the full
player's action row. It is in the docked player too, but only when the dock has room for
all its actions (`dockLayout`'s `allActions`). Its rule is the pure `castButtonModel`,
read through `useCastButton`.

The button shows only when all of these hold:

- a book is loaded;
- the device can cast;
- the playing book's server has `cast`, so an older server or flags not known yet
  mean no button;
- the device has a network (`online`, from `useDeviceOnline`), since offline no Cast
  device can be found (the SDK's button would show an empty pill).

While a session is connected it shows whatever the book and the network, so a cast can
always be stopped.

The button is not offered for a podcast episode (`episode` in the model, from
`NowPlaying.episode`). A cast token never covers podcasts, and the server answers
`403 not_a_book` to `POST /cast/token` for one. An episode started while a book is cast
is refused before any token is asked. `prepareCast` blocks it as `episode` when its item
says so (`book.episode`) or its library is a podcast library (`cachedPodcastLibrary`),
and reads a `not_a_book` refusal of the token the same way. The cast session then ends
and a toast says "This episode can't be cast" ("Podcast episodes can't be cast yet, so
this one stays on this device.").

Native renders the SDK's own `CastButton` in a 44 pt frame. The web draws our own,
which opens Chrome's Cast chooser.

**Native hides the pill while the SDK's button draws nothing** (`sdkButtonDraws` in
`cast-button-model.ts`, read by `useSdkButtonDraws`). The SDK hides its button while
no Cast device is found (`noDevicesAvailable`), which left an empty pill on a network
with no Chromecast. On iOS the button still draws before discovery has run, since
discovery starts on its first tap, so there the pill hides only while discovery runs
(`getDiscoveryManager().isRunning()`, asked again every 2 s while it has not started).
A cast state not read yet, or a read that fails, draws the button as before. A book
that can't be cast keeps our own button, which says why. When `castBlockReason` blocks the book, the button
explains why in a toast rather than casting. Strings are in the `cast` namespace.

## What doesn't apply while casting

- **Smart speed, Voice boost and auto-rewind**: `configure` keeps the config, but the
  receiver plays plain audio. These effects belong to the device engine.
- **Volume**: `setVolume` is a no-op. Its only caller is the sleep timer's fade, and
  the receiver's volume is the TV's own, which a fade and its restore must never
  touch. The sleep timer still **pauses** the cast (the sender drives it).
- Skip lengths are the store's own and work as usual.

## Native configuration (`plugins/withCast.js`)

This is the library's own Expo config plugin with the app's options, plus one Android
addition. It is listed in `app.json` **before** `./plugins/withCarPlay`. Mods of one
kind run in reverse registration order, so withCarPlay's exact match still sees Expo's
AppDelegate template and the Cast edits land after it. `withCast.test.ts` runs both, in
that order, over the SDK 58 AppDelegate fixture.

- `receiverAppId: 'CC1AD845'`, `expandedController: false` (the app's own full
  player is the controller).
- **iOS**: discovery starts on the first tap of the Cast button
  (`iosStartDiscoveryAfterFirstTapOnCastButton`), so the local network prompt comes
  when the listener asks to cast. Sessions are suspended in the background
  (`iosSuspendSessionsWhenBackgrounded`). `NSLocalNetworkUsageDescription` in
  `app.json` names both uses: "AudioSilo uses your local network to reach your
  AudioSilo server and to find Cast devices to play on." It is localised in
  `assets/locales`.
- **Android**: `play-services-cast-framework` is **pinned** to `22.3.1`. The library's
  default is `+`, a build that changes under us. The library's expanded controller
  activity is declared here, not exported, because the Cast notification opens it. The
  plugin declares it only with `expandedController`, which would also turn on iOS's
  automatic expanded controls.

### The Android notification

While a book casts, the app's Media3 engine is unloaded. The **Cast SDK's own media
notification and media session** are then the lock screen's and the notification
shade's controls for the cast:

- For a book in several files, the receiver's queue has more than one item, and
  previous and next step by file.
- A one-file book gets rewind and forward instead. The library's
  `GoogleCastOptionsProvider` shows the skip actions only when
  `getQueueItemCount() > 1`.

The SDK's foreground service also keeps the app alive, so the app keeps saving the
receiver's place.

### iOS in the background

iOS suspends an app that plays no audio itself, and the device's engine is unloaded
while casting. A silent keep-alive wouldn't pass App Review. The TV keeps playing. The
app saves the receiver's place as it leaves the foreground (`checkpoint`), and reads
where the TV got to when it comes back (`refresh`).

## Known limits

- **Tested on one real Cast setup only.** Every rule above is unit-tested. Only an
  Android phone (a Pixel 6a) casting to a Default Media Receiver has been run
  against a real Cast device, and that run showed how the receiver skips a refused
  queue item. The iOS sender, its background behaviour and the web sender have not
  been run against one.
- iOS: the sender is suspended in the background (above), and there are no iOS
  lock-screen controls for a cast.
- The receiver shows no chapter list.
- The native SDK (v4) has no "jump to item": moving to another file reloads the queue
  from there.
- The docked player shows the Cast button only when it is wide enough for all its
  actions; the full player always has it.

## Testing

The tests in `src/cast/` are `cast-media.test.ts` (the pure rules),
`cast-token.test.ts`, `cast-prepare.test.ts`, `cast-service.test.ts`,
`routed-service.test.ts`, `cast-session.test.ts`, `cast-store.test.ts`,
`cast-button-model.test.ts`, `cast-button.test.tsx`, `driver.native.test.ts`,
`driver.web.test.ts` (one tab owns a session), `sdk-shapes.test.ts` and
`web-sender.test.ts`. `plugins/withCast.test.ts` covers the config plugin. A pass with a
real Cast device is still owed (see [Known limits](#known-limits)).
