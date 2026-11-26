import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
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
const mockExtractableFromPassword = vi.fn();
const mockExtractableFromPasskey = vi.fn();
const mockUnwrapWithPasskey = vi.fn();
const mockWrapForPasskey = vi.fn();
const mockNewRecoveryWrapping = vi.fn();
const mockPasswordWrap = vi.fn();
const mockClaimBrowserFor = vi.fn();
const mockRekeyStatus = vi.fn(async () => ({ pending: false }) as Record<string, unknown>);
const mockRunRekey = vi.fn();
const mockResealLocalDrafts = vi.fn(async (..._a: unknown[]) => {});
const mockOpenOldKey = vi.fn();
const mockOwnedByAnotherKey = vi.fn((_mark: string) => false);

vi.mock('@shared/crypto/encryptionService.js', () => ({
  encryptionService: {
    unwrapMasterKey: (...args: unknown[]) => mockUnwrapMasterKey(...args),
    setupEncryption: (...args: unknown[]) => mockSetupEncryption(...args),
    encryptPost: (...args: unknown[]) => mockEncryptPost(...args),
    decryptPost: (...args: unknown[]) => mockDecryptPost(...args),
    decryptPosts: (...args: unknown[]) => mockDecryptPosts(...args),
    accountTag: async () => 'test-account-tag',
    openOldKey: (...args: unknown[]) => mockOpenOldKey(...args),
    unwrapWithRecoveryKey: (...args: unknown[]) => mockUnwrapWithRecoveryKey(...args),
    rewrapMasterKey: (...args: unknown[]) => mockRewrapMasterKey(...args),
    extractableFromPassword: (...args: unknown[]) => mockExtractableFromPassword(...args),
    extractableFromPasskey: (...args: unknown[]) => mockExtractableFromPasskey(...args),
    unwrapWithPasskey: (...args: unknown[]) => mockUnwrapWithPasskey(...args),
    wrapForPasskey: (...args: unknown[]) => mockWrapForPasskey(...args),
    generateNewRecoveryWrapping: (...args: unknown[]) => mockNewRecoveryWrapping(...args),
  },
}));

// What the browser stores is kept for the same person and wiped for anyone else (services/browserData)
// Telling the server which entries are hidden from AI has its own tests (services/aiPrivacy.test.ts)
vi.mock('../services/aiPrivacy.js', () => ({
  clearAiPrivacy: vi.fn(), markHiddenBeforeCreate: vi.fn().mockResolvedValue(undefined), markHiddenOnSave: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/rekey.js', () => ({
  runRekey: (...args: unknown[]) => mockRunRekey(...args),
  resealLocalDrafts: (...args: unknown[]) => mockResealLocalDrafts(...args),
  RekeyError: class RekeyError extends Error {},
}));
vi.mock('../services/browserData.js', () => ({
  claimBrowserFor: (...args: unknown[]) => mockClaimBrowserFor(...args),
  rekeyFinishedHere: () => false,
  markRekeyFinished: () => {},
  ownerMark: async (tag: string) => `mark:${tag}`,
  ownedByAnotherKey: (mark: string) => mockOwnedByAnotherKey(mark),
  retagBrowser: async () => {},
  noteRetagPending: () => {},
  clearRetagPending: () => {},
}));

vi.mock('../services/api.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/api.js')>()),
  auth: { passwordWrap: (...args: unknown[]) => mockPasswordWrap(...args), rekeyStatus: () => mockRekeyStatus(), rekeyClaim: async () => ({ pending: true, claimed: true }) },
}));

vi.mock('@shared/crypto/primitives.js', () => ({
  toNonExtractable: vi.fn().mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } } as unknown as CryptoKey),
}));

// The derived sign-in secret (a real one costs 600k PBKDF2 rounds)
vi.mock('@shared/crypto/authSecret.js', () => ({ deriveAuthSecret: async () => 'a'.repeat(64), legacyPasswordForm: () => null }));

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
  mockClaimBrowserFor.mockResolvedValue(false);
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

  it('keeps the journal shut while a re-encryption is under way, and opens it once that is done', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const oldKey = { type: 'secret' } as CryptoKey;
    mockOpenOldKey.mockResolvedValue(oldKey);
    let finish!: () => void;
    mockRunRekey.mockImplementation(() => new Promise<void>(r => { finish = r; }));
    mockRekeyStatus.mockResolvedValue({ pending: true, rekeyId: 'f'.repeat(32), oldKey: 'OLD', oldKeyIv: 'IV' });

    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('password', 'salt', 'emk', 'iv', 600000); });
    await waitFor(() => expect(mockRunRekey).toHaveBeenCalled());
    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isRestoring).toBe(true);
    expect(mockOpenOldKey).toHaveBeenCalledWith(fakeCryptoKey, 'OLD', 'IV', 'f'.repeat(32));
    expect(mockRunRekey.mock.calls[0][0]).toMatchObject({ newKey: fakeCryptoKey, oldKey, rekeyId: 'f'.repeat(32) });

    await act(async () => { finish(); });
    await waitFor(() => expect(result.current.isUnlocked).toBe(true));
    expect(result.current.isRestoring).toBe(false);
    mockRekeyStatus.mockResolvedValue({ pending: false });
  });

  it('opens the journal when the server has no re-encryption route at all (an older server)', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    mockRekeyStatus.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('password', 'salt', 'emk', 'iv', 600000); });
    expect(result.current.isUnlocked).toBe(true);
  });

  it('drops its key rather than seal anything once the journal has moved to another key in this browser', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('password', 'salt', 'emk', 'iv', 600000); });
    expect(result.current.isUnlocked).toBe(true);
    // Another tab re-encrypted the journal, and this one never heard
    mockOwnedByAnotherKey.mockReturnValue(true);
    await act(async () => {
      await expect(result.current.encryptBytes(new ArrayBuffer(4))).rejects.toThrow('Encryption not unlocked');
    });
    expect(mockOwnedByAnotherKey).toHaveBeenCalledWith('mark:test-account-tag');
    expect(result.current.isUnlocked).toBe(false);
    mockOwnedByAnotherKey.mockReturnValue(false);
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

