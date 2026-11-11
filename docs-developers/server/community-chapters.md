---
title: "Community chapters"
description: "How audiosilo-server fits a community recording's chapter list onto a book's own audio: where the list comes from, when a book is checked, the anchored piecewise fit and its tolerances, pause snapping, the outcomes, how a fitted list replaces the scan's chapters without touching the files, and the generated chapters a Bridge found in the narration (the source between the community's and the files')."
---

The community metadata database holds a chapter list for most recordings. Each
list gives every chapter's title, start and length, timed on that recording's
audio. The server checks each book that has an ASIN or ISBN against the chapter
list of its **exact** matched recording. When the list fits the book's own
audio, the server can use it in place of the scan's chapters. It never touches
the files on disk.

Three pieces each have one job:

| Piece | Job |
|---|---|
| `internal/chapteralign` | The fit. Pure, with no I/O. Files, the scan's chapters, the community list and a pause `Prober` go in, and a `Result` (status, `Detail`, fitted chapters) comes out. `testdata/mythos` is a real golden case. |
| `internal/chaptercheck` | The `Runner`, which runs a background pass and on-demand checks. It fetches the list (`meta.Service.RecordingChapters`), finds pauses with ffmpeg (`media.DetectSilences`), fits, and records the outcome (`catalog.SaveCommunityChapters`). |
| `catalog/communitychapters.go` | The stored check (`community_chapters`), which books are due, and `applyChapterSource`, which decides which chapters a book has. |

`chaptercheck` runs apart from the scan job queue, as bulk matching does,
because it waits on the network and `library` must not import `meta`.

## Where the chapter list comes from

`meta.Service.RecordingChapters(asin, isbn)` looks the identifier up (an ASIN,
else an ISBN). It then fetches the chapters of the recording **the lookup
names** (`recording_id`), through metaserve's
[`GET /api/v1/works/{id}/recordings/{rid}/chapters`](../meta/api.md#apiv1worksidrecordingsridchapters).

It never falls back to `pickRecording`'s first recording, which the enrichment
envelope uses. A work's chapters belong to one recording, and another recording
may be a different edition altogether. `internal/meta` caches nothing, because
the `community_chapters` row is the cache.

| Lookup | Recorded status |
|---|---|
| no match, or a match that names no recording | `no_match` |
| the recording has fewer than two chapters, or the metaserve predates the route (`404`) | `unavailable` |
| two or more chapters | the fit's status (see [Classifying](#the-fit-chapteralignalign)) |

A service error records nothing, so the book stays due.

## When a book is checked

The launcher calls `API.StartChapterChecks`, which starts `Runner.Run` for the
server's lifetime. Nothing runs without a metadata service. Every **10
minutes**, and at once on a `Kick`, a pass lists the books due a check
(`catalog.DueChapterChecks`). A book is due when:

- it has an ASIN or ISBN and a known duration, and
- it has no check yet, or its check's `basis` differs, or the check is older
  than **30 days**.

### The basis

`basis` is what the check depended on (`chapterBasisExpr`):

- the identifiers;
- the duration in ms;
- a hash of the scan's own chapters (`books.chapters_hash`);
- the book's files in play order, relative to the book (`''` for a single-file
  book).

These make the book due and its check stale: a new match, other audio,
re-tagged chapters, or a file renamed in place. A move does not, because it is
the same audio, and the fit stores its files relative to the book too, so its
chapters follow the book. A re-index of an unchanged book does not either,
which an `indexed_at` in the basis would.

### The pass

