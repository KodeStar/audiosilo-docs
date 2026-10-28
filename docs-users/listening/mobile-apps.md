---
title: The mobile apps
description: "The native iOS and Android apps: current availability, installing on Android without Google Play (the APK and Obtainium), connecting, getting around with the tab bar, background playback, lock-screen controls, the car, iPhone widgets and the sleep timer Live Activity, and gapless listening."
---

AudioSilo has native apps for **iOS** and **Android**. They're the same player you know from the web - same screens, same shelves, same account - plus the things only a real app can do well: rock-solid background playback, lock-screen controls, and downloads that live comfortably on your phone.

![The home screen on a phone](/img/screenshots/web-player/phone-home.png)

## Availability

- **iOS**: the app is on the **[App Store](https://apps.apple.com/us/app/audiosilo/id6783431375)** - search for AudioSilo, or follow the link.
- **Android**: the app is on **[Google Play](https://play.google.com/store/apps/details?id=app.audiosilo)** - search for AudioSilo, or follow the link. From **version 2.5.0** it's also on GitHub as an APK you install yourself; see [Android without Google Play](#android-without-google-play).
- **CarPlay**: built into the iPhone app from **version 2.4.1**, the first version in the App Store with it; see [In the car](in-the-car.md#carplay). An older version doesn't appear in CarPlay, so update the app if you don't see it.
- **Android Auto**: built into the Android app; see [In the car](in-the-car.md#android-auto) for getting it onto the car's screen.
- **iPhone widgets and the sleep timer Live Activity**: in the iPhone app from **version 2.4.1**; see [Widgets on iPhone](#widgets-on-iphone).
- **Reading ebooks**: in the apps from **version 2.5.0**, as in the web player, offline too for a downloaded book (see [Reading the ebook](reading-the-ebook.md)). An older version of the app doesn't show **Read the ebook**, so update it if you don't see it on a book that has its EPUB.
- **Podcasts**: need **version 2.4.0** or later of the app. An older version doesn't show your server's podcast libraries at all, so update it if your server has podcasts and you don't see them. See [Podcasts](podcasts.md).

And you don't need the app to listen on your phone: the **web player works great on mobile** and can be [installed to your home screen](offline-downloads.md), downloads included.

:::note
This page describes availability at the time of writing. New features reach the apps through the normal store updates (and, on Android, a new APK), so keep the app up to date.
:::

## Android without Google Play

From version 2.5.0, every app release on GitHub carries the Android app as an APK file, named like `AudioSilo-2.5.0.apk`. It's the same app as on Google Play and usually arrives first: Google Play reviews each update, which can take days, while the APK is there the day the release is published. There are two ways to use it.

### Install the APK yourself

1. On your phone, open the [latest AudioSilo app release](https://github.com/KodeStar/audiosilo-frontend/releases/latest).
2. Under **Assets**, tap the `.apk` file to download it.
3. Open the downloaded file. The first time, Android asks whether the app you opened it from may install unknown apps: allow it, go back and tap **Install**.

An APK installed this way doesn't update itself. To update, download the next release's APK and install it over the top: your downloads and sign-in stay.

### Let Obtainium keep it up to date

[Obtainium](https://github.com/ImranR98/Obtainium) is a free, open-source Android app that installs apps straight from their GitHub releases and tells you when a new one is out.

1. Install Obtainium from its [releases page](https://github.com/ImranR98/Obtainium/releases/latest), the same way as an APK above.
2. In Obtainium, open **Add app** and paste `https://github.com/KodeStar/audiosilo-frontend` as the **App source URL**.
3. Tap **Add**. Obtainium finds the newest release and its APK.
4. Tap **Install**, and allow Obtainium to install unknown apps when Android asks.

From then on Obtainium checks for new releases in the background and offers the update when one appears (how often it checks is under **Background update checking interval** in its settings). You can also open it and check by hand.

### Pick one source and stay with it

The Google Play app and the GitHub APK are **signed differently**, so neither can update the other. To switch, uninstall the app first, then install it from the other source.

Uninstalling removes what the app keeps on your phone: your **downloaded books** and its **sign-in** to your server. Your listening progress, bookmarks and favourites are on your server, so reconnect the app (a [QR code](connecting.md) is quickest) and download the books you want offline again.

:::note[Android Auto and an APK]
With the APK, AudioSilo shows in Android Auto only after one extra setting: see [In the car](in-the-car.md#android-auto).
:::

## Connecting the app

Signing the app in is usually a scan, not typing - all the routes are covered in [Connecting and signing in](connecting.md):

- **Scan a QR code** - tap **Scan QR code** on the app's connect screen and point it at the pairing QR on your server's connect page (or at the **Add a device** QR on a device that's already signed in - see [Adding more devices later](connecting.md#adding-more-devices-later)).
- **Tap a link** - an invite link, or an `audiosilo://` link, opens the app and signs it in automatically.
- **Type it in** - server address plus an invite code or username and password, if you prefer.

A server on its default **self-signed certificate** is one the apps can't trust, so at home they connect to it over plain HTTP, which the server offers to devices on your home network ([plain HTTP at home](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect)). A QR code or invite link handles that by itself; when typing the address, put `http://` in front (`http://192.168.1.20:8080`). Away from home, the apps need the server to have a certificate they trust - see [Remote access](../getting-started/remote-access.md).

## Getting around the app

On a phone, the app uses your phone's own tab bar along the bottom of the screen, with five tabs: **Home**, **Library**, **Search**, **Downloads** and **Me** ([You](you.md): your listening, your year, the Journal, Settings, your household and your account). Each tab keeps its place while you visit the others. See [Getting around](browsing.md#getting-around) for what each one holds.

- **iPhone**: the standard iOS tab bar. On **iOS 26 or later** it's the translucent "Liquid Glass" bar, with **Search** set apart as its own round button; the bar shrinks as you scroll down, and the [mini player](playback.md#the-mini-player-and-the-player-bar) sits inside it, just above the tabs. On older iOS versions the mini player floats just above the bar instead.
- **Android**: the standard Material navigation bar, with every tab labelled and the current one highlighted by a soft pink pill. The mini player floats just above it.

On an **iPad or Android tablet**, the app uses the same layout as the web player in a wide window: a top bar with Home, Library and Downloads, a search field and your settings, and a player bar along the bottom while a book plays. If the app's window changes size - in split view on an iPad, for example - it switches between the two layouts without losing your place in any tab.

## Background playback

Playback keeps going when you switch apps, turn the screen off, or pocket the phone. Interruptions are handled the way you'd hope: a phone call or a satnav prompt pauses the book, and it resumes afterwards only if it was actually playing before - a stray system chime won't restart a paused book.

## Lock-screen controls

Both apps show the current chapter on the lock screen, with a chapter scrubber and skip buttons, and work with headphone buttons; see [Lock-screen and headphone controls](playback.md#lock-screen-and-headphone-controls). At the end of a sleep timer a [shake of the phone](sleep-timer.md#shake-to-extend) keeps you listening.

## In the car

The apps put your books on the car's screen through **Android Auto** and **CarPlay** (see [Availability](#availability)). See [In the car](in-the-car.md).

## Casting to a TV or speaker

Both apps can play a book on a Chromecast, a TV with Google Cast or a Nest speaker, with the phone as the remote. See [Chromecast](chromecast.md) for what your setup needs.

## Widgets on iPhone

The iPhone app comes with a home screen widget and a Live Activity for the sleep timer (see [Availability](#availability)).

- **Continue listening** - a widget for your home screen in two sizes. The **small** one shows the cover and title of the book you're listening to (or listened to last); the **medium** one adds the author, the chapter, the time left at your speed and a progress bar. It's for looking at, with no buttons: tap it to open the player on that book. Before you've played anything it says *"Play a book and it shows up here."*, and it clears when you remove that book's server from the app. Add it as you would any widget: touch and hold the home screen, tap **Edit** (or **+**), and pick AudioSilo.
- **The sleep timer** - a Live Activity on the lock screen while a timer counts down; see [On the lock screen](sleep-timer.md#on-the-lock-screen-iphone).

There are no widgets on Android yet.

## Gapless, chapter-aware listening

Many audiobooks arrive as dozens of MP3 files. The apps play multi-file books **gaplessly** - chapter boundaries pass without a hiccup - and treat the whole book as one continuous timeline, exactly like a single-file audiobook. Playback speed is pitch-corrected on both platforms, so 1.5× sounds faster, not higher.

## The same app as the web player

If you've used the web player, you already know the app - they are literally the same application, shipped to different places. Home shelves, library browsing, search, favourites, [bookmarks and notes](bookmarks-and-notes.md), the [Journal](journal.md), [downloads](offline-downloads.md), your [listening stats](you.md), and [settings](settings.md) all look and work the same, just arranged for a phone with a tab bar along the bottom:

![A book's page on a phone](/img/screenshots/web-player/phone-book-detail.png)

And because your position, favourites, and bookmarks live on the server, moving between phone, tablet, and desktop is seamless - pause on one, resume on another. See [Playing a book](playback.md).
