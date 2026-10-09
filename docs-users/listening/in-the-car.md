---
title: In the car
description: "Listening with Android Auto and Apple CarPlay: getting AudioSilo onto the car's screen, the lists it shows, starting a book, chapters, skips, speed, bookmarks and voice, and what the car's messages mean."
---

The AudioSilo apps for Android and iPhone can put your books on a car's screen: **Android Auto** on Android, **CarPlay** on iPhone. The car shows the same lists on both, plays through the app on your phone, and saves your place exactly as the phone does. The web player has no car mode.

:::note
CarPlay depends on Apple's approval; see [Availability](mobile-apps.md#availability).
:::

## Getting AudioSilo into the car

### Android Auto

1. Install the AudioSilo app on your phone and sign in to your server.
2. Connect the phone to the car (by cable, or wirelessly if your car supports it) and open Android Auto.
3. On the car's screen, open the app launcher and tap **AudioSilo**.

If AudioSilo isn't in the launcher:

- **Android Auto only lists apps installed from Google Play** (a Google Play test track counts). An app installed any other way, such as an APK, only shows up once you turn on **Unknown sources** in Android Auto's developer settings on the phone.
- Check it isn't hidden: on the phone, open Android Auto's settings and look under **Customize launcher**.

### CarPlay

AudioSilo appears on the CarPlay home screen like any audio app: connect your iPhone to the car and tap it. It works with your iPhone locked in your pocket, as long as you've unlocked it once since it last restarted; until then it waits, and never signs you out.

## What the car shows

Up to four lists, as tabs along the car's screen:

- **Continue listening** - the books you're part-way through, on every server you're signed in to, the one you're playing first (the same books as Home's Continue listening).
- **Up next** - the [Up next](up-next.md) queue on your default server, where it has one.
- **Downloads** - the books downloaded to your phone, newest first.
- **Library** - the most recently added books in the library you have selected.

Each book shows its cover, its author and, once you've started it, the time left at that book's speed (*"Arthur Conan Doyle · 3h 12m left"*). The car also marks how far through each book you are and whether you've finished it. Cars show only so many items, so the longer lists are cut short.

The lists follow what you do on the phone: start a book, pause, add to your queue or finish a download, and the car catches up within a few seconds. If none of your servers can be reached when the car connects, the car keeps the lists it showed last time, and your downloaded books still play. The car's words are in the language you chose for the app.

## Playing a book

Tap a book to play it from your saved place; tap the book that's already playing and it simply carries on. It plays through your phone's AudioSilo app, with the same speed, auto-rewind and [Smart speed and Voice boost](full-player.md#smart-speed-and-voice-boost) settings as on the phone. Connecting the car never starts a book by itself.

| Feature | Android Auto | CarPlay |
|---|---|---|
| Start a **downloaded** book | Straight away, even with the app closed on your phone | Through the app, in the background (the row shows a spinner) |
| Start any other book | Starts the app in the background, then plays | Through the app, in the background (the row shows a spinner) |
| Chapters | The car's queue | The **Chapters** button on Now Playing |
| Next and previous | By chapter | By chapter |
| Skip back and forward | Yes, by your [skip lengths](settings.md#playback) | Where the car shows them, by your skip lengths |
| Speed | - | The speed button: 0.75× to 2× |
| Bookmark | Yes (it may be under the car's "more" button) | Yes |
| Downloaded mark on each book | Yes | - |
| Voice | *"Hey Google, play AudioSilo"* | - |
| Play button with nothing playing | Picks up the first book in Continue listening, when it's downloaded | - |

A [downloaded](offline-downloads.md) book is the safe choice for a drive through places with no signal.

**By voice (Android Auto):** *"Hey Google, play AudioSilo"* carries on with the book you're listening to, or starts the first book in Continue listening. Name a book (*"play The Hound of the Baskervilles on AudioSilo"*) and it plays the first book in the car's lists whose title contains what you said.

## While it plays

The car's own Now Playing screen shows the **chapter** you're in, with the book and the author under it, and a scrubber for that chapter. Previous goes back to the start of the chapter when you're more than 3 seconds into it, and to the chapter before when you're right at its start. A speed you pick in the car is remembered for the book, as one you pick on the phone is.

**Bookmark** adds a bookmark where you are, on the book in your account, like the bookmark button in the app; the button fills for a moment to say it's done. A bookmark you add with the app closed is saved as soon as the app has started in the background, and one that can't reach your server yet is kept on the phone and sent later.

Every move you make in the car is saved as your new place, as a move on the lock screen is (see [Your position follows you](playback.md#your-position-follows-you)).

## What the car says

| The car says | Why | What to do |
|---|---|---|
| *"Connect a server in AudioSilo to listen in the car"* | The app isn't signed in to a server | Open AudioSilo on your phone and [connect a server](connecting.md) |
| *"Nothing here yet"* | That list is empty (nothing in progress, nothing queued or downloaded) | Start, queue or download a book on the phone |
| *"This book can't play right now"* (Android Auto) | The book didn't start within about 10 seconds: its server can't be reached and it isn't downloaded, say | Check the phone's connection, or play a downloaded book. On CarPlay the spinner stops and nothing plays |

## Good to know

- The car has no search button and doesn't browse folders.
- Covers in the car are small copies kept on your phone. The app fetches them the first time a car connects, so the very first drive may show a few books without their cover for a moment.
- A book you start in the car is the book playing on your phone too: the mini player, the lock screen and the [sleep timer](sleep-timer.md) all work as usual.
- The [automatic sleep timer at night](sleep-timer.md#starting-a-timer-automatically-at-night) doesn't start while a car is connected.
