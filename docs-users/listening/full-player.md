---
title: The full player
description: "The full player on a phone, a tablet and a computer: the status line, the seek bar and the whole-book timeline, time left, undoing a jump, the three-dot menu, playback speed, and Smart speed and Voice boost."
---

## What's on it

![The full player on a computer, with the companion column on the right](/img/screenshots/web-player/player.png)

The full player is about the book you're listening to. Its background takes on the colours of the book's cover, and the cover settles back a little while the book is paused. From top to bottom:

- **The top row** - a **down arrow** to minimise the player (playback carries on), *Playing from* and your server's name, the book's place in its series (*"The Stormlight Archive, book 2"*, or its library), and the [three-dot menu](#the-three-dot-menu).
- **The cover**, then **the chapter title** with the book and author under it. Tap the chapter title to open the chapters.
- **The status line**: whether your [place is saved](playback.md#your-position-follows-you), how much of the book you've heard, and the [time left](#time-left): *"Synced just now · 38% of the book · 22h 27m left at 1.25×"*. After a big jump it turns into the [undo button](#undo-a-jump), and in a sleep timer's last seconds the [sleep timer's card](sleep-timer.md#the-last-30-seconds) takes its place.
- **The [seek bar](#the-seek-bar-and-the-timeline)** for the current chapter, and a slim **timeline of the whole book** below it.
- **The transport**: previous chapter, skip back, play/pause, skip forward, next chapter. The skip buttons show how far they jump (15 seconds back and 30 forward out of the box; change them in [Settings](settings.md#playback)). If playback fails, the play button becomes **Retry**.
- **The actions**: [speed](#playback-speed), the [sleep timer](sleep-timer.md), **bookmark** (one tap adds one where you are; see [Bookmarks and notes](bookmarks-and-notes.md)), **output** for [AirPlay or Cast](playback.md#play-to-another-speaker-airplay--cast) where your device has one, and [Up next](up-next.md) with how many books are queued. On a tablet or computer, while [Smart speed or Voice boost](#smart-speed-and-voice-boost) is on, one more button says so (*"Saved 2h 11m"* on Android, or *"Voice boost"*); it opens the speed sheet.

Beside or below it sits the [companion](companion.md): Who's who, Story so far, the chapters, and your bookmarks, notes and history for the book.

:::tip
If a book's chapters are just named after their audio files, AudioSilo tidies those names for display - dropping the file extension and turning underscores into spaces. Real chapter titles are left exactly as they are.
:::

## On a phone, a tablet and a computer

- **On a phone** the player fills the screen. Under the actions, chips for **Who's who** and **Story so far** (when your server has community metadata switched on) and **Chapters** open the companion as a sheet; the chapter title opens it on **Chapters**.

  ![The player on a phone, paused, with the companion chips under the actions](/img/screenshots/web-player/phone-player.png)

- **On a tablet** the actions get words beside their icons, and the companion sits under the controls (scroll down to reach it). The chapter title opens the chapter list as a sheet.
- **On a computer** the actions get words too, and the companion is a column down the right-hand side; the chapter title switches it to **Chapters**. Up next isn't among the actions, because the [Up next drawer](up-next.md#opening-up-next) is beside the page. On a phone or tablet, Up next opens as a sheet over the player.

## The seek bar and the timeline

The seek bar spans the **current chapter**, so even in a 30-hour book a small movement is a small jump. The part you've heard is solid, the rest faint, a pink line marks where you are, and a small icon sits above each bookmark in the chapter. The bars are a pattern, not a waveform: their height says nothing about loudness.

- **Tap** anywhere on the bar to jump there.
- **Drag** to scrub; a label shows where you'd land (*"41:12 · 17:26:50 in the book"*). Let go to jump.
- In the web player, pointing at the bar shows the time there.

Under the bar: the time into the chapter, how long the rest of it takes and when it ends by the clock (*"21m left in the chapter · ends 22:01"*, at your speed), and its remaining time. A short book that's a single file without chapter marks is one stretch, so there the bar spans the **whole book** (*"32m left in the book · ends 22:41"*); a longer single file is split into [virtual chapters](playback.md#books-without-chapters), and a book of several files without chapter marks treats each file as a chapter. A book whose file lengths aren't known yet gets the current **file** instead.

Below it, the **whole-book timeline** shows each chapter as a segment sized by its length, the chapters you've finished shaded and the one you're in in pink. Pins above it mark your **bookmarks** and **notes**: tap a pin to jump to it, or tap or drag anywhere else to jump anywhere in the book.

Neither scrubber takes you all the way to the end: a tap or drag there lands **30 seconds short**, so a slip can't finish the book by accident. To finish one on purpose, use **Mark as Finished**. (Until a book's file lengths are known, its seek bar covers just the current file and has no such stop.)

## Time left

Wherever AudioSilo says how much of a book is left - the player, the mini player and player bar, Home, the Library's book list, Up next - it's **real time at the speed you listen to that book**: *"5h 12m left at 1.25×"*, or just *"5h 12m left"* at normal speed.

Each book uses **its own** speed: the playing book its current speed, any other book the speed you last listened to it at, or your **default speed** from [Settings](settings.md#playback) if you haven't started it.

## Undo a jump

![The player bar just after a chapter skip, with the Back to button leading the buttons on the right](/img/screenshots/web-player/dock-undo.png)

After **any jump of more than a minute** - a tap on the seek bar or timeline, a chapter skip, a bookmark, even a scrub on the lock screen, headphones or a car screen - a **Back to 17:26:50** button appears for a few seconds: in the full player in place of the status line, and on the [player bar](playback.md#the-mini-player-and-the-player-bar) at the start of the buttons on the right. Tap it to go back; a note confirms *"Back where you were"*.

## The three-dot menu

- **View book details** - the book's page. Playback carries on.
- **Chapters** - the chapter list (on a computer, the companion's Chapters tab).
- **View end credits** - the [end credits](end-of-book.md) early, handy for skipping a long spoken credits section. Playback carries on, and **Play now** there starts the next book while this one keeps your place (see [The end credits](end-of-book.md#the-end-credits)).
- **Mark as Finished** - marks the book finished now, stops it and opens its end credits.
- **Keyboard shortcuts** - in the web player, the list of [keyboard shortcuts](keyboard-shortcuts.md).

## Playback speed

![The speed sheet on a phone: the current speed, the slider between minus and plus, the presets with the time left at each, and the Smart speed and Voice boost switches](/img/screenshots/web-player/phone-speed-sheet.png)

Tap the speed (e.g. `1×`) to change it: from **0.5× to 2×** in **0.05 steps**, with the slider, the minus and plus buttons, or a preset that shows how much of the book would be left at that speed. Voices keep their pitch.

The speed is **remembered per book**; new books start at your **default speed** from Settings. Under the presets sit the [Smart speed and Voice boost](#smart-speed-and-voice-boost) switches.

## Smart speed and Voice boost

Two switches in the speed sheet (and in [Settings](settings.md#playback), where they're the same two settings) change how the book sounds. Both start **off**, and each applies to every book you play on this device.

| | What it does | Where it works |
|---|---|---|
| **Smart speed** | Shortens the silences between words and sentences, so a book takes less time without the voice getting any faster. The speech itself is never touched, and your speed setting stays as it is | **Android**: every book. **iPhone and iPad**: not yet (*"Not available on iPhone yet"*). **Web player**: not available (*"Not available in the browser"*) |
| **Voice boost** | Evens out quiet and loud voices, lifting a soft-spoken narrator so you can follow along in a noisy car or kitchen. Quiet passages come up the most (about 10 dB), loud ones the least, and the peaks are held below the top so nothing distorts | **Android** and **iPhone/iPad**: every book. **Web player**: Chrome, Edge and Firefox, but not Safari or any browser on an iPhone or iPad (*"Not available in this browser"*) |

**Smart speed is Android only for now.** On an iPhone or iPad the switch is there but turned off and greyed out, with *"Not available on iPhone yet"*.

**Time saved** (Android). Once Smart speed has saved you a second or more, the speed sheet says how much in total on this device (*"Saved 2h 11m"*), and a book's page shows what it saved on that book under [Your listening](book-page.md#about-this-book) (*"Smart speed saved 14m"*). The figure is the silence removed, counted at normal speed, so listening faster doesn't inflate it. It's kept on the device, not on your server: each phone has its own. Removing a server from the app forgets its books' figures; the total stays.

**Voice boost in the web player** starts the first time you switch it on or press play with it on (browsers only let a page process sound after a tap). It works on books from the server the web player is opened from; a book from another server you've added plays without it.
