---
title: "Fix book details"
description: "Match books with community metadata, or edit titles, authors, series, covers and chapters by hand in the admin console."
---

The **Library** section of the [admin console](console-tour.md) is where you
see every book on your server and fix what players show about it: titles,
authors, series, covers and chapters. The quickest fix is usually to
[match the book with community metadata](#matching-with-community-metadata).
You can also edit any field by hand.

:::info[Your files are never changed]
Every edit is stored in AudioSilo's own database and kept through rescans.
Nothing is written to your audio files or folders, and you can revert any edit.
:::

## Browsing books

**Library > Books** shows every book as a cover grid. Two shelves sit above it:
**Recently added**, and **Continue curating**, which lists books missing a
cover or a community match.

![Library > Books](/img/screenshots/admin/books.png)

Above the list, type in **Filter books** to search, pick a **Sort**, or switch
the **View** to a **Table**. **Filters** narrows the list by library, format,
cover, community match, chapters, genre, tag, length and more.

![The books table](/img/screenshots/admin/books-table.png)

Each view has its own address, so you can bookmark a filtered list.

## Matching with community metadata

When [community metadata](server.md#community-metadata) is on, you can match a
book to its entry in the free community database at
[AudioSilo Meta](https://meta.audiosilo.app). Matching fills in missing
details, such as the description, series, publisher and cover. It also gives
listeners chapter recaps and the book's community chapters.

1. On the book's page, click **Match with community metadata**, or **Compare
   with community** if the book is already matched. The dialog
   searches straight away, using the book's tags, its folder names, its length
   and any ASIN or ISBN.
2. If the right book isn't listed, type in **Search the community database**,
   or paste an ASIN or ISBN, and click **Search**.
3. Under **Possible matches**, pick the right one and click **Compare fields**.
   Each match shows how closely it fits and how its length compares with your
   files: within 2% it matches, within 5% it is close.
4. If the book was recorded more than once, pick the right **Edition**. Check
   its narrators and length against your files.
5. Check the fields under **Take**. The dialog shows this edition's community
   values and ticks the ones a match run with **Use community values** would
   write. Fields you edited, and the cover when the book already has one,
   start unticked.
6. Click **Accept** to save the changes you ticked.

![Matching a book with community metadata](/img/screenshots/admin/book-match.png)

If the book is already matched to a community book, the dialog opens with that
match selected and in view. If the search didn't find it, the dialog adds it at the end, marked
**Current match** instead of a percentage.

The **Series number** follows the main **Series** you choose. If you cleared
the main series yourself, the default ticks keep it empty and don't add the
community's main series under **Other series** either.

If the community no longer lists a series detail that an earlier match wrote,
the dialog offers **Revert**. Leave it ticked to restore the value from your files.

If your book has no ASIN or ISBN, you can record a new match on its own.
Untick every field and the cover, then choose **Match to this work**.

For a book already matched to the same work and edition, that button is
available with nothing ticked only if the offer includes a new or changed ASIN
or ISBN. The server remembers the offer and leaves the book's fields as they are.

Accepted fields show **Community**. Choose **Revert** beside a community title
to restore your library's title. It now shows **Edited**, so the dialog leaves
it unticked and fills keep it. To let automatic fills change it again, choose
**Revert** beside the **Edited** title. Save or discard any unsaved edits before
you match.

To match many books at once, use **Match automatically** on the Health page
(see [Matching every book at once](health.md#matching-every-book-at-once)).

If the search says "meta.audiosilo.app isn't answering", try again in a minute.
If the dialog says **The comparison didn't load**, click **Try again**.
**Accept** works once the comparison loads.

When nothing matches closely, **Add it** opens the community's
[Add a book](../community/meta-site.md#adding-a-missing-book) page with the book
filled in. An unmatched book still plays.

The community database holds books, their recordings, authors, narrators and
series. Its users add and correct them, and many entries came from a public
Audible catalogue. When a recording sells in several Audible stores, the
**Audible marketplace** setting picks which store's edition a match takes (see
[Which ASIN a match takes](health.md#which-asin-a-match-takes)). Every unmatched
book is listed under **Not matched to community metadata** in
[Library health](health.md#the-kinds-of-issue).

### What matching sends

The server sends search terms to AudioSilo Meta only when you open **Match
with community metadata** (or **Compare with community**) or run
[Match automatically](health.md#matching-every-book-at-once):

- the book's tagged title, author, series, narrators and language, and its
  length;
- its ASIN or ISBN, else one from its tags or an
  [Audiobookshelf import](import.md#match-your-books-after-an-import), and what
  you type;
- up to three names from its path (the author, series and book folders), never
  the full path;
- the community book it is already matched to, if any, so the dialog can show
  it.

It sends nothing about your server or who listens. With a
[local copy](server.md#keeping-a-local-copy), lookups use the copy when it can
answer, but can still fall back to asking online.

### Books matched to a store listing

The community database holds some books as a store listing with no ASIN or
ISBN. A match to one of them still counts. The book shows as **Matched**, and
[Match automatically](health.md#store-listings-with-no-asin-or-isbn) skips it.
Its **Community metadata** card says "No ASIN or ISBN: matched to its store
listing". A book [added from LibriVox](librivox.md) says it is matched to its
LibriVox recording instead.

A hand match also connects the book to its series in the player and to Upcoming releases. Community chapter checks and the console’s missing-books view still need an ASIN or ISBN. Downloading the book keeps its [recaps and characters](../listening/recaps-and-characters.md#good-to-know) for offline listening.

### Unlinking a community match

The book's **Community metadata** card shows what it is matched to. It offers
**Unlink** whenever the book has a match, even with community metadata off.
If **Unlink** is disabled, the message beside it asks you to save or discard
your edits first.

1. Click **Unlink**, beside **Compare fields**.
2. Check whether the confirmation says the book will stay matched, then click
   **Unlink** again. There is no undo.

![The Community metadata card of a matched book, with Unlink](/img/screenshots/admin/book-community-match.png)

Unlink removes the match, its community values and its community cover. Your
own edits and uploaded covers stay. The book stays **Matched** if it still has
an ASIN or ISBN you typed, one from its files or one the Bridge added, even one
the match had replaced. [Fill in matched books](health.md#filling-in-books-that-are-already-matched)
can then bring its details back. Otherwise the next match run can find it again.

You can't unlink while a
[match run](health.md#matching-every-book-at-once) is applying matches to that
library.

### Recordings of the same book

Your server may hold one book in more than one recording: two narrators, an
abridged and an unabridged one, a dramatisation. The players keep them
together, with one spine on a series page and an **Other recordings in your
library** card on each book's page (see
[More than one recording of a book](../listening/book-page.md#more-than-one-recording-of-a-book)).

The server knows two recordings are the same book when both lead to the same
book in the community database:

- **A match you made in the console** counts first, with
  [Match with community metadata](#matching-with-community-metadata) or
  [Match automatically](health.md#matching-every-book-at-once). Use it for a
  recording with no ASIN or ISBN, or one whose identifier leads to the wrong
  book.
- **Otherwise, the book's ASIN or ISBN.** The server looks up new and changed
  books once a day, and shortly after a scan finds some.

This needs [community metadata](server.md#community-metadata) switched on. It
works with **Check for upcoming releases** switched off too: the server still looks up
which book each recording is, and nothing else. Two books with the same ASIN (or,
when one has no ASIN, the same ISBN) are copies of one recording, so a recording is
listed once, never once per copy.
Within one library, Health lists them as [Likely duplicates](health.md#duplicates).

A listener only sees the recordings they can open. Someone whose share holds
one recording sees no sign of the other.

## A book's page

Click any book to open its page.

![A book's page](/img/screenshots/admin/book.png)

Besides **Match with community metadata** and **Change cover**, the top of the
page has **Listen in player**, which opens the book in the web player already
signed in. The **⋯** menu has **Read the files again**, which re-reads the
book's files at once. Use it after you fix its tags or to measure its length
again.

Further down are the book's files, its ebook and
[Read-along](making-read-along.md#the-read-along-card) card if it has one, and
its path on disk.

### Editing details

The **Details** card lists the title, subtitle, author, narrator, series,
published date, genres, tags, description, ASIN, ISBN and more. To change one:

1. Click the value and type the new one. Press Enter to keep it, or Escape to
   cancel. (In **Description**, press Ctrl+Enter or ⌘+Enter.)
2. Click **Review and save** in the bar at the bottom of the screen.
3. Check the changes and confirm. The value now shows the **Edited** marker.

**Genres** and **Tags** are lists. Press Enter or a comma after each label.
Use tags however you like, for example "Owned" or "Book club".

A book in more than one series has a main **Series** and **Series number**, and
the rest in **Other series**, written like `Discworld: City Watch #1; Omnibus`.
To make another series the main one, type its name into **Series** and the two
swap places.

Each value has a marker saying where it came from: **File tag**, **Path** (the
folder names), **Audiobookshelf**, **Edited** or **Community**. An edited or
community value has a **Revert** button. Point at it to see the value it puts
back and where that value comes from:

- **Audiobookshelf file**: the book's Audiobookshelf `metadata.json`.
- **Folder and file names**: the names of the book's folders and files.
- **File tag**: the tags inside the audio files.
- **Community**: an ASIN the Bridge added to the book, for example from your
  [Audible titles](audible.md#how-titles-are-matched), when your edit covers it.

**Empty once reverted** means nothing is underneath, so the field is left
blank. After a revert, rescans can change the value again.

#### Numbering an omnibus or box set

A book that holds several books of a series takes a range as its **Series
number**, such as `1-3`. In **Other series**, write it as `Box Sets #2-4`. The
[Series](#series) page then counts the omnibus as books 1 to 3, and in an
up-to-date app the next book after it is book 4. AudioSilo can also read the
range from a [file or folder named like `Author; Series; Books 01-03`](../getting-started/organizing-your-library.md#names-like-author-series-book-04-title).

### Covers

Click **Change cover > Upload an image...** to set a custom cover: a JPEG, PNG
or WebP image up to 5 MB. It is stored in AudioSilo's database, never in the
book folder. **Remove the custom cover** goes back to the book's own art.

You can also take a cover from community metadata when you
[match the book](#matching-with-community-metadata).

### Chapters

The **Chapters** card shows the book's chapters as a timeline and a list.
Click a chapter's title to rename it. A revert button puts the file's title
back.

#### Edit chapter times and titles

**Edit chapters** on the Chapters card lets you move, add, delete and rename
chapters. Your list is saved on the server. The audio files are not changed.

Each row is a chapter's start time and title. Times count from the start of the
book, like `1:02:03` or `12:34.5`. A row with a lock starts one of the book's
files. You can rename it, but its time is fixed and it can't be deleted, so no
chapter runs from one file into the next.

![The chapter editor waiting to play Folk Tales, with the pause button and a new chapter named The woodcutter](/img/screenshots/admin/book-chapters-edit.png)

While the editor waits for the server to convert the audio, it keeps trying. The pause button (**Stop trying again**) ends the retries.

To edit the chapters:

1. Open the book's page and click **Edit chapters** on the Chapters card.
2. Change the rows:
   - type a new time or title;
   - click **+** on a row to add a chapter after it, or the bin to delete it;
   - enter seconds in **Shift all by** (negative for earlier) and click
     **Shift** to move every unlocked chapter. Nothing moves if a chapter
     would leave its file.
3. Click **Save chapters**.

Players use the new chapters, and downloaded copies update theirs. The card
says **Chapters edited on this server.**, with who saved them and when. While
your list is in use, rename its chapters in the editor.

**Find the moment by ear.** Click a row's number to load its file in the
editor's player. Step back or forward by a second or a tenth, or click **Play
5 s** to hear the chapter's start. **Set to playhead** moves the chapter there,
and **Add at playhead** adds one.

**Paste a list.** Click **Paste timestamps** and paste one chapter a line, the
time and title either way round:

```
0:00 Opening credits
12:34 Chapter 1
Chapter 2 1:02:03.5
```

The preview lists the chapters and the lines it left out. **Replace chapters**
uses it. A pasted chapter within a second of a file's start gives its title to
that file's locked row.

**What a save needs.** Chapters start at least a second apart, inside the book.
Each title is one line of at most 200 bytes, and a book has at most 2,000
chapters. The editor marks a row that breaks a rule and saves once it's fixed.
If the book's files change while you edit, nothing is saved. Cancel and edit
again.

**Revert edit** deletes your list. The book goes back to the community's
chapters, the ones found in the narration, or the files' own.

Your list belongs to the book's files as they were. If a file is replaced,
re-encoded, renamed, added or removed, the card says **Your edited chapters are
set aside** and listeners get the book's other chapters. Put the files back to
use your list again, or revert it. Moving the book's folder keeps your edit.
So does renaming the file of a book that is one audio file, in its own folder or
loose in the library.

#### Community chapters

The community database on [AudioSilo Meta](https://meta.audiosilo.app) has chapter lists for most
of the recordings it knows. When community metadata is on, AudioSilo checks
each [matched](#matching-with-community-metadata) book against the chapter list
of its recording. The **Community chapters** panel on the Chapters card says
what it found.

A book with no chapters of its own uses the community chapters **automatically**.
Otherwise the panel offers a button to use them when they are more detailed or
better titled, or says why they can't be used (another edition, say). **Use the
file's chapters** always goes back to the book's own.

AudioSilo fits each community chapter onto the pause in the audio where it
starts. This needs ffmpeg. Without it, and for some chapters of a very long
book, starts may be a few seconds off. Checks run in the background; **Check
now** runs one straight away. An ASIN in the tags alone isn't enough. The book
must be [matched](health.md#asin-and-isbn-tags-are-hints) first.

#### Chapters found in the narration

A book that is one audio file with no chapters can get chapters from your
[Bridge](bridge.md), which finds them in the narration (see
[Detect chapters](chapter-detection.md)).

![The Chapters card for A Long Lecture with Detect chapters available](/img/screenshots/admin/book-detect-chapters.png)

Choose **Detect chapters** to review the job before you queue it.

![The Chapters card while the Bridge finds chapters in the narration](/img/screenshots/admin/book-chapters-working.png)

You can follow the job here or cancel it while it runs.

The Chapters card then says **Found in the narration on this server.** Click
**Use the file's chapters** to turn them off, and **Use automatic** to bring
them back.

![The Chapters card with chapters found in the narration](/img/screenshots/admin/book-chapters-generated.png)

The finished list gives each chapter a start time and a title.

### Characters and recaps

When community metadata is on, the **Characters and recaps** card shows the
book's characters and chapter recaps, the same ones the players show. They come
from the community database or from your
[Bridge](generating-characters-and-recaps.md).

![The Characters and recaps card with generated characters](/img/screenshots/admin/book-story.png)

**Recaps give the story away**, so each stays closed until you click it. The
card has no spoiler protection beyond that.

![The Recaps tab with one chapter opened](/img/screenshots/admin/book-story-recaps.png)

With a [Bridge](bridge.md) paired, the **Community metadata** card can also
**Generate characters and recaps** for the book (see
[Generating characters and recaps](generating-characters-and-recaps.md#which-books-offer-it)).
With the Contributions module on, it can
[suggest corrections](bridge.md#suggest-corrections) to the community database or
[share what the Bridge wrote](bridge.md#share-with-the-community).

![The Community metadata card with Generate characters and recaps](/img/screenshots/admin/book-generate.png)

### Listeners and who can see the book

- **Listeners** lists everyone who has started the book, with their progress.
  Each has a menu to mark the book finished, edit their dates or see their
  sessions (see
  [Editing someone's progress](users-and-invites.md#editing-someones-progress)).
- **Who can see this** lists each [share](sharing.md) that includes the book.
  **Add to a share** adds it to one. A book in no share is only for admins and
  the people in an admin's household.

## Changing many books at once

1. In **Library > Books**, press **Select**, or tick a cover's checkbox.
2. Click books to select them. **Shift-click** selects a run, and **Select
   all** selects every book shown.
3. In the bar at the bottom, choose an action:
   - **Edit fields** sets **Author**, **Narrator** or **Series** on every
     selected book, and adds or removes tags and genres. Only the fields you
     fill in change.
   - **Add to share** adds the books to a [share](sharing.md).

A bulk action takes up to 1,000 books at a time.

## Authors and narrators

**Library > Authors** and **Library > Narrators** list everyone in your
libraries, with how many books they have. Click a name to see their books. A
book credited to two people counts for each of them.

![Library > Authors](/img/screenshots/admin/authors.png)

### Merging two spellings

When two names look alike, a suggestion appears above the list, for example
"“Sanderson, Brandon” looks like Brandon Sanderson". Click **Merge authors** (or
**Merge narrators**) to use the suggested spelling, as an edit. The merge covers
the selected library, or all book libraries if you haven't picked one. For two
names AudioSilo doesn't suggest, use a [bulk edit](#changing-many-books-at-once).

Only a whole credit changes. For example, merging “Sanderson, Brandon” into
“Brandon Sanderson” leaves “Sanderson, Brandon & Janci Patterson” as written.
AudioSilo changes every matching book together or none of them, and none if
more than 5,000 books would change.

Choose **Undo** in the confirmation to put back each book's earlier name, your
earlier edit or the community value. A name that came from the book's files or
folder follows them again. Undo skips a book whose name someone has changed or
reverted since, or that a scan found had moved, and restores the others. The
message lists up to three skipped paths and counts any others.

## Series

**Library > Series** has a card for each series, with its books as spines in
series order. Click a spine to open that book. Type in **Find a series or
author** to narrow the list.

![Library > Series](/img/screenshots/admin/series.png)

Spellings that differ only in capitals, accents, punctuation or spaces count as
one series. To use one spelling throughout a library, open
[Series spelled several ways](health.md#series-spelled-several-ways) in Health.
Names such as "The Expanse" and "Expanse" count as two series. To give their
books the same series name, use a [bulk edit](#changing-many-books-at-once).

With community metadata on, a series with a matched book also shows the books
you don't have, as dashed gaps: "You have 1, 2, 4 of 5; missing 3, 5". A gap
shows its release date when known, marked **Preorder** or **New**. A release
stays new for the [New release window](server.md#community-metadata), 90 days
by default. Only whole numbers make gaps, so a novella at 2.5 you don't have is
left out.

With a Bridge that can write characters and recaps, **Generate for the series**
queues them for each book in the series that has none yet.

The Series page only arranges what it shows. To change a book's series number
for listeners too, edit its **Series number** on
[the book's page](#editing-details).

## Good to know

- **An ASIN or ISBN you leave unticked, or revert, stays off.**
  [Fill in matched books](health.md#filling-in-books-that-are-already-matched)
  doesn't write it back.
- **The community database has no genres or tags yet**, so matching never changes them.
- **A value made only of invisible characters counts as empty.** A title or
  chapter title like that is refused.
- **A book using your edited chapters gets no chapter detection.** See
  [Books that get no detection](chapter-detection.md#books-that-get-no-detection).
- **The chapter editor's player plays every file** when the server has ffmpeg.
  A file your browser can't play as stored, such as Opus, FLAC or MP3 in an
  `.mka`, plays through the server's conversion, and you can still seek. A file
  that still doesn't load can't be played, but you can type the times.
- **The editor is light on the server.** When the server is busy it says
  **The server is busy. Trying again in a moment.** and tries again. Paused or
  left open, it frees the server's conversion. Listeners in the players are not
  affected.
