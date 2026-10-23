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
// Env: BRIDGE_BASE (the page, http://127.0.0.1:<port>/), BRIDGE_PASSWORD (its
// one-time password), AS_ORIGIN + ADMIN_PASSWORD (the demo server).
import {chromium} from 'playwright';
import path from 'node:path';
import {CACHE, DESKTOP_CONTEXT, apiClient, fitViewportToPage, shoot, sleep, step, wanted} from './lib.mjs';

const BASE = (process.env.BRIDGE_BASE || '').replace(/\/?$/, '/');
const PASSWORD = process.env.BRIDGE_PASSWORD || '';
const ORIGIN = (process.env.AS_ORIGIN || '').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SHOTS = {
  signIn: 'bridge/sign-in.png',
  unpaired: 'bridge/status-unpaired.png',
  paired: 'bridge/status-paired.png',
  libraries: 'bridge/libraries.png',
  accounts: 'bridge/accounts.png',
};
if (!wanted(...Object.values(SHOTS))) process.exit(0);
if (!BASE || !PASSWORD || !ORIGIN || !ADMIN_PASSWORD) {
  console.error('capture-bridge: BRIDGE_BASE, BRIDGE_PASSWORD, AS_ORIGIN and ADMIN_PASSWORD are required');
  process.exit(1);
}

const server = apiClient(ORIGIN);
// The Bridge page's own API, as the page calls it (a bearer token from /api/login).
const bridgeApi = async (token, method, p, body) => {
  const res = await fetch(new URL(p, BASE), {
    method,
    headers: {...(token ? {authorization: `Bearer ${token}`} : {}), ...(body ? {'content-type': 'application/json'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`bridge ${method} ${p} -> ${res.status} ${text.slice(0, 120)}`);
  return text ? JSON.parse(text) : null;
};

// Settles, moves the pointer away and shoots the page as tall as its content.
const settleShoot = async (page, file) => {
  await sleep(800);
  await page.mouse.move(0, 0);
  await fitViewportToPage(page, 900, 1600, 400);
  try {
    await shoot(page, file);
  } finally {
    await page.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
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
    .replaceAll(`${path.join(CACHE, 'library')}`, '/library')
    .replaceAll(`${CACHE}/`, '/')
    .replaceAll(ORIGIN, SHOWN_SERVER)
    .replaceAll('"mlx-whisper"', '"whisper-cpp"')
    .replaceAll('"device":"metal"', '"device":"cpu"');
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
let paired = false;
console.log('== bridge page ==');
try {
  await step('bridge: sign in', async () => {
    await page.goto(BASE, {waitUntil: 'networkidle', timeout: 30000});
    await page.getByLabel('Password', {exact: true}).waitFor({timeout: 15000});
    await settleShoot(page, SHOTS.signIn);
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
    await settleShoot(page, SHOTS.unpaired);
  });

  await step('bridge: pair', async () => {
    await page.getByLabel('Server address').fill(ORIGIN);
    await page.getByRole('button', {name: 'Pair', exact: true}).click();
    await page.getByRole('button', {name: 'Unpair...', exact: true}).waitFor({timeout: 30000});
    paired = true;
  });

  if (paired) {
    // The libraries arrive with the first heartbeat after pairing.
    const btoken = await page.evaluate(() => localStorage.getItem('audiosilo_bridge_token'));
    let libs = [];
    for (const until = Date.now() + 60000; Date.now() < until; await sleep(1000)) {
      libs = (await bridgeApi(btoken, 'GET', 'api/libraries'))?.libraries ?? [];
      if (libs.length) break;
    }
    if (!libs.length) console.log('  ! the Bridge listed no libraries after pairing');
    // Each library is found at the server's own path (this Bridge runs beside the
    // server, as one with the same volumes would): give its check a moment.
    await sleep(5000);

    await step('bridge: status, paired', async () => {
      await page.reload({waitUntil: 'networkidle'});
      await page.getByRole('button', {name: 'Unpair...', exact: true}).waitFor({timeout: 15000});
      await settleShoot(page, SHOTS.paired);
    });
    await step('bridge: libraries', async () => {
      await tab(page, 'Libraries');
      await page.getByRole('button', {name: 'Check now'}).waitFor({timeout: 15000});
      await sleep(1500);
      await settleShoot(page, SHOTS.libraries);
    });
    await step('bridge: accounts', async () => {
      await tab(page, 'Accounts');
      await page.getByText('GitHub', {exact: true}).first().waitFor({timeout: 15000});
      await sleep(1500);
      await settleShoot(page, SHOTS.accounts);
    });
  }
} finally {
  if (paired) {
    const btoken = await page.evaluate(() => localStorage.getItem('audiosilo_bridge_token')).catch(() => null);
    if (btoken) await bridgeApi(btoken, 'POST', 'api/unpair').catch((e) => console.log(`  ! Bridge left paired: ${e.message}`));
  }
  if (admin) {
    if (paired) await server(admin, 'DELETE', '/admin/bridge').catch((e) => console.log(`  ! server left paired: ${e.message}`));
    await server(admin, 'POST', '/auth/logout').catch(() => {});
  }
  await browser.close();
}
