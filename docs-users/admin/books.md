---
title: "Books and metadata"
description: "Browsing and filtering every book in the AudioSilo admin console, fixing titles, authors and series one book at a time or in bulk, where each value comes from, custom covers, chapters (including chapters from the community database), matching with community metadata, merging author spellings and spotting series gaps."
---

The **Library** destination of the [admin console](console-tour.md) is where
you see every book on your server and tidy up what players show about it:
titles, authors, narrators, series, covers and chapter names.

:::info Your files are never changed
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

- **Library** - with more than one library, show **All** or just one. Each
  choice shows its book count, and a library whose folder can't be read says
  "offline".
- **Filter books** - type to narrow by title, author, narrator or series.
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
it to another admin.

### Filters

**Filters** opens a panel of choices. Next to each one is how many books it
would show with your other filters applied, so you never pick a filter that
leads nowhere:

- **Library**, **Format** (M4B, MP3, ...) and **Codec**
- **Playback** - **Plays directly** or **Needs transcoding** (for browsers)
- **Cover** - **Has cover** or **Missing cover**
- **Community metadata** - **Matched** or **Not matched** (only when
  community metadata is on)
- **Chapters** - **Has chapters** or **No chapters**
- **Edited** - books with or without your edits
- **Length** - **Under 5h**, **5 to 15h**, **15 to 30h** or **Over 30h**
- **Added** - **Last 7 days**, **Last 30 days** or **Last year**

Active filters show as chips above the list (for example "Author: Lewis Carroll").
Click a chip's cross to remove it, or **Clear all**.

A link to an author, narrator or series keeps the library you're looking at.
A series' books open in series order, and an author's in release order, unless
you pick another sort; a sort you pick stays when you change the filters.

### Changing many books at once

Hover a cover and tick its checkbox to select it (in the table, tick the row,
or the header box to select every loaded book). A bar appears at the bottom of
the screen with the number selected and two actions:

- **Edit fields** - set **Author**, **Narrator** or **Series** on every
  selected book. Only the fields you fill in change; where the books disagree,
  the field says how many different values there are, and leaving it blank
  keeps each book's own. One bulk edit covers up to 1,000 books and is saved
  all or nothing. Setting **Series** to one of a book's **Other series** swaps
  the two on that book, as on [a book's page](#editing-details); books that
  don't list that series simply get it as their main series.
- **Add to share** - add the selected books to a [share](sharing.md). Each
  book is added as one of the share's folders, and everyone with the share
  sees it right away.

**Clear selection** (or Escape) deselects everything.

## A book's page

Click any book to open its page.

![A book's page](/img/screenshots/admin/book.png)

The top of the page shows the cover, the library, the title, then who wrote
and narrated it and where it sits in its series ("by Brandon Sanderson · read
by Michael Kramer · book 1 in The Stormlight Archive"; a book in several series
lists each, "book 8 in Discworld and book 1 in City Watch"). Each name, and the
series, opens **Books** filtered to it. Below that is how many files the book
has, whether browsers can play it directly ("Plays directly", "Transcodes to
MP3 for browsers" or "Browsers can't play this format") and when it was added.
The buttons there are:

- **Match with community metadata** (it reads **Compare with community** once
  the book has an ASIN or ISBN) - see
  [Matching with community metadata](#matching-with-community-metadata).
- **Change cover** - see [Covers](#covers).
- The **⋯** menu (**More book actions**) - **Copy path**, **Add to a
  share...** and **Read the files again**, which re-reads this book's files
  straight away (tags, chapters, cover) without rescanning the whole library -
  handy after you fix a file's tags, or for a file
  [Library health](health.md#the-kinds-of-issue) says couldn't be read.

### Editing details

The **Details** card lists **Title**, **Author**, **Narrator**, **Series**,
**Series number**, **Other series**, **Published**, **Description**, **ASIN**
and **ISBN**. A book can be in more than one series (Guards! Guards! is book 8 of
Discworld and book 1 of its City Watch novels): **Series** and **Series number**
are its main one, and **Other series** the rest, written on one line with the
book's number after a `#` and the series apart by `;`, for example
`Discworld: City Watch #1; Omnibus`. Matching with community metadata fills it in
for a book in several series.

Click any value to edit it in place. Enter keeps the change (in
**Description**, where Enter starts a new line, use Ctrl+Enter or ⌘+Enter),
Escape cancels.

To make one of the other series the main one, type its name into **Series**,
spelled exactly as in **Other series**. The two swap places: the old main
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

Each value has a marker saying where it came from:

- **File tag** - read from the audio file's tags.
- **Path** - worked out from the folder and file names.
- **Edited** - your edit, locked against rescans.
- **Community** - accepted from community metadata.

In a library set to take
[book details from folder names first](libraries.md#where-book-details-come-from),
the title, author, series and series number the folders give are marked
**Path** even when the files have tags of their own.

A few rules keep values sensible, and the field tells you when one is broken:
a book needs a title, a series number is a number like `1` or `2.5`,
**Published** is a year (`2010`, `2010-08` or `2010-08-31`), an ASIN is 10
letters or digits, and an ISBN is an ISBN-10 or ISBN-13 (hyphens are fine).

Title, author, narrator, series, series number, ASIN and ISBN are what the
players, search and the [book list export](libraries.md#exporting-a-library)
show. **Published** and **Description** are shown in the console only.

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

:::note Match the book first
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

### Files

**Files** lists the book's audio files with their codec, bitrate, size, length
and whether browsers play them directly or need them transcoded.

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

### Listeners and who can see the book

- **Listeners** - everyone who has started the book, with their progress or
  "Finished", most recent first. Each has a menu (**...**) to mark the book
  finished or not finished for them, edit their start and finish dates, or see
  their listening sessions on it (see
  [Editing someone's progress](users-and-invites.md#editing-someones-progress)).
- **Who can see this** - each [share](sharing.md) that includes the book, and
  through which folder, or "Whole-library access". If no share includes it,
  only admins can listen to it. **Add to a share** adds the book to a share
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
missing.

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
   which store it is from ("B0... · UK").
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

:::note What matching sends
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

Each [matched](#matching-with-community-metadata) book (one with an ASIN or
ISBN the community catalogue knows) is placed by which book it actually is,
not by its series number. So a matched book with no series number, or with a
different number on your server (one you numbered 3 that the community lists
as 2.5, say), still fills its own place in the series: it counts towards "You
have ..." and the badge, and its spine sits in that place, showing the
community's number. Books that aren't matched, or can't be looked up, are
placed by their own series number. A matched book the catalogue says is a
different book from any in the series (a companion story filed under the
series name, for example) sits at the end of the shelf and doesn't fill a gap.

While a card is still looking its books up, it shows just the number of books
("5 books") with no gaps, so it never flashes a gap that then disappears. A
book the community catalogue couldn't answer for is placed by its series number
for now, and asked about again when you come back to the page a couple of
minutes later.

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
