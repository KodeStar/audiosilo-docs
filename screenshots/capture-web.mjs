// Captures the web-player documentation screenshots against a locally-running
// AudioSilo server in demo mode (run.sh starts it). Four passes:
//   0. tag two seeded series through the admin API (the LibriVox files carry no
//      series tags, so the Library's Series section and a series page would be
//      empty) - needs ADMIN_PASSWORD, which run.sh passes,
//   1. warm a demo session (seek several books to varied positions so Home looks
//      lived-in - same technique as store/tools/login.mjs in the workspace), then
//      give the demo user an Up next queue, a collection and each WARM book's
//      records (a place, a finish and rating, bookmarks, notes, history, a
//      sleep-timer drift-off) through the API,
//   2. capture desktop, tablet and phone profiles into static/img/screenshots/web-player/,
//   2b. podcasts: run.sh's seeded shows added as a podcast library through the admin API
//      (the Podcasts module on, two shows followed by path), shot as the admin in a fresh
//      browser (the episode fetch, and Find shows' Bridge and directory, stood in for by
//      routes), then removed again,
//   3. the household: three accounts made through the admin API (ADMIN_PASSWORD), and,
//      as one of them, a collection and the kid household member through the player's
//      own API (the grown-up member through the add dialog, or the API when only the
//      Household page shot wants one), driven through the UI for the profiles, Household
//      page, kids mode and house shots and, through a local https proxy, the Cast shot,
//      then deleted again.
import {chromium} from 'playwright';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {mkdir} from 'node:fs/promises';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  CACHE,
  DAY,
  DESKTOP_CONTEXT,
  FIXTURES,
  HOUR,
  MIN,
  PHONE,
  PODCAST_DIRECTORY,
  addHousehold,
  apiClient,
  around,
  firstVisible,
  fitViewportTo,
  imagesLoaded,
  isoAgo,
  pathQuery,
  shoot,
  sleep,
  slug,
  stamp,
  step,
  tid,
  wanted,
} from './lib.mjs';

const BASE = process.env.AS_BASE || 'http://127.0.0.1:8790/web/';
const api = apiClient(new URL(BASE).origin);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH = path.join(CACHE, 'auth.json');

// Series overrides for the seeded books (admin metadata edits: path-keyed, no file
// is touched). Sherlock Holmes takes its canon numbers, so the series page shows the
// gaps (books 1, 2 and 4) the seed doesn't have; Alice is a complete pair.
const SERIES = [
  {author: 'Sir Arthur Conan Doyle', title: 'Adventures of Sherlock Holmes', series: 'Sherlock Holmes', index: '3'},
  {author: 'Sir Arthur Conan Doyle', title: 'Hound of the Baskervilles', series: 'Sherlock Holmes', index: '5'},
  {author: 'Lewis Carroll', title: "Alice's Adventures", series: 'Alice', index: '1'},
  {author: 'Lewis Carroll', title: 'Looking-Glass', series: 'Alice', index: '2'},
];
// Genres added to the seeded books the same way (a label edit adds to what the files
// say), so Library > Books has a Genre filter worth opening (web-player/library-genre.png).
const GENRES = [
  {title: 'Adventures of Sherlock Holmes', genres: ['Mystery', 'Classics']},
  {title: 'Hound of the Baskervilles', genres: ['Mystery', 'Classics']},
  {title: "Alice's Adventures", genres: ['Fantasy', 'Classics']},
  {title: 'Looking-Glass', genres: ['Fantasy', 'Classics']},
  {title: 'Call of the Wild', genres: ['Adventure', 'Classics']},
  {title: 'Scarlet Plague', genres: ['Science fiction']},
  {title: 'Christmas Carol', genres: ['Classics']},
  {title: 'Art of War', genres: ['Non-fiction']},
];

// The demo user's Up next queue and one collection (title substrings of seeded books).
const QUEUE = ['Christmas Carol', 'Adventures of Sherlock Holmes', 'Art of War'];
const COLLECTION = {
  name: 'Victorian evenings',
  description: 'Fog, firelight and something odd at the door.',
  books: ['Christmas Carol', 'Hound of the Baskervilles', 'Adventures of Sherlock Holmes', 'Looking-Glass'],
};

// The desktop Up next drawer starts closed in every capture context, so the shots
// that aren't about it keep the page's full width; the Up next shot opens it.
const drawerClosed = () => {
  try {
    localStorage.setItem('audiosilo.upNext', JSON.stringify({drawerOpen: false}));
  } catch {
    /* storage blocked: the drawer opens, the shots are just narrower */
  }
};

// A capture context: DESKTOP_CONTEXT (1440x900, retina, dark, motion reduced) with
// `options` on top (a viewport, stored auth, a time zone...), the Up next drawer
// closed. `on` is the browser to open it in (the Cast shot has its own).
async function newCaptureContext(options = {}, on = browser) {
  const ctx = await on.newContext({...DESKTOP_CONTEXT, ...options});
  await ctx.addInitScript(drawerClosed);
  return ctx;
}

// The warmed books, oldest first (the last is the most recently played, the first
// Continue listening card the shots open): a title substring of a seeded book (the
// whole title from its start where a capture opens it by name), the fraction of its
// first file to seek to so progress bars vary, and the listener's records the shots
// show (fractions are of the whole book, times are before the run):
// - `place`: the saved place and the start date (half way, not in the last chapter:
//   the docked bar's next-chapter jump needs one after it);
// - `finished`: finished and rated (the start moves back too: a finish can't come
//   before it);
// - `history`: listening spans; `bookmarks` and `notes`;
// - `drift`: the sleep timer's drift-off, a span ending at the saved place with a
//   `fell_asleep` bookmark there, timed so the Journal's Diary pairs them
//   (the frontend's `matchDrifts`).
const WARM = [
  {
    q: 'The Scarlet Plague',
    frac: 0.82,
    finished: {startedAgo: 9 * DAY, finishedAgo: 2 * DAY + 2 * HOUR, rating: 4},
    history: [
      {from: 0.3, to: 0.7, endedAgo: 2 * DAY + 3 * HOUR},
      {from: 0.7, to: 1, endedAgo: 2 * DAY + 2 * HOUR},
    ],
    bookmarks: [{at: 0.6, note: 'The best chapter in the book.', label: 'favourite'}],
    notes: [{at: 0.95, body: 'Loved the ending.'}],
  },
  {q: 'Call of the Wild', frac: 0.18},
  {q: 'Looking-Glass', frac: 0.55},
  // The warm-up leaves this one about six minutes in (40% of its first file), so the
  // drift-off span before the saved place fits there.
  {q: 'Baskervilles', frac: 0.4, drift: {minutes: 5, endedAgo: 2 * MIN}},
  {
    q: 'Alice',
    frac: 0.07,
    place: {at: 0.5, startedAgo: DAY + 3 * HOUR},
    history: [
      {from: 0.2, to: 0.35, endedAgo: DAY + 2 * HOUR},
      {from: 0.35, to: 0.5, endedAgo: 50 * MIN},
    ],
    bookmarks: [
      {at: 0.1, note: 'Curiouser and curiouser!', label: 'quote'},
      {at: 0.22, label: 'relisten'},
      {at: 0.41, note: 'Who is telling this part?', label: 'question'},
    ],
    notes: [{at: 0.3, body: '**Theory:** none of this is really happening.\n\n- check the last chapter'}],
  },
];

// The finished book's page is captured by its title.
const FINISHED_TITLE = WARM.find((w) => w.finished).q;

// The book page's primary button while the book isn't playing: Start listening (a
// new book), Resume / Resume chapter N (in progress), Listen again (finished); plain
// Listen while the saved progress is still unknown.
const PRIMARY_PLAY = /^(start listening|resume( chapter \d+)?|listen again|listen)$/i;

// The sleep timer's automatic bookmark note: the frontend's
// src/i18n/locales/en.json `player.sleepTimer.fellAsleepNote` (run.sh's FRONTEND can be
// a bare web export, so it isn't read from there).
const FELL_ASLEEP_NOTE = 'Fell asleep';

// The signed-in player's connection id and token (the web player keeps the token in
// localStorage under audiosilo.token.<connection id>), for provisioning through the API.
async function playerSession(page) {
  const session = await page.evaluate(() => {
    const prefix = 'audiosilo.token.';
    const key = Object.keys(localStorage).find((k) => k.startsWith(prefix));
    return key ? {cid: key.slice(prefix.length), token: localStorage.getItem(key)} : null;
  });
  if (!session?.token) throw new Error('no player token in localStorage');
  return session;
}

// The demo user's token.
async function demoToken(page) {
  return (await playerSession(page)).token;
}

// The seeded library and a finder for its books by title substring.
async function seededBooks(token) {
  const [lib] = (await api(token, 'GET', '/libraries')).libraries;
  const {books} = await api(token, 'GET', `/libraries/${lib.id}/books?limit=200`);
  const find = (t) => books.find((b) => `${b.title} ${b.rel_path}`.includes(t));
  return {lib, find};
}

// The player creates a detached `new Audio()` (not in the DOM); hook the
// constructor so warm-up can find and seek the element.
const audioHook = () => {
  window.__audios = [];
  const OA = window.Audio;
  window.Audio = function (...a) {
    const el = new OA(...a);
    window.__audios.push(el);
    return el;
  };
  window.Audio.prototype = OA.prototype;
  const oce = document.createElement.bind(document);
  document.createElement = function (tag, ...rest) {
    const el = oce(tag, ...rest);
    if (String(tag).toLowerCase() === 'audio') window.__audios.push(el);
    return el;
  };
};

// ── A year of listening ─────────────────────────────────────────────────────
// Listening stats come from listening sessions, which the server only derives from
// progress saves as they happen (a device's listened time can't run faster than the
// server's clock), so a fresh demo user has a minute of listening and the You shots
// would be bare. seedListeningYear writes a year of sessions for the demo user straight
// into the capture server's own database (run.sh's .cache/data, a throwaway copy),
// marked token_id -1, and unseedListeningYear removes them once the web captures are
// done, so the admin console's Activity shots (captured afterwards) only show the
// listeners they provision. Deterministic (a fixed seed), so a re-run draws the same
// charts. Needs the sqlite3 CLI on PATH; without it the step fails and the shots show
// only the warm-up's listening.
const DB = path.join(CACHE, 'data', 'audiosilo.db');
const SEEDED_TOKEN = -1;
// The books the year is spread over, most listened first (title substrings).
const YEAR_BOOKS = [
  "Alice's Adventures",
  'Adventures of Sherlock Holmes',
  'Hound of the Baskervilles',
  'Call of the Wild',
  'Looking-Glass',
  'Christmas Carol',
  'Art of War',
];

function sqlite(sql) {
  if (!existsSync(DB)) throw new Error(`no capture database at ${DB}`);
  return execFileSync('sqlite3', [DB], {input: `.timeout 15000\n${sql}\n`, encoding: 'utf8'});
}

function seedListeningYear(userId, libraryId, books) {
  if (!books.length) throw new Error('no seeded books to listen to');
  let state = 20261008;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const rows = [];
  const now = Date.now();
  // Every day of the last year but today (the warm-up's own listening is today's): most
  // days some listening, the odd quiet spell, more at weekends; evenings the busiest hour,
  // a commute in the morning on weekdays. The last ten days all have some, so the streak
  // is running.
  for (let back = 364; back >= 1; back--) {
    const day = new Date(now - back * DAY);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const recent = back <= 10;
    if (!recent && rand() < (back % 47 < 6 ? 0.85 : 0.18)) continue; // quiet spells, days off
    const slots = weekend ? [[10, 2], [21, 1.5]] : [[7.5, 0.6], [21.5, 1]];
    for (const [i, [hour, spread]] of slots.entries()) {
      if (rand() < 0.3 && !(recent && i === slots.length - 1)) continue;
      const minutes = Math.round(15 + rand() * (weekend ? 85 : 50));
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const at = start.getTime() + (hour + (rand() - 0.5) * 2 * spread) * HOUR;
      // A book for a few weeks at a time, so the top lists have a clear order.
      const pick = Math.min(books.length - 1, Math.floor(((back / 30) % books.length) * rand() * 1.2));
      const b = books[pick];
      const startPos = Math.round(rand() * 1800);
      const listened = minutes * 60;
      rows.push(
        `(${userId}, ${libraryId}, ${q(b.rel_path)}, ${SEEDED_TOKEN}, 'Pixel 9', 'AudioSilo', '1.3.0', 'android', ` +
          `${q(new Date(at).toISOString())}, ${q(new Date(at + listened * 1000).toISOString())}, ` +
          `${startPos}, ${startPos + listened}, ${Math.max(b.duration ?? 0, startPos + listened)}, 1, ${listened})`,
      );
    }
  }
  sqlite(
    'BEGIN;\n' +
      'INSERT INTO listening_sessions (user_id, library_id, rel_path, token_id, device_name, client_app, ' +
      'client_version, client_platform, started_at, last_at, start_pos, end_pos, duration, speed, listened) VALUES\n' +
      rows.join(',\n') +
      ';\nCOMMIT;',
  );
  console.log(`  ✓ a year of listening: ${rows.length} sessions`);
}

function unseedListeningYear() {
  sqlite(`DELETE FROM listening_sessions WHERE token_id = ${SEEDED_TOKEN};`);
  console.log('  ✓ the seeded year removed again');
}

const browser = await chromium.launch();
await mkdir(CACHE, {recursive: true});

