---
title: Reading the ebook
description: "Reading a book's EPUB in the web player: which books offer Read the ebook, turning pages, the contents and text size, your place kept across devices and offline, and what to do when an ebook won't open."
---

When a book's folder on your server also holds its ebook, the web player can open it. **Read the ebook** on the book's page shows the text a page at a time and remembers where you got to, on every device you read it on.

:::note[In the web player for now]
Reading is in the **web player** only for now: the iOS and Android apps don't show **Read the ebook** yet, and their reader comes in a later app update. On a phone, open the web player in the phone's browser to read.
:::

![The reader in the web player: the book's title, the chapter and how far through the book at the top, a page of text between the page-turn edges](/img/screenshots/web-player/reader.png)

## Which books have it

**Read the ebook** appears on a book's page when your server has the reader (a recent server) and the book has exactly one ebook beside its audio:

- **A book that is a folder**: one `.epub` file directly in the book's folder, with the audio. If the folder holds two or more `.epub` files, AudioSilo can't tell which one is the book, so it uses none of them and there's no **Read the ebook**. Keep one, or move the others out of the folder.
- **A book that is a single audio file**: an `.epub` with the same name beside it, such as `Project Hail Mary.m4b` and `Project Hail Mary.epub`.

```text
Terry Pratchett/
└── Discworld/
    └── 01 - The Colour of Magic/
        ├── The Colour of Magic.m4b
        └── The Colour of Magic.epub     ← Read the ebook
```

The ebook must be an **EPUB without DRM**. A locked (DRM) EPUB still shows the button, but the reader can't open it and says so. Hidden files (names starting with a dot) don't count, and a folder that holds only an ebook and no audio isn't a book in AudioSilo.

Your server notices an ebook at its next library scan, and notices one you remove or rename too. There's nothing to switch on and nothing to re-index: after upgrading the server, its first scan finds the ebooks already in your libraries without re-reading your audiobooks. An admin can press **Rescan** on the library in the [admin console](../admin/libraries.md) rather than wait. It's the same ebook your [Bridge](../admin/generating-characters-and-recaps.md) reads when it writes characters and recaps for the book.

## Opening the reader

![A book's page with Read the ebook beside the download button](/img/screenshots/web-player/book-read.png)

Press **Read the ebook** on the book's page, next to the download button (on a phone, on a row of its own). The reader fills the window: the book's title at the top, with the chapter you're in and how far through the book you are under it (*"Chapter 3 · 12%"*), and the text below.

It opens where you left off, on this device or any other. The first time, it opens at the start. A large ebook, or one full of pictures, can take a few seconds to open, and a long chapter a moment to lay out; a spinner shows meanwhile.

The reader follows the app's light or dark appearance.

## Turning pages

- **Click or tap the edges** of the page: the right edge for the next page, the left edge for the previous one. Each edge shows a faint arrow.
- **The arrow keys**: **→** for the next page, **←** for the previous one. Once you've clicked into the text, **Page Down** and **Page Up** work too.
- **Swipe** on a touch screen.

A book written right to left (in Arabic or Hebrew, for instance) turns the other way: the next page is the **left** edge and the **←** key.

## Contents and text size

- **Contents** (the list button at the top right) lists the book's chapters, with the one you're in shown in bold. Pick one to go there.
- **Smaller text** and **Larger text** (the **−** and **+** buttons) change the size of the text a step at a time. The size is remembered in this browser, for every book.

![The reader's Contents, listing the book's chapters](/img/screenshots/web-player/reader-contents.png)

## Closing the reader

The **×** at the top left closes the reader and takes you back to where you were, or press **Esc**. With the Contents open, **Esc** closes them first.

## Your place, on every device

The reader saves your place a couple of seconds after you stop on a page, and straight away when you close it or switch to another app or tab. Your server keeps it for your account, so opening the book in another browser, on another computer or on your phone, opens it at the page you reached.

Your reading place is separate from your listening place: reading doesn't move where you are in the audiobook, and listening doesn't move where you are in the ebook.

### When another device read further

Say you read to 60% in your phone's browser, while your laptop still had the book open at 10%. When the laptop next saves its place, AudioSilo doesn't move your place back to 10%, and it doesn't jump the laptop forward without asking either. Instead a note at the foot of the laptop's page offers the further place:

> On Pixel 8 you were at 60%. Jump there?

- **Jump** goes to that place.
- **Stay** keeps you where you are. Your next page turn then saves this place, so going back on purpose works.

The note names the other device as your server knows it ("On another device" when it doesn't know the name). It only appears when the other place is somewhere else: if you're already there, nothing is offered.

## Reading offline

Once a book is open, the whole ebook is in the browser, so you can keep reading without a connection. Your place is saved on this device meanwhile and sent to your server once the connection is back: as soon as the player notices your server again, or the next time you open the reader. If another device read further in the meantime, you get the **Jump there?** note above rather than losing either place.

Opening the reader needs your server: ebooks aren't part of [downloads](offline-downloads.md) yet, so even a downloaded book needs a connection to open its ebook.

## When an ebook won't open

The reader says what went wrong in plain words, with **Close the reader** and, where trying again can help, **Try again**. Your place in the book is kept either way.

| What it says | What it means |
|---|---|
| **Couldn't load the ebook** | The server didn't answer, or the connection dropped while the ebook was loading. Check the connection and press **Try again**. |
| **The reader didn't start** | The reader didn't start in this browser within 30 seconds. A proxy in front of your server that changes its security headers, or an old browser, can stop it. Press **Try again**, or use another browser (see [Troubleshooting](../troubleshooting.md#the-ebook-reader-doesnt-start)). |
| **This ebook is locked** | The EPUB is protected with DRM, which AudioSilo can't open. Put a DRM-free EPUB in the book's folder instead. |
| **This ebook can't be opened** | The file isn't an EPUB AudioSilo can read, or it's damaged. |
| **The ebook isn't on the server any more** | The file was removed or renamed since the last scan. After the next scan the button goes, or comes back if the file did. |
| **No ebook for this book** | A link opened the reader for a book that has no ebook (or a server without the reader). See [Which books have it](#which-books-have-it). |

## What the reader doesn't do yet

The reader is deliberately simple for now. It opens EPUB files only (not MOBI, AZW3 or PDF), it can't search the text or keep highlights and notes in it, and it doesn't follow along with the audio. Your [bookmarks and notes](bookmarks-and-notes.md) stay with the audiobook.
