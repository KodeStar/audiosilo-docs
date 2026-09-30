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
| Oversize - a data change larger than the merge review bound | Listed on the report for the maintainer: a batch import is approved tranche by tranche. |
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
   the source issue's text when the pull request came from intake.

The steward pushes only to `intake/issue-*` branches and its own `steward/*`
branches. A data pull request on anyone else's branch is fixed on a superseding
`steward/pr-N` pull request instead; the original stays open until the
superseding one has merged and its content is verified to be on `main`, and only
then is it closed with a link.

Attempts back off - immediately, then 1 hour, 4 hours, 12 hours, then daily -
and never end in a closure. An item that has failed three times is listed as
**stuck** on the report with its last evidence, which is the signal to find out
why and fix the cause.

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
  `metacheck --profile core`, a non-empty change, and a secret scan of the diff -
  and only then commits and pushes.

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
| `SYNC_STEWARD_MERGE_MAX_ENTRIES` | `100` | The largest data pull request the steward will merge. |
| `SYNC_STEWARD_REPORT_ISSUE` | - | Optional `owner/repo#n` whose body carries the report. |
| `SYNC_STEWARD_MIN_AVAILABLE_MB` | `3072` | An agent task starts only when at least this much memory is available (the host's, or the container limit's headroom). |
| `SYNC_STEWARD_DAILY_AGENT_RUNS` | `24` | The most agent runs the steward starts per UTC day (`0` = no cap). |

With `SYNC_STEWARD` off none of these are read, and nothing of the steward
exists: no goroutine, no clone, no state file, no `/status` section.

:::note The kill switch
Set `SYNC_STEWARD=off` (or revoke the token, or stop the container). The sync
bot keeps running exactly as before.
:::
