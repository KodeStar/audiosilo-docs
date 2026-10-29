---
title: Making a read-along
description: "Have your Bridge line a book's ebook up with its narration, sentence by sentence, so listeners can follow along in the text: what it needs, the book page's Read-along card and what it shows, the confirmation, how long it takes, how much of the text lines up (and why a poor match is refused), when a read-along goes out of date, and how it shares the Bridge's work with generating and detecting chapters."
---

A **read-along** lines a book's ebook up with its narration, sentence by
sentence: for every sentence of the text, it knows where in the audio it is
spoken. Your [Bridge](bridge.md) makes it from the book's audio and the ebook
beside it, using speech recognition only, with **no AI agent and no agent cost**,
and saves it with the book.

:::note[Following along in the player]
Making read-alongs and checking them happens in the admin console today. Following
the narration in the ebook's text in the player comes in a later player update;
the read-alongs you make now are what it will use.
:::

## What it needs

- **An admin**, in the console.
- **A book with an ebook.** The ebook is the EPUB the player's
  [Read the ebook](../listening/reading-the-ebook.md#which-books-have-it) opens:
  the book's page shows an **Ebook** chip for one. It has to be DRM-free, and the
  same book as the narration, ideally the same edition.
- **A Bridge that is paired and online** and offers read-alongs. A Bridge that is
  too old to make them doesn't offer it; update it (see
  [Running a Bridge](../getting-started/running-a-bridge.md)).
