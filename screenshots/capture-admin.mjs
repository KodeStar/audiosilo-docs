// Captures the admin-console + public server-page documentation screenshots.
// Requires a running server (run.sh) and env:
//   AS_ORIGIN       server origin (default http://127.0.0.1:8790)
//   ADMIN_PASSWORD  the first-run admin password (parsed from the log by run.sh)
//   SETUP_URL       optional: a second --setup server's wizard URL (with #token)
//   MIRROR_ORIGIN   optional: a third server in metadata mirror mode with a seeded
//                   local copy (run.sh starts it when it built the meta artifact)
//   MIRROR_PASSWORD that server's first-run admin password
//
// Before capturing it provisions a little demo state through the admin API
// (a listener account, an invite, a share, some listening progress, one
// metadata edit, a scan schedule and skip rules on the seeded library) so the
// console looks lived-in. Three more listeners sign in with a password and keep
// saving progress in the background while the shots are taken, which is what
// makes real listening sessions (Activity, Live now, Sessions, Devices); those
// screens are captured last, once each listener has a few minutes of listening.
// It also names the server and adds a trusted proxy through PATCH
// /admin/settings, so the top bar and Server > Settings show values, makes a
// manual and a scheduled backup, and adds two notification destinations (a
// webhook to a receiver this script runs on 127.0.0.1, which checks every
// request's signature, and an ntfy topic at an address that never answers). For
// the Health shots, after the other admin shots, it
// builds a small "Inbox" library under .cache/inbox (INBOX_DIR overrides) whose
// files produce one of each issue - an empty file, a damaged m4b, two copies of
// one book, a folder of two hour-long books, a long book without chapters, an
// ALAC file - and adds it through the API; that needs ffmpeg on PATH for the
// generated audio (without it those few issues are just missing). The console
// (admin-ui) is driven through its real UI
// with role/label selectors that use the exact English labels from
// audiosilo-server/admin-ui/src/i18n/locales/en.json - if a label changes there,
// change it here too.
import {spawnSync} from 'node:child_process';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {constants as fsc} from 'node:fs';
import http from 'node:http';
import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {CACHE, DAY, MIN, apiClient, isoAgo, pathQuery, sleep, shoot, step, wanted, DESKTOP_CONTEXT} from './lib.mjs';

const ORIGIN = (process.env.AS_ORIGIN || 'http://127.0.0.1:8790').replace(/\/$/, '');
const ADMIN = `${ORIGIN}/admin`;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SETUP_URL = process.env.SETUP_URL || '';
const MIRROR_ORIGIN = (process.env.MIRROR_ORIGIN || '').replace(/\/$/, '');
const MIRROR_PASSWORD = process.env.MIRROR_PASSWORD || '';
const INBOX_DIR = path.resolve(process.env.INBOX_DIR || path.join(CACHE, 'inbox'));
if (!PASSWORD) {
  console.error('capture-admin: ADMIN_PASSWORD is required');
  process.exit(1);
}

// ── Provision demo state via the API ────────────────────────────────────────
const api = apiClient(ORIGIN);

// Waits until no library scans or waits in the job queue (scans run one at a time).
const waitForScans = async (token, timeoutMs = 90000) => {
  const until = Date.now() + timeoutMs;
  await sleep(500);
  while (Date.now() < until) {
    const libs = (await api(token, 'GET', '/admin/libraries'))?.libraries ?? [];
    if (!libs.some((l) => l.scan?.running || l.scan?.queued)) return;
    await sleep(500);
  }
  throw new Error('scans still running after the timeout');
};

let inviteCode = '';
let samId = null;
let library = null; // the seeded library ({id, name, root, ...})
let firstBook = null; // the first book of GET /admin/books ({library_id, path, is_folder, ...})
// Named, so People > Devices lists it as the admin's tablet (it sends no app
// header, so it also shows how an app from before the header reads).
const login = await api(null, 'POST', '/auth/login', {username: 'admin', password: PASSWORD, device_name: 'Kitchen tablet'});
const token = login.token;
console.log('  ✓ admin login');

await step('provision listener + share', async () => {
  const libs = await api(token, 'GET', '/admin/libraries');
  library = (libs.libraries || libs || [])[0] ?? null;
  const libId = library?.id;

  let sam;
  try {
    sam = await api(token, 'POST', '/admin/users', {username: 'sam', role: 'user'});
  } catch {
    const users = await api(token, 'GET', '/admin/users');
    sam = (users.users || []).find((u) => u.username === 'sam');
  }
  samId = sam?.user?.id ?? sam?.id ?? null;
  if (samId && libId) {
    await api(token, 'POST', '/admin/library-access', {user_id: samId, library_id: libId}).catch(() => {});
  }
  if (libId) {
    // A little listening so the overview's "Listening now" and the person
    // cards have something to show.
    const books = (await api(token, 'GET', `/libraries/${libId}/books?limit=3`))?.books ?? [];
    for (const [i, frac] of [[0, 0.42], [1, 0.77]]) {
      const b = books[i];
      if (!b) continue;
      const dur = b.duration || 3600;
      await api(token, 'PUT', `/libraries/${libId}/progress${pathQuery(b.rel_path)}`, {
        position: dur * frac,
        duration: dur,
        updated_at: isoAgo((i + 1) * MIN),
        version: Date.now(),
      }).catch(() => {});
    }
  }
  if (samId) {
    const inv = await api(token, 'POST', `/admin/users/${samId}/authcode`, {}).catch(() => null);
    // The mint response carries the code as a plain string field: {"auth_code": "XXXX-..."}.
    inviteCode = (typeof inv?.auth_code === 'string' && inv.auth_code) || inv?.code || '';
  }
  if (libId) {
    const share = await api(token, 'POST', '/admin/shares', {name: 'Carroll classics'}).catch(() => null);
    const shareId = share?.share?.id ?? share?.id;
    if (shareId) {
      await api(token, 'POST', `/admin/shares/${shareId}/paths`, {library_id: libId, path: 'Lewis Carroll'}).catch(() => {});
      if (samId) await api(token, 'POST', '/admin/share-access', {user_id: samId, share_id: shareId}).catch(() => {});
    }
  }
  console.log('  ✓ provisioned (sam, invite, share)');
});

