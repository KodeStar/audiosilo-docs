// Shared helpers for the screenshot capture scripts.
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// All captures land directly in the docs static dir.
export const OUT_ROOT = path.resolve(here, '../static/img/screenshots');
export const CACHE = path.resolve(here, '.cache');
// Fixture files the capture and seed scripts read (fixtures/*.json).
export const FIXTURES = path.resolve(here, 'fixtures');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Time for the fixtures: an ISO timestamp `ms` before now, and the units to build `ms` from.
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();
// RFC 3339 without milliseconds (as the Bridge writes it), for the epoch time `ms`.
export const stamp = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

// A name as a file or URL slug ("The Slow Kitchen" -> "the-slow-kitchen").
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Where seed-podcasts.mjs writes the made-up directory's artwork for the podcast root
// `root` (beside it, so the library scan never sees it).
export const PODCAST_DIRECTORY = (root) => path.join(path.dirname(path.resolve(root)), 'podcast-directory');

// A content path as the API's `?path=` query.
export const pathQuery = (relPath) => `?path=${encodeURIComponent(relPath)}`;

// Every visited tab page (and every page further down a stack) stays mounted but
// hidden, so a test id or a button name can match several elements: always act on
// the visible one.
export const firstVisible = (locator) => locator.filter({visible: true}).first();
export const tid = (page, id) => firstVisible(page.getByTestId(id));

// The standard desktop capture context (retina, dark, motion-reduced) shared by
// the capture scripts. capture-web spreads it into its capture contexts
// (`newCaptureContext`), overriding the viewport where a shot needs it; its warm-up and
// demo-landing contexts are still built by hand.
export const DESKTOP_CONTEXT = {
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  reducedMotion: 'reduce',
};

// The phone viewport (a large iPhone, in CSS pixels) every phone shot uses.
export const PHONE = {width: 430, height: 932};

// Makes the viewport as tall as the page (between min and max, at the desktop
// width), so a long card or every card is in the shot; the caller restores
// DESKTOP_CONTEXT.viewport.
export const fitViewportToPage = async (p, min, max, settle = 800) => {
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({width: DESKTOP_CONTEXT.viewport.width, height: Math.min(Math.max(height, min), max)});
  await sleep(settle);
};

// Makes the viewport (at its width) tall enough to show `locator`'s last visible match
// down to its bottom plus `pad`, between min and max CSS pixels: for a player screen,
// which scrolls inside the page, so fitViewportToPage can't measure it. Measured twice,
// since a windowed list renders more rows in a taller viewport. The caller restores
// the viewport.
export const fitViewportTo = async (p, locator, {min = 900, max = 1800, pad = 32, settle = 800} = {}) => {
  for (let i = 0; i < 2; i++) {
    const box = await locator.filter({visible: true}).last().boundingBox();
    if (!box) return;
    const height = Math.round(Math.min(Math.max(box.y + box.height + pad, min), max));
    if (height === p.viewportSize().height) return;
    await p.setViewportSize({width: p.viewportSize().width, height});
    await sleep(settle);
  }
};

// Runs `fit` (one of the two above, bound to `p`), then `shot`, and restores
// DESKTOP_CONTEXT.viewport however the shot ends.
export const fitted = async (p, fit, shot) => {
  await fit();
  try {
    await shot();
  } finally {
    await p.setViewportSize(DESKTOP_CONTEXT.viewport);
  }
};

