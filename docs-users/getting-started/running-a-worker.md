---
title: Running an ASR worker
description: "Speed up the Bridge's transcription with a worker on a faster computer (a Mac with Apple Silicon, or a PC with an NVIDIA GPU): add it on the Bridge's page, install it as a service, what happens when it is off, and how to remove it."
---

## Running an ASR worker

Before the Bridge can [generate characters and recaps](../admin/generating-characters-and-recaps.md)
from a book's audio, it transcribes the whole book (speech recognition, or ASR). In
its container that runs on the processor, which is slow: hours for a long book on a
typical NAS. An **ASR worker** does the transcribing on another computer instead,
one with fast speech recognition:

- a **Mac with Apple Silicon** (M1 or later), which uses the Mac's graphics chip.
  On a Mac Studio an 11-hour book took about 37 minutes, about 18 times faster
  than real time;
- a **Linux computer with an NVIDIA graphics card**.

The worker is a small program on that computer. It connects to the Bridge over your
local network, takes the audio a piece at a time (a chapter, say), transcribes it
and sends the text back. It needs no access to your library and no folders set up:
the Bridge sends it the audio. While a worker is connected, every book's
transcription goes to it; the rest of the work stays on the Bridge.

:::info Docker on a Mac can't use the graphics chip
If your Bridge runs in Docker on a Mac, its own transcription runs on the processor
only, because Docker on macOS can't reach the graphics chip. Run a worker on the
same Mac to get the fast speech recognition.
:::

### What you need

- A [Bridge](running-a-bridge.md) that is running and paired.
- The worker's computer on the **same local network** as the Bridge. Like the
  Bridge's page, the worker's connection is refused from the internet and over a
  VPN address like Tailscale's.
- The `audiosilo-bridge` program for the worker's computer (macOS or Linux). The
  Bridge is still in early access, so you build it from its repository for now:
  `go build -o audiosilo-bridge ./cmd/audiosilo-bridge` (Go 1.26), then put it
  somewhere it can stay, such as `/usr/local/bin`.
- On a Mac: **Python 3** and **ffmpeg**, for example from Homebrew
  (`brew install python ffmpeg`). The first start builds the speech recognition
  and downloads its model (about 1.6 GB), which takes a few minutes.
- On Linux: nothing more. The worker downloads a speech recognition build for
  your computer (the GPU one when it finds an NVIDIA driver) and its model.

### 1. Add the worker on the Bridge's page

1. Open the Bridge's page (`http://<your machine>:8091`) and the **Workers** tab.
2. Under **Add a worker**, give it a name (the computer it runs on, say) and press
   **Add worker**.
3. The page shows two commands with the worker's **token**. The token is shown only
   this once: copy a command before you press **Done**. If you lose it, remove the
   worker and add it again.

The commands use the Bridge's **public address** from its Settings. If the page
says it is open at a local-only address (like `localhost`), set the public address
first, or put the Bridge's network address into the command yourself. A worker on
the same computer as the Bridge can use `localhost`.

### 2. Install it on the worker's computer

Paste the first command into a terminal on the worker's computer:

```bash
audiosilo-bridge worker install --bridge http://192.168.1.20:8091 --token asw_...
```

It installs the worker as a service that starts when you log in and restarts
itself if it stops (a launch agent on a Mac, a systemd user service on Linux), and
starts it now. The token is kept in the worker's own folder
(`~/.audiosilo-bridge-worker`), readable only by you.

- On a Mac its log is `~/.audiosilo-bridge-worker/worker.log`.
- On Linux, `journalctl --user -u audiosilo-bridge-worker -f` shows its log. To
  keep it running while you are logged out, run `loginctl enable-linger` once.

To try it first without installing anything, use the second command instead: it
runs the worker in that terminal until you press Ctrl-C.

Within a few seconds the worker shows as **Connected** on the Bridge's **Workers**
tab, with the speech recognition it runs (for example *mlx-whisper on metal*). The
server's console lists it too, under
[Settings > Bridge > Workers](../admin/bridge.md#workers). While it transcribes it
says **Transcribing**, and the tab counts the pieces it finished, how much audio and
how fast.

### When the worker is off

When no worker is connected (the computer is asleep or off, or the worker was
stopped), the Bridge does what its **When no ASR worker is connected** setting
says, on its **Settings** tab:

- **Transcribe on the Bridge** (the default): the Bridge goes on with its own,
  slower speech recognition. When a worker connects again, the piece the Bridge is
  on moves to the worker, and the rest follows.
- **Wait for a worker**: the book waits. Its job shows **Waiting for an ASR
  worker** in the console (no notification is sent for it: it ends by itself), and
  it carries on by itself as soon as a worker connects. Choose this when the
  Bridge's own speech recognition would take too long.

If the worker stops in the middle of a piece (its computer sleeps, say), nothing
is lost but that piece: about a minute later it is handed out again, to the worker
when it comes back or to the Bridge. A worker that restarts carries on with the
piece it was on.

### Updating and removing

- **To update** the worker, replace the program and run the same
  `worker install` command again (the token is remembered, so `--token` can be
  left out). The Bridge and its workers must be the same version of the worker
  protocol: a worker that is too old or too new for its Bridge says so in its log
  and waits until both are updated.
- **To stop and remove** it on its computer: `audiosilo-bridge worker uninstall`.
  The worker's folder stays (delete `~/.audiosilo-bridge-worker` too, if you like).
- **To revoke** it on the Bridge: **Remove...** on the **Workers** tab. Its token
  stops working at once, and the piece it was on goes to another worker or the
  Bridge.

### Troubleshooting

| What the worker's log says | What to do |
|---|---|
| *the Bridge refused the token* | The worker was removed on the Bridge's page, or the token is from another Bridge. Add it again and run `worker install` with the new token. |
| *the Bridge speaks another worker protocol* | Update the worker or the Bridge so both are the same version. |
| *can't reach the Bridge* | Check the address in the command (`--bridge`), that the Bridge is running, and that both computers are on the same network. |
| *mlx-whisper needs ffmpeg on PATH* | Install ffmpeg (`brew install ffmpeg`) and run `worker install` again, so the service sees it. |
