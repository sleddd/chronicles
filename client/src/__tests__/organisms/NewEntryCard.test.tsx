import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { NewEntryCard } from '@/components/organisms/NewEntryCard';

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({
    encryptPost: vi.fn().mockResolvedValue({
      contentEncrypted: '', contentIv: '',
      metadataEncrypted: '', metadataIv: '',
    }),
  }),
}));

// Stable references, like real Zustand state
const entriesState = vi.hoisted(() => ({
  addDecryptedEntry: () => {},
  allTopics: [],
  decryptedEntries: [],
  featureFlags: {},
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector(entriesState),
    { getState: () => entriesState },
  ),
}));

vi.mock('@/services/api', () => ({
  entries: {
    create: vi.fn().mockResolvedValue({ id: 1, createdAt: new Date().toISOString() }),
  },
}));

vi.mock('@/components/organisms/Editor', () => ({
  Editor: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="editor">{placeholder}</div>
  ),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

const mockTopic = { id: 1, name: 'Work', icon: null, color: '#3B82F6' };

describe('NewEntryCard', () => {
  it('renders add button when not open', () => {
    renderWithTheme(<NewEntryCard topic={mockTopic} accentColor="#4281a4" />);
    expect(screen.getByText(/New Work Entry/)).toBeInTheDocument();
  });

  it('opens card when add button is clicked', () => {
    renderWithTheme(<NewEntryCard topic={mockTopic} accentColor="#4281a4" />);
    fireEvent.click(screen.getByText(/New Work Entry/));
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  it('shows correct placeholder based on topic', () => {
    renderWithTheme(<NewEntryCard topic={mockTopic} accentColor="#4281a4" />);
    fireEvent.click(screen.getByText(/New Work Entry/));
    expect(screen.getByText(/Write a new work entry/i)).toBeInTheDocument();
  });
});
