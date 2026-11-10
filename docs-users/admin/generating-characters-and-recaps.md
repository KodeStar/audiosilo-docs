---
title: Generate characters and recaps
description: "Have your Bridge write character sheets, chapter recaps and a description for a book the community hasn't covered, or find its chapters."
---

The community database gives many books
[characters and recaps](../listening/recaps-and-characters.md), but not every
book. For one it hasn't covered, your [Bridge](bridge.md) can write them. It
transcribes the book (or reads its ebook) and has an AI agent write them. Then it
checks them for mistakes and spoilers and saves them with the book.

Press **Generate characters and recaps** on the book's page. Some hours later the
book's **Characters** and **Recaps** tabs appear in the player. The run also
writes a short, spoiler-free [description](#a-description-for-the-book). Needs an
admin and a Bridge.

## Who can, and what it needs

- **An admin.** Only admins see the button, in the console and in the player.
- **A Bridge that is paired and online**, with its agent set up (see
  [Add a Bridge](../getting-started/running-a-bridge.md#7-the-agents-credential)).
  While a setup step is missing, the console says which in place of the button.
- **Community metadata** switched on under **Server > Settings > Community
  metadata** (see [Server settings](server.md#community-metadata)).
- **A library the Bridge can write to**, shown as **Ready** in
  [Settings > Bridge](bridge.md#libraries).

The book doesn't need to be matched with community metadata.

## Where to start it

- **The console's book page.** The **Community metadata** card has **Generate
  characters and recaps**. Once a book has generated ones, it reads
  **Regenerate**.
- **A whole series.** On **Library > Series**, a series card has **Generate for
  the series**. It queues the books without recaps, in reading order.
- **The player.** On a book's page, an admin sees **Generate characters and
  recaps** after the other buttons. **Regenerate** is in the book's **⋯** menu.

### Which books offer it

The button shows while the community lacks characters, chapter recaps or both
for the book. Your generated ones only ever fill what the community is missing.

When the community already has both, there is no button. A line says so instead.

The button is also hidden while the book's job runs, while the Bridge is offline,
and while the book's chapters are being found or its results shared.

## The confirmation

Pressing the button opens a confirmation with what the run will take:

![The Generate characters and recaps dialog](/img/screenshots/admin/generate-dialog.png)

- **Reads**: **The audio**, or **The ebook beside it**. When the book's folder
  holds one `.epub` file, the Bridge reads that instead, which is much quicker.
- **Transcription**: about how long transcribing takes. A
  [faster computer](../getting-started/running-a-worker.md) shortens it a lot.
- **Agent cost**: what the agent is expected to cost, once the Bridge has done a
  book. On a subscription it is a share of the subscription's limits, not a bill.
- **Also generate for N earlier books in the series first**: earlier books
  without recaps are queued first, because recaps build on the books before.

Press **Generate**. The Bridge picks the job up within a few seconds.

## Keeping them local, or contributing them

The characters and recaps stay **on this server only** unless you contribute them.

In the console, while the [Contributions module](server.md#modules) is on and the
Bridge is [signed in to GitHub](../getting-started/bridge-accounts.md#github), the
dialog offers **Also contribute to the community**, on by default. The Bridge then
also sends them to the community database for review. They are saved on your
server either way.

Switch it off to keep them here. You can still
[share them later](bridge.md#share-with-the-community). The player never
contributes. See
[Contributing from your server](../community/contributing-from-your-server.md).

## While it runs

Transcribing a long book can take hours. You can close the page; the Bridge
carries on.

The book's page shows the job's step, progress, time left and cost so far, with
**Cancel**. The job is also under **Jobs** in [Settings > Bridge](bridge.md#jobs).
In the player, the same status sits under the book's buttons.

A later book of a series waits for the book before it, so its recaps can build on
it.

To hear when a job is done or needs you, turn on **A Bridge job finished** and
**A Bridge job failed or needs attention** in
[Notifications](notifications.md#what-to-send).

### When a job pauses

Some problems pause a job. It shows **Needs attention** with the reason. **Open
in the Bridge** takes you to the job on the Bridge's page, where **Retry** sends
it on once you've fixed the cause.

| Reason | What to do |
|---|---|
| The agent isn't available | Check the agent container is running and has a credential. The job carries on by itself. |
| The agent reached its usage limit | Nothing: it carries on once the limit resets. |
| Waiting for an ASR worker | Start the [worker](../getting-started/running-a-worker.md#when-the-worker-is-off). The job carries on once it connects. |
| The agent's credential was refused | Replace it (see [Add a Bridge](../getting-started/running-a-bridge.md#7-the-agents-credential)). |
| The job reached its spending limit | Raise the cap (see [Costs](#costs-and-the-monthly-cap)), or wait for next month. |
| The Bridge can't write to this book's folder | Give the Bridge's user write access. It checks again every minute. |
| The Bridge can't share with the community | Sign the Bridge in to GitHub (see [Bridge accounts](../getting-started/bridge-accounts.md#github)). |
| The community has no entry for this book yet | Cancel and generate again kept local. Your copy is already saved. |
| The ebook couldn't be read | Cancel, then generate again: it reads the audio. |
| The chapters couldn't be found in the narration | See [When no chapters are found](#when-no-chapters-are-found). |

**Failed** means it couldn't go on, with the reason. **Cancel** stops a job at
any point.

## Where the results appear

The book gets its **Characters** and **Recaps** tabs in the player, and the
[companion](../listening/companion.md) fills in. Spoiler protection works as for
the community's. A **Generated on this server** mark heads each tab your Bridge
wrote.

**The community's always comes first.** Once the community has both characters
and recaps for a book, your generated ones are no longer shown.

The files are saved in a hidden **`.audiosilo`** folder in the book's folder. They
move with the folder. **Regenerate** replaces them.

## A description for the book

Every run also writes a short **description** of the book, where a publisher's
blurb would go.

- **Spoiler-free.** It is written from the book's opening chapters only.
- **In its own words.** It never copies the book's text.
- **Kept on your server.** It is never sent to the community.

The player shows it in the book's [About card](../listening/book-page.md#about-this-book)
**only when nothing else describes the book**, with a **Generated on this server**
mark.

![The Community metadata card's Description part with a generated description](/img/screenshots/admin/book-description.png)

### Writing a description for an older book

For a book generated before descriptions existed, the **Description** part of the
**Community metadata** card offers **Write a description**. It uses the notes the
Bridge kept, so nothing is transcribed again and it costs far less than
generating. It needs the characters or recaps to have been generated by this
Bridge.

## Books without chapters

Recaps and spoiler protection go by chapter, so a book needs chapters first. For a
book that is **one audio file with no chapter markers**, the Bridge finds the
chapters **in the narration**: it listens for the headings the narrator reads out,
like "Chapter One" or "Prologue".

Generating such a book needs nothing extra. The run finds the chapters first and
saves them straight away, so listeners get them hours before the recaps.

### Detect chapters, without characters and recaps

You can also find a book's chapters on their own, with no agent cost. On the
[Health](health.md#the-kinds-of-issue) page, **Long books without chapters**
offers **Detect chapters** on each row, and for the books you tick.

![Health > Long books without chapters, with Detect chapters on a book](/img/screenshots/admin/health-detect-chapters.png)

1. Press **Detect chapters**. The confirmation shows how long transcription will
   take.
2. Press **Detect chapters** again to queue it.
3. Follow it as a **Chapters** job in [Settings > Bridge](bridge.md#jobs).

![The Detect chapters confirmation](/img/screenshots/admin/detect-chapters-dialog.png)

Generating characters and recaps later reuses that transcription.

### When no chapters are found

The Bridge never guesses. When it can't find the chapters with confidence, the job
pauses and says why. You can:

- **add chapter markers to the audio file** with your tagging tool, then cancel
  the job, or
- cancel the job and leave the book as it is.

### Where found chapters show, and turning them off

In the player they work like any other chapters, and the chapter list says they
were found on this server. In the console, the book's
[Chapters card](books.md#chapters-found-in-the-narration) shows them and turns
them off or on.

A book's own chapters always win, then the community's, then the found ones.
Replacing or re-encoding the file stops them being used.

## Costs and the monthly cap

Transcription costs nothing but time. The AI agent is the cost: notional on a
subscription (it uses your limits), billed per use on an API key.

Two caps keep it in check (see the Bridge's
[settings](../getting-started/running-a-bridge.md#costs-and-limits)):

- **A monthly cap**, **$100** by default. A job that reaches it pauses until the
  1st of next month. Raise it on the Bridge page's **Settings** tab: it applies at
  once.
- **A cap per book**, **$75** by default, set in the Bridge's environment. A
  change applies when the Bridge restarts.

**Settings > Bridge** shows this month's cost against the cap.

## Transcripts

The Bridge keeps a book's transcripts for **30 days** after its job ends, then
deletes them. They never go into your library and are never shared. A
[read-along](making-read-along.md) or a later run reuses a kept transcript.
