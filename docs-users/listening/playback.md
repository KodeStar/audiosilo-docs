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
- On the right: speed, the [sleep timer](sleep-timer.md), bookmark, output, [Cast](chromecast.md), [Up next](up-next.md), and an arrow to the full player.

After a jump, an [undo button](full-player.md#undo-a-jump) floats just above the bar.

In a narrow window, the player bar hides some of these buttons. With [larger text](settings.md#text-size), the play and skip buttons and the chapter scrubber can move below the book. The full player still has all the controls. The bookmark button marks where you are. See [Add bookmarks and notes](bookmarks-and-notes.md).

## Play to another speaker (AirPlay and Chromecast)

The **output** button in the full player and on the player bar sends the sound somewhere else:

- **iPhone and iPad**: the AirPlay picker, for a HomePod, an Apple TV or AirPlay speakers.
- **Android**: the system's media output panel, for a Bluetooth speaker.
- **Web player**: AirPlay in Safari. Other browsers don't show the button.

For a Chromecast, a TV with Google Cast or a Nest speaker, use the **Cast** button instead. See [Chromecast](chromecast.md). Your place keeps syncing either way.

## Your position follows you {/* #your-position-follows-you */}

AudioSilo saves your place to the server every 15 seconds while you listen, and straight away when you pause, seek or stop. So a book you start on your phone opens in the web player at the same place.

When the app isn't on screen, or the book is downloaded, it saves once a minute to save battery. Your other devices and the admin console can then be up to a minute behind.

If the app closes while a book plays, because you swiped it away or the phone stopped it, your device keeps where you got to. When you open the app again, Resume, the book's page and the car carry on at most about 5 seconds of playing before that place, then your other devices catch up. This also works for a book you had only just started. In a browser, reloading the page does the same. Two cases can start up to 15 seconds of playing back: a new browser tab opened within half a minute of the old one closing, and an older server that doesn't combine listening from several devices.

The player shows whether your place is **Synced**, or **Saved on this device, will sync** while the server can't be reached.

Four rules protect your place:

- **A book never silently restarts from the beginning.** If a streamed book can't find your place, the player shows **Retry** instead of starting at zero.
- **An earlier position can't overwrite your progress by accident.** Only a move back you make yourself counts, including a scrub from the lock screen, headphones or a car. If you listened offline while another device got further, the further place isn't overwritten, and for the book you're playing the player asks which to keep. See [Listening on more than one device](#listening-on-more-than-one-device).
- **You pick up another device's place.** If a book is still loaded here and you've listened further elsewhere, the player jumps to the newer place and says so, with **Undo**. When you press play in the app after a pause of a minute or more, the app asks your server for your latest place first, so you don't hear the old one. The play button shows a spinner while it waits, for at most 1.5 seconds.
- **Auto-rewind.** After a pause, playback backs up a few seconds so you catch the sentence again. Change it in [Settings](settings.md#playback).

## Listening on more than one device {/* #listening-on-more-than-one-device */}

Each device tells the server what you listened to: from where to where, and when. The server puts it together, so:

- **Nothing moves your place back by itself.** If two devices listened without seeing each other (a watch on a run while your phone was offline, say), the server keeps the place further on.
- **You choose where to carry on.** When another device's place is more than half a minute away, the player asks: *"On Apple Watch you were at Chapter 12, 4:10. Jump there?"* **Jump** goes there. **Stay** keeps your place. The [book's page](book-page.md#listening-and-the-buttons) offers it too.
- **Stay wins.** Your server takes the place you chose, even if the other device played on after yours asked. If that device keeps playing before it catches up, your place stays put and that device asks you instead. See [when Stay doesn't win](#good-to-know).
- **Finished stays finished**, unless you start the book again or [mark it as not finished](end-of-book.md#mark-a-book-finished-yourself).
- **Listening counts when it happened.** Offline listening shows in your history, Journal and stats at the time you listened, even if it syncs days later.

If you let the question go, you keep listening here. While the server still has the other place, the player asks again the next time you press Play or move in the book. Choosing **Jump** or **Stay** settles it.

Until it reaches the server, your listening waits on the device. Home says how many listens are waiting, and your [account page](account.md#listening-sync) shows the details.

**Places from Audible.** If your admin has turned on [Audible sync](../admin/audible.md#syncing-listening-places) for your Audible account, Audible counts as one more device. A place further on in Audible reaches you within about 15 minutes. Your place here goes back to Audible a few minutes after you stop. It never moves your place back.

## Switch between browser tabs

If you're signed in to the same account on the same server in two browser tabs, press **Play** in the tab you want to hear. The other pauses and says **Playback started in another tab** when you look at it. Other accounts and devices can keep playing.

With the same book open in two windows side by side, the paused one keeps up with the playing one's place. If your server [converts the audio for your browser](#books-a-browser-cant-play-directly), the paused tab catches up when you return to it or press **Play** instead. Press **Play** to carry on from there. If the player can't move to that place, press **Retry** to load the book there.

## Listening while offline

If the connection drops while you listen:

- A **downloaded** book keeps playing. See [Listen offline](offline-downloads.md).
- A **streamed** book pauses with **Retry** once it runs out of buffered audio. Offline, Home shows **Not downloaded** for it instead of Resume.
- Progress and finished books, **Mark as finished** included, wait on the device and sync once the server is back.
- Home and the book's page show where you got to on this device, even before it syncs. **Resume** plays from the same place.
- You can [bookmark a moment](bookmarks-and-notes.md) while offline. The app sends it when your server is available.

## Lock-screen and headphone controls

In the iOS and Android apps, playback carries on in the background:

- **Android**: the lock screen and notification show previous and next chapter, a chapter scrubber, and skip buttons that use your skip lengths from [Settings](settings.md#playback). Tap the notification to open the app.
- **iOS**: the lock screen and Control Centre show the chapter, a chapter scrubber, play/pause and skip buttons. Next and previous track, from headphones or a car, move by chapter.
- **Headphones**: the play/pause and skip buttons control the book. Playback pauses for a call or a navigation prompt, and resumes after if it was playing.
- **In the car**: see [In the car](in-the-car.md).

Previous goes back to the start of the chapter. Within the first 3 seconds of a chapter, it goes to the chapter before.

On Android, pressing play on your headphones, a Bluetooth device or the car works even after Android has closed the app. It resumes the downloaded book you listened to last, from your latest place, even when that is a different book from the one the app last had open. If the app crashed or was closed mid-book, it starts within about 10 seconds of where you were. A book you stopped or finished stays stopped. After the phone restarts, Android's media controls show a card for that downloaded book, and its play button starts it at your saved place.

When playback stops with *Playback stopped. Your place is saved.*, press Play on the phone, your headphones or the car to carry on.

See [Get the apps](mobile-apps.md) for more on the apps.

## Books a browser can't play directly

A few audiobooks use audio that browsers can't play, such as AC-3 or Apple Lossless (ALAC). The iOS and Android apps play them as they are, where the device can. In the web player, your server converts them to MP3 as you listen:

- The book's page says so, such as *"AC-3 audio is converted to MP3 for this browser"*.
- Chapters, seeking, speed and the sleep timer all work. A jump takes a moment longer.
- You can't download such a book in the browser. Download it in the [iOS or Android app](mobile-apps.md) instead.

Converting needs **ffmpeg** on your server. The Docker image includes it, and otherwise the server downloads it (your admin can check under [Server > Transcoding](../admin/server.md#transcoding)). If a book still won't play, see [Troubleshooting](../troubleshooting.md#a-book-plays-in-the-app-but-wont-play-in-the-browser).

## Books without chapters

A long single file with no chapter marks is split into **Parts**, 30 minutes each by default. Parts work like chapters. The book page lists them on its **Parts** tab, and chapter skips and the sleep timer's **End of chapter** use them.

To change their length, set **Chapter length (unchaptered)** in [Settings](settings.md#playback), from 5 to 60 minutes.

Many such books can get real chapters, from the community database or from your server's Bridge (see [Detect chapters](../admin/chapter-detection.md)). See [Use the book page](book-page.md#chapters).

## Good to know {/* #good-to-know */}

- **Older servers** don't combine listening from several devices. The app saves your place as before, and the protections in [Your position follows you](#your-position-follows-you) still apply. On some, **Mark as finished** needs a connection.
- **When Stay doesn't win.** It doesn't beat listening that went on more than two minutes after it, such as when you chose Stay offline a while ago. It doesn't beat a change made since, such as marking the book finished. Then the usual rules above apply. If another device's Stay got there first, you're asked again straight away.
- **On servers before 2.7 that combine listening**, Stay wins only if the other device hasn't played on since yours asked, or your place is further on. A question you let go may not come back when you press Play or skip.
- **MKA books.** An `.mka` book with MP3 inside plays like any MP3 book when your server has ffmpeg (see [Supported formats](../getting-started/organizing-your-library.md#supported-formats)). On the very first play of a large one, a jump may not land exactly until the server has finished preparing it.
- **MP3 files recorded at a varying bitrate.** Skips, seeks and chapter jumps land at the place the player shows. If a file holds less audio than its listed length, playback stops with an error where its audio ends, instead of running on into the next file, and the book isn't marked finished. Move back into the file, or on to the next one, then press play or **Retry**.
- **A book that stopped with an error.** You can still skip, seek or pick a chapter, in the app or on the lock screen. The player shows the new place, and play or **Retry** loads the book there.
- **A chapter or bookmark that is slow to load.** If you press Play on one while listening, the player waits for it for up to 30 seconds, even if **Retry** appears, then plays from there. Pause or pick another place to stop waiting.
- **Very long single files on Android.** A book in one `.m4b` or `.m4a` file over about 41 hours shows a scrubber for the whole file on the lock screen, with no chapter buttons. Its chapters work as usual in the app.
- **A listen the server turns down**, such as one from a download of a different length, is listed with the reason on your [account page](account.md#listening-sync).
