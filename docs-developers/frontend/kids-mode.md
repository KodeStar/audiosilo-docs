---
title: Kids mode
description: "Kids mode (Phase 8, with kid household members since 8b-1): a property of a profile. Kids mode by default for a kid's account, the /kids route and its guard, connect/_layout as the one gate between kids mode and the connect flow, the stories it shows (kidsShelfMode: the owner's shared collections, else one library), a kid signed out, the kids player at 1×, the Grown-ups hold, the car, and bedtime through listenerSettings."
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
grown-up's profile that a kid's sign-in joined is never put in kids mode. A kid's first
sign-in then goes straight to `/kids` (`finishConnect` dismisses to `KIDS_PATH` whenever
the person listening is in kids mode afterwards): never "Your library is ready.". On a
server without household members, `member_kind` is absent and nothing changes. `KidsLibraryPicker` offers the libraries the profile's
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
  included) and `/connect`, which keeps kids mode out itself (below); the tabs, the full
  player, the end credits, the year story and any deep link into them go back. It uses
  `dismissTo('/kids')`, so a `/kids` already in the root stack is popped back to
  rather than stacked twice.
- On Android the back button does nothing on `/kids` while the shell sits under it;
  with nothing under it, it leaves the app as usual.
- **The connect flow's gate is `src/app/connect/_layout.tsx`, the only one** (8b-1,
  D1). While a kids profile listens it runs **none** of the flow (no step mounts, so a
  pairing link's token is never exchanged and no server is reconnected or forgotten)
  and `dismissTo`s `/kids` once the root navigator is ready. When kids mode was already
  on as the flow opened (a link: `audiosilo://connect?token=`, a QR scanned elsewhere,
  `/web/connect`), a toast says "Ask a grown-up to open this link" ("A grown-up holds
  Grown-ups first, then opens the link again."); kids mode turning on during the flow
  is a kid's own first sign-in, which `finishConnect` has already sent to `/kids`, so no
  toast. Nothing of the flow runs until both the session and the profiles have been
  read (before that, kids mode can't be told and a token would be spent on a kids
  device). The one exception is `kidsConnectAllowed()`: "Add someone" opened by a
  grown-up from Who's listening? on a device with **no** grown-up (`openAddSomeone`
  sets the intent, `endConnectFlow` clears it when the flow unmounts).
- **Nobody new signs in from kids mode** while a grown-up is on the device
  (`mayAddPerson`, `src/components/profiles/connect-intent.ts`): `finishConnect` and
  `addMemberHere` refuse ("Choose a grown-up before adding someone."), and Who's
  listening? disables **Add someone** with that hint, so a child can't leave kids mode
  through a new profile; they choose the grown-up first, PIN and all. With no grown-up
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
- **Which one** is `kidsShelfMode(user, hasCollections, collections)`: `collections`
  when the owner shares at least one, `library` for an account nobody manages, a
  server without `collections` or a member with none shared, and `unknown` while a
  member's answers are still out. The Household page reads the same through
  `useKidsSharedShelf(profile)` and hides the kids **Library** row unless the shelf is
  one library (also while the kid is signed out or the collections can't be read).
  When an owner switches a member to `all`, the player sends `collection_ids: []`
  (`collectionIdsFor`), so the shares stop and the kid's shelf is one library again.
- **The library** (`kidsLibrary`), for everyone else (an account nobody manages, a
  Phase 8 account the admin limited, an older server, a member with no shared
  collection): the pick when it is on that connection and still listed by `GET
  /libraries`, else the first library listed, else none (the account sees no
  library: an empty state says to ask a grown-up).
- **The shelf** (`kidsShelf`) from one library: the books in progress, most recently
  played first, then every other book of the library in the server's order, finished
  ones included.
- **Offline** (`kidsDownloads`): when the server can't be reached, the finished
  downloads of that connection, newest first, in the library `kidsOfflineScope(mode,
  library, connectionId, kids)` names: for a one-library shelf the one shown when known,
  else (`GET /libraries` unreadable) the profile's pick on this connection, else every
  library, so the grown-ups' downloads of another library on the same account don't
  show; for a shelf of collections (or one not known yet) every library, since the
  collections can span libraries and the server already limits the account.

The whole page is **one virtualised list** (`KidsStoriesList`, a FlashList with the
greeting, the bedtime card and the player as its header), paging through the library
as it scrolls. Loading, empty, error and offline states each have their own words.

**A kid signed out** (their connection's `needsReconnect`: a revoked session, a deleted
account, a server reset) never gets the shell's reconnect banner, whose sign-in opens
the connect flow. With stories still to show, `SignedOutNotice` puts a plain line over
them, "Ask a grown-up to sign Leo in again." (`askToSignIn`; "...to sign you in again"
without a name); with none, the list's `signed-out` state says "Signed out of
&lt;server&gt;" with the same line and no Try again. A story that won't start says it too.
The grown-up signs the kid in again from the Household page's **Sign in again**
(`SignInAgainRow`: for the owner's own member, `memberSession` then `renewMemberHere`,
which only swaps the token, keeping the connection id, profile, PIN and kids settings;
anyone else, or after a server reset, the connect flow's reconnect). `ApiProvider` then
reads the connection's failed queries and its `server`, `libraries` and `collections`
lists again once its token changes (`useReadAgainOnSignIn`, `readAgainOnSignIn`), so the
shelf recovers without a reload. A tile starts its story with
`startBookInPlace` on every layout (kids mode never opens the full player; the story
already loaded only resumes), and the list scrolls back up to the player
(`scrollToOffset`).

**`KidsPlayer`** replaces the full player: cover, title, chapter and minutes left, a
simple progress line through the chapter (no scrubbing; the view's one pink thing), and
four big controls, previous chapter, back 30 s (`KIDS_BACK_SECONDS`), play/pause and
next chapter. No speed, sleep, bookmarks, Up next or sharing. A story starts at 1× unless it
has a speed saved for the kid: the default speed comes from `listenerSettings()`, which
gives a kids profile `defaultRate: 1` (the device's default speed is a grown-up's
setting, and kids mode has no control to undo it). It is laid out by the
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
"Your stories", trimmed to `CAR_TAB_LIMITS.library` (50) with each story once before
any cover is fetched (a shelf of shared collections can hold far more), and **Continue
listening** the shelf's stories in progress (any story on the shelf, not only the first
50); no Up next and no Downloads tab, nothing else the account could reach. It is rebuilt when kids
mode turns on or off. See
[Native integrations](native-integrations.md#the-car-snapshot-srccar).

## Bedtime and speed (`src/playback/listener-settings.ts`)

`listenerSettings()` is the one read of the playback settings **of whoever listens**
(pure `listenerSettingsFor(kids, settings)`): the default speed and the auto sleep rule.
The playback store (`playBook`), the car's native start specs and the auto sleep
controller (`src/playback/auto-sleep-controller.ts`) all read it; a screen showing the
default speed uses `useListenerDefaultRate()`.

- **Speed**: 1× for a kids profile, else the device's default speed.
- `isBedtime(bedtime, now)`: from the profile's bedtime until `KIDS_BEDTIME_UNTIL`
  (06:00) local time, across midnight.
- The auto sleep rule for a kids profile is its bedtime, always on, and
  `decideAutoSleep` applies it as it does the setting, with the same session anti-nag
  memory: inside the window, every story that starts or resumes arms a duration timer
  of `KIDS_BEDTIME_MINUTES` (20) with the normal fade, unless a timer on that book was
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

`kids-model.test.ts` (the rules above, the collections shelf and `kidsShelfMode`
included), `use-kids.test.tsx`, `kids-screen.test.tsx`, `kids-player.test.tsx`,
`grown-ups-button.test.tsx`, `kids-route-guard.test.tsx` and `kids-gate.test.tsx` in
`src/components/kids/`; the connect gate in `src/components/connect/connect-layout.test.tsx`;
`src/playback/listener-settings.test.ts` (1× and the bedtime rule) and the bedtime
regression tests in `src/playback/auto-sleep-controller.test.ts`; the read-again on a new
token in `src/api/provider.test.tsx`; the car's trimmed shelf in `src/car/car-model.test.ts`. That a tapped story starts in place and
never opens the full player is in `kids-screen.test.tsx`.
