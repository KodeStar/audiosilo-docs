---
title: The ebook reader
description: "The player's EPUB reader (src/reader/, the /read route): the reader document built from vendored foliate-js in a web and an app variant, the sandboxed web host, the apps' WebView host and its chunked transfer, the EPUB cache and the EPUB in downloads, the message protocol, the reading-place queue with Sync v2's base_version, the Jump there offer and Read on the book page (Bridge Phase 3b); read-along (Bridge Phase 3c-2): the map, its messages both ways, following the narration and the full-screen reader's Follow narration."
---

A book whose folder holds its EPUB gets **Read the ebook** on its page, and the
reader opens the EPUB paginated, remembers the place per user across devices, and
runs no script from the book anywhere. Bridge Phase 3b-1 built it for the web (an
iframe host); Phase 3b-2 added the apps' host (a WebView fed the book in chunks), the
per-book EPUB cache and the EPUB in downloads, so a downloaded book reads offline on
every platform. Phase 3c-2 added [read-along](#read-along-following-the-narration):
with a book's read-along map, the reader follows the narration sentence by sentence,
in the companion's Text tab and in the full-screen reader. The server side is capability `ebooks`: a book's [`ebook`](../server/api/reference.md#get-apiv1librariesidbooks)
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
| Text size | `src/reader/reader-settings.ts` (`audiosilo.readerFontScale`, per device, not synced); the theme and size both screens use, `use-reader-appearance.ts` |
| One session setup (both hosts) | `src/reader/reader-session.ts` (`startReaderSession`), `use-place-gate.ts` (`usePlaceGate`), `page-edge.tsx` (`PageEdges`, `narrowPageEdges`, `FollowPill`) |
| Read-along | the reader's `reader/src/readalong.js` (the core); `src/reader/readalong-map.ts` (`parseReadalongMap`, `readerMapOf`, `cfiAt`), `readalong-gating.ts`, `use-book-readalong.ts`, `narration.ts`, `use-reader-readalong.ts`; the Text tab in `src/components/player/companion/` ([Player UI](player-ui.md#the-text-tab-read-along)); the map in downloads in `src/downloads/readalong-file.ts` ([Offline](offline.md#the-read-along-map-in-downloads)) |

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
| host -> reader | `open {book (ArrayBuffer), name, at?: {cfi?, fraction?}, theme, fontScale}` (web) or `open {size, chunks, name, at?, theme, fontScale}` then `chunk {seq, data (base64)}` for `seq` 0 to `chunks - 1` (app), `goto {href \| cfi \| fraction}`, `appearance {theme, fontScale}`, `next`, `prev`; read-along: `readalong {map}`, `position {t, rate, playing}`, `follow` ([below](#the-read-along-messages)) |
| reader -> host | `ready`, `opened {title, toc: [{label, href, depth}], rtl}`, `progress {cfi, fraction, sectionLabel}`, `loading {value}`, `error {code: drm \| unreadable \| section \| runtime, message}`, `escape`, `csp {directive, blocked}`; read-along: `seek {t}`, `following {value}`, `readalong {state, unresolved}` |

The reader's messages describe a book nobody vetted, so `acceptReaderMessage` takes
a message only from **that frame's** `contentWindow` on our own origin, and
`parseReaderMessage` checks it field by field (types, the CFI's length, text and
TOC sizes): anything else is dropped. `escape` exists because a key pressed in the
book stays in the frame; the reader turns pages itself and sends Escape back so the
screen can close.

**One session setup** (fe#172). Both hosts start each reader document's session
with `startReaderSession` (`reader-session.ts`): the channel, the `READER_START_MS`
timeout, and where each message goes (`ready` runs the host's own `onReady`, sends
what waited, then tells the read-along side; `csp` is logged; `seek`, `following`
and `readalong` go to the read-along side; the rest to the host's own handlers).
A host keeps only what is its own: the web's reopen of a reloaded frame and its
fetch, the app's chunked transfer, crash reloads and the last place. A new message
type goes through the session, never into one host.

**The bytes and the place together** (fe#164). Both hosts start the EPUB's fetch
(or its local read) as soon as they mount, while the screen still looks the place
up, and hand the book over only once `placeKnown` is true (`usePlaceGate`), so the
open is never the fetch after the lookup. In the app, the offline lookup's "EPUB on
this device" counts the cache file only as it was when the screen mounted its host
(`cachedBefore`): a copy this screen fetched meanwhile never opens a guessed start.

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
  empty, else `book-<size>.epub` when it is there and not empty, else a fetch. The
  other way round too: a book download copies the cache file for the
  current `ebook.size` into the download (`cachedEbookUri`, then `engine.copyFile`)
  instead of fetching the EPUB again, and fetches only when there is none. A new
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
Contents (a `Sheet` of the TOC: the current entry, the first named as the section on
screen, is bold on a muted row with `aria-current="location"`, and the list opens
scrolled to it) and the text size
steps (A-/A+, `FONT_SCALES` 0.8 to 1.8). The page edges (`PageEdges`) are 44 px
tap targets over the margins, narrowed to 24 px when the reader's **measured** width
is under `TABLET_MIN_WIDTH` (`narrowPageEdges`; before it is measured, the phone
layout), so they stay clear of the text a tap lands on (fe#165): the companion's
420 px column on a desktop gets the narrow edges too. A spinner shows only when a section takes over 300 ms to lay out.
The reader document's viewport is `maximum-scale=1, user-scalable=no`,
so focusing an input inside an EPUB doesn't leave the iOS WebView zoomed.

Failures are plain notices (`reader.failure.*`): `drm`, `unreadable`, `missing`
(a 404 for the book or the ebook), `fetch` (no answer, or the place couldn't be
looked up), `start`, and `section` (a part of the open book failed to
load: the reader document reports an `error` with code `section` once the book
shows) get Try again where it can help (`fetch`, `start`, `section`: `RETRYABLE`);
`noEbook` covers a link to a book without one. A `401` (`isSignedOutError`) is
`signedOut`: while the connection needs signing in again
(`useSignedOutConnection`) the screen shows `SignInAgainState` with Reconnect in place
of the notice (a `fetch` failure too), never a Try again that can't work.

**A save the server refused**: `saveReadingPlace` drops a `4xx` and
tells `onReadingRefused`, and the open reader shows a "place wasn't saved" card at
the page's foot (`NotSavedCard`, stacked with the Jump offer) until a save of the
book goes through. OK puts it away; with the sign-in ended it carries the compact
sign-in row with Reconnect instead.

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
are debounced) and at once on close or when the app goes to the background. The
first `progress` after `opened` is where the book landed (the start of the page the
saved place falls on), so it is not saved (`landing`): saving it would
pull a place read at another page size back to this page's start. The first move
saves.

**`base_version`** is what it adds, the client half of
[Sync v2's rule](../server/api/reference.md#the-conflict-rule-sync-v2): every save
carries the last server `version` this device **acknowledged** (0 only when no row
was ever seen).

- An answer that kept **this save** (this device's id, the same cfi and time) is
  acknowledged at once, and so is this device's own row at a version it had
  acknowledged (a stale save's echo; its version is left alone). The answer's `seen`
  flag says so.
- An answer that kept **a place this device never saw** (another device's, or its own
  from before its places here were cleared: the device id survives sign-out) is
  acknowledged only once the open reader has shown it (`adoptServerPlace`): Jump, Stay, or the reader already being
  there. Until then this device's saves stay diverged, so a further place it never
  saw is never moved back; after Stay its next save applies, which is how moving back
  on purpose works.
- **The offer** (`jumpOffer`, judged against the page on screen): when a save's
  answer kept a row this device never saw whose place differs from the current one, a
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
the current `ebook.size`; on the web, only a download, and only when its
Cache API copy is still there, `engine.fileExists`, since the browser can evict it), it
opens at the start of the book. A request that **timed out** (`TimeoutError`) counts
as no answer only when the reachability check has found the server down too (from
2.5.0, `isReachable` false): a slow server is up and may hold a place further on, so
then the lookup fails (the `fetch` notice) rather than opening at the start. Its saves carry `base_version: 0` ("saw nothing"), which the server's
`ResolvePlace` takes as diverged from any row, this device's own included (signed out
and back in, its places here cleared), so it keeps the further place, and the answer to the first save that reaches the server (the queue's
replay while the reader is open, or a save on the next online open) offers Jump there.

## Read-along: following the narration

A Bridge's [`readalong.align` job](../bridge/readalong.md) lines a book's ebook up
with its narration and writes `.audiosilo/readalong.json`; the server serves it at
[`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong)
and says on `/item` whether it is `ready` or `stale` (`Book.readalong`). With a
ready map the reader follows the narration: it shows the page of the sentence
being read, highlights it, turns the page as the narration moves on, and a tapped
sentence moves the narration to its start. Two surfaces use it: the companion's
[Text tab](player-ui.md#the-text-tab-read-along) and the full-screen reader's
**Follow narration** ([below](#follow-narration-in-the-full-screen-reader)). The
admin's Make read-along offer lives in the Text tab. The listener's view is on
[Reading the ebook](/users/listening/reading-the-ebook#follow-the-narration) and
[The companion](/users/listening/companion#text).

### Who sees it

`readalong-gating.ts`, pure and tested:

- **`readalongReady(readalong, book, readable)`**: the server serves maps
  (capability `readalong`), the book's `readalong.state` is `ready` with its
  `generated_at`, and the book reads (`canRead`, which needs its ebook). A stale or
  absent map is invisible to a listener. A surface still waits for the reader to
  say the map's spans name this book (`readalong {state: 'ok'}`) before it shows
  anything that follows.
- **`mayMakeReadalong(user, server)`**: an admin (never a household member, a kid's
  or a demo account, whatever its role says; `isBridgeAdmin`), on a server with
  `bridge` and `readalong`, whose Bridge lists `readalong` in
  `ServerInfo.bridge.features`. An older server has neither flag: never.

### The map

`client.readalong(libraryId, path)` fetches the map by the **book's** path with the
`Authorization` header only (the route takes no `?token=`), with a 60 s timeout
(up to 16 MiB of JSON, and the server may hash the ebook first). `parseReadalongMap`
checks it: the head must say `audiosilo-readalong/v1` with a `sections` array (else
a `ReadalongMapError`); the server checks only the head, so **every span** is checked
here, field by field: a `cfi` that starts `epubcfi(`, ends `)` and is at most 1024 UTF-8
bytes, finite times with `0 <= start <= end`. A bad span is dropped and counted
(`dropped`), never the map; `gaps` and `audio_gaps` are not kept. The reader document
is sent only the sections' hrefs and spans (`readerMapOf`), nothing of the head.

`useBookReadalong(ref, book, readable, enabled?)` picks where the map comes from
(`readalongSource`): the download's copy (`readalong.json`, see
[Offline](offline.md#the-read-along-map-in-downloads)) while the server's book names
that map or none (a list row, or offline with the capability unknown), else the
server's (`useReadalong`, keyed by the map's `generated_at`, no retry); never a
stale map, copy or not, and a copy that can't be read falls back to the server's.
Only a map with a sentence (`hasSpans`) reaches the reader. It returns:

| Field | Meaning |
|---|---|
| `map` | the sections and spans to send, or null: none to follow |
| `pending` | still reading it |
| `failed` | the read failed for a reason that says nothing about the map (offline, a 5xx, a timeout, a copy that won't read): never "no read-along". Only the server's 404 `no_readalong` and 409 `readalong_stale`, or the flag off (a `CapabilityError`), mean none (`readalongNone`) |
| `retry` | read it again |

While another copy of the map shown is on its way (the download took it, the map was
made again), the one shown stays: a reader that has a map never loses it in between.

### The read-along messages

The reader's side of the protocol, in `protocol.ts` and `reader/src/reader.js`,
checked field by field both ways:

| Direction | Message | Meaning |
|---|---|---|
| host -> reader | `readalong {map}` | the map's sections and spans (`{sections: [{href, spans: [{cfi, start, end}]}]}`, times in whole-book seconds), or `null`: none, stop following. A document that never had a map is sent nothing |
| host -> reader (app) | `readalong {length, chunks}` then `readalongChunk {seq, data}` | a map over 256 KB of JSON, as pieces of its text (`readalongMessages`, never cutting a surrogate pair); the reader's `createTextAssembly` refuses any wrong piece, and a wrong map is `none` |
| host -> reader | `position {t, rate, playing}` | the narration's whole-book place, speed and whether it plays: once a second (`POSITION_MS`) while a map is in, and at once on a play, pause, seek or speed change |
| host -> reader | `follow` | turn to the sentence being read and keep following (Back to narration, Follow narration) |
| reader -> host | `seek {t}` | a sentence was tapped: move the narration to its start (`seekBook`, which keeps the play state; `t` at most a week, checked) |
| reader -> host | `following {value}` | the reader follows the narration, or stopped because the listener turned away |
| reader -> host | `readalong {state, unresolved}` | `ok` once a span names a section of this book, else `none`; `unresolved` counts the spans skipped (sent once) |

**The host API** (`useReaderReadalong`, shared by both hosts): the props
`readalongMap` (memoised: a new identity is sent again), `readalongPosition()`
(read every second while a map is in, and on the handle's `syncPosition()`),
`followNarration` (follow as soon as the map is in), `onSeek`, `onFollowing` and
`onReadalongState`; the handle's `follow()` sends `follow`. Each `ready` (a reloaded
document too) gets the map, then the place, then `follow` when the last document
last said it followed (else `followNarration`).

**The narration** (`useNarration(target, host)`, `narration.ts`): the reader
follows only while the player's placed book is this book (`selectPlacedBookKey`);
`readalongPosition()` reads its whole-book place, speed and playing state, and the
host is told at once (`syncPosition()`) on play, pause, a speed change or a jump
(`narrationMoved`: more than `NARRATION_JUMP_S`, 1.5 s, from where the clock would
be). A tapped sentence's `seek` is the store's `seekBook`, only while placed: a tap
in another book's text plays nothing.

### The core (`reader/src/readalong.js`)

Ported from the read-along spike's `readalong-core.js`, tested under `node:test`
(`reader/test/readalong.test.mjs`; `readalong-cfi.test.mjs` resolves the Bridge's
Alice map and EPUB, byte copies of audiosilo-bridge testdata in
`reader/test/fixtures`, through the vendored `epubcfi.js` on jsdom).

- **Indexing**: only once the book shows its first place (`attach` after `opened`:
  a follow's `goTo` racing the opening one would supersede it). Spans sort by time
  (`indexMap`); a span's section is the CFI's `/6/N` step against the sections' own
  CFIs, else `view.resolveCFI`. Ranges resolve lazily per section; a CFI that names
  nothing is skipped, never breaking the loop.
- **The clock**: a 50 ms tick reads `PositionClock` (the host's one-a-second
  samples, moved on at the speed while playing, never more than 3 s past the last)
  and finds the sentence by binary search (`spanAt`, held 2 s across a short gap).
  The highlight is foliate's annotation drawn with `Overlayer.highlight`. A sentence
  running over the page end turns the page once the narration passes the share of
  it shown.
- **A tap** finds its sentence by CFI order (`findInOrder` on the caret's CFI),
  seeks to its start and follows; for 2.5 s (`SEEK_GRACE_MS`) samples more than
  1.5 s from the tapped sentence are ignored, so a late sample doesn't pull the page
  back.
- **Turning away**: a person's move (page, scroll, snap, navigation; never a
  relayout, nor one that stays on the page shown) that takes the sentence off the
  page stops following (`following {value: false}`), and one back onto it follows
  again. A seek in the player (a sample 3 s or more, `JUMP`, from where the clock
  would be) follows again, but only once the reader has followed at least once, so
  the full-screen reader is never grabbed by every seek.
- **One move at a time** (`inTurn`): the tick's, `follow`'s and the host's page
  turns wait for each other, each given up after `MOVE_MS` (10 s), since foliate
  never settles a `goTo` whose view a later one replaced.

### Follow narration in the full-screen reader

`ReaderScreen` asks for the map (`useBookReadalong(..., narration.narrating)`) and
sends it **only while its book is the one the player holds**: another book playing
has nothing to follow here. It never sets `followNarration`: once the reader said
`ok`, a pill at the page's foot (`FollowPill`, `readalong-follow`, stacked with the
Jump offer and the not-saved card) says **Follow narration**; pressing it calls
`follow()`. Once the listener turns a page away it says **Back to narration**.

**No reading-place save while following.** The narration turns the pages, not the
reader, so `onFollowing(true)` drops the save timer and any pending save; leaving
following (`onFollowing(false)`) schedules the usual debounced save of the page on screen
(`atNow`, the latest `progress`), and every move after saves as usual. A map that
goes away, or Try again (a new host, which has followed nothing), ends following
too. The companion's Text tab never saves a reading place at all
([Player UI](player-ui.md#the-text-tab-read-along)).

## Still to come

Known follow-ups: a generic save queue shared with progress sync; from 3b-2, a
clearer notice for a book over the 512 MB limit or an allocation failure, checking a
downloaded `book.epub`'s size, a cap on the cache's size, a disk-full notice and
pinch zoom; from 3c-2, comparing a kept read-along map with the download's own
EPUB (its sha256), and Try again for a signed-out or missing book in the Text tab.