// ── Pass 0: series tags ─────────────────────────────────────────────────────
console.log('== provision series ==');
await step('series tags', async () => {
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set: the series shots will show no series');
  const {token} = await api(null, 'POST', '/auth/login', {username: 'admin', password: ADMIN_PASSWORD});
  try {
    for (const s of SERIES) {
      const list = await api(token, 'GET', `/admin/books?author=${encodeURIComponent(s.author)}&limit=50`);
      const b = (list?.books ?? []).find((x) => `${x.title} ${x.path}`.includes(s.title));
      if (!b) throw new Error(`no seeded book matching "${s.title}"`);
      await api(token, 'PATCH', `/admin/libraries/${b.library_id}/book?path=${encodeURIComponent(b.path)}`, {
        set: {series: s.series, series_index: s.index},
      });
    }
  } finally {
    // Sign this session out again, so it never shows in the admin Devices shot.
    await api(token, 'POST', '/auth/logout').catch(() => {});
  }
  console.log(`  ✓ series: ${SERIES.map((s) => `${s.series} ${s.index}`).join(', ')}`);
});
await step('genres', async () => {
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set: the Genre filter shows no seeded genres');
  const {token} = await api(null, 'POST', '/auth/login', {username: 'admin', password: ADMIN_PASSWORD});
  try {
    const books = (await api(token, 'GET', '/admin/books?limit=200'))?.books ?? [];
    for (const g of GENRES) {
      const b = books.find((x) => `${x.title} ${x.path}`.includes(g.title));
      if (!b) throw new Error(`no seeded book matching "${g.title}"`);
      await api(token, 'PATCH', `/admin/libraries/${b.library_id}/book${pathQuery(b.path)}`, {add: {genres: g.genres}});
    }
  } finally {
    await api(token, 'POST', '/auth/logout').catch(() => {});
  }
  console.log(`  ✓ genres on ${GENRES.length} books`);
});

// ── Pass 1: warm a demo session ─────────────────────────────────────────────
console.log('== warm demo session ==');
{
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, colorScheme: 'dark'});
  await ctx.addInitScript(audioHook);
  const page = await ctx.newPage();
  await page.goto(BASE + 'demo', {waitUntil: 'networkidle', timeout: 60000});
  // The demo session is ready once Home shows a cover (best effort: the warm-ups below
  // fail loudly on their own if it never is).
  await page.locator('[role="button"]:has(img)').first().waitFor({state: 'attached', timeout: 30000}).catch(() => {});
  await sleep(1500);

  for (const {q, frac} of WARM) {
    await step(`warm ${q}`, async () => {
      await page.goto(BASE, {waitUntil: 'networkidle'});
      await sleep(1500);
      const card = page.getByText(q, {exact: false}).first();
      if (!(await card.count())) throw new Error('not found');
      await card.click({timeout: 8000});
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(2500);
      const listen = firstVisible(page.getByRole('button', {name: PRIMARY_PLAY}));
      if (await listen.count()) await listen.click({timeout: 8000}).catch(() => {});
      await sleep(3500);
      await page.evaluate((f) => {
        const list = window.__audios || [];
        const playing = list.find((a) => !a.paused);
        const longest = list
          .filter((a) => isFinite(a.duration) && a.duration > 0)
          .sort((x, y) => y.duration - x.duration)[0];
        const el = playing || longest || list[list.length - 1];
        if (!el) return;
        const d = isFinite(el.duration) && el.duration > 0 ? el.duration : 3600;
        el.currentTime = Math.max(5, d * f);
      }, frac);
      await sleep(16000); // progress autosaves every 15s while playing
    });
  }
  // Up next and a collection for the demo user, through the API with its own token.
  await step('queue + collection', async () => {
    const token = await demoToken(page);
    const {lib, find} = await seededBooks(token);
    const ref = (b) => ({library_id: lib.id, path: b.rel_path});
    const queued = QUEUE.map(find).filter(Boolean);
    for (const b of queued) await api(token, 'POST', '/me/queue', ref(b)); // in order
    const {name, description} = COLLECTION;
    const made = await api(token, 'POST', '/me/collections', {name, description});
    const items = COLLECTION.books.map(find).filter(Boolean).map(ref);
    await api(token, 'PUT', `/me/collections/${made.collection.id}/items`, {items});
    console.log(`  ✓ queued ${queued.length}, collection of ${items.length}`);
  });

  // Each WARM book's records (capability `annotations` for labels and the lists).
  await step('listener records', async () => {
    // Reload first: the warm-up's last book is still playing, and its next autosave
    // (a newer PUT, last write wins) would overwrite the place set below. A reload
    // stops it without a pause, so it records no span either (as between warm-ups).
    await page.goto(BASE, {waitUntil: 'networkidle'});
    const token = await demoToken(page);
    const info = await api(token, 'GET', '/server');
    if (!info?.capabilities?.annotations) throw new Error('the server has no annotations capability');
    const {lib, find} = await seededBooks(token);
    let made = 0;
    for (const w of WARM) {
      const b = find(w.q);
      if (!b) throw new Error(`no seeded book matching "${w.q}"`);
      const at = pathQuery(b.rel_path);
      const book = (what) => `/libraries/${lib.id}/${what}${at}`;
      const d = b.duration;
      const span = (from, to, endedAgo) =>
        api(token, 'POST', book('history'), {
          from_pos: from,
          to_pos: to,
          started_at: isoAgo(endedAgo + (to - from) * 1000),
          ended_at: isoAgo(endedAgo),
        });
      const bookmark = (position, note, label) =>
        api(token, 'POST', book('bookmarks'), {position: Math.round(position), note, label});
      for (const h of w.history ?? []) await span(d * h.from, d * h.to, h.endedAgo);
      if (w.place) {
        await api(token, 'PATCH', book('progress'), {
          position: Math.round(d * w.place.at),
          started_at: isoAgo(w.place.startedAgo),
        });
      }
      if (w.finished) {
        await api(token, 'PATCH', book('progress'), {
          finished: true,
          started_at: isoAgo(w.finished.startedAgo),
          finished_at: isoAgo(w.finished.finishedAgo),
        });
        await api(token, 'PUT', book('rating'), {rating: w.finished.rating});
      }
      for (const m of w.bookmarks ?? []) await bookmark(d * m.at, m.note ?? '', m.label);
      for (const n of w.notes ?? []) {
        await api(token, 'POST', book('notes'), {body: n.body, position: Math.round(d * n.at)});
      }
      if (w.drift) {
        const {progress} = await api(token, 'GET', book('progress'));
        const end = Math.round(progress.position);
        await span(Math.max(0, end - w.drift.minutes * 60), end, w.drift.endedAgo);
        await bookmark(end, FELL_ASLEEP_NOTE, 'fell_asleep');
      }
      made += (w.bookmarks?.length ?? 0) + (w.notes?.length ?? 0) + (w.drift ? 1 : 0);
    }
    console.log(`  ✓ ${made} bookmarks and notes, history, a finished book and a drift-off`);
  });

  // A year of listening for You (Your listening, Year in listening) and Home's This
  // week: see seedListeningYear.
  await step('listening year', async () => {
    const token = await demoToken(page);
    const me = await api(token, 'GET', '/me');
    const {lib, find} = await seededBooks(token);
    seedListeningYear(me.id, lib.id, YEAR_BOOKS.map(find).filter(Boolean));
  });

  await ctx.storageState({path: AUTH});
  await ctx.close();
  console.log('  ✓ demo session warmed');
}

// ── Pass 2: captures ────────────────────────────────────────────────────────
// The player shell (redesign 0b): a phone (< 640) has a bottom tab bar, a mini
// player above it and the book page's primary button opens the full-screen player; a tablet (640-1023)
// or desktop (>= 1024) has a top bar and it plays in place, with the docked
// player bar along the bottom (its expand button opens the full player). Moving
// around with the chrome (not page.goto) keeps the book loaded, so the shots
// after it show the mini player / docked bar.
//
// Every visited page stays mounted but hidden: act through `firstVisible` / `tid`.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function newProfile(name, viewport) {
  console.log(`== ${name} (${viewport.width}x${viewport.height}) ==`);
  const ctx = await newCaptureContext({viewport, storageState: AUTH});
  return {ctx, page: await ctx.newPage()};
}

// A Library section in the sub-nav (tablet/desktop), e.g. 'Series'; its radio's name
// carries the count ("Series, 2").
async function librarySection(page, label) {
  await tid(page, 'top-bar-(library)').click({timeout: 8000});
  await sleep(1500);
  await tid(page, 'shell-sub-nav')
    .getByRole('radio', {name: new RegExp(`^${label}\\b`)})
    .click({timeout: 8000});
  await sleep(2500);
}

// A card or tile whose accessible name starts with `name`.
async function openNamed(page, name) {
  await firstVisible(page.getByRole('button', {name: new RegExp(`^${escapeRe(name)}`)})).click({timeout: 8000});
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(3000);
}

// Home, open the first Continue listening card's book, and (optionally) shoot it.
async function openFirstBook(page, shot) {
  await page.goto(BASE, {waitUntil: 'networkidle', timeout: 45000});
  await sleep(3000);
  const card = page.locator('[role="button"]:has(img)').first();
  await card.waitFor({state: 'visible', timeout: 20000});
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({timeout: 12000});
  await tid(page, 'book-page').waitFor({timeout: 15000});
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(SETTLE_MS);
  if (shot) await shoot(page, shot);
}

// The play button is named Pause while playing, Play once paused (and while still
// loading, with a spinner, before it starts by itself) and Retry after a failure.
const PLAYING_OR_FAILED = /^(pause|retry)$/i;

// Press the book page's primary button (Resume, Start listening...) and wait until the
// book plays (or failed); returns when the button was pressed. `scope` narrows the
// transport to one bar (the Cast shot's docked player); with `ifShown` a page without
// the button (its book already started by itself) is fine.
async function startPlayback(page, {scope = page, ifShown = false} = {}) {
  const primary = firstVisible(page.getByRole('button', {name: PRIMARY_PLAY}));
  if (!ifShown || (await primary.count())) await primary.click({timeout: 8000});
  const at = Date.now();
  await firstVisible(scope.getByRole('button', {name: PLAYING_OR_FAILED})).waitFor({timeout: 20000});
  return at;
}

// Scroll the page so `locator` (a book page's tab, say) sits near the top of the
// window, with the panel under it in view.
async function scrollToTop(locator) {
  await locator.evaluate((el) => el.scrollIntoView({block: 'start'}));
  await sleep(SETTLE_MS);
}

// A short pause for an entrance animation to finish after the state it waits on.
const SETTLE_MS = 600;

// The frontend's jump-undo ignores every jump for its SETTLE_MS (3 s) after a book
// first plays (src/playback/jump-undo.ts); this leaves the load a few seconds on top.
const JUMP_UNDO_READY_MS = 8000;

// Stage a paused, healthy player for the shots: a still frame (no moving playhead,
// no buffering spinner) that reads the same on every run. Waits for a settled button
// (PLAYING_OR_FAILED) first, then pauses a playing book.
async function pausePlayback(page, scope = page) {
  await firstVisible(scope.getByRole('button', {name: PLAYING_OR_FAILED})).waitFor({timeout: 20000});
  const pause = firstVisible(scope.getByRole('button', {name: /^pause$/i}));
  if (await pause.count()) await pause.click({timeout: 8000});
  await firstVisible(scope.getByRole('button', {name: /^play$/i})).waitFor({timeout: 8000});
}

// Start the open book and stage it paused (startPlayback, then pausePlayback).
async function playThenPause(page, opts = {}) {
  const at = await startPlayback(page, opts);
  await pausePlayback(page, opts.scope);
  return at;
}

// The full player, from the docked bar's expand button (tablet/desktop).
async function expandPlayer(page) {
  await tid(page, 'dock-expand').click({timeout: 8000});
  await tid(page, 'player-menu').waitFor({timeout: 8000});
  await sleep(SETTLE_MS);
}

// The full player's minimise button (top left); done once the shell is back.
async function minimisePlayer(page) {
  await firstVisible(page.getByRole('button', {name: 'Minimise player'})).click({timeout: 8000});
  await tid(page, 'player-menu').waitFor({state: 'hidden', timeout: 8000});
  await sleep(SETTLE_MS);
}

// Back to the shell from whatever a step left on top: a sheet or the end credits
// (their Close), then the full player (Minimise). Steps that open one run this in a
// `finally`, so a step that fails half-way can't leave a root modal over (and the
// shell hidden under it for) every later step.
async function backToShell(page) {
  const close = firstVisible(page.getByRole('button', {name: 'Close', exact: true}));
  if (await close.count()) {
    await close.click({timeout: 8000});
    await close.waitFor({state: 'hidden', timeout: 8000});
  }
  if (await tid(page, 'player-menu').count()) await minimisePlayer(page);
}

// A player sheet from one of the full player's action pills (`player-speed`,
// `player-sleep`), shot and closed again with Escape.
async function sheetShot(page, testId, shot) {
  await tid(page, testId).click({timeout: 8000});
  const sheet = firstVisible(page.getByRole('dialog'));
  await sheet.waitFor({timeout: 8000});
  await sleep(SETTLE_MS);
  await shoot(page, shot);
  await page.keyboard.press('Escape');
  await sheet.waitFor({state: 'hidden', timeout: 8000});
}

