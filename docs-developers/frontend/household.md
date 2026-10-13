---
title: Household page and members
description: "The Household page and household members in the player: the page and every way in, the members section, adding a member, a member's card, signing a member in beside the owner (addMemberHere, signInMemberHere, renewMemberHere), and how the app names a member's owner."
---

The **Household page** is where a person looks after the people they listen with: the
people on this device ([Profiles](profiles.md#on-this-device-devicepeople)), the
household members they added on their servers, and
[Listening in the house](listening-in-the-house.md). A **household member** is a real
account on the server (capability `household_members`), so what it may do is the
server's to decide (the
[cross-repo contract](../architecture/cross-repo-contract.md#16-household-members-profiles-and-kids-mode-stay-client-side));
the wire is [Household members](../server/api/reference.md#household-members) and its
client side [State and data](state-and-data.md#household-members). On the device a
member is just another connection in a profile of its own.

The user-facing side is [Your household](/users/listening/household).

## The page

`HouseholdPage` (`src/components/household/household-page.tsx`) is rendered in two
places: the phone You hub's `household` segment (between Settings and Account,
`embedded`, since the hub's large title already says Household) and the pushed page
`/household` (`src/app/(app)/(home,library,search,offline,me)/household.tsx`, in the
array group like `/settings`, so back returns where the listener was and a cold link
opens it in Home). **Every way in** goes through `openHousehold()` (`src/lib/open.ts`,
`householdHref()` in `paths.ts`; a no-op on the page already): the profile menu, "Who's
listening?" > Manage household, the link at the end of Settings' App group, Home's
house row and the web palette. `/settings?section=household` (`isHouseholdSection`)
**replaces** itself with `/household`, so an old link lands on the page and back
doesn't bounce into the redirect.

The page is a plain column of three parts:

- **`DevicePeople`** ("On this device"): see
  [Profiles](profiles.md#on-this-device-devicepeople).
- **`HouseholdMembers`** (`src/components/household/members-section.tsx`), below.
- **`HouseSharing`** (`house-sharing.tsx`): the per-server house sharing switches
  ([Listening in the house](listening-in-the-house.md)).

## The members section

`HouseholdMembers` renders, per connection of the person listening whose server has
`household_members`, the members list (`useHouseholdMembers`), a `MemberCard` each and
**Add someone to your household** with "N of M added" (`AddMemberDialog`), or one line
for the list's `reason` (`addBlock`, which adds `at_cap` from `members.length >= max`).
A member's own page names their owner instead ("Adam manages your account.", "Only
Adam can add people or change what you can listen to."; see
[Naming the owner](#naming-the-owner)). The pure rules are `household-model.ts` (the
name rule, the default access per kind, `collectionIdsFor`, the error mapping,
`memberConnection`, `confirmsName`).

**Refusals** are read by kind with `apiErrorKind` (see
[Error mapping](state-and-data.md#the-api-client-srcapiclientts)) and said in the app's
own words: `writeError` / `writeErrorText` for the member writes, `hereFailure` for
signing a member in here.

## Adding a member

`AddMemberDialog`: the form is the name (cut to 40 code points, as the server counts
them), the Kids switch and `AccessPicker`; the access default follows the Kids switch
(kid: `collections`, grown-up: `all`) until the owner picks one. "Create &lt;Name&gt;'s
books" creates nothing yet: it adds a pending, ticked row ("New collection, created
when you save"); when the owner already has a collection of that name the button is
"Share &lt;Name&gt;'s books" and ticks that one instead. On save,
`useMemberBooks().run(booksName, write)` creates the collection first, runs the write
with its id in `collection_ids`, and deletes it again when the write is **refused** (a
4xx or a `CapabilityError`); with no answer, or a 5xx, the write may have landed, so it
stays and the message says so (`booksRunText`). Then:

- a kid is `addMember({ …, sign_in_here: true })`, and its `session` goes to
  `signInMemberHere`, then the offer to set the owner's PIN when their profile has none;
- a grown-up is `addMember`, then `MemberPairing` (`memberPairing`) shows the QR, with
  "They'll also use this phone" (`useSignInHere`: `memberSession` then
  `addMemberHere`).

## A member's card

`MemberCard` carries:

- what they can listen to, and its change dialog (the same picker; moving
  `collections` to `all` sends `collection_ids: []` through `collectionIdsFor` and
  says first that it stops sharing);
- the Kids switch (`PATCH kind`, confirmed when it makes a kid; when the member is
  signed in here, their connection's `user.member_kind` is updated at once so their
  password card and kids mode follow);
- their devices (`useMemberDevices`, each with Sign out; their session on **this**
  device is marked "This device", found by reading the member's own `GET /me/devices`
  with their token here, the only list that marks `current`, and signing that one out
  marks their connection `needsReconnect` at once with `markNeedsReconnect`);
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

- the member's connection is stored with the owner's `serverUrl` and server name (it
  is the owner's server, and the answer was read through the owner's client), and both
  connections learn the addresses the answer carried;
- `setSession(..., { makeDefault: false })`: the default connection stays where it is
  (see [Session](state-and-data.md#session-srcstoressessionts));
- `placeConnection(id, { newProfile: true, keepActive: true, name })`: a profile of
  its own named as the owner typed, and **never** `switchProfile`, so the owner stays
  the person listening and their book plays on;
- a kid's account starts in kids mode with the default bedtime
  (`kidsOnForKidAccount`: see [Kids mode](kids-mode.md)).

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

### Signing a member in again

A person on this device with a connection whose sign-in ended (`needsReconnect`) gets a
**Signed out** row with **Sign in again** (`SignInAgainRow`). When that connection is a
member the person listening owns (`memberOwnerHere`) and its token is dead (not a
server reset), it is `useMemberSession` then **`renewMemberHere(session)`** (in
`add-member-here.ts`), at once and with no password: only the token changes, through
the same store as the add, so the connection keeps its id, its person's profile, PIN
and kids settings, and the person listening and the default connection stay
(`not_ready` when the device doesn't hold that member). Otherwise it is
`reconnectConnection`, the reconnect banner's sign-in, which keeps the person.
Refusals say why in the app's words (`sessionRefusalText`: too many tries, a disabled
member, one no longer in the household).

`ApiProvider` (`src/api/provider.tsx`) reads a connection's answers again whenever its
token changes (`useReadAgainOnSignIn`): whatever failed while it was signed out, and
its `server`, `libraries` and `collections` lists (`readAgainOnSignIn`). It runs in the
provider's effect, after every screen's own, so the queries already hold the new
client, and a kid's shelf recovers without a reload.

## Naming the owner

Copy that names a member's owner (the members section, kids mode's lines, the password
card, the sign-out warnings, the remove confirmation) goes through
`managerName(user, { connection, people })` in `src/lib/account.ts`, or
`useManagerName(connectionId, user?)` in `src/stores/profiles.ts` (with
`useDevicePeople()`), never `managed_by.username` directly: the name of the profile
holding the owner's own sign-in to that server on this device, else
`managed_by.display_name`, else the username. `kidsManager(profile, people)` is the
same rule for a kids profile's connection.

## Testing

In `src/components/household/`: `household-page.test.tsx`, `members-section.test.tsx`,
`member-card.test.tsx`, `household-model.test.ts` and `use-sign-in-here.test.ts`;
`add-member-here.test.ts` in `src/components/connect/`; `src/api/provider.test.tsx`
(read again on a new token).
