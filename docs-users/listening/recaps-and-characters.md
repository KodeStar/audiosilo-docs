---
title: See recaps and characters
description: Catch up on a book with character cards and recaps that never show more than you've heard.
---

Many books get two extra tabs on their [page](book-page.md#the-tabs): **Characters** and **Recaps**. They help you remember who's who and what's happened, and they never show more than you've heard.

They come from the community database, [AudioSilo Meta](../community/meta-site.md), so your server needs community metadata switched on. Your server can also [generate them](#generated-on-this-server).

- **Characters** has a card for each person: name, role, other names they go by, and the chapter they first appear in. Tap a card to read its short description.
- **Recaps** has short "what's happened up to here" summaries, each labelled with the chapter it's safe to read after. Some books also have a whole-book summary, kept behind a **Spoiler** row until you finish.

A line under each tab credits the people who wrote them.

## Nothing gets spoiled before you reach it

Both tabs follow **where you are in the book**:

- Characters you haven't met, and recaps of chapters you haven't finished, are hidden.
- A line at the bottom says how many are hidden, with **Show anyway** to see them. Anything revealed this way has a small **Spoiler** chip.
- Once you've **finished** the book, everything is shown.

The same rule keeps [search](browsing.md#search) from naming a character too early, and the player's [companion](companion.md) uses it as you listen.

:::note
Chapter numbers here are the community's, which can differ a little from your copy's. If something you've already heard is hidden, use **Show anyway**.
:::

## Catching up on earlier books in a series

For a book in a series, both tabs end with **Previous books**: a row for each earlier book. Open one to see that book's summary under Recaps, or its characters under Characters. It's the "wait, who is this again?" fix before book four.

## Series with more than one reading order

The **Series** tab lists the other books in the series.

Some series can be read in more than one order, such as The Chronicles of Narnia. When the community knows other orders, the tab has a switch: **Publication**, **Chronological** or **Recommended**. Pick one, and the list follows that order.

- Your choice is remembered per series, on that device. The [series page](browsing.md#series-pages) uses it too.
- **Previous books** follows your choice, so a catch-up never gives away a book that comes later in your order.

## Generated on this server

For a book the community hasn't covered, an admin can have the server's [Bridge](../admin/bridge.md) write characters and recaps (see [Generating characters and recaps](../admin/generating-characters-and-recaps.md)). They appear in the same tabs, follow the same spoiler rules, and carry a **Generated on this server** mark.

![A book's Recaps tab with recaps generated on the server, the whole-book summary kept closed, and Show anyway](/img/screenshots/web-player/book-recaps-generated.png)

The community's material always comes first. The Bridge also writes a short, spoiler-free description for the book's [About card](book-page.md#about-this-book).

## Good to know

- A book only gets community material when it can be matched (it has an ASIN or ISBN) and someone has written it. Many books have a description and a Series tab, but no characters or recaps yet.
- An admin switches the lookup on or off under **Server > Settings > Community metadata** in the admin console. See [Server settings](../admin/server.md#community-metadata).
- A [downloaded](offline-downloads.md#community-notes-offline) book keeps this material, so it works offline.
