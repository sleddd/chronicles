import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { LEGAL_VERSIONS } from '@chronicles/shared';
import { createTestApp, TEST_AUTH } from './testHelper.js';

vi.mock('../../db/consentQueries.js', () => ({
  getConsent: vi.fn().mockResolvedValue(null),
  saveConsent: vi.fn().mockResolvedValue(undefined),
  saveBreachNotice: vi.fn().mockResolvedValue(1),
}));
vi.mock('../../db/appNoticeQueries.js', () => ({ getActiveNotice: vi.fn().mockResolvedValue({ message: 'Hi', linkUrl: null, updatedAt: 'x' }) }));
vi.mock('../../db/tenantQueries.js', () => ({
  ensureDoseLogsTable: vi.fn(), getAllDoseLogs: vi.fn().mockResolvedValue([{ id: 1 }]),
  getDoseLogsByDate: vi.fn(), upsertDoseLog: vi.fn(), getPost: vi.fn(),
}));

import consentRouter from '../../routes/consent.js';
import noticeRouter from '../../routes/notice.js';
import dosesRouter from '../../routes/doses.js';
import { saveConsent, saveBreachNotice } from '../../db/consentQueries.js';
import { getAllDoseLogs } from '../../db/tenantQueries.js';

const app = createTestApp('/api/consent', consentRouter);
const full = {
  ageConfirmed: true, termsAccepted: true, healthConsent: true,
  termsVersion: LEGAL_VERSIONS.terms, healthVersion: LEGAL_VERSIONS.health, breachNotice: 'email',
};

describe('consent routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the record and the current versions', async () => {
    const res = await request(app).get('/api/consent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ consent: null, current: LEGAL_VERSIONS });
  });

  it('saves consent only when every box is affirmatively true', async () => {
    for (const k of ['ageConfirmed', 'termsAccepted', 'healthConsent'] as const) {
      const res = await request(app).post('/api/consent').send({ ...full, [k]: false });
      expect(res.status).toBe(400);
    }
    const ok = await request(app).post('/api/consent').send(full);
    expect(ok.status).toBe(200);
    expect(saveConsent).toHaveBeenCalledWith(TEST_AUTH.accountId, {
      termsVersion: LEGAL_VERSIONS.terms, healthVersion: LEGAL_VERSIONS.health, breachNotice: 'email', postalAddress: null,
    });
  });

  it('refuses consent to versions the person was not shown', async () => {
    const res = await request(app).post('/api/consent').send({ ...full, termsVersion: '1999-01-01' });
    expect(res.status).toBe(409);
    expect(saveConsent).not.toHaveBeenCalled();
  });

  it('needs a postal address for mailed notices, and keeps it only then', async () => {
    expect((await request(app).post('/api/consent').send({ ...full, breachNotice: 'mail' })).status).toBe(400);
    await request(app).post('/api/consent').send({ ...full, breachNotice: 'mail', postalAddress: '12 Main St, Portland OR' });
    expect((saveConsent as any).mock.calls[0][1].postalAddress).toBe('12 Main St, Portland OR');
    await request(app).put('/api/consent/breach-notice').send({ breachNotice: 'email', postalAddress: 'ignored address 123' });
    expect(saveBreachNotice).toHaveBeenCalledWith(TEST_AUTH.accountId, 'email', null);
  });
});

describe('notice and dose export routes', () => {
  it('returns the active notice', async () => {
    const res = await request(createTestApp('/api/notice', noticeRouter)).get('/api/notice');
    expect(res.body.notice.message).toBe('Hi');
  });
  it('lists every dose log for the export', async () => {
    const res = await request(createTestApp('/api/doses', dosesRouter)).get('/api/doses/all');
    expect(res.status).toBe(200);
    expect(res.body.logs).toEqual([{ id: 1 }]);
    expect(getAllDoseLogs).toHaveBeenCalledWith(TEST_AUTH.tenantSchemaName);
  });
});
