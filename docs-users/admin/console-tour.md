---
title: "Admin console tour"
description: "Where to find the AudioSilo admin console, how to sign in, how it is laid out, what the overview and the search palette show, and where activity, library health, scans, server settings, updates and logs live."
---

Every AudioSilo server ships with a built-in admin console. It is a web page
served by the server itself - nothing extra to install - and it is where you
manage libraries, books and their details, people, invites, shares and
devices, see what everyone is listening to, keep an eye on library health
and scans, and look after the server itself: its settings, updates and logs.

## Opening the console

The console lives at `/admin` on your server. If your server runs at
`https://audiobooks.example.com`, open:

```
https://audiobooks.example.com/admin
```

The connect page (the server's plain address, `/`) also reveals an **Admin
section** link once you've successfully redeemed an auth code there; if you
just want the console, go straight to `/admin`.

## Signing in

![The admin sign-in screen](/img/screenshots/admin/login.png)

Sign in on the **Admin sign in** card with an **administrator account** - the
username and password created when you first set up the server (see
[First run](../getting-started/first-run.md) if you haven't done that yet, or
don't have the credentials to hand).

A few things worth knowing:

- Only admin accounts can use the console. Signing in with a regular listener
  account shows "This account is not an administrator." and leaves no session
  behind.
- Admin accounts always have a password. Regular listeners often don't - they
  pair their devices with [invites](users-and-invites.md) instead - which is
  why the console sign-in is username and password only.
- The **Language** selector under the sign-in card (and in the account menu
  once signed in) switches the console's language: English, Español,
  Français, Deutsch, Português or Italiano.
- If your session ends, the console asks you to sign in again ("Your session
  ended. Sign in again to continue.") and then opens the page you were on.
- If another admin makes your account a regular member while you are signed
  in, the console signs you out with "This account is not an administrator."
- **Back to connect** returns to the connect page.

:::tip
The console is installable as an app. If you open it over HTTPS (or on
`localhost`), your browser offers to install it - handy for keeping server
admin one tap away on a phone or in the dock.
:::

## The layout

![The console's overview](/img/screenshots/admin/overview.png)

Along the top of every page:

- **The AudioSilo mark** takes you home, to the overview. Next to it, on a
  wide screen, are the server's name (its address until you
  [give it a name](server.md#general)) and a one-line health readout:
  "Online" with the version number, "*name* is offline" (or "*N* libraries
  are offline") when a library's folder can't be read, or "Server not
  responding".
- **Five destinations**: **Library**, **People**, **Activity**, **Health** and
  **Server**. Each one has a row of sections under the top bar (for example
  People has **People**, **Invites**, **Shares** and **Devices**).
- **Search** ("Search books, people, settings") opens the
  [command palette](#search-and-commands).
- A **Notifications** bell, a theme menu (**Light**, **Dark** or **Match
  system**) and your account menu (**Open the web player**, **Language**,
  **Sign out**).

On a phone the destinations move to a tab bar at the bottom of the screen and
the sections scroll sideways.

![The console on a phone](/img/screenshots/admin/overview-phone.png)

The console is being rebuilt in stages. These sections work today:

| Where | What it's for |
|---|---|
| **Home** (the mark) | Who is listening, totals, recent listening, the server's status. See [The overview](#the-overview). |
| **Library > Books** | Every book as a cover grid or table, with shelves, filters, bulk edits and each book's own page. See [Books and metadata](books.md). |
| **Library > Authors**, **Series**, **Narrators** | Everyone and every series in your libraries, merging two spellings of a name, and the books missing from a series. See [Books and metadata](books.md#authors-and-narrators). |
| **Library > Folders** | Each library's folders as a tree, and how AudioSilo reads each one. See [The Folders page](libraries.md#the-folders-page). |
| **Library > Libraries** | The folders AudioSilo reads: add, edit, reorder, rescan, folder detection, export, delete. See [Libraries](libraries.md). |
| **People > People** | Everyone with an account, inviting someone new, and each person's own page. See [People and invites](users-and-invites.md). |
| **People > Invites** | Every invite link, with rotate and revoke. See [People and invites](users-and-invites.md#the-invites-page). |
| **People > Shares** | Named sets of folders you give to people. See [Sharing](sharing.md). |
| **People > Devices** | Every signed-in phone, browser and API key, and signing one out. See [The Devices page](users-and-invites.md#the-devices-page). |
| **Activity > Overview** | Listening over 7 days to a year: hours, sessions, top books and people, completion, playback, apps, and your collection's growth and storage. See [Activity](activity.md). |
| **Activity > Live now** | Every device playing right now, with its app and how it plays. See [Live now](activity.md#live-now). |
| **Activity > Sessions** | Every listening session, for everyone, one person or one book. See [Sessions](activity.md#sessions). |
| **Activity > Year in listening** | A calendar year of listening, told as a story. See [Year in listening](activity.md#year-in-listening). |
| **Health > Issues** | Books that could be better (unreadable files, missing covers, likely duplicates and more), each with a fix or Ignore, and offline libraries. See [Library health](health.md#library-health). |
| **Health > Jobs** | The scan running now, the scans waiting, the schedules, and every scan's history and log. See [Jobs](health.md#jobs). |
| **Health > System** | Everything the server depends on (ffmpeg, community metadata, the certificate, the database, each library's disk, the version), each with a status. See [System](health.md#system). |
| **Server > Settings** | The server's settings by topic: name and address, network and HTTPS, players and app links, community metadata, transcoding and demo mode. See [Settings](server.md#settings). |
| **Server > Logs** | What the server has been doing since it started, with a live tail. See [Logs](server.md#logs). |
| **Server > About** | The version, whether a newer one exists and how to update, and facts about the server. See [About and updates](server.md#about-and-updates). |

**Server > Audit log** still shows a "Coming in this redesign" page that says
what will live there. Notifications are a placeholder too.

## The overview

The overview is the console's home: a greeting and a line saying how many
people are listening right now, then:

- **Listening now** - a card per device playing or paused in the last ten
  minutes, with the listener's name, the cover, the book and its chapter, a
  progress bar and **Playing** or **Paused**. Click a card to open
  [Activity > Live now](activity.md#live-now) for the device, app and playback
  details.
- **Totals** - **Books** (every audiobook indexed, across all libraries),
  **Libraries**, **People** (every account, admins included) and **Books in
  progress** (started but not finished, across everyone).
- **Recent listening** - the latest progress, leaving out the books being
  listened to right now: who, which book, how far (or "finished") and when.
- **Needs attention** - the kinds of library issue that have something in
  them (for example "Missing covers" or "Files that couldn't be read"), each
  with its count. Click one to open its list, or **Triage** to open
  [Library health](health.md). It says "Nothing needs attention." when
  everything is fine.
- **Books per library** - each library's book count as a bar. A count that
  looks wrong is the cue to check that library's
  [folder detection](libraries.md#folder-detection).
- **Server** - the version (with a "*version* available" link to
  [Server > About](server.md#about-and-updates) when a newer release exists),
  the address you reached the console on, and whether transcoding, the web
  player and community metadata are on. **Server settings** opens
  [Server > Settings](server.md#settings).

If a library's folder can't be read - typically a network share that
unmounted - a notice at the top says "*name* is offline. Nothing was deleted."
with a **View libraries** button. (For a library that has no books yet the
notice says "AudioSilo can't read this folder" instead, since there was nothing
to keep.) See
[When a library folder goes missing](libraries.md#when-a-library-folder-goes-missing).

A brand-new server with no libraries shows a welcome card instead, with an
**Add your first library** button.

## Search and commands

![The command palette](/img/screenshots/admin/palette.png)

Press **Ctrl K** (**⌘K** on a Mac) or click the search box to open the command
palette ("Search books, people, settings, or type a command"). Type to filter,
use the arrow keys to move and Enter to open.

- **Actions** - **Invite someone**, **Add a library**, **Rescan** any library,
  **Rescan every library** (with more than one), **Open the web player** and
  **Sign out**.
- **Go to** - every destination, and (once you type) every section.
- **Settings** - each [Server > Settings](server.md#settings) topic
  (**General**, **Network & HTTPS**, **Players & app links**, **Community
  metadata**, **Transcoding** and **Demo mode**; typing "https", "proxy" or
  "ffmpeg" finds the right one), **Scan schedules and skipped files** (opens
  Library > Libraries, where each library's
  [schedule and skipped files](libraries.md#scanning-on-a-schedule) are
  edited), the three themes and the console's languages.

Type two letters or more and the palette also searches your content:
**Books** (by title, author, narrator or series), **People**, **Authors**,
**Series**, **Narrators** and **Shares**. Pick a book to open its page, a
person to open theirs, a share to open it, or an author, series or narrator
to see their books.
The last entry, "Search all books for ...", opens
[Library > Books](books.md#browsing-books) with what you typed.

![Searching from the command palette](/img/screenshots/admin/palette-search.png)

## Server settings

**Server > Settings** holds everything you can change while the server runs,
one topic at a time: its name and public address, HTTPS, app links, community
metadata, demo mode and the update check. Some settings apply at
once and some at the next restart; each one says which. See
[Server settings, updates and logs](server.md), which also covers
**Server > About** (checking for new versions) and **Server > Logs**.

:::note
The console holds no special powers of its own - every action it performs is
checked by the server against your admin account. That's also why nothing
breaks if a non-admin somehow opens the page: the server refuses every
privileged request.
:::

## Where to next

- [Libraries](libraries.md) - point the server at your audiobook folders.
- [Books and metadata](books.md) - browse your books and fix how they're
  listed.
- [People and invites](users-and-invites.md) - invite people and get their
  devices connected.
- [Sharing](sharing.md) - control which folders each person can see.
- [Activity](activity.md) - see what everyone listens to, and what the server
  records to show it.
- [Library health and jobs](health.md) - fix what could be better, follow
  your scans, and check what the server depends on.
- [Server settings, updates and logs](server.md) - change how the server
  behaves, update it, and read its log.