// Tablet/desktop: one browsing session with a book playing in the docked bar.
async function captureWide(name, viewport, shots) {
  const {ctx, page} = await newProfile(name, viewport);

  let listenedAt = 0;
  await step('book', async () => {
    await openFirstBook(page, shots.book);
    listenedAt = await startPlayback(page);
  });

  // Home and the pause run whatever SHOTS_ONLY selects, so a partial run stages every
  // later shot as a full run does: the palette and profile menu over Home, the docked
  // bar paused (a still frame). home.png itself is taken while the book plays.
  await step('home', async () => {
    await tid(page, 'top-bar-(home)').click({timeout: 8000});
    await sleep(3000);
    await shoot(page, shots.home);
  });
  await step('pause', () => pausePlayback(page));

  if (wanted(shots.bookBookmarks, shots.bookmarkEditor, shots.bookDetails)) {
    // The playing book's page again (the full player's View book details, so the book
    // stays loaded and paused): its Bookmarks tab, the bookmark editor on the Quote
    // (Edit opens it as a dialog on a desktop; Cancel leaves it unchanged), and, once
    // the book is downloaded here, Details.
    await step('book tabs', async () => {
      await expandPlayer(page);
      await tid(page, 'player-menu').click({timeout: 8000});
      await firstVisible(page.getByRole('menuitem', {name: 'View book details'})).click({timeout: 8000});
      await tid(page, 'player-menu').waitFor({state: 'hidden', timeout: 8000});
      await tid(page, 'book-tab-bookmarks').click({timeout: 8000});
      await firstVisible(page.getByTestId('bookmark-quote')).waitFor({timeout: 8000});
      await sleep(SETTLE_MS);
      await scrollToTop(tid(page, 'book-tab-bookmarks'));
      await page.mouse.move(0, 0);
      await shoot(page, shots.bookBookmarks);
      if (wanted(shots.bookmarkEditor)) {
        const quote = firstVisible(page.locator('[data-testid^="bookmark-row-"]').filter({has: page.getByTestId('bookmark-quote')}));
        await quote.getByTestId('bookmark-edit').click({timeout: 8000});
        const dialog = firstVisible(page.getByRole('dialog'));
        try {
          await dialog.waitFor({timeout: 8000});
          await sleep(SETTLE_MS);
          await shoot(page, shots.bookmarkEditor);
        } finally {
          // Cancel whatever happened, so a failed shot can't leave the dialog over
          // every later step.
          const cancel = firstVisible(dialog.getByRole('button', {name: 'Cancel', exact: true}));
          if (await cancel.count()) await cancel.click({timeout: 8000});
          await dialog.waitFor({state: 'hidden', timeout: 8000});
        }
      }
      if (wanted(shots.bookDetails)) {
        // Download it here unless it already is (the default automatic download may
        // have kept it as it played), so Details says Plays from this device.
        const download = firstVisible(page.getByRole('button', {name: /^download( for offline)?$/i}));
        if (await download.count()) await download.click({timeout: 8000});
        await firstVisible(page.getByRole('button', {name: /^downloaded$/i})).waitFor({timeout: 120000});
        await tid(page, 'book-tab-details').click({timeout: 8000});
        await tid(page, 'book-playback-local').waitFor({timeout: 8000});
        await scrollToTop(tid(page, 'book-tab-details'));
        await shoot(page, shots.bookDetails);
      }
    });
  }

  if (wanted(shots.bookFinished)) {
    // The finished, rated book's page (Library > Books, by its title).
    await step('finished book', async () => {
      await librarySection(page, 'Books');
      await openNamed(page, FINISHED_TITLE);
      await firstVisible(page.getByText(/^Finished /)).waitFor({timeout: 8000});
      await sleep(SETTLE_MS);
      await page.mouse.move(0, 0);
      await shoot(page, shots.bookFinished);
    });
  }

  if (wanted(shots.bookAboutGenerated)) {
    // The Call of the Wild's About card: run.sh seeds its .audiosilo folder with a
    // description.json, the book has no description of its own and no community
    // match, so About shows the generated one with its mark (Library > Books, by
    // its title).
    await step('generated description', async () => {
      await librarySection(page, 'Books');
      await openNamed(page, 'The Call of the Wild');
      const mark = tid(page, 'about-generated-mark');
      await mark.waitFor({timeout: 15000});
      const card = mark.locator('xpath=..');
      await card.scrollIntoViewIfNeeded();
      await sleep(SETTLE_MS);
      await page.mouse.move(0, 0);
      await shoot(page, shots.bookAboutGenerated, {clip: around([await card.boundingBox()])});
    });
  }

  if (wanted(shots.bookRecapsGenerated)) {
    // The same book's Recaps tab: the recaps.json run.sh seeds, with the Generated on
    // this server mark, the recaps past the listener's place hidden and Show anyway.
    await step('generated recaps', async () => {
      await librarySection(page, 'Books');
      await openNamed(page, 'The Call of the Wild');
      await tid(page, 'book-tab-recaps').click({timeout: 15000});
      // The mark heads the tab (generated-mark) when all of it was generated here.
      await firstVisible(page.getByTestId('generated-mark').or(page.getByTestId('recaps-generated-mark'))).waitFor({timeout: 15000});
      await scrollToTop(tid(page, 'book-tab-recaps'));
      await page.mouse.wheel(0, -80);
      await sleep(SETTLE_MS);
      await page.mouse.move(0, 0);
      await shoot(page, shots.bookRecapsGenerated);
    });
  }

  if (wanted(shots.journal, shots.journalBookmarks)) {
    // The Journal from the profile menu: the Diary (today's drift-off strip), then
    // the Bookmarks tab with its label filter.
    await step('journal', async () => {
      await tid(page, 'top-bar-profile').click({timeout: 8000});
      await firstVisible(page.getByRole('menuitem', {name: 'Journal'})).click({timeout: 8000});
      await firstVisible(page.getByTestId('journal-list')).waitFor({timeout: 8000});
      await firstVisible(page.getByText(/^The sleep timer stopped this at /)).waitFor({timeout: 15000});
      await sleep(SETTLE_MS);
      await shoot(page, shots.journal);
      if (wanted(shots.journalBookmarks)) {
        await firstVisible(page.getByRole('radio', {name: /^Bookmarks/})).click({timeout: 8000});
        await firstVisible(page.getByTestId('bookmark-quote')).waitFor({timeout: 15000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.journalBookmarks);
      }
    });
  }

  if (wanted(shots.bookBookmarks, shots.bookmarkEditor, shots.bookDetails, shots.bookFinished, shots.journal, shots.journalBookmarks)) {
    // Back to Home, where the pause left a partial run, so the palette and profile
    // menu are shot over Home on every run.
    await step('back home', async () => {
      await tid(page, 'top-bar-(home)').click({timeout: 8000});
      // The Home tab still has the playing book's page pushed (View book details):
      // back out of it to Home's root.
      for (let i = 0; i < 3; i++) {
        const back = firstVisible(page.getByRole('button', {name: /^back$/i}));
        if (!(await back.count())) break;
        await back.click({timeout: 8000});
        await sleep(SETTLE_MS);
      }
      await sleep(3000);
    });
  }

  if (wanted(shots.player)) {
    await step('player', async () => {
      await expandPlayer(page);
      try {
        // The seeded books have no community notes, so the companion column shows its
        // Chapters tab (Who's who would only say there are none).
        await tid(page, 'companion-tab-chapters').click({timeout: 8000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.player);
      } finally {
        await backToShell(page);
      }
    });
  }

  if (wanted(shots.dockUndo)) {
    // A jump of more than a minute (the next chapter, from the docked bar) brings up
    // the Undo chip for ten seconds; the shot is the bar itself.
    await step('dock undo chip', async () => {
      // Only once jump-undo is watching (a partial run gets here sooner than a full one).
      const wait = listenedAt + JUMP_UNDO_READY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const undo = tid(page, 'dock-actions').getByRole('button', {name: /^Back to /});
      await tid(page, 'shell-docked-player')
        .getByRole('button', {name: 'Next chapter', exact: true})
        .click({timeout: 8000});
      await undo.waitFor({timeout: 8000});
      // The chip moves the transport under the pointer: park it off the bar, or the shot
      // shows whichever button slid beneath it hovered.
      await page.mouse.move(0, 0);
      await sleep(SETTLE_MS);
      const box = await tid(page, 'shell-docked-player').boundingBox();
      if (!box) throw new Error('no docked bar');
      await shoot(page, shots.dockUndo, {clip: box});
      // Undo it, so the book is back where the warm-up left it.
      await undo.click({timeout: 5000});
      await undo.waitFor({state: 'hidden', timeout: 8000});
      // Its "Back where you were" toast must not ride into the next shot.
      await firstVisible(page.getByText('Back where you were')).waitFor({state: 'hidden', timeout: 15000});
    });
  }

  if (wanted(shots.credits)) {
    // The end credits, opened early from the full player's menu (the book is paused,
    // so nothing counts down): the year shelf or cover, the stats, Up next.
    await step('end credits', async () => {
      await expandPlayer(page);
      try {
        await tid(page, 'player-menu').click({timeout: 8000});
        await firstVisible(page.getByRole('menuitem', {name: 'View end credits'})).click({timeout: 8000});
        await firstVisible(page.getByRole('button', {name: /^Play .* now$/})).waitFor({timeout: 15000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.credits);
      } finally {
        // Close the credits (or the player, if they never opened) whatever happened.
        await backToShell(page);
      }
    });
  }

  if (wanted(shots.palette)) {
    await step('palette', async () => {
      await tid(page, 'top-bar-search').click({timeout: 8000});
      await sleep(1200);
      await page.keyboard.type('holmes', {delay: 60});
      await sleep(3000);
      await shoot(page, shots.palette);
      await page.keyboard.press('Escape');
      await sleep(1000);
    });
  }

  if (wanted(shots.profile)) {
    await step('profile menu', async () => {
      await tid(page, 'top-bar-profile').click({timeout: 8000});
      await sleep(1500);
      await shoot(page, shots.profile);
      await page.keyboard.press('Escape');
      await sleep(1000);
    });
  }

  if (wanted(shots.library)) {
    // Library > Books, the default section.
    await step('library', async () => {
      await tid(page, 'top-bar-(library)').click({timeout: 8000});
      await sleep(3000);
      await shoot(page, shots.library);
    });
  }

  if (wanted(shots.libraryGenre)) {
    // The Genre filter's choices over Library > Books (the genres pass 0 adds), closed
    // again with Escape.
    await step('library genre', async () => {
      await tid(page, 'top-bar-(library)').click({timeout: 8000});
      await sleep(1500);
      await firstVisible(page.getByRole('button', {name: /^Genre\b/})).click({timeout: 8000});
      const dialog = firstVisible(page.getByRole('dialog'));
      try {
        await dialog.getByRole('radio', {name: /^Classics, /}).waitFor({timeout: 15000});
        await sleep(SETTLE_MS);
        await page.mouse.move(0, 0);
        await shoot(page, shots.libraryGenre);
      } finally {
        await page.keyboard.press('Escape');
        await dialog.waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
      }
    });
  }

  if (wanted(shots.upNext)) {
    // The drawer beside Library > Books, opened from the top bar (and closed again).
    await step('up next', async () => {
      await tid(page, 'top-bar-(library)').click({timeout: 8000});
      await sleep(1500);
      await tid(page, 'upnext-button-bar').click({timeout: 8000});
      await sleep(3000);
      await shoot(page, shots.upNext);
      await tid(page, 'upnext-button-bar').click({timeout: 8000});
      await sleep(1000);
    });
  }

  if (wanted(shots.librarySeries, shots.series)) {
    await step('series', async () => {
      await librarySection(page, 'Series');
      await shoot(page, shots.librarySeries);
      if (wanted(shots.series)) {
        await openNamed(page, 'Sherlock Holmes');
        await shoot(page, shots.series);
      }
    });
  }

  if (wanted(shots.author)) {
    await step('author', async () => {
      await librarySection(page, 'Authors');
      await openNamed(page, 'Lewis Carroll');
      await shoot(page, shots.author);
    });
  }

  if (wanted(shots.collection)) {
    await step('collection', async () => {
      await librarySection(page, 'Collections');
      await openNamed(page, COLLECTION.name);
      await shoot(page, shots.collection);
    });
  }

  if (wanted(shots.downloads)) {
    // Download one short book first, so the Downloads page has a book ready offline.
    await step('download a book', async () => {
      await librarySection(page, 'Books');
      await openNamed(page, 'The Art of War');
      await firstVisible(page.getByRole('button', {name: /^download( for offline)?$/i})).click({timeout: 8000});
      // Done once the book page's control says Downloaded (its menu holds Remove).
      await firstVisible(page.getByRole('button', {name: /^downloaded$/i})).waitFor({timeout: 120000});
    });
  }

  if (wanted(shots.youStats, shots.year)) {
    // You in the top bar: Your listening (Stats), then Year in listening. The context
    // reduces motion, so the story stays on its first card (a still frame).
    await step('you', async () => {
      await tid(page, 'top-bar-(me)').click({timeout: 8000});
      // The Me tab keeps its section: the Journal shot left it on the Journal.
      await tid(page, 'shell-sub-nav').getByRole('radio', {name: /^Stats/}).click({timeout: 8000});
      await tid(page, 'you-hub-stats').waitFor({timeout: 8000});
      await firstVisible(page.getByText(/^(Listening calendar|No listening yet)$/)).waitFor({timeout: 15000});
      await sleep(SETTLE_MS);
      await page.mouse.move(0, 0);
      await shoot(page, shots.youStats);
      if (wanted(shots.year)) {
        await tid(page, 'shell-sub-nav')
          .getByRole('radio', {name: /^Year in listening/})
          .click({timeout: 8000});
        await tid(page, 'year-section').waitFor({timeout: 8000});
        await firstVisible(page.getByText(/^(Share this card|Not much of a story yet)$/)).waitFor({timeout: 15000});
        await sleep(1500); // the stage's covers
        await page.mouse.move(0, 0);
        await shoot(page, shots.year);
      }
    });
  }

  for (const [key, testId] of [
    ['settings', 'top-bar-settings'],
    ['downloads', 'top-bar-(offline)'],
  ]) {
    if (!wanted(shots[key])) continue;
    await step(key, async () => {
      await tid(page, testId).click({timeout: 8000});
      await sleep(2500);
      await shoot(page, shots[key]);
    });
  }

  if (wanted(shots.search)) {
    await step('search', async () => {
      await page.goto(BASE + 'search', {waitUntil: 'networkidle', timeout: 45000});
      await sleep(1500);
      const box = page.locator('input').first();
      if (await box.count()) {
        await box.click();
        await box.fill('holmes');
        await sleep(2500);
      }
      await shoot(page, shots.search);
    });
  }

  await ctx.close();
}

// Phone: the primary button opens the full player; closing it leaves the mini player above
// the tab bar, which the Home shot shows.
async function capturePhone(name, viewport, shots) {
  const {ctx, page} = await newProfile(name, viewport);

  await step('book + player', async () => {
    await openFirstBook(page, shots.book);
    try {
      await playThenPause(page);
      await shoot(page, shots.player);
      if (wanted(shots.speedSheet)) await sheetShot(page, 'player-speed', shots.speedSheet);
      if (wanted(shots.sleepSheet)) await sheetShot(page, 'player-sleep', shots.sleepSheet);
    } finally {
      await backToShell(page);
    }
  });

  await step('home', async () => {
    await tid(page, 'tab-bar-(home)').click({timeout: 8000});
    await sleep(3000);
    await shoot(page, shots.home);
  });

  if (wanted(shots.youStats, shots.settings)) {
    // The Me tab (the You hub): Stats, then its Settings section.
    await step('me tab', async () => {
      await tid(page, 'tab-bar-(me)').click({timeout: 8000});
      await tid(page, 'you-hub-stats').waitFor({timeout: 8000});
      await firstVisible(page.getByText(/^(This week|No listening yet)$/)).waitFor({timeout: 15000});
      await sleep(SETTLE_MS);
      await shoot(page, shots.youStats);
      if (wanted(shots.settings)) {
        await firstVisible(page.getByRole('radio', {name: 'Settings', exact: true})).click({timeout: 8000});
        await tid(page, 'settings-content').waitFor({timeout: 8000});
        await sleep(SETTLE_MS);
        await shoot(page, shots.settings);
      }
      // Back to Stats, so a later visit to the tab starts where a fresh run does.
      await firstVisible(page.getByRole('radio', {name: 'Stats', exact: true})).click({timeout: 8000}).catch(() => {});
    });
  }

  if (wanted(shots.upNext)) {
    // The sheet, from the Up next button beside Home's large title.
    await step('up next sheet', async () => {
      await tid(page, 'upnext-button-header').click({timeout: 8000});
      await sleep(2500);
      await shoot(page, shots.upNext);
    });
  }

  await ctx.close();
}

await captureWide('desktop', {width: 1440, height: 900}, {
  home: 'web-player/home.png',
  book: 'web-player/book-detail.png',
  bookBookmarks: 'web-player/book-bookmarks.png',
  bookmarkEditor: 'web-player/bookmark-editor.png',
  bookDetails: 'web-player/book-details.png',
  bookFinished: 'web-player/book-finished.png',
  bookAboutGenerated: 'web-player/book-about-generated.png',
  bookRecapsGenerated: 'web-player/book-recaps-generated.png',
  journal: 'web-player/journal.png',
  journalBookmarks: 'web-player/journal-bookmarks.png',
  player: 'web-player/player.png',
  dockUndo: 'web-player/dock-undo.png',
  credits: 'web-player/end-credits.png',
  palette: 'web-player/palette.png',
  profile: 'web-player/profile-menu.png',
  library: 'web-player/library.png',
  libraryGenre: 'web-player/library-genre.png',
  upNext: 'web-player/up-next.png',
  librarySeries: 'web-player/library-series.png',
  series: 'web-player/series.png',
  author: 'web-player/author.png',
  collection: 'web-player/collection.png',
  search: 'web-player/search.png',
  youStats: 'web-player/you-stats.png',
  year: 'web-player/year.png',
  settings: 'web-player/settings.png',
  downloads: 'web-player/downloads.png',
});

await captureWide('tablet', {width: 834, height: 1112}, {
  home: 'web-player/tablet-home.png',
});

await capturePhone('phone', PHONE, {
  home: 'web-player/phone-home.png',
  book: 'web-player/phone-book-detail.png',
  player: 'web-player/phone-player.png',
  speedSheet: 'web-player/phone-speed-sheet.png',
  sleepSheet: 'web-player/phone-sleep-sheet.png',
  upNext: 'web-player/phone-up-next.png',
  youStats: 'web-player/phone-you-stats.png',
  settings: 'web-player/phone-settings.png',
});

// ── Podcasts: Shows, a show page, New episodes, an episode being fetched ────
// A podcast library is only written by a Bridge, and the demo account sees only the
// demo library, so this pass has its own state (README.md, the podcast shots): run.sh
// seeds three made-up shows into PODCASTS_DIR (feed.json, cover and silent episodes, two
// of them not on the server); here the admin turns the Podcasts module on (a follow by
// path needs only that, no Bridge), adds the folder as a podcast library, follows the
// fixture's `follow` shows and signs in to a fresh browser by password. The player sees
// a podcast library only as 2.2.0 or later (`X-AudioSilo-Client`, which the served
// player sends), and so does every API call here. Afterwards the library is deleted,
// the module turned off and this pass's audit and event rows taken out again (sqlite3),
// so no later shot (the connect shots, the admin console's) shows any of it.
const PODCAST_SHOTS = {
  shows: 'web-player/library-shows.png',
  show: 'web-player/podcast-show.png',
  home: 'web-player/home-new-episodes.png',
  fetching: 'web-player/episode-fetching.png',
  phoneShow: 'web-player/phone-podcast-show.png',
};
const PODCASTS_DIR = path.resolve(process.env.PODCASTS_DIR || path.join(CACHE, 'podcasts'));
const PODCAST_LIBRARY = 'Podcasts';
// A player that sees podcast libraries (the server's PodcastPlayerMinVersion).
const PODCAST_CLIENT = {'x-audiosilo-client': 'AudioSilo/2.2.0 (web)'};
// The show on the show page shots (a serial, so oldest first with its trailer) and the
// show whose newest episode (not on the server) the fetching shot starts.
const PODCAST_SHOW = 'The Lantern Archive';
const PODCAST_FETCH_SHOW = 'Field Notes at Dawn';

// The fixture's shows, each with its feed.json as run.sh wrote it, and its directory.
function podcastFixture() {
  const {shows, directory} = JSON.parse(readFileSync(path.join(FIXTURES, 'podcasts.json'), 'utf8'));
  return {
    shows: shows.map((s) => ({...s, feed: JSON.parse(readFileSync(path.join(PODCASTS_DIR, s.folder, 'feed.json'), 'utf8'))})),
    directory,
  };
}

// The newest id in a server feed table (sqlite3), so teardown removes only this pass's rows.
const lastId = (table) => Number(sqlite(`SELECT COALESCE(MAX(id), 0) FROM ${table};`).trim() || 0);

async function provisionPodcasts(pod) {
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set: no podcast library to add');
  if (!existsSync(PODCASTS_DIR)) throw new Error(`no seeded shows at ${PODCASTS_DIR} (run.sh section 2c)`);
  Object.assign(pod, podcastFixture());
  pod.marks = {audit: lastId('audit_events'), events: lastId('server_events')};
  const {token} = await api(null, 'POST', '/auth/login', {username: 'admin', password: ADMIN_PASSWORD}, PODCAST_CLIENT);
  pod.admin = token;
  const call = (method, p, body) => api(token, method, p, body, PODCAST_CLIENT);
  await call('PATCH', '/admin/settings', {modules: {podcasts: true}});
  pod.moduleOn = true;
  const created = await call('POST', '/admin/libraries', {name: PODCAST_LIBRARY, root: PODCASTS_DIR, kind: 'podcasts'});
  pod.library = created?.library ?? created;
  // The scan the create starts: done once the shows are listed.
  const until = Date.now() + 60000;
  let shows = [];
  while (Date.now() < until) {
    const libs = (await call('GET', '/admin/libraries'))?.libraries ?? [];
    const lib = libs.find((l) => l.id === pod.library.id);
    shows = (await call('GET', `/libraries/${pod.library.id}/podcasts`))?.shows ?? [];
    if (!lib?.scan?.running && !lib?.scan?.queued && shows.length >= pod.shows.length) break;
    await sleep(500);
  }
  if (shows.length < pod.shows.length) throw new Error(`the podcast scan listed ${shows.length} of ${pod.shows.length} shows`);
  for (const s of pod.shows.filter((x) => x.follow)) {
    await call('POST', '/podcasts/follow', {library_id: pod.library.id, path: s.folder});
  }
  console.log(`  ✓ podcast library "${PODCAST_LIBRARY}": ${shows.length} shows, following ${pod.shows.filter((x) => x.follow).map((x) => x.title).join(' and ')}`);
}

async function unprovisionPodcasts(pod) {
  const call = (method, p, body) => api(pod.admin, method, p, body, PODCAST_CLIENT);
  if (pod.library) await call('DELETE', `/admin/libraries/${pod.library.id}`).catch((e) => console.log(`  ! podcast library left: ${e.message}`));
  if (pod.moduleOn) await call('PATCH', '/admin/settings', {modules: {podcasts: false}}).catch((e) => console.log(`  ! Podcasts module left on: ${e.message}`));
  await api(pod.admin, 'POST', '/auth/logout').catch(() => {});
  try {
    sqlite(`DELETE FROM audit_events WHERE id > ${pod.marks.audit};\nDELETE FROM server_events WHERE id > ${pod.marks.events};`);
  } catch (e) {
    console.log(`  ! this pass's audit and event rows left in the server's feeds: ${e.message}`);
  }
  console.log('  ✓ podcast library removed again');
}

// The fetching shot's answers for `relPath` (the server's own 503 and status shapes,
// internal/podcast/testdata/phase2c2/wire-2b.json, with a real-looking size): the stream
// probe gets the 503 the server sends while a Bridge fetches, and every status read a
// fetch a little further on, never finished, so the panel stays on its way. Routed on this
// page only, and only for that episode; undone by the returned function.
async function routeEpisodeFetch(page, libraryId, relPath) {
  const total = 41_873_408;
  let received = 13_107_200;
  const status = () => {
    received = Math.min(Math.round(total * 0.72), received + 1_572_864);
    return {state: 'fetching', request_id: 81, bytes_received: received, bytes_total: total, retry_after_seconds: 2, error: null};
  };
  const forEpisode = (route) => new URL(route.request().url()).searchParams.get('path') === relPath;
  const stream = new RegExp(`/api/v1/libraries/${libraryId}/stream\\?`);
  const fetchStatus = new RegExp(`/api/v1/libraries/${libraryId}/podcasts/fetch\\?`);
  const onStream = (route) => {
    if (!forEpisode(route)) return route.continue();
    return route.fulfill({
      status: 503,
      headers: {'retry-after': '2', 'cache-control': 'no-store'},
      contentType: 'application/json',
      body: JSON.stringify({error: 'Episode is being fetched.', code: 'podcast_fetching', fetch: status()}),
    });
  };
  const onStatus = (route) => {
    if (!forEpisode(route) || route.request().method() !== 'GET') return route.continue();
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({fetch: status()})});
  };
  await page.route(stream, onStream);
  await page.route(fetchStatus, onStatus);
  return async () => {
    await page.unroute(stream, onStream);
    await page.unroute(fetchStatus, onStatus);
  };
}

async function capturePodcasts(pod) {
  const origin = new URL(BASE).origin;
  const ctx = await newCaptureContext();
  let session = null;
  try {
    const page = await ctx.newPage();
    await page.goto(BASE + 'connect', {waitUntil: 'networkidle', timeout: 45000});
    await probeServer(page, origin);
    await signInWithPassword(page, 'admin', ADMIN_PASSWORD);
    await tid(page, 'ready-screen').waitFor({timeout: 15000});
    const player = await playerSession(page);
    session = player.token;
    const {cid} = player;
    await firstVisible(page.getByRole('button', {name: 'Start listening'})).click({timeout: 8000});
    await tid(page, 'top-bar-(home)').waitFor({timeout: 15000});
    // The episode the fetching shot starts (not on the server; also the newest on Home).
    const fetchEpisode = pod.shows.find((s) => s.folder === PODCAST_FETCH_SHOW)?.feed.episodes.find((e) => !e.fetch);
    if (!fetchEpisode) throw new Error(`no episode of ${PODCAST_FETCH_SHOW} that is not on the server`);
    // Let the covers settle, then shoot `file` with the pointer out of the way.
    const settleShoot = async (p, file, ms = 1500) => {
      await sleep(ms);
      await p.mouse.move(0, 0);
      await shoot(p, file);
    };

    if (wanted(PODCAST_SHOTS.home)) {
      await step('podcasts: home', async () => {
        await tid(page, 'top-bar-(home)').click({timeout: 8000});
        const heading = firstVisible(page.getByText('New episodes', {exact: true}));
        await heading.waitFor({timeout: 30000});
        await firstVisible(page.getByText(fetchEpisode.title)).waitFor({timeout: 15000});
        await heading.evaluate((el) => el.scrollIntoView({block: 'start'}));
        await page.mouse.wheel(0, -120);
        await settleShoot(page, PODCAST_SHOTS.home);
      });
    }

    if (wanted(PODCAST_SHOTS.shows, PODCAST_SHOTS.show)) {
      await step('podcasts: shows', async () => {
        await tid(page, 'top-bar-(library)').click({timeout: 8000});
        await sleep(1500);
        await firstVisible(page.getByRole('combobox', {name: 'Library'}).or(page.getByRole('button', {name: 'Library'}))).click({timeout: 8000});
        await firstVisible(page.getByRole('option', {name: PODCAST_LIBRARY})).click({timeout: 8000});
        await firstVisible(page.getByTestId('show-tile')).waitFor({timeout: 15000});
        await settleShoot(page, PODCAST_SHOTS.shows);
        if (!wanted(PODCAST_SHOTS.show)) return;
        await firstVisible(page.getByTestId('show-tile').filter({hasText: PODCAST_SHOW})).click({timeout: 8000});
        await tid(page, 'podcast-show-hero').waitFor({timeout: 15000});
        await tid(page, 'podcast-following-badge').waitFor({timeout: 15000});
        await firstVisible(page.getByTestId('episode-row')).waitFor({timeout: 15000});
        // Down to the last episode's reason line.
        await fitViewportTo(page, page.getByTestId('episode-row'));
        try {
          await settleShoot(page, PODCAST_SHOTS.show);
        } finally {
          await page.setViewportSize(DESKTOP_CONTEXT.viewport);
        }
      });
    }

    // The phone shots, on this browser's storage (the same signed-in player).
    if (wanted(PODCAST_SHOTS.phoneShow, PODCAST_SHOTS.fetching)) {
      const phone = await sameDevice(ctx, {viewport: PHONE});
      try {
        const p = await phone.newPage();
        const showUrl = (folder) =>
          `${BASE}podcast?connection=${encodeURIComponent(cid)}&library=${pod.library.id}&show=${encodeURIComponent(folder)}`;
        if (wanted(PODCAST_SHOTS.phoneShow)) {
          await step('podcasts: phone show', async () => {
            await p.goto(showUrl(PODCAST_SHOW), {waitUntil: 'networkidle', timeout: 45000});
            await tid(p, 'podcast-following-badge').waitFor({timeout: 15000});
            await firstVisible(p.getByTestId('episode-row')).waitFor({timeout: 15000});
            await settleShoot(p, PODCAST_SHOTS.phoneShow);
          });
        }
        if (wanted(PODCAST_SHOTS.fetching)) {
          await step('podcasts: episode fetching', async () => {
            const unroute = await routeEpisodeFetch(p, pod.library.id, fetchEpisode.path);
            try {
              await p.goto(showUrl(PODCAST_FETCH_SHOW), {waitUntil: 'networkidle', timeout: 45000});
              await firstVisible(p.getByRole('button', {name: new RegExp(`^${escapeRe(fetchEpisode.title)}`)})).click({timeout: 15000});
              await tid(p, 'episode-page').waitFor({timeout: 15000});
              await sleep(SETTLE_MS);
              await tid(p, 'episode-page-play').click({timeout: 8000});
              await tid(p, 'episode-fetch-panel').waitFor({timeout: 15000});
              await firstVisible(p.getByTestId('episode-fetch-line').getByText(/ of /)).waitFor({timeout: 15000});
              await settleShoot(p, PODCAST_SHOTS.fetching, 2500); // a status read or two, and the cover
              await tid(p, 'episode-fetch-cancel').click({timeout: 8000}).catch(() => {});
            } finally {
              await unroute();
            }
          });
        }
      } finally {
        await phone.close();
      }
    }

    // Find shows, on contexts of their own (the stand-in answers stay there).
    if (wanted(...Object.values(FIND_SHOTS))) await captureFindShows(ctx, pod, cid);
  } finally {
    // Sign this player session out again, whatever happened above.
    if (session) await api(session, 'POST', '/auth/logout').catch(() => {});
    await ctx.close();
  }
}

// ── Podcasts: Find shows (Bridge Phase 2d-2) ────────────────────────────────
// Every way in ends in a follow, which needs an online Bridge, and a search would reach
// Apple, so these shots stand in for the server on their own browser contexts with
// Playwright routes. What each route answers: README.md (the Add shows shots).
const FIND_SHOTS = {
  search: 'web-player/find-shows-search.png',
  address: 'web-player/find-shows-address.png',
  import: 'web-player/find-shows-import.png',
  phone: 'web-player/phone-find-shows.png',
};
const FIND_QUERY = 'kitchen';
// A feed address as the server shows it in a request or an import row (its origin only).
const feedLabel = (url) => url.replace(/^(https?:\/\/[^/]+).*$/, '$1/...');
// The directory result standing for a seeded show (Follow answers 200 following) and the
// first one that is new (Follow answers 202 with a request).
const seededResult = (pod) => pod.directory.find((d) => d.folder);
const newResult = (pod) => pod.directory.find((d) => !d.folder);

// The made-up directory's results (the server's PodcastDiscoverySearch shape), and the
// artwork behind each result's proxy id (read once; a missing file answers 404).
function findShowsDirectory(pod) {
  const art = new Map();
  const results = pod.directory.map((d) => {
    const name = slug(d.title);
    const seeded = d.folder ? pod.shows.find((s) => s.folder === d.folder) : null;
    const id = createHash('sha256').update(`directory:${name}`).digest('hex');
    if (d.artwork !== false) {
      const file = seeded ? path.join(PODCASTS_DIR, d.folder, 'cover.jpg') : path.join(PODCAST_DIRECTORY(PODCASTS_DIR), `${name}.jpg`);
      if (existsSync(file)) art.set(id, readFileSync(file));
    }
    return {
      title: d.title,
      author: d.author,
      feed_url: seeded ? seeded.feed.feed_url : `https://${d.host}/${name}.xml`,
      artwork_url: d.artwork === false ? null : `/api/v1/podcasts/discovery/artwork?id=${id}`,
      provider_ids: {itunes: d.itunes_id, podcast_index: null},
      episode_count: d.episodes,
      provider_url: `https://podcasts.apple.com/us/podcast/${name}/id${d.itunes_id}`,
    };
  });
  return {results, art};
}

// Route the Find shows answers on `ctx` (see above). Returns the stand-in's state.
async function routeFindShows(ctx, pod, stand) {
  const origin = new URL(BASE).origin;
  const at = (p) => (url) => url.origin === origin && url.pathname === `/api/v1${p}`;
  const json = (route, status, body) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
  await ctx.route(at('/server'), async (route) => {
    const res = await route.fetch();
    const info = await res.json();
    info.capabilities = {...info.capabilities, podcasts: true, podcast_discovery: true, podcast_opml: true};
    return route.fulfill({response: res, json: info});
  });
  await ctx.route(at('/podcasts/discovery/providers'), (route) =>
    json(route, 200, {providers: [{id: 'itunes', available: true}, {id: 'podcast_index', available: false}]}),
  );
  await ctx.route(at('/podcasts/discovery/search'), (route) => {
    const q = new URL(route.request().url()).searchParams;
    return json(route, 200, {provider: 'itunes', query: q.get('q') ?? '', country: q.get('country') ?? 'US', results: stand.directory.results});
  });
  await ctx.route(at('/podcasts/discovery/artwork'), (route) => {
    const body = stand.directory.art.get(new URL(route.request().url()).searchParams.get('id'));
    if (!body) return json(route, 404, {error: 'artwork not found', code: 'artwork_not_found'});
    return route.fulfill({status: 200, contentType: 'image/jpeg', body});
  });
  await ctx.route(at('/podcasts/follow'), (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const {feed_url: feedUrl, private: isPrivate} = route.request().postDataJSON() ?? {};
    const seeded = pod.shows.find((s) => s.feed.feed_url === feedUrl);
    if (seeded) {
      const show = stand.shows.find((s) => s.path === seeded.folder);
      return json(route, 200, {state: 'following', show: {...show, following: true}});
    }
    const request = stand.request(stand.nextId++, 'queued', feedLabel(feedUrl), 0, {private: isPrivate === true});
    stand.requests.unshift(request);
    return json(route, 202, {state: 'subscribing', request});
  });
  await ctx.route(at('/me/podcasts'), async (route) => {
    const res = await route.fetch();
    const mine = await res.json();
    return route.fulfill({response: res, json: {...mine, requests: stand.requests}});
  });
  await ctx.route(at('/podcasts/opml/import'), (route) => {
    // Once only, however often the page uploads (a repeat would list each request twice).
    if (!stand.requests.includes(stand.importRequests[0])) stand.requests.unshift(...stand.importRequests);
    return json(route, 200, {library_id: pod.library.id, rows: stand.importRows});
  });
}

// The stand-in's state: the library's real shows (for a 200 follow), the follow requests
// `/me/podcasts` lists (one being added and one that failed to start with), and the
// import's first wave.
async function findShowsStand(pod) {
  const shows = (await api(pod.admin, 'GET', `/libraries/${pod.library.id}/podcasts`, undefined, PODCAST_CLIENT))?.shows ?? [];
  const request = (id, state, feed, ago, extra = {}) => ({
    id, library_id: pod.library.id, state, feed, private: false, show_path: null, error: null,
    created_at: stamp(Date.now() - ago), updated_at: stamp(Date.now() - Math.max(0, ago - MIN)), ...extra,
  });
  const imported = [
    ['feeds.marketday.example', 'queued'], ['audio.hillwalkers.example', 'queued'], ['rss.quietpages.example', 'queued'],
    ['members.tidewater.example', 'queued', true], ['feeds.boatyard.example', 'running'],
  ];
  const importRequests = imported.map(([host, state, isPrivate], i) => request(101 + i, state, `https://${host}/...`, 20_000 - i * 1000, {private: !!isPrivate}));
  const row = (outline_index, status, extra = {}) => ({
    outline_index, status, feed: null, private: false, path: null, request_id: null, duplicate_of: null, error: null, ...extra,
  });
  const slow = pod.shows.find((s) => s.folder === seededResult(pod).folder);
  const lantern = pod.shows.find((s) => s.folder === PODCAST_SHOW);
  const importRows = [
    row(2, 'followed', {feed: feedLabel(slow.feed.feed_url), path: slow.folder}),
    row(3, 'already_following', {feed: feedLabel(lantern.feed.feed_url), path: lantern.folder}),
    ...importRequests.map((r, i) => row(4 + i, 'queued', {feed: r.feed, private: r.private, request_id: r.id})),
    row(9, 'duplicate', {feed: importRequests[0].feed, duplicate_of: 4}),
    row(10, 'invalid', {error: {code: 'invalid_feed_url', message: 'invalid feed URL'}}),
    // The follow that failed earlier (request 88, below), passed over: it shows that reason.
    row(11, 'error', {
      feed: 'https://www.oldmill.example/...', request_id: 88,
      error: {code: 'recently_failed', message: 'Following this feed failed within the last hour. Follow it on its own to try again.'},
    }),
    ...['feeds.northlight.example', 'audio.cellarclub.example', 'rss.weekendwalks.example'].map((host, i) =>
      row(12 + i, 'limited', {feed: `https://${host}/...`}),
    ),
  ];
  return {
    shows,
    directory: findShowsDirectory(pod),
    request,
    nextId: 92,
    requests: [
      request(91, 'running', 'https://feeds.harbourlights.example/...', 4 * MIN),
      request(88, 'failed', 'https://www.oldmill.example/...', 40 * MIN, {error: {code: 'not_a_feed', message: 'not a podcast feed'}}),
    ],
    importRequests,
    importRows,
  };
}

// The OPML list the import shot chooses (the stand-in answers it, so only its name and
// that it is OPML matter).
const FIND_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><head><title>My podcasts</title></head><body>
<outline text="Food"><outline type="rss" text="The Slow Kitchen" xmlUrl="https://feeds.example.com/the-slow-kitchen.xml"/></outline>
</body></opml>
`;

async function captureFindShows(ctx, pod, cid) {
  const stand = await findShowsStand(pod);
  const findUrl = (section) =>
    `${BASE}find-shows?connection=${encodeURIComponent(cid)}&library=${pod.library.id}&section=${section}`;
  // Search, follow two results (one the library has, one new), and wait for the rows.
  const searchAndFollow = async (p, {follow}) => {
    await p.goto(findUrl('search'), {waitUntil: 'networkidle', timeout: 45000});
    await tid(p, 'directory-search-input').fill(FIND_QUERY);
    await tid(p, 'directory-search-submit').click({timeout: 8000});
    await firstVisible(p.getByTestId('discovery-result')).waitFor({timeout: 15000});
    if (follow) {
      await p.getByRole('button', {name: `Follow ${seededResult(pod).title}`}).click({timeout: 8000});
      await firstVisible(p.getByRole('button', {name: 'Open show'})).waitFor({timeout: 15000});
      await p.getByRole('button', {name: `Follow ${newResult(pod).title}`}).click({timeout: 8000});
      await tid(p, 'discovery-result-adding').waitFor({timeout: 15000});
    }
    await imagesLoaded(p, '/podcasts/discovery/artwork');
    await sleep(SETTLE_MS);
  };
  const desk = await sameDevice(ctx);
  try {
    await routeFindShows(desk, pod, stand);
    const p = await desk.newPage();
    if (wanted(FIND_SHOTS.search)) {
      await step('podcasts: find shows search', async () => {
        await searchAndFollow(p, {follow: true});
        await p.mouse.move(0, 0);
        await shoot(p, FIND_SHOTS.search);
      });
    }
    if (wanted(FIND_SHOTS.address)) {
      await step('podcasts: find shows address', async () => {
        // The queued request the search shot's follow adds, when that shot didn't run.
        if (!stand.requests.some((r) => r.state === 'queued')) {
          const feed = feedLabel(stand.directory.results.find((r) => r.title === newResult(pod).title).feed_url);
          stand.requests.unshift(stand.request(stand.nextId++, 'queued', feed, 0));
        }
        await p.goto(findUrl('address'), {waitUntil: 'networkidle', timeout: 45000});
        await tid(p, 'follow-requests').waitFor({timeout: 15000});
        await tid(p, 'feed-address').fill('https://members.example.net/rss/8f3a2c');
        await tid(p, 'private-feed').click({timeout: 8000});
        await sleep(SETTLE_MS);
        await p.mouse.move(0, 0);
        await shoot(p, FIND_SHOTS.address);
      });
    }
    if (wanted(FIND_SHOTS.import)) {
      await step('podcasts: find shows import', async () => {
        await p.goto(findUrl('import'), {waitUntil: 'networkidle', timeout: 45000});
        const chooser = p.waitForEvent('filechooser', {timeout: 15000});
        await tid(p, 'opml-choose').click({timeout: 8000});
        await (await chooser).setFiles({name: 'podcast-subscriptions.opml', mimeType: 'text/x-opml', buffer: Buffer.from(FIND_OPML)});
        await tid(p, 'opml-summary').waitFor({timeout: 15000});
        await p.getByText('Waiting for the shows being added', {exact: false}).waitFor({timeout: 15000});
        // Every row of the list, not the first 900 px.
        await fitViewportTo(p, p.getByTestId('opml-import'));
        try {
          await sleep(SETTLE_MS);
          await p.mouse.move(0, 0);
          await shoot(p, FIND_SHOTS.import);
        } finally {
          await p.setViewportSize(DESKTOP_CONTEXT.viewport);
        }
      });
    }
  } finally {
    await desk.close();
  }
  if (wanted(FIND_SHOTS.phone)) {
    const phone = await sameDevice(ctx, {viewport: PHONE});
    try {
      await routeFindShows(phone, pod, stand);
      const p = await phone.newPage();
      await step('podcasts: phone find shows', async () => {
        await searchAndFollow(p, {follow: false});
        await shoot(p, FIND_SHOTS.phone);
      });
    } finally {
      await phone.close();
    }
  }
}

if (wanted(...Object.values(PODCAST_SHOTS), ...Object.values(FIND_SHOTS))) {
  console.log('== podcasts ==');
  const pod = {admin: null, library: null, moduleOn: false, shows: [], directory: [], marks: null};
  try {
    await step('provision podcasts', () => provisionPodcasts(pod));
    if (pod.library) await step('podcasts', () => capturePodcasts(pod));
  } finally {
    if (pod.admin) await step('remove podcasts', () => unprovisionPodcasts(pod));
  }
}

// The connect start screen, done once the probe card shows what it found. A served
// player that asks its own server on open has no address field; one that has the field
// gets the server's address typed and Continue pressed.
async function probeServer(page, origin) {
  await tid(page, 'connect-start').waitFor({timeout: 15000});
  const field = firstVisible(page.getByRole('textbox', {name: 'Server address'}));
  if (await field.count()) {
    await field.fill(origin);
    await firstVisible(page.getByRole('button', {name: 'Continue', exact: true})).click({timeout: 8000});
  }
  await tid(page, 'probe-notice').waitFor({timeout: 15000});
}

// From the probe card: Sign in, by username and password.
async function signInWithPassword(page, username, password) {
  await firstVisible(page.getByRole('button', {name: /^Sign in to /})).click({timeout: 8000});
  await tid(page, 'sign-in-step').waitFor({timeout: 8000});
  await firstVisible(page.getByRole('radio', {name: 'Username and password'})).click({timeout: 8000});
  await firstVisible(page.getByLabel('Username', {exact: true})).fill(username);
  await firstVisible(page.getByLabel('Password', {exact: true})).fill(password);
  await firstVisible(page.getByRole('button', {name: 'Sign in', exact: true})).click({timeout: 8000});
}

// ── Household: profiles, members, kids mode, listening in the house, Cast ───
// These shots need people, not the demo: a demo account can't share what it listens to
// or add household members, and profiles, PINs and kids mode live in this browser's
// localStorage, set up by driving the UI as a family would. Who is made, how, and what
// each shot drives: README.md (the household shots). provisionHouse makes the accounts,
// captureHouse drives the UI, unprovisionHouse removes them and their traces again.
const HOUSE_PASSWORD = 'household-demo';
const HOUSE_VIEWER = {username: 'ellen', name: 'Ellen', q: 'Christmas Carol', at: 0.4};
// The others on Ellen's device who sign in with their own account, in order.
const HOUSE_DEVICE = [{username: 'jamie', name: 'Jamie', pin: '2468'}];
// The housemates who share; `live` keeps saving (Listening now), the other stops after
// two saves, so the house shows it Paused once its last save is a minute old.
const HOUSE_MATES = [
  {username: 'jamie', q: 'Hound of the Baskervilles', at: 0.35, live: true},
  {username: 'rosa', q: 'Call of the Wild', at: 0.62},
];
// Ellen's collection for Leo (title substrings of seeded books) and Ellen's household members.
// Leo (`here`: signed in on Ellen's device from Leo's member card) comes from the API. Ruth
// is added with the add dialog when its code-step shot is wanted, else from the API.
const KIDS_COLLECTION = {name: "Leo's stories", books: ["Alice's Adventures", 'Looking-Glass', 'Christmas Carol']};
const KID = {name: 'Leo', username: 'leo', kind: 'kid', access: 'collections', here: true};
const GROWNUP = {name: 'Ruth', username: 'ruth', kind: 'grownup', access: 'all'};
// The add-a-kid shot's name, typed and never saved.
const ADD_KID_NAME = 'Mia';
const KIDS_STORY = 'Alice';
// Every account the household makes (and a previous, interrupted run may have left).
const HOUSE_USERNAMES = [...new Set([HOUSE_VIEWER, ...HOUSE_DEVICE, ...HOUSE_MATES, KID, GROWNUP].map((p) => p.username))];
// The accounts the admin API makes (the members are Ellen's).
const HOUSE_ACCOUNTS = [...new Set([HOUSE_VIEWER, ...HOUSE_DEVICE, ...HOUSE_MATES].map((p) => p.username))];
// The share runs from before household members made for Leo's account, removed if one was
// left. A migration crutch: remove it (and its cleanup in provisionHouse) once no
// hand-run server from before household members is about (run.sh starts each one empty).
const OLD_KIDS_SHARE = 'Stories';
// The server reports a housemate as playing while their newest save is under a minute
// old (catalog livePlaying), paused up to ten minutes (SessionGap), then only "recent".
// It stamps a save with its own clock, so a save can't be backdated: the Home shot waits
// for the paused housemate in real time (houseState), and saves them once more first
// when their last save is older than this, well inside the ten minutes.
const HOUSE_RESAVE_AFTER_MS = 5 * MIN;
const HOUSE_SHOTS = {
  device: 'web-player/household-device.png',
  page: 'web-player/household.png',
  member: 'web-player/household-member.png',
  addKid: 'web-player/household-add-kid.png',
  addGrownUp: 'web-player/household-add-grownup.png',
  phonePage: 'web-player/phone-household.png',
  profiles: 'web-player/profiles.png',
  homeHouse: 'web-player/home-house.png',
  bookHouse: 'web-player/book-in-the-house.png',
  kids: 'web-player/kids.png',
  phoneKids: 'web-player/phone-kids.png',
  cast: 'web-player/player-cast.png',
};
// The shots that show Leo: Leo (and Leo's collection) are made only when one is wanted.
const KID_SHOTS = ['device', 'member', 'page', 'profiles', 'kids', 'phoneKids'].map((k) => HOUSE_SHOTS[k]);

// Kids mode's bedtime card reads the clock: every household context runs in a fixed-offset
// zone where it is 8 pm now (after Leo's 7:30 pm bedtime), so the card says "It's bedtime"
// on every run.
function eveningZone() {
  const offset = ((20 - new Date().getUTCHours() + 24 + 10) % 24) - 10; // -10..13 hours
  return offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

// Make the household's accounts into `house` (see newHouse), recording each as it is
// made, so unprovisionHouse removes whatever a failure half-way left. Anything an
// interrupted earlier run left (the accounts, the old share) is removed first.
// `viewerOnly` (a run that only wants the Cast shot) makes Ellen and Ellen's book on the
// go alone.
const newHouse = () => ({admin: null, users: [], members: [], beat: null, mates: [], save: null, ready: false});

async function provisionHouse(house, {viewerOnly = false} = {}) {
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set: no household to provision');
  const {token: admin} = await api(null, 'POST', '/auth/login', {username: 'admin', password: ADMIN_PASSWORD});
  house.admin = admin;
  const stale = ((await api(admin, 'GET', '/admin/users'))?.users ?? []).filter((u) => HOUSE_USERNAMES.includes(u.username));
  // Deleting an owner deletes their members too: a member goes by itself only when its
  // owner isn't one of these.
  const staleIds = new Set(stale.map((u) => u.id));
  for (const u of stale.filter((x) => !staleIds.has(x.managed_by?.id))) {
    await api(admin, 'DELETE', `/admin/users/${u.id}`).catch(() => {});
  }
  const staleShares = ((await api(admin, 'GET', '/admin/shares'))?.shares ?? []).filter((s) => s.name === OLD_KIDS_SHARE);
  for (const s of staleShares) await api(admin, 'DELETE', `/admin/shares/${s.id}`);
  if (stale.length || staleShares.length) {
    console.log(`  ✓ removed a previous run's ${[...stale.map((u) => u.username), ...staleShares.map((s) => `"${s.name}"`)].join(', ')}`);
  }
  const [library] = (await api(admin, 'GET', '/admin/libraries')).libraries;
  const {books} = await api(admin, 'GET', `/libraries/${library.id}/books?limit=200`);
  const find = (t) => {
    const b = books.find((x) => `${x.title} ${x.rel_path}`.includes(t));
    if (!b) throw new Error(`no seeded book matching "${t}"`);
    return b;
  };
  const names = viewerOnly ? [HOUSE_VIEWER.username] : HOUSE_ACCOUNTS;
  for (const username of names) {
    const made = await api(admin, 'POST', '/admin/users', {username, password: HOUSE_PASSWORD, role: 'user'});
    const id = made?.user?.id ?? made?.id;
    house.users.push(id);
    await api(admin, 'POST', '/admin/library-access', {user_id: id, library_id: library.id});
  }
  const progress = (token, book, body, client) =>
    api(token, 'PUT', `/libraries/${library.id}/progress${pathQuery(book.rel_path)}`, {
      duration: book.duration,
      updated_at: new Date().toISOString(),
      version: Date.now(),
      ...body,
    }, client ? {'x-audiosilo-client': client} : {});
  const login = async (username) =>
    (await api(null, 'POST', '/auth/login', {username, password: HOUSE_PASSWORD, device_name: `${username}'s phone`})).token;

  // Ellen's book on the go (one save: a place, no listening), so Ellen's Home has a Now
  // card; then, as Ellen through the player's API, Leo's collection and Ellen's household
  // members.
  {
    const token = await login(HOUSE_VIEWER.username);
    try {
      const b = find(HOUSE_VIEWER.q);
      await progress(token, b, {position: b.duration * HOUSE_VIEWER.at});
      // Each member spends the server's self-service rate limit: only the ones a wanted
      // shot shows. The add-a-kid shot lists Leo's collection too.
      const wantKid = wanted(...KID_SHOTS);
      const members = [
        ...(wantKid ? [KID] : []),
        ...(wanted(HOUSE_SHOTS.page) && !wanted(HOUSE_SHOTS.addGrownUp) ? [GROWNUP] : []),
      ];
      const collection = wantKid || wanted(HOUSE_SHOTS.addKid) ? KIDS_COLLECTION.name : undefined;
      if (!viewerOnly && (collection || members.length)) {
        const made = await addHousehold(api, token, library.id, {
          collection,
          items: KIDS_COLLECTION.books.map((t) => find(t).rel_path),
          members,
        });
        house.members.push(...made.members);
      }
    } finally {
      await api(token, 'POST', '/auth/logout').catch(() => {});
    }
  }
  if (viewerOnly) {
    house.ready = true;
    console.log(`  ✓ household: ${HOUSE_VIEWER.username} only (the Cast shot)`);
    return;
  }
  // The housemates: sharing on, then two saves 15 s apart (a session with listening in
  // it: the server counts listening only as fast as its own clock runs between two
  // saves, so this wait is real); the live one keeps saving every 15 s until
  // unprovisionHouse.
  for (const m of HOUSE_MATES) {
    const token = await login(m.username);
    await api(token, 'PUT', '/me/household', {share_listening: true});
    const book = find(m.q);
    house.mates.push({...m, token, book, pos: book.duration * m.at, last: 0});
  }
  house.save = (m) => {
    const now = Date.now();
    if (m.last) m.pos = Math.min(m.book.duration, m.pos + (now - m.last) / 1000);
    m.last = now;
    return progress(m.token, m.book, {position: m.pos, playback_speed: 1, device_id: `${m.username}-phone`}, 'AudioSilo/2.0.0 (ios)');
  };
  for (const m of house.mates) await house.save(m);
  await sleep(15000);
  for (const m of house.mates) await house.save(m);
  house.beat = setInterval(() => {
    for (const m of house.mates.filter((x) => x.live)) {
      house.save(m).catch((e) => console.log(`  ! heartbeat for ${m.username}: ${e.message}`));
    }
  }, 15000);
  house.ready = true;
  console.log(
    `  ✓ household: ${names.join(', ')} (${HOUSE_MATES.map((m) => m.username).join(' and ')} share); ` +
      `${HOUSE_VIEWER.username}'s members ${house.members.map((m) => `${m.username} (${m.kind})`).join(', ') || 'none yet'}`,
  );
}

