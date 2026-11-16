import { passkeyPrfInput } from '@shared/crypto/primitives.js';
import { auth as authApi, type ConfirmAction, type PasskeyCreationOptions, type PasskeyRequestOptions, type PasskeyWrap } from './api.js';

/*
 * Passkeys in the browser: sign in and open the journal with one touch.
 *
 * Every ceremony asks the authenticator, through the PRF extension, for a
 * secret that is the same each time for that passkey and comes only after its
 * fingerprint / face / PIN check. That secret opens the passkey's wrap of the
 * master key (shared/src/crypto). It is handed to the caller as bytes to derive
 * a key from and then zero — it is never sent anywhere: the answers built here
 * for the server leave `clientExtensionResults` out.
 */

const toB64u = (bytes: ArrayBuffer | Uint8Array): string => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (text: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

interface PrfResults { enabled?: boolean; results?: { first?: BufferSource } }
const prfOf = (cred: PublicKeyCredential): PrfResults =>
  ((cred.getClientExtensionResults() as { prf?: PrfResults }).prf) ?? {};
const prfBytes = (r: PrfResults): Uint8Array | null => {
  const first = r.results?.first as unknown;
  if (!first || typeof first !== 'object') return null;
  // Not `instanceof ArrayBuffer`: a password manager's extension can hand back
  // a buffer made in another frame, which fails that test and read as "no secret"
  let u8: Uint8Array;
  try {
    u8 = ArrayBuffer.isView(first)
      ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
      : new Uint8Array(first as ArrayBuffer);
  } catch {
    return null;
  }
  return u8.byteLength === 32 ? new Uint8Array(u8) : null;
};

/** The person closed the passkey sheet (or it timed out): not an error to show */
export class PasskeyCancelled extends Error {
  constructor() { super('Passkey cancelled'); this.name = 'PasskeyCancelled'; }
}
/** This passkey (or this browser) can't produce the secret that opens the journal */
export class PasskeyCannotUnlock extends Error {
  constructor(when: 'sign-in' | 'add' | 'device' = 'sign-in') {
    super(when === 'device'
      ? 'This device’s passkeys can’t open your journal (it has no way to keep the secret that unlocks it). Try your phone or a security key, or keep signing in with your password.'
      : when === 'add'
      ? 'That passkey was saved somewhere that can’t open your journal, most likely a password manager such as LastPass. Try again and, when it offers to save the passkey, close its pop-up and choose this device (Touch ID, Windows Hello) or your phone. Then delete the Chronicles passkey it just saved from the password manager, or it will keep answering at sign-in.'
      : 'A password manager (such as LastPass) answered with a passkey that can’t open your journal. Try again and, in its pop-up, choose to use your device or another passkey. Deleting the Chronicles passkey from the password manager stops this for good.');
    this.name = 'PasskeyCannotUnlock';
  }
}

function rethrow(err: unknown): never {
  if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) throw new PasskeyCancelled();
  throw err;
}

/*
 * The passkeys that have worked in this browser (their ids: random, not secret,
 * and they say nothing about whose they are). Sign-in asks for these by name,
 * so the device's own prompt opens straight away. Without it, a password
 * manager holding ANY passkey for this site (LastPass keeps the ones whose
 * adding failed, and can't be told to drop them) answers first with one that
 * can't open the journal, and the device never gets asked.
 */
export const KNOWN_PASSKEYS_STORE = 'chronicles.passkeys-here-v1';
const MAX_KNOWN = 10;
const ID_SHAPE = /^[A-Za-z0-9_-]{1,1024}$/;

export function knownPasskeys(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KNOWN_PASSKEYS_STORE) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string' && ID_SHAPE.test(id)).slice(0, MAX_KNOWN) : [];
  } catch {
    return [];
  }
}
const saveKnown = (ids: string[]): void => {
  try {
    if (ids.length) localStorage.setItem(KNOWN_PASSKEYS_STORE, JSON.stringify(ids.slice(0, MAX_KNOWN)));
    else localStorage.removeItem(KNOWN_PASSKEYS_STORE);
  } catch { /* storage unavailable: sign-in just asks for any passkey */ }
};
/** This passkey gave its secret here: ask for it first next time */
export function rememberPasskey(credentialId: string): void {
  if (!ID_SHAPE.test(credentialId)) return;
  saveKnown([credentialId, ...knownPasskeys().filter(id => id !== credentialId)]);
}
export function forgetPasskey(credentialId: string): void {
  saveKnown(knownPasskeys().filter(id => id !== credentialId));
}
/** A passkey was removed from the account here: stop asking for the ones remembered (the next sign-in takes any) */
export function forgetPasskeysHere(): void {
  saveKnown([]);
}
/** The account's passkeys are exactly these: forget any other (removed in Settings) */
export function keepOnlyPasskeys(credentialIds: string[]): void {
  const on = new Set(credentialIds);
  const known = knownPasskeys();
  const kept = known.filter(id => on.has(id));
  if (kept.length !== known.length) saveKnown(kept);
}

