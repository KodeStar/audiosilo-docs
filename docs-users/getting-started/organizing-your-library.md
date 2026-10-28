---
title: Organizing your library
description: "How AudioSilo reads your audiobook folders: the folder-per-book convention, detection overrides, supported formats, metadata, covers, and why moving files is safe."
---

## Organizing your library

AudioSilo has no import step and no required naming scheme. It reads your books folder as-is: the files on disk are the source of truth, and the server only builds a searchable index over them - one it can rebuild at any time. You keep organizing your files however you like; this page explains how AudioSilo interprets what it finds.

### One folder = one book

The core rule is simple: **a folder that directly contains audio files is one book**, and all the audio files in it are that book's parts, played in the natural order of their names: numbers count as numbers, so `2 - The Road.mp3` plays before `10 - The End.mp3`. This matches how most collections are already organized (and how tools like Audiobookshelf expect them):

```text
Audiobooks/                          ← the library root
├── Terry Pratchett/
│   └── Discworld/
│       ├── 01 - The Colour of Magic/
│       │   └── The Colour of Magic.m4b        ← one file, one book
│       └── 02 - The Light Fantastic/
│           ├── Part 01.mp3                    ← many files, still ONE book
│           ├── Part 02.mp3
│           └── cover.jpg
└── Project Hail Mary.m4b                      ← loose file at the root: its own book
```

It doesn't matter whether a book folder holds a single `.m4b` or fifty numbered `.mp3` chapter files - the folder is the book. Padded numbers (`01`, `02`, …) and plain ones (`1`, `2`, … `10`) both play in the right order.

:::note[Upgrading from a version before 2.4.0]
Older versions played a book's files in strict character order, so `10` came before `2`. Any book whose files now sort differently is re-read at its next scan and then plays in the new order. Someone partway through such a book may find their place in it has moved. Chapters your [Bridge](../admin/bridge.md) found for the book move with their files.
:::

The one exception is the **library root** itself: loose audio files sitting directly in the root are each treated as an individual single-file book, so a simple "flat folder of m4b files" library works with no folders at all.

