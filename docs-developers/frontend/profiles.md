---
title: Profiles
description: "Profiles (Phase 8): a person on this device as a group of connections. The profiles store and document, the consistency rules, visible versus background connections, switching and the play rule, Who's listening?, the device-local PIN, links to another person's book, the Household page (members, the add dialog, apiErrorKind), and signing a household member in beside the owner (addMemberHere, signInMemberHere, renewMemberHere)."
---

A **profile is a person on this device**: a device-local group of connections, at
most **one connection per server** (`serverIdOf`). Each connection is already one
user on one server ([Connection identity](state-and-data.md#connection-identity-server_iduser_id)),
so every person keeps their own place in every book, queue, bookmarks and stats on
the server; the profile only says which of the device's connections belong to whom,
so the screens show one person's at a time. Nothing about profiles is sent to a
server: there is no wire change.

**Profiles and kids mode are client-side; household members are server-side.** A
[household member](/developers/server/api/reference#household-members) (Phase 8b-1,
capability `household_members`) is a real account on the server that an owner made
from the player, with what it may listen to decided by the server. On the device it is
just another connection in a profile of its own, placed by `addMemberHere`
([below](#signing-a-member-in-here-addmemberhere)); the server's `user.member_kind`
only decides whether that profile starts in kids mode.

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

`placeConnection(id, opts)` takes `PlaceOptions` (`placeInDoc`'s): `newProfile`, and
for a household member signed in beside the owner `keepActive` (the new profile is
added **without** becoming active: the person listening stays, or nobody when the
active person was only this connection) and `name` (the new profile's name, trimmed;
empty means the username).

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
  as" card on a phone, the Household page, and leaving kids mode.
- **Manage household** at its foot opens the [Household page](#the-household-page)
  (`openHousehold`), except while someone must be chosen and for a kids profile.
- **At a cold launch** the auth gate opens it once per launch when there are two or
  more people and `askAtLaunch` is on.
- **Forced** while someone must be chosen (`mustChoose`): the gate opens it, and it has
  no Close and ignores Android's back. The shell is never mounted for a moment as the
  wrong person: the gate also waits for the profiles to hydrate.
- `useChooseProfile()` is the one way to choose someone (the picker, the profile menu,
  the Household page, the gate below); `openProfiles()` the one way in.

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
  `useChooseProfile` and the Household page's **Set a PIN**): the mirror is written best
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

## The Household page

Phase 8b-1 moved Settings' Household pane to a page of its own, `HouseholdPage`
(`src/components/household/household-page.tsx`), rendered in two places: the phone
You hub's `household` segment (between Settings and Account, `embedded`, since the
hub's large title already says Household) and the pushed page `/household`
(`src/app/(app)/(home,library,search,offline,me)/household.tsx`, in the array group
like `/settings`, so back returns where the listener was and a cold link opens it in
Home). Every way in goes through `openHousehold()` (`src/lib/open.ts`, `householdHref()`
in `paths.ts`; a no-op on the page already): the profile menu, "Who's listening?" >
Manage household, the link at the end of Settings' App group, Home's house row and the
web palette. `/settings?section=household` (`isHouseholdSection`) **replaces** itself
with `/household`, so an old link lands on the page and back doesn't bounce into the
redirect.

The page is a plain column of three parts:

- **`DevicePeople`** (`src/components/household/device-people.tsx`, "On this
  device"): a card per person (`PersonHeader`, Switch, rename, PIN set/change/remove,
  kids mode with the bedtime and, while the shelf is one library
  (`useKidsSharedShelf`), `KidsLibraryPicker`, **Remove from this device**), **Who's
  listening?** and **Sign in someone who already has an account** (`openAddSomeone`,
  the connect flow's Add someone, `ADD_SOMEONE_HREF`), and the **Ask who's listening
  when the app opens** switch. A person with a connection whose sign-in ended
  (`needsReconnect`) gets a **Signed out** row with **Sign in again**
  (`SignInAgainRow`): when that connection is a member the person listening owns
  (`memberOwnerHere`) and its token is dead (not a server reset), it is
  `useMemberSession` then `renewMemberHere`, at once and with no password; otherwise
  `reconnectConnection`, the reconnect banner's sign-in, which keeps the person.
  Refusals say why in the app's words (`sessionRefusalText`: too many tries, a disabled
  member, one no longer in the household).
- **`HouseholdMembers`** (`src/components/household/members-section.tsx`): per
  connection of the person listening whose server has `household_members`, the
  members list (`useHouseholdMembers`), a `MemberCard` each and **Add someone to your
  household** with "N of M added" (`AddMemberDialog`), or one line for the list's
  `reason` (`addBlock`, which adds `at_cap` from `members.length >= max`). A member's own
  page names their owner instead (`managerName(connection.user)`: "Adam manages your
  account.", "Only Adam can add people or change what you can listen to."). The pure
  rules are `household-model.ts` (the name rule, the default access per kind,
  `collectionIdsFor`, the error mapping, `memberConnection`, `confirmsName`).
- **`HouseSharing`** (`house-sharing.tsx`): the per-server house sharing switches
  ([Listening in the house](listening-in-the-house.md)).

**Adding a member** (`AddMemberDialog`): the form is the name (cut to 40 code points,
as the server counts them), the Kids switch and `AccessPicker`; the access default
follows the Kids switch (kid: `collections`, grown-up: `all`) until the owner picks
one. "Create &lt;Name&gt;'s books" creates nothing yet: it adds a pending, ticked row ("New
collection, created when you save"); when the owner already has a collection of that
name the button is "Share &lt;Name&gt;'s books" and ticks that one instead. On save,
`useMemberBooks().run(booksName, write)` creates the collection first, runs the write
with its id in `collection_ids`, and deletes it again when the write is **refused** (a
4xx or a `CapabilityError`); with no answer, or a 5xx, the write may have landed, so it
stays and the message says so (`booksRunText`). Then:

- a kid is `addMember({ …, sign_in_here: true })`, and its `session` goes to
  `signInMemberHere`, then the offer to set the owner's PIN when their profile has none;
- a grown-up is `addMember`, then `MemberPairing` (`memberPairing`) shows the QR, with
  "They'll also use this phone" (`useSignInHere`: `memberSession` then
  `addMemberHere`).

**A `MemberCard`** carries what they can listen to (and its change dialog, the same
picker; moving `collections` to `all` sends `collection_ids: []` and says first that it
stops sharing), the Kids switch (`PATCH kind`, confirmed when it makes a kid; when the
member is signed in here, their connection's `user.member_kind` is updated at once so
their password card and kids mode follow), their devices (`useMemberDevices`, each with
Sign out; their session on **this** device is marked "This device", found by reading
the member's own `GET /me/devices` with their token here, the only list that marks
`current`, and signing that one out marks their connection `needsReconnect` at once with
`markNeedsReconnect`), "Set up their own device" (`MemberPairing`), "Sign in on this
device" while they aren't here, Rename (the server's name and, when they are here,
their profile's), and "Delete their account" (`ConfirmDialog`, then typing the name,
`confirmsName`), kept apart from **Remove from this device** (shown while they are
here).

**Refusals** are told apart by `apiErrorKind(e)` (`src/api/client.ts`): the server's
`code` when it is one the app knows (`member_limit`, `username_taken`, `invalid_name`,
`invalid_collections`, `feature_off`, `not_allowed`, `member_cannot_manage`,
`member_disabled`, `kid_account`, `demo_account`), else the status (`too_many` 429,
`not_found` 404, `forbidden` 403, `invalid` 400, `conflict` 409, `failed` for anything
else or no answer). Screens map that to their own words (`writeError` /
`writeErrorText` for the member writes, `hereFailure` for signing a member in here) and
never show `ApiError.message`; a 429 reads "Too many tries. Wait a few minutes and try
again." (`common.tooManyTries`).

**Remove from this device** (`useRemovePerson`) signs the device out of each of the
person's servers through the same sign-out as an Account page (their book stops with
its place saved, queued saves land, the token is revoked, their downloads here go),
then drops their PIN and profile. It warns first where they have no password on a
server (they would need a new invite); for a household member (`managed_by`) it says
instead that the account stays and who can sign them in here again. Every connection
removed, by any path through `removeConnection`, has the other connections to that
server read their household again (`onConnectionRemoved` in `hooks.ts`,
`invalidateHousehold`), so the owner's page stops showing this device under the
member. Removing the person listening leaves nobody chosen.

## Signing a member in here (`addMemberHere`)

`addMemberHere(session, { name })` (`src/components/connect/add-member-here.ts`)
is the variant of `finishConnect` that signs a household member in **beside** the
owner, with no navigation:

- the member's connection is stored with the owner's `serverUrl` and server name (it
  is the owner's server, and the answer was read through the owner's client), and both
  connections learn the addresses the answer carried;
- `setSession(..., { makeDefault: false })`: the default connection stays where it is
  (it still becomes the default when there is none, or the current default is no
  longer signed in);
- `placeConnection(id, { newProfile: true, keepActive: true, name })`: a profile of
  its own named as the owner typed, and **never** `switchProfile`, so the owner stays
  the person listening and their book plays on;
- `kidsOnForKidAccount`: a kid's account (`member_kind`) starts in kids mode with the
  default bedtime.

It refuses, changing nothing, with `AddMemberHereError` and a code: `already_here`
when the device already holds that user on that server (`memberSignedInHere`; signing
them in again would replace the connection, PIN and all), `choose_adult` while the
person listening is in kids mode with a grown-up on the device (`mayAddPerson`), and
`not_ready` when the profiles can't be read or the device has no connection to that
server. It resolves to `{ connectionId, profileId }`.

Around it, in `src/components/household/use-sign-in-here.ts`:

- **`signInMemberHere(mint, member, serverId)`** asks `memberSignedInHere` first (so no
  session is minted that `addMemberHere` would refuse), then `mint()` (the add's
  `session`, or `memberSession`) and `addMemberHere`. It never throws: it resolves to
  `{ status: 'done' | 'already' }` or `{ status: 'failed', reason? }`, the reason being
  `addMemberHere`'s code or the server's refusal (`too_many`, `member_disabled`,
  `not_found`). `useSignInHere(owner)` wraps it with `useMemberSession` and a busy flag.
- **`renewMemberHere(session)`** (in `add-member-here.ts`) signs in again a member this
  device already holds (their sign-in ended): only the token changes, through the same
  store as the add, so the connection keeps its id, its person's profile, PIN and kids
  settings, and the person listening and the default connection stay. `not_ready` when
  the device doesn't hold that member.

`ApiProvider` (`src/api/provider.tsx`) reads a connection's answers again whenever its
token changes (`useReadAgainOnSignIn`): whatever failed while it was signed out, and its
`server`, `libraries` and `collections` lists (`readAgainOnSignIn`). It runs in the
provider's effect, after every screen's own, so the queries already hold the new client.

## Testing

`src/stores/profiles.test.ts` (parsing, `reconcileProfiles`, placement, `mustChoose`,
switching), `src/lib/profile-pin.test.ts`, `sha256.test.ts`, `random.test.ts`, and in
`src/components/profiles/`: `profiles-model.test.ts`, `profiles-screen.test.tsx`,
`pin-dialog.test.tsx`; in `src/components/household/`: `household-page.test.tsx`,
`members-section.test.tsx`, `member-card.test.tsx`, `household-model.test.ts` and
`use-sign-in-here.test.ts`; `add-member-here.test.ts` in `src/components/connect/`;
`src/api/provider.test.tsx` (read again on a new token); the gate in
`src/components/shell/auth-gate.test.tsx` and the menu in `profile-menu.test.tsx`; the
"no screen lists another person's servers" checks beside each screen that reads
connections.