/**
 * Can this browser sign in with a passkey that opens the journal? False when
 * it has no passkeys at all or says it has no PRF extension; true when it says
 * it does, or can't say (older browsers have no way to ask — the touch itself
 * then tells).
 */
export async function passkeysAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof PublicKeyCredential === 'undefined' || !navigator.credentials) return false;
  try {
    const caps = await (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities?.();
    if (caps && caps['extension:prf'] === false) return false;
  } catch { /* can't say */ }
  return true;
}

/*
 * The browser's own passkey call, not the page's copy of it.
 *
 * A password manager's extension replaces `navigator.credentials.get / create`
 * on the page with its own. One that can't do what is asked here (LastPass has
 * no PRF) then fails the call at once, or answers with a passkey of its own
 * that can't open the journal — and the device's prompt never shows. A fresh
 * frame still has the browser's untouched functions, so they are taken from
 * there and called on this page's `navigator.credentials`: the request goes
 * straight to the browser, which offers the device, a phone or a security key.
 * Where a frame can't give them (or an extension got there too) the page's
 * own are used, as before.
 */
async function browserCredentials(kind: 'get' | 'create', options: CredentialRequestOptions | CredentialCreationOptions): Promise<Credential | null> {
  let frame: HTMLIFrameElement | null = null;
  let own: ((o: unknown) => Promise<Credential | null>) | null = null;
  try {
    frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    document.body.appendChild(frame);
    const proto = (frame.contentWindow as unknown as { CredentialsContainer?: { prototype?: Record<string, unknown> } } | null)?.CredentialsContainer?.prototype;
    const fn = proto?.[kind];
    if (typeof fn === 'function') own = fn as (o: unknown) => Promise<Credential | null>;
  } catch { /* no frame here: the page's own call below */ }
  try {
    // Whatever the browser answers (cancelled, refused) is the answer: no second try
    if (own) return await own.call(navigator.credentials, options);
  } finally {
    // Kept in the page until the call settled: a removed frame's functions stop working
    frame?.remove();
  }
  return kind === 'get'
    ? navigator.credentials.get(options as CredentialRequestOptions)
    : navigator.credentials.create(options as CredentialCreationOptions);
}

/** One sign-in / confirmation ceremony: the answer for the server, and the PRF secret (or null). */
async function assert(options: PasskeyRequestOptions): Promise<{ response: Record<string, unknown>; prf: Uint8Array | null; credentialId: string }> {
  const first = await passkeyPrfInput();
  const cred = await browserCredentials('get', {
    publicKey: {
      challenge: fromB64u(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification ?? 'required',
      allowCredentials: options.allowCredentials?.map(c => ({ id: fromB64u(c.id), type: 'public-key' as const, transports: c.transports as AuthenticatorTransport[] | undefined })),
      extensions: { prf: { eval: { first } } } as AuthenticationExtensionsClientInputs,
    },
  }).catch(rethrow) as PublicKeyCredential | null;
  if (!cred) throw new PasskeyCancelled();
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    credentialId: cred.id,
    prf: prfBytes(prfOf(cred)),
    // No clientExtensionResults: they hold the PRF secret
    response: {
      id: cred.id,
      rawId: toB64u(cred.rawId),
      type: 'public-key',
      response: {
        clientDataJSON: toB64u(r.clientDataJSON),
        authenticatorData: toB64u(r.authenticatorData),
        signature: toB64u(r.signature),
        ...(r.userHandle && r.userHandle.byteLength ? { userHandle: toB64u(r.userHandle) } : {}),
      },
    },
  };
}

export interface PasskeySignIn {
  user: { email: string; username: string; totpEnabled: boolean };
  wrap: PasskeyWrap;
  /** The secret that opens `wrap` — the caller zeroes it once the key is open */
  prf: Uint8Array;
}

/**
 * Sign in with a passkey: one touch, then the session and this passkey's wrap.
 *
 * It asks for the passkeys that have worked in this browser, when there are
 * any, which takes a password manager's passkeys out of the running. `any`
 * asks for whichever passkey the person picks (a new phone, someone else's).
 */
export async function signInWithPasskey({ any = false }: { any?: boolean } = {}): Promise<PasskeySignIn> {
  const { options } = await authApi.passkeyLoginOptions();
  const known = any ? [] : knownPasskeys();
  const { response, prf, credentialId } = await assert(known.length
    ? { ...options, allowCredentials: known.map(id => ({ id, type: 'public-key' as const })) }
    : options);
  if (!prf) throw new PasskeyCannotUnlock();
  try {
    const { user, passkey } = await authApi.passkeyLogin(response);
    rememberPasskey(credentialId);
    return { user, wrap: passkey, prf };
  } catch (err) {
    prf.fill(0);
    // The server has never stored this passkey (its adding never finished):
    // ask the device to drop it, so it stops being offered at sign-in
    if ((err as { body?: { unknownCredential?: unknown } } | null)?.body?.unknownCredential === true) {
      forgetPasskey(credentialId);
      forgetOnDevice(options.rpId, credentialId);
    }
    throw err;
  }
}

