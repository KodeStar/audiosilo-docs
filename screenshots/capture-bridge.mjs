// Captures the Bridge's own page (the LAN page an AudioSilo Bridge serves) for the
// User Guide: its sign-in, the Status tab before and after pairing, the Libraries tab
// and the Accounts tab.
//
// run.sh starts a real Bridge (the BRIDGE checkout, built with its page embedded) on a
// fresh data dir after the other captures and hands this script its one-time password.
// The Bridge is paired with the demo server for real: a pairing code from the admin API
// (POST /admin/bridge/pair; it replaces the stand-in capture-admin.mjs paired, which is
// no longer needed by then), typed into the page's Pair form. Its first heartbeat lists
// the server's libraries, which it finds at the server's own paths (it runs on the same
// machine), as a container given one volume per library at the same paths does.
// The Bridge is unpaired again at the end (both sides).
//
// The Audible shots (Bridge Phase 4a) need a Bridge built with -tags audiblefake and the
// Audible fake (AUDIBLE_FAKE_URL); screenshots/README.md says how the run goes. Nothing
// touches the seeded library.
//
// Env: BRIDGE_BASE (the page, http://127.0.0.1:<port>/), BRIDGE_PASSWORD (its
// one-time password), AS_ORIGIN + ADMIN_PASSWORD (the demo server), AUDIBLE_FAKE_URL
// (the Audible fake, for the Audible shots).
import {chromium} from 'playwright';
import path from 'node:path';
import {mkdir, rm} from 'node:fs/promises';
import {CACHE, DESKTOP_CONTEXT, apiClient, around, fitViewportToPage, fitted, pathQuery, shoot, silence, sleep, step, submitSignIn, waitForScans, wanted} from './lib.mjs';

const BASE = (process.env.BRIDGE_BASE || '').replace(/\/?$/, '/');
const PASSWORD = process.env.BRIDGE_PASSWORD || '';
const ORIGIN = (process.env.AS_ORIGIN || '').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUDIBLE_FAKE = (process.env.AUDIBLE_FAKE_URL || '').replace(/\/$/, '');
const SHOTS = {
  signIn: 'bridge/sign-in.png',
  unpaired: 'bridge/status-unpaired.png',
  paired: 'bridge/status-paired.png',
  libraries: 'bridge/libraries.png',
  accounts: 'bridge/accounts.png',
};
const AUDIBLE_SHOTS = {
  signIn: 'bridge/audible-sign-in.png',
  account: 'bridge/accounts-audible.png',
  card: 'admin/audible-accounts-card.png',
  titles: 'admin/audible-titles.png',
};
if (!wanted(...Object.values(SHOTS), ...Object.values(AUDIBLE_SHOTS))) process.exit(0);
if (!BASE || !PASSWORD || !ORIGIN || !ADMIN_PASSWORD) {
  console.error('capture-bridge: BRIDGE_BASE, BRIDGE_PASSWORD, AS_ORIGIN and ADMIN_PASSWORD are required');
  process.exit(1);
}

const server = apiClient(ORIGIN);
// The Bridge page's own API, as the page calls it (a bearer token from /api/login).
const bridgeApi = apiClient(BASE.replace(/\/$/, ''), '/api');

// Settles, moves the pointer away and shoots the page as tall as its content.
const tallShoot = async (page, file, {settle = 800, max = 1600, min = 400} = {}) => {
  await sleep(settle);
  await page.mouse.move(0, 0);
  await fitted(page, () => fitViewportToPage(page, 900, max, min), () => shoot(page, file));
};

const tab = async (page, name) => {
  await page.getByRole('tab', {name, exact: true}).or(page.getByRole('link', {name, exact: true})).first().click({timeout: 8000});
  await sleep(800);
};

// What a reader's own container would show, not this machine's: the page's answers name
// the library folders as a container sees them (the seeded library at /library, as in the
// compose examples, the
// others under /), the server by the compose file's service name, and the speech
// recognition a Linux image picks (whisper.cpp on the CPU; on a Mac the Bridge picks
// mlx-whisper). Only the page's JSON is rewritten on the way in; the Bridge itself works
// with the real ones.
const SHOWN_SERVER = 'http://audiosilo:8080';
const shown = (text) =>
  text
    .replaceAll(path.join(CACHE, 'library'), '/library')
    .replaceAll(path.join(CACHE, 'audible-library'), '/audiobooks')
    .replaceAll(`${CACHE}/`, '/')
    .replaceAll(ORIGIN, SHOWN_SERVER)
    .replaceAll('"mlx-whisper"', '"whisper-cpp"')
    .replaceAll('"device":"metal"', '"device":"cpu"');
