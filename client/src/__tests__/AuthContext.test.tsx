import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { deriveAuthSecret } from '@chronicles/shared';
import { AuthProvider, useAuth } from '../contexts/AuthContext.js';

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockLogout = vi.fn();
const mockSubmit2FA = vi.fn();

const mockWipe = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/browserData.js', () => ({ wipeBrowserData: (...args: unknown[]) => mockWipe(...args) }));
const mockPasskeySignIn = vi.fn();
vi.mock('../services/passkeys.js', () => ({ signInWithPasskey: (...args: unknown[]) => mockPasskeySignIn(...args) }));

vi.mock('../services/api.js', () => ({
  auth: {
    login: (...args: unknown[]) => mockLogin(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    submit2FA: (...args: unknown[]) => mockSubmit2FA(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: Record<string, unknown>;
    constructor(status: number, message: string, _retryAfterSec?: number, body: Record<string, unknown> = {}) {
      super(message);
      this.status = status;
      this.body = body;
      this.name = 'ApiError';
    }
  },
}));

// Mock the stores used by logout
vi.mock('../stores/entriesStore.js', () => ({
  useEntriesStore: {
    getState: () => ({ clearAll: vi.fn() }),
  },
}));
vi.mock('../stores/uiStore.js', () => ({
  useUIStore: {
    getState: () => ({ clearSearch: vi.fn() }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AuthProvider, null, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mock the initial /auth/me call to return not authenticated
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: 'Not authenticated' }),
  }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth – outside provider', () => {
  it('throws when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within AuthProvider');
  });
});

describe('AuthProvider – default state', () => {
  it('provides unauthenticated state by default', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for loading to finish (initial /auth/me check)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('AuthProvider – login', () => {
  it('sets the user and hands the key wrap straight back, keeping no copy of it', async () => {
    const encryptionData = {
      encryptionEnabled: true,
      kekSalt: 'salt',
      encryptedMasterKey: 'emk',
      kekWrapIv: 'iv',
      kekIterations: 600000,
      recoveryWrappedMK: null,
      recoveryWrapIv: null,
    };

    mockLogin.mockResolvedValue({
      user: { email: 'a@b.com', username: 'alice' },
      encryption: encryptionData,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.login('a@b.com', 'password');
    });

    expect(result.current.user).toEqual({ email: 'a@b.com', username: 'alice' });
    expect(result.current.isAuthenticated).toBe(true);
    expect(returned).toEqual(encryptionData);
    // The wrap goes to the unlock and nowhere else: the context holds none
    expect((result.current as unknown as Record<string, unknown>).encryptionData).toBeUndefined();
  });

  it('a sign-in clears a sign-out that never reached the server, so the next load keeps the new session', async () => {
    mockLogin.mockResolvedValue({ user: { email: 'a@b.com', username: 'alice' }, encryption: {} });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Signed out offline earlier, in this same page
    localStorage.setItem('chronicles.pending-sign-out', '1');
    await act(async () => { await result.current.login('a@b.com', 'password'); });
    expect(localStorage.getItem('chronicles.pending-sign-out')).toBeNull();
  });

  it('sends a derived secret, never the password', async () => {
    mockLogin.mockResolvedValue({ user: { email: 'a@b.com', username: 'alice' }, encryption: {} });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.login('A@B.com ', 'password'); });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    const sent = mockLogin.mock.calls[0][0];
    expect(sent).toEqual({ email: 'A@B.com ', authSecret: await deriveAuthSecret('password', 'a@b.com') });
    expect(JSON.stringify(sent)).not.toContain('password');
  });

  it('never resends with the password, whatever the server answers', async () => {
    const { ApiError } = await import('../services/api.js');
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'Invalid credentials', undefined, { legacyAuth: true }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await expect(result.current.login('a@b.com', 'password')).rejects.toThrow(); });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockLogin.mock.calls[0][0])).not.toContain('password');
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('AuthProvider – register', () => {
  it('sets user on successful registration', async () => {
    mockRegister.mockResolvedValue({
      user: { email: 'new@b.com', username: 'newuser' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register({
        email: 'new@b.com',
        username: 'newuser',
        authSecret: 'a'.repeat(64),
        encryptedMasterKey: 'emk',
        kekSalt: 'salt',
        kekWrapIv: 'iv',
        recoveryWrappedMK: 'rwmk',
        recoveryWrapIv: 'riv',
        recoveryKeyHash: 'rkh',
        recoveryKeySalt: 'rks',
      });
    });

    // A brand-new account never has 2FA on yet
    expect(result.current.user).toEqual({ email: 'new@b.com', username: 'newuser', totpEnabled: false });
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider – logout', () => {
  it('clears user and encryption data', async () => {
    mockLogin.mockResolvedValue({
      user: { email: 'a@b.com', username: 'alice' },
      encryption: { encryptionEnabled: true, kekSalt: 's', encryptedMasterKey: 'e', kekWrapIv: 'i', kekIterations: 600000, recoveryWrappedMK: null, recoveryWrapIv: null },
    });
    mockLogout.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Login first
    await act(async () => {
      await result.current.login('a@b.com', 'password');
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Now logout
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('clears client state even if server logout fails', async () => {
    mockLogin.mockResolvedValue({
      user: { email: 'a@b.com', username: 'alice' },
      encryption: { encryptionEnabled: false, kekSalt: null, encryptedMasterKey: null, kekWrapIv: null, kekIterations: 600000, recoveryWrappedMK: null, recoveryWrapIv: null },
    });
    mockLogout.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('a@b.com', 'password');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    // The session may still be good on the server: the next load ends it first
    expect(mockLogout).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('chronicles.pending-sign-out')).toBe('1');
  });
});

describe('AuthProvider – session restore on mount', () => {
  afterEach(() => localStorage.removeItem('chronicles.pending-sign-out'));

  it('ends a session the last sign-out couldn’t reach before trusting /auth/me', async () => {
    localStorage.setItem('chronicles.pending-sign-out', '1');
    mockLogout.mockResolvedValue({ success: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ user: { email: 'olivia@b.com', username: 'olivia' }, encryption: {} }) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockLogout).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('chronicles.pending-sign-out')).toBeNull();
  });

  it('restores user from /auth/me on mount', async () => {
    localStorage.removeItem('chronicles.pending-sign-out');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        user: { email: 'restored@b.com', username: 'restored' },
        encryption: {
          encryptionEnabled: true,
          kekSalt: 's',
          encryptedMasterKey: 'emk',
          kekWrapIv: 'iv',
          kekIterations: 600000,
          recoveryWrappedMK: null,
          recoveryWrapIv: null,
        },
      }),
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual({ email: 'restored@b.com', username: 'restored' });
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider – how a session ends', () => {
  const signIn = async () => {
    mockLogin.mockResolvedValue({ user: { email: 'a@b.com', username: 'alice' }, encryption: {} });
    const hook = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { await hook.result.current.login('a@b.com', 'password'); });
    return hook;
  };

  it('pressing Sign out ends the session, ends this browser’s trust, and wipes what the browser stores', async () => {
    mockLogout.mockResolvedValue({ success: true });
    const { result } = await signIn();
    await act(async () => { await result.current.logout(); });
    expect(mockLogout).toHaveBeenCalledWith(true);
    expect(mockWipe).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
  });

  it('a session that ends by itself (idle, a reload) keeps what the browser stores and keeps its trust', async () => {
    mockLogout.mockResolvedValue({ success: true });
    localStorage.setItem('chronicles.theme-v1', 'dark');
    sessionStorage.setItem('planner-keyword-v1', 'typed from decrypted data');
    const { result } = await signIn();
    await act(async () => { await result.current.endSession(); });
    expect(mockLogout).toHaveBeenCalledWith(false);
    expect(mockWipe).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('chronicles.theme-v1')).toBe('dark');
    // What was typed into searches came from decrypted data: that goes
    expect(sessionStorage.getItem('planner-keyword-v1')).toBeNull();
    localStorage.removeItem('chronicles.theme-v1');
  });

  it('dropping the user in one tab leaves the browser’s session alone (another tab is using it)', async () => {
    const { result } = await signIn();
    act(() => { result.current.dropUser(); });
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockWipe).not.toHaveBeenCalled();
  });

  it('a session that could not be ended on the server is ended on the next load, before /me is trusted', async () => {
    mockLogout.mockRejectedValue(new Error('offline'));
    const { result } = await signIn();
    await act(async () => { await result.current.endSession(); });
    expect(localStorage.getItem('chronicles.pending-sign-out')).toBe('1');
    localStorage.removeItem('chronicles.pending-sign-out');
  });
});

describe('AuthProvider – what /me gives', () => {
  it('takes who is signed in and keeps no key wrap, even if a server sent one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { email: 'a@b.com', username: 'alice', totpEnabled: false }, encryption: { encryptedMasterKey: 'emk', kekSalt: 's' } }),
    }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user?.email).toBe('a@b.com');
    expect(JSON.stringify(result.current)).not.toContain('emk');
  });
});

