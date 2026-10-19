import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { EncryptionProvider, useEncryption } from '../contexts/EncryptionContext.js';

// ---------------------------------------------------------------------------
// Mock encryption dependencies
// ---------------------------------------------------------------------------

const mockUnwrapMasterKey = vi.fn();
const mockSetupEncryption = vi.fn();
const mockEncryptPost = vi.fn();
const mockDecryptPost = vi.fn();
const mockDecryptPosts = vi.fn();
const mockUnwrapWithRecoveryKey = vi.fn();
const mockRewrapMasterKey = vi.fn();
const mockRewrapFromParams = vi.fn();

vi.mock('@shared/crypto/encryptionService.js', () => ({
  encryptionService: {
    unwrapMasterKey: (...args: unknown[]) => mockUnwrapMasterKey(...args),
    setupEncryption: (...args: unknown[]) => mockSetupEncryption(...args),
    encryptPost: (...args: unknown[]) => mockEncryptPost(...args),
    decryptPost: (...args: unknown[]) => mockDecryptPost(...args),
    decryptPosts: (...args: unknown[]) => mockDecryptPosts(...args),
    unwrapWithRecoveryKey: (...args: unknown[]) => mockUnwrapWithRecoveryKey(...args),
    rewrapMasterKey: (...args: unknown[]) => mockRewrapMasterKey(...args),
    rewrapFromParams: (...args: unknown[]) => mockRewrapFromParams(...args),
  },
}));

vi.mock('@shared/crypto/primitives.js', () => ({
  toNonExtractable: vi.fn().mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } } as unknown as CryptoKey),
}));

vi.mock('@shared/crypto/constants.js', () => ({
  PBKDF2_ITERATIONS: 600000,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeCryptoKey = { type: 'secret', algorithm: { name: 'AES-GCM' } } as unknown as CryptoKey;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(EncryptionProvider, null, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEncryption – outside provider', () => {
  it('throws when used outside EncryptionProvider', () => {
    expect(() => {
      renderHook(() => useEncryption());
    }).toThrow('useEncryption must be used within EncryptionProvider');
  });
});

describe('EncryptionProvider – default state', () => {
  it('starts with isUnlocked false', () => {
    const { result } = renderHook(() => useEncryption(), { wrapper });
    expect(result.current.isUnlocked).toBe(false);
  });
});

describe('EncryptionProvider – unlock', () => {
  it('sets isUnlocked to true after successful unlock', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);

    const { result } = renderHook(() => useEncryption(), { wrapper });

    await act(async () => {
      await result.current.unlock('password', 'salt', 'emk', 'iv', 600000);
    });

    expect(result.current.isUnlocked).toBe(true);
    expect(mockUnwrapMasterKey).toHaveBeenCalledWith('password', 'salt', 'emk', 'iv', 600000);
  });

  it('rejects iterations below PBKDF2_ITERATIONS minimum', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper });

    await expect(
      act(async () => {
        await result.current.unlock('password', 'salt', 'emk', 'iv', 100000);
      })
    ).rejects.toThrow('PBKDF2 iterations 100000 below minimum 600000');

    expect(result.current.isUnlocked).toBe(false);
  });
});

describe('EncryptionProvider – lock', () => {
  it('clears key and sets isUnlocked to false', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);

    const { result } = renderHook(() => useEncryption(), { wrapper });

    await act(async () => {
      await result.current.unlock('password', 'salt', 'emk', 'iv', 600000);
    });
    expect(result.current.isUnlocked).toBe(true);

    act(() => {
      result.current.lock();
    });

    expect(result.current.isUnlocked).toBe(false);
  });
});

describe('EncryptionProvider – setupEncryption', () => {
  it('sets up encryption and unlocks', async () => {
    const setupResult = {
      salt: 's',
      wrappedMK: 'wmk',
      wrapIv: 'wiv',
      recoveryKey: 'rk',
      recoveryWrappedMK: 'rwmk',
      recoveryWrapIv: 'rwiv',
      masterKey: fakeCryptoKey,
    };
    mockSetupEncryption.mockResolvedValue(setupResult);

    const { result } = renderHook(() => useEncryption(), { wrapper });

    let returned: unknown;
    await act(async () => {
      returned = await result.current.setupEncryption('password');
    });

    expect(result.current.isUnlocked).toBe(true);
    expect(returned).toEqual(setupResult);
    expect(mockSetupEncryption).toHaveBeenCalledWith('password');
  });
});

describe('EncryptionProvider – encryptPost', () => {
  it('delegates to encryptionService', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const encResult = { contentEncrypted: 'ce', contentIv: 'ci', metadataEncrypted: 'me', metadataIv: 'mi' };
    mockEncryptPost.mockResolvedValue(encResult);

    const { result } = renderHook(() => useEncryption(), { wrapper });

    await act(async () => {
      await result.current.unlock('pw', 's', 'e', 'i', 600000);
    });

    let encrypted: unknown;
    await act(async () => {
      encrypted = await result.current.encryptPost('content', { topic: 'Journal' });
    });

    expect(encrypted).toEqual(encResult);
    expect(mockEncryptPost).toHaveBeenCalled();
  });

  it('throws when not unlocked', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper });

    await expect(
      act(async () => {
        await result.current.encryptPost('content', {});
      })
    ).rejects.toThrow('Encryption not unlocked');
  });
});

