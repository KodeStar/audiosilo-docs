---
title: "Activity"
description: "What the admin console's Activity screens show: listening over a period, who is listening right now, every listening session, a year in listening, and what the server records to draw them."
---

**Activity** in the [admin console](console-tour.md) shows what your household
listens to and how the server copes. It has four sections: **Overview**, **Live
now**, **Sessions** and **Year in listening**.

Everything here is drawn from **listening sessions**: stretches of listening on
one book on one device. The server works them out from the progress the apps
already save while they play, so there is nothing for listeners to turn on.
A few things follow from that:

- A session shows up once the app has saved progress twice. Marking a book
  finished without playing it is not listening.
- Time listened is measured with the server's own clock between saves, so a
  phone with its clock set wrong can't inflate it.
- Days, hours and weekdays are counted in the **server's** time zone. The
  Overview names the zone ("times in server time").
- Listening under an hour reads in minutes ("24m"); longer totals in hours
  ("2.4h", "128h").
- Apps released before apps started naming themselves to the server show as
  "Unknown app" until they are updated.

What the server keeps, for how long, and who can see it is set out in
[What the server records](#what-the-server-records).

## Overview

![Activity > Overview](/img/screenshots/admin/activity.png)

**Activity > Overview** covers a period: **7 days**, **30 days** (the
default), **90 days** or **1 year**, each ending now. The period you pick is
kept in the page's address, so a link or a reload opens the same view.

Four tiles sit at the top:

- **Listening hours** in the period, with a small line of the daily hours and
  how many people listened.
- **Sessions** started in the period, with their average length.
- **Peak concurrent streams**: the most sessions open at the same time, and
  when that was.
- **Books finished** in the period, with the finish rate ("40% finish rate ·
  2 of 5 started").

Where the period before had something to compare with (the same length, just
before it), a tile also shows the change as an arrow and a percentage.

Below the tiles, when someone listened in the period:

- **Listening hours per day** (**per week** for 1 year): a bar for each day,
  split by the four people who listened most, with everyone else together as
  "Everyone else". Point at a bar to see who listened how long.
- **The year, day by day**: a calendar of the last 12 months, whatever period
  you picked. The darker a day, the more listening; point at a day to see its
  hours.
- **When** *your server* **listens**: listening by hour of day and weekday, with
  the busiest hour in words ("Busiest: Wednesday 21:00").
- **Top books**: the books listened to most, with how many people listened.
  Click one to open its page.
- **Top people**: who listened most, with how many books they listened to and
  finished. Click a name to open their page.
- **Most heard**: the top authors and narrators by time listened.
- **Started vs finished**: of the people who played a book in the period, how
  many have reached 25%, 50% and 75% of it, and how many finished it.
  **Where people stopped** lists books where at least two people stopped at the
  same chapter and haven't come back for 30 days. When the book also has a file
  that couldn't be read, **See the read problem** opens it in
  [Library health](health.md).
- **How it played**: how much listening played directly and how much went
  through the transcoder, per audio format.
- **Apps in use**: the devices that listened, by app and version. A note points
  out devices running an older build than others on the same platform, and
  apps from before apps named themselves.

Whatever the period, two cards describe your collection:

- **Library growth**: how many books your libraries held over the period.
- **Storage and coverage**: the space your books take, by library and by
  format, and the share of books that have an ASIN or ISBN, chapters and a
  cover.

If people haven't been active for 60 days, a notice lists them, with when each
was last seen (or "never signed in"); click a name to open their page. When
nobody listened in the period the page says "No listening in this period":
try a longer one.

## Live now

![Activity > Live now](/img/screenshots/admin/activity-live.png)

**Activity > Live now** shows every device playing or paused in the last ten
minutes, playing first. A device that moved on to another book shows only the
book it is on now. The line under the title counts the streams ("2 streams
playing · 1 direct, 1 transcoding · 1 paused"), and the page refreshes every
ten seconds.

Each card shows the cover, who is listening, **Playing** or **Paused**, the
book, the chapter and how far they are, plus:

- **Device** - the name the device gave when it signed in.
- **App** - the app and its version, for example "AudioSilo 1.4.2 · iOS".
- **Playback** - **Direct** or **Transcode**, with the audio format.
- **Address** - the network address the device last connected from.
- **Started** - when this session began.

A session closes on its own after 10 minutes without a position update.

## Sessions

![Activity > Sessions](/img/screenshots/admin/activity-sessions.png)

**Activity > Sessions** lists every listening session, newest first: the
**Person**, the **Book** (with how far the session moved them through it, for
example "12% → 18%"), **When** it started, how long they **Listened**, the
**Device** and app, and the **Playback** (Direct or Transcode). Click a person
or a book to open their page.

- **Whose sessions** narrows the list to one person, or **Everyone**.
- **See listening sessions** in a [progress menu](users-and-invites.md#editing-someones-progress)
  opens the list for one person and one book. A "Book: ..." chip shows the
  book; its **×** (**Show every book**) clears it.
- **Show older sessions** loads the next page.

Sessions are kept for 400 days. After that they are summarised by day, so they
still count in the totals and charts but no longer appear in this list.

## Year in listening

![Activity > Year in listening](/img/screenshots/admin/activity-year.png)

**Activity > Year in listening** tells a calendar year as a story. Pick the
**Year** (this year, by the server's calendar, and the four before it); the
current year reads "so far".

- The headline: how many people listened, and for how long, and once that
  passes two days, how many days of stories it makes.
- **Book of the year**: the book listened to most, how many people spent how
  long with it, and the most heard narrator.
- Books finished, books listened to, the longest run of days in a row with some
  listening, and the busiest hour. (The busiest hour needs the detailed
  sessions, so a year more than 400 days back has none.)
- The year day by day, as a calendar.
- **Most played**: the covers of the books listened to most.
- **Who listened**: each person's hours and books finished.

A year nobody listened in says "No listening in" that year.

## Each person's listening

A person's page opens on their **Listening** tab: their listening year, the
books they have in progress and have finished (each with a menu to mark it
finished, edit its dates or see its sessions) and their recent sessions. See
[A person's page](users-and-invites.md#listening).

## What the server records

So that admins can see who is listening and on what, the server keeps a few
records about each person. Only admins can see them, and they never leave your
server.

- **Devices.** For each signed-in device (a phone, a browser, a personal API
  key): its name, which app it is and its version, when it last connected, and
  the network address it last connected from. Only the latest address is kept,
  not a history, and only while the device is signed in: once it signs out, the
  address is cleared within a day. Sessions themselves don't record addresses;
  **Live now** shows the device's latest one.
- **Listening sessions.** Who listened to which book, when, for how long, how
  far through the book, on which device and app, and whether it played directly
  or through the transcoder. These come from the progress saves the apps
  already make.
- **Start and finish dates** for each book a person reads. Books finished
  before this was added have their last listen as the finish date, and no start
  date. An admin can [correct the dates](users-and-invites.md#editing-someones-progress).

**How long it's kept.** Detailed sessions are kept for 400 days (about 13
months). After that they are reduced to daily totals: how long each person
listened to which book on which day. The device, app and time of day are
dropped.

Deleting an account removes all of its records; deleting a library removes the
listening records for its books. You can also
[sign out a single device](users-and-invites.md#the-devices-page), leaving the
person's other devices signed in.
