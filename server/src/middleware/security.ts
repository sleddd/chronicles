import type { Request, Response, NextFunction } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent XSS from stealing in-memory key
  // Note: style-src 'unsafe-inline' is required by styled-components (CSS-in-JS).
  // CSP nonces can't be used here because Express is API-only — the HTML page is served
  // separately (Vite dev server / static CDN), so nonces set on API responses wouldn't
  // propagate to the page's style tags. The risk is mitigated by script-src 'self'
  // (no inline JS), which prevents CSS-based exfiltration from escalating to code execution.
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://www.googleapis.com https://*.r2.cloudflarestorage.com https://api.anthropic.com https://api.openai.com https://*.api.aws; " +
    "frame-ancestors 'none'"
  );
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Force HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Control referrer leakage — no-referrer prevents share URLs (with #key fragment) from leaking
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Disable browser features we don't need
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()');
  next();
}
