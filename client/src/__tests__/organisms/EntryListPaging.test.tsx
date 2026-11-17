import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { EntryList, LIST_PAGE } from '@/components/organisms/EntryList';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedTopicId: null, setSelectedTopicId: vi.fn(), selectedEntryId: null, setSelectedEntryId: vi.fn(),
      setShowMobileEditor: vi.fn(), viewMode: 'all', selectedDate: new Date(), topicCustomFields: {},
      searchKeyword: '', searchDateFrom: '', searchDateTo: '',
    }),
}));

// 250 entries, one a day, newest first
const ENTRIES = Array.from({ length: 250 }, (_, i) => ({
  id: i + 1, content: `<p>Entry ${i + 1}</p>`, metadata: {}, isEncrypted: true,
  createdAt: new Date(Date.UTC(2026, 10, 14, 12) - i * 86_400_000), updatedAt: new Date(),
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ decryptedEntries: ENTRIES, topics: [], allTopics: [], updateDecryptedEntry: vi.fn(), removeEntry: vi.fn() }),
}));

const rows = () => screen.queryAllByText(/^Entry \d+$/).length;

describe('EntryList paging', () => {
  it('draws a page of rows at a time and more on Show more', () => {
    render(<ThemeProvider theme={lightTheme}><EntryList /></ThemeProvider>);
    expect(rows()).toBe(LIST_PAGE);
    expect(screen.getByText(`Showing ${LIST_PAGE} of 250`)).toBeInTheDocument();
    // Newest first: the first page ends at entry 100
    expect(screen.getByText('Entry 100')).toBeInTheDocument();
    expect(screen.queryByText('Entry 101')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(rows()).toBe(LIST_PAGE * 2);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(rows()).toBe(250);
    // Everything is showing: no foot
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });
});
