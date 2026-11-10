---
title: Play a book
description: Start a book, control it from any screen, and keep your place in sync across your devices.
---

Tap **Start listening** or **Resume** on a [book's page](book-page.md). On a phone the [full player](full-player.md) opens. On a tablet or computer the book plays under the player bar, and you can open the full player from there.

## The mini player and the player bar

While a book plays, a small player stays with you on every screen.

**On a phone**, a **mini player** sits just above the tab bar. It shows the cover, the chapter, the [time left](full-player.md#time-left), skip back and play/pause. Tap it to open the full player. On an iPhone with iOS 26 or later, it's a glass strip inside the tab bar.

**On a tablet or computer**, the **player bar** runs along the bottom of the window:

- On the left: the cover, the chapter and the book. Tap it to open the full player.
- In the middle: chapter and skip buttons, play/pause, and a scrubber for the current chapter.
- On the right: speed, the [sleep timer](sleep-timer.md), bookmark, output, [Cast](chromecast.md), [Up next](up-next.md), and an arrow to the full player. After a jump, an [undo button](full-player.md#undo-a-jump) appears here too.

In a narrow window, some of these buttons are left to the full player. The bookmark button marks where you are: see [Add bookmarks and notes](bookmarks-and-notes.md).

## Play to another speaker (AirPlay and Chromecast)

The **output** button in the full player and on the player bar sends the sound somewhere else:

- **iPhone and iPad**: the AirPlay picker, for a HomePod, an Apple TV or AirPlay speakers.
- **Android**: the system's media output panel, for a Bluetooth speaker.
- **Web player**: AirPlay in Safari. Other browsers don't show the button.

For a Chromecast, a TV with Google Cast or a Nest speaker, use the **Cast** button instead. See [Chromecast](chromecast.md). Your place keeps syncing either way.

## Your position follows you

AudioSilo saves your place to the server every 15 seconds while you listen, and straight away when you pause, seek or stop. Start a book on your phone, open the web player at your desk, and it's waiting at the right spot.

The player shows whether your place is **Synced**, or **Saved on this device, will sync** while the server can't be reached.

A few protections keep your place safe:

- **A book never silently restarts from the beginning.** If a streamed book can't find your place, the player shows **Retry** instead of starting at zero.
- **An earlier position can't overwrite your progress by accident.** Only a move back you make yourself counts, including a scrub from the lock screen, headphones or a car. If you listened offline while another device got further, the further place isn't overwritten, and for the book you're playing the player asks which to keep. See [Listening on more than one device](#listening-on-more-than-one-device).
- **You pick up another device's place.** If a book is still loaded here and you've listened further elsewhere, the player jumps to the newer place and says so, with **Undo**.
- **Auto-rewind.** After a pause, playback backs up a few seconds so you catch the sentence again. Change it in [Settings](settings.md#playback).

## Listening on more than one device

Each device tells the server what you listened to: from where to where, and when. The server puts it together, so:

- **Nothing moves your place back by itself.** If two devices listened without seeing each other (a watch on a run while your phone was offline, say), the server keeps the place further on.
- **You choose where to carry on.** When another device's place is more than half a minute away, the player asks: *"On Apple Watch you were at Chapter 12, 4:10. Jump there?"* **Jump** goes there. **Stay** keeps your place. The [book's page](book-page.md#listening-and-the-buttons) offers it too.
- **Finished stays finished**, unless you start the book again.
- **Listening counts when it happened.** Offline listening shows in your history, Journal and stats at the time you listened, even if it syncs days later.

Until it reaches the server, your listening waits on the device. Home says how many listens are waiting, and your [account page](account.md#listening-sync) shows the details.

**Places from Audible.** If your admin has turned on [Audible sync](../admin/audible.md#syncing-listening-places) for your Audible account, Audible counts as one more device. A place further on in Audible reaches you within about 15 minutes. Your place here goes back to Audible a few minutes after you stop. It never moves your place back.

## Listening while offline

If the connection drops while you listen:

- A **downloaded** book keeps playing. See [Listen offline](offline-downloads.md).
- A **streamed** book pauses with **Retry** once it runs out of buffered audio. Offline, Home shows **Not downloaded** for it instead of Resume.
- Progress, bookmarks and finished books, **Mark as finished** included, wait on the device and sync once the server is back.

## Lock-screen and headphone controls

In the mobile apps, playback carries on in the background:

- **Android**: the lock screen and notification show previous and next chapter, a chapter scrubber, and skip buttons that use your skip lengths from [Settings](settings.md#playback).
- **iOS**: the lock screen and Control Centre show the chapter, a chapter scrubber, play/pause and skip buttons. Next and previous track, from headphones or a car, move by chapter.
- **Headphones**: play/pause and skip work as you'd expect. Playback pauses for a call or a navigation prompt, and resumes after if it was playing.
- **In the car**: see [In the car](in-the-car.md).

Previous goes back to the start of the chapter. Within the first 3 seconds of a chapter, it goes to the chapter before.

See [Get the apps](mobile-apps.md) for more on the apps.

## Books a browser can't play directly

A few audiobooks use audio that browsers can't play, such as AC-3 or Apple Lossless (ALAC). The mobile apps play them as they are, where the device can. In the web player, your server converts them to MP3 as you listen:

- The book's page says so, such as *"AC-3 audio is converted to MP3 for this browser"*.
- Chapters, seeking, speed and the sleep timer all work. A jump takes a moment longer.
- You can't download such a book in the browser. Download it in the [mobile app](mobile-apps.md) instead.

Converting needs **ffmpeg** on your server. The Docker image includes it, and otherwise the server downloads it (your admin can check under [Server > Transcoding](../admin/server.md#transcoding)). If a book still won't play, see [Troubleshooting](../troubleshooting.md#a-book-plays-in-the-app-but-wont-play-in-the-browser).

## Books without chapters

A long single file with no chapter marks is split into **virtual chapters**, every 30 minutes by default. You can choose 5 to 60 minutes in [Settings](settings.md#playback). Chapter skips, the chapter list and the sleep timer's **End of chapter** all work.

Many such books can get real chapters, from the community database or from your server's [Bridge](../admin/generating-characters-and-recaps.md#books-without-chapters). See [Use the book page](book-page.md#chapters).

## Good to know

- **Older servers** don't combine listening from several devices. The app just saves your place, as before.
- **MKA books.** An `.mka` book with MP3 inside plays like any MP3 book when your server has ffmpeg (see [Supported formats](../getting-started/organizing-your-library.md#supported-formats)). On the very first play of a large one, a jump may not land exactly until the server has finished preparing it.
- **Very long single files on Android.** A book in one `.m4b` or `.m4a` file over about 41 hours shows a scrubber for the whole file on the lock screen, with no chapter buttons. Its chapters work as usual in the app.
- **A listen the server turns down**, such as one from a download of a different length, is listed with the reason on your [account page](account.md#listening-sync).
