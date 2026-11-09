---
title: "Limit what someone can see"
description: "Use shares to choose which folders each person can see: a whole library, an author, a series or a single book."
---

A **share** limits what someone can see to the folders you choose: a whole
library, an author, a series or a single book. Give someone a share and they
see only those books. You build shares in **People > Shares** in the
[admin console](console-tour.md), as an admin.

To give someone a whole library, you don't need a share: pick the library when
you [invite them](users-and-invites.md#inviting-someone), or use **Give
access** on their [Access tab](users-and-invites.md#access).

![The Shares page](/img/screenshots/admin/shares.png)

## How access works

- **Someone you invite sees nothing until you give them something.** The invite
  dialog asks what they can listen to.
- **Admins see everything.** Shares never limit an admin.
- **Shares add up.** Someone with two shares sees everything either one covers.
- **Sharing a folder shares everything under it**, including books you add there
  later.
- **Access is read-only.** A share lets someone listen, never change or delete
  your files.

A [household member](users-and-invites.md#household-members) also gets what the
person who added them chooses.

## Creating a share

1. Click **New share**.
2. Give it a name, like `Kids`, and click **Create share**.
3. Click **Add a folder**, pick the **Library**, and open folders until you find
   the one you want.
4. Click **Add this folder** (or **Add** next to a folder or book).
5. Under **People with this share**, click **Add person** for each person.

You can also add books from **Library > Books**: select them and choose **Add to
share**, or use **Add to a share** on a book's page (see
[Books and metadata](books.md#changing-many-books-at-once)).

Changes take effect straight away. Remove a folder or person with the **✕**
beside it. The share's **⋯** menu has **Rename** and **Delete share**.
Deleting a share touches no files, and people's progress is kept.

## What the listener sees

A share filters the person's whole view of the server, and the server checks
every play, cover and download against it.

- Browsing shows only their shared folders. Folders above a shared folder stay
  visible so they can find it, but show nothing else.
- Search and book lists only show books they can see.
- If their folders are all in one library, they see only that library.

## Examples

**A kids' share.** Make a share called `Kids`. Add the author folders that suit
them, say `Roald Dahl` and `Terry Pratchett`. Add each child's account. New books
you add under those folders appear for them automatically.

**One series for a friend.** Make a share called `Expanse for Sam` and add the
series folder. Then [invite them](users-and-invites.md#inviting-someone) and
choose that share under **What can they listen to?**.

:::tip
Name shares after who they are for (`Kids`, `Book club`) rather than what is in
them. The folders will change; the purpose won't.
:::

## Good to know

- Whole-library access appears under **Whole libraries** on the Shares page.
  Change who has it from each person's [Access tab](users-and-invites.md#access).
- Share a book by its own folder (or file), not a folder inside it. A share
  holding only one disc folder, or one file of a multi-file book, doesn't give
  access to the book (see
  [Books split into disc folders](libraries.md#books-split-into-disc-folders)).
