---
title: Connecting and signing in
description: "All the ways to sign in to an AudioSilo server: invite links, QR codes and pairing links, invite codes, and username + password; getting back in, adding devices and servers, and how the apps switch between a server's home and away addresses."
---

To listen to anything, the AudioSilo player first needs to be connected to a server - the computer where your audiobooks live. There are several ways to get connected, and they all end in the same place: signed in, with your libraries ready to browse.

You only have to do this once per device. After that the app stays signed in until you sign out.

## The easy way: an invite link

The person who runs your server (your *admin*) can send you an **invite link**. It looks something like `https://books.example.com/connect#code=…`.

Opening it takes you to the server's **connect page**, which signs the invite in automatically and then offers you a choice of where to listen:

![The server's connect page showing a pairing QR code with Open in app and Open web player buttons](/img/screenshots/server/connect-page.png)

- **Open web player** - start listening right there in your browser. Nothing to install.
- **Open in app** - if you have the AudioSilo app installed on this device, this signs the app in and opens it.
- **Scan to pair** - a QR code for signing in your *other* devices, typically your phone (see below).

:::tip
The secret code in an invite link is never sent anywhere by your browser - it stays in the link itself. Still, treat an invite link like a key: anyone who opens it can sign in as you, so don't post it publicly.
:::

If your invite has expired or been used up, the page will tell you - just ask your admin for a fresh one. See [People and invites](../admin/users-and-invites.md) for the admin's side of this.

## Scanning the QR code with your phone

The connect page's QR code is the quickest way to get your phone signed in:

1. Open the invite link on any computer (or ask your admin to show you their screen).
2. Point your phone's **camera app** at the QR code and tap the link it finds.
3. Your phone opens signed in and ready to listen - in the server's web player, or straight into the AudioSilo app on servers set up for it.

The QR is as reusable as the invite behind it: each device you're setting up
can scan the **same** code, and every device that signs in uses up one of the
invite's uses (the page tells you how many are left). So a 5-use invite really
does mean a phone, a tablet and a laptop from one QR - no fresh invite per
device.

If you have the **AudioSilo app** installed, the surest way to sign *it* in with a QR is to scan from inside the app: on the app's connect screen, tap **Scan a QR code** and point the camera at the pairing QR. (This button is in the iOS and Android apps only - a web browser can't scan.) The connect page's **Open in app** button does the same job without a camera.

## Connecting from the app

When the app (or the web player) isn't connected to anything yet, it opens on the connect screen: *"Your audiobooks, from your own server."*

![The connect screen: the server address typed in, and the server it found with Sign in and Try the demo](/img/screenshots/web-player/connect.png)

1. Enter the **server address** your admin gave you (e.g. `books.example.com`) and tap **Continue**. Without `https://` or `http://` in front, the app adds `https://`, so type `http://` yourself for a server that only answers plain HTTP. If you don't know the address, ask your admin.
2. The app asks the server who it is and says what it found: *"Found Hearthside"*, with the version of AudioSilo it runs. Tap **Sign in**.
3. Choose how to sign in - **Invite code** or **Username and password** - and tap **Sign in**.

If the server can't be reached, the screen says *"Couldn't reach &lt;address&gt;"* and why that usually happens: a typo, a server that's off, or a home address (like `192.168.1.20:8080`) used from outside the home network, where it can't answer.

Instead of an address you can use:

- **Scan a QR code** (in the iOS and Android apps) - the pairing QR from the server's connect page or from another of your devices.
- **I have a pairing link** (in the web player) - paste a pairing link your admin or another of your devices sent you (it looks like `https://books.example.com/web/connect?token=…`) and tap **Connect**.

Either signs you in straight away, with nothing to type.

### Invite codes

An **invite code** comes from your admin, like `9M4K-P2TQ-WX7V-3RHD`. Type it on the **Invite code** tab. Invite codes can expire or be limited to a few uses, so if one doesn't work, ask for a new invite.

### Username and password

If you've set a password for your account (see [Your account on a server](account.md#password)), you can also sign in the classic way, on the **Username and password** tab.

:::note
Many AudioSilo accounts don't have a password at all - that's normal. Accounts are usually created by invite, and codes and QR pairing cover everyday sign-in. A password is optional and yours to set whenever you like - and it's the most dependable way to sign back in later (see below).
:::

### "Your library is ready."

The first time a device connects to a server, it finishes on *"Your library is ready."*: the server's name, how many books it holds and in which libraries, and, if you already had a book on the go there, where you left off (*"Your place in The Hobbit came with you: chapter 12, 48% in."*). **Start listening** takes you to the home screen; **Browse the library** opens the Library.

