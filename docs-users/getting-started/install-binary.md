---
title: Install the native binary
description: "Run AudioSilo without Docker: download a self-contained release, let it find or fetch ffmpeg, and start it from a terminal or as a system service."
---

## Install the native binary

If you'd rather not use Docker — say, on a desktop machine or a small home server — AudioSilo ships as a single self-contained program for Linux, macOS and Windows.

### Download a release

Releases are published on GitHub: [github.com/KodeStar/audiosilo-server/releases](https://github.com/KodeStar/audiosilo-server/releases).

Each release includes:

- `audiosilo_<version>_<os>_<arch>.tar.gz` for Linux and macOS, and a `.zip` for Windows (both `amd64` and `arm64`).
- `.deb` and `.rpm` packages for Linux, which also install a systemd service (see below).
- `checksums.txt`, so you can verify your download.

Unpack the archive and you have one executable, `audiosilo`. **The web player is built into the release binary**, so `/web` works out of the box — no extra downloads or configuration.

### ffmpeg and ffprobe

AudioSilo uses ffmpeg/ffprobe for durations, chapter extraction and on-the-fly transcoding. They are **not** bundled in the download (they're large and most machines already have them). Instead, the server sorts this out itself on startup:

1. It first looks for `ffmpeg`/`ffprobe` next to the `audiosilo` executable, then on your `PATH`.
2. If neither is found, it downloads a trusted static build **once** into `tools/` inside your data directory (over HTTPS, and checked by running it before use) and reuses it from then on.
3. If you're offline or on a platform with no static build available, the server still runs — you just lose durations/chapters and transcoding until a tool is available. It retries on the next start.

In short: on the common path there is nothing to install, and if the download can't happen, nothing breaks.

### Run it from a terminal

```bash
./audiosilo --data ./data
```

The very first start creates an admin account and prints the credentials **once** — save them. Then open `https://localhost:8080` (the default is HTTPS with a self-signed certificate, so expect a browser warning). See [First run](./first-run.md) for the full walkthrough.

Prefer a guided setup in the browser instead of a printed password? Start with the setup wizard:

```bash
./audiosilo --data ./data --setup
```

Instead of creating an admin for you, the server prints a one-time link to a browser wizard where you choose the admin password and point it at your books folder. Details in [First run](./first-run.md).

Useful flags:

| Flag | What it does |
| --- | --- |
| `--data <dir>` | Where config, database and certificates live (default `./data`). |
| `--setup` | First run opens a browser setup wizard instead of printing generated credentials. |
| `--ffmpeg <path>` | Explicit path to ffmpeg; `""` disables transcoding. |
| `--ffprobe <path>` | Explicit path to ffprobe; `""` disables duration/chapter extraction. |

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

If you have Go 1.25 or newer installed, you can build the server yourself:

```bash
git clone https://github.com/KodeStar/audiosilo-server.git
cd audiosilo-server
go build -o audiosilo ./cmd/audiosilo
```

:::note
A plain source build does not include the embedded web player — the admin console and the API work as normal, but `/web` stays off unless you point the server at a built player. The release downloads and the Docker image both include the player, so for everyday use prefer those. How the player gets bundled is covered in the [developer docs](/developers/server/web-ui).
:::

:::tip
Running an always-on, multi-user or reverse-proxied setup? [Docker](./quickstart-docker.md) is the recommended path there — the native binary is aimed at home users who want one download and no container runtime.
:::
