/*
 * What to say when a passkey sign-in fails.
 *
 * Every failure used to read "That passkey didn’t work", including ones from
 * before the passkey sheet ever opened (too many tries, the server out of
 * reach, a domain the passkeys weren't made for). No passkey was at fault in
 * those, and the note sent people off to make another one.
 */

/**
 * Said wherever a passkey is offered (sign-up, Settings, onboarding). LastPass
 * puts itself in front of the browser's passkey prompt and answers with a
 * passkey that can't produce the secret that opens the journal, and a page
 * can't turn an extension off, so people are told before they try.
 */
export const PASSKEY_LASTPASS_NOTE = 'Passkeys do not work with LastPass. If you use the LastPass extension, you will not be able to use a passkey with Chronicles.';

interface Problem { status?: unknown; retryAfterSec?: unknown; name?: unknown; message?: unknown }

const wait = (sec: unknown): string => {
  const s = typeof sec === 'number' && sec > 0 ? sec : 0;
  if (!s) return 'a few minutes';
  const min = Math.ceil(s / 60);
  return min <= 1 ? 'a minute' : `${min} minutes`;
};

/** `signedIn`: the server accepted the passkey, and the failure came after. */
export function passkeySignInProblem(err: unknown, signedIn: boolean): string {
  if (signedIn) return 'Your journal couldn’t be opened with that passkey. Sign in with your password.';
  const e = (err ?? {}) as Problem;
  const message = typeof e.message === 'string' ? e.message : '';

  if (typeof e.status === 'number') {
    if (e.status === 429) return `Too many sign-in tries. Wait ${wait(e.retryAfterSec)}, then try again. Your passkey is fine.`;
    // The server's own words: the passkey was refused, or isn't on the account
    if (e.status === 401 && message) return message;
    if (e.status >= 500) return 'Passkey sign-in is unavailable right now. Try again in a moment, or sign in with your password.';
    // Any other refusal (a 400: the answer never got as far as being checked against a passkey)
    return `The server turned the passkey’s answer away before checking it (${e.status}). Try again, or sign in with your password.`;
  }
  // The browser refused before showing anything: this address isn't the one the passkeys belong to
  if (e.name === 'SecurityError') return 'Passkeys aren’t set up for this address. Open Chronicles at its usual address, or sign in with your password.';
  if (e.name === 'NotSupportedError' || e.name === 'NotReadableError' || e.name === 'InvalidStateError') {
    return 'This browser couldn’t use a passkey here. Sign in with your password.';
  }
  // fetch() failing is a TypeError: the request never arrived
  if (e.name === 'TypeError') return 'Chronicles couldn’t be reached. Check your connection and try again.';
  // Not the server's refusal (that has its own words above): the browser's
  // passkey prompt itself failed. Say so, with its name, so the two can be told apart
  const name = typeof e.name === 'string' && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'unknown error';
  return `The passkey prompt failed in this browser (${name}). Try again, or sign in with your password.`;
}
