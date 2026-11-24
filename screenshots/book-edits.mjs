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

export async function restoreSeriesAsin(api, token, book, readGaps, timeoutMs = 90_000) {
  try {
    const deadline = Date.now() + timeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);
    let previousGaps;
    let unchangedSince;
    let readError;
    while (!signal.aborted && Date.now() < deadline) {
      try {
        const detail = await api(token, 'GET', book, undefined, {}, signal);
        const gaps = await readGaps(Math.max(1, deadline - Date.now()));
        const now = Date.now();
        if (gaps !== previousGaps) {
          previousGaps = gaps;
          unchangedSince = now;
        }
        // A queued chapter check can still say community_checking=false.
        const checked = detail.community_check_failed || (detail.community_chapters && !detail.community_chapters.stale);
        // Upcoming's light run exposes no idle flag. Watch the gaps through its
        // 30-second quiet interval. Offline, the shelf can stay empty after a failed check.
        if ((gaps || detail.community_check_failed) && now - unchangedSince >= 30_000 &&
            detail.community_checking === false && checked) return;
        readError = undefined;
      } catch (err) {
        previousGaps = undefined;
        readError = err;
      }
      await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
    }
    const reason = readError ? ` (${readError.message})` : '';
    throw new Error(`timed out waiting for the chapter check and Sherlock Holmes gaps to settle${reason}`);
  } finally {
    await revertCaptureAsin(api, token, book);
  }
}