describe('EncryptionProvider – clearKey (the session ending)', () => {
  it('clears key and sets isUnlocked to false', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);

    const { result } = renderHook(() => useEncryption(), { wrapper });

    await act(async () => {
      await result.current.unlock('password', 'salt', 'emk', 'iv', 600000);
    });
    expect(result.current.isUnlocked).toBe(true);

    act(() => {
      result.current.clearKey();
    });

    expect(result.current.isUnlocked).toBe(false);
  });

  it('drops decrypted entries, topics and private settings from the stores', async () => {
    const { useEntriesStore } = await import('../stores/entriesStore.js');
    const { useUIStore } = await import('../stores/uiStore.js');
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('password', 'salt', 'emk', 'iv', 600000); });
    useEntriesStore.setState({ decryptedEntries: [{ id: 1, content: 'secret' }] as never, isInitialized: true });
    useUIStore.setState({ displayName: 'Alex', topicCustomFields: { 1: [] } });

    act(() => { result.current.clearKey(); });

    expect(useEntriesStore.getState().decryptedEntries).toEqual([]);
    expect(useEntriesStore.getState().isInitialized).toBe(false);
    expect(useUIStore.getState().displayName).toBe('');
    expect(useUIStore.getState().topicCustomFields).toEqual({});
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
    // No cipher left over from an earlier test
    (await import('../services/recordCipher.js')).clearRecordCipher();

    const { result } = renderHook(() => useEncryption(), { wrapper });

    let returned: unknown;
    await act(async () => {
      returned = await result.current.setupEncryption('password');
    });

    expect(result.current.isUnlocked).toBe(true);
    expect(returned).toEqual(setupResult);
    expect(mockSetupEncryption).toHaveBeenCalledWith('password');
    // The record cipher is installed too, so a new account can seal its topics right away
    const { recordCipher } = await import('../services/recordCipher.js');
    expect(() => recordCipher()).not.toThrow();
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
      encrypted = await result.current.encryptPost(7, 'content', { topic: 'Journal' });
    });

    expect(encrypted).toEqual(encResult);
    expect(mockEncryptPost).toHaveBeenCalledWith(expect.anything(), 7, 'content', { topic: 'Journal' });
  });

  it('throws when not unlocked', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper });

    await expect(
      act(async () => {
        await result.current.encryptPost(1, 'content', {});
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

describe('EncryptionProvider – no lock screen', () => {
  it('keeps the key when the tab is hidden: switching tabs ends nothing', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('password', 'salt', 'emk', 'iv', 600000); });

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });

    expect(result.current.isUnlocked).toBe(true);
  });

  it('has no lock, remember or forget in what it offers', () => {
    const { result } = renderHook(() => useEncryption(), { wrapper });
    const api = result.current as unknown as Record<string, unknown>;
    expect(api.lock).toBeUndefined();
    expect(api.isRemembered).toBeUndefined();
    expect(api.forgetBrowser).toBeUndefined();
  });

  it('stores nothing that opens the journal: unlocking writes no key material to the browser', async () => {
    localStorage.clear();
    sessionStorage.clear();
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('password', 'salt', 'emk', 'iv', 600000); });
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toMatch(/emk|chronicles\.remember|wrapped/i);
  });

  it('asks whose browser this is before anything loads, and tells other tabs when it was wiped', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('password', 'salt', 'emk', 'iv', 600000); });
    expect(mockClaimBrowserFor).toHaveBeenCalledWith('test-account-tag', true);
  });
});

