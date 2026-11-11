---
title: Use the player's companion
description: See who's who, the story so far, the ebook text and your bookmarks beside the book you're listening to.
---

The companion is a set of tabs about the book you're playing, inside the [full player](full-player.md):

- **Who's who** - the people you've met so far.
- **Story so far** - what's happened up to where you are.
- **Text** - the ebook following the narration, for a book with a read-along.
- **Chapters**, **Bookmarks**, **Notes** and **History**.

![The full player on a computer, with the companion column on the right](/img/screenshots/web-player/player.png)

On a computer it's a column beside the player. On a tablet it's under the controls. On a phone, the chips under the controls open it as a sheet. It reopens on the tab you used last.

## Who's who and Story so far

These come from the community database, [AudioSilo Meta](../community/meta-site.md), so your server needs community metadata switched on. Your server's Bridge can also write them, marked **Generated on this server** (see [Generate characters and recaps](../admin/generating-characters-and-recaps.md)).

Both tabs only show what you've heard. They follow [where you are as you listen](recaps-and-characters.md#nothing-gets-spoiled-before-you-reach-it), moving on chapter by chapter. **Show anyway** reveals what's held back.

- **Who's who** lists the people you've met, most recent first. Tap a card to read about the character. Descriptions stay closed because they can give away later events.
- **Story so far** shows the recaps up to where you are. A whole-book summary stays behind a **Spoiler** row until you finish.

When the book reaches someone new, a message tells you, such as *"New in Who's who: Teft, Rock"*. Tap **Show** to open Who's who.

A line under both tabs credits the people who wrote them.

## Text

For a book with a **read-along**, the **Text** tab shows the ebook following what you hear. It highlights the sentence being read and turns the pages by itself. An admin makes a book's read-along with a Bridge (see [Make a read-along](../admin/making-read-along.md)).

![The companion on its Text tab, following the narration](/img/screenshots/web-player/player-text.png)

- **Tap a sentence** to move the audiobook to it.
- **Turn the page** yourself to look back or ahead. **Back to narration** takes you back to the sentence being read.
- Pausing, skipping and changing the speed move the highlight too.

On a phone, the **Text** chip under the player's actions opens it.

![The player on a phone with a Text chip](/img/screenshots/web-player/phone-player-text-chip.png)

![The companion sheet on a phone, on its Text tab](/img/screenshots/web-player/phone-player-text.png)

The Text tab doesn't save a reading place. For that, use the [ebook reader](reading-the-ebook.md#follow-the-narration), which can follow the narration too.

Text needs your server on version 2.6.0 or later and, on a phone or tablet, the app on 2.6.0 or later. A book without a read-along has no Text tab. Neither does one whose ebook or audio changed since its read-along was made.

A [downloaded](offline-downloads.md) book keeps its read-along, so Text works offline.

If you're an admin with a [Bridge](../admin/bridge.md) that makes read-alongs, the Text tab offers to make one. See [Making a read-along from the player](../admin/making-read-along.md#from-the-player).

## Chapters

Every chapter, with how long until each one starts at your speed. Tap a chapter to jump to it.

## Bookmarks, notes and history

The same lists as on the [book's page](book-page.md#the-tabs), for the book that's playing:

- **Bookmark** and **Note** buttons mark where you are.
- Tap a bookmark's or note's time to jump there.
- **History** lists your listening sessions. **Jump** goes back to where one ended.

To edit, label or delete them, see [Add bookmarks and notes](bookmarks-and-notes.md). **See all in your journal** opens the [Journal](journal.md). A jump from these lists can be [undone](full-player.md#undo-a-jump).

## Good to know

- If the text can't load, the Text tab says why, usually with **Try again** or **Reconnect**.
- **The read-along is for a newer ebook** means the ebook on the server changed after you downloaded the book. Remove the download and download the book again.
- In the web player, a book that isn't downloaded has no Text tab while you're offline.
- Bookmarks, notes and history need the book's server. If it isn't connected, the lists say so until it is.
