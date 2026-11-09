---
title: "Use the community metadata site"
description: "Search the free community audiobook database, follow series for new releases, check your library and contribute."
---

**AudioSilo Meta** at [meta.audiosilo.app](https://meta.audiosilo.app) is a
free, community-built database of audiobooks: books, their narrations, authors,
narrators and series. It supplies the
[About this book](../listening/book-page.md#about-this-book) extras in the
player. Anyone can browse it, with no account.

One book can hold several recordings (say, a Stephen Fry reading and a Jim Dale
reading), each with its own narrators, length, publisher and chapters. AudioSilo
servers can use those chapter lists too (see
[Community chapters](../admin/books.md#community-chapters)).

![The AudioSilo Meta home page](/img/screenshots/meta/home.png)

## Browsing the database

The search box on the home page finds **books, people and series** at once.
Paste an ASIN or ISBN to jump straight to that recording. You don't need exact
punctuation: "enders game" finds *Ender's Game*.

![Search results for a series query](/img/screenshots/meta/search.png)

- A **book page** lists every narration of the book, with narrators, length,
  release date, publisher, ASINs and ISBNs, and chapters.
- A **series page** lists the books in reading order.
- A **person page** lists everything an author or narrator is credited on.

![A work page with its recordings](/img/screenshots/meta/work.png)

![A series page in reading order](/img/screenshots/meta/series.png)

## Choosing languages

The site shows books in every language by default. To see only some, open
**Languages** in the header (in the menu on a phone) and tick up to eight.
**All languages** clears the choice. It is kept in this browser only.

![The Languages selector open in the site header](/img/screenshots/meta/languages.png)

The choice narrows search and the latest additions. It never hides a book,
series or person page, or an ASIN or ISBN lookup. While a choice is active,
**Search all languages** sets it aside for one search.

If your browser prefers another language, the site may ask once whether to show
only that language.

![The one-line language suggestion under the header](/img/screenshots/meta/language-prompt.png)

![Search results with German chosen](/img/screenshots/meta/language-search.png)

More detail is on the site's [languages page](https://meta.audiosilo.app/docs/languages).

## Characters and story-so-far recaps

Where the community has written them, a book page has two extra tabs, the same
ones the player shows (see [Recaps and characters](../listening/recaps-and-characters.md)):

- **Characters** - a card for each character. The description stays hidden
  until you open the card.
- **Story so far** - recaps, each labelled with the chapter it is safe to read
  after. Each stays closed until you open it, so nothing ahead is spoiled.

![Characters and story-so-far recaps](/img/screenshots/meta/characters.png)

## Check your own library

The [import page](https://meta.audiosilo.app/import) shows which of your
audiobooks are already in the database and which are new. Drop in an export
from **OpenAudible**, **Libation** or **Audiobookshelf**, or a scan of a folder
of audiobooks. The page explains how to make each one.

Your file is read in your browser and never uploaded. Only book identifiers
(ASINs and ISBNs), and author names for books that don't match, are sent.

![Checking a library export against the database](/img/screenshots/meta/import.png)

## Watching a series

Follow a series to see its new and upcoming books:

1. Open the series page and press **Watch this series**.
2. Tick **I have this** on each book you own. **Mark all as owned** ticks them
   all.
3. Open the [Watching page](https://meta.audiosilo.app/watching) (**Watching**
   in the header).

The Watching page lists, for each series, the books you don't have yet:
**Available** ones, and **Preorder** ones with a future release date. A **New**
badge marks what you haven't seen before. **Hide** takes a series off the page
but keeps it; **Unwatch** forgets it.

![A series page with the watch toggle and ownership marks](/img/screenshots/meta/series-watching.png)

![The Watching page listing available and preorder entries](/img/screenshots/meta/watching.png)

Your watchlist is kept **in this browser only**. Nothing is sent to the
database, and there is no account. Clearing the site's data clears your list, so
[back it up](#backing-up-your-watchlist).

## Importing your library

Instead of watching series one at a time, drop a library export into **Import
from your library** on the Watching page. It takes the same files as the
[import page](#check-your-own-library), and an
[AudioSilo server library export](../admin/libraries.md#exporting-a-library).

You get a checklist of each series you own something in. Tick the ones to
follow and press **Watch**: the books you own are marked for you. For a series
you're not collecting, tick **Never suggest again**.

Like the import page, the file is read in your browser and never uploaded.

## Backing up your watchlist

The **Backup** block at the foot of the Watching page:

- **Download watchlist (.json)** saves everything: what you follow, own and
  have hidden.
- **Import a backup** reads one back in. It merges with what you have, so it
  never un-ticks a book.

To copy your list to another device, download it on one and import it on the
other.

## Getting notified

Once you watch a series, the Watching page shows a **Get notified** feed URL.
Paste it into any RSS reader to hear about new releases, newly added books and
preorders in your series. **Atom feed** and **JSON Feed** versions are beside
it.

The easiest way is the **AudioSilo Discord bot**:

1. Join the [AudioSilo Discord](https://discord.gg/nFFqRbkRn6).
2. Allow direct messages from the server (server menu > **Privacy Settings** >
   **Direct Messages**).
3. Send the AudioSilo bot a direct message with your **Atom feed** URL.

New books then arrive as DMs. Send `help` for the commands. `stop` deletes
everything the bot keeps about you.

Two things to know:

- **The URL is the subscription.** It holds your list of series. When you watch
  or stop watching a series, copy the URL again (and send the new one to the
  bot).
- **Keep it private.** Anyone with the URL can see which series you follow.

## Contributing

Everything in AudioSilo Meta is added by its users. You don't need to be a
programmer: guided forms open a prefilled entry on GitHub, and a bot checks and
files it. You need a free GitHub account.

There are forms to add a book or narration, write characters or recaps, send
corrections, and submit a whole library (export files up to 25 MB). The import
page turns each new book it finds into an "add this book" link. A server with a
Bridge can file characters, recaps and corrections for you: see
[Contribute from your server](contributing-from-your-server.md).

The [contribute page](https://meta.audiosilo.app/contribute) shows where help is
most needed. Its **guided builder** walks you through writing characters and
recaps for a book you know well.

![The contribute coverage browser](/img/screenshots/meta/contribute.png)

Good to know:

- Many entries came from a public Audible catalogue and haven't been checked by
  anyone. If you add a book that is already there and include its **ASIN**, your
  details replace the imported ones. Big differences go to a maintainer first.
- If a correction can't be applied as written, the bot tells you why.

### How the data stays honest

- **Facts only, in your own words.** The catalogue never copies a publisher's
  blurb or text from another site.
- **Two open licences.** Book details are public domain (CC0). Characters and
  recaps are shared under CC BY-SA.

## Works with Audiobookshelf

AudioSilo Meta can be a **custom metadata provider** for Audiobookshelf, so your
Audiobookshelf library can pull narrators, series order and covers from it. The
[Audiobookshelf page](https://meta.audiosilo.app/audiobookshelf) has the setup
steps.

If your library is mostly in one language, add its code to the provider URL.
Matches in that language then come first. For German:

```
https://meta.audiosilo.app/abs/de
```
