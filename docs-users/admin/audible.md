---
title: Audible
description: "See the books in the Audible accounts your Bridge signs in to and which of them are already on your server: the Audible module, the Audible accounts card on Settings > Bridge, the titles page with its filters, the title states, how titles are matched to your books, Check now, removing an account, and what isn't there yet."
---

Your [Bridge](bridge.md) can sign in to your Audible accounts, list the books each
one owns and find the ones already on your server. The console shows the result:
which of your Audible books you have here, and which you don't yet.

:::info[What it does today]
This first version **lists and matches**. It doesn't download anything, and it
doesn't keep listening places in step with Audible. Backing up the books you bought
into your library, and keeping places in step, are coming in later versions. The
**Back up** choice you make for each account is kept for then.
:::

:::note[A personal backup of books you bought]
Audible backups are for making **a personal backup of books you bought**, with your
own account. Laws on removing DRM, even from your own purchases, differ from
country to country, and in some places it is not allowed at all. Check your local
law, and keep the copies for yourself.
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

While the module is on, **Server > Settings** gains an **Audible** page, and
**Settings > Bridge** an **Audible accounts** card. Listeners see nothing of it:
the player has no Audible screens.

## The Audible accounts card

![The Audible accounts card on Server > Settings > Bridge](/img/screenshots/admin/audible-accounts-card.png)

On **Server > Settings > Bridge**, under Libraries, the **Audible accounts** card
lists every account the Bridge has signed in to, as the Bridge set it up. The card
is there only while a Bridge is paired; with none paired, use the
[titles page](#the-titles-page). It is read-only: you change an account on the
Bridge's Accounts tab (with no account yet, the card links to it when the Bridge
has told the server its page's address). **View titles** opens the
[titles page](#the-titles-page).

For each account:

| Row | What it shows |
|---|---|
| The heading | the account's name (the person and the store, such as "Chris (US)", unless the Bridge gave it another), and **Checked** with when the Bridge last finished checking it, or **Not checked yet** |
| **For** | the person on your server the account belongs to |
| **Library** | the books library its titles are matched against |
| **Store** | the Audible store it buys from (US, UK, DE and so on) |
| **Back up** | what a later version will back up: **Every new book**, **New books in series you have** or **Only books you choose** |
| **Titles** | how many titles the account has, and how many of them are on this server |

Each account has **Check now** and **Remove...** (below).

With no account yet, the card says **No Audible accounts yet**, with **Open the
Bridge's Accounts tab**.

**Paused** marks an account whose library was deleted: the Bridge isn't asked to
check it, and its titles lose their matches. Choose another library for it on the
Bridge's Accounts tab (**Change**) to carry on.

## The titles page

![Server > Settings > Audible: the titles of the signed-in accounts, with their states and whether each is on this server](/img/screenshots/admin/audible-titles.png)

**Server > Settings > Audible** lists every title your Audible accounts own, as the
Bridge last saw them, sorted by title. Each row shows the title, its authors and
series, then its length, the release date of a preorder, its ASIN and (with several
accounts) which account owns it. A title Audible won't let you download says why.
On the right: its state, and **On this server** (a link to the book's page in the
console) or **Not here**. **Matched by title** marks a match made from the title
and author rather than the ASIN (see [How titles are matched](#how-titles-are-matched)).

Above the list:

- **Search titles** finds a title by its name, one of its authors, or its exact
  ASIN.
- **Account** (only with more than one account) shows one account's titles.
- **State** shows titles in one state.
- **On this server** shows only the titles that are here, or only those that are
  **Not here yet**.

The page shows 50 titles at a time; **Load more** adds the next ones. The list
refreshes on its own when the Bridge finishes a check.

**Check now** and **Remove...** sit at the top of the page for the account you
chose under **Account**, or for the only one there is.

### Title states

| State | Means |
|---|---|
| **Available** | the account owns it and can download it |
| **Preorder** | not released yet; the row says when it is |
| **Unavailable** | the account has it but Audible won't let it be downloaded (for example a podcast or a periodical, or a title without download rights); the row says why |
| **No longer in the library** | it was in the account before, but the Bridge's last complete check didn't find it (returned, or removed from the account) |

## How titles are matched

At each check, the Bridge reads the account's library from Audible and your books
library from the server, and matches each title to a book there:

1. **By ASIN first.** A book whose ASIN (in its tags, or set in the console) is the
   title's matches at once.
2. **Then by title and author**, with the series, the book's number in it and the
   narrators to help. These show **Matched by title**.

A title that matched a book shows **On this server**; one that didn't shows **Not
here**. A few things help a title find its book:

- **The same title by the same author** matches, even when Audible files the book
  under a differently named series than your tags do. A title that is just the
  series name and a number ("Dragon Heart: Book 6") needs the number to agree.
- **The book's number in the series** tells the volumes of a series apart. When
  your tags don't give it, a code at the start of the book's folder name does:
  `DH06 - Land of Magic` is book 6 of Dragon Heart, `BDM01 - Oathbound Healer` book
  1 of Beneath the Dragoneye Moons. The code's letters must be the series' initials
  (all of them or some, in order), so a code that is something else, like `HALO
  07` in a Halo folder, is ignored. This doesn't change the book's position
  anywhere else on your server.
- **A folder covering several books**, like `LAM05-06`, is read as an omnibus,
  not as book 5, so Audible's book 5 on its own isn't matched to it.

**When several titles land on one book**, only the clearly best match keeps it;
the others show as **Not here**, with **contested** under the title (the book is
probably here under the other title). When no title is clearly best, none keeps
it. The exception is the same book owned twice (two editions with the same title,
author and number): both keep it.

**Release dates.** Audible sometimes gives a title it has had for years a
placeholder release date far in the future (such as the year 2200). A date over
two years ahead is ignored, so such a title is **Available**, not a **Preorder**.

When a book matched by title and author has no ASIN yet, the Bridge gives it the
Audible title's ASIN, so later checks, and the community metadata, match it exactly.
It doesn't when two Audible titles match the same book (it can't tell which is
right), when the title is a preorder (the book you have is another edition), or
when the book already has an ASIN, including one you set or cleared in the console:
those are never replaced.

Matches follow your books: when a book is renamed or moved (or joined with another
in the console), its titles stay matched to it. Deleting a library clears the
matches into it and pauses the accounts mapped to it.

## Check now

The server asks the Bridge to check each account every 6 hours while the module is
on. **Check now** asks for a check straight away ("Checking Chris (US)"); if a check
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
removes it from the Bridge and from this server, and removes its AudioSilo device
from your Amazon account (see
[Bridge accounts](../getting-started/bridge-accounts.md#removing-an-account)).

**Remove...** in the console (on the accounts card, or at the top of the titles
page) is for an account the Bridge can no longer remove: one set up by a Bridge you
unpaired or replaced, or one whose removal on the Bridge couldn't reach the server.
With no Bridge paired the accounts card isn't shown, so use the titles page.
Confirm with **Remove**: the account, its titles and any check waiting
for the Bridge go from this server. The books already on your server stay. It
removes the account from **this server only**: to sign the device out of Amazon,
remove it on the Bridge's Accounts page too (or in your Amazon account's device
list). It is in the [audit log](server.md#audit-log) as **Removed an Audible
account**.

If the Bridge still has the account, saving it again there (**Change**) sets it up
on the server again.

## When the module is off

Turning the Audible module off hides the Audible page and the accounts card, and
the server stops asking for checks; a check already queued waits until the module
is on again. The accounts and their titles are kept, and signing in on the Bridge
still works. To remove an account in the console, turn the module on first.
