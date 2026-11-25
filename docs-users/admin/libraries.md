---
title: "Add and manage libraries"
description: "Add a library folder in the admin console, then rescan, schedule, edit, export or delete it, and fix how its folders are read."
---

A **library** is a folder on the server that AudioSilo reads for audiobooks or
podcasts. You add and manage libraries in **Library > Libraries** in the
[admin console](console-tour.md). You can have several, for example one for
fiction and one for kids, and use [shares](sharing.md) to choose who sees which.

## Adding a library

1. Open **Library > Libraries** and click **Add library**.
2. Choose the **Kind**: **Books** or **Podcasts**. You can't change it later.
3. Type a **Name**, for example `Fiction`. Each library needs a name of its own.
4. Type the **Folder** on the server, for example `/srv/audiobooks`, or click
   **Browse** to pick it.
5. Click **Add library and scan**.

The library appears straight away and its first scan starts. Books appear
as the scan finds them. Listeners can already open and play a book from
[Folders in the player](../listening/browsing.md#folders) while the scan runs. Such a book still counts as **New** and is included in the
**New books added** notice when the scan finishes.

A **Books** library usually has a folder of its own. When the folder is
another books library's, sits inside one or holds one, the console asks first.
Each book would then be listed twice, once in each library. **Add anyway** goes
ahead. Changing a library's folder asks the same, with **Save anyway**.

![Adding a library with the folder picker open](/img/screenshots/admin/library-add.png)

The form also has a scan schedule, files to skip and where book details come
from. You can leave them as they are and set them later. See
[Scanning on a schedule](#scanning-on-a-schedule),
[Skipping files and folders](#skipping-files-and-folders) and
[Where book details come from](#where-book-details-come-from).

There is no layout to choose for a **Books** library. AudioSilo works out which
folders are books by itself (see [Folder detection](#folder-detection)).

:::warning[Library folders must be on the server]
The folder must be one the **server itself** can read. If your audiobooks are
on a NAS or network share, mount the share on the server machine first and use
the mount point. If the server runs in Docker, mount the folder into the
container and use the path inside the container (see
[Quickstart with Docker](../getting-started/quickstart-docker.md)).
:::

### Podcast libraries

[Podcasts](podcasts.md) need a Bridge and the Podcasts module. A podcast library
needs its own folder. It can't share, contain or sit inside another library's
folder. Mount the same folder read-write in the Bridge. See
[Set up a podcast library](podcasts.md#set-up-a-podcast-library).

Folder detection, book details and exports apply only to **Books** libraries.

## Editing a library

![The Libraries page](/img/screenshots/admin/libraries.png)

Each library is a card with its name, status, folder and book count. Its **⋯**
menu holds everything else you can do to it.

To rename a library, point it at another folder or change how it's scanned:

1. Click **⋯ > Edit library...**.
2. Change what you need.
3. Click **Save changes**.

![Edit library with the metadata source and its explanation below the scan settings](/img/screenshots/admin/library-edit.png)

**Book details come from** lets you give file tags or folder names first choice.

![The Archive library and the confirmation that its books are switching metadata sources](/img/screenshots/admin/library-source-background.png)

For a large library, the server confirms the change and keeps updating the books in the background.

Changing the folder or the skipped files rescans the library. When you change
the folder, listening progress follows the books found at the same place
inside the new folder.

If you're reorganising, move files *within* the library's folder where you
can. Progress follows them (see
[Organize your audiobook files](../getting-started/organizing-your-library.md)).

**From your config** marks a library declared in `config.yaml`, both on its
card and in the setup flow. The console locks its name, folder and **Delete
library...** action. To change its name or folder, edit the file and restart.
You can still change its scan settings here.

## Rescanning {/* #rescanning */}

Click **Rescan** on a library after you add, remove, rename or re-tag files. You
can keep working while it runs, and a message says when it has finished. The
[command palette](console-tour.md#search-and-commands) can also rescan one
library or all of them.

Scans run one at a time. A library waiting its turn says **Waiting**.
[Health > Jobs](health.md#jobs) shows what is running and waiting, and keeps a
history of every scan.

Scans also run on their own when the server starts, when a library's settings
change, and on its [schedule](#scanning-on-a-schedule).

A rescan never touches your files. Listening progress and bookmarks survive
rescans, and follow a book when you move or rename its folder.

:::tip[Faster scans]
With ffmpeg 7.1 or 8.1, which the official Docker images have, the server
reads most files itself, so a first scan finishes much sooner (see
[ffmpeg and ffprobe](../getting-started/install-binary.md#ffmpeg-and-ffprobe)).
On a slow disk or busy network share you can make scans do fewer things at
once with `scan.concurrency` in `config.yaml`, then restart (see the
[configuration reference](/developers/server/configuration#library-scans-scan)).
:::

## Scanning on a schedule

If you add books to a library regularly, let it rescan itself. Open
**⋯ > Edit library...** and pick **Scan automatically**:

- **Off**: the default. Scan only when you ask, and when the server starts.
- **Every hour** up to **Every 24 hours**: counted from when the last scan
  started, so a rescan by hand pushes the next one back.
- **Daily at a set time**: pick the **Time**, in the **server's** time zone. If
  the server was off then, the scan runs as soon as it is back.

For a podcast library, the schedule only re-indexes the files the Bridge has
saved. It doesn't set how often feeds are checked.

## Skipping files and folders

Some folders hold audio that isn't an audiobook, such as sample clips or an
`Extras` folder. List what to leave out in **Skip these files and folders**
(in **⋯ > Edit library...**), one pattern per line:

| Pattern | Skips |
|---|---|
| `*.sample.mp3` | every file ending in `.sample.mp3`, in any folder |
| `Extras/` | every folder named `Extras`, wherever it is (the trailing `/` means folders only) |
| `Podcasts/*` | everything inside the `Podcasts` folder at the top of the library |
| `/Extras` | only the `Extras` folder at the top of the library |
| `metadata.json` | the `metadata.json` files Audiobookshelf leaves in book folders (see [Audiobookshelf's metadata.json files](../getting-started/organizing-your-library.md#coming-from-audiobookshelf)) |
| `# publisher samples` | nothing: a line starting with `#` is a comment |

`*` stands for any run of characters and `?` for one character. Upper and lower
case don't matter.

Saving rescans the library. The scan removes skipped books from the library,
but your files stay where they are.

## Where book details come from {/* #where-book-details-come-from */}

**Book details come from** (in **⋯ > Edit library...**) decides where books
take their title, author, series and series number from:

- **The files' tags first**: the default. Folder names fill in whatever the
  tags leave empty. For a book of several files the folder can also give the
  title (see [A book made of several files](../getting-started/organizing-your-library.md#a-book-made-of-several-files)).
- **Folder names first**: for a library whose folders are named well but whose
  tags aren't. The files' tags fill in whatever the folders leave empty.

Both settings read [names like `Author; Series; Book 04; Title`](../getting-started/organizing-your-library.md#names-like-author-series-book-04-title).
An Audiobookshelf `metadata.json` in a book's folder wins over both.

Changing this updates the books without a rescan. A large library finishes in
the background, so for a while some books can still show the old details. Your
own edits stay on top. On a book's page, values taken from folders are marked **Path** (see
[Editing details](books.md#editing-details)).

## Library order

Drag a library by its handle to reorder the list. Players list libraries in
this order.

When the same book is in two libraries, AudioSilo shows it once and uses the
better copy. When both are equally good, the higher library wins.

## Folder detection

AudioSilo works out what is a book with one rule: **a folder that directly
contains audio files is one book**, and those files are its parts. Loose audio
files at the top of the library are each a book of their own.

One layout can't be guessed: a folder of many unrelated single-file books, such
as a `Short Stories` folder of thirty standalone `.mp3` files. By the rule, it
reads as one thirty-part book.

To fix that, click **⋯ > Folder detection...**, open the folder and choose:

- **Automatic**: the default. AudioSilo decides.
- **Always one book**: all its audio files are one book. On a folder of disc
  folders, this joins the discs (see
  [Books split into disc folders](#books-split-into-disc-folders)).
- **Separate books**: each audio file in the folder is its own book.

![The folder detection dialog](/img/screenshots/admin/detection.png)

Your choice is saved at once and the library rescans. It survives rescans and
even a full index rebuild.

**Always one book** is refused while an Audible backup is set to go into a disc
folder directly inside this folder (see
[Choosing a destination](audible.md#choosing-a-destination)).

### The Folders page

**Library > Folders** makes the same choice with more room. Pick a library and
a folder in the tree. The page shows the three choices with what each would
mean for that folder ("Here: 12 books."), then the folder's audio files.

![The first 10,000 audio files in A Christmas Carol total 84 MB and 5 hours 22 minutes. The list shows the first 500.](/img/screenshots/admin/folders.png)

If the folder is a book, **Open book** opens its [book page](books.md#a-books-page).
On the book's page, **Change detection** opens its folder here. You can
choose **Always one book** before the library's first scan has read the folder.

**Audio files in this folder** counts the audio files directly inside the folder
and shows their combined size, and their total length when every file's length
is known. The list shows up to 500 files, with a note when there are more.

In a folder with more than 10,000 items, the totals cover the first 10,000 and
the file list says so. The counts in the three choices, and the message after
you choose **Separate books**, then say **at least**. Folders count first, so a folder holding more
than 10,000 other folders can show no audio files at all.

Use the arrow keys to move through the folder tree and Enter to select a folder.
**Show more** loads up to 500 more items. A direct link to a folder opens it
even when its parent has more items than the tree shows, and a link to a
missing folder says it isn't there any more.

### Books split into disc folders

A book ripped from CDs often has one folder per disc, with no audio in the
book's own folder:

```text
Audiobooks/
└── Terry Pratchett/
    └── Mort/
        ├── CD1/
        ├── CD2/
        └── CD3/
```

By the folder rule each disc reads as its own book. To join them:

1. Open the book's folder (`Mort`) in **Library > Folders**.
2. Choose **Always one book**.

The discs then play as one book, in disc order. Everyone's progress, bookmarks
and notes move onto the joined book. Disc folders are named `CD`, `Disc` or
`Disk` and a number. To undo it, set the folder back to **Automatic**.

The [Health page](health.md#the-kinds-of-issue) lists folders like this, with a
button that joins them.

## Exporting a library

**⋯ > Export book list** downloads the library's book list as a `.json` file.
It is meant for [AudioSilo Meta](../community/meta-site.md). Import it on the
site's **Watching** page to see which books of a series you are missing and
what is coming next.

It holds each book's details, but **no file paths, folder names or tags**, so it
is safe to share.

### Exporting with file paths and tags

**⋯ > Export with file paths and tags...** makes a fuller list for your own
scripts, with each copy's path, tags and description. Keep this file to
yourself. Don't post it publicly or upload it to AudioSilo Meta.

Both exports cover the **whole** library, not just the parts shared with one
person.

## Deleting a library

Click **⋯ > Delete library...** and type the library's name to confirm.

:::warning[Everyone's progress in the library goes too]
Deleting a library removes everyone's listening progress, bookmarks, notes and
listening history for its books, its folder detection settings and its folders
in shares. Your audio files are never touched. To refresh a library, use
**Rescan** instead.
:::

A library set in `config.yaml` can't be deleted here. Remove it from
`config.yaml` and restart.

## When a library folder goes missing

If the server can't read the folder, or a folder with indexed books suddenly looks empty, AudioSilo stops the scan. It keeps the books and everyone's progress. Listeners can still see the books, but playback needs the folder back.

The library card shows **Folder unavailable**. The notice names the folder and, on Linux and macOS, the server's user and group IDs. It also shows the folder owner's IDs when the server can read them. You can find the same notice on the [Overview](console-tour.md#the-overview) and in [Health](health.md#when-a-library-is-offline).

![An offline library card showing the folder, the account IDs, the books kept and the Retry button](/img/screenshots/admin/library-offline.png)

Mount the share again or give the server account permission to open and list the folder. Click **Retry**. After a successful scan the card shows **Online**.
