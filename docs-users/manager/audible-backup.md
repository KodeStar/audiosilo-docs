---
title: "Backing up your Audible library"
description: "Download the audiobooks you own from Audible, remove the DRM with your own account's keys, and place them on your server as ordinary M4B files."
---

## What this is

The manager includes a full Audible backup tool (in the spirit of Libation or
OpenAudible): it signs in to **your** Audible account, lists the audiobooks you've
bought, downloads them, removes Audible's DRM using **your own account's per-book
keys**, and places the resulting ordinary **M4B** files into a library on your
server - where any AudioSilo player (or anything else that plays M4B) can use
them.

:::warning For your own use only
This exists to let you **preserve audiobooks you bought**, on your own equipment,
for your own listening - the same books your account is licensed for, decrypted
with your account's own keys. It does not remove DRM from anything you don't own,
and the results are for personal use, **not for redistribution**.
:::

You'll need **ffmpeg 4.4 or newer** installed (it does the DRM removal). If it's
missing, the import fails immediately with a message telling you so - on macOS,
`brew install ffmpeg` fixes it.

## One Audible account per library

Audible is set up **per library**: open a server's Libraries list and choose
**Manage → Audible** on the library you want to back up into. Each library can use
a different Audible account (handy for households). The library also needs its
[host path](organizing.md#setting-a-librarys-host-path) set, since backups land
there like any other import.

## Signing in to Audible

1. Pick your **marketplace** - the Audible storefront your account lives on
   (`us`, `uk`, `de`, `fr`, `ca`, `it`, `au`, `in`, `jp`, `es`, `br`).
2. Click **Log in to Audible**. Your normal web browser opens Amazon's real
   sign-in page - the manager never sees your password, and any two-factor
   prompts happen in the browser as usual.
3. After you finish signing in, Amazon lands on a page that **looks broken** - it
   may say "Looking for something?" / "page not found", or appear blank. **That's
   expected.** What matters is the address bar: it now starts with
   `https://www.amazon.<domain>/ap/maplanding?…`.
4. Copy that **entire URL** from the address bar, paste it into the **Redirect URL**
   field in the manager, and click **Complete login**.

The manager registers itself as a device on your account and stores the resulting
credentials on your computer, encrypted with a key held in your operating system's
keychain. **Log out** removes them.

## Your library, cross-checked against the server

Once signed in, the **Backup** tab loads your owned Audible books and immediately
cross-checks them against the server library.

![The Audible backup tab: owned books split into To import and Already on server, with destinations](/img/screenshots/manager/audible.png)

- Books are split into **To import**, **Already on server**, and **All** tabs, so
  you can see at a glance what a backup would actually fetch.
- Matching is automatic - by Audible ID where the server knows it, otherwise by a
  tolerant author/series/title comparison. When a fuzzy match is confirmed, the
  manager quietly records the book's Audible ID on the server, so future checks
  are exact.
- The **Destination** column shows where each new book would land, using the same
  [auto or template placement](organizing.md#auto-placement-matching-your-existing-conventions)
  as a manual import.
- Some titles are tagged **not downloadable** (hover the tag for the reason):
  Audible shows/periodicals released as episodes, titles your account has no
  download rights for (typically a Plus title that left the catalog), and
  pre-orders. They can't be selected - Audible refuses a download license for
  them, so the manager says why up front instead of failing mid-import.

Each row has a **⋯ menu** with the manual fixes:

- **Match…** - the automatic match is wrong or missing? Browse the library and
  point the book at the right item on the server.
- **Locate folder…** - the suggested destination isn't where you keep that
  series? Browse the library, pick a folder, and the book is placed inside it,
  keeping its own folder and filename; the picker shows the exact resulting
  path before you confirm. Say a new book wants to go to
  `Various/Halo/Evolutions/` but you already have a top-level `HALO` folder:
  pick `HALO` and it lands at `HALO/Evolutions/` instead.
- **Remove match** / **Remove folder choice** - undo either manual fix.

Your manual matches and folder choices are **remembered**, even across manager
restarts, until you remove them.

## Backing up: what actually happens

Tick the books you want and click **Import N selected**. For each book, in order:

1. **Download** - the manager requests that book's license from Audible (which
   includes the book's decryption key, tied to your account) and downloads the
   protected file, with a live progress bar.
2. **Remove DRM** - ffmpeg decrypts it using that key. This is a **lossless
   repackage**, not a re-encode: the audio bytes are untouched, and **chapters,
   book metadata, and the cover image are all kept**. The result is a standard
   `.m4b`.
3. **Transfer** - the M4B is placed into the library at its planned destination
   (over SFTP or local copy, atomically and size-verified, like any
   [import](organizing.md#importing-books)).
4. **Clean up** - the encrypted download is deleted the moment it's decrypted,
   and the temporary M4B is deleted once it's safely on the server. Only the
   placed copy remains.

Books already on the server are skipped automatically. When everything finishes,
the manager triggers one library rescan and waits for it, so the books appear in
your player right away; the summary spells out anything that failed, per book, so
you can retry just those.

Downloads are staged in a temporary folder inside the manager's data directory -
transient copies never pass through your library folder.

## Beyond backup

The same Audible view offers two more tools, covered in
[Organizing and importing books](organizing.md):

- **Series & Gaps** - [find books missing from series you own](organizing.md#finding-gaps-in-your-series),
  and watch series for new releases.
- **Sync stats** - [reconcile listening positions](organizing.md#syncing-listening-stats)
  between Audible and your server, furthest-position-wins.
