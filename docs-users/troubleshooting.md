---
title: Troubleshooting
description: Fixes for the most common AudioSilo problems, organized by symptom - server, connecting, playback, library, and downloads.
---

Find the symptom that matches what you're seeing. Each entry explains what's
going on and what to do about it. If your problem points at a setting that has
its own page, the entry links there instead of repeating it.

## Server

### I can't reach the server at all

Work through these in order:

1. **Are you using `https://`?** Out of the box the server uses a self-signed
   certificate, which means it speaks **HTTPS** - even on your home network. If
   you open `http://your-server:8080` against an HTTPS server, the connection
   simply fails. Try `https://your-server:8080` instead (and see the
   certificate warning entry below).
2. **Is the port right?** The default listen address is `0.0.0.0:8080`. With
   Docker, check that the port is actually published - the example
   `docker-compose.yml` maps `"8080:8080"`. You can change the address and port
   with the `bind` setting in `config.yaml`.
3. **Is a firewall in the way?** If the server machine runs a firewall, allow
   incoming connections on the port you chose (8080 by default). This is the
   usual culprit when the server works on the machine itself
   (`https://localhost:8080`) but not from your phone.
4. **Reaching it from outside your home?** That needs its own setup - see
   [Remote access](./getting-started/remote-access.md).

### My browser warns about the certificate

That's expected with the default setup. The server generates a **self-signed
certificate** so your connection is encrypted from the very first start - but
browsers can't verify who signed it, so they show a warning.

You have three options:

- **Accept the warning** (usually under "Advanced" → "Proceed"). Fine on your
  own home network; the connection is still encrypted.
- **Switch to automatic real certificates** (`tls.mode: autocert` in
  `config.yaml`) - free Let's Encrypt certificates with no warnings. This needs
  a public domain name pointing at your server, and Let's Encrypt must be able
  to reach it on **port 443** (the server logs a warning if it isn't bound or
  forwarded there).
- **Put a reverse proxy in front** (Caddy, nginx, Traefik) and set
  `tls.mode: off` so the proxy handles HTTPS. Also set `trusted_proxies` so
  rate limiting sees real visitor addresses.

Both public options are covered step by step in
[Remote access](./getting-started/remote-access.md).

### I lost the first-run admin password

The admin password and auth code are printed **exactly once**, in the server's
output on its very first start - the server itself never stores or shows them
again (only a secure hash is kept). In order of least to most drastic:

1. **Check the logs.** The first-run banner is part of the server's log output.
   With Docker, `docker compose logs` often still has it, as long as the
   container hasn't been recreated since first run.
2. **Ask another admin.** Any other admin can set a new password for your
   account in the admin console - see
   [Users & invites](./admin/users-and-invites.md).
