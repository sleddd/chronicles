import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { generateMasterKey, encryptBytes as rawEncrypt, decryptBytes as rawDecrypt } from '@shared/crypto/primitives.js';
import { sealSetting } from '@/services/settingCipher';

let key: CryptoKey;
const encryptBytes = (d: ArrayBuffer, aad?: string) => rawEncrypt(key, d, aad);
const decryptBytes = (c: ArrayBuffer, iv: string, aad?: string) => rawDecrypt(key, c, iv, aad);
const getAll = vi.fn();

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({ encryptBytes, decryptBytes, isUnlocked: true }),
}));
vi.mock('@/services/api', () => ({ settings: { getAll: () => getAll(), upsert: vi.fn() } }));

const { useEncryptedSetting } = await import('@/hooks/useEncryptedSetting');

beforeEach(async () => {
  key = await generateMasterKey();
  localStorage.clear();
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
});
