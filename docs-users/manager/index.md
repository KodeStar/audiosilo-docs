---
title: "The desktop manager"
description: "What the AudioSilo desktop manager is, when you need it, and how to get it running on your computer."
---

## What the manager is

AudioSilo Manager is a desktop app for your Mac, Windows, or Linux computer. It is
the **management side** of AudioSilo: while the server and the player apps are
deliberately **read-only** — nothing you do in the player can add, move, or delete
audio files — the manager is how books get **onto** a server in the first place.

With it you can:

- **Set up a server** if you don't have one yet — run one on your own computer
  (optionally reachable from anywhere via a free Cloudflare Tunnel), install one on
  a Linux machine or Unraid box you already run, or provision a small cloud server.
  See [Managing servers](servers.md).
- **Connect to and manage several servers**, each with several libraries.
- **Organize and import books**: pick a folder of audiobooks (or drag files onto
  the window), let the manager suggest tidy folder names that match your library's
  existing conventions, and transfer the files — over SFTP (SSH) for a remote
  server, or a plain copy for a folder on this computer or a mounted share. See
  [Organizing and importing books](organizing.md).
- **Back up your own Audible purchases**: sign in to your Audible account, download
  the books you own, remove Audible's DRM using your own account's keys, and place
  them on your server as ordinary M4B files. See
  [Backing up your Audible library](audible-backup.md).
- **Keep series complete**: find books you're missing from series you own, and
  watch a series so you're told when a new entry appears.

![The manager's main window: a server list in the sidebar and the selected server's detail view](/img/screenshots/manager/servers.png)

## When you need it — and when you don't

You **don't** need the manager to listen: the player apps and the web player only
need a running server ([Connecting](../listening/connecting.md)). You also don't
need it if you're happy managing your audiobook folders by hand — the server just
serves whatever is on disk
([Organizing your library](../getting-started/organizing-your-library.md)).

Reach for the manager when:

- you want a server but don't want to touch Docker or a terminal;
- your server lives on another machine (a NAS, a VPS) and copying files to it is a
  chore;
- you want consistent, series-aware folder naming without doing it manually;
- you want a local, DRM-free backup of audiobooks you bought on Audible.

:::info The server stays read-only
The manager never uploads through the server. Files are placed directly — over SSH
(SFTP) or into a local/mounted folder — and the server is then asked to rescan.
That's a deliberate design choice: a server that is safe to expose to the internet
has no upload endpoint to attack.
:::

## Platforms

The manager is a native desktop app for **macOS, Windows, and Linux**.

## Getting it today

:::note Installers are planned
Ready-made installers (a signed `.dmg`, Windows installer, and Linux packages) are
planned but not shipped yet. Today the manager is **built from source** — this is
the one part of AudioSilo that currently needs developer tools installed.
:::

You'll need:

- **Go 1.25 or newer** — [go.dev/dl](https://go.dev/dl/)
- **Node.js 24** — [nodejs.org](https://nodejs.org/)
- **The Wails CLI** (the desktop app framework the manager uses), plus its platform
  prerequisites — on macOS the Xcode Command Line Tools, on Linux the WebKitGTK
  packages, on Windows the WebView2 runtime (usually already present). See the
  [Wails installation guide](https://wails.io/docs/gettingstarted/installation)
  for your platform.

Then:

```sh
# 1) Install the Wails CLI (once)
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 2) Check out the manager AND the server, side by side —
#    the manager embeds the server (for the "create a local server" feature),
#    so both folders must exist next to each other
git clone https://github.com/KodeStar/audiosilo-server
git clone https://github.com/KodeStar/audiosilo-manager

# 3) Build
cd audiosilo-manager
wails build
```

The finished app appears in `build/bin/` — on macOS an `.app` you can drag into
Applications, on Windows an `.exe`, on Linux a binary.

:::tip ffmpeg for the Audible backup
The [Audible backup](audible-backup.md) uses **ffmpeg** (version 4.4 or newer) to
remove DRM and produce M4B files. Everything else works without it, so install it
only if you'll use that feature — e.g. `brew install ffmpeg` on macOS, or your
distribution's package on Linux.
:::

## First launch

On first launch you'll see a welcome screen with two buttons:

- **Add a server** — connect to a server you already run. You'll need its address
  and an auth code from its admin console
  ([details](servers.md#adding-a-server-you-already-run)).
- **Create a server** — set one up: on this computer, on a Linux/Unraid machine
  over SSH, or on a cloud VPS ([details](servers.md#creating-a-server)).

After that, your servers live in the left sidebar; selecting one shows its status,
libraries, and management actions. The **Settings** button (top right) holds
app-wide defaults (currently your default SSH key and username, reused whenever the
manager makes an SSH connection). When a newer manager release is published, a
banner appears at the top with a **Download** button.

The manager keeps its own data in your user configuration folder (on macOS
`~/Library/Application Support/audiosilo-manager`, on Linux
`~/.config/audiosilo-manager`, on Windows `%AppData%\audiosilo-manager`).
**Secrets — server session tokens, SSH passwords, Audible credentials — are stored
in your operating system's keychain**, never in plain files.

## Next steps

- [Managing servers](servers.md) — add, create, deploy, and update servers
- [Organizing and importing books](organizing.md) — get books onto a server
- [Backing up your Audible library](audible-backup.md) — preserve your purchases
