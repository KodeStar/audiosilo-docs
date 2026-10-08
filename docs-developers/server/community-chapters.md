---
title: "Community chapters"
description: "How audiosilo-server fits a community recording's chapter list onto a book's own audio: where the list comes from, when a book is checked, the anchored piecewise fit and its tolerances, pause snapping, the outcomes, and how a fitted list replaces the scan's chapters without touching the files."
---

The community metadata database holds a chapter list for most recordings
(per recording: each chapter's title, start and length, timed on that
recording's audio). The server checks each book that has an ASIN or ISBN
against the chapter list of its **exact** matched recording and, when the list
fits the book's own audio, can use it in place of the scan's chapters. Files on
disk are never touched.

Three pieces, each with one job:

| Piece | Job |
|---|---|
| `internal/chapteralign` | The fit. Pure, no I/O: files, the scan's chapters, the community list and a pause `Prober` go in, a `Result` (status, `Detail`, fitted chapters) comes out. `testdata/mythos` is a real golden case. |
| `internal/chaptercheck` | The `Runner`: a background pass and on-demand checks. Fetches the list (`meta.Service.RecordingChapters`), finds pauses with ffmpeg (`media.DetectSilences`), fits, and records the outcome (`catalog.SaveCommunityChapters`). |
| `catalog/communitychapters.go` | The stored check (`community_chapters`), which books are due, and `applyChapterSource`, which decides which chapters a book has. |

`chaptercheck` runs apart from the scan job queue, as bulk matching does: it
waits on the network, and `library` must not import `meta`.

## Where the chapter list comes from

`meta.Service.RecordingChapters(asin, isbn)` looks the identifier up (an ASIN,
else an ISBN) and fetches the chapters of the recording **the lookup names**
(`recording_id`), through metaserve's
[`GET /api/v1/works/{id}/recordings/{rid}/chapters`](../meta/api.md#apiv1worksidrecordingsridchapters).
It never falls back to `pickRecording`'s first recording, which the enrichment
envelope uses: a work's chapters belong to one recording, and another may be a
different edition altogether. Nothing is cached in `internal/meta`; the
`community_chapters` row is the cache.

| Lookup | Recorded status |
|---|---|
| no match, or a match that names no recording | `no_match` |
| the recording has fewer than two chapters (or the metaserve predates the route, `404`) | `unavailable` |
| two or more chapters | the fit's status (below) |

A service error records nothing, so the book stays due.

## When a book is checked

`API.StartChapterChecks` starts `Runner.Run` for the server's lifetime (the
launcher calls it; nothing runs without a metadata service). Every **10
minutes**, and at once on a `Kick`, a pass lists the books due a check
(`catalog.DueChapterChecks`):

- the book has an ASIN or ISBN and a known duration, and
- it has no check yet, or its check's `basis` differs, or the check is older
  than **30 days**.

`basis` is what the check depended on (`chapterBasisExpr`):
the identifiers, the duration in ms, a hash of the scan's own chapters
(`books.chapters_hash`) and the book's files in play order, relative to the book
(`''` for a single-file book). A new match, other audio, re-tagged chapters or a
file renamed in place makes the book due and its check stale; a move does not
(the same audio: the fit stores its files relative to the book too, so its
chapters follow the book), nor does a re-index of an unchanged book (an
`indexed_at` would). Due books come oldest check first, 50 at a time, two
checked at once, each bounded to 5 minutes, of which the pause searches get 4:
past that the remaining boundaries are left unsnapped (counted as approximate)
and the fit is still recorded (the workers are `internal/pool`'s `Each`, shared
with bulk matching). A book whose check failed records nothing and waits an
hour before it is tried again, so failing books can't fill the batch and starve
the rest; five failures in a row, or metadata being switched off, end the pass,
and after such a pass kicks are ignored until the next tick. A background
recheck that finds the same list (`list_hash`) for the same audio only renews
`checked_at`: no pause is looked for again and nothing is rewritten. A check an
admin asks for always fits again (a first fit made without ffmpeg, say, gets
its pauses).

A `Kick` follows every committed book change: the API registers it with
`Catalog.OnBookChange`, which `UpsertBook` (a scan), `EditBook` and `EditBooks`
(an edit, an accepted match, a [bulk match run](api/reference.md#bulk-community-matching)
applying), `SetEnrichment` and clearing community matches fire after their
transaction. A kick waits 5 s for the kicks behind it (a scan kicks once per
book), so a burst is one pass, and the pass only checks what is due.

`POST /admin/libraries/{id}/book/community-chapters` is the on-demand check:
`Runner.Start` checks one book in the background under the server's context
and returns at once; `Runner.Checking` reports it from that moment, which is the
admin book page's `community_checking`. A book already being checked is not
checked twice (`ErrBusy` for the background pass, a no-op for `Start`).

Note that the scanner reads no ASIN from tags: a book gets its identifier from
an admin edit, an accepted match, a bulk match or the manager's enrichment, and
is checked from then on.

## The fit (`chapteralign.Align`)

The book's audio can differ from the recording the community timed: an intro or
outro trimmed, a publisher's preview missing at the end, a little drift between
releases, the book split into files. So the fit is **anchored and piecewise**
rather than one global shift: boundaries both lists agree on are pinned, the
community boundaries between two pins are placed in proportion, and each is
then snapped to the pause it sits in.

Inputs: the book's files in play order (path, duration; one for a single-file
book), the **scan's own** chapters (`books.scanned_chapters`, so a recheck
never fits against community chapters standing in), the
community list (sorted by start, duplicates of a start dropped) and an optional
`Prober`.

