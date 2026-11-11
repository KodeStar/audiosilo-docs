---
title: Native integrations
description: "CarPlay and Android Auto (the car snapshot, the Android MediaLibraryService and headless JS, the iOS UIScene life cycle and CarPlay templates), the after-first-unlock token store for a locked phone, and the iOS widgets and sleep timer Live Activity."
---

This page covers the surfaces outside the app's own window: the car (Android Auto and
CarPlay), the iOS home screen widget and the sleep timer Live Activity.

- The car sits on the same native module as playback
  ([Playback](playback.md#the-native-module-modulesaudiosilo-player)).
- The widget and the Live Activity sit on `expo-widgets`.
- All of them run on shared JS controllers, and none of them adds a wire change.

The audio effects the car also applies are in [Smart speed and Voice boost](audio-effects.md).
How to run each of these on a device, the DHU or the Simulator is under
[Testing](testing.md#native-checks).

**Status.** Android Auto ships in every build. Listing it through Google Play has a step of
its own, in [Releasing](../contributing/releasing.md#the-app-store-track-ios--android).
CarPlay ships too and is on by default. Apple granted the
`com.apple.developer.carplay-audio` entitlement on 2026-10-09, and both App IDs carry the
capability. Prebuild adds the entitlement unless `AUDIOSILO_CARPLAY=0`
(see [The UIScene life cycle](#the-uiscene-life-cycle-pluginswithcarplayjs)). A store build
with the widgets and the Live Activity needs the App Group and the extension provisioned
first (see [Widgets and the Live Activity](#widgets-and-the-live-activity-ios)). The users'
[Availability](/users/listening/mobile-apps#availability) page says which store release has
each of these.

| Piece | Where |
|---|---|
| Car snapshot, play requests, car bookmarks, adopting | `src/car/` |
| JS entry (registers the headless task) | `index.ts` (`package.json` `main`), then `expo-router/entry` |
| Launch steps shared by the root layout and the car task | `src/lib/bootstrap.ts` (`bootstrapPlayback`) |
| Android Auto | `modules/audiosilo-player/android/.../AudiosiloPlayerService.kt`, `LibraryCallback.kt`, `CarBrowseTree.kt`, `CarSnapshot.kt`, `ArtworkProvider.kt`, `JsRuntime.kt`, `PlayerBridge.kt`, `PendingBookmarks.kt`, `CarConnectionMonitor.kt`, `ResumptionReceiver.kt`, `MediaItems.kt` |
| CarPlay and the UIScene life cycle | `plugins/withCarPlay.js`; `modules/audiosilo-player/ios/AudiosiloScenes.swift`, `AudiosiloPhoneSceneDelegate.swift`, `AudiosiloCarPlaySceneDelegate.swift`, `AudiosiloCarSnapshot.swift`, `AudioEngine+CarPlay.swift` |
| Tokens readable on a locked iPhone | `src/lib/secure-store.ts` |
| Widgets and the Live Activity (iOS) | `src/widgets/`, `expo-widgets`, `plugins/withXcode26SwiftUICoreFix.js`, `plugins/widgets-entitlements.test.ts`; their links open through `src/app/+native-intent.tsx` |

The Apple Watch app is a Swift target of its own, with a WatchConnectivity module on the
phone. It is described in [Apple Watch](apple-watch.md).

Not built, deliberately for now:

- a phone "car mode";
- Siri and App Intents;
- interactive widgets;
- an Android widget;
- search in the car;
- a server-computed silence map;
- Smart speed on iOS ([why Smart speed isn't on iPhone yet](audio-effects.md#why-smart-speed-isnt-on-iphone-yet)).

## The car snapshot (`src/car/`)

Native has no strings, no session and no server, so **JS decides what the car lists**. JS
hands the list over as one JSON document, the car snapshot, through the module's
`setCarSnapshot(json)`. Native keeps the last one on disk, so a car shows its lists at once,
before JS runs or without it:

- Android writes it atomically to `filesDir`.
- iOS writes it to Application Support with `completeUntilFirstUserAuthentication`
  protection.

### What the snapshot holds

`car-model.ts` builds the snapshot as a pure function (`buildCarSnapshot`).

**Whose books.** Every tab is built only from the connections of the **person listening**
([Profiles](profiles.md#visible-and-background-connections)). That includes the Downloads
tab, and no play spec is written for another person's book. While nobody is chosen, no tab
is built. The snapshot is rebuilt when the active profile changes.

A play request (`handleCarPlayRequest`) and the Android service-book adoption quietly refuse
another person's book. They also refuse any book while nobody is chosen, which happens with
an item of an older snapshot. A connection that no profile holds still plays, which covers a
CarPlay launch before the session could be read.

**The fields.** The snapshot carries `version: 1`, `generatedAt`, `signedIn`, the localized
`labels` and up to four `tabs`. The labels come from `carLabels(t)`, which reads the `car.*`
keys: `continue`, `chapters`, `bookmark`, `bookmarkSaved`, `empty`, `signedOut` and
`unavailable`. Each tab carries its own localized `title`.

| Tab | What it holds | Limit |
|---|---|---|
| `continue` | Home's rule (`isInProgress`, newest first, every server of the person listening), with the loaded book first (`continueRefs`) | 20 |
| `upnext` | The queue the app's Up next shows. `queueConnectionId` picks the loaded book's connection, else the default, else the first (see [Overview](overview.md#up-next-drawer-and-sheet)). Left out when that server has no `queue` capability. | 20 |
| `downloads` | The person listening's downloaded books, newest download first | 50 |
| `library` | The library the Library tab shows (`resolveLibrarySelection`, as in [State and data](state-and-data.md#library-selection-srcstoreslibrary-selectionts)), `sort: 'recent'` | 50 |

The limits are `CAR_TAB_LIMITS`. Android Auto doesn't page, and CarPlay trims further to its
own `maximumItemCount`.

**A kids profile** gets the kids shelf only (`kidsCarBooks`):

- The `library` tab holds the shelf as [kids mode](kids-mode.md#what-it-shows-srccomponentskids)
  shows it: the owner's shared collections, else the one library, else the account's
  downloads. It is titled "Your stories" through the snapshot input's `titles`.
- `kidsCarBooks` lists each story once and trims the shelf to `CAR_TAB_LIMITS.library` (50)
  itself. It does this before the controller fetches a cover for every book a tab holds,
  because a shelf of shared collections can hold a thousand.
- The `continue` tab holds the shelf's stories in progress, found on the whole shelf and not
  only its first 50.
- `upnext` and `downloads` are `null`, so those tabs are left out. `CarSnapshotInput.books`
  is `Record<CarTabId, CarBook[] | null>`, and a `null` tab is omitted.

The controller builds the kids shelf without React, from the same reads as
`useKidsStories`. It rebuilds the snapshot when kids mode turns on or off.

**Each `CarItem`** has these fields:

- `id`, from `carItemId(ref)`: `book:` plus the URI-encoded connection id, library id and
  path, joined by `:`. The path is the identity, scoped by connection, never a database id.
  `parseCarItemId` reverses it. It maps a connection id from before the
  [identity migration](state-and-data.md#connection-identity-server_iduser_id) to its new
  one through `resolveConnectionId`, so an item of a snapshot written by an older build
  still plays.
- `book`, a `BookRef`, so native compares its fields instead of decoding the id.
- `title`.
- `subtitle`: the author, then, once the book has started, the time left at the book's own
  speed.
- `progress` (0..1 or null), `finished`, `downloaded` and `artwork`.
- `play`, a play spec, **only for a downloaded book**.

**The play spec.** `playSpec(...)` holds what Android needs to start a downloaded book with
no JS:

- the `BookRef`;
- the tracks as `file://` URLs **with no headers**;
- the chapter clips (`buildChapterClips`);
- the start index and position, from the resume lookup. It reads them through `resumeStart`
  in `src/playback/book-source.ts`, as `playBook` reads them: a finished book starts at 0,
  and its saved speed wins over the default;
- the rate.

No session token is ever written outside expo-secure-store for the car.

**Covers** (`car-artwork.ts`) are files the app wrote, never URLs:

- A downloaded book uses its own cover file.
- Any other book uses a file under `Paths.document/car-artwork/`, named from a hash of the
  `contentKey` and `cover_version` (`artworkName`). The file is fetched once. It is the
  320 px thumbnail when the server's cached flags say `cover_sizes`, else the full cover,
  kept as it is. It downloads to a `.part` file and moves into place when complete.
- A cover file is pruned once no snapshot names it.
- Covers are fetched only after the snapshot that needs them is out, so a list never waits
  on the network. They are fetched only once a car has connected on this device
  (`audiosilo.carSeen`).

### When the snapshot is written

`car-controller.ts` runs `startCarSync()`, from the root layout and from the car task. It is
a no-op on the web and on a binary without the car functions. It builds and writes the
snapshot **only once a car has connected on this device** (`audiosilo.carSeen`), so a phone
that never meets a car never builds one. Two writes are never closer than `MIN_GAP_MS`
(2 s). It writes:

- at start;
- when a car connects (always a fresh build), and on Android after adopting a book the
  service loaded;
- when the language changes;
- while a car is connected, when a book starts or pauses;
- after `SETTLE_MS` (2 s), when any of these change: the progress lists, the Up next queue,
  the downloads registry, the session's connections or default connection, the library
  selection or the default speed;
- once covers that a written snapshot lacked have been fetched, so the next one names them.

It **never overwrites** native's last snapshot with a worse one. It skips the write:

- while the session's hydrate has failed (`sessionHydrateFailed`);
- when no signed-in server's lists could be read (the car's offline case), once a snapshot
  has been written on this device (`audiosilo.carSnapshotWritten`).

Every write, play request, adoption and bookmark drain waits for `bootstrapPlayback()`, so
none acts on stores that haven't hydrated. The controller records the connection in
`car-connection.ts` (`isCarConnected`). The car task reads it, and it keeps the
[auto sleep timer](sleep-timer.md#auto-sleep-timer-auto-sleepts--auto-sleep-controllerts)
from arming in a car.

### What the controller answers

**Play requests** (`onCarPlayRequest {id}`) are for a book native can't start alone.
`handleCarPlayRequest` lets the loaded book play on and never restarts it, though an ended or
failed one starts again like any other. It starts any other book through
`startBookInPlace`, from its saved place. A downloaded book starts from its download when its
server is slow or away (see [The end of a book](end-of-book.md#ending-a-book)). A failure is
logged, and native times the request out.

**Remote bookmarks** arrive on `carNative.onBookmark`, the module's `onRemoteBookmark`, which
carries the engine's own book.

- The controller adds each one through the framework-free `addBookmark`, with no label, so
  the `annotations` gate has nothing to hold back. The bookmark goes at the engine's place at
  the press, on the book the engine names, else on the loaded book.
- On Android, bookmarks pressed while no JS ran (`consumePendingBookmarks`) are added at
  start and on every return to the foreground. Each goes on its own connection and is dropped
  when the connection is gone.
- One that can't reach its server waits under `audiosilo.carBookmarks` for the next drain.

A waiting bookmark is kept by its file (the path-keyed `trackId`) and its seconds in that
file, read on its first try. A file and its in-file place survive a re-ordered download, and
whole-book seconds do not. The whole-book place read on its latest try is kept beside them.

Each retry finds the file in the book's current order (`trackIndexById`, shared with
[`adoptLoaded`](#the-engines-file-order)) on the device alone. It looks in the loaded queue,
else the download, and makes no request before its send. So a download that has since taken
the server's new order still puts the bookmark in its file. The whole-book seconds stand only
for a book that no longer holds that file, or that is neither loaded nor downloaded.

A kept bookmark of the older form (whole-book seconds alone, written by 2.4.1) is still read.
Only one whose place could not be read yet stays in file coordinates.

**Adopting** (Android) is described in
[Adopting a book the service loaded](#adopting-a-book-the-service-loaded).

`car-native.ts` and `car-native.native.ts` are the one seam to the module's car surface, and
they feature-detect it. On an older binary `available` is false, the reads answer null or
`[]`, and the listeners never fire.

## Android Auto

### A `MediaLibraryService`

`AudiosiloPlayerService` is a Media3 `MediaLibraryService` (Media3 1.9.0). Its session player
is the same `AudiobookPlayer` the phone's lock screen uses. The module's own
`AndroidManifest.xml` declares:

- the service, for the `androidx.media3.session.MediaLibraryService`,
  `MediaSessionService` and `android.media.browse.MediaBrowserService` actions;
- `com.google.android.gms.car.application` (`res/xml/automotive_app_desc.xml`: a `media`
  app);
- the tintable attribution icon (`ic_notification`);
- the `ResumptionReceiver` and the `ArtworkProvider`.

**Browsing.** `LibraryCallback` and `CarBrowseTree` answer from the snapshot. The root lists
the tabs (category list items), and each tab lists books (grid items) with
`EXTRAS_KEY_COMPLETION_STATUS`, `EXTRAS_KEY_COMPLETION_PERCENTAGE` and the download status.
When signed out, or for an empty tab, the list holds one item that is neither browsable nor
playable, titled with the snapshot's label. A browse before the first snapshot boots JS to
write one.

**Covers** go through `ArtworkProvider` (`${applicationId}.audiosilo.artwork`, not
exported). A URI names an opaque key, a hash of the file's path. The provider serves only a
file that the current snapshot names and that lies inside the app's own data directory: the
car artwork folder, or a download's own cover. It grants read access per URI to the browsing
package.

**Playing from the car.** `onSetMediaItems` with an id-only item calls `playFromCar`:

| Situation | What the service does |
|---|---|
| The book the player already has, ready or buffering | Plays on from where it is (`playingQueue`). Sent to JS, the request would wait for a `load` that never comes. |
| No JS runtime (`PlayerBridge.sink == null`) and a play spec (downloaded) | Starts at once from the spec, with no auth headers, because every track is local |
| Anything else | Returns a `SettableFuture`, makes sure JS runs and emits `onCarPlayRequest`. It completes with the queue that the module's next `load` sets, and absorbs the identical re-set Media3 then makes. After 10 s it fails with an error Auto shows (`labels.unavailable`). |

"Anything else" includes a downloaded book while a JS runtime exists. JS may hold another
book as `nowPlaying`, and swapping the engine under it would save one book's place as
another's.

**Voice.** For "Hey Google, play AudioSilo" or "play The Hound of the Baskervilles on
AudioSilo", Media3 hands an item with no id and the query to `onSetMediaItems`.
`playFromSearch` then picks, in order:

1. the first snapshot item whose title contains the query;
2. the loaded book, which plays on;
3. the first Continue listening book.

It answers "unavailable" only when there is none. There is **no search button**. The session
doesn't grant `COMMAND_CODE_LIBRARY_SEARCH` or `COMMAND_CODE_LIBRARY_GET_SEARCH_RESULT`. A
legacy browser's root hints advertise search exactly when those are granted, and there is no
`onSearch` to answer it.

**Only the app adds playable items.** The service is exported, because Auto and the system
bind to it. Media3's default accepts any item that carries a URI, and the player would fetch
that URI with the session's auth header. So `onAddMediaItems` refuses every controller but
the app's, and `onSetMediaItems` from another controller takes only car item ids and voice
queries. The auth header is also scoped to the book's server
([Playback](playback.md#android-media3--exoplayer)).

**Settings without JS.** Whenever the module's `setConfig` changes `PlayerConfig`
(auto-rewind and the skip lengths), the module persists it in the `audiosilo.player`
SharedPreferences (`config.autoRewindMaxMs`, `config.jumpForwardMs`,
`config.jumpBackwardMs`). The service restores it in `onCreate`. So a book the car starts
with no JS honours the listener's Settings, as the effects switches do
([Smart speed and Voice boost](audio-effects.md#android-one-processor-chain)).

**Playback resumption.** `onPlaybackResumption` runs on a Bluetooth or car play with an empty
player. It starts the snapshot's first Continue listening book only when that book has a play
spec. Media3 asks only on a play command, so merely connecting Auto never plays. With
`isForPlayback = false` (System UI's resumption card after a reboot) it answers from the play
spec with no side effect.

`ResumptionReceiver` (a `MediaButtonReceiver`) overrides Media3 1.9's
`shouldStartForegroundService(Context, Intent)`. It refuses to start the foreground service
when there is nothing resumable, because a foreground service that doesn't start playback
within seconds crashes the app (`ForegroundServiceDidNotStartInTimeException`). A media
button start that does go ahead goes foreground at once, with a placeholder notification
under Media3's notification id. Media3's own notification replaces it when the book plays. If
nothing resumes within 15 s, the service removes the placeholder and stops.

**Media3 is pinned.** The module's `media3Version` must be what the app resolves. Gradle takes
the highest Media3 any dependency asks for, while the module compiles against its own
declaration, so a mismatch compiles and then breaks at run time. The module's `strictly`
constraints make the build fail when anything asks for another version, so a bump changes
`media3Version` and the code together.

**The bookmark** is a third custom `CommandButton` (`audiosilo.BOOKMARK`).
It shows `ICON_BOOKMARK_UNFILLED`, and `ICON_BOOKMARK_FILLED` for 2 s after a press. System UI
(API 33+) shows play, previous, next and only the first two custom actions. Our
`NotificationProvider` leaves the bookmark out of the notification's own actions, so the
phone keeps its five-action row (`dumpsys notification`: `actions=5`) while Auto lists the
bookmark in its overflow. With JS listening, a press is `onRemoteBookmark`. Without JS, it
goes to `PendingBookmarks` (prefs) and the service boots JS to drain it.

**The chapter list** is Auto's own queue: the player's timeline of chapter clips.

**Car connection.** `CarConnectionMonitor` reads the Auto host's
`content://androidx.car.app.connection` provider. That is the contract `CarConnection` reads,
read here without the car-app library, hence the `<queries>` entry. It is needed because
Media3 only notices a legacy controller leaving by a timeout. Connected Auto controllers are
the fallback. Changes emit `onCarConnection`.

### Who moved the player

The module's `MediaController` connects with the connection hint `audiosilo.app=true`
(`PlayerBridge.HINT_APP`). `PlayerBridge.isAppController` requires the hint **and** the
app's own uid (`controller.uid == Process.myUid()`). Any connecting app could send the hint,
and Media3's own notification controller shares the uid but not the hint.

For every seek, skip and speed change, `AudiobookPlayer` asks whether the request came from a
controller other than the app's (`isRemoteRequest`, via the session's
`controllerForCurrentRequest`). The skip buttons are custom session commands, which the
session doesn't attribute, so `onCustomCommand` passes their origin in with `withOrigin`.
`AudiobookPlayer` reports remote requests through `PlayerBridge`, an in-process seam in the
same process with no session round trip. Its own auto-rewind and nested seeks never count.

The service translates the clip position into file coordinates (`TimelineMap.toFile` over the
current item's extras). The module emits `onRateChange` at once. It emits `onRemoteMove` once
its own controller has caught up: at its next position discontinuity, or after 300 ms.

Media items carry their own mapping and their `BookRef` in `MediaMetadata.extras`, so the
module's `TimelineMap` is right for a queue the **service** loaded too (see
[Playback](playback.md#android-media3--exoplayer)).

### Booting JS without an activity

The service needs JS in these cases:

- a car play that JS must start;
- a book playing with no JS that must save its progress;
- a pending bookmark;
- Auto connecting.

`JsRuntime.ensure` then starts the app's `ReactHost` in-process on the main thread if it
isn't running. It then starts the headless task `AudiosiloCar` through
`HeadlessJsTaskContext`, with no timeout. It starts the task **in an already running runtime
too** (an activity's, in the background), even when the car controller already listens.
React Native fires JS timers with no activity resumed only while a task runs, and the
snapshot writes are timers.

The runtime runs in-process, not in a `HeadlessJsTaskService`, because Android 12+ forbids
starting a service from the background, and we already run inside one. `release()` finishes
the task once no car is connected and nothing plays.

On the JS side, `index.ts` (the `package.json` `main`) imports `src/car/register-car-task`
**before** `expo-router/entry`. On Android that file registers `AudiosiloCar` with
`AppRegistry.registerHeadlessTask`, and the task's code loads only when it runs. Elsewhere
the file is empty.

`runCarTask` (`car-task.ts`) does four things:

1. It runs `bootstrapPlayback()`, the root layout's launch steps as one memoised run:
   - storage migration, the connection identity migration included;
   - the downloads wipe after a reset;
   - hydrating session, settings, downloads, series orderings, library selection and
     profiles;
   - the listener's language, for the snapshot's labels.
2. It starts the two app-lifetime controllers that the root layout would. These are address
   routing, so a server paired at home is reached through its away address from the car, and
   the place reconcile. Both are shared starts.
3. It starts the car sync.
4. It resolves once **no car is connected** and the player has been idle for
   `CAR_TASK_IDLE_MS` (30 s), or at once when the car leaves while the player is idle.

The task never stops the car sync. The runtime outlives the task, and an activity opened
later on the same runtime finds the launch steps done.

### Adopting a book the service loaded

`getLoadedBook()` names the book the service has loaded, on Android. On iOS it resolves null.
The service loaded the book either because the car started it with no JS or because it kept
playing while JS restarted. `getLoadedBook()` returns the file index, the position, the rate
and whether it plays.

It also carries `files` (`LoadedBook.files?: string[]`): the library-relative paths of the
files the service loaded, in its file-index order. Each path is the file's `rel_path`, as in
the media ids. With them, the file index can be read against the order the service really
plays rather than the manifest's. Kotlin's `LoadedFiles` reads them from the media item ids
(`<libraryId>:<relPath>`), dropping a chapter clip's `#<startInFile>` suffix. It is
unit-tested on the JVM in `LoadedFilesTest.kt`. It leaves `files` out when an id has another
shape, when two items of one file disagree, or when an index has no item. iOS never sends
`files`, and nor does a binary that predates it. `adoptLoaded` reads the file index in that
order ([The engine's file order](#the-engines-file-order)).

The controller calls the store's `adoptLoaded(book, reread)` when `nowPlaying` isn't the
service's book, at these moments:

- at start;
- when a car connects;
- on returning to the foreground;
- when the engine moves to another file or starts playing on its own (never for the store's
  own switch or load).

Adopting builds the queue as `playBook` would, from `bookSourceOf`
(`src/playback/book-source.ts`). That is the download manifest when the book is downloaded,
else a read through the query cache. It then reads the service's book again through `reread`
(the controller's `getLoadedBook`), so a pause, a move or a speed change made while the
source was read stands.

When the engine plays the queue's file order, adopting then does all of this **without
`svc.load`**, because a reload would cut the audio:

1. It sets `nowPlaying` and the rate.
2. It makes the **resume floor** the engine's place.
3. It seeds the bridge's snapshot (`adoptPlace`), so the next tick maps onto the right file.
4. If the book is playing, it runs the place reconcile's pick-up check (`onPickedUpAgain`)
   before its first save, because another device may have played on since the place the car
   started from. It then starts the save loop and a listening span.

When the engine plays another file order, see [The engine's file order](#the-engines-file-order).

It gives up and changes nothing when another book started while the item was read, or when,
once read again, the service plays another book, another file order or none. The regression
tests are in `src/playback/store-adopt.test.ts`.

#### The engine's file order

Every tick the service reports after the adoption counts its file index in the service's own
order, so the queue has to be in that order too. The orders can differ when a JS restart
during a start's load leaves the service playing the server's new order while the download
keeps its old one (see the download's [new file order](offline.md#lifecycle)). With `files`
absent (iOS, Cast, an older binary), or the same as the queue's order, nothing changes.
Otherwise:

- **A downloaded book asks the server's chapters once**, afresh, for 3 s at most
  (`SERVED_ORDER_WAIT_MS`). When they come back in exactly the engine's order, the queue is
  built from them as the interrupted start would have built it: the download's files,
  streaming any file it lacks. The download takes the chapters when it holds those files
  (`adoptStartedChapters`, as `playBook` does). There is no reload, because the engine
  already plays that queue.
- **Anything else reloads the engine in the queue's order** (`reloadAdopted`). That covers a
  streamed book, which asks nothing; being offline; no answer; and the server's chapters in
  another order or with other files than the engine's. The details follow this list.
- **Not while casting.** The receiver streams the book, and a load would cut it.

`reloadAdopted` loads at the same file (`trackIndexById`, by the path-keyed track id) and
in-file place. For a file the queue lacks, it loads at the same whole-book seconds, short of
the queue's end, or at the engine's file index when an earlier file's length is unknown. The
resume floor moves to that place and the play state is kept. The price is a short cut in the
audio, and in return every later tick lands on the right file.

- `loadingBook` holds saves and remote moves until the load lands.
- The reloaded place saves nothing until it plays or the listener moves it
  (`quietAdopted`). It was never checked against the server, so the play's pick-up check runs
  first. A play reported during the load runs the check once the load's hold is released
  (`pickUpDue`).
- A paused book is paused again once loaded, unless play was pressed while it loaded. A pause
  pressed while it loads stands.
- A load that fails leaves the book in `error` (Retry).

## CarPlay

### The UIScene life cycle (`plugins/withCarPlay.js`)

Declaring any scene in `UIApplicationSceneManifest` moves the **whole** iOS app to the
UIScene life cycle, which the iOS 27 SDK will require anyway (TN3187). From then on UIKit
never shows a window the app delegate made. Expo SDK 58's template is already a scene app.
Its AppDelegate only builds the React Native factory, and its `SceneDelegate` makes the window
and starts React Native. A CarPlay-first launch must instead park React Native in an
off-screen window, and Expo's delegate always starts React Native itself. So the config
plugin does three things:

1. It writes the scene manifest, replacing the template's. The template's
   `SceneDelegate.swift` stays in the project, unused. The manifest declares:
   - a phone scene (`UIWindowSceneSessionRoleApplication`, `AudiosiloPhoneSceneDelegate`);
   - a CarPlay scene (`CPTemplateApplicationSceneSessionRoleApplication`,
     `CPTemplateApplicationScene`, `AudiosiloCarPlaySceneDelegate`);
   - `UIApplicationSupportsMultipleScenes: false`. The two scenes are different roles, so
     they coexist without it.
2. It rewrites the AppDelegate. It adds a stored starter
   (`AudiosiloScenes.configure(start:mirrorWindow:)`) right after
   `reactNativeFactory = factory`, and adds no linking overrides (see the links below). The
   plugin matches the template text exactly, and **any other text fails the prebuild**,
   because a silent miss would ship a black screen. Mods of one kind run in reverse
   registration order. So no plugin that rewrites the AppDelegate may be listed after this
   one, or that plugin's edit would run first and break the match.
3. It adds `com.apple.developer.carplay-audio` to the entitlements **by default**.
   `AUDIOSILO_CARPLAY=0` at prebuild leaves it out, for a signing identity without the grant,
   because a build carrying it can't be signed without one. Without the entitlement iOS never
   connects a CarPlay scene, while the scene code always ships.

`AudiosiloScenes` starts React Native in whichever scene connects first:

- **The phone scene** starts it into its own window, with launch options rebuilt from
  `connectionOptions`. That carries the cold-start pairing link, since
  `Linking.getInitialURL()` reads only the launch options.
- **A CarPlay-first launch** (app not running, phone perhaps locked) starts it into an
  off-screen parking window. The phone scene adopts that window's root view controller later.

The scene window is mirrored onto the app delegate's `window`, which expo-system-ui reads.

**Links take two routes**, as Expo SDK 58's own `ExpoAppSceneDelegate` does:

1. The phone scene delegate (`AudiosiloPhoneSceneDelegate.swift`) forwards each URL context
   and user activity to the app delegate, where Expo's subscribers (expo-linking,
   expo-router) listen.
2. It then hands each one to React Native's scene API (`RCTLinkingManager`
   `scene:openURLContexts:` and `scene:continueUserActivity:`), which sends JS its `url`
   event.

The delegate skips the second call when a subscriber already announced the URL (expo-router
posts a Handoff `href` itself), so JS never hears a link twice. `LinkAnnouncement` watches
`RCTOpenURLNotification` for this, the same guard as Expo's `SceneEventForwarder`.

Since React Native 0.88 the app-delegate `RCTLinkingManager` methods do nothing in a scene
app, so the AppDelegate has no linking overrides. Without the scene calls, a link opened while
the app runs (a pairing link, a widget, the Live Activity) would never reach JS. Pairing deep
links, cold and warm, are the regression to check after any change here.
`plugins/withCarPlay.test.ts` runs the transforms over the SDK 58 AppDelegate fixture
(`plugins/__fixtures__/app-delegate-sdk58.ts`) and pins the scene API calls in the Swift
source.

### The templates (`AudiosiloCarPlaySceneDelegate.swift`)

**The tabs.** The scene shows a `CPTabBarTemplate` of up to
`CPTabBarTemplate.maximumTabCount` `CPListTemplate`s from the snapshot. Each item has:

- its cover, decoded and scaled off the main thread from the snapshot's file URIs (nothing is
  fetched);
- `detailText`;
- `playbackProgress` (1 for finished);
- `isPlaying`, for the loaded book while it plays.

When signed out, the scene shows one list whose empty text is the snapshot's label, as an
empty tab's is. It never says "use your phone", per Apple's guideline. With no snapshot at
all, it shows one list titled AudioSilo with no text. That happens when none is on disk at
connect: the first CarPlay connection on the device, until JS writes one. A refresh with the
same tabs updates them in place, keeping the selected tab and scroll.

**A tap** sends `onCarPlayRequest {id}`. iOS always lets JS start books, because JS has the
session, the saved place and the queue rules. The item shows its spinner until the engine
reports the book, then the scene pushes `CPNowPlayingTemplate.shared`. For the book already
loaded it pushes at once. After 10 s it gives up: the spinner stops, nothing is pushed and the
list stays. A request JS hasn't received yet is dropped, so a slow cold boot never starts it
later.

**Now Playing** reads the engine's chapter-aware Now Playing info: the title and the chapter
scrubber ([Playback](playback.md#ios-avqueueplayer)).

- Its Up Next button, titled with `labels.chapters`, is enabled with 2+ chapters. It pushes a
  chapter list windowed around the current chapter to `maximumItemCount`. A pick seeks
  natively and so reaches JS as an `onRemoteMove`.
- `CPNowPlayingPlaybackRateButton` cycles the engine's `supportedRates`, 0.75× to 2×,
  through `setRateFromRemote`, which emits `onRateChange`.
- A `CPNowPlayingImageButton` bookmark emits `onRemoteBookmark`. It shows `bookmark`, and
  `bookmark.fill` for about 2 s after a press.

**Car events** (`onCarConnection`, `onCarPlayRequest`) go through `AudiosiloCarEvents`. It
queues them until JS listens (`OnStartObserving`), so a connect or tap before JS is ready
isn't lost. Only the latest of each is kept, and a tap is dropped once it times out or its car
leaves.

**Engine state.** The templates read the engine directly through `AudioEngine.shared`
(`AudioEngine+CarPlay.swift`): the loaded book (`loadedBook`, from `load`'s `book`), the rate
and the chapters. They refresh on `.audiosiloPlayerDidChange`, which the engine posts on every
state change and Now Playing chapter change. Items are matched to the loaded book by the
item's `book` (its `BookRef` fields), not by its id.

### Tokens on a locked phone (`src/lib/secure-store.ts`)

CarPlay starts books with the phone in a pocket, and the default `WHEN_UNLOCKED` keychain item
can't be read then. On iOS, tokens live in their own keychain service,
**`audiosilo.tokens.afu`**, written with `keychainAccessible: AFTER_FIRST_UNLOCK`. A token not
yet moved there can't be read on a locked phone. How the session waits for it is in
[State and data](state-and-data.md#session-srcstoressessionts).

The tokens use a separate service rather than a re-save. expo-secure-store's `setItemAsync`
turns a save over an existing item (same service and account) into a `SecItemUpdate` of the
data only, because accessibility isn't part of the item's identity. So re-saving never changes
the accessibility.

`getSecure` reads the new item first. If it is missing, it reads the old default-service item
and moves it: it writes the new one, reads it back, and only when it reads back equal does it
delete the old one. **It never deletes first.** Any failure removes the unverified copy, keeps
the old item and retries on the next read, and every token is read at launch. `deleteSecure`
deletes both homes. `AUTH_STORAGE_VERSION` is untouched, so nobody re-pairs.

## Widgets and the Live Activity (iOS)

The widgets and the Live Activity are built with **`expo-widgets` 58**. It is iOS only, and its
Android side is a stub. The `app.json` plugin entry names:

- the extension, `app.audiosilo.widget`;
- the App Group, `group.app.audiosilo`;
- the `ContinueListening` widget (`systemSmall`, `systemMedium`).

`withXcode26SwiftUICoreFix` is listed before it so that it runs after it, since the extension
links the same static pods. The app sends no push, so no target may carry `aps-environment`,
or every profile would need the Push Notifications capability. expo-widgets 58 adds it only
when asked, and `plugins/widgets-entitlements.test.ts` fails if it comes back.

**Widget functions.** `src/widgets/continue-listening.tsx` and `sleep-timer-activity.tsx` are
`'widget'` functions. babel-preset-expo turns each into a source string that the extension
evaluates in its own JavaScriptCore context, with `@expo/ui/swift-ui` as globals. So a widget
function:

- uses no hooks and nothing from module scope;
- imports only from those modules, under their original names;
- uses the system font;
- receives every string in props, already localized.

**What to write.** `widget-model.ts` (pure, tested) decides what to write and when:

- `continueListeningProps` holds the title, author, chapter, a cover file, the time left at
  the book's speed, progress, playing, and a deep link. The link is
  `audiosilo://player?connection=..&libraryId=..&path=..`, built from the player route's own
  `playerParams`, so a cold launch opens that book.
- `sleepActivityProps` holds the title, chapter, cover, `endsAt`, `pausedAt` and the deep link.

**Links into the app keep their encoding.** `src/app/+native-intent.tsx`
(`redirectSystemPath`, with the rule in `src/lib/native-intent.ts`, `appLinkPath`) turns an
`audiosilo://...` link into a plain path (`/player?...`) before Expo Router sees it. That
covers the widget, the Live Activity and the pairing link. Expo Router decodes an app-scheme
URL's query values and joins them back unencoded, which would split a path holding `&`, `#`,
`+` or `%XX` ("Austen/Pride & Prejudice"). With the rewrite, a path is decoded once, like an
in-app href. The development client's own links pass through as they are.

**Sync.** `widget-sync.ios.ts` (`startWidgetSync`, from the root layout) wires it up, and
`widget-sync.ts` is the no-op elsewhere.

- The widget is rewritten on a book, chapter, play or pause, or speed change, on a jump over
  30 s, on a stop, and once a minute while playing. Writes are coalesced to one per
  `MIN_WRITE_MS`.
- Covers are written into the widgets directory once per book, because the extension can't
  fetch. The widget gets the server's 320 px thumbnail and the activity gets 160 px; neither
  is asked of a server known to lack `cover_sizes`. Else the sync uses the cover the player
  shows: the downloaded one, or the streamed one, fetched. Each is written only when its
  header says it fits (`fitsCover`), because there is no resizer.
- Removing the widget's connection clears it.

**The Live Activity** starts only with the app in the foreground, which is ActivityKit's rule.
A timer armed in the background gets one on the next foreground. The activity is updated when
the end moves: an extension, a freeze while paused, a seek or speed change under an
end-of-chapter timer, or a new chapter. It is **ended immediately** when the timer fires or is
cancelled. The countdown is `Text(timerInterval:pauseTime:countsDown:)`, ticked by the system.
One the listener swiped away is not started again for that timer.

There is no playback Live Activity, because it would duplicate Now Playing. There are no
buttons either. expo-widgets has no `AudioPlaybackIntent`, so a widget button would run in the
extension and never reach the player.

**The store build needs** these, a one-time step of the
[app-store track](../contributing/releasing.md#the-app-store-track-ios--android):

- the App Group `group.app.audiosilo` registered with Apple;
- the extension's bundle id `app.audiosilo.widget` registered with the App Groups capability,
  and the group on both the app's and the extension's identifiers;
- EAS credentials for the app extension as well as the app, so both targets get a
  provisioning profile.

A dev build installed beside the store app needs its own ids for the app, the extension and
the group. [Testing](testing.md#on-devices) lists the edits.
