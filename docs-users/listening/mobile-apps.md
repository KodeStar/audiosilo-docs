---
title: The mobile apps
description: "The native iOS and Android apps: current availability, connecting, getting around with the tab bar, background playback, lock-screen controls, the car, iPhone widgets and the sleep timer Live Activity, and gapless listening."
---

AudioSilo has native apps for **iOS** and **Android**. They're the same player you know from the web - same screens, same shelves, same account - plus the things only a real app can do well: rock-solid background playback, lock-screen controls, and downloads that live comfortably on your phone.

![The home screen on a phone](/img/screenshots/web-player/phone-home.png)

## Availability

- **iOS**: the app is on the **[App Store](https://apps.apple.com/us/app/audiosilo/id6783431375)** - search for AudioSilo, or follow the link.
- **Android**: the app is finished and in active use, but **not yet on Google Play** - it's going through Google Play's testing tracks, which require a testing period before an app can go public. If you'd like early access, ask whoever runs your server whether a tester invite is available, or check the AudioSilo project on GitHub for current status.

And you don't need the app to listen on your phone: the **web player works great on mobile** and can be [installed to your home screen](offline-downloads.md), downloads included.

:::note
This page describes availability at the time of writing; once the Android app reaches Google Play, installing it will be a normal store search away too.
:::

## Connecting the app

Signing the app in is usually a scan, not typing - all the routes are covered in [Connecting and signing in](connecting.md):

- **Scan a QR code** - tap **Scan QR code** on the app's connect screen and point it at the pairing QR on your server's connect page (or at the **Add a device** QR on a device that's already signed in - see [Adding more devices later](connecting.md#adding-more-devices-later)).
- **Tap a link** - an invite link, or an `audiosilo://` link, opens the app and signs it in automatically.
- **Type it in** - server address plus an invite code or username and password, if you prefer.

## Getting around the app

On a phone, the app uses your phone's own tab bar along the bottom of the screen, with five tabs: **Home**, **Library**, **Search**, **Downloads** and **Me** ([You](you.md): your listening, your year, the Journal, Settings and your account). Each tab keeps its place while you visit the others. See [Getting around](browsing.md#getting-around) for what each one holds.

- **iPhone**: the standard iOS tab bar. On **iOS 26 or later** it's the translucent "Liquid Glass" bar, with **Search** set apart as its own round button; the bar shrinks as you scroll down, and the [mini player](playback.md#the-mini-player-and-the-player-bar) sits inside it, just above the tabs. On older iOS versions the mini player floats just above the bar instead.
- **Android**: the standard Material navigation bar, with every tab labelled and the current one highlighted by a soft pink pill. The mini player floats just above it.

On an **iPad or Android tablet**, the app uses the same layout as the web player in a wide window: a top bar with Home, Library and Downloads, a search field and your settings, and a player bar along the bottom while a book plays. If the app's window changes size - in split view on an iPad, for example - it switches between the two layouts without losing your place in any tab.

## Background playback

Playback keeps going when you switch apps, turn the screen off, or pocket the phone. Interruptions are handled the way you'd hope: a phone call or a satnav prompt pauses the book, and it resumes afterwards only if it was actually playing before - a stray system chime won't restart a paused book.

## Lock-screen controls

- **Android** gives you full audiobook controls on the lock screen and in the notification: **previous chapter**, a **draggable chapter scrubber**, **next chapter**, and **30-second skip back/forward** buttons - no need to unlock the phone to hop around a book.
- **iOS** shows the **chapter** on the lock screen and in Control Centre, with the book and author under it, a **scrubber for that chapter**, play/pause and **skip back/forward** buttons that use the skip lengths from your in-app [Settings](settings.md#playback).

Headphone and earbud buttons work everywhere, and at the end of a sleep timer a [shake of the phone](sleep-timer.md#shake-to-extend) keeps you listening. A move from the lock screen, your headphones or a car is saved as your new place, like one in the app (see [Lock-screen and headphone controls](playback.md#lock-screen-and-headphone-controls)).

## In the car

The apps put your books on the car's screen through **Android Auto** (Android) and **CarPlay** (iPhone, with a later app update): Continue listening, Up next, Downloads and your library, with chapters, skips and a bookmark button. See [In the car](in-the-car.md).

## Widgets on iPhone

The iPhone app comes with a home screen widget and a Live Activity for the sleep timer. Both arrive with the **next iOS app update**; the version in the App Store today doesn't have them yet.

- **Continue listening** - a widget for your home screen in two sizes. The **small** one shows the cover and title of the book you're listening to (or listened to last); the **medium** one adds the author, the chapter, the time left at your speed and a progress bar. It's for looking at, with no buttons: tap it to open the player on that book. Before you've played anything it says *"Play a book and it shows up here."*, and it clears when you remove that book's server from the app. Add it as you would any widget: touch and hold the home screen, tap **Edit** (or **+**), and pick AudioSilo.
- **The sleep timer** - while a [sleep timer](sleep-timer.md) counts down, a Live Activity shows the book, the chapter and the countdown on the lock screen and, on iPhones that have one, in the Dynamic Island. See [On the lock screen](sleep-timer.md#on-the-lock-screen-iphone).

There are no widgets on Android yet.

## Gapless, chapter-aware listening

Many audiobooks arrive as dozens of MP3 files. The apps play multi-file books **gaplessly** - chapter boundaries pass without a hiccup - and treat the whole book as one continuous timeline, exactly like a single-file audiobook. Playback speed is pitch-corrected on both platforms, so 1.5× sounds faster, not higher.

## The same app as the web player

If you've used the web player, you already know the app - they are literally the same application, shipped to different places. Home shelves, library browsing, search, favourites, [bookmarks and notes](bookmarks-and-notes.md), the [Journal](journal.md), [downloads](offline-downloads.md), your [listening stats](you.md), and [settings](settings.md) all look and work the same, just arranged for a phone with a tab bar along the bottom:

![A book's page on a phone](/img/screenshots/web-player/phone-book-detail.png)

And because your position, favourites, and bookmarks live on the server, moving between phone, tablet, and desktop is seamless - pause on one, resume on another. See [Playing a book](playback.md).
