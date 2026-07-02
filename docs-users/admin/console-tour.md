---
title: "Admin console tour"
description: "Where to find the AudioSilo admin console, how to sign in, and what each section of the console does."
---

Every AudioSilo server ships with a built-in admin console. It is a plain web
page served by the server itself — nothing extra to install — and it is where
you manage libraries, users, invites and shares.

## Opening the console

The console lives at `/admin` on your server. If your server runs at
`https://audiobooks.example.com`, open:

```
https://audiobooks.example.com/admin
```

There is also an **Admin section** link at the bottom of the server's connect
page (the page you get at the server's plain address, `/`).

## Signing in

![The admin sign-in screen](/img/screenshots/admin/login.png)

Sign in with an **administrator account** — the username and password created
when you first set up the server (see [First run](../getting-started/first-run.md)
if you haven't done that yet, or don't have the credentials to hand).

A few things worth knowing:

- Only admin accounts can use the console. Signing in with a regular listener
  account shows "This account is not an administrator."
- Admin accounts always have a password. Regular listeners often don't — they
  join with [invite codes](users-and-invites.md) instead — which is why the
  console sign-in is username + password only.
- The **Language** selector at the bottom of the sign-in card (and in the
  sidebar once signed in) switches the console's language.
- If your session expires, the console returns you to the sign-in screen; just
  sign in again.

:::tip
The console is installable as an app. If you open it over HTTPS (or on
`localhost`), your browser offers to install it — handy for keeping server
admin one tap away on a phone or in the dock.
:::

## The layout

Once signed in, the console is a single page with a sidebar on the left and the
selected section on the right. The sidebar has four sections:

| Section | What it's for |
|---|---|
| **Overview** | Totals and a live view of what people are listening to. |
| **Libraries** | The folders scanned for audiobooks: add, reorder, rescan, correct folder detection, delete. See [Libraries](libraries.md). |
| **Users** | Accounts: create users, manage roles and passwords, mint invite codes, grant access, disable or delete. See [Users and invites](users-and-invites.md). |
| **Shares** | Named sets of folders you grant to users to control who sees what. See [Sharing](sharing.md). |

The bottom of the sidebar shows who you are signed in as, a **Sign out**
button, the language selector, and the server's version number.

## Overview

![The Overview section with stat cards, per-library counts and the listening feed](/img/screenshots/admin/overview.png)

**Overview** is the console's home screen ("Library size and what people are
listening to"). It has three parts:

### Stat cards

Four totals across the whole server:

- **Books** — every audiobook indexed, across all libraries.
- **Libraries** — how many library folders are configured.
- **Users** — how many accounts exist (admins and listeners).
- **Listening now** — how many books are currently in progress (started but not
  finished) across all users.

### Books per library

A simple per-library breakdown: each library's name with its book count. Useful
for spotting a library whose scan hasn't picked up what you expected — if the
count looks wrong, head to [Libraries](libraries.md) and check the folder
detection.

### Currently listening

A cross-user feed of listening activity. Each row shows:

- the **username** of the listener,
- the **book title and author** they're on,
- **when they last listened** (as a relative time like "2h ago"),
- a **progress bar** with a percentage — or "done" once the book is finished.

The feed reflects saved listening progress, so it updates as people listen
(players report progress periodically while playing).

:::note
The console holds no special powers of its own — every action it performs is
checked by the server against your admin account. That's also why nothing
breaks if a non-admin somehow opens the page: the server refuses every
privileged request.
:::

## Where to next

- [Libraries](libraries.md) — point the server at your audiobook folders.
- [Users and invites](users-and-invites.md) — create accounts and get people
  connected.
- [Sharing](sharing.md) — control which folders each person can see.
