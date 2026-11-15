// Captures the single sign-on (OpenID Connect) screenshots: the console's sign-in
// button, Server > Settings > Sign-in, People's Waiting sign-ins card, a person's
// "Signed in with" card, and the served web player's sign-in step with its button.
//
// It needs a server of its own (run.sh starts it on SHOTS_OIDC_PORT with a fresh
// data dir), configured in its config.yaml with auth.oidc on, the name Authentik,
// public_url its own origin and the issuer OIDC_ISSUER. No real identity provider
// runs: this script serves a discovery document for that issuer on 127.0.0.1, which
// is all the server reads until someone actually signs in (discovery is lazy), so
// Settings > Sign-in reads "Connected to the provider". Nobody signs in through it.
// The waiting sign-ins, sam's identity and the session it gave sam are rows written
// into the capture database with sqlite3 (a throwaway data dir), as a sign-in would
// leave them.
// The console's and the player's answers show the issuer and the server at the
// addresses of a real install (SHOWN below), not 127.0.0.1.
//
// Env:
//   AS_ORIGIN       the server (default http://127.0.0.1:8796)
//   ADMIN_PASSWORD  its first-run admin password (parsed from its log by run.sh)
//   OIDC_DB         its database (<data>/audiosilo.db)
//   OIDC_ISSUER     the issuer its config names (http://127.0.0.1:<port>/application/o/audiosilo/)
//
// The console is driven with the exact English labels from
// audiosilo-server/admin-ui/src/i18n/locales/en.json, the player with its test ids.
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import {chromium} from 'playwright';
import {
  DESKTOP_CONTEXT,
  HOUR,
  MIN,
  apiClient,
  probeServer,
  shoot,
  showDockerPaths,
  sleep,
  stamp,
  step,
  submitSignIn,
  tid,
  wanted,
} from './lib.mjs';

const ORIGIN = (process.env.AS_ORIGIN || 'http://127.0.0.1:8796').replace(/\/$/, '');
const PASSWORD = process.env.ADMIN_PASSWORD;
const DB = process.env.OIDC_DB;
const ISSUER = process.env.OIDC_ISSUER;
if (!PASSWORD || !DB || !ISSUER) throw new Error('capture-oidc.mjs needs ADMIN_PASSWORD, OIDC_DB and OIDC_ISSUER');
const SHOTS = [
  'admin/login-oidc.png',
  'admin/settings-signin.png',
  'admin/people-waiting-signins.png',
  'admin/person-signin-identity.png',
  'web-player/connect-oidc.png',
];
if (!wanted(...SHOTS)) process.exit(0);

// What the shots show in place of the capture's loopback addresses.
const SHOWN = [
  [ISSUER, 'https://auth.example.com/application/o/audiosilo/'],
  [ORIGIN, 'https://books.example.com'],
];

// ── The discovery document ────────────────────────────────────────────────
// The server checks only that the document's issuer is its own; the endpoints
// are never called, as nobody signs in.
const idp = new URL(ISSUER);
const base = ISSUER.replace(/\/$/, '');
const discovery = JSON.stringify({
  issuer: ISSUER,
  authorization_endpoint: `${base}/authorize`,
  token_endpoint: `${base}/token`,
  userinfo_endpoint: `${base}/userinfo`,
  jwks_uri: `${base}/jwks`,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
});
const discoveryServer = http.createServer((req, res) => {
  if (req.url?.endsWith('/.well-known/openid-configuration')) {
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(discovery);
    return;
  }
  res.writeHead(404).end();
});
await new Promise((resolve) => discoveryServer.listen(Number(idp.port), idp.hostname, resolve));

