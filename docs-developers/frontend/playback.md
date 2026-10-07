---
title: Playback
description: "The player's hardest subsystem: the PlaybackService engines (HTML5, AVQueuePlayer, Media3), the whole-book timeline math, the stall→error watchdog, resume protection, web transcode negotiation, what plays next, the sleep timer and drift-offs, jump undo, the time-left rule, and the companion."
---

Playback is where this codebase earns its keep. The design splits into four
layers, each with a sharply-drawn contract:

```mermaid
flowchart TD
    ui["Player UI<br/>(player modal, mini-player, docked bar, seek bar)"]
    store["usePlayer store - src/playback/store.ts<br/>whole-book timeline, watchdog, resume guard, autosave"]
    svc["PlaybackService - src/playback/types.ts<br/>per-track transport interface"]
    web["service.web.ts<br/>HTML5 Audio + Media Session"]
    native["service.native.ts<br/>thin bridge"]
    mod["modules/audiosilo-player<br/>iOS: AVQueuePlayer · Android: Media3/ExoPlayer"]
    ui --> store --> svc
    svc --> web
    svc --> native --> mod
```

The engines only know about **tracks** (individual audio files) and report raw
transport state. Everything book-shaped - the whole-book timeline, chapters,
resume, error policy - lives in shared JS so all three platforms behave
identically.

## The `PlaybackService` interface

`src/playback/types.ts` defines the engine contract:

- `load(tracks, startIndex, positionInTrack, chapters?)` - replace the queue.
  `tracks` are `PlaybackTrack`s (URL, optional auth `headers`, metadata,
  optional `duration`). The optional `chapters` argument is a list of
  `PlaybackChapter` clips - an **Android-only** lock-screen concern (below); iOS
  and web accept and ignore it.
- `play` / `pause` / `seekTo(positionInTrack)` / `skipToTrack(index, pos?)` /
  `setRate` / `reset`.
- `swapTo?(…)` - optional gapless queue swap, used to move a streaming book onto
  its just-finished download without an audible gap (returns `false` when
  refused; see [Offline](offline.md)).
- `setVolume(volume)` - **required** linear output gain (0-1) applied to the
  engine's own volume, **not** the device volume. It exists for the sleep
  timer's fade-out on **duration** timers (below). It is deliberately not
  optional: both engines implement it, and the one real "no volume here" case is
  each engine's own private business, which it degrades internally (below).
  Callers pass an already-clamped value - `usePlayer.setOutputVolume` is the only
  route in and clamps once.
- `configure(config)` - runtime tunables from the settings store: auto-rewind
  window, lock-screen skip intervals.
- `getSnapshot()` / `subscribe(listener)` - a single merged
  `PlaybackSnapshot { state, trackIndex, position, duration, rate }`,
  **per-track** positions only. States: `idle | loading | ready | playing |
  paused | ended | error`.

Metro resolves the implementation per platform: `service.web.ts` on web,
`service.native.ts` on iOS/Android. `service.ts` is a **throwing fallback that
exists only so `tsc` can resolve the import** - it is never executed.

### Web engine (`service.web.ts`)

A single `HTMLAudioElement`, advanced manually on `ended` (no native queue). Key
points:

- The session token is already in the stream URL (`?token=` - see
  [State & data](state-and-data.md)), so the browser's own Range requests
  (seek/scrub) authenticate without headers.
- The **Media Session API** wires lock-screen/notification transport: metadata
  per track plus `play`, `pause`, `seekbackward`, `seekforward` handlers using
  the configured jump intervals.
- Auto-rewind on resume: `play()` rewinds by up to `autoRewindMax` seconds
  scaled by how long the pause lasted.
- Every element listener is guarded by an `active()` check so a second element
  being buffered by `swapTo` can't drive the snapshot until the switch commits.
