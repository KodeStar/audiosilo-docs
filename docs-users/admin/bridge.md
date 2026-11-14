---
title: "Manage the Bridge"
description: "Pair a Bridge with your server, check its setup and libraries, follow its jobs and share its work with the community, from Server > Settings > Bridge."
---

The **Bridge** is an optional companion that writes to your library folders and
runs the heavy jobs, so the server can stay read-only. This page covers the
console side: **Server > Settings > Bridge**, which only admins see. To install
one, see [Add a Bridge](../getting-started/running-a-bridge.md).

![Server > Settings > Bridge before a Bridge is connected](/img/screenshots/admin/settings-bridge.png)

With no Bridge paired, the page shows a compose snippet for your server, with one
volume line for each of your libraries. Press **Copy snippet** to use it.

## Connecting a Bridge

Press **Connect a Bridge** for a pairing code, then paste it on the Bridge's own
page. The steps are in [Pair it with your server](../getting-started/running-a-bridge.md#4-pair-it-with-your-server).

![The Connect a Bridge dialog with a pairing code](/img/screenshots/admin/bridge-pair.png)

If the code runs out, press **Make a new code**.

You can pair **one Bridge per server**. **Pair a new Bridge** makes a code for a
replacement. The old Bridge stops once the new one pairs.

## Online, offline and its details

Once paired, the Bridge reports every 30 seconds. The top card says **Online**,
or **Offline** when it hasn't reported for two minutes. Anything you ask it to do
while it is offline waits for it.

The card also shows its version, when it was paired and by whom, and its AI agent:

- **Agent**: the tool the agent runs (`claude` or `codex`) and whether it is
  **Ready**.
- **Paid by**: a **Subscription** or an **API key**.
- **This month**: what the agent has cost against the monthly cap.

**Open its page** opens the Bridge's own page.

If the Bridge was unpaired, replaced, or the admin who paired it is no longer an
admin, the Bridge stops and says why on its own page. Pair it again with a new
code.

![Server > Settings > Bridge with a Bridge connected](/img/screenshots/admin/settings-bridge-paired.png)

## The setup card

The **Get set up** card shows the Bridge's setup checklist, the same as on its own
page. Each step shows a tick when done. A step still to do has **Fix on the
Bridge**, which opens the right tab of the Bridge's page.

![The Setup card on Server > Settings > Bridge](/img/screenshots/admin/bridge-setup.png)

| Step | Done when |
|---|---|
| **Paired with this server** | the Bridge is paired |
| **Libraries mapped and writable** | the Bridge can find and write to every library |
| **Speech recognition ready** | the Bridge or a [worker](../getting-started/running-a-worker.md) can transcribe now |
| **Agent credential set** (Optional) | the agent is ready. Only characters, recaps and descriptions need it |
| **Monthly budget reviewed** | someone saved the monthly budget on the Bridge's page |
| **GitHub signed in** (Optional) | the Bridge can share with the community |
| **Audible signed in** (Optional) | at least one Audible account is signed in and working |

Under the steps, the card lists the Bridge's GitHub account, agent credential and
whether it is ready to contribute. You sign in to these on the Bridge's own page.
**Open Accounts on the Bridge** takes you there (see
[Sign the Bridge in to your accounts](../getting-started/bridge-accounts.md)).

## Libraries

The **Libraries** card lists every library with what the Bridge found:

| Status | Means |
|---|---|
| **Ready** | the Bridge found the library and can write there |
| **Can't write** | the Bridge can only read it |
| **Not found** | the Bridge couldn't find it |
| **Not reported yet** | the Bridge hasn't checked it yet |

The Bridge checks a library by finding a book the server knows and comparing its
files, then writing a small test file. A library must be **Ready** before the
Bridge can save anything for its books.

When a library isn't ready, the line under it says why. Usually:

- **The folder isn't mounted** in the Bridge's container, or is at another path.
  Mount it at the same path as the server, or set its folder on the Bridge's page.
- **It's a different copy.** The files don't match the server's.
- **A books library has no books yet.** The Bridge checks again once the server
  has indexed one. (A podcast library can be ready while empty.)
- **Can't write.** Mount the folder read-write and set the Bridge's `PUID`/`PGID`
  to the owner of your library folders.

The Bridge checks its libraries every 10 minutes. **Check now** on its own page
checks them at once.

## Audible accounts

While the [Audible module](server.md#modules) is on, an **Audible accounts** card
sits under Libraries. See
[Back up your Audible books](audible.md#the-audible-accounts-card).

## Verify

**Verify** on a books library asks the Bridge to check it end to end, as a job you
can follow. It compares a book's files with the server's and tries writing a test
file. **Nothing is changed.** Use it to check that a Bridge is set up
properly.

## Jobs

The **Jobs** card lists what the Bridge was asked to do, newest first: characters
and recaps, descriptions, chapters, read-alongs, community shares, corrections,
podcast downloads, Audible backups and books added from LibriVox. **Show jobs**
filters it by state.

Each job shows its book, its progress, who asked and when. Jobs the server queues
itself say **Scheduled by the server**. When a job is done, it says what it made.
A failed or cancelled job keeps its **Last step**, so you can see where it
stopped.

A job that **Needs attention** says why, with **Open in the Bridge**. There,
**Retry** sends it on once you've fixed the cause. See
[When a job pauses](generating-characters-and-recaps.md#when-a-job-pauses).

**Cancel** stops a job. If the Bridge stops in the middle of a job, the server
queues it again after about two minutes. A job that keeps failing this way fails
after the third try.

## Share with the community

When characters and recaps were kept on this server, you can still send them to
the community database later. The book's **Community metadata** card
then offers **Share with the community**.

It needs the [Contributions module](server.md#modules) on, and the Bridge online
and [signed in to GitHub](../getting-started/bridge-accounts.md#github).

Press **Share with the community**. The Bridge sends what it wrote before. It
generates nothing again, so the agent costs nothing. Each part the community
database still lacks becomes a submission for review. Once done, the card links
to each one.

## Suggest corrections

When you [edit a matched book's details](books.md#editing-details) and your values
differ from the community database, you can suggest them as corrections. The book's
**Community metadata** card then offers **Suggest corrections**.

It needs the Contributions module and community metadata on, the Bridge online
and signed in to GitHub, and the book matched with an ASIN or ISBN. Only your own
edits are sent, never values from the files or a match.

1. Save or discard unsaved edits on the page.
2. Press **Suggest corrections**. The dialog lists each field you changed, with
   the community database's value and then yours.
3. Untick any you don't want to send.
4. Under **Evidence**, say where the right values come from, such as a store or
   publisher page.
5. Press **Suggest N corrections** to send them.

The Bridge files them as one submission under its GitHub account, and the card
links to it. A bot on AudioSilo Meta writes the fields marked **Applied
automatically**, such as a changed title, into a proposed change. A maintainer
applies the fields marked **Reviewed by a maintainer**, such as authors,
narrators and series. Every change is reviewed before it is merged (see
[What happens next](../community/contributing-from-your-server.md#what-happens-next)).

If a share or a correction stops part way, its message says what to do. The Bridge
makes sure the same submission isn't filed twice.

## When the Contributions module is off

Sharing and corrections belong to the [Contributions module](server.md#modules),
which starts off. While it is off, the console offers no sharing or corrections.
Jobs already queued wait until the module is on again. Characters and recaps
generated meanwhile stay on this server, and you can
[share them later](#share-with-the-community).

## Workers

The **Workers** card lists the [workers](../getting-started/running-a-worker.md)
that transcribe for the Bridge, with their platform, version and when they were
last heard from. You add and remove workers on the Bridge's own page.

## Unpairing

**Unpair...**, at the foot of the page, disconnects the Bridge. It stops at its
next call. Its jobs stay, and queued ones wait for the next Bridge you pair.

Unpair here, in the console. Unpairing on the Bridge's own page only makes the
Bridge forget the server.
