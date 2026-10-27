---
title: The ebook reader
description: "The player's EPUB reader (src/reader/, the /read route): the reader document built from vendored foliate-js in a web and an app variant, the sandboxed web host, the apps' WebView host and its chunked transfer, the EPUB cache and the EPUB in downloads, the message protocol, the reading-place queue with Sync v2's base_version, the Jump there offer and Read on the book page (Bridge Phase 3b)."
---

A book whose folder holds its EPUB gets **Read the ebook** on its page, and the
reader opens the EPUB paginated, remembers the place per user across devices, and
runs no script from the book anywhere. Bridge Phase 3b-1 built it for the web (an
iframe host); Phase 3b-2 added the apps' host (a WebView fed the book in chunks), the
per-book EPUB cache and the EPUB in downloads, so a downloaded book reads offline on
every platform. The server side is capability `ebooks`: a book's [`ebook`](../server/api/reference.md#get-apiv1librariesidbooks)
field, its bytes at
[`GET /libraries/{id}/ebook`](../server/api/reference.md#get-apiv1librariesidebook),
the place at
[`/libraries/{id}/reading-progress`](../server/api/reference.md#get-apiv1librariesidreading-progress)
and the reader document at
[`/web/reader.html`](../server/web-ui.md#the-reader-document-readercsp). The
listener's view is on [Reading the ebook](/users/listening/reading-the-ebook).

| Piece | Where |
|---|---|
| The reader document's source, and foliate-js vendored unmodified | `reader/src/` (`reader.js`, `epub-open.js`, `reader.html`, `reader.css`), `reader/vendor/foliate-js` + `FOLIATE_PIN.txt` |
| Its build | `scripts/build-reader.mjs` -> `public/reader.html` (web) and `src/reader/reader-html.native.ts` (the app's variant, a string module); `npm run reader:build`, `reader:check` in `npm test` |
| The route | `src/app/read.tsx` (`/read`, a root `fullScreenModal`), `readerHref` in `src/lib/paths.ts` |
| The screen | `src/reader/reader-screen.tsx` (`ReaderScreen`: top bar, page edges, Contents sheet, the offer, failures) |
| The hosts | `src/reader/reader-host.web.tsx` (the iframe), `reader-host.native.tsx` (the WebView, react-native-webview); `reader-host.tsx` re-exports the native one for type resolution; shared controls in `use-reader-controls.ts` |
| The app's book | `src/reader/ebook-file.native.ts` (`localEbook`: the download's copy, else the cache file; `hasLocalEbook`; `clearEbookCache`; the web's `ebook-file.ts` has the last two), `book-chunks.ts` (`sendInChunks`, `CHUNK_BYTES`), the reader's `reader/src/chunks.js` |
| The protocol | `src/reader/protocol.ts` (`parseReaderMessage`, `acceptReaderMessage`, `createHostChannel`) |
| The place | `src/reader/reading-progress.ts` (queue, mirror, `lookupReadingPlace`, `jumpOffer`, `adoptServerPlace`) |
| Read on the book page | `canRead` (`src/reader/can-read.ts`) in `src/components/book/hero-actions.tsx` |
| The EPUB in downloads | `manifest.ebookUri` (`book.epub`) in `src/downloads/store.ts`; see [Offline & PWA](offline.md#lifecycle) |
| Text size | `src/reader/reader-settings.ts` (`audiosilo.readerFontScale`, per device, not synced) |

## The reader document

The reader is its **own document**, never part of the app: foliate-js parses an
EPUB nobody vetted, so it runs in a page whose policy lets nothing out.
`scripts/build-reader.mjs` bundles `reader/src/` with the vendored foliate-js
(esbuild, one IIFE, es2022; only the View, EPUB, overlayer and CFI modules and
zip.js without workers: PDF, MOBI, FB2, comics, TTS and search are excluded) into
`public/reader.html`, **one** inline script and an inline style with no
subresources. The same build writes the app's variant,
`src/reader/reader-html.native.ts` (generated, prettier- and eslint-ignored, the same
CSP); the two differ only by esbuild's `__NATIVE__` define (the app's takes its book
in chunks over the WebView bridge and talks through `window.ReactNativeWebView`).
The page carries the whole policy as a meta CSP with the script's sha256
(`connect-src 'none'`); the server sends the same policy as a header, hashing the
served script itself, plus `frame-ancestors 'self'`, which a meta tag can't
set. Expo's web export copies `public/reader.html` to `dist/reader.html`, served as
`/web/reader.html`.

- **Generated and committed.** `npm test` runs `reader:check` (a rebuild compared
  byte for byte), so a change under `reader/` without a rebuild fails the gate.
- **foliate stays unmodified.** `FOLIATE_PIN.txt` holds the upstream commit and
  each vendored file's sha256; the build refuses an edited copy.
- **Polyfills first.** `reader/src/polyfills.js` defines `Object.groupBy` and
  `Map.groupBy` where the engine lacks them: foliate's EPUB parser calls both on
  every open, and they came only with Safari 17.4 and Chrome 117 (the app's iOS floor
  is 16.4).
- **The route is `/read`, never `/reader`.** The static export would write a
  `reader` route to `dist/reader.html`, over the reader document, and the server
  answers every path naming `/web/reader` with the document.
- **The service worker** (`public/sw.js`) never answers `/web/reader.html` with
  the app shell (its navigation fallback skips it), which would boot the whole app
  inside the reader's frame.
- **EPUB scripts never run**, three layers deep: the loader never loads a script
  file and removes `<meta http-equiv=refresh>` (`book.transformTarget`); the
  document's CSP, inherited by foliate's `blob:` section frames, admits only the
  reader's own script by hash; and the iframe's sandbox has no popups, forms, modals
  or top navigation. A blocked load comes back to the host as a `csp` message and is
  logged.
- **What it does**: paginated layout (foliate's paginator, lines at most 720 px wide), turns
  by the host's `next`/`prev` and by its own keys (arrows follow the book's
  direction, Page Up/Down) and touch swipes, a section-loading signal for the
  spinner, the flattened contents, the theme (the app's scheme and card colours)
  and a text scale. A DRM-encrypted book (`META-INF/rights.xml`, or an
  `encryption.xml` encrypting more than fonts) or a file that isn't an EPUB is a
  typed `error` (`drm`, `unreadable`) the screen shows.

## The web host

`ReaderHost` (`reader-host.web.tsx`) renders the document in an iframe:

```html
<iframe src="/web/reader.html" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer">
```

Same-origin (foliate can't run in an opaque origin) but sandboxed. The host fetches
the EPUB itself with `client.ebook(libraryId, path)`: the **book's** path, the
`Authorization` header, never `?token=`, read piece by piece into one buffer with
a timeout that restarts on every piece (so a slow, large ebook arrives and only a
stalled download fails). It posts the bytes in `open` as a **transferable**: the
reader never sees a token or an API URL, and foliate never runs in the `/web`
document, whose CSP is unchanged.

A frame that never says `ready` within `READER_START_MS` (30 s: a proxy that
refuses the frame or its script, a browser that can't run it) is a
`ReaderStartError`, the screen's "The reader didn't start" notice with Try again,
never an endless spinner. A `ready` after an `open` was delivered (the frame
reloaded, and the transferred bytes went with it) fetches the book again.

A downloaded book (`manifest.ebookUri`, the web engine's `readFile` straight from the
media cache) is read from the download whenever it is there, fetching nothing, so it
opens offline.

### The protocol

On the web, `postMessage` on the page's own origin only, both ways; in the app, JSON
strings over the WebView's bridge ([below](#the-app-host)). Host messages wait in the
channel (`createHostChannel`) until the reader says `ready`.

| Direction | Messages |
|---|---|
| host -> reader | `open {book (ArrayBuffer), name, at?: {cfi?, fraction?}, theme, fontScale}` (web) or `open {size, chunks, name, at?, theme, fontScale}` then `chunk {seq, data (base64)}` for `seq` 0 to `chunks - 1` (app), `goto {href \| cfi \| fraction}`, `appearance {theme, fontScale}`, `next`, `prev` |
| reader -> host | `ready`, `opened {title, toc: [{label, href, depth}], rtl}`, `progress {cfi, fraction, sectionLabel}`, `loading {value}`, `error {code: drm \| unreadable \| runtime, message}`, `escape`, `csp {directive, blocked}` |

The reader's messages describe a book nobody vetted, so `acceptReaderMessage` takes
a message only from **that frame's** `contentWindow` on our own origin, and
`parseReaderMessage` checks it field by field (types, the CFI's length, text and
TOC sizes): anything else is dropped. `escape` exists because a key pressed in the
book stays in the frame; the reader turns pages itself and sends Escape back so the
screen can close.

## The app host

`ReaderHost` (`reader-host.native.tsx`) renders the app's variant in a
react-native-webview `WebView` (an exact pin, bumped only with `npx expo install` and
a device run of the reader on both platforms):

- **The document is an HTML source**: `source={{html: READER_HTML, baseUrl:
  'https://reader.audiosilo.invalid/'}}`. The base URL gives the document an origin
  (without one, Android's foliate makes `blob:null` section URLs and the renderer
  dies); `.invalid` is reserved, so nothing can ever answer there, and the CSP
  refuses every load anyway (`connect-src 'none'`, as on the web).
- **No file access at all**: `allowFileAccess`, `allowFileAccessFromFileURLs` and
  `allowUniversalAccessFromFileURLs` are all false, with `domStorageEnabled` and
  `cacheEnabled` off, `setSupportMultipleWindows={false}` and
  `javaScriptCanOpenWindowsAutomatically={false}`. The WebView reads no file of the
  app's and makes no request.
- **Navigation**: `originWhitelist={['*']}` with `onShouldStartLoadWithRequest`
  (`allowNavigation`) admitting only the base URL, `about:blank` and `blob:` URLs of
  the document's own origin (foliate's section frames). A whitelist miss would hand
  the URL to the system (`Linking.openURL`), so the whitelist admits everything and
  the handler refuses.
- **Messages**: on Android the bridge object is injected into every frame, the
  book's too, so every message is parsed field by field (`readNativeMessage` ->
  `parseReaderMessage`); the reader takes only string events with `source === null`
  (the WebView's own).

**The book in chunks.** The host finds the EPUB as a local file (`localEbook`,
started at mount while the WebView loads) and, at each `ready`, posts `open {size,
chunks, ...}` and then the file in **256 KB base64 chunks** (`CHUNK_BYTES`,
`sendInChunks`): each piece is read natively (`readAsStringAsync` with `position`
and `length`, encoded natively, never in JS) only once the last one was posted, so
one piece's base64 is held on this side at a time. The size was measured: on a 25 MB
book, 256 KB pieces open as fast as 1 and 2 MB ones, at the lowest peak memory (about
a plain file load's). The reader (`reader/src/chunks.js`, `createAssembly`)
allocates one buffer of the announced size and refuses, as `unreadable`, a size over
512 MB (`MAX_BOOK_BYTES`) or a bad chunk count, a chunk out of order, repeated or
extra, data that isn't base64, and a book larger or smaller than announced; then it opens the buffer as the
web reader opens its `ArrayBuffer`. A newer `ready` (the document reloaded) stops
the running transfer and starts again.

**Why not a `file://` load.** The plan was to load the reader document from a file
beside the EPUB and let it read the book by URL, with no base64 over the bridge. The
3b-2 proof (iOS 26.5 simulator, Android emulator) failed it: on both engines the page
can read a local file only with `allowFileAccessFromFileURLs` on, and neither
engine's CSP can name one file or one directory, only `connect-src file:`. With that
setup a script in the page read a file in a sibling directory and one in the app's
documents directory on both platforms (on Android, the whole private data
directory). Chunks over the bridge keep `connect-src 'none'` and every file access
flag off, need no server change, and work offline.

**Process death.** When the WebView's content process dies (iOS,
`onContentProcessDidTerminate`) or its renderer is gone (Android,
`onRenderProcessGone`), the host ends that WebView's session at once and makes a new
one that reopens at the last `progress` place, `MAX_RELOADS` (3) times in a row,
then `ReaderStartError`. A death `STABLE_MS` (60 s) or more after that WebView's
`opened` resets the count (the system reclaimed a book that had stayed open). A death while
the app is in the background makes the new WebView only once the app is back
(`whenActive`): made away, it may get no running process and its start timeout would
run out. The host tells the screen about each new document (`onReopen`, the web host
too when its frame reloads), which clears `opened` so the edges, toolbar and offer
wait for the next `opened`. Once the book has shown, a later `drm` or `unreadable` is
reported as `start` (the same file opened before), and Try again reopens where the
reader was (`resumeAt`). In the app the `start` notice's body is
`reader.failure.start.bodyNative` (memory, not a browser).

### The EPUB cache

A book that isn't downloaded with its EPUB is fetched into the reader's cache
(`localEbook` in `ebook-file.native.ts`): one folder per **connection, library and
book** under the app's cache directory (`<Paths.cache>/reader/<connectionId>/<libraryId>/<pathSlug(rel_path)>/`),
holding `book-<size>.epub`, **named by the server's `ebook.size`** it was fetched
for. The fetch is `api.ebookRequest` with the Authorization header (the route takes
no `?token=`) through `File.createDownloadTask` (on iOS a foreground session, which
fails at once offline instead of waiting days for a connection), into a numbered
`.part` file moved over the cache file only when complete, so a cut-short download
never reads as the book. A server status becomes an `ApiError` (404: the screen's
`missing`).

- **The rule**: the download's copy (`manifest.ebookUri`) when it is there and not
  empty, else `book-<size>.epub` when it is there and not empty, else a fetch. A new
  `ebook.size` (a scan saw the ebook change) misses the cache, fetches it again and
  drops the folder's other files (an older size, a dead fetch's part).
- **Dropped with its connection**: `clearEbookCache(connectionId)` deletes the
  connection's folder, from `reading-progress.ts`'s `onConnectionRemoved` (removing
  the connection or signing out of it). The system may clear the cache directory
  any time; the next open fetches again. On the web `clearEbookCache` is a no-op
  (`ebook-file.ts`): the web host fetches each time or reads the download.

## The screen

`ReaderScreen` (`/read?connection=&libraryId=&path=`) is a root modal like the
player. On the web its root is `role="dialog"`, `aria-modal`, `data-layer="reader"`,
so the player's global shortcuts stand back; its own Escape and bare arrows use
`useGlobalShortcut(..., 'reader')` (with Cmd, Ctrl or Alt held they are the
browser's). A right-to-left book (`opened.rtl`) turns forward from the left edge and
ArrowLeft. The top bar holds close, the title, the section label and percentage,
Contents (a `Sheet` of the TOC, the current section in bold) and the text size
steps (A-/A+, `FONT_SCALES` 0.8 to 1.8). The page edges are 44 px tap targets over
the margins. A spinner shows only when a section takes over 300 ms to lay out.

Failures are plain notices (`reader.failure.*`): `drm`, `unreadable`, `missing`
(a 404 for the book or the ebook), `fetch` (no answer, or the place couldn't be
looked up) and `start` get Try again where it can help (`fetch`, `start`);
`noEbook` covers a link to a book without one.

### Read on the book page

`canRead(ebooks, book, downloadedEbook)` needs the book's `ebook` field and the
capability `ebooks` on every platform: `true`, or still unknown (offline) when the
book's finished download holds the EPUB (`manifest.ebookUri`). A server that says
`false` never offers it, downloaded or not. The reader screen applies the same rule.
The hero shows an outline **Read the ebook** button after the download (its own row on
a phone) that pushes `readerHref(connectionId, libraryId, book.rel_path)`.

## The reading place

`reading-progress.ts` follows [Progress sync](state-and-data.md#progress-sync-srcplaybackprogress-syncts)'s
pattern for the listening place: an offline queue keeping the **latest** save per
`(connection, library, book path)`, replayed through each save's own connection
(`flushReadingQueue`, when the reader mounts and after any save that reaches the server; while the connection is marked unreachable, saves go straight to the queue), a durable mirror
(`audiosilo.readingMirror`, `audiosilo.readingQueue`: scoped storage keys, in
`ID_DOCUMENTS` for the identity migration, dropped with their connection), and a 4xx
dropped (it can never succeed). It is separate from listening progress on purpose.

The screen saves two seconds after the reader rests on a page (`progress` messages
are debounced) and at once on close or when the app goes to the background.

**`base_version`** is what it adds, the client half of
[Sync v2's rule](../server/api/reference.md#the-conflict-rule-sync-v2): every save
carries the last server `version` this device **acknowledged** (0 only when no row
was ever seen).

- An answer that kept **this device's** place is acknowledged at once.
- An answer that kept **another device's** place is acknowledged only once the open
  reader has shown it (`adoptServerPlace`): Jump, Stay, or the reader already being
  there. Until then this device's saves stay diverged, so a further place it never
  saw is never moved back; after Stay its next save applies, which is how moving back
  on purpose works.
- **The offer** (`jumpOffer`, judged against the page on screen): when a save's
  answer kept another device's row whose place differs from the current one, a
  non-blocking card says `On {device} you were at {percent}%. Jump there?` with
  Jump (`goto {cfi}`) and Stay. `device_name` is the server's (empty: "On another
  device"). `other_place` is not read in 3b.

**Where it opens** (`lookupReadingPlace`, `readingPlaceQuery`): the newest of the
server's row, this device's mirror and its queued save, or that queued save when the
server will keep it (diverged and further on). With no answer from the server it
falls back to this device's places; with none of those either it fails (the `fetch`
notice; Try again looks again), never a guessed start whose save could replace a
place read elsewhere. A 401 always fails it. The query runs whatever the browser's
online flag says (`networkMode: 'always'`), so an offline reader opens at a local
place or says it can't instead of waiting on a spinner. Opening at the server's row
adopts its version.

**A book whose EPUB is on this device, opened offline with no local place**, is the
one exception to "never a guessed start". When the lookup's request got no answer from
the server (any answer, an error status included, still fails the lookup, and so does
having no client for the connection) and
`hasLocalEbook` finds the EPUB (in the app, the download's copy or the cache file for
the current `ebook.size`; on the web, only a download), it opens at the start of the
book. Its saves carry `base_version: 0` ("saw nothing"), which the server's
`ResolvePlace` takes as diverged from another device's row, so it keeps that device's
further place, and the answer to the first save that reaches the server (the queue's
replay while the reader is open, or a save on the next online open) offers Jump there.

## Still to come

Phase 3c: read-along with the audio. Known follow-ups: a generic save queue shared
with progress sync, fetching the EPUB alongside the place lookup, the page edges
overlapping text on narrow phones; from 3b-2, a clearer notice for a book over the
512 MB limit or an allocation failure, checking a downloaded `book.epub`'s size, a
cap on the cache's size, a disk-full notice, pinch zoom, a download fetching an EPUB
the cache already holds, and the two hosts' duplicated session setup.
