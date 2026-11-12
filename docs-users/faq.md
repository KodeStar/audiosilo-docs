---
title: FAQ
description: Quick answers about AudioSilo's formats, storage, backups, privacy, users and hardware.
---

Quick answers to common questions. For problems, see [Troubleshooting](./troubleshooting.md).

## Formats and playback

### What audio formats are supported?

`.m4b`, `.m4a`, `.mp4`, `.mp3`, `.flac`, `.ogg`, `.opus` and `.mka`. A single `.m4b` and a folder of `.mp3` files both play as one book with chapters. `.mka` needs ffmpeg on the server.

Audible's protected `.aax` and `.aaxc` files are not supported. See [Supported formats](./getting-started/organizing-your-library.md#supported-formats).

### Do I need ffmpeg?

It's optional, but recommended. The Docker image includes it, and the standalone program downloads it if your system lacks it.

- **ffprobe** reads lengths and chapters for the few files AudioSilo can't read itself. Without it, those files have no length or chapter list.
- **ffmpeg** converts formats a browser can't play, lets every player play an `.mka` book with MP3 inside, and places [community chapters](./admin/books.md#community-chapters) precisely. Without it, books a browser can't play work only in the apps, where the phone can decode them.

[Health > System](./admin/health.md#system) shows whether each was found. See [ffmpeg and ffprobe](./getting-started/install-binary.md#ffmpeg-and-ffprobe).

### Is there a web version, or do I need the apps?

Both. The server has a **web player** built in at `/web`. It works in any current browser (Safari 16.4, Chrome 111, Firefox 128 or newer) and can be added to your home screen. The [iOS and Android apps](./listening/mobile-apps.md) add more phone features.

### Can I install the Android app without the Google Play Store?

Yes. Each app release on GitHub has an APK. The Play Store app and the APK can't update each other, so pick one. See [Android without Google Play](./listening/mobile-apps.md#android-without-google-play).

### Does it work offline?

Yes. Download a book and it plays with no connection, in the apps and in the web player over HTTPS. Progress syncs when you're back online. See [Listen offline](./listening/offline-downloads.md).

## Your library and your data

### Can my books live on a NAS or network share?

Yes. Mount the share on the server machine, then point the library at the mounted folder. If the share drops, the server keeps your books and progress until it's back.

### Is my listening progress safe if I reorganize or re-tag my files?

Yes. Re-tagging changes nothing. If you move or rename a book, the server notices and moves your progress and bookmarks with it.

### What should I back up?

- **Your audiobook folders.** AudioSilo never changes them.
- **The server's data folder** (`--data`, or `/data` under Docker). It holds the settings and the database with accounts, progress and bookmarks. The `meta-mirror` folder can be left out.

The server also backs up its database every night by itself (see [Backups](./admin/backups.md)). Those backups don't include `config.yaml`, so copy the data folder somewhere else too.

### Where does the extra "About this book" information come from?

From the **community database**, a free audiobook database that people build together. It adds descriptions, characters, recaps, series and chapters. Your admin can switch these lookups off.

Three names come up across these docs:

- **AudioSilo Meta** is the website, [meta.audiosilo.app](https://meta.audiosilo.app). You can browse the database there and add to it yourself. See [Use the community metadata site](./community/meta-site.md).
- **The community database** is the data: the descriptions, characters, recaps, series and chapters.
- **Community metadata** is what your server looks up in the database and shows with your books. It is also the name of the settings section where your admin turns the lookups on or off.

### Does my server tell anyone which books I have?

Only what a lookup needs:

- **Community metadata** sends a book's ASIN or ISBN to meta.audiosilo.app. Matching a book also sends details like its title and author (see [Server settings](./admin/server.md#community-metadata)). The server never sends listener details or full file paths. A match can send up to three names from the book's path (its author, series and book folders) as search terms.
- **Help complete the community database** (off by default) sends, once a day, the ASINs the database doesn't know. See [Helping complete the community database](./admin/server.md#helping-complete-the-community-database).
- **Podcast search** sends the search text to Apple Podcasts or Podcast Index. See [Searching podcast directories](./admin/podcasts.md#searching-podcast-directories).
- **The update check** asks GitHub once a day for the newest version. See [What the update check sends](./admin/server.md#what-the-update-check-sends).

To avoid lookups over the internet, your admin can [keep a local copy](./admin/server.md#keeping-a-local-copy) of the community database, or switch community metadata off. Until the copy is ready, or if it fails, lookups still go online. The daily report above, when it's on, still goes online.

### Can other people on my server see what I'm listening to?

Other listeners can't, unless you both turn on [See what others are listening to](./listening/in-the-house.md). Your admin can see everyone's listening in [Activity](./admin/activity.md#what-the-server-records).

## Users and sharing

### How many users can I have, and can I limit what each one sees?

There's no limit. Each person gets their own progress, bookmarks and favourites. Invite people with an invite code (see [Invite people](./admin/users-and-invites.md)). People can also add the [household members](./listening/household.md) they live with.

To limit what someone sees, use **shares**: sets of folders you grant to people. See [Sharing](./admin/sharing.md).

## Running the server

### Why do I need a server at all? My files already sit in a folder.

The folder stays exactly as it is. The server adds:

- **Your place everywhere.** Pause on your phone, carry on in the browser.
- **Streaming from anywhere**, with chapters, covers and fast search.
- **Separate accounts** for everyone, with their own progress.
- **Audiobook features**: sleep timer, speed, offline downloads.

Stop using AudioSilo and your library is still a folder of files.

### Can I run it on a Raspberry Pi or another low-power box?

Yes, on a 64-bit OS. Releases include Linux builds for **amd64** and **arm64**. There's no 32-bit ARM build. See [Install without Docker](./getting-started/install-binary.md).

### Why does `docker stats` show more memory than the server uses?

`docker stats` adds file cache to the server's own memory. Linux keeps recently read parts of your books and the database in memory, and counts some of that against the container. The kernel hands it back as soon as anything else needs memory.

The first scan reads every book's tags, chapters and covers, so the cache can be as big as the server itself. Playing a book adds very little. The server streams the file from disk without loading it into memory.

To see the split, run this from your AudioSilo folder:

```sh
docker compose exec audiosilo sh -c 'grep -E "VmRSS|RssAnon" /proc/$(pidof audiosilo)/status; grep -E "^(anon|file|active_file) " /sys/fs/cgroup/memory.stat'
```

- **RssAnon** (or **anon**) is the memory the server itself holds.
- **file** is the file cache. Its **active_file** part is what `docker stats` adds on top.

Without Docker, run `grep -E "VmRSS|RssAnon" /proc/$(pidof audiosilo)/status`. Other apps' `docker stats` figures include their file cache too, so compare them the same way.

## The project

### Where does the project live?

On GitHub:

- [audiosilo-server](https://github.com/KodeStar/audiosilo-server): the server, admin console and web player hosting
- [audiosilo-frontend](https://github.com/KodeStar/audiosilo-frontend): the player app (web, iOS, Android)
- [audiosilo-bridge](https://github.com/KodeStar/audiosilo-bridge): the optional Bridge
- [audiosilo-meta](https://github.com/KodeStar/audiosilo-meta): the community metadata database
- [audiosilo-docs](https://github.com/KodeStar/audiosilo-docs): this documentation

Bug reports and feature requests are welcome as GitHub issues on the matching repository.
