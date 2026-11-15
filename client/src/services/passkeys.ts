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
  const first = r.results?.first;
  if (!first) return null;
  const u8 = first instanceof ArrayBuffer ? new Uint8Array(first) : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  return u8.byteLength === 32 ? new Uint8Array(u8) : null;
};

/** The person closed the passkey sheet (or it timed out): not an error to show */
export class PasskeyCancelled extends Error {
  constructor() { super('Passkey cancelled'); this.name = 'PasskeyCancelled'; }
}
/** This passkey (or this browser) can't produce the secret that opens the journal */
export class PasskeyCannotUnlock extends Error {
  constructor() { super('This passkey can’t open your journal on this device.'); this.name = 'PasskeyCannotUnlock'; }
}

function rethrow(err: unknown): never {
  if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) throw new PasskeyCancelled();
  throw err;
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

/** One sign-in / confirmation ceremony: the answer for the server, and the PRF secret (or null). */
async function assert(options: PasskeyRequestOptions): Promise<{ response: Record<string, unknown>; prf: Uint8Array | null; credentialId: string }> {
  const first = await passkeyPrfInput();
  const cred = await navigator.credentials.get({
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

/** Sign in with a passkey: one touch, then the session and this passkey's wrap. */
export async function signInWithPasskey(): Promise<PasskeySignIn> {
  const { options } = await authApi.passkeyLoginOptions();
  const { response, prf } = await assert(options);
  if (!prf) throw new PasskeyCannotUnlock();
  try {
    const { user, passkey } = await authApi.passkeyLogin(response);
    return { user, wrap: passkey, prf };
  } catch (err) {
    prf.fill(0);
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
 * use, so a second touch may follow (once). One that can't do PRF at all is
 * refused: it could sign in but never open the journal.
 */
export async function createPasskey(options: PasskeyCreationOptions): Promise<NewPasskey> {
  const first = await passkeyPrfInput();
  const cred = await navigator.credentials.create({
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
    if (made.enabled === false) { forgetOnDevice(options.rp.id, cred.id); throw new PasskeyCannotUnlock(); }
    // The secret comes on first use. This touch is only for the secret: its
    // signature goes nowhere, so the challenge is made here
    const used = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: options.rp.id,
        userVerification: 'required',
        allowCredentials: [{ id: new Uint8Array(cred.rawId), type: 'public-key' }],
        extensions: { prf: { eval: { first } } } as AuthenticationExtensionsClientInputs,
      },
    }).catch(rethrow) as PublicKeyCredential | null;
    prf = used ? prfBytes(prfOf(used)) : null;
    if (!prf) { forgetOnDevice(options.rp.id, cred.id); throw new PasskeyCannotUnlock(); }
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
