import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter, icsFeedLimiter } from '../middleware/rateLimiter.js';
import { encryptToken, decryptToken, isTokenCryptoConfigured } from '../services/tokenCrypto.js';

const router = Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');
const STATE_TTL_MS = 10 * 60 * 1000;

// Browser binding for the OAuth round-trip: a random nonce lives in an HttpOnly
// cookie and its hash rides in the signed state. Without it, someone could
// start a flow from their own account and trick you into approving it, linking
// YOUR Google Calendar to THEIR account. Lax (not Strict) because Google's
// redirect back is a cross-site top-level navigation.
const IS_PRODUCTION = process.env.NODE_ENV !== 'development';
const OAUTH_NONCE_COOKIE = IS_PRODUCTION ? '__Host-chronicle_oauth' : 'chronicle_oauth';
const OAUTH_NONCE_COOKIE_OPTIONS = { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax' as const, path: '/' };
const hashNonce = (nonce: string) => crypto.createHash('sha256').update(nonce).digest('base64url');

function googleEnv(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

function clientUrl(): string {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

// State token: base64url payload + HMAC signature, binds the OAuth round-trip
// to a session and (via the nonce hash) to the browser that started it
function signState(selector: string, nonceHash: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ selector, nonce: nonceHash, exp: Date.now() + STATE_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyState(state: string, secret: string): { selector: string; nonce: string } | null {
  const dot = state.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed.selector !== 'string' || typeof parsed.nonce !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Date.now()) return null;
    return { selector: parsed.selector, nonce: parsed.nonce };
  } catch {
    return null;
  }
}

// =============================================================================
// Google OAuth
// =============================================================================

// GET /api/calendar/google/auth-url — start the OAuth flow (protected)
router.get('/google/auth-url', authMiddleware, apiLimiter, (req, res) => {
  const env = googleEnv();
  if (!env || !isTokenCryptoConfigured()) {
    res.status(500).json({ error: 'Google Calendar sync is not configured on this server' });
    return;
  }
  const nonce = crypto.randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state: signState(req.auth!.selector, hashNonce(nonce), env.clientSecret),
  });
  res.cookie(OAUTH_NONCE_COOKIE, nonce, { ...OAUTH_NONCE_COOKIE_OPTIONS, maxAge: STATE_TTL_MS });
  res.json({ url: `${GOOGLE_AUTH_URL}?${params.toString()}` });
});

// GET /api/calendar/google/callback — OAuth redirect target (public; session bound via state)
router.get('/google/callback', async (req, res) => {
  const settingsUrl = `${clientUrl()}/settings`;
  const fail = () => res.redirect(302, `${settingsUrl}?googleCalendar=error`);
  // Single-use: the nonce is spent whether or not this attempt succeeds
  const nonce = req.cookies?.[OAUTH_NONCE_COOKIE];
  res.clearCookie(OAUTH_NONCE_COOKIE, OAUTH_NONCE_COOKIE_OPTIONS);

  try {
    const env = googleEnv();
    const { code, state } = req.query;
    if (!env || typeof code !== 'string' || typeof state !== 'string') {
      fail();
      return;
    }

    const verified = verifyState(state, env.clientSecret);
    if (!verified) {
      fail();
      return;
    }

    // Must be completed in the same browser that started the flow
    const nonceOk = typeof nonce === 'string' && nonce.length <= 128 && (() => {
      const a = Buffer.from(hashNonce(nonce));
      const b = Buffer.from(verified.nonce);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    })();
    if (!nonceOk) {
      fail();
      return;
    }

    // Resolve the session that initiated the flow
    const session = await prisma.session.findUnique({ where: { selector: verified.selector } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      fail();
      return;
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        redirect_uri: env.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', tokenRes.status, await tokenRes.text().catch(() => ''));
      fail();
      return;
    }
    const tokens = await tokenRes.json() as { refresh_token?: string; id_token?: string };
    if (!tokens.refresh_token) {
      // Without prompt=consent Google may omit the refresh token on re-auth
      console.error('Google token exchange returned no refresh_token');
      fail();
      return;
    }

    // id_token came directly from Google over TLS — safe to decode without signature verification
    let email: string | null = null;
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8'));
        if (typeof payload.email === 'string') email = payload.email;
      } catch { /* email is cosmetic — ignore decode failures */ }
    }

    const encrypted = encryptToken(tokens.refresh_token);
    await prisma.calendarIntegration.upsert({
      where: { accountId: session.accountId },
      create: { accountId: session.accountId, googleRefreshToken: encrypted, googleEmail: email },
      update: { googleRefreshToken: encrypted, googleEmail: email },
    });

    res.redirect(302, `${settingsUrl}?googleCalendar=connected`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    fail();
  }
});

// POST /api/calendar/google/token — mint a fresh access token from the stored refresh token (protected)
router.post('/google/token', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const env = googleEnv();
    if (!env) {
      res.status(500).json({ error: 'Google Calendar sync is not configured on this server' });
      return;
    }
    const integration = await prisma.calendarIntegration.findUnique({
      where: { accountId: req.auth!.accountId },
    });
    if (!integration?.googleRefreshToken) {
      res.status(401).json({ error: 'google_disconnected' });
      return;
    }

    const refreshToken = decryptToken(integration.googleRefreshToken);
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.json().catch(() => ({})) as { error?: string };
      if (body.error === 'invalid_grant') {
        // Refresh token revoked/expired — force reconnect
        await prisma.calendarIntegration.update({
          where: { accountId: req.auth!.accountId },
          data: { googleRefreshToken: null, googleEmail: null },
        });
        res.status(401).json({ error: 'google_disconnected' });
        return;
      }
      console.error('Google token refresh failed:', tokenRes.status, body);
      res.status(502).json({ error: 'Failed to refresh Google access token' });
      return;
    }

    const tokens = await tokenRes.json() as { access_token: string; expires_in: number };
    res.json({ accessToken: tokens.access_token, expiresInSeconds: tokens.expires_in });
  } catch (err) {
    console.error('Google token refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh Google access token' });
  }
});

