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
[saves the chapters it finds](generating-characters-and-recaps.md#where-found-chapters-show-and-turning-them-off)
in a `.audiosilo` folder beside the book.

## Library health

Open **Health** in the top bar, or click **Triage** on the overview's **Needs
attention** card. Each kind of issue has a card with how many books are in it.
Click a card to open its list.

![Health > Issues](/img/screenshots/admin/health-issues.png)

**Check again** rescans every library, and the issues update as each finishes.

### The kinds of issue

| Card | What it means | How to fix it |
|---|---|---|
| **Files that couldn't be read** | A file couldn't be read, is empty, or isn't audio. The row gives the reason in one line; for a file that isn't audio, **Details** shows the full message. | Fix the file or its permissions. **Read again** checks it straight away; otherwise the next scan does. |
| **Folder may hold several books** | A folder reads as one book but looks like it holds several. | **Choose detection** opens the folder in [Library > Folders](libraries.md#the-folders-page). Then choose **Separate books** or **Always one book**. |
| **One book split into disc folders** | A book ripped from CDs reads as one book per disc. | **Join into one book**. See [Books split into disc folders](libraries.md#books-split-into-disc-folders). |
| **Likely duplicates** | Copies of one book in the same library. | Compare them side by side. See [Duplicates](#duplicates). |
| **Missing covers** | No cover in the book's folder or files. | **Upload a cover** opens the book's page (see [Covers](books.md#covers)). |
| **Not matched to community metadata** | The book has no community match, so players can't show its community details. Only shown while community metadata is on. | **Review match** opens the [match dialog](books.md#matching-with-community-metadata). To match the whole list, use [Match automatically](#matching-every-book-at-once). |
| **Series spelled several ways** | Books of one series spell its name differently. | **Use this spelling**. See [Series spelled several ways](#series-spelled-several-ways). |
| **Long books without chapters** | Books over two hours with no chapters, so listeners can't skip between them. | **Detect chapters** with your [Bridge](bridge.md) (see [Detect chapters](generating-characters-and-recaps.md#detect-chapters-without-characters-and-recaps)), or [match](books.md#matching-with-community-metadata) the book to use its [community chapters](books.md#community-chapters). |
| **More detailed chapters available** | The community database has finer chapters that fit this copy. | **Use detailed chapters**. |
| **Converted to play in browsers** | The format doesn't play in web browsers, so the server converts it for the web player. The apps play it as it is. | Nothing needed: it works. |

If a network share stops answering during a scan, its books show **reading it
timed out**. They keep their length and chapters, and the next scan tries again.

### Working through a list

- **Ignore** hides a book from this list, even through rescans. **Show
  ignored** lists them, each with **Show again**.
- Tick several rows (or **Select all**) to act on them together from the bar at
  the bottom. **Shift-click** selects a run.

### Duplicates

**Likely duplicates** shows each group of copies side by side, with the copy
worth keeping first. That is the better format (M4B/AAC over MP3), then a
single file over several, then the higher bitrate, then the copy more people
listen to.

![Comparing likely duplicates](/img/screenshots/admin/health-duplicates.png)

- AudioSilo never deletes a copy for you. To remove one, delete its files from
  the library folder and rescan.
- If they are really different books (two narrations, say), click **They're
  different books**.
- **Include other libraries** also compares copies across libraries.

Copies that share an ASIN or ISBN but have **different lengths** may not be
copies at all. One may be matched to the wrong recording. Check before you
delete either.

### Series spelled several ways

AudioSilo already shows spellings that differ only in capitals, accents or
punctuation as one series. But the books still say it differently in the
players' details. This list fixes that.

- **Use this spelling** sets one spelling on every book of the series, as an
  edit. Pick another spelling from the list beside it if you prefer. The
  message has an **Undo** button.
- **Ignore** stops suggesting that series.

### When a library is offline

If a library's folder can't be read, a notice says "*name* is offline. Nothing
was deleted." Once the folder is back, **Retry** scans it. See
[When a library folder goes missing](libraries.md#when-a-library-folder-goes-missing).

## Matching every book at once

**Not matched to community metadata** has a **Match automatically** card above
its list. It looks up every book in the list in one pass. Nothing changes until
you review and apply what it found.

1. Pick a library and click **Find matches**. You can leave the page while it
   runs.
2. When it's done, click **Review and apply**.
3. Choose **What to write**:
   - **ASIN and ISBN only** marks each book matched and changes nothing else.
   - **Fill in what's missing** (the default) also fills empty fields, adds a
     cover where there is none, and [tidies cluttered titles](#tidied-titles).
   - **Use community values** also replaces fields that differ. Fields you
     edited yourself are never replaced.
4. Check each match and what it would write. **Confident** matches are ticked;
   untick any that are wrong. **To review** lists matches you need to check.
   Tick the right ones, or click **Match by hand**.
5. Click **Apply to *N* books**. The server applies them in the background.

![Reviewing the matches Match automatically found](/img/screenshots/admin/health-bulk-match.png)

A match is **confident** when it scores 90% or more and leads the next
candidate by at least 10 points. Its length must also be within 10% of the
book's (20% when the book's narrator reads it). Weaker matches, and matches to a dramatization your
book doesn't seem to be, go to **To review**.

Whatever a run writes is a **Community** value that you can revert on the
book's page. To undo every community match at once, use
[Clear community matches](server.md#community-metadata). If community
metadata lookups stop answering, the run stops early but keeps what it found.

### Weak matches

When the best candidate scores under 60%, the community database most likely
doesn't have the book. It is listed under **Not found**. You can still match it
by hand. The [match dialog](books.md#matching-with-community-metadata) lists the
closest candidates, however low they scored.

The community database has gaps, so some books stay unmatched. They still play
and keep the details from their tags and folders. To add a missing book to the
database, see [Contributing](../community/meta-site.md#contributing).

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

An ASIN from an Audiobookshelf `metadata.json` counts as the book's own straight
away (see
[Audiobookshelf's metadata.json files](../getting-started/organizing-your-library.md#coming-from-audiobookshelf)).

### Store listings with no ASIN or ISBN

The community database holds some books as a store listing with no ASIN or ISBN (see
[Books matched to a store listing](books.md#books-matched-to-a-store-listing)).
A run applies such a match on its own only when it scores 90% or more, names the
book's author in full, sits at the book's place in its series, and fits its
length within 2%. Otherwise it goes to **To review**.

### Tidied titles

**Fill in what's missing** replaces a title only when it is the community
database's title plus clutter, such as the series name, a book number or "Unabridged".
"Emergence: The Mystic Knight, Book 1 (Unabridged)" becomes "Emergence". A
title you edited yourself is never tidied.

### Which ASIN a match takes

A recording sold in several Audible stores has an ASIN in each. A match takes
the one from your **Audible marketplace** (in
[Server settings](server.md#community-metadata)), then the US store's. Once a
marketplace is set, **Use *country* ASINs** switches books matched earlier to
your store's ASIN.

### Filling in books that are already matched

**Fill in matched books** offers the community database's latest details for books that
are already matched. Use it for books that got an ASIN without their details,
or to clean up series an earlier match added. It never brings back an ASIN or
ISBN you left unticked or removed. For a book matched before version 2.7.0,
accept its match again with a field ticked, or unlink and match it again.

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

### What a removed book leaves behind

When a book's files are gone, a scan removes it from the library and notes it in
the log. AudioSilo remembers its progress, bookmarks, edits and cover by the
book's path, so if the files come back to the same place, they come back too.

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

The server checks for a newer copy once a day, or click **Check now**. A failed
update keeps the current copy in use.
