---
title: Listen offline
description: Download books to your phone, tablet or browser so they play with no connection to your server.
---

A downloaded book plays entirely from your device, with no connection to your server. Downloads work in the iOS and Android apps and in the web player.

## Downloading a book

1. Open the [book's page](book-page.md#listening-and-the-buttons).
2. Tap **Download for offline** (just **Download** on a phone). You can also choose it from any book's [menu](browsing.md#the-book-menu).
3. Wait for the button to read **Downloaded**. It shows the progress meanwhile, and you can tap it to cancel.

If the app reports **Not enough space for the ebook**, free up storage and try again. See [ebook size and storage errors](../troubleshooting.md#the-app-says-an-ebook-is-too-large-or-theres-not-enough-space).

The cover comes too, and so does the book's ebook, when it has one. To free the space later, tap **Downloaded**, then **Remove download**.

You can download [podcast episodes](podcasts.md#download-an-episode) the same way.

:::tip
Audiobooks are big, often hundreds of megabytes each. Download on Wi-Fi when you can.
:::

## The Downloads page

The **Downloads** tab shows everything stored on the device you're using.

![Downloads showing an episode being fetched on the server, Retry beside a stopped episode, and a book ready offline](/img/screenshots/web-player/downloads.png)

Here the server is getting one episode, and **Retry** starts the stopped one again. **Ready offline** shows how much space the downloaded book uses.

- **Storage**: how much room your downloads take, by server, and how much is still free. The figure grows while a download runs. A finished download shows the space its files actually use. A stopped download still counts the files it finished, which stay on the device.
- **Automatic downloads**: the rules for downloads you don't start yourself (below).
- **In progress**: downloads running now, waiting, or stopped.
- **On your Apple Watch** in the iPhone app, or **On your watch** in the Android app, with a paired watch: the books on your watch and the ones on their way to it. See [Apple Watch](apple-watch.md#in-downloads-on-your-iphone) or [Wear OS](wear-os.md#in-downloads-on-your-phone).
- **Ready offline**: the books on this device. Tap one to open it, or **Remove** to delete it from the device. The book, your progress and your bookmarks stay safe on the server.
- **Podcast episodes**: the episodes on this device, each with its show.

Downloads belong to each device. What you downloaded on your phone isn't on your tablet.

## Automatic downloads {/* #automatic-downloads */}

The **Automatic downloads** card holds four settings. They're the same ones as in [Settings](settings.md#up-next-and-downloads).

- The picker at the top: **Never**, **On Wi-Fi** or **Always**. With On Wi-Fi or Always, the book you start listening to downloads as you play it. The apps start at **On Wi-Fi** and the web player at **Never**. A browser can't tell Wi-Fi from mobile data, so there On Wi-Fi downloads on any connection.
- **Download podcast episodes when you start them**: the same for episodes, under the picker's rule. It's off unless you turn it on.
- **Keep the next books ready**: **Off**, **1**, **2** or **3** (below). It never downloads episodes.
- **Remove a download when you finish the book**, to free up space as you go. It removes finished episodes too. Your place is kept. It's on unless you turn it off.

### Keep the next books ready

Choose **1**, **2** or **3** to download that many books ahead while a book is loaded. The setting starts at **Off**.

- AudioSilo takes books from the top of [Up next](up-next.md) first, then from the series you're playing. It skips finished books.
- It downloads only on a connection your **Automatic downloads** setting allows.
- It leaves at least 1 GB free, or a tenth of your storage if that's more.

If you switch books offline, AudioSilo keeps your existing downloads and picks the next books from your new place. Say Up next is empty and you switch from book one to book three with **2** selected. Books four and five download next when your connection allows it.

A line under the setting says what it's doing. Books it downloaded are marked **Kept ahead**.

## When a download stops

If a download stops (the connection dropped, say), it stays in **In progress** and says why. The button on the book's page becomes **Retry download**.

Many audiobooks are made of several files. Files that finished before the download stopped are kept, so **Retry** fetches only the missing ones. This survives closing the app too.

**Retry** first asks your server for the book's current list of files. A file added since is fetched, and a file the server no longer has is skipped. Files already saved are kept, even if the list now has them in another order. With no connection, **Retry** uses the list it already has.

If some files of a downloaded book disappear from your device, the book moves back to **In progress** and says some of its files are no longer on this device. **Retry** fetches only those files. A book that [Keep the next books ready](#keep-the-next-books-ready) downloaded is removed instead, and downloaded again while it's still one of your next books.

If a streamed book stops with **Retry** and its download finishes meanwhile, **Retry** plays it from the download, at the same place.

## Downloads belong to their server

Each download belongs to the server you downloaded it from, and to the person who downloaded it. If you [share the device](profiles.md), the Downloads page shows only your own.

:::warning
**Removing a server** or **signing out** of it deletes the books you downloaded from that server on this device. Any listening that hadn't synced yet goes too. The app warns you first. To free space, use **Remove** on a single book instead.
:::

A watch has its own downloads, separate from your phone's. See [Apple Watch](apple-watch.md#storage) or [Wear OS](wear-os.md#storage).

## How downloaded playback differs {/* #how-downloaded-playback-differs */}

- Offline, a download resumes from the place saved on this device. If your server answers in time with a newer place from another device, the player starts there.
- Chapters, the sleep timer and speed all work the same. So do bookmarks and notes while the app can reach your server (see [With no connection](#with-no-connection)).
- Your listening is saved on the device and syncs the next time the app reaches your server. See [Listening on more than one device](playback.md#listening-on-more-than-one-device).
- If a book's chapters change on the server, the download picks them up next time you're online. The audio isn't downloaded again. See [When the book on the server has more files](#when-the-book-on-the-server-has-more-files).
- **Read the ebook** opens the downloaded ebook with no connection. See [Read the ebook](reading-the-ebook.md#reading-offline).
- A book's [read-along](companion.md#text) comes with the download, so **Text** and **Follow narration** work offline too.
- The book's page still opens offline, and its **Details** tab says **Plays from this device**.

## With no connection

When your device loses its network connection, downloaded books keep playing. On a phone, a bar under the page title says **Offline - changes sync when reconnected**. On a tablet or computer, that bar shows too, and the top bar says **Offline · downloads play** (just **Offline** where this device can't download).

- **Home, the Library, Folders** and every other page keep what they've already loaded. Where a list still needs your server, it says **You're offline** and loads by itself when the network returns. The web player keeps Home's shelves, Up next and your [signed-in devices](account.md#signed-in-devices) even when you reload the page.
- **Wi-Fi with no internet isn't offline.** The apps still reach a server on the same network. If one server stops answering, Home names it and **Retry** asks it again.
- **Dialogs and forms** keep what they've already loaded and what you type. A line such as **You're offline. Reconnect to change collections.** names what waits for the connection. Those buttons work again as soon as the connection returns, without reopening the dialog.
- **If your AudioSilo sign-in has ended**, **Reconnect** shows even while you're offline. Signing in again needs a connection. See [Getting back in](connecting.md#getting-back-in-after-signing-out).
- A [one-tap bookmark](bookmarks-and-notes.md) or a **Fell asleep** bookmark stays on this device until it syncs, even if you close the app.
- Notes and ratings need a connection in the phone apps. In the web player they can wait while the tab stays open.
- **The player's [Text tab](companion.md#text)** is hidden for a book that isn't downloaded.

## Community notes offline

When your server has [community metadata](book-page.md#about-this-book) switched on, a downloaded book keeps its description, [recaps and characters](recaps-and-characters.md) and Series tab. They still [hide what you haven't reached](recaps-and-characters.md#nothing-gets-spoiled-before-you-reach-it). They're refreshed when the copy is over a week old and the app can reach your server. A book your admin matched by hand can keep them too.

A book you haven't downloaded keeps the community details the app has already loaded. Until they load, **About** says they'll load when you reconnect, and so does a **Previous books** row you open. They load by themselves once you're back online.

## Downloads in a web browser {/* #downloads-in-a-web-browser */}

The web player can download books too, no app needed. Downloads are kept in the browser's own storage, so a laptop can play them with no connection.

- It needs a **secure connection** (an `https://` address). On plain `http://`, the Downloads tab doesn't appear.
- **Clearing the browser's site data deletes your downloads.** Your books and progress stay safe on the server.
- A browser can clear stored data when the disk runs very low. Installing the web player as an app (below) makes the browser protect it more. For long trips, the [iOS or Android app](mobile-apps.md) is the safest choice.
- On an **iPhone or iPad**, Safari stops playback in the background. Use the iOS app to listen with the screen off.
- A book the browser [can't play directly](playback.md#books-a-browser-cant-play-directly) can't be downloaded in the browser.
- **With more than one tab open**, a download runs in the tab that started it. Other tabs show it as **In another tab**, with its progress, and can cancel or remove it. If you close the tab running it, the other tabs show it as stopped, and **Retry** fetches only the missing files.
- If the browser's storage is full, the Downloads page says **Downloads list not saved** and keeps trying.

If a browser can't keep audio offline at all, the Downloads page says why.

## Installing the web player (PWA)

You can install the web player as an app. It gets its own icon and window, and it opens even with no connection.

- **Chrome or Edge on a computer**: click the **install icon** in the address bar.
- **Android**: in Chrome's menu, choose **Add to Home screen** or **Install app**.
- **iPhone or iPad**: in Safari, tap **Share**, then **Add to Home Screen**.

The iOS and Android apps add more than this. See [Get the apps](mobile-apps.md).

## Good to know

### When the book on the server has more files

If audio files were added to a book on your server after you downloaded it, your download doesn't have them. The book still plays:

- **Online**, with your server reachable, the player plays what's on your device and streams the rest from your server.
- **Offline**, or when your server can't be reached, a download that's missing the end of the book pauses where the downloaded part ends. The player says **The rest of this book isn't downloaded**, and the book isn't marked finished. Pressing play there shows the message again.
- **Back online**, pressing play at that point streams the rest from your server, with no need to restart the app. If the network comes back while it plays, it plays on when it reaches that point.
- A download that's missing only an earlier file, such as an intro added later, still has the book's end. Offline, reaching that end finishes the book as usual.
- **Mark as finished** on a download that's missing the end of the book shows the whole book as 100% finished, not just the downloaded part.
- Your listening on such a download syncs like any other, and the player's percentage is of the whole book. Listens from it that an earlier version of the app couldn't sync, listed under **Couldn't sync** on your [account page](account.md#listening-sync), are sent again.

To hear the rest offline, remove the download and download the book again.

### Books in MKA files {/* #books-in-mka-files */}

A book in `.mka` (Matroska) files with MP3 inside downloads as MP3 when your server has ffmpeg. It then plays offline in the apps and the web player.

A copy saved before your server could do this holds the Matroska file, which an iPhone can't play. Remove the download and download it again.

An `.mka` book with other audio inside can't be downloaded in the browser, and won't play on an iPhone. See [Supported formats](../getting-started/organizing-your-library.md#supported-formats).
