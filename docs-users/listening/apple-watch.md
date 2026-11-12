---
title: Listen on your Apple Watch
description: "Set up AudioSilo on your Apple Watch, send it books from your iPhone, and listen without your phone."
---

The AudioSilo watch app plays books downloaded to your Apple Watch, with no phone needed. It sends what you heard back to your server when it next has a connection, so your other devices pick up the same place.

The watch is a device of its own, with its own sign-in and its own copy of each book. Your iPhone only signs it in and sends it books.

## What you need

- An **iPhone** with the iOS app 2.6.0 or later, paired to an Apple Watch on watchOS 11 or later.
- A **server on 2.6 or later** with ffmpeg, which makes the watch's smaller copy of each book. See [Server > Transcoding](../admin/server.md#transcoding).
- Headphones, or the watch speaker (see [Playing a book](#playing-a-book)).

## What it doesn't do

- **No library browsing.** The watch lists only your Continue listening books and the books you send it.
- **No podcasts**, only books.
- **One account.** A watch signs in to one account on one server.
- **No kids accounts or demo.**
- **Bookmarks, notes, the ebook and casting stay on your other devices.**
- **English only** for now.

For a Wear OS watch, see [Listen on your Wear OS watch](wear-os.md).

## Setting it up

1. On your iPhone, open the **Watch** app and install AudioSilo on your watch.
2. In the iPhone app, open your [account page](account.md#opening-it) for the server.
3. On the **Apple Watch** card, tap **Set up Apple Watch**.
4. Open AudioSilo on your watch. It signs in by itself, with nothing to type.

![The watch before it is set up: Open AudioSilo on your iPhone and choose Set up Apple Watch](/img/screenshots/watch/watch-set-up.png)

The sign-in works once, for 10 minutes. If it runs out, tap **Send again** on the card.

If the watch can't reach your server, see [A self-signed server](#a-self-signed-server).

Once signed in, the card shows the account and how syncing is going. **Books on your watch** opens them in [Downloads on your iPhone](#in-downloads-on-your-iphone).

![The Apple Watch card on an iPhone, with Send again and Books on your watch](/img/screenshots/watch/phone-card.png)

The watch also shows under [Signed-in devices](account.md#signed-in-devices) as **Apple Watch**.

## Choosing books

### On the watch: Continue listening {/* #on-the-watch-continue-listening */}

**Continue listening**, on the watch's home screen, lists up to 10 books you've started. Tap **Download** on one. **On this watch** lists the books already downloaded.

![Continue listening on the watch, with a Download button](/img/screenshots/watch/watch-continue-listening.png)

### From your iPhone: Send to watch

On your iPhone, open a book's [book menu](browsing.md#the-book-menu), or **More** on its [book page](book-page.md), and tap **Send to watch**.

![The More sheet of a book page on an iPhone, with Send to watch](/img/screenshots/watch/phone-send-to-watch.png)

Then open AudioSilo on the watch. The watch only asks for a book while the app is open, so the download starts then. Reaching the watch can take a few minutes.

If the watch isn't ready for the book yet (still signing in, or on another account), it holds the book for up to 7 days and starts it once it can.

### How a download goes

**On the way**, on the watch's home screen, shows each book coming and how far it has got. The server first prepares the watch's copy, about 430 MB for a 20-hour book. That can take a while for a long book the first time. You don't need to keep looking at the watch while it works. When it's done, the book moves to **On this watch**.

![On the way on the watch: Preparing on the server](/img/screenshots/watch/watch-on-the-way.png)

If a book stays waiting, open AudioSilo on the watch. If it says **Couldn't download**, tap **Try again** or send it again.

## In Downloads on your iPhone

The [Downloads](offline-downloads.md#the-downloads-page) page on your iPhone has an **On your Apple Watch** section. It lists every book you sent and every book the watch holds, with how far each has got.

![On your Apple Watch in Downloads on an iPhone: books with their sizes](/img/screenshots/watch/phone-downloads-section.png)

A row can lag behind the watch's own screen. If a row says it couldn't download or reach the watch, tap **Send again**.

To take a book off the watch from your iPhone, tap **Remove** on its row. Your place in the book is kept.

## Storage

The watch needs room for the book plus 200 MB spare. If there isn't room, the download doesn't start and says how much space it needs.

Books stay on the watch until you remove them, even finished ones. To remove one:

1. On the watch, open **On this watch**.
2. Swipe the book and tap **Remove**.
3. Tap **Remove from watch**.

The book leaves **On this watch**.

Or [remove it from your iPhone](#in-downloads-on-your-iphone). What you heard still syncs.

![On this watch: one book with its size](/img/screenshots/watch/watch-on-this-watch.png)

## Playing a book

Tap **Play** on a downloaded book, or tap it in **On this watch**. **Now playing** at the top of the home screen comes back to it.

![Now playing on the watch: chapter, progress, back 15, pause and forward 30](/img/screenshots/watch/watch-now-playing.png)

You get back 15 seconds, forward 30 seconds, chapters, **Speed** (0.8x to 2x) and a **Sleep timer**. The book keeps playing after you leave the app.

At any speed other than 1x, a small line under the progress says how long the chapter will really take, such as *"59m left at 2x"*.

![Now playing at 2x, with the real time left under the progress](/img/screenshots/watch/watch-now-playing-speed.png)

Before it plays, the watch asks your server for your place if it can. If another device is somewhere else in the book, it offers **Jump there** or **Stay here**. See [Listening on more than one device](playback.md#listening-on-more-than-one-device).

With no headphones connected, watchOS asks where to listen. If you pick the watch speaker, AudioSilo checks once that you mean it. Removing your headphones pauses the book.

## A run without your phone

1. **Before you go**, with the watch online, download the book and check it's in **On this watch**.
2. **Leave the phone.** Connect your headphones and play. No connection is needed.
3. **Come back.** The watch sends what you heard to your server, with the times you heard it.

Listening is sent when you open the app, and about once a minute while it's open. With the app closed, watchOS sends it when it can. Opening the app is the sure way.

## Sync status

**Sync**, on the watch's home screen, shows the last sync and how many updates are waiting. **Sync now** sends them. It also lists anything the server turned down, and the server's address and version.

![Sync on the watch: last sync, 2 waiting, and the server can't be reached](/img/screenshots/watch/watch-sync.png)

Your iPhone's card shows a short version of the same.

## If the server is too old

If the server is older than 2.6 or has no ffmpeg, the watch says so instead of showing its home screen. Fix the server, then tap **Try again**.

![The watch on an old server, with Try again and Sign out](/img/screenshots/watch/watch-too-old.png)

## At home and away

The watch uses home and away addresses, like the iOS and Android apps (see [At home and away](connecting.md#at-home-and-away)). **Address** on [Sync](#sync-status) shows which one is in use.

### A self-signed server

The watch can't accept a self-signed certificate. So, as on your phone:

- **At home**, it uses the server's [plain HTTP at home](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect). Set the watch up on the same network as the server.
- **Away from home**, it needs an address with a trusted certificate. See [Reach your server from outside your home](../getting-started/remote-access.md).

Without a trusted away address, the watch still plays its books anywhere, but syncs only at home.

If watchOS asks whether AudioSilo may use your local network, allow it. Over plain HTTP, a home address must be an IP address, a `.local` name, or a single word like `audiosilo`. A name like `nas.lan` doesn't work.

## Signing out and switching accounts

**Sign out** on the watch's home screen removes the account and its books from the watch. If listening hasn't synced yet, it asks you to sync first.

To switch accounts, tap **Set up Apple Watch** on the other account's card on your iPhone. Switching removes the old account's books from the watch.

Signing out on your iPhone leaves the watch signed in. To cut off a lost watch, tap **Sign out** on its row under [Signed-in devices](account.md#signed-in-devices).