1. **Boundaries.** Every file start and every chapter start on the whole-book
   timeline. A file holding two or more chapters has chapters of its own; a
   file holding one is "one per file", which counts as no chapters.
2. **Title anchors** (`anchorTitles`). The book's start is pinned to the
   community start. Each titled boundary pairs with the community boundary
   within `max(120 s, 1% of its position)` whose title is most similar (the
   nearest of equals), in order. Similarity (`titleSim`) is the overlap of the
   two titles' word sets over the smaller set, and must be at least **0.6**:
   leading numbering is stripped (`1. `, `Chapter 3: `, `Part 2 - `), stop words
   (`the`, `a`, `of`, ...) are left out unless a title is nothing else, and a
   word of five letters or more one edit away counts as the same word (a typo:
   "Persophone"). A title that is only numbering ("Chapter 12") pairs on the
   number with a bare one or one that adds a name ("12", "Chapter 12: The
   Storm"), never across kinds ("Part 2" is not "Chapter 2").
3. **Time anchors** (`anchorTimes`). Each boundary still unpinned (a file
   boundary, an untitled or renamed chapter) is pinned to the community
   boundary within **5 s** of its time plus the offset of the nearest anchors
   around it, searching only between those anchors. With no anchor nearby, the
   offset is the median offset from each boundary to its nearest community
   boundary within 30 s.
4. **The end** (`anchorEnd`). The end of the audio pins to the community end
   when it is within `max(30 s, 0.15%)` of where the last anchor's offset puts
   it; otherwise to a community boundary that close, provided what follows it
   is at most `min(20 min, 10% of the recording)`. What follows is not in this
   copy (a preview, credits): each such chapter of a minute or more is listed in
   `detail.omitted`. Neither: `length_mismatch`.
5. **Stretches** (`checkStretches`). Each stretch between anchors of at least
   120 s on either timeline is measured as local length over community length.
   Any stretch off by more than **10%**, or the length-weighted median (of the
   stretches 120 s long in the book) off by more than **1%**, is another
   edition: `length_mismatch`. `detail.ratio` and `detail.worst`
   report them.
6. **Coverage** (`checkCoverage`). Every file boundary must be anchored, or a
   community chapter straddles it: `crosses_files`, with `detail.straddle`
   naming the chapter, where the boundary falls and the files either side.
   And at least **80%** of the book's own chapters must be anchored, ignoring
   any within 30 s of either end (a recording's own intro or credits):
   otherwise `structure_mismatch`.
7. **Placing** (`place`). An anchored community boundary takes its anchor's
   time exactly; every other one is interpolated linearly between the anchors
   around it.
8. **Snapping** (`snap`). Each placed boundary inside the audio asks the
   `Prober` for the pauses within `4 s + drift` of it (at most 30 s), where
   drift is how much the stretch's two lengths differ, kept inside its file
   and 0.25 s clear of its neighbours. It moves onto the **longest** pause of
   at least **0.4 s**, starting **0.3 s** before the speech resumes (never
   before the pause starts). The chaptercheck prober is ffmpeg's
   `silencedetect` at **-40 dB** with `d=0.4`, run on the window alone (seek
   first, so a window costs a few seconds of decoding however long the file).
   A boundary that can't be snapped while its stretch drifts more than 2 s
   counts in `detail.approximate`. Without ffmpeg (or on `ErrNoProbe`) the fit
   places by proportion alone.
9. **Emitting** (`emit`). The chapters cover the audio with no gap, in the
   scanner's `metadata.Chapter` shape (`file_path`, in-file `start`/`end`,
   `book_offset`): a chapter under 0.25 s is dropped, the first chapter of each
   file starts at the file's start, and no chapter runs past its file.
10. **Classifying** (`classify`):

| Status | When |
|---|---|
| `fill` | the book has no chapters of its own (none, or one per file) |
| `same` | the book's chapter starts are exactly the fitted ones, titles equal (lowercased, punctuation ignored, numbering kept) |
| `titles` | as `same`, but some titles differ: `detail.title_diffs` (`index`, `current`, `community`) |
| `refine` | every chapter of the book (bar the edges) is anchored, and the community has more |
| `restructure` | the community chapters fit, but divide the audio differently |
| `length_mismatch` · `structure_mismatch` · `crosses_files` | the reasons a fit fails (no chapters) |

The golden case, `testdata/mythos`, is Stephen Fry's *Mythos* as one m4b with
ffprobe's 34 broad chapters against the community recording's 174: 32
anchors, 140 boundaries snapped, none approximate, 173 chapters, and
"Preview: Chapter 1 from Odyssey" omitted - a `refine`.

## Storing the check and choosing the chapters

**`community_chapters`** (migration `0035`) holds each book's last check: PK
`(library_id, path)`, `basis`, `status` (a fit status, `no_match` or
`unavailable`), `work_id`, `recording_id`, `list_hash` (names the community
list), `detail` (the `chapteralign.Detail` JSON), `chapters` (the fitted chapters
JSON, `[]` unless fitted) and `checked_at`. It is a record of the index, rebuilt by checking again, but
path-keyed with no FK to `books` like `book_enrichment`, so an index rebuild
keeps it, and `moveBookState` moves it with the book. See
[Data model](data-model.md#the-rebuildable-index).

Three `books` columns (same migration) go with the `chapters` rows:
`chapters_source` (`''` = the scan's own, `'community'`), `chapters_fit` (a hash
of the fit in the rows, so an unchanged one is not written again) and
`scanned_chapters`: always the scan's own chapters as JSON with their scanned
titles, written by every `UpsertBook`, as `books.scanned` keeps the scanned
metadata (`''` on a row from before 0035, whose rows are the scan's).

The admin's choice is a row of **`chapter_choices`** (same migration;
`(library_id, path)`, `source` = `files` or `community`, `updated_by`,
`updated_at`; `auto` in an edit deletes it). It is durable, path-keyed admin
state like `book_overrides` but apart from it: it picks chapters, not a
metadata value, so it is no part of `edited` / `edited_fields`.
`moveBookState` moves it with the book's other edits; a disc join does not copy
it (the joined book is other audio).

`refreshEffective` (every scan upsert, edit, enrichment write and recorded
check) calls `applyChapterSource`, the one statement of the rule:

- the **community's** chapters when the check fitted, its `basis` is the
  book's current one, and either the admin chose them or there is no choice and
  the status is `fill`;
- otherwise the **scan's** own (from `scanned_chapters`).

A check whose `basis` is not the book's current one is **stale** and never
applied: a rescan that changed the audio, or a removed match, leaves the book on
the scan's chapters (never on chapters fitted to files that may be gone) until
it is checked again. The admin book page marks such a check `stale: true`.

`SaveCommunityChapters` records a check and re-applies in the same
transaction. `UpsertBook` always writes the scan's chapters (rows and snapshot)
and resets `chapters_source`, then `refreshEffective` re-applies the choice in
the same transaction, so a rescan never shows the scan's chapters for a
moment. Chapter renames (`chapter_overrides`, keyed by
file and start) apply after the source, so renaming a community chapter works
like any rename, and switching back restores the files' chapters with their
own renames.

## On the wire

All additive; an old client reads community chapters as ordinary chapters.

- `GET /libraries/{id}/chapters` and the book JSON of `GET /libraries/{id}/item`
  carry `chapters_source: "community"` when the chapters are community ones
  (absent otherwise). See [`/chapters`](api/reference.md#get-apiv1librariesidchapters).
- The admin book page gains `chapter_source`, `chapter_choice`,
  `community_chapters` (the check's status and detail, not the fitted list) and
  `community_checking`; `PATCH .../book` and
  `POST /admin/books/bulk` take `chapter_source`; the check is
  [`POST .../book/community-chapters`](api/reference.md#post-apiv1adminlibrariesidbookcommunity-chapters).
- `GET /admin/books` rows carry `chapters_source` and `chapters_check`, and
  Health gains the `detailed_chapters` kind (a `refine` check with no choice
  made; see [Issues](scanner.md#issues)).

The player shows a caption under community chapters and refreshes a downloaded
book's saved chapters when they change (see
[The book page](../frontend/book-page.md#the-chapters-tab) and
[Offline](../frontend/offline.md#lifecycle)); the console's panel is described
under [Built-in web UI](web-ui.md#what-the-console-has-today).
