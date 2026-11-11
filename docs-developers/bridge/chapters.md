---
title: Chapterless books (chapters.detect)
description: "How the Bridge finds the chapters of a book with no chapter markers in its narration: the windows manifest, the chapter_detecting stage and the detector's rules, the confidence verdict and the chapters_not_detected park, the logical-position grouping, books.goal and the chapters.detect job, writing chapters.json from a generate run, continuing a detect run, and how the server takes the list as a chapter source."
---

Recaps, characters and the players' spoiler gates are all positioned **by
chapter**, so a book needs chapters before the agent stages can run. For a single
audio file with no chapter markers, the Bridge transcribes the book in fixed
windows and **finds the chapters in the narration**: the headings a narrator reads
out after a pause. It then re-maps the window transcripts onto those chapters and
carries on as with an ordinary chaptered book. Such a book used to park at
inspect. The Bridge writes the chapters into the library as
[`chapters.json`](attachments.md#chaptersjson), which the server uses as a chapter
source of its own, so listeners get them too.

Two jobs use it:

- **`sidecars.generate`** on a markerless book. There is nothing new to queue. The
  run finds the chapters first and writes `chapters.json` as soon as it has them,
  before the characters and recaps exist (see
  [Characters and recaps](generating.md)).
- **`chapters.detect`** runs speech recognition and detection only, with **no
  agent and no agent cost**, for the console's Health `no_chapters` finding. It
  stops once the chapters are found and writes `chapters.json`.

The code:

- the Bridge's `internal/chapterdetect` (the detector, pure),
  `internal/pipeline/chapterdetect_stage.go` (the stage), `internal/audio/windows.go`
  (the windows) and `internal/generate/chapters.go` (the job and the file);
- the server's `metadata/chapterlist.go`, `catalog/generatedchapters.go` and the
  `chapters.detect` kind in `internal/bridge/jobs.go`.

The spike that set the rules is in the workspace `BRIDGE-PLAN.md`'s handoff log.
Over five books it found 118 of 119 story boundaries, every error under 0.7 s. The
one miss had no spoken heading. The env-gated corpus test
(`internal/pipeline/chapterdetect_corpus_test.go`) measures the built detector on
the same books: every spoken story boundary within 0.66 s, median 0.06 to 0.14 s.

## Which books

The windows path is for a book that `audio.Inspect` finds is a **single file**
with **no usable markers**. That means no markers at all, or one marker covering
at least 95% of the file. Some encoders write the book's title as one chapter,
which is a title, not a table. Everything else is unchanged:

| The book | What happens |
|---|---|
| a single file with chapter markers | the markers, as before |
| several markers in a dialect the parser doesn't know | `markers_normalizing`, as before (a vocabulary gap, not a chapterless book) |
| a folder of files | its files are its chapters, as before |
| a single file with no usable markers | a **windows** manifest (below) |
| a single file with one marker over only part of it, or with no length | a `chapters.detect` job fails saying so (`ErrPartialMarker`, `ErrUnknownLength`); it can't be windowed |

`ReparseMarkerManifest` also recovers into windows a book that an older parser
parked with no chapters and no usable markers. It cuts at the targets, since the
reparse reads no audio.

## The windows manifest

Inspect writes a manifest with `Style: "windows"` (`audio.StyleWindows`). Its
windows are about **25 minutes** long (target 1500 s). They are long because
each worker segment was measured at 5 to 7 s of model load.

- **The cut.** Each window is cut at the middle of the longest silence whose
  middle lies within 120 s of the target. Inspect runs one 240 s
  `silencedetect` probe (`-40dB`, 0.4 s) per cut, time-bounded.
- **No silence.** With no silence there, or no ffmpeg, the cut is at the target.
- **A failed probe** (a wedged mount ran its bound out) ends the probing, and the
  rest are cut at their targets.
- **Short files and tails.** A file under 1800 s is one window. A cut that would
  leave a last window under 300 s isn't made.

The stats are **Usable**, so the book goes straight to `splitting`, with the stage
note "no chapter markers: transcribing in N windows of about 25 minutes, then
finding the chapters in the narration".

`splitting` cuts a windows manifest like a markers one, and **hears each window's
silences in the same decode** (`silencedetect` beside the FLAC encode). It keeps
them as `chNNN.silences.json` beside each window FLAC, on the file's timeline,
keyed by the window's span. `asr` transcribes each window as one segment through
`workers.Router`, so an [ASR worker](workers.md) takes windows like any chapter.
The worker protocol does not change.

## The `chapter_detecting` stage

`chapter_detecting` is a mechanical stage (`state.ChapterDetecting`, `SourceIO`)
right after `asr`.

- `ASR.Next` is `[ChapterDetecting, Sanitizing]`, and the pipeline takes
  `ChapterDetecting` on `Outcome.Windowed` (asr's `StageResult` says the manifest
  is a windows manifest).
- `ChapterDetecting.Next` is `[Done, Sanitizing]`, with `Done` only for a book
  with goal `chapters` (below).
- The mainline skips it like the other conditional stages.
- It reports one progress unit (the ETA seeds it at 60 s per book), and the
  console and the player word it "Finding the chapters in the narration".

The stage runs these steps:

1. **The words on the whole-book timeline** (`loadWindowTimeline`). The stage
   takes each window's raw transcript (`transcript.Normalize`) and shifts it by
   the window's start. It glues whisper.cpp's sub-word tokens into words, at
   their lowest probability. A segment without words becomes one word at its
   start, for the detection only. Nothing is timed past the window's own audio,
   because a hallucination there would interleave with the next window's words.
2. **The silences.** The stage uses the ones `splitting` kept beside each window
   FLAC (`audio.WindowSilences`). Otherwise it runs one bounded `silencedetect`
   over the window and keeps the result the same way, so a Retry decodes nothing.
3. **`chapterdetect.Detect`** (below). When it is not confident, the book parks
   **`chapters_not_detected`** with the detector's reason. Nothing has moved, so
   a Retry detects again.
4. **When it is confident**, the window layer moves aside FIRST. The detection and
   a copy of the windows manifest go to `windows/`, then `chapters/` moves to
   `windows/chapters/` and `transcripts-raw/` to `windows/transcripts-raw/`. After
   that the move counts as done and `windows/` is the source of truth, so a crash
   anywhere later redoes the rest safely. Then the stage writes, in order:
   - the **detected manifest** (`Style: "markers"`, `Detected: true`, chapters
     1..N with their titles and spans);
   - one **synthesized raw transcript per chapter** in
     `transcripts-raw/chNNN.json` (openai-whisper shape via
     `transcript.EncodeOpenAI`, times chapter-relative, frozen `0444`). A segment
     goes to the chapter holding its first word, and a boundary inside a segment
     splits it at the word;
   - `asr.json`, rewritten with the new manifest's fingerprint, and
     `SetBookChapters`;
   - the chapter FLACs, **cut from the window FLACs** (`audio.CutFromWindows`): a
     seek inside one window, or a concat of trimmed parts across window edges,
     exact to the sample. The source file is used only for a chapter whose window
     is gone;
   - then it removes `windows/chapters/` and writes `chapters_detected.json`
     (below).

From there the book is an ordinary chaptered book. `sanitizing` enumerates
`transcripts-raw/` only, which by then holds the per-chapter raws.

Titles heard in the narration are **never spelling evidence**. A detected
manifest's `marker_titles.txt` is written empty, and the manifest staged to the
spelling agent goes without them, so a misheard name can't attest itself.

## The detector (`internal/chapterdetect`)

The detector is pure (no I/O, no clock) and table-tested.
`Detect(words, silences, duration)` returns contiguous chapters from 0 to the end,
and a confidence verdict. Each chapter carries its spoken title, the heading text,
when the heading was heard, the pause before it and its number.

### What counts as a heading

Matching is case-insensitive, with punctuation stripped. A heading is one of:

- a numbered heading word: `chapter`, `part`, `book`, `stave`, `day`, `volume` or
  `episode`, with a number starting at the very next word and running at most 5
  words;
- one of `prologue`, `epilogue`, `interlude`, `preface`, `introduction`,
  `afterword`, `foreword` or `intermission`, alone.

The number can be digits 1-999, the ordinals `first` to `tenth`, or English number
words. Several number words count only as one cardinal, so "one hundred and twenty
one" is 121, while "one two" is never added up and reads as 1. The number never
runs past a word that ends in punctuation, so "Chapter One. Two days later" is 1.

A heading is never `dedication`, and never one whose number runs straight on into
"of" ("Book 10 of The Messenger" in a series' credits).

### The rules

- **After a pause** of at least 1.5 s. The pause is the gap from the previous word,
  or the longest silence ending within 3 s before to 0.6 s after the heading.
  Silences that touch within 0.05 s are joined first, since a window cut can
  split a pause in two. The start of the book counts as a pause. Silence alone
  never makes a chapter: the spike found it invents dozens of boundaries at 2 s
  and misses most at 4 s.
- **Numbered runs.** Per heading word, the detector takes the longest strictly
  increasing run of numbers in time order. Numbers may skip ("Day 2, 3, 12, 17").
  A run of one is kept.
- **Merging.** Headings within 6 s of the one before are one heading, titled with
  both ("Epilogue. Day 101").
- **The boundary** is the heading word's start minus 0.2 s, never before the end
  of the word before. The spike measured the heading's start within half a second
  of Audible's boundary.
- **The title** is the heading's words up to the first gap of 0.8 s within the
  next 10 words, never shorter than the heading and its number, with trailing
  punctuation trimmed. An all-lower or all-upper title is title-cased word by
  word. A title is at most 200 bytes (`chapterdetect.MaxTitleBytes`, which every
  composed title keeps to).
- **Front matter.** Audio before the first heading joins chapter 1 when it is
  under 180 s (credits, "This is Audible", a dedication). A longer unheaded
  opening is its own first chapter, "Opening". Credits after the last heading stay
  in the last chapter.

### Confidence

A book of 60 minutes or more is **not confident** when any of these holds. Each
rule has a plain reason that becomes the park's message:

| Rule | Reason |
|---|---|
| no heading heard | "no chapter headings were heard in the narration" |
| one heading heard | "only one chapter heading was heard in the narration" |
| a chapter longer than max(90 min, 3 x the median chapter) | "chapter 12 runs 2 h 40 min, so headings were probably missed" |
| the longest numbered run (on a tie, the heading word first in the list above), unless its word is `day`, missing more than a quarter of the numbers between its first and last | "the narration numbers chapters 1 to 30 but only 14 were heard" |

A book under 60 minutes is always confident. With no heading it is one chapter,
and it gets no `chapters.json`, because one chapter is no chapters.

## The list: `chapters_detected.json`

The stage writes `<work>/chapters_detected.json` (`pipeline.DetectedChapters`:
`manifest_sha`, `source_size`, `duration_ms` and the entries). The jobs turn this
list into `chapters.json`.

The server and the players gate spoilers **by ordinal** (`meta.ChapterAt`, the
player's `chapterNumberAt`). So **entry k of the list is logical position k by
construction**:

- **Classify.** The stage classifies the detected chapters in memory as the later
  stages would classify their synthesized transcripts (`classifyEdgeChapters`,
  through `edgeChapters`). A chapter whose "chapter" heading the detector numbered
  counts as opening with that number announced. The stage keeps the
  classification (`positions_detected.json`, with the manifest's fingerprint).
- **Group.** `groupEntries` groups the entries by that classification:
  - front matter and an intro join the first story chapter;
  - an interior unnumbered section joins the chapter whose number it takes;
  - credits join the entry before them;
  - end matter past the last numbered chapter stays its own entry.

  A merged entry's titles are joined with " / " ("Prologue / Chapter 1").
- **Rank.** `rankPositions` makes the classification's positions the entries'
  ordinals. For a detected manifest, `classifyBookEdges` takes the kept
  classification (`loadDetectedPositions`) rather than classifying again from the
  text QA leaves, so a re-transcribed opening can't move every position off the
  list.

`generate`'s view of the list is `DetectedChaptersPath`, `ReadDetectedChapters`,
`CurrentFor` (the manifest's fingerprint and the source's size) and
`DetectedStamp` (local file stats, so a poller re-reads only a changed list). The
transcript retention keeps `chapters_detected.json` (titles only) and removes
`windows/`.

## Goal `chapters` and the `chapters.detect` job

Bridge store migration `0005` adds `books.goal`. `''` means the whole pipeline,
and `chapters` means stop after `chapter_detecting` (`state.GoalChapters`, routed
once by `state.PathNext`, which the ETA follows).

A goal-chapters book goes `inspecting` -> `splitting` -> `asr` ->
`chapter_detecting` -> `done`. It holds no series lock, because it makes nothing
a later volume carries on from. It is left out of `FinishedBooks`, so it never
skews the agent-cost estimates.

An inspect that finds the book already has chapters fails it with a sentence the
console shows as it is:

- `ErrHasMarkerChapters`: "The book already has chapters: its audio file carries
  chapter markers";
- `ErrHasFileChapters`: "...: its chapters are its audio files".

### The job

`chapters.detect` (`generate.ChaptersJob`) runs in the `pipeline` lane and is
advertised beside the other kinds. It takes params `{}`; the server checks them
strictly and the Bridge reads any object. It resumes and follows its engine book
exactly as [`sidecars.generate`](generating.md#how-the-bridge-runs-it) does
(prepare, a resumed job's own book found again, moves followed). A new job:

1. **Refuses** in three cases:
   - a book whose characters and recaps were made without chapters found in the
     narration (no `chapters` object in its `bridge.json`), because new chapters
     would move their spoiler positions ("Generate the book again to find its
     chapters with them");
   - a book an open generate job follows ("A generate job is already working on
     this book; its chapters come with it.");
   - a finished whole run, which it never clears.
2. **Writes from an earlier run**, with no new transcription, when an engine book
   at the source path already has a `chapters_detected.json` current for its
   manifest.
3. **Takes up a cancelled chapters run** (`cancelledChapters`, `resumeChapters`).
   A goal-chapters run on a single file that was **cancelled** at `asr` or
   `chapter_detecting` (`scheduler.IsCancelled`) continues under the engine's
   hold, through `store.ContinueReadalong` with goal `chapters`. `resumesAt`,
   shared with the generate continue below, picks the stage: `splitting` for a
   continuable transcription, `chapter_detecting` for a rerunnable detection. The
   transcription is kept, and the log says "taking up the book's stopped chapters
   run, its transcription kept". The job clears a run that **failed** for a reason
   of its own, is parked, or can't be trusted (the file replaced, the windows
   gone, swept), so asking again never fails the same way forever.
4. Otherwise **creates** an engine book with goal `chapters` and no series, and
   follows it. Its progress is generate's without `cost_usd`: `stage`
   `chapter_detecting`, the ETA, and a park's code and hint.
5. At `done`, **writes** `chapters.json`, merges `bridge.json` (every other field
   kept, the [`chapters` object](attachments.md#chaptersjson) added or replaced),
   then asks for the attachments rescan.

Its result:

```json
{ "library_id": 1, "path": "Lectures/A Long Lecture", "chapters": 24, "files": ["chapters.json", "bridge.json"], "source": "audio" }
```

Its retention is generate's. The transcripts are kept for
`transcripts.retention_days` from the job's end, and a continued book counts from
its latest job.

### A generate job after a detect job

A `sidecars.generate` job reading the audio **continues** an existing
goal-chapters engine book rather than transcribing again, when that book is not
yet swept and no open job follows it. Two kinds of run continue:

- **A done run whose list is current** for the file on disk goes on from
  `splitting`. The done-time purge removed the chapter FLACs, so `splitting` cuts
  them again. Every raw is complete, so `asr` skips. The manifest is the detected
  one, so the path goes straight on to `sanitizing`.
- **A run cancelled or failed at `chapter_detecting`** (say, a parked detect job
  the new generate job cancelled) goes on there, when its kept windows can run the
  detection again. The detection then runs again from the window layer, with the
  whole pipeline after it. `pipeline.DetectionRerunnable` decides, and needs all
  of these:
  - every window's raw is complete;
  - the confident detection is kept for the windows, or every window's silences
    can still be had;
  - the audio file is still the one inspected: its size is the one `probe.json`
    records, and it has not been modified since `probe.json` was written, give or
    take two minutes for another machine's clock. The time matters because a tag
    editor adding markers can keep the size.

Both continue only while the book is still the one audio file it was
(`audio.ResolveSource`; a folder that has gained an audio file is a multi-file
book now).

**The continue** (`continueChapters` -> `store.ContinueChapters`) waits for the
engine's hold, as [a delete does](generating.md#how-the-bridge-runs-it). A stage
the cancel just stopped may still be finishing. If it stays busy, the job fails
(try again in a minute) rather than letting the run be cleared, its transcription
with it, before it could be looked at. Once it holds the book, the continue reads
it again, since that stage may have finished it, and checks the list or the
windows on what it reads. Then, in one transaction:

- the book becomes a whole-run book with the new job's identity, `contrib_mode`
  and `work_id`;
- its status, error, park and retry are cleared;
- the new job is mapped to it.

A job cancelled meanwhile leaves the run as it was.

**Give-way waits wake when a job ends.** Each job end (`release`) closes the
handler's end signal, and `awaitChaptersGivingWay` and `awaitOpenJobEnd` wake on
it. The poll stays as the bound, and both bounds are time, not a count of
wake-ups.

### How the server keeps the two kinds apart

The server keeps the two kinds apart (the table in
[Kinds are allow-listed twice](pairing-and-jobs.md#kinds-are-allow-listed-twice)):

- It refuses a generate job while a detect job is queued or working, until an
  admin cancels the detect job. One cancelled before `chapter_detecting` leaves no
  run to continue, so the generate job transcribes again.
- A new generate job cancels a **parked** detect job.

The Bridge hears a cancel at the detect job's next report. So before any continue,
the generate job waits until no chapters job follows the book (working, parked, or
done and saving its list) and the book has stopped (the ending job
[stops it](generating.md#states)). It waits up to 40 polls, two minutes at the
3-second poll (`awaitChaptersGivingWay`, `giveWayTries`), which is long enough for
a lost keepalive or two. When the wait runs out:

- a job still open is refused;
- a book no job follows that still isn't stopped (an orphan run) is stopped there.
  It is then continued when it is one of the two runs above, and otherwise cleared
  as any earlier run is.

Stopping leaves alone a book another open job follows, so a late end of the detect
job never stops the continued run.

### `chapters.json` from a generate run

A `sidecars.generate` run saves the list **as soon as the engine has it**
(`saveChaptersEarly`), so listeners get chapters hours before the recaps. It saves
once per detected list and never waits. It skips the save while the library isn't
checked mapped and writable, and tries a failed save again later. The run writes
the file again with the rest at the finish, and lists it in the result's `files`.

The Bridge composes the file at each write from the book's files and path as they
are then. The server moves a job with its book, and a list naming the old file
would never apply. The file is never written beside characters and recaps made
without chapters found in the narration. A regenerate that finds no chapters keeps
an existing `chapters.json` vouched for (its `chapters` object in `bridge.json`
carried over), as it does the description.

## The park: `chapters_not_detected`

The park is a person's decision, like `markers_not_confident`. It has no
`retry_at`. The supervisor escalates it for approval and never retries it
automatically, and the server announces it (`bridge_job_failed`).

The Bridge's hint: "The Bridge couldn't find the chapters in the narration. Add
chapter markers to the audio file, then cancel this job: the server reads the
markers, and a new generate job works from them."

The console adds that matching the book to a community recording with a chapter
list gives listeners chapters. That list reaches the server, never the Bridge, so
generating still needs markers in the file.

## On the server

The server reads `chapters.json` as a [Bridge attachment](attachments.md)
(migration `0051`, `book_attachments.chapters`). It uses it as a **chapter source
between the community's and the files'** (see
[Community chapters](../server/community-chapters.md#generated-chapters)). The
kind, its params and its `409` codes are in
[the reference](../server/api/reference.md#post-apiv1adminbridgejobs), and the
notifications ("Chapters found: *title*") in
[Notifications](../server/backups-and-notifications.md#events).
