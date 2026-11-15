import crypto from 'crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';

/**
 * A software passkey for tests: makes real WebAuthn registration and sign-in
 * answers (P-256 / ES256, attestation "none") that the server's verifier
 * checks for real — the signature, the challenge, the origin, the user check.
 */

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest();

export interface SoftPasskey {
  credentialId: string;
  attestation(challenge: string, o?: { origin?: string; userVerified?: boolean }): Record<string, unknown>;
  assertion(challenge: string, o?: { origin?: string; userVerified?: boolean; rpId?: string }): Record<string, unknown>;
}

export function softPasskey(rpId: string, origin: string): SoftPasskey {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const rawId = crypto.randomBytes(32);
  let counter = 0;

  const flags = (uv: boolean, attested: boolean) => 0x01 | (uv ? 0x04 : 0) | (attested ? 0x40 : 0);
  const authData = (rp: string, uv: boolean, attested: boolean) => {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++counter);
    const head = Buffer.concat([sha256(rp), Buffer.from([flags(uv, attested)]), count]);
    if (!attested) return head;
    const cose = encodeCBOR(new Map<number, number | Uint8Array>([
      [1, 2], [3, -7], [-1, 1],
      [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
      [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
    ]));
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(rawId.length);
    return Buffer.concat([head, Buffer.alloc(16), idLen, rawId, Buffer.from(cose)]);
  };
  const clientData = (type: string, challenge: string, from: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin: from, crossOrigin: false }));

  return {
    credentialId: b64u(rawId),
    attestation(challenge, o = {}) {
      const data = authData(rpId, o.userVerified ?? true, true);
      const attestationObject = encodeCBOR(new Map<string, unknown>([
        ['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(data)],
      ]) as never);
      return {
        id: b64u(rawId), rawId: b64u(rawId), type: 'public-key',
        response: {
          clientDataJSON: b64u(clientData('webauthn.create', challenge, o.origin ?? origin)),
          attestationObject: b64u(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      };
    },
    assertion(challenge, o = {}) {
      const data = authData(o.rpId ?? rpId, o.userVerified ?? true, false);
      const cdj = clientData('webauthn.get', challenge, o.origin ?? origin);
      const signature = crypto.sign('sha256', Buffer.concat([data, sha256(cdj)]), privateKey);
      return {
        id: b64u(rawId), rawId: b64u(rawId), type: 'public-key',
        response: { clientDataJSON: b64u(cdj), authenticatorData: b64u(data), signature: b64u(signature) },
        clientExtensionResults: {},
      };
    },
  };
}
