---
title: Browsing your library
description: "Finding your next listen: getting around on a phone, tablet or computer, the home screen shelves, library folder browsing, book details, search, and favourites."
---

Once you're [connected](connecting.md), AudioSilo gives you a few ways to find something to listen to: the home screen's shelves, browsing a library folder by folder, searching, and your own favourites.

## Getting around

AudioSilo arranges itself to fit the screen it's on.

**On a phone** - the iOS and Android apps, or the web player in a narrow window - a tab bar along the bottom has five tabs:

- **Home** - your shelves (below).
- **Library** - your libraries, folder by folder.
- **Search** - find a book by title, author or series.
- **Downloads** - books saved on this device for [offline listening](offline-downloads.md).
- **Me** - your [Settings](account.md), for now.

Each tab remembers where you were. Open a book from Search, switch to Library for a moment, come back to Search, and the book is still open there; going back takes you to your search results.

**On a tablet or computer** - or any window wide enough - the tabs move to a **top bar** across the top of the screen. From left to right:

- The **AudioSilo** logo (tap it to go Home), with the server you're using underneath - or a note that you're **offline** if it can't be reached. If you've connected more than one server, it says how many more.
- **Home**, **Library** and **Downloads**. On narrower screens such as a tablet held upright, these show as icons only.
- A **search field**.
- A **gear** button for [Settings](account.md), and a round button with your initial.