// GET /api/calendar/status — connection status (protected)
router.get('/status', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const integration = await prisma.calendarIntegration.findUnique({
      where: { accountId: req.auth!.accountId },
    });
    res.json({
      googleConnected: !!integration?.googleRefreshToken,
      googleEmail: integration?.googleRefreshToken ? integration.googleEmail : null,
      icsEnabled: !!integration?.icsToken,
      icsToken: integration?.icsToken || null,
    });
  } catch (err) {
    console.error('Calendar status error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar status' });
  }
});

// DELETE /api/calendar/google — disconnect Google (protected)
router.delete('/google', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const integration = await prisma.calendarIntegration.findUnique({
      where: { accountId: req.auth!.accountId },
    });
    if (integration?.googleRefreshToken) {
      // Best-effort revocation — disconnect locally even if Google is unreachable
      try {
        const refreshToken = decryptToken(integration.googleRefreshToken);
        await fetch(GOOGLE_REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } catch (err) {
        console.error('Google token revocation failed (continuing):', err);
      }
      await prisma.calendarIntegration.update({
        where: { accountId: req.auth!.accountId },
        data: { googleRefreshToken: null, googleEmail: null },
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Google disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
  }
});

// =============================================================================
// Apple / ICS feed
// =============================================================================

const ICS_MAX_BYTES = 900 * 1024; // stay under the 1MB express.json limit

// POST /api/calendar/ics/enable — enable the feed, generating a token if needed (protected)
router.post('/ics/enable', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const existing = await prisma.calendarIntegration.findUnique({
      where: { accountId: req.auth!.accountId },
    });
    if (existing?.icsToken) {
      res.json({ icsToken: existing.icsToken });
      return;
    }
    const icsToken = crypto.randomBytes(32).toString('hex');
    await prisma.calendarIntegration.upsert({
      where: { accountId: req.auth!.accountId },
      create: { accountId: req.auth!.accountId, icsToken },
      update: { icsToken },
    });
    res.json({ icsToken });
  } catch (err) {
    console.error('ICS enable error:', err);
    res.status(500).json({ error: 'Failed to enable calendar feed' });
  }
});

// POST /api/calendar/ics/regenerate — rotate the feed token (protected)
router.post('/ics/regenerate', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const icsToken = crypto.randomBytes(32).toString('hex');
    await prisma.calendarIntegration.upsert({
      where: { accountId: req.auth!.accountId },
      create: { accountId: req.auth!.accountId, icsToken },
      update: { icsToken },
    });
    res.json({ icsToken });
  } catch (err) {
    console.error('ICS regenerate error:', err);
    res.status(500).json({ error: 'Failed to regenerate calendar feed' });
  }
});

// DELETE /api/calendar/ics — disable the feed (protected)
router.delete('/ics', authMiddleware, apiLimiter, async (req, res) => {
  try {
    await prisma.calendarIntegration.updateMany({
      where: { accountId: req.auth!.accountId },
      data: { icsToken: null, icsCalendar: null, icsUpdatedAt: null },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('ICS disable error:', err);
    res.status(500).json({ error: 'Failed to disable calendar feed' });
  }
});

// PUT /api/calendar/ics — upload the regenerated feed content (protected)
router.put('/ics', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const { ics } = req.body as { ics?: unknown };
    if (typeof ics !== 'string' || !ics.startsWith('BEGIN:VCALENDAR') || Buffer.byteLength(ics, 'utf8') > ICS_MAX_BYTES) {
      res.status(400).json({ error: 'Invalid calendar payload' });
      return;
    }
    const integration = await prisma.calendarIntegration.findUnique({
      where: { accountId: req.auth!.accountId },
    });
    if (!integration?.icsToken) {
      res.status(409).json({ error: 'Calendar feed is not enabled' });
      return;
    }
    await prisma.calendarIntegration.update({
      where: { accountId: req.auth!.accountId },
      data: { icsCalendar: ics, icsUpdatedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('ICS upload error:', err);
    res.status(500).json({ error: 'Failed to update calendar feed' });
  }
});

// GET /api/calendar/feed/:token — public ICS feed for Apple Calendar subscription
router.get('/feed/:token', icsFeedLimiter, async (req, res) => {
  try {
    const token = String(req.params.token).replace(/\.ics$/, '');
    if (!/^[a-f0-9]{64}$/.test(token)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const integration = await prisma.calendarIntegration.findUnique({
      where: { icsToken: token },
    });
    if (!integration) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const body = integration.icsCalendar
      || 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Chronicles//EN\r\nEND:VCALENDAR\r\n';
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="chronicles.ics"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(body);
  } catch (err) {
    console.error('ICS feed error:', err);
    res.status(500).json({ error: 'Failed to serve calendar feed' });
  }
});

export default router;
