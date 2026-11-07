---
title: The steward
description: "The maintainer's reviewer inside audiosilo-meta-sync: it merges ready data pull requests on audiosilo-meta through the series-completion bot's own gate, fixes flagged or red ones with a sandboxed agent, and researches the data issues intake could not finish."
---

## What it is

The steward is a second service inside the
[series-completion bot's](./sync-bot.md) container, switched on with
`SYNC_STEWARD=on`. Where the sync bot only ever merges its own pull requests,
the steward reviews **everyone else's** data pull requests and data issues on
[audiosilo-meta](./overview.md) on the maintainer's behalf: it merges what is
ready, fixes what is not, and answers the issues the intake bot could not
finish. Nothing in its scope waits for a person, and nothing it touches is
closed and forgotten.

The policy side is the "The steward" section of the repo's `GOVERNANCE.md`.
This page is the mechanism.

It runs beside the sync, never inside it: its own goroutine, its own clone of
audiosilo-meta (`/data/steward/repo`), its own state file
(`/data/steward/state.json`) and its own log (`/data/logs/steward/<date>.log`).
It never reads or writes the sync's state or clone, and never touches a pull
request labelled `bot-sync`. Merging beside the sync is exactly what a human
maintainer merging by hand always did; the intake sweep and the sync's
rebase-before-open already handle a `main` that moves under them.

**The sync has priority.** A whole-catalogue tool run (an import, `metafmt`,
`metacheck`) needs about 2GB, and two at once is how a small host runs out of
memory, so the sync, the steward and the steward's agent share one heavy-tool
lock: at most one such run at a time. The sync never stalls on it - it waits at
most five minutes in total per cycle, then runs without the lock. Light work
(counting a pull request's entries, merges, check re-runs) never waits. An agent
task starts only when the lock is free and the host has enough memory available
(`SYNC_STEWARD_MIN_AVAILABLE_MB`), and at most `SYNC_STEWARD_DAILY_AGENT_RUNS`
agent runs start per day; a subscription usage-limit error pauses agent work
until the stated reset. None of these waits spends an attempt.

## Pull requests

Every open pull request on audiosilo-meta is classified each tick
(`SYNC_STEWARD_INTERVAL`, default 10 minutes):

| Class | What the steward does |
|---|---|
| The sync bot's own (`bot-sync`, `sync/` branch) | Nothing. |
| Draft | Nothing (but its branch is never pushed to or deleted). |
| Code - any file outside `data/`, or a symlink or submodule in the tree | Never merged, never pushed to. One agent-written review is posted per head, and a maintainer decides. |
| Fork, or a base other than `main` | Listed on the report. `ai-verify` cannot run on a fork, so it can never pass the gate. |
| Oversize - a data change larger than the merge review bound | Split into parts within the bound (see below), each merged through the gate; the original is closed once every part has landed (and the parts are closed if the original is merged or closed first). |
| Data | Merged through the gate below, or fixed. |

### The gate

A data pull request merges only on **exactly** the sync bot's gate, evaluated by
the same code (`watcher.Assess`) over a fresh read of the GitHub API every tick:
every required check (`check`, `compose`, `site`, `verify`) concluded well on the
exact head, `ai-verified` applied by the `verify` run of that head, the branch
not behind `main`, the head stable for two minutes, and the merge call pinned to
the judged SHA. The changed-file list is read again for that head immediately
before the merge, so a non-data file pushed at the last moment is still refused.
A merged pull request's linked data issue is closed with a comment.

A merge is a push to `main`, on which the intake sweep rebases every open
`bot-intake` branch, so in a tick that merged, a fix or rebase on such a pull
request waits for the next tick rather than working on a head about to move.
After that hold nothing merges until the held task has started (or its pull
request merges or closes, or 30 minutes pass), rather than a steady stream of
merges holding a fix back behind every one of them: the merge leaves the held
branch behind `main`, so its fix can only run once the sweep and a fresh verify
have caught up. And nothing
merges while such a fix or rebase is running, since its sweep would move the
branch under it: a ready pull request waits for that one task instead.

### Fixing

Nothing is left red or flagged, and nothing is closed unmerged:

1. A failed required check is re-run once per head.
2. A failed `ai-verify` run (no verdict) is re-run with the sync's
   backoff.
3. A branch the intake sweep could not rebase is rebased mechanically with the
   same pack merge driver the sweep uses; if the driver refuses, an agent
   re-applies the change onto `main`.
4. A flag, or a check still red after its re-run, goes to a **FIX** task: the
   agent amends the data with the flag or the failed job's log as evidence, and
   the source issue's text when the pull request came from intake. Where the
   pull request changed a value `main` already recorded and the change makes it
   worse - less precise, implausible, at odds with the record - the agent
   checks the libex listing and the publisher's or retailer's page and sets
   the value they support, which is often the recorded one.

### Splitting an oversize pull request

A data pull request larger than `SYNC_STEWARD_MERGE_MAX_ENTRIES` is not merged
whole and not left for a person. The steward carries it to `main` in **parts**:

- Each part holds at most that many entries, and every entry travels with the
  entries it references - a work with the people it credits that the pull
  request adds, a series with the works it places, a recording's ASIN wherever
  it moved. Only real references join entries (the schema's author, narrator,
  work and translation fields), never a shared genre or region.
- A part is built mechanically, never by an agent: the original's own values
  for those entries, written onto its merge base and replayed onto `main` with
  the pack merge driver, then `metafmt` and `metacheck`. It opens as
  `[steward] <title> (part K of #N)` and goes through the gate like any other
  data pull request - fixed there if it is flagged, with the original's own
  `ai-verify` flags in the fix's brief beside the part's, so findings already
  known about its entries are fixed in the first round. A part `main` will not take
  mechanically opens from the original's merge base instead, and is rebased or
  re-applied like any pull request `main` moved out from under.
- At most two parts are open at a time, so each merge does not re-run
  `ai-verify` on a crowd of open parts. The original loses `bot-intake`, so the
  intake sweep stops rebasing it.
- A part closed without merging gives its entries back: they are carried
  again in a new part. An entry the contributor changes on the original after
  its part was built is carried again too, so a correction is never lost.
- Once every part has landed and each merged part's content is verified on
  `main`, the original is closed with a link, and so is the issue it came from.
- If a person merges the original whole, or closes it without merging, before
  its parts have landed, the parts have nothing left to carry. On its next tick
  the steward closes every open part with a comment linking the original, and
  deletes its branch - before anything else is judged, so no rebase, fix or
  agent run is spent on it. This holds after a lost state too: a part's
  original is read from its `steward/pr-N-part-K` branch. Reopening a closed
  original carries its change again, in new parts. A part the steward had
  fixed is closed too (the merge decided the original's values), but its
  comment says the fix is not on `main` and its branch is kept, so you can
  reopen it if the fix is still wanted; a part you reopen is never closed again.

A pull request whose entries all reference each other cannot be made smaller:
it goes through the gate whole. So does one whose first part could not be
written three times.

The steward pushes only to `intake/issue-*` branches and its own `steward/*`
branches. A data pull request on anyone else's branch is fixed on a superseding
`steward/pr-N` pull request instead; the original stays open until the
superseding one has merged and its content is verified to be on `main`, and only
then is it closed with a link. If a person closes the original without merging
first, the superseding pull request is **held**: the steward never fixes,
rebases or merges it, keeps its branch, and comments once (per head) that a
maintainer merges it by hand if the original was closed in favour of it, or
closes it. Its report line says held, and reopening the original returns it to
normal handling. If a person merges the original first, the superseding one is
left open and handled as usual, since it may carry a fix `main` lacks.

Attempts back off - immediately, then 1 hour, 4 hours, 12 hours, then daily -
and never end in a closure. A fix whose next verdict states a **new** finding
is progress: the backoff stays at its first hour, and a verdict posted after the
last attempt that states a new finding is fixed at once rather than waiting that
hour out. Only the same finding again climbs the backoff. A backoff holds only
fix attempts, never a merge: a pull request whose head turns green merges
whatever its backoff. An item that has failed three times is listed as
**stuck** on the report with its last evidence, which is the signal to find out
why and fix the cause.

## The community layer

With `SYNC_STEWARD_COMMUNITY_REPO` set, the steward also looks after
audiosilo-meta-community, the CC BY-SA layer (characters, recaps,
descriptions), on the same terms and through that repository's own gate: the
`keys`, `structure` and `verify` checks and `ai-verified` on the exact head. Its
items appear in the community section of `GET /status`, never in the
`SYNC_STEWARD_REPORT_ISSUE` body, which is the data repository's alone. What
differs: a community fix is **delete-only**: the agent has not read the
book, so it may cut words, sentences or whole members the pull request added or
changed, and never writes, rephrases or moves prose. It triages no
community issues: a contributor's pull request answers them, never prose the
steward writes. And a `keys` failure that is `main`'s gets no fix at all
(below).

### When `keys` fails because of `main`

The `keys` check resolves **every** entry key in the tree, not only those the
pull request touches, against core's newest data release. When a core release
[retires](./data-model.md#slug-is-identity-the-file-is-only-storage) a work slug
the layer is keyed by, `keys` fails on every open community pull request at
once, whatever it changes.

So once a failed `keys` check has had its one re-run, the steward reads the
job's log before planning any fix. When the log is complete and every entry it
names is one the pull request did not add, remove or change, the pull request is
**blocked by main**:

- No fix agent runs, no attempt is spent and no backoff grows. Fix attempts
  already spent on that `keys` failure are given back.
- The pull request gets a comment (at most one per head, and not again while
  nothing changed) naming each key and what becomes of it: the re-key pull
  request that renames it, "needs a person" for a collision, or "waits for the
  next data release" for an **unknown** key (a work newer than the release).
  While a retired key waits for the re-key's first build nothing is said, so
  the comment can name the re-key pull request.
- Its line in `/status` reads `blocked by main`.

Anything less certain - a log the steward cannot parse, or a failing entry the
pull request did change - takes the ordinary fix path. A new head is judged
afresh.

### The re-key pull request

The steward then re-keys `main` itself, mechanically, never with an agent. It
builds the branch `steward/rekey-retired` from `main`'s tip and renames each
retired key the log names to the survivor the log gives: the entry's key and
every member's `work` field, nothing else. It runs `metafmt --write` and
`metacheck --profile community`, checks that the change adds exactly the
survivors, removes exactly the retired keys and modifies nothing, and opens
`[steward] re-key retired work slugs`, labelled `data`, `bot-intake` and
`bot-steward`, its body listing each old key, its survivor, the data release
and any collision. From there it merges through the community gate like any
other data pull request, except that no fix agent ever touches it (below).

Once the re-key merges, the intake sweep rebases the blocked pull requests,
`keys` passes on their new heads, and they merge on their first green head,
whatever their backoff, without a person. A pull request whose log also named
an unknown key or a collision stays blocked until that is settled.

- **A collision** - a survivor that already has a community entry on `main`,
  or that another rename in the same build already renames into - is left for
  a person, since merging two entries is prose: it is listed in `/status` and
  in the blocked pull requests' comment. The other renames still go in.
- **Unknown keys** are never touched.
- **A chain** (a survivor that is itself retired) takes the one hop the log
  names; the next data release names the next hop.
- At most half the smaller of `SYNC_STEWARD_MAX_ENTRIES` and
  `SYNC_STEWARD_MERGE_MAX_ENTRIES` renames go in one pull request (a rename is
  two entries), the rest in the next once it has merged.
- When that smaller bound is under 2, no re-key pull request is opened:
  `/status` says why and names the variable, and the blocked pull requests'
  comment says a person re-keys `main`.
- **No fix of any kind touches a re-key pull request**, since the delete-only
  fix would delete prose already on `main`. An ai-verify flag, a required check
  still red after its one re-run, a failed commit status, or a conflict the
  steward cannot turn into a rebuild makes it wait for a person, with one
  comment per head and cause and a line in `/status`. A `keys` failure that is
  `main`'s waits on `main` as above, and a rebuild from `main` (below) still
  proceeds.
- It is idempotent: an open re-key pull request already carrying the renames
  due is left alone, and a different set rebuilds the branch from `main`. When
  `main` no longer holds any of its keys (a person's hand re-key landed first),
  or only collisions are left, it closes itself, as long as it is still a plain
  data pull request.

## Issues

An issue is in scope only if it carries `data` or a `data:*` label; anything
else (engineering issues) is listed on the report and never commented on.

A data issue with an open pull request that references it waits for that pull
request. One the intake workflow has not answered yet waits half an hour. The
rest - `data:needs-human`, invalid, duplicate, or no pull request - go to a
**TRIAGE** task: the agent reads the issue and every comment, researches it
(web search and libex are allowed), and decides one of four things.

| Decision | What happens |
|---|---|
| `change` | The change is verified (below), pushed to `steward/issue-N` and opened as `[steward] <title>` with `data`, `bot-intake` and `bot-steward` and `Closes #N`. From then on it is a data pull request like any other. |
| `already-present` | The claim is checked against the tree mechanically (the slugs or ASINs it names must exist), then the issue is closed as completed with the evidence. |
| `declined` | A comment with the reason, the `steward:declined` label, closed as not planned. |
| `need-info` | One specific question and the `steward:needs-info` label. It is triaged again only when someone other than the steward replies. |

A steward-authored change may add, modify or remove at most
`SYNC_STEWARD_MAX_ENTRIES` (default 25) catalogue entries: an issue asking for
more is a batch import, not an issue fix.

## The agent and its boundary

Every agent task (FIX, TRIAGE, the mechanical-rebase fallback, REVIEW) runs the
Claude CLI with `SYNC_STEWARD_MODEL` (default `claude-opus-5-5`). Issue and pull
request text is **untrusted**, so the agent is contained rather than trusted:

- It runs as a separate unprivileged user (uid 10002), switched to by a small
  capability-holding helper whose target uid is a compile-time constant. The
  service binary itself holds no capabilities.
- Its environment is an allow-list: it never holds the service's GitHub token,
  cannot read the service's process environment, state file, logs or the sync's
  clone, and cannot write the steward clone's root or `.git`. Only the clone's
  `data/` and a scratch directory are shared with it.
- It is started with project and local Claude settings disabled, so a branch
  cannot plant hooks or instructions; a code review runs from a scratch
  directory holding only the diff.
- Every process of that user is killed before the service runs `git` with its
  token again, and the steward clone's git is hardened (no fsmonitor, no hooks,
  no system or global config).
- It cannot push. The service verifies what it left - data-only against the
  merge base, no symlinks or dotfiles, the entry cap, `metafmt --write` then
  `metacheck` under the repository's profile (`core` or `community`), a
  non-empty change, and a secret scan of the diff - and only then commits and
  pushes.

The one thing the boundary cannot stop is the agent sending out **its own**
subscription token, which it must hold to work and which a prompt-injected run
could exfiltrate over the web. That is why the steward can run on its own
revocable token (`SYNC_STEWARD_OAUTH_TOKEN`). If the boundary cannot be set up
(the helper's capabilities are missing, or the container runs with
`no-new-privileges`), the steward runs **no** agent task at all and
`/healthz` reports degraded; it still merges pull requests that are ready.

## Operating it

With the steward on, `GET /status` gains a `steward` section: whether the
boundary is available, every tracked item with its class, state, last action,
attempts and next attempt, and the stuck list. If `SYNC_STEWARD_REPORT_ISSUE`
names an issue, the steward rewrites that issue's body with the same report
whenever it changes. `POST /run` then needs `Authorization: Bearer <token>`, the
token being in `/data/admin-token`, because the agent shares the container's
loopback.

| Variable | Default | What it does |
|---|---|---|
| `SYNC_STEWARD` | `off` | `on` runs the steward. Requires `SYNC_AGENT=claude`, a subscription token, and a PAT that also has Issues: read and write. |
| `SYNC_STEWARD_OAUTH_TOKEN` | - | The steward agent's own subscription token. Falls back to `CLAUDE_CODE_OAUTH_TOKEN`. |
| `SYNC_STEWARD_INTERVAL` | `10m` | The steward's tick. After a round that merged, the next four come three minutes apart, so the pull requests the sweep rebased merge as soon as they are ready again. |
| `SYNC_STEWARD_MODEL` | `claude-opus-5-5` | The model for every steward agent task. |
| `SYNC_STEWARD_MAX_TURNS` | `200` | Tool-loop budget for one agent task. |
| `SYNC_STEWARD_TIMEOUT` | `60m` | Wall-clock budget for one agent task. |
| `SYNC_STEWARD_MAX_ENTRIES` | `25` | The most entries one steward-authored change may touch. |
| `SYNC_STEWARD_MERGE_MAX_ENTRIES` | `100` | The largest data pull request the steward merges whole; a larger one is split into parts of at most this many entries. |
| `SYNC_STEWARD_COMMUNITY_REPO` | - | Optional `owner/name` of the community layer (`KodeStar/audiosilo-meta-community`) the steward also looks after, through that repository's own gate. The PAT needs the same permissions on it. |
| `SYNC_STEWARD_REPORT_ISSUE` | - | Optional `owner/repo#n` whose body carries the report. |
| `SYNC_STEWARD_MIN_AVAILABLE_MB` | `3072` | An agent task starts only when at least this much memory is available (the host's, or the container limit's headroom). |
| `SYNC_STEWARD_DAILY_AGENT_RUNS` | `24` | The most agent runs the steward starts per UTC day (`0` = no cap). |

With `SYNC_STEWARD` off none of these are read, and nothing of the steward
exists: no goroutine, no clone, no state file, no `/status` section.

:::note[The kill switch]
Set `SYNC_STEWARD=off` (or revoke the token, or stop the container). The sync
bot keeps running exactly as before.
:::
