---
title: Kids mode
description: "A simple AudioSilo for children: one library as big covers, a big player, a bedtime that starts a sleep timer, and a Grown-ups button you hold to leave. Setting it up for a child's profile, and choosing what they can see."
---

**Kids mode** turns AudioSilo into something a child can use on their own: their stories as big covers, a big simple player, and a bedtime. There's no search, no settings, no downloads page and nothing else to wander into. It works in the iPhone and Android apps and in the web player.

## Setting it up

Kids mode belongs to a [profile](profiles.md): a person on this device. To set one up:

1. **Give the child an account on your server**, and limit what it can see to their books: in the admin console, a [share](../admin/sharing.md) with just the children's library or folders, given to that account (see [Users and invites](../admin/users-and-invites.md)). What the account can open is what kids mode can show: the app never shows a child more than their account is allowed.
2. **Add the child to the device**: **Add someone** on [Who's listening?](profiles.md#adding-someone), signing in with the child's account.
3. **Turn on Kids mode** for them in [Settings > Household and sharing](settings.md#household-and-sharing), under their name. Then pick:
   - **Library**: the one library kids mode shows, when the child's account can see more than one. Left alone, it's the first one the account lists.
   - **Bedtime**: when bedtime starts, **19:30** unless you change it.

It's a good idea to give the grown-ups' profiles a [PIN](profiles.md#a-pin-for-a-person): leaving kids mode goes through Who's listening?, and without a PIN a child can choose a grown-up there.

## What the child sees

- **"Hi Leo"** at the top, with the **Grown-ups** button.
- **The bedtime card**: *"Bedtime is at 19:30"*, and what happens then. At bedtime it says *"It's bedtime"*, and while the sleep timer runs, how many minutes it has left.
- **The story playing now**, in a big player: the cover, the title, the chapter and the minutes left in it, a line showing how far through the chapter they are, and four big buttons: **previous chapter**, **go back 30 seconds**, **play/pause** and **next chapter**. No speed, no sleep menu, no bookmarks.
- **Your stories**: the library as big cover tiles, the stories they're part-way through first, then every other book, finished ones too (children listen again). Tap one and it plays right there.

If the server can't be reached, kids mode shows the stories downloaded to this device for the child's account, so a downloaded story still plays in the car or on a plane. With no downloads, it says the stories can't load and offers **Try again**.

## Bedtime

From the bedtime you set until **06:00** the next morning, starting or resuming a story starts a **20-minute sleep timer**: the story plays for 20 minutes, then the sound fades out slowly and it stops. It works the same way as the [sleep timer](sleep-timer.md), but the child doesn't have to set anything.

- It never starts in the car (CarPlay or Android Auto).
- While a kids profile is listening, its bedtime replaces the device's own [automatic sleep timer](sleep-timer.md#starting-a-timer-automatically-at-night) setting; for everyone else on the device that setting is unchanged.

## Leaving kids mode

**Press and hold Grown-ups for 2 seconds.** A fill grows across the button while it's held; let go early and nothing happens. (With reduced motion on, the button says *Keep holding* instead of filling, and still takes the full 2 seconds. A screen reader announces it as a hold to leave kids mode.)

Holding it opens [Who's listening?](profiles.md#whos-listening): choose a grown-up (with their PIN, if they have one) to leave kids mode, or the child again to go back. On Android, the back button never takes a child out of kids mode (at most it closes the app).

To stop using kids mode for good, turn **Kids mode** off for that person in Settings > Household and sharing.
