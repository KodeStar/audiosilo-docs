---
title: Reach your server from outside your home
description: "Listen away from home: give your server a domain name and a trusted certificate, with Let's Encrypt or a reverse proxy."
---

At home, AudioSilo needs no extra setup. To listen anywhere else, your server needs an address that works from the internet, and a certificate your devices trust. There are two ways to get the certificate:

- **Let's Encrypt, built in.** The server gets and renews a free certificate itself. Simplest if nothing else runs on the machine.
- **A reverse proxy** (Caddy, SWAG, nginx, Traefik). Best if you already run one for other services.

Both need a domain name, such as `books.example.com`, pointing at your home.

## The recipe

1. **Get a domain name** and point it at your home's internet address.
2. **Forward a port** on your router to the server, and allow it through the server's firewall (see [Ports and firewalls](#ports-and-firewalls)).
3. **Turn on HTTPS** with [Let's Encrypt](#a-real-certificate-with-autocert-lets-encrypt) or a [reverse proxy](#behind-a-reverse-proxy).
4. **Set the public address** so invite links and QR codes use it (see [Tell the server its public address](#tell-the-server-its-public-address)).

You can change these settings in the admin console under [Server > Settings](../admin/server.md#settings), or in `config.yaml` in the data folder. HTTPS settings apply at the next restart. An `AUDIOSILO_*` environment variable wins over both, and the console then shows that setting as locked.

## Ports and firewalls

- The server listens on **port 8080** by default. Change it with **Listen address** in the console, or `bind` in `config.yaml`.
- Forward one TCP port on your router to the server. External 443 to internal 8080 is a common choice.
- Everything uses that one port: the API, the admin console, the web player and the audio. There is nothing else to open.

## A certificate from Let's Encrypt {/* #a-real-certificate-with-autocert-lets-encrypt */}

In the console, go to **Server > Settings > Network & HTTPS**. Set **HTTPS mode** to **Let's Encrypt** and put your domain name in **Certificate names**. Or in `config.yaml`:

```yaml
bind: "0.0.0.0:443"
tls:
  mode: "autocert"
  hosts: ["books.example.com"]
```

(Or `AUDIOSILO_TLS_MODE` and `AUDIOSILO_TLS_HOSTS`.)

Let's Encrypt must reach your server on **port 443** of that name. Either listen on 443 as above, or forward external port 443 to the server's port. If the server isn't listening on 443 itself, it logs a warning at start. It can't see your router, so you see the warning even when forwarding is right.

Certificates renew by themselves and are kept in `certs/` in the data folder.

## Behind a reverse proxy

For a full Docker Compose walkthrough with screenshots, pick your proxy:

- [Set up AudioSilo with Caddy](https://audiosilo.app/blog/audiosilo-with-caddy/)
- [Set up AudioSilo with SWAG](https://audiosilo.app/blog/audiosilo-with-swag/)
- [Set up AudioSilo with Traefik](https://audiosilo.app/blog/audiosilo-with-traefik/)

Already running a proxy with HTTPS? Let it handle HTTPS, and run AudioSilo as plain HTTP behind it:

```yaml
tls:
  mode: "off"
trusted_proxies: ["127.0.0.1/32"]
```

1. Point the proxy at `http://<server>:8080`. No special proxy rules are needed.
2. Set **Trusted proxies** (`trusted_proxies`) to the address your proxy connects from. The console also takes a plain address.

Trusted proxies matter. Without them, the server sees every visitor as the proxy, so one device retrying an old sign-in can lock everyone out for a while (see [Everyone gets "Too many tries" at once](../troubleshooting.md#everyone-gets-too-many-tries-at-once)).

:::warning
Only turn HTTPS off behind a proxy that handles HTTPS. Plain HTTP open to the internet sends passwords and audio unencrypted.
:::

### Behind a sign-in proxy

A sign-in proxy (Cloudflare Access, Authentik, Authelia and the like) turns away requests without its sign-in. In a browser you sign in to the proxy, so the web player works as it is. The iOS and Android apps can't show that sign-in page. Instead they send the headers the proxy accepts, such as a Cloudflare Access service token, with their requests to the server's `https://` address.

To connect an app through the proxy:

1. On the app's connect screen, enter the server's `https://` address.
2. Tap **Proxy headers**. Enter each header's name, such as `CF-Access-Client-Id`, and its value. **Add a header** adds another row.
3. Tap **Continue** and sign in as usual. To use a pairing QR code instead, tap **Scan a QR code** now. A QR code or link uses the headers when its address is the one you typed.

The app stores the headers as securely as your sign-in. To change them, use the **Proxy headers** card on the [account page](../listening/account.md#proxy-headers).

Good to know:

- **HTTPS only.** Proxy headers need an `https://` address, and the app doesn't add them to a plain-HTTP request. Requests to the server's other addresses, such as its home address, get none either.
- **What can't send them:** Chromecast, the Apple Watch and Wear OS apps, and calendar apps. They reach the server by themselves, so they can't get past the proxy. In a browser, covers, audio and requests to another server don't carry them. Those rely on your sign-in to the proxy in that browser.
- **Some names are the app's own**, such as `Authorization`, `Cookie`, `Host`, `Range` and `Content-Type`, and it refuses them. So a proxy that asks for basic auth (an `Authorization` header) can't sit in front of AudioSilo.
- **Another person on the same server** who signs in on this device uses the same headers.

## Tell the server its public address

Set **Public address** (under Server > Settings > General) to the address people use from outside. In `config.yaml`:

```yaml
public_url: "https://books.example.com"
```

(Or `AUDIOSILO_PUBLIC_URL`.) Invite links and QR codes then point there. It applies at once.

## Tell the server its home address

At home, the iOS and Android apps can talk to the server directly over your own network, which is quicker. Set **Home address** (under Server > Settings > General) to the server's address on your home network:

```yaml
lan_url: "http://192.168.1.20:8080"
```

(Or `AUDIOSILO_LAN_URL`.) The apps use it when they can reach it, and switch to the public address when you leave home (see [At home and away](../listening/connecting.md#at-home-and-away)).

You can often leave it empty. A device that connects through a home-network address learns it by itself. Set it when devices connect through the public address or a reverse proxy, so they still switch at home.

## Good to know

### The default: self-signed HTTPS

By default, the server makes its own certificate. Browsers warn about it the first time; accept the warning and the connection is encrypted. This is fine at home.

A self-signed certificate has limits. The web player can't be installed as an app, and the apps, a watch ([Apple Watch](../listening/apple-watch.md#a-self-signed-server) or [Wear OS](../listening/wear-os.md#a-self-signed-server)) and [Cast devices](../listening/chromecast.md) can't accept it. At home the apps use plain HTTP instead (next section). Away from home they need Let's Encrypt or a reverse proxy.

### Plain HTTP at home: how the apps connect {/* #plain-http-at-home-how-the-phone-apps-connect */}

With the self-signed certificate, the server also answers **plain HTTP**, but only to devices on your home network. The server sends any other device to HTTPS.

There's nothing to set up. Connect the app while your phone is on the same Wi-Fi as the server. Scan the pairing QR code or open an invite link. The app signs in over `http://` and remembers it as the [home address](#tell-the-server-its-home-address). To type the address instead, include `http://`, like `http://192.168.1.20:8080`.

Plain HTTP isn't encrypted, so anyone watching your home network could see sign-ins. That's the usual trade-off on a trusted home Wi-Fi. On a shared network, turn it off and use a trusted certificate. To turn it off, switch off **Plain HTTP at home** under **Server > Settings > Network & HTTPS** (or `tls.home_http: false`). The apps then can't connect to a self-signed server.

Plain HTTP at home is also off when you give the server your own certificate file (`tls.cert_file`).

To [cast](../listening/chromecast.md) from the apps without a trusted certificate, use this plain HTTP home address. Behind a reverse proxy, that's AudioSilo's own port, not the proxy's.

### Why it's safe to expose

The protections are always on; there's nothing to enable:

- **No default passwords.** The first admin password is random, or chosen by you.
- **No sign-ups.** Nobody can create their own account. Accounts come from an admin's invite, or from a person adding a member of their household. Devices join with short-lived invite codes. See [Invite people](../admin/users-and-invites.md).
- **Rate limits and lockouts.** Repeated wrong passwords or invite codes lock the sender out for a while.
- **Secrets are stored scrambled**, and every sign-in can be revoked.
- **Streaming stays inside your libraries.** The server streams nothing outside your library folders.

### Settings you can leave alone

- **`cors_origins`** only matters if a separately hosted website calls your server, like a developer's test player. Leave it as `[]`.
- **`app_links`** only works for domains a shipped app claims, so it doesn't help a personal domain. Leave it empty.
- **`rate_limit`** defaults suit almost everyone. See the [configuration reference](/developers/server/configuration#rate-limits-rate_limit) if you need to change them.