// Shows this machine's paths in a browser context (`ctx`) as a Docker install has them
// (the seeded library at /library, the data folder at /data, ...), so no shot names the
// capture machine's folders. `pairs` is [[real path, shown path], ...]. Every /api/
// answer that is JSON or text has each real path replaced by its shown one; a request's
// query values and JSON body strings that start with a shown path go to the server as
// the real one, so a folder typed or picked in its shown spelling still works. Range
// requests (audio) pass untouched. `text` is further [from, to] swaps made on answers
// only (the host's OS and architecture, say). `resolve` maps a host name the browser
// resolves itself (--host-resolver-rules) to the address the fetch, made from node,
// must use.
export async function showDockerPaths(ctx, pairs, text = [], resolve = {}) {
  const byReal = [...pairs].sort((a, b) => b[0].length - a[0].length);
  const byShown = [...pairs].sort((a, b) => b[1].length - a[1].length);
  const swaps = [...byReal, ...text];
  const toShown = (body) => swaps.reduce((t, [from, to]) => t.replaceAll(from, to), body);
  const toReal = (v) => {
    for (const [real, shown] of byShown) if (v === shown || v.startsWith(`${shown}/`)) return real + v.slice(shown.length);
    return v;
  };
  const deep = (v) => {
    if (typeof v === 'string') return toReal(v);
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]));
    return v;
  };
  await ctx.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request();
      if (req.headers().range) return route.continue();
      const url = new URL(req.url());
      for (const [k, v] of [...url.searchParams]) url.searchParams.set(k, toReal(v));
      const overrides = {};
      if (resolve[url.hostname]) {
        overrides.headers = {...req.headers(), host: url.host};
        url.hostname = resolve[url.hostname];
      }
      overrides.url = url.toString();
      const body = req.postData();
      if (body && (req.headers()['content-type'] ?? '').includes('json')) {
        try {
          overrides.postData = JSON.stringify(deep(JSON.parse(body)));
        } catch {
          /* not JSON after all: sent as it is */
        }
      }
      const res = await route.fetch(overrides);
      if (!/json|text/.test(res.headers()['content-type'] ?? '')) return route.fulfill({response: res});
      return route.fulfill({response: res, body: toShown(await res.text())});
    },
  );
}

// Fills the console's sign-in form (already open on `p`) as admin and submits it.
export const submitSignIn = async (p, password) => {
  await p.getByLabel('Username', {exact: true}).fill('admin');
  await p.getByLabel('Password', {exact: true}).fill(password);
  await p.getByRole('button', {name: 'Sign in', exact: true}).click();
};

// Fixture audio: ffmpeg(args) is true when ffmpeg ran and succeeded, and
// silence() writes silent mono audio, cheap to encode even when it is hours long.
export const ffmpeg = (args) =>
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'ignore'}).status === 0;
export const silence = (file, seconds, meta = {}, codec = ['-c:a', 'libmp3lame', '-b:a', '8k']) =>
  ffmpeg([
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', String(seconds),
    ...Object.entries(meta).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]),
    ...codec, file,
  ]);

