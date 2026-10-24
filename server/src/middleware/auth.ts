import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { revokeGrantsForAccount, revokeGrantsForSession } from '../services/rememberGrants.js';

// Extend Express Request with auth info
declare global {
  namespace Express {
    interface Request {
      auth?: {
        accountId: number;
        tenantSchemaName: string;
        sessionId: number;
        selector: string;
      };
    }
  }
}

const ACTIVITY_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/** A session unused this long ends, whatever its expiry — a stolen or
    forgotten one doesn't stay good for the full 7 days */
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000; // 24 hours

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
  return c['__Host-chronicle_session'] || (IS_DEVELOPMENT ? c.chronicle_session : undefined);
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

  if (!token || token.length < 44) {
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

  // Check revocation and expiry
  if (session.revokedAt) {
    res.status(401).json({ error: 'Session revoked' });
    return;
  }

  if (session.expiresAt < new Date()) {
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  // Constant-time compare: SHA-256(verifier) === stored verifierHash
  const verifierHash = crypto.createHash('sha256').update(verifier).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(verifierHash), Buffer.from(session.verifierHash))) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  // Idle too long: end it for good (checked after the verifier, so a guessed
  // selector alone can't revoke someone's session)
  if (isSessionIdle(session)) {
    await revokeSession(session.selector, 'idle').catch(() => { /* refused either way */ });
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  // Debounced lastActiveAt update (fire-and-forget)
  const timeSinceActive = Date.now() - session.lastActiveAt.getTime();
  if (timeSinceActive > ACTIVITY_DEBOUNCE_MS) {
    prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    }).catch((err) => {
      console.error('Session activity update failed:', err instanceof Error ? err.message : 'Unknown error');
    });
  }

  // Attach auth info to request
  req.auth = {
    accountId: session.accountId,
    tenantSchemaName: session.tenantSchemaName,
    sessionId: session.id,
    selector: session.selector,
  };

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
  await revokeGrantsForSession(selector);
  await prisma.session.update({
    where: { selector },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Revoke all sessions for an account except the current one
 */
export async function revokeAllSessions(accountId: number, exceptSelector?: string, reason = 'password_change'): Promise<void> {
  await revokeGrantsForAccount(accountId, exceptSelector);
  await prisma.session.updateMany({
    where: {
      accountId,
      revokedAt: null,
      ...(exceptSelector ? { NOT: { selector: exceptSelector } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
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