// Wait until the server reports housemate `username` as `state` (asked as another
// housemate, who shares too and so sees them): the state comes from the age of their
// newest save, so this waits in real time.
async function houseState(house, username, state, timeoutMs = 2 * MIN) {
  const viewer = house.mates.find((m) => m.username !== username);
  const until = Date.now() + timeoutMs;
  for (;;) {
    const {listening} = await api(viewer.token, 'GET', '/household/listening');
    const row = (listening ?? []).find((r) => r.username === username);
    if (row?.state === state) return;
    if (Date.now() > until) throw new Error(`the server never reported ${username} as ${state} (last: ${row?.state ?? 'not listed'})`);
    await sleep(2000);
  }
}

async function unprovisionHouse(house) {
  if (house.beat) clearInterval(house.beat);
  // Deleting Ellen deletes Ellen's members too.
  for (const id of house.users) await api(house.admin, 'DELETE', `/admin/users/${id}`).catch(() => {});
  await api(house.admin, 'POST', '/auth/logout').catch(() => {});
  // Every household sign-in is also a "New sign-in" server event, which names no user row
  // and so outlives the account: take those out too, or the Events shot lists them. Ellen's
  // member writes (member.create, member.session, ...) are Ellen's in the audit log: out too.
  const names = HOUSE_USERNAMES.map((u) => `'${u}'`).join(', ');
  try {
    sqlite(`DELETE FROM server_events WHERE kind = 'new_device' AND json_extract(data, '$.user') IN (${names});`);
    sqlite(`DELETE FROM audit_events WHERE actor_name IN (${names});`);
  } catch (e) {
    console.log(`  ! household sign-ins or member writes left in the server's feeds: ${e.message}`);
  }
  console.log('  ✓ household accounts removed again');
}

