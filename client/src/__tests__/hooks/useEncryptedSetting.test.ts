import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { generateMasterKey, encryptBytes as rawEncrypt, decryptBytes as rawDecrypt } from '@shared/crypto/primitives.js';
import { sealSetting } from '@/services/settingCipher';

let key: CryptoKey;
const encryptBytes = (d: ArrayBuffer, aad?: string) => rawEncrypt(key, d, aad);
const decryptBytes = (c: ArrayBuffer, iv: string, aad?: string) => rawDecrypt(key, c, iv, aad);
const getAll = vi.fn();

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({ encryptBytes, decryptBytes, isUnlocked: true }),
}));
const upsert = vi.fn();
vi.mock('@/services/api', () => ({ settings: { getAll: () => getAll(), upsert: (...a: unknown[]) => upsert(...a) } }));

const { useEncryptedSetting, clearEncryptedSettings } = await import('@/hooks/useEncryptedSetting');

beforeEach(async () => {
  key = await generateMasterKey();
  localStorage.clear();
  clearEncryptedSettings();
  upsert.mockReset();
  upsert.mockResolvedValue({});
});

describe('useEncryptedSetting', () => {
  it('opens the value sealed for its key', async () => {
    getAll.mockResolvedValue([{ key: 'symptomChips', value: await sealSetting('symptomChips', { added: ['Rash'] }, encryptBytes) }]);
    const { result } = renderHook(() => useEncryptedSetting('symptomChips', { added: [] as string[] }));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({ added: ['Rash'] });
  });

  it('never takes a plaintext value from the server (e.g. a planted "confirmed" trigger)', async () => {
    getAll.mockResolvedValue([{ key: 'symptomTriggerReviews', value: { 'food|Pizza|Bloating': { verdict: 'confirmed' } } }]);
    const { result } = renderHook(() => useEncryptedSetting('symptomTriggerReviews', {}));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({});
  });

  it('a failed read is not a load: save is refused, and it asks again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      upsert.mockClear();
      getAll.mockReset();
      getAll.mockRejectedValueOnce(new Error('offline'));
      getAll.mockResolvedValue([{ key: 'habitLog', value: await sealSetting('habitLog', { h1: { '2026-11': '1' } }, encryptBytes) }]);
      const { result } = renderHook(() => useEncryptedSetting('habitLog', {} as Record<string, unknown>));
      await vi.waitFor(() => expect(getAll).toHaveBeenCalledTimes(1));
      // Not loaded, and nothing can be written over the value that wasn't read
      expect(result.current[2]).toBe(false);
      await expect(result.current[1]({})).rejects.toThrow(/isn't loaded/);
      expect(upsert).not.toHaveBeenCalled();
      // The retry reads the real value
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.waitFor(() => expect(result.current[2]).toBe(true));
      expect(result.current[0]).toEqual({ h1: { '2026-11': '1' } });
    } finally { vi.useRealTimers(); }
  });

  it('two uses of one setting share a copy: neither saves over the other from a stale one', async () => {
    getAll.mockReset();
    getAll.mockResolvedValue([{ key: 'symptomChips', value: await sealSetting('symptomChips', { added: ['Rash'] }, encryptBytes) }]);
    const a = renderHook(() => useEncryptedSetting('symptomChips', { added: [] as string[] }));
    const b = renderHook(() => useEncryptedSetting('symptomChips', { added: [] as string[] }));
    await waitFor(() => expect(a.result.current[2] && b.result.current[2]).toBe(true));

    // One form adds a chip: the other shows it at once…
    await act(() => a.result.current[1]({ added: [...a.result.current[0].added, 'Hives'] }));
    expect(b.result.current[0]).toEqual({ added: ['Rash', 'Hives'] });
    // …so what it then saves builds on it, instead of dropping it
    await act(() => b.result.current[1]({ added: [...b.result.current[0].added, 'Itch'] }));
    expect(a.result.current[0]).toEqual({ added: ['Rash', 'Hives', 'Itch'] });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('drops every copy on lock', async () => {
    getAll.mockReset();
    getAll.mockResolvedValue([{ key: 'taskTypes', value: await sealSetting('taskTypes', ['Errand'], encryptBytes) }]);
    const { result } = renderHook(() => useEncryptedSetting('taskTypes', [] as string[]));
    await waitFor(() => expect(result.current[0]).toEqual(['Errand']));
    act(() => clearEncryptedSettings());
    expect(result.current[0]).toEqual([]);
    expect(result.current[2]).toBe(false);
    await expect(result.current[1](['x'])).rejects.toThrow(/isn't loaded/);
  });
});
