---
title: "Sign in with Keycloak"
description: "Register AudioSilo as a client in Keycloak, with the groups client scope AudioSilo asks for, and connect your server to it."
---

These steps register AudioSilo in a Keycloak realm, so people can
[sign in with single sign-on](../single-sign-on.md). You need an admin account
in Keycloak and in AudioSilo. Labels are from recent Keycloak versions and may
differ slightly in yours.

## Create the client

1. In the Keycloak admin console, pick your realm, then open **Clients** and
   select **Create client**.
2. Leave **Client type** as **OpenID Connect** and set **Client ID** to
   `audiosilo`.
3. Turn on **Client authentication** and keep **Standard flow** ticked.
4. Under **Valid redirect URIs**, add your server's public address followed by
   `/api/v1/auth/oidc/callback`, such as
   `https://books.example.com/api/v1/auth/oidc/callback`.
5. Save, then copy the **Client secret** from the client's **Credentials**
   tab.

## Add the groups scope

AudioSilo asks for a `groups` scope by default. Keycloak refuses a sign-in that
asks for a scope it doesn't know, so add one.

1. Open **Client scopes** and select **Create client scope**.
2. Name it `groups`, keep the protocol **OpenID Connect**, and save.
3. On its **Mappers** tab, configure a new mapper and choose **Group
   Membership**.
4. Set **Token Claim Name** to `groups` and turn **Full group path** off, so the
   claim holds `audiosilo-admins`, not `/audiosilo-admins`. Keep **Add to ID
   token** and **Add to userinfo** on.
5. Open your `audiosilo` client, then its **Client scopes** tab, and add the
   `groups` scope as **Optional**.

If you don't need groups, you can instead set AudioSilo's scopes to
`openid,profile,email` (`AUDIOSILO_OIDC_SCOPES`).

## Connect AudioSilo

The issuer is your Keycloak address followed by `/realms/` and the realm's name:

```yaml
    environment:
      AUDIOSILO_OIDC_ENABLED: "true"
      AUDIOSILO_OIDC_NAME: "Keycloak"
      AUDIOSILO_OIDC_ISSUER: "https://auth.example.com/realms/home"
      AUDIOSILO_OIDC_CLIENT_ID: "audiosilo"
      AUDIOSILO_OIDC_CLIENT_SECRET: "the client secret"
```

Restart the server and check **Server > Settings > Sign-in**, as in
[Turn it on](../single-sign-on.md#turn-it-on).

## Good to know

- **Verified emails.** Keycloak marks each user's email as verified or not, with
  the **Email verified** switch on the user's page. See
  [Who gets in](../single-sign-on.md#who-gets-in).
- **Admins from a group.** Make a group such as `audiosilo-admins` and add your
  admins to it, then
  [make admins from that group](../single-sign-on.md#make-admins-from-a-group).
  Keycloak leaves the `groups` claim out for a user in no group, so leaving the
  last group removes their admin role.
