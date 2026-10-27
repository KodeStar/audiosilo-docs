---
title: Remote access
description: "Listening away from home: TLS modes (self-signed, Let's Encrypt, reverse proxy), plain HTTP for the phone apps at home, ports and firewalls, and why AudioSilo is safe to expose to the internet."
---

## Remote access

AudioSilo is designed from the ground up to be reachable from outside your house - that's the point of self-hosting audiobooks. This page covers the three ways to serve HTTPS, the networking basics, and what the server does to keep an internet-facing setup safe.

All of these are settings in `config.yaml` in the server's data directory (edit and restart), and most can also be set with an environment variable - handy under Docker. Once the server runs, you can also change them in the admin console under [Server > Settings](../admin/server.md#settings): the HTTPS mode, plain HTTP at home, certificate names and listen address on **Network & HTTPS** (they take effect at the next restart), the public address on **General** (at once). An environment variable wins over both, so a setting one sets shows as locked in the console.

### The default: self-signed HTTPS

Out of the box the server generates its own certificate and serves HTTPS on port 8080:

```yaml
tls:
  mode: "selfsigned"
```

Because no public authority issued that certificate, every browser shows a "connection is not private" warning the first time - that's expected, not a sign something is broken. Accept the warning and the connection is encrypted normally. This mode is fine on a home network.

:::note
One practical limit of a self-signed certificate: "install to home screen" for the web player needs a connection the browser fully trusts (or `localhost`). Streaming in a browser tab works fine; for the installable app experience away from `localhost`, use one of the two options below. The native [mobile apps](../listening/mobile-apps.md) can't use a self-signed certificate either: at home they connect over plain HTTP instead, as the next section explains.
:::

#### Plain HTTP at home (how the phone apps connect)

A browser lets you click through the certificate warning; the iPhone and Android apps can't, so they can't connect over a self-signed certificate at all. That's why, in this mode, the server's port also answers **plain HTTP**, but only to devices on your home network: a connection from a private address (like `192.168.1.30` or `10.0.0.12`), a link-local one, or the server's own machine. Any other device that tries plain HTTP is sent to HTTPS.

