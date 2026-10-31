---
title: A book's page
description: "Everything on a book's page: where you are in it, Resume and the other buttons, a finished book's rating, About and other versions, and the tabs: chapters with the whole-book timeline, bookmarks, history, notes and Details."
---

Tap a book anywhere in AudioSilo to open its page. It tells you where you are in the book, starts it, and keeps everything else about it one tab away.

![A book's page on a computer: the cover-tinted top with the place and Resume, the Chapters tab with the whole-book timeline, and About and Your listening on the right](/img/screenshots/web-player/book-detail.png)

## At the top

The top of the page takes on the colours of the book's cover. Above it, a slim line shows where the book sits on your server: the library, each folder above the book, and the book's own folder or file name. Tap a folder to open it.

- **The series and the book's number** (*"The Stormlight Archive · Book 2"*) open the [series page](browsing.md#series-pages). A book in more than one series lists each, with its number there (*"Discworld · Book 8 / Discworld: City Watch · Book 1"*), and each opens its own page. A book in no series shows its library and server instead.
- **The title**, with the book's **subtitle** under it when your server knows one (and the title doesn't already say it), then **by** the author and **read by** the narrator. Each name opens that person's page (the narrator's page needs a recent server).
- **The facts**: the length, how many chapters (or *"12 parts of 30 min"* for a book without chapter marks), the audio (*"MP3 · 3 MP3 files · 210 MB"*), the year it was published (and by whom, when your server or the community database knows), and where it lives (*"Home › Books"*). Anything the book doesn't say is simply left out.

For a book you're partway through, a line and a bar show **where you are**: *"38% · Chapter 23 of 81"*, with the [time left](full-player.md#time-left) at the speed you listen to that book.

