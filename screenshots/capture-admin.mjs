// Captures the admin-console + public server-page documentation screenshots.
// Requires a running server (run.sh) and env:
//   AS_ORIGIN       server origin (default http://127.0.0.1:8790)
//   ADMIN_PASSWORD  the first-run admin password (parsed from the log by run.sh)
//   SETUP_URL       optional: a second --setup server's wizard URL (with #token)
//
// Before capturing it provisions a little demo state through the admin API
// (a listener account, an invite, a share) so the console looks lived-in.
import {chromium} from 'playwright';
import {sleep, shoot, step} from './lib.mjs';

const ORIGIN = (process.env.AS_ORIGIN || 'http://127.0.0.1:8790').replace(/\/$/, '');
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
const login = await api(null, 'POST', '/auth/login', {username: 'admin', password: PASSWORD});
const token = login.token;
console.log('  ✓ admin login');

await step('provision listener + share', async () => {
  const libs = await api(token, 'GET', '/admin/libraries');
  const lib = (libs.libraries || libs || [])[0];
  const libId = lib?.id;

  let sam;
  try {
    sam = await api(token, 'POST', '/admin/users', {username: 'sam', role: 'user'});
  } catch {
    const users = await api(token, 'GET', '/admin/users');
    sam = (users.users || []).find((u) => u.username === 'sam');
  }
  const samId = sam?.user?.id ?? sam?.id;
  if (samId && libId) {
    await api(token, 'POST', '/admin/library-access', {user_id: samId, library_id: libId}).catch(() => {});
  }
  if (samId) {
    const inv = await api(token, 'POST', `/admin/users/${samId}/authcode`, {}).catch(() => null);
    inviteCode = inv?.auth_code?.code || inv?.code || '';
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
const ctx = await browser.newContext({
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();

const nav = async (section) => {
  await page.locator(`[data-section="${section}"]`).first().click({timeout: 8000});
  await sleep(1500);
};

await step('admin login page', async () => {
  await page.goto(`${ORIGIN}/admin`, {waitUntil: 'networkidle', timeout: 45000});
  await sleep(1200);
  await shoot(page, 'admin/login.png');
});

await step('sign in', async () => {
  await page.locator('#login-form input[type="text"], #login-form input:not([type])').first().fill('admin');
  await page.locator('#login-form input[type="password"]').first().fill(PASSWORD);
  await page.locator('#login-form button[type="submit"], #login-form button').first().click();
  await sleep(2500);
});

await step('overview', async () => {
  await nav('overview');
  await shoot(page, 'admin/overview.png');
});

await step('libraries', async () => {
  await nav('libraries');
  await shoot(page, 'admin/libraries.png');
});

await step('detection browser', async () => {
  await page.getByRole('button', {name: /detection/i}).first().click({timeout: 8000});
  await sleep(2000);
  await shoot(page, 'admin/detection.png');
  await page.keyboard.press('Escape');
  await sleep(600);
});

await step('users', async () => {
  await nav('users');
  await shoot(page, 'admin/users.png');
});

await step('user detail drawer', async () => {
  await page.getByText('sam', {exact: true}).first().click({timeout: 8000});
  await sleep(1800);
  await shoot(page, 'admin/user-detail.png');
  await page.keyboard.press('Escape');
  await sleep(600);
});

await step('shares', async () => {
  await nav('shares');
  await shoot(page, 'admin/shares.png');
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
