---
title: "Import your Audiobookshelf history"
description: "Moving from Audiobookshelf? Copy each person's listening history, progress and bookmarks into AudioSilo, bring its ASINs and ISBNs for matching, check it, and undo it if needed."
---

Moving from Audiobookshelf? **Server > Settings > Import** in the
[admin console](console-tour.md) copies each person's listening history over,
so their stats, streaks and progress carry on instead of starting at zero.
It also brings Audiobookshelf's ASIN and ISBN for your books, so they can be
matched to community metadata. The setup flow runs the same import in its
[Coming from Audiobookshelf step](../getting-started/first-run.md#step-6-coming-from-audiobookshelf).

You need to be an admin. AudioSilo only reads from Audiobookshelf and changes
nothing there. You check each import before anything is written, and you can
undo it.

![Server > Settings > Import, step 1: Connect to Audiobookshelf](/img/screenshots/admin/settings-import.png)

## What comes over

- **Listening sessions** on books, with their real dates and times.
- **How far they got in each book**, and when they started and finished it.
  Progress only ever moves forward: an import never rewinds a book.
- **Bookmarks**, skipping ones they already have here.
- **Audiobookshelf's ASIN and ISBN** for each book it has them for, as match
  hints. See [Match your books after an import](#match-your-books-after-an-import).

What doesn't come over: podcasts, collections and playlists, accounts and
passwords, and books that aren't in your AudioSilo libraries.

## Before you start

- **Everyone needs an AudioSilo account.** [Invite them](users-and-invites.md#inviting-someone)
  first. Matching usernames are paired up for you.
- **Your books need to be in an AudioSilo library.** Matching works best when
  both servers read the same folders.
- **An API token from Audiobookshelf.** In Audiobookshelf, open **Settings >
  Users**, choose your account and copy its API token. An admin or root
  account's token lets you import everyone at once. A regular user's token
  imports only that user.
- **The Audiobookshelf address, as the AudioSilo server sees it.** The server
  fetches the history itself, so the address must work from the machine
  AudioSilo runs on. If both run in the same Docker Compose project, use the
  service name, for example `http://audiobookshelf`. Use the plain `http://`
  address on your network if Audiobookshelf's `https://` one has a self-signed
  certificate (see [When a fetch fails](#when-a-fetch-fails)).
- **A finished scan.** The import pairs Audiobookshelf's books with the books
  AudioSilo has found, so let a new library's first scan finish.

## Import the history

1. Open **Server > Settings > Import**.
2. Enter the **Audiobookshelf address** and **API token**, and press
   **Connect**.
3. For each Audiobookshelf account, pick the AudioSilo person under **Import
   into**, or **Don't import**.
4. Under **Which listening to import**, keep **Before each person started using
   AudioSilo (recommended)**. This skips anything they also listened to here, so
   nothing is counted twice.
5. Press **Fetch history for 1 person** (or *n* people). Nothing is written yet. A long history can take a
   minute, and you can leave the page.
6. Under **Imports to review**, check each person's figures: hours, sessions,
   books matched, books not matched, and books given an **ASIN or ISBN for
   matching**.
7. Press **Apply for *person*** and confirm. The import then moves to **Past
   imports**.

**Discard** drops an import you don't want. Nothing was written, so you can
fetch it again.

The other choices in step 4 are **Everything** and **Before a date**. You can
also press **Change** during review to pick another cutoff and recount.

## Books that didn't match

The import matches books by their folder path first, then by ASIN or ISBN,
then by title and author. The review lists each skipped book with the reason:

| Reason | What to do |
|---|---|
| Not found in your libraries | Add the book to a library, or check its title and author. |
| Two Audiobookshelf books matched the same book here | Remove the duplicate in Audiobookshelf. |
| The person can't listen to it here | [Give them access](sharing.md). |
| Its discs are separate books here | Use **Join into one book** in [Library health](health.md#the-kinds-of-issue) and let the library rescan. |

Then import that person again. A new import replaces the previous one, so
nothing is counted twice.

## Match your books after an import

An import doesn't match your books. It brings Audiobookshelf's ASIN and ISBN for
every book Audiobookshelf has them for, whoever listened to it. A match run then
looks them up in the community database.

- The server pairs these books with yours by folder path, then by title and
  author.
- It leaves out a book two Audiobookshelf books pair with, and a book that is
  already matched here.
- The identifiers are **match hints**. They never become the book's ASIN or
  ISBN and never show in the apps.
- A match looks Audiobookshelf's identifiers up ahead of any in the book's
  tags.

So nothing shows until a match run applies. Once an import is applied, **Past
imports** says how many books are not matched, with a **Match automatically**
button. It opens the unmatched books in Library health, where you start the run,
review what it found and apply it. See
[Matching every book at once](health.md#matching-every-book-at-once).

An import with no listening for its person still brings the identifiers, and
you can apply it for those alone. It can't replace an import already applied
for that person, because applying it would undo their history and add none.
**Apply** stays off and the review says so. Undo the applied one first if you
want to replace it.

## Undoing an import

**Past imports** lists every import. **Undo** removes the sessions and
bookmarks it added and puts the person's progress back. Anything the person
changed since, such as listening further, is kept.

Undo also removes the match hints that import brought. Each book keeps the hint
of the import applied last, so undoing the latest import removes its hints even
where an earlier import carried the same ones. Matches you already applied stay.

A person's **Listening** tab also lists their imports, with **Undo**. See
[A person's page](users-and-invites.md#listening).

## Where imported listening shows

Imported sessions count like any other listening, on the days they happened:
in the person's stats, the book's history and their
[Journal](../listening/journal.md), and in [Activity](activity.md). In
Activity > Sessions, they show "Imported from Audiobookshelf".

## When a fetch fails

**Connect** checks the address and token first and says what's wrong under the
field. If it says Audiobookshelf's certificate isn't trusted, its `https://`
address uses a certificate the AudioSilo server doesn't trust, usually a
self-signed one. Use its plain `http://` address on your network instead, for
example `http://192.168.1.20:13378`.

For a fetch that fails later, the import card says why. Check that Audiobookshelf is running, that its
address works from the AudioSilo server, and that the token is right (use an
admin or root account's token to import other people). Then **Discard** it and
start again. Nothing was written.

## Good to know

- **The token is never stored.** The server holds it in memory only while it
  fetches the history. If the server restarts mid-fetch, start again.
- Sessions older than [**Days to keep sessions**](server.md#general) go straight
  into daily totals.
- Where Audiobookshelf's progress goes further than its sessions explain, the
  import adds an estimate to the totals.
- With [Audible sync](audible.md#syncing-listening-places) on, places set by an
  import or an undo are sent to Audible too.
- Each person can have only one import being fetched or applied at a time.
