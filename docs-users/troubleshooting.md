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

### My browser warns about the certificate

That's expected with the default self-signed certificate. At home, accept the warning; the connection is still encrypted. To get rid of it, use Let's Encrypt or a reverse proxy. See [Reach your server from outside your home](./getting-started/remote-access.md).

### Where do I find the server's log?

In the admin console under [Server > Logs](./admin/server.md#logs). It holds the newest lines since the last restart. For older lines and the first-run banner, use `docker compose logs`, `journalctl -u audiosilo`, or the terminal you started the server from.

### I lost the first-run admin password

The server prints it only once. From least to most drastic:

1. **Check the logs.** `docker compose logs` often still has it, unless the container was recreated.
2. **Ask another admin** to set a new password for you in [Invite people](./admin/users-and-invites.md).
3. **Use the auth code**, if you saved it. It still signs the player in as the admin, but not the admin console.
4. **Reset the database.** Stop the server, move `audiosilo.db` (and any `audiosilo.db-wal` / `audiosilo.db-shm`) out of the data folder, and start it again. You get a new password.

:::warning
Resetting never touches your audiobooks, but it erases all accounts, listening progress, bookmarks, notes and shares. Move the files aside rather than deleting them.
:::

### I went back to an older server version

An older server may not understand what a newer one added to the database. Run the newer version again, or [restore the backup](./admin/backups.md#before-an-upgrade) the server made before the update.

## Connecting

### My invite code doesn't work

- **It expired or was used up.** Invites last 1 day and 5 uses by default. Ask the admin to **Rotate** it.
- **A newer invite replaced it.** Each person has one active invite. Use the newest one.
- **Too many wrong tries.** The message says how long to wait. Then copy the code exactly.

See also [When signing in doesn't work](./listening/connecting.md#when-signing-in-doesnt-work).

### Everyone gets "Too many tries" at once

The server is behind a reverse proxy that isn't in **Trusted proxies**, so every visitor looks like the same address. One device retrying an old sign-in then locks everyone out for a while. Add the proxy's address under **Server > Settings > Network & HTTPS > Trusted proxies** (see [Behind a reverse proxy](./getting-started/remote-access.md#behind-a-reverse-proxy)). It applies at once.

:::tip
[Set a password](./listening/account.md#password) on your account so you can always sign back in without a new invite.
:::

### I was signed out, or a "Reconnect" bar appeared

The server stopped accepting this device: an admin signed it out, your password changed, or the server was rebuilt. Tap **Reconnect** and sign in again; the address is already filled in.

### The top bar says a server "isn't answering"

That server stopped answering. Books from your other servers keep working, and its lists fill in again once it's back. If it stays, see [I can't reach the server at all](#i-cant-reach-the-server-at-all).

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

### My book restarted from the beginning

Your place is saved on the server and on the device, so losing it is very unlikely. If a book shows 0:00 with an error, don't scrub. Press **Retry** to fetch your real place.

### AudioSilo doesn't appear in Android Auto or CarPlay

See [Getting AudioSilo into the car](./listening/in-the-car.md#getting-audiosilo-into-the-car).

## Library and files

### My library shows no books, or books suddenly vanished

- **Wrong folder path.** Under Docker, the library's folder is the path inside the container (like `/library`), not on the host. Check it in [Libraries](./admin/libraries.md).
- **A network share dropped.** The server keeps every book and everyone's progress, and marks the library **Folder unavailable**. Remount the share, then press **Retry** on the library.

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
