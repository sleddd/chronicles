import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import rememberRoutes, { REMEMBER_COOKIE } from '../../routes/remember.js';
import { _clearGrants } from '../../services/rememberGrants.js';

let selector = 'aabbccddee11';
// The cookie is Secure outside development, so the HTTP test agent won't
// replay it — pass it back by hand
const cookieFrom = (res: request.Response) => String(res.headers['set-cookie']).split(';')[0];
function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { accountId: 1, tenantSchemaName: 'usr_1', sessionId: 1, selector }; next(); });
  app.use('/api/auth/remember', rememberRoutes);
  return app;
}

describe('remember routes', () => {
  beforeEach(() => { _clearGrants(); selector = 'aabbccddee11'; });

  it('sets an HttpOnly, SameSite=Strict session cookie and returns the secret once', async () => {
    const res = await request(makeApp()).post('/api/auth/remember');
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body.secret, 'base64')).toHaveLength(32);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain(`${REMEMBER_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/Expires=|Max-Age=/i); // session cookie: gone when the browser closes
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns the same secret with the cookie, and nothing without it', async () => {
    const app = makeApp();
    const made = await request(app).post('/api/auth/remember');
    const key = await request(app).post('/api/auth/remember/key').set('Cookie', cookieFrom(made));
    expect(key.status).toBe(200);
    expect(key.body.secret).toBe(made.body.secret);

    const noCookie = await request(app).post('/api/auth/remember/key');
    expect(noCookie.status).toBe(404);
  });

  it('refuses the grant from a different signed-in session', async () => {
    const app = makeApp();
    const made = await request(app).post('/api/auth/remember');
    selector = 'ffffffffffff';
    const key = await request(app).post('/api/auth/remember/key').set('Cookie', cookieFrom(made));
    expect(key.status).toBe(404);
  });

  it('forgets on DELETE', async () => {
    const app = makeApp();
    const cookie = cookieFrom(await request(app).post('/api/auth/remember'));
    expect((await request(app).post('/api/auth/remember/key').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).delete('/api/auth/remember').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).post('/api/auth/remember/key').set('Cookie', cookie)).status).toBe(404);
  });

  it('is browser-only (no Bearer clients)', async () => {
    const res = await request(makeApp()).post('/api/auth/remember').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(400);
  });
});
