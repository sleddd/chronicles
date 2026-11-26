/**
 * The account's In-App AI status from the server (GET /api/ai-chat): consent,
 * the block, the pause after declined requests, and the anonymous `aiUserId`
 * every request to the AI provider carries (Anthropic `metadata.user_id`, OpenAI
 * `safety_identifier`, Bedrock request metadata). Shared with the
 * Chronicles AI app, so a pause or block made by either app's declined
 * requests holds in both.
 *
 * Held here, outside React, so the request code in aiAssistant.ts can check it
 * beside every send; `stores/aiChatStore.ts` mirrors it for the components.
 * Dropped with the rest of the session (dropDecryptedState), so another
 * account signing in on this tab never sends under the last one's id.
 */
import type { AiChatStatus } from '@shared/validation/schemas.js';
import { aiChat } from './api.js';

let status: AiChatStatus | null = null;
let loading: Promise<AiChatStatus | null> | null = null;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped whenever the status is replaced or dropped, so an answer to an older request can't land after it */
let generation = 0;

const listeners = new Set<() => void>();
function notify(): void { for (const l of listeners) l(); }

export function subscribeAiStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAiStatus(): AiChatStatus | null {
  return status;
}

/** Longest a timer can wait (about 24.8 days); a pause is a day */
const MAX_TIMER_MS = 2_147_483_647;

export function setAiStatus(next: AiChatStatus | null): void {
  generation++;
  status = next;
  if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
  // When a pause runs out, everything that reads the status looks again
  const until = next?.enforcement?.pausedUntil ? Date.parse(next.enforcement.pausedUntil) : NaN;
  if (Number.isFinite(until) && until > Date.now()) {
    pauseTimer = setTimeout(() => { pauseTimer = null; notify(); }, Math.min(until - Date.now() + 1000, MAX_TIMER_MS));
  }
  notify();
}

/** Forget it (sign-out, lock): read afresh next time. */
export function clearAiStatus(): void {
  loading = null;
  setAiStatus(null);
}

/** Ask the server again; one request at a time. Null (and the old status kept) when it can't be reached. */
export function loadAiStatus(): Promise<AiChatStatus | null> {
  if (loading) return loading;
  const gen = generation;
  const p = Promise.resolve()
    .then(() => aiChat.status())
    .then(s => { if (gen === generation) setAiStatus(s); return s; })
    .catch(() => null)
    .finally(() => { if (loading === p) loading = null; });
  loading = p;
  return p;
}

/** The anonymous id every provider request carries — read from the server first (with the pause and block) if this tab doesn't have it yet. */
export async function requireAiUserId(): Promise<string> {
  const id = status?.aiUserId ?? (await loadAiStatus())?.aiUserId;
  if (!id) throw new Error('Couldn’t reach Chronicles to check In-App AI. Try again in a moment.');
  return id;
}

export type AiHold = { kind: 'paused'; until: Date } | { kind: 'blocked' };

/** Why In-App AI can't be used right now (paused until a time still ahead, or turned off), or null. */
export function aiHold(s: AiChatStatus | null = status, now: number = Date.now()): AiHold | null {
  if (!s) return null;
  if (s.blocked || s.enforcement?.level === 'blocked') return { kind: 'blocked' };
  const until = s.enforcement?.pausedUntil ? Date.parse(s.enforcement.pausedUntil) : NaN;
  if (Number.isFinite(until) && until > now) return { kind: 'paused', until: new Date(until) };
  return null;
}

/** "Thu 3:40 PM" in the reader's own locale. */
export function pauseEndLabel(until: Date): string {
  return until.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function aiHoldMessage(hold: AiHold): string {
  return hold.kind === 'paused'
    ? `In-App AI is paused until ${pauseEndLabel(hold.until)}.`
    : 'In-App AI is turned off for this account.';
}

/** Throws the reason In-App AI can't send right now, if there is one. Checked beside every request. */
export function assertAiNotHeld(): void {
  const hold = aiHold();
  if (hold) throw new Error(aiHoldMessage(hold));
}

/** Said in the chat when some recent requests were declined (5 or more in a day), before any pause. */
export const AI_WARNED_NOTICE = 'Some recent requests were declined by the AI. Repeated declined requests pause In-App AI for a day.';

/** Declined requests in the last day shown as a quiet notice (5 or more, not yet paused). */
export function aiWarned(s: AiChatStatus | null = status): boolean {
  return !!s && !aiHold(s) && s.enforcement?.level === 'warned';
}

/**
 * The AI declined a request (AiDeclinedError, any provider): tell the server once, and
 * take the status it answers with (it may now be paused or turned off). Never
 * throws — the request's own error is what the person sees.
 */
export async function reportAiRefusal(): Promise<void> {
  try {
    setAiStatus(await aiChat.refusal());
  } catch {
    // Not counted this time; the declined request still shows its error
  }
}
