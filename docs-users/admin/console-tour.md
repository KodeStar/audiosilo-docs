---
title: "Find your way around the admin console"
description: "Open the admin console, sign in, and find where libraries, books, people, activity, health and server settings live."
---

Every AudioSilo server has a built-in admin console. It is a web page served by
the server itself, so there is nothing to install. You use it to manage
libraries, books and people, see who is listening, and look after the server.

Only admin accounts can use the console.

## Opening the console

The console lives at `/admin` on your server. If your server runs at
`https://audiobooks.example.com`, open:

```
https://audiobooks.example.com/admin
```

## Signing in

![The admin sign-in screen](/img/screenshots/admin/login.png)

Sign in with the admin username and password created when you first set up the
server (see [Set up your server](../getting-started/first-run.md)). On a new server,
signing in first opens the
[Set up your server](../getting-started/first-run.md#set-up-your-server) flow.

A regular listener account can't sign in here. Listeners connect their devices
with [invites](users-and-invites.md) instead.

The **Language** selector under the sign-in card changes the console's
language. Once you are signed in, it is in your account menu.

:::tip
You can install the console as an app. Open it over HTTPS (or on `localhost`)
and your browser offers to install it.
:::

## The layout

![The console's overview](/img/screenshots/admin/overview.png)

The bar along the top of every page has:

- **The AudioSilo mark**, which takes you to the overview. Beside it are the
  server's name and whether it is online.
- **Five destinations**: **Library**, **People**, **Activity**, **Health** and
  **Server**. Each has its own sections in a row under the top bar.
- **Search**, which opens the [command palette](#search-and-commands).
- The **Notifications** bell (see [Notifications](notifications.md)), a theme
  menu and your account menu.

On a phone the destinations move to a tab bar at the bottom of the screen.

![The console on a phone](/img/screenshots/admin/overview-phone.png)

What each section is for:

| Where | What it's for |
|---|---|
| **Library > Books** | Every book, with filters, bulk edits and each book's own page. See [Fix book details](books.md). |
| **Library > Authors**, **Series**, **Narrators** | Merging two spellings of a name, and the books missing from a series. See [Authors and narrators](books.md#authors-and-narrators). |
| **Library > Folders** | How AudioSilo reads each folder. See [The Folders page](libraries.md#the-folders-page). |
| **Library > Libraries** | Add, edit, rescan, export and delete libraries. See [Add and manage libraries](libraries.md). |
| **Library > LibriVox** | Search LibriVox and have your Bridge add a free book to a library. See [Add free books from LibriVox](librivox.md). |
| **People > People** and **Invites** | Accounts and invite links. See [Invite people](users-and-invites.md). |
| **People > Shares** | Named sets of folders you give to people. See [Sharing](sharing.md). |
| **People > Devices** | Every signed-in phone, browser and API key. See [The Devices page](users-and-invites.md#the-devices-page). |
| **Activity** | Listening over time, who is playing now, every session and a year in review. See [See who is listening](activity.md). |
| **Health > Issues** | Books that could be better, each with a fix. See [Library health](health.md#library-health). |
| **Health > Jobs** | Scans running, waiting and finished. See [Jobs](health.md#jobs). |
| **Health > System** | Everything the server depends on, with a status for each. See [System](health.md#system). |
| **Server > Settings** | The server's settings by topic. See [Settings](server.md#settings). |
| **Server > Logs**, **Audit log** and **About** | The server's log, what admins changed, and updates. See [Server settings, updates and logs](server.md). |

## The overview

The overview is the console's home page. It shows:

- **Listening now**: a card for each device playing or paused in the last ten
  minutes. Click one to see its details in
  [Activity > Live now](activity.md#live-now).
- **Totals**: books, libraries, people and books in progress.
- **Recent listening**: who listened to what, and how far they got.
- **Needs attention**: the kinds of library issue that have something in them.
  **Triage** opens [Library health](health.md).
- **Books per library**. A count that looks wrong is a cue to check that
  library's [folder detection](libraries.md#folder-detection).
- **Server**: the version, whether a newer one is out, and which features are
  on.

A notice appears at the top when a library's folder can't be read (see
[When a library folder goes missing](libraries.md#when-a-library-folder-goes-missing)).
Another appears when saved settings wait for a restart (see
[When a change takes effect](server.md#when-a-change-takes-effect)). While
books are not matched to community metadata, a third says how many, with
[Match automatically](health.md#matching-every-book-at-once).
**Library > Books** shows the same notice.

A new server with no libraries shows an **Add your first library** button
instead. Until you dismiss it, a
[Finish setting up](../getting-started/first-run.md#the-finish-setting-up-card)
card lists any setup steps you skipped.

### The support card

![The Support AudioSilo card](/img/screenshots/admin/support-card.png)

AudioSilo is free, with nothing held back. Once your server has been in use for
a while, the overview shows a small **Support AudioSilo** card with a link to
GitHub Sponsors. It first appears 30 days after the server's first account was
made, or after 7 days once 10 books have been finished.

- **Sponsor on GitHub** opens GitHub Sponsors in a new tab.
- **I've donated** hides the card for good.
- **Not now** hides it for six months.

Your answer counts for every admin on the server. Nothing is checked or sent
anywhere, and a donation unlocks nothing: every feature is there either way.
Only admins see the card, never listeners. **Support AudioSilo** stays in the
account menu and on Server > About.

![The account menu with Support AudioSilo](/img/screenshots/admin/account-menu.png)

## Search and commands

![The command palette](/img/screenshots/admin/palette.png)

Press **Ctrl K** (**⌘K** on a Mac) or click the search box to open the command
palette. Type to filter, use the arrow keys to move and press Enter to open.

- **Actions**: invite someone, add a library, rescan a library or every
  library, open the web player, or sign out.
- **Go to**: any destination or section.
- **Settings**: any Server > Settings topic, the scan schedules, the themes and
  the console's languages.

Type two letters or more to search your books, people, authors, series,
narrators and shares. The last entry, "Search all books for ...", opens
[Library > Books](books.md#browsing-books) with what you typed.

![Searching from the command palette](/img/screenshots/admin/palette-search.png)
