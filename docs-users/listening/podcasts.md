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

Your server checks the shows people follow by itself. To look now, tap **Check for new episodes** on the show's page. When the check is done, the line beside the button says how many new episodes it found, or **No new episodes**. Before you check, that line says when your server last checked the show.

## Adding shows {/* #adding-shows */}

You can add shows yourself in three ways: search a podcast directory, paste a feed's address, or import a list from another podcast app.

1. Open a podcast library's **Shows**.
2. Tap **Add shows**.
3. Choose **Search**, **Feed address** or **Import a list**.

A show the library already has is followed at once. A new show takes a moment while your server fetches it. Until then it's listed under **Shows being added**, by its name when the directory or your list gave one, and by its address otherwise. If it couldn't be added, the list says why.

To clear a show that couldn't be added, or one that was cancelled, tap the **X** beside it.

You need full access to the library to add shows. Kids accounts and the demo can't add or follow shows. If **Add shows** is missing, your server can't fetch podcasts right now. Ask your admin.

Offline, **Search**, **Follow** and **Choose a file** wait until you reconnect. If the player can't check whether you can add shows, it says so. Tap **Retry** once you're online.

### Search a podcast directory {/* #searching-a-podcast-directory */}

![Add shows on Search: results for "kitchen" from Apple Podcasts](/img/screenshots/web-player/find-shows-search.png)

1. Type a show's name and tap **Search**.
2. Tap **Follow** on the show you want.

A show you already follow says **Following** in the results. Tap **Open show** to go to it.

Results come from **Apple Podcasts**, or from **Podcast Index** if your admin set it up. The directory sees only the words you searched and your server's address, not yours.

Offline, or when a search can't be refreshed, its last results stay on screen with a line that says so. If the refresh failed, tap **Search again**.

![Add shows after a refresh of "kitchen" failed: the last results line, the directory's error and Search again above the one result](/img/screenshots/web-player/find-shows-last-results.png)

![Add shows on a phone: the search results](/img/screenshots/web-player/phone-find-shows.png)

### Follow a feed by its address {/* #following-a-feed-by-its-address */}

![Add shows on Feed address: an address typed in, Private feed on, and the shows being added](/img/screenshots/web-player/find-shows-address.png)

Every podcast has a feed address, usually ending in `.xml` or `/rss`. Find it on the show's website or in your podcast app.

1. Open **Feed address**.
2. Paste the address. It must start with `http://` or `https://`.
3. For a paid or members-only feed, turn on **Private feed**.
4. Tap **Follow**.

If the library already has the show, the page says you follow it and offers **Open show**. Otherwise it says **Adding the show** until your server has fetched it. Then it says you follow the show, why it couldn't be added, or that adding it was cancelled.

### Import a list from another app {/* #importing-a-list-from-another-app */}

![Add shows on Import a list: an import part way through](/img/screenshots/web-player/find-shows-import.png)

1. In your other podcast app, export your subscriptions as an **OPML** file. Look for *Export subscriptions* or *Export OPML* in its settings.
2. In AudioSilo, open **Import a list** and tap **Choose a file**.
3. Pick the file. It can be up to 1 MB.
4. Keep the page open while it works.

Each show is listed by its name from your list, when the list gives one. Your server adds five new shows at a time, so a long list goes in batches. The player sends each batch by itself. If you leave the page, choose the same file again to carry on. Shows already added are skipped.

A long batch can take your server a few minutes. If it doesn't answer in time, the page says your server may still be adding the shows. Look in **Shows** in a few minutes, or tap **Try again**.

If your server can't add shows for now, the rest of the list says **Can't be added right now**. Tap **Try again** later to carry on.

If you went offline while picking the file, choose it again once you reconnect. **Stop** works offline.

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

![The full player showing how much of The wren on the gatepost the server has fetched](/img/screenshots/web-player/episode-fetching.png)

**Getting this episode** shows how much the server has downloaded. **Cancel** stops waiting. The server keeps downloading, so the episode is ready next time.

If the server can't get the episode, the player says why and offers **Try again**. Each person can have five episodes downloading at once. One that is waiting for your admin to fix something doesn't count. If it says the server can't fetch episodes now, ask your admin.

![The player explaining that the episode is too large for the server, with Try again and Cancel](/img/screenshots/web-player/episode-fetch-retry.png)

**Try again** asks the server to fetch the episode again. If your server can't read the show's folder, the player offers no **Try again**. See [Troubleshooting](../troubleshooting.md#a-podcast-episode-wont-start).

### When an episode ends

An episode leaves Up next when it ends. With **auto-play** on, the next item in [Up next](up-next.md) plays; otherwise playback stops. An episode never plays on into the show's next episode by itself.

To hear a show's episodes in a row, add them to Up next. While an episode plays, Up next suggests the show's **Next episode**.

## Download an episode {/* #download-an-episode */}

A downloaded episode plays with no connection to your server, like a [downloaded book](offline-downloads.md). This works in the iOS and Android apps and in the web player.

1. Open the episode's page, or the **...** menu on its row.
2. Tap **Download for offline**. When it's done, the line under the episode reads **On this device**.

An episode that isn't on your server yet is fetched there first, then downloads to your device. Meanwhile the download reads **Getting it on your server**. Keep the app open on screen until it moves on. If you download several, a few are fetched at a time and the rest wait their turn.

Downloaded episodes are listed under **Podcast episodes** on the [Downloads page](offline-downloads.md#the-downloads-page). To free the space, choose **Remove download**. A finished episode's download is removed by itself, unless you turned off **Remove a download when you finish the book**.

To download every episode you start, turn on **Download podcast episodes when you start them** in [Settings](settings.md#up-next-and-downloads). It's off unless you turn it on. It follows the same network rule as books, so **Automatic downloads** must be **On Wi-Fi** or **Always** too. The web player starts at **Never**.

## Private feeds

A private feed is a show only its followers can see, such as a paid feed. Its address works like a password. A **Private feed** badge marks it.

Nobody else sees a private show, admins included. So a library can look empty to you while other people have shows in it. Private feeds are never exported.

If the Bridge loses a private feed's address, the server can't check the show any more. The show's page asks you to follow it again. [Follow the feed by its address](#following-a-feed-by-its-address) with **Private feed** on, and the checks start again. The page asks only when you can [add shows](#adding-shows) right now. Otherwise it says **Last check failed**.

## Good to know

- **Podcasts turned off.** While an admin has podcasts turned off on your server, its podcast library doesn't appear in the Library picker.
- **No casting.** The Cast button doesn't appear while an episode plays.
- **Not on a watch.** Episodes can't be sent to an Apple Watch or a Wear OS watch.
- **No podcasts in kids mode.** See [Set up kids mode for a child](kids-mode.md).
- **Changed audio.** If a show replaces an episode's audio after you start it, your place stays where it was, so you may land a little early or late.
- **Gone from the feed.** An episode that left the show's feed stays listed while its file is still on the server.