const sqlite = (sql) => {
  const r = spawnSync('sqlite3', [DB], {input: `.timeout 15000\n${sql}\n`, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`sqlite3: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout;
};
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

// ── State ────────────────────────────────────────────────────────────────
const api = apiClient(ORIGIN);
const login = await api(null, 'POST', '/auth/login', {username: 'admin', password: PASSWORD, device_name: 'Office laptop'});
const token = login.token;
// A fresh server sends its admin to the first-run flow; this one is set up.
await api(token, 'PUT', '/admin/setup', {finished: true, dismissed: true});
await api(token, 'PATCH', '/admin/settings', {general: {name: 'Hearthside'}, signin: {admin_group: 'audiosilo-admins'}});

// Two ordinary accounts; sam signs in with single sign-on.
const sam = await api(token, 'POST', '/admin/users', {username: 'sam', role: 'user', email: 'sam@example.com'});
await api(token, 'POST', '/admin/users', {username: 'robin', role: 'user', email: 'robin@example.com'});
const now = Date.now();
sqlite(`
INSERT INTO user_identities(user_id, issuer, subject, email, username, link_method, linked_by, linked_at, last_sign_in_at, groups_seen)
  VALUES(${sam.id}, ${q(ISSUER)}, '3f9c2a71-5d0e-4b8a-9e61-0c7d2b4f8a15', 'sam@example.com', 'sam', 'admin', ${login.user.id},
         ${q(stamp(now - 9 * 24 * HOUR))}, ${q(stamp(now - 2 * HOUR))}, 1);
INSERT INTO tokens(user_id, token_hash, kind, device_name, created_at, last_seen, client_app)
  VALUES(${sam.id}, 'capture-oidc-sam-web', 'session', 'Web player', ${q(stamp(now - 2 * HOUR))}, ${q(stamp(now - 2 * HOUR))}, 'audiosilo-web');
INSERT INTO oidc_pending(issuer, subject, email, email_verified, username, name, groups, reason, first_seen_at, last_seen_at, attempts)
  VALUES(${q(ISSUER)}, 'b2e4d8c0-7a1f-4c35-8d92-6e0f1a3c5b77', 'jo.reed@example.com', 0, 'jo', 'Jo Reed',
         '["family","audiobooks"]', 'no_match', ${q(stamp(now - 50 * MIN))}, ${q(stamp(now - 12 * MIN))}, 2);
INSERT INTO oidc_pending(issuer, subject, email, email_verified, username, name, groups, reason, first_seen_at, last_seen_at, attempts)
  VALUES(${q(ISSUER)}, 'e7a1c3f5-2b9d-4e60-a8c4-91d3f0b6e2a8', 'alex@example.com', 1, 'alex', 'Alex Moreno',
         '["family"]', 'auto_create_off', ${q(stamp(now - 3 * 24 * HOUR))}, ${q(stamp(now - 3 * 24 * HOUR))}, 1);
`);
console.log('  ✓ oidc state');

// ── Capture ──────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext(DESKTOP_CONTEXT);
// The answers name the issuer and the server as a real install would.
await showDockerPaths(ctx, [], SHOWN);
const page = await ctx.newPage();
// Opens a console page, waits for `text` and lets it settle, then shoots `file`.
const capture = async (route, text, file) => {
  if (!wanted(file)) return;
  await page.goto(`${ORIGIN}/admin${route}`, {waitUntil: 'networkidle', timeout: 45000});
  await page.getByText(text).first().waitFor({timeout: 15000});
  await sleep(600);
  await shoot(page, file);
};

await step('sign-in page with single sign-on', async () => {
  if (!wanted('admin/login-oidc.png')) return;
  await page.goto(`${ORIGIN}/admin/`, {waitUntil: 'networkidle', timeout: 45000});
  await page.getByRole('link', {name: 'Sign in with Authentik'}).waitFor({timeout: 15000});
  await sleep(800);
  await shoot(page, 'admin/login-oidc.png');
});

if (wanted('admin/settings-signin.png', 'admin/people-waiting-signins.png', 'admin/person-signin-identity.png')) {
  await step('sign in', async () => {
    if (page.url() === 'about:blank') await page.goto(`${ORIGIN}/admin/`, {waitUntil: 'networkidle', timeout: 45000});
    await submitSignIn(page, PASSWORD);
    await page.locator('h1.display').first().waitFor({timeout: 15000});
  });
  await step('Settings > Sign-in', () =>
    capture('/server?topic=signin', 'Connected to the provider', 'admin/settings-signin.png'),
  );
  await step('Waiting sign-ins', () => capture('/people', 'Waiting sign-ins', 'admin/people-waiting-signins.png'));
  await step("sam's single sign-on", () =>
    capture(`/people/user/${sam.id}?tab=sign-in`, 'Signed in with Authentik', 'admin/person-signin-identity.png'),
  );
}

await step("the web player's sign-in step", async () => {
  if (!wanted('web-player/connect-oidc.png')) return;
  const player = await ctx.newPage();
  await player.goto(`${ORIGIN}/web/connect`, {waitUntil: 'networkidle', timeout: 45000});
  await probeServer(player, ORIGIN);
  await player.getByRole('button', {name: /^Sign in to /}).first().click({timeout: 8000});
  await tid(player, 'sign-in-oidc').waitFor({timeout: 15000});
  await sleep(800);
  await shoot(player, 'web-player/connect-oidc.png');
  await player.close();
});

await browser.close();
discoveryServer.close();
