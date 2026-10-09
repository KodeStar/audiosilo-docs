---
title: "Library health and jobs"
description: "The Health pages of the AudioSilo admin console: what each kind of issue means and how to fix or ignore it, comparing duplicates, offline libraries, the scan queue, stopping a scan, the scan history with its logs, and the System page with everything the server depends on."
---

The **Health** destination in the [admin console](console-tour.md) has three
pages:

- **Issues** ("Library health") lists the books that could be better - files
  that couldn't be read, missing covers, likely duplicates and so on - with a
  fix for each where the console has one.
- **Jobs** shows the scan running now, the scans waiting their turn, the
  schedules, and a history of every scan with its log.
- **System** shows everything the server depends on - ffmpeg, the community
  metadata service, the HTTPS certificate, the database, each library's disk -
  with a plain status for each.

Nothing on these pages changes your audio files. Fixes are saved in AudioSilo
(a cover you upload, a match you accept, a folder detection choice, the
community's chapters), and an
issue you ignore is only hidden.

## Library health

Open **Health** in the top bar (it opens on **Issues**), or click **Triage** on
the overview's **Needs attention** card, which lists the kinds of issue that
have something in them. Clicking one of those opens its list directly.

![Health > Issues](/img/screenshots/admin/health-issues.png)

The line under the title says how many things could be better ("12 things
could be better. None of it loses data.") or "Nothing needs attention right
now." Beside it, "Checked ..." says when a scan last finished, and **Check
again** rescans every library (one at a time - the issues update as each one
finishes).

Under it is one card per kind of issue, with how many books are in it, a few
of their covers, and how many you have ignored. Click a card to open its list
below.

### The kinds of issue

| Card | What it means | The fix it offers |
|---|---|---|
| **Files that couldn't be read** | A scan couldn't read one of the book's files: it couldn't be opened (for example a permissions problem), it is empty (0 bytes), or ffprobe couldn't read it (a damaged or incomplete file). The row names the file and the reason. Every scan checks the file again, so once you fix the permissions or the share is back, the book leaves the list by itself. | **Read again** reads the book's files again straight away. A toast says "*title* reads fine now", or "*title* still can't be read" with the reason. |
| **Folder may hold several books** | AudioSilo reads a folder with audio in it as one book. These folders look like they hold several: at least two parts, every part an hour or longer, with different titles. | **Choose detection** opens [Library > Folders](libraries.md#the-folders-page) on that folder: **Separate books** splits it, and **Always one book** tells AudioSilo it really is one book, which also clears it from this list. |
| **One book split into disc folders** | A book ripped from CDs sits in one folder per disc (`CD1`, `CD2`, ...), so each disc reads as its own book. The row is the first disc, and says "*folder* reads as one book per disc folder". | **Join into one book** sets the folder holding the discs to **Always one book** ("Joining the discs of *folder*"). The library rescans, then they play as one book, with listening progress carried over. See [Books split into disc folders](libraries.md#books-split-into-disc-folders). |
| **Likely duplicates** | Copies of one book in the same library. See [Duplicates](#duplicates). | A side-by-side comparison. |
| **Missing covers** | No cover image in the book's folder and none inside its files. | **Upload a cover** opens the book's page, where **Change cover** adds one (see [Covers](books.md#covers)). |
| **Not matched to community metadata** | The book has no ASIN or ISBN, so community metadata can't find it. Only shown while [community metadata](server.md#community-metadata) is on. | **Review match** opens the book's page with the match dialog open (see [Matching](books.md#matching-with-community-metadata)). To match the whole list at once, use **Match automatically** above it (see [Matching every book at once](#matching-every-book-at-once)). |
| **Long books without chapters** | Books over two hours long with no chapter marks (or a single chapter). Listeners can play them but can't jump between chapters. When the book was checked against the community's chapter lists and they couldn't be used, a second line says why, for example "Community chapters: for another edition" or "Community chapters: cross from one file into the next. Merging the files would let them fit" (see [Community chapters](books.md#community-chapters)). | None in the console. [Match](books.md#matching-with-community-metadata) the book so its community chapters can be used (a book with no chapters of its own gets them automatically once they fit), add chapters to the file with your tagging tool, or ignore it. |
| **More detailed chapters available** | The book has chapters, and the community has finer ones that fit this copy ("Has 34 chapters; the community's finer ones fit this copy"). Nothing changes until you use them. | **Use detailed chapters** switches the book to the community's chapters. Using them on the book's page does the same. Once you have chosen, the book stays off this list, even if you later switch it back to the file's chapters. |
| **Converted to play in browsers** | The audio format doesn't play in web browsers, so the server converts it while someone listens in the web player. The apps play it as it is. | None needed: it works. Re-encode the file if you'd rather the server didn't convert it, or ignore it. |

### Working through a list

Each row shows the book's cover, title, why it is listed and where it is on
disk. Click the title or cover to open the book's page.

- **Ignore** hides the book from this list. A toast confirms it with an
  **Undo** button. An ignored book stays hidden through rescans, and even if
  you move its folder, until you show it again. Ignoring a book in one list
  doesn't hide it from the others.
- **Show ignored (*N*)** switches to the books you've ignored ("Ignored:
  *kind*"), each with **Show again**. **Back to the open ones** returns.
- Tick the box on several rows (or **Select all**) to act on them together
  from the bar at the bottom: **Ignore** (or **Show again** in the ignored
  view), **Read again** in **Files that couldn't be read** (it reads two
  books at a time, so a long selection takes a moment), and **Use detailed
  chapters** in **More detailed chapters available**.
- Long lists load 50 books at a time; **Show more** loads the next.

When a list is empty it says **All clear** - the category you were working on
stays open rather than jumping to the next one. Books you ignored stay ignored
until you show them again.

### Matching every book at once

**Not matched to community metadata** opens with a **Match automatically**
card above its list. It looks every book in the list up in the community
catalogue in one pass, then waits for you: nothing changes until you review
what it found and apply it.

1. Pick a library (when you have more than one) and click **Find matches**.
   The server does the work, so you can leave the page. The card shows
   "Matching *N* of *M* books", and **Stop** ends the run without changing
   anything.
2. When it's done, the card counts what it found: **confident** matches,
   matches **to review**, books **not found**, and any it **couldn't check**
   (the catalogue didn't answer for them). Click **Review and apply**.
3. Choose **What to write**:
   - **ASIN and ISBN only** marks each book matched, so players show its
     "About this book", and changes nothing else.
   - **Fill in what's missing** (the default) also fills every field the book
     has empty (narrator, series, published year, description) and takes the
     community cover for a book with no cover at all. Nothing the book already
     has is replaced.
   - **Use community values** also replaces fields that differ, as accepting a
     match by hand does.

   Under each book the dialog says what your choice writes, for example "Sets
   Narrator, Published, and ASIN". Fields you edited yourself are never
   replaced, and a series number is only set beside the series it belongs to.
4. Each book shows its path in the library (hover it for the whole path on
   disk) and, under an arrow, the community match: its title, authors,
   narrators and length, the series it belongs to with its position ("Series:
   Alice in Wonderland #2"), and the ASIN with its store. A match to the wrong
   book of a series, or to another series altogether, shows at a glance.
5. **Confident** matches are ticked; untick any you don't want. **To review**
   lists matches that scored lower, or only just ahead of another work: tick
   the ones that are right, or click **Match by hand** to open that book's
   match dialog. **Not found** and **Not checked** list the rest.
6. Click **Apply to *N* books**. The server applies them in the background
   ("Applying *N* of *M* matches"). **Stop** finishes the books in hand and
   leaves the rest to apply later from the same review.

![Reviewing the matches Match automatically found](/img/screenshots/admin/health-bulk-match.png)

A match is confident when it scores 90% or more, at least 10 points ahead of
the next candidate, and its recording has an ASIN or ISBN to attach. Whatever a
run writes shows as a **Community** value on the book's page, and you can
revert it like any other. To undo every community match at once and start
again, use [Clear community matches](server.md#community-metadata) in Server
settings.

Books you've ignored under **Not matched** are left out of a run. If the
catalogue stops answering, or community metadata is turned off, the run stops
by itself and the card says why. A run sends the same as matching a book by
hand (see [What matching sends](books.md#matching-with-community-metadata)), a
couple of books at a time.

#### Which ASIN a match takes

A recording sold in several Audible stores has an ASIN in each. A match takes
the one from the store set as **Audible marketplace** in
[Server settings](server.md#community-metadata), then the US store's, then any
other. The review shows each ASIN's store ("B0... · UK"). With no marketplace
set, the US store's comes first.

Once a marketplace is set, the card also offers **Use *country* ASINs**. It
looks again at the books matched earlier, by hand or in bulk, and offers to
switch each one to its recording's ASIN in your store, where the community
catalogue now has one (it gains them over time). Review and apply it the same
way. It never changes an ASIN from your tags, or one you typed.

### Duplicates

**Likely duplicates** shows each group of copies side by side, with the copy
worth keeping first (marked **Worth keeping**, the others **Another copy**).
"Worth keeping" means the better format (M4B/AAC over MP3), then a single file
over several, then the higher bitrate, then the copy more people listen to.

![Comparing likely duplicates](/img/screenshots/admin/health-duplicates.png)

The line under the title says why they look like copies: identical audio
files, or the same title, author and length in different files. Each column
shows the copy's **Path**, **Format**, **Length**, **Size**, **Chapters**,
whether it is **Matched**, how many **Listeners** have progress on it, and
when it was **Added**. **Open book** opens a copy's page.

- Only copies **in the same library** are compared. The same book in two
  libraries is deliberate (a kids' library, say), and players already show it
  once.
- The discs of a book split into disc folders look alike but aren't copies, so
  they are listed under **One book split into disc folders** instead, never
  here.
- Keeping both copies is fine. If they really are different books (two
  narrations, an abridged edition), click **They're different books** and the
  group stops being suggested - until another copy turns up. The ignored view
  has **Suggest as duplicates again**.
- AudioSilo never deletes a copy for you. To remove one, delete its files from
  the library folder and rescan; listening progress on the deleted copy's path
  is kept (see [Jobs](#what-a-removed-book-leaves-behind)).

### When a library is offline

If a library's folder can't be read (typically a network share that
unmounted), a notice at the top of the page says "*name* is offline. Nothing
was deleted." AudioSilo can't read the folder, so it kept the library's books,
and the notice says how many listeners' progress is safe. **View library**
opens [Library > Libraries](libraries.md); once the folder is back, **Retry**
scans it. See
[When a library folder goes missing](libraries.md#when-a-library-folder-goes-missing).

## Jobs

**Health > Jobs** is where scans are. "Scans run one at a time; the rest wait
their turn." - a scan of one library waits while another library is scanned,
so they never compete for the disk.

![Health > Jobs with a scan's log open](/img/screenshots/admin/health-jobs.png)

### Running now and waiting

- **Running now** shows "Scanning *name*", why it started and when, a
  progress bar, and counters: **Books checked**, **New**, **Changed**,
  **Moved** and **Removed**. When nothing runs it says **Nothing running**.
- **Stop** ends the running scan. A scan you stop removes nothing from the
  library: "Nothing was removed. The next scan picks up where it left off." (If
  it was already removing missing books, that finishes first, and the history
  shows what it removed.)
- **Waiting (*N*)** lists the scans queued behind it, in order. **Cancel**
  drops one before it starts.
- **Run a job** starts a scan: **Rescan** one library, or **Rescan every
  library**.

A scan has up to an hour; the scan when the server starts has no limit, since
it may be indexing a whole library. Deleting a library cancels its scans. A
library whose folder doesn't answer (a network share whose server is gone)
stops at once as "Folder unreachable" instead of holding up the scans behind
it.

A library whose scan is waiting shows a **Waiting** badge on its card in
[Library > Libraries](libraries.md), and its **Rescan** button reads
**Queued**.

### Schedules

The **Schedules** card lists every library that is scanned automatically,
with its schedule ("Every 6 hours", "Daily at 03:00") and when the next scan
is due. **Change** opens Library > Libraries; schedules are set when you
[edit a library](libraries.md#scanning-on-a-schedule).

### History

**History** lists every scan, newest first: the library, who or what started
it (an admin's name, **Scheduled**, **Server start** or **Settings
changed**), when, how long it took, and what it found - for example "3 new · 1
changed · 1 removed", "No changes", or how it ended (a book you renamed or
moved counts once, as moved):

| Result | Meaning |
|---|---|
| "Part of the folder couldn't be read, so nothing was removed" | Some folders were unreadable (often permissions), so the scan didn't remove anything it couldn't see. |
| "Folder unreachable. Nothing was removed" | The library's folder was missing or empty (an unmounted share). |
| "Failed. Nothing was removed" | Something went wrong; the log says what. |
| "Stopped. Nothing was removed" | An admin stopped it. |
| "The server stopped during the scan" | The server shut down or restarted mid-scan. The next scan catches up. |

Use **Show scans of** to see one library's scans. **Log** opens a scan's log:
when it started, how many books it found, every book that moved ("progress
followed"), every file it couldn't read and why, every book removed from the
index, and how it finished. **Older scans** loads more. AudioSilo keeps the
last 100 scans of each library.

When you join a folder's disc folders into one book (see
[Books split into disc folders](libraries.md#books-split-into-disc-folders)),
the log has a line for each disc: "Joined *disc* into *folder*; progress
followed", or "Joined *disc* into *folder*; progress stayed with the disc:
length unknown" when the length of a disc before it couldn't be read (no
ffprobe). Setting the folder back to Automatic logs "Split *folder* back into
its discs; its progress stays with the folder". Neither counts as new or
removed books.

### What a removed book leaves behind

When a scan finds a book's files are gone, it removes the book from the
library and writes "Removed from the index: *path*" in the scan's log. That
log line is all the console keeps about it - there are no "missing" books
cluttering the library. Nothing personal is lost, though: everyone's progress,
bookmarks and notes, and your edits and cover, are remembered by the book's
path, so if the files come back to the same place, the next scan brings the
book back with all of it. A book you **moved** is followed to its new place
instead ("Moved *path* to *new path*; progress followed"). If a listener
already had progress saved at the new place (from an earlier book that sat
there), the more recently saved of the two is kept.

## System

**Health > System** lists everything the server depends on, one row each, with
a status on the right: **Healthy**, **Needs attention**, **Missing**, **Off**,
**Waiting**, **Downloading**, **Update available** or **Failed**. The page
refreshes itself every 30 seconds.

![Health > System](/img/screenshots/admin/system.png)

| Row | What it tells you |
|---|---|
| **ffmpeg** | Found (with its version), so formats browsers can't play are converted while someone listens, and [community chapters](books.md#community-chapters) start on the pause in the audio; "Downloaded into the data folder" when the server fetched its own copy. **Missing**: those formats won't play in the web player, and community chapter starts may be a few seconds off. |
| **ffprobe** | Found, so lengths, chapters and codecs are read from the files. **Missing**: lengths and chapters come only from tags. |
| **Community metadata** | **Healthy** with how fast the service answered, **Needs attention** when it isn't responding, or **Off** (switched off, or no service address set). The server only asks the service while the lookup is on, at most once a minute. A server that keeps a [local copy](server.md#keeping-a-local-copy) shows the copy here instead: see [below](#the-local-copy-of-community-metadata). |
| **HTTPS certificate** | **Healthy** with the days left and who issued it, **Needs attention** when it expires within two weeks, has expired or its file can't be read, **Waiting** while Let's Encrypt hasn't issued it yet, or **Off** with plain HTTP (a reverse proxy in front handles HTTPS). |
| **Database** | Its schema number. The book index can be rebuilt from your folders; accounts and progress can't, which is why the server makes [backups](backups.md) of it. |
| **Backups** | The backups folder, when the last backup was made and when the next one runs. **Failed** (with the reason) when the last backup failed; **Off** when no backups are scheduled, marked as a problem if there isn't a single backup either. See [Backups and restoring](backups.md). |
| ***Each library*** | The library's folder, and the space free on its disk. **Needs attention** when less than a tenth of the disk is free, or when the folder isn't reachable. |
| **Web player** | Whether people can listen in a browser at `/web`: "Built into this server.", "Served from the player folder." or, marked **Off**, "Not available. The apps still work." |
| **AudioSilo version** | The version you run: **Healthy** when it's the newest (or, for a build of your own, "A development build, so it isn't compared with releases."), **Update available** when a newer release exists, **Needs attention** when the last check failed, or **Off** when the update check is turned off. See [About and updates](server.md#about-and-updates). |

Two notices can appear above the list:

- "A library folder isn't reachable" (or how many aren't). Nothing was
  deleted: the server keeps every book, and people's progress, until the folder
  is back. Mount it again, then rescan (see
  [When a library is offline](#when-a-library-is-offline)).
- "The community metadata service isn't responding": players still show what
  they already had, and new matches wait until it's back. **Metadata settings**
  opens [its settings](server.md#community-metadata). Nothing to do unless it
  lasts a day. (A server with a local copy doesn't show this notice: the
  copy's own row says what's wrong.)

To change any of this, see [Server settings](server.md#settings): the HTTPS
mode and certificate names are under **Network & HTTPS**, the tools under
**Transcoding**, the backup schedule under **Backups**.

### The local copy of community metadata

When the server [keeps a local copy](server.md#keeping-a-local-copy) of the
community metadata (and the lookup is on), the **Community metadata** row is
about that copy:

| Status | What it means |
|---|---|
| **Healthy** | "Answering from the local copy. No book is looked up over the internet." |
| **Downloading** | The first copy is downloading ("Downloading the local copy for the first time."), or a newer one is downloading while the current copy keeps answering. |
| **Waiting** | "No local copy yet. The first download starts shortly." |
| **Needs attention** | The copy still answers, but its last update failed, or it is newer than this version of AudioSilo understands. |
| **Failed** | "The local copy couldn't be downloaded." There is no copy yet, so lookups go to the online service. |

Under the row:

- While a download runs, a progress bar with how much has arrived (the page
  then refreshes every 2 seconds).
- The copy's details: **Data version**, **Built**, **Data schema**, **Size on
  disk**, **Downloaded**, **Last check** and **Next check**.
- "Using the online service until the local copy is ready", while there is no
  copy to answer from yet: lookups go to the metadata service meanwhile, as
  they would without a local copy.
- "This copy is newer than this server understands": update AudioSilo. Until
  then, anything the copy can't answer goes to the online service.
- "The download failed" or "The last update failed. The current copy stays in
  use.", with the reason, such as not enough disk space and how much is
  needed. A failed check is tried again an hour later.
- **Check now** looks for a newer copy straight away (it's greyed out while a
  download runs). The server already checks once a day by itself, so this is
  only for when you don't want to wait.

## Where to next

- [Server settings, updates and logs](server.md) - the settings behind the
  System page, updates and the server's log.
- [Libraries](libraries.md) - schedules, skipped files and folder detection.
- [Books and metadata](books.md) - covers, matching and a book's page.
