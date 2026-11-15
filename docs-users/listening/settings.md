---
title: Change app settings
description: "Every player setting in one place: playback, the sleep timer, up next and downloads, appearance and high contrast, language and your servers. Also how the player works with large text and screen readers."
---

**Settings** holds every preference the player has. On a tablet or computer, tap the **gear** at the right of the top bar. On a phone, open the **Me** tab and choose **Settings**.

Settings are **kept per device**, so your phone and your computer can differ. Only your servers are shared.

![Settings on a computer: the groups down the left, and the Playback section beside them](/img/screenshots/web-player/settings.png)

![Settings on a phone, in the Me tab](/img/screenshots/web-player/phone-settings.png)

## Playback

| Setting | What it does | Range |
|---|---|---|
| **Skip back** | How far the back button jumps | 5-120 s (default 15 s) |
| **Skip forward** | How far the forward button jumps | 5-120 s (default 30 s) |
| **Default speed** | Starting speed for new books. Each book then remembers its own | 0.5x-2x |
| **Auto-rewind on resume** | How far playback backs up after a pause | Off-30 s (default 5 s) |
| **Chapter length (unchaptered)** | Chapter size for long books with no chapters | 5-60 min (default 30 min) |
| **Smart speed** | Shortens silences ([where it works](full-player.md#smart-speed-and-voice-boost)) | Off by default |
| **Voice boost** | Evens out quiet and loud voices | Off by default |

## Sleep

Have AudioSilo start a [sleep timer](sleep-timer.md) for you at night.

| Setting | What it does | Default |
|---|---|---|
| **Auto sleep timer** | Start a timer for playback that begins between **From** and **Until** | Off |
| **From** / **Until** | The nightly window | 10:00 PM to 6:00 AM |
| **Timer type** | End of chapter, or 15, 30, 45 or 60 minutes | End of chapter |
| **Shake to extend** | Shake the phone to keep a timer going ([how](sleep-timer.md#shake-to-extend)). Apps only | On |
| **Shake sensitivity** | How hard the shake must be | Medium |

See [Starting a timer automatically at night](sleep-timer.md#starting-a-timer-automatically-at-night).

## Up next and downloads

What happens when a book ends (see [The end of a book](end-of-book.md)), and what AudioSilo downloads for you. The download settings also appear on the Downloads page.

| Setting | What it does | Default |
|---|---|---|
| **Automatically play next book** | When a book finishes, start [what plays next](end-of-book.md#what-plays-next) | Off |
| **Automatic downloads** | Download the book you start, so it's ready offline. **Never**, **On Wi-Fi** or **Always** | On Wi-Fi in the apps, Never in the web player |
| **Download podcast episodes when you start them** | Download the [episode](podcasts.md#download-an-episode) you start too, under the same network rule as books (so only while **Automatic downloads** isn't **Never**) | Off |
| **Keep the next books ready** | Download the next 1, 2 or 3 books from Up next and the series. See [Keep the next books ready](offline-downloads.md#keep-the-next-books-ready) | Off |
| **Remove a download when you finish the book** | Free up space when a book is marked finished | On |

A browser can't tell Wi-Fi from mobile data, so in the web player **On Wi-Fi** downloads on any connection. You can always download a book by hand. See [Listen offline](offline-downloads.md).

## Appearance

Choose **Light**, **Dark**, or **System** to follow your device. On a tablet or computer, the profile menu also has a quick light/dark switch.

**High contrast** makes text, borders and status colours stronger, in Light and in Dark. See [High contrast](#high-contrast).

![Settings on a computer with Appearance open: Light, Dark and System, and High contrast (On or Off) below them](/img/screenshots/web-player/settings-appearance.png)

## Language

Choose English, Español, Français, Deutsch, Português or Italiano, or **System** to follow your device.

## Household

**Household** opens the [Household page](household.md): the people on this device, the people you've added, and Listening in the house.

## Accounts and devices

The servers you're signed in to on this device. Tap one to open your [account on that server](account.md).

- **Add a server** connects another. Home and search then combine them. The web player can't do this. See [Connect the app to your server](connecting.md).
- The bin button removes a server from this device.

:::warning
Removing a server **deletes the books you downloaded from it on this device**, and any progress that hasn't synced yet. The app asks first. Nothing on the server is touched.
:::

## Support AudioSilo

On the web and Android, **Support AudioSilo** links to GitHub Sponsors.

## Accessibility

The player follows your device's text size, contrast setting and screen reader. The only accessibility setting in the app is **High contrast**, under Appearance.

### Text size

Set the text size on your device:

- **iPhone and iPad**: Settings > Accessibility > Display & Text Size > Larger Text.
- **Android**: the font size in Android's display or accessibility settings.
- **Web player**: your browser's font size setting.

With large text, the layout changes shape to make room for the words:

- A setting's name moves above its control instead of beside it.
- Most labels wrap onto more lines instead of ending in "...".
- In the full player, the play, skip and chapter buttons and the scrubber grow with the text, up to one and a half times their size. On a narrow screen they grow only as far as they fit.

The ebook reader keeps its own text size. Change it with the reader's **−** and **+** buttons (see [Read the ebook](reading-the-ebook.md)).

### High contrast

High contrast turns on when your device asks for more contrast, even with the app's setting **Off** (the setting tells you so):

- **iPhone and iPad**: Settings > Accessibility > Display & Text Size > Increase Contrast.
- **Android**: **High contrast text** in Android's accessibility settings (**Outline text** on Android 16).
- **Web player**: your browser's more-contrast preference. On a Mac, browsers follow **Increase contrast** in System Settings > Accessibility > Display.

To turn it on for AudioSilo only, open **Settings > Appearance** and set **High contrast** to **On**.

With high contrast on:

- Text, borders and field outlines get darker in Light and lighter in Dark. Grey secondary text changes the most.
- Pink text and status colours, such as warnings and errors, get stronger.
- Progress bars and sliders get an outline, so their full length shows.

The layout stays the same, and Light, Dark and System work as before.

To turn off the high contrast your device asks for, change the setting on your device.

### Screen readers

The player works with VoiceOver on iPhone and iPad, TalkBack on Android, and screen readers in a browser.

- Buttons have spoken names, including the ones that show only an icon.
- Page and section titles are read as headings.
- The full player's scrubber is a slider. Adjust it (swipe up or down with VoiceOver, or press the arrow keys on the web) to skip forward or back by your **Skip forward** and **Skip back** lengths.
- While a sheet is open, such as speed, sleep timer or chapters, the screen reader stays inside it. Close it with VoiceOver's escape gesture (a two-finger scrub), the back gesture on Android, or **Escape** on the web.
- With VoiceOver or TalkBack on, a message at the bottom of the screen stays three times as long, and one with a button stays until you close it. On the web, a message stays while you point at it or move focus to it.

## The app's version

Settings shows the app's version, such as *AudioSilo v2.6.0*. Mention it if you report a problem (see [Troubleshooting](../troubleshooting.md)). A server's version is on your [account page](account.md).
