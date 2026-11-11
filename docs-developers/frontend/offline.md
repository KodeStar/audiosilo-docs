---
title: Offline & PWA
description: "How the player downloads books on native (expo-file-system) and web (the Cache API and a service worker): the registry store and its manifest, failures that keep finished files, the ebook and read-along map in a download, the listening-sync outbox, the offline companion (community metadata kept with a download), keeping the next books ready, the Downloads page, playing local files, and what the PWA layer covers offline."
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

Podcast episodes are never downloaded. The store answers `unsupported` for a
`book.episode`. Auto-download and keep-ahead skip episodes; keep-ahead tells them
apart by the entry's library kind. See
[Podcasts](podcasts.md#what-episodes-never-do).

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

A retry walks the specs in order and **skips** a file whose manifest slot has the
same `relPath` and still exists on disk. The on-disk name is the file's index, so a
file only counts where it was saved.

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

The Downloads page words each kind for the listener.

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

3. **`reviveEntry(entry, allPresent)` decides what survives.** It is pure and
   tested.
   - A `downloaded` entry stays as it is, unless it lists no files or one fails
     `engine.fileExists`. Then hydrate drops it and removes its folder.
   - Any other entry with finished files comes back as `error` and keeps them. It is
     dropped too when one of them is gone. `kept`, `progress` and `bytes` are
     recomputed from the files really on disk. Its `failure` is:
     - its classified `failure`, for a failure;
     - `{ kind: 'interrupted' }` ("The app closed before it finished"), for a
       download the app closed mid-way;
     - `unservable`, on web with every file saved and no EPUB to come. Only the
       offline check was left, and the service worker may not control the page.
   - A failed or cut-short entry with **no** finished file stays too (most books are
     one file). It becomes an `error` row with `kept: 0` and Retry, and the caller
     empties its folder. A `keep-ahead` entry like that is dropped instead, because
     keep-ahead plans it again and never retries a failure.

   The engines can't resume a half-written file, so Retry starts that file again and
   skips the rest. Keeping these entries needed no engine or storage format change.

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

Re-adding the server mints a **new** id, so those records would otherwise be
unreachable forever. The connection-remove and sign-out UI warn the user first when
the server has downloads on the device.

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

**Kept current.** The root's services start `startReadalongRefresh`, on the web after
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
`generated_at`, cleared once a map is kept), so it is not fetched again at every
launch. A map made again has another `generated_at`, so it is tried.

