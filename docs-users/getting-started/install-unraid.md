---
title: Install on Unraid
description: "Install AudioSilo on Unraid from Community Applications, add your books and keep it updated."
---

On Unraid, install AudioSilo from **Community Applications** (the Apps tab). The app there is the [LinuxServer.io](https://www.linuxserver.io) image, **`lscr.io/linuxserver/audiosilo`**. It holds the same server, web player and ffmpeg as the [Docker install](./quickstart-docker.md), and is rebuilt after every AudioSilo release.

## 1. Install the app

1. Open the **Apps** tab and search for **AudioSilo**.
2. Pick the one from **linuxserver's Repository** and click **Install**.
3. Set **Audiobooks** (`/audiobooks`) to your audiobooks share, for example `/mnt/user/audiobooks`. It is mounted read-only.
4. Leave **WebUI** (the port) at `8080` unless it's taken.
5. Click **Show more settings** and check **Appdata** (`/config`). This is where the database and settings live. A cache or pool path such as `/mnt/cache/appdata/audiosilo` is quickest; the default `/mnt/user/appdata/audiosilo` works too.
6. Leave **PUID / PGID** at `99` and `100`.
7. Click **Apply**.

## 2. Save your password

On the very first start, the log shows the admin password and an auth code **once**. In the **Docker** tab, click the AudioSilo icon and choose **Logs**:

```text
========================================================
 AudioSilo first-run setup - store these now, shown once
========================================================
  Admin username : admin
  Admin password : <generated password>
  Auth code      : <generated code>
  Config file    : /config/config.yaml
```

Save both now. [Set up your server](./first-run.md) says what each is for. If you lose them, see [If you lose the password](./first-run.md#if-you-lose-the-password).

## 3. Open it and add your books

1. Click the AudioSilo icon and choose **WebUI**. Your browser warns about the certificate the first time; accept it.
2. Go to `/admin` and sign in as `admin` with the printed password.
3. **Set up your server** opens. Choose your own username and password, or keep the printed ones.
4. For the books folder, type **`/audiobooks`** (the path inside the container, not the `/mnt/user/...` share) and press **Check folder**.
5. Follow the remaining steps, or skip any of them.

[Set up your server](./first-run.md#set-up-your-server) walks through every step. Then [connect a phone or browser](../listening/connecting.md). The web player is at `/web`.

## Update

Unraid's Docker tab shows **update ready** when a new image is out. Apply it there, or let the CA Auto Update plugin do it. Your books are never changed. When an update changes the database, the server first saves a [backup](../admin/backups.md#before-an-upgrade) of it.

## HTTPS and reverse proxies

The default self-signed certificate is fine at home. To reach AudioSilo from outside, the usual Unraid route is a reverse proxy such as **SWAG** or Nginx Proxy Manager. In the admin console under **Server > Settings**:

1. Point the proxy at `https://<unraid-ip>:8080`. Or set **HTTPS mode** to **Off**, restart the container, and point it at `http://<unraid-ip>:8080`.
2. Set **Public address** to the address your users use, for example `https://books.example.com`.
3. Add the proxy's address to **Trusted proxies**.

With HTTPS off, the Docker tab's **WebUI** link still opens `https://`. To fix it, edit the container, switch to **Advanced View**, and set **WebUI** to `http://[IP]:[PORT:8080]`.

:::warning
Only turn HTTPS off behind a proxy that handles HTTPS. Plain HTTP open to the internet sends passwords unencrypted.
:::

[Reach your server from outside your home](./remote-access.md) has the details, including Let's Encrypt without a proxy.

## Good to know

### Settings as container variables

Most settings can also be set with an `AUDIOSILO_*` variable, such as `AUDIOSILO_PUBLIC_URL`. Add it with **Add another Path, Port, Variable, Label or Device** on the container's edit page. A variable wins over the console, which then shows the setting as locked.

### Appdata on a user share

When appdata is on a user share (`/mnt/user/...`), AudioSilo maps its database into memory, which makes browsing quicker there. It stays off on network storage. To turn it off, add this to `config.yaml` in your appdata folder and restart the container:

```yaml
database:
  mmap: off
```

Or add a container variable `AUDIOSILO_DB_MMAP` with the value `off`.

### Moving from the AudioSilo image

Already running `ghcr.io/kodestar/audiosilo-server` on Unraid? The data is the same. Only the paths inside the container differ: `/config` instead of `/data`, and `/audiobooks` instead of `/library`.

1. Note any `AUDIOSILO_*` variables the old container sets. They don't move on their own. (Skip `AUDIOSILO_WEB_DIR`: this image has the player built in.)
2. Stop and remove the old container. Its data stays in its folder.
3. In that folder, edit `config.yaml` and change every path that starts with `/data/` to `/config/`. `tls.cache_dir` (`/data/certs`) is always one of them.
4. Install this app with **Appdata** pointing at that folder, and add back the variables from step 1.
5. For your books, either set the **Audiobooks** container path to `/library`, or keep `/audiobooks` and change the library's folder to `/audiobooks` in the admin console.

Your users, progress and settings carry over.
