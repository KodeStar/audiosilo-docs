---
title: Series-completion bot
description: "audiosilo-meta-sync, the daily service that reads libex's new-release and coming-soon feeds and completes the series audiosilo-meta already holds. It opens and merges one bounded pull request per cycle behind a re-read merge gate. When enabled, its reported-ASIN lane also imports listings named on metaserve's intake queue, under a tighter bound. Its LibriVox lane keeps the LibriVox mirror current from LibriVox's own catalogue, under an invariant of its own."
---

## What it is

`audiosilo-meta-sync` (private repository, one container) is the only automation
allowed to merge its own work into [audiosilo-meta](./overview.md). Once a day it:

- reads libex's new-release and coming-soon feeds across every Audible
  marketplace;
- finds the series the catalogue **already** tracks;
- fetches every volume of those series;
- imports the ones the catalogue is missing, through audiosilo-meta's own CLI
  tooling. Another edition of a volume the catalogue already holds is attached
  as a recording of that volume;
- opens one pull request, which it merges itself once CI and the `ai-verify`
  workflow agree.

It serves no public traffic. It talks only to:

- libexdb.com;
- api.github.com;
- Audible's public catalog API (`api.audible.*`), only when libex says it cannot
  reach Audible, and not at all with `SYNC_AUDIBLE_FALLBACK=off`;
