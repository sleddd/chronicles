import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicShelfControl } from '@/components/organisms/PublicShelfControl';
import { renderWithTheme } from '../testUtils';
import { usePublicShelfStore } from '@/stores/publicShelfStore';

const api = vi.hoisted(() => ({ put: vi.fn(), mine: vi.fn(), reset: vi.fn(), remove: vi.fn() }));
vi.mock('@/services/api', () => ({ publicShelf: api, ApiError: class extends Error {}, retryDelayMs: () => 1000 }));
vi.mock('@/stores/entriesStore', () => ({ useEntriesStore: Object.assign(() => ({}), { getState: () => ({ decryptedEntries: [], allTopics: [] }) }) }));

const shelf = { token: 'abcdefghijklmnopqrstuvwxyz012345', title: 'My shelf', itemCount: 3, createdAt: '', updatedAt: '' };

function Harness({ pending = null }: { pending?: any }) {
  return <PublicShelfControl count={3} open onOpenChange={() => {}} pendingItem={pending} onTurnedOn={onTurnedOn} />;
}
const onTurnedOn = vi.fn();

describe('PublicShelfControl', () => {
  beforeEach(() => {
    Object.values(api).forEach(f => f.mockReset());
    onTurnedOn.mockReset();
    usePublicShelfStore.getState().reset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('asks before the first publish and creates the shelf on Turn on', async () => {
    usePublicShelfStore.getState().setLoaded(null);
    api.put.mockResolvedValue(shelf);
    renderWithTheme(<Harness pending={{ id: 1, title: 'Dune' }} />);
    expect(screen.getByText('Dune')).toBeInTheDocument();
    expect(screen.getByText(/stored readable on the server/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith({ title: 'My shelf', items: [] }));
    await waitFor(() => expect(onTurnedOn).toHaveBeenCalledWith({ id: 1, title: 'Dune' }));
    expect(usePublicShelfStore.getState().publicShelf?.token).toBe(shelf.token);
  });

  it('once on: shows the link, copies it, and reset / turn off need a second click', async () => {
    usePublicShelfStore.getState().setLoaded(shelf);
    api.reset.mockResolvedValue({ ...shelf, token: 'n'.repeat(32) });
    api.remove.mockResolvedValue({ success: true });
    renderWithTheme(<Harness />);
    expect(screen.getByText(`${location.origin}/public-shelf/${shelf.token}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${location.origin}/public-shelf/${shelf.token}`));
    fireEvent.click(screen.getByRole('button', { name: 'Reset link' }));
    expect(api.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Reset\? The old link/ }));
    await waitFor(() => expect(api.reset).toHaveBeenCalled());
    await waitFor(() => expect(usePublicShelfStore.getState().publicShelf?.token).toBe('n'.repeat(32)));
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Turn off\? The link/ }));
    await waitFor(() => expect(api.remove).toHaveBeenCalled());
    await waitFor(() => expect(usePublicShelfStore.getState().publicShelf).toBeNull());
  });
});
