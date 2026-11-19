import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyticsDelayMs, queueAnalyticsEvent } from '@/services/analyticsQueue';

describe('analytics queue', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('holds events back between 30 seconds and 10 minutes', () => {
    for (let i = 0; i < 200; i++) {
      const d = analyticsDelayMs();
      expect(d).toBeGreaterThanOrEqual(30_000);
      expect(d).toBeLessThan(600_000);
    }
  });

  it('never sends at the moment it happened, and sends once later', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue({ ok: true });
    queueAnalyticsEvent({ event: 'minor_detected' }, send);
    vi.advanceTimersByTime(29_999);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ event: 'minor_detected' });
  });

  it('swallows a failed send', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    queueAnalyticsEvent({ event: 'crisis_card_shown', rating: 'urgent', kind: null }, send);
    vi.advanceTimersByTime(600_000);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