describe('EncryptionProvider – passkey', () => {
  const wrap = { credentialId: 'cred', wrappedMK: 'w', wrapIv: 'iv' };

  it('opens the key from a passkey’s secret and its wrap', async () => {
    mockUnwrapWithPasskey.mockResolvedValue(fakeCryptoKey);
    const prf = new Uint8Array(32).fill(7);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlockWithPasskey(prf, wrap); });
    expect(result.current.isUnlocked).toBe(true);
    expect(mockUnwrapWithPasskey).toHaveBeenCalledWith(prf, 'w', 'iv', 'cred');
  });

  it('stays closed when the wrap doesn’t open', async () => {
    mockUnwrapWithPasskey.mockRejectedValue(new Error('OperationError'));
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await expect(act(async () => { await result.current.unlockWithPasskey(new Uint8Array(32), wrap); })).rejects.toThrow();
    expect(result.current.isUnlocked).toBe(false);
  });

  it('wraps the key for a new passkey from either source', async () => {
    const extractable = { extractable: true } as unknown as CryptoKey;
    mockExtractableFromPasskey.mockResolvedValue(extractable);
    mockWrapForPasskey.mockResolvedValue({ wrappedMK: 'nw', wrapIv: 'niv' });
    const { result } = renderHook(() => useEncryption(), { wrapper });
    const prf = new Uint8Array(32).fill(1);
    const newPrf = new Uint8Array(32).fill(2);
    let made: unknown;
    await act(async () => { made = await result.current.passkeyWrapWith({ kind: 'passkey', prf, wrap }, newPrf, 'new-cred'); });
    expect(made).toEqual({ wrappedMK: 'nw', wrapIv: 'niv' });
    expect(mockExtractableFromPasskey).toHaveBeenCalledWith(prf, 'w', 'iv', 'cred');
    expect(mockWrapForPasskey).toHaveBeenCalledWith(extractable, newPrf, 'new-cred');
  });
});

describe('EncryptionProvider – a new wrap of the key', () => {
  const extractable = { extractable: true } as unknown as CryptoKey;

  it('fetches the password wrap against the password and the 2FA code, for one action, and rewraps with it', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    mockExtractableFromPassword.mockResolvedValue(extractable);
    mockRewrapMasterKey.mockResolvedValue({ salt: 'ns', wrappedMK: 'nwmk', wrapIv: 'nwiv' });
    mockPasswordWrap.mockResolvedValue({ confirmToken: 't'.repeat(64), encryption: { kekSalt: 'S', encryptedMasterKey: 'E', kekWrapIv: 'I', kekIterations: 600000 } });
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('currentPw', 'salt', 'emk', 'iv', 600000); });

    let rewrapResult: unknown;
    let token: string | undefined;
    await act(async () => {
      const source = await result.current.passwordSource('currentPw', 'a@b.c', 'change-password', ' 123456 ');
      token = source.confirmToken;
      rewrapResult = await result.current.rewrapWith(source, 'newPw');
    });

    // What it sent is the derived sign-in secret (never the password), the action and the code
    expect(mockPasswordWrap).toHaveBeenCalledWith({ currentAuthSecret: 'a'.repeat(64), action: 'change-password', code: '123456' });
    // The wrap comes from the server each time — never the one this tab signed
    // in with, which goes stale when the password is changed in another tab
    expect(mockExtractableFromPassword).toHaveBeenCalledWith('currentPw', 'S', 'E', 'I', 600000);
    expect(mockRewrapMasterKey).toHaveBeenCalledWith(extractable, 'newPw');
    expect(rewrapResult).toEqual({ salt: 'ns', wrappedMK: 'nwmk', wrapIv: 'nwiv' });
    // The single-use token then confirms the action, so the code isn't asked twice
    expect(token).toBe('t'.repeat(64));
  });

  it('keeps no wrap in the tab after signing in', async () => {
    mockUnwrapMasterKey.mockResolvedValue(fakeCryptoKey);
    mockPasswordWrap.mockRejectedValue(new Error('Current password incorrect'));
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await result.current.unlock('currentPw', 'salt', 'emk', 'iv', 600000); });
    // Nothing cached to fall back on: a refused fetch is a refusal
    await expect(act(async () => { await result.current.passwordSource('wrong', 'a@b.c', 'recovery-key'); })).rejects.toThrow('Current password incorrect');
    expect((result.current as unknown as Record<string, unknown>).adoptKeyWrap).toBeUndefined();
  });

  it('says so when the password doesn’t open the key', async () => {
    mockExtractableFromPassword.mockRejectedValue(new Error('OperationError'));
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await expect(act(async () => {
      await result.current.verifyKeySource({ kind: 'password', password: 'x', params: { kekSalt: 's', encryptedMasterKey: 'e', kekWrapIv: 'i', kekIterations: 600000 } });
    })).rejects.toThrow('Current password incorrect');
  });

  it('makes a recovery key from a passkey touch', async () => {
    mockExtractableFromPasskey.mockResolvedValue(extractable);
    mockNewRecoveryWrapping.mockResolvedValue({ recoveryKey: 'rk', recoveryWrappedMK: 'rw', recoveryWrapIv: 'ri' });
    const { result } = renderHook(() => useEncryption(), { wrapper });
    let made: unknown;
    await act(async () => { made = await result.current.recoveryKeyWith({ kind: 'passkey', prf: new Uint8Array(32), wrap: { credentialId: 'c', wrappedMK: 'w', wrapIv: 'iv' } }); });
    expect(made).toEqual({ recoveryKey: 'rk', recoveryWrappedMK: 'rw', recoveryWrapIv: 'ri' });
    expect(mockNewRecoveryWrapping).toHaveBeenCalledWith(extractable);
  });
});
