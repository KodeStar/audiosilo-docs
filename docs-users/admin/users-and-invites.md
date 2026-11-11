---
title: "Invite people"
description: "Give people access to your server with an invite, manage each person's access, devices and sign-in, and sign out or remove accounts."
---

There are two ways to give someone access to your server:

- **Invite them** as their own account. You make the invite in the admin
  console and choose what they can listen to. Use this for anyone you want to
  manage yourself: friends, family in another home, other adults.
- **Add them as a household member.** Anyone with an account can add the kids
  and grown-ups they live with from the player, with no invite from you. The
  person who adds them manages them. See [Add your household](../listening/household.md).

Several people sharing one phone or tablet? Each signs in with their own
account and switches between [profiles](../listening/profiles.md). To give
someone only some of your books, see [Limit what someone can see](sharing.md).

Everything below is in **People** in the [admin console](console-tour.md), and
needs an admin.

## Inviting someone

1. Click **Invite someone** (on the People or Invites page).
2. Enter **Their name**.
3. Choose **What can they listen to?**: **All libraries**, one library, one of
   your [shares](sharing.md), or **Decide later**.
4. Choose how many **Devices it can pair** (5 by default) and when it
   **Expires after** (1 day by default).
5. Click **Create invite**.

![A freshly created invite](/img/screenshots/admin/invite.png)

The invite shows a **QR code**, an **Invite link** and the **Code** on its own.
Send them the link, or let them scan the QR code. They can use the same link on
each of their devices until it runs out. See
[Connecting](../listening/connecting.md) for what they see.

The code is shown only this once. To send a fresh one later,
[rotate](#rotating-and-revoking) the invite.

The new account has no password and isn't an admin. Most listeners never need a
password, because they pair their devices instead.

**All libraries** gives them each library you have now. Give them each library you add
later separately, from their page.

## The People page

![The People page: person cards, with one household grouped into a block](/img/screenshots/admin/people.png)

**People > People** shows everyone as a card. It shows whether they are
listening now or when they were last active, the book they are in the middle
of, and their devices. A household is grouped into one block. Click a card to open
that person's page.

## A person's page

A person's page has six tabs: **Listening**, **Access**, **Devices**,
**Invites**, **Sign-in** and **Account**.

**Pair a device** in the header makes a new invite for this person, for a new
phone or a lost link. It replaces any invite they already have.

### Listening

![A person's Listening tab](/img/screenshots/admin/person-listening.png)

Their listening this year, the books in progress and finished, and their recent
sessions. Each book has a **...** menu to
[edit their progress](#editing-someones-progress). If you
[imported](import.md) their history, an **Imported history** card lists each
import with **Undo**.

### Access

![A person's Access tab](/img/screenshots/admin/person.png)

What this person can listen to: whole libraries and [shares](sharing.md).

- **Give access** adds a library or share.
- **Remove** takes one away.

They see the change the next time their app refreshes. Someone with no access
can sign in but sees no books. Admins always see everything.

For a household member, a card above says what they get through the person who
added them. Anything you give them here comes on top.

![A kid household member's Access tab](/img/screenshots/admin/person-member.png)

### Devices

Their signed-in devices, each with **Sign out**, and their personal API keys,
each with **Revoke**.

**Sign out everywhere** signs them out of every phone, tablet and browser at
once. Household members signed in on those devices are signed out too. Their
password and API keys don't change. To get back in, they sign in
with their password, or you send them a new invite.

### Invites

Their invites, with **Rotate** and **Revoke**, as on the
[Invites page](#the-invites-page).

### Sign-in

- **Set a password** (or **Change password**) - at least 8 characters. A
  password lets them sign in to the web player by username. Changing a password
  signs them out everywhere. Kids have no password.
- **Revoke recovery code** - only shown if they saved one from an older app.

### Account

- **Role** - **Member** or **Admin**. An admin sees every library and can use
  the console. Making someone an admin asks for a password if they don't have
  one.
- **Household** - see [Household members](#household-members).
- **Danger zone** - [disable or delete](#disabling-vs-deleting) the account.

**Last active** is the last time any of their devices talked to the server.

## Household members

People add the kids and grown-ups they live with from the player's
[Household page](../listening/household.md), with no invite from you. Each
**household member** is a real account with its own progress, managed by the
person who added them (the **owner**). The owner chooses what they can listen
to, and manages their devices.

You control this in two places:

- **Server > Settings > Household** turns it on or off for the whole server and
  sets how many members each person can add. See [Household](server.md#household).
- **Can add household members**, on a person's **Account** tab, turns it off
  for just that person.

On a member's **Account** tab you can also:

- **Make independent** - take them out of the household, as an ordinary account
  you manage. They keep their progress.
- **Assign to someone** - move them to another person's household. This also
  works for an ordinary account, such as one you made for a child earlier.

Deleting an owner deletes their members too, unless you untick them in the
delete dialog.

## Editing someone's progress

The **...** menu beside each book on a person's [Listening](#listening) tab
(or beside each listener on a [book's page](books.md#listeners-and-who-can-see-the-book))
offers:

- **Mark as finished** (with **Undo**) or **Mark as not finished**.
- **Edit dates...** - when they started and finished the book.
- **See listening sessions** - opens [Activity > Sessions](activity.md#sessions).

A device that is still playing the book saves its own position again within
moments.

## The Devices page

![The Devices page](/img/screenshots/admin/devices.png)

**People > Devices** lists every signed-in device and API key on the server:
its name, app, owner and when it was last seen.

**Sign out** (or **Revoke** for an API key) stops that one device at once. The
person's other devices stay signed in. To sign out all of someone's devices, use
[Sign out everywhere](#devices) on their page.

A browser you sign out here is announced as a
[new sign-in](notifications.md#what-to-send) if it signs in again.

## The Invites page

![The Invites page](/img/screenshots/admin/invites.png)

**People > Invites** lists every invite, with who it is for, how many devices it
has paired and when it expires. An invite is **Active**, **Used up** or
**Expired**.

### One active invite per user

Each person has at most one active invite. Making a new one, or rotating an old
one, stops their other invites working.

### Rotating and revoking

- **Rotate** gives the invite a new code, with a fresh expiry. The old link and
  QR code stop working at once.
- **Revoke** removes the invite.

Either way, devices already paired stay signed in. To stop someone's devices
working, [disable the account](#disabling-vs-deleting).

## Disabling vs deleting

- **Disable account** - their devices stop working, but nothing is lost.
  **Enable** brings everything back.
- **Delete account** - permanent. It removes their devices, invites, progress,
  bookmarks, notes and history. Your audio files are not touched.

When in doubt, disable.

## Good to know

- There is always at least one admin. The last admin can't be demoted, disabled
  or deleted.
- You can't delete, disable or change the role of your own account. Ask another
  admin.
- A household member can't be an admin. Make them independent first.
