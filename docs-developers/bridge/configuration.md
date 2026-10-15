---
title: Bridge configuration
description: "The Bridge's config.yaml and AUDIOSILO_BRIDGE_* variables, its data folder, the sealed secrets and their key, PUID/PGID, the slim, full and cuda images, and the compose example that runs it beside a server."
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
over from audiosilo-sidecars. Phase 0 reads and validates them but runs nothing that
uses them; they take effect with Phase 1a. The full and cuda images set
`AUDIOSILO_BRIDGE_ASR_BACKEND=whisper-cpp` and
`AUDIOSILO_BRIDGE_ASR_WHISPER_CLI_PATH=/opt/whisper/whisper-cli` for their bundled
speech recognition.

## Secrets

The Bridge's token from the server (and, later, API keys and a GitHub token) are
**never in `config.yaml`**. Each is an AES-256-GCM sealed file in `<data>/secrets/`
(`0600`), bound to its name so a file renamed onto another name doesn't open. One
master key seals them all:

- `AUDIOSILO_BRIDGE_SECRET_KEY`: 32 bytes, as 64 hex characters or as base64. Use it
  to keep the key **outside** the data volume, so a copy of the volume alone can't
  open the secrets.
- Otherwise `<data>/secret.key`, created (`0600`) on the first start.

If the key changes (a different variable, a replaced key file), the stored token
can't be opened and the Bridge refuses to start, saying so. Generate a key with,
for example, `openssl rand -hex 32`. The startup log says where the key came from
(`environment`, `key file` or `new key file`), never the key.

The page's own password is not a secret in this sense: it is hashed (argon2id) in
the database, generated and **printed once** to the log on the first start, and
changed on the page's Settings tab.

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

`ghcr.io/kodestar/audiosilo-bridge` (private while the repository is), built from
one Dockerfile with three targets:

| Tag | Target | What's in it | Arch |
|---|---|---|---|
| `latest` | `full` (the default) | the Bridge, ffmpeg, and a CPU build of whisper.cpp for speech recognition | amd64, arm64 |
| `latest-slim` | `slim` | the Bridge and ffmpeg only: for a Bridge that never transcribes (today's jobs, and podcasts later) | amd64, arm64 |
| `latest-cuda` | `cuda` | speech recognition on an NVIDIA GPU (run with `--gpus all`) on the `nvidia/cuda` runtime base | amd64 |

The `latest` tags move **only for a release tag** (`v1.2.3`, not a pre-release
such as `v1.2.3-rc.1`), which also publishes `<tag>`, `<tag>-slim` and `<tag>-cuda`.
A manual dispatch from a branch publishes under the branch's name (`<branch>`,
`<branch>-slim`, `<branch>-cuda`), never over `latest`. The whisper.cpp builds are downloaded at image build time,
pinned by release tag (the same one the Bridge's own downloader uses), each checked
against the sha256 that release's `checksums.txt` lists, and each image fetches only
the build it carries; the speech models are not baked
in (the Bridge downloads the one it needs into its data folder on first use).
**No image carries an AI agent's command-line tool**: agents will run in a separate
`agent` container that sees only a staging folder, which arrives with Phase 1a.

## Running it beside a server

`compose.example.yaml` in the Bridge's repository runs the server and the Bridge
together:

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
    ports:
      - "8091:8091"
    volumes:
      - ./bridge-data:/bridge-data
      - /path/to/audiobooks:/audiobooks:rw
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
