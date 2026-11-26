import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { readGate, resetReadGateForTests } from '../middleware/readGate.js';
import { firstName } from '../services/welcomeEmail.js';

// A slot must stay taken while its handler is still working, even after the
// client hung up: freeing it on the socket's close let any number run at once
describe('concurrency slots', () => {
  // The Chronicles AI app reads in lanes of its own: a busy app never gets the owner's pages a 429
  it('an AI-app session doesn’t use up the account’s own read lanes', async () => {
    resetReadGateForTests();
    const held: (() => void)[] = [];
    const app = express();
    app.use((req, _res, next) => {
      req.auth = { accountId: 1, tenantSchemaName: 'usr_1_aaaaaa', sessionId: 1, selector: 's', ...(req.headers['x-app'] ? { assistant: true } : {}) };
      next();
    });
    app.get('/list', readGate('entries', 1), (_req, res) => { held.push(() => res.json({ ok: true })); });
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const get = (headers: Record<string, string> = {}) => new Promise<number>(resolve => {
      http.get({ port, path: '/list', headers }, res => { res.resume(); resolve(res.statusCode ?? 0); }).on('error', () => resolve(0));
    });
    try {
      const appRead = get({ 'x-app': '1' });
      while (held.length < 1) await new Promise(r => setTimeout(r, 5));
      // The app's own lane is full…
      expect(await get({ 'x-app': '1' })).toBe(429);
      // …and the owner's browser still gets in
      const ownerRead = get();
      while (held.length < 2) await new Promise(r => setTimeout(r, 5));
      held.forEach(done => done());
      expect(await appRead).toBe(200);
      expect(await ownerRead).toBe(200);
    } finally {
      server.close();
    }
  });

  it('a client that hangs up does not free its slot while the handler still runs', async () => {
    resetReadGateForTests();
    let running = 0;
    let most = 0;
    const app = express();
    app.use((req, _res, next) => { req.auth = { accountId: 1, tenantSchemaName: 'usr_1_aaaaaa', sessionId: 1, selector: 's' }; next(); });
    app.get('/list', readGate('entries', 3), async (_req, res) => {
      running++; most = Math.max(most, running);
      await new Promise(r => setTimeout(r, 300));
      running--;
      res.json({ ok: true });
    });
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    try {
      // Twelve requests, each dropped after 20 ms
      await Promise.all(Array.from({ length: 12 }, () => new Promise<void>(resolve => {
        const req = http.get({ port, path: '/list' }, res => { res.resume(); res.on('end', resolve); });
        req.on('error', () => resolve());
        setTimeout(() => req.destroy(), 20);
      })));
      await new Promise(r => setTimeout(r, 500));
      expect(most).toBeLessThanOrEqual(3);
      // And the slots come back once the handlers are done
      const status = await new Promise<number>(resolve => { http.get({ port, path: '/list' }, res => { res.resume(); resolve(res.statusCode ?? 0); }); });
      expect(status).toBe(200);
    } finally {
      server.close();
    }
  });
});

describe('welcome email greeting', () => {
  it('uses only something that reads as a name', () => {
    expect(firstName('Sam Lee')).toBe('Sam');
    expect(firstName("O'Neil-Smith x")).toBe("O'Neil-Smith");
    expect(firstName('Zoë')).toBe('Zoë');
    expect(firstName('https://evil.example/claim now')).toBe('');
    expect(firstName('evil.example')).toBe('');
    expect(firstName('a@b.co')).toBe('');
  });
});
