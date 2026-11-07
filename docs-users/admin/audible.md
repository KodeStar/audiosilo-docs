---
title: Audible
description: "See the books in the Audible accounts your Bridge signs in to, which of them are already on your server, back up the rest into your library, and keep listening places in step with Audible: the Audible module, the Audible accounts card on Settings > Bridge, the titles page, how titles are matched, Back up, Not this book, a destination, Back up everything, the backup policies, where backups go, preorders, what a failed backup means, syncing listening places and Don't sync, Check now and removing an account."
---

Your [Bridge](bridge.md) can sign in to your Audible accounts, list the books each
one owns and find the ones already on your server. The console shows the result,
and from it you can have the Bridge **back up** the books you bought into your
library: it downloads each one from Audible, removes its copy protection (a
lossless copy, chapters kept) and places it beside your other books. When you turn
it on for an account, the Bridge also keeps the account's **listening places** in
step with Audible, both ways (see [Syncing listening places](#syncing-listening-places)).

:::note[A personal backup of books you bought]
Audible backups are for making **a personal backup of books you bought**, with your
own account, for your own listening. Laws on removing DRM, even from your own
purchases, differ from country to country, and in some places it is not allowed at
all, even for personal use. Check your local law, and keep the copies for yourself.
The console repeats this on the titles page and in the backup dialogs.
:::

## What it needs

- **A Bridge** paired with your server and online, in a version that supports
  Audible (its Accounts tab has an **Audible** card). See
  [Running a Bridge](../getting-started/running-a-bridge.md).
- **An Audible account signed in on the Bridge.** You sign in, and choose who and
  which library each account is for, on the Bridge's own page only:
  [Bridge accounts](../getting-started/bridge-accounts.md#audible). The server
  never sees your Amazon password or the Bridge's sign-in.
- **The Audible module turned on** in
  [Server > Settings > Modules](server.md#modules). It starts off. Its card says
  **An online Bridge that supports Audible** until the Bridge is ready, and **On,
  but nothing is checked until the Bridge is ready.** when you turn it on before
  then.
- **To back up:** the account's library **Ready** for the Bridge (mapped and
  writable, see [Libraries](bridge.md#libraries)), and room for the books, both
  in the Bridge's data folder (where it downloads) and in the library.

While the module is on, **Server > Settings** gains an **Audible** page, and
**Settings > Bridge** an **Audible accounts** card. The player has no Audible
screens: a book once backed up is an ordinary book of the library, which its
listeners see as usual, and with [sync](#syncing-listening-places) on, a place from
Audible reaches the listener like a place from another device.

With no Bridge paired, the page offers **Pair a Bridge** and explains that it
is needed to check accounts and back up books. Saved accounts and titles can
still be managed. **Check now** and **Back up** wait until a paired Bridge has
reported support for the relevant job; if support is missing, update the
Bridge or wait for its first report. A paired Bridge that supports those jobs
but is offline can still have work queued, to run when it reconnects.

For server 2.6.0, upgrade the server and its accompanying Bridge release
together before using Audible, as explained in
[Which Bridge version](../getting-started/running-a-bridge.md#which-bridge-version).

## The Audible accounts card

![The Audible accounts card on Server > Settings > Bridge](/img/screenshots/admin/audible-accounts-card.png)

On **Server > Settings > Bridge**, under Libraries, the **Audible accounts** card
lists every account the Bridge has signed in to. The card is there only while a
Bridge is paired; with none paired, use the [titles page](#the-titles-page). Who
the account is for and its library are the Bridge's: you change them on the
Bridge's Accounts tab (with no account yet, the card links to it when the Bridge
has told the server its page's address). What the account backs up, where, and
whether its places sync is set here. **View titles** opens the [titles page](#the-titles-page).

For each account:

| Row | What it shows |
|---|---|
| The heading | the account's name (the person and the store, such as "Chris (US)", unless the Bridge gave it another), and **Checked** with when the Bridge last finished checking it, or **Not checked yet** |
| **For** | the person on your server the account belongs to |
| **Library** | the books library its titles are matched against |
| **Store** | the Audible store it buys from (US, UK, DE and so on) |
| **Back up** | what the account backs up by itself after each check: **Every new book**, **New books in series you have** or **Only books you choose** (see [Backing up by itself](#backing-up-by-itself)) |
| **Placement** | where its backups go: **Beside the series' other books**, or the account's placement template (see [Where backups go](#where-backups-go)) |
| **Sync** | whether its listening places sync with Audible and when they last did, or why it has stopped (see [When it stops](#when-it-stops)) |
| **Titles** | how many titles the account has, and how many of them are on this server |

Each account has **Check now**, **Account settings...** (its policy and placement
template, [below](#backing-up-by-itself), and whether its places
[sync](#syncing-listening-places)), **Back up everything...**
([below](#back-up-everything)) and **Remove...** ([below](#removing-an-account)).

![The Account settings dialog: Back up by itself, the placement template and Sync listening places with Audible](/img/screenshots/admin/audible-backup-settings.png)

With no account yet, the card says **No Audible accounts yet**, with **Open the
Bridge's Accounts tab**.

**Paused** marks an account whose library was deleted: the Bridge isn't asked to
check it, its titles lose their matches, and nothing of it can be backed up (its
**Back up** buttons are off). Choose another library for it on the Bridge's
Accounts tab (**Change**) to carry on.

## The titles page

![Server > Settings > Audible: the titles of the signed-in accounts, with their states and whether each is on this server](/img/screenshots/admin/audible-titles.png)

**Server > Settings > Audible** lists every title your Audible accounts own or have
[preordered](#preorders), as the Bridge last saw them, sorted by title. Each row shows the title, its authors and
series, then its length, the release date of a preorder, its ASIN, (with several
accounts) which account owns it, and **To ...** when you gave it a
[destination](#choosing-a-destination). A title that isn't on this server says
[where its backup would go](#where-a-title-would-go), and one that is
[contested](#contested-titles) says which book it tied for. A title Audible won't
let you download says why, and so does a backup that failed. Under it are the title's
[backup buttons](#backing-up-a-book): **Back up**, **Not this book** and
**Destination...**, and for a title on this server **Don't sync**
([below](#dont-sync-this-book)).

On the right: its state, and **On this server** (a link to the book's page in the
console) or **Not here**. **Matched by title** marks a match made from the title
and author rather than the ASIN (see [How titles are matched](#how-titles-are-matched)),
**Backed up here** a book the Bridge backed up, **Not this book** a title you
[marked](#not-this-book), and **Not synced** a title you marked
[Don't sync](#dont-sync-this-book). Last comes the [backup's status](#a-titles-backup-status),
when it has one.

Above the list:

- **Search titles** finds a title by its name, one of its authors, or its exact
  ASIN.
- **Account** (only with more than one account) shows one account's titles.
- **State** shows titles in one state.
- **On this server** shows only the titles that are here, or only those that are
  **Not here yet** (a title marked **Not this book** counts as not here).

The page shows 50 titles at a time; **Load more** adds the next ones. The list
refreshes on its own when the Bridge finishes a check, and every few seconds while
a backup is waiting or running.

**Check now**, **Back up everything...** and **Remove...** sit at the top of the
page for the account you chose under **Account**, or for the only one there is.

### Title states

| State | Means |
|---|---|
| **Available** | the account owns it and can download it |
| **Preorder** | ordered but not released yet; the row says when it is (see [Preorders](#preorders)) |
| **Unavailable** | the account has it but Audible won't let it be downloaded (for example a podcast or a periodical, or a title without download rights); the row says why |
| **No longer in the library** | it was in the account before, but the Bridge's last complete check didn't find it (returned, or removed from the account) |

Audible sometimes gives a title it has had for years a placeholder release date
far in the future (such as the year 2200). A date more than two years ahead is
ignored, so such a title is **Available**, not a **Preorder**.

## How titles are matched

At each check, the Bridge reads the account's library from Audible and your books
library from the server, and matches each title to a book there:

1. **By ASIN first.** A book whose ASIN (from a community match, an Audiobookshelf
   `metadata.json`, or set in the console) is the title's matches at once. An ASIN
   only in the audio tags [doesn't count](health.md#asin-and-isbn-tags-are-hints).
2. **Then by title and author**, with the series, the book's number in it and the
   narrators to help. These show **Matched by title**.

A few things help a title find its book:

- **The same title by the same author** matches, even when Audible files the book
  under a differently named series than your tags do. A title that is just the
  series name and a number ("Dragon Heart: Book 6") needs the number to agree.
- **The book's number in the series** tells the volumes of a series apart. When
  your tags don't give it, a code at the start of the book's folder name does:
  `DH06 - Land of Magic` is book 6 of Dragon Heart, `BDM01 - Oathbound Healer` book
  1 of Beneath the Dragoneye Moons. The code's letters must be the series' initials
  (all of them or some, in order). Other codes, like `HALO 07` in the Halo series,
  are ignored. This doesn't change the book's position anywhere else on your
  server.
- **A folder covering several books**, like `LAM05-06`, is treated as an omnibus,
  so Audible's book 5 on its own won't match it. An Audible pack of books 5 and 6
  can. A pack can also match a folder numbered as its first book (`LAM05`); it
  shows as on this server, but that book's details are not updated from the pack.

**When several titles match one book**, one of them keeps it:

1. a title matched **by the book's ASIN** keeps it;
2. otherwise a title whose **number in the series is the book's** keeps it, even
   over a title that matched more closely by name (so book 2 keeps the book 2
   folder, and book 3 with a similar name doesn't take it);
3. otherwise the **best match** keeps it.

The titles that lose show **Not here**. One whose number says it is another
volume of the series is simply not matched; the rest are
[contested](#contested-titles): the book is probably here under another title. If the best titles tie, none keeps it,
unless they are the same book owned twice (the same title, author and number):
then all of them keep it. [Back up everything](#back-up-everything) and the
[policies](#backing-up-by-itself) never back up a contested title; **Back up**
still does, if you are sure it isn't here.

### Contested titles

A contested title says which book it tied for and which titles matched it too:
"Matched the same book as *Moon over Soho*: *Ben Aaronovitch/PG02 - Moon over
Soho*, so this title isn't shown as here. Add the right ASIN to that book and Check
now, or back this title up if that book isn't it." The book is a link to its page
in the console. Until the next check, a title last checked before this update
says "Another Audible title matched the same book, so this one isn't shown as here."

What to do:

- **The book is this title.** Give the book this title's ASIN (on the book's page,
  [Editing details](books.md#editing-details) > **ASIN**), then press
  [Check now](#check-now). A match by ASIN always wins, so at the next check this
  title keeps the book.
- **The book isn't this title.** Press **Back up**: the title is backed up as a
  book of its own (see [where it would go](#where-a-title-would-go)).

Marking the other title **Not this book** doesn't settle a contest yet.

A reason the console has no words for reads "The Bridge couldn't match it to a
book on this server."; a reason Audible gave (such as why a title can't be
downloaded) is shown as Audible wrote it.

When a book matched by title and author has no ASIN yet, the Bridge gives it the
Audible title's ASIN, so later checks, and the community metadata, match it exactly.
It doesn't when more than one title matched the book, even if one of them kept it
(the match is in doubt), when the title is a preorder (the book you have is another
edition), or when the book already has an ASIN, including one you set or cleared in
the console: those are never replaced.

Matches follow your books: when a book is renamed or moved (or joined with another
in the console), its titles stay matched to it. A book the Bridge
[backed up](#backing-up-a-book) stays its title's match on later checks while it is
in the library. Deleting a library clears the matches into it and pauses the
accounts mapped to it.

## Backing up a book

Each title on the titles page has its own buttons:

- **Back up**: for a title that is **Available** (or a **Preorder**, see
  [Preorders](#preorders)) and not on this server, with no backup already waiting
  or running. It is off while the account is **Paused**.
- **Not this book** (and **Undo Not this book**): see [below](#not-this-book).
- **Destination...**: where this one title goes, for a title not on this server
  (see [Choosing a destination](#choosing-a-destination)).

Press **Back up** and the console says **Backing up** with the title: the Bridge
downloads it in turn, one book at a time per account. Asking for a book that is
already on this server, or one already waiting, says so instead. A title Audible
doesn't offer for download now (an **Unavailable** title, or one **No longer in the
library**) can't be backed up. A queued backup is in the
[audit log](server.md#audit-log) as **Queued a Bridge job**.

### Where a title would go

At each check the Bridge also works out where each title that isn't on this
server would be backed up, by the same rules a backup uses
([Where backups go](#where-backups-go)), and the row says so, **planned at the
last check**:

- "Will go to *Ben Aaronovitch/Rivers of London/2 - Moon over Soho/Moon over
  Soho.m4b*, beside 7 books of its series";
- "..., the first book of its series here", "..., in the author's existing folder"
  or "..., into a folder that already exists";
- **in warning colours** when the place is taken (by a file, another book, or a
  folder that already holds audio): "Would go to ..., but a file is already there,
  so the backup would stop. Choose a destination." A backup never overwrites
  anything, so pick a [destination](#choosing-a-destination) for it first;
- **in warning colours** too when the Bridge couldn't work out a place: "Couldn't
  work out where it goes", with the reason (for example a placement template that
  gives no valid path).

It is a plan, not a promise: the backup works the place out again when it starts.
If the account's placement template changed since the check, the row adds "The
account's placement changed since then: this changes at the next check." (press
[Check now](#check-now) to see the new place). A title with its own destination
says "Your destination is checked when the backup starts." instead. Titles that
can't be backed up (**Unavailable**, **No longer in the library**) show no plan,
and neither does a title marked [Not this book](#not-this-book): the Bridge still
matches it to that book, so it plans nothing for it (its **Back up** places it by
the same rules, or at its destination).

### What happens during a backup

The Bridge:

1. checks the account and that it can write to the account's library, and works
   out where the book goes ([Where backups go](#where-backups-go)), before it
   downloads anything: a file already there, or a book of the library already in
   that folder, stops it here;
2. asks Audible for the book (a license for this account);
3. downloads it into its data folder;
4. removes the copy protection, a lossless copy with the chapters kept;
5. copies it into the library, never over a file that is already there;
6. has the server index it straight away, and gives the new book the title's ASIN,
   so later checks and the community metadata match it exactly.

The backup shows in the Bridge's [Jobs](bridge.md#jobs) list as **Backing up an
Audible book**, with the title's ASIN, the step it is on and how far it has got.
**Scheduled by the server** marks one a policy or a preorder queued. **Cancel**
there stops it, and the partly downloaded file is deleted. When it is done, the
title shows **On this server** with **Backed up here**, and listeners of the
library find the book like any other. A finished or failed backup, and one that
needs attention, is [notified](notifications.md) like the Bridge's other jobs,
named by the book's title.

**One at a time.** The Bridge backs up one book of each account at a time, and it
downloads one thing at a time in all, so backups take turns with new podcast
episodes: a book you asked for with **Back up** comes first, then new episodes and
what a [policy](#backing-up-by-itself) queued, then
[Back up everything](#back-up-everything)'s books. A big library takes a while;
new episodes still arrive in between.

**Interrupted downloads carry on.** A download cut off by a dropped connection
picks up where it stopped. So does one interrupted by the Bridge stopping or
restarting: the part it had is kept for up to 7 days and the backup resumes from it
when the Bridge is back. A cancelled or failed backup deletes it.

### A title's backup status

| Status | Means |
|---|---|
| **Backs up on release** | you pressed **Back up** on a preorder: it is backed up once Audible makes it available |
| **Backup waiting** | queued for the Bridge, or picked up and about to start |
| **Backing up** | the Bridge is working on it |
| **Backup needs attention** | the Bridge stopped part way and is waiting for you, with the reason under the title. Usually the library stopped being writable: the backup carries on by itself once the Bridge can write there again |
| **Backed up** | done |
| **Backup failed** | it didn't work: the reason is under the title (below) |
| **Backup cancelled** | it was cancelled in the Bridge's Jobs list |
| **Still not released: check it on Audible** | a preorder still not available 14 days after its release date (see [Preorders](#preorders)) |

### When a backup fails

The reason under the title says what to do. Nothing in your library is ever
overwritten or left half copied.

| Reason | Means |
|---|---|
| **Audible doesn't let it be downloaded yet.** | the title isn't released yet: a preorder, or Audible says it isn't out |
| **This account doesn't have the right to download it.** | the title is no longer in the account, Audible won't let this account download it, or it is a podcast or periodical |
| **Audible refused the download. Sign in again on the Bridge if it keeps happening.** | Audible refused the account's sign-in or the download, or refused the Bridge's device its downloads (see [below](#sign-in-again-after-updating-the-bridge)). The Bridge's [Accounts tab](../getting-started/bridge-accounts.md#the-accounts-states) then says **Sign in again** on the account, and its other backups fail the same way until you do |
| **The Bridge can't write to this library. Check its mapping on the Bridge.** | the library isn't **Ready** on the Bridge's [Libraries](bridge.md#libraries) tab (mapped and writable), the account's library changed since the backup was queued, or the destination or template gives a path the Bridge can't use there (a hidden folder, an audio file name other than `.m4b`, `.m4a` or `.mp4`, a file where a folder should be) |
| **A different file is already where it would go. Choose another destination.** | a file is already at the destination, or the destination is inside a book the library already has (a folder that is a book, or already holds audio files): a backup is a book of its own. Choose a [destination](#choosing-a-destination), or move that file |
| **There isn't enough free space. Free some up, then back it up again.** | the Bridge needs room for about twice the book in its data folder (the download and the copy without DRM), and a little more than the book in the library |
| **The download link ran out twice. Back it up again.** | Audible's download link expired, and expired again after the Bridge asked for a new one |
| **The Bridge no longer has this account. Sign in again on the Bridge.** | the account was removed on the Bridge, signed in on another Bridge, or set up while the Bridge was paired with another server |

A failure without one of these reasons shows the Bridge's own message in its
[Jobs](bridge.md#jobs) list. One you may see: a book Audible offers only as an MP3
without copy protection, which this version of the Bridge doesn't back up yet.

Press **Back up** again to try once more. [Back up everything](#back-up-everything)
also tries failed and cancelled backups again.

Error messages never include your Amazon account's ids (the customer id, the
device's serial number, your email address): the Bridge removes them from
Audible's answers before they reach its log, its job list or the server.

#### Sign in again after updating the Bridge

Since about September 2026, Audible no longer allows downloads to devices
registered the way earlier versions of the Bridge registered them: the account
still lists its titles, but every backup is refused. The current Bridge registers
a device Audible accepts. So an account signed in **before you updated the
Bridge** shows **Sign in again** on the Bridge's
[Accounts tab](../getting-started/bridge-accounts.md#the-accounts-states), and so
does an account whose device Audible refused during a backup. Press **Sign in
again** there: it registers a new AudioSilo device and removes the old one from
your Amazon account, keeping the account's settings, titles and backups. Then
press **Back up** (or **Back up everything...**) again for the titles that failed.

### Not this book

**Not this book** is for a title the Bridge matched to the wrong book, or one you
never want backed up on its own:

- A title marked **Not this book** is never backed up by
  [Back up everything](#back-up-everything) or a [policy](#backing-up-by-itself).
  **Back up** still works for it, one at a time.
- If it was matched to a book here, that book is no longer counted as this
  title's: the title shows **Not this book** next to the link, counts as **Not here
  yet** in the filter and the account's counts, and **Back up** and
  **Destination...** are offered for it. Later checks keep the mark.
- On a preorder you asked to back up, it drops that request.

**Undo Not this book** removes the mark. A backup of the title that finishes
removes it too: the backed-up book is the title's own. Marking and unmarking are in
the [audit log](server.md#audit-log) as **Changed an Audible book's match or
destination**.

### Choosing a destination

**Destination...** opens **Where ... goes**, for one title not on this server.
Type where in the account's library its backup goes, instead of the usual place
([Where backups go](#where-backups-go)):

- **a file**, such as `Author/Series/Title.m4b` (ending in `.m4b`, `.m4a` or
  `.mp4`), or
- **a folder**, such as `Author/Series/Book 3`, for the book to go in (its file is
  named after the title).

The empty field shows, greyed, where the Bridge
[planned the backup](#where-a-title-would-go) at its last check. That is only a
hint: leave the field empty for the usual place (it follows the account's
placement as it changes), or type your own. It must be a path inside the library: no
`..`, no folder or file starting with a dot (the server never shows those), no
backslashes. A destination wins over the account's placement template. The row
shows it as **To ...**. Your own destination is checked only when the backup
starts, so one that is already taken stops the backup then (**A different file is
already where it would go**). Saving it is in the audit log as **Changed an Audible
book's match or destination**.

![The Destination dialog for one title: a folder in the library typed in](/img/screenshots/admin/audible-destination.png)

The destination, like the account's template, is read when the backup is queued:
changing it later doesn't move a backup that is already waiting.

## Back up everything

**Back up everything...**, on each account's card and at the top of the titles
page, backs up the account's books that aren't on this server yet, all at once. It
first asks you to confirm, with how many books and about how much space they take,
such as **"212 books, ~96 GB"**. The size is an estimate from each book's length;
the library needs about that much free space.

![Back up everything's confirmation: how many books, about how much space, and the legal note](/img/screenshots/admin/audible-backup-all.png)

It backs up every title of the account that is **Available** and not on this
server, **except**:

- titles marked [Not this book](#not-this-book);
- **contested** titles (the book is probably here under another title, see
  [How titles are matched](#how-titles-are-matched));
- titles already backed up, while the backed-up book is still in the library;
- titles with a backup already waiting or running;
- preorders and unavailable titles (a preorder can still be backed up on release,
  see [Preorders](#preorders)).

A backup that failed or was cancelled is tried again. The button is off when there
is nothing to back up and while the account is **Paused**.

**Back up N books** queues them ("212 backups queued for Chris (US)"). They run
[one at a time](#what-happens-during-a-backup), after anything you back up one by
one and after new podcast episodes, so a big library can take days. If the Bridge
can't take them (it doesn't run backups, or can't write to the library), nothing is
queued and the console says why; with the Bridge offline, they wait for it. It is
in the [audit log](server.md#audit-log) as **Backed up everything from an Audible
account**.

## Backing up by itself

**Account settings...** on an account's card sets **Back up by itself**: what the
account backs up without being asked, after each check.

| Choice | Backs up |
|---|---|
| **Every new book** | every book bought from now on |
| **New books in series you have** | a book bought from now on, when a book of one of its series is already on the server for the account's person (in a library they can see) |
| **Only books you choose** | nothing by itself: only what you back up from the console |

**New purchases only.** A policy acts only on titles the Bridge first sees after
you chose it. The books the account already had are never backed up by a policy:
use [Back up everything](#back-up-everything) for those. (For an account you just
added, the books found by its first check count as the ones it already had, even
if you chose a policy when you signed it in on the Bridge.)

After each check, a policy backs up a new purchase that
[Back up everything](#back-up-everything) would, but only one never backed up
before (a policy never tries one again after it failed: **Back up** or Back up
everything does). It needs an online Bridge that can back up; a check
while it can't queues nothing, and the next check asks again.

The choice an account starts with is the one picked when it was signed in on the
Bridge. After that it is set here; the Bridge's Accounts tab says so. Saving the
account's settings is in the [audit log](server.md#audit-log) as **Changed an
Audible account's backups**.

## Where backups go

**Beside the series' other books.** With no template (the card's **Placement**
says **Beside the series' other books**), a backup goes where your library keeps
its series, named like the books already there: the same author folder, the
series' folder and its numbering. For example, with book 6 of Dragon Heart in a
`DH06 - Land of Magic` folder, book 7 goes in a `DH07 - ...` folder beside it. A
book of a series you don't have yet goes in `Author/Series/` with a code made from the series' initials, and a book in no
series in `Author/Title/`. The file is the title, as `Title.m4b`.

**A placement template.** **Account settings... > Placement template** names the
folders and file yourself, for example
`{Author}/{Series}/{ {PaddedSeq} - }{Title}`:

- Variables: `{Author}`, `{Series}`, `{Title}`, `{PaddedSeq}` (the number in the
  series, padded as your folders are), `{Narrator}`, `{Year}` and `{ASIN}`, among
  others.
- `{ ... }` around part of it is dropped when a variable inside is empty: above,
  a book in no series has no number and no ` - `.
- A last part ending in `.m4b`, `.m4a` or `.mp4` names the file. Another audio
  file name (such as `.mp3`) can't be used: the backup is always an M4B. Anything
  else is a folder, and the book's file (named after the title) goes in it.
- It must stay inside the library: not starting with `/`, no `..`, no part starting
  with a dot. A template the server can't read (an unknown variable, a `{` without
  its `}`) isn't saved, and the dialog says why.

Leave it empty for the placement beside the series' other books. A title's own
[destination](#choosing-a-destination) wins over both. Whatever the placement,
folders that already exist are used as the disk spells them, and nothing is ever
overwritten.

## Preorders

Audible doesn't put a preorder in your Audible library until it comes out, so at
each check the Bridge also reads the account's orders and lists every preorder
still waiting there, with its title, authors, series and release date from
Audible's catalogue. A preorder shows from the first check after you order it:
press [Check now](#check-now) to see it sooner. A release date Audible moves is
picked up at the next check.

Once a check has seen a preorder, the Bridge remembers it, and it stays a
**Preorder** until the account's library lists it (then it turns **Available**),
even after the order has dropped out of Audible's order history. It leaves the list
when you cancel the order, or when it still isn't in the library 30 days after its
release date. If the Bridge can't read the orders or the catalogue at a check, the
check still finishes and lists the preorders it remembers, as it last saw them.

:::note[Older preorders]
Audible's order history only goes back about six months. A preorder ordered more
than about six months before the Bridge first checks the account with preorder
support (Bridge releases after 0.6.0) can't be found, so it isn't listed until it
comes out; it then shows as **Available** like any other title. A preorder ordered
later is remembered, however long it waits for release.
:::

A **Preorder** can't be downloaded yet. **Back up** on one remembers it: the title
shows **Backs up on release**, and the request is kept through restarts.
**Destination...** works on a preorder as on any other title, and the row shows
[where it would go](#where-a-title-would-go) once Audible's catalogue has
described it.

From the title's release date, the server checks the account **every hour**
instead of every 6 hours. The first check that finds it **Available** backs it up:
because you asked, or because the account's [policy](#backing-up-by-itself) covers
it as a new purchase.

If it still isn't available 14 days after its release date, the title shows
**Still not released: check it on Audible** and the hourly checks for it stop (the
account's usual checks go on, and back it up if it does turn up). Audible sometimes
moves a release date: check the title in the Audible app or website.

Marking a preorder [Not this book](#not-this-book) drops the request. **Back up**
on a preorder is in the [audit log](server.md#audit-log) as **Asked to back up an
Audible book**.

## Syncing listening places

With sync on, an account's listening places follow you between Audible and
AudioSilo: listen in the Audible app and your place here moves on; listen here and
the Audible app picks up where you stopped. It is **off for every account** until
you turn it on: **Account settings... > Sync listening places with Audible**, then
**Save**. Each account syncs for the person it belongs to, on the books of its
titles that are on this server.

**From Audible to here.** Every 15 minutes (and straight away when you turn sync on
or change which titles sync), the Bridge reads the account's places on Audible and
brings each one here that is **further on** than your place on that book. Your
player then moves to it, or offers it, naming the account: *"On Audible (Chris
(US)) you were at Chapter 12, 4:10. Jump there?"*. A place from Audible **never
moves yours back**: one behind your place here, or from before you finished or
started the book again here, is left alone. Your playback speed here stays as it
is. A place at the end of the book on Audible marks the book **finished** here.

**From here to Audible.** About 3 to 4 minutes after you stop listening here (once
your place has stayed put for 3 minutes), the Bridge sends your place to Audible as
it is, so a place you moved back to here moves back on Audible too. If you listened further on
Audible in the meantime, your place here isn't sent: the place further on wins, and
the next sync brings it here. When sync starts, only places you changed in the last
10 minutes are sent; the others reach Audible the next time you listen to them.

**Only places.** Listening on Audible never shows as listening here: it adds
nothing to your history, your stats or the server's activity. Only the place moves,
under a device named after the account, such as **Audible (Chris (US))**.

A title's place syncs only when the title is **on this server** (matched to a book,
not marked [Not this book](#not-this-book), not **No longer in the library**) and
not marked [Don't sync](#dont-sync-this-book). A title whose length on Audible is
quite different from the book here (more than about 5% plus two minutes: usually
another recording matched by its title) doesn't sync either way, and neither does
a place past the end of the book.

The syncs show in the Bridge's [Jobs](bridge.md#jobs) list as **Syncing places
with Audible**, **Scheduled by the server**. Only the latest finished one of each
account is kept there.

### When it stops

The card's **Sync** row says **Off**, **On, not synced yet**, **On, synced** with
when it last did, or why it has stopped:

- **On, paused with the account**: the account's library was deleted. Choose
  another library for it on the Bridge's Accounts tab.
- **Stopped: Audible refused the account. Sign in again on the Bridge.**: Audible
  refused the Bridge's device. Press **Sign in again** on the Bridge's
  [Accounts tab](../getting-started/bridge-accounts.md#the-accounts-states): syncing
  starts again after it.
- **Off** after you changed who the account belongs to on the Bridge: sync turns
  off then, since you turned it on for someone else. Turn it on again for the new
  person.

When Audible is busy, sync doesn't stop: the Bridge waits as long as Audible asks
(a few minutes) and tries again by itself. When Audible turns the account's sign-in
away (the Bridge's Accounts tab says **Sign in again**), places don't sync until the
next check Audible answers, or until you sign in again; **Check now** tries at
once. If the account's person
is disabled or made a kid account, nothing syncs until you choose someone else for
the account on the Bridge. The Bridge's setup checklist says when an account's
places aren't syncing, and why.

Turning sync off stops a sync that is waiting or running. Saving the switch is in
the [audit log](server.md#audit-log) as **Changed an Audible account's backups**.

### Don't sync this book

**Don't sync** on a title that is on this server keeps that one book out of the
sync, both ways: Audible's place never moves it, and your place on it is never sent
to Audible. The title shows **Not synced**; **Sync again** undoes it. It changes
nothing else: the title stays on this server, and backups don't look at it (use
[Not this book](#not-this-book) for a wrong match). Marking and unmarking it are in
the audit log as **Changed an Audible book's match or destination**, and take
effect straight away.

## Check now

The server asks the Bridge to check each account every 6 hours while the module is
on (every hour while one of its preorders is due, see [Preorders](#preorders)).
**Check now** asks for a check straight away ("Checking Chris (US)"); if a check
is already waiting, it is moved to the front ("Chris (US) is already being
checked"). If the last check is still being cancelled, it says so ("The check of
Chris (US) is still stopping"): press **Check now** again once it has stopped. The
titles update once the Bridge has finished. A paused account can't
be checked: the console says to choose another library on the Bridge's Accounts tab.

Checks are jobs like the Bridge's others: they appear in the Bridge's
[Jobs](bridge.md#jobs) list as **Checking an Audible library**, the scheduled ones
marked **Scheduled by the server**. Only the latest finished check of each account
is kept there. With the Bridge offline, a check waits until it is back. **Check
now** is in the [audit log](server.md#audit-log) as **Queued a Bridge job**.

## Removing an account

The usual way to remove an account is **Remove** on the Bridge's Accounts tab: it
removes it from the Bridge and from this server, cancels its backups that are
waiting or running, and removes its AudioSilo device from your Amazon account (see
[Bridge accounts](../getting-started/bridge-accounts.md#removing-an-account)).

**Remove...** in the console (on the accounts card, or at the top of the titles
page) is for an account the Bridge can no longer remove: one set up by a Bridge you
unpaired or replaced, or one whose removal on the Bridge couldn't reach the server.
With no Bridge paired the accounts card isn't shown, so use the titles page.
Confirm with **Remove**: the account, its titles and any check waiting
for the Bridge go from this server, and its backups that are waiting or running are
cancelled. The books already on your server stay, backed-up ones included. It
removes the account from **this server only**: to sign the device out of Amazon,
remove it on the Bridge's Accounts page too (or in your Amazon account's device
list). It is in the [audit log](server.md#audit-log) as **Removed an Audible
account**.

If the Bridge still has the account, saving it again there (**Change**) sets it up
on the server again.

## When the module is off

Turning the Audible module off hides the Audible page and the accounts card, and
the server stops asking for checks, backs nothing up by itself and syncs no
places; a check, backup or sync already queued waits until the module is on again. The accounts and their
titles are kept, and signing in on the Bridge still works. To remove an account in the console, turn the module on first.
