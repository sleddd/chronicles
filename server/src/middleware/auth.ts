import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { getRekey } from '../db/rekeyQueries.js';
import { ASSISTANT_DEVICE, assistantAllowedForEmail, assistantMay, isAssistantSignOut, loadAiPrivacy, type AiPrivacy } from '../services/assistant.js';

// Extend Express Request with auth info
declare global {
  namespace Express {
    interface Request {
      auth?: {
        accountId: number;
        tenantSchemaName: string;
        sessionId: number;
        selector: string;
        /** A Chronicles AI app session: held to the allowlist in services/assistant.ts */
        assistant?: boolean;
        /** For an AI app session: the account's "Don't share with AI" choices, read for this request */
        aiPrivacy?: AiPrivacy;
      };
    }
  }
}

const ACTIVITY_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/** A session unused this long ends, whatever its expiry. A tab ends its own
    session after 15 minutes away, so what this bounds is a session nobody is
    using any more — the app was closed without signing out, or the cookie was
    copied. Two hours: such a session can't open the journal (the key is only
    in a tab's memory, and its wrap is no longer handed to a session), but it
    could still fetch ciphertext or delete things. The app pings while someone
    is at it (useIdleSignOut), so reading for an afternoon doesn't end it. */
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isSessionIdle(session: { lastActiveAt: Date }, now = Date.now()): boolean {
  return now - session.lastActiveAt.getTime() > SESSION_IDLE_MS;
}

/**
 * Split token auth middleware
 * Supports both cookie (web) and Bearer (mobile) authentication
 * Cookie path enforces CSRF protection via X-Requested-With header
 */
// The session cookie. Outside development only the __Host- name counts: a
// plain-named cookie could be planted by a sibling subdomain (session fixation)
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
function sessionCookie(req: Request): string | undefined {
  const c = req.cookies ?? {};
  // Development sets (and so reads) the plain-named cookie. It comes first
  // there: a `__Host-` one left in the browser by a run on localhost without
  // NODE_ENV=development is never replaced by a dev sign-in, and once its
  // session was revoked every request answered "Session revoked" for good
  const value = IS_DEVELOPMENT
    ? c.chronicle_session || c['__Host-chronicle_session']
    : c['__Host-chronicle_session'];
  // cookie-parser turns a value starting "j:" into an object or array: only a
  // string is ever a session token (an object here failed as a 500)
  return typeof value === 'string' ? value : undefined;
}

/** Requests whose session check must not move the session's lastActiveAt —
    the anonymous analytics counter: a session row written in the same moment
    as a count would tie the two together. */
const quietRequests = new WeakSet<Request>();

/** authMiddleware without the lastActiveAt write. */
export function quietAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  quietRequests.add(req);
  return authMiddleware(req, res, next);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;

  // Explicit branching: Bearer vs Cookie
  if (req.headers.authorization?.startsWith('Bearer ')) {
    // MOBILE PATH: Token from secure storage, no CSRF risk
    token = req.headers.authorization.slice(7);
  } else if (sessionCookie(req)) {
    // WEB PATH: Cookie sent automatically — enforce CSRF header
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      res.status(403).json({ error: 'Missing CSRF header' });
      return;
    }
    token = sessionCookie(req);
  }

  // A token is exactly 44 hex characters; anything else never reaches the database
  if (!token || !/^[a-f0-9]{44}$/.test(token)) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Split token: first 12 chars = selector, rest = verifier
  const selector = token.slice(0, 12);
  const verifier = token.slice(12);

  // Single-row lookup by selector (indexed)
  const session = await prisma.session.findUnique({
    where: { selector },
  });

  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  // Constant-time compare: SHA-256(verifier) === stored verifierHash. First,
  // so a selector alone can't learn whether its session is revoked or expired
  const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(verifierHash), Buffer.from(session.verifierHash))) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  // Check revocation and expiry
  if (session.revokedAt) {
    res.status(401).json({ error: 'Session revoked' });
    return;
  }

  if (session.expiresAt < new Date()) {
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  // Idle too long: end it for good (checked after the verifier, so a guessed
  // selector alone can't revoke someone's session)
  if (isSessionIdle(session)) {
    await revokeSession(session.selector, 'idle').catch(() => { /* refused either way */ });
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  // Debounced lastActiveAt update (fire-and-forget). Only for a request that
  // is let through: an AI-app session that is being refused must not be able
  // to keep itself from going idle by asking again
  const noteActivity = () => {
    const timeSinceActive = Date.now() - session.lastActiveAt.getTime();
    if (timeSinceActive <= ACTIVITY_DEBOUNCE_MS || quietRequests.has(req)) return;
    prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    }).catch((err) => {
      console.error('Session activity update failed:', err instanceof Error ? err.message : 'Unknown error');
    });
  };

  // Attach auth info to request
  const assistant = session.deviceInfo === ASSISTANT_DEVICE;
  req.auth = {
    accountId: session.accountId,
    tenantSchemaName: session.tenantSchemaName,
    sessionId: session.id,
    selector: session.selector,
    ...(assistant && { assistant: true }),
  };

  // The Chronicles AI app may only call its short allowlist, and only while the
  // account has it switched on — enforced here, for every route behind auth
  if (assistant) {
    try {
      // Still on the list of accounts that may use it (taken off the list, its sessions stop working)
      // The three things checked for every AI-app request, asked for together
      // (each is read fresh, never cached): three trips one after another
      // tripled the wait of every small call a syncing app makes
      const [account, rekeying, privacy] = await Promise.all([
        prisma.account.findUnique({ where: { id: session.accountId }, select: { email: true } }),
        getRekey(session.accountId),
        loadAiPrivacy(session.tenantSchemaName),
      ]);
      if (!account || !assistantAllowedForEmail(account.email)) {
        // Ended for good: back on the list later, it signs in again
        await revokeSession(session.selector, 'assistant_off').catch(() => { /* refused either way */ });
        res.status(403).json({ error: 'The Chronicles AI app isn’t available for this account' });
        return;
      }
      const path = (req.originalUrl || req.url).split('?')[0];
      // The journal is moving to a new key (the browser that started it does
      // the work): the AI app waits, so it neither reads records half under
      // the old key nor has a version sealed with the old key kept for it.
      // Signing out is the one thing it can still do
      if (!isAssistantSignOut(req.method, path) && rekeying) {
        // Waiting for the move to finish is not being refused
        noteActivity();
        res.status(409).json({ error: 'Chronicles is moving your journal to a new key. Try again once it has finished.' });
        return;
      }
      // Switched off: a session that outlived the switch (a sign-in that was on
      // its way, a revoke that failed) ends here, so switching the app on
      // again always needs a new sign-in
      if (!privacy.appEnabled) {
        await revokeSession(session.selector, 'assistant_off').catch(() => { /* refused either way */ });
      }
      const verdict = assistantMay(req.method, path, privacy);
      if (!verdict.ok) {
        res.status(verdict.status).json({ error: verdict.error });
        return;
      }
      req.auth.aiPrivacy = privacy;
    } catch (err) {
      console.error('Assistant check error:', err instanceof Error ? err.message : 'Unknown error');
      res.status(500).json({ error: 'Request failed' });
      return;
    }
  }

  noteActivity();
  next();
}

