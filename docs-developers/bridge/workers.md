---
title: ASR workers
description: "The Bridge's native ASR workers (Phase 1b): why they exist, the worker protocol (routes, the version check, tasks as segments, leases and adoption, results), the dispatcher and the engine's ASR router with its fallback, per-segment resume, the service install, installing a worker from its Bridge (install.sh, the image's worker builds, the release archives), security, and the spike 4 measurements."
---

An **ASR worker** is `audiosilo-bridge worker`, the same binary as the Bridge run
natively on a computer with fast speech recognition (a Mac's Metal through
mlx-whisper, an NVIDIA GPU through whisper.cpp). It connects **out** to the Bridge,
long-polls for segments of audio, transcribes each one with the engine's own
`internal/asr` backends and uploads the raw transcript. It needs no library, no
mapping and no server token: the Bridge sends it the audio. The code is the Bridge
repo's `internal/workerproto` (the wire protocol, a leaf both sides import),
`internal/workers` (the Bridge's side: the dispatcher and the engine's ASR router)
and `internal/worker` (the worker: client, run loop, spool and service install).

## Why

Docker on macOS has no Metal, so a Bridge in Docker on a Mac (or on a NAS) only has
CPU whisper.cpp, which is slow (the measurements are below). Decision 11 of the
Bridge plan: ASR on the Mac runs in a native worker mode of the same binary. The
worker is ASR only; every other stage stays on the Bridge.

## The protocol

All routes live under `/worker/v1` on the **Bridge's page server** (the same
listener as the page, `:8091`, behind the same local-network guard). Every call
carries the worker's token (`Authorization: Bearer asw_...`) and the protocol
version (`X-AudioSilo-Worker-Protocol: 1`). A wrong token is `401`; another version
is `409 {"code": "protocol_mismatch", "protocol": 1}`, on every route, and the
worker also refuses a Bridge whose hello answers another version. Bump the version
only for a change an installed worker can't follow (it refuses every installed
worker until it updates); added fields are not such a change (both sides ignore
what they don't know, and the worker routes accept unknown JSON fields).

| Route | What it does |
|---|---|
| `POST /worker/v1/hello` | `{protocol, version, platform, backend, device, model}` -> `{protocol, bridge_version, worker_id, name}`. Said at every start, and again after a refusal |
| `GET /worker/v1/tasks/next?wait=` | long-poll claim, at most 25 s: a task, or `204` |
| `GET /worker/v1/tasks/{id}/audio?attempt=` | the segment's FLAC (`audio/flac`, range requests answered); `409 not_held` unless this worker holds it at that attempt |
| `POST /worker/v1/tasks/{id}/heartbeat` | `{attempt}` -> `{attempt}`: renews the lease, answering the attempt the worker holds it under now (see adoption); `409 not_held` means stop; `404 unknown_task` means the Bridge doesn't know it (it may be restarting) |
| `POST /worker/v1/tasks/{id}/result?attempt=&backend=&device=&model=&decode_seconds=` | the raw transcript as the body (at most 64 MiB), byte for byte as the backend wrote it. It may hold `NaN`, which isn't JSON, so it never rides in a JSON envelope. `204`; `422 invalid_result` when it isn't a complete transcript; `409`/`404` as above |
| `POST /worker/v1/tasks/{id}/fail` | `{attempt, error}`: the segment fails on the Bridge, as a local decode error would (the book fails; Retry on the Bridge's page tries again) |

The audio download and the result upload get longer deadlines than the page's own
(an hour and 10 minutes), for a slow link.

### Tasks are segments

The unit of work is a **segment**, not a chapter: a 16 kHz mono FLAC, its start
and duration in the book, the decode options (`language`, `no_context`,
`initial_prompt`) and an opaque `id`, with the FLAC's `size` and `sha256` (the
worker checks both). A chapter is one kind of segment; Phase 1d's duration windows
for chapterless books are another, through the same worker with no version bump.
The transcript's times stay relative to the segment.

The id is a hash of the audio's sha256 and the decode options, so the same segment
is the same task across a restart of the Bridge (its ASR stage asks for the same
segment again, under the same id).

### Leases, adoption and results

A claim leases the task for 60 s; the worker beats every 15 s. A lease that runs out
puts the task back in the queue (the next claim is the next attempt).

- **Adoption.** A heartbeat for a task that is in the queue, unclaimed, gives it
  back to the worker beating it, under a new attempt. That covers a worker whose
  lease ran out while it kept decoding, and a Bridge that restarted and asked for
  the same segment again: the worker still decoding it carries on.
- **A result is taken whoever holds the task now**, since the id names the same
  audio and options: a worker that finished after its lease went to another still
  counts, and the other one's next heartbeat hears `not_held`.
- A finished or cancelled task's id is remembered for 10 minutes, so a late
  heartbeat hears `not_held` (stop) rather than `unknown_task` (carry on).

## The Bridge's side

`internal/workers.Hub` is the queue (in memory: the engine's work dir is the truth,
a segment is done once its raw transcript is there), the leases, and the registry
of workers it has heard from. A worker counts as **connected** for 45 s after its
last call (an idle one polls every 25 s, a busy one beats every 15 s). Workers and
their tokens are rows of the Bridge's `workers` table (migration `0004`): the token
is `asw_` plus 64 hex characters, made on the page, shown once, and kept only as its
sha256; deleting the row revokes it (and requeues the segment it held). The row also
counts the segments each worker finished, their audio and decode seconds.

### The ASR router and its fallback

The engine's ASR backend is `workers.Router`, an `asr.Backend`: the pipeline is
unchanged, and every decode (the first pass and the repair re-transcriptions) goes
through it. For each segment:

- **A worker is connected:** the segment goes to the queue, and the router waits for
  its transcript, then writes it where a local decode would have
  (`<OutDir>/<stem>.json`, temp file then rename).
- **No worker is connected** (none ever was, or the one decoding it went away and
  its lease ran out): `asr.worker_fallback` decides, read for every segment so a
  change on the page applies to the next one.
  - `local` (the default): the Bridge's own backend (whisper.cpp on the CPU in the
    `full` image, CUDA in `cuda`, mlx-whisper when the Bridge runs natively on a
    Mac). A local decode **yields** to a worker that connects while it runs: it is
    stopped and the segment starts again on the worker.
  - `wait`, or no usable local backend at all (the `slim` image): the book parks
    `asr_worker_waiting` (a server job `needs_attention` with the park's hint; a
    transient park, so the server sends no notification for it).