- Due books come oldest check first, 50 at a time, with two checked at once
  (`internal/pool`'s `Each`, shared with bulk matching).
- Each check is bounded to 5 minutes, of which the pause searches get 4. Past
  that, the fit leaves the remaining boundaries unsnapped (counted as
  approximate) and is still recorded.
- A book whose check failed records nothing and waits an hour before it is
  tried again, so failing books can't fill the batch and starve the rest.
- Five failures in a row, or metadata being switched off, end the pass. After
  such a pass the runner ignores kicks until the next tick.
- A background recheck that finds the same list (`list_hash`) for the same
  audio only renews `checked_at`. It looks for no pause again and rewrites
  nothing.
- A check an admin asks for always fits again. For example, a first fit made
  without ffmpeg then gets its pauses.

### Kicks

A `Kick` follows every committed book change. The API registers it with
`Catalog.OnBookChange`. These fire it after their transaction:

- `UpsertBooks` and `UpsertBook` (a scan);
- `EditBook` and `EditBooks` (an edit, an accepted match, or a
  [bulk match run](api/reference.md#bulk-community-matching) applying);
- `BackfillASIN`;
- clearing community matches;
- setting or removing a custom cover.

They fire to every listener, so the
[cover colour pass](media.md#the-background-colour-pass) hears them too. A kick
waits 5 s for the kicks behind it, because a scan kicks once per book. A burst
is therefore one pass, and the pass only checks what is due.

### On-demand checks

`POST /admin/libraries/{id}/book/community-chapters` is the on-demand check.
`Runner.Start` checks one book in the background under the server's context and
returns at once. `Runner.Checking` reports the check from that moment, and that
is the admin book page's `community_checking`. A book already being checked is
not checked twice: the background pass gets `ErrBusy`, and `Start` does
nothing.

### Where the identifier comes from

The scanner sets no ASIN from tags. It reads them as
[match hints](data-model.md#tag-hints) only. A book gets its identifier from
one of these, and is checked from then on:

- an admin edit;
- an accepted match;
- a bulk match;
- an Audiobookshelf `metadata.json`;
- an enrichment write.

## The fit (`chapteralign.Align`)

The book's audio can differ from the recording the community timed. An intro or
outro may be trimmed, a publisher's preview may be missing at the end, releases
may drift a little, or the book may be split into files. So the fit is
**anchored and piecewise** rather than one global shift:

- boundaries both lists agree on are pinned;
- the community boundaries between two pins are placed in proportion;
- each placed boundary is then snapped to the pause it sits in.

The inputs are:

- the book's files in play order (path and duration; one for a single-file
  book);
- the **scan's own** chapters (`books.scanned_chapters`), so a recheck never
  fits against community chapters standing in;
- the community list, sorted by start, with duplicates of a start dropped;
- an optional `Prober`.

The steps:

1. **Boundaries.** Every file start and every chapter start on the whole-book
   timeline. A file holding two or more chapters has chapters of its own. A
   file holding one is "one per file", which counts as no chapters.
2. **Title anchors** (`anchorTitles`). The book's start is pinned to the
   community start. In order, each titled boundary pairs with the community
   boundary within `max(120 s, 1% of its position)` whose title is most similar
   (the nearest of equals). Similarity (`titleSim`) is the overlap of the two
   titles' word sets over the smaller set, and must be at least **0.6**.
   - Leading numbering is stripped (`1. `, `Chapter 3: `, `Part 2 - `).
   - Stop words (`the`, `a`, `of`, ...) are left out unless a title is nothing
     else.
   - A word of five letters or more that is one edit away counts as the same
     word, to allow a typo ("Persophone").
   - A title that is only numbering ("Chapter 12") pairs on the number with a
     bare number or with one that adds a name ("12", "Chapter 12: The Storm").
     It never pairs across kinds: "Part 2" is not "Chapter 2".
3. **Time anchors** (`anchorTimes`). Each boundary still unpinned, such as a
   file boundary or an untitled or renamed chapter, is pinned to a community
   boundary within **5 s** of its time plus the offset of the nearest anchors
   around it. The search covers only the stretch between those anchors. With no
   anchor nearby, the offset is the median offset from each boundary to its
   nearest community boundary within 30 s.
4. **The end** (`anchorEnd`). The end of the audio pins to the community end
   when it is within `max(30 s, 0.15%)` of where the last anchor's offset puts
   it. Otherwise it pins to a community boundary that close, provided what
   follows that boundary is at most `min(20 min, 10% of the recording)`. What
   follows is not in this copy (a preview, credits), and each such chapter of a
   minute or more is listed in `detail.omitted`. If neither applies, the status
   is `length_mismatch`.
5. **Stretches** (`checkStretches`). Each stretch between anchors of at least
   120 s on either timeline is measured as local length over community length.
   The status is `length_mismatch` (another edition) when any stretch is off by
   more than **10%**, or when the length-weighted median of the stretches
   120 s long in the book is off by more than **1%**. `detail.ratio` and
   `detail.worst` report them.
6. **Coverage** (`checkCoverage`). Two rules:
   - Every file boundary must be anchored. Otherwise a community chapter
     straddles it, and the status is `crosses_files`, with `detail.straddle`
     naming the chapter, where the boundary falls and the files either side.
   - At least **80%** of the book's own chapters must be anchored, ignoring any
     within 30 s of either end (a recording's own intro or credits). Otherwise
     the status is `structure_mismatch`.
7. **Placing** (`place`). An anchored community boundary takes its anchor's
   time exactly. Every other one is interpolated linearly between the anchors
   around it.
8. **Snapping** (`snap`). Each placed boundary inside the audio asks the
   `Prober` for the pauses within `4 s + drift` of it, at most 30 s. Drift is
   how much the stretch's two lengths differ. The window is kept inside the
   boundary's file and 0.25 s clear of its neighbours.
   - The boundary moves onto the **longest** pause of at least **0.4 s**, to
     **0.3 s** before the speech resumes, but never before the pause starts.
   - The chaptercheck prober is ffmpeg's `silencedetect` at **-40 dB** with
     `d=0.4`, run on the window alone. It seeks first, so a window costs a few
     seconds of decoding however long the file is.
   - A boundary that can't be snapped while its stretch drifts more than 2 s
     counts in `detail.approximate`.
   - Without ffmpeg, or on `ErrNoProbe`, the fit places by proportion alone.
9. **Emitting** (`emit`). The chapters cover the audio with no gap, in the
   scanner's `metadata.Chapter` shape (`file_path`, in-file `start` and `end`,
   `book_offset`).
   - A chapter under 0.25 s is dropped.
   - The first chapter of each file starts at the file's start.
   - No chapter runs past its file.
10. **Classifying** (`classify`):

| Status | When |
|---|---|
| `fill` | the book has no chapters of its own (none, or one per file) |
| `same` | the book's chapter starts are exactly the fitted ones, and the titles are equal (lowercased, punctuation ignored, numbering kept) |
| `titles` | as `same`, but some titles differ: `detail.title_diffs` (`index`, `current`, `community`) |
| `refine` | every chapter of the book (bar the edges) is anchored, and the community has more |
| `restructure` | the community chapters fit, but divide the audio differently |
| `length_mismatch` · `structure_mismatch` · `crosses_files` | the reasons a fit fails (no chapters) |

The golden case, `testdata/mythos`, is Stephen Fry's *Mythos* as one m4b. It
fits ffprobe's 34 broad chapters against the community recording's 174, with
32 anchors, 140 boundaries snapped and none approximate. The result is 173
chapters with "Preview: Chapter 1 from Odyssey" omitted, a `refine`.

## Storing the check and choosing the chapters

**`community_chapters`** (migration `0035`) holds each book's last check:

- PK `(library_id, path)`;
- `basis`;
- `status`: a fit status, `no_match` or `unavailable`;
- `work_id`, `recording_id`;
- `list_hash`, which names the community list;
- `detail`: the `chapteralign.Detail` JSON;
- `chapters`: the fitted chapters JSON, `[]` unless fitted;
- `checked_at`.

It is a record of the index, rebuilt by checking again. Like `book_enrichment`
it is path-keyed with no FK to `books`, so an index rebuild keeps it, and
`moveBookState` moves it with the book. See
[Data model](data-model.md#the-rebuildable-index).

Three `books` columns from the same migration go with the `chapters` rows:

- `chapters_source`: `''` for the scan's own, `'community'`, or `'generated'`
  (see [Generated chapters](#generated-chapters)).
- `chapters_fit`: a hash of the fit in the rows, so an unchanged fit is not
  written again.
- `scanned_chapters`: always the scan's own chapters as JSON, with their
  scanned titles, written by every `UpsertBook`, as `books.scanned` keeps the
  scanned metadata. It is `''` on a row from before 0035, whose rows are the
  scan's.

The admin's choice is a row of **`chapter_choices`** (same migration):
`(library_id, path)`, `source` (`files` or `community`), `updated_by` and
`updated_at`. `auto` in an edit deletes the row. It is durable, path-keyed admin
state like `book_overrides`, but kept apart from it. It picks chapters, not a
metadata value, so it is no part of `edited` or `edited_fields`.
`moveBookState` moves it with the book's other edits. A disc join does not copy
it, because the joined book is other audio.

### The rule

`refreshEffective` runs on every scan upsert, edit, enrichment write and
recorded check. It calls `applyChapterSource`, the one statement of the rule. A
book gets:

- the **community's** chapters when the check fitted, its `basis` is the
  book's current one, and either the admin chose them or there is no choice and
  the status is `fill`;
- otherwise the **generated** ones a Bridge found in the narration, when they
  apply (see [Generated chapters](#generated-chapters));
- otherwise the **scan's** own (from `scanned_chapters`).

A check whose `basis` is not the book's current one is **stale** and never
applied. After a rescan that changed the audio, or a removed match, the book
stays on the scan's chapters until it is checked again, never on chapters
fitted to files that may be gone. The admin book page marks such a check
`stale: true`.

`SaveCommunityChapters` records a check and re-applies the rule in the same
transaction. `UpsertBook` always writes the scan's chapters (rows and snapshot)
and resets `chapters_source`. `refreshEffective` then re-applies the choice in
the same transaction, so a rescan never shows the scan's chapters for a moment.

Chapter renames (`chapter_overrides`, keyed by file and start) apply after the
source. Renaming a community chapter therefore works like any rename, and
switching back restores the files' chapters with their own renames.

## Generated chapters

A book with no chapter markers can get a `chapters.json` in its `.audiosilo/`
folder: the chapters a [Bridge found in the narration](../bridge/chapters.md).
The scan stores the checked list in `book_attachments.chapters` (migration
`0051`). The format and its checks are in
[the .audiosilo folder](../bridge/attachments.md#chaptersjson). The code is
`catalog/generatedchapters.go`.

Generated chapters are a source **between the community's and the files'**.
`applyChapterSource` uses them (`applyGenerated`) only when all of these hold:

- **No source was chosen.** `chapter_choices` has no row for the book. An
  admin's `files` or `community` keeps the list out.
- **The community's chapters don't apply.** There is no current fitted check
  that is chosen or a `fill`.
- **The list's files are the book's** (`chaptersOnFiles`). There are as many,
  each with the same path relative to the book's folder (for a single-file book,
  its file name), and the same size.
  - In the same order, the chapters are used as listed.
  - In another order, they move with their files (`movedChapters`). This covers
    a list the Bridge found while the book played its files in byte order,
    before 2.4.0's natural order. Each chapter starts at the same place in the
    same file, by the listed lengths, and runs to the next start in the new
    order.
- **`chapteralign.Align` answers `fill`**, run with **no `Prober`**. There is
  no snapping, because the list is already timed on this audio. `fill` is the
  fit's word for "the book has no chapters of its own" (no file holding two).
  Any other status leaves the scan's own chapters, so a book tagged with
  chapters since never shows the list.

When the list applies:

- the rows are the fit;
- `books.chapters_source` is `'generated'` (`ChaptersFromGenerated`);
- `chapters_fit` is a hash of what the list was fitted from (`generatedKey`):
  the stored list, the scan's own chapters, and the files' book-relative paths,
  sizes and lengths. A refresh of an unchanged book therefore neither decodes
  nor fits the list again.

When the list stops applying (the file is gone, the audio changed, a community
fill, or a `files` choice), the scan's own chapters come back.

`useChapters` is the one write of a stand-in list for both sources. On a row
from before the snapshot, it records the rows as the snapshot. Then, only when
the book's community check was made of the book as it is now, it re-stamps that
check's basis, so the check stays current.

An admin never chooses `generated`. `PATCH .../book {chapter_source}` still
takes `files`, `community` or `auto`. A `files` choice turns found chapters off,
and `auto` brings them back. Recording a changed `chapters.json` re-resolves
the book at once, whether the Bridge's attachments rescan or a scan's backfill
recorded it. The players get the chapters without a re-index.

## On the wire

Every change is additive. An old client reads community chapters as ordinary
chapters.

- `GET /libraries/{id}/chapters` and the book JSON of `GET /libraries/{id}/item`
  carry `chapters_source`. It is `"community"` for community chapters,
  `"generated"` for chapters found in the narration, and absent otherwise. An
  old app shows either as ordinary chapters with no label. See
  [`/chapters`](api/reference.md#get-apiv1librariesidchapters).
- The admin book page gains:
  - `chapter_source`, which can be `generated` too;
  - `chapter_choice`;
  - `community_chapters`: the check's status and detail, not the fitted list;
  - `community_checking`;
  - `generated_chapters_fit`: a stored `chapters.json` fits the files as they
    are now, so it stands in with no choice when the community's chapters don't
    apply.
- `PATCH .../book` and `POST /admin/books/bulk` take `chapter_source`. The
  check is
  [`POST .../book/community-chapters`](api/reference.md#post-apiv1adminlibrariesidbookcommunity-chapters).
- `GET /admin/books` rows carry `chapters_source`, `chapters_check` and
  `chapter_choice` (omitted when automatic).
- Health gains the `detailed_chapters` kind: a `refine` check with no choice
  made (see [Issues](scanner.md#issues)).

The player shows a caption under community chapters, and another ("Chapters
found in the narration on this server") under generated ones. It refreshes a
downloaded book's saved chapters when they change. See
[The book page](../frontend/book-page.md#the-chapters-tab) and
[Offline](../frontend/offline.md#lifecycle). The console's panel is described
under [Built-in web UI](web-ui.md#what-the-console-has-today).
