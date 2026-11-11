import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicShelfView } from '@/views/PublicShelfView';
import { renderWithTheme } from '../testUtils';

const mockSetParams = vi.fn();
let params = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useParams: vi.fn(() => ({ token: 'abcdefghijklmnopqrstuvwxyz012345' })),
  useSearchParams: vi.fn(() => [params, mockSetParams]),
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
  beforeEach(() => { mockGetPage.mockReset(); mockSetParams.mockReset(); params = new URLSearchParams(); document.head.innerHTML = '<meta name="robots" content="index, follow">'; });

  it('shows the title, the count, the posters read-only and the pager', async () => {
    mockGetPage.mockResolvedValue(page());
    const { container } = renderWithTheme(<PublicShelfView />);
    expect(await screen.findByText('Claudette’s shelf')).toBeInTheDocument();
    expect(screen.getByText('30 items')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dune · Frank Herbert · 1965' })).toBeInTheDocument();
    expect(container.querySelectorAll('select, input')).toHaveLength(0);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(mockSetParams).toHaveBeenCalledWith({ page: '2' });
    expect(mockGetPage).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz012345', 1);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('asks for the page in the address', async () => {
    params = new URLSearchParams('page=2');
    mockGetPage.mockResolvedValue(page({ page: 2 }));
    renderWithTheme(<PublicShelfView />);
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz012345', 2));
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
