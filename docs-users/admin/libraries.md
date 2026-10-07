---
title: "Libraries"
description: "Adding, editing, ordering, rescanning, exporting and deleting libraries in the AudioSilo admin console, scan schedules and skipped files, whether book details come from tags or folder names, correcting folder detection, and what happens when a library's folder goes missing."
---

A **library** is a folder on the server that AudioSilo reads for audiobooks.
You can have several - for example one for fiction, one for kids - and control
per person which ones (or which parts of them) are visible via
[shares](sharing.md).

Libraries live under **Library > Libraries** in the
[admin console](console-tour.md) ("Folders AudioSilo reads. Your files stay
where they are."). Each library is a card with a few of its newest covers, its
name, its status, its folder and its book count - and, when it is scanned on a
schedule, the schedule and when the next scan is due ("Every 6 hours · next in
5 hr"). A library that takes its book details from folder names says "Details
from folder names" (see
[Where book details come from](#where-book-details-come-from)).

![The Libraries page](/img/screenshots/admin/libraries.png)

The status next to the name is one of:

- **Online** - the folder is readable and nothing is running.
- **Scanning** - a scan is running; a progress bar under the card counts
  "*X* of *Y* books checked" (or "Looking for books..." while it is still
  finding them). A running scan wins over the other states: a **Retry** on an
  unavailable library shows **Scanning** while it runs.
- **Waiting** - a scan is queued behind another library's. Scans run one at a
  time; the **Rescan** button reads **Queued** until this one starts. See
  [Jobs](health.md#jobs).
- **Folder unavailable** - AudioSilo can't read the folder right now. See
  [When a library folder goes missing](#when-a-library-folder-goes-missing).

Everything else you do to a library is on its card: **Rescan**, and the **⋯**
menu with **Edit library...**, **Folder detection...**, **Export book list**
and **Delete library...**.

## Adding a library

Click **Add library** (or choose **Add a library** in the
[command palette](console-tour.md#search-and-commands)). The **Add a library**
dialog asks for two things:

- **Name** - a display name, e.g. `Fiction`.
- **Folder** - the folder on the server's own disk, e.g. `/srv/audiobooks`.
  Type it, or click **Browse** to pick it.

Under them are two optional scan settings, **Scan automatically** and **Skip
these files and folders** - see [Scanning on a schedule](#scanning-on-a-schedule)
and [Skipping files and folders](#skipping-files-and-folders) - and **Book
details come from** (see
[Where book details come from](#where-book-details-come-from)). You can leave
them all as they are and set them later.

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

**⋯ > Edit library...** opens the **Edit *name*** dialog: "Rename the library,
point it at another folder, or change how it's scanned."

![Editing a library: the folder, the scan settings and where book details come from](/img/screenshots/admin/library-edit.png)

- **Name** and **Folder** (with the same **Browse** picker).
- **Scan automatically** and **Time** - see
  [Scanning on a schedule](#scanning-on-a-schedule).
- **Skip these files and folders** - see
  [Skipping files and folders](#skipping-files-and-folders).
- **Book details come from** - see
  [Where book details come from](#where-book-details-come-from).

Click **Save changes**. Changing the **folder** or the **skipped files**
rescans the library ("AudioSilo is rescanning it now."); renaming it or
changing its schedule doesn't, since the books haven't changed. Changing where
book details come from doesn't rescan either: every book in the library is
updated as you save. When you
change the folder, listening progress follows the books the scan finds again
at the same place inside the new folder.

If you're reorganising, prefer moving files *within* the existing folder:
progress follows moved files automatically (see
[Organizing your library](../getting-started/organizing-your-library.md)).

## Rescanning

Click **Rescan** on a library to re-index it - after you've added, removed,
renamed or re-tagged files. The button reads **Scanning...** while the scan
runs, the progress bar fills, and a toast says "Finished scanning *name*" when
it is done - even for a scan so short the progress bar barely shows. You can
keep working in the console meanwhile. The
[command palette](console-tour.md#search-and-commands) can rescan a library,
or every library at once, too.

Scans run **one at a time**. If another library is being scanned, yours waits
its turn: the card says **Waiting** and the button **Queued** until it starts.
**Health > Jobs** shows what is running and waiting, lets you stop a scan or
cancel a waiting one, and keeps a history of every scan with its log (see
[Jobs](health.md#jobs)).

Scans also run automatically:

- for every library **when the server starts**,
- when a library is **added**, or its **folder** or **skipped files** change,
- when you change a **folder detection** setting (below),
- on the library's **schedule**, if you set one (below).

A rescan never touches your files - it only rebuilds AudioSilo's index of them.
Listening progress and bookmarks are keyed to file paths, so they survive
rescans, and even survive moving or renaming a book's folder (the scanner
recognises moved files and carries progress across).

## Scanning on a schedule

AudioSilo notices new books when you rescan, when someone opens one in the
folder view, and when the server starts. If you add books to the folder
regularly (from another computer, or a download tool), let the library rescan
itself: **⋯ > Edit library...**, then **Scan automatically**:

- **Off** - the default; scan only when you ask (and at startup).
- **Every hour**, **Every 3 hours**, **Every 6 hours**, **Every 12 hours**,
  **Every 24 hours** - counted from when the library's last scan started,
  whatever started it, so a rescan you run by hand pushes the next one back.
- **Daily at a set time** - pick the **Time**. It is in the **server's** time
  zone, which may not be yours. If the server was off at that time, the scan
  runs as soon as it is back.

The library's card then shows the schedule and the next scan ("Daily at 03:00
· next in 7 hr"), and **Health > Jobs** lists every schedule. A scheduled scan
waits its turn like any other.

## Skipping files and folders

Some folders hold audio that isn't an audiobook: publisher sample clips, an
`Extras` folder of interviews, a podcast someone dropped in. **Skip these
files and folders** (in **⋯ > Edit library...**) lists what AudioSilo should
leave out. One pattern per line:

| Pattern | Skips |
|---|---|
| `*.sample.mp3` | every file ending in `.sample.mp3`, in any folder |
| `Extras/` | every folder named `Extras`, wherever it is, with everything in it (the trailing `/` means folders only) |
| `Podcasts/*` | everything inside the `Podcasts` folder at the top of the library (a `/` in the middle means "starting at the library folder") |
| `/Extras` | only the `Extras` folder at the top of the library (a `/` at the start also means "starting at the library folder") |
| `# publisher samples` | nothing: a line starting with `#` is a note to yourself |

A pattern without a `/` (or with one only at the end) matches a file or
folder name anywhere in the library; `*` stands for any run of characters and `?` for one character.
Upper and lower case don't matter. You can have up to 100 patterns. A pattern
the server can't use is refused when you save, with the line named under the
box.

Saving new patterns rescans the library: books the patterns now cover are
removed from the library (your files stay where they are) and books they no
longer cover come back. This works even if the patterns cover every book in
the library - AudioSilo doesn't mistake that for a missing folder. Skipped files are hidden from the folder view too,
and can't be opened from it. The patterns are stored by AudioSilo, not in a
file in your library folder - AudioSilo never writes there.

## Where book details come from

**Book details come from** (in **⋯ > Edit library...**, or when adding a
library) decides where the library's books take their title, author, series
and series number from:

- **The files' tags first** - the default. The audio files' tags are used,
  and the folder names fill in whatever the tags leave empty (see
  [Where titles, authors and series come from](../getting-started/organizing-your-library.md#where-titles-authors-and-series-come-from)).
- **Folder names first** - for a library whose folders are named well and
  whose tags aren't. The folders are read as `Author / Series / 03 - Title`:
  the top folder is the author, the folder holding the book is the series,
  and the book's own folder (or file) name is the title, with a leading number
  read as its number in the series. A book directly inside its author's folder
  (`George Orwell/Animal Farm`) gets an author and a title but no series from
  the folders. Disc and track folders (`CD1`, `Disc 2`) are parts of the book
  above them, never its title.

Whichever comes second fills what the first leaves empty, so with **Folder
names first** the tags still give the narrator, and a series for a book the
folders don't name one for. A tag title that is exactly the folder's name,
number and all (`13 Reasons Why`), is kept whole, so a number that is part of
the title isn't read as a series number.

Changing this setting updates every book in the library at once, without a
rescan, and your own edits (and values you accepted from community metadata)
stay on top. On a book's page, the values taken from the folders are marked
**Path** (see [Editing details](books.md#editing-details)). Switching back to
**The files' tags first** puts the tags' values back.

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
- **Always one book** - force the folder to be a single book (all its audio
  files are its parts). On a folder whose audio is only in disc folders
  (`CD1`, `CD2`, ...), it joins the discs into one book: see
  [Books split into disc folders](#books-split-into-disc-folders).
- **Separate books** - treat each audio file in the folder as its own book.
  This is the fix for the "folder of standalone single-file books" case.

The dialog offers **Always one book** only where it changes something: on a
folder that is a book, on one holding disc folders to join, or on one that is
already set. A folder of books (an author's or a series' folder) can't be made
one book. **Separate books** isn't offered on a folder of disc folders, which
has no files of its own to split.

A change is saved the moment you make it, and the library rescans to apply it
("Rescanning *name* to apply it.").

:::tip
These settings are durable, not scan results - they survive rescans and even a
full index rebuild. Set one once and forget it.
:::

### The Folders page

**Library > Folders** makes the same choice with more room. Pick a library
(when you have more than one), then a folder in the tree. Folders
that are books are marked **Book**, and folders you have pinned say **Always
one book** or **Separate books**.

![Library > Folders](/img/screenshots/admin/folders.png)

For the selected folder the page asks "How should AudioSilo read this
folder?" and shows the three choices as cards, each with what it would mean
for this folder (for example "Here: one book with 3 files." or "Here: 12
books."), then the folder's audio files. If the folder is a book, **Open book**
opens its [book page](books.md#a-books-page). A folder with no audio files of
its own has nothing to choose; the folders inside it are read on their own.
The exception is a folder of disc folders, which can be joined into one book
(below).

As in the dialog, a choice is saved the moment you make it and the library
rescans ("Rescanning *name*. Listening progress moves with each file."). The
**Change detection** button on a book's page opens its folder here.

### Books split into disc folders

A book ripped from CDs often sits in one folder per disc, with no audio in the
book's own folder:

```text
Audiobooks/
└── Terry Pratchett/
    └── Mort/
        ├── CD1/
        │   ├── 01.mp3
        │   └── 02.mp3
        ├── CD2/
        └── CD3/
```

By the folder-per-book rule each disc reads as its own book, and Library >
Folders tells you so: open `Mort` and it says the folder "holds no audio files
of its own, only disc folders (CD1, CD2...)". Choose **Always one book** there
("Here: 3 disc folders become one book, in disc order.") and AudioSilo reads
the discs as one book:

- The discs play **in disc order**, counting numbers the way people do, so
  `CD2` comes before `CD10`. Within each disc the files keep the order they had
  as a book of their own. A chapter taken from a file name is led by its disc
  ("CD2 - 01"), since disc rips number their tracks from 1 again on every disc.
- Folder names AudioSilo recognises as discs are `CD`, `Disc` or `Disk`
  followed by a number, with or without a space (`CD1`, `Disc 2`, `Disk 03`).
  The join needs at least two of them, directly in the folder, and nothing else
  with audio beneath it. A single disc folder already reads as one book.
- **Listening progress carries over**: everyone's position moves onto the
  joined book's timeline (a listener who got furthest on any disc keeps that
  furthest point), and so do bookmarks, notes, listening history and sessions.
  A favourite on any disc becomes a favourite of the joined book.
- Your **edits, custom cover and ASIN/ISBN** on the discs are copied to the
  joined book, field by field, the first disc winning where two discs differ.
  The cover is the image in the book's own folder, else the first disc's.
- Without ffprobe (see [Transcoding](server.md#transcoding)) a disc's length can
  be unknown. Then AudioSilo can't tell where the later discs start, so their
  listening progress stays with the disc rather than landing in the wrong place.
  The scan's log says so (see [Jobs](health.md#history)).

The joined book isn't a new book: it doesn't count as new in the scan, and no
"books added" notification goes out for it. The
[Health page](health.md#the-kinds-of-issue) lists folders like this under
**One book split into disc folders**, with a button that does the same thing.

AudioSilo never joins discs on its own: you choose it. And **Always one book**
joins only a folder of disc folders. Set on any other folder without audio of
its own (an author's or a series' folder, say), it still does nothing, so an
older setting like that never merges a series into one book.

To undo it, set the folder back to **Automatic**. Each disc becomes its own
book again: your edits and covers on the discs are still there, and
progress made on the joined book stays with the joined book ("progress on the
one book is kept for it, not split back"). Join the folder again later and it
comes back.

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
library to "refresh" it - use **Rescan** for that, or **Edit library...** to
point it somewhere new.
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
library, as does [Health > Issues](health.md#when-a-library-is-offline). Once
the folder is back, **Retry** shows **Scanning** while it runs, then the
status returns to **Online**.

The console counts a folder as unavailable when it is missing, can't be read,
doesn't answer within a couple of seconds (a hung network mount can't freeze
the page), is empty while books are still indexed under it, or when the last
scan stopped at this safety check.

The user-visible effect for listeners: the library's books **stay listed** in
the apps and the book counts don't drop; playback of those books fails until
the folder is back. Everyone's progress and bookmarks are safe throughout. Once
you've remounted the share (or fixed permissions), click **Retry** and
everything picks up where it left off.
