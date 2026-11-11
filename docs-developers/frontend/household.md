---
title: Household page and members
description: "The Household page and household members in the player: the page and every way in, the members section, adding a member, a member's card, signing a member in beside the owner (addMemberHere, signInMemberHere, renewMemberHere), and how the app names a member's owner."
---

The **Household page** is where a person looks after the people they listen with:

- the people on this device ([Profiles](profiles.md#on-this-device-devicepeople));
- the household members they added on their servers;
- [Listening in the house](listening-in-the-house.md).

A **household member** is a real account on the server (capability
`household_members`), so the server decides what it may do (see the
[cross-repo contract](../architecture/cross-repo-contract.md#15-household-members-profiles-and-kids-mode-stay-client-side)).
The wire is [Household members](../server/api/reference.md#household-members), and its
client side is in [State and data](state-and-data.md#household-members). On the device a
member is just another connection in a profile of its own.

The user-facing side is [Your household](/users/listening/household).

## The page

`HouseholdPage` (`src/components/household/household-page.tsx`) is rendered in two
places:

- **The You hub's `household` segment.** On a phone it sits between Settings and
  Account and is `embedded`, since the hub's large title already says Household. On a
  tablet and desktop it is in the sub-nav, after Journal.
- **The pushed page `/household`**
  (`src/app/(app)/(home,library,search,offline,me)/household.tsx`). It is in the array
  group like `/settings`, so back returns where the listener was, and a cold link opens
  it in Home.

**Every way in to the pushed page** goes through `openHousehold()` (`src/lib/open.ts`,
`householdHref()` in `paths.ts`), which is a no-op on the page already:

- the profile menu;
- "Who's listening?" > Manage household;
- the link at the end of Settings' App group;
- Home's house row;
- the web palette.

In the phone You hub, the segmented control and the embedded Settings' link
(`SettingsContent`'s `onOpenHousehold`) switch to the Household segment with
`router.setParams` instead. `/settings?section=household` (`isHouseholdSection`)
**replaces** itself with `/household`, so an old link lands on the page and back doesn't
bounce into the redirect.

The page is a plain column of three parts:

- **`DevicePeople`** ("On this device"): see
  [Profiles](profiles.md#on-this-device-devicepeople).
- **`HouseholdMembers`** (`src/components/household/members-section.tsx`), below.
- **`HouseSharing`** (`house-sharing.tsx`): the per-server house sharing switches
  ([Listening in the house](listening-in-the-house.md)).

## The members section

`HouseholdMembers` renders one block per connection of the person listening whose
server has `household_members`. Each block has:

- the members list (`useHouseholdMembers`), with a `MemberCard` each;
- **Add someone to your household** with "N of M added" (`AddMemberDialog`), or one line
  for the list's `reason` instead. `addBlock` gives the reason, and adds `at_cap` from
  `members.length >= max`.

A member's own page names their owner instead ("Adam manages your account.", "Only Adam
can add people or change what you can listen to."; see
[Naming the owner](#naming-the-owner)).

The pure rules are in `household-model.ts`: the name rule, the default access per kind,
`collectionIdsFor`, the error mapping, `memberConnection` and `confirmsName`.

**Refusals** are read by kind with `apiErrorKind` (see
[Error mapping](state-and-data.md#the-api-client-srcapiclientts)) and said in the app's
own words: `writeError` / `writeErrorText` for the member writes, `hereFailure` for
signing a member in here.

## Adding a member

`AddMemberDialog`'s form has three fields:

- the name, cut to 40 code points, as the server counts them;
- the Kids switch;
- `AccessPicker`. Its default follows the Kids switch (kid: `collections`, grown-up:
  `all`) until the owner picks one.

"Create &lt;Name&gt;'s books" creates nothing yet. It adds a pending, ticked row ("New
collection, created when you save"). When the owner already has a collection of that
name, the button is "Share &lt;Name&gt;'s books" and ticks that one instead.

On save, `useMemberBooks().run(booksName, write)` creates the collection first, then runs
the write with its id in `collection_ids`.

- When the write is **refused** (a 4xx or a `CapabilityError`), it deletes the collection
  again.
- With no answer, or a 5xx, the write may have landed. The collection stays, and the
  message says so (`booksRunText`).

Then:

- a kid is `addMember({ …, sign_in_here: true })`, and its `session` goes to
  `signInMemberHere`, then the offer to set the owner's PIN when their profile has none;
- a grown-up is `addMember`, then `MemberPairing` (`memberPairing`) shows the QR, with
  "They'll also use this phone" (`useSignInHere`: `memberSession` then
  `addMemberHere`).

## A member's card

`MemberCard` carries:

- what they can listen to, and its change dialog with the same picker. Moving
  `collections` to `all` sends `collection_ids: []` through `collectionIdsFor`, and the
  dialog says first that it stops sharing.
- the Kids switch (`PATCH kind`), confirmed when it makes a kid. When the member is
  signed in here, their connection's `user.member_kind` is updated at once, so their
  password card and kids mode follow.
- their devices (`useMemberDevices`), each with Sign out.
  - Their session on **this** device is marked "This device". The card finds it by
    reading the member's own `GET /me/devices` with their token here, because that is
    the only list that marks `current`.
  - Signing that one out marks their connection `needsReconnect` at once with
    `markNeedsReconnect`.
- "Set up their own device" (`MemberPairing`), and "Sign in on this device" while they
  aren't here;
- Rename (the server's name and, when they are here, their profile's);
- "Delete their account" (`ConfirmDialog`, then typing the name, `confirmsName`), kept
  apart from **Remove from this device** (shown while they are here; see
  [Profiles](profiles.md#on-this-device-devicepeople)).

## Signing a member in here

`addMemberHere(session, { name })` (`src/components/connect/add-member-here.ts`) is the
variant of `finishConnect` that signs a household member in **beside** the owner, with
no navigation:

- It stores the member's connection with the owner's `serverUrl` and server name,
  because it is the owner's server and the answer was read through the owner's client.
  Both connections learn the addresses the answer carried.
- `setSession(..., { makeDefault: false })` keeps the default connection where it is
  (see [Session](state-and-data.md#session-srcstoressessionts)).
- `placeConnection(id, { newProfile: true, keepActive: true, name })` gives the member a
  profile of its own, named as the owner typed. It **never** calls `switchProfile`, so
  the owner stays the person listening and their book plays on.
- A kid's account starts in kids mode with the default bedtime (`kidsOnForKidAccount`;
  see [Kids mode](kids-mode.md)).

It resolves to `{ connectionId, profileId }`. It refuses, changing nothing, with
`AddMemberHereError` and a code:

| Code | When |
|---|---|
| `already_here` | the device already holds that user on that server (`memberSignedInHere`). Signing them in again would replace the connection, PIN and all. |
| `choose_adult` | the person listening is in kids mode with a grown-up on the device (`mayAddPerson`) |
| `not_ready` | the profiles can't be read, or the device has no connection to that server |

Around it, in `src/components/household/use-sign-in-here.ts`:

- **`signInMemberHere(mint, member, serverId)`** asks `memberSignedInHere` first, so no
  session is minted that `addMemberHere` would refuse. Then it calls `mint()` (the add's
  `session`, or `memberSession`) and `addMemberHere`. It never throws. It resolves to
  `{ status: 'done' | 'already' }` or `{ status: 'failed', reason? }`. The reason is
  `addMemberHere`'s code or the server's refusal (`too_many`, `member_disabled`,
  `not_found`).
- `useSignInHere(owner)` wraps it with `useMemberSession` and a busy flag.

### Signing a member in again

A person on this device with a connection whose sign-in ended (`needsReconnect`) gets a
**Signed out** row with **Sign in again** (`SignInAgainRow`). What the button does
depends on the connection:

- **A member the person listening owns** (`memberOwnerHere`), whose token is dead (not a
  server reset): `useMemberSession`, then **`renewMemberHere(session)`** (in
  `add-member-here.ts`), at once and with no password. Only the token changes, through
  the same store as the add. The connection keeps its id and its person's profile, PIN
  and kids settings, and the person listening and the default connection stay.
  `renewMemberHere` refuses with `not_ready` when the device doesn't hold that member.
- **Otherwise:** `reconnectConnection`, the reconnect banner's sign-in, which keeps the
  person.

Refusals say why in the app's words (`sessionRefusalText`): too many tries, a disabled
member, or one no longer in the household.

`ApiProvider` (`src/api/provider.tsx`) reads a connection's answers again whenever its
token changes (`useReadAgainOnSignIn`). It reads whatever failed while the connection
was signed out, and its `server`, `libraries` and `collections` lists
(`readAgainOnSignIn`). It runs in the provider's effect, after every screen's own, so
the queries already hold the new client, and a kid's shelf recovers without a reload.

## Naming the owner

Copy that names a member's owner goes through `managerName(user, { connection, people })`
in `src/lib/account.ts`, or `useManagerName(connectionId, user?)` in
`src/stores/profiles.ts` (with `useDevicePeople()`). It never reads
`managed_by.username` directly. That copy is the members section, kids mode's lines, the
password card, the sign-out warnings and the remove confirmation.

The name is the name of the profile holding the owner's own sign-in to that server on
this device, else the owner's username. The player's `managed_by` carries no typed name;
`managerName` would read a `display_name` there only if a server sent one.
`kidsManager(profile, people)` is the same rule for a kids profile's connection.

## Testing

- In `src/components/household/`: `household-page.test.tsx`, `members-section.test.tsx`,
  `member-card.test.tsx`, `household-model.test.ts` and `use-sign-in-here.test.ts`.
- `add-member-here.test.ts` in `src/components/connect/`.
- The member hooks in `src/api/hooks-members.test.tsx`.
- The page's routes in `src/components/shell/route-tree-household.test.tsx` and
  `route-tree-household-cold.test.tsx`.
- `src/api/provider.test.tsx` (read again on a new token).