describe('AuthProvider – passkey sign-in', () => {
  it('sets the user and returns the wrap and its secret to the unlock', async () => {
    const prf = new Uint8Array(32).fill(3);
    mockPasskeySignIn.mockResolvedValue({ user: { email: 'a@b.com', username: 'alice', totpEnabled: true }, wrap: { credentialId: 'c', wrappedMK: 'w', wrapIv: 'i' }, prf });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let got: unknown;
    await act(async () => { got = await result.current.loginWithPasskey(); });
    expect(result.current.isAuthenticated).toBe(true);
    expect((got as { prf: Uint8Array }).prf).toBe(prf);
    // No code screen: no 2FA, or this browser is trusted to skip it
    expect(result.current.pending2FA).toBeNull();
  });

  it('with 2FA on, the touch stands in for the password only: the code screen shows, and the code brings the passkey’s wrap', async () => {
    const prf = new Uint8Array(32).fill(3);
    mockPasskeySignIn.mockResolvedValue({ requires2FA: true, pendingToken: 'p'.repeat(64), prf });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let got: unknown;
    await act(async () => { got = await result.current.loginWithPasskey(); });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.pending2FA).toEqual({ pendingToken: 'p'.repeat(64), viaPasskey: true });
    expect((got as { prf: Uint8Array }).prf).toBe(prf);

    const wrap = { credentialId: 'c', wrappedMK: 'w', wrapIv: 'i' };
    mockSubmit2FA.mockResolvedValue({ user: { email: 'a@b.com', username: 'alice', totpEnabled: true }, passkey: wrap });
    let done: unknown;
    await act(async () => { done = await result.current.submitTotpCode('123456', true); });
    expect(mockSubmit2FA).toHaveBeenCalledWith({ pendingToken: 'p'.repeat(64), code: '123456', trustBrowser: true });
    expect(done).toEqual({ passkey: wrap });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.pending2FA).toBeNull();
  });
});
