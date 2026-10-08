---
title: Offline & PWA
description: "Downloads on native (expo-file-system) and web (Cache API + service worker), the manifest/registry store, the offline companion (community metadata kept with a download), failures that keep finished files, keeping the next books ready, the Downloads page, playing local files, and what the PWA layer actually covers offline."
---

Offline support has two halves that meet in the middle:

- **Downloads** (`src/downloads/`) - save a book's audio files + cover +
  metadata locally, per platform.
- **The PWA layer** (`public/sw.js`, `public/manifest.json`,
  `src/lib/register-sw{,.web}.ts`) - on web, the service worker is what makes
  both the app shell *and* the downloaded media playable with no network.

The playback layer consumes the result: a downloaded book plays from local URIs
with zero network, and a streaming book hot-swaps onto its local files the
moment its download finishes.

## The `DownloadEngine` interface

`src/downloads/types.ts` defines a platform-agnostic storage engine, resolved
by Metro exactly like the playback service (`engine.native.ts` /
`engine.web.ts`; `engine.ts` is an unsupported stub for type resolution):

- `downloadFile(connectionId, libraryId, path, fileName, url, onProgress?,
  signal?)` → local URI
- `fileExists(localUri)`
- `verify?(localUri)` - *can this file actually be played back offline right
  now?* Stronger than existence; web-only.
- `probe?()` - *does offline playback work at all in this environment?* A
  self-test needing no real download; web-only.
- `localUri?(connectionId, libraryId, path, fileName)` - recompute a stored
  file's current URI from the live storage root (see relocation below). **Both
  engines** implement it: native rebuilds the container-current absolute path
  (it drifts between installs); web recomputes the deterministic virtual cache
  URL so a legacy download adopted into a connection on hydrate picks up its new
  connection-scoped prefix.
- `migrateLegacyBook(libraryId, path, target)` - one-time adoption of a
  pre-connection-scoping download: move its files under `target`'s scoped
  location and return `true`, or delete them and return `false` when `target`
  is `null`. See the migration step below.
- `removeBook(connectionId, libraryId, path)`, `totalBytesUsed`.
- `writeText?(connectionId, libraryId, path, fileName, text)`,
  `readText?(...)`, `removeFile?(...)` - a small text file kept **with** a
  downloaded book's files, so `removeBook` and `clearAll` take it too (the
  offline companion's `meta.json`, [below](#the-offline-companion-offline-metats)).
  Native writes it in the book's folder and never creates the folder (a book
  removed meanwhile has none, so `writeText` resolves `false`); web puts it in the
  media cache under the book's prefix and reads it back from the cache directly,
  never through the service worker.
