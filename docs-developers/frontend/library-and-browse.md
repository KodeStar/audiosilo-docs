---
title: The Library and browse screens
description: "The Library tab's modes (src/components/library/): capability gating, the selected library, Books mode's whole-library load and on-device view, the book menu, the covers and shelves every browse screen is built from, how browse surfaces start a book, and the series and person pages."
---

The Library tab and every browse screen (Home's shelves, the series and person
pages, collections) are built from the pieces in `src/components/library/` and
`src/components/series/`. The routes that show them are in the
[route map](routes.md#route-map).

## The Library modes

`LibraryScreen` (`src/components/library/library-screen.tsx`) is the Library tab
root. Its sections are the modes of `library-modes.ts`: `books`, `authors`,
`series`, `narrators`, `collections` and `folders`. `parseLibraryMode` reads the
mode from `?mode=`, and an unknown or absent mode means `books`. The screen
writes the mode with `router.setParams`. The default carries no param, so the
plain link stays `/library`.

- **Capability-aware.** `authors`, `series` and `narrators` need
  `browse_people`, and `collections` needs `collections`. Both flags are read
  with `useCapability` for the selected library's connection.
  - `availableLibraryModes` offers only modes whose flag is known to be on. A
    mode waiting on its flag is left out, rather than shown and taken away.
  - `resolveLibraryMode` keeps a deep-linked mode while its flag is still
    unknown, and falls back to Books once the flag is known to be off.
  - The segment counts come from the gated `useAuthors`, `useNarrators`,
    `useSeriesList` and `useCollections`. Books and Folders have no count.
- **One selected library.** Every mode but Folders shows one library.
  `useSelectedLibrary()` reconciles the device-local `useLibrarySelection` pick
  with every connection's library list. It never puts another server's library
  in place of one whose server has not answered. The screen shows that server's
  state instead. The order of the pick, those states and the picker's labels are
  under
  [Library selection](state-and-data.md#library-selection-srcstoreslibrary-selectionts).
  - `LibraryPicker` (published with `SubNavActions`, order -100) chooses the
    library, grouped by server.
  - In Collections mode the picker is `by="server"`, because a collection belongs
    to a server.
  - Each mode body is keyed on `connection:library`, so switching remounts it
    cleanly.
- **Mode bodies** live in `src/components/library/modes/`:
  - `BooksMode` (see [Books mode](#books-mode));
  - `AuthorsMode` and `NarratorsMode`, on the shared `PeopleMode` in
    `src/components/series/people-mode.tsx`: portrait cards, letter heads, and
    the "no author listed" count;
  - `SeriesMode`: series cards with a mini shelf of owned spines and dashed gaps.
    A card fetches its books once it shows. On a `series_books` server, the cards
    that show together share one request (see
    [Series cards share one request](state-and-data.md#capability-gated-reads-player-redesign-phase-1a));
  - `CollectionsMode`: Favourites, own and shared collections, and New
    collection;
  - `FoldersMode`: the old libraries-then-folders flow and its Favourites row,
    unchanged.

### Books mode

**Books mode** is the one place that loads a whole library.
`useWholeLibrary(connectionId, libraryId)` (over `useAllLibraryBooks`) pages
`GET /libraries/{id}/books` 200 at a time, always newest first, until
`next_cursor` runs out. It has its own key under the `libraryBooks` prefix, so
its pages never mix with the 100-book pages of `useLibraryBooks`. There is one
cache entry per library whatever the screen's sort, because every sort happens
on the device. The pages loaded so far are usable at once. A failed page keeps
what loaded, and Retry carries on. While a page waits for the network
(`offline`), the books loaded stay and "Loading more" hides. With nothing loaded
the grid is the offline state, never a skeleton
(see [Offline states](state-and-data.md#offline-states-srcliboffline-statets)).

The view is `books-view.ts`, which is pure:

- `parseBooksView` and `booksViewParams` are the URL contract: `sort`, `status`,
  `dl=1`, `len`, `genre` and `tag`. Defaults are omitted.
- `filterBooks` filters on the device. It matches a genre or tag by `labelKey`:
  lowercased, with spacing collapsed.
- `statusCounts` gives each chip's count among the books the *other* filters
  keep.
- `labelOptions` gives the genre or tag choices, each counted the same way. The
  chosen one is kept even at 0.
- `sortBooks` sorts. Title order folds accents and skips a leading article. An
  untitled book sorts, and shows, by its folder name through `bookTitle`.
- `letterGrid` builds the title sort's letter heads and A-Z rail.
- `lengthBucket` places a book in one of the `len` chips. Home's Short listens
  shelf reuses it.

`books/label-filter.tsx` shows the genre and tag choices as a picker chip that
opens a dialog. It shows only when a loaded book has a label or the URL names
one, so an older server shows no new control. With any filter on, `BooksMode`
leads the chip row with Clear and then the chosen genre or tag chip, and the
unchosen pickers stay at the end. It re-keys the row by the chosen kinds, so the
row starts scrolled to its start.

The grid or list choice is `useBooksLayout` (`audiosilo.booksLayout`), which a
collection and Favourites use too.

### The book menu

The **book menu** is `useBookActions`, presented by `BookActionsMenu`
(`books/book-actions.tsx`). The list view's `BookActionsButton` opens it, and so
does every [`CoverTile`](#covertile). Its items:

- Play or Resume;
- Up next (`queue`);
- Add to collection (`collections`);
- download;
- Mark as finished. Undo is offered only with `progress_edit`. The mark is sent
  as a `finish` event where the server takes one, else as a progress edit with
  `progress_edit`, else as `useMarkFinished`'s save (see
  [State & data](state-and-data.md#react-query-srcapihooksts-srcapiprovidertsx));
- Mark as not finished (`progress_edit` only);
- More in this series.

A capability that is still unknown hides its item. Remove download asks first
through the shared `RemoveDownloadConfirm` (see
[Offline](offline.md#lifecycle)).

## Find on LibriVox (admin)

`src/components/librivox/` is the player's side of
[Add from LibriVox](../bridge/librivox.md): an admin searches the community
metadata's LibriVox works and adds a recording to a books library, which the
server's Bridge downloads. The console's Library > LibriVox is the same page, so
the two keep the same rules.

**The gate.** `librivoxAccess(user, server)` (`librivox-model.ts`) needs an admin
(`isBridgeAdmin`), the `bridge` flag with `librivox` in `bridge.features`, and
`metadata`. `mayAddLibrivox` is its `allowed`. Unlike the console, the player
offers nothing while the Bridge is offline (see
[The gate](../bridge/librivox.md#the-gate)). Without `allowed` the page shows only
a sentence (`notAdmin`, `unavailable`, `metadataOff`): the search and its hooks
never mount.

**The way in.** `LibrivoxMenu` is a **...** menu in the Books mode's controls
(`books-controls.tsx`'s trailing slot: the sub-nav row on a tablet or desktop,
the count line on a phone) with one item, **Find on LibriVox**. It renders
nothing for anyone else. It opens `/find-librivox?connection=&library=`
(`findLibrivoxHref`, `openFindLibrivox`), the Library tab's own page like Add
shows. It is a browse page (`BROWSE_PATHS`), so opening it keeps the Library's
scroll memory.

**The wire** (`client.ts`, hand-mirrored from `handlers_librivox.go`):

| Method | Route |
|---|---|
| `librivoxSearch(q, {lang, limit})` | `GET /admin/librivox/search` |
| `librivoxWork(id)` | `GET /admin/librivox/work` |
| `librivoxFetch(lib, id)` | `POST /admin/librivox/fetch`, `202 {job}` |
| `bridgeJob(id)` | `GET /admin/bridge/jobs/{id}` |

`addRefusalKey` and `readErrorKey` word the refusals: `in_library` (the work read
again shows where; the body's `library_id` and `path` are not read),
`not_book_library`, `kind_unavailable`, `library_not_writable` and
`metadata_off`.

**The hooks** (`hooks.ts`):

- `useLibrivoxSearch` and `useLibrivoxWork` are `metadata` reads with
  `retry: false`.
- `useAddLibrivox` is a `metadata` write. It seeds the job's own read and asks the
  connection's works again whatever the answer.
- `useLibrivoxJob` is a `bridge` read, and Cancel is `useCancelBridgeJob`.
  `storeJob` puts a job about no book at its own read (`qk.bridgeJob`).

A `librivox.fetch` has no book path, so a row follows it by its id, not through
`useBridgeJobs` or `useBridgeJobSurface`, which are keyed on a book. It is polled
while open and the page is focused (`librivoxJobPollInterval`: 5 s, 60 s while
parked) and never after a `404`. A first read that failed with no answer or a
server error is asked again every 60 s; a refusal (`400`, `401`, `403`) is not.

**The page.** One scroller holds the search (asked on submit only), the works
found, and the opened work's recordings under it.

- Add goes to the library the page was opened from, or the one picked when the
  server has several books libraries. Podcast libraries are never offered.
- A row follows the last job it queued or saw open on the work
  (`useFollowedFetch`) and switches only when the work names a different job, so a
  failure still says why and an older answer never takes the row back from the
  job it just queued.
- `fetchView` words the job: its step (`manifest`, `download`, `cover`, `place`,
  `rescan`) or its code (`librivox.fetch.code.*`). The Bridge's English is never
  shown.
- A job's end asks the works again. A `done` one asks once more after
  `DONE_RECHECK_MS` (the server records the book just after the job ends) and reads
  the library's lists and the connection's recently added again
  (`invalidateLibraryLists`).
- A read with nothing to show and no network is `OfflineState`
  (`useUnreadQuery`). A search or a work read again that failed keeps what it
  shows.
- The recording's `cover_url` is never loaded: it is a third-party host, with no
  server proxy.

Strings are under `librivox.*` in all six locales, and fixtures are in
`src/testing/librivox-fixtures.ts`.

## Browse building blocks

The covers and shelves every browse screen is made of (STYLEGUIDE section 8)
live in `src/components/library/`:

| Piece | What it is |
|---|---|
| `BookCover` | A book's art. See [BookCover](#bookcover). |
| `CoverTile` | A cover as one button, which owns the book menu. See [CoverTile](#covertile). |
| `GhostCover` | A book the listener doesn't have: hatched and dashed, with the real title and position from the community data and "Not in your library". When another connected server has it, the label is an `info`-tinted "On &lt;server&gt;" instead. Below 100 wide it draws the title's initials, with the full title kept in its accessible name. It never shows fake art, and it has no book menu. |
| `ShelfRow` | A horizontal, snap-scrolling row of tiles on a FlashList, standing on a decorative `Ledge`. It bleeds to the window edge past the page gutter. |
| `CoverGrid`, `CoverGridSkeleton`, `CoverListRow` | The page's grid on FlashList, its same-size skeleton, and the list variant of a book. The grid *is* the scroller. Full-width rows such as letter heads span every column through `overrideItemLayout`. |
| `cover-layout.ts` | `pageGutter`, `shelfMetrics` (164 tiles, 132 on a phone) and `gridMetrics` (columns of at least 158, two on a phone; `cardGrid` for card grids). |
| `CoverWash` (`cover-wash{,.web}.tsx`) + `src/lib/cover-tint.ts` | The cover-colour wash behind the Now card and the series hero. `coverTint(book.cover_color)` returns null, and so no wash at all, when the server sent no colour. The wash is drawn at `WASH_STRENGTH` (the `--wash` token), as SVG radial gradients on native and CSS on the web. |
| `FilterChip` / `ChipRow` (`src/components/ui/filter-chip.tsx`) | The filter chips. |
| `useQueueActions` / `QueueButton` | "Queue it" for one connection's server. See [Queue actions](#queue-actions). |

### BookCover

`BookCover` picks its source from `coverCandidates`, best first:

1. the downloaded copy;
2. the smallest server thumbnail that covers the drawn pixels (`coverSizeFor`:
   160, 320 or 640), only when the server advertises `cover_sizes`;
3. the full art, which is also the fallback for a thumbnail that fails.

`cover_version` rides along as the cache buster. While the server's flags are
unknown, the cover shows an empty frame rather than fetching the full art first.

### CoverTile

`CoverTile` is a cover as one button. It shows a progress bar while the book is
in progress, flags for a friend's (non-default) server, downloaded and finished,
the title and one caption line. A small cover with no art shows a two-letter
monogram (`src/lib/monogram.ts`). On the web desktop the tile is also the Up next
drag source.

The tile owns the book menu (`TileActions`, `tile-actions.tsx`). These open
`BookActionsMenu`:

- a long-press;
- a right-click. On macOS and Linux the menu opens on the button's release, so
  the release can't pick an item;
- the Menu key or Shift+F10;
- the screen reader's *More actions*.

`useContextMenuRequest` in `src/lib/context-menu{,.web}.ts` handles the
right-click and the keys. The menu is a sheet on a phone, and a dropdown anchored
to the tile's corner on tablet and desktop. It uses the screen's `book` row when
the screen passes one, else one item fetch on first use.

### Queue actions

`useQueueActions` is "Queue it" for one connection's server. It offers
`isQueued`, `queue(lib, path, position?)` and `unqueue`, with Undo toasts. It is
hidden until `queue` is known to be on. It swallows a `CapabilityError`, and a
`409` says the queue is full. `QueueButton` ("Queue it" or "Queued") is the
series page's action for an unread owned book.

## Starting a book from a browse surface

Every surface outside the player starts a book, or jumps into one, through
**`usePlayBook`** (`src/components/player/use-play-book.ts`). That covers Home,
the Library, the series page, Up next, the book page, the bookmark, note and
history rows, and the Journal.

- A browse surface passes the book, with `viaBookPage` from a list or Home.
- A play or pause button passes `toggle`.
- A jump passes `at`.

Where each one goes is
[the one play path](book-page.md#the-primary-action-and-the-action-row).

## Series and person pages

`src/components/series/` holds the series and person pages:

- `series-model.ts`: the entries, gaps, reading orders, progress track, and the
  one action per entry. A ghost that is not released yet carries `outDate` from
  the rails' `release_date`, and reads "Out Nov 12, 2026" in English.
- `spine-fit.ts`: spine titles always fit. It tightens, then shrinks, then
  wraps, then ellipsizes.
- `bookcase.tsx` and `spine.tsx`, and `person-page.tsx`.
- `use-series-data.ts`: the page's reads beyond the shared `src/api` hooks
  `useAllLibraryBooks` and `useProgressLookup`. `useElsewhereBooks` runs one
  search per other server for copies of the series elsewhere. `usePlacedBooks`
  fetches an `/item` for each book a rail places in another library.

The series page reads community rails only on a `metadata` server, and shares
reading-order picks with the book page (`useSeriesOrderings`). Under its list,
`KeepAheadCard` (`keep-ahead-card.tsx`) binds the device-wide `keepAhead`
setting through the Downloads page's exports. It shows only once the downloads
store knows the device can download.

Search's series results reuse the Library's `SeriesCard`. Each card asks for its
series' books only once it shows, batched with the other cards on a
`series_books` server.
