import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/atoms/Modal';
import { renderWithTheme } from '../testUtils';

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = renderWithTheme(
      <Modal open={false} onClose={() => {}}>Content</Modal>
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders content when open is true', () => {
    renderWithTheme(
      <Modal open={true} onClose={() => {}}>Modal Content</Modal>
    );
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    renderWithTheme(
      <Modal open={true} onClose={() => {}} title="Confirm Delete">Body</Modal>
    );
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
  });

  it('does not render title header when title is not provided', () => {
    renderWithTheme(
      <Modal open={true} onClose={() => {}}>Body</Modal>
    );
    expect(screen.queryByText('×')).not.toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    renderWithTheme(
      <Modal open={true} onClose={() => {}} footer={<button>Save</button>}>Body</Modal>
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('does not render footer when not provided', () => {
    renderWithTheme(
      <Modal open={true} onClose={() => {}}>Body</Modal>
    );
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open={true} onClose={onClose} title="Test">Body</Modal>
    );
    // Modal portals to document.body; the overlay is the dialog's parent
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the dialog', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open={true} onClose={onClose} title="Test">Body</Modal>
    );
    fireEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when content area is clicked', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open={true} onClose={onClose} title="Test">Body</Modal>
    );
    fireEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open={true} onClose={onClose} title="Test">Body</Modal>
    );
    // Close button contains ×
    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('accepts different size props', () => {
    const sizes = ['sm', 'md', 'lg', 'xl'] as const;
    sizes.forEach((size) => {
      const { unmount } = renderWithTheme(
        <Modal open={true} onClose={() => {}} size={size}>Content</Modal>
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
      unmount();
    });
  });
});
