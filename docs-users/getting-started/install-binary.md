---
title: Install without Docker
description: "Run AudioSilo as a single program on Linux, macOS or Windows, from a terminal or as a system service."
---

AudioSilo also ships as one self-contained program for Linux, macOS and Windows. It suits a desktop machine or a small home server without Docker. The web player is built in.

:::tip
For an always-on, multi-user or reverse-proxied setup, [Docker](./quickstart-docker.md) is the recommended path.
:::

## Download a release

Download your system's file from [GitHub releases](https://github.com/KodeStar/audiosilo-server/releases):

- a `.tar.gz` for Linux or macOS, or a `.zip` for Windows (`amd64` or `arm64`);
- or a `.deb` or `.rpm` package for Linux, which also sets up a system service (see [below](#linux-packages-and-systemd)).

`checksums.txt` lets you verify the download. Unpack the archive and you have one program, `audiosilo`.

## Run it from a terminal

```bash
./audiosilo --data ./data
```

1. The first start prints the admin password and an auth code **once**. Save them.
2. Open `https://localhost:8080/admin`. Expect a certificate warning at first; accept it.
3. Sign in as `admin`. The console walks you through [setting up your server](./first-run.md).

To choose the admin password in your browser instead, start with `--setup`. The server then prints a one-time link to a page where you create the admin account:

```bash
./audiosilo --data ./data --setup
```

Useful options:

| Option | What it does |
| --- | --- |
| `--data <dir>` | Where settings, the database and certificates live (default `./data`). |
| `--setup` | On first run, choose the admin password in the browser. |
| `--ffmpeg <path>` | Path to ffmpeg; `""` turns off converting audio. |
| `--ffprobe <path>` | Path to ffprobe; `""` turns off reading durations and chapters. |

## Linux packages and systemd

The `.deb` and `.rpm` packages install `audiosilo`, pull in your system's `ffmpeg`, and add a systemd service. Create the service's user and data folder once, then start it:

```bash
sudo useradd --system --home /var/lib/audiosilo --shell /usr/sbin/nologin audiosilo
sudo install -d -o audiosilo -g audiosilo /var/lib/audiosilo
sudo systemctl enable --now audiosilo
```

The first-run password appears in the service's log:

```bash
journalctl -u audiosilo
```

## Update

1. Download the new release from [GitHub releases](https://github.com/KodeStar/audiosilo-server/releases).
2. Stop the server.
3. Replace the old `audiosilo` program with the new one. With a package, install the new `.deb` or `.rpm` with your package manager instead.
4. Start the server again, with the same `--data` folder. For the service, run `sudo systemctl restart audiosilo`.

Your data folder and your books are not changed. When an update changes the database, the server first saves a [backup](../admin/backups.md#before-an-upgrade) of it. **Server > About** in the admin console tells you when a new version is out.

## ffmpeg and ffprobe

AudioSilo uses ffprobe to read durations and chapters, and ffmpeg to convert audio a browser can't play. They are not in the download, but you usually have nothing to do:

1. The server looks for them next to `audiosilo`, then on your `PATH`.
2. If it finds neither, it downloads a trusted copy **once** into `tools/` in your data folder.
3. If that can't happen (offline, say), the server still runs without durations, chapters or converting. It tries again at the next start.

**FFmpeg 7.1 or 8.1 makes first scans much faster.** With those versions the server reads most files itself instead of running ffprobe on each one. The copy the server downloads for Linux and Windows is 8.1. Run `ffprobe -version` to see which you have.

## Good to know

### Building from source

With Go 1.26 or newer and Node 24:

```bash
git clone https://github.com/KodeStar/audiosilo-server.git
cd audiosilo-server
scripts/build-admin.sh        # builds the admin console so it's included
go build -o audiosilo ./cmd/audiosilo
```

A source build does not include the web player, so `/web` stays off. The release downloads and the Docker image include it. See the [developer docs](/developers/server/web-ui) for bundling it.

### Licence

AudioSilo is licensed under **AGPL-3.0**. The Linux downloads also contain the GNU C Library (**LGPL-2.1-or-later**). Each archive includes `LICENSE` and `NOTICE`; the packages install `NOTICE` under `/usr/share/doc/audiosilo/`.
