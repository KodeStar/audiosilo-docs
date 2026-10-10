---
title: Listening in the house
description: "The player side of Listening in the house: the household hooks and their polling rules, the pure house model, and the Home row, the book page's In the house card and the sharing switch in src/components/house/."
---

Listening in the house is an opt-in server feature (capability `household`): people
on one server who choose to share see what the others who share are listening to.
The server owns every privacy rule (reciprocal, other enabled non-demo people only,
the caller's scopes, no device fields; see
[the reference](../server/api/reference.md#listening-in-the-house)). The
player only decides what to show of the answer, where, and how often to ask.

## The wire and the hooks (`src/api/`)

Types `HouseholdSettings`, `HouseListeningState`, `HouseListeningRow` and
`HouseListening` in `types.ts`; `client.household(signal?)`,
`client.setHousehold(share)` and `client.houseListening(signal?)` (which reads a
missing `listening` as `[]`) in `client.ts`. The hooks in `hooks.ts`, each gated on
`household` (`useCapabilityQuery` / `useCapabilityMutation`, so a server without the
flag is never asked):

- `useHousehold(cid?)` - the caller's own `{ share_listening }`, `qk.household(cid)`.
- `useSetHousehold(cid?)` - the switch. Rejects with `CapabilityError` (sending
  nothing) while the flag is off or unknown; never hand that to `noteError`. It stores
  the server's answer under `qk.household(cid)` and invalidates
  `qk.houseListening(cid)`, since a change of the caller's own choice opens or
  empties the house (it is reciprocal). A demo account's `PUT` is a `403`.
- `useHouseListening(cid?, { enabled })` - the house, `qk.houseListening(cid)`.
  `enabled: false` sends no request at all.

### When the house is asked

Polling only; there is no realtime channel.

- **Every minute while the app is in the foreground** (`HOUSE_POLL_MS`, 60 s).
  `housePollInterval()` answers `false` unless `AppState` is `active`, so a suspended
  or hidden native app asks nothing (React Query's own focus check covers a hidden
  web tab); the foreground refresh reads it again on return, which restarts the
  interval. `useCapabilityQuery` gained a `refetchInterval` option for this.
- **Only while the listener shares.** `useHouseRows(cid, active)`
  (`src/components/house/use-house-rows.ts`) asks `useHousehold` first and enables
  `useHouseListening` only when `share_listening` is `true`: most listeners never
  turn sharing on, and they never poll.
- **Only while the surface is on screen.** `active` is `useIsFocused()` of the Home
  screen or the book page, so a Home kept mounted under another tab stops asking.

Loading, an error and "not sharing" all read as no rows: the house is an extra,
never an empty section or an error banner.

## The house model (`house-model.ts`)

Pure and tested (`house-model.test.ts`):

- `visibleRows(house, sharing)` - nothing while the caller doesn't share (a cached
  answer can outlive turning sharing off), one row per person (the first, newest,
  wins), in the server's newest-first order.
- `rowsForBook(rows, libraryId, path)` - the housemates on one book (path is the
  identity).
- `houseWhen(row, now)` - `playing` and `paused` as the server says; for `recent`,
  the **local calendar day** of the newest save worked out by hand (`daysAgo`: Hermes
  has no `Intl.RelativeTimeFormat`): `today`, `yesterday`, or `earlier` for a clock
  that disagrees with the server's 24 hours.
- `chapterName(row, t)` - the chapter's title, else "Chapter N" from
  `chapter_index` (a chapter titled "Track 01"), else nothing.
- `houseCopy(row, now, t)` - the title (the server's, else the path's last segment),
  the state line ("Listening now · Chapter 4") and one sentence for a screen reader
  ("sam is listening to Unsouled, Chapter 4").
- `houseColumns` / `houseCardWidth` - the Home grid: cards at least 250 wide, 12
  apart, laid out by the row's **measured** width (the Up next drawer can take part
  of the window), one per row on a phone.

Strings live in the `house` i18n namespace.

## The components (`src/components/house/`)

- **`HouseRow({ connections })`** - Home's "Listening in the house", placed after
  "Next in your series" and before the smart shelves (`home-screen.tsx`). One
  `HomeSection` per connection whose server has `household`, where the listener
  shares and someone else who shares listened in the last day; it renders nothing
  otherwise. The section's sub is "`<server name>` · shared by choice" and its action
  "Sharing settings" opens Settings at the household pane
  (`openSettings('household')`). Each `HouseCard` is the person's avatar and name (a
  static green dot beside "Listening now"), the book's title, the state line and its
  cover; tapping it opens the book on that connection (`openBook`).
- **`InTheHouseCard({ connectionId, libraryId, path })`** - the book page's "In the
  house" card, last in the aside (`book-aside.tsx`): the housemates on **this** book,
  each an avatar, the name and the state line, read from the same cached answer as
  Home. Renders nothing when nobody is.
- **`HouseSharingRow({ connectionId, first? })`** - "Share what I'm listening to with
  the house" for one connection, with the privacy sentence "Your current book shows on
  the Home page of other people on `<server>` who share theirs too. Off by default."
  Hidden while the server lacks `household` (or that isn't known yet). The switch
  moves at once (optimistic) and settles on the server's answer; a refusal puts it
  back with a toast (a demo account gets its own words); while it loads or saves the
  switch waits disabled, and a failed load offers Retry.
- **`PersonAvatar({ name, size, ring? })`** - a gradient monogram with two hues from
  the name (the same deterministic colours as the account page's portrait, so a
  person looks the same everywhere). Decorative: the name is always written beside it
  or in the control's label. `ring` draws the pink "who is listening on this device"
  ring outside the box, so leave 4 pt of room around a ringed one.

**Whose connections.** Everything here is the person listening's: Home hands
`HouseRow` the active profile's connections (`useProfileConnections`), and
Settings > Household and sharing renders one `HouseSharingRow` per connection of the
active profile whose server has `household`, under a "Listening in the house" heading
(a note when none of them offers it, once every server has answered). See
[Profiles](profiles.md#visible-and-background-connections).

## Testing

`house-model.test.ts` (the rules above), `house-row.test.tsx`,
`in-the-house-card.test.tsx`, `house-sharing-row.test.tsx` and
`person-avatar.test.tsx` beside the components; the hooks' gating and polling in
`src/api/hooks-household.test.tsx`; the client calls in `client.test.ts`.
