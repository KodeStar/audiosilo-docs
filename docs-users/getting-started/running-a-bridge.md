---
title: Running a Bridge
description: "Run the optional AudioSilo Bridge beside your server with Docker Compose: the same library folders mounted read-write, PUID/PGID, its own page on port 8091 and pairing it with your server."
---

## Running a Bridge

The **Bridge** is an optional second container that runs beside your AudioSilo
server. The server only reads your books; the Bridge is the part that may write to
your library folders and run heavy work, so the server can stay read-only. You
don't need one to use AudioSilo.

:::info Early days
The Bridge is new and still being built, and its image isn't open to everyone
yet. This first version only **proves the connection**: it pairs with your server,
checks that it can find and write to each library, and runs a **Verify** check on
request. It changes nothing in your books. Later versions add the jobs it is for,
such as generated recaps and character sheets, podcasts, and more.
:::

### What you need

- A server running in Docker, as in [Quick start with Docker](quickstart-docker.md).
- Your audiobooks folder on the same machine, so both containers can mount it.

### 1. Add the Bridge to your compose file

Add a `bridge` service next to the `audiosilo` one from the quick start:

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
    environment:
      PUID: "1000"                        # the owner of your audiobooks (Unraid: 99)
      PGID: "1000"                        # their group (Unraid: 100)
      # The server, as the Bridge reaches it from its container:
      AUDIOSILO_BRIDGE_SERVER_URL: http://audiosilo:8080
      # The Bridge's page, as your network reaches it (the console links to it):
      AUDIOSILO_BRIDGE_PUBLIC_URL: http://192.168.1.10:8091
```

Three things matter:

- **The same folder, at the same path, in both containers.** The server mounts it
  read-only (`:ro`), the Bridge read-write (`:rw`). With the same path inside both,
  the Bridge finds each library by itself. (If you mount it somewhere else, tell the
  Bridge where each library is on its page's **Libraries** tab.)
- **`PUID`/`PGID`** are the user and group the Bridge runs as. Use the **owner of
  your audiobooks folders**, the same as the server, so anything the Bridge writes
  belongs to the right user. On generic Linux that is the output of `id -u` and
  `id -g`; on Unraid, `99` and `100`. (If you run the container as a user with
  `user:` instead, that user must own `./bridge-data`.)
- **`AUDIOSILO_BRIDGE_SERVER_URL`** is how the Bridge reaches the server. In the same
  compose file that is the service name, `http://audiosilo:8080`, not the address
  you type in your browser. **`AUDIOSILO_BRIDGE_PUBLIC_URL`** is the address of the
  Bridge's page from your network (your machine's address and port 8091); the
  console's **Open its page** link uses it.

Use `ghcr.io/kodestar/audiosilo-bridge:latest-slim` instead for a smaller image
without speech recognition, which nothing uses yet. `:latest-cuda` is for an NVIDIA
graphics card.

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
for its **Status**, **Libraries**, **Jobs**, **Settings**, **Workers** and **Logs**.

It only answers from your **local network**, and it always asks for the password,
even on the same machine. It won't open over the internet, through a reverse proxy
or over a VPN address like Tailscale's, and isn't meant to.

### 4. Pair it with your server

1. In the server's admin console, open **Server > Settings > Bridge** and press
   **Connect a bridge**. Copy the code.
2. On the Bridge's **Status** tab, under **Pair with a server**, fill in the
   **Server address** (`http://audiosilo:8080` in the compose file above) and the
   **Pairing code**, and press **Pair**.

The code works once, for 15 minutes. Instead of pasting, you can add
`AUDIOSILO_BRIDGE_PAIR_CODE: <the code>` to the Bridge's `environment` before its
first start; remove it again afterwards.

Back in the console the Bridge shows as **Online**, and after a few seconds each
library shows whether the Bridge found it and can write there. Press **Verify** on a
library to check it end to end. What everything on that page means is in
[The Bridge](../admin/bridge.md).

### Keeping it safe

- The Bridge keeps its data in `./bridge-data`: its settings, its own small
  database, and the token it got from the server, stored encrypted with a key kept
  in that folder. To keep the key separately, set `AUDIOSILO_BRIDGE_SECRET_KEY` to
  64 hex characters (for example from `openssl rand -hex 32`) and keep it safe:
  without the same key the Bridge can't open its stored token and won't start.
- Unpairing in the console (**Unpair...**) stops the Bridge at its next call.
  Removing the container breaks nothing: the server carries on without it.

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
- **Pairing says the server doesn't know about a Bridge.** The server is too old:
  update it first.
- **Pairing says the server's certificate isn't trusted.** Your server uses its own
  self-signed certificate, which the Bridge can't check. Pair with the server's
  `http://` address on your network instead (the page suggests it); in the compose
  file above, `http://audiosilo:8080` already is one.
- **The page says it answers only the local network.** Open it from a computer on
  the same network, by its local address.
