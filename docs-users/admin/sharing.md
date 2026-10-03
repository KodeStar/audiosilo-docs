---
title: "Sharing"
description: "How AudioSilo access control works: shares as named sets of folders, whole-library access, building shares in the admin console, and what a person with a share actually sees."
---

AudioSilo's access control answers one question: **which folders can this
person see?** The mechanism is the **share** - a named set of folders that you
give to people. **People > Shares** in the [admin console](console-tour.md) is
where you build them.

![The Shares page](/img/screenshots/admin/shares.png)

## How access works

The rules are short:

- **A new person sees nothing until you give them something.** There is no
  default library. The [Invite someone](users-and-invites.md#inviting-someone)
  dialog asks what they can listen to, so nobody has to start empty-handed.
- **Admins see everything.** Shares never restrict an admin account.
- **Access is the union of a person's shares.** Give someone two shares and
  they see everything either one covers.
- All access over the network is **read-only** - a share lets someone listen,
  never change or delete your files.

A share's folders can sit at any level of a library's folder tree:

- the **whole library**,
- an **author's folder**,
- a **series folder**,
- or a **single book**.

Sharing a folder shares everything underneath it, including books you add there
later - share an author's folder once, and every book you drop into it is
automatically included.

## Whole-library access

Giving someone an entire library is the most common case, so it has a shortcut:
pick the library in the **Invite someone** dialog, or with **Give access** on
the person's [Access tab](users-and-invites.md#access). Behind the scenes this
creates (and then reuses) a share for that library containing the whole
library, so there is exactly one system, not two.

The Shares page lists these separately, under **Whole libraries**, each named
after its library: "Made when you give someone a whole library. Change who has
it from each person's page." They are read-only there - no renaming, deleting,
folders or people buttons. To give or take away a whole library, use **Give
access** and **Remove** on the person's [Access tab](users-and-invites.md#access).
Deleting a library removes its whole-library access too.

A share *you* make stays an ordinary share even if you fill it with a whole
library: you can still rename it, delete it, and change its folders and people.

## What the listener sees

A share doesn't just hide play buttons - it filters the person's entire view of
the server:

- **Browsing** shows only their shared folders. The folders *above* a shared
  folder stay visible so they can navigate down to it, but those folders contain
  nothing else. Someone with only `Brandon Sanderson/Mistborn` sees a
  `Brandon Sanderson` folder with just `Mistborn` inside.
- **Search, book lists and "recently added"** only return books they can see.
- Someone with folders in only one library sees only that library.
- Every play, cover and download request is checked against their access on the
  server - the filtering isn't cosmetic.

Changing a share takes effect immediately: add a folder and everyone with that
share sees the new content; remove a folder (or take the share away) and it
disappears from their apps the next time they refresh.

## Creating a share

Click **New share** and give it a name (the dialog suggests `e.g. Kids`): "Name
it after what's in it. You add folders and people next." Click **Create share**
and the new share opens, ready to fill.

The list on the left shows each share with how many folders and people it has.
Click one to see it on the right, in two parts.

### Folders in this share

Each folder is shown as `Library › folder/path` (or the library's name with
"whole library"). Remove one with the **✕** beside it.

**Add a folder** opens a picker that browses the library as the player sees it:

1. Pick the **Library** (when you have more than one).
2. Click folders to open them.
3. Click **Add the whole library** at the top level, **Add this folder** for the
   folder you're in, or **Add** next to any folder or book in the list. Anything
   already in the share says **Already in**.

You never type paths by hand, so there's nothing to mistype.

### People with this share

Everyone who has the share, each with a **✕** to take it away, and **Add
person** to give it to someone else. (Admins aren't offered: they see everything
already. Whole-library entries list their people without these buttons.) You can also give and remove shares from a person's
[Access tab](users-and-invites.md#access).

One share can go to any number of people, which is what makes it a good unit:
fix the share once and everyone who has it follows.

### Renaming and deleting

The share's **⋯** menu has **Rename** and **Delete share**. Deleting asks first
and says how many people lose access to its books, "unless another share covers
them. No files are touched." Their progress is kept, so giving them access again
later picks up where they left off.

## Practical examples

**A kids' share.** Click **New share** and name it `Kids`. **Add a folder** for
each set of books that's appropriate - say the `Roald Dahl` and
`Terry Pratchett` author folders in your Fiction library. Then **Add person**
for each child's account. Their apps show only those authors; new books you add
under either folder appear for them automatically, and anything else in the
library simply doesn't exist for them.

**Sharing one series with a friend.** Your friend wants *The Expanse* and
nothing else. Create a share named `Expanse for Sam`, open the series folder in
**Add a folder** and click **Add this folder**. Then
[invite them](users-and-invites.md#inviting-someone) and choose `Expanse for
Sam` under **What can they listen to?**. They'll see a library containing
exactly one series - and if you later decide to share more, just add folders to
their share.

:::tip
Name shares after the *audience or purpose* (`Kids`, `Book club`,
`Expanse for Sam`) rather than the content. The folders inside will change over
time; a purpose-named share stays meaningful.
:::
