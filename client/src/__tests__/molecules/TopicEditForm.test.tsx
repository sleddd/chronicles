import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { TopicEditForm } from '@/components/molecules/TopicEditForm';
import { renderWithTheme } from '../testUtils';

describe('TopicEditForm', () => {
  const baseProps = {
    name: 'Work',
    icon: null as string | null,
    accentColor: '#4281a4',
    onNameChange: vi.fn(),
    onIconChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders the name input with current value', () => {
    renderWithTheme(<TopicEditForm {...baseProps} />);
    expect(screen.getByDisplayValue('Work')).toBeInTheDocument();
  });

  it('renders save and cancel buttons', () => {
    renderWithTheme(<TopicEditForm {...baseProps} />);
    expect(screen.getByText('Save topic')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders custom save label', () => {
    renderWithTheme(<TopicEditForm {...baseProps} saveLabel="Create" />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('calls onNameChange when name input changes', () => {
    const onNameChange = vi.fn();
    renderWithTheme(<TopicEditForm {...baseProps} onNameChange={onNameChange} />);
    fireEvent.change(screen.getByDisplayValue('Work'), { target: { value: 'Personal' } });
    expect(onNameChange).toHaveBeenCalledWith('Personal');
  });

  it('calls onSave when save is clicked', () => {
    const onSave = vi.fn();
    renderWithTheme(<TopicEditForm {...baseProps} onSave={onSave} />);
    fireEvent.click(screen.getByText('Save topic'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    renderWithTheme(<TopicEditForm {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onSave when Enter is pressed in name input', () => {
    const onSave = vi.fn();
    renderWithTheme(<TopicEditForm {...baseProps} onSave={onSave} />);
    fireEvent.keyDown(screen.getByDisplayValue('Work'), { key: 'Enter' });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Escape is pressed in name input', () => {
    const onCancel = vi.fn();
    renderWithTheme(<TopicEditForm {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByDisplayValue('Work'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('disables save button when name is empty', () => {
    renderWithTheme(<TopicEditForm {...baseProps} name="" />);
    const saveBtn = screen.getByText('Save topic');
    expect(saveBtn).toBeDisabled();
  });

  it('disables save button when saving', () => {
    renderWithTheme(<TopicEditForm {...baseProps} saving />);
    expect(screen.getByText('Saving…')).toBeDisabled();
  });

  it('renders icon picker section', () => {
    renderWithTheme(<TopicEditForm {...baseProps} />);
    // The icon tile opens the picker
    fireEvent.click(screen.getByRole('button', { name: 'Choose an icon' }));
    expect(screen.getByTitle('No icon')).toBeInTheDocument();
  });
});
