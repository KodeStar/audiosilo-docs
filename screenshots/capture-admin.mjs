// Captures the admin-console + public server-page documentation screenshots.
// Requires a running server (run.sh) and env:
//   AS_ORIGIN       server origin (default http://127.0.0.1:8790)
//   ADMIN_PASSWORD  the first-run admin password (parsed from the log by run.sh)
//   SETUP_URL       optional: a second --setup server's wizard URL (with #token)
//
// Before capturing it provisions a little demo state through the admin API
// (a listener account, an invite, a share, some listening progress, one
// metadata edit) so the console looks lived-in. The console (admin-ui) is driven through its real UI
// with role/label selectors that use the exact English labels from
// audiosilo-server/admin-ui/src/i18n/locales/en.json - if a label changes there,
// change it here too.
import {chromium} from 'playwright';
import {sleep, shoot, step, DESKTOP_CONTEXT} from './lib.mjs';

const ORIGIN = (process.env.AS_ORIGIN || 'http://127.0.0.1:8790').replace(/\/$/, '');
const ADMIN = `${ORIGIN}/admin`;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SETUP_URL = process.env.SETUP_URL || '';
if (!PASSWORD) {
  console.error('capture-admin: ADMIN_PASSWORD is required');
  process.exit(1);
}

// ── Provision demo state via the API ────────────────────────────────────────
const api = async (token, method, p, body) => {
  const res = await fetch(`${ORIGIN}/api/v1${p}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? {authorization: `Bearer ${token}`} : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 120)}`);
  return json;
};

let inviteCode = '';
let samId = null;
let library = null; // the seeded library ({id, name, root, ...})
let firstBook = null; // the first book of GET /admin/books ({library_id, path, is_folder, ...})
const login = await api(null, 'POST', '/auth/login', {username: 'admin', password: PASSWORD});
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
      await api(token, 'PUT', `/libraries/${libId}/progress?path=${encodeURIComponent(b.rel_path)}`, {
        position: dur * frac,
        duration: dur,
        updated_at: new Date(Date.now() - (i + 1) * 60000).toISOString(),
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
    `/admin/libraries/${firstBook.library_id}/book?path=${encodeURIComponent(firstBook.path)}`,
    {set: {narrator: 'LibriVox volunteers'}},
  );
  // One Lewis Carroll book with the author written "Surname, Given", so Library >
  // Authors shows a merge suggestion.
  const carroll = (await api(token, 'GET', `/admin/books?author=${encodeURIComponent('Lewis Carroll')}&limit=1`))?.books?.[0];
  if (carroll) {
    await api(
      token,
      'PATCH',
      `/admin/libraries/${carroll.library_id}/book?path=${encodeURIComponent(carroll.path)}`,
      {set: {author: 'Carroll, Lewis'}},
    );
  }
  console.log('  ✓ provisioned (narrator edit on the first book, a reversed author)');
});

// ── Capture ────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext(DESKTOP_CONTEXT);
const page = await ctx.newPage();

// Opens a console route and waits for it to render: by default its page
// heading (the h1.display every screen's PageHead and the overview greeting
// render); `ready` names something else for the screens without one (Library >
// Books, a book's page).
const open = async (p, route, ready = (pg) => pg.locator('h1.display').first()) => {
  await p.goto(`${ADMIN}${route}`, {waitUntil: 'networkidle', timeout: 45000});
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

await step('sign in', async () => {
  await page.getByLabel('Username', {exact: true}).fill('admin');
  await page.getByLabel('Password', {exact: true}).fill(PASSWORD);
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  await page.locator('h1.display').first().waitFor({timeout: 15000});
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
  await open(page, `/people/user/${samId}`);
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
  await page.getByRole('switch', {name: 'Look up community metadata'}).waitFor({timeout: 8000}).catch(() => {});
  await shoot(page, 'admin/settings.png');
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
console.log('capture-admin: done.');
