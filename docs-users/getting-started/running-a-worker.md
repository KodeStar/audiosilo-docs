---
title: Run speech recognition on another computer
description: "Speed up the Bridge's transcription with a worker on a faster computer, such as a Mac with Apple Silicon, installed with one command."
---

Before the Bridge can [generate characters and recaps](../admin/generating-characters-and-recaps.md),
find chapters or make a read-along, it transcribes the book's audio (speech
recognition). In its container that runs on the processor, which is slow: hours
for a long book on a typical NAS.

A **worker** does the transcribing on another, faster computer instead:

- a **Mac with Apple Silicon** (M1 or later), which uses the Mac's graphics chip.
  On a Mac Studio an 11-hour book took about 37 minutes;
- a **Linux computer with an NVIDIA graphics card**.

The worker is a small program. It connects to the Bridge over your local network,
gets the audio a piece at a time, and sends the text back. It needs no access to
your library. While a worker is connected, all transcribing goes to it.

A worker works for **one Bridge**, and a computer runs one worker.

:::info[Bridge in Docker on a Mac?]
Docker on macOS can't use the Mac's graphics chip, so the Bridge's own
transcription is slow there. Run a worker on the same Mac to get the fast speech
recognition.
:::

## What you need

- A [Bridge](running-a-bridge.md) running in Docker and paired. The worker
  computer downloads the worker program from it. (A Bridge run outside Docker:
  see [Installing it by hand](#installing-it-by-hand).)
- The worker computer on the **same local network** as the Bridge, running macOS
  or Linux. It won't connect over the internet or a VPN like Tailscale.
- On a Mac: **Python 3** and **ffmpeg**, for example `brew install python ffmpeg`.
  The first start downloads the speech model (about 1.6 GB) and takes a few
  minutes.
- On Linux: nothing more.

## 1. Add the worker on the Bridge's page

1. Open the Bridge's page (`http://<your machine>:8091`) and the **Workers** tab.
2. Under **Add a worker**, give it a name, such as the computer's, and press
   **Add worker**.
3. The page shows a command with the worker's **token**. Press **Copy** before
   you press **Done**: the token is shown only once.

The command uses the Bridge's **public address** from its Settings. If the page
says it is open at a local-only address like `localhost`, set the public address
first.

## 2. Paste it on the worker computer

Open a terminal on the worker computer (on a Mac, the Terminal app) and paste the
command. It looks like this:

```bash
curl -fsSL http://192.168.1.20:8091/worker/install.sh | sh -s -- --token asw_...
```

It downloads the worker from your Bridge, installs it as a service that starts
when you log in, and starts it.

Within a few seconds the worker shows as **Connected** on the Bridge's **Workers**
tab. The console lists it too, under
[Settings > Bridge > Workers](../admin/bridge.md#workers).

- On a Mac, its log is `~/.audiosilo-bridge-worker/worker.log`.
- On Linux, `journalctl --user -u audiosilo-bridge-worker -f` shows its log. To
  keep it running while you are logged out, run `loginctl enable-linger` once.

:::tip[Try it in a terminal first]
Add `--run` at the end of the command to run the worker in that terminal only,
without installing the service. Press Ctrl-C to stop it.
:::

## When the worker is off

When no worker is connected (its computer is asleep, say), the Bridge follows
**When no ASR worker is connected** on its **Settings** tab:

- **Transcribe on the Bridge** (the default): the Bridge carries on itself, more
  slowly. When the worker comes back, the work moves to it.
- **Wait for a worker**: the job waits, shown as **Waiting for an ASR worker**,
  and carries on when a worker connects.

If the worker stops in the middle of a piece, only that piece is done again.

## Updating

After you update the Bridge, paste the command again on the worker computer. The
token is remembered, so you can leave out `--token` and what follows:

```bash
curl -fsSL http://192.168.1.20:8091/worker/install.sh | sh -s
```

The worker and the Bridge must be the same version. A worker that doesn't match
says so in its log and waits.

## Installing it by hand

Install by hand when the Bridge runs outside Docker, or to download the program
yourself:

1. Download the archive for the worker computer from the
   [Bridge's releases on GitHub](https://github.com/KodeStar/audiosilo-bridge/releases),
   for your Bridge's version: `darwin_arm64` for a Mac with Apple Silicon,
   `darwin_amd64` for an Intel Mac, `linux_amd64` or `linux_arm64` for Linux.
2. Unpack it and move the `audiosilo-bridge` program to
   `~/.audiosilo-bridge-worker/bin/`.
3. On a Mac, if you downloaded it in a browser, let macOS open it:

   ```bash
   xattr -d com.apple.quarantine ~/.audiosilo-bridge-worker/bin/audiosilo-bridge
   ```

4. On the **Workers** tab, under **Install it by hand**, copy the install command
   and paste it into a terminal. It looks like:

   ```bash
   ~/.audiosilo-bridge-worker/bin/audiosilo-bridge worker install --bridge http://192.168.1.20:8091 --token asw_...
   ```

To update, replace the program with the new release's and run the same command
again.

## Removing it

- **On the worker computer**, run
  `~/.audiosilo-bridge-worker/bin/audiosilo-bridge worker uninstall`. Then delete
  `~/.audiosilo-bridge-worker`. On a Mac, the speech model is in
  `~/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo`: delete
  it to free about 1.6 GB.
- **On the Bridge**, press **Remove...** on the **Workers** tab. Its token stops
  working at once.

## Troubleshooting

| The message says | What to do |
|---|---|
| *Failed to connect*, *Could not resolve host*, *timed out* or *the download failed* | Check the address in the command is your Bridge's (IP address and port `8091`), the Bridge is running, and both computers are on the same network. |
| *only serves the worker install to its local network* | Run the command from a computer on the same network, not over the internet or a VPN. |
| *--token is required* | Copy the whole command from the **Workers** tab. |
| *this Bridge has no worker downloads* | The Bridge isn't running from its Docker image: [install by hand](#installing-it-by-hand). |
| *a worker runs on macOS or Linux only* | Windows can't run a worker. Use a Mac or a Linux computer. |
| *systemctl --user ...* (Linux) | Log in as that user directly (not through `su` or `sudo`) and paste the command again. |
| *the Bridge refused the token* | The worker was removed on the Bridge. Add it again and paste its new command. |
| *the Bridge speaks another worker protocol* | [Update the worker](#updating) or the Bridge so both match. |
| *mlx-whisper needs ffmpeg on PATH* | Run `brew install ffmpeg`, then paste the command again. |
