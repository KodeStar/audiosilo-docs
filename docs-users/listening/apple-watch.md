---
title: Apple Watch
description: "AudioSilo on Apple Watch: setting it up from your iPhone, choosing books, the watch speaker, a run without your phone, sync status, storage, a server that is too old, home and away addresses on a self-signed server, and what the watch app doesn't do."
---

Leave the phone at home, take a book with you. The AudioSilo watch app plays books downloaded to your Apple Watch and sends what you listened to back to your server the next time the watch has a connection, so your place and your stats stay right on every other device.

The watch is a device of its own. It has its own sign-in and its own copy of each book, and it talks to your server directly. Your iPhone only signs it in and sends it books.

## What you need

- An **iPhone** with the AudioSilo app, **version 2.6.0** or later, and an Apple Watch paired to it, on watchOS 11 or later.
- A **server on version 2.6 or later** with ffmpeg available, because the server makes the small copies of each book that a watch plays. See [Server > Transcoding](../admin/server.md#transcoding).
- Headphones, if you don't want everyone nearby to hear your book.

## What it doesn't do

The watch app is deliberately small. Before you set it up, know that:

- **There's no library browsing.** The watch lists only your [Continue listening](#on-the-watch-continue-listening) books and the books you send from your iPhone.
- **There are no podcasts**, only books.
- **It holds one account.** One watch signs in to one account on one server. To use another, [switch](#signing-out-and-switching-accounts).
- **A kid's account or a demo can't use it.** The iPhone doesn't offer it there.
- **Bookmarks, notes, the ebook, read-along and casting stay on your other devices.** The watch plays the book.
- **Finished books stay until you remove them.** See [Storage](#storage).
- **It's in English for now**, whatever language your iPhone uses.

There's no Wear OS app yet.

## Setting it up

1. On your iPhone, open the **Watch** app and install AudioSilo on your watch.
2. In the AudioSilo app, open your [account page](account.md#opening-it) for the server. An **Apple Watch** card shows there when your iPhone has a paired watch. If AudioSilo isn't on the watch yet, the card says *"Install AudioSilo on your watch from the Watch app on this iPhone, then come back here."*
3. Tap **Set up Apple Watch**. The card says *"Sent. Open AudioSilo on your watch to finish signing in."*
4. Open AudioSilo on your watch. There's nothing to type: it says **Signing in**, then shows its home screen.

![The watch before it is set up: Open AudioSilo on your iPhone and choose Set up Apple Watch](/img/screenshots/watch/watch-set-up.png)

The sign-in is good for 10 minutes, and only once. If the watch doesn't take it in time, the card says *"The sign-in ran out before your watch took it. Nothing changed on the watch. Keep it close and send again."* and the watch says *"That sign-in has expired. Send again from your iPhone."* Tap **Send again** on the card.

If the watch says *"Can't reach your server. Send again from your iPhone when the watch is online."*, see [At home and away](#at-home-and-away), which matters most on a server with the default self-signed certificate.

Once it's signed in, the card shows who it's signed in as, how its sync is going and the books on it:

![The Apple Watch card on an iPhone: signed in as admin, 1 listen waiting on your watch, last synced 2 minutes ago, and two books on the watch with their sizes](/img/screenshots/watch/phone-card.png)

The card also says when the server can't serve a watch (*"Home can't prepare books for a watch. It needs version 2.6 or later, with ffmpeg."*), and when the watch is signed in to another account (*"Your watch is signed in to another account. Setting it up for Home replaces that account once its listening has synced."*).

The watch shows up under [Signed-in devices](account.md#signed-in-devices) with **Apple Watch** as its platform.

## Choosing books

### On the watch: Continue listening

The watch's home screen lists the books you've started and not finished, the most recent first, up to 10. Each has a **Download** button, and **Refresh** at the end of the list reads them again.

![Continue listening on the watch: Three Parts by Bea Writer, 5% heard, with a Download button](/img/screenshots/watch/watch-continue-listening.png)

### From your iPhone: Send to watch

On your iPhone, a book's [menu](browsing.md#the-book-menu) has **Send to watch**. It shows when your watch has the app and the server can serve a watch. It's not offered for a podcast episode.

![The book menu on an iPhone with Send to watch between Add to collection and Mark as finished](/img/screenshots/watch/phone-send-to-watch.png)

You get a short *"Sent to your watch"* message. If the watch isn't signed in to this account yet, Send to watch signs it in first, and the message adds *"Open AudioSilo on your watch to finish signing in."*

### How a download goes

**On this watch**, on the home screen, shows each book and how far it has got: **Waiting to download**, **Preparing on the server**, *"Downloading 2 of 5 files"*, then its size once it's there. Your iPhone's card has the same list in shorter words.

- A watch gets its own smaller copy of a book, about 430 MB for a 20-hour book. The server makes it the first time a watch asks for that book, which can take a while for a long one.
- **Preparing happens while the app is open on the watch.** If a book stays on **Waiting to download** or **Preparing on the server**, open AudioSilo on the watch. It may also say *"Waiting for a connection"* or *"Waiting for the server"*.
- Once the server has the copy, the watch fetches its files with a system download designed to carry on with the app closed.
- **Couldn't download** comes with the reason. **Try again** on Continue listening starts it again, and so does sending the book again from your iPhone.

### A book sent before the watch is ready

A book you send isn't lost if the watch can't take it yet: while it's still signing in, after a sign-in failed, on a server that is too old, or when the book is for an account the watch isn't signed in to.

It waits on the watch under **From your iPhone** at the bottom of **On this watch**, saying *"Waiting until this watch can take it"*. Before the watch is signed in, the same line sits under the message on the setup screen. As soon as the watch can take the book, it starts downloading by itself.

![From your iPhone on the watch: a book waiting, with the line Waiting until this watch can take it](/img/screenshots/watch/watch-from-your-iphone.png)

A book waits for 7 days, and up to 20 can wait at once. Past that, or if you refused the account it's for, it says *"Not delivered. Send it again from your iPhone."* for another 7 days, then goes. Sending it again makes it wait afresh. Signing out, or switching to another account, removes that account's waiting books too.

## Storage

Before a download starts, the watch checks there's room for the book **and 200 MB more**. If there isn't, the book doesn't start, and says so: *"Not enough space on this watch: it needs 430 MB and keeps 200 MB free; 310 MB is free."*

Books don't remove themselves, even once you've finished them. To free the space, open **On this watch**, swipe a book, tap **Remove**, then **Remove from watch**. Removing the book that's playing stops it first, and what you heard still syncs. Nothing on your iPhone or the server changes.

![On this watch: Three Parts, 3.4 MB, and the line Swipe a book to remove it](/img/screenshots/watch/watch-on-this-watch.png)

## Playing a book

Tap **Play** on a downloaded book in Continue listening, or tap the book in **On this watch**. While a book is loaded, **Now playing** at the top of the home screen comes back to it.

![Now playing on the watch: the chapter and book, a progress bar with the time heard and the time left, back 15, pause and forward 30](/img/screenshots/watch/watch-now-playing.png)

The screen has the chapter, the time heard in it and the time left at your speed, **back 15 seconds**, play and pause, **forward 30 seconds**, and previous and next chapter. Below those: **Chapters**, **Speed** (0.8x to 2x; each book keeps its own) and the **Sleep timer** (15, 30, 45 or 60 minutes, or **End of chapter**).

Before it plays, the watch asks your server for the book's place if it can, and goes on from there. With no connection, it uses the place it last knew, so a book you were halfway through on your phone doesn't open at the start. If another device is somewhere else in the book, the watch offers it, as the other apps do: *"Living room is at 1:12:40."* with **Jump there** and **Stay here**. See [Listening on more than one device](playback.md#listening-on-more-than-one-device).

### The speaker

The watch is meant for headphones: when you press play with none connected, watchOS shows its own picker for where to listen. If you choose the watch's speaker, AudioSilo asks once:

> **Play on the watch speaker?** Others nearby will hear it. Connect headphones to listen privately.

**Play on speaker** plays it, and the watch doesn't ask again. **Not now** leaves it paused. If you don't choose anywhere to listen, the screen says *"Choose where to listen (headphones or the watch speaker), then play again."*

## A run without your phone

1. **Before you go**, while the watch can reach your server, download the book and check **On this watch** shows it with its size.
2. **Leave the phone.** Open AudioSilo, connect your headphones and play. Playing needs no connection at all, since the book is on the watch. The app is set up to keep playing when you lower your wrist.
3. **Come back.** What you listened to is kept on the watch until it reaches your server, with the time you heard it, so it lands on the right day in your history and stats and never moves your place backwards.

The listening goes in two ways:

- **With the app open**, it's sent when you open the app, each time you stop, and about once a minute while anything is waiting.
- **With the app closed**, the watch hands what's waiting to watchOS as you leave the app, to send when a network appears. How soon that happens is up to watchOS, and it only uses your away address ([below](#at-home-and-away)). **Opening the app is the sure way to send it**, and **Sync now** is there if you want it to go this minute.

The watch reaches your server by whatever connection watchOS gives it, through your iPhone when that's near.

## Sync status

**Sync**, on the home screen, says how things stand:

- **Last sync** and **Waiting**, the number of listening updates still to send. **Sync now** sends them.
- *"Can't reach your server. Listening is kept here and sent when it can be."* when the last try got no answer.
- **Couldn't sync** lists anything the server turned down, and why: *"Too old to sync (over 89 days)"*, *"Too large to send"*, *"The book is no longer yours to sync"*, *"The book is no longer on the server"*, *"The book has changed on the server"*, or *"The server refused it"* with its code. Swipe one to **Dismiss** it. Your place on the server isn't affected.
- **Server**: its **Name**, the **Address** in use right now, and its **Version**.

![Sync on the watch: last sync 3 min ago, 2 waiting, and Can't reach your server. Listening is kept here and sent when it can be](/img/screenshots/watch/watch-sync.png)

Your iPhone's card repeats the short version as the watch last told it: *"1 listen waiting on your watch"* or *"Everything from your watch has synced"*, *"Last synced 2 minutes ago"*, and *"1 listen couldn't sync. See Sync on the watch."*

## If the server is too old

The watch needs a server that can take its listening and make its copies of a book. If yours can't, the watch shows one of these instead of its home screen, with your server's version beneath:

- *"This server is too old for the watch app (needs 2.6 or later)."* Update the server.
- *"This server can't make books for the watch. It needs ffmpeg."* See [Server > Transcoding](../admin/server.md#transcoding).

![The watch on an old server: This server is too old for the watch app (needs 2.6 or later), with Try again and Sign out](/img/screenshots/watch/watch-too-old.png)

After fixing it, tap **Try again**. **Sign out** is there too, and any books your iPhone sent wait below them. Books already on the watch can't be played while this screen shows.

## At home and away

The watch follows the same rule as the phone apps ([At home and away](connecting.md#at-home-and-away)). **Address** on [Sync](#sync-status) shows which address is in use. If your server has no away address, your listening syncs when you open the app at home.

### A self-signed server

The watch can't accept a self-signed certificate, and there's no way to click through a warning on it. So, as on your phone:

- **At home**, it connects over the server's [plain HTTP at home](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect). Set the watch up on the same network as the server, or sign-in ends with *"Can't reach your server."*
- **Away from home**, it needs an address with a certificate it can trust, [set up as for the phone apps](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect).

Without a trusted away address, the watch still plays its books anywhere, but can only reach your server at home.

If watchOS asks whether AudioSilo may use your local network, allow it, or the watch can't find the server at home. A home address written as an IP address or a `.local` name works.

## Signing out and switching accounts

**Sign out** on the home screen removes the account and **the books on this watch**. If any listening hasn't synced, it holds back: *"2 listening updates have not synced yet. Sync first, or discard to sign out."* with **Sync now** and **Discard and sign out**, which asks once more before throwing them away.

![Sign out on the watch with 2 listening updates not synced yet, and Sync now](/img/screenshots/watch/watch-sign-out-blocked.png)

To switch accounts, tap **Set up Apple Watch** on the other account's card. The watch asks on its home screen: *"Another account wants this watch."* with **Switch** and **Keep this account**. With listening still unsent it says how much, and offers **Sync now** and **Discard and switch** in place of **Switch**, until nothing waits. Switching removes the old account's books from the watch.

Signing out on your iPhone leaves the watch signed in, since it's a device of its own. To cut off a lost or sold watch, use **Sign out** on its row under [Signed-in devices](account.md#signed-in-devices). Changing your password also signs it out on a recent server. Either way, Continue listening then says *"Signed out. Set up the watch again from your iPhone."*
