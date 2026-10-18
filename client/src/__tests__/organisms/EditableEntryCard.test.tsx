import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { EditableEntryCard } from '@/components/organisms/EditableEntryCard';
import type { DecryptedPost } from '@shared/crypto/types';
import type { Topic } from '@/types/topics';

const openInJournal = vi.fn();
vi.mock('@/hooks/useOpenInJournal', () => ({
  useOpenInJournal: () => openInJournal,
}));

const deleteEntryWithImages = vi.fn().mockResolvedValue(undefined);
vi.mock('@/utils/entryActions', () => ({
  deleteEntryWithImages: (id: number) => deleteEntryWithImages(id),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ topicCustomFields: {} }),
}));

const entry: DecryptedPost = {
  id: 42,
  content: '<p>Avocado toast notes</p>',
  metadata: { _taxonomyId: 5 },
  isEncrypted: true,
  createdAt: new Date('2026-07-01T10:00:00'),
  updatedAt: new Date('2026-07-01T10:00:00'),
};

const topic = { id: 5, name: 'Recipe', icon: null, color: null } as unknown as Topic;

function renderCard(props: Partial<React.ComponentProps<typeof EditableEntryCard>> = {}) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <EditableEntryCard entry={entry} topic={topic} accentColor="#4A5568" {...props} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EditableEntryCard (swipeable row — no inline editing)', () => {
  it('renders the entry preview text', () => {
    renderCard();
    expect(screen.getByText('Avocado toast notes')).toBeInTheDocument();
  });

  it('opens the entry in the journal editor on click', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /avocado toast/i }));
    expect(openInJournal).toHaveBeenCalledWith(42);
  });

  it('opens the entry with the keyboard', () => {
    renderCard();
    fireEvent.keyDown(screen.getByRole('button', { name: /avocado toast/i }), { key: 'Enter' });
    expect(openInJournal).toHaveBeenCalledWith(42);
  });

  it('swipes to Delete only (no swipe Edit — tapping the row opens it)', () => {
    renderCard();
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Delete')).toBeInTheDocument();
  });

  it('swipe-delete removes the entry (with image cleanup) and notifies', async () => {
    const onDeleted = vi.fn();
    renderCard({ onDeleted });
    fireEvent.click(screen.getByLabelText('Delete'));
    await waitFor(() => expect(deleteEntryWithImages).toHaveBeenCalledWith(42));
    expect(onDeleted).toHaveBeenCalled();
  });
});