// The Household page, by its route (`you?section=household` on a phone). A reload is a
// launch, and with two people on the device it asks "Who's listening?" first: close it.
async function openHousehold(page, route = 'household') {
  await page.goto(BASE + route, {waitUntil: 'networkidle', timeout: 45000});
  const household = tid(page, 'household-page');
  await household.or(tid(page, 'profiles-screen')).waitFor({timeout: 15000});
  if (await tid(page, 'profiles-close').count()) await tid(page, 'profiles-close').click({timeout: 8000});
  await household.waitFor({timeout: 15000});
  await sleep(SETTLE_MS);
  await page.mouse.move(0, 0);
}

// The Household page, opened again only when the browser isn't on it or a dialog covers
// it (a reload is a launch, and a launch asks "Who's listening?").
async function ensureHousehold(page) {
  const onIt = (await tid(page, 'household-page').count()) > 0;
  const dialog = (await firstVisible(page.getByRole('dialog')).count()) > 0;
  if (!onIt || dialog) await openHousehold(page);
}

// A person's card in "On this device", by the name it shows.
const personCard = (page, name) =>
  firstVisible(
    page.locator('[data-testid^="household-person-"]').filter({has: page.getByRole('heading', {name, exact: true})}),
  );

// Rename a person on this device (Household): usernames are lower case, people aren't.
async function renamePerson(page, from, to) {
  await personCard(page, from).getByRole('button', {name: `Rename ${from}`}).click({timeout: 8000});
  await firstVisible(page.getByTestId('rename-field')).fill(to);
  await firstVisible(page.getByRole('button', {name: 'Save', exact: true})).click({timeout: 8000});
  await personCard(page, to).waitFor({timeout: 8000});
}

