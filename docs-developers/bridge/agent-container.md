---
title: The agent container
description: "Why the AI agents run in a separate container, its image and hardening, and the staging protocol between it and the Bridge: runner.json, the job dir and its files, claim, heartbeat, cancel and done, the environment allow-list and the credentials, the harvest's limits, the credential hand-off from the Bridge's Accounts tab, and the failure modes."
---

The Bridge never runs an AI agent CLI itself. Every agent invocation of the
sidecars engine (the fact pass, the synthesis, the audit and the rest) runs in a
second container, the **agent container**. It sees only a shared staging folder and
its own config volume. This page is the protocol between the two. The code is in
the Bridge repo:

| Package | What |
|---|---|
| `internal/agentproto` | the file names, JSON shapes and strict request validation both sides use |
| `internal/agentrun` | the runner in the agent container: `audiosilo-bridge agent-runner` |
| `internal/agentbox` | the Bridge's side, an `agent.Runner` the engine calls like a local runner |

## Why a separate container

An agent CLI reads whatever it is given and runs tools, so it must never reach a
library, the Bridge's data or its secrets. The alternatives inside one container
don't hold:

- A second user inside the Bridge's container is no boundary on a typical NAS
  share. Unraid shares are commonly `0777`/`0666`, and a separate uid read and
  wrote the library in the research spike.
- The one-container sandbox (bubblewrap per run) needs a custom seccomp profile
  that users would have to install on the host.

A separate container holds on stock Docker seccomp:

