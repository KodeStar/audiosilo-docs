---
title: "Get notifications"
description: "Hear about new books, new releases, failed scans or backups, new sign-ins and updates, in the console's bell or on your phone, Discord or a webhook."
---

Your server can tell you when something happens: new books, a new release in a
series you hold, a failed scan or backup, a new sign-in, an update. You always
see these in the **bell** in the [admin console](console-tour.md). You can also
send them to your phone with [ntfy](https://ntfy.sh), to a Discord channel, or
to a webhook such as Home Assistant. You need to be an admin.

## The bell

![The notifications bell](/img/screenshots/admin/bell.png)

Click the bell in the top bar to see the newest events. A dot means there is
something you haven't seen. Click an event to go where you can deal with it.
**See all** opens **Server > Events**, with every event from the last 90 days.

![Server > Events, every event of the last 90 days](/img/screenshots/admin/events.png)

## Adding a destination

![Server > Settings > Notifications](/img/screenshots/admin/settings-notifications.png)

1. Open **Server > Settings > Notifications**.
2. Press **Add a destination** and choose its kind (below).
3. Give it a **Name** and tick what to **Send**. The problems are ticked for
   you.
4. Press **Add destination**.
5. Press **Send test** to check it arrives.

The kinds:

- **ntfy** - push notifications on your phone. Enter the topic's address, like
  `https://ntfy.sh/your-topic`, and subscribe to the same topic in the ntfy
  app. Anyone who knows a topic's name can read it, so pick one nobody can
  guess. If your ntfy server needs a sign-in, add its **Access token**.
- **Discord** - a message in a channel. In Discord, open the channel's
  settings, then **Integrations** > **Webhooks** > **Copy webhook URL**, and
  paste that.
- **Webhook** - AudioSilo sends a JSON message to an address you give. A local
  address is fine. Add a **Signing secret** if the receiver should check the
  messages are really from your server. The message format is in the
  [developer docs](/developers/server/backups-and-notifications#webhook).

The list shows whether each destination's last message arrived, or why it
failed. The switch turns a destination off without deleting it. To change one,
use **Edit** in its **...** menu.

## What to send

The **What to send** table has a row per event and a column per destination.
Tick a box to send that event there. It saves as you tick.

| Event | When it happens |
|---|---|
| **New books added** | A scan found new books. |
| **A scan failed** | A library couldn't be scanned. See [Health > Jobs](health.md#jobs). |
| **A library went offline** | A library's folder can't be read, such as an unmounted drive. Nothing was removed. |
| **Someone signed in** | A sign-in from a new device or browser. |
| **An invite was used** | A device was set up from an invite. |
| **An update is available** | A new AudioSilo version is out. Needs **Check for new versions** on ([General](server.md#general)). |
| **A backup failed** | A [backup](backups.md) failed, with the reason. |
| **A Bridge job finished** | The [Bridge](bridge.md) finished a job, such as [characters and recaps](generating-characters-and-recaps.md) or a [read-along](making-read-along.md). |
| **A Bridge job failed or needs attention** | A Bridge job stopped with an error, or is waiting for you. |
| **New releases in your series** | A book came out in a series you hold, and you don't have it. Needs **Check for upcoming releases** on ([Community metadata](server.md#community-metadata)). |

Every event shows in the bell whether you send it anywhere or not.

## What a message carries

Messages carry names, book titles, counts and a link into the console (when the
server has a [public address](server.md#general)). They never carry a
password, invite code, token, IP address or a folder path on the server.
Messages are in English.
