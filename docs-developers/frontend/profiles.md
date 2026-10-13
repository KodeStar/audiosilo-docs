---
title: Profiles
description: "Profiles (Phase 8): a person on this device as a group of connections. The profiles store and document, the consistency rules, visible versus background connections, switching and the play rule, Who's listening?, the device-local PIN, links to another person's book, and Settings > Household."
---

A **profile is a person on this device**: a device-local group of connections, at
most **one connection per server** (`serverIdOf`). Each connection is already one
user on one server ([Connection identity](state-and-data.md#connection-identity-server_iduser_id)),
so every person keeps their own place in every book, queue, bookmarks and stats on
the server; the profile only says which of the device's connections belong to whom,
so the screens show one person's at a time. Nothing about profiles is sent to a
server: there is no wire change.

The user-facing side is
[Sharing a device with your household](/users/listening/profiles) and
[Kids mode](/users/listening/kids-mode); kids mode's code is
[its own page](kids-mode.md).

## The store (`src/stores/profiles.ts`)

One persisted document, `audiosilo.profiles`, hydrated in `bootstrapPlayback()`:

```ts
interface Profile {
  id: string;              // local, random (a UUID); never sent anywhere
  name: string;            // defaults to a connection's username; editable here
  connectionIds: string[]; // at most one per server
  kids?: { library?: { connectionId: string; libraryId: number }; bedtime: string /* 'HH:MM' */ };
  hasPin?: boolean;        // mirrors the secure store; the hash lives there
}
interface ProfilesDoc {
  version: 1;
  profiles: Profile[];
  activeProfileId: string | null;
  askAtLaunch: boolean;    // "Ask who's listening when the app opens"
}
```

**The first document** (`initialProfiles`) is written by the
[identity migration](state-and-data.md#connection-identity-server_iduser_id), in the
same `setMany` as its re-keyed documents (an existing document is only re-keyed). It
puts every connection in one profile, except that a profile holds at most one
connection per server: a second user on a server (signed in before the migration ran)
gets a profile of their own. Each profile is named after its first connection's user
(the one holding the default connection after the default connection's user), the
profile holding the default connection is active, and `askAtLaunch` is off. When
the document is missing on an install with connections (the migration aborted, or an
install from before profiles signed in again), the store builds it from the session's
connections with the same rule.

**Reading it.** A read that **fails** is never taken as a missing document (reconciling
an empty one would replace every profile: new ids, no PIN, no kids settings). The store
tries the read up to `HYDRATE_ATTEMPTS` (5) times in all, a second apart (`hydrationFailed`
while it does), then stops holding the launch (`giveUpOnRead`), decided once the session has
settled:

- **Someone is signed in**: they may have a PIN or a kids profile this run can't know,
  so the store stays `hydrationFailed` (nothing of anyone shows or plays, nobody new
  signs in) and reads again whenever the app comes to the front.
- **Nobody is** (the web with site data blocked, where the session couldn't read its
  list either): the store runs `unread`, in memory only, and never writes over the
  stored document; whoever signs in now gets a profile of their own.

Only a document that **reads but doesn't parse** counts as missing (waiting can't fix
it) and is rebuilt from the session. A parsed document is validated
(`parseProfilesDoc`): an `activeProfileId` naming nobody reads as `null`, never as the
first person (that person may have a PIN, and nobody gave it).

Reads: `useActiveProfile()`, `useProfileConnections()` (the active profile's
connections, in session order), and the framework-free `activeProfile()`,
`profileOf(connectionId)`, `profileConnections()` and `profileConnectionIds()`.
Changes: `switchProfile`, `renameProfile`, `setProfileKids`, `setProfileHasPin`,
`setAskAtLaunch`, `deleteProfile`, `placeConnection`.

### Consistency with the session

`reconcileProfiles` keeps the document consistent with the session's connections. It
runs on every change of the session's list once the session has **settled** (never
while it is loading or its hydrate failed, when an empty list doesn't mean empty), and
on `onConnectionRemoved`:

1. Ids the session no longer has leave their profiles.
2. A profile keeps one connection per server.
3. A profile with no connections is deleted (its PIN with it).
4. An unplaced connection goes into the active profile when it has no connection to
   that server, else the first profile without one, else a profile of its own (not
   made active: nobody chose to switch).
5. When the active profile is gone and others are left, **nobody** is active
   (`mustChoose`). A second profile appearing turns `askAtLaunch` on.

A connection the connect flow just signed in is placed by `placeConnection` instead:
into the active profile, unless that profile already has a connection to this server
(another user there is another person) or the flow was **Add someone**
(`/connect?add=1&profile=new`); then into a new profile, which becomes active. A
re-pair keeps the person it had, and "Add someone" signing in as a person already on
the device switches to them.

### Visible and background connections

The rule that keeps one person's state from leaking into another's view without
breaking their background work:

- **Every list a person sees uses the active profile's connections**
  (`useProfileConnections`, `profileConnections`, and the cross-connection hooks'
  `useApis()`): Home, the Library and its picker, Search and the command palette, the
  Downloads page, Up next, You (stats, Year, Journal), Settings and the profile menu,
  [Listening in the house](listening-in-the-house.md), the car snapshot and the
  widget. Never `useSession((s) => s.connections)` for a list someone sees.
- **Background work keeps using every connection**: the offline save queue, the
  downloads engine, car bookmarks waiting to be sent, address routing, reachability. A
  switch must never make another person's queued saves unroutable (the queue flush
  drops unroutable groups).
- **While nobody is chosen** (`mustChoose`), the visible set is empty: the auth gate
  holds the shell, every person-facing list is empty, the car lists nothing, the
  widget clears, and a link to anyone's book meets the gate below. With no profiles at
  all (not hydrated yet, or nobody signed in) every connection is visible, as before
  profiles.

## Switching, and the play rule

`switchProfile(id)` (the caller has asked for the PIN):

- **The play rule**: a book that belongs to a connection outside the new profile is
  stopped (paused, its place saved by the store's normal persist, unloaded), so the
  next person finds no mini player with someone else's book. A book of the new
  person's own plays on.
- The session's default connection moves to the new profile's first unless it is
  already one of theirs.
- The car snapshot is rebuilt and the iOS widget clears; both follow
  `activeProfileId`.
- The UI then resets every tab to its root and goes Home (or `/kids` for a kids
  profile).

**Who may start a book** is one rule, `mayActFor(connectionId)`, and the **playback
store** enforces it at every start (`playBook`, `startBookInPlace`, `adoptLoaded`), so it
covers the player route, a car play request, the Android service's book adoption and a
resumed Cast session alike: never another person's book (playing it would save to their
account without their PIN), never any book while nobody is chosen (an item of an older
snapshot). A connection no profile holds still plays (a CarPlay launch before the
session could be read). While the store's read failed (`hydrationFailed`) nothing plays;
while it runs `unread`, only the connections of the people who signed in this run.
Screens never decide this themselves: they only offer the switch (`OtherPersonGate`,
below). See also [Native integrations](native-integrations.md#the-car-snapshot-srccar).

## Who's listening? (`/profiles`)

A full-screen root route (`src/app/profiles.tsx`, no swipe-back) rendering
`ProfilesScreen` (`src/components/profiles/`): every person as a large avatar
(`Portrait` with `kind="user"`, the active one ringed) with a one-line status (kids mode and its
bedtime, else "Listening now" for the active person, else their servers), and **Add
someone**. Choosing the active person goes back; choosing someone with a PIN asks for
it; anyone else is switched to. Strings are in the `profiles` i18n namespace.

- **Ways in**: the profile menu (tablet and desktop top bar), the Me tab's "Listening
  as" card on a phone, Settings > Household and sharing, and leaving kids mode.
- **At a cold launch** the auth gate opens it once per launch when there are two or
  more people and `askAtLaunch` is on.
- **Forced** while someone must be chosen (`mustChoose`): the gate opens it, and it has
  no Close and ignores Android's back. The shell is never mounted for a moment as the
  wrong person: the gate also waits for the profiles to hydrate.
- `useChooseProfile()` is the one way to choose someone (the picker, the profile menu,
  the Household pane, the gate below); `openProfiles()` the one way in.

## The PIN (`src/lib/profile-pin.ts`)

Optional, device-local, off by default, 4 digits (`PIN_LENGTH`). Asked when switching
**into** a profile that has one, and so when leaving kids mode. Changing or removing
one asks for the current PIN; removing the **person** never does (the way out of a
forgotten PIN). It keeps a person's place from a sibling's taps, not from an attacker:
anyone with the device and a browser's developer tools can read a session token anyway.

- **Storage**: only a salted, iterated hash, in the secure store under
  `audiosilo.profilePin.<profileId>` as JSON `{ v: 1, salt, iterations, hash }`. `salt`
  is 16 random bytes; `hash` is SHA-256 over salt + PIN, then over salt + the previous
  digest, **10,000** digests in all (`PIN_ITERATIONS`), compared in constant time. The
  profile mirrors `hasPin`, so screens know without reading the secure store.
- **The secure store decides whenever it can be read** (`readPin` first, in
  `useChooseProfile` and the Household pane's **Set a PIN**): the mirror is written best
  effort with the whole profiles document, which a failed write or a second web tab
  holding an older document can leave behind. A stored hash the mirror lost still asks
  (and repairs the mirror); a mirror whose hash is gone (an install restored without its
  secure store) counts as no PIN and is cleared when someone switches to that person.
  **When the secure store can't be read, the mirror decides**: a person marked as having
  a PIN is still asked (the prompt says it couldn't check), a person not marked is
  switched to without one, and **Set a PIN** goes straight to choosing a new one. **Set a
  PIN** over a hash the secure store can read asks for the current one first. The pane's
  **Change** and **Remove** are offered from the mirror alone and check against the
  secure store, so with the hash gone no PIN matches there ("That PIN doesn't match")
  until a switch to that person, or removing them, clears the mirror.
- **SHA-256 in plain JS** (`src/lib/sha256.ts`, synchronous, checked against the
  standard's vectors): 10,000 rounds through `expo-crypto` would be 10,000 asynchronous
  native calls, and on the web `crypto.subtle` exists only in a secure context, so a
  player served over plain HTTP on the LAN would have none. The salt comes from
  `expo-crypto`'s random bytes.
- **Wrong tries**: `PinDialog` shakes the field and says "That PIN doesn't match" (with
  reduced motion only the words); the fifth wrong try in a row (`PIN_MAX_TRIES`) makes it
  wait 30 s (`PIN_LOCK_MS`), counted per profile in memory, so closing the prompt doesn't
  reset it (a relaunch does).
- A deleted profile takes its PIN hash with it when its mirror says it has one (best
  effort; a leftover hash names a profile id nothing uses again).

## Links to another person's book

Every route that carries `?connection=` (the widget, the Live Activity, web history, a
shared link) follows one rule, `useRouteConnection(connection)`
(`src/components/layout/content-scope.tsx`): the content screens through `ContentScope`,
and the root modals outside any scope (the player, the end credits, the Year in
listening story, the connect flow's ready page) directly. It reads the param through
`connectionParam` (an old id resolves) and returns the gate to show instead of the
screen:

- a connection of **another person** on this device gets `OtherPersonGate`: "This
  belongs to &lt;name&gt;", with **Switch to &lt;name&gt;** (their PIN rules apply; after the switch
  the page opens where it is) and **Go back**;
- an **unknown** connection, one this device isn't signed in to (a stale link to a
  removed server or a removed person's book), gets the not-found state "Not signed in to
  that server" with a way back, never the page and never a redirect (a redirect inside a
  tab stack fired again on every focus of the tab).

The gate only offers the switch; refusing the play itself is the playback store's job
(`mayActFor`, [above](#switching-and-the-play-rule)).

## Settings > Household and sharing

`HouseholdPane` (`src/components/profiles/household-pane.tsx`), the App group's
`household` pane: a card per person (switch, rename, PIN set/change/remove, kids mode
with `KidsLibraryPicker` and the bedtime, **Remove from this device**), **Who's
listening?** and **Add someone**, the **Ask who's listening when the app opens**
switch, and the per-server house sharing switches
([Listening in the house](listening-in-the-house.md)).

**Remove from this device** (`useRemovePerson`) signs the device out of each of the
person's servers through the same sign-out as an Account page (their book stops with
its place saved, queued saves land, the token is revoked, their downloads here go),
then drops their PIN and profile. It warns first where they have no password on a
server (they would need a new invite). Removing the person listening leaves nobody
chosen.

## Testing

`src/stores/profiles.test.ts` (parsing, `reconcileProfiles`, placement, `mustChoose`,
switching), `src/lib/profile-pin.test.ts`, `sha256.test.ts`, `random.test.ts`, and in
`src/components/profiles/`: `profiles-model.test.ts`, `profiles-screen.test.tsx`,
`pin-dialog.test.tsx`, `household-pane.test.tsx`; the gate in
`src/components/shell/auth-gate.test.tsx` and the menu in `profile-menu.test.tsx`; the
"no screen lists another person's servers" checks beside each screen that reads
connections.