// ── Audible (Phase 4a) ───────────────────────────────────────────────────
const AUDIBLE_DIR = path.join(CACHE, 'audible-library');
const AUDIBLE_LIBRARY = 'Audiobooks';
// Silent books shaped like three of the fake's titles: the first gets the title's ASIN
// (an admin edit, so it matches by ASIN), the others match by author and title.
const AUDIBLE_BOOKS = [
  {author: 'Theo Marchetti', title: 'Lanterns Over Hollow Bay', asin: 'B0FAKE0006'},
  {author: 'Mara Quill', title: 'The Glass Orchard', series: 'Orchard Cycle', part: '1'},
  {author: 'Wen Liang', title: "The Cartographer's Apprentice", series: 'Mapmakers', part: '1'},
];
const audible = {library: null, account: null, moduleOn: false};
// The Audible card on the Bridge's Accounts tab.
const audibleCard = () => page.getByRole('region', {name: 'Audible', exact: true});
const clipShoot = async (p, locator, file) => {
  await fitted(p, () => fitViewportToPage(p, 900, 2400, 600), async () => {
    await locator.scrollIntoViewIfNeeded();
    await sleep(600);
    await p.mouse.move(0, 0);
    await shoot(p, file, {clip: around([await locator.boundingBox()])});
  });
};

