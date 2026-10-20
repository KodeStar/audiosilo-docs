---
title: Contributing from your server
description: "Send what your server knows back to the community metadata database: the characters and recaps your Bridge generates, and your corrections to a book's details. What you need (a Bridge signed in to GitHub, the Contributions module), what is sent and under which licence, how it is reviewed, which corrections apply by themselves, and the limits that hold a submission for a maintainer."
---

## Contributing from your server

Every AudioSilo server reads the same free
[community metadata database](meta-site.md). With a [Bridge](../admin/bridge.md),
your server can give back to it, so every other server gets what yours already
knows:

- **Characters and recaps** your Bridge
  [generated](../admin/generating-characters-and-recaps.md) for a book the
  community hadn't covered;
- **Corrections** you made to a matched book's details (a misspelt title, the
  wrong narrator, a missing ISBN).

Nothing is ever sent unless you ask. The short description a Bridge writes for a
book always stays on your server.

### What you need

1. A [Bridge](../getting-started/running-a-bridge.md) paired with your server and
   online.
2. The Bridge **signed in to GitHub**, on its Accounts tab (see
   [Bridge accounts](../getting-started/bridge-accounts.md#github)). What you send
   is filed under your GitHub account, so other people can see who sent it.
3. The **Contributions** [module](../admin/server.md#modules) turned on, in
   **Server > Settings > Modules**, and
   [community metadata](../admin/server.md#community-metadata) on.

While the module is off, the console offers none of the actions below. One you
queued earlier waits, untouched, until the module is on again (see
[When the Contributions module is off](../admin/bridge.md#when-the-contributions-module-is-off)).

### Sharing characters and recaps

Two ways, both on the book's page in the console:

- **When generating.** The **Generate characters and recaps** dialog has **Also
  contribute to the community**, switched on by default while you can contribute.
  Once the characters and recaps are written, the Bridge sends them as well as
  saving them on your server. See
  [Keeping them local, or contributing them](../admin/generating-characters-and-recaps.md#keeping-them-local-or-contributing-them).
- **Later.** For a book generated with the results kept on your server, the
  book's **Community metadata** card offers **Share with the community**. The
  Bridge sends what it already generated: nothing is generated again, and nothing
  is spent on the agent. See
  [Share with the community](../admin/bridge.md#share-with-the-community).

The book needs an entry in the community database (a match). Characters and
recaps the community already has are never sent again, and the result says so.

Characters and recaps are shared under the **CC BY-SA 4.0** licence, like the rest
of the community's characters and recaps, which credit the people who wrote them.

### Suggesting corrections

When you edit a matched book's details and your values differ from the community's,
the book's **Community metadata** card offers **Suggest corrections**. You pick
which of your edits to send and say where the right values come from; the Bridge
files them together, for review. See
[Suggest corrections](../admin/bridge.md#suggest-corrections) for the dialog and
which fields apply by themselves.

Corrections are facts, released into the public domain (**CC0**), like the rest of
the community's book details.

### What happens next

Each submission becomes an **issue** on GitHub, in the community repositories
([audiosilo-meta](https://github.com/KodeStar/audiosilo-meta) for corrections and
new books, [audiosilo-meta-community](https://github.com/KodeStar/audiosilo-meta-community)
for characters and recaps). The community's intake bot reads it, checks it like
any other submission and opens a pull request. **A maintainer reviews every pull
request** before it is merged. Once it is merged, the next release of the database
carries it, and every server gets it.

The book's page in the console links the issue ("See the issue"). Whether it has
been reviewed or merged isn't shown there yet: follow the link to see.

### Limits that hold a submission

To keep the review queue fair, a few things hold a submission for a maintainer
instead of sending it on to the intake bot:

- a GitHub account **younger than 30 days**;
- **more than 25** open submissions from one account on audiosilo-meta (corrections,
  new books), or **more than 50** on audiosilo-meta-community (characters, recaps);
- an account a maintainer has blocked from automatic intake.

A held submission is labelled **intake:held** on GitHub, with a comment saying
why. Nothing is lost and there is nothing to do on your side: a maintainer routes
it by hand, or explains.

### What is sent

- **Characters and recaps**: what the Bridge generated, with the book's community
  entry it belongs to.
- **Corrections**: the book's community entry (and its recording, when the book's
  ASIN or ISBN names one), the fields you ticked with the community's value and
  yours, and your evidence.
- Your GitHub user name, which shows on the issue.

Nothing about your server's listeners, your library or your other books is sent.
