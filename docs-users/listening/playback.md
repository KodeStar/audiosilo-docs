---
title: Playing a book
description: "Starting a book, the mini player and the player bar, playing to another speaker, how your position syncs across devices, listening offline, books a browser can't play directly, lock-screen controls, and books without chapters."
---

Tap **Start listening** (or **Resume**) on any [book's page](book-page.md) to start it. On a phone the [full player](full-player.md) opens straight away. On a tablet or computer the book plays where you are, under the **player bar** along the bottom of the window; open the full player from it whenever you want the big view.

## The mini player and the player bar

While a book is playing, a small player stays with you on every screen. It steps aside while the full player is open.

**On a phone**, a **mini player** card floats just above the tab bar (in the web player, on Android, and on iPhones before iOS 26): the cover, the current chapter, and the book with its [time left](full-player.md#time-left) (a running sleep timer's countdown comes first), then **skip back** and **play/pause**, which shows a spinner while the book loads and **Retry** if playback fails. A thin line along its bottom shows how far you are through the chapter. Tap it to open the full player.

On an **iPhone running iOS 26 or later**, the mini player is a glass strip inside the tab bar with the same things. Scroll down and the tab bar shrinks; the mini player tucks in beside it with just the cover, the chapter and play/pause.

**On a tablet or computer**, the **player bar** runs along the bottom of the window:

- a thin line along its top edge showing your progress through the whole book;
- on the left, the cover, the chapter, the book and author, and whether your [place is saved](#your-position-follows-you) - tap it to open the full player;
- in the middle, previous chapter, skip back, play/pause, skip forward and next chapter, over a scrubber for the current chapter (with a tick for each bookmark) and the time left in the book;
- on the right, the [undo button](full-player.md#undo-a-jump) after a jump, then speed, the [sleep timer](sleep-timer.md) (with its countdown while one runs), bookmark, output, [Up next](up-next.md), and an arrow that opens the full player.

When the bar is short of room (a narrower window, or the undo button taking its space), it drops speed, bookmark and output first, then the chapter scrubber and the time left; everything it drops is in the full player.

## Play to another speaker (AirPlay / Cast)

The **output** button in the full player (and on the player bar) hands audio off to another output:

- **iPhone / iPad** - opens the AirPlay picker, so you can send playback to a HomePod, an Apple TV, or AirPlay speakers.
- **Android** - opens the system output switcher, for a Bluetooth speaker (an Echo paired as a speaker, for example) or a Cast device.
- **Web** - uses AirPlay in Safari, or the browser's Cast picker in Chrome. The button only appears in browsers that support one of these; elsewhere it's hidden.

Your position keeps syncing as normal while playing to another device.

## Your position follows you

AudioSilo saves your position to the server **every 15 seconds while playing**, and immediately whenever you pause, seek, change speed, or stop. Start a book on your phone in the car, open the web player at your desk, and it's waiting on the home screen at the right spot.

The player says where your place is: **Synced** (*Synced just now* while playing), **Saved on this device, will sync** while the book's server can't be reached or saves are waiting to go, or **Saved on this device, sign in again to sync** when that server needs you to sign in again.

A few protections work behind the scenes so you never lose your place:

- Your position is stored **on the server and on the device**, and the most recent one wins - so a flaky connection can't quietly rewind you.
- A book **never silently restarts from the beginning**. If a streamed book can't confirm your resume position (say, the server is briefly unreachable), the player shows an error with a **Retry** button rather than starting at zero.
- Even if playback did slip back somehow, the app refuses to overwrite your real progress with a much earlier position - only a deliberate seek backwards counts.
- **Picking up where another device left off**: if a book is still loaded on this device when you come back to it (you open the app again, or press play after a pause of more than a minute) and you've listened further on another device meanwhile, the player jumps to that newer place before it saves anything, and says so: *"Picked up your place from another device"*, with **Undo** to go back.
- **Auto-rewind on resume**: after a pause, playback backs up a few seconds (5 by default, adjustable up to 30 or off) so you regain the thread of the sentence.

## Bookmarks, notes and history

The bookmark button in the full player or on the player bar adds a bookmark where you are, in one tap; **Add note** on the note that confirms it lets you say why (see [Bookmarks and notes](bookmarks-and-notes.md)). Your bookmarks, notes and listening history for the book are in the [companion](companion.md#bookmarks-notes-and-history) and on the [book's page](book-page.md#the-tabs), and every book's are in the [Journal](journal.md), all saved to your account.

## Listening while offline

If the connection drops mid-listen:

- A **downloaded** book keeps playing as if nothing happened - see [Offline downloads](offline-downloads.md).
- A **streamed** book will pause with an error and a **Retry** button once its buffer runs out.
- Either way, an *"Offline - changes sync when reconnected"* banner appears, and any progress, bookmarks, or finished-marks you make are **queued on the device and synced automatically** when the server is reachable again.

## Books a browser can't play directly

Most audiobooks use audio that every browser plays (AAC, the usual audio in `.m4b` files, and MP3, among others). A few use something browsers can't decode, such as AC-3 or Apple Lossless (ALAC). The mobile apps play those as they are, where the device can decode them (an Android phone may not). In the **web player**, AudioSilo has your server **convert them to MP3 as you listen**, automatically:

- The book's page says so under its details: *"AC-3 audio is converted to MP3 for this browser"*.
- Everything works as usual - chapters, the seek bar, speed, the sleep timer. A jump takes a moment longer than usual, because the server starts converting again from the new place.
- **You can't download such a book in the browser**: its files wouldn't play offline there, so the download button is turned off (on a wide enough page it says **Can't download in this browser**). Download it in the [mobile app](mobile-apps.md) instead. (A copy downloaded earlier can still be removed.)

The conversion needs **ffmpeg** on your server, which the Docker image includes and the server downloads for itself otherwise (your admin can check under [Server > Transcoding](../admin/server.md#transcoding)). Without it, the web player tries to play the book directly, and if the browser can't, you get the usual playback error - see [Troubleshooting](../troubleshooting.md#a-book-plays-in-the-app-but-wont-play-in-the-browser).

## Lock-screen and headphone controls

In the mobile apps, playback continues in the background and shows up everywhere your system shows media:

- **Android** - the lock screen and notification give you the full audiobook row: **previous chapter**, a **chapter-relative scrubber** you can drag, **next chapter**, and **30-second skip back/forward** buttons.
- **iOS** - the lock screen and Control Centre show play/pause, a scrubber, and **skip back/forward** buttons that use the same skip lengths you chose in [Settings](settings.md#playback).
- **Headphones and earbuds** - play/pause and skip buttons work as you'd expect, and playback pauses politely for interruptions (a phone call, a navigation prompt) and resumes afterwards only if it was playing before.

See [The mobile apps](mobile-apps.md) for more on the native apps.

## Books without chapters

A long audiobook that's a single file with no chapter markers still gets chapter-style navigation: the player divides it into **virtual chapters** (every 30 minutes by default - adjustable from 5 to 60 minutes in [Settings](settings.md#playback)), so the chapter skips, the chapter list, and the sleep timer's **End of chapter** all work.
