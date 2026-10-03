// Captures the admin-console + public server-page documentation screenshots.
// Requires a running server (run.sh) and env:
//   AS_ORIGIN       server origin (default http://127.0.0.1:8790)
//   ADMIN_PASSWORD  the first-run admin password (parsed from the log by run.sh)
//   SETUP_URL       optional: a second --setup server's wizard URL (with #token)
//
// Before capturing it provisions a little demo state through the admin API
// (a listener account, an invite, a share, some listening progress) so the
// console looks lived-in. The console (admin-ui) is driven through its real UI
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

// ── Capture ────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext(DESKTOP_CONTEXT);
const page = await ctx.newPage();

// Opens a console route and waits for its page heading (the h1.display every
// screen's PageHead and the overview greeting render).
const open = async (p, route) => {
  await p.goto(`${ADMIN}${route}`, {waitUntil: 'networkidle', timeout: 45000});
  await p.locator('h1.display').first().waitFor({timeout: 15000});
  await sleep(1500); // covers are fetched one by one after the page renders
};

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
  await page.getByPlaceholder('Search pages, settings, or type a command').waitFor({timeout: 8000});
  await sleep(600);
  await shoot(page, 'admin/palette.png');
  await page.keyboard.press('Escape');
  await sleep(400);
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
