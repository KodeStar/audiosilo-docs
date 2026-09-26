---
title: Series-completion bot
description: "audiosilo-meta-sync: the daily service that reads libex's new-release and coming-soon feeds, completes the series audiosilo-meta already holds, and opens and merges one bounded pull request per cycle behind a re-read merge gate."
---

## What it is

`audiosilo-meta-sync` (private repository, one container) is the only automation
allowed to merge its own work into
[audiosilo-meta](./overview.md). Once a day it reads libex's new-release and
coming-soon feeds across every Audible marketplace, finds the series the
catalogue **already** tracks, fetches every volume of those series, imports the
ones the catalogue is missing through audiosilo-meta's own CLI tooling, and
opens one pull request - which it merges itself once CI and the `ai-verify`
workflow agree.

It serves no public traffic. It talks to libexdb.com and api.github.com, and to
nothing else.

The reason it exists: the catalogue's import posture is a bounded, curated
tranche and never a mirror of a retailer database, but a catalogue whose series
stop at the volume that was out on the day it was seeded decays. Something has
to notice that book seven exists. That one job, and nothing wider, is what this
service automates.

### The bound

This is the whole of the bot's licence, and it is enforced in code rather than
merely stated. The policy side is the "Series-completion bot" section of the
repo's `GOVERNANCE.md`.

- **It never adds a series.** A feed row whose series the catalogue does not
  already hold is dropped in discovery, and after the import the importer's own
  summary is re-read: a run reporting any new series discards its whole tree
  instead of opening a pull request.
- **It never contests an occupied position.** `metaimport libex-select` keeps
  only rows that fill a free position in a catalogued series.
- **It writes nothing outside `data/`.** The commit stages `data` alone, and the
  resolver's diff is refused outright if it strays. Schema, tooling and
  workflows are out of reach (`CODEOWNERS` would stop it anyway).
- **It fills gaps, not just the tip.** If volume 5 surfaces in a feed and the
  catalogue holds 1 and 2, the whole series is fetched and 3, 4 and 5 are added.
- **It is capped per pull request.** At most `SYNC_MAX_WORKS_PER_PR` new works
  (default 100) land at a time, whole series first, in position order, so a
  cycle stays something a person can read. What the cap cuts is not discarded -
  the series those rows came from stay queued, and a later cycle expands them
  again.
- **One pull request at a time.** A cycle that finds one still open stops before
  it touches libex.
- **Coming-soon (preorder) titles are included**, imported with their announced
  release date.
- **Every record it writes carries the typed `libex-import` provenance**, so the
  whole source stays retractable in one act, and the trust tiers rank it exactly
  as any other bulk-mirror record: the first user-library import that matches it
  takes the record over.
- **It never writes a retailer's prose.** The row projection drops
  `description`, `summary`, `rating`, `copyright` and `isbn` before anything is
  written - a licensing rule, not a preference.

Alongside the new works it runs `metaimport libex --enrich` over the touched
series' existing members, which fills only absent facts (a missing cover or
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

A few properties of that pass are worth knowing:

- **Discovery is complete: nothing a feed shows is dropped, only deferred.**
  That is what the watchlist on meta.audiosilo.app depends on - a book the bot
  never picks up is a new-volume notification that never arrives. Four
  mechanisms, each the fix for a way books used to be lost (measured against
  the live API on 2026-09-26):
  - **Feeds are paged sorted by `updatedAt`.** libex's default order is
    `releaseDate`, which ties tens of thousands of rows at midnight, and offset
    paging over ties returns some rows twice and others never: all 75 pages of
    the US new-release feed returned 7,498 rows but only 5,287 distinct books.
    Sorted by `updatedAt`, 3,000 rows were 3,000 distinct books.
  - **Each feed is read incrementally and resumably.** A walk reads from page 1
    down to where the previous one reached (a watermark, less an hour of
    overlap), so a steady-state day costs a few pages per feed. The feeds are
    deep - 75 pages for US new releases, 845 for UK new releases, 84 for US
    coming-soon over a year - so a walk is capped at 200 pages a cycle and the
    next cycle **resumes** where it stopped, seeking back to that exact row
    (with single-row probes) even after rows have moved or left the feed. The old 50-page cap simply cut the
    rest. Once a week each feed is walked to its end again, for rows an
    incremental walk cannot see (a preorder entering the window with an old
    `updatedAt`).
  - **coming-soon is read a year ahead** rather than 30 days, so a preorder
    announced months before release is picked up when it is announced.
  - **Series wait in a persistent queue.** A cycle expands at most 400 series,
    taken from the head of the queue (news first, then oldest first; work that
    only enriches existing records is promoted after a week so nothing
    starves), and a series leaves the queue only when the cycle that expanded
    it succeeded. The old bound took 400 and dropped the rest - 615 on one live
    cycle - with nothing to bring them back. A series whose feed rows are all
    catalogued already is queued again only if it has not been expanded in 30
    days, so a libex re-scrape burst (9,502 UK rows in one day) cannot flood
    the queue. A sync pull request that is recycled or closed without merging
    puts its series back on the queue.

  A feed's cursor is saved together with the queue entries its rows produced,
  so a crash can make a cycle re-read rows but never skip them. A dry run works
  on a copy and moves neither. The cycle log carries one line per feed saying
  what its walk did (pages, rows, completed or resuming), and `GET /status`
  reports the queue length and each feed's cursor.
