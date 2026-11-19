import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_AUTH } from './testHelper.js';

vi.mock('../../db/analyticsQueries.js', () => ({
  recordCrisisCard: vi.fn().mockResolvedValue(undefined),
  recordMinorDetected: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../db/aiChatQueries.js', () => ({
  getAiChatStatus: vi.fn(),
  saveAiChatConsent: vi.fn().mockResolvedValue(undefined),
  withdrawAiChatConsent: vi.fn().mockResolvedValue(undefined),
}));

import analyticsRouter from '../../routes/analytics.js';
import aiChatRouter from '../../routes/aiChat.js';
import { recordCrisisCard, recordMinorDetected } from '../../db/analyticsQueries.js';
import { getAiChatStatus, saveAiChatConsent, withdrawAiChatConsent } from '../../db/aiChatQueries.js';

const analyticsApp = createTestApp('/api/analytics', analyticsRouter);
const aiChatApp = createTestApp('/api/ai-chat', aiChatRouter);

const open = { consentAt: null, consentVersion: null, blocked: false };

describe('POST /api/analytics/event', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records only the rating and kind — never the account', async () => {
    const res = await request(analyticsApp).post('/api/analytics/event').send({ event: 'crisis_card_shown', rating: 'urgent', kind: 'suicide' });
    expect(res.status).toBe(200);
    expect(recordCrisisCard).toHaveBeenCalledWith('urgent', 'suicide');
    expect((recordCrisisCard as any).mock.calls[0]).toHaveLength(2);
  });

  it('accepts an unknown kind as null', async () => {
    const res = await request(analyticsApp).post('/api/analytics/event').send({ event: 'crisis_card_shown', rating: 'concern', kind: null });
    expect(res.status).toBe(200);
    expect(recordCrisisCard).toHaveBeenCalledWith('concern', null);
  });

  it('records a likely minor with nothing else', async () => {
    const res = await request(analyticsApp).post('/api/analytics/event').send({ event: 'minor_detected' });
    expect(res.status).toBe(200);
    expect(recordMinorDetected).toHaveBeenCalledWith();
  });

  it('rejects unknown events, ratings, kinds and extra fields', async () => {
    for (const body of [
      { event: 'crisis_card_shown', rating: 'none', kind: 'suicide' },
      { event: 'crisis_card_shown', rating: 'urgent', kind: 'other' },
      { event: 'crisis_card_shown', rating: 'concern', kind: 'self_harm', text: 'x' },
      { event: 'minor_detected', text: 'x' },
      { event: 'other' },
      { rating: 'urgent', kind: null },
    ]) {
      const res = await request(analyticsApp).post('/api/analytics/event').send(body);
      expect(res.status).toBe(400);
    }
    expect(recordCrisisCard).not.toHaveBeenCalled();
    expect(recordMinorDetected).not.toHaveBeenCalled();
  });

  it('the old per-event addresses are gone', async () => {
    expect((await request(analyticsApp).post('/api/analytics/crisis-card').send({ rating: 'urgent', kind: null })).status).toBe(410);
    expect((await request(analyticsApp).post('/api/analytics/minor-detected')).status).toBe(410);
    expect(recordCrisisCard).not.toHaveBeenCalled();
    expect(recordMinorDetected).not.toHaveBeenCalled();
  });
});

describe('AI chat consent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the status', async () => {
    (getAiChatStatus as any).mockResolvedValue(open);
    const res = await request(aiChatApp).get('/api/ai-chat');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(open);
  });

  it('saves consent only with the 18+ confirmation', async () => {
    (getAiChatStatus as any).mockResolvedValue(open);
    expect((await request(aiChatApp).post('/api/ai-chat/consent').send({ version: 1 })).status).toBe(400);
    expect((await request(aiChatApp).post('/api/ai-chat/consent').send({ version: 1, ageConfirmed: false })).status).toBe(400);
    const res = await request(aiChatApp).post('/api/ai-chat/consent').send({ version: 1, ageConfirmed: true });
    expect(res.status).toBe(200);
    expect(saveAiChatConsent).toHaveBeenCalledWith(TEST_AUTH.accountId, 1);
  });

  it('refuses consent for a blocked account', async () => {
    (getAiChatStatus as any).mockResolvedValue({ ...open, blocked: true });
    const res = await request(aiChatApp).post('/api/ai-chat/consent').send({ version: 1, ageConfirmed: true });
    expect(res.status).toBe(403);
    expect(saveAiChatConsent).not.toHaveBeenCalled();
  });

  it('withdraws consent', async () => {
    (getAiChatStatus as any).mockResolvedValue(open);
    const res = await request(aiChatApp).delete('/api/ai-chat/consent');
    expect(res.status).toBe(200);
    expect(withdrawAiChatConsent).toHaveBeenCalledWith(TEST_AUTH.accountId);
  });
});
