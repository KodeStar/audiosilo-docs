---
title: Generating characters and recaps
description: "Have your Bridge write character sheets and chapter recaps for a book the community hasn't covered yet: who can, where the button is and which books offer it, the confirmation and its estimate, keeping them on your server or contributing them, following a run, what to do when one pauses, where the results appear, the spoiler-free description it writes too (and Write a description for an older book), books without chapters (chapters found in the narration, and Detect chapters with no agent cost), costs and the monthly cap, and how long transcripts are kept."
---

The community database at [meta.audiosilo.app](https://meta.audiosilo.app) gives
many books [characters and recaps](../listening/recaps-and-characters.md), but not
every book. For one it hasn't covered, your [Bridge](bridge.md) can write them
itself: it transcribes the book (or reads its ebook), has an AI agent read it for
the people and the events, checks the result for mistakes and spoilers, and saves
it with the book. Some hours later the book's **Characters** and **Recaps** tabs
appear in the player, with nothing else to do. It also writes a short,
spoiler-free [description](#a-description-for-the-book) of the book, which the
player shows when nothing else describes it. A book with no chapters gets its
chapters first, found in the narration (see
[Books without chapters](#books-without-chapters)).

## Who can, and what it needs

- **An admin.** Only admins see the button, in the console and in the player.
  Household members, kids' accounts and demo guests never do.
- **A Bridge that is paired and online**, with its **agent container** set up
  and a credential for it (see
  [Running a Bridge](../getting-started/running-a-bridge.md#7-the-agents-credential)).
  While the Bridge is offline, or doesn't offer characters and recaps, the
  button isn't there. While its [setup checklist](bridge.md#the-setup-card) says
  speech recognition, the agent's credential or the book's library is still to
  do, the console says which in place of the button ("Generating needs the
  Bridge's agent credential set first."), with a link to Settings > Bridge.
- **Community metadata switched on** under **Server > Settings > Community
  metadata** (see [Server settings](server.md#community-metadata)): generated
  characters and recaps reach the players the same way the community's do.
- **A library the Bridge can write to.** It saves the results in the book's own
  folder, so the library has to show as **Ready** in
  [Settings > Bridge](bridge.md#libraries).

The book doesn't need to be matched with community metadata, or to have an ASIN
or ISBN.

## Where to start it

- **The console's book page.** The **Community metadata** card on a
  [book's page](books.md#a-books-page) has a **Characters and recaps** part with
  **Generate characters and recaps**. Once a book has generated ones, the button
  reads **Regenerate**.
- **A whole series.** On **Library > Series**, a series card has **Generate for
  the series**. It checks each book first and queues the ones without recaps, in
  reading order, the earliest first: books that already have recaps (from the
  community or generated here) are left out, and so are books already queued and
  any it couldn't check right now. The dialog says how many it leaves out and why.
- **The player.** On a book's page in the app or the web player, an admin sees
  **Generate characters and recaps** after the other buttons. For a book with
  generated ones, **Regenerate characters and recaps** is in the book's **⋯** menu
  instead. The [companion](../listening/companion.md)'s empty **Who's who** and
  **Story so far** offer the same button.

### Which books offer it

For a single book, the console and the player follow the same rule (**Generate
for the series** goes by recaps alone, as above):

- **While the community lacks characters, recaps or both**, the button is
  there: **Generate**, or **Regenerate** once your Bridge has written some for the
  book. Generated ones only ever fill what the community is missing (see
  [Where the results appear](#where-the-results-appear)), so a book the community
  has characters for but no recaps still offers it. Recaps here means the
  chapter-by-chapter ones: a book the community has only a whole-book summary for
  still offers it, and keeps the community's summary beside your chapter recaps.
- **When the community already has both** characters and chapter recaps, there is
  no button. In its place a line says "The community already has characters and
  recaps for this book." In the console its **See them** link takes you down to
  the book's [Characters and recaps card](books.md#characters-and-recaps); in the
  player **See characters** opens the book's **Characters** tab. Only admins see
  the line. It shows even for a book your Bridge wrote characters and recaps for
  before the community had them, since the community's are the ones shown.

The button also stays away while the book's job is running (its progress shows
instead) and while the Bridge is offline. While the book's chapters are still being
[found in the narration](#detect-chapters-without-characters-and-recaps), the
console leaves the button out until that has finished; the player keeps it, and its
confirmation says so and holds back. Both do the same while the book's characters
and recaps are being
[shared with the community](bridge.md#share-with-the-community).

## The confirmation

Pressing the button opens a confirmation with what the run will take:

![The Generate characters and recaps dialog in the console](/img/screenshots/admin/generate-dialog.png)

- **Reads** - **The audio**, or **The ebook beside it** with its file name. When
  a book's folder holds exactly one `.epub` file (or, for a book that is a single
  audio file, an `.epub` with the same name beside it), the Bridge reads that
  instead of transcribing the audio, which is much quicker. An ebook it can't
  read (a copy-protected one, say) is passed over and the audio read instead.
- **Length** - how long the audiobook is.
- **Transcription** - about how long transcribing takes on your Bridge (**None
  needed** for an ebook). Before the Bridge has finished a book it uses a rough
  guess; after that it learns its own speed. An
  [ASR worker](../getting-started/running-a-worker.md) on a faster computer
  shortens it a lot.
- **Agent cost** - what the AI agent is expected to cost, from the books your
  Bridge has already done. Until it has finished one there is **No estimate yet**.
  When the agent runs on a subscription rather than an API key, it reads "About
  $X of usage": a share of the subscription's limits, not a bill.
- **Results** - where they will appear (below).
- **Also generate for N earlier books in the series first** (ticked) - when
  earlier books of the same series in this library have no recaps yet, they are
  listed and queued first, because a book's recaps build on the ones before it.
  The costs above then cover every book the button queues.

The dialog also warns when something stands in the way: the Bridge is offline
(what you queue waits for it), the agent isn't ready (the job waits until it is),
or the Bridge hasn't reported on its agent yet. When the Bridge **can't write to
this library**, nothing can be queued: check its mapping in
[Settings > Bridge](bridge.md#libraries).

Press **Generate** (or **Generate for N books**). The Bridge picks the job up
within a few seconds.

## Keeping them local, or contributing them

Unless you contribute them, the characters and recaps stay **on this server
only**: they are saved with the book and nobody else sees them.

In the console, while the [Contributions module](server.md#modules) is on and
the Bridge is [signed in to GitHub](../getting-started/bridge-accounts.md#github)
(or given a GitHub token of your own), the dialog also offers **Also contribute to the community**, switched **on** by
default. Then, once they are written, the Bridge also offers them to the community
database as a submission for review, so every other server gets them too once
they are accepted. They are saved on your server either way. Switch it off to keep
them on this server; you can still
[share them later](bridge.md#share-with-the-community). Contributing needs the
book to have an entry in the community database already; when it doesn't, the job
pauses saying so, with the results already saved locally. The player never offers
to contribute. See
[Contributing from your server](../community/contributing-from-your-server.md).

Once the job is done, the book's
[Characters and recaps card](books.md#characters-and-recaps) shows **Contributed,
waiting for review** beside each part it offered, linking to its submission.
Whether it has been reviewed or accepted isn't shown there yet: follow the link
to see. Once it is accepted and the community database has published it, the
card shows the community's entries, marked **Community**, in place of yours.

## While it runs

Generating takes a while: transcribing a long audiobook can take hours, then the
agent reads it in several passes. You can close the page; the Bridge carries on.

- **In the console**, the book's **Characters and recaps** part shows the job:
  its state, what it is doing now ("Transcribing", "Writing characters and
  recaps", "Checking for mistakes", "Writing the description"...), how far it has got, about how long is
  left and what it has cost so far, with **Cancel**. The job also appears under
  **Jobs** in [Settings > Bridge](bridge.md#jobs), linked to the book.
- **In the player**, the same status sits under the book's buttons:
  "Generating characters and recaps", the step, "12 of 40", "about 2 h left",
  and **Cancel**.

The Bridge takes queued jobs in the order they were queued. A later book of a
series waits for the book before it to be written first, so its recaps can build
on that book's.

### When a job pauses

Some problems pause a job instead of failing it. It shows as **Needs attention**
in the console (**Generating is paused** in the player) with the reason, and
**Open in the Bridge** takes you to that job on the Bridge's own page, where
**Retry** sends it on once you've fixed the cause. Some pauses end by themselves:

| Reason | What to do |
|---|---|
| The agent isn't available | Nothing, or set the agent's credential on the Bridge's Accounts tab: the job carries on once the agent container is running and has a credential (at once after a change on the Accounts tab). Check it if this lasts. |
| The agent reached its usage limit | Nothing: it carries on once the limit resets. |
| Waiting for an ASR worker | Nothing, or start the worker: the Bridge is set to wait for an [ASR worker](../getting-started/running-a-worker.md#when-the-worker-is-off) when none is connected, and the job carries on as soon as one connects. |
| The agent's credential was refused | Replace it where the agent gets it: on the Bridge's Accounts tab, or in the agent container when it has one of its own (see [Running a Bridge](../getting-started/running-a-bridge.md#7-the-agents-credential)). The job carries on at once after a change on the Accounts tab, else it looks again by itself every 30 minutes. |
| The job reached its spending limit | The monthly cap carries on by itself on the 1st of next month; raise the cap on the Bridge for sooner (below). |
| The Bridge can't write to this book's folder | Give the Bridge's user write access to the book's folder. It checks again every minute. |
| Contributing needs a GitHub token on the Bridge | Only when contributing: sign the Bridge in to GitHub on its Accounts tab (see [Bridge accounts](../getting-started/bridge-accounts.md#github)). The job carries on once it is signed in. |
| The community has no entry for this book yet | Only when contributing: add the book to the community database, or cancel and generate it again kept local. Your copy is already saved. |
| The ebook couldn't be read | Cancel, then generate again: it reads the audio. |
| The chapters couldn't be found in the narration | A book without chapter markers whose chapter headings couldn't be heard with confidence. See [When no chapters are found](#when-no-chapters-are-found). |
| Anything else (the transcript checks didn't settle, the chapters couldn't be matched...) | Look at the job on the Bridge's page, then **Retry**. |

When the job says when it tries again by itself, the console and the player show
that time.

**Cancel** stops a job at any point. **Failed** means it couldn't go on, with the
reason shown; in the player, **Try again** queues it afresh.

### Being told when it's done

Two events in [Notifications](notifications.md#what-to-send) cover the Bridge's
jobs: **A Bridge job finished** ("Characters and recaps ready" with the book's
title, "Description ready" for [Write a description](#writing-a-description-for-an-older-book),
or "Chapters found" for [Detect chapters](#detect-chapters-without-characters-and-recaps))
and **A Bridge job failed or needs attention**. Pauses that end by
themselves (the agent's usage limit, the agent container briefly away) aren't
announced. Both show in the console's bell whether or not you send them anywhere.

## Where the results appear

When the job is done, the book gets its **Characters** and **Recaps** tabs in
the player, and the companion's **Who's who** and **Story so far** fill in. They
work exactly like the community's, spoiler protection included (see
[Recaps and characters](../listening/recaps-and-characters.md)), with two
differences:

- A small **Generated on this server** mark heads each tab whose content your
  Bridge wrote. When the community has a book's whole-book summary but your Bridge
  wrote its chapter recaps, the Recaps tab marks each part for where it came from,
  and the community's summary keeps its credit line.
- There is no community credit line under them: they aren't the community's.

**The community's always comes first.** If the community database has characters
but no recaps for a book, say, the player shows the community's characters and
your generated recaps. Once the community has both, your generated ones are no
longer shown (see [Which books offer it](#which-books-offer-it)), though they
stay in the book's folder.

In the console, the book's page shows them too, in its
[Characters and recaps card](books.md#characters-and-recaps), each tab marked
**Community** or **Generated on this server** so you can see where it came from.

The files live in a hidden **`.audiosilo`** folder inside the book's folder:
`characters.json`, `recaps.json`, `description.json` (the
[description](#a-description-for-the-book)), `chapters.json` for a book whose
chapters were [found in the narration](#books-without-chapters), and `bridge.json`
(what made them, and when).
For a book that is a single audio file, they sit in a `.audiosilo` folder beside
it, named after the file (`The Book.characters.json`). The server never shows that
folder as a book or plays anything from it, and its next scan picks up any change
to the files. Moving the book's folder takes them along. **Regenerate**
replaces them.

The current apps and web player show generated characters and recaps for every
book. An app version from before this feature shows them only for a book that is
matched with community metadata, without the mark.

## A description for the book

Besides the characters and recaps, every run writes a short **description** of
the book: the paragraph someone reads before deciding to listen, where a
publisher's blurb would go.

- **Spoiler-free.** The agent writes it from its notes on the book's **opening
  chapters only** (about the first quarter of the book, never its last chapter),
  not from the whole book, so it can't give away what happens later. A book that
  is a single chapter gets no description, since its opening is the whole book.
- **In its own words.** It never copies the book: a description that repeats a
  run of eight words from the book's text is sent back to be rewritten. It is also
  checked for length (200 to 1500 characters) and for a plain, neutral tone.
- **Kept on your server.** It is never offered to the community, even when the
  run contributes the characters and recaps.

It never holds up the characters and recaps: they are saved first. When a
description can't be written (the agent reached its usage limit, say), the job
still finishes with the characters and recaps, and the console's job line says
"No description this time" with the reason.

### Where it shows

On a book's page in the player, the [About card](../listening/book-page.md#about-this-book)
shows the generated description **only when nothing else describes the book**:
the community's description comes first, then the book's own (an admin edit, one
taken from a community match or an Audiobookshelf `metadata.json`, or the community
database's record), and only then the generated one.
It carries a small **Generated on this server** mark, and no credit line or
**Improve this**. Spoiler protection never hides it: there is nothing in it to
hide. A book doesn't need to be matched with community metadata for it to show.

An app version from before this feature doesn't show a generated description.

In the console, the book's **Community metadata** card has a **Description** part
that shows it, with **Show more** for a long one and when it was written. When
listeners see another description instead (the book's own, or the community's),
it says so.

![The Community metadata card's Description part with a generated description and its Generated on this server mark](/img/screenshots/admin/book-description.png)

### Writing a description for an older book

A book generated before descriptions existed, or whose run couldn't write one,
can get one on its own: the **Description** part offers **Write a description**
when

- the Bridge is online, can write descriptions and can write to the book's library;
- the book has characters or recaps generated on this server;
- it has no description yet: none generated here, none from the community, and
  none of its own;
- nothing is being generated for it right now.

It asks first, then queues the job. The Bridge writes it from the notes it kept
when it generated the book: **nothing is transcribed again**, so it is quick and
uses a little agent time, far less than generating (counted against the same
caps). Those notes are kept after the transcripts are deleted, so this works for a
book generated months ago. The job's progress shows in the same part, and it
pauses like a generate job (the agent's usage limit, the spending cap...) and
carries on the same way.

It can fail with a reason that says what to do:

- **The Bridge has no notes for this book** (it wasn't generated by this Bridge,
  or its notes were removed): generate its characters and recaps again, which
  writes a description too.
- **A generate job is still running for this book**: it writes the description
  when it finishes. For the same reason, generating or regenerating a book cancels
  a description job that hasn't finished yet.
- **The book has a single chapter**, so no description could leave out its ending.

When it is done the event reads "Description ready" with the book's title.

## Books without chapters

Recaps and spoiler protection go by chapter: a recap covers the story up to a
chapter, and a character is revealed at a chapter. So a book needs chapters before
the Bridge can write them. For a book that is **one audio file with no chapter
markers** (or with a single marker covering the whole file, which is really its
title), the Bridge finds the chapters itself, **in the narration**: most narrators
read each heading out after a pause ("Chapter One", "Prologue", "Part Two",
"Stave Three"), and the Bridge listens for those.

A book whose files are its chapters (a folder of one file per chapter) already
has chapters, and isn't one of these.

### Generating a book without chapters

Press **Generate characters and recaps** as for any other book: there is nothing
else to do. The run

1. transcribes the book in parts of about 25 minutes, cut at pauses;
2. finds the chapters in what it heard (**Finding the chapters in the
   narration**), which takes moments once the book is transcribed;
3. **saves the chapters with the book straight away**, so listeners get them in
   the player hours before the characters and recaps are ready;
4. then writes the characters, recaps and description on those chapters, like any
   other book.

So it takes about as long as any book of its length: the confirmation's
**Transcription** line already covers it.

### Detect chapters, without characters and recaps

You can also give a book its chapters on their own. On the
[Health](health.md#the-kinds-of-issue) page, **Long books without chapters**
offers **Detect chapters** on each row, and on the bar at the bottom for the books
you tick, while the Bridge is online and offers chapter detection.

![Health > Long books without chapters, with Detect chapters on a book](/img/screenshots/admin/health-detect-chapters.png)

It asks first, saying what it does, the book's **Length**, how long
**Transcription** will take on your Bridge, and **Agent cost: None: no agent is
used**. When the Bridge can't write to the book's library, it says so and nothing
can be queued (check its mapping in [Settings > Bridge](bridge.md#libraries)). Finding chapters uses only
speech recognition, which runs on the Bridge (or an
[ASR worker](../getting-started/running-a-worker.md)) and costs nothing but time.
It also says what happens when no headings can be heard.

![The Detect chapters confirmation](/img/screenshots/admin/detect-chapters-dialog.png)

Press **Detect chapters**. A toast says how many books it queued ("Finding the
chapters of 3 books"); the Bridge works through them in turn, and you can follow
them as **Chapters** jobs in [Settings > Bridge](bridge.md#jobs), which say "24
chapters found" once done. The book's page shows the chapters as soon as its job
ends.

Some books are passed over, and the toast names them:

- a book already being generated: that run finds its chapters too;
- a book a description is being written for: try again once it has finished;
- a book whose detection is already waiting for attention on the Bridge;
- a book whose chapter source was chosen on its page. Its row says so ("Uses the
  file's chapters by choice. Set it back to automatic on the book page to detect
  chapters.") and offers no Detect chapters, since found chapters are only used
  when no source was chosen.

**Generating later reuses the work.** Generating characters and recaps for a book
whose chapters were detected carries on from that transcription instead of
transcribing again, as long as the Bridge still has it (it keeps
[transcripts](#transcripts) for 30 days). While its chapters are still being
found, the book's **Characters and recaps** part says so and waits: "The book's
chapters are being found. Generate once that has finished: it reuses the
transcription."

When it is done, the event reads "Chapters found" with the book's title, and
"Listeners see them in the player now." If the book uses other chapters by then
(the community's, or a source you chose), it says they were saved but the book
uses other chapters.

### When no chapters are found

The Bridge never guesses: a chapter in the wrong place would put recaps and
spoiler protection in the wrong place too. When it can't find the chapters with
confidence, the job **pauses** with **The chapters couldn't be found in the
narration**, and a reason such as

- "no chapter headings were heard in the narration" (the narrator doesn't read
  them out, or reads them without a pause);
- "chapter 12 runs 2 h 40 min, so headings were probably missed";
- "the narration numbers chapters 1 to 30 but only 14 were heard".

It doesn't carry on by itself. What you can do:

- **Add chapter markers to the audio file** with your tagging tool, then cancel
  the job. The server reads the markers at its next scan, and the book then has
  chapters of its own: generating it works from those.
- **Match the book to a community recording that has a chapter list** (see
  [Community chapters](books.md#community-chapters)). That gives listeners
  chapters, but not the Bridge: generating characters and recaps still needs
  markers in the file.
- Or cancel the job and leave the book as it is.

A Detect chapters job can also fail straight away, saying why: the book already
has chapters (its file carries chapter markers, or its chapters are its files),
its file has one marker covering only part of it (remove it, then try again), its
file doesn't say how long it is, the Bridge already generated the book's
characters and recaps, or they were made without chapters found in the narration
(new chapters would move their spoiler positions). In the last two cases, generate
the book again instead: that run finds its chapters too.

### Where found chapters show, and turning them off

- **In the player**, they work like any other chapters, and the book's chapter
  list ends with a quiet line: "Chapters found in the narration on this server".
  An app version from before this feature shows them as ordinary chapters,
  without the line.
- **In the console**, the book's [Chapters card](books.md#chapters-found-in-the-narration)
  shows them and turns them off or back on.

**Which chapters win.** A book's own chapters always come first: found chapters
are only ever used for a book with none. Next come the community's, when the book
is matched and the community's chapter list fits it; then the found ones. A source
you choose on the book's page overrides both. Found chapters also belong to the
exact file they were found in: replace or re-encode the file and they are no
longer used (and a long book shows under **Long books without chapters** again).

They are saved in the book's `.audiosilo` folder as `chapters.json` (for a book
that is a single audio file, as `The Book.chapters.json` in the `.audiosilo` folder
beside it), like the characters and recaps, and nothing is written into your audio
file. Moving a book's folder takes them along; moving or renaming a single audio
file on its own leaves them behind, and the book has no found chapters until they
are found again.

## Costs and the monthly cap

The transcription runs on your Bridge's own computer (or on an
[ASR worker](../getting-started/running-a-worker.md)) and costs nothing but time.
The AI agent is the cost: it runs on the agent's credential, the one set on the
Bridge's Accounts tab or the agent container's own (see
[Running a Bridge](../getting-started/running-a-bridge.md#7-the-agents-credential)).
With a subscription login the cost is notional (it counts against the
subscription's usage limits); with an API key it is billed per use.

Two limits keep it in check, both set on the Bridge (see its
[settings](../getting-started/running-a-bridge.md#costs-and-limits)):

- **A monthly cap**, **$100** by default, across every book. A job that reaches
  it pauses and carries on by itself on the 1st of the next month (the month is
  counted in UTC). It can be raised, or turned off.
- **A cap per book**, **$75** by default.

**Settings > Bridge** in the console shows the Bridge's agent and whether it is
ready, whether it is **Paid by** a subscription or an API key, what **This
month** has cost against the cap, and how many finished books the estimates come
from. The Bridge's own page shows the same on its **Status** tab.

## Transcripts

The Bridge keeps a book's transcripts in its own data folder for **30 days**
after its job ends, then deletes them. They never go into your library and are
never contributed. What a later book in the same series builds on (the facts and
the spelling of names) is kept. On the Bridge, `transcripts.retention_days` sets
the number of days; `0` deletes them as soon as the job ends.

## Where to next

- [The Bridge](bridge.md) - the console's Settings > Bridge.
- [Running a Bridge](../getting-started/running-a-bridge.md) - setting up the
  Bridge and its agent container.
- [Recaps and characters](../listening/recaps-and-characters.md) - how listeners
  see them.
