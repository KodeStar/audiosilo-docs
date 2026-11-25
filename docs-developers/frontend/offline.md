---
title: Offline & PWA
description: "How the player downloads books on native (expo-file-system) and web (the Cache API and a service worker): the registry store and its manifest, failures that keep finished files, the ebook and read-along map in a download, the listening-sync outbox, the offline companion (community metadata kept with a download), keeping the next books ready, the Downloads page, playing local files, what the PWA layer covers offline, and how a dialog reads offline."
---

Offline support has two halves that meet in the middle:

- **Downloads** (`src/downloads/`) save a book's audio files, its cover, its ebook
  (when it has one) and its metadata locally, per platform.
- **The PWA layer** (`public/sw.js`, `public/manifest.json`,
  `src/lib/register-sw{,.web}.ts`) is web only. There the service worker makes both
  the app shell *and* the downloaded media playable with no network.

The playback layer consumes the result. A downloaded book plays from local URIs with
no network. A streaming book hot-swaps onto its local files as soon as its download
finishes.

## The `DownloadEngine` interface

`src/downloads/types.ts` defines a storage engine with the same interface on every
platform. Metro resolves it exactly like the playback service: `engine.native.ts` or
`engine.web.ts`, with `engine.ts` as an unsupported stub for type resolution. Its
methods:

- `downloadFile(connectionId, libraryId, path, fileName, url, onProgress?,
  signal?, headers?)` returns a local URI. The `headers` go with the request only
  and are never stored. The ebook uses them for its `Authorization` header, because
  its route takes no `?token=`.
