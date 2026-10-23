---
title: Podcasts
description: "Listening to podcasts in the player: shows in the Library, a show's page and its episode order, following a show, New episodes on Home, playing an episode the server hasn't downloaded yet, private feeds, kids, and what episodes don't do yet."
---

When your server has a podcast library, the player shows its podcasts beside your books: the
shows in the Library, each show's episodes, a **New episodes** shelf on Home for the shows you
follow, and episodes that play like any book. Podcasts need the **AudioSilo app 2.2.0 or later**
(the web player comes with your server and is updated with it). An older app doesn't
show podcasts at all; update it from the App Store or Google Play.

Your admin sets podcasts up on the server: see [Podcasts](../admin/podcasts.md) in the admin
guide. Adding a new show, searching podcast directories and importing a list from another podcast
app aren't in the player yet; your admin can add shows for you.

## Shows in the Library

Pick a podcast library in the Library's **Library** picker (a podcast library has a microphone
beside its name). A podcast library has two sections, **Shows** and **Folders**; the book
sections (Books, Authors, Series, Narrators, Collections) belong to book libraries.

![The Library's Shows section: the All and Following filters and a grid of show covers](/img/screenshots/web-player/library-shows.png)

**Shows** is a grid of every show you can see in that library, in title order. Under each cover
is the show's title, then **New episode** with how long ago it came out when the show has had
one in the last 14 days, else who makes the show. A
**Private feed** badge marks a [private show](#private-feeds). The chips at the top switch
between **All** shows and the ones you're **Following**, with a count on each.

A library with no shows says **No shows yet**: shows appear once someone follows them on your
server. Tap a show to open its page.

## A show's page

![A show's page: its cover, title, the Following badge and the episodes, newest first](/img/screenshots/web-player/podcast-show.png)

The top of the page has the show's cover, title and maker, its description (**Show more**
opens the rest), how many episodes it has, the **Private feed** badge when it is one, and the
[Follow button](#following-a-show). **Last check failed** means the server couldn't read the
show's feed the last time it looked; the episodes it already has still play.

**Episode order.** A show that is told in order (a serial) lists its **oldest episode first**, so
you start at the beginning; every other show lists its **newest first**. Switch with **Newest
first** / **Oldest first** at the top of the list. The list keeps loading as you scroll.

Each episode row has:

- the **title**, then the date it came out, its length, and its season and episode number
  (**S2 E5**, or just **E5**);
- a **Trailer**, **Bonus** or **Explicit** badge when the show marks it so;
- a progress bar once you've started it, or **Finished**;
- where its audio is: **Ready on your server**, **Plays on demand** (the server downloads it
  when you play it, see [below](#playing-an-episode)), **Getting it** with how far it has got,
  **Couldn't get it**, or **Not available now**. The last two add a line saying why, such as
  *"Your server can't download episodes right now."* (the same reasons as the
  [table below](#playing-an-episode));
- one button: **Play** (or **Resume** once you've started), or **Try again** after the server
  couldn't get it. While an episode isn't available, **Play** is greyed out;
- a **...** menu with **Add to Up next** and **Mark as finished**.

Tap the row itself to open the episode's own page: its cover, title, the show (tap it to go back
to the show), date, length and badges, the play button, its description and, when the episode
file has them, its chapters (**Chapters from the episode file**). When the episode can't be
played right now, the reason sits beside the greyed-out button. An episode page has no Who's who
or Story so far: those are for books.

An episode that has left the show's feed stays listed while its file is still on the server,
marked **No longer in the feed**. Once the file is gone, the episode isn't listed any more.

![A show's page on a phone](/img/screenshots/web-player/phone-podcast-show.png)

## Following a show

**Follow** on a show's page adds it to the shows you follow; press it again (it reads
**Following**) to unfollow. Following a show is what puts its new episodes on your
[Home](#new-episodes-on-home) and tells the server to keep its episodes coming. Everyone who
follows a show shares the same downloaded episodes.

The button is there only when your server can fetch podcasts right now: the admin has turned
podcasts on and the server can download episodes. Otherwise a show you follow just shows a
**Following** badge, and you can still play everything that's there. Kids' accounts and the demo
can't follow shows.

Unfollowing a [private feed](#private-feeds) asks first: the show disappears from your Library,
and you'd need the feed's address to follow it again.

## New episodes on Home

![Home's New episodes shelf: recent episodes from the shows you follow](/img/screenshots/web-player/home-new-episodes.png)

**New episodes**, under **Next in your series** on Home, gathers recent episodes from the shows
you follow: ones that came out in the last 14 days, newest first, with the show's name and how
long ago under each. It leaves out trailers, episodes gone from the feed, and any episode you've
already started (those are in **Continue listening**) or finished. **All shows** opens the
Library's Shows. If you follow nothing, or nothing new came out, the shelf isn't shown.

Podcasts stay off your book shelves: episodes never appear in **Next in your series**, **Recently
finished**, the smart shelves, **Recently added**, book search or the author and series pages. An
episode you're listening to does lead Home like a book: in the card for what you're on (*"40%
through the episode"*), in **Continue listening**, and in **Favourites** if you add it there.

## Playing an episode

An episode marked **Ready on your server** plays at once, like a book, and the player keeps your
place in it the same way.

An episode marked **Plays on demand** isn't on your server yet. Press **Play** and the server
downloads it first: the player shows **Getting this episode** with the episode's cover and *"Your
server is downloading it. It starts as soon as it's ready."*; once the download is under way that
line shows how much has arrived (*"12 MB of 40 MB"*, or *"12 MB so far"* while the full size
isn't known). **Waiting for its turn** in its place means it is queued behind other downloads.
When the episode is ready it starts by itself. In the player, how far you are reads *"40% of the
episode"*.

![The full player while the server gets an episode: Getting this episode, with the download's progress](/img/screenshots/web-player/episode-fetching.png)

- With the full player closed, a compact strip shows the same progress: above the player bar on
  a computer (or a wide tablet), and in the mini player on a phone.
  **Whatever you were listening to keeps playing** until the episode is ready; then the episode
  takes over.
- If the server can't get it, the strip shows the reason in place of the progress.
- **Cancel** stops waiting in the player. The server keeps downloading, so the episode will be
  **Ready on your server** next time.
- Playing something else while you wait also stops waiting for it.
- Leave the app and come back: it checks again straight away.

If the server can't get the episode, the player says why, with **Try again**:

| Message | What it means |
|---|---|
| **Couldn't get this episode** | The download failed (the show's host didn't answer, for instance). **Try again** asks the server to download it again. |
| **This episode can't be fetched now** | The server can't download episodes right now, and the line under it says which: *"Podcasts are turned off on this server."*, *"Your server can't download episodes right now."* (the part of your server that downloads them is offline, or the server is too old to fetch episodes on demand), or *"Your server can't save episodes to this library."* Ask your admin. |
| **Five episodes are already on their way. Try again once one is ready.** | Each person can have at most five episodes downloading at once. Wait for one to finish. |
| **This episode is too large for your server to keep.** | The file is over the server's size limit. |
| **This episode changed in its feed. Open the show to find it again.** | The show replaced the episode; open the show's page for the new one. |
| **The demo can only play episodes already on the server.** | The demo account plays only episodes marked Ready. |

The player never asks the server again on its own after a failure: only **Try again** does.

### When the audio changes

Some shows replace an episode's audio after it comes out (to change the ads, say). When that
happens to an episode you've started, its page says **The audio changed**: *"This episode's audio
changed since you started (ads can differ). Your place is kept as it was."* Your place, bookmarks
and finished mark stay exactly where they were, so you may land a little early or late.

### When an episode ends

An episode never opens the [end credits](end-of-book.md). It leaves your Up next, and with
**auto-play** on (and the sleep timer not running) the next item in [Up next](up-next.md)
starts; otherwise playback stops. An episode never plays on into a series or folder.

## Private feeds

Some shows are members-only: their feed address works like a password. A **Private feed** badge
marks them. Only the people who follow a private show can see it, admins included, so a library
can look empty to you while other people have shows in it.

## Kids

Kids mode doesn't show podcasts at all: no podcast libraries, and no episodes, even ones in a
collection you share with a child. A kid's account can't follow shows. See
[Kids mode](kids-mode.md).

## Not for episodes yet

- **Offline downloads.** Episodes can't be downloaded to your device, and automatic downloads and
  keeping the next books ready skip them. They stream from your server.
- **Casting.** The Cast button doesn't appear while an episode plays.
- **Finding new shows.** Following a new feed by its address, searching podcast directories and
  importing or exporting a list of shows aren't in the player yet.