- **A library the Bridge can write to**, since the read-along is saved in the
  book's own folder: the library shows as **Ready** in
  [Settings > Bridge](bridge.md#libraries).

Community metadata, a match and the agent container are not needed.

## The Read-along card

Open the book in **Library > Books**. Under **Chapters**, a book with an ebook
has a **Read-along** card: "Listeners follow the narration in the book's ebook,
sentence by sentence."

![A book's Read-along card: Ready, how much of the ebook's text it lines up and when it was made, with Make again](/img/screenshots/admin/book-readalong.png)

It says where the book stands:

| The card says | Means |
|---|---|
| **No read-along yet.** Listeners can read the ebook, but not follow the narration in it. | none has been made; **Make read-along** makes one |
| **Ready: lines up 99% of the ebook's text** · made 3 days ago | it fits the book as it is now. **Make again** makes it afresh |
| **Out of date: the ebook changed** since the read-along was made. | the EPUB was replaced or edited. Listeners don't see it until it is made again |
| **Out of date: the audio files changed** since the read-along was made. | the book's audio files were added, removed, renamed or re-encoded. Listeners don't see it until it is made again |

The card shows only for a book with an ebook, and only when there is something to
show: a read-along, a job, or a Bridge that can make one. The percentage is
rounded down, so a read-along that lines up 99.6% of the text says 99%.

## Making one

Click **Make read-along** (or **Make again**). The confirmation says what will
happen before anything starts:

![The Make a read-along confirmation: the ebook, how long transcription can take, no agent cost, and the note on a poor match](/img/screenshots/admin/readalong-dialog.png)

- **Ebook**: the file it lines up.
- **Transcription**: "Up to" how long transcribing the whole book takes on your
  Bridge, "less if the Bridge still has this book's transcript". The Bridge transcribes the whole book unless it kept the
  transcript from an earlier job on the same audio (below).
- **Agent cost**: "None: no agent is used".
- For **Make again**, the read-along it replaces.
- That if less than half of the ebook lines up with the narration, the job stops
  and saves nothing.

When the Bridge is offline, or can't write to the book's library, the dialog says
so, and nothing can be queued while it can't write there. Press **Make
read-along**: a toast says it is queued, and the Bridge picks it up within a few
seconds.

Read-alongs are made one book at a time; there is no "make read-alongs for every
book" action.

## How long it takes

Most of the time is speech recognition, as when
[generating characters and recaps](generating-characters-and-recaps.md#the-confirmation):
the Bridge (or an [ASR worker](../getting-started/running-a-worker.md))
transcribes the book, then transcribes again any chapter where the recognition
repeated itself. Lining the text up and fine-tuning each sentence's start take
minutes on top.

The Bridge keeps a book's transcripts for 30 days after its last job. A book whose
audio it transcribed recently, for characters and recaps, for
[Detect chapters](generating-characters-and-recaps.md#detect-chapters-without-characters-and-recaps)
or for an earlier read-along, isn't transcribed again: making its read-along takes
minutes, not hours. Each read-along restarts those 30 days.

## While it runs

The card shows the job: its step ("Transcribing", "Lining up the ebook with the
narration"), how far it has got and the time left, with **Cancel**. The job also
shows as **Read-along** in [Settings > Bridge > Jobs](bridge.md#jobs). If it pauses
(the Bridge can't write to the book's folder, say, or is waiting for an ASR
worker), the card says why, with **Open in the Bridge** (see
[When a job pauses](generating-characters-and-recaps.md#when-a-job-pauses)).

When it finishes, the card shows the new read-along, and the job says how much of
the text lined up ("99% of the text lined up"), and "the transcript was reused"
when nothing had to be transcribed. With [notifications](notifications.md) on, you
hear "Read-along ready: *the book's title* (99% lined up)".

## How much lines up, and a poor match

The percentage is the share of the ebook's text, counted from the first sentence
the narrator reads to the last, that was found in the narration. A copyright page,
a table of contents or an afterword nobody reads doesn't count against it. With
the right edition of the ebook, it is usually well over 90%.

**Less than half is refused.** When under 50% of the text lines up, the ebook and
the narration aren't the same book, or are very different editions. The job fails
with "the ebook and the narration don't match: 23% lined up", and nothing is saved:
a read-along that is mostly wrong would only send listeners to the wrong place.
Put the matching edition's EPUB beside the audio and make it again; the transcript
is reused.

Other reasons a job fails, each said in the job:

- "this book has no ebook": the ebook is gone, or the server no longer counts one
  (two EPUBs in the folder count as none);
- the ebook is DRM-protected, isn't a readable EPUB, or is over 256 MiB;
- "the ebook changed while aligning; run it again": the EPUB was replaced while
  the job ran.

## When a read-along goes out of date

A read-along belongs to one ebook and one set of audio files. When you replace or
edit the EPUB, or change the book's audio (add or remove a file, re-encode or trim
one), the card says it is **Out of date**, and listeners don't get it. Click
**Make again**. When only the ebook changed, the transcript is reused, so it takes
minutes. Moving or renaming the book's folder doesn't make it out of date.

## Sharing the Bridge's work

Making a read-along, [generating characters and recaps](generating-characters-and-recaps.md)
and [detecting chapters](generating-characters-and-recaps.md#detect-chapters-without-characters-and-recaps)
all start from the book's transcript, so the Bridge runs one of them at a time
for a book:

- While characters and recaps are being generated, or chapters found, the
  Read-along card shows that job instead of **Make read-along** ("Make the
  read-along once that has finished: it reuses the transcription").
- While a read-along is being made, the book's **Generate characters and recaps**
  waits the same way, and **Detect chapters** passes over the book.
- Generating characters and recaps while a read-along job is **paused** cancels
  the read-along ("make the read-along again after"); generating then reuses what
  the read-along transcribed, and so does the read-along you make after.
- Characters and recaps generated **from the ebook** are never disturbed by a
  read-along or by Detect chapters: those transcribe the audio separately, and the
  book keeps its characters, recaps and description as they were. Generating again
  from the audio later reuses that transcription.

## Where it is saved

In the book's hidden `.audiosilo` folder, beside the characters and recaps the
Bridge writes: `readalong.json` for a book in its own folder, or
`<file name>.readalong.json` for a single-file book. The server only reads it.
Deleting the file removes the read-along at the next scan.

## Where to next

- [The Bridge](bridge.md) - the console's Settings > Bridge and its jobs.
- [Generating characters and recaps](generating-characters-and-recaps.md) - the
  Bridge's other book jobs.
- [Reading the ebook](../listening/reading-the-ebook.md) - which books have an
  ebook, and reading it in the player.
