---
title: Use the book page
description: See where you are in a book, start it, and find its chapters, bookmarks, history and details.
---

Tap a book anywhere in AudioSilo to open its page. It shows where you are in the book, starts it, and keeps everything else about it one tab away.

![A book's page on a computer: the place and Resume at the top, the Chapters tab, and About on the right](/img/screenshots/web-player/book-detail.png)

## At the top

The top of the page takes on the colours of the book's cover. It shows:

- **The series and book number.** Tap it to open the [series page](browsing.md#series-pages).
- **The title**, then the author and narrator. Tap a name to open that person's page.
- **The facts**: length, number of chapters, audio format and size, the year, and where the book lives on your server.
- **Where you are**, for a book you've started, with the [time left](full-player.md#time-left) at your speed.

A slim line above the title shows the book's folders on your server. Tap one to open it.

![A book's page on a phone: the cover over the title, Resume and the buttons under it](/img/screenshots/web-player/phone-book-detail.png)

## Listening and the buttons

The big button does what you most likely want: **Start listening**, **Resume**, **Listen again** for a finished book, or **Pause**. Resume never starts the book over.

On a phone it opens the [full player](full-player.md). On a tablet or computer the book plays under the [player bar](playback.md#the-mini-player-and-the-player-bar).

Beside it:

- **Download for offline** keeps the book on this device. See [Listen offline](offline-downloads.md#downloading-a-book).
- **Read the ebook**, for a book with an EPUB. See [Read the ebook](reading-the-ebook.md).
- **Up next**: **Play next** or **Add to the end of Up next**. See [Choose what plays next](up-next.md).
- **The heart** makes it a [favourite](browsing.md#favourites).
- **Add to collection**. On a phone it's in the **More** menu.
- **More** (**...**): **Send to watch**, **Mark as finished** or **Mark as not finished**, and **More in this series**.

If you listened further on another device, a line under the buttons offers that place, such as *"On Apple Watch: Chapter 12, 4:10 · Play from there"*. See [Listening on more than one device](playback.md#listening-on-more-than-one-device).

![A book's page offering another device's place, with Play from there](/img/screenshots/web-player/book-place-offer.png)

If you're an admin and your server has a [Bridge](../admin/bridge.md), a book the community database doesn't cover may also show **Generate characters and recaps**. See [Generating characters and recaps](../admin/generating-characters-and-recaps.md#which-books-offer-it).

## A book you've finished

![A finished book's page: the Finished badge with its date, the stars and Listen again](/img/screenshots/web-player/book-finished.png)

A finished book shows **Finished** with the date. If your server keeps ratings, tap a star to rate it. It's the same rating as on the [end credits](end-of-book.md#the-end-credits).

## About this book

The **About** card describes the book. The description comes from the community database, [AudioSilo Meta](../community/meta-site.md), when your server has that switched on and the book is matched. Otherwise it's the one your server holds.

If neither has one, your server's [Bridge](../admin/generating-characters-and-recaps.md#a-description-for-the-book) may have written a spoiler-free one, marked **Generated on this server**.

![An About card with a description generated on the server](/img/screenshots/web-player/book-about-generated.png)

Under the description you'll find the publisher, release date, language and whether it's abridged, when known. Then come the book's **Genres** and **Tags**. Tap one to open the [Library](browsing.md#books) filtered to it.

Below the About card:

- **Other versions** lists copies of the same book in your other libraries or servers.
- **Your listening** shows how long you've listened, your speed, and when you started and finished. On Android it also shows what [Smart speed](full-player.md#smart-speed-and-voice-boost) has saved.
- **In the house** shows who else on your server is on this book, when you both [share your listening](in-the-house.md).

## The tabs

Everything else sits in a row of tabs:

- **Chapters** (or **Parts** or **Files**) - the default, below.
- **Recaps** and **Characters** - catch-ups and character cards from the community database, which never show more than you've heard. See [See recaps and characters](recaps-and-characters.md).
- **Bookmarks** and **Notes** - see [Add bookmarks and notes](bookmarks-and-notes.md).
- **History** - your listening sessions, below.
- **Series** - the other books in the series, in the [reading order you pick](recaps-and-characters.md#series-with-more-than-one-reading-order).
- **Details** - how the book plays here and what its files are, below.

Recaps, Characters and Series only appear when the community database has that material for the book.

### Chapters

At the top, **The whole book** timeline shows each chapter, the part you've heard, and pins for your bookmarks and notes. Tap or drag it to jump. Like the [player's seek bar](full-player.md#the-seek-bar-and-the-timeline), it stops short of the very end.

Below it, every chapter is listed in order, with its length or a tick once you've heard it. Tap a chapter to listen from there.

Some books get their chapters from the community database, or from your server's [Bridge](../admin/generating-characters-and-recaps.md#books-without-chapters), which finds them in the narration. A line at the end of the list says where they came from.

A book with no chapter marks lists its files. One long file is split into 30-minute **Parts**. Change their length under **Chapter length** in [Settings](settings.md#playback).

### History

Your listening sessions for the book, newest first: when, where in the book, and for how long. Listening this device hasn't synced yet shows as **Waiting to sync**. **Jump** takes you back to where a session ended.

The [Journal's Diary](journal.md#the-diary) has every book's sessions, day by day.

### Details

![The Details tab: Plays from this device, then the files with codec, bitrate and length](/img/screenshots/web-player/book-details.png)

The tab first says how the book plays on this device:

- **Direct play** - the original file streams as it is.
- **Plays from this device** - it's downloaded.
- **Converted for this browser** - your server converts it as you listen. See [Books a browser can't play directly](playback.md#books-a-browser-cant-play-directly).

Then it lists the book's files, with codec, bitrate and length, and the book's path on your server. Your progress, bookmarks and notes are tied to that path, so they survive re-tagging and rescans.
