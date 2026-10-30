---
title: Upcoming releases
description: "What's coming in the series you listen to: preorders, books just released and the volumes you're missing, on Home's Coming up in your series, the Upcoming page and series pages."
---

AudioSilo keeps an eye on the series in your library and tells you what's coming in them: books you can preorder, books that came out recently, and the volumes your library is missing. You see them on the home screen, on an **Upcoming** page of their own, and on each series page.

The list comes from the [community metadata database](../community/meta-site.md). Your server checks it once a day for the series your libraries hold (an admin turns the check on or off in [Server settings](../admin/server.md#community-metadata)), so the list only covers series you have at least one book of, and never a book you already have.

## Coming up in your series on Home

When there's something to show, the [home screen](browsing.md#the-home-screen) has a **Coming up in your series** shelf, right after **Next in your series**: preorders first, then recent releases, then the books you're missing.

![Home scrolled to Coming up in your series: pale ghost covers for the Sherlock Holmes books the library is missing, each with its series and number and when it first came out](/img/screenshots/web-player/home-upcoming.png)

Each book is a pale "ghost" cover (it isn't on your server, so there's no artwork to show), with its title, the series and its number in it (*"Sherlock Holmes, book 4"*), and a date line. Tap one to open that [series page](#on-series-pages). **See all** opens the Upcoming page.

The shelf only appears once there's something in it. While your server hasn't checked yet, or when there's nothing coming up, Home simply doesn't show it.

## The Upcoming page

The Upcoming page lists everything, in up to three groups:

- **Coming soon** - books you can preorder, the soonest first.
- **Just released** - books that came out recently (in the last 90 days, unless your admin changed it), the newest first.
- **Missing from your series** - books that are already out but not on your server: a gap below the latest book you have (you have books 3 and 5, so 4 is missing), or the next book after it.

![The Upcoming page on a computer: the Missing from your series group, with each missing Sherlock Holmes book, its series and number, and when it first came out](/img/screenshots/web-player/upcoming.png)

A group with nothing in it doesn't show. Tap a book to open its series page.

To get there:

- **See all** on Home's Coming up in your series.
- **On a phone**, the **Upcoming** section in the [Me tab](you.md#finding-you), after Account.
- **On a tablet or computer**, **Upcoming** under **You** in the top bar.

The You section is there whenever your server offers upcoming releases, so you can find the page even while Home has nothing to show.

![The Upcoming page on a phone](/img/screenshots/web-player/phone-upcoming.png)

### What the dates mean

Each book shows one date, at the detail the community database knows (a day, a month or just a year):

| You see | It means |
|---|---|
| **Out 12 Nov 2026** | A preorder: the book comes out on that day. |
| **Released Oct 2026** | It came out recently: in October 2026. |
| **First released 2014** | A missing book: when it first came out. |

Dates are written the way your device's language and region write them (*"Nov 12, 2026"* in the US, say).

The date is the book's **first** release anywhere: the earliest of every recording and store the community database lists for it. That's when the earliest *audiobook* it knows of came out, so a classic whose only listed recordings are recent shows a recent date, and your local store may get a new book a little later than the date says. A book with no known date has no date line.

### New

A small **New** badge marks a book your server first listed in the last seven days, so you can see at a glance what turned up since you last looked.

### Several servers

If you're connected to more than one server, the shelf and the page combine all of them. A book shows once, even when two of your servers both lack it. One listed by a server other than your main one says which (*"From Maya's Shelf"*), and tapping a book opens the series page on the server that listed it.

### When the page is empty

- **Checking for releases** - your server hasn't finished its first check yet. The list fills once it has (the first check runs soon after an admin turns it on, or about an hour after the server starts).
- **Nothing coming up** - your server has checked, and there's nothing new or missing in the series you have.
- **No upcoming releases here** - none of your servers lists upcoming releases (see [below](#when-you-dont-see-it)).
- **Couldn't load upcoming releases** - your server didn't answer. Nothing is lost: **Retry** asks again. If one of several servers didn't answer, a note above the list says so and the rest still shows.

A note above the list also says when a server is still running its first check while others have answered, or when one hasn't checked in over two days (the list may be out of date).

## On series pages

A [series page](browsing.md#series-pages) shows the books you don't have as pale "ghost" spines. A ghost that isn't out yet says when it will be: **Out 12 Nov 2026** in the list (instead of **Not in your library**), and *"Out 12 Nov 2026. Not on your servers yet."* under the shelf when you pick it. A ghost that's already out shows the year it first came out.

The dates come from the community database, so they show whenever your server's lookup is on, even if the daily check for upcoming releases is off.

## When you don't see it

The shelf, the Upcoming page and the You section don't appear when none of your servers lists upcoming releases:

- the server runs an older version of AudioSilo (upcoming releases arrived in 2.6.0),
- the server's community metadata lookup is off, or
- an admin switched off **Check for upcoming releases** in [Server settings](../admin/server.md#community-metadata).

A kid's account never sees upcoming releases (see [Kids mode](kids-mode.md)). The [demo](../demo.md) shows them like any other account.

:::note
Your server asks the community database only about series and books, never about who's listening.
:::
