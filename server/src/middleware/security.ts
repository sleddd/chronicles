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
  // Google Calendar's API only (client/src/services/calendarSync.ts): a path,
  // so the rest of www.googleapis.com — Cloud Storage uploads among it — isn't
  // a way out for an injected script. The OAuth code exchange runs on the server
  'https://www.googleapis.com/calendar/v3/',
  'https://*.r2.cloudflarestorage.com',
  'https://api.anthropic.com',
  'https://api.openai.com',
  ...bedrockOrigins(),
  // Media covers (client/src/services/coverLookup.ts): Open Library (its cover
  // files redirect to archive.org), Apple's iTunes Search (artwork on
  // mzstatic.com), TVmaze and Wikipedia — fixed catalogues, never a typed address
  'https://openlibrary.org',
  'https://covers.openlibrary.org',
  // archive.org stays a wildcard on purpose: covers.openlibrary.org redirects
  // to archive.org/download/…, which redirects again to whichever storage node
  // holds the file (ia800123.us.archive.org and the like — hundreds of them,
  // changing), and CSP checks every hop's host. That wildcard also takes in
  // archive.org's upload endpoint (s3.us.archive.org), so it can't be narrowed
  // to "read-only" in CSP; the client's own allowlist (isAllowedCoverUrl) only
  // ever fetches cover images, and only after Find cover is pressed
  'https://archive.org',
  'https://*.archive.org',
  'https://itunes.apple.com',
  'https://*.mzstatic.com',
  'https://api.tvmaze.com',
  'https://static.tvmaze.com',
  'https://en.wikipedia.org',
  'https://upload.wikimedia.org',
].join(' ');

/**
 * Trusted Types for pages: a plain string can't reach an HTML or script sink;
 * it goes through the client's default policy (client/src/security/
 * trustedTypes.ts — DOMPurify for HTML, own-site script URLs only, no code
 * from strings). 'dompurify' is DOMPurify's own policy. Left off the service
 * worker's script: a worker takes the CSP of its own response, and sw.js loads
 * Workbox with importScripts, which has no policy in the worker. (Other script
 * files run in the page, under the page's policy, whatever their own header.)
 */
export const SERVICE_WORKER_PATH = '/sw.js';

export function trustedTypesDirectives(path: string): string {
  // Only the service worker itself: every other path (a missing "x.js" falls
  // through to index.html) keeps the policy, so a link can't load the app
  // without it
  if (path.toLowerCase() === SERVICE_WORKER_PATH) return '';
  return "; require-trusted-types-for 'script'; trusted-types default dompurify 'allow-duplicates'";
}

/** The pages search engines may index (lower-case, no trailing slash) */
export const INDEXABLE_PAGES = new Set(['/', '/health-privacy', '/terms', '/license', '/report-a-bug']);

/** A page (not a file or the API) that search engines must not index */
export function isNoindexPage(path: string): boolean {
  const p = path.toLowerCase().replace(/\/+$/, '') || '/';
  if (p.startsWith('/api/') || p === '/api') return false;
  // A file (has an extension in its last segment): scripts, styles, images, robots.txt, sitemap.xml…
  if (/\.[a-z0-9]+$/.test(p.split('/').pop() ?? '')) return false;
  return !INDEXABLE_PAGES.has(p);
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // API responses carry the wrapped master key + salt (/me, /login), encrypted
  // entries and settings — keep them out of the browser's disk cache, where they
  // would outlive sign-out on a shared computer. Routes may override (ICS feed).
  if (req.path?.toLowerCase().startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  // Search engines index the landing page and the public legal / feedback pages only.
  // Every other page (the app, sign-in, share links, public shelves) is the same
  // index.html, which says "index, follow" for the landing page — so those pages get
  // a noindex header, which wins. Files (scripts, images, robots.txt, the sitemap)
  // and the API are left alone; robots.txt keeps crawlers out of /api/.
  if (isNoindexPage(req.path ?? '')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
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
  // A page that opened this one (or that this one opens) on another site gets
  // no handle on its window. Google sign-in for the calendar is a full
  // redirect, not a pop-up, so nothing here needs one
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Control referrer leakage — no-referrer keeps share-link tokens and in-app paths out of other sites' logs
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Disable browser features we don't need. The microphone stays available to
  // our own origin only — voice dictation in the editor needs it.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), publickey-credentials-get=(self), publickey-credentials-create=(self)');
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
