---
title: Make a read-along
description: "Have your Bridge line a book's ebook up with its narration, sentence by sentence, so listeners can follow along in the text."
---

A **read-along** lines a book's ebook up with its narration, sentence by sentence.
Listeners can then follow the text as it is read, in the companion's
[Text tab](../listening/companion.md#text) or with **Follow narration** in the
[reader](../listening/reading-the-ebook.md#follow-the-narration).

Your [Bridge](bridge.md) makes it from the book's audio and its ebook, with **no AI
agent and no cost**. Open the book in the console and press **Make read-along**.
It needs an admin and a Bridge.

## What it needs

- **An admin**, in the console or [the player](#from-the-player).
- **A book with an ebook**: a DRM-free EPUB beside the audio (the book shows an
  **Ebook** chip). It must be the same book as the narration, ideally the same
  edition.
- **A Bridge that is paired and online.** It needs Bridge 0.5.0 or later.
- **A library the Bridge can write to**, shown as **Ready** in
  [Server > Settings > Bridge](bridge.md#libraries).

## The Read-along card

Open the book in **Library > Books**. A book with an ebook has a **Read-along**
card under **Chapters**.

![A book's Read-along card: Ready, how much of the text lines up, with Make again](/img/screenshots/admin/book-readalong.png)

It says **No read-along yet**, **Ready** with how much of the text lines up, or
**Out of date** when the ebook or the audio files changed since it was made.
Listeners don't get a read-along that is out of date. When the Bridge is missing,
offline or too old, the card says so.

## Making one

1. Press **Make read-along** (or **Make again**).
2. Check the confirmation: the ebook, how long transcription can take, and that
   there is no agent cost.
3. Press **Make read-along**.

![The Make a read-along confirmation](/img/screenshots/admin/readalong-dialog.png)

The card shows progress and lets you **Cancel**. If the server cancels the job,
the card says why. You can also follow the job in [Server > Settings > Bridge > Jobs](bridge.md#jobs).

When another book is using speech recognition, your book waits its turn. The
**Jobs** tab on the Bridge's own page says **Waiting for a turn to use speech
recognition**. In the console, the book's card and its row in **Jobs** show the
step it is waiting to start instead. None of them shows a count or time
estimate while your book waits.

Once transcription starts, the row shows progress and an estimate of the time
left when available. When the read-along is ready, the book's card says how much
of the text lined up.

### From the player {/* #from-the-player */}

As an admin, play the book and open the companion's
[Text tab](../listening/companion.md#text). When there is no read-along yet,
tap **Make read-along** for the estimate. When it is out of date, the button
reads **Make the read-along again**. Once you confirm, the tab shows the job's
progress, then the text.

Offline, the confirmation shows an estimate only if it loaded one a few
minutes before, and **Make read-along** waits until you reconnect.

## How long it takes

Most of the time goes on transcribing the book, which takes as long as when
[generating characters and recaps](generating-characters-and-recaps.md#the-confirmation).
A [worker](../getting-started/running-a-worker.md) on a faster computer shortens
it.

The Bridge keeps a book's transcripts for 30 days. If it transcribed the book
recently, for characters and recaps, for
[Detect chapters](chapter-detection.md)
or for an earlier read-along, making the read-along takes minutes, not hours.

If the Bridge is detecting chapters or generating characters and recaps for the
same book, let that job finish first.

## How much lines up

The percentage is the share of the ebook's text, from the first sentence read to
the last, that was found in the narration. With the right edition it is usually
well over 90%.

**Less than half is refused.** Under 50% means the ebook and the narration aren't
the same book or edition. The job fails and saves nothing. Put the EPUB of the same
edition beside the audio and make it again. The Bridge reuses the transcript.

A job also fails when the ebook is DRM-protected, isn't a readable EPUB, or is
over 256 MiB, or when the folder has two EPUBs.

## When a read-along goes out of date

A read-along belongs to one ebook and one set of audio files. Replace or edit the
EPUB, or change the audio files, and the card says **Out of date**. Press **Make
again**. When only the ebook changed, it takes minutes. Moving or renaming the
book's folder is fine.

The server spots a changed EPUB by its size, date and name. A replacement that
keeps all three, such as a copy that preserves the date, isn't noticed until one
of them changes.

## Where it is saved

The Bridge saves it in the book's hidden `.audiosilo` folder, as `readalong.json` (or
`<file name>.readalong.json` for a single-file book). Delete the file to remove the
read-along.
