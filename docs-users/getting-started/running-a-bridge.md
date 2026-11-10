---
title: Add a Bridge
description: "Run the optional Bridge beside your server with Docker Compose, pair it, and finish its setup checklist."
---

The **Bridge** is an optional companion container that runs beside your
AudioSilo server. The server only reads your books; the Bridge may write to your
library folders and runs the heavy jobs.

You don't need a Bridge to listen to your books. Add one when you want:

- [Podcasts](../admin/podcasts.md): following shows and downloading their episodes.
- [Characters, recaps and descriptions](../admin/generating-characters-and-recaps.md)
  for books the community hasn't covered yet, written by an AI agent.
- [Chapters](../admin/generating-characters-and-recaps.md#books-without-chapters)
  for a book that has none, found in its narration.
- [Read-alongs](../admin/making-read-along.md), so listeners can follow the
  narration in the book's ebook.
- [Audible backups](../admin/audible.md) of the books you bought, and listening
  places kept in step with Audible.
- [Sharing with the community](../community/contributing-from-your-server.md):
  the characters and recaps it writes, and your corrections to a book's details.

<a id="which-bridge-version"></a>

Update the server and the Bridge together, and run the same version of the Bridge
and its agent image. The console's **Server > Settings > Bridge** shows the
version of the Bridge you paired. The source and releases are on
[GitHub](https://github.com/KodeStar/audiosilo-bridge).

The Bridge runs as **two containers**:

- **the Bridge**, which sees your library folders and does the work;
- **the agent container**, which runs the AI agent (Anthropic's Claude Code or
  OpenAI's Codex). It sees only a shared work folder, never your library, the
  server or the Bridge. Only characters, recaps and descriptions use it.

## What you need

- A server running in Docker, as in [Install with Docker](quickstart-docker.md),
  with [community metadata](../admin/server.md#community-metadata) on (it is by
  default).
- Your audiobooks folder on the same machine, so both containers can mount it.
- For characters and recaps: a **Claude** or **ChatGPT** subscription, or an API
  key. Give the Bridge an account of its own, so its usage and limits are its own.

## 1. Add the Bridge to your compose file

Add a `bridge` and an `agent` service next to the `audiosilo` one from the quick
start:

```yaml
services:
  audiosilo:
    image: ghcr.io/kodestar/audiosilo-server:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
      - /srv/audiobooks:/library:ro       # read-only for the server
    environment:
      PUID: "1000"
      PGID: "1000"
      AUDIOSILO_WEB_DIR: /app/web

  bridge:
    image: ghcr.io/kodestar/audiosilo-bridge:latest
    restart: unless-stopped
    depends_on: [audiosilo]
    ports:
      - "8091:8091"                       # the Bridge's own page
    volumes:
      - ./bridge-data:/bridge-data        # the Bridge's settings and state
      - /srv/audiobooks:/library:rw       # the SAME folder, at the SAME path, read-write
      # One line like it for each other library, a podcast library too.
      - staging:/staging                  # the work folder it shares with the agent
    environment:
      PUID: "1000"                        # the owner of your audiobooks (Unraid: 99)
      PGID: "1000"                        # their group (Unraid: 100)
      # The server, as the Bridge reaches it from its container:
      AUDIOSILO_BRIDGE_SERVER_URL: http://audiosilo:8080
      # The Bridge's page, as your network reaches it (the console links to it):
      AUDIOSILO_BRIDGE_PUBLIC_URL: http://192.168.1.10:8091
      # Where the shared work folder is mounted (above):
      AUDIOSILO_BRIDGE_AGENT_STAGING_DIR: /staging

  agent:
    image: ghcr.io/kodestar/audiosilo-bridge:latest-agent
    restart: unless-stopped
    user: "10002:10002"
    environment:
      # Named only: the value comes from a .env file beside this one (step 7).
      # Leave it unset to use the credential set on the Bridge's Accounts tab.
      - CLAUDE_CODE_OAUTH_TOKEN
    volumes:
      - staging:/staging                  # the only folder it shares
      - agent-config:/agent               # its own settings and sign-in
    networks: [agent]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    read_only: true
    tmpfs: ["/tmp"]
    stop_grace_period: 20s

networks:
  agent: {}                               # the agent's own: the internet, nothing else

volumes:
  staging: {}
  agent-config: {}
```

What matters:

- **Mount each library at the same path in the server and the Bridge.** The
  server mounts it read-only (`:ro`), the Bridge read-write (`:rw`). Then the
  Bridge finds each library by itself. The console's **Server > Settings >
  Bridge** shows a snippet with one volume line per library.
- **`PUID`/`PGID`** are the owner of your audiobooks folders, the same as for the
  server. On Linux, run `id -u` and `id -g`; on Unraid, use `99` and `100`.
- **`AUDIOSILO_BRIDGE_SERVER_URL`** is how the Bridge reaches the server. In one
  compose file that is `http://audiosilo:8080`, not the address in your browser.
- **`AUDIOSILO_BRIDGE_PUBLIC_URL`** is the address of the Bridge's page on your
  network (your machine's address and port 8091).
- **The `staging` volume** is the only folder the Bridge and the agent share.
  Keep it separate from `./bridge-data`.
- **Keep the agent's security settings** (`user`, `cap_drop`, `read_only` and the
  rest) as they are.

For a smaller Bridge without speech recognition, use the `:latest-slim` image. To
transcribe on an NVIDIA graphics card, use `:latest-cuda`.

## 2. Start it and find its password

```bash
docker compose up -d
docker compose logs bridge
```

On its first start, the Bridge prints the password for its page **once**, in its
log. Copy it now. You can change it later on the page's **Settings** tab.

Lost it? Run this as the owner of the Bridge's data folder (on Unraid, use
`-u 99:100` with `docker exec` and the container's name):

```bash
docker compose exec -u 1000:1000 bridge audiosilo-bridge reset-password
```

It prints a new password and signs everyone out of the page. The pairing and
settings stay as they are.

## 3. Open the Bridge's page

Open `http://<your machine>:8091` and sign in with the password.

![The Bridge's sign-in page](/img/screenshots/bridge/sign-in.png)

The page only answers your **local network**, and always asks for the password.
It won't open from the internet or over a VPN like Tailscale. Don't put it behind
a reverse proxy: the Bridge would see the proxy as local. If you do anyway, the
proxy itself must accept only local connections.

Until the Bridge is set up, its **Status** tab shows a **Get set up** card. It
lists the steps below and ticks each one off, with a link to the tab where you do
it. Once the Bridge is paired, the console shows the same list on
[Settings > Bridge](../admin/bridge.md#the-setup-card).

![The Status tab of a new Bridge, with the Get set up card](/img/screenshots/bridge/status-unpaired.png)

## 4. Pair it with your server

1. In the admin console, open **Server > Settings > Bridge**.
2. Press **Connect a Bridge** and copy the code.
3. On the Bridge's **Status** tab, under **Pair with a server**, fill in the
   **Server address** (`http://audiosilo:8080` with the compose file above).
4. Paste the **Pairing code** and press **Pair**.

The code works once, for 15 minutes. The console then shows the Bridge as
**Online**.

![The Status tab once paired](/img/screenshots/bridge/status-paired.png)

## 5. Check the libraries

After pairing, the Bridge looks for each of the server's libraries and checks it
can write there. Within a few seconds, each library shows **Mapped** and
**Writable** on the Bridge's **Libraries** tab, and **Ready** in the console. With
the same folders at the same paths, there is usually nothing to do.

If you mounted a library somewhere else, tell the Bridge where it is on the
**Libraries** tab. A library that isn't ready says why: see
[Libraries](../admin/bridge.md#libraries).

![The Bridge's Libraries tab](/img/screenshots/bridge/libraries.png)

For a **podcast** library, mount its own folder the same way. An empty podcast
library can be ready too: the Bridge writes a small hidden marker there. Leave it
in place.

If you only want podcasts, you can skip steps 6 to 9: podcasts use no speech
recognition and no AI agent.

### Feeds on your local network

Public feeds just work. To read a feed on your own network, allow its address
range in the Bridge's environment, then restart it:

```yaml
AUDIOSILO_BRIDGE_PODCASTS_ALLOW_NETWORKS: "192.168.1.20/32"
```

Separate several ranges with commas. Allow only what you need: it also covers
artwork and episode downloads.

## 6. Speech recognition

The Bridge transcribes a book before it writes characters and recaps, finds
chapters or makes a read-along. The `:latest` image does this itself, on the
processor. That is slow on a typical NAS: hours for a long book.

To make it faster, or to give a `:latest-slim` Bridge a way to transcribe:

- run [speech recognition on another computer](running-a-worker.md), such as a
  Mac with Apple Silicon, or
- use the `:latest-cuda` image on a computer with an NVIDIA graphics card.

## 7. The agent's credential

The agent needs a credential for an AI account. It runs **Claude Code** unless you
switch it to Codex (below). You can set the credential on the Bridge's
[Accounts tab](bridge-accounts.md#the-agents-credential), which is easiest, or in
the agent container (see [Settings that take precedence](bridge-accounts.md#settings-that-take-precedence)).

**With a Claude subscription:**

1. On any computer with Claude Code installed, run `claude setup-token`.
2. Sign in with the Bridge's Claude account. It prints a long-lived token.
3. On the Bridge's **Accounts** tab, paste it as the **Claude subscription token**
   and press **Save**.

Or put it in a `.env` file beside your compose file, then run
`docker compose up -d agent`:

```
CLAUDE_CODE_OAUTH_TOKEN=<the token>
```

An Anthropic API key works too (billed per use): use the **Anthropic API key**
field, or `ANTHROPIC_API_KEY` in place of `CLAUDE_CODE_OAUTH_TOKEN`.

**With a ChatGPT subscription (Codex):**

1. Sign the agent in:

   ```bash
   docker compose exec agent audiosilo-bridge agent-login codex
   ```

2. Open the address it prints, sign in with the Bridge's ChatGPT account and enter
   the code.
3. Add `AUDIOSILO_BRIDGE_AGENT_BACKEND: codex` to the **bridge** service's
   `environment`, then run `docker compose up -d bridge`.

An OpenAI API key works too: the **OpenAI API key** field on the Accounts tab, or
`OPENAI_API_KEY` in the agent's environment.

Within about 15 seconds, the **Characters and recaps** card on the Bridge's
**Status** tab says the agent is **Ready**. If not, the line under it says why.

## 8. Review the monthly budget

The Bridge stops the agent from spending more than **$100** a month unless you
change it. On the **Settings** tab, check **Monthly agent budget (dollars)** and
press **Save settings**. Saving counts as reviewing it, even if you keep the
amount. `0` means no cap.

## 9. GitHub, to share with the community (optional)

What the Bridge writes, and your corrections to a book's details, stay on your
server unless you choose to share them. To share, sign the Bridge in to GitHub
(see [Bridge accounts](bridge-accounts.md#github)) and turn on the
[Contributions module](../admin/server.md#modules).

Once every required step is done, open a book in the console and
[generate its characters and recaps](../admin/generating-characters-and-recaps.md).

## Costs and limits

Set these in the Bridge's `environment` (or `config.yaml` in its data folder),
then restart it. The monthly budget can also be changed on the **Settings** tab,
which applies at once.

| Setting | Variable | Default | What it does |
|---|---|---|---|
| `agent.monthly_budget_usd` | `AUDIOSILO_BRIDGE_AGENT_MONTHLY_BUDGET_USD` | `100` | The most the agent may cost in a calendar month (UTC). `0` means no cap. |
| `agent.book_budget_usd` | `AUDIOSILO_BRIDGE_AGENT_BOOK_BUDGET_USD` | `75` | The most one book may cost. |
| `transcripts.retention_days` | `AUDIOSILO_BRIDGE_TRANSCRIPTS_RETENTION_DAYS` | `30` | Days a book's transcripts are kept after its job ends. `0` deletes them at once. |
| `agent.backend` | `AUDIOSILO_BRIDGE_AGENT_BACKEND` | `claude` | Which tool the agent runs: `claude` or `codex`. |

With a subscription, costs are counted as the same use would cost on an API key,
so the limits still mean something. The **Status** tab shows this month's spend.

## On Unraid

Add the Bridge and its agent as two containers with **Add Container**, using the
settings from the compose file above. The images are public, so no registry
sign-in is needed.

- **The Bridge** (`ghcr.io/kodestar/audiosilo-bridge:latest`): each library share
  read-write at the same path as in the server's container, `/bridge-data` to an
  appdata folder, port `8091`, `PUID` `99`, `PGID` `100`, the variables from
  step 1, and a work folder (such as `/mnt/user/appdata/audiosilo-staging`) at
  `/staging`. Keep the work folder outside the Bridge's appdata folder.
- **The agent** (`ghcr.io/kodestar/audiosilo-bridge:latest-agent`): the **same**
  work folder at `/staging`, another appdata folder at `/agent`, no library share
  and no port. Under **Extra Parameters**, add
  `--user 10002:10002 --cap-drop=ALL --security-opt=no-new-privileges:true --read-only --tmpfs /tmp`,
  and give it a Docker network of its own.

The two containers run as different users, so run `chmod 777` on the work folder
once.

## Keeping it safe

- The Bridge keeps its settings, data and secrets in `./bridge-data`. Secrets are
  encrypted with a key kept in that folder. Back it up.
- To keep the key separately, set `AUDIOSILO_BRIDGE_SECRET_KEY` to 64 hex
  characters (for example from `openssl rand -hex 32`). Without the same key, a
  paired Bridge won't start and its sign-ins have to be set again.
- The page never shows a stored credential again. The agent gets a credential
  only for the run that needs it, and it never appears in a log.
- **Unpair...** in the console stops the Bridge. Removing the containers leaves
  what it saved in your library.

## Something not working?

- **The console says Offline.** The Bridge can't reach the server. Check
  `AUDIOSILO_BRIDGE_SERVER_URL` and the Bridge's **Logs** tab.
- **Pairing says "Couldn't reach" the server.** Use the server's address as the
  Bridge's computer reaches it, like `http://192.168.1.10:8080`. A name like
  `http://audiosilo:8080` only works in the same compose file.
- **Pairing says the server's certificate isn't trusted.** Pair with the server's
  `http://` address on your network instead.
- **The server refused the Bridge's token.** It was unpaired, another Bridge was
  connected, or the admin who paired it is no longer an admin. Pair it again with
  a new code.
- **A library says Not found or Can't write.** Mount it at the server's path,
  read-write (`:rw`), and check `PUID`/`PGID`. See
  [Libraries](../admin/bridge.md#libraries).
- **The agent isn't ready.** The line under the agent on the **Status** tab says
  why. Check that the agent container is running, has a credential, and is the
  same version as the Bridge.
- **The page says it answers only the local network.** Open it from a computer on
  the same network, by its local address.
