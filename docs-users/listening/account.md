---
title: Manage your account
description: "Set a password, pair another device, sign out a lost phone, check listening sync and sign out, for each server you use."
---

Each server you use has its own **account page**. There you set your password, pair another device, see your signed-in devices, and sign out.

![Account showing a saved proxy header, its HTTPS address, Change headers and Remove headers](/img/screenshots/web-player/account.png)

The **Proxy headers** card lists the headers everyone on this device uses for that address.

## Opening it

- **On a tablet or computer**: pick the server in your profile menu (top right).
- **On a phone**: open the **Me** tab and choose **Account**. If you use more than one server, tap its name in the row at the top.
- Anywhere: [Settings > Accounts and devices](settings.md#accounts-and-devices), then tap the server.

## Password

Accounts made by invite often have no password. That's fine day to day, but a password is your **reliable way back in**. With one, you can sign in on any device with no new invite.

1. On the **Password** card, tap **Set a password** (or **Change password**).
2. Enter a password of at least 8 characters. To change one, enter your current password first.
3. Save.

![Password changed confirmation reporting that one other device was signed out](/img/screenshots/web-player/account-password.png)

The confirmation tells you how many of your other devices were signed out. Setting a first password signs nothing out.

**Changing a password signs out your other devices.** This device stays signed in. Every other device needs to sign in again, and so do household members signed in on those devices. The API keys and calendar links those members made there stop working too. Your own [API keys](#personal-api-keys) and [calendar link](upcoming.md#add-to-your-calendar) keep working. If someone else knew your old password, this locks them out.

## Pair another device

To sign in another phone, tablet or browser without a new invite:

1. Tap **Show a pairing code**.
2. On the other device, tap **Scan a QR code** in the iOS or Android app and scan the code, or send the device the link. The device's camera app opens the web player instead. The code works once, for 10 minutes.
3. The other device signs straight in.

If the code expires, tap **Make a new code**.

## Your watch {/* #apple-watch */}

On a phone with a paired watch, a card signs the watch in to this server. On an iPhone it's the **Apple Watch** card. See [Listen on your Apple Watch](apple-watch.md). On an Android phone it's the **Wear OS watch** card. See [Listen on your Wear OS watch](wear-os.md).

## At home and away

If the server has home and away addresses, an **At home and away** card lists them. In the apps, the one in use is marked **In use**. See [At home and away](connecting.md#at-home-and-away).

If the server doesn't answer, the card still shows the addresses saved on this device. With no network, it shows only for a server the player has already seen offer home and away addresses.

## Proxy headers

For a server behind a sign-in proxy, the **Proxy headers** card holds the headers this device sends with its requests. See [Behind a sign-in proxy](../getting-started/remote-access.md#behind-a-sign-in-proxy) for what they are for.

1. Tap **Add headers** (or **Change headers**).
2. If the server has more than one `https://` address, pick the one that goes through the proxy under **Send to**.
3. Enter each header's name and value, then tap **Save headers**.

The card then lists each header's name and the address it's sent with requests to. It never shows a saved value again. When you change the headers, a saved value's field says **Kept as it is**, and the value stays unless you type a new one. **Remove headers** stops this device sending them.

The card needs an `https://` address. If this device reaches the server only over plain HTTP, the card says so and offers no **Add headers**. A kid's or demo account gets the card only while no full account on this device uses that address, and a demo account only once it has headers. Everyone using the same HTTPS address on this device shares the saved set. Signing out keeps it.

## Signed-in devices

Every device signed in to your account on this server, with when it was last used. API keys aren't in this list.

To cut off a lost or sold phone, tap **Sign out** on its row and confirm. It loses access at once. If you signed in [household](household.md) members on that phone, they're signed out too, unless you untick them.

To sign out this device, use [Sign out](#signing-out) at the bottom of the page.

The web player keeps the last device list for this account, so you can reload the page and see it offline. If you're offline with no saved list, the card says **You're offline**. It checks again when the network returns.

If the list can't load while you're online, **Retry** asks this server again. If the card offers **Reconnect** or names a sign-in proxy, see [Getting back in](connecting.md#getting-back-in-after-signing-out).

## Listening sync

The **Listening sync** card shows whether what you heard on this device has reached the server, and when it last synced. Listening waits on the device while you're offline and goes by itself when the server is reachable. See [Listening on more than one device](playback.md#listening-on-more-than-one-device).

![The Listening sync card: last synced now, and one listen under Couldn't sync, with Discard](/img/screenshots/web-player/account-listening-sync.png)

Anything the server turned down is listed under **Couldn't sync**, with the reason. Usually the downloaded copy is a different edition from the server's, or the listen is over 90 days old. Your place on the server isn't affected. **Discard** removes one from the list.

## Personal API keys

API keys let dashboards and tools reach your server for you, such as a Home Assistant tile. See [Create API keys](api-keys.md).

Offline, the section still shows the keys the player has already loaded, or **You're offline** if it hasn't loaded them. **Create API key** and **Revoke** appear only once the player knows this server offers keys.

## Signing out

**Sign out of** the server, at the bottom of the page, disconnects this device. Before it does, the app:

- counts any bookmarks waiting to sync before you sign out;
- warns you if you have no password, since you'd need a new invite to get back in, and offers **Set a password**;
- tries to send any listening that hasn't synced, and asks before losing it.

Signing out deletes this server's downloads on this device. Your books, progress and bookmarks stay on the server. To get back in, see [Getting back in after signing out](connecting.md#getting-back-in-after-signing-out).

## A kids account

A kids account from someone's [household](household.md) has a simpler page. It has no password, no **Pair another device** and no API keys. The grown-up who manages it sets up its devices from their [Household page](household.md#their-devices).

## Server version

The foot of the page shows the server's AudioSilo version.
