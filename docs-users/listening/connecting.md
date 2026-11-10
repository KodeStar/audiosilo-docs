---
title: Connect the app to your server
description: "Sign in to your AudioSilo server from the web player or the iOS and Android apps, with a QR code, an invite or a password."
---

Before you can listen, the AudioSilo app or web player signs in to your server. If you run the server, scan a pairing code from the admin console. If someone invited you, open the invite link they sent.

You do this once per device. The app stays signed in until you sign out, your password changes, or an admin signs the device out.

## If you run the server

1. Sign in to the [admin console](../admin/console-tour.md).
2. Find a pairing QR code. The first-time setup ends with a **Connect a phone** step that shows one. Later, open **People**, then your own page, and select **Pair a device**.
3. Point your phone's camera at the QR code and tap the link it finds.

The phone opens the AudioSilo app, or the web player, signed in as you. You can also sign in to the app with your admin username and password. See [First run](../getting-started/first-run.md#set-up-your-server).

## If someone invited you

1. Open the invite link you were sent. It looks like `https://books.example.com/connect#code=…`.
2. The server's connect page signs the invite in.
3. Choose where to listen:
   - **Open web player** - listen in this browser, with nothing to install.
   - **Open in app** - sign in the AudioSilo app on this device. If nothing happens, the app isn't installed: see [Get the apps](mobile-apps.md).
   - The QR code - scan it to sign in your other devices, such as your phone.

![The server's connect page with a pairing QR code and Open in app and Open web player buttons](/img/screenshots/server/connect-page.png)

:::tip
Treat an invite link like a key. Anyone who opens it can sign in as you, so don't post it publicly.
:::

If the invite has expired or is used up, the page says so. Ask for a new one. The admin's side is in [Invite people](../admin/users-and-invites.md).

## Scanning the QR code with your phone

Point your phone's camera at a pairing QR code and tap the link it finds. The phone opens signed in, in the web player or the AudioSilo app.

Each device can scan the same invite code, up to the invite's number of uses. If the app is installed, you can also tap **Scan a QR code** on its connect screen. Only the iOS and Android apps can scan.

## Connecting from the app

**In the web player** there is nothing to type. It already knows the server it came from, so tap **Sign in**.

![The web player's connect screen: the server it belongs to, with Sign in and Try the demo](/img/screenshots/web-player/connect.png)

**In the iOS and Android apps:**

1. Enter the server address, for example `books.example.com`, and tap **Continue**.
2. Check the server the app found and tap **Sign in**.
3. Choose **Invite code** or **Username and password**.
4. Enter your code, or your username and password, and tap **Sign in**.

The app adds `https://` to the address. Type `http://` yourself for a server that only answers plain HTTP. Do the same at home for a server on its default self-signed certificate (see [plain HTTP at home](../getting-started/remote-access.md#plain-http-at-home-how-the-phone-apps-connect)).

If the server can't be reached, check the address for typos and that the server is on. A home address like `192.168.1.20:8080` only works on your home network.

Instead of an address, you can tap **Scan a QR code** in the apps, or **I have a pairing link** in the web player and paste the link.

An **invite code** looks like `9M4K-P2TQ-WX7V-3RHD`. Many accounts have no password, which is normal: you can [set one](account.md#password) whenever you like.

### When signing in doesn't work

| It says | What to do |
|---|---|
| The invite code didn't work | Check the code for typos. |
| The invite is used up or has expired | Ask your admin for a new invite. |
| The username or password is wrong | Check both and try again. |
| Your account is turned off | Ask your admin to turn it back on. |
| Too many tries from this network | Wait as long as it says, then try again. |

### "Your library is ready."

The first time a device connects, it shows the server's name and libraries. If you already had a book on the go, it shows where you left off. Tap **Start listening** to carry on, or **Browse the library**.

![Your library is ready: the server's name and libraries, and Start listening](/img/screenshots/web-player/connect-ready.png)

If the server has no books yet, an admin sees **Open the admin console** to [add a library](../getting-started/first-run.md#set-up-your-server).

## Getting back in after signing out

The app remembers every server you've used. The connect screen lists them under **Reconnect**, so you only re-enter your code or password, never the address.

If the server signs this device out while you're using it, a **Reconnect** bar appears at the top of the screen. Tap it to sign in again.

A [password](account.md#password) is the most dependable way back in. With one, you can sign in on any device with no code or invite.

## Adding more devices later

You don't need a new invite:

- On a signed-in device, open your [account page](account.md#pair-another-device) and tap **Show a pairing code**. Scan it with the new device within 10 minutes.
- Or sign in with your username and [password](account.md#password).
- An Apple Watch signs in from your iPhone: see [Listen on your Apple Watch](apple-watch.md#setting-it-up).

To listen from **more than one server**, tap **Add a server** in your profile menu, or in [Settings > Accounts and devices](settings.md#accounts-and-devices). Home and search then cover all of them. Only the iOS and Android apps can do this: the web player only reaches its own server.

## At home and away

A server can have two addresses. A **home address** works only on the same network as the server, like `http://192.168.1.20:8080`. An **away address** works from anywhere, like `https://books.example.com`.

When the server has both, the iOS and Android apps use the home address at home and the away address when you're out. They switch by themselves, and a playing book carries on from the same place. Before using the home address, the app checks the server there really is yours.

Your [account page](account.md#at-home-and-away) lists both addresses. The web player doesn't switch: it keeps the address you opened it at. An Apple Watch [works the same way as the phone](apple-watch.md#at-home-and-away).

To listen away from home at all, the server must be reachable from the internet. See [Reach your server from outside your home](../getting-started/remote-access.md).

### If the app doesn't switch to the home address

- **Does the server know its home address?** Your admin sets **Home address** in [Server settings > General](../admin/server.md#general). Behind a reverse proxy, see [Tell the server its home address](../getting-started/remote-access.md#tell-the-server-its-home-address).
- **Is your phone on the same network?** A guest Wi-Fi network or a VPN can stop the home address answering.
- **Does the home address work from the phone?** Open it in the phone's browser, for example `http://192.168.1.20:8080/web`. If the web player loads, the app can reach it too.
- **Was the address set after the app connected?** Close the app completely and open it again.

## Good to know

- On a device in [kids mode](kids-mode.md#links-in-kids-mode), the app doesn't open links or QR codes. It asks for a grown-up.
- A link to a book, opened while you're signed out, takes you through signing in and then to the book.
- Some servers offer a guest demo: the connect screen then shows **Try the demo**. There is also a [public demo](../demo.md).
- A pairing code made on another device works once, for 10 minutes. A link from an invite works for as many devices as the invite has uses left.
