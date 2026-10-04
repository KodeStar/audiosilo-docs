// The single source of truth for documentation screenshots.
//
// Every entry corresponds to a file under static/img/screenshots/ and every
// doc page embeds images ONLY from this list. capture.mjs generates the real
// captures; placeholders.mjs generates a styled placeholder for anything the
// automated pipeline can't reach (so the docs build never breaks). Add an
// entry here first, then reference it from a page, then run the pipeline.
//
// `capture` says which script produces it:
//   'web'     - capture-web.mjs (web player via a warmed demo session)
//   'admin'   - capture-admin.mjs (admin console + public pages)
//   'meta'    - capture-meta.mjs (the meta.audiosilo.app site via a local metaserve)
//   'manager' - capture-manager.mjs (Wails dev server; falls back to placeholder)

export const SHOTS = [
  // ── Web player (desktop 1440x900, dark) ────────────────────────────────
  {file: 'web-player/home.png', capture: 'web', title: 'Web player - Home', hint: 'home screen with Continue Listening + Recently Added shelves'},
  {file: 'web-player/library.png', capture: 'web', title: 'Web player - Library', hint: 'library browse grid'},
  {file: 'web-player/book-detail.png', capture: 'web', title: 'Web player - Book detail', hint: 'book page with chapters + Listen button'},
  {file: 'web-player/player.png', capture: 'web', title: 'Web player - Now playing', hint: 'player with chapter list, speed, seek bar'},
  {file: 'web-player/search.png', capture: 'web', title: 'Web player - Search', hint: 'search results for a query'},
  {file: 'web-player/settings.png', capture: 'web', title: 'Web player - Settings', hint: 'settings screen (account, password, language)'},
  {file: 'web-player/downloads.png', capture: 'web', title: 'Web player - Downloads', hint: 'offline downloads screen'},
  {file: 'web-player/connect.png', capture: 'web', title: 'Web player - Connect', hint: 'connect/pairing screen with code field'},
  {file: 'web-player/demo.png', capture: 'web', title: 'Web player - Demo mode', hint: 'the /web/demo landing screen'},

  // ── Web player (phone 430x932 portrait, dark) - stands in for the mobile app UI
  {file: 'web-player/phone-home.png', capture: 'web', title: 'Phone - Home', hint: 'phone-width home screen'},
  {file: 'web-player/phone-book-detail.png', capture: 'web', title: 'Phone - Book detail', hint: 'phone-width book page'},
  {file: 'web-player/phone-player.png', capture: 'web', title: 'Phone - Now playing', hint: 'phone-width full-screen player'},

  // ── Admin console (admin-ui, desktop 1440x900 dark unless noted) + public server pages
  {file: 'admin/login.png', capture: 'admin', title: 'Admin - Sign in', hint: 'the console sign-in page, signed out'},
  {file: 'admin/overview.png', capture: 'admin', title: 'Admin - Overview', hint: 'home: listening now (live sessions), totals, recent listening, books per library, server card'},
  {file: 'admin/palette.png', capture: 'admin', title: 'Admin - Command palette', hint: 'the ⌘K palette open over the overview'},
  {file: 'admin/overview-phone.png', capture: 'admin', title: 'Admin - Phone', hint: 'overview at phone width (400x860) with the bottom tab bar (light)'},
  {file: 'admin/libraries.png', capture: 'admin', title: 'Admin - Libraries', hint: 'Library > Libraries: library cards with covers, status, folder, book count'},
  {file: 'admin/library-add.png', capture: 'admin', title: 'Admin - Add library', hint: 'the Add library dialog with the server folder picker open (Browse)'},
  {file: 'admin/detection.png', capture: 'admin', title: 'Admin - Folder detection', hint: 'a library\'s Folder detection dialog (Automatic / Always one book / Separate books)'},
  {file: 'admin/books.png', capture: 'admin', title: 'Admin - Books', hint: 'Library > Books: Recently added + Continue curating shelves over the cover grid'},
  {file: 'admin/books-table.png', capture: 'admin', title: 'Admin - Books table', hint: 'Library > Books in the Table view (?view=table)'},
  {file: 'admin/book.png', capture: 'admin', title: 'Admin - Book page', hint: 'a book\'s page: hero, Details card with provenance markers (one Edited field)'},
  {file: 'admin/book-match.png', capture: 'admin', title: 'Admin - Match with community metadata', hint: 'the match dialog open on a book page with its possible matches'},
  {file: 'admin/authors.png', capture: 'admin', title: 'Admin - Authors', hint: 'Library > Authors: author tiles with book counts'},
  {file: 'admin/series.png', capture: 'admin', title: 'Admin - Series', hint: 'Library > Series: one card per series with its spines'},
  {file: 'admin/folders.png', capture: 'admin', title: 'Admin - Folders', hint: 'Library > Folders: the folder tree and the selected folder\'s detection choice'},
  {file: 'admin/palette-search.png', capture: 'admin', title: 'Admin - Palette search', hint: 'the ⌘K palette searching books, authors and series for "alice"'},
  {file: 'admin/people.png', capture: 'admin', title: 'Admin - People', hint: 'People > People: person cards with what each is listening to and their devices'},
  {file: 'admin/person.png', capture: 'admin', title: 'Admin - Person', hint: 'sam\'s page, Access tab (?tab=access)'},
  {file: 'admin/person-listening.png', capture: 'admin', title: 'Admin - Person listening', hint: 'maya\'s page, Listening tab: her listening year, In progress, Finished, Recent sessions (1440x1100)'},
  {file: 'admin/devices.png', capture: 'admin', title: 'Admin - Devices', hint: 'People > Devices: every signed-in device with its app, last seen and address, and Sign out'},
  {file: 'admin/invite.png', capture: 'admin', title: 'Admin - Invite ready', hint: 'the invite card dialog after Invite someone: QR code, link, code'},
  {file: 'admin/invites.png', capture: 'admin', title: 'Admin - Invites', hint: 'People > Invites: the invite table'},
  {file: 'admin/shares.png', capture: 'admin', title: 'Admin - Shares', hint: 'People > Shares: list + the selected share\'s folders and people'},
  {file: 'admin/settings.png', capture: 'admin', title: 'Admin - Settings', hint: 'Server > Settings: the community metadata card'},
  {file: 'admin/health-issues.png', capture: 'admin', title: 'Admin - Library health', hint: 'Health > Issues: category cards over the "Files that couldn\'t be read" list (a provisioned Inbox library supplies the issues)'},
  {file: 'admin/health-duplicates.png', capture: 'admin', title: 'Admin - Likely duplicates', hint: 'Health > Issues ?issue=duplicate: a group\'s two copies side by side'},
  {file: 'admin/health-jobs.png', capture: 'admin', title: 'Admin - Jobs', hint: 'Health > Jobs: running now, schedules, and the history with the newest scan\'s log open (1440x980)'},
  {file: 'admin/library-edit.png', capture: 'admin', title: 'Admin - Edit library', hint: 'the Edit library dialog: folder, Scan automatically (daily) + Time, Skip these files and folders'},
  {file: 'admin/activity.png', capture: 'admin', title: 'Admin - Activity', hint: 'Activity > Overview (30 days): stat tiles, listening hours per day, the year and hour x weekday heatmaps (1440x1240)'},
  {file: 'admin/activity-live.png', capture: 'admin', title: 'Admin - Live now', hint: 'Activity > Live now: two devices playing (one transcoding) and one paused'},
  {file: 'admin/activity-sessions.png', capture: 'admin', title: 'Admin - Sessions', hint: 'Activity > Sessions: the session table, newest first'},
  {file: 'admin/activity-year.png', capture: 'admin', title: 'Admin - Year in listening', hint: 'Activity > Year in listening: this year\'s story and calendar (1440x1100)'},
  {file: 'server/connect-page.png', capture: 'admin', title: 'Connect page', hint: 'public connect page (auth-code box / QR)'},
  {file: 'server/setup-wizard.png', capture: 'admin', title: 'Setup wizard', hint: 'first-run --setup wizard page'},

  // ── AudioSilo Meta site (meta.audiosilo.app; desktop 1440x900, dark) ────
  {file: 'meta/home.png', capture: 'meta', title: 'Meta - Home', hint: 'search hero, live stats band, latest additions grid'},
  {file: 'meta/search.png', capture: 'meta', title: 'Meta - Search', hint: 'search dropdown with grouped work/person/series results'},
  {file: 'meta/work.png', capture: 'meta', title: 'Meta - Work detail', hint: 'a work page with its cover, metadata and multiple recordings'},
  {file: 'meta/characters.png', capture: 'meta', title: 'Meta - Characters', hint: 'the community characters section, one card opened'},
  {file: 'meta/series.png', capture: 'meta', title: 'Meta - Series', hint: 'a series page listing its ordered volumes'},
  {file: 'meta/series-watching.png', capture: 'meta', title: 'Meta - Series (watched)', hint: 'a watched series page: the Watching toggle, "I have this" marks, release dates'},
  {file: 'meta/watching.png', capture: 'meta', title: 'Meta - Watching', hint: 'the /watching page: available + preorder entries with New badges'},
  {file: 'meta/contribute.png', capture: 'meta', title: 'Meta - Contribute', hint: 'the coverage browser (what still needs characters/recaps)'},
  {file: 'meta/import.png', capture: 'meta', title: 'Meta - Import', hint: 'the in-browser library-export diff results'},
  {file: 'meta/languages.png', capture: 'meta', title: 'Meta - Languages', hint: 'the header Languages selector open: every catalogue language with its book count'},
  {file: 'meta/language-prompt.png', capture: 'meta', title: 'Meta - Language suggestion', hint: 'a German browser with nothing stored: "Show only Deutsch audiobooks?" under the header'},
  {file: 'meta/language-search.png', capture: 'meta', title: 'Meta - Search (language filter)', hint: 'the search panel with "Only Deutsch" chosen: the filter line and Search all languages'},

  // ── Desktop manager (Wails) ─────────────────────────────────────────────
  {file: 'manager/servers.png', capture: 'manager', title: 'Manager - Servers', hint: 'server list home'},
  {file: 'manager/server-detail.png', capture: 'manager', title: 'Manager - Server detail', hint: 'a connected server with its libraries'},
  {file: 'manager/add-server.png', capture: 'manager', title: 'Manager - Add server', hint: 'add/connect server form'},
  {file: 'manager/local-server.png', capture: 'manager', title: 'Manager - Local server', hint: 'create/run a local server panel'},
  {file: 'manager/library.png', capture: 'manager', title: 'Manager - Library browser', hint: 'library file browser'},
  {file: 'manager/import.png', capture: 'manager', title: 'Manager - Import', hint: 'import/organize books view'},
  {file: 'manager/transfers.png', capture: 'manager', title: 'Manager - Transfers', hint: 'transfer queue/settings'},
  {file: 'manager/audible.png', capture: 'manager', title: 'Manager - Audible backup', hint: 'Audible library backup view'},
  {file: 'manager/settings.png', capture: 'manager', title: 'Manager - Settings', hint: 'manager settings form'},
];
