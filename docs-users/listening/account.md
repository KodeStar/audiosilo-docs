---
title: Your account on a server
description: "Each server's account page: setting or changing your password, pairing another device with a 10-minute code, the server's home and away addresses, seeing your signed-in devices and signing one out, personal API keys, and signing this device out safely."
---

Each server you're connected to has its own **account page**, covering your account on that one server: your password, your other devices, API keys, and signing out.

![A server's account page on a computer: who you're signed in as, the Password and Pair another device cards, the signed-in devices and the API keys](/img/screenshots/web-player/account.png)

## Opening it

- **On a tablet or computer**: pick the server in your profile menu (top right), or **Account on** your main server. Or open [Settings](settings.md#accounts-and-devices), choose **Accounts and devices**, and tap the server.
- **On a phone**: the **Account** section of the **Me** tab shows your main server's account. If you're signed in to more than one server, a row of their names above it lets you switch. **Settings > Accounts and devices** leads to each server's page too.

At the top: your name, a line like *"@sam · User on Hearthside · signed in on 3 devices"*, and your role (**User** or **Administrator**). A demo account is marked **Demo**.

## Password

Accounts created by invite often start **without** a password - you signed in with a code, and that's fine day to day. The **Password** card says whether you have one (**Set** or **Not set**). Setting one is your **reliable way back in** on any device:

- Tap **Set a password** (or **Change password**), enter a new password of at least 8 characters, and save.
- Changing an existing password asks for your **current password** first.
- Your other devices stay signed in either way.

Why it's worth doing, especially if you were invited by pairing and never set one: if you ever sign out or get a new phone, a username and password sign you straight back in with no help from anyone. Without one, getting back in means asking your admin for a fresh invite - so setting a password once is the safety net that keeps your account in your own hands.

Demo accounts can't have a password, so the card isn't shown for them.

## Pair another device

Sign another phone, tablet or browser in to the same account without a new invite:

1. Tap **Show a pairing code**. A QR code appears, with a countdown: **it works for 10 minutes**, for one device.
2. On a phone, scan it with the AudioSilo app ([Scan a QR code](connecting.md#scanning-the-qr-code-with-your-phone) on its connect screen) or the camera. Or send the link: **Copy link** in the web player, **Share link** in the apps.
3. The other device signs straight in.

Once the code has expired it fades, and **Make a new code** gives you a fresh one. **Done** puts the card away.

Or, if you've [set a password](#password), just sign in with your username and password on the new device.

## At home and away

When the server has a home address, an away address or both, an **At home and away** card lists them. In the iOS and Android apps, the one in use right now is marked **In use**, with a line such as *"Using your home address. The app switches between them by itself."* How the switching works, and what to check when it doesn't happen: [At home and away](connecting.md#at-home-and-away).

## Signed-in devices

Every device signed in to your account on this server, **this device** first, then the others. Each row has the name the device signed in with, the app and its version, the platform, and when it was last used: *"AudioSilo 1.4.2 · iOS · last seen 3 days ago"*. (API keys aren't in this list; they have [their own section](#personal-api-keys).)

To cut off a phone you've lost or sold, tap **Sign out** on its row and confirm. It loses access straight away and needs to sign in again to reach the server.

**This device** has no Sign out button in the list. To sign this device out, use [Sign out of the server](#signing-out) at the bottom of the page, which saves your place first.

The list appears on servers new enough to show it.

## Personal API keys

**Personal API keys** let dashboards, scripts and other tools reach your server on your behalf, such as a Home Assistant or Heimdall tile. See [API keys for integrations](api-keys.md) for creating, using and revoking them. On a server too old to offer them, the section says so; demo accounts don't have it.

## Signing out

**Sign out of &lt;server&gt;** at the bottom of the page disconnects this device from that server.

If you're about to sign out **without a password set**, the app stops you with a warning - *"Without one you'll need a new invite from your admin to sign back in on this server"* - and offers to **Set a password** right there. Take the offer; it's the whole reason the warning exists. If books from this server are downloaded on the device, the warning also says how many you'd lose.

Signing out **removes this server from the app** (the card says so), so it deletes that server's downloaded books from the device and any progress that hasn't synced yet. (Books, progress, and bookmarks stored on the server are safe - sign back in and they're all there.)

:::tip
Signing out isn't a big deal. Next time you open the connect screen, any server you've connected to before shows a one-tap **Reconnect to &lt;your server&gt;** row - so you only re-enter your code or password, never the server address. See [Connecting and signing in](connecting.md#getting-back-in-after-signing-out).
:::

## Server version

The foot of the page shows the version of AudioSilo that server is running.
