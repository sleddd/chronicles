import { analytics } from './api.js';
import type { AnalyticsEvent } from '@shared/validation/schemas.js';

/* Anonymous app analytics, held back before they're sent: each event waits a
   random 30 seconds to 10 minutes, so the request's time (in access logs, or
   beside the session's other requests) says nothing about when the crisis card
   showed or the chat paused for a likely minor. Kept only in this tab's memory
   — an event still waiting when the tab closes is simply not counted. */

const MIN_DELAY_MS = 30 * 1000;
const MAX_DELAY_MS = 10 * 60 * 1000;

/** A delay in [MIN, MAX), from the crypto RNG (Math.random would do, but costs nothing to avoid). */
export function analyticsDelayMs(): number {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return MIN_DELAY_MS + Math.floor((n[0] / 2 ** 32) * (MAX_DELAY_MS - MIN_DELAY_MS));
}

/** Queue one event to be counted later. Never throws, never blocks the caller. */
export function queueAnalyticsEvent(event: AnalyticsEvent, send: (e: AnalyticsEvent) => Promise<unknown> = analytics.send): void {
  setTimeout(() => {
    void send(event).catch(() => { /* counting never matters to the person */ });
  }, analyticsDelayMs());
}
