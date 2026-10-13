---
title: Kids mode
description: "Kids mode (Phase 8, with kid household members since 8b-1): a property of a profile. Kids mode by default for a kid's account, the /kids route and its guard, the stories it shows (the owner's shared collections, else one library), the kids player, the Grown-ups hold, the car, and bedtime through the auto sleep controller."
---

Kids mode is a **property of a [profile](profiles.md)** (`Profile.kids`), set by an
adult on the device on the [Household page](profiles.md#the-household-page). It is
client-side: the server has no notion of it. The child's account is either a **kid
household member** (Phase 8b-1: `user.member_kind === 'kid'`, made by an owner from
the player, its access decided by the server's member rule; see
[Household members](/developers/server/api/reference#household-members)) or an ordinary
account whose library access the admin limited (Phase 8). Either way the server's
scopes are the truth, and the player never shows a child more than the account may
open; turning kids mode off on a device never widens anyone's access. The user-facing
page is [Kids mode](/users/listening/kids-mode).

```ts
kids?: { library?: { connectionId: string; libraryId: number }; bedtime: string /* 'HH:MM', default '19:30' */ }
```

`setProfileKids(profileId, kids | undefined)` turns it on (an invalid bedtime reads as
`DEFAULT_BEDTIME`) or off. Turning it on is refused when it would leave no grown-up on
the device (`mayTurnOnKids`, which the Household page also reads to disable the
switch): leaving kids mode is a grown-up's job. **The one exception** is a profile
whose every connection the server says is a kid's (`isKidsAccount`: each connection's
`user.member_kind === 'kid'`): it may be in kids mode with no grown-up on the device
(a kid's own phone, paired from the owner's QR), since the server already limits that
account and there is no grown-up to leave kids mode for.

**On by default for a kid's account.** `addMemberHere` turns kids mode on for a kid it
signs in beside the owner, and `finishConnect` does the same at a kid account's
**first** placement on a device (`kidsOnForKidAccount`: a new connection, not a
re-pair or a sign-in after a server reset, whose profile has no kids settings yet and
holds only kid accounts), which covers the kid's own device signing in from its QR. A
grown-up's profile that a kid's sign-in joined is never put in kids mode. On a server
without household members, `member_kind` is absent and nothing changes. `KidsLibraryPicker` offers the libraries the profile's
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
  included) and `/connect` (the child's own sign-in renewed, or "Add someone" when it is
  allowed, below); the tabs, the full player,
  the end credits, the year story and any deep link into them go back. It uses
  `dismissTo('/kids')`, so a `/kids` already in the root stack is popped back to
  rather than stacked twice.
- On Android the back button does nothing on `/kids` while the shell sits under it;
  with nothing under it, it leaves the app as usual.
- **Nobody new signs in from kids mode** while a grown-up is on the device
  (`mayAddPerson`, `src/components/profiles/connect-intent.ts`): `finishConnect` refuses
  "Add someone", a new server and the demo ("Choose a grown-up before adding someone."),
  and Who's listening? disables **Add someone** with that hint, so a child can't leave
  kids mode through a new profile; they choose the grown-up first, PIN and all. A
  re-pair of a connection the device has (the child's own sign-in renewed, through the
  reconnect banner on the kids screen) keeps its person and is allowed. With no grown-up
  left, Add someone stays open, the only way out. Nothing is added while the profiles
  couldn't be read.

## What it shows (`src/components/kids/`)

`KidsScreen`: "Hi &lt;name&gt;" and the Grown-ups button, the bedtime card (`MoonCard`), the
story playing now in `KidsPlayer`, and the stories as big cover tiles. Strings are in
the `kids` namespace.

The rules are pure in `kids-model.ts`, read through `useKidsStories()`:

- **The connection** (`kidsConnectionId`): the picked library's connection while the
  profile still holds it, else the profile's first.
- **The collections** (`kidsCollections`, Phase 8b-1): for an account with
  `user.managed_by` (a household member), the collections `GET /me/collections` lists
  as shared with it (`!owned`) whose `owner.id` is `managed_by.id`, in the order the
  list gives them (the owner's). When there is at least one, they **are** the shelf:
  `kidsCollectionSections` reads each one's `GET /me/collections/{id}` and gives one
  section per collection with stories (titled with the collection's name when there
  are several, untitled when one), each in `kidsOrder` (stories in progress first,
  most recently played first, then the rest in the collection's order, a book listed
  twice shown once). Collections with no story yet are left out; with none left the
  shelf says "Ask a grown-up to add stories." The client can't see `member_access` (it
  isn't on `/me`), so an `all` member whose owner also shares collections with them
  sees those collections; one with none sees the one-library view.
- **The library** (`kidsLibrary`), for everyone else (an account nobody manages, a
  Phase 8 account the admin limited, an older server, a member with no shared
  collection): the pick when it is on that connection and still listed by `GET
  /libraries`, else the first library listed, else none (the account sees no
  library: an empty state says to ask a grown-up).
- **The shelf** (`kidsShelf`) from one library: the books in progress, most recently
  played first, then every other book of the library in the server's order, finished
  ones included.
- **Offline** (`kidsDownloads`): when the server can't be reached, the finished
  downloads of that connection, newest first, in the library `kidsOfflineLibraryId`
  names: the one shown when known, else (`GET /libraries` unreadable) the profile's pick
  on this connection, else every library, so the grown-ups' downloads of another library
  on the same account don't show.

The whole page is **one virtualised list** (`KidsStoriesList`, a FlashList with the
greeting, the [reconnect banner](connect-and-addresses.md), the bedtime card and the
player as its header), paging through the library as it scrolls. Loading, empty, error
and offline states each have their own words. A tile starts its story with
`startBookInPlace` on every layout (kids mode never opens the full player; the story
already loaded only resumes), and the list scrolls back up to the player
(`scrollToOffset`).

**`KidsPlayer`** replaces the full player: cover, title, chapter and minutes left, a
simple progress line through the chapter (no scrubbing; the view's one pink thing), and
four big controls, previous chapter, back 30 s (`KIDS_BACK_SECONDS`), play/pause and
next chapter. No speed, sleep, bookmarks, Up next or sharing. It is laid out by the
measured width (`kidsPlayerLayout`): the cover beside the controls where both fit at
the big sizes, the big controls under the cover where only they do, else the phone's
sizes, never under the 64 pt kids minimum.

**`GrownUpsButton`**: press and hold for `HOLD_MS` (2 s) to leave; while it is held the
label says "Keep holding" and a fill grows, and letting go early empties it. With
reduced motion there is no fill, and it still takes the full 2 s (the timer decides,
not the animation). A screen reader gets the hint "Hold to leave kids mode" and the long-press
action. Holding opens Who's listening?, where the chosen profile's PIN is asked.

## In the car

A kids profile's CarPlay and Android Auto snapshot is the kids shelf only
(`kidsCarBooks` in `src/car/car-model.ts`, built by `car-controller.ts` without React
from the same reads as `useKidsStories`: the owner's shared collections, else the one
library, else the account's downloads): the **Library** tab holds the shelf, titled
"Your stories", and **Continue listening** the shelf's stories in progress; no Up next
and no Downloads tab, nothing else the account could reach. It is rebuilt when kids
mode turns on or off. See
[Native integrations](native-integrations.md#the-car-snapshot-srccar).

## Bedtime (`src/playback/auto-sleep-controller.ts`)

Bedtime reuses the auto sleep controller, made profile-aware:

- `isBedtime(bedtime, now)`: from the profile's bedtime until `KIDS_BEDTIME_UNTIL`
  (06:00) local time, across midnight.
- `effectiveAutoSleepConfig()` gives the rule that applies now, and `decideAutoSleep`
  applies it as it does the setting, with the same session anti-nag memory: inside the
  window, every story that starts or resumes arms a duration timer of
  `KIDS_BEDTIME_MINUTES` (20) with the normal fade, unless a timer on that book was
  cancelled this session.
- While a kids profile is active, its bedtime rule **replaces** the device-wide auto
  sleep setting (a grown-up's "end of chapter from 22:00" is not a child's bedtime), and
  it is always on; the setting is untouched for everyone else. Switching to or from a
  kids profile, or toggling kids mode, changes which rule applies.
- Never in a car (`isCarConnected`), like the nightly timer.

`MoonCard` shows "Bedtime is at 7:30 PM" (`formatTimeOfDay`, in the UI language's
clock: "19:30" in the languages other than English) and what it does; inside the window, "It's
bedtime" and either that the timer comes on when a story starts or the minutes the
running timer has left.

## Testing

`kids-model.test.ts` (the rules above, the collections shelf included), `use-kids.test.tsx`, `kids-screen.test.tsx`,
`kids-player.test.tsx`, `grown-ups-button.test.tsx`, `kids-route-guard.test.tsx` and
`kids-gate.test.tsx` in `src/components/kids/`; the bedtime rule's regression tests in
`src/playback/auto-sleep-controller.test.ts`. That a tapped story starts in place and
never opens the full player is in `kids-screen.test.tsx`.
