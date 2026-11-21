// The public demo cannot report unknown ASINs. Use the same binary in a fresh
// data directory with a reachable loopback metadata service whose intake is closed.
// The private database also keeps the large-library fixture out of other shots.
import {spawn, spawnSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {once} from 'node:events';
import {
  CACHE, DAY, DESKTOP_CONTEXT, HOUR, apiClient, pathQuery, shoot, showDockerPaths, sleep, submitSignIn, waitForScans, wanted,
} from './lib.mjs';

const bookPath = 'Charles Dickens/A Christmas Carol (ISBN 9780141324524)';
const asin = 'B00C14ROL1';
const isbn = '9780141324524';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

export async function captureLibraryReport(browser) {
  const report = wanted('admin/settings-metadata.png', 'admin/health-unknown-asin.png');
  const background = wanted('admin/library-source-background.png');
  if (!report && !background) return;
  if (!process.env.SERVER_BIN) throw new Error('the private library capture needs SERVER_BIN from run.sh');
  const dir = await mkdtemp(path.join(CACHE, 'report-'));
  const library = path.join(dir, 'archive');
  const data = path.join(dir, 'data');
  let sawReport = false;
  const requests = [];
  const meta = http.createServer(async (req, res) => {
    requests.push([req.method, req.url]);
    if (req.url === '/healthz') return res.writeHead(200).end();
    if (req.method === 'POST' && req.url === '/api/v1/intake/unknown-asins') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      sawReport = JSON.parse(Buffer.concat(chunks)).asins?.join(',') === asin;
      return res.writeHead(sawReport ? 404 : 400, {'content-type': 'application/json'}).end('{}');
    }
    res.writeHead(404, {'content-type': 'application/json'}).end('{}');
  });
  let child, exited, context;
  try {
    const service = await listen(meta);
    const reserve = http.createServer();
    const origin = await listen(reserve);
    await new Promise((resolve) => reserve.close(resolve));
    await mkdir(data);
    await mkdir(library);
    await cp(path.join(CACHE, 'library', 'Charles Dickens', 'A Christmas Carol'),
      path.join(library, bookPath), {recursive: true});
    if (background) {
      for (const book of ['Jack London/The Scarlet Plague', 'Sun Tzu/The Art of War', 'Lewis Carroll/Through the Looking-Glass']) {
        await cp(path.join(CACHE, 'library', book), path.join(library, book), {recursive: true});
      }
    }
    await writeFile(path.join(data, 'config.yaml'), [
      'bind: ' + JSON.stringify(new URL(origin).host),
      'tls: {mode: "off"}', 'update_check: false', 'name: Hearthside',
      'metadata:', '  base_url: ' + JSON.stringify(service),
      'libraries:', '  - name: Archive', '    root: ' + JSON.stringify(library),
    ].join('\n') + '\n');
    child = spawn(process.env.SERVER_BIN, ['--data', data], {stdio: ['ignore', 'pipe', 'pipe']});
    exited = once(child, 'close');
    let password, log = '';
    const read = (buf) => {
      log = (log + buf).slice(-20000);
      password ||= /Admin password\s*:\s*(\S+)/.exec(log)?.[1];
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    for (const until = Date.now() + 30000; ; await sleep(200)) {
      if (password && await fetch(origin + '/healthz').then((r) => r.ok, () => false)) break;
      if (child.exitCode !== null || Date.now() > until) throw new Error('private capture server did not start');
    }
    const api = apiClient(origin);
    const {token} = await api(null, 'POST', '/auth/login', {username: 'admin', password});
    await api(token, 'PUT', '/admin/setup', {finished: true, dismissed: true});
    await waitForScans(api, token);
    const [archive] = (await api(token, 'GET', '/admin/libraries')).libraries;
    context = await browser.newContext(DESKTOP_CONTEXT);
    await showDockerPaths(context, [[library, '/archive'], [data, '/data']]);
    const page = await context.newPage();
    await page.goto(origin + '/admin/');
    await submitSignIn(page, password);
    await page.locator('h1.display').first().waitFor();

    if (report) {
      const book = (await api(token, 'GET', '/admin/books?limit=20')).books.find((b) => b.path === bookPath);
      if (!book) throw new Error('A Christmas Carol was not indexed');
      await api(token, 'PATCH', `/admin/libraries/${archive.id}/book${pathQuery(book.path)}`,
        {set: {asin, isbn}});
      await api(token, 'PATCH', '/admin/settings', {metadata: {report_unknown: true}});
      for (const until = Date.now() + 15000; ; await sleep(200)) {
        const {metadata} = await api(token, 'GET', '/admin/settings');
        const status = metadata.report_status;
        if (sawReport && status?.state === 'not_offered') {
          // The scheduler wakes daily during the quiet week. Only after the
          // stored quiet_until can its next tick issue another report.
          const nextTick = Date.parse(status.next_run_at) - Date.parse(status.last_run_at);
          if (nextTick >= 23 * HOUR && nextTick <= 25 * HOUR + 1000) {
            const result = spawnSync('sqlite3', [path.join(data, 'audiosilo.db'),
              "SELECT json_extract(value, '$.quiet_until') FROM server_state WHERE key='unknown_asin_report'"],
              {encoding: 'utf8'});
            if (result.status !== 0 || Date.parse(result.stdout.trim()) - Date.parse(status.last_run_at) !== 7 * DAY) {
              throw new Error('the server did not record a seven-day quiet period');
            }
            console.log(`  ✓ report: scheduler next ${status.next_run_at}, intake quiet until ${result.stdout.trim()}`);
            break;
          }
        }
        if (Date.now() > until) throw new Error(`the metadata fixture saw ${JSON.stringify(requests)}, report status ${JSON.stringify(metadata.report_status)}`);
      }
      await page.setViewportSize({width: 1440, height: 1260});
      await page.goto(origin + '/admin/server?topic=metadata');
      await page.getByTestId('report-run').filter({hasText: /tried again about a week after that attempt/}).waitFor();
      await page.getByText(/Responding.*ms/).waitFor();
      const settings = page.getByTestId('report-run').locator('xpath=ancestor::section[1]');
      const settingsBox = await settings.boundingBox();
      await shoot(page, 'admin/settings-metadata.png', {
        clip: {x: 0, y: 0, width: page.viewportSize().width, height: settingsBox.y + settingsBox.height + 16},
      });
      if (wanted('admin/health-unknown-asin.png')) {
        const issues = await api(token, 'GET', '/admin/books?issue=unknown_asin');
        if (!issues.books.some((b) => b.path === bookPath && b.isbn === isbn && b.asin === asin)) {
          throw new Error('the Health example does not have both book identifiers');
        }
        await page.goto(origin + '/admin/health/issues?issue=unknown_asin');
        const row = page.getByRole('listitem').filter({hasText: bookPath});
        await row.getByText(new RegExp(asin)).waitFor();
        await page.locator('#issue-heading').evaluate((el) => el.scrollIntoView({block: 'start'}));
        await page.mouse.wheel(0, -24);
        await shoot(page, 'admin/health-unknown-asin.png');
      }
    }
    if (background) {
      // The real PATCH waits for up to 20 seconds. Seed library index rows
      // directly, as the listening-history fixture does, so this capture need
      // not generate and probe tens of thousands of separate audio files.
      const seed = spawnSync('sqlite3', [path.join(data, 'audiosilo.db')], {
        encoding: 'utf8', input: `.timeout 15000
          WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM seq WHERE n < 250000)
          INSERT INTO books(library_id, rel_path, path_key, indexed_at, title, author)
          SELECT ${archive.id}, 'Recordings/Lecture ' || n, 'Recordings/Lecture ' || n,
            strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'Lecture ' || n, 'University Archive' FROM seq;
        `,
      });
      if (seed.status !== 0) throw new Error('could not seed large archive: ' + seed.stderr);
      await page.setViewportSize({width: 1120, height: 560});
      await page.goto(origin + '/admin/library/libraries');
      await page.getByRole('button', {name: 'Actions for Archive'}).click();
      await page.getByRole('menuitem', {name: 'Edit library...'}).click();
      const dialog = page.getByRole('dialog', {name: 'Edit Archive'});
      await dialog.getByLabel('Book details come from', {exact: true}).selectOption('path');
      const [saved] = await Promise.all([
        page.waitForResponse((res) => res.url().endsWith('/admin/libraries/' + archive.id) &&
          res.request().method() === 'PATCH', {timeout: 60000}),
        dialog.getByRole('button', {name: 'Save changes'}).click(),
      ]);
      const result = await saved.json();
      if (!result.resolving) throw new Error('the library did not report a background update: ' + JSON.stringify(result));
      await page.getByText(/Its books are switching to the new source in the background/).waitFor({timeout: 35000});
      await shoot(page, 'admin/library-source-background.png');
    }
  } finally {
    try {
      if (context) {
        for (const page of context.pages()) await page.waitForLoadState('networkidle', {timeout: 3000}).catch(() => {});
        await context.unrouteAll({behavior: 'wait'});
        await context.close();
      }
    } finally {
      if (child && child.exitCode === null) {
        child.kill('SIGTERM');
        await exited;
      }
      meta.closeAllConnections();
      if (meta.listening) await new Promise((resolve) => meta.close(resolve));
      await rm(dir, {recursive: true, force: true});
    }
  }
}
