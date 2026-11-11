---
title: Series-completion bot
description: "audiosilo-meta-sync, the daily service that reads libex's new-release and coming-soon feeds and completes the series audiosilo-meta already holds. It opens and merges one bounded pull request per cycle behind a re-read merge gate. When enabled, its reported-ASIN lane also imports listings named on metaserve's intake queue, under a tighter bound."
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
  [the reported-ASIN lane](#the-reported-asin-lane) enabled.

The same container can also run [the steward](./steward.md) (`SYNC_STEWARD=on`),
which reviews and merges everyone else's data pull requests and triages data
issues on the maintainer's behalf. It is off by default, and with it off nothing
on this page changes.

Why the service exists: the catalogue's import posture is a bounded, curated
tranche and never a mirror of a retailer database. But a catalogue whose series
stop at the volume that was out on the day it was seeded goes out of date.
Something has to notice that book seven exists, and this service automates that
job. Its one other way in, [the reported-ASIN lane](#the-reported-asin-lane), is
narrower and off unless configured.

### The bound

These rules are the whole of the bot's licence, and the code enforces them
rather than only stating them. The policy side is the "Series-completion bot"
section of the repo's `GOVERNANCE.md`.

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
    when its series, position, authors and title match the incumbent, so that
    audiosilo-meta's own work-identity rules resolve it to exactly that work.
    The attachment is another recording, or another ASIN on an existing
    recording.
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
  expands them again. A lane pull request has its own, tighter cap
  ([its limits](#its-limits)).
- **One pull request at a time**, the lane's included. A cycle that finds one
  still open stops before it touches libex or the intake queue.
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
      v  (sat out, found nothing or failed: completion runs as usual)
  walk 11 marketplaces x 2 feeds incrementally  --->  rows naming a series we already hold
      |                                                  (queued, with the feed cursor, in one save)
      v
  take up to 400 series off the queue: news first, then oldest first
      |
      v
  fetch every book of those series from libex  --->  rows.ndjson
      |                                               (+ chapters for the new ones)
      v
  metaimport libex-select  --->  the per-PR cap  --->  subset.ndjson
      |
      v
  metaimport libex (create)  +  metaimport libex --enrich (over ALL the rows)
      |
      v
  metafmt --write --profile core  --->  metacheck --profile core
      |                                        |
      |                                   (fails: discard everything, log, stop)
      v
  commit data/  ->  push sync/<date>  ->  open one PR, labels data + bot-intake + bot-sync
```

The lane's turn comes after the open-pull-request and parked checks and the
clone's refresh, and before discovery. It runs on its own record of the cycle
and touches nothing in the series queue. Its steps are in [A turn](#a-turn).

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

## The reported-ASIN lane

The bot's one other way in. When enabled, the lane reads metaserve's
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
through to series completion in the same cycle. None of it counts as a failed
cycle.

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
  recycle does not count (see [Sharing the one slot](#sharing-the-one-slot)).

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
[Sharing the one slot](#sharing-the-one-slot)).

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
  reasons are the selector's reason codes, with `unknown` for entries from before
  reasons were recorded;
- `intake`, the reported-ASIN lane (`on`, `last_pr`, `paused_until`).
  `last_cycle.intake` is its last turn.

Configuration is environment variables only. One struct reads them all, so the
config surface is exactly this table. Only `GITHUB_TOKEN` is required.

| Variable | Default | What it does |
|---|---|---|
| `GITHUB_TOKEN` | *(required)* | Fine-grained PAT on audiosilo-meta: Contents read/write, Pull requests read/write, Actions read/write, Metadata read. Actions is what re-dispatches `ai-verify`, re-runs a failed check's jobs and reads the failed job's log. Not required when `SYNC_DRY_RUN=1`. |
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
its two keys and restarting.
:::

## The pinned CLI contract (`META_REF`)

audiosilo-meta's `internal/importer` is internal to that module and cannot be
imported from another one. So the service **shells out** to three binaries built
from a pinned commit of that repository:

| Binary | What it does here |
|---|---|
| `metaimport libex-select` | The authoritative selector. Keeps rows that complete a catalogued series at a free position, with mappable language and region and acceptable credits. Writes no records. Its flags are listed under this table. |
| `metaimport libex` | The create path, over the selected subset. With `--enrich`, the fill-absent-facts path over every row, which is why the service fetches rows the catalogue already holds too. Its flags are listed under this table. |
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

- `--attach-editions` attaches those rows. It also makes the import refuse a row
  at an occupied position that is not another edition of the work there.
- `--existing-series-only` separately forbids founding a series.
- `--skipped <path>` lists every row the import refused for a reason that has a
  refusal code, in the `--refusals` shape. Rows refused at an occupied position
  carry `position-claimed`. The service memoizes them as refusals rather than
  selecting them again.

Every invocation passes `--profile core` explicitly. The data repository *is* a
core tree (works, people, series, `redirects.json`), while the tools default to
`all`, and the difference is a failed file accounting.

The pinned commit is the `META_REF` build argument in the service's Dockerfile.
`metasync version`, `GET /status` and the footer of every series-completion pull
request report it. So "which importer produced this data" is always answerable
for those pull requests. A [reported-ASIN lane](#sharing-the-one-slot) pull
request's body carries no footer and does not name the pin.

The lane depends on that pin. It runs only when the pinned
`metaimport libex-select --help` lists `--reported`. On an older pin the lane
sits every cycle out before it reads the queue, with one log line, and series
completion is unchanged. So deploying the service before the pin is bumped is
safe.

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
- `libex-select --reported`, with its standalone and identity rules.
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

Worth knowing before a first run either way:

- The first cycle clones audiosilo-meta at depth 1 (roughly 4GB) and reads its
  pack tree.
- `metacheck` over the real catalogue wants about 2GB of RAM.
- A bounded dry run (`SYNC_DRY_RUN=1`, one region, a small
  `SYNC_MAX_WORKS_PER_PR`) does everything except push and open a pull request,
  and leaves the diff in the clone to read.
- With the lane enabled, a dry-run turn that would open a lane pull request
  stops there, so series completion does not run in that cycle. For such a dry
  run, point `SYNC_INTAKE_URL` at a local metaserve over `http://127.0.0.1`.
