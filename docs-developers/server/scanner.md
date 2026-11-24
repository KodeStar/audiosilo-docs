---
title: "Filesystem view & scanner"
description: "How audiosilo-server turns a folder of audio files into a browsable, indexed catalog: the no-index filesystem view, the scan job queue, schedules and history, ignore rules, book detection and disc folders joined into one book, metadata and chapter extraction (and where community chapters take over), covers, move detection, read problems and suspect folders, and the unavailable-root guard."
---

`internal/library` contains two complementary subsystems:

- **`fsview.go`**, the instant filesystem view. `BrowseFS` lists a real
  directory with **no prior indexing**, which is what lets a client browse
  on its first connection without waiting for a scan (design priority #3).
- **`scanner.go`**, the background `Scanner`. It builds and maintains the
  index (`books`, `book_files`, `chapters` and `books_fts`) that the computed
  views, search and rich metadata come from. Around it sit:
  - the scan job queue and the scheduler (`jobs.go`, `schedule.go`);
  - per-library ignore rules (`ignore.go`);
  - what a scan notices for the console's Health page (`problems.go`).

The two meet in the API layer. Browsing works at once from the raw tree, and
the API overlays index metadata on the entries as the scan (or on-demand
indexing) catches up.

## Podcast libraries

`Scanner.Scan` branches on `libraries.kind` before book detection.

A kind this server doesn't know (`catalog.KnownKind`) is never scanned as
books. Such a kind belongs to a newer server and was left by a rollback. A
scheduled or startup scan job for one records no run and raises no
"scan failed" alert (`skipUnknownKind`): it logs one line per library, and the
schedule counts from the skip, so a rollback doesn't alert at every scheduled
scan and restart. A manual or settings-change scan, also one that joined a
waiting scheduled or startup job, still fails with `library.ErrUnknownKind`,
records a failed run and raises its alert, naming the cause. A targeted index
refuses any library that isn't `books` (`resolveBook`, `ErrNotIndexable`).

### Scanning a podcast library

A podcast scan lists the real, non-hidden top-level show directories. It reads
each show's `feed.json` (a regular file, up to 32 MiB, version 1) and indexes
its episodes, with or without audio files.

- A `feed.json` of an unsupported version is skipped and logged.
- An invalid episode entry is skipped on its own.
- The scan never probes audio for podcast metadata.
- Loose audio outside `feed.json` is not discovered as a book.
- None of the book steps run for this branch: no tag or path precedence, no
  Audiobookshelf import, no community enrichment, no book health analysis and
  no book move detection.

**The show signature** combines the feed's size and mtime with the listings of
the show folder and its `.audiosilo` folder, including the audio, CHAP and
publication journals. So the scan notices a change to those files even when
the feed's stat is unchanged. A refresh observes regular file presence, sizes,
artwork, barriers and matching CHAP, then updates the show and episode index
atomically.

An unchanged signature skips the show only while its episodes are still
indexed:

- A show with fewer `podcast_episodes` rows than its `feed.json` listed is
  indexed again (`PodcastEpisodeRows`). This covers a rollback: an older server
  run on the same database scans the library as books and drops the episode
  rows, while the show keeps its signature.
- A row counts only while its `indexed_at` (`0073`) equals its books row's. So
  a row that the older scan rewrote in place counts as missing too.
- Each podcast scan then deletes the books rows that are not episodes
  (`PruneNonEpisodeBooks`). These are what such a books scan left, for example
  a folder book at a show path.

A targeted `POST /bridge/rescan` forces that refresh for a show path, or for an
indexed episode path that belongs to a show. It returns
`{path:<show>, episodes:N}`. It refuses `attachments` mode and `from`, and a
path with nothing indexable gives `404 not_indexable`.

### Browsing and playing episodes

`BrowsePodcasts` serves `/fs` from the index:

- shows at the root, and episode titles inside a show;
- serial shows oldest first, episodic shows newest first;
- `feed.json` and artwork are never browse entries;
- private-show scope applies before pagination, and a granted library with no
  visible shows gives an empty listing.

`/item`, `/chapters` and `/stream` never index podcast audio on demand.
Episodes without files stay indexed and have empty chapter lists. A scoped
stream request shares a Bridge fetch and waits at most two seconds for a
committed file. Otherwise it returns a 503 with the fetch status (see
[On-demand play](../bridge/podcasts.md#on-demand-play-and-shared-intents)).

An episode's file counts as present only when all of these hold:

- its Fetch is valid;
- it is regular audio of its expected size;
- `deleted_at` is empty;
- there is no `<stem>.publish.json` barrier.

An invalid Fetch leaves an episode unready, and a symlinked or malformed
journal also blocks it. The server never adopts loose audio added by hand.
A present file uses Fetch's probed duration and codec. Otherwise the episode
takes the feed's duration (or zero) and a size of zero. `OpenPodcast` also
checks the current feed, identity and size, and that the opened file is the
named one. It keeps that descriptor through serving and transcoding, and does
not hash during requests.

### Episode chapters

`<show>/.audiosilo/<stem>.chapters.json` goes through
`metadata.ParseChapterList`. It must carry `from:id3_chap` and the current
Fetch timestamp, and its single basename, size and duration must match. The
scanner uses its times directly, without the book path's generated-chapter
filling or alignment.

- Usable CHAP sets `chapters_source:id3_chap`.
- Present audio without usable CHAP gets one whole-file chapter.
- Absent audio gets empty chapters and files.
- A bad sidecar is logged safely and the scanner falls back.

The scanner synthesizes a single-file episode's files from the Book row, with
no redundant `book_files` rows. Eviction clears the derived presence, files and
chapters but keeps the episode and its durable state. A full index rebuild
reconstructs them from the feed, the committed audio and CHAP.

### What survives

Follows, per-show retention policies and listening state are durable state.
They survive show pruning and index rebuilds.

- The unavailable-root guard keeps the index when the root is unreadable, or
  empty after it held shows.
- A partial scan does not prune.
- After a rename, the scanner locates the unique folder with the same `show_id`. Follows, settings
  and episode places move with it. Downloaded episodes appear on the next scan, others after the
  Bridge polls. A copy alongside its original leaves the state at the original.

See [Podcasts](../bridge/podcasts.md#files-on-disk-feedjson-v1) for the file
contract.

## The filesystem view (`BrowseFS`)

`library.BrowseFS(root, relPath, offset, limit, allow, ignore)` lists one directory:

- The path goes through `SafeJoin` first, the traversal and symlink gate (see
  [Auth & security](auth-and-security.md#path-traversal-librarysafejoin)).
- **Dotfiles are hidden**, and **non-audio files are filtered out**. Only
  directories and `metadata.IsAudio` files remain, so anything a client can
  click is either navigable or playable. `.jpg` and `.nfo` files never reach
  the UI.
- The optional `allow` callback filters entries **before pagination**, so pages
  stay full. For non-admin callers the API passes `Scope.VisibleInBrowse` here,
  which scopes the tree to their shares.
- Entries that the library's [ignore rules](#ignore-rules) cover are left out
  too (`Ignore.Covers`, also before pagination). The browse view never shows
  what the scanner skips.
- An `.mka` beside a file of the same name in another audio format is left out
  (`library.shadowedMKA`). `folderAudio` uses the same rule to keep it out of
  the book (see
  [Recognized audio](media.md#recognized-audio-metadataaudioextensions)). A
  lone `.mka` stays. `ListDir`, the listing behind `/next`'s folder fallback,
  applies the same rule.
- Directories sort before files, and each group sorts in **natural order**
  (`naturalLess`), so `2` lists before `10`. This is the order a folder book's
  files play in (see [Book detection](#book-detection-booksindir)). The order
  used to be by lowercased name, byte by byte.
- Pagination is plain offset-based (default 200, cap 500). That is fine here
  because a single directory is small. The catalog-wide listings must use
  keyset cursors instead.
- Only files get a per-entry `stat` (for `size` and `mod_time`). Directories
  skip it. On a network mount, that saved round trip per entry is the
  difference between an author listing that returns at once and one that takes
  several seconds.

### The hybrid view

The handler (`handleBrowseFS`, then `annotateWithBooks`) overlays index data on
the listing:

- Paths that match indexed books (via `catalog.BooksByPaths`) get
  `is_book: true` plus title, author, series, series index and duration.
- Each entry carries its effective folder-detection `override`, so the admin
  console's folder detection dialog can show and change it.
- For an **admin** caller only, a folder whose indexed books are the discs of a
  [disc set](#joined-books-disc-sets) not yet joined is marked
  `split_discs: true` (`catalog.SplitFolders`, from `books.split_parent`;
  `omitempty`). That is where the console offers the join. A member's listing
  never carries the key, so the player's wire is unchanged.

### Pending books

Last, for every caller, `library.MarkPendingBooks` marks `pending_book: true`
on each folder that a scan would read as a book but the index doesn't hold yet.
The rule and the wire shape are in the
[API reference](api/reference.md#get-apiv1librariesidfs).

`pendingBook` asks `resolveBook`'s questions from directory reads alone, in
this order:

1. Is there a `collection` override?
2. `hasAudio`: one read of the folder.
3. `joinRoot`, for a disc set under a `book` override. Only then does it walk
   with `audioDirs`, capped at 200 folders.

It skips:

- a folder the caller's scope doesn't `Allow`;
- a folder with an indexed book at or below it (`catalog.FoldersHoldingBooks`).
  This takes one query for the page and two index seeks per folder, so an
  indexed library's author and series folders cost no disk read. Such a folder
  that holds audio of its own stays unflagged until a scan indexes it;
- everything, once its 2-second budget (`pendingTime`) or the request's context
  runs out.

A failed read of the folder overrides or of the index (`BooksByPaths`,
`FoldersHoldingBooks`) marks nothing. The player opens such a folder as a
book, which [indexes it on demand](#on-demand-indexing-indexpath).

## When scans run

Every full scan goes through **one job queue** (`internal/library/jobs.go`).
A scan of a library runs when:

| Trigger | `trigger` value | Where |
|---|---|---|
| Server startup (every library, once) | `startup` | `Scanner.EnqueueAll` from `launcher.Run`, after `Scanner.Start` |
| The library's scan schedule says it's due | `schedule` | the scheduler goroutine (see [Scheduled scans](#scheduled-scans)) |
| Admin "Rescan" | `manual` | `POST /admin/libraries/{id}/scan` |
| A newly created library, including the one the console's first-run flow adds and the one an old-style `POST /setup` with library fields adds | `manual` | `POST /admin/libraries`, `POST /setup` |
| Admin "rescan every library" | `manual` | `POST /admin/scan` (`Scanner.EnqueueAll`) |
| A library's root or ignore rules changed | `change` | `handleUpdateLibrary` |
| A folder override set or cleared | `change` | `handleSetFolderOverride` / `handleDeleteFolderOverride` |
| A single path, on demand | - (not queued) | `Scanner.IndexPath` from any content handler, and `POST /admin/libraries/{id}/book/rescan` (see below) |

On a library edit, only a change to the **root** or the **ignore rules**
queues a scan. A rename, a new default view or a new schedule doesn't touch
the index, so `PATCH /admin/libraries/{id}` does not rescan for those.

### The job queue

`Scanner.Enqueue(lib, trigger, startedBy)` adds a job and returns it. One
worker goroutine (`Scanner.work`, started by `Scanner.Start`) runs the queued
jobs **one at a time, first in first out**. Scans therefore never compete for
the disk or for SQLite's single writer connection, and different libraries do
not scan in parallel.

- **Coalescing.** Asking for a library that already waits returns the waiting
  job. Asking for a library that is **running** queues it to run once more
  after the current scan, because a setting changed mid-scan and the running
  scan may have read the old one. The exception is a `schedule` or `startup`
  scan: a second pass would see nothing new, so those return the running job.
- **Queued state.** A library's `ScanProgress.Queued` is read from the queue
  itself, so it is true as soon as `Enqueue` returns. A status poll made right
  after the request sees the scan even if it has to wait.
  - When the worker starts the job, the library reads as `running`, and still
    `queued` when another pass is lined up.
  - It stays `running` until the run's `scan_runs` row is written. A poll that
    sees the scan finished therefore finds its history finished too.
- **Each job runs the library as it is now.** The worker re-reads the library
  row, so it honours a rename or a new root made since the job was queued, and
  it skips a library deleted meanwhile.
- **Cap.** A scan that someone or something asked for runs under a one-hour
  timeout (`scanTimeout`). A scan that hits it is recorded as `failed`. The
  **startup** scan has no time limit (`jobContext`). It is a library's full
  index after a restart, and it runs to the end as it always has. Every scan
  ends with the server.
- **Cancel.** `Scanner.Cancel(id)` drops a queued job, or cancels the running
  one's context. A cancelled scan stops during the folder walk or at its next
  book, and **never inside the prune**:
  - It checks for a cancel just before pruning.
  - Once begun, the prune runs to the end as one transaction, on a context that
    ignores the cancel.

  So a stopped scan has removed nothing, and one that pruned records what it
  removed. The run is recorded as `cancelled`. Dropping a queued **scheduled**
  scan skips that slot (see [Scheduled scans](#scheduled-scans)).
- **Deleting a library** cancels its scans (`Scanner.CancelLibrary`). Its queued
  jobs are dropped and a running one is stopped, so they don't hold the queue.
- **Hung roots don't block the queue.** Before discovery, the scan asks the
  bounded root probe, the 2-second check behind `available` (see
  [Reporting it to the console](#reporting-it-to-the-console)). A root that
  doesn't answer stops the scan at the
  [unavailable-root guard](#the-unavailable-root-guard). An example is a
  hard-mounted NFS share whose server is gone, where a plain `stat` can block
  for minutes. The run is recorded as `unavailable`, and the next job runs.
- **One at a time, by construction.** `Scan` itself does not coalesce
  concurrent calls for the same library. The queue is what guarantees that a
  library is never scanned twice at once.
- **Memory only.** The queue is not persisted. A job still waiting when the
  server stops is lost, and the startup scans and schedules cover that.

`GET /admin/jobs` returns the running job (with its library's progress), the
queue and every scheduled library's next scan. `DELETE /admin/jobs/{id}`
cancels a job (see the [API reference](api/reference.md#get-apiv1adminjobs)).

### Scan history (`scan_runs`)

The worker records every job it runs in `scan_runs` (`catalog/scanruns.go`).
It calls `StartScanRun` before the scan and `FinishScanRun` after. Both use a
context that outlives the server's, so a run is closed even during shutdown. A
row holds:

- the trigger;
- who started it (`started_by`, `NULL` for a schedule or startup);
- the start and finish times;
- a status, counts and a log.

| Status | Meaning |
|---|---|
| `running` | the scan has not finished |
| `ok` | finished, including the prune step |
| `partial` | finished, but part of the tree couldn't be read, so pruning was skipped |
| `unavailable` | stopped at the [unavailable-root guard](#the-unavailable-root-guard); nothing pruned |
| `failed` | an error (including the one-hour cap); nothing pruned |
| `cancelled` | an admin stopped it; nothing pruned |
| `interrupted` | the server stopped mid-scan. `Scanner.Start` marks every run still open at startup this way (`InterruptScanRuns`) |

#### Counts

| Count | What it counts |
|---|---|
| `books` | books discovered on disk |
| `added`, `updated`, `moved`, `removed` | books in each state |
| `errors` | books whose files had a [read problem](#read-problems), plus index writes that failed |

- A moved or renamed book counts **once**, as `moved`. It does not also count
  as added at its new path or removed at its old one.
- A [joined book](#joined-books-disc-sets) and the discs it splits back into
  are reshapes of books the library had. Neither counts as `added`, so no
  "books added" notification follows. Neither the joined discs nor the
  split-up book count as `removed`.
- A first scan counts a book split across disc folders once in `added`, and
  once among the titles it names, not once per disc.

`ScanProgress` carries the same counters live (`added`, `updated`, `moved`,
`removed`). Its `indexed` is `added + updated`.

#### The log

The **log** is a JSON array of `catalog.RunEvent`. Each event has `at`, a
`level` (`info`, `warn` or `error`), a `kind`, and whichever of `path`, `to`,
`code`, `detail` and `count` the kind needs. The kinds are `started`,
`discovered`, `error`, `partial`, `truncated` (see [Bounds](#bounds)) and
these:

| Kind | Meaning |
|---|---|
| `unreadable` | a path that discovery couldn't read, or a folder it skipped because the folder or one of its audio files didn't answer ([A folder that does not answer](#a-folder-that-does-not-answer)) |
| `moved` | a book moved from `path` to `to` |
| `joined` | a disc book at `path` whose state was carried into the joined book at `to`. Code `length_unknown` when its listening state stayed on its own path ([Joined books](#joined-books-disc-sets)) |
| `split` | a joined book at `path` read as its discs again |
| `problem` | a read problem, with its `code` |
| `removed` | one per pruned path |

The job then adds one closing event from the run's status (`closingEvent`):
`finished`, `unavailable`, `failed`, `cancelled` or `interrupted`. The console
words each kind itself. `detail` is the tool's or the OS's own message, shown
as is.

#### Bounds

Two bounds keep the table small:

- **A log holds at most 300 events** (`maxRunEvents`). Past that, the scanner
  counts events, and one `truncated` line before the closing event says how
  many were dropped. Problems (`unreadable`, `problem`, `error`) may take at
  most half of the log (`maxProblemEvents`). So a library full of unreadable
  files can't crowd out the moves and removed paths logged after them. The
  problems are on the books too, while the removed paths are recorded nowhere
  else.
- **Only the newest 100 runs per library are kept** (`maxScanRunsPerLibrary`,
  trimmed by `FinishScanRun`).

Runs belong to their library and cascade with it.

### Scheduled scans

A library's `scan_schedule` (`library/schedule.go`, `ParseSchedule`) is one of:

| Value | Meaning |
|---|---|
| `""` | no scheduled scans (the default) |
| `every:<N>h` | N hours after the library's last scan **started**; N is one of 1, 3, 6, 12, 24 |
| `daily:HH:MM` | every day at that time, in the **server's** time zone |

When a library is saved, any other value is refused with `400`
`code: "invalid_schedule"`. A valid schedule is stored in canonical form
(`Schedule.String`), so `every:06h` is saved as `every:6h`, which is what the
console reads.

"The last scan" is the library's newest `scan_runs` row, whatever started it
(`LastScanStarts`).

- A manual rescan therefore pushes an interval schedule back.
- A server that was off when a daily scan was due runs it as soon as it is
  back.
- A library never scanned counts from when the scheduler started.
- A scheduled scan dropped without a run of its own counts as a scan start too
  (`jobQueue.skipped`). It was either cancelled while it waited or folded into
  a scan of the library already running. The scheduler then skips that slot
  instead of queuing it again a minute later.

`Scanner.NextScans` computes every scheduled library's next due time. It backs
`next_scan_at` on `GET /admin/libraries` and the `schedules` list of
`GET /admin/jobs`. The scheduler checks once a minute (`scheduleTick`) and
enqueues the due libraries with trigger `schedule`.

## Anatomy of a scan pass

```mermaid
flowchart TD
    A["Signatures(lib)<br/>stored mtime/size/duration/codec/cover per rel_path"] --> B{"root probe answers (2 s)<br/>and os.Stat: exists & is dir?"}
    B -- no --> U1["ErrLibraryUnavailable<br/>(abort, no prune)"]
    B -- yes --> C["FolderOverrides(lib)"]
    C --> D["discoverAuto: walkDir the tree, folders listed up to 8 at once<br/>collect dirs that directly contain audio<br/>(skip ignored paths; log + skip unreadable entries),<br/>then statAudio: their files' lstat, up to 8 at once"]
    D --> E["booksInDir per dir<br/>(detection model + overrides)"]
    E --> F{"0 books found, index non-empty,<br/>and not all ignored?"}
    F -- yes --> U2["ErrLibraryUnavailable<br/>(abort, no prune)"]
    F -- no --> G["detectMoves<br/>fingerprint-match vanished → new paths,<br/>MoveDurableState (logged)"]
    G --> H{"per book:<br/>mtime+size unchanged<br/>and probe data present?"}
    H -- "yes (skip; backfill has_cover /<br/>suspect_parts if unset)" --> H
    H -- no --> I["enrich: path heuristic + tags + probe<br/>(in-process, ffprobe the fallback),<br/>chapters, cover, fingerprint,<br/>read problems, suspect parts"]
    I --> J["catalog.UpsertBooks (up to 64 books a tx,<br/>a savepoint each): scanned values + files + chapters,<br/>then enrichment + overrides layered on, FTS"]
    J --> H
    H -- done --> HC["SetHasCover + SetSuspectParts<br/>noted backfills, one tx each"]
    HC --> P{"discovery saw<br/>the whole tree?"}
    P -- no --> PP["skip prune (status partial)"]
    P -- yes --> JC["carryJoinedState<br/>disc books' state onto a joined book<br/>(each disc logged as joined)"]
    JC --> K["DeleteBooksNotIn (one tx, not cancellable)<br/>prune vanished paths (+ FTS rows),<br/>each path logged (removed or split)"]
    K --> M["result: counts + log<br/>(the job records them in scan_runs)"]
    PP --> M
```

### The unchanged-skip

A book is skipped when its stored mtime and size match **and** one of these
holds:

- ffprobe is disabled;
- a prior probe already stored both a duration and a codec.

The second clause is a backfill mechanism. Books indexed before the `codec`
column existed (migration `0008`) are probed again once, even though their
files haven't changed.

One more book passes the skip: a book with one audio file whose recorded
`unreadable` or `probe_failed` [read problem](#read-problems) names that file
(`soleFileProblem`; an `empty_file` problem doesn't count). Its only file was
never probed, so it has no duration or codec. `problemCleared` decides whether
to read it. While the problem is still there, the scan keeps the book like any
unchanged one, and still reads the metadata files beside it.

### Backfills for a skipped book

A skipped book can still get cheap backfills, each for rows indexed before a
given migration:

- **Embedded cover** (`has_cover` unset, a row indexed before migration
  `0016`). The scan checks the primary file for embedded art with a tag read
  (`media.EmbeddedCover`, no ffprobe) and notes the answer without re-indexing
  the book.
  - Only books that are really skipped are checked. A book re-indexed anyway
    gets its flag from the upsert.
  - A file that can't be opened right now (a flaky mount) is skipped. The flag
    stays unset for the next scan, rather than recording "no cover".
  - The noted flags are written in **one transaction** after the loop
    (`catalog.SetHasCover(ctx, libID, map[path]bool)`, which also counts a
    sibling `cover_path` as art). The first scan after the upgrade therefore
    stays cheap on a large library.
- **Several books in one folder** (a folder book indexed before migration
  `0017`). The same kind of tag-only check looks for
  [several books in one folder](#folders-that-may-hold-several-books)
  (`suspectFromTags`, written by `catalog.SetSuspectParts`).
- **Genres** (a book indexed before migration `0049`,
  `books.genres_checked = 0`). The scan reads the genre tag in the same one
  read of the primary file (tags and ffprobe) that the `0037` date backfill
  makes. `catalog.SetGenres` writes the genres into the book's scanned snapshot,
  flushed with the path readings. It re-resolves the book only when that
  changes it, since most books have no genre or only a placeholder.
- **Tag hints** (a book indexed before migration `0067`,
  `books.hints_checked = 0`). The scan reads its
  [tag hints](data-model.md#tag-hints) the same way (`catalog.SetTagHints`).
  It waits while ffprobe fails on the book, unless the book's last index
  already recorded that failure (`probe_failed`). Then it takes what the tags
  give.

Two failures cause the scanner to record the book's `indexed_at` in
`books.tag_read_failed_at`.

- While filling in names or tag hints, ffprobe rejects the primary file
  (`metadata.ErrProbeRejected`) and the last index had no `probe_failed`
  problem. A rejection means invalid data or a format outside the server's list.
- While checking a multi-file title, the scanner needs the last file's tags but
  cannot open that file. It keeps the stored title.

Later scans skip the name and tag-hint checks, even after a restart, until a
file change or **Read the files again** re-indexes the book. A stopped read,
a timeout, other ffprobe errors and a frame count cut short (`uncountedForNow`)
leave the check pending for the next scan.

#### Audiobookshelf `metadata.json`

A skipped folder book also has its **Audiobookshelf `metadata.json`** read
again when the file is new, changed or gone. ABS rewrites the file without
touching the audio, so the book's own signature can't tell.

- Discovery records the file's size, mtime and reader revision
  (`metadata.ABSSignature`) during the directory walk. A new reader revision
  reads each existing file once more (see
  [The first scan after updating](#the-first-scan-after-updating)).
- `catalog.SetABSFiles` reads and writes a skipped book, in batches of 250
  beside the path backfill, when:
  - its signature differs from the stored one (`Signature.ABSSig`); or
  - it has a file not read for this index of the row (`ABSUnchecked`).
    `abs_indexed_at` is `NULL` after migration 0046, or an older server
    re-indexed the row.
- Migration 0049 sets every `abs_indexed_at` to `NULL` again. The first scan
  after it therefore reads each file once more for the fields the server now
  takes: subtitle, publisher, language, abridged, genres and tags.
- A book with no file, and none before, is left unwritten. The first scan
  after the upgrade touches only books that have one.
- A book is re-resolved unless its reading equals the one recorded for this
  very index. (An older server's re-index resolved the row without the file.)

A re-indexed book reads the file in `enrich` (`Scanner.readABS`) only when the
walk found one. An on-demand index has no walk, so it stats the file first
(`absSigAt`). The scanner reads the file only when it is a regular file, and
never through a link, including one swapped in after the walk.

- A file that can't be used (not JSON, too large, not a regular file) keeps its
  signature, so it isn't read again until it changes.
- A file that can't be looked at or read right now (a flaky mount) is left as
  it was, for a skipped book and for a re-index alike: the row
  keeps its stored signature with no `abs_indexed_at` (`ABSReading.Unread`), so
  the book keeps its ABS values rather than losing them for one scan, and the
  next scan reads the file again. An entry whose lstat fails during the walk is
  stat'ed once more (`absEntrySig`).

Both cases log a warning. What the file means for a book's metadata is in
[Data model](data-model.md#metadata-overrides-and-effective-values).

#### Attachments

A skipped book's **`.audiosilo/` attachments** (the Bridge's generated
characters and recaps) are backfilled the same way, from the same walk (see
[The Bridge's attachments](#the-bridges-attachments)).

### Reading several files at once

A scan reads the books it has to index (new, changed, or missing probe data)
several files at a time, and writes the index in one place
(`library/scanread.go`):

- **Slots.** `readSlots` bounds how many audio files are read at once. Each
  read holds a slot: tags and the [in-process probe](#the-in-process-probe),
  then ffprobe for a file the probe leaves to it (`metadata.ExtractTimeout`).
  There are `scan.concurrency` slots, by default one per CPU up to
  `DefaultScanReaders` (8). See
  [Configuration](configuration.md#library-scans-scan).
- **Books read ahead.** Each book to index is read (`enrich`) on its own
  goroutine: its primary file first, then its other parts with the slots
  (`readFiles`). Reads run up to a window of twice as many books as slots ahead
  of the next book written.
- **One writer, in order.** The scan's own goroutine writes each book once its
  read is done, in discovery order (`writeNext`), on the one writer
  connection. The rows, their ids, the file order, the chapter offsets and the
  scan's log come out exactly as a scan reading one file at a time would write
  them.
- **Several books a transaction.** The books read wait in a batch, and
  `catalog.UpsertBooks` writes them together. A transaction's begin and commit
  cost about as much as a book's own writes: 0.6 of 1.5 ms a book on a
  synthetic library, 1.3 of 3.9 ms on a real one.
  - *When a batch is written.* A batch is written once it holds `writeBatch`
    (64) books, once the first book has waited `writeBatchAge` (250 ms), when
    the writer would otherwise wait on a read, or when the scan ends or stops.
    The writer never waits on a read while holding books. So a scan whose
    reads are slower than its writes (ffprobe on every file) still writes each
    book as its read is done.
  - *How long it holds the writer.* The same 250 ms is `UpsertBooks`' budget.
    A transaction takes another book only while it has run for less than that.
    A batch therefore holds the writer, and every other write (a listener's
    progress among them), no longer than that plus one book.
  - *A failure.* Each book is written under its own savepoint. One that fails
    is rolled back alone and logged, while the rest of the batch is written. A
    transaction that fails as a whole (its commit, say) has its books written
    again one at a time (`UpsertBook`).
- **Stopping.** A Stop, or the scan's time limit, ends the in-process probes
  and the ffprobe runs through the scan's context.
  - The scan waits for the reads under way and drops them, because a read cut
    short would record a false [read problem](#read-problems). It also drops a
    finished read that the writer had not yet taken into the batch.
  - From 2.7.0 it waits for a read still under way (held in a call nothing
    bounds, on a share that stopped answering) for at most 2 s (`stopGrace`),
    then leaves it to end on its own, its book's flight with it. The read is
    counted in `Scanner.readsLeft` and logged, so the scan ends and the next one
    runs. No later read waits on that flight (`errReadLeft`): a later scan keeps
    the book as stored with an `unreadable` problem and scans the rest, and an
    on-demand read (Re-read, a move, a share) answers `503 share_not_answering`.
  - It writes the books already in the batch, whose reads finished before the
    Stop.
  - It reads nothing more, and keeps the backfills read so far.
- **On-demand indexing** ([`IndexPath`](#on-demand-indexing-indexpath)) reads
  with one slot, a file at a time, on a goroutine of the book's shared read.
- **Backfills.** The skipped books' cheap backfills (above) still run one at a
  time on the writing goroutine, outside the slots. The re-read of a recorded
  problem's file (`problemCleared`) runs on that goroutine too, but through a
  slot and under the scan's context, as `enrich`'s reads do. A read the scan
  stopped counts as the problem still there, and the scan ends at its next
  check.

Every tag read goes through `metadata.ReadTags` (`tagreader.go`, used by
`Extract` and `media.EmbeddedCover`). There, `dhowden/tag` reads an ID3v2 tag
through a buffer up to the tag's end, not with one read system call per byte.
That difference counts on a spinning disk or a network share.

### A rescan that finds nothing changed

Most scans find most books unchanged. The scan then spends most of its time
waiting on the filesystem: a folder listing, and an `lstat` per audio file. On
a local disk each call is cheap. On a network share or a FUSE pool (Unraid's
`/mnt/user`) each one is a round trip. So discovery makes these calls several
at once and skips what an unchanged book doesn't need:

- **Folders listed ahead.** `walkDir` (`library/walk.go`) calls its function on
  the same paths, in the same order and with the same errors as
  `filepath.WalkDir`. The difference is that it lists the folders a folder
  holds together, up to `walkIO` (8) at a time, before it goes into the first
  of them.
  - Hidden and ignored folders are never listed (the walk's `descend` check).
  - A capped walk (a setup preview, a folder listing's disc-set check) still
    lists each folder as it reaches it, since it may stop at any folder.
- **Files looked at together.** `statAudio` then reads every audio file's
  `lstat`, 8 at a time, ahead of `booksOf`. The size and mtime are all the
  unchanged-skip needs. A file the walk listed but that is gone by then means
  the tree changed under the walk. The scan logs "audio files gone during
  discovery" and counts as [partial](#scan-history-scan_runs), so it doesn't
  prune a book that the next scan finds moved.
- **The width.** Both use `Scanner.walkWidth`: `walkIO`, or `scan.concurrency`
  when that is set lower. A value of 1 lists each folder as the walk reaches
  it. A higher `scan.concurrency` doesn't raise the width, because these calls
  wait on round trips, not CPUs.
- **`added_at` only for a new book, from discovery's `lstat`.** `added_at` is
  set when a book is first indexed and never updated. `enrich` stamps it only
  for a book the index doesn't hold yet (`stampAddedAt`: the earliest
  `addedAt` of the book's audio files). A re-indexed book keeps its row's
  value, so the scan sets a placeholder for it and reads none of its files'
  birth times.

  The new book's files get no second `lstat`. `statAudio` keeps what each
  file's `lstat` already told (`Book.FoundAdded`, from `statEntry.found`). How
  the birth time is read depends on the platform:

  | Platform | Birth time |
  |---|---|
  | Darwin | carried by the `lstat`, so a file costs no system call at all |
  | Linux | the stat struct has no birth time, so one `statx` per file reads it. The walk's mtime stands in where the filesystem records none |
  | Any other | the walk's mtime, with no system call |

  A file that `statx` finds gone is left to an `lstat` of its own. A no-change
  scan makes no `statx`.
- **A damaged file isn't probed again.** Without this, `problemCleared` would
  run ffprobe on a `probe_failed` book's file on every scan.
  - When ffprobe rejects a file's data (`metadata.ErrProbeRejected`: its last
    stderr line ends in ffmpeg's "Invalid data found when processing input"),
    the scanner remembers the file's absolute path with its mtime and size
    (`noteRejected`). `problemCleared` doesn't run ffprobe on the file again
    while both are as they were.
  - A time-out, an exec failure or a read error is never remembered, because
    those may pass. Any other reading of the file forgets it.
  - The memory lasts for the server process only, so a restart (perhaps with
    another ffprobe) looks again. The console's Read again
    (`POST /admin/libraries/{id}/book/rescan`, through `IndexPath`) always
    reads the file.

Together these changes took a no-change rescan of a 1,000-book library on an
emulated FUSE mount from about 1.0 s to about 0.55 s. Its filesystem calls on
library paths fell from about 20,000 to about 10,600, with no `statx` left. The
index written is the same.

### Prune: what a removed book leaves behind

When discovery saw the whole tree, `catalog.DeleteBooksNotIn` drops every book
row whose path wasn't found, with its files, chapters and FTS row, in **one
transaction**. It returns the paths, minus the ones a detected move carried
away (those are logged as moves). The scan writes the paths to its log as
`removed` events. That log line is **all** that remains in the index. There is
no "missing" flag and no ghost row kept for the book, for these reasons:

- The index is a rebuildable cache of the disk (see
  [Data model](data-model.md#the-two-halves-rebuildable-index-vs-durable-state)),
  so a book that isn't on disk isn't in it.
- Nothing worth keeping is lost. Everyone's progress, bookmarks and notes, and
  the admin's edits, cover, enrichment and ignored issues are path-keyed rows
  with no foreign key to `books`, so pruning a book doesn't touch them. If the
  files come back at the same path, the next scan indexes the book and all of
  it reappears. A book that moved is carried to its new path before the prune
  (`detectMoves`, above).
- The log answers "where did that book go?" for the 100 newest scans of each
  library, without the player APIs ever showing a book that can't be played.

The scan skips pruning entirely when it can't trust what it saw: after an
unreadable subtree (`partial`), at the unavailable-root guard, after an error,
or on a cancel (see [Scan history](#scan-history-scan_runs)).

### Enrichment and admin edits survive every upsert

There is no separate "re-apply" step after a scan. In **one transaction**,
`catalog.UpsertBook`:

1. writes the values the scan found, and records them in `books.scanned`
   (field to value);
2. replaces the file rows and records the scan's chapter list;
3. in `catalog.refreshBook`, applies any path-keyed `book_enrichment` (ASIN,
   ISBN) and admin metadata overrides;
4. then, there too, selects the effective chapters, applies chapter-title
   overrides and refreshes the FTS row.

So an attached ASIN survives a rebuild, and an edited field acts as a lock. The
rescan re-reads the file, but the edit is applied again before the transaction
commits. The server never writes files on disk. See
[Data model](data-model.md#metadata-overrides-and-effective-values).

## Book detection (`booksInDir`)

There is no per-library layout setting. The model matches the dominant
"folder per book" convention, which Audiobookshelf also uses:

- **A directory that directly contains audio is ONE book**, with all those
  files as its ordered tracks. That holds whether it contains a single `.m4b`
  or fifty distinctly-named `.mp3` chapters.
  - Audio is what `metadata.AudioExtensions` lists
    ([Media](media.md#recognized-audio-metadataaudioextensions)). `.mka` is
    included from 2.4.0.
  - `folderAudio` leaves out an `.mka` beside a file of the same name in
    another audio format, as that file's source or copy.
  - Do **not** split a folder's files into separate books by filename. That
    heuristic produced one phantom book per chapter file.
- The single exception is the **library root**. Loose audio files directly in
  the root have no enclosing book folder, so each is its own single-file book.
- A folder of loose single-file books is expressed with a **per-folder
  override**. `folder_overrides.mode = 'collection'` forces one book per file,
  and `'book'` forces the folder to be one book (at the root, for example).
  Overrides are durable, path-keyed config that the scanner consults before the
  heuristic. They are set with
  `PUT/DELETE /admin/libraries/{id}/folder-override?path=` (which rescans),
  from the admin console's folder detection dialog.

### File order

`folderBook` takes its parts in **natural name order** (`sortFileOrder`, from
2.4.0). The comparison is `naturalLess`, a copy of audiosilo-meta's
`scan.NaturalLess`, and `TestNaturalLessIsMetas` holds it to the original. The
copy matters because the Bridge and the community metadata number a book's
files, and so its sidecars' chapters, in that order.

- Digit runs compare by value: `2- Part` before `10- Part`, and `02` level with
  `2`.
- The rest compares byte by byte with case folded, so `01 - Prologue` plays
  before `01a - Interlude`.
- Names that are equal that way fall back to their bytes.

`audioEntries` and the discovery walk (`audioDirs`) both sort this way.
`folderBook` sums the sizes and takes the max mtime. Its `added_at` is the
**earliest** file's. `enrich` reads it later (`stampAddedAt`), and only for a
book indexed for the first time (see
[A rescan that finds nothing changed](#a-rescan-that-finds-nothing-changed)).

:::note[Behaviour change in 2.4.0]
Before 2.4.0 a folder book's files played in byte order (`os.ReadDir`'s), so
`10-` played before `2-`.

- The next scan re-indexes a book stored in byte order although no file
  changed. Its `Signature.FileOrder` (`catalog.FileOrderKey`, an FNV-64a of the
  stored file paths in order) differs from the new order's.
- Nothing remaps a listener's place, so a whole-book position on such a book
  can land elsewhere in the story. An offline copy plays the order it was
  downloaded in until it is next started online. Then it takes the new order
  and chapters (the player's `adoptStartedChapters`).
- Move detection still finds such a book by trying the file byte order first
  (`byteFirstFingerprint`, in `detectMoves` and `IndexMoved`).
- A Bridge `chapters.json` made while the book played in byte order still
  applies, with its chapters moved with their files (`movedChapters`, see
  [Generated chapters](community-chapters.md#generated-chapters)).
:::

**The stored order key** (migration `0055`). The key is kept on the row in
`books.file_order`: `catalog.FileOrderKey` bit-cast to a signed integer, or
`NULL` for a single-file book. `UpsertBook` writes it, with the upsert's
`indexed_at` in `file_order_indexed_at`.

- `catalog.Signatures` reads the key, so a scan of unchanged books reads no
  `book_files` rows.
- It falls back to the `group_concat` of a book's `book_files` only for a
  folder book whose key is not recorded (`fileOrderExpr` is `NULL`,
  `Signature.FileOrderUnset`). That is a book indexed before `0055`, or one an
  older server has re-indexed since. Such a book's `indexed_at` no longer
  matches `file_order_indexed_at`, and its files are in that server's order.
- A scan that finds such a book unchanged records the key without re-indexing
  it (`catalog.SetFileOrders`, in `flushBackfills`). An upgrade therefore costs
  one `book_files` read per folder book, once.
- A book whose stored order differs from the natural one is still re-indexed,
  as above.

`addedAt` is the file's birth (creation) time where the OS records it
(`birthtime_darwin.go`, `birthtime_linux.go`), and otherwise its mtime. A birth
time of 0 or before 1980 counts as none (`birthKnown`), so the mtime stands in.
macOS answers 0 for a file on an rclone NFS share, which would otherwise date
the book 1970. That
gives "recently added" a stable chronological key that survives re-indexing. A
book none of whose files can be looked at by then (gone since discovery) is
stamped with the current time, as first seen.

Discovery (`discoverAuto`) walks the tree once (`audioDirs`, which reads each
folder's audio files in the same walk). It hands the folders to `booksOf`,
which calls `booksInDir` per folder, except for the disc folders of a joined
book (below).

### Joined books (disc sets)

A CD rip (`Book/CD1`, `Book/CD2`, with the tracks in each and none in `Book`)
reads as one book per disc under the folder-per-book rule. A `book` override on
the folder holding them joins them (`library/joined.go`), but **only** when
that folder is a **disc set** (`discSets`). A disc set is a folder that:

- is below the root and has no audio of its own;
- has every folder holding audio beneath it as a disc folder **directly** in
  it (`isDiscFolder`: `cd`, `disc` or `disk` plus a number, ignoring spaces,
  hyphens, dots and underscores);
- has at least two of them (`minDiscs`), because one disc already reads as one
  book.

Discovery and `IndexPath` decide a join in one place, `joinRoot`: the folder,
or the one holding it, with `book` and a disc set.

- **Any other folder** keeps `book`'s old meaning: its own files are the book,
  and without any it is a no-op. Overrides that the old detection dialog set on
  author or series folders must never merge a series (or its listeners'
  progress) on upgrade. Nothing is joined automatically, because re-shaping
  existing books would orphan their progress.
- **The joined book** (`joinedBook`) is a folder book at the folder's path,
  with the discs' audio as its files. Hidden files and the ignore rules apply
  as usual.
  - `metadata.DiscOrder` sorts disc folder names in natural order, so `CD2`
    precedes `CD10`. If names compare equally, as `CD 1` and `CD1` do, the
    exact path bytes break the tie.
  - Each disc's files keep exactly the order a book of that disc alone has
    (natural name order, `sortFileOrder`, above), since the state carry-over
    maps a disc position as offset plus position.
  - Files and chapters keep their real paths in the disc folders
    (`file_path`).
  - A part with no chapters of its own is titled with its disc first
    (`joinedPartTitle`: `CD2 - 01`).
  - The cover is the folder's own image, then the first disc's.
- **Resolving.** `IndexPath` resolves the folder, a disc folder or a file in
  one to the joined book, and so does `bookForPath` from the index (see
  [On-demand indexing](#on-demand-indexing-indexpath)).

#### Carrying state

The scan where a join takes effect runs `carryJoinedState` before the prune.
For each folder with a `book` override whose joined book reads files from its
subfolders (`isJoined`), it passes the disc books that vanished to
`catalog.JoinDurableState`. `joinParts` places them on the joined timeline.

- **Listening state moves**, through `carryListeningState`, the one list of
  per-user tables, shared with moves:
  - Progress: the furthest position per listener wins (`mergeFurthest`). A
    finished disc counts as its end, and the joined book is finished only when
    the last disc is.
  - Bookmarks, notes, history and sessions are offset by the disc's start.
  - Daily roll-ups are re-keyed.
  - A favourite lands once.
  - Queue entries, collection entries and ratings move to the joined book.
    Where the joined book already has one, the queue and collection keep that
    entry and its position, and the newer rating wins.
- **The disc books' own config is copied**, not moved:
  - `book_overrides`, `book_covers` and `book_enrichment`, field by field, with
    the earliest disc winning. ASIN and ISBN are each filled only where the
    joined book has none.
  - Chapter renames are re-keyed to the file under the joined folder.
  - Ignored Health issues stay with the discs.
  - The joined book's effective metadata is refreshed in the same transaction.
- **A disc's offset** is the length of the discs before it, from their files'
  lengths, else the disc's indexed length. It is **known** only when every
  earlier length is known (the first disc's, 0, always is). With ffprobe off or
  failing, a later disc is `Unplaced`:
  - its listening state stays on its own path (path-keyed, and there again if
    the join is undone) rather than landing in disc 1;
  - its config is still copied;
  - its `joined` event carries code `length_unknown`.
- **If carrying fails**, the scan keeps the discs from the prune and the next
  scan tries again. Nothing is lost either way.

Each disc is logged `joined`, not `removed`, and the joined book is not
counted as added (`joinsIndexed`).

**Removing the override** splits the discs out again (`Scanner.splitFrom`, the
`joinsIndexed` counterpart):

- the discs aren't counted as added;
- the joined book is logged `split` rather than `removed`;
- its state stays on the folder's path for a later re-join, because a disc's
  own position can't be told from the joined book's.

A folder book with audio of its own that goes is still `removed`.
`detectMoves` doesn't pair a joined book renamed away from its override with
its first disc (`reclassified`).

#### Marking split books

During discovery, `markSplitDiscs` sets `Book.SplitParent`
(`books.split_parent`, migration `0022`) on each folder book whose folder is a
disc set not joined. It uses the same `discSets` predicate as the join, so the
fix for the [`split_discs` issue](#issues) always joins. `IndexPath` works it
out the same way from the folder's subtree (`splitParentOf`).

`UpsertBook` stores it. An unchanged book whose value differs gets it through
`catalog.SetSplitParent` without a re-index. That happens when a sibling disc
came or went, or for a row from before `0022`.

## Ignore rules

Each library can list files and folders that the scanner skips
(`library/ignore.go`): sample clips, an `Extras` folder, a podcast feed someone
dropped in. The rules live in the database (`libraries.ignore_patterns`, one
pattern per line), **not** in a file inside the library. The server never
writes to the library folder, which may be mounted read-only.

The syntax is a small subset of `.gitignore`:

- One pattern per line. Blank lines are dropped. Lines starting with `#` are
  comments, and they are kept, so an admin's notes survive a save.
- A pattern **without** a `/` matches a file or folder **name at any depth**
  (`*.sample.mp3`, `Extras`).
- A pattern with a `/` **anywhere but at the end** is matched against the whole
  path from the library root (`Podcasts/*`). A leading `/` counts, so `/Extras`
  is only the root's `Extras`.
- A **trailing** `/` limits the pattern to folders (`Extras/`). It doesn't
  anchor it, so `Extras/` matches a folder named `Extras` anywhere.
- Wildcards are `path.Match`'s (`*`, `?`, `[...]`), and matching **ignores
  case**. An ignored folder is skipped with everything under it.
- At most **100** patterns of at most **200** bytes each.

`NormalizeIgnore` validates a list when a library is saved. It splits entries
on line breaks first, because the column stores one pattern per line. An entry
holding several lines is therefore several patterns, and each is validated.
It refuses, with `400` and `code: "invalid_pattern"` naming the line:

- too many patterns;
- a pattern that is too long;
- a pattern that matches nothing, such as `/`;
- a malformed wildcard.

`ParseIgnore` builds the matcher. It silently skips any stored line it couldn't
use, so a bad row can never stop a scan. The same rules apply in three places:

1. **The scan.** `discoverAuto` doesn't descend into an ignored folder and
   skips ignored files. `audioEntries` leaves ignored files out of a folder
   book's parts.
2. **The browse view.** `BrowseFS` hides covered entries (see
   [The filesystem view](#the-filesystem-view-browsefs)).
3. **On-demand indexing.** `IndexPath` refuses a covered path with
   `ErrNotIndexable`. `Ignore.Covers` checks the path and every folder above
   it.

Changing a library's ignore rules queues a rescan (trigger `change`). The
rescan prunes the books the new rules now skip and indexes the ones they no
longer skip. If the rules now cover **every** indexed book, the scan discovers
nothing. The [unavailable-root guard](#the-unavailable-root-guard) would read
that as an unmounted share, so it makes an exception (`ignoresAll`), and the
scan prunes the books as the admin asked.

## Metadata extraction

`Scanner.enrich` fills a discovered book in three layers, cheapest first.
Embedded data wins where it is trustworthy.

### 1. Structural path parsing

`metadata.DeriveFromPath` gives the baseline. The book's own name (the filename
minus its extension, or the folder name) yields the title and a leading series
index.

`splitSeriesIndex` parses:

- `01 - Unsouled`, `Book 3 - …` and `C02 …`;
- a decimal part, so `02.5 - Gods of Risk` gives 2.5. That needs a dot with
  digits after it, so `7. Title` keeps 7.

It does not parse a number that runs straight into a letter, a comma or an
apostrophe. `3rd Rock`, `20,000 Leagues Under the Sea` and `1's and 0's` keep
their whole name as the title.

The ancestors give the series and author:

- The nearest ancestor directory is the series, and the one above it the author
  (`Author/Series/01 - Title.m4b`).
- A lone ancestor is the author with no series (`Author/Title/`, the commonest
  layout). `ReadPathLayout` reads it the same way.
- A book at the library root has no ancestors, so the old "flat" layout needs
  no special case.
- One leaf name wins over the folders. `Author; Series; Book NN[; Title]`
  states its own title, series and position, and a disc folder directly inside
  it reads the same (see
  [A leaf that states its series](#a-leaf-that-states-its-series)).

A lone ancestor used to be read as the series. The next scan puts right a
snapshot from then (no `@rev`, see
[Data model](data-model.md#the-rebuildable-index)) without a re-index. It uses
the snapshot alone where that tells, else one read of the first file's tags, as
the `released_checked` backfill reads them.

### 2. Embedded tags and the probe

`metadata.Extract` runs on the primary file (the first part, for folder books)
and overlays the baseline. It reads tags in-process with `dhowden/tag`, then
runs the probe.

**Tags.**

- **Title.** The album wins over the title (`metadata.bookTitle`). The
  exceptions:
  - The title tag extends the album with a real subtitle. This is the Audible
    shape, where the album holds the *series* and only the title tag carries
    the actual book title. In a book of several files that tag is the first
    file's, and its tail may name that file instead (see
    [A book of several files' title](#a-book-of-several-files-title)).
  - The album only names the book's series (see
    [An album that is only the series](#an-album-that-is-only-the-series)).
- **Author.** The album-artist wins over the artist.
- **Narrator.** A narrator tag wins over the composer (see
  [The narrator](#the-narrator)).
- **Series.** Raw-tag lookups read the series atoms (see
  [A series tag with a position](#a-series-tag-with-a-position)).
- **Release date.** Raw-tag lookups read MP4 `©day`, ID3 `TDRC`/`TYER` and
  Vorbis `date`. `metadata.ReleaseDate` stores the result in `books.released`,
  never in `published`.
- **Genre.** `metadata.SplitGenres` reads the genre tag into the scanned
  `genres`:
  - it splits on `;` and NUL, never on `,`, which a store's category name can
    hold;
  - it trims each genre and keeps it once in any case;
  - it drops the placeholders `audiobook(s)`, `audio book(s)`, `speech`,
    `spoken word` and `other`;
  - ffprobe's `genre` replaces dhowden's when it gives any.

**The probe** gives the duration, chapters, audio `codec` and richer
container tags. The `codec` is the `codec_name` of the first audio stream, and
it feeds the `direct_playable` API flag. The
[in-process probe](#the-in-process-probe) handles most files and ffprobe
handles the rest when available. A successful
[MP3 frame count](#mp3-lengths) supplies the duration when ffprobe would
estimate it.

#### A series tag with a position

Audible-sourced tooling writes a **series tag** that carries its own position,
such as `Discworld, book #40`. The tag can be the series atom, the MP4
`\xa9grp` grouping, `show` or `TXXX:SERIES`. `metadata.SplitSeriesTag` splits
it into the series and its position. It reads:

- `Series, Book 3`, `Series Book 3`, `Series #3`, `Series, #3.5`,
  `Series (Book 3)` and `Series, Vol. 2`;
- the markers `book`, `bk`, `vol`, `volume` and `no.`, in any case.

Only a trailing, explicitly marked number set off from the name counts. So
`Warhammer 40,000`, `Metro 2033` and `Learning C# 2` keep their whole name. A
tag naming several series (`Discworld #40; Moist von Lipwig #3`) is read by its
first series when that one carries a position. A later series-part tag still
overrides the position.

A position is never NaN or an infinity (`ParseSeriesPosition`), and a
series-part tag's is read only from 0 to 100000 (`seriesPartTag`), the bound an
edit's position has (`metadata.ValidSeriesPosition`).

#### The narrator

The **narrator** is an explicit narrator tag when the file has one, else the
composer tag. The explicit tags are:

- the iTunes `©nrt` item of an MP4 (`.m4b`, `.m4a`, `.mp4`). Neither
  `dhowden/tag` nor ffprobe returns it, so `metadata.readMP4Narrator` reads it
  with its own bounded walk of `moov > udta > meta > ilst` (or
  `moov > meta > ilst`). The walk reads a capped number of boxes per
  container, never a box larger than its parent, and at most 4 KiB of the
  value. It reads a malformed file as having no item;
- an iTunes `----` item named `NARRATOR`;
- a Vorbis `narrator`;
- ffprobe's `narrator`.

ffprobe's composer never replaces a narrator found by the tag read
(`applyProbe`), so the narrator is the same with or without ffprobe. A book
already indexed keeps the composer it was read with until its files are read
again. That happens on a change to them, or on the console's Read the files
again (`POST /admin/libraries/{id}/book/rescan`), because the scan skips an
unchanged book.

#### Tag hints

Both tag passes read the [tag hints](data-model.md#tag-hints)
(`Metadata.setHints`). An ASIN or ISBN counts only in its proper form
(`match.ValidASIN`, `ValidISBN`). So `N/A` beside a real tag, or a repeated
tag's joined `A;A`, still reads the real one.

### 3. Generic-title guard

`chooseTitle` keeps the path-derived title when the embedded one is missing or
generic. `metadata.IsGenericTitle` flags bare numbers and labels such as
"Track 01", "Disc 2" and "CD1". The check is token-based, so a real title like
"Part of Your World" is not flagged. Letters and numbers in any script count:

- a title written in another script names something (`Пролог`, `Глава 1`,
  `第1章`);
- a number in another script (`٠١`) is still a bare number.

### Where each value came from

The scanner does not record where each value came from. The admin console's
per-field provenance works it out when the book is read (`bookLayers.resolve`),
with one rule for every row, old or new:

- `path`: a scanned value equal to what `DeriveFromPath` yields for the book's
  path, or a title equal to `metadata.PathTitle` (below);
- `abs`: a value that an Audiobookshelf `metadata.json` gave;
- `tag`: anything else.

See [Data model](data-model.md#metadata-overrides-and-effective-values), which
also gives the source of a series position read from the title
(`titlePosition`).

A library whose `metadata_source` is `path` takes the folder layout over the
tags (`metadata.FromPathLayout`):

- the top folder is the author;
- the folder holding the book is the series, when there is an author folder
  above it;
- disc and track folders are parts of the book.

The server applies that too when the book is resolved, not in the scanner. The
stored snapshot is therefore the same in either mode, and switching modes
re-resolves the books without a rescan, as a resumable job (see
[Data model](data-model.md#a-librarys-metadata-source)). A book whose stored
snapshot can't be read is recorded `unreadable` on its first file, and the next
scan reads it again.

The scanner does record:

- each folder-book part's own codec (`book_files.codec`);
- whether the primary file carries embedded art (`books.has_cover`). The upsert
  also sets it whenever a sibling cover was found.

### ffprobe is optional

Every code path degrades without ffprobe rather than failing:

- path-derived metadata still works;
- durations fall back to chapter ends, or stay 0;
- `codec` stays empty, which the API treats as directly playable
  (`direct_playable: true`). The web player then streams the file as it is
  rather than through the transcoder. See [Media & streaming](media.md).

With ffprobe disabled (`--ffprobe ""`) or not found, the
[in-process probe](#the-in-process-probe) still runs, by FFmpeg 8.1's rules.
Most files get their duration, codec and chapters, and only a file the probe is
unsure of goes without (see [With no ffprobe](#with-no-ffprobe)).

### A leaf that states its series

`metadata.LeafSeries` reads the book's folder name or its filename without the
extension. For `Mark Tufo; Indian Hill; Book 02; Bastion`, `DeriveFromPath`
returns "Bastion", series "Indian Hill", position 2. An author folder supplies
the author when present. At the library root the first part gives "Mark Tufo".
A separately indexed `CD1` directly inside this folder gets the same names
and position, even if it contains only one file.

| Marker in the leaf | Position |
|---|---|
| `Book 04` or `Book 2.5` | 4 or 2.5 |
| `Book 01-05` or `Books 01-05` | `ParseSeriesRange` gives `SeriesIndex` 1 and `SeriesIndexEnd` 5. |
| `Book XX`, `Book ??` or `Book 00` | The series has no position. |

`Oprah; Picks; Book Club` has no recognized marker and follows the ordinary
path rules. When a structured leaf omits the title, `DeriveFromPath` uses
`SeriesTitle()`. An untagged `Bruno Miller; Dark Road; Books 01-05` therefore
has the title "Dark Road 1-5". If both the title and position are missing, the
series name alone supplies the title.

`readNames` takes an explicit series and position from the tags. A series tag
without a position can inherit the leaf's number or range only for the same
series. `leafTagSeries` compares the names with `match.SameSeries` or
`match.NormalizeSeries`, so "Expanse" can take the position from "The Expanse".
A different tagged series drops both ends of the leaf's range. For the
folder-first reading, see [A library's metadata source](data-model.md#a-librarys-metadata-source).

### An album that is only the series

Many libraries tag the series as the album and the book as the title:

- `Mark Tufo/Mark Tufo; Indian Hill; Book 04; From The Ashes`, album "Indian
  Hill";
- `Eric Vall/Without Law/Book 10`, album "Without Law", title "Without Law 10".

`bookTitle` prefers the album, so every book of the series got the same title,
and `matchrun.QueryFor` sent the series as the title, which matched book 1. Now
`readNames` passes the title through `metadata.TitleNotSeries`
(`metadata/seriestitle.go`).

It applies when the title is the album (`Metadata.AlbumTag` and `TitleTag`
record the pair that `bookTitle` chose from) and the album names a series the
book is in. Names are compared by series key, with bracketed groups such as
"(Unabridged)" left out. The series can come from:

- the series tag;
- the folder holding the book, unless the book is a disc or part folder
  (`Bastion/CD1`), whose folder is the book;
- the series part of a leaf named `Author; Series; Book NN[; Title]`
  (`metadata.LeafSeries`, see
  [A leaf that states its series](#a-leaf-that-states-its-series)).

The album stays when the leaf names the book the same way
(`Frank Herbert/Dune/Dune`). The leaf may hold that name alone, or beside only
the author, a year, a volume marker, or the series and the number 1
(`Frank Herbert - Dune`, `1965 - Dune`).

Otherwise there are two candidates:

- the title tag;
- the path's title: a `LeafSeries` leaf's title part, the book folder above a
  disc or part folder, else `DeriveFromPath`'s.

Neither candidate counts when it is:

- a volume marker (`Book 10`, `Vol. 2`);
- a part label or other generic title (`IsGenericTitle`: "Track 01");
- only bracketed text;
- the series' name itself;
- the series and the number 1 (`Arena Road 1`, `01 Monster Core`).

For a book of several files, a title tag that is the album plus a track marker
("Indian Hill 03") is a file's name and doesn't count either. Then, in order:

1. If the two agree, that is the title.
2. A usable path title wins if the book has several files, the title tag is
   unusable, or the tag carries the series name.
3. When a leaf has no title part, states a range and names the album's series,
   a usable title tag wins if it contains the series name or the book has one file.
   Otherwise the leaf supplies the title, for example "Dark Road 1-5" even
   with album "Dark Road". It comes before rule 4, so a range starting at 1
   takes it too.
4. A book at position 1 (the tags' position, else the leaf's volume) keeps the
   album. A series is often named for its first book, whose title tag may be a
   chapter's ("End Credits").
5. The title tag wins, except for a book of several files. There, the lone
   first-file tag ("Prologue" in `Indian Hill/Book 3`) counts only when it
   carries the series' name.
6. A title-less leaf naming the album's series supplies its series and position
   ("Indian Hill 5"). Otherwise the album stays.

The result is the stored title, so the player, search and the match's query all
see the book's own title. `metadata.PathTitle` is the path's title that
`TitleNotSeries` reads: a `LeafSeries` leaf's title part, the book folder above
a disc or part folder, else `DeriveFromPath`'s. It is `""` for a `LeafSeries`
leaf without a title part. The console's provenance labels it `path` (see
[Where each value came from](#where-each-value-came-from)).

### A book of several files' title

For a book with several files, `readNames` calls `metadata.PartsTitle` with
the first file's tags and the folder's `PathTitle`. `Metadata.PartNamed`
decides whether the last file's tags could change the result. A full index
reuses those tags from the chapter read. The setup preview and name backfill
open the last file only when needed.

- **Without an album**, a meaningful title tag shared by the first and last
  files wins. "Dune (Part 1)" and "Dune (Part 2)" give "Dune". Different
  chapter names give the folder title, as in `Fahrenheit 451`. A folder that
  names no title, such as `03`, leaves the first usable title tag in place.
- **When a title tag adds a subtitle to the album**, the tag wins if it or its
  suffix names the book folder, or if both files have the same tag. Otherwise
  `partsName` looks for a shared book name after the album, unless the folder
  names the album itself. "The Wheel of Time: The Great Hunt - The Wheel" and
  "The Wheel of Time: The Great Hunt - The Dragon" give "The Great Hunt".
  A shared part or volume marker alone contributes no book name. Tags that
  differ only in bracketed notes can still give their common title.
- **When the album may name a series**, the first file must have no series
  tag, and the album and folder must share no distinctive word
  (`match.TitlesShareWord` ignores case and accents, and the scanner removes
  bracketed notes). If the first title tag names the book folder, its spelling
  wins immediately. If the two files name different chapters and the last
  file's album is absent or agrees with the first, the folder supplies the
  title. In `The Dragon Reborn`, named chapters with album "The Wheel of Time"
  give "The Dragon Reborn". The same rule covers chapter names prefixed with
  the series.

Track labels, filenames and tags that number the same name in turn give no
evidence for replacing the album with the folder. The album also stays when
the folder names a volume (`03`, `Book One`, `Mistborn Book One`), its contents
(`Files`, `MP3`), a code (`HP1`, an ASIN or an ISBN), or the tagged author.
Files directly in `Andy Weir` with that author tag keep the album "The Martian".
A book directly in its *series* folder can take that folder's name when the
files name different chapters and have no series tag.

If the resulting title is an album that names a known series, `TitleNotSeries`
can still use the book's own title. An admin's title edit takes precedence over
the scan. See [An album that is only the series](#an-album-that-is-only-the-series).

### Books already indexed

The first library scan after updating checks the names of affected books once.
It updates their stored snapshots without re-indexing the books or running a
migration. The snapshot's `@rev` records which rules it used. See
[Data model](data-model.md#the-rebuildable-index).

**Flagged books.** `Catalog.Signatures` sets `Signature.NamesCheck` when any
of these conditions applies.

| Snapshot revision | Which books need a name check |
|---|---|
| Before 2 | `metadata.MaybeSeriesTitle` flags [a scanned title that may be its series](#an-album-that-is-only-the-series). |
| Before 4 | `tagReadingMayDiffer` flags an MP4-family book, a narrator, a series that `SplitSeriesTag` splits, or a non-ASCII letter in the title or path. |
| Before 5 | The folder book has more than one file in `book_files`. Its first file may have supplied a [chapter title](#a-book-of-several-files-title). |
| Before 6 | `metadata.PathLeafSeries` recognizes [a structured leaf](#a-leaf-that-states-its-series) in the book's own path component or directly above its disc folder. |
| 5 | A multi-file book has a nonempty `metadata.PathTitle` that differs from its scanned title under `metadata.SameName`. Case or bracketed edition notes alone do not trigger a read. |

The next scan reads a flagged book's first file once, with the same read as the
path backfill, and its last file too where the title depends on it (`partNamed`).
`Catalog.SetPathReading` then rewrites the names, including the narrator,
unless the snapshot is already at the current revision.

- A book that the snapshot alone could settle for the lone-folder check waits
  for this read too. So an unreadable file never records today's revision with
  its title or the leaf's series unread.
- These reads run `readSlots` wide, in batches (`tagRead`, `tagReadsPerSlot`).
  A large revision-4 backfill (every narrated book, once) therefore costs one
  parallel tag read each.
- If the required last file cannot open, the scanner keeps the stored title
  and remembers the failure until the book is indexed again. A stopped or
  timed-out read waits for the next scan. See
  [Backfills for a skipped book](#backfills-for-a-skipped-book).

**Books not flagged.** That scan stamps a current revision 1 to 5 snapshot
(`Signature.RevStamp`) at today's revision (`Catalog.StampScannedRev` with
`revOlderOwn`, a compare-and-set that changes only the revision). Later scans
don't test it again. A snapshot of no revision that isn't flagged is not
stamped. It keeps no revision until its next re-index or path reading.

**Adding a rule.** A stamped book is never tested again. So a later change that
makes the reading change more books (`TitleNotSeries` more titles,
`MaybeSeriesTitle` or `LeafSeries` more flags) needs three things:

- a new revision;
- its own `NamesCheck` term;
- the revision it replaces added to `revOlderOwn`'s list, so that revision's
  snapshots are stamped too.

### The in-process probe

A first scan used to be mostly ffprobe: about 94% of a real library's read
time. Almost all of that was starting the process, some 31 ms on an Intel N305
before ffprobe read a byte. With a known ffprobe release, the scanner reads
common formats in-process (`internal/metadata/fastprobe*.go`) and calls
ffprobe for files it cannot read reliably. In the spike, its prototype
scanned 1,165 books with 9,165 files in 9.9 s, down from 197 s. It called
ffprobe for three files.

**One open, one cache.** In the normal scan path, `metadata.ExtractTimeout`
opens a file once. It reads the tags (`dhowden/tag`), the iTunes narrator and
the probe through one 64 KiB block cache (at most 4 MiB kept), then closes the
file before any ffprobe run.

**What it answers.** Exactly what the scan took from ffprobe:

- the format duration, as ffprobe's `"%f"` string;
- the first audio stream's `codec_name`;
- the chapters;
- the format tags that `applyProbe` reads (`probeTagKeys`). A key that
  `applyProbe` starts reading joins that list.

It reads MP3, M4B/M4A/MP4, FLAC, Ogg Vorbis, Ogg Opus, Ogg FLAC and MKA. Each
reader is a port of FFmpeg's demuxer:

- an MP4's duration is the least of `mdhd`, `stts` and the edit list;
- an MP4's chapters come from a `chpl` list or a chapter track, as FFmpeg picks;
- ID3 frames follow FFmpeg's dictionary order and overwrite rules;
- a Vorbis stream's start is handled as FFmpeg does;
- Matroska follows FFmpeg's `TagDefault` handling.

Every other format goes to ffprobe.

The probe follows the configured ffprobe release's rules (`ffRules`). The
exception is an [MP3 length](#mp3-lengths) measured by counting frames.

- **With 7.1 or 8.1**, the scanner uses the in-process rules for that release
  (`knownRules`). The releases differ in MP3 gapless durations and in empty
  UTF-16 ID3 strings. The official and LinuxServer.io images are both Alpine
  3.24, whose ffprobe is 8.1.3.
- **With any other release**, the scanner calls ffprobe for each file. It
  still reads tags and can count MP3 frames in-process. If the count succeeds,
  it replaces ffprobe's duration estimate. If ffprobe fails on that file, the
  scanner uses the full in-process result, including its codec and chapters.
  This covers Ubuntu 24.04's 6.1, an ffprobe whose `-version` fails, and a
  nightly or master build, such as the BtbN build that servers before 2.5.1
  [downloaded](configuration.md#ffmpegffprobe-resolution--auto-download) on
  Linux and Windows.
- **Without ffprobe**, the scanner uses the 8.1 rules. A file it cannot read
  has no duration. See [With no ffprobe](#with-no-ffprobe).

The server reads the release from `ffprobe -version` (10 s at most), once per
ffprobe path per process. An ffprobe upgraded in place is therefore read again
only after a restart. The release is the major.minor, so `7.1.1`,
`7.1.1-3ubuntu1` and `n8.1.3` are 7.1, 7.1 and 8.1.

**When the scanner calls ffprobe.** With a known release, a reader returns
`unsure` for a file it cannot read reliably. The scanner logs the reason at
debug level and passes the file to ffprobe in cases like these.

- an MP3 whose frames cannot be counted, or whose Xing byte count indicates
  that another stream was appended;
- a FLAC with a CUESHEET block, or a FLAC or Ogg with an ID3 prefix;
- a fragmented or compressed MP4, or one with an unknown handler or sample
  entry;
- a multi-stream Ogg;
- an MKA with no duration or a second SeekHead;
- another container named `.mp3` (WAV, FLAC, Ogg, MKV, MP4);
- a crafted table past a bound: a chapter track over 65,536 samples or with
  counts past its tables, Matroska SimpleTags over 4,096 or 8 deep, or a
  compressed ID3 frame over 16 MiB;
- an MP4 track that FFmpeg's `mov_read_trak` sanity check calls a broken
  header: chunks but no `stts`/`stsc` entries or no sample size or count, or
  samples but no chunks. FFmpeg then reads its `mdhd` duration in 1/90000, so a
  13,163 s book prints as 3,510 s, and only ffprobe gives that same answer;
- the edges where FFmpeg's own arithmetic misbehaves: an `mvhd`/`mdhd`
  timescale past `INT32_MAX`, a rescale that overflows int64, and an ID3v2.2
  `CHA` frame (FFmpeg's three-letter match reads it as `CHAP`);
- a read error, a reader's panic, no duration, or a probe limit (below).

**Limits.** A file's probe stops after 5 s or 64 MiB read, and that file goes
to ffprobe.

- The deadline is the caller's context and `min(timeout, maxProbeTime)`, under
  the time `ExtractTimeout` gives ffprobe (30 s, see
  [Read problems](#read-problems)).
- `maxProbeBytes` is far past the real library's p95 of about 0.9 MiB.
- Both limits are checked on every block read, before an ID3 frame is inflated
  or a repeated Vorbis key grows (`blockFile.check`). The walks that loop
  without reading check them every 256 ticks (`blockFile.tick`, a `probeLimit`
  panic that `fastProbe` recovers).

#### MP3 lengths

From 2.7.0 (server#435, widened by server#452), the probe counts the frames of
an MP3 whose length ffprobe would only estimate. A Xing, Info or VBRI header
can give the frame count for the whole file. The probe uses that count
directly. With a recognized encoder tag, the 8.1 rules
subtract encoder delay and end padding from the header duration. The 7.1 rules
use the full frame duration.

Without a header, a bitrate estimate can be wrong for a variable-bitrate (VBR)
file. The probe checks the first 64 frames and up to 16 consecutive frames at
each of 15 places across the audio (`mp3ConstantBitrate`). If the bitrate or
sample rate varies, or a sample point yields no pair of frames, it counts the
whole file. A Xing header with a byte count but no frame count also triggers
a full count.

Encoders can use the lowest bitrate for silence. If the first frame is
32 kbit/s in MPEG-1, or 8 kbit/s in MPEG-2 or 2.5, and the samples look
constant, the probe also walks every frame in the first 2 MiB of audio. A
change of rate or a break in the frames there triggers a full count.
A file that passes the constant-bitrate checks keeps ffprobe's bitrate
estimate, which the probe can calculate itself.

The full count reads in 1 MiB windows. It adds each frame's samples at that
frame's sample rate, so joined 44.1 kHz and 48 kHz sections each contribute
their actual playing time. With a LAME, Lavf or Lavc encoder tag, it
subtracts the encoder delay plus the decoder's 529 samples at the first
frame's rate. This also applies when the Xing header gives neither frames
nor bytes. The full count includes a final truncated frame, as ffmpeg does.

The probe excludes trailing ID3v1 and APEv2 tags, including an APEv2 cover,
when it places samples and sets the end of a frame count. A Lyrics3 trailer
stays inside that region. When the 2 MiB walk reaches it, as in a constant
32 kbit/s file with less than 2 MiB of audio, its non-frame bytes trigger a
full count. The count skips such bytes as it searches for the next frame. If
it skips more than one eighth of the region being counted,
it gives the file to ffprobe.

The frame count has its own deadline, the same 30 seconds as an ffprobe run,
and a count that cannot finish while other reads are running is retried alone
(see [A probe that ran out of time](#read-problems)). If the reads succeed but
the count still runs out of time and ffprobe supplies an estimate, the scanner
keeps that estimate at the current duration revision
(`Metadata.CountOutOfTime`). It tries again when the book's files change or an
admin selects **Read the files again**. A read error, or a probe that runs out
of its 5 s before it can tell whether to count, leaves the revision at 0
(`uncountedForNow`), so each later scan indexes the book again. A count that
gives up or finds no frames records the current revision, because it would end
the same way next time. With [no ffprobe](#with-no-ffprobe), a count that
times out reports `ProbeTimedOut` and is a
[read cut short](#read-problems), read again by each scan.

The setup preview and tag backfills normally skip sampling and counting
(`metadata.WithoutFrameCount`). They do not store a length. If an ffprobe
release with no probe rules fails on an MP3 during a tag read, the scanner
tries the frame count so it can use the same result as the index.

#### The first scan after updating

Migration `0091` advances books without MP3s from duration revision 1 to 2
when the revision belongs to the current index. The first scan re-indexes
each book containing an MP3, even a single MP3 among other formats, and
reports it as updated. It records revision 2 with the book's `indexed_at`.
If an older server re-indexes the book later, the timestamps differ and the
newer server checks the lengths again. A change to the length reading bumps
`catalog.durationRev`, with a migration like `0091` that moves the books with
no MP3 on.

A book whose last read was kept as stored for a read problem (`keptAsStored`:
an unreadable file or an ffprobe timeout) is not re-indexed for the revision.
It waits until `problemCleared` finds the file answers, like any other kept
book. A book kept for a part that reads the same every time
(`Book.LengthOnly`: a FIFO, a length out of time) and a book whose lengths
alone were written (`recordLengths`) record revision 2 as they are
(`stampDurationRev`), because reading them again would only keep them again.

The same scan [checks affected book names](#books-already-indexed) and reads each
[Audiobookshelf metadata.json](#audiobookshelf-metadatajson) once more, for
the reader's [name joining and series names](data-model.md#the-audiobookshelf-layer)
(reader revision 3: a series name holding `" #"`, such as "The #1 Ladies
Detective Agency", is no longer split into a series "The"). After
these reads succeed, a second scan of the unchanged library skips both the
audio and those metadata files. If a part's length changes, later
parts start at new offsets on the whole-book timeline. Saved places,
bookmarks and notes keep their existing positions.

#### Bounded reads on a hung share

Before probing, `readFile` opens and stats the file and reads its tags and
narrator. The ffprobe timeout, the caller's context and the probe's byte
budget also bound these operations.

- The open and its stat, and while armed every read from the file, run on a
  goroutine of their own and are waited for only until the deadline
  (`metadata.await`: `openBlockFile`, `blockFile.waitRead`). An `open` or a
  `pread` on an NFS or SMB share that stopped answering therefore costs a
  goroutine, never a stuck scan reader. An open given up on counts as a tag
  read out of time.
- A tag read out of time skips the probe and leaves the file to ffprobe, which
  can be killed and has its own timeout.
- A tag read past the byte budget leaves the tags unread, and the probe still
  runs.
- The file is opened `O_NONBLOCK` and must be a regular file. A FIFO or a
  device is turned away at once with an `OpenErr` (`metadata.ErrNotRegular`),
  never waited for and never read as audio. From 2.7.0 that counts as a known
  bad file with an unread length, not a read cut short (see
  [Read problems](#read-problems)).
- The scan's move fingerprint (`metadata.Fingerprint`) is bounded the same way,
  and is skipped after a read cut short.
- An ffprobe killed at its timeout that has not ended 5 seconds later
  (`ffprobeKillGrace`, an ffprobe stuck in an NFS read) is left behind and
  counted as an abandoned read.

**Side reads are bounded too** (2.7.0, `metadata.Bounded`). The other looks a
scan, an on-demand index or a request makes at a library file, listed below, go
through the same bound: the call runs on a goroutine of its own, is waited for
while its context lives and at most a timeout, and is counted on its mount when
given up on. Each call holds one of its mount's 16 slots (below) until it
returns, so a burst on a share that just stopped answering (a page of covers)
makes no more calls than the cap. With every slot held, a new call waits for one
within its own timeout and is given up on unmade when none frees. Once 16 reads
there are abandoned, a new call is refused at once. The calls are:

- a book's side files in a scan: the Audiobookshelf `metadata.json` read, the
  `.audiosilo/` attachments' lstats and reads, the ebook check, the cover
  search's stats and listing, the cover version's look, the added-date stat, and
  the check of a recorded problem (`problemCleared`);
- in a scan, discovery's own looks (the folder listings, a `.audiosilo/`
  folder's listing, a `metadata.json`'s lstat and each audio file's lstat in
  `statAudio`, see
  [A folder that does not answer](#a-folder-that-does-not-answer)), the
  tag-only suspect check (`suspectFromTags`) and the read-along ebook's
  hashing, each of its reads a call of its own;
- the backfill's embedded cover read;
- an on-demand read's looks (`/item`'s index of a book not indexed yet, an
  admin's Re-read and the Bridge's rescan): the path's join and stat, the
  on-disk spelling check (`dirPresent`), the folder's listing and its audio
  files' lstats, the `metadata.json` and `.audiosilo/` looks, the move check
  (`bookOnDisk`), the ebook's first look (`ebookOnDisk`) and the files beside
  the audio;
- in the API, `/item`'s look at the book's ebook, every cover, thumbnail and
  show artwork, `GET /readalong`'s read of the map and its look at the ebook,
  and every look a stream makes at its file: the path's join
  (`library.SafeJoinBounded`), the open and stat of a file streamed as stored,
  a transcode's look at its source, a remux's or watch rendition's look at its
  source (`media.Source`), and a podcast episode's checks and open
  (`library.OpenPodcast`). A stream's looks share one 45-second bound from the
  request's start, so the joins and the open together wait no longer than an
  open alone did. A stream that waited on a remux gives its next look at least
  10 seconds (`API.afterWait`), since that wait was no look at the file.

The scan gives each the probe's time (`Scanner.probeTimeout`). An on-demand
read gives each look 10 seconds instead (`library.WithLookTimeout`,
`Scanner.lookTimeout`), well inside the 30-second request timeout, so a share
that stopped answering is the request's `503 share_not_answering`, not its
timeout. The audio's own read and the move check's fingerprint reads
(`metadata.FingerprintErr`) keep the probe's time. A Re-read whose read kept
the book as stored because a file did not answer (a look given up on, or its
audio's read cut short) answers that `503` too, since the admin asked for the
book as it is on disk now. `/item` on an indexed book answers with the stored
book: once a Matroska book's remux warm has a join given up on, it makes no
further look (see
[`/item`](api/reference.md#get-apiv1librariesiditem)).

With a book's audio read cut short, none of its side files is looked at, since each would wait
out its time too. A side file given up on otherwise keeps the book as stored and
records an `unreadable` problem on that file (`library.givenUp`), over a lasting
one. The next scan repeats the same kind of call (a folder's listing, a cover
image's stat, any other file's read of its last bytes, since a stat can answer
from a cache while reads hang) and clears the problem when it answers, or when
the file is gone. A backfill's given-up read keeps what is stored and records
nothing. The API answers a given-up look with `503 share_not_answering`
([API conventions](api/index.md)).

These looks are still not bounded, or not by an on-demand read's 10 seconds:

- the ffprobe read on a Re-read, and the fingerprint reads of an on-demand
  index, a Re-read or the Bridge's rescan that looks for a move, which keep the
  probe's 30 seconds;
- a file cache's background open of its source (`media.FileCache`, a remux or
  a rendition being made), once the request's own look has answered. Its stats
  of the source get a scan's look time;
- the scan’s root availability probe, which has its [own deadline](#the-unavailable-root-guard).

**One hung share holds back only itself.** Abandoned reads are counted per
mount (`stuckByMount`, a `mounts.PerMount`). Once 16 are outstanding on one
mount (`maxAbandonedReads`), a new read from a file there fails fast. The file
is not opened, no ffprobe runs, and its tags stay unread. This is logged once,
with the mount, until they have all returned. Reads already under way can take
the count past 16. Files on every other mount read as usual.

`internal/mounts` names a path's mount from the mount table alone, with no
filesystem call, so it answers at once even for a path on a hung share:

- The table is `/proc/self/mountinfo` on Linux and `getfsstat` with
  `MNT_NOWAIT` on macOS. A lookup once the last read is 10 seconds old (`tableTTL`)
  reads it again on a goroutine of its own, the lookups keeping to the last read
  meanwhile, and a re-read that fails keeps the last table.
- A path belongs to the longest mount point above it, by the path's text.
- A mount's key is the filesystem it is of (`Mount.Device`: mountinfo's
  `major:minor`, the fsid on macOS), not its mount point. A share unmounted and
  mounted again at the same path starts with nothing stuck, and two bind mounts
  of one share (two libraries of one NAS inside a container) share one cap. The
  mount point still names the mount in the log.
- On another OS, or when the first read of the table fails, every path is on
  its volume root (`/`, or its drive on Windows), which gives one cap for the
  whole process (one per drive on Windows).

The scan's root check still catches a mount that is dead before discovery
(see [The job queue](#the-job-queue)). These bounds cover a share that hangs
partway through a scan.

What a cut-short read does to the stored book is in
[Read problems](#read-problems).

**A file neither reads** keeps ffprobe's error as its `ProbeErr`
(`ErrProbeRejected` included), with FFmpeg's context address dropped
(`[mp3 @ 0xcbcc3c000]` is stored as `[mp3]`).

#### A folder that does not answer

On a Re-read, a transient fault on the book, a part’s stat or a disc listing returns 503
`share_not_answering`. The request that leads a shared index read returns the same response if it
reaches its wait limit. A lasting refusal, such as permission denied or a device gone, returns
404. A refused sibling disc still counts as a disc, so a healthy disc keeps its split parent. A
server resource error, such as too many open files, follows the route’s own error handling. The
scan keeps the indexed book when it cannot establish that it is gone.

Discovery's looks wait at most the probe's time each. A folder whose listing is
given up on is skipped for the run. So is a folder holding an audio file whose
lstat is given up on, or fails the way a share fails (`shareFault`). That is any
error but the file being gone (`ENOENT`, or `ENOTDIR` when a folder above it
was replaced): `EIO` and `ESTALE` from a soft-mounted NFS share, `ENOTCONN` and
`ETIMEDOUT` from a FUSE pool or a network mount that dropped, and a permission
error from a share that allowed the listing but refuses the look. A file just
listed that then won't answer may or may not still be there, so its book is
kept as stored rather than built without it.

A disc folder directly in a skipped folder, or in a folder above one, is
skipped with it (`dropUnanswered`). So no book is joined from the discs that
answered, and no joined book is split into them. A `.audiosilo/` folder that
won't list keeps its book's attachments as stored.

The run is then [partial](#scan-history-scan_runs). Its skipped books are kept
as stored, nothing in the library is pruned, and
[move detection](#move-detection) never gives a skipped book's state to a copy
elsewhere. The run's log records an `unreadable` event for each skipped folder,
with the OS's message. A folder that stays unreadable (a permission nobody
fixes, a file the share keeps refusing) therefore keeps every scan of that
library partial. Books whose files are gone stay in the library until the
folder reads again or is removed.

#### With no ffprobe

With `--ffprobe ""`, or no ffprobe found, the probe still runs, by FFmpeg 8.1's
rules (`noFFprobeRules`, the release the Docker images ship).

- A file the probe is unsure of gets no duration and no `ProbeErr`.
- A read out of time says so (`Metadata.ProbeTimedOut`) and is read again
  alone, as an ffprobe time-out is.
- The start-up log says the probe is on with no ffprobe.

A scan reads an unchanged book with no stored duration or codec again once per
server run (`Scanner.rereadUnprobed`, remembered in memory). So a server that
ran without ffprobe gets its books' lengths on the first scan after the
upgrade, and a file the probe is unsure of isn't re-indexed on every scan.
`metadata.ExtractTags` reads tags alone, for the one tags-only caller
(`suspectFromTags`).

**Keeping parity.** A new FFmpeg release that changes a rule would change a
value, so the probe is checked against ffprobe mechanically: a fixture corpus
with each known release's answers, a live comparison and a CI job. See
[Gates and CI](../contributing/gates-and-ci.md#the-in-process-probes-fixtures),
which also says how to add a release. `cmd/probediff <dirs>` compares the probe
with the installed ffprobe over any folders and times both. It is the tool to
point at a real library.

## Chapter normalization

The scanner normalizes chapters (`metadata.Chapter`) so that single-file and
multi-file books present identically. Every chapter carries:

- `file_path`, the library-relative audio file to stream;
- the in-file `start` and `end`;
- `book_offset`, its start on the whole-book timeline.

The two kinds of book:

- **Single-file books** (`singleFileChapters`). Embedded chapters are marked as
  living in file 0, with `book_offset = start`. If the container reports no
  format duration (some m4b files), the book's duration falls back to the last
  chapter's end.
- **Folder books** (`buildMultiFileChapters`). Each part is probed.
  - **If a part has its own embedded chapters** (a single chaptered m4b in its
    own book folder), **those are expanded** into the book's chapter list.
  - Otherwise the whole part becomes one chapter titled from its filename.
    `partTitle` strips the extension and any leading track number.

  Book offsets accumulate across parts, and the book's duration is the sum. So
  a chaptered m4b and a folder of split mp3s render identically in a player.

These are the scan's own chapters, kept in `books.scanned_chapters`. Other
sources can replace them, outside the scan; which list a book uses is
[the rule](community-chapters.md#the-rule), applied in the scan's transaction:

- an [admin's edited list](community-chapters.md#edited-chapters);
- a community recording's chapter list fitted onto a matched book's audio (see
  [Community chapters](community-chapters.md));
- for a book with no chapters of its own, the chapters a Bridge found in its
  narration, from its `.audiosilo/chapters.json` (below; see
  [Generated chapters](community-chapters.md#generated-chapters)).

## The Bridge's attachments

A book's hidden **`.audiosilo/`** folder holds what the
[Bridge](../bridge/index.md) generated for it:

| File | Holds |
|---|---|
| `characters.json` | characters |
| `recaps.json` | recaps |
| `description.json` | the description |
| `chapters.json` | chapters |
| `bridge.json` | provenance |
| `readalong.json` | the read-along map |

A single-file book's files carry its file stem first (`Book.characters.json`),
in a `.audiosilo/` beside it.

Any other name there is skipped (`knownAttachment`). A book the Bridge
[added from LibriVox](../bridge/librivox.md#audiosilolibrivoxjson) holds
`librivox.json`, which the server does not read: the book is indexed with no
attachments from it and no scan error.

They are not a metadata layer. Nothing in the effective row reads them except
`chapters.json`, which is a chapter source of its own, and `/meta` serves the
rest. Recording a book's attachments (`SetAttachments`, `RefreshAttachments`)
re-resolves the book when its `chapters.json` changed. The exact rule is in
[The attachments refresh](../bridge/attachments.md#the-attachments-refresh).

The scan finds them the way it finds an ABS `metadata.json`:

- **Discovery** never walks into a hidden folder, such as the Bridge's LibriVox
  staging folder (`.audiosilo-librivox-<id>/`). A folder named exactly
  `.audiosilo` (a real folder, not ignored) is the exception: it is **listed
  once** without going in (`audioDirs`' `sidecarFiles`, beside the ABS
  signatures). Its known regular files are recorded by the folder holding it.
  A folder that can't be listed marks its books *unread*. What is stored for
  them stays, and no audio lives there, so the prune is not at stake.
- **Each book's signature** (`attachments_sig`) is its own part of that
  listing: `name:size:mtime_ns` per known name present, joined.
- **A skipped (unchanged) book** has its attachments read and recorded by
  `catalog.SetAttachments`, **without** a re-index, when its signature differs
  or its attachments were never read for this index of the row
  (`attachments_indexed_at` is `NULL` or another index's). This is the
  attachments backfill, flushed with the path and ABS backfills. The write is
  recorded only while the row still holds the state the scan read when it
  began, so it never overwrites a newer reading from the Bridge's own refresh.
- **A re-indexed book** reads them in `enrich`. `IndexPath` looks up only the
  book's own names (`attachmentsSigAt`).
- `Scanner.RefreshAttachments` is the Bridge's
  [`POST /bridge/rescan {mode: "attachments"}`](api/reference.md#post-apiv1bridgerescan).
  It reads the attachments of one indexed book, never its audio.

The scanner reads each file as a regular file only, never through a link, and
at most 4 MiB (16 MiB for a read-along map). It checks each file against
audiosilo-meta's formats, and a map against its own head checks.

- A file that fails is logged, left out, and not read again until it changes.
- A file that can't be read right now keeps what is stored.

The details and the storage (`book_attachments`, migrations `0048`, `0050`,
`0051` and `0058`) are in
[The .audiosilo folder](../bridge/attachments.md#how-the-server-finds-them).
Only a read-along map's head is stored. The server streams the file through
[`/readalong`](api/reference.md#get-apiv1librariesidreadalong).

## A book's ebook

A book records the one `.epub` its reader opens (capability `ebooks`,
migration `0056`, `library/ebook.go`). The path is `books.ebook_path`, sent as
the book's [`ebook {path, size}`](api/reference.md#get-apiv1librariesidbooks)
and served by
[`GET /libraries/{id}/ebook`](api/reference.md#get-apiv1librariesidebook).

The rule is `library.BookEbook`'s, and it is the Bridge's own (its
`epubBeside`). So the reader, the generate estimate and the Bridge's `auto`
source always name the same file:

- **A folder book**: the one regular, non-hidden `.epub` directly in its
  folder. A link never counts. **Two or more is none**, because there is no way
  to tell which is the book.
- **A single-file book**: `<stem>.epub` beside it, as the disk opens that name.
  On a case-insensitive disk any case of it counts, recorded under the computed
  name. Here a link counts while it leads to a regular file inside the library.
  - The name also counts when spelled in its other Unicode form, such as an NFD
    copy from macOS beside NFC audio on a disk that tells the forms apart. The
    scan and an on-demand index match listed names by `ebookNameKey` (NFC,
    lower-cased).
  - `BookEbook` (the estimate) still looks the name up as spelled, as the
    Bridge's `os.Stat` does. So it never quotes an ebook run that the Bridge
    wouldn't make.
- **Readable**: a zip whose directory lists `META-INF/container.xml`
  (`readableEpub`). DRM is not judged, because the reader reports a locked book
  itself. Ignore rules don't apply, as they don't to the Bridge.

One rule function, `ebookCandidate`, serves every caller, and
`TestScanRecordsEbookByBookEbookRule` holds them together:

- The scan feeds it the `.epub` entries that its discovery walk already lists
  (`sidecarFiles.epubs`, no extra read of the folder).
- An on-demand index (`IndexPath`, `IndexMoved`, through `ebookOnDisk`) feeds
  it what is on disk now.
- `BookEbook` (the estimate) feeds it what is on disk now, for a folder book.
  A single-file book's name it looks up as spelled (above).

**No re-index.** `books.ebook_sig` is the signature (size, mtime and name) of
the file the rule names, recorded whether or not the file is readable.

- `catalog.SetEbooks` records a book the scan finds unchanged whose signature
  differs, with the scan's other backfills and without re-indexing its audio.
  The signature differs when an EPUB was added, replaced, renamed or removed,
  or a second one was added. It also differs for every book after the upgrade,
  since `0056` starts them all at `''`.
- `SetEbooks` writes only over the row as the scan read it, so an on-demand
  index made since then stays.
- An unreadable file is not opened again until its signature changes.
- A file that can't be read right now (a folder that won't list, a permission,
  a flaky mount) keeps what is stored, so the next scan looks again.

Every open, the scan's and the route's, goes through `library.OpenEbook`. It
checks that the path is a regular file inside the library before opening it,
because a FIFO's open would block. Once the file is open, it checks that it is
still the very file its name leads to (`os.SameFile`), so a link swapped in
meanwhile is never followed out.

**The size** (`books.ebook_size`, migration `0058`) is recorded with
`ebook_path` (`UpsertBook`, `SetEbooks`). It is backfilled from the
signature's leading size, never parsed out of `ebook_sig` per row.

### Hashing, for read-along only

A [read-along map](../bridge/readalong.md) names the ebook it was made from by
its sha256. So the server hashes the ebook of a book **with a map**, and only
those, because hashing every EPUB would read whole libraries over a network
share. `books.ebook_sha256` is the digest, and `ebook_hashed_sig` is the
`ebook_sig` it was computed for. A digest whose sig isn't the row's is stale.

After the walk, the scan's post-pass (`Scanner.hashReadalongEbooks`, or
`RefreshAttachments` for its one book) hashes the books that
`catalog.ReadalongEbooksDue` lists. A listed book has a stored valid map head,
an ebook, and a digest that is not current.

- The hash goes through `library.EbookDigest` (`OpenEbook`).
- The post-pass skips a book whose stored digest is already of the file on
  disk.
- `SetEbookDigest` records the digest with the signature of the file it
  hashed, and only while the row still names that ebook and still
  holds the digest its caller read as stale, so a slow hash of an older file
  never overwrites a newer one recorded meanwhile.

A request ([`/item`](api/reference.md#get-apiv1librariesiditem)'s `readalong`,
[`/readalong`](api/reference.md#get-apiv1librariesidreadalong)) trusts the
stored digest only while the file on disk still has the signature it was
computed for. That takes one stat (`Scanner.EbookDigestNow`). Otherwise the
request hashes the file then and records the digest under the new signature.
An EPUB replaced since the last scan is therefore never answered with the old
file's digest, and it is hashed once, not on every ask. A known limit: the
signature is the size, mtime and name, so an EPUB replaced by one of the same
size and mtime (and name) keeps the old digest until either changes.

The `.epub` is never audio.
[`/stream`](api/reference.md#get-apiv1librariesidstream) refuses it and the
[filesystem view](#the-filesystem-view-browsefs) doesn't list it.

## Covers

Cover resolution has two stages: an indexed **sidecar** path, and an
**embedded-art** fallback at request time.

**During enrichment**, `findCover` looks for a conventionally named sibling
image: `cover.jpg`, `cover.jpeg`, `cover.png`, `folder.jpg` or `folder.png`.

- For a **folder book** it searches *inside* the book folder. Only there will
  it fall back to any image file (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`).
  - It prefers an image with "cover" in its name over an arbitrary
    first-alphabetical thumbnail.
  - It never takes a hidden file. macOS writes an AppleDouble `._Cover.jpg`
    beside each image on a share, which sorts first and is no image.
  - A multi-CD disc subfolder (`CD1`, `Disc 2`; `isDiscFolder`) falls back to
    its *parent* folder, where the art usually lives.
  - A [joined book](#joined-books-disc-sets) with no image of its own falls
    back to its first disc's folder.
- For a **loose single-file book**, only the conventional names in its
  directory count, because a stray image there is probably not its cover.

The result is stored in `books.cover_path`.

**At request time**, `handleCover` serves, in order:

1. a **custom cover** that an admin uploaded (stored in the database,
   `book_covers`);
2. the sidecar, through `media.ServeFile`, when `cover_path` is set;
3. **embedded art** extracted from the book's primary audio file
   (`media.EmbeddedCover`, through `dhowden/tag`);
4. a 404 if none exists.

The scanner records `books.has_cover` (a sidecar was found, or the tags carry a
picture), so the admin catalog can filter on it without opening files. The
catalog's "has a cover" is `has_cover` or a custom cover.

## What a scan notices for the Health page

The console's Health page reads two things the scanner records on each book,
besides what it already stores (cover, chapters, codec).

### Read problems

`noteProblem` (`library/problems.go`) records the **first** problem met while
reading a book's files, in three columns:

| `books.scan_error` | When |
|---|---|
| `unreadable` | a file couldn't be opened (`metadata.Metadata.OpenErr`), or its read was cut short on a hung share (below) |
| `empty_file` | a file is 0 bytes |
| `probe_failed` | ffprobe is configured and couldn't read a file (`ProbeErr`): the in-process probe left it to ffprobe, which failed |

`scan_error_file` is the library-relative file. `scan_error_detail` is the OS's
or ffprobe's own message, without the absolute path, since the console shows
the file beside it.

To keep that message, ffprobe runs with `-v error` instead of `-v quiet`. On
failure, the scanner takes every distinct line ffprobe wrote to stderr, each
without the input path and without FFmpeg's context address. It joins them
with `"; "` and trims the result to 300 bytes. For example:
`[mov,mp4,m4a,3gp,3g2,mj2] moov atom not found; Invalid data found when
processing input`. The specific cause usually comes before the generic last
line. Health describes the failure in plain words and puts the probe message
behind **Details**. It also strips the context address from older stored messages.

Every re-index clears and re-checks the columns. A fixed permission, or a share
that came back, changes neither the file's mtime nor its size, so the
unchanged-skip would keep the stale problem. Instead, each scan re-reads just
the recorded file of an `unreadable` or `probe_failed` book (`problemCleared`),
and re-indexes the book when the file now reads.
`POST /admin/libraries/{id}/book/rescan` re-checks at once.

Two exceptions keep a damaged file from costing every scan:

- A one-file book whose problem is still there passes the
  [unchanged-skip](#anatomy-of-a-scan-pass) rather than being read whole.
- A file whose data ffprobe rejected isn't probed again until it changes or the
  server restarts (see
  [A rescan that finds nothing changed](#a-rescan-that-finds-nothing-changed)).

**A probe that ran out of time.** Each ffprobe run gets 30 seconds
(`metadata.ProbeTimeout`). The in-process probe's own bound, 5 s, only sends a
file to ffprobe (see [The in-process probe](#the-in-process-probe)). An
ffprobe run that runs out is killed. Its `ProbeErr` wraps
`metadata.ErrProbeTimeout`, and the problem is `probe_failed` with the detail
`ffprobe timed out after 30s`. When reading an admin book row, the catalog
recognises the timeout prefix and supplies `scan_error_code: "probe_timeout"`.
Health then says the file "took too long to read as audio". Other probe failures
read "couldn't be read as audio".

Files that share a slow disk or a busy share can each take longer than that
while [others are read beside them](#reading-several-files-at-once). So a read
that timed out while others ran is retried on its own (`readSlots.extract`):

- The retry waits for the reads under way to finish, and holds back new ones
  while it runs.
- Only one retry runs at a time.
- Only a file that also times out when read alone is recorded as a problem.

On a very slow share where many files time out, the retries make the scan
slower than reading one file at a time would. Lower `scan.concurrency` there.

**A read cut short on a hung share.** Any file of an already-indexed book can
come back with its read cut short, or refused at its mount's abandoned-read cap
(`Metadata.TagsUnread`, `ReadRefused`; see
[Bounded reads on a hung share](#bounded-reads-on-a-hung-share)). A file whose
length ran out of time even when read alone counts too: an ffprobe time-out, or with no ffprobe the in-process read's `ProbeTimedOut`
(`library.readCutShort`). The scan then sets `Book.ReadCutShort`, and the
book's row is not rewritten at all (`catalog.recordReadProblem`). Names,
length, codec, chapters, cover flag, mtime and size stay as the last full read
left them. Only the problem is recorded, with ffprobe or without, so the next
scan reads the file again (`problemCleared` never clears a read still cut
short). The problem is `unreadable`, with the detail:

- "reading it timed out" (an in-process length read out of time says this
  too); or
- for a refused read, "too many earlier reads from the same drive or share are
  stuck, so it wasn't tried", because the cap is per mount.

An ffprobe time-out records `probe_failed` (above) instead. A folder book
records the problem of the part that was cut short, even over an earlier
part's lasting problem, so the next scan asks the right file again.

A length out of time can repeat on every scan, for example on a damaged part,
and so can a file that is no regular file (from 2.7.0 a FIFO left in a book's
folder: an open error with an unread length, `library.lengthUnread`). So when one
of those is the only problem (`Book.LengthOnly`: every file's tags were read,
none was cut short or refused), the stored book is kept only while its files
are the stored ones (`catalog.sameFiles`): the same paths in the same order,
and the same sizes except for the parts whose length timed out or that are no
regular file (`BookFile.LengthUnread`). With a part added, gone, renamed or changed, the
book is written whole with the part's problem and counted as updated. This
holds for an on-demand index too. A cut-short or refused read keeps the book
whatever its files, because rewriting it would store names built from its
paths alone.

A new book read this way is written with its path's names.

Extraction stays best-effort. A problem never stops a scan, and the book is
still indexed with what could be read. Each book with a problem adds a
`problem` line to the scan's log and counts in its `errors`.

### Folders that may hold several books

A folder with audio is one book, which is right for almost every library. The
exception worth flagging is a folder that collects whole books
(`Series/Book 1.m4b`, `Series/Book 2.m4b`). `suspectParts` decides it while
`buildMultiFileChapters` reads the parts, and stores the answer in
`books.suspect_parts`. A folder is suspect when all of these hold:

- it has **at least two** parts;
- **every** part is at least **one hour** long (`minSuspectPart`). A part of
  unknown length, without ffprobe, can't pass;
- the parts claim **at least two different titles**.

A part's title is its album or title tag, unless that is missing or generic.
Then it is the file name without a leading track number. Titles are compared
lower-cased, letters and digits only, with numbers and part words removed:
`part`, `pt`, `of`, `cd`, `disc`, `disk` and `track`, also with a number
attached (`Part1`, `CD2`). So `Part 1` and `Part 2` of one book never differ.

`suspect_parts` is the number of distinct titles. 0 means one book, and
single-file books are always 0. Migration `0017` set it to 0 for every existing
row that can't be suspect, and left `NULL` only for folder books whose parts
are all an hour or longer. The next scan checks those with a tag read
(`suspectFromTags`, taking the lengths as passing) without re-indexing them.

The fix is a [folder override](#book-detection-booksindir), which the
console's "Choose detection" opens:

- `collection` splits the folder;
- `book` settles it, as the admin saying "it is one book". The `suspect` issue
  leaves out folders with a `book` override.

### Issues

`catalog/issues.go` turns the index into the Health page's categories on
request. Nothing but an admin's "ignore" is stored. Each book kind is one SQL
predicate over `books b`, shared by the counts (`IssueCounts`) and the lists
(`GET /admin/books?issue=`), so the two can't disagree:

| Kind | A book is listed when |
|---|---|
| `scan_error` | `scan_error` is set |
| `suspect` | `suspect_parts >= 2`, and the folder has no `book` override |
| `split_discs` | It is the first disc in `metadata.DiscOrder` (`disc_before` in SQL). The discs share a `split_parent` with no folder override. Setting `book` on that folder joins the discs. |
| `no_cover` | a scan has checked it (`has_cover` not `NULL`), and it has no sidecar image, no embedded art and no custom cover |
| `unmatched` | it has no ASIN, no ISBN and no recorded community match (`book_matches`, see [Data model](data-model.md#durable-per-library-config-path-keyed-no-fk-to-books); `NOT catalog.matchedExpr`). [Tag hints](data-model.md#tag-hints) and an import's [match hints](data-model.md#match-hints-from-an-import) don't count. Offered only while community metadata is on |
| `unknown_asin` | The [unknown-ASIN report](configuration.md#the-unknown-asin-report-metadatareport_unknown) found that the community database does not know the book's own ASIN. An ISBN can also be present. `unknownASINExpr` excludes books with a recorded community match or a community-supplied ASIN. The book still counts as matched. Once the enabled report has its first result, Health shows the card and offers a [match run by title](api/reference.md#post-apiv1adminmatch-runs). |
| `series_spellings` | Another book in the library has the same main `series_key` with a different `series` spelling. Two range seeks on `idx_books_series_key` look for a spelling below or above the book's own. `SeriesSpellingGroups` uses the same rule to group books by series. The console applies the chosen spelling with the [merge endpoint](api/reference.md#post-apiv1adminbooksmerge). |
| `no_chapters` | it is longer than **2 hours** and has at most one chapter. The console shows why community chapters weren't used from the row's `chapters_check` (a failed [community chapter check](community-chapters.md)) |
| `detailed_chapters` | its last community chapter check is `refine` (the community's finer chapters fit), it has no `chapter_source` choice and no edited chapter list. Picking either source, or editing the chapters, settles it |
| `transcode` | its codec doesn't play in browsers (`media.DirectPlayable`) |
| `duplicate` | it is one of a group of copies (below) |

#### Duplicates

`findDuplicateSets` uses a union-find to group copies within each library.
Health counts those groups. Two books join when any of the following match.

- the same audio fingerprint (`content_hash`) and the same total size. The
  reason is `same_files` only when every member of the group shares that audio
  (`dupSet.sameFiles`);
- the same ASIN or the same ISBN;
- the same author, title and narrator (normalized) **and** lengths within a
  minute or 2%, whichever is more, so an abridged edition isn't called a copy
  (reason `same_book`). An unknown length (0, no ffprobe) only matches another
  unknown one. A failed probe therefore can't join an abridged edition to an
  unabridged one through itself.

The discs of a book split across disc folders (the `split_discs` predicate)
never group. They look alike (one title, similar lengths), but they have their
own issue, whose fix joins them.

Within a group, the copy worth keeping comes first, by:

1. the better format tier;
2. a single file;
3. the higher bitrate;
4. more listeners.

With `across`, the duplicates list also holds pairs from different libraries
(`crossMatches`). A match through a third book is enough to connect a group
within one library, but each cross-library pair needs a match between its own
two books. A signal more than 16 books in any one library share
(`maxCrossCopies`), such as a placeholder ISBN, makes no cross-library pairs.
Those books still group within their library and can still pair across
libraries on another signal. Paging is in the
[API reference](api/reference.md#get-apiv1adminissuesduplicates).

#### Ignoring and offline libraries

An ordinary Health ignore follows the book's path. A split-disc ignore covers
the parent folder, so the set stays ignored when a different disc comes first.
A duplicate dismissal covers the exact group or cross-library pair. See
[Health ignore storage](data-model.md#health-ignores).

`GET /admin/issues` lists libraries whose root is offline beside the issue
categories, using the same availability probe as the library list.

## Move detection

Re-tagging keeps durable state through the path key. **Moving** a file keeps it
through the fingerprint:

- `fingerprintFile` computes the SHA-256 of the size, the first 64 KiB and the
  last 64 KiB. That is cheap on huge audiobooks, and it is stored in
  `books.content_hash`. It is explicitly *not* an identity, only a move
  detector.
- `Scanner.detectMoves` runs early in each scan. It does work only when
  something both **disappeared** (in the stored signatures, not discovered)
  and **appeared** (discovered, not stored), which keeps fingerprinting off the
  hot path of normal scans. It fingerprints each new book's primary file,
  caching the result on the book so `enrich` doesn't re-read it. It then
  matches against the stored fingerprints of the vanished paths
  (`catalog.FingerprintsForPaths`).
- A match is not a move when it is one folder seen two ways. Turning a folder
  book into a collection (or back) leaves a book at a path nested in the
  other, fingerprinted by the folder's first part, but it is a different book.
  `reclassified` skips such a pair: nested paths with different sizes. An
  equal size, a single-part folder, is still the same book.
- A real match calls `catalog.MoveDurableState(lib, oldPath, newPath)`. A
  same-path call is a no-op. It moves every path-keyed book table, among them
  `progress`, `bookmarks`, `notes`, `listening_history`,
  `listening_sessions`, `listening_daily`, `favourites`, `up_next`,
  `collection_items`, `ratings`, `book_enrichment`, `issue_ignores`,
  `duplicate_decisions`, `book_overrides`, `chapter_overrides`, `chapter_choices`, `chapter_edits`,
  `book_covers` and `book_matches`. So a rename or move never orphans a user's position, queue entry, collection entry or rating, a
  book's attached ASIN, an issue an admin ignored, or an admin's edits and
  custom cover.
- After a [partial](#scan-history-scan_runs) discovery a book not found is not
  known to be gone, since its folder may be one the walk skipped. So
  `detectMoves` looks at each old path a new book matches (`bookOnDisk`,
  bounded, erring toward present) and moves only one that is gone from disk. A
  look given up on, or one that failed in a way a retry may get past (`EIO`,
  `ESTALE`, `ENOTCONN`, `ETIMEDOUT`, `EHOSTDOWN`: `transientFault`), is unknown
  (`diskUnknown`), never gone. A permission error counts as present. So a copy
  of a stuck book never takes its state.

### The two transactions of a move

`MoveDurableState` runs **two transactions**, each all or nothing:

1. **The book's own state** (`moveBookState`). `book_enrichment` and
   `issue_ignores` move with `UPDATE OR REPLACE`. The same transaction
   rewrites the book's path in every `duplicate_decisions` row that names it.
   Then, if the moved book has any metadata override, chapter override,
   chapter choice, edited chapter
   list, custom cover or recorded community match, the destination's rows in
   **all six** of those tables are deleted first, and the moved book's set takes their place. Edits and cover follow the book as one set,
   so a stale lock or cover left at the new path by an earlier book can't merge
   in. A moved book with none of them keeps the new path's own rows, as any
   book appearing there would.
2. **The per-user state** (`progress`, `bookmarks`, `notes`,
   `listening_history`, `listening_sessions`, `listening_daily`,
   `favourites`, `up_next`, `collection_items`, `ratings`). It moves through
   `carryListeningState` (`catalog/listening.go`), the one list of per-user
   path-keyed tables, which a [join](#joined-books-disc-sets) uses too. A move
   is a join of one part at offset 0 that ends the book, except for a
   collision:
   - Where a listener already has progress at the new path (a row a removed
     book left there), the **newer save wins whole** (`mergeNewest`:
     `updated_at`, then `version`). The further position does not win, since
     that row says nothing about the moved book. The result takes a version
     above both rows.
   - A favourite lands once.
   - A queue or collection entry already at the new path keeps its own
     position, and the moved one is dropped.
   - Of two ratings, the newer `updated_at` wins the whole row. A tie keeps the
     one already there.

   So a collision does not fail the move.

The transactions are separate so that a failure carrying the per-user state
can't also strand the admin's edits and cover at a path the scan is about to
prune. The book is then indexed at its new path, and that upsert layers the
moved edits back on.

### Folder favourites follow a folder rename

A favourite can sit on a navigation folder (an author or a series), which has
no book of its own to move. After the books move, `renamedFolders` works out
which folders the moves say were renamed. It takes the folders holding each
moved book's old and new path, then goes on up while the folder names match.
For example, `Author/Series A/Book` moving to `Author/Series B/Book` pairs
`Author/Series A` with `Author/Series B`.

`catalog.MoveFolderFavourites` carries the folder's favourites to the new path,
landing once like a book's, and moves its `split_disc_set` Health ignore with
them. It does so only when:

- every move out of the folder agrees on where it went; and
- the old folder is gone from disk **by exact name**. `dirPresent` checks each
  name along the path against its parent's listing, because a case-insensitive
  filesystem (macOS, most SMB shares) still answers to a folder renamed only in
  case (`WIth` to `With`). A folder it can't read counts as present, so its
  favourites stay.

A book moved out of a folder that is still there says nothing about that
folder. Folder overrides and share paths are not carried.

## On-demand indexing (`IndexPath`)

Content handlers (`item`, `chapters`, `cover`, `meta`) resolve
`(library, path)` in one place, `bookForPath`. It tries, in order:

1. `catalog.GetBookByPath`;
2. the indexed folder book **holding** the path (`catalog.GetBookHolding`): a
   part of a folder book, a disc folder of a joined book, or a file in one. The
   innermost wins;
3. `Scanner.IndexPathWithin`.

So a client can open a book it found in the filesystem view **before the
background scan has reached it**. The `/fs` listing flags such a folder
[`pending_book`](api/reference.md#get-apiv1librariesidfs). And the disc paths
that shipped clients still hold after a join are answered from the index,
instead of re-walking and re-probing every disc on each request.

Every read of one book shares one flight (`Scanner.indexShared`, keyed by
library and book path): on-demand indexes, the scan's own read, `IndexMoved`
and an admin's Re-read. So no two reads of one book run side by side. A book
page asks for `item` and `chapters` at once. Only the first request reads and
probes the book, while the other waits for it and loads what it stored.

- Each request resolves the book and passes its own scope check before it
  joins.
- From 2.7.0 the read runs on its own goroutine for up to 10 minutes
  (`indexTimeout`), ended by the server's base context at shutdown, not by the
  request that began it. A request that ends gets its context error, and the
  read still finishes and is saved, so its probes aren't thrown away.
- A waiter whose own request ends stops waiting.
- A Re-read waits for a held flight, then reads the book afresh.
- From 2.7.0 no read waits on another read of the book for longer than one
  look's time (`lookTimeout`: 10 seconds for an on-demand read, the probe's
  time for a scan's) while that read has not returned, and never on a
  read a stopped scan left behind (`waitFlight`). A scan's read that has
  returned is waited on until its batch write. A scan then keeps the book as
  stored with an `unreadable` problem (`keepLeft`); an on-demand read gives up
  with `503 share_not_answering`.
- A request still waiting when the server's shutdown ends the read answers
  `503 stopping` (`library.ErrStopping`), as do a Re-read and the Bridge's
  rescan, not a `500`.
- A waiter whose flight was given up (a scan that stopped, a read past
  `indexTimeout`) reads the book itself.
- The read stays inside the per-mount bounds of
  [the in-process probe](#the-in-process-probe).

A book found **above** the requested path must be in the caller's scope too
(`Scope.Allows(book.RelPath)`). A share granting only a disc folder or one file
of a book doesn't reach the book. `IndexPathWithin` checks the same through its
`allow` callback before it probes or indexes anything. Either way the error is
`library.ErrNotAllowed`. Handlers answer it with the same out-of-scope `403`
(`no access to this path`) as a path outside the share, so the answer says
nothing about what is there. `stream` is scoped on the file path itself, so the
granted files still stream.

`IndexPath`:

1. **Gates the path** through `SafeJoin`, but then derives the working path
   from the **unresolved** join. `SafeJoin` returns a symlink-resolved path.
   Using it would produce `rel_path` keys that disagree with the full scan,
   which walks the root unresolved, whenever any component of the root is a
   symlink (macOS `/tmp → /private/tmp`, NAS mounts).

   The path must also be spelled **as on disk** (`dirPresent`). A case or
   normalization variant opens on a case-insensitive filesystem (the default
   on macOS and Windows). But the scan names a book by the folder listings'
   spelling, so indexing the variant would add a duplicate book that everyone
   sees. Such a path is `ErrNotIndexable`.
2. **Classifies the containing directory exactly as a full scan would**
   (`booksInDir`, including overrides and the root case). When the path is in
   a joined folder it uses `joinRoot` and `joinedBook`, and walks the folder's
   subtree only then. `pickBook` then selects the book the requested path
   resolves to: the book itself, the folder book a clicked *part* belongs to,
   or the joined book a disc folder belongs to. All resolve to the same book.
3. **Enriches and upserts that one book.** `UpsertBook` layers its enrichment
   and any admin edits on in the same transaction, so a book indexed on demand
   shows its edited values at once. It then returns the full book with
   chapters.

A path that is not a book returns `ErrNotIndexable`, which handlers map to 404:

- a directory with no direct audio;
- a directory the detector treats as a collection;
- a path the library's [ignore rules](#ignore-rules) cover.

So does a path with a hidden segment. `library.ContentPath` is the one statement of the hidden-segment rule.
`ContentJoin` is `SafeJoin` with that rule first. `IndexPathWithin`, `listDir`
and every path-taking content route (`scopedPathIn`, which answers it `404`
after the scope check) share it. So nothing indexes, lists, streams or serves a
path through a dot-folder by name, such as the Bridge's `.audiosilo/` or a
share's `.Trash`. `library.ErrHidden` is both `fs.ErrNotExist` and
`ErrNotIndexable`.

### A move the Bridge reports

**`IndexMoved`** is `IndexPath` for a book the Bridge has just moved: the
Bridge's [`POST /bridge/rescan`](api/reference.md#post-apiv1bridgerescan) with
`from`. It carries the durable state from `from` exactly as
[move detection](#move-detection) does (`carryMove`, then the favourites of the
folders it left), and drops the old row. It does so only when all of these
hold:

- no book resolves at `from` on disk any more (`bookOnDisk`, which errs toward
  present: a path it can't check keeps its state);
- the fingerprints match;
- it isn't one folder seen two ways.

Otherwise `from` is ignored and logged. The state is carried before the new
book is indexed, so its row resolves with the carried edits.

When the server can't tell now, it indexes nothing, carries nothing and answers
`503 share_not_answering`. It can't tell when the look at `from` is unknown
(see [Move detection](#move-detection)), or when the new book's fingerprint
can't be read for a reason a retry may get past (`metadata.FingerprintErr`).
The Bridge's retry, once the share answers, carries the state. A read that
kept the new book as stored because a file did not answer also answers that
`503`, though the state was carried already (`readOwn`).

### A move found on demand

A book renamed or moved on disk and opened before a scan reaches it (a renamed
folder opened from Folders) would otherwise start empty. Its old row would be
pruned, with its listening state left behind. So the first on-demand index of a
book (`leadIndex`) looks for where it was before:

1. `Scanner.movedFrom` asks `catalog.MoveCandidates` for the indexed books with
   its fingerprint (its own and `byteFirstFingerprint`). There are none when a
   book is indexed at the path already.
2. It takes the first that is no longer on disk (`bookOnDisk`).
3. That path is the `from` of `indexBookFrom`. It is checked and carried as
   `IndexMoved`'s is (progress, bookmarks and the rest), and the old row is
   dropped.

When it can't tell, because a candidate's look is unknown or the new book's
fingerprint went unread for a reason a retry may get past
(`fingerprintUnknown`), `IndexPath` and `ReindexPath` index nothing and answer
`503 share_not_answering`, and so does every request waiting on the same read.
A book indexed without its state would leave that state on the old row for the
next scan's prune. A request made once the share answers carries the state.

### Reading one book again

`POST /admin/libraries/{id}/book/rescan?path=` (the console's "Read the files
again" and Health's "Read again") calls `IndexPath` for an already-indexed book
too. It re-reads that one book's files now (tags, ffprobe, cover, read
problems) **outside** the job queue, since one book shouldn't wait behind a
library scan, and answers with the book page.

The re-read runs on a context detached from the request: the server's
lifetime, capped at 10 minutes (`rescanBookTimeout`). Probing every part on a
slow share can outlast the request timeout, and the result is still saved
then. A path with no book any more is `404` with `code: "not_indexable"`.

Each look the re-read makes at the book's files waits at most 10 seconds, as an
on-demand read's does (see [the in-process probe](#the-in-process-probe)); its
audio's read keeps the probe's 30 seconds. A share that stopped answering is
therefore `503 share_not_answering` after about 10 seconds, or 30 when a stat
answers from a cache while the audio's reads hang. The
console shows "Couldn't read the files". The Bridge's rescan is the same.

## The unavailable-root guard

`ErrLibraryUnavailable` protects the index when a network share (SMB or NFS)
drops. The scanner **aborts without pruning** when any of these holds:

1. the root doesn't answer the bounded root probe within 2 seconds. A hung
   hard mount would otherwise hold the one scan worker and every scan queued
   behind it;
2. the library root is missing or not a directory (`os.Stat` before
   discovery), or the server's user may not list it (`fsaccess.CheckRead`). A
   root another user owns, as on a NAS share, would otherwise read as an empty
   library scanned OK. The error names the folder, the user the server runs as,
   the folder's owner and the fix (see
   [Folder permissions](configuration.md#the-servers-own-checks));
3. discovery returns **zero** audio files while the index still has books. An
   existing but empty mount point looks exactly like this, and letting the
   prune step run would wipe every indexed book. The one exception: when the
   library's [ignore rules](#ignore-rules) cover every indexed book, an empty
   discovery is what the rules asked for, and the scan prunes.

A *per-entry* read error during the walk is related but distinct. It is
commonly a permission-denied subtree on a partly readable mount, or a folder on
a share that stopped answering. The scanner warns and **skips** it, and does not
fail the scan. Aborting the whole scan would be worse, but silently dropping
those books would let the prune step remove them, so the run is partial and
prunes nothing (see
[A folder that does not answer](#a-folder-that-does-not-answer)). An audio file
gone by the time discovery looks at it makes the scan partial the same way (see
[A rescan that finds nothing changed](#a-rescan-that-finds-nothing-changed)).

### Reporting it to the console

The admin console shows a library whose root is unreachable as "Folder
unavailable", from two signals.

**The last scan's outcome.** When a scan ends in `ErrLibraryUnavailable`,
`Scan` sets `ScanProgress.Unavailable`.
[`GET /admin/libraries/{id}/scan`](api/reference.md#get-apiv1adminlibrariesidscan)
reports it as `unavailable: true` until a later scan finishes without it.

**A live probe.** `Scanner.RootsAvailable(libs, indexed)` backs the
`available` field of
[`GET /admin/libraries`](api/reference.md#get-apiv1adminlibraries). A root is
unavailable when the last scan stopped at the guard, or when it is missing,
unreadable, not answering, or empty while books are still indexed under it.

- The probe (`rootProber`, `internal/library/roots.go`) opens the root and
  reads at most one entry.
- A hard-mounted dead share can block that for minutes, so a check never waits
  longer than `rootProbeTimeout` (2 s). An unanswered probe counts as
  unavailable.
- At most one probe per root runs at a time, and its answer is cached for
  `rootProbeTTL` (15 s).
- A probe already stuck past the timeout answers "not responding" at once for
  every later check while it stays stuck. A dead mount therefore costs one
  timeout, not one per request.
- Every finished scan drops the cached answer, so the next check looks again.
- `Scanner.RootStatuses` fans the probes out in parallel, so a dead share
  costs the whole list at most one timeout. `RootsAvailable` returns only the
  availability. Health's list ([`GET /admin/system`](api/reference.md#get-apiv1adminsystem))
  takes each root's availability and disk space from one look at its probe
  (server#225). It used to look twice, and an answer that expired between the
  two looks cost a second probe and its wait. A root that goes offline shows
  within about 17 seconds (the TTL, then the probe's timeout).

The same list also carries each library's `ScanProgress` as `scan`, which is
what the console polls.

Every admin request that starts a scan goes through the API's `startScan`,
which calls `Scanner.Enqueue` with the requesting admin as `started_by`. Those
requests are `POST …/scan`, `POST /admin/scan`, creating a library, an edit
that changes the root or the ignore rules, and setting or clearing a folder
override. The library reads as queued (or running) before the request returns.
So the first status poll sees the scan, even when a small library would
otherwise finish between the two requests. There is no per-request background
scan (the old `ScanInBackground`, one detached goroutine per request with
different libraries scanning in parallel, is gone).

:::note
Library roots must be **local paths** (mount remote shares first). The guard is
the safety net, not the design.
:::
