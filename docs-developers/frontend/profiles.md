---
title: Profiles
description: "Profiles: a person on this device as a group of connections. The profiles store and document, the consistency rules, visible and background connections, switching and the play rule, Who's listening?, the device-local PIN, links to another person's book, and the Household page's On this device."
---

A **profile is a person on this device**: a device-local group of connections, with
at most **one connection per server** (`serverIdOf`). Each connection is already one
user on one server
([Connection identity](state-and-data.md#connection-identity-server_iduser_id)), so
every person keeps their own place in every book, queue, bookmarks and stats on the
server. The profile only says which of the device's connections belong to whom, so the
screens show one person's at a time. Nothing about profiles is sent to a server, so
there is no wire change.

Unlike a profile, a [household member](household.md) is a real account on the server
(see
[the cross-repo contract](../architecture/cross-repo-contract.md#15-household-members-profiles-and-kids-mode-stay-client-side)).
On the device it is just another connection in a profile of its own.

The user-facing side is [Sharing a device (profiles)](/users/listening/profiles) and
[Kids mode](/users/listening/kids-mode). Kids mode's code has
[its own page](kids-mode.md).

## The store (`src/stores/profiles.ts`)

One persisted document, `audiosilo.profiles`, hydrated in `bootstrapPlayback()`:

```ts
interface Profile {
  id: string;              // local, random (a UUID); never sent anywhere
  name: string;            // defaults to personName(user): a member's display_name, else the username; editable here
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
same `setMany` as its re-keyed documents. An existing document is only re-keyed. The
first document follows these rules:

- Every connection goes in one profile, except that a profile holds at most one
  connection per server. A second user on a server (signed in before the migration ran)
  gets a profile of their own.
- Each profile is named after its first connection's user. For the profile holding the
  default connection, that is the default connection's user.
- The profile holding the default connection is active.
- `askAtLaunch` is off.

The document can be missing on an install with connections, because the migration
aborted or an install from before profiles signed in again. The store then builds it
from the session's connections with the same rules.

**Reading it.** A read that **fails** is never taken as a missing document. Reconciling
an empty one would replace every profile, with new ids, no PIN and no kids settings. The
store tries the read up to `HYDRATE_ATTEMPTS` (5) times in all, a second apart, and is
`hydrationFailed` while it does. It then stops holding the launch (`giveUpOnRead`). What
happens next is decided once the session has settled:

- **Someone is signed in**: they may have a PIN or a kids profile this run can't know,
  so the store stays `hydrationFailed` (nothing of anyone shows or plays, nobody new
  signs in) and reads again whenever the app comes to the front.
- **Nobody is**, as on the web with site data blocked, where the session couldn't read
  its list either. The store runs `unread`, in memory only, and never writes over the
  stored document. Whoever signs in now gets a profile of their own.

Only a document that **reads but doesn't parse** counts as missing, because waiting
can't fix it. The store rebuilds it from the session. `parseProfilesDoc` validates a
parsed document. An `activeProfileId` naming nobody reads as `null`, never as the first
person, because that person may have a PIN and nobody gave it.

Reads: `useActiveProfile()`, `useProfileConnections()` (the active profile's
connections, in session order), and the framework-free `activeProfile()`,
`profileOf(connectionId)`, `profileConnections()` and `profileConnectionIds()`.
Changes: `switchProfile`, `renameProfile`, `setProfileKids`, `setProfileHasPin`,
`setAskAtLaunch`, `deleteProfile`, `placeConnection`.

### Consistency with the session

`reconcileProfiles` keeps the document consistent with the session's connections. It
runs on `onConnectionRemoved`, and on every change of the session's list once the
session has **settled**. It never runs while the session is loading or its hydrate
failed, when an empty list doesn't mean empty. It applies these rules in order:

1. Ids the session no longer has leave their profiles.
2. A profile keeps one connection per server.
3. A profile with no connections is deleted (its PIN with it).
4. An unplaced connection goes into the active profile when that profile has no
   connection to that server. Otherwise it goes into the first profile without one,
   else a profile of its own. A new profile is not made active, because nobody chose
   to switch.
5. When the active profile is gone and others are left, **nobody** is active
   (`mustChoose`). A second profile appearing turns `askAtLaunch` on.

`placeConnection` places a connection the connect flow just signed in instead. It goes
into the active profile, with two exceptions that put it into a new profile, which
becomes active:

- the active profile already has a connection to this server, because another user
  there is another person.
- the flow was **Add someone** (`/connect?add=1&profile=new`).

A re-pair keeps the person it had. "Add someone" signing in as a person already on the
device switches to them.

`placeConnection(id, opts)` takes `PlaceOptions` (`placeInDoc`'s):

- `newProfile`.
- `keepActive`, for a household member signed in beside the owner
  ([`addMemberHere`](household.md#signing-a-member-in-here)). The new profile is added
  **without** becoming active. The person listening stays, or nobody when the active
  person was only this connection.
- `name`, also for that member: the new profile's name, trimmed. Empty means
  `personName(user)`, which is the member's `display_name`, else the username.

### Visible and background connections

The rule that keeps one person's state from leaking into another's view without
breaking their background work:

- **Every list a person sees uses the active profile's connections**, through
  `useProfileConnections`, `profileConnections` and the cross-connection hooks'
  `useApis()`. That covers Home, the Library and its picker, Search and the command
  palette, the Downloads page, Up next, You (stats, Year, Journal), Settings and the
  profile menu, the Household page's members,
  [Listening in the house](listening-in-the-house.md), the car snapshot and the widget.
  Never use `useSession((s) => s.connections)` for a list someone sees. The exception is
  a list of the device's people: Who's listening? and On this device show every
  person's servers.
- **Background work keeps using every connection**: the offline save queue, the
  downloads engine, car bookmarks waiting to be sent, address routing and reachability.
  A switch must never make another person's queued saves unroutable, because the queue
  flush drops unroutable groups.
- **While nobody is chosen** (`mustChoose`), the visible set is empty. The auth gate
  holds the shell, every person-facing list is empty, the car lists nothing, the widget
  clears, and a link to anyone's book meets the gate described in
  [Links to another person's book](#links-to-another-persons-book). With no profiles at
  all (not hydrated yet, or nobody signed in), every connection is visible, as before
  profiles.

## Switching, and the play rule

`switchProfile(id)` (the caller has asked for the PIN):

- **The play rule**: a book that belongs to a connection outside the new profile is
  stopped. It is paused, its place is saved by the store's normal persist, and it is
  unloaded, so the next person finds no mini player with someone else's book. A book of
  the new person's own plays on.
- The session's default connection moves to the new profile's first unless it is
  already one of theirs.
- The car snapshot is rebuilt and the iOS widget clears; both follow
  `activeProfileId`.
- The UI then resets every tab to its root and goes Home (or `/kids` for a kids
  profile).

**Who may start a book** is one rule, `mayActFor(connectionId)`. The **playback store**
enforces it at every start (`playBook`, `startBookInPlace`, `adoptLoaded`), so it covers
the player route, a car play request, the Android service's book adoption and a resumed
Cast session alike. The rule is:

- Never another person's book, because playing it would save to their account without
  their PIN.
- Never any book while nobody is chosen, such as an item of an older snapshot.
- A connection no profile holds still plays, as in a CarPlay launch before the session
  could be read.
- While the store's read failed (`hydrationFailed`), nothing plays.
- While the store runs `unread`, only the connections of the people who signed in this
  run play.

Screens never decide this themselves. They only offer the switch (`OtherPersonGate`, see
[Links to another person's book](#links-to-another-persons-book)). See also
[Native integrations](native-integrations.md#the-car-snapshot-srccar).

## Who's listening? (`/profiles`)

`/profiles` is a full-screen root route (`src/app/profiles.tsx`, no swipe-back) that
renders `ProfilesScreen` (`src/components/profiles/`). It shows every person as a large
avatar (`Portrait` with `kind="user"`, the active one ringed), and **Add someone**. Each
person has a one-line status: kids mode and its bedtime, else "Listening now" for the
active person, else their servers.

Choosing the active person goes back. Choosing someone with a PIN asks for it. Choosing
anyone else switches to them. Strings are in the `profiles` i18n namespace.

- **Ways in**: the profile menu (tablet and desktop top bar), the Me tab's "Listening
  as" card on a phone, the Household page, and leaving kids mode.
- **Manage household** at its foot opens the [Household page](household.md)
  (`openHousehold`), except while someone must be chosen and for a kids profile.
- **At a cold launch** the auth gate opens it once per launch when there are two or
  more people and `askAtLaunch` is on.
- **Forced** while someone must be chosen (`mustChoose`). The gate opens it, and it has
  no Close and ignores Android's back. The gate also waits for the profiles to hydrate,
  so the shell is never mounted for a moment as the wrong person.
- `useChooseProfile()` is the one way to choose someone, from the picker, the profile
  menu, the Household page and `OtherPersonGate`. `openProfiles()` is the one way in.

## The PIN (`src/lib/profile-pin.ts`)

The PIN is optional, device-local, off by default and 4 digits (`PIN_LENGTH`). The app
asks for it when switching **into** a profile that has one, and so when leaving kids
mode. Changing or removing a PIN asks for the current one. Removing the **person**
never does, which is the way out of a forgotten PIN. The PIN keeps a person's place
from a sibling's taps, not from an attacker. Anyone with the device and a browser's
developer tools can read a session token anyway.

- **Storage**: only a salted, iterated hash, in the secure store under
  `audiosilo.profilePin.<profileId>` as JSON `{ v: 1, salt, iterations, hash }`. `salt`
  is 16 random bytes. `hash` is SHA-256 over the salt and the PIN, then over the salt and
  the previous digest, for **10,000** digests in all (`PIN_ITERATIONS`). Hashes are
  compared in constant time. The profile mirrors `hasPin`, so screens know without
  reading the secure store.
- **SHA-256 in plain JS** (`src/lib/sha256.ts`, synchronous, checked against the
  standard's vectors). 10,000 rounds through `expo-crypto` would be 10,000 asynchronous
  native calls. On the web, `crypto.subtle` exists only in a secure context, so a player
  served over plain HTTP on the LAN would have none. The salt comes from `expo-crypto`'s
  random bytes.
- **Wrong tries**: `PinDialog` shakes the field and says "That PIN doesn't match"; with
  reduced motion it shows only the words. The fifth wrong try in a row (`PIN_MAX_TRIES`)
  makes it wait 30 s (`PIN_LOCK_MS`). Tries are counted per profile in memory, so
  closing the prompt doesn't reset them, but a relaunch does.
- A deleted profile takes its PIN hash with it when its mirror says it has one. This is
  best effort; a leftover hash names a profile id that nothing uses again.

### The secure store decides

The `hasPin` mirror is written best effort with the whole profiles document. A failed
write, or a second web tab holding an older document, can leave it behind. So the
secure store decides, through `readPinMirrored`. It reads the hash with `readPin` and
repairs the profile's `hasPin` mirror to match. `useChooseProfile` and the Household
page's **Set a PIN**, **Change** and **Remove** all use it.

- A stored hash that the mirror lost still asks for the PIN.
- A mirror whose hash is gone, as on an install restored without its secure store,
  counts as no PIN.
- **When the secure store can't be read, nothing acts on the mirror's word.** Choosing
  that person doesn't switch, and **Set a PIN**, **Change** and **Remove** change
  nothing. Each says "Couldn't check the PIN on this device. Try again."
- **Set a PIN** over a hash the secure store can read asks for the current one first.
- **Change** and **Remove** are offered from the mirror. With the hash gone, they
  repair the mirror and say "There's no PIN set for &lt;name&gt; on this device."
  instead of asking for a PIN that nothing could match.

## Links to another person's book

Routes carry `?connection=` from the widget, the Live Activity, web history and shared
links. Every such route follows one rule, `useRouteConnection(connection)`
(`src/components/layout/content-scope.tsx`). The content screens use it through
`ContentScope`. The root modals outside any scope use it directly: the player, the end
credits, the Year in listening story and the connect flow's ready page.

It reads the param through `connectionParam`, where an old id resolves, and returns the
gate to show instead of the screen:

- A connection of **another person** on this device gets `OtherPersonGate`: "This
  belongs to &lt;name&gt;", with **Switch to &lt;name&gt;** and **Go back**. Their PIN
  rules apply, and after the switch the page opens where it is.
- An **unknown** connection, one this device isn't signed in to, gets the not-found
  state "Not signed in to that server" with a way back. That covers a stale link to a
  removed server or a removed person's book. It never shows the page and never
  redirects, because a redirect inside a tab stack fired again on every focus of the
  tab.

The gate only offers the switch. Refusing the play itself is the playback store's job
(`mayActFor`, see [Switching, and the play rule](#switching-and-the-play-rule)).

## On this device (`DevicePeople`)

The [Household page](household.md)'s first part is `DevicePeople`
(`src/components/household/device-people.tsx`, "On this device"). It holds:

- A card per person, with `PersonHeader`, Switch, rename, setting, changing and
  removing the PIN, kids mode with the bedtime, and **Remove from this device**. While
  `useKidsSharedShelf` says `library`, the card also has `KidsLibraryPicker`. That is a
  one-library shelf, or a member's shelf not known yet.
- **Who's listening?**
- **Sign in someone who already has an account** (`openAddSomeone`, the connect flow's
  Add someone, `ADD_SOMEONE_HREF`).
- The **Ask who's listening when the app opens** switch.

A person with a connection whose sign-in ended (`needsReconnect`) gets a **Signed out**
row with **Sign in again** (`SignInAgainRow`, see
[Signing a member in again](household.md#signing-a-member-in-again)).

**Remove from this device** (`useRemovePerson`) signs the device out of each of the
person's servers, through the same sign-out as an Account page. Their book stops with
its place saved, queued saves land, the token is revoked and their downloads here go.
It then drops their PIN and profile. It warns first where they have no password on a
server, because they would need a new invite. For a household member (`managed_by`) it
says instead that the account stays, and who can sign them in here again. Removing the
person listening leaves nobody chosen.

## Testing

- `src/stores/profiles.test.ts`: parsing, `reconcileProfiles`, placement,
  `mustChoose` and switching.
- `src/lib/profile-pin.test.ts`, `sha256.test.ts` and `random.test.ts`.
- In `src/components/profiles/`: `profiles-model.test.ts`, `profiles-screen.test.tsx`
  and `pin-dialog.test.tsx`.
- The Household page's own tests are listed in [Household](household.md#testing).
- The gate in `src/components/shell/auth-gate.test.tsx`, and the menu in
  `profile-menu.test.tsx`.
- The "no screen lists another person's servers" checks sit beside each screen that
  reads connections.
