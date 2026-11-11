---
title: "Try the demo"
description: "Try AudioSilo without installing anything, with a throwaway account and a library of public-domain audiobooks."
---

## The public demo

To try AudioSilo before you install it, visit **[demo.audiosilo.app](https://demo.audiosilo.app)**. There's nothing to sign up for: a throwaway account is made for you, and you land in the web player with a library of public-domain audiobooks.

![The demo landing page: a fresh account, a QR code to continue on your phone, and a button to browse in the browser](/img/screenshots/web-player/demo.png)

To try the iOS and Android apps too, scan the **QR code** with the app. Your phone joins as the same demo user, so you can watch your place sync between the browser and the app.

## What a demo account is

Everything is the real player: browsing, search, playback, bookmarks and favourites. But demo accounts are disposable:

- You can't set a password, so a demo account can't become a permanent login.
- An account is deleted after 24 hours without use, with everything it saved.
- The demo has a cap on live accounts. If it says it's at capacity, try again later.

## Run your own demo

Any AudioSilo server can run a demo, for example for friends to try. Demo visitors get full access to one library, so point it at **public-domain audiobooks**, not your own collection.

In the admin console, use [Server > Settings > Demo mode](admin/server.md#demo-mode). Or in `config.yaml`:

```yaml
demo:
  enabled: true
  library: "Demo Library"   # the name of one of your libraries
  # max_users: 200          # cap on live demo accounts (default 200; 0 = unlimited)
  idle_ttl: "24h"           # delete demo accounts idle longer than this
```

The same settings exist as `AUDIOSILO_DEMO_ENABLED`, `AUDIOSILO_DEMO_LIBRARY`, `AUDIOSILO_DEMO_MAX_USERS` and `AUDIOSILO_DEMO_IDLE_TTL`. Turning demo mode on or off, and the idle time, apply at the next restart.

With demo mode on, the server's front page takes visitors straight to the demo.

### Fill a demo library

The server repository includes a script that downloads free [LibriVox](https://librivox.org/) recordings from the Internet Archive, already in `Author/Title/` folders with covers:

```sh
scripts/seed-librivox.sh /path/to/demo-library
```

It needs `bash`, `curl` and `python3`. `DRY_RUN=1` shows what it would download. Then [add a library](admin/libraries.md) for the folder and set it as the demo library.
