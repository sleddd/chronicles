import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicShelfSettingsRow } from '@/components/organisms/PublicShelfSettingsRow';
import { renderWithTheme } from '../testUtils';
import { usePublicShelfStore } from '@/stores/publicShelfStore';

const api = vi.hoisted(() => ({ put: vi.fn(), mine: vi.fn(), reset: vi.fn(), remove: vi.fn() }));
vi.mock('@/services/api', () => ({ publicShelf: api, ApiError: class extends Error {}, retryDelayMs: () => 1000 }));
vi.mock('@/stores/entriesStore', () => ({ useEntriesStore: Object.assign(() => ({}), { getState: () => ({ decryptedEntries: [], allTopics: [] }) }) }));
vi.mock('@/services/flashNotice', () => ({ showFlash: vi.fn() }));

const shelf = { token: 'abcdefghijklmnopqrstuvwxyz012345', title: 'My shelf', itemCount: 3, createdAt: '', updatedAt: '' };

describe('PublicShelfSettingsRow', () => {
  beforeEach(() => {
    Object.values(api).forEach(f => f.mockReset());
    usePublicShelfStore.getState().reset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('says it is off until there is a shelf', () => {
    usePublicShelfStore.getState().setLoaded(null);
    renderWithTheme(<PublicShelfSettingsRow />);
    expect(screen.getByText(/^Off\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn off/ })).not.toBeInTheDocument();
  });

  it('a shelf this browser never turned on says so and offers Turn on here, which publishes and records it', async () => {
    usePublicShelfStore.getState().setLoaded(shelf);
    api.put.mockResolvedValue(shelf);
    renderWithTheme(<PublicShelfSettingsRow />);
    expect(screen.getByText(/^On, but not updated from this browser/)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on here' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    await waitFor(() => expect(usePublicShelfStore.getState().enabledHere).toBe(true));
    expect(screen.queryByRole('button', { name: 'Turn on here' })).not.toBeInTheDocument();
  });

  it('once on: the title, Copy link, and Reset / Turn off that ask twice', async () => {
    usePublicShelfStore.getState().setLoaded(shelf);
    usePublicShelfStore.getState().setEnabledHere(true);
    api.reset.mockResolvedValue({ ...shelf, token: 'n'.repeat(32) });
    api.remove.mockResolvedValue({ success: true });
    renderWithTheme(<PublicShelfSettingsRow />);
    expect(screen.getByText(/^On — 3 items/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Public shelf title'), { target: { value: 'Mine' } });
    fireEvent.blur(screen.getByLabelText('Public shelf title'));
    expect(usePublicShelfStore.getState().title).toBe('Mine');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${location.origin}/public-shelf/${shelf.token}`));
    fireEvent.click(screen.getByRole('button', { name: 'Reset link' }));
    expect(api.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Reset\? The old link/ }));
    await waitFor(() => expect(api.reset).toHaveBeenCalled());
    await waitFor(() => expect(usePublicShelfStore.getState().publicShelf?.token).toBe('n'.repeat(32)));
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off?' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalled());
    await waitFor(() => expect(usePublicShelfStore.getState().publicShelf).toBeNull());
  });
});
