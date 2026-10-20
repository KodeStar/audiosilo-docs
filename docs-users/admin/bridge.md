---
title: "The Bridge"
description: "Connect an optional Bridge to your server from Settings > Bridge: make a pairing code, see whether it's online and what its AI agent costs, follow its setup checklist and accounts, check that it can find and write to each library, verify a library, share characters and recaps and suggest corrections to the community, follow its jobs and unpair it."
---

The **Bridge** is an optional companion you can run beside your AudioSilo server.
The server only ever **reads** your books. The Bridge is the part that may **write**
to your library folders and run heavy work, so the server can stay read-only and
safe to put on the internet.

You don't need one. Without a Bridge everything in AudioSilo works as before.

:::info What it does today
The Bridge is new. Today it
[generates characters and recaps](generating-characters-and-recaps.md) for books
the community hasn't covered, saving them with the book,
[finds the chapters](generating-characters-and-recaps.md#books-without-chapters) of
a book that has none, and you can ask it to **Verify** a library to check it is
set up. With the [Contributions module](server.md#modules) on, it also
[shares characters and recaps](#share-with-the-community) and
[suggests your corrections](#suggest-corrections) to the community metadata
database. Later versions add more jobs, such as podcasts.
:::

To set one up, see [Running a Bridge](../getting-started/running-a-bridge.md). This
page covers the console side: **Server > Settings > Bridge** in the
[admin console](console-tour.md). Only admins can see it.

![Server > Settings > Bridge before a Bridge is connected](/img/screenshots/admin/settings-bridge.png)

## Connecting a Bridge

1. Start the Bridge (see [Running a Bridge](../getting-started/running-a-bridge.md))
   and open its own page.
2. In the console, open **Server > Settings > Bridge** and press **Connect a
   bridge**. A pairing code appears, with the server's address.
3. On the Bridge's page, paste the **server address** and the **code**, then pair.

![The Connect a bridge dialog with a pairing code](/img/screenshots/admin/bridge-pair.png)

Instead of pasting, you can give the Bridge the two settings the dialog shows
before you start it (**Copy both** copies them):
`AUDIOSILO_BRIDGE_SERVER_URL` and `AUDIOSILO_BRIDGE_PAIR_CODE`.

Good to know:

- **The code is shown once and works once**, for 15 minutes. If you close the
  dialog or the code runs out, press **Make a new code**. While a code is waiting,
  the page says so.
- **The server address** in the dialog is the server's address on your home
  network when it knows one (an `http://` address if the server uses its own
  self-signed certificate, which the Bridge can't check), else the address you
  opened the console on. If the Bridge runs in a container next to the server, it
  may need a different address to reach it, such as `http://audiosilo:8080`: use
  whatever works from the Bridge.
- The dialog closes on its own with **Bridge connected** once the Bridge uses the
  code. Its details show as soon as it sends its first report, a few seconds later.
- **One Bridge per server.** **Pair a new bridge** makes a code for a replacement:
  the current Bridge keeps working until the new one uses the code, and then stops.

## Online, offline and its details

Once paired, the Bridge reports to the server every 30 seconds. The top card says
how it is:

- **Online** - it reported in the last two minutes.
- **Offline** - it hasn't reported for over two minutes. Check that it is running
  and can reach the server. Anything you ask it to do waits until it is back.
- **Waiting for its first report** - it has paired but hasn't reported yet.

Below that: when it last reported, its version, when it was paired and by whom, the
jobs it can run and its features. Once the Bridge reports on its AI agent, four more
lines cover [characters and recaps](generating-characters-and-recaps.md):

- **Agent** - the tool the agent container runs (`claude` or `codex`) and whether
  it is **Ready**, or **None set up**.
- **Paid by** - a **Subscription** (the costs are what the same use would cost on
  an API key) or an **API key**.
- **This month** - what the agent has cost this month against the Bridge's
  monthly cap ("$12.30 of $100"), or "no monthly cap".
- **Estimates from** - how many finished books the cost estimates are based on.

**Open its page** opens the Bridge's own page,
when the Bridge has been told the address your network reaches it at.

The Bridge never needs the server to connect to it: it always calls the server.

**If the server stops accepting the Bridge**, the Bridge stops calling in and says
why on its own page. That happens when you unpair it, when you connect another
Bridge, or when the admin who connected it is no longer an admin (or their account
is disabled); the page then shows no Bridge connected. The Bridge keeps trying every
5 minutes, so if that admin is made an admin again it comes back by itself. After an
unpair or a new Bridge, connect it again with a new code.

![Server > Settings > Bridge with a Bridge connected](/img/screenshots/admin/settings-bridge-paired.png)

## The setup card

A Bridge reports its **setup checklist** with each report: the steps it needs
before it can do its jobs, in the same order as its own page's **Get set up** card
(see [Running a Bridge](../getting-started/running-a-bridge.md#3-open-the-bridges-page)).
The console shows it as the **Setup** card: at the top of the page, titled **Get
set up**, while a required step is still to do, and below the status card once
everything required is done ("Everything required is done").

![The Setup card on Settings > Bridge](/img/screenshots/admin/bridge-setup.png)

| Step | Done when |
|---|---|
| **Paired with this server** | the Bridge is paired |
| **Libraries mapped and writable** | the Bridge can find and write to every library (the line under it says how many, "1 of 2 libraries writable") |
| **Speech recognition ready** | something can transcribe now: the Bridge itself ("local") or an [ASR worker](../getting-started/running-a-worker.md) ("worker") |
| **Agent credential set** | the agent container is ready, with a credential (the line names the tool) |
| **Monthly budget reviewed** | someone saved the agent's monthly budget on the Bridge's page, or the Bridge's environment sets it (the line says it, "$100 a month" or "no monthly cap") |
| **GitHub signed in** (Optional) | the Bridge can share with the community (the line names the GitHub account, or says the token comes from the Bridge's environment or the gh command) |

Each step shows a green tick when done, an amber circle while still to do, or,
for the optional one (marked **Optional**), a dashed circle until done. A step
still to do says what is missing, with **Fix on the Bridge**, which
opens the tab of the Bridge's own page where you do it (when the Bridge has told
the server its page's address). The heading says how many required steps are
done ("3 of 5 required steps done").

Under the steps, the Bridge's accounts, read-only:

- **GitHub account** - the GitHub user signed in on the Bridge's Accounts tab, or
  **Not signed in** (shown too when the Bridge shares with a GitHub token from its
  environment or the gh command).
- **Agent credential** - **Set** or **Not set**, as the **Agent credential set**
  step reads (so **Not set** too while the agent container isn't ready).
- **Contributing** - **Ready** when the Bridge can share with the community now,
  else **Not ready**.

A Bridge signed in to GitHub whose sign-in couldn't be refreshed, because GitHub
couldn't be reached, shows here as not signed in (**GitHub signed in** not done,
**GitHub account** **Not signed in**, **Contributing** **Not ready**), though its
own Accounts tab still says **Signed in**. The Contributions card under
[Modules](server.md#modules) says **Sign in to GitHub on your Bridge** meanwhile,
and **Share with the community**, **Suggest corrections** and the **Also
contribute to the community** switch are hidden. Usually there is nothing to sign
in again, and signing out would only lose a sign-in you can't make again until
GitHub can be reached: it recovers by itself once GitHub can be reached, unless
its Accounts tab then says **Sign in again** (see
[Bridge accounts](../getting-started/bridge-accounts.md#github)).

You sign in and out only on the Bridge's own page: **Open Accounts on the Bridge**
opens its Accounts tab (see [Bridge accounts](../getting-started/bridge-accounts.md)).
The server never sees the passwords or keys.

While the Bridge is **offline**, the card is what it last reported ("As last
reported 2 hr. ago"), stays below the status card, and leaves out
**Contributing**. An older Bridge that doesn't report a checklist shows no Setup
card.

On a book's page in the console, a step that generating needs and that is still
to do is named in place of **Generate characters and recaps** (the player keeps
its button; see
[Who can, and what it needs](generating-characters-and-recaps.md#who-can-and-what-it-needs)).

## Libraries

The **Libraries** card lists every library on the server with what the Bridge found:

| Status | Means |
|---|---|
| **Ready** | the Bridge found the library and can write there |
| **Can't write** | the Bridge found the library, but it can only read it |
| **Not found** | the Bridge couldn't find this library |
| **Not reported yet** | the Bridge hasn't checked it yet |

Each library shows its folder **On the server**, the folder **On the Bridge**, and
the book it **Checked with**. The Bridge doesn't take a folder's word for it: it
finds a book the server knows and checks that its files are there with exactly the
same sizes, and only then tries writing a small test file (which it removes).

When a library isn't **Ready**, the line under it says why. The usual reasons:

- **The folder isn't mounted** in the Bridge's container, or is mounted at another
  path. Mount the same folders at the same paths for both, or tell the Bridge where
  each library is on its own page.
- **It's a different copy.** A file is missing or a different size: the folder the
  Bridge sees isn't the one the server reads.
- **The library has no books yet.** With nothing to compare, the Bridge never calls
  a library found. It checks again once the server has indexed a book there.
- **It can only read the folder** (**Can't write**): the folder is mounted
  read-only for the Bridge, or the Bridge runs as a user who can't write there.
  Mount it read-write and set the Bridge's `PUID`/`PGID` to the owner of your
  library folders.

A library must be **Ready** before the Bridge can
[generate characters and recaps](generating-characters-and-recaps.md) for its
books, since it saves them in each book's folder.

The Bridge checks its libraries after pairing, when your libraries change, and
every 10 minutes after that by default (not on every report, so it doesn't keep
sleeping disks awake). On its own page, **Check now** checks them all at once, and
changing a library's folder there checks that library again.

## Verify

**Verify** on a library asks the Bridge to check it again, as a job you can follow:
it finds a book from that library through its folder, compares every file's size
with the server's, and tries writing a test file in that book's folder. **Nothing
is changed.** It's the quickest way to see that a Bridge is set up properly.

The button next to **Verify** opens its options:

- **Book (optional)** - a book's path in the library, such as
  `Author/Series/Book`, to check that book. Left empty, the Bridge checks the
  library's first book by title (skipping one whose files have gone missing).
- **More options > Hold (seconds)** - makes the Bridge wait that long before it
  finishes (up to 600), so you can try cancelling the job or stopping the Bridge
  part way.

Press **Queue verify**. If the Bridge is offline, the job waits for it. Pressing
**Verify** again while one is still waiting or running doesn't add another. If the
last one is still stopping after you cancelled it, the console says so: queue it
again once it has stopped.

## Jobs

The **Jobs** card lists what the Bridge was asked to do, newest first. **Show jobs**
filters it by state:

| State | Means |
|---|---|
| **Queued** | waiting for the Bridge |
| **Claimed** | the Bridge has picked it up |
| **Running** | the Bridge is working on it |
| **Needs attention** | the Bridge stopped and needs you to look at it |
| **Done** | finished |
| **Failed** | it didn't work: the reason is shown under it |
| **Cancelled** | you cancelled it |

Each job shows the library (and book), its progress, who asked and when. A finished
Verify sums up what it found (how many files matched, whether it can write, how long
it took); **Details** shows everything it reported.

A **Characters and recaps** job links to its book and shows what it is doing (the
step, how far it has got, the time left and the cost so far), and once it is done,
how many characters and recaps it wrote and what it cost. One that **Needs
attention** says why, with **Open in the Bridge**, which opens that job on the
Bridge's own page, where **Retry** sends it on once you've fixed the cause. See
[When a job pauses](generating-characters-and-recaps.md#when-a-job-pauses). Once
done it also says whether a description came with them. A **Description** job
([Write a description](generating-characters-and-recaps.md#writing-a-description-for-an-older-book))
shows the same way, and "Description written" once done, and so does a
**Chapters** job ([Detect chapters](generating-characters-and-recaps.md#detect-chapters-without-characters-and-recaps)),
with "24 chapters found" once done. A **Community share** job
([Share with the community](#share-with-the-community)) and a **Corrections** job
([Suggest corrections](#suggest-corrections)) link what they filed once done.

**Cancel** stops a job. A job that is waiting is cancelled at once; one the Bridge
is working on shows **Cancelling** until the Bridge stops it, within a few seconds.

If the Bridge stops in the middle of a job (it crashes, or its computer restarts),
the job isn't lost: after about two minutes the server puts it back in the queue,
and the Bridge picks it up again when it is back. A job that keeps failing this way
is marked **Failed** after the third try.

The job list stays when you unpair a Bridge, so you can still cancel jobs that are
waiting.

## Share with the community

When characters and recaps were generated for a book with the results kept on
this server, you can still send them to the community metadata database later.
The book's **Community metadata** card then has a **Share with the community**
part ("The characters and recaps generated here aren't in the community metadata
yet. Share them for review, so other servers get them too."). It is offered when:

- the [Contributions module](server.md#modules) is on, and the Bridge is online
  and [signed in to GitHub](../getting-started/bridge-accounts.md#github) (or
  given a GitHub token in its environment);
- the book has characters or recaps generated on this server that the community
  lacks, and they haven't been shared already;
- no generate job for the book is waiting, running or paused, and no share is
  already open (its status shows instead).

**Share with the community** queues a **Community share** job. The Bridge sends
what it generated before (it keeps it after its transcripts are gone): nothing is
generated again and the agent costs nothing. Each part the community still lacks
becomes a submission for review, and once the job is done the part says **Shared
with the community**, with a link to each submission. A part the community
already had is skipped ("The community already had the recaps, so nothing was
filed for them"); when it had everything, the job ends with "Nothing was shared:
the community already had it".

A share fails, saying why, when the Bridge isn't signed in to GitHub (or GitHub
refused its sign-in: sign in again on its Accounts tab). A share doesn't wait
for the sign-in, so once you have signed in, share the book again. When the
Bridge is signed in already but GitHub couldn't be reached to refresh its
sign-in, the console offers no share until it can, and a share queued just as that
happened fails with "The Bridge's GitHub sign-in couldn't be refreshed because
GitHub couldn't be reached: share the book again once it can."; signing in again
usually isn't needed. It also fails when it keeps no characters or
recaps for the book (they were generated by another Bridge, or
removed: generate them first), when the book isn't matched to a community entry
("Match the book first"), or when an earlier share stopped while filing and the
Bridge can't tell yet whether GitHub made the submission (share it again in a few
minutes, and if that keeps happening, look for the issue on the community
repository). The Bridge guards against filing a submission twice: a share after
an interrupted one looks for what the earlier try made and uses it, and fails as
above while it can't check. When the interrupted try is over a day old and too
far back for the Bridge to look through (many submissions made since), it files
again (the community spots a duplicate).

While a share is waiting or running, the console offers no way to generate the
book again ("The characters and recaps are being shared with the community.
Generate again once that has finished."), and the player holds **Generate** back
too ("This book's characters and recaps are being shared with the community.
Generate once that has finished."). Generating the book again cancels a share that
is paused and, while the Contributions module is off, one still waiting: the
console and the player both offer **Generate** for the book then.

## Suggest corrections

When you [edit a matched book's details](books.md#editing-details) and your
values differ from the community's, you can suggest your values to the community
metadata database. The book's **Community metadata** card then has a
**Corrections** part ("You edited fields the community has differently. Suggest
your values, so other servers get them too.") with **Suggest corrections**. It is
offered when:

- the [Contributions module](server.md#modules) and
  [community metadata](server.md#community-metadata) are on, and the Bridge is
  online, signed in to GitHub (or given a GitHub token in its environment) and
  able to file corrections;
- no corrections job for the book is waiting, running or paused (its status
  shows instead);
- the book is matched and has an ASIN or an ISBN (how the community finds it);
- you edited at least one of **Title**, **Author**, **Narrator**, **Series**,
  **Series number**, **Other series**, **Published** or **ISBN** (the ISBN only
  when the book also has an ASIN), and the edit holds a value. Only your own
  edits count: values from the files, the folders or an accepted match are
  never sent.

Save or discard unsaved edits on the page first. The dialog's header names the
book (a long title is cut to two lines; hover it to read the rest). It asks the
community for the book (by its ASIN, else its ISBN) and lists each edited field
whose value differs from the community's: the community's value now, an arrow,
and your value:

- Each row is ticked, except one the book's last corrections job already
  suggested with the same value (**Suggested before**; not when that job failed
  or was cancelled). A row can't be ticked, and says why, when a value is too
  long to send (over 500 characters), holds a control character or a hidden
  text-direction character the community refuses (also when written as a code
  such as `&#x202E;`; a code for a space, a line break or a tab reads as a
  space), or when your value changes nothing as the community reads
  it (`Tom &amp; Jerry` reads as `Tom & Jerry`). When your value holds a
  refused character (often pasted in with the text), retype it; when the
  community's does, that field can't be corrected from here.
- A badge says who applies it: **Applied automatically** or **Reviewed by a
  maintainer** (below).
- **Evidence** is required (up to 2,000 characters, a line starting with `#`
  counting one more): say where the right values come from, such as a store or
  publisher page. It starts with a line saying the values were corrected on an
  AudioSilo server. Evidence holding a control character (line breaks and tabs
  are fine) or a hidden text-direction character, or most character references
  to one, can't be sent: retype any text you pasted.

**Suggest N corrections** queues a **Corrections** job. The Bridge files the ticked
rows as one submission under its GitHub account, released into the public domain
(CC0). Once done, the part says how many were filed, which fields will be
**Applied automatically once checked** and which are **Waiting for a maintainer**,
with **See issue #N**.

Which corrections apply by themselves, once the community's bot has checked them
(the pull request is still reviewed before it is merged):

| Field | Applied |
|---|---|
| **Title** | automatically |
| **Published** (the recording's release date) and **ISBN** (added to the recording) | automatically when the book's ASIN or ISBN names the recording; else by a maintainer, who finds the recording |
| **Author**, **Narrator**, **Series**, **Series number**, **Other series** | by a maintainer, with your evidence |

The dialog says so when the community has no record for the book ("It wasn't
found by its ASIN or ISBN, so there's nothing to correct": match it again with
**Compare fields**) and when it already has your values ("There's nothing to
suggest"). When a value changed since the dialog read it (edited or reset
elsewhere, in another tab, say), queueing is refused ("One of these values isn't
your edit any more"): close it and check the book's fields.

The Bridge guards against filing the same corrections twice. Before it files, it
notes the request: the book's community entry and edition, and the rows you
ticked with their corrected values. The evidence and the order of the rows don't
count. If the filing is interrupted, or GitHub's answer is lost, the next try at
the same request (the job resumed, or you pressing **Suggest corrections** again
with the same rows and values, whatever evidence you give) looks for the
submission first and uses the one it finds, even when the community entry was
renamed or the book moved on disk since. A new press does this only within a day
of the interrupted try, unless it would send exactly the same submission again
(the same rows, values and evidence, sent by the same server version, with the
community entry's title and the edition unchanged): then it uses that one at any
age, even once it has been closed. Otherwise, after a day the earlier submission
counts as someone else's for the same entry, and the job stops once asking you to
look for it (below).

A different set of rows, or another corrected value (editing the book's title
changes its row), is a new request and is filed without looking. So is a retry
after the community applied some of your rows meanwhile: the dialog no longer
lists those, so the request is smaller (the community spots the duplicate). Once
a filing is confirmed the Bridge forgets the request, so the same corrections
suggested after that are filed again: that is why the dialog starts those rows
unticked (**Suggested before**). What the job says when it stops:

- "GitHub didn't confirm the issue (no answer in time, or a server error). The
  Bridge will check whether the corrections were filed before filing them again:
  suggest them again in a minute."
- "These corrections were being filed moments ago, and GitHub may still be making
  the issue: suggest them again in a minute."
- "An earlier suggestion of these corrections stopped while filing them, and the
  Bridge can't tell whether they were filed: look for a [corrections] issue on the
  community database before suggesting them again." It says this when it finds a
  different submission made since for the same community entry (anyone's, for
  any edition, or yours edited since), or can't tell whether yours went through.
  Look for the issue first; if yours isn't there, suggest them again. Once the
  Bridge has read GitHub's list back to the interrupted try it says this once
  and then files on the next suggestion, and a day after the interrupted try,
  suggesting them again usually files them even when it can't tell (the
  community spots a duplicate).
- "The Bridge isn't signed in to GitHub: sign in on the Bridge's Accounts tab,
  then suggest the corrections again."
- "The Bridge's GitHub sign-in couldn't be refreshed because GitHub couldn't be
  reached: suggest the corrections again once it can." The sign-in usually
  stands: wait until GitHub can be reached, and sign in again only if the
  Bridge's Accounts tab then says **Sign in again**.
- "GitHub refused the Bridge's sign-in: sign in again on the Bridge's Accounts
  tab, then suggest the corrections again."
- "GitHub's rate limit for the Bridge's sign-in is reached: suggest the
  corrections again later."
- "could not file the corrections: ..." with GitHub's reason: GitHub refused the
  submission, so nothing was filed and suggesting them again is safe.

## When the Contributions module is off

Sharing and corrections belong to the [Contributions module](server.md#modules).
While it is off (it starts off):

- the console offers no **Share with the community**, no **Suggest corrections**
  and no **Also contribute to the community** switch when generating;
- a share, a corrections job or a generate job set to contribute that is already
  queued stays **Queued**: the Bridge isn't given it until the module is on again
  (though a waiting share is cancelled if the book's characters and recaps are
  generated again). One the Bridge is already working on carries on;
- such a job still shows on the book's page, with **Cancel**.

Characters and recaps generated with the module off stay on this server; you can
share them later with [Share with the community](#share-with-the-community).

## Workers

The **Workers** card lists the [ASR workers](../getting-started/running-a-worker.md)
the Bridge reports: computers that transcribe audio for it, such as a Mac with Apple
Silicon. Each shows its name, its platform and speech recognition (for example
*darwin/arm64, mlx-whisper (metal)*), its version and when the Bridge last heard
from it. A worker that never connected isn't listed. Workers are added and removed
on the Bridge's own page, not here.

## Unpairing

At the foot of the page, **Unpair...** disconnects the Bridge from this server:

- The Bridge stops working at its next call. A job it was running is queued again
  after about two minutes.
- Its jobs stay. Queued ones wait for the next Bridge you connect.
- To use it again, connect it with a new code.

Unpairing here is what counts: unpairing from the Bridge's own page only makes the
Bridge forget the server, so unpair it here too.

## Where to next

- [Generating characters and recaps](generating-characters-and-recaps.md) - the
  job the Bridge is for.
- [Running a Bridge](../getting-started/running-a-bridge.md) - setting one up beside
  your server.
- [Server settings, updates and logs](server.md) - the other settings topics and the
  audit log, which records pairing, unpairing and each job you queue or cancel.
