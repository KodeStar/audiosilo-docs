---
slug: /
title: What is AudioSilo?
description: "AudioSilo is a self-hosted audiobook server and a player app for web, iOS and Android."
---

AudioSilo plays your own audiobooks from a server you run at home. You install the
server, point it at your audiobook folder, and listen in a browser or in the app
on your phone. There is no subscription, and your files are never changed.

![The AudioSilo web player home screen](/img/screenshots/web-player/home.png)

## Get started

1. Install the server with [Docker](getting-started/quickstart-docker.md), on
   [Unraid](getting-started/install-unraid.md), on a
   [Synology NAS](getting-started/install-synology.md), or
   [without Docker](getting-started/install-binary.md).
2. [Set up your server](getting-started/first-run.md): create your admin account
   and add your audiobook folder.
3. [Get the apps](listening/mobile-apps.md) and
   [connect them to your server](listening/connecting.md).

Want to look first? [Try the demo](demo.md) without installing anything.

## Find what you need

- [Everything AudioSilo can do](features.md), one line each.
- [Which audio formats work](getting-started/organizing-your-library.md#supported-formats), and how to lay out your folders.
- [Listen offline](listening/offline-downloads.md) by downloading books to your device.
- [Reach your server from outside your home](getting-started/remote-access.md).
- [Invite people](admin/users-and-invites.md) or [add your household](listening/household.md).
- [Move over from Audiobookshelf](getting-started/coming-from-audiobookshelf.md).
- Listen on your [Apple Watch](listening/apple-watch.md) or [Wear OS watch](listening/wear-os.md), [in the car](listening/in-the-car.md) or [on a Chromecast](listening/chromecast.md).
- [Read the ebook](listening/reading-the-ebook.md) and [follow along with the narration](admin/making-read-along.md).
- [Back up your server](admin/backups.md), and update it ([Docker](getting-started/quickstart-docker.md#update), [Unraid](getting-started/install-unraid.md#update), [without Docker](getting-started/install-binary.md#update)).
- [Troubleshooting](troubleshooting.md) and the [FAQ](faq.md).

## The Bridge: optional extras

The server is all you need to listen. The optional
[Bridge](getting-started/running-a-bridge.md) is a second container that adds
[podcasts](admin/podcasts.md), [read-along](admin/making-read-along.md),
[characters and recaps](admin/generating-characters-and-recaps.md) and
[Audible backups](admin/audible.md).
