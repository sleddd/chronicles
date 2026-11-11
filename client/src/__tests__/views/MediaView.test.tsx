import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MediaView } from '@/views/MediaView';
import { renderWithTheme } from '../testUtils';
import { usePublicShelfStore } from '@/stores/publicShelfStore';
import { ON_PUBLIC_SHELF } from '@/services/publicShelf';

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: '/media', search: '', state: null })),
}));

vi.mock('@/hooks/useInitializeData', () => ({
  useInitializeData: vi.fn(() => ({ isReady: true, isLoading: false, needsUnlock: false, handleUnlock: vi.fn() })),
}));

vi.mock('@/hooks/useDecryptedImage', () => ({ useDecryptedImage: () => ({ url: null, loading: false, error: null }) }));

const mockSave = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/hooks/useSaveFields', () => ({ useSaveFields: () => mockSave }));

vi.mock('@/components/templates/ContentTemplate', () => ({ ContentTemplate: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/organisms/UnlockDialog', () => ({ UnlockDialog: () => null }));
vi.mock('@/components/organisms/TopBarAction', () => ({ TopBarAction: ({ children }: any) => <>{children}</> }));
vi.mock('@/services/api', () => ({ publicShelf: { put: vi.fn(), mine: vi.fn(), reset: vi.fn(), remove: vi.fn() }, ApiError: class extends Error {}, retryDelayMs: () => 1000 }));

const entry = (id: number, fields: Record<string, unknown>) => ({
  id, content: '<p>x</p>', isEncrypted: true, createdAt: new Date(2026, 10, id % 28 + 1), updatedAt: new Date(),
  metadata: { _taxonomyId: 7, _customFields: { mediaTitle: `Title ${id}`, mediaType: 'book', rating: 3, shelf: 'done', _isFavorite: true, ...fields } },
});
const state: any = { decryptedEntries: [] as any[], allTopics: [{ id: 7, name: 'Media', icon: 'media', color: null }] };
vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: Object.assign((selector: (s: any) => any) => selector(state), { getState: () => state }),
}));

describe('MediaView', () => {
  beforeEach(() => {
    mockSave.mockClear();
    usePublicShelfStore.getState().reset();
    usePublicShelfStore.getState().setLoaded(null);
    state.decryptedEntries = [entry(1, {}), entry(2, { [ON_PUBLIC_SHELF]: true })];
  });

  it('shows 24 cards, more on Show more, and a filter starts over from the top', () => {
    state.decryptedEntries = Array.from({ length: 30 }, (_, i) => entry(i + 1, {}));
    renderWithTheme(<MediaView />);
    expect(screen.getAllByRole('button', { name: /^Open Title/ })).toHaveLength(24);
    expect(screen.getByText('Showing 24 of 30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getAllByRole('button', { name: /^Open Title/ })).toHaveLength(30);
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'title' } });
    expect(screen.getAllByRole('button', { name: /^Open Title/ })).toHaveLength(24);
    // The type chips narrow the grid; the list layout shows the same items as rows
    fireEvent.click(screen.getByRole('button', { name: 'Movies' }));
    expect(screen.getByText('Nothing matches those filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.queryAllByRole('button', { name: /^Open Title/ })).toHaveLength(0);
    expect(screen.getAllByText(/^Title \d+$/)).toHaveLength(24);
    expect(JSON.parse(localStorage.getItem('media-view-v1') ?? '{}').layout).toBe('list');
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.getAllByRole('button', { name: /^Open Title/ })).toHaveLength(24);
  });

  it('with a public shelf on, the meta row names it with a Public shelf link, and Copy shelf link copies it', async () => {
    usePublicShelfStore.getState().setLoaded({ token: 't'.repeat(32), title: 'My Media List', itemCount: 1, createdAt: '', updatedAt: '' });
    renderWithTheme(<MediaView />);
    expect(screen.queryByText(/items$/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Public shelf/ })).toHaveAttribute('href', expect.stringContaining('/public-shelf/' + 't'.repeat(32)));
    expect(screen.getByRole('button', { name: /Rename your public shelf, now “My Media List”/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy the public shelf link' })).toBeInTheDocument();
  });

  it('with no public shelf yet, the bookmark opens the confirmation and saves nothing', () => {
    renderWithTheme(<MediaView />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Title 1 to your public shelf' }));
    expect(screen.getByRole('dialog', { name: 'Public shelf' })).toBeInTheDocument();
    expect(screen.getByText(/Put/)).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('with a shelf on, the bookmark flags the entry and leaves the journal bookmark alone; again takes it off', () => {
    usePublicShelfStore.getState().setLoaded({ token: 't'.repeat(32), title: 'My shelf', itemCount: 1, createdAt: '', updatedAt: '' });
    renderWithTheme(<MediaView />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Title 1 to your public shelf' }));
    expect(mockSave).toHaveBeenCalledTimes(1);
    const [, fields] = mockSave.mock.calls[0];
    expect(fields[ON_PUBLIC_SHELF]).toBe(true);
    expect(fields._isFavorite).toBe(true);
    expect(fields.mediaTitle).toBe('Title 1');
    fireEvent.click(screen.getByRole('button', { name: 'Take Title 2 off your public shelf' }));
    expect(mockSave.mock.calls[1][1][ON_PUBLIC_SHELF]).toBe(false);
    expect(screen.queryByRole('button', { name: /Public shelf/ })).not.toBeInTheDocument();
  });
});
