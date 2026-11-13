---
title: Install on a Synology NAS
description: "Run AudioSilo on a Synology NAS with Container Manager: create the data folder, set PUID and PGID to your DSM user, and find the first-run password."
---

On a Synology NAS, run AudioSilo as a **Container Manager** project. It's the same image as the [Docker install](./quickstart-docker.md), **`ghcr.io/kodestar/audiosilo-server`**. Most install problems on a NAS are folder permissions, so this page sets those up first.

:::note
These steps are written for Container Manager on DSM 7.2 and haven't been checked on a NAS yet, so a label can differ on yours. AudioSilo needs Docker 20.10.10 or newer. The older **Docker** package on DSM 7.1 may be too old (see [Troubleshooting](../troubleshooting.md#the-container-stops-at-start-up-with-pthread_create-failed)).
:::

## 1. Create the folders

1. Install **Container Manager** from **Package Center**. It creates a shared folder called `docker`.
2. In **File Station**, open `docker` and create a folder `audiosilo`, then a folder `data` inside it.

The data folder is now `/volume1/docker/audiosilo/data`. It holds the database, settings and backups. Your audiobooks stay where they are, for example in a shared folder `/volume1/audiobooks`.

## 2. Pick the user the server runs as

The server runs as the user and group in `PUID` and `PGID`. Use your own DSM user's IDs:

- The first user you create on DSM is usually **1026**, and its group (`users`) is **100**.
- To check, sign in over SSH and run `id yourname`. It prints `uid=` and `gid=`.

No SSH? Start with 1026 and 100. If they're wrong, the container's log names the data folder's owner and the values to set (see [Permission denied](../troubleshooting.md#permission-denied)).

## 3. Give that user access

The user needs **read and write** access to the data folder and **read** access to your audiobooks.

1. Open **Control Panel** > **Shared Folder**.
2. Select `docker` and choose **Edit** > **Permissions**.
3. Pick **Local users** and tick **Read/Write** for your user. Press **Save**.
4. Do the same for your audiobooks shared folder, with **Read only** (or **Read/Write**).

Tick your user, not only a group it belongs to. The container runs with your user's ID and one group, so access through the `administrators` group doesn't reach it.

For a single folder inside a share, use **File Station**: right-click the folder, choose **Properties** > **Permission**, and add your user there.

## 4. Create the project

1. In **Container Manager**, open **Project** and press **Create**.
2. Name it `audiosilo`. For **Path**, choose `docker/audiosilo`.
3. For **Source**, choose **Create docker-compose.yml** and paste:

   ```yaml
   services:
     audiosilo:
       image: ghcr.io/kodestar/audiosilo-server:latest
       restart: unless-stopped
       ports:
         - "8080:8080"
       volumes:
         - /volume1/docker/audiosilo/data:/data
         - /volume1/audiobooks:/library:ro
       environment:
         PUID: "1026"    # your DSM user's uid
         PGID: "100"     # its gid
   ```

4. Change `/volume1/audiobooks` to your books folder, and `1026` / `100` to your IDs.
5. Press **Next** through the remaining pages, leaving the web portal off, then **Done**. The project starts.

If another app already uses port 8080, change the left-hand number, for example `"8090:8080"`.

## 5. Save your password

On the very first start, the log shows the admin password and an auth code **once**. In **Container Manager**, open **Container**, select the AudioSilo container and choose **Details**, then the **Log** tab:

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

If the log starts with `audiosilo: WARNING: the server can't write to /data` or `can't read /library`, fix the folder it names first. See [Permission denied](../troubleshooting.md#permission-denied).

## 6. Open it and add your books

1. Browse to `http://your-nas:8080/admin` and sign in as `admin` with the printed password.
2. **Set up your server** opens. For the books folder, type **`/library`** (the path inside the container, not `/volume1/...`) and press **Check folder**.
3. Follow the remaining steps, or skip any of them.

[Set up your server](./first-run.md#set-up-your-server) walks through every step. Then [get the apps](../listening/mobile-apps.md) and [connect a phone or browser](../listening/connecting.md).

## Update

In **Container Manager**, stop the `audiosilo` project, get the newest `ghcr.io/kodestar/audiosilo-server:latest` image, and start the project again. Over SSH, `cd /volume1/docker/audiosilo` and run `sudo docker compose pull && sudo docker compose up -d`. Your books are never changed. When an update changes the database, the server first saves a [backup](../admin/backups.md#before-an-upgrade) of it.

## Good to know

- **Backups** go to `backups` inside the data folder, so they need nothing more. To keep them on another volume, see [Backups](../admin/backups.md#a-backups-folder-on-another-disk).
- **No File Station access to fix it?** Over SSH, `sudo chown -R 1026:100 /volume1/docker/audiosilo/data` gives the data folder to user 1026, and `sudo chmod -R a+rX /volume1/audiobooks` lets every user read the books. Use your own IDs and paths.
- **HTTPS and access from outside** work as on any Docker host. See [Reach your server from outside your home](./remote-access.md).