:::tip
If a book is split across `CD1`/`CD2`-style subfolders, each disc folder counts as its own book at first. Set the book's folder to **Always one book** in the admin console and AudioSilo joins the discs into one book, in disc order, carrying over everyone's progress (see [Books split into disc folders](../admin/libraries.md#books-split-into-disc-folders)). The Health page points such folders out for you.
:::

### When a folder holds many standalone books

One layout the automatic rule gets wrong on purpose: a folder that holds a pile of *unrelated* single-file books, like:

```text
Audiobooks/
└── Short Stories/
    ├── The Dead.m4b
    ├── The Gift of the Magi.m4b
    └── The Yellow Wallpaper.m4b
```

By the folder-per-book rule, `Short Stories` would become one three-part "book". The fix is a **per-folder override**, set from the admin console. Instead of **Automatic**, each folder can be pinned to one of two modes:

- **Separate books** - every audio file in this folder is its own book (what you want for `Short Stories` above).
- **Always one book** - force this folder to be one book, if the detector ever splits something that belongs together. On a folder of disc folders (`CD1`, `CD2`, ...) it joins the discs into one book.

Overrides are set with **Folder detection...** in a library's menu (**Library > Libraries** in the admin console), and they stick - they survive rescans and index rebuilds. See [Libraries](../admin/libraries.md) for a walkthrough.

![The folder detection dialog in the admin console](/img/screenshots/admin/detection.png)

### Supported formats

AudioSilo recognizes these audio file types (upper or lower case):

- **M4B / M4A / MP4** - the common audiobook containers (AAC audio)
- **MP3**
- **FLAC**
- **OGG / Opus**
- **MKA** (Matroska audio) - needs ffmpeg on the server (the Docker image has it). Browsers and iPhones can't open this container, so:
  - an `.mka` with **MP3** inside, the usual kind, is sent to every player as a plain MP3 file: a lossless copy the server makes the first time and keeps in its data folder (see [Server > Transcoding](../admin/server.md#transcoding)). It plays in the web player and the phone apps, seeks normally, and downloads for offline listening;
  - an `.mka` with **other audio** inside (AAC, Opus, FLAC) plays in the **web player**, converted to MP3 as it streams. The phone apps list such a book but may not play it (an iPhone can't; an Android phone can when it decodes the audio inside); to listen there, convert it to `.m4b` or `.mp3`.

  An `.mka` beside a file of the same name in another format (`Book.m4b` and `Book.mka`) is left out, as the other file's source or copy.

Anything else in your folders - `.jpg` covers, `.nfo` files, `.pdf` companions - is simply ignored and hidden from browsing, so everything you can click in the player is playable.

### A book's ebook

An **EPUB** beside a book's audio is that book's ebook, which the web player and the iOS and Android apps open with **Read the ebook**: one `.epub` in a book's folder (two or more, and none is used), or `<name>.epub` beside a book that is a single audio file (`Project Hail Mary.m4b` and `Project Hail Mary.epub`). It must be DRM-free. Like any other non-audio file it isn't listed when you browse folders; a scan finds it, with no re-index. See [Reading the ebook](../listening/reading-the-ebook.md#which-books-have-it).

:::note[Audible files (.aax / .aaxc)]
Audible's DRM-protected files are deliberately **not** indexed: the server can never play them, since they need per-account decryption. Add supported, DRM-free audio files to your library folder instead.
:::

### Where titles, authors and series come from

For each book, AudioSilo starts with the names on disk, then lets the audio files' embedded tags override them when they're present and meaningful:

- **From your folders**: the book's folder (or file) name becomes the title; a leading number like `03 - The Title` is read as its position in a series, decimals included, so a novella between books 2 and 3 named `02.5 - The Title` is number 2.5 (from 2.5.0; an older server read it as 2) (but not a number that runs into the name, like `3rd Rock` or `20,000 Leagues Under the Sea`); the parent folder is read as the series and the folder above that as the author. A book with only one folder above it (`Author/Title/`) takes that folder as its author, with no series. So an `Author/Series/03 - Title/` or an `Author/Title/` layout works with no tags at all.
- **From embedded tags**: a title (audiobooks usually carry it in the *album* tag; when the album holds the series name and the *title* tag carries the full "Series: Book" title, the more specific title tag wins), the author (album artist or artist tag), the narrator (the narrator tag, which Audible and most audiobook tools write into an M4B, or the composer tag when there is none), the series where a tag exists (a series tag that ends in a marked number, like the grouping tag "Discworld, book #40", gives the series Discworld and its position, 40; a name that only ends in a number, like "Metro 2033", stays whole), and the genres in the *genre* tag (several in one tag are split by `;`, never by a comma, which a store's category such as "Mystery, Thriller & Suspense" holds; a genre that only says the file is an audiobook, such as "Audiobook", "Speech", "Spoken Word" or "Other", is left out). Junk tag titles like "Track 01" are ignored in favour of the folder name.
- **From Audiobookshelf's `metadata.json`**, when the book's folder has one: its title, subtitle, authors, narrators, series, published year, description, publisher, language, abridged, genres, tags, ASIN and ISBN go over the tags. See [Coming from Audiobookshelf](#coming-from-audiobookshelf).
- **From ffmpeg's ffprobe**, when available: durations and any chapter list embedded in the file, so a chaptered M4B shows its real chapters in the player.
- **From the community database**, for chapters only: a book whose files have no chapters of their own (one long file, or a folder with one chapter per file) gets the community's chapter list once it is [matched](../admin/books.md#matching-with-community-metadata) and the list fits your copy. A book with only broad chapters can be switched to the community's more detailed ones. See [Community chapters](../admin/books.md#community-chapters).

:::note[Narrators of books already on your server]
Older versions missed an M4B's narrator tag and used its composer tag instead. A book your server had already read keeps that narrator until its files are read again: when a file changes, or when an admin uses [Read the files again](../admin/books.md#a-books-page) on the book. Books added from now on get the narrator tag straight away.
:::

Audiobook tags are famously messy, which is why the folder names always provide a sane baseline - a well-named folder beats a badly-tagged file. If a library's folders are named well and its tags aren't, you can set it to take book details from the [folder names first](../admin/libraries.md#where-book-details-come-from) instead. Anything still wrong can be corrected in the admin console without touching the files: see [Books and metadata](../admin/books.md).

### Coming from Audiobookshelf

If Audiobookshelf manages (or managed) the same folders, it may have left a `metadata.json` file in each book's folder. Audiobookshelf writes one when its **Store metadata with item** setting is on. That file is Audiobookshelf's record of the book, including any match you ran there and any corrections you made, so AudioSilo reads it too:

- The title, subtitle, authors, narrators, series (with their numbers), published year, description, publisher, language, **genres**, **tags**, **ASIN** and **ISBN** in the file go **over** what the audio tags say, as they do in Audiobookshelf. A value the file leaves empty doesn't clear the tag's. The file's chapters aren't read.
- A book the file marks **abridged** is shown as abridged. The file's "not abridged" says nothing, since Audiobookshelf writes it for every book nobody marked, so such a book's abridged stays unknown.
- A book whose file has an ASIN or ISBN counts as [matched](../admin/books.md#matching-with-community-metadata) straight away, so community details and chapters can be looked up for it without matching it by hand.
- Your own edits in the admin console still win over the file, and the book page marks each value the file gave as **Audiobookshelf**.
- When the file changes (you edit the book in Audiobookshelf), the next scan picks the change up without re-reading the audio. If the file goes, its values go with it.

Only a book's own folder counts: a loose audio file at the top of a library takes nothing from a `metadata.json` beside it. AudioSilo never writes to the file. To stop a library using these files, add `metadata.json` to its [skipped files](../admin/libraries.md#skipping-files-and-folders).

### Covers

Cover art is found in this order:

1. A conventionally named image beside the audio: `cover.jpg`, `cover.jpeg`, `cover.png`, `folder.jpg`, or `folder.png`.
2. Inside a book's own folder, any image file will do as a fallback (one with "cover" in its name is preferred over, say, a stray thumbnail). For loose single-file books, only the conventionally named files count - a random image next to twenty loose books would be ambiguous.
3. Failing both, artwork embedded in the audio file itself is used.

So in practice: embedded art just works, and dropping a `cover.jpg` into a book's folder overrides it. A custom cover uploaded in the admin console wins over all three and is stored in AudioSilo's database, not in the folder (see [Covers](../admin/books.md#covers)).

### Renaming and moving are safe

Your listening progress, bookmarks and notes belong to the *file*, not to a database entry - and AudioSilo goes out of its way to keep them attached:

- **Fix the tags** in a file and nothing is lost: the path didn't change, so all your state stays put (and the index re-reads the new tags on the next scan).
- **Rename or move a book** and the server notices: it keeps a lightweight fingerprint of each file, and when a known file disappears from one path and reappears at another, your progress and bookmarks migrate to the new location automatically. That holds even if someone opens the book at its new place (from Folders in the player, say) before the next scan: from 2.5.0 the server looks for the move first, so the book opens with its listening intact.

Reorganize freely - the whole design assumes your library will keep evolving.

:::note[Books on a network share]
Library folders must be paths the server machine can read directly - mount an SMB/NFS share on the host first, then point the library at the mounted path. If the share is unmounted while the server runs, AudioSilo refuses to treat the missing files as deleted, so nothing is pruned and your progress is safe; the books reappear when the share is back.
:::
