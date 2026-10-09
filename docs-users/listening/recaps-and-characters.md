---
title: Recaps and characters
description: "The community's character cards and recaps on a book's page, how they never show more than you've heard, catching up on earlier books in a series, series with more than one reading order, and when this material appears."
---

When the [community database](../community/meta-site.md) has written them, a [book's page](book-page.md#the-tabs) gets two more tabs:

- The **Characters** tab - a card for each person in the book. Each card shows the name, role and any other names they go by, plus which chapter the character first appears in; tap a card to reveal its short description. Cards stay closed until you tap them, so you decide when to read on.
- The **Recaps** tab - short "what's happened up to here" recaps, each labelled with the chapter it's safe to read after. They stay closed by default, so you only open the one for as far as you've listened. Some books also have an **In short** summary of the whole book. Because it covers the ending too, it stays behind a **Whole-book summary** row (marked **Spoiler**) until you've finished the book; after that it opens the tab, followed by a separate **How it ends** recap. A recap marked for the very start reads "Previously, in earlier books" - a catch-up from earlier in the series.

Under each, a line credits the people who wrote them and links the open licence they share them under.

## Nothing gets spoiled before you reach it

The Characters and Recaps tabs follow **where you are in the book**, using your current playback position (or your saved progress if you aren't playing it right now):

- A character you haven't met yet is hidden, and so is any recap that covers chapters you haven't finished.
- A line at the bottom of the tab says how many entries are hidden - "**3 hidden to avoid spoilers**" - with a **Show anyway** toggle if you want to see them regardless. Anything you reveal that way is marked with a small **Spoiler** chip so you know you're reading ahead. Revealing applies to both tabs at once, so switching between Characters and Recaps doesn't hide it all again.
- Once you've **finished** a book, everything is shown - including the **In short** summary and "How it ends", which are full spoilers by design.

The same rule keeps [search](browsing.md#search) from naming a character before you've met them, and the [companion](companion.md) uses it while you listen.

:::note
Chapter numbers here are the *book's* chapters as the community catalogued them, which can differ slightly from your particular edition's file or chapter numbering. So treat the gating as a close guide rather than an exact line - and if it hides something you've already heard, **Show anyway** (or marking the book finished) is the escape hatch.
:::

## Catching up on earlier books in a series

At the bottom of both the **Recaps** and **Characters** tabs, a series book adds a **Previous books** block - one closed row per earlier book in the series, most recent first. Open a row and the app fetches that book from the community database on the spot:

- Under **Recaps** you get that book's **In short** summary, plus a separate **How it ends** row you have to tap for yourself (it carries a Spoiler chip, since you've presumably finished that book already). If a book has no summary written yet, its furthest recap is used instead.
- Under **Characters** you get that book's character cards.

It's the "wait, who is this again?" fix before starting book four of a series. If a book can't be loaded (your server is older than this feature, or the metadata service is unreachable) the row shows a quiet "couldn't load" note and a link to open that book on the metadata site instead. A [downloaded](offline-downloads.md#community-notes-offline) book keeps at least the book just before it, so that one opens offline too.

## Series with more than one reading order

The **Series** tab lists the other books in the same series, each opening its page on the metadata site so you can see what to read next.

The covers on the Series tab and in the Previous books rows come from your server, which fetches them from the community catalogue, so your device never contacts those image hosts. With an older server, the web player shows a placeholder (the book's title) instead of each cover; the apps load them directly.

Some series can be read in more than one order - The Chronicles of Narnia in the order the books were published or in the story's chronological order, for example. When the community database knows a series' other orders, the **Series** tab shows it as **one** row with a small switch above it - **Publication**, **Chronological** or **Recommended** (or the name of that order, if it doesn't say which kind it is). Pick one and the row lists the series in that order.

- **Your choice is remembered per series, on that device.** Choose Chronological on one Narnia book and every Narnia book on that phone or browser opens in chronological order too, and so does the [series page](browsing.md#series-pages). Other series keep their own choice, and another device starts from the default (usually publication order).
- **The Previous books catch-up follows your choice.** The earlier books offered under Recaps and Characters are the ones before this book *in the order you picked* - so if you're reading in publication order you won't be offered a book that only comes earlier in the story's timeline, and its recap can't give anything away.
- If the book you're looking at isn't part of the order you picked, the row still lists that order and says "This book isn't part of this reading order." - and in that case it adds no previous books of its own.

## When the community material appears

This material comes from the **AudioSilo community metadata database** at [meta.audiosilo.app](https://meta.audiosilo.app), a free, community-run catalogue of audiobook details that you can also browse and contribute to yourself (see [The community metadata site](../community/meta-site.md)). It appears only when the book can be matched (it carries an ASIN or ISBN) and your server has the metadata lookup switched on. The **Characters** and **Recaps** material is contributed by the community, so a matched book gets those tabs only once someone has written them - many books will have a community description and the Series tab but not these yet. If a book shows none of this, it simply isn't matched or your admin has turned the feature off; everything else on the page is unaffected. A server admin can switch the lookup on or off at any time under **Server > Settings > Community metadata** in the admin console (see [Server settings](../admin/server.md#community-metadata)).
