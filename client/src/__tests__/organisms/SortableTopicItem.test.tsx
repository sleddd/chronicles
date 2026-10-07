import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { SortableTopicItem } from '@/components/organisms/SortableTopicItem';

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

vi.mock('@/utils/topicIcons', () => ({
  getTopicIcon: () => ({ prefix: 'fas', iconName: 'book' }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('SortableTopicItem', () => {
  const defaultProps = {
    topic: { id: 1, name: 'Work', icon: 'briefcase', color: '#3B82F6' },
    isActive: false,
    count: 5,
    accentColor: '#4281a4',
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  it('renders topic name', () => {
    renderWithTheme(<SortableTopicItem {...defaultProps} />);
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    renderWithTheme(<SortableTopicItem {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Work'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = vi.fn();
    renderWithTheme(<SortableTopicItem {...defaultProps} onEdit={onEdit} />);
    const editBtn = screen.getByTitle('Edit');
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalled();
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn();
    renderWithTheme(<SortableTopicItem {...defaultProps} onDelete={onDelete} />);
    const deleteBtn = screen.getByTitle('Delete');
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalled();
  });
});
