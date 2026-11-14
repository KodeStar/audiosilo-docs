---
title: Troubleshooting
description: Fixes for common AudioSilo problems, by symptom.
---

Find the symptom that matches what you see. Each entry gives the usual cause and the fix.

## Server

### I can't reach the server at all

Work through these in order:

1. **Use `https://`.** The server speaks HTTPS by default. Plain `http://` only works from your home network ([plain HTTP at home](./getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect)). Try `https://your-server:8080`.
2. **Check the port.** The default is 8080. Under Docker, check the port is published (`"8080:8080"`).
3. **Check the firewall.** If it works on the server itself but not from your phone, allow the port through the server's firewall.
4. **From outside your home?** See [Reach your server from outside your home](./getting-started/remote-access.md).

### The container stops at start-up with "pthread_create failed"

Your Docker is older than **20.10.10** and blocks something the server needs. Update Docker (on a NAS, update its container app or system), then start the container again. `docker version` shows your version.

### The container keeps restarting, or the log says the server can't write to a folder {/* #permission-denied */}

The server runs as the user in `PUID` and `PGID`. It needs read and write access to its data and backups folders, and read access to your books. At start the container tries to make that user the owner of the data folder. A NAS share can refuse that, and the container's log then says so:

```text
audiosilo: WARNING: the server can't write to /data: it runs as user 1000:1000 and the folder belongs to 1026:100.
audiosilo:   Changing its owner to 1000:1000 failed (a NAS share with ACLs or a read-only mount refuses it).
audiosilo:   Fix: set PUID=1026 and PGID=100 (the folder's owner) on the container, or give user 1000:1000 read and write access to the folder on the host.
error: the data folder isn't usable: the server can't write to /data: permission denied. The server runs as user 1000:1000 and the folder belongs to 1026:100. Set PUID=1026 and PGID=100 (the folder's owner) on the container, or give user 1000:1000 read and write access to the folder.
```

The last line is the server stopping, so the container restarts and stops again. Do what the **Fix** line says. Either:

