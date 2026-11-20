---
title: Listen in the car
description: "Play your audiobooks on your car's screen with Android Auto or Apple CarPlay."
---

The iOS and Android apps put your books on your car's screen: **Android Auto** on Android, **CarPlay** on iPhone. The car plays through the app on your phone and saves your place as the phone does. The web player has no car mode.

## Getting AudioSilo into the car

### Android Auto

1. Install the app on your phone and [sign in to your server](connecting.md).
2. Connect the phone to the car and open Android Auto.
3. On the car's screen, open the app launcher and tap **AudioSilo**.

If AudioSilo isn't in the launcher, check it isn't hidden under **Customize launcher** in Android Auto's settings on the phone.

Android Auto only lists apps from Google Play. If you installed [the APK from GitHub](mobile-apps.md#android-without-google-play), turn on **Unknown sources** in Android Auto's developer settings:

1. Open Android Auto's settings on the phone.
2. Tap **Version and permission info** ten times and allow development settings.
3. Open **Developer settings** from the three-dot menu.
4. Turn on **Unknown sources**.

### CarPlay

Connect your iPhone to the car and tap AudioSilo on the CarPlay home screen. It works with the iPhone locked, once you've unlocked it since it last restarted. If you don't see AudioSilo, [update the app](mobile-apps.md).

## What the car shows

The car shows up to four lists:

- **Continue listening** - books you're part-way through, on every server.
- **Up next** - your [Up next](up-next.md) queue.
- **Downloads** - books and podcast episodes downloaded to the phone.
- **Library** - the most recently added books in the library your phone's Library tab is on. If you never chose one, the car lists the first of your servers it can reach, and keeps that library until the car disconnects.

When several people share the phone ([profiles](profiles.md)), the car shows only the books of the person listening now.

### A kids profile in the car

When the person listening is in [kids mode](kids-mode.md), the car shows only their stories and their **Continue listening**. Switching to a grown-up changes the lists straight away.

## Playing a book

Tap a book to play it from your saved place. It uses the same speed and settings as on the phone.

Pick a [downloaded](offline-downloads.md) book for a drive through places with no signal.

On Android, the car's play button resumes a downloaded book even after Android has closed the app. See [Lock-screen and headphone controls](playback.md#lock-screen-and-headphone-controls).

On Android Auto, a book that takes too long to start shows as unavailable. It never starts playing later by itself. If it was already loading, it loads paused. Tap it again to play it. If you tap another book while one is still starting, the last book you tapped plays.

| | Android Auto | CarPlay |
|---|---|---|
| Chapters | The car's queue | **Chapters** on Now Playing |
| Next and previous | By chapter | By chapter |
| Skip back and forward | By your [skip lengths](settings.md#playback) | Where the car shows them |
| Speed | - | The speed button |
| Bookmark | Yes | Yes |
| Voice | *"Hey Google, play AudioSilo"* | - |

On Android Auto you can name a book: *"play The Hound of the Baskervilles on AudioSilo"*.

## While it plays

On Android, Pause and a sleep timer set for a number of minutes stop the book you hear in the car, even if the app still shows another book. An end-of-chapter timer follows the book you set it on. Resuming from the car continues its book.

The car's Now Playing screen shows the chapter you're in, with a scrubber for that chapter. Next and previous move by chapter.

**Bookmark** adds a bookmark where you are, like the bookmark button in the app. If your server can't be reached, the bookmark is kept on the phone and sent later.

Every move you make in the car saves your new place.

## When a book ends in the car

This works even if you never opened the app on your phone:

- The book is marked finished and leaves [Up next](up-next.md).
- With **Automatically play next book** on, the next book starts in the car. See [Playing on automatically](end-of-book.md#playing-on-automatically).
- The [end credits](end-of-book.md#the-end-credits) wait until you next open the app on your phone, unless you have started another book by then.

[Keep the next books ready](offline-downloads.md#keep-the-next-books-ready) downloads your next books while you drive, as it does on the phone.

## Good to know

- If the car says to connect a server, open AudioSilo on your phone and [sign in](connecting.md).
- If a book can't play, its server may be out of reach. Play a downloaded book instead; it starts from the place saved on the phone (see [Listening on more than one device](playback.md#listening-on-more-than-one-device)).
- If a streamed book stops with *Playback stopped. Your place is saved.*, nothing starts again by itself when the server comes back. Press play when you're ready.
- On Android, when you start a book in the car while the phone has another one open, the phone switches to the car's book without a pause. The other book keeps the place where you last heard it.
- The car has no search and doesn't browse folders.
- The first drive may show a few books without covers for a moment. A book with no cover shows the AudioSilo tile.
- After the phone restarts, Android Auto can offer the downloaded book you listened to last. Its play button starts that book at your saved place. A streamed book isn't offered.
- The [automatic sleep timer at night](sleep-timer.md#starting-a-timer-automatically-at-night) doesn't start while a car is connected.
