import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { InlineEditPanel } from '@/components/molecules/InlineEditPanel';
import { renderWithTheme } from '../testUtils';

describe('InlineEditPanel', () => {
  const baseProps = {
    editor: <div data-testid="editor">Editor content</div>,
    fields: <div data-testid="fields">Field content</div>,
    accentColor: '#4281a4',
    saving: false,
    status: '',
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders editor and fields slots', () => {
    renderWithTheme(<InlineEditPanel {...baseProps} />);
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByTestId('fields')).toBeInTheDocument();
  });

  it('renders Save and Cancel buttons', () => {
    renderWithTheme(<InlineEditPanel {...baseProps} />);
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('does not render a Delete button', () => {
    renderWithTheme(<InlineEditPanel {...baseProps} />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('calls onSave when Save is clicked', () => {
    const onSave = vi.fn();
    renderWithTheme(<InlineEditPanel {...baseProps} onSave={onSave} />);
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    renderWithTheme(<InlineEditPanel {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows spinner instead of Save text when saving', () => {
    renderWithTheme(<InlineEditPanel {...baseProps} saving />);
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('turns the save button into a failure notice when saving failed', () => {
    renderWithTheme(<InlineEditPanel {...baseProps} status="Save failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('does not display status when empty', () => {
    renderWithTheme(<InlineEditPanel {...baseProps} status="" />);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});
