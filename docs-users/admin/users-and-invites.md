---
title: "People and invites"
description: "Inviting people to an AudioSilo server with a link or QR code, each person's listening, access, devices, sign-in and account, editing someone's progress, signing out a device, rotating and revoking invites, and the safety rails around admin accounts."
---

**People** in the [admin console](console-tour.md) is where you invite people,
get their devices connected, and manage what each person can listen to and how
they sign in. It has four sections: **People**, **Invites**, **Shares** (see
[Sharing](sharing.md)) and **Devices**.

## The People page

![The People page](/img/screenshots/admin/people.png)

**People > People** shows everyone with an account as a card, with a count of
accounts and how many were active this month. Each card shows:

- the person's name, with an **Admin** badge for administrators and a **Demo**
  badge for visitors' accounts on a server running in
  [demo mode](../demo.md);
- what they're doing: **Listening now** (one of their devices is playing, or
  paused in the last ten minutes), **Active** *some time ago*, **Never signed
  in**, or **Disabled** ("their devices are paused");
- how they sign in: **Password and paired devices**, or **Paired devices only**;
- the book they're listening to right now, or else the book they're in the
  middle of, with its progress (the ring around their avatar shows the same
  progress), or "Nothing in progress";
- their signed-in devices, by name ("2 devices · Pixel 8, Kitchen tablet"), or
  "No devices". Personal API keys aren't counted here; the
  [Devices page](#the-devices-page) lists them.

Click a card to open [that person's page](#a-persons-page).

## Inviting someone

Click **Invite someone** (on the People or Invites page, or in the
[command palette](console-tour.md#search-and-commands)). One dialog creates the
account, gives it access and makes the invite:

- **Their name** - how they appear in the player and in this console.
- **What can they listen to?** - **All libraries**; a single library (offered
  when you have more than one); one of your [shares](sharing.md); or **Decide
  later** ("They can pair now but won't see any books until you give them
  some"). **All libraries** gives them each library you have now; a library you
  add later has to be given separately, from their page.
- **Devices it can pair** - 1, 3, **5** (the default) or 10 devices, or **Any
  number of devices**. A device counts only when it actually finishes pairing -
  opening the link or showing the QR costs nothing - so the default lets the
  same person connect a phone, a tablet and a browser from one invite with
  spares left over.
- **Expires after** - **1 day** (the default), 7 days, 30 days, or **Never**.

Click **Create invite**. The new account has **no password** - most listeners
never need one, they pair their devices instead - and is a regular member, not
an admin.

![A freshly created invite](/img/screenshots/admin/invite.png)

The invite opens on screen ready to send:

- a **QR code** they can scan with their phone's camera,
- the **Invite link**, with a **Copy** button,
- the **Code** on its own, with a **Copy** button, for typing into an app's
  connect screen or the connect page's code box,
- how many devices it can pair, and when it expires, as a date and time (for
  example "Expires Oct 10, 7:52 PM") or "Never expires".

Send the link or show the QR, by whatever channel you like. When they open it,
the connect page **redeems the code automatically** and shows them a QR code
plus **Open in app** and **Open web player** buttons. The invite stays good for
as long as it has devices left and hasn't expired, so each of their devices can
use the same link - see [Connecting](../listening/connecting.md) for what that
looks like on their end.

:::note The code is shown once and never reaches the server's logs
"This is the only time the code is shown." The server keeps only a fingerprint
of it, so it can check codes but never display them again - to send a fresh one
later, [rotate](#rotating-and-revoking) the invite. The link carries the code
after a `#`, a part of a URL that is never sent over the network, so it can't
end up in server or proxy access logs (and the connect page removes it from the
address bar as soon as it has redeemed it). The QR code is drawn by your
browser, so the code doesn't travel back to the server for that either.
:::

## A person's page

A person's page shows their name and role (**Admin** or **Member**), when they
were last active, and whether they have a password ("Has a password" or "No
password (player only)"). It has six tabs: **Listening** (the one it opens on),
**Access**, **Devices**, **Invites**, **Sign-in** and **Account**.

**Pair a device** in the header makes a new invite for this person - for a new
phone, or when they lost the old link. It asks for **Devices it can pair** and
**Expires after**, then shows the same invite card. If they already have an
active invite, the dialog warns that the new one replaces it, "so only the
newest link works" (see [One active invite per user](#one-active-invite-per-user)).
A disabled account can't be invited until you enable it again.

### Listening

![A person's Listening tab](/img/screenshots/admin/person-listening.png)

- **Their listening year**: how long they listened this year (in minutes
  until it passes an hour), the books they finished and their best streak of
  days in a row, with their hours per month. "This year" is the server's.
- **In progress**: the books they have started, with how far they are and when
  their progress was last saved.
- **Finished**: the books they finished, newest first, with the start and
  finish dates.
- **Recent sessions**: their latest listening sessions. **All sessions** opens
  them all in [Activity > Sessions](activity.md#sessions).

Each book in the two lists has a menu (**...**) to
[mark it finished, edit its dates or see its sessions](#editing-someones-progress).

### Access

![A person's Access tab](/img/screenshots/admin/person.png)

What this person can listen to: each **whole library** and each
[share](sharing.md) they have, with the folders the share covers.

- **Give access** adds a whole library or one of your shares they don't have
  yet.
- **Remove** takes one away.

The person sees a change the next time their app refreshes. Someone with no
access can still sign in, but won't see any books. Admins don't have this list:
"Admins always see everything. Access rules don't apply to them."

### Devices

The person's signed-in devices, the same list as the
[Devices page](#the-devices-page), each with **Sign out**, and under them their
personal **API keys**, each with **Revoke**. The number on the tab counts the
devices only, as their card does. With no devices, **Pair a device** makes an
invite for them.

### Invites

This person's invites, with the same status, devices paired and expiry columns,
and the same **Rotate** and **Revoke** buttons, as the
[Invites page](#the-invites-page).

### Sign-in

- **Password** - **Set a password** (or **Change password**) for them. It must
  be at least 8 characters. A password lets them sign in to the web player by
  username as well as on paired devices; their paired devices stay signed in.
  The console can set or change a password but not remove one.
- **Recovery code** - only shown when the person saved one from an older app
  version. It can't be viewed, only revoked: **Revoke recovery code** stops it
  working at once (their paired devices stay signed in).

### Account

- **Role** - **Member** (a listener) or **Admin** (full access to every
  library, and can use this console). Making a password-less member an admin
  asks you to choose a password for them in the same step ("Make *name* an
  admin"), since admins sign in to the console with one. You can't change your
  own role here; another admin can.
- **Danger zone** - **Disable account** and **Delete account**, below.

### "Last active"

**Last active** is the last time any of the person's signed-in devices talked to
the server - browsing, playing, or syncing progress all count. It reads "Never
signed in" for an account that has been created but has not connected yet.
There is no separate "last login" - a player stays signed in for months, so the
last request is the honest measure of activity.

## Editing someone's progress

The progress menu (**...**) sits beside each book on a person's
[Listening](#listening) tab, and beside each person under **Listeners** on a
[book's page](books.md#listeners-and-who-can-see-the-book). It offers:

- **Mark as finished** - moves them to the end of the book and records it as
  finished today. The message that confirms it has an **Undo** that puts them
  back where they were.
- **Mark as not finished** (on a finished book) - clears the finish date and
  leaves them where they were.
- **Edit dates...** - sets when they **Started on** and **Finished on** the
  book. Leave a date empty to clear it. A finish date needs a finished book
  ("Mark the book finished to give it a finish date."), dates can't be in the
  future, and the finish can't be before the start (the same day is fine). The dates count in
  [Activity](activity.md) and in the year in listening.
- **See listening sessions** - opens [Activity > Sessions](activity.md#sessions)
  for this person and this book.

Your change wins over what their devices saved before it, but a device that is
still playing the book saves its own position again within moments. You can
still edit progress on a book after taking their access to it away, for
example to mark it finished.

## The Devices page

![The Devices page](/img/screenshots/admin/devices.png)

**People > Devices** lists every signed-in device on the server, most recently
seen first: each paired phone or tablet, each browser signed in to the web
player or this console, and each personal API key. For each one:

- its name, as the device gave it when it signed in (an API key's label), with
  a **This device** badge on the one you're using;
- the app and its version ("AudioSilo 1.4.2 · iOS", "Admin console", "Personal
  API key", or "Unknown app" for an app from before apps named themselves),
  when it was last seen (or "never used") and the network address it last
  connected from;
- when it signed in ("Signed in 3 days ago"; for an API key, when it was
  created);
- whose it is. Click the name to open their page.

**Sign out** (**Revoke** for an API key) asks first, then stops that one device
working at once. The person's other devices stay signed in, and they can pair
the device again with an invite; a revoked API key can't be restored, but the
person can create a new one. The device you're using can't be signed out here:
use **Sign out** in the account menu instead.

Signing a browser out here also makes the server forget it: if it signs in
again, it is announced as a [new sign-in](notifications.md#what-to-send) even
if it had signed in before. That's on purpose. If someone else had the
password, you hear about it when they come back.

The server keeps only the newest address of each device, and forgets it within a
day of the device signing out. See
[What the server records](activity.md#what-the-server-records).

## Disabling vs deleting

These are very different levers:

- **Disable account** is the reversible one: "Their devices stop working until
  you enable the account again. Nothing is lost." A disabled account can't sign
  in, and its invites stop redeeming. All of its progress, bookmarks and
  settings are kept. **Enable** restores everything exactly as it was.
- **Delete account** is permanent. You type the person's name to confirm, and
  it "removes the account and everything tied to it: devices, invites,
  progress, bookmarks, notes and history. Audio files are not touched. This
  can't be undone." The confirmation offers **Disable the account instead** if
  you want something reversible.

When in doubt, disable. Delete is for accounts you are certain you'll never
want back.

## The Invites page

![The Invites page](/img/screenshots/admin/invites.png)

**People > Invites** lists every invite on the server: who it's **For**, its
**Status**, **Devices paired** (for example "2 of 5"), when it **Expires** and
when it was **Created**. Switch between **Active** (the default) and **All**.
An invite's status is one of:

- **Active** - it can still pair devices.
- **Used up** - it has paired as many devices as it allows.
- **Expired** - its time ran out.

### One active invite per user

Each person has at most one active invite. Making a new one (with **Invite
someone** or **Pair a device**), or rotating an old one, automatically removes
any other invite of theirs that could still be used. Used-up and expired invites are kept, under
**All**, so you have a record of what was issued.

### Rotating and revoking

- **Rotate** gives the invite a fresh code and shows the new invite card. The
  **old link and code stop working immediately** - including any QR code
  still on someone's screen. The invite keeps its device limit (its count of
  paired devices starts again from zero), and its expiry restarts for the same
  window it was originally given: a 7-day invite gets another 7 days, so
  rotating never quietly shortens it. Rotating also keeps the
  [one-active-invite rule](#one-active-invite-per-user): any *other* invite of
  that person's that could still be used stops working, so rotating an expired
  invite makes it usable again as their one active invite. Devices already
  paired with it stay signed in. Used-up invites
  have no **Rotate** button; make a new one with **Pair a device**.
- **Revoke** removes the invite: "The link and its QR code stop working at
  once. Devices already paired stay signed in."

To stop a person's devices working, [disable the account](#disabling-vs-deleting)
instead.

## Safety rails

The server enforces a few guards so you can't lock yourself out:

- The **last enabled admin can't be demoted, disabled or deleted** - there is
  always at least one working admin account ("This server needs at least one
  admin. Make someone else an admin first.").
- **Admins must keep a password.** A password-less account can only become an
  admin together with a new password.
- **You can't delete or disable your own account, or change your own role,**
  from the console. Ask another admin.
- If another admin makes you a member while you're signed in, the console signs
  you out.
