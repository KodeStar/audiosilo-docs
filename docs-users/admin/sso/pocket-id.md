---
title: "Sign in with Pocket ID"
description: "Add AudioSilo as an OIDC client in Pocket ID, the passkey sign-in provider, and connect your server to it."
---

These steps add AudioSilo to Pocket ID, so people can
[sign in with single sign-on](../single-sign-on.md) with their passkey. You
need an admin account in Pocket ID and in AudioSilo. Labels may differ a little
between Pocket ID versions.

## Add the client

1. In Pocket ID's admin settings, open the OIDC clients and add one.
2. Name it `AudioSilo`.
3. Add a callback URL: your server's public address followed by
   `/api/v1/auth/oidc/callback`, such as
   `https://books.example.com/api/v1/auth/oidc/callback`.
4. Save, and note the **client ID** and the **client secret**. Pocket ID shows
   the secret only once.

You can mark the client as **public** instead, if you'd rather not keep a
secret. Then leave AudioSilo's client secret out: it signs in with PKCE alone,
which it always uses.

## Connect AudioSilo

The issuer is Pocket ID's own address, such as `https://id.example.com`:

```yaml
    environment:
      AUDIOSILO_OIDC_ENABLED: "true"
      AUDIOSILO_OIDC_NAME: "Pocket ID"
      AUDIOSILO_OIDC_ISSUER: "https://id.example.com"
      AUDIOSILO_OIDC_CLIENT_ID: "the client ID"
      AUDIOSILO_OIDC_CLIENT_SECRET: "the client secret"
```

Restart the server and check **Server > Settings > Sign-in**, as in
[Turn it on](../single-sign-on.md#turn-it-on).

## Good to know

- **Groups.** Pocket ID has user groups. To make admins from one, set **Admin
  group** in AudioSilo to its name, and check that Pocket ID sends the person's
  groups in a claim called `groups`.
- **Allowed people.** Pocket ID can limit a client to some user groups. The
  people it lets through still need an account in AudioSilo, made by
  **Make accounts for new people** or by you.
- **Verified emails.** Only an email the provider marks as verified links
  someone to their AudioSilo account by itself. Anyone else waits for you to
  link them.
