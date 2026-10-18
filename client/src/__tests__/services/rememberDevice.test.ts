import { describe, it, expect, vi, beforeEach } from 'vitest';

// This project's jsdom setup doesn't provide localStorage — polyfill it
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, String(v)); },
    removeItem: (k: string) => { storage.delete(k); },
    clear: () => { storage.clear(); },
  },
});

vi.mock('../../services/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api.js')>();
  return {
    ...actual,
    auth: {
      rememberStart: vi.fn(),
      rememberKey: vi.fn(),
      rememberForget: vi.fn(),
    },
  };
});

import { auth, ApiError } from '../../services/api.js';
import {
  REMEMBER_STORE_KEY,
  ACTIVITY_STORE_KEY,
  REMEMBER_IDLE_MS,
  hasRememberedUnlock,
  storeRemembered,
  fetchRemembered,
  forgetRemembered,
  startRemembering,
  markActivity,
  lastActivity,
} from '../../services/rememberDevice.js';

const SECRET_B64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const NOW = Date.parse('2026-10-17T12:00:00Z');
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const stored = () => localStorage.getItem(REMEMBER_STORE_KEY);

describe('rememberDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    (auth.rememberForget as any).mockResolvedValue({ success: true });
  });

  describe('what the browser keeps', () => {
    it('stores only the wrapped key, its IV and the expiry — never the secret', () => {
      storeRemembered('wrapped-ciphertext', 'iv-b64', inHours(12));
      const blob = JSON.parse(stored()!);
      expect(blob).toEqual({ v: 1, wrapped: 'wrapped-ciphertext', iv: 'iv-b64', expiresAt: inHours(12) });
      expect(stored()).not.toContain(SECRET_B64);
    });

    it('marks activity when storing, so the idle clock starts fresh', () => {
      storeRemembered('w', 'i', inHours(12));
      expect(lastActivity()).toBeGreaterThan(0);
    });

    it('returns the device secret from the server as bytes', async () => {
      (auth.rememberStart as any).mockResolvedValue({ secret: SECRET_B64, expiresAt: inHours(12) });
      const { secret, expiresAt } = await startRemembering();
      expect(secret).toEqual(new Uint8Array(32).fill(7));
      expect(expiresAt).toBe(inHours(12));
    });
  });

  describe('hasRememberedUnlock', () => {
    it('is false with nothing stored', () => {
      expect(hasRememberedUnlock(NOW)).toBe(false);
    });

    it('is true for a live blob used within the idle window', () => {
      localStorage.setItem(REMEMBER_STORE_KEY, JSON.stringify({ v: 1, wrapped: 'w', iv: 'i', expiresAt: inHours(1) }));
      markActivity(NOW - 5 * 60_000);
      expect(hasRememberedUnlock(NOW)).toBe(true);
    });

    it('forgets a blob past its lifetime', () => {
      localStorage.setItem(REMEMBER_STORE_KEY, JSON.stringify({ v: 1, wrapped: 'w', iv: 'i', expiresAt: inHours(-1) }));
      markActivity(NOW);
      expect(hasRememberedUnlock(NOW)).toBe(false);
      expect(stored()).toBeNull();
    });

    it('forgets a blob after an hour with no activity in any tab', () => {
      localStorage.setItem(REMEMBER_STORE_KEY, JSON.stringify({ v: 1, wrapped: 'w', iv: 'i', expiresAt: inHours(6) }));
      markActivity(NOW - REMEMBER_IDLE_MS - 1);
      expect(hasRememberedUnlock(NOW)).toBe(false);
      expect(stored()).toBeNull();
    });

    it('treats missing activity as idle', () => {
      localStorage.setItem(REMEMBER_STORE_KEY, JSON.stringify({ v: 1, wrapped: 'w', iv: 'i', expiresAt: inHours(6) }));
      localStorage.removeItem(ACTIVITY_STORE_KEY);
      expect(hasRememberedUnlock(NOW)).toBe(false);
    });

    it.each([
      ['garbage', 'not json {'],
      ['wrong version', JSON.stringify({ v: 2, wrapped: 'w', iv: 'i', expiresAt: inHours(1) })],
      ['missing fields', JSON.stringify({ v: 1, expiresAt: inHours(1) })],
    ])('ignores a malformed blob (%s)', (_label, raw) => {
      localStorage.setItem(REMEMBER_STORE_KEY, raw);
      markActivity(NOW);
      expect(hasRememberedUnlock(NOW)).toBe(false);
    });
  });

  describe('fetchRemembered', () => {
    const storeLive = () => storeRemembered('w', 'i', new Date(Date.now() + 3600_000).toISOString());

    it("is 'forget' without asking the server when nothing usable is stored", async () => {
      expect(await fetchRemembered()).toBe('forget');
      expect(auth.rememberKey).not.toHaveBeenCalled();
    });

    it('returns the blob and the secret while the grant lives', async () => {
      storeLive();
      (auth.rememberKey as any).mockResolvedValue({ secret: SECRET_B64, expiresAt: inHours(12) });
      const result = await fetchRemembered();
      expect(result).toEqual({ blob: expect.objectContaining({ wrapped: 'w', iv: 'i' }), secret: new Uint8Array(32).fill(7) });
    });

    it.each([401, 403, 404])("drops the blob when the server says the grant is gone (%i)", async (status) => {
      storeLive();
      (auth.rememberKey as any).mockRejectedValue(new ApiError(status, 'gone'));
      expect(await fetchRemembered()).toBe('forget');
      expect(stored()).toBeNull();
    });

    it("keeps the blob on a transient failure ('retry')", async () => {
      storeLive();
      (auth.rememberKey as any).mockRejectedValue(new TypeError('Failed to fetch'));
      expect(await fetchRemembered()).toBe('retry');
      expect(stored()).not.toBeNull();
    });

    it("keeps the blob when the server is struggling (500, 429)", async () => {
      storeLive();
      (auth.rememberKey as any).mockRejectedValueOnce(new ApiError(500, 'oops'));
      expect(await fetchRemembered()).toBe('retry');
      (auth.rememberKey as any).mockRejectedValueOnce(new ApiError(429, 'slow down', 30));
      expect(await fetchRemembered()).toBe('retry');
      expect(stored()).not.toBeNull();
    });
  });

  describe('forgetRemembered', () => {
    it('removes the blob and the server grant', () => {
      storeRemembered('w', 'i', inHours(1));
      forgetRemembered();
      expect(stored()).toBeNull();
      expect(auth.rememberForget).toHaveBeenCalledTimes(1);
    });

    it('does not call the server when nothing was remembered', () => {
      forgetRemembered();
      expect(auth.rememberForget).not.toHaveBeenCalled();
    });

    it('still forgets locally when the server call fails', async () => {
      storeRemembered('w', 'i', inHours(1));
      (auth.rememberForget as any).mockRejectedValue(new ApiError(401, 'signed out'));
      expect(() => forgetRemembered()).not.toThrow();
      await Promise.resolve();
      expect(stored()).toBeNull();
    });
  });
});
