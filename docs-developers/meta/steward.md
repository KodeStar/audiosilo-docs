---
title: The steward
description: "The maintainer's reviewer inside audiosilo-meta-sync. It merges ready data pull requests on audiosilo-meta through the series-completion bot's own gate, fixes flagged or red ones with a sandboxed agent, and researches the data issues intake could not finish."
---

## What it is

The steward is a second service inside the
[series-completion bot's](./sync-bot.md) container, switched on with
`SYNC_STEWARD=on`. The sync bot only ever merges its own pull requests. The
steward reviews **everyone else's** data pull requests and data issues on
[audiosilo-meta](./overview.md) on the maintainer's behalf. It merges what is
ready, fixes what is not, and answers the issues the intake bot could not
finish. Nothing in its scope waits for a person, and nothing it touches is
closed and forgotten.

The policy side is the "The steward" section of the repo's `GOVERNANCE.md`.
This page is the mechanism.

It runs beside the sync, never inside it. It has its own goroutine, its own clone
of audiosilo-meta (`/data/steward/repo`), its own state file
(`/data/steward/state.json`) and its own log (`/data/logs/steward/<date>.log`).
It never reads or writes the sync's state or clone, and never touches a pull
request labelled `bot-sync`. Merging beside the sync is exactly what a human
maintainer merging by hand always did. The intake sweep and the sync's
rebase-before-open already handle a `main` that moves under them.

### The sync has priority

A whole-catalogue tool run (an import, `metafmt`, `metacheck`) needs about 2GB,
and two at once is how a small host runs out of memory. So the sync, the steward
and the steward's agent share one heavy-tool lock, which allows at most one such
run at a time.

- The sync never stalls on the lock. It waits at most five minutes in total per
  cycle, then runs without the lock.
- Light work (counting a pull request's entries, merges, check re-runs) never
  waits.
- An agent task starts only when the lock is free and the host has enough memory
  available (`SYNC_STEWARD_MIN_AVAILABLE_MB`).
- At most `SYNC_STEWARD_DAILY_AGENT_RUNS` agent runs start per day.
- A subscription usage-limit error pauses agent work until the stated reset.

None of these waits spends an attempt.

## Pull requests

The steward classifies every open pull request on audiosilo-meta on each tick
(`SYNC_STEWARD_INTERVAL`, default 10 minutes):

| Class | What the steward does |
|---|---|
| The sync bot's own (`bot-sync`, `sync/` branch) | Nothing. |
| Draft | Nothing, and it never pushes to or deletes the branch. |
| Code: any file outside `data/`, or a symlink or submodule in the tree | Never merged, never pushed to. The steward posts one agent-written review per head, and a maintainer decides. |
| Fork, or a base other than `main` | Listed on the report. `ai-verify` cannot run on a fork, so it can never pass the gate. |
| Oversize: a data change larger than the merge review bound | Split into parts within the bound, each merged through the gate (see [Splitting an oversize pull request](#splitting-an-oversize-pull-request)). |
| Data | Merged through [the gate](#the-gate), or fixed. |

### The gate

A data pull request merges only on **exactly** the sync bot's gate. The same code
(`watcher.Assess`) evaluates it over a fresh read of the GitHub API every tick.
The gate requires:

- every required check (`check`, `compose`, `site`, `verify`) concluded well on
  the exact head;
- `ai-verified` applied by the `verify` run of that head;
- the branch not behind `main`;
- the head stable for two minutes.

The merge call is pinned to the judged SHA. Immediately before the merge, the
steward reads the changed-file list again for that head, so a non-data file
pushed at the last moment is still refused. When a pull request merges, the
steward closes its linked data issue with a comment.

A merge is a push to `main`, and on that push the intake sweep rebases every open
`bot-intake` branch. So in a tick that merged, a fix or rebase on such a pull
request waits for the next tick rather than working on a head about to move.

After that hold, nothing merges until one of these happens:

- the held task has started;
- its pull request merges or closes;
- 30 minutes pass.

Otherwise a steady stream of merges would hold a fix back behind every one of
them. The merge leaves the held branch behind `main`, so its fix can only run
once the sweep and a fresh verify have caught up.

Nothing merges while such a fix or rebase is running either, since its sweep
would move the branch under it. A ready pull request waits for that one task
instead.

### Fixing

Nothing is left red or flagged, and nothing is closed unmerged:

1. A failed required check is re-run once per head.
2. A failed `ai-verify` run (no verdict) is re-run with the sync's
   backoff.
3. A branch the intake sweep could not rebase is rebased mechanically, with the
   same pack merge driver the sweep uses. If the driver refuses, an agent
   re-applies the change onto `main`.
4. A flag, or a check still red after its re-run, goes to a **FIX** task. The
   agent amends the data with the flag or the failed job's log as evidence, plus
   the source issue's text when the pull request came from intake.

   Sometimes the pull request changed a value `main` already recorded, and the
   change makes it worse: less precise, implausible, or at odds with the record.
   The agent then checks the libex listing and the publisher's or retailer's
   page, and sets the value they support. That is often the recorded one.

### Splitting an oversize pull request

A data pull request larger than `SYNC_STEWARD_MERGE_MAX_ENTRIES` is not merged
whole and not left for a person. The steward carries it to `main` in **parts**.

**What a part holds.** Each part holds at most that many entries. Every entry
travels with the entries it references:

- a work with the people it credits that the pull request adds;
- a series with the works it places;
- a recording's ASIN wherever it moved.

Only real references join entries (the schema's author, narrator, work and
translation fields), never a shared genre or region.

**How a part is built.** The steward builds a part mechanically, never with an
agent. It writes the original's own values for those entries onto the
original's merge base, replays them onto `main` with the pack merge driver, then
runs `metafmt` and `metacheck`. A part that `main` will not take mechanically
opens from the original's merge base instead. It is then rebased or re-applied
like any pull request `main` moved out from under.

**How a part merges.** A part opens as `[steward] <title> (part K of #N)` and
goes through the gate like any other data pull request. If it is flagged, the
steward fixes it there. The fix's brief carries the original's own `ai-verify`
flags beside the part's, so findings already known about its entries are fixed
in the first round.

- At most two parts are open at a time, so each merge does not re-run
  `ai-verify` on a crowd of open parts.
- The original loses `bot-intake`, so the intake sweep stops rebasing it.
- A part closed without merging gives its entries back, and a new part carries
  them again.
- An entry the contributor changes on the original after its part was built is
  carried again too, so a correction is never lost.
- Once every part has landed and each merged part's content is verified on
  `main`, the steward closes the original with a link, and closes the issue it
  came from too.

**When the original merges or closes first.** If a person merges the original
whole, or closes it without merging, before its parts have landed, the parts have
nothing left to carry.

- On its next tick the steward closes every open part with a comment linking the
  original, and deletes the part's branch. It does this before anything else is
  judged, so no rebase, fix or agent run is spent on the part.
- This holds after a lost state too, because the steward reads a part's original
  from its `steward/pr-N-part-K` branch.
- Reopening a closed original carries its change again, in new parts.
- A part the steward had fixed is closed too, because the merge decided the
  original's values. But its comment says the fix is not on `main` and its branch
  is kept, so you can reopen it if the fix is still wanted. A part you reopen is
  never closed again.

**When a pull request cannot be split.** A pull request whose entries all
reference each other cannot be made smaller, so it goes through the gate whole.
So does one whose first part could not be written three times.

### Pull requests on other branches

The steward pushes only to `intake/issue-*` branches and its own `steward/*`
branches. It fixes a data pull request on anyone else's branch on a superseding
`steward/pr-N` pull request instead. The original stays open until the
superseding one has merged and its content is verified to be on `main`. Only
then does the steward close the original with a link.

- **A person closes the original without merging first.** The superseding pull
  request is **held**. The steward never fixes, rebases or merges it, and keeps
  its branch. It comments once per head that a maintainer merges it by hand if
  the original was closed in favour of it, or closes it. Its report line says
  held. Reopening the original returns it to normal handling.
- **A person merges the original first.** The superseding pull request is left
  open and handled as usual, since it may carry a fix `main` lacks.

### Attempts and backoff

Attempts back off (immediately, then 1 hour, 4 hours, 12 hours, then daily) and
never end in a closure.

- A fix whose next verdict states a **new** finding is progress. The backoff
  stays at its first hour. A verdict posted after the last attempt that states a
  new finding is fixed at once, rather than waiting that hour out.
- Only the same finding again climbs the backoff.
- A backoff holds only fix attempts, never a merge. A pull request whose head
  turns green merges whatever its backoff.
- An item that has failed three times is listed as **stuck** on the report with
  its last evidence. That is the signal to find out why and fix the cause.

## The community layer

With `SYNC_STEWARD_COMMUNITY_REPO` set, the steward also looks after
audiosilo-meta-community, the CC BY-SA layer (characters, recaps,
descriptions). It does so on the same terms and through that repository's own
gate: the `keys`, `structure` and `verify` checks, and `ai-verified` on the exact
head. Its items appear in the community section of `GET /status`, never in the
`SYNC_STEWARD_REPORT_ISSUE` body, which is the data repository's alone.

What differs:

- **A community fix is delete-only.** The agent has not read the book, so it may
  cut words, sentences or whole members the pull request added or changed. It
  never writes, rephrases or moves prose.
- **It triages no community issues.** A contributor's pull request answers them,
  never prose the steward writes.
- **A `keys` failure that is `main`'s gets no fix at all** (see
  [When `keys` fails because of `main`](#when-keys-fails-because-of-main)).

### When `keys` fails because of `main`

The `keys` check resolves **every** entry key in the tree against core's newest
data release, not only the keys the pull request touches. When a core release
[retires](./data-model.md#slug-is-identity-the-file-is-only-storage) a work slug
the layer is keyed by, `keys` fails on every open community pull request at
once, whatever it changes.

So once a failed `keys` check has had its one re-run, the steward reads the
job's log before planning any fix. The pull request is **blocked by main** when
the log is complete and every entry it names is one the pull request did not add,
remove or change. Then:

- No fix agent runs, no attempt is spent and no backoff grows. Fix attempts
  already spent on that `keys` failure are given back.
- The pull request gets a comment naming each key and what becomes of it. The
  steward posts at most one per head, and not again while nothing changed. Each
  key gets one of:
  - the re-key pull request that renames it;
  - "needs a person", for a collision;
  - "waits for the next data release", for an **unknown** key (a work newer than
    the release).

  While a retired key waits for the re-key's first build the steward says
  nothing, so that the comment can name the re-key pull request.
- Its line in `/status` reads `blocked by main`.

Anything less certain takes the ordinary fix path: a log the steward cannot
parse, or a failing entry the pull request did change. A new head is judged
afresh.

### The re-key pull request

The steward then re-keys `main` itself, mechanically, never with an agent:

1. It builds the branch `steward/rekey-retired` from `main`'s tip.
2. It renames each retired key the log names to the survivor the log gives. It
   changes the entry's key and every member's `work` field, nothing else.
3. It runs `metafmt --write` and `metacheck --profile community`.
4. It checks that the change adds exactly the survivors, removes exactly the
   retired keys and modifies nothing.
5. It opens `[steward] re-key retired work slugs`, labelled `data`, `bot-intake`
   and `bot-steward`. The body lists each old key, its survivor, the data release
   and any collision.

From there the pull request merges through the community gate like any other
data pull request, except that no fix agent ever touches it.

Once the re-key merges, the intake sweep rebases the blocked pull requests and
`keys` passes on their new heads. They merge on their first green head, whatever
their backoff, without a person. A pull request whose log also named an unknown
key or a collision stays blocked until that is settled.

- **A collision** is a survivor that already has a community entry on `main`, or
  that another rename in the same build already renames into. The steward leaves
  it for a person, since merging two entries is prose, and lists it in `/status`
  and in the blocked pull requests' comment. The other renames still go in.
- **Unknown keys** are never touched.
- **A chain** (a survivor that is itself retired) takes the one hop the log
  names. The next data release names the next hop.
- One pull request carries at most half the smaller of
  `SYNC_STEWARD_MAX_ENTRIES` and `SYNC_STEWARD_MERGE_MAX_ENTRIES` renames,
  because a rename is two entries. The rest go in the next pull request once
  that one has merged.
- When that smaller bound is under 2, the steward opens no re-key pull request.
  `/status` says why and names the variable, and the blocked pull requests'
  comment says a person re-keys `main`.
- **No fix of any kind touches a re-key pull request**, since the delete-only
  fix would delete prose already on `main`. The pull request waits for a person
  on any of these, with one comment per head and cause and a line in `/status`:
  an ai-verify flag, a required check still red after its one re-run, a failed
  commit status, or a conflict the steward cannot turn into a rebuild. A `keys`
  failure that is `main`'s waits on `main` as described in
  [When `keys` fails because of `main`](#when-keys-fails-because-of-main). A
  rebuild from `main` (next item) still proceeds.
- **It is idempotent.** The steward leaves alone an open re-key pull request
  that already carries the renames due, and rebuilds the branch from `main` for
  a different set. The pull request closes itself when `main` no longer holds
  any of its keys (a person's hand re-key landed first), or when only collisions
  are left, as long as it is still a plain data pull request.

## Issues

An issue is in scope only if it carries `data` or a `data:*` label. The steward
lists anything else (engineering issues) on the report and never comments on it.

- A data issue with an open pull request that references it waits for that pull
  request.
- One the intake workflow has not answered yet waits half an hour.
- The rest (`data:needs-human`, invalid, duplicate, or no pull request) go to a
  **TRIAGE** task. The agent reads the issue and every comment, researches it
  (web search and libex are allowed), and decides one of four things.

| Decision | What happens |
|---|---|
| `change` | The steward verifies the change (see [The agent and its boundary](#the-agent-and-its-boundary)), pushes it to `steward/issue-N` and opens it as `[steward] <title>` with `data`, `bot-intake` and `bot-steward` and `Closes #N`. From then on it is a data pull request like any other. |
| `already-present` | The steward checks the claim against the tree mechanically (the slugs or ASINs it names must exist), then closes the issue as completed with the evidence. |
| `declined` | A comment with the reason, the `steward:declined` label, closed as not planned. |
| `need-info` | One specific question and the `steward:needs-info` label. The issue is triaged again only when someone other than the steward replies. |

A steward-authored change may add, modify or remove at most
`SYNC_STEWARD_MAX_ENTRIES` (default 25) catalogue entries. An issue asking for
more is a batch import, not an issue fix.

## The agent and its boundary

Every agent task (FIX, TRIAGE, the mechanical-rebase fallback, REVIEW) runs the
Claude CLI with `SYNC_STEWARD_MODEL` (default `claude-opus-5-5`). Issue and pull
request text is **untrusted**, so the agent is contained rather than trusted:

- It runs as a separate unprivileged user (uid 10002). A small
  capability-holding helper switches to that user, and the helper's target uid
  is a compile-time constant. The service binary itself holds no capabilities.
- Its environment is an allow-list. The agent never holds the service's GitHub
  token. It cannot read the service's process environment, state file, logs or
  the sync's clone, and cannot write the steward clone's root or `.git`. Only the
  clone's `data/` and a scratch directory are shared with it.
- It is started with project and local Claude settings disabled, so a branch
  cannot plant hooks or instructions. A code review runs from a scratch
  directory holding only the diff.
- The service kills every process of that user before it runs `git` with its
  token again. The steward clone's git is hardened: no fsmonitor, no hooks, no
  system or global config.
- It cannot push. The service verifies what the agent left, and only then
  commits and pushes. It checks:
  - data-only changes against the merge base;
  - no symlinks or dotfiles;
  - the entry cap;
  - `metafmt --write` then `metacheck` under the repository's profile (`core` or
    `community`);
  - a non-empty change;
  - a secret scan of the diff.

The one thing the boundary cannot stop is the agent sending out **its own**
subscription token. The agent must hold that token to work, and a prompt-injected
run could exfiltrate it over the web. That is why the steward can run on its own
revocable token (`SYNC_STEWARD_OAUTH_TOKEN`).

If the boundary cannot be set up, the steward runs **no** agent task at all and
`/healthz` reports degraded. It still merges pull requests that are ready. The
boundary fails when the helper's capabilities are missing, or when the container
runs with `no-new-privileges`.

## Operating it

With the steward on, `GET /status` gains a `steward` section. It holds whether
the boundary is available, every tracked item with its class, state, last action,
attempts and next attempt, and the stuck list. If `SYNC_STEWARD_REPORT_ISSUE`
names an issue, the steward rewrites that issue's body with the same report
whenever it changes.

`POST /run` then needs `Authorization: Bearer <token>`, with the token in
`/data/admin-token`, because the agent shares the container's loopback.

| Variable | Default | What it does |
|---|---|---|
| `SYNC_STEWARD` | `off` | `on` runs the steward. Requires `SYNC_AGENT=claude`, a subscription token, and a PAT that also has Issues: read and write. |
| `SYNC_STEWARD_OAUTH_TOKEN` | - | The steward agent's own subscription token. Falls back to `CLAUDE_CODE_OAUTH_TOKEN`. |
| `SYNC_STEWARD_INTERVAL` | `10m` | The steward's tick. After a round that merged, the next four come three minutes apart, so the pull requests the sweep rebased merge as soon as they are ready again. |
| `SYNC_STEWARD_MODEL` | `claude-opus-5-5` | The model for every steward agent task. |
| `SYNC_STEWARD_MAX_TURNS` | `200` | Tool-loop budget for one agent task. |
| `SYNC_STEWARD_TIMEOUT` | `60m` | Wall-clock budget for one agent task. |
| `SYNC_STEWARD_MAX_ENTRIES` | `25` | The most entries one steward-authored change may touch. |
| `SYNC_STEWARD_MERGE_MAX_ENTRIES` | `100` | The largest data pull request the steward merges whole. A larger one is split into parts of at most this many entries. |
| `SYNC_STEWARD_COMMUNITY_REPO` | - | Optional `owner/name` of the community layer (`KodeStar/audiosilo-meta-community`) the steward also looks after, through that repository's own gate. The PAT needs the same permissions on it. |
| `SYNC_STEWARD_REPORT_ISSUE` | - | Optional `owner/repo#n` whose body carries the report. |
| `SYNC_STEWARD_MIN_AVAILABLE_MB` | `3072` | An agent task starts only when at least this much memory is available: the host's, or the container limit's headroom. |
| `SYNC_STEWARD_DAILY_AGENT_RUNS` | `24` | The most agent runs the steward starts per UTC day (`0` = no cap). |

With `SYNC_STEWARD` off none of these are read, and nothing of the steward
exists: no goroutine, no clone, no state file, no `/status` section.

:::note[The kill switch]
Set `SYNC_STEWARD=off` (or revoke the token, or stop the container). The sync
bot keeps running exactly as before.
:::
