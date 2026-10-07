import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { GoalCard } from '@/components/organisms/GoalCard';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

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

vi.mock('./Editor', () => ({
  Editor: () => <div data-testid="editor">Editor</div>,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

const mockGoal = {
  id: 1,
  title: 'Learn TypeScript',
  content: '<p>Learn TS</p>',
  goalType: 'short_term',
  goalStatus: 'active',
  targetDate: '2024-12-31',
  taxonomyId: 10,
  customFields: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  isEncrypted: true,
  metadata: {},
};

describe('GoalCard', () => {
  const defaultProps = {
    goal: mockGoal as never,
    milestones: [],
    accentColor: '#4281a4',
    isEditing: false,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onToggleMilestone: vi.fn(),
    onUnlinkMilestone: vi.fn(),
    onLinkMilestone: vi.fn(),
    onCreateMilestone: vi.fn(),
  };

  it('renders goal title', () => {
    renderWithTheme(<GoalCard {...defaultProps} />);
    expect(screen.getByText('Learn TypeScript')).toBeInTheDocument();
  });

  it('shows milestone progress when milestones are linked', () => {
    const milestones = [
      { id: 2, title: 'Basics', isCompleted: true, parentGoalId: 1 },
      { id: 3, title: 'Generics', isCompleted: false, parentGoalId: 1 },
    ];
    renderWithTheme(<GoalCard {...defaultProps} milestones={milestones as never} />);
    expect(screen.getByText('1/2 milestones')).toBeInTheDocument();
  });

  it('hides progress when no milestones are linked', () => {
    renderWithTheme(<GoalCard {...defaultProps} />);
    expect(screen.queryByText(/milestones$/)).not.toBeInTheDocument();
  });

  it('calls onSelect when header is clicked', () => {
    const onSelect = vi.fn();
    renderWithTheme(<GoalCard {...defaultProps} onSelect={onSelect} />);
    screen.getByText('Learn TypeScript').click();
    expect(onSelect).toHaveBeenCalled();
  });
});
