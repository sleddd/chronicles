import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { renderWithTheme } from '../testUtils';
import { NotFoundView } from '@/views/NotFoundView';
import { useAuth } from '@/contexts/AuthContext';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

const at = (path: string) => renderWithTheme(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<p>Sign-in page</p>} />
      <Route path="*" element={<NotFoundView />} />
    </Routes>
  </MemoryRouter>,
);

describe('NotFoundView', () => {
  it('sends a signed-out visitor to sign-in', () => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false, isLoading: false } as never);
    at('/no-such-page');
    expect(screen.getByText('Sign-in page')).toBeInTheDocument();
  });

  it('shows a 404 page with the address to a signed-in user', () => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true, isLoading: false } as never);
    at('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('/no-such-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute('href', '/dashboard');
  });
});
