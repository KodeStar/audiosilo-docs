---
title: Chapterless books (chapters.detect)
description: "Bridge Phase 1d: how a book with no chapter markers gets chapters found in its narration. The windows manifest, the chapter_detecting stage and the detector's rules, the confidence verdict and the chapters_not_detected park, the logical-position grouping, books.goal and the chapters.detect job, writing chapters.json from a generate run, continuing a detect run, and how the server takes the list as a chapter source."
---

Recaps, characters and the players' spoiler gates are all positioned **by
chapter**, so a book needs chapters before the agent stages can run. Before Phase
1d a single audio file with no chapter markers parked at inspect. Now the Bridge
transcribes such a book in fixed windows, **finds the chapters in the narration**
(the headings a narrator reads out after a pause), re-maps the window transcripts
onto them, and carries on as an ordinary chaptered book. The chapters are written
into the library as [`chapters.json`](attachments.md#chaptersjson), which the
server uses as a chapter source of its own, so listeners get them too.

Two jobs use it:

- **`sidecars.generate`** on a markerless book: nothing new to queue. The run
  finds the chapters first and writes `chapters.json` as soon as it has them,
  before the characters and recaps exist (see
  [Characters and recaps](generating.md)).
- **`chapters.detect`**: speech recognition and detection only, **no agent and no
  agent cost**, for the console's Health `no_chapters` finding. It stops once the
  chapters are found and writes `chapters.json`.

Code: the Bridge's `internal/chapterdetect` (the detector, pure),
`internal/pipeline/chapterdetect_stage.go` (the stage), `internal/audio/windows.go`
(the windows), `internal/generate/chapters.go` (the job and the file); the
server's `metadata/chapterlist.go`, `catalog/generatedchapters.go` and the
`chapters.detect` kind in `internal/bridge/jobs.go`. The spike that set the rules
(five real books, every spoken story boundary found within 0.66 s, median 0.06 to
0.14 s) is in the workspace `BRIDGE-PLAN.md`'s handoff log.

## Which books

`audio.Inspect` on a **single file** with **no usable markers**: none at all, or
one marker covering at least 95% of the file (some encoders write the book's title
as one chapter: a title, not a table). Everything else is unchanged:

| The book | What happens |
|---|---|
| a single file with chapter markers | the markers, as before |
| several markers in a dialect the parser doesn't know | `markers_normalizing`, as before (a vocabulary gap, not a chapterless book) |
| a folder of files | its files are its chapters, as before |
| a single file with no usable markers | a **windows** manifest (below) |
| a single file with one marker over only part of it, or with no length | a `chapters.detect` job fails saying so (`ErrPartialMarker`, `ErrUnknownLength`); it can't be windowed |

`ReparseMarkerManifest` also recovers a book an older parser parked with no
chapters and no usable markers into windows (cut at the targets, since the reparse
reads no audio).

## The windows manifest

Inspect writes a manifest with `Style: "windows"` (`audio.StyleWindows`): windows
of about **25 minutes** (target 1500 s; Phase 1b measured 5 to 7 s of model load
per worker segment, so windows are long), each cut at the middle of the longest
silence whose middle lies within 120 s of the target. One 240 s `silencedetect`
probe (`-40dB`, 0.4 s) is run per cut, time-bounded; with no silence there, or no
ffmpeg, the cut is at the target, and a probe that fails (a wedged mount ran its
bound out) ends the probing, the rest at their targets. A file under 1800 s is one
window, and a cut that would leave a last window under 300 s isn't made. The stats
are **Usable**, so the book goes straight to `splitting`, with the stage note "no
chapter markers: transcribing in N windows of about 25 minutes, then finding the
chapters in the narration".

`splitting` cuts a windows manifest like a markers one, and **hears each window's
silences in the same decode** (`silencedetect` beside the FLAC encode), keeping
them as `chNNN.silences.json` beside each window FLAC on the file's timeline, keyed
by the window's span. `asr` transcribes each window as one segment through
`workers.Router`, so an [ASR worker](workers.md) takes windows like any chapter;
no worker protocol change.

## The `chapter_detecting` stage

A mechanical stage (`state.ChapterDetecting`, `SourceIO`) right after `asr`.
`ASR.Next` is `[ChapterDetecting, Sanitizing]`, taken on `Outcome.Windowed` (asr's
`StageResult` says the manifest is a windows manifest); `ChapterDetecting.Next` is
`[Done, Sanitizing]`, `Done` only for a book with goal `chapters` (below). The
mainline skips it like the other conditional stages. It reports one progress unit
(the ETA seeds it at 60 s per book), and the console and the player word it
"Finding the chapters in the narration".

1. **The words on the whole-book timeline** (`loadWindowTimeline`): each window's
   raw transcript (`transcript.Normalize`), shifted by the window's start, with
   whisper.cpp's sub-word tokens glued into words (at their lowest probability), a
   segment without words as one word at its start (for the detection only), and
   nothing timed past the window's own audio (a hallucination there would
   interleave with the next window's words).
2. **The silences**: the ones `splitting` kept beside each window FLAC
   (`audio.WindowSilences`), else one bounded `silencedetect` over it, kept the same
   way, so a Retry decodes nothing.
3. **`chapterdetect.Detect`** (below). Not confident: the book parks
   **`chapters_not_detected`** with the detector's reason, and nothing has moved,
   so a Retry detects again.
4. **Confident**: the window layer moves aside FIRST (the detection and a copy of
   the windows manifest to `windows/`, then `chapters/` to `windows/chapters/` and
   `transcripts-raw/` to `windows/transcripts-raw/`); after that the move counts
   as done and `windows/` is the source of truth, so a crash anywhere later redoes
   the rest safely. Then the **detected manifest** (`Style: "markers"`,
   `Detected: true`, chapters 1..N with their titles and spans), one
   **synthesized raw transcript per chapter** in `transcripts-raw/chNNN.json`
   (openai-whisper shape via `transcript.EncodeOpenAI`, times chapter-relative,
   frozen `0444`; a segment goes to the chapter holding its first word, a boundary
   inside one splits it at the word), `asr.json` rewritten with the new manifest's
   fingerprint, `SetBookChapters`, the chapter FLACs **cut from the window FLACs**
   (`audio.CutFromWindows`: a seek inside one window, a concat of trimmed parts
   across window edges, exact to the sample; the source file only for a chapter
   whose window is gone), `windows/chapters/` removed, and
   `chapters_detected.json` (below).

From there the book is an ordinary chaptered book: `sanitizing` enumerates
`transcripts-raw/` only, which by then holds the per-chapter raws.

Titles heard in the narration are **never spelling evidence**: a detected
manifest's `marker_titles.txt` is written empty, and the manifest staged to the
spelling agent goes without them, so a misheard name can't attest itself.

## The detector (`internal/chapterdetect`)

Pure (no I/O, no clock) and table-tested. `Detect(words, silences, duration)`
returns contiguous chapters from 0 to the end (each with its spoken title, the
heading text, when the heading was heard, the pause before it and its number) and
a confidence verdict.

- **A heading** is a heading word, case-insensitive with punctuation stripped:
  `chapter`, `part`, `book`, `stave`, `day`, `volume` or `episode` followed within
  the next 1 to 5 words by a number (digits 1-999, ordinals `first` to `tenth`, or
  English number words: several words only as one cardinal, so "one hundred and
  twenty one" is 121 and "one two" no number; never past a word that ends in
  punctuation, so "Chapter One. Two days later" is 1); or `prologue`, `epilogue`,
  `interlude`, `preface`, `introduction`, `afterword`, `foreword` or
  `intermission` alone. Never `dedication`, and never a number that runs straight
  on into "of" ("Book 10 of The Messenger" in a series' credits).
- **After a pause** of at least 1.5 s: the gap from the previous word, or the
  longest silence ending within 3 s before to 0.6 s after the heading (silences
  that touch within 0.05 s joined first, since a window cut can split a pause in
  two). The start of the book counts as a pause. Silence alone never makes a
  chapter: the spike found it invents dozens of boundaries at 2 s and misses
  most at 4 s.
- **Numbered runs**: per heading word, the longest strictly increasing run of
  numbers in time order (numbers may skip: "Day 2, 3, 12, 17"). A run of one is
  kept.
- **Merging**: headings within 6 s of the one before are one heading, titled with
  both ("Epilogue. Day 101").
- **The boundary** is the heading word's start minus 0.2 s, never before the end
  of the word before (the spike measured the heading's start within half a second
  of Audible's boundary).
- **The title**: the heading's words up to the first gap of 0.8 s within the next
  10 words (never shorter than the heading and its number), trailing punctuation
  trimmed; an all-lower or all-upper title is title-cased word by word; at most 200
  bytes (`chapterdetect.MaxTitleBytes`, which every composed title keeps to).
- **Front matter**: audio before the first heading joins chapter 1 when it is
  under 180 s (credits, "This is Audible", a dedication); a longer unheaded
  opening is its own first chapter, "Opening". Credits after the last heading stay
  in the last chapter.

**Confidence.** A book of 60 minutes or more is **not confident**, each with a
plain reason that becomes the park's message:

| Rule | Reason |
|---|---|
| fewer than two headings | "no chapter headings were heard in the narration" |
| a chapter longer than max(90 min, 3 x the median chapter) | "chapter 12 runs 2 h 40 min, so headings were probably missed" |
| a numbered run (not `day`) missing more than a quarter of the numbers between its first and last | "the narration numbers chapters 1 to 30 but only 14 were heard" |

A book under 60 minutes with no heading is one chapter, confidently (and gets no
`chapters.json`: one chapter is no chapters).

## The list: `chapters_detected.json`

The stage writes `<work>/chapters_detected.json` (`pipeline.DetectedChapters`:
`manifest_sha`, `source_size`, `duration_ms` and the entries), the list the jobs
turn into `chapters.json`. The server and the players gate spoilers **by ordinal**
(`meta.ChapterAt`, the player's `chapterNumberAt`), so **entry k of the list is
logical position k by construction**:

- the detected chapters are classified in memory as the later stages would
  classify their synthesized transcripts (`classifyEdgeChapters`, through
  `edgeChapters`; a chapter whose "chapter" heading the detector numbered counts
  as opening with that number announced), and the classification is kept
  (`positions_detected.json`, with the manifest's fingerprint);
- the entries are grouped by it (`groupEntries`): front matter and an intro join
  the first story chapter, an interior unnumbered section joins the chapter whose
  number it takes, credits join the entry before them, end matter past the last
  numbered chapter stays its own entry. A merged entry's titles are joined with
  " / " ("Prologue / Chapter 1");
- `rankPositions` makes the classification's positions the entries' ordinals, and
  `classifyBookEdges` takes the kept classification for a detected manifest
  (`loadDetectedPositions`) rather than classifying again from the text QA leaves,
  so a re-transcribed opening can't move every position off the list.

`DetectedChaptersPath`, `ReadDetectedChapters`, `CurrentFor` (the manifest's
fingerprint and the source's size) and `DetectedStamp` (local file stats, so a
poller re-reads only a changed list) are `generate`'s view of it. The transcript
retention keeps `chapters_detected.json` (titles only) and removes `windows/`.

## Goal `chapters` and the `chapters.detect` job

Bridge store migration `0005` adds `books.goal` (`''` the whole pipeline,
`chapters` to stop after `chapter_detecting`; `state.GoalChapters`, routed once by
`state.PathNext`, which the ETA follows). A goal-chapters book goes `inspecting`
-> `splitting` -> `asr` -> `chapter_detecting` -> `done`, holds no series lock (it
makes nothing a later volume carries on from), and is left out of
`FinishedBooks`, so it never skews the agent-cost estimates. An inspect that finds
the book already has chapters fails it with a sentence the console shows as it is
(`ErrHasMarkerChapters`: "The book already has chapters: its audio file carries
chapter markers"; `ErrHasFileChapters`: "...: its chapters are its audio files").

`chapters.detect` (`generate.ChaptersJob`, the `pipeline` lane, advertised beside
the other kinds) takes params `{}` (the server checks them strictly; the Bridge
reads any object). It resumes and follows its engine book exactly as
[`sidecars.generate`](generating.md#how-the-bridge-runs-it) does (prepare, a
resumed job's own book found again, moves followed), and when new:

1. **Refuses** a book whose characters and recaps were made without chapters
   found in the narration (no `chapters` object in its `bridge.json`): new chapters
   would move their spoiler positions ("Generate the book again to find its
   chapters with them"); a book an open generate job follows ("A generate job is
   already working on this book; its chapters come with it."); and a finished
   whole run, which it never clears.
2. **Writes from an earlier run** with no new transcription when an engine book at
   the source path already has a `chapters_detected.json` current for its manifest.
3. Else **creates** an engine book with goal `chapters` and no series, and follows
   it: its progress is generate's without `cost_usd` (`stage` `chapter_detecting`,
   the ETA, a park's code and hint).
4. At `done` it writes `chapters.json` and merges `bridge.json` (every other field
   kept, the [`chapters` object](attachments.md#chaptersjson) added or replaced),
   then asks for the attachments rescan.

Its result:

```json
{ "library_id": 1, "path": "Lectures/A Long Lecture", "chapters": 24, "files": ["chapters.json", "bridge.json"], "source": "audio" }
```

Its retention is generate's: the transcripts are kept for
`transcripts.retention_days` from the job's end (a continued book counts from its
latest job).

### A generate job after a detect job

A `sidecars.generate` job reading the audio, for a book whose engine book is a
goal-chapters book not yet swept and followed by no open job, **continues** it
rather than transcribing again (`continueChapters` -> `store.ContinueChapters`,
under the engine's hold, in one transaction: the book becomes a whole-run book with
the new job's identity, `contrib_mode` and `work_id`, and the new job is mapped to
it):

- a **done** one whose list is current for the file on disk goes on from
  `splitting`: the done-time purge removed the chapter FLACs, so `splitting` cuts
  them again, every raw is complete, so `asr` skips, and the manifest is the
  detected one, so the path goes straight on to `sanitizing`;
- one **cancelled or failed at `chapter_detecting`** (a parked detect job the new
  generate job cancelled, say) whose kept windows can run it again
  (`pipeline.DetectionRerunnable`) is re-admitted there, so the detection runs
  again from the window layer with the whole pipeline after it.

The server keeps the two kinds apart (see
[Kinds are allow-listed twice](pairing-and-jobs.md#kinds-are-allow-listed-twice)):
a generate job is refused `409 detect_open` while a detect job is queued or
working (cancelling it would throw its transcription away), and cancels a
**parked** one (it finds the chapters itself). The Bridge hears that cancel at the
detect job's next report, so the generate job first waits a few polls for the
parked job to give way (`awaitChaptersGivingWay`); one that stays open is refused.

### `chapters.json` from a generate run

A `sidecars.generate` run saves the list **as soon as the engine has it**
(`saveChaptersEarly`, once per detected list, never waiting: not while the library
isn't checked mapped and writable, a failure tried again later), so listeners get
chapters hours before the recaps; it is written again with the rest at the finish
and listed in the result's `files`. The file is composed at each write from the
book's files and path as they are then (the server moves a job with its book, and a
list naming the old file would never apply). It is never written beside characters
and recaps made without chapters found in the narration. A regenerate that finds no
chapters keeps an existing `chapters.json` vouched for (its `chapters` object in
`bridge.json` carried over), as the description is.

## The park: `chapters_not_detected`

A person's decision, like `markers_not_confident`: no `retry_at`, the supervisor
escalates it for approval and never retries it automatically, and the server
announces it (`bridge_job_failed`). The Bridge's hint: "The Bridge couldn't find
the chapters in the narration. Add chapter markers to the audio file, then cancel
this job: the server reads the markers, and a new generate job works from them."
The console adds that matching the book to a community recording with a chapter
list gives listeners chapters: that list reaches the server, never the Bridge, so
generating still needs markers in the file.

## On the server

The server reads `chapters.json` as a [Bridge attachment](attachments.md) (migration
`0051`, `book_attachments.chapters`) and uses it as a **chapter source between the
community's and the files'**: see
[Community chapters](../server/community-chapters.md#generated-chapters). The kind,
its params and its `409` codes are in
[the reference](../server/api/reference.md#post-apiv1adminbridgejobs); the
notifications ("Chapters found: *title*") in
[Notifications](../server/backups-and-notifications.md#events).
