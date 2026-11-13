---
title: Install with Docker
description: "Run the AudioSilo server with Docker Compose, get your first-run password and add your books."
---

Docker is the recommended way to run AudioSilo on a NAS, home server or VPS. One container holds the server, the web player and ffmpeg. The image is **`ghcr.io/kodestar/audiosilo-server`**.

:::tip[On Unraid or a Synology NAS?]
On Unraid, install from Community Applications instead. See [Install on Unraid](./install-unraid.md). On a Synology NAS, see [Install on a Synology NAS](./install-synology.md).
:::

## What you need

- Docker **20.10.10 or newer** with the Compose plugin (`docker compose`). Run `docker version` to check. Older Docker stops the container straight away (see [Troubleshooting](../troubleshooting.md#the-container-stops-at-start-up-with-pthread_create-failed)).
- A folder of audiobooks on the host, for example `/srv/audiobooks`. Its layout can wait. See [Organize your audiobook files](./organizing-your-library.md).

## 1. Create a compose file

Make a folder for AudioSilo, for example `~/audiosilo`. Save this inside it as `docker-compose.yml`:

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
      PUID: "1000"                    # owner of ./data (Unraid: 99, Synology: usually 1026)
      PGID: "1000"                    # group of ./data (Unraid: 100, Synology: usually 100)
      # AUDIOSILO_PUBLIC_URL: "https://books.example.com"  # used in QR/invite links
      # AUDIOSILO_TLS_MODE: "off"     # only behind a TLS-terminating reverse proxy
      AUDIOSILO_WEB_DIR: /app/web
```

Change `/srv/audiobooks` to your books folder. The two mounts:

- **`/data`** holds the server's database, `config.yaml`, certificates and [backups](../admin/backups.md). Keep it, and back it up.
- **`/library`** is your books, mounted read-only (`:ro`). The server never writes to your books.

Set `PUID` and `PGID` to the user and group that should own the data folder. On Linux that's the output of `id -u` and `id -g`. The server runs as that user, so it also needs read access to your books folder. If it can't use a folder, the log says which one and how to fix it (see [Permission denied](../troubleshooting.md#permission-denied)).

A setting you give as an `AUDIOSILO_*` variable wins over the admin console, which then shows it as locked. Leave a setting out if you'd rather change it in [Server > Settings](../admin/server.md#settings).

## 2. Start it and save your password

Create the data folder yourself before the first start, so it belongs to you rather than to root. Then start the server:

```bash
mkdir -p data           # create the data folder first
docker compose up -d
docker compose logs     # the admin password and auth code, shown once
```

On the very first start, the log shows the admin password and an auth code **once**:

```text
========================================================
 AudioSilo first-run setup - store these now, shown once
========================================================
  Admin username : admin
  Admin password : <generated password>
  Auth code      : <generated code>
  Config file    : /data/config.yaml
```

Save both now. [Set up your server](./first-run.md) says what each is for.

## 3. Open it

Browse to `https://your-server:8080`. The server uses a self-signed certificate at first, so your browser warns you. Accept the warning to continue. On your home network, `http://your-server:8080` works too, without the warning.

- **`/admin`** is the admin console. Sign in as `admin` with the printed password.
- **`/web`** is the web player.
- **`/`** is the connect page, where a listener enters an invite code.

The iOS and Android apps connect over plain HTTP at home instead (see [Plain HTTP at home](./remote-access.md#plain-http-at-home-how-the-phone-apps-connect)). To listen away from home, see [Reach your server from outside your home](./remote-access.md).

## 4. Set up your server

The first time you sign in to the admin console, it opens **Set up your server**. Its first step asks for your books folder:

1. Type **`/library`**, the path inside the container.
2. Press **Check folder**.
3. Follow the remaining steps, or skip any of them.

The server scans your books in the background. [Set up your server](./first-run.md#set-up-your-server) walks through every step. Then [get the apps](../listening/mobile-apps.md) and [connect a phone or browser](../listening/connecting.md).

## Update

```bash
docker compose pull && docker compose up -d
```

This updates the server and the web player together. Your books are never changed. When an update changes the database, the server first saves a [backup](../admin/backups.md#before-an-upgrade) of it. **Server > About** in the admin console tells you when a new version is out.

## Good to know

- **Prefer `docker run`?** The same container in one command:

  ```bash
  mkdir -p data           # create the data folder first
  docker run -d --name audiosilo -p 8080:8080 \
    -e PUID=1000 -e PGID=1000 \
    -v "$PWD/data:/data" \
    -v /srv/audiobooks:/library:ro \
    ghcr.io/kodestar/audiosilo-server:latest

  docker logs audiosilo   # the admin password and auth code, shown once
  ```

- **Books on a network share (SMB/NFS):** mount the share on the Docker host, then mount that path into the container. If the share goes away, the server keeps your books and progress; they come back when the share does.
- **HTTPS with a reverse proxy from the start:** follow the [Caddy](https://audiosilo.app/blog/audiosilo-with-caddy/), [SWAG](https://audiosilo.app/blog/audiosilo-with-swag/) or [Traefik](https://audiosilo.app/blog/audiosilo-with-traefik/) guide. Each has a Compose file with both AudioSilo and the proxy.

## Testing unreleased builds

:::warning[For testing only]
The **`:edge`** tag is built from the latest development code. It can break. Stay on `:latest` for everyday listening.
:::

Run edge as a **second** container on a **copy** of your data folder. Never point it at the original, because it may change the database in a way a release can't undo.

1. Copy the data folder while the server is stopped (delete any older `./data-edge` first):

   ```bash
   docker compose stop
   cp -a ./data ./data-edge
   docker compose start
   ```

2. Add this under `services:` in the same `docker-compose.yml`:

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

3. Start it with `docker compose up -d audiosilo-edge`. To get the newest build, run `docker compose pull audiosilo-edge && docker compose up -d audiosilo-edge`.

Try the edge server in a browser at `https://your-server:8081/web`. Don't pair an app that already uses your normal server. The copy has the same identity, so the app would move its sign-in over to it. Notifications set up in the console may come from the edge server too.

To stop testing, run `docker compose rm -sf audiosilo-edge`, then delete its block from the compose file and delete `./data-edge`.

This is for the `ghcr.io/kodestar/audiosilo-server` image. The LinuxServer.io image on Unraid has its own tags and keeps its data in `/config`.
