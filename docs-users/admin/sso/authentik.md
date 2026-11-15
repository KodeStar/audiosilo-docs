---
title: "Sign in with Authentik"
description: "Register AudioSilo as an OAuth2/OpenID provider and application in Authentik, and connect your server to it."
---

These steps register AudioSilo in Authentik, so people can
[sign in with single sign-on](../single-sign-on.md). You need an admin account
in Authentik and in AudioSilo. Labels differ a little between Authentik
versions.

## Create the provider and application

1. In Authentik's admin interface, open **Applications** and create an
   application with a provider. Its wizard makes both.
2. Name the application `AudioSilo`. Its **slug**, such as `audiosilo`, becomes
   part of the issuer address.
3. Choose **OAuth2/OpenID Provider** as the provider type.
4. Keep the client type **Confidential**, and note the **Client ID** and
   **Client Secret** it shows.
5. Add a **strict** redirect URI: your server's public address followed by
   `/api/v1/auth/oidc/callback`, such as
   `https://books.example.com/api/v1/auth/oidc/callback`.
6. Finish the wizard. Give the people who should use AudioSilo access to the
   application, if you limit it with policies.

## Connect AudioSilo

Open the provider's page in Authentik and copy its **OpenID Configuration
Issuer**. It looks like
`https://auth.example.com/application/o/audiosilo/`. Use it exactly as shown,
with the `/` at the end: AudioSilo compares the issuer letter for letter.

```yaml
    environment:
      AUDIOSILO_OIDC_ENABLED: "true"
      AUDIOSILO_OIDC_NAME: "Authentik"
      AUDIOSILO_OIDC_ISSUER: "https://auth.example.com/application/o/audiosilo/"
      AUDIOSILO_OIDC_CLIENT_ID: "the client ID"
      AUDIOSILO_OIDC_CLIENT_SECRET: "the client secret"
```

Restart the server and check **Server > Settings > Sign-in**, as in
[Turn it on](../single-sign-on.md#turn-it-on).

## Good to know

- **Groups.** AudioSilo reads groups from a claim called `groups`. A standard
  Authentik setup sends one in its profile scope. Use group names exactly as
  Authentik shows them to
  [make admins from a group](../single-sign-on.md#make-admins-from-a-group).
- **Verified emails.** Authentik decides whether an email is verified in its
  email scope mapping. If people wait under **Waiting sign-ins** marked **Not
  verified** although their email is right, check that mapping, or link them
  by hand. See [Who gets in](../single-sign-on.md#who-gets-in).
