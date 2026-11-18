import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { EntryForm } from '@/components/organisms/EntryForm';
import type { EntryImage } from '@/services/imageStorage';

vi.mock('@/hooks/useEncryptedSetting', () => ({
  useEncryptedSetting: (_key: string, fallback: unknown) => [fallback, vi.fn(), true],
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      decryptedEntries: [],
      updateDecryptedEntry: vi.fn(),
    }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ accentColor: '#4A5568' }),
}));

vi.mock('@/components/organisms/Editor', () => ({
  ToolbarRow: 'div',
  Editor: ({ content }: { content: string }) => <textarea data-testid="editor" defaultValue={content} />,
}));

vi.mock('@/components/organisms/TopicSelector', () => ({
  TopicSelector: () => <select data-testid="topic-selector" />,
}));

// Thumbs/hero/lightbox resolve images through the encryption context — stub the hook
vi.mock('@/hooks/useDecryptedImage', () => ({
  useDecryptedImage: () => ({ url: null, loading: true, error: null }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

const makeImage = (n: number): EntryImage => ({
  key: `img/0000000${n}-0000-0000-0000-000000000000`,
  iv: 'aXY=',
  thumbKey: `img/0000000${n}-0000-0000-0000-000000000000-t`,
  thumbIv: 'aXY=',
  mimeType: 'image/jpeg',
  size: 1000,
});

const defaultProps = {
  entryId: 1,
  content: 'Hello',
  onContentChange: vi.fn(),
  topicId: null,
  onTopicChange: vi.fn(),
  topics: [],
  customFields: {},
  onCustomFieldsChange: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onNew: vi.fn(),
  isEditing: true,
  isSaving: false,
  saveStatus: '',
};

describe('EntryForm image gating', () => {
  it('hides the upload button when image storage is not ready', () => {
    renderWithTheme(<EntryForm {...defaultProps} imagesReady={false} />);
    expect(screen.queryByLabelText('Add images')).not.toBeInTheDocument();
  });

  it('shows the upload button when image storage is ready', () => {
    renderWithTheme(<EntryForm {...defaultProps} imagesReady={true} images={[]} />);
    expect(screen.getByLabelText('Add images')).toBeEnabled();
  });

  it('disables the upload button at the 7-image cap', () => {
    const images = Array.from({ length: 7 }, (_, i) => makeImage(i));
    renderWithTheme(<EntryForm {...defaultProps} imagesReady={true} images={images} />);
    const btn = screen.getByLabelText('Add images');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Maximum of 7 images per entry');
  });



  it('keeps Format visible in the toolbar (not in More)', () => {
    renderWithTheme(<EntryForm {...defaultProps} images={[]} />);
    expect(screen.getByLabelText('Formatting')).toBeInTheDocument();
  });



  it('shows each photo under the text, each with its own remove (no featured image)', () => {
    const images = [makeImage(1), makeImage(2), makeImage(3)];
    renderWithTheme(<EntryForm {...defaultProps} images={images} imagesReady={true} />);
    expect(screen.getAllByLabelText('Remove image')).toHaveLength(3);
    expect(screen.queryByLabelText(/featured image/)).not.toBeInTheDocument();
  });

  it('shows the inline image error', () => {
    renderWithTheme(<EntryForm {...defaultProps} imageError="Only 2 more images can be added (max 7 per entry)" />);
    expect(screen.getByText(/max 7 per entry/)).toBeInTheDocument();
  });
});