- It mounts only **`/staging`** (shared with the Bridge) and **`/agent`** (its own
  config volume: the credentials and codex's login). It never mounts a library,
  `/bridge-data` or the Bridge's secrets. The one exception is an agent credential
  set on the Accounts tab, which each run receives (see
  [The credential hand-off](#the-credential-hand-off));
- it runs as a fixed uid (`10002:10002`), with the Bridge's `PGID` added
  (`group_add`, so a handed credential can be kept to that group), `cap_drop: [ALL]`,
  `no-new-privileges`, a read-only root, a tmpfs `/tmp`, and **its own network**
  (the internet only: it can't reach the Bridge or the server);
- every job sees only what the Bridge staged for it, and every output is
  untrusted.

The container is a generic "here is the data, propose an answer" runner, so later
features can use it the same way (matching a book, say), always with the Bridge
checking the answer.

## The image

The Dockerfile's `agent` target builds `ghcr.io/kodestar/audiosilo-bridge:<tag>-agent`
and `:latest-agent`, for amd64 and arm64 (see [the images](configuration.md#the-images)).
It holds:

- Debian bookworm-slim with `tini` and CA certificates;
- the **pinned native** `claude` and `codex` binaries. They are fetched with
  `npm pack` and checked against the registry's integrity, so there is no Node at
  runtime and no install script. The build runs both with `--version`;
- the Bridge binary as the runner.

It sets `USER 10002:10002`, `DISABLE_AUTOUPDATER=1` and `HOME=/tmp`, and strips the
setuid bits. `/staging` is created `0777`, which a new named volume copies, and
`/agent` `0700`.

The entrypoint is
`tini -- audiosilo-bridge agent-runner --staging /staging --home /agent`.
`--slots N` (1 by default, at most 8) sets how many runs go at once. A CLI bump is
the `CLAUDE_VERSION` / `CODEX_VERSION` build arguments.

## The staging directory

One directory is shared by exactly two containers.

- The Bridge sees it at `agent.staging_dir` (default `<data>/staging`). The
  compose example mounts a `staging` volume at `/staging` and sets
  `AUDIOSILO_BRIDGE_AGENT_STAGING_DIR`. That keeps it out of `/bridge-data`, whose
  first-start ownership fix would otherwise reach it.
- The agent container sees it at `/staging`.

The two run as different uids, so the root is world-writable (`0777`, not
sticky). The Bridge sets those modes when it creates the root. The agent container
joins the Bridge's group only to keep a handed credential to that group (see
[Keeping it to the Bridge's group](#keeping-it-to-the-bridges-group)).

```
<staging>/
  runner.json              the runner's liveness (runner writes)
  <id>/                    one agent invocation; id = 16 random hex digits
    work/                  the staged copy of the engine's dir (inputs 0444, dirs 0755)
      out/                 the agent's only writable place (0777, files 0666)
    prompt.txt             0444
    credential/            0770 in the Bridge's group, else 0777; not sticky (only for a hand-off)
      credential.json      0440 in that group, else 0444: the Bridge's credential for this run; the runner deletes it
    request.json           renamed from request.json.tmp: the ready signal
    claim/                 the runner's atomic claim (mkdir)
    heartbeat              touched every 5 s while the CLI runs
    cancel                 the Bridge's request to stop
    stdout.txt  stderr.txt  last_message.txt (codex)  exit.json
    done                   renamed from done.tmp: the runner is finished with it
```

### Runner liveness

The runner rewrites `<staging>/runner.json` every **15 seconds**
(`agentproto.RunnerInterval`; a temp file renamed into place, `0644`):

```json
{
  "protocol": 1,
  "version": "0.2.0",
  "heartbeat_at": "2026-10-16T09:12:44Z",
  "slots": 1,
  "handoff": true,
  "groups": [10002, 1000],
  "clis": {
    "claude": { "version": "2.1.300", "credential": "oauth_token", "credential_since": "2026-10-16T08:00:01Z" },
    "codex":  { "version": "0.162.1", "credential": "" }
  }
}
```

`credential` is the **kind** the runner found, never a value:

- `oauth_token` (claude's `CLAUDE_CODE_OAUTH_TOKEN`) and `login` (codex's device
  login) are subscriptions;
- `api_key` is billed;
- `""` is none.

`credential_since` moves when the credential is replaced; the runner compares an
in-memory fingerprint. That is how the Bridge knows a credential the provider
refused may work again. The runner looks for the CLIs at its start and every 10
minutes after, or at once when a run finds its CLI missing.

`handoff` (omitted by an older runner) says the runner takes the
Bridge's credential for a run. `groups` (omitted by an older runner) is the
runner's group ids, its own effective gid first, then its supplementary ones. See
[The credential hand-off](#the-credential-hand-off).

The Bridge counts the container **available** when all of these hold:

- `heartbeat_at` is under **30 seconds** old (`RunnerFreshFor`, two intervals);
- the protocol matches;
- the CLI the Bridge runs (`agent.backend`: claude unless `codex` is set) is there,
  with a credential the provider hasn't refused.

Otherwise its status says why. The Bridge's page, the heartbeat's `agent_ready` and
an `agent_unavailable` park all use the same words. The reasons are:

- the staging dir isn't there;
- the runner hasn't written its status, because the two containers don't mount the
  same volume;
- another protocol;
- a stale heartbeat;
- no such CLI;
- no credential. The status names how to give one, and says when the other CLI is
  signed in;
- with `agent.require_group` on, a handed credential that can't be kept to the
  Bridge's group (see [`agent.require_group`](#agentrequire_group)).

The engine's agent concurrency follows `slots`.

### One run

The Bridge (`agentbox.Runner.Run`) writes a job dir in this order. Every write goes
through an `os.Root` on the dir it just made. The dir is kept `0700` until it is
whole, then made `0777` with the sticky bit, so the agent can add its files but not
delete or replace the Bridge's.

1. `work/`: a copy of the engine's staged dir, inputs `0444` and dirs `0755`.
   `work/out/` is `0777`, with its files `0666`, since a validation retry patches
   the previous attempt's files there;
2. only for a [hand-off](#the-credential-hand-off): `credential/credential.json`;
3. `prompt.txt` (`0444`);
4. `request.json.tmp`, renamed to `request.json`, the ready signal:

```json
{ "protocol": 1, "cli": "claude", "model": "", "effort": "", "web": false,
  "no_tools": false, "max_turns": 200, "timeout_seconds": 3600 }
```

The request is **typed**. The runner builds the CLI's argv itself, never taking
argv from the Bridge. It uses the same flags as the engine's local claude and codex
runners (`agent.ClaudeArgs` and `agent.CodexArgs`).

The runner reads `request.json` strictly: at most 64 KiB, with unknown fields and
trailing data refused. It validates:

- `cli`: `claude` or `codex`;
- `model`: a model name of letters, digits and `._:/@[]-`, never with a leading
  dash;
- `effort`: lower-case letters only, since it goes into codex's
  `-c model_reasoning_effort="..."`;
- `max_turns`: 0 to 1000;
- `timeout_seconds`: 1 to 86,400.

codex runs with its own sandbox **off** (`--sandbox danger-full-access`). Its
`workspace-write` sandbox is no read boundary and can't start under stock seccomp,
and the container is the boundary.

The runner (`agentrun`), listing the staging dir every second:

1. **Claims** a ready job with `mkdir claim`, which is atomic. A ready job has a
   `request.json`, no `claim` and no `done`. It takes the oldest first, while a slot
   is free.
2. **Checks** the job:
   - the CLI is there;
   - it **takes and deletes** a handed-over `credential/credential.json`. A failed
     delete refuses the job, so the CLI can never find the file on disk;
   - the CLI then has a credential, its own or the handed one. Otherwise it
     finishes the job as *unavailable* (see `exit.json` below), saying "set one on
     the Bridge's Accounts tab, or give one to the agent container";
   - `prompt.txt` is a regular file under 32 MiB.
3. **Runs the CLI** in `work/`, with the prompt on stdin, in its own process group,
   with the [allow-listed environment](#the-environment-and-the-credentials). It
   writes `stdout.txt` (at most 64 MiB kept) and `stderr.txt` (8 MiB) as it goes,
   and **touches `heartbeat` every 5 seconds**.
4. **Stops the CLI** on a **`cancel`** file (checked every second), the request's
   timeout, or the runner stopping. It sends `SIGTERM` to the process group, then
   `SIGKILL` 10 seconds later. Whatever of the group is left when the CLI exits is
   killed too.
5. **Finishes.** It writes `exit.json`, and makes `work/out/`'s entries readable for
   the Bridge: regular files `0644`, and dirs `0777` so the Bridge can empty them,
   never following a link. It copies codex's last message to `last_message.txt`,
   and renames `done.tmp` to **`done`**. The runner never touches a job dir with a
   `done` again.

```json
{ "exit_code": 0, "timed_out": false, "cancelled": false, "duration_ms": 412345 }
```

`exit.json` also carries:

- `error`, when the runner couldn't run the job (a bad request, a missing prompt)
  or stopped it itself;
- `unavailable: true`, for the cases the Bridge should treat as the agent being
  unavailable rather than a failed run: no CLI, no credential, or the container
  stopping mid-run;
- `credential_denied: true`, when the runner's uid could not take a
  `credential.json` handed to the Bridge's group, so the job was refused before
  the CLI started (see [Fallbacks](#fallbacks)).

The Bridge, meanwhile, **polls** every second. It doesn't use inotify, since an
Unraid `shfs` mount may not deliver events.

- It reports the engine's own heartbeat while the runner's `heartbeat` is fresh. It
  gives up with an error when the heartbeat goes stale for **60 seconds**, since
  the runner died.
- It gives up when the job isn't claimed within `agent.claim_timeout_seconds`
  (default 120, 10 to 3600). That is a `NotAvailableError`, so the book parks
  `agent_unavailable` and looks again by itself;
- a cancel from the engine (the job was cancelled, the Bridge is stopping) writes
  `cancel` and waits up to 30 seconds for `done`;
- after `done` it reads `exit.json` and the outputs, parses `stdout.txt` with the
  **same** code the local runners use (`agent.ClaudeResult` /
  `agent.CodexResult`), harvests `work/out/`, and deletes the job dir.

Any trouble the Bridge has with the staging dir itself is the agent being
unavailable, never a failed stage. That covers failing to write the job, or to read
back what the runner left.

A credential the provider refuses is reported as a refusal. The book parks
`agent_credential_refused`, and looks again every 30 minutes, or at once when the
Accounts tab's credential changes. The Bridge's status says the agent isn't ready
until a run goes through or the runner reports a different credential. For a
[hand-off](#the-credential-hand-off), that lasts until the Accounts tab's
credential is replaced.

**Leftovers.** At its start the Bridge removes job dirs older than a day, and
withdraws any other, since there is one Bridge per staging dir and nothing waits
for them any more.

- An unclaimed or finished job dir is removed, taking the claim first.
- One the runner is running gets a `cancel`.

The runner, at its start and with every `runner.json` write, finishes as
unavailable a claimed job whose heartbeat has been silent for 30 seconds. That is
an earlier runner's job, left by a restart. So the Bridge gets an answer before its
own 60-second limit.

### The harvest

The Bridge copies `work/out/` back into the engine's staged `out/`, replacing it,
so the pipeline finds the outputs where a local run leaves them. Every read goes
through an `os.Root` over the job dir, with these limits:

- **regular files only**: a link, a device or a FIFO is skipped;
- at most **8 levels** deep;
- each file at most **8 MiB**;
- at most **64 MiB and 2000 entries** in all.

Any limit broken fails the whole harvest and leaves the staged `out/` as it was.
The pipeline's own `agent.Harvest` then checks each declared output again as it
moves it on.

Reads of the runner's files, on either side, go through `agentproto.ReadRegular`.
It reads inside an `os.Root`, refuses a link in the last place, opens with
`O_NONBLOCK` so a FIFO can't block the open, checks that the opened file is the one
the `Lstat` saw, and caps the size.

## The environment and the credentials

A CLI's environment is built from an **allow-list**, never from the runner's own.
codex writes the whole shell environment into `shell_snapshots/`, so whatever a run
can see may end up on disk. The allow-list is:

- `PATH`, `LANG`, `TZ` from the runner;
- `TMPDIR` and `HOME` under a fresh per-run directory in `/tmp` (`0700`, removed
  afterwards), and `DISABLE_AUTOUPDATER=1`;
- for claude, `CLAUDE_CONFIG_DIR` in that per-run directory and **its** credential
  only: `CLAUDE_CODE_OAUTH_TOKEN`, else `ANTHROPIC_API_KEY`;
- for codex, `CODEX_HOME=/agent/codex`, since codex keeps its login there and
  refuses one under `/tmp`. Without a device login, also `OPENAI_API_KEY` (or
  `CODEX_API_KEY`). `CODEX_HOME` is wiped of everything but `auth.json` and
  `config.toml` before the first and after the last concurrent codex run.

The runner process has umask `077`, so whatever a CLI or its helpers write is
private by default. What the Bridge must read is chmod'ed explicitly.

The runner reads each credential from its own environment, else from
`/agent/secrets/<lowercase name>` (for example
`/agent/secrets/claude_code_oauth_token`, `0600`).

- A subscription credential wins over an API key for the same CLI.
- A run gets exactly the kind `runner.json` reports. For a
  [hand-off](#the-credential-hand-off) it gets the handed kind, which the status
  then reports in its place. So what the Bridge's page shows is what is billed.
- Credentials never appear in argv, a log, or any file the Bridge can read.

**Signing in** (`audiosilo-bridge agent-login`, run inside the container):

- `agent-login codex` runs `codex login --device-auth` with `CODEX_HOME` on the
  agent volume and the terminal attached. It prints a URL and a code to enter in a
  browser, and the login lands in `/agent/codex/auth.json`.
- `agent-login claude` prints how to give the container a token. Run
  `claude setup-token` anywhere, then set `CLAUDE_CODE_OAUTH_TOKEN` (in compose,
  from a `.env` file) or write the secrets file. Or set `ANTHROPIC_API_KEY`.

The Bridge uses **its own** agent account or API key, never a shared subscription,
with the monthly budget on.

## The credential hand-off

The admin can set the agent's credential on the Bridge page's **Accounts** tab
instead of in the container. The Bridge seals it in its vault
(`claude_oauth_token`, `anthropic_api_key` or `openai_api_key`;
`internal/accounts`). It hands the credential to **each run, for that run only**,
and runs at the same time each get their own copy. The container's own credential
always wins: its environment and secrets files stay the headless override.

- **When.** `agentbox` hands the vault's credential for the backend's CLI only when
  `runner.json` says `handoff: true` **and** reports no credential for that CLI.
  `accounts.Agent.Credential` picks the credential:
  - claude takes the subscription token, else the Anthropic API key;
  - codex takes an OpenAI API key;
  - a ChatGPT login stays a container sign-in.

  The status then counts the agent available, billed as that kind. The
  credential's set time stands in for `credential_since`, so replacing it on the
  Accounts tab ends a refusal.

  A runner without `handoff` (an older agent image) gets nothing. When it has no
  credential of its own for the CLI and the Accounts tab holds one, the status says
  "the container is too old to take the one on the Accounts tab: update the agent
  image to this Bridge's version".
- **How.** Before `request.json`, the Bridge writes `credential/credential.json`
  (synced) in a directory of its own. That directory is **not** sticky, unlike the
  job dir, so the runner, another uid, can delete the Bridge's file. Who may read
  it is in [Keeping it to the Bridge's group](#keeping-it-to-the-bridges-group):

  ```json
  { "cli": "claude", "kind": "oauth_token", "value": "..." }
  ```

- **The runner** reads it strictly with `agentproto.DecodeCredential`:
  - at most 4 KiB, with unknown fields and trailing data refused;
  - `cli` is the request's CLI;
  - `kind` is one that CLI takes: `oauth_token` or `api_key` for claude, `api_key`
    for codex;
  - the value is one printable line without spaces, at most 2048 bytes. It never
    appears in an error.

  The runner deletes the file **before** anything else runs. It then ignores the
  credential when the container has one of its own for the CLI. The handed value
  reaches the CLI's environment exactly as the container's own would
  (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`; `OPENAI_API_KEY` and
  `CODEX_API_KEY`).
- **Refusals.** A provider refusing the handed credential parks the book
  `agent_credential_refused`, as for the container's own. The status says to
  replace it "on the Bridge's Accounts tab". For the container's own credential it
  says "in the agent container (claude setup-token / agent-login codex), or remove
  it there and set one on the Bridge's Accounts tab". A change on the Accounts tab
  at once resumes the books and description jobs parked `agent_credential_refused`
  and `agent_unavailable` ([Parks](generating.md#parks)).
- **The problem as a kind.** Beside its `Detail`, `agentbox.Status` carries
  `Problem`: `not_running`, `outdated`, `no_cli`, `other_backend`,
  `no_credential` or `group_required`, and empty when available or refused. For `other_backend` it also
  carries `Other`, the CLI that is signed in. A container too old to take the
  Accounts tab's credential is `outdated`, like another protocol. The Status tab's
  agent line keeps the full `Detail`. The setup checklist words the kind for a
  person instead, one hint per kind (see
  [The setup checklist](pairing-and-jobs.md#the-setup-checklist)).

`request.json` and the protocol version are unchanged. An older Bridge never
writes the file, and an older runner never sees one written for it.

### Keeping it to the Bridge's group

The compose example adds the Bridge's `PGID` to the agent container with
`group_add`. A YAML alias ties the two (`PGID: &bridge_pgid "1000"` on the
Bridge, `group_add: [*bridge_pgid]` on the agent), so they can't differ. The
runner then lists that gid in `runner.json`'s `groups` (`Status.ShareGroup`).

When it does, the Bridge writes the hand-off for its own effective gid alone:

- `credential/` is `0770` and `credential.json` `0440`, both chowned to the
  Bridge's group. The directory needs the group's read bit, because the runner
  opens it through an `os.Root`;
- any ACL inherited from the staging dir is removed, so no other uid on the
  staging volume can read the file while it waits for the runner.

The runner deletes it before the CLI starts.

### Fallbacks

In three cases the Bridge hands the credential to every uid instead, in the open
modes (`credential/` `0777`, the file `0444`). Each is logged once as a warning
that names the fix, and none fails a run:

- **The runner isn't in the group.** `runner.json` lists no `groups` holding the
  Bridge's gid: no `group_add`, or an agent image older than the Bridge. The
  warning says to add the group with `group_add` and the Bridge's `PGID`, on an
  agent image as new as the Bridge, and to recreate the container.
- **The volume refuses the chown or the ACL change**, as NFS and CIFS staging
  volumes can. That run is staged in the open modes. The warning says to use a
  staging volume that allows chown.
- **The runner is denied the group's file.** The two containers map ids on the
  volume differently, for example under rootless Podman's user namespaces. The
  runner refuses the job before the CLI starts and writes `credential_denied` in
  `exit.json`. The Bridge stages that job once more in the open modes, so nothing
  runs twice, and stays on the open modes until it restarts (`groupDenied`).

Only the log shows which modes are in use; the Bridge's page and the console
don't.

### Which files are trusted

The staging dir is open to every uid that reaches the volume, so any of them can
write a `runner.json` naming no group, or an `exit.json` saying
`credential_denied`. Either would move the credential off the group. So the
Bridge believes those two signals only from the runner's own uid, as the files'
owner shows it on the volume (`agentbox/trust.go`):

- **The runner's uid is pinned** by the first live `runner.json` the Bridge reads,
  and kept until the Bridge restarts. The Bridge's own uid is never pinned. An
  agent container moved to another user needs a Bridge restart to be believed.
- **A live `runner.json` from a second uid ends the pin.** Two uids claim to be the
  runner, so neither is believed, and no file moves the credential off the group
  until the Bridge restarts.
- **A file with more than one link doesn't count**, since it could be a link to
  another job's file.
- **A `credential_denied` needs the job's own dir to bear it out**: the runner's
  claim on that job, a `0700` directory of the runner's uid, and the credential
  still in place 2 seconds later. The runner opens the job dir first and makes its
  claim inside it, so a claim can't be moved onto a job it never ran. An agent
  image older than the Bridge makes no claim, so its `credential_denied` is never
  believed.

A file that fails these checks is logged once and treated as the job refused. Its
reason says to restart the Bridge if the agent container now runs as another
user. It never causes a fallback: a `runner.json` naming no group from another
uid still gets the group's modes.

The pin is trust on first use, and `trust.go` lists its limits. A `runner.json`
written before the runner's first one is pinned in its place until the real
runner's next write. A uid unmapped in the Bridge's user namespace shows as the
overflow uid, the same for every such uid. And the CLI runs as the runner's uid,
so a CLI told to by an injected prompt can write files that count as the
runner's.

### `agent.require_group`

`agent.require_group` (`AUDIOSILO_BRIDGE_AGENT_REQUIRE_GROUP`, off by default)
turns every fallback off. With it on, the Bridge never hands the credential to
every uid. Instead the agent is unavailable, with `Problem` `group_required` and
a `Detail` that names the fix:

- the runner isn't in the Bridge's group (add it with `group_add`);
- the staging volume refuses the chown or the ACL change. The job is never
  opened to the runner;
- the runner was denied the group's file (give both containers the same id
  mapping).

The last two are learned only from a run, so they are kept until the Bridge
restarts (`groupBlocked`). The Status tab's agent line shows the full reason, and the
heartbeat carries it to the server. The setup checklist's agent step words it for
a person (see [The setup checklist](pairing-and-jobs.md#the-setup-checklist)). A
book waiting for the agent parks `agent_unavailable` with the full reason.

Turn it on when other containers or users can reach the staging volume and a
credential readable by all of them for a few seconds is not acceptable. With it
on, a forged file can only make the agent unavailable until the Bridge restarts,
never hand the credential to every uid. Leave it off where the hand-off must keep
working on any volume.

## Testing it locally

The runner needs Linux, and `agent-runner` refuses to start elsewhere. On a Mac,
run the agent image beside a native or containerized Bridge. Both mount one host
folder as the staging dir (`AUDIOSILO_BRIDGE_AGENT_STAGING_DIR` on the Bridge),
writable by both uids. `docker build --target agent .` builds the image.