- `readFile?(localUri)` returns a stored file's bytes as an `ArrayBuffer`, or null
  when the file is missing or unreadable. It is web-only and reads straight from the
  media cache, not through the service worker. The web reader opens a downloaded
  book's ebook with it. The app's reader reads its file in chunks itself
  ([The ebook reader](reader.md#the-app-host)).
- `fileExists(localUri)`.
- `verify?(localUri)` answers *can this file be played back offline right now?* It
  is stronger than existence. Web-only.
- `probe?()` answers *does offline playback work at all in this environment?* It is
  a self-test that needs no real download. Web-only.
- `localUri?(connectionId, libraryId, path, fileName)` recomputes a stored file's
  current URI from the live storage root (see
  [relocation](#hydrate-and-the-ios-container-move-problem)). **Both engines**
  implement it:
  - Native rebuilds the absolute path in the current container, which drifts
    between installs.
  - Web recomputes the deterministic virtual cache URL, so a legacy download adopted
    into a connection on hydrate picks up its new connection-scoped prefix.
- `migrateLegacyBook(libraryId, path, target)` adopts a download made before
  connection scoping, once. It moves the files under `target`'s scoped location and
  returns `true`, or deletes them and returns `false` when `target` is `null`. See
  the migration step in
  [Hydrate and the iOS container-move problem](#hydrate-and-the-ios-container-move-problem).
- `removeBook(connectionId, libraryId, path)` and `totalBytesUsed`.
- `writeText?(connectionId, libraryId, path, fileName, text)`, `readText?(...)` and
  `removeFile?(...)` handle a small text file kept **with** a downloaded book's
  files, so `removeBook` and `clearAll` take it too. The offline companion's
  `meta.json` is one ([The offline companion](#the-offline-companion-offline-metats)).
  - Native writes it in the book's folder and never creates the folder. A book
    removed meanwhile has no folder, so `writeText` resolves `false`.
  - Web puts it in the media cache under the book's prefix and reads it back from
    the cache directly, never through the service worker.
- `storageEstimate?()` reports how much room there is, as a `StorageEstimate {
  scope, capacity, free }`, or null when the platform can't say. The Downloads
  page's storage card and keep-ahead's space rule read it.
  - Native reports the disk: `Paths.totalDiskSpace` and `availableDiskSpace`, with
    scope `device`. Since SDK 58 the iOS bridge sends native `Int64` values as a JS
    `bigint`. These two, `File.size` and a download's progress are such values, so
    read them through `nativeNumber` in `src/lib/native-number.ts`.
  - Web reports the origin's quota from `navigator.storage.estimate()`, with scope
    `browser`. `free` is the quota minus everything the site stores. Other apps' use
    can't be known there.

Every content operation takes the **connection id** (`Connection.id` from the session
store) as its first coordinate. This is the same `(connectionId, libraryId, path)`
scoping all client state uses (see [State & data](state-and-data.md)). Two servers
can each have a "library 1", so a download addressed by `(libraryId, path)` alone
would collide. Threading `connectionId` through the storage keys and the file layout
keeps them apart.

### Native engine (`engine.native.ts`, expo-file-system) {/* #native-engine-enginenativets---expo-file-system */}

The native engine uses the **new expo-file-system API** (`Directory`, `File`,
`Paths`). Files live under the **document directory**, which is persistent and is
not evicted like a cache:

```
<Paths.document>/downloads/<connectionId>/<libraryId>/<slug(rel_path)>/
    0.mp3, 1.mp3, …      # fileName(i, relPath): file index + original extension
    cover.jpg
    book.epub            # the book's ebook, when it has one (optional)
    readalong.json       # its read-along map, beside book.epub (optional, Bridge Phase 3c)
```

The completed download’s size is the sum of the files actually saved. On iOS, an MP3 remux can be smaller than the Matroska file listed by the server.

`fileName` keeps the file's own extension, with one exception. **On iOS** a `.mka`
is saved as `<i>.mp3`:

- A server with ffmpeg sends an MP3-in-Matroska file as its MP3 remux at the same
  URL.
- AVFoundation picks a local file's type by its extension, so on iOS those bytes
  must not land under `.mka`.
- Raw Matroska, from a server without the remux, won't play on iOS whatever it is
  named.

Android's Media3 sniffs the bytes and the web plays by `Content-Type`, so both keep
`.mka`.

`slug()` is `pathSlug` in `src/lib/path-slug.ts`, shared by both engines and the
reader's EPUB cache. It is the sanitized tail of the book's `rel_path` (at most 40
characters) plus a djb2 hash of the full path, so it is both readable *and*
collision-proof.

Downloads run through
`File.createDownloadTask(url, dest, { onProgress, signal, headers })`, so they report
byte progress and honor an `AbortController`. On native disk a file that is present can be played, so the native engine omits `verify` and
`probe`.

### Web engine (`engine.web.ts`, Cache API and service worker) {/* #web-engine-enginewebts---cache-api--service-worker */}

There is no filesystem on web. The web engine keeps downloaded bytes in the **Cache
API**, in the cache `audiosilo-media-v1` (a name kept in sync with `public/sw.js`).
Each file lives under a **synthetic same-origin URL** inside the service worker's
scope:

```
<origin><BASE_URL>/_offline/<connectionId>/<libraryId>/<slug(rel_path)>/<fileName>
```

The `<connectionId>` segment needs **no service-worker change**. `public/sw.js`
matches offline media by `path.includes('/_offline/')`, so it serves the scoped URLs
unchanged. The store treats that virtual URL exactly like a native `file://` URI.

At play time the service worker intercepts requests for `…/_offline/…` and serves the
cached bytes **with Range support**, so a downloaded book plays in `<audio>` with no
network.

Implementation notes worth knowing before you change it:

- The engine **streams the response body straight into the cache** through a
  `TransformStream` that counts bytes for progress. Buffering a multi-GB audiobook
  into a Blob first risks running out of memory on mobile.
- When the server sent no `Content-Length`, the engine stores the entry again with
  the now-known length, still streaming, from cache to cache. `totalBytesUsed()`
  sums `Content-Length` across the cache, so without this the book would count as
  0 B.
- The engine requests `navigator.storage.persist()` once. Durability is
  best-effort; browsers grant it silently for installed PWAs.
- `verify(localUri)` fetches the URL with `Range: bytes=0-0` and requires a **206**.
  Only the service worker's media handler produces one. The network or SPA fallback
  for an unknown path won't, so a 206 proves that the service worker, not the
  server, answered.
- `probe()` round-trips a 1-byte throwaway file through `…/_offline/__probe__` and
  cleans up. That proves offline playback end to end without a real download. The
  UI can then hide downloads up front where they would never play: with no
  controlling service worker, in an insecure context, or in an SSR pass.
- `hasControllingSW()` waits for `navigator.serviceWorker.ready` for at most
  **10 s**, then up to 3 s more for a first-ever registration to claim the page,
  before it gives up. `ready` never settles when no worker registers at all, because
  registration failed or a browser or policy blocks it. Unbounded, the probe hung,
  and the page kept offering downloads that could never play offline. 10 s leaves a
  first visit's worker time to install.

## The registry store (`src/downloads/store.ts`)

A podcast episode downloads like a one-file book. Its `rel_path` is its file, so its
key and its folder on disk follow the same rules. One that is not on its server yet
waits for its server first, outside the queue
([An episode not on its server yet](#an-episode-not-on-its-server-yet)). Keep-ahead
never plans episodes. It tells them apart by the entry's library kind. See
[Podcasts](podcasts.md#downloading-episodes).

`useDownloads` is a Zustand store. It keeps a `Registry` of `DownloadEntry` keyed by
`downloadKey(connectionId, libraryId, path)`, which is
`"<connectionId>:<libraryId>:<path>"`. The registry is persisted as JSON under
`audiosilo.downloads` in AsyncStorage. Every entry carries its `connectionId`.

**Entry shape** (`src/downloads/types.ts`):

| Field | Holds |
|---|---|
| `status` | `queued`, then `downloading`, then `downloaded` or `error` |
| `progress` | aggregate progress, 0..1 |
| `bytes`, `totalBytes` | bytes written and the expected total |
| `error` | an optional message |
| `failure` | a classified `DownloadFailure` for an `error` status ([Failure classification](#failure-classification)) |
| `origin` | `listener` (the default when absent), `auto` (the playback store's download of the book you start) or `keep-ahead` |
| `serverFetch` | set only while a podcast episode waits for its server to fetch it: `{percent}`, the server's share done, or `null` while it doesn't know the size |
| `manifest` | the offline source of truth (below) |

The **manifest** is everything the player needs to build a queue and render with no
network:

- the full `Book` and the `ChaptersResponse`;
- the ordered `files`: each `relPath` with its `localUri`, plus the `bytes` written
  (absent on entries saved before that was recorded);
- `coverUri`;
- `ebookUri?`, the book's `book.epub`. It is absent when the book has no `ebook`,
  when the ebook couldn't be fetched, and on downloads made before ebooks were kept;
- `readalongGeneratedAt?`, the `generated_at` of the read-along map kept as
  `readalong.json`. It is set only with `ebookUri`
  ([The read-along map in downloads](#the-read-along-map-in-downloads));
- `readalongBytes?`, that map's size, counted in the entry's `bytes` and
  `totalBytes`;
- `ebookSha256?`, the sha256 of the ebook the first kept map was made from, which is
  `book.epub`. It stays when the map is dropped;
- `showTitle?`, a podcast episode's show title as the app knew it when the download
  started. The Downloads page shows it under the episode, and falls back to the
  show's folder name when it is absent;
- `savedAt`.

### Lifecycle

#### Queue

`download(connectionId, libraryId, book, chapterData?, origin?)` registers a
`queued` entry and pushes its key onto a module-level FIFO. **One book downloads at a
time** (`runQueue`, `runOne`).

The call resolves a `DownloadOutcome`, so a caller can act on a refusal. It is
`queued`, or the reason it refused: `exists`, `unsupported`, `transcoded`,
`declined` or `no-space`.

- A repeat request for an entry that is not in error is ignored. An `error` entry is
  retried, keeping its manifest's finished `files` and chapters.
- On web it refuses a book that streams through the server's transcoder
  (`webTranscodeFromCache`, see
  [Playback](playback.md#web-transcode-negotiation-transcodets)). That book's raw
  files would not play offline in that browser. Refusing here covers the book page,
  the automatic download and keep-ahead alike.
- It is the **one choke point for the automatic rules**. For the `auto` origin (the
  book you start) and the `keep-ahead` origin, it refuses a book the listener
  declined this session and a book that would eat into the reserve (`roomLeft`).
  When the room can't be known, the download starts, one at a time. The listener's
  own download is never held back.
- The book you start outranks keep-ahead's books that are still **queued**. When
  only they stand in its way, they step aside and it goes next. They are not
  marked, so keep-ahead plans them again around it.

No `ApiClient` is passed in. `runOne` resolves the entry's **own** server client with
`resolveClient(entry.connectionId)` (`src/api/connection-clients.ts`), so queued
downloads from two servers never race a shared client. When a queued download's
connection was removed, `runOne` errors the entry instead of downloading against the
wrong server.

#### An episode not on its server yet

An episode row hands `download()` a list shape with no chapters. When its server has
the file, the store reads the item and its chapters first, so the download gets the
file's own size and `id3_chap` chapters. It keeps the show's title from the cache in
`manifest.showTitle`.

An episode its server doesn't have answers `503` to the stream until the server has
fetched it, and the queue runs one book at a time. One such episode on the queue would
hold up every download behind it, so it waits in `src/downloads/episode-ready.ts`
instead (`waitForEpisode`). The store sends an episode there when `isAbsentEpisode`
says so, when its last try failed as `serverFetch`, or when its last try got a `503`.

- The entry stays `queued` with `serverFetch: {percent}`. The row, the control and the
  progress line read "Getting it on your server" (`serverFetchLabel`).
- The wait asks the stream once (`prepareEpisodeStream`), which starts the server's
  fetch. The listener's Retry after a failed fetch POSTs instead. An automatic
  download's own retry never POSTs, so it respects the server's cool-down.
- It then follows the fetch status every `max(2, Retry-After)` seconds, in the
  foreground only. A step due in the background runs when the app comes back.
- At most three waits ask one connection at once (`MAX_WAITING`). The rest wait
  their turn, which leaves room under the server's limit of five fetches for the
  listener's own plays.
- The fetch limit, a `429` and network blips wait and ask again (`blipDelay`). A
  fetch that failed or can't be made ends the entry in `error` with a `serverFetch`
  failure carrying the server's code. `identity_changed` also marks the item and the
  library's episode lists stale.
- A cancel or remove stops the wait (`stopWaiting`). The server's fetch carries on.
- A launch turns a saved waiting entry into an interrupted download (`reviveEntry`).

When the server has the file, `episodeWaitEnded` reads the item and chapters again
(`fetchFailFast`), marks the show's episode lists stale and puts the entry on the
queue. The wait can be long, so it decides again what `download()` decided before
it. An `auto` download that the network rule no longer allows is dropped with no
decline mark (`canAutoDownload`), so the next start asks again. So is one this
browser turns out to play transcoded.

The poll and back-off rules are shared with the player's fetch in
`src/playback/episode-fetch-rules.ts`. That file imports almost nothing, because the
downloads store loads at launch and must not pull in the player's start path.

#### Run

`runOne` takes its file specs from `bookFileSpecs` in `src/playback/book-queue.ts`,
so **download order ≡ play order**. It fetches, in this order:

1. the cover;
2. each audio file, through `api.streamUrl(libraryId, path, true)` (the
   `download=1` variant), patching `progress` and `bytes` per chunk;
3. the ebook, when `book.ebook` is set, through `api.ebookRequest` with the
   `Authorization` header, saved as `book.epub`;
4. with the EPUB saved, the book's read-along map
   ([The read-along map in downloads](#the-read-along-map-in-downloads)).

The ebook comes after the audio, so an attempt that fails on the audio never fetches
it, and a retry fetches it once.

The cover and the ebook are **extras**. Each is optional: a failure is swallowed and
the book saves without it, so a failed ebook never fails the audio download. A cancel
during one still cancels the whole book. The read-along map is optional in the same
way.

`totalBytes` is the sum of the audio file sizes when every spec knows its size, else
0.

#### Verify before claiming success

When the engine has `verify` (web) and the first file can't be served offline, the
store marks the entry `error` with a "reload the app, then retry" message. It
**keeps the cached bytes** for the retry. So the downloaded badge never shows for a
book that can't play offline.

#### Errors keep the finished files

A failed run marks the entry `error` with
`failure = { ...classifyDownloadError(e), kept }`. The manifest keeps the files that finished. The file being written is
partial, and a retry writes over it. `kept` is the share of the book's files that
finished (0..1), so a single-file book keeps nothing.

A retry first reads the book's item and chapters afresh (`download`, with
`staleTime: 0`). The caller's lists come from the query cache, kept up to 30
minutes, or from the failed download's saved copy, and either can still list a file
the server has since removed. The read is `fetchFailFast`, so offline it fails at
once and the retry goes on with the lists it was given.

It then plans by path (`retryPlan`). It walks the specs in order and **skips** a
file the manifest lists with the same `relPath` that still exists on disk, wherever
the server's list now puts it, under the name it was saved by. So a list that
gained, lost or reordered a file fetches only the new files. Each file still to
fetch gets a name no kept file holds: its index when that is free, else the next
free number past the list (`storedIndex` reads either). A kept file whose path the
server's list no longer holds (`unlisted`) is deleted before the fetches
(`engine.removeFile`), since no later manifest names it and nothing else would delete
it. A file stored under a kept file's name is never deleted. If the retry fails again, the manifest
still lists the kept files it had not reached.

`runOne` lists each finished file in the persisted entry as it lands, so this
survives a restart too (`reviveEntry` in
[Hydrate and the iOS container-move problem](#hydrate-and-the-ios-container-move-problem)).

#### Failure classification

`classifyDownloadError` (`src/downloads/failure.ts`) maps whatever the platform threw
to a kind. What it reads includes a fetch `TypeError`, expo-file-system's native
messages, a `QuotaExceededError` and the web engine's `Download failed (404)`.

| Kind | Set by | Means |
|---|---|---|
| `network` | `classifyDownloadError` | a network failure |
| `server` | `classifyDownloadError` | a server error, with the HTTP `status` |
| `storage` | `classifyDownloadError` | a storage failure |
| `unknown` | `classifyDownloadError` | anything else; entries saved before classification read as `unknown` too |
| `unservable` | the store | saved, but the web worker can't serve it yet |
| `removed` | the store | the entry's connection is gone |
| `interrupted` | the store, on hydrate | the app closed mid-download |
| `missing` | the store, on hydrate | a finished download with some of its files gone from the device |
| `serverFetch` | the store, when an episode's wait ends | the server couldn't fetch the podcast episode, or can't now. `code` holds the server's code, which `failureText` words through `fetchReasonKey` after `{{server}} couldn't get this episode.` |

The Downloads page words each kind for the listener. A kind this build has no words
for (one a newer build saved, read after a downgrade) reads as `unknown` ("The download stopped.")
rather than breaking the page.

#### Cancel and remove

- A **cancel** (`cancel()`) aborts the in-flight controller and removes the files
  *and* the entry. A run counts as cancelled only when its **own** signal aborted
  (`ctrl.signal.aborted`), never by the error's text. Android reports a dropped
  connection as "Software caused connection abort", and that failure keeps its files
  like any other.
- `remove()` is the delete the listener asks for. It aborts, calls
  `engine.removeBook` and drops the entry. Files on the server are never touched.

Both add the book to a **session-only decline mark** (`isDeclined(cid, lib, path)`,
a module-level `Set` that is never stored). No automatic download then fetches a book
the listener just cancelled or removed, including a book removed by "remove a
download when you finish the book".

A `download()` with `origin: 'listener'` lifts the mark. `auto` and `keep-ahead`
never do, which is why the playback store's automatic download asks as `auto`.

#### UI

`useDownloadControls` (`use-download-controls.ts`) wraps all of this for the book
screen, the badges and the book menu (`book-actions.tsx` reads the same hook). The
`/downloads` page has its own section, [The Downloads page](#the-downloads-page).

- The hook returns a book's `status` and `error` (through the shallow-compared
  `useDownloadState`) and the start and cancel actions. It never returns the
  progress numbers, so a running download's ticks re-render none of its callers.
  `DownloadControl`'s bar reads `useDownloadProgress` itself.
- The hook's `needsTranscode` is set on web for a book that streams transcoded and
  has no entry or an errored one. A download already on disk stays removable.
  `needsTranscode` turns `supported` off, so `DownloadControl` reads "Can't download
  in this browser" rather than the generic "Downloads unavailable".
- List responses carry no `direct_playable`. So on web `download()` looks up a
  list-shape book in full (`itemQuery` and `chaptersQuery` through the cache) before
  it decides. The book menu offers Download only once its own lookup, made when the
  menu opens, says the browser plays the book directly.
- Every removal the listener starts, from the book page, the book menu or the
  Downloads page, asks first through the shared `RemoveDownloadConfirm`
  (`src/components/downloads/remove-download-confirm.tsx`). It says how much room
  the removal frees.

#### Changed chapters

A book's chapters can change on the server after it was downloaded:

- a rescan;
- a [community chapter list](../server/community-chapters.md) fitted onto its audio
  (`chapters_source: "community"`);
- the chapters a Bridge found in the narration (`"generated"`);
- an admin's list from the console's chapter editor (`"edited"`), saved or
  reverted;
- an admin switching it back.

`startChapterRefresh` keeps a download's chapters current. The root's services start
it once (`root-services-impl.tsx`). On the web they start it after the first paint,
so it first takes the `chapters` answers the cache already holds.

It subscribes to the query cache. Every **server** answer for a `chapters` query of a
`downloaded` entry goes through `refreshedChapters(manifest, fresh)`. A server answer
here is a successful fetch, not one of the store's own `setQueryData` seeds.

`refreshedChapters` replaces `manifest.chapters` only when both of these hold:

- The answer's audio files are the ones on the device. `bookFileSpecs` gives the same
  paths in the same order, with the same sizes where both answers know them. A file
  replaced at the same path doesn't pass.
- The answer differs.

The store then patches and persists the entry (`persistSoon`, so a burst saves once).
Different files mean the local audio no longer matches, which needs a new download,
so the manifest stays.

An answer can arrive while the book is still downloading, or before the launch's
hydrate read the registry. The store takes such an answer from the cache when the
download finishes and at hydrate (`withCachedChapters`).

The audio is never touched. A queue already playing keeps its chapters until the book
is next started.

#### A new file order

Server 2.4.0 plays a folder book's files in natural order (`2-` before `10-`) and
re-indexes a book stored in byte order. A download can then hold the same files in
another order.

`refreshedChapters` does **not** take the same files in another order from a
background answer; it returns null for them. JS sees only the queue it loaded. It
does not see a book that the Android service or a Cast receiver holds before
`adoptLoaded` or the receiver adoption takes it over.

The new order is taken only where the engine plays it, through
`adoptStartedChapters`. It replaces `manifest.chapters` (same set of paths, same sizes
where both answers know them) and saves the registry at once. Three takers call it:

- `playBook`, once its load landed and it still owns the engine.
- `adoptLoaded`, when the engine already plays the new order. `adoptLoaded` reads the
  engine's own order (`LoadedBook.files`) and takes the server's chapters only when
  they are exactly that order. Otherwise it reloads the engine in the manifest's
  order (see [The engine's file order](native-integrations.md#the-engines-file-order)).
- The [hot-swap](#playing-downloaded-content). A copy that lands while that start's
  order streams (a pre-2.4.0 download retried, say) takes the start's chapters, as
  the start's own load would have, when they give the order the engine plays.

The chapters carry the play order. `manifest.files` keeps the order the download
wrote it in, since a file's index there is its name on disk. An offline start and
Android's no-JS car start keep the manifest's order until an online start plays the
new one. The Cast receiver adoption still maps its track index through the manifest.

Nothing remaps a place saved on the old timeline, so it reads as moved once the new
order is taken.

### Hydrate and the iOS container-move problem

`hydrate()` reloads the registry and prunes it. `bootstrapPlayback` calls it at
launch, from the root layout or, on Android, from the car's headless task.

While hydrate reads the registry (`hydrating`), `download` and `remove` wait for it
and `persist` holds off. So a saved book is never fetched over, put back after a
remove, or saved over by the live entries.

Hydrate runs these steps:

1. **Adopt legacy downloads.** An entry saved by an older build, from before
   connection scoping, has no `connectionId`. Hydrate passes each one to
   `engine.migrateLegacyBook(libraryId, path, target)`. That moves its files once
   into the scoped location, or deletes them when the target is `null`. The entry is
   then re-keyed under `(target, libraryId, path)`.

   `adoptionTarget()` picks the `target`: the active connection, else the first,
   else `null`. It needs the connection list, so hydrate awaits `whenSessionReady()`
   first. The session store hydrates in parallel and itself migrates a legacy
   single-session install into the connection list, so an earlier read would see no
   connections. This step runs **only when a legacy entry exists**. Once every entry
   carries a `connectionId`, hydrate skips the session wait.

2. **`relocateEntry`.** Downloads store *absolute* file URIs, but the iOS app's
   document-container path can change between installs, notably across dev rebuilds.
   A persisted URI then goes stale although the file is still on disk at the same
   relative location. Without relocation the existence check in step 3 fails, and
   the book is dropped **and deleted**.

   `relocateEntry` rebuilds every file URI from the live root through
   `engine.localUri(connectionId, libraryId, path, name)`. That includes `cover.jpg`,
   and `book.epub` when the manifest has an `ebookUri`. `name` is the file's **own
   saved name**. `storedName` reads it from the stored URI when that is `<i>` plus an
   extension, else falls back to `fileName(i, relPath)`. So a download saved under an
   older naming rule still resolves, such as an iOS 2.4.x `0.mka` where `fileName`
   now says `0.mp3`, and `playableName` can rename it.

   This works only because the store owns the on-disk filename scheme
   (`storedName`, `fileName`, `COVER_FILE` and `EBOOK_FILE`) and `engine.localUri`
   computes the same deterministic layout. **Keep those two in agreement.**

   On iOS, `playableName` renames an old `<i>.mka` to `<i>.mp3` on disk on the way
   (`engine.renameFile`). The file plays after the update when its bytes are MP3. A
   rename that fails keeps whichever name the file is under afterwards, so the file
   is never lost.

   Web implements `localUri` too. Its cache URLs are stable keys rather than
   container paths, so there is no drift to correct. But a legacy download adopted
   into a connection on hydrate has been re-put under the new scoped prefix, and
   relocation recomputes its URL there so the existence check finds it.

3. **`reviveEntry(entry, present)` decides what survives.** It is pure and
   tested. `present` says, for each file the entry lists in order, whether
   `engine.fileExists` found it.
   - A `downloaded` entry with every file there stays as it is.
   - A `downloaded` entry with some of its files gone (the system or the listener
     deleted them) comes back as `error`, keeping the files still there, with the
     failure `{ kind: 'missing' }` ("Some of its files are no longer on this
     device."). Retry then fetches only the gone files. A `keep-ahead` entry like
     that is dropped with its folder instead, because keep-ahead never retries a
     failure and plans a dropped book again. A `downloaded` entry with no file left
     is dropped with its folder.
   - Any other entry with finished files comes back as `error` and keeps those
     still on disk. `kept`, `progress` and `bytes` are recomputed from them. Its
     `failure` is:
     - its classified `failure`, for a failure;
     - `{ kind: 'interrupted' }` ("The app closed before it finished"), for a
       download the app closed mid-way;
     - `unservable`, on web with every file saved and no EPUB to come. Only the
       offline check was left, and the service worker may not control the page.
   - A failed or cut-short entry with **no** finished file left stays too (most books are
     one file). It becomes an `error` row with `kept: 0` and Retry, and the caller
     empties its folder. A `keep-ahead` entry like that is dropped instead, because
     keep-ahead plans it again and never retries a failure.

   The engines can't resume a half-written file, so Retry starts that file again and
   skips the rest. Keeping these entries needed no engine or storage format change.

   A kept list can have gaps, so at launch a file is found by the index its stored
   name says (`storedIndex`), else by its place in the list (`relocateEntry`). A
   retry finds a kept file by its path instead (see
   [Errors keep the finished files](#errors-keep-the-finished-files)).

   While an identity move is pending (`identityMovePending`), an entry is kept
   exactly as stored: never trimmed, dropped or deleted. The files may sit under the
   other id, and the launch that finishes the move finds them.

4. **Seed the cache.** Surviving `downloaded` manifests **seed the React Query
   cache** (`qk.item(connectionId, …)` and `qk.chapters(connectionId, …)`), so the
   book screen renders at once offline. The seeds go through `seedQuery`
   ([Seeding](#seeding)), dated with the manifest's `savedAt`. Then hydrate restores
   the kept community metadata
   ([The offline companion](#the-offline-companion-offline-metats)).

5. **Probe (web).** `probe()` runs from the start of `hydrate`, and hydrate applies
   its answer once the registry is read. The answer may downgrade `supported`, and
   the UI then hides downloads rather than offering ones that won't play offline.
   `download` waits for that answer (`probing`, as it waits for `hydrating`). Then it
   refuses with `unsupported` before a byte is fetched, and the control says
   "Downloads unavailable". A `download` that waited gives up (`declined`) when the
   book was cancelled or removed meanwhile (`stopCounts`).

**Purge on connection removal.** The store registers an `onConnectionRemoved`
handler (from `src/stores/session.ts`). When a connection is removed (Settings >
Servers, or sign-out), the handler:

- aborts any in-flight transfer for that connection;
- deletes its books' files (`engine.removeBook`);
- drops their entries.

The connection-remove and sign-out UI warn the user first when the server has
downloads on the device. On the web, other tabs' downloads of the connection go too
([Across browser tabs](#across-browser-tabs)).

### Across browser tabs

The web player's tabs share one stored registry, but each tab runs its own downloads.

**Each tab writes only its own changes.** `persist` writes the entries this tab
changed since it last wrote or read them (`known`, compared by object), into the
stored registry read again under `tabLock`. A tab that wrote all its entries would
lose every download another tab made meanwhile. Native has one runtime, so it reads
the registry once and then merges into the copy it last wrote (`storedCopy`).

- A save that storage refuses keeps its changes and is tried again with backoff, from
  1 s doubling to 30 s, until one lands (`saveFailed`). Meanwhile the store's
  `saveFailing` shows a warning on the Downloads page: "Downloads list not saved".
- When the page goes (`pagehide`, or hidden), the tab writes its changes at once,
  synchronously into `localStorage` (`saveRegistryOnPageHide`), because a save
  waiting on the lock never finishes in a closed tab.
- A tab follows the others' finished downloads and removals through the `storage`
  event, and once after its launch's read (`followStoredRegistry`). It never follows
  an entry for a book it is running or has changed since.

**A download on its way belongs to its tab** (`src/downloads/tab-owner.ts`). The tab
running it holds the Web Lock `audiosilo-download:<key>` from queued until its end is
saved, and keeps it while storage refuses that save. The browser frees the lock when
the tab closes or crashes.

- A tab that finds the lock held by another, at its launch's read or on a `storage`
  event, keeps the entry as stored and lists it in `elsewhere`. The Downloads page
  and the book's download control show it as "In another tab", with the progress
  that tab saves. It is never revived
  as interrupted, its folder is never emptied and this tab never saves it.
- **Cancel** and **Remove** there ask the running tab on a tab channel
  (`askOwnerToStop`).
- A held lock wins over the stored state. An entry stored as failed whose lock
  another tab holds is a retry starting there, so it shows queued (`runningElsewhere`,
  `heldAs`), never with a Retry here. A lock let go with nothing saved shows the
  stored failure again.
- The tab waits on the lock (`watchOwner`). Let go with the entry still on its way, the
  owner closed, and this tab revives the entry as a launch does (`ownerLeft`): an
  `interrupted` failure that keeps the finished files, with Retry.
- A launch reads the registry again after looking at the locks
  (`readStoredWithOwners`). An entry counts as nobody's only when it reads the same on
  both sides of a look that found no holder.

**Removing a connection** takes the other tabs' finished downloads of it from the
stored registry too, then their files. A download another tab is running stays that
tab's, and its folder is never touched from here. That tab is asked on the tab channel
to remove the connection's downloads it runs (`connectionRemoved`). Once it let each
go (removed, ended first, or the tab closed), whatever the registry still holds of it
goes, files too (`purgeWhenLeft`). A download that shows it started again since, after
signing in again or a retry, is left alone.

Without Web Locks (plain http, where downloads are off anyway) a tab can't tell whose
a download is. A download on its way then reads as cut short on reload.

## The read-along map in downloads

`src/downloads/readalong-file.ts` handles it. A download that saved the EPUB also
keeps the book's [read-along map](reader.md#read-along-following-the-narration) as
`readalong.json` beside it, so the companion's Text tab follows the narration
offline.

**When.** `wantsReadalong` decides. All three must hold:

- The EPUB is on the device. A map without it reads nothing.
- The server serves maps: `cachedCapability(cid, 'readalong')` is `true`.
- The book is not known to have only a stale map. A list-shape book says nothing
  either way; when the store asks, a 404 means none.

**How.** `fetchReadalongFile` reads the map through `client.readalong` with the
`Authorization` header, checking it span by span. It writes the map with
`engine.writeText` only once the map has a `generated_at` and a sentence to follow,
so nothing is written or removed before a checked map is in hand.

The map is optional like the EPUB. A failure keeps the book, without a map, and a
cancel cancels the book. The map's bytes count in the download's size and progress
(`readalongBytes`). Progress has one step for the map while a map is likely.

**The manifest** marks the map by `readalongGeneratedAt` only. The file is read by
name and checked again on every read (`readReadalongFile`). The manifest's
`book.readalong` names the map kept (`namingReadalong`). Offline that book is the
item's seed, and `readalongSource` reads the copy only while the book names it or
names no map.

**Kept current.** The root's services start `startItemRefresh`, on the web after
paint. It first takes the `/item` answers the query cache already holds, then watches
the server's `/item` answers for a downloaded book. `readalongChange` decides what
each answer does:

- **Another `generated_at`** (the map was made again) fetches the map again, **only
  if it was made from the download's own ebook**. `fitsEbook` checks that against
  `ebookSha256`. A download that never kept a map asks only while the server's
  `ebook.size` is the one it saved (`fitsDownload`, the reader's rule too). So a map
  of a replaced ebook never joins the old `book.epub`, and the matching copy stays. A
  failed fetch keeps the copy and the manifest as they were.
- **No ready map any more** drops the file, and the book then says what the server
  said. The exception is a stale map: the kept map was paired with the download's
  own EPUB when it was kept, and that EPUB never changes under it (a new copy is a
  new download). So it stays, whatever size the server's ebook has now, and the
  reader keeps showing it online
  ([The ebook reader](reader.md#the-map)).
- **Anything else** keeps the copy.

Each answer's map is tried once per launch (`readalongTried`). A map refused because
it was made from another ebook is remembered on the manifest (`readalongRefused`, its
`generated_at`, cleared once a map is kept or dropped), so it is not fetched again at every
launch. A map made again has another `generated_at`, so it is tried.

**Read offline.** The Text tab reads the copy with `readDownloadedReadalong`
(`qk.readalongLocal`, `networkMode: 'always'`) with the EPUB on the device. A copy
that can't be read gives way to the server's map when the server has one ready. A
server map made from another ebook than the download's is never used with it. The
Text tab says "The read-along is for a different edition of the ebook" instead
([The ebook reader](reader.md#the-map)).

A download made by an app that did not yet keep maps, or one whose map fetch failed,
has no map until `startItemRefresh` takes the book's next `/item` answer.
`readalongChange` then says `fetch`, tried once per launch. Until then the Text tab
needs the server, as for a book that isn't downloaded.

## Listening sync: the outbox

On a server with `listening_sync`, the player keeps listening made offline as events
and sends them when the server can be reached (`src/playback/listening-outbox.ts`).
The spans themselves are described in
[Playback](playback.md#listening-spans-sync-v2).

**Which path** (`usesListeningSync(cid)`). The player reads the `listening_sync` flag
from the cached `/server` answer (`cachedCapability`). On a launch that can't reach
the server, that is
[the kept `/server` answer](state-and-data.md#the-kept-server-answer-srcapiserver-snapshotsts),
seeded before any screen, so an offline cold launch still knows the flag. The outbox
keeps no copy of its own. A flag nobody has read is **unknown**, which records events
too.

Only `false`, or a confirmed rollback during this launch, takes the legacy
progress PUT path. See [Sending](#sending) for how queued events transfer.

### The three storage documents

Three storage documents hold the outbox's state. All are plain storage and scoped per
connection. The identity migration re-keys them, `onConnectionRemoved` purges them,
and a cache reset wipes them with the rest of the scoped cache.

| Key | Holds |
|---|---|
| `audiosilo.listeningOutbox` | the closed events waiting for their server |
| `audiosilo.listeningOpenSpan` | the spans being played, one per playing web tab |
| `audiosilo.listeningSync` | per connection: the last sync, the "couldn't sync" list and the clock skew |

**`audiosilo.listeningOutbox`.** Each event carries its `connectionId`. The outbox is
append-only. An event never changes once it is here, and its id and content are fixed
once a send was tried. A `finish` entry also carries its sends' marks, `out` and
`maybeReached` ([Across tabs](#across-tabs)). Another tab's change arrives by the
`storage` event (`refreshOutboxFrom`).

**`audiosilo.listeningOpenSpan`.** Each span carries its `owner` and `keptAt`; a bare
span is the form an older build wrote. The player stores the spans every 5 s, online
or offline. On the next launch `recoverOpenSpan` closes a span a kill left open at its
last stored values. It also brings the mirror's record of its book up to the span's
end ([What a kill leaves behind](playback.md#what-a-kill-leaves-behind)). On the web:

- A reload recovers its previous document's span at once, never a live duplicated
  tab's (`audiosilo.openSpanOwner` in sessionStorage and a Web Lock;
  [how](playback.md#on-the-web-the-recovery-can-wait-30-s)).
- Another tab's span is left to that tab while it is live, which means kept within
  30 s of now (`LIVE_SPAN_MS`). For a tab on an older build, with no `owner`, it
  means its end is under 45 s old.
- A tab whose span another tab took that way plays on under a new id, from where the
  copy ended (`takenFrom`, `goingOnFrom`). So what it played since is not a
  `duplicate`.
- A tab that closes a span another tab left (`sweepLeftBehind`) sends it at once
  ([Across tabs](#across-tabs)).

**`audiosilo.listeningSync`.** Per connection, it holds:

- when it last synced (`lastSyncAt`);
- the "couldn't sync" list: rejected events with their reason, kept 30 days, at most
  100;
- the server's clock skew (`clockSkewMs`), which `progress-sync` reads through
  `stored-skews.ts`. A sync answer whose request times are known measures it
  (`clockSkewOf`): its `server_time` minus the midpoint of sending and answering.
  Until a connection has one, the skew is 0. A progress `GET` never measures it.

**Locking.** The read-modify-writes of the three documents run in a serial queue and
under `tabLock` (`src/lib/tab-lock.ts`), so two tabs can't lose each other's events.
`tabLock` is a Web Lock shared by every tab where the browser has one
(`navigator.locks`, a secure context only). On a plain-http address it falls back to
a `localStorage` lease. On the web each write re-reads storage inside the lock. The
read of the stored skews (`stored-skews.ts`, which the outbox registers) takes no
lock, because the document is written whole.

### Sending

`flushOutbox` sends the outbox. One flush runs per connection at a time; a call while
one runs makes it go round once more. It sends chunks of 200 events and sets
`sent_at` at each attempt. A flush starts:

- at launch, once the session is ready, after closing a recovered span;
- on each closed span or cut;
- when the server comes back;
- when the app comes to the front, after the address check;
- after a sync that left more.

`listening-sync.ts` drives the launch, server-back and foreground triggers. The root
layout and the car's headless task start it.

A queued span whose `start` is `stay` goes as a `jump` while the connection's
`/server` doesn't say `listening_stay` (`eventsForServer`, on every send path: the
batch, one by one, and the web page's keepalive), and the stored event keeps its `stay`
and its id
([Stay wins](playback.md#stay-wins)). The flag is read as each request is built. A
stale cached `true` can still let a `stay` through: a v2.6.0 server answers it inside
a `200` as `rejected` `invalid`, so it moves to the couldn't-sync list like any
rejected event, and a server that refuses the whole request with a `400` gets it
again as a `jump` (below).

Each answer is handled like this:

- Every status but `rejected` removes the event. `rejected` moves it to the
  couldn't-sync list with its reason.
- The answer's progress rows go into the query cache. A row this device's event was
  kept for has its version acknowledged (`ackVersion`, never lowered). That is
  `keptMine`: applied, or diverged with `kept: "event"`, and the row's `device_id` is
  this device's. The place reconcile is told of the rows (`onSyncAnswer`) so it can
  offer another device's place. `heldListens` identifies the books for which the
  server kept its row over a listen, using each event's start as sent. The
  [player's offer rules](playback.md#offering-another-devices-place-sync-v2)
  determine when that place appears again.
- An answer that arrives while the cached `listening_sync` flag is `false` makes the
  query cache ask `/server` again. The server took the events, so the cached answer
  is older than the server.
- A network error, `401`, `403` or `5xx` keeps everything for the next trigger. A
  network error also notes the failure for reachability.
- For `413` or `too_many_events`, the next chunk size is half the number of
  events actually sent, rounded down. If the request carried one event, that
  event goes on the couldn't-sync list as `too_large`.
- For any other `400` on a batch, the outbox retries only the events that
  went in the request, one at a time. Neither retry includes a finish withdrawn
  before the send. An event refused on its own (or sent alone to begin with) goes
  on the list as `invalid`. A `stay` refused alone gets one more
  try as a `jump`, and the client asks for `/server` again.
- An event older than 90 days (the server's own bound, `syncRejectAge`) is not sent.
  It moves to the list as `too_old`, so an event that never gets an answer can't hold
  its book "pending" forever.
- A `404` or `405` is a **rollback** only when the server's own `/server` answers
  without `listening_sync`, and `keepServerAnswer` takes that answer. It first
  rechecks the address and server id ([`acceptsServerAnswer`](connect-and-addresses.md#the-pick-rule-srclibserver-addressts)),
  so a late answer from the old address or one from another server leaves the
  events queued. On confirmation, the player keeps that server answer in the
  query cache and on the device, marks the connection rolled back for the launch,
  and switches to legacy saves.

Rollback processes one book at a time.

1. Just before sending a book, `sending` rechecks that book's events for
   withdrawn finishes and marks only that book's events as out (on the web, its
   finishes in the stored outbox too). So a later book's finish that another tab
   withdraws while an earlier `PUT` is in flight stays out of the conversion. See
   [Taking a finish back](#taking-a-finish-back).
2. `legacySaveOf` orders the remaining events by time and uses the latest
   listen's end. The save is finished if the last finish-state event is a
   `finish` at or after that listen, or a `finish` with no listen. A finish
   alone takes its position, duration and speed from the finished mirror record
   when available (`withFinishedPlace`).
3. A finish or a deliberate move (`jump`, `moved_back`, `restart` or `stay`)
   bypasses the replay guard. A `continue` carries the choice forward only if
   it starts at the preceding span's ending file and position. A fresh resume
   or a break in that sequence restores the [replay guard](state-and-data.md#the-replay-guard).
4. If a save is held or cannot reach the server, `saveProgress` requires a
   durable write to the legacy queue before removing that book's events from
   the outbox (`requireQueued`). If storage refuses the transfer, the source
   events stay in the outbox. A successful PUT also retires the source events.

**When a web page goes.** On `pagehide` the web sends what waits with `keepalive`,
oldest first, up to about 60 KB (`fitKeepalive`). That includes the span closes still
queued behind a lock and the events waiting their turn behind them (`queued`, such as
a finish), because a lease's timer never fires on a page that is going.

- An answer that still arrives is applied. Anything unanswered stays, and a resend is
  a `duplicate`.
- A `finish` that another tab's Undo took back a moment ago is left out.
- The finishes that go while their server looks reachable are marked in the stored
  outbox for 5 s ([Across tabs](#across-tabs)).

### What the listener sees

`pendingSaves` counts the outbox's listen events (not a finish or unfinish), plus the
open span while its server can't be reached.

- Home's pill reads "N listens waiting to sync" (`syncPill`). The last sync answer
  counts as "synced" when it is the newest.
- The account page's Listening sync card (`useListeningSync`,
  [Account](you-and-settings.md#account-srccomponentsaccount)) shows the count, the
  last sync, and the couldn't-sync list with Discard.
- The Journal's Diary and a book's History tab show this device's unsent listens
  as sessions marked "Waiting to sync" (`useWaitingListens`,
  [The Diary](journal.md#the-diary)) until the server's rows replace them.
- The book's page, Home, Library and search show this device's newer place before
  it syncs ([The place Resume plays](state-and-data.md#the-place-resume-plays)).

**Sign-out, removing a server and removing a person** first send what they can
(`unsentListens`, when the server is reachable). When listens are still unsent, they
ask the listener to confirm: "3 listens haven't synced to Home. Sign out anyway?". The
count here is every waiting event, a finish too. Signing out purges them. It is a
confirm, not a block.

At sign-out, `teardownBeforeTokenRevoke` waits for the stop's final span to
enter the outbox. The outbox finishes its send or rollback transfer before the
legacy queue gets its final flush (its guard reads:
[The replay guard](state-and-data.md#the-replay-guard)). On a server without
`listening_sync`, the stop's save of a paused or held place keeps the `updated_at` of
the capture that took that place (or of the resume row, for a book that has not played
since it loaded), never the sign-out time, so it cannot outrank another device's newer
move. A book that was playing at the stop is dated at the stop. Removing the connection
increments `connectionGeneration` before the purges. An event appended after a
wait, or a mirror write for a finish or its Undo, checks that number. The same
account signing in again gets the same connection id, so an orphan appended after
the purge would otherwise be sent for it.

**Resume by file.** The mirror's records carry the playing file and the seconds into
it (`file`, `file_pos`). A resume of this device's own place (`loadInitialProgress`)
plays that file from that place when the queue holds it. That holds even when the
place was saved on a download's older file order. The server does the same with a
span's file places. The local resume works on any server; the server's remap needs
`listening_sync`.

A file place is used only when it belongs to the record the resume picked
(`holdsFilePlace`). That is the same place (within 1 s), or a record of the same
device in the same finished state that is at most 5 s newer than the file place.
Both are compared on this device's clock, with a server timestamp moved back by the
stored `clockSkewMs`, 0 until a sync answer has measured it. So once the skew is
known, a server clock that runs ahead keeps a timely file place, and a mirror that lost
writes never resumes at a stale file.

### Taking a finish back

Mark as finished on a `listening_sync` server is a `finish` event, but its Undo is a
progress edit. A finish still waiting would reach the server after the edit and
finish the book again. So `undoFinish` (`finish-route.ts`) first calls
`withdrawFinish(connectionId, libraryId, path)`, which returns a `Withdrawal`
(`unsent`, `unreachable`, `restore`):

- the book's waiting `finish` events leave the outbox;
- one whose request is out is waited for, from this tab or, on the web, from
  another ([Across tabs](#across-tabs)). The web's page-hide request counts too
  (`sendingNow`), since a page that was only hidden comes back from the
  back-forward cache with it still out;
- a chunk read before the withdrawal drops the withdrawn events.

A withdrawal that storage would not keep (`writeOutbox` says so) takes nothing back
and fails the Undo with no edit, since the finish would still be sent after a
restart. Otherwise one of three things happens.

- **The server cannot have the finish** (`unsent`). One was taken back, none it
  waited for was answered, and no request carried it with no answer (`carried`,
  below). That is a finish that:
  - was never sent, or was sent only while its server was marked down or the browser
    offline (an offline Mark as finished);
  - the server refused with its own HTTP error, such as a 503 or any 4xx (a refused
    batch stores nothing).

  The Undo is done on the device, with no edit. The mirror goes back to the record
  the finish replaced (`restorePlaceBefore`), which is the place the server still
  holds. So an offline Undo works. That needs the mirror's finished record to carry
  that place (`ProgressSave.before`, below). When it does not, as after the server's
  row was read back over it, the Undo goes to its own place with no edit
  (`unrecordFinish`).
- **The server may hold it, and looks down** (`unreachable`). A request carried the
  finish with no answer, and the server looks down now, so no edit can reach it.
  Nothing is taken back, and the Undo fails. The book page shows "Can't undo while
  the server can't be reached. Try again once it's back." with **Retry**, which runs
  the Undo again. Done on this device alone, the Undo would lose to the finish the
  server did hold once it came back.
- **The server has it, or may have it, and looks reachable.** The player sends the
  progress edit. It unfinishes the book whether a request that got no answer
  arrived or not. There are two cases:
  - a finish it waited for was answered;
  - a request carried the finish while its server looked reachable and got no
    answer (`gotNoAnswer`), and the server looks reachable now.

  An edit that fails puts the taken events back (`restore`) and flushes, so both
  sides end finished. A finish the server already had is then a `duplicate`. Each
  goes back where it was in the outbox, ahead of the events appended after it, such
  as a later unfinish and restart. Put back at the end, it would finish the book
  again over them. An edit that found the server away (`isServerAwayError`: no
  answer, a timeout, or a proxy's 502, 504 or Cloudflare's 520 to 524) resolves
  `unreachable` too, with the same toast and **Retry**. The server's own 503 is an
  answer, so the edit fails and its toast says the server is busy (`failureTitle`,
  `isServerBusyError`).

  After an edit that went through, `unrecordFinish` puts the mirror back here too.
  The edit's answer only reaches the query caches, and the finished record would
  start the book again at 0 on the next offline Play.

**Mark as not finished** takes the same route at its own place (`unfinish` in
`book-actions.tsx`, through `undoFinish` with `atPosition`). A finish still waiting is
taken back before its edit, and with the server down the toast reads "Can't mark as
not finished while the server can't be reached." Taken back unsent, it is undone as
an Undo is, back to the record before the finish, because the server never got the
finish and keeps that place. Where the mirror no longer carries that record, it takes
the edit at its own place. On a server without `listening_sync` nothing waits to be
taken back, and both take the edit. A **Retry** of Mark as not finished takes its
place from the progress read since the failed tap, since another device may have
moved the book. The Undo of Mark as not finished first leaves a book started since,
then finishes the book again by the route Mark as finished takes. On a
`listening_sync` server that is never a progress edit, since an edit sent beside the
outbox reaches the server before the span the book was left with.

**No answer** (`gotNoAnswer`) is a timeout, a dropped connection, a gateway that lost
the server (`GATEWAY_LOST`: 502, 504, Cloudflare's 520 and 524) or a 2xx whose body
could not be read. Any other HTTP error is the server's own answer. The web's
page-close keepalive send (`sendOnPageHide`) counts as no answer as soon as it
leaves, because the page is going and its answer may never be seen.

Such finishes are noted in `maybeReached` for this launch, only when the request left
while the server looked reachable (`looksReachable`: not marked down, and the browser
not offline). On the web the stored entry is marked too, for an Undo in another tab
([Across tabs](#across-tabs)). A finish counts as `carried` when it has that mark or
an `out` mark that ran out.

**The record before the finish.** The finished record the finish writes carries the
record it replaced (`ProgressSave.before`, `writeFinishedMirror`), only when that was
a place. A finish written again over its own finished record keeps the place it
carried, so the Undo of a book marked finished twice never goes back to a place from
before the first. The tab that marked it also keeps that place in memory
(`placeBefore`), for when the server's row read back since has replaced the record.

**The mirror going back** (`unrecordFinish`, `store.ts`). Under the mirror's lock
(`updateMirror`), the record before the finish replaces the finished one, else the
finished record is rewritten unfinished at the Undo's place. Mark as not finished
always takes its own place.

- It is stamped one millisecond after the record it replaces. For a downloaded book
  that may be the server's row for the finish, newer than the finish's own time. The
  mirror keeps the newest record, so an older stamp would be refused. A tie goes to
  the later write, so the finish's own refresh of the place, still on its way and
  stamped as the finish, would make the record finished again; one millisecond later,
  it loses.
- The mirror's own `ack_version` and `answered` are kept.
- A place saved since the finish (the record is no longer finished) is left as it is.

**The hold after an Undo** (`noteUndoneFinish`, `progress-sync.ts`). For 60 s
(`UNDONE_FINISH_HOLD_MS`, past a read's 15 s timeout) the mirror takes no finished
record of the book stamped before the Undo. A read of the server's row that was on its
way as the Undo was made lands after it, stamped later than the record the Undo
replaced, and by the newest-wins rule alone it would finish the book again. A finish
made after the Undo is stamped after it, so it still lands. On the web the hold is
stored for every tab (`audiosilo.undoneFinishes`, under its own `tabLock`), because
the tabs write one mirror. The undoing tab then tells the others on a tab channel
(`tellUndoneElsewhere`), and their pages read the book again.

**A finish that fails.** A `finish` event that could not be queued puts the mirror
back to its record before the finish, or removes the finish's own record when the book
had none. The book the finish left is then loaded again
([Playback](playback.md#listening-spans-sync-v2)). While a slow finish waits on its
server, the book page shows a "Marking as finished..." toast.

### Across tabs

The tabs of a browser are one device. They share the three documents and the device
id, but not each other's memory. `sendingNow`, `withdrawn` and the `maybeReached` set
are each tab's own, and exist only in that tab's memory.

The saved place is shared the same way. A tab that another tab has played past saves
nothing of its own, and takes the mirror's place before it plays again
([The tabs stay at one place](playback.md#the-tabs-stay-at-one-place)).

So what a tab's Undo must know of another tab's sends is written in the stored
outbox, on the `finish` entry (`OutboxEntry`):

| Mark | Means | Written |
|---|---|---|
| `out` | requests carrying the finish are out. It holds one time per tab (the outbox's `tabId`), the latest each tab's request is over by | before the request (`markOut`), for 45 s (`OUT_MARK_MS`); as a page goes (`markOutNow`), for 5 s (`PAGE_HIDE_MARK_MS`) |
| `maybeReached` | a request carried it while its server looked reachable and got no answer | when the request ends (`markSettled`), in the same write that takes the tab's `out` mark off |

**Why the stored document and not the channel.** Every tab reads the outbox under its
lock (`tabLock`), and the lock puts a send and an Undo in one order. The Undo either
took the finish back first, or finds it out and waits. A message on the
[tab channel](playback.md#one-tab-plays-at-a-time-web) could arrive after the send it
was meant to stop.

**A send that carries a finish** (`sending`), on the web:

1. Under the lock, `markOut` finds the finishes no longer stored (taken back by an
   Undo in another tab, or answered there) and leaves them out of the request.
2. It marks the rest `out` until 45 s from now. That is past the request's 15 s
   timeout and the read of its answer. So a mark that ran out was left by a tab
   that went away with its request, never by one still waiting.
3. When the request ends, `markSettled` takes this tab's mark off the finishes
   still stored (an answered one has left the outbox) and marks the ones that got
   no answer `maybeReached`. One write does both, so a waiting Undo never reads a
   finish as neither.

**An Undo** (`withdrawFinish`) reads the marks:

- A live `out` mark is waited for (`isOut`). Another tab's answer shows as a change
  of the stored outbox. With no change the Undo looks again every 200 ms
  (`OUT_POLL_MS`).
- A finish gone from the outbox after the wait was answered. The server has it, and
  the edit is sent.
- A finish taken back with `maybeReached`, or with an `out` mark left standing past
  its time, is one the server may hold (`serverMayHold`). The edit is sent when the
  server looks reachable.
- A mark further ahead than 45 s (the clock was set back since) counts as run out.
  Read as live, it would make the Undo wait until the clock caught up.
- `restore` puts a finish back with `maybeReached` when it had either mark, so every
  tab still knows the server may hold it.

**A page that is going** (`sendOnPageHide`) cannot wait for a lock, and nobody may
see its request's answer:

- It reads the stored outbox straight from `localStorage` (`storedOutboxNow`) and
  leaves out a finish another tab took back.
- It marks the finishes it sends `out` for 5 s (`markOutNow`), written at once,
  outside the lock. Only a finish whose server looks reachable is marked
  (`finishesLeaving`), and only when the stored outbox could be read.
- An Undo in another tab waits that long for the request to land. It then reads the
  mark left standing as "the server may hold it" and sends its edit, which a finish
  landing later would have undone.

**A swept span is sent.** A tab that closes the span another tab left
(`sweepLeftBehind`) sends that connection's outbox at once. The tab that would have
sent it is gone, so no send of its own follows. The sweep runs:

- on the tab's launch;
- once another tab's live span would be stale;
- before a flush of every outbox;
- before the sign-out count.

**Known limit.** An Undo can wait up to 45 s on the mark of a tab that died with its
request out and sent nothing as it went. A crash does that, and so does a tab the
browser discarded. The edit is then sent when the server looks reachable. Otherwise
the Undo is done on this device, as for a finish no request carried.

A page that goes with a `pagehide` writes its 5 s mark over its own 45 s one for the
finishes its keepalive request carries.

In a test, two tabs are two copies of the modules (`jest.isolateModules`) over
`src/testing/fake-browser.ts`, with `@/lib/storage` mocked per tab (`tabStorage`).
The AsyncStorage package can't be the per-tab mock. Babel requires it lazily, after
`isolateModules` has returned, so every copy would share the first tab's.

## The offline companion (`offline-meta.ts`)

A downloaded book keeps its **community metadata**, so these work with no network:

- the book page (About, Recaps, Characters, Series, the previous books' catch-up);
- the player's companion;
- the Home cards that read it.

The spoiler gate is unchanged. It still runs on the device against the listener's
place (`meta-gating.ts`); nothing here decides what to show.

**What is kept** (`OfflineMeta`, version 1):

- the `/meta` envelope as the server sent it. An unmatched answer is kept too, so the
  book reads as unmatched offline instead of waiting;
- `savedAt`;
- whether it was asked with `include=previous` (`meta_bundle`);
- `works`: the nearest earlier work in the reading order the listener picked. It is
  read on its own through `/meta/work` when the envelope's `previous` doesn't hold
  it, by the same rule as the book page's rows (`previousWorks(seriesRails(...))`).

`parseOfflineMeta` reads it back defensively. Anything it can't read is ignored and
fetched again when possible.

**The server's flags are kept apart.** Every reader of community metadata first waits
on the `metadata` flag, and a cold start with no network never answers it. The flag
comes from
[the kept `/server` answer](state-and-data.md#the-kept-server-answer-srcapiserver-snapshotsts),
which every connection has whether or not it holds a download. An older `meta.json`
can still hold a `/server` answer of its own (`OfflineMeta.server`). The app reads
that answer only to copy it into the kept answer.

**Where it lives.** The metadata goes in its own `meta.json` beside the book's audio
(`writeText`), never in the registry. The registry is one JSON document, saved every
couple of seconds while a download runs. An envelope with its characters and recaps
can be hundreds of KB, and AsyncStorage on Android and `localStorage` on web cap the
whole store at a few MB. Beside the audio the file is connection-scoped like the
audio files, is deleted with them, and survives a relaunch. The manifest carries only
a marker (`DownloadManifest.meta = { savedAt }`).

**Keeping it** (`keepOfflineMeta(key)`):

- *When it runs.* After a download completes, apart from the download, so a failure
  never fails or holds up the book. It runs **once per download per launch**
  (`metaTried`, keyed by the entry's `savedAt`). A book removed and downloaded again
  tries afresh, and an unreachable server gets no retry storm. Many books in a row
  write the registry once (`persistSoon`). If the download was removed or replaced
  while the file was written, the marker isn't set, and a removed book's file is
  deleted again.
- *Which books qualify.* On a server with `metadata`, an ASIN, ISBN, generated content or a
  nonempty `work_id` makes the download eligible. A new `/item` answer can supply the work ID
  after the download finishes. `startItemRefresh` updates the stored item and queues the community
  material for capture.
- *How it reads.* It reads through the screens' own option factories
  (`bookMetaQuery`, `metaWorkQuery`), so it reuses a fresh answer they hold. It never
  throws and never retries.

**Restoring it.** Hydrate calls `restoreOfflineMeta`, which:

1. waits until the launch's first screens are up (the next idle moment,
   `requestIdleCallback`, else a moment later);
2. reads the kept files, three at a time, and seeds every payload;
3. copies the `/server` answer an older `meta.json` holds into the kept answer,
   taking the first such file for each connection (`seedServerSnapshot`,
   `saveServerSnapshot`). Neither function replaces an answer read later;
4. goes through the books one at a time, only for servers with `metadata` (each
   server's flags are read once). It fills in downloads that kept nothing or whose
   file can't be read, and refreshes copies older than a week
   (`KEPT_META_REFRESH_MS`). So what a book carries offline follows the community's
   edits.

### Seeding

Every seed of a downloaded book goes through `seedQuery`, which follows three rules:

- It never writes over an answer the cache already holds. That answer is the
  server's, so a fresh one always wins. It is also at least as full, since the
  manifest's book can be the list shape.
- It dates the seed, so an online screen still refetches once it is stale.
- It keeps the seed for good (`setQueryDefaults(key, { gcTime: Infinity })`), so a
  book downloaded an hour before a flight still opens offline long after launch.

`seedOfflineMeta` seeds:

- `qk.bookMeta(cid, lib, path)`, the plain request every reader uses. Those readers
  are the book page, `useBookCommunity` behind the companion, the reveal listener and
  Previously on, Home's Now card, the end credits, the series page's anchor and
  Search's character sources;
- the `include=previous` variant, when the payload was fetched that way;
- `qk.metaWork(cid, id)` for every kept work, which the previous-books rows and the
  work series page read.

The `spoilers=hide` variant is never stored, because it is cut at the saved place
when fetched.

The connection's `/server` answer is seeded before any screen
([the kept `/server` answer](state-and-data.md#the-kept-server-answer-srcapiserver-snapshotsts)),
so a reader may ask for a book's metadata before that book's seed lands. The reader
takes the book's seed when it lands, because `seedQuery` fills any key that holds no
data, a failed or waiting key included.

A previous-book row with an answer in hand shows it even when its refetch fails
(`book-meta.tsx`). That is how a kept work looks offline.

## Keep the next books ready (`keep-ahead.ts` + `keep-ahead-controller.ts`)

The `keepAhead` setting (`0 | 1 | 2 | 3`, default `0` = off) downloads the next N
books **after** the loaded one.

It sits beside the existing automatic download. `maybeAutoDownloadCurrent` in
`src/playback/store.ts` downloads the book you *start* under `autoDownloadNext` (see
[Auto-download on play](end-of-book.md#auto-download-on-play)). Both obey the same
network rule. Both ask the downloads store's `download()`, which applies the same
declined mark and reserve to both and runs one book at a time.

The current book goes first among the waiting downloads:

- The store queues it the moment playback starts, behind any download already
  running.
- Keep-ahead waits `SETTLE_MS` (4 s) after any change before it plans.
- Keep-ahead's books still queued step aside if they are in its way.

A keep-ahead download already running finishes first. If its remaining bytes leave no
room, the store answers `no-space`, which the playback store does not retry.

### The planner

`src/downloads/keep-ahead.ts` is pure and tested.

`aheadWindow` returns the next `count` books after the current one: the Up next queue
first, then the series, without the current book, finished books or repeats.

`planKeepAhead` gives each book of the window a `SlotState`:

| State | Means |
|---|---|
| `ready` | on the device |
| `active` | queued or downloading |
| `failed` | left for the listener to retry |
| `declined` | cancelled or removed this session. It keeps its place, and the planner never reaches past it for another |
| `waiting` | the network rule says not now |
| `no-space` | no room: it would leave less than the reserve free (see **Space** below) |
| `later` | room unknown, so one download at a time |
| `unavailable` | this device can't keep it: a web browser that plays it through the server's transcoder. It is left alone in its place |
| `start` | start it now |

A book the store turned away for room although the plan thought it fit reads as no
room (`tooBig`). That happens when the full item is bigger than the list said.

**Space.** `roomLeft(storage, pending)` is `free - pending - reserveBytes(capacity)`:

- `reserveBytes` is `max(1 GB, 10% of capacity)`;
- `pending` is what queued and running downloads still have to write;
- a book's need is `estimateBytes`: its size, else its length at about 128 kbps,
  else 1 GB.

Books start in window order and stop at the first that doesn't fit.

The plan's `status` is what the status line says: `off`, `never`, `idle`, `working`,
`no-space`, `waiting`, `failed`, `ready`, `declined` or `unavailable` ("This browser
can't keep the next books offline.").

### The controller

`keep-ahead-controller.ts` is framework-free. `startKeepAhead()` starts it once from
the root layout, like `startAutoSleep`. It gathers the inputs for the **loaded
book's** connection:

- its capabilities;
- the queue, when `queue` is on. Entries without `book` can't be downloaded and are
  skipped;
- the finished set from `allProgress`;
- the series, only when the queue leaves room. It is the server's `/next` answer step
  by step when the server has `next_book`, else the folder's next sibling
  (`resolveNextBook`);
- the network gate from `autoDownloadNext`. `never` gives status `never`, and `wifi`
  on a metered connection gives `waiting`;
- the storage estimate and the registry.

The queue and the series give nearly the order `resolveUpNext` plays books in at the
end of a book, so the book kept ready is usually the book that plays. Keep-ahead also
skips finished series books, follows the loaded book's series after a short queue,
and plans nothing when `/next` fails, where the resolver falls back to the folder.

The controller publishes `{ status, slots }` to the `useKeepAhead` store. Then, for
each `start`, it fetches the full item and chapters and calls
`download(..., 'keep-ahead')`. It skips a book that was registered meanwhile, an
errored entry too, because keep-ahead never retries a failure.

After a series lookup or a held read, `currentPlan` checks that the controller
still runs and that the loaded book, `keepAhead` and `autoDownloadNext` are
unchanged, before the controller publishes slots or starts a download. If the
listener switched books, the old run stops and the controller plans from the
new book. Since a query can wait offline and resume
on mobile data, `startOne` checks the network rule again just before queuing
each download, and a book the rule no longer allows, or whose plan is no
longer current, is `declined`. See [The online flag](state-and-data.md#the-online-flag-srclibdevice-onlinets).

- A `transcoded` outcome marks the book `unavailable`.
- A `no-space` outcome marks it `tooBig` until the registry changes.

After either, the same run plans again at once without that book.

Between runs the controller re-plans on any of these:

- the loaded book;
- the two settings;
- the registry's statuses (not byte counts);
- any successful `queue` query;
- on native, a network change.

One `SETTLE_MS` timer covers them, and it plans once more if something changed during
a run. It never throws and reports nothing to reachability. A server that can't be
reached means it plans nothing this time.

## The Downloads page

`src/components/downloads/downloads-screen.tsx` renders what the pure
`src/downloads/downloads-view.ts` returns. The `/downloads` route re-exports it.

- `visibleDownloads` - only the **person listening's** downloads, those of the active
  profile's connections
  ([Profiles](profiles.md#visible-and-background-connections)). The device keeps
  everyone's, and they keep playing for their owner. The car's Downloads tab and kids
  mode's offline stories read them the same way.
- `orphanDownloads` - downloads that **no connection in the session** holds (every
  person's connections count).
  - A connection that went without its purge leaves them: a token that couldn't be
    read, or an identity the key migration couldn't move.
  - Nothing else would ever list them, so their room would be taken for good. The
    page lists them under **Not signed in**, newest first, with Remove only. Signing
    in to that account again shows them in their place.
  - The page lists them only once the session was read. Before that, or after a
    failed read, every download would look orphaned.
- `splitDownloads` - **In progress** (running, then waiting in the order asked, then
  failed) and **Ready offline** (newest first). `groupByServer` groups the ready ones
  in connection order, with unknown connections last.
- `isEpisodeEntry` - a ready podcast episode goes in its own **Podcast episodes**
  section instead of Ready offline, with its show as the second line
  (`episodeShowTitle`). The Ready offline count leaves episodes out. The storage bar
  counts both. Kids mode's offline stories leave episodes out too (`kidsDownloads`).
- `storageBar` builds the storage bar:
  - one segment per server, taking the chart colours in `CHART_ORDER`: `chart-2..5`,
    then `chart-1`. The brand pink comes last, so the page keeps one pink thing. A
    sixth server and on fold into "N more servers";
  - an **Other apps** segment on a device (`capacity - free - ours`). A browser can't
    see other apps;
  - `used`: the larger of the registry's sum plus what the unfinished downloads
    hold (`growingBytes`: a running download's `heldBytes`, a failed or waiting
    one's finished files in `manifest.files`), and the engine's measure (`totalBytesUsed`) plus each
    download's own growth since the measure was read (`grownSince`, against
    `heldByKey` taken with it). Both are in whole megabytes, so the figure grows
    while a download runs without changing on every progress tick, also past a
    device-wide measure larger than the listed books. A retried download counts
    only past the files its failed attempt kept, so it is not counted twice;
  - Other apps is read against the disk as it was at the measure, so its share stays
    steady while a download grows.

  `useStorage` re-reads the measure and the estimate only when a book lands or leaves.
- `unsupportedReason` - `insecure`, `no-cache` or `no-worker`, for the page's
  unsupported state.

Keep-ahead's held-back books (`waiting`, `no-space` and `later` slots not in the
registry yet) render as `PlannedRow`s in In progress. Entries with
`origin: 'keep-ahead'` are labelled "Kept ahead".

A failed row for a book this browser now plays through the server's transcoder
(`useNeedsWebTranscode`) offers no Retry, because the store would refuse it. It says
why ("This browser can't play this book offline. Remove it to free the space.") and
leaves only Cancel.

The **Automatic downloads** card (`rules-card.tsx`) edits `autoDownloadNext`,
`autoDownloadEpisodes` ("Download podcast episodes when you start them"), `keepAhead`
and `autoDeleteFinished`. Settings and the series page's `KeepAheadCard`
show the same control and status line (`KeepAheadControl`, `KeepAheadStatusLine`).
The page publishes its summary line into the sub-nav with `SubNavActions`.

In the iOS app the page also holds **On your Apple Watch** (`WatchSection`), between
In progress and Ready offline, and in the Android app **On your watch**. Those are the
watch's copies, not this device's, and none of the above applies to them
([The watch in Downloads](apple-watch.md#the-watch-in-downloads),
[The phone in Downloads](wear-os.md#the-phone-in-downloads)).

## Playing downloaded content

There are three paths. The first two are in `src/playback/store.ts`.

### Downloaded before play

`playBook` looks up the entry. If `status === 'downloaded'`, it passes a `local` map
to `buildBookQueue`: each `relPath` with its `localUri`, plus the local cover.
`buildBookQueue` points every track at its local URI and drops auth headers.

Resume still works fully offline, because `loadInitialProgress` falls back to the
durable local mirror and the offline queue (see [Playback](playback.md)).

A downloaded book's server place is kept in that mirror, so a book downloaded at 70%
opens offline at 70%, not 0:

- The download's start reads the server's place (`fetchServerProgress`, which
  writes it to the mirror once the book has a downloads entry). When that read
  fails, the cached `qk.progress` row seeds the mirror instead
  (`keepCachedServerPlace`).
- `fetchBookProgress` writes each online answer for a book kept offline
  (`setKeptOfflineCheck`, `writeMirror(progressToSave(...))`). The write keeps the
  newest record, so a newer local save is never regressed.

Home's progress list seeds every downloaded book the same way
([Progress sync](state-and-data.md#progress-sync-srcplaybackprogress-syncts)).

### Downloaded while streaming

A `useDownloads.subscribe` listener watches for the playing book turning
`downloaded`, then calls `switchCurrentBookToLocal`. That rebuilds the queue against
the manifest and prefers the engine's **gapless `swapTo`**: it buffers the local
source in parallel, then switches at the same position. A podcast episode streaming
from its server moves onto its download the same way.

- A refused swap leaves the streaming queue untouched, for example when the web
  service worker isn't controlling the page. Playback never dies from trying to go
  local. A failed swap is logged.
- The store commits the new queue only once the engine has actually moved, and only
  while that book is still the one loaded.

The swap **keeps the engine's file order**:

- **A download in another order**, such as a pre-2.4.0 download retried while the new
  order streams. It takes the chapters the book was started from
  (`adoptStartedChapters`), only when they give exactly the engine's order. The swap
  then changes only the files' URLs. The track index, the in-file place and the
  whole-book seconds stay as they were, and those are what the saves, the resume
  floor, the sleep timer, jump undo, the spoiler gates and a Cast receiver read.
- **The same files in an order the engine doesn't play** (a start given no chapters)
  leave the book streaming. Moved onto that order, the rest of the book would play in
  another sequence.
- **A download holding other files** moves the listener to the same file (by the
  path-keyed track id) at the same in-file place, else to the same whole-book place.
  The resume floor moves with it, and the track index changes
  ([While the track index moves](#while-the-track-index-moves)).

#### While the track index moves

The store holds the download's queue in `swapHold` from the swap's start to its
commit. Until the engine is on the download, the snapshot intake reads the engine's
reports at the download's index back onto the stream's queue by file
(`throughSwap`). A file the stream lacks keeps the store's place. So a stop, a
sign-out, a person switch, the sleep timer and jump undo all read the playing
file's place, and a place saved during the hold is the playing file's.

- The engine is on the download after a load from the swap's own call, or after a
  gapless swap's switch (`swapTo`'s `onSwitch`). While the web copy buffers, the
  engine goes on reporting the stream, in the stream's order.
- `persist` and `onRemoteMove` refuse a place at another index of the book until
  the download's queue is committed. On a `load`, that commit comes before the rate
  and the play.
- The commit moves the store's snapshot onto the download's index by file. A stream
  in `error` holds back the engine's own report, so this is what lands it there.

#### What happens during the switch

The swap keeps what the listener did while it was on its way.

- **A start in the way.** A download can land while a load holds the store
  (`loadingBook`: a start, or an adoption's reload) or while a start is on its way
  (`startsInFlight`). The store then marks the swap due (`swapDue`) and runs it once
  they are over (`runDueSwap`), from the place that start put the book at. A start
  that placed nothing, after a failed load or resume lookup, gets no swap. The next
  start uses the download.
- **A pause, a speed change, a stop or a new start during a native load.** The
  load runs as a play attempt only when the listener's intent is to play
  (`wantsPlayback`), never because the engine last reported `playing`
  (`beginPlaybackAttempt`). After the load, the store sets the speed as it is then
  and plays only while the intent stands. A pause, a speed set or a play asked for
  during the load stands. After a stop or a new start the swap commits nothing.
- **The web engine.** `swapTo` keeps a pause, a speed or a volume set while the copy
  buffers. It resolves `'refused'` after a load or a reset meanwhile, and `'moved'`
  after a seek or a move to another file
  ([Web engine](playback.md#web-engine-servicewebts)).
- **Swapping again after `'moved'`.** The store swaps again from the new place after every
  `'moved'`, while the book is still the store's and its download complete. Each
  `'moved'` needs a real move of the stream: the listener's seek, skip or rewinding
  play, the stream's own advance to its next file, a transcoded stream's early-end
  reload, or a one-off move the store makes (the pick-up's place, another tab's).
  The swap never moves the stream itself, so the retries end. A `'refused'` copy,
  one that can't be served or never became playable, is never retried.
- **A stream in `error`.** A dead stream refuses a gapless swap, so a download that
  lands while the book is failed is taken by the next Retry (`retry`). Its reload
  first moves the store onto the download's queue (`localSwapOf`, `commitLocalSwap`),
  at the same file and place, in the download's order (nothing is playing, so a new
  order cuts into nothing). It stays a reload, never a
  fresh `playBook`: no place is saved or looked up first, and the resume floor, the
  place another tab left and the pick-up check of a long stop all stand.
- **Casting.** The store hands the route the phone's copy (`rememberLoad`) only when
  it holds the receiver's files in the receiver's order. See
  [Chromecast](chromecast.md#casting-is-a-playback-route-not-a-second-player).

### Started by the car

On Android the car can start a downloaded book with no JS running. The playback
service starts it from the car snapshot's play spec (`file://` tracks, no auth
headers).

Once JS boots, the store's `adoptLoaded` takes it over. It builds the same queue from
the manifest, and does not reload the engine when the engine plays the manifest's
file order (see
[Native integrations](native-integrations.md#adopting-a-book-the-service-loaded)).
[The engine's file order](native-integrations.md#the-engines-file-order) covers an
engine that a JS restart left on the server's new order.

### A download that ends early

A file added to a book on the server after it was downloaded is not on the device,
and the audio is never downloaded again. Online the queue streams it
(`buildBookQueue` points a file the download lacks at the server), so the book plays
on. Offline there is nothing to stream.

**Only an early end counts.** A download that lacks the book's **last** file ends
before the book does. One that lacks only an earlier file (an intro added later)
still holds the book's end, and reaching that end finishes the book as usual
(credits, `finishBook`, the finished save).

**The download keeps the fact** as `DownloadManifest.endsBefore`, the book's last
file's `rel_path` while the download lacks it. Every server chapters answer for the
book sets or clears it (`startChapterRefresh`). An Android adoption with no answer
sets it from the engine's own order (`noteDownloadEnd`), and leaves it alone for an
order made only of the download's own files (a JS restart after an offline start).

**A partial queue.** A queue built from the download that lacks the book's last
file is partial (`BookQueue.partial`, `{ bookDuration }`, set by `playBook` and the
adoption):

- `playBook` reads `endsBefore`. With no server to stream from, such a download
  builds its queue from its own copy (the manifest's files and chapters),
  whatever chapters its caller gave it. No server means no network, a network
  still unknown after the
  [startup network check](state-and-data.md#starting-a-downloaded-book), no
  client for the connection, or the server marked unreachable. A cold start's
  cached server chapters name the files it lacks, and streaming them would stall
  at the downloaded part's end. With a server it plays the chapters it was given,
  streams the rest, and is not partial. Given no chapters, it plays its own
  copy, partial too.
- `adoptLoaded` with no server answer reads the last file of the engine's order and
  `endsBefore`.

Its end is the downloaded part's, so:

- The engine's `ended` there reads as a pause, never a finish. There are no
  credits, no `finishBook` and no finished save. Playback stops there unless it
  streams on (below).
- The listener is told "The rest of this book isn't downloaded"
  (`onPartialDownloadEnd`, shown as a toast by `partial-download-notice.ts` once the
  app is looked at). A stop with no listener yet, such as a car start before the root
  layout mounted, is told as the listener registers.
- A place past that end lands short of it and stays paused, with the same notice.
- Play pressed at that end (`atPartialEnd`) starts no play attempt on the ended
  engine, since it never reports `playing` and the
  [stall watchdog](playback.md#the-stall--error-watchdog) would call it an error.
  It streams on when it can, else it shows the notice again.
- The end credits' Play never finishes such a book by its place
  (`queueEndsBook`): it stops, unfinished. Every check of whether a place ends the
  book goes through `placeEndsBook` (`queueEndsBook` for a queue), which never reads
  a partial queue's end as the book's.
- **Online again in the same session it streams on** (`playOnPastPart`). A Play
  pressed at that end, or the engine reaching it with the device online and the
  server marked reachable, asks the server's chapters (for up to
  `SERVED_ORDER_WAIT_MS`, 3 s, under the spinner). A press asks a server marked
  down too, since the mark can predate the network coming back. When the chapters
  go on past the queue's last file, the book starts again (`playBook`) with them,
  at the next file (by index, since a file the server has not measured yet shares
  its offset with the one after it). No network (an unknown one included), no
  answer, or a book that ends there now: the notice. A pause or a seek back while it asks stands.
- A span recovered after a kill in the last seconds (`mirrorSpanEnd`) never makes
  the record finished. Each mirror capture in a partial queue says so
  (`ProgressSave.partial`), and `mirrorSpanEnd` also asks the download
  (`downloadEndsBefore` in `kept-offline.ts`), since a server row written into the
  mirror since the capture carries no `partial`. `downloadEndsBefore` waits for
  the downloads list to be read, and while it can't be read the end counts as not
  known, so the book is never finished. Only a span that ended in the book's last
  file (streamed, so its end is the book's) finishes it.

**A partial queue's length.** Its own audio is the downloaded part's, more than 10 s
off the indexed book's whenever a whole file is missing, so the server refused every
listen over it (`duration_mismatch`). Each partial queue carries the book's length on
its server instead (`queue.partial.bookDuration`):

- `DownloadManifest.bookDuration`, kept beside `endsBefore` from the chapters answer
  that set it (`withBookEnd`);
- else a server chapters answer the start was given that names that end (a cold
  start's cached one, `serverLengthOf`);
- else 0, unknown.

A span sends it as its `duration` (0 sends none, and the server then checks none), and
a mirror save as its `duration` (`bookLengthOf`: the book's length when known, else
the queue's), so a percent read from the mirror is of the book. The player's percent
reads the same length (`selectBookLength`), as Home does. Marking such a book
finished records that length as both its position and its duration, so it reads
100% of the whole book ([`finishBook()`](end-of-book.md#finishbook)).

**Listens refused earlier are sent again.** Each `flushAllOutboxes` runs
`resendMismatched`: a listen on the couldn't-sync list refused `duration_mismatch`
over a download that ends early (`downloadBookLength` in `kept-offline.ts`) goes back
to the outbox at the book's length, or with none when it is not known, and leaves the
list. It is queued before it leaves the list, so a stop in between sends it twice (the
server answers `duplicate`), never not at all. Only a listen whose length would change
is resent, so one refused again at that length (another edition indeed) stays on the
list.

**Online adoption streams on** too: an Android adoption that holds a file the
download lacks builds its queue from the server's chapters
([The engine's file order](native-integrations.md#the-engines-file-order)).

The regression tests are `store-adopt.test.ts` (play-on too),
`store-listening.test.ts` (the length), `end-credits.test.tsx`,
`listening-outbox.test.ts` (span recovery, the resend),
`partial-download-notice.test.ts` (the toast) and `downloads/store.test.ts`
(`endsBefore`, `bookDuration`).

## The PWA layer

### `public/sw.js`

The player's service worker serves app pages from a cache for the current build
and downloaded audio from a separate media cache.

#### Installing the offline build

At install, `installBuild` fetches the scope root (`/web/` in production). It
requires a successful, same-origin response that names every startup file in
the [build manifest](web-build.md#offline). It refuses a redirected root
because the browser cannot use that response for an offline navigation.

The worker fills `audiosilo-shell-build-<id>` with at most four file transfers
at a time. It queues the selected non-English catalog first, then startup files,
fonts, route and other deferred chunks, and finally `reader.html`. Fonts and the
reader are optional. The worker reuses available fonts and carries a cached
reader forward if the server cannot supply a fresh copy. Chrome can keep the
compiled code for scripts cached during install.

The worker writes the root last, once all required files are in the cache. The
install fails when the root is refused, or when a required transfer or the root
write fails. A cache this install created is then discarded:

- **First visit.** The worker still activates so it can serve downloaded media.
- **Update.** The browser keeps the active worker and can retry on a later visit.
  A kept pre-manifest worker is asked to fetch the new build
  (see [Registration wiring](#registration-wiring)).

On a successful online navigation to an app page of the same build,
`repairBuild` checks for the cached root. If it is missing after a failed first
install or because another worker deleted the cache, the player worker runs
`installBuild` again. Concurrent navigations share one repair.

On activation, `retireBuilds` leaves cleanup to the newer worker if one is
already installing. Otherwise it deletes older build caches and keeps only
immutable files from the previous build, so an open tab can still load its chunks.
For the legacy `audiosilo-shell-v1` cache, this clears stale pages, one-time
URLs and the old build record. Downloads stay in `audiosilo-media-v1` (the
[console's worker](../server/web-ui.md#the-service-worker) leaves it alone).

#### Serving requests

- **Pages.** Navigation tries the network first. If the fetch throws, the worker
  tries the cached page, then the cached root, then returns 503. The
  [reader document](reader.md#the-reader-document) falls back only to its own
  cached copy. Online, an app page from a different build can render without
  replacing the offline shell. A page with a one-time `token` or `flow` is never
  cached ([why](connect-and-addresses.md#single-sign-on)).
- **Assets.** The worker serves content-hashed build files and fonts cache-first.
  Other same-origin scripts, styles, images and the PWA manifest use
  stale-while-revalidate. Token-bearing asset URLs, API calls and server-streamed
  audio go straight to the network.
- **Downloaded media.** For a Range request to `/_offline/`, the worker slices
  the cached Blob and returns 206 with `Content-Range`, or 416 for an
  unsatisfiable range. This lets Safari play downloaded audio and lets the
  player seek without reading the whole file.

### `public/manifest.json`

The install manifest holds:

- the name and short name;
- `display: standalone`;
- `start_url` and `scope` of `.`, resolved relative to wherever the export is
  mounted (`/web/` in production);
- theme color `#db2777` on the dark background;
- 192, 512 and maskable icons.

`src/app/+html.tsx` links it, base-prefixed, from the exported HTML shell.

### Registration wiring

The root layout imports `@/lib/register-sw`. On the web, Metro selects
`src/lib/register-sw.web.ts`. It registers the worker on page load, or
immediately if the document is already complete. Registration requires service
worker support and a secure context. On native, Metro selects the no-op
`register-sw.ts`.

In production the URL is `<base>/sw.js`, so the worker's scope is `<base>/`. If the [language preference](i18n.md#language-selection-srci18nlanguage-providertsx)
resolves to a language other than English, registration appends `?lang=<code>`
so the installer knows which catalog to fetch. Under Metro, `?dev=1` enables
only offline media and leaves app pages to the dev server for hot reloading.

When the worker this registration starts installing fails and the active worker
is a pre-manifest one (its URL has a `build` parameter), the page sends that
worker a `precache` message, so its offline shell takes the new build's chunks
rather than a mix.

### What offline actually covers on web

| Works offline | How |
|---|---|
| Launching the installed PWA, or revisiting routes | network-first navigation falling back to the cached shell |
| Opening a page never opened online | the [installed build](#installing-the-offline-build) includes the route's chunks |
| The app's JS, CSS, fonts and icons | the installed scripts and CSS, plus fonts and icons the worker has cached |
| A language other than English | The installer fetches the selected catalog. The worker caches others on first use online. Choosing an uncached language offline shows English. |
| Playing **downloaded** books, including seeking | `_offline/` URLs and Range slicing from the media cache |
| A downloaded cover | The player loads the saved image from the media cache. |
| Book and chapter metadata for downloaded books | manifests seeded into the React Query cache on hydrate |
| Progress while offline | the offline replay queue and the durable mirror in `src/playback/progress-sync.ts` |
| Reading a **downloaded** book's ebook | the reader host's `engine.readFile` on its `book.epub` in the media cache; the place in `src/reader/reading-progress.ts`'s queue and mirror |
| The Text tab (read-along) for a **downloaded** book | its `readalong.json` (`readDownloadedReadalong`) with its `book.epub` |

Opening a page offline gives it access to downloads and any answers in the
[startup cache](state-and-data.md#the-startup-cache-web) or in memory. New
browse and search results need the server. A screen with no answer shows the
[offline state](state-and-data.md#offline-states-srcliboffline-statets)
and asks again when the connection returns.

## Dialogs that read from the server

A surface with server actions over a read asks `useDialogRead(query)`
(`src/lib/offline-state.ts`). Add to collection (the list and each collection's
row), Share, the Generate and Make read-along confirmations, and Find shows' access
check and search ask it. Its `unread` is `useUnreadQuery`'s answer
([Offline states](state-and-data.md#offline-states-srcliboffline-statets)). So a
kept answer shows, and the dialog checks it before its skeleton. Its `offline` is
true while the device has no network or the read is paused, kept data or not. The
dialog then shows its offline line and disables what needs the server, keyboard
submits included, with no Retry. A Bridge confirmation shows a kept estimate with
its queue button disabled. The estimates are not kept on the device, so one shows
only while the query cache still holds it. A form with no read (a new collection,
Feed address, Import a list) holds its submit on `useDeviceOnline` alone.

On `unread === 'failed'`, the dialog asks `readRefusalState(error, cid, close)`
(`src/components/layout/server-refusal-state.tsx`). The server's 401 on the dialog's
own read (a revoked token, which `/server` never refuses) gets the compact
**Reconnect** row, and anything else goes to `serverRefusalState`. `close` runs
before sign-in opens, so no dialog is left under it. A `null` answer means the read's
own error, with Retry while online.

Two dialogs decide more before that. Add to collection shows one **Reconnect** row
in place of its list while `useSignedOutConnection` names its connection, not one
row per collection as each row's read is refused in turn. Share also treats a kept
people list whose read again failed online as failed. Save replaces every share
with the picked people, so it waits for a list the server answered.