**Read offline.** The Text tab reads the copy with `readDownloadedReadalong`
(`qk.readalongLocal`, `networkMode: 'always'`) with the EPUB on the device. A copy
that can't be read gives way to the server's map when the server has one ready. A
server map made from another ebook than the download's is never used with it. The
Text tab says "The read-along is for a different edition of the ebook" instead
([The ebook reader](reader.md#the-map)).

A download made by an app that did not yet keep maps, or one whose map fetch failed,
has no map until `startReadalongRefresh` takes the book's next `/item` answer.
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

Only `false`, or a rollback this launch, takes the `PUT` path. An older server is
covered by the rollback below. A `404` that a fresh `/server` confirms turns what
waited into `PUT` saves, so nothing is lost.

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
- the server's clock skew from the answers' `server_time` (`clockSkewMs`), which
  `progress-sync` reads through `stored-skews.ts`.

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

Each answer is handled like this:

- Every status but `rejected` removes the event. `rejected` moves it to the
  couldn't-sync list with its reason.
- The answer's progress rows go into the query cache. A row this device's event was
  kept for has its version acknowledged (`ackVersion`, never lowered). That is
  `keptMine`: applied, or diverged with `kept: "event"`, and the row's `device_id` is
  this device's. The place reconcile is told of the rows (`onSyncAnswer`) so it can
  offer another device's place.
- An answer that arrives while the cached `listening_sync` flag is `false` makes the
  query cache ask `/server` again. The server took the events, so the cached answer
  is older than the server.
- A network error, `401`, `403` or `5xx` keeps everything for the next trigger. A
  network error also notes the failure for reachability.
- A `413` or `too_many_events` halves the chunk. One event alone that still gets a
  `413` moves to the list as `too_large`.
- Any other `400` sends that chunk's events one by one, once. One refused alone moves
  to the list as `invalid`.
- An event older than 90 days (the server's own bound, `syncRejectAge`) is not sent.
  It moves to the list as `too_old`, so an event that never gets an answer can't hold
  its book "pending" forever.
- A `404` or `405` is a **rollback** only when the server's own `/server` answers
  without `listening_sync`. Anything else at the address keeps the outbox. A
  rollback:
  - marks the connection rolled back for the launch;
  - makes that `/server` answer the connection's from then on, in the query cache
    and on the device (`keepServerAnswer`);
  - turns the outbox into one legacy `PUT` per book (`legacySavesOf`) and drops it.
    Each `PUT` takes the newest span's end, finished when the newest finish-state
    event is a `finish` not older than it;
  - makes the player save by `PUT` from then on.

  Each of those `PUT`s carries the
  [replay guard](state-and-data.md#the-replay-guard), since no server resolved those
  spans against its row. A Mark as finished has no span, so its `PUT` takes place,
  length and speed from the mirror record the finish wrote (`withFinishedPlace`), not
  0 of 0. The rollback's `PUT`s run as a send, so an Undo's withdrawal
  ([Taking a finish back](#taking-a-finish-back)) waits for them.

**When a web page goes.** On `pagehide` the web sends what waits with `keepalive`,
oldest first, up to about 60 KB (`fitKeepalive`). That includes the span closes still
queued behind a lock, because a lease's timer never fires on a page that is going.

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
- A book's history merges this device's unsent listens as sessions marked "Waiting to
  sync" (`usePendingListens`) until the server's rows replace them.
- The Journal's Diary shows every connection's unsent listens the same way
  (`useWaitingListens`, [The Diary](journal.md#the-diary)).
- The book's page and Home show this device's newer place before it syncs
  ([The place Resume plays](state-and-data.md#the-place-resume-plays)).

**Sign-out, removing a server and removing a person** first send what they can
(`unsentListens`, when the server is reachable). When listens are still unsent, they
ask the listener to confirm: "3 listens haven't synced to Home. Sign out anyway?". The
count here is every waiting event, a finish too. Signing out purges them. It is a
confirm, not a block.

**Resume by file.** The mirror's records carry the playing file and the seconds into
it (`file`, `file_pos`). A resume of this device's own place (`loadInitialProgress`)
plays that file from that place when the queue holds it. That holds even when the
place was saved on a download's older file order. The server does the same with a
span's file places. The local resume works on any server; the server's remap needs
`listening_sync`.

A file place is used only when it is not older than the record it is for
(`holdsFilePlace`). The check allows 5 s of slack, widened by how far the
connection's server clock is known to be ahead (the stored `clockSkewMs`). So a device
whose clock runs slow keeps its file place, and a mirror that lost writes never
resumes at a stale file.

### Taking a finish back

Mark as finished on a `listening_sync` server is a `finish` event, but its Undo is a
progress edit. A finish still waiting would reach the server after the edit and
finish the book again. So `undoFinish` (`finish-route.ts`) first calls
`withdrawFinish(connectionId, libraryId, path)`, which returns `{ unsent, restore }`:

- the book's waiting `finish` events leave the outbox;
- one whose request is out is waited for, from this tab or, on the web, from
  another ([Across tabs](#across-tabs));
- a chunk read before the withdrawal drops the withdrawn events.

Then one of two things happens.

- **The server cannot have the finish, or cannot be asked** (`unsent`). One was taken
  back, none it waited for was answered, and none of them may be on the server
  (`serverMayHold`, below). That is a finish that:
  - was never sent, or was sent only while its server was marked down or the browser
    offline (an offline Mark as finished);
  - the server refused with its own HTTP error, such as a 503 or any 4xx (a refused
    batch stores nothing);
  - got no answer, with the server looking down when Undo is pressed. No edit can be
    made, and the likeliest reading is a request that never left.

  The Undo is done on the device, with no edit. `unrecordFinish` (below) puts the
  mirror back. Offline Undo works.
- **The server has it, or may have it.** The player sends the progress edit. An edit
  that fails puts the taken events back and flushes (`restore`), so both sides end
  finished. Sent again, a finish the server already had is a `duplicate`. There are
  two cases:
  - a finish it waited for was answered;
  - a request carried the finish while its server looked reachable and got no answer
    (`gotNoAnswer`), and the server looks reachable now. The request may have arrived
    and only its answer been lost, so the edit goes. It unfinishes the book either
    way.

  After an edit that went through, `unrecordFinish` puts the mirror back here too. The
  edit's answer only reaches the query caches, and the finished record would start the
  book again at 0 on the next offline Play.

**No answer** (`gotNoAnswer`) is a timeout, a dropped connection, a gateway that lost
the server (`GATEWAY_LOST`: 502, 504, Cloudflare's 520 and 524) or a 2xx whose body
could not be read. Any other HTTP error is the server's own answer. The web's
page-close keepalive send (`sendOnPageHide`) counts as no answer as soon as it
leaves, because the page is going and its answer may never be seen.

Such finishes are noted in `maybeReached` for this launch, only when the request left
while the server looked reachable (`looksReachable`: not marked down, and the browser
not offline). On the web the stored entry is marked too, for an Undo in another tab
([Across tabs](#across-tabs)).

**The mirror going back** (`unrecordFinish`, `store.ts`). This device's record from
before the finish (kept by `recordFinish` in `beforeFinish`) replaces the finished
one.

- It is stamped with the time of the record it replaces. For a downloaded book that
  may be the server's row for the finish, newer than the finish's own time. The mirror
  keeps the newest record, so an older stamp would be refused.
- The mirror's own `ack_version` and `answered` are kept.
- With no earlier unfinished record, the finished record is rewritten unfinished at
  the place before.
- A place saved since the finish (the record is no longer finished) is left as it is.

A withdrawal that fails still lets the edit through, with nothing taken back.

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
- *What `captureOfflineMeta` skips.* A book that can't match because it has no ASIN
  or ISBN (`canMatch`, which reads the cached full item first, since the manifest's
  book can be the list shape). Also a server without `metadata`.
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

Those reads are held while the device has no network
([The online flag](state-and-data.md#the-online-flag-srclibdevice-onlinets)), and the
network that comes back may be mobile data. So `startOne` asks the network gate again
after the reads, and a book the gate no longer allows is `declined`.

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
- `storageBar` builds the storage bar:
  - one segment per server, taking the chart colours in `CHART_ORDER`: `chart-2..5`,
    then `chart-1`. The brand pink comes last, so the page keeps one pink thing. A
    sixth server and on fold into "N more servers";
  - an **Other apps** segment on a device (`capacity - free - ours`). A browser can't
    see other apps;
  - `used`, preferring the engine's `totalBytesUsed` over the registry's sum.

  `useStorage` re-reads both only when a book lands or leaves.
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
`keepAhead` and `autoDeleteFinished`. Settings and the series page's `KeepAheadCard`
show the same control and status line (`KeepAheadControl`, `KeepAheadStatusLine`).
The page publishes its summary line into the sub-nav with `SubNavActions`.

In the iOS app the page also holds **On your Apple Watch** (`WatchSection`), between
In progress and Ready offline. Those are the watch's copies, not this device's, and
none of the above applies to them
([The watch in Downloads](apple-watch.md#the-watch-in-downloads)).

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

- The download's start seeds the mirror from a `getProgress`, else from the cached
  `qk.progress` (`keepServerPlace`).
- `fetchBookProgress` writes each online answer for a book kept offline
  (`setKeptOfflineCheck`, `writeMirror(progressToSave(...))`). The write keeps the
  newest record, so a newer local save is never regressed.

Home's progress list seeds every downloaded book the same way
([Progress sync](state-and-data.md#progress-sync-srcplaybackprogress-syncts)).

### Downloaded while streaming

A `useDownloads.subscribe` listener watches for the playing book turning
`downloaded`, then calls `switchCurrentBookToLocal`. That rebuilds the queue against
the manifest and prefers the engine's **gapless `swapTo`**: it buffers the local
source in parallel, then switches at the same position.

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
  The resume floor moves with it. While that changes the track index, `persist` and
  `onRemoteMove` refuse a place at another index of the book (`swapHold`) until the
  download's queue is committed. On a `load`, that commit comes before the rate and
  the play.

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
file is partial (`partialQueues` in `store.ts`):

- `playBook` reads `endsBefore`. Started with the device offline (`isDeviceOnline`),
  such a download builds its queue from the download's own copy (its files and
  chapters) whatever chapters its caller gave it (a cold start's cached server
  chapters name the files it lacks, and streaming them would stall into a stream
  error at the downloaded part's end). Online it plays the chapters it
  was given, streams the rest, and is not partial.
- `adoptLoaded` with no server answer reads the last file of the engine's order and
  `endsBefore`.

Its end is the downloaded part's, so:

- The engine's `ended` there reads as a pause, never a finish: no credits, no
  `finishBook`, no finished save.
- The listener is told "The rest of this book isn't downloaded"
  (`onPartialDownloadEnd`, shown as a toast by `partial-download-notice.ts` once the
  app is looked at). A stop with no listener yet, such as a car start before the root
  layout mounted, is told as the listener registers.
- A place past that end lands short of it and stays paused, with the same notice.
- Play pressed at that end (`toggle`, while the engine's last word is that `ended`:
  `atPartialEnd`) starts no play attempt, since the ended engine never reports
  `playing` and the [stall watchdog](playback.md#the-stall--error-watchdog) would call
  it an error. It shows the notice again.
- The end credits' Play never finishes such a book by its place
  (`selectEndsPartial`): it stops, unfinished.
- A span recovered after a kill in the last seconds (`mirrorSpanEnd`) never makes
  the record finished. Each mirror capture in a partial queue says so
  (`ProgressSave.partial`), and `mirrorSpanEnd` also asks the download
  (`downloadEndsBefore` in `kept-offline.ts`), since a server row written into the
  mirror since the capture carries no `partial`. Only a span that ended in the
  book's last file (streamed, so its end is the book's) finishes it.

**Online adoption streams on** too: an Android adoption that holds a file the
download lacks builds its queue from the server's chapters
([The engine's file order](native-integrations.md#the-engines-file-order)).

The regression tests are `store-adopt.test.ts`, `end-credits.test.tsx`,
`listening-outbox.test.ts` (span recovery) and `downloads/store.test.ts`
(`endsBefore`).

## The PWA layer

### `public/sw.js`

The service worker is hand-written, with no build step. Expo's static export copies
`public/` verbatim, so the worker is served at `<base>/sw.js` with scope `<base>/`. It
has exactly two jobs.

1. **App shell.** All of the shell's files live in `audiosilo-shell-v1`.
   - Navigations are **network-first**. They fall back to the cached response for
     that route, then to the cached scope root (a shell that boots the SPA), then to
     a 503.
   - The build's own content-hashed files (`<base>/_expo/static/`) are served
     **cache-first** and never written again.
   - Other static assets with destinations `script | style | font | image |
     manifest` are **stale-while-revalidate**.
   - The `install` step precaches the scope root and the ebook reader's document
     (`<scope>reader.html`, `readerDocumentUrl`). So a downloaded book's EPUB opens
     offline even when the reader never opened online. Each is added on its own, and
     a failure is skipped (a first install offline, or an older server with no
     reader); runtime caching covers it. The reader's document never gets the shell
     as its offline fallback.
   - API calls (destination `''`), token-bearing URLs (`?token=`) and
     server-streamed audio pass straight through to the network. The service worker
     never caches API data.
2. **Offline media.** Requests whose path contains `/_offline/` are answered from
   `audiosilo-media-v1`.
   - The worker answers a `Range` request by slicing the cached response's Blob into
     a proper **206** with `Content-Range`, or a 416 for an unsatisfiable range.
   - `blob.slice` is O(1) and streams only the requested bytes. Reading the whole
     file into an ArrayBuffer stalled seeks for seconds.
   - The 206 matters beyond seeking. Safari refuses a 200 for media, so without the
     206 path downloaded books wouldn't play there at all.

**Precaching the split build** (`precacheBuild`). The web build is split by route
(see [the web start](web-build.md#the-web-start-a-split-build)). A page's chunk loads
when the page is first opened, so a page never opened online would not boot offline.
The worker therefore:

1. fetches the shell (the scope's `index.html`, `cache: 'no-cache'`);
2. caches every build script and stylesheet it names;
3. caches every chunk those name, level by level;
4. caches the shell itself once its own files are in, so offline it always boots.

It runs at `install`, and again when the app sends a `precache` message
(`askPrecache`). The app sends it `PRECACHE_DELAY_MS` (5 s) after the page has
loaded, so the fetches never compete with the first screen.

A record in the cache (`__precached-build`) names the build last precached. An ask
whose shell names the same files is done at once, and a hashed file already cached
isn't fetched again. Once a build is complete:

- the build before it stays one deploy longer, because a tab still running it opens
  its pages from those files;
- older build files go;
- every page an earlier build cached goes too. Offline such a page falls back to the
  shell, which boots the new build.

Offline, or failing part way, the worker stops without writing the record, so the
next ask finishes it.

**One worker per deploy.** The app registers the worker under its build's name,
`sw.js?build=<entry>.<common>` (`buildId` in `register-sw.web.ts`). The two parts are
the names of the page's entry script and of the shared `__common` chunk, which the
entry does not name. So each deploy installs a new worker even though `sw.js`'s bytes
are the same. When the start scripts are cut into parts, these are the entry's last
part and the shared chunk's first.

The worker's `install` writes every build file again. Chrome compiles a script that a
worker caches while installing and keeps that code with the worker, which is most of
a warm start's speed.

`activate` deletes old shell cache versions but **never** the media cache, because
downloads must survive service worker updates.

When registered with `?dev=1` (the Metro dev server), the worker serves offline media
only. It precaches nothing and leaves the shell to the network, so its caching can't
fight hot reloading.

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

`src/lib/register-sw.web.ts` registers the worker under its build's name (`workerUrl`,
see [`public/sw.js`](#publicswjs)), or with `?dev=1` under the dev server. Outside
dev it asks the worker to precache the build (`askPrecache`). It does nothing without
`serviceWorker` support or a secure context.

It registers **at once when `document.readyState` is already `complete`**, else on
`load`. The module runs when the root layout is first required, which in the static
export is usually after `load` has fired. A `load` listener alone would then never
run, and the exported player would never register its worker. That leaves no offline
shell, and downloads that never become playable offline. `register-sw.web.test.ts`
pins both paths.

`register-sw.ts` is the native no-op twin. The root layout imports
`@/lib/register-sw` for its side effect, and Metro picks the right file per platform.

### What offline actually covers on web

| Works offline | How |
|---|---|
| Launching the installed PWA, or revisiting routes | network-first navigation falling back to the cached shell |
| Opening a page never opened online | every chunk of the build, precached per deploy (`precacheBuild`) |
| The app's JS, CSS, fonts and icons | cache-first for the hashed build files, stale-while-revalidate for the rest |
| A language other than English | its catalog chunk is part of the precached build |
| Playing **downloaded** books, including seeking | `_offline/` URLs and Range slicing from the media cache |
| Book and chapter metadata for downloaded books | manifests seeded into the React Query cache on hydrate |
| Progress while offline | the offline replay queue and the durable mirror in `src/playback/progress-sync.ts` |
| Reading a **downloaded** book's ebook | the reader host's `engine.readFile` on its `book.epub` in the media cache; the place in `src/reader/reading-progress.ts`'s queue and mirror |
| The Text tab (read-along) for a **downloaded** book | its `readalong.json` (`readDownloadedReadalong`) with its `book.epub` |

Not covered: live API data, such as browsing, search, and covers for books that are
not downloaded. The service worker deliberately never caches API responses. A screen
with nothing to show renders the shared offline state
([Offline states](state-and-data.md#offline-states-srcliboffline-statets)) behind the
offline banner, and everything refetches on reconnect. In the app the queries wait
for the network the same way
([The online flag](state-and-data.md#the-online-flag-srclibdevice-onlinets)).
