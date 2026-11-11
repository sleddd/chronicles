import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicShelfControl } from '@/components/organisms/PublicShelfControl';
import { renderWithTheme } from '../testUtils';
import { usePublicShelfStore } from '@/stores/publicShelfStore';

const api = vi.hoisted(() => ({ put: vi.fn(), mine: vi.fn(), reset: vi.fn(), remove: vi.fn() }));
vi.mock('@/services/api', () => ({ publicShelf: api, ApiError: class extends Error {}, retryDelayMs: () => 1000 }));
vi.mock('@/stores/entriesStore', () => ({ useEntriesStore: Object.assign(() => ({}), { getState: () => ({ decryptedEntries: [], allTopics: [] }) }) }));

const shelf = { token: 'abcdefghijklmnopqrstuvwxyz012345', title: 'My shelf', itemCount: 3, createdAt: '', updatedAt: '' };
const onTurnedOn = vi.fn();
const onOpenChange = vi.fn();

describe('PublicShelfControl', () => {
  beforeEach(() => {
    Object.values(api).forEach(f => f.mockReset());
    onTurnedOn.mockReset(); onOpenChange.mockReset();
    usePublicShelfStore.getState().reset();
    usePublicShelfStore.getState().setLoaded(null);
  });

  it('asks before the first publish, creates the shelf on Turn on and closes', async () => {
    api.put.mockResolvedValue(shelf);
    renderWithTheme(<PublicShelfControl open onOpenChange={onOpenChange} anchor={null} pendingItem={{ id: 1, title: 'Dune' } as any} onTurnedOn={onTurnedOn} />);
    expect(screen.getByRole('dialog', { name: 'Public shelf' })).toBeInTheDocument();
    expect(screen.getByText('Dune')).toBeInTheDocument();
    expect(screen.getByText(/stored readable on the server/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Claudette’s shelf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith({ title: 'Claudette’s shelf', items: [] }));
    await waitFor(() => expect(onTurnedOn).toHaveBeenCalledWith({ id: 1, title: 'Dune' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(usePublicShelfStore.getState().publicShelf?.token).toBe(shelf.token);
  });

  it('Not now closes without publishing', () => {
    renderWithTheme(<PublicShelfControl open onOpenChange={onOpenChange} anchor={null} pendingItem={null} onTurnedOn={onTurnedOn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderWithTheme(<PublicShelfControl open={false} onOpenChange={onOpenChange} anchor={null} pendingItem={null} onTurnedOn={onTurnedOn} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
