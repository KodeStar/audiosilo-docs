---
title: You, Settings and Account
description: "The You hub (src/components/you/): its routing and sections, Your listening (the stats model and the react-native-svg charts), Year in listening (the story, the /year root modal, sharing a card as an image under the /web CSP), Settings (src/components/settings/) and a server's Account page (src/components/account/)."
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
| Account | `AccountSection({ connectionId? })` | `src/components/account/` |

The user-facing behaviour is in the User Guide:
[You and your listening](/users/listening/you), [Year in listening](/users/listening/year-in-listening),
[Settings](/users/listening/settings) and [Your account on a server](/users/listening/account).

## The hub and its routes

`/you?section=stats|year|journal|settings|account` is `src/app/(app)/(me)/you.tsx`, a
re-export of `YouHub` (`src/components/you/you-hub.tsx`). The rules are the pure
`you-model.ts`:

- `parseYouSection(raw)`: absent, unknown or repeated is `stats`.
- `youSectionsFor(layout)`: a phone's segmented control offers all five sections (it has
  no top bar); tablet and desktop offer Stats, Year in listening and Journal, because
  Settings is the top bar's gear and Account the profile menu. A link to `settings` or
  `account` still renders there, with no segment chosen.
- `youSectionLabelKey` / `youTitleKey`: "Year" on a phone, "Year in listening" in the
  wide sub-nav; the phone's large title follows the section (`navigation.setOptions`),
  the wide sub-nav keeps "You".
- `youSectionParams(next)`: the params a switch writes with `router.setParams` (Stats is
  the bare `/you`; leaving the Journal drops its `tab`).

The section control is `SubNavSections tab="(me)"`, so on tablet and desktop it is
published into the sub-nav ([Sub-nav sections and actions](overview.md#sub-nav-sections-and-actions)).
Stats, Year and Account are plain columns with no scroller or gutters of their own: the
hub puts them in a `TabPageScroll` (`src/components/shell/tab-page-scroll.tsx`: the page
gutters, the mini player's room and the iOS tab bar's inset). The Journal and Settings
bring their own scrolling, through the same scroller.

The Me tab's destination in `TABS` (`src/components/shell/destinations.ts`) has
`root: '/you'`, `labelKey: 'nav.me'` ("Me" on the tab bar), `wideLabelKey: 'nav.you'` and
`wideIcon: 'chart'` ("You" in the top bar), and `rootParams: ['section', 'tab']`, so the
cold-link cleanup keeps the hub's section and the Journal's tab. `TOP_BAR_TABS` includes it.

**Opening the hub.** `youHref(section?, journalTab?)` (`src/lib/paths.ts`) builds the
link; open it only through `openYou(section)` / `openJournal(tab)` (`src/lib/open.ts`,
also on `useOpen`), never `pushInShell`. They pop the Me tab to its root
(`popTabToRoot`) rather than pushing a copy (see
[the router rules](overview.md#routing-rules)). `/journal?tab=` (the array-group
route `journal.tsx`) also renders the Journal for older links.

**Settings** is a page of the array group (`src/app/(app)/(home,library,search,offline,me)/settings.tsx`),
`/settings?section=`, pushed on the current tab through `openSettings(section?)` by the
top bar's gear, the profile menu and the palette's Go to. Back returns where the listener
was, and a cold link lands in Home. On the Settings page already, `openSettings` only
moves the pane.

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
  hands the browser the URL itself, with no header), **never** a `blob:` copy (expo-image
  makes one when it fetches with a header), which `connect-src 'self'` would refuse; `data:` URLs are kept as they are, the drawing is a
  `data:` SVG image and the PNG comes out of `canvas.toBlob`.
- A failed capture is retried once with the covers drawn as plain title blocks
  (`coversOff`, `PlainCover`), so one unreadable image can't cost the whole card.

## Settings (`src/components/settings/`)

`SettingsContent` holds every app setting, **each in exactly one pane**; the Downloads
page's Automatic downloads card and the series page bind the same store values as
shortcuts, never a second copy. The rules are the pure `settings-model.ts`:

- Groups and panes: **Listening** (`playback`, `sleep`, `downloads` - "Up next and
  downloads"), **App** (`appearance`, `language`, `household`), **Servers** (`accounts`,
  `support`). `settingsGroups(supportAvailable)` drops Support where
  `isSupportAvailable()` says the build can't link to it (Apple builds). There is no
  Accessibility pane: the app has no setting of its own for it, and the style guide says
  not to show a switch that does nothing. Household is a flagged notice until profiles
  ship.
- `parseSettingsSection`: `preferences`, absent, unknown or a hidden pane is the first
  pane (`playback`); `accounts` is the signed-in servers. `sectionParam` writes the bare
  page for the first pane.
- `settingsLayout(width, phone)`: from a **measured** 720 px (`SPLIT_MIN`) a grouped
  section nav beside one pane's card; narrower, every pane stacked under its group's
  heading, scrolled once to the pane a link names. Inside a card, a wide control sits
  beside its label from 560 px (`INLINE_MIN`).

The pane bodies (`settings-panes.tsx`, `SettingsPaneBody`) use the same store keys as the
rest of the app; `SettingRow` /
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
| Pair another device: `api.pair()`, the QR, a countdown from arrival (`PAIRING_TTL_MS`, the server's 10-minute `pairingTTL`), Copy link on web, Share on native, Make a new code once expired | `PairDeviceCard`, `usePairing` | - |
| Signed-in devices: sessions only, this device first (`signedInSessions`), app, platform, last seen (`lastSeen`) | `DevicesSection` | `my_devices` |
| Personal API keys: list, create in a dialog, reveal once, revoke with a confirm | `ApiKeysSection`, `useApiKeysManager`, `ApiKeyCreatedModal` | `api_keys` (a notice when it's `false`); hidden for a demo account |
| Sign out of the server | `useSignOut`, `SignOutConfirm` | - |

**The current device's row never offers a sign-out**: `canRevoke` refuses `current`,
because revoking its own token would kill it before the app's sign-out teardown (save the
final position, flush the queued progress) could run. This device signs out only through
`useSignOut`, which warns a password-less account first (with an offer to set one) and
counts the downloads that signing out deletes. Another device's row signs out through
`useRevokeMyDevice` after a confirm, and a toast says what happened (signed out, already
gone, or the server didn't answer).
