---
title: "Contribute from your server"
description: "Send your Bridge's characters and recaps, and your corrections to book details, to the community metadata database."
---

Every AudioSilo server reads the same free community database, which you can
browse on [AudioSilo Meta](meta-site.md). With a [Bridge](../admin/bridge.md),
your server can send it two things:

- **Characters and recaps** your Bridge
  [generated](../admin/generating-characters-and-recaps.md) for a book the
  community database doesn't cover yet;
- **Corrections** you made to a matched book's details, such as a misspelt
  title or the wrong narrator.

Nothing is sent unless you ask. Only admins can contribute, from the console.

## What you need

1. A [Bridge](../getting-started/running-a-bridge.md) paired with your server
   and online.
2. The Bridge **signed in to GitHub** on its Accounts tab (see
   [Bridge accounts](../getting-started/bridge-accounts.md#github)). What you
   send is filed under your GitHub account, so others can see who sent it.
3. The **Contributions** [module](../admin/server.md#modules) turned on in
   **Server > Settings > Modules**, and
   [community metadata](../admin/server.md#community-metadata) on.

## Sharing characters and recaps

Both ways are on the book's page in the console. The book must be matched to the
community database.

- **When generating** - leave **Also contribute to the community** on in the
  **Generate characters and recaps** dialog. See
  [Keeping them local, or contributing them](../admin/generating-characters-and-recaps.md#keeping-them-local-or-contributing-them).
- **Later** - press **Share with the community** on the book's **Community
  metadata** card. Nothing is generated again. See
  [Share with the community](../admin/bridge.md#share-with-the-community).

What the community database already has is never sent again. Characters and
recaps are shared under the **CC BY-SA 4.0** licence.

## Suggesting corrections

When you edit a matched book and your values differ from the community
database, the book's **Community metadata** card offers **Suggest corrections**. Pick which
edits to send and say where the right values come from. See
[Suggest corrections](../admin/bridge.md#suggest-corrections).

Corrections are facts, released into the public domain (**CC0**).

## What happens next

Each submission becomes an issue on GitHub. A bot on AudioSilo Meta checks it
and opens a proposed change with what it can apply by itself.

For corrections, the **Suggest corrections** dialog marks each field:

- **Applied automatically**, such as a changed title. The bot writes it into
  the proposed change.
- **Reviewed by a maintainer**, such as authors, narrators and series. These
  stay on the issue for a maintainer to apply.

**Every change is reviewed before it is merged.** An automated AI check reads
each proposed change first. Then a maintainer approves it, either in person or
through an automated reviewer that acts for them. After that, the next release
of the database carries it to every server.

The book's page in the console links to each issue. Follow the link to see
whether it has been reviewed.

## What is sent

- **Characters and recaps** - what the Bridge generated, and which book and
  edition they belong to.
- **Corrections** - the fields you ticked, the community database's value and
  yours, your evidence, and your server's version.
- Your GitHub user name, which shows on the issue.

Nothing about your listeners, your library or your other books is sent. The
short description a Bridge writes for a book always stays on your server.

## Good to know

- While the Contributions module is off, the console offers none of these
  actions. Queued work waits until it is on again (see
  [When the Contributions module is off](../admin/bridge.md#when-the-contributions-module-is-off)).
- Some submissions wait for a maintainer instead of going straight to the bot:
  from a GitHub account younger than 30 days, or one with many open submissions.
  They are labelled **intake:held**. Nothing is lost, and there is nothing for
  you to do.
- Gave the Bridge a GitHub token of your own instead of signing in? Then your
  issues wait for a maintainer to pass them on. The exception is an account
  with write access to the repository (see
  [Settings that take precedence](../getting-started/bridge-accounts.md#settings-that-take-precedence)).
