---
title: The community metadata site
description: Browse, check and contribute to AudioSilo Meta - the free, community-built audiobook database that powers the "About this book" extras in the player.
---

**AudioSilo Meta** at [meta.audiosilo.app](https://meta.audiosilo.app) is an
open, community-built database of audiobooks: the books themselves, each
narration (recording), the narrators and authors behind them, and the series
they belong to. It is the catalogue that powers the
[About this book](../listening/browsing.md#about-this-book) extras in the
player - and it is free for anyone to browse, with no account and no sign-up.

The database treats the details other catalogues skip as first-class
information: every recording lists its **narrators**, and one book can hold many
recordings (for example a Stephen Fry reading and a Jim Dale reading), each with
its own runtime, publisher, chapters and store identifiers.

![The AudioSilo Meta home page](/img/screenshots/meta/home.png)

## Browsing the database

The home page has a single search box. It searches **books, people (authors and
narrators), and series** at once, and if you paste an ASIN or ISBN it jumps
straight to the exact recording. Below the search box you'll find the latest
additions and a running count of what the community has catalogued so far.

![Search results for a series query](/img/screenshots/meta/search.png)

- A **book page** lists every catalogued narration of that title. Each recording
  card shows its narrators, runtime, release date, publisher, any region-specific
  ASINs and ISBNs (tap one to copy it), and an expandable chapter list. If the
  book belongs to a series, the page links to the series and offers previous and
  next buttons plus a "more in this series" row of covers.
- A **series page** lists the member books in reading order, with their positions
  (including half-numbers like 2.5).
- A **person page** collects everything a narrator or author is credited on.

![A work page with its recordings](/img/screenshots/meta/work.png)

![A series page in reading order](/img/screenshots/meta/series.png)

## Characters and story-so-far recaps

On a book page, two extra tabs appear once the community has written them - the
same material the player shows under [About this book](../listening/browsing.md#about-this-book):

- **Characters** - a card for each person in the book, written by readers in
  their own words. A card's name, role and aliases are always visible, along with
  the chapter where the character first appears; the description stays hidden
  behind the card until you open it, so you choose when to read on.
- **Story so far** - short "what's happened up to here" recaps, each labelled
  with the chapter it is safe to read after. Every recap stays closed until you
  open it, so you can catch up to exactly where you've listened without spoiling
  what's ahead. Some books also carry a whole-book summary and an ending recap
  for readers who have finished; those are marked as full spoilers.

![Characters and story-so-far recaps](/img/screenshots/meta/characters.png)

## Check your own library

The [import page](https://meta.audiosilo.app/import) tells you which of your
audiobooks are already in the database and which are new. Drop in a library
export and it sorts your books into "In the database", "New - you can contribute
these", and "Cannot auto-match".

It accepts an export from **OpenAudible**, **Libation**, or **Audiobookshelf**,
or a scan of a plain folder of audiobooks. The page explains how to produce each
one.

Your file is read **entirely in your browser** and never uploaded. Only the book
identifiers (ASINs and ISBNs) are sent to the database to look for a match, plus
the author names of books that didn't match, so it can tell a brand-new book from
a new narration of a book that's already listed. Personal fields - purchase
history, ratings, file paths - never leave your device.

![Checking a library export against the database](/img/screenshots/meta/import.png)

## Contributing

Everything in AudioSilo Meta is added by its users, and you don't have to be a
programmer to help. Contributions are made through **guided forms** that open a
prefilled entry on the project's GitHub page; a bot then checks the submission
and files it. You need a free GitHub account to submit one.

There are forms to add a book or a narration, to write a book's characters or its
story-so-far recaps, to send in a correction, and to submit a whole library at
once. The import page above turns each new book it finds into a one-click "add
this book" link.

The [contribute page](https://meta.audiosilo.app/contribute) shows where help is
most needed: which books still need characters or recaps, and which series are
missing volumes. From there, a **guided builder** walks you through writing the
characters and recaps for a book you know well, checking the spoiler positions
and length limits as you go, and hands you a finished submission at the end.

![The contribute coverage browser](/img/screenshots/meta/contribute.png)

## How the data stays honest

Two rules keep the catalogue clean, and they're worth knowing before you
contribute:

- **Facts only, in your own words.** The catalogue records verifiable facts and
  community-written descriptions. It never copies a publisher's blurb or text
  from another site, and it stores cover art as a link rather than a copy.
- **Two open licences.** The factual catalogue - books, recordings, narrators,
  series - is dedicated to the public domain (CC0), free to use in any app for
  any purpose. The community-written characters and recaps are shared under
  CC BY-SA (credit the source and share your own additions on the same terms).

## Works with Audiobookshelf

If you use Audiobookshelf, AudioSilo Meta can act as a **custom metadata
provider** for it, so your Audiobookshelf library can pull narrators, recordings,
series order and cover art from the community database. The
[Audiobookshelf page](https://meta.audiosilo.app/audiobookshelf) has the setup
steps, and also shows how to send your Audiobookshelf library back to help fill
in the catalogue.
