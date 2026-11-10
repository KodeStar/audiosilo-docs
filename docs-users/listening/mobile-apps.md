---
title: Get the apps
description: "Where to get the AudioSilo player: the web player on your server, the iOS app and the Android app, with or without Google Play."
---

You can listen to AudioSilo in three places. All three are the same player, with the same screens and the same account.

## Where to get it {/* #availability */}

- **Web player** - open `/web` on your server, for example `https://books.example.com/web`. Nothing to install. On a phone you can [add it to your home screen](offline-downloads.md).
- **iPhone and iPad** - get AudioSilo from the **[App Store](https://apps.apple.com/us/app/audiosilo/id6783431375)**. It includes the [Apple Watch](apple-watch.md) app.
- **Android** - get AudioSilo from **[Google Play](https://play.google.com/store/apps/details?id=app.audiosilo)**, or install it [without Google Play](#android-without-google-play).

Then [connect the app to your server](connecting.md). A QR code is quickest.

New features reach the apps through normal updates. If something on these pages is missing from your app, such as CarPlay, podcasts or reading the ebook, update the app.

![The home screen on a phone](/img/screenshots/web-player/phone-home.png)

## What the apps add

The iOS and Android apps do a few things a browser can't do as well:

- **Background playback.** Books keep playing with the screen off. A phone call pauses the book, and it resumes afterwards only if it was playing.
- **Lock-screen and headphone controls.** See [Lock-screen and headphone controls](playback.md#lock-screen-and-headphone-controls).
- **In the car.** Books on the car's screen with [CarPlay and Android Auto](in-the-car.md).
- **Apple Watch.** Send books to your watch and leave the phone at home. See [Listen on your Apple Watch](apple-watch.md).
- **Casting.** Play on a Chromecast, a Google Cast TV or a Nest speaker. See [Cast to a speaker or TV](chromecast.md).
- **Downloads** that live on your phone. See [offline downloads](offline-downloads.md).

Books made of many files play gaplessly, as one continuous timeline.

## Getting around the app

On a phone, the tab bar along the bottom has five tabs: **Home**, **Library**, **Search**, **Downloads** and **Me**. Each tab keeps its place while you visit the others. See [Getting around](browsing.md#getting-around).

On an iPad or Android tablet, the app uses the web player's wide layout: a top bar, and a player bar along the bottom.

## Widgets on iPhone

The iPhone app has a **Continue listening** widget for your home screen. It shows the book you're listening to; tap it to open the player.

To add it:

1. Touch and hold the home screen.
2. Tap **Edit** (or **+**).
3. Pick AudioSilo.

While a sleep timer runs, it also shows on the lock screen. See [the sleep timer](sleep-timer.md#on-the-lock-screen-iphone). There are no widgets on Android yet.

## Android without Google Play

Each app release on GitHub includes the Android app as an APK file, like `AudioSilo-2.5.0.apk`. It's the same app as on Google Play, and it often arrives a few days sooner.

### Install the APK yourself

1. On your phone, open the [latest AudioSilo app release](https://github.com/KodeStar/audiosilo-frontend/releases/latest).
2. Under **Assets**, tap the `.apk` file to download it.
3. Open the downloaded file.
4. If Android asks, allow the app you opened it from to install unknown apps.
5. Go back and tap **Install**.

This app doesn't update itself. To update, install the next release's APK over the top. Your downloads and sign-in stay.

### Let Obtainium keep it up to date

[Obtainium](https://github.com/ImranR98/Obtainium) is a free Android app that installs apps from their GitHub releases and tells you about updates.

1. Install Obtainium from its [releases page](https://github.com/ImranR98/Obtainium/releases/latest), the same way as above. `app-release.apk` works on any phone.
2. In Obtainium, open **Add app**.
3. Paste `https://github.com/KodeStar/audiosilo-frontend` as the **App source URL** and tap **Add**.
4. Tap **Install**, and allow Obtainium to install unknown apps if Android asks.

Obtainium then checks for new releases in the background and offers each update.

### Pick one source and stay with it

The Google Play app and the APK can't update each other. To switch, uninstall the app, then install it from the other source.

Uninstalling removes your downloaded books, the app's sign-ins and any [profiles](profiles.md) on the phone. Your progress, bookmarks and favourites are safe on your server. Open the app online before you uninstall, so offline progress syncs first.

:::note[Android Auto and an APK]
With the APK, AudioSilo shows in Android Auto only after one extra setting. See [Listen in the car](in-the-car.md#android-auto).
:::
