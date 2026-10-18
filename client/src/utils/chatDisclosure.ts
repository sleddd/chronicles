/* AI disclosure for the In-App AI chat: said at the start of every session
   (the header and the empty state) and again in the thread every three hours.
   The chat is never saved, so the session's clock lives only in memory. */

export const AI_DISCLOSURE = 'You’re chatting with an AI model, not a person.';
export const AI_REMINDER = 'Reminder: you’re talking with an AI model, not a person.';
export const REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** True once three hours have passed since the session started or the last reminder. */
export function reminderDue(lastDisclosedAt: number, now: number = Date.now()): boolean {
  return now - lastDisclosedAt >= REMINDER_INTERVAL_MS;
}

/** Version of the chat consent / safety notice — bump it to ask everyone again. */
export const AI_CONSENT_VERSION = 1;