- `storageEstimate?()` - how much room there is, as a `StorageEstimate { scope,
  capacity, free }`, or null when the platform can't say. Native: the disk
  (`Paths.totalDiskSpace` / `availableDiskSpace`, scope `device`). Web: the origin's
  quota from `navigator.storage.estimate()` (scope `browser`; `free` = quota minus
  everything the site stores; other apps' use is not knowable there). Read by the
  Downloads page's storage card and by keep-ahead's space rule.

Every content op is scoped by **connection id** (`Connection.id` from the
session store) as its first coordinate - the same `(connectionId, libraryId,
path)` scoping all client state uses (see [State & data](state-and-data.md)).
Without it a download addressed by `(libraryId, path)` alone would collide
across two servers that each have a "library 1"; threading `connectionId`
through the storage keys and file layout keeps them apart.

### Native engine (`engine.native.ts`) - expo-file-system

Uses the **new expo-file-system API** (`Directory`/`File`/`Paths`). Files live
under the **document directory** (persistent, not cache-evicted):

```
<Paths.document>/downloads/<connectionId>/<libraryId>/<slug(rel_path)>/
    0.mp3, 1.mp3, …      # fileName(i, relPath): file index + original extension
    cover.jpg
```

`slug()` is the sanitized tail of the book's `rel_path` (≤ 40 chars) plus a
djb2 hash of the full path - readable *and* collision-proof. Downloads run
through `File.createDownloadTask(url, dest, { onProgress, signal })`, so they
report byte progress and honor an `AbortController`. `verify`/`probe` are
omitted: on native disk, presence implies playability.

### Web engine (`engine.web.ts`) - Cache API + service worker

There is no filesystem on web. Downloaded bytes live in the **Cache API**
(cache name `audiosilo-media-v1`, kept in sync with `public/sw.js`) under
**synthetic same-origin URLs** inside the service worker's scope:

```
<origin><BASE_URL>/_offline/<connectionId>/<libraryId>/<slug(rel_path)>/<fileName>
```

The extra `<connectionId>` segment needs **no service-worker change**:
`public/sw.js` matches offline media by `path.includes('/_offline/')`, so it
serves the scoped URLs unchanged. The store treats that virtual URL exactly
like a native `file://` URI. At play time, the service worker intercepts
requests for `…/_offline/…` and serves the cached bytes - **with Range
support** - so a downloaded book plays in `<audio>` with no network.

Implementation notes worth knowing before touching it:

- The response body is **streamed straight into the cache** through a
  `TransformStream` that counts bytes for progress - buffering a multi-GB
  audiobook into a Blob first risks OOM on mobile. If the server sent no
  `Content-Length`, the entry is re-stored (cache→cache, still streaming) with
  the now-known length so `totalBytesUsed()` (which sums `Content-Length`
  across the cache) doesn't count the book as 0 B.
- `navigator.storage.persist()` is requested once (best-effort durability;
  granted silently for installed PWAs).
- `verify(localUri)` fetches the URL with `Range: bytes=0-0` and requires a
  **206** - only the SW's media handler produces one; the network/SPA fallback
  for an unknown path won't. So a 206 proves the SW (not the server) answered.
- `probe()` round-trips a 1-byte throwaway file through
  `…/_offline/__probe__` and cleans up - proving end-to-end offline playback
  without a real download, so the UI can hide downloads up front in
  environments where they'd never play (no controlling SW, insecure context,
  SSR pass).
- `hasControllingSW()` waits for `navigator.serviceWorker.ready`, **bounded at
  10 s**, then up to 3 s more for a first-ever registration to claim the page,
  before giving up. `ready` never settles when no worker registers at all
  (registration failed, or a browser or policy blocks it); unbounded, the probe hung
  and the page kept offering downloads that could never play offline. 10 s is
  generous so a first visit's worker still has time to install.

## The registry store (`src/downloads/store.ts`)

`useDownloads` (Zustand) keeps a `Registry` of `DownloadEntry` keyed by
`downloadKey(connectionId, libraryId, path)`
(`"<connectionId>:<libraryId>:<path>"`), persisted as JSON under
`audiosilo.downloads` in AsyncStorage. Every entry carries its `connectionId`.

