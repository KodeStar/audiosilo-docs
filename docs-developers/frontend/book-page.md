---
title: The book page
description: "The book page module map (src/components/book/): the measured layout, the hero and its primary action, the action row, the tabs (Chapters with the whole-book timeline, Details, the community tabs), the aside, and how a chapter row or a pin starts the book."
---

The book page is `/book/[libraryId]?connection=&path=&tab=`. The route file
(`src/app/(app)/(home,library,search,offline,me)/book/[libraryId].tsx`) only names
`BookScreen`. Everything else lives in `src/components/book/`. Its rules sit in two
pure, tested modules (`book-page-model.ts`, `book-details-model.ts`), so the components
only draw. The user-facing tour is [A book's page](/users/listening/book-page).

## Module map

| File | What it is |
|---|---|
| `book-page.tsx` | `BookScreen`, `useCanonicalBookPath`, `useRefreshPendingListing` and `BookPage` (described under the table) |
| `book-page-model.ts` | Pure: `bookPageLayout`, `titleScale`, `heroSubtitle`, `primaryAction` / `primaryLabel`, `chapterList`, `rowAt`, `timelineStarts`, `placeLine`, `heroEyebrow`, `bookFacts`, `startedAt`, `listeningFigures` |
| `book-tab-panel.tsx` | `BookTabPanel`: the active tab's panel (the tab row is the page's) |
| `book-hero.tsx` | `BookHero`: the `CoverWash`, crumbs slot, eyebrow, title, subtitle, byline, facts, the place (or the finished badge and the stars), then the actions and footer slots |
| `hero-actions.tsx` | `HeroActions`: the primary button, `DownloadControl`, Read the ebook (`canRead`), the Up next menu, favourite, Add to collection (in the menu when stacked), and `BookActionsMenu` with `omit` |
| `book-crumbs.tsx` | `BookCrumbs`: the library, each folder above the book (links), the book's own folder or file name |
| `book-chapters-tab.tsx` | `BookChaptersTab`: "The whole book" (`BookTimeline` + legend + axis) and the rows |
| `book-details-tab.tsx` + `book-details-model.ts` | `BookDetailsTab`: the playback notice, the files table, the path; `fileRows`, `visibleFiles`, `playbackMode`, and the About card's `aboutContent`, `labelGroups` and `languageName` |
| `book-about.tsx` | `BookAbout`: the About card, its genre and tag chips, and `openLabelBooks` |
| `book-aside.tsx` | `BookAside`: `BookAbout`, Other versions (`BookVersions`), Your listening |
| `book-skeleton.tsx` | The loading layout |

`book-page.tsx` holds four pieces:

- `BookScreen` wraps the page in `ContentScope`, so it reads the route's own
  `?connection=`.
- `useCanonicalBookPath` handles a route given a track file or disc folder inside a
  book, which `/item` resolves to the book. Before the page renders, it moves the route
  to the book's own `rel_path`. It uses `setParams`, so it adds no history entry, and it
  seeds the book path's item query. The page asks for progress, plays and casts by the
  book path only.
- `useRefreshPendingListing` handles a book opened from a browse row flagged
  `pending_book`. The page's read indexes that book, so the hook marks the cached
  listing stale, and going back shows the book, not "Not scanned yet".
- `BookPage` holds the data (`useBook`, `useChapters`, `useBookMeta`,
  `useBookProgress`, `useBookAnnotations`, the history query), the tab row, the play
  calls and the layout.

Shared pieces it uses from elsewhere:

- `Notice` (`src/components/ui/notice.tsx`), the icon, title and body notice with an
  `info` / `success` / `warning` tone. The Downloads page uses it too.
- `useBookRating` (`src/components/player/use-book-rating.ts`), the hero's stars and
  the end credits'.
