---
title: "Import your Audiobookshelf history"
description: "Moving from Audiobookshelf? Copy each person's listening history, progress and bookmarks into AudioSilo, check it, and undo it if needed."
---

Moving from Audiobookshelf? **Server > Settings > Import** in the
[admin console](console-tour.md) copies each person's listening history over,
so their stats, streaks and progress carry on instead of starting at zero.

You need to be an admin. AudioSilo only reads from Audiobookshelf and changes
nothing there. You check each import before anything is written, and you can
undo it.

![Server > Settings > Import, step 1: Connect to Audiobookshelf](/img/screenshots/admin/settings-import.png)

## What comes over

- **Listening sessions** on books, with their real dates and times.
- **How far they got in each book**, and when they started and finished it.
  Progress only ever moves forward: an import never rewinds a book.
- **Bookmarks**, skipping ones they already have here.

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
  service name, for example `http://audiobookshelf`.

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
   books matched and books not matched.
7. Press **Apply for *person*** and confirm.

**Discard** drops an import you don't want. Nothing was written, so you can
fetch it again.

The other choices in step 4 are **Everything** and **Before a date**. You can
also press **Change** during review to pick another cutoff and recount.

## Books that didn't match

Books are matched by their folder path first, then by ASIN or ISBN, then by
title and author. The review lists each skipped book with the reason:

| Reason | What to do |
|---|---|
| Not found in your libraries | Add the book to a library, or check its title and author. |
| Two Audiobookshelf books matched the same book here | Remove the duplicate in Audiobookshelf. |
| The person can't listen to it here | [Give them access](sharing.md). |
| Its discs are separate books here | Use **Join into one book** in [Library health](health.md#the-kinds-of-issue) and let the library rescan. |

Then import that person again. A new import replaces the previous one, so
nothing is counted twice.

## Undoing an import

**Past imports** lists every import. **Undo** removes the sessions and
bookmarks it added and puts the person's progress back. Anything the person
changed since, such as listening further, is kept.

A person's **Listening** tab also lists their imports, with **Undo**. See
[A person's page](users-and-invites.md#listening).

## Where imported listening shows

Imported sessions count like any other listening, on the days they happened:
in the person's stats, the book's history and their
[Journal](../listening/journal.md), and in [Activity](activity.md). In
Activity > Sessions, they show "Imported from Audiobookshelf".

## When a fetch fails

The import card says why. Check that Audiobookshelf is running, that its
address works from the AudioSilo server, and that the token is right (use an
admin or root account's token to import other people). Then **Discard** it and
start again. Nothing was written.

## Good to know

- **The token is never stored.** It is held in memory only while the history
  is fetched. If the server restarts mid-fetch, start again.
- Sessions older than [**Days to keep sessions**](server.md#general) go straight
  into daily totals.
- Where Audiobookshelf's progress goes further than its sessions explain, an
  estimate is added to the totals.
- With [Audible sync](audible.md#syncing-listening-places) on, places set by an
  import or an undo are sent to Audible too.
- Each person can have only one import being fetched or applied at a time.