**Entry shape** (`src/downloads/types.ts`): `status` (`queued → downloading →
downloaded | error`), aggregate `progress` (0..1), `bytes`/`totalBytes`, an
optional `error` message, `failure` (a classified `DownloadFailure` for an
`error` status, below), `origin` (`listener`, the default when absent; `auto`,
the playback store's download of the book you start; or `keep-ahead`), and the
**manifest** - the offline source of truth: the full `Book`,
the `ChaptersResponse`, the ordered `files` (`relPath → localUri`, plus the
`bytes` written, absent on entries saved before it was recorded), `coverUri`,
`savedAt`. The manifest is everything the player needs to build a queue and render
with no network.

### Lifecycle

- **Queue**: `download(connectionId, libraryId, book, chapterData?, origin?)`
  registers a `queued` entry and pushes its key onto a module-level FIFO; **one
  book downloads at a time** (`runQueue`/`runOne`). It refuses a book that
  streams through the server's transcoder on web (`webTranscodeFromCache`, see
  [Playback](playback.md#web-transcode-negotiation-transcodets)): its raw files
  would not play offline in that browser, and refusing here covers the book page,
  the automatic download and keep-ahead alike. Repeat requests for a
  non-errored entry are ignored; an `error` entry is retried, keeping its
  manifest's finished `files` (and chapters). It is also the **one choke point for the
  automatic rules**: for the `auto` (the book you start) and `keep-ahead` origins it
  refuses a book the listener declined this session and one that would eat into the
  reserve (`roomLeft`; an unknowable room lets it start, one at a time); the
  listener's own download is never held back. The book you start outranks
  keep-ahead's books still **queued**: when only they stand in its way, they step
  aside (unmarked, so keep-ahead plans them again around it) and it goes next. It
  resolves a `DownloadOutcome` - `queued`, or why not: `exists`, `unsupported`,
  `transcoded`, `declined`, `no-space` - so a caller can act on a refusal. No `ApiClient` is passed in - `runOne` resolves
  the entry's **own** server client via `resolveClient(entry.connectionId)`
  (`src/api/connection-clients.ts`), so two servers' queued downloads never race a
  shared client; a queued download whose connection was removed errors the entry
  instead of downloading against the wrong server.
- **Run** (`runOne`): file specs come from `bookFileSpecs` in
  `src/playback/book-queue.ts`, so **download order ≡ play order**. The cover
  downloads first (optional - a cover failure is swallowed, but an abort still
  cancels the whole book), then each audio file via
  `api.streamUrl(libraryId, path, true)` (the `download=1` variant), patching
  `progress`/`bytes` per chunk. `totalBytes` is the summed file sizes when
  every spec knows its size, else 0.
- **Verify before claiming success**: if the engine has `verify` (web) and the
  first file can't actually be served offline, the entry is marked `error`
  with a "reload the app, then retry" message - **keeping the cached bytes**
  for the retry - so the downloaded badge can never lie.
- **Errors keep the finished files.** A failed run marks the entry `error` with
  `failure = { ...classifyDownloadError(e), kept }` and keeps the files that
  finished in its manifest (the one being written is partial and is written over).
  `kept` is the share of the book's files that finished (0..1), so a single-file
  book keeps nothing. A retry walks the specs in order and **skips** a file whose
  manifest slot has the same `relPath` and still exists on disk (the on-disk name is
  the file's index, so a file only counts where it was saved). `runOne` lists each
  finished file in the persisted entry as it lands, so this survives a restart
  too (hydrate's `reviveEntry`, below).
- **Failure classification** (`src/downloads/failure.ts`): `classifyDownloadError`
  maps whatever the platform threw (a fetch `TypeError`, expo-file-system's native
  messages, a `QuotaExceededError`, the web engine's `Download failed (404)`) to
  `network`, `server` (with the HTTP `status`), `storage`, or `unknown`; the store
  itself sets `unservable` (saved, but the web worker can't serve it yet),
  `removed` (the entry's connection is gone) and, on hydrate, `interrupted` (the
  app closed mid-download). The Downloads page words each one for
  the listener; entries saved before classification read as `unknown`.
- **Cancel and remove**: a **cancel** (`cancel()` aborts the in-flight
  controller) removes the files *and* the entry; `remove()` is the user-facing
  delete: abort + `engine.removeBook` + drop the entry. Files on the server are
  never touched. Both also add the book to a **session-only decline mark**
  (`isDeclined(cid, lib, path)`, a module-level `Set`, never stored), so no
  automatic download fetches a book the listener just cancelled or removed (also
  through "remove a download when you finish the book"). A `download()` with
  `origin: 'listener'` lifts the mark; `auto` and `keep-ahead` never do, which is
  why the playback store's automatic download asks as `auto`.
- **UI**: `useDownloadControls` (`use-download-controls.ts`) wraps all of this
  for the book screen, the badges and the book menu (`book-actions.tsx` reads the
  same hook); the `/downloads` page is below. Its `needsTranscode` (web, a book that
  streams transcoded, with no entry or an errored one - a download already on disk
  stays removable) turns `supported` off so `DownloadControl` reads "Can't download
  in this browser" rather than the generic "Downloads unavailable". List responses
  carry no `direct_playable`, so on web `download()` looks a list-shape book up in
  full (`itemQuery` + `chaptersQuery` through the cache) before deciding, and the book
  menu offers Download only once its own lookup (made when the menu opens) says the
  browser plays the book directly. Every user-facing removal (the book
  page, the book menu, the Downloads page) asks first through the shared
  `RemoveDownloadConfirm` (`src/components/downloads/remove-download-confirm.tsx`),
  which says how much room it frees.
- **Changed chapters** (`startChapterRefresh`, started once from the root
  layout): a book's chapters can change on the server after it was downloaded
  (a rescan, a [community chapter list](../server/community-chapters.md)
  fitted onto its audio, `chapters_source: "community"`, or an admin switching
  it back). The listener subscribes to the query cache: every **server** answer
  for a `chapters` query (a successful fetch, not the store's own
  `setQueryData` seeds) of a `downloaded` entry goes through
  `refreshedChapters(manifest, fresh)`, which replaces `manifest.chapters` only
  when the answer's audio files are the ones on the device (`bookFileSpecs`
  gives the same paths in the same order, with the same sizes where both
  answers know them, so a file replaced at the same path doesn't pass) and the
  answer differs; then the entry is patched and persisted (`persistSoon`, so a
  burst saves once). Different files mean the local audio no longer matches,
  which is a new download, so the manifest stays. An answer that arrived while
  the book was still downloading, or before the launch's hydrate read the
  registry, is taken from the cache when the download finishes and at hydrate
  (`withCachedChapters`). The audio is
  never touched, and a queue already playing keeps its chapters until the book
  is next started. Before this, a downloaded copy kept the chapters it was
  downloaded with.

### Hydrate and the iOS container-move problem

`hydrate()` (called from the root layout) reloads the registry and prunes it:

1. **Adopt legacy (pre-connection-scoping) downloads.** An entry saved by an
   older build has no `connectionId`: each is passed to
   `engine.migrateLegacyBook(libraryId, path, target)`, which moves its files
   once into the scoped location (or deletes them when the target is `null`),
   then re-keyed under `(target, libraryId, path)`. The `target` comes from
   `adoptionTarget()` - the active connection, else the first, else `null` -
   which needs the connection list, so hydrate `await whenSessionReady()` first
   (the session store hydrates in parallel and itself migrates a legacy
   single-session install into the connection list, so reading it any earlier
   would see none). This runs **only when a legacy entry exists**; once every
   entry carries a `connectionId`, hydration skips the session wait.
2. **`relocateEntry`.** Downloads store *absolute* file URIs, but the iOS
   app's document-container path can change between installs - notably across
   dev rebuilds. A persisted URI then goes stale even though the file is still
   on disk at the same relative location; without relocation the existence
   check below fails and the book is dropped **and deleted**. `relocateEntry`
   rebuilds every file URI (and `cover.jpg`) from the live root via
   `engine.localUri(connectionId, libraryId, path, fileName(i, relPath))`. This
   only works because the on-disk filename scheme is owned by the store
   (`fileName` + `cover.jpg`) and `engine.localUri` computes the same
   deterministic layout - **keep those two in agreement**. Web implements
   `localUri` too: its cache URLs are stable keys rather than container paths, so
   there is no drift to correct, but a legacy download adopted into a connection
   on hydrate has been re-put under the new scoped prefix - relocation recomputes
   its URL there as well so the existence check finds it.
3. **`reviveEntry(entry, allPresent)` decides what survives** (pure, tested). An
   entry with no listed files, or with any listed file failing `engine.fileExists`,
   is dropped and its folder removed. A `downloaded` entry stays as it is. Anything
   else comes back as `error` keeping its files: a failure keeps its classified
   `failure`, a download the app closed mid-way becomes `{ kind: 'interrupted' }`
   ("The app closed before it finished"), and `kept`, `progress` and `bytes` are
   recomputed from the files really on disk. The engines can't resume a
   half-written file, so Retry starts that one again and skips the rest. No engine
   or storage format change came with this.
4. Surviving `downloaded` manifests **seed the React Query cache** (`qk.item(connectionId, …)`
   and `qk.chapters(connectionId, …)`), so the book screen renders instantly
   offline, through `seedQuery` ([its rules](#seeding)), dated with the manifest's
   `savedAt`. Then the kept community metadata is restored
   ([the offline companion](#the-offline-companion-offline-metats)).
5. On web, `probe()` then runs and may downgrade `supported` - the UI hides
   downloads rather than offering ones that won't play offline.

**Purge on connection removal.** The store registers an `onConnectionRemoved`
handler (from `src/stores/session.ts`): when a connection is removed (Settings →
Servers, or sign-out), it aborts any in-flight transfer for that connection,
deletes its books' files (`engine.removeBook`), and drops their entries. Re-adding
the server mints a **new** id, so those records would otherwise be unreachable
forever. The connection-remove and sign-out UI warn the user first when the server
has downloads on the device.

## The offline companion (`offline-meta.ts`)

A downloaded book keeps its **community metadata**, so the book page (About,
Recaps, Characters, Series, the previous books' catch-up), the player's companion
and the Home cards that read it work with no network. The spoiler gate is
unchanged: it still runs on the device against the listener's place
(`meta-gating.ts`); nothing here decides what to show.

**What is kept** (`OfflineMeta`, version 1): the `/meta` envelope as the server sent
it (an unmatched answer too, so the book reads as unmatched offline instead of
waiting), `savedAt`, whether it was asked with `include=previous` (`meta_bundle`),
and `works` (the nearest earlier work in the reading order the listener picked, read
on its own through `/meta/work` when the envelope's `previous` doesn't hold it:
`previousWorks(seriesRails(...))`, the same rule as the book page's rows).
`parseOfflineMeta` reads it back defensively; anything it can't read is simply
ignored and fetched again when possible.

**The server's flags are kept apart.** Every reader of community metadata first waits
on the `metadata` flag, which a cold start with no network never answers, so each
connection's last `/server` answer is kept once, in one small document by connection
id (`OFFLINE_SERVERS_KEY`, `audiosilo.offlineServers`): `saveServerSnapshot` after a
book keeps its metadata (never over a newer one), `forgetServerSnapshot` when the
connection's downloads are purged, and a storage reset wipes it with the rest of the
scoped cache (`SCOPED_STORAGE_KEYS` in `stores/session.ts`).

**Where it lives:** in its own `meta.json` beside the book's audio (`writeText`),
never in the registry. The registry is one JSON document saved every couple of
seconds while a download runs, and an envelope with its characters and recaps can be
hundreds of KB; AsyncStorage on Android and `localStorage` on web cap the whole
store at a few MB. Beside the audio it is connection-scoped like the files, deleted
with them, and survives a relaunch. The manifest carries only a marker
(`DownloadManifest.meta = { savedAt }`).

**Keeping it** (`keepOfflineMeta(key)`):

- *When it runs:* after a download completes, apart from it (a failure never fails or
  holds up the book), **once per download per launch** (`metaTried`, keyed by the
  entry's `savedAt`, so a book removed and downloaded again tries afresh; no retry
  storm against an unreachable server). Many books in a row write the registry once
  (`persistSoon`). If the download was removed or replaced while the file was written,
  the marker isn't set, and a removed book's file is deleted again.
- *What `captureOfflineMeta` skips:* a book that can't match (no ASIN or ISBN:
  `canMatch`, reading the cached full item first, since the manifest's book can be the
  list shape) and a server without `metadata`. It reads through the screens' own
  option factories (`bookMetaQuery`, `metaWorkQuery`), so a fresh answer they hold is
  reused, never throws and never retries.

**Restoring it** (`restoreOfflineMeta`, from hydrate):

1. Waits until the launch's first screens are up (the next idle moment,
   `requestIdleCallback`, else a moment later).
2. Reads the kept files, three at a time, and seeds every payload.
3. Seeds each such connection's kept `/server` answer where the cache has none (after
   the books, so a gate it opens finds their data).
4. One book at a time, only for servers with `metadata` (each server's flags read
   once): fills in downloads that kept nothing or whose file can't be read, and
   refreshes copies older than a week (`KEPT_META_REFRESH_MS`), so what a book carries
   offline follows the community's edits.

### Seeding

Every seed of a downloaded book goes through `seedQuery`: never over an answer the
cache already holds (the server's, so a fresh one always wins, and at least as full:
the manifest's book can be the list shape), dated so an online screen still refetches
once stale, and kept for good (`setQueryDefaults(key, { gcTime: Infinity })`), so a
book downloaded an hour before a flight still opens offline long after launch.

`seedOfflineMeta` seeds `qk.bookMeta(cid, lib, path)` (the plain request every reader
uses: the book page, `useBookCommunity` behind the companion, the reveal listener and
Previously on, Home's Now card, the end credits, the series page's anchor and
Search's character sources), the `include=previous` variant when the payload was
fetched that way, and `qk.metaWork(cid, id)` for every kept work (the previous-books
rows and the work series page). The `spoilers=hide` variant is never stored: it is cut
at the saved place when fetched. `seedServerSnapshot` seeds `qk.server(cid)` only where
the cache has none, so the app holds the flags it held when it was last online until
the server answers. A previous-book row with an answer in hand shows it even when its
refetch fails (`book-meta.tsx`), which is what a kept work looks like offline.

## Keep the next books ready (`keep-ahead.ts` + `keep-ahead-controller.ts`)

The `keepAhead` setting (`0 | 1 | 2 | 3`, default `0` = off) downloads the next N
books **after** the loaded one. It sits beside the existing automatic download
(`maybeAutoDownloadCurrent` in `src/playback/store.ts`, which downloads the book you
*start* under `autoDownloadNext` - see
[Auto-download on play](end-of-book.md#auto-download-on-play)): both obey the same
network rule, and both ask the downloads store's `download()`, which applies the
same declined mark and reserve to both and runs one book at a time. The current book
goes first among the waiting downloads: the store queues it the moment playback
starts (behind any download already running) while keep-ahead waits `SETTLE_MS`
(4 s) after any change before it plans, and keep-ahead's books still queued step
aside if they are in its way. A keep-ahead download already running finishes first;
if its remaining bytes leave no room, the store answers `no-space`, which the
playback store does not retry.

**The planner** (`src/downloads/keep-ahead.ts`) is pure and tested:

- `aheadWindow` - the next `count` books after the current one: the Up next queue
  first, then the series, without the current book, finished books or repeats.
- `planKeepAhead` - for each book of the window a `SlotState`: `ready` (on the
  device), `active` (queued or downloading), `failed` (left for the listener to
  retry), `declined` (cancelled or removed this session; it keeps its place, the
  planner never reaches past it for another), `waiting` (the network rule says
  not now), `no-space`, `later` (room unknown: one download at a time),
  `unavailable` (this device can't keep it: a web browser that plays it through the
  server's transcoder; left alone in its place), or `start`. A book the store turned
  away for room although the plan thought it fit (`tooBig`: the full item is bigger
  than the list said) reads as no room.
  Space: `roomLeft(storage, pending)` = `free - pending - reserveBytes(capacity)`, where `reserveBytes` is
  `max(1 GB, 10% of capacity)`, `pending` is what queued and running downloads
  still have to write, and a book's need is `estimateBytes` (its size, else its
  length at about 128 kbps, else 1 GB). Books start in window order and stop at the
  first that doesn't fit. The plan's `status` (`off`, `never`, `idle`, `working`,
  `no-space`, `waiting`, `failed`, `ready`, `declined`, `unavailable` - "This
  browser can't keep the next books offline.") is what the status line says.

**The controller** (`keep-ahead-controller.ts`, framework-free, started once by
`startKeepAhead()` from the root layout like `startAutoSleep`) gathers the inputs
for the **loaded book's** connection: its capabilities, the queue (when `queue`;
entries without `book` can't be downloaded and are skipped), the finished set from
`allProgress`, and, only when the queue leaves room, the series - the server's
`/next` answer step by step when it has `next_book`, else the folder's next sibling
(`resolveNextBook`) - nearly the order `resolveUpNext` plays books in at the end of
a book, so the book kept ready is usually the book that plays (keep-ahead also skips
finished series books, follows the loaded book's series after a short queue, and
plans nothing when `/next` fails, where the resolver falls back to the folder). It
reads the network gate from
`autoDownloadNext` (`never` → status `never`; `wifi` on a metered connection →
`waiting`), the storage estimate and the registry, publishes `{ status, slots }` to
the `useKeepAhead` store, then for each `start` fetches the full item and chapters
and calls `download(..., 'keep-ahead')` unless the book was registered meanwhile
(an errored entry too: keep-ahead never retries a failure); a `transcoded` outcome
marks the book `unavailable` and a `no-space` one `tooBig` (until the registry
changes), and the same run plans again at once without it. Between runs it re-plans
(one `SETTLE_MS` timer, and once more if something changed
during a run) on the loaded book, the two settings, the registry's statuses (not
byte counts), any successful `queue` query, and on native a network change. It
never throws and reports nothing to reachability: a server that can't be reached
just plans nothing this time.

## The Downloads page

`src/components/downloads/downloads-screen.tsx` (the `/downloads` route
re-exports it) renders what the pure `src/downloads/downloads-view.ts` returns:

- `splitDownloads` - **In progress** (running, then waiting in the order asked, then
  failed) and **Ready offline** (newest first); `groupByServer` groups the ready ones
  in connection order (unknown connections last).
- `storageBar` - one segment per server, taking the chart colours in
  `CHART_ORDER` (`chart-2..5`, then `chart-1`: the brand pink comes last, so the
  page keeps one pink thing; a sixth server and on fold into "N more servers"), an **Other apps** segment on a device (`capacity - free -
  ours`; a browser can't see other apps), and `used` preferring the engine's
  `totalBytesUsed` over the registry's sum. `useStorage` re-reads both only when a
  book lands or leaves.
- `unsupportedReason` - `insecure`, `no-cache` or `no-worker`, for the page's
  unsupported state.

Keep-ahead's held-back books (`waiting`, `no-space`, `later` slots not in the
registry yet) render as `PlannedRow`s in In progress; entries with `origin:
'keep-ahead'` are labelled "Kept ahead". A failed row for a book this browser now plays through
the server's transcoder (`useNeedsWebTranscode`) offers no Retry - the store would
refuse it - and says why ("This browser can't play this book offline. Remove it to
free the space."), leaving only Cancel. The **Automatic downloads** card
(`rules-card.tsx`) edits `autoDownloadNext`, `keepAhead` and `autoDeleteFinished`;
Settings and the series page's `KeepAheadCard` show the same control and status
line (`KeepAheadControl`, `KeepAheadStatusLine`). The summary line is published into the sub-nav with
`SubNavActions`.

## Playing downloaded content

Two paths, both in `src/playback/store.ts`:

- **Downloaded before play**: `playBook` looks up the entry; if
  `status === 'downloaded'` it passes a `local` map
  (`relPath → localUri`, plus the local cover) to `buildBookQueue`, which
  points every track at its local URI and drops auth headers. Resume still
  works fully offline because `loadInitialProgress` falls back to the durable
  local mirror / offline queue (see [Playback](playback.md)).
- **Downloaded while streaming**: a `useDownloads.subscribe` listener watches
  for the currently-playing book flipping to `downloaded` and calls
  `switchCurrentBookToLocal`, which rebuilds the queue against the manifest and
  prefers the engine's **gapless `swapTo`** (buffer the local source in
  parallel, then switch at the same position). A refused swap - e.g. the web SW
  isn't controlling the page - leaves the streaming queue untouched, so
  playback never dies from trying to go local. The store only commits the new
  queue once the engine has actually moved.

## The PWA layer

### `public/sw.js`

Hand-written, no build step; Expo's static export copies `public/` verbatim, so
it is served at `<base>/sw.js` with scope `<base>/`. It has exactly two jobs:

1. **App shell.** Navigations are **network-first**, falling back to the cached
   response for that route, then to the cached scope root (a shell that boots
   the SPA), then a 503. Static assets with destinations
   `script | style | font | image | manifest` are **stale-while-revalidate**
   in `audiosilo-shell-v1`; the `install` step precaches the scope root.
   API calls (destination `''`) and server-streamed audio pass straight through
   to the network - the SW never caches API data.
2. **Offline media.** Requests whose path contains `/_offline/` are answered
   from `audiosilo-media-v1`. A `Range` request is satisfied by slicing the
   cached response's Blob (`blob.slice` is O(1) and streams only the requested
   bytes - reading the whole file into an ArrayBuffer stalled seeks for
   seconds) into a proper **206** with `Content-Range`, or a 416 for an
   unsatisfiable range. This matters beyond seeking: Safari refuses a 200 for
   media, so without the 206 path downloaded books wouldn't play there at all.

`activate` deletes old shell cache versions but **never** the media cache -
downloads must survive SW updates. When registered with `?dev=1` (the Metro dev
server), the worker serves offline media only and leaves the shell to the
network, so its caching can't fight hot reloading.

### `public/manifest.json`

The install manifest: name/short name, `display: standalone`, `start_url` and
`scope` of `.` (resolved relative to wherever the export is mounted, i.e.
`/web/` in production), theme color `#db2777` on the dark background, and
192/512/maskable icons. It is linked (base-prefixed) from the exported HTML
shell in `src/app/+html.tsx`.

### Registration wiring

`src/lib/register-sw.web.ts` registers `<BASE_URL>/sw.js`, appending `?dev=1`
under the dev server; it no-ops without `serviceWorker` support or a secure
context. It registers **at once when `document.readyState` is already
`complete`**, else on `load`. The module runs when the root layout is first
required, which in the static export is usually after `load` has fired; it used to
only add a `load` listener, which then never ran, so the exported player never
registered its worker (no offline shell, and downloads that never became playable
offline). `register-sw.web.test.ts` pins both paths. `register-sw.ts` is the native no-op twin; the
root layout imports `@/lib/register-sw` for its side effect and Metro picks the
right file per platform.

### What offline actually covers on web

| Works offline | How |
|---|---|
| Launching the installed PWA / revisiting routes | network-first navigation falling back to the cached shell |
| The app's JS/CSS/fonts/icons | stale-while-revalidate asset cache |
| Playing **downloaded** books, including seeking | `_offline/` URLs + Range slicing from the media cache |
| Book/chapter metadata for downloaded books | manifests seeded into the React Query cache on hydrate |
| Progress while offline | the offline replay queue + durable mirror in `src/playback/progress-sync.ts` |

Not covered: live API data (browse/search/covers for non-downloaded books) -
the SW deliberately never caches API responses; screens render their
empty/error states behind the offline banner, and everything refetches on
reconnect (see [State & data](state-and-data.md)).
