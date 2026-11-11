---
title: Cast to a speaker or TV
description: "Play a book on a Chromecast, a TV with Google Cast or a Nest speaker, with your phone or computer as the remote."
---

AudioSilo can play a book on a **Chromecast** or another Google Cast device: a TV with Chromecast built in, a Google TV, or a Nest speaker. Your phone or computer becomes the remote, and your place keeps saving to your server.

## The Cast button

1. Start a book.
2. Open the [full player](full-player.md) and tap the **Cast** button, next to speed, sleep and bookmark.
3. Pick your Cast device.

The book carries on there from where you were. On a tablet or computer, the Cast button is also on the player bar when the window is wide enough.

![The web player's full player in Chrome: the Cast button next to speed, Sleep and Bookmark](/img/screenshots/web-player/player-cast.png)

You can cast from:

- the **iOS and Android apps** (Android needs Google Play services);
- the **web player** in Chrome, Edge and other Chromium browsers, opened over **HTTPS**. Safari, Firefox and browsers on iPhone or iPad can't cast.

On an iPhone, allow AudioSilo to use your **local network** when it asks. That's how it finds Cast devices.

In the iOS and Android apps the Cast button shows only once a Cast device is found on your network. On an iPhone it shows until the first tap, which starts looking for them.

If you don't see the Cast button, check that a Cast device is on and on the same network, then update the server and the app.

## What you need

- **A Cast device on the same network** as your phone or computer.
- **A server address the Cast device can reach.** The Cast device fetches the book from your server itself, using the address your app is connected through.

Which addresses work:

- **Plain HTTP on your home network** works from the app, for example `http://192.168.1.20:8080`. A server on its default self-signed certificate offers the apps this address at home ([plain HTTP at home](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect)).
- **HTTPS with a trusted certificate** works, such as [Let's Encrypt](../getting-started/remote-access.md#a-real-certificate-with-autocert-lets-encrypt) or a [reverse proxy](../getting-started/remote-access.md#behind-a-reverse-proxy) with a real certificate.
- **A self-signed `https://` address doesn't work.** A Cast device can't click through a certificate warning.
- **`localhost` doesn't work.** Connect to the server by its network address instead.

A downloaded book still casts from your server, so the server must be reachable.

Most audio formats cast directly. Formats a Cast device can't play, such as Apple Lossless or WMA, need ffmpeg on your server to convert them (see [Do I need ffmpeg?](../faq.md#do-i-need-ffmpeg)).

## While casting

- Chapters, skipping and speed all work, and your place keeps saving.
- Smart speed, Voice boost and auto-rewind don't apply while casting.
- The sleep timer pauses the Cast device when it runs out.
- You can also pause and play with the TV's remote or the Google Home app.

**On an iPhone or iPad**, keep the app open while casting. iOS stops AudioSilo soon after you leave it, so your place only saves up to then. When you come back, it catches up.

**On Android**, a Cast notification has the controls and keeps your place saving in the background.

## Stopping

Tap the **Cast** button again and choose to stop casting. The book comes back to your device, paused where the Cast device got to. Press play to carry on.

## Good to know

- **Podcast episodes don't cast.** An episode always plays on your device.
- **If casting doesn't start**, the book stays on your device and the player says why. Usually the Cast device couldn't reach your server: check the [address and certificate](#what-you-need). If it couldn't connect to the Cast device, check it's on and on the same network.