async function audibleShots() {
  await step('audible: library', async () => {
    await rm(AUDIBLE_DIR, {recursive: true, force: true});
    for (const b of AUDIBLE_BOOKS) {
      const dir = path.join(AUDIBLE_DIR, b.author, b.title);
      await mkdir(dir, {recursive: true});
      const meta = {artist: b.author, album_artist: b.author, album: b.title, title: b.title};
      if (b.series) Object.assign(meta, {grouping: b.series, 'series-part': b.part});
      if (!silence(path.join(dir, `${b.title}.mp3`), 5, meta)) throw new Error('ffmpeg failed (it is needed for the Audible library)');
    }
    const created = await server(admin, 'POST', '/admin/libraries', {name: AUDIBLE_LIBRARY, root: AUDIBLE_DIR});
    audible.library = created?.library ?? created;
    await waitForScans(server, admin);
    const {books = []} = (await server(admin, 'GET', `/admin/books?library_id=${audible.library.id}&limit=50`)) ?? {};
    for (const b of AUDIBLE_BOOKS.filter((x) => x.asin)) {
      const book = books.find((x) => x.path.startsWith(b.author));
      if (!book) throw new Error(`no indexed ${b.title}`);
      await server(admin, 'PATCH', `/admin/libraries/${audible.library.id}/book${pathQuery(book.path)}`, {set: {asin: b.asin}});
    }
    // The Bridge offers a library once a heartbeat has listed it (every 30 s).
    for (const until = Date.now() + 60000; Date.now() < until; await sleep(1000)) {
      const a = await bridgeApi(btoken, 'GET', '/accounts/audible');
      if (a?.libraries?.some((l) => l.id === audible.library.id)) return;
    }
    throw new Error('the Bridge never listed the Audiobooks library');
  });
  if (!audible.library) return;

  await step('audible: sign in', async () => {
    await page.reload({waitUntil: 'networkidle'});
    await tab(page, 'Accounts');
    const card = audibleCard();
    await card.getByRole('button', {name: 'Sign in to Audible', exact: true}).click();
    // The Amazon sign-in opens in a new tab (the fake's): closed, its address read from
    // the card's own link and followed here, as the browser would.
    const closeTab = (p) => p.close().catch(() => {});
    ctx.on('page', closeTab);
    await card.getByRole('button', {name: 'Open Amazon sign-in', exact: true}).click();
    const link = card.getByRole('link', {name: 'open it here', exact: true});
    await link.waitFor({timeout: 15000});
    await sleep(1500); // the tab has opened (and been closed) by now
    ctx.off('page', closeTab);
    const res = await fetch(await link.getAttribute('href'), {redirect: 'manual'});
    const landing = new URL(res.headers.get('location') || '', AUDIBLE_FAKE);
    if (!landing.searchParams.get('openid.oa2.authorization_code')) throw new Error(`the fake's sign-in answered ${res.status}`);
    // A real US sign-in lands on www.amazon.com; the code is all the Bridge reads.
    await card.getByLabel('The address Amazon showed').fill(`https://www.amazon.com${landing.pathname}${landing.search}`);
    await card.getByLabel('Belongs to').selectOption({label: 'admin'}).catch(() => {});
    await card.getByLabel('Library').selectOption({label: AUDIBLE_LIBRARY});
    await page.evaluate(() => document.activeElement?.blur()); // no focus ring in the shot
    await clipShoot(page, card, AUDIBLE_SHOTS.signIn);
    await card.getByRole('button', {name: 'Finish the sign-in', exact: true}).click();
    await card.getByText('Signed in to Audible.', {exact: true}).waitFor({timeout: 30000});
  });

  await step('audible: first check', async () => {
    const {accounts = []} = (await bridgeApi(btoken, 'GET', '/accounts/audible')) ?? {};
    audible.account = accounts[0]?.id ?? null;
    if (!audible.account) throw new Error('no Audible account on the Bridge');
    // The console's top bar shows the server name; capture-admin sets it,
    // so a run that skips it (SKIP_ADMIN=1) still gets the same header.
    await server(admin, 'PATCH', '/admin/settings', {general: {name: 'Hearthside'}, modules: {audible: true}});
    audible.moduleOn = true;
    // The module's scheduler queues the first check within a minute; Check now is sooner.
    for (const until = Date.now() + 60000; ; await sleep(2000)) {
      try {
        await server(admin, 'POST', `/admin/audible/accounts/${audible.account}/poll`);
        break;
      } catch (e) {
        // kind_unavailable until the Bridge's next heartbeat after the module came on.
        if (Date.now() > until) throw e;
      }
    }
    for (const until = Date.now() + 120000; Date.now() < until; await sleep(2000)) {
      const {accounts: list = []} = (await server(admin, 'GET', '/admin/audible/accounts')) ?? {};
      if (list.find((a) => a.id === audible.account)?.last_poll_at) return;
    }
    throw new Error('the Bridge never finished the check');
  });

  await step('audible: the Bridge card', async () => {
    await page.reload({waitUntil: 'networkidle'});
    await tab(page, 'Accounts');
    const card = audibleCard();
    await card.getByText(/already in the library/).first().waitFor({timeout: 15000});
    await clipShoot(page, card, AUDIBLE_SHOTS.account);
  });

  if (!wanted(AUDIBLE_SHOTS.card, AUDIBLE_SHOTS.titles)) return;
  const consolePage = await ctx.newPage();
  try {
    await step('audible: console sign in', async () => {
      await consolePage.goto(`${ORIGIN}/admin/`, {waitUntil: 'networkidle', timeout: 45000});
      await consolePage.getByRole('heading', {name: 'Admin sign in'}).waitFor({timeout: 15000});
      await submitSignIn(consolePage, ADMIN_PASSWORD);
      await consolePage.locator('h1.display').first().waitFor({timeout: 15000});
    });
    await step('audible: console card', async () => {
      await consolePage.goto(`${ORIGIN}/admin/server?topic=bridge`, {waitUntil: 'networkidle', timeout: 45000});
      const card = consolePage.locator('[aria-labelledby="audible-accounts-title"]');
      await card.getByText(/on this server/).first().waitFor({timeout: 15000});
      await clipShoot(consolePage, card, AUDIBLE_SHOTS.card);
    });
    await step('audible: console titles', async () => {
      await consolePage.goto(`${ORIGIN}/admin/server?topic=audible`, {waitUntil: 'networkidle', timeout: 45000});
      await consolePage.getByRole('list', {name: 'Audible titles'}).waitFor({timeout: 15000});
      await tallShoot(consolePage, AUDIBLE_SHOTS.titles, {settle: 1000, max: 1800, min: 800});
    });
  } finally {
    await consolePage.close().catch(() => {});
  }
}

