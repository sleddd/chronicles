import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext.js';

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockLogout = vi.fn();

vi.mock('../services/api.js', () => ({
  auth: {
    login: (...args: unknown[]) => mockLogin(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
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
    expect(result.current.encryptionData).toBeNull();
  });
});

describe('AuthProvider – login', () => {
  it('updates user and encryption data on successful login', async () => {
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
    expect(result.current.encryptionData).toEqual(encryptionData);
    expect(returned).toEqual(encryptionData);
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
        password: 'StrongPass123!',
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
    expect(result.current.encryptionData).toBeNull();
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
  });
});

describe('AuthProvider – session restore on mount', () => {
  it('restores user from /auth/me on mount', async () => {
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
