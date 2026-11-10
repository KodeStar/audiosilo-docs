---
title: Create API keys
description: "Create a personal API key so a dashboard, script or monitoring tool can reach your AudioSilo server for you."
---

An **API key** is a secret token that lets another app reach your server as you, without your password. Use one for a home dashboard such as Heimdall, a script, or an uptime monitor. Create keys on your [account page](account.md#opening-it), under **Personal API keys**.

A key can browse your libraries, read your books and save your progress. It can't manage your account: it can't make keys, set your password, manage your [household members](household.md#household-members) or start casting.

Demo accounts and [kids' accounts](account.md#a-kids-account) can't have keys.

## Creating a key

1. Open your [account page](account.md#opening-it) for the server.
2. Under **Personal API keys**, tap **Create API key**.
3. Give the key a name, such as *Home dashboard*, and tap **Create API key** again.
4. Copy the key straight away and paste it into the app you're setting up.

:::warning[Shown once - copy it now]
The key is shown only when you create it. If you lose it, revoke it and make a new one. Treat a key like a password: anyone who has it can use your account.
:::

## Using a key

Send the key as a **Bearer** token in the `Authorization` header. For example, to list your libraries with `curl`:

```sh
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://books.example.com/api/v1/libraries
```

Replace `YOUR_API_KEY` with your key, and `books.example.com` with your server's address.

## Revoking a key

Each key in the list shows when it was created and last used. To switch one off, tap **Revoke** and confirm. Anything using it loses access at once.

## Pick the right account

A key can reach everything your account can. A key made by an **admin** can also reach admin information, such as the list of users.

For a simple widget, make the key from a regular account with just the access it needs. Then a leaked key can't touch admin features. Your admin can set one up: see [Invite people](../admin/users-and-invites.md).
