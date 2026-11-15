import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testHelper.js';

// The 5-an-hour cap is the limiter's own job; these tests send more than that
vi.mock('../../middleware/rateLimiter.js', () => ({ bugReportLimiter: (_req: unknown, _res: unknown, next: () => void) => next() }));

import bugReportRouter from '../../routes/bugReport.js';

const app = createTestApp('/api/bug-report', bugReportRouter, { skipAuth: true });
const xhr = { 'X-Requested-With': 'XMLHttpRequest' };
const report = {
  area: 'Planning', happened: 'Dragging a card back a week did nothing', steps: 'Held it at the left edge',
  device: 'Safari on iPad', replyTo: ' Sam@Example.com ',
};

describe('bug report route', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.BUG_REPORT_TO;
    delete process.env.BUG_REPORT_FROM;
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; });

  it('emails the report to support through Resend, replying to the reporter', async () => {
    const res = await request(app).post('/api/bug-report').set(xhr).send(report);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(['support@mydailychronicles.com']);
    expect(body.subject).toBe('Bug report: Planning');
    expect(body.reply_to).toBe('sam@example.com');
    expect(body.text).toContain('Dragging a card back a week did nothing');
    expect(body.text).toContain('Device and browser: Safari on iPad');
    expect(body.html).toBeUndefined();
  });

  it('marks feedback as feedback in the subject', async () => {
    await request(app).post('/api/bug-report').set(xhr).send({ ...report, kind: 'feedback', happened: 'A dark calendar would be lovely' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('Feedback: Planning');
    expect(body.text).toContain('Feedback:\nA dark calendar would be lovely');
    expect((await request(app).post('/api/bug-report').set(xhr).send({ ...report, kind: 'other' })).status).toBe(400);
  });

  it('needs the XHR header', async () => {
    const res = await request(app).post('/api/bug-report').send(report);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('needs what happened, and refuses unknown fields and line breaks in the subject', async () => {
    expect((await request(app).post('/api/bug-report').set(xhr).send({ ...report, happened: '  ' })).status).toBe(400);
    expect((await request(app).post('/api/bug-report').set(xhr).send({ ...report, cc: 'x@y.z' })).status).toBe(400);
    expect((await request(app).post('/api/bug-report').set(xhr).send({ ...report, area: 'Planning\r\nBcc: x@y.z' })).status).toBe(400);
    expect((await request(app).post('/api/bug-report').set(xhr).send({ ...report, replyTo: 'not an email' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot normally and sends nothing', async () => {
    const res = await request(app).post('/api/bug-report').set(xhr).send({ ...report, website: 'http://spam' });
    expect(res.body).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when sending isn’t set up, or Resend refuses', async () => {
    delete process.env.RESEND_API_KEY;
    expect((await request(app).post('/api/bug-report').set(xhr).send(report)).status).toBe(503);
    process.env.RESEND_API_KEY = 're_test';
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 422 }));
    expect((await request(app).post('/api/bug-report').set(xhr).send(report)).status).toBe(502);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect((await request(app).post('/api/bug-report').set(xhr).send(report)).status).toBe(502);
  });
});
