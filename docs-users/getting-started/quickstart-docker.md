---
title: Quick start with Docker
description: "Run the AudioSilo server with Docker Compose: the image, the volumes, first-run credentials, and your first library."
---

## Quick start with Docker

Docker is the recommended way to run AudioSilo on a NAS, home server or VPS. The published image bundles the server, the web player and ffmpeg, so a single container is a complete setup.

The image is **`ghcr.io/kodestar/audiosilo-server`**.

### What you need

- Docker with the Compose plugin (`docker compose`).
- A folder of audiobooks somewhere on the host (for example `/srv/audiobooks`). Don't worry about its layout yet — see [Organizing your library](./organizing-your-library.md).

### 1. Create a compose file

Make a directory for AudioSilo (for example `~/audiosilo`) and save this as `docker-compose.yml` inside it:

```yaml
services:
  audiosilo:
    image: ghcr.io/kodestar/audiosilo-server:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data                  # database, config, certificates
      - /srv/audiobooks:/library:ro   # your books, mounted read-only
    environment:
      PUID: "1000"                    # owner of /data (Unraid: 99)
      PGID: "1000"                    # group of /data (Unraid: 100)
      # AUDIOSILO_PUBLIC_URL: "https://books.example.com"  # used in QR/invite links
      # AUDIOSILO_TLS_MODE: "off"     # only behind a TLS-terminating reverse proxy
      AUDIOSILO_WEB_DIR: /app/web
```

Two mounts matter:

- **`/data`** holds everything the server creates: its database, `config.yaml` and TLS certificates. Here it maps to a `./data` folder next to the compose file — keep it persisted and back it up.
- **`/library`** is your audiobooks folder, mounted **read-only** (`:ro`). The server never writes to your books, so read-only costs nothing and protects them.

Set `PUID`/`PGID` to the user and group that should own the data directory — on generic Linux, the output of `id -u` and `id -g`; on Unraid, `99`/`100`. The container fixes up ownership of `/data` on start and runs as that user, so it works however the mounted volume is owned.

Your books never live inside the container or the data volume — the web player and server are app code inside the image, and updating either is just pulling a new image.

### 2. Start it and grab your credentials

```bash
docker compose up -d
docker compose logs
```

On the very first start, the server creates an admin account and prints the credentials **once** in the logs:

```text
========================================================
 AudioSilo first-run setup — store these now, shown once
========================================================
  Admin username : admin
  Admin password : <generated password>
  Auth code      : <generated code>
  Config file    : /data/config.yaml
```

Save the password and the auth code somewhere safe now — they are never shown again. See [First run](./first-run.md) for what each is for and what to do if you miss them.

### 3. Open it

By default the server speaks HTTPS with a self-signed certificate, so browse to:

```text
https://your-server:8080
```

Your browser will warn about the certificate the first time — that's expected with the default setup; accept it to continue. [Remote access](./remote-access.md) covers getting a proper certificate or running behind a reverse proxy.

- **`/`** — the connect page, where a listener enters an auth code to pair a device.
- **`/admin`** — the admin console. Log in as `admin` with the printed password.
- **`/web`** — the web player, bundled with the image.

### 4. Add your first library

In the admin console, add a library pointing at the path **inside the container** — `/library` with the compose file above. The library is browsable immediately; the scanner fills in metadata, covers and durations in the background. See [Libraries](../admin/libraries.md) for the details.

Then connect a phone or browser and start listening — see [Connecting to a server](../listening/connecting.md).

### Updating

The server and the bundled web player ship together in the image, so updating either is the same command:

```bash
docker compose pull && docker compose up -d
```

Your data directory and books are untouched by updates.

:::note
If your books live on a network share (SMB/NFS), mount the share on the Docker host and bind-mount the mounted path into the container. The server is deliberately careful here: if the share goes away, it will not wipe its index or your listening progress — books simply reappear when the share is back.
:::
