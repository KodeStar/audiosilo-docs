---
title: Kids mode
description: "Kids mode (Phase 8): a property of a profile. The /kids route and its guard, which library and stories it shows, the kids player, the Grown-ups hold, and bedtime through the auto sleep controller."
---

Kids mode is a **property of a [profile](profiles.md)** (`Profile.kids`), set by an
adult on the device in Settings > Household and sharing. The child's account is an
ordinary server user whose library access the admin limited: the server's scopes
(`GET /libraries`) are the truth, and the player never shows a child more than the
account may open. There is no server change. The user-facing page is
[Kids mode](/users/listening/kids-mode).

```ts
kids?: { library?: { connectionId: string; libraryId: number }; bedtime: string /* 'HH:MM', default '19:30' */ }
```

`setProfileKids(profileId, kids | undefined)` turns it on (an invalid bedtime reads as
`DEFAULT_BEDTIME`) or off. `KidsLibraryPicker` offers the libraries the profile's
connections list, named with their server when the profile has several; no pick means
the first one listed.

## The route and its guard

Kids mode is the root route `/kids` (`src/app/kids.tsx`, no swipe-back), outside the
tabs. A kids profile never gets the shell:

- **`AuthGate`** renders none of the shell for a kids profile (no tabs, search,
  settings, downloads page or web command palette) and holds the screen until it has
  moved.
- **`KidsRouteGuard`**, mounted once by the root layout so it covers the root routes
  too, sends a kids profile to `/kids` from anywhere it may not be. `kidsAllowsPath`
  allows only `/kids`, `/profiles` (leaving kids mode goes through it, PIN rules
  included) and `/connect` ("Add someone" on the picker); the tabs, the full player,
  the end credits, the year story and any deep link into them go back. It uses
  `dismissTo('/kids')`, so a `/kids` already in the root stack is popped back to
  rather than stacked twice.
- On Android the back button does nothing on `/kids` while the shell sits under it;
  with nothing under it, it leaves the app as usual.

## What it shows (`src/components/kids/`)

`KidsScreen`: "Hi &lt;name&gt;" and the Grown-ups button, the bedtime card (`MoonCard`), the
story playing now in `KidsPlayer`, and the stories as big cover tiles. Strings are in
the `kids` namespace.

The rules are pure in `kids-model.ts`, read through `useKidsStories()`:

- **The connection** (`kidsConnectionId`): the picked library's connection while the
  profile still holds it, else the profile's first.
- **The library** (`kidsLibrary`): the pick when it is on that connection and still
  listed by `GET /libraries`, else the first library listed, else none (the account
  sees no library: an empty state says to ask a grown-up).
- **The shelf** (`kidsShelf`): the books in progress, most recently played first, then
  every other book of the library in the server's order, finished ones included.
- **Offline** (`kidsDownloads`): when the server can't be reached, the finished
  downloads of that connection (in that library when known), newest first.

Loading, empty, error and offline states each have their own words. A tile starts its
story through `usePlayBook`, which plays in place here on every layout (`navFor` counts
`/kids` as a player on top), and the page scrolls back up to the player.

**`KidsPlayer`** replaces the full player: cover, title, chapter and minutes left, a
simple progress line through the chapter (no scrubbing; the view's one pink thing), and
four big controls, previous chapter, back 30 s (`KIDS_BACK_SECONDS`), play/pause and
next chapter. No speed, sleep, bookmarks, Up next or sharing. It is laid out by the
measured width (`kidsPlayerLayout`): the cover beside the controls where both fit at
the big sizes, the big controls under the cover where only they do, else the phone's
sizes, never under the 64 pt kids minimum.

**`GrownUpsButton`**: press and hold for `HOLD_MS` (2 s) to leave; a fill grows while
it is held and letting go early empties it. With reduced motion there is no fill, the
label says "Keep holding", and it still takes the full 2 s (the timer decides, not the
animation). A screen reader gets the hint "Hold to leave kids mode" and the long-press
action. Holding opens Who's listening?, where the chosen profile's PIN is asked.

## Bedtime (`src/playback/auto-sleep-controller.ts`)

Bedtime reuses the auto sleep controller, made profile-aware:

- `isBedtime(bedtime, now)`: from the profile's bedtime until `KIDS_BEDTIME_UNTIL`
  (06:00) local time, across midnight.
- `decideBedtime(...)`: inside the window, every story that starts or resumes arms a
  duration timer of `KIDS_BEDTIME_MINUTES` (20) with the normal fade, unless a timer on
  that book was cancelled this session (the same anti-nag rule as the setting's).
- While a kids profile is active, its bedtime rule **replaces** the device-wide auto
  sleep setting (a grown-up's "end of chapter from 22:00" is not a child's bedtime), and
  it is always on; the setting is untouched for everyone else. Switching to or from a
  kids profile, or toggling kids mode, changes which rule applies.
- Never in a car (`isCarConnected`), like the nightly timer.

`MoonCard` shows "Bedtime is at 19:30" and what it does; inside the window, "It's
bedtime" and either that the timer comes on when a story starts or the minutes the
running timer has left.

## Testing

`kids-model.test.ts` (the rules above), `use-kids.test.tsx`, `kids-screen.test.tsx`,
`kids-player.test.tsx`, `grown-ups-button.test.tsx`, `kids-route-guard.test.tsx` and
`kids-gate.test.tsx` in `src/components/kids/`; the bedtime rule's regression tests in
`src/playback/auto-sleep-controller.test.ts`; `src/components/player/play-route.test.ts`
for `/kids` as a player on top.
