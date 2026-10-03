---
title: "People and invites"
description: "Inviting people to an AudioSilo server with a link or QR code, managing each person's access, sign-in and account, rotating and revoking invites, and the safety rails around admin accounts."
---

**People** in the [admin console](console-tour.md) is where you invite people,
get their devices connected, and manage what each person can listen to and how
they sign in. It has three working sections: **People**, **Invites** and
**Shares** (see [Sharing](sharing.md)); **Devices** is still to come.

## The People page

![The People page](/img/screenshots/admin/people.png)

**People > People** shows everyone with an account as a card, with a count of
accounts and how many were active this month. Each card shows:

- the person's name, with an **Admin** badge for administrators and a **Demo**
  badge for visitors' accounts on a server running in
  [demo mode](../demo.md);
- what they're doing: **Listening now**, **Active** *some time ago*, **Never
  signed in**, or **Disabled** ("their devices are paused");
- how they sign in: **Password and paired devices**, or **Paired devices only**;
- the book they're in the middle of, with its progress (the ring around their
  avatar shows the same progress), or "Nothing in progress".

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

![A person's page](/img/screenshots/admin/person.png)

A person's page shows their name and role (**Admin** or **Member**), when they
were last active, and whether they have a password ("Has a password" or "No
password (player only)"). It has four tabs.

**Pair a device** in the header makes a new invite for this person - for a new
phone, or when they lost the old link. It asks for **Devices it can pair** and
**Expires after**, then shows the same invite card. If they already have an
active invite, the dialog warns that the new one replaces it, "so only the
newest link works" (see [One active invite per user](#one-active-invite-per-user)).
A disabled account can't be invited until you enable it again.

### Access

What this person can listen to: each **whole library** and each
[share](sharing.md) they have, with the folders the share covers.

- **Give access** adds a whole library or one of your shares they don't have
  yet.
- **Remove** takes one away.

The person sees a change the next time their app refreshes. Someone with no
access can still sign in, but won't see any books. Admins don't have this list:
"Admins always see everything. Access rules don't apply to them."

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