![A book's page on a phone: the cover over the title, the place, Resume across the page and the buttons under it](/img/screenshots/web-player/phone-book-detail.png)

On a phone the cover sits above the title. On a tablet or computer it sits beside it, and on a wide enough page (a tablet held upright already is) the About card and Your listening move to a column beside the tabs (on a narrower one, for instance with the [Up next drawer](up-next.md#opening-up-next) open, they come between the top and the tabs).

## Listening and the buttons

The big button does the one thing you most likely want:

- **Start listening** for a book you haven't started.
- **Resume chapter 6** (or just **Resume**) for a book you're partway through. It never starts the book over.
- **Listen again** for a book you've finished.
- **Pause** while this book is playing.

On a phone it opens the [full player](full-player.md). On a tablet or computer the book plays where you are, under the [player bar](playback.md#the-mini-player-and-the-player-bar).

Beside it:

- **Download for offline** keeps the book on this device: see [Downloading a book](offline-downloads.md#downloading-a-book).
- **Read the ebook**, for a book with its EPUB beside the audio: it opens the book's text in the reader, at the page you reached (on a phone, on a row of its own). See [Reading the ebook](reading-the-ebook.md).
- **Up next**: **Play next** puts the book at the top of your [Up next](up-next.md) queue, and **Add to the end of Up next** queues it last (or **Remove from Up next**, if it's already there). A note confirms it, with **Undo**.
- **The heart**, to make it a [favourite](browsing.md#favourites).
- **Add to collection**, which opens the same dialog as the [book menu](browsing.md#the-book-menu). On a phone it's in the **More** menu instead.
- **More** (**...**): **Mark as finished**, or **Mark as not finished** for a book you've finished, and **More in this series**. On a phone it opens as a sheet from the bottom.

If you're an admin and your server has a [Bridge](../admin/bridge.md) that can write characters and recaps, a book the community lacks characters or recaps for gets one more button, **Generate characters and recaps**, after the others (on a phone, on a row of its own). It opens a confirmation with what it will read and cost (while the book's chapters are still being [found in the narration](../admin/generating-characters-and-recaps.md#detect-chapters-without-characters-and-recaps), it says so and holds back: generate once that has finished, since it reuses the transcription; it does the same while the book's characters and recaps are being [shared with the community](../admin/bridge.md#share-with-the-community)); while the Bridge works on it, its progress shows under the buttons, with **Cancel**. For a book whose characters and recaps were generated on your server, **Regenerate characters and recaps** is in the **More** menu instead. When the community already has both, there's no button: a line under the buttons says "The community already has characters and recaps for this book", and **See characters** opens the book's **Characters** tab. See [Generating characters and recaps](../admin/generating-characters-and-recaps.md#which-books-offer-it).

If you listened further somewhere else, or the server kept another device's place over this one, a line under the buttons offers it: *"On Sam's Watch: Chapter 12, 4:10 · Play from there"*. **Play from there** plays the book from that place; it isn't offered again. (On a recent server; see [Listening on more than one device](playback.md#listening-on-more-than-one-device).)

![A book's page with the line On Pixel 8: Chapter 1, 4:09 and Play from there under its buttons](/img/screenshots/web-player/book-place-offer.png)

In the web player, a book the browser can't play as it is says so under the buttons: *"AC-3 audio is converted to MP3 for this browser"* (see [Books a browser can't play directly](playback.md#books-a-browser-cant-play-directly)).

Up next and collections need a recent server; on an older one those buttons simply don't appear.

## A book you've finished

![A finished book's page: the Finished badge with its date, the four stars and Listen again](/img/screenshots/web-player/book-finished.png)

A finished book shows **Finished** with the date (*"Finished 3 Oct"*) in place of the progress bar. Where your server keeps ratings, **stars** sit beside it: tap one to rate the book (a note says *"Rating saved"*), or tap another to change it. It's the same rating as on the [end credits](end-of-book.md#the-end-credits), and changing the stars keeps any note saved with the rating.

## About this book

The **About** card describes the book. Its words come from the first of these that has some:

1. The **community's description** from [AudioSilo Meta](../community/meta-site.md), when your server has community metadata switched on and the book is matched there. A line under it credits the people who wrote it and links the open licence they share it under, and **Improve this** opens the book's entry, so you can make it better.
2. The description your server holds for the book (one your admin edited, or one it took from a community match or an Audiobookshelf `metadata.json`), else the one in the community database's record of the book.
3. A description your server's [Bridge](../admin/bridge.md) wrote for the book, with a small **Generated on this server** mark under the heading and no credit line. It is spoiler-free: it covers only how the book begins (see [Generating characters and recaps](../admin/generating-characters-and-recaps.md#a-description-for-the-book)).
4. Failing all of these, a sentence naming the author and the narrator.

![The About card of a book with a description generated on the server, marked Generated on this server](/img/screenshots/web-player/book-about-generated.png)

A long description folds after a few lines, with **Show more**. Under it, what's known of the recording: the **Publisher**, when it was **Released**, when the story was **First published**, its **Language**, and whether it's **Abridged**. What your server says about the publisher, the language and abridged comes first, then the community's. Anything nobody knows is left out, so a book that doesn't say whether it's abridged has no **Abridged** line rather than a "No". A matched book with no community description has a quiet **View on AudioSilo Meta** link instead of the credit.

Then the book's **Genres** and **Tags** as chips, when it has any. Tap one to open the [Library's Books](browsing.md#books) filtered to it, in the book's library. Your admin sets them on the server (or they come from the files), and an older server sends none.

**Other versions** appears when the same book is on more than one of your servers or libraries (say, an M4B copy and an MP3 copy). Each line says where that copy lives and what it is (*"M4B · single file · 480 MB"*); tap one to open its page.

**Your listening** appears once you've started the book: how long you've **Listened** to it, your **Speed** for it, and when you **Started** and **Finished** it, as far as your server's records go. In the Android app, once [Smart speed](full-player.md#smart-speed-and-voice-boost) has saved time on the book, **Smart speed saved** says how much, on this device.

**In the house** appears when you share what you're listening to and someone else on your server who shares theirs is on this book, with their name and where they are in it (see [Listening in the house](in-the-house.md)).

## The tabs

Everything else sits in a row of tabs, so a long chapter list never buries the rest. Swipe the row sideways if it doesn't all fit. Some tabs show a count beside their name: the chapters, your bookmarks and notes, and the characters you've met.

- **Chapters** (or **Parts**, or **Files**) - the default (below).
- **Recaps** and **Characters** - the community's catch-ups and character cards, which never show more than you've heard ([Recaps and characters](recaps-and-characters.md)).
- **Bookmarks** and **Notes** - your own, for this book (see [Bookmarks and notes](bookmarks-and-notes.md)).
- **History** - your listening sessions for this book (below).
- **Series** - the other books in the series, in the reading order you pick ([Recaps and characters](recaps-and-characters.md#series-with-more-than-one-reading-order)).
- **Details** - how the book plays here and what its files are (below).

**Chapters**, **Bookmarks**, **History**, **Notes** and **Details** are always there. **Recaps**, **Characters** and **Series** appear only when the community database has that material for the book, so most pages show a shorter row.

### Chapters

At the top, **The whole book**: a timeline with a segment for each chapter, the part you've heard filled in, and pins for your **bookmarks** and **notes** (the notes in their own colour). Under it, the start, where you are (*"38% · 1:02:03"*) and the end. While this book is playing, the timeline follows it and a tap or drag jumps there; for a book that isn't playing, a tap starts it at that point. Like the [player's](full-player.md#the-seek-bar-and-the-timeline), it never takes you all the way to the end.

Below it, every chapter in order: its number, its title (with a small bookmark when you've marked something in it), when it starts (on a tablet or computer), and its length, or a tick once you've heard it. The chapter you're in is highlighted. Tap any chapter to listen from there: on a phone the full player opens on it, elsewhere it plays where you are.

Some books get their chapters from the [community database](../community/meta-site.md) rather than from their files, when the files have none of their own or your admin chose the community's more detailed ones. They work exactly like any other chapters, and the list ends with a quiet line saying so: *"Chapters from the AudioSilo community database"*. Likewise, a book that had no chapters can get them from your server's [Bridge](../admin/generating-characters-and-recaps.md#books-without-chapters), which finds them in the narration (the headings the narrator reads out); their list ends with *"Chapters found in the narration on this server"*.

A book with no chapter marks lists its files instead. If it's one long file, it gets **Parts** instead, with a note explaining why: *"This book has no chapter marks"*. They're the same 30-minute parts the player uses, and you can change their length in [Settings](settings.md#playback) under **Chapter length**.

### History

Your listening sessions for the book, newest first: the day and the time you started, where you went (*"17:00:00 to 17:25:42 · Bridge Four"*), and how many minutes you listened. Listening this device hasn't synced yet (you were offline) is there too, marked **Waiting to sync**, until the server has it. **Jump** takes you back to where a session ended (on a phone, in the full player). Sessions are split as in the [Journal's Diary](journal.md#the-diary), which has every book's, day by day.

### Details

![The Details tab of a downloaded book: Plays from this device, then the files with their codec, bitrate and length](/img/screenshots/web-player/book-details.png)

How the book plays **on this device**:

- **Direct play** - the original file streams as it is, and seeking is instant.
- **Plays from this device** - the book is downloaded here, so the original files play with or without a connection.
- **Converted for this browser** - in the web player, for audio the browser can't play: your server converts it as you listen, and the iOS and Android apps play the original. See [Books a browser can't play directly](playback.md#books-a-browser-cant-play-directly).

Then the book's **files**, each with its codec, its approximate bitrate (*"about 64 kbps"*, worked out from its size and length) and its length. A book of many files shows the first six, with **and 12 more files** for the rest.

Last, the book's **path** on your server. That's how AudioSilo knows the book, so your progress, bookmarks and notes survive re-tagging and rescans.
