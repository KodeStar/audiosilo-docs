---
title: Remote access
description: "Listening away from home: TLS modes (self-signed, Let's Encrypt, reverse proxy), ports and firewalls, and why AudioSilo is safe to expose to the internet."
---

## Remote access

AudioSilo is designed from the ground up to be reachable from outside your house - that's the point of self-hosting audiobooks. This page covers the three ways to serve HTTPS, the networking basics, and what the server does to keep an internet-facing setup safe.

All of these are settings in `config.yaml` in the server's data directory (edit and restart), and most can also be set with an environment variable - handy under Docker.

### The default: self-signed HTTPS

Out of the box the server generates its own certificate and serves HTTPS on port 8080:

```yaml
tls:
  mode: "selfsigned"
```

Because no public authority issued that certificate, every browser shows a "connection is not private" warning the first time - that's expected, not a sign something is broken. Accept the warning and the connection is encrypted normally. This mode is fine on a home network.

:::note
One practical limit of a self-signed certificate: "install to home screen" for the web player needs a connection the browser fully trusts (or `localhost`). Streaming in a browser tab works fine; for the installable app experience away from `localhost`, use one of the two options below - or the native [mobile apps](../listening/mobile-apps.md).
:::

### A real certificate with autocert (Let's Encrypt)

If you have a domain name pointing at your server, the server can obtain and renew a free, browser-trusted certificate for it automatically:

```yaml
bind: "0.0.0.0:443"
tls:
  mode: "autocert"
  hosts: ["books.example.com"]
```

(The same settings are available as `AUDIOSILO_TLS_MODE` and `AUDIOSILO_TLS_HOSTS`.)

For issuance to work, Let's Encrypt must be able to reach your server on **port 443** of that hostname. Either bind directly to 443 as above, or keep the default port and forward external 443 to it in your router/firewall. If autocert is configured but the server itself isn't bound to 443, it logs a clear warning at startup - it can't see your router, so the warning appears even when forwarding is set up correctly. Certificates are cached in `certs/` inside the data directory, so renewals are automatic and restarts are instant.

### Behind a reverse proxy

Already running Caddy, nginx or Traefik with HTTPS for other services? Let the proxy terminate TLS and run AudioSilo as plain HTTP behind it:

```yaml
tls:
  mode: "off"
trusted_proxies: ["127.0.0.1/32"]
```

Point the proxy at `http://<server>:8080` as an ordinary HTTP upstream - AudioSilo needs no special proxy rules beyond passing requests through (including the standard `X-Forwarded-For` header, which most proxies send by default).

`trusted_proxies` matters: list the address(es) your proxy connects from (as CIDR ranges, e.g. `["127.0.0.1/32", "10.0.0.0/8"]`). It tells AudioSilo to believe the proxy's `X-Forwarded-For` header, so rate limiting and lockouts apply to the real visitor's address instead of seeing every request as coming from the proxy.

:::warning
Only use `tls.mode: "off"` behind a proxy that terminates HTTPS. Plain HTTP exposed directly to the internet sends passwords and audio unencrypted.
:::

### Ports and firewalls

- The server listens on **port 8080** by default; change it with the `bind` setting (`AUDIOSILO_BIND`), e.g. `bind: "0.0.0.0:8443"`.
- To reach it from outside, forward one TCP port on your router to the server (external 443 → internal 8080 is a common choice with autocert), and allow it through the machine's firewall.
- Everything travels over that single port - API, admin console, web player and audio streaming. There is nothing else to open.

### Tell the server its public address

Set `public_url` (`AUDIOSILO_PUBLIC_URL`) to the address your users reach the server at:

```yaml
public_url: "https://books.example.com"
```

It's used when building QR codes and invite links, so the links you copy from the admin console point at your public address rather than an internal one.

### Why it's safe to expose

Being internet-facing for non-experts is the server's first design priority, and the protections are always on - there is nothing to remember to enable:

- **No default passwords.** The admin credential is randomly generated on first run (or chosen by you in the setup wizard); there is no factory password to forget to change.
- **Invite-only accounts.** Nobody can sign themselves up. Accounts are created by the admin, and devices join via short-lived invite codes (by default good for 5 uses and one day). See [Users and invites](../admin/users-and-invites.md).
- **Rate limiting and lockout.** Requests are rate-limited per visitor address, and repeated failed logins or invite-code guesses trigger a brute-force lockout.
- **Secrets are stored scrambled.** Passwords use modern, deliberately slow hashing (argon2id); sign-in tokens and invite codes are stored only as hashes, and every token can be revoked.
- **Contained file access.** Streaming requests are strictly confined to your library folders - path-traversal tricks to read other files are rejected - and request sizes are capped.

### Settings you can leave alone

Two `config.yaml` entries look security-related but aren't part of a normal setup:

- **`cors_origins`** only matters if a *separately hosted* website needs to call your server from a browser - in practice, developers running the player from a dev server. The apps and the built-in web player work with it empty. Leave it as `[]`.
- **`app_links`** lets an invite QR code open the installed mobile app *directly*, without a chooser - but it only works for a domain that a shipped app build explicitly claims, so it isn't useful for a personal domain with the store apps. Leave it empty; invites still work everywhere via the web player and the "Open in app" button.