// Shoot one element (a card) with a margin round it, after scrolling it into view. The
// default margin stays under the 12 px between the Household page's cards (gap-3), so no
// neighbour shows at the edges.
async function shootElement(page, locator, file, margin = 8) {
  await locator.evaluate((el) => el.scrollIntoView({block: 'center'}));
  await sleep(SETTLE_MS);
  await page.mouse.move(0, 0);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`nothing to shoot for ${file}`);
  await shoot(page, file, {clip: around([box], margin)});
}

// The kids screen, choosing the child on "Who's listening?" when a launch asks first, with
// the story loaded and paused (a still frame).
async function kidsStaged(page, kidName) {
  await page.goto(BASE, {waitUntil: 'networkidle', timeout: 45000});
  const kids = tid(page, 'kids-screen');
  await kids.or(tid(page, 'profiles-screen')).waitFor({timeout: 15000});
  if (!(await kids.count())) {
    await firstVisible(page.getByRole('button', {name: new RegExp(`^${escapeRe(kidName)},`)})).click({timeout: 8000});
  }
  await kids.waitFor({timeout: 15000});
  const player = tid(page, 'kids-player');
  if (!(await player.count())) {
    await firstVisible(page.getByRole('button', {name: new RegExp(`^Play ${escapeRe(KIDS_STORY)}`)})).click({timeout: 8000});
    await player.waitFor({timeout: 15000});
  }
  // The play button is named Play while the story loads (a spinner) and once paused,
  // Pause while it plays: pause it once it plays.
  const play = tid(page, 'kids-play');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="kids-play"]')?.getAttribute('aria-label') === 'Pause',
    null,
    {timeout: 20000},
  );
  await play.click({timeout: 8000});
  await page.waitForFunction(
    () => document.querySelector('[data-testid="kids-play"]')?.getAttribute('aria-label') === 'Play',
    null,
    {timeout: 8000},
  );
  await sleep(SETTLE_MS);
  await page.mouse.move(0, 0);
}

