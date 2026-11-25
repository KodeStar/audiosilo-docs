---
title: "Check your library's health"
description: "Find and fix problems with your books, match many books at once, follow your scans, and check what the server depends on."
---

The **Health** destination in the [admin console](console-tour.md) lists
problems with your books, follows your scans and checks what the server depends
on. It has three pages:

- **Issues** lists books with a problem, such as files that couldn't be read or
  missing covers, with a fix for each.
- **Jobs** shows the scans running, waiting and finished, with their logs.
- **System** shows everything the server depends on, with a status for each.

Nothing here changes your audio files. Fixes are saved in AudioSilo, and an
issue you ignore is only hidden. The one exception is **Detect chapters**. The
Bridge
[saves the chapters it finds](chapter-detection.md#where-found-chapters-show-and-turning-them-off)
in a `.audiosilo` folder beside the book.

## Library health

Open **Health** in the top bar, or click **Triage** on the overview's **Needs
attention** card. Each kind of issue has a card with how many books are in it.
Click a card to open its list.

![Health > Issues: a file that took too long to read as audio, with its details open](/img/screenshots/admin/health-issues.png)

**Check again** rescans every library, and the issues update as each finishes.

### The kinds of issue

| Card | What it means | How to fix it |
|---|---|---|
| **Files that couldn't be read** | A file couldn't be read, is empty, or isn't audio. For a file the server couldn't read as audio, **Details** shows the full message. | Fix the file or its permissions. Select **Read again** to check it straight away. Otherwise the next scan checks it, unless the server rejected it as invalid audio (see below). |
| **Folder may hold several books** | A folder reads as one book but looks like it holds several. | **Choose detection** opens the folder in [Library > Folders](libraries.md#the-folders-page). Then choose **Separate books** or **Always one book**. |
| **One book split into disc folders** | A book ripped from CDs reads as one book per disc. | **Join into one book**. See [Books split into disc folders](libraries.md#books-split-into-disc-folders). |
| **Likely duplicates** | Copies of one book in the same library. | Compare them side by side. See [Duplicates](#duplicates). |
| **Missing covers** | No cover in the book's folder or files. | **Upload a cover** opens the book's page (see [Covers](books.md#covers)). |
| **Not matched to community metadata** | The book has no community match, so players can't show its community details. Only shown while community metadata is on. | **Review match** opens the [match dialog](books.md#matching-with-community-metadata). To match the whole list, use [Match automatically](#matching-every-book-at-once). |
| **ASIN not in the community database** | The book has an ASIN the community database doesn't know yet. It counts as matched but gets no community details. Only shown while [Help complete the community database](server.md#helping-complete-the-community-database) is on, since that is what finds them. A book leaves the list once the community database knows its ASIN. | **Find matches by title** looks up the whole list (see [Books with an ASIN the community doesn't know](#books-with-an-asin-the-community-doesnt-know)). **Review match** finds one book by its title. **Add it** opens the [Add a book](../community/meta-site.md#adding-a-missing-book) page with its ASIN filled in. |
| **Series spelled several ways** | Books of one series spell its name differently. | **Use this spelling**. See [Series spelled several ways](#series-spelled-several-ways). |
| **Long books without chapters** | Books over two hours with no chapters, so listeners can't skip between them. | **Detect chapters** with your [Bridge](bridge.md) (see [Detect chapters](chapter-detection.md)), or [match](books.md#matching-with-community-metadata) the book to use its [community chapters](books.md#community-chapters). A book using chapters you [edited](books.md#edit-chapter-times-and-titles) offers no Detect chapters until you revert the edit. |
| **More detailed chapters available** | The community database has finer chapters that fit this copy. | **Use detailed chapters**. |
| **Converted to play in browsers** | The format doesn't play in web browsers, so the server converts it for the web player. The apps play it as it is. | Nothing needed: it works. |

If the server rejects a file as invalid audio, scans skip it until its size
or modification time changes, or the server restarts.

A slow disk or network share can leave a book marked **reading it timed out**.
The book keeps its details. If only its tags timed out, the scan keeps its
name and saves new lengths and chapters (see [History](#history) for how
that is counted).

Each row under **Files that couldn't be read**, and the result of **Read
again**, says why. A file that **took too long to read as audio** timed out. A
file that **couldn't be read as audio** may be damaged or not an audio file.
**Details** has the original message. The next
scan tries a timed-out file again.
With ffprobe, a very large MP3 that can't be measured in time keeps an
estimated length, and scans don't measure it again until its files change.
To try sooner, use [**Read the files again**](books.md#a-books-page) on its
page. Without ffprobe, the book shows **reading it timed out** instead, and the
next scan tries again.

If a network share stops answering during **Read the files again**, the book
appears under **Files that couldn't be read**. A scan that gives up on a folder
lists the books in it there too. Once the share answers, **Read again** on the
row, or the next scan, clears them. Libraries on other drives or shares keep
scanning. On a slow share, **Read again** can say **Still reading**. The server
then finishes the read on its own, as on [a book's page](books.md#a-books-page).

### Working through a list

Under **Long books without chapters**, each book shows its chapter detection job while it is queued, running or waiting for attention. Open the book’s **Chapters** card for the job details.

![A Long Lecture with its chapter detection job in the Health list](/img/screenshots/admin/health-detect-chapters.png)

The Bridge is looking for chapters in the narration of **A Long Lecture**.

- **Ignore** hides a book from this list, even through rescans. Under **One
  book split into disc folders**, it hides the whole set. The set stays
  ignored if you add an earlier disc or rename the folder holding the discs.
  Choose **Show ignored**, then **Show again**, to bring a book or disc set back.
- Tick several rows (or **Select all**) to act on them together from the bar at
  the bottom. **Shift-click** selects a run.

### Duplicates {/* #duplicates */}

**Likely duplicates** shows possible copies in the same library side by side.
When AudioSilo suggests a copy to keep, it prefers the better format (M4B/AAC
over MP3), then a single file, higher bitrate and more listeners, in that order.

If you want to keep two narrations, for example, choose **They're different
books**. This hides the group and deletes nothing. If you later add or remove a
copy, the books that still match come back as a new group.

With two or more book libraries, turn on **Include other libraries** to also
see matching pairs across them. If two copies in your main library both match a
third in your kids' library, you see two pairs. Choosing **They're different books** on one pair
leaves the other pair, and the group in your main library, still listed.

![With Include other libraries on, Health compares copies of The Art of War in Books and Inbox](/img/screenshots/admin/health-duplicates.png)

To bring a group or pair back right away, choose **Undo** in the confirmation
message. To bring it back later:

1. For a pair from two libraries, turn on **Include other libraries** first.
2. Choose **Show ignored**.
3. Choose **Suggest as duplicates again** on its card.

The card leaves the ignored list and shows under **Likely duplicates** again.

If copies share an ASIN or ISBN but have **different lengths**, check for a
match to the wrong recording before removing either one. To remove a copy,
delete its files from the library folder and rescan.

### Series spelled several ways

Pick the series spelling you want listeners to see, then click **Use this
spelling**. AudioSilo offers this choice when books in one library spell their
main series differently in capitals, accents, punctuation or spacing.
**Ignore** hides the suggestion for that series.

AudioSilo changes every matching main series name in that library and keeps
each book's position in the series. Books that list the series only as an
additional series keep their spelling. The limit, all-or-nothing rule and **Undo** work as for
[merging two spellings](books.md#merging-two-spellings) of an author.

### When a library is offline

If a library's folder can't be read, a notice says "*name* is offline. Nothing
was deleted." Once the folder is back, **Retry** scans it. See
[When a library folder goes missing](libraries.md#when-a-library-folder-goes-missing).

## Matching every book at once {/* #matching-every-book-at-once */}

**Not matched to community metadata** has a **Match automatically** card above
its list. It looks up every book in the list in one pass. Nothing changes until
you review and apply what it found. While there are unmatched books, the
overview, **Library > Books** and an applied import's **Past imports** show how
many, with a **Match automatically** button that opens this list.

1. Pick a library and click **Find matches**. You can leave the page while it
   runs. If the community service asks for a pause, the card says so and the
   run carries on by itself.
2. When it's done, click **Review and apply**.
3. Choose **What to write**:
   - **ASIN and ISBN only** marks each book matched and changes nothing else.
   - **Fill in what's missing** (the default) also fills empty fields, adds a
     cover where there is none, and [tidies cluttered titles](#tidied-titles).
   - **Use community values** also replaces fields that differ. Fields you
     edited yourself are never replaced.
4. Check each match and what it would write. **Confident** matches start ticked.
   Untick any that are wrong. **To review** lists matches you need to check.
   Tick the right ones, or click **Match by hand**.
5. Click **Apply to *N* books** to apply the matches in the background.

The count on the button updates when you change **What to write** or your
ticks. It leaves out matches you unticked or matched by hand.

![Reviewing the matches Match automatically found](/img/screenshots/admin/health-bulk-match.png)

A confident match scores at least 90% and usually leads the next candidate by
at least 10 points. Its length must also be close to the book's. The run picks
the edition the way the Match dialog does, as
[Which edition a match suggests](books.md#which-edition-a-match-suggests)
describes. Other matches go to **To review**. A row there marked **Held for review** lists the reasons
that apply to that book. You may see more than one.

- An ASIN or ISBN from the book's tags or an Audiobookshelf import
  ([only a hint](#asin-and-isbn-tags-are-hints)) points to a work whose title or
  series position doesn't match yours.
- That identifier names another book, so the run searched again without it,
  using the book's title, author and other details. Check what it found even if
  the score is high.
- The community lists only dramatizations, and the server could not identify
  one as your recording.
- The recording differs from your book's length by more than 10%, or 20% when
  your book's narrator reads it. The row shows both lengths. If your files
  change, the length warning disappears once they fall within the run's margin.

Whatever a run writes is a **Community** value that you can revert on the
book's page. A book you match by hand after the run found its match keeps your
match. The run skips it and says **Matched since this run**.

After a run has applied its matches, you can reopen its results to read them.
If you [unlink a book](books.md#unlinking-a-community-match) after the run applied
its match, the row says **Unlinked since**. The applied count still includes
that book. To undo every community match at once, use
[Clear community matches](server.md#community-metadata).

If the server stops after it has checked every book, you can still review and
apply those results when it restarts. If community metadata lookups stop
answering, the run stops early but keeps what it found.
While the community service is only busy, the run waits and carries on.

### Books with an ASIN the community doesn't know

**ASIN not in the community database** has a **Find matches by title** card
above its list. It works like **Match automatically**, but looks each book up
by its title and records the match, so players get the community details.
Nothing changes until you review and apply. An ASIN you set yourself is never
replaced. A book whose ASIN the community database learns before you apply is
left as it is.

The list appears once the server has its first result for the report. A book
with an ISBN can still be listed if its ASIN is unknown. Turning the report off
hides the list.

![The unknown-ASIN issue lists A Christmas Carol with its ISBN in the folder name](/img/screenshots/admin/health-unknown-asin.png)

**A Christmas Carol** has an ISBN, but its ASIN is missing from the community database.

### Weak matches

When the best candidate scores under 60%, the community database most likely
doesn't have the book. It is listed under **Not found**. You can still match it
by hand. Once a run has nothing left to review, **See the books it didn't
find** lists them with their best scores. The [match dialog](books.md#matching-with-community-metadata) lists the
closest candidates, however low they scored.

The community database has gaps, so some books stay unmatched. They still play
and keep the details from their tags and folders. **Add it** on a **Not found**
row or an unknown-ASIN issue opens the
[Add a book](../community/meta-site.md#adding-a-missing-book) page with the book
filled in.

### ASIN and ISBN tags are hints

An ASIN or ISBN in a book's tags is only a hint for a match, because tags are
often wrong about it. It never becomes the book's own, so the book shows under
**Not matched** until a match applies. A hint the community database knows makes a
confident match when the length and title fit.

:::warning[A wrong ASIN in a tag can apply the wrong book]
A tag naming a similar book, or another recording, can still look confident.
If you don't trust where your tags came from, check **Confident** before you
apply. Correct the tag, or match the book by hand, to stop it coming back.
:::

### Audiobookshelf's ASINs and ISBNs

Audiobookshelf's identifiers reach AudioSilo in two ways, and they count
differently:

- **From an [Audiobookshelf import](import.md#match-your-books-after-an-import).**
  They are match hints, like tags. A match looks them up before the book's tags,
  and the book stays **Not matched** until a match applies. A wrong one can look
  confident too, and correcting the tag doesn't stop it: match the book by hand.
- **From a `metadata.json` file beside the book.** The ASIN or ISBN counts as the
  book's own straight away, so the book is matched (see
  [Audiobookshelf's metadata.json files](../getting-started/organizing-your-library.md#coming-from-audiobookshelf)).

### Store listings with no ASIN or ISBN

The community database holds some books as a store listing with no ASIN or ISBN (see
[Books matched to a store listing](books.md#books-matched-to-a-store-listing)).
A run applies such a match on its own only when it scores 90% or more, names the
book's author in full, sits at the book's place in its series, and fits its
length within 2%. Otherwise it goes to **To review**.

### Tidied titles

**Fill in what's missing** can replace a file title that adds a series name,
book number, edition label or genre note to the community title. The review
shows the proposed title. A title you edited yourself stays as you wrote it.

| Title in your files | Title after Fill | Why |
|---|---|---|
| `Emergence: The Mystic Knight, Book 1 (Unabridged)` | `Emergence` | The rest is the series, its number and an edition label. |
| `Dune: An Epic Fantasy` | `Dune` | The extra words name a genre. |
| `20 - Hilldiggers` | `Hilldiggers` | A number and a dash at the start only order the files. |
| `The Verity: Part One: Part One` | `The Verity: Part One` | The part is repeated. A different part stays. |
| `Book of the Dead` | `Book of the Dead`, even when the community title is `Dead` | The other words belong to the title. |

The last three rows need server version 2.7.0 or later.

### Which ASIN a match takes

A recording sold in several Audible stores has an ASIN in each. A match takes
the one from your **Audible marketplace** (in
[Server settings](server.md#community-metadata)), then the US store's. Once a
marketplace is set, **Use *country* ASINs** switches books matched earlier to
your store's ASIN.

### Filling in books that are already matched {/* #filling-in-books-that-are-already-matched */}

**Fill in matched books** offers the community database's latest details for books that
are already matched. Use it for books that got an ASIN without their details,
or to clean up series an earlier match added. A book the run found nothing to
change on under your **What to write** choice isn't counted on the Apply button.

A fill keeps a title you reverted on the book's page, and can still fill its
other fields (see [Matching with community metadata](books.md#matching-with-community-metadata)).

If the community doesn't recognise a book's ASIN or ISBN, the fill can still
find it by its recorded match. The review explains this beside any proposed changes.
A fill never brings back an ASIN or ISBN you left unticked or later reverted.
For a book matched before version 2.7.0,
[accept the same edition](books.md#matching-with-community-metadata) again with
nothing ticked, so the server knows which ones you left out.

## Jobs

**Health > Jobs** is where scans are. Scans run one at a time, so they never
compete for the disk.

![Health > Jobs with a scan's log open](/img/screenshots/admin/health-jobs.png)

- **Running now** shows the current scan and its progress. **Stop** ends it
  without removing anything from the library.
- **Waiting** lists the scans queued behind it. **Cancel** drops one.
- **Run a job** starts a scan of one library, or every library.
- **Schedules** lists every library that is scanned automatically. You set
  schedules when you
  [edit a library](libraries.md#scanning-on-a-schedule).

### History

**History** lists every scan, newest first: the library, who or what started
it, how long it took and what it found. Click **Log** to see a scan's details:
books found, moved and removed, and every file it couldn't read and why.
AudioSilo keeps the last 100 scans of each library.

A book that timed out counts as **Changed** only when the scan saved new
lengths for it. Otherwise the history counts only the read problem.

### What a removed book leaves behind

When a book's files are gone, a scan removes it from the library and notes it in
the log. AudioSilo remembers its progress, bookmarks, edits and cover by the
book's path, so if the files come back to the same place, they come back too.

A scan that couldn't read part of the library removes nothing. See
[A scan says part of the folder couldn't be read](../troubleshooting.md#a-scan-says-part-of-the-folder-couldnt-be-read).

## System

**Health > System** lists everything the server depends on, one row each, with
a status such as **Healthy**, **Needs attention**, **Missing** or **Off**.

![Health > System](/img/screenshots/admin/system.png)

| Row | What it tells you |
|---|---|
| **ffmpeg** | Converts formats browsers can't play, and places [community chapters](books.md#community-chapters) exactly. |
| **ffprobe** | Reads lengths, chapters and codecs for the few files AudioSilo can't read itself. Without it, those files have no length or chapters. |
| **Community metadata** | Whether community metadata lookups are answering. |
| **HTTPS certificate** | Days left. **Needs attention** within two weeks of expiry. |
| **Database** | Its version. Accounts and progress live here, so the server makes [backups](backups.md). |
| **Backups** | When the last backup was made and when the next one runs. |
| ***Each library*** | Free disk space. **Needs attention** below a tenth free, or when the folder isn't reachable. |
| **Web player** | Whether people can listen in a browser. |
| **AudioSilo version** | Whether a newer release is out. See [About and updates](server.md#about-and-updates). |

To change any of this, see [Server settings](server.md#settings).

### The local copy of community metadata

When the server [keeps a local copy](server.md#keeping-a-local-copy) of the
community database, the **Community metadata** row shows that copy's status,
version and size.

![Health > System, the community metadata row with a local copy](/img/screenshots/admin/system-mirror.png)

The server checks for a newer copy on its
[schedule](server.md#keeping-a-local-copy), or click **Check now**. A failed
update keeps the current copy in use.