- **Two budgets bound the rest of a cycle**: at most 400 queued series are
  expanded (what does not fit stays queued), and at most 1,500 chapter lookups.
  Rows past the chapter budget still ship, without chapters - a book arriving
  matters more than its chapter list - and no later cycle looks them up again:
  once catalogued, a row gets a chapter list only if a later series listing
  carries one for enrichment to fill in.
- **A feed row is imported even when the series listing lags it.** The queue
  entry carries the news ASINs the feed showed; any the series listing does not
  carry yet (likeliest for a freshly announced preorder) is fetched on its own
  and imported with the rest. A claim naming a catalogued series without a
  series ASIN is queued under the libex series ASIN already known for it.
- **Errors from external services are gaps, not failures.** A feed page that did
  not arrive stops that walk where it is and the next cycle resumes from there;
  a series libex does not hold leaves the queue; a series listing that did not
  arrive stays queued (after five failed cycles it is dropped until a feed names
  it again - each drop is named in the cycle log and counted on the last cycle in
  `GET /status`); a news row libex returns no record for is counted; a chapters
  payload libex refuses is counted and logged. None of it is fatal.
- **`metacheck` is the gate on the way out.** A cycle whose `metafmt`/`metacheck`
  pass fails discards its whole tree back to the base commit and opens nothing.

