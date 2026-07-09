---
title: API keys for integrations
description: "Create a personal API key so a dashboard, script, or monitoring tool can reach your AudioSilo server on your behalf - where to find it, using it, and revoking it safely."
---

An **API key** is a long, secret token you create for yourself so another app can talk to your AudioSilo server *as you*, without handing over your password. It is the right tool when you want a home dashboard (such as Heimdall), a script, a cron job, or an uptime monitor to reach your server automatically.

Each key acts as you for everyday requests - browsing your libraries, reading your books, saving your listening progress. You can create as many as you like, name each one, and revoke any of them at any time. (The one thing a key can't do is manage your account itself - it can't create another key, set your password, or generate a recovery code. Those always need you signed in normally, so a leaked key can't lock you out or quietly multiply itself.)

## Where to find it

In the player, open **Settings** and go to your server's account area - the same place you set a password or a recovery code (see [Your account and settings](account.md)). There you'll find an **API keys** section.

:::note
The section only appears on servers new enough to support API keys, and it is hidden for **demo accounts** - a throwaway demo login can't create keys.
:::

## Creating a key

1. Give the key a **name** that reminds you what it's for, for example *Home dashboard* (up to 100 characters).
2. Tap **Create API key**.
3. The key appears **once**, in a pop-up. Copy it straight away and paste it into the app you're setting up.

:::warning Shown once - copy it now
The key is displayed only at the moment you create it. AudioSilo stores only a scrambled version and can never show it to you again. If you lose it, just revoke it and create a new one. Treat a key like a password: anyone who has it can use your account.
:::

## Using a key

Whatever tool you're configuring will ask for a token, or for an "Authorization header". Send the key as a **Bearer** token. For example, to list your libraries with `curl`:

```sh
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://books.example.com/api/v1/libraries
```

Replace `YOUR_API_KEY` with the key you copied, and `books.example.com` with your own server's address.

## Seeing when a key was last used

Each key in the list shows when you **created** it and when it was **last used** (it reads *Never used* until something authenticates with it). That's a quick way to notice a key a tool has stopped using - or one being used when it shouldn't be.

## Revoking a key

To switch a key off, tap the trash icon next to it and confirm. Anything using that key **loses access immediately**. This can't be undone - if you need it back, create a fresh one.

## A key inherits your permissions - so pick the right account

A key can reach everything your account can (bar managing the account itself, as above), and nothing more. If you are an **admin**, a key made from your account can also reach admin-only information - server statistics, the list of users - not just your own books.

If you only need a key for read-only widgets like "what am I listening to" or a library's contents, consider creating it from a **regular (non-admin) account** that has just the access it needs. That way a leaked key can't touch admin features. If you don't have such an account, ask your admin to set one up - see [Users and invites](../admin/users-and-invites.md).
