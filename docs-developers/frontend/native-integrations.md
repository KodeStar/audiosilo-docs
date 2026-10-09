---
title: Native integrations
description: "CarPlay and Android Auto (the car snapshot, the Android MediaLibraryService and headless JS, the iOS UIScene move and CarPlay templates), the keychain move for a locked phone, and the iOS widgets and sleep timer Live Activity."
---

The surfaces outside the app's own window: the car (Android Auto and CarPlay), the iOS
home screen widget and the sleep timer Live Activity. They all sit on the same native module
as playback ([Playback](playback.md#the-native-module-modulesaudiosilo-player)) and on
shared JS controllers; none of them adds a wire change. The audio effects the car also
applies are in [Smart Speed and Voice Boost](audio-effects.md); how to run each of these on a
device, the DHU or the Simulator is under [Testing](testing.md#native-checks).

| Piece | Where |
|---|---|
| Car snapshot, play requests, car bookmarks, adopting | `src/car/` (`car-model.ts`, `car-artwork.ts`, `car-controller.ts`, `car-connection.ts`, `car-native*.ts`, `car-task.ts`, `register-car-task*.ts`) |
| JS entry (registers the headless task) | `index.ts` (`package.json` `main`), then `expo-router/entry` |
| Launch steps shared by the root layout and the car task | `src/lib/bootstrap.ts` (`bootstrapPlayback`) |
| Android Auto | `modules/audiosilo-player/android/.../AudiosiloPlayerService.kt`, `LibraryCallback.kt`, `CarBrowseTree.kt`, `CarSnapshot.kt`, `ArtworkProvider.kt`, `JsRuntime.kt`, `PlayerBridge.kt`, `PendingBookmarks.kt`, `CarConnectionMonitor.kt`, `ResumptionReceiver.kt`, `MediaItems.kt` |
| CarPlay and the scene move | `plugins/withCarPlay.js`; `modules/audiosilo-player/ios/AudiosiloScenes.swift`, `AudiosiloPhoneSceneDelegate.swift`, `AudiosiloCarPlaySceneDelegate.swift`, `AudiosiloCarSnapshot.swift`, `AudioEngine+CarPlay.swift` |
| Tokens readable on a locked iPhone | `src/lib/secure-store.ts` |
| Widgets and the Live Activity (iOS) | `src/widgets/`, `expo-widgets`, `plugins/withWidgetsNoPush.js`, `plugins/withXcode26SwiftUICoreFix.js`; their links open through `src/app/+native-intent.tsx` |

Not built (deliberately, for now): a phone "car mode", Siri / App Intents, interactive
widgets, an Android widget, search or voice in the car (Android Auto shows no search button:
the session doesn't grant `COMMAND_CODE_LIBRARY_SEARCH` or `..._GET_SEARCH_RESULT`), a
server-computed silence map, and Smart Speed on iOS
([why](audio-effects.md#why-smart-speed-isnt-on-iphone-yet)).

## The car snapshot (`src/car/`)

Native has no strings, no session and no server, so **JS decides what the car lists** and
hands it over as one JSON document, the car snapshot, through the module's
`setCarSnapshot(json)`. Native keeps the last one on disk (Android: `filesDir`, written
atomically; iOS: Application Support with `completeUntilFirstUserAuthentication`
protection), so a car shows its lists at once, before or without JS.

`car-model.ts` builds it, pure (`buildCarSnapshot`):

- `version: 1`, `generatedAt`, `signedIn`, the localized `labels` (`carLabels(t)`, the
  `car.*` keys: the four tab titles, `chapters`, `bookmark`, `bookmarkSaved`, `empty`,
  `signedOut`, `unavailable`) and up to four `tabs`:
  - `continue` - Home's rule (`isInProgress`, newest first, every signed-in server), the
    loaded book first (`continueRefs`), at most 20;
  - `upnext` - the default connection's queue (`queue` capability), at most 20;
  - `downloads` - every downloaded book, newest download first, at most 50;
  - `library` - the selected library (`useLibrarySelection`, else the default connection's
    first), `sort: 'recent'`, at most 50 (`CAR_TAB_LIMITS`; Android Auto doesn't page, and
    CarPlay trims further to its own `maximumItemCount`).
- Each `CarItem` has an `id` (`carItemId(ref)`: `book:` plus the URI-encoded connection id,
  library id and path joined by `:`; path is the identity, scoped by connection, never a
  database id; `parseCarItemId` reverses it), `title`, `subtitle` (the author, then the time
  left at the book's own speed once started), `progress` (0..1 or null), `finished`,
  `downloaded`, `artwork` and, **only for a downloaded book**, a `play` spec.
- `playSpec(...)`: what Android needs to start a downloaded book with no JS: the `BookRef`,
  the tracks as `file://` URLs **with no headers**, the chapter clips (`buildChapterClips`),
  the start index and position (the resume lookup, read the way `playBook` reads it: a
  finished book starts at 0, its saved speed wins over the default) and the rate. No session
  token is ever written outside expo-secure-store for the car.
- **Covers** (`car-artwork.ts`) are files the app wrote, never URLs: a downloaded book's own
  cover file, else a small JPEG under `Paths.document/car-artwork/` named from a hash of the
  `contentKey` and `cover_version` (`artworkName`), fetched once at 320 px (`cover_sizes`),
  downloaded to a `.part` file and moved into place when complete, and pruned once no snapshot
  names it. They are fetched only after the snapshot that needs them is out (a list never waits
  on the network) and only once a car has connected on this device (`audiosilo.carSeen`).

`car-controller.ts` (`startCarSync()`, from the root layout and from the car task; a no-op on
the web and on a binary without the car functions) builds and writes it **only once a car has
connected on this device** (`audiosilo.carSeen`; a phone that never meets a car never builds
one): at start, when a car connects (always a fresh build), when the progress lists, the Up
next queue or the downloads registry change (after `SETTLE_MS`, 2 s), when the language
changes, and, while a car is connected, when a book starts or pauses; never two writes closer
than `MIN_GAP_MS` (2 s). It **never overwrites** native's last snapshot with a worse one: not
while the session's hydrate has failed (`sessionHydrateFailed`, a locked keychain at a
CarPlay launch), and not when no signed-in server's lists could be read (the car's offline
case) once a snapshot has been written on this device (`audiosilo.carSnapshotWritten`).
Every write, play request, adoption and bookmark drain waits for `bootstrapPlayback()`, so
none acts on stores that haven't hydrated. The controller also records the connection in
`car-connection.ts` (`isCarConnected`), which the car task and the
[auto sleep timer](sleep-timer.md) read: the nightly timer never arms while a car is
connected (`auto-sleep-controller.ts`; it arms once the car has gone, if the book still
plays inside the window). It answers:

- **Play requests** (`onCarPlayRequest {id}`, a book native can't start alone):
  `handleCarPlayRequest` lets the loaded book play on (never restarted) and starts any other
  through `startBookInPlace`, from its saved place. A downloaded book there asks its server
  for item and chapters with a 3 s limit (`FRESH_SOURCE_WAIT_MS`), then starts from the
  download's copy, so it starts offline too. A failure is logged; native times the request
  out.
- **Remote bookmarks** (`carNative.onBookmark`, the module's `onRemoteBookmark`, which carries
  the engine's own book): one is added through the framework-free `addBookmark` (no label, so
  the `annotations` gate has nothing to hold back) at the engine's place at the press, on the
  book the engine names (else the loaded book). Bookmarks pressed while no JS ran
  (`consumePendingBookmarks`, Android) are added at start and on every return to the
  foreground, each on its own connection (dropped when the connection is gone); one that can't
  reach its server waits under `audiosilo.carBookmarks` for the next drain.
- **Adopting** (Android): see [below](#adopting-a-book-the-service-loaded).

`car-native.ts` / `car-native.native.ts` are the one seam to the module's car surface, and
feature-detect it: on an older binary `available` is false, the reads answer null or `[]`, and
the listeners never fire.

## Android Auto

### A `MediaLibraryService`

`AudiosiloPlayerService` is now a Media3 `MediaLibraryService` (Media3 stays at 1.5.1) whose
session player is the same `AudiobookPlayer`, so the phone's lock screen behaves exactly as
before. The module's own `AndroidManifest.xml` declares it for the
`androidx.media3.session.MediaLibraryService`, `MediaSessionService` and
`android.media.browse.MediaBrowserService` actions, plus `com.google.android.gms.car.application`
(`res/xml/automotive_app_desc.xml`: a `media` app), the tintable attribution icon
(`ic_notification`), the `ResumptionReceiver` and the `ArtworkProvider`.

- **Browsing** (`LibraryCallback` + `CarBrowseTree`, answered from the snapshot): root ->
  the tabs (category list items) -> books (grid items) with `EXTRAS_KEY_COMPLETION_STATUS`,
  `EXTRAS_KEY_COMPLETION_PERCENTAGE` and the download status. Signed out, or an empty tab:
  one item that is neither browsable nor playable, titled with the snapshot's label. Before
  the first snapshot, a browse boots JS to write one.
- **Covers** go through `ArtworkProvider` (`${applicationId}.audiosilo.artwork`, not
  exported), which serves only files under the artwork folder that the current snapshot
  names, with read access granted per URI to the browsing package.
- **Playing from the car** (`onSetMediaItems` with an id-only item, `playFromCar`): the book
  the player already has plays on from where it is (`playingQueue`; sent to JS it would wait
  for a `load` that never comes). With no JS runtime (`PlayerBridge.sink == null`), a book with
  a play spec starts at once from the spec (no auth headers: every track is local). Otherwise the service returns a `SettableFuture`, makes sure JS runs,
  emits `onCarPlayRequest`, and completes the future with the queue the module's next `load`
  sets (an identical re-set Media3 then makes is absorbed), or fails after 10 s with an error
  Auto shows (`labels.unavailable`). While a JS runtime exists even a downloaded book goes
  through JS:
  JS may hold another book as `nowPlaying`, and swapping the engine under it would save one
  book's place as another's.
- **Voice** ("Hey Google, play AudioSilo", "play The Hound of the Baskervilles on AudioSilo"): Media3 hands an item
  with no id and the query to `onSetMediaItems`, and `playFromSearch` plays the first snapshot
  item whose title contains the query, else lets the loaded book play on, else starts the
  first Continue listening book; "unavailable" only when there is none. There is no search
  button: the session doesn't grant `COMMAND_CODE_LIBRARY_SEARCH` or
  `COMMAND_CODE_LIBRARY_GET_SEARCH_RESULT` (a legacy browser's root hints advertise search
  exactly when they are granted, and there is no `onSearch` to answer it).
- **Only the app adds playable items.** The service is exported (Auto and the system bind to
  it), and Media3's default accepts any item that carries a URI, which the player would fetch
  with the session's auth header. So `onAddMediaItems` refuses every controller but the app's,
  and `onSetMediaItems` from another controller takes only car item ids (and voice queries).
  The auth header itself goes only to the origin of the loaded book's tracks (`AuthHolder`,
  through a `ResolvingDataSource`).
- **Playback resumption**: `onPlaybackResumption` (a Bluetooth or car play with an empty
  player) starts the snapshot's first Continue listening book only when it has a play spec.
  Media3 1.5.1 asks only on a play command, so merely connecting Auto never plays.
  `ResumptionReceiver` (a `MediaButtonReceiver`) refuses to start the foreground service when
  there is nothing resumable, since a foreground service that doesn't start playback within
  seconds crashes the app (`ForegroundServiceDidNotStartInTimeException`).
- **The bookmark** is a third custom `CommandButton` (`audiosilo.BOOKMARK`,
  `ICON_BOOKMARK_UNFILLED`, `ICON_BOOKMARK_FILLED` for 2 s after a press). System UI (API 33+)
  shows play, previous, next and only the first two custom actions, and our
  `NotificationProvider` leaves the bookmark out of the notification's own actions, so the
  phone keeps its five-action row (`dumpsys notification`: `actions=5`) while Auto lists it in
  its overflow. With JS listening it is `onRemoteBookmark`; without, it goes to
  `PendingBookmarks` (prefs) and JS is booted to drain it.
- **The chapter list** is Auto's own queue: the player's timeline of chapter clips.
- **Car connection**: `CarConnectionMonitor` reads the Auto host's
  `content://androidx.car.app.connection` provider (the contract `CarConnection` reads,
  without the car-app library; hence the `<queries>` entry), because Media3 only notices a
  legacy controller leaving by a timeout. Connected Auto controllers are the fallback. Changes
  emit `onCarConnection`.

### Who moved the player

The module's `MediaController` connects with the connection hint `audiosilo.app=true`
(`PlayerBridge.HINT_APP`). `PlayerBridge.isAppController` requires the hint **and** the
app's own uid (`controller.uid == Process.myUid()`): any connecting app could send the hint,
and Media3's own notification controller shares the uid but not the hint. `AudiobookPlayer` asks, for every seek, skip and speed change,
whether the request came from a controller other than the app's (`isRemoteRequest`, via the
session's `controllerForCurrentRequest`) and reports those through `PlayerBridge` (an
in-process seam: same process, no session round trip). Its own auto-rewind and nested seeks
never count. The module translates the clip position into file coordinates and emits
`onRemoteMove` / `onRateChange`.

Media items now carry their own mapping in `MediaMetadata.extras` (`fileIndex`,
`startInFile`, file duration, and the `BookRef` from `load`'s 5th argument or the play spec),
built by one shared `MediaItems.buildQueue` / `toClipItem`. The module rebuilds its
`TimelineMap` (file to item coordinates and back; it replaced `ChapterMap`) from the controller's
timeline, so positions are right for a queue the **service** loaded. `TimelineMapTest` covers
it on the JVM.

### Booting JS without an activity

When the service needs JS (a car play JS must start, a book playing with no JS that must
save its progress, a pending bookmark, Auto connecting), `JsRuntime.ensure` starts the app's
`ReactHost` in-process on the main thread if it isn't running, and then the headless task
`AudiosiloCar` through `HeadlessJsTaskContext` with no timeout. It starts the task **in an
already running runtime too** (an activity's, now in the background), even when the car
controller already listens: React Native fires JS timers with no activity resumed only while a
task runs, and the snapshot writes are timers, so without one a car connecting to a
backgrounded app kept its old lists for the whole drive. In-process, not a
`HeadlessJsTaskService`: Android 12+ forbids starting a service from the background, and we
already run inside one. `release()` finishes the task once no car is connected and nothing
plays.

On the JS side, `index.ts` (the `package.json` `main`) imports
`src/car/register-car-task` **before** `expo-router/entry`: on Android it registers
`AudiosiloCar` with `AppRegistry.registerHeadlessTask` (the task's code loads only when it
runs); elsewhere the file is empty. `runCarTask` (`car-task.ts`) runs
`bootstrapPlayback()` (the root layout's launch steps as one memoised run: storage
migration, the downloads wipe after a reset, hydrating session, settings, downloads, series
orderings and library selection, and the listener's language for the snapshot's labels),
starts the two app-lifetime controllers the root layout would (address routing, so a server
paired at home is reached through its away address from the car, and the place reconcile;
both shared starts), starts the car sync, and resolves once **no car is connected** and the
player has been idle for `CAR_TASK_IDLE_MS` (30 s), or at once when the car leaves while idle. The car sync is never stopped by the task: the runtime outlives it, and an
activity opened later on the same runtime finds the launch steps done.

### Adopting a book the service loaded

`getLoadedBook()` (Android; iOS resolves null) names the book the service has loaded (the
car started it with no JS, or it kept playing while JS restarted) with its file index,
position, rate and whether it plays. The controller calls the store's
`adoptLoaded(book)` at start, when a car connects, on returning to the foreground and when the
engine moves to another file or starts playing on its own (never for the store's own switch
or load), if `nowPlaying` isn't that book. Adopting builds the queue as
`playBook` would (from the download manifest when downloaded, else through the query cache),
sets `nowPlaying` and the rate, makes the **resume floor** the engine's place, seeds the
bridge's snapshot (`adoptPlace`, so the next tick maps onto the right file) and, if playing,
runs the place reconcile's pick-up check (`onPickedUpAgain`) before its first save (another
device may have played on since the place the car started from) and starts the save loop and
a listening span, all **without `svc.load`** (a reload would cut the
audio). It gives up, changing nothing, if another book started while the item was read. The
regression tests are in `src/playback/store-adopt.test.ts`; the store side is summarised in
[Playback](playback.md#the-player-store-storets).

## CarPlay

### The UIScene life cycle (`plugins/withCarPlay.js`)

Declaring any scene in `UIApplicationSceneManifest` moves the **whole** iOS app to the
UIScene life cycle (which the iOS 27 SDK will require anyway, TN3187), and from then on UIKit
never shows a window the app delegate made. Expo SDK 56's template still creates its window
and starts React Native in `didFinishLaunching`, so the config plugin:

1. writes the scene manifest: a phone scene (`UIWindowSceneSessionRoleApplication`,
   `AudiosiloPhoneSceneDelegate`) and a CarPlay scene
   (`CPTemplateApplicationSceneSessionRoleApplication`, `CPTemplateApplicationScene`,
   `AudiosiloCarPlaySceneDelegate`), with `UIApplicationSupportsMultipleScenes: false` (the
   two are different roles, so they coexist without it);
2. rewrites the AppDelegate: the template's window creation and `startReactNative` become a
   stored starter (`AudiosiloScenes.configure(start:mirrorWindow:)`). The template text is
   matched exactly and **any other text fails the prebuild** (a silent miss would ship a black
   screen). Mods of one kind run in reverse registration order, so it is listed before
   `expo-widgets` and after nothing that rewrites the AppDelegate;
3. adds `com.apple.developer.carplay-audio` to the entitlements **only with
   `AUDIOSILO_CARPLAY=1`** at prebuild. A device build carrying it can't be signed until Apple
   grants the entitlement, so store and device builds leave it out until then; without it iOS
   simply never connects a CarPlay scene, while the scene code always ships.

`AudiosiloScenes` starts React Native in whichever scene connects first: the phone scene into
its own window, with launch options rebuilt from `connectionOptions` (the cold-start pairing
link: `Linking.getInitialURL()` reads only the launch options); a CarPlay-first launch (app
not running, phone perhaps locked) into an off-screen parking window whose root view
controller the phone scene adopts later. The phone scene delegate re-feeds URL contexts and
user activities to the app delegate (`RCTLinkingManager`, expo-linking), as expo 57.0.23's
`ExpoAppSceneDelegate` does, and the scene window is mirrored onto the app delegate's `window`
(expo-system-ui reads it). Pairing deep links, cold and warm, are the regression to check
after any change here; `plugins/withCarPlay.test.ts` runs the transforms over an SDK 56
AppDelegate fixture.

### The templates (`AudiosiloCarPlaySceneDelegate.swift`)

- A `CPTabBarTemplate` of up to `CPTabBarTemplate.maximumTabCount` `CPListTemplate`s from the
  snapshot, each item with its cover (decoded and scaled off the main thread from the
  snapshot's file URIs; nothing is fetched), `detailText`, `playbackProgress` (1 for
  finished) and `isPlaying` for the loaded book. Before a snapshot or signed out, one list
  whose empty text is the snapshot's label (never "use your phone", per Apple's guideline).
  A refresh with the same tabs updates them in place, keeping the selected tab and scroll.
- A tap sends `onCarPlayRequest {id}` (iOS always lets JS start books: JS has the session,
  the saved place and the queue rules), shows the item's spinner until the engine reports the
  book or 10 s pass, then pushes `CPNowPlayingTemplate.shared`.
- **Now Playing** reads the engine's chapter-aware Now Playing info (title, chapter scrubber;
  [Playback](playback.md#ios-avqueueplayer)). Its Up Next button, titled with
  `labels.chapters`, is enabled with 2+ chapters and pushes a chapter list windowed around the
  current chapter to `maximumItemCount`; a pick seeks natively and so reaches JS as an
  `onRemoteMove`. Buttons: `CPNowPlayingPlaybackRateButton` (cycles the engine's
  `supportedRates`, 0.75x to 2x, through `setRateFromRemote`, which emits `onRateChange`) and a
  `CPNowPlayingImageButton` bookmark (`bookmark`, `bookmark.fill` for about 2 s) that emits
  `onRemoteBookmark`.
- Car events (`onCarConnection`, `onCarPlayRequest`) go through `AudiosiloCarEvents`, which
  queues them until JS listens (`OnStartObserving`), so a connect or tap before JS is ready
  isn't lost.
- The templates read the engine directly through `AudioEngine.shared`
  (`AudioEngine+CarPlay.swift`: the loaded book id from `load`'s `book`, the rate, the
  chapters) and refresh on `.audiosiloPlayerDidChange`, which the engine posts on every state
  and Now Playing chapter change. Items are matched to the loaded book by its id.

### Tokens on a locked phone (`src/lib/secure-store.ts`)

CarPlay starts books with the phone in a pocket, and the default `WHEN_UNLOCKED` keychain item
can't be read then. On iOS, tokens now live in their own keychain service,
**`audiosilo.tokens.afu`**, written with `keychainAccessible: AFTER_FIRST_UNLOCK`.

Until a token has moved (the first launch after the update), a CarPlay launch with the phone
locked can't read it ("interaction is not allowed"). The session store then keeps `status`
on `loading` instead of showing signed out, retries every 5 s and on foreground, and keeps
the offline queue, car bookmarks and native's last car snapshot untouched meanwhile; see
[State and data](state-and-data.md#session-srcstoressessionts).

A separate service rather than a re-save, because expo-secure-store's `setItemAsync` turns an
existing item (same service and account; accessibility isn't part of the identity) into a
`SecItemUpdate` of the data only, so re-saving never changes the accessibility. `getSecure`
reads the new item first; if it is missing it reads the old default-service item and moves it:
write the new one, read it back, and only when it reads back equal delete the old one. **It
never deletes first**; any failure removes the unverified copy, keeps the old item and retries
on the next read (every token is read at launch). `deleteSecure` deletes both homes.
`AUTH_STORAGE_VERSION` is untouched, so nobody re-pairs.

## Widgets and the Live Activity (iOS)

Through **`expo-widgets` 56.0.27** (iOS only; its Android side is a stub). The `app.json`
plugin entry names the extension `app.audiosilo.widget`, the App Group `group.app.audiosilo`
and the `ContinueListening` widget (`systemSmall`, `systemMedium`). Two of our plugins are
listed before it so they run after it: `withXcode26SwiftUICoreFix` (the extension links the
same static pods) and `withWidgetsNoPush` (expo-widgets 56 adds `aps-environment`
unconditionally; the app sends no push, so it is stripped, or every profile would need the
Push Notifications capability).

- `src/widgets/continue-listening.tsx` and `sleep-timer-activity.tsx` are `'widget'`
  functions: babel-preset-expo turns each into a source string the extension evaluates in its
  own JavaScriptCore context with `@expo/ui/swift-ui` as globals. So: no hooks, nothing from
  module scope, imports only from those modules under their original names, the system font,
  and every string arriving in props, already localized.
- `widget-model.ts` (pure, tested) decides what to write and when: `continueListeningProps`
  (title, author, chapter, a cover file, time left at the book's speed, progress, playing, and
  a `audiosilo://player?connection=..&libraryId=..&path=..` deep link from the player
  route's own `playerParams`, so a cold launch opens that book) and `sleepActivityProps` (title, chapter, cover, `endsAt`, `pausedAt`, deep
  link).
- **Links into the app keep their encoding**: `src/app/+native-intent.tsx`
  (`redirectSystemPath`, rule in `src/lib/native-intent.ts`, `appLinkPath`) turns an
  `audiosilo://...` link (the widget, the Live Activity, the pairing link) into a plain path
  (`/player?...`) before Expo Router sees it. Expo Router decodes an app-scheme URL's query
  values and joins them back unencoded, so a path holding `&`, `#`, `+` or `%XX` ("Austen/Pride
  & Prejudice") came apart and opened the player on a book that doesn't exist; a path is
  decoded once, like an in-app href. The development client's own links pass through as they
  are.
- `widget-sync.ios.ts` (`startWidgetSync`, from the root layout; `widget-sync.ts` is the
  no-op elsewhere) wires it: the widget is rewritten on a book, chapter, play/pause or speed
  change, a jump over 30 s, a stop, and once a minute while playing, coalesced to one write per
  `MIN_WRITE_MS`. Covers are written into the widgets directory once per book (the extension
  can't fetch): the server's 320 px thumbnail for the widget and 160 px for the activity, else
  the downloaded cover, only when its header says it fits (`fitsCover`; there is no resizer).
  Removing the widget's connection clears it.
- The **Live Activity** starts only with the app in the foreground (ActivityKit's rule; a
  timer armed in the background gets one on the next foreground), is updated when the end moves
  (an extension, a freeze while paused, a seek or speed change under an end-of-chapter timer, a
  new chapter), and is **ended immediately** when the timer fires or is cancelled. The
  countdown is `Text(timerInterval:pauseTime:countsDown:)`, ticked by the system. One the
  listener swiped away is not started again for that timer. There is no playback Live Activity
  (it would duplicate Now Playing) and no buttons: expo-widgets has no `AudioPlaybackIntent`,
  so a widget button would run in the extension and never reach the player.

**The dev build** (`app.audiosilo.dev`) must not claim the store app's ids: its extension has
to be `app.audiosilo.dev.widget` and its App Group `group.app.audiosilo.dev`, patched after
prebuild in the project file, both entitlements files and the Info.plist key expo-widgets
reads (the testbed's iOS build script does this and verifies the embedded extension).
