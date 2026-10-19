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

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // API responses carry the wrapped master key + salt (/me, /login), encrypted
  // entries and settings — keep them out of the browser's disk cache, where they
  // would outlive sign-out on a shared computer. Routes may override (ICS feed).
  if (req.path?.toLowerCase().startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  // Prevent XSS from stealing in-memory key
  // Note: style-src 'unsafe-inline' is required by styled-components (CSS-in-JS).
  // CSP nonces can't be used here because Express is API-only — the HTML page is served
  // separately (Vite dev server / static CDN), so nonces set on API responses wouldn't
  // propagate to the page's style tags. The risk is mitigated by script-src 'self'
  // (no inline JS), which prevents CSS-based exfiltration from escalating to code execution.
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data: blob:; " +
    `connect-src ${CONNECT_SRC}; ` +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
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