![Your library is ready: the shelf of spines, the server's name and its libraries, and Start listening](/img/screenshots/web-player/connect-ready.png)

When you add another server later, the app goes straight back to where you were instead.

## Trying AudioSilo without a server

Some servers offer a guest **demo**. If the one you enter does, the *"Found"* card also offers **Try the demo**, which signs you in to a throwaway demo account with nothing to type. There's also a public demo you can explore any time: see [The demo](../demo.md).

## Getting back in after signing out

Signing out is not a big deal - the app remembers every server you've connected to before. The connect screen lists each remembered server you aren't signed in to under **Reconnect**, as a one-tap **Reconnect to &lt;server name&gt;** row, so you only re-enter your code or password - never the server address again. (In the apps, a server with a [home address](#at-home-and-away) is tried there first.) The **X** beside a row forgets that server.

If your session is ever rejected while you're using the app - for example your admin revoked this device, or the server was rebuilt - a **Reconnect to &lt;server name&gt;** bar appears at the top of the screen instead of failing silently. Tapping it takes you straight to the sign-in screen for that server, ready for a fresh code or password.

The most dependable key of all is a [password](account.md#password) you set on your server's account page: with one, reconnecting is just your username and password on any device, with no code or invite needed.

## What the `audiosilo://` link does

Links that start with `audiosilo://` are special app links. They don't open a web page - they launch the **AudioSilo app** installed on your device and hand it the sign-in details, so the app connects itself with no typing. The **Open in app** button on the connect page uses one of these.

If nothing happens when you tap one, the app simply isn't installed on that device - use **Open web player** instead, or install the app first (see [The mobile apps](mobile-apps.md)).

## Adding more devices later

Already signed in on one device and want another? You don't need a new invite:

- Open your [account page](account.md#opening-it) for the server and tap **Show a pairing code** under **Pair another device**. Scan the QR with the other device, or send it the link. The code works for 10 minutes. See [Pair another device](account.md#pair-another-device).
- Or, if you've [set a password](account.md#password), just sign in with your username and password on the new device.

You can even connect the app to **more than one server** - **Add a server** in your profile menu, or under [Settings > Accounts and devices](settings.md#accounts-and-devices). Your home screen and search then span all of them.

## At home and away

A server can have two addresses: a **home address** that only works on the same network as the server (fast, like `http://192.168.1.20:8080`), and an **away address** that works from anywhere (its public address, like `https://books.example.com`).

When the server has both, the **iOS and Android apps** use the home address while you're at home and the away address when you're out, and **switch by themselves**: when the app opens or comes back to the front, and when your phone changes network. A book streaming at the time carries on from the new address at the same place; a paused one switches when you next press play. Downloaded books play from your phone either way.

The app learns the two addresses when it connects, whichever way you sign in, and asks the server again each time it starts, so a home address your admin sets later reaches it too. When the server has both, an **At home and away** card shows them on *"Your library is ready."*, and on the sign-in screen when you reconnect to that server. Your [account page](account.md#at-home-and-away) for the server always lists them, and in the apps says which one is in use.

Before using the home address, the app checks that the server answering there really is yours, so your sign-in never goes to another machine that happens to have the same address on someone else's network. If that check fails, it simply uses the away address.

The **web player** doesn't switch: it keeps using the address you opened it at.

### If the app doesn't switch to the home address

The app quietly keeps using the away address whenever the home address doesn't answer as your server. Things to check:

- **Is the server new enough, and does it know its home address?** Your admin sets it as **Home address** in the admin console ([Server settings > General](../admin/server.md#general)). Left empty, the server offers the address you connected with when that was already a home-network address, and nothing otherwise.
- **Is your phone on the same network as the server?** A guest Wi-Fi network, a VPN, or a mesh node that keeps devices apart can stop the home address answering.
- **Does the home address work from the phone?** Open it in the phone's browser, e.g. `http://192.168.1.20:8080/web`. If the web player loads, the app can reach it too.
- **Was the address set after the app connected?** Close the app completely and open it again: it asks the server for its addresses each time it starts.

Behind a reverse proxy? See [Remote access](../getting-started/remote-access.md#tell-the-server-its-home-address).

:::note
Connecting from outside your home network (e.g. on mobile data) requires the server to be reachable from the internet - that's a server-setup topic, covered in [Remote access](../getting-started/remote-access.md). If the app says it can't reach the server, that's the usual reason.
:::