export interface PasskeyConfirmation {
  confirmToken: string;
  wrap: PasskeyWrap;
  prf: Uint8Array;
}

/** Confirm one sensitive action with a touch, in place of the password and the 2FA code. */
export async function confirmWithPasskey(action: ConfirmAction): Promise<PasskeyConfirmation> {
  const { options } = await authApi.confirmOptions(action);
  const { response, prf } = await assert(options);
  if (!prf) throw new PasskeyCannotUnlock();
  try {
    const { confirmToken, passkey } = await authApi.confirmVerify(action, response);
    return { confirmToken, wrap: passkey, prf };
  } catch (err) {
    prf.fill(0);
    throw err;
  }
}

export interface NewPasskey {
  /** The registration answer for the server */
  response: Record<string, unknown>;
  credentialId: string;
  /** The new passkey's secret, to wrap the master key under */
  prf: Uint8Array;
  /** The server refused to store it: ask the device to drop it again, where browsers allow */
  forget: () => void;
}

/**
 * Make a passkey on this device and get its secret. Many authenticators only
 * say "PRF supported" when the passkey is made and give the secret on first
 * use, so a second touch may follow (once). One that can't do PRF, or says
 * nothing about it, is refused: it could sign in but never open the journal.
 */
export async function createPasskey(options: PasskeyCreationOptions, onSecondTouch?: () => void): Promise<NewPasskey> {
  const first = await passkeyPrfInput();
  const cred = await browserCredentials('create', {
    publicKey: {
      challenge: fromB64u(options.challenge),
      rp: options.rp,
      user: { id: fromB64u(options.user.id), name: options.user.name, displayName: options.user.displayName },
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      attestation: options.attestation ?? 'none',
      authenticatorSelection: options.authenticatorSelection,
      excludeCredentials: options.excludeCredentials?.map(c => ({ id: fromB64u(c.id), type: 'public-key' as const, transports: c.transports as AuthenticatorTransport[] | undefined })),
      extensions: { prf: { eval: { first } } } as AuthenticationExtensionsClientInputs,
    },
  }).catch(rethrow) as PublicKeyCredential | null;
  if (!cred) throw new PasskeyCancelled();

  const made = prfOf(cred);
  let prf = prfBytes(made);
  if (!prf) {
    // Every browser that knows the PRF extension answers `enabled` true or
    // false when a passkey is made. No answer at all means something else made
    // it (a password manager's extension), and a second prompt would only be
    // that same pop-up again, with the same result
    if (made.enabled !== true) { forgetOnDevice(options.rp.id, cred.id); throw new PasskeyCannotUnlock(made.enabled === false ? 'device' : 'add'); }
    // The secret comes on first use. This touch is only for the secret: its
    // signature goes nowhere, so the challenge is made here
    // Say so first: a second sheet with no word of why reads as a stall. It
    // also ends by itself (the first has the server's timeout; this had none)
    onSecondTouch?.();
    const used = await browserCredentials('get', {
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: options.rp.id,
        timeout: options.timeout ?? 120_000,
        userVerification: 'required',
        allowCredentials: [{ id: new Uint8Array(cred.rawId), type: 'public-key' }],
        extensions: { prf: { eval: { first } } } as AuthenticationExtensionsClientInputs,
      },
    }).catch(rethrow) as PublicKeyCredential | null;
    prf = used ? prfBytes(prfOf(used)) : null;
    if (!prf) { forgetOnDevice(options.rp.id, cred.id); throw new PasskeyCannotUnlock('add'); }
  }

  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    credentialId: cred.id,
    prf,
    forget: () => forgetOnDevice(options.rp.id, cred.id),
    response: {
      id: cred.id,
      rawId: toB64u(cred.rawId),
      type: 'public-key',
      response: {
        clientDataJSON: toB64u(r.clientDataJSON),
        attestationObject: toB64u(r.attestationObject),
        ...(typeof r.getTransports === 'function' ? { transports: r.getTransports() } : {}),
      },
    },
  };
}

/** A passkey that was made but never stored here: ask the device to drop it, where browsers allow */
function forgetOnDevice(rpId: string | undefined, credentialId: string): void {
  const signal = (PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> }).signalUnknownCredential;
  if (!signal || !rpId) return;
  void signal.call(PublicKeyCredential, { rpId, credentialId }).catch(() => { /* best effort */ });
}

/** A name to suggest for a new passkey: "Safari on macOS" */
export function suggestedPasskeyName(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const system = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return system ? `${browser} on ${system}` : browser;
}
