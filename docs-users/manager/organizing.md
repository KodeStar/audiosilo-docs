---
title: "Organizing and importing books"
description: "Browse a server's library, import books with automatic series-aware placement, transfer them over SFTP or a local copy, and keep series complete."
---

## How the manager gets books onto a server

Three pieces work together:

1. **A host path per library** - where on the destination machine the manager
   should write that library's files.
2. **A transfer backend per server** - *how* it writes there: a plain copy (a
   folder on this computer, or a mounted network share) or **SFTP over SSH** for a
   remote machine.
3. **A rescan** - after placing files, the manager asks the server to rescan the
   library and waits for it to finish, so new books appear immediately in the
   player.

The server itself never accepts uploads; the manager writes files directly and
the server just indexes what appears on disk.

## Setting a library's host path

In a server's Libraries list, open **Manage → Host path…** on a library. This is
the single destination both the manual import *and* the
[Audible backup](audible-backup.md) write to; **Import…** stays disabled until
it's set.

- With a **local** transfer backend, it's simply the library folder's path on this
  computer (or wherever the share is mounted) - there's a **Browse…** picker.
- With an **SFTP** backend, it's the path *on the remote machine* - and for a
  Docker server, the **host** folder that's mounted into the container (e.g.
  `/srv/audiobooks`), not the in-container path like `/library`. A remote folder
  picker helps you find it.

Servers deployed by the manager have this seeded already.

## Browsing a library

**Manage → Browse…** walks the library as the server sees it: folders, books (with
their title, author, and series), and audio files, with breadcrumbs to jump back
up.

![Browsing a library: folders and recognized books with author and series details](/img/screenshots/manager/library.png)

The view is read-only today - editing actions (rename, retag, convert to M4B) are
planned.

## Importing books

**Manage → Import…** opens the import screen for a library.

![The import screen: discovered books, placement mode, planned destinations, and progress](/img/screenshots/manager/import.png)

1. **Pick a source**: **Choose source folder…** or just drag audiobook files onto
   the window.
2. **Check the details**: the manager reads each book's title, author, series, and
   series number from the files, and shows them in a table - author, series, and
   number are editable, and getting them right is what makes the placement good.
3. **Plan placement**: shows exactly where each book would land, and flags books
   that are **already on the server** (they'll be skipped). Matching is by Audible
   ID when available, otherwise a tolerant author + title comparison, so a
   slightly different title doesn't create a duplicate.
4. **Import**: transfers the files with live per-file progress, then triggers the
   rescan. Each row ends as **placed**, **skipped (already on server)**, or an
   error you can read.

Closing and reopening the import screen keeps your destination and template
settings; they're saved per library.

### Auto placement: matching your existing conventions

In **Auto** mode (the default), the manager mirrors the widely used
`Author/Series/Code## - Title` folder convention - and, crucially, it anchors on
what's **already in the library**:

- If the series already has books on the server, the new book copies their exact
  folder names, series shortcode, and number padding (e.g. an existing
  `C08 - Wintersteel` means book 9 becomes `C09 - …`). Fractional entries like
  novellas are kept (`02.5`).
- If the series is new to the library, a shortcode is guessed from the series
  name's initials and flagged for you to review.
- A book with no series goes directly under `Author/Title`.
- If the author already has a folder, its exact spelling is reused - so
  "L. A. McBride" doesn't create a second folder next to "L.A. McBride".

### Custom templates

Prefer your own scheme? Switch to **Custom template** and edit the path template -
a live preview updates as you type. The default is:

```
{Author}/{ {Series}/ }{ {SHORTCODE}{PaddedSeq} - }{TitleShort}/{OriginalFilename}
```

- **Variables**: `{Author}`, `{Series}`, `{Title}`, `{TitleShort}`, `{Seq}`,
  `{PaddedSeq}`, `{SHORTCODE}`, `{ASIN}`, `{Narrator}`, `{Year}`,
  `{OriginalFilename}`, `{Ext}`.
- **Optional groups**: anything wrapped in `{ … }` disappears entirely when a
  variable inside it is empty - that's how the default template drops the series
  folder for standalone books.
- **Modifiers**: `{Var:upper}`, `{Var:lower}`, `{Var:trim}`, and
  `{PaddedSeq:width=3}` for custom zero-padding.
- `{SHORTCODE}` and the `{PaddedSeq}` padding are still resolved from existing
  series siblings on the server, so "match the library's convention" works in
  template mode too.

## Transfer settings

**⋯ → Transfer settings** on a server chooses how its files are written.

![Transfer settings: local folder or SFTP over SSH, with connection test and host-key trust](/img/screenshots/manager/transfers.png)

- **Local / mounted folder** - the library folder is reachable from this computer
  (same machine, or an SMB/NFS mount). No configuration beyond the host path.
- **SFTP (over SSH)** - for a remote server: host, port, user, and one of **SSH
  agent**, **key file** (with optional passphrase), or **password**. Passwords and
  passphrases go into your operating system's keychain. **Test connection** shows
  the machine's host-key fingerprint the first time; you confirm it with **Trust
  this host**, and every later connection verifies against it.

Either way, writes are careful: each file is copied to a temporary name, verified
by size, and only then renamed into place - so a half-finished transfer never
leaves a broken book - and re-importing something already there is a no-op
("already present").

Servers created through the manager's deploy flows arrive with SFTP pre-configured.
App-wide defaults for the SSH key and username live in
[Settings](#manager-settings).

## Finding gaps in your series

**Manage → Audible → Series & Gaps** finds books you're *missing* from series you
already own from. It needs an Audible login for the library (see
[Backing up your Audible library](audible-backup.md#signing-in-to-audible)).

**Find missing books** groups your owned Audible books by series, looks up each
series' full list of entries, and reports the ones you own on **neither** Audible
**nor** the server - a book you already imported from elsewhere isn't flagged.
Each series card shows how many you own out of the total, the missing entries with
their series numbers, and not-yet-released entries separately (a pre-order isn't
"missing").

Tick **Watch** on a series to opt into background checking: the manager re-checks
watched series periodically (shortly after launch, then about every 12 hours) and
badges the library's **Manage** menu with a count when new books appear. **Check N
watched now** runs the check on demand.

## Syncing listening stats

**Manage → Audible → Sync stats** reconciles listening positions between your
Audible account and your progress on the server - useful when you listen partly in
Audible's app and partly in AudioSilo.

The plan shows each matched book's position on both sides, and the rule is
**furthest wins**:

- Positions further along **on Audible** are written to your server progress when
  you click **Sync**.
- Positions further along **on the server** are written back to Audible **only**
  if you tick the confirmation checkbox - that write path is experimental.
- Books within a few seconds of each other count as in sync; books with no server
  match are listed so you can fix the match from the backup table.

The Audible view shows when stats last synced.

## Manager settings

The **Settings** button in the top bar holds app-wide defaults: a **default SSH
private key path** and **default SSH user**, pre-filled whenever you set up an SSH
connection (deploys and transfer settings) and always overridable per server.

![Manager settings: default SSH key path and user](/img/screenshots/manager/settings.png)
