---
title: Running a Bridge
description: "Run the optional AudioSilo Bridge and its agent container beside your server with Docker Compose, then follow its setup checklist: pair it with your server, check its libraries, speech recognition, the agent's credential (on its Accounts tab or in the agent container), the monthly budget, and an optional GitHub sign-in for contributing. Also costs and limits, Unraid and keeping it safe."
---

## Running a Bridge

The **Bridge** is an optional companion that runs beside your AudioSilo server.
The server only reads your books; the Bridge is the part that may write to your
library folders and run heavy work, so the server can stay read-only. You don't
need one to use AudioSilo.

Today the Bridge [generates characters and recaps](../admin/generating-characters-and-recaps.md)
for books the community hasn't covered yet: it transcribes a book (or reads its
ebook) and has an AI agent write them. It also
[finds the chapters](../admin/generating-characters-and-recaps.md#books-without-chapters)
of a book that has none, in its narration, and it can
[contribute](../community/contributing-from-your-server.md) the characters and
recaps it generates, and your corrections to a book's details, to the community
metadata database. It runs as **two containers**:

- **the Bridge** itself, which sees your library folders and does the
  transcribing and the writing;
- **the agent container**, which runs the AI agent (Anthropic's Claude Code or
  OpenAI's Codex). It sees only a shared work folder and its own settings: never
  your library, the Bridge's data or its secrets (apart from the agent's own
  credential, when you set it on the Bridge, which each run receives), and it
  can't reach the server or the Bridge. Each job hands it just the text it needs.

:::info Early days
The Bridge is new and still being built, and its images aren't open to everyone
yet. More jobs (podcasts, read-along and more) come in later versions.
:::

### What you need

- A server running in Docker, as in [Quick start with Docker](quickstart-docker.md),
  with [community metadata](../admin/server.md#community-metadata) switched on (it
  is by default).
- Your audiobooks folder on the same machine, so both the server and the Bridge
  can mount it.
- For characters and recaps: an account for the AI agent. A **Claude** or
  **ChatGPT** subscription works, or an API key. Use an account of the Bridge's
  own rather than one you share with other tools, so its usage and limits are its
  own.

### 1. Add the Bridge to your compose file

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

- **The same library folder, at the same path, in the server and the Bridge.**
  The server mounts it read-only (`:ro`), the Bridge read-write (`:rw`). With the
  same path inside both, the Bridge finds each library by itself. (If you mount it
  somewhere else, tell the Bridge where each library is on its page's
  **Libraries** tab.) The agent container never mounts it.
- **`PUID`/`PGID`** are the user and group the Bridge runs as. Use the **owner of
  your audiobooks folders**, the same as the server, so anything the Bridge writes
  belongs to the right user. On generic Linux that is the output of `id -u` and
  `id -g`; on Unraid, `99` and `100`. (If you run the container as a user with
  `user:` instead, that user must own `./bridge-data`.)
- **`AUDIOSILO_BRIDGE_SERVER_URL`** is how the Bridge reaches the server. In the
  same compose file that is the service name, `http://audiosilo:8080`, not the
  address you type in your browser. **`AUDIOSILO_BRIDGE_PUBLIC_URL`** is the
  address of the Bridge's page from your network (your machine's address and port
  8091); the console's **Open its page** link uses it.
- **The `staging` volume** is the one folder the Bridge and the agent share: the
  Bridge leaves each job there and collects the answer. Keep it a volume of its
  own, not inside `./bridge-data`.
- **The agent's settings** (`user`, `cap_drop`, `read_only` and the rest) lock it
  down: it runs as its own user with no privileges, can't change its own files
  and has a network of its own. Keep them as they are.

Use `ghcr.io/kodestar/audiosilo-bridge:latest-slim` instead of `:latest` for a
smaller Bridge without speech recognition built in, or `:latest-cuda` to
transcribe on an NVIDIA graphics card.

### 2. Start it and find its password

```bash
docker compose up -d
docker compose logs bridge
```

On its first start the Bridge prints the password for its page **once**, in its
log:

```
  AudioSilo Bridge: first start
  The password for the Bridge's page is: ...
  It is shown only this once; change it on the page.
```

Copy it now. You can change it later on the page's **Settings** tab.

### 3. Open the Bridge's page

Open `http://<your machine>:8091` and sign in with that password. The page has tabs
for its **Status**, **Libraries**, **Jobs**, **Settings**, **Accounts**, **Workers**
and **Logs**.

