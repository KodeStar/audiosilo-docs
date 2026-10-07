---
title: Playing a book
description: "The full player on a phone, tablet and computer, the mini player and the player bar, the seek bar and timeline, time left, undoing a jump, playback speed, what happens when a book ends, books a browser can't play directly, lock-screen controls, and how your position syncs across devices."
---

Tap **Listen** on any book to start it. On a phone, the full player opens straight away, filling the screen. On a tablet or computer, the book starts playing where you are and the **player bar** along the bottom of the window takes over; open the full player from it whenever you want the big view.

![The full player screen with cover, seek bar, and transport controls](/img/screenshots/web-player/player.png)

## The full player

The full player is about the book you're listening to. Its background takes on the colours of the book's cover, and the cover itself settles back a little while the book is paused.

From top to bottom:

- **The top row** - a **down arrow** to minimise the player (playback carries on), *Playing from* and your server's name, the book's place in its series (*"The Stormlight Archive, book 2"*, or its library), and the [three-dot menu](#the-three-dot-menu).
- **The cover**, then **the chapter title** with the book and author under it. Tap the chapter title to open the chapters (see below for where they open).
- **The status line**: whether your place is saved, how much of the book you've heard, and the [time left](#time-left): *"Synced just now · 38% of the book · 22h 27m left at 1.25×"*. The first part says *Synced* (*Synced just now* while playing), *Saved on this device, will sync* while the book's server can't be reached or saves are waiting to go, or *Saved on this device, sign in again to sync* when that server needs you to sign in again. Right after a big jump, this line turns into the [undo button](#undo-a-jump) for a few seconds, and in a sleep timer's last seconds the [sleep timer's card](sleep-timer.md#the-last-30-seconds-and-how-to-keep-listening) takes its place.
- **The [seek bar](#the-seek-bar-and-the-timeline)** for the current chapter, with its times underneath, and a slim **timeline of the whole book** below it, with your bookmarks and notes marked on it.
- **The transport**: previous chapter, skip back, play/pause, skip forward, next chapter. The skip buttons show how many seconds they jump (15 back and 30 forward out of the box; change them in [Settings](account.md#playback)). If playback fails, the play button becomes **Retry** and a line says your place is saved.
- **The actions**: [speed](#playback-speed), the [sleep timer](sleep-timer.md), **bookmark** (one tap adds a bookmark where you are, and a note confirms it), **output** for [AirPlay or Cast](#play-to-another-speaker-airplay--cast) where your device can use one, and [Up next](up-next.md) with how many books are queued.

Underneath sits the **companion**: Who's who, Story so far, the chapters, your bookmarks, notes and listening history for the book. See [The companion](companion.md).

### On a phone, a tablet, and a computer

The full player arranges itself for the space it has:

- **On a phone** it fills the screen. Under the actions, chips for **Who's who**, **Story so far** (for books the community database knows) and **Chapters** open the companion as a sheet. Tapping the chapter title opens that sheet on its **Chapters** tab, so chapters live in one place.
- **On a tablet** the actions get words beside their icons, and the companion sits under the controls: scroll down to reach it. Tapping the chapter title opens the chapter list as a sheet.
- **On a computer** (or any window wide enough) the companion is a column down the right-hand side, always open. Tapping the chapter title switches it to **Chapters**. Up next isn't among the actions here, because the [Up next drawer](up-next.md#opening-up-next) is already beside the page. On a phone or tablet, **Up next** opens as a sheet over the player.

![The player on a phone](/img/screenshots/web-player/phone-player.png)

In the web player you can also drive all of this from the keyboard - see [Keyboard shortcuts](keyboard-shortcuts.md).

:::tip
If a book's chapters are just named after their audio files, AudioSilo tidies those names for display - dropping the file extension and turning underscores into spaces - so the title line stays readable. Real chapter titles are left exactly as they are.
:::

## The seek bar and the timeline

The seek bar spans the **current chapter**, not the whole book, so even in a 30-hour book a small movement is a small jump. It's drawn as a row of bars: the part you've heard is dark, the rest is pale, and a pink line marks where you are. A small bookmark icon sits above each of your bookmarks in the chapter.

The bars are a pattern, not a picture of the sound: each chapter has its own look, so you can tell chapters apart at a glance, but the height of a bar says nothing about how loud that moment is.

- **Tap** anywhere on the bar to jump there.
- **Drag** to scrub. While you drag, a label shows where you'd land, in the chapter and in the whole book (*"41:12 · 17:26:50 in the book"*). Let go to jump.
- In the web player, pointing at the bar highlights up to that spot and shows the time, with *Click to jump*.

Under the bar: the time into the chapter on the left, how long the rest of the chapter takes and when it ends by the clock in the middle (*"21m left in the chapter · ends 22:01"*, at your current speed), and the chapter's remaining time on the right. A book without chapters is one long stretch, so there the bar spans the **whole book** (*"Position in book"*, *"9h 4m left in the book · ends 07:12"*). For a book whose file lengths aren't known yet, the bar spans the current **file** instead, and the middle line talks about the file.

A drag that starts in one chapter stays in that chapter even if the book plays on into the next while your finger is down.

Below that, the **whole-book timeline** shows every chapter as a segment, sized by its length (very short chapters are grouped together): the chapters you've finished in dark, the one you're in in pink. Small pins above it mark your **bookmarks** and **notes**; tap a pin to jump straight to it. Tap or drag anywhere else on the timeline to jump anywhere in the book. In the web player, pointing at it names the chapter and the time.

Neither scrubber will take you all the way to the very end: a tap or drag there lands **30 seconds short**, so a slip of the finger can't finish the book (and mark it finished) by accident. To finish a book on purpose, use **Mark as Finished** in the menu.

## Time left

Wherever AudioSilo tells you how much of a book is left - the mini player, the player bar, the full player, the home screen, the Library's book list, Up next - it's **real time at the speed you listen to that book**, and it says so:

- *"5h 12m left at 1.25×"* for a book you listen to at 1.25×;
- just *"5h 12m left"* at normal speed.

Each book uses **its own** speed. The book you're playing uses the speed it's playing at right now; any other book uses the speed you last listened to it at, or your **default speed** from [Settings](account.md#playback) if you haven't started it. So a book you race through at 1.5× and one you savour at 1× each show an honest figure.

## Undo a jump

Tapped the wrong chapter, or brushed the scrubber with your thumb? After **any jump of more than a minute** - a tap on the seek bar or the timeline, a chapter skip, a bookmark, even a scrub on the lock screen, your headphones or a car screen - a small dark **Back to 17:26:50** button appears for **10 seconds**, with a ring that empties as the time runs out:

- in the **full player**, in place of the status line under the chapter title;
- on the **player bar** on a tablet or computer, at the start of the buttons on the right.

Tap it and you're back where you were; a note confirms *"Back where you were"*. Ordinary listening, short skips, and starting or resuming a book never bring it up.

## The three-dot menu

The **three-dot (More) menu** at the top right of the full player has:

- **View book details** - jumps to the book's detail page. Playback carries on.
- **Chapters** - opens the chapter list (on a computer, the companion's Chapters tab).
- **View end credits** - opens the [end credits screen](#when-a-book-finishes) early. Handy for a book with a long spoken credits or acknowledgements section you'd rather skip past to see what's next - playback carries on while the screen is open.
- **Mark as Finished** - marks the book finished right now, stops it, and takes you to its end credits screen. Use it when you've heard enough and want the book off your *Continue listening* shelf.
- **Keyboard shortcuts** - in the web player, the list of [keyboard shortcuts](keyboard-shortcuts.md).

## The mini player and the player bar

While a book is playing, a small player stays with you on every screen, so you can pause or skip without opening the full player.

### On a phone

A **mini player** card floats just above the tab bar - in the web player, on Android, and on iPhones before iOS 26. It shows the cover, the current chapter, and the book with its [time left](#time-left) (with a sleep timer running, its countdown comes first, after a small moon), then a **skip back** button and **play/pause**. The play button shows a spinner while the book loads and turns into **Retry** if playback fails. A thin line along the card's bottom edge shows how far you are through the chapter. Tap the cover or the words to open the full player.

On an **iPhone running iOS 26 or later**, the mini player lives inside the tab bar itself, as a glass strip just above the tabs with the same things: a round cover, the chapter, the book with its time left, skip back and play/pause. Scroll down and the tab bar shrinks; the mini player then tucks in beside it, showing just the cover, the chapter and play/pause. Tap it to open the full player.

### On a tablet or computer

A **player bar** runs along the bottom of the window:

- a thin line along its top edge showing your progress through the whole book;
- on the left, the cover, the current chapter, the book and author, and whether your place is saved (*Synced*, *Synced just now* while playing, *Saved on this device, will sync* while the server can't be reached, or *Saved on this device, sign in again to sync*). Tap it to open the full player;
- in the middle, **previous chapter**, **skip back**, **play/pause**, **skip forward** and **next chapter**, above a scrubber for the current chapter (with a tick for each bookmark) and the time left in the book;
- while the full player is open, the player bar (like the mini player on a phone) steps aside;
- on the right, the [undo button](#undo-a-jump) after a jump, then **speed**, the **sleep timer** (showing its countdown while one runs), **bookmark**, **output** (AirPlay or Cast, where available), the [Up next](up-next.md) button (on a server that has it), and an arrow that opens the full player.

In a narrower window, the bar keeps what fits: below about 1,024 points wide, speed, bookmark and output step back (sleep, Up next and the expand arrow stay), and below about 800 the chapter scrubber goes too, leaving the transport buttons. Everything that steps back is in the full player.

## Playback speed

Tap the speed readout (e.g. `1×`) to open the speed control:

- **The current speed**, large, with how long the rest of the book takes at it: *"5h 12m left in the book at 1.25× · remembered for this book"*.
- **A slider** from **0.5× to 2×** in **0.05 steps**, between a **minus** and a **plus** button that each move one step (0.05×) at a time.
- **Presets** - 0.8×, 1×, 1.1×, 1.2×, 1.25×, 1.3×, 1.5× and 2× - each showing how much of the book is left at that speed, so you can see what a faster speed would save you before you choose it.

Voices keep their pitch at any speed, so they don't go squeaky.

The speed you choose is **remembered per book** - switch back to a slow narrator and your speed comes back with them. New books start at your **default speed** from Settings. In the web player, the **[** and **]** keys change the speed by 0.05×.

## Sleep timer

Tap the moon to stop the book after a number of minutes, at the end of the chapter, or after a few chapters. While a timer runs, the sleep button shows its countdown. In its last 30 seconds a card lets you **Keep listening** (or, in the mobile apps, shake your phone), and if you fall asleep anyway, AudioSilo leaves a **Fell asleep** bookmark and offers to take you back next time.

All of it, including the automatic timer at night, is on its own page: [The sleep timer](sleep-timer.md).

## Bookmarks, notes, and history

- **Bookmarks** - the bookmark button in the full player or on the player bar adds one where you are, straight away (in the web player, so does the **B** key). They're listed in the companion's **Bookmarks** tab, which also has **Add bookmark at 1:23:45**, and on the book's detail page. Tap one to jump there.
- **Notes** - free-form notes on the book (markdown supported), for quotes or thoughts, in the companion's **Notes** tab and on the book's page.
- **History** - your past listening sessions on this book, labelled by chapter (with the same tidied chapter names as the player), in the companion's **History** tab and on the book's page.

All three are saved to your account, not the device.

## When a book finishes

When a book reaches its end, AudioSilo marks it **finished** (so it drops off your *Continue listening* shelf and out of [Up next](up-next.md)), hides the mini player (or the player bar), and shows the **end credits**:

- **Your year's shelf** - the books you've finished this year as a row of spines, with the one you just finished at the end, and *"Book 12 this year · you finished"* above the title. (Before your first other finished book of the year, or on a server without listening stats, you see the book's cover instead.)
- The **title**, author and narrator.
- **How you listened** - the time you actually spent listening to it, how many days that was spread across, and your speed.
- **How was it?** - give the book one to five stars, on a server that keeps ratings. Your rating is saved straight away.
- **Up next** - the book that plays next (below), with why it's next (*"Up next · from your queue"*, *"Up next · The Stormlight Archive, book 3"*, *"Up next · next in this folder"*), its length, and whether it's **Downloaded**, still downloading, or will stream from your server. Tap **Play now** to start it; the button shows it's working while the book starts, and if it can't start, a note says *"Couldn't start Oathbringer. Try again."* and the countdown stops.
- **View details** opens the finished book's page.

The **Credits** button at the top right lists who made the book: written by, read by, the publisher and release date when known, the community credit when the book is matched in [AudioSilo Meta](../community/meta-site.md), and where the book lives on your server. The **X** at the top left closes the screen.

You can also reach the end credits at any time from the player's [three-dot menu](#the-three-dot-menu), via **View end credits** or **Mark as Finished**.

### What plays next

AudioSilo picks the next book the same way everywhere - on the end credits, and when it plays on by itself:

1. The **first book in your [Up next](up-next.md) queue**, skipping any you've already finished.
2. If your queue is empty, the **next book in the series**: your server works it out from the community's reading order, then the series numbers, then the next book in the same folder.
3. On an older server that can't answer that, the **next book in the same folder** (in natural order, so *Book 2* comes before *Book 10*).

When the next book starts, it leaves Up next - it's the book you're on now.

If nothing comes next, the card says **End of the series** (*"That's every book in The Stormlight Archive on this server so far."*). When the community database knows the next book but your server doesn't have it, you'll see it as a pale cover saying it isn't on this server, with a link to **View on AudioSilo Meta**. AudioSilo never tries to play a book you don't have.

### Playing the next book automatically

Turn on **Automatically play next book** in [Settings](account.md#up-next) (it's the same switch as **Play the next book automatically** at the bottom of [Up next](up-next.md)) and the end credits start the next book for you:

- After a book finishes, a ring around the Up next card counts down **15 seconds**, then the next book starts.
- If you opened the credits screen *early* (from the menu) while the book is still playing, the card instead counts down the **time left in the current book** (*"Starting in 4m 12s"*). Nothing starts while this one is still playing: when it ends, the usual 15-second countdown runs.
- **Not now** stops the countdown for this visit, leaving the **Play now** button.
- **A sleep timer has the last word.** If a book ends while a [sleep timer](sleep-timer.md) is running for it, nothing starts by itself: you asked the timer to end the night there, so the credits wait for you (Play now still works).

:::note
If the app is in the **background** when a book ends (the screen is locked, or you're in another app), there's no countdown: the system may suspend the app once audio stops, so it can't be relied on. With **Automatically play next book** on, the next book starts straight away, and the mini player (or the player bar) shows it when you come back. With it off, with nothing to play next, or after an end under a sleep timer, the end credits are waiting when you return.
:::

Two related settings keep the flow smooth and your device tidy - **Download automatically** (it downloads whatever you start listening to, so the next book downloads the moment it starts) and **Remove a download when you finish the book**. Both are covered under [Up next in Settings](account.md#up-next).

## Play to another speaker (AirPlay / Cast)

The **output** button in the full player (and on the player bar on a computer) hands audio off to another output:

- **iPhone / iPad** - opens the AirPlay picker, so you can send playback to a HomePod, an Apple TV, or AirPlay speakers.
- **Android** - opens the system output switcher, for a Bluetooth speaker (an Echo paired as a speaker, for example) or a Cast device.
- **Web** - uses AirPlay in Safari, or the browser's Cast picker in Chrome. The button only appears in browsers that support one of these; elsewhere it's hidden.

Your position keeps syncing as normal while playing to another device.

## Your position follows you

AudioSilo saves your position to the server **every 15 seconds while playing**, and immediately whenever you pause, seek, change speed, or stop. Start a book on your phone in the car, open the web player at your desk, and it's waiting on the home screen at the right spot.

A few protections work behind the scenes so you never lose your place:

- Your position is stored **on the server and on the device**, and the most recent one wins - so a flaky connection can't quietly rewind you.
- A book **never silently restarts from the beginning**. If a streamed book can't confirm your resume position (say, the server is briefly unreachable), the player shows an error with a **Retry** button rather than starting at zero.
- Even if playback did slip back somehow, the app refuses to overwrite your real progress with a much earlier position - only a deliberate seek backwards counts.
- **Auto-rewind on resume**: after a pause, playback backs up a few seconds (5 by default, adjustable up to 30 or off) so you regain the thread of the sentence.

## Listening while offline

If the connection drops mid-listen:

- A **downloaded** book keeps playing as if nothing happened - see [Offline downloads](offline-downloads.md).
- A **streamed** book will pause with an error and a **Retry** button once its buffer runs out.
- Either way, an *"Offline - changes sync when reconnected"* banner appears, and any progress, bookmarks, or finished-marks you make are **queued on the device and synced automatically** when the server is reachable again.

## Books a browser can't play directly

Most audiobooks use audio that every browser plays (AAC, the usual audio in `.m4b` files, and MP3, among others). A few use something browsers can't decode, such as AC-3, Apple Lossless (ALAC) or WMA. The mobile apps play those as they are. In the **web player**, AudioSilo has your server **convert them to MP3 as you listen**, automatically:

- The book's page says so under its details: *"AC-3 audio is converted to MP3 for this browser"*.
- Everything works as usual - chapters, the seek bar, speed, the sleep timer. A jump takes a moment longer than usual, because the server starts converting again from the new place.
- **You can't download such a book in the browser**: its files wouldn't play offline there, so the download button reads **Can't download in this browser**. Download it in the [mobile app](mobile-apps.md) instead. (A copy downloaded earlier can still be removed.)

The conversion needs **ffmpeg** on your server, which the Docker image includes and the server downloads for itself otherwise (your admin can check under [Server > Transcoding](../admin/server.md#transcoding)). Without it, the web player tries to play the book directly, and if the browser can't, you get the usual playback error - see [Troubleshooting](../troubleshooting.md#a-book-plays-in-the-app-but-wont-play-in-the-browser).

## Lock-screen and headphone controls

In the mobile apps, playback continues in the background and shows up everywhere your system shows media:

- **Android** - the lock screen and notification give you the full audiobook row: **previous chapter**, a **chapter-relative scrubber** you can drag, **next chapter**, and **30-second skip back/forward** buttons.
- **iOS** - the lock screen and Control Centre show play/pause, a scrubber, and **skip back/forward** buttons that use the same skip lengths you chose in Settings.
- **Headphones and earbuds** - play/pause and skip buttons work as you'd expect, and playback pauses politely for interruptions (a phone call, a navigation prompt) and resumes afterwards only if it was playing before.

See [The mobile apps](mobile-apps.md) for more on the native apps.

## Books without chapters

A long audiobook that's a single file with no chapter markers still gets chapter-style navigation: the player divides it into **virtual chapters** (every 30 minutes by default - adjustable from 5 to 60 minutes in Settings), so the chapter skips, the chapter list, and the sleep timer's **End of chapter** all work.