You don't have to set anything up on the server. Connect the app while your phone is on the same Wi-Fi as the server: scan the pairing QR code or open an invite link, and the app signs in over `http://` on the same address and port, remembering it as the server's [home address](#tell-the-server-its-home-address). To type the address instead, put `http://` in front of it, like `http://192.168.1.20:8080` (without it, the app tries `https://`, which it can't trust here).

**Away from home** the apps still need a certificate they trust: use [autocert](#a-real-certificate-with-autocert-lets-encrypt) or a [reverse proxy](#behind-a-reverse-proxy), and set the [public address](#tell-the-server-its-public-address). The apps then switch between the two by themselves.

To turn plain HTTP off, set `tls.home_http: false` (`AUDIOSILO_TLS_HOME_HTTP=false`, or switch off **Plain HTTP at home** under the console's Server > Settings > Network & HTTPS; it takes effect at the next restart). The phone apps then can't connect to a self-signed server.

:::caution[What plain HTTP at home means]
- Plain HTTP isn't encrypted: anyone on your home network who can watch its traffic could see sign-ins and what you listen to. That is the usual trade-off on a trusted home Wi-Fi; on a shared or untrusted network, turn it off and use a trusted certificate instead.
- The server treats a connection as "at home" when it comes from a home-network address and uses the server's home address (its LAN IP, or a name like `nas.local`). Visitors from the internet use your public name or address, so they are always sent to `https://`, even through setups (Docker Desktop, rootless Docker, some routers) that make every connection look like it comes from inside your network.
- Plain HTTP at home is off when you give the server your own certificate (`tls.cert_file`): if your devices trust that certificate, they keep using `https://`.
:::

:::note[Casting needs a certificate the Cast device trusts]
To [cast](../listening/chromecast.md), your server's address must work for the Cast device, which can't click through a certificate warning. The default self-signed certificate won't work. Use HTTPS with a trusted certificate (one of the two options below), or, from the iPhone and Android apps, plain HTTP on your home network as the [home address](#tell-the-server-its-home-address) (the default self-signed setup offers it [by itself](#plain-http-at-home-how-the-phone-apps-connect)): behind a [reverse proxy](#behind-a-reverse-proxy), that's AudioSilo's own port (for example `http://192.168.1.20:8080`), not the proxy's. The web player casts only from an HTTPS page, so it needs the trusted certificate.
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

For a complete Docker Compose walkthrough with screenshots, choose the proxy you use:

- [Set up AudioSilo with Caddy](https://audiosilo.app/blog/audiosilo-with-caddy/).
- [Set up AudioSilo with SWAG](https://audiosilo.app/blog/audiosilo-with-swag/).
- [Set up AudioSilo with Traefik](https://audiosilo.app/blog/audiosilo-with-traefik/).

Each guide includes downloadable configuration files, setting up HTTPS, adding your library, pairing a phone, and troubleshooting. The examples use a dedicated Docker network with a known proxy address, so you can copy the trusted-proxy setting without finding your network's address range.

Already running Caddy, nginx or Traefik with HTTPS for other services? Let the proxy terminate TLS and run AudioSilo as plain HTTP behind it:

```yaml
tls:
  mode: "off"
trusted_proxies: ["127.0.0.1/32"]
```

Point the proxy at `http://<server>:8080` as an ordinary HTTP upstream - AudioSilo needs no special proxy rules beyond passing requests through (including the standard `X-Forwarded-For` header, which most proxies send by default).

`trusted_proxies` matters: list the address(es) your proxy connects from (as CIDR ranges, e.g. `["127.0.0.1/32", "10.0.0.0/8"]`; the console's **Trusted proxies** field also takes a plain address and saves it as a `/32` range). It tells AudioSilo to believe the proxy's `X-Forwarded-For` header, so rate limiting and lockouts apply to the real visitor's address instead of seeing every request as coming from the proxy. Without it, one device retrying with an old sign-in can lock out everyone behind the proxy for a while (see [Everyone gets "Too many tries" at once](../troubleshooting.md#everyone-gets-too-many-tries-at-once)).

:::warning
Only use `tls.mode: "off"` behind a proxy that terminates HTTPS. Plain HTTP exposed directly to the internet sends passwords and audio unencrypted.
:::

### Ports and firewalls

- The server listens on **port 8080** by default; change it with the `bind` setting (`AUDIOSILO_BIND`, or **Listen address** in the console), e.g. `bind: "0.0.0.0:8443"`.
- To reach it from outside, forward one TCP port on your router to the server (external 443 → internal 8080 is a common choice with autocert), and allow it through the machine's firewall.
- Everything travels over that single port - API, admin console, web player and audio streaming. There is nothing else to open.

### Tell the server its public address

Set `public_url` (`AUDIOSILO_PUBLIC_URL`, or **Public address** under the console's Server > Settings > General) to the address your users reach the server at:

```yaml
public_url: "https://books.example.com"
```

It's used when building QR codes and invite links, so the links you copy from the admin console point at your public address rather than an internal one.

### Tell the server its home address

Inside your home, the apps can talk to the server directly over your own network, which is quicker than going out to the internet and back. Set `lan_url` (`AUDIOSILO_LAN_URL`, or **Home address** under the console's Server > Settings > General) to the address the server has on your home network:

```yaml
lan_url: "http://192.168.1.20:8080"
```

The apps learn it with the public address when they connect (and from the server each time they start), use it whenever they can reach it, and switch to the public address when you leave home - see [At home and away](../listening/connecting.md#at-home-and-away). It applies the moment you save it.

You can often leave it empty. The server then offers the address a device connected with when that address is a home-network one: a private IP address such as `192.168.1.20` or `10.0.0.5`, or a local name such as `nas.local`, `nas.internal` or `audiosilo`. An IPv6 address is written in square brackets. With the default self-signed certificate and [plain HTTP at home](#plain-http-at-home-how-the-phone-apps-connect) on, that address is offered as `http://`, even to a device that connected over `https://`, on the same port. A home address you set is offered exactly as you wrote it. A device that connected through the public address learns no home address that way, so set it when you want every device to switch.

:::note[Behind a reverse proxy]
A request that reaches AudioSilo through a reverse proxy never gives the server a home address to offer, because the address it sees is the proxy's own internal one. The apps keep using the public address and just never switch to your home network. Set `lan_url` to the server's home address to fix it.
:::

### Why it's safe to expose

Being internet-facing for non-experts is the server's first design priority, and the protections are always on - there is nothing to remember to enable:

- **No default passwords.** The admin credential is randomly generated on first run (or chosen by you on the one-time `--setup` page); there is no factory password to forget to change.
- **No sign-ups.** Nobody can sign themselves up. Accounts are created by the admin, and devices join via short-lived invite codes (by default good for 5 uses and one day). See [People and invites](../admin/users-and-invites.md). Someone who already has an account can also add the kids and grown-ups they live with as [household members](../listening/household.md), signed in by them and never through a public page, within limits [the admin sets](../admin/users-and-invites.md#household-members).
- **Rate limiting and lockout.** Signing in, pairing and requests without a valid sign-in are limited per visitor address. Once a device is signed in it gets a limit of its own, so people sharing one router or one reverse proxy don't slow each other down, and browsing a large library is never throttled. Repeated failed logins or invite-code guesses trigger a brute-force lockout.
- **Secrets are stored scrambled.** Passwords use modern, deliberately slow hashing (argon2id); sign-in tokens and invite codes are stored only as hashes, and every token can be revoked.
- **Contained file access.** Streaming requests are strictly confined to your library folders - path-traversal tricks to read other files are rejected - and request sizes are capped.

### Settings you can leave alone

Three `config.yaml` entries look security-related but aren't part of a normal setup:

- **`cors_origins`** only matters if a *separately hosted* website needs to call your server from a browser - in practice, developers running the player from a dev server. Once it lists that site, the site can also show covers and play audio. The apps and the built-in web player work with it empty. Leave it as `[]`.
- **`app_links`** lets an invite QR code open the installed mobile app *directly*, without a chooser - but it only works for a domain that a shipped app build explicitly claims, so it isn't useful for a personal domain with the store apps. Leave it empty; invites still work everywhere via the web player and the "Open in app" button.
- **`rate_limit`** sets how many requests a visitor address and each signed-in device may make. The defaults suit almost everyone; see the [configuration reference](/developers/server/configuration#rate-limits-rate_limit) if you ever need to change them.
