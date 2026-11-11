---
title: Kids mode
description: "Kids mode, a property of a profile: on by default for a kid's account, the kids route and its guard, the one gate between kids mode and the connect flow, the stories it shows (the owner's shared collections, else one library), a kid signed out, the kids player at normal speed, the Grown-ups hold, the car, and bedtime."
---

Kids mode is a **property of a [profile](profiles.md)** (`Profile.kids`). An adult sets
it on the device, on the [Household page](household.md). It is client-side only: the
server has no notion of it.

The child's account is one of two kinds:

- a **kid household member** (`user.member_kind === 'kid'`). An owner makes it from the
  player, and the server's member rule decides its access (see
  [Household members](../server/api/reference.md#household-members)).
- an ordinary account whose library access the admin limited.

Either way the server's scopes are the truth. The player never shows a child more than
the account may open, and turning kids mode off on a device never widens anyone's
access. The user-facing page is [Kids mode](/users/listening/kids-mode).

```ts
kids?: { library?: { connectionId: string; libraryId: number }; bedtime: string /* 'HH:MM', default '19:30' */ }
```

`setProfileKids(profileId, kids | undefined)` turns it on or off. An invalid bedtime
reads as `DEFAULT_BEDTIME`.

Turning it on is refused when it would leave no grown-up on the device (`mayTurnOnKids`,
which the Household page also reads to disable the switch). Leaving kids mode is a
grown-up's job. **The one exception** is a profile whose every connection the server
says is a kid's (`isKidsAccount`: each connection's `user.member_kind === 'kid'`). That
profile may be in kids mode with no grown-up on the device, for example a kid's own
phone paired from the owner's QR. The server already limits that account, and there is
no grown-up to leave kids mode for.

**On by default for a kid's account.** Two paths turn kids mode on:

- `addMemberHere` turns it on for a kid it signs in beside the owner.
- `finishConnect` turns it on at a kid account's **first** placement on a device
  (`kidsOnForKidAccount`). That means a new connection, not a re-pair or a sign-in after
  a server reset, whose profile has no kids settings yet and holds only kid accounts.
  This covers the kid's own device signing in from its QR.

A grown-up's profile that a kid's sign-in joined is never put in kids mode. A kid's
first sign-in then goes straight to `/kids`, never to "Your library is ready.":
`finishConnect` dismisses to `KIDS_PATH` whenever the person listening is in kids mode
afterwards. On a server without household members, `member_kind` is absent and nothing
changes.

`KidsLibraryPicker` offers the libraries the profile's connections list. When the
profile has several connections, each library is named with its server. With no pick,
the first library listed is used.

## The route and its guard

Kids mode is the root route `/kids` (`src/app/kids.tsx`, no swipe-back), outside the
tabs. A kids profile never gets the shell:

- **`AuthGate`** renders none of the shell for a kids profile (no tabs, search,
  settings, downloads page or web command palette). It holds the screen until the
  profile has moved to `/kids`.
- **`KidsRouteGuard`** sends a kids profile to `/kids` from anywhere it may not be. The
  root layout mounts it once, so it covers the root routes too. `kidsAllowsPath` allows
  only three paths:
  - `/kids`;
  - `/profiles`, because leaving kids mode goes through it, PIN rules included;
  - `/connect`, which keeps kids mode out itself (see the next item).

  The tabs, the full player, the end credits, the year story and any deep link into
  them go back to `/kids`. The guard uses `dismissTo('/kids')`, so a `/kids` already in
  the root stack is popped back to rather than stacked twice.
- On Android the back button does nothing on `/kids` while the shell sits under it.
  With nothing under it, back leaves the app as usual.
