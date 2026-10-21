---
title: "Podcasts"
description: "Podcast libraries, the Podcasts module and the Bridge: what is available now, private feeds, feed checks, and why released player apps do not show podcasts yet."
---

## What is available now

Podcasts need a [Bridge](bridge.md) and the **Podcasts** module, enabled in
**Server > Settings > Modules**. The Bridge reads feeds, saves show details and
artwork, and checks for changes. The server reads what the Bridge saves.

:::info[Player views arrive later]
Released player apps, including current store builds, **do not show podcasts
yet**, even when you sign in as an admin. Podcast player views arrive in a later
release. **Only the admin console lists podcast libraries for now.** There is
no follow-by-URL screen in the released apps or the console yet; following and
checking feeds are available through the
[developer API](/developers/server/api/reference#podcasts).
:::

This release saves feed details, not episode audio. It does not download new
episodes, offer discovery or OPML import, or display podcast chapters and
transcripts. An episode can be listed before its audio exists on the server.

## Set up a podcast library

1. [Run and pair a Bridge](../getting-started/running-a-bridge.md).
2. In **Library > Libraries**, press **Add library**. Choose **Podcasts** under
   **Kind**, give it a name and a folder, then add it.
3. Mount that same folder read-write in the Bridge. The server can keep its
   read-only mount. Check that the library becomes **Ready** on
   **Server > Settings > Bridge**.
4. Turn on **Podcasts** in **Server > Settings > Modules**. It starts off, and
   pairing a Bridge does not turn it on. Its card needs an online Bridge that
   supports podcasts.

Use a folder of its own. A podcast library's folder cannot be the same as,
inside, or around another library's folder. **Kind** is fixed when you add a
library; you cannot turn an existing books library into a podcast library.

An empty podcast library can become ready: the Bridge writes a small marker
inside it and asks the server to read it back. It does not need a sample book.
See [Checking the libraries](../getting-started/running-a-bridge.md#5-check-the-libraries).
A feed on your own network is blocked unless you
[allow its address range](../getting-started/running-a-bridge.md#feeds-on-your-local-network)
on the Bridge.

The Bridge creates one folder per show, with its feed details and artwork.
Leave those folder names alone: episode addresses include the show folder, so
renaming one by hand breaks the saved paths. Podcasts stay out of book search,
recently added books, author and series lists, and the console's book tools.

## Following and feed checks

Through the API, an adult with access to the whole podcast library can follow
a feed by its URL. Following a visible show already in the library is immediate;
a new feed waits for the Bridge to validate and save it. Each person can have
at most five follow requests open at once. Kids and demo accounts cannot
follow, unfollow or ask for a feed check.

The server schedules checks while at least one person follows a show. The
Bridge checks recent shows more often and quiet shows less often, and respects
the feed's cache instructions. A feed that says it is permanently gone stops
automatic checks. Repeated failures make checks less frequent. Routine checks
are left out of the console's default Bridge job list, and podcast jobs do not
send finished or failed notifications.

Turning the Podcasts module off stops following, unfollowing and checking, and
automatic checks. It leaves the indexed shows and files in place; reading
them through a compatible client does not need the module or an online Bridge.

## Private feeds

A private feed URL is a credential, much like a password. AudioSilo recognises
common private-feed addresses automatically, including URLs with a query or
sign-in details, and the API can mark another feed private explicitly. It cannot
force a recognised private feed to be public.

Only people who follow a private show can see it in a player, admins included.
Someone else must supply the same private URL to follow it; guessing its folder
name does not grant access. A library containing only private shows you do not
follow appears empty. The admin console still lists the library itself.

The Bridge keeps the private feed URL encrypted in its data folder. It is left
out of the saved feed details and listener responses, and job lists show a
shortened address. Keep the Bridge's data and secret key in your backups.

If the server restarts before the Bridge picks up a new private follow request,
that request expires: follow the URL again. If the Bridge loses a private
show's saved credential, follow the URL again to restore it. Unfollowing hides
the private show from you; it does not delete its folder or other people's
follows.
