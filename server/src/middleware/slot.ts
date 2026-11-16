import type { Response } from 'express';

/**
 * Give a concurrency slot back once its request is really over.
 *
 * A slot used to be freed on the response's 'close' — which also fires the
 * moment a client drops the connection, while the handler is still reading
 * rows or waiting in the account's write queue. Opening requests and hanging
 * up straight away then ran any number of them at once, past every cap.
 *
 * So: a response that finished frees the slot; one whose connection closed
 * early frees it only when the handler ends it (every handler answers, and an
 * error goes through the error handler, which answers too). A last-resort
 * timer covers a handler that never does.
 */
const STUCK_AFTER_MS = 2 * 60 * 1000;

export function releaseWhenSettled(res: Response, release: () => void): void {
  let done = false;
  let timer: NodeJS.Timeout | null = null;
  const free = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    release();
  };
  // The handler has answered (even into a closed socket)
  const end = res.end;
  res.end = function (this: Response, ...args: unknown[]) {
    const out = (end as (...a: unknown[]) => Response).apply(this, args);
    // Sent, or nobody left to send to
    if (res.destroyed || res.writableFinished) free();
    return out;
  } as Response['end'];
  res.on('finish', free);
  res.on('close', () => {
    // Closed after the handler answered: over. Closed before: wait for it
    if (res.writableEnded) free();
    else if (!done && !timer) { timer = setTimeout(free, STUCK_AFTER_MS); timer.unref(); }
  });
}
