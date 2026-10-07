import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render } from '@testing-library/react';
import { SharedEntryView } from '@/views/SharedEntryView';
import { useParams } from 'react-router-dom';

// SharedEntryView provides its own ThemeProvider, so we use plain render

vi.mock('react-router-dom', () => ({
  useParams: vi.fn(() => ({ token: 'abc123' })),
}));

const mockGet = vi.hoisted(() => vi.fn());
vi.mock('@/services/api', () => ({
  shares: { get: mockGet },
}));

vi.mock('@/components/templates/SharedTemplate', () => ({
  SharedTemplate: ({ children }: any) => <div data-testid="shared-template">{children}</div>,
}));

vi.mock('@/components/molecules/SharedEntryCard', () => ({
  SharedEntryCard: ({ status, errorMsg, content, createdAt }: any) => (
    <div data-testid="shared-entry-card">
      <span data-testid="status">{status}</span>
      {errorMsg && <span data-testid="error">{errorMsg}</span>}
      {content && <span data-testid="content">{content}</span>}
    </div>
  ),
}));

vi.mock('@/styles/GlobalStyle', () => ({
  GlobalStyle: () => null,
}));

describe('SharedEntryView', () => {
  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue({ content: '<p>x</p>', createdAt: '2024-01-01T00:00:00Z' });
  });

  it('renders without crashing', () => {
    render(<SharedEntryView />);
    expect(screen.getByTestId('shared-template')).toBeInTheDocument();
  });

  it('renders the shared entry card', () => {
    render(<SharedEntryView />);
    expect(screen.getByTestId('shared-entry-card')).toBeInTheDocument();
  });

  it('shows the shared content once loaded', async () => {
    mockGet.mockResolvedValue({ content: '<p>Hello</p>', createdAt: '2024-01-01T00:00:00Z' });
    render(<SharedEntryView />);
    expect(await screen.findByTestId('content')).toHaveTextContent('<p>Hello</p>');
    expect(mockGet).toHaveBeenCalledWith('abc123');
  });

  it('shows an unavailable message for revoked or expired links', async () => {
    mockGet.mockRejectedValue(new Error('404'));
    render(<SharedEntryView />);
    expect(await screen.findByTestId('error')).toHaveTextContent(/unavailable/);
  });

  it('treats a share with no content as unavailable', async () => {
    mockGet.mockResolvedValue({ content: null, createdAt: '2024-01-01T00:00:00Z' });
    render(<SharedEntryView />);
    expect(await screen.findByTestId('error')).toHaveTextContent(/unavailable/);
  });
});

describe('SharedEntryView (no token)', () => {
  beforeEach(() => {
    vi.mocked(useParams).mockReturnValue({});
  });

  it('shows error for invalid share link', () => {
    render(<SharedEntryView />);
    expect(screen.getByTestId('error')).toHaveTextContent('Invalid share link');
  });
});
