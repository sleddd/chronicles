import { Router, type Response } from 'express';
import { createGrant, readGrant, revokeGrant, revokeGrantsForSession } from '../services/rememberGrants.js';
import { logSecurityEvent } from '../utils/securityLogger.js';

/**
 * "Remember me" endpoints (mounted behind authMiddleware, so the cookie path
 * also enforces the CSRF header). Web only: the grant rides in a session
 * cookie, which Bearer (mobile) clients don't have.
 */
const router = Router();

const IS_PRODUCTION = process.env.NODE_ENV !== 'development';
export const REMEMBER_COOKIE = IS_PRODUCTION ? '__Host-chronicle_unlock' : 'chronicle_unlock';
// A *session* cookie — no maxAge/expires — so the browser drops it on close
const COOKIE_OPTIONS = { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'strict' as const, path: '/' };

export function clearRememberCookie(res: Response): void {
  res.clearCookie(REMEMBER_COOKIE, COOKIE_OPTIONS);
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.authorization?.startsWith('Bearer ')) {
    res.status(400).json({ error: 'Remember me is only available in the browser' });
    return;
  }
  next();
});

// POST /api/auth/remember — start remembering this browser for this session
router.post('/', (req, res) => {
  const { grantId, secret, expiresAt } = createGrant(req.auth!.accountId, req.auth!.selector);
  res.cookie(REMEMBER_COOKIE, grantId, COOKIE_OPTIONS);
  logSecurityEvent('remember_enabled', { accountId: req.auth!.accountId, ip: req.ip });
  res.json({ secret: secret.toString('base64'), expiresAt: new Date(expiresAt).toISOString() });
  secret.fill(0);
});

// POST /api/auth/remember/key — the device secret, if this browser session still holds the grant
router.post('/key', (req, res) => {
  const grant = readGrant(req.cookies?.[REMEMBER_COOKIE], req.auth!.accountId, req.auth!.selector);
  if (!grant) {
    clearRememberCookie(res);
    res.status(404).json({ error: 'Not remembered' });
    return;
  }
  res.json({ secret: grant.secret.toString('base64'), expiresAt: new Date(grant.expiresAt).toISOString() });
  grant.secret.fill(0);
});

// DELETE /api/auth/remember — forget this browser (lock, sign-out)
router.delete('/', (req, res) => {
  revokeGrant(req.cookies?.[REMEMBER_COOKIE]);
  revokeGrantsForSession(req.auth!.selector);
  clearRememberCookie(res);
  res.json({ success: true });
});

export default router;
