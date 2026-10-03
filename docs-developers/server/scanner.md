---
title: "Filesystem view & scanner"
description: "How audiosilo-server turns a folder of audio files into a browsable, indexed catalog: the no-index filesystem view, the background scanner, book detection, metadata and chapter extraction, covers, move detection, and the unavailable-root guard."
---

`internal/library` contains two complementary subsystems:

- **`fsview.go`** - the instant filesystem view. `BrowseFS` lists a real
  directory with **no prior indexing**, which is what makes the first
  connection wait-free (design priority #3).
- **`scanner.go`** - the background `Scanner` that builds and maintains the
  index (`books`/`book_files`/`chapters`/`books_fts`) the computed views,
  search, and rich metadata come from.

The two meet in the API layer: browsing works immediately from the raw tree,
and entries get index metadata overlaid as the scan (or on-demand indexing)
catches up.

## The filesystem view (`BrowseFS`)

`library.BrowseFS(root, relPath, offset, limit, allow)` lists one directory:

- The path goes through `SafeJoin` first (the traversal/symlink gate - see
  [Auth & security](auth-and-security.md#path-traversal-librarysafejoin)).
- **Dotfiles are hidden**, and **non-audio files are filtered out** (only
  directories and `metadata.IsAudio` files survive) - so anything a client can
  click is either navigable or playable; `.jpg`/`.nfo` clutter never reaches
  the UI.
- The optional `allow` callback filters entries **before pagination** (so pages
  stay full); the API passes `Scope.VisibleInBrowse` here for non-admin
  callers, scoping the tree to their shares.
- Directories sort before files, both case-insensitively by name; pagination is
  simple offset-based (default 200, cap 500) - fine here because a single
  directory is small, unlike the catalog-wide listings which must use keyset
  cursors.
- Only files get a per-entry `stat` (for `size`/`mod_time`); directories skip
  it - one saved round-trip per entry is the difference between a snappy and a
  multi-second author listing on a network mount.

The handler (`handleBrowseFS` → `annotateWithBooks`) then overlays the
**hybrid view**: paths that match indexed books (via `catalog.BooksByPaths`)
get `is_book: true` plus title/author/series/series-index/duration, and each
entry carries its effective folder-detection `override` so the admin console's
folder detection dialog can show and change it.

## When scans run

There is **no periodic rescan**. A scan of a library runs when:

| Trigger | Where |
|---|---|
| Server startup (every library, once) | `launcher.initialScan`, in a background goroutine |
| Admin "Rescan" | `POST /admin/libraries/{id}/scan` → `backgroundScan` (returns 202 immediately) |
| Library created or edited | `handleCreateLibrary` / `handleUpdateLibrary` (a changed root invalidates the index) |
| Folder override set or cleared | `handleSetFolderOverride` / `handleDeleteFolderOverride` |
| A single path, on demand | `Scanner.IndexPath` from any content handler (see below) |

`backgroundScan` detaches the scan from the request but binds it to the server
lifecycle (`a.baseCtx`, with a 1-hour timeout), so shutdown cancels an
in-flight scan rather than leaving it orphaned. Concurrent `Scan` calls for the
**same** library coalesce (the second returns immediately); different libraries
scan concurrently. Progress is observable: the scanner tracks a per-library
`ScanProgress{Running, Total, Done, Indexed}` served by
`GET /admin/libraries/{id}/scan`, and logs a heartbeat every 15 s so a long
pass over a network share doesn't look hung.

## Anatomy of a scan pass

```mermaid
flowchart TD
    A["Signatures(lib)<br/>stored mtime/size/duration/codec/cover per rel_path"] --> B{"os.Stat(root)<br/>exists & is dir?"}
    B -- no --> U1["ErrLibraryUnavailable<br/>(abort, no prune)"]
    B -- yes --> C["FolderOverrides(lib)"]
    C --> D["discoverAuto: WalkDir the tree<br/>collect dirs that directly contain audio<br/>(warn + skip unreadable entries)"]
    D --> E["booksInDir per dir<br/>(detection model + overrides)"]
    E --> F{"0 books found<br/>but index non-empty?"}
    F -- yes --> U2["ErrLibraryUnavailable<br/>(abort, no prune)"]
    F -- no --> G["detectMoves<br/>fingerprint-match vanished → new paths,<br/>MoveDurableState"]
    G --> H{"per book:<br/>mtime+size unchanged<br/>and probe data present?"}
    H -- "yes (skip; note embedded art<br/>if has_cover unset)" --> H
    H -- no --> I["enrich: path heuristic + tags/ffprobe,<br/>field sources, chapters, cover, fingerprint"]
    I --> J["catalog.UpsertBook (one tx):<br/>scanned values + files + chapters,<br/>then enrichment + overrides layered on, FTS"]
    J --> H
    H -- done --> HC["SetHasCover<br/>noted cover flags, one tx"]
    HC --> K["DeleteBooksNotIn<br/>prune vanished paths (+ FTS rows)"]
    K --> M["log result: indexed / removed / elapsed"]
```

The **unchanged-skip** condition is worth reading precisely: a book is skipped
when its stored mtime and size match **and** either ffprobe is disabled or a
prior probe already stored both a duration and a codec. That last clause is a
backfill mechanism - books indexed before the `codec` column existed (migration
`0008`) get re-probed once even though their files haven't changed.

A skipped book can still get one cheap backfill: when its `has_cover` is unset
(a row indexed before migration `0016`), the scan checks its primary file for
embedded art with a tag read (`media.EmbeddedCover`, no ffprobe) and notes the
answer without re-indexing the book. Only books that are really skipped are
checked - one re-indexed anyway gets its flag from the upsert - and a file that
can't be opened right now (a flaky mount) is skipped, leaving the flag unset for
the next scan rather than recording "no cover". The noted flags
are written in **one transaction** after the loop
(`catalog.SetHasCover(ctx, libID, map[path]bool)`, which also counts a sibling
`cover_path` as art), so the first scan after the upgrade stays cheap on a large
library.

### Enrichment and admin edits survive every upsert

There is no separate "re-apply" step after a scan. `catalog.UpsertBook` writes
the values the scan found (and records them in `books.scanned`, field → value),
replaces the
files and chapters, then - in the **same transaction** - layers any path-keyed
`book_enrichment` (ASIN/ISBN) and any admin metadata or chapter-title overrides
on top and refreshes the FTS row (`catalog.refreshEffective`). So an attached
ASIN survives a rebuild, and an edited field is a lock: the rescan re-reads the
file, but the edit is re-applied before the transaction commits. Files on disk
are never written. See
[Data model](data-model.md#metadata-overrides-and-effective-values).

## Book detection (`booksInDir`)

There is no per-library layout setting. The model matches the dominant
"folder per book" convention (and Audiobookshelf):

- **A directory that directly contains audio is ONE book**, with all those
  files as its ordered tracks - whether it holds a single `.m4b` or fifty
  distinctly-named `.mp3` chapters. Do **not** split a folder's files into
  separate books by filename; that heuristic produced one phantom book per
  chapter file.
- The single exception is the **library root**: loose audio files sitting
  directly in the root have no enclosing book folder, so each is its own
  single-file book.
- A folder of loose single-file books is expressed with a **per-folder
  override**: `folder_overrides.mode = 'collection'` forces one book per file;
  `'book'` forces folder-is-one-book (e.g. at the root). Overrides are durable,
  path-keyed config consulted before the heuristic - set via
  `PUT/DELETE /admin/libraries/{id}/folder-override?path=` (which rescans), and
  driven by the admin console's folder detection dialog.

`folderBook` orders parts by name (`os.ReadDir`'s stable ordering), sums sizes,
takes the max mtime, and takes the **earliest** file's `added_at`. `addedAt` is
the file's birth (creation) time where the OS records it
(`birthtime_darwin.go`/`birthtime_linux.go`), otherwise mtime - a stable
chronological key for "recently added" that survives re-indexing.

## Metadata extraction

`Scanner.enrich` fills a discovered book in layers, cheapest first, with
embedded data winning where it is trustworthy:

1. **Structural path parsing** (`metadata.DeriveFromPath`) is the baseline. The
   book's own name (filename minus extension, or folder name) yields the title
   and a leading series index (`splitSeriesIndex` parses `01 - Unsouled`,
   `Book 3 - …`, `C02 …`); the nearest ancestor directory is the series and the
   one above it the author (`Author/Series/01 - Title.m4b`). A book at the
   library root simply has no ancestors - the old "flat" layout falls out for
   free.
2. **Embedded tags + probe** (`metadata.Extract` on the primary file - the
   first part for folder books) overlay the baseline: tags via `dhowden/tag`
   in-process (album ≻ title for the book title - except when the title tag
   extends the album with a real subtitle, the Audible shape where album holds
   the *series* and only the title tag carries the actual book title; album-artist
   ≻ artist for the author, composer as narrator, plus raw-tag lookups for
   series/narrator atoms), then ffprobe (when configured) for duration, chapters, the audio
   `codec` (`codec_name` of the first audio stream - this is what feeds the
   `direct_playable` API flag), and richer container tags.
3. **Generic-title guard**: `chooseTitle` keeps the path-derived title when the
   embedded one is missing or generic - `metadata.IsGenericTitle` flags bare
   numbers and "Track 01"/"Disc 2"/"CD1"-style labels (token-based, so a real
   title like "Part of Your World" is not flagged).

The scanner does not record where each value came from. The admin console's
per-field provenance works it out when the book is read
(`bookLayers.resolve`): a scanned value equal to what `DeriveFromPath` yields
for the book's path is `path`, anything else `tag` - one rule for every row, old
or new (see [Data model](data-model.md#metadata-overrides-and-effective-values)).
The scanner does record each folder-book part's own codec (`book_files.codec`)
and whether the primary file carries embedded art (`books.has_cover`; the upsert
also sets it whenever a sibling cover was found).

**ffprobe is optional** and every path degrades gracefully without it:
path-derived metadata still works, durations fall back to chapter ends or
remain 0, and `codec` stays empty - which the API treats as directly playable
(the client falls back to `?transcode=1` if playback fails). See
[Media & streaming](media.md).

## Chapter normalization

Chapters are normalized (`metadata.Chapter`) so single-file and multi-file
books present identically: every chapter carries `file_path` (the
library-relative audio file to stream), in-file `start`/`end`, and
`book_offset` (its start on the whole-book timeline).

- **Single-file books** (`singleFileChapters`): embedded chapters are marked as
  living in file 0 with `book_offset = start`. If the container reports no
  format duration (some m4b), the book duration falls back to the last
  chapter's end.
- **Folder books** (`buildMultiFileChapters`): each part is probed and,
  crucially, **if a part has its own embedded chapters** (a single chaptered
  m4b living in its own book folder) **those are expanded** into the book's
  chapter list; otherwise the whole part becomes one chapter titled from its
  filename (`partTitle` strips the extension and any leading track number).
  Book offsets accumulate across parts and the book's duration is the sum, so
  a chaptered m4b and a folder of split mp3s render identically in a player.

## Covers

Cover resolution has two stages - an indexed **sidecar** path, and an
**embedded-art** fallback at request time:

- During enrichment, `findCover` looks for a conventionally-named sibling image
  (`cover.jpg`, `cover.jpeg`, `cover.png`, `folder.jpg`, `folder.png`). For a
  **folder book** it searches *inside* the book folder and - only there - will
  fall back to any image file (`.jpg/.jpeg/.png/.webp/.gif`), preferring one
  with "cover" in its name over an arbitrary first-alphabetical thumbnail. A
  multi-CD disc subfolder (`CD1`, `Disc 2` - `isDiscFolder`) falls back to its
  *parent* folder, where the art usually lives. For a **loose single-file
  book** only the conventional names in its directory count (a stray image
  there is probably not its cover). The result is stored in `books.cover_path`.
- At request time, `handleCover` first serves a **custom cover** an admin
  uploaded (stored in the database, `book_covers`); otherwise the sidecar via
  `media.ServeFile` when `cover_path` is set; otherwise it extracts **embedded
  art** from the book's primary audio file (`media.EmbeddedCover`, via
  `dhowden/tag`), and 404s if none exists.
- The scanner records `books.has_cover` (sidecar found, or the tags carry a
  picture) so the admin catalog can filter on it without opening files; the
  catalog's "has a cover" is `has_cover` or a custom cover.

## Move detection

Re-tagging keeps durable state via the path key; **moving** a file keeps it via
the fingerprint:

- `fingerprintFile` computes SHA-256 of (size, first 64 KiB, last 64 KiB) -
  cheap on huge audiobooks, and stored in `books.content_hash`. It is
  explicitly *not* an identity, only a move detector.
- `Scanner.detectMoves` runs early in each scan, and only does work when
  something both **disappeared** (in the stored signatures, not discovered) and
  **appeared** (discovered, not stored) - keeping fingerprinting off the hot
  path of normal scans. It fingerprints each new book's primary file (caching
  it on the book so `enrich` doesn't re-read) and matches against the stored
  fingerprints of the vanished paths (`catalog.FingerprintsForPaths`).
- A match calls `catalog.MoveDurableState(lib, oldPath, newPath)`, which
  migrates **all nine** path-keyed book tables - `progress`, `bookmarks`,
  `notes`, `listening_history`, `favourites`, `book_enrichment`,
  `book_overrides`, `chapter_overrides` and `book_covers` - in one
  transaction, so a rename/move never orphans a user's position, a book's
  attached ASIN, or an admin's edits and custom cover. Should the new path
  already hold stale rows from an earlier book there, the moved book's win
  rather than the conflict aborting the whole move: `book_enrichment` and
  `book_covers` move with `UPDATE OR REPLACE`, and when the moved book has
  overrides (book or chapter) the destination's override rows are deleted
  first, so the moved book's set replaces them whole - a stale lock on a field
  the moved book never edited can't merge in. The book is then indexed at its
  new path, and that upsert layers the moved edits back on.

## On-demand indexing (`IndexPath`)

Content handlers resolve `(library, path)` via `bookForPath`: try
`catalog.GetBookByPath`, and on a miss call `Scanner.IndexPath` - so a client
can open a book it found in the filesystem view **before the background scan
has reached it**.

`IndexPath`:

1. Gates the path through `SafeJoin`, but then derives the working path from
   the **unresolved** join - `SafeJoin` returns a symlink-resolved path, and
   using it would produce `rel_path` keys that disagree with the full scan
   (which walks the root unresolved) whenever any component of the root is a
   symlink (macOS `/tmp → /private/tmp`, NAS mounts).
2. Classifies the containing directory **exactly as a full scan would**
   (`booksInDir`, including overrides and the root case), then `pickBook`
   selects the book the requested path resolves to - the book itself, or the
   folder book a clicked *part* belongs to (both resolve to the same book).
3. Enriches and upserts that one book - `UpsertBook` layers its enrichment and
   any admin edits on in the same transaction, so a book indexed on demand
   shows its edited values at once - then returns the full book with chapters.

A path that is not a book - a directory with no direct audio, or one the
detector treats as a collection - returns `ErrNotIndexable`, which handlers map
to 404.

## The unavailable-root guard

`ErrLibraryUnavailable` protects the index when a network share (SMB/NFS)
drops. The scanner **aborts without pruning** when either:

1. the library root is missing or not a readable directory (`os.Stat` before
   discovery), or
2. discovery returns **zero** audio files while the index still has books - an
   existing-but-empty mount point looks exactly like this, and letting the
   prune step run would wipe every indexed book.

Related but distinct: a *per-entry* read error during the walk (commonly a
permission-denied subtree on a partially-readable mount) is warned and
**skipped**, not fatal - aborting the whole scan would be worse, but silently
dropping those books would let the prune step remove them.

### Reporting it to the console

The admin console shows a library whose root is unreachable as "Folder
unavailable", from two signals:

- **The last scan's outcome.** When a scan ends in `ErrLibraryUnavailable`,
  `Scan` sets `ScanProgress.Unavailable`, which
  [`GET /admin/libraries/{id}/scan`](api/reference.md#get-apiv1adminlibrariesidscan)
  reports as `unavailable: true` until a later scan finishes without it.
- **A live probe.** `Scanner.RootAvailable(lib, indexed)` backs the `available`
  field of [`GET /admin/libraries`](api/reference.md#get-apiv1adminlibraries).
  It is false when the last scan stopped at the guard, or when the root is
  missing, unreadable, not answering, or empty while `indexed > 0` books are
  still indexed under it. The probe (`rootProber`, `internal/library/roots.go`)
  opens the root and reads at most one entry; a hard-mounted dead share can
  block that for minutes, so a check never waits longer than
  `rootProbeTimeout` (2 s - an unanswered probe counts as unavailable), at most
  one probe per root runs at a time, and its answer is cached for
  `rootProbeTTL` (15 s). A probe already stuck past the timeout answers "not
  responding" immediately for every later check while it stays stuck, so a
  dead mount costs one timeout, not one per request. Every finished scan drops
  the cached answer so the next check looks again. `Scanner.RootsAvailable`
  fans the probes out in parallel for the list handler, so a dead share costs
  the whole list at most one timeout. The same list also carries each
  library's `ScanProgress` as `scan`, which is what the console polls.

`Scanner.ScanInBackground(ctx, lib)` is how every admin request that queues a
scan starts it (`POST …/scan`, creating or editing a library, setting or
clearing a folder override, the setup wizard - all through the API's
`startScan`). It marks the library running before it returns, so the first
status poll sees `running: true` even when a small library would otherwise
finish between the two requests, then runs `Scan` detached from the request:
bound to the server's lifetime (`ctx`, so shutdown cancels it), capped at an
hour, and logged if it fails. A call that coalesces into a scan already running
leaves that scan's progress alone.

:::note
Library roots must be **local paths** (mount remote shares first). The guard is
the safety net, not the design.
:::