- `usePlayBook`, the one play path (see
  [The primary action and the action row](#the-primary-action-and-the-action-row)).

The tabs' list is `src/components/library/book-tabs.ts`. The per-tab sections
`BookmarksSection`, `NotesSection` and `HistorySection` are in
`src/components/library/`, built from the shared rows in
[`src/components/annotations/`](annotations.md). The community blocks are in
`book-meta.tsx`.

## Layout by the measured width

`bookPageLayout(useLayout(), width)` reads the page's **measured** width (the root
`ScrollView`'s `onLayout`). It does not use the window, because the desktop Up next
drawer takes 300-480 px and can leave a desktop page phone-narrow. Before the first
measure it trusts the window class.

| Measured width | Hero | Body |
|---|---|---|
| phone class, or under 600 (`HERO_SIDE_MIN`) | cover above the text (`min(230, 64%)`), title `sm` | one column: aside, then tabs |
| 600 to 827 | cover beside the text: 220, level with the text's top (`heroAlign: 'start'`), title `md` | one column |
| 828 (`BODY_COLUMNS_MIN`) to 1099 | as above | tabs, with the aside as a right-hand column (300) |
| 1100 and up | cover beside the text: 300, with the text resting on its foot (`'end'`), title `lg` | tabs, with the aside as a right-hand column (300, or 340 from 1200) |

`BODY_COLUMNS_MIN` is computed, not picked. It adds up the body's padding on both
sides (24 each), the narrowest tab column worth having (440, a chapter row with its
start time and length), the column gap (40) and the narrowest aside (300). An 834
portrait tablet takes the two columns.

`roomy` (600 and up) adds the chapter rows' start time and the files table's columns.
`titleScale` steps the title down once past 48 characters. The tab panel renders inside
the page's own `ScrollView`, never a nested vertical scroller.

## The hero

- **Wash:** `CoverWash` from the book's `cover_color`, or a neutral wash from
  `mutedForeground` without one. Text never sits on raw cover colour.
- **Eyebrow** (`heroEyebrow`): "Series · Book N" (a link through `useOpen().openSeries`),
  else "library · server".
- **Subtitle** (`heroSubtitle`): the server's `subtitle` under the title, unless the
  title already holds it, ignoring case ("Dune: The Desert Planet" over "The Desert
  Planet"). Nothing shows on an older server.
- **Byline:** author and narrator as links (`openAuthor` / `openNarrator`). The
  narrator is plain text where `browse_people` is `false`.
- **Facts** (`bookFacts`): length; chapters, or "N parts of M min"; the audio (codec,
  "N FORMAT files" or the format, size); the published year; the publisher (the
  server's `publisher`, else the community recording's); and "server › library". A
  fact the book doesn't have is left out.
- **The place** of a book that is loaded or in progress: `percentHeard`, `placeLine`
  ("Chapter 23 of 81" or "Part 3 of 12", nothing for files) on the row `rowAt` finds,
  `useBookTimeLeft`, and the progress bar, which is the page's one pink thing.
- **Finished:** a finished book that is not loaded gets the finish badge instead, dated
  from `listeningFigures`. With `ratings` on, it also gets `RatingStars` through
  `useBookRating`. The hook waits (`ready: false`) until the saved rating is known,
  and sends its note back with the new value, since a `PUT` replaces the whole rating.

## The primary action and the action row

`primaryAction({ status, loaded, live, chapter })` picks the primary button:

| Button | When |
|---|---|
| **Pause** | this book is loaded and its transport is live |
| **Resume chapter N** (or **Resume**) | the book is loaded or in progress. N is the real chapter the place is in, shown only for a `chapters` list of more than one |
| **Listen again** | the book is finished |
| **Start listening** | a new book |
| **Listen** | the saved progress is still unknown (`progressQuery.isPending`) |

Both ways to play go through the app's one play path, `usePlayBook`
(`src/components/player/use-play-book.ts`). Its route is the pure `playRoute`
(`play-route.ts`).

- The primary calls it with `{ toggle: true }`. A loaded book pauses or plays in place
  on every layout; it never restarts.
- A chapter row, a timeline tap or a step key calls it with `{ at: jump }`. A `Jump` is
  a `BookPlace`, `{ position?, track? }`, with a track for a file of unknown length.
  - On a phone it opens the full player there, unless the player is already on top.
    The route applies the jump once, also to the loaded book.
  - On a tablet or desktop it jumps the loaded book there (`seekBook`, or
    `goToTrack`) and plays on, or starts this book there in place
    (`startBookInPlace`).

`usePlayBook` rejects when the book can't start. The error is a `PlaybackStartError`
when the engine couldn't start it (see
[The player store](playback.md#the-player-store-storets)), or the fetch's own error
when the book couldn't be fetched. The page then toasts
`library.bookActions.playFailed` through `playFailedToast`, with the reason as the
description when there is one.

**Another device's place** (Sync v2, `listening_sync`). When `offerOf` finds a place
for the book (see
[Offering another device's place](playback.md#offering-another-devices-place-sync-v2)),
`ListeningOfferLine` (`listening-offer.tsx`) shows
`On {device}: {chapter, time} · Play from there` under the actions, in the hero's
footer. The place is measured from where the primary would play from
(`resumePosition`). The line says "On another device" when the server has no name.
**Play from there** answers the offer (`answerOffer`) and plays the book there
(`{ at: { position } }`). Answering acknowledges the row's version and notes the
place, so it isn't offered again. Nothing shows on a server without the flag.

`HeroActions` lays the row out after the primary:

| Control | Gate | Notes |
|---|---|---|
| `DownloadControl` | - | an outline button per state: Download for offline, "N% · Cancel" with a `ProgressRing`, **Downloaded** (a menu with the size and Remove download), Retry download. Disabled where this device can't keep the book |
| Read the ebook | `canRead` (see [Read on the book page](reader.md#read-on-the-book-page)) | an outline button after the download (its own row when stacked) that pushes `readerHref` to the `/read` modal; see [The ebook reader](reader.md) |
| Up next menu | `queue` | Play next (at position 0, with an Undo that puts it back where it was); Add to the end / Remove from Up next (`useQueueActions`) |
| Favourite | - | ink, never pink |
| Add to collection | `collections`, not stacked | the book menu's dialog. When stacked it is the menu's own item instead |
| `BookActionsMenu` | its items' own | `omit` (`MENU_OMIT`, `['play', 'queue', 'collect', 'download']`) leaves Mark as finished / not finished and More in this series. Stacked, it also keeps Add to collection (`MENU_OMIT_PHONE` is the same list without `'collect'`). It renders nothing when that leaves no item. For an admin whose book has generated characters or recaps it adds **Regenerate characters and recaps** (`extra`), then each active [player module's](state-and-data.md#player-modules-srcmodules) `bookActions` (none yet) |
| Generate characters and recaps | `useGenerate`'s `offer === 'generate'` | an outline button after the others (its own row when stacked), for an admin a Bridge can generate for (see [Generating characters and recaps](#generating-characters-and-recaps)) |

When the hero is stacked (under 600 measured), the primary takes its own row and the
rest stay on **one** row. Add to collection moves into the menu, so the download slot
(`flex-1`) takes the room the icon buttons leave, enough for its word on a phone. The
download control gets `short`: "Download", and just "Cancel" while it runs, with its
words ending in "..." rather than wrapping. The menu opens as a sheet. The footer holds
`DownloadProgress`, `GenerateStatus`, `GenerateCovered` (only while `covered`) and
`TranscodeNote`.

### Generating characters and recaps

Generating characters and recaps (`src/components/bridge/`) is the player's first
admin-only UI.

#### Who sees it

`mayGenerate(user, server)` (`bridge-model.ts`, pure and tested) allows it for an admin
who isn't a demo account, a household member or a kid. The server must have
`capabilities.bridge` and `capabilities.metadata` on, and its `bridge.features` must
hold `sidecars`.

`useGenerate` reads `generateOffer`, the offer rule the console shares (see
[Who sees the action](../bridge/generating.md#who-sees-the-action)).
`communityCoverage` says what the community has. `useGenerate` gives the page one of
two answers:

- `offer`: `generate` or `regenerate`.
- `covered`, when the community has both characters and recaps. It is a boolean, and
  `offer` is then `null`.

`covered` mounts `GenerateCovered` in the hero's footer: "The community already has
characters and recaps for this book" with **See characters**. That button selects the
Characters tab and scrolls the page to the tabs (`openCharacters`, not animated under
reduced motion). `generateOffer` never gives `covered` without `mayGenerate`, so a
listener never sees the line.

No offer shows until the book's `/meta` and its jobs are known (`metaAnswered`; a
failed lookup is no answer). No offer shows while a job shows its status either.

#### The dialog

`GenerateDialog` reads
[`GET /admin/bridge/estimate`](../server/api/reference.md#get-apiv1adminbridgeestimate).
It shows what the run reads, the transcription and the agent cost (for every book it
queues), "On this server", and the earlier books of the series (ticked, and queued
first).

The dialog blocks the submit when:

- the library isn't writable;
- the estimate's `open_job` is a `chapters.detect` job. The book's chapters are still
  being found, which the server refuses with `409 detect_open`
  (`bridge.generate.detectOpen`);
- the estimate's `open_job` is a `sidecars.contribute` job. The console's "Share with
  the community" is filing the book's characters and recaps, which the server refuses
  with `409 contribute_open` (`bridge.generate.contributeOpen`, kind
  `SIDECARS_CONTRIBUTE` in `src/lib/bridge-jobs.ts`). An older server sends neither.

It also holds the submit back when the agent is known not to be ready
(`blockedReason`), which it can tell only when the estimate carries the Bridge's
`figures`.

The console hides its action while either job is queued or working. A parked job gives
way, and so does a share held while the `contributions` module is off. The player
keeps the button and says why in the dialog instead. A `409 detect_open` or
`409 contribute_open` from the queue (a job queued after the estimate) toasts the same
words (`bridgeRefusalKey`). When the refused book is an earlier one of the series
(`otherBook`), it toasts the plain failure.

A refused queue reads the estimate again. While its `open_job` is a share, the dialog
reads it again every 10 seconds while the share is claimed or running, and every minute
while it is queued (`estimatePollInterval`, foreground only), so the hold lifts once
the share ends. A detection is not waited for. A share held while the `contributions`
module is off is not the `open_job`, so it holds nothing back; the generate job cancels
it.

The dialog always queues `{source: "auto", contribute: "local"}` (`GENERATE_PARAMS`).
The player never contributes.

#### Status and refresh

`GenerateStatus` sits under the actions while a job is open or failed:

- **Open:** the stage (`bridge.stage.*`, including `chapter_detecting`, "Finding the
  chapters in the narration"), "12 of 40", the time left and Cancel. The early chapters
  save sends its `writing` and `rescanning` steps with an engine stage before `ready`;
  `stageOf` reads them as that stage.
- **Parked:** the park in the player's own words (`bridge.park.*`, by `parkReason`;
  `chapters_not_detected` is "The Bridge couldn't find the chapters in the
  narration."), and when it tries again by itself. A book waiting for an ASR worker
  says "It carries on by itself" (`parkEndsByItself`); any other park says "Open the
  console to fix it".
- **Failed:** the error and Try again.

`useBridgeJobs` polls the book's jobs every 10 seconds while one is claimed or running,
and every minute while one is parked. It polls only while the surface is focused and
the app is in the foreground. When an answer sees a job that wrote the book's files
reach `done` (`latestDone`: `sidecars.generate`, `sidecars.describe` or
`chapters.detect`), it reads the book's `/meta`, item and chapters again
(`refreshAfterFinish`). The tabs, and any chapters found in the narration, then
appear.

The companion's empty Who's who and Story so far mount `GenerateOffer`, the same button
and status.

## The tabs

`bookTabs(input)` (`src/components/library/book-tabs.ts`, pure and tested) decides
which tabs exist, in this order:

| Tab | Shown when |
|---|---|
| `chapters` (labelled *Chapters*, *Parts* or *Files*) | the list has rows, or the chapters are still loading |
| `recaps` | the work has recaps, a *visible* whole-book summary, **or** earlier books in its series |
| `characters` | the work has characters, **or** earlier books in its series |
| `bookmarks`, `history`, `notes` | always (user-creatable, so reachable from empty) |
| `series` | at least one non-empty series rail |
| `details` | always |

The selected tab is held as an **intent** (`useState`, seeded by `parseBookTab(?tab=)`).
Render falls back to the first existing tab (`tabs.includes(tab) ? tab : tabs[0]`), so
a tab that disappears when data settles never renders blank. Labels come from
`TAB_LABEL_KEY`, which reuses the section strings
(`library.{bookmarks,history,notes}.title`, `book.meta.characters`,
`book.details.title`). Counts show where the data is already in hand, never fetched
for a count:

- the list's rows;
- `useBookAnnotations`' bookmarks and notes (`ANNOTATIONS_STALE_MS`, 60 s, since every
  write invalidates them anyway);
- the characters met (`splitCharacters(...).visible`).

A summary counts as *visible* only when it will actually render (`summaryIsVisible`:
an `in_short`, or an `ending` on a finished book). The page computes it once and passes
it to both `bookTabs` and `BookMetaRecapsTab`, so the tab and its panel can't disagree.
The page holds the spoiler reveal (`showSpoilers`), shared by Recaps and Characters.
The gate is `listeningProgressFor` over the corrected chapter starts and
`useListeningPosition` (see
[Spoiler gating](state-and-data.md#spoiler-gating-srccomponentslibrarymeta-gatingts)).

`BookTabPanel` renders the active tab:

- `BookChaptersTab`, or five skeleton rows while the list is empty.
- The community tabs, with their `Attribution` (`communityCredit`; none for a
  dimension generated on this server). A tab whose content came from the server's own
  files gets a `GeneratedMark` ("Generated on this server") at its head. The Recaps
  tab places its chips and credit by `recapMarks` (see
  [Enriched book metadata](state-and-data.md#enriched-book-metadata)).
- `BookmarksSection` and `NotesSection`, both `AnnotationSection` (see
  [Bookmarks and notes](annotations.md)).
- `HistorySection`, `BookMetaSeriesTab` and `BookDetailsTab`.

`BookTabPanel` also builds the community cover resolver (`useCommunityCover`) and hands
it to the Series, Recaps and Characters tabs as `coverFor` (see
[Community covers](state-and-data.md#community-covers-clientcommunitycoverurl)).

### The Chapters tab

`chapterList` builds the rows in the units the player navigates (`book-queue`):

- the real chapters at their **corrected** whole-book starts (`chapterStartsOf`,
  recomputed from the file durations, because the server's `book_offset` is unreliable
  for some books);
- for one long file with no real chapters (none, or a lone whole-book one), the
  player's own parts (`synthesizeChapters` at the listener's `virtualChapterInterval`),
  with a `Notice` saying why;
- else the files, each jumping by `track`. A file after one of unknown length has a
  `NaN` start, and `timelineStarts` then gives the timeline nothing.

The chapters answer's `chapters_source` can end the list with a quiet caption. Both
captions are `SOURCE_CAPTION` entries drawn by `SourceLine`:

| `chapters_source` | Meaning | Caption | Key and `testID` |
|---|---|---|---|
| `"community"` | the server fitted a community recording's chapter list onto the audio (see [Community chapters](../server/community-chapters.md)) | a globe icon and "Chapters from the AudioSilo community database" | `book.chapters.community`, `book-chapters-community` |
| `"generated"` | a Bridge found them in the narration of a book with no chapters of its own (see [Generated chapters](../server/community-chapters.md#generated-chapters)) | the server glyph in the caption's colour and "Chapters found in the narration on this server" | `book.chapters.generated`, `book-chapters-generated` |

The caption shows only when the rows are real chapters. `BookChaptersTab` takes the
answer's `source` only while `list.kind === 'chapters'`. Nothing else changes; the
chapters have the same shape either way.

"The whole book" is the player's `BookTimeline` for **any** book, with pins from
`useBookAnnotations` (`pinsOf`):

- While the book is loaded, its place follows the player
  (`timelinePosition(selectBookPosition)`), and a tap or drag `seekBook`s.
- Otherwise it draws the saved place, and a tap jumps through `usePlayBook`.
- A step key goes to the next chapter start or back to the start of the current one
  (`nextSegmentStart`, `previousSegmentStart`, the transport's own rules).

`scrubTarget` keeps a tap from landing in the last 30 s. The current row is
`rowAt(rows, position)`; the page passes it in, and every row counts as heard once the
book is finished. A row is memoised on its few values: its state and the bookmark
glyph. A bookmark inside the book marks the row `rowAt` puts it in. So a moving place
redraws only the rows that change.

### The Details tab

- `playbackMode({ downloaded, transcoded })` gives `local` for a download on this
  device, and `converted` when `useNeedsWebTranscode` says the web player converts it
  (the same rule playback uses; web only). Anything else is `direct`.
- `fileRows(book, chapterData)` takes the chapters response's files, else the item's,
  else the book as one file. The codec is the book's (one probe per book). "about N
  kbps" is `bitrateKbps(size, duration)` (`src/lib/format.ts`), which is size × 8 /
  duration / 1000, rounded, or nothing when either is unknown. `visibleFiles` folds
  past `FILES_SHOWN` (6).
- The path: "library/" + `rel_path`, `selectable`, with the note that progress is keyed
  on it.

## The aside

`BookAside` stacks up to four cards. From `BODY_COLUMNS_MIN` they form a right-hand
column (see [Layout](#layout-by-the-measured-width)); below it they sit between the
hero and the tabs.

- **About** - `BookAbout` (`book-about.tsx`) draws the pure `aboutContent(book, work,
  recording, t)`. `work` is the `bookMetaWork` value (the matched work, or an unmatched
  book's generated one). It is the one source of every work-level field, the credit
  included, and `BookAbout` takes it as a required prop. `recording` (the match's,
  from `matchedMeta`) gives the recording facts.
  - The text is picked once into `source` (`AboutSource`), the first that exists:
    1. `'community'`: the community's `community_description`. It is CC BY-SA, so the
       server's `attribution` is rendered beside it with **Improve this**, which opens
       `attribution.source_url` or the work's `web_url`.
    2. `'own'`: the server's `description` (from `/item` only) or the work's core
       description.
    3. `'generated'`: the description a Bridge generated on this server
       (`work.generated_description`, read only when `work.generated.description` is
       set). It wears the "Generated on this server" chip (`GeneratedChip`, `testID`
       `about-generated-mark`) under the eyebrow, and never the credit or
       **Improve this**.
    4. `'fallback'`: with none of these, a sentence naming the author and narrator.
  - The detail rows:
    - the publisher (the server's `publisher`, else the recording's);
    - the release date (the recording's, else the book's `published`);
    - the work's first publication;
    - the server's `language`, a code named through `Intl.DisplayNames` in the app's
      language where the platform has it (`languageName`), else shown as sent;
    - abridged yes or no (the server's `abridged`, else the recording's). Absent means
      unknown, so there is no row.
  - Then `labelGroups`: the book's `genres`, then its `tags`, each once by `labelKey`,
    as chips under their names. A chip calls `openLabelBooks`, which selects the
    book's library in `useLibrarySelection` and opens the Library tab's root
    (`openLibraryRoot`) on `libraryBooksHref({ genre | tag })`.
  - A matched book without community text keeps "View on AudioSilo Meta". Long text
    folds past six lines with Show more.
- **Other versions** - `BookVersions`: every other copy (`useBookCopies`) with where it
  lives and its quality, each opening that copy's page. Nothing shows when there is
  none.
- **Your listening** - `listeningFigures`, the figures the records hold, never
  estimated:
  - listened time from this book's history spans (`listeningSummary`, the end credits'
    rule), shown from a minute;
  - the book's speed (`useBookSpeed`);
  - started (`progress.started_at`, else the earliest span: `startedAt`) and finished
    (`finished_at`), with dates through `formatRecordDate` (`src/lib/format.ts`);
  - `smartSpeedSaved`, what Smart speed saved on this book on this device
    (`useBookTimeSaved`), shown from a whole second (see
    [Time saved](audio-effects.md#time-saved-srcplaybacktime-savedts)).

  `listeningFigures` is null for a book neither started nor finished. The history is
  only fetched then, and kept fresh for ten minutes (`HISTORY_STALE_MS`; a span this
  device records refreshes it).
- **In the house** - `InTheHouseCard` (`src/components/house/`), last. It shows only
  while the listener shares and someone who shares is on this book; see
  [Listening in the house](listening-in-the-house.md).