3. **Still signed in somewhere?** If you saved the first-run **auth code**, it
   still works (it has no expiry) - it can pair the player app as the admin
   user, so you can keep listening, though it won't open the admin console
   (that needs the password). The exception: minting a fresh invite for the
   admin account retires the first-run code, like any older invite (see
   [one active invite per user](./admin/users-and-invites.md#one-active-invite-per-user)).
4. **Last resort: reset the database.** Stop the server, move the database
   files (`audiosilo.db`, plus any `audiosilo.db-wal` / `audiosilo.db-shm`) out
   of the data directory, and start it again. The server treats this as a
   fresh install and prints a brand-new admin password and auth code.

:::warning
Resetting the database is safe for your **audiobooks** - files on disk are
never touched, and the book index rebuilds automatically. But it erases all
**accounts, listening progress, bookmarks, notes, shares, and folder
overrides**. Move the database files aside rather than deleting them, so you
can restore them if you change your mind.
:::

## Connecting

### My invite code says "invalid or expired auth code"

A few things can cause this:

- **It expired or was used up.** Unless the admin chose otherwise, an invite is
  valid for **1 day** and **5 uses**. Ask the admin to resend it - the resend
  button issues a fresh code with a renewed expiry.
- **A newer invite replaced it.** Each user has exactly one active invite:
  when an admin creates a new invite for you, any older still-usable invite
  link stops working. Make sure you're using the most recent one.
- **Too many wrong attempts.** The server locks out repeated failed
  redemptions for a while ("too many attempts, try again later"). Wait a few
  minutes and try again with the code copied exactly.

Invites are managed in [Users & invites](./admin/users-and-invites.md); the
connect flow itself is described in [Connecting](./listening/connecting.md).

:::tip
If you're signed in but worried about getting locked out later, **set a
password** from the player's Settings. It's the durable way to sign back in on
any device without an admin - especially handy if you were invited by pairing
and never set one. See [Your account](./listening/account.md#set-a-password).
:::

### I was signed out, or a "Reconnect" bar appeared

Being signed out is rare - app updates no longer sign you out. If it does
happen, it usually means the server stopped accepting this device: an admin
revoked it, or the server was rebuilt. The app doesn't fail silently - it shows
a **Reconnect to &lt;your server&gt;** bar (tap it to sign in again, with the
address already filled in), and after a full sign-out the connect screen lists
your previous servers as one-tap **Reconnect** shortcuts.

Either way you only re-enter your code or password, never the server address. If
you have no password set, [set one](./listening/account.md#set-a-password) so
you can always get back in on any device without waiting on a fresh invite from
your admin.

## Playback

### A book plays in the app but won't play in the browser

Web browsers can only decode certain audio codecs: AAC (the usual codec in
`.m4b`/`.m4a`), MP3, FLAC, Opus, and Vorbis all work. Files encoded with
something a browser can't decode - Apple Lossless (ALAC) is the common
example - stream fine to the iOS and Android apps but fail in the web
player.

The server can convert such files to MP3 on the fly (it needs ffmpeg for
this), but the web player **doesn't yet request that automatically** - it's a
planned improvement. Until then, your options are:

- **Listen in the mobile app** ([Mobile apps](./listening/mobile-apps.md)) -
  the native players handle more formats than browsers do.
- **Convert the file** to `.m4b` (AAC) or `.mp3` once, and let the server
  rescan. Your listening progress survives the swap as long as the file keeps
  its path.

### Playback stops with an error mid-book

The player watches every playback attempt: if the audio doesn't start (or
stalls and doesn't recover) within a few seconds, it shows an error with a
**Retry** button instead of leaving you with a silent spinner. Retry fully
reloads the track, which recovers from a dropped connection - plain
play/pause often can't.

If this happens a lot, it's usually a flaky network between you and the
server (spotty Wi‑Fi, mobile data dead zones). For commutes and travel,
[download the book to your device](./listening/offline-downloads.md) and play
it locally.

### My book restarted from the beginning

It shouldn't lose your place - the player has several protections stacked up:

- Your position is saved to the server every 15 seconds while playing, and
  on every pause, seek, and stop.
- The app also keeps a **durable local copy** of your position, and an offline
  queue for saves made without a connection; on play it reconciles all of
  them and resumes from the newest.
- If the app is streaming and genuinely **can't find out** where you were
  (for example the server is unreachable), it shows an error with a Retry
  button rather than silently starting at zero.
- A save guard refuses to overwrite real progress with a position near the
  start unless you deliberately seeked back there.

So if you see the book at 0:00 with an error showing, don't scrub around -
just hit **Retry**, and the player re-fetches your real position. Your
progress on the server is intact.

## Library & files

### My library shows no books, or books suddenly vanished

Two usual causes:

- **The library root path is wrong.** Check the library's folder path in the
  admin console (see [Libraries](./admin/libraries.md)). Remember that with
  Docker the path is the one *inside* the container (e.g. `/library`), not the
  path on the host.
- **A network share is unmounted.** If your books live on a NAS mounted into
  the server machine (SMB/NFS), and the mount drops, the folder looks empty.
  The server detects this and **deliberately refuses to update the index** -
  it logs "library root unavailable" and keeps every book, and everyone's
  progress and bookmarks, exactly as they were. Remount the share, then
  trigger a **Rescan** from the admin console and everything reappears.

Nothing is deleted from disk in either case - the server never modifies your
audio files.

### New books I added aren't showing up

Two different views are involved:

- The **folder view** reads your disk live - new files show up there
  immediately, and opening one indexes it on the spot.
- **Search and the metadata-driven lists** come from the index, which is
  built by a scan. The server scans every library at startup and after
  library changes, but it does **not** rescan on a schedule.

So after copying new books in, either click **Rescan** on the library in the
admin console, or just browse to the new book in the folder view and open it.

### One folder shows as a single giant book - or as lots of one-chapter books

The scanner assumes the common convention: **a folder that contains audio
files is one book**, with those files as its chapters. Loose files sitting at
the very top of the library are each their own book. When a folder doesn't
fit that model - say, a "Short Stories" folder holding twenty separate
single-file books - the detection gets it wrong.

The fix is a **per-folder override** in the admin console: mark the folder as
a *collection* (one book per file) or force it to be a single *book*. See
[Libraries](./admin/libraries.md) for how, and
[Organizing your library](./getting-started/organizing-your-library.md) for
the folder conventions that avoid the problem entirely.

### Covers are missing

The server looks for cover art in this order:

1. A conventionally named image next to the book: `cover.jpg`, `cover.jpeg`,
   `cover.png`, `folder.jpg`, or `folder.png`.
2. For folder-based books: any image inside the book's folder (an image with
   "cover" in its name wins over other images). Multi-disc books
   (`.../Book/CD1/...`) also check the book's parent folder.
3. Artwork **embedded in the audio file's tags**.

If a book has no cover, the quick fix for a folder book is to drop a
`cover.jpg` into that book's folder; for a single loose file, embed the
artwork in the file's tags with your tagging tool. Then run a **Rescan** so
the server picks it up.

## Downloads

### My downloads are gone after reinstalling the app

It depends on what "reinstalling" meant:

- **Updating the app in place** keeps your downloads. (Early versions had a
  bug on iOS where downloads seemed to vanish after an update - that's fixed;
  the app now re-locates its files after the update.)
- **Deleting the app and installing it again** removes everything the app
  stored, downloads included - that's how phones work, and there's no way
  around it. You'll need to download the books again.
- **Interrupted downloads don't survive** - if the app is killed mid-download,
  the partial download is discarded on next launch and has to be started
  over. Only fully finished downloads are kept.

Your listening progress is safe throughout - it lives on the server, not in
the downloaded files. See [Offline downloads](./listening/offline-downloads.md).

### The web player won't offer downloads (or downloaded books won't play offline)

Offline playback in a browser needs a **service worker**, which browsers only
allow on a secure connection (HTTPS, or `localhost`). If the app detects that
offline files can't actually be served - for example you're on plain HTTP -
it hides the Downloads tab from the navigation, and a book's download button
appears as a disabled "Downloads unavailable" button rather than offering
downloads that wouldn't play. Access the server over HTTPS (see
[Remote access](./getting-started/remote-access.md)) and downloads appear.

## Demo

### The demo says it's at capacity

The public demo caps how many live demo accounts can exist at once (200 by
default), and each visitor's address is also rate-limited. Idle demo accounts
are cleaned up automatically after about a day, so capacity frees up on its
own - try again later. See [Demo](./demo.md) for what the demo is and how it
works.