await step('provision a metadata edit', async () => {
  // The first book by title: its page, its folder and the match dialog are
  // captured below. One edit gives its Details card an "Edited" marker.
  firstBook = (await api(token, 'GET', '/admin/books?limit=1'))?.books?.[0] ?? null;
  if (!firstBook) throw new Error('no indexed books');
  await api(
    token,
    'PATCH',
    `/admin/libraries/${firstBook.library_id}/book${pathQuery(firstBook.path)}`,
    {set: {narrator: 'LibriVox volunteers'}},
  );
  // One Lewis Carroll book with the author written "Surname, Given", so Library >
  // Authors shows a merge suggestion.
  const carroll = (await api(token, 'GET', `/admin/books?author=${encodeURIComponent('Lewis Carroll')}&limit=1`))?.books?.[0];
  if (carroll) {
    await api(
      token,
      'PATCH',
      `/admin/libraries/${carroll.library_id}/book${pathQuery(carroll.path)}`,
      {set: {author: 'Carroll, Lewis'}},
    );
  }
  console.log('  ✓ provisioned (narrator edit on the first book, a reversed author)');
});

await step('provision scan settings', async () => {
  if (!library) throw new Error('no library');
  // A schedule shows on the library card ("Every 6 hours · next in ..."); new
  // skip rules queue a rescan (trigger "change"), which lands in the history.
  await api(token, 'PATCH', `/admin/libraries/${library.id}`, {
    scan_schedule: 'every:6h',
    ignore_patterns: ['# Publisher samples and bonus material', '*.sample.mp3', 'Extras/'],
  });
  await waitForScans(token);
  console.log('  ✓ provisioned (schedule + skip rules on the seeded library)');
});

await step('provision server settings', async () => {
  // A name shows in the top bar of every shot and on Settings > General; a
  // trusted proxy (a bare address, which the server stores as a /32 range)
  // gives Settings > Network & HTTPS a value. Both apply at once, no restart.
  await api(token, 'PATCH', '/admin/settings', {
    general: {name: 'Hearthside'},
    network: {trusted_proxies: ['10.0.0.2']},
  });
  console.log('  ✓ provisioned (server name, a trusted proxy)');
});

// ── Backups and notifications ───────────────────────────────────────────────
// A manual backup now, and a scheduled one a couple of minutes from now (the
// schedule is put back to daily:03:00 before the Backups shot), so the list
// shows both kinds. Two notification destinations: a webhook to a receiver this
// script runs on 127.0.0.1 (it checks each request's signature, so "Send test"
// arrives and the row reads "Last sent"), and an ntfy topic at a TEST-NET address
// (192.0.2.0/24 is never assigned), so its deliveries time out and the row shows
// how a failure reads. Nothing is sent outside this machine.
const HOOK_SECRET = 'hearthside-docs-secret';
const hookBodies = [];
const hook = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const ts = req.headers['x-audiosilo-timestamp'] ?? '';
    const want = 'sha256=' + createHmac('sha256', HOOK_SECRET).update(`${ts}.`).update(body).digest('hex');
    const got = String(req.headers['x-audiosilo-signature'] ?? '');
    const ok = got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
    hookBodies.push({event: req.headers['x-audiosilo-event'], ok, body: body.toString()});
    console.log(`  · webhook ${req.headers['x-audiosilo-event']}: signature ${ok ? 'verified' : 'WRONG'}`);
    res.writeHead(ok ? 204 : 401).end();
  });
});
await new Promise((resolve) => hook.listen(0, '127.0.0.1', resolve));
const HOOK_URL = `http://127.0.0.1:${hook.address().port}/api/webhook/audiosilo-hearthside`;