- **The connect flow's only gate is `src/app/connect/_layout.tsx`.** While a kids
  profile listens, it runs **none** of the flow and `dismissTo`s `/kids` once the root
  navigator is ready. No step mounts, so a pairing link's token is never exchanged and
  no server is reconnected or forgotten.
  - When kids mode was already on as the flow opened (from an
    `audiosilo://connect?token=` link, a QR scanned elsewhere or `/web/connect`), a
    toast says "Ask a grown-up to open this link" ("A grown-up holds Grown-ups first,
    then opens the link again.").
  - When kids mode turns on during the flow, that is a kid's own first sign-in.
    `finishConnect` has already sent it to `/kids`, so there is no toast.
  - Nothing of the flow runs until both the session and the profiles have been read.
    Before that, kids mode can't be told, and a token would be spent on a kids device.
  - The one exception is `kidsConnectAllowed()`. It covers "Add someone" opened by a
    grown-up from Who's listening? on a device with **no** grown-up. `openAddSomeone`
    sets the intent, and `endConnectFlow` clears it when the flow unmounts.
- **Nobody new signs in from kids mode** while a grown-up is on the device (`mayAddPerson`,
  `src/components/profiles/connect-intent.ts`). `finishConnect` and `addMemberHere`
  refuse ("Choose a grown-up before adding someone."), and Who's listening? disables
  **Add someone** with that hint. A child therefore can't leave kids mode through a new
  profile; they choose the grown-up first, PIN and all. With no grown-up left, Add
  someone stays open, because it is the only way out. Nothing is added while the
  profiles couldn't be read.

## What it shows (`src/components/kids/`)

`KidsScreen` shows "Hi &lt;name&gt;" and the Grown-ups button, the bedtime card
(`MoonCard`), the story playing now in `KidsPlayer`, and the stories as big cover tiles.
Strings are in the `kids` namespace.

The rules are pure functions in `kids-model.ts`, read through `useKidsStories()`.

### No podcasts

`kidsLibraries` (`src/lib/library-kind.ts`) never makes a podcast library a kids
library, in the screen or in the library picker. `kidsCollectionSections` takes the
account's libraries and leaves out a shared collection's podcast items. Collections mode
waits for the library list. When the list can't be read, it falls back to downloads or
the error, here and in the car (`car-controller.ts`).

### The connection

`kidsConnectionId` is the picked library's connection while the profile still holds it,
else the profile's first connection.

### The collections

`kidsCollections` applies to an account with `user.managed_by` (a household member). It
takes the collections `GET /me/collections` lists as shared with the account (`!owned`)
whose `owner.id` is `managed_by.id`, in the order the list gives them (the owner's
order).

When there is at least one, those collections **are** the shelf:

- `useKidsStories` reads each one's `GET /me/collections/{id}`.
- The pure `kidsCollectionSections` gives one section per collection with stories,
  titled with the collection's name.
- Each section is in `kidsOrder`: stories in progress first, most recently played
  first, then the rest in the collection's order. A book listed twice shows once.
- With one section the shelf shows no title. `useKidsStories` passes `sections` only
  when there are several.
- Collections with no story yet are left out. With none left, the shelf says "Ask a
  grown-up to add stories."

The client can't see `member_access`, because it isn't on `/me`. An `all` member whose
owner also shares collections with them therefore sees those collections. An `all`
member with none shared sees the one-library view.

### Which shelf

`kidsShelfMode(user, hasCollections, collections)` decides:

| Result | When |
|---|---|
| `collections` | the owner shares at least one collection |
| `library` | an account nobody manages, a server without `collections`, or a member with none shared |
| `unknown` | a member's answers are still out |

The Household page reads it through `useKidsSharedShelf(profile)` (`shared`, `library`
or `unknown`). It shows the kids **Library** row only for `library`: a one-library
shelf, and also while a member's shelf isn't known yet. The row goes once the shared
collections arrive. It is hidden for a shelf of collections, and while the kid is
signed out or reading the collections failed (`unknown`).

When an owner switches a member to `all`, the shares stop
([a member's card](household.md#a-members-card)), so the kid's shelf is one library
again.

### The library

`kidsLibrary` serves everyone else: an account nobody manages, an account the admin
limited, an older server, and a member with no shared collection. It picks, in order:

1. the pick, when it is on that connection and `GET /libraries` still lists it;
2. else the first library listed;
3. else none. The account sees no library, and an empty state says to ask a grown-up.

### The shelf from one library

`kidsShelf` lists the books in progress, most recently played first. Then it lists
every other book of the library in the server's order, finished ones included.

### Offline

When the server can't be reached, `kidsDownloads` shows the finished downloads of that
connection, newest first. `kidsOfflineScope(mode, library, connectionId, kids)` names
the library they come from:

- **A one-library shelf:** the library shown, when known. Else (when `GET /libraries`
  is unreadable) the profile's pick on this connection. Else every library. This keeps
  the grown-ups' downloads of another library on the same account off the shelf.
- **A shelf of collections, or one not known yet:** every library. The collections can
  span libraries, and the server already limits the account.

### The page

The Household page's kids rows for a member's profile name the owner ("The stories
Adam shares…", "Shown when Adam shares no collections") through `kidsManager(profile,
people)` (see [Naming the owner](household.md#naming-the-owner)).

The whole page is **one virtualised list** (`KidsStoriesList`, a FlashList with the
greeting, the bedtime card and the player as its header). It pages through the library
as it scrolls. Loading, empty, error and offline states each have their own words.

A tile starts its story with `startBookInPlace` on every layout. Kids mode never opens
the full player, and the story already loaded only resumes. The list then scrolls back
up to the player (`scrollToOffset`).

### A kid signed out

A kid is signed out when their connection has `needsReconnect`: a revoked session, a
deleted account or a server reset. They never get the shell's reconnect banner, whose
sign-in opens the connect flow. Instead:

- With stories still to show, `SignedOutNotice` puts a plain line over them: "Ask a
  grown-up to sign Leo in again." (`askToSignIn`; "...to sign you in again" without a
  name).
- With none, the list's `signed-out` state says "Signed out of &lt;server&gt;" with the
  same line and no Try again.
- A story that won't start says it too.

The grown-up signs the kid in again with the Household page's **Sign in again**
([Signing a member in again](household.md#signing-a-member-in-again)). The shelf
recovers without a reload.

### The kids player

**`KidsPlayer`** replaces the full player. It shows the cover, the title, the chapter
and minutes left, and a simple progress line through the chapter (no scrubbing; the
view's one pink thing). It has four big controls: previous chapter, back 30 s
(`KIDS_BACK_SECONDS`), play/pause and next chapter. It has no speed, sleep, bookmarks,
Up next or sharing.

A story starts at 1× unless it has a speed saved for the kid. The default speed comes
from `listenerSettings()`, which gives a kids profile `defaultRate: 1`. The device's
default speed is a grown-up's setting, and kids mode has no control to undo it.

`kidsPlayerLayout` lays the player out by its measured width:

- the cover beside the controls, where both fit at the big sizes;
- else the big controls under the cover, where only the controls fit;
- else the phone's sizes.

It never goes under the 64 pt kids minimum.

### The Grown-ups button

**`GrownUpsButton`** leaves kids mode on a press and hold of `HOLD_MS` (2 s). While it
is held, the label says "Keep holding" and a fill grows. Letting go early empties it.
With reduced motion there is no fill, and the hold still takes the full 2 s, because the
timer decides, not the animation. A screen reader gets the hint "Hold to leave kids
mode" and the long-press action. Holding opens Who's listening?, which asks for the
chosen profile's PIN.

## In the car

A kids profile's CarPlay and Android Auto snapshot is the kids shelf only
(`kidsCarBooks` in `src/car/car-model.ts`). It has a **Library** tab titled "Your
stories" and **Continue listening**, and nothing else the account could reach. The spec
is in [Native integrations](native-integrations.md#the-car-snapshot-srccar).

## Bedtime and speed (`src/playback/listener-settings.ts`)

`listenerSettings()` is the one read of the playback settings **of whoever listens**
(pure `listenerSettingsFor(kids, settings)`). It gives the default speed and the auto
sleep rule. Three callers read it: the playback store (`playBook`), the car's native
start specs and the auto sleep controller (`src/playback/auto-sleep-controller.ts`). A
screen showing the default speed uses `useListenerDefaultRate()`.

- **Speed**: 1× for a kids profile, else the device's default speed.
- `isBedtime(bedtime, now)` is true from the profile's bedtime until
  `KIDS_BEDTIME_UNTIL` (06:00) local time, across midnight.
- **The auto sleep rule** for a kids profile is its bedtime, always on.
  `decideAutoSleep` applies it as it does the setting, with the same session anti-nag
  memory. Inside the window, every story that starts or resumes arms a duration timer
  of `KIDS_BEDTIME_MINUTES` (20) with the normal fade, unless a timer on that book was
  cancelled this session.
- While a kids profile is active, its bedtime rule **replaces** the device-wide auto
  sleep setting, because a grown-up's "end of chapter from 22:00" is not a child's
  bedtime. The setting is untouched for everyone else. Switching to or from a kids
  profile, or toggling kids mode, changes which rule applies.
- The rule never applies in a car (`isCarConnected`), like the nightly timer.

`MoonCard` shows "Bedtime is at 7:30 PM" and what bedtime does. The time uses
`formatTimeOfDay` in the UI language's clock, so it reads "19:30" in the languages other
than English. Inside the window, the card says "It's bedtime", plus either that the
timer comes on when a story starts or the minutes the running timer has left.

## Testing

In `src/components/kids/`:

- `kids-model.test.ts`: the rules above, the collections shelf and `kidsShelfMode`
  included;
- `use-kids.test.tsx`;
- `kids-screen.test.tsx`, which also checks that a tapped story starts in place and
  never opens the full player;
- `kids-player.test.tsx`, `grown-ups-button.test.tsx`, `kids-route-guard.test.tsx` and
  `kids-gate.test.tsx`.

Elsewhere:

- the connect gate in `src/components/connect/connect-layout.test.tsx`;
- `src/playback/listener-settings.test.ts` (1× and the bedtime rule), and the bedtime
  regression tests in `src/playback/auto-sleep-controller.test.ts`;
- the read-again on a new token in `src/api/provider.test.tsx`;
- the car's trimmed shelf in `src/car/car-model.test.ts`.
