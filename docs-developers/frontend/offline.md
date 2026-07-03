---
title: Offline & PWA
description: "Downloads on native (expo-file-system) and web (Cache API + service worker), the manifest/registry store, playing local files, and what the PWA layer actually covers offline."
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
  file's current absolute URI from the live storage root; **native-only** (see
  relocation below).
- `migrateLegacyBook(libraryId, path, target)` - one-time adoption of a
  pre-connection-scoping download: move its files under `target`'s scoped
  location and return `true`, or delete them and return `false` when `target`
  is `null`. See the migration step below.
- `removeBook(connectionId, libraryId, path)`, `totalBytesUsed`.

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
- `hasControllingSW()` waits briefly (bounded at 3 s) for a first-ever
  registration to claim the page before giving up.

## The registry store (`src/downloads/store.ts`)

`useDownloads` (Zustand) keeps a `Registry` of `DownloadEntry` keyed by
`downloadKey(connectionId, libraryId, path)`
(`"<connectionId>:<libraryId>:<path>"`), persisted as JSON under
`audiosilo.downloads` in AsyncStorage. Every entry carries its `connectionId`.

**Entry shape** (`src/downloads/types.ts`): `status` (`queued → downloading →
downloaded | error`), aggregate `progress` (0..1), `bytes`/`totalBytes`, an
optional `error` message, and the **manifest** - the offline source of truth:
the full `Book`, the `ChaptersResponse`, the ordered `files`
(`relPath → localUri`), `coverUri`, `savedAt`. The manifest is everything the
player needs to build a queue and render with no network.

### Lifecycle

- **Queue**: `download(connectionId, libraryId, book, chapterData?)` registers a
  `queued` entry and pushes its key onto a module-level FIFO; **one book
  downloads at a time** (`runQueue`/`runOne`). Repeat requests for a
  non-errored entry are ignored. No `ApiClient` is passed in - `runOne` resolves
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
- **Errors**: a failed run removes the partial files (`engine.removeBook`) and
  marks the entry `error`; a **cancel** (`cancel()` aborts the in-flight
  controller) removes files *and* the entry entirely. `remove()` is the
  user-facing delete: abort + `engine.removeBook` + drop the entry. Files on
  the server are never touched.
- **UI**: `useDownloadControls` (`use-download-controls.ts`) wraps all of this
  for the book screen / badges; the `/downloads` screen lists entries and shows
  `engine.totalBytesUsed()`.

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
   deterministic layout - **keep those two in agreement**. On web `localUri` is
   absent and relocation is a no-op (cache URLs are stable keys, not container
   paths).
3. **Only fully-downloaded books survive a relaunch.** The engines can't resume
   a download interrupted by an app kill, so partial entries are dropped and
   cleaned up. A surviving entry requires `status === 'downloaded'` and every
   file passing `engine.fileExists`.
4. Surviving manifests **seed the React Query cache** (`qk.item(connectionId, …)`
   and `qk.chapters(connectionId, …)`), so the book screen renders instantly
   offline.
5. On web, `probe()` then runs and may downgrade `supported` - the UI hides
   downloads rather than offering ones that won't play offline.

**Purge on connection removal.** The store registers an `onConnectionRemoved`
handler (from `src/stores/session.ts`): when a connection is removed (Settings →
Servers, or sign-out), it aborts any in-flight transfer for that connection,
deletes its books' files (`engine.removeBook`), and drops their entries. Re-adding
the server mints a **new** id, so those records would otherwise be unreachable
forever. The connection-remove and sign-out UI warn the user first when the server
has downloads on the device.

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

`src/lib/register-sw.web.ts` registers `<BASE_URL>/sw.js` on `window` `load`,
appending `?dev=1` under the dev server; it no-ops without `serviceWorker`
support or a secure context. `register-sw.ts` is the native no-op twin; the
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