- metaserve's intake queue, with
  [the reported-ASIN lane](#the-reported-asin-lane) enabled;
- librivox.org's API, for [the LibriVox lane](#the-librivox-lane), unless
  `SYNC_LIBRIVOX=off`.

The same container can also run [the steward](./steward.md) (`SYNC_STEWARD=on`),
which reviews and merges everyone else's data pull requests and triages data
issues on the maintainer's behalf. It is off by default, and with it off nothing
on this page changes.

Why the service exists: the catalogue's import posture is a bounded, curated
tranche and never a mirror of a retailer database. But a catalogue whose series
stop at the volume that was out on the day it was seeded goes out of date.
Something has to notice that book seven exists, and this service automates that
job. It has two other ways in. [The reported-ASIN lane](#the-reported-asin-lane)
is narrower and off unless configured. [The LibriVox lane](#the-librivox-lane) is
on by default and keeps the public-domain LibriVox mirror current.

### The bound

These rules are the whole of the bot's licence, and the code enforces them
rather than only stating them. The policy side is the "Series-completion bot"
section of the repo's `GOVERNANCE.md`. They bind series completion and the
reported-ASIN lane. The LibriVox lane shares the one pull-request slot and the
merge gate, but its records are held to [an invariant of its own](#the-invariant)
instead, and nothing in it widens these rules.

- **It never adds a series**, from the feeds or from the reported-ASIN lane.
  Discovery drops a feed row whose series the catalogue does not already hold.
  After the import, the service re-reads the importer's own summary. A run that
  reports any new series discards its whole tree instead of opening a pull
  request.
- **Its one other kind of new work is a reported standalone.** Only the
  reported-ASIN lane may add a work in no series, under its own
  [identity guard](#what-it-takes-and-what-it-refuses).
- **It never adds a second work at an occupied position.** A new work from the
  feeds only ever fills a free position in a catalogued series.
  - A row for a volume the catalogue already holds is attached to that work only
    when its series, position, authors and title match the incumbent, that is,
    when audiosilo-meta's own work-identity rules resolve it to exactly that work.
    The attachment is another recording, or another ASIN on an existing
    recording.
  - Another marketplace's copy of a catalogued recording, a row in the same
    libex SKU group as one of the recording's ASINs, is attached to that
    recording as another ASIN. On a pin whose import lists `--copies-of`, the
    import resolves nothing from its credits or its series, so it adds no work,
    person or series
    ([every store's copy](#every-stores-copy-of-a-book)).
  - `metaimport libex-select` refuses every other row at an occupied position,
    and the import itself refuses it again.
  - It never changes the incumbent.

  The service turns attaching on with `--attach-editions`, passed to both tools.
- **It never completes another author's, or another language's, series.** A
  same-named catalogued series counts as the row's only when its authors and its
  language fit the row. This is audiosilo-meta's series resolution, the rule
  every writer shares. So an English edition of a book is not a volume of the
  German series of the same name. The selector refuses such a row
  (`series-other-authors`, `series-other-language`). Under
  `--existing-series-only`, the import drops any such claim rather than founding
  the row's own series.
- **It writes nothing outside `data/`.** The commit stages `data` alone, and the
  service refuses the resolver's diff outright if it strays. Schema, tooling and
  workflows are out of reach, and `CODEOWNERS` would stop it anyway.
- **It fills gaps, not just the tip.** If volume 5 surfaces in a feed and the
  catalogue holds 1 and 2, the whole series is fetched and 3, 4 and 5 are added.
- **It is capped per pull request.** At most `SYNC_MAX_WORKS_PER_PR` new works
  (default 100) land at a time, whole series first, in position order, so each
  cycle stays small enough for a person to read. What the cap cuts is not
  discarded. The series those rows came from stay queued, and a later cycle
  expands them again. A reported-ASIN lane pull request has its own,
  tighter cap ([its limits](#its-limits)).
- **One pull request at a time**, every lane's included. A cycle that finds one
  still open stops before it touches libex, LibriVox or the intake queue.
- **Coming-soon (preorder) titles are included**, imported with their announced
  release date.
- **Every record it writes carries the typed `libex-import` provenance**, so the
  whole source stays retractable in one act. The trust tiers rank these records
  exactly as any other bulk-mirror record. The first user-library import, or Add
  a work or Add a recording submission, that matches one by ASIN takes the
  record over.
- **It never writes a retailer's prose.** The row projection drops
  `description`, `summary`, `rating`, `copyright` and `isbn` before anything is
  written. This is a licensing rule, not a preference.

Alongside the new works it runs `metaimport libex --enrich` over the touched
series' existing members. Enrichment fills only absent facts (a missing cover or
chapter table, a year-only release date refined to the stated day) and never
overwrites a recorded value.

## The daily cycle

```
  daily cycle
      |
      v
  clone/refresh  --->  read the catalogue index (series names, positions, ASINs)
      |
      v
  the reported-ASIN lane's turn, when enabled and due  --->  opened a PR: the cycle ends
      |
      v  (sat out, found nothing or failed: on to the next turn)
  the LibriVox lane's turn, when on and due  --->  opened a PR: the cycle ends
      |
      v  (sat out, found nothing or failed: completion runs as usual)
  walk 11 marketplaces x 2 feeds incrementally  --->  rows naming a series we already hold
      |                                                  (queued, with the feed cursor, in one save)
      v
  take up to 400 series off the queue: news first, then oldest first
      |
      v
  fetch every book of those series from libex  --->  rows.ndjson
      |                                               (+ chapters for the new ones)
      |                                          --->  copies.ndjson (copies of catalogued
      |                                                recordings, the region follow-up's too)
      v
  metaimport libex-select  --->  the per-PR cap  --->  subset.ndjson
      |
      v
  metaimport libex (create)
      |
      v
  metaimport libex --recordings-only --copies-of  (copies of catalogued recordings)
      |
      v
  metaimport libex --enrich  (over ALL of rows.ndjson)
      |
      v
  metafmt --write --profile core  --->  metacheck --profile core
      |                                        |
      |                                   (fails: discard everything, log, stop)
      v
  commit data/  ->  push sync/<date>  ->  open one PR, labels data + bot-intake + bot-sync
```

The lanes take their turns after the open-pull-request and parked checks and the
clone's refresh, and before discovery: the reported-ASIN lane
([A turn](#a-turn)), then the LibriVox lane
([its turn](#its-turn-and-the-one-slot)). Each runs on its own record of the
cycle and touches nothing in the series queue.

A few properties of the completion pass are worth knowing.

- **Discovery is complete. Nothing a feed shows is dropped, only deferred.** The
  watchlist on meta.audiosilo.app depends on this. A book the bot never picks up
  is a new-volume notification that never arrives. Four mechanisms each fix a
  way books used to be lost (measured against the live API on 2026-09-26):
  - **Feeds are paged sorted by `updatedAt`.** libex's default order is
    `releaseDate`, which ties tens of thousands of rows at midnight. Offset
    paging over ties returns some rows twice and others never. All 75 pages of
    the US new-release feed returned 7,498 rows but only 5,287 distinct books.
    Sorted by `updatedAt`, 3,000 rows were 3,000 distinct books.
  - **Each feed is read incrementally and resumably.** A walk reads from page 1
    down to where the previous walk reached: a watermark, less an hour of
    overlap. So a steady-state day costs a few pages per feed.

    The feeds are deep: 75 pages for US new releases, 845 for UK new releases
    and 84 for US coming-soon over a year. So a walk is capped at 200 pages a
    cycle, and the next cycle **resumes** where it stopped. It seeks back to
    that exact row with single-row probes, even after rows have moved or left
    the feed. The old 50-page cap cut the rest.

    Once a week the service walks each feed to its end again. That catches rows
    an incremental walk cannot see, such as a preorder entering the window with
    an old `updatedAt`.
  - **coming-soon is read a year ahead** rather than 30 days, so a preorder
    announced months before release is picked up when it is announced.
  - **Series wait in a persistent queue.** A cycle expands at most 400 series,
    taken from the head of the queue: news first, then oldest first. Work that
    only enriches existing records is promoted after a week, so nothing
    starves. A series leaves the queue only when the cycle that expanded it
    succeeded. The old bound took 400 and dropped the rest (615 on one live
    cycle), with nothing to bring them back.

    A series whose feed rows are all catalogued already is queued again only if
    it has not been expanded in 30 days. So a libex re-scrape burst (9,502 UK
    rows in one day) cannot flood the queue. A sync pull request that is
    recycled or closed without merging puts its series back on the queue.

  The service saves a feed's cursor together with the queue entries its rows
  produced, so a crash can make a cycle re-read rows but never skip them. A dry
  run works on a copy and moves neither. The cycle log carries one line per feed
  saying what its walk did (pages, rows, completed or resuming). `GET /status`
  reports the queue length and each feed's cursor.
- **Two budgets bound the rest of a cycle.** A cycle expands at most 400 queued
  series, and what does not fit stays queued. It makes at most 1,500 chapter
  lookups. Rows past the chapter budget still ship, without chapters, because a
  book arriving matters more than its chapter list. No later cycle looks them
  up again. Once catalogued, a row gets a chapter list only if a later series
  listing carries one for enrichment to fill in.
- **A feed row is imported even when the series listing lags it.** The queue
  entry carries the news ASINs the feed showed. The service fetches on its own
  any of them the series listing does not carry yet, and imports it with the
  rest. That is likeliest for a freshly announced preorder. A claim naming a
  catalogued series without a series ASIN is queued under the libex series ASIN
  already known for that series.
- **Errors from external services are gaps, not failures.** None of these is
  fatal:
  - A feed page that did not arrive stops that walk where it is, and the next
    cycle resumes from there.
  - A series libex does not hold leaves the queue.
  - A series listing that did not arrive stays queued. After five failed cycles
    it is dropped until a feed names it again. The cycle log names each drop,
    and `GET /status` counts them on the last cycle.
  - A news row libex returns no record for is counted.
  - A chapters payload libex refuses is counted and logged.
- **`metacheck` is the gate on the way out.** A cycle whose `metafmt` or
  `metacheck` pass fails discards its whole tree back to the base commit and
  opens nothing.

The `bot-intake` label does real work. On every push to `main`, audiosilo-meta's
`intake.yml` rebases every open pull request carrying it onto `main`, with the
pack merge driver and the tombstone table's own driver configured (see
[contributing data](./contributing-data.md#intake-automation-issue-form-to-bot-pull-request)).
So a sync pull request stays mergeable while other work lands, at no cost to the
service. The service rebases only once itself, the moment before it opens a pull
request, because a cycle is long and main may have moved while it ran.

### Every store's copy of a book

A libex series listing belongs to one marketplace. In libex, the copies of one
production across the marketplaces share one SKU group. So the service follows
each new book with the other copies its SKU group holds, and searches each
configured store the group does not cover yet. A hit in the same SKU group joins
the others, and the import folds them all into the same work.

A store search that has no answer within 5 seconds is not waited for. libex
fetches a store it has not seen while the search waits, which can take half a
minute. The service asks it again once, with the full timeout, at the end of the
cycle's discovery, so a copy it finds still lands in that cycle's pull request.
A store that fails that retry too is skipped for the rest of the cycle, and the
region follow-up asks it again later.

A store often lists a book later than the others, and a search can fail. So
each cycle also runs the **region follow-up**. It takes the catalogued
recordings that are released in the last 60 days, not released yet, or added in
the last 30 days, and still lack a configured store. For each one it reads the
SKU group again and searches the stores still missing. A cycle checks at most
400 recordings and makes at most 1,200 searches, preorders and the nearest release
dates first. The rest wait, still due, for a later cycle.

A copy the follow-up finds is attached straight to its recording, and so is a
new row whose SKU group already has a catalogued member. The copies get a run of
their own after the create import,
[`metaimport libex --recordings-only --copies-of`](#the-pinned-cli-contract-meta_ref),
each handed over with the catalogued ASIN it is a copy of. The importer resolves
nothing from a copy's credits or series, so an earlier selector refusal of the
row, such as a doubled author credit or a claimed position, does not keep the
copy out. It still refuses a copy that does not fit the recording, and the
service memoizes that refusal under the run's refusal code, so the copy is not
sent again until the memo entry expires. Only a memo entry under one of the
copies run's refusal codes, a review's refusal (an `ai-verify` exclusion, a
dispute or a resolver's removal) or an open pull request holding the copy keeps
it out of the copies run. Those codes include `ai-narrator`, `malformed-asin`,
`unmapped-region` and `unmapped-language`, so an earlier selector refusal under
one of them keeps the copy out too.

A store that answers without the book is asked again after 1, 2, 4 and 7 days,
then every 14 days. A copy that was found but did not attach (refused, kept out
by a memo entry, held by an open pull request, or cut by a cap) never counts as
a store without the book. The pull request body lists it, and the cycle log
carries one
`follow-up copy <asin> (<store>) of <work>: not attached (<reason>)` line for
it. Its store's backoff does not grow: the follow-up asks again the next day,
or, when a memo entry keeps the copy out, once that entry expires. A copy
outside the follow-up's window, of a book in a catalogued series, still arrives
through its own marketplace's new-release or coming-soon feed.

## The reported-ASIN lane

One of the bot's two other ways in. When enabled, the lane reads metaserve's
[unknown-ASIN intake queue](./api.md#get-apiv1intakeunknown-asins), a list of
anonymous ASINs reported as missing from the catalogue. It imports what those
listings state, standalones included.

The policy is the "reported-ASIN lane" part of the
[Series-completion bot section of GOVERNANCE.md](https://github.com/KodeStar/audiosilo-meta/blob/main/GOVERNANCE.md#series-completion-bot-audiosilo-meta-sync),
which the maintainer decided on 2026-11-05. Its licensing case is "Why the
reported-ASIN lane is not a mirror" in
[LICENSING.md](https://github.com/KodeStar/audiosilo-meta/blob/main/LICENSING.md).

The queue is public input, so the lane is built for the day someone poisons it.
It cannot stall series completion, spend completion's attempts or throttles, or
widen its own bound.

**It is off unless configured.** It runs only with both `SYNC_INTAKE_URL` and
`SYNC_INTAKE_TOKEN` set.

- With neither set, a cycle runs exactly as it does without the lane.
- With one set but not the other, the lane stays off, with one warning at
  startup.

The address must be https, or plain http to a loopback host only, because the
request carries a Bearer token. Any other address stops the service at startup.
To turn the lane off, unset either key and restart.

### A turn

The lane takes a turn only when it is due. It is not due:

- in the first cycle after one of its own pull requests, however long that pull
  request stayed open, because that cycle belongs to series completion;
- while it is paused;
- within 48 hours of its last pull request.

It also needs a `META_REF` whose selector takes `--reported`
([the pinned CLI contract](#the-pinned-cli-contract-meta_ref)). A turn then runs
these steps:

1. **Read the queue**, in its order. The lane drops:
   - malformed ASINs (anything not `^[A-Z0-9]{10}$`);
   - rows under `SYNC_INTAKE_MIN_COUNT` (1);
   - ASINs the catalogue already holds;
   - ASINs with a live memo entry, whether it is the lane's own conclusion or a
     refusal by series completion.

   The answer is capped at 4 MiB.
2. **Look each one up** on libex, one listing at a time, at most 150 a turn.
   When libex says it cannot answer right now, the lane asks Audible's catalog
   API, the same fallback as every book read (`SYNC_AUDIBLE_FALLBACK`). A real
   retailer listing is required. The lane keeps only a book, judged by the
   listing's content type (`SinglePartBook` or `MultiPartBook`, the bulk
   export's own rule). What comes back decides what the lane remembers:
   - **memoized for 45 days**: an ASIN libex does not hold, a listing that is
     not a book (a podcast episode, a periodical issue, a listing stating no
     type), and an answer no retry changes (a refused request, a record for
     another ASIN);
   - **nothing**: libex saying it cannot answer right now, and the fallback
     not answering either;
   - **held off for 7 days**: any other lookup with no answer.

   Three failures in a row end the lookups for the turn.
3. **Select and import** with completion's own tools: the same allow-list
   projection, `metaimport libex-select --reported --attach-editions`, the lane's
   own cap, the create import with `--existing-series-only`, `metafmt`,
   `metacheck` and the no-new-series check. There is no `--enrich` pass.

A turn that sits out, finds nothing, or fails before a pull request exists falls
through to the LibriVox lane's turn and series completion in the same cycle.
None of it counts as a failed cycle.

Two exceptions end the cycle as an error instead:

- a clone that will not sync back to main after a turn that touched it, since
  completion's own first step would fail the same way;
- a request to open the pull request that may have landed, or that GitHub
  refused while the branch could not be deleted, since completion would push to
  the same branch.

A queue that cannot be read (network, 401, 404, 5xx, a redirect, a malformed or
oversized answer) is one log line and costs nothing.

Any other failed step past the lookups rests the lane for `SYNC_INTAKE_EVERY`
(48 hours at least) outside a dry run. Those steps are the rows, selection, the
cap, the chapter lists, the import, `metafmt`, `metacheck`, the no-new-series
check and the push. A failed import or tree check also holds its rows off for 7
days, so one bad row cannot pin the head of the queue.

### What it takes, and what it refuses

- **A reported standalone.** A row stating no series may become a new work in no
  series. `--reported` lets it past the completion test and nothing else, so the
  language, marketplace and credit refusals still apply, an AI narrator
  included. If the importer resolves the row to a work the catalogue holds, it
  lands as another recording of that work, or as another ASIN on one.
- **The identity guard.** Otherwise the selector refuses a standalone as
  `identity-duplicate` when a held work in a compatible language shares at least
  one author and the two titles reduce to the same identity key. The selector
  compares the full titles, and also each side's main title (before a `: ` or
  ` - ` subtitle) against the other's full title. That catches "Ford County"
  beside "Ford County: Stories", and a listing crediting one of a held book's
  two authors.

  The guard is wider than the create path's own guard on purpose. A refused
  report comes back later, while a minted duplicate needs a repair. The price
  is that a distinct book sharing a main title with a held book by the same
  author is refused too.

  What the guard still misses mints a work:
  - a title whose key differs ("Daisy Jones and the Six" beside "Daisy Jones &
    The Six");
  - two spellings of one new book in the same tranche, since only held works
    are compared.

  `bot-sync` pull requests are never flagged for duplicate advisories, so the
  merge gate catches neither.
- **A reported volume of a held series** takes exactly the rules of
  [the bound](#the-bound).
- **A series the catalogue does not hold** is refused, as it is from the feeds.

What the lane concludes about a row (not found, not a book, refused, excluded) is
scoped to the lane. Series completion still judges that row for itself, so a
report can never keep a real volume out of completion.

### Its limits

| Limit | Value | Setting |
|---|---|---|
| Records per pull request, new works and attached editions counted together, one per row | 25 | `SYNC_INTAKE_MAX_WORKS` |
| Pull requests | at most one per 48 hours | `SYNC_INTAKE_EVERY` |
| Listing lookups per turn | 150 | `SYNC_INTAKE_MAX_LOOKUPS` |
| Reports an ASIN needs | 1 | `SYNC_INTAKE_MIN_COUNT` |

The first three are clamped. A value past the bound is lowered to it with one
startup warning, so the environment can only tighten them. Rows past the cap are
not memoized and come back on a later turn. The 48-hour clock starts just before
the pull request opens, so the turn still counts if GitHub refuses the pull
request or it is later closed or recycled.

The queue's `count` only orders the work and is never evidence for a record
([it is unverified](./api.md#get-apiv1intakeunknown-asins)).

### Sharing the one slot

A lane pull request is a `sync/` branch with the usual `data`, `bot-intake` and
`bot-sync` labels plus `sync:intake`. So [the merge gate](#the-merge-gate) and
[the escalation ladder](#the-escalation-ladder) apply unchanged, and `ai-verify`
reads it as a sync-bot pull request.

Its body is the lane's rationale and the complete list of its ASINs, attached
ones included, with no counts and no queue dates. Retracting the lane alone
means reading those lists, since its records carry the same typed
`libex-import` provenance as the feeds' records. A merge starts series
completion at once.

The lane stays out of the systemic stop:

- **An exclusion pauses the lane for 7 days** instead of counting toward the stop
  after repeated exclusions. So a poisoned queue costs the lane its turns and
  cannot stall series completion. A merge of a lane pull request neither clears
  nor adds to completion's run of exclusions.
- **An infrastructure recycle** (no `ai-verify` verdict) is neither an exclusion
  nor a pause, does not count toward the recycle throttle, and returns the rows to
  the queue for a later turn.
- **With `SYNC_AGENT=none`** a flagged lane pull request is excluded rather than
  parked, so public input cannot fill `SYNC_MAX_PARKED`.
- **The fix agent is held to the bound.** The service refuses an amendment that
  adds a series entry, a work or a recording ASIN to a lane pull request, and
  the attempt is spent.

Its state is the `intake` block of [`GET /status`](#operating-it).

## The LibriVox lane

The bot's second source. Once a UTC day the lane reads
[LibriVox](https://librivox.org)'s own catalogue and imports the projects
LibriVox has catalogued since its last run. So the
[LibriVox mirror](./contributing-data.md#librivox-the-public-domain-mirror) stays
current without a person cutting tranches.

The policy is "The LibriVox lane" in
[GOVERNANCE.md](https://github.com/KodeStar/audiosilo-meta/blob/main/GOVERNANCE.md#the-librivox-lane),
and its licence for the data is LICENSING.md's public-domain exception. It is a
separate source under [its own invariant](#the-invariant), so
[the bound](#the-bound) above does not widen to cover it.

The lane writes no record itself. The importer is audiosilo-meta's
`metaimport librivox import`, at the pinned commit. The lane decides which
projects to hand it, and whether what came back stays inside the invariant.

**It is on by default.** `SYNC_LIBRIVOX=off` is its kill switch, and stops the
lane alone. Whatever the lane has learned stays in the state file for when it is
back.

### Its turn, and the one slot

The lane takes its turn after the reported-ASIN lane and before discovery, on its
own record of the cycle, so nothing it does charges a queued series. It sits out,
reading nothing:

- in the first cycle after a lane pull request, its own or the reported-ASIN
  lane's, because that cycle belongs to series completion. The lane owes that
  cycle from just before its push, so one whose pull request GitHub refused
  owes it too;
- once it has read LibriVox that UTC day. The day is stamped when the turn
  starts reading, so a read that fails also waits for tomorrow;
- for a day after an [exclusion](#what-happens-to-its-pull-request);
- while the pinned `metaimport librivox import` does not list `--skipped` and
  `--worklist` ([the pinned CLI contract](#the-pinned-cli-contract-meta_ref)).
  Without them a refused project cannot be told from a lost one, and the
  worklist would be read from nowhere. The lane logs one line a cycle and
  nothing else changes.

A turn then runs these steps:

1. **Read the window**: the projects LibriVox catalogued since the lane's
   cursor, 100 a page, with their sections, genres, translators, archive.org
   item and cover. On most days that is one request. On its first run and every
   30 days after, the turn also runs [the census](#the-window-and-the-census),
   unless it is a [retry run](#the-pending-list), which leaves the census for the
   next turn.
2. **Filter.** The turn leaves out every project the catalogue holds, every one
   still being recorded (no runtime and no archive.org item yet) and every one on
   [the pending list](#the-pending-list) that is not due.
3. **Import and check.** The turn writes the projects it read into a local
   snapshot and hands at most `SYNC_LIBRIVOX_MAX_PROJECTS` (200) of them to
   `metaimport librivox import`, with `--skipped`, `--worklist` and
   `--conflicts`. Then come `metafmt`, `metacheck`, the no-founded-series check
   and the lane's invariant. An import summary that states a new series is
   refused before any of them.
4. **Open one pull request** on `sync/librivox-<day>`, titled
   `[sync] LibriVox <day>: N new works, M new recordings` and labelled `data`,
   `bot-intake`, `bot-sync` and `sync:librivox`. Its body names the window, the
   invariant the tree passed and every project id it carries, and points at the
   worklist issue whenever the pending list holds a project for a person, this
   run's or an earlier one's. A retry run's body says it is a retry instead of
   naming a window.

The lane never hands the importer a project the catalogue already holds. For a
held project the importer re-reads the recording, which is an edit, and editing
is not this lane's to do. So a correction LibriVox makes to a held project is not
picked up either: re-reading recent projects would be an edit path, which needs
its own invariant written into GOVERNANCE.md first. Until then a correction to a
LibriVox record goes through an issue or a pull request under the ordinary merge
policy.

What a turn leaves behind:

| What happened | The turn | Kept |
|---|---|---|
| A gate, or a pin without the flags | sits out, nothing read | nothing |
| The window could not be read | sits out, one log line | the day's read |
| Nothing to import | falls through, tree untouched | the holds, and the cursor if the window settled |
| The import, `metafmt`, `metacheck`, the founded-series check or the invariant fails | discards the tree, falls through | every candidate held as `failed` |
| The import landed nothing | falls through | the holds, and the cursor if the window settled |
| The pull request opens | the cycle ends | the yield to series completion |
| GitHub refuses the pull request | deletes the branch, falls through | the yield to series completion; the import's holds; the tree's projects held as `failed` |
| A dry run with a diff | the cycle ends, the tree left in the clone | nothing |

Falling through means series completion runs in the same cycle, as after the
reported-ASIN lane.

### The window and the census

**The cursor** is the lane's own, never a libex feed cursor. It is the midnight
UTC of the day a window was read. A turn reads
`?since=<cursor>&extended=1&coverart=1&format=json`. With no cursor yet, the
window starts at `SYNC_LIBRIVOX_SINCE`, or else the day before the first run.
The cursor moves only:

- when a lane pull request that read a window merges, to the midnight UTC of
  the day that window was read, where the next window starts;
- on a turn that opens nothing because every project of its window is already
  held, or is on the pending list for a durable reason (any but `failed`,
  `deferred` and `unread`).

Opening, recycling, closing or excluding a pull request, a failed turn, a retry
run and a dry run move nothing, so no window is ever skipped. An empty window is
LibriVox's HTTP 404 with `{"error":"Audiobooks could not be found"}`, which the
lane reads as an empty day and not as an error.

LibriVox's `since` filters on a project's catalogue date, which LibriVox sets when
the project completes. That was probed live on 2026-11-12: a window from
2026-10-20 returned 51 projects, every one complete. So the daily window does
reach a project that completes after it was first listed, and the census is a
safety net behind it.

**Requests are polite.** They go out at least 5 seconds apart and name
meta.audiosilo.app and kode@audiosilo.app in their User-Agent. A 429, a 5xx and a
transport failure are retried, honouring `Retry-After` (else with a backoff). Any
other 4xx is an error.

**The census** lists the whole catalogue on the lane's first run and every 30
days after, for whatever a window missed. It reads about 45 pages of 500, with
only each project's id and runtime, 5 seconds apart. The archive.org item is left
out because LibriVox fills it only in its extended answer, and an extended page of
500 took 14.5 seconds against 1.2 seconds for a light one. A project the census
lists that the catalogue lacks and the pending list does not hold is then:

- held as `in-progress` when it has no runtime, the census's only test. It is
  never read by id: it is imported when a window lists it complete, or when a
  later census sees a runtime;
- otherwise read by id (`?id=<n>&extended=1`) and imported.

The census's finds are not the only by-id reads. A project on
[the pending list](#the-pending-list) that is due and outside the window is read
by id too, and those go first. At most 50 projects are read by id in a turn,
within the room the window's projects left under the per-pull-request cap. A
census find past either bound waits as `deferred`, and a due pending project past
them stays as it is, due next turn. A by-id read that fails ends the turn's reads
and holds that project as `unread`. A census that fails is tried again the next
turn, and the window's turn goes on.

### The pending list

A project the lane could not land is kept on a durable list in the state file,
never forgotten, and tried again on its own schedule. A project leaves the list
**only** when the catalogue holds it, whoever added it. So a person who resolves
a project by hand needs to do nothing else. A wiped state file is rebuilt by the
next census.

| Reason | Set when | Tried again |
|---|---|---|
| `in-progress` | no runtime and no archive.org item, or the import printed it as in progress | when seen complete |
| `worklist:<reason>` | the import's `--worklist` row: a match it will not decide alone | every 7 days |
| `refused:<code>` | the import's `--skipped` row | every 30 days |
| `unlanded` | handed to the import and not landed, with no reason given; or LibriVox lists no such id | every 30 days |
| `deferred` | past the cap or the by-id budget, or put back by a recycled, closed or excluded pull request | the next turn |
| `failed` | its turn's import, `metacheck` or invariant failed; its tree's pull request did not open; or a required check closed its pull request [the second time in a row, or closed a retry](#what-happens-to-its-pull-request) | after 7 days, in halves |
| `unread` | its by-id read failed | after 7 days |
| `excluded` | behind a work an `ai-verify` finding named | once more after 30 days; excluded a second time, it is held for a person |

**A failed run is never retried whole.** When `failed` projects are due, that
day's turn is a retry run. It imports only the first half of them, or the one
alone when only one is due, read from the window or by id. The window's other
projects wait for the next turn, which reads the same window again, because a
retry pull request's merge leaves the cursor where it is. So one bad project among
200 is alone after a few halvings a week apart, and the good ones land on the days
between. A project that still fails alone stays `failed` and is retried alone
weekly.

### The invariant

The lane checks it itself, over every pack the run changed: both sides of each,
read one pack at a time, deleted packs included. It runs last, before anything
is committed. A run
that breaks it is discarded whole. Nothing is pushed, no pull request opens, and
its projects are held as `failed`.

- **It adds only `librivox`-sourced works, people and recordings.** A new record
  whose `sources` name anything but `librivox` is refused, and so is a new
  recording whose `librivox_id` is not one of the projects the run was given.
- **It never touches a series or `data/redirects.json`.** Nothing outside the
  works and people families changes, and no entry is ever removed.
- **It never edits a record another source owns.** On a held work it may only
  attach a new LibriVox recording and add a `librivox` source entry. An existing
  recording is never changed. On a held person it may only **stamp**:
  - write the person's LibriVox author or reader id where the record holds none;
  - add a `librivox` source entry;
  - write the birth and death years LibriVox states, only when the record states
    neither year. A year another source or a hand edit wrote is never
    overwritten, and one half is never added beside the other's existing value.

  An alias list is an edit too, since the importer reads aliases and never
  writes them.

It was calibrated on 2026-11-12 against real importer output. The import commits
and full merges of the L3 backfill's tranches 10 and 11 (about 2,900 packs, hand
fixes included) were all accepted. As a negative, a libex completion commit was
refused with 94 violations.

### The worklist issue

The rows the importer will not decide alone go to one issue on audiosilo-meta,
titled "LibriVox lane: projects held for a person". The lane keeps it current.
It is labelled `sync:librivox-worklist` and never `data`, so
[the steward](./steward.md), which triages only `data` issues, leaves it alone.
The issue lists:

1. the `same-name-author` rows first, each with its candidates and how to resolve
   it. A LibriVox author there has the name of a person the catalogue holds, and
   the importer will not stamp that person without a judgement;
2. the other [worklist reasons](./contributing-data.md#the-worklist);
3. the excluded projects, a twice-excluded one marked as held;
4. the count of projects still being recorded, folded away at the end. Those need
   nothing from a person.

It lists at most 200 rows and says how many more there are, with fewer when the
body would pass GitHub's size limit. It is rewritten only when its content
changes, and closed when nothing is left on it (in-progress projects alone need
no issue). The text goes out as every text bound for GitHub does, with mentions
defused and secrets redacted. A dry run logs the body instead.

The issue needs the PAT's **Issues: read and write**. Without it the lane still
runs and opens its pull requests, and the issue calls answer 403 and are only
logged.

A person resolves a row with an ordinary pull request under the merge policy:
see [how to resolve a worklist row](./contributing-data.md#resolving-a-row-of-the-lanes-worklist).

### What happens to its pull request

A lane pull request goes through [the merge gate](#the-merge-gate) exactly as a
completion pull request does: the required checks green and `ai-verified` on its
exact head. `ai-verify` reads a `sync/librivox-` branch as the LibriVox lane. Its
prompt there says what a LibriVox record is: the `librivox_id` and the
archive.org item are the evidence, no ASIN is expected, readers are volunteers
under the names they chose, old first-publication years and every language are
normal, a stamp on a held person is expected, and so is a work in no series. Any
series change is a finding. Advisories show in the verdict comment, unflagged.

**There is no resolver**, whatever `SYNC_AGENT` says. The
[escalation ladder](#the-escalation-ladder) has no fix or drop rung for this
lane, and the evidence goes straight to its end:

- **An `ai-verify` flag** closes the pull request unmerged and labels it
  `sync:auto-excluded`. The projects behind the works the finding names are
  excluded, or all of its projects when it names none. The rest go back on the
  list as `deferred`, and the lane rests a day. The exclusion counts in
  `/status`'s `excluded` but not toward completion's circuit breaker.
- **A required check that fails again after its one re-run** closes the pull
  request too, with nothing excluded, no label and no rest day. `/status` counts
  these closes in a row as `check_closes`:
  - the first close puts every project back as `deferred` for the next run, since
    a break on main is the likelier cause;
  - the second close in a row holds every project as `failed`, so the halving
    retry finds the project whose data breaks the check, rather than the same
    window coming back every day with the cursor stuck;
  - a retry pull request that a check closes holds its projects as `failed` at
    once, whatever the count, and does not add to it, so a later window pull
    request does not inherit the retry's strike.

  Any LibriVox lane merge resets the count. A reported-ASIN lane merge does
  not.
- **A recycle** (no `ai-verify` verdict on the head, or main moved out from
  under it), a close by hand and an abandoned park put every project back as
  `deferred` and leave the cursor alone. The next run
  reads the same window again. A recycle does not count toward the recycle
  throttle.
- **A merge**, by the watch tick or by hand, moves the cursor to the midnight
  UTC of the day its window was read (a retry run's leaves it where it is) and
  ends the run of check closes. It also lets series completion's cycle start at
  once.

### The LibriVox lane's limits

| Limit | Value | Setting |
|---|---|---|
| Projects per pull request | 200 | `SYNC_LIBRIVOX_MAX_PROJECTS` (a higher value is clamped, with one startup warning) |
| Reads of LibriVox | one turn a UTC day | none |
| Projects read by id per turn | 50 | none |
| The census | every 30 days, about 45 requests | none |

Its state is the `librivox` block of [`GET /status`](#operating-it).

## The merge gate

The intake sweep's rebase force-pushes the branch, and a force-push re-runs both
workflows. But the outcome **labels** are rewritten only when the new
`ai-verify` run finishes. For a few minutes the new head carries the previous
run's `ai-verified` label and no check runs at all. A gate that trusted the label
would merge a rebase nobody verified. When the rebase left the judged content
unchanged, the new run re-applies the last verdict without a model call, so that
window is a minute or two. The gate still waits for the run on the new head.

So on every tick (`SYNC_WATCH_INTERVAL`, default 5 minutes) the service re-reads
everything from the API: head SHA, labels, merged or closed state, check runs and
commit statuses. It requires all of:

- the check runs `check`, `compose` and `site` (from `check.yml`) and `verify`
  (from `ai-verify.yml`) all **present and concluded** `success`, `skipped` or
  `neutral` **for the current head SHA**;
- no other check run pending or failed, and no failing commit status;
- the label `ai-verified` present and `ai-flagged` absent;
- the head SHA unchanged for at least **two minutes**.

The merge call pins the SHA the gate judged. If the sweep moves the branch in
between, GitHub answers 409 and the next tick re-decides. A 405 or 409 means
"wait for the next tick", never a failure. After a merge the service deletes the
branch. If the per-PR cap carried work over or series are still queued, the next
cycle starts immediately rather than tomorrow.

Here, and only here, the `ai-verified` verdict is not advisory. It stands in for
the maintainer approval a batch import otherwise needs. A pull request that stops
short **never waits for a human because of its data or flaky CI**. Every such
state ends in a decision the service makes itself:

- **A required check failed** (`check`, `compose` or `site`). On a head that is
  behind main the service only waits, since the intake sweep is about to rebase
  it. Otherwise it re-runs the workflow run's failed jobs **once** per head,
  because a flaky runner is not evidence about the data. If the check fails
  again, the pull request climbs
  [the escalation ladder](#the-escalation-ladder), with the failed job's log as
  the evidence.
- **`ai-verify` flagged it** (on a head whose `verify` run has concluded). The
  pull request climbs the escalation ladder.
- **`ai-verify` never gave a verdict.** Either its run failed until the
  re-dispatches ran out (10, 30, then 60 minutes apart, at most
  `SYNC_VERIFY_REDISPATCHES` per head), or the head sat six hours with no verdict
  at all. The service then **recycles** the pull request (closes it and
  re-imports fresh), since nothing is known to be wrong with the data.

  Three of these in a row, with no merge and no verdict in between, stop the next
  cycle from starting at once, and it waits for the normal interval. `/healthz`
  then reports degraded until a pull request merges or `ai-verify` gives a
  verdict again, so a broken `ai-verify` cannot spin. A lane pull request's
  recycle does not count (see [Sharing the one slot](#sharing-the-one-slot) and
  [the LibriVox lane's pull request](#what-happens-to-its-pull-request)).

Only **configuration errors** still **park** a pull request. The service labels
it `sync:needs-human`, comments and stops watching it. The configuration errors
that park are:

- `SYNC_AGENT=none` when there is evidence to resolve (a
  [lane](#sharing-the-one-slot) pull request is excluded instead);
- a 403 from dispatching `ai-verify` or re-running a check, which means the PAT
  lacks Actions: read and write.

Removing the label hands the pull request back.

None of this weakens the merge gate. A pull request still merges only when every
required check concluded well on the exact head and it carries `ai-verified`.

The decision is a pure function over one tick's observation
(`internal/watcher`). That is what makes every allowed and denied case a table
test.

## The escalation ladder

Evidence against a pull request's data is an `ai-verify` flag, or a required
check that failed again after its re-run. The service resolves it rung by rung:

| Rung | What happens |
|---|---|
| **Fix** | Up to `SYNC_RESOLVE_ATTEMPTS` (default 3) resolver attempts, each allowed to edit a field or remove an entry the pull request added. |
| **Drop** | One more attempt whose **only** allowed action is removing the entries the evidence concerns, with their series placements and any person record only they reference. If the agent cannot tell which entries, it removes every work the pull request added in the series the evidence names. If the evidence names no series, it removes nothing and says so. |
| **Exclude** | The service closes the pull request, then comments on it, labels it `sync:auto-excluded` and deletes its branch. |

The exclusion comment lists exactly which rows are excluded and quotes the
evidence. What happens to those rows depends on the evidence:

- For an `ai-verify` flag, every row the pull request imported is memoized as a
  selector refusal for 45 days.
- For a failed check, the rows are released instead. A check that outlives a
  re-run and every attempt is almost always systemic, not about those rows.

The series its cycle expanded go back on the queue, so the rest of each series is
re-imported. The next cycle starts at once, except from the second exclusion in a
row on (see the circuit breaker at the end of this section).

Every attempt that runs is consumed, pushed or not. The count does not reset when
the head moves, so the ladder always ends. The service keeps the step reached in
the state file, so a restart resumes where it was.

`sync:auto-excluded` is an audit trail for a maintainer to look through later
(`is:pr is:closed label:sync:auto-excluded`). Nothing reads it back, it never
blocks a cycle and it never counts against `SYNC_MAX_PARKED`. `/status` reports
how many pull requests have been excluded.

A **circuit breaker** stops a systemic failure from excluding every pull request
back to back. From the second exclusion in a row with no merge in between, the
service still excludes, but the next cycle waits for the normal interval.
`/healthz` then reports degraded, naming the count and the last reason. A lane
pull request's exclusion does not count toward it (see
[Sharing the one slot](#sharing-the-one-slot) and
[the LibriVox lane's pull request](#what-happens-to-its-pull-request)).

## The resolver

The first two rungs hand the evidence to a coding agent CLI, which edits the
data and pushes an amendment. The evidence is:

- for an `ai-verify` flag, the reviewer's comment;
- for a failed check, the last 200 lines (at most 20KB) of the failed job's log,
  redacted. When the log cannot be read, it is a note naming the check and
  telling the agent to reproduce it with `metafmt` and `metacheck`.

Either way the evidence goes into the brief fenced as data, never as
instructions.

- **Auth is always a subscription login, never an API key.** Claude reads
  `CLAUDE_CODE_OAUTH_TOKEN`, the long-lived token `claude setup-token` mints.
  That is the same transport audiosilo-meta's own `ai-verify.yml` uses. Codex
  reads the ChatGPT login in `~/.codex/auth.json`, mounted into the container.
  No key is read from the environment, composed into argv, or written to disk.
- **The agent never sees the GitHub token.** The service *removes*
  `GITHUB_TOKEN` from the child environment rather than merely leaving it
  unmentioned. The agent has Bash and a network, it is steered by text an
  automated reviewer wrote, and it has no use for the PAT because the service
  does the pushing. This is a barrier against accidental pickup, not a sandbox,
  because the agent shares the service's uid.

  The intake queue's token (`SYNC_INTAKE_TOKEN`) goes further. The service
  removes it from its own environment at startup, so no child process inherits
  it, and also clears it from the agent's environment.
- **The brief is narrow.** In fix mode the agent may edit or remove records
  *this* pull request added. In drop mode it may only remove the ones the
  evidence concerns. In either mode the agent must:
  - never touch a record that predates the pull request (compared against the
    branch's merge base with main);
  - never write outside `data/`;
  - finish with `metafmt --write` and `metacheck` passing.

  The service then verifies that itself before committing. A diff that strays
  outside `data/`, a tree that does not validate, or an agent that changed
  nothing all mean the service discards the work and the attempt is spent.
- **The push is `--force-with-lease`**, because the intake sweep may have rebased
  the branch. A lease rejection means the branch moved while the agent worked.
  That is not the agent's fault, so the attempt is **not** consumed and the next
  tick tries again.

If the evidence survives the drop attempt too, the service excludes the pull
request (see [the escalation ladder](#the-escalation-ladder)). It does not park.

Parking is reserved for configuration errors. The service stops opening new pull
requests once `SYNC_MAX_PARKED` (default 3) are parked, so a misconfiguration
produces a short queue rather than a backlog. The service re-reads parked pull
requests from the API every watch tick, so merging, closing or handing them back
by hand clears the limit.

## Operating it

The service has three admin endpoints, with no auth. The compose file binds them
to `127.0.0.1`. That binding is what makes the missing auth safe, since
`POST /run` triggers work.

| Endpoint | What it does |
|---|---|
| `GET /healthz` | `{"status":"ok"}` or `{"status":"degraded","detail":"..."}`. Always 200 once the process is up. This is a **liveness** check: a service whose last cycle failed is still alive and will try again. |
| `GET /status` | The whole observable state. Its fields are listed under this table. It never reports the lane's address or token. |
| `POST /run` | Run a cycle now. 202 when queued, 409 when a cycle is already running or queued. The service never stacks a request behind a running cycle. With the steward on, it also needs `Authorization: Bearer` with the token in `/data/admin-token`, since the steward's agent shares the container's loopback. |

`GET /status` reports:

- the last cycle;
- the open pull request and the parked pull requests;
- how many pull requests the ladder has excluded, how many in a row, and the last
  reason;
- how many `ai-verify` infrastructure recycles in a row;
- the next run time;
- the series queue: its length and how many entries carry news;
- each feed's cursor: the watermark, a walk in progress and the last full rescan;
- the resolver backend, the pinned `META_REF` and the required check names;
- `memo_reasons`, the refusal memo counted by why each row was refused. The
  reasons are the selector's reason codes and the copies run's refusal codes,
  with `unknown` for entries from before reasons were recorded;
- `intake`, the reported-ASIN lane (`on`, `last_pr`, `paused_until`).
  `last_cycle.intake` is its last turn;
- `librivox`, [the LibriVox lane](#the-librivox-lane): `on`, its `cursor` and
  `last_census` (shown there only, never under the feed cursors), `last_run`,
  `rest_until`, the `pending` list counted by reason, `check_closes` (lane pull
  requests a required check closed in a row), the worklist `issue` and
  `max_projects`, the per-pull-request cap in force.
  `last_cycle.librivox` is its last turn.

Configuration is environment variables only. One struct reads them all, so the
config surface is exactly this table. Only `GITHUB_TOKEN` is required.

| Variable | Default | What it does |
|---|---|---|
| `GITHUB_TOKEN` | *(required)* | Fine-grained PAT on audiosilo-meta: Contents read/write, Pull requests read/write, Actions read/write, Metadata read. Actions is what re-dispatches `ai-verify`, re-runs a failed check's jobs and reads the failed job's log. Add Issues read/write for the LibriVox lane's [worklist issue](#the-worklist-issue) (the steward needs it too). Not required when `SYNC_DRY_RUN=1`. |
| `SYNC_REPO` | `KodeStar/audiosilo-meta` | The data repository, `owner/name`. |
| `DATA_DIR` | `/data` | Holds the clone, `state.json` and `logs/`. |
| `SYNC_ADDR` | `:8090` | Admin HTTP listen address. No auth, so bind loopback. |
| `SYNC_INTERVAL` | `24h` | Time between cycles. |
| `SYNC_WATCH_INTERVAL` | `5m` | How often the open pull request is re-judged. |
| `SYNC_START_DELAY` | `0` | Wait this long before the first cycle. |
| `SYNC_MAX_WORKS_PER_PR` | `100` | Cap on new works per pull request. |
| `SYNC_MAX_ATTACHMENTS_PER_PR` | `300` | Cap on attached editions per pull request. These are editions of books the catalogue already holds, and they never count as works. Editions over the cap wait for a later cycle. |
| `SYNC_RESOLVE_ATTEMPTS` | `3` | Fix-mode resolver attempts per pull request, before the one drop-mode attempt and then exclusion. `0` goes straight to the drop attempt. |
| `SYNC_RESOLVE_MAX_TOTAL` | `8` | Ceiling on resolver attempts per pull request across all findings. An attempt on a NEW finding is progress and does not count against `SYNC_RESOLVE_ATTEMPTS`. |
| `SYNC_RESOLVE_MAX_TURNS` | `150` | Tool-loop budget for one Claude resolver attempt. The Codex backend has no turn cap and is bounded by `SYNC_RESOLVE_TIMEOUT` alone. |
| `SYNC_RESOLVE_TIMEOUT` | `45m` | Wall-clock budget for one resolver attempt, for either agent backend. |
| `SYNC_STEWARD_MAX_TURNS` | `200` | Tool-loop budget for one [steward](steward.md) task when `SYNC_STEWARD=on`. Separate from the resolver budget. |
| `SYNC_STEWARD_TIMEOUT` | `60m` | Wall-clock budget for one steward task. |
| `SYNC_VERIFY_REDISPATCHES` | `4` | Maximum `ai-verify.yml` re-dispatches per head after runs that failed without a verdict. After that the pull request is recycled. |
| `SYNC_MAX_PARKED` | `3` | Stop opening new pull requests once this many are parked. Only configuration errors park; an excluded pull request never counts. |
| `SYNC_AGENT` | `none` | `claude`, `codex` or `none`. With `none` a flagged pull request parks, because nobody can climb the ladder. A [lane](#sharing-the-one-slot) pull request is excluded instead. |
| `CLAUDE_CODE_OAUTH_TOKEN` | - | Claude's subscription token (`claude setup-token`). Preferred over mounting `~/.claude`. |
| `SYNC_AGENT_MODEL` | - | Optional backend-specific model id for the resolver. |
| `SYNC_REGIONS` | all 11 | `us uk ca au de fr es it jp in br`, exactly the meta schema's region enum. |
| `SYNC_DRY_RUN` | off | Do everything except push and open a pull request. Leaves the diff in the clone and prints the pull request body. |
| `LIBEX_BASE` | `https://libexdb.com` | For tests and local fakes. |
| `SYNC_AUDIBLE_FALLBACK` | on | Ask Audible's public catalog API for a book record or series listing that libex says it cannot give right now. `off` keeps the service to libex alone. |
| `SYNC_TOOLS_DIR` | `/app/bin` | Where `metaimport`, `metafmt` and `metacheck` live. Empty means resolve on `PATH`. |
| `SYNC_INTAKE_URL` | - | metaserve's address, for [the reported-ASIN lane](#the-reported-asin-lane). The lane runs only with this and the token both set. https, or plain http to a loopback host only. |
| `SYNC_INTAKE_TOKEN` | - | The Bearer token of the intake queue's `GET` (metaserve's `METASERVE_INTAKE_TOKEN`). |
| `SYNC_INTAKE_MIN_COUNT` | `1` | Skip queue rows reported fewer times than this. |
| `SYNC_INTAKE_MAX_LOOKUPS` | `150` | Listing lookups per lane turn, at most 150 ([its limits](#its-limits)). |
| `SYNC_INTAKE_MAX_WORKS` | `25` | Records per lane pull request, new works and attached editions together, at most 25. |
| `SYNC_INTAKE_EVERY` | `48h` | At most one lane pull request per this long, at least 48h. |
| `SYNC_LIBRIVOX` | `on` | [The LibriVox lane](#the-librivox-lane); `off` is its kill switch. |
| `SYNC_LIBRIVOX_MAX_PROJECTS` | `200` | Projects per LibriVox lane pull request, at least 1. A higher value is clamped to 200. |
| `SYNC_LIBRIVOX_SINCE` | - | `YYYY-MM-DD`, where the lane's first window starts. Read only while the lane has no cursor. Unset, the first window starts the day before the first run, and the census covers everything older. |
| `LIBRIVOX_BASE` | `https://librivox.org` | LibriVox's address, for a mirror or a test's fake. |

Tokens never reach a log line. The service hands the PAT to `git` as an
`Authorization` header in the child environment, never in a URL or argv. It
scrubs every secret, the intake queue's token included, from every log line,
stored cycle detail and pull request comment.

**The cycle log is the artifact.** Every tool invocation, its output and every
watcher decision go to `<DATA_DIR>/logs/<date>.log` and to stdout.

:::note[The kill switch]
Revoke the bot's PAT, or stop its container. It has no other way into
audiosilo-meta, and nothing in the catalogue depends on it running. The
[reported-ASIN lane](#the-reported-asin-lane) alone stops by unsetting either of
its two keys and restarting. The [LibriVox lane](#the-librivox-lane) alone stops
with `SYNC_LIBRIVOX=off` and a restart.
:::

## The pinned CLI contract (`META_REF`)

audiosilo-meta's `internal/importer` is internal to that module and cannot be
imported from another one. So the service **shells out** to three binaries built
from a pinned commit of that repository:

| Binary | What it does here |
|---|---|
| `metaimport libex-select` | The authoritative selector. Keeps rows that complete a catalogued series at a free position, with mappable language and region and acceptable credits. Writes no records. Its flags are listed under this table. |
| `metaimport libex` | The create path, over the selected subset. With `--recordings-only --copies-of`, the copies run ([every store's copy](#every-stores-copy-of-a-book)). With `--enrich`, the fill-absent-facts path over every row, which is why the service fetches rows the catalogue already holds too. Its flags are listed under this table. |
| `metaimport librivox import` | [The LibriVox lane](#the-librivox-lane)'s import, over a snapshot the lane writes from what it read. Its flags are listed under this table. |
| `metafmt --write` | Canonical rendering, entry relocation, due pack splits. Nothing here computes pack placement by hand. |
| `metacheck` | The gate. A cycle whose `metacheck` fails discards its whole tree. |

`metaimport libex-select` takes these flags:

- `--attach-editions` also keeps rows that are another edition of the work
  already at their position (same series, position, authors and title). The
  import attaches those rows to that work.
- `--refusals <path>` writes one `{"asin","reason"}` line per refused copy of a
  row. An ASIN may repeat, and one carrying a `duplicate-asin` line is not a
  clean refusal. The file never holds an ASIN the subset carries, and never an
  empty one.
- `--attachments <path>` writes one `{"asin","work","series","position"}` line
  per row kept for attachment, so a caller can tell those from completions.
- `--reported`, passed by [the reported-ASIN lane](#the-reported-asin-lane)
  alone, also keeps a row stating no series as a standalone, under every refusal
  that does not read a series. It refuses such a row as `identity-duplicate`
  when a held work by one of its authors has the same title with or without a
  subtitle. It adds no refusal code.

The selector writes the subset and both files together or not at all, the subset
last.

`metaimport libex` takes these flags:

- `--attach-editions` attaches the rows the selector kept as another edition of
  the work at their position. It also makes the import refuse a row
  at an occupied position that is not another edition of the work there.
- `--existing-series-only` separately forbids founding a series.
- `--skipped <path>` lists every row the import refused for a reason that has a
  refusal code, in the `--refusals` shape. Rows refused at an occupied position
  carry `position-claimed`. The service memoizes them as refusals rather than
  selecting them again.
- `--recordings-only --copies-of <path>` is the copies run: each line of the
  file pairs a row with the catalogued ASIN it is a copy of. Its merge rule and
  its `copy-` refusal codes, which `--skipped` writes, are in
  [the importer's libex modes](./contributing-data.md#libex-modes-and-recording-relocation).

`metaimport librivox import` runs as
`--from <snapshot> --ids <ids> --data <dir> --date <day> --skipped <path> --worklist <path> --conflicts <path>`:

- `--skipped` writes one `{"librivox_id","reason"}` line per project refused
  under a refusal code. The lane holds those as `refused:<code>`.
- `--worklist` appends one `{"librivox_id","title","authors","reason","candidates"}`
  line per project held for a person. The lane holds those as
  `worklist:<reason>` and lists them on [the worklist issue](#the-worklist-issue).
- The projects the run set aside as still in progress are only printed, on one
  line, which the lane reads. It filters those projects itself before the run,
  so the line is a second check.

A non-zero exit is a failed import, whatever the run wrote, and the lane discards
the tree.

Every `metafmt` and `metacheck` invocation passes `--profile core` explicitly
(the `metaimport` subcommands take no profile). The data repository *is* a
core tree (works, people, series, `redirects.json`), while the tools default to
`all`, and the difference is a failed file accounting.

The pinned commit is the `META_REF` build argument in the service's Dockerfile.
`metasync version`, `GET /status` and the footer of every series-completion pull
request report it. So "which importer produced this data" is always answerable
for those pull requests. A [reported-ASIN lane](#sharing-the-one-slot) pull
request's body carries no footer and does not name the pin, and neither does a
[LibriVox lane](#the-librivox-lane) pull request's.

The reported-ASIN lane depends on that pin. It runs only when the pinned
`metaimport libex-select --help` lists `--reported`. On an older pin the lane
sits every cycle out before it reads the queue, with one log line, and series
completion is unchanged. So deploying the service before the pin is bumped is
safe. The copies run is gated the same way. It runs only when the pinned
`metaimport libex` lists `--copies-of`, and on an older pin the copies go
through the selector and the create import like any other row. A copies run
that exits non-zero discards the cycle's tree and fails the cycle. For the next
7 days, or until the service restarts, the copies then go through the selector
the same way.

The LibriVox lane depends on it the same way. It runs only when the pinned
`metaimport librivox import --help` lists `--skipped` and `--worklist`, and
otherwise sits every cycle out with one log line.

The workspace's cross-repo contract carries this seam as its own section: the
series-completion bot and the library export, section 19 of `CROSS-REPO.md` at
the workspace root. The coupling is a CLI contract and a file layout rather than
a Go import. So a change in audiosilo-meta to any of the following must be
followed by a pin bump and a check in the sync repository:

- The CLI flags of `metaimport libex-select`, `metaimport libex` (including
  `--enrich` and `--conflicts`), `metafmt` or `metacheck`.
- The reason codes `libex-select --refusals` writes (defined once, in
  `internal/importer/refusalcodes.go`).
- The line shapes of `libex-select --attachments` and `metaimport libex
  --skipped`.
- The `--attach-editions` flag both tools take.
- `metaimport libex --recordings-only --copies-of`, its `{"asin","anchor"}`
  line shape and its `copy-` refusal codes.
- `libex-select --reported`, with its standalone and identity rules.
- The flags of `metaimport librivox import`, the line shapes of its `--skipped`
  and `--worklist` files and its printed in-progress line.
- The `sync/librivox-` branch prefix, which `ai-verify` reads as the LibriVox
  lane.
- The libex NDJSON row shape the service emits, or the row projection and
  chapter-acceptance rules it hand-mirrors from `internal/importer`.
- The pack layout under `data/series` and `data/works`, which the service reads
  directly to build its catalogue index.
- The pull request labels `data`, `bot-intake` and `bot-sync`, or the
  `ai-verified` and `ai-flagged` labels the merge gate reads.
- The **job keys** of `check.yml` (`check`, `compose`, `site`) and
  `ai-verify.yml` (`verify`). Neither workflow sets a job `name:`, so GitHub
  names each check run after its key. If a job is renamed, the gate waits
  forever for a run that will never appear.
- The wording of the importer's summary line, which the no-new-series invariant
  is read from. The service refuses an unparseable summary on purpose, because a
  summary it cannot read is one in which the invariant was never tested.

## Deploying

The deployment runbook is `SETUP.md` in the private `audiosilo-meta-sync`
repository. It covers the PAT's exact scopes, the agent login, GHCR access, the
compose file, the first dry run, the sizing and the stop and pause procedures. It
is not reproduced here, because it carries host-specific and credential-handling
steps that belong with the service rather than in public documentation.

Its section 9 covers the reported-ASIN lane, which needs:

- metaserve serving the intake queue: v0.25.1 or later, with both
  `METASERVE_INTAKE_DB` and a `METASERVE_INTAKE_TOKEN` of at least 32 bytes set,
  since the `GET` is registered only with both (see
  [the queue's configuration](./api.md#unknown-asin-intake-queue-optional));
- in a compose file with an explicit `environment:` list, the `SYNC_INTAKE_*`
  keys there as well as in `.env`. Without them there, the lane stays off with
  no error.

Its section 10 covers the LibriVox lane. It needs nothing in `.env`, but the
order of the deploy matters:

1. **audiosilo-meta first.** Its `ai-verify` must read a `sync/librivox-*` branch
   as the LibriVox lane before the service's image runs. Merge that change on
   audiosilo-meta first, or the lane's first pull request is judged as a retailer
   completion.
2. **Then the image**, with a `META_REF` that meets
   [the pinned CLI contract](#the-pinned-cli-contract-meta_ref).

The PAT needs Issues: read and write (see
[the worklist issue](#the-worklist-issue)). In a compose file with an explicit
`environment:` list, `SYNC_LIBRIVOX=off` takes effect only when it is listed
there too.

Worth knowing before a first run either way:

- The first cycle clones audiosilo-meta at depth 1 (roughly 4GB) and reads its
  pack tree.
- `metacheck` over the real catalogue wants about 2GB of RAM.
- A bounded dry run (`SYNC_DRY_RUN=1`, one region, a small
  `SYNC_MAX_WORKS_PER_PR`) does everything except push and open a pull request,
  and leaves the diff in the clone to read.
- With the reported-ASIN lane enabled, a dry-run turn that would open a lane
  pull request stops there, so series completion does not run in that cycle. For
  such a dry run, point `SYNC_INTAKE_URL` at a local metaserve over
  `http://127.0.0.1`.
- The LibriVox lane behaves the same way in a dry run: a turn with a diff stops
  before the pull request, leaves the diff in the clone and logs the body and the
  worklist issue. It moves neither the cursor nor the pending list.
  `SYNC_LIBRIVOX_SINCE=<YYYY-MM-DD>` points such a run at a past window.
- The LibriVox lane's first turn runs [the census](#the-window-and-the-census).
