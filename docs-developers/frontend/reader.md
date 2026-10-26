---
title: The ebook reader
description: "The player's EPUB reader (src/reader/, the /read route): the reader document built from vendored foliate-js, the sandboxed web host and its message protocol, the reading-place queue with Sync v2's base_version, the Jump there offer, Read on the book page, and what waits for the apps (Bridge Phase 3b)."
---

A book whose folder holds its EPUB gets **Read the ebook** on its page, and the
reader opens the EPUB paginated, remembers the place per user across devices, and
runs no script from the book anywhere. It is Bridge Phase 3b-1 (web only); the
apps' host (a WebView, Phase 3b-2) comes next. The server side is capability
`ebooks`: a book's [`ebook`](../server/api/reference.md#get-apiv1librariesidbooks)
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
| Its build | `scripts/build-reader.mjs` -> `public/reader.html` (`npm run reader:build`; `reader:check` in `npm test`) |
| The route | `src/app/read.tsx` (`/read`, a root `fullScreenModal`), `readerHref` in `src/lib/paths.ts` |
| The screen | `src/reader/reader-screen.tsx` (`ReaderScreen`: top bar, page edges, Contents sheet, the offer, failures) |
| The host | `src/reader/reader-host.web.tsx` (the iframe); `reader-host.tsx` (the apps' placeholder until 3b-2) |
| The protocol | `src/reader/protocol.ts` (`parseReaderMessage`, `acceptReaderMessage`, `createHostChannel`) |
| The place | `src/reader/reading-progress.ts` (queue, mirror, `lookupReadingPlace`, `jumpOffer`, `adoptServerPlace`) |
| Read on the book page | `canRead` (`src/reader/can-read.ts`) in `src/components/book/hero-actions.tsx` |
| Text size | `src/reader/reader-settings.ts` (`audiosilo.readerFontScale`, per device, not synced) |

## The reader document

The reader is its **own document**, never part of the app: foliate-js parses an
EPUB nobody vetted, so it runs in a page whose policy lets nothing out.
`scripts/build-reader.mjs` bundles `reader/src/` with the vendored foliate-js
(esbuild, one IIFE, es2022; only the View, EPUB, overlayer and CFI modules and
zip.js without workers: PDF, MOBI, FB2, comics, TTS and search are excluded) into
`public/reader.html`, **one** inline script and an inline style with no
subresources. The page carries the whole policy as a meta CSP with the script's
sha256 (`connect-src 'none'`); the server sends the same policy as a header, hashing
the served script itself, plus `frame-ancestors 'self'`, which a meta tag can't
set. Expo's web export copies `public/reader.html` to `dist/reader.html`, served as
`/web/reader.html`.

- **Generated and committed.** `npm test` runs `reader:check` (a rebuild compared
  byte for byte), so a change under `reader/` without a rebuild fails the gate.
- **foliate stays unmodified.** `FOLIATE_PIN.txt` holds the upstream commit and
  each vendored file's sha256; the build refuses an edited copy.
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

### The protocol

`postMessage` on the page's own origin only, both ways. Host messages wait in the
channel (`createHostChannel`) until the reader says `ready`.

| Direction | Messages |
|---|---|
| host -> reader | `open {book (ArrayBuffer), name, at?: {cfi?, fraction?}, theme, fontScale}`, `goto {href \| cfi \| fraction}`, `appearance {theme, fontScale}`, `next`, `prev` |
| reader -> host | `ready`, `opened {title, toc: [{label, href, depth}], rtl}`, `progress {cfi, fraction, sectionLabel}`, `loading {value}`, `error {code: drm \| unreadable \| runtime, message}`, `escape`, `csp {directive, blocked}` |

The reader's messages describe a book nobody vetted, so `acceptReaderMessage` takes
a message only from **that frame's** `contentWindow` on our own origin, and
`parseReaderMessage` checks it field by field (types, the CFI's length, text and
TOC sizes): anything else is dropped. `escape` exists because a key pressed in the
book stays in the frame; the reader turns pages itself and sends Escape back so the
screen can close.

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

`canRead(ebooks, book, Platform.OS)` is `ebooks === true && !!book.ebook && os ===
'web'`: the capability, the book's `ebook` field, and the web until 3b-2. The hero
shows an outline **Read the ebook** button after the download (its own row on a
phone) that pushes `readerHref(connectionId, libraryId, book.rel_path)`. On the
apps, `reader-host.tsx` is a placeholder notice ("Reading is on the web for now")
for a link that lands there anyway.

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

## Still to come

Phase 3b-2 (the apps): `react-native-webview` with a native variant of the reader
document loaded from a local file beside the EPUB (fetched with the bearer header
into a per-book cache, or the downloaded copy), the EPUB in downloads (offline
reading on the web too), and dropping the web-only gate. Later (3c): read-along with
the audio. Known follow-ups: a generic save queue shared with progress sync,
fetching the EPUB alongside the place lookup, and the page edges overlapping text on
narrow phones.
