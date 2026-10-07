import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, retryDelayMs, settings } from '../services/api.js';

afterEach(() => vi.restoreAllMocks());

describe('retryDelayMs', () => {
  it('honors Retry-After on 429, within 5s..15min', () => {
    expect(retryDelayMs(new ApiError(429, 'x', 120), 0)).toBe(120_000);
    expect(retryDelayMs(new ApiError(429, 'x', 1), 0)).toBe(5_000);
    expect(retryDelayMs(new ApiError(429, 'x', 99_999), 0)).toBe(15 * 60_000);
    expect(retryDelayMs(new ApiError(429, 'x'), 0)).toBe(60_000);
  });
  it('backs off exponentially for other failures, capped at a minute', () => {
    expect(retryDelayMs(new Error('net'), 0)).toBe(10_000);
    expect(retryDelayMs(new Error('net'), 1)).toBe(20_000);
    expect(retryDelayMs(new Error('net'), 5)).toBe(60_000);
  });
});

describe('request', () => {
  it('shares one fetch between identical in-flight GETs, with separate copies', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify([{ key: 'a', value: 1 }]), { status: 200, headers: { 'content-type': 'application/json' } }));
    const [a, b] = await Promise.all([settings.getAll(), settings.getAll()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    await settings.getAll();
    expect(fetchMock).toHaveBeenCalledTimes(2); // finished requests aren't cached
  });

  it('carries Retry-After on a 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '42' } }));
    await expect(settings.getAll()).rejects.toMatchObject({ status: 429, retryAfterSec: 42 });
  });
});
