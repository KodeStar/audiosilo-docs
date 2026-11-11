---
title: "Set up podcasts"
description: "Add a podcast library, turn on the Podcasts module, and control how the Bridge downloads and keeps episodes."
---

<a id="what-is-available-now"></a>

A **podcast library** lets your listeners follow shows and play their episodes in
the player. Your [Bridge](bridge.md) reads the feeds and downloads the
episodes; the server serves them. Listeners add and follow shows themselves in the
player. See [Listen to podcasts](../listening/podcasts.md).

Podcasts need an admin to set them up, a Bridge, and the **Podcasts** module.

## Set up a podcast library

1. [Add a Bridge](../getting-started/running-a-bridge.md) and pair it.
2. In **Library > Libraries**, press **Add library**.
3. Under **Kind**, choose **Podcasts**. Give it a name and a folder of its own.
4. Leave **Give everyone access** ticked so every listener can follow shows, then
   add it.
5. Mount the same folder read-write in the Bridge, and check that the library
   shows **Ready** on **Server > Settings > Bridge**.
6. Turn on **Podcasts** in **Server > Settings > Modules**. It starts off.

![Adding a podcast library](/img/screenshots/admin/library-add-podcasts.png)

A podcast library's folder can't be inside or around another library's folder. You
can't turn a books library into a podcast library later.

The Bridge creates one folder per show. Don't rename those folders by hand, because
saved episode paths include them.

A feed on your own network is blocked until you
[allow its address range](../getting-started/running-a-bridge.md#feeds-on-your-local-network)
on the Bridge.

## Downloads and retention

Each show has a **retention policy**: which episodes the Bridge downloads, and
when it deletes old ones. Everyone following a show shares its policy and its
files.

The default is **Keep 3**: the newest three episodes. An older download is
deleted **seven days after every follower has finished it**.

| Policy | Downloads | Deletes |
|---|---|---|
| **Keep N** | The newest N episodes in the feed | Older ones, after everyone finishes and the grace period ends |
| **On demand** | An episode when someone plays it, plus the next one in their queue | After everyone finishes and the grace period ends |
| **Archive** | Every episode in the feed | Never |

Retention can't be set in the console or the apps yet. For the API, see the
[developer reference](/developers/server/api/reference#podcast-storage-admin).

Downloads by policy stop while nobody follows a show. An episode is never deleted
while someone has it as a favourite, in their queue, or is playing it. Deleting
keeps the episode's listing, progress and bookmarks; only the audio goes.

### Playing an episode that isn't downloaded

When someone plays an episode that isn't downloaded, the Bridge fetches it first.
The player shows **Getting this episode** until it is ready. These fetches go ahead
of other downloads.

A saved episode still plays while the Bridge is offline or the module is off.

### Space and availability

Give the podcast folder room for downloads. Archive keeps every episode, so plan
for the whole back catalogue.

The Bridge caps each episode at **1024 MiB**. To change it, set this in the
Bridge's environment (1 to 4096) and restart it:

```yaml
AUDIOSILO_BRIDGE_PODCASTS_MAX_EPISODE_MB: "2048"
```

## Following and feed checks

Listeners follow a show from its page, or add a new one by search, feed address or
OPML file in the player. A show already in the library is followed at once; a new
feed waits for the Bridge to check it. Each person can have five follow requests
waiting at once. Kids accounts and the demo account can't follow shows.

The server has the Bridge check each followed show's feed for new episodes,
recently active shows more often than quiet ones. The console's Bridge job list
leaves these routine checks out.

Turning the Podcasts module off stops following, feed checks and downloads.
Shows and episodes already on the server stay and still play.

## Finding shows and moving subscriptions

Listeners search for shows and move subscriptions from the player's **Add shows**
page (see [Adding shows](../listening/podcasts.md#adding-shows)). The console has no
screen for this.

### Searching podcast directories

Search works once the Podcasts module is on. It searches **Apple Podcasts**. The
directory sees the search text and your server's address, never who searched.

To add **Podcast Index**, set both of these in the server's environment and
restart:

```bash
AUDIOSILO_PODCAST_INDEX_KEY=...
AUDIOSILO_PODCAST_INDEX_SECRET=...
```

To turn search off, set `AUDIOSILO_PODCAST_DISCOVERY_ENABLED=false` and restart.

### Importing and exporting OPML

OPML is the file podcast apps use to move a list of subscriptions. Importing
follows each feed in the file for the person importing. New feeds are followed
five at a time; the player carries on with the rest by itself while its import page
is open.

Exporting writes every public show a person follows into an OPML file. **Private
feeds are never exported.**

## Private feeds

A private feed address is a credential, like a password. AudioSilo recognises
common private-feed addresses by itself, and listeners can mark a feed private with
the player's **Private feed** switch.

Only people who follow a private show see it, admins included. Someone else needs
the same address to follow it. The Bridge keeps the address encrypted, so keep the
Bridge's data folder in your backups.

The downloaded audio is an ordinary file. Anyone who can read the library folder
can read it.

## Good to know

- Podcasts stay out of book search, author and series lists, and the console's
  book tools.
- An episode removed from the publisher's feed isn't downloaded again, but a saved
  copy still plays.
- After a failed download, the episode isn't tried again for a while (30 minutes at
  first).
- Episodes keep their MP3 chapter markers.