- `swapTo` buffers the new (local) source on a **separate** element while the
  current one keeps playing, and only switches once `isSwapReady` holds
  (`readyState >= HAVE_FUTURE_DATA` and the playhead is within ~1.5 s of the
  target - exported pure so it's unit-testable). It refuses outright when the
  target is a synthetic `…/_offline/…` URL and no service worker controls the
  page (the URL would 404 and kill playback), and treats an 8 s buffering
  timeout as a failed swap.
- A **transcoded** track (`track.transcoded`, web only) is re-requested on every
  seek instead of seeking the element, and its position is reported
  track-absolute - see [Web transcode negotiation](#web-transcode-negotiation-transcodets).

### Native bridge (`service.native.ts`)

Deliberately thin: it forwards calls to the `AudiosiloPlayer` module and merges
the module's three event streams (`onState`, `onProgress`, `onTrackChange`) into
**one snapshot that is re-emitted on every event**. The module's state strings
match `PlaybackState` 1:1. That merged-snapshot behavior is why the store must
not interpret individual engine events (see the watchdog section) - a stale
field rides along with every fresh one.

## The native module (`modules/audiosilo-player`)

A local Expo module - Swift (`ios/AudiosiloPlayerModule.swift`) and Kotlin
(`android/…/AudiosiloPlayerModule.kt` + `AudiosiloPlayerService.kt`). It owns
the audio session, background audio, lock-screen/remote commands, gapless
multi-file playback and pitch-corrected speed. It can only be validated by a
**device rebuild** (`npx expo run:ios` / `run:android`) - a JS reload does not
reload native code.

### iOS: AVQueuePlayer

`AudioEngine` in `AudiosiloPlayerModule.swift` drives an `AVQueuePlayer`
(`.playback` session, `.spokenAudio` mode, `.longFormAudio` policy;
`audioTimePitchAlgorithm = .timeDomain` for pitch-corrected speech speed). Auth
headers are injected per asset via the undocumented
`"AVURLAssetHTTPHeaderFieldsKey"` option - the only mechanism AVFoundation
offers, so if Apple changes it, native stream auth breaks.

The hard-won behaviors, each guarding against a specific OS quirk:

- **Deferred start seek (`pendingSeek` / `applyPendingSeek`).** Seeking a
  freshly-created `AVPlayerItem` before it reaches `.readyToPlay` is *silently
  dropped* (especially for streaming assets) - this made resume start from 0.
  `rebuildQueue` stores the target as `pendingSeek` and applies it via a status
  KVO once the item is ready.
- **`wantsPlay` gating.** If `play()` arrives while a `pendingSeek` is still in
  flight, the engine records the intent, reports `loading`, and starts the
  player **only in the seek's completion handler** - so audio never briefly
  plays from 0 before jumping. `skip(to:)` routes through `play()` for the same
  reason.
- **Progress suppression during (re)load.** The 1 Hz progress timer emits
  nothing while `pendingSeek != 0` or the current item isn't `.readyToPlay` - a
  fresh item reads `currentTime() == 0`, and emitting that would clobber the
  saved position in JS (this made a retry after a failed reload resume from the
  start).
- **One real-state toggle for remote commands.** A single earbud/headset press
  is a *toggle*, but iOS delivers it as a discrete Play **or** Pause chosen from
  iOS's own notion of the app's play state - which a third-party app cannot
  correct (`MPNowPlayingInfoCenter.playbackState` is entitlement-gated and
  silently ignored, so iOS infers the state itself and can get stuck on
  "paused"). When iOS guesses wrong it sends Play while already playing and the
  press no-ops - the "pause needs two presses" bug. Fix: `playCommand`,
  `pauseCommand` and `togglePlayPauseCommand` **all route through
  `togglePlayback()`**, which flips from the real `timeControlStatus` (a pending
  `wantsPlay` counts as playing).
- **Interruption auto-resume only when it should.** `wasPlayingBeforeInterruption`
  is captured *before* pausing on `.began`; `.ended` auto-resumes only if that
  flag is set **and** the interruption carries `.shouldResume`. Without the
  flag, the charging chime (a brief system interruption whose `.ended` carries
  `.shouldResume`) resumed books the user had paused.
- **Failures are reported as sustained `loading`, never `error`.** A failed
  item parks the player at `.paused` (which would read as a user pause), so the
  engine watches item `.failed` status, `failedToPlayToEndTime`, and
  `playbackStalled` and reports `loading` for all of them. The **shared JS
  watchdog** owns the promotion to `error` after a uniform grace - an instant
  native error caused a rapid-retry race.
- **Rate re-assertion (`reassertRateWhenReady`).** AVPlayer can silently drop a
  rate set on a not-yet-ready item back to 1.0 once it becomes ready (seen when
  a mid-playback download swap replaced the streaming item); the engine watches
  the fresh item and re-asserts the intended rate.
- Misc: headphones unplugged (`oldDeviceUnavailable`) pauses; queue rebuilds set
  a `rebuilding` flag that suppresses the transient state/track events
  `removeAllItems` fires; Now Playing metadata + artwork (fetched with the auth
  headers via `URLRequest`) are maintained manually.

### Android: Media3 / ExoPlayer

Playback lives in a `MediaSessionService` (`AudiosiloPlayerService`) so it
survives backgrounding; the Expo module talks to it through a `MediaController`
on the main thread. Media3 renders the notification/lock-screen UI itself.

**Chapters are clipped media items (Audible-parity lock screen).** When the JS
side passes chapter clips to `load`, each chapter becomes a `MediaItem` with a
`ClippingConfiguration` over its file's URL (`toClipItem`), titled with the
chapter. The system scrubber is therefore **chapter-relative**, and the standard
`COMMAND_SEEK_TO_{NEXT,PREVIOUS}_MEDIA_ITEM` buttons become **prev/next
chapter** for free.

- **`ChapterMap` keeps the bridge contract file-based.** The JS store and iOS
  think in `(fileIndex, positionInFile)`; the Android engine plays clip items.
  `ChapterMap.fileToItem` maps a file-relative position to `(clip index,
  clip-relative ms)` and `itemToFile` maps back. `load`, `seekTo`,
  `skipToTrack`, the progress loop and `onMediaItemTransition` all translate
  through it, so the reported positions (and durations - per-file durations are
  cached in `fileDurations`) are indistinguishable from file mode. The wire
  contract between JS and native never changed.
- **30 s skip buttons are custom session commands** (`audiosilo.SEEK_BACK` /
  `audiosilo.SEEK_FORWARD`), granted in `MediaSession.Callback.onConnect` and
  executed in `onCustomCommand` as `player.seekBack()/seekForward()`. They are
  **not** the standard `COMMAND_SEEK_BACK/FORWARD` - those map to the legacy
  `ACTION_REWIND`/`ACTION_FAST_FORWARD`, which the modern Android media UI
  silently ignores (`dumpsys media_session` showed `custom actions=[]` and no
  buttons). The buttons use Media3's **predefined** `CommandButton` icons
  (`ICON_SKIP_BACK_30` / `ICON_SKIP_FORWARD_30`, available since Media3 1.5.0),
  so no app-shipped drawable and no icon-less action for newer Android to drop.
- **Registered with `setCustomLayout`, not `setMediaButtonPreferences`.** The
  slot-based preferences API capped the Media3 1.5.1 notification at 3 actions
  (it drops the secondary slots - verified via `dumpsys notification`,
  `actions=3`). `setCustomLayout` makes the notification provider emit the
  standard `[prev, play/pause, next]` row automatically (from the player's
  available seek-to-prev/next commands) **plus** the custom skip buttons - all
  5 actions alongside the draggable chapter scrubber, device-verified on a
  Pixel (`actions=5`).
- **`AudiobookPlayer` (a `ForwardingPlayer`)** wraps the ExoPlayer so audiobook
  behavior applies regardless of where a command originates (lock screen,
  notification, headset, JS bridge): **auto-rewind on resume** lives in its
  `play()` (reading the live Settings value from `PlayerConfig`), `prepare()`
  resets the pause baseline so a fresh book never inherits the previous one's
  pause time, and **prev/next are hidden only when there is a single media
  item** (a chapterless single-file book, where "previous" could only restart
  the book).
- **`SimpleCache` keeps clipped streaming gapless.** Chapter clips of a
  single-file m4b re-open the *same URL* at each boundary; a process-lifetime
  64 MB LRU `SimpleCache` + `CacheDataSource` means those re-opens hit
  already-downloaded bytes and the parsed container header instead of the
  network - no audible gap (device-verified). Local `file://` sources bypass
  the cache. Auth headers are injected at request time from `AuthHolder` (one
  bearer token per book, set on every `load`).
- The app logo is the notification small icon
  (`DefaultMediaNotificationProvider.setSmallIcon` +
  `res/drawable/ic_notification.xml`).
- `onTaskRemoved` records a "swiped away from recents" flag in shared prefs;
  the JS layer reads it via `consumeTaskRemoved()` on foreground and resets to
  Home (matching iOS's cold-start behavior). iOS's implementation of
  `consumeTaskRemoved` always returns `false` - bridge parity only.

Android has **no deferred-seek problem**: Media3's
`setMediaItems(items, startIndex, startPositionMs)` honors the start position
natively.

## Building the queue: `book-queue.ts`

`buildBookQueue(api, libraryId, book, chapterData?, local?, virtualChapterInterval?, transcode?)`
turns a book + its `/chapters` response into a `BookQueue { tracks, offsets,
total, chapters, chapterClips, syntheticChapters }`.

**Track building rules (`bookFileSpecs`)** - the single source of truth for a
book's playable files, shared with the download engine so download order ≡ play
order:

1. An explicit file list (`chapterData.files`, else `book.files`), sorted by
   `seq`;
2. else the **distinct `file_path`s referenced by the chapters**, in first-seen
   order (durations estimated from the largest chapter `end` per file);
3. else the book's own `rel_path` as a single file.

:::danger Stream the file, never the book
A track URL must be a real audio *file* (a chapter's `file_path` or a
`BookFile.rel_path`) - never a folder/book path. Streaming a folder path is what
produced the iOS MediaToolbox `-12864` failures. This is invariant
[#4 of the workspace golden rules](../architecture/invariants.md).
:::

When `local` is supplied (the book is downloaded), each file's track points at
its local URI instead of `api.streamUrl(...)`, and auth headers are dropped for
local tracks. On web, tracks carry no headers at all (the token is in the URL);
on native they carry `api.authHeaders()`. With `transcode` (decided by
`playBook`, web only - [below](#web-transcode-negotiation-transcodets)) every
non-local track's URL is `streamUrl(…, { transcode: true })` and the track is
flagged `transcoded: true`; the flag is only present when set, so a direct
stream's track is exactly what it always was, and a local file is never
transcoded.

Other queue math that lives here:

- **`chapterBookOffset`** recomputes every chapter's whole-book offset from the
  client's own file durations plus the in-file `start`, locating the file **by
  `file_path` first** with a bounds-checked `file_index` fallback. The server's
  `book_offset` is deliberately ignored - it comes back 0 for every chapter on
  some on-demand-indexed books, which made chapter detection resolve to the
  last chapter.
- **`buildChapterClips(specs, chapters)`** produces the Android clip list: one
  clip per chapter mapped to `(fileIndex, [startInFile, endInFile])`; the last
  chapter in each file clips "to end" (`endInFile = 0`) so an inaccurate final
  `end` can't cut off the file's tail. It returns `[]` for **0 or 1 chapters**
  (the engine then plays one item per file - plain file mode) and `[]` if *any*
  chapter can't be mapped to a file, so a partial clip queue can never strand
  playback. Returning `[]` for single-file books is also the documented safety
  fallback if a future device regresses on gapless clips.
- **`synthesizeChapters`** overlays evenly-spaced *virtual* chapters (default
  interval 30 min, a user setting) on a long, chapterless single-file book so
  prev/next-chapter and the chapter-relative seek bar have somewhere to go.
  Synthetic chapters are computed **after** `chapterClips` and never fed to it,
  so native playback is unchanged; `BookQueue.syntheticChapters` flags them.
- **`locate(offsets, bookPosition)`** and **`toBookPosition(offsets, index,
  positionInTrack)`** convert between the whole-book timeline and per-track
  coordinates; **`chapterAt`** finds the active chapter by `book_offset`;
  **`chapterCountdowns`** feeds the sleep sheet's "Or stop after" rows
  (wall-clock times scaled by the playback rate via `rate.ts`
  `wallClockSeconds`), and **`nextChapterEnd`** answers the sleep timer's "where
  does the next worthwhile chapter end?" from the same `chapterEndPosition`, so
  the list the listener picks from and the boundary a shake retargets cannot
  disagree. Neither assumes the chapters ascend by position - `chapterBookOffset`'s
  out-of-range `file_index` fallback degrades to 0 preceding files, so stale or
  duplicated metadata yields non-monotonic ends; `chapterCountdowns` locates the
  current chapter with `chapterAt` and `nextChapterEnd` takes the **nearest**
  qualifying end rather than the first qualifying array element.

`total` is the max of the book's reported duration, the summed file durations,
and the furthest chapter end - so `duration: 0` metadata degrades instead of
breaking the seek bar.

## The player store (`store.ts`)

`usePlayer` (Zustand) is the only consumer of the engine. Its snapshot is
per-track; the selectors map to the whole-book timeline:

- `selectBookPosition` = `toBookPosition(queue.offsets, snapshot.trackIndex,
  snapshot.position)`;
- `selectCurrentChapter` overlays `queue.chapters` on that position by
  `book_offset`. The full player's seek bar is **chapter-relative**.

Actions: `playBook`, `toggle`, `pause`, `retry`, `seekBook`, `seekInTrack`,
`goToTrack`, `skipSeconds`, `setRate`, `stop`. `seekInTrack`/`goToTrack` exist
for books whose file durations are unknown (no reliable whole-book timeline).
Speed is clamped to 0.5–2×.

The store is the part of playback the player redesign promised **not** to
redesign (decision 7 in the workspace's `PLAYER-REDESIGN-PLAN.md`: new views over
the same store, engine changes only in Phase 6). Phase 3 changed it in exactly two
places, each with its own regression tests: `playBook` decides the
[web transcode flag](#web-transcode-negotiation-transcodets), and
`maybeAutoDownloadCurrent` gained [three rules](#auto-download-on-play).
Everything else Phase 3 added - [what plays next](#what-plays-next-up-next-resolverts),
[jump undo](#undo-a-jump-jump-undots), [drift-offs](#fell-asleep-drift-controllerts),
[time left](#time-left-time-leftts) - sits **outside** the store and reads it
through selectors and `usePlayer.subscribe`.

One important gate lives in the *screens*, not the store: **playback starts
only after the chapters/files query has settled** (the player screen waits for
`useChapters`). Starting early made multi-file books stream the folder path and
lose chapter info.

### The stall → error watchdog

The single most battle-scarred piece of the store. Design rules, in order of
importance:

1. **It is armed by the play/retry *action*, not by interpreting engine
   events.** `beginPlaybackAttempt()` (called from `playBook`, `retry`, and the
   play half of `toggle`) sets two module-level flags - `wantsPlayback` (we
   intend to be playing) and `startingPlayback` (an attempt is in flight) - and
   starts a `STALL_GRACE_MS` (3 s) timer. When the timer fires, the test is
   simply *"are we `playing`?"* - so no transient state the bridge left behind
   can prevent it from firing. If not playing, the store synthesizes
   `state: 'error'`, clears intent, and persists progress.
2. **While `startingPlayback`, every incoming state except `playing`/`error`
   collapses to `loading`.** On a resume/retry, `service.native.ts` re-emits
   its merged snapshot for every event and iOS delivers
   `timeControlStatus`/status KVO asynchronously - the store sees a jumble of
   `ready`, frozen `onProgress` ticks carrying `loading`, and a spurious
   `paused` (an async `.paused` from the queue rebuild that escapes the native
   `rebuilding` guard). Interpreting those individually failed three separate
   ways (an error that flashed then reverted; a dead `ready` play button; a
   spinner whose watchdog never armed because the spurious `paused` cleared
   intent). Collapsing to `loading` shows a spinner and lets the action-armed
   watchdog guarantee resolution. A genuine user/lock-screen pause always
   arrives *after* `playing` (when `startingPlayback` is already false), so it
   still reads as `paused`.
3. **A surfaced `error` is held against everything except `playing`.** After
   the watchdog (or a real web/Android engine error) lands, the engine keeps
   re-reporting around the dead stream - iOS with frozen `loading` ticks,
   Android with `onPlayerError` → `STATE_IDLE` → `idle` plus progress ticks.
   `subscribe` drops **every** incoming state except `playing` while the
   previous state is `error` and no retry is in flight. This is
   suppress-all-but-`playing`, deliberately **not an allow-list** - enumerating
   the noisy states (`loading`, `ready`, `idle`, `paused`, …) bit the project
   repeatedly (the Android flash→spinner loop). The hold is released by a retry
   (`wantsPlayback` flips true) or a genuine `playing`.
4. **The engines never decide `error` on iOS.** iOS reports every failure shape
   (`.failed` item, failed-to-end, buffer stall) as sustained `loading`;
   web/Android may emit a real `error` directly, with the watchdog as the
   backstop for a buffer that never resolves. Recovery is `retry()`, which
   *reloads* the queue at the known-good position - a dead `AVPlayerItem`
   cannot be revived by `play()` alone.
5. One extra normalization: an engine `loading` arriving when we do **not**
   intend to play (no attempt in flight, so no watchdog armed) is read as
   `paused` - iOS reports a failed item as `loading` even while the user has
   the book paused, and leaving it would strand an endless spinner with no
   retry button.

Keep all of this in shared JS; do not re-add a per-engine native timer.

```mermaid
stateDiagram-v2
    idle --> connecting: playBook / retry / toggle-play - beginPlaybackAttempt() arms 3s watchdog
    connecting --> playing: engine reports 'playing' (watchdog cancelled, save loop starts)
    connecting --> error: watchdog fires - still not 'playing' after 3s
    playing --> connecting: mid-playback stall ('loading' while wantsPlayback re-arms)
    playing --> paused: user / lock-screen pause (arrives after 'playing')
    playing --> ended: last track finishes
    error --> connecting: retry() reloads queue at max(resumeFloor, position)
    paused --> connecting: toggle-play (new attempt)
    note right of connecting
        while startingPlayback every state
        except playing/error renders as
        'loading' (spinner)
    end note
    note right of error
        held against every re-report
        except a genuine 'playing'
    end note
```

(`connecting` above is the store's `startingPlayback` window; the snapshot the
UI sees during it is `loading`.)

### Resume protection

"Never restart an in-progress book from 0" is enforced twice - once on the way
in, once on the way out:

**On the way in - `loadInitialProgress` (`progress-sync.ts`)** returns a
discriminated `ResumeLookup` reconciling three sources by `updated_at`
(newest wins): the server's record, a **durable local mirror**, and the offline
replay queue.

- `progress` - a saved position exists somewhere; `playBook` resumes from it
  (and restores the saved playback speed).
- `empty` - the server answered (HTTP 200) and there is no record anywhere: a
  genuinely new book, start at 0.
- `failed` - the server was unreachable **and** there is no local record. For a
  *streaming* book, `playBook` fails safe: it sets `state: 'error'` (with
  `resumeLookupFailed` recorded so `retry()` re-runs the lookup rather than
  reloading at a stale 0) instead of playing - starting at 0 here would both
  restart the book and let a later save overwrite the real position. For a
  *downloaded* book, `failed` means offline-first and never started: 0 is
  correct.

The mirror (`writeMirror`, key `audiosilo.progressMirror`) is written on **every
save and every successful server read**, keep-newest by `updated_at`, and -
unlike the replay queue - is **never pruned on sync**. It exists precisely so a
flaky resume fetch can't lose the position (the beta "book restarted from the
beginning" report).

**On the way out - the `resumeFloor` save guard (`store.ts`).** The whole-book
position we actually resumed from is kept as a running high-water mark;
`persist` refuses to save a position more than `SLIP_TOLERANCE` (60 s) *below*
the floor. Only a deliberate user seek/jump lowers the floor (`lowerFloorTo` in
`seekBook`/`seekInTrack`/`goToTrack`). Because the server is last-write-wins, a
slipped-through restart-at-0 with a fresh timestamp would otherwise permanently
overwrite real progress - the guard makes that write impossible. `retry()` also
reloads at `max(resumeFloor, currentPosition)` so a transient 0 in the snapshot
can't be re-loaded.

### Progress autosave and sync triggers

- A 15 s interval save loop (`SAVE_INTERVAL_MS`) runs **only while actually
  playing** - it is started by the engine's `playing` transition and stopped by
  `paused`/`ended`/`error` (via `haltAndPersist`), which covers lock-screen
  pauses and books that simply finish without a `stop()` call.
- Additional saves fire on every seek (`seekBook`/`seekInTrack`/`goToTrack`),
  on `setRate`, and on `stop`.
- Saves go through `saveProgress` (`progress-sync.ts`): mirror first, then the
  network if reachable, else the offline replay queue (latest save per book).
  `finished` is set within 5 s of the end; each save carries
  `version: 0`, a per-install `device_id` and a capture-time `updated_at` so
  the server's last-write-wins reconciliation (and offline replays) order
  correctly. Details in [State & data](state-and-data.md).
- Listening **history spans** are recorded around the same transitions:
  a span opens on `playing`, closes on leaving `playing` (or on a mid-playback
  track change, so each file logs as it finishes), ignores spans under 20 s,
  and is skipped entirely while the server is unreachable.
- When playback halts, the store invalidates the `['progress', 'all']` query so
  the Home/Browse "continue listening" and "finished" lists re-read from the
  server - without invalidating on every 15 s save.

One more store responsibility worth knowing about: when a download completes
for the book that is currently streaming, the store hot-swaps playback onto the
local files (`switchCurrentBookToLocal`, preferring the engine's gapless
`swapTo`) - covered in [Offline](offline.md).

## Web transcode negotiation (`transcode.ts`)

Browsers can't decode some codecs a book may use (AC-3, ALAC, WMA...). The
server marks those books `direct_playable: false` and, when it has ffmpeg
(capability `transcode`), streams them re-encoded to MP3 with
`?transcode=1&t=<seconds>` ([cross-repo contract §5](../architecture/cross-repo-contract.md#5-transcode-negotiation---direct_playable--transcode1)).
The web player negotiates that by itself; native engines decode these codecs and
never transcode, and a downloaded (local) file is never transcoded either.

**The rule** is pure and lives in `src/playback/transcode.ts`:

- `isBrowserUndecodable(book, chapterData?)` - only an **explicit**
  `direct_playable === false` counts (the chapters response is preferred, being
  fetched fresh for playback). An older server omits the field and an unprobed
  codec reads as playable; both stream exactly as before.
- `needsWebTranscode(os, book, chapterData, canTranscode)` - `os === 'web'`, the
  capability is `true`, and the book is undecodable. An **unknown** capability
  (`/server` not loaded) reads as no: stream directly, and the error/retry path
  speaks if the browser can't play it.

**Reading the capability** is `src/playback/transcode-capability.ts`, kept apart so
the rule stays framework-free: `mayNeedWebTranscode` is the cheap synchronous
pre-check (false off web and for every ordinary book, so they skip the lookup and
its await), `resolveWebTranscode` reads `capabilities.transcode` through the shared
`serverInfoQuery` (normally a cache hit; a failed read falls back to the cached
value, else "no"), and `webTranscodeFromCache` is the synchronous form for the
download path.

**Where it's decided:** once, in `playBook`, before `buildBookQueue` - and only for
a streaming book (`!local && mayNeedWebTranscode(…) && await resolveWebTranscode(…)`).
The queue then carries `transcoded` tracks, so every later reload (`retry`, seeks)
reuses them without asking again.

**The web engine** (`service.web.ts`) is where the work is. Transcoded output has no
byte ranges and no length the `<audio>` element can know (`duration` reads
`Infinity`/`NaN`), so:

- `sourceFor(track, positionInTrack)` (pure, exported) returns the element's source
  and the **offset** its `currentTime` 0 stands for: a direct stream is its own URL
  at offset 0; a transcoded one is requested *at* the position
  (`transcodeUrlAt(url, t)` replaces any `t` and keeps every other param, the media
  token included) with that `t` as the offset.
- Every seek, auto-rewind, and resume after a pause longer than
  `TRANSCODE_STALE_PAUSE_MS` (30 s, a paused back-pressured transcode may have been
  dropped by the server or a proxy) goes through `reloadTranscodedAt`, which
  re-runs `loadTrack` at the target. `loadSeq` lets a stale `loadedmetadata` handler
  (a second seek before the first source loaded) no-op, and `pendingAutoplay` keeps
  play intent across the `loading` window that now recurs on every seek.
- The snapshot's `position` stays **track-absolute**: `transcodedTrackPosition`
  returns `currentTime + offset`, clamped to the queue's known file duration (the
  encoder can run a frame past it, which would read as the next file's first
  instant). The duration always comes from the queue (`track.duration`), never the
  element.
- The rate is applied as `defaultPlaybackRate` *and* `playbackRate`
  (`applyRate`): the media element load algorithm resets `playbackRate` on every
  `src` change, which a transcoded seek is.
- An `ended` well before the known end (`isEarlyTranscodeEnd`, more than
  `EARLY_END_SLACK_S` = 10 s short) is the connection dying, which an unsized
  stream reports as a normal end: the engine reloads at the position instead of
  skipping the rest of the file, and accepts a second early end without
  `EARLY_END_MIN_PROGRESS_S` (5 s) of progress as the real end (a file whose audio
  is shorter than its probed duration).
- The Media Session gets a `seekto` handler (only for transcoded tracks; direct
  streams keep the browser default) so the OS scrubber re-requests too, and an
  explicit `setPositionState` with the track-absolute position and known duration,
  cleared again once a direct track plays.

:::info Why the offset keeps positions track-absolute
Everything above the engine assumes `snapshot.position` is the position **in the
file**: `selectBookPosition` (`toBookPosition(offsets, trackIndex, position)`),
chapter detection, the `resumeFloor` save guard, progress saves, the sleep timer's
chapter targets and jump-undo's detector. If a transcoded seek let `currentTime`
restart at 0, every one of them would see the book jump backwards on each seek -
the save guard would refuse the saves, the chapter would read as the first, and a
jump chip would appear. Folding the offset in at the engine keeps the transcoder
invisible to the store (decision 7).
:::

**Downloads:** a book that streams transcoded on web must not be downloaded raw (its
files would not play offline in that browser). `useDownloads.download()` refuses it
(`webTranscodeFromCache`), which covers every path - the book page, the automatic
download and keep-ahead - and `useDownloadControls` exposes `needsTranscode` so the
control says "Can't download in this browser" instead of the generic "Downloads
unavailable". A download already on disk (or errored) stays manageable.

**The book page** shows `TranscodeNote` (`src/components/library/transcode-note.tsx`)
under the stats ("AC-3 audio is converted to MP3 for this browser"), under exactly
`needsWebTranscode` and never for a downloaded book; `codecLabel` maps ffprobe names
(`ac3` → AC-3, `wmav2` → WMA...) and falls back to upper case.


## Ending a book: end credits and up next

When the last track finishes the engine reports `ended`, and the store
**deliberately keeps `nowPlaying` populated** rather than tearing down - the
`ended` snapshot is a signal a UI-layer listener acts on. `selectIsEnded`
(`snapshot.state === 'ended'`) exposes it; the final `haltAndPersist` on that
transition records `finished: true`.

- **`finishBook()` (`store.ts`)** is the single "this book is done" action, used
  both by the natural end and the player's *Mark as Finished* menu item. It
  captures a `FinishedBook` identity (connection/library/path/title/author/cover),
  clears playback intent, stops the save loop, does one forced
  `persist({ forceFinished: true })` (the last write; the server is
  last-write-wins), invalidates the connection's `allProgress` query, then
  **nulls `nowPlaying`** (which hides the mini-player) and resets the snapshot.
  Best-effort and async, it tears the engine down and - **only if
  `autoDeleteFinished` is on and the book's download `status === 'downloaded'`** -
  removes the local files via the downloads store.
- **`BookEndedListener` (`src/components/player/book-ended-listener.tsx`)** is a
  headless component mounted once in `src/app/_layout.tsx`, so it covers the phone
  modal and the desktop docked player alike. It watches `selectIsEnded` with
  **transition-edge detection** (a `wasEnded` ref, fires once per ended book) and
  on the false→true edge calls `finishBook()` then navigates to
  `finishedHref(…, true)` (`/finished?…&auto=1`): `router.replace` when currently on
  `/player` (credits take the player's place), else `router.push`. If the app is
  **backgrounded** and `autoPlayNext` is on it skips the credits, asks
  `resolveUpNext` (the same answer the credits would give) and jumps straight to the
  player (on iOS the OS may suspend JS once audio stops, so a visible countdown
  can't be relied on), falling back to the credits when nothing is next.
- **`/finished` (`src/app/finished.tsx`)** is a root modal, a sibling of the
  player modal, that carries `connection`/`libraryId`/`path` params (it sits
  outside any route scope) and renders `EndCredits`. `auto=1` (the natural end, or
  *Mark as Finished*) becomes `ended`: the book is finished. Whether the book is
  **still playing** (the credits opened early from the menu) is derived from the
  live player store, not the URL: loaded and not in `ended`, which covers a paused
  or errored book too, so a lock-screen pause can't read as "over" and auto-advance
  mid-listen.
- **`end-credits-logic.ts`** is the pure part: `endCreditsDecision` - with
  `autoPlayNext` on and a next book resolved, count down `GRACE_SECONDS` (15) after
  a real end, or the remaining audio while the book still plays, and only report
  `fireNext` after a genuine end; `listeningSummary` (wall-clock time listened and
  local days, from `client.history(…, HISTORY_LIMIT)`, 500, the server's cap, with
  `partial` when that many came back); `yearShelf` (this year's other finished books
  from `/me/stats?range=year`, and which book of the year this one is - the stats
  may not count it yet); `nextAvailability` (downloaded / downloading / stream);
  `upNextReason` (the card's eyebrow); `spinesThatFit`.
- **`end-credits.tsx` + `end-credits-parts.tsx`** render it: the year shelf (else the
  cover), title and byline, the stat tiles, a `RatingStars` radio group (capability
  `ratings`; a PUT carries the saved note so rating doesn't clear it), the
  `UpNextCard` (Play now, Not now, the countdown ring), `EndOfSeries` (an unplaced
  community work as a `GhostCover`, never played) and the `CreditsDialog` (the
  community credit is the server's, never composed here; `/meta` is fetched only
  once the dialog opens). Every hook runs against the book's own server
  (`ConnectionScope`).

### What plays next (`up-next-resolver.ts`)

`resolveUpNext(sources, finished)` is the **one** answer to "what plays after this
book", shared by the credits' Play now and countdown and by the background
auto-play in `BookEndedListener`. It is framework-free and must not import the
playback store; the server reads are injected as `UpNextSources`
(`up-next-sources.ts` builds the real ones over the shared query cache, reading the
queue fresh since another device may have changed it), so every rule is tested
without a server. In order:

1. **The head of the finished book's server's Up next queue** (capability `queue`):
   `pickQueueHead` skips the finished book itself (`entryHolds`: an entry may be the
   book folder above a part path), entries the server could not index (no `book`)
   and books already finished (from `allProgress`).
2. **Else the server's answer**, `GET /libraries/{id}/next` (capability
   `next_book`): community order, then series, then folder. Its "nothing follows"
   stands. A community work it could not place (`work` without `local`) is never
   played, only reported as `unplaced` so the credits can show it as a ghost.
3. **Else the folder's next sibling** (`resolveNextBook`, below) - on a server
   without `next_book`, or when asking it failed.

It never rejects: a source that fails is skipped. The result is an `UpNextBook`
with its `source` (`queue | series | folder`), its own `libraryId` (a community
answer can be in another library), and, for a queue head, the `queueEntry` by its
stored path. **Keep-ahead plans in the same order** (queue, then the `next_book`
chain, else the folder), so the book kept ready is the book that plays.

**Leaving the queue** is `useQueueDrop(connectionId)`
(`src/components/player/use-queue-drop.ts`): it looks the books up in that
connection's queue (the cached one, else one read on a server known to have
`queue`), removes each by the stored entry's own path, and is quiet - housekeeping
never toasts or reaches the reachability tracker. The credits drop the finished book
when opened with `ended`, and the queue entry that plays (plus a book finished by
an early Play now); `BookEndedListener` drops the finished book when the credits
were already open, and both books on the background auto-play path. The listener
keeps the last loaded book's connection in state, because `finishBook` clears
`nowPlaying` before the next book is resolved.

### Sibling resolution (`next-book.ts`)

The folder fallback. `resolveNextBook` browses the parent folder via
`client.browse` (paging to exhaustion, `PAGE_LIMIT` 200); `findNextSibling` keeps
entries that are `is_book || is_dir` (an unindexed sibling book folder comes back
`is_dir: true, is_book: false` and must still count, while loose non-audio files
are ignored), sorts them with `naturalCompare`, and returns the first whose name
sorts strictly after the current leaf:

```ts
export function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
```

The sort is **client-side and numeric-aware** so `Book 2` precedes `Book 10`
(the server's `/fs` listing is a plain string order). It never throws - any
failure resolves to `null`. The server's
[`GET /libraries/{id}/next`](../server/api/reference.md#get-apiv1librariesidnext)
ends in the same rule (`library.NextSibling`, a port of `findNextSibling` that
compares names as this `localeCompare` does), so the answer doesn't change when a
server gains `next_book`.

### Auto-download on play

`maybeAutoDownloadCurrent(connectionId, libraryId, book, chapterData?)` in
`store.ts` downloads **the book the user just started listening to**. It is
fired fire-and-forget at the end of `playBook`'s start path, after `svc.play()` -
never awaited, so it can neither delay nor break starting the book. Because the
store hot-swaps playback onto the local files the moment a download completes
(`switchCurrentBookToLocal` - see [Offline](offline.md)), downloading on start
also covers a series: the next book downloads as soon as it starts.
(An earlier design prefetched the next sibling at 90% of the current book; that
is gone.)

Guards, in order: `autoDownloadNext === 'never'` skips; an existing download
entry whose `status` isn't `error` skips (already downloaded, queued, or
downloading - only an errored entry is retried, matching the downloads store's
own guard); a **declined** book skips; the network policy `canAutoDownload(mode)`;
the **reserve**; and the download is enqueued **as `'auto'`**. Those three rules
(added in Phase 3, the store's one behaviour change besides transcoding) make it
agree with
[keep-ahead](offline.md#keep-the-next-books-ready-keep-aheadts--keep-ahead-controllerts):

1. **A declined book is skipped** - one the listener cancelled or removed this
   session (`isDeclined`), so starting it again doesn't re-download what they
   just threw away.
2. **The reserve is kept** - `roomLeft(storageEstimate, pendingBytes)` (the same
   `free - pending - reserveBytes(capacity)` keep-ahead plans with) must cover the
   book's `estimateBytes`; an unknowable room lets it start, as keep-ahead starts
   one at a time.
3. **It asks as `'auto'`** (`DownloadOrigin`): the default `'listener'` origin
   lifts a declined mark, as if the listener had asked. The Downloads page shows an
   `auto` download like the listener's own.

The downloads store's `download()` itself no-ops when the engine can't store
offline (e.g. web without a controlling service worker) or the book streams
transcoded on web, so no extra support guard is needed. `next-book.ts` does
sibling resolution only.

The policy gate is `canAutoDownload(mode)` in `src/lib/network.ts`, backed by
**`expo-network`**: `never` → false, `always` → true, and `wifi` allows web (the
browser can't report the connection type) plus native `WIFI`/`ETHERNET`, and
**fails open** on an `UNKNOWN`/undefined type or a probe error, so only a
positively-known metered connection is skipped. The three settings
(`autoPlayNext`, `autoDownloadNext`, `autoDeleteFinished`) live in
`src/stores/settings.ts` with defaults `false` / `'wifi'` / `true` - the
persisted `autoDownloadNext` key name predates the download-on-start behavior
and is kept for hydration compatibility.

## The sleep timer (`sleep-timer.ts`)

`useSleepTimer` is a second Zustand store, deliberately framework-free. It reads
`usePlayer` through `getState()` and subscribes to it for exactly one thing -
"is the transport running?", which freezes a duration countdown while playback is
paused (see below). It arms three ways - `startDuration(minutes)`,
`startUntilPosition(position, label)` and `startChapterTimer(opts?)` - which all
funnel through one private `arm()` that restores the volume, clears the
ending/grace flags and restarts the 1 s tick. The tick counts down, fires, and
expires the grace window; nothing else drives the machine. The sleep sheet's
"Or stop after N chapters" rows (`sleep-sheet-model.ts` `stopAfterRows`, real
chapters only, never the synthetic 30-minute ones) arm through
`startUntilPosition(endPosition, label)` with the `afterChapters` label, and its
"End of chapter" tile shows the countdown of `chapterTimerTarget` - exported so
the tile and the timer it starts compute one target.

```mermaid
stateDiagram-v2
    idle --> running: startDuration / startUntilPosition / startChapterTimer
    running --> ending: remaining <= FADE_SECONDS (30 s) - duration timers ramp the gain down at 4 Hz
    ending --> running: backward seek pushes the target back out of the window, or the countdown freezes
    ending --> grace: fire() - pause first, then restore the gain
    grace --> idle: closeGrace() - GRACE_SECONDS (30 s) elapsed, no shake - records 'expired' (+ fellAsleep unless stirred)
    ending --> running: keepListening() re-arms from origin
    grace --> running: keepListening() re-arms from origin AND resumes playback
    running --> idle: cancel() - records 'cancelled'
    running --> idle: a freeze longer than ABANDON_AFTER_PAUSE_SECONDS - records 'expired'
```

Every edge back to `idle` goes through `endTimer(reason)`, which notifies the
`onSleepTimerEnded(fn)` registry synchronously - once per ending, with the store
already back at `idle` - so the auto sleep controller below can tell a dismissal
from a timer that simply ran out. That is the only event this store emits; a
timer armed with nothing loaded (`bookKey === null`) notifies nothing. One
`expired` ending carries more: when the grace closes after a fire that paused a
playing book and the listener **didn't stir** in the window, the outcome carries
`fellAsleep` (see [Fell asleep](#fell-asleep-drift-controllerts) below).

The pieces worth knowing before touching it:

- **Two selectors are the whole public surface for UI.** The phase
  (`idle | running | ending | grace`) is **stored**, not derived - three booleans
  could spell out twice as many combinations as are legal, and the UI kept
  re-deriving the phase from them by hand - so `selectSleepPhase` simply reads it
  and `selectSleepExtendable` is `phase === 'ending' || phase === 'grace'`
  (nothing branches on `graceUntil`; it is only ever the answer to "until
  when?"). The second one answers "can a shake or a *Keep listening* tap do
  anything right now?" and also **gates the accelerometer listener**, so the
  sensor runs only in those two short windows rather than for the whole timer.
  That gate is why the phase must be *true*: a frozen countdown leaves `ending`
  (below), or a book paused with 20 seconds left would keep the sensor
  subscribed - and the grace card saying "Fading out in 20 s" about a paused book
  at full volume - indefinitely.
- **Only a duration timer fades.** The phase is called `ending`, not `fading`,
  because it means "about to stop, a shake still saves it" for **both** kinds of
  timer while only one of them touches the gain. `fadesAudio(origin)` is the
  single gate: `{kind:'duration'}` fades, because its stopping point is arbitrary
  and an abrupt cut mid-sentence is jarring; `{kind:'chapter'}` (which includes
  the end-of-book target and every `startUntilPosition` timer) plays its last 30
  seconds at **full volume**, because those are the words the listener stayed
  awake for and the chapter ending is its own signal. On the chapter path the
  fade ticker never starts, so there are **no gain writes at all** - a unit test
  asserts the gain is never below 1 for a whole chapter-timer run, including
  through its pause and grace.
- **The fade has its own faster ticker.** The 1 s countdown tick is far too
  coarse to ramp against, so `FADE_TICK_MS` (250 ms) drives `syncFade` - the one
  reconciler that owns both the fade ticker and the engine gain, holding the rule
  *the ramp runs iff `phase === 'ending'` and the origin fades and it is not
  frozen*, so every site that writes `phase` or `frozenAt` just calls it
  afterwards. It ramps only while a **duration** timer is `ending`.
  `fadeGain(remaining)` is the
  exported, unit-tested curve: `(remaining / FADE_SECONDS)²`, squared because
  perceived loudness is roughly the square root of linear gain, so a linear ramp
  stays loud and then drops off a cliff. The gain is **never written into the
  store** - it changes four times a second and nothing renders it, so storing it
  would re-render every subscriber at 4 Hz.
- **`syncEndingPhase` works in both directions.** It enters the `ending` phase
  when the remaining time drops into the window *and leaves it, restoring full
  volume, when the remaining time climbs back out* - which a backward seek on an
  end-of-chapter timer does; without the second half the rest of the chapter
  would be stranded at a fraction of its volume (back when that timer still
  faded). A **frozen** countdown is never in the phase either, by the same rule
  rather than a second one: `ending` means "about to stop", and a countdown that
  is not counting is not about to stop. Otherwise the phase change is
  unconditional; only the ramp is gated on `fadesAudio`.
- **`fire()` pauses first, then restores the gain**, chained in a `finally` so a
  rejected pause can't leave a manual resume silently muted. It does not go to
  `idle`: it opens the `GRACE_SECONDS` (30 s) window and keeps ticking. Before
  pausing it records `fired` - when, where it stopped the book, and the listener's
  last touch (`lastInteraction`), read *before* the pause because the pause is
  itself a transport edge the interaction watch would record.
- **`syncGrace` reconciles the grace window** from the play-state watch (every
  player write) and the tick. It closes the window once its deadline has passed -
  the tick alone isn't enough, because iOS suspends the app after the timer pauses
  the audio and the thing that wakes it can be the listener pressing play the next
  morning, which must still close as the drift-off it was - and it marks the fire
  `stirred` when the transport goes live again after `PAUSE_SETTLE_MS` (2 s; the
  engine reports `playing` for a moment after the pause is asked for) or the
  position moves more than `SCRUB_SECONDS` (5 s) from where the timer stopped it.
  `closeGrace` is the one place that ends a fired timer, as `expired`, with
  `fellAsleep` unless it was stirred.
- **`keepListening()` is a no-op outside the `ending` phase and the grace.**
  Inside them it re-arms from the recorded `origin` (`{kind:'duration', minutes}`
  or `{kind:'chapter'}`), so a duration timer restarts its full length and a
  chapter timer retargets - by **one** chapter, even for an "after 3 chapters"
  timer: a shake that late means "a little more", and another shake at the next
  boundary gives another. It also records a touch (`noteInteraction`, below).
  From the grace it additionally calls
  `resumePlayback()`, which checks the live snapshot before calling `toggle()` -
  `toggle` from a *playing* state would pause a book the listener had already
  resumed by hand.
- **One constant makes "one more chapter" work.**
  `nextChapterTarget(allowEndOfBook)` picks the **nearest** upcoming chapter end
  more than `MIN_CHAPTER_SECONDS` (30 s) away (`nextChapterEnd` in
  `book-queue.ts`, which scans for the nearest qualifying end rather than the
  first qualifying array element - chapter offsets are not guaranteed to ascend).
  In the `ending` phase the current chapter's end *is* the boundary being stopped
  at, so it fails that test and the re-arm naturally lands on the **next**
  chapter; for a timer armed at the start of playback the current chapter usually
  qualifies. It is deliberately its **own** constant and not an alias of
  `FADE_SECONDS`: they share a value but are unrelated, and while they were tied
  together retuning the fade silently changed what "one more chapter" retargets.
- **Who asked decides the fallback**, which is what `startChapterTimer`'s
  `{ allowEndOfBook }` option carries. The **listener's** reset (`keepListening`
  passes `{ allowEndOfBook: true }`) means "one more chapter", and where there is
  no next chapter the end of the book is the honest answer. The **automatic**
  nightly arm passes nothing (the default is `false`) and refuses both the
  end-of-book fallback *and* a chapter that ends exactly where the book does,
  degrading to a 15-minute duration timer instead. A folder of MP3s with no
  chapter metadata has `queue.chapters === []` (`buildBookQueue` synthesizes
  virtual chapters only for a single-file book), so the shared fallback armed a
  target ten hours out: it never fired, so the timer never returned to `idle`, so
  the controller's "a timer already stands" guard blocked every later arm and
  stopped its poll - no working sleep timer at all, all night. Whichever
  fallback applies, a chapter arm always ends up with a timer that fires.

### Freezing the countdown while paused (`syncPlaybackFreeze`)

A duration timer counts **listening** time, not wall-clock time: it must not
expire while the book is paused, which it used to do silently - pause with a
headphone button, never look at the screen, and come back to no timer armed.
Every open-source *audiobook* player does the same (Audiobookshelf, Absorb,
Voice; AntennaPod switched off wall clock in 2025). The subtleties are all in
*how* it freezes:

- **The freeze must survive the JS runtime being suspended.** iOS suspends the
  app once it stops producing audio and a hidden web tab is throttled, so **no
  ticks arrive at all** while paused - any scheme that decrements a balance per
  tick silently loses an untick'd hour. So the representation is a **stopped
  clock**, not a running total: a duration timer stays a `Date.now()` deadline
  (`endsAt`), pausing records **`frozenAt`** (the moment the clock stopped), and
  `preciseRemaining` reads the deadline against `frozenAt` instead of the live
  clock. That answer needs no ticks to stay correct. Resuming slides `endsAt`
  forward by `Date.now() - frozenAt` - two timestamps, so any length of gap
  reconciles exactly.
- **The same shape fixes the other direction.** Because the countdown is a
  deadline rather than a per-tick decrement, a *playing* context whose ticks are
  throttled to one a minute can't make the timer run long either.
- **The play state is a level, read from a subscription - not a transition.**
  `playbackWatch` subscribes to `usePlayer` while a countdown is running and
  **ignores the `(state, prev)` payload**, re-reading `isTransportLive()`
  (`playing || loading`) instead. The engine's resume stream is a jumble of
  `ready` / `loading` / spurious `paused` (see [the stall watchdog](#the-stall--error-watchdog)),
  and matching individual transitions is the approach that has failed repeatedly
  here. Subscribing (rather than waiting for the tick) is what makes the
  suspension case airtight: the store write happens while the app is still awake
  handling the pause, so `frozenAt` is always recorded. The 1 s tick and every
  `arm()` call the same reconcile as a backstop, so a missed notification costs
  at most one second.
- **A thaw has three outcomes, by how long the freeze lasted.** Freezing
  introduces the inverse failure - a timer frozen with 3 minutes left, forgotten,
  firing 3 minutes into tomorrow's session - and nothing ever cancels a frozen
  timer, so the length of the freeze is the only evidence there is. On the
  transition back to playing:
  - **under `RESET_AFTER_PAUSE_SECONDS` (20 min)**: the frozen countdown
    continues untouched. 20 minutes clears the longest ordinary in-session
    interruption while being far short of "later that day"; Audiobookshelf
    re-arms unconditionally above 3 seconds, which throws away a 25-minute
    countdown because someone answered the door.
  - **between that and `ABANDON_AFTER_PAUSE_SECONDS` (2 h)**: a new sitting, so
    the timer is re-armed at its **full original** `origin.minutes`.
  - **beyond 2 h**: the timer is **ended** (`endTimer('expired')`), not
    resurrected. Re-arming at any length there was the "armed at 22:30, paused at
    22:40, resumed at 08:00, book fades out at 08:30" bug - no user action, hours
    outside the auto sleep window, and no re-check of why the timer existed.
    `expired` rather than `cancelled`, so auto sleep is free to arm a fresh one on
    tonight's terms.

  There is deliberately **no setting** for any of it. The frozen span is also
  **clamped at zero**: it is two readings of a clock the device owns, so a
  backward jump (an NTP correction, a manual change) would otherwise slide
  `endsAt` *earlier* and fire the timer early once the clock came back.
- **Chapter timers and the grace window are exempt** (both have `endsAt ===
  null`). A position target does not advance while paused and stays valid however
  long the pause was, so it is frozen by construction and must not be re-armed.
  The post-pause grace is genuinely wall-clock - it exists to expire *while* the
  audio is stopped.
- **A pause mid-fade hands the volume back, and leaves the `ending` phase.**
  Freezing stops the fade ticker and writes gain 1 immediately: the listener may
  hit play on the next breath, and near-silent audio with no visible cause is the
  worst outcome this feature has. With the ramp suspended and the volume back,
  the phase is no longer true either, so the freeze drops to `running` (see
  `syncEndingPhase` above) - which is what takes the accelerometer back off, the
  badge back to a countdown, and a stray shake out of the picture (outside the
  `ending`/grace windows `keepListening()` is a no-op, and there it would have
  silently reset the timer without resuming). The ramp is not lost: the thaw
  re-enters the phase if the remaining time still warrants it and `syncFade()`
  picks up at the gain the frozen countdown implies, so it neither restarts nor
  jumps. A frozen timer also never `fire()`s (it would be pausing an
  already-paused book) and never writes a gain at all.

### Writing the gain: `setVolume` is required, degraded per engine

The fade reaches the engine through `usePlayer.setOutputVolume(gain)`, which
clamps once and calls `service.setVolume(…)`. The interface method is
**required** (`types.ts` says so, with the reasoning): an optional marker would
push a `?.` onto every caller to model something no caller can act on. Instead
each engine handles its own "no volume here" case internally and still resolves:

- **`service.native.ts` feature-detects the native function**
  (`typeof AudiosiloPlayer.setVolume !== 'function'`) and also wraps the call in
  a `try`. The JS bundle can be **newer than the native binary it runs on** - an
  installed dev build, or a shipped App Store / Play build from before
  `setVolume` existed - and calling a function the native module doesn't define
  *throws*, which would turn every sleep-timer fade into a playback-breaking
  rejection on those installs. Older binaries degrade to "no fade" and resolve.
- **`service.web.ts`** sets the element's `volume` and swallows the failure on
  **iOS Safari**, which refuses per-element volume outright (system volume is the
  only control there). The fade is inaudible on iPhone/iPad web; it must never
  become a thrown error.
- **`playBook` resets the gain to 1** (`svc.setVolume(1)`, with the store's
  cached `outputVolume` written alongside it) when starting a book. The timer
  restores the volume on every path it owns; this is the backstop for the one it
  doesn't, because near-silent audio with no visible cause is the worst outcome
  this feature can produce. It runs **immediately after `nowPlaying` is swapped**
  to the new book, at every site that swaps it - the fade ticker stands down by
  comparing the *playing* book against the timer's own, so a restore written
  while `nowPlaying` still held the old book was one the 4 Hz ticker could
  overwrite during the resume lookup's network round trip, and the new book could
  start attenuated.

### Shake to extend (`use-shake-to-extend.ts`)

A shake **extends** the timer; it does not cancel it. (The hook replaces an
earlier `use-shake-to-cancel.ts`, which is gone.) `useShakeToExtend` subscribes
the accelerometer only while `selectSleepExtendable` holds **and** the
`shakeToExtend` setting is on (default on), so the sensor is off for the other 29
minutes of a 30-minute timer.

It is mounted **exactly once, at the app root**: the headless
`ShakeToExtendListener` (`src/components/player/shake-to-extend-listener.tsx`)
rendered by `src/app/_layout.tsx`, alongside `startAutoSleep()`. Deliberately
**not** from `player-view.tsx` - the feature's main case is a nightly timer on a
locked phone with no player screen open, where a hook mounted in the player modal
would never be listening; mounting it in both places would double-fire a single
shake.

- It imports **`expo-sensors/build/Accelerometer` directly**, never the
  `expo-sensors` barrel: the barrel does `import * as Pedometer`, and
  `Pedometer.ts` resolves its native module at load time, throwing
  "Cannot find native module 'ExponentPedometer'" on builds that don't link it -
  crashing the player for a sensor we never use.
- Detection requires a **burst**, not a single sample: 100 ms sampling, a number
  of samples whose total acceleration exceeds a threshold inside a 1 s window,
  then a 2 s debounce. A single-sample threshold both false-fires on a pocket
  bump and misses a genuine shake landing between samples. The burst detector is
  `createShakeDetector(tuning, onShake)`, apart from the sensor so it is tested
  with plain numbers, and the `shakeSensitivity` setting picks the tuning
  (`shakeTuning`): **`medium`** is the shipped 1.4 g with two samples, **`high`**
  1.25 g with two, **`low`** 1.8 g held for three (a mattress jolt doesn't make
  that). The default bar is deliberately low: a false positive only grants more
  listening time, while a false negative stops the book on someone who was awake.
- The two settings (`shakeToExtend`, `shakeSensitivity`) are hydrated defensively
  (`shakeToExtend !== false`, `toShakeSensitivity`), and shown both in the sleep
  sheet's settings card and in Settings > Sleep timer through one
  `ShakeSensitivityControl`. On web the row stays but says it is not available.
- Native only, and the whole subscription is wrapped in a `try` so a build
  without the sensor degrades to a no-op. **Keep listening** - on the grace card
  (`grace-card.tsx`) and in the sheet's notice - is the equivalent, mandatory on
  web (no accelerometer) and offered on native too.

### The grace card (`grace-card.tsx`)

`GraceCard` floats over the full player's controls, just above the docked bar
(mounted by `docked-player.tsx`), and on a phone outside the full player above the
tab bar and mini player (`PhoneGraceCard` in `ShellPlayerOverlays`, lifted to the
measured `bottomChromeTop`) while the phase is `ending` or `grace`: a ring that empties
over the window, "Fading out in N s" (a duration timer), "Stopping in N s" (a
chapter timer, which doesn't fade) or "Paused by the sleep timer", how to keep
going (mentioning the shake only where it is on and the platform has a sensor), and
**Keep listening**. It is not a dialog - it never takes focus and blocks nothing
outside its box - and it is announced once per phase rather than every second (a
polite live region on Android and the web, `announceForAccessibility` on iOS,
which has no live regions). The caller passes `bottom`, the distance to clear its
own controls.

### Fell asleep (`drift-controller.ts`)

What happens after a sleep timer stopped a book nobody was awake for.
`startDriftWatch()` is started once from `src/app/_layout.tsx` (like
`startAutoSleep`) and is framework-free:

1. **The bookmark.** On an outcome with `fellAsleep`, a bookmark named
   `player.sleepTimer.fellAsleepNote` ("Fell asleep", translated when made: it is
   stored on the server as text) goes on the playing book's own server at the stop
   position, through `resolveClient`. Best effort: offline, signed out or refused,
   it simply isn't made, and it never throws into the timer's ending path.
2. **The record.** The last touch before the fire and the stop position are kept
   on the device (`drift.ts`, AsyncStorage key `audiosilo.driftOffs`, keyed by
   `contentKey(connectionId, libraryId, path)`, `DRIFT_TTL_MS` 36 h, at most 20
   books, every read-modify-write serialised so a save and a take can't drop each
   other's change).
3. **The prompt.** On the play edge of that book (a `usePlayer.subscribe`
   transition into playing, or a different book playing), `takeDrift` reads and
   forgets the record and `driftOffer` decides: only for a gap of 1-60 content
   minutes between the touch and the stop, and only when the book starts within
   5 minutes of where it stopped. Then a toast: "You drifted off around 23:41.
   Jump back 4 minutes?" whose action `seekBook`s to the touch, only into the book
   it was offered for. If the listener pressing play is the very write that closes
   the grace (iOS slept through it), the play edge has already gone by, so the
   controller prompts on the spot instead of saving.

**The last touch** is `last-interaction.ts`: memory-only, per book key (20 kept).
`startInteractionWatch` (started by the drift watch) records what the store shows -
the transport starting or stopping, and the position **jumping** rather than
flowing (more than `JUMP_SECONDS`, 4 s, beyond what playback could have done) -
which covers the lock screen and CarPlay with no change to the store.
`noteInteraction()` records the touches the store can't see: arming a timer in the
sheet, a shake, Keep listening. The automatic nightly arm is not a touch. A
misread edge only makes the listener look awake somewhat later, which shortens the
jump back; it never invents one.

### Auto sleep timer (`auto-sleep.ts` + `auto-sleep-controller.ts`)

The nightly auto-arm is split into a pure decision function and a framework-free
controller, so all the policy is unit-tested and none of it lives in a component.

- **`decideAutoSleep(input)`** takes the four `autoSleep*` settings, `now`, the
  `bookKey` and the per-book memory, and returns
  `{arm:'none'} | {arm:'chapter'} | {arm:'duration', minutes}`. It bails when the
  feature is off, when the memory says this book is blocked (`canAutoSleepArm`),
  and when the clock is outside the window. A persisted `autoSleepType` that isn't
  `chapter` or a positive number arms nothing rather than a nonsense timer.
  "A timer is already standing" is deliberately **not** an input: that is a live
  reading of the timer store, enforced by the controller (below), and restating it
  here would be a second, always-false copy of a rule enforced elsewhere.
  An `{arm:'chapter'}` decision arms through `startChapterTimer()` with **no**
  options - i.e. `allowEndOfBook: false`, the automatic fallback rules above - so
  a chapterless book gets a duration timer that fires rather than a target hours
  away that would block every later arm for the session.
- **The window test is `withinAutoSleepWindow` (`src/lib/hhmm.ts`, with
  `parseHhMm`/`formatHhMm`)**, half-open `[from, until)` over local wall-clock
  "HH:MM", wrapping past midnight (the 22:00-06:00 default). `from === until` reads
  as **never**, and a malformed bound is `false`, so a corrupt value can't arm a
  timer unexpectedly. It lives in `lib`, not in the settings store that persists the
  strings, so `@/lib/format` (imported by some twenty modules) doesn't drag zustand
  and the persisted settings into their graphs.
- **The timer says how it ended**, through `onSleepTimerEnded(fn)` - see the sleep
  timer above. `cancel()` reports `cancelled`; the grace closing, a fire against a
  book that was not playing, and `cancelIfBookChanged` all report `expired`. A book
  change is an expiry, not a cancellation: nobody dismissed that timer, and blocking
  the book for the night because the listener dipped into another one would recreate
  the failure this design fixes. Never infer the reason from the leftover fields -
  the version that read `graceUntil !== null` as "it fired" filed a cancellation made
  *during* the grace window as an expiry, which is precisely the case that must not
  re-arm.
- **The anti-nag memory** (`AutoSleepMemory`) is ONE bounded, insertion-ordered set
  of book keys: the books the listener has **cancelled** a timer on. It is folded by
  the pure `recordAutoSleepOutcome` (a `cancelled` outcome adds, an `expired` one
  changes nothing) and read by `canAutoSleepArm`, and it caps at
  `MAX_REMEMBERED_BOOKS` (50), evicting the oldest. A block is final for the session:
  never unblocked by anything later, including the listener's own manual timer
  running out on the same book.
  The other half - "a timer is standing for this book right now, so nothing may arm
  a second one" - is **not remembered at all**: the timer store answers it live as
  `phase !== 'idle'`, and answers it better. A remembered copy was only as good as the
  bookkeeping that maintained it, and could go stale in a way the live reading cannot.
- **Re-arming can't loop.** Firing pauses playback, so the only route back to an
  armed timer is a fresh transition into `playing` - the listener's own hand. The
  one case with no such edge is a listener who resumed by hand *during* the grace
  window; there the poll (60s) picks it up once the grace closes, which is also the
  floor on how often anything can be armed.
- **`startAutoSleep()` (`src/playback/auto-sleep-controller.ts`)** is started once
  from `src/app/_layout.tsx` (`useEffect(() => startAutoSleep(), [])`) and returns its
  teardown. It is a module with subscriptions rather than a component that renders
  `null` - it uses no context, router, props or rendering - and it holds the session
  memory in **module state**, so "never again for this book" lasts as long as the JS
  context rather than as long as a mounted component. It must run whether or not the
  player modal is open: the timer has to arm for a book started from the mini player,
  the library, or a lock-screen play.
  It listens to three things: the **setting** (which attaches and detaches everything
  else - `autoSleepTimer` defaults to off, and the player subscription would otherwise
  run on every progress write for a feature nobody switched on); the **player**, for
  the transition edge into `playing` (one look per resume, not one per progress tick);
  and **`onSleepTimerEnded`**, which is installed for the whole session because a
  cancellation counts even if auto sleep is enabled later. The 60s poll
  (`ticker` from `src/lib/ticker.ts`) runs only while a book plays with the feature
  on, no timer standing and the book unblocked - each gate being a "re-asking cannot
  change the answer" test.

## Undo a jump (`jump-undo.ts`)

After **any** jump of more than a minute of book position, the app remembers where
the listener was for 10 seconds (`UNDO_WINDOW_MS`) so the `UndoChip`
(`src/components/player/undo-chip.tsx`, "Back to 17:26:50" with a ring that empties)
can take them back - the chip replaces the full player's `PlayerStatusLine` and
leads the docked bar's actions; `undoJumpWithToast` seeks back and toasts "Back where you
were", for the chip and anything else that offers it.

"Any jump" includes the ones that never pass through our UI - a lock-screen or
headphone seek, a CarPlay scrub - so jumps are **not** recorded by the seek
actions. They are **detected from the player's snapshot stream**: `startJumpUndo()`
(started once from `src/app/_layout.tsx`) subscribes to `usePlayer` and compares
consecutive settled samples of the whole-book position with how far playback could
have carried the listener in the wall-clock time between them. `isJump(prev, next,
elapsed, rate, unobserved)` is the pure rule: while the previous sample was
playing, anything up to `elapsed × rate` is natural; while it was paused, nothing
is; a move beyond that by more than `JUMP_THRESHOLD_S` (60 s), or backward by more
than it, is a jump. One rule covers every source, and the store needs no hook in
`seekBook` - which is why it doesn't touch the store (decision 7): a recording site
in the store would miss every jump the engine makes on the OS's behalf.

What must **not** read as a jump, and why it doesn't:

- **Loading or resuming a book** (0, then the resume point) and a book change: the
  baseline drops when `selectBookKey` changes, the snapshot current at that moment
  (the old engine state) is skipped, and for `SETTLE_MS` (3 s) after the first
  fresh sample the samples only move the baseline.
- **Retry, reloads and buffering**: only `playing` and `paused` are sampled;
  `loading`, `ready`, `error`... keep the last settled sample.
- **The downloads hot-swap**: same book, same position.
- **The app coming back after iOS suspended JS**: a 1 s heartbeat (`ticker`) notes
  when JS last ran; a gap over `SUSPENSION_GAP_MS` (5 s) marks the next sample
  `unobserved`, and forward movement up to the allowance is then accepted even from
  a paused sample (a lock-screen play while suspended). Backward movement is never
  natural.
- **The undo itself**: `undoJump` marks its landing (`undoLanding`, within 5 s and
  5 s of the target), which is then not recorded.

Two jumps within `COALESCE_MS` (1.5 s) are one gesture (a multi-file seek can land
in two steps), so the chip keeps the first "from"; landing back within the
threshold of it clears the chip. A book without a whole-book timeline (`total <= 0`)
is not watched. Known limits, on purpose: a seek in the first 3 s after a book
starts makes no chip, a jump made while JS is suspended that lands inside the
playback allowance can't be told from listening, and re-loading the same book far
away (a chapter tapped on its book page) is a jump - which is right for a chapter
tap.

## Time left (`time-left.ts`)

One rule for how every screen says the time left in a book (frontend#50: the
speed is saved per book, so the time left must use it too):

- It is **wall-clock** time at **that book's** speed: the loaded book uses the
  player's `rate`; any other book its saved `playback_speed`, else the
  `defaultRate` setting (what `playBook` would start it at) - `bookSpeed(saved,
  defaultRate)`.
- It names the speed: "22h 27m left at 1.25×", and at 1× just "22h 27m left"
  (`isNormalSpeed`, two decimals as `formatSpeed` shows it).
- `timeLeft(position, total, speed)` returns `{ seconds, speed }` or `null`
  without a timeline; `formatTimeLeft(t, left)` the phrase (`""` when unknown or
  nothing is left, so a caller drops the line); `timeLeftLabel(t, speed)` the
  label under a figure (the Home Now card's "left at 1.25×").

The React side is `src/components/player/use-time-left.ts`: `usePlayingTimeLeft()`
(mini player, accessory player, docked bar, Up next), `useBookSpeed(book, saved)`
and `useBookTimeLeft(book, saved, total)` for any book (Home, the Library's Books
list) - the live place and speed while it's the loaded one, else the saved ones.
Each selector returns the text itself, so a caller re-renders when the words
change (about once a minute), not on every engine tick. The speed sheet's per-preset
times use `timeLeftAt` (`speed-model.ts`) on the same `wallClockSeconds`.

## The companion (`companion/`)

`src/components/player/companion/` is the full player's companion: Who's who, Story
so far, Chapters, Bookmarks, Notes and History, in one `Companion` with three
variants (`column` on desktop, `inline` on a tablet, `sheet` on a phone - the first
and last scroll on their own, `inline` lets the page scroll).

- **`companion-model.ts`** (pure): `companionTabs(metadata)` (the two community
  tabs only where the server has `metadata`; the listener's own four always),
  `activeCompanionTab`, `whoOrder` (latest first appearance first), `newlyMet`,
  `storySoFar` (recaps in story order, split by the book page's `splitRecaps`, with
  the chapter the last visible one reaches), `chapterRows` (past, the current one's
  time left, "in 2h 4m" until each later one - through `timeLeft`, the app's one
  speed rule) and the reveal rules below.
- **`use-companion-data.ts`**: the playing book's community data and the listener's
  place, gated **exactly** as the book page gates it (`meta-gating.ts`: the same
  corrected chapter starts from `chapterStartsOf`, `listeningProgressFor`, and
  `useListeningPosition` sampled in `LIVE_POSITION_BUCKET_S` buckets, never below
  the saved position) - never a fork of those rules. Its `status` (`off`,
  `loading`, `none`, `ready`) keeps the panels from flashing everyone hidden while
  the chapters load. It runs inside a `ConnectionScope` for the book's own server.
- **`companion-store.ts`** (`useCompanion`, memory only): the tab (kept across opens
  of the player), **one shared reveal** per book (`revealedKey`: Show anyway in
  Who's who also reveals Story so far, as on the book page, and another book starts
  hidden), and the "Just met" ids of the last crossing. It sits outside any view so
  the desktop column, the tablet's inline companion, the phone's sheet and the
  toast's Show agree.
- **Panels:** `WhoPanel` (met people newest first, a `HiddenStrip` that counts the
  rest without naming them, a character's description behind a per-card tap since
  it is written for the whole book, "Just met" springing in), `StoryPanel` (the
  recaps up to "Up to chapter N", the whole-book summary behind the shared spoiler
  accordion, `RecapSummaryBlock`, while unfinished), `ChaptersPanel` (a virtualised
  list opened on the current chapter; it replaced `chapter-list.tsx`), and the book
  page's `BookmarksSection` / `NotesSection` / `HistorySection` with an `onJump`
  that seeks the playing book in place (so the undo chip follows) instead of
  opening the player. `Attribution` (`companion-pieces.tsx`) puts the server's
  `attribution` (credit, and the licence as a link) under every community block;
  the credit is the server's, never composed here.

**The reveal toast** is `CompanionRevealListener` (`reveal-listener.tsx`), mounted
once in the root layout so it fires wherever the listener is. For the loaded book it
reads the cast and the chapter starts (the book page's gate inputs) and subscribes to
`usePlayer`, comparing each sample (`RevealSample`: position, playing, gate chapter)
with the previous one. `revealOnCrossing` announces only on a **natural crossing**
(`isNaturalCrossing`: both samples playing, time moving forward by at most
`NATURAL_STEP_S` = 10 s, the chapter going up) - never a load, a resume, a seek, a
skip or a jump back - and only the people the new chapter reveals beyond the
furthest chapter reached this session, so replaying a chapter never re-announces
anyone; a finished book announces nothing. A hit marks them `justMet` and toasts
"New in Who's who: …" with **Show** (`showWhoIsWho`: the Who's who tab, the
companion sheet on a phone, and the player pushed when it isn't on top).

**Previously on** (Home, `src/components/home/previously-on.tsx`, rules in
`previously-on-model.ts`) reuses the same gate: above the Now card for an unfinished
book last saved `PREVIOUSLY_ON_GAP_DAYS` (12) or more days ago, not loaded, on a
server with `metadata`, showing the furthest recap the saved place is past (one
short paragraph, clamped); "Resume, with 30 seconds of overlap" is
`playBook(..., overlapStart(saved))` at the saved speed (which lowers the resume
floor to where it starts, so the overlap's saves aren't refused as a slip).
Dismissed for the session in memory.

## The player controls and title display

The player's building blocks, shared by the full player and the docked bar:

- **Speed and sleep timer open sheets.** The readouts (the full player's speed and
  sleep pills, the dock's `SpeedPill` and `SleepTimerButton`) only call
  `usePlayerSheets.openSheet`; the sheets (`SpeedSheet`, `SleepSheet`) are rendered
  by `PlayerSheetHost`, mounted in the full player and once at the shell's root, one
  active at a time
  ([overview](overview.md#player-sheets-and-overlays)), so they're never clipped.
  Both present through `PlayerSheet`
  (`player-sheet.tsx`): a bottom `Sheet` on a phone, a floating one on a tablet,
  a centred `Dialog` on desktop; children mount only while open, so a body that
  subscribes to the position costs nothing behind a closed sheet. `usePlayerSheets`
  (`player-sheets.ts`) is a tiny store anyone can drive (`openSheet('sleep')` from
  the Z key, `'shortcuts'` from ?); the active host renders it from `open`.
  - **Speed** (`speed-model.ts`): the readout with "… left in the book at 1.25× ·
    remembered for this book", a `Slider` in hundredths (so its aria values are
    exact) between labelled -/+ `Button`s (`SPEED_STEP` 0.05, `snapSpeed` removes
    float dust; the store clamps to the same 0.5-2 range), and `SPEED_PRESETS`
    as `OptionTile`s, each captioned with the time left at that speed.
  - **Sleep** (`sleep-sheet-model.ts`): a `SleepNotice` while a timer stands
    (`sleepNotice`: "Sleep timer on", "Stopping at the end of the book", or
    "Stopping after N chapters" with N counted live; **Turn off**, plus **Keep
    listening** in the `ending`/`grace` windows), the `SLEEP_MINUTES` tiles
    (5, 10, 15, 30, 45, 60), the End of chapter tile (`chapterTimerTarget`), the
    "Or stop after" rows (`stopAfterRows`, at most `STOP_AFTER_ROWS` = 4, with each
    row's end on the local clock), the auto sleep and shake settings in place, and
    the Fell asleep hint. Picking anything records a touch (`noteInteraction`) and
    closes the sheet. The sleep readouts read only the phase - a countdown on
    `brand-soft` while `running`/`ending` (`useSleepCountdown`, also first in the
    mini players' subtitle), a short "Keep going" once the timer has paused.
- **The seek bar** (`seek-bar.tsx`) is chapter-relative: `SeekBar` draws stylised
  bars - **deliberately decorative**: `seek-texture.ts` seeds a speech-like envelope
  from the book and chapter (`seekTextureKey`), so a chapter always looks the same
  and two chapters differ, without pretending to show the sound (a `peaks` prop
  takes real peaks if the server ever computes them, through the same bar count).
  The bars are drawn once per width as two static SVG layers and the played one is
  revealed by a UI-thread clip, so a tick moves two transforms, not 96 colours.
  Tap jumps, a drag scrubs with a tip ("41:12 · 17:26:50 in the book") and commits
  on release, bookmark glyphs sit above; it is an adjustable slider whose steps are
  the skip lengths (gesture and accessibility come from `useSliderControl`, shared
  with `Slider`). `PlayerSeekBar` binds it to the store (the chapter, else the file
  without a whole-book timeline); `SeekTimes` is the row under it ("21m left in the
  chapter · ends 22:01", at the current speed on the local clock).
- **The whole-book timeline** (`book-timeline.tsx` + the pure
  `book-timeline-model.ts`): one segment per chapter sized by length (merging
  neighbours too narrow to see), past chapters in ink, the current one pink,
  bookmark and note pins (`usePlayingPins`, through the playing book's own
  connection, never throwing when it's gone), an axis in the `full` variant, a
  hover tip on the web; a tap or drag seeks (a jump, so the undo chip appears by
  itself). `PlayerBookTimeline` binds it to the store.
- **The transport cluster** (`transport-controls.tsx`): previous chapter, back,
  play/pause, forward, next chapter at three sizes (`lg` full player, `md` phone,
  `sm` dock); previous/next read the live position at press time through
  `stepSegment` (`transport.ts`: chapters, else files); `PlayButton` shows a
  spinner while loading and Retry on `error`.
- **Web keyboard shortcuts** (`player-shortcuts.ts` + `use-player-shortcuts.ts`,
  attached to the document once by the web shell, `(app)/_layout.web.tsx`):
  `playerShortcutFor(key, context)` is the pure map - Space/K, J/←, L/→,
  Shift+←/→ chapters, `[` `]` speed by 0.05 (`steppedRate`), B bookmark
  (`addBookmarkHere`, through the playing book's connection), P full player, Z
  sleep, ? the `ShortcutsDialog`, Esc closes the top layer (a sheet, then the
  player). None fire while typing (`isEditable`), over another modal
  (`isModalOpen`, any `aria-modal`), with Ctrl/Alt/Meta, or (except ? and Esc)
  with no book loaded; Space and the arrows are left to a focused button or slider
  (`ownsKeys`). Q (Up next) and ⌘K / `/` (the palette) keep their own handlers and
  are listed in the overlay too.
- **`prettify-title.ts` cleans filename-shaped labels for display.** Audiobook
  "chapter" labels are often just the underlying audio *filename*
  (`01_the_hobbit_ch1.mp3`). `prettifyChapterTitle` strips a recognised audio
  extension, turns underscores into spaces, and drops a trailing encoder bitrate
  tag (`64kb`, `128 kbps`) - but only for labels that already look like filenames,
  leaving genuine titles ("Chapter 1", "The Shadow of the Past") untouched. It is
  **display-only**: it never changes the streamed path, the saved position, or the
  chapter model, and is applied wherever a chapter/track label surfaces - the full
  player title, the mini-player caption, the iOS accessory player and the docked
  player bar, the command palette, the book's History tab, the chapter list, and
  the sleep sheet's "Or stop after" rows. Those surfaces name the current chapter through
  one helper, `chapterLabel()` (`src/lib/chapter-label.ts`), which falls back to
  "Chapter N" for an untitled chapter before prettifying.
