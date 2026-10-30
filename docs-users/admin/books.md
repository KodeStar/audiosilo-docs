---
title: "Books and metadata"
description: "Browsing and filtering every book in the AudioSilo admin console, fixing titles, authors, series, genres and tags one book at a time or in bulk, where each value comes from, custom covers, chapters (including chapters from the community database), matching with community metadata, merging author spellings and spotting series gaps, with their release dates."
---

The **Library** destination of the [admin console](console-tour.md) is where
you see every book on your server and tidy up what players show about it:
titles, authors, narrators, series, genres and tags, covers and chapter names.

:::info[Your files are never changed]
Every edit you make here is stored in AudioSilo's own database as an
**override**, and it is **locked**: a rescan reads the file again but keeps
your edit. Nothing is ever written to your audio files or book folders, and
you can revert any edit to what the file says.
:::

## Browsing books

**Library > Books** shows every book across all your libraries as a cover
grid. Books without cover art get a generated cover, so the grid never has
holes. Art that isn't square is shown whole, over a blurred copy of itself,
rather than cropped. Click a book's author under its cover to see all their
books.

![Library > Books](/img/screenshots/admin/books.png)

When you aren't searching or filtering, two shelves sit above the full list:

- **Recently added** - the newest books, with how many arrived this week.
- **Continue curating** - "Books that would look better with a minute of your
  attention": books with no cover and, when community metadata is on, books
  not matched to it. Each tile names what's missing.

Above the list:

- **Library** - with more than one books library, show **All** or just one.
  Each choice shows its book count, and a library whose folder can't be read
  says "offline". [Podcast libraries](podcasts.md) aren't offered, here or on
  the other Library screens (their episodes aren't books).
- **Filter books** - type to narrow by title, author, narrator, series, genre or
  tag.
- **Sort** - **Title**, **Author, then series**, **Author surname**, **Series**,
  **Narrator**, **Release date**, **Recently added**, **Longest first** or
  **Largest first**. **Author surname** files "Ursula K. Le Guin" under L.
  **Release date** goes oldest first by the book's **Published** date, or, for a
  book without one, the date in its file's tags (usually when the audiobook was
  released rather than when the book first came out, so matching or editing
  **Published** gives a truer order).
- **View** - **Cover grid** or **Table**. The table has columns for title,
  author, narrator, series, length, format, browser playback, community
  metadata and when the book was added. Click an author, narrator or series
  in the table to see all its books.

![The books table](/img/screenshots/admin/books-table.png)

Every view has its own address, so you can bookmark a filtered list or send
it to another admin. Change the view, the sort or the filters while scrolled
down the list and the page scrolls back to the top of the list; otherwise it
stays where it is.

### Filters

**Filters** opens a panel of choices. Next to each one is how many books it
would show with your other filters applied, so you never pick a filter that
leads nowhere:

- **Library** (when you have two or more book libraries), **Format** (M4B,
  MP3, ...) and **Codec**
- **Playback** - **Plays directly** or **Needs transcoding** (for browsers, judged on the files as stored)
- **Cover** - **Has cover** or **Missing cover**
- **Community metadata** - **Matched** or **Not matched** (only when
  community metadata is on)
- **Chapters** - **Has chapters** or **No chapters**
- **Edited** - books with or without your edits
- **Genre** and **Tag** - the 100 most common genres and tags among the books
  your other filters show. A genre or tag is one choice however it is
  capitalised ("Sci-Fi" and "sci-fi" are one tag), named the way most of its
  books spell it.
- **Length** - **Under 5h**, **5 to 15h**, **15 to 30h** or **Over 30h**
- **Added** - **Last 7 days**, **Last 30 days** or **Last year**

