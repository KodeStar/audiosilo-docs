---
title: Read-along (readalong.align)
description: "Bridge Phase 3c-1: how a book's ebook is lined up with its narration, sentence by sentence, with no agent. The readalong.align job and its refusals, the goal readalong path and the mechanical loop repair, the reuse table, the readalong_aligning stage (the aligner, the heal, the onset snap), the audiosilo-readalong/v1 map, the 50% refusal, how the server indexes, checks and serves the map and tells when it is stale, and the transcript retention."
---

A **read-along map** says where each sentence of a book's ebook is spoken in its
audio. With one, a listener can follow the narration in the text. The Bridge makes
it with the **`readalong.align`** job: it reuses the transcript it kept for the
book (else transcribes the audio), lines the words up with the ebook's text, and
writes the map into the book's [`.audiosilo/` folder](attachments.md#readalongjson)
as `readalong.json`. The server indexes the map, knows when it no longer fits the
book, and serves it at
[`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong).

**No agent anywhere**: no credential, no spend, no agent container. Maps are made
**per book only**, from the console's book page (no bulk action). The player's
side, the Text panel that follows the narration, is Phase 3c-2 and not built yet.

Code: the Bridge's `internal/readalong` (the aligner, pure apart from reading the
EPUB), `internal/epubcfi` (foliate's CFIs in Go), `internal/pipeline/readalong_stage.go`
(the stage), `internal/generate/readalongjob.go` (the job); the server's
`metadata/readalong.go`, `library/readalong.go`, `catalog/readalong.go`,
`api/handlers_readalong.go` and the `readalong.align` kind in `internal/bridge/jobs.go`.
The aligner is a Go port of the read-along spike's Python (the workspace
`READ-ALONG-RESEARCH.md`), held to it by an env-gated parity test.

## The job

`readalong.align` (`generate.ReadalongJob`, the `pipeline` lane, advertised beside
the other kinds; feature `readalong`) needs `library_id` and a book `path`, takes
`params` `{}` or none, and **writes**, so the server queues it only for a books
library the last heartbeat reports mapped and writable. The server refuses it
`409 no_ebook` for a book whose index holds no ebook, and keeps it apart from the
other jobs that transcribe the same audio (the table in
[Kinds are allow-listed twice](pairing-and-jobs.md#kinds-are-allow-listed-twice)):

- a read-along job is refused `409 generate_open` or `409 detect_open` while a
  `sidecars.generate` or `chapters.detect` job is open for the book, parked ones
  included (a read-along cancels neither);
- a new `sidecars.generate` job is refused `409 readalong_open` while a read-along
  job is queued or working, and **cancels a parked one** ("a generate job for the
  book replaced it; make the read-along again after");
- a new `chapters.detect` job is refused `409 readalong_open` while one is open.

The reason: the Bridge runs **one engine book per audio source path**, so two runs
over the same audio must never overlap. Re-aligning a book that already has a
ready map is allowed.

The ebook is **the server's pick**, never the Bridge's own: the book route's
`book.ebook {path, size}` (the [scanner's rule](../server/scanner.md#a-books-ebook),
the same file the reader opens). Before any work the job checks it:

| The ebook | The job fails with |
|---|---|
| the server names none | "this book has no ebook" |
| outside the library's folder, or not there through the mapping | "the book's ebook leaves the library's folder", "the book's ebook isn't at ... through the library's mapping" |
| over 256 MiB | "the book's ebook is over 256 MiB" |
| DRM (`META-INF/rights.xml`, or an `encryption.xml` beyond font obfuscation: the reader's `hasDrm` rule) | "the book's ebook is DRM-protected, so its text can't be read" |
| not a readable EPUB | "the book's ebook isn't a readable EPUB" |

A file of the book the server has no length for fails it too ("the server has no
length for ..., so the read-along can't be timed; rescan the book, then run it
again"): the map's times are built from the server's lengths (below).

## The goal readalong path

Bridge store's `books.goal` gains **`readalong`** (`state.GoalReadalong`). A
goal-readalong book runs:

```
inspecting -> splitting -> asr -> sanitizing -> qa_sweep
  -> [retranscribing -> qa_sweep] -> readalong_aligning -> done
```

`state.PathNext` routes it, and a test walks it for every kind and finds **no
agent state**:

- **Inspect never routes it to `markers_normalizing`** (an agent stage): a single
  file whose marker table isn't usable gets the [windows manifest](chapters.md#the-windows-manifest)
  a markerless file does (`audio.InspectWith` with `WindowUnusable`), since chapter
  boundaries don't matter to an alignment. A marker file it can't window fails
  ("The book's audio file doesn't say how long it is, so it can't be lined up with
  the ebook").
- **`asr` goes to `sanitizing`** even when windowed (never `chapter_detecting`).
- **The mechanical loop repair.** The whole run repairs transcript loops in
  `qa_adjudicating`, an agent stage. For goal readalong, a `qa_sweep` that isn't
  clean writes `qa.MechanicalPlan(report)` as the plan instead: every chapter in
  the retranscribe queue or with a loop finding (a repeated run, a multi-loop, a
  tail-rate hit) is re-transcribed whole, every other chapter accepted, and never
  a tail or mid clip (spliced text has no word timings). `retranscribing` runs it
  (NoContext, as for a whole run). **One round only**: the second sweep goes on
  to `readalong_aligning` clean or not, with a stage note naming the chapters
  left; the heal (below) covers what remains. The spike's single NoContext re-run
  took one book from 56% to 99.96% coverage.

A goal-readalong book holds no series lock (`state.SeriesLockExempt`: it makes
nothing a later volume carries on from), has no series, and contributes nothing.
The console and the player word the stage "Lining up the ebook with the
narration".

## The reuse table

An earlier engine book at the **audio** source path (`audio.ResolveSource`) is
reused where it can be, under the engine's hold, as `chapters.detect` does.

**An ebook run is never touched.** When the book's own engine book is an ebook
run (characters and recaps generated from the ebook), a read-along or
`chapters.detect` job never continues, converts or clears it: its kind, ebook path,
chapter manifest and notes stay, and `sidecars.describe` keeps reading them. The job
works in an **audio run of its own beside it**, keyed `audio:<path>`
(`store.AudioRunKey`: two engine books at one path, never a real path), with its
own work folder; the reuse table below applies to that audio run, and a second
read-along or chapters job reuses it. `sidecars.describe` never reads the audio run.

"Kept" below means its transcripts weren't swept by the retention, and its audio is
still the book's (`pipeline.AudioCurrent`: a single file the same size and not
modified since `probe.json` was written, a folder the same files by name and order,
none modified since; a file it can't look at right now says try again, never "the
audio changed"):

| The earlier engine book | Goes on |
|---|---|
| a whole run (goal `""`), kept, at or past `readalong_aligning`'s place in the order (its transcripts repaired already) | at `readalong_aligning`, its goal kept |
| a read-along, kept, done or stopped at `readalong_aligning` | at `readalong_aligning` (a re-align: no transcription) |
| kept, transcribed but not repaired (a `chapters.detect` run done, or any run stopped between `sanitizing` and `retranscribing`) | at `sanitizing`, goal `readalong` |
| stopped at `asr`, with what it transcribed kept (`pipeline.TranscriptionContinuable`, now for files and markers manifests too) | from `splitting`, goal `readalong` |
| a finished whole run whose transcripts went or whose audio changed | from `inspecting`, goal `readalong`: its notes, `knowledge-final.md` and ledger kept (a whole run is never cleared) |
| an ebook run | never continued: the audio run beside it is looked up instead (above) |
| none, or anything else | cleared, and a new engine book (goal `readalong`, no series) |
| one another open job follows | refused: "A generate job is working on this book; make the read-along once it has finished.", "job N is already making this book's read-along", else "job N is working on this book; let it finish or cancel it first" |
| one a stage is running on | refused: "the engine is still busy with this book's earlier run; try again in a minute" |

`store.ContinueReadalong` moves the book on in one transaction (goal, its kind
kept, status cleared, the job mapped), and refuses an ebook run. Before it, the sentinels of the stage it goes on
at and of the read-along stages after it are removed, a book going on from
`inspecting` forgets its old manifest's transcription, and a book going on before
`qa_sweep` gets its loop-repair round again.

Two jobs meet the same engine books:

- **A `sidecars.generate` job continues a done read-along run** at `qa_sweep`
  with goal `""`: the agent's adjudication then runs on the already repaired
  transcript, and nothing is transcribed twice (never a read-along transcribed in
  windows: its chapters were never found).
- **A `sidecars.generate` job reading the audio takes the audio run on** as the
  book's own run, continuing it at `qa_sweep` as above: the ebook run beside it is
  cleared first (generate always replaces the book's earlier run) and the audio run
  re-keyed to the book's path. A generate job reading the **ebook** leaves the
  audio run alone.
- **A `chapters.detect` job clears a read-along run** rather than refusing it as
  a whole run, unless the read-along went on from a whole run (it holds that run's
  notes). That protection reads the notes on disk (`facts/knowledge-final.md`),
  else any fact pass that ever succeeded on the book, so it survives a restart's
  rewind of the stage history.

## The `readalong_aligning` stage

A mechanical stage in the **ASR lane** (its heal re-transcribes, so it holds the
lane: the lane cap, the worker router, the ETA and parks such as
`asr_worker_waiting` all apply), ordered after `retranscribing`, `Next` `[done]`.
The ETA seeds it at 180 s per book. The job writes its request first,
`readalong/request.json`: the ebook's Bridge path, the server's files in its order
(book-relative, with their durations) and the Bridge's version; it is written again
when a resumed run first looks or the server moved the job with its book.

1. **Cut again** every chapter FLAC a purge took (the heal and the onset snap need
   the 16 kHz audio; the done-time purge removes `chapters/`).
2. **Read the words** from `transcripts-json/` only, never `transcripts-repaired/`,
   which has no word timings.
3. **Open the EPUB** and walk its text: every content document (script and style
   skipped, the block set of the reader's walk, a source newline a space), split
   into sentences, normalised (NFKD, apostrophes out, digits spelled out, years in
   pairs).
4. **Align** (`readalong.Align`): unique 5-gram anchors placed per section
   (RANSAC and a longest increasing subsequence, up to 8 clusters per section),
   the gaps between anchors filled by Needleman-Wunsch with fuzzy and 1:1 to 1:5
   moves, then each sentence timed by its words.
5. **Heal**: every unaligned run between two aligned sentences becomes a window
   `[previous end - 0.5 s, next start + 0.5 s]` (2 to 600 s), plus every
   `tail_verdicts.json` window (a clip-repaired chapter's `transcripts-json` still
   holds its loop); a window crossing a file boundary is cut there, and
   overlapping or touching windows merge. Each window's clip
   (`readalong/heal/`) is transcribed again **NoContext** through the engine's
   speech recognition (a worker when one is connected), the words spliced in, and
   the book aligned again.
6. **Snap** each sentence's start to its speech onset: 10 ms frame energies from
   an `ffmpeg` f32le pipe per chapter FLAC (only the energies kept), a threshold of
   p10 + 0.3 x (p95 - p10), onsets after a pause, at a run's start or mid-flow;
   the start becomes the onset - 0.1 s, never past the sentence's end - 0.2 s,
   never earlier than its raw start - 0.5 s.
7. **Write** `readalong/map.json`, `words.json` and `align_report.json` (coverage,
   the first pass's coverage, the heal windows and seconds, the snap statistics,
   the ebook's sha256, what was cut again).

**Whole-book time is the server's.** Transcript times are chapter-relative and the
manifest only places a chapter in its file (a files manifest at 0; markers,
windows or detected chapters at their start in the one file). A sentence's time is
the sum of the **server's** durations of the files before it (the book route's
`files[].duration`, in the server's order) + its chapter's start in its file + the
word time. The manifest's own cross-file starts (the Bridge's ffprobe) are never
used, so the map agrees with the timeline the players seek on.

**CFIs match foliate's.** `internal/epubcfi` ports foliate's `epubcfi.js` (the pin
in the frontend's `FOLIATE_PIN.txt`) over a minimal DOM: `encoding/xml`
(non-strict, HTML entities) for `application/xhtml+xml`, `x/net/html` for
`text/html`, comments and processing instructions dropped, CDATA as text,
whitespace text kept, offsets in **UTF-16 code units** as a DOM's. Golden CFIs
written by foliate itself on jsdom (`scripts/cfi-golden/`, Node, not in CI) are
checked in both directions, and a test checks the copied `epubcfi.js` against the
pin.

## At done: the 50% refusal and the write

The job reads the map from the work folder and:

1. **Refuses a poor match**: text coverage under **50%** fails the job with "the
   ebook and the narration don't match: N% lined up" and **writes nothing**. That
   is another edition, or another book.
2. Refuses a map over 16 MiB (the server wouldn't read it).
3. **Hashes the ebook again**: a sha256 that differs from the map's fails "the
   ebook changed while aligning; run it again".
4. Saves `readalong.json` (a single-file book's `<stem>.readalong.json`) into the
   book's `.audiosilo/` where the book is **now**, by the
   [attachment write rules](attachments.md#how-the-bridge-writes-them)
   (`book_not_writable` parks until it can). `bridge.json` is **not** touched: the
   map carries its own generator, so it never clashes with a describe or detect
   job.
5. Asks for the attachments rescan.

The job's progress is generate's without `cost_usd` (`stage` including
`readalong_aligning`, `done`/`total`, the ETA, a park's code and hint). Parks are
the existing codes only (`asr_worker_waiting`, `asr_unavailable`,
`asr_decode_timeout`, `book_not_writable`, `library_not_writable`). Its result:

```json
{
  "library_id": 1, "path": "Jack London/The Call of the Wild",
  "file": "readalong.json",
  "coverage": { "text": 0.996, "audio": 0.987 },
  "sections": 9, "spans": 1830, "audio_gaps": 2, "heal_windows": 14,
  "transcribed": true,
  "ebook_sha256": "<64 lowercase hex>"
}
```

`transcribed` is `true` when speech recognition ran for this job, `false` when an
earlier run's transcript was reused (the console says "the transcript was reused").

## The map: `audiosilo-readalong/v1`

```json
{
  "format": "audiosilo-readalong/v1",
  "ebook": { "file": "Loyalists.epub", "sha256": "<64 lowercase hex>" },
  "audio": { "duration": 84702.74,
             "files": [ { "path": "Loyalists.m4b", "duration": 84702.737 } ] },
  "granularity": "sentence",
  "generator": { "name": "audiosilo-bridge", "version": "0.5.0",
                 "aligner": "whisper-words/1", "asr": "whisper-large-v3-turbo" },
  "generated_at": "2026-11-02T10:11:12Z",
  "coverage": { "text": 0.996, "audio": 0.987 },
  "sections": [
    { "href": "Text/ch01.xhtml",
      "spans": [ { "cfi": "epubcfi(/6/4[ch01]!/4/2,/1:0,/1:118)", "start": 31.2, "end": 37.85 } ],
      "gaps":  [ { "cfi": "epubcfi(/6/4[ch01]!/4/40,/1:0,/1:212)", "chars": 212 } ] }
  ],
  "audio_gaps": [ { "start": 0, "end": 21.4 } ]
}
```

- Keys in this order. Times are **whole-book seconds** rounded to 0.01 (a file's
  `duration` to 0.001), clamped to the book.
- `ebook.file` is the EPUB's name, `ebook.sha256` its digest: how the server tells
  a map made from another ebook.
- `audio.files` are the book's audio files **relative to the book** (a folder book:
  inside its folder; a single-file book: its name), in the server's order, with the
  server's lengths. A moved book keeps a fresh map.
- `generator.asr` is the speech model's name; `aligner` is `whisper-words/1`.
- `coverage.text` is the share of the **read body**'s sentence characters lined up
  (from the first aligned sentence to the last, so front and back matter the
  narrator skips don't count); `coverage.audio` the share of the audio inside a
  span.
- `sections` in spine order, `href` relative to the OPF's folder; `spans` in text
  order (one per sentence, `start` the seek target); `gaps` (optional) the text the
  aligner couldn't place, with its length in characters.
- `audio_gaps` are the stretches over 5 s with no span (credits, music).

A test map lives in the Bridge's `internal/readalong/testdata/alice.readalong.json`.

## On the server

**Indexing.** The server reads `readalong.json` as a [Bridge attachment](attachments.md#readalongjson)
(its own bound, 16 MiB) and stores only its **head** (format, ebook, audio,
generator, `generated_at`, coverage; never the sections) in
`book_attachments.readalong` (migration `0058`). The head is checked: `format`
exactly `audiosilo-readalong/v1`, `ebook.sha256` 64 hex, 1 to 5000 `audio.files`
each with a path of 1 to 1024 bytes and a duration above 0, `coverage.text` and
`coverage.audio` present and in [0, 1], `sections` an array. A map that fails is
none (logged, its signature recorded). A map is not generated content:
`Book.generated` doesn't change.

**The ebook's digest.** Hashing every EPUB would read whole libraries over a
network share, so only a book **with a map** has its ebook hashed: the scan's
post-pass, the Bridge's attachments rescan, or a request that finds the stored
digest is for another file (see [the scanner](../server/scanner.md#a-books-ebook)).

**Staleness** (`catalog.ReadalongState`, pure, table-tested) compares the head with
the book now:

| Check | State |
|---|---|
| the ebook's sha256 isn't the map's | `stale`, reason `ebook_changed` |
| the book's audio files aren't the map's: another count, another set of book-relative paths, or a length off by more than 0.05 s | `stale`, reason `audio_changed` |
| otherwise | `ready`, with `coverage` (the text's) and `generated_at` |

A book with **no ebook now** gets no `readalong` block at all. The book's
`readalong` field rides only on `GET /libraries/{id}/item` and the console's book
detail, never a list row; its digest is checked against the file on disk with one
stat, so an edited ebook shows stale before any scan. A stale map is invisible to
listeners and shown to admins with **Make again**.

**Serving.** [`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong)
reads the file again on every request and checks it against the book now, never
trusting the indexed head for the bytes it sends: `404 no_readalong` for none,
`409 readalong_stale` with the reason. It takes header auth only, never `?token=`.

**Notifications.** A done job is announced "Read-along ready: *title* (N% lined
up)" (the coverage rounded down), a failed one "Read-along failed: *title*" (see
[Notifications](../server/backups-and-notifications.md#events)).

## Transcript retention

The transcripts are kept for `transcripts.retention_days` (default 30) from the
job's end, as for [generate](generating.md#transcript-retention). A read-along
job's end records `ended_at` on its engine book, so **each use restarts the
clock**: a book re-aligned within the month keeps its transcript. The purge also
removes the `readalong/` files that quote the transcript (`words.json`, the heal's
`heal/` clips and raws) and keeps `readalong/map.json` (CFIs and times only, so a
write a park held up still finishes), `align_report.json` and `request.json`. A
read-along after the purge transcribes again (the reuse table's "from
`inspecting`" row).

## How long it takes

Speech recognition dominates. The
[estimate](../server/api/reference.md#get-apiv1adminbridgeestimate) quotes the whole
audio at the Bridge's `asr_seconds_per_audio_hour` (`asr_hours`, the most it may
take), plus up to one round of loop re-transcription; the align, heal and snap add
minutes. A re-align with a kept transcript skips the transcription, so it takes
minutes rather than hours.