// A JSON client for a server's /api/v1 (or another `prefix` on `origin`):
// api(token, method, path, body?, headers?) returns the parsed body (null when empty
// or not JSON) and throws on a non-2xx, with the code as err.status.
export const apiClient = (origin, prefix = '/api/v1') => async (token, method, p, body, headers = {}) => {
  const res = await fetch(`${origin}${prefix}${p}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      ...headers,
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
  if (!res.ok) {
    const err = new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return json;
};

// Waits until no library scans or waits in the job queue (scans run one at a time),
// asking through `api` (an apiClient) as admin `token`.
export const waitForScans = async (api, token, timeoutMs = 90000) => {
  const until = Date.now() + timeoutMs;
  await sleep(500);
  while (Date.now() < until) {
    const libs = (await api(token, 'GET', '/admin/libraries'))?.libraries ?? [];
    if (!libs.some((l) => l.scan?.running || l.scan?.queued)) return;
    await sleep(500);
  }
  throw new Error('scans still running after the timeout');
};

// Waits until every shown <img> on `p` whose src contains `srcPart` has loaded (and
// at least one is shown), rather than sleeping a fixed time for artwork. Gives up
// after `timeoutMs` with a note: the shot is still taken.
export const imagesLoaded = (p, srcPart, timeoutMs = 15000) =>
  p
    .waitForFunction(
      (part) => {
        const shown = [...document.images].filter((i) => i.src.includes(part) && i.getClientRects().length > 0);
        return shown.length > 0 && shown.every((i) => i.complete && i.naturalWidth > 0);
      },
      srcPart,
      {timeout: timeoutMs},
    )
    .then(
      () => true,
      () => {
        console.log(`  ! images with "${srcPart}" still loading after ${timeoutMs} ms`);
        return false;
      },
    );

// Raw Playwright PNGs at deviceScaleFactor 2 are large (a full desktop shot is
// ~0.5-1.3 MB); pngquant's lossy-palette pass shrinks them ~60% with no
// perceptible loss on UI captures. It's a deterministic transform run on every
// capture, so the committed PNG is the optimized one - this is part of
// generation, NOT a hand-edit of a captured file. Degrades gracefully when
// pngquant is absent (the shot is just left raw + a one-time warning).
let pngquant; // undefined = unchecked, true/false = availability
export function optimize(file) {
  if (pngquant === undefined) {
    pngquant = spawnSync('pngquant', ['--version'], {stdio: 'ignore'}).status === 0;
    if (!pngquant) console.log('  ! pngquant not found - screenshots left unoptimized (brew install pngquant)');
  }
  if (!pngquant) return;
  const r = spawnSync(
    'pngquant',
    ['--quality=65-90', '--strip', '--skip-if-larger', '--force', '--output', file, file],
    {stdio: 'ignore'},
  );
  // 0 = optimized; 98 = result would be larger (original kept); 99 = below the
  // quality floor (original kept). Anything else is a real failure worth noting.
  if (![0, 98, 99].includes(r.status)) {
    console.log(`  ! pngquant failed on ${path.basename(file)} (status ${r.status})`);
  }
}

// SHOTS_ONLY=<prefix>[,<prefix>...] limits a run to the screenshots whose path
// starts with one of them (e.g. SHOTS_ONLY=admin/, or
// SHOTS_ONLY=admin/activity,admin/people.png), so adding a few shots doesn't
// re-encode every other committed PNG. Unset = capture everything.
const ONLY = (process.env.SHOTS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);

// Whether a run captures any of `relFiles` (SHOTS_ONLY, above): a capture script
// skips the steps whose shots it wouldn't keep. An undefined file is never wanted.
export function wanted(...relFiles) {
  return relFiles.some(
    (f) => typeof f === 'string' && (!ONLY.length || ONLY.some((prefix) => f.startsWith(prefix))),
  );
}

// `opts.clip` ({x, y, width, height} in CSS pixels) captures just that region (a
// bar along the bottom, say) instead of the whole viewport.
export async function shoot(page, relFile, opts = {}) {
  if (!wanted(relFile)) return;
  const file = path.join(OUT_ROOT, relFile);
  await mkdir(path.dirname(file), {recursive: true});
  await page.screenshot({path: file, ...(opts.clip ? {clip: opts.clip} : {})});
  optimize(file);
  console.log(`  ✓ ${relFile}`);
}

// Best-effort step wrapper: a single failed capture shouldn't kill the run -
// placeholders.mjs backfills anything missing afterwards.
export async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`  ✗ ${name}: ${String(e && e.message ? e.message : e).split('\n')[0]}`);
  }
}

// A clip around `boxes` (each from boundingBox()), `pad` CSS pixels wider on every
// side, never starting off the page.
export const around = (boxes, pad = 16) => {
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return {x, y, width: right - x, height: bottom - y};
};

// A household for a capture, made as its owner (`token`) through the player's own API
// (see README.md): a collection of theirs named `collection` holding `items` (rel paths
// in library `libraryId`; none without a name), and `members` ({name, kind, access}),
// each on "collections" given that collection. What a previous run left on the account
// (a collection or a member of the same name) is reused, so a rerun adds nobody and
// spends none of the server's self-service rate limit. Resolves to
// {collectionId, members: [{...member spec, id, username}]}.
export async function addHousehold(api, token, libraryId, {collection, items = [], members = []}) {
  let collectionId = null;
  if (collection) {
    const owned = ((await api(token, 'GET', '/me/collections'))?.collections ?? []).find(
      (c) => c.owned && c.name === collection,
    );
    collectionId = owned?.id ?? (await api(token, 'POST', '/me/collections', {name: collection})).collection.id;
    await api(token, 'PUT', `/me/collections/${collectionId}/items`, {
      items: items.map((p) => ({library_id: libraryId, path: p})),
    });
  }
  const existing = members.length ? ((await api(token, 'GET', '/me/household/members'))?.members ?? []) : [];
  const made = [];
  for (const m of members) {
    const shares = m.access === 'collections' && collectionId ? {collection_ids: [collectionId]} : {};
    let member = existing.find((x) => x.name === m.name);
    if (member) {
      if (shares.collection_ids) member = await api(token, 'PATCH', `/me/household/members/${member.id}`, shares);
    } else {
      ({member} = await api(token, 'POST', '/me/household/members', {name: m.name, kind: m.kind, access: m.access, ...shares}));
    }
    made.push({...m, id: member.id, username: member.username});
  }
  return {collectionId, members: made};
}
