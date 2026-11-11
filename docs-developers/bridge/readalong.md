---
title: Read-along (readalong.align)
description: "How a book's ebook is lined up with its narration, sentence by sentence, with no agent. The readalong.align job and its refusals, the goal readalong path and the mechanical loop repair, the reuse table, the readalong_aligning stage (the aligner, the heal, the onset snap), the audiosilo-readalong/v1 map, the 50% refusal, how the server indexes, checks and serves the map and tells when it is stale, and the transcript retention."
---

A **read-along map** says where each sentence of a book's ebook is spoken in its
audio. With one, a listener can follow the narration in the text. The Bridge makes
it with the **`readalong.align`** job, which:

1. reuses the transcript it kept for the book, or else transcribes the audio;
2. lines the words up with the ebook's text;
3. writes the map into the book's
   [`.audiosilo/` folder](attachments.md#readalongjson) as `readalong.json`.

The server indexes the map, knows when it no longer fits the book, and serves it
at [`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong).

**There is no agent anywhere**: no credential, no spend, no agent container. Maps
are made **per book only**, from the console's book page or the player's Text tab.
There is no bulk action. The player's side (the companion's Text tab and the
reader's Follow narration) is on
[The ebook reader](../frontend/reader.md#read-along-following-the-narration).

**Code.**

| Side | Where |
|---|---|
| Bridge | `internal/readalong` (the aligner, pure apart from reading the EPUB), `internal/epubcfi` (foliate's CFIs in Go), `internal/pipeline/readalong_stage.go` (the stage), `internal/generate/readalongjob.go` (the job) |
| Server | `metadata/readalong.go`, `library/readalong.go`, `catalog/readalong.go`, `api/handlers_readalong.go` and the `readalong.align` kind in `internal/bridge/jobs.go` |

The aligner is a Go port of the read-along spike's Python (the workspace
`READ-ALONG-RESEARCH.md`). An env-gated parity test holds it to the Python.

## The job

`readalong.align` is `generate.ReadalongJob`. It runs in the `pipeline` lane, is
advertised beside the other kinds, and has the feature `readalong`.

- It needs `library_id` and a book `path`, and takes `params` `{}` or none.
- It **writes**, so the server queues it only for a books library that the last
  heartbeat reports mapped and writable.
- The server refuses it `409 no_ebook` for a book whose index holds no ebook.

The server keeps it apart from the other jobs that transcribe the same audio (the
table in
[Kinds are allow-listed twice](pairing-and-jobs.md#kinds-are-allow-listed-twice)):

- A read-along job is refused `409 generate_open` or `409 detect_open` while a
  `sidecars.generate` or `chapters.detect` job is open for the book, parked ones
  included. A read-along cancels neither.
- A new `sidecars.generate` job is refused `409 readalong_open` while a read-along
  job is queued or working. It **cancels a parked one** ("a generate job for the
  book replaced it; make the read-along again after").
- A new `chapters.detect` job is refused `409 readalong_open` while a read-along
  job is open.

The reason is that the Bridge runs **one engine book per audio source path**, so
two runs over the same audio must never overlap. Re-aligning a book that already
has a ready map is allowed.

The ebook is **the server's pick**, never the Bridge's own. It is the book route's
`book.ebook {path, size}`, by the [scanner's rule](../server/scanner.md#a-books-ebook),
the same file the reader opens. Before any work the job checks it:

| The ebook | The job fails with |
|---|---|
| the server names none | "this book has no ebook" |
| outside the library's folder, or not there through the mapping | "the book's ebook leaves the library's folder", "the book's ebook isn't at ... through the library's mapping" |
| over 256 MiB | "the book's ebook is over 256 MiB" |
| DRM (`META-INF/rights.xml`, or an `encryption.xml` beyond font obfuscation: the reader's `hasDrm` rule) | "the book's ebook is DRM-protected, so its text can't be read" |
| not a readable EPUB | "the book's ebook isn't a readable EPUB" |

A file of the book that the server has no length for fails the job too ("the server
has no length for ..., so the read-along can't be timed; rescan the book, then run
it again"). The map's times are built from the server's lengths
([Whole-book time is the server's](#the-readalong_aligning-stage)).

## The goal readalong path

Bridge store's `books.goal` gains **`readalong`** (`state.GoalReadalong`). A
goal-readalong book runs:

```
inspecting -> splitting -> asr -> sanitizing -> qa_sweep
  -> [retranscribing -> qa_sweep] -> readalong_aligning -> done
```

`state.PathNext` routes it, and a test walks it for every kind and finds **no
agent state**:

- **Inspect never routes it to `markers_normalizing`**, an agent stage. A single
  file whose marker table isn't usable gets the
  [windows manifest](chapters.md#the-windows-manifest) that a markerless file gets
  (`audio.InspectWith` with `WindowUnusable`), since chapter boundaries don't
  matter to an alignment. A marker file it can't window fails ("The book's audio
  file doesn't say how long it is, so it can't be lined up with the ebook").
- **`asr` goes to `sanitizing`** even when windowed, never to
  `chapter_detecting`.
- **The mechanical loop repair** replaces the agent's (below).

A goal-readalong book holds no series lock (`state.SeriesLockExempt`), since it
makes nothing a later volume carries on from. It has no series, and contributes
nothing.

The console words the stage "Lining up the ebook with the narration", as the job's
progress message does. The player's Text tab, which follows the job it queued,
words it "Lining the text up with the narration".

### The mechanical loop repair

The whole run repairs transcript loops in `qa_adjudicating`, an agent stage. For
goal readalong, a `qa_sweep` that isn't clean writes `qa.MechanicalPlan(report)` as
the plan instead:

- every chapter in the retranscribe queue, or with a loop finding (a repeated run,
  a multi-loop, a tail-rate hit), is re-transcribed whole;
- every other chapter is accepted;
- there is never a tail or mid clip, since spliced text has no word timings.

`retranscribing` runs the plan (NoContext, as for a whole run) with its own adopt
rule, `repair.AdoptFreshReadalong`. A loop's words are noise, not narration. So the
whole run's `AdoptFresh`, which keeps the longer run, would keep a looped original.
Generate keeps `AdoptFresh`. The re-run replaces the original unless:

- its word rate is implausible (`AdoptFresh`'s check; the heal takes that span);
- it loops over more words (`qa.LoopWords`: the words a 6-gram repeated 5 or more
  times covers);
- it dropped narration: under 80% of a looped original's words outside its loops,
  or fewer words than a loop-free original.

**One round only.** The second sweep goes on to `readalong_aligning` clean or not,
with a stage note naming the chapters left. The heal (step 5 of
[the stage](#the-readalong_aligning-stage)) covers what remains. The spike's single
NoContext re-run took one book from 56% to 99.96% coverage.

## The reuse table

An earlier engine book at the **audio** source path (`audio.ResolveSource`) is
reused where it can be, under the engine's hold, as `chapters.detect` does.

**An ebook run is never touched.** The book's own engine book may be an ebook run:
characters and recaps generated from the ebook. A read-along or `chapters.detect`
job never continues, converts or clears it. Its kind, ebook path, chapter manifest
and notes stay, and `sidecars.describe` keeps reading them.

The job works in an **audio run of its own beside it**, keyed `audio:<path>`, with
its own work folder. `store.AudioRunKey` allows two engine books at one path; the
key is never a real path. The reuse table below applies to that audio run, and a
second read-along or chapters job reuses it. `sidecars.describe` never reads the
audio run.

**"Kept"** in the table means both of these:

- the retention didn't sweep its transcripts;
- its audio is still the book's (`pipeline.AudioCurrent`). A single file must be
  the same size and not modified since `probe.json` was written. A folder must hold
  the same files by name and order, none modified since. A file it can't look at
  right now says try again, never "the audio changed".

| The earlier engine book | Goes on |
|---|---|
| a whole run (goal `""`), kept, at or past `readalong_aligning`'s place in the order (its transcripts repaired already) | at `readalong_aligning`, its goal kept |
| a read-along, kept, done or stopped at `readalong_aligning` | at `readalong_aligning` (a re-align: no transcription) |
| kept, transcribed but not repaired (a `chapters.detect` run done, or any run stopped between `sanitizing` and `retranscribing`) | at `sanitizing`, goal `readalong` |
| stopped at `asr`, with what it transcribed kept (`pipeline.TranscriptionContinuable`, now for files and markers manifests too) | from `splitting`, goal `readalong` |
| a finished whole run whose transcripts went or whose audio changed | from `inspecting`, goal `readalong`: its notes, `knowledge-final.md` and ledger kept (a whole run is never cleared) |
| an ebook run | never continued: the audio run beside it is looked up instead (above) |
| none, or anything else | cleared, and a new engine book (goal `readalong`, no series) |
| one another open job follows | refused: "A generate job is working on this book; make the read-along once it has finished.", "job N is already making this book's read-along", else "job N is working on this book; let it finish or cancel it first". The job first waits up to 30 s for one the server has just cancelled ([Cancelling](pairing-and-jobs.md#cancelling)) |
| one a stage is running on | refused: "the engine is still busy with this book's earlier run; try again in a minute" |

`store.ContinueReadalong` moves the book on in one transaction: the goal set, its
kind kept, the status cleared, the job mapped. It refuses an ebook run. Before it
runs:

- the sentinels of the stage the book goes on at, and of the read-along stages
  after it, are removed;
- a book going on from `inspecting` forgets its old manifest's transcription;
- a book going on before `qa_sweep` gets its loop-repair round again.

Other jobs meet the same engine books:

- **A `sidecars.generate` job continues a done read-along run** at `qa_sweep` with
  goal `""`. The agent's adjudication then runs on the already repaired transcript,
  and nothing is transcribed twice. It never continues a read-along transcribed in
  windows, since that run's chapters were never found.
  - When the read-along was an audio run beside an ebook run, a generate job
    reading the audio clears the ebook run first, since generate always replaces
    the book's earlier run. Then it re-keys the audio run to the book's path.
  - A generate job reading the **ebook** leaves the audio run alone.
- **A `chapters.detect` job clears a read-along run**, rather than refusing it as a
  whole run. The exception is a read-along that went on from a whole run, since it
  holds that run's notes. That protection reads the notes on disk
  (`facts/knowledge-final.md`), else any fact pass that ever succeeded on the book.
  So it survives a restart's rewind of the stage history.

## The `readalong_aligning` stage

`readalong_aligning` is a mechanical stage, ordered after `retranscribing`, with
`Next` `[done]`. It runs in the **ASR lane**, because its heal re-transcribes. So
the lane cap, the worker router, the ETA and parks such as `asr_worker_waiting` all
apply. The ETA seeds it at 180 s per book.

The job writes its request first, `readalong/request.json`. It holds the ebook's
Bridge path, the server's files in the server's order (book-relative, with their
durations) and the Bridge's version. The job writes it again when a resumed run
first looks, or when the server moved the job with its book.

1. **Cut again** every chapter FLAC a purge took. The heal and the onset snap need
   the 16 kHz audio, and the done-time purge removes `chapters/`.
2. **Read the words** from `transcripts-json/` only, never `transcripts-repaired/`,
   which has no word timings.
3. **Open the EPUB** and walk its text. It walks every content document, skipping
   script and style, with the block set of the reader's walk and a source newline
   read as a space. It splits the text into sentences and normalises them: NFKD,
   apostrophes out, digits spelled out, years in pairs.
4. **Align** (`readalong.Align`).
   - It places unique 5-gram anchors per section, by RANSAC and a longest
     increasing subsequence, up to 8 clusters per section.
   - It fills the gaps between anchors by Needleman-Wunsch, with fuzzy 1:1 matches
     and 2:1 merge and 1:2 split moves.
   - Then it times each sentence by its words.
5. **Heal** (`readalong.HealWindows`). These become heal windows:
   - every unaligned run between two aligned sentences, as the window
     `[previous end - 0.5 s, next start + 0.5 s]` (2 to 600 s);
   - a section's **trailing** unaligned run, such as a loop that took its chapter's
     end. Its window starts at the previous end - 0.5 s and lasts as long as its
     text could take (10 characters a second + 10 s), at most 600 s. It never runs
     past its chapter's end, nor past the next section's first aligned sentence;
   - every `tail_verdicts.json` window, since a clip-repaired chapter's
     `transcripts-json` still holds its loop;
   - every cross-segment loop the transcript check (`qa.CrossSegment`) finds in the
     aligned transcripts (2 to 600 s). So a re-align from kept transcripts heals
     too.

   A window crossing a file boundary is cut there, and overlapping or touching
   windows merge. Each window's clip (`readalong/heal/`) is transcribed again
   **NoContext** through the engine's speech recognition, on a worker when one is
   connected. The words are spliced in, and the book is aligned again.
6. **Snap** each sentence's start to its speech onset. The stage reads 10 ms frame
   energies from an `ffmpeg` f32le pipe per chapter FLAC, keeping only the
   energies. The threshold is p10 + 0.3 x (p95 - p10).
   - An onset after a pause, or at a voiced run's start, moves the start to the
     onset - 0.1 s.
   - A mid-flow sentence keeps its raw start.
   - Either way the start is never past the sentence's end - 0.2 s, and never
     earlier than its raw start - 0.5 s.
7. **Write** `readalong/map.json`, `words.json` and `align_report.json`. The report
   holds the coverage, the first pass's coverage, the heal windows and seconds, the
   snap statistics, the ebook's sha256, and what was cut again.

**Whole-book time is the server's.** Transcript times are chapter-relative, and the
manifest only places a chapter in its file. A files manifest places it at 0;
markers, windows or detected chapters at their start in the one file. A sentence's
time is the sum of:

- the **server's** durations of the files before it (the book route's
  `files[].duration`, in the server's order);
- its chapter's start in its file;
- the word time.

The manifest's own cross-file starts (the Bridge's ffprobe) are never used, so the
map agrees with the timeline the players seek on.

**CFIs match foliate's.** `internal/epubcfi` ports foliate's `epubcfi.js` (the pin
is in the frontend's `FOLIATE_PIN.txt`) over a minimal DOM:

- `encoding/xml` (non-strict, HTML entities) for `application/xhtml+xml`;
- `x/net/html` for `text/html`;
- comments and processing instructions dropped, CDATA as text, whitespace text
  kept;
- offsets in **UTF-16 code units**, as a DOM's are.

Golden CFIs written by foliate itself on jsdom (`scripts/cfi-golden/`, Node, not
in CI) are checked in both directions. A test checks the copied `epubcfi.js`
against the pin.

## At done: the 50% refusal and the write

The job reads the map from the work folder and:

1. **Refuses a poor match.** Text coverage under **50%** fails the job with "the
   ebook and the narration don't match: N% lined up", and the job **writes
   nothing**. N is rounded down, so 49.7% says "49%", never "50%". Such a match is
   another edition, or another book.
2. Refuses a map over 16 MiB, which the server wouldn't read.
3. **Hashes the ebook again.** A sha256 that differs from the map's fails "the
   ebook changed while aligning; run it again".
4. Saves `readalong.json` (a single-file book's `<stem>.readalong.json`) into the
   book's `.audiosilo/` where the book is **now**, by the
   [attachment write rules](attachments.md#how-the-bridge-writes-them).
   `book_not_writable` parks until it can. `bridge.json` is **not** touched. The
   map carries its own generator, so it never clashes with a describe or detect
   job.
5. Asks for the attachments rescan.

The job's progress is generate's without `cost_usd`: `stage` (including
`readalong_aligning`), `done`/`total`, the ETA, and a park's code and hint. Parks
use the existing codes only: `asr_worker_waiting`, `asr_unavailable`,
`asr_decode_timeout`, `book_not_writable` and `library_not_writable`. Its
result:

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

- The keys come in this order. Times are **whole-book seconds** rounded to 0.01 (a
  file's `duration` to 0.001), clamped to the book.
- `ebook.file` is the EPUB's name and `ebook.sha256` its digest. The digest is how
  the server tells a map made from another ebook.
- `audio.files` are the book's audio files **relative to the book**, in the
  server's order, with the server's lengths. For a folder book they are inside its
  folder, and for a single-file book it is its name. A moved book keeps a fresh
  map.
- `generator.asr` is the speech model's name, and `aligner` is `whisper-words/1`.
- `coverage.text` is the share of the **read body**'s sentence characters lined
  up. The read body runs from the first aligned sentence to the last, so front and
  back matter the narrator skips don't count. `coverage.audio` is the share of the
  audio inside a span.
- `sections` come in spine order, with `href` relative to the OPF's folder.
  - `spans` come in text order, one per sentence, with `start` the seek target.
  - `gaps`, optional, are the text the aligner couldn't place, with its length in
    characters.
- `audio_gaps` are the stretches over 5 s with no span (credits, music).

A test map lives in the Bridge's `internal/readalong/testdata/alice.readalong.json`.

## On the server

**Indexing.** The server reads `readalong.json` as a
[Bridge attachment](attachments.md#readalongjson), with its own bound of 16 MiB. It
stores only the map's **head** in `book_attachments.readalong` (migration `0058`):
format, ebook, audio, generator, `generated_at` and coverage, never the sections.

- The server checks the head ([the bounds](attachments.md#how-the-server-checks-them)).
  A map that fails counts as none; the server logs it and records its signature.
- A map is not generated content, so `Book.generated` doesn't change.

**The ebook's digest.** Hashing every EPUB would read whole libraries over a
network share. So only a book **with a map** has its ebook hashed, by one of these
(see [the scanner](../server/scanner.md#a-books-ebook)):

- the scan's post-pass;
- the Bridge's attachments rescan;
- a request that finds the stored digest is for another file.

**Staleness** (`catalog.ReadalongState`, pure, table-tested) compares the head with
the book now:

| Check | State |
|---|---|
| the ebook's sha256 isn't the map's | `stale`, reason `ebook_changed` |
| the book's audio files aren't the map's: another count, another set of book-relative paths, or a length off by more than 0.05 s | `stale`, reason `audio_changed` |
| otherwise | `ready`, with `coverage` (the text's) and `generated_at` |

- A book with **no ebook now** gets no `readalong` block at all.
- The book's `readalong` field rides only on `GET /libraries/{id}/item` and the
  console's book detail, never on a list row.
- The server checks its digest against the file on disk with one stat, so an
  edited ebook shows stale before any scan.
- A stale map is invisible to listeners, and shown to admins with **Make again**.

**Serving.**
[`GET /libraries/{id}/readalong`](../server/api/reference.md#get-apiv1librariesidreadalong)
reads the file again on every request and checks it against the book now. It never
trusts the indexed head for the bytes it sends. It answers `404 no_readalong` for
none, and `409 readalong_stale` with the reason. It takes header auth only, never
`?token=`.

**Notifications** (see
[Notifications](../server/backups-and-notifications.md#events)):

- a done job is announced "Read-along made: *title* (N% lined up)", with the
  coverage rounded down. Before server 2.5.1 it said "ready";
- a failed one is announced "Read-along failed: *title*".

## Transcript retention

The transcripts are kept for `transcripts.retention_days` (default 30) from the
job's end, as for [generate](generating.md#transcript-retention). A read-along
job's end records `ended_at` on its engine book, so **each use restarts the
clock**. A book re-aligned within the month keeps its transcript.

- The purge also removes the `readalong/` files that quote the transcript:
  `words.json`, and the heal's `heal/` clips and raws.
- It keeps `readalong/map.json`, which holds CFIs and times only, so a write that a
  park held up still finishes. It also keeps `align_report.json` and
  `request.json`.

A read-along after the purge transcribes again (the reuse table's "from
`inspecting`" row).

## How long it takes

Speech recognition dominates. The
[estimate](../server/api/reference.md#get-apiv1adminbridgeestimate) quotes the whole
audio once at the Bridge's `asr_seconds_per_audio_hour` (`asr_hours`). Up to one
round of loop re-transcription and the heal's windows come on top, and the align
and snap add minutes. A re-align with a kept transcript skips the transcription,
so it takes minutes rather than hours.
