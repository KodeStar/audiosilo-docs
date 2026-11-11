---
title: Listening in the house
description: "The player side of Listening in the house: the household hooks and their polling rules, the pure house model, and the Home row, the book page's In the house card and the sharing switch in src/components/house/."
---

Listening in the house is an opt-in server feature (capability `household`). People on
one server who choose to share see what the others who share are listening to. The
server owns every privacy rule (see
[what other people see](../server/auth-and-security.md#listening-in-the-house-what-other-people-see)),
and the wire is in the
[API reference](../server/api/reference.md#listening-in-the-house). The player only
decides what to show of the answer, where, and how often to ask.

## The wire and the hooks (`src/api/`)

- **Types** in `types.ts`: `HouseholdSettings`, `HouseListeningState`,
  `HouseListeningRow` and `HouseListening`.
- **Client calls** in `client.ts`: `client.household(signal?)`,
  `client.setHousehold(share)` and `client.houseListening(signal?)`. The last one reads
  a missing `listening` as `[]`.

The hooks are in `hooks.ts`. Each is gated on `household` through `useCapabilityQuery`
or `useCapabilityMutation`, so a server without the flag is never asked.

- **`useHousehold(cid?)`** reads the caller's own `{ share_listening }` under
  `qk.household(cid)`, with `staleTime: Infinity`. It never goes stale by time, because
  this device only changes it through `useSetHousehold`, which stores the server's
  answer. The foreground refresh (`refreshAfterResume`) and a reconnect still refetch
  it, like every active query. A change made on another device therefore shows the next
  time the app or the web tab comes back to the foreground.
- **`useSetHousehold(cid?)`** is the switch. While the flag is off or unknown, it
  rejects with `CapabilityError` and sends nothing, so it is never a network failure. It
  stores the server's answer under `qk.household(cid)` and invalidates
  `qk.houseListening(cid)`. Sharing is reciprocal, so a change of the caller's own
  choice opens or empties the house. A demo account's `PUT` is a `403`.
- **`useHouseListening(cid?, { enabled })`** reads the house, `qk.houseListening(cid)`.
  `enabled: false` sends no request at all.

### When the house is asked

Polling only; there is no realtime channel.

- **Every minute while the app is in the foreground** (`HOUSE_POLL_MS`, 60 s).
  `housePollInterval()` answers `false` unless `AppState` is `active`, so a suspended
  or hidden native app asks nothing. React Query's own focus check covers a hidden web
  tab. The foreground refresh reads the house again on return, which restarts the
  interval. `useCapabilityQuery` has a `refetchInterval` option for this.
- **Only while the listener shares.** `useHouseRows(cid, active)`
  (`src/components/house/use-house-rows.ts`) asks `useHousehold` first. It enables
  `useHouseListening` only when `share_listening` is `true`. Most listeners never turn
  sharing on, and they never poll.
- **Only while the surface is on screen.** `active` is `useIsFocused()` of the Home
  screen or the book page, so a Home kept mounted under another tab stops asking.

Loading, an error and "not sharing" all read as no rows. The house is an extra, so it
never shows an empty section or an error banner.

## The house model (`house-model.ts`)

Pure and tested (`house-model.test.ts`):

- **`visibleRows(house, sharing)`** returns nothing while the caller doesn't share,
  because a cached answer can outlive turning sharing off. Otherwise it returns one row
  per person (the first, newest, wins), in the server's newest-first order.
- **`rowsForBook(rows, libraryId, path)`** returns the housemates on one book. The path
  is the identity.
- **`houseWhen(row, today)`** passes `playing` and `paused` through as the server says
  them. For `recent` it returns the **local calendar day** of the newest save, as of
  `today`:
  - `today` is the local day's start from `useToday()`, which ticks over just after
    midnight.
  - The day is worked out by hand, because neither `Intl.RelativeTimeFormat` nor
    `formatRelative`'s own strings count in calendar days.
  - The result is `today`, `yesterday`, or `earlier` for a clock that disagrees with the
    server's 24 hours. A save in the future, or one that doesn't parse, counts as today.
- **`chapterName(row, t)`** returns the chapter's title, else "Chapter N" from
  `chapter_index` (for a chapter titled "Track 01"), else nothing.
- **`houseCopy(row, today, t)`** returns three strings:
  - the title (the server's, else the path's last segment);
  - the state line ("Listening now · Chapter 4");
  - one sentence for a screen reader ("sam is listening to Unsouled, Chapter 4").
- **`houseCardWidth(width, layout)` and `HOUSE_GAP`** size the Home grid (a
  `HOUSE_GRID` spec for the shared `gridMetrics`). Cards are at least 250 wide and 12
  apart, one per row on a phone. They are laid out by the row's **measured** width,
  because the Up next drawer can take part of the window.

Strings live in the `house` i18n namespace.

## The components (`src/components/house/`)

### `HouseRow({ connections })`

Home's "Listening in the house", placed after "Next in your series" and before the
smart shelves (`home-screen.tsx`). It renders one `HomeSection` per connection where
three things hold: the server has `household`, the listener shares, and someone else who
shares listened in the last day. Otherwise it renders nothing.

- The section's sub is "`<server name>` · shared by choice".
- Its action, "Sharing settings", opens the Household page (`openHousehold()`).
- Each `HouseCard` shows the person's avatar and name, the book's title, the state line
  and the book's cover. A static green dot follows the name while they are listening
  now. Tapping the card opens the book on that connection (`openBook`).

### `InTheHouseCard({ connectionId, libraryId, path })`

The book page's "In the house" card, last in the aside (`book-aside.tsx`). It lists the
housemates on **this** book, each with an avatar, the name and the state line, read from
the same cached answer as Home. It renders nothing when nobody is on the book.

### `HouseSharingRow({ connectionId, first? })`

"Share what I'm listening to with the house" for one connection, with the privacy
sentence "Your current book shows on the Home page of other people on `<server>` who
share theirs too. Off by default."

- It is hidden when the connection is gone.
- It does not check `household` itself. The Household page renders it only for servers
  that advertise the flag (see [Whose connections](#whose-connections)).
- The switch moves at once (optimistic) and settles on the server's answer. A refusal
  puts it back with a toast, and a demo account gets its own words.
- While it loads or saves, the switch waits disabled. A failed load offers Retry.

### The avatars

The avatars are `Portrait` with `kind="user"` (`src/components/series/portrait.tsx`): a
gradient disc with white initials, coloured from the name. It is the account page's own
portrait, so a person looks the same everywhere. The avatar is decorative, because the
name is always written beside it or in the control's label.

Pass `ring` (true or false) wherever the pink "who is listening on this device" ring can
show. The portrait then keeps `RING_ROOM` (4 pt) around itself and draws the ring in it,
so ringing one never moves the layout. Leave `ring` out where no ring ever shows.

### Whose connections

Everything here belongs to the person listening:

- Home hands `HouseRow` the active profile's connections (`useProfileConnections`).
- The [Household page](household.md) (`HouseSharing`) renders one `HouseSharingRow` per
  connection of the active profile whose server has `household`, under a "Listening in
  the house" heading. When none of them offers it, once every server has answered, it
  shows a note instead.

A kid household member never shares and never sees the house. The server answers
`{ sharing: false, listening: [] }` and refuses its `PUT` (`403 kid_account`).
`HouseSharingRow` shows a kid's account (`isKidAccount`) the switch off and disabled,
with "A kid's account can't share what it listens to." in place of the privacy sentence.
A `kid_account` refusal reads the same, never the demo account's words. See
[Profiles](profiles.md#visible-and-background-connections).

## Testing

- `house-model.test.ts` (the rules above), `house-row.test.tsx`,
  `in-the-house-card.test.tsx` and `house-sharing-row.test.tsx`, beside the components.
- The avatar and its ring in `src/components/series/portrait.test.tsx`.
- The hooks' gating and polling in `src/api/hooks-household.test.tsx`.
- The client calls in `client.test.ts`.
