import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * General auth rate limiter — login, register, salt lookups
 * 20 requests per 15-minute window per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Strict rate limiter — password recovery, password change
 * 5 requests per 15-minute window per IP
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Sign-up limiter — 10 attempts per hour per IP.
 * Sign-up has to say when an email is already registered (there's no email
 * verification step that could hide it), so this keeps anyone from using it
 * to check lots of addresses. A real person signs up once.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts, please try again later' },
});

/**
 * Authenticated API rate limiter — per-user throttling for data endpoints
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
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