The `bot-intake` label is load-bearing rather than decorative: audiosilo-meta's
`intake.yml` rebases every open pull request carrying it onto `main` on each data
push, with the pack merge driver configured (see
[contributing data](./contributing-data.md#intake-automation-issue-form-to-bot-pull-request)).
So a sync pull request stays mergeable while other work lands, for free, and the
service never rebases anything itself.

## The merge gate

That rebase sweep force-pushes the branch, and a force-push re-runs both
workflows - but the outcome **labels** are only rewritten when the new
`ai-verify` run finishes. For a few minutes the new head carries the previous
run's `ai-verified` label and no check runs at all. A gate that trusted the label
would merge a rebase nobody verified.

So every tick (`SYNC_WATCH_INTERVAL`, default 5 minutes) re-reads everything from
the API - head SHA, labels, merged/closed state, check runs, commit statuses -
and requires all of:

- the check runs `check`, `compose` and `site` (from `check.yml`) and `verify`
  (from `ai-verify.yml`) all **present and concluded** `success`/`skipped`/
  `neutral` **for the current head SHA**;
- no other check run pending or failed, and no failing commit status;
- the label `ai-verified` present and `ai-flagged` absent;
- the head SHA unchanged for at least **two minutes**.

The merge call pins the SHA the gate judged, so if the sweep moves the branch in
between, GitHub answers 409 and the next tick re-decides. A 405 or 409 is "wait
for the next tick", never a failure. After a merge the branch is deleted, and if
the per-PR cap carried work over or series are still queued, the next cycle
starts immediately rather than tomorrow.

Here, and only here, the `ai-verified` verdict is not advisory: it stands in for
the maintainer approval a batch import otherwise needs. A pull request that stops
short is **parked** - labelled `sync:needs-human`, commented on, and never
touched again by the service - when a data check failed, when the resolver's
attempts ran out, or when the head has sat six hours with no verdict at all (the
safety valve for an `ai-verify` run that died for an infrastructure reason and so
left no label and no failed check).

The decision is a pure function over one tick's observation
(`internal/watcher`), which is what makes every allowed and denied case a table
test.

## The resolver

When `ai-verify` flags a pull request, the service can hand the flag to a coding
agent CLI, which edits the data and pushes an amendment - at most
`SYNC_RESOLVE_ATTEMPTS` times (default 2; `0` disables it).

- **Auth is always a subscription login, never an API key.** Claude reads
  `CLAUDE_CODE_OAUTH_TOKEN` (the long-lived token `claude setup-token` mints -
  the same transport audiosilo-meta's own `ai-verify.yml` uses); Codex reads the
  ChatGPT login in `~/.codex/auth.json`, mounted into the container. No key is
  read from the environment, composed into argv, or written to disk.
- **The agent never sees the GitHub token.** `GITHUB_TOKEN` is *removed* from the
  child environment rather than merely left unmentioned: the agent has Bash and a
  network, it is steered by text an automated reviewer wrote, and it has no use
  for the PAT because the service does the pushing. That is a barrier against
  accidental pickup, not a sandbox - the agent shares the service's uid.
- **The brief is narrow.** The agent may edit or remove records *this* pull
  request added (it may drop a flagged record entirely), must never touch a
  record that predates it (compared against `origin/main`), must never write
  outside `data/`, and must finish with `metafmt --write` and `metacheck`
  passing. The service then verifies that itself before committing: a diff that
  strays outside `data/`, a tree that does not validate, or an agent that changed
  nothing all mean the work is discarded and the attempt spent.
- **The push is `--force-with-lease`**, because the intake sweep may have rebased
  the branch. A lease rejection means the branch moved while the agent worked;
  that is not the agent's fault, so the attempt is **not** consumed and the next
  tick tries again.

If the flag survives its attempts, the pull request parks. The service stops
opening new ones once `SYNC_MAX_PARKED` (default 3) are parked, so a systematic
fault produces a short queue rather than a backlog; parked pull requests are
re-read from the API each cycle, so merging or closing them by hand clears the
limit.

## Operating it

Three admin endpoints, no auth - the compose file binds them to `127.0.0.1`,
which is what makes that safe, since `POST /run` triggers work.

| Endpoint | What it does |
|---|---|
| `GET /healthz` | `{"status":"ok"}` or `{"status":"degraded","detail":"..."}`. Always 200 once the process is up: this is a **liveness** check, and a service whose last cycle failed is still alive and will try again. |
| `GET /status` | The whole observable state: last cycle, open pull request, parked pull requests, next run time, the series queue (length and how many carry news), each feed's cursor (watermark, a walk in progress, last full rescan), the resolver backend, the pinned `META_REF`, the required check names. |
| `POST /run` | Run a cycle now. 202 when queued, 409 when a cycle is already running or queued - a request is never stacked behind a running cycle. |

Configuration is environment variables only; one struct reads them all, so the
config surface is exactly this table. Only `GITHUB_TOKEN` is required.

| Variable | Default | What it does |
|---|---|---|
| `GITHUB_TOKEN` | *(required)* | Fine-grained PAT on audiosilo-meta: Contents read/write, Pull requests read/write, Metadata read. Not required when `SYNC_DRY_RUN=1`. |
| `SYNC_REPO` | `KodeStar/audiosilo-meta` | The data repository, `owner/name`. |
| `DATA_DIR` | `/data` | Holds the clone, `state.json` and `logs/`. |
| `SYNC_ADDR` | `:8090` | Admin HTTP listen address. No auth - bind loopback. |
| `SYNC_INTERVAL` | `24h` | Time between cycles. |
| `SYNC_WATCH_INTERVAL` | `5m` | How often the open pull request is re-judged. |
| `SYNC_START_DELAY` | `0` | Wait this long before the first cycle. |
| `SYNC_MAX_WORKS_PER_PR` | `100` | Cap on new works per pull request. |
| `SYNC_RESOLVE_ATTEMPTS` | `2` | Resolver amendments per flagged pull request. `0` disables the resolver. |
| `SYNC_MAX_PARKED` | `3` | Stop opening new pull requests once this many are parked. |
| `SYNC_AGENT` | `none` | `claude`, `codex` or `none`. |
| `CLAUDE_CODE_OAUTH_TOKEN` | - | Claude's subscription token (`claude setup-token`). Preferred over mounting `~/.claude`. |
| `SYNC_AGENT_MODEL` | - | Optional backend-specific model id for the resolver. |
| `SYNC_REGIONS` | all 11 | `us uk ca au de fr es it jp in br` - exactly the meta schema's region enum. |
| `SYNC_DRY_RUN` | off | Do everything except push and open a pull request. Leaves the diff in the clone and prints the pull request body. |
| `LIBEX_BASE` | `https://libexdb.com` | For tests and local fakes. |
| `SYNC_TOOLS_DIR` | `/app/bin` | Where `metaimport`/`metafmt`/`metacheck` live. Empty means resolve on `PATH`. |

Two further operational notes: tokens never reach a log line (the PAT is handed
to `git` as an `Authorization` header in the child environment, never in a URL or
argv, and both secrets are scrubbed from every log line, stored cycle detail and
pull request comment), and **the cycle log is the artifact** - every tool
invocation, its output and every watcher decision goes to
`<DATA_DIR>/logs/<date>.log` and to stdout.

:::note The kill switch
Revoke the bot's PAT, or stop its container. It has no other way into
audiosilo-meta, and nothing in the catalogue depends on it running.
:::

## The pinned CLI contract (`META_REF`)

audiosilo-meta's `internal/importer` is internal to that module and cannot be
imported from another one, so the service **shells out** to three binaries built
from a pinned commit of that repository:

| Binary | What it does here |
|---|---|
| `metaimport libex-select` | The authoritative selector. Keeps only rows that genuinely complete a catalogued series at a free position, with mappable language and region and acceptable credits. Writes no records. |
| `metaimport libex` | The create path (over the selected subset) and, with `--enrich`, the fill-absent-facts path over every row - which is why rows the catalogue already holds are fetched too. |
| `metafmt --write` | Canonical rendering, entry relocation, due pack splits. Nothing here computes pack placement by hand. |
| `metacheck` | The gate. A cycle whose `metacheck` fails discards its whole tree. |

Every invocation passes `--profile core` explicitly: the data repository *is* a
core tree (works, people, series, `redirects.json`) while the tools default to
`all`, and the difference is a failed file accounting.

The pinned commit is the `META_REF` build argument in the service's Dockerfile.
It is reported by `metasync version`, by `GET /status` and in every pull request
footer, so "which importer produced this data" is always answerable.

The workspace's cross-repo contract carries this seam as its own section (the
series-completion bot and the library export, section 19 of `CROSS-REPO.md` at
the workspace root). Its rule: because the coupling is a CLI contract and a file
layout rather than a Go import, a change in audiosilo-meta to any of the
following must be followed by a pin bump and a check in the sync repository.

- The CLI flags of `metaimport libex-select`, `metaimport libex` (including
  `--enrich` and `--conflicts`), `metafmt` or `metacheck`.
- The libex NDJSON row shape the service emits, or the row projection and
  chapter-acceptance rules it hand-mirrors from `internal/importer`.
- The pack layout under `data/series` and `data/works`, which the service reads
  directly to build its catalogue index.
- The pull request labels `data`, `bot-intake` and `bot-sync`, or the
  `ai-verified` / `ai-flagged` labels the merge gate reads.
- The **job keys** of `check.yml` (`check`, `compose`, `site`) and
  `ai-verify.yml` (`verify`). Neither workflow sets a job `name:`, so GitHub
  names each check run after its key; rename a job and the gate waits forever for
  a run that will never appear.
- The wording of the importer's summary line, which the no-new-series invariant
  is read from. An unparseable summary is refused on purpose: a summary the
  service cannot read is one in which the invariant was never tested.

## Deploying

The deployment runbook - the PAT's exact scopes, the agent login, GHCR access,
the compose file, the first dry run, the sizing and the stop/pause procedures -
is `SETUP.md` in the private `audiosilo-meta-sync` repository. It is not
reproduced here: it carries host-specific and credential-handling steps that
belong with the service rather than in public documentation.

Worth knowing before a first run either way: the first cycle clones
audiosilo-meta at depth 1 (roughly 4GB) and reads its pack tree, and `metacheck`
over the real catalogue wants about 2GB of RAM. A bounded dry run
(`SYNC_DRY_RUN=1`, one region, a small `SYNC_MAX_WORKS_PER_PR`) does everything
except push and open a pull request, and leaves the diff in the clone to read.
