import crypto from 'node:crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';

/**
 * A software passkey for the multi-instance check: real WebAuthn registration
 * and sign-in answers (P-256 / ES256, attestation "none"), as in
 * server/src/__tests__/routes/softAuthenticator.ts.
 */
const b64u = b => Buffer.from(b).toString('base64url');
const sha256 = b => crypto.createHash('sha256').update(b).digest();

export function softPasskey(rpId, origin) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const rawId = crypto.randomBytes(32);
  let counter = 0;

  const authData = attested => {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++counter);
    // User present + user verified (+ attested credential data when registering)
    const head = Buffer.concat([sha256(rpId), Buffer.from([0x01 | 0x04 | (attested ? 0x40 : 0)]), count]);
    if (!attested) return head;
    const cose = encodeCBOR(new Map([
      [1, 2], [3, -7], [-1, 1],
      [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
      [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
    ]));
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(rawId.length);
    return Buffer.concat([head, Buffer.alloc(16), idLen, rawId, Buffer.from(cose)]);
  };
  const clientData = (type, challenge) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    credentialId: b64u(rawId),
    attestation(challenge) {
      const attestationObject = encodeCBOR(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData(true))]]));
      return {
        id: b64u(rawId), rawId: b64u(rawId), type: 'public-key',
        response: { clientDataJSON: b64u(clientData('webauthn.create', challenge)), attestationObject: b64u(attestationObject), transports: ['internal'] },
      };
    },
    assertion(challenge) {
      const data = authData(false);
      const cdj = clientData('webauthn.get', challenge);
      return {
        id: b64u(rawId), rawId: b64u(rawId), type: 'public-key',
        response: { clientDataJSON: b64u(cdj), authenticatorData: b64u(data), signature: b64u(crypto.sign('sha256', Buffer.concat([data, sha256(cdj)]), privateKey)) },
      };
    },
  };
}
