---
title: Manage your account
description: "Set a password, pair another device, sign out a lost phone, check listening sync and sign out, for each server you use."
---

Each server you use has its own **account page**. There you set your password, pair another device, see your signed-in devices, and sign out.

![A server's account page on a computer: Password, Pair another device, signed-in devices, Listening sync and API keys](/img/screenshots/web-player/account.png)

## Opening it

- **On a tablet or computer**: pick the server in your profile menu (top right).
- **On a phone**: open the **Me** tab and choose **Account**. If you use more than one server, tap its name in the row at the top.
- Anywhere: [Settings > Accounts and devices](settings.md#accounts-and-devices), then tap the server.

## Password

Accounts made by invite often have no password. That's fine day to day, but a password is your **reliable way back in**. With one, you can sign in on any device with no new invite.

1. On the **Password** card, tap **Set a password** (or **Change password**).
2. Enter a password of at least 8 characters. To change one, enter your current password first.
3. Save.

Setting a first password signs nothing out.

**Changing a password signs out your other devices.** This device stays signed in. Every other device needs to sign in again, and so do household members signed in on those devices. Your [API keys](#personal-api-keys) and [calendar link](upcoming.md#add-to-your-calendar) keep working. If someone else knew your old password, this locks them out.

## Pair another device

To sign in another phone, tablet or browser without a new invite:

1. Tap **Show a pairing code**.
2. Scan the QR code with the iOS or Android app on the other device, or with its camera, or send it the link. The code works once, for 10 minutes.
3. The other device signs straight in.

If the code expires, tap **Make a new code**.

## Apple Watch

On an iPhone with a paired Apple Watch, the **Apple Watch** card signs the watch in to this server. See [Listen on your Apple Watch](apple-watch.md).

## At home and away

If the server has home and away addresses, an **At home and away** card lists them. In the apps, the one in use is marked **In use**. See [At home and away](connecting.md#at-home-and-away).

## Signed-in devices

Every device signed in to your account on this server, with when it was last used. API keys aren't in this list.

To cut off a lost or sold phone, tap **Sign out** on its row and confirm. It loses access at once. If you signed in [household](household.md) members on that phone, they're signed out too, unless you untick them.

To sign out this device, use [Sign out](#signing-out) at the bottom of the page.

## Listening sync

The **Listening sync** card shows whether what you heard on this device has reached the server, and when it last synced. Listening waits on the device while you're offline and goes by itself when the server is reachable. See [Listening on more than one device](playback.md#listening-on-more-than-one-device).

![The Listening sync card: last synced now, and one listen under Couldn't sync, with Discard](/img/screenshots/web-player/account-listening-sync.png)

Anything the server turned down is listed under **Couldn't sync**, with the reason. Usually the downloaded copy is a different edition from the server's, or the listen is over 90 days old. Your place on the server isn't affected. **Discard** removes one from the list.

## Personal API keys

API keys let dashboards and tools reach your server for you, such as a Home Assistant tile. See [Create API keys](api-keys.md).

## Signing out

**Sign out of** the server, at the bottom of the page, disconnects this device. Before it does, the app:

- warns you if you have no password, since you'd need a new invite to get back in, and offers **Set a password**;
- tries to send any listening that hasn't synced, and asks before losing it.

Signing out deletes this server's downloads on this device. Your books, progress and bookmarks stay on the server. To get back in, see [Getting back in after signing out](connecting.md#getting-back-in-after-signing-out).

## A kids account

A kids account from someone's [household](household.md) has a simpler page. It has no password, no **Pair another device** and no API keys. The grown-up who manages it sets up its devices from their [Household page](household.md#their-devices).

## Server version

The foot of the page shows the server's AudioSilo version.
