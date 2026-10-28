import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { sharedRateLimitStore } from '../services/sharedState.js';

/**
 * General auth rate limiter — login, register, salt lookups
 * 20 requests per 15-minute window per IP
 */
export const authLimiter = rateLimit({
  store: sharedRateLimitStore('auth'),
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Strict rate limiter — password recovery, password change, 2FA, delete…
 * 5 requests per 15-minute window per IP **per route**: one shared count meant
 * a couple of typos changing the password also blocked turning on 2FA
 */
export const strictLimiter = rateLimit({
  store: sharedRateLimitStore('strict'),
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Keyed by the matched route, not the raw path: Express matches routes
  // case-insensitively and ignores a trailing slash, so /Change-Password/
  // must share /change-password's bucket
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || 'unknown')}:${req.method} ${(req.baseUrl + (req.route?.path ?? req.path)).toLowerCase().replace(/\/+$/, '')}`,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Sign-up limiter — 10 attempts per hour per IP.
 * Sign-up has to say when an email is already registered (there's no email
 * verification step that could hide it), so this keeps anyone from using it
 * to check lots of addresses. A real person signs up once.
 */
export const registerLimiter = rateLimit({
  store: sharedRateLimitStore('register'),
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts, please try again later' },
});

/**
 * Authenticated API rate limiter — per-user throttling for data endpoints.
 * Unlike the limits above it stays in each instance's memory: it runs on
 * every request, and it's a coarse abuse cap rather than a security control,
 * so with N instances an account can make up to N × max.
 * 1500 requests per 15-minute window per user (falls back to IP if unauthenticated).
 * Normal use of the SPA plus bulk actions (imports, bulk edits, dose → Meals
 * sync) must stay well under this; 300 was low enough to lock real users out.
 * Apply AFTER authMiddleware so req.auth is populated
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const accountId = (req as any).auth?.accountId?.toString();
    if (accountId) return accountId;
    return ipKeyGenerator(req.ip || 'unknown');
  },
  message: { error: 'Too many requests, please try again later' },
});

/**
 * ICS feed rate limiter — public calendar feed fetches
 * 60 requests per 15-minute window per IP (calendar apps poll periodically)
 */
export const icsFeedLimiter = rateLimit({
  store: sharedRateLimitStore('ics'),
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Share lookup rate limiter — public share token lookups
 * 30 requests per 15-minute window per IP to prevent brute-force
 */
export const shareLimiter = rateLimit({
  store: sharedRateLimitStore('share'),
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Landing page limiter — beta applications and waitlist sign-ups.
 * 10 per hour per IP: a person submits once or twice; this stops list stuffing.
 */
export const betaLimiter = rateLimit({
  store: sharedRateLimitStore('beta'),
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-ups from here, please try again later' },
});

/**
 * Writes (anything but GET / HEAD) running or queued at once per account, in
 * this process. One account's writes wait in `withTenantLock`'s queue each
 * holding its parsed body (up to 5 MB on entries), so without a cap a burst of
 * concurrent saves well under `apiLimiter` could hold gigabytes. Normal use
 * (autosave, dose ticks, an import's 50-entry batches) stays far below it.
 */
export const MAX_WRITES_IN_FLIGHT = 16;
const writesInFlight = new Map<number, number>();

export function writeGate(req: Request, res: Response, next: NextFunction): void {
  const accountId = req.auth?.accountId;
  if (accountId === undefined || req.method === 'GET' || req.method === 'HEAD') return next();
  const n = writesInFlight.get(accountId) ?? 0;
  if (n >= MAX_WRITES_IN_FLIGHT) {
    res.set('Retry-After', '2');
    res.status(429).json({ error: 'Too many saves at once. Try again in a moment.' });
    return;
  }
  writesInFlight.set(accountId, n + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const left = (writesInFlight.get(accountId) ?? 1) - 1;
    if (left <= 0) writesInFlight.delete(accountId);
    else writesInFlight.set(accountId, left);
  };
  res.on('finish', release);
  res.on('close', release);
  next();
}