One loop on the Bridge re-admits the waiting books whenever a segment can run
(`Router.CanRun`: a worker is connected, or the fallback is `local` with a usable
backend). It looks every 30 s, at once when a worker connects, after a settings
save and at each start. `Router.Detect` reports what a segment would run on now:
the local backend's capability, or `{backend: "worker", device: "remote"}` (with a
detail while it waits); it is always available, so the engine never swaps the router
for a local backend. One ASR lane still runs one segment at a time, so a second
worker is a standby, not a second lane.

## The worker

`audiosilo-bridge worker --bridge <url> --token <t> [--data DIR] [--backend
auto|mlx-whisper|whisper-cpp] [--model M] [--whisper-cli PATH]`. The data dir
(default `~/.audiosilo-bridge-worker`) holds the backend's tools (the mlx venv, the
whisper.cpp binary and model) and the **spool**:

- `current.json` and `<id>.flac`: the segment in hand. A worker that restarts beats
  it first; while the Bridge still gives it the task it decodes it again at once,
  instead of waiting a minute for the lease to run out.
- `results/<id>.json` with `<id>.meta.json`: every transcript not yet taken. They
  are offered first at each start and after each segment; one the Bridge doesn't
  know is kept for 30 minutes (it may be restarting), one it refuses is dropped.

A refused token or another protocol version is logged and tried again every 5 or
10 minutes: the worker never exits for them, so its service manager doesn't loop.
A Bridge that can't be reached is retried with a backoff up to a minute. With
mlx-whisper the worker checks for `ffmpeg` at start (mlx-whisper decodes through
it).

### The service

`worker install --bridge <url> --token <t>` writes the token to
`<data>/worker.token` (`0600`; never into the service file) and installs:

