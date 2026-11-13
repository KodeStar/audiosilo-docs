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

1. On the book's page, click **Match with community metadata**. The dialog
   searches straight away, using the book's tags, its folder names, its length
   and any ASIN or ISBN.
2. If the right book isn't listed, type in **Search the community database**,
   or paste an ASIN or ISBN, and click **Search**.
3. Under **Possible matches**, pick the right one and click **Compare fields**.
   Each match shows how closely it fits and whether its length matches your
   files.
4. If the book was recorded more than once, pick the right **Edition**. Check
   its narrators and length against your files.
5. Tick the fields to **Take**. Fields you edited yourself start unticked, and
   so does the cover when the book already has one.
6. Click **Accept**.

![Matching a book with community metadata](/img/screenshots/admin/book-match.png)

Accepted values are marked **Community** and are kept like your own edits. You
can revert them the same way. Save or discard any unsaved edits on the page
before you match.

To match many books at once, use **Match automatically** on the Health page
(see [Matching every book at once](health.md#matching-every-book-at-once)).

If the dialog says "meta.audiosilo.app isn't answering", try again in a minute.

### What matching sends

The server sends search terms to AudioSilo Meta only when you open **Match
with community metadata** or run [Match automatically](health.md#matching-every-book-at-once):

- the book's tagged title, author, series, narrators and language, and its
  length;
- any ASIN or ISBN, and what you type;
- up to three names from its path (the author, series and book folders), never
  the full path.

It sends nothing about your server or who listens. With a
[local copy](server.md#keeping-a-local-copy), lookups use the copy when it can
answer, but can still fall back to asking online.

### Books matched to a store listing

The community database holds some books as a store listing with no ASIN or
ISBN. A match to one of them still counts. The book shows as **Matched**, and
[Match automatically](health.md#store-listings-with-no-asin-or-isbn) skips it.
Its **Community metadata** card says "No ASIN or ISBN: matched to its store
listing".

A few things need an ASIN or ISBN, so they leave such a book out: the
[community chapter check](#community-chapters) and the missing books on the
[Series](#series) page. In the players, such a book shows its community details
on its book page only (see
[Recaps and characters](../listening/recaps-and-characters.md#good-to-know)).

### Unlinking a community match

The book's **Community metadata** card shows what it is matched to. To remove
the match:

1. Click **Unlink**, beside **Compare fields**.
2. Read the warning and click **Unlink** again. There is no undo.

![The Community metadata card of a matched book, with Unlink](/img/screenshots/admin/book-community-match.png)

Unlink removes everything the match wrote, including its cover. Your own edits
and uploaded covers stay. An ASIN or ISBN from the book's files, or one you
typed, also stays, so the book still shows as matched.

You can't unlink while a
[match run](health.md#matching-every-book-at-once) is applying matches to that
library.

## A book's page

Click any book to open its page.

![A book's page](/img/screenshots/admin/book.png)

Besides **Match with community metadata** and **Change cover**, the top of the
page has **Listen in player**, which opens the book in the web player already
signed in. The **⋯** menu has **Read the files again**, which re-reads the
book's files at once. Use it after you fix its tags.

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
community value has a **Revert** button that puts back what the files say.

#### Numbering an omnibus or box set

A book that holds several books of a series takes a range as its **Series
number**, such as `1-3`. In **Other series**, write it as `Box Sets #2-4`. The
[Series](#series) page then counts the omnibus as books 1 to 3, and in an
up-to-date app the next book after it is book 4. A range in a file or folder
name isn't read, so type it in here.

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
starts. This needs ffmpeg. Without it, starts may be a few seconds off. Checks
run in the background; **Check now** runs one straight away. An ASIN in the
tags alone isn't enough. The book must be
[matched](health.md#asin-and-isbn-tags-are-hints) first.

#### Chapters found in the narration

A book that is one audio file with no chapters can get chapters from your
[Bridge](bridge.md), which finds them in the narration (see
[Books without chapters](generating-characters-and-recaps.md#books-without-chapters)).
The Chapters card then says **Found in the narration on this server.** Click
**Use the file's chapters** to turn them off, and **Use automatic** to bring
them back.

![The Chapters card with chapters found in the narration](/img/screenshots/admin/book-chapters-generated.png)

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
**Merge narrators**) to set one spelling on every book, as an edit. The
confirmation has an **Undo** button.

## Series

**Library > Series** has a card for each series, with its books as spines in
series order. Click a spine to open that book. Type in **Find a series or
author** to narrow the list.

![Library > Series](/img/screenshots/admin/series.png)

Spellings that differ only in capitals, accents, punctuation or spaces count as
one series. Other differences ("The Expanse" and "Expanse") make two series.
Fix those with a [bulk edit](#changing-many-books-at-once), or use
[Series spelled several ways](health.md#series-spelled-several-ways) in Health.

With community metadata on, a series with a matched book also shows the books
you don't have, as dashed gaps: "You have 1, 2, 4 of 5; missing 3, 5". A gap
shows its release date when known, marked **Preorder** or **New**.

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
