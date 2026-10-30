---
title: You, Settings and Account
description: "The You hub (src/components/you/): its routing and sections, Your listening (the stats model and the react-native-svg charts), Year in listening (the story, the /year root modal, sharing a card as an image under the /web CSP), Settings (src/components/settings/), the Household section, and a server's Account page (src/components/account/)."
---

The **You** destination is the Me tab's root: one hub over the listener's own data and
the app's preferences. Its sections are separate modules that meet only at an exported
section component, so each can be read (and tested) on its own:

| Section | Component | Module |
|---|---|---|
| Stats ("Your listening") | `StatsSection()` | `src/components/you/stats/` |
| Year ("Year in listening") | `YearSection()` | `src/components/you/year/` |
| Journal | `JournalScreen` (`embedded` on a phone) | `src/components/journal/` ([The Journal](journal.md)) |
| Settings | `SettingsContent({ section?, onSectionChange?, embedded? })` | `src/components/settings/` |
| Household (also the `/household` page) | `HouseholdPage({ embedded })` (`embedded` on a phone) | `src/components/household/` ([Household page and members](household.md)) |
| Account | `AccountSection({ connectionId? })` | `src/components/account/` |
| Upcoming (also the `/upcoming` page; only while a server offers it) | `UpcomingContent({ embedded })` (`embedded` on a phone) | `src/components/upcoming/` ([Upcoming releases](state-and-data.md#upcoming-releases)) |

The user-facing behaviour is in the User Guide:
[You and your listening](/users/listening/you), [Year in listening](/users/listening/year-in-listening),
[Settings](/users/listening/settings), [Your household](/users/listening/household), [Your account on a server](/users/listening/account) and [Upcoming releases](/users/listening/upcoming).

## The hub and its routes

`/you?section=stats|year|journal|settings|household|account|upcoming` is `src/app/(app)/(me)/you.tsx`, a
re-export of `YouHub` (`src/components/you/you-hub.tsx`). The rules are the pure
`you-model.ts`:

- `parseYouSection(raw, moduleKeys?)`: one of the hub's own sections, or an active
  module's section key (`moduleKeys`, from `youModuleSections`; see
  [Player modules](state-and-data.md#player-modules-srcmodules)); anything else
  (absent, unknown, repeated, an off module's key) is `stats`.
- `youSectionsFor(layout, moduleKeys?)`: an active module's sections follow the hub's
  own on every form factor (none yet). A phone's segmented control offers all six sections (it has
  no top bar), Household between Settings and Account; tablet and desktop offer Stats,
  Year in listening, Journal and Household (`WIDE_SECTIONS`; from v2.5.1, since a link to
  `?section=household` opened a hub with no segment chosen), because Settings is the top
  bar's gear and Account the profile menu. The profile menu, Settings and Home's house row
  still push the `/household` page, and the quick search's Go to lists Household once, as
  its own entry. A link to `settings` or `account` still renders there, with no segment
  chosen.
- `youSectionLabelKey` / `youTitleKey`: "Year" on a phone, "Year in listening" in the
  wide sub-nav; the phone's large title follows the section (`navigation.setOptions`),
  the wide sub-nav keeps "You".
- **Upcoming** (`section=upcoming`, 2.6.0) is the hub's own section but offered only
  while `useUpcomingAvailable()` is `true` (a server advertises `upcoming` for a user who
  is not a kid there), so it rides with the modules' sections: `youExtraSections(upcoming,
  modules)` puts it first among them (`UPCOMING_SECTION`, a key no module can take), after
  the hub's fixed sections on every form factor. A link to it while the flags still load
  opens Stats. It is the same `UpcomingContent` as the page, so it ends with the
  [calendar card](state-and-data.md#the-upcoming-calendar) too.
- `youSectionParams(next)`: the params a switch writes with `router.setParams` (Stats is
  the bare `/you`; leaving the Journal drops its `tab`).

The section control is `SubNavSections tab="(me)"`, so on tablet and desktop it is
published into the sub-nav ([Sub-nav sections and actions](overview.md#sub-nav-sections-and-actions)).
Stats, Year, Household and Account are plain columns with no scroller or gutters of their own: the
hub puts them in a `TabPageScroll` (`src/components/shell/tab-page-scroll.tsx`: the page
gutters, the mini player's room and the iOS tab bar's inset). The Journal and Settings
bring their own scrolling, through the same scroller.

The Me tab's destination in `TABS` (`src/components/shell/destinations.ts`) has
`root: '/you'`, `labelKey: 'nav.me'` ("Me" on the tab bar), `wideLabelKey: 'nav.you'` and
`wideIcon: 'chart'` ("You" in the top bar), and `rootParams: ['section', 'tab']`, so the
cold-link cleanup keeps the hub's section and the Journal's tab. `TOP_BAR_TABS` includes it.

**Opening the hub.** `youHref(section?, journalTab?)` (`src/lib/paths.ts`) builds the
link (`section` is one of the hub's own, `CoreYouSection`; a module's key is no link
target); open it only through `openYou(section)` / `openJournal(tab)` (`src/lib/open.ts`,
also on `useOpen`), never `pushInShell`. They pop the Me tab to its root
(`popTabToRoot`) rather than pushing a copy (see
[the router rules](overview.md#routing-rules)). `/journal?tab=` (the array-group
route `journal.tsx`) also renders the Journal for older links.

**Settings** is a page of the array group (`src/app/(app)/(home,library,search,offline,me)/settings.tsx`),
`/settings?section=`, pushed on the current tab through `openSettings(section?)` by the
top bar's gear, the profile menu and the palette's Go to. Back returns where the listener
was, and a cold link lands in Home. On the Settings page already, `openSettings` only
moves the pane.

**Household** is the same kind of page, `/household`, pushed through `openHousehold()`;
the phone hub's Household segment renders the same `HouseholdPage`. See
[The page](household.md#the-page) for every way in.

**The year story** on a phone is the root modal `/year` (`src/app/year.tsx` →
`YearStoryScreen`), opened with `router.push(yearHref({ year?, connection?, card? }))`
like the player and the end credits. It never navigates into the shell.

## Your listening (`src/components/you/stats/`)

`StatsSection` shows **one server's** listening, in **that server's time**. The server is
chosen by `useStatsServer` (`use-stats-server.ts`, shared with Year in listening) on the
pure `statsServerChoice`: the servers with `user_stats` true are the
choices (a picker shows only with two or more); the listener's pick holds while it keeps
stats, else the default connection, else the first that keeps stats. A server without
the flag gets a calm `Notice`, never an error. The section is keyed by the server, so a
switch starts clean.

It reads:

| Hook | Feeds |
|---|---|
| `useMyListening('1y', cid)` | the header's this week, the week tile and its delta, the current streak, the listening calendar, the hours per week (the same cache entry Home's This week card reads) |
| `useMyStats('year', cid)` | the longest streak, the daily average, the listening clock (`hour_weekday`), the rank lists, the finished shelf, the year banner |
| `useListeningGoal(cid)` | the goal tile |
| `useSetListeningGoal` / `useClearListeningGoal` | the goal tile's -/+ (one `PUT /me/goal` per step) and clear |

The rules are the pure, tested `stats-model.ts`, all against `today = serverToday(...)`
of the response, never the device's clock: `weeklyTotals` / `weekComparison` (rolling
seven-day windows ending today, the same "this week" as Home), `longestStreak`,
`dailyAverage` (zeros included), `calendarGrid` and `levelScale` (53 Monday-first weeks;
a day's darkness against the 95th percentile of the listener's days, so one marathon
doesn't wash the rest out), `clockSummary` (hours of the day summed over weekdays, peak
windows at 75 % of the busiest hour, wrapping midnight), `niceAxis`, `rankRows` (top
five), `nextGoal` / `suggestedGoal` (the -/+ step grid: ones to 12, twos to 40, then
fives, within 1-1000; a first goal from this year's pace, at least 12), `statsColumns` /
`columnWidth` (columns by the **measured** width, since the Up next drawer can take
300-480 px of a desktop) and `libraryForName`.

**Charts are `react-native-svg` drawings, no chart library**: `ListeningCalendar`,
`ListeningClock` and `WeeklyBars`. Each is one `image` with an `accessibilityLabel`
sentence, and reads without hover: `ChartPointer` reports the web pointer or a tap in the
chart's own coordinates, the pure hit tests (`calendarCellAt`, `petalAt`, `barAt`) pick
the item, and `ChartTip` draws the tooltip.

**Rank rows** open the author, narrator or series page through `useOpen`. The stats name
only the field value, not a library, so `libraryForName` guesses one: for an author, the
library of one of their top or finished books, else the library most of the year's books
came from, else the server's first library.

## Year in listening (`src/components/you/year/`)

`useYearStory(cid, range)` builds the story of one year on one server: `range` is `'year'`
(this year, server time) or a past `'YYYY'`. It reads `useMyStats(range)` and, for this
year, the running streak (`useMyListening('1y')`) and the goal (`useListeningGoal`), and
returns `loading | unsupported | error | empty | ready` (with the cards and their copy).
A server without `user_stats` is `unsupported`, never an error.

- `buildYearCards` (`year-model.ts`, pure) makes the cards in order - `hours`, `books`,
  `book`, `voice`, `clock`, `streak`, `people`, `summary` - and leaves out any card
  without data. `yearHasStory`: under an hour of listening (`MIN_STORY_SECONDS`) with no
  book finished is the calm empty state. The words are `year-copy.ts` (`cardCopy`), the
  colours `story-themes.ts`.
- **Earlier years**: the wire has no "which years have data", so `useStoryYears`
  (`year-probes.ts`) is one query over the pure `findStoryYears`, which asks
  `/me/stats?range=YYYY` year by year (the same cache entry the story reads, so a picked
  year shows at once), carrying on while a year or the year before it (its `previous`
  totals) has data, and stopping after two quiet years, a year that can't be read, or 25
  years back (`OLDEST_YEAR` is 2000). A past year never changes, so the list and each
  year's stats are kept for the session (`staleTime: Infinity`).
- **One renderer**: `StoryCard` draws a card for the stage, the full-screen story and the
  share. `StoryStage` lays the progress bars and the tap zones (a third for previous, two
  thirds for next) over it, and the section and the full-screen story share
  `useStoryStage` (`use-story-stage.ts`); `useStoryPlayer` is the clock (`CARD_MS` = 6 s, a plain timer
  for the advance plus a Reanimated bar). The pure `story-model.ts` says what holds it: a
  share in progress, a native screen reader, a press, hover or keyboard focus. Reduced
  motion makes it still (no advance). Next on the last card wraps to the first.
- **Layout**: tablet and desktop put the stage (360 wide) beside a column with the title,
  how it works, the privacy line, the pickers, `YearThumbs` and "Share this card", from a
  **measured** 720 px; under it below that. A phone shows an intro (the banner, pickers,
  thumbnails) whose Play the story or a thumbnail pushes `/year`.

### Sharing a card as an image

`useShareCard` captures the card on screen (`cardRef`, the same `StoryCard`) as a
**1080 x 1920 PNG** and shares it. One share at a time; while it runs the story holds
its card. There is **no share link** (that would need a server endpoint).

- **Native** (`share-card.ts`): `react-native-view-shot` `captureRef` to a temporary
  file, then `expo-sharing`'s `shareAsync` (`image/png`).
- **Web** (`share-card.web.ts`): `html-to-image`, loaded on first use from its own chunk
  (`load-rasteriser.ts`), rasterises the card's DOM node through an SVG
  `foreignObject` on a canvas, so the browser itself lays the type out (view-shot's web
  engine, html2canvas, re-laid text out and clipped lines). The PNG is then shared with
  the Web Share API when `navigator.canShare({ files })` allows, else downloaded
  (`downloadBlob`); a share the browser refuses (Safari wants it close to the tap) falls
  back to the download, and a download toasts the file name.
- **Under the `/web` CSP** (`connect-src 'self'`, `img-src 'self' data: blob:`; see
  [Web UI](../server/web-ui.md)): the fonts and covers `html-to-image` inlines are
  same-origin `fetch()`es, so covers on the web are plain `?token=` URLs (`BookCover`
  hands the browser the URL itself through `CoverImage`, a plain `<img>` that sends no
  header), **never** a `blob:` copy (expo-image makes one when it fetches with a header),
  which `connect-src 'self'` would refuse; `data:` URLs are kept as they are, the drawing is a
  `data:` SVG image and the PNG comes out of `canvas.toBlob`.
- A failed capture is retried once with the covers drawn as plain title blocks
  (`coversOff`, `PlainCover`), so one unreadable image can't cost the whole card.

## Settings (`src/components/settings/`)

`SettingsContent` holds every app setting, **each in exactly one pane**; the Downloads
page's Automatic downloads card and the series page bind the same store values as
shortcuts, never a second copy. The rules are the pure `settings-model.ts`:

- Groups and panes: **Listening** (`playback`, `sleep`, `downloads` - "Up next and
  downloads"), **App** (`appearance`, `language`), **Servers** (`accounts`,
  `support`). The App group (`HOUSEHOLD_LINK_GROUP`) ends with a link to the Household
  page. `settingsGroups(supportAvailable)` drops Support where
  `isSupportAvailable()` says the build can't link to it (Apple builds). There is no
  Accessibility pane: the app has no setting of its own for it, and the style guide says
  not to show a switch that does nothing. Household is a page of its own (see
  [Household page and members](household.md)).
- `parseSettingsSection`: `preferences`, absent, unknown or a hidden pane is the first
  pane (`playback`); `accounts` is the signed-in servers. `household`
  (`isHouseholdSection`) is the Household page: the route replaces itself with
  `/household`. `sectionParam` writes the bare
  page for the first pane.
- `settingsLayout(width, phone)`: from a **measured** 720 px (`SPLIT_MIN`) a grouped
  section nav beside one pane's card; narrower, every pane stacked under its group's
  heading, scrolled once to the pane a link names. Inside a card, a wide control sits
  beside its label from 560 px (`INLINE_MIN`).

The pane bodies (`settings-panes.tsx`, `SettingsPaneBody`) use the same store keys as the
rest of the app (the Playback pane ends with `EffectsSettings`, the Smart speed and Voice
boost switches the speed sheet also mounts: see
[Smart speed and Voice boost](audio-effects.md#the-settings-and-the-ui)); `SettingRow` /
`SettingsCard` (`settings-row.tsx`) are the row and card. The Accounts and devices pane
is `ConnectionsSection` (`src/components/account/connections-section.tsx`), whose remove
flow (`useConnectionRemoval`: a confirm when the server has downloads on the device,
then `teardownBeforeTokenRevoke`, a best-effort logout and `removeConnection`) is owned
by `SettingsContent` so its dialog state survives the layout switch.

## Account (`src/components/account/`)

`AccountSection({ connectionId? })` is one server's account. `/account?connection=<cid>`
(`account.tsx` in the array group, inside `ContentScope`) renders it, with a breadcrumb
back to Settings or the You section it was opened from (`accountParentKey`; none from
the profile menu or a cold link, where the chrome's Back does it); the phone hub's Account section renders it without an id: the default
server, with a switcher (a segmented control of the signed-in servers) when there are
several (`resolveAccountCid`). It is a non-scrolling column (the host scrolls it, in a
`TabPageScroll`), keyed by the server so a switch starts with closed editors.

Each block is gated on its capability, so an older server shows less, quietly:

| Block | Component | Gate |
|---|---|---|
| Identity: name, "@user · role on server", the signed-in device count | `IdentityCard` | the count needs `my_devices` |
| Password: set or change in a dialog that lifts above the keyboard | `PasswordCard`, `PasswordDialog`, `usePasswordEditor` | hidden for a demo account |
| Pair another device: `api.pair()`, the QR, a countdown from arrival (`PAIRING_TTL_MS`, the server's 10-minute `pairingTTL`), Copy link on web, Share on native, Make a new code once expired | `PairDeviceCard`, `usePairing` | hidden for a kid's account (`isKidAccount`) |
| Signed-in devices: sessions only, this device first (`signedInSessions`), app, platform, last seen (`lastSeen`) | `DevicesSection` | `my_devices` |
| Personal API keys: list, create in a dialog, reveal once, revoke with a confirm | `ApiKeysSection`, `useApiKeysManager`, `ApiKeyCreatedModal` | `api_keys` (a notice when it's `false`); hidden for a demo or kid's account |
| Sign out of the server | `useSignOut`, `SignOutConfirm` | - |

**The current device's row never offers a sign-out**: `canRevoke` refuses `current`,
because revoking its own token would kill it before the app's sign-out teardown (save the
final position, flush the queued progress) could run. This device signs out only through
`useSignOut`, which warns a password-less account first (with an offer to set one) and
counts the downloads that signing out deletes. Another device's row signs out through
`useRevokeMyDevice` after a confirm, and a toast says what happened (signed out, already
gone, or the server didn't answer).

**A lost phone takes the household with it.** When another device's row carries
`member_sign_ins` (capability `household_members`: the listener's household members
signed in on that device, `memberSignIns` in `account-model.ts`), the confirm adds
"Also sign out Evie and Ellis on that device" (`joinList` in `src/lib/names.ts`),
**ticked**, fresh for every device. Confirming sends `useRevokeMyDevice({ id,
alsoMembers })` (`alsoMembers` false when there are no members), and the toast counts
`members_signed_out`.

**A household member's account page** (`isKidAccount`, `managerName` in
`src/lib/account.ts`): the page reads `/me` when it opens (`useFreshUser`), so a
`member_kind` the owner changed since sign-in shows. A kid's account gets a Password
card with no button ("A kid's account has no password. Adam signs it in on a new
device."), no Pair another device card (the server refuses a kid's pairing, `403
kid_account`; the owner sets up its devices from the Household page) and no API keys
section; a grown-up member's Password card names who set the account up. The page hands
the password card and the sign-out confirmation its connection, so they name the owner
as this device knows them (`useManagerName`). The sign-out warning for a member without a
password names their owner instead of an invite (`signOutWarning`). (A kid's house
sharing row, on the Household page, is off and disabled (`house.share.kid`): see
[Listening in the house](listening-in-the-house.md).)
