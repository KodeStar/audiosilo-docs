---
title: Troubleshooting
description: Fixes for the most common AudioSilo problems, organized by symptom - server, connecting, playback, library, reading, and downloads.
---

Find the symptom that matches what you're seeing. Each entry explains what's
going on and what to do about it. If your problem points at a setting that has
its own page, the entry links there instead of repeating it.

## Server

### I can't reach the server at all

Work through these in order:

1. **Are you using `https://`?** Out of the box the server uses a self-signed
   certificate, which means it speaks **HTTPS**. It also answers plain
   `http://` on the same port, but only to devices on your home network
   ([plain HTTP at home](./getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect));
   from anywhere else, `http://` is sent on to `https://`. If in doubt, try
   `https://your-server:8080` (and see the certificate warning entry below).
2. **Is the port right?** The default listen address is `0.0.0.0:8080`. With
   Docker, check that the port is actually published - the example
   `docker-compose.yml` maps `"8080:8080"`. You can change the address and port
   with the `bind` setting in `config.yaml`, or as **Listen address** under
   [Server > Settings > Network & HTTPS](./admin/server.md#network--https) in
   the admin console (it takes effect at the next restart).
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
  `config.yaml`, or **Let's Encrypt** under
  [Server > Settings > Network & HTTPS](./admin/server.md#network--https)) -
  free Let's Encrypt certificates with no warnings. This needs a public domain
  name pointing at your server, and Let's Encrypt must be able to reach it on
  **port 443** (the server logs a warning if it isn't bound or forwarded there,
  which you can read under [Server > Logs](./admin/server.md#logs)).
  [Health > System](./admin/health.md#system) shows the certificate once it is
  issued, and warns two weeks before it runs out.
- **Put a reverse proxy in front** (Caddy, nginx, Traefik) and set
  `tls.mode: off` so the proxy handles HTTPS. Also set `trusted_proxies` so
  rate limiting and the sign-in lockouts see real visitor addresses.

Both public options are covered step by step in
[Remote access](./getting-started/remote-access.md).

### Where do I find the server's log?

In the admin console, under [Server > Logs](./admin/server.md#logs): the
newest lines since the server started, with filters for warnings and errors, a
search box and a live tail. Secrets are never shown there.

That page keeps only the newest 2,000 lines, in memory, so a restart empties
it. The full log is wherever the server's output goes: `docker compose logs`
under Docker, `journalctl -u audiosilo` for the
[systemd service](./getting-started/install-binary.md), or the terminal you
started it from. Use those for anything from before the last restart, and for
the first-run banner (which the console never shows).

### I lost the first-run admin password

The admin password and auth code are printed **exactly once**, in the server's
output on its very first start - the server itself never stores or shows them
again (only a secure hash is kept). In order of least to most drastic:

1. **Check the logs.** The first-run banner is part of the server's log output.
   With Docker, `docker compose logs` often still has it, as long as the
   container hasn't been recreated since first run.
2. **Ask another admin.** Any other admin can set a new password for your
   account in the admin console - see
   [People and invites](./admin/users-and-invites.md).
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

### I went back to an older server version

Each update can add to the database, and an older server doesn't know what a
newer one added. It still starts, and from 2.4.0 on its log warns about it:
"this database was used by a newer AudioSilo server: features it added may not
work here and their data can be lost; run the newer version again, or restore
a backup made before the upgrade". (Versions before 2.4.0 start without the
warning.) Run the newer version again as soon as you can, or
[restore a backup](./admin/backups.md#restoring-a-backup) made before the
update if you mean to stay on the older one. From 2.5.0, an update that changes
the database makes that backup by itself as it starts: it's the newest
**Before an upgrade** backup in the list (see
[Before an upgrade](./admin/backups.md#before-an-upgrade)).

Podcasts are the part an older server gets wrong: a version before 2.4.0
reads a podcast library as books, and drops its episodes from the index.
Back on 2.4.0 or later, the next scan of the podcast library indexes them
again from the details the Bridge saved; nobody's listening progress or
bookmarks are lost, since they belong to each episode's file.

## Connecting

### My invite code doesn't work

The connect page says why when it can: *"That invite code isn't valid or has
expired"*, *"This invite has already been used on all its devices"* or *"This
invite has expired"* (a server before 2.5.0 says "Could not redeem auth code"
for all of these). The player's sign-in screen has its own wording, listed in
[When signing in doesn't work](./listening/connecting.md#when-signing-in-doesnt-work).
A few things can cause it:

- **It expired or was used up.** Unless the admin chose otherwise, an invite is
  valid for **1 day** and **5 uses**. Ask the admin to rotate it - **Rotate**
  issues a fresh code with a renewed expiry.
- **A newer invite replaced it.** Each user has exactly one active invite:
  when an admin creates a new invite for you, any older still-usable invite
  link stops working. Make sure you're using the most recent one.
- **Too many wrong attempts.** The server locks out repeated failed
  sign-ins from your network for a while, and the message says how long
  (*"Too many attempts. Try again in 15 minutes."* on the connect page). Wait
  that long and try again with the code copied exactly. Wrong passwords have a
  lockout of their own that works the same way.

Invites are managed in [People and invites](./admin/users-and-invites.md); the
connect flow itself is described in [Connecting](./listening/connecting.md).

### Everyone gets "Too many tries" at once

Signing in, pairing and requests with a wrong or old sign-in are limited per
visitor address (signed-in devices have limits of their own). If AudioSilo runs
behind a reverse proxy that isn't listed under **Trusted proxies** (**Server >
Settings > Network & HTTPS**), every visitor looks like the same address. One
device retrying with an old sign-in can then use up that address's limit, and
everyone is refused for a short while: signing in or pairing says "Too many
tries", and pages and covers don't load. Add the proxy's address to **Trusted
proxies** (see
[Behind a reverse proxy](./getting-started/remote-access.md#behind-a-reverse-proxy)); it applies
at once. (The limits themselves are `rate_limit` in `config.yaml`, see the
[configuration reference](/developers/server/configuration#rate-limits-rate_limit).)

:::tip
If you're signed in but worried about getting locked out later, **set a
password** on your [account page](./listening/account.md#password) in the player. It's the durable way to sign back in on
any device without an admin - especially handy if you were invited by pairing
and never set one.
:::

### I was signed out, or a "Reconnect" bar appeared

Being signed out is rare - app updates no longer sign you out. If it does
happen, it usually means the server stopped accepting this device: an admin
revoked it or signed you out everywhere, your password was changed (on another
device, or by an admin), or the server was rebuilt. The app doesn't fail silently - it shows
a **Reconnect to &lt;your server&gt;** bar (tap it to sign in again, with the
address already filled in), and after a full sign-out the connect screen lists
your previous servers as one-tap **Reconnect** shortcuts. Home, the Library,
Up next, a folder, a book or episode page, and You > Stats and Year show
**Sign in again to &lt;your server&gt;** with a **Reconnect** button in place
of what they couldn't load, rather than an error with **Retry**: trying again
can't help until you sign in.

Either way you only re-enter your code or password, never the server address. If
you have no password set, [set one](./listening/account.md#password) so
you can always get back in on any device without waiting on a fresh invite from
your admin.

### The top bar says a server "isn't answering"

With more than one server connected, the top bar (and the servers pill on
Home) names a server that has stopped answering: "&lt;server&gt; isn't
answering", with an amber dot. If it's the server you're using, the top bar
says you're offline instead. When a page or a save of your place fails, the
app checks the server itself before saying so. A server that is slow but still
answering your other requests isn't named, so one slow page or save doesn't
trigger it. Books
from your other servers keep working. Once that server answers again, the note goes and its lists fill in
by themselves. If it stays, work through
[I can't reach the server at all](#i-cant-reach-the-server-at-all).

If the Library says "Could not load libraries.", the app couldn't get the list
of libraries from a server. In Folders, the message names the server: "Couldn't
load libraries from &lt;server&gt;." Your other servers' libraries still show
under their own names. Press **Retry** where the screen offers it, or wait for
the server to come back: the Library reloads on its own once it answers.

### The app can't connect, but the browser can

The usual cause is the server's default **self-signed certificate**. A browser
lets you click through its warning; the iPhone and Android apps can't, so they
can't connect to it over `https://`. On your home network they connect over
plain HTTP instead, which the server offers there by itself
([plain HTTP at home](./getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect)).
Check:

- **Is your phone on the same Wi-Fi as the server?** Plain HTTP is only served
  to devices on the home network. Away from home, the apps need a certificate
  they trust: [autocert or a reverse proxy](./getting-started/remote-access.md).
- **Is the server up to date?** Older servers speak only HTTPS on a
  self-signed certificate, so the apps can't connect to them at all. Update the
  server, and the app too.
- **Is plain HTTP at home switched on?** It's on by default; your admin finds it
  as **Plain HTTP at home** under
  [Server > Settings > Network & HTTPS](./admin/server.md#network--https)
  (`tls.home_http` in `config.yaml`, `AUDIOSILO_TLS_HOME_HTTP`).
- **Try the address the app should use** in the phone's browser, with
  `http://` in front: `http://192.168.1.20:8080/web`, say. If the web player
  loads, the app can connect there too; type that `http://` address into the
  app.
- **Is a VPN on in the phone?** The server judges "home" by the address each
  connection arrives from. Through a VPN the phone's connection can arrive from
  outside your home network, so the server sends it to HTTPS.

### The app doesn't use the home address at home

The iOS and Android apps use a server's home address only when the server has
told them one and it answers as your server; otherwise they stay on the public
address, which still works. The checks are in
[If the app doesn't switch to the home address](./listening/connecting.md#if-the-app-doesnt-switch-to-the-home-address).

## Playback

### A book plays in the app but won't play in the browser

Some audio formats (Apple Lossless, AC-3...) don't play in browsers, so the
web player has the server [convert them as you listen](./listening/playback.md#books-a-browser-cant-play-directly).
If such a book still won't play in the browser:

- **Ask your admin to check transcoding.** The admin console's
  [Server > Transcoding](./admin/server.md#transcoding) shows whether ffmpeg
  was found; the conversion needs it.
- **Ask your admin to rescan the book** once ffprobe is available. The server
  only converts books it knows a browser can't play, which it learns with
  ffprobe while scanning (the book's page in the admin console then says
  "Transcodes to MP3 for browsers").
- **Listen in the [mobile app](./listening/mobile-apps.md)**, which plays these
  formats as they are where the device can decode them (an Android phone may
  not), or **convert the file** to `.m4b` (AAC) or `.mp3` once
  and let the server rescan (your progress survives as long as the path stays
  the same).

### A book plays in the browser but not in the app

A book in `.mka` (Matroska audio) files with AAC, Opus or FLAC inside plays in
the web player because the server converts it as it streams, which the apps
can't ask for. An iPhone can't play the format at all, and an Android phone
plays it only if it can decode the audio inside. Convert the files to
`.m4b` or `.mp3` and let the server rescan (see
[Supported formats](./getting-started/organizing-your-library.md#supported-formats)).

An `.mka` book with MP3 inside plays in the apps too while the server has
ffmpeg (your admin can check [Server > Transcoding](./admin/server.md#transcoding)).
If one downloaded on an iPhone won't play, see
[Books in MKA files](./listening/offline-downloads.md#books-in-mka-files).

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

### A book won't start

When a book can't start, a note says so (such as *"Couldn't start this book.
Try again."*, or with the book's title when it comes from Up next or the end of
a book), with a second line when the player knows why:

- *"Can't reach Home Server right now."* (with your server's name) - the book
  streams from a server that isn't answering. See
  [I can't reach the server at all](#i-cant-reach-the-server-at-all), or
  [download the book](./listening/offline-downloads.md) before you go out of
  reach.
- *"Its audio didn't load from the server."* (web player) - the server
  answered, but the book's audio file didn't load. If it keeps happening for
  one book, ask your admin to check its files (see
  [A book plays in the app but won't play in the browser](#a-book-plays-in-the-app-but-wont-play-in-the-browser)).

Your place in the book isn't lost: the player keeps it, and **Retry** starts
from there.

### "This book isn't in the library"

A book page, a folder or the player opened from a link says *"This book isn't
in the library"* (or *"This folder isn't in the library"*) with **Back** and
**Home** when the server has no such book: it was moved, renamed or removed
since the link was made, or the link is wrong or for a library you can't see.
There's no **Retry**, because asking again won't find it. Search for the book,
or find it under its new folder in the Library. The player opened with no book
at all says *"Nothing is playing"*.

### A podcast episode won't start

An episode marked **Plays on demand** isn't on your server yet: pressing
**Play** asks the server to download it first, and the player shows **Getting
this episode** until it's ready. A long episode can take a minute or two. If it
stops with a message instead, [Playing an episode](./listening/podcasts.md#playing-an-episode)
says what each one means. For **This episode can't be fetched now**, ask your
admin to check that **Podcasts** is on in **Server > Settings > Modules** and
that the [Bridge](./admin/bridge.md) is online and can write to the podcast
library. The same reason shows beside a greyed-out **Play** on the episode's
row and page before you press it: *"Your server can't download episodes right
now."* also appears when the server is too old to fetch episodes on demand.

If you don't see your server's podcasts at all, check your app's version first:
an app older than 2.4.0 shows no podcasts, so update it. An older app can't
see podcast episodes in **Up next** either, so clearing Up next there leaves
the episodes queued for your up-to-date devices. If it is up to date,
ask your admin whether you have access to the podcast library (and whether the
server itself is up to date). Kids mode never shows podcasts, and a
[private show](./listening/podcasts.md#private-feeds) appears only to the
people who follow it.

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

### AudioSilo doesn't appear in Android Auto or CarPlay

Android Auto only lists apps installed from Google Play unless you allow
unknown sources (needed for [the APK from GitHub](./listening/mobile-apps.md#android-without-google-play)), and CarPlay needs version 2.4.1 or later of the iPhone app (see
[Availability](./listening/mobile-apps.md#availability)). See
[Getting AudioSilo into the car](./listening/in-the-car.md#getting-audiosilo-into-the-car)
for the steps and checks.

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
  it logs "library root unavailable" (visible under
  [Server > Logs](./admin/server.md#logs)) and keeps every book, and everyone's
  progress and bookmarks, exactly as they were.
  [Health > System](./admin/health.md#system) shows the folder as not
  reachable. The admin console marks the
  library **Folder unavailable** with a "Safety stop: nothing was deleted"
  notice. Remount the share, then click **Retry** on the library in the admin
  console and everything reappears.

Nothing is deleted from disk in either case - the server never modifies your
audio files.

### New books I added aren't showing up

Two different views are involved:

- The **folder view** reads your disk live - new files show up there
  immediately, and opening one indexes it on the spot.
- **Search and the metadata-driven lists** come from the index, which is
  built by a scan. The server scans every library at startup and after
  library changes, and on a schedule only if you set one (**Scan
  automatically** when you [edit the library](admin/libraries.md#scanning-on-a-schedule)).

So after copying new books in, either click **Rescan** on the library in the
admin console, or just browse to the new book in the folder view and open it.
If a scan seems slow to start, look at **Health > Jobs**: scans run one at a
time, so it may be waiting behind another library's (see
[Library health and jobs](admin/health.md#jobs)).

### One folder shows as a single giant book - or as lots of one-chapter books

The scanner assumes the common convention: **a folder that contains audio
files is one book**, with those files as its chapters. Loose files sitting at
the very top of the library are each their own book. When a folder doesn't
fit that model - say, a "Short Stories" folder holding twenty separate
single-file books - the detection gets it wrong.

The fix is a **per-folder override** in the admin console: with **Folder
detection...** on the library, set the folder to **Separate books** (one book
per file) or force it to be **Always one book**. See
[Libraries](./admin/libraries.md) for how, and
[Organizing your library](./getting-started/organizing-your-library.md) for
the folder conventions that avoid the problem entirely.

A book ripped from CDs into `CD1`, `CD2`, ... folders shows as one book per
disc. Set the folder holding the discs to **Always one book** and they become
one book, with everyone's progress carried over (see
[Books split into disc folders](./admin/libraries.md#books-split-into-disc-folders)).

### A book has no chapters (or only a few broad ones)

Chapters come from the audio files: an M4B's embedded chapter list, or one
chapter per file in a folder of MP3s. A book that is one long file with no
chapter marks shows as 30-minute **Parts** in the player.

AudioSilo can also take the chapters from the
[community database](./community/meta-site.md), which has chapter lists for
most recordings:

1. Make sure community metadata is on (**Server > Settings > Community
   metadata** in the admin console).
2. **Match the book.** AudioSilo doesn't read ASINs from the files' tags, so a
   book is only checked once it is matched: open it in **Library** and use
   **Match with community metadata**, or match many at once with **Match
   automatically** on the Health page.
3. Open the book's page and look at the **Community chapters** panel on the
   Chapters card. **Check now** checks straight away. A book with no chapters
   of its own uses the community's as soon as they fit; a book with broad
   chapters offers **Use detailed chapters**.

If the panel says the community's chapters are "for another edition" or
"don't line up", your copy is a different release from the one the community
timed, and its chapters can't be used. If a chapter "runs from one file into
the next", merging the files into one (an M4B, say) would let them fit. See
[Community chapters](./admin/books.md#community-chapters) for every message.
Health's **Long books without chapters** list says the same reason on each
book.

### Covers are missing

The server looks for cover art in this order:

1. A conventionally named image next to the book: `cover.jpg`, `cover.jpeg`,
   `cover.png`, `folder.jpg`, or `folder.png`.
2. For folder-based books: any image inside the book's folder (an image with
   "cover" in its name wins over other images). Multi-disc books
   (`.../Book/CD1/...`) also check the book's parent folder, and a book
   joined from its disc folders checks its own folder, then its first disc's.
3. Artwork **embedded in the audio file's tags**.

If a book has no cover, the quick fix for a folder book is to drop a
`cover.jpg` into that book's folder; for a single loose file, embed the
artwork in the file's tags with your tagging tool. Then run a **Rescan** so
the server picks it up. Or upload a custom cover on the book's page in the
admin console, or take the community's cover when you match the book: it is
used ahead of all three, needs no rescan, and leaves the book's folder
untouched (see [Covers](./admin/books.md#covers)).

## Reading

### A book has no Read the ebook button

**Read the ebook** shows only on a server that has the reader, and only for a book with one EPUB beside its audio. Check that:

- the folder holds **one** `.epub`, not two or more (with several, none is used);
- for a single-file book, the EPUB has the **same name** as the audio file;
- a scan has run since you added it: click **Rescan** on the library in the admin console;
- in the iOS or Android app, you have its latest version from the App Store, Google Play or, on Android, [the APK on GitHub](./listening/mobile-apps.md#android-without-google-play) (an older one has no reader).

Offline, the reader needs the ebook in the book's download: see [Reading offline](listening/reading-the-ebook.md#reading-offline).

See [Reading the ebook](listening/reading-the-ebook.md#which-books-have-it).

### The ebook reader doesn't start

If the reader says *"The reader didn't start"* after about 30 seconds, the browser didn't run the reader's page. The usual cause is a **reverse proxy that adds its own security headers**: the reader is a page of its own that the web player shows inside itself, and your server sends it with headers that allow exactly that (`X-Frame-Options: SAMEORIGIN` and its own `Content-Security-Policy`). A proxy that replaces them with `X-Frame-Options: DENY` or a site-wide policy stops it. Let the proxy pass the server's headers through for `/web/reader.html`. A very old browser can't run it either: try a current one.

In the iOS and Android apps a proxy's headers don't matter (the app's reader is part of the app). There, *"The reader didn't start"* means the reader didn't start within 30 seconds or stopped more than a few times in a row, usually because the phone ran short of memory. Press **Try again**, and if it keeps stopping, close some other apps first: a large ebook, or one full of pictures, needs a lot of memory.

## Downloads

### My downloads are gone after reinstalling the app

It depends on what "reinstalling" meant:

- **Updating the app in place** keeps your downloads. (Early versions had a
  bug on iOS where downloads seemed to vanish after an update - that's fixed;
  the app now re-locates its files after the update.)
- **Deleting the app and installing it again** removes everything the app
  stored, downloads included - that's how phones work, and there's no way
  around it. You'll need to download the books again.
- **Interrupted downloads keep what they finished** - if the app is killed
  mid-download, the download comes back on next launch as stopped ("The app
  closed before it finished"), keeping the files that had finished, and
  **Retry** fetches only the rest. The file that was half-written starts
  again, and if any finished file has gone missing the whole download starts
  over.

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

If the Downloads page says **Downloads aren't available here**, it also says
why: no secure connection, a browser that can't keep audio offline, or
offline playback that isn't ready yet. For the last one, reload the page once
(the browser installs the offline helper on the first visit); if it still
says so, the browser is blocking it, and the iOS or Android app is the way to
listen offline. A download that stopped with "Saved, but offline playback
isn't ready yet" just needs **Retry** after the reload.

## Demo

### "This server has no demo"

A demo link (`/web/demo`) opened on a server that doesn't run a demo says so,
with **Sign in** for your invite code or account. Only servers set up for it
offer a demo; the public one is at [The demo](./demo.md).

### The demo says it's at capacity

The public demo caps how many live demo accounts can exist at once (200 by
default), and each visitor's address is also rate-limited. Idle demo accounts
are cleaned up automatically after about a day, so capacity frees up on its
own - try again later. See [Demo](./demo.md) for what the demo is and how it
works.
