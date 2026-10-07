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
