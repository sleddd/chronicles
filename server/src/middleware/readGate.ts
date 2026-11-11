import type { Request, Response, NextFunction } from 'express';

/**
 * Big list reads running at once per account, in this process. A list answer
 * holds its rows, their base64 copy and the JSON string until the socket has
 * taken it, so without a cap one account firing many at once (well under
 * `apiLimiter`) could hold gigabytes and every pooled connection.
 *
 * The slot is given back when the response has been sent or the connection
 * closed — not when the handler returns: `res.json` only queues the body, and
 * a client that doesn't read it keeps it in memory.
 *
 * Each kind of list (`lane`) has its own count, so loading the journal never
 * holds up the topics. The app asks for each list once at a time (identical
 * GETs share one request), so real use stays at one or two per lane.
 */
const inFlight = new Map<string, number>();

export function readGate(lane: string, max: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const accountId = req.auth?.accountId;
    if (accountId === undefined) return next();
    const key = `${accountId}:${lane}`;
    const n = inFlight.get(key) ?? 0;
    if (n >= max) {
      res.set('Retry-After', '2');
      res.status(429).json({ error: 'Still loading. Try again in a moment.' });
      return;
    }
    inFlight.set(key, n + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const left = (inFlight.get(key) ?? 1) - 1;
      if (left <= 0) inFlight.delete(key);
      else inFlight.set(key, left);
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

/** Tests only. */
export function resetReadGateForTests(): void { inFlight.clear(); }
