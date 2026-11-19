---
title: Finish a book
description: "What happens when a book ends: the end credits, which book plays next, playing on automatically, and marking a book finished yourself."
---

When a book reaches its end, AudioSilo marks it finished and shows the **end credits**. From there you can rate the book and start the next one. The next book comes from your [Up next](up-next.md) queue, or else the series.

## The end credits

![The end credits on a computer: the book, how it was listened to, and the Up next card](/img/screenshots/web-player/end-credits.png)

The finished book leaves *Continue listening* and Up next. The end credits show:

- **Your year's shelf**: the books you've finished this year, with this one at the end.
- **How you listened**: your speed, and the time you spent listening across how many days.
- **How was it?**: one to five stars, if your server keeps ratings.
- **Up next**: the book that plays next and why, such as *"from your queue"* or the next book in the series. **Play now** starts it.
- **View details**: the finished book's page.

**Credits** at the top right lists who made the book, with the same publisher and release date as the book page. The **X** closes the screen.

You can also open the end credits early, from the full player's [three-dot menu](full-player.md#the-three-dot-menu). This is handy for skipping long spoken credits. The book keeps playing until it really ends. If you tap **Play now** there, the book you were in keeps your place and stays unfinished.

A [podcast episode](podcasts.md#when-an-episode-ends) doesn't show end credits.

## What plays next

AudioSilo picks the next book the same way everywhere:

1. The **first book in your [Up next](up-next.md) queue**, skipping any you've finished.
2. Otherwise, the **next book in the series**. Your server uses the reading order from the community database, then the series numbers, then the next book in the same folder.

A book in more than one series follows its main series first, then its others. After an omnibus of books 1-3, the next book is book 4.

When your server holds the next book in more than one recording, such as two narrators, AudioSilo picks one: the recording read by the same narrator as the book you just finished, else one you've started, else one in the same library, else an unabridged one. The others are on that book's page (see [More than one recording of a book](book-page.md#more-than-one-recording-of-a-book)). This needs community metadata switched on.

If the server is still scanning a series folder, the next book's folder plays even before it's scanned.

If nothing comes next, the card says **End of the series**. If the community database has a next book that your server doesn't have, it shows as a pale cover with **View on AudioSilo Meta**. AudioSilo never tries to play a book you don't have, and skips any gap in the series.

## Playing on automatically

Turn on **Automatically play next book** in [Settings](settings.md#up-next-and-downloads). It's the same switch as **Play the next book automatically** in Up next.

- After a book finishes, a ring counts down **15 seconds**, then the next book starts. **Not now** stops it.
- **A sleep timer stops it.** If a book ends while a [sleep timer](sleep-timer.md) is running, nothing starts by itself.
- If the app is in the background when a book ends, there's no countdown. With auto-play on, the next book starts straight away.

Two related settings are **Automatic downloads** and **Remove a download when you finish the book**, in [Settings](settings.md#up-next-and-downloads).

## Mark a book finished yourself

To finish a book without listening to the end, open its **...** menu, on its cover in a list or on its page, and select **Mark as finished**. If the book is playing, it stops first and keeps your place.

A message says **Marked as finished**, with **Undo**. **Undo** puts the book back at the place you were at.

To take a finish back later, select **Mark as not finished** in the same menu. Its message has **Undo** too.

### Good to know

- **Offline**, Mark as finished waits on your device and reaches your server once it's back. While it waits, **Undo** and **Mark as not finished** work offline too.
- **Once the finish may have reached your server**, taking it back needs the server. If it can't be reached, the book stays finished and the message says so. Press **Retry** once the server is back.
- **A slow server** shows **Marking as finished...** until it answers. If marking fails, the book loads again where you left it, paused.
- **Undo** needs a recent server. On an older one the message has no Undo.
