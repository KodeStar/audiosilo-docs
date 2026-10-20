---
title: The agent container
description: "Why the AI agents run in a separate container (decision 15), its image and hardening, and the staging protocol between it and the Bridge: runner.json, the job dir and its files, claim, heartbeat, cancel and done, the environment allow-list and the credentials, the harvest's limits, the credential hand-off from the Bridge's Accounts tab, and the failure modes."
---

The Bridge never runs an AI agent CLI itself. Every agent invocation of the
sidecars engine (the fact pass, the synthesis, the audit and the rest) runs in a
second container, the **agent container**, which sees only a shared staging
folder and its own config volume. This page is the protocol between the two. The
code is the Bridge repo's `internal/agentproto` (the file names, JSON shapes and
strict request validation both sides use), `internal/agentrun` (the runner in the
agent container: `audiosilo-bridge agent-runner`) and `internal/agentbox` (the
Bridge's side, an `agent.Runner` the engine calls like a local runner).

## Why a separate container

Decision 15 of the Bridge plan. An agent CLI reads whatever it is given and runs
tools, so it must never reach a library, the Bridge's data or its secrets. A
second user inside the Bridge's container is no boundary on a typical NAS share
(Unraid shares are commonly `0777`/`0666`, and a separate uid read and wrote the
library in the research spike), and the one-container sandbox (bubblewrap per
run) needs a custom seccomp profile users would have to install on the host. A
separate container holds on stock Docker seccomp:

- it mounts only **`/staging`** (shared with the Bridge) and **`/agent`** (its
  own config volume: the credentials and codex's login). Never a library,
  `/bridge-data` or the Bridge's secrets (the one exception since Phase 2b: an
  agent credential set on the Accounts tab, which each run receives, see
  [The credential hand-off](#the-credential-hand-off));
- it runs as a fixed uid (`10002:10002`), with `cap_drop: [ALL]`,
  `no-new-privileges`, a read-only root, a tmpfs `/tmp`, and **its own network**
  (the internet only: it can't reach the Bridge or the server);
- every job sees only what the Bridge staged for it, and every output is
  untrusted.

The container is a generic "here is the data, propose an answer" runner, so later
features can use it the same way (matching a book, say), always with the Bridge
checking the answer.

## The image

The Dockerfile's `agent` target (`ghcr.io/kodestar/audiosilo-bridge:<tag>-agent`,
`:latest-agent`, amd64 and arm64; see [the images](configuration.md#the-images)):
Debian bookworm-slim with `tini` and CA certificates, the **pinned native**
`claude` and `codex` binaries (fetched with `npm pack` and checked against the
registry's integrity, so no Node at runtime and no install script; the build runs
both `--version`), and the Bridge binary as the runner. `USER 10002:10002`,
`DISABLE_AUTOUPDATER=1`, `HOME=/tmp`, the setuid bits stripped, `/staging`
created `0777` (a new named volume copies it), `/agent` `0700`. Entrypoint:
`tini -- audiosilo-bridge agent-runner --staging /staging --home /agent`
(`--slots N`, 1 by default, at most 8, sets how many runs go at once). A CLI bump
is the `CLAUDE_VERSION` / `CODEX_VERSION` build arguments.

## The staging directory

One directory shared by exactly two containers: the Bridge sees it at
`agent.staging_dir` (default `<data>/staging`; the compose example mounts a
`staging` volume at `/staging` and sets `AUDIOSILO_BRIDGE_AGENT_STAGING_DIR`,
keeping it out of `/bridge-data`, whose first-start ownership fix would otherwise
reach it), the agent container at `/staging`. The two run as different uids
sharing no group, so the root is world-writable; the Bridge makes it so when it
creates it.

```
<staging>/
  runner.json              the runner's liveness (runner writes)
  <id>/                    one agent invocation; id = 16 random hex digits
    work/                  the staged copy of the engine's dir (inputs 0444, dirs 0755)
      out/                 the agent's only writable place (0777, files 0666)
    prompt.txt             0444
    credential/            0777, not sticky (Phase 2b, only for a hand-off)
      credential.json      0444: the Bridge's credential for this run; the runner deletes it
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
  "clis": {
    "claude": { "version": "2.1.300", "credential": "oauth_token", "credential_since": "2026-10-16T08:00:01Z" },
    "codex":  { "version": "0.162.1", "credential": "" }
  }
}
```

`credential` is the **kind** the runner found, never a value: `oauth_token`
(claude's `CLAUDE_CODE_OAUTH_TOKEN`) or `login` (codex's device login) are
subscriptions, `api_key` is billed, `""` is none. `credential_since` moves when
the credential is replaced (the runner compares an in-memory fingerprint), which
is how the Bridge knows a credential the provider refused may work again. The
runner looks for the CLIs at its start and every 10 minutes after (or at once when
a run finds its CLI missing).

`handoff` (Phase 2b, omitted by an older runner) says the runner takes the
Bridge's credential for a run: see [The credential hand-off](#the-credential-hand-off).

The Bridge counts the container **available** when `heartbeat_at` is under **30
seconds** old (`RunnerFreshFor`, two intervals), the protocol matches, and the CLI
it runs (`agent.backend`: claude unless `codex` is set) is there with a
credential the provider hasn't refused. Otherwise its status says why, in words
the Bridge's page, the heartbeat's `agent_ready` and an `agent_unavailable` park
all use: the staging dir isn't there, the runner hasn't written its status (the
two containers don't mount the same volume), another protocol, a stale heartbeat,
no such CLI, or no credential (naming how to give one, and that the other CLI is
signed in when it is). The engine's agent concurrency follows `slots`.

### One run

The Bridge (`agentbox.Runner.Run`) writes a job dir in order, every write through
an `os.Root` on the dir it just made, the dir kept `0700` until it is whole and
then made `0777` with the sticky bit (the agent can add its files but not delete
or replace the Bridge's):

1. `work/`: a copy of the engine's staged dir, inputs `0444`, dirs `0755`, and
   `work/out/` `0777` (with its files `0666`: a validation retry patches the
   previous attempt's files there);
2. only for a [hand-off](#the-credential-hand-off): `credential/credential.json`;
3. `prompt.txt` (`0444`);
4. `request.json.tmp`, renamed to `request.json`, the ready signal:

```json
{ "protocol": 1, "cli": "claude", "model": "", "effort": "", "web": false,
  "no_tools": false, "max_turns": 200, "timeout_seconds": 3600 }
```

The request is **typed**: the runner builds the CLI's argv itself (the same
flags as the engine's local claude and codex runners, `agent.ClaudeArgs` and
`agent.CodexArgs`), never argv from the Bridge. It reads `request.json` strictly
(at most 64 KiB, unknown fields and trailing data refused) and validates it:
`cli` `claude` or `codex`; `model` a model name (letters, digits and
`._:/@[]-`, never a leading dash); `effort` lower-case letters only (it goes into
codex's `-c model_reasoning_effort="..."`); `max_turns` 0 to 1000;
`timeout_seconds` 1 to 86,400. codex runs with its own sandbox **off**
(`--sandbox danger-full-access`): its `workspace-write` sandbox is no read
boundary and can't start under stock seccomp, and the container is the boundary.

The runner (`agentrun`), listing the staging dir every second:

1. **claims** a ready job (a `request.json`, no `claim`, no `done`; oldest first,
   while a slot is free) with `mkdir claim`, which is atomic;
2. checks the CLI is there, **takes and deletes** a handed-over
   `credential/credential.json` (a failed delete refuses the job, so the CLI can
   never find it on disk), checks the CLI then has a credential, its own or the
   handed one (else it finishes the job as *unavailable*, below, saying "set one
   on the Bridge's Accounts tab, or give one to the agent container"), and that
   `prompt.txt` is a regular file under 32 MiB;
3. **runs the CLI** in `work/`, the prompt on stdin, in its own process group,
   with the [allow-listed environment](#the-environment-and-the-credentials),
   writing `stdout.txt` (at most 64 MiB kept) and `stderr.txt` (8 MiB) as it
   goes, and **touching `heartbeat` every 5 seconds**;
4. on a **`cancel`** file (checked every second), the request's timeout, or the
   runner stopping: `SIGTERM` to the process group, `SIGKILL` 10 seconds later;
   whatever of the group is left when the CLI exits is killed too;
5. writes `exit.json`, makes `work/out/`'s entries readable for the Bridge
   (regular files `0644`, dirs `0777` so the Bridge can empty them; never
   following a link), copies codex's last message to `last_message.txt`, and
   renames `done.tmp` to **`done`**. A job dir with a `done` is never touched by
   the runner again.

```json
{ "exit_code": 0, "timed_out": false, "cancelled": false, "duration_ms": 412345 }
```

`exit.json` also carries `error` when the runner couldn't run the job (a bad
request, a missing prompt) or stopped it itself, and `unavailable: true` for the
cases the Bridge should treat as the agent being unavailable rather than a failed
run: no CLI, no credential, or the container stopping mid-run.

The Bridge, meanwhile, **polls** every second (not inotify: an Unraid `shfs`
mount may not deliver events):

- it reports the engine's own heartbeat while the runner's `heartbeat` is
  fresh, and gives up with an error when it goes stale for **60 seconds** (the
  runner died);
- it gives up when the job isn't claimed within `agent.claim_timeout_seconds`
  (default 120, 10 to 3600): a `NotAvailableError`, so the book parks
  `agent_unavailable` and looks again by itself;
- a cancel from the engine (the job was cancelled, the Bridge is stopping) writes
  `cancel` and waits up to 30 seconds for `done`;
- after `done` it reads `exit.json` and the outputs, parses `stdout.txt` with the
  **same** code the local runners use (`agent.ClaudeResult` /
  `agent.CodexResult`), harvests `work/out/`, and deletes the job dir.

Any trouble the Bridge has with the staging dir itself (it can't write the job, or
read back what the runner left) is the agent being unavailable, never a failed
stage. A credential the provider refuses is reported as a refusal: the book parks
`agent_credential_refused` (and looks again every 30 minutes); the Bridge's status
says the agent isn't ready until a run goes through or the runner reports a
different credential (for a [hand-off](#the-credential-hand-off), until the
Accounts tab's credential is replaced).

**Leftovers.** At its start the Bridge removes job dirs older than a day and
withdraws any other (one Bridge per staging dir, and nothing waits for them any
more): an unclaimed or finished one is removed (taking the claim first), one the
runner is running gets a `cancel`. The runner, at its start and with every
`runner.json` write, finishes a claimed job whose heartbeat has been silent for
30 seconds (an earlier runner's, left by a restart) as unavailable, so the Bridge
gets an answer before its own 60-second limit.

### The harvest

The Bridge copies `work/out/` back into the engine's staged `out/`, replacing it,
so the pipeline finds the outputs where a local run leaves them. Every read goes
through an `os.Root` over the job dir; **regular files only** (a link, a device or
a FIFO is skipped), at most **8 levels** deep, each file at most **8 MiB**, at most
**64 MiB and 2000 entries** in all. Any limit broken fails the whole harvest and
leaves the staged `out/` as it was. The pipeline's own `agent.Harvest` then checks
each declared output again as it moves it on. Reads of the runner's files on
either side go through `agentproto.ReadRegular` (inside an `os.Root`, a link in
the last place refused, `O_NONBLOCK` so a FIFO can't block the open, the opened
file the one the `Lstat` saw, size-capped).

## The environment and the credentials

A CLI's environment is built from an **allow-list**, never the runner's own
(codex writes the whole shell environment into `shell_snapshots/`, so whatever a
run can see may end up on disk):

- `PATH`, `LANG`, `TZ` from the runner;
- `TMPDIR` and `HOME` under a fresh per-run directory in `/tmp` (`0700`, removed
  afterwards), and `DISABLE_AUTOUPDATER=1`;
- for claude, `CLAUDE_CONFIG_DIR` in that per-run directory and **its** credential
  only: `CLAUDE_CODE_OAUTH_TOKEN`, else `ANTHROPIC_API_KEY`;
- for codex, `CODEX_HOME=/agent/codex` (codex keeps its login there and refuses
  one under `/tmp`) and, without a device login, `OPENAI_API_KEY` (or
  `CODEX_API_KEY`). `CODEX_HOME` is wiped of everything but `auth.json` and
  `config.toml` before the first and after the last concurrent codex run.

The runner process has umask `077`, so whatever a CLI or its helpers write is
private by default; what the Bridge must read is chmod'ed explicitly.

The runner reads each credential from its own environment, else from
`/agent/secrets/<lowercase name>` (for example
`/agent/secrets/claude_code_oauth_token`, `0600`). A subscription credential wins
over an API key for the same CLI, and a run gets exactly the kind `runner.json`
reports (or, for a [hand-off](#the-credential-hand-off), the handed kind, which the
status then reports in its place), so what the Bridge's page shows is what is
billed. Credentials never
appear in argv, a log, or any file the Bridge can read.

**Signing in** (`audiosilo-bridge agent-login`, run inside the container):

- `agent-login codex` runs `codex login --device-auth` with `CODEX_HOME` on the
  agent volume and the terminal attached: it prints a URL and a code to enter in a
  browser, and the login lands in `/agent/codex/auth.json`.
- `agent-login claude` prints how to give the container a token: run `claude
  setup-token` anywhere, then set `CLAUDE_CODE_OAUTH_TOKEN` (compose: from a
  `.env` file) or write the secrets file; or set `ANTHROPIC_API_KEY`.

Decision 7: the Bridge uses **its own** agent account or API key, never a shared
subscription, with the monthly budget on.

## The credential hand-off

Phase 2b (decision 19): the admin can set the agent's credential on the
Bridge page's **Accounts** tab instead of in the container. The Bridge seals it in
its vault (`claude_oauth_token`, `anthropic_api_key` or `openai_api_key`;
`internal/accounts`) and hands it to **each run, for that run only** (runs at
the same time each get their own copy). The container's own
credential always wins: its environment and secrets files stay the headless
override.

- **When.** `agentbox` hands the vault's credential for the backend's CLI
  (`accounts.Agent.Credential`: claude takes the subscription token, else the
  Anthropic API key; codex an OpenAI API key; a ChatGPT login stays a container
  sign-in) only when `runner.json` says `handoff: true` **and** reports no
  credential for that CLI. Its status then counts the agent available, billed as
  that kind, the credential's set time standing in for `credential_since` (so
  replacing it on the Accounts tab ends a refusal). A runner without `handoff`
  (an older agent image) gets nothing; when it has no credential of its own for
  the CLI and the Accounts tab holds one, the status says "the container is too
  old to take the one on the Accounts tab: update the agent image to this
  Bridge's version".
- **How.** Before `request.json`, the Bridge writes
  `credential/credential.json` (`0444`, synced) in a directory of its own
  (`0777`, **not** sticky, unlike the job dir, so the runner, another uid, can
  delete the Bridge's file):

  ```json
  { "cli": "claude", "kind": "oauth_token", "value": "..." }
  ```

- **The runner** reads it with `agentproto.DecodeCredential`, strictly: at most
  4 KiB, unknown fields and trailing data refused, `cli` the request's CLI, a
  `kind` that CLI takes (`oauth_token` or `api_key` for claude, `api_key` for
  codex), and a value of one printable line without spaces, at most 2048 bytes.
  The value never appears in an error. It deletes the file **before** anything
  else runs, then ignores it when the container has a credential of its own for
  the CLI. The handed value reaches the CLI's environment exactly as the
  container's own would (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`;
  `OPENAI_API_KEY` and `CODEX_API_KEY`).
- **Refusals.** A provider refusing the handed credential parks the book
  `agent_credential_refused` as before; the status says to replace it "on the
  Bridge's Accounts tab" (the container's own: "in the agent container (claude
  setup-token / agent-login codex), or remove it there and set one on the Bridge's
  Accounts tab"). A change on the Accounts
  tab re-admits the books parked `agent_credential_refused` and
  `agent_unavailable` at once, and wakes the description jobs parked on either.

`request.json` and the protocol version are unchanged: an older Bridge never
writes the file, and an older runner never sees one written for it.

Accepted for Phase 2b: the file sits `0444` in a world-writable directory between
the Bridge writing it and the runner deleting it (before the CLI starts). A later
change can share a group between the two uids and make it `0440`.

## Testing it locally

The runner needs Linux (`agent-runner` refuses to start elsewhere). On a Mac, run
the agent image beside a native or containerized Bridge, both mounting one host
folder as the staging dir (`AUDIOSILO_BRIDGE_AGENT_STAGING_DIR` on the Bridge),
writable by both uids. `docker build --target agent .` builds the image.
