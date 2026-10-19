---
title: Quick start with Docker
description: "Run the AudioSilo server with Docker Compose: the image, the volumes, first-run credentials, and your first library."
---

## Quick start with Docker

Docker is the recommended way to run AudioSilo on a NAS, home server or VPS. The published image bundles the server, the web player and ffmpeg, so a single container is a complete setup.

The image is **`ghcr.io/kodestar/audiosilo-server`**.

:::tip On Unraid?
Install from Community Applications instead - see [Install on Unraid](./install-unraid.md).
:::

### What you need

- Docker with the Compose plugin (`docker compose`).
- A folder of audiobooks somewhere on the host (for example `/srv/audiobooks`). Don't worry about its layout yet - see [Organizing your library](./organizing-your-library.md).

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

- **`/data`** holds everything the server creates: its database, `config.yaml` and TLS certificates. Here it maps to a `./data` folder next to the compose file - keep it persisted and back it up.
- **`/library`** is your audiobooks folder, mounted **read-only** (`:ro`). The server never writes to your books, so read-only costs nothing and protects them.

A setting given as an `AUDIOSILO_*` variable here wins over `config.yaml`, and the admin console shows it as locked ("Set by AUDIOSILO_WEB_DIR") rather than offering to change it. Leave a setting out of the compose file if you'd rather change it in the console's [Server > Settings](../admin/server.md#settings).

Set `PUID`/`PGID` to the user and group that should own the data directory - on generic Linux, the output of `id -u` and `id -g`; on Unraid, `99`/`100`. The container fixes up ownership of `/data` on start and runs as that user, so it works however the mounted volume is owned.

Your books never live inside the container or the data volume - the web player and server are app code inside the image, and updating either is just pulling a new image.

### 2. Start it and grab your credentials

```bash
docker compose up -d
docker compose logs
```

On the very first start, the server creates an admin account and prints the credentials **once** in the logs:

```text
========================================================
 AudioSilo first-run setup - store these now, shown once
========================================================
  Admin username : admin
  Admin password : <generated password>
  Auth code      : <generated code>
  Config file    : /data/config.yaml
```

Save the password and the auth code somewhere safe now - they are never shown again. See [First run](./first-run.md) for what each is for and what to do if you miss them.

### 3. Open it

By default the server speaks HTTPS with a self-signed certificate, so browse to:

```text
https://your-server:8080
```

Your browser will warn about the certificate the first time - that's expected with the default setup; accept it to continue. The phone apps can't accept that warning, so at home they connect over plain HTTP instead, which the server offers to devices on your home network ([plain HTTP at home](./remote-access.md#plain-http-at-home-how-the-phone-apps-connect), including a note on Docker Desktop). [Remote access](./remote-access.md) covers getting a proper certificate or running behind a reverse proxy.

- **`/`** - the connect page, where a listener enters an auth code to pair a device.
- **`/admin`** - the admin console. Log in as `admin` with the printed password.
- **`/web`** - the web player, bundled with the image.

### 4. Add your first library

In the admin console, click **Add your first library** and point it at the path **inside the container** - `/library` with the compose file above (the **Browse** button lists the container's folders). The library is browsable immediately; the scanner fills in metadata, covers and durations in the background. See [Libraries](../admin/libraries.md) for the details.

Then connect a phone or browser and start listening - see [Connecting to a server](../listening/connecting.md).

### Updating

The server and the bundled web player ship together in the image, so updating either is the same command:

```bash
docker compose pull && docker compose up -d
```

Your data directory and books are untouched by updates. To hear about new versions, look at **Server > About** in the admin console: the server asks GitHub once a day whether a newer release exists (you can turn that off; see [What the update check sends](../admin/server.md#what-the-update-check-sends)).

:::note
If your books live on a network share (SMB/NFS), mount the share on the Docker host and bind-mount the mounted path into the container. The server is deliberately careful here: if the share goes away, it will not wipe its index or your listening progress - books simply reappear when the share is back.
:::

### Testing unreleased builds

:::warning Unstable - for testing only
The **`:edge`** tag is rebuilt from the server's latest development code every time it changes (the web player inside it can lag a little behind the player's own development code). It has not been through a release, can break, and is not supported for everyday listening. Stay on `:latest` unless you want to try a fix or feature before it ships.
:::

To try it, run a **second** container on a **copy** of your data folder, never the original: an edge build may upgrade the database in a way a release can't undo. Stop your server while you copy, so the database is copied whole, and delete any older `./data-edge` first (use `sudo` if your user can't read every file in the folder):

```bash
docker compose stop
cp -a ./data ./data-edge
docker compose start
```

Then add the edge server as a second service in the same `docker-compose.yml`, under `services:`, on a different port so it runs beside your normal one:

```yaml
  audiosilo-edge:
    image: ghcr.io/kodestar/audiosilo-server:edge
    ports:
      - "8081:8080"
    volumes:
      - ./data-edge:/data
      - /srv/audiobooks:/library:ro
    environment:
      PUID: "1000"                    # the same as your normal service
      PGID: "1000"
```

Start it with `docker compose up -d audiosilo-edge`; to get the newest build, run `docker compose pull audiosilo-edge && docker compose up -d audiosilo-edge`. The admin console shows its version as `dev-` followed by the first 7 characters of the commit it was built from, and once it has checked for updates, [Server > About](../admin/server.md#about-and-updates) calls it a development build.

The copy is the same server as far as your devices know: the same users and the same server identity. Try the edge server in a browser (`https://your-server:8081/web`) rather than pairing a phone app that is already connected to your normal server: the app would take it for that server and move its sign-in over to the copy. Notifications set up in the console may come from the edge server too.

To stop testing, remove the edge container (`docker compose rm -sf audiosilo-edge`), then delete its block from the compose file and delete `./data-edge`. Your normal server, on the original data folder, is untouched.

This applies to the `ghcr.io/kodestar/audiosilo-server` image above. The LinuxServer.io image used on Unraid has its own tags and keeps its data in `/config` (see [Moving from the AudioSilo image](./install-unraid.md#moving-from-the-audiosilo-image)), so it isn't a matter of changing the tag there.