// Removes what audibleShots made, whatever it got to: the account on the Bridge (which
// deregisters it from the fake and deletes it on the server), the module, the library.
async function audibleCleanup() {
  if (audible.account && btoken) {
    await bridgeApi(btoken, 'DELETE', `/accounts/audible/${audible.account}`).catch((e) => console.log(`  ! Audible account left: ${e.message}`));
  }
  if (audible.moduleOn && admin) {
    await server(admin, 'PATCH', '/admin/settings', {modules: {audible: false}}).catch((e) => console.log(`  ! audible module left on: ${e.message}`));
  }
  if (audible.library && admin) {
    await server(admin, 'DELETE', `/admin/libraries/${audible.library.id}`).catch((e) => console.log(`  ! Audiobooks library left: ${e.message}`));
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext(DESKTOP_CONTEXT);
await ctx.route(
  (url) => url.origin === new URL(BASE).origin && /^\/api\/(status|libraries|engine)/.test(url.pathname),
  async (route) => {
    const res = await route.fetch();
    return route.fulfill({response: res, body: shown(await res.text())});
  },
);
const page = await ctx.newPage();
let admin = null;
// The Bridge's page token once it is paired (null until then).
let btoken = null;
console.log('== bridge page ==');
try {
  await step('bridge: sign in', async () => {
    await page.goto(BASE, {waitUntil: 'networkidle', timeout: 30000});
    await page.getByLabel('Password', {exact: true}).waitFor({timeout: 15000});
    await tallShoot(page, SHOTS.signIn);
    await page.getByLabel('Password', {exact: true}).fill(PASSWORD);
    await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByText('Pair with a server', {exact: true}).waitFor({timeout: 15000});
  });

  const {token} = await server(null, 'POST', '/auth/login', {username: 'admin', password: ADMIN_PASSWORD});
  admin = token;
  const pair = await server(admin, 'POST', '/admin/bridge/pair');

  await step('bridge: status, not paired', async () => {
    // The form as someone fills it in from the console's Connect a bridge dialog (the
    // compose file's address in the shot, this server's for the real pairing).
    await page.getByLabel('Server address').fill(SHOWN_SERVER);
    await page.getByLabel('Pairing code').fill(pair.code);
    await tallShoot(page, SHOTS.unpaired);
  });

  await step('bridge: pair', async () => {
    await page.getByLabel('Server address').fill(ORIGIN);
    await page.getByRole('button', {name: 'Pair', exact: true}).click();
    await page.getByRole('button', {name: 'Unpair...', exact: true}).waitFor({timeout: 30000});
    btoken = await page.evaluate(() => localStorage.getItem('audiosilo_bridge_token'));
  });

  if (btoken) {
    // The libraries arrive with the first heartbeat after pairing.
    let libs = [];
    for (const until = Date.now() + 60000; Date.now() < until; await sleep(1000)) {
      libs = (await bridgeApi(btoken, 'GET', '/libraries'))?.libraries ?? [];
      if (libs.length) break;
    }
    if (!libs.length) console.log('  ! the Bridge listed no libraries after pairing');
    // Each library is found at the server's own path (this Bridge runs beside the
    // server, as one with the same volumes would): give its check a moment.
    await sleep(5000);

    await step('bridge: status, paired', async () => {
      await page.reload({waitUntil: 'networkidle'});
      await page.getByRole('button', {name: 'Unpair...', exact: true}).waitFor({timeout: 15000});
      await tallShoot(page, SHOTS.paired);
    });
    await step('bridge: libraries', async () => {
      await tab(page, 'Libraries');
      await page.getByRole('button', {name: 'Check now'}).waitFor({timeout: 15000});
      await sleep(1500);
      await tallShoot(page, SHOTS.libraries);
    });
    await step('bridge: accounts', async () => {
      await tab(page, 'Accounts');
      await page.getByText('GitHub', {exact: true}).first().waitFor({timeout: 15000});
      await sleep(1500);
      await tallShoot(page, SHOTS.accounts);
    });
    if (wanted(...Object.values(AUDIBLE_SHOTS))) {
      if (AUDIBLE_FAKE) await audibleShots();
      else console.log('  ! no AUDIBLE_FAKE_URL: the Audible shots keep their previous images');
    }
  }
} finally {
  await audibleCleanup();
  if (btoken) await bridgeApi(btoken, 'POST', '/unpair').catch((e) => console.log(`  ! Bridge left paired: ${e.message}`));
  if (admin) {
    if (btoken) await server(admin, 'DELETE', '/admin/bridge').catch((e) => console.log(`  ! server left paired: ${e.message}`));
    await server(admin, 'POST', '/auth/logout').catch(() => {});
  }
  await browser.close();
}
