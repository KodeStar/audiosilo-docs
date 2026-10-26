---
title: Running an ASR worker
description: "Speed up the Bridge's transcription with a worker on a faster computer (a Mac with Apple Silicon, or a PC with an NVIDIA GPU): add it on the Bridge's Workers tab, paste one command, what happens when it is off, updating, installing by hand and removing it."
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

A worker works for **one Bridge**, and a computer runs one worker. If you have two
Bridges, each needs a worker of its own on a different computer: installing a
second Bridge's worker on the same computer replaces the first.

:::info[Docker on a Mac can't use the graphics chip]
If your Bridge runs in Docker on a Mac, its own transcription runs on the processor
only, because Docker on macOS can't reach the graphics chip. Run a worker on the
same Mac to get the fast speech recognition.
:::

### What you need

- A [Bridge](running-a-bridge.md) that is running in Docker and paired: the
  worker's computer downloads the worker program from it, so there is nothing to
  find or build. A Bridge run outside Docker can't serve it: see
  [Installing it by hand](#installing-it-by-hand). The one-line install and the
  downloads on GitHub came after Bridge 0.3.1: with 0.3.1 or earlier, update the
  Bridge first.
- The worker's computer on the **same local network** as the Bridge, running
  macOS or Linux. Like the Bridge's page, the worker's connection (and its
  download) is refused from the internet and over a VPN address like Tailscale's.
- On a Mac: **Python 3** and **ffmpeg**, for example from Homebrew
  (`brew install python ffmpeg`). The first start builds the speech recognition
  and downloads its model (about 1.6 GB), which takes a few minutes.
- On Linux: nothing more (the command uses `curl` and `gzip`, which nearly every
  Linux has). The worker downloads a speech recognition build for your computer
  (the GPU one when it finds an NVIDIA driver) and its model.

### 1. Add the worker on the Bridge's page

1. Open the Bridge's page (`http://<your machine>:8091`) and the **Workers** tab.
2. Under **Add a worker**, give it a name (the computer it runs on, say) and press
   **Add worker**.
3. The page shows a command with the worker's **token**. The token is shown only
   this once: press **Copy** before you press **Done**. If you lose it, remove the
   worker and add it again.

The command uses the Bridge's **public address** from its Settings, else the
address you opened the page at. The worker downloads its program from that address
and connects to it. If the page says it is open at a local-only address (like
`localhost`), set the public address first, or put the Bridge's network address
into the command yourself. A worker on the same computer as the Bridge can use
`localhost`. If you reach the page through a reverse proxy anyway (it isn't
advised, and the proxy must itself only accept connections from your local
network: see [Open the Bridge's page](running-a-bridge.md#3-open-the-bridges-page)),
set the public address to the proxy's full address, path included (like
`https://nas.example/bridge`), and the worker goes through the proxy too. The
proxy must pass on the address the worker's computer asked for (on nginx,
`proxy_set_header Host $host;`), or the worker gets the proxy's own address for
the Bridge instead, which it may not reach.

If **Copy** can't reach the clipboard (some browsers refuse on a plain `http://`
page), the page selects the command and says so: copy it with Cmd-C on a Mac
(Ctrl-C on Windows or Linux).

### 2. Paste it on the worker's computer

:::tip[Try it in a terminal first]
Add `--run` at the end of the command to run the worker in that terminal instead
of installing the service. It downloads the program the same way, then works until
you press Ctrl-C or close the terminal. Paste the command again without `--run`
to install the service. A `--run` start doesn't save the token, so keep `--token`
in the command each time you run it that way. On a computer where the service is
already installed, a `--run` start replaces the service's program too, but the
service goes on with the old one until it restarts: the command says so and
prints the line that restarts it (or paste the command again without `--run`).
:::

Open a terminal on the worker's computer (on a Mac, the Terminal app) and paste the
command:

```bash
curl -fsSL http://192.168.1.20:8091/worker/install.sh | sh -s -- --token asw_...
```

It:

1. downloads the worker program for that computer (macOS or Linux, Apple Silicon,
   Intel or ARM) **from your Bridge**, the same version as the Bridge;
2. puts it in `.audiosilo-bridge-worker/bin` in your home folder and says where;
3. installs the worker as a service that starts when you log in and restarts
   itself if it stops (a launch agent on a Mac, a systemd user service on Linux),
   and starts it now.

Within a few seconds the worker shows as **Connected** on the Bridge's **Workers**
tab, with the speech recognition it runs (for example *mlx-whisper on metal*). The
server's console lists it too, under
[Settings > Bridge > Workers](../admin/bridge.md#workers). While it transcribes it
says **Transcribing**, and the tab counts the pieces it finished, how much audio and
how fast.

The token is kept in the worker's own folder (`~/.audiosilo-bridge-worker`),
readable only by you.

- On a Mac its log is `~/.audiosilo-bridge-worker/worker.log`.
- On Linux, `journalctl --user -u audiosilo-bridge-worker -f` shows its log. To
  keep it running while you are logged out, run `loginctl enable-linger` once.

The worker program isn't signed by Apple, but macOS runs it without asking: a file
`curl` downloads isn't marked as downloaded from the internet.

The command also takes `--dir <folder>` (put the program somewhere else; see
[Updating](#updating)) and `--help`. The program isn't on your `PATH`, so the
commands on this page use its full path,
`~/.audiosilo-bridge-worker/bin/audiosilo-bridge`; the command prints the line to
add to your shell's profile if you'd rather type `audiosilo-bridge`.

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

### Updating

After you update the Bridge, update its worker the same way you installed it:
paste the command again on the worker's computer. The token is remembered, so you
can leave out `--token` and what follows it:

```bash
curl -fsSL http://192.168.1.20:8091/worker/install.sh | sh -s
```

It downloads the Bridge's new version over the old one and restarts the service.
It updates the program in the folder the service runs it from (so a worker
installed with `--dir` updates in place) and says which folder that is; if that
folder is gone or it can't write there, it uses the default folder and the
service runs it from there. Add `--dir` to put it somewhere else.

An update keeps the settings the service was installed with: a worker
[installed by hand](#installing-it-by-hand) with its own data folder (`--data`)
or speech recognition (`--backend`, `--model`, `--whisper-cli`) keeps them, and
the update says which ones it kept (the data folder is always among them). The
token stays saved in the service's data folder. To change a setting, run
`worker install` by hand with the new value: a flag you give always wins, and
one you leave out (`--bridge` included) stays as it was. To clear one, give it
empty (like `--model ''`), or `--backend auto`. A new `--data` folder has no
saved token yet, so give `--token` with it. If the service's settings can't be
read, the update says so and the worker goes back to the defaults, the default
data folder included: when it had its own, add `--token` to the command.

The Bridge and its workers must speak the same version of the worker protocol: a
worker that is too old or too new for its Bridge says so in its log and waits
until both match.

### Installing it by hand

Install the worker by hand when the Bridge runs outside Docker (the **Workers**
tab then opens **Install it by hand**), or when you'd rather download the program
yourself:

1. Download the archive for the worker's computer from the
   [Bridge's releases on GitHub](https://github.com/KodeStar/audiosilo-bridge/releases).
   Take the release that matches your Bridge's version (its **Status** tab shows
   it). The archives are named for the computer they run on:
   `audiosilo-bridge_<version>_darwin_arm64.tar.gz` for a Mac with Apple Silicon,
   `darwin_amd64` for an Intel Mac, `linux_amd64` and `linux_arm64` for Linux.
   `checksums.txt` beside them lets you check the download.
2. Unpack it and move the `audiosilo-bridge` program inside to
   `~/.audiosilo-bridge-worker/bin/` (or anywhere it can stay).
3. **On a Mac, if you downloaded it in a browser**, macOS marks the program as
   downloaded from the internet and refuses to open it, because it isn't signed by
   Apple. Clear the mark once:

   ```bash
   xattr -d com.apple.quarantine ~/.audiosilo-bridge-worker/bin/audiosilo-bridge
   ```

   (An archive downloaded with `curl -fLO` carries no mark.)
4. Under **Install it by hand** on the **Workers** tab, copy the install command
   (or the one that runs the worker once in a terminal) and paste it into a
   terminal. It looks like:

   ```bash
   ~/.audiosilo-bridge-worker/bin/audiosilo-bridge worker install --bridge http://192.168.1.20:8091 --token asw_...
   ```

   If you put the program somewhere else, change the start of the command to
   match.

To update a worker installed by hand, replace the program with the new release's
and run the same `worker install` command again (the token and the service's
other settings are remembered, so `--token` can be left out: see
[Updating](#updating)).

### Removing it

- **To stop and remove** it on its computer:
  `~/.audiosilo-bridge-worker/bin/audiosilo-bridge worker uninstall` (use the
  program's own path if you put it elsewhere). This removes the service. The
  worker's folder stays: delete `~/.audiosilo-bridge-worker` too to remove the
  program, its saved token and the speech recognition (on Linux, its model as
  well). On a Mac the speech model (about 1.6 GB) is kept in Hugging Face's
  cache, `~/.cache/huggingface`, which other programs may share: delete
  `~/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo` to
  free the space.
- **To revoke** it on the Bridge: **Remove...** on the **Workers** tab. Its token
  stops working at once, and the piece it was on goes to another worker or the
  Bridge.

### Troubleshooting

When the command can't install the worker, it stops and says why on the terminal.
A message that starts with `curl:` comes from fetching the command itself.

| What the command says | What to do |
|---|---|
| *curl: (7) Failed to connect*, *Could not resolve host* or *timed out* | The address in the command doesn't reach the Bridge. Check that it is your Bridge's (its IP address and port, `8091`), that the Bridge is running, and that this computer is on the same network. |
| *this Bridge only serves the worker install to its local network* | The Bridge refused this computer: it answers only its local network. Run the command from a computer on the same network, not over the internet or a VPN address like Tailscale's. |
| *--token is required* | The first install needs the token: copy the whole command from the **Workers** tab. Only an update of a worker installed as a service on this computer can leave it out (a `--run` start doesn't save it). |
| *this Bridge has no worker downloads* | The Bridge isn't running from its Docker image. [Install the worker by hand](#installing-it-by-hand) from the GitHub release. |
| *the download failed* | Check that the address in the command is your Bridge's (its IP address and port, `8091`), that the Bridge is running, and that this computer is on the same network. |
| *the address this was fetched from isn't a plain host name or IP address* | Use the command as the **Workers** tab shows it, with the Bridge's IP address and port. |
| *a worker runs on macOS or Linux only*, or *on arm64 or amd64 only* | This computer can't run a worker (Windows has none). Use a Mac or a Linux computer. |
| *the download is damaged*, or *the downloaded program doesn't run on this computer* | Paste the command again. If it keeps failing, install by hand from the GitHub release. |
| *curl is needed* or *gzip is needed* | Install it with your system's package manager, then paste the command again. |
| *systemctl --user ...* (Linux) | The service needs your own login session. Log in as that user directly (at the computer or over SSH, not through `su` or `sudo`) and paste the command again, or add `--run` to run the worker in the terminal instead. |
| *launchctl bootstrap ...* (Mac) | macOS was still stopping the previous worker. Wait a moment and paste the command again. |

| What the worker's log says | What to do |
|---|---|
| *the Bridge refused the token* | The worker was removed on the Bridge's page, or the token is from another Bridge. Add it again and paste its new command. |
| *the Bridge speaks another worker protocol* | The worker and the Bridge are different versions: [update the worker](#updating) (or the Bridge) so both match. |
| *can't reach the Bridge* | Check the Bridge's address in the command, that the Bridge is running, and that both computers are on the same network. |
| *mlx-whisper needs ffmpeg on PATH* | Install ffmpeg (`brew install ffmpeg`) and paste the command again, so the service sees it. |
