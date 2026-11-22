import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme as theme } from '@shared/theme/tokens';

const mockRetry = vi.fn();
const mockUpsert = vi.fn(async (key: string, value: unknown) => ({ key, value, updatedAt: '' }));
const mockTest = vi.fn(async (..._a: unknown[]) => {});

vi.mock('../contexts/EncryptionContext.js', () => ({
  useEncryption: () => ({
    retryRekey: (...a: unknown[]) => mockRetry(...a),
    encryptBytes: async (d: ArrayBuffer) => ({ ciphertext: d, iv: 'aXZpdml2aXZpdml2' }),
    decryptBytes: async () => { throw new Error('under the old key'); },
  }),
}));
vi.mock('../hooks/useSignOut.js', () => ({ useSignOut: () => async () => {} }));
vi.mock('../services/api.js', () => ({
  settings: { getAll: async () => [], upsert: (key: string, value: unknown) => mockUpsert(key, value) },
}));
vi.mock('../services/imageStorage.js', async () => {
  const { sealSetting } = await import('../services/settingCipher.js');
  return {
    testR2Connection: (...a: unknown[]) => mockTest(...a),
    encryptImageStorageConfig: (cfg: unknown, enc: never) => sealSetting('imageStorageConfig', cfg, enc),
  };
});

import { RekeyOverlay } from '../components/organisms/RekeyOverlay.js';
import { useRekeyStore } from '../stores/rekeyStore.js';

const show = () => render(<ThemeProvider theme={theme}><RekeyOverlay /></ThemeProvider>);
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the paused re-encryption screen', () => {
  beforeEach(() => {
    mockRetry.mockClear(); mockUpsert.mockClear(); mockTest.mockReset(); mockTest.mockResolvedValue(undefined);
    useRekeyStore.getState().reset();
  });

  it('offers the bucket settings only when the trouble is the photos', () => {
    useRekeyStore.getState().set({ status: 'error', error: 'The connection dropped', errorKind: null });
    show();
    expect(screen.queryByText('Update bucket settings')).toBeNull();
  });

  it('tests, saves and tries again with new bucket settings', async () => {
    useRekeyStore.getState().set({ status: 'error', error: 'Couldn’t download a photo', errorKind: 'photos' });
    show();
    fireEvent.click(screen.getByText('Update bucket settings'));
    fill('Account ID', 'a'.repeat(32));
    fill('Bucket name', 'my-photos');
    fill('Access key ID', 'AKID');
    fill('Secret key', 'SECRET');
    fireEvent.click(screen.getByText('Save and try again'));
    await waitFor(() => expect(mockRetry).toHaveBeenCalled());
    expect(mockTest).toHaveBeenCalledWith({ accountId: 'a'.repeat(32), bucket: 'my-photos', accessKeyId: 'AKID', secretAccessKey: 'SECRET' });
    expect(mockUpsert.mock.calls[0][0]).toBe('imageStorageConfig');
    // Sealed, never the settings themselves
    expect(mockUpsert.mock.calls[0][1]).toMatchObject({ v: 2 });
    expect(JSON.stringify(mockUpsert.mock.calls[0][1])).not.toContain('SECRET');
  });

  it('saves nothing when the bucket refuses the test', async () => {
    mockTest.mockRejectedValue(new Error('The bucket refused a test upload (HTTP 403)'));
    useRekeyStore.getState().set({ status: 'error', error: '2 photos couldn’t be found', errorKind: 'missing' });
    show();
    fireEvent.click(screen.getByText('Update bucket settings'));
    fill('Account ID', 'a'.repeat(32));
    fill('Bucket name', 'my-photos');
    fill('Access key ID', 'AKID');
    fill('Secret key', 'SECRET');
    fireEvent.click(screen.getByText('Save and try again'));
    await screen.findByText(/HTTP 403/);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });
});
