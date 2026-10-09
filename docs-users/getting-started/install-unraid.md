---
title: Install on Unraid
description: "Install AudioSilo on Unraid from Community Applications using the LinuxServer.io image: paths, first-run credentials, HTTPS and reverse proxies, and updates."
---

## Install on Unraid

On Unraid, install AudioSilo from **Community Applications** (the Apps tab). The app there is the [LinuxServer.io](https://www.linuxserver.io) image, **`lscr.io/linuxserver/audiosilo`**: the same server, web player and ffmpeg as the [Docker quick start](./quickstart-docker.md), packaged the LinuxServer.io way and rebuilt automatically after every AudioSilo release (usually within an hour or two).

### 1. Install the app

1. Open the **Apps** tab and search for **AudioSilo**.
2. Pick the one from **linuxserver's Repository** and click **Install**.
3. Fill in the template:
   - **Audiobooks** (`/audiobooks`) - your audiobooks share, for example `/mnt/user/audiobooks`. It is mounted read-only: the server never writes to your books.
   - **WebUI** (the port) - `8080` unless it's taken on your server.
4. Click **Show more settings** for the rest of the template:
   - **Appdata** (`/config`) - where the server keeps its database, `config.yaml` and TLS certificates. Unraid usually pre-fills your default appdata location; prefer a cache or pool path such as `/mnt/cache/appdata/audiosilo` so the database isn't on the slower user-share layer.
   - **PUID / PGID** - leave the Unraid defaults, `99` and `100` (`nobody:users`).
5. Click **Apply**.

### 2. Grab your credentials

On the very first start, the server creates an admin account and prints the credentials **once** in the container log. In the **Docker** tab, click the AudioSilo icon and choose **Logs**:

```text
========================================================
 AudioSilo first-run setup - store these now, shown once
========================================================
  Admin username : admin
  Admin password : <generated password>
  Auth code      : <generated code>
  Config file    : /config/config.yaml
```

Save the password and the auth code now - they are never shown again. See [First run](./first-run.md) for what each is for and what to do if you miss them.

### 3. Open it and add your library

Click the AudioSilo icon and choose **WebUI**. By default the server speaks HTTPS with a self-signed certificate, so your browser warns about the certificate the first time; accept it to continue.

- **`/`** - the connect page, where a listener enters an auth code to pair a device.
- **`/admin`** - the admin console. Log in as `admin` with the printed password.
- **`/web`** - the web player.

In the admin console, click **Add your first library** and point it at **`/audiobooks`** (the path inside the container, not the `/mnt/user/...` share). See [Libraries](../admin/libraries.md) for the details, then [connect a phone or browser](../listening/connecting.md).

### HTTPS and reverse proxies

The default self-signed certificate is fine on your home network. To reach AudioSilo from outside, the usual Unraid route is a reverse proxy such as **SWAG** or Nginx Proxy Manager terminating HTTPS in front of it. All three settings it needs are in the admin console under **Server > Settings**:

- Point the proxy at `https://<unraid-ip>:8080` as it is, or set **HTTPS mode** to **Off**, restart the container, and point the proxy at `http://<unraid-ip>:8080`. With HTTPS off, the Docker tab's **WebUI** entry still opens `https://`: edit the container, switch to **Advanced View**, and change its **WebUI** field to `http://[IP]:[PORT:8080]`.
- Set **Public address** to the address your users reach it at (for example `https://books.example.com`) so invite links and QR codes point there.
- Add the proxy's address to **Trusted proxies** so rate limiting sees the real visitor's address.

[Remote access](./remote-access.md) covers all of this, plus Let's Encrypt without a proxy.

:::warning
Only set HTTPS mode to Off behind a proxy that terminates HTTPS. Plain HTTP exposed directly to the internet sends passwords and audio unencrypted.
:::

Most settings can also be set with an `AUDIOSILO_*` variable, such as `AUDIOSILO_PUBLIC_URL` or `AUDIOSILO_TLS_MODE` (add it with **Add another Path, Port, Variable, Label or Device** on the template's edit page). A variable wins over the console, which then shows that setting as locked.

### Updating

Unraid's Docker tab shows **update ready** when a new image is out; apply it there (or let the CA Auto Update plugin do it). The image follows AudioSilo's releases automatically, and also picks up Alpine and ffmpeg security updates weekly. Your appdata and books are untouched by updates.

### Moving from the AudioSilo image

Already running `ghcr.io/kodestar/audiosilo-server` on Unraid? The data is the same; only the paths inside the container differ: `/config` here instead of `/data`, and `/audiobooks` instead of `/library` for your books.

1. Note any `AUDIOSILO_*` variables the old container sets, such as `AUDIOSILO_PUBLIC_URL` or `AUDIOSILO_TLS_MODE`. They live in the container's settings, not in `config.yaml`, so they don't move on their own. (Skip `AUDIOSILO_WEB_DIR`: this image has the web player built in.)
2. Stop and remove the old container. Its data stays in its folder.
3. In that folder, edit `config.yaml` and change any path that starts with `/data/` to `/config/`. `tls.cache_dir` is always one of them (written as `/data/certs`): Let's Encrypt (`tls.mode: autocert`) keeps its certificates there, so fix it even if you only turn Let's Encrypt on later.
4. Install this app with **Appdata** pointing at that folder, and add back the variables from step 1.
5. For your books, either change the **Audiobooks** entry's container path to `/library` (where the old container mounted them), or keep `/audiobooks` and change the library's folder to `/audiobooks` in the admin console.

Your users, progress and settings carry over.
