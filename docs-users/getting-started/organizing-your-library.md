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

Audible's protected `.aax` and `.aaxc` files are **not** supported. Add DRM-free audio files instead.

### A book's ebook

A DRM-free **EPUB** beside a book's audio is that book's ebook, opened with **Read the ebook**. Put one `.epub` in the book's folder, or give it the same name as a single-file book (`Project Hail Mary.m4b` and `Project Hail Mary.epub`). See [Read the ebook](../listening/reading-the-ebook.md#which-books-have-it).

## Where titles, authors and series come from

AudioSilo takes each book's details from these sources:

- **Folder names.** The book's folder (or file) is the title, its parent folder the series, and the folder above that the author. A leading number like `03 - Title` is the book's place in the series (`02.5` works too). `Author/Title/` with no series folder works as well.
- **The files' tags.** Title (usually the album tag), author, narrator, series and genres. AudioSilo ignores junk titles like "Track 01".
- **Audiobookshelf's `metadata.json`**, when the book's folder has one. See [Coming from Audiobookshelf](#coming-from-audiobookshelf).
- **The audio itself**: durations and any chapters in the file.
- **The community database**, for chapters only: a book with no chapters of its own gets them once it is [matched](../admin/books.md#community-chapters).

By default tags win over folder names. If your folders are named well and your tags aren't, set the library to [folder names first](../admin/libraries.md#where-book-details-come-from). You can fix anything still wrong in the admin console without touching the files. See [Fix book details](../admin/books.md).

### Names like `Author; Series; Book 04; Title`

Some tools name each book `Author; Series; Book NN; Title`, for example `Mark Tufo; Indian Hill; Book 04; From The Ashes`. AudioSilo reads the series and number from such a name, wherever the folder sits. The title part is optional.

- `Book 04` is number 4, and `Book 2.5` is 2.5.
- `Book 01-05` is a box set of books 1 to 5.
- `Book XX` and `Book 00` put the book in the series with no number.

With tags first, a series tag in the files still wins. With folder names first, the name wins.

### When the album tag is the series

Many tools put the series name in the album tag, so every book in a series has the same album. AudioSilo spots this and takes the book's own title from its title tag, file name or folder name instead. A book named after its series, like `Dune`, keeps the album as its title.

## Coming from Audiobookshelf

Audiobookshelf can leave a `metadata.json` file in each book's folder (its **Store metadata with item** setting). AudioSilo reads it, so your matches and corrections from Audiobookshelf come across.

- Its title, authors, narrators, series, description, genres, ASIN, ISBN and similar details win over the tags.
- A book with an ASIN or ISBN in the file counts as [matched](../admin/books.md#matching-with-community-metadata) straight away.
- Your edits in the admin console still win over the file.
- When the file changes, the next scan picks it up.

AudioSilo never writes to the file. To ignore these files, add `metadata.json` to the library's [skipped files](../admin/libraries.md#skipping-files-and-folders). To bring listening progress across, see [Import your Audiobookshelf history](../admin/import.md).

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
