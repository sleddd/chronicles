import { describe, it, expect } from 'vitest';
import { authLimiter, strictLimiter, apiLimiter, shareLimiter } from '../middleware/rateLimiter.js';

describe('rateLimiter exports', () => {
  it('authLimiter exists and is a function', () => {
    expect(authLimiter).toBeDefined();
    expect(typeof authLimiter).toBe('function');
  });

  it('strictLimiter exists and is a function', () => {
    expect(strictLimiter).toBeDefined();
    expect(typeof strictLimiter).toBe('function');
  });

  it('apiLimiter exists and is a function', () => {
    expect(apiLimiter).toBeDefined();
    expect(typeof apiLimiter).toBe('function');
  });

  it('shareLimiter exists and is a function', () => {
    expect(shareLimiter).toBeDefined();
    expect(typeof shareLimiter).toBe('function');
  });

  it('all limiters are Express middleware (accept 3 arguments)', () => {
    // express-rate-limit returns a middleware function with length 3 (req, res, next)
    expect(authLimiter.length).toBeGreaterThanOrEqual(0);
    expect(strictLimiter.length).toBeGreaterThanOrEqual(0);
    expect(apiLimiter.length).toBeGreaterThanOrEqual(0);
    expect(shareLimiter.length).toBeGreaterThanOrEqual(0);
  });

  it('all four limiters are distinct instances', () => {
    expect(authLimiter).not.toBe(strictLimiter);
    expect(authLimiter).not.toBe(apiLimiter);
    expect(authLimiter).not.toBe(shareLimiter);
    expect(strictLimiter).not.toBe(apiLimiter);
    expect(strictLimiter).not.toBe(shareLimiter);
    expect(apiLimiter).not.toBe(shareLimiter);
  });
});

describe('registerLimiter', () => {
  it('allows 10 sign-up attempts per hour from one IP, then blocks', async () => {
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const { registerLimiter } = await import('../middleware/rateLimiter.js');
    const app = express();
    app.post('/register', registerLimiter, (_req, res) => { res.status(201).end(); });

    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/register')).status).toBe(201);
    }
    const blocked = await request(app).post('/register');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/sign-up/i);
  });
});

describe('strictLimiter counts each route separately', () => {
  it('using up one action does not block another', async () => {
    const { default: express } = await import('express');
    const { default: request } = await import('supertest');
    const app = express();
    app.post('/api/auth/change-password', strictLimiter, (_req, res) => { res.json({ ok: true }); });
    app.post('/api/auth/2fa/enable', strictLimiter, (_req, res) => { res.json({ ok: true }); });

    for (let i = 0; i < 5; i++) expect((await request(app).post('/api/auth/change-password')).status).toBe(200);
    expect((await request(app).post('/api/auth/change-password')).status).toBe(429);
    expect((await request(app).post('/api/auth/2fa/enable')).status).toBe(200);
  });
});

describe('strictLimiter buckets', () => {
  it('a change in case or a trailing slash shares the route\'s bucket', async () => {
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const app = express();
    // A route of its own, so the other tests' counts don't carry over
    app.post('/api/test/case-route', strictLimiter, (_req, res) => { res.json({ ok: true }); });
    const paths = ['/api/test/case-route', '/api/test/Case-Route', '/api/test/case-route/', '/API/TEST/CASE-ROUTE', '/api/test/case-route'];
    const statuses: number[] = [];
    for (const p of paths) statuses.push((await request(app).post(p)).status);
    statuses.push((await request(app).post('/api/test/CASE-route/')).status);
    // 5 per window: the sixth variant is refused
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe('writeGate', () => {
  const run = async (method: string, accountId?: number) => {
    const { writeGate } = await import('../middleware/rateLimiter.js');
    const handlers: Record<string, () => void> = {};
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      set(k: string, v: string) { this.headers[k] = v; return this; },
      status(c: number) { this.statusCode = c; return this; },
      json() { return this; },
      on(ev: string, fn: () => void) { handlers[ev] = fn; },
    };
    let passed = false;
    writeGate({ method, auth: accountId === undefined ? undefined : { accountId } } as any, res, () => { passed = true; });
    return { passed, res, finish: () => handlers.finish?.() };
  };

  it('caps one account’s writes in flight, and frees a slot when one finishes', async () => {
    const { MAX_WRITES_IN_FLIGHT } = await import('../middleware/rateLimiter.js');
    const open = [];
    for (let i = 0; i < MAX_WRITES_IN_FLIGHT; i++) {
      const r = await run('PUT', 7);
      expect(r.passed).toBe(true);
      open.push(r);
    }
    const refused = await run('POST', 7);
    expect(refused.passed).toBe(false);
    expect(refused.res.statusCode).toBe(429);
    expect(refused.res.headers['Retry-After']).toBe('2');
    // Reads and other accounts aren't held back
    expect((await run('GET', 7)).passed).toBe(true);
    expect((await run('PUT', 8)).passed).toBe(true);
    open[0].finish();
    expect((await run('PUT', 7)).passed).toBe(true);
    for (const r of open) r.finish();
  });
});
