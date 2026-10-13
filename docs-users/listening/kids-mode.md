---
title: Kids mode
description: "A simple AudioSilo for children: their stories as big covers, a big player, a bedtime that starts a sleep timer, and a Grown-ups button you hold to leave. Adding a kid to your household, setting kids mode up for any profile, a kid's own device, and choosing what they can see."
---

**Kids mode** turns AudioSilo into something a child can use on their own: their stories as big covers, a big simple player, and a bedtime. There's no search, no settings, no downloads page and nothing else to wander into. It works in the iPhone and Android apps and in the web player.

## Setting it up

Kids mode belongs to a [profile](profiles.md): a person on this device.

### The quick way: add a kid to your household

On a server that offers it, open the [Household page](household.md), tap **Add someone to your household**, type the child's name and leave **Kids account** on (see [Adding a kid](household.md#adding-a-kid)). The child gets an account of their own on your server, made by you with no admin, and is signed in on this device straight away, already in kids mode with the default bedtime. You stay the person listening.

They hear what you share with them: **Only collections I share** (the default for a kid) gives them just the books in the collections you choose, and kids mode shows those collections as their stories. Add a book to one of those collections and it's on their shelf at once. If you change them to **Everything I can listen to**, your collections stop being shared with them and kids mode shows one library instead (the **Library** below).

A kid's account is in kids mode wherever it signs in for the first time: on your device when you add them, and on their own phone or tablet when it scans the code from **Set up their own device**. It goes straight to the kids screen, with no *"Your library is ready."* page first.

### Kids mode for any profile

Kids mode also works for a child who signs in with an account the server's admin made, limited to their books with a [share](../admin/sharing.md) (see [People and invites](../admin/users-and-invites.md)). What the account can open is what kids mode can show: the app never shows a child more than their account is allowed.

