---
title: Listen to podcasts
description: "Browse, follow, add and play podcasts on your AudioSilo server, and bring your shows over from another podcast app."
---

When your server has a podcast library, its shows sit in the Library beside your books. You can follow shows, add new ones, and play episodes like any book. New episodes from the shows you follow appear on Home.

Podcasts need an admin to set up a podcast library, which needs a [Bridge](../getting-started/running-a-bridge.md). See [Podcasts](../admin/podcasts.md) in the admin guide. If your app doesn't show podcasts, [update it](mobile-apps.md).

## Shows in the Library

1. Open the **Library**.
2. In the **Library** picker, choose a podcast library. It has a microphone beside its name.
3. Open **Shows** to see every show you can see, in title order.

![The Library's Shows section: the All and Following filters and a grid of show covers](/img/screenshots/web-player/library-shows.png)

The **All** and **Following** chips switch between every show and the ones you follow. A show with an episode from the last 14 days says **New episode** under its cover.

Tap a show to open its page.

## A show's page

![A show's page: its cover, title, the Following badge and the episodes, newest first](/img/screenshots/web-player/podcast-show.png)

A show's page has its description, its episodes, and a **Follow** button.

A show told in order (a serial) lists its oldest episode first, so you start at the beginning. Other shows list the newest first. Switch with **Newest first** / **Oldest first**.

Each episode has a **Play** button (or **Resume**) and a **...** menu with **Add to Up next**, **Download for offline** and **Mark as finished**. Tap an episode to open its own page, with its description and chapters.

Under each episode, a line says where its audio is. **Ready on your server** plays at once. **Plays on demand** means the server downloads it when you press Play. **On this device** means you [downloaded it](#download-an-episode).

![A show's page on a phone](/img/screenshots/web-player/phone-podcast-show.png)

## Following a show

Tap **Follow** on a show's page. Tap it again to unfollow.

Following a show puts its new episodes on your Home and tells the server to keep fetching them. Everyone who follows a show shares the same downloaded episodes.

Your server checks the shows people follow by itself. To look now, tap **Check for new episodes** on the show's page.

## Adding shows

You can add shows yourself in three ways: search a podcast directory, paste a feed's address, or import a list from another podcast app.

1. Open a podcast library's **Shows**.
2. Tap **Add shows**.
3. Choose **Search**, **Feed address** or **Import a list**.

A show the library already has is followed at once. A new show takes a moment while your server fetches it. Until then it's listed under **Shows being added**, which says why if it couldn't be added.

You need full access to the library to add shows. Kids accounts and the demo can't add or follow shows. If **Add shows** is missing, your server can't fetch podcasts right now. Ask your admin.

### Search a podcast directory {/* #searching-a-podcast-directory */}

![Add shows on Search: results for "kitchen" from Apple Podcasts](/img/screenshots/web-player/find-shows-search.png)

1. Type a show's name and tap **Search**.
2. Tap **Follow** on the show you want.

Results come from **Apple Podcasts**, or from **Podcast Index** if your admin set it up. The directory sees only the words you searched and your server's address, not yours.

![Add shows on a phone: the search results](/img/screenshots/web-player/phone-find-shows.png)

### Follow a feed by its address {/* #following-a-feed-by-its-address */}

![Add shows on Feed address: an address typed in, Private feed on, and the shows being added](/img/screenshots/web-player/find-shows-address.png)

Every podcast has a feed address, usually ending in `.xml` or `/rss`. Find it on the show's website or in your podcast app.

1. Open **Feed address**.
2. Paste the address. It must start with `http://` or `https://`.
3. For a paid or members-only feed, turn on **Private feed**.
4. Tap **Follow**.

### Import a list from another app {/* #importing-a-list-from-another-app */}

![Add shows on Import a list: an import part way through](/img/screenshots/web-player/find-shows-import.png)

1. In your other podcast app, export your subscriptions as an **OPML** file. Look for *Export subscriptions* or *Export OPML* in its settings.
2. In AudioSilo, open **Import a list** and tap **Choose a file**.
3. Pick the file. It can be up to 1 MB.
4. Keep the page open while it works.

Your server adds five new shows at a time, so a long list goes in batches. The player sends each batch by itself. If you leave the page, choose the same file again to carry on. Shows already added are skipped.

An import can't mark a feed private. Follow that one by its address with **Private feed** on.

## Exporting your shows

1. Open a podcast library's **Shows**.
2. Open the **...** menu and tap **Export my shows**.

It saves the shows you follow on this server as an OPML file any podcast app can import. The file holds only the shows, not your progress. Private feeds are never exported.

## New episodes on Home

![Home's New episodes shelf: recent episodes from the shows you follow](/img/screenshots/web-player/home-new-episodes.png)

**New episodes** on Home shows episodes from the last 14 days from the shows you follow, newest first. It leaves out trailers and episodes you've started or finished.

Podcasts stay off your book shelves and out of book search. An episode you're listening to still shows in **Continue listening**.

## Playing an episode

Tap **Play**. An episode **Ready on your server** starts at once, and the player keeps your place like a book.

An episode that **Plays on demand** isn't on your server yet. The server downloads it first, and the player shows how far it has got. It starts by itself when it's ready. Whatever you were listening to keeps playing until then.

![The full player while the server gets an episode, with the download's progress](/img/screenshots/web-player/episode-fetching.png)

**Cancel** stops waiting. The server keeps downloading, so the episode is ready next time.

If the server can't get the episode, the player says why and offers **Try again**. Each person can have five episodes downloading at once. If it says the server can't fetch episodes now, ask your admin.

### When an episode ends

An episode leaves Up next when it ends. With **auto-play** on, the next item in [Up next](up-next.md) plays; otherwise playback stops. An episode never plays on into the show's next episode by itself.

To hear a show's episodes in a row, add them to Up next. While an episode plays, Up next suggests the show's **Next episode**.

## Download an episode

A downloaded episode plays with no connection to your server, like a [downloaded book](offline-downloads.md). This works in the iOS and Android apps and in the web player.

1. Open the episode's page, or the **...** menu on its row.
2. Tap **Download for offline**. When it's done, the line under the episode reads **On this device**.

An episode that isn't on your server yet is fetched there first, then downloads to your device. Meanwhile the download reads **Getting it on your server**. Keep the app open on screen until it moves on. If you download several, a few are fetched at a time and the rest wait their turn.

Downloaded episodes are listed under **Podcast episodes** on the [Downloads page](offline-downloads.md#the-downloads-page). To free the space, choose **Remove download**. A finished episode's download is removed by itself, unless you turned off **Remove a download when you finish the book**.

To download every episode you start, turn on **Download podcast episodes when you start them** in [Settings](settings.md#up-next-and-downloads). It follows the same network rule as books, and it's off unless you turn it on.

## Private feeds

A private feed is a show only its followers can see, such as a paid feed. Its address works like a password. A **Private feed** badge marks it.

Nobody else sees a private show, admins included. So a library can look empty to you while other people have shows in it. Private feeds are never exported.

## Good to know

- **No casting.** The Cast button doesn't appear while an episode plays.
- **Not on Apple Watch.** Episodes can't be sent to a watch.
- **No podcasts in kids mode.** See [Set up kids mode for a child](kids-mode.md).
- **Changed audio.** If a show replaces an episode's audio after you start it, your place stays where it was, so you may land a little early or late.
- **Gone from the feed.** An episode that left the show's feed stays listed while its file is still on the server.
