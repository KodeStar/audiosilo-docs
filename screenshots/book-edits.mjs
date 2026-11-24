import {sleep} from './lib.mjs';

// Both edits are safe to repeat if the server saved the first PATCH but its reply was lost.
export async function revertCaptureAsin(api, token, book, {unlink = false} = {}) {
  const body = {revert: ['asin']};
  if (unlink) {
    body.source = 'community';
    body.match = {work_id: ''};
  }
  try {
    await api(token, 'PATCH', book, body);
  } catch {
    await sleep(500);
    await api(token, 'PATCH', book, body);
  }
}

// Reverts the Series shot's ASIN once the book's chapter check has settled and stayed
// settled for 30 seconds, Upcoming's quiet interval after a book change (its light run
// exposes no idle flag), or after timeoutMs, whichever comes first.
export async function restoreSeriesAsin(api, token, book, timeoutMs = 90_000) {
  try {
    const deadline = Date.now() + timeoutMs;
    let settledSince;
    let readError;
    while (Date.now() < deadline) {
      try {
        const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
        const detail = await api(token, 'GET', book, undefined, {}, signal);
        // A queued chapter check can still say community_checking=false.
        const settled = detail.community_checking === false &&
          (detail.community_check_failed || (detail.community_chapters && !detail.community_chapters.stale));
        const now = Date.now();
        if (!settled) settledSince = undefined;
        else if (settledSince === undefined) settledSince = now;
        else if (now - settledSince >= 30_000) return;
        readError = undefined;
      } catch (err) {
        settledSince = undefined;
        readError = err;
      }
      await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
    }
    const reason = readError ? ` (${readError.message})` : '';
    throw new Error(`timed out waiting for the chapter check to settle${reason}`);
  } finally {
    await revertCaptureAsin(api, token, book);
  }
}
