---
title: Read the ebook
description: Read a book's EPUB in the web player or the iOS and Android apps, follow the narration with read-along, and keep your place on every device.
---

When a book's folder on your server also holds its ebook, tap **Read the ebook** on the book's page to read it. The reader remembers your page on every device, and works offline for a downloaded book.

This is also where **read-along** lives. For a book with a read-along, **Follow narration** highlights each sentence as it's read and turns the pages for you. An admin makes a book's read-along once, with a [Bridge](../admin/making-read-along.md).

The reader needs your server on version 2.5.0 or later and, on a phone or tablet, the app on 2.5.0 or later. If you don't see **Read the ebook**, update the app from the App Store, Google Play or [the APK on GitHub](mobile-apps.md#android-without-google-play).

![The reader in the web player: the title, the chapter and progress at the top, and a page of text](/img/screenshots/web-player/reader.png)

## Which books have it

**Read the ebook** appears when the book has exactly one ebook beside its audio:

- **A book that is a folder**: one `.epub` file in the book's folder, with the audio. If there are two or more, AudioSilo can't tell which is the book and uses none of them.
- **A book that is a single audio file**: an `.epub` with the same name beside it, such as `Project Hail Mary.m4b` and `Project Hail Mary.epub`.

```text
Terry Pratchett/
└── Discworld/
    └── 01 - The Colour of Magic/
        ├── The Colour of Magic.m4b
        └── The Colour of Magic.epub     ← Read the ebook
```

The ebook must be an **EPUB without DRM**. A locked EPUB still shows the button, but the reader can't open it.

Your server notices a new ebook at its next library scan. An admin can press **Rescan** on the library in the [admin console](../admin/libraries.md) rather than wait.

## Reading

![A book's page with Read the ebook beside the download button](/img/screenshots/web-player/book-read.png)

1. Open the book's page and tap **Read the ebook**.
2. The reader opens where you left off, on any device. The first time, it opens at the start.
3. Turn pages by tapping the right or left **edge** of the page, swiping, or pressing **→** and **←**.
4. Close the reader with the **×** at the top left, or **Esc** in the web player.

A book written right to left turns the other way.

At the top right, **Contents** lists the chapters. The **−** and **+** buttons change the text size, which is remembered on this device.

![The reader's Contents, with the chapter being read marked](/img/screenshots/web-player/reader-contents.png)

## Follow the narration

For a book with a read-along, the reader can follow the audio. It needs your server on version 2.6.0 or later and, on a phone or tablet, the app on 2.6.0 or later.

![The reader following the narration of The Call of the Wild, with the sentence being read highlighted](/img/screenshots/web-player/reader-readalong.png)

1. Start the book playing, or load it in the player and pause.
2. Tap **Read the ebook**.
3. Tap **Follow narration** at the foot of the page. The reader highlights the sentence being read and turns the pages as the narration goes on.

While it follows:

- **Tap a sentence** to move the audiobook to it.
- **Play** and **Pause** in the reader's top bar control the book.
- **Turn the page yourself** to look back or ahead. The button then reads **Back to narration**.

While the reader follows the narration, it doesn't save your reading place.

**Follow narration** only appears while the book is in the player, and only when its read-along still matches the ebook and the audio. A [downloaded](offline-downloads.md) book keeps its own read-along as long as it matches the downloaded ebook, even once the server's is out of date. The same text follows the narration in the player too, in the companion's [Text tab](companion.md#text).

## Your place, on every device

The reader saves your place a couple of seconds after you stop on a page, and when you close it. Your server keeps it, so another browser or your phone opens the book at the same page.

Your reading place is separate from your listening place. Reading doesn't move where you are in the audiobook, and listening doesn't move where you are in the ebook.

If another device read further, a message offers that place, such as *"On Pixel 8 you were at 60%. Jump there?"* **Jump** goes there. **Stay** keeps your page.

## Reading offline

[Download the book](offline-downloads.md) to read it with no connection. The download saves the ebook beside the audio, and the reader opens it from the device.

- A download made by an older app, or one where the ebook couldn't be saved, has no ebook. To read it offline, remove the download and download the book again.
- Once a book is open, you can keep reading if the connection drops, downloaded or not.
- Your place is saved on the device and sent to the server once you're back online.

The first time you open a downloaded book offline on a device, the reader opens at the start. Once your server can be reached again, it offers the place you'd reached elsewhere.

## When an ebook won't open

The reader says what went wrong, and offers **Try again** where that can help. Your place is kept either way.

- **Couldn't load the ebook**: the server didn't answer. Check the connection and try again.
- **Sign in again**: your sign-in ended. Tap **Reconnect**.
- **This ebook is locked**: it has DRM. Put a DRM-free EPUB in the book's folder.
- **This ebook can't be opened**: the file is damaged or not a readable EPUB. In the apps, ebooks over 512 MB can't be opened.
- **The reader didn't start**: see [Troubleshooting](../troubleshooting.md#the-ebook-reader-doesnt-start).

## Good to know

The reader opens EPUB files only, not MOBI, AZW3 or PDF. It can't search the text or keep highlights. Your [bookmarks and notes](bookmarks-and-notes.md) stay with the audiobook.
