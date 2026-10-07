import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { ShareModal } from '@/components/organisms/ShareModal';

vi.mock('@/services/api', () => ({
  shares: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ token: 'abc123', createdAt: new Date().toISOString() }),
    revoke: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock crypto.subtle for share key generation
const mockSubtle = {
  generateKey: vi.fn().mockResolvedValue({}),
  exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
  encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
};
Object.defineProperty(globalThis, 'crypto', {
  value: { subtle: mockSubtle, getRandomValues: (arr: Uint8Array) => arr },
  writable: true,
});

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('ShareModal', () => {
  it('renders share entry title', () => {
    renderWithTheme(<ShareModal entryId={7} entryContent="Hello world" onClose={vi.fn()} />);
    expect(screen.getByText('Share Entry')).toBeInTheDocument();
  });

  it('renders create share link section', () => {
    renderWithTheme(<ShareModal entryId={7} entryContent="Hello world" onClose={vi.fn()} />);
    const elements = screen.getAllByText('Create share link');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders create share link button', async () => {
    renderWithTheme(<ShareModal entryId={7} entryContent="Hello world" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Create share link', { selector: 'button' }) || screen.getByRole('button', { name: /create share link/i })).toBeInTheDocument();
    });
  });

  it('warns that a shared copy is readable by anyone and stored unencrypted', () => {
    // Sharing opts this entry out of zero-knowledge — the user must be told
    renderWithTheme(<ShareModal entryId={7} entryContent="Hello world" onClose={vi.fn()} />);
    expect(screen.getByText(/anyone with the link can read this entry/i)).toBeInTheDocument();
    expect(screen.getByText(/stored unencrypted on the server/i)).toBeInTheDocument();
  });
});