1. **Add the child to the device**: **Add someone** on [Who's listening?](profiles.md#adding-someone), signing in with the child's account. The app then switches to the child.
2. **Switch back to yourself** (on Who's listening?, or **Switch** on your card on the Household page), then **turn on Kids mode** for the child under their name in **On this device** on the [Household page](household.md).

### The library and bedtime

Under the child's name on the Household page, with **Kids mode** on, pick:

- **Library**: the one library kids mode shows, when the child's account can see more than one. Left alone, it's the first one the account lists. For a kid in your household it's only there while you share no collections with them (*"Shown when Adam shares no collections"*): while you do, those collections are the shelf. Lines like this name you as this device knows you: your name on Who's listening?.
- **Bedtime**: when bedtime starts, **7:30 PM** unless you change it (times are written the way the app's language writes them: 7:30 PM in English, 19:30 in the other languages).

If you turn kids mode on while the child is the one listening, the app goes straight into kids mode. To pick the library and bedtime then, hold **Grown-ups**, choose yourself and open the Household page.

Kids mode can't be turned on for the last grown-up on the device: someone has to be able to leave it. A kids account from your household is the exception, on its own device (below).

It's a good idea to give the grown-ups' profiles a [PIN](profiles.md#a-pin-for-a-person): leaving kids mode goes through Who's listening?, and without a PIN a child can choose a grown-up there.

## What the child sees

![Kids mode on a computer: Hi Leo, the bedtime card, the big player with a story loaded, and the story tiles](/img/screenshots/web-player/kids.png)

- **"Hi Leo"** at the top, with the **Grown-ups** button.
- **The bedtime card**: *"Bedtime is at 7:30 PM"*, and what happens then. At bedtime it says *"It's bedtime"*, and while the sleep timer runs, how many minutes it has left.
- **The story playing now**, in a big player: the cover, the title, the chapter and the minutes left in it, a line showing how far through the chapter they are, and four big buttons: **previous chapter**, **go back 30 seconds**, **play/pause** and **next chapter**. No speed, no sleep menu, no bookmarks. Stories start at normal speed (1×), whatever the device's **Default speed** is, so a grown-up's faster speed never carries over to a child (a story that already has a speed saved for the child keeps it).
- **Your stories**: big cover tiles, the stories they're part-way through first, then every other book, finished ones too (children listen again). Tap one and it plays right there. For a kid in your household, the stories are the books in the collections you share with them, grouped under each collection's name when there are several; while those collections have no stories yet, it says *"Ask a grown-up to add stories."* Anyone else, and a kid you haven't shared a collection with yet, sees the one library chosen for them (if their account can see one).

![Kids mode on a phone: the bedtime card, the four big player buttons and the story tiles in two columns](/img/screenshots/web-player/phone-kids.png)

In the car, a kids profile's [CarPlay or Android Auto](in-the-car.md#a-kids-profile-in-the-car) shows only these stories.

If the server can't be reached, kids mode shows the stories downloaded to this device for the child's account, so a downloaded story still plays in the car or on a plane. They come from the child's library when the app knows which one that is: the **Library** you picked, or the one it was showing before the server went away. If the app is opened while the server can't be reached and no Library was picked, every story downloaded for the child's account shows. With no downloads, it says the stories can't load and offers **Try again**.

### If a kid is signed out

If the child's sign-in ends (a grown-up signed that device out, or the server was reset), the kids screen says *"Ask a grown-up to sign Leo in again."* It says so above the stories still on the device, or under *"Signed out of Hearthside"* when there are none. There's no button for the child to press: signing in is a grown-up's job. Hold **Grown-ups**, choose yourself, open the [Household page](household.md#when-a-member-is-signed-out-on-this-device) and tap **Sign in again** on the child's card under **On this device**. For a kid in your household that signs them straight back in, with no password, keeping the child's profile and kids mode.

### Links in kids mode

Kids mode never opens a sign-in or pairing link, or a QR code scanned for this device: the app goes back to the kids screen and says *"Ask a grown-up to open this link"* (*"A grown-up holds Grown-ups first, then opens the link again."*). Nothing is signed in and the link isn't used up, so a grown-up can open it once they've left kids mode.

## Bedtime

From the bedtime you set until **6:00 AM** the next morning, starting or resuming a story starts a **20-minute sleep timer**: the story plays for 20 minutes, then the sound fades out slowly and it stops. It works the same way as the [sleep timer](sleep-timer.md), but the child doesn't have to set anything.

- It never starts in the car (CarPlay or Android Auto).
- While a kids profile is listening, its bedtime replaces the device's own [automatic sleep timer](sleep-timer.md#starting-a-timer-automatically-at-night) setting; for everyone else on the device that setting is unchanged.

## Leaving kids mode

**Press and hold Grown-ups for 2 seconds.** While it's held the button says *Keep holding* and a fill grows across it; let go early and nothing happens. (With reduced motion on there's no fill, and it still takes the full 2 seconds. A screen reader announces it as a hold to leave kids mode.)

Holding it opens [Who's listening?](profiles.md#whos-listening): choose a grown-up (with their PIN, if they have one) to leave kids mode, or the child again to go back. While a child is listening and a grown-up is on the device, **Add someone** is turned off there (*"Choose a grown-up before adding someone."*), so a child can't get out of kids mode by adding a new person. Choose a grown-up first. On Android, the back button never takes a child out of kids mode (at most it closes the app).

To stop using kids mode for good, turn **Kids mode** off for that person on the [Household page](household.md). That only changes what this device shows: what the account may listen to is the server's to decide, so turning kids mode off never lets a child hear more.

## On a kid's own device

A kid in your household can have a phone or tablet of their own: on their card on the Household page, tap **Set up their own device** and scan the code with the AudioSilo app on their device (see [Their devices](household.md#their-devices)). The app there starts in kids mode by itself, even though no grown-up is signed in on it.

On that device, holding **Grown-ups** opens Who's listening? with only the child on it, and **Add someone** stays available there: a grown-up can sign in with their own account to change the bedtime or turn kids mode off, and then remove themselves from the device again. That is the only way from kids mode into signing in: a link opened there is turned away as on any device (see [Links in kids mode](#links-in-kids-mode)). A kids account can't set a password, make API keys, pair another device or share its listening with the house, whichever device it's on.
