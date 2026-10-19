/**
 * Minimal AWS Signature V4 query presigner (Web Crypto only, no dependencies).
 *
 * Runs entirely in the browser so the user's R2 credentials never leave the
 * client — they are decrypted with the master key and used to sign short-lived
 * URLs directly. Only the `host` header is signed and the payload is
 * UNSIGNED-PAYLOAD, so the bucket CORS policy stays minimal (GET/PUT/DELETE).
 */

export interface R2Config {
  accountId: string;        // 32-hex Cloudflare account ID
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export const PRESIGN_EXPIRY_SECONDS = 300;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(data)));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? (key.buffer as ArrayBuffer) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

/** RFC 3986 strict encoding, as SigV4 requires. */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface PresignParams {
  method: 'GET' | 'PUT' | 'DELETE';
  host: string;
  /** URI path starting with '/', already URI-safe (keys here are [a-z0-9/-]) */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
  expiresSeconds?: number;
  /** Injectable clock for tests */
  date?: Date;
}

/** Build a SigV4 presigned URL (query auth, host-only signed headers). */
export async function presignUrl(p: PresignParams): Promise<string> {
  const region = p.region ?? 'auto';
  const service = p.service ?? 's3';
  const expires = p.expiresSeconds ?? PRESIGN_EXPIRY_SECONDS;
  const now = p.date ?? new Date();

  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Already in ascending order by encoded key
  const canonicalQuery = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${p.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ].map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');

  const canonicalRequest = [
    p.method,
    p.path,
    canonicalQuery,
    `host:${p.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  let signingKey = await hmac(encoder.encode(`AWS4${p.secretAccessKey}`), dateStamp);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, service);
  signingKey = await hmac(signingKey, 'aws4_request');
  const signature = toHex(await hmac(signingKey, stringToSign));

  return `https://${p.host}${p.path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Presign a request against the user's R2 bucket (path-style addressing). */
export function presignR2(
  cfg: R2Config,
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  expiresSeconds = PRESIGN_EXPIRY_SECONDS
): Promise<string> {
  // The account id becomes the host name and the bucket the first path part:
  // anything but their real shapes could point a signed request elsewhere
  if (!/^[0-9a-f]{32}$/.test(cfg.accountId)) throw new Error('Invalid R2 account ID');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(cfg.bucket)) throw new Error('Invalid R2 bucket name');
  return presignUrl({
    method,
    host: `${cfg.accountId}.r2.cloudflarestorage.com`,
    path: `/${cfg.bucket}/${key}`,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    expiresSeconds,
  });
}
