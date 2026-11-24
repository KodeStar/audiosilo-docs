import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as nextTurn, setTimeout as delay} from 'node:timers/promises';
import {restoreSeriesAsin, revertCaptureAsin} from './book-edits.mjs';
import {apiClient} from './lib.mjs';

const book = '/admin/libraries/1/book?path=Holmes';
const revert = {revert: ['asin']};
const unlink = {...revert, source: 'community', match: {work_id: ''}};

test('Hound cleanup retries the whole edit if the first PATCH fails', async () => {
  const calls = [];
  await revertCaptureAsin(async (...args) => {
    calls.push(args);
    if (calls.length === 1) throw new Error('connection lost');
  }, 'admin', book, {unlink: true});
  assert.deepEqual(calls, Array(2).fill(['admin', 'PATCH', book, unlink]));
});

test('Hound cleanup reports the second failure to the capture step', async () => {
  let attempts = 0;
  await assert.rejects(revertCaptureAsin(async () => {
    throw new Error(`failed attempt ${++attempts}`);
  }, 'admin', book, {unlink: true}), /failed attempt 2/);
  assert.equal(attempts, 2);
});

test('Series keeps the ASIN until the shelf settles and the book has finished checking', async (t) => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout']});
  let gaps = 'Book 4 (missing)';
  let detail = {community_checking: false, community_chapters: null};
  const patches = [];
  const api = async (_token, method, path, body) => {
    assert.equal(path, book);
    if (method === 'GET') return detail;
    patches.push(body);
  };
  const done = restoreSeriesAsin(api, 'admin', book, async () => gaps);
  async function tick(ms) {
    await nextTurn();
    t.mock.timers.tick(ms);
    await nextTurn();
  }

  await tick(30_000); // The shelf is quiet, but the chapter check has not started.
  assert.deepEqual(patches, []);
  gaps = 'Book 2 (missing), Book 4 (missing)';
  detail = {community_checking: false, community_chapters: {stale: false}};
  await tick(1000);
  await tick(29_000);
  assert.deepEqual(patches, []); // The changed shelf starts a new quiet interval.
  detail.community_chapters.stale = true;
  await tick(1000);
  assert.deepEqual(patches, []);
  detail = {community_checking: true, community_chapters: {stale: false}};
  await tick(1000);
  assert.deepEqual(patches, []);
  detail.community_checking = false;
  await tick(1000);
  await done;
  assert.deepEqual(patches, [revert]);
});

test('Series still reverts the ASIN when the wait times out', async (t) => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout']});
  const patches = [];
  const api = async (_token, method, _path, body) => {
    if (method === 'GET') return {community_checking: true};
    patches.push(body);
  };
  const done = assert.rejects(restoreSeriesAsin(api, 'admin', book, async () => ''), /timed out/);
  await nextTurn();
  t.mock.timers.tick(90_000);
  await done;
  assert.deepEqual(patches, [revert]);
});

test('a stalled book status read is aborted and the Series cleanup can still PATCH', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    requests.push(request);
    if (request.method === 'GET') await delay(1000, null, {signal: request.signal});
    return new Response(null, {status: 204});
  });
  const api = apiClient('http://localhost');
  await assert.rejects(restoreSeriesAsin(api, 'admin', book, async () => '', 50), /timed out/);
  assert.deepEqual(requests.map((r) => r.method), ['GET', 'PATCH']);
  assert.equal(requests[0].signal.aborted, true);
  assert.deepEqual(JSON.parse(requests[1].body), revert);
  assert.equal(requests[1].signal, undefined);
});

test('Series retries a missed read and accepts an empty shelf after an offline chapter check', async (t) => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout']});
  let reads = 0;
  const patches = [];
  const api = async (_token, method, _path, body) => {
    if (method === 'PATCH') return patches.push(body);
    if (++reads === 1) throw new Error('connection reset');
    return {community_checking: false, community_check_failed: true};
  };
  const done = restoreSeriesAsin(api, 'admin', book, async () => '');
  await nextTurn();
  t.mock.timers.tick(1000);
  await nextTurn();
  assert.deepEqual(patches, []);
  t.mock.timers.tick(30_000);
  await done;
  assert.equal(reads, 3);
  assert.deepEqual(patches, [revert]);
});
