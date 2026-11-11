---
title: Listen offline
description: Download books to your phone, tablet or browser so they play with no connection to your server.
---

A downloaded book plays entirely from your device, with no connection to your server. Downloads work in the iOS and Android apps and in the web player.

## Downloading a book

1. Open the [book's page](book-page.md#listening-and-the-buttons).
2. Tap **Download for offline** (just **Download** on a phone). You can also choose it from any book's [menu](browsing.md#the-book-menu).
3. Wait for the button to read **Downloaded**. It shows the progress meanwhile, and you can tap it to cancel.

The cover comes too, and so does the book's ebook, when it has one. To free the space later, tap **Downloaded**, then **Remove download**.

[Podcast episodes](podcasts.md) can't be downloaded yet. They always stream from your server.

:::tip
Audiobooks are big, often hundreds of megabytes each. Download on Wi-Fi when you can.
:::

## The Downloads page

The **Downloads** tab shows everything stored on the device you're using.

![The Downloads page: storage by server, the automatic download rules, and the books ready offline](/img/screenshots/web-player/downloads.png)

- **Storage**: how much room your downloads take, by server, and how much is still free.
- **Automatic downloads**: the rules for downloads you don't start yourself (below).
- **In progress**: downloads running now, waiting, or stopped.
- **On your Apple Watch**, in the iPhone app with a paired watch: the books on your watch. See [Apple Watch](apple-watch.md#in-downloads-on-your-iphone).
- **Ready offline**: the books on this device. Tap one to open it, or **Remove** to delete it from the device. The book, your progress and your bookmarks stay safe on the server.

Downloads belong to each device. What you downloaded on your phone isn't on your tablet.

## Automatic downloads

The **Automatic downloads** card holds three settings. They're the same ones as in [Settings](settings.md#up-next-and-downloads).

- The picker at the top: **Never**, **On Wi-Fi** or **Always**. With On Wi-Fi or Always, the book you start listening to downloads as you play it. The apps start at **On Wi-Fi** and the web player at **Never**. A browser can't tell Wi-Fi from mobile data, so there On Wi-Fi downloads on any connection.
- **Keep the next books ready**: **Off**, **1**, **2** or **3** (below).
- **Remove a download when you finish the book**, to free up space as you go. Your place is kept. It's on unless you turn it off.

### Keep the next books ready

Set this to 1, 2 or 3, and while you listen AudioSilo downloads that many of your **next** books. They're ready before you need them. It's **Off** unless you turn it on.

- **Which books**: the top of your [Up next](up-next.md) queue first, then the next books in the series you're playing. Finished books are skipped.
- **When**: only while a book is playing or loaded.
- **On what connection**: it follows the picker at the top of the card. With **Never**, it does nothing.
- **How much room**: it always leaves at least 1 GB free, or a tenth of your storage if that's more.

A line under the setting says what it's doing. Books it downloaded are marked **Kept ahead**.

## When a download stops

If a download stops (the connection dropped, say), it stays in **In progress** and says why. The button on the book's page becomes **Retry download**.

Many audiobooks are made of several files. Files that finished before the download stopped are kept, so **Retry** fetches only the missing ones. This survives closing the app too.

## Downloads belong to their server

Each download belongs to the server you downloaded it from, and to the person who downloaded it. If you [share the device](profiles.md), the Downloads page shows only your own.

:::warning
**Removing a server** or **signing out** of it deletes the books you downloaded from that server on this device. Any listening that hadn't synced yet goes too. The app warns you first. To free space, use **Remove** on a single book instead.
:::

A watch has its own downloads, separate from your phone's. See [Apple Watch](apple-watch.md#storage).

## How downloaded playback differs

Very little changes:

- A downloaded book plays from the device, so it starts instantly and never buffers.
- Chapters, the sleep timer and speed all work the same. So do bookmarks and notes while the app can reach your server (see [With no connection](#with-no-connection)).
- It starts where you left off, even offline. If you listened later on another device, it starts there, as long as you've opened the app online since.
- Your listening is saved on the device and syncs the next time the app reaches your server. See [Listening on more than one device](playback.md#listening-on-more-than-one-device).
- If a book's chapters change on the server, the download picks them up next time you're online. The audio isn't downloaded again. See [When the book on the server has more files](#when-the-book-on-the-server-has-more-files).
- **Read the ebook** opens the downloaded ebook with no connection. See [Read the ebook](reading-the-ebook.md#reading-offline).
- A book's [read-along](companion.md#text) comes with the download, so **Text** and **Follow narration** work offline too.
- The book's page still opens offline, and its **Details** tab says **Plays from this device**.

## With no connection

When your device has no network, downloaded books play and everything else waits for your server:

- **Home, the Library, Folders** and any other page or list show **You're offline** in place of what they haven't loaded yet. Anything already loaded stays on screen. When the network comes back, they load by themselves.
- **Wi-Fi with no internet isn't offline.** The apps still reach a server on the same network. If a server doesn't answer, the page says so and offers **Retry**.
- **Bookmarks, notes and ratings** aren't kept for later in the iOS and Android apps. One you make with no connection fails straight away with a message, so add it again once you're online. Only a bookmark made [from the car's screen](in-the-car.md#while-it-plays) is kept and sent later.
- **The player's [Text tab](companion.md#text)** is hidden for a book that isn't downloaded.

## Community notes offline

When your server has [community metadata](book-page.md#about-this-book) switched on, a downloaded book keeps its description, [recaps and characters](recaps-and-characters.md) and Series tab. They still [hide what you haven't reached](recaps-and-characters.md#nothing-gets-spoiled-before-you-reach-it). They're refreshed when the copy is over a week old and the app can reach your server.

## Downloads in a web browser

The web player can download books too, no app needed. Downloads are kept in the browser's own storage, so a laptop can play them with no connection.

- It needs a **secure connection** (an `https://` address). On plain `http://`, the Downloads tab doesn't appear.
- **Clearing the browser's site data deletes your downloads.** Your books and progress stay safe on the server.
- A browser can clear stored data when the disk runs very low. Installing the web player as an app (below) makes the browser protect it more. For long trips, the [iOS or Android app](mobile-apps.md) is the safest choice.
- On an **iPhone or iPad**, Safari stops playback in the background. Use the iOS app to listen with the screen off.
- A book the browser [can't play directly](playback.md#books-a-browser-cant-play-directly) can't be downloaded in the browser.

If a browser can't keep audio offline at all, the Downloads page says why.

## Installing the web player (PWA)

You can install the web player as an app. It gets its own icon and window, and it opens even with no connection.

- **Chrome or Edge on a computer**: click the **install icon** in the address bar.
- **Android**: in Chrome's menu, choose **Add to Home screen** or **Install app**.
- **iPhone or iPad**: in Safari, tap **Share**, then **Add to Home Screen**.

Installing it also makes the browser less likely to clear your downloads. The iOS and Android apps add more than this. See [Get the apps](mobile-apps.md).

## Good to know

### When the book on the server has more files

If audio files were added to a book on your server after you downloaded it, your download doesn't have them. The book still plays:

- **Online**, with your server reachable, the player plays what's on your device and streams the rest from your server.
- **Offline**, or when your server can't be reached, a download that's missing the end of the book pauses where the downloaded part ends. The player says **The rest of this book isn't downloaded**, and the book isn't marked finished. Pressing play there shows the message again.
- A download that's missing only an earlier file, such as an intro added later, still has the book's end. Offline, reaching that end finishes the book as usual.

To hear the rest offline, remove the download and download the book again.

### Books in MKA files

A book in `.mka` (Matroska) files with MP3 inside downloads as MP3 when your server has ffmpeg. It then plays offline in the apps and the web player.

A copy saved before your server could do this holds the Matroska file, which an iPhone can't play. Remove the download and download it again.

An `.mka` book with other audio inside can't be downloaded in the browser, and won't play on an iPhone. See [Supported formats](../getting-started/organizing-your-library.md#supported-formats).
