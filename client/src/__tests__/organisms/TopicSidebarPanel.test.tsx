import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { TopicSidebarPanel } from '@/components/organisms/TopicSidebarPanel';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn().mockReturnValue([]),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
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

vi.mock('@/utils/topicIcons', () => ({
  getTopicIcon: () => ({ prefix: 'fas', iconName: 'book' }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('TopicSidebarPanel', () => {
  const defaultProps = {
    topics: [
      { id: 1, name: 'Work', icon: 'briefcase', color: '#3B82F6' },
      { id: 2, name: 'Personal', icon: null, color: '#10B981' },
    ],
    selectedTopicId: null,
    totalEntryCount: 10,
    entryCounts: new Map([[1, 5], [2, 3]]),
    accentColor: '#4281a4',
    editingId: null,
    editName: '',
    editIcon: null,
    onEditNameChange: vi.fn(),
    onEditIconChange: vi.fn(),
    onEditSave: vi.fn(),
    onEditCancel: vi.fn(),
    onSelectTopic: vi.fn(),
    onStartEdit: vi.fn(),
    onDelete: vi.fn(),
    onDragEnd: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
  };

  it('renders Your Topics title', () => {
    renderWithTheme(<TopicSidebarPanel {...defaultProps} />);
    expect(screen.getByText('Your Topics')).toBeInTheDocument();
  });

  it('renders all entries item', () => {
    renderWithTheme(<TopicSidebarPanel {...defaultProps} />);
    expect(screen.getByText('All Topics')).toBeInTheDocument();
  });

  it('renders topic items', () => {
    renderWithTheme(<TopicSidebarPanel {...defaultProps} />);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('calls onSelectTopic when all entries is clicked', () => {
    const onSelectTopic = vi.fn();
    renderWithTheme(<TopicSidebarPanel {...defaultProps} onSelectTopic={onSelectTopic} />);
    fireEvent.click(screen.getByText('All Topics'));
    expect(onSelectTopic).toHaveBeenCalledWith(null);
  });

  it('shows empty state when no topics', () => {
    renderWithTheme(<TopicSidebarPanel {...defaultProps} topics={[]} />);
    expect(screen.getByText('No topics yet. Add one below.')).toBeInTheDocument();
  });
});
