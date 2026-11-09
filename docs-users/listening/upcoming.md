---
title: See upcoming releases
description: "See preorders, new releases and missing books in the series you listen to, and add release days to your calendar."
---

AudioSilo watches the series in your library and shows what's coming: books you can preorder, books just released, and volumes your library is missing. They appear on Home, on an **Upcoming** page, and on each series page. You can also [add release days to your calendar](#add-to-your-calendar).

The list comes from the [community metadata database](../community/meta-site.md). Your server checks it once a day, for series you have at least one book of. An admin can turn the check on or off in [Server settings](../admin/server.md#community-metadata).

## Coming up in your series on Home

Home has a **Coming up in your series** shelf, after **Next in your series**. It shows preorders first, then recent releases, then missing books.

![Home's Coming up in your series shelf: covers of missing Sherlock Holmes books with their series number and date](/img/screenshots/web-player/home-upcoming.png)

Tap a book to open its [series page](#on-series-pages). Tap **See all** to open the Upcoming page. The shelf only appears when it has something to show.

## The Upcoming page

The Upcoming page lists everything in three groups:

- **Coming soon** - books you can preorder, soonest first.
- **Just released** - books that came out in the last 90 days, newest first.
- **Missing from your series** - books you don't have, such as book 4 when you have books 3 and 5.

![The Upcoming page: the Missing from your series group with covers and dates](/img/screenshots/web-player/upcoming.png)

To open it:

- Tap **See all** on Home's shelf.
- On a phone, open the **Me** tab and choose **Upcoming**. See [finding You](you.md#finding-you).
- On a tablet or computer, choose **Upcoming** under **You** in the top bar.

![The Upcoming page on a phone, with the Add to your calendar card below](/img/screenshots/web-player/phone-upcoming.png)

### What the dates mean

| You see | It means |
|---|---|
| **Out Nov 12, 2026** | A preorder that comes out that day. |
| **Released Oct 2026** | It came out recently. |
| **First released 2014** | A missing book, and when it first came out. |

The date is the earliest audiobook release the database knows of. Your local store may get a new book a little later.

A **New** badge marks a preorder or new release your server first listed in the last seven days.

If you use more than one server, the list combines them. Each book names the server that's missing it, so you may already have it on another server.

## Add to your calendar

The **Add to your calendar** card, under the list, gives you a private link for your calendar app. Each release shows as an all-day event on its release day, and the calendar keeps itself up to date.

![The Add to your calendar card with Subscribe, Copy link, Reset link and Turn off](/img/screenshots/web-player/upcoming-calendar.png)

1. Tap **Get calendar link**.
2. On an iPhone, iPad or Mac, tap **Subscribe** and confirm in the Calendar app.
3. Anywhere else, tap **Copy link** and add the link in your calendar app (see below).

Only books with a known release day appear: preorders and recent releases. Missing volumes don't.

### Subscribing in your calendar app

- **Apple Calendar**: tap **Subscribe**. Or on a Mac, choose **File > New Calendar Subscription** in Calendar and paste the link.
- **Google Calendar**: on a computer, open [calendar.google.com](https://calendar.google.com). Click **+** beside **Other calendars**, choose **From URL**, paste the link and click **Add calendar**. It then shows on your phone too.
- **Outlook and others**: look for **Subscribe from web** or **Add calendar from URL**.

Each calendar app decides how often it checks the link. Google Calendar can take a day or more.

:::note[Google Calendar needs a public address]
Google Calendar, Outlook on the web and iCloud calendars fetch the link from the internet. They only work with a server that has a public HTTPS address and a trusted certificate. See [Remote access](../getting-started/remote-access.md). With a home-only server, use a calendar on your own device (on a Mac, choose **On My Mac**, not iCloud).
:::

### Keep the link private

Anyone with the link can see your upcoming releases, so don't share it. The link is shown only on the device that made it.

- **Reset link** makes a new link and stops the old one. Calendars on the old link stop updating until you subscribe again.
- **Turn off** stops the link.

Kids' accounts can't use the calendar, and the [demo](../demo.md) can't make a link.

## On series pages

A [series page](browsing.md#series-pages) shows books you don't have as pale "ghost" spines. A ghost that isn't out yet shows its release date, like **Out Nov 12, 2026**. One that's already out shows the year it first came out.

## When you don't see it {/* #when-you-dont-see-it */}

Upcoming releases don't appear when:

- the server is older than 2.6,
- the server's community metadata lookup is off, or
- an admin turned off **Check for upcoming releases** in [Server settings](../admin/server.md#community-metadata).

On a new server, the first full check runs about an hour after startup. Kids' accounts never see upcoming releases.

Your server asks the community database only about series and books, never about who's listening.