describe('EncryptionProvider – decryptPost / decryptPosts', () => {
  it('decryptPost delegates to encryptionService', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const decrypted = { id: 1, content: 'hello', metadata: {}, isEncrypted: true, createdAt: new Date(), updatedAt: new Date() };
    mockDecryptPost.mockResolvedValue(decrypted);

    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => {
      await result.current.unlock('pw', 's', 'e', 'i', 600000);
    });

    const post = {
      id: 1,
      contentEncrypted: 'ce',
      contentIv: 'ci',
      metadataEncrypted: 'me',
      metadataIv: 'mi',
      isEncrypted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let dec: unknown;
    await act(async () => {
      dec = await result.current.decryptPost(post);
    });

    expect(dec).toEqual(decrypted);
  });

  it('decryptPosts delegates to encryptionService', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    mockDecryptPosts.mockResolvedValue([]);

    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => {
      await result.current.unlock('pw', 's', 'e', 'i', 600000);
    });

    let dec: unknown;
    await act(async () => {
      dec = await result.current.decryptPosts([]);
    });

    expect(dec).toEqual([]);
  });
});

describe('EncryptionProvider – unlockWithRecoveryKey', () => {
  it('unlocks using recovery key', async () => {
    mockUnwrapWithRecoveryKey.mockResolvedValue(fakeCryptoKey);

    const { result } = renderHook(() => useEncryption(), { wrapper });

    await act(async () => {
      await result.current.unlockWithRecoveryKey('recoveryKey', 'rwmk', 'rwiv');
    });

    expect(result.current.isUnlocked).toBe(true);
    expect(mockUnwrapWithRecoveryKey).toHaveBeenCalledWith('recoveryKey', 'rwmk', 'rwiv');
  });
});

describe('EncryptionProvider – rewrapMasterKey', () => {
  it('rewraps using extractable key from recovery flow', async () => {
    mockUnwrapWithRecoveryKey.mockResolvedValue(fakeCryptoKey);
    mockRewrapMasterKey.mockResolvedValue({ salt: 'ns', wrappedMK: 'nwmk', wrapIv: 'nwiv' });

    const { result } = renderHook(() => useEncryption(), { wrapper });

    await act(async () => {
      await result.current.unlockWithRecoveryKey('rk', 'rwmk', 'rwiv');
    });

    let rewrapResult: unknown;
    await act(async () => {
      rewrapResult = await result.current.rewrapMasterKey('newPassword');
    });

    expect(rewrapResult).toEqual({ salt: 'ns', wrappedMK: 'nwmk', wrapIv: 'nwiv' });
  });

  it('rewraps using current password in change-password flow', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    mockRewrapFromParams.mockResolvedValue({ salt: 'ns', wrappedMK: 'nwmk', wrapIv: 'nwiv' });

    const { result } = renderHook(() => useEncryption(), { wrapper });

    // Unlock normally (stores encryption params)
    await act(async () => {
      await result.current.unlock('currentPw', 'salt', 'emk', 'iv', 600000);
    });

    let rewrapResult: unknown;
    await act(async () => {
      rewrapResult = await result.current.rewrapMasterKey('newPw', 'currentPw');
    });

    expect(rewrapResult).toEqual({ salt: 'ns', wrappedMK: 'nwmk', wrapIv: 'nwiv' });
    expect(mockRewrapFromParams).toHaveBeenCalledWith('currentPw', 'salt', 'emk', 'iv', 600000, 'newPw');
  });

  it('throws when no extractable key available for recovery rewrap', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper });

    await expect(
      act(async () => {
        await result.current.rewrapMasterKey('newPassword');
      })
    ).rejects.toThrow('No extractable key available for rewrap');
  });
});

describe('EncryptionProvider – lock clears extractable key', () => {
  it('clears extractable key so rewrap fails after lock', async () => {
    mockUnwrapWithRecoveryKey.mockResolvedValue(fakeCryptoKey);

    const { result } = renderHook(() => useEncryption(), { wrapper });

    // Unlock via recovery (sets extractableKeyRef)
    await act(async () => {
      await result.current.unlockWithRecoveryKey('rk', 'rwmk', 'rwiv');
    });
    expect(result.current.isUnlocked).toBe(true);

    // Lock (should clear extractableKeyRef)
    act(() => {
      result.current.lock();
    });
    expect(result.current.isUnlocked).toBe(false);

    // Rewrap should fail because extractable key was cleared
    await expect(
      act(async () => {
        await result.current.rewrapMasterKey('newPw');
      })
    ).rejects.toThrow('No extractable key available for rewrap');
  });
});