// =============================================================================
// Session helpers
// =============================================================================

/**
 * Create a new session with split token
 * Returns the full token (selector + verifier) to send to client
 */
export async function createSession(
  accountId: number,
  tenantSchemaName: string,
  options: {
    deviceInfo?: string;
    ipAddress?: string;
    userAgent?: string;
    schemaVersion?: number;
  } = {}
): Promise<string> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const selector = crypto.randomBytes(6).toString('hex'); // 12 hex chars
    const verifier = crypto.randomBytes(16).toString('hex'); // 32 hex chars
    const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day max lifetime

    try {
      await prisma.session.create({
        data: {
          selector,
          verifierHash,
          accountId,
          tenantSchemaName,
          schemaVersion: options.schemaVersion || 0,
          deviceInfo: options.deviceInfo || null,
          ipAddress: options.ipAddress || null,
          userAgent: options.userAgent || null,
          expiresAt,
        },
      });

      return selector + verifier; // 44 chars total
    } catch (err: unknown) {
      // Retry on unique constraint violation (selector collision)
      const isUniqueViolation = err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002';
      if (!isUniqueViolation || attempt === MAX_RETRIES - 1) throw err;
    }
  }

  throw new Error('Failed to create session after retries');
}

/**
 * Revoke a session by selector
 */
export async function revokeSession(selector: string, reason: string): Promise<void> {
  await prisma.session.update({
    where: { selector },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Revoke all sessions for an account except the current one
 */
// Not async: it hands back Prisma's own promise, so it can be one step of a
// transaction with the change that calls for it (awaiting it alone works too)
export function revokeAllSessions(accountId: number, exceptSelector?: string, reason = 'password_change') {
  return prisma.session.updateMany({
    where: {
      accountId,
      revokedAt: null,
      ...(exceptSelector ? { NOT: { selector: exceptSelector } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** The Chronicles AI app was switched off: its sessions end, so switching it on again needs a new sign-in */
export async function revokeAssistantSessions(accountId: number): Promise<void> {
  await prisma.session.updateMany({
    where: { accountId, deviceInfo: ASSISTANT_DEVICE, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'assistant_off' },
  });
}

/**
 * Clean up expired and revoked sessions
 */
export async function cleanupSessions(): Promise<number> {
  // Grace period: only delete sessions expired/revoked for more than 1 day
  // to avoid deleting sessions that are currently in-flight
  const gracePeriod = new Date();
  gracePeriod.setDate(gracePeriod.getDate() - 1);

  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: gracePeriod } },
        { revokedAt: { not: null, lt: gracePeriod } },
      ],
    },
  });
  return result.count;
}

/**
 * Signing in again on a browser: the session its cookie still holds (if the
 * verifier matches) ends now, instead of staying good until idle or expiry
 * next to the new one.
 */
/** Ends the session this browser's cookie holds (only when its verifier matches); returns its account, if any */
export async function revokeBrowserSession(req: Request, reason = 'replaced'): Promise<number | null> {
  const token = sessionCookie(req);
  if (!token || !/^[a-f0-9]{44}$/.test(token)) return null;
  const selector = token.slice(0, 12);
  const session = await prisma.session.findUnique({ where: { selector } });
  if (!session || session.revokedAt) return null;
  const verifierHash = crypto.createHash('sha256').update(token.slice(12)).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(verifierHash), Buffer.from(session.verifierHash))) return null;
  await revokeSession(selector, reason);
  return session.accountId;
}
