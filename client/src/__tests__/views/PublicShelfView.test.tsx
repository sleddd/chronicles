import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicShelfView } from '@/views/PublicShelfView';
import { renderWithTheme } from '../testUtils';

vi.mock('react-router-dom', () => ({
  useParams: vi.fn(() => ({ token: 'abcdefghijklmnopqrstuvwxyz012345' })),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

const mockGetPage = vi.hoisted(() => vi.fn());
vi.mock('@/services/api', () => ({ publicShelf: { getPage: mockGetPage } }));

const page = (over: Record<string, unknown> = {}) => ({
  title: 'Claudette’s shelf', page: 1, pages: 2, total: 30, updatedAt: '2026-11-10T10:00:00Z',
  items: [{ title: 'Dune', creator: 'Frank Herbert', year: '1965', type: 'book', rating: 4.5, shelf: 'done', cover: 'data:image/jpeg;base64,AAAA' }],
  ...over,
});

describe('PublicShelfView', () => {
  beforeEach(() => { mockGetPage.mockReset(); document.head.innerHTML = '<meta name="robots" content="index, follow">'; });

  it('shows the title and the posters read-only, with the filters, then fetches the next page on Show more', async () => {
    mockGetPage.mockResolvedValueOnce(page()).mockResolvedValueOnce(page({ page: 2, items: [{ title: 'Blue', creator: 'Joni Mitchell', year: '1971', type: 'music', rating: 5, shelf: 'done' }] }));
    const { container } = renderWithTheme(<PublicShelfView />);
    expect(await screen.findByText('Claudette’s shelf')).toBeInTheDocument();
    expect(screen.queryByText('30 items')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dune · Frank Herbert · 1965' })).toBeInTheDocument();
    // the grid itself has nothing to press; the filter bar is the only control set
    expect(container.querySelectorAll('article select, article input, article button')).toHaveLength(0);
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(mockGetPage).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz012345', 1, expect.objectContaining({ sort: 'newest' }));
    expect(screen.getByText('Showing 1 of 30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz012345', 2, expect.anything()));
    expect(await screen.findByRole('img', { name: 'Blue · Joni Mitchell · 1971' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dune · Frank Herbert · 1965' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('refetches the first page with the filters when one changes', async () => {
    mockGetPage.mockResolvedValue(page());
    renderWithTheme(<PublicShelfView />);
    await screen.findByText('Claudette’s shelf');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'book' } });
    await waitFor(() => expect(mockGetPage).toHaveBeenLastCalledWith('abcdefghijklmnopqrstuvwxyz012345', 1, expect.objectContaining({ type: 'book' })));
    fireEvent.change(screen.getByLabelText('Rating'), { target: { value: '4' } });
    await waitFor(() => expect(mockGetPage).toHaveBeenLastCalledWith('abcdefghijklmnopqrstuvwxyz012345', 1, expect.objectContaining({ type: 'book', rating: 4 })));
  });

  it('says when a shelf isn’t available, and when it’s empty', async () => {
    mockGetPage.mockRejectedValue(new Error('404'));
    renderWithTheme(<PublicShelfView />);
    expect(await screen.findByText('This shelf isn’t available.')).toBeInTheDocument();
    mockGetPage.mockResolvedValue(page({ items: [], total: 0, pages: 1 }));
    renderWithTheme(<PublicShelfView />);
    expect(await screen.findByText('Nothing on this shelf yet.')).toBeInTheDocument();
  });
});