- Set `PUID` and `PGID` to the owner the log names (here `1026` and `100`), then recreate the container.
- Give the user the log names access to the folder on the host. On a Synology NAS, see [Give that user access](./getting-started/install-synology.md#3-give-that-user-access).

The same warning can name other folders:

- **The backups folder you set in `AUDIOSILO_BACKUP_DIR`.** The server starts, but backups fail until you fix it. For this folder and for the default one, the server's log warns `backups will fail` at start, and once a backup fails, the Backups notice in the console says why.
- **A books folder**, which needs read access only. The warning ends with `Until then, a library in that folder shows as offline.` The library shows **Folder unavailable** in the console. After the fix, press **Retry** on the library.

A share that doesn't answer is a different problem. The log says `audiosilo: WARNING: /library didn't answer within 5 seconds: a network share that is slow, or whose server is gone.` Check that the share is mounted on the host.

Run the container with `user:` instead of `PUID` and `PGID`? Then the **Fix** line says to run it as the folder's owner, for example `user: "1026:100"`.

### My browser warns about the certificate

That's expected with the default self-signed certificate. At home, accept the warning; the connection is still encrypted. To get rid of it, use Let's Encrypt or a reverse proxy. See [Reach your server from outside your home](./getting-started/remote-access.md).

### Where do I find the server's log?

In the admin console under [Server > Logs](./admin/server.md#logs). It holds the newest lines since the last restart. For older lines and the first-run banner, use `docker compose logs`, `journalctl -u audiosilo`, or the terminal you started the server from. On a NAS, use its container app's log view ([Unraid](./getting-started/install-unraid.md#2-save-your-password), [Synology](./getting-started/install-synology.md#5-save-your-password)).

### I lost the first-run admin password

The server prints it only once. From least to most drastic:

1. **Check the logs.** `docker compose logs` often still has it, unless the container was recreated.
2. **Ask another admin** to set a new password for you in [Invite people](./admin/users-and-invites.md).
3. **Run `reset-admin`.** It sets a new admin password and prints it, and your books, people and listening stay as they are. Each later start's log names the command for your install, and [If you lose the password](./getting-started/first-run.md#if-you-lose-the-password) lists them all. It also ends the first-run auth code. If it says that part failed, the new password still works: revoke the code in **People > Invites**.
4. **Reset the database**, only if `reset-admin` can't run. Stop the server, move `audiosilo.db` (and any `audiosilo.db-wal` / `audiosilo.db-shm`) out of the data folder, and start it again. You get a new password.

:::warning
Resetting the database never touches your audiobooks, but it erases all accounts, listening progress, bookmarks, notes and shares. Move the files aside rather than deleting them.
:::

`reset-admin` refuses while a restore is waiting for the next start, since the restore would replace the new password. Start the server once, or cancel the restore in [Backups](./admin/backups.md), then run it again.

### I went back to an older server version

An older server may not understand what a newer one added to the database. Run the newer version again, or [restore the backup](./admin/backups.md#before-an-upgrade) the server made before the update.

## Connecting

### My invite code doesn't work

- **It expired or was used up.** An invite from the admin console lasts 7 days and 5 uses by default. Ask the admin to **Rotate** it.
- **A newer invite replaced it.** Each person has one active invite. Use the newest one.
- **Too many wrong tries.** The message says how long to wait. Then copy the code exactly.

See also [When signing in doesn't work](./listening/connecting.md#when-signing-in-doesnt-work).

### Scanning the QR code opened a web page, not the app

The phone's camera app opens a QR code in the browser. Open the AudioSilo app instead, tap **Scan a QR code** and scan the code there. See [Sign in the app with a QR code](./listening/connecting.md#scanning-the-qr-code-with-your-phone).

### Everyone gets "Too many tries" at once

The server is behind a reverse proxy that isn't in **Trusted proxies**, so every visitor looks like the same address. One device retrying an old sign-in then locks everyone out for a while. Add the proxy's address under **Server > Settings > Network & HTTPS > Trusted proxies** (see [Behind a reverse proxy](./getting-started/remote-access.md#behind-a-reverse-proxy)). It applies at once.

:::tip
[Set a password](./listening/account.md#password) on your account so you can always sign back in without a new invite.
:::

### I was signed out, or a "Reconnect" bar appeared

The server stopped accepting this device: an admin signed it out, your password changed, or the server was rebuilt. Tap **Reconnect** and sign in again; the address is already filled in.

### The top bar says a server "isn't answering"

That server stopped answering. Books from your other servers keep working, and its lists fill in again once it's back. If it stays, see [I can't reach the server at all](#i-cant-reach-the-server-at-all).

### A page says "You're offline"

Your phone, tablet or computer has no network, so the page can't ask your server. Turn on Wi-Fi or mobile data. The page loads by itself once the network is back.

Meanwhile, your downloaded books still play. [With no connection](./listening/offline-downloads.md#with-no-connection) lists what works offline.

Search says the same when none of your servers answer. If your device has a network, see [I can't reach the server at all](#i-cant-reach-the-server-at-all).

### A bookmark, note or rating won't save

These are stored on your server, so saving one needs a connection to it. Check the connection, then add it again. [With no connection](./listening/offline-downloads.md#with-no-connection) says what the apps do with one made offline.

### The app can't connect, but the browser can

The iOS and Android apps can't accept the default self-signed certificate. At home they use [plain HTTP](./getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect) instead. Check:

- **Your phone is on the same Wi-Fi as the server.** Away from home, the apps need [Let's Encrypt or a reverse proxy](./getting-started/remote-access.md).
- **Plain HTTP at home is on** under [Server > Settings > Network & HTTPS](./admin/server.md#network--https).
- **No VPN is on in the phone.** A VPN can make your phone look like it's outside your home.
- **The server and app are up to date.**

Test in the phone's browser with `http://` in front, like `http://192.168.1.20:8080/web`. If that loads, type the same address into the app.

### The app doesn't use the home address at home

See [If the app doesn't switch to the home address](./listening/connecting.md#if-the-app-doesnt-switch-to-the-home-address).

## Playback

### A book plays in the app but won't play in the browser

Some formats (Apple Lossless, AC-3) don't play in browsers, so the server [converts them](./listening/playback.md#books-a-browser-cant-play-directly) as you listen. If one still won't play:

- Ask your admin to check [Server > Transcoding](./admin/server.md#transcoding) shows ffmpeg as found.
- Ask your admin to rescan the book once ffprobe is available.
- Or listen in the [iOS or Android app](./listening/mobile-apps.md), or convert the file to `.m4b` or `.mp3`.

### A book plays in the browser but not in the app

It's probably an `.mka` file with AAC, Opus or FLAC inside. The apps can't play those reliably. Convert them to `.m4b` or `.mp3` (see [Supported formats](./getting-started/organizing-your-library.md#supported-formats)). For a download on an iPhone, see [Books in MKA files](./listening/offline-downloads.md#books-in-mka-files).

### Playback stops with an error mid-book

Usually a flaky connection. Press **Retry**, which reloads the track. For travel, [download the book](./listening/offline-downloads.md) first.

### A book won't start

The message says why when it can. If the server isn't answering, see [I can't reach the server at all](#i-cant-reach-the-server-at-all). If one book's audio keeps failing, ask your admin to check its files. Your place is kept, and **Retry** starts from there.

### "This book isn't in the library"

The book was moved, renamed or removed since the link was made, or you can't see its library. Search for it, or find it in its new folder.

### A podcast episode won't start

An episode marked **Plays on demand** downloads first, which can take a minute or two. If it stops with a message, see [Playing an episode](./listening/podcasts.md#playing-an-episode). Your admin can check that **Podcasts** is on in **Server > Settings > Modules** and the [Bridge](./admin/bridge.md) is online.

No podcasts at all? Update the app, and ask your admin whether you can see the podcast library.

### An episode download says the server couldn't get it

An episode that isn't on your server yet has to be fetched there before it can download. The message under the download says why your server couldn't fetch it. Tap **Retry download** on the episode's page, or **Retry** on the Downloads page, to ask again. If it says your server can't fetch episodes now, ask your admin.

### My book restarted from the beginning

Your place is saved on the server and on the device, so losing it is very unlikely. If a book shows 0:00 with an error, don't scrub. Press **Retry** to fetch your real place.

### AudioSilo doesn't appear in Android Auto or CarPlay

See [Getting AudioSilo into the car](./listening/in-the-car.md#getting-audiosilo-into-the-car).

## Library and files

### My library shows no books, or books suddenly vanished

- **Wrong folder path.** Under Docker, the library's folder is the path inside the container (like `/library`), not on the host. Check it in [Libraries](./admin/libraries.md).
- **A network share dropped.** The server keeps every book and everyone's progress, and marks the library **Folder unavailable**. Remount the share, then press **Retry** on the library.
- **The server can't read the folder.** The library also shows **Folder unavailable**. See [Permission denied](#permission-denied).

AudioSilo never deletes your files.

### New books I added aren't showing up

The folder view shows new files at once. Search and lists need a scan. Press **Rescan** on the library, or [scan on a schedule](./admin/libraries.md#scanning-on-a-schedule). A waiting scan shows in [Health > Jobs](./admin/health.md#jobs).

### One folder shows as one giant book, or as many one-chapter books {/* #one-folder-shows-as-a-single-giant-book---or-as-lots-of-one-chapter-books */}

Set a per-folder override with **Folder detection...** on the library: **Separate books** or **Always one book**. See [Folder detection](./admin/libraries.md#folder-detection) and [Books split into disc folders](./admin/libraries.md#books-split-into-disc-folders).

### A book has no chapters (or only a few broad ones)

A long file without chapter marks shows 30-minute **Parts**. To use chapters from the community database:

1. Turn on community metadata in **Server > Settings**.
2. Match the book with **Match with community metadata** on its page.
3. Check its **Community chapters** panel.

If they're "for another edition", your copy differs and they can't be used. See [Community chapters](./admin/books.md#community-chapters).

### Covers are missing

Drop a `cover.jpg` into the book's folder and rescan. Or upload a cover on the book's page in the admin console (see [Covers](./admin/books.md#covers)).

## Reading

### A book has no Read the ebook button

- The folder must hold exactly **one** `.epub`.
- For a single-file book, the EPUB needs the **same name** as the audio file.
- Rescan the library after adding it.
- Update the iOS or Android app.

See [Which books have it](./listening/reading-the-ebook.md#which-books-have-it).

### The ebook reader doesn't start

**In a browser**, it's usually a reverse proxy adding its own security headers. Let the proxy pass the server's own headers through for `/web/reader.html`. An old browser can't run the reader either.

**In the app**, the phone probably ran short of memory. Press **Try again**, and close other apps if it keeps stopping.

## Downloads

### My downloads are gone after reinstalling the app

Updating the app keeps downloads. Deleting and reinstalling it removes them, so download the books again. Your listening progress is on the server and is safe.

### The web player won't offer downloads (or downloaded books won't play offline)

Offline listening in a browser needs HTTPS. Over plain HTTP, downloads are hidden. Use HTTPS (see [Reach your server from outside your home](./getting-started/remote-access.md)) or the iOS or Android app. If downloads say offline playback isn't ready, reload the page once.

## Demo

### "This server has no demo"

Only servers set up for it offer a demo. Try the [public demo](./demo.md).

### The demo says it's at capacity

Too many demo accounts are live at once. The server removes idle ones after about a day, so try again later.