Under the top bar, a slim row shows the title of the page you're on, or a **Back** button once you've opened something, such as a book. While a book is playing, the [player bar](playback.md#the-mini-player-and-the-player-bar) runs along the bottom of the window.

:::note
The **Downloads** tab only appears where downloading is possible. In the web player that means a secure (`https://`) address - see [Offline downloads](offline-downloads.md).
:::

## The home screen

The home screen is built around what *you* are doing, not just what's on the server:

![The web player home screen with its shelves of books](/img/screenshots/web-player/home.png)

- **Continue listening** - every book you've started, most recent first, each showing how much is left. Tap one to pick up exactly where you stopped. The card's menu also lets you **Mark as Finished** or jump to **More in series** (the book's folder).
- **Favourites** - the books you've marked with a heart. Only appears once you have some.
- **Recently added** - the newest books on your server, with a **View more** link to a fuller list.
- **Recently finished** - books you've completed, also with a **View more** link.

**View more** opens a browse page where you can flip between *Recently added* and *Recently finished* and see far more than the home shelves show.

:::tip
If you're connected to more than one server, the home screen, search, and favourites combine all of them - a book can even note that it's *"Also on…"* another server or *"Also in…"* another library.
:::

## Libraries and folder browsing

The **Library** tab lists your libraries - the collections your admin has shared with you - plus a **Favourites** row at the top. If you're connected to several servers, libraries are grouped under each server's name.

Opening a library shows its contents as **folders and books**, mirroring exactly how the audiobooks are organized on the server (typically author folders containing book folders):

![Browsing a library's folders](/img/screenshots/web-player/library.png)

- **Pink folder rows** open a folder; **blue book rows** open a book. Book rows show the duration and bitrate.
- **Breadcrumbs** at the top show where you are and jump back up any level.
- Big folders (more than a couple dozen entries) get a **filter box** ("Filter this folder…") and an **A–Z rail** on the right edge for jumping straight to a letter - a library with thousands of authors stays quick to navigate.
- Your scroll position is remembered, so backing out of a book returns you to where you were.

What you see here is what your account has been granted - see [Sharing](../admin/sharing.md) if some of the server's content isn't visible to you.

## Book details

Tap a book to open its detail page:

![A book's detail page with cover, stats, and chapter list](/img/screenshots/web-player/book-detail.png)

The top of the page is the same for every book:

- **Cover, title, and author**, plus the **series and number** (e.g. *"Stormlight Archive #2"*) and the **narrator** when known.
- A **stats strip**: a heart to favourite the book, its download size and audio format, and its total length.
- A **Listen** button to start (or resume) playing, and a **download button** for [offline listening](offline-downloads.md). On a tablet or computer, the cover, title and Listen button sit in a panel on the right-hand side of the page, and Listen starts the book without leaving the page; while that book is playing, the button reads **Open the player** instead.
- An **About this book** block, when the book is matched in the community database (see below).

If the same book exists in more than one place (say, an M4B copy and an MP3 copy), the detail page offers **Choose a version** so you can pick which copy to play.

### The book's tabs

Everything else sits in a row of **tabs** below that, so a long chapter list no longer buries the rest of the page. Swipe the tab row sideways if it doesn't all fit:

- **Chapters** (or **Files**, for books without chapter info) - each part with its duration; tap any chapter to start playing from there. Green dots on the rows show the book is downloaded to this device.
- **Recaps** - "what's happened up to here" catch-ups (see below).
- **Characters** - community-written cards for the people in the book (see below).
- **Bookmarks**, **History** (past listening sessions), and **Notes** for this book. Notes support markdown formatting.
- **Series** - the other books in the same series, each opening its page on the metadata site so you can see what to read next. Series that can be read in more than one order get a reading-order switch (see [Series with more than one reading order](#series-with-more-than-one-reading-order)).

**Chapters**, **Bookmarks**, **History** and **Notes** are always there. **Recaps**, **Characters** and **Series** appear only when the community database has that material for the book, so most pages show a shorter row than the full list above.

### About this book

Some books show an extra **About this book** block above the tabs, plus the community tabs:

- An **About** description of the story, and production details such as the **publisher**, **release date** and when the work was **first published**, with a **View on AudioSilo Meta** link to the book's full entry.
- The **Characters** tab - a card for each person in the book. Each card shows the name, role and any aliases, plus which chapter the character first appears in; tap a card to reveal its short description. Cards stay closed until you tap them, so you decide when to read on.
- The **Recaps** tab - short "what's happened up to here" recaps, each labelled with the chapter it's safe to read after. They stay closed by default, so you only open the one for as far as you've listened. Some books also have an **In short** summary of the whole book. Because it covers the ending too, it stays behind a **Whole-book summary** row (marked **Spoiler**) until you've finished the book; after that it opens the tab, followed by a separate **How it ends** recap. A recap marked for the very start reads "Previously, in earlier books" - a catch-up from earlier in the series.

#### Nothing gets spoiled before you reach it

The Characters and Recaps tabs follow **where you are in the book**, using your current playback position (or your saved progress if you aren't playing it right now):

- A character you haven't met yet is hidden, and so is any recap that covers chapters you haven't finished.
- A line at the bottom of the tab says how many entries are hidden - "**3 hidden to avoid spoilers**" - with a **Show anyway** toggle if you want to see them regardless. Anything you reveal that way is marked with a small **Spoiler** chip so you know you're reading ahead. Revealing applies to both tabs at once, so switching between Characters and Recaps doesn't hide it all again.
- Once you've **finished** a book, everything is shown - including the **In short** summary and "How it ends", which are full spoilers by design.

:::note
Chapter numbers here are the *book's* chapters as the community catalogued them, which can differ slightly from your particular edition's file or chapter numbering. So treat the gating as a close guide rather than an exact line - and if it hides something you've already heard, **Show anyway** (or marking the book finished) is the escape hatch.
:::

#### Catching up on earlier books in a series

At the bottom of both the **Recaps** and **Characters** tabs, a series book adds a **Previous books** block - one closed row per earlier book in the series, most recent first. Open a row and the app fetches that book from the community database on the spot:

- Under **Recaps** you get that book's **In short** summary, plus a separate **How it ends** row you have to tap for yourself (it carries a Spoiler chip, since you've presumably finished that book already). If a book has no summary written yet, its furthest recap is used instead.
- Under **Characters** you get that book's character cards.

It's the "wait, who is this again?" fix before starting book four of a series. If a book can't be loaded (your server is older than this feature, or the metadata service is unreachable) the row shows a quiet "couldn't load" note and a link to open that book on the metadata site instead.

#### Series with more than one reading order

Some series can be read in more than one order - The Chronicles of Narnia in the order the books were published or in the story's chronological order, for example. When the community database knows a series' other orders, the **Series** tab shows it as **one** row with a small switch above it - **Publication**, **Chronological** or **Recommended** (or the name of that order, if it doesn't say which kind it is). Pick one and the row lists the series in that order.

- **Your choice is remembered per series, on that device.** Choose Chronological on one Narnia book and every Narnia book on that phone or browser opens in chronological order too. Other series keep their own choice, and another device starts from the default (usually publication order).
- **The Previous books catch-up follows your choice.** The earlier books offered under Recaps and Characters are the ones before this book *in the order you picked* - so if you're reading in publication order you won't be offered a book that only comes earlier in the story's timeline, and its recap can't give anything away.
- If the book you're looking at isn't part of the order you picked, the row still lists that order and says "This book isn't part of this reading order." - and in that case it adds no previous books of its own.

This information comes from the **AudioSilo community metadata database** at [meta.audiosilo.app](https://meta.audiosilo.app), a free, community-run catalogue of audiobook details that you can also browse and contribute to yourself (see [The community metadata site](../community/meta-site.md)). It appears only when the book can be matched (it carries an ASIN or ISBN) and your server has the metadata lookup switched on. The **Characters** and **Recaps** material is contributed by the community, so a matched book gets those tabs only once someone has written them - many books will have the About block and the Series tab but not these yet. If a book shows none of this, it simply isn't matched or your admin has turned the feature off - the Chapters, Bookmarks, History and Notes tabs are unaffected. A server admin can switch the lookup on or off at any time under **Server > Settings > Community metadata** in the admin console (see [Server settings](../admin/server.md#community-metadata)); when it is off, no book shows this section.

## Search

The **Search** tab (on a tablet or computer, the search field in the top bar) searches **titles, authors, and series** across every library you have access to - and across every server you've added:

![Search results for a query](/img/screenshots/web-player/search.png)

Results appear as you type. Tap a result to open the book's detail page; going back returns you to the same results. Switch to another tab and your search is cleared, so the next one starts fresh.

:::note
Search looks at book metadata (title, author, series). To hunt by folder name inside one folder, use the browse view's filter box instead.
:::

## Favourites

Favourites are your personal shelf - mark anything you want to find again quickly:

- Tap the **heart** on a book's detail page, or the heart on any row while browsing. You can favourite whole **folders** as well as books (handy for a series or an author).
- Find them again on the **Favourites** shelf on Home, or via the **Favourites** row at the top of the Library tab, which opens the full list.
- Tap the heart again to remove a favourite.

Favourites are tied to your account, so they follow you across all your devices.
