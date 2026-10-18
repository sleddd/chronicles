import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

// Same body-parser layout as index.ts: entries get a larger limit
function buildApp() {
  const app = express();
  app.use('/api/entries', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.post('/api/entries', (req, res) => { res.json({ size: JSON.stringify(req.body).length }); });
  app.post('/api/settings', (_req, res) => { res.json({ ok: true }); });
  app.get('/boom', () => { throw new Error('secret detail'); });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  const big = (bytes: number) => ({ contentEncrypted: 'x'.repeat(bytes) });

  it('answers a body over the limit with 413, not 500', async () => {
    const res = await request(buildApp()).post('/api/settings').send(big(1_100_000));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Request too large' });
  });

  it('answers malformed JSON with 400', async () => {
    const res = await request(buildApp()).post('/api/settings').set('Content-Type', 'application/json').send('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request' });
  });

  it('lets entries through up to the larger limit', async () => {
    const res = await request(buildApp()).post('/api/entries').send(big(3_000_000));
    expect(res.status).toBe(200);
  });

  it('still caps entries', async () => {
    const res = await request(buildApp()).post('/api/entries').send(big(6_000_000));
    expect(res.status).toBe(413);
  });

  it('hides server errors behind a generic 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(buildApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
