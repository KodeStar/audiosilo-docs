---
title: In the car
description: "Listening with Android Auto and Apple CarPlay: the four lists on the car's screen, starting a book, chapters, skips, speed and bookmarks, how your place is saved, and getting AudioSilo to show up in the car."
---

The AudioSilo apps for Android and iPhone can put your books on a car's screen: **Android Auto** on Android, **CarPlay** on iPhone. The car shows the same four lists on both, plays through the app on your phone, and saves your place exactly as the phone does. The web player has no car mode.

:::note CarPlay comes with a later app update
CarPlay is built into the iPhone app, but Apple has to approve an app for CarPlay audio before a car will show it. That approval isn't part of the App Store app yet, so **AudioSilo doesn't appear in CarPlay today**; it arrives with a future app update. Everything about CarPlay below describes how it works once it's there.
:::

## What the car shows

Four lists, as tabs along the car's screen:

- **Continue listening** - the books you're part-way through, on every server you're signed in to, the one you're playing first (the same books as Home's Continue listening).
- **Up next** - your [Up next](up-next.md) queue.
- **Downloads** - the books downloaded to your phone, newest first.
- **Library** - the most recently added books in the library you have selected.

Each book shows its cover, its author and, once you've started it, the time left at that book's speed (*"Arthur Conan Doyle · 3h 12m left"*). The car also marks how far through each book you are, whether you've finished it, and (on Android Auto) whether it's downloaded. Cars show only so many items, so the longer lists are cut short: up to 20 books in Continue listening and Up next, 50 in Downloads and Library, and fewer where the car allows fewer.

The lists follow what you do on the phone: start a book, pause, add to your queue or finish a download, and the car catches up within a few seconds. If you're not signed in to a server, the car says *"Connect a server in AudioSilo to listen in the car"*, and an empty list says *"Nothing here yet"*. The car's words are in the language you chose for the app.

## Playing a book

Tap a book to play it from your saved place. It plays through your phone's AudioSilo app, with the same speed, auto-rewind and [Smart speed and Voice boost](full-player.md#smart-speed-and-voice-boost) settings as on the phone.

- **Android Auto** starts a **downloaded** book straight away, even if the AudioSilo app isn't open on your phone. Any other book starts the app in the background (you don't need to touch the phone) and plays once it has loaded.
- **CarPlay** always starts the book through the app, in the background; the book's row shows a spinner until it plays.

If a book can't start within about 10 seconds (the server can't be reached for a book that isn't downloaded, say), Android Auto says *"This book can't play right now"*, and on CarPlay the spinner stops and nothing plays. A [downloaded](offline-downloads.md) book is the safe choice for a drive through places with no signal.

Connecting the car never starts a book by itself. On Android, pressing play in the car (or on a Bluetooth headset) with nothing playing picks up the first book in Continue listening, when it's downloaded.

## While it plays

The car's own Now Playing screen shows the **chapter** you're in, with the book and the author under it, and a scrubber for that chapter.

- **Next and previous** move by chapter. Previous goes back to the start of the chapter when you're more than 3 seconds into it, and to the chapter before when you're right at its start.
- **Skip back and forward** jump by the lengths you set in [Settings](settings.md#playback). (Which of these buttons a car shows is up to the car's system.)
- **The chapters**: on Android Auto they're the car's queue; on CarPlay, the **Chapters** button on Now Playing lists them. Pick one to jump there.
- **Speed** (CarPlay) steps through 0.75×, 1×, 1.25×, 1.5×, 1.75× and 2×. The book remembers it, as it does a speed you pick on the phone.
- **Bookmark** adds a bookmark where you are, on the book in your account, like the bookmark button in the app; the button fills for a moment to say it's done. On Android Auto it may be under the car's "more" button. A bookmark you add with the app closed is saved as soon as the app has started in the background, and one that can't reach your server yet is kept on the phone and sent later.

Every move you make in the car (a scrub, a chapter, a skip) is saved as your new place straight away, even when it goes back to an earlier part of the book. After a jump of more than a minute, the app's [undo button](full-player.md#undo-a-jump) offers to take you back. Your place syncs to your other devices as it always does (see [Your position follows you](playback.md#your-position-follows-you)).

## Getting AudioSilo into the car

### Android Auto

1. Install the AudioSilo app on your phone and sign in to your server.
2. Connect the phone to the car (by cable, or wirelessly if your car supports it) and open Android Auto.
3. On the car's screen, open the app launcher and tap **AudioSilo**.

If AudioSilo isn't in the launcher:

- **Android Auto only lists apps installed from Google Play** (a Google Play test track counts). An app installed any other way, such as an APK, only shows up once you turn on **Unknown sources** in Android Auto's developer settings on the phone.
- Check it isn't hidden: on the phone, open Android Auto's settings and look under **Customize launcher**.
- Open the AudioSilo app on the phone once after installing it, so it has your lists ready for the car.

### CarPlay

Once CarPlay arrives (see the note at the top), AudioSilo appears on the CarPlay home screen like any audio app: connect your iPhone to the car and tap it. It works with your iPhone locked in your pocket, as long as you've unlocked it once since it last restarted.

## Good to know

- The car shows your books and plays them; it doesn't search, browse folders or take voice requests.
- Covers in the car are small copies kept on your phone. The app fetches them the first time a car connects, so the very first drive may show a few books without their cover for a moment.
- A book you start in the car is the book playing on your phone too: the mini player, the lock screen and the [sleep timer](sleep-timer.md) all work as usual.
