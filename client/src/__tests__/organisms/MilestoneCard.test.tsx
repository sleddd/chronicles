import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { MilestoneCard } from '@/components/organisms/MilestoneCard';

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({
    encryptPost: vi.fn().mockResolvedValue({
      contentEncrypted: '', contentIv: '',
      metadataEncrypted: '', metadataIv: '',
    }),
  }),
}));

vi.mock('@/stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      updateDecryptedEntry: vi.fn(),
      removeEntry: vi.fn(),
    }),
}));

vi.mock('@/services/api', () => ({
  entries: {
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/components/organisms/Editor', () => ({
  Editor: () => <div data-testid="editor">Editor</div>,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

const mockMilestone = {
  id: 1,
  title: 'Complete MVP',
  content: '<p>Finish the MVP</p>',
  milestoneStatus: 'active',
  targetDate: '2024-06-30',
  isCompleted: false,
  parentGoalId: null,
  taxonomyId: 5,
  customFields: {},
};

describe('MilestoneCard', () => {
  const defaultProps = {
    milestone: mockMilestone as never,
    tasks: [],
    goalTitle: null,
    goalOptions: [],
    accentColor: '#4281a4',
    isEditing: false,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onToggleTask: vi.fn(),
    onUnlinkTask: vi.fn(),
    onCreateTask: vi.fn(),
  };

  it('renders milestone title', () => {
    renderWithTheme(<MilestoneCard {...defaultProps} />);
    expect(screen.getByText('Complete MVP')).toBeInTheDocument();
  });

  it('shows completed status when milestone is completed', () => {
    renderWithTheme(
      <MilestoneCard
        {...defaultProps}
        milestone={{ ...mockMilestone, isCompleted: true } as never}
      />
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows linked goal title when available', () => {
    renderWithTheme(
      <MilestoneCard {...defaultProps} goalTitle="Learn TypeScript" />
    );
    expect(screen.getByText(/Goal: Learn TypeScript/)).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    renderWithTheme(<MilestoneCard {...defaultProps} onSelect={onSelect} />);
    screen.getByText('Complete MVP').click();
    expect(onSelect).toHaveBeenCalled();
  });
});
