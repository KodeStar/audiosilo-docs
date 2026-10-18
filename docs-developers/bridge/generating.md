---
title: Characters and recaps (sidecars.generate)
description: "Bridge Phase 1a's job: who may queue it and where, its params, the estimate and the heartbeat's figures, how the Bridge runs it through the sidecars engine, its progress, parks, result and notifications; Phase 1c's own-words description step and the description-only job (sidecars.describe); resuming after a restart, contributing, the budgets and the transcript retention."
---

`sidecars.generate` is the job that makes the Bridge useful: an admin presses
**Generate characters and recaps** on a book, and the Bridge transcribes it (or
reads its ebook), runs the sidecars engine's agent passes, validates the result,
writes it into the book's [`.audiosilo/` folder](attachments.md) and asks the
server to read it, after which `/meta` serves it to the players. Since Phase 1c
the same run also writes an own-words, spoiler-free **description** of the book
([the description step](#the-description-step)), and `sidecars.describe` writes
one alone for a book generated earlier
([below](#a-description-on-its-own-sidecarsdescribe)). Since Phase 1d a book with
no chapter markers runs too: the engine finds its chapters in the narration first
and the job writes them as `chapters.json` straight away
([Chapterless books](chapters.md)). The job model it
rides on (states, leases, attempts, cancel) is Phase 0's:
[Pairing and jobs](pairing-and-jobs.md#the-job-model). Server code is
`internal/bridge` (`jobs.go`, `estimate.go`, `status.go`),
`api/handlers_bridge.go` and `handlers_bridge_estimate.go`; the Bridge's is
`internal/generate`, wired in `internal/app/engine.go`.

## Who sees the action

The kind's family is `sidecars`, so a Bridge advertising `sidecars.generate`
puts `sidecars` in `GET /server`'s `bridge.features`. Both UIs gate the action on
the same four things:

- the user is an admin (the player also refuses a demo account, a household
  member and a kid's account, whatever their role says: `mayGenerate` in
  `src/components/bridge/bridge-model.ts`);
- `capabilities.bridge` (a Bridge paired and online);
- `bridge.features` includes `sidecars`;
- `capabilities.metadata`: generated content reaches the players through
  [`/meta`](../server/api/reference.md#generated-content), which is 404 while
  metadata is off.

The console (`admin-ui/src/features/bridge/`, `generateAvailable`) offers it in
the book page's Community card (`GenerateSection`), on each series card
(`SeriesGenerateDialog`) and links each generate job in Settings > Bridge to its
book. The player offers it on the book page's action row and in the companion's
empty Who's who and Story so far; see
[the book page](../frontend/book-page.md#the-primary-action-and-the-action-row).
The action reads **Generate** while the book has no characters or recaps at all,
**Regenerate** while some were generated here, and is hidden once the community
has both (the console decides from the estimate's `has`, the player from the
book's `/meta` work).

## Queueing it

`POST /admin/bridge/jobs` with `kind: "sidecars.generate"`, a `library_id` and a
**required** book `path` (an indexed book; the job is about its own path).
`params`, checked strictly (an unknown field is `400`) and stored with the
defaults filled in, so the Bridge reads one complete object:

| Field | Values | Default | Meaning |
|---|---|---|---|
| `source` | `auto`, `audio`, `ebook` | `auto` | what the run reads: `auto` takes the book's ebook when it has a readable one, else the audio |
| `contribute` | `local`, `issue` | `local` | `local` keeps the results on this server (decision 6); `issue` also offers them to the community as an intake issue |
| `work_id` | text, at most 200 bytes, no control characters | none | the community work the results are for, when the caller knows it |

The kind **writes**, so on top of Phase 0's checks the server refuses it with
`409 library_not_writable` unless the last heartbeat reports the library mapped
**and** writable, and a `contribute: "issue"` with `409 cannot_contribute` unless
the heartbeat's `estimates.sidecars.can_contribute` is true (no estimates count
as false). Both checks come after the dedupe: an open job of the book is returned
(`200`) whatever they would say. The player always sends
`{source: "auto", contribute: "local"}`; only the console offers contributing.

**A series batch** is the client queueing each book on its own, in reading
order, earliest first. Job ids ascend and the claim takes the oldest queued job,
so the Bridge picks them up in that order. The console's series dialog asks each
book's brief estimate first (four at a time) and leaves out the books that
already have recaps (community or generated), those with an open job, and those
it couldn't check; the book dialogs' **Also generate for N earlier books first**
queues the estimate's `earlier` before the book itself.

## The estimate

The confirmation dialogs read
[`GET /admin/bridge/estimate`](../server/api/reference.md#get-apiv1adminbridgeestimate).
The server costs the run from the figures in the Bridge's last heartbeat
(`bridge.EstimateSidecars`):

- **`source`** is `ebook` when the book has an ebook by the Bridge's own rule
  (`library.BookEbook`, mirroring the Bridge's `epubBeside`: exactly one regular,
  non-hidden `.epub` directly in a folder book's folder, or `<stem>.epub` beside a
  single-file book). The server only finds the file; the Bridge also checks it
  can read it, and falls back to the audio when it can't.
- **`asr_hours`** is the book's duration times `asr_seconds_per_audio_hour`, `0`
  for an ebook, without figures, or for audio of unknown length.
- **`agent_cost_usd`** is the duration times `agent_usd_per_audio_hour` (audio)
  or `agent_usd_per_ebook` (ebook); `null` while the Bridge has no history for
  that source, which the dialogs show as "No estimate yet", never as free.
- **`figures`** says whether the heartbeat carried estimates at all: without
  them `agent_ready` and `subscription` are defaults, so a false `agent_ready`
  means "not known yet".
- **`has.community`** is what the book's community work carries
  (`meta.Service.Coverages`: the cached enrichment, else the console's bounded
  lookup), with `has.community_unknown` set when that couldn't be had right now;
  **`has.local`** is what its indexed attachments carry.
- **`earlier`** is the books of the same library before this one in its first
  numbered series (any spelling of it, `catalog.EarlierInSeries`), with no
  generated recaps and, metadata on, no community recaps either (a book the
  community couldn't be asked about is left out, never offered on a guess): the
  nearest 10, among at most the nearest 30 checked, in reading order, each with
  its own `asr_hours` and `agent_cost_usd` from its audio.
- **`open_job`** is the book's open `sidecars.generate` job, if any.

`brief=1` is the cheap answer for a label or a batch: the same shape without the
look into the book's folder (`source` audio, no `ebook`) and without the series
scan (`earlier: []`).

### The Bridge's figures

The heartbeat's `estimates.sidecars` block (`PUT /bridge/status`) is computed by
`generate.Estimates` from the Bridge's store, again every 5 minutes or as soon as
a job finishes, and only once the engine has started (until then the heartbeat
carries none):

| Field | Where it comes from |
|---|---|
| `asr_seconds_per_audio_hour` | the ASR stage's learned rate (seconds per chapter) scaled by the finished audio books' chapters per hour; the seed `900` (a quarter of the audio's length) before there is one |
| `agent_usd_per_audio_hour` | the finished audio books' agent spend over their hours (a long book weighs more); `null` before the first |
| `agent_usd_per_ebook` | the finished ebook books' average spend; `null` before the first |
| `samples` | the finished books those come from |
| `agent_backend`, `agent_ready`, `subscription` | the agent container's state ([runner.json](agent-container.md#runner-liveness)): the CLI the Bridge runs, whether it is available (a fresh heartbeat, the CLI present with a credential the provider hasn't refused) and whether that credential is a subscription login |
| `can_contribute` | a GitHub token resolves (below) |
| `monthly_budget_usd`, `month_spent_usd` | `agent.monthly_budget_usd`, and this calendar month's (UTC) agent spend across every book |

The server validates the block on its own: a number below 0 or past its (far)
bound, or a block that doesn't decode, drops the block, never the heartbeat (a
refused heartbeat would take the Bridge offline). A key it doesn't know is
ignored, so a newer Bridge can send more. Settings > Bridge shows the agent,
**Paid by**, **This month** and **Estimates from** rows from the same block
(`GET /admin/bridge`'s `estimates`).

## How the Bridge runs it

The handler (`generate.Handler`) runs in the `pipeline` lane (25 jobs at once):
the job only follows an **engine book**, and the engine's scheduler decides what
actually runs, so a job sits in the lane as long as its book is queued, running
or parked. One run:

1. **Waits for the engine** (its first start may download ffmpeg), reporting
   `waiting`.
2. **Finds its engine book again**, when the job is resumed: `generate_books`
   maps the server job id to the engine book, and is trusted only for the same
   library and book (another server, or a reinstalled one, hands out ids an older
   mapping still holds; that run is stopped and this job starts its own).
3. **Refuses an impossible contribution before any spend**: `contribute: issue`
   on a Bridge with no GitHub token fails at once.
4. **Prepares** (`prepare`): the library must be one the server listed, with a
   mapping check that found it mapped and writable at the mount the Bridge uses
   now (a new job fails otherwise; a resumed one parks `library_not_writable` and
   waits); the book comes from
   [`GET /bridge/libraries/{id}/book?path=`](../server/api/reference.md#get-apiv1bridgelibrariesidbook)
   with its `book` facts (an unreachable server or a `5xx` is waited out, backing
   off to a minute; a `4xx` fails the job); its files must match the server's
   sizes through the mount; and the book's **own** folder must take a write probe,
   else the job parks `book_not_writable` and looks again every minute (or at
   once on **Retry**).
5. **Creates the engine book** (`create`): it picks the source (`chooseSource`:
   `audio` as asked; `ebook` needs a readable `.epub`, else the job fails; `auto`
   takes a readable one and falls back to the audio, logging why: several `.epub`
   files, or one whose OPF doesn't parse, as a DRM-wrapped one doesn't). An engine
   book left by an earlier run at the same source path is deleted first, unless
   another open job follows it (the job fails: cancel that one first) or a stage
   of it runs right now (the job fails: try again in a minute). A
   `chapters.detect` run at the same path (finished, or stopped at its detection)
   is **continued** instead, so its transcription is reused ([A generate job after a detect job](chapters.md#a-generate-job-after-a-detect-job)). The new book takes
   its identity from the server's facts (title, authors, narrators, series and
   position, ASIN, ISBN), its `work_id` from the params or else the server's
   metadata cache, its kind (audio or ebook) and the job's `contribute` as its
   `contrib_mode`.
6. **Follows it** (`follow`): every 3 seconds while a stage works, every 30
   while it is queued, paused or parked (a **Retry** looks at once), turning the
   book into the job's progress and parks (below).
7. **Finishes**: on `done` it writes the attachments
   ([write rules](attachments.md#how-the-bridge-writes-them)), asks the server to
   read them (`POST /bridge/rescan {mode: "attachments"}`, up to three tries; the
   server's next scan reads them anyway), then runs the
   [description step](#the-description-step) and, when that gave one, saves
   `description.json` beside them and asks again, and reports the result. An
   engine book that fails fails the job with the engine's error.

A book's later volume waits for the earlier one: the engine holds a series lock
until a book reaches `ready`, so a sequel's agent stages run after its
predecessor has been written and can carry its knowledge forward. A failed or
cancelled book releases the lock.

### Progress

Each look at the engine book becomes a `PATCH` with this progress object (the
server stores it opaquely; at most 16 KiB):

| Field | Meaning |
|---|---|
| `step` | always set: the engine state (`inspecting`, `asr`, `chapter_detecting` since Phase 1d, `fact_pass`, `synthesizing`, `auditing`, `contributing`...), or the job's own `waiting` (the engine book is queued, or the job waits on the engine, the server or the mapping), `writing` (writing into `.audiosilo/`), `rescanning` (asking the server to read them) and, since Phase 1c, `describing` (the description step) |
| `message` | the step in words ("Transcribing (12 of 40)"; "Needs attention: ..." while parked, "Paused: ..." while paused) |
| `done`, `total` | the current stage's counts, when it has some |
| `stage` | the engine state |
| `eta_seconds` | the engine's whole-book estimate of the time left, when it has one (never while parked or paused) |
| `cost_usd` | the agent spend so far: the budgets' basis (each run's provider-reported cost, else its complete API-price estimate), rounded to cents |
| `source` | `audio` or `ebook` |
| `park` | while parked only: `code`, `hint` (the Bridge's English advice) and `retry_at` (RFC 3339) when the park resumes by itself |

The console and the player word the stages themselves (`bridge.stage.*` in both
UIs; `describing` is "Writing the description", `chapter_detecting` "Finding the
chapters in the narration") and show `done/total`, the time left and the cost.

### States

The job reports `running` while the engine works, `needs_attention` while the
engine book is parked (`progress.park` set, `error` the park's message) and
`running` again when it resumes (the server allows `needs_attention -> running`
for the same claim; a park changing its code in place is reported as is). It ends
`done` with the result, `failed` with the error text, or `cancelled`.

**Cancelling** (`cancel_requested`) cancels the job's context; a job that ends any
way short of `done` stops its engine book (the scheduler's cancel), since nothing
would follow it any more.

### Parks

The engine's own park codes (its `state.ParkCode`) plus two of the Bridge's
(`book_not_writable`, `library_not_writable`). Each has a `hint` in the progress;
"Retry" there is the **Retry** on the job on the Bridge's own page
(`POST /api/jobs/{id}/retry`), which re-admits the engine book, or makes a job
waiting on its own park look again now.

| Code | Means | Resumes by itself |
|---|---|---|
| `agent_unavailable` | the agent container isn't answering, has no CLI or no credential, or didn't claim the job within `agent.claim_timeout_seconds` | yes, 10 minutes later when the container said why (`retry_at`) |
| `agent_rate_limited` | the agent account hit its usage limit | yes, when it resets |
| `agent_credential_refused` | the provider refused the CLI's credential (new in Phase 1a) | it looks again every 30 minutes, so it goes on once the credential is replaced |
| `budget_exceeded` | the monthly cap (`retry_at` the 1st of next month, UTC) or the per-book cap was reached | the monthly one only |
| `agent_validation_exhausted`, `qa_no_converge`, `spelling_gate_failure`, `fix_loop_exhausted`, `asr_decode_timeout`, `markers_not_confident`, `ebook_chapters_not_confident`, `supervisor_escalated`, `supervisor_budget` | an engine stage gave up after its bounded retries | no: **Retry** |
| `chapters_not_detected` | a book with no chapter markers whose chapters couldn't be found in the narration with confidence (Phase 1d; the message says why: no headings heard, a chapter too long, numbers missing). See [Chapterless books](chapters.md#the-park-chapters_not_detected) | no: add chapter markers to the file, cancel and generate again |
| `media_tools_unavailable`, `asr_unavailable` | ffmpeg/ffprobe is missing, or the Bridge's own speech recognition failed to set up | no |
| `asr_worker_waiting` | no [ASR worker](workers.md) is connected and the fallback is `wait` (or the Bridge has no speech recognition of its own) (new in Phase 1b) | yes, as soon as a worker connects (or the fallback is `local` with a usable backend) |
| `manifest_changed` | the book's audio changed since it was transcribed | no: cancel and generate again |
| `ebook_unreadable`, `ebook_no_chapters` | the ebook can't be used | no: cancel and generate from the audio |
| `contrib_unavailable` | contributing couldn't reach GitHub, or has no token | no |
| `core_needed` | contributing needs a community core record the book doesn't have | no (the local files are already written) |
| `core_pending` | the book's core record waits for the next data release | yes |
| `book_not_writable` | the Bridge can't write in the book's folder or its `.audiosilo/` (before the run, or when writing the results; the results wait in the engine's work folder) | it checks again every minute |
| `library_not_writable` | a resumed job's library isn't mapped and writable any more | when the next mapping check passes |

### The result

On `done` (at most 64 KiB):

```json
{
  "library_id": 1,
  "path": "Author/Book",
  "source": "audio",
  "files": ["characters.json", "recaps.json", "description.json", "bridge.json"],
  "characters": 41,
  "recaps": 38,
  "cost_usd": 12.5,
  "work_id": "the-way-of-kings",
  "contributed": { "characters": "https://github.com/...", "recaps": "https://github.com/..." },
  "description": true
}
```

`files` are the names written into `.audiosilo/` (with the `<stem>.` prefix for a
single-file book; `chapters.json` too for a book whose chapters were found in the
narration), `work_id` the resolved community work (or the pipeline's
placeholder slug), `contributed` only with `contribute: issue`, naming each
dimension's intake issue. `description` (Phase 1c) says whether
`description.json` was written; when it is `false`, `description_error` says why
in a few plain words ("the agent account hit its usage limit", "the book has a
single chapter, so no description leaves out its ending"...), which the console
shows as "No description this time: ...". `cost_usd` includes the description
step's spend, a try that failed its checks included. An older Bridge sends
neither field.

### Notifications

The **server** announces the jobs (not a Bridge route): `bridge.Service`'s
`OnTransition` hook fires once a move into a state an admin hears about has
committed, whatever made it (the Bridge's `PATCH`, or a lease that ran out on the
last attempt, which fails the job), and `notify.BridgeJobEnded` records it:

- into `done`: **`bridge_job_finished`** (`Characters and recaps ready: <title>`;
  for a `sidecars.describe` job `Description ready: <title>`, "Listeners see it
  in the player's About when the book has no other description."; for a
  `chapters.detect` job `Chapters found: <title>`, "Listeners see them in the
  player now." only when the book's `chapters_source` is `generated` once the
  attachments rescan has run, else that they were saved but the book uses other
  chapters);
- into `failed`, or into `needs_attention` with a park that isn't transient:
  **`bridge_job_failed`**, with the park code. `agent_rate_limited`,
  `agent_unavailable` and `asr_worker_waiting` are never announced, whatever their `retry_at`; a park that
  changes its code in place is announced when the new code isn't transient. A
  failed job's title names its kind (`Characters and recaps failed: <title>`,
  `Description failed: <title>`, `Chapters failed: <title>`).

A report that leaves the state as it was (a keepalive, a parked job's progress)
announces nothing. See [Notifications](../server/backups-and-notifications.md#events).

## The description step

Phase 1c: a book's **own-words, spoiler-free description**, the paragraph a
stranger reads before deciding to listen, written by the agent and saved as
[`description.json`](attachments.md#the-formats). It is **local only**:
meta-community takes descriptions by pull request, so a `contribute: issue` run
never files one. The Bridge's code is `pipeline.Executor.Describe`
(`internal/pipeline/describe_stage.go`, its prompt `internal/agent/prompts/description.md`)
and `describeOnce` (`internal/generate/describejob.go`).

### What the agent sees: the spoiler bound

The bound is the **staging**, by construction: the agent's folder holds
`opening.md` and an empty `out/`, nothing else. No transcript, no ebook text, no
`knowledge-final.md` (the whole-book knowledge sheet carries the ending), no later
chapter's notes, no publisher copy; the prompt also forbids the web and the
agent's own memory of the book. `opening.md` is copied mechanically from the fact
pass's own chunks (`chunk_plan.json`): the `## Chapter N` sections of the chosen
files, their file numbering kept.

The chosen files are the book's **opening**: those whose logical position is `0`
(front matter) or among its first **K** story positions, where

- `n` is the number of distinct story positions the files hold (capped at the
  classifier's chapter count, so one misheard late announcement can't widen the
  window, and a sequel numbered on from 45 still has an opening);
- **K = max(2, ceil(n / 4))**, capped at **n - 1**: a quarter of the book, two
  chapters at least, and **never the last chapter** (its ending). A book of two
  chapters gets its first only; a book of **one** gets **no description** (the
  step answers "the book has a single chapter").

Excluded edge files (an Audible intro, the closing credits) and end matter never
count. The positions are classified the way the sidecar stages did, so K counts
the same logical chapters the recaps use. That classification reads the
transcripts, which the retention deletes, so each one is kept beside the notes as
`chapter_positions.json` (keyed by the manifest it was made from); a book whose
transcripts are gone uses it, else its file numbers (a file's number is never
below its story chapter, so that bound is only less generous, never unsafe).

### The checks

The answer is `out/description.json`, exactly `{"text": "..."}`. Before it is kept,
every one of these must pass; a failure goes back to the agent as feedback for
another try:

- the text, trimmed, is **200 to 1500** code points, at most **two paragraphs**,
  with no control character (nor U+2028/U+2029) but a newline, and **no em dash**;
- a neutral reference-guide voice: no second person, no sentence ending in a
  question mark, no sales words ("gripping", "must-read", "unforgettable"...), the
  book's own title and series exempt (a book may be called *Me Before You*);
- the composed `model.Description` (the run's work and sources from its
  `characters.json`, licence `CC-BY-SA-4.0`) passes meta's
  `description.schema.json`;
- the **no-verbatim check**: an 8-word run shared with the book's source text
  (audiosilo-meta's `extract.NGram`, the shingle the sidecars use) fails. It
  measures against whatever text is still there: the transcripts (their text and
  corrected layers) for an audio book, the ebook's chapter text for an ebook.
  With none left it is skipped and recorded as such; a local fault of the check
  itself (the disk, an unreadable transcript) fails the step rather than paying
  for an agent retry.

What it measured is recorded as `checked_against` (`transcripts`, `book text` or
`none`) in `bridge.json`'s `description` object. A run whose own work and sources
can't make a valid description fails before any spend; validation exhausted
means no description.

### When it runs in a generate job

An ebook's text is deleted as its book reaches `done` (a licensing rule), so the
step runs where the text is still there:

1. **At the start of the engine's contributing stage** (which every book passes
   through to resolve its community work, contributing or not): best effort and
   once per book (a book with any description run, passed or failed, is never
   paid for again, since a contributing park runs the stage again), only for a
   book an open `sidecars.generate` job follows, without waiting out a rate
   limit, any error only logged.
2. **At the job's finish** (the engine book `done`, or parked at
   `contributing`), after the characters and recaps are saved: the job's pass
   **reuses** the description already in the engine's work folder, re-composed
   with the work and sources the contributing stage resolved, nothing spent, its
   `checked_against` kept. With none, it tries once itself (and once more at
   `done` when it first asked at a contributing park, so the description never
   ships naming another work than the characters do), unless the book's latest
   description run failed after spending: a run never pays twice.

The step **never fails, parks or holds the job**: no rate-limit wait, an engine
that keeps the book for more than a few polls is given up on, and any error
leaves the job to finish with its characters and recaps, its result saying
`description: false` and why. A description it got follows in a second save.

The step is not an engine stage. It records its own `describing` stage run on the
engine book (so its spend counts in the per-book and monthly budgets, the monthly
sum and the estimates, and both budgets are checked before any spend), runs
under the scheduler's hold on the book (no stage, delete, purge or sweep acts on
it meanwhile), and uses the agent model `agent.claude` routes as `describing`
(`sonnet` by default). The kept file is the engine's `sidecars/description.json`,
which the transcript purge keeps.

## A description on its own: `sidecars.describe`

Phase 1c's second kind (family `sidecars`, so the same `bridge.features` entry):
a description for a book the Bridge generated earlier, written from the notes
it kept (no new speech recognition). The notes outlive the transcripts: the
retention deletes the transcript text but keeps the fact notes, the chapter
positions and the sidecars. The player has no such action; the console offers it.

**Queueing:** `POST /admin/bridge/jobs` with `kind: "sidecars.describe"`, a
`library_id`, a **required** book `path` and `params` `{}` or none (any field is
`400`; stored as `{}`). It writes, so `409 library_not_writable` as for a
generate job, and a Bridge that doesn't advertise it (a 1a or 1b Bridge) is
`409 kind_unavailable`. It is refused with **`409 generate_open`** while a
`sidecars.generate` job is open for the book (that run writes the description
itself); a second press returns the open describe job (its own dedupe key).
The other way round, a generate job queued while a describe job is open
**cancels** that job in the same transaction (at once when it is queued or
parked, else by `cancel_requested`, its error "a generate job for the book
replaced it"), since the generate run writes the description from fresher notes.
See [Kinds are allow-listed twice](pairing-and-jobs.md#kinds-are-allow-listed-twice).

**The console** (`admin-ui/src/features/bridge/describe-section.tsx`): the book
page's Community card has a **Description** part. It shows a generated
description (from the admin book detail's `generated_description`) with the
"Generated on this server" mark and its time, clamped behind **Show more**, and
says when listeners see another description in the player instead (the book's
own, or the community's). **Write a description** confirms, then queues the job
(`describeOffered`): offered only when the estimate says `can_describe` and
`writable`, the book has generated characters or recaps (their notes are the
source), no description from either side (`has.local.description`,
`has.community.description`, with `community_unknown` unset), no description of
its own, and no generate or describe job open (the estimate's `open_job`
included). The describe job's status shows in the same part.

**The Bridge** (`DescribeJob`, the `pipeline` lane) prepares as a generate job
does (strict when new; a resumed job parks `library_not_writable`), then finds
the engine book whose notes describe the book: the latest at its source path,
else the latest generate job's book at its library path (a book that moved
while that job ran), else the run the book's own `bridge.json` names (a book that
moved after). It runs the description step until it writes one; the agent's parks
(rate limit, budget, credential, unavailable) are the job's park
(`needs_attention`, with `code`, `hint` and `retry_at`), tried again at
`retry_at` or on **Retry**. Then it saves `description.json` and `bridge.json`
([how](attachments.md#how-the-bridge-writes-them)) and asks for the attachments
rescan. It fails, with a sentence the console shows as it is, when:

| Failure | Message |
|---|---|
| no engine book (never generated here, or removed) | The Bridge has no notes for this book (it was not generated here, or they were removed). Generate characters and recaps again to get a description. |
| a generate run still works on it | A generate job is still running for this book; it writes the description when it finishes. |
| a single-chapter book | This book has a single chapter, so no description could leave out its ending. |
| validation exhausted | Couldn't write a description that passed the checks. |
| the engine keeps the book | The engine is busy with this book; try again in a minute. |

Its progress is `{step: describing | writing | rescanning | done, message, done,
total, stage: "describing", source, cost_usd, park?}`, and its result:

```json
{
  "library_id": 1,
  "path": "Author/Book",
  "description": true,
  "files": ["description.json", "bridge.json"],
  "cost_usd": 0.18,
  "checked_against": "none"
}
```

`description` is always `true` (the console's shared result parser reads it).
An audio book past its transcript retention, or an ebook (its text went at
`done`), is checked against nothing: `checked_against: "none"`.

## Resuming after a restart

Phase 0's rules hold (a running job is resumed under its claim, a lapsed claim is
taken again as the next attempt): see
[Resuming after a restart](pairing-and-jobs.md#resuming-after-a-restart). On top:

- **The engine book survives**: `generate_books` (store migration `0003`) maps
  the job to it, so a resumed job follows the same book rather than starting
  over. A book this job's own cancel had stopped (the server took the job back,
  then handed it out again) is re-admitted, unless its transcripts were swept
  meanwhile, in which case it starts over.
- **The server's identity**: `server_jobs.server_id` records which server handed
  each job out (the pairing's `server_id`); an open row of another server is
  treated as lost, never reported to the wrong one.
- **A job ended without running** (its first report after a restart answered
  with a cancel or a lost claim) releases its engine book (`Abandon`), as the end
  of a run would.
- **Moves**: the server carries an open job with its book when a scan sees the
  book move; the path in the answer to a report tells the Bridge, which follows
  it (`followMove`) and records the new path, so a restart finds the same book.

## Contributing

With `contribute: issue` the engine's `contributing` stage files the community
intake issue, as audiosilo-sidecars did, with the Bridge's GitHub token (the
sealed `github_pat`, which `AUDIOSILO_BRIDGE_GITHUB_TOKEN` sets at every start;
see [Configuration](configuration.md#characters-and-recaps)). The local files are written
before that stage can park: a book parked at `contributing` (`core_needed`, say)
already has its `.audiosilo/` files, and the job writes them again only when the
engine's sidecars change. `can_contribute` in the heartbeat is "a token
resolves", which is all the server checks before it queues such a job.

## The budgets

Every agent run is preflighted against two caps (`pipeline.Executor`):

- **`agent.book_budget_usd`** (default 75): one book's spend; past it the book
  parks `budget_exceeded` until the cap is raised and the book retried.
- **`agent.monthly_budget_usd`** (default 100, `0` = none; decision 7): this
  calendar month's (UTC) spend across every book, superseded runs included, and
  the spend of engine books a regenerate deleted (kept in
  `deleted_stage_spend`), so regenerating doesn't reset the month. Past it the
  book parks `budget_exceeded` with `retry_at` the first of the next month.

With a subscription credential the costs are notional (what the same tokens would
cost on an API key), so the caps still bound the usage.

## Transcript retention

Decision 5: a book's transcripts are kept privately in the Bridge's data folder
(the engine's work folder, `<data>/work`) for `transcripts.retention_days`
(default 30) after its job ends, never in the library and never contributed.
`generate_books.ended_at` records the end; a daily sweep
(`Handler.SweepTranscripts`) purges every finished engine book whose job ended at
least that long ago and records `swept_at`, so it never looks at it again. With
`0` a book's transcripts go as its job ends.

The purge (`scratch.PurgeTranscripts`) deletes the reclaimable scratch (the
split chapter audio, the agents' staged inputs, the re-transcription clips, an
ebook's extracted text), every `transcripts-*` layer, the
corrected transcript copies a sequel carried from its predecessor, and the root
files that quote the transcript (the spelling candidates and reference matches,
the QA reports, plan and accepted ledger, the tail verdicts, the correction and
repair logs). It keeps what a sequel builds on (the facts in
`knowledge-final.md`, the spelling ledger and rules, the series glossary), the
fact notes a [`sidecars.describe`](#a-description-on-its-own-sidecarsdescribe)
reads, the description step's `chapter_positions.json`, the manifest and the
sidecars (`description.json` included). Since Phase 1d it also removes
`windows/` (a chapterless book's window transcripts and detection) and keeps
`chapters_detected.json` (titles only, which `chapters.detect` reuses). Each purge takes the engine's hold on
the book: the daily sweep leaves a held book (a description being written) for
its next run.

## The engine wiring

`internal/app/engine.go` builds the engine the way audiosilo-sidecars' daemon
did, minus its folder scan, and starts it in the background once the Bridge runs:

- the event hub with its durable persister (events kept 30 days);
- the media tools (`toolfetch`) and the ASR backend (`asr.Select`; a backend that
  can't be used leaves the engine running, and an `asr` stage parks
  `asr_unavailable`);
- **only the agent container's runner** (`agentbox`, decision 15): the Bridge
  never runs an agent CLI itself, and the engine's local claude/codex runners
  stay as code for their output parsers and tests. The engine's agent
  concurrency follows the container's `slots` from `runner.json`;
- the pipeline executor (with both budgets), the scheduler and the supervisor's
  **deterministic** lane only: config normalization forces
  `supervisor.model_assisted`, `supervisor.model_automatic_actions` and the
  backend failover off, whatever the file says, and `supervisor.automatic_actions`
  defaults **on** (its bounded recoveries, each capped per book per day, are the
  point when nobody watches the engine), acting only on a book a job still
  follows;
- the contribution poller, and the two daily sweeps (events, transcripts).

The `sidecars.generate` handler waits for it, so jobs claimed during the first
start just report `waiting`.
