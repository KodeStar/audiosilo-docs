---
title: Move over from Audiobookshelf
description: "Point AudioSilo at the books folder you use with Audiobookshelf: bring its book details and listening history across, match your books, and know what reads differently."
---

AudioSilo can read the same books folder as Audiobookshelf, so you can try it without moving a file. This page covers what comes across, what to do after the first scan, and where the two read a folder differently. You need an admin account.

## Run both side by side

The AudioSilo server never writes to your books folder. It can read the folder while Audiobookshelf keeps running, and you can mount the folder read-only. Nothing you do in AudioSilo changes Audiobookshelf.

## Bring your book details across

Audiobookshelf keeps each book's details, such as its matched ASIN, your edits and its series, in a `metadata.json` file. By default it keeps these files in its own metadata folder, not beside your books, so AudioSilo can't see them. Its **Store metadata with item** setting, which puts the file in each book's folder instead, is off by default.

Turning the setting on doesn't write files for the books already there. Audiobookshelf writes a book's file into its folder the next time it saves a change to that book. To bring a book's details across:

1. In Audiobookshelf, open **Settings** and turn on **Store metadata with item**.
2. In Audiobookshelf, change the book, for example edit its details or match it. Audiobookshelf writes its `metadata.json` beside it.
3. In the AudioSilo admin console, [rescan the library](../admin/libraries.md#rescanning).

A book with a `metadata.json` file then shows its Audiobookshelf details in AudioSilo, and one with an ASIN or ISBN in it counts as matched. See [Audiobookshelf's metadata.json files](organizing-your-library.md#coming-from-audiobookshelf) for what the file brings.

## Bring listening history across

**Server > Settings > Import** copies each person's listening sessions, progress and bookmarks from Audiobookshelf. [Invite](../admin/users-and-invites.md#inviting-someone) everyone first, so each person has an account to import into. See [Import your Audiobookshelf history](../admin/import.md).

## Match your books

A scan matches no book by itself, apart from books whose `metadata.json` names an ASIN or ISBN. An ASIN in a book's tags is only a hint for the next step. To match the rest:

1. Open **Health** in the admin console and select **Not matched to community metadata**. This is the list of your unmatched books.
2. On its **Match automatically** card, pick the library and select **Find matches**.
3. Review what it found and apply it. See [Matching every book at once](../admin/health.md#matching-every-book-at-once).

Matching uses the free community database at [AudioSilo Meta](https://meta.audiosilo.app). It holds books, their recordings, authors, narrators and series. Its users add and correct them, and many entries came from a public Audible catalogue. It is not a live copy of any store, so a book can be on Audible in your country and still be missing from it.

The **Audible marketplace** setting picks which store's edition a match takes when a recording sells in several stores. It is in [Server > Settings > Community metadata](../admin/server.md#community-metadata), and it uses the US store until you set yours.

### When a book doesn't match

The community database has gaps, so some books won't match. An unmatched book still plays as normal. It keeps the title, author, series and cover from its tags and folders. What it lacks is the community extras: the description, characters and recaps, and community chapters.

- To match one book by hand, see [Matching with community metadata](../admin/books.md#matching-with-community-metadata).
- To add a missing book to the community database, see [Contributing](../community/meta-site.md#contributing). Anyone with a free GitHub account can add one.
- **Help complete the community database** sends the database the ASINs it doesn't know. See [Helping complete the community database](../admin/server.md#helping-complete-the-community-database).

## Where your folders read differently

AudioSilo reads one folder that holds audio files as one book. Two layouts can come out differently from Audiobookshelf:

- **Several single-file books loose in one author or series folder** read as one book with several parts. Set that folder to **Separate books**. See [When a folder holds many separate books](organizing-your-library.md#when-a-folder-holds-many-separate-books).
- **A book split into disc folders**, such as `CD1` and `CD2`, reads as one book per disc. Join them with **Join into one book**. See [Books split into disc folders](../admin/libraries.md#books-split-into-disc-folders).

**Health** lists both: **Folder may hold several books** and **One book split into disc folders**.

## Connect your phones

Install the AudioSilo app, open it and tap **Scan a QR code**. Your pairing code is in the admin console under **People**, your name, then **Pair a device**. See [Connect the app to your server](../listening/connecting.md).