// A second context on the household browser's storage (the same device: its people,
// PINs and kids mode), with `options` on top. `light`: the app's own theme pick is light
// too (it keeps one in storage, which wins over the browser's scheme).
async function sameDevice(ctx, options = {}, {light = false} = {}) {
  const storageState = await ctx.storageState();
  const other = await newCaptureContext({...options, storageState, ...(light ? {colorScheme: 'light'} : {})});
  if (light) {
    await other.addInitScript(() => {
      try {
        // The app's storage holds JSON values.
        localStorage.setItem('audiosilo.theme', JSON.stringify('light'));
      } catch {
        /* storage blocked: the browser's scheme decides */
      }
    });
  }
  return other;
}

async function captureHouse(house) {
  const timezoneId = eveningZone();
  const origin = new URL(BASE).origin;
  const ctx = await newCaptureContext({timezoneId});
  const kid = house.members.find((m) => m.kind === 'kid');
  try {
    const page = await ctx.newPage();
    // Ellen on a fresh browser, then Jamie with "Sign in someone who already has an
    // account" (a new person, who becomes the one listening), each renamed; back to
    // Ellen, who gives Jamie a PIN and signs Leo in from Leo's member card.
    let peopleReady = false;
    await step('household: people', async () => {
      await page.goto(BASE + 'connect', {waitUntil: 'networkidle', timeout: 45000});
      await probeServer(page, origin);
      await signInWithPassword(page, HOUSE_VIEWER.username, HOUSE_PASSWORD);
      await tid(page, 'ready-screen').waitFor({timeout: 15000});
      await openHousehold(page);
      await renamePerson(page, HOUSE_VIEWER.username, HOUSE_VIEWER.name);
      for (const p of HOUSE_DEVICE) {
        await tid(page, 'household-sign-in-existing').click({timeout: 8000});
        await probeServer(page, origin);
        await signInWithPassword(page, p.username, HOUSE_PASSWORD);
        await tid(page, 'top-bar-profile').waitFor({timeout: 15000});
        await openHousehold(page);
        await renamePerson(page, p.username, p.name);
      }
      await firstVisible(page.getByRole('button', {name: `Switch to ${HOUSE_VIEWER.name}`})).click({timeout: 8000});
      await tid(page, 'top-bar-(home)').waitFor({timeout: 15000});
      await openHousehold(page);
      for (const p of HOUSE_DEVICE.filter((x) => x.pin)) {
        await firstVisible(page.getByRole('button', {name: `Set a PIN for ${p.name}`})).click({timeout: 8000});
        const field = firstVisible(page.getByTestId('pin-field'));
        await field.pressSequentially(p.pin, {delay: 50});
        await firstVisible(page.getByText('Enter the PIN again')).waitFor({timeout: 8000});
        await field.pressSequentially(p.pin, {delay: 50});
        await field.waitFor({state: 'hidden', timeout: 15000});
      }
      // The members Ellen signs in here: a profile of their own (a kid's in kids mode),
      // Ellen still the one listening.
      for (const m of house.members.filter((x) => x.here)) {
        await tid(page, `member-here-${m.id}`).click({timeout: 15000});
        await personCard(page, m.name).waitFor({timeout: 15000});
        // Its toast ("Leo is signed in on this device too.") is dismissed before any shot.
        const toastLine = page.getByText(`${m.name} is signed in on this device too.`).first();
        await toastLine.waitFor({timeout: 8000}).catch(() => {});
        await toastLine
          .locator('xpath=ancestor::div[.//*[@aria-label="Dismiss"]][1]')
          .getByRole('button', {name: 'Dismiss', exact: true})
          .click({timeout: 8000})
          .catch(() => {});
        await toastLine.waitFor({state: 'hidden', timeout: 15000});
      }
      // Ellen shares (the switch settles on the server's answer).
      const share = /^Share what I'm listening to with the house/;
      await firstVisible(page.getByRole('switch', {name: share})).click({timeout: 8000});
      await firstVisible(page.getByRole('switch', {name: share, checked: true})).waitFor({timeout: 8000});
      console.log(`  ✓ ${[HOUSE_VIEWER, ...HOUSE_DEVICE, ...house.members.filter((m) => m.here)].map((p) => p.name).join(', ')} on this device`);
      peopleReady = true;
    });
    // A household set up half-way would shoot the wrong state over the committed shots:
    // they keep their previous images instead.
    if (!peopleReady) return;

    if (wanted(HOUSE_SHOTS.device) && kid) {
      // The kid's card in "On this device" at the top of a taller window: kids mode and
      // bedtime, then "Ask who's listening" under it.
      await step('household: on this device', async () => {
        await page.setViewportSize({width: 1440, height: 1000});
        try {
          await scrollToTop(personCard(page, kid.name));
          await page.mouse.move(0, 0);
          await shoot(page, HOUSE_SHOTS.device);
        } finally {
          await page.setViewportSize({width: 1440, height: 900});
        }
      });
    }

    if (wanted(HOUSE_SHOTS.member) && kid) {
      // Leo's member card, signed in here (so marked On this device, with this device in
      // Their devices), in a window tall enough for all of it.
      await step('household: member card', async () => {
        await page.setViewportSize({width: 1440, height: 1200});
        try {
          const card = tid(page, `member-${kid.id}`);
          await card.getByText('This device', {exact: true}).waitFor({timeout: 15000});
          await shootElement(page, card, HOUSE_SHOTS.member);
        } finally {
          await page.setViewportSize({width: 1440, height: 900});
        }
      });
    }

    if (wanted(HOUSE_SHOTS.addGrownUp)) {
      // Ruth added (Kids account off: Everything I can listen to), at the code step: "Show
      // Ruth this code", the QR and "They'll also use this device". Before the page shot,
      // which shows Ruth's card.
      await step('household: add a grown-up', async () => {
        await ensureHousehold(page);
        await firstVisible(page.getByRole('button', {name: 'Add someone to your household'})).click({timeout: 8000});
        await tid(page, 'add-member-name').fill(GROWNUP.name);
        await tid(page, 'add-member-kids').click({timeout: 8000});
        await tid(page, 'access-all').waitFor({timeout: 8000});
        await tid(page, 'add-member-submit').click({timeout: 8000});
        await firstVisible(page.getByText(`Show ${GROWNUP.name} this code`)).waitFor({timeout: 15000});
        await tid(page, 'add-grownup-also-here').waitFor({timeout: 8000});
        await tid(page, 'pair-countdown').waitFor({timeout: 15000});
        await sleep(SETTLE_MS);
        await page.mouse.move(0, 0);
        await shoot(page, HOUSE_SHOTS.addGrownUp);
        await tid(page, 'add-grownup-done').click({timeout: 8000});
        await tid(page, 'add-member-dialog').waitFor({state: 'hidden', timeout: 8000});
      });
    }

    if (wanted(HOUSE_SHOTS.page)) {
      // The same page in light, scrolled to "Your household": the member cards, Add
      // someone to your household with its count, then Listening in the house (a window
      // as tall as all of it, and no taller).
      await step('household: page (light)', async () => {
        const height = 1650;
        const light = await sameDevice(ctx, {viewport: {width: 1440, height}, timezoneId}, {light: true});
        try {
          const p = await light.newPage();
          await openHousehold(p);
          await firstVisible(p.getByRole('button', {name: 'Add someone to your household'})).waitFor({timeout: 15000});
          // Leo's and Ruth's cards: Ruth comes from the add-a-grown-up step, which can fail
          // before it saves; without both cards the shot keeps its previous image.
          const members = tid(p, 'household-members');
          for (const name of [KID.name, GROWNUP.name]) {
            await firstVisible(members.getByRole('heading', {name, exact: true})).waitFor({timeout: 15000});
          }
          // Leo's devices, read with Leo's own token here, mark this browser: no skeleton rows.
          await firstVisible(members.getByText('This device', {exact: true})).waitFor({timeout: 15000});
          await scrollToTop(members);
          // Everything from "Your household" down is shorter than the window, so the scroll
          // stops with a strip of the card above showing: take that off the window's
          // height and scroll again.
          const box = await members.boundingBox();
          const scroller = await tid(p, 'household-scroll').boundingBox();
          const extra = box && scroller ? Math.floor(box.y - scroller.y - 16) : 0;
          if (extra > 0) {
            await p.setViewportSize({width: 1440, height: height - extra});
            await scrollToTop(members);
          }
          await p.mouse.move(0, 0);
          await shoot(p, HOUSE_SHOTS.page);
        } finally {
          await light.close();
        }
      });
    }

    if (wanted(HOUSE_SHOTS.phonePage)) {
      // The Me tab's Household segment on a phone (the same device's storage).
      await step('household: phone', async () => {
        const phone = await sameDevice(ctx, {viewport: PHONE, timezoneId});
        try {
          const p = await phone.newPage();
          await openHousehold(p, 'you?section=household');
          await shoot(p, HOUSE_SHOTS.phonePage);
        } finally {
          await phone.close();
        }
      });
    }

    if (wanted(HOUSE_SHOTS.addKid)) {
      // "Add someone to your household" for a kid: a name typed, Kids account on, Only
      // collections I share with "<Name>'s books" chosen (created on save). Cancelled: the
      // form saves nothing.
      await step('household: add a kid', async () => {
        await ensureHousehold(page);
        await firstVisible(page.getByRole('button', {name: 'Add someone to your household'})).click({timeout: 8000});
        await tid(page, 'add-member-name').fill(ADD_KID_NAME);
        await tid(page, 'create-member-books').click({timeout: 15000});
        await tid(page, 'pick-new-books').waitFor({timeout: 8000});
        await sleep(SETTLE_MS);
        await page.mouse.move(0, 0);
        await shoot(page, HOUSE_SHOTS.addKid);
        await firstVisible(tid(page, 'add-member-dialog').getByRole('button', {name: 'Cancel', exact: true})).click({timeout: 8000});
        await tid(page, 'add-member-dialog').waitFor({state: 'hidden', timeout: 8000});
      });
    }

    if (wanted(HOUSE_SHOTS.profiles)) {
      await step('household: who is listening', async () => {
        await ensureHousehold(page);
        await firstVisible(page.getByRole('button', {name: "Who's listening?", exact: true})).click({timeout: 8000});
        await tid(page, 'profiles-screen').waitFor({timeout: 8000});
        await sleep(SETTLE_MS);
        await page.mouse.move(0, 0);
        await shoot(page, HOUSE_SHOTS.profiles);
        await tid(page, 'profiles-close').click({timeout: 8000});
        await tid(page, 'profiles-screen').waitFor({state: 'hidden', timeout: 8000});
      });
    }

    if (wanted(HOUSE_SHOTS.homeHouse, HOUSE_SHOTS.bookHouse)) {
      // Home once the paused housemate reads as paused; the house row in the middle of
      // the window. Then the live housemate's book, from their card.
      await step('household: home', async () => {
        const live = HOUSE_MATES.find((m) => m.live);
        const paused = HOUSE_MATES.find((m) => !m.live);
        // Home asks the house when it opens, then once a minute: open it once the server
        // already says paused, so its first answer does (a save first if a slow run
        // left the last one near the ten minutes after which a session reads as ended).
        const mate = house.mates.find((m) => m.username === paused.username);
        if (Date.now() - mate.last > HOUSE_RESAVE_AFTER_MS) await house.save(mate);
        await houseState(house, paused.username, 'paused');
        await tid(page, 'top-bar-(home)').click({timeout: 8000});
        await firstVisible(page.getByRole('button', {name: new RegExp(`^${paused.username} paused `)})).waitFor({timeout: 90000});
        await firstVisible(page.getByRole('button', {name: new RegExp(`^${live.username} is listening to `)})).waitFor({timeout: 8000});
        await firstVisible(page.locator('[data-testid^="house-row-"]')).evaluate((el) => el.scrollIntoView({block: 'center'}));
        await sleep(SETTLE_MS);
        await page.mouse.move(0, 0);
        await shoot(page, HOUSE_SHOTS.homeHouse);
        if (!wanted(HOUSE_SHOTS.bookHouse)) return;
        await firstVisible(page.getByRole('button', {name: new RegExp(`^${live.username} is listening to `)})).click({timeout: 8000});
        await tid(page, 'book-page').waitFor({timeout: 15000});
        await tid(page, 'in-the-house').waitFor({timeout: 30000});
        await sleep(SETTLE_MS);
        await page.mouse.move(0, 0);
        await shoot(page, HOUSE_SHOTS.bookHouse);
      });
    }

    if (wanted(HOUSE_SHOTS.kids, HOUSE_SHOTS.phoneKids) && kid) {
      // The child, chosen on "Who's listening?" (a reload asks), with a story loaded; then
      // the same device at phone width.
      await step('household: kids', async () => {
        await kidsStaged(page, kid.name);
        await shoot(page, HOUSE_SHOTS.kids);
      });
      if (wanted(HOUSE_SHOTS.phoneKids)) {
        await step('household: phone kids', async () => {
          // This device's storage, from the live browser (kidsStaged picks the child itself).
          const phone = await sameDevice(ctx, {viewport: PHONE, timezoneId});
          try {
            const p = await phone.newPage();
            await kidsStaged(p, kid.name);
            await shoot(p, HOUSE_SHOTS.phoneKids);
          } finally {
            await phone.close();
          }
        });
      }
    }
  } finally {
    await ctx.close();
  }
}

