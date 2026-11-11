---
title: Back up your Audible books
description: "Have your Bridge back up the Audible books you bought into your library, and keep your listening places in step with Audible."
---

Your [Bridge](bridge.md) can sign in to your Audible accounts and list the books
each one owns. It shows which are already on your server, and **backs up** the
rest into your library. It downloads each book, removes its copy protection
(DRM) and puts it beside your other books. The copy is lossless and keeps its
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
   [Server > Settings > Bridge](bridge.md#libraries).
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
and **Remove...**. **View titles** opens the titles page.

![The Account settings dialog](/img/screenshots/admin/audible-backup-settings.png)

You change who an account is for, and its library, on the Bridge's Accounts
tab. You set what it backs up, where, and whether it syncs here, in **Account
settings...**.

An account marked **Paused** lost its library. Choose another library for it on
the Bridge's Accounts tab.

## The titles page

![Server > Settings > Audible: the titles and whether each is on this server](/img/screenshots/admin/audible-titles.png)

**Server > Settings > Audible** lists every title your accounts own or have
preordered. Each row says whether the title is **On this server** (with a link to
the book) or **Not here**, and has its buttons: **Back up**, **Not this book** and
**Destination...**. A title that isn't here yet says where its backup would go.

Use **Search titles**, **Account**, **State** and **On this server** to narrow the
list.

| State | Means |
|---|---|
| **Available** | the account owns it and can download it |
| **Preorder** | not released yet (see [Preorders](#preorders)) |
| **Unavailable** | Audible won't let it be downloaded, such as a podcast; the row says why |
| **No longer in the library** | it was in the account before but isn't now |

## How titles are matched

At each check, the Bridge matches each title to a book in the account's library:

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
- **If it isn't**, press **Back up** to back the title up as a book of its own.

## Backing up a book

1. On the titles page, find a title that is **Not here**.
2. Optionally, press **Destination...** to choose where it goes.
3. Press **Back up**.

The Bridge downloads it, removes the copy protection, copies it into the library
and has the server index it. The title then shows **On this server** with
**Backed up here**.

The backup shows in the Bridge's [Jobs](bridge.md#jobs) list, where **Cancel**
stops it. The Bridge backs up one book at a time. A download cut off part way
picks up where it stopped. The Bridge never overwrites anything in your library.

### When a backup fails

The reason under the title says what to do. Press **Back up** again to retry.

| Reason | What to do |
|---|---|
| **Audible doesn't let it be downloaded yet.** | Wait until it is released. |
| **This account doesn't have the right to download it.** | The title left the account, or Audible doesn't allow it. |
| **Audible refused the download.** | [Sign in again](#sign-in-again-after-updating-the-bridge) on the Bridge. |
| **The Bridge can't write to this library.** | Check the library is **Ready** in [Server > Settings > Bridge](bridge.md#libraries), and that the destination is a normal path. |
| **A different file is already where it would go.** | [Choose another destination](#choosing-a-destination), or move that file. |
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

**Not this book** is for a title the Bridge matched to the wrong book, or one you
never want backed up by itself. The title then counts as not here, and **Back up
everything** and **Back up by itself** skip it. **Back up** still works for it.
**Undo Not this book** removes the mark.

### Choosing a destination

**Destination...** sets where one title's backup goes, instead of the usual place.
Type a path inside the library:

- **a file**, such as `Author/Series/Title.m4b` (`.m4b`, `.m4a` or `.mp4`), or
- **a folder**, such as `Author/Series/Book 3`.

Leave it empty for the usual place. The path can't start with a dot or contain
`..`.

![The Destination dialog for one title](/img/screenshots/admin/audible-destination.png)

## Back up everything

**Back up everything...**, on each account, backs up all the account's
**Available** titles that aren't on this server yet. It first shows how many books
and about how much space, such as **"212 books, ~96 GB"**. Press **Back up N
books** to queue them.

![Back up everything's confirmation](/img/screenshots/admin/audible-backup-all.png)

It skips titles marked **Not this book**, contested titles, preorders and titles
already backed up. It retries failed and cancelled backups. A big library can take
days.

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
series in `Author/Title/`.

To choose yourself, set a **Placement template** in **Account settings...**, for
example:

```
{Author}/{Series}/{ {PaddedSeq} - }{Title}
```

Variables include `{Author}`, `{Series}`, `{Title}`, `{PaddedSeq}` (the series
number), `{Narrator}`, `{Year}` and `{ASIN}`. A part in `{ ... }` is dropped when a
variable inside it is empty. A last part ending in `.m4b` names the file; otherwise
it is a folder. A title's own [destination](#choosing-a-destination) wins over the
template.

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
  back**.
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

Remove an account on the Bridge's Accounts tab (see
[Bridge accounts](../getting-started/bridge-accounts.md#removing-an-account)). That
removes it everywhere, including from your Amazon device list.

**Remove...** in the console is for an account the Bridge can no longer remove,
such as one from a Bridge you replaced. It removes the account from **this server
only**, so also remove the device in your Amazon account. Books already on your
server stay.

## Good to know

- Turning the Audible module off stops checks, backups and syncing. Accounts and
  titles are kept. Turn it back on to remove an account in the console.
- Error messages never include your Amazon account's details.