It only answers from your **local network**, and it always asks for the password,
even on the same machine. It won't open over the internet, through a reverse proxy
or over a VPN address like Tailscale's, and isn't meant to.

Until the Bridge is set up, its **Status** tab starts with a **Get set up** card:
the steps below, in the same order, each ticked once done, with a word on where
it stands and, while it is still to do, an **Open** link to the tab where you do
it (**Open Libraries**, **Open Settings** or **Open Accounts**; pairing is done on
the Status tab itself). The card goes away once
every required step is done. Once the Bridge is paired, the server's console
shows the same list on [Settings > Bridge](../admin/bridge.md#the-setup-card).

| Step | Required | Where you do it |
|---|---|---|
| Pair with a server | yes | the **Status** tab (step 4) |
| Map the libraries | yes | the **Libraries** tab (step 5) |
| Speech recognition | yes | the **Settings** tab, or an ASR worker (step 6) |
| Set the agent's credential | yes | the **Accounts** tab, or the agent container (step 7) |
| Review the monthly budget | yes | the **Settings** tab (step 8) |
| Sign in to GitHub | no: only to share with the community | the **Accounts** tab (step 9) |

### 4. Pair it with your server

1. In the server's admin console, open **Server > Settings > Bridge** and press
   **Connect a bridge**. Copy the code.
2. On the Bridge's **Status** tab, under **Pair with a server**, fill in the
   **Server address** (`http://audiosilo:8080` in the compose file above) and the
   **Pairing code**, and press **Pair**.

The code works once, for 15 minutes. Instead of pasting, you can add
`AUDIOSILO_BRIDGE_PAIR_CODE: <the code>` to the Bridge's `environment` before its
first start; remove it again afterwards.

Back in the console the Bridge shows as **Online**. What everything on that page
means is in [The Bridge](../admin/bridge.md).

### 5. Check the libraries

After pairing, the Bridge looks for each of the server's libraries and checks it
can write there. Within a few seconds each library shows **Mapped** and
**Writable** on the Bridge's **Libraries** tab, and **Ready** in the console. A
library that isn't ready says why: see
[Libraries](../admin/bridge.md#libraries). With the same folders mounted at the
same paths (step 1) there is usually nothing to do. If you mounted a library
somewhere else, tell the Bridge where it is on the **Libraries** tab.

This step is done when **every** library is ready, since the Bridge saves what it
makes in each book's folder. Press **Verify** on a library in the console to check
it end to end.

### 6. Speech recognition

Before writing characters and recaps from a book's audio, the Bridge transcribes
it. The `:latest` image does that itself, on the processor (slow on a typical NAS:
hours for a long book). Two ways to make it faster, or to give a `:latest-slim`
Bridge (which has no speech recognition of its own) a way to transcribe at all:

- an [ASR worker](running-a-worker.md) on a faster computer, such as a Mac with
  Apple Silicon, added on the Bridge's **Workers** tab;
- the `:latest-cuda` image, on a computer with an NVIDIA graphics card.

The **Settings** tab's **When no ASR worker is connected** says what happens while
no worker is connected: **Transcribe on the Bridge**, or **Wait for a worker**.
This step is done while something can transcribe now: the Bridge itself, or a
connected worker. It isn't while the Bridge is set to wait and no worker is
connected.

### 7. The agent's credential

The agent needs a credential for an AI account. It runs **Claude
Code** unless you tell the Bridge otherwise (below). There are two places to put
the credential:

- **The Bridge's Accounts tab** (the easier one). The Bridge keeps it encrypted
  and hands it to the agent container for each run only. See
  [Bridge accounts](bridge-accounts.md#the-agents-credential).
- **The agent container itself**, as before: an environment variable or a file in
  its settings volume. This one wins when both are set.

**With a Claude subscription** (the default):

1. On any computer with Claude Code installed, run `claude setup-token` and sign
   in with the Bridge's Claude account. It prints a long-lived token.
2. Either paste it on the Bridge's **Accounts** tab, as the **Claude subscription
   token**, and press **Save**; or put it in a file named `.env` beside your
   compose file:

   ```
   CLAUDE_CODE_OAUTH_TOKEN=<the token>
   ```

   and `docker compose up -d agent` to start the agent with it.

Instead of the `.env` file you can put the token in the agent's settings volume,
in the file `/agent/secrets/claude_code_oauth_token`. Or use an Anthropic API key
instead of a subscription (billed per use): the **Anthropic API key** field on the
Accounts tab, or `ANTHROPIC_API_KEY` in place of `CLAUDE_CODE_OAUTH_TOKEN`.
`docker compose exec agent audiosilo-bridge agent-login claude` prints the agent
container's ways (the variable or the file).

**With a ChatGPT subscription** (Codex):

1. Sign the agent in once:

   ```bash
   docker compose exec agent audiosilo-bridge agent-login codex
   ```

   It prints an address and a code: open the address in a browser, sign in with
   the Bridge's ChatGPT account and enter the code. The sign-in is kept in the
   agent's settings volume. (A ChatGPT sign-in is made in the agent container
   only; the Accounts tab takes an OpenAI API key instead.)
2. Tell the Bridge to use Codex: add `AUDIOSILO_BRIDGE_AGENT_BACKEND: codex` to
   the **bridge** service's `environment`, then `docker compose up -d bridge`.

Or use an OpenAI API key instead (billed per use): the **OpenAI API key** field on
the Accounts tab with the Bridge set to Codex, or `OPENAI_API_KEY` in the agent's
environment.

Within about 15 seconds the **Characters and recaps** card on the Bridge page's
**Status** tab says the agent is **Ready**, with the version of each tool and
which kind of sign-in it has (never the token itself). If it says the agent isn't
ready, the line under it says why: the container isn't running, it has no
sign-in, or the Bridge is set to the other tool. The console's
[Settings > Bridge](../admin/bridge.md#online-offline-and-its-details) shows the
same.

A token or key you give the agent is only ever handed to the run that needs it,
and it never appears in a log.

### 8. Review the monthly budget

The Bridge stops the agent from spending more than a monthly budget: **$100** a
month unless you change it. On the **Settings** tab, check **Monthly agent budget
(dollars)** (`0` means no cap) and press **Save settings**: saving counts as reviewing it,
even when you keep the amount. A budget set with
`AUDIOSILO_BRIDGE_AGENT_MONTHLY_BUDGET_USD` counts as reviewed too, and is then
locked on the page. A budget saved on the page applies at once: any job paused
at the old cap carries on if the new budget leaves room. One set with the
variable applies when the Bridge next starts (a description job then carries on
by itself; a generate job needs **Retry**). See [Costs and limits](#costs-and-limits) for the rest.

### 9. GitHub, to share with the community (optional)

Characters and recaps the Bridge writes, and corrections you make to a book's
details, stay on your server unless you choose to send them to the community
database. To be able to, sign the Bridge in to GitHub on its **Accounts** tab:
see [Bridge accounts](bridge-accounts.md#github). Then turn on the
[Contributions module](../admin/server.md#modules) in the console, and see
[Contributing from your server](../community/contributing-from-your-server.md).

Once every required step is done, open a book in the console and
[generate its characters and recaps](../admin/generating-characters-and-recaps.md).

### Costs and limits

These are the Bridge's settings for characters and recaps. Set them in its
`environment` (or in `config.yaml` in its data folder) and restart it. The monthly
budget can also be changed on the Bridge page's **Settings** tab, which applies at
once:

| Setting | Variable | Default | What it does |
|---|---|---|---|
| `agent.monthly_budget_usd` | `AUDIOSILO_BRIDGE_AGENT_MONTHLY_BUDGET_USD` | `100` | The most the agent may cost in a calendar month (UTC), across every book. A job that reaches it pauses until the 1st. `0` means no monthly cap. |
| `agent.book_budget_usd` | `AUDIOSILO_BRIDGE_AGENT_BOOK_BUDGET_USD` | `75` | The most one book may cost. |
| `transcripts.retention_days` | `AUDIOSILO_BRIDGE_TRANSCRIPTS_RETENTION_DAYS` | `30` | How many days a book's transcripts are kept after its job ends. `0` deletes them when it ends. |
| `agent.backend` | `AUDIOSILO_BRIDGE_AGENT_BACKEND` | `claude` | Which tool the agent container runs: `claude` or `codex`. |

With a subscription the costs are what the same use would cost with an API key,
so the limits still mean something. The Bridge's **Status** tab shows this
month's spend against the cap.

### On Unraid

On Unraid the Bridge and its agent are **two containers**, set up with the same
settings as the compose file above. There are no ready-made Community
Applications templates for them yet (their images aren't public), so add them
with **Add Container**:

- **The Bridge** (`ghcr.io/kodestar/audiosilo-bridge:latest`): your audiobooks
  share mapped read-write at the same path as in the server's container,
  `/bridge-data` to an appdata folder, port `8091`, `PUID` `99` and `PGID` `100`,
  the variables from step 1, and a **work folder** mapped to `/staging`, for
  example `/mnt/user/appdata/audiosilo-staging`. Keep the work folder outside
  the Bridge's appdata folder.
- **The agent** (`ghcr.io/kodestar/audiosilo-bridge:latest-agent`): the **same**
  work folder mapped to `/staging`, another appdata folder mapped to `/agent`,
  and `CLAUDE_CODE_OAUTH_TOKEN` as a variable (or set the credential on the
  Bridge's Accounts tab instead, or sign Codex in from its console with
  `audiosilo-bridge agent-login codex`). Under **Extra Parameters**, add
  `--user 10002:10002 --cap-drop=ALL --security-opt=no-new-privileges:true --read-only --tmpfs /tmp`,
  and give it a Docker network of its own rather than the one your server is on.
  No library share, and no port.

The two containers run as different users, so the work folder must be writable by
both: on Unraid, `chmod 777` it once.

### Keeping it safe

- The Bridge keeps its data in `./bridge-data`: its settings, its own small
  database, the transcripts it keeps for a while, and its secrets: the token it
  got from the server, its GitHub sign-in and any agent credential set on its
  Accounts tab, each stored encrypted with a key kept in that folder. To keep the
  key separately, set `AUDIOSILO_BRIDGE_SECRET_KEY` to 64 hex characters (for
  example from `openssl rand -hex 32`) and keep it safe: without the same key the
  Bridge can't open what it stored, so it won't start while paired, and its
  GitHub sign-in and agent credentials have to be set again.
- The Bridge's page never shows a stored credential again: it only says whether
  one is set, and since when.
- The agent container may have a credential of its own: a Codex login or a token
  file in its `agent-config` volume, or a token in its environment. A credential from
  the Accounts tab reaches it only as a file for one run, which it deletes before
  the AI tool starts. It can reach the internet (the AI service needs it) but not
  your library, the server or the Bridge.
- Unpairing in the console (**Unpair...**) stops the Bridge at its next call.
  Removing the containers breaks nothing: the server carries on without them.

### Something not working?

- **The console says Offline.** The Bridge can't reach the server: check
  `AUDIOSILO_BRIDGE_SERVER_URL` and the Bridge's **Logs** tab.
- **The Bridge's page says the server refused its token.** It was unpaired in the
  console, another Bridge was connected, or the admin who connected it is no longer
  an admin. Connect it again with a new code (it comes back by itself, within 5
  minutes, if that admin is made an admin again).
- **A library says Not found.** The folder isn't mounted in the Bridge's container
  at the server's path, or it is a different copy. See
  [Libraries](../admin/bridge.md#libraries).
- **A library says Can't write.** Mount it read-write (`:rw`) and check
  `PUID`/`PGID`.
- **The agent isn't ready.** The line under it on the Bridge's **Status** tab says
  why. "Isn't running" or "hasn't written its status": check the agent container
  is up and that both containers mount the same work folder at `/staging`. "Has
  no credential": set one (step 7). "Is signed in: set agent.backend": the agent
  is signed in to the other tool, so set `AUDIOSILO_BRIDGE_AGENT_BACKEND`. "The
  container is too old to take the one on the Accounts tab": update the agent
  image to the Bridge's version, or give the container a credential of its own.
- **The agent's credential was refused.** Replace it where the agent gets it: on
  the Accounts tab, or in the agent container when it has one of its own (that one
  wins). A job paused for it carries on once it is replaced: at once after a
  change on the Accounts tab, else when it next looks (every 30 minutes).
- **Pairing says the server doesn't know about a Bridge.** The server is too old:
  update it first.
- **Pairing says the server's certificate isn't trusted.** Your server uses its own
  self-signed certificate, which the Bridge can't check. Pair with the server's
  `http://` address on your network instead (the page suggests it); in the compose
  file above, `http://audiosilo:8080` already is one.
- **The page says it answers only the local network.** Open it from a computer on
  the same network, by its local address.
