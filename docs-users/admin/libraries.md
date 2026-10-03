---
title: "Libraries"
description: "Adding, editing, ordering, rescanning, exporting and deleting libraries in the AudioSilo admin console, correcting folder detection, and what happens when a library's folder goes missing."
---

A **library** is a folder on the server that AudioSilo reads for audiobooks.
You can have several - for example one for fiction, one for kids - and control
per person which ones (or which parts of them) are visible via
[shares](sharing.md).

Libraries live under **Library > Libraries** in the
[admin console](console-tour.md) ("Folders AudioSilo reads. Your files stay
where they are."). Each library is a card with a few of its newest covers, its
name, its status, its folder and its book count.

![The Libraries page](/img/screenshots/admin/libraries.png)

The status next to the name is one of:

- **Online** - the folder is readable and nothing is running.
- **Scanning** - a scan is running; a progress bar under the card counts
  "*X* of *Y* books checked" (or "Looking for books..." while it is still
  finding them). A running scan wins over the other states: a **Retry** on an
  unavailable library shows **Scanning** while it runs.
- **Folder unavailable** - AudioSilo can't read the folder right now. See
  [When a library folder goes missing](#when-a-library-folder-goes-missing).

Everything else you do to a library is on its card: **Rescan**, and the **⋯**
menu with **Edit name and folder...**, **Folder detection...**, **Export book
list** and **Delete library...**.

## Adding a library

Click **Add library** (or choose **Add a library** in the
[command palette](console-tour.md#search-and-commands)). The **Add a library**
dialog asks for just two things:

- **Name** - a display name, e.g. `Fiction`.
- **Folder** - the folder on the server's own disk, e.g. `/srv/audiobooks`.
  Type it, or click **Browse** to pick it.

![Adding a library with the folder picker open](/img/screenshots/admin/library-add.png)

**Browse** lists the server's folders, one level at a time - from the folder
you typed if it exists, otherwise from the top of the server's disk. Click a
folder's name to open it, use the path above the list (or **Up one folder**)
to go back, then click **Choose** next to a folder, or **Use this folder** for
the one you're in. A few details:

- Picking a folder fills in the **Name** from the folder's name if you haven't
  typed one.
- Only folders are listed, never files, and hidden folders (names starting
  with a dot) are left out.
- A folder that another library already uses says so ("Already the folder of
  *name*").
- Very large folders show only their first 1,000 subfolders; type the path if
  yours isn't listed.

There is no layout or structure to choose. As the dialog says, AudioSilo works
out which folders are books by itself.

Click **Add library and scan**. The library appears straight away and its
first scan starts ("The first scan has started. Covers fill in as books are
found."). Listeners don't have to wait: the folder view works immediately, and
books are indexed as the scan progresses (or on demand when someone opens one).

:::warning Library folders must be on the server
The folder must be one the **server itself** can read directly. If your
audiobooks live on a NAS or network share (SMB/NFS), mount the share on the
server machine first and point the library at the mount point - you can't
enter a network URL. If the server runs in Docker, mount the folder into the
container and use the in-container path (see
[Quickstart with Docker](../getting-started/quickstart-docker.md)); the
**Browse** list shows the container's folders, not the host's.
:::

## Editing a library

**⋯ > Edit name and folder...** renames the library or points it at another
folder (with the same **Browse** picker). Saving rescans the library
("AudioSilo is rescanning it now."). When you change the folder, listening
progress follows the books the scan finds again at the same place inside the
new folder.

If you're reorganising, prefer moving files *within* the existing folder:
progress follows moved files automatically (see
[Organizing your library](../getting-started/organizing-your-library.md)).

## Rescanning

Click **Rescan** on a library to re-index it - after you've added, removed,
renamed or re-tagged files. The button reads **Scanning...** while the scan
runs, the progress bar fills, and a toast says "Finished scanning *name*" when
it is done - even for a scan so short the progress bar barely shows. You can keep working in the console meanwhile. The
[command palette](console-tour.md#search-and-commands) can rescan a library
too.

Scans also run automatically:

- for every library **when the server starts**,
- when a library is **added** or **edited**,
- when you change a **folder detection** setting (below).

A rescan never touches your files - it only rebuilds AudioSilo's index of them.
Listening progress and bookmarks are keyed to file paths, so they survive
rescans, and even survive moving or renaming a book's folder (the scanner
recognises moved files and carries progress across).

## Library order

Drag a library by its handle to reorder the list. With a keyboard, focus the
handle, press **Space** (or **Enter**) to pick the library up, move it with the
arrow keys, and press **Space** again to drop it (**Escape** cancels). On a
wide screen the small up and down arrows beside the handle move a library one
place.

The hint under the list sums up what the order means: "Players list libraries
in this order. When the same book is in two libraries and both copies are
equally good, the one in the higher library is used."

"Equally good" has a precise meaning. When the same book is in more than one
library, search and "recently added" show it once, and AudioSilo picks the
**best-quality copy**: the better format (M4B/AAC over MP3 over anything else),
then a single-file copy over a multipart one, then the higher bitrate. Only when
all of that ties does the copy in the higher library win. Put your primary
library first.

## Folder detection

AudioSilo works out what is a book on its own, using one simple rule:

- **A folder that directly contains audio files is one book**, and all those
  files are its parts - whether that's a single `.m4b` or fifty numbered
  `.mp3` chapters.
- The only exception is the **top level of the library**: loose audio files
  sitting directly in the library's folder are each treated as an individual,
  single-file book.

That matches how most people organise audiobooks (one folder per book, usually
inside author or series folders). But one layout genuinely can't be guessed: a
folder that holds **many unrelated single-file books** - say a `Short Stories`
folder containing thirty standalone `.mp3` files. By the rule above, that
folder would be indexed as one giant thirty-part "book".

That's what **⋯ > Folder detection...** is for. It opens the library's folders
so you can correct any the detector gets wrong:

![The folder detection dialog](/img/screenshots/admin/detection.png)

Click a folder's name to open it. Folders AudioSilo already treats as a book
say "Detected as one book" (with the book's title). Each folder has a choice of:

- **Automatic** - the default; let AudioSilo decide.
- **One book** - force the folder to be a single book (all its audio files are
  its parts).
- **Separate books** - treat each audio file in the folder as its own book.
  This is the fix for the "folder of standalone single-file books" case.

A change is saved the moment you make it, and the library rescans to apply it
("Rescanning *name* to apply it.").

:::tip
These settings are durable, not scan results - they survive rescans and even a
full index rebuild. Set one once and forget it.
:::

## Exporting a library

**⋯ > Export book list** downloads the library's book list as a `.json` file
(named after the library and today's date, e.g.
`audiosilo-fiction-2026-09-21.json`).

The file is meant for [AudioSilo Meta](../community/meta-site.md), the community
metadata site: open its **Watching** page at
[meta.audiosilo.app](https://meta.audiosilo.app) and import the file to mark
which entries of a series you already own, so the site can show you what you are
missing and what is coming next.

It is a plain list of books - title, authors, narrators, series and position,
ASIN/ISBN, runtime and chapter count. Nothing about your server goes into it:
**no file paths, no folder names, no file sizes or formats, and not the
library's folder**. It is safe to hand to the site or keep as a record of what
a library holds.

:::note
Export covers the **whole** library, not just the parts you have shared with a
particular person.
:::

## Deleting a library

**⋯ > Delete library...** asks you to type the library's name to confirm, then
says exactly what goes: it "removes the library and its books from AudioSilo,
with everyone's progress, bookmarks and notes in it. The folder and its files
are not touched."

:::warning Everyone's progress in the library goes too
Deleting a library removes what AudioSilo knows *about* it for every person:
their listening progress, bookmarks, notes and listening history for books in
that library, its folder detection settings, and any of its folders you had
added to shares. Your audio files are never touched. Don't delete and re-add a
library to "refresh" it - use **Rescan** for that, or **Edit name and
folder...** to point it somewhere new.
:::

## When a library folder goes missing

If a library's folder becomes unreachable - the classic case is a network
share that unmounted after a reboot - AudioSilo protects the index rather than
"helpfully" syncing with an empty folder:

- A scan that finds the folder **missing or unreadable** stops without removing
  anything.
- A scan that finds the folder **suddenly empty** while books are still indexed
  also stops - that pattern almost always means a dropped mount, not a
  genuinely emptied folder.

The console shows it plainly. The library's status reads **Folder
unavailable**, its **Rescan** button becomes **Retry**, and the card says
**Safety stop: nothing was deleted** - "AudioSilo can't read *folder*, so it
kept all *N* books and everyone's progress. If it's a network share, mount it,
then retry." (A library that has no books yet says "AudioSilo can't read this
folder" instead.) A scan that stops this way ends with a "Scan of *name*
stopped" toast. The [overview](console-tour.md#the-overview) shows the same
notice, and the health line at the top of every page names the offline
library. Once the folder is back, **Retry** shows **Scanning** while it runs,
then the status returns to **Online**.

The console counts a folder as unavailable when it is missing, can't be read,
doesn't answer within a couple of seconds (a hung network mount can't freeze
the page), is empty while books are still indexed under it, or when the last
scan stopped at this safety check.

The user-visible effect for listeners: the library's books **stay listed** in
the apps and the book counts don't drop; playback of those books fails until
the folder is back. Everyone's progress and bookmarks are safe throughout. Once
you've remounted the share (or fixed permissions), click **Retry** and
everything picks up where it left off.
