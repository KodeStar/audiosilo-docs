---
title: Offline downloads
description: "Downloading books to your device, the Downloads page, community notes that come along offline, automatic downloads and keeping the next books ready, what happens when a download stops, offline listening in the browser, and installing the web player as an app."
---

Streaming needs your server; downloads don't. Download a book before a flight, a commute through tunnels, or a weekend off-grid, and it plays entirely from your device - no connection to the server required.

## Downloading a book

The download button lives on the [book's page](book-page.md#listening-and-the-buttons), beside **Resume**: **Download for offline** (just **Download** on a phone). You can also use **Download for offline** in any book's [menu](browsing.md#the-book-menu).

While a download runs, the button shows how far it has got (*"52% · Cancel"*, or just **Cancel** on a phone; tap it to cancel), with the progress underneath (*"Downloading 42% · 210 MB / 500 MB"*). When it's done, the button reads **Downloaded** and the cover and the book's ebook (when it has one, with its [read-along](companion.md#text)) are saved too. The ebook counts in the progress and in the sizes, so the button reaches 100% only once it's saved, and the room a book takes includes it. In the apps, a book whose ebook you've already opened in the reader takes the copy the app keeps rather than fetching it again. Cancelled a download by mistake? Press **Download** again straight away: the new download carries on. Tap **Downloaded** to see how much room the book takes on this device and to **Remove download**, which asks first and says how much space it frees.

If a download stops (the connection dropped, the phone slept at the wrong moment), the button becomes **Retry download**, and the line under it says what went wrong in the same words as the Downloads page ("*Server* stopped responding. Retry starts it again.") - see [When a download stops](#when-a-download-stops).

:::tip
Audiobooks are big - often hundreds of megabytes each. Download on Wi‑Fi when you can, and keep an eye on the storage card on the Downloads page.
:::

### Books in MKA files

A book in `.mka` (Matroska) files with MP3 inside downloads as MP3 when your server has ffmpeg, so it plays offline in the apps and in the web player. On an iPhone, a book an older version of the app saved as MP3 plays once you update the app. A book saved before your server sent these books as MP3 (an older server, or one without ffmpeg) holds the Matroska file itself, which an iPhone can't play, even after the update: remove the download and download it again. A download that starts while the server is still making its MP3 copy waits up to 45 seconds for the copy to be ready, so it is usually the lossless copy. Only a book whose copy takes longer than that (a very long book on a slow server) is saved through the live conversion instead, which is not lossless. An `.mka` book with other audio inside can't be downloaded in the browser, and won't play on an iPhone (see [Supported formats](../getting-started/organizing-your-library.md#supported-formats)).

### Podcast episodes

[Podcast episodes](podcasts.md) can't be downloaded to your device yet: they stream from your server, and there's no download button for them. **Download automatically** and **Keep the next books ready** skip them too.

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

The **Automatic downloads** card on the Downloads page holds three settings. They're the same settings as the **Up next and downloads** section of [Settings](settings.md#up-next-and-downloads), so changing one place changes the other.

- **Download automatically**: **Never**, **On Wi-Fi** or **Always**, with a line under it saying what the one you chose does ("Nothing downloads on its own. Download a book from its page.", "Downloads a book when you start listening to it, on Wi-Fi.", or "... on any connection."). With On Wi-Fi or Always, the book you start listening to is downloaded as you play it, and playback quietly switches to the downloaded copy once it's on the device. On Wi-Fi skips mobile data on a phone or tablet. A browser can't tell Wi-Fi from mobile data, so in the web player On Wi-Fi downloads on any connection, and the card says so. The apps start at **On Wi-Fi** and the web player at **Never**, so a book you play in a browser streams without being saved unless you choose otherwise (see [Settings](settings.md#up-next-and-downloads) for a browser that was set to On Wi-Fi before). Like Keep the next books ready (below), it leaves at least 1 GB (or a tenth of your storage) free, and it won't fetch a book you cancelled or removed earlier in the session.
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

Kept files survive closing the app, too. A download the app closed part-way through comes back as stopped, saying "The app closed before it finished", with the files it had already finished kept for **Retry**. That includes a book that is one big file, or one whose first file hadn't finished yet: it stays in **In progress** with **Retry**, which starts it again (a book [kept ahead](#keep-the-next-books-ready) is left to Keep the next books ready instead). If any of the finished files has gone missing in the meantime, the download is cleared away instead, and starts from the beginning next time.

## Downloads belong to their server

Each downloaded book belongs to the **server you downloaded it from**, and to the **person** who downloaded it. If you've connected the app to [more than one server](connecting.md), the Downloads page shows all of them together, but each book stays tied to its own server. If you [share the device with your household](profiles.md), the Downloads page shows only the downloads of the person listening; everyone else's stay on the device for them.

If a download belongs to an account that is no longer signed in on this device, it shows in a **Not signed in** group, where you can only remove it to free the space. Signing in to that account again puts it back in its place.

That matters when you disconnect a server:

- **Removing a server** ([Settings > Accounts and devices](settings.md#accounts-and-devices)) or **signing out** of it **deletes the books you downloaded from that server on this device**, along with any of your listening progress that hadn't synced back to the server yet. Someone else on this device who is signed in to the same server with their own account keeps their downloads.
- The app warns you first when you have books from that server downloaded on the device, so you're never caught out.
- Your other servers' downloads, and everyone else's on this device, are untouched, and nothing on the server itself is affected - reconnect and you can download them again any time.

:::tip
If you just want to free up space, use **Remove** on a single book instead - that removes one book and leaves the server connected.
:::

## How downloaded playback differs

Honestly? Barely at all - that's the point:

- A downloaded book **plays from local files**, so it starts instantly and never buffers, whether or not the server is reachable.
- Chapters, the sleep timer, speed, bookmarks, and notes all work the same.
- **Chapters stay up to date.** If a book's chapters change on the server after you downloaded it (your admin switched it to the [community's chapters](book-page.md#chapters), or back, or a rescan found new ones), the downloaded copy picks up the new chapters the next time the app loads that book's chapters while online, as long as its audio files are the same. A book that is already playing keeps its chapters until you next start it. The audio on your device is never re-downloaded for this.
- **A new file order.** If your server now plays a downloaded book's files in a different order (from 2.4.0 a file named "2" plays before one named "10"), the downloaded copy takes the new order the next time you start the book while online. A copy that finishes downloading while you stream the book in the new order takes that order straight away, and playback carries on from the same spot. Until then, and whenever you start it offline, it plays in the order it was downloaded in. Your place in such a book can move once, because the new order changes where each part sits in the book. A copy still in its old order keeps your place in the right file, though: when you resume it, and (on a recent server) when the server takes your offline listening.
- Your listening progress is saved on the device while you're offline and **synced to the server automatically** the next time the app can reach it - so even offline listening ends up on your other devices' *Continue listening* shelf. On a recent server it goes as what you listened to and when: Home says **3 listens waiting to sync** until it's sent, the book's history shows it marked **Waiting to sync**, and once it's sent your history, Journal and stats have it at the time you listened. If another device moved on meanwhile, you're asked which place to keep rather than being rewound ([Listening on more than one device](playback.md#listening-on-more-than-one-device)).
- **It starts where you left off, offline too.** A downloaded book keeps the place your server had for it when you downloaded it, and each time the app reads it online after that, so a book you were halfway through on another device opens offline at that place, not at the start.
- The book's page still opens offline for downloaded books, community notes and all ([below](#community-notes-offline)), and its **Details** tab says the book **Plays from this device**.
- **Read the ebook** opens a downloaded book's ebook from the device, with no connection, in the apps and in the web player ([Reading offline](reading-the-ebook.md#reading-offline)).
- **Read-alongs come too.** For a book with a [read-along](companion.md#text), the download keeps it beside the ebook, so the companion's **Text** tab and the reader's **Follow narration** work offline. If the read-along is made again on the server, the app fetches the new one the next time it sees the book there, as long as it was made from the same ebook as the one in your download. If the server's ebook is replaced, the download keeps its own read-along; a download without one says **The read-along is for a newer ebook** in the Text tab (download the book again to get both). A read-along that went out of date on the server is dropped from the download, unless it still fits the download's own ebook and audio. The read-along counts in the download's size and progress. A download made with an older version of the app (before 2.6.0), or one whose read-along couldn't be fetched, gets it the next time the app sees the book on the server; until then the Text tab needs a connection.

## Community notes offline

When your server has [community metadata](book-page.md#about-this-book) switched on, a downloaded book keeps its community material with it (the description, the [recaps and characters](recaps-and-characters.md), the Series tab, the player's [companion](companion.md), and at least the book before it in the series for the catch-up), so it all works in the air and still [hides what you haven't reached](recaps-and-characters.md#nothing-gets-spoiled-before-you-reach-it). It's refreshed when the app can reach your server and the copy is more than a week old, and it goes when you remove the download.

## Downloads in a web browser

Yes, the **web player can download books too** - no app required. Downloads are kept in the browser's own storage and played back through it, so a laptop can go offline with a book on board. The Downloads page in the web player has a short **How downloads work in a browser** note as a reminder.

:::note
Earlier versions of the web player could fetch a book but then stop with "offline playback isn't ready yet", so offline listening in the browser never really worked. That's fixed: downloaded books now play in the browser with no connection. If you have a book stuck in that state, use **Retry**.
:::

A few browser realities to know:

- Out of the box, nothing downloads on its own: the web player's **Download automatically** starts at **Never**, so a book you play streams from your server. Choose On Wi-Fi or Always on the Downloads page to keep the books you play.
- It needs a **secure connection** (an `https://` address, which your server normally has). On a plain `http://` connection the Downloads tab disappears from the navigation, and a book's download button shows as a disabled **Downloads unavailable** instead.
- It needs the web player's **offline helper** (a *service worker*, which the browser runs for the page) to be working. When the browser blocks it, or it isn't in charge of the page yet, a download is refused before anything is fetched, and the button shows **Downloads unavailable**. A download that was saved but couldn't be checked for offline playback says "Saved, but offline playback isn't ready yet. Reload the app, then retry."
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

Installed or not, on a secure (`https://`) connection the browser keeps a copy of the whole web player, every page of it, so even a page you've never opened works offline. After your server is updated, the web player fetches the new version in the background the next time you open it online.

:::note
Installing the web player and installing the native mobile app are different things. The PWA is the web player in an app suit; the native apps add more device integration - see [The mobile apps](mobile-apps.md).
:::
