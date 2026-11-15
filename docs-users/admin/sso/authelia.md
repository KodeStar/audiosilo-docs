---
title: "Sign in with Authelia"
description: "Add AudioSilo as an OpenID Connect client in Authelia's configuration, and connect your server to it."
---

These steps add AudioSilo to Authelia's OpenID Connect clients, so people can
[sign in with single sign-on](../single-sign-on.md). You need Authelia with its
OpenID Connect provider already set up, and an admin account in AudioSilo.

## Add the client

Authelia's clients live in its configuration file. Add one for AudioSilo under
`identity_providers.oidc.clients`:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: 'audiosilo'
        client_name: 'AudioSilo'
        client_secret: '$pbkdf2-sha512$...'   # the hash of the secret, not the secret
        authorization_policy: 'one_factor'
        require_pkce: true
        pkce_challenge_method: 'S256'
        redirect_uris:
          - 'https://books.example.com/api/v1/auth/oidc/callback'
        scopes:
          - 'openid'
          - 'profile'
          - 'email'
          - 'groups'
```

- Authelia stores a hash of the client secret. Its `authelia crypto hash
  generate` command makes a random secret and its hash: put the hash here and
  the secret in AudioSilo. Authelia's documentation has the exact options.
- Use your server's public address in `redirect_uris`.
- AudioSilo always uses PKCE with S256, so `require_pkce` is safe to turn on.
- Pick the `authorization_policy` your setup uses, such as `two_factor`.

Restart Authelia after the change.

## Connect AudioSilo

The issuer is Authelia's own address, such as `https://auth.example.com`:

```yaml
    environment:
      AUDIOSILO_OIDC_ENABLED: "true"
      AUDIOSILO_OIDC_NAME: "Authelia"
      AUDIOSILO_OIDC_ISSUER: "https://auth.example.com"
      AUDIOSILO_OIDC_CLIENT_ID: "audiosilo"
      AUDIOSILO_OIDC_CLIENT_SECRET: "the secret, not the hash"
```

Restart the server and check **Server > Settings > Sign-in**, as in
[Turn it on](../single-sign-on.md#turn-it-on).

## Good to know

- **Claims from userinfo.** Recent Authelia versions put the email, the
  username and the groups in the userinfo answer rather than the ID token,
  unless you set a claims policy. AudioSilo asks the userinfo endpoint for
  whatever the ID token lacks, so no claims policy is needed.
- **Admins from a group.** Authelia's groups come from its user database or
  LDAP. Set **Admin group** in AudioSilo to one of them to make its members
  admins.
- **Verified emails.** Only an email the provider marks as verified links
  someone to their AudioSilo account by itself. Anyone else waits for you to
  link them.