- **macOS:** a launch agent, `~/Library/LaunchAgents/app.audiosilo.bridge-worker.plist`
  (the user's session, where Metal is), loaded with `launchctl bootstrap
  gui/<uid>`. `KeepAlive` restarts it; launchd also ends what is left of its process
  group when the worker dies, so a killed worker never leaves a decoder holding the
  GPU (a decoder outlives a `kill -9` of a worker started by hand). `ProcessType
  Interactive` keeps launchd from throttling it. Its `PATH` is the one `install`
  ran with (launchd's own lacks Homebrew, where python3 and ffmpeg live). The log
  is `<data>/worker.log`.
- **Linux:** a systemd user unit, `~/.config/systemd/user/audiosilo-bridge-worker.service`,
  `Restart=always`, enabled with `systemctl --user enable --now` (stopping it ends
  its cgroup, a decode included). Run `loginctl enable-linger` to keep it running
  logged out.

`worker install --print` shows the file without installing it; `worker uninstall`
stops it and removes the file (the data dir stays). Windows has no install. On
macOS, `launchctl bootout` returns before the old job is gone and a bootstrap
meanwhile fails, so `install` waits (up to 10 s) for launchd to drop the previous
agent and retries a failed bootstrap a few times. The service has one fixed label (unit), so a computer
runs one worker, for one Bridge: installing another Bridge's worker replaces it.

## Installing a worker

The Bridge serves the worker program itself, so a first-time user pastes one
command from the Workers tab and finds or builds nothing. The code is the Bridge
repo's `internal/workerdist` (the builds folder, the platform set, install.sh) and
`internal/api/workerdist.go` (the two routes).

- **The builds.** The `slim`, `full` and `cuda` images (not `agent`) carry
  `audiosilo-bridge` for `darwin/arm64`, `darwin/amd64`, `linux/amd64` and
  `linux/arm64`, gzipped, in `/usr/local/share/audiosilo-bridge/workers`
  (`audiosilo-bridge_<os>_<arch>.gz`, about 8 MB each). A Dockerfile stage
  cross-builds them with CGO off and the image's own `VERSION`, so a worker
  installed from its Bridge is always the Bridge's version and speaks its
  protocol. They are never embedded in the Go binary, so a Bridge run natively has
  none: `GET /api/status` then says `worker_downloads: false`, and the Workers tab
  points at the GitHub releases and opens its manual commands.
- **`GET /worker/install.sh`** answers a POSIX `sh` script with the Bridge's
  address baked in, single-quoted (`workerdist.Address`):
  - The request's scheme and `Host` are checked first: a plain host name, IPv4 or
    bracketed IPv6, with an optional port. Anything else is `ErrAddress` and never
    reaches the next step.
  - The address is the configured `public_url` (trailing slashes trimmed) when it
    is a plain http(s) URL (no user, query or fragment) whose host and port match
    the `Host`. The match ignores case and reads a missing port as `public_url`'s
    scheme default (80 or 443). Its scheme and path prefix are kept, so behind a
    reverse proxy that serves the Bridge under a prefix or over TLS the script and
    its download URLs match the Workers tab's command. `public_url` is admin-set,
    and the `Host` shows the fetching computer reached that host.
  - Otherwise it is the request's own scheme and `Host`: the computer that fetched
    the script reached that address, so its worker can too.

  It always answers `200` with a script: when it can't serve install.sh (no
  builds, an unusable `Host`, or a caller the local-network guard refuses), the
  script prints the reason to stderr and exits 1, because `curl -fsSL` drops an
  error status's body and `sh` would run an empty script and exit 0. The guard's
  refusal as a script is for this route only (`GET` or `HEAD`); every other route
  keeps the guard's `403` JSON.
- **`GET /worker/download/{os}/{arch}`** serves one gzipped build. The OS and
  architecture pick from the fixed set (the file name never comes from the
  request); another platform, or a Bridge without the builds, is `404` with a
  plain-text reason. The download gets a 10-minute write deadline (the page's
  own is 60 s; the segment audio's hour is too long for a route with no
  credential).

The Workers tab's command is
`curl -fsSL http://<bridge>/worker/install.sh | sh -s -- --token asw_...`. The
script takes `--token` (required unless the worker's data dir already holds a
saved token, or `$AUDIOSILO_WORKER_TOKEN` is set: re-running it without one is
how a worker updates), `--run` (exec the worker in the foreground instead of
installing the service; it saves no token, and when `--token` was passed the
script says a later re-run needs it again), `--dir <path>` (where the program
goes) and `-h`. Without `--dir` it reuses the installed service's folder: the
folder of the program in the launch agent's `ProgramArguments` (macOS) or the
first word of the systemd user unit's `ExecStart` (Linux), as `worker install`
writes them, when that is an existing, writable absolute folder with no character
the file would have had to escape. It prints the folder it reused, and otherwise
falls back to `~/.audiosilo-bridge-worker/bin`. An explicit `--dir` always wins.
Its body is one `main` called on the last line, so a download cut short runs
nothing. It maps `uname -s`/`uname -m` to
the platform (an Apple Silicon Mac under Rosetta takes the native `arm64` build,
the one with Metal), downloads to a temp file beside the target, checks that the
program runs (`version`), moves it into place, prints a `PATH` hint when its
folder isn't on `PATH`, then runs `worker install --bridge <addr> [--token ...]`.
A file `curl` writes carries no quarantine attribute, so Gatekeeper doesn't stop
the unsigned binary on macOS; a browser download does carry one (the user guide's
[Installing it by hand](/users/getting-started/running-a-worker#installing-it-by-hand)
says how to clear it). The script holds no
secret: the token comes from the user's command line.

**By hand.** `.github/workflows/release.yml` attaches the same four platforms to a
`v*` tag's GitHub release as `audiosilo-bridge_<version>_<os>_<arch>.tar.gz` (the
version without its `v`; each holds the binary, `LICENSE` and `README.md`) plus
`checksums.txt`. These are built with `-tags embedui`, so the same binary also
runs a whole Bridge natively. The release is created (published, a pre-release
for a hyphenated tag) when the tag has none yet, and a re-run replaces the assets.

## Security

- The worker routes take **only** a worker token, and the page's routes never take
  one (both are tested, allowed and denied). A worker token can claim segments and
  read their audio, nothing else: no library, no job, no setting.
- The page's local-network guard covers the worker routes: a worker must be on the
  LAN. A carrier-grade NAT address (Tailscale's) is refused, like the page.
- The two install routes, `/worker/install.sh` and `/worker/download/...`, sit
  outside `/worker/v1` (which takes only worker tokens) behind the same
  local-network guard (install.sh answers its refusal as a script, above), but ask
  for **no** password or token: a `curl | sh` carries
  no session, the program is public, and the worker token in the user's command is
  the credential. Neither reads a path from the request. Both are tested allowed
  (a LAN address) and denied (a public address, an unknown platform, no builds).
- A worker's free text (its name, versions, an error) is cleaned and capped; a
  transcript must parse as a complete one before it is written into the engine's
  work dir.

## Spike 4: the measurements

Measured on 2026-10-16 on a Mac Studio (M1 Ultra, 20 cores, 64 GB), with the queue
in a Docker container on the same Mac and the worker native, on an 11 h 8 min book
(49 chapters) split by the engine's own `audio.Split`. The machine was shared with
other work (load average 13 to 26), so the times are conservative.

| What | Result |
|---|---|
| The split FLACs | 1.2 GB for 11.1 h, about 108 MB per audio hour |
| Transfer, Docker to the native worker | median 132 MB/s per segment (24 to 206); the whole book's audio moved in about 9 s |
| Transcripts back | 12.9 MB in all (about 500 KB for a 25-minute chapter) |
| Metal (mlx-whisper, large-v3-turbo) | 36 min of decoding for the 11.1 h, **18.5x real time**; 37 min 26 s end to end, the kill included |
| CPU whisper.cpp in the `full` container (large-v3-turbo) | at the default 4 threads, 0.5x real time on an 86 s chapter and 0.37x on a 13.5 min one (the other work on the Mac included): about a day for the 11.1 h book. At 16 threads (`asr.threads`), 1.4x on an 11 min chapter: about 8 h. Metal is 13 to 50 times faster |
| A short segment | 5 to 7 s of fixed cost (the model loads per segment): an 86 s chapter took 7 s, a 34 s one 4 s |
| A kill mid-book | `kill -9` of the worker 54 s into a 25-minute chapter: the chapter's partial decode was lost, nothing else; the restarted worker took the next chapter at once and the killed one came back as attempt 2 |
| On the real stack (the Bridge in Docker, the worker under launchd) | `kill -9` of the worker mid-chapter: launchd restarted it in the same second and ended the old decoder with the job; the new worker carried on with the segment in hand. Stopping the service: the lease ran out 60 s after the last beat, and the Bridge went on with its own CPU (`local`) or parked the book `asr_worker_waiting` (`wait`); starting it again moved the Bridge's local decode to the worker within 20 ms, and a waiting book went on 2 ms after the worker connected |