// The Cast button shows only on an https page in a Chromium browser, and for a server
// this device reaches at a loopback address (which no receiver could) it is only dimmed,
// explaining instead of casting, under another name; and the
// capture server is plain http on 127.0.0.1. So this step puts a local https proxy in
// front of it, with a throwaway self-signed certificate (openssl, in .cache), and opens
// it under a made-up name that a separate Chromium resolves to 127.0.0.1 (a separate
// browser because --host-resolver-rules is a launch flag: no context option or route
// can make a name resolve). Nothing leaves this machine but the Cast sender script the
// button loads from www.gstatic.com (the button shows without it).
const CAST_HOST = 'audiosilo.shots.test';

// Whether `file` exists and was written less than a day ago.
function freshFile(file) {
  try {
    return Date.now() - statSync(file).mtimeMs < DAY;
  } catch {
    return false;
  }
}

async function captureCast() {
  const dir = path.join(CACHE, 'cast-tls');
  await mkdir(dir, {recursive: true});
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  // The certificate is good for two days: one made in the last day is reused.
  if (!(freshFile(cert) && existsSync(key))) {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
      '-keyout', key, '-out', cert, '-subj', `/CN=${CAST_HOST}`, '-addext', `subjectAltName=DNS:${CAST_HOST}`,
    ], {stdio: 'ignore'});
  }
  const upstream = new URL(BASE);
  // Plain requests only. A websocket upgrade is deliberately not proxied (no 'upgrade'
  // listener, so Node drops it): the shot needs none of the server's live updates.
  const proxy = https.createServer({key: readFileSync(key), cert: readFileSync(cert)}, (req, res) => {
    const up = http.request(
      {host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers: req.headers},
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', () => res.destroy());
    req.pipe(up);
  });
  let castBrowser = null;
  try {
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', resolve);
    });
    const origin = `https://${CAST_HOST}:${proxy.address().port}`;
    castBrowser = await chromium.launch({args: [`--host-resolver-rules=MAP ${CAST_HOST} 127.0.0.1`]});
    const ctx = await newCaptureContext({ignoreHTTPSErrors: true, timezoneId: eveningZone()}, castBrowser);
    const page = await ctx.newPage();
    await page.goto(`${origin}/web/connect`, {waitUntil: 'networkidle', timeout: 45000});
    await probeServer(page, origin);
    await signInWithPassword(page, HOUSE_VIEWER.username, HOUSE_PASSWORD);
    await tid(page, 'ready-screen').waitFor({timeout: 15000});
    await firstVisible(page.getByRole('button', {name: 'Start listening'})).click({timeout: 8000});
    // Ellen's book on the go, from Home's first cover (the Now card's, which may start it
    // at once).
    const card = page.locator('[role="button"]:has(img)').first();
    await card.waitFor({state: 'visible', timeout: 20000});
    await card.click({timeout: 12000});
    await tid(page, 'book-page').waitFor({timeout: 15000});
    await sleep(SETTLE_MS);
    await playThenPause(page, {scope: tid(page, 'shell-docked-player'), ifShown: true});
    await expandPlayer(page);
    await tid(page, 'companion-tab-chapters').click({timeout: 8000});
    // The transport and the action row, centred on the play button.
    const cast = firstVisible(page.getByRole('button', {name: 'Cast', exact: true}));
    await cast.waitFor({timeout: 30000}).catch(() => {
      throw new Error(
        `no enabled Cast button at ${origin}: it shows only in Chromium on an https page, for a book ` +
          'the server can cast (capability cast), and at a loopback address it only explains',
      );
    });
    await sleep(SETTLE_MS);
    await page.mouse.move(0, 0);
    const playBox = await firstVisible(page.getByRole('button', {name: /^play$/i})).boundingBox();
    const castBox = await cast.boundingBox();
    if (!playBox || !castBox) throw new Error('no player controls');
    const cx = playBox.x + playBox.width / 2;
    const top = playBox.y - 150;
    await shoot(page, HOUSE_SHOTS.cast, {
      clip: {x: cx - 420, y: top, width: 840, height: castBox.y + castBox.height + 28 - top},
    });
  } finally {
    await castBrowser?.close();
    // close() alone waits for the browser's kept-alive connections to time out.
    proxy.closeAllConnections();
    proxy.close();
  }
}

if (wanted(...Object.values(HOUSE_SHOTS))) {
  console.log('== household ==');
  // Only the Cast shot wanted: Ellen alone, no housemates to wait on.
  const castOnly = !wanted(...Object.entries(HOUSE_SHOTS).filter(([k]) => k !== 'cast').map(([, f]) => f));
  const house = newHouse();
  try {
    await step('provision household', () => provisionHouse(house, {viewerOnly: castOnly}));
    if (house.ready) {
      if (!castOnly) await step('household', () => captureHouse(house));
      if (wanted(HOUSE_SHOTS.cast)) await step('household: cast button', captureCast);
    }
  } finally {
    if (house.admin) await step('remove household', () => unprovisionHouse(house));
  }
}

// ── Unauthenticated screens ─────────────────────────────────────────────────
console.log('== public screens ==');
// The connect flow on a fresh browser: the start screen with the probe card (the served
// player finds its own server, nothing typed), then a first connection (the admin, by
// username and password: a real account, so the account page has its Password card and
// API keys) to "Your library is ready.", then
// the account page from the profile menu. That player session is signed out again at
// the end, so it never shows in the admin Devices shot.
await step('connect', async () => {
  const ctx = await newCaptureContext();
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + 'connect', {waitUntil: 'networkidle', timeout: 45000});
    await probeServer(page, new URL(BASE).origin);
    await sleep(SETTLE_MS);
    await page.mouse.move(0, 0);
    await shoot(page, 'web-player/connect.png');
    if (!wanted('web-player/connect-ready.png', 'web-player/account.png')) return;
    if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set: no first connection to show');

    await signInWithPassword(page, 'admin', ADMIN_PASSWORD);
    await tid(page, 'ready-screen').waitFor({timeout: 15000});
    await firstVisible(page.getByRole('button', {name: 'Start listening'})).waitFor({timeout: 8000});
    await sleep(3000); // the library sentence and the shelf
    await shoot(page, 'web-player/connect-ready.png');

    if (wanted('web-player/account.png')) {
      await firstVisible(page.getByRole('button', {name: 'Start listening'})).click({timeout: 8000});
      await tid(page, 'top-bar-profile').click({timeout: 15000});
      await firstVisible(page.getByRole('menuitem', {name: /^Account on /})).click({timeout: 8000});
      await firstVisible(page.getByText('Signed-in devices')).waitFor({timeout: 15000});
      await sleep(SETTLE_MS);
      await page.mouse.move(0, 0);
      await shoot(page, 'web-player/account.png');
    }
  } finally {
    // Sign the admin's player session out again, whatever happened above.
    const token = await demoToken(page).catch(() => null);
    if (token) await api(token, 'POST', '/auth/logout').catch(() => {});
    await ctx.close();
  }
});

await step('demo', async () => {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, colorScheme: 'dark'});
  const page = await ctx.newPage();
  await page.goto(BASE + 'demo', {timeout: 45000});
  await sleep(1500); // catch the demo landing before/while the session provisions
  await shoot(page, 'web-player/demo.png');
  await ctx.close();
});

await step('remove the seeded year', unseedListeningYear);

await browser.close();
console.log('capture-web: done.');
