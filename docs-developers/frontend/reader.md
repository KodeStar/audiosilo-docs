---
title: The ebook reader
description: "The player's EPUB reader (src/reader/, the /read route): the reader document built from vendored foliate-js in a web and an app variant, the sandboxed web host, the apps' WebView host and its chunked transfer, the EPUB cache and the EPUB in downloads, the message protocol, the reading-place queue with Sync v2's base_version, the Jump there offer and Read on the book page; read-along: the map, its messages both ways, following the narration and the full-screen reader's Follow narration."
---

A book whose folder holds its EPUB gets **Read the ebook** on its page. The reader
opens the EPUB paginated, remembers the place per user across devices, and runs no
script from the book anywhere.

- **On the web** it runs in an iframe host.
- **In the apps** it runs in a WebView that the host feeds the book in chunks. The
  apps also keep a per-book EPUB cache.
- **Downloads** include the EPUB, so a downloaded book reads offline on every
  platform.
- **[Read-along](#read-along-following-the-narration)**: with a book's read-along
  map, the reader follows the narration sentence by sentence, in the companion's
  Text tab and in the full-screen reader.

The server side is capability `ebooks`:

- a book's [`ebook`](../server/api/reference.md#get-apiv1librariesidbooks) field;
- its bytes at [`GET /libraries/{id}/ebook`](../server/api/reference.md#get-apiv1librariesidebook);
- the place at [`/libraries/{id}/reading-progress`](../server/api/reference.md#get-apiv1librariesidreading-progress);
- the reader document at [`/web/reader.html`](../server/web-ui.md#the-reader-document-readercsp).

The listener's view is on [Reading the ebook](/users/listening/reading-the-ebook).

| Piece | Where |
|---|---|
| The reader document's source, and foliate-js vendored unmodified | `reader/src/` (`reader.js`, `epub-open.js`, `reader.html`, `reader.css`), `reader/vendor/foliate-js` + `FOLIATE_PIN.txt` |
| Its build | `scripts/build-reader.mjs` writes `public/reader.html` (web) and `src/reader/reader-html.native.ts` (the app's variant, a string module); `npm run reader:build`, `reader:check` in `npm test` |
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

The reader is its **own document**, never part of the app. foliate-js parses an
EPUB nobody vetted, so it runs in a page whose policy lets nothing out.

`scripts/build-reader.mjs` bundles `reader/src/` with the vendored foliate-js into
`public/reader.html`: **one** inline script and an inline style, with no
subresources. The bundle is esbuild, one IIFE, es2022. It holds only the View, EPUB,
overlayer and CFI modules, and zip.js without workers. PDF, MOBI, FB2, comics, TTS
and search are excluded.

The same build writes the app's variant, `src/reader/reader-html.native.ts`. It is
generated, prettier- and eslint-ignored, and has the same CSP. The two differ only
by esbuild's `__NATIVE__` define. The app's variant takes its book in chunks over
the WebView bridge and talks through `window.ReactNativeWebView`.

The page carries the whole policy as a meta CSP with the script's sha256
(`connect-src 'none'`). The server sends the same policy as a header, hashing the
served script itself, plus `frame-ancestors 'self'`, which a meta tag can't set.
Expo's web export copies `public/reader.html` to `dist/reader.html`, which the
server serves as `/web/reader.html`.

- **Generated and committed.** `npm test` runs `reader:check` (a rebuild compared
  byte for byte), so a change under `reader/` without a rebuild fails the gate.
- **foliate stays unmodified.** `FOLIATE_PIN.txt` holds the upstream commit and
  each vendored file's sha256; the build refuses an edited copy.
- **Polyfills first.** `reader/src/polyfills.js` defines `Object.groupBy` and
  `Map.groupBy` where the engine lacks them. foliate's EPUB parser calls both on
  every open, and they came only with Safari 17.4 and Chrome 117. The app's iOS floor
  is 16.4.
- **The route is `/read`, never `/reader`.** The static export would write a
  `reader` route to `dist/reader.html`, over the reader document, and the server
  answers every path naming `/web/reader` with the document.
- **The service worker** (`public/sw.js`) never answers `/web/reader.html` with
  the app shell, because that would boot the whole app inside the reader's frame.
  Its navigation fallback skips the reader document.
- **EPUB scripts never run**, three layers deep:
  1. The loader never loads a script file and removes `<meta http-equiv=refresh>`
     (`book.transformTarget`).
  2. The document's CSP, which foliate's `blob:` section frames inherit, admits only
     the reader's own script by hash.
  3. The iframe's sandbox has no popups, forms, modals or top navigation.

  A blocked load comes back to the host as a `csp` message, and the host logs it.
- **What it does**:
  - paginated layout (foliate's paginator, lines at most 720 px wide);
  - page turns by the host's `next` and `prev`, by its own keys (arrows follow the
    book's direction, plus Page Up and Page Down) and by touch swipes;
  - a section-loading signal for the spinner;
  - the flattened contents;
  - the theme (the app's scheme and card colours) and a text scale.

  A DRM-encrypted book (`META-INF/rights.xml`, or an `encryption.xml` encrypting
  more than fonts) or a file that isn't an EPUB is a typed `error` (`drm`,
  `unreadable`) that the screen shows.

## The web host

`ReaderHost` (`reader-host.web.tsx`) renders the document in an iframe:

```html
<iframe src="/web/reader.html" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer">
```

The frame is same-origin, because foliate can't run in an opaque origin, but
sandboxed.

The host fetches the EPUB itself with `client.ebook(libraryId, path)`. It asks by
the **book's** path, with the `Authorization` header and never `?token=`. It reads
the answer piece by piece into one buffer, with a timeout that restarts on every
piece, so a slow, large ebook arrives and only a stalled download fails. It posts
the bytes in `open` as a **transferable**. The reader never sees a token or an API
URL, and foliate never runs in the `/web` document, whose CSP is unchanged.

A frame that never says `ready` within `READER_START_MS` (30 s) is a
`ReaderStartError`. Causes include a proxy that refuses the frame or its script, or
a browser that can't run it. The screen shows "The reader didn't start" with Try
again, never an endless spinner. A `ready` after an `open` was delivered means the
frame reloaded and the transferred bytes went with it, so the host fetches the book
again.

A downloaded book (`manifest.ebookUri`) is read from the download whenever it is
there, through the web engine's `readFile` straight from the media cache. It fetches
nothing, so it opens offline.

### The protocol

On the web, messages go both ways by `postMessage` on the page's own origin only. In
the app they are JSON strings over the WebView's bridge (see
[The app host](#the-app-host)). Host messages wait in the channel
(`createHostChannel`) until the reader says `ready`.

| Direction | Messages |
|---|---|
| host -> reader | `open {book (ArrayBuffer), name, at?: {cfi?, fraction?}, theme, fontScale}` (web) or `open {size, chunks, name, at?, theme, fontScale}` then `chunk {seq, data (base64)}` for `seq` 0 to `chunks - 1` (app), `goto {href \| cfi \| fraction}`, `appearance {theme, fontScale}`, `next`, `prev`; read-along: `readalong {map}`, `position {t, rate, playing}`, `follow` (see [The read-along messages](#the-read-along-messages)) |
| reader -> host | `ready`, `opened {title, toc: [{label, href, depth}], rtl}`, `progress {cfi, fraction, sectionLabel}`, `loading {value}`, `error {code: drm \| unreadable \| section \| runtime, message}`, `escape`, `csp {directive, blocked}`; read-along: `seek {t}`, `following {value}`, `readalong {state, unresolved}` |

The reader's messages describe a book nobody vetted. So `acceptReaderMessage` takes
a message only from **that frame's** `contentWindow` on our own origin, and
`parseReaderMessage` checks it field by field (types, the CFI's length, text and
TOC sizes). Anything else is dropped. `escape` exists because a key pressed in the
book stays in the frame. The reader turns pages itself and sends Escape back so the
screen can close.

**One session setup.** Both hosts start each reader document's session with
`startReaderSession` (`reader-session.ts`). It owns the channel, the
`READER_START_MS` timeout, and where each message goes:

- `ready` runs the host's own `onReady`, sends what waited, then tells the
  read-along side.
- `csp` is logged.
- `seek`, `following` and `readalong` go to the read-along side.
- The rest go to the host's own handlers.

A host keeps only what is its own: the web's reopen of a reloaded frame and its
fetch, the app's chunked transfer, crash reloads and the last place. A new message
type goes through the session, never into one host.

**The bytes and the place together.** Both hosts start the EPUB's fetch (or its
local read) as soon as they mount, while the screen still looks the place up. They
hand the book over only once `placeKnown` is true (`usePlaceGate`), so the open
never waits for a fetch that starts after the lookup.

In the app, the offline lookup's "EPUB on this device" counts the cache file only
while this screen's host did not fetch it. `localEbook` calls `onFetch` as a fetch
starts, before any file of it exists, and the host passes it on
(`ReaderHostProps.onFetch`). So a copy this screen fetched never opens a guessed
start, and a copy that was there is asked about as it is.

## The app host

`ReaderHost` (`reader-host.native.tsx`) renders the app's variant in a
react-native-webview `WebView`. The package is an exact pin, bumped only with
`npx expo install` and a device run of the reader on both platforms.

- **The document is an HTML source**: `source={{html: READER_HTML, baseUrl:
  'https://reader.audiosilo.invalid/'}}`. The base URL gives the document an origin.
  Without one, Android's foliate makes `blob:null` section URLs and the renderer
  dies. `.invalid` is reserved, so nothing can ever answer there, and the CSP
  refuses every load anyway (`connect-src 'none'`, as on the web).
- **No file access at all**: `allowFileAccess`, `allowFileAccessFromFileURLs` and
  `allowUniversalAccessFromFileURLs` are all false, with `domStorageEnabled` and
  `cacheEnabled` off, `setSupportMultipleWindows={false}` and
  `javaScriptCanOpenWindowsAutomatically={false}`. The WebView reads no file of the
  app's and makes no request.
- **Navigation**: `originWhitelist={['*']}` with `onShouldStartLoadWithRequest`
  (`allowNavigation`). The handler admits only the base URL, `about:blank` and
  `blob:` URLs of the document's own origin (foliate's section frames). A whitelist
  miss would hand the URL to the system (`Linking.openURL`), so the whitelist admits
  everything and the handler refuses.
- **Messages**: on Android the bridge object is injected into every frame, the
  book's too. So the host parses every message field by field (`readNativeMessage`,
  then `parseReaderMessage`). The reader takes only string events with
  `source === null` (the WebView's own).

**The book in chunks.** The host finds the EPUB as a local file (`localEbook`,
started at mount while the WebView loads). At each `ready` it posts
`open {size, chunks, ...}` and then the file in **256 KB base64 chunks**
(`CHUNK_BYTES`, `sendInChunks`). Each piece is read and encoded natively
(`readAsStringAsync` with `position` and `length`), never in JS. The host reads a
piece only once the last one was posted, so it holds one piece's base64 at a time.

The chunk size was measured. On a 25 MB book, 256 KB pieces open as fast as 1 and
2 MB ones, at the lowest peak memory (about a plain file load's).

The reader (`reader/src/chunks.js`, `createAssembly`) allocates one buffer of the
announced size. It refuses the following as `unreadable`:

- a size over 512 MB (`MAX_BOOK_BYTES`) or a bad chunk count;
- a chunk out of order, repeated or extra;
- data that isn't base64;
- a book larger or smaller than announced.

Then it opens the buffer as the web reader opens its `ArrayBuffer`. A newer `ready`
(the document reloaded) stops the running transfer and starts again.

**Why not a `file://` load.** The plan was to load the reader document from a file
beside the EPUB and let it read the book by URL, with no base64 over the bridge. A
proof on an iOS 26.5 simulator and an Android emulator ruled it out. On both engines
the page can read a local file only with `allowFileAccessFromFileURLs` on, and
neither engine's CSP can name one file or one directory, only `connect-src file:`.
With that setup, a script in the page read a file in a sibling directory and one in
the app's documents directory on both platforms. On Android it could read the whole
private data directory. Chunks over the bridge keep `connect-src 'none'` and every
file access flag off, need no server change, and work offline.

**Process death.** The WebView's content process can die (iOS,
`onContentProcessDidTerminate`), or its renderer can go (Android,
`onRenderProcessGone`). The host then ends that WebView's session at once and makes
a new one that reopens at the last `progress` place. It does this `MAX_RELOADS` (3)
times in a row, then shows `ReaderStartError`.

- A death `STABLE_MS` (60 s) or more after that WebView's `opened` resets the count.
  That is the system reclaiming a book that had stayed open.
- A death while the app is in the background makes the new WebView only once the
  app is back (`whenActive`). Made in the background, it may get no running process,
  and its start timeout would run out.
- The host tells the screen about each new document (`onReopen`; the web host does
  too when its frame reloads). That clears `opened`, so the edges, toolbar and offer
  wait for the next `opened`.
- Once the book has shown, a later `drm` or `unreadable` is reported as `start`,
  because the same file opened before. Try again reopens where the reader was
  (`resumeAt`). In the app the `start` notice's body is
  `reader.failure.start.bodyNative` (memory, not a browser).

### The EPUB cache

`localEbook` in `ebook-file.native.ts` fetches a book that isn't downloaded with its
EPUB into the reader's cache. The cache has one folder per **connection, library
and book** under the app's cache directory
(`<Paths.cache>/reader/<connectionId>/<libraryId>/<pathSlug(rel_path)>/`). The
folder holds `book-<size>.epub`, **named by the server's `ebook.size`** it was
fetched for.

The fetch is `api.ebookRequest` with the Authorization header, because the route
takes no `?token=`. It runs through `File.createDownloadTask`. On iOS that is a
foreground session, which fails at once offline instead of waiting days for a
connection. The fetch writes a numbered `.part` file and moves it over the cache file
only when complete, so a cut-short download never reads as the book. A server status
becomes an `ApiError` (a 404 is the screen's `missing`).

- **The rule**: the download's copy (`manifest.ebookUri`) when it is there and not
  empty, else `book-<size>.epub` when it is there and not empty, else a fetch.
- **The other way round too**: a book download copies the cache file for the
  current `ebook.size` into the download (`cachedEbookUri`, then `engine.copyFile`)
  instead of fetching the EPUB again. It fetches only when there is none.
- **A new `ebook.size`** (a scan saw the ebook change) misses the cache.
  `localEbook` fetches it again and drops the folder's other files (an older size, a dead fetch's
  part).
- **Dropped with its connection**: `clearEbookCache(connectionId)` deletes the
  connection's folder. `reading-progress.ts`'s `onConnectionRemoved` calls it when
  the listener removes the connection or signs out of it. The system may also clear
  the cache directory any time, and the next open fetches again. On the web
  `clearEbookCache` is a no-op (`ebook-file.ts`), because the web host fetches each
  time or reads the download.

## The screen

`ReaderScreen` (`/read?connection=&libraryId=&path=`) is a root modal like the
player. On the web its root is `role="dialog"`, `aria-modal`, `data-layer="reader"`,
so the player's global shortcuts stand back. Its own Escape and bare arrows use
`useGlobalShortcut(..., 'reader')`. With Cmd, Ctrl or Alt held they are the
browser's. A right-to-left book (`opened.rtl`) turns forward from the left edge and
ArrowLeft.

The top bar holds:

- close;
- the title;
- the section label and percentage;
- Contents, a `Sheet` of the TOC. The current entry is the first one named as the
  section on screen. It is bold on a muted row with `aria-current="location"`, and
  the list opens scrolled to it.
- the text size steps (A- and A+, `FONT_SCALES` 0.8 to 1.8).

The page edges (`PageEdges`) are 44 px tap targets over the margins. They narrow to
24 px when the reader's **measured** width is under `TABLET_MIN_WIDTH`
(`narrowPageEdges`), so they stay clear of the text a tap lands on. Before the width
is measured, the phone layout applies. The companion's 420 px column on a desktop
gets the narrow edges too.

A spinner shows only when a section takes over 300 ms to lay out. The reader
document's viewport is `maximum-scale=1, user-scalable=no`, so focusing an input
inside an EPUB doesn't leave the iOS WebView zoomed.

Failures are plain notices (`reader.failure.*`):

| Failure | Meaning | Try again |
|---|---|---|
| `drm` | a DRM-encrypted book | no |
| `unreadable` | a file that isn't an EPUB, or a transfer the reader refused | no |
| `missing` | a 404 for the book or the ebook | no |
| `fetch` | no answer, or the place couldn't be looked up | yes |
| `start` | the reader didn't start | yes |
| `section` | a part of the open book failed to load (the reader document reports an `error` with code `section` once the book shows) | yes |
| `noEbook` | a link to a book without one | no |

The three that get Try again are `RETRYABLE`. A `401` (`isSignedOutError`) is
`signedOut`. While the connection needs signing in again (`useSignedOutConnection`),
the screen shows `SignInAgainState` with Reconnect in place of the notice, a `fetch`
failure's included. It never offers a Try again that can't work.

**A save the server refused.** `saveReadingPlace` drops a `4xx` and tells
`onReadingRefused`. The open reader then shows a "place wasn't saved" card at the
page's foot (`NotSavedCard`, stacked with the Jump offer) until a save of the book
goes through. OK puts it away. With the sign-in ended, the card carries the compact
sign-in row with Reconnect instead.

### Read on the book page

`canRead(ebooks, book, downloadedEbook)` needs the book's `ebook` field and the
capability `ebooks` on every platform. The capability must be `true`, or still
unknown (offline) when the book's finished download holds the EPUB
(`manifest.ebookUri`). A server that says `false` never offers it, downloaded or
not. The reader screen applies the same rule.

The hero shows an outline **Read the ebook** button after the download (its own row
on a phone). It pushes `readerHref(connectionId, libraryId, book.rel_path)`.

## The reading place

`reading-progress.ts` follows the pattern of
[Progress sync](state-and-data.md#progress-sync-srcplaybackprogress-syncts) for the
listening place. It is separate from listening progress on purpose. It has:

- **an offline queue** that keeps the **latest** save per
  `(connection, library, book path)`. `flushReadingQueue` replays it through each
  save's own connection, when the reader mounts and after any save that reaches the
  server. While the connection is marked unreachable, saves go straight to the
  queue.
- **a durable mirror.** `audiosilo.readingMirror` and `audiosilo.readingQueue` are
  scoped storage keys. They are in `ID_DOCUMENTS` for the identity migration and
  are dropped with their connection.
- **a 4xx dropped**, because it can never succeed.

The screen saves two seconds after the reader rests on a page (`progress` messages
are debounced), and at once on close or when the app goes to the background. The
first `progress` after `opened` is where the book landed: the start of the page the
saved place falls on. The screen does not save it (`landing`), because saving it
would pull a place read at another page size back to this page's start. The first
move saves.

### `base_version` and the Jump offer

**`base_version`** is what the reading place adds to that pattern. It is the client
half of [Sync v2's rule](../server/api/reference.md#the-conflict-rule-sync-v2).
Every save carries the last server `version` this device **acknowledged**. It is 0
only when no row was ever seen.

- **An answer that kept this save** (this device's id, the same cfi and time) is
  acknowledged at once. So is this device's own row at a version it had
  acknowledged, which is a stale save's echo; its version is left alone. The
  answer's `seen` flag says so.
- **An answer that kept a place this device never saw** is acknowledged only once
  the open reader has shown it (`adoptServerPlace`): Jump, Stay, or the reader
  already being there. That place can be another device's, or this device's own from
  before its places here were cleared, because the device id survives sign-out.
  Until then this device's saves stay diverged, so a further place it never saw is
  never moved back. After Stay its next save applies, which is how moving back on
  purpose works.
- **The offer** (`jumpOffer`) is judged against the page on screen. When a save's
  answer kept a row this device never saw, whose place differs from the current one,
  a non-blocking card says `On {device} you were at {percent}%. Jump there?` with
  Jump (`goto {cfi}`) and Stay. `device_name` is the server's; when it is empty the
  card says "On another device". The reader does not read `other_place`.

### Where it opens

`lookupReadingPlace` and `readingPlaceQuery` pick the newest of:

- the server's row;
- this device's mirror;
- this device's queued save.

They pick the queued save when the server will keep it (diverged and further on).
With no answer from the server, the lookup falls back to this device's places. With
none of those either, it fails (the `fetch` notice; Try again looks again). It never
opens at a guessed start whose save could replace a place read elsewhere. A 401
always fails it.

The query runs whatever the browser's online flag says (`networkMode: 'always'`).
So an offline reader opens at a local place, or says it can't, instead of waiting on
a spinner. Opening at the server's row adopts its version.

**A book whose EPUB is on this device, opened offline with no local place**, is the
one exception to "never a guessed start". It opens at the start of the book when
both of these hold:

- The lookup's request got no answer from the server. Any answer, an error status
  included, still fails the lookup, and so does having no client for the connection.
- `hasLocalEbook` finds the EPUB. In the app that is the download's copy or the
  cache file for the current `ebook.size`. On the web it is only a download, and
  only when its Cache API copy is still there (`engine.fileExists`), since the
  browser can evict it.

A request that **timed out** (`TimeoutError`) counts as no answer only when the
reachability check has found the server down too (`isReachable` false). A slow
server is up and may hold a place further on, so then the lookup fails (the `fetch`
notice) rather than opening at the start.

Saves from that start carry `base_version: 0` ("saw nothing"). The server's
`ResolvePlace` takes that as diverged from any row, this device's own included (after
a sign-out and back in, its places here are cleared). So the server keeps the
further place. The answer to the first save that reaches the server offers Jump
there. That save is the queue's replay while the reader is open, or a save on the
next online open.

## Read-along: following the narration

A Bridge's [`readalong.align` job](../bridge/readalong.md) lines a book's ebook up
with its narration and writes `.audiosilo/readalong.json`. The server serves it at
[`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong)
and says on `/item` whether it is `ready` or `stale` (`Book.readalong`).

With a ready map the reader follows the narration:

- it shows the page of the sentence being read and highlights it;
- it turns the page as the narration moves on;
- a tapped sentence moves the narration to its start.

Two surfaces use it: the companion's [Text tab](player-ui.md#the-text-tab-read-along)
and the full-screen reader's **Follow narration** (see
[Follow narration in the full-screen reader](#follow-narration-in-the-full-screen-reader)).
The admin's Make read-along offer lives in the Text tab. The listener's view is on
[Reading the ebook](/users/listening/reading-the-ebook#follow-the-narration) and
[The companion](/users/listening/companion#text).

### Who sees it

`readalong-gating.ts`, pure and tested:

- **`readalongReady(readalong, book, readable)`** needs three things:
  - the server serves maps (capability `readalong`);
  - the book's `readalong.state` is `ready` with its `generated_at`;
  - the book reads (`canRead`, which needs its ebook).

  A stale or absent map is invisible to a listener. A surface still waits for the
  reader to say the map's spans name this book (`readalong {state: 'ok'}`) before it
  shows anything that follows.
- **`mayMakeReadalong(user, server)`** needs an admin (`isBridgeAdmin`). A household
  member, a kid's or a demo account never qualifies, whatever its role says. The
  server must have `bridge` and `readalong`, and its Bridge must list `readalong` in
  `ServerInfo.bridge.features`. An older server has neither flag, so the answer is
  never.

### The map

`client.readalong(libraryId, path)` fetches the map by the **book's** path with the
`Authorization` header only, because the route takes no `?token=`.

- **On the web** its 60 s timeout covers the answer, since the server may hash the
  ebook first. The timeout then restarts with every piece of the map as it arrives
  (up to 16 MiB of JSON), so only a stalled map fails, however slow the link.
- **In the app** the fetch hands over no body stream, so the whole answer gets three
  minutes.

`parseReadalongMap` checks the map. The head must say `audiosilo-readalong/v1` with
a `sections` array, or the parser throws a `ReadalongMapError`. The server checks
only the head, so the parser checks **every span** here, field by field:

- a `cfi` that starts `epubcfi(`, ends `)` and is at most 1024 UTF-8 bytes;
- finite times with `0 <= start <= end`.

A bad span is dropped and counted (`dropped`), never the map. `gaps` and
`audio_gaps` are not kept. The reader document is sent only the sections' hrefs and
spans (`readerMapOf`), nothing of the head.

`useBookReadalong(ref, book, readable, enabled?)` picks where the map comes from
(`readalongSource`):

- **The download's copy** (`readalong.json`, see
  [Offline](offline.md#the-read-along-map-in-downloads)), while the server's book
  names that map or none. It names none in a list row, or offline with the
  capability unknown.
- **Otherwise the server's** (`useReadalong`, keyed by the map's `generated_at`, no
  retry). A copy that can't be read also falls back to the server's.
- **Never a stale map**, copy or not.

Only a map with a sentence (`hasSpans`) reaches the reader. It returns:

| Field | Meaning |
|---|---|
| `map` | the sections and spans to send, or null: none to follow |
| `pending` | still reading it |
| `failure` | why there is no map when its read failed (`ReadalongFailure`), else null. It never means "no read-along" (see the failure reasons below the table) |
| `offline` | the server's map waits for the connection with no copy on the device, or its read failed with no network on the device (`offlineState`). It is neither pending nor failed, so a surface shows nothing (no spinner, no Make), and a map already shown stays meanwhile |
| `retry` | read it again (offered only when `failure` is `retry`) |

Only the server's 404 `no_readalong` and 409 `readalong_stale`, or the flag off (a
`CapabilityError`), mean there is none (`readalongNone`). The `failure` reasons are:

| Reason | Cause |
|---|---|
| `retry` | a reason that says nothing about the map: offline, a 5xx, a timeout, a copy that won't read |
| `signedOut` | a 401, and any failure while the connection needs signing in again |
| `denied` | a 403 |
| `missing` | a 404 without the read-along's own code |
| `ebookChanged` | the server's map was made from another ebook than the downloaded one (see the next paragraphs) |

Only `retry` offers Try again, and none offers Make.

While another copy of the map shown is on its way (the download took it, or the map
was made again), the one shown stays. A reader that has a map never loses it in
between.

**A downloaded EPUB is the book its reader shows**, so a server map made from
another ebook is never paired with it. The download keeps the sha256 of the ebook
its map was made from (`ebookSha256`, `useDownloadedEbookSha`), and a server map
whose `ebook.sha256` differs is not used.

With no sha kept (a download made before it, or one that never kept a map), a
server ebook of another size than the one downloaded (`useDownloadedEbookSize`)
counts as another ebook, as the download's refresh takes it. The download's own copy
then stands in. With no copy, the failure is `ebookChanged`, and the surface says
"The read-along is for a newer ebook" and asks the listener to remove the download
and download the book again.

Online, a book the server calls `stale` has no map here even when the download's
kept copy fits it (a known follow-up). Offline the copy is used.

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

**The host API** is `useReaderReadalong`, shared by both hosts. Its props:

- `readalongMap`, memoised, because a new identity is sent again;
- `readalongPosition()`, read every second while a map is in, and on the handle's
  `syncPosition()`;
- `followNarration`, to follow as soon as the map is in;
- `onSeek`, `onFollowing` and `onReadalongState`.

The handle's `follow()` sends `follow`. Each `ready`, a reloaded document's too, gets
the map, then the place, then `follow` when the last document last said it followed
(else `followNarration`).

**The narration** is `useNarration(target, host)` in `narration.ts`. The reader
follows only while the player's placed book is this book (`selectPlacedBookKey`).
`readalongPosition()` reads its whole-book place, speed and playing state. The host
is told at once (`syncPosition()`) on play, pause, a speed change or a jump. A jump
(`narrationMoved`) is more than `NARRATION_JUMP_S` (1.5 s) from where the clock would
be. A tapped sentence's `seek` is the store's `seekBook`, only while placed, so a tap
in another book's text plays nothing.

### The core (`reader/src/readalong.js`)

The core is ported from the read-along spike's `readalong-core.js` and tested under
`node:test` (`reader/test/readalong.test.mjs`). `readalong-cfi.test.mjs` resolves the
Bridge's Alice map and EPUB through the vendored `epubcfi.js` on jsdom. The fixtures
in `reader/test/fixtures` are byte copies of audiosilo-bridge testdata.

- **Indexing** starts only once the book shows its first place (`attach` after
  `opened`), because a follow's `goTo` racing the opening one would supersede it.
  Spans sort by time (`indexMap`). A span's section is the CFI's `/6/N` step against
  the sections' own CFIs, else `view.resolveCFI`. Ranges resolve lazily per section.
  A CFI that names nothing is skipped and never breaks the loop.
- **The clock** is a 50 ms tick that reads `PositionClock` and finds the sentence by
  binary search (`spanAt`, held 2 s across a short gap). `PositionClock` holds the
  host's one-a-second samples, moved on at the speed while playing, and never runs
  more than 3 s past the last. The highlight is foliate's annotation drawn with
  `Overlayer.highlight`. A sentence running over the page end turns the page once
  the narration passes the share of it shown.
- **A tap** finds its sentence by CFI order (`findInOrder` on the caret's CFI),
  seeks to its start and follows. For 2.5 s (`SEEK_GRACE_MS`) the core ignores
  samples more than 1.5 s from the tapped sentence, so a late sample doesn't pull the
  page back.
- **Turning away**: a person's move that takes the sentence off the page stops
  following (`following {value: false}`), and one back onto it follows again. A move
  is a page turn, scroll, snap or navigation; never a relayout, nor one that stays on
  the page shown. A seek in the player follows again: a sample 3 s or more (`JUMP`)
  from where the clock would be. It does so only once the reader has followed at
  least once, so the full-screen reader is never grabbed by every seek.
- **One move at a time** (`inTurn`): the tick's, `follow`'s and the host's page
  turns wait for each other. Each is given up after `MOVE_MS` (10 s), since foliate
  never settles a `goTo` whose view a later one replaced.

### Follow narration in the full-screen reader

`ReaderScreen` asks for the map (`useBookReadalong(..., narration.narrating)`). It
sends the map **only while its book is the one the player holds**, because another
book playing has nothing to follow here.

It never sets `followNarration`. Once the reader said `ok`, a pill at the page's foot
says **Follow narration**, and pressing it calls `follow()`. The pill is
`FollowPill` (`readalong-follow`), stacked with the Jump offer and the not-saved
card. Once the listener turns a page away, it says **Back to narration**. While the
pill shows, the page ends `FOLLOW_PILL_ROOM` (48 px) above the foot
(`followPillRoom`), so the pill never covers the last line. The companion's Text tab
does the same.

**No reading-place save while following.** The narration turns the pages, not the
reader, so `onFollowing(true)` drops the save timer and any pending save. Leaving
following (`onFollowing(false)`) schedules the usual debounced save of the page on
screen (`atNow`, the latest `progress`), and every move after that saves as usual. A
map that goes away ends following too, and so does Try again (a new host, which has
followed nothing). The companion's Text tab never saves a reading place at all
([Player UI](player-ui.md#the-text-tab-read-along)).

## Still to come

Known follow-ups:

- a generic save queue shared with progress sync;
- a clearer notice for a book over the 512 MB limit or an allocation failure;
- checking a downloaded `book.epub`'s size;
- a cap on the cache's size;
- a disk-full notice;
- pinch zoom;
- checking a download whose `book.epub` won't read against the server's map by the
  download's sha;
- using a stale book's kept map online when it still fits the download.
