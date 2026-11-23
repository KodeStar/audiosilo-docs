---
title: Back up your Audible books
description: "Have your Bridge back up the Audible books you bought into your library, and keep your listening places in step with Audible."
---

Your [Bridge](bridge.md) finds the Audible books already on your server and backs
up the titles you choose. You can also turn on
[automatic backups for new purchases](#backing-up-by-itself). Each backup
removes the book's copy protection (DRM) and is a lossless copy that keeps its
chapters.

It can also keep each account's **listening places** in step with Audible, both
ways. You need to be an admin and have a Bridge.

:::note[A personal backup of books you bought]
Audible backups are for **a personal backup of books you bought**, with your own
account. Laws on removing copy protection, even from your own purchases, differ from country to
country, and in some places it is not allowed at all. Check your local law, and
keep the copies for yourself.
:::

## Set it up

1. [Add a Bridge](../getting-started/running-a-bridge.md) and pair it with your
   server.
2. Turn on the **Audible** module in [Server > Settings > Modules](server.md#modules).
   It starts off.
3. On the Bridge's **Accounts** tab, sign in to Audible and choose who the account
   is for and which library it goes with (see
   [Bridge accounts](../getting-started/bridge-accounts.md#audible)).
4. Check that the library shows **Ready** in
   [Server > Settings > Bridge](bridge.md#libraries). An empty library can be
   **Ready** too.
5. Wait for the first check, or press [Check now](#check-now).
6. Open **Server > Settings > Audible** and press **Back up** on a title, or
   [Back up everything](#back-up-everything) on the account.

Make sure there is room for the books, both in the Bridge's data folder (where it
downloads) and in the library.

The player has no Audible screens. A backed-up book is an ordinary book of the
library.

## The Audible accounts card

![The Audible accounts card on Server > Settings > Bridge](/img/screenshots/admin/audible-accounts-card.png)

On **Server > Settings > Bridge**, the **Audible accounts** card lists each
account. It shows who the account is for, its library and store, what it backs up
by itself and where, whether places sync, and how many of its titles are on this
server.

Each account has **Check now**, **Account settings...**, **Back up everything...**
and **Remove...**. **View titles** opens the titles page. While no Bridge is
paired, the card still lists the accounts this server keeps, with **Remove...**.

![The Account settings dialog](/img/screenshots/admin/audible-backup-settings.png)

Use **Account settings...** to choose what the account backs up, where, and
whether it syncs here. To change the person or library, use **Change** on the
Bridge's **Accounts** tab.

When you choose a different library, AudioSilo checks the account's template and
the saved destinations of its titles that aren't on this server, or that you
marked **Not this book**. If one puts a backup in a
[disc folder that would join another book](#choosing-a-destination), choose a
separate folder for it, then change the library again.

An account marked **Paused** lost its library. Choose another library for it on
the Bridge's Accounts tab.

An account marked **Refused: sign in again on the Bridge** was turned away by
Audible at its last check. Press **Sign in again** on the account on the
Bridge's [Accounts tab](../getting-started/bridge-accounts.md#the-accounts-states).

## The titles page

![Audible titles showing an invalid destination for A Small Hour in Varrow, an unmatched backup for Echo of the Drowned Choir and a successful backup for Orchard Cycle 4: The Silver Wood](/img/screenshots/admin/audible-titles.png)

Choose **Destination...** on *A Small Hour in Varrow* to set a new place for its backup.
For *Echo of the Drowned Choir*, the server couldn't confirm that the book at the destination belongs to this title
(see [When the server can't match a finished backup](#when-the-server-cant-match-a-finished-backup)).

**Server > Settings > Audible** lists every title your accounts own or have
preordered. Each row says whether the title is **On this server** (with a link to
the book) or **Not here**, and has its buttons: **Back up**, **Not this book** and
**Destination...**. A title that isn't here yet says where its backup would go.
It warns when that is a new author folder, a new folder or the first book of a
series here. Check the spelling matches your other books, or choose a
[destination](#choosing-a-destination).

Use **Search titles**, **Account**, **State** and **On this server** to narrow the
list. **On this server** > **Needs a look** lists the titles not here whose
backup would go to a place with a warning.

| State | Means |
|---|---|
| **Available** | the account owns it and can download it |
| **Preorder** | not released yet (see [Preorders](#preorders)) |
| **Unavailable** | Audible won't let it be downloaded, such as a podcast; the row says why |
| **No longer in the library** | it was in the account before but isn't now |

## How titles are matched

At each check, the Bridge matches each title to a book in the account's library,
except a title marked [**Not this book**](#not-this-book):

1. **By ASIN first**, when the book has one (from a community match, a
   `metadata.json` file, or set in the console).
2. **Then by title and author**, with the series and number to help. These show
   **Matched by title**.

When a book matched by title has no ASIN yet, the Bridge gives it the title's
ASIN, so later checks match it exactly.

### Contested titles

When several titles match the same book, only one keeps it. A title that lost but
may still be that book is **contested**: it shows **Not here** and says which book
it matched. **Back up everything** and **Back up by itself** skip it. Then:

- **If the book is this title**, give the book this title's ASIN
  ([Editing details](books.md#editing-details) > **ASIN**) and press
  [Check now](#check-now).
- **If it isn't**, mark the title [**Not this book**](#not-this-book). At the next
  check, the other title can match the book.

## Backing up a book

1. On the titles page, find a title that is **Not here**.
2. Optionally, press **Destination...** to choose where it goes.
3. Press **Back up**.

The Bridge downloads the book, removes its copy protection and saves it in your
library. Once the server matches the saved book to the title, the title shows
**On this server** with **Backed up here**.

The Bridge backs up one book at a time. A download cut off part way
picks up where it stopped. Once the copy protection is removed, the Bridge keeps
that copy, so a restart, or a retry after a failed backup, doesn't download
the book again. The Bridge never overwrites anything in your library.

To stop a backup, choose **Cancel** in the Bridge's [Jobs](bridge.md#jobs) list.
This removes the temporary copy. A failed backup keeps its copy in the Bridge's
data folder until you back the title up again. When it starts, the Bridge also
clears away copies left over for seven days or more.

### When the server can't match a finished backup

The Bridge can finish saving the files even if the server can't match them
to the Audible title. The message under the title explains why.

- The server couldn't use the backup details to match this title to a book in its library.
- The server couldn't find the backed-up book in the library index.
- The server couldn't confirm that the book at the backup destination belongs to this title.
- The backup went into the book marked “Not this book” for this title, so the server didn't match it.

The message clears when you back the title up again, when a backup or a check
matches the title to a book, or when you delete the library the backup went
into. If you marked the right book by mistake, **Undo Not this book** accepts
that match and clears the message. A check that finds the same match, or moving
the matched book, keeps it.

### When a backup fails

The reason under the title says what to do. After fixing the problem, press
**Back up** again.

| Reason | What to do |
|---|---|
| **Audible doesn't let it be downloaded yet.** | Wait until it is released. |
| **This account doesn't have the right to download it.** | The title left the account, or Audible doesn't allow it. |
| **Audible refused the download.** | [Sign in again](#sign-in-again-after-updating-the-bridge) on the Bridge. |
| **The Bridge can't write to this library.** | Check the library is **Ready** in [Server > Settings > Bridge](bridge.md#libraries), and that the destination is a normal path. |
| **A different file is already where it would go.** The reason can also name an existing book or audio in the destination folder. | [Choose another destination](#choosing-a-destination), or move that file. |
| **There isn't enough free space.** | The Bridge needs about twice the book's size in its data folder, and the book's size in the library. |
| **The download link ran out twice.** | Back it up again. |
| **The Bridge no longer has this account.** | Sign in again on the Bridge. |
| **Audible offers this title only as a DRM-free MP3** | Nothing to do for now. The Bridge can't back these up yet. |

#### Sign in again after updating the Bridge

Audible no longer lets accounts signed in by older Bridge versions download. Such
an account still lists its titles, but every backup fails, and the Bridge's
[Accounts tab](../getting-started/bridge-accounts.md#the-accounts-states) says
**Sign in again**.

1. Press **Sign in again** on the account on the Bridge's Accounts tab. The
   account's settings, titles and backups are kept.
2. Press **Back up** (or **Back up everything...**) again for the titles that
   failed.

### Not this book

Press **Not this book** when the Bridge matched a title to the wrong book, or to
keep a title out of **Back up everything** and **Back up by itself**. The title
then shows **Not here**. At the next check it stops competing for the book, and
the Bridge plans where its own backup would go. If that is the wrong book's
folder, the console asks you to choose another with **Destination...**. **Back
up** saves the title as a separate book.

If the match was right after all, **Undo Not this book** restores it and hides
the backup plan. The title stays **On this server**, even if a check was running
when you pressed Undo.

### Choosing a destination

**Destination...** sets where one title's backup goes, instead of the usual place.
Type a path inside the library:

- **a file**, such as `Author/Series/Title.m4b` (`.m4b`, `.m4a` or `.mp4`), or
- **a folder**, such as `Author/Series/Book 3`.

Leave it empty to use the account's usual place. The path can't start with a
dot or contain `..`. A title whose saved destination is no longer valid appears
in **Needs a look**.

A disc folder such as `Author/Book/CD 3`, or a file inside it, is refused when
the scan would join it into `Author/Book`:

- `Author/Book` is already a book in the library, or
- `Author/Book` is set to **Always one book** in
  [folder detection](libraries.md#folder-detection).

Choose a separate folder for the backup instead, such as `Author/New Title`.
A lone `CD1` listed as its own book doesn't make `Author/Book` a book, so a
backup into `CD2` beside it is allowed. `CD2` becomes a separate book, and `CD1`
keeps its details.

Clearing a destination is refused in the same way while the account's template
names such a disc folder.

A backup that is waiting, running or needs attention keeps the destination it
was queued with, even if you edit it here. So **Always one book** on
`Author/Book` is refused until no destination or template points at a disc there
and that backup has ended. **Cancel** in
[**Server > Settings > Bridge > Jobs**](bridge.md#jobs) ends a waiting backup at
once. A running one ends when the Bridge stops it.

![The Destination dialog for one title](/img/screenshots/admin/audible-destination.png)

## Back up everything

Choose **Back up everything...** on an account to back up **Available** titles
that aren't on this server yet. Check the book count and estimated size, then
press **Back up N books** to queue them.

![Back up everything's confirmation](/img/screenshots/admin/audible-backup-all.png)

The confirmation offers to back up 16 books, using about 5.3 GB. It leaves out
the title whose saved destination is no longer valid.

It skips titles marked **Not this book**, contested titles, preorders and titles
already backed up. It retries failed and cancelled backups. A big library can take
days.

If a saved destination is no longer valid, the notice after queuing tells you
how many titles were skipped. An invalid account template needs fixing before
the batch can start.

![Backup confirmation showing one title skipped because its destination is no longer valid](/img/screenshots/admin/audible-backup-all-skipped.png)

The server queued all 16 backups and skipped one other title. Use
**Destination...** to choose where to save that title, then try again.

## Backing up by itself

**Account settings... > Back up by itself** sets what the account backs up after
each check, without being asked:

| Choice | Backs up |
|---|---|
| **Every new book** | every book bought from now on |
| **New books in series you have** | a new book in a series already on the server for the account's person |
| **Only books you choose** | nothing by itself |

**Back up by itself** only covers **new purchases**, made after you chose it. For the books the
account already had, use [Back up everything](#back-up-everything).

## Where backups go

By default, a backup goes **beside the series' other books**, named like the books
already there. A book of a new series goes in `Author/Series/`, and a book in no
series in `Author/Title/`. When a check finds several titles of a new series, the
Bridge places them together. A title with nothing usable in its name gets its
Audible identifier as the folder name.

To choose yourself, set a **Placement template** in **Account settings...**, for
example:

```
{Author}/{Series}/{ {PaddedSeq} - }{Title}
```

The template can use up to 500 bytes. Variables include `{Author}`, `{Series}`,
`{Title}`, `{PaddedSeq}` (the series number), `{Narrator}`, `{Year}` and `{ASIN}`.
A part in `{ ... }` is dropped when a
variable inside it is empty. A last part ending in `.m4b` names the file; otherwise
it is a folder. A title's own [destination](#choosing-a-destination) wins over the
template.

A template that names a disc folder, such as `Author/Book/CD 3/{Title}.m4b`,
gets the same [disc folder check](#choosing-a-destination).

The Bridge keeps folder and file names safe for a network share (SMB) or a Windows
disk. It drops `?`, `*`, `<` and `>`, turns `"` into `'` and `|` into `-`. So
*Who Moved My Cheese?* is backed up as `Who Moved My Cheese`. A name Windows
reserves, such as `CON` or `NUL`, gets an underscore added. A book the Bridge
backed up earlier into a folder under its old name, with the `?`, is found there
and isn't downloaded again.

## Preorders

Preorders are listed with their release date. **Back up** on a preorder backs it
up once Audible releases it. Until then the title shows **Backs up on release**.
**Back up by itself** also covers a preorder once it comes out.

From the release date, the server checks the account every hour. If the title
still isn't out 14 days later, it shows **Still not released: check it on
Audible**.

Audible only keeps about six months of orders, so a preorder made earlier than that
may not be listed until it comes out.

## Syncing listening places

With sync on, Audible and AudioSilo keep the same listening place. When you
listen in the Audible app, your place here moves on, and the other way round.

To turn it on, open **Account settings...** on the account, turn on **Sync
listening places with Audible**, then press **Save**. It is off for every account
until you do. It syncs for the person the account belongs to, on the books that
are on this server.

- **From Audible to here**, every 15 minutes. A place further on than yours moves
  your player on, or it offers the jump. A place from Audible **never moves yours
  back**. After you choose **Stay** on a jump offer, a place or finish heard in
  Audible before then doesn't move you either.
- **From here to Audible**, a few minutes after you stop listening.

Only the place syncs. Listening on Audible adds nothing to your history or stats.
A title doesn't sync when its length on Audible and the book's length here
differ by more than 5% of the longer one, plus 2 minutes. A preorder starts syncing once it is released.

Sometimes the Audible app uploads an older place it still held over the one the
Bridge wrote. The next sync writes your place to Audible again, once. If you then
go back in the Audible app on purpose, that place is left alone.

### When it stops

The account card's **Sync** row says whether sync is on and when it last ran, or
why it stopped:

- **Paused with the account**: the account's library was deleted. Choose another
  library on the Bridge's Accounts tab.
- **Stopped: Audible refused the account**: press **Sign in again** on the
  Bridge's [Accounts tab](../getting-started/bridge-accounts.md#the-accounts-states).
- **Off** after you changed who the account belongs to: turn it on again for the
  new person.

### Don't sync this book

**Don't sync** on a title keeps that one book out of the sync, both ways. The
title shows **Not synced**; **Sync again** undoes it.

## Check now

The server has the Bridge check each account every 6 hours while the module is
on. **Check now**, on the account or the titles page, checks it straight away. The
titles update once the check finishes.

## Removing an account

Remove the account on the Bridge's **Accounts** tab (see
[Bridge accounts](../getting-started/bridge-accounts.md#removing-an-account)). That
removes it from the Bridge, this server and your Amazon device list, and says
what to do if one of them can't be reached.

**Remove...** in the console is for an account the Bridge can no longer remove,
such as one from a Bridge you replaced. It removes the account from **this server
only**. If the device is still listed on Amazon, remove it there too. Any check, backup or
sync that hasn't finished is cancelled. Books already on your server stay. If
your Bridge still has the account, its checks fail until you map it again on the
Bridge.

## Good to know

- Turning the Audible module off stops checks, backups and syncing. Accounts and
  titles are kept. While it is off, the Audible card in
  [Server > Settings > Modules](server.md#modules) lists the kept accounts, each
  with **Remove...**.
- Error messages never include your Amazon account's details.
