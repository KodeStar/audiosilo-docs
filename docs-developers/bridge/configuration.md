---
title: Bridge configuration
description: "The Bridge's config.yaml and AUDIOSILO_BRIDGE_* variables, its data folder, the settings for characters and recaps (the agent container, the budgets, the transcript retention), contributing (the GitHub App's client ID, AUDIOSILO_BRIDGE_GITHUB_TOKEN read live), the sealed secrets and their key, PUID/PGID, the slim, full, cuda and agent images, and the compose example that runs it beside a server."
---

The Bridge's own settings. The server has none for it (see
[the server's configuration](../server/configuration.md#the-bridge-no-keys)); the
code is the Bridge's `internal/config` (`bridge.go` for the settings on this page,
`config.go` for the engine's).

## The data folder and `config.yaml`

Everything the Bridge keeps lives in its **data folder**: `/bridge-data` in the
images (`AUDIOSILO_BRIDGE_DATA`), else `--data`, else `~/.audiosilo-bridge`. It
holds `config.yaml` (written `0600` when a setting is saved from the page; until
then the defaults and the environment apply), its SQLite database `bridge.db`, the sealed
`secrets/` and their key `secret.key`, and the tools it downloads. **Never point it
at a library folder.**

Settings are read from `<data>/config.yaml`, then overridden by `AUDIOSILO_BRIDGE_*`
variables. An **empty** variable counts as unset. A setting the environment sets is
shown **locked** on the Bridge's page, since a value saved to the file would be
overridden again at the next start, and a save from the page never writes it: the
file keeps its own value for it. A variable that doesn't parse fails the start
rather than being ignored.

| Setting | Environment | Default | What it is |
|---|---|---|---|
| `listen` | `AUDIOSILO_BRIDGE_LISTEN` (or `--listen`) | `:8091` | the address its page listens on |
| `server.url` | `AUDIOSILO_BRIDGE_SERVER_URL` | | the server, as the Bridge reaches it (`http://audiosilo:8080` on a compose network): the address `AUDIOSILO_BRIDGE_PAIR_CODE` pairs with, and the one the page's pairing form starts with. An absolute `http(s)` URL without credentials, query or fragment. Once paired, the Bridge keeps the address it paired with, with the pairing |
| `public_url` | `AUDIOSILO_BRIDGE_PUBLIC_URL` | | its page as your local network reaches it (`http://192.168.1.10:8091`): sent in the heartbeat as `ui_url`, and the console's **Open its page** links to it. Without it the console shows no link |
| `libraries` | `AUDIOSILO_BRIDGE_LIBRARIES` (`<id>=<path>;<id>=<path>`; a path may hold a comma) | the server's own root path | where the Bridge sees each library, by the server's library id; absolute paths, each id once (see [Library mappings](mappings.md)) |
| `mapping.check_minutes` | `AUDIOSILO_BRIDGE_MAPPING_CHECK_MINUTES` | `10` | how often the mappings are checked, 1 to 1440 |
| | `AUDIOSILO_BRIDGE_PAIR_CODE` | | pair at the start with this code from the console, when not paired yet (needs `server.url`) |
| | `AUDIOSILO_BRIDGE_SECRET_KEY` | `<data>/secret.key` | the key that seals the stored secrets (below) |
| | `AUDIOSILO_BRIDGE_DATA` | `/bridge-data` in the images | the data folder |
| | `PUID` / `PGID` | `1000` / `1000` | the user and group the container runs the Bridge as (below) |

`AUDIOSILO_BRIDGE_PAIR_CODE` is for the **first** start: a code works once and only
for 15 minutes, and a paired Bridge ignores it. Remove it after pairing.

The engine's settings (`tools`, `asr`, `agent`, `supervisor`, `contribution`,
`metadata`, with `AUDIOSILO_BRIDGE_TOOLS_*`, `_ASR_*`, `_AGENT_*` and so on) came
over from audiosilo-sidecars and apply since Phase 1a, when the engine started
running behind `sidecars.generate`; they are read at the start (restart to apply),
except `asr.worker_fallback` and `agent.monthly_budget_usd`, which the page edits
and which apply live (below).
The full and cuda images set `AUDIOSILO_BRIDGE_ASR_BACKEND=whisper-cpp` and
`AUDIOSILO_BRIDGE_ASR_WHISPER_CLI_PATH=/opt/whisper/whisper-cli` for their bundled
speech recognition.

