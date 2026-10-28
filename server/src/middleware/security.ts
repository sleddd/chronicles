import type { Request, Response, NextFunction } from 'express';
import { bedrockOrigins } from '@chronicles/shared';

// Bedrock is allowed per region host rather than `*.amazonaws.com`, which
// would also allow every S3 bucket — an easy exfiltration channel for any
// injected script. R2 keeps a wildcard: the bucket's account ID is encrypted
// client-side, so the server can't name the one host to allow.
const CONNECT_SRC = [
  "'self'",
  'https://api.open-meteo.com',
  'https://geocoding-api.open-meteo.com',
  'https://www.googleapis.com',
  'https://*.r2.cloudflarestorage.com',
  'https://api.anthropic.com',
  'https://api.openai.com',
  ...bedrockOrigins(),
].join(' ');

/**
 * Trusted Types for pages: a plain string can't reach an HTML or script sink;
 * it goes through the client's default policy (client/src/security/
 * trustedTypes.ts — DOMPurify for HTML, own-site script URLs only, no code
 * from strings). 'dompurify' is DOMPurify's own policy. Left off script files:
 * a service worker takes the CSP of its own response, and sw.js loads Workbox
 * with importScripts, which has no policy in the worker.
 */
export function trustedTypesDirectives(path: string): string {
  if (/\.m?js$/i.test(path)) return '';
  return "; require-trusted-types-for 'script'; trusted-types default dompurify 'allow-duplicates'";
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // API responses carry the wrapped master key + salt (/me, /login), encrypted
  // entries and settings — keep them out of the browser's disk cache, where they
  // would outlive sign-out on a shared computer. Routes may override (ICS feed).
  if (req.path?.toLowerCase().startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  // Prevent XSS from stealing in-memory key
  // This runs on every response, including the SPA (index.html and the built
  // assets from client/dist, served after this middleware), so the CSP below
  // is the page's own policy. Note: style-src 'unsafe-inline' is required by
  // styled-components, which injects <style> tags at runtime without a nonce
  // (index.html is served as a static file, so there's no per-request nonce to
  // hand it either). The risk is mitigated by script-src 'self' (no inline
  // JS), which keeps CSS-based tricks from escalating to code execution.
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data: blob:; " +
    `connect-src ${CONNECT_SRC}; ` +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" +
    trustedTypesDirectives(req.path ?? '')
  );
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Force HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Control referrer leakage — no-referrer prevents share URLs (with #key fragment) from leaking
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Disable browser features we don't need. The microphone stays available to
  // our own origin only — voice dictation in the editor needs it.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()');
  next();
}

type Env = Record<string, string | undefined>;

/**
 * The CORS origin: CLIENT_URL, or the Vite dev server in development only.
 * Anywhere else an unset CLIENT_URL means no cross-origin access at all (fail
 * closed) — the right answer when the client is served from this server, and
 * never a stray localhost origin in production.
 */
export function corsOriginFor(env: Env = process.env): string | false {
  if (env.CLIENT_URL) return env.CLIENT_URL;
  return env.NODE_ENV === 'development' ? 'http://localhost:5173' : false;
}

/**
 * Express's `trust proxy` setting, or undefined to leave it off. TRUST_PROXY
 * wins when set ('0' / 'false' = none, a number = hops, else passed through);
 * otherwise one hop everywhere but development — the same condition that
 * marks cookies Secure, so a staging or unset NODE_ENV behind a proxy still
 * sees real client IPs.
 */
export function trustProxySetting(env: Env = process.env): number | string | undefined {
  const raw = env.TRUST_PROXY ?? (env.NODE_ENV !== 'development' ? '1' : '');
  if (!raw || ['0', 'false'].includes(raw)) return undefined;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}
