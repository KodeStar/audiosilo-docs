---
title: The companion
description: "The full player's companion: Who's who and Story so far, kept to what you've heard so far, the New in Who's who note when you meet someone, the Text tab that follows the narration in the ebook, and the chapters, bookmarks, notes and history of the book you're playing."
---

The **companion** keeps everything about the book you're listening to one tap away, without leaving the player:

- **Who's who** - the people you've met so far.
- **Story so far** - what's happened up to where you are.
- **Text** - the ebook, following the narration, for a book with a read-along.
- **Chapters** - every chapter, and how long until each one.
- **Bookmarks**, **Notes** and **History** - your own, for the book.

## Where it is

![The full player on a computer, with the companion column on the right](/img/screenshots/web-player/player.png)

A column beside the [full player](full-player.md#on-a-phone-a-tablet-and-a-computer) on a computer, under its controls on a tablet, and a sheet from the chips under the controls on a phone. It reopens on the tab you used last.

The **Text** tab is [below](#text). Who's who and Story so far come from the community database, [AudioSilo Meta](../community/meta-site.md), so they appear only when your server has community metadata switched on. For a book nobody has written character notes or recaps for yet, the tab says so. Your server's [Bridge](../admin/generating-characters-and-recaps.md) can also write them for a book: those carry a **Generated on this server** mark, and for an admin the empty tabs offer **Generate characters and recaps**.

## Nothing ahead of where you are

Who's who and Story so far follow the book page's [spoiler rule](recaps-and-characters.md#nothing-gets-spoiled-before-you-reach-it): they follow **where you are as you listen**, moving on with you chapter by chapter, and **Show anyway** reveals what's held back in both tabs at once. Here it stays revealed for that book when you close and reopen the player, until you reveal another book (which starts hidden) or restart the app.

## Who's who

The people you've met, the most recently met first, as the same cards as on the book's page: an initial, the name, other names they go by, when they first appear (*"From chapter 7"*) and their role. A character's description is written for the whole book and can give away later events, so it stays closed until you **tap the card**.

### Meeting someone new

When the book plays on into a chapter that brings in people you hadn't met, they appear at the top of Who's who marked **Just met**, and a note says so wherever you are in the app: *"New in Who's who: Teft, Rock"*. Tap **Show** to open the player on Who's who. Jumping ahead, skipping or picking the book up again never brings it up, and nobody is announced twice in one listening session.

## Story so far

The community recaps written to stop where you are, in story order, under a heading such as *"Up to chapter 22"*. A new part appears as you finish each chapter. A recap from before the book starts (a catch-up from earlier in the series) is labelled as such, and a whole-book summary stays behind a row marked **Spoiler** while you're still listening.

## Text

For a book with a **read-along** (your server's [Bridge](../admin/making-read-along.md) lined its ebook up with the narration), the **Text** tab shows the ebook following what you hear: it opens at the sentence being read, highlights it, and turns the pages by itself as the book plays on.

![The full player on a computer with the companion on its Text tab, following the narration of The Call of the Wild](/img/screenshots/web-player/player-text.png)

- **Tap a sentence** to move the audiobook to the start of it (it plays on from there if it's playing).
- **Turn the page** (the edges of the text, or a swipe) to look back or ahead: the tab stops following, and a **Back to narration** button takes you back to the sentence being read.
- Pausing, skipping and changing the speed in the player move the highlight with it.

On a computer the tab is in the companion column; on a tablet it sits under the controls with the other tabs. On a phone, the **Text** chip under the player's actions opens the companion sheet straight on it (the chip is there whenever the book has a Text tab).

![The player on a phone with a Text chip among the companion chips](/img/screenshots/web-player/phone-player-text-chip.png)

![The companion sheet on a phone, on its Text tab](/img/screenshots/web-player/phone-player-text.png)

While the text has turned away from the narration, the **Back to narration** button sits below the page, so it never covers the last line.

The companion only shows **Text** when you've picked it (it starts on another tab otherwise), since it opens the ebook. It doesn't save your reading place: that's for the full-screen reader ([Reading the ebook](reading-the-ebook.md#follow-the-narration), which can follow the narration too). It needs the book's server on version 2.6.0 or later and, on a phone or tablet, version 2.6.0 or later of the app.

The tab appears only once the book's read-along has loaded. A book without one, or whose read-along is out of date (its ebook or audio files changed since it was made), has no Text tab. If the read-along can't load, the tab says why:

| It says | What happened, and what to do |
|---|---|
| **Couldn't load the text** with **Try again** | The connection dropped, or the server didn't answer. Try again once you're back online. |
| **Sign in again to *your server*** with **Reconnect** (or **Couldn't load the text**, asking you to sign in to the server again) | This device's sign-in to the server has ended. Sign in again, and the text loads. |
| **This read-along isn't yours to open** | The server no longer shares this book with you. Ask the person who runs it. |
| **This book isn't on the server any more** | It may have moved or been removed. Open it from the library again. |
| **The read-along is for a newer ebook** | Only for a [downloaded](offline-downloads.md) book: the ebook on the server was replaced after you downloaded the book, and the read-along was made from the new one, so it doesn't line up with the ebook on your device. Remove the download and download the book again. |

Only the first can be mended by trying again, so only it has a button. If the read-along doesn't match this ebook at all, the tab says **The text can't follow this narration**. A [downloaded](offline-downloads.md) book keeps its read-along with its ebook, so the Text tab works offline too. In the web player, a book that isn't downloaded has no Text tab while you're offline (it comes back with the connection).

### Making one (admins)

For an admin, with a [Bridge](../admin/bridge.md) that can make read-alongs, every book with an ebook has the **Text** tab. Where there is nothing to follow yet, or the read-along is out of date, the tab offers to make it: see [Making a read-along from the player](../admin/making-read-along.md#from-the-player).

## Chapters

Every chapter, with how much of the one you're in is left; earlier ones ticked, later ones with how long until they start (*"in 2h 4m"*, at your speed). In the column on a computer and the sheet on a phone, the list opens on the chapter you're in. A book without chapter marks lists its files as chapters, or the virtual chapters of one long file; while a book's file lengths aren't known yet, it lists the files without times. Tap one to jump to it.

## Bookmarks, notes and history

The same lists as on the book's page, for the book that's playing, all saved to your account:

- **Bookmarks** - **Bookmark 1:16:19** marks where you are (so does the bookmark button among the player's actions); tap a bookmark's time to jump to it.
- **Notes** - **Note at 1:16:19** pins a note to where you are; tap a note's time to jump to it.
- **History** - your listening sessions, newest first; **Jump** goes back to where one ended.

Editing, labels and deleting with Undo work as on the book's page: see [Bookmarks and notes](bookmarks-and-notes.md). **See all in your journal** opens the [Journal](journal.md).

A jump from these lists can be [undone](full-player.md#undo-a-jump). They need the book's server: if it isn't connected any more (a downloaded copy playing on), they say *"This book's server isn't connected"* until it is.

## Who wrote it

Under Who's who and Story so far, a line credits the contributors (*"Community notes from"* them) and links the open licence they share under, which asks for that credit wherever the notes appear.