An `.mka` book with MP3 inside counts as **Needs transcoding** here, though
with ffmpeg the server sends it to every player as MP3 (see
[Supported formats](../getting-started/organizing-your-library.md#supported-formats)).

Active filters show as chips above the list (for example "Author: Lewis Carroll").
Click a chip's cross to remove it, or **Clear all**.

A link to an author, narrator or series keeps the library you're looking at.
A series' books open in series order, and an author's in release order, unless
you pick another sort; a sort you pick stays when you change the filters.

### Changing many books at once

Press **Select** in the row above the list (beside **Filters**) to start picking books, or hover a
cover and tick its checkbox (in the table, tick the row, or the header box to
select every loaded book). While you are selecting, clicking a cover or a row
picks it instead of opening the book, and **Select** reads **Done**: pressing
it ends the selection and clears it.

- **Shift-click** a cover or a row to select every book from the last one you
  clicked to this one, in the order the list shows them, in the grid and the
  table alike. Shift-clicking a selected book deselects the run.
- While you are selecting, **Select all *N* books** above the list selects every book shown (it reads
  **Select the *N* books shown** while more are still to load). When your
  filters match more books than have loaded, **Select all *N* matching books**
  loads the rest and selects them all. A bulk action takes up to 1,000 books at
  a time, so past that it reads **Select the first 1,000 matching books**, and
  the line beside it says "Bulk edits and shares take up to 1,000 books at a
  time."

A bar appears at the bottom of the screen with the number selected and two
actions:

- **Edit fields** - set **Author**, **Narrator** or **Series** on every
  selected book. Only the fields you fill in change; where the books disagree,
  the field says how many different values there are, and leaving it blank
  keeps each book's own. One bulk edit covers up to 1,000 books and is saved
  all or nothing. Setting **Series** to one of a book's **Other series** swaps
  the two on that book, as on [a book's page](#editing-details); books that
  don't list that series simply get it as their main series.

  Under **Tags and genres**, **Add tags**, **Remove tags**, **Add genres** and
  **Remove genres** change each book's own list rather than replace it, so
  every book keeps its other tags and genres. Type a label and press Enter or
  a comma. Removing ignores capitals, and adding a tag a book already has
  changes nothing on that book. A label can't be in an add box and a remove
  box at once.
- **Add to share** - add the selected books to a [share](sharing.md). Each
  book is added as one of the share's folders, and everyone with the share
  sees it right away.

**Clear selection** (or Escape, or **Done**) deselects everything.

## A book's page

Click any book to open its page.

![A book's page](/img/screenshots/admin/book.png)

The top of the page shows the cover, the library, the title, then who wrote
and narrated it and where it sits in its series ("by Brandon Sanderson · read
by Michael Kramer · book 1 in The Stormlight Archive"; a book in several series
lists each, "book 8 in Discworld and book 1 in City Watch"). Each name, and the
series, opens **Books** filtered to it. Below that is how many files the book
has, whether browsers can play it directly ("Plays directly", "Transcodes to
MP3 for browsers" or "Browsers can't play this format", judged on the files as
stored, so an `.mka` book with MP3 inside reads "Transcodes to MP3 for
browsers" though the server sends it as MP3) and when it was added. A book
with an ebook beside its audio also shows an **Ebook** chip there (see
[Reading the ebook](../listening/reading-the-ebook.md#which-books-have-it)).
The buttons there are:

- **Match with community metadata** (it reads **Compare with community** once
  the book has an ASIN or ISBN) - see
  [Matching with community metadata](#matching-with-community-metadata).
- **Listen in player** - opens the book in the web player in a new tab,
  already signed in as you, so you can check how it sounds or test its
  chapters without signing in again. The tab signs in with a one-time link
  that works for about two minutes. If the browser blocks the new tab, the
  console says so: allow pop-ups for your server's address and click it again.
  It only shows when your server has the web player.
- **Change cover** - see [Covers](#covers).
- The **⋯** menu (**More book actions**) - **Copy path** (if the browser blocks
  the copy, a message shows the path and stays open for you to copy it by hand),
  **Add to a share...** and **Read the files again**, which re-reads this book's files
  straight away (tags, chapters, cover) without rescanning the whole library -
  handy after you fix a file's tags, or for a file
  [Library health](health.md#the-kinds-of-issue) says couldn't be read.

### Editing details

The **Details** card lists **Title**, **Subtitle**, **Author**, **Narrator**,
**Series**, **Series number**, **Other series**, **Published**, **Publisher**,
**Language**, **Abridged**, **Genres**, **Tags**, **Description**, **ASIN** and
**ISBN**. A book can be in more than one series (Guards! Guards! is book 8 of
Discworld and book 1 of its City Watch novels): **Series** and **Series number**
are its main one, and **Other series** the rest, written on one line with the
book's number after a `#` and the series apart by `;`, for example
`Discworld: City Watch #1; Omnibus`. Matching with community metadata fills it in
for a book in several series.

#### Numbering an omnibus or box set

A book that holds several books of a series (an omnibus of books 1 to 3, say)
takes a range as its **Series number**: type `1-3`. Spaces around the dash, or an
en dash (`1–3`), are fine too. The first number must be above 0, the second above
the first, and the two at most 100 apart. In **Other series**, write the range
after the `#` the same way: `Box Sets #2-4`.

The console then shows the book as `#1-3`, and on the
[Series](#series) page the book fills every place from 1 to 3, so they aren't
listed as missing. In the players, an up-to-date app shows it as `#1-3` and
places it on books 1 to 3 of the series page, and the next book after it is
book 4, not book 2. An older app shows it as book 1. Matching with community
metadata writes a range too, when the community catalogue lists the book that
way. A file whose series tag holds a range (a `series-part` of `1-3`) is read as
one, but a range in a file or folder name isn't, so type it in here.

Click any value to edit it in place. Enter keeps the change (in
**Description**, where Enter starts a new line, use Ctrl+Enter or ⌘+Enter),
Escape cancels.

To make one of the other series the main one, type its name into **Series**,
spelled as in **Other series** (capitals, accents, punctuation and spaces
aside). The two swap places: the old main
series, with its number, moves into **Other series** where the new one was, and **Series number** becomes the book's number
in the new main series (unless you change the number yourself). The fields show
the swap before you save, and **Review and save** lists every value that
changes. If you edit **Other series** yourself in the same go, your list is kept
as you typed it (a **Series number** the swap already filled in stays, so check
it before saving). The swapped values are saved as your edits, so each can be
reverted. Reverting **Series** puts back the series the last scan found, and when
that series is in **Other series** it swaps back the same way (the number then
follows the file again, as before the swap); when the series you had before the
swap was itself an edit, reverting doesn't bring it back.
Matching with community metadata never swaps: the match sets every series itself.

**Genres** and **Tags** are lists, shown as chips. Click them to edit: type a
label and press Enter or a comma to add it (pasting "Fantasy, Epic" adds both),
click a chip's cross to remove it, or press Backspace in the empty box to take
the last one back. Enter in the empty box, or clicking away, keeps the list;
Escape cancels. A label already in the list, in any capitals, isn't added
twice.

Genres come from the audio files' *genre* tag (a genre that only says the file
is an audiobook, such as "Audiobook" or "Spoken Word", is left out) and from an
Audiobookshelf `metadata.json`. Tags come only from a `metadata.json` and your
own edits. Use them however you like: "Owned", "Read with the kids", "Book
club".

**Abridged** is a choice of **Not known**, **Abridged** or **Unabridged**.
Most books start as **Not known**: only an Audiobookshelf file or a community
match that marks the book abridged, or your own choice, says either way.

Books indexed before your server could read these fields get their genres, and
what their `metadata.json` says, on the next scan, without a full re-index.

Each value has a marker saying where it came from:

- **File tag** - read from the audio file's tags.
- **Path** - worked out from the folder and file names.
- **Audiobookshelf** - read from the `metadata.json` file Audiobookshelf keeps
  in the book's folder (see
  [Coming from Audiobookshelf](../getting-started/organizing-your-library.md#coming-from-audiobookshelf)).
- **Edited** - your edit, locked against rescans.
- **Community** - accepted from community metadata.

In a library set to take
[book details from folder names first](libraries.md#where-book-details-come-from),
the title, author, series and series number the folders give are marked
**Path** even when the files have tags of their own.

A few rules keep values sensible, and the field tells you when one is broken:
a book needs a title, a series number is a number like `1` or `2.5`,
**Published** is a year (`2010`, `2010-08` or `2010-08-31`), **Language** is a
name or a code (like `English` or `en-GB`) of up to 64 characters, an ASIN is
10 letters or digits, and an ISBN is an ISBN-10 or ISBN-13 (hyphens are fine).
A genre or tag can be up to 64 characters, and a book can have up to 50 of
each.

Players get every one of these values, and the
[book list export](libraries.md#exporting-a-library) carries them all but
**Description** and the tags, which only the
[export with file paths and tags](libraries.md#exporting-with-file-paths-and-tags)
carries. Search in the players, and **Filter books**
here, find a book by its title, author, narrator, series, genres and tags, and a
listener can [filter their library](../listening/browsing.md#books) by genre and
tag.

### Saving your changes

Edits don't save one by one. Each changed field is marked **Unsaved**, and a
bar at the bottom of the screen counts them ("2 unsaved changes"), with
**Discard** and **Review and save**. **Review and save** shows every change
as "Was:" and "Becomes:" before you confirm. If you try to leave the page with
unsaved changes, the console asks first.

Saved edits are locked, so rescans keep them, and the audio files stay
exactly as they are.

### Reverting an edit

A value held by an edit (yours, or one accepted from community metadata) has
a **Revert** button next to its marker. Hover it to see what the file says.
Reverting puts the field back to what the last scan found, straight away, and
from then on rescans follow the file again. The confirmation has an **Undo**
button in case you clicked the wrong one.

### Chapters

The **Chapters** card shows the book's chapters as a timeline, each chapter
sized by its length and coloured by the file it's in, then the chapter list
(**Show all** for long books). It also tells you when a book has no chapters,
or only one long chapter, since listeners then can't skip around.

Click a chapter's title to rename it. Enter (or clicking away) saves the new
name at once as an override; Escape cancels. A renamed chapter has a revert
button that puts the file's title back.

#### Community chapters

The [community database](https://meta.audiosilo.app) has chapter lists for
most of the recordings it knows. When
[community metadata](server.md#community-metadata) is on, AudioSilo checks
each [matched](#matching-with-community-metadata) book (one with an ASIN or
ISBN) against the chapter list of the exact recording it is matched to, and
the **Community chapters** panel at the top of the Chapters card says what it
found.

:::note[Match the book first]
AudioSilo doesn't read an ASIN from the files' tags, so a book is only checked
once it is matched: with **Match with community metadata** on its page, or
[Match automatically](health.md#matching-every-book-at-once) for many books at
once. Until the first check, a matched book's panel says "Not checked against
the community's chapter lists yet."
:::

Checks run in the background: matching a book (on its page or with **Match
automatically**), editing it, or a scan that finds it changed starts one soon
after, and every ten minutes the server also looks for books due a check. A book is
checked again when its ASIN or ISBN, its length or its number of files
changes, and otherwise once a month. **Check now** (**Check again** once it has
been checked) runs a fresh check straight away, fitting the chapters again; the panel says "Checking the
community's chapters for this copy..." until it finishes.

**How the chapters are fitted.** Your copy is rarely timed exactly like the
community's: an intro or the closing credits may be trimmed, a publisher's
preview of another book may be missing from the end, and releases drift by a
few seconds over many hours. So AudioSilo first pins the places where your copy
and the community's agree: the book's own chapters whose titles match a
community chapter at about the same time, and the boundaries between its
files. The community chapters in between are spread in proportion, then each
is moved onto the pause in the audio where the chapter break is, starting just
before the reading resumes. For example, Stephen Fry's *Mythos* as one M4B
with 34 broad chapters gets the community's 173 detailed ones, each starting on
its pause (the 174th, "Preview: Chapter 1 from Odyssey", isn't in that copy).
Pauses are found with ffmpeg, the tool the server already uses to convert
audio for browsers; without it, chapter starts may be a few seconds off.

What the panel says, and what it offers:

| The panel says | What it means | The button |
|---|---|---|
| "Using the community's *N* chapters: the files have none of their own." | The book had no chapters (none at all, or a folder book with only one chapter per file), so the community's are used **automatically**. | **Use the file's chapters** goes back to the files' own. |
| "The community has *N* detailed chapters that fit this copy (the file has *M*)." | Every chapter the book has is also a community chapter, and the community divides them more finely. The book is also listed under [More detailed chapters available](health.md#the-kinds-of-issue) on the Health page. | **Use detailed chapters**. |
| "The community titles *N* chapters differently." | The same chapters at the same times, with other titles. | **Review titles** lists each one with its community title and "Now *current title*". **Use** takes one title, **Use all *N* titles** takes them all. They are saved as ordinary chapter renames, so each can be reverted. |
| "The community divides this copy into *N* chapters, differently from the file's *M*." | The community's chapters fit the audio, but break it in different places. | **Use the community's**. |
| "The file's chapters match the community's." | Nothing to do. | None. |
| "The last check didn't finish (the community service didn't answer, or it ran out of time), so this is the one before. Check again later." | A note under the panel's line: the last check failed, and the panel shows the result before it. | **Check again** |
| "The book has changed since the last check (other files or a new match), so its chapters wait for the next one." | The files or the match changed after the check, so its result is set aside and the book keeps its own chapters until it is checked again (within about 10 minutes, or **Check again**). | None. |
| "Using the community's *N* detailed chapters in place of the file's *M*." (or "*N* chapters in place of the file's") | You chose the community's chapters. | **Use the file's chapters** switches back. |
| "The community has *N* chapters that fit this copy. You chose the file's chapters." | A book without chapters of its own, where you switched back to the files. | **Use the community's**. |

When the community's chapters can't be used, the panel says why:

- **Another edition** - "The community's chapters are for another edition:
  this copy runs *11h 42m*, theirs *15h 3m*." The audio
  is a different cut of the book (abridged, another narrator's release, a
  different edition), so the lengths don't agree.
- **Chapters don't line up** - "The community's chapters don't line up with
  this copy's own." Too few of the book's own chapters match community ones.
- **A chapter crosses into the next file** - "The community's chapter
  “*title*” runs from *02.mp3* into *03.mp3*, so it can't be played as one
  chapter of a file." In a book made of several files, every chapter has to
  start and end inside one file. "Merging the files into one (an M4B, say)
  would let the community's chapters fit."
- "The community has no recording for this book's ASIN or ISBN."
- "The community has no chapter list for this recording."

Two notes can appear under the panel's line: "Not in this copy: *titles*." for
community chapters your copy doesn't have (a preview, end credits), and "*N*
chapter starts couldn't be matched to a pause and may be a few seconds off."
when community chapters are in use but some starts couldn't be placed on a
pause.

Your choice is kept like your other edits: rescans keep it, and switching back
to the file's chapters restores them exactly as they were, renames included.
You can rename a community chapter like any other (the revert button's hint
shows the community's title). Nothing is written to your files. Listeners get
community chapters as ordinary chapters, in every version of the apps, and the
book's chapter list in the player ends with "Chapters from the AudioSilo
community database".

#### Chapters found in the narration

A book that is one audio file with no chapter markers can get chapters from your
[Bridge](bridge.md), which finds them in the narration (see
[Books without chapters](generating-characters-and-recaps.md#books-without-chapters)).
While the book uses them, the Chapters card says **Found in the narration on this
server.**, with **Use the file's chapters** to turn them off.

![The Chapters card with chapters found in the narration](/img/screenshots/admin/book-chapters-generated.png)

Turned off, the book goes back to its file's own (none, or one long chapter), and
the card says "Chapters found in the narration are saved for this book, but the
file's were chosen." with **Use automatic**, which brings them back. Found
chapters (and [Detect chapters](health.md#the-kinds-of-issue)) are only used when
no chapter source is chosen, so **Use automatic** also shows for a book whose
chapter source you chose another way ("The file's chapters were chosen for this
book."). You can rename a found chapter like any other: the revert button's hint
shows the narration's title ("Found: *title*"). When the book's job to find its
chapters ends, the card shows them straight away.

### Read-along

A book with an ebook has a **Read-along** card under Chapters, while it has a
read-along or your Bridge can make one: whether the ebook is lined up with the
narration (and how much of its text), whether that is out of date, and **Make
read-along**. When it can't offer that because of the Bridge, it says why for a
read-along that is out of date, after a job that failed, or for a Bridge too old
to make one: no Bridge is paired ("Making a read-along needs a Bridge."), the Bridge is offline,
or it is too old to make read-alongs (update it to 0.5.0 or newer). See
[Making a read-along](making-read-along.md#the-read-along-card).

### Files

**Files** lists the book's audio files with their codec, bitrate, size, length
and whether browsers play them directly or need them transcoded. Below them,
an **Ebook** line names the book's EPUB and its size when it has one, the file listeners
open with **Read the ebook**.

### Covers

**Change cover > Upload an image...** sets a custom cover: a JPEG, PNG or
WebP image up to 5 MB. Custom covers are stored in AudioSilo's database, never
in the book folder, and players show them in place of the book's own art.
**Remove the custom cover** goes back to the book's own art.

You can also take a book's cover from community metadata when you
[match it](#matching-with-community-metadata). It is kept exactly like an
uploaded one: stored in AudioSilo's database, with the book folder untouched,
and **Remove the custom cover** goes back to the book's own art. A community
cover larger than 5 MB is scaled down to fit within 1600 pixels first.

### Characters and recaps

When [community metadata](server.md#community-metadata) is on, the
**Characters and recaps** card shows the book's characters and chapter recaps,
the same ones the players show: from the community database, or written by your
[Bridge](generating-characters-and-recaps.md). It is read-only.

![The Characters and recaps card with generated characters](/img/screenshots/admin/book-story.png)

- **Characters** and **Recaps** are tabs, each with how many entries it has
  (the whole-book summary counts as one of the recaps).
  Each character shows its name, its role (**Protagonist**, **Antagonist**,
  **Supporting** or **Minor**), any other names ("Also known as ..."), a
  description and where it first appears ("From chapter 3", or "From the start").
- **Recaps give the story away**, so each stays closed until you open it: one row
  per chapter ("Through chapter 4"), "Previously, in earlier books" for a recap of
  the series so far, "Before this book" for one about what comes before the first
  chapter, and **The whole book** for the short summary and the ending.
  Click a row to read it, and again to close it. The card shows you everything,
  wherever you are in the book yourself: there is no spoiler protection here,
  only the closed rows.
- The first 10 entries show; a button with the full count ("Show all 12
  characters") shows the rest, and **Show fewer** puts them away.
- **Where they came from** heads each tab, since characters and recaps can come
  from different places: **Community**, with the community's credit and licence,
  or **Generated on this server**, with the date your Bridge wrote them. When the
  book's last finished generate job [offered them to the community](generating-characters-and-recaps.md#keeping-them-local-or-contributing-them),
  **Contributed, waiting for review** links to the submission. The whole-book
  summary can come from somewhere else than the chapter recaps (the community's
  summary beside recaps your Bridge wrote): its row then shows its own source,
  with the community's credit.
- A tab with nothing in it says "No characters yet." or "No recaps yet."

![The Recaps tab with one chapter opened](/img/screenshots/admin/book-story-recaps.png)

### Listeners and who can see the book

- **Listeners** - everyone who has started the book, with their progress or
  "Finished", most recent first. Each has a menu (**...**) to mark the book
  finished or not finished for them, edit their start and finish dates, or see
  their listening sessions on it (see
  [Editing someone's progress](users-and-invites.md#editing-someones-progress)).
- **Who can see this** - each [share](sharing.md) that includes the book, and
  through which folder, or "Whole-library access". If no share includes it:
  "No share includes this book yet. Only admins, and the people in an admin's
  household, can listen to it." **Add to a share** adds the book to a share
  from here.

### Files on disk

**Files on disk** shows the book's full path on the server. The path is the
book's identity: listening progress, bookmarks and shares are keyed to it.

It also shows how the book's folder is detected, with a **Change detection**
button that opens the folder in [Library > Folders](libraries.md#the-folders-page).

**Rename folder on disk** is there but switched off. AudioSilo never changes
your files; renaming folders on disk may come later as an opt-in setting.
Until then, fix names with the edits above.

## Matching with community metadata

When [community metadata](server.md#community-metadata) is on,
you can match a book to its entry in the free community catalogue at
[meta.audiosilo.app](https://meta.audiosilo.app). Matching gives listeners a
description, series order and chapter recaps, and fills in fields you're
missing, including the subtitle, publisher and language, and abridged for a
recording the community marks abridged. The community has no genres or tags
to offer yet.

1. Click **Match with community metadata** on the book's page (or **Find a
   match** in its **Community metadata** card). The dialog looks for the book
   straight away, using what its tags say (title, author, series), its length,
   its ASIN or ISBN, and what its **folders** say: the top folder as the
   author, the folder holding the book as the series, and the book's own folder
   or file name as the title. So a book whose tags are wrong or swapped (a
   title tag that holds the author's name, say) is still found when its
   folders are named well, and the other way round.
2. **Search the community database** opens with the book's title and author.
   When the tags look swapped (the title is the author's folder name, say) or
   say nothing ("Unknown", "Track 01", "Various Artists"), it opens with what
   the folders say instead, so searching again starts from something sensible.
   To search for something else, type in it or paste an ASIN or ISBN, and
   click **Search**. Typed words are matched
   alongside the book's own tags and folders, in any order ("sharpe 8" finds
   the eighth Sharpe book); an ASIN or ISBN on its own looks up just that.
3. **Possible matches** lists what was found, each with its cover, how
   closely it matches ("92% match"), its narrators and whether its length matches your
   files. The score counts whichever fits the book best: its tags, its
   folders or what you typed. An ASIN or ISBN that matches scores 100%. Pick
   one and click **Compare fields**.
4. If the book was recorded more than once, pick the right **Edition**. A
   recording sold in several Audible stores has an ASIN in each; the match
   takes the one from your **Audible marketplace** (see
   [Community metadata](server.md#community-metadata)), and the list shows
   which store it is from ("B0... · UK"). The edition also decides the series
   offered. The community sometimes lists a series again for one kind of
   recording, such as "Harry Potter (Full-Cast Editions)" or "Discworld
   (abridged)". Such a series is offered only for that edition, never for
   another narration of the same book. A different reading order of a series
   (a chronological order, say), a translation's series, or a series in another
   language than the book is never offered as one of its series.
5. The comparison shows each field **On your server** and from the
   **Community**. Tick the ones to **Take**. Fields you've edited yourself
   are unticked, so they're never overwritten unless you tick them. The first
   row is the **Cover**: the book's art beside the community's. It starts
   ticked only when the book has no cover art of its own (and the community's
   cover could be fetched), so art in your files, or a cover you uploaded, is
   kept unless you tick it.
6. Click **Accept** (it says how many fields, for example "Accept 4 fields";
   a ticked cover counts as one).

![Matching a book with community metadata](/img/screenshots/admin/book-match.png)

To match many books at once, use **Match automatically** on the Health page
(see [Matching every book at once](health.md#matching-every-book-at-once)).

Once a book is matched, AudioSilo also checks the community's chapter list for
it (see [Community chapters](#community-chapters)).

Accepted values are marked **Community** and are locked like your own edits;
you can revert them the same way. If you have unsaved edits on the page, save
or discard them before matching.

A cover you accept becomes the book's [custom cover](#covers). If it can't be
fetched and it was all you ticked, the dialog stays open ("The cover couldn't
be fetched. Nothing changed."), so you can try again or untick it. If you
ticked fields too, the fields are still accepted and a message says the cover
couldn't be fetched.

If the catalogue can't be reached, or is too busy to answer in time, the
dialog says "meta.audiosilo.app isn't answering" - try again in a minute.

:::note[What matching sends]
Opening the match dialog sends the book's tagged title, author and series, its
length, its ASIN or ISBN, anything you type, and up to three of its folder
names (the top folder, the folder holding the book, and the book's own folder
or file name) to the metadata service. It sends nothing about your server or
who listens. For a player's "About this book", the server sends only the ASIN
or ISBN (see [Community metadata](server.md#community-metadata)). With a
[local copy](server.md#keeping-a-local-copy) of the community metadata (once it
is ready), none of this leaves your server.

To show the candidates' covers, your server also downloads each cover image
from wherever the catalogue keeps it (Audible's image servers or Open
Library, for example). Only the image itself is asked for.
:::

### Characters and recaps from your Bridge

With a [Bridge](bridge.md) paired that can write characters and recaps, the
**Community metadata** card has a **Characters and recaps** part: **Generate
characters and recaps** while the community lacks characters, recaps or both
(**Regenerate** once it has generated ones), and while the Bridge works on it, the
job's step, progress, time left and cost so far, with **Cancel**. When the
community already has both, the part says "The community already has characters
and recaps for this book." instead, and **See them** takes you to the
[Characters and recaps card](#characters-and-recaps). The book doesn't need to be
matched. See [Generating characters and recaps](generating-characters-and-recaps.md#which-books-offer-it).

Under it, a **Description** part shows the short, spoiler-free description the
Bridge wrote for the book, if it has one, and offers **Write a description** for a
book generated before descriptions existed. See
[A description for the book](generating-characters-and-recaps.md#a-description-for-the-book).

![The Community metadata card with Generate characters and recaps](/img/screenshots/admin/book-generate.png)

With the [Contributions module](server.md#modules) on and the Bridge signed in to
GitHub (or given a GitHub token of your own), the card can have two more parts:

- **Corrections**, on a matched book whose details you edited differently from the
  community: **Suggest corrections** sends your values for review. See
  [Suggest corrections](bridge.md#suggest-corrections).
- **Share with the community**, for characters and recaps generated with the
  results kept on this server: sends them for review without generating again.
  See [Share with the community](bridge.md#share-with-the-community).

## Authors and narrators

**Library > Authors** lists every author with how many books they have and
how long those books run, most books first. **Library > Narrators** does the
same for narrators, most hours first. A book credited to two people ("Michael
Kramer, Kate Reading") counts for each of them, so each has their own tile.
AudioSilo only splits a credit where it clearly names several people (at `;`,
`&` or `and`, or at commas between full names), so "Sanderson, Brandon" stays
one person. Use the library filter and **Filter authors** (or **Filter
narrators**) to narrow the list. Click a name to open **Books** filtered to that
person, their shared books included.

The page shows 120 people at a time. Use the page numbers under the tiles to
move through a long list. The page and the filter are part of the page's
address, so after you open a name, **Back** returns you to the same page and the
same filter. A new filter, or picking another library, starts again on the first
page.

![Library > Authors](/img/screenshots/admin/authors.png)

### Merging two spellings

Tags often spell the same person two ways. When names look alike, a
suggestion appears above the list, for example "“Sanderson, Brandon” looks
like Brandon Sanderson". **Merge authors** (or **Merge narrators**) sets the
suggested spelling on every book credited to the other one alone, as an edit
on each book; the files are untouched. A book the other spelling shares with
someone else keeps its credit, so a merge never drops the other person. The confirmation has an **Undo** button,
and you can also revert the field on any single book's page.

AudioSilo never merges names on its own.

## Series

**Library > Series** has a card for each series, with its books shown as
spines in series order. Click a spine to open that book, or the series' name
to see its books in the list, in series order. A book in more than one series
(see **Other series** under [Editing details](#editing-details)) sits on each
series' shelf at its number in that series, and filtering the list to one series
numbers every book by its place in that series.

The page shows 24 series at a time. Use the page numbers under the cards to
move through a long list, or jump straight to a page. Type in **Find a series
or author** to show only the series whose name or author holds what you type,
ignoring case, accents, punctuation and spaces ("fights with" finds "He Who
Fights with Monsters"). The page and the search are part of the page's
address, so after you open a book, **Back** returns you to the same page, the
same search and the same place on it. Picking another library starts again on
the first page.

Books whose series is spelled slightly differently still make one series.
Spellings that differ only in capitals, accents, punctuation or spaces ("He
Who Fights With Monsters", "He Who Fights with Monsters", "He Who Fights WIth
Monsters") are one series, everywhere: on this page, in the books list
filtered to the series and in the players. The card is named the way your
matched books spell it, or else the way most of its books do. Names that
differ in any other way stay apart ("The Expanse" and "Expanse" are two
series), so fix those with a [bulk edit](#changing-many-books-at-once). To make
every book of a series spell it the same way, use
[Series spelled several ways](health.md#series-spelled-several-ways) in Health.

A book with a series but no series number takes the number its title gives
when the title is the series' name followed by a number: "He Who Fights with
Monsters 4: A LitRPG Adventure" is book 4, and so are "... 4 - A LitRPG
Adventure", "The Expanse, Book 4" and "Discworld #4". A title where the number
runs straight on from the name ("Catch-22"), reads as a range ("Dork Diaries
1-12") or is followed by more words ("Jack Reacher 61 Hours") gives no number. The book's
page shows that number as coming from its file tags (or its folders, when the
title came from them), and your own **Series number** always wins. For an
omnibus, type the range into **Series number** yourself (see
[Numbering an omnibus or box set](#numbering-an-omnibus-or-box-set)).

Each spine takes its colours from the book's cover, and a longer book stands
taller. AudioSilo reads the cover colours in the background after it indexes
your books. Until it has read a book's colour, the spine uses a colour of its
own. On a big library this can take a while after the first scan.

![Library > Series](/img/screenshots/admin/series.png)

With community metadata on, a series where one of your books is matched also
shows the books you don't have, as dashed gaps, and says so: "You have 1, 2, 4
of 5; missing 3, 5". A series none of whose books is matched yet says "Match a
book of this series to see what's missing". With community metadata off, the
page offers to turn it on.

A gap whose book the community catalogue has a release date for shows that
date under its title, as precise as the catalogue knows it ("12 Nov 2026",
"Nov 2026" or "2026"). A book that isn't out yet says **Preorder** before its
date, and one that came out in the last 90 days says **New**, so you can see at
a glance what you could add. The dates are the book's first release anywhere,
whichever store had it first.

A book is often in more than one community series (a Tiffany Aching novel is
in Discworld and in Discworld: Tiffany Aching). The card uses the community
series named like yours, ignoring case, accents and punctuation (or a reading
order of it named like yours), then one named like it apart from a leading
"The" or a trailing "Series". Failing that, it uses the community series that
holds at least two of your matched books in this series, and most of them. If
your series' name is another series' name with more after a colon or a dash
("Discworld: Tiffany Aching"), that other series ("Discworld") is never used:
it is the bigger series this one belongs to. When no community series fits,
the card shows your books by their own numbers, with no gaps, rather than
another series' gaps.

Each [matched](#matching-with-community-metadata) book (one with an ASIN or
ISBN the community catalogue knows) is placed by which book it actually is,
not by its series number. So a matched book with no series number, or with a
different number on your server (one you numbered 3 that the community lists
as 2.5, say), still fills its own place in the series: it counts towards "You
have ..." and the badge, and its spine sits in that place, showing the
community's number. Books that aren't matched, or can't be looked up, are
placed by their own series number. One with no series number takes the missing
place whose title it has, ignoring a numbering in front ("BV03 - All These
Worlds" is All These Worlds) and a part in brackets at the end, so it counts
towards "You have ..." instead of being listed as missing. A matched book the catalogue says is a
different book from any in the series (a companion story filed under the
series name, for example) sits at the end of the shelf and doesn't fill a gap.

An omnibus fills every place it covers: a book numbered `1-3`, or matched to a
community entry such as "Books 1-3", counts towards "You have 1-3 ..." and its
spine is labelled `1-3`. When the community series lists only the omnibus and
not the books inside it, the omnibus is one place of its own ("missing 1-3").

While a card is still looking its books up, it shows just the number of books
("5 books") with no gaps, so it never flashes a gap that then disappears. A
book the community catalogue couldn't answer for is placed by its series number
for now, and asked about again when you come back to the page a couple of
minutes later.

With a Bridge that can write characters and recaps, a series card also has
**Generate for the series**: it queues
[characters and recaps](generating-characters-and-recaps.md#where-to-start-it) for
each of the series' books that has no recaps yet, in reading order.

Nothing is changed by any of this: the Series page only arranges what it
shows. To fix a book's series number for listeners too, edit its **Series
number** on [the book's page](#editing-details).

## Folders

**Library > Folders** shows each library's folders as a tree, and lets you
correct a folder AudioSilo reads the wrong way (for example a folder of
separate stories read as one book). See
[The Folders page](libraries.md#the-folders-page).

## Finding a book quickly

The [command palette](console-tour.md#search-and-commands) (**Ctrl K**, or
**⌘K** on a Mac) searches books, people, authors, series, narrators and shares
from anywhere in the console.
