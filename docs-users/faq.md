---
title: FAQ
description: Frequently asked questions about AudioSilo - formats, ffmpeg, NAS storage, backups, users, offline listening, Audible backup, and hardware.
---

Quick answers to the questions that come up most. For symptom-based problem
solving, see [Troubleshooting](./troubleshooting.md).

## Formats & playback

### What audio formats are supported?

The server recognizes these file extensions as audiobooks:

**`.m4b`, `.m4a`, `.mp4`, `.mp3`, `.flac`, `.ogg`, `.opus`**

`.m4b` (a single file with embedded chapters) is the audiobook standard and
works best, but a folder of `.mp3` chapter files is treated just as well -
the server presents both the same way, with one continuous timeline and a
chapter list.

Audible's DRM formats (`.aax`/`.aaxc`) are deliberately **not** indexed - the
server could never play them, since they're locked to your Audible account.
The [desktop manager's Audible backup](./manager/audible-backup.md) converts
them to plain `.m4b` before they enter a library.

### Do I need ffmpeg?

No - but you'll want it. The server uses two companion tools:

- **ffprobe** reads durations, embedded chapters, and each file's audio codec.
  Without it, books still index and play (titles and authors come from tags
  and folder names), but durations and chapter lists are unavailable.
- **ffmpeg** enables on-the-fly conversion of browser-unfriendly codecs to
  MP3. Without it, that feature is simply off.

In practice you rarely have to think about this: the **Docker image includes
ffmpeg**, and the native binary looks for a copy on your system and - if none
is found - downloads one automatically into its data directory on first
start.

### Is there a web version, or do I need the apps?

Both exist, and they're the same player. The server ships with the **web
player** built in at `https://your-server/web` - nothing to install, works in
any modern browser, and can be added to your phone's home screen as an app
(PWA). The **iOS and Android apps** add the deepest device integration:
better background audio and wider codec support, plus lock-screen playback
with skip controls - on Android those lock-screen controls are chapter-aware
(prev/next chapter and a chapter scrubber), while iOS offers 30-second skip
and file-level previous/next. See [Mobile apps](./listening/mobile-apps.md).

The admin console at `/admin` is also built into the server - no separate
install for that either.

### Does it work offline?

Yes. Download a book to your device and it plays with no connection - in the
mobile apps, and in the web player too (over HTTPS). Listening progress made
offline is queued and synced back to the server the next time you're
connected. See [Offline downloads](./listening/offline-downloads.md).

## Your library & your data

### Can my books live on a NAS or network share?

Yes - this is a common setup. Mount the share (SMB/NFS) on the machine
running the server first, then point the library at the mounted folder; the
server always works with what looks like a local path.

There's a safety net built in for exactly this arrangement: if the mount
drops and the folder suddenly looks empty, the server **refuses to update its
index** rather than concluding all your books are gone. Your catalog,
progress, and bookmarks stay intact; remount and rescan, and everything is
back.

### Is my listening progress safe if I reorganize or re-tag my files?

Yes, by design. AudioSilo identifies a book by **where it lives** (its folder
path), not by a database number or its tags - so re-tagging files changes
nothing about your progress, bookmarks, or notes.

If you **move or rename** a book, the server notices too: it keeps a cheap
content fingerprint of each book, and when a path disappears while a new path
with the same content appears, your progress and bookmarks follow the book to
its new home automatically.

### What should I back up?

Two things:

- **Your audiobook folders** - the books themselves. AudioSilo treats your
  files as the source of truth and never modifies them, so any backup of the
  folders is a backup of your library.
- **The server's data directory** (the `--data` folder, or the `/data` volume
  in Docker). It holds `config.yaml`, the certificates, and the database.

The database's book *index* is rebuildable - the server can recreate it from
your files at any time - but the database also holds the things that
**aren't** on disk: user accounts, listening progress, bookmarks, notes,
favourites, shares, and folder overrides. That's why the data directory
belongs in your backups.

## Users & sharing

### How many users can I have, and can I limit what each one sees?

There's no fixed user limit - create an account for everyone in the house.
Each user gets their own listening progress, bookmarks, notes, and
favourites, and joins by redeeming an invite code (no password needed for
listeners - see [Users & invites](./admin/users-and-invites.md)).

Access is controlled with **shares**: named sets of folders (one author, one
series, a single book, or a whole library) that you grant to users. A user
sees only what they've been granted - browsing, search, and playback are all
scoped to match. See [Sharing](./admin/sharing.md).

## The desktop manager & Audible

### Is the Audible backup legal?

The manager's [Audible backup](./manager/audible-backup.md) is built for one
thing: making **personal backup copies of audiobooks you bought** with your
own Audible account. It signs in as you, downloads your own purchases using
the decryption key Audible issues to your account, and converts them to
standard `.m4b` files for your own library. There is nothing in it for
accessing books you don't own.

That said, laws on making personal copies of DRM-protected media differ from
country to country, and this documentation isn't legal advice - it's your
responsibility to know what's permitted where you live. Don't share the
converted files; keep them for personal use.

## Running the server

### Why do I need a server at all? My files already sit in a folder.

The folder stays exactly as it is - AudioSilo never rewrites or reorganizes
your files, and the network side of the system is read-only. What the server
adds on top:

- **Your place is kept everywhere.** Pause on your phone, resume in the
  browser at your desk - progress, bookmarks, and playback speed follow you.
- **Streaming from anywhere**, with seeking, chapters, covers, and fast
  search across thousands of books.
- **Multiple people, separate progress** - everyone gets their own account,
  and you decide who sees what.
- **A player designed for audiobooks** - chapter-aware seeking, a sleep
  timer, adjustable speed, offline downloads - instead of a generic file
  player.

And because the files remain the source of truth, you can stop using
AudioSilo at any time and your library is just... still a folder of files.

### Can I run it on a Raspberry Pi or another low-power box?

Yes. The server is a single Go binary with a pure-Go database - no heavyweight
runtime - and its search and browsing are built to stay fast on modest
hardware even with large libraries. GitHub Releases include Linux builds for
both **amd64** and **arm64** (as tarballs and `.deb`/`.rpm` packages), so a
Raspberry Pi running a 64-bit OS works out of the box. There's currently no
32-bit ARM build, so older Pis on a 32-bit OS aren't covered.

See [Install the binary](./getting-started/install-binary.md) to get set up.

## The project

### Where does the project live?

AudioSilo is developed in the open on GitHub, in three repositories plus this
documentation:

- [audiosilo-server](https://github.com/KodeStar/audiosilo-server) - the
  server (API, admin console, web player hosting)
- [audiosilo-frontend](https://github.com/KodeStar/audiosilo-frontend) - the
  player app (web, iOS, Android)
- [audiosilo-manager](https://github.com/KodeStar/audiosilo-manager) - the
  desktop manager
- [audiosilo-docs](https://github.com/KodeStar/audiosilo-docs) - this
  documentation

Bug reports and feature requests are welcome as GitHub issues on the matching
repository.
