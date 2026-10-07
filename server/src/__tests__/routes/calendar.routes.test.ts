import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';

// Mock prisma
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    calendarIntegration: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock auth middleware
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req: any, _res: any, next: any) => {
    req.auth = {
      accountId: 1,
      tenantSchemaName: 'usr_1_a1b2c3',
      sessionId: 42,
      selector: 'aabbccddee11',
    };
    next();
  }),
}));

// Mock rate limiters
vi.mock('../../middleware/rateLimiter.js', () => ({
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  icsFeedLimiter: (_req: any, _res: any, next: any) => next(),
}));

const TEST_ENV = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3001/api/calendar/google/callback',
  CALENDAR_TOKEN_KEY: crypto.randomBytes(32).toString('base64'),
  CLIENT_URL: 'http://localhost:5173',
};

let app: express.Express;
let prisma: any;

beforeAll(async () => {
  Object.assign(process.env, TEST_ENV);
  const calendarRouter = (await import('../../routes/calendar.js')).default;
  ({ prisma } = await import('../../db/prisma.js'));
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/calendar', calendarRouter);
});

const NONCE_COOKIE = process.env.NODE_ENV !== 'development' ? '__Host-chronicle_oauth' : 'chronicle_oauth';
const TEST_NONCE = 'browser-nonce-123';
const nonceCookie = (nonce = TEST_NONCE) => `${NONCE_COOKIE}=${nonce}`;
const hashNonce = (nonce: string) => crypto.createHash('sha256').update(nonce).digest('base64url');

