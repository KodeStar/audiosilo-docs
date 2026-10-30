---
title: Install the native binary
description: "Run AudioSilo without Docker: download a self-contained release, let it find or fetch ffmpeg, and start it from a terminal or as a system service."
---

## Install the native binary

If you'd rather not use Docker - say, on a desktop machine or a small home server - AudioSilo ships as a single self-contained program for Linux, macOS and Windows.

### Download a release

Releases are published on GitHub: [github.com/KodeStar/audiosilo-server/releases](https://github.com/KodeStar/audiosilo-server/releases).

Each release includes:

- `audiosilo_<version>_<os>_<arch>.tar.gz` for Linux and macOS, and a `.zip` for Windows (both `amd64` and `arm64`).
- `.deb` and `.rpm` packages for Linux, which also install a systemd service (see below).
- `checksums.txt`, so you can verify your download.

Unpack the archive and you have one executable, `audiosilo`. **The web player is built into the release binary**, so `/web` works out of the box - no extra downloads or configuration.

### ffmpeg and ffprobe

AudioSilo uses ffmpeg/ffprobe for durations, chapter extraction and on-the-fly transcoding. They are **not** bundled in the download (they're large and most machines already have them). Instead, the server sorts this out itself on startup:

1. It first looks for `ffmpeg`/`ffprobe` next to the `audiosilo` executable, then on your `PATH`.
2. If neither is found, it downloads a trusted static build **once** into `tools/` inside your data directory (over HTTPS, and checked by running it before use) and reuses it from then on.
3. If you're offline or on a platform with no static build available, the server still runs - you just lose durations/chapters and transcoding until a tool is available. It retries on the next start.

In short: on the common path there is nothing to install, and if the download can't happen, nothing breaks.

**For faster first scans, use FFmpeg 7.1 or 8.1** (from 2.5.1). With one of those versions the server reads most files' lengths and chapters itself, without starting ffprobe for each one, and asks ffprobe only about the files it can't be sure of. With any other version (for example Ubuntu 24.04's 6.1), every file is read by ffprobe, which works but makes the first scan of a big library much slower. The copy the server downloads for Linux and Windows is FFmpeg 8.1, so it gets the speedup. A copy downloaded before 2.5.1 (a development build, with no speedup) is replaced in the background, and the server uses the 8.1 build from its next start. You can also install a 7.1 or 8.1 package and restart the server, which then finds it first. At start, the server's log says whether the faster reading is on ("in-process probe on") or off. Run `ffprobe -version` to see which you have. ffprobe is still needed either way.

### Run it from a terminal

```bash
./audiosilo --data ./data
```

The very first start creates an admin account and prints the credentials **once** - save them. Then open `https://localhost:8080` (the default is HTTPS with a self-signed certificate, so expect a browser warning). Sign in to the admin console at `/admin` and it walks you through setting up the server. See [First run](./first-run.md) for the full walkthrough.

Prefer to choose the admin password in the browser instead of a printed one? Start with `--setup`:

```bash
./audiosilo --data ./data --setup
```

Instead of creating an admin for you, the server prints a one-time link to a page where you choose the admin username and password. Either way, the admin console then walks you through the rest - your books folder, how books are named, connecting a phone - the first time you sign in. Details in [First run](./first-run.md).

Useful flags:

| Flag | What it does |
| --- | --- |
| `--data <dir>` | Where config, database and certificates live (default `./data`). |
| `--setup` | First run prints a one-time link to choose the admin password in the browser, instead of printing generated credentials. |
| `--ffmpeg <path>` | Explicit path to ffmpeg; `""` disables transcoding and the MP3 copies of `.mka` books. |
| `--ffprobe <path>` | Explicit path to ffprobe; `""` disables duration/chapter extraction (the server then reads none itself either). |

### Linux packages and systemd

The `.deb`/`.rpm` packages install the binary to `/usr/bin/audiosilo`, pull in your distribution's `ffmpeg`, and place a systemd unit. The package deliberately doesn't create a system user for you; do that once, then enable the service:

```bash
sudo useradd --system --home /var/lib/audiosilo --shell /usr/sbin/nologin audiosilo
sudo install -d -o audiosilo -g audiosilo /var/lib/audiosilo
sudo systemctl enable --now audiosilo
```

The service runs with its data directory at `/var/lib/audiosilo`, so the first-run credentials appear in its logs:

```bash
journalctl -u audiosilo
```

### Building from source

If you have Go 1.26 or newer and Node 24 installed, you can build the server yourself:

```bash
git clone https://github.com/KodeStar/audiosilo-server.git
cd audiosilo-server
scripts/build-admin.sh        # builds the admin console so it's included
go build -o audiosilo ./cmd/audiosilo
```

:::note
Skip `scripts/build-admin.sh` and `/admin` shows a short "admin console isn't built" page instead of the console. A plain source build also does not include the embedded web player - the admin console and the API work as normal, but `/web` stays off unless you point the server at a built player. The release downloads and the Docker image both include the player, so for everyday use prefer those. How the player gets bundled is covered in the [developer docs](/developers/server/web-ui).
:::

:::tip
Running an always-on, multi-user or reverse-proxied setup? [Docker](./quickstart-docker.md) is the recommended path there - the native binary is aimed at home users who want one download and no container runtime.
:::
