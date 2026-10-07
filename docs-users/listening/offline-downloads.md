---
title: Offline downloads
description: "Downloading books to your device, the Downloads page, community notes that come along offline, automatic downloads and keeping the next books ready, what happens when a download stops, offline listening in the browser, and installing the web player as an app."
---

Streaming needs your server; downloads don't. Download a book before a flight, a commute through tunnels, or a weekend off-grid, and it plays entirely from your device - no connection to the server required.

## Downloading a book

The download button lives on the [book's page](book-page.md#listening-and-the-buttons), beside **Resume**: **Download for offline** (just **Download** on a phone). You can also use **Download for offline** in any book's [menu](browsing.md#the-book-menu).

While a download runs, the button shows how far it has got (*"52% · Cancel"*, or just **Cancel** on a phone; tap it to cancel), with the progress underneath (*"Downloading 42% · 210 MB / 500 MB"*). When it's done, the button reads **Downloaded** and the cover is saved too. Tap **Downloaded** to see how much room the book takes on this device and to **Remove download**, which asks first and says how much space it frees.

If a download stops (the connection dropped, the phone slept at the wrong moment), the button becomes **Retry download** - see [When a download stops](#when-a-download-stops).

:::tip
Audiobooks are big - often hundreds of megabytes each. Download on Wi‑Fi when you can, and keep an eye on the storage card on the Downloads page.
:::

## The Downloads page

The **Downloads** tab is everything stored on the device you're using:

![The Downloads page: storage by server, the automatic download rules, and the books ready offline](/img/screenshots/web-player/downloads.png)

- **At the top**, how much your downloads take up: "On this device · 3.2 GB". In the web player it also says roughly how much the browser lets this site keep: "On this browser · 3.2 GB of about 50 GB the browser allows".
- **Storage** - a bar with a colour for each server you've downloaded from, so you can see which server's books are taking the room. On a phone or tablet the bar also shows the space **Other apps** use, and a line under it says how much is still free. (A browser can't see other apps, so the web player shows the room it has left instead.)
- **Automatic downloads** - the rules for downloads you don't start by hand (below).
- **In progress** - downloads running now, waiting their turn, or stopped. A running one shows its percentage and how much is left to fetch ("42% · 210 MB to go") with **Cancel**.
- **Ready offline** - the books on this device, newest first, grouped by server when you have more than one (each group says how much room it takes). Each book shows where you are in it (Not started, a percentage, or Finished). Tap a book to open its page, or its play button to start it. **Remove** asks first, then deletes the book's audio from the device. The book itself, and all your progress and bookmarks, are untouched on the server - you can stream it again or download it again any time.

Downloads are per-device: what you downloaded on your phone isn't automatically on your tablet.

## Automatic downloads

The **Automatic downloads** card on the Downloads page holds three settings. They're the same settings as the **Up next** section of [Settings](account.md#up-next), so changing one place changes the other.

- **Download automatically**: **Never**, **On Wi-Fi** or **Always**. With On Wi-Fi or Always, the book you start listening to is downloaded as you play it, and playback quietly switches to the downloaded copy once it's on the device. On Wi-Fi skips mobile data on a phone or tablet. A browser can't tell Wi-Fi from mobile data, so in the web player On Wi-Fi downloads on any connection, and the card says so. Like Keep the next books ready (below), it leaves at least 1 GB (or a tenth of your storage) free, and it won't fetch a book you cancelled or removed earlier in the session.
- **Keep the next books ready**: **Off**, **1**, **2** or **3** (below).
- **Remove a download when you finish the book**, to free up space as you go. Your place in the book is kept. On out of the box.

### Keep the next books ready

Set it to 1, 2 or 3 and, while you're listening, AudioSilo downloads that many of the books you'll want **next**, so they're ready before you need them - handy before a trip, or if your commute has patchy signal. It's **Off** unless you turn it on, because it downloads on its own.

- **Which books.** The books at the top of your [Up next](up-next.md) queue come first, then the next books in the series you're playing. Books you've already finished are skipped.
- **When.** Only while a book is playing or loaded. It waits a few seconds after you start a book, so the book you just started downloads first.
- **On what connection.** It follows **Download automatically**: with **On Wi-Fi** it waits for Wi-Fi on a phone or tablet, and with **Never** it does nothing at all (the card asks you to turn automatic downloads on).
- **How much room it leaves.** It always leaves at least **1 GB free**, or a tenth of your storage if that's more. A book that would take you past that line waits, and so does every book after it.
- **It respects your choices.** A book you cancel or remove isn't fetched again behind your back until you next open the app (downloading it yourself lifts that). A download that stops waits for you to retry it.

A status line under the setting (here and in Settings) tells you what it's doing: getting the next books ready, waiting for Wi-Fi, paused because there isn't enough free space, or that the next books are ready offline. Books it is holding back show in **In progress** with the reason ("Waiting for Wi-Fi", "Needs more free space", "Waiting to start") and a **Cancel** button, and the books it downloaded are marked **Kept ahead** under **Ready offline**.

## When a download stops

A stopped download stays in **In progress**, saying where it stopped and why, in plain words: the server stopped responding, the server couldn't send the book, the device (or browser) ran out of space, or you're no longer signed in to that server.

Many audiobooks are made of several files. If some of them had finished before the download stopped, they're **kept**: the row says so ("Stopped at 50% · Your 50% is kept"), and **Retry** fetches only the files that are still missing. For a book that's one big file, or if nothing had finished yet, the row says Retry starts it again.

Kept files survive closing the app, too. A download the app closed part-way through comes back as stopped, saying "The app closed before it finished", with the files it had already finished kept for **Retry**. If any of those files has gone missing in the meantime, the download is cleared away instead, and starts from the beginning next time.

## Downloads belong to their server

Each downloaded book belongs to the **server you downloaded it from**. If you've connected the app to [more than one server](connecting.md), the Downloads page shows all of them together, but each book stays tied to its own server.

That matters when you disconnect a server:

- **Removing a server** (Settings → Servers) or **signing out** of it **deletes that server's downloaded books from this device**, along with any listening progress that hadn't synced back to the server yet.
- The app warns you first when the server you're removing has books downloaded on the device, so you're never caught out.
- Your other servers' downloads are untouched, and nothing on the server itself is affected - reconnect and you can download them again any time.

:::tip
If you just want to free up space, use **Remove** on a single book instead - that removes one book and leaves the server connected.
:::

## How downloaded playback differs

Honestly? Barely at all - that's the point:

- A downloaded book **plays from local files**, so it starts instantly and never buffers, whether or not the server is reachable.
- Chapters, the sleep timer, speed, bookmarks, and notes all work the same.
- Your listening progress is saved on the device while you're offline and **synced to the server automatically** the next time the app can reach it - so even offline listening ends up on your other devices' *Continue listening* shelf.
- The book's page still opens offline for downloaded books, community notes and all ([below](#community-notes-offline)), and its **Details** tab says the book **Plays from this device**.

## Community notes offline

When your server has [community metadata](book-page.md#about-this-book) switched on, a downloaded book keeps its community material on the device with it: the description on its page, the **Recaps**, **Characters** and **Series** tabs, and the player's [companion](companion.md) (Who's who and Story so far). So a book you downloaded before a flight still tells you who's who in the air, and still [hides what you haven't reached](book-page.md#nothing-gets-spoiled-before-you-reach-it), because that check happens on your device.

It also keeps the book that comes **before it** in the series (in the reading order you picked), so the **Previous books** catch-up has at least that one to show offline.

- It's saved straight after the download finishes, and it goes when you remove the download.
- Books you downloaded before AudioSilo kept this get it the next time you open the app with the server reachable.
- A kept copy older than a week is refreshed when the app opens and can reach your server, so new recaps and character notes reach your downloads too.
- A book the community database doesn't know (or a server with the lookup switched off) simply has nothing extra to keep.

## Downloads in a web browser

Yes, the **web player can download books too** - no app required. Downloads are kept in the browser's own storage and played back through it, so a laptop can go offline with a book on board. The Downloads page in the web player has a short **How downloads work in a browser** note as a reminder.

:::note
Earlier versions of the web player could fetch a book but then stop with "offline playback isn't ready yet", so offline listening in the browser never really worked. That's fixed: downloaded books now play in the browser with no connection. If you have a book stuck in that state, use **Retry**.
:::

A few browser realities to know:

- It needs a **secure connection** (an `https://` address, which your server normally has). On a plain `http://` connection the Downloads tab disappears from the navigation, and a book's download button shows as a disabled **Downloads unavailable** instead.
- Storage belongs to that browser on that machine, and the browser decides how much a site may keep. **Clearing the browser's site data deletes your downloads** (never your books or progress - those live on the server).
- Browsers can clear stored data if the disk runs very low. AudioSilo asks the browser to keep its storage persistent, and installing the web player as an app (below) makes the browser much more protective of it - but a native [mobile app](mobile-apps.md) download is still the most bomb-proof option for long trips.
- On an **iPhone or iPad**, Safari stops playback when the web player is in the background. Use the iOS app for listening with the screen off.
- If a browser can't keep audio offline at all, the Downloads page says so and why (no secure connection, a browser without offline storage, or offline playback that isn't ready yet), rather than failing silently.
- A book the web player has to [convert as you listen](playback.md#books-a-browser-cant-play-directly) can't be downloaded in the browser, and automatic downloads pass it by (when none of the next books can be kept, Keep the next books ready says *"This browser can't keep the next books offline."*). A download of one that stopped part-way has no Retry; its row in **In progress** says to remove it.

## Installing the web player (PWA)

The web player is an installable app - a *Progressive Web App*. Installing it gets you an AudioSilo icon on your home screen or desktop, a clean full-screen window without browser bars, and the app shell itself stored offline so it opens even with no connection (your downloads waiting inside).

- **Desktop (Chrome/Edge):** open the web player, then use the **install icon** in the address bar (or the browser menu's "Install AudioSilo…").
- **Android:** open the web player in Chrome and choose **Add to Home screen / Install app** from the menu.
- **iPhone/iPad:** open the web player in Safari, tap **Share → Add to Home Screen**.

Once installed, it behaves like any other app - and because installation marks the site as important to you, the browser guards your downloaded books' storage far more strongly.

:::note
Installing the web player and installing the native mobile app are different things. The PWA is the web player in an app suit; the native apps add richer lock-screen controls (chapter-aware on Android), tighter background playback, and the like - see [The mobile apps](mobile-apps.md).
:::
