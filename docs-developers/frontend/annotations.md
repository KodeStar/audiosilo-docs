---
title: Bookmarks and notes
description: "The shared annotation modules (src/components/annotations/): the rows, the label chips, the editor requests and what Save sends, the server bounds, the Fell asleep marker, jumping, delete with Undo, and the annotations capability gates."
---

`src/components/annotations/` holds everything a bookmark or a note looks like and
does, shared by the book page's tabs, the player's companion and the
[Journal](journal.md). The pure modules (`labels`, `drift-marker`, `editor-model`,
`order`) have no React; the rest are components and hooks. `index.ts` is the public
surface. The user-facing page is [Bookmarks and notes](/users/listening/bookmarks-and-notes).

## Module map

| File | What it is |
|---|---|
| `editor-model.ts` | Pure: `AnnotationTarget`, `EditorRequest` (+ `editBookmarkRequest`, `editNoteRequest`), `initialBookmarkDraft`, `bookmarkSave`, `noteSave`, `BOOKMARK_NOTE_MAX` (2000), `NOTE_BODY_MAX` (10000) |
| `annotation-editor.tsx` | `AnnotationEditorSheet` (the `PlayerSheet` the host renders) and `AnnotationEditor` (the bookmark or note form) |
| `labels.ts` | Pure: `labelText` (a key's name through `t()`), `toggleLabel` |
| `drift-marker.ts` | Pure: `isDriftBookmark`, `isFellAsleepNote`, `shownNote` |
| `order.ts` | Pure: `byPosition` (book order, ties by id) |
| `chips.tsx` | `TimeChip` (the jump), `LabelChip` (the kicker, a moon for a drift marker), `LabelPicker` (single-select chips) |
| `row-parts.tsx` | `AnnotationRowFrame`, `RowAction` (44 pt touch on native), `RowCover`, `RowMeta` |
| `bookmark-row.tsx`, `note-row.tsx` | `BookmarkRow`, `NoteRow` (+ `NoteMarkdown`) |
| `section-actions.tsx` | `AddBookmarkAction`, `AddNoteAction`, `JournalLink` |
| `use-annotation-actions.ts` | `useJumpTo`, `restoreBookmark`, `restoreNote`, `useDeleteBookmarkWithUndo`, `useDeleteNoteWithUndo` |
| `use-book-place.ts` | `chapterNamer` / `useChapterNamer`, `usePlaceIn` |

The label keys themselves live in `src/api/bookmark-labels.ts`
(`PICKABLE_BOOKMARK_LABELS`, `FELL_ASLEEP_LABEL`, `isBookmarkLabel`), so the sleep
timer can import them without the UI.

## Labels

A label is a **machine key** on the wire, never display text: `quote`, `favourite`,
`relisten`, `funny`, `question` (the five a listener picks, in picker order) and
`fell_asleep` (the sleep timer's, never offered). The server checks only the shape
(`^[a-z][a-z0-9_]{0,31}$` or `''`), so a newer client may store a key this player
doesn't know: `isBookmarkLabel` guards every read, `labelText` names a known key and
returns null for anything else (no chip), and an unknown key in an edit draft is kept
as it is so an untouched label is never sent back. `toggleLabel(current, picked)`
makes the picker one label or none: tapping the chosen one clears it, and picking any
label replaces whatever was there (`fell_asleep` included).

## The editors

An **`EditorRequest`** says what the sheet opens on, and carries its own book, so it
works for a book that isn't playing, on any connection:

```ts
type AnnotationTarget = { connectionId: string; libraryId: number; path: string };
type EditorRequest =
  | { kind: 'bookmark'; target: AnnotationTarget; position: number; bookmark?: Bookmark }
  | { kind: 'note'; target: AnnotationTarget; position: number; note?: Note };
```

Callers open one with `usePlayerSheets.getState().openEditor(request)` (see
[Player sheets](player-ui.md#player-sheets-and-overlays)); the active
`PlayerSheetHost` renders `AnnotationEditorSheet`, a bottom sheet on a phone, a
floating sheet on a tablet and a dialog on a desktop. The form is keyed per request
(`requestKey`), so a new request starts a fresh draft. Without a client for the
target's connection it shows the companion's "server isn't connected" state.

**What Save sends** is decided by the pure planners, given the connection's
`annotations` flag:

| Planner | Result | When |
|---|---|---|
| `bookmarkSave` | `add` (`useAddBookmark`) | a new bookmark, on every server: `{ position, note }`, plus `label` only when `annotations === true` and it's a known label |
| | `update` (`useUpdateBookmark`) | an edit on an `annotations` server, sending only what changed: the trimmed `note`, and `label` (`''` clears it) |
| | `unchanged` / `unsupported` | an edit that changes nothing (just close) / an edit without `annotations` (toast `annotations.editUnsupported`) |
| `noteSave` | `add` (`useAddNote`) | a new note at the request's position, on every server (the API always took one) |
| | `update` (`useUpdateNote`) | an edit on an `annotations` server: the body only, so the note keeps its place |
| | `empty` / `unchanged` / `unsupported` | nothing written (Save is disabled; Delete removes a note) / same body / no `annotations` |

The inputs enforce the server's bounds with `maxLength`: a bookmark's note at most
`BOOKMARK_NOTE_MAX` (2000) characters, a note's body at most `NOTE_BODY_MAX` (10000).
Without `annotations` the label picker is hidden, an edit's fields are read-only and
its Save is disabled. Edits go through `useCapabilityMutation`, so a server whose flag
is false (or not yet known) gets nothing and the hook rejects with `CapabilityError`
(see [Capability-gated writes](state-and-data.md#the-listeners-own-state-player-redesign-phase-1b)).
An edit writes its answer into the book's list (`storeAnswer`) and patches the
across-books pages in place before refreshing them.

## Adding

- **One tap** (`addBookmarkHere`, `src/components/player/player-shortcuts.ts`): the
  player's bookmark pill, the docked bar and the **B** key. It adds at the live place
  and toasts with an **Add note** action (only with `annotations`, read with
  `cachedCapability`) that opens the editor on the new bookmark.
- **`AddBookmarkAction`** ("Bookmark 17:26:50", the top of a Bookmarks tab): one tap
  through `addBookmarkHere` while its book is the loaded one; for any other book it
  opens the editor at `usePlaceIn(target)` so the listener sees where it lands first.
- **`AddNoteAction`** ("Note at 17:26:50"): always opens the note editor at
  `usePlaceIn(target)`: the live place once the engine has placed the loaded book
  (`selectPlacedBookKey`), else the saved place, else 0. It re-renders every second
  while the book plays, so it lives in its own small leaf.

## Rows

`BookmarkRow` and `NoteRow` are self-contained: each acts on its own book through
its `connectionId`, so the same row works on a book's page, in the companion and in
the Journal's list across servers. Both use `AnnotationRowFrame` (a hairline above
every row but the first):

- **Lead:** the `TimeChip` (a note's in the `community` tone), or, when `book` is
  passed (a list across books), the book's cover opening its page on that tab, with
  the chip moved into the body.
- **Body:** the label kicker, the note (a Quote in quotation marks and italics; a
  drift marker per `shownNote`) or the note's markdown (`NoteMarkdown`, one
  `useMarkdown` per note), then `RowMeta`: the title (across books), the chapter
  (`useChapterNamer`) and the age, and the server's name when a list spans servers.
- **Actions:** Edit (`pen`, only with `annotations`) and Delete (`trash`), both quiet
  muted glyphs: delete offers Undo rather than a confirmation, so a list never turns
  into a column of red.

**Jumping** (`useJumpTo`) goes through the player's own paths: the loaded book
`seekBook`s (a deliberate seek, so the undo chip follows); another book on a phone
pushes `/player` at the position, unless the player is already on top (read at the
press with `topRootRoute`); otherwise `startBookInPlace`. The companion passes its
own `onJump`, which seeks the playing book in place.

**Deleting** is immediate (`useDeleteBookmarkWithUndo` / `useDeleteNoteWithUndo`),
so other devices and the pins agree at once and nothing waits on a timer an app
suspend could stop. The toast's Undo re-creates the row (`restoreBookmark`,
`restoreNote`): the same place, note or body and label, on the same book through its
own connection; the server gives it a new id and date.

**Chapters** (`chapterNamer`): the book's chapters at offsets recomputed from the file
durations (`chapterStartsOf`, as the book page does), named as the player names them;
a book without chapters names nothing. `useChapterNamer` reads the cached
`useChapters` on the target's own connection.

## The Fell asleep marker

The sleep timer's bookmark (`drift-controller.ts`; see
[Fell asleep](sleep-timer.md#fell-asleep-drift-controllerts)) is labelled `fell_asleep`
on an `annotations` server; on an older one it can only be told by its note, which
was translated when it was made and stored as text. `isDriftBookmark` therefore
accepts the label, or no label at all with the automatic note in **any** of the six
languages (`isFellAsleepNote`, built from every locale's
`player.sleepTimer.fellAsleepNote`). A bookmark with another label is the listener's
own, whatever its note says. `shownNote` hides the automatic note, so the row says
"You drifted off around here" in today's language; a note the listener wrote on it
shows instead. The Journal's Fell asleep filter and its Diary strips use the same
predicate.

## Where the capability matters

| Without `annotations` | With it |
|---|---|
| bookmarks and notes add (no label sent: an older server rejects the unknown field with a `400`) | labels sent and shown |
| no Edit action; an edit's form is read-only | `PATCH /bookmarks/{id}`, `PATCH /notes/{id}` |
| no Add note on the one-tap toast | Add note opens the editor |
| no "See all in your journal" link; the Journal's lists say the server can't list them | `GET /me/bookmarks`, `GET /me/notes` |

The wire side is in the [API reference](../server/api/reference.md) and
[State & data](state-and-data.md#bookmarks-notes-and-the-journal-phase-4).
