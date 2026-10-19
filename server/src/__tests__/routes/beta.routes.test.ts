import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testHelper.js';

vi.mock('../../db/betaQueries.js', () => ({
  applyForBeta: vi.fn().mockResolvedValue('seat'),
}));

import betaRouter from '../../routes/beta.js';
import { applyForBeta } from '../../db/betaQueries.js';

const app = createTestApp('/api/beta', betaRouter, { skipAuth: true });
const xhr = { 'X-Requested-With': 'XMLHttpRequest' };
const application = {
  name: 'Sam', email: ' Sam@Example.com ', trackFirst: 'journal', device: 'ios',
  ageConfirmed: true, riskAccepted: true,
};

describe('beta routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never publishes how many seats are left', async () => {
    expect((await request(app).get('/api/beta')).status).toBe(404);
    const res = await request(app).post('/api/beta/apply').set(xhr).send(application);
    expect(res.body).toEqual({ status: 'seat' });
  });

  it('saves an application with a normalised email', async () => {
    const res = await request(app).post('/api/beta/apply').set(xhr).send(application);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('seat');
    expect(applyForBeta).toHaveBeenCalledWith({ email: 'sam@example.com', name: 'Sam', trackFirst: 'journal', device: 'ios' });
  });

  it('needs both boxes ticked', async () => {
    for (const k of ['ageConfirmed', 'riskAccepted'] as const) {
      const res = await request(app).post('/api/beta/apply').set(xhr).send({ ...application, [k]: false });
      expect(res.status).toBe(400);
    }
    expect(applyForBeta).not.toHaveBeenCalled();
  });

  it('refuses posts without the XHR header (cross-site forms)', async () => {
    expect((await request(app).post('/api/beta/apply').send(application)).status).toBe(403);
  });

  it('answers a filled honeypot normally but saves nothing', async () => {
    const res = await request(app).post('/api/beta/apply').set(xhr).send({ ...application, website: 'spam.example' });
    expect(res.status).toBe(200);
    expect(applyForBeta).not.toHaveBeenCalled();
  });

  it('has no separate waitlist sign-up', async () => {
    expect((await request(app).post('/api/beta/waitlist').set(xhr).send({ email: 'a@b.co' })).status).toBe(404);
  });
});
