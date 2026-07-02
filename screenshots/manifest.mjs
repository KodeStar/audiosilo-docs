// The single source of truth for documentation screenshots.
//
// Every entry corresponds to a file under static/img/screenshots/ and every
// doc page embeds images ONLY from this list. capture.mjs generates the real
// captures; placeholders.mjs generates a styled placeholder for anything the
// automated pipeline can't reach (so the docs build never breaks). Add an
// entry here first, then reference it from a page, then run the pipeline.
//
// `capture` says which script produces it:
//   'web'     — capture-web.mjs (web player via a warmed demo session)
//   'admin'   — capture-admin.mjs (admin console + public pages)
//   'manager' — capture-manager.mjs (Wails dev server; falls back to placeholder)

export const SHOTS = [
  // ── Web player (desktop 1440x900, dark) ────────────────────────────────
  {file: 'web-player/home.png', capture: 'web', title: 'Web player — Home', hint: 'home screen with Continue Listening + Recently Added shelves'},
  {file: 'web-player/library.png', capture: 'web', title: 'Web player — Library', hint: 'library browse grid'},
  {file: 'web-player/book-detail.png', capture: 'web', title: 'Web player — Book detail', hint: 'book page with chapters + Listen button'},
  {file: 'web-player/player.png', capture: 'web', title: 'Web player — Now playing', hint: 'player with chapter list, speed, seek bar'},
  {file: 'web-player/search.png', capture: 'web', title: 'Web player — Search', hint: 'search results for a query'},
  {file: 'web-player/settings.png', capture: 'web', title: 'Web player — Settings', hint: 'settings screen (account, recovery, language)'},
  {file: 'web-player/downloads.png', capture: 'web', title: 'Web player — Downloads', hint: 'offline downloads screen'},
  {file: 'web-player/connect.png', capture: 'web', title: 'Web player — Connect', hint: 'connect/pairing screen with code field'},
  {file: 'web-player/demo.png', capture: 'web', title: 'Web player — Demo mode', hint: 'the /web/demo landing screen'},

  // ── Web player (phone 430x932 portrait, dark) — stands in for the mobile app UI
  {file: 'web-player/phone-home.png', capture: 'web', title: 'Phone — Home', hint: 'phone-width home screen'},
  {file: 'web-player/phone-book-detail.png', capture: 'web', title: 'Phone — Book detail', hint: 'phone-width book page'},
  {file: 'web-player/phone-player.png', capture: 'web', title: 'Phone — Now playing', hint: 'phone-width full-screen player'},

  // ── Admin console + public server pages ────────────────────────────────
  {file: 'admin/login.png', capture: 'admin', title: 'Admin — Login', hint: 'admin console login form'},
  {file: 'admin/overview.png', capture: 'admin', title: 'Admin — Overview', hint: 'stats/overview section'},
  {file: 'admin/libraries.png', capture: 'admin', title: 'Admin — Libraries', hint: 'libraries section with a library listed'},
  {file: 'admin/detection.png', capture: 'admin', title: 'Admin — Detection browser', hint: 'per-library folder detection override browser'},
  {file: 'admin/users.png', capture: 'admin', title: 'Admin — Users', hint: 'users section'},
  {file: 'admin/user-detail.png', capture: 'admin', title: 'Admin — User detail', hint: 'per-user drawer (role, password, access, invite status)'},
  {file: 'admin/shares.png', capture: 'admin', title: 'Admin — Shares', hint: 'shares section with path rules'},
  {file: 'server/connect-page.png', capture: 'admin', title: 'Connect page', hint: 'public connect page (auth-code box / QR)'},
  {file: 'server/setup-wizard.png', capture: 'admin', title: 'Setup wizard', hint: 'first-run --setup wizard page'},

  // ── Desktop manager (Wails) ─────────────────────────────────────────────
  {file: 'manager/servers.png', capture: 'manager', title: 'Manager — Servers', hint: 'server list home'},
  {file: 'manager/server-detail.png', capture: 'manager', title: 'Manager — Server detail', hint: 'a connected server with its libraries'},
  {file: 'manager/add-server.png', capture: 'manager', title: 'Manager — Add server', hint: 'add/connect server form'},
  {file: 'manager/local-server.png', capture: 'manager', title: 'Manager — Local server', hint: 'create/run a local server panel'},
  {file: 'manager/library.png', capture: 'manager', title: 'Manager — Library browser', hint: 'library file browser'},
  {file: 'manager/import.png', capture: 'manager', title: 'Manager — Import', hint: 'import/organize books view'},
  {file: 'manager/transfers.png', capture: 'manager', title: 'Manager — Transfers', hint: 'transfer queue/settings'},
  {file: 'manager/audible.png', capture: 'manager', title: 'Manager — Audible backup', hint: 'Audible library backup view'},
  {file: 'manager/settings.png', capture: 'manager', title: 'Manager — Settings', hint: 'manager settings form'},
];