## Podcasts

These settings are read at startup; restart after editing the file or environment.
They apply to guarded feed, artwork and audio requests, independently of speech recognition
and the agent.

| Setting | Environment | Default | What it is |
|---|---|---|---|
| `podcasts.allow_networks` | `AUDIOSILO_BRIDGE_PODCASTS_ALLOW_NETWORKS` | `[]` | CIDR list explicitly allowed for feed, artwork and episode audio fetches; YAML array, comma-separated in the environment. Invalid CIDRs fail startup. Private, loopback and other non-public addresses are blocked unless allowed; grant only the ranges needed |
| `podcasts.max_feed_mb` | `AUDIOSILO_BRIDGE_PODCASTS_MAX_FEED_MB` | `32` | feed response cap in MiB after decompression, 1 to 64; separate from the 24 MiB saved-file cap and fixed 10 MiB artwork cap |
| `podcasts.max_episode_mb` | `AUDIOSILO_BRIDGE_PODCASTS_MAX_EPISODE_MB` | `1024` | whole episode cap in MiB, integer 1 to 4096; checked against GET length/resume total and received bytes, separately from feed/artwork limits. Does not use the feed's size estimate |

Audio staging is on the show filesystem, not an agent work volume. It should
support hard links; unsupported filesystems use a no-replace rename fallback.
Keep space for staged downloads and retained protected episodes. The server's
per-show retention policy is an API/database preference, not a Bridge config
key or disk quota; default Keep 3 with seven days' grace. See
[retention](podcasts.md#retention-policy-and-deletion-authority).

The server's toggle is `modules.podcasts.enabled`, environment
`AUDIOSILO_MODULES_PODCASTS_ENABLED`, default `false`. It is not a Bridge setting.
Neither is podcast directory search: it runs on the server, and the Podcast
Index key pair is a server environment variable
([server configuration](../server/configuration.md#podcast-discovery-podcastsdiscovery)).
The Bridge has no directory credential.
See [Podcasts](podcasts.md) for the HTTP guard, on-disk format and secrets.

On-demand fetching adds no configuration key: the reserved `interactive`
download slot is a fixed runner capacity, described in
[claims and leases](pairing-and-jobs.md#claims-and-leases).

## ASR workers

| Setting | Environment | Default | What it is |
|---|---|---|---|
| `asr.worker_fallback` | `AUDIOSILO_BRIDGE_ASR_WORKER_FALLBACK` | `local` | what a segment does when no [ASR worker](workers.md) is connected: `local` (the Bridge's own `asr.*` backend; a Bridge with none waits anyway) or `wait` (the book parks `asr_worker_waiting` until one connects). Unlike the rest of `asr.*` it applies live, to the next segment, and the page's **Settings** edits it (locked when the environment sets it) |
| `asr.threads` | `AUDIOSILO_BRIDGE_ASR_THREADS` | `0` | whisper.cpp's thread count for the Bridge's own (CPU) transcription; `0` keeps whisper.cpp's default of 4. On a 20-core Mac Studio in Docker, 16 threads ran 3x faster (1.4x real time against 0.4x to 0.5x); leave room for what else the machine runs. Read at the start |

The worker itself takes flags, not this file: `--bridge`, `--token` (else
`<data>/worker.token`, else `AUDIOSILO_WORKER_TOKEN`), `--data` (else
`AUDIOSILO_WORKER_DATA`, else `~/.audiosilo-bridge-worker`), `--backend`, `--model`
and `--whisper-cli`.

## Characters and recaps

The settings [`sidecars.generate`](generating.md) adds, or that matter most to it:

| Setting | Environment | Default | What it is |
|---|---|---|---|
| `agent.backend` | `AUDIOSILO_BRIDGE_AGENT_BACKEND` | `claude` (empty is claude) | the CLI the [agent container](agent-container.md) runs for this Bridge: `claude` or `codex` |
| `agent.staging_dir` | `AUDIOSILO_BRIDGE_AGENT_STAGING_DIR` | `<data>/staging` | the folder shared with the agent container (absolute). The compose example mounts a volume at `/staging`, outside `/bridge-data`, whose first-start ownership fix would otherwise reach it |
| `agent.claim_timeout_seconds` | `AUDIOSILO_BRIDGE_AGENT_CLAIM_TIMEOUT_SECONDS` | `120` | how long an agent job waits for the container to claim it before the book parks `agent_unavailable` (10 to 3600) |
| `agent.monthly_budget_usd` | `AUDIOSILO_BRIDGE_AGENT_MONTHLY_BUDGET_USD` | `100` | the monthly agent spend cap across every book, the calendar month in UTC (decision 7); `0` = no cap. Since Phase 2b the page's **Settings** tab edits it (locked when the environment sets it) and it applies **live**: the engine reads it per run (`pipeline.Config.MonthlyBudget` is a func), and a save that changes it resumes the books and description jobs parked `budget_exceeded` ([Parks](generating.md#parks); one still over the new cap parks again until the next month) |
| `agent.budget_reviewed_at` | | | when an admin last saved the monthly budget on the page (RFC 3339, `""` for never; written by the save, not meant to be set by hand). The setup checklist's `budget` item is done when it is set **or** the environment sets the budget (`Config.BudgetReviewed`) |
| `agent.book_budget_usd` | `AUDIOSILO_BRIDGE_AGENT_BOOK_BUDGET_USD` | `75` | one book's agent spend cap, read at the start (below) |
| `transcripts.retention_days` | `AUDIOSILO_BRIDGE_TRANSCRIPTS_RETENTION_DAYS` | `30` | days a finished book's transcripts are kept after its job ends (0 to 3650; `0` = deleted when it ends; decision 5) |
| `supervisor.automatic_actions` | `AUDIOSILO_BRIDGE_SUPERVISOR_AUTOMATIC_ACTIONS` | **on** | the supervisor's bounded recoveries (a retry, a readmit, a requeue, each capped per book per day). On by default since Phase 1a: the jobs are pressed in the console and left to run |

`supervisor.model_assisted`, `supervisor.model_automatic_actions` and the backend
failover are **forced off**, whatever the file or the environment says: they would
run an agent CLI inside the Bridge, which never does (decision 15). The Bridge's
page shows the agent, the speech recognition, the budgets with this month's
spend and the retention on its Status tab (`GET /api/engine`), and says where
each is set: the monthly budget on its Settings tab (or by its variable, read at
the next start), the per-book cap and the retention in `config.yaml`, read at the
next start. That start re-admits a job parked `budget_exceeded` unless the caps
would park it again with the same reason, figures included: a changed cap
(raised or lowered) re-admits it, and so does an unchanged one when the month's
spend grew after a monthly park; one still over a cap parks again before it
spends anything ([Parks](generating.md#parks)).

## Contributing: GitHub

Phase 2b's contributions (`contribute: issue`, `sidecars.contribute`,
`meta.correct`) file issues on the community repositories with a GitHub token.
`contrib.TokenSource.Resolve` picks one per use, in this order, and returns which
as `from` (`env`, `device` or `gh`: the page's `from`), passing over a token GitHub
refused (an environment or `gh` token until it changes, the sign-in until a new
one):

1. **`AUDIOSILO_BRIDGE_GITHUB_TOKEN`** (`env`): a token of the admin's own (a
   fine-grained one that can open issues on the community repos and create gists,
   since a body too long for an issue goes in a gist made with the same token).
   Read **live**
   from the environment at each use and never sealed. Before Phase 2b a start
   sealed it as `github_pat`; a start now deletes that copy once
   (`forgetSealedGitHubPAT`, best effort: a copy sealed with another key, or a
   failed delete, never stops the start).
2. **The Accounts tab's sign-in** (`device`): a user token of the AudioSilo
   Contributions GitHub App from its device flow, refreshed before it expires (see
   [Contributions](contributions.md#the-github-sign-in)).
3. **`gh auth token`** (`gh`): the `gh` CLI's sign-in, for a Bridge run outside a
   container. The token never enters argv, a log or an error.

`can_contribute` (the heartbeat's, see
[Pairing and jobs](pairing-and-jobs.md#the-heartbeat-and-the-capability)) is "a
token resolves and GitHub hasn't refused it".

| Setting | Environment | Default | What it is |
|---|---|---|---|
| | `AUDIOSILO_BRIDGE_GITHUB_TOKEN` | | a GitHub token that wins over the sign-in while GitHub accepts it (above). Never logged, never sealed |
| `github.client_id` | `AUDIOSILO_BRIDGE_GITHUB_CLIENT_ID` | the App's (`ghauth.DefaultClientID`, `Iv23likw0zS13hG4spdo`) | the GitHub App the Accounts tab signs in to: letters, digits, `.`, `_`, `-`, at most 64. Empty uses the built-in one at use, so a saved `config.yaml` never pins it. Only for a fork running its own App |
| `github.web_base_url` | `AUDIOSILO_BRIDGE_GITHUB_WEB_BASE_URL` | `https://github.com` | where the device-code and token endpoints live (an absolute `http(s)` URL), for a test against a fake GitHub |
| `contribution.api_base_url` | `AUDIOSILO_BRIDGE_CONTRIBUTION_API_BASE_URL` | `https://api.github.com` | the GitHub REST API root the issues, the user lookup and the revoke go to |

The App itself: id `5387686`, slug `audiosilo-contributions`, public (a private App
can be authorized by its owner only), device flow on, user tokens **expiring**;
permissions Issues read and write and Metadata read on the repositories it is
installed on (audiosilo-meta and audiosilo-meta-community), and Gists read and
write on the account (a characters or recaps file too long for an issue goes in a
secret gist); webhook inactive. Its
client ID ships in the Bridge (no client secret exists or is needed). Meta routes
on the App's id: see
[Contributing data](../meta/contributing-data.md#issues-filed-through-the-audiosilo-app).

The **agent container** has no config file of its own: its flags (`--staging`,
`--home`, `--slots`) and its credentials (`CLAUDE_CODE_OAUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY`, from its environment or
`/agent/secrets/<lowercase name>`) are in
[The agent container](agent-container.md#the-environment-and-the-credentials).
Since Phase 2b the Bridge can hold the agent's credential instead (the Accounts
tab) and hand it to the container per run:
[The credential hand-off](agent-container.md#the-credential-hand-off).

## Secrets

The Bridge's secrets are **never in `config.yaml`**: the token from the server,
the GitHub sign-in (`github_user_token`: the access token, the refresh token and
both expiries sealed as **one** value, so a refresh replaces the pair in one
write) and the agent credentials set on the Accounts tab (`claude_oauth_token`,
`anthropic_api_key`, `openai_api_key`). `github_pat` is only ever deleted now
(above). Each is an AES-256-GCM sealed file in `<data>/secrets/`
(`0600`), bound to its name so a file renamed onto another name doesn't open. One
master key seals them all:

- `AUDIOSILO_BRIDGE_SECRET_KEY`: 32 bytes, as 64 hex characters or as base64. Use it
  to keep the key **outside** the data volume, so a copy of the volume alone can't
  open the secrets.
- Otherwise `<data>/secret.key`, created (`0600`) on the first start.

If the key changes (a different variable, a replaced key file), the stored server
token can't be opened and the Bridge refuses to start, saying so; a GitHub sign-in
or an agent credential sealed with the old key reads as not set (sign in and set
it again). The page's API never returns a secret: `GET /api/accounts` says which
are set and when (for the agent, when its credentials last changed, `set_at`, and
when each was saved, `set_at_by_kind`, which the page shows). Generate a key with,
for example, `openssl rand -hex 32`. The startup log says where the key came from
(`environment`, `key file` or `new key file`), never the key.

The page's own password is not a secret in this sense: it is hashed (argon2id) in
the database, generated and **printed once** to the log on the first start, and
changed on the page's Settings tab. An owner who lost it runs
`audiosilo-bridge reset-password [--data DIR]` (from v0.3.0; in Docker
`docker exec -u PUID:PGID <container> audiosilo-bridge reset-password`): it
prints a new generated password once and signs every session out, changing
only the password hash and the sessions (`app.ResetPassword`), so the pairing,
the mappings, the jobs and the sealed secrets stay, and a running Bridge takes
it at once. It refuses a folder with no Bridge database (a mistyped `--data`)
and, as root, a data folder another user owns (SQLite's new files would be
root's), naming the user to run it as. The command goes before its flags:
`--data DIR reset-password` is refused rather than starting the Bridge.

## PUID and PGID

The images start as root only to own `/bridge-data` (the Bridge's own data, never a
library) and then drop to `PUID:PGID` (default `1000:1000`) to run the Bridge, which
never runs as root. The data folder is given to that user (and made `0700`: it holds
the page's password hash and sessions beside the sealed secrets) only when it isn't
theirs yet, on the first start or after a `PUID`/`PGID` change, so a large data
folder isn't walked on every start. Files the Bridge creates are `0644` and folders
`0755` (umask `022`), so the server can read them whatever user it runs as.

Set `PUID`/`PGID` to the **owner of your library folders**, the same as the server,
so the files the Bridge writes belong to the share's owner. On Unraid that is
`99`/`100`. Started with an explicit non-root user (`docker --user`, compose
`user:`) the image skips the ownership change and the drop, so that user must own
the data folder: the image's own `/bridge-data` belongs to `1000:1000` (`0700`), so
`--user 1000:1000` works with it as it is, and a bind-mounted folder must be the
user's. The entrypoint warns when it isn't writable.

## The images

`ghcr.io/kodestar/audiosilo-bridge`, public from v0.3.0 (pulled with no login;
the source repository stays private), built from one Dockerfile with four
targets:

| Tag | Target | What's in it | Arch |
|---|---|---|---|
| `latest` | `full` (the default) | the Bridge, ffmpeg, and a CPU build of whisper.cpp for speech recognition | amd64, arm64 |
| `latest-slim` | `slim` | the Bridge and ffmpeg only: for a Bridge that never transcribes (including podcast feed following and checks) | amd64, arm64 |
| `latest-cuda` | `cuda` | speech recognition on an NVIDIA GPU (run with `--gpus all`) on the `nvidia/cuda` runtime base | amd64 |
| `latest-agent` | `agent` | the [agent container](agent-container.md#the-image): the pinned native `claude` and `codex` CLIs and the Bridge binary as their runner (`audiosilo-bridge agent-runner`), on Debian bookworm-slim | amd64, arm64 |

The `latest` tags move **only for a release tag** (`v1.2.3`, not a pre-release
such as `v1.2.3-rc.1`), which also publishes `<tag>`, `<tag>-slim`, `<tag>-cuda`
and `<tag>-agent`. A manual dispatch from a branch publishes under the branch's
name (`<branch>`, `<branch>-slim`, `<branch>-cuda`, `<branch>-agent`), never over
`latest`. The whisper.cpp builds are downloaded at image build time,
pinned by release tag (the same one the Bridge's own downloader uses), each checked
against the sha256 that release's `checksums.txt` lists, and each image fetches only
the build it carries; the speech models are not baked
in (the Bridge downloads the one it needs into its data folder on first use).
**Only the `agent` image carries an AI agent's command-line tool**: the Bridge's
own images never do, and the Bridge never runs one (decision 15). Run the same
version of the Bridge and its agent image: they check each other's protocol
version.

## Running it beside a server

`compose.example.yaml` in the Bridge's repository runs the server, the Bridge and
its agent container together (its header comment left out):

```yaml
name: audiosilo

services:
  audiosilo:
    image: ghcr.io/kodestar/audiosilo-server:latest
    restart: unless-stopped
    environment:
      PUID: "1000"
      PGID: "1000"
    ports:
      - "8080:8080"
    volumes:
      - ./server-data:/data
      - /path/to/audiobooks:/audiobooks:ro

  bridge:
    # :latest is the full image (CPU transcription); :latest-slim has no
    # whisper.cpp, :latest-cuda transcribes on an NVIDIA GPU (amd64).
    image: ghcr.io/kodestar/audiosilo-bridge:latest
    restart: unless-stopped
    depends_on: [audiosilo]
    environment:
      PUID: "1000"
      PGID: "1000"
      # The server as the Bridge reaches it on this network.
      AUDIOSILO_BRIDGE_SERVER_URL: http://audiosilo:8080
      # The Bridge's page as your LAN reaches it (the console links to it).
      AUDIOSILO_BRIDGE_PUBLIC_URL: http://192.168.1.10:8091
      # First start only: a code from the server's console.
      # AUDIOSILO_BRIDGE_PAIR_CODE: XXXX-XXXX-XXXX-XXXX
      # Keep the secrets' key outside the data folder (32 bytes, hex or base64):
      # AUDIOSILO_BRIDGE_SECRET_KEY: ...
      # The folder shared with the agent container (below). Kept outside
      # /bridge-data, whose first-start ownership fix would otherwise reach it.
      AUDIOSILO_BRIDGE_AGENT_STAGING_DIR: /staging
      # The CLI the agent container runs: claude (the default) or codex.
      # AUDIOSILO_BRIDGE_AGENT_BACKEND: codex
      # A GitHub token (a fine-grained one that can open issues on the community
      # repos) lets a job contribute its characters and recaps (contribute: issue).
      # Read live and never stored; while set it is used instead of the Accounts
      # tab's GitHub sign-in.
      # AUDIOSILO_BRIDGE_GITHUB_TOKEN: ${AUDIOSILO_BRIDGE_GITHUB_TOKEN}
    ports:
      - "8091:8091"
    volumes:
      - ./bridge-data:/bridge-data
      - /path/to/audiobooks:/audiobooks:rw
      # Shared with the agent container, at the Bridge's agent.staging_dir.
      # The only volume both mount.
      - staging:/staging

  agent:
    image: ghcr.io/kodestar/audiosilo-bridge:latest-agent
    restart: unless-stopped
    user: "10002:10002"
    environment:
      # By name only: the value comes from your shell or .env and is never
      # written here. Set the one you use; the runner reports which it found.
      - CLAUDE_CODE_OAUTH_TOKEN
      # - ANTHROPIC_API_KEY
      # - OPENAI_API_KEY
    volumes:
      - staging:/staging
      - agent-config:/agent
    networks: [agent]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    read_only: true
    tmpfs: ["/tmp"]
    # A stop cancels the runs in progress: SIGTERM, then SIGKILL 10 s later.
    stop_grace_period: 20s

networks:
  # The agent's own network: internet access, and nothing else of this stack.
  agent: {}

volumes:
  staging: {}
  agent-config: {}
```

The points that matter:

- **The same host folders, mounted at the same path in both containers**: read-only
  for the server, read-write for the Bridge. Then the Bridge finds each library at
  the server's own root path and needs no mapping. Mounted elsewhere, map each
  library on the Bridge's page or with `AUDIOSILO_BRIDGE_LIBRARIES`.
- **`AUDIOSILO_BRIDGE_SERVER_URL`** is the server as the Bridge reaches it, which on
  a compose network is the service name, not the address you open in a browser.
- **The same `PUID`/`PGID` for both**, the owner of the library folders.
- **Port 8091** is the Bridge's own page. It answers only the local network (see
  [Development](development.md#the-page-and-its-api)), so don't put it behind a
  public reverse proxy.
- **The `staging` volume is the only one the Bridge and the agent share**, at the
  Bridge's `agent.staging_dir`. The agent mounts no library and no Bridge data, runs
  as `10002:10002` with every capability dropped, `no-new-privileges`, a read-only
  root and a tmpfs `/tmp`, on a network of its own (the internet only). Its
  credentials come in by name from the shell or a `.env` file, never written into
  the compose file; see [The agent container](agent-container.md).
- **`stop_grace_period: 20s`** gives the runner time to stop the runs in progress
  (`SIGTERM`, then `SIGKILL` 10 seconds later) and mark them done, so the Bridge
  hears about it at once.
