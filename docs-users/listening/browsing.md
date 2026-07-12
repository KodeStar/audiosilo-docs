---
title: Browsing your library
description: "Finding your next listen: the home screen shelves, library folder browsing, book details, search, and favourites."
---

Once you're [connected](connecting.md), AudioSilo gives you a few ways to find something to listen to: the home screen's shelves, browsing a library folder by folder, searching, and your own favourites.

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

- **Cover, title, and author**, plus the **series and number** (e.g. *"Stormlight Archive #2"*) and the **narrator** when known.
- A **stats strip**: a heart to favourite the book, its download size and audio format, and its total length.
- A **Listen** button to start (or resume) playing, and a **download button** for [offline listening](offline-downloads.md).
- The **Chapters** list (or **Files**, for books without chapter info) with each part's duration - tap any chapter to start playing from there. Green dots on the rows show the book is downloaded to this device.
- Your **Bookmarks**, **History** (past listening sessions), and **Notes** for this book. Notes support markdown formatting.

If the same book exists in more than one place (say, an M4B copy and an MP3 copy), the detail page offers **Choose a version** so you can pick which copy to play.

### About this book

Some books show an extra section below the chapters with more about the title:

- An **About** description of the story, and production details such as the **publisher**, **release date** and when the work was **first published**.
- A **Characters** section - community-written cards for the people in the book. Each card shows the name, role and any aliases, plus which chapter the character first appears in; tap a card to reveal its short description. Cards stay closed until you tap them, so you decide when to read on.
- A **Story so far** section - short "what's happened up to here" recaps, each labelled with the chapter it's safe to read after. They stay closed by default, so you only open the one for as far as you've listened and don't spoil what's ahead. A recap marked for the very start reads "Previously, in earlier books" - a catch-up from earlier in the series.
- A **More in this series** row - other books in the same series, each opening its page on the metadata site so you can see what to read next.
- A **View on AudioSilo Meta** link to the book's full entry.

This information comes from the **AudioSilo community metadata database** at [meta.audiosilo.app](https://meta.audiosilo.app), a free, community-run catalogue of audiobook details. It appears only when the book can be matched (it carries an ASIN or ISBN) and your server has the metadata lookup switched on. The **Characters** and **Story so far** sections are contributed by the community, so a matched book shows them only once someone has written them - many books will have the About and series details but not these yet. If a book has no extra section, it simply isn't matched or your admin has turned the feature off - nothing else on the page changes. A server admin can switch the lookup on or off at any time from the admin console's Overview section (see the [console tour](../admin/console-tour.md#community-metadata-lookup)); when it is off, no book shows this section.

## Search

The **Search** tab (or the search box in the desktop header) searches **titles, authors, and series** across every library you have access to - and across every server you've added:

![Search results for a query](/img/screenshots/web-player/search.png)

Results appear as you type. Tap a result to open the book's detail page.

:::note
Search looks at book metadata (title, author, series). To hunt by folder name inside one folder, use the browse view's filter box instead.
:::

## Favourites

Favourites are your personal shelf - mark anything you want to find again quickly:

- Tap the **heart** on a book's detail page, or the heart on any row while browsing. You can favourite whole **folders** as well as books (handy for a series or an author).
- Find them again on the **Favourites** shelf on Home, or via the **Favourites** row at the top of the Library tab, which opens the full list.
- Tap the heart again to remove a favourite.

Favourites are tied to your account, so they follow you across all your devices.
