import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';

const auth = vi.hoisted(() => ({
  isLoading: false,
  user: { email: 'olivia@example.com' } as { email: string } | null,
  endSession: vi.fn(async () => undefined),
  dropUser: vi.fn(),
}));
const handoff = vi.hoisted(() => ({ keyHolderExists: vi.fn(), requestKey: vi.fn(), holdKey: vi.fn(() => () => undefined) }));

vi.mock('../contexts/AuthContext.js', () => ({ useOptionalAuth: () => auth }));
vi.mock('../services/keyHandoff.js', () => handoff);
vi.mock('../services/browserData.js', () => ({ claimBrowserFor: vi.fn().mockResolvedValue(false) }));
vi.mock('@shared/crypto/encryptionService.js', () => ({
  encryptionService: { accountTag: async () => 'tag', decryptFile: vi.fn() },
}));

import { EncryptionProvider, useEncryption } from '../contexts/EncryptionContext.js';

const key = { type: 'secret', extractable: false } as unknown as CryptoKey;
const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(EncryptionProvider, null, children);

beforeEach(() => {
  Object.assign(auth, { isLoading: false, user: { email: 'olivia@example.com' } });
  auth.endSession.mockClear(); auth.dropUser.mockClear();
  handoff.keyHolderExists.mockReset(); handoff.requestKey.mockReset();
});

describe('a page that loads with a session but no key (a new tab, a reload)', () => {
  it('takes the key from a tab that holds it and opens with no prompt', async () => {
    handoff.keyHolderExists.mockResolvedValue(true);
    handoff.requestKey.mockResolvedValue(key);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    expect(result.current.isRestoring).toBe(true);
    await waitFor(() => expect(result.current.isRestoring).toBe(false));
    expect(result.current.isUnlocked).toBe(true);
    expect(handoff.requestKey).toHaveBeenCalledWith('olivia@example.com');
    expect(auth.endSession).not.toHaveBeenCalled();
    expect(auth.dropUser).not.toHaveBeenCalled();
  });

  it('with no tab holding the key, the session is nobody’s: it is ended on the server and nobody is asked', async () => {
    handoff.keyHolderExists.mockResolvedValue(false);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await waitFor(() => expect(result.current.isRestoring).toBe(false));
    expect(auth.endSession).toHaveBeenCalledTimes(1);
    expect(handoff.requestKey).not.toHaveBeenCalled();
    expect(result.current.isUnlocked).toBe(false);
  });

  it('a tab holds it but couldn’t hand it over: sign in here, and the session that tab is using is left alone', async () => {
    handoff.keyHolderExists.mockResolvedValue(true);
    handoff.requestKey.mockResolvedValue(null);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await waitFor(() => expect(result.current.isRestoring).toBe(false));
    expect(auth.dropUser).toHaveBeenCalledTimes(1);
    expect(auth.endSession).not.toHaveBeenCalled();
  });

  it('where the browser can’t say whether a tab holds it, it asks — and never ends a session on a guess', async () => {
    handoff.keyHolderExists.mockResolvedValue(null);
    handoff.requestKey.mockResolvedValue(null);
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await waitFor(() => expect(result.current.isRestoring).toBe(false));
    expect(handoff.requestKey).toHaveBeenCalled();
    expect(auth.endSession).not.toHaveBeenCalled();
    expect(auth.dropUser).toHaveBeenCalledTimes(1);
  });

  it('signed out, there is nothing to ask for', async () => {
    auth.user = null;
    const { result } = renderHook(() => useEncryption(), { wrapper });
    await waitFor(() => expect(result.current.isRestoring).toBe(false));
    expect(handoff.keyHolderExists).not.toHaveBeenCalled();
    expect(auth.endSession).not.toHaveBeenCalled();
  });

  it('waits for the session check before deciding, and decides once', async () => {
    auth.isLoading = true;
    handoff.keyHolderExists.mockResolvedValue(false);
    const { result, rerender } = renderHook(() => useEncryption(), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(handoff.keyHolderExists).not.toHaveBeenCalled();
    expect(result.current.isRestoring).toBe(true);
    auth.isLoading = false;
    rerender();
    await waitFor(() => expect(result.current.isRestoring).toBe(false));
    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(auth.endSession).toHaveBeenCalledTimes(1);
  });
});
