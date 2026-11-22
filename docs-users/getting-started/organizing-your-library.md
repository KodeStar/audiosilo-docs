---
title: Organize your audiobook files
description: "How AudioSilo reads your audiobook folders: one folder per book, supported formats, where names and covers come from, and why moving files is safe."
---

AudioSilo reads your books folder as it is. There is no import step and no required naming scheme. Your files stay the source of truth, and AudioSilo never changes them.

## One folder = one book

**A folder that holds audio files is one book.** Its files are the book's parts, played in name order. Numbers count as numbers, so `2 - The Road.mp3` plays before `10 - The End.mp3`.

```text
Audiobooks/                          ← the library folder
├── Terry Pratchett/
│   └── Discworld/
│       ├── 01 - The Colour of Magic/
│       │   └── The Colour of Magic.m4b        ← one file, one book
│       └── 02 - The Light Fantastic/
│           ├── Part 01.mp3                    ← many files, still ONE book
│           ├── Part 02.mp3
│           └── cover.jpg
└── Project Hail Mary.m4b                      ← loose file at the top: its own book
```

Loose audio files at the top of the library are each their own book. So a flat folder of `.m4b` files works too.

:::tip[Books split into CD1, CD2 folders]
Each disc folder counts as its own book at first. Set the folder holding the discs to **Always one book** to join them (see [Books split into disc folders](../admin/libraries.md#books-split-into-disc-folders)).
:::

### When a folder holds many separate books

A folder of unrelated single-file books, like `Short Stories/` holding three `.m4b` stories, would become one three-part book. To fix it, set a **per-folder override** in the admin console:

1. Go to **Library > Libraries**.
2. In the library's menu, choose **Folder detection...**.
3. Set the folder to **Separate books** (every file is its own book) or **Always one book**.

Overrides survive rescans. See [Folder detection](../admin/libraries.md#folder-detection).

### More than one recording of a book

Keep each recording in its own folder, such as `The Hobbit (Rob Inglis)/` and `The Hobbit (Andy Serkis)/`, or in different libraries. Each is a book of its own, with its own progress.

With community metadata on, the players still show them together: one spine on a series page and an **Other recordings in your library** card on the book's page. That works once each recording is matched to the same book in the community database, by its ASIN or ISBN or by an admin. See [Recordings of the same book](../admin/books.md#recordings-of-the-same-book).

## Supported formats

AudioSilo plays these audio files:

- **M4B / M4A / MP4** (the usual audiobook files)
- **MP3**
- **FLAC**
- **OGG / Opus**
- **MKA** (Matroska audio), which needs ffmpeg on the server (the Docker image has it):
  - with **MP3** inside, the usual kind, it plays everywhere, downloads included;
  - with **other audio** inside (AAC, Opus, FLAC), it plays in the web player. An iPhone can't play it; an Android phone may. Convert it to `.m4b` or `.mp3` to listen in the apps.

Other files, like `.jpg`, `.nfo` or `.pdf`, are hidden from browsing.

Audible's protected `.aax` and `.aaxc` files are **not** supported. Add DRM-free audio files instead. A [Bridge](./running-a-bridge.md) can [back up the Audible books you bought](../admin/audible.md) into your library as files that play.

### A book's ebook

A DRM-free **EPUB** beside a book's audio is that book's ebook, opened with **Read the ebook**. Put one `.epub` in the book's folder, or give it the same name as a single-file book (`Project Hail Mary.m4b` and `Project Hail Mary.epub`). See [Read the ebook](../listening/reading-the-ebook.md#which-books-have-it).

## Where titles, authors and series come from

AudioSilo takes each book's details from these sources:

- **Folder names.** The book's folder (or file) is the title, its parent folder the series, and the folder above that the author. A leading number like `03 - Title` is the book's place in the series (`02.5` works too). `Author/Title/` with no series folder works as well.
- **The files' tags.** Title (usually the album tag), author, narrator, series and genres. AudioSilo ignores junk titles like "Track 01".
- **Audiobookshelf's `metadata.json`**, when the book's folder has one. See [Audiobookshelf's metadata.json files](#coming-from-audiobookshelf).
- **The audio itself**: durations and any chapters in the file.
- **The community database**, for chapters only: a book with no chapters of its own gets them once it is [matched](../admin/books.md#community-chapters).

By default tags win, and folder names fill in what the tags leave empty. You can [use folder names first](../admin/libraries.md#where-book-details-come-from) or [edit a book's details](../admin/books.md).

### Names like `Author; Series; Book 04; Title`

A file or folder named `Mark Tufo; Indian Hill; Book 02; Bastion` gives "Bastion", book 2 of Indian Hill.
At the library root it also gives the author, Mark Tufo. Disc folders such as `CD1` directly inside it use those details.

- `Book 2.5` sorts between books 2 and 3. `Book XX` and `Book 00` leave the number blank.
- `Book 01-05` and `Books 01-05` both cover books 1 to 5. With no title at the end, `Bruno Miller; Dark Road; Books 01-05` gives "Dark Road 1-5". That also works with the album "Dark Road" if the files give no other book title.

With tags first, a number in the tags wins. A series tag without a number takes the folder's number only for the same series. "Expanse" and "The Expanse" count as a match here.

### When the album tag is the series

When the album names a known series, AudioSilo looks for the book's title in its title tag, filename or folder. A book named after its series, like `Dune`, keeps the album title.

### A book made of several files

With tags first, the album usually names the book. When files name different chapters, the folder can supply the title if the album is missing or looks like the series. For example, chapter files in `The Dragon Reborn` can share the album "The Wheel of Time" and still display as "The Dragon Reborn".

AudioSilo also checks whether the title tags name the book.

- With no album, a shared title tag wins. "Dune (Part 1)" and "Dune (Part 2)" give "Dune".
- Files in `Leviathan Wakes` tagged "The Expanse Box Set: Leviathan Wakes" keep that full title, because the folder matches its end.
- In `Book 2`, tags like "The Wheel of Time: The Great Hunt - Chapter 1" and "The Wheel of Time: The Great Hunt - Chapter 40" give "The Great Hunt".

Folders named `03`, `Book One`, `Mistborn Book One`, `Files`, `MP3`, `HP1`, an ASIN or an ISBN leave the title to the files. So does an author folder: files tagged "The Martian" by Andy Weir, directly in `Andy Weir`, keep that album.

If AudioSilo cannot open the last file it needs for this check, the book keeps its current title until its files change or you choose [**Read the files again**](../admin/books.md#a-books-page). A title you edited always stays.

## Audiobookshelf's metadata.json files {/* #coming-from-audiobookshelf */}

Audiobookshelf can leave a `metadata.json` file in each book's folder. It does so only with its **Store metadata with item** setting on, which is off by default (see [Move over from Audiobookshelf](coming-from-audiobookshelf.md)). AudioSilo reads the file, so your matches and corrections from Audiobookshelf come across.

- Its title, authors, narrators, series, description, genres, ASIN, ISBN and similar details win over the tags.
- Authors or narrators listed separately in the file stay separate, even when a name holds a comma (`Le Guin, Ursula K.`).
- A book with an ASIN or ISBN in the file counts as [matched](../admin/books.md#matching-with-community-metadata) straight away.
- Your edits in the admin console still win over the file.
- When the file changes, the next scan picks it up.

AudioSilo never writes to the file. To ignore these files, add `metadata.json` to the library's [skipped files](../admin/libraries.md#skipping-files-and-folders).

## Covers

AudioSilo looks for a cover in this order:

1. An image named `cover.jpg`, `cover.jpeg`, `cover.png`, `folder.jpg` or `folder.png` beside the audio.
2. Any image in the book's own folder. (A loose single-file book only uses the names above.)
3. Artwork inside the audio file.

So embedded art shows with no setup, and a `cover.jpg` in the book's folder overrides it. A cover uploaded in the admin console wins over all three (see [Covers](../admin/books.md#covers)).

## Renaming and moving are safe

Listening progress, bookmarks and notes stay with your books when you change things:

- **Fix the tags** and nothing is lost. The next scan reads the new tags.
- **Rename or move a book** and the server follows it. Your progress and bookmarks move to the new place automatically.

## Good to know

**Books on a network share.** Mount the SMB or NFS share on the server machine, then point the library at the mounted folder. If the share drops, AudioSilo doesn't treat the books as deleted. They come back when the share does.