function signTestState(selector: string, expOffsetMs = 10 * 60 * 1000, nonce = TEST_NONCE): string {
  const payload = Buffer.from(JSON.stringify({ selector, nonce: hashNonce(nonce), exp: Date.now() + expOffsetMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', TEST_ENV.GOOGLE_CLIENT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

const validSession = {
  id: 42,
  accountId: 1,
  selector: 'aabbccddee11',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86400_000),
};

describe('Calendar Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // ===========================================================================
  // GET /api/calendar/google/auth-url
  // ===========================================================================
  describe('GET /api/calendar/google/auth-url', () => {
    it('returns a Google consent URL with a verifiable HMAC state', async () => {
      const res = await request(app).get('/api/calendar/google/auth-url');

      expect(res.status).toBe(200);
      const url = new URL(res.body.url);
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe(TEST_ENV.GOOGLE_CLIENT_ID);
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('scope')).toContain('calendar.events');

      // State is payload.signature, HMAC-signed with the client secret
      const state = url.searchParams.get('state')!;
      const [payload, sig] = [state.slice(0, state.lastIndexOf('.')), state.slice(state.lastIndexOf('.') + 1)];
      const expected = crypto.createHmac('sha256', TEST_ENV.GOOGLE_CLIENT_SECRET).update(payload).digest('base64url');
      expect(sig).toBe(expected);
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      expect(decoded.selector).toBe('aabbccddee11');
      expect(decoded.exp).toBeGreaterThan(Date.now());

      // The browser gets an HttpOnly Lax nonce cookie whose hash is in the state
      const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith(`${NONCE_COOKIE}=`))!;
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      const nonce = setCookie.split(';')[0].split('=')[1];
      expect(decoded.nonce).toBe(hashNonce(nonce));
    });
  });

  // ===========================================================================
  // GET /api/calendar/google/callback
  // ===========================================================================
  describe('GET /api/calendar/google/callback', () => {
    it('rejects a tampered state with an error redirect', async () => {
      const res = await request(app)
        .get('/api/calendar/google/callback')
        .query({ code: 'abc', state: signTestState('aabbccddee11') + 'tampered' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('googleCalendar=error');
    });

    it('rejects an expired state', async () => {
      const res = await request(app)
        .get('/api/calendar/google/callback')
        .query({ code: 'abc', state: signTestState('aabbccddee11', -1000) });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('googleCalendar=error');
    });

    it('rejects when the session is revoked', async () => {
      prisma.session.findUnique.mockResolvedValue({ ...validSession, revokedAt: new Date() });

      const res = await request(app)
        .get('/api/calendar/google/callback')
        .set('Cookie', nonceCookie())
        .query({ code: 'abc', state: signTestState('aabbccddee11') });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('googleCalendar=error');
    });

    it('exchanges the code, stores the refresh token, and redirects to settings', async () => {
      prisma.session.findUnique.mockResolvedValue(validSession);
      prisma.calendarIntegration.upsert.mockResolvedValue({});

      const idTokenPayload = Buffer.from(JSON.stringify({ email: 'user@gmail.com' })).toString('base64url');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ refresh_token: 'refresh-123', id_token: `h.${idTokenPayload}.s` }),
      }));

      const res = await request(app)
        .get('/api/calendar/google/callback')
        .set('Cookie', nonceCookie())
        .query({ code: 'auth-code', state: signTestState('aabbccddee11') });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/settings?googleCalendar=connected');

      const upsert = prisma.calendarIntegration.upsert.mock.calls[0][0];
      expect(upsert.where).toEqual({ accountId: 1 });
      expect(upsert.create.googleEmail).toBe('user@gmail.com');
      // Refresh token is stored encrypted, not in plaintext
      expect(upsert.create.googleRefreshToken).not.toContain('refresh-123');
      expect(upsert.create.googleRefreshToken.split(':')).toHaveLength(3);
    });

    it('rejects a callback finished in a different browser (no nonce cookie)', async () => {
      // e.g. an attacker's state link opened by the victim
      prisma.session.findUnique.mockResolvedValue(validSession);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const res = await request(app)
        .get('/api/calendar/google/callback')
        .query({ code: 'auth-code', state: signTestState('aabbccddee11') });

      expect(res.headers.location).toContain('googleCalendar=error');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.calendarIntegration.upsert).not.toHaveBeenCalled();
    });

    it('rejects a nonce cookie that does not match the state', async () => {
      prisma.session.findUnique.mockResolvedValue(validSession);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const res = await request(app)
        .get('/api/calendar/google/callback')
        .set('Cookie', nonceCookie('someone-elses-nonce'))
        .query({ code: 'auth-code', state: signTestState('aabbccddee11') });

      expect(res.headers.location).toContain('googleCalendar=error');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('clears the nonce cookie after the callback', async () => {
      const res = await request(app)
        .get('/api/calendar/google/callback')
        .set('Cookie', nonceCookie())
        .query({ code: 'abc', state: 'garbage' });

      const cleared = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith(`${NONCE_COOKIE}=`));
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('redirects with error when Google returns no refresh token', async () => {
      prisma.session.findUnique.mockResolvedValue(validSession);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'only-access' }),
      }));

      const res = await request(app)
        .get('/api/calendar/google/callback')
        .set('Cookie', nonceCookie())
        .query({ code: 'auth-code', state: signTestState('aabbccddee11') });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('googleCalendar=error');
    });
  });

  // ===========================================================================
  // POST /api/calendar/google/token
  // ===========================================================================
  describe('POST /api/calendar/google/token', () => {
    it('returns 401 google_disconnected when no integration exists', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue(null);

      const res = await request(app).post('/api/calendar/google/token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('google_disconnected');
    });

    it('mints an access token from the stored refresh token', async () => {
      const { encryptToken } = await import('../../services/tokenCrypto.js');
      prisma.calendarIntegration.findUnique.mockResolvedValue({
        accountId: 1,
        googleRefreshToken: encryptToken('refresh-123'),
      });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'access-456', expires_in: 3599 }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app).post('/api/calendar/google/token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ accessToken: 'access-456', expiresInSeconds: 3599 });
      const body = String(fetchMock.mock.calls[0][1].body);
      expect(body).toContain('refresh_token=refresh-123');
      expect(body).toContain('grant_type=refresh_token');
    });

    it('clears the integration and returns 401 on invalid_grant', async () => {
      const { encryptToken } = await import('../../services/tokenCrypto.js');
      prisma.calendarIntegration.findUnique.mockResolvedValue({
        accountId: 1,
        googleRefreshToken: encryptToken('revoked-token'),
      });
      prisma.calendarIntegration.update.mockResolvedValue({});
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'invalid_grant' }),
      }));

      const res = await request(app).post('/api/calendar/google/token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('google_disconnected');
      expect(prisma.calendarIntegration.update).toHaveBeenCalledWith({
        where: { accountId: 1 },
        data: { googleRefreshToken: null, googleEmail: null },
      });
    });
  });

  // ===========================================================================
  // GET /api/calendar/status
  // ===========================================================================
  describe('GET /api/calendar/status', () => {
    it('reports connection and feed state', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue({
        googleRefreshToken: 'enc',
        googleEmail: 'user@gmail.com',
        icsToken: 'a'.repeat(64),
      });

      const res = await request(app).get('/api/calendar/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        googleConnected: true,
        googleEmail: 'user@gmail.com',
        icsEnabled: true,
        icsToken: 'a'.repeat(64),
      });
    });

    it('reports disconnected when nothing is stored', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/calendar/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ googleConnected: false, googleEmail: null, icsEnabled: false, icsToken: null });
    });
  });

  // ===========================================================================
  // ICS feed endpoints
  // ===========================================================================
  describe('ICS feed', () => {
    it('enable generates a 64-hex token', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue(null);
      prisma.calendarIntegration.upsert.mockResolvedValue({});

      const res = await request(app).post('/api/calendar/ics/enable');

      expect(res.status).toBe(200);
      expect(res.body.icsToken).toMatch(/^[a-f0-9]{64}$/);
    });

    it('enable is idempotent when a token already exists', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue({ icsToken: 'b'.repeat(64) });

      const res = await request(app).post('/api/calendar/ics/enable');

      expect(res.status).toBe(200);
      expect(res.body.icsToken).toBe('b'.repeat(64));
      expect(prisma.calendarIntegration.upsert).not.toHaveBeenCalled();
    });

    it('rejects an upload that is not a VCALENDAR', async () => {
      const res = await request(app).put('/api/calendar/ics').send({ ics: 'not a calendar' });

      expect(res.status).toBe(400);
    });

    it('rejects an upload when the feed is not enabled', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue({ icsToken: null });

      const res = await request(app)
        .put('/api/calendar/ics')
        .send({ ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' });

      expect(res.status).toBe(409);
    });

    it('stores a valid upload', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue({ icsToken: 'c'.repeat(64) });
      prisma.calendarIntegration.update.mockResolvedValue({});

      const res = await request(app)
        .put('/api/calendar/ics')
        .send({ ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' });

      expect(res.status).toBe(200);
      expect(prisma.calendarIntegration.update).toHaveBeenCalled();
    });

    it('serves the feed with the calendar content type', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue({
        icsToken: 'd'.repeat(64),
        icsCalendar: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n',
      });

      const res = await request(app).get(`/api/calendar/feed/${'d'.repeat(64)}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/calendar');
      expect(res.text).toContain('BEGIN:VCALENDAR');
    });

    it('accepts a .ics suffix on the feed token', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue({
        icsToken: 'd'.repeat(64),
        icsCalendar: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
      });

      const res = await request(app).get(`/api/calendar/feed/${'d'.repeat(64)}.ics`);

      expect(res.status).toBe(200);
    });

    it('404s on malformed and unknown tokens', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue(null);

      expect((await request(app).get('/api/calendar/feed/short')).status).toBe(404);
      expect((await request(app).get(`/api/calendar/feed/${'e'.repeat(64)}`)).status).toBe(404);
      // Malformed tokens never hit the database
      const malformed = await request(app).get('/api/calendar/feed/UPPERCASE-not-hex');
      expect(malformed.status).toBe(404);
    });
  });

  // ===========================================================================
  // DELETE /api/calendar/google
  // ===========================================================================
  describe('DELETE /api/calendar/google', () => {
    it('revokes the token at Google and clears stored fields', async () => {
      const { encryptToken } = await import('../../services/tokenCrypto.js');
      prisma.calendarIntegration.findUnique.mockResolvedValue({
        accountId: 1,
        googleRefreshToken: encryptToken('refresh-789'),
      });
      prisma.calendarIntegration.update.mockResolvedValue({});
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app).delete('/api/calendar/google');

      expect(res.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain('revoke');
      expect(prisma.calendarIntegration.update).toHaveBeenCalledWith({
        where: { accountId: 1 },
        data: { googleRefreshToken: null, googleEmail: null },
      });
    });

    it('succeeds when nothing is connected', async () => {
      prisma.calendarIntegration.findUnique.mockResolvedValue(null);

      const res = await request(app).delete('/api/calendar/google');

      expect(res.status).toBe(200);
    });
  });
});
