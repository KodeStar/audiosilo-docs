---
title: Your account and settings
description: "The Settings screen: appearance, language, playback preferences, passwords, recovery codes, pairing extra devices, and signing out safely."
---

The **Settings** tab is where you tune the player and look after your account:

![The Settings screen](/img/screenshots/web-player/settings.png)

## Servers

The servers this app is connected to. You can **Add a server** to connect a second (or third) one — your home screen, search, and favourites then combine everything — and remove one you no longer use. See [Connecting and signing in](connecting.md).

## Appearance

**Light**, **Dark**, or **System** (follow your device's setting). AudioSilo is designed dark-first, but the light theme is fully supported.

## Language

The app speaks **English, Español, Français, Deutsch, Português, and Italiano**. Pick one, or leave it on **System** to follow your device's language.

## Playback

Your playback preferences (kept per device, so your phone and your desktop can differ):

| Setting | What it does | Range |
|---|---|---|
| **Skip back** | The jump of the player's back button | 5–120 s (default 15 s) |
| **Skip forward** | The jump of the forward button | 5–120 s (default 30 s) |
| **Default speed** | Starting speed for books you haven't played yet (each book then remembers its own) | 0.5×–2× |
| **Auto-rewind on resume** | How far playback backs up after a pause, so you regain the thread | Off–30 s (default 5 s) |
| **Chapter length (unchaptered)** | Size of the virtual chapters created for long books with no chapter markers | 5–60 min (default 30 min) |

## Account

Shows who you're signed in as, your role, and the server address — plus the two credentials worth setting up:

### Set a password

Accounts created by invite often start **without** a password — you signed in with a code, and that's fine day to day. Setting one gives you a normal username + password sign-in:

- Tap **Set a password** (or **Change password**), enter a new password of at least 8 characters, and save.
- Changing an existing password asks for your **current password** first.

### Recovery code — your way back in

A **recovery code** is a code only you hold that signs you back in on any device — *"A code you keep to sign back in yourself — no admin needed."*

Why you want one: if you sign out (or get a new phone) and have **no password and no recovery code**, the only way back into your account is asking your admin for a fresh invite. A recovery code removes that dependency entirely — it never expires and works any number of times, typed into the same code box as an invite (see [Connecting](connecting.md)).

- Tap **Generate recovery code**. The code is shown **once** — *save it somewhere safe* (a password manager is ideal). It won't be shown again.
- **Regenerate recovery code** replaces it; the app warns you first, because the old code stops working the moment a new one exists.

:::warning
Treat a recovery code like a password: anyone who has it can sign in as you. If yours ever leaks, regenerate it (or ask your admin to revoke it).
:::

### Signing out

**Sign out** disconnects this device. If you're about to sign out with **neither a password nor a recovery code**, the app stops you with a warning — *"Without one you'll need a new invite from your admin to sign back in"* — and offers to **Set a recovery code** right there. Take the offer; it's the whole reason the button exists.

## Devices

Pair another phone, tablet, or browser to your account without a new invite: tap **Add a device** and a QR code appears. Scan it with the other device (or share the link to it) and it signs straight in. The details are in [Connecting and signing in](connecting.md).

## Support

On the web and Android, a **Support AudioSilo** section links to GitHub Sponsors — AudioSilo is free and self-hosted, and contributions fund its development. (The section doesn't appear in the iOS app.)

## Version

The footer shows the version you're running, e.g. *AudioSilo v1.1.1* — when connected, this reflects the server's version. Handy to mention if you ever report a problem (see [Troubleshooting](../troubleshooting.md)).

:::note
Things an admin manages — creating accounts, invites, what libraries you can see — aren't in your Settings; they live in the server's admin console. See [Users and invites](../admin/users-and-invites.md).
:::