// "HH:MM" of the server's (this machine's) local time `minutes` from now.
const clockIn = (minutes) => {
  const d = new Date(Date.now() + minutes * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const backupsDone = async (want) => {
  for (let i = 0; i < 120; i++) {
    const env = await api(token, 'GET', '/admin/backups');
    if (!env.status.running && want(env)) return env;
    await sleep(1000);
  }
  throw new Error('backups never settled');
};

await step('provision backups', async () => {
  await api(token, 'POST', '/admin/backups');
  await backupsDone((env) => env.backups.some((b) => b.kind === 'manual'));
  await api(token, 'PATCH', '/admin/settings', {backups: {schedule: `daily:${clockIn(2)}`}});
  console.log('  ✓ provisioned (a manual backup; a scheduled one is due in two minutes)');
});

await step('provision notification destinations', async () => {
  const webhook = await api(token, 'POST', '/admin/notifications', {
    kind: 'webhook',
    name: 'Home Assistant',
    url: HOOK_URL,
    secret: HOOK_SECRET,
    events: ['book_added', 'scan_failed', 'library_unavailable', 'update_available', 'backup_failed'],
  });
  await api(token, 'POST', '/admin/notifications', {
    kind: 'ntfy',
    name: 'My phone',
    url: 'http://192.0.2.20/hearthside-alerts',
    events: ['scan_failed', 'library_unavailable', 'new_device', 'backup_failed'],
  });
  const test = await api(token, 'POST', `/admin/notifications/${webhook.id}/test`);
  if (!test.ok) throw new Error(`the test to the local webhook failed: ${test.error}`);
  console.log('  ✓ provisioned (a webhook that answers, an ntfy topic that never does)');
});

// ── Listening activity: real sessions from progress saves ───────────────────
// The server derives listening sessions from the progress saves players make: a
// device's second save on a book a few seconds after its first adds listened
// time (the position advance, capped by the server time between the saves),
// so listening can't be faked faster than real time. Each listener signs in like
// a player, names its app in X-AudioSilo-Client, saves twice 15 s apart now (so
// Live now and the overview have sessions), then keeps saving every 15 s. The
// Activity shots wait until LISTEN_MINUTES (default 8) have passed, so the
// charts and totals have twenty-odd minutes of listening to show. Nora
// stops 90 s before then, so Live now shows her as paused; Theo's device fetches
// a transcoded stream first, so his session counts as transcoded, and he has a
// personal API key that was never used.
const HEARTBEAT_MS = 15000;
const LISTEN_MS = Number(process.env.LISTEN_MINUTES || 8) * 60000;
let listenUntil = 0;
const LISTENERS = [
  {username: 'maya', device: "Maya's iPhone", client: 'AudioSilo/1.4.2 (ios)', speed: 1.25, at: 0.31},
  {username: 'theo', device: 'Pixel 8', client: 'AudioSilo/1.4.2 (android)', speed: 1, at: 0.58, transcode: true},
  {username: 'nora', device: "Nora's iPad", client: 'AudioSilo/1.3.0 (ios)', speed: 1, at: 0.12, pauseEarly: true},
];
let mayaId = null;
let heartbeats = null;

const saveProgress = async (l) => {
  const now = Date.now();
  if (l.last) l.pos = Math.min(l.book.duration, l.pos + ((now - l.last) / 1000) * l.speed);
  l.last = now;
  l.saved = (l.saved ?? 0) + 1;
  await api(
    l.token,
    'PUT',
    `/libraries/${library.id}/progress${pathQuery(l.book.rel_path)}`,
    {
      position: l.pos,
      duration: l.book.duration,
      playback_speed: l.speed,
      updated_at: new Date(now).toISOString(),
      version: now,
      device_id: `${l.username}-device`,
    },
    {'x-audiosilo-client': l.client},
  );
};

await step('provision listening sessions', async () => {
  if (!library) throw new Error('no library');
  listenUntil = Date.now() + LISTEN_MS;
  // Books 0 and 1 carry the admin's own progress (above); the listeners take the next ones.
  const books = ((await api(token, 'GET', `/libraries/${library.id}/books?limit=12`))?.books ?? [])
    .filter((b) => b.duration > 0);
  if (books.length < 6) throw new Error(`only ${books.length} books to listen to`);
  for (const [i, l] of LISTENERS.entries()) {
    let user;
    try {
      user = await api(token, 'POST', '/admin/users', {username: l.username, password: 'listening-demo', role: 'user'});
    } catch {
      user = (await api(token, 'GET', '/admin/users')).users.find((u) => u.username === l.username);
    }
    l.id = user?.user?.id ?? user?.id;
    await api(token, 'POST', '/admin/library-access', {user_id: l.id, library_id: library.id}).catch(() => {});
    const session = await api(null, 'POST', '/auth/login', {
      username: l.username,
      password: 'listening-demo',
      device_name: l.device,
    });
    l.token = session.token;
    l.book = books[2 + i];
    l.pos = l.book.duration * l.at;
  }
  mayaId = LISTENERS[0].id;

  // A transcoded stream from Theo's device: the mark lasts 10 minutes, so his
  // session on the book is recorded as transcoded.
  const theo = LISTENERS.find((l) => l.transcode);
  const chapters = await api(theo.token, 'GET', `/libraries/${library.id}/chapters${pathQuery(theo.book.rel_path)}`);
  const file = (chapters?.chapters ?? chapters ?? [])[0]?.file_path || theo.book.rel_path;
  const abort = new AbortController();
  const stream = await fetch(
    `${ORIGIN}/api/v1/libraries/${library.id}/stream?path=${encodeURIComponent(file)}&transcode=1`,
    {headers: {authorization: `Bearer ${theo.token}`, 'x-audiosilo-client': theo.client}, signal: abort.signal},
  ).catch(() => null);
  if (stream?.body) await stream.body.getReader().read().catch(() => {});
  abort.abort();
  if (!stream?.ok) console.log(`  ! transcoded stream not available (${stream?.status ?? 'no response'})`);
  await api(theo.token, 'POST', '/auth/tokens', {label: 'Home Assistant'}).catch(() => {});

  for (const l of LISTENERS) await saveProgress(l);
  await sleep(HEARTBEAT_MS);
  for (const l of LISTENERS) await saveProgress(l);

  // Maya finished another book: an admin's edit, as People's progress menu makes it.
  const done = books[5];
  await api(
    token,
    'PATCH',
    `/admin/libraries/${library.id}/progress${pathQuery(done.rel_path)}&user_id=${mayaId}`,
    {finished: true, started_at: isoAgo(9 * DAY).slice(0, 10)},
  );

  heartbeats = setInterval(() => {
    for (const l of LISTENERS) {
      if (l.pauseEarly && Date.now() > listenUntil - 90000) continue;
      saveProgress(l).catch((e) => console.log(`  ! heartbeat for ${l.username}: ${e.message}`));
    }
  }, HEARTBEAT_MS);
  console.log('  ✓ provisioned (maya, theo and nora listening)');
});

// ── Capture ────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext(DESKTOP_CONTEXT);
const page = await ctx.newPage();

// Opens a console route and waits for it to render: by default its page
// heading (the h1.display every screen's PageHead and the overview greeting
// render); `ready` names something else for the screens without one (Library >
// Books, a book's page). `origin` is this run's server unless another is named.
const open = async (p, route, ready = (pg) => pg.locator('h1.display').first(), origin = ORIGIN) => {
  await p.goto(`${origin}/admin${route}`, {waitUntil: 'networkidle', timeout: 45000});
  await ready(p).waitFor({timeout: 15000});
  // Covers arrive after the page renders, in batches (POST /admin/covers).
  await sleep(1500);
};
const bookRoute = (b) => `/library/book?library=${b.library_id}&path=${encodeURIComponent(b.path)}`;

await step('sign-in page', async () => {
  await page.goto(`${ADMIN}/`, {waitUntil: 'networkidle', timeout: 45000});
  await page.getByRole('heading', {name: 'Admin sign in'}).waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'admin/login.png');
});

// Signs in as admin from the console's sign-in form (already open on `p`).
const signIn = async (p, password) => {
  await p.getByLabel('Username', {exact: true}).fill('admin');
  await p.getByLabel('Password', {exact: true}).fill(password);
  await p.getByRole('button', {name: 'Sign in', exact: true}).click();
  await p.locator('h1.display').first().waitFor({timeout: 15000});
};

await step('sign in', async () => {
  await signIn(page, PASSWORD);
  await sleep(1500);
});

await step('overview', async () => {
  await open(page, '/');
  await shoot(page, 'admin/overview.png');
});

await step('command palette', async () => {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search books, people, settings, or type a command').waitFor({timeout: 8000});
  await sleep(600);
  await shoot(page, 'admin/palette.png');
  await page.keyboard.press('Escape');
  await sleep(400);
});

await step('command palette search', async () => {
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder('Search books, people, settings, or type a command');
  await input.waitFor({timeout: 8000});
  await input.fill('alice');
  // A real hit (capitalised title or name), not just the lowercase
  // "Search all books for “alice”" fallback that shows at once.
  await page.getByRole('option').filter({hasText: /Alice/}).first().waitFor({timeout: 8000}).catch(() => {});
  await sleep(1200); // book thumbnails
  await shoot(page, 'admin/palette-search.png');
  await page.keyboard.press('Escape');
  await sleep(400);
});

await step('books', async () => {
  await open(page, '/library', (p) => p.getByRole('heading', {name: 'Recently added'}));
  await shoot(page, 'admin/books.png');
});

await step('books table', async () => {
  await open(page, '/library?view=table', (p) => p.getByRole('table', {name: 'All books'}));
  await shoot(page, 'admin/books-table.png');
});

await step('a book page', async () => {
  if (!firstBook) throw new Error('no book was provisioned');
  // The book page's h1 is the hero title, not h1.display: wait for its Details card.
  await open(page, bookRoute(firstBook), (p) => p.getByRole('heading', {name: 'Details', exact: true}));
  await sleep(1000); // the hero's full-size cover and its tint
  await shoot(page, 'admin/book.png');
});

await step('match with community metadata', async () => {
  if (!firstBook) throw new Error('no book was provisioned');
  await open(page, bookRoute(firstBook), (p) => p.getByRole('heading', {name: 'Details', exact: true}));
  // "Compare with community" once the book has an ASIN or ISBN.
  await page
    .getByRole('button', {name: /^(Match with community metadata|Compare with community)$/})
    .click({timeout: 8000});
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({timeout: 8000});
  // Candidates from meta.audiosilo.app, or (offline) the dialog's own message.
  await dialog
    .getByRole('radiogroup', {name: 'Possible matches'})
    .or(dialog.getByText(/isn't answering|Nothing in the community database matches|is off on this server/))
    .first()
    .waitFor({timeout: 20000})
    .catch(() => {});
  await sleep(800);
  await shoot(page, 'admin/book-match.png');
  await page.keyboard.press('Escape');
  await sleep(600);
});

await step('authors', async () => {
  await open(page, '/library/authors');
  await shoot(page, 'admin/authors.png');
});

await step('series', async () => {
  await open(page, '/library/series');
  await sleep(2000); // community series gaps load as each card scrolls into view
  // The spines take their cover colours, which the server reads in the background
  // shortly after a scan, and from the cover fans' thumbnails just loaded: load the
  // page again so the spines have them.
  await open(page, '/library/series');
  await sleep(2000);
  await shoot(page, 'admin/series.png');
});

await step('folders', async () => {
  const libId = firstBook?.library_id ?? library?.id;
  if (!libId) throw new Error('no library');
  // The first book's own folder (its author folder opens above it), so the
  // detail shows the detection choice; an author folder holds no audio of its
  // own and has nothing to choose.
  const folder = firstBook?.is_folder ? firstBook.path : (firstBook?.path ?? '').split('/').slice(0, -1).join('/');
  const q = folder ? `&folder=${encodeURIComponent(folder)}` : '';
  await open(page, `/library/folders?library=${libId}${q}`);
  await page.getByText('How should AudioSilo read this folder?').waitFor({timeout: 8000}).catch(() => {});
  await sleep(800);
  await shoot(page, 'admin/folders.png');
});

await step('libraries', async () => {
  await open(page, '/library/libraries');
  await shoot(page, 'admin/libraries.png');
});

await step('add library with the folder picker', async () => {
  await page.getByRole('button', {name: 'Add library', exact: true}).click({timeout: 8000});
  const dialog = page.getByRole('dialog', {name: 'Add a library'});
  await dialog.waitFor({timeout: 8000});
  // Start the picker in the seeded library's folder, so it lists its author
  // folders rather than the capture machine's filesystem root.
  if (library?.root) await dialog.getByLabel('Folder', {exact: true}).fill(library.root);
  await dialog.getByRole('button', {name: 'Browse', exact: true}).click();
  await dialog.getByRole('list', {name: 'Folders on the server'}).waitFor({timeout: 8000});
  // Choosing a folder fills the empty Name field from the folder's name.
  await dialog.getByRole('button', {name: 'Choose Lewis Carroll'}).click({timeout: 4000}).catch(() => {});
  await sleep(800);
  await shoot(page, 'admin/library-add.png');
  await page.keyboard.press('Escape');
  await sleep(600);
});

await step('folder detection', async () => {
  const name = library?.name || 'Books';
  await page.getByRole('button', {name: `Actions for ${name}`}).click({timeout: 8000});
  await page.getByRole('menuitem', {name: 'Folder detection...'}).click({timeout: 8000});
  const dialog = page.getByRole('dialog', {name: `Folder detection in ${name}`});
  await dialog.getByRole('list', {name: 'Folders'}).waitFor({timeout: 8000});
  // One level down, so the shot shows folders detected as books.
  await dialog.getByText('Lewis Carroll', {exact: true}).first().click({timeout: 4000}).catch(() => {});
  await sleep(1500);
  await shoot(page, 'admin/detection.png');
  await page.keyboard.press('Escape');
  await sleep(600);
});

await step('people', async () => {
  await open(page, '/people');
  await shoot(page, 'admin/people.png');
});

await step('a person (Access tab)', async () => {
  if (!samId) throw new Error('sam was not provisioned');
  // Listening is the default tab; the Access tab is ?tab=access.
  await open(page, `/people/user/${samId}?tab=access`);
  await page.getByRole('tab', {name: 'Access'}).waitFor({timeout: 8000});
  await shoot(page, 'admin/person.png');
});

await step('invite someone', async () => {
  await open(page, '/people');
  await page.getByRole('button', {name: 'Invite someone', exact: true}).first().click({timeout: 8000});
  await page.getByLabel('Their name', {exact: true}).fill('Uncle Ray');
  await page.getByRole('button', {name: 'Create invite', exact: true}).click();
  await page.getByRole('dialog', {name: 'Invite ready for Uncle Ray'}).waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'admin/invite.png');
  await page.getByRole('button', {name: 'Done', exact: true}).click().catch(() => page.keyboard.press('Escape'));
  await sleep(600);
});

await step('invites', async () => {
  await open(page, '/people/invites');
  await shoot(page, 'admin/invites.png');
});

await step('shares', async () => {
  await open(page, '/people/shares');
  await shoot(page, 'admin/shares.png');
});

await step('server settings', async () => {
  await open(page, '/server');
  await page.getByLabel('Server name', {exact: true}).waitFor({timeout: 8000});
  await page.getByRole('switch', {name: 'Check for new versions'}).waitFor({timeout: 8000}).catch(() => {});
  await sleep(600);
  await shoot(page, 'admin/settings.png');
});

await step('server settings: network & https', async () => {
  // Taller, so both cards (HTTPS and Network) fit.
  await page.setViewportSize({width: 1440, height: 1100});
  try {
    await open(page, '/server?topic=network');
    await page.getByLabel('Listen address', {exact: true}).waitFor({timeout: 8000});
    await sleep(800); // the certificate row reads the system status
    await shoot(page, 'admin/settings-network.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

await step('server settings: community metadata', async () => {
  // Taller, so the switch, Source, Matching and Service cards fit.
  await page.setViewportSize({width: 1440, height: 1300});
  try {
    await open(page, '/server?topic=metadata');
    await page.getByText('Keep a local copy', {exact: true}).waitFor({timeout: 8000});
    await sleep(800); // the status row reads the system status
    await shoot(page, 'admin/settings-metadata.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

await step('overview on a phone', async () => {
  const phone = await browser.newContext({
    ...DESKTOP_CONTEXT,
    viewport: {width: 400, height: 860},
    colorScheme: 'light',
    storageState: await ctx.storageState(), // carries the signed-in session
  });
  const p4 = await phone.newPage();
  await open(p4, '/');
  await shoot(p4, 'admin/overview-phone.png');
  await phone.close();
});

// ── Health: an Inbox library whose files produce one of each issue ─────────
// Built after the shots above so the Books screens keep showing only the seeded
// library. Everything lands under INBOX_DIR (gitignored .cache); the seeded
// library is only read (copy-on-write clones where the filesystem supports it).
let inbox = null;
const ffmpeg = (args) =>
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'ignore'}).status === 0;
// Silent mono audio: cheap to encode even when it is hours long.
const silence = (file, seconds, meta = {}, codec = ['-c:a', 'libmp3lame', '-b:a', '8k']) =>
  ffmpeg([
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', String(seconds),
    ...Object.entries(meta).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]),
    ...codec, file,
  ]);

await step('provision an Inbox library with issues', async () => {
  await rm(INBOX_DIR, {recursive: true, force: true});
  const dir = (...p) => path.join(INBOX_DIR, ...p);
  const put = async (rel, data) => {
    await mkdir(path.dirname(dir(rel)), {recursive: true});
    await writeFile(dir(rel), data);
  };
  // Likely duplicates: one seeded book twice (identical audio), one copy without its cover.
  if (library?.root) {
    const src = path.join(library.root, 'Sun Tzu', 'The Art of War');
    const opts = {recursive: true, mode: fsc.COPYFILE_FICLONE};
    await cp(src, dir('Sun Tzu', 'The Art of War'), opts);
    await cp(src, dir('Sun Tzu', 'The Art of War (second copy)'), {
      ...opts,
      filter: (f) => !f.endsWith('cover.jpg'),
    });
  }
  // Files that couldn't be read: an empty file, and an m4b that stops after its
  // header (ffprobe: "moov atom not found").
  await put('Unknown Author/The Lost Chapter/The Lost Chapter.mp3', Buffer.alloc(0));
  const ftyp = Buffer.from('00000018667479704d344220000000004d34422069736f6d', 'hex');
  await put('Unknown Author/The Damaged Book/The Damaged Book.m4b', Buffer.concat([ftyp, Buffer.alloc(4096)]));
  // Skipped by the skip rules below (never indexed).
  await put('Extras/Interview.mp3', Buffer.alloc(0));
  let generated = true;
  await mkdir(dir('Anthologies', 'Collected Stories'), {recursive: true});
  await mkdir(dir('Lectures', 'A Long Lecture'), {recursive: true});
  await mkdir(dir('Folk Tales'), {recursive: true});
  // Folder may hold several books: two parts, each over an hour, different titles.
  generated = silence(dir('Anthologies', 'Collected Stories', '01 - The Clockmaker.mp3'), 3700,
    {album: 'The Clockmaker', artist: 'Ada Wren'}) && generated;
  generated = silence(dir('Anthologies', 'Collected Stories', '02 - The Lighthouse Keeper.mp3'), 3700,
    {album: 'The Lighthouse Keeper', artist: 'Ada Wren'}) && generated;
  // Long books without chapters: two and a half hours, no chapter marks.
  generated = silence(dir('Lectures', 'A Long Lecture', 'A Long Lecture.mp3'), 9000,
    {album: 'A Long Lecture', artist: 'Prof. Hal Morrow'}) && generated;
  // Converted to play in browsers: Apple Lossless.
  generated = silence(dir('Folk Tales', 'Folk Tales.m4a'), 30, {album: 'Folk Tales'}, ['-c:a', 'alac']) && generated;
  if (!generated) console.log('  ! ffmpeg missing or failed - some Health issues will be absent');

  const created = await api(token, 'POST', '/admin/libraries', {
    name: 'Inbox',
    root: INBOX_DIR,
    scan_schedule: 'daily:03:00',
    ignore_patterns: ['# Bonus material', 'Extras/', '*.sample.mp3'],
  });
  inbox = created?.library ?? created;
  await waitForScans(token);
  // One ignored book, so the cards and the list show "Show ignored".
  const folk = (await api(token, 'GET', `/admin/books?library_id=${inbox.id}&issue=no_cover&limit=50`))
    ?.books?.find((b) => b.path.startsWith('Folk Tales'));
  if (folk) {
    await api(token, 'POST', '/admin/issues/ignore', {
      kind: 'no_cover',
      books: [{library_id: folk.library_id, path: folk.path}],
    });
  }
  console.log('  ✓ provisioned (Inbox library with one of each issue)');
});

await step('health issues', async () => {
  await open(page, '/health/issues?issue=scan_error');
  await page.getByRole('list', {name: "Files that couldn't be read"}).waitFor({timeout: 8000}).catch(() => {});
  await sleep(800);
  await shoot(page, 'admin/health-issues.png');
});

await step('match automatically', async () => {
  // A run over every unmatched book (the seeded ones and the Inbox's), reviewed
  // but never applied, so the other shots keep their books as they are. The
  // marketplace is the UK store's, so the dialog shows which ASINs are UK ones.
  await api(token, 'PATCH', '/admin/settings', {metadata: {region: 'uk'}});
  await open(page, '/health/issues?issue=unmatched');
  await page.getByRole('button', {name: 'Find matches', exact: true}).click({timeout: 8000});
  // Offline, every book fails and the run stops: there is nothing to review.
  await page.getByRole('button', {name: 'Review and apply'}).waitFor({timeout: 90000});
  await page.getByRole('button', {name: 'Review and apply'}).click();
  const dialog = page.getByRole('dialog', {name: 'Review matches'});
  await dialog.getByRole('listitem').first().waitFor({timeout: 8000});
  await sleep(1500); // the book covers
  await shoot(page, 'admin/health-bulk-match.png');
  await page.keyboard.press('Escape');
  await sleep(600);
  await api(token, 'PATCH', '/admin/settings', {metadata: {region: ''}});
});

await step('health duplicates', async () => {
  await open(page, '/health/issues?issue=duplicate');
  await page.getByRole('button', {name: "They're different books"}).first().waitFor({timeout: 8000});
  // The compare sits under the category cards: bring its heading to the top.
  await page.locator('#issue-heading').evaluate((el) => el.scrollIntoView({block: 'start'}));
  await page.mouse.wheel(0, -24);
  await sleep(1200);
  await shoot(page, 'admin/health-duplicates.png');
});

await step('health jobs', async () => {
  // Taller than the other shots, so the newest scan's log fits under the cards.
  await page.setViewportSize({width: 1440, height: 980});
  try {
    await open(page, '/health/jobs');
    await page.getByRole('button', {name: 'Log', exact: true}).first().click({timeout: 8000});
    await page.getByRole('button', {name: 'Hide log', exact: true}).waitFor({timeout: 8000});
    await sleep(1000);
    await shoot(page, 'admin/health-jobs.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

await step('edit library (scan settings)', async () => {
  const name = inbox?.name || library?.name || 'Books';
  await open(page, '/library/libraries');
  await page.getByRole('button', {name: `Actions for ${name}`}).click({timeout: 8000});
  await page.getByRole('menuitem', {name: 'Edit library...'}).click({timeout: 8000});
  const dialog = page.getByRole('dialog', {name: `Edit ${name}`});
  await dialog.getByLabel('Skip these files and folders', {exact: true}).waitFor({timeout: 8000});
  await sleep(800);
  await shoot(page, 'admin/library-edit.png');
  await page.keyboard.press('Escape');
  await sleep(600);
});

// ── Server ops: System, About and Logs ─────────────────────────────────────
// After the Inbox library, so System lists two library folders and the log has
// its scans. The update card shows whatever GitHub answers (a local build reads
// as a development build); a check is asked for first, so it isn't "Not checked
// yet" on a run that reaches here within a minute of the server starting.
await step('scheduled backup', async () => {
  // The scheduled backup provisioned above, then the schedule back to 03:00, so
  // System and Backups show the usual next run.
  await backupsDone((env) => env.backups.some((b) => b.kind === 'scheduled')).catch((e) =>
    console.log(`  ! no scheduled backup: ${e.message}`),
  );
  await api(token, 'PATCH', '/admin/settings', {backups: {schedule: 'daily:03:00'}});
});

await step('health: system', async () => {
  await page.setViewportSize({width: 1440, height: 1100});
  try {
    await open(page, '/health/system');
    await page.getByText('Database', {exact: true}).waitFor({timeout: 15000});
    await sleep(1000);
    await shoot(page, 'admin/system.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

// Mirror mode's local copy on Health > System, from the third server run.sh
// starts in metadata mirror mode with the meta artifact it built already in
// place as the copy (so nothing is downloaded): the community metadata row and
// the copy's panel under it, clipped.
await step('health: system in mirror mode', async () => {
  if (!wanted('admin/system-mirror.png')) return;
  if (!MIRROR_ORIGIN || !MIRROR_PASSWORD) throw new Error('MIRROR_ORIGIN not set (run.sh starts it when it builds the meta artifact)');
  // The seeded copy opens in the background after start (state "opening", a
  // few seconds). Any other state but ready means the server refused it and
  // is after a real one ("empty", then "downloading" half a minute after
  // start): stop at once, with its metadata switched off so nothing is fetched.
  const mapi = apiClient(MIRROR_ORIGIN);
  const {token: mtoken} = await mapi(null, 'POST', '/auth/login', {username: 'admin', password: MIRROR_PASSWORD});
  for (const until = Date.now() + 30000; ; await sleep(500)) {
    const m = await mapi(mtoken, 'GET', '/admin/meta/mirror');
    if (m.state === 'ready') break;
    if (m.state !== 'opening' || Date.now() > until) {
      await mapi(mtoken, 'PATCH', '/admin/settings', {metadata: {enabled: false}}).catch(() => {});
      throw new Error(`the seeded local copy isn't answering: ${JSON.stringify(m)}`);
    }
  }
  const mctx = await browser.newContext(DESKTOP_CONTEXT);
  try {
    const mp = await mctx.newPage();
    await open(mp, '/', (pg) => pg.getByLabel('Username', {exact: true}), MIRROR_ORIGIN);
    await signIn(mp, MIRROR_PASSWORD);
    const row = mp.locator('li').filter({has: mp.getByText('Data version', {exact: true})}).first();
    await open(mp, '/health/system', () => row, MIRROR_ORIGIN);
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    if (!box) throw new Error('no community metadata row');
    const pad = 16;
    await shoot(mp, 'admin/system-mirror.png', {
      clip: {x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad},
    });
  } finally {
    await mctx.close();
  }
});

await step('server: about', async () => {
  await api(token, 'POST', '/admin/update/check').catch((e) => console.log(`  ! update check: ${e.message}`));
  await open(page, '/server/about');
  await page.getByRole('button', {name: 'Check now', exact: true}).waitFor({timeout: 8000}).catch(() => {});
  await sleep(800);
  await shoot(page, 'admin/about.png');
});

await step('server: logs', async () => {
  await open(page, '/server/logs');
  const panel = page.getByRole('log', {name: 'Server log'});
  await panel.locator('.lv').first().waitFor({timeout: 15000});
  await sleep(1000);
  await shoot(page, 'admin/logs.png');
});

// ── Backups, notifications, the bell, events and the audit log ──────────────────────
await step('settings: backups', async () => {
  await page.setViewportSize({width: 1440, height: 1240});
  try {
    await open(page, '/server?topic=backups');
    await page.getByRole('list', {name: 'Backups'}).waitFor({timeout: 15000});
    await sleep(800);
    await shoot(page, 'admin/settings-backups.png');

    // The restore confirmation, with the word typed but never confirmed.
    await page.getByRole('button', {name: 'Restore...', exact: true}).first().click({timeout: 8000});
    const dialog = page.getByRole('dialog', {name: 'Restore this backup?'});
    await dialog.waitFor({timeout: 8000});
    await dialog.getByRole('textbox').fill('restore');
    await sleep(600);
    await shoot(page, 'admin/backup-restore.png');
    await page.keyboard.press('Escape');
    await sleep(600);
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

await step('settings: notifications', async () => {
  await page.setViewportSize({width: 1440, height: 1240});
  try {
    await open(page, '/server?topic=notifications');
    await page.getByRole('list', {name: 'Where to send alerts'}).waitFor({timeout: 15000});
    await page.getByRole('heading', {name: 'What to send'}).waitFor({timeout: 8000});
    await sleep(800);
    await shoot(page, 'admin/settings-notifications.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

await step('settings: import', async () => {
  // Step 1 only: the empty connect form needs no Audiobookshelf to reach.
  await open(page, '/server?topic=import');
  await page.getByLabel('Audiobookshelf address').waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'admin/settings-import.png');
});

await step('the notifications bell', async () => {
  // New books (both libraries' first scans) and the listeners' sign-ins are in
  // the feed by now.
  await open(page, '/');
  await page.getByRole('button', {name: /^Notifications/}).click({timeout: 8000});
  await page.getByRole('dialog', {name: 'Notifications'}).getByRole('list').waitFor({timeout: 8000});
  await sleep(800);
  await shoot(page, 'admin/bell.png');
  await page.keyboard.press('Escape');
  await sleep(400);
});

await step('server: events', async () => {
  // The whole feed the bell shows the start of (See all).
  await open(page, '/server/events');
  await page.getByRole('region', {name: 'Events'}).waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'admin/events.png');
});

await step('server: audit log', async () => {
  await open(page, '/server/audit');
  await page.getByRole('region', {name: 'Audit log'}).waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'admin/audit.png');
});

await step('webhook deliveries', async () => {
  // What the local receiver got: every signature must check out.
  if (!hookBodies.length) throw new Error('the webhook received nothing');
  const bad = hookBodies.filter((h) => !h.ok);
  if (bad.length) throw new Error(`${bad.length} webhook signature(s) didn't verify`);
  const sample = hookBodies.find((h) => h.event === 'book_added') ?? hookBodies[0];
  console.log(`  ✓ ${hookBodies.length} webhook deliveries verified; a ${sample.event} body: ${sample.body}`);
});

// ── Activity: captured last, after a few minutes of listening ───────────────
if (heartbeats && Date.now() < listenUntil) {
  console.log(`  … listening for ${Math.ceil((listenUntil - Date.now()) / 1000)} s more before the Activity shots`);
  await sleep(listenUntil - Date.now());
}

await step('activity overview', async () => {
  // Taller, so the stat tiles, the hours chart and both heatmaps fit.
  await page.setViewportSize({width: 1440, height: 1240});
  try {
    await open(page, '/activity');
    await page.getByRole('heading', {name: 'Listening hours per day'}).waitFor({timeout: 15000});
    await sleep(1000);
    await shoot(page, 'admin/activity.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

await step('activity: live now', async () => {
  await open(page, '/activity/live');
  await page.getByText('Playing', {exact: true}).first().waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'admin/activity-live.png');
});

await step('activity: sessions', async () => {
  await open(page, '/activity/sessions');
  await page.getByRole('table').waitFor({timeout: 15000});
  await shoot(page, 'admin/activity-sessions.png');
});

await step('activity: year in listening', async () => {
  await page.setViewportSize({width: 1440, height: 1100});
  try {
    await open(page, '/activity/year');
    await page.getByText('Book of the year', {exact: true}).waitFor({timeout: 15000});
    await sleep(1000);
    await shoot(page, 'admin/activity-year.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

await step('people: devices', async () => {
  await open(page, '/people/devices');
  await page.getByText('This device', {exact: true}).waitFor({timeout: 15000});
  await shoot(page, 'admin/devices.png');
});

await step("a person's Listening tab", async () => {
  if (!mayaId) throw new Error('maya was not provisioned');
  await page.setViewportSize({width: 1440, height: 1100});
  try {
    await open(page, `/people/user/${mayaId}`);
    await page.getByRole('heading', {name: 'Recent sessions'}).waitFor({timeout: 15000});
    await sleep(1000);
    await shoot(page, 'admin/person-listening.png');
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
});

if (heartbeats) clearInterval(heartbeats);

// ── Public pages ────────────────────────────────────────────────────────────
await step('connect page', async () => {
  const p2 = await ctx.newPage();
  const url = inviteCode ? `${ORIGIN}/connect#code=${inviteCode}` : `${ORIGIN}/connect`;
  await p2.goto(url, {waitUntil: 'networkidle', timeout: 45000});
  await sleep(2500); // fragment codes auto-redeem into the QR + buttons view
  await shoot(p2, 'server/connect-page.png');
  await p2.close();
});

await step('setup wizard', async () => {
  if (!SETUP_URL) throw new Error('SETUP_URL not set (run.sh starts the --setup instance)');
  const p3 = await ctx.newPage();
  await p3.goto(SETUP_URL, {waitUntil: 'networkidle', timeout: 45000});
  await sleep(1500);
  await shoot(p3, 'server/setup-wizard.png');
  await p3.close();
});

await ctx.close();
await browser.close();
hook.closeAllConnections();
hook.close();
console.log('capture-admin: done.');
